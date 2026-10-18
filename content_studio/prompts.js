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

  // Какие герои в кадре: ручной выбор, иначе по упоминаниям; «Он/Она…» без имени — наследует героев предыдущего шота.
  function characters(p, scene, shot) {
    const byId = id => p.characters.find(c => c.id === id);
    let ids;
    if (Array.isArray(shot.characters)) ids = shot.characters.slice();
    else ids = autoCharacters(p, scene, shot);
    return ids.map(byId).filter(Boolean).map(c => variantFor(p, c, scene.num));
  }

  function autoCharacters(p, scene, shot) {
    const hay = [shot.text, shot.title].concat(shot.dialogue.filter(d => !d.vo).map(d => d.who)).join(' ');
    const ids = p.characters.filter(c => !c.variantOf && (c.aliases || []).some(a => a && Parser.mentions(hay, a))).map(c => c.id);
    if (!ids.length && /^(Он|Она|Его|Её|Ее|Они|Им|Ему|Ей)\b/.test(shot.text || '')) {
      const i = scene.shots.indexOf(shot);
      if (i > 0) return autoCharacters(p, scene, scene.shots[i - 1]);
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

  return { CAMERA, KINDS, noPicture, camera, characters, autoCharacters, location, image, video, code, markdown, csv, isEnglish, description };
})();
