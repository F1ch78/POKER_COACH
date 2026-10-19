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

  function description(shot) { return (shot.en || shot.text || '').trim(); }
  const isEnglish = s => !/[а-яё]/i.test(s || '');

  function image(p, scene, shot) {
    if (shot.override && shot.override.image) return shot.override.image;
    if (noPicture(shot)) return '';
    const chars = characters(p, scene, shot);
    const loc = location(p, scene);
    const parts = [camera(scene, shot) + '. ' + description(shot)];
    if (chars.length) parts.push(chars.map(c => c.tags).filter(Boolean).join('\n'));
    if (loc && loc.set) parts.push('SET: ' + loc.set);
    const tail = styleTail(p);
    if (tail) parts.push(tail);
    return parts.join('\n\n');
  }

  function video(p, scene, shot) {
    if (shot.override && shot.override.video) return shot.override.video;
    if (noPicture(shot)) return '';
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
    const { limit = 0, hasFrame = false } = opts || {};
    if (shot.override && shot.override.video) return shot.override.video;
    if (noPicture(shot)) return '';
    const s = p.style || {};
    const moving = /движется|moving|handheld/i.test(scene.type);
    const spoken = shot.dialogue.filter(d => !d.vo).map(d => '«' + d.line.replace(/^\([^)]*\)\s*/, '') + '»').join(' ');
    const sec = [];
    const add = (prio, text, short) => { if (text) sec.push({ prio, text, short, cur: text }); };
    add(0, `${shot.dur}-second shot. ${camera(scene, shot)}${moving ? ', slow motivated camera movement' : ', locked-off static camera'}.`);
    add(1, [shot.motion, description(shot)].filter(Boolean).join(' '));
    add(2, spoken && 'The character speaks in Russian, lips in sync: ' + spoken);
    if (hasFrame) add(3, 'Animate the input image: keep its faces, costumes, place and light exactly.');
    else {
      const chars = characters(p, scene, shot).filter(c => c.tags);
      add(4, chars.map(c => c.tags).join('\n'), chars.map(c => firstItems(c.tags, 5)).join('\n'));
      const loc = location(p, scene);
      if (loc && loc.set) add(5, 'SET: ' + loc.set, 'SET: ' + firstSentence(loc.set));
    }
    add(6, s.style && 'STYLE: ' + s.style, 'Muted dark cinematic look, low saturation, subtle film grain.');
    add(7, s.negative && 'Avoid: ' + s.negative, s.negative && 'Avoid: ' + firstItems(s.negative, 10));
    add(8, shot.sound && 'Diegetic sound (in Russian notes): ' + shot.sound + '.');
    add(9, !hasFrame && s.look && 'LOOK: ' + s.look, s.look && 'LOOK: ' + firstSentence(s.look));
    const join = () => sec.filter(x => !x.dropped).map(x => x.cur).join('\n\n');
    if (!limit || join().length <= limit) return join();
    const least = sec.slice().sort((a, b) => b.prio - a.prio);
    for (const x of least) if (x.short && x.cur !== x.short) { x.cur = x.short; if (join().length <= limit) return join(); }
    for (const x of least) if (x.prio >= 2) { x.dropped = true; if (join().length <= limit) return join(); }
    const t = join().slice(0, limit - 1);
    return t.slice(0, Math.max(t.lastIndexOf(' '), limit - 40)) + '…';
  }

  // Имя файла, по которому пакетная загрузка сама находит шот: S05_03.png, S05_03.mp4, S05_03.mp3.
  const code = (scene, shot) => 'S' + String(scene.num).padStart(2, '0') + '_' + String(scene.shots.indexOf(shot) + 1).padStart(2, '0');

  function markdown(p, scenes) {
    const out = ['# ' + p.name + ' — промпты', ''];
    for (const sc of scenes) {
      out.push(`## Сцена ${sc.num}. ${sc.heading}`, '');
      for (const sh of sc.shots) {
        out.push(`### ${code(sc, sh)} · ${sh.kind} · ${sh.dur} с`, '', sh.text || sh.title || '', '');
        sh.dialogue.forEach(d => out.push(`> ${d.who}${d.vo ? ' (V.O.)' : ''}: ${d.line}`));
        if (sh.dialogue.length) out.push('');
        const im = image(p, sc, sh), vi = video(p, sc, sh);
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

  return { CAMERA, KINDS, noPicture, camera, characters, autoCharacters, location, image, video, videoFit, code, markdown, csv, isEnglish, description };
})();
