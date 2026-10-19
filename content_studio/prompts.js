'use strict';
// Сборка промптов для генераторов картинок и видео из шота, героев, локации и стиля проекта.

const Prompts = (() => {
  const CAMERA = {
    'ДЕТАЛЬ': 'Extreme close-up detail shot, 100mm macro lens',
    'КРУПНЫЙ': 'Close-up shot, 85mm lens, the face in the central band of the frame',
    'СРЕДНИЙ': 'Medium shot, 50mm lens',
    'ОБЩИЙ': 'Wide shot, 35mm lens',
    'ОБЩИЙ С ВЫСОТЫ': 'High-angle wide establishing shot from above, 24mm lens, small figures in a large space',
    'МАСТЕР': 'Master wide shot, 24mm lens, all characters and the space between them in frame',
    'РАКУРС А': 'Over-the-shoulder shot, 50mm lens, a shoulder in the left foreground out of focus',
    'РАКУРС Б': 'Reverse over-the-shoulder shot, 50mm lens, a shoulder in the right foreground out of focus',
  };
  const KINDS = Object.keys(CAMERA).concat(['ПАУЗА', 'ЧЁРНЫЙ', 'ТИТР']);
  const noPicture = shot => shot.kind === 'ЧЁРНЫЙ' || shot.kind === 'ТИТР';

  // Ракурс для паузы берём у предыдущего «настоящего» шота.
  function framing(scene, shot) {
    if (CAMERA[shot.kind]) return shot.kind;
    const i = scene.shots.indexOf(shot);
    for (let j = i - 1; j >= 0; j--) if (CAMERA[scene.shots[j].kind]) return scene.shots[j].kind;
    return 'СРЕДНИЙ';
  }
  const camera = (scene, shot) => CAMERA[framing(scene, shot)] + (shot.kind === 'ПАУЗА' ? ', held still for the whole shot' : '');

  // Какие герои в кадре: ручной выбор, иначе разметка ИИ (при описании шотов), иначе поиск имён в тексте.
  function characters(p, scene, shot) {
    const byId = id => p.characters.find(c => c.id === id);
    let ids;
    if (Array.isArray(shot.characters)) ids = shot.characters.slice();
    else if (Array.isArray(shot.aiCharacters)) ids = shot.aiCharacters.slice();
    else ids = autoCharacters(p, scene, shot);
    return ids.map(byId).filter(Boolean).map(c => variantFor(p, c, scene.num));
  }

  // «Он/Она…» без имени — те же герои, что в ближайшем шоте сцены с именем: сначала смотрим назад
  // (через другие «Он…» и шоты только с репликой), а у первых шотов сцены — вперёд.
  const PRONOUN = /^(Он|Она|Оно|Они|Его|Её|Ее|Им|Ему|Ей|Их)(?=[\s,.!?…:;]|$)/;

  function named(p, shot, withVO) {
    const hay = [shot.text, shot.title].concat(shot.dialogue.filter(d => withVO || !d.vo).map(d => d.who)).join(' ');
    return p.characters.filter(c => !c.variantOf && (c.aliases || []).some(a => a && Parser.mentions(hay, a))).map(c => c.id);
  }

  function autoCharacters(p, scene, shot) {
    const ids = named(p, shot);
    if (ids.length || !PRONOUN.test(shot.text || '')) return ids;
    // закадровый голос в шоте «Он…» — почти всегда голос того, кто в кадре
    const own = named(p, shot, true);
    if (own.length) return own;
    const i = scene.shots.indexOf(shot);
    for (let j = i - 1; j >= 0; j--) {
      const prev = scene.shots[j], found = named(p, prev, true);
      if (found.length) return found;
      if (prev.text && !PRONOUN.test(prev.text)) break;
    }
    for (let j = i + 1; j < scene.shots.length; j++) {
      const found = named(p, scene.shots[j], true);
      if (found.length) return found;
    }
    return ids;
  }

  function variantFor(p, c, num) {
    const v = p.characters.find(o => o.variantOf === c.id && o.scenes && o.scenes.length === 2 && num >= o.scenes[0] && num <= o.scenes[1]);
    return v || c;
  }

  const location = (p, scene) => p.locations.find(l => l.id === scene.locationId) || null;

  function styleTail(p) {
    const s = p.style || {};
    return [s.look && 'LOOK: ' + s.look, s.style && 'STYLE: ' + s.style, s.negative && 'NEGATIVE: ' + s.negative].filter(Boolean).join('\n\n');
  }

  // Под какую нейросеть составлен промпт: fits — для чего он, also — где ещё сработает.
  const TARGETS = {
    image: {
      universal: { label: 'Универсальный', fits: 'GPT Image, Nano Banana (Gemini), Flux', also: 'любой генератор, понимающий длинный промпт' },
      natural: { label: 'GPT Image / Nano Banana', fits: 'GPT Image (ChatGPT), Nano Banana (Gemini)', also: 'Ideogram, Recraft, Шедеврум' },
      midjourney: { label: 'Midjourney', fits: 'Midjourney v6–v7', also: 'Niji Journey' },
      sd: { label: 'Stable Diffusion / Flux', fits: 'Stable Diffusion XL / 3.5, Flux (ComfyUI, Forge)', also: 'Leonardo, Krea, Kandinsky' },
    },
    video: {
      universal: { label: 'Универсальный', fits: 'motion16 и похожие сайты, Hailuo, Wan', also: 'большинство генераторов видео' },
      kling: { label: 'Kling', fits: 'Kling 2.x', also: 'Hailuo (MiniMax), Wan, Seedance' },
      runway: { label: 'Runway', fits: 'Runway Gen-4 (картинка → видео, до 1000 символов)', also: 'Luma Ray, Pika' },
      veo: { label: 'Veo / Sora (со звуком)', fits: 'Google Veo 3, OpenAI Sora 2 — с речью и звуком', also: 'Kling с озвучкой' },
    },
  };
  const target = (kind, t) => TARGETS[kind][t] ? t : 'universal';
  const aspect = p => { const [w, h] = String((p.render || {}).size || '1920x1080').split('x').map(Number); return w < h ? '9:16' : '16:9'; };
  const flat = t => String(t || '').replace(/\s*\n+\s*/g, ' ').trim();
  const dot = t => { t = flat(t); return t && !/[.!?…]$/.test(t) ? t + '.' : t; };

  function description(shot) { return (shot.en || shot.text || '').trim(); }
  const isEnglish = s => !/[а-яё]/i.test(s || '');

  function image(p, scene, shot, tgt) {
    if (shot.override && shot.override.image) return shot.override.image;
    if (noPicture(shot)) return '';
    const chars = characters(p, scene, shot);
    const loc = location(p, scene);
    const t = target('image', tgt);
    if (t !== 'universal') {
      const s = p.style || {}, tags = chars.map(c => flat(c.tags)).filter(Boolean), set = loc && loc.set ? flat(loc.set) : '';
      const cam = camera(scene, shot), what = flat(description(shot)), neg = flat(s.negative);
      if (t === 'midjourney')
        return [dot(cam), dot(what), tags.map(dot).join(' '), dot(set), dot(s.look), dot(s.style)].filter(Boolean).join(' ') +
          ` --ar ${aspect(p)} --style raw` + (neg ? ' --no ' + neg.replace(/\.$/, '') : '');
      if (t === 'sd')
        return ['cinematic film still, ' + cam, what, ...tags, set, flat(s.look), flat(s.style)].filter(Boolean).map(x => x.replace(/\.$/, '')).join(', ') +
          (neg ? '\n\nNegative prompt: ' + neg : '');
      return [`A cinematic film still. ${dot(cam)} ${dot(what)}`, tags.length && 'Characters: ' + tags.map(dot).join(' '), set && 'Setting: ' + dot(set),
        (s.look || s.style) && 'Look and style: ' + [dot(s.look), dot(s.style)].filter(Boolean).join(' '),
        `Frame: a single horizontal ${aspect(p)} film frame.` + (neg ? ' Avoid: ' + dot(neg) : '') + ' No text, no captions, no watermark.'].filter(Boolean).join('\n\n');
    }
    const parts = [camera(scene, shot) + '. ' + description(shot)];
    if (chars.length) parts.push(chars.map(c => c.tags).filter(Boolean).join('\n'));
    if (loc && loc.set) parts.push('SET: ' + loc.set);
    const tail = styleTail(p);
    if (tail) parts.push(tail);
    return parts.join('\n\n');
  }

  function video(p, scene, shot, tgt) {
    if (shot.override && shot.override.video) return shot.override.video;
    if (noPicture(shot)) return '';
    if (target('video', tgt) !== 'universal') return videoFit(p, scene, shot, { target: tgt });
    const chars = characters(p, scene, shot);
    const loc = location(p, scene);
    const moving = /движется|moving|handheld/i.test(scene.type);
    const cam = camera(scene, shot) + (moving ? ', slow motivated camera movement' : ', locked-off static camera');
    const lines = [`${shot.dur}-second shot. ${cam}.`, [description(shot), shot.motion].filter(Boolean).join(' ')];
    if (chars.length) lines.push(chars.map(c => c.tags).filter(Boolean).join('\n'));
    if (loc && loc.set) lines.push('SET: ' + loc.set);
    const spoken = shot.dialogue.filter(d => !d.vo);
    if (spoken.length) lines.push('The character speaks in Russian, lips in sync: ' + spoken.map(d => '«' + d.line.replace(/^\([^)]*\)\s*/, '') + '»').join(' '));
    if (shot.sound) lines.push('Diegetic sound (in Russian notes): ' + shot.sound + '.');
    const tail = styleTail(p);
    if (tail) lines.push(tail);
    return lines.join('\n\n');
  }

  // Промпт видео под лимит символов (у сайтов вроде motion16 — 2000). Части идут по важности:
  // ракурс и действие остаются всегда, остальное сначала сокращается, потом выбрасывается.
  // hasFrame — к видео прикладывается кадр шота: внешность героев и место уже на нём, их не описываем.
  const firstSentence = t => { const m = String(t || '').match(/^[\s\S]*?[.!?](?=\s|$)/); return m ? m[0] : String(t || ''); };   // точка в «2.39:1» — не конец предложения
  const firstItems = (t, n) => String(t || '').split(/,\s*/).slice(0, n).join(', ');

  function videoFit(p, scene, shot, opts) {
    let { limit = 0, hasFrame = false } = opts || {};
    const t = target('video', (opts || {}).target);
    if (shot.override && shot.override.video) return shot.override.video;
    if (noPicture(shot)) return '';
    if (t === 'runway') limit = limit ? Math.min(limit, 1000) : 1000;
    const s = p.style || {};
    const moving = /движется|moving|handheld/i.test(scene.type);
    const said = d => '«' + d.line.replace(/^\([^)]*\)\s*/, '') + '»';
    const spoken = shot.dialogue.filter(d => !d.vo).map(said).join(' ');
    const sec = [];
    const add = (prio, text, short) => { if (text) sec.push({ prio, text, short, cur: text }); };
    add(0, `${shot.dur}-second shot. ${camera(scene, shot)}${moving ? ', slow motivated camera movement' : ', locked-off static camera'}.`);
    add(1, [shot.motion, description(shot)].filter(Boolean).join(' '));
    // Runway: только движение и камера, внешность берётся с кадра; звука нет.
    if (t === 'runway') {
      if (spoken) add(2, 'The character talks, natural lip movement.');
      add(3, 'Keep the faces, costumes, place and light of the input image.');
      add(6, s.style && 'Style: ' + firstSentence(s.style));
    } else {
      // Veo и Sora озвучивают сами: реплики с именами, звук отдельной строкой.
      if (t === 'veo') {
        const lines = shot.dialogue.filter(d => !d.vo).map(d => `${d.who} says in Russian: ${said(d)}`).concat(shot.dialogue.filter(d => d.vo).map(d => `Voice-over in Russian (${d.who}): ${said(d)}`));
        add(2, lines.length && 'Dialogue: ' + lines.join(' '));
      } else add(2, spoken && 'The character speaks in Russian, lips in sync: ' + spoken);
      const setLabel = t === 'universal' ? 'SET: ' : 'Setting: ';
      if (hasFrame) add(3, 'Animate the input image: keep its faces, costumes, place and light exactly.');
      else {
        const chars = characters(p, scene, shot).filter(c => c.tags);
        add(4, chars.map(c => c.tags).join('\n'), chars.map(c => firstItems(c.tags, 5)).join('\n'));
        const loc = location(p, scene);
        if (loc && loc.set) add(5, setLabel + loc.set, setLabel + firstSentence(loc.set));
      }
      add(6, s.style && 'STYLE: ' + s.style, 'Muted dark cinematic look, low saturation, subtle film grain.');
      if (t !== 'kling') add(7, s.negative && 'Avoid: ' + s.negative, s.negative && 'Avoid: ' + firstItems(s.negative, 10));
      add(8, shot.sound && (t === 'veo' ? 'Audio: ' + shot.sound + ', natural ambience.' : 'Diegetic sound (in Russian notes): ' + shot.sound + '.'));
      add(9, !hasFrame && s.look && 'LOOK: ' + s.look, s.look && 'LOOK: ' + firstSentence(s.look));
      // У Kling запрещённое пишется в отдельное поле «Negative prompt» — ставим его в конец.
      if (t === 'kling') add(7, s.negative && 'Negative prompt: ' + s.negative, s.negative && 'Negative prompt: ' + firstItems(s.negative, 10));
    }
    const join = () => sec.filter(x => !x.dropped).map(x => x.cur).join('\n\n');
    if (!limit || join().length <= limit) return join();
    const least = sec.slice().sort((a, b) => b.prio - a.prio);
    for (const x of least) if (x.short && x.cur !== x.short) { x.cur = x.short; if (join().length <= limit) return join(); }
    for (const x of least) if (x.prio >= 2) { x.dropped = true; if (join().length <= limit) return join(); }
    const cut = join().slice(0, limit - 1);
    return cut.slice(0, Math.max(cut.lastIndexOf(' '), limit - 40)) + '…';
  }

  // Имя файла, по которому пакетная загрузка сама находит шот: S05_03.png, S05_03.mp4, S05_03.mp3.
  const code = (scene, shot) => 'S' + String(scene.num).padStart(2, '0') + '_' + String(scene.shots.indexOf(shot) + 1).padStart(2, '0');

  function markdown(p, scenes, tg) {
    tg = tg || {};
    const ti = TARGETS.image[target('image', tg.image)], tv = TARGETS.video[target('video', tg.video)];
    const out = ['# ' + p.name + ' — промпты', '', `> Промпты картинок составлены для: ${ti.fits} (подходят также: ${ti.also}).`,
      `> Промпты видео составлены для: ${tv.fits} (подходят также: ${tv.also}).`, ''];
    for (const sc of scenes) {
      out.push(`## Сцена ${sc.num}. ${sc.heading}`, '');
      for (const sh of sc.shots) {
        out.push(`### ${code(sc, sh)} · ${sh.kind} · ${sh.dur} с`, '', sh.text || sh.title || '', '');
        sh.dialogue.forEach(d => out.push(`> ${d.who}${d.vo ? ' (V.O.)' : ''}: ${d.line}`));
        if (sh.dialogue.length) out.push('');
        const im = image(p, sc, sh, tg.image), vi = video(p, sc, sh, tg.video);
        if (im) out.push('**Картинка**', '', '```', im, '```', '');
        if (vi) out.push('**Видео**', '', '```', vi, '```', '');
      }
    }
    return out.join('\n');
  }

  function csv(p, scenes) {
    const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
    const rows = [['code', 'scene', 'kind', 'dur', 'text', 'dialogue', 'sound', 'characters', 'image', 'video', 'audio'].join(',')];
    for (const sc of scenes) for (const sh of sc.shots) {
      rows.push([code(sc, sh), sc.num, sh.kind, sh.dur, sh.text || sh.title, sh.dialogue.map(d => d.who + ': ' + d.line).join(' / '), sh.sound,
        characters(p, sc, sh).map(c => c.name).join('; '), sh.assets.image ? 'да' : '', sh.assets.video ? 'да' : '', sh.assets.audio ? 'да' : ''].map(q).join(','));
    }
    return '﻿' + rows.join('\n');
  }

  return { TARGETS, CAMERA, KINDS, noPicture, camera, characters, autoCharacters, location, image, video, videoFit, code, markdown, csv, isEnglish, description };
})();
