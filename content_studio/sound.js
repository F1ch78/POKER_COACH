'use strict';
// Саунд-дизайн: библиотека звуков, музыка по сценам, атмосфера сцен, эффекты в шотах и микшер.
// Пользуется общими помощниками студии (h, btn, field, toast, addAsset…), поэтому подключается до studio.js.

const SND_GROUPS = [['voice', 'Голос'], ['music', 'Музыка'], ['amb', 'Атмосфера'], ['sfx', 'Эффекты']];

function soundSummary() {
  const snd = S.p.sound, scenes = S.p.scenes;
  const amb = scenes.filter(sc => sc.ambience && sc.ambience.asset).length;
  const fx = scenes.reduce((a, sc) => a + sc.shots.reduce((b, sh) => b + (sh.sfx || []).filter(x => x.asset).length, 0), 0);
  return `Музыка: ${snd.cues.filter(c => c.asset).length} трек. · атмосфера в ${amb} сцен. · эффектов: ${fx}`;
}

const sndName = id => (S.p.assets[id] || {}).name || '—';
const sndLib = () => S.p.sound.library.filter(id => S.p.assets[id]);

async function soundUpload(files) {
  const added = [];
  for (const f of files) {
    if (!(f.type || guessType(f.name)).startsWith('audio')) { toast(f.name + ': это не звуковой файл'); continue; }
    const id = await addAsset(f);
    S.p.sound.library.push(id);
    added.push(id);
  }
  if (added.length) { touch(); toast('Добавлено в библиотеку: ' + added.length); }
  render();
  return added;
}

// Где используется звук из библиотеки.
function soundUses(id) {
  const p = S.p, uses = [];
  p.sound.cues.forEach(c => { if (c.asset === id) uses.push('музыка'); });
  p.scenes.forEach(sc => {
    if (sc.ambience && sc.ambience.asset === id) uses.push(`атмосфера сц. ${sc.num}`);
    sc.shots.forEach(sh => (sh.sfx || []).forEach(fx => { if (fx.asset === id) uses.push(Prompts.code(sc, sh)); }));
  });
  return uses;
}

function soundRemove(id) {
  const uses = soundUses(id);
  if (!confirm(`Удалить «${sndName(id)}» из библиотеки?` + (uses.length ? `\nОн пропадёт и отсюда: ${uses.slice(0, 8).join(', ')}${uses.length > 8 ? '…' : ''}` : ''))) return;
  const p = S.p;
  p.sound.library = p.sound.library.filter(x => x !== id);
  p.sound.cues = p.sound.cues.filter(c => c.asset !== id);
  p.scenes.forEach(sc => {
    if (sc.ambience && sc.ambience.asset === id) delete sc.ambience;
    sc.shots.forEach(sh => { sh.sfx = (sh.sfx || []).filter(fx => fx.asset !== id); });
  });
  dropAsset(id); touch(); render();
}

// Выбор звука из библиотеки; последний пункт сразу загружает новый файл.
function soundPick(value, onpick, empty, cls) {
  return h('select', { class: cls || '', onchange: async e => {
    let v = e.target.value;
    if (v === '+') { const [id] = await soundUpload(await pickFile('audio/*', true)); if (!id) return; v = id; }
    onpick(v); touch(); render();
  } },
    h('option', { value: '' }, empty || '— нет —'),
    sndLib().map(id => h('option', { value: id, selected: id === value }, sndName(id))),
    h('option', { value: '+' }, '＋ загрузить файл…'));
}

const volume = (value, onchange, title) => h('label', { class: 'vol', title: title || 'Громкость' }, '🔊',
  h('input', { type: 'range', min: 0, max: 1.5, step: 0.05, value: value == null ? 1 : value, onchange: e => { onchange(+e.target.value); touch(); render(); } }),
  h('small', { class: 'muted' }, Math.round(100 * (value == null ? 1 : value)) + '%'));
const secs = (value, onchange, title) => h('label', { class: 'secs', title: title || '' },
  h('input', { type: 'number', min: 0, step: 0.1, value: value || 0, onchange: e => { onchange(Math.max(0, +String(e.target.value).replace(',', '.') || 0)); touch(); render(); } }), 'с');

function previewAudio(id) {
  const el = h('audio', { controls: true, preload: 'none' });
  assetUrl(id).then(u => { el.src = u; });
  return el;
}

function renderSound() {
  const p = S.p, snd = p.sound;
  if (!p.scenes.length) return h('div', { class: 'page' }, h('p', { class: 'muted' }, 'Сцен нет. Импортируйте сценарий на вкладке «Материалы».'));
  const sceneOpt = (value, empty) => [h('option', { value: '' }, empty), p.scenes.map(sc => h('option', { value: sc.id, selected: sc.id === value }, `сцена ${sc.num}. ${sc.heading.split(/\s+[-–—]\s+/)[0]}`))];
  const watch = sc => btn('▶ Смотреть', () => { S.range = sc ? sc.id : 'all'; S.tab = 'edit'; render(); window.scrollTo(0, 0); }, 'ghost small', 'Открыть в «Монтаже»');

  const mixer = h('div', { class: 'card' },
    h('h3', {}, 'Микшер'),
    SND_GROUPS.map(([k, label]) => h('div', { class: 'row mix' }, h('span', { class: 'mix-name' }, label), volume(snd.levels[k], v => { snd.levels[k] = v; }, 'Общая громкость: ' + label.toLowerCase()))),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: snd.duck, onchange: e => { snd.duck = e.target.checked; touch(); } }), 'Приглушать музыку, пока звучат реплики'),
    h('p', { class: 'muted small' }, 'Голос — озвучка и свои записи реплик. Звук из видеофайлов включается в «Монтаже».'));

  const library = h('div', { class: 'card' },
    h('h3', {}, 'Библиотека звуков'),
    h('div', { class: 'row wrap' },
      btn('＋ Загрузить музыку и звуки', async () => soundUpload(await pickFile('audio/*', true)), 'primary'),
      h('span', { class: 'muted small' }, 'или перетащите файлы (mp3, wav, ogg, m4a) на эту страницу')),
    sndLib().length ? h('div', { class: 'snd-lib' }, sndLib().map(id => {
      const meta = p.assets[id], uses = soundUses(id);
      return h('div', { class: 'snd-item' },
        h('span', { class: 'snd-name', title: meta.name }, meta.name),
        h('small', { class: 'muted' }, (meta.duration ? meta.duration + ' с' : '') + (uses.length ? ' · ' + uses.length + ' исп.' : ' · не используется')),
        previewAudio(id),
        btn('✕', () => soundRemove(id), 'ghost small', 'Удалить из библиотеки'));
    })) : h('p', { class: 'muted small' }, 'Пока пусто. Загрузите музыку, атмосферу (ветер, дождь, город) и отдельные звуки (шаги, дверь, выстрел).'));

  const music = h('div', { class: 'card' },
    h('h3', {}, 'Музыка'),
    snd.cues.length ? snd.cues.map((c, i) => h('div', { class: 'snd-cue' },
      soundPick(c.asset, v => { c.asset = v; }, '— выберите трек —'),
      h('label', { class: 'field' }, h('span', {}, 'с'), h('select', { onchange: e => { c.from = e.target.value; touch(); render(); } }, sceneOpt(c.from, 'начала фильма'))),
      h('label', { class: 'field' }, h('span', {}, 'по'), h('select', { onchange: e => { c.to = e.target.value; touch(); render(); } }, sceneOpt(c.to, c.loop ? 'конец фильма' : 'конец трека'))),
      volume(c.vol, v => { c.vol = v; }),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!c.loop, onchange: e => { c.loop = e.target.checked; touch(); render(); } }), 'по кругу'),
      h('span', { class: 'muted small' }, 'нарастание'), secs(c.fadeIn, v => { c.fadeIn = v; }, 'Плавное нарастание в начале'),
      h('span', { class: 'muted small' }, 'затухание'), secs(c.fadeOut, v => { c.fadeOut = v; }, 'Плавное затухание в конце'),
      btn('✕', () => { snd.cues.splice(i, 1); touch(); render(); }, 'ghost small', 'Убрать трек'))) : h('p', { class: 'muted small' }, 'Музыки пока нет.'),
    h('div', { class: 'row wrap' },
      btn('＋ Музыкальный трек', () => { snd.cues.push({ id: uid(), asset: sndLib()[0] || '', from: '', to: '', vol: 1, loop: false, fadeIn: 1, fadeOut: 2 }); touch(); render(); }),
      h('span', { class: 'muted small' }, 'Трек играет с начала выбранной сцены до конца сцены «по» или до конца файла. Треки могут перекрываться.')));

  const scenes = p.scenes.map(sc => {
    const amb = sc.ambience;
    const notes = sc.shots.filter(sh => sh.sound).length;
    const shots = sc.shots.filter(sh => S.sndAll || sh.sound || (sh.sfx || []).length).map(sh => h('div', { class: 'snd-shot' },
      h('b', { class: 'vo-code' }, Prompts.code(sc, sh)),
      h('div', { class: 'snd-what' },
        h('div', { class: 'small' }, (sh.text || sh.title || sh.kind).slice(0, 140)),
        sh.sound ? h('div', { class: 'small snd-note' }, '🔉 по сценарию: ' + sh.sound) : null),
      h('div', { class: 'snd-fx' },
        (sh.sfx || []).map((fx, i) => h('div', { class: 'row' },
          soundPick(fx.asset, v => { fx.asset = v; }, '— звук —'),
          h('span', { class: 'muted small' }, 'через'), secs(fx.at, v => { fx.at = Math.min(v, +sh.dur || v); }, 'Через сколько секунд от начала шота'),
          volume(fx.vol, v => { fx.vol = v; }),
          btn('✕', () => { sh.sfx.splice(i, 1); touch(); render(); }, 'ghost small'))),
        soundPick('', v => { if (v) (sh.sfx = sh.sfx || []).push({ id: uid(), asset: v, at: 0, vol: 1 }); }, '＋ эффект', 'chip'))));
    return h('div', { class: 'card snd-scene' },
      h('div', { class: 'row wrap' }, h('h3', { class: 'grow' }, `Сцена ${sc.num}. ${sc.heading}`), watch(sc)),
      h('div', { class: 'row wrap' },
        h('span', {}, 'Атмосфера сцены (по кругу):'),
        soundPick(amb && amb.asset, v => { if (v) sc.ambience = { asset: v, vol: amb ? amb.vol : 1 }; else delete sc.ambience; }),
        amb ? volume(amb.vol, v => { amb.vol = v; }) : null),
      shots.length ? shots : h('p', { class: 'muted small' }, notes ? '' : 'В сценарии нет звуковых пометок для этой сцены.'));
  });

  return h('div', { class: 'page sound' },
    h('div', { class: 'grid2' }, library, mixer),
    music,
    h('div', { class: 'row wrap', style: 'margin-top:14px' },
      h('h2', { class: 'grow' }, 'Атмосфера и эффекты по сценам'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!S.sndAll, onchange: e => { S.sndAll = e.target.checked; render(); } }), 'Показывать все шоты (не только со звуковыми пометками)'),
      watch(null)),
    scenes);
}
