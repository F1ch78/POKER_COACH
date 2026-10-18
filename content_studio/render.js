'use strict';
// Монтаж: линейка из шотов, предпросмотр на canvas и запись итогового видео через MediaRecorder.
// Шот без картинки рисуется как карточка аниматика, поэтому смотреть фильм можно сразу после импорта сценария.

class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.items = []; this.subs = []; this.audio = [];
    this.media = new Map();          // assetId → { kind, el, url }
    this.opts = { letterbox: true, subs: true, labels: true, fade: true, videoAudio: true, musicVol: 0.4 };
    this.playing = false; this.t = 0; this.duration = 0;
    this.onTime = () => {}; this.onEnd = () => {};
    this.actx = null; this.dest = null; this.sources = new WeakMap();
    this.current = null;
  }

  setSize(w, h) { this.canvas.width = w; this.canvas.height = h; this.draw(this.t); }

  // ---------------------------------------------------------------- линейка
  async load(project, scenes) {
    this.stop();
    const items = [], subs = [], audio = [];
    let t = 0;
    for (const sc of scenes) {
      const sceneStart = t;
      sc.shots.forEach((sh, i) => {
        const dur = Math.max(0.5, +sh.dur || 3);
        items.push({ scene: sc, shot: sh, start: t, dur, first: i === 0, index: items.length });
        const lines = sh.dialogue.filter(d => d.line);
        const total = lines.reduce((a, d) => a + d.line.length, 0) || 1;
        let s = t;
        for (const d of lines) {
          const len = dur * d.line.length / total;
          subs.push({ start: s, end: s + len, text: d.line.replace(/^\([^)]*\)\s*/, ''), vo: d.vo });
          s += len;
        }
        if (sh.assets.audio) audio.push({ id: sh.assets.audio, start: t });
        t += dur;
      });
      if (sc.narration && sc.narration.length) {
        const sentences = sc.narration.join(' ').match(/[^.!?…]+[.!?…]+|\S[^.!?…]*$/g) || [];
        const total = sentences.reduce((a, x) => a + x.length, 0) || 1;
        let s = sceneStart;
        for (const x of sentences) { const len = (t - sceneStart) * x.length / total; subs.push({ start: s, end: s + len, text: x.trim(), vo: true }); s += len; }
      }
      if (sc.assets && sc.assets.audio) audio.push({ id: sc.assets.audio, start: sceneStart });
    }
    if (project.music) audio.push({ id: project.music, start: 0, music: true });
    this.items = items; this.subs = subs; this.audio = audio; this.duration = t;
    this.title = project.name;

    const ids = new Set();
    items.forEach(it => { if (it.shot.assets.video) ids.add(it.shot.assets.video); else if (it.shot.assets.image) ids.add(it.shot.assets.image); });
    audio.forEach(a => ids.add(a.id));
    await Promise.all([...ids].map(id => this.loadAsset(id, project.assets[id])));
    this.t = Math.min(this.t, t);
    this.draw(this.t);
  }

  async loadAsset(id, meta) {
    if (this.media.has(id) || !meta) return;
    const blob = await DB.getBlob(id);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const kind = meta.type.split('/')[0];
    let el;
    if (kind === 'image') {
      el = new Image(); el.src = url;
      await el.decode().catch(() => {});
    } else {
      el = document.createElement(kind === 'video' ? 'video' : 'audio');
      el.src = url; el.preload = 'auto'; el.playsInline = true; el.crossOrigin = 'anonymous';
      await new Promise(res => { el.onloadeddata = res; el.onerror = res; setTimeout(res, 8000); });
    }
    this.media.set(id, { kind, el, url });
  }

  // ---------------------------------------------------------------- звук
  ensureAudio() {
    if (this.actx) return;
    this.actx = new (window.AudioContext || window.webkitAudioContext)();
    this.dest = this.actx.createMediaStreamDestination();
    // Без постоянного входа звуковая дорожка не отдаёт сэмплов, и MediaRecorder перестаёт писать кадры.
    const silence = this.actx.createConstantSource();
    silence.offset.value = 0;
    silence.connect(this.dest);
    silence.start();
  }
  route(el, vol) {
    if (!this.actx) return;
    let node = this.sources.get(el);
    if (!node) {
      const src = this.actx.createMediaElementSource(el);
      const gain = this.actx.createGain();
      src.connect(gain); gain.connect(this.actx.destination); gain.connect(this.dest);
      node = { gain }; this.sources.set(el, node);
    }
    node.gain.gain.value = vol;
  }

  itemAt(t) {
    const its = this.items;
    let lo = 0, hi = its.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (its[mid].start <= t) lo = mid; else hi = mid - 1; }
    return its[lo] || null;
  }

  // Запускает/останавливает видео и звуки, чтобы они совпадали с позицией t.
  syncMedia(t) {
    const it = this.itemAt(t);
    if (it !== this.current) {
      const prev = this.current && this.mediaOf(this.current);
      if (prev && prev.kind === 'video') prev.el.pause();
      this.current = it;
      const m = it && this.mediaOf(it);
      if (m && m.kind === 'video') {
        m.el.currentTime = Math.min(Math.max(0, t - it.start), (m.el.duration || 1e9) - 0.05);
        m.el.muted = !this.opts.videoAudio;
        this.route(m.el, 1);
        if (this.playing) m.el.play().catch(() => {});
      }
      const next = this.items[it ? it.index + 1 : 0];
      const nm = next && this.mediaOf(next);
      if (nm && nm.kind === 'video' && nm !== m) { nm.el.pause(); nm.el.currentTime = 0; }
    }
    for (const a of this.audio) {
      const m = this.media.get(a.id);
      if (!m) continue;
      const d = m.el.duration || 0, inside = t >= a.start && t < a.start + d;
      if (inside && this.playing) {
        if (m.el.paused && !(m.el.ended && t > a.start + d - 0.5)) { m.el.currentTime = t - a.start; this.route(m.el, a.music ? this.opts.musicVol : 1); m.el.play().catch(() => {}); }
      } else if (!m.el.paused) m.el.pause();
    }
  }

  mediaOf(it) {
    const id = it.shot.assets.video || it.shot.assets.image;
    return id ? this.media.get(id) : null;
  }

  pauseAll() {
    for (const m of this.media.values()) if (m.el.pause) m.el.pause();
    this.current = null;
  }

  // ---------------------------------------------------------------- рисование
  draw(t) {
    const { g, canvas: c } = this, W = c.width, H = c.height;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const it = this.itemAt(t);
    if (!it) { this.card(null, 0, 0, W, H, 0); return; }
    let bx = 0, by = 0, bw = W, bh = H;
    if (this.opts.letterbox && W / H < 2.3) { bh = Math.round(W / 2.39); by = Math.round((H - bh) / 2); }
    const p = Math.min(1, Math.max(0, (t - it.start) / it.dur));
    const m = this.mediaOf(it);
    g.save(); g.beginPath(); g.rect(bx, by, bw, bh); g.clip();
    if (it.shot.kind === 'ЧЁРНЫЙ') { /* пустой чёрный кадр */ }
    else if (it.shot.kind === 'ТИТР') this.titleCard(it.shot.title || it.shot.text, bx, by, bw, bh, p);
    else if (m && m.kind === 'video') this.cover(m.el, m.el.videoWidth, m.el.videoHeight, bx, by, bw, bh, 1, 0, 0);
    else if (m && m.kind === 'image') {
      // лёгкий «Кен Бёрнс»: чётные шоты наезжают, нечётные отъезжают
      const z = it.index % 2 ? 1.1 - 0.07 * p : 1.03 + 0.07 * p;
      const dx = (it.index % 3 - 1) * 0.02 * (p - 0.5);
      this.cover(m.el, m.el.naturalWidth, m.el.naturalHeight, bx, by, bw, bh, z, dx, 0);
    } else this.card(it, bx, by, bw, bh, p);
    g.restore();

    if (this.opts.fade && it.first) {
      const a = 1 - Math.min(1, (t - it.start) / 0.35);
      if (a > 0) { g.fillStyle = `rgba(0,0,0,${a})`; g.fillRect(0, 0, W, H); }
    }
    if (this.recording ? this.opts.labels : this.opts.preview !== false) {
      g.font = `${Math.round(H * 0.022)}px system-ui, sans-serif`; g.textBaseline = 'top'; g.textAlign = 'left';
      g.fillStyle = 'rgba(214,169,60,.85)';
      g.fillText(`${Prompts.code(it.scene, it.shot)} · ${it.shot.kind} · ${fmtTime(t)}`, Math.round(W * 0.02), Math.round(by + H * 0.02));
    }
    if (this.opts.subs) {
      const s = this.subs.find(x => t >= x.start && t < x.end);
      if (s) this.subtitle(s, W, H, by + bh);
    }
  }

  cover(img, iw, ih, x, y, w, h, zoom, dx, dy) {
    if (!iw || !ih) return;
    const k = Math.max(w / iw, h / ih) * zoom;
    const dw = iw * k, dh = ih * k;
    this.g.drawImage(img, x + (w - dw) / 2 + dx * w, y + (h - dh) / 2 + dy * h, dw, dh);
  }

  // Карточка аниматика: чёрное солнце, тип кадра и текст шота.
  card(it, x, y, w, h, p) {
    const g = this.g;
    const grd = g.createLinearGradient(0, y, 0, y + h);
    grd.addColorStop(0, '#15151c'); grd.addColorStop(1, '#0b0b10');
    g.fillStyle = grd; g.fillRect(x, y, w, h);
    const r = h * 0.13, cx = x + w * 0.8, cy = y + h * 0.3;
    g.save();
    g.shadowColor = 'rgba(220,235,255,.6)'; g.shadowBlur = r * 0.35;
    g.strokeStyle = 'rgba(230,240,255,.85)'; g.lineWidth = Math.max(1.5, r * 0.035);
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.restore();
    g.fillStyle = '#050507'; g.beginPath(); g.arc(cx, cy, r * 0.985, 0, Math.PI * 2); g.fill();
    if (!it) {
      g.fillStyle = '#8a8f99'; g.font = `${Math.round(h * 0.05)}px system-ui, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText('Импортируйте сценарий', x + w * 0.07, y + h * 0.5);
      return;
    }
    const pad = w * 0.07;
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillStyle = '#d6a93c'; g.font = `600 ${Math.round(h * 0.06)}px system-ui, sans-serif`;
    g.fillText(it.shot.kind, x + pad, y + h * 0.14);
    g.fillStyle = '#7f8792'; g.font = `${Math.round(h * 0.035)}px system-ui, sans-serif`;
    g.fillText(`Сцена ${it.scene.num}. ${it.scene.heading}`.slice(0, 80), x + pad, y + h * 0.24);
    g.fillStyle = '#d9dde3'; g.font = `${Math.round(h * 0.045)}px Georgia, serif`;
    const text = it.shot.text || it.shot.dialogue.map(d => d.who + ': ' + d.line).join(' ');
    wrap(g, text, x + pad, y + h * 0.36, w * 0.62, h * 0.062, 6);
    g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(x, y + h - 4, w * p, 4);
  }

  titleCard(text, x, y, w, h, p) {
    const g = this.g;
    g.fillStyle = '#000'; g.fillRect(x, y, w, h);
    g.globalAlpha = Math.min(1, p * 3) * Math.min(1, (1 - p) * 4 + 0.2);
    g.fillStyle = '#d6a93c'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const t = (text || '').toUpperCase();
    let size = Math.round(h * 0.11);
    g.font = `600 ${size}px Georgia, serif`;
    const tw = g.measureText(t).width;
    if (tw > w * 0.86) { size = Math.floor(size * w * 0.86 / tw); g.font = `600 ${size}px Georgia, serif`; }
    g.fillText(t, x + w / 2, y + h / 2);
    g.globalAlpha = 1;
  }

  subtitle(s, W, H, bottom) {
    const g = this.g, size = Math.round(H * 0.043);
    g.font = `${s.vo ? 'italic ' : ''}${size}px system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const lines = lineBreak(g, s.text, W * 0.8);
    const base = Math.min(H - size * 0.8, bottom + (H - bottom > size * 2.4 ? size * 1.6 : -size * 0.6)) - (lines.length - 1) * size * 1.2;
    lines.forEach((l, i) => {
      g.lineWidth = Math.max(3, size * 0.14); g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineJoin = 'round';
      g.strokeText(l, W / 2, base + i * size * 1.2);
      g.fillStyle = s.vo ? '#e6e0cf' : '#ffffff';
      g.fillText(l, W / 2, base + i * size * 1.2);
    });
  }

  // ---------------------------------------------------------------- воспроизведение
  play(from = this.t, until = this.duration) {
    this.ensureAudio();
    if (this.actx.state === 'suspended') this.actx.resume();
    this.pauseAll();
    this.playing = true; this.until = until;
    this.t0 = performance.now(); this.from = from; this.t = from;
    const tick = () => {
      if (!this.playing) return;
      this.t = this.from + (performance.now() - this.t0) / 1000;
      if (this.t >= this.until) { this.t = this.until; this.draw(this.t - 0.001); this.stop(); this.onEnd(); return; }
      this.syncMedia(this.t);
      this.draw(this.t);
      this.onTime(this.t);
      this.raf = requestAnimationFrame(tick);
    };
    this.syncMedia(from);
    tick();
  }
  stop() { this.playing = false; cancelAnimationFrame(this.raf); this.pauseAll(); }
  seek(t) {
    const was = this.playing;
    this.stop();
    this.t = Math.max(0, Math.min(t, this.duration));
    const it = this.itemAt(this.t), m = it && this.mediaOf(it);
    if (m && m.kind === 'video') m.el.currentTime = Math.max(0, this.t - it.start);
    this.draw(this.t);
    this.onTime(this.t);
    if (was) this.play(this.t);
  }

  static mimeType() {
    // MP4 берём только с H.264: «video/mp4» с VP9 внутри у Chrome бывает обрезанным, тогда надёжнее WebM.
    const list = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    return list.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
  }

  // Запись идёт в реальном времени: вкладка должна оставаться открытой и на переднем плане.
  async record(from, until, fps, onProgress) {
    this.ensureAudio();
    const mime = Engine.mimeType();
    if (!mime) throw new Error('Браузер не умеет записывать видео (нужен Chrome, Edge или Firefox).');
    const stream = this.canvas.captureStream(fps);
    // Дорожка из «спящего» AudioContext тоже не отдаёт данных — тогда пишем без звука.
    await Promise.race([this.actx.resume(), new Promise(r => setTimeout(r, 1000))]);
    if (this.actx.state === 'running') this.dest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
    const bitrate = this.canvas.width * this.canvas.height >= 1920 * 1080 ? 12e6 : 6e6;
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate, audioBitsPerSecond: 192000 });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    return new Promise((res, rej) => {
      rec.onstop = () => {
        stream.getVideoTracks().forEach(tr => tr.stop());
        res(new Blob(chunks, { type: mime.split(';')[0] }));
      };
      rec.onerror = e => rej(e.error || new Error('Ошибка записи'));
      const prevEnd = this.onEnd, prevTime = this.onTime;
      this.onTime = t => { prevTime(t); onProgress((t - from) / (until - from)); };
      this.onEnd = () => { this.onEnd = prevEnd; this.onTime = prevTime; setTimeout(() => rec.stop(), 250); };
      this.cancelRecord = () => { this.stop(); this.onEnd(); };
      this.recording = true;
      rec.addEventListener('stop', () => { this.recording = false; });
      this.draw(from);
      rec.start(1000);
      setTimeout(() => this.play(from, until), 150);
    });
  }
}

function fmtTime(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return String(m).padStart(2, '0') + ':' + s.toFixed(1).padStart(4, '0');
}

function lineBreak(g, text, maxW) {
  const words = String(text || '').split(/\s+/), lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

function wrap(g, text, x, y, maxW, lh, maxLines) {
  const lines = lineBreak(g, text, maxW);
  lines.slice(0, maxLines).forEach((l, i) => g.fillText(i === maxLines - 1 && lines.length > maxLines ? l + '…' : l, x, y + i * lh));
}
