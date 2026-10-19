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

  // WAV (PCM) → { rate, channels, bits, pcm }
  async function parseWav(blob) {
    const buf = await blob.arrayBuffer(), v = new DataView(buf);
    const tag = o => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    if (buf.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Мост вернул не WAV');
    let o = 12, fmt = null, pcm = null;
    while (o + 8 <= buf.byteLength) {
      const id = tag(o), size = v.getUint32(o + 4, true), body = o + 8;
      if (id === 'fmt ') fmt = { channels: v.getUint16(body + 2, true), rate: v.getUint32(body + 4, true), bits: v.getUint16(body + 14, true) };
      else if (id === 'data') pcm = new Uint8Array(buf, body, Math.min(size, buf.byteLength - body));
      o = body + size + (size & 1);
    }
    if (!fmt || !pcm) throw new Error('Мост вернул повреждённый WAV');
    return Object.assign(fmt, { pcm });
  }

  // Реплики шота подряд, с паузой между ними. Все голоса Piper medium — 22050 Гц, 16 бит, моно.
  async function join(blobs, pause) {
    const parts = await Promise.all(blobs.map(parseWav));
    const { rate, channels, bits } = parts[0];
    if (parts.some(p => p.rate !== rate || p.channels !== channels || p.bits !== bits)) throw new Error('У голосов разный формат звука');
    const align = channels * bits / 8;
    const gap = Math.round(rate * (pause || 0)) * align;
    const size = parts.reduce((a, p) => a + p.pcm.length, 0) + gap * (parts.length - 1);
    const out = new Uint8Array(44 + size), v = new DataView(out.buffer);
    const put = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    put(0, 'RIFF'); v.setUint32(4, 36 + size, true); put(8, 'WAVE');
    put(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * align, true); v.setUint16(32, align, true); v.setUint16(34, bits, true);
    put(36, 'data'); v.setUint32(40, size, true);
    let o = 44;
    parts.forEach((p, i) => { out.set(p.pcm, o); o += p.pcm.length + (i < parts.length - 1 ? gap : 0); });
    return { blob: new Blob([out], { type: 'audio/wav' }), duration: Math.round(10 * size / (rate * align)) / 10 };
  }

  return { VOICES, DEFAULT, clean, status, speak, join };
})();
