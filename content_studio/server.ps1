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

# Озвучка: Piper (piper.exe) и голоса качаются при первом использовании в папку tts рядом со студией.
$ttsDir = Join-Path $root 'tts'
$voiceDir = Join-Path $ttsDir 'voices'
$piperExe = Join-Path $ttsDir 'piper\piper.exe'
$piperZip = 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip'
$voiceHosts = @('https://huggingface.co', 'https://hf-mirror.com')

function Save-Url([string]$url, [string]$file) {
  Write-Host "  ↓ $url" -ForegroundColor Cyan
  $part = $file + '.part'
  (New-Object Net.WebClient).DownloadFile($url, $part)
  Move-Item -LiteralPath $part -Destination $file -Force
}

function Install-Piper {
  if (Test-Path -LiteralPath $piperExe) { return }
  Write-Host '  Озвучка: скачиваю Piper (один раз)…' -ForegroundColor Cyan
  $null = New-Item -ItemType Directory -Force -Path $ttsDir
  $zip = Join-Path $ttsDir 'piper.zip'
  try { Save-Url $piperZip $zip } catch { throw "Не удалось скачать Piper с github.com: $($_.Exception.GetBaseException().Message)" }
  Expand-Archive -LiteralPath $zip -DestinationPath $ttsDir -Force
  Remove-Item -LiteralPath $zip -Force
  if (-not (Test-Path -LiteralPath $piperExe)) { throw 'В архиве Piper нет piper.exe' }
}

# ru_RU-irina-medium → voices\ru_RU-irina-medium.onnx (+ .onnx.json). Свои голоса уже лежат в папке, их не качаем.
function Install-Voice([string]$name) {
  if (-not (Test-VoiceName $name)) { throw "Неподходящее имя голоса: $name" }
  $model = Join-Path $voiceDir "$name.onnx"
  if ((Test-Path -LiteralPath $model) -and (Test-Path -LiteralPath "$model.json")) { return $model }
  if ($name -notmatch '^(([a-z]{2})_[A-Z]{2})-([a-z0-9_]+)-(x_low|low|medium|high)$') { throw "Голоса $name нет в папке tts\voices. Загрузите его заново во вкладке «Озвучка»." }
  Write-Host "  Озвучка: скачиваю голос $name (один раз)…" -ForegroundColor Cyan
  $null = New-Item -ItemType Directory -Force -Path $voiceDir
  $rel = "/rhasspy/piper-voices/resolve/v1.0.0/$($Matches[2])/$($Matches[1])/$($Matches[3])/$($Matches[4])/$name.onnx"
  $why = ''
  foreach ($h in $voiceHosts) {
    try { Save-Url "$h$rel.json" "$model.json"; Save-Url "$h$rel" $model; return $model }
    catch { $why = $_.Exception.GetBaseException().Message; Write-Host "  ✗ $h`: $why" -ForegroundColor Yellow }
  }
  Remove-Item -LiteralPath "$model.json" -Force -ErrorAction SilentlyContinue
  throw "Не удалось скачать голос $name`: $why"
}

function Test-VoiceName([string]$name) { return ($name -match '^[A-Za-z0-9_][A-Za-z0-9_.-]{0,79}$') -and -not $name.Contains('..') }

# Свой голос: студия присылает .onnx.json и .onnx по очереди (заголовки X-Voice-Name и X-Voice-Part).
function Save-Voice($req, $res) {
  $name = [string]$req.Headers['X-Voice-Name']; $part = [string]$req.Headers['X-Voice-Part']
  if (-not (Test-VoiceName $name) -or ($part -ne 'json' -and $part -ne 'onnx')) { return Send-Error $res 400 'Неподходящее имя файла голоса' }
  $null = New-Item -ItemType Directory -Force -Path $voiceDir
  $file = Join-Path $voiceDir ("$name.onnx" + $(if ($part -eq 'json') { '.json' } else { '' }))
  $tmp = $file + '.part'
  $out = [IO.File]::Create($tmp)
  try { $req.InputStream.CopyTo($out) } finally { $out.Close() }
  Move-Item -LiteralPath $tmp -Destination $file -Force
  Write-Host ("  Озвучка: загружен свой голос {0} ({1:N1} МБ)" -f [IO.Path]::GetFileName($file), ((Get-Item -LiteralPath $file).Length / 1MB)) -ForegroundColor Green
  Send-Json $res 200 '{"ok":true}'
}

function Remove-Voice($req, $res) {
  $name = [string]$req.QueryString['name']
  if (-not (Test-VoiceName $name)) { return Send-Error $res 400 'Неподходящее имя голоса' }
  foreach ($f in @("$name.onnx", "$name.onnx.json")) { Remove-Item -LiteralPath (Join-Path $voiceDir $f) -Force -ErrorAction SilentlyContinue }
  Write-Host "  Озвучка: удалён голос $name" -ForegroundColor Yellow
  Send-Json $res 200 '{"ok":true}'
}

function Send-TtsStatus($res) {
  $voices = @()
  if (Test-Path -LiteralPath $voiceDir) { $voices = @(Get-ChildItem -LiteralPath $voiceDir -Filter '*.onnx' | Where-Object { Test-Path -LiteralPath ($_.FullName + '.json') } | ForEach-Object { ConvertTo-Json $_.BaseName }) }
  $piper = $(if (Test-Path -LiteralPath $piperExe) { 'true' } else { 'false' })
  Send-Json $res 200 ('{"piper":' + $piper + ',"voices":[' + ($voices -join ',') + ']}')
}

# POST {text, voice, speed} → WAV
function Send-Speech($req, $res) {
  $q = [Text.Encoding]::UTF8.GetString((Read-Body $req.InputStream)) | ConvertFrom-Json
  $text = ([string]$q.text -replace '\s+', ' ').Trim()
  if (-not $text) { return Send-Error $res 400 'Пустой текст' }
  $speed = [double]$q.speed
  if ($speed -lt 0.5 -or $speed -gt 2) { $speed = 1 }
  Install-Piper
  $model = Install-Voice ([string]$q.voice)
  $out = Join-Path ([IO.Path]::GetTempPath()) ("studio-tts-" + [Guid]::NewGuid().ToString('N') + '.wav')
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = $piperExe
  $psi.WorkingDirectory = Split-Path -Parent $piperExe
  $psi.Arguments = '--model "{0}" --output_file "{1}" --length_scale {2}' -f $model, $out, (1 / $speed).ToString('0.###', [Globalization.CultureInfo]::InvariantCulture)
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardError = $true
  $started = Get-Date
  $p = [Diagnostics.Process]::Start($psi)
  # Текст пишем байтами UTF-8: кодировка консоли Windows испортила бы кириллицу.
  $bytes = [Text.Encoding]::UTF8.GetBytes($text + "`n")
  $p.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
  $p.StandardInput.BaseStream.Close()
  $log = $p.StandardError.ReadToEnd()
  $p.WaitForExit()
  try {
    if ($p.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $out)) {
      $last = ($log -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 1)
      throw "Piper завершился с ошибкой $($p.ExitCode): $last"
    }
    Write-Host ("  озвучка {0}: «{1}» за {2:N1} с" -f $q.voice, $(if ($text.Length -gt 50) { $text.Substring(0, 50) + '…' } else { $text }), ((Get-Date) - $started).TotalSeconds) -ForegroundColor Green
    Send-Bytes $res 200 'audio/wav' ([IO.File]::ReadAllBytes($out))
  } finally { Remove-Item -LiteralPath $out -Force -ErrorAction SilentlyContinue }
}

function Invoke-Request($ctx) {
  $req = $ctx.Request; $res = $ctx.Response
  $path = $req.Url.AbsolutePath
  if ($path -eq '/__studio') { return Send-Json $res 200 '{"bridge":true,"version":4,"downloads":true,"tts":true,"voices":true}' }
  if ($path -eq '/__tts' -or $path -eq '/__tts/voice') {
    $from = $req.Headers['Origin']
    if ($from -and $from -ne $origin -and $from -ne "http://127.0.0.1:$Port") { return Send-Error $res 403 'forbidden' }
    if ($path -eq '/__tts/voice') {
      if ($req.HttpMethod -eq 'POST') { return Save-Voice $req $res }
      if ($req.HttpMethod -eq 'DELETE') { return Remove-Voice $req $res }
      return Send-Error $res 405 'method not allowed'
    }
    if ($req.HttpMethod -eq 'POST') { return Send-Speech $req $res } else { return Send-TtsStatus $res }
  }
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
