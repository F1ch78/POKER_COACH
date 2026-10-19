'use strict';
// Интерфейс студии: материалы → раскадровка → монтаж.

const uid = Parser.uid;
const $ = s => document.querySelector(s);

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  kids.flat(Infinity).forEach(c => { if (c != null && c !== false) el.append(c.nodeType ? c : String(c)); });
  return el;
}

const fill = (el, ...kids) => el.replaceChildren(...kids.filter(k => k != null && k !== false));

const S = { list: [], p: null, tab: 'library', sceneId: null, range: 'all', busy: '', filter: 'all', focusShot: null,
  conv: { mode: 'image', shotId: null, scene: 'all', autoCopy: true } };
try { Object.assign(S, JSON.parse(localStorage.getItem('cs-ui') || '{}')); } catch (e) {}
const saveUi = () => { try { localStorage.setItem('cs-ui', JSON.stringify({ tab: S.tab, sceneId: S.sceneId, range: S.range, filter: S.filter, conv: S.conv })); } catch (e) {} };
const engine = new Engine(h('canvas', { class: 'preview' }));
const urlCache = new Map();

// ---------------------------------------------------------------- проект
function newProject(name) {
  return {
    id: uid(), name, created: Date.now(), docs: [], style: { look: '', style: '', negative: '' },
    characters: [], locations: [], scenes: [], assets: {}, music: '',
    render: { size: '1920x1080', fps: 30, letterbox: true, subs: true, labels: false, fade: true, videoAudio: true, musicVol: 0.4 },
  };
}

let saveTimer = null;
function touch() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => DB.saveProject(S.p).catch(e => toast('Не удалось сохранить: ' + e.message)), 300);
}
const flush = () => { clearTimeout(saveTimer); return S.p ? DB.saveProject(S.p) : Promise.resolve(); };

async function loadProjects() {
  S.list = (await DB.listProjects()).sort((a, b) => b.created - a.created);
  let id = null;
  try { id = localStorage.getItem('cs-last'); } catch (e) {}
  S.p = S.list.find(p => p.id === id) || S.list[0] || null;
  if (!S.p) { S.p = newProject('Мой фильм'); S.list = [S.p]; await DB.saveProject(S.p); }
  migrate(S.p);
}

function migrate(p) {
  p.assets = p.assets || {}; p.render = Object.assign(newProject('').render, p.render || {});
  p.scenes.forEach(sc => { sc.assets = sc.assets || {}; sc.shots.forEach(sh => { sh.assets = sh.assets || {}; sh.override = sh.override || {}; }); });
}

function selectProject(id) {
  flush();
  S.p = S.list.find(p => p.id === id); migrate(S.p);
  S.sceneId = null;
  try { localStorage.setItem('cs-last', id); } catch (e) {}
  render();
}

// ---------------------------------------------------------------- ассеты
const guessType = n => {
  const e = (n.split('.').pop() || '').toLowerCase();
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', md: 'text/markdown', txt: 'text/plain', json: 'application/json' })[e] || '';
};
const slotOf = type => type.startsWith('image') ? 'image' : type.startsWith('video') ? 'video' : type.startsWith('audio') ? 'audio' : null;

function mediaDuration(file, type) {
  return new Promise(res => {
    const el = document.createElement(type.startsWith('video') ? 'video' : 'audio');
    const u = URL.createObjectURL(file);
    el.preload = 'metadata';
    el.onloadedmetadata = () => { res(isFinite(el.duration) ? Math.round(el.duration * 10) / 10 : 0); URL.revokeObjectURL(u); };
    el.onerror = () => { res(0); URL.revokeObjectURL(u); };
    el.src = u;
  });
}

async function addAsset(file) {
  const id = uid();
  const type = file.type || guessType(file.name);
  await DB.putBlob(id, file);
  const meta = { name: file.name, type, size: file.size };
  if (/^(video|audio)/.test(type)) meta.duration = await mediaDuration(file, type);
  S.p.assets[id] = meta;
  return id;
}

function referenced(id) {
  const p = S.p;
  if (p.music === id) return true;
  if (p.characters.some(c => c.ref === id) || p.locations.some(l => l.ref === id)) return true;
  return p.scenes.some(sc => Object.values(sc.assets).includes(id) || sc.shots.some(sh => Object.values(sh.assets).includes(id)));
}
function dropAsset(id) {
  if (!id || referenced(id)) return;
  delete S.p.assets[id];
  DB.delBlob(id);
  const u = urlCache.get(id);
  if (u) { URL.revokeObjectURL(u); urlCache.delete(id); }
}

async function assetUrl(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const b = await DB.getBlob(id);
  if (!b) return '';
  const u = URL.createObjectURL(b);
  urlCache.set(id, u);
  return u;
}

function thumb(id, cls) {
  const meta = id && S.p.assets[id];
  if (!meta) return null;
  const isV = meta.type.startsWith('video');
  const el = h(isV ? 'video' : 'img', { class: cls, muted: true, playsInline: true, preload: 'metadata', alt: '' });
  assetUrl(id).then(u => { el.src = isV ? u + '#t=0.3' : u; });
  return el;
}

async function setAsset(holder, slot, file) {
  const old = holder.assets ? holder.assets[slot] : holder[slot];
  const id = await addAsset(file);
  if (holder.assets) holder.assets[slot] = id; else holder[slot] = id;
  dropAsset(old);
  touch();
  return id;
}

function pickFile(accept, multiple) {
  return new Promise(res => {
    const inp = h('input', { type: 'file', accept, multiple: !!multiple });
    inp.onchange = () => res([...inp.files]);
    inp.click();
  });
}

// Пакетная загрузка: S05_03.png → сцена 5, шот 3.
async function bulkAssets(files) {
  let ok = 0; const miss = [];
  for (const f of files) {
    const type = f.type || guessType(f.name), slot = slotOf(type);
    const base = f.name.replace(/\.[^.]+$/, '');
    const m = base.match(/(?:^|[^0-9])s?(\d{1,3})[_\-. x]+(?:sh|шот)?(\d{1,3})(?![0-9])/i) || base.match(/^s?(\d{1,3})[_\-.](\d{1,3})/i);
    const sc = m && S.p.scenes.find(s => s.num === +m[1]);
    const sh = sc && sc.shots[+m[2] - 1];
    if (!slot || !sh) { miss.push(f.name); continue; }
    await setAsset(sh, slot, f);
    ok++;
  }
  touch(); render();
  toast(`Разложено по шотам: ${ok}` + (miss.length ? `. Не распознано: ${miss.slice(0, 5).join(', ')}${miss.length > 5 ? '…' : ''}` : ''));
}

// ---------------------------------------------------------------- импорт документов
async function importFiles(files) {
  const media = [], done = [];
  for (const f of files) {
    const type = f.type || guessType(f.name);
    if (slotOf(type)) { media.push(f); continue; }
    const text = await f.text();
    if (/\.json$/i.test(f.name)) { try { await importProject(text); } catch (e) { toast(f.name + ': ' + e.message); } continue; }
    try { done.push(importDoc(f.name, text)); } catch (e) { toast(f.name + ': ' + e.message); }
  }
  if (done.length) toast('Загружено: ' + done.join('; '));
  if (media.length) await bulkAssets(media);
  touch(); render();
}

function importDoc(file, text) {
  const p = S.p;
  const kind = Parser.detectKind(text);
  const name = Parser.title(text, file);
  const old = p.docs.find(d => d.name === name || d.file === file);
  const doc = { id: old ? old.id : uid(), file, name, kind, text, added: Date.now() };
  if (old) p.docs[p.docs.indexOf(old)] = doc; else p.docs.push(doc);
  applyDoc(doc);
  return `${name} — ${({ script: 'сценарий', cast: 'каст-библия', bible: 'справка' })[kind]}`;
}

function applyDoc(doc) {
  const p = S.p;
  if (doc.kind === 'script') {
    const scenes = Parser.parseScript(doc.text);
    const old = new Map();
    p.scenes.forEach(sc => sc.shots.forEach((sh, i) => old.set(sc.num + ':' + i, sh)));
    const oldScenes = new Map(p.scenes.map(sc => [sc.num, sc]));
    scenes.forEach(sc => {
      const os = oldScenes.get(sc.num);
      sc.assets = os ? os.assets : {};
      if (os && os.locationId) sc.locationId = os.locationId;
      sc.shots.forEach((sh, i) => {
        const o = old.get(sc.num + ':' + i);
        if (!o) return;
        sh.assets = o.assets;
        if (o.text === sh.text) { sh.en = o.en; sh.motion = o.motion; sh.override = o.override || {}; sh.characters = o.characters; }
        if (o.pinnedDur && !sh.pinnedDur) { sh.dur = o.dur; sh.pinnedDur = true; }
      });
    });
    p.scenes = scenes;
    if (!p.name || p.name === 'Мой фильм') p.name = doc.name.replace(/\s*[—-]\s*текст сцен.*$/i, '').replace(/[«»]/g, '');
    autoLocations();
  } else if (doc.kind === 'cast') {
    const c = Parser.parseCast(doc.text);
    for (const k of ['look', 'style', 'negative']) if (c.style[k]) p.style[k] = c.style[k];
    for (const nc of c.characters) {
      const ex = p.characters.find(x => x.name === nc.name);
      if (ex) { ex.tags = nc.tags || ex.tags; ex.prompts = nc.prompts.length ? nc.prompts : ex.prompts; ex.scenes = nc.scenes; }
      else p.characters.push(nc);
    }
    // ссылки variantOf пересчитываем по именам (id новых и старых записей могут отличаться)
    for (const nc of c.characters.filter(x => x.variantOf)) {
      const base = c.characters.find(x => x.id === nc.variantOf);
      const me = p.characters.find(x => x.name === nc.name), b = base && p.characters.find(x => x.name === base.name);
      if (me && b) { me.variantOf = b.id; me.aliases = []; }
    }
    for (const nl of c.locations) {
      const ex = p.locations.find(x => x.name === nl.name);
      if (ex) { ex.set = nl.set || ex.set; ex.plate = nl.plate || ex.plate; } else p.locations.push(nl);
    }
    autoLocations();
  }
}

function locScore(loc, heading) {
  const st = w => { w = w.toLowerCase().replace(/ё/g, 'е'); return w.length >= 6 ? w.slice(0, -2) : w.length >= 4 ? w.slice(0, -1) : w; };
  const [place, time = ''] = heading.split(/\s+[-–—]\s+/);
  const hay = (loc.name + ' ' + (loc.keywords || '')).toLowerCase().replace(/ё/g, 'е');
  const words = s => s.split(/[^А-ЯЁа-яёA-Za-z]+/).filter(w => w.length >= 4).map(st);
  const pw = words(place);
  return pw.filter(w => hay.includes(w)).length / Math.max(1, pw.length) + 0.3 * words(time).filter(w => hay.includes(w)).length;
}

function autoLocations(force) {
  for (const sc of S.p.scenes) {
    if (sc.locationId && !force && S.p.locations.some(l => l.id === sc.locationId)) continue;
    let best = null, score = 0;
    for (const l of S.p.locations) { const s = locScore(l, sc.heading); if (s > score) { score = s; best = l; } }
    sc.locationId = best ? best.id : '';
  }
}

// Говорящие из сценария, которых нельзя сопоставить ни с одним героем.
function unknownSpeakers() {
  const cnt = new Map();
  for (const sc of S.p.scenes) for (const sh of sc.shots) for (const d of sh.dialogue) {
    if (S.p.characters.some(c => (c.aliases || []).some(a => Parser.mentions(d.who, a)))) continue;
    cnt.set(d.who, (cnt.get(d.who) || 0) + 1);
  }
  return [...cnt.entries()].sort((a, b) => b[1] - a[1]);
}

// ---------------------------------------------------------------- экспорт / импорт проекта
function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'text/plain;charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
const safeName = s => (s || 'project').replace(/[\\/:*?"<>|«»]+/g, '').trim().replace(/\s+/g, '_');

async function exportProject(withFiles) {
  const p = JSON.parse(JSON.stringify(S.p));
  if (withFiles) {
    p.blobs = {};
    for (const id of Object.keys(p.assets)) {
      const b = await DB.getBlob(id);
      if (b) p.blobs[id] = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
    }
  }
  download(safeName(S.p.name) + (withFiles ? '_backup' : '') + '.json', JSON.stringify(p), 'application/json');
}

async function importProject(text) {
  const p = JSON.parse(text);
  if (!p.scenes || !p.characters) throw new Error('Это не файл проекта студии');
  p.id = uid(); p.created = Date.now();
  const blobs = p.blobs || {}; delete p.blobs;
  for (const [id, url] of Object.entries(blobs)) await DB.putBlob(id, await (await fetch(url)).blob());
  migrate(p);
  await DB.saveProject(p);
  S.list.unshift(p); S.p = p;
  toast('Проект импортирован' + (Object.keys(blobs).length ? '' : ' (без файлов ассетов)'));
}

// ---------------------------------------------------------------- ИИ
function aiContext() {
  const p = S.p;
  const bible = p.docs.filter(d => d.kind === 'bible').map(d => d.text).join('\n\n').slice(0, 60000);
  const chars = p.characters.filter(c => c.tags).map(c => `${c.name}: ${c.tags}`).join('\n');
  return [bible && 'WORLD BIBLE (Russian):\n' + bible, p.style.style && 'VISUAL STYLE: ' + p.style.style, chars && 'CHARACTER TAG-SETS (use these appearance cues instead of names):\n' + chars].filter(Boolean).join('\n\n');
}

async function busy(label, fn) {
  if (S.busy) return toast('Подождите: ' + S.busy);
  S.busy = label; render();
  try { await fn(); } catch (e) { toast(e.message || String(e)); console.error(e); }
  S.busy = ''; touch(); render();
}

const aiScene = sc => busy(`ИИ описывает сцену ${sc.num}`, async () => {
  const res = await AI.describeScene(sc, aiContext());
  res.forEach(r => { const sh = sc.shots[r.i]; if (sh && !Prompts.noPicture(sh)) { sh.en = r.image; sh.motion = r.motion; } });
});

const aiAllScenes = () => busy('ИИ описывает все сцены', async () => {
  for (const sc of S.p.scenes) {
    if (sc.shots.every(sh => sh.en || Prompts.noPicture(sh))) continue;
    S.busy = `ИИ описывает сцену ${sc.num} из ${S.p.scenes.length}`; render();
    const res = await AI.describeScene(sc, aiContext());
    res.forEach(r => { const sh = sc.shots[r.i]; if (sh && !Prompts.noPicture(sh)) { sh.en = r.image; sh.motion = r.motion; } });
    touch();
  }
});

// ---------------------------------------------------------------- общие элементы
function toast(msg) {
  const box = $('#toasts'), t = h('div', { class: 'toast' }, msg);
  box.append(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => t.remove(), 3500);
}
async function copy(text, what) {
  try { await navigator.clipboard.writeText(text); toast((what || 'Текст') + ' скопирован'); }
  catch (e) { const ta = h('textarea', { value: text }); document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast((what || 'Текст') + ' скопирован'); }
}
const field = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);
const area = (value, onchange, rows, ph) => h('textarea', { rows: rows || 3, placeholder: ph || '', value: value || '', onchange: e => { onchange(e.target.value); touch(); } });
const input = (value, onchange, ph, type) => h('input', { type: type || 'text', placeholder: ph || '', value: value == null ? '' : String(value), onchange: e => { onchange(e.target.value); touch(); } });
const btn = (label, onclick, cls, title) => h('button', { class: cls || '', onclick, title: title || '' }, label);
const fmtDur = s => { s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

function stats() {
  const shots = S.p.scenes.flatMap(sc => sc.shots.filter(sh => !Prompts.noPicture(sh)));
  const all = S.p.scenes.flatMap(sc => sc.shots);
  return {
    scenes: S.p.scenes.length, shots: all.length, dur: all.reduce((a, s) => a + (+s.dur || 0), 0),
    img: shots.filter(s => s.assets.image).length, vid: shots.filter(s => s.assets.video).length, pic: shots.length,
    en: shots.filter(s => s.en).length,
  };
}

// ---------------------------------------------------------------- шапка
function renderHeader() {
  const sel = h('select', { onchange: e => selectProject(e.target.value) },
    S.list.map(p => h('option', { value: p.id, selected: p.id === S.p.id }, p.name)));
  const tabs = [['library', '1 · Материалы'], ['board', '2 · Раскадровка'], ['conveyor', '3 · Конвейер'], ['edit', '4 · Монтаж']];
  const st = stats();
  return h('header', {},
    h('div', { class: 'brand' }, h('span', { class: 'sun' }), 'Студия'),
    sel,
    btn('+', async () => {
      const name = prompt('Название проекта', 'Новый фильм'); if (!name) return;
      await flush();
      const p = newProject(name); await DB.saveProject(p); S.list.unshift(p); selectProject(p.id);
    }, 'ghost', 'Новый проект'),
    btn('✎', () => { const n = prompt('Название проекта', S.p.name); if (n) { S.p.name = n; touch(); render(); } }, 'ghost', 'Переименовать'),
    btn('🗑', async () => {
      if (!confirm(`Удалить проект «${S.p.name}» со всеми файлами?`)) return;
      for (const id of Object.keys(S.p.assets)) DB.delBlob(id);
      await DB.deleteProject(S.p.id);
      S.list = S.list.filter(p => p !== S.p); S.p = null; await loadProjects(); render();
    }, 'ghost', 'Удалить проект'),
    st.pic ? h('span', { class: 'pill', title: 'Готовность: английские описания · картинки · видео' },
      `EN ${st.en}/${st.pic} · 🖼 ${st.img}/${st.pic} · 🎬 ${st.vid}/${st.pic} · ${fmtDur(st.dur)}`) : null,
    h('nav', {}, tabs.map(([k, l]) => h('button', { class: S.tab === k ? 'tab on' : 'tab', onclick: () => { S.tab = k; render(); window.scrollTo(0, 0); } }, l))),
    btn('⚙', openSettings, 'ghost', 'Настройки ИИ'),
  );
}

// ---------------------------------------------------------------- вкладка «Материалы»
function renderLibrary() {
  const p = S.p, st = stats();
  const drop = h('div', { class: 'drop' },
    h('b', {}, 'Перетащите сюда документы и файлы'),
    h('div', { class: 'muted' }, 'Сценарий, каст-библию, библию мира (.md, .txt), проект (.json) или картинки/видео/звук с именами вида S05_03.png'),
    btn('Выбрать файлы', async () => importFiles(await pickFile('.md,.txt,.markdown,.json,image/*,video/*,audio/*', true)), 'primary'));
  dropzone(drop, importFiles);

  const speakers = unknownSpeakers();
  const steps = h('details', { class: 'card howto', open: !p.scenes.length },
    h('summary', {}, 'Как работать'),
    h('ol', {},
      h('li', {}, h('b', {}, 'Материалы. '), 'Перетащите сценарий (.md) — сцены, шоты, реплики и хронометраж разберутся сами. Каст-библия даёт героев, локации и стиль; библия мира — контекст для ИИ.'),
      h('li', {}, h('b', {}, 'Раскадровка. '), 'Проверьте, какие герои в кадре и какая локация у сцены. Кнопка «ИИ: английские описания» переводит действие шотов для генераторов (нужен ключ Claude в ⚙).'),
      h('li', {}, h('b', {}, 'Конвейер. '), 'Шот за шотом: скопируйте промпт → сгенерируйте картинку или видео → вставьте результат Ctrl+V или перетащите файл. Студия сама перейдёт к следующему шоту.'),
      h('li', {}, h('b', {}, 'Монтаж. '), 'Аниматик готов сразу; по мере появления картинок и видео он превращается в фильм. «Записать видео» — и файл у вас.')),
    h('div', { class: 'muted small' }, 'Всё хранится в этом браузере. Делайте «Бэкап с файлами» на вкладке «Монтаж», чтобы перенести проект на другой компьютер.'));
  return h('div', { class: 'page' },
    steps,
    h('section', { class: 'grid2' }, drop,
      h('div', { class: 'card stats' },
        h('h3', {}, p.name),
        h('div', {}, `Сцен: ${st.scenes} · шотов: ${st.shots} · хронометраж ${fmtDur(st.dur)}`),
        meter('Описания EN', st.en, st.pic), meter('Картинки', st.img, st.pic), meter('Видео', st.vid, st.pic),
        h('div', { class: 'row' }, btn('Открыть раскадровку →', () => { S.tab = 'board'; render(); }, 'primary'), btn('ИИ: описать все шоты', aiAllScenes, '', 'Английские описания для всех сцен, где их ещё нет')))),

    h('h2', {}, 'Документы'),
    p.docs.length ? h('div', { class: 'list' }, p.docs.map(d => h('div', { class: 'item' },
      h('span', { class: 'badge ' + d.kind }, ({ script: 'сценарий', cast: 'каст', bible: 'справка' })[d.kind]),
      h('b', {}, d.name), h('span', { class: 'muted' }, `${Math.round(d.text.length / 1000)} тыс. знаков`),
      h('span', { class: 'grow' }),
      h('select', { onchange: e => { d.kind = e.target.value; applyDoc(d); touch(); render(); } },
        ['script', 'cast', 'bible'].map(k => h('option', { value: k, selected: d.kind === k }, ({ script: 'как сценарий', cast: 'как каст-библию', bible: 'как справку' })[k]))),
      btn('Применить заново', () => { applyDoc(d); touch(); render(); toast('Документ перечитан'); }, 'ghost'),
      btn('✕', () => { if (confirm('Убрать документ из проекта? Сцены и герои останутся.')) { p.docs = p.docs.filter(x => x !== d); touch(); render(); } }, 'ghost')))) :
      h('p', { class: 'muted' }, 'Пока пусто.'),

    speakers.length ? h('div', { class: 'card warn' },
      h('b', {}, 'Говорящие в сценарии без героя: '),
      speakers.map(([who, n]) => h('span', { class: 'speaker' }, `${who} (${n}) → `,
        h('select', { onchange: e => { const c = p.characters.find(x => x.id === e.target.value); if (c) { c.aliases = (c.aliases || []).concat(who.charAt(0) + who.slice(1).toLowerCase()); touch(); render(); } } },
          h('option', { value: '' }, 'кто это?'), p.characters.filter(c => !c.variantOf).map(c => h('option', { value: c.id }, c.name)))))) : null,

    h('h2', {}, 'Стиль канала', h('small', {}, ' добавляется в конец каждого промпта')),
    h('div', { class: 'grid3' },
      field('LOOK — камера и плёнка', area(p.style.look, v => { p.style.look = v; }, 6)),
      field('STYLE — палитра и фактуры', area(p.style.style, v => { p.style.style = v; }, 6)),
      field('NEGATIVE — чего не должно быть', area(p.style.negative, v => { p.style.negative = v; }, 6))),

    h('h2', {}, 'Герои', btn('+ герой', () => { p.characters.push({ id: uid(), name: 'Новый герой', aliases: ['Новый герой'], tags: '', prompts: [], variantOf: '', scenes: [], ref: '' }); touch(); render(); }, 'ghost')),
    h('div', { class: 'cards' }, p.characters.map(characterCard)),

    h('h2', {}, 'Локации',
      btn('+ локация', () => { p.locations.push({ id: uid(), name: 'Новая локация', set: '', keywords: '', plate: '', ref: '' }); touch(); render(); }, 'ghost'),
      btn('Создать из заголовков сцен', locationsFromHeadings, 'ghost', 'Для сцен без локации создать локации по их заголовкам'),
      btn('Переназначить сценам', () => { autoLocations(true); touch(); render(); toast('Локации сцен подобраны заново по заголовкам'); }, 'ghost')),
    h('div', { class: 'cards' }, p.locations.map(locationCard)),
  );
}

function meter(label, n, of) {
  const pct = of ? Math.round(100 * n / of) : 0;
  return h('div', { class: 'meter' }, h('span', {}, `${label}: ${n} из ${of}`), h('i', {}, h('b', { style: `width:${pct}%` })));
}

function refSlot(holder, label) {
  const el = h('div', { class: 'ref', title: 'Референс: ' + label, onclick: async () => { const [f] = await pickFile('image/*'); if (f) { await setAsset(holder, 'ref', f); render(); } } },
    holder.ref ? thumb(holder.ref, '') : h('span', {}, '+ референс'));
  dropzone(el, async files => { if (files[0]) { await setAsset(holder, 'ref', files[0]); render(); } });
  return el;
}

function characterCard(c) {
  const p = S.p;
  const base = c.variantOf && p.characters.find(x => x.id === c.variantOf);
  const usedIn = p.scenes.filter(sc => sc.shots.some(sh => Prompts.characters(p, sc, sh).includes(c))).map(sc => sc.num);
  return h('div', { class: 'card' },
    h('div', { class: 'row' }, refSlot(c, c.name),
      h('div', { class: 'grow' },
        input(c.name, v => { c.name = v; }, 'Имя'),
        base ? h('div', { class: 'muted' }, `Вариант героя «${base.name}» для сцен `,
          input(c.scenes.join('–'), v => { const m = v.match(/(\d+)\D+(\d+)/); c.scenes = m ? [+m[1], +m[2]] : []; }, '13–16')) :
          field('Как называют в сценарии (через запятую)', input((c.aliases || []).join(', '), v => { c.aliases = v.split(',').map(s => s.trim()).filter(Boolean); render(); })),
        h('div', { class: 'muted small' }, usedIn.length ? 'В кадре в сценах: ' + [...new Set(usedIn)].join(', ') : 'В сценарии не найден'))),
    field('Тег-сет (EN, вставляется в каждый промпт с героем)', area(c.tags, v => { c.tags = v; }, 4)),
    h('div', { class: 'row wrap' },
      (c.prompts || []).map(pr => btn('⧉ ' + pr.label, () => copy(pr.text, 'Промпт «' + pr.label + '»'), 'chip')),
      !c.tags ? btn('ИИ: тег-сет', () => busy('ИИ пишет тег-сет', async () => { c.tags = await AI.characterTags(c.name, aiContext()); }), 'chip') : null,
      h('span', { class: 'grow' }),
      btn('Удалить', () => { if (confirm('Удалить героя ' + c.name + '?')) { p.characters = p.characters.filter(x => x !== c); dropAsset(c.ref); touch(); render(); } }, 'ghost small')));
}

function locationCard(l) {
  const p = S.p;
  const scenes = p.scenes.filter(sc => sc.locationId === l.id);
  return h('div', { class: 'card' },
    h('div', { class: 'row' }, refSlot(l, l.name),
      h('div', { class: 'grow' }, input(l.name, v => { l.name = v; }, 'Название'),
        field('Ключевые слова для подбора к сценам', input(l.keywords, v => { l.keywords = v; }, 'река, порог, берег')),
        h('div', { class: 'muted small' }, scenes.length ? 'Сцены: ' + scenes.map(s => s.num).join(', ') : 'Не назначена ни одной сцене'))),
    field('SET (EN, вставляется в промпты шотов этой локации)', area(l.set, v => { l.set = v; }, 4)),
    h('div', { class: 'row wrap' },
      l.plate ? btn('⧉ Промпт плейта', () => copy(l.plate, 'Промпт плейта'), 'chip') : null,
      btn(l.set ? 'ИИ: переписать SET' : 'ИИ: написать SET', () => busy('ИИ пишет SET', async () => {
        const txt = scenes.map(sc => `Scene ${sc.num}. ${sc.heading}\n` + sc.shots.map(s => s.text).join('\n')).join('\n\n');
        l.set = await AI.locationSet(l, txt, aiContext());
      }), 'chip'),
      h('span', { class: 'grow' }),
      btn('Удалить', () => { if (confirm('Удалить локацию?')) { p.locations = p.locations.filter(x => x !== l); p.scenes.forEach(s => { if (s.locationId === l.id) s.locationId = ''; }); dropAsset(l.ref); touch(); render(); } }, 'ghost small')));
}

function locationsFromHeadings() {
  const p = S.p; let n = 0;
  for (const sc of p.scenes) {
    if (sc.locationId) continue;
    const place = sc.heading.split(/\s+[-–—]\s+/)[0].trim();
    const name = place.charAt(0) + place.slice(1).toLowerCase();
    let l = p.locations.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (!l) { l = { id: uid(), name, set: '', keywords: '', plate: '', ref: '' }; p.locations.push(l); n++; }
    sc.locationId = l.id;
  }
  touch(); render(); toast(n ? `Создано локаций: ${n}. Допишите SET вручную или кнопкой ИИ.` : 'У всех сцен уже есть локации');
}

// ---------------------------------------------------------------- вкладка «Раскадровка»
function renderBoard() {
  const p = S.p;
  if (!p.scenes.length) return h('div', { class: 'page' }, h('p', { class: 'muted' }, 'Сцен нет. Импортируйте сценарий на вкладке «Материалы».'));
  const sc = p.scenes.find(s => s.id === S.sceneId) || p.scenes[0];
  S.sceneId = sc.id;
  let act = '';
  const side = h('aside', { class: 'scenes' }, p.scenes.map(s => {
    const pics = s.shots.filter(x => !Prompts.noPicture(x));
    const done = pics.filter(x => x.assets.video || x.assets.image).length;
    const head = s.act !== act ? h('div', { class: 'act' }, (act = s.act)) : null;
    return [head, h('button', { class: 'scene' + (s === sc ? ' on' : ''), onclick: () => { S.sceneId = s.id; render(); window.scrollTo(0, 0); } },
      h('b', {}, s.num + '. '), s.heading.split(/\s+[-–—]\s+/)[0],
      h('small', {}, `${s.shots.length} шот. · ${fmtDur(s.shots.reduce((a, x) => a + (+x.dur || 0), 0))} · ${done}/${pics.length}`),
      h('i', { class: 'bar' }, h('b', { style: `width:${pics.length ? 100 * done / pics.length : 0}%` })))];
  }));
  const dur = sc.shots.reduce((a, x) => a + (+x.dur || 0), 0);
  const target = sc.textSec || sc.planSec;
  const main = h('div', { class: 'scene-main' },
    h('div', { class: 'card' },
      h('h2', {}, `Сцена ${sc.num}. ${sc.heading}`),
      h('div', { class: 'muted' }, sc.type),
      h('div', { class: 'row wrap' },
        field('Локация', h('select', { onchange: e => { sc.locationId = e.target.value; touch(); render(); } },
          h('option', { value: '' }, '— без локации —'), p.locations.map(l => h('option', { value: l.id, selected: l.id === sc.locationId }, l.name)))),
        h('div', { class: 'timing' + (target && Math.abs(dur - target) > 3 ? ' off' : '') }, `Длительность ${dur} с`, target ? ` / по сценарию ${target} с` : ''),
        sc.shift ? h('div', { class: 'shift' }, h('b', {}, 'Сдвиг: '), sc.shift) : null),
      sc.notes.length ? h('div', { class: 'notes' }, sc.notes.map(n => h('div', {}, n))) : null,
      sc.narration.length ? field('Закадровый текст сцены (субтитры поверх всех шотов)', area(sc.narration.join('\n'), v => { sc.narration = v.split('\n').filter(Boolean); }, 3)) : null,
      h('div', { class: 'row wrap' },
        btn(S.busy ? S.busy + '…' : 'ИИ: английские описания шотов', () => aiScene(sc), 'primary', 'Claude переводит действие каждого шота в визуальное описание для генераторов'),
        btn('⧉ Все промпты картинок', () => copy(sc.shots.map(sh => `### ${Prompts.code(sc, sh)}\n${Prompts.image(p, sc, sh)}`).filter(s => !/\n$/.test(s)).join('\n\n'), 'Промпты картинок')),
        btn('⧉ Все промпты видео', () => copy(sc.shots.map(sh => `### ${Prompts.code(sc, sh)}\n${Prompts.video(p, sc, sh)}`).filter(s => !/\n$/.test(s)).join('\n\n'), 'Промпты видео')),
        btn('Ассеты пачкой', async () => bulkAssets(await pickFile('image/*,video/*,audio/*', true)), '', 'Файлы с именами S05_03.png, S05_03.mp4 разложатся по шотам'),
        btn('Длительности по сценарию', () => { sc.shots.forEach(s => { if (s.kind !== 'ПАУЗА') s.pinnedDur = false; }); Parser.fitDurations(sc); touch(); render(); }),
        btn('▶ Смотреть сцену', () => { S.range = sc.id; S.tab = 'edit'; render(); }),
        sceneAudioSlot(sc))),
    filterBar(sc),
    sc.shots.map((sh, i) => FILTERS[S.filter].test(sh) ? shotCard(sc, sh, i) : null),
    btn('+ шот', () => { sc.shots.push({ id: uid(), kind: 'СРЕДНИЙ', text: '', sound: '', dialogue: [], dur: 3, pinnedDur: true, characters: null, en: '', motion: '', title: '', assets: {}, override: {} }); touch(); render(); }, 'ghost'));
  dropzone(main, bulkAssets);
  return h('div', { class: 'board' }, side, main);
}

const FILTERS = {
  all: { label: 'Все', test: () => true },
  noimg: { label: 'Без картинки', test: sh => !Prompts.noPicture(sh) && !sh.assets.image && !sh.assets.video },
  novid: { label: 'Без видео', test: sh => !Prompts.noPicture(sh) && !sh.assets.video },
  noen: { label: 'Без описания EN', test: sh => !Prompts.noPicture(sh) && !sh.en },
  talk: { label: 'С репликами', test: sh => sh.dialogue.length > 0 },
};
function filterBar(sc) {
  return h('div', { class: 'row wrap filters' },
    Object.entries(FILTERS).map(([k, f]) => h('button', { class: 'chip' + (S.filter === k ? ' on' : ''), onclick: () => { S.filter = k; render(); } },
      `${f.label} · ${sc.shots.filter(f.test).length}`)),
    h('span', { class: 'grow' }),
    h('span', { class: 'muted small' }, 'Щёлкните по шоту и нажмите Ctrl+V, чтобы вставить картинку или видео из буфера'));
}

function sceneAudioSlot(sc) {
  const id = sc.assets.audio, meta = id && S.p.assets[id];
  return meta ? h('span', { class: 'chip' }, '🔊 ' + meta.name, btn('✕', () => { delete sc.assets.audio; dropAsset(id); touch(); render(); }, 'x')) :
    btn('🔊 Звук сцены', async () => { const [f] = await pickFile('audio/*'); if (f) { await setAsset(sc, 'audio', f); render(); } }, '', 'Закадровый голос или атмосфера на всю сцену');
}

function shotCard(sc, sh, i) {
  const p = S.p;
  const code = Prompts.code(sc, sh);
  const chars = Prompts.characters(p, sc, sh);
  const manual = Array.isArray(sh.characters);
  const picture = !Prompts.noPicture(sh);
  const media = sh.assets.video || sh.assets.image;
  const promptsBox = h('div', { class: 'prompts hidden' });
  const showPrompts = () => {
    promptsBox.classList.toggle('hidden');
    fill(promptsBox, 
      field('Промпт картинки' + (sh.override.image ? ' (изменён вручную)' : ''), area(Prompts.image(p, sc, sh), v => { sh.override.image = v === buildImage() ? '' : v; }, 8)),
      field('Промпт видео' + (sh.override.video ? ' (изменён вручную)' : ''), area(Prompts.video(p, sc, sh), v => { sh.override.video = v === buildVideo() ? '' : v; }, 8)),
      (sh.override.image || sh.override.video) ? btn('Сбросить ручные правки', () => { sh.override = {}; touch(); render(); }, 'ghost small') : null);
  };
  const buildImage = () => Prompts.image(p, sc, Object.assign({}, sh, { override: {} }));
  const buildVideo = () => Prompts.video(p, sc, Object.assign({}, sh, { override: {} }));
  const move = d => { const j = i + d; if (j < 0 || j >= sc.shots.length) return; sc.shots.splice(i, 1); sc.shots.splice(j, 0, sh); touch(); render(); };

  const preview = h('div', { class: 'thumb', title: media ? 'Открыть крупно' : 'Перетащите картинку, видео или звук', onclick: () => media && openViewer(sh, sc) },
    media ? thumb(media, '') : h('div', { class: 'ph' }, picture ? sh.kind : sh.kind === 'ТИТР' ? '«' + (sh.title || '') + '»' : 'чёрный кадр'),
    h('span', { class: 'code' }, code));
  dropzone(preview, async files => { for (const f of files) { const s = slotOf(f.type || guessType(f.name)); if (s) await setAsset(sh, s, f); } render(); });

  const card = h('div', { class: 'shot' + (sh.assets.video ? ' has-video' : sh.assets.image ? ' has-image' : '') + (S.focusShot === sh.id ? ' focus' : ''),
    'data-shot': sh.id, onpointerdown: () => {
      if (S.focusShot === sh.id) return;
      S.focusShot = sh.id;
      document.querySelectorAll('.shot.focus').forEach(x => x.classList.remove('focus'));
      card.classList.add('focus');
    } },
    preview,
    h('div', { class: 'body' },
      h('div', { class: 'row' },
        h('select', { onchange: e => { sh.kind = e.target.value; touch(); render(); } }, Prompts.KINDS.map(k => h('option', { selected: k === sh.kind }, k))),
        h('label', { class: 'dur' }, input(sh.dur, v => { sh.dur = Math.max(0.5, +String(v).replace(',', '.') || 3); sh.pinnedDur = true; render(); }, '', 'number'), 'с'),
        h('span', { class: 'grow' }),
        btn('▶', () => { S.range = 'all'; S.seekShot = sh.id; S.tab = 'edit'; render(); }, 'ghost small', 'Смотреть с этого шота'),
        btn('↑', () => move(-1), 'ghost small'), btn('↓', () => move(1), 'ghost small'),
        btn('✕', () => { if (confirm('Удалить шот ' + code + '?')) { sc.shots.splice(i, 1); Object.values(sh.assets).forEach(dropAsset); touch(); render(); } }, 'ghost small')),
      area(sh.kind === 'ТИТР' ? sh.title : sh.text, v => { if (sh.kind === 'ТИТР') sh.title = v; else sh.text = v; }, 2, sh.kind === 'ТИТР' ? 'Текст титра' : 'Действие в кадре'),
      (sh.dialogue.length || picture) ? area(sh.dialogue.map(d => `${d.who}${d.vo ? ' (V.O.)' : ''}: ${d.line}`).join('\n'), v => {
        sh.dialogue = v.split('\n').map(l => l.match(/^(.+?)\s*(\(V\.O\.\))?\s*:\s*(.+)$/)).filter(Boolean).map(m => ({ who: m[1].trim(), vo: !!m[2], line: m[3].trim() }));
        render();
      }, Math.max(1, sh.dialogue.length), 'Реплики: ГЕРОЙ: текст   или   ГЕРОЙ (V.O.): текст за кадром') : null,
      sh.sound ? h('div', { class: 'muted small' }, '🔉 ' + sh.sound) : null,
      picture ? h('div', { class: 'row wrap chars' },
        p.characters.filter(c => !c.variantOf).map(c => {
          const on = chars.some(x => x === c || x.variantOf === c.id);
          return h('button', { class: 'chip' + (on ? ' on' : ''), onclick: () => {
            const ids = Prompts.characters(p, sc, sh).map(x => x.variantOf || x.id);
            sh.characters = on ? ids.filter(id => id !== c.id) : ids.concat(c.id);
            touch(); render();
          } }, c.name);
        }),
        manual ? btn('авто', () => { sh.characters = null; touch(); render(); }, 'chip ghost', 'Снова определять героев по тексту') : h('span', { class: 'muted small' }, 'герои определены по тексту')) : null,
      picture ? h('div', { class: 'grid2 tight' },
        area(sh.en, v => { sh.en = v; }, 2, 'Кадр по-английски (для генератора). Пусто — пойдёт русский текст'),
        area(sh.motion, v => { sh.motion = v; }, 2, 'Движение в шоте по-английски (для видео)')) : null,
      picture ? h('div', { class: 'row wrap' },
        btn('⧉ Промпт картинки', () => copy(Prompts.image(p, sc, sh), 'Промпт картинки ' + code), 'chip' + (Prompts.isEnglish(Prompts.description(sh)) ? '' : ' warnchip'), Prompts.isEnglish(Prompts.description(sh)) ? '' : 'Описание кадра ещё на русском'),
        btn('⧉ Промпт видео', () => copy(Prompts.video(p, sc, sh), 'Промпт видео ' + code), 'chip'),
        btn('Промпты ▾', showPrompts, 'chip ghost'),
        h('span', { class: 'grow' }),
        ['image', 'video', 'audio'].map(slot => assetSlot(sh, slot))) :
        h('div', { class: 'row' }, assetSlot(sh, 'audio')),
      promptsBox));
  return card;
}

function assetSlot(sh, slot) {
  const icon = { image: '🖼', video: '🎬', audio: '🔊' }[slot];
  const id = sh.assets[slot], meta = id && S.p.assets[id];
  if (!meta) return btn(icon + ' +', async () => { const [f] = await pickFile(slot + '/*'); if (f) { await setAsset(sh, slot, f); render(); } }, 'slot', 'Загрузить ' + { image: 'картинку', video: 'видео', audio: 'звук' }[slot]);
  const fit = slot === 'video' && meta.duration && Math.abs(meta.duration - sh.dur) > 0.2;
  return h('span', { class: 'slot on', title: meta.name },
    icon, meta.duration ? ` ${meta.duration} с` : '',
    fit ? btn('⇔', () => { sh.dur = meta.duration; sh.pinnedDur = true; touch(); render(); }, 'x', 'Длительность шота = длине видео') : null,
    btn('✕', () => { delete sh.assets[slot]; dropAsset(id); touch(); render(); }, 'x', 'Убрать'));
}

// ---------------------------------------------------------------- просмотр ассета крупно
function openViewer(sh, sc) {
  const slots = ['video', 'image'].filter(s => sh.assets[s]);
  let cur = slots[0];
  const box = h('div', { class: 'viewer-media' });
  const show = () => {
    const id = sh.assets[cur], meta = S.p.assets[id];
    const el = h(meta.type.startsWith('video') ? 'video' : 'img', { controls: true, autoplay: true, playsInline: true });
    assetUrl(id).then(u => { el.src = u; });
    fill(box, el, h('div', { class: 'muted small' }, `${meta.name} · ${(meta.size / 1048576).toFixed(1)} МБ` + (meta.duration ? ` · ${meta.duration} с` : '')));
  };
  const dlg = h('dialog', { class: 'viewer' },
    h('div', { class: 'row' }, h('b', {}, `${Prompts.code(sc, sh)} · ${sh.kind}`), h('span', { class: 'muted grow' }, sh.text.slice(0, 120)),
      slots.length > 1 ? slots.map(s => btn(s === 'video' ? '🎬 Видео' : '🖼 Картинка', () => { cur = s; show(); }, 'chip')) : null,
      btn('⬇ Скачать', async () => { const id = sh.assets[cur]; download(S.p.assets[id].name, await DB.getBlob(id)); }, 'ghost'),
      btn('✕', () => dlg.close(), 'ghost')),
    box);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg); dlg.showModal(); show();
}

// ---------------------------------------------------------------- вкладка «Конвейер»
// Работа с внешними генераторами шот за шотом: промпт → результат → следующий шот.
function convQueue() {
  const out = [];
  for (const sc of S.p.scenes) {
    if (S.conv.scene !== 'all' && sc.id !== S.conv.scene) continue;
    for (const sh of sc.shots) if (!Prompts.noPicture(sh)) out.push({ sc, sh });
  }
  return out;
}
const convDone = sh => S.conv.mode === 'image' ? !!(sh.assets.image || sh.assets.video) : !!sh.assets.video;

function convCurrent() {
  const q = convQueue();
  let i = q.findIndex(x => x.sh.id === S.conv.shotId);
  if (i < 0) i = q.findIndex(x => !convDone(x.sh));
  if (i < 0) i = 0;
  return { q, i, cur: q[i] };
}

function convGo(step, onlyTodo) {
  const { q, i } = convCurrent();
  if (!q.length) return;
  let j = i;
  for (let n = 0; n < q.length; n++) {
    j = (j + step + q.length) % q.length;
    if (!onlyTodo || !convDone(q[j].sh)) break;
  }
  S.conv.shotId = q[j].sh.id;
  render();
  if (S.conv.autoCopy) convCopy();
}

function convPrompt(c) { return S.conv.mode === 'image' ? Prompts.image(S.p, c.sc, c.sh) : Prompts.video(S.p, c.sc, c.sh); }
function convCopy() { const { cur } = convCurrent(); if (cur) copy(convPrompt(cur), `Промпт ${Prompts.code(cur.sc, cur.sh)}`); }

async function convAttach(files) {
  const { cur } = convCurrent();
  if (!cur) return;
  let got = false;
  for (const f of files) {
    const slot = slotOf(f.type || guessType(f.name));
    if (slot) { await setAsset(cur.sh, slot, f); got = true; }
  }
  if (!got) return toast('Нужна картинка, видео или звук');
  toast(`${Prompts.code(cur.sc, cur.sh)}: файл добавлен`);
  if (convDone(cur.sh)) {
    const { q, i } = convCurrent();
    const next = q.slice(i + 1).concat(q.slice(0, i)).find(x => !convDone(x.sh));
    if (next) S.conv.shotId = next.sh.id;
  }
  render();
}

function renderConveyor() {
  const p = S.p;
  if (!p.scenes.length) return h('div', { class: 'page' }, h('p', { class: 'muted' }, 'Сначала импортируйте сценарий на вкладке «Материалы».'));
  const { q, i, cur } = convCurrent();
  if (cur) S.conv.shotId = cur.sh.id;
  const left = q.filter(x => !convDone(x.sh)).length;
  const modeBtn = (m, label) => h('button', { class: 'tab' + (S.conv.mode === m ? ' on' : ''), onclick: () => { S.conv.mode = m; S.conv.shotId = null; render(); } }, label);
  const top = h('div', { class: 'row wrap conv-top' },
    modeBtn('image', '🖼 Картинки'), modeBtn('video', '🎬 Видео'),
    h('select', { onchange: e => { S.conv.scene = e.target.value; S.conv.shotId = null; render(); } },
      h('option', { value: 'all' }, 'Все сцены'), p.scenes.map(s => h('option', { value: s.id, selected: S.conv.scene === s.id }, `Сцена ${s.num}. ${s.heading.split(/\s+[-–—]\s+/)[0]}`))),
    h('span', { class: 'pill' }, left ? `Осталось ${left} из ${q.length}` : `Все ${q.length} готовы ✓`),
    h('span', { class: 'grow' }),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: S.conv.autoCopy, onchange: e => { S.conv.autoCopy = e.target.checked; saveUi(); } }), 'копировать промпт при переходе'));
  if (!cur) return h('div', { class: 'page' }, top);
  const { sc, sh } = cur;
  const chars = Prompts.characters(p, sc, sh), loc = Prompts.location(p, sc);
  const desc = Prompts.description(sh);

  const refs = [];
  if (S.conv.mode === 'video' && sh.assets.image) refs.push({ id: sh.assets.image, label: 'Кадр шота (первый кадр для image-to-video)' });
  chars.forEach(c => { const base = p.characters.find(x => x.id === c.variantOf); const ref = c.ref || (base && base.ref); if (ref) refs.push({ id: ref, label: c.name }); });
  if (loc && loc.ref) refs.push({ id: loc.ref, label: loc.name });

  const result = S.conv.mode === 'image' ? (sh.assets.image || sh.assets.video) : sh.assets.video;
  const drop = h('div', { class: 'conv-drop' + (result ? ' done' : '') },
    result ? thumb(result, '') : null,
    h('div', { class: 'conv-drop-hint' },
      h('b', {}, result ? 'Готово. Можно заменить:' : 'Вставьте результат'),
      h('div', {}, 'Ctrl+V из буфера · перетащите файл · ', btn('выбрать файл', async () => convAttach(await pickFile('image/*,video/*,audio/*', true)), 'linkish'))));
  dropzone(drop, convAttach);

  return h('div', { class: 'page conveyor' },
    top,
    h('div', { class: 'conv' },
      h('div', { class: 'card' },
        h('div', { class: 'row' },
          h('span', { class: 'code-big' }, Prompts.code(sc, sh)),
          h('span', {}, `${sh.kind} · ${sh.dur} с`), h('span', { class: 'grow' }),
          h('span', { class: 'muted small' }, `${i + 1} / ${q.length}`)),
        h('div', { class: 'muted small' }, `Сцена ${sc.num}. ${sc.heading}`),
        h('p', { class: 'conv-text' }, sh.text),
        sh.dialogue.length ? h('div', { class: 'conv-dialogue' }, sh.dialogue.map(d => h('div', {}, h('b', {}, d.who + (d.vo ? ' (V.O.)' : '') + ': '), d.line))) : null,
        h('div', { class: 'row wrap' }, chars.map(c => h('span', { class: 'chip on' }, c.name)), loc ? h('span', { class: 'chip' }, '📍 ' + loc.name) : h('span', { class: 'chip warnchip' }, 'локация не выбрана')),
        !Prompts.isEnglish(desc) ? h('div', { class: 'warn small' }, 'Описание кадра на русском. ',
          btn(S.busy ? S.busy + '…' : 'ИИ: описать сцену по-английски', () => aiScene(sc), 'linkish')) : null,
        h('textarea', { class: 'conv-prompt', rows: 12, readOnly: true, value: convPrompt(cur), onfocus: e => e.target.select() }),
        h('div', { class: 'row wrap' },
          btn('⧉ Скопировать промпт', convCopy, 'primary big'),
          btn('✎ Править в раскадровке', () => { S.tab = 'board'; S.sceneId = sc.id; S.focusShot = sh.id; S.filter = 'all'; render(); const el = document.querySelector(`[data-shot="${sh.id}"]`); if (el) el.scrollIntoView({ block: 'center' }); }, 'ghost'))),
      h('div', { class: 'conv-side' },
        drop,
        refs.length ? h('div', { class: 'card' }, h('div', { class: 'muted small' }, 'Референсы для генератора — скачайте и приложите к промпту'),
          h('div', { class: 'refs' }, refs.map(r => h('figure', {},
            thumb(r.id, ''), h('figcaption', {}, r.label),
            btn('⬇', async () => download(S.p.assets[r.id].name, await DB.getBlob(r.id)), 'chip', 'Скачать'))))) :
          h('div', { class: 'muted small' }, 'Совет: загрузите референсы героев и локаций на вкладке «Материалы» — они появятся здесь.'),
        h('div', { class: 'row' },
          btn('← Назад', () => convGo(-1), ''), h('span', { class: 'grow' }),
          btn('Следующий →', () => convGo(1), ''),
          btn('К незаполненному ⇥', () => convGo(1, true), 'primary')),
        h('div', { class: 'muted small' }, 'Клавиши: ← → — шоты, C — скопировать промпт, Ctrl+V — вставить результат.'),
        h('div', { class: 'conv-list' }, q.map((x, j) => h('button', {
          class: 'conv-item' + (j === i ? ' on' : '') + (convDone(x.sh) ? ' ok' : ''), title: x.sh.text,
          onclick: () => { S.conv.shotId = x.sh.id; render(); if (S.conv.autoCopy) convCopy(); } }, Prompts.code(x.sc, x.sh)))))));
}

// ---------------------------------------------------------------- вкладка «Монтаж»
let editKey = '';
function renderEdit() {
  const p = S.p, r = p.render;
  const scenes = S.range === 'all' ? p.scenes : p.scenes.filter(s => s.id === S.range);
  const [w, hgt] = r.size.split('x').map(Number);
  Object.assign(engine.opts, { letterbox: r.letterbox, subs: r.subs, labels: r.labels, fade: r.fade, videoAudio: r.videoAudio, musicVol: r.musicVol });
  if (engine.canvas.width !== w || engine.canvas.height !== hgt) engine.setSize(w, hgt);

  const time = h('span', { class: 'tc' }, '00:00.0');
  const scrub = h('input', { type: 'range', min: 0, max: 1000, value: 0, class: 'grow', oninput: e => engine.seek(engine.duration * e.target.value / 1000) });
  const playBtn = btn('▶', () => S.togglePlay(), 'primary', 'Пробел');
  S.togglePlay = () => {
    if (engine.recording) return;
    if (engine.playing) { engine.stop(); playBtn.textContent = '▶'; }
    else { engine.play(engine.t >= engine.duration - 0.05 ? 0 : engine.t); playBtn.textContent = '❚❚'; }
  };
  const strip = h('div', { class: 'strip', title: 'Щелчок — перейти к шоту. Клавиши: пробел, ← →' });
  const head = h('i', { class: 'playhead' });
  const sceneLabel = h('span', { class: 'muted' });
  engine.onTime = t => {
    time.textContent = fmtTime(t) + ' / ' + fmtTime(engine.duration);
    scrub.value = engine.duration ? Math.round(1000 * t / engine.duration) : 0;
    head.style.left = (engine.duration ? 100 * t / engine.duration : 0) + '%';
    const it = engine.itemAt(t);
    sceneLabel.textContent = it ? `Сцена ${it.scene.num} · ${Prompts.code(it.scene, it.shot)}` : '';
  };
  engine.onEnd = () => { playBtn.textContent = '▶'; };

  const key = JSON.stringify([S.range, scenes.map(s => [s.id, s.narration, s.assets, s.shots.map(x => [x.id, x.dur, x.kind, x.assets, x.dialogue, x.title, x.text])]), p.music]);
  const ready = (key === editKey) ? Promise.resolve() : engine.load(p, scenes).then(() => { editKey = key; });
  ready.then(() => {
    if (S.seekShot) { const it = engine.items.find(x => x.shot.id === S.seekShot); S.seekShot = null; if (it) engine.seek(it.start); }
    const total = engine.duration || 1;
    fill(strip, ...engine.items.map(it => h('div', {
      class: 'blk ' + (it.shot.assets.video ? 'v' : it.shot.assets.image ? 'i' : Prompts.noPicture(it.shot) ? 'b' : 'n') + (it.first ? ' first' : ''),
      style: `width:${100 * it.dur / total}%`, title: `${Prompts.code(it.scene, it.shot)} · ${it.shot.kind} · ${it.dur} с\n${(it.shot.text || '').slice(0, 100)}`,
      onclick: () => engine.seek(it.start) }, it.first ? h('span', {}, it.scene.num) : null)), head);
    engine.onTime(engine.t); engine.draw(engine.t);
  });

  const set = (k, v) => { r[k] = v; touch(); render(); };
  const tog = (k, label) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: r[k], onchange: e => set(k, e.target.checked) }), label);
  const status = h('div', { class: 'rec-status' });
  const st = stats();

  return h('div', { class: 'page edit' },
    h('div', { class: 'stage' }, engine.canvas),
    h('div', { class: 'row transport' }, playBtn, time, scrub, sceneLabel),
    strip,
    h('div', { class: 'legend muted small' }, h('i', { class: 'blk v' }), 'видео', h('i', { class: 'blk i' }), 'картинка', h('i', { class: 'blk n' }), 'карточка аниматика', h('i', { class: 'blk b' }), 'чёрный кадр / титр'),
    h('div', { class: 'grid2' },
      h('div', { class: 'card' },
        h('h3', {}, 'Что монтируем'),
        field('Отрезок', h('select', { onchange: e => { S.range = e.target.value; engine.t = 0; render(); } },
          h('option', { value: 'all', selected: S.range === 'all' }, `Весь фильм (${fmtDur(st.dur)})`),
          p.scenes.map(s => h('option', { value: s.id, selected: S.range === s.id }, `Сцена ${s.num}. ${s.heading.split(/\s+[-–—]\s+/)[0]}`)))),
        h('div', { class: 'muted small' }, `Шоты без картинки и видео показываются карточками аниматика. Картинки — с лёгким наездом камеры. Видео: ${st.vid} из ${st.pic}, картинки: ${st.img} из ${st.pic}.`),
        h('div', { class: 'row wrap' },
          field('Размер', h('select', { onchange: e => set('size', e.target.value) },
            [['1920x1080', '1920×1080 (YouTube 16:9)'], ['1280x720', '1280×720 (быстрее)'], ['3840x2160', '3840×2160 (4K)'], ['1080x1920', '1080×1920 (вертикальное)']]
              .map(([v, l]) => h('option', { value: v, selected: r.size === v }, l)))),
          field('Кадров/с', h('select', { onchange: e => set('fps', +e.target.value) }, [24, 25, 30, 60].map(f => h('option', { value: f, selected: r.fps === f }, f))))),
        h('div', { class: 'row wrap' },
          tog('letterbox', 'Кашетирование 2.39:1'), tog('subs', 'Субтитры'), tog('labels', 'Код шота в записи'), tog('fade', 'Затемнение между сценами'), tog('videoAudio', 'Звук из видеофайлов')),
        h('div', { class: 'row wrap' },
          p.music && p.assets[p.music] ? h('span', { class: 'chip' }, '🎵 ' + p.assets[p.music].name,
            btn('✕', () => { const id = p.music; p.music = ''; dropAsset(id); touch(); render(); }, 'x')) :
            btn('🎵 Фоновая дорожка', async () => { const [f] = await pickFile('audio/*'); if (f) { await setAsset(p, 'music', f); render(); } }),
          p.music ? h('label', { class: 'check' }, 'громкость', h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: r.musicVol, onchange: e => set('musicVol', +e.target.value) })) : null)),
      h('div', { class: 'card' },
        h('h3', {}, 'Готовое видео'),
        h('p', { class: 'muted small' }, `Запись идёт в реальном времени (${fmtDur(engine.duration || st.dur)}), не сворачивайте вкладку. Формат: ${(Engine.mimeType() || 'не поддерживается').split(';')[0]}. Код шота и тайм-код видны только в предпросмотре, в файл не попадают (если не включить слева).`),
        btn('⏺ Записать видео', () => recordVideo(status, playBtn), 'primary big'),
        status,
        h('h3', {}, 'Экспорт'),
        h('div', { class: 'row wrap' },
          btn('Промпты .md', () => download(safeName(p.name) + '_prompts.md', Prompts.markdown(p, scenes), 'text/markdown;charset=utf-8')),
          btn('Шот-лист .csv', () => download(safeName(p.name) + '_shotlist.csv', Prompts.csv(p, scenes), 'text/csv;charset=utf-8')),
          btn('Субтитры .srt', () => download(safeName(p.name) + '.srt', srt())),
          btn('Проект .json', () => exportProject(false)),
          btn('Бэкап с файлами', () => exportProject(true), '', 'Один .json со всеми картинками и видео — может быть большим')))));
}

function srt() {
  const t = s => { const ms = Math.round(s * 1000); const hh = Math.floor(ms / 3600000), mm = Math.floor(ms / 60000) % 60, ss = Math.floor(ms / 1000) % 60; return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
  return engine.subs.slice().sort((a, b) => a.start - b.start).map((s, i) => `${i + 1}\n${t(s.start)} --> ${t(s.end)}\n${s.text}\n`).join('\n');
}

async function recordVideo(status, playBtn) {
  if (engine.playing) engine.stop();
  if (!engine.duration) return toast('Нечего записывать');
  const bar = h('i', {}, h('b', { style: 'width:0%' }));
  const cancel = btn('Остановить', () => engine.cancelRecord && engine.cancelRecord(), 'ghost');
  fill(status, h('div', { class: 'meter' }, h('span', {}, 'Запись…'), bar), cancel);
  playBtn.disabled = true;
  try {
    const blob = await engine.record(0, engine.duration, S.p.render.fps, k => { bar.firstChild.style.width = Math.round(100 * Math.min(1, k)) + '%'; });
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const name = safeName(S.p.name) + (S.range === 'all' ? '' : '_scene') + '.' + ext;
    const url = URL.createObjectURL(blob);
    const player = h('video', { src: url, controls: true, class: 'result' });
    // У WebM из MediaRecorder нет длительности в заголовке — прокручиваем в конец, чтобы браузер её вычислил.
    player.addEventListener('loadedmetadata', () => {
      if (player.duration !== Infinity) return;
      player.addEventListener('timeupdate', () => { player.currentTime = 0; }, { once: true });
      player.currentTime = 1e9;
    });
    fill(status, player,
      h('a', { href: url, download: name, class: 'button primary' }, `⬇ Скачать ${name} (${(blob.size / 1048576).toFixed(1)} МБ)`),
      ext === 'webm' ? h('p', { class: 'muted small' }, 'WebM принимает YouTube. Для MP4: ffmpeg -i ' + name + ' -c:v libx264 -crf 18 -c:a aac out.mp4') : null);
  } catch (e) { fill(status, h('div', { class: 'warn' }, e.message)); }
  playBtn.disabled = false;
}

// ---------------------------------------------------------------- настройки
function openSettings() {
  const s = AI.settings;
  const key = h('input', { type: 'password', value: s.apiKey, placeholder: 'sk-ant-… или ключ сервиса-посредника, например sk-cvc-…', autocomplete: 'off' });
  const base = h('input', { value: s.baseUrl, placeholder: 'пусто — напрямую в Anthropic', autocomplete: 'off', autocapitalize: 'off' });
  const fmt = h('select', {}, [['auto', 'Авто (определится при проверке связи)'], ['anthropic', 'Anthropic (/v1/messages)'], ['openai', 'OpenAI-совместимый (/v1/chat/completions)']]
    .map(([v, l]) => h('option', { value: v, selected: s.apiFormat === v }, l)));
  const models = h('datalist', { id: 'cs-models' }, ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'].map(m => h('option', { value: m })));
  const model = h('input', { value: s.model, list: 'cs-models', placeholder: 'claude-opus-5-5', autocomplete: 'off' });
  const effort = h('select', {}, [['low', 'низкое'], ['medium', 'среднее'], ['high', 'высокое']].map(([v, l]) => h('option', { value: v, selected: s.effort === v }, l)));
  const status = h('div', { class: 'small' });
  const keyHint = h('div', { class: 'muted small' });
  // Ключ шлюза с известным префиксом сам подставляет его адрес.
  const onKey = () => {
    const k = AI.known(key.value);
    if (k && !base.value.trim()) base.value = k.baseUrl;
    keyHint.textContent = k ? `Ключ ${k.name}: запросы пойдут через ${k.baseUrl}` : '';
  };
  key.addEventListener('input', onKey); onKey();
  const values = () => ({ apiKey: key.value.trim(), baseUrl: base.value.trim(), apiFormat: fmt.value, model: model.value.trim() || 'claude-opus-5-5', effort: effort.value,
    detected: base.value.trim() === AI.settings.baseUrl && fmt.value === AI.settings.apiFormat ? AI.settings.detected : '' });
  const test = async () => {
    const before = Object.assign({}, AI.settings);
    AI.save(values());
    fill(status, h('span', { class: 'muted' }, 'Проверяю…'));
    try {
      const r = await AI.ping();
      const list = await AI.models();
      if (list.length) fill(models, ...list.map(m => h('option', { value: m })));
      const claude = list.filter(m => /claude/i.test(m));
      fill(status, h('div', { class: 'ok' }, `✓ Связь есть: ${r.base}, формат ${r.fmt === 'openai' ? 'OpenAI' : 'Anthropic'}, ответ «${r.answer}» за ${(r.ms / 1000).toFixed(1)} с.`),
        list.length ? h('div', { class: 'muted' }, `Моделей у сервиса: ${list.length}` + (claude.length ? ', среди них ' + claude.slice(0, 6).join(', ') + (claude.length > 6 ? '…' : '') : '') + '. Список — в поле «Модель».') : null);
      fmt.value = AI.settings.apiFormat;
    } catch (e) {
      AI.save(before);
      fill(status, h('div', { class: 'warn' }, e.message,
        list404(e) ? h('div', {}, 'Возможно, у сервиса другое название модели. Впишите его в поле «Модель» (как в личном кабинете сервиса).') : null));
    }
  };
  const list404 = e => e.status === 400 || e.status === 404;
  const dlg = h('dialog', {},
    h('h3', {}, 'Подключение к Claude'),
    h('p', { class: 'muted small' }, 'Ключ хранится только в этом браузере. Нужен для кнопок «ИИ»: английские описания шотов, SET локаций, тег-сеты героев. Без ключа работает всё остальное.'),
    field('API-ключ', key), keyHint,
    field('Адрес API (для сервиса-посредника)', base),
    h('div', { class: 'row wrap' }, field('Формат API', fmt), field('Модель', model), models),
    field('Усилие (только при прямом подключении к Anthropic)', effort),
    status,
    h('div', { class: 'row' }, btn('Проверить связь', test), h('span', { class: 'grow' }),
      btn('Отмена', () => dlg.close(), 'ghost'),
      btn('Сохранить', () => { AI.save(values()); dlg.close(); toast('Сохранено'); }, 'primary')));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg); dlg.showModal();
}

// ---------------------------------------------------------------- перетаскивание
function dropzone(el, onFiles) {
  el.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); el.classList.remove('over'); const f = [...e.dataTransfer.files]; if (f.length) onFiles(f); });
}

// ---------------------------------------------------------------- отрисовка
function render() {
  const y = window.scrollY;
  if (S.tab !== 'edit' && engine.playing) engine.stop();
  const body = S.tab === 'library' ? renderLibrary() : S.tab === 'board' ? renderBoard() : S.tab === 'conveyor' ? renderConveyor() : renderEdit();
  saveUi();
  $('#app').replaceChildren(...[renderHeader(), S.busy ? h('div', { class: 'busy' }, S.busy + '…') : null, body].filter(Boolean));
  window.scrollTo(0, y);
}

window.addEventListener('paste', async e => {
  const files = [...((e.clipboardData && e.clipboardData.files) || [])].filter(f => slotOf(f.type || guessType(f.name)));
  if (!files.length) return;
  if (S.tab === 'conveyor') { e.preventDefault(); return convAttach(files); }
  if (S.tab === 'board' && S.focusShot) {
    const sc = S.p.scenes.find(s => s.shots.some(x => x.id === S.focusShot));
    const sh = sc && sc.shots.find(x => x.id === S.focusShot);
    if (!sh) return;
    e.preventDefault();
    for (const f of files) await setAsset(sh, slotOf(f.type || guessType(f.name)), f);
    toast(Prompts.code(sc, sh) + ': файл вставлен');
    render();
  }
});

window.addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input, textarea, select, dialog')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (S.tab === 'edit') {
    if (e.code === 'Space') { e.preventDefault(); S.togglePlay && S.togglePlay(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const it = engine.itemAt(engine.t);
      if (!it) return;
      const back = e.key === 'ArrowLeft' && engine.t - it.start < 0.6;
      const target = e.key === 'ArrowRight' ? engine.items[it.index + 1] : back ? engine.items[it.index - 1] : it;
      if (target) engine.seek(target.start);
    }
  } else if (S.tab === 'conveyor') {
    if (e.key === 'ArrowRight') { e.preventDefault(); convGo(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); convGo(-1); }
    else if (e.key === 'c' || e.key === 'с') convCopy();
  } else if (S.tab === 'board' && (e.key === 'j' || e.key === 'k' || e.key === 'о' || e.key === 'л')) {
    const i = S.p.scenes.findIndex(s => s.id === S.sceneId), d = (e.key === 'j' || e.key === 'о') ? 1 : -1;
    const n = S.p.scenes[i + d];
    if (n) { S.sceneId = n.id; render(); window.scrollTo(0, 0); }
  }
});

window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files.length) importFiles([...e.dataTransfer.files]); });
window.addEventListener('beforeunload', () => { flush(); });

(async () => {
  try { await loadProjects(); } catch (e) { document.body.textContent = 'Не удалось открыть хранилище браузера: ' + e.message; return; }
  render();
})();
