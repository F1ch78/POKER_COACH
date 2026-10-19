# Мост студии. Раздаёт файлы студии на http://localhost:8787 и передаёт её запросы к ИИ-сервису.
# Браузер не пускает страницу к чужому API (CORS), а программа на компьютере — может, как Chatbox.
# Запуск: двойной щелчок по start-studio.bat. Окно не закрывать, пока работаете в студии.
param([int]$Port = 8787, [switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

$root = [IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
if (-not $root.EndsWith([IO.Path]::DirectorySeparatorChar)) { $root += [IO.Path]::DirectorySeparatorChar }
$origin = "http://localhost:$Port"
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'application/javascript; charset=utf-8'; '.json' = 'application/json; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.md' = 'text/markdown; charset=utf-8'; '.ico' = 'image/x-icon'
}
# Заголовки, которые студия передаёт сервису
$forward = @('Authorization', 'x-api-key', 'x-goog-api-key', 'anthropic-version', 'anthropic-beta')

function Send-Bytes($res, [int]$status, [string]$type, [byte[]]$bytes) {
  $res.StatusCode = $status
  if ($type) { $res.ContentType = $type }
  $res.Headers['Cache-Control'] = 'no-store'
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Send-Json($res, [int]$status, [string]$json) {
  Send-Bytes $res $status 'application/json; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes($json))
}

function Send-Error($res, [int]$status, [string]$message) {
  $msg = $message.Replace('\', '\\').Replace('"', '\"').Replace("`r", ' ').Replace("`n", ' ')
  Send-Json $res $status ('{"error":{"message":"' + $msg + '"}}')
}

function Read-Body($stream) {
  $ms = New-Object IO.MemoryStream
  $stream.CopyTo($ms)
  return ,$ms.ToArray()
}

# Запрос к сервису: https на любой адрес, http только на этот компьютер (локальные модели).
function Invoke-Proxy($req, $res) {
  $target = $req.Headers['X-Studio-Target']
  if (-not $target -or -not ($target -match '^https://' -or $target -match '^http://(localhost|127\.0\.0\.1)(:\d+)?/')) {
    return Send-Error $res 400 'Мост: неверный адрес сервиса.'
  }
  $up = [Net.HttpWebRequest]::Create($target)
  $up.Method = $req.HttpMethod
  $up.Timeout = 600000
  $up.ReadWriteTimeout = 600000
  $up.Accept = '*/*'
  foreach ($h in $forward) { $v = $req.Headers[$h]; if ($v) { $up.Headers[$h] = $v } }
  if ($req.HasEntityBody) {
    $body = Read-Body $req.InputStream
    $up.ContentType = $(if ($req.ContentType) { $req.ContentType } else { 'application/json' })
    $up.ContentLength = $body.Length
    $s = $up.GetRequestStream(); $s.Write($body, 0, $body.Length); $s.Close()
  }
  $started = Get-Date
  try {
    $ur = $up.GetResponse()
  } catch {
    $ex = $_.Exception
    while ($ex -and -not ($ex -is [Net.WebException])) { $ex = $ex.InnerException }
    if ($ex -and $ex.Response) { $ur = $ex.Response }
    else {
      $why = $(if ($ex) { $ex.Message } else { $_.Exception.Message })
      Write-Host ("  ✗ нет связи с {0}: {1}" -f $target, $why) -ForegroundColor Red
      return Send-Error $res 502 ("Мост не смог связаться с сервисом: " + $why)
    }
  }
  try {
    $data = Read-Body $ur.GetResponseStream()
    $code = [int]$ur.StatusCode
    $color = $(if ($code -lt 400) { 'Green' } else { 'Yellow' })
    Write-Host ("  {0} {1} → {2} за {3:N1} с" -f $req.HttpMethod, $target, $code, ((Get-Date) - $started).TotalSeconds) -ForegroundColor $color
    Send-Bytes $res $code $ur.ContentType $data
  } finally { $ur.Close() }
}

function Send-File($req, $res) {
  $rel = [Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart('/'))
  if ($rel -eq '') { $rel = 'index.html' }
  $full = [IO.Path]::GetFullPath((Join-Path $root $rel))
  if (-not $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { return Send-Error $res 403 'forbidden' }
  if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { return Send-Error $res 404 'not found' }
  $type = $types[[IO.Path]::GetExtension($full).ToLower()]
  if (-not $type) { $type = 'application/octet-stream' }
  Send-Bytes $res 200 $type ([IO.File]::ReadAllBytes($full))
}

# Папка «Загрузки»: студия подхватывает скачанные с сайтов видео и картинки (для сервисов без API).
$downloads = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads'
$mediaTypes = @{ '.mp4' = 'video/mp4'; '.webm' = 'video/webm'; '.mov' = 'video/quicktime'; '.m4v' = 'video/mp4'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp' }

function Send-Downloads($req, $res) {
  $since = 0.0
  [void][double]::TryParse([string]$req.QueryString['since'], [ref]$since)
  $files = @()
  if (Test-Path -LiteralPath $downloads) {
    foreach ($f in Get-ChildItem -LiteralPath $downloads -File) {
      if (-not $mediaTypes.ContainsKey($f.Extension.ToLower())) { continue }
      $ms = ([DateTimeOffset]$f.LastWriteTimeUtc).ToUnixTimeMilliseconds()
      if ($ms -le $since) { continue }
      $files += '{"name":' + (ConvertTo-Json $f.Name) + ',"size":' + $f.Length + ',"mtime":' + $ms + '}'
    }
  }
  Send-Json $res 200 ('{"dir":' + (ConvertTo-Json $downloads) + ',"files":[' + ($files -join ',') + ']}')
}

function Send-Download($req, $res) {
  $name = [string]$req.QueryString['name']
  if (-not $name -or $name -match '[\\/]' -or $name.Contains('..')) { return Send-Error $res 400 'bad name' }
  $full = Join-Path $downloads $name
  $type = $mediaTypes[[IO.Path]::GetExtension($name).ToLower()]
  if (-not $type -or -not (Test-Path -LiteralPath $full -PathType Leaf)) { return Send-Error $res 404 'not found' }
  Send-Bytes $res 200 $type ([IO.File]::ReadAllBytes($full))
}

function Invoke-Request($ctx) {
  $req = $ctx.Request; $res = $ctx.Response
  $path = $req.Url.AbsolutePath
  if ($path -eq '/__studio') { return Send-Json $res 200 '{"bridge":true,"version":2,"downloads":true}' }
  if ($path -eq '/__downloads' -or $path -eq '/__download') {
    $from = $req.Headers['Origin']
    if ($from -and $from -ne $origin -and $from -ne "http://127.0.0.1:$Port") { return Send-Error $res 403 'forbidden' }
    if ($path -eq '/__downloads') { return Send-Downloads $req $res } else { return Send-Download $req $res }
  }
  if ($path -eq '/proxy') {
    # Чужие сайты в браузере не должны пользоваться мостом.
    $from = $req.Headers['Origin']
    if ($from -and $from -ne $origin -and $from -ne "http://127.0.0.1:$Port") { return Send-Error $res 403 'Мост принимает запросы только от студии.' }
    return Invoke-Proxy $req $res
  }
  if ($req.HttpMethod -ne 'GET' -and $req.HttpMethod -ne 'HEAD') { return Send-Error $res 405 'method not allowed' }
  Send-File $req $res
}

$listener = New-Object Net.HttpListener
$listener.Prefixes.Add("$origin/")
try { $listener.Start() } catch {
  # Студия уже запущена в другом окне — просто открываем её.
  try { $null = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "$origin/__studio"; if (-not $NoBrowser) { Start-Process "$origin/" }; exit 0 } catch {}
  Write-Host "Не удалось занять порт $Port`: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Закройте программу, которая его заняла, или запустите start-studio.bat от имени администратора.'
  exit 1
}

Write-Host ''
Write-Host "  Студия запущена: $origin/" -ForegroundColor Green
Write-Host '  Не закрывайте это окно, пока работаете. Запросы к ИИ будут видны здесь.'
Write-Host ''
if (-not $NoBrowser) { Start-Process "$origin/" }

while ($listener.IsListening) {
  $pending = $listener.GetContextAsync()
  while (-not $pending.AsyncWaitHandle.WaitOne(500)) {}   # ожидание по частям, чтобы работал Ctrl+C
  $ctx = $pending.Result
  try { Invoke-Request $ctx }
  catch {
    Write-Host ("  Ошибка: " + $_.Exception.Message) -ForegroundColor Red
    try { Send-Error $ctx.Response 500 $_.Exception.Message } catch {}
  }
  finally { try { $ctx.Response.Close() } catch {} }
}
