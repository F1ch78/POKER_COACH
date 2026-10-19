'use strict';
// Озвучка реплик: русские голоса Piper. Синтез делает мост (server.ps1) через piper.exe,
// браузер только склеивает WAV-файлы реплик шота в один звук.

const Voice = (() => {
  const VOICES = [
    { id: 'ru_RU-dmitri-medium', label: 'Дмитрий — мужской' },
    { id: 'ru_RU-denis-medium', label: 'Денис — мужской' },
    { id: 'ru_RU-ruslan-medium', label: 'Руслан — мужской' },
    { id: 'ru_RU-irina-medium', label: 'Ирина — женский' },
  ];
  const DEFAULT = VOICES[0].id;

  // Ремарки «(тихо)» и пометки ударений не читаем.
  const clean = line => String(line || '').replace(/\([^)]*\)/g, ' ').replace(/[́+]/g, '').replace(/\s+/g, ' ').trim();

  // null — мост не запущен; { old: true } — мост без озвучки; иначе { piper, voices: [...] }.
  async function status() {
    if (!(await AI.bridge())) return null;
    try {
      const r = await fetch('/__tts', { cache: 'no-store' });
      if (r.status === 404) return { old: true };
      return r.ok ? await r.json() : { old: true };
    } catch (e) { return null; }
  }

  async function speak(text, voice, speed) {
    const r = await fetch('/__tts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: voice || DEFAULT, speed: +speed || 1 }) });
    if (!r.ok) {
      let msg = 'ошибка ' + r.status;
      try { msg = (await r.json()).error.message; } catch (e) {}
      throw new Error(r.status === 404 ? 'Мост устарел: закройте окно моста и снова запустите start-studio.bat' : msg);
    }
    return r.blob();
  }

  // WAV (PCM 16 бит) → моно-сэмплы и частота.
  async function parseWav(blob) {
    const buf = await blob.arrayBuffer(), v = new DataView(buf);
    const tag = o => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    if (buf.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Мост вернул не WAV');
    let o = 12, fmt = null, data = null;
    while (o + 8 <= buf.byteLength) {
      const id = tag(o), size = v.getUint32(o + 4, true), body = o + 8;
      if (id === 'fmt ') fmt = { channels: v.getUint16(body + 2, true), rate: v.getUint32(body + 4, true), bits: v.getUint16(body + 14, true) };
      else if (id === 'data') data = [body, Math.min(size, buf.byteLength - body)];
      o = body + size + (size & 1);
    }
    if (!fmt || !data || fmt.bits !== 16) throw new Error('Мост вернул WAV в неизвестном формате');
    const n = Math.floor(data[1] / 2 / fmt.channels), mono = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let c = 0; c < fmt.channels; c++) sum += v.getInt16(data[0] + 2 * (i * fmt.channels + c), true);
      mono[i] = sum / fmt.channels;
    }
    return { rate: fmt.rate, samples: mono };
  }

  // Голоса бывают с разной частотой (свои модели — 16 или 22 кГц), поэтому всё приводим к частоте первой реплики.
  function resample(samples, from, to) {
    if (from === to) return samples;
    const n = Math.round(samples.length * to / from), out = new Float32Array(n), k = from / to;
    for (let i = 0; i < n; i++) {
      const x = i * k, j = Math.floor(x), f = x - j;
      out[i] = (samples[j] || 0) * (1 - f) + (samples[j + 1] ?? samples[j] ?? 0) * f;
    }
    return out;
  }

  // Реплики шота подряд, с паузой между ними → один WAV (моно, 16 бит).
  async function join(blobs, pause) {
    const parts = await Promise.all(blobs.map(parseWav));
    const rate = parts[0].rate;
    const chunks = parts.map(p => resample(p.samples, p.rate, rate));
    const gap = Math.round(rate * (pause || 0));
    const n = chunks.reduce((a, c) => a + c.length, 0) + gap * (chunks.length - 1);
    const out = new Uint8Array(44 + 2 * n), v = new DataView(out.buffer);
    const put = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    put(0, 'RIFF'); v.setUint32(4, 36 + 2 * n, true); put(8, 'WAVE');
    put(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    put(36, 'data'); v.setUint32(40, 2 * n, true);
    let o = 44;
    chunks.forEach((c, i) => {
      for (let j = 0; j < c.length; j++, o += 2) v.setInt16(o, Math.max(-32768, Math.min(32767, Math.round(c[j]))), true);
      if (i < chunks.length - 1) o += 2 * gap;
    });
    return { blob: new Blob([out], { type: 'audio/wav' }), duration: Math.round(10 * n / rate) / 10 };
  }

  // Свой голос Piper: пара файлов name.onnx и name.onnx.json (например, из каталога голосов Piper или своя обученная модель).
  // Имя файла голоса в папке моста — латиницей: «Мой голос» → Moj_golos.
  const LAT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'j', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's',
    т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  const translit = s => [...s].map(c => { const l = LAT[c.toLowerCase()]; return l == null ? c : c === c.toLowerCase() ? l : l.charAt(0).toUpperCase() + l.slice(1); }).join('');
  const safe = n => translit(n.replace(/\.onnx(\.json)?$/i, '')).replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^[._]+/, '').slice(0, 80);
  async function upload(files) {
    const onnx = files.find(f => /\.onnx$/i.test(f.name)), json = files.find(f => /\.onnx\.json$/i.test(f.name) || /\.json$/i.test(f.name));
    if (!onnx || !json) throw new Error('Нужны два файла голоса: модель .onnx и её настройки .onnx.json');
    const name = safe(onnx.name);
    if (!name) throw new Error('Неподходящее имя файла: ' + onnx.name);
    let conf;
    try { conf = JSON.parse(await json.text()); } catch (e) { throw new Error(json.name + ': это не файл настроек голоса'); }
    if (!conf.audio || !conf.audio.sample_rate) throw new Error(json.name + ': в настройках нет audio.sample_rate — это не голос Piper');
    for (const [part, file] of [['json', json], ['onnx', onnx]]) {
      const r = await fetch('/__tts/voice', { method: 'POST', headers: { 'X-Voice-Name': name, 'X-Voice-Part': part, 'Content-Type': 'application/octet-stream' }, body: file });
      if (!r.ok) {
        let msg = 'ошибка ' + r.status;
        try { msg = (await r.json()).error.message; } catch (e) {}
        throw new Error(r.status === 404 ? 'Мост устарел: закройте окно моста и снова запустите start-studio.bat' : msg);
      }
    }
    return { name, speakers: conf.num_speakers || 1, lang: (conf.espeak && conf.espeak.voice) || '' };
  }
  async function remove(name) {
    const r = await fetch('/__tts/voice?name=' + encodeURIComponent(name), { method: 'DELETE' });
    if (!r.ok) throw new Error('Не удалось удалить голос');
  }
  const builtIn = id => VOICES.some(v => v.id === id);
  // Встроенные голоса и свои, которые лежат в папке tts\voices.
  const list = st => VOICES.concat(((st && st.voices) || []).filter(id => !builtIn(id)).map(id => ({ id, label: id + ' — свой', own: true })));

  return { VOICES, DEFAULT, clean, status, speak, join, upload, remove, list, builtIn };
})();
