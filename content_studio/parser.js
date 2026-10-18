'use strict';
// Разбор Markdown-документов: сценарий (сцены и шоты), каст-библия (тег-сеты, листы, плейты),
// всё остальное хранится как справочный текст для ИИ.

const Parser = (() => {
  const uid = () => Math.random().toString(36).slice(2, 10);

  // Экспорт из редакторов экранирует квадратные скобки: «&#91;ДЕТАЛЬ\]».
  function clean(s) {
    return s.replace(/&#91;/g, '[').replace(/&#93;/g, ']').replace(/\\([\[\]*_#>`-])/g, '$1').replace(/\r/g, '');
  }

  function detectKind(text) {
    if (/^###\s*СЦЕНА\s*\d+/mi.test(text) || /^###\s*SCENE\s*\d+/mi.test(text)) return 'script';
    if (/```[\s\S]*?(SET:|STYLE:|LOOK:)/.test(text)) return 'cast';
    return 'bible';
  }

  function title(text, fallback) {
    const m = text.match(/^#\s+(.+)$/m);
    return m ? m[1].trim() : fallback;
  }

  // ---------------------------------------------------------------- сценарий
  const SPEAKER = /^([А-ЯЁA-Z][А-ЯЁA-Z .\-]{1,40}?)\s*(\((?:V\.O\.|ЗК|З\.К\.|O\.S\.)\))?\s*:\s*(.*)$/;
  const SOUND = /\((звук(?: в кадре)?|sound):\s*([^)]*)\)\s*\.?\s*$/i;

  function splitSound(s) {
    const m = s.match(SOUND);
    return m ? { text: s.slice(0, m.index).trim(), sound: m[2].trim() } : { text: s.trim(), sound: '' };
  }

  function parseScript(raw) {
    const text = clean(raw);
    const scenes = [];
    let act = '', scene = null;
    const lines = text.split('\n');
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      let m;
      if ((m = line.match(/^##\s+(.+)$/)) && !line.startsWith('###')) { act = m[1].trim(); continue; }
      if ((m = line.match(/^###\s*(?:СЦЕНА|SCENE)\s*(\d+)\.?\s*(.*)$/i))) {
        scene = { id: uid(), num: +m[1], heading: m[2].trim(), act, type: '', notes: [], shift: '', planSec: 0, textSec: 0,
          narration: [], locationId: '', shots: [] };
        scenes.push(scene);
        continue;
      }
      if (!scene) continue;
      if ((m = line.match(/^\*\*Тип:\*\*\s*(.+)$/))) { scene.type = m[1].trim(); continue; }
      if (/^\*\*Действие:\*\*\s*$/.test(line)) continue;
      if ((m = line.match(/^\*\*(.+)\*\*$/))) { scene.notes.push(m[1]); continue; }
      if ((m = line.match(/^Сдвиг:\s*(.+)$/))) { scene.shift = m[1].trim(); continue; }
      if ((m = line.match(/^\*?Хронометраж:(.+?)\*?$/))) {
        const p = m[1].match(/по плану\s*(\d+)/), t = m[1].match(/по тексту\s*(\d+)/);
        scene.planSec = p ? +p[1] : 0; scene.textSec = t ? +t[1] : 0;
        continue;
      }
      if ((m = line.match(/^\[([^\]]+)\]\s*(.*)$/))) { scene.shots.push(makeShot(m[1].trim(), m[2])); continue; }
      if ((m = line.match(/^ЧЁРНЫЙ ЭКРАН\.?\s*(.*)$/))) {
        const t = (m[1].match(/«([^»]+)»/) || [])[1] || '';
        const { text: rest, sound } = splitSound(m[1]);
        scene.shots.push(Object.assign(makeShot('ТИТР', ''), { text: rest, sound, title: t, dur: 4 }));
        continue;
      }
      if ((m = line.match(SPEAKER)) && !/^(Сдвиг|Тип)$/i.test(m[1])) {
        const { text: said, sound } = splitSound(m[3]);
        const d = { who: m[1].trim(), vo: !!m[2], line: said };
        if (/^(НАРРАТОР|РАССКАЗЧИК|NARRATOR)$/i.test(d.who)) { scene.narration.push(d.line); continue; }
        const last = scene.shots[scene.shots.length - 1];
        if (last) { last.dialogue.push(d); if (sound && !last.sound) last.sound = sound; }
        else scene.notes.push(line);
        continue;
      }
      if (/^Чёрный экран/i.test(line) && !scene.shots.length) {
        const { text: rest, sound } = splitSound(line);
        scene.shots.push(Object.assign(makeShot('ЧЁРНЫЙ', rest), { sound }));
        continue;
      }
      scene.notes.push(line.replace(/^\*+|\*+$/g, ''));
    }
    scenes.forEach(fitDurations);
    return scenes;
  }

  function makeShot(kind, body) {
    const shot = { id: uid(), kind, text: '', sound: '', dialogue: [], dur: 0, pinnedDur: false, characters: null,
      en: '', motion: '', title: '', assets: {}, override: {} };
    const pause = kind.match(/^ПАУЗА\s*(\d+)/i);
    if (pause) { shot.kind = 'ПАУЗА'; shot.dur = +pause[1]; shot.pinnedDur = true; }
    const { text, sound } = splitSound(body || '');
    shot.sound = sound;
    const m = text.match(SPEAKER);
    if (m) shot.dialogue.push({ who: m[1].trim(), vo: !!m[2], line: m[3].trim() });
    else shot.text = text;
    return shot;
  }

  // Слова в секунду для русской речи с паузами.
  const speechSec = s => Math.max(2, Math.round(s.split(/\s+/).filter(Boolean).length / 2.3 + 0.8));

  function estimate(shot) {
    if (shot.kind === 'ТИТР') return 4;
    const talk = shot.dialogue.filter(d => !d.vo).map(d => speechSec(d.line)).reduce((a, b) => a + b, 0);
    return Math.max(talk, 2);
  }

  // Длительности шотов: паузы фиксированы, реплики по числу слов, остальное делится поровну до хронометража сцены.
  function fitDurations(scene) {
    const target = scene.textSec || scene.planSec || 0;
    const free = scene.shots.filter(s => !s.pinnedDur);
    free.forEach(s => { s.dur = estimate(s); });
    if (!target || !free.length) { free.forEach(s => { s.dur = s.dur || 4; }); return; }
    const used = scene.shots.reduce((a, s) => a + s.dur, 0);
    let rest = target - used;
    if (rest > 0) {
      const silent = free.filter(s => !s.dialogue.some(d => !d.vo));
      const pool = silent.length ? silent : free;
      const add = rest / pool.length;
      pool.forEach(s => { s.dur = Math.round((s.dur + add) * 2) / 2; });
    } else if (rest < 0) {
      const k = Math.max(0.4, (target - scene.shots.filter(s => s.pinnedDur).reduce((a, s) => a + s.dur, 0)) / free.reduce((a, s) => a + s.dur, 0));
      free.forEach(s => { s.dur = Math.max(1.5, Math.round(s.dur * k * 2) / 2); });
    }
  }

  // ---------------------------------------------------------------- каст-библия
  function codeBlocks(section) {
    const out = [];
    const re = /```[a-z]*\n([\s\S]*?)```/g;
    let m;
    while ((m = re.exec(section))) out.push({ index: m.index, body: m[1].trim() });
    return out;
  }

  function block(body, key) {
    const m = body.match(new RegExp('^' + key + ':\\s*([\\s\\S]*?)(?=\\n\\s*\\n[A-Z ,0-9]+:|$)', 'm'));
    return m ? m[1].trim() : '';
  }

  function parseCast(raw) {
    const text = clean(raw);
    const res = { style: {}, characters: [], locations: [] };
    const lines = text.split('\n');
    const blocks = codeBlocks(text);
    // Позиция начала строки → индекс строки
    const lineAt = idx => text.slice(0, idx).split('\n').length - 1;

    for (const b of blocks) {
      for (const key of ['LOOK', 'STYLE', 'NEGATIVE']) {
        if (!res.style[key.toLowerCase()]) { const v = block(b.body, key); if (v) res.style[key.toLowerCase()] = v; }
      }
    }

    const chars = new Map();
    const getChar = name => {
      if (!chars.has(name)) chars.set(name, { id: uid(), name, aliases: [name], tags: '', prompts: [], variantOf: '', scenes: [], ref: '' });
      return chars.get(name);
    };
    let plate = null;

    for (const b of blocks) {
      // ищем ближайший сверху заголовок «**...**» или «### ...»
      let i = lineAt(b.index) - 1, label = null, heading = null;
      while (i >= 0) {
        const l = lines[i].trim();
        if (/^```/.test(l)) break;
        if (!label && /^\*\*[^*]+\*\*$/.test(l)) { label = l.slice(2, -2).trim(); break; }
        if (/^#{2,4}\s/.test(l)) { heading = l.replace(/^#+\s*/, ''); break; }
        i--;
      }
      const body = b.body;
      // второй блок подряд под тем же заголовком плейта (без своего заголовка) — промпт плейта
      if (!label && !heading && plate && !/^SET:/.test(body) && res.locations[res.locations.length - 1] === plate) { plate.plate = plate.plate || body; continue; }
      if (heading && /^Плейт|^Plate/i.test(heading)) {
        const name = heading.replace(/^(Плейт|Plate)\s*\d*\.?\s*/i, '').trim();
        if (!plate || plate.name !== name) { plate = { id: uid(), name, set: '', keywords: '', plate: '', ref: '' }; res.locations.push(plate); }
        if (/^SET:/.test(body)) plate.set = body.replace(/^SET:\s*/, '').trim();
        else plate.plate = body;
        continue;
      }
      if (heading && /^SET:/.test(body)) { plate = { id: uid(), name: heading, set: body.replace(/^SET:\s*/, ''), keywords: '', plate: '', ref: '' }; res.locations.push(plate); continue; }
      if (!label || /^STYLE:/.test(body)) continue;
      const dash = label.split(/\s+[—–-]\s+/);
      if (dash.length > 1) {
        getChar(dash[0].trim()).prompts.push({ label: dash.slice(1).join(' — '), text: body });
        continue;
      }
      // «Император без плаща (сцены 13–16)» — вариант основного героя для части сцен
      const vm = label.match(/^(.+?)\s*\((?:сцены|сцена|scenes?)\s*(\d+)\s*[–—-]\s*(\d+)\)\s*$/i);
      const name = vm ? vm[1].trim() : label;
      const c = getChar(name);
      c.tags = body;
      if (vm) {
        c.scenes = [+vm[2], +vm[3]];
        const base = [...chars.values()].filter(o => o !== c && name.startsWith(o.name)).sort((a, b) => b.name.length - a.name.length)[0];
        if (base) { c.variantOf = base.id; c.aliases = []; }
      }
    }
    res.characters = [...chars.values()].filter(c => c.tags || c.prompts.length);
    return res;
  }

  // ---------------------------------------------------------------- поиск персонажей и мест в тексте
  function stem(w) {
    w = w.toLowerCase().replace(/ё/g, 'е');
    if (w.length >= 7) return w.slice(0, w.length - 2);
    if (w.length >= 5) return w.slice(0, w.length - 1);
    return w;
  }

  function mentions(text, alias) {
    const t = ' ' + text.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ') + ' ';
    const words = alias.split(/\s+/).filter(Boolean).map(stem);
    if (!words.length) return false;
    return new RegExp('\\s' + words.map(w => w + '[a-zа-я]{0,4}').join('\\s+') + '\\s').test(t);
  }

  return { uid, clean, detectKind, title, parseScript, parseCast, fitDurations, mentions, stem, speechSec };
})();

if (typeof module !== 'undefined') module.exports = Parser;
