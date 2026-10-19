'use strict';
// Состав проекта: проект может начинаться с любой стадии. При создании студия спрашивает, что уже есть
// (идея, библия, каст-библия, план, сценарий, шот-лист, картинки, видео, озвучка, музыка), сразу принимает файлы
// и выстраивает порядок вкладок: лишние разделы прячутся, в «Разработке» остаются только недостающие шаги.
// Пользуется общими помощниками студии (h, btn, importDoc…), поэтому подключается до studio.js.

const HAVE = [
  { k: 'idea', label: 'Идея', hint: 'о чём фильм, образ, мир', type: 'text', group: 'Разработка' },
  { k: 'world', label: 'Библия мира', hint: 'мир, закон вселенной, герои, визуальный код', type: 'doc', group: 'Разработка' },
  { k: 'cast', label: 'Каст-библия и плейты', hint: 'тег-сеты героев, плейты локаций, LOOK / STYLE / NEGATIVE', type: 'doc', group: 'Разработка' },
  { k: 'plan', label: 'Поэпизодный план', hint: 'список сцен с хронометражем', type: 'doc', group: 'Разработка' },
  { k: 'script', label: 'Сценарий (текст сцен)', hint: '«СЦЕНА 1. МЕСТО - ВРЕМЯ», ракурсы в [скобках], реплики', type: 'doc', group: 'Разработка' },
  { k: 'shots', label: 'Шот-лист', hint: 'карточки «03-01 · крупный · 5 сек»', type: 'doc', group: 'Разработка' },
  { k: 'images', label: 'Картинки кадров', hint: 'файлы с именами S05_03.png', type: 'media', accept: 'image/*', group: 'Производство' },
  { k: 'video', label: 'Видео шотов', hint: 'файлы S05_03.mp4', type: 'media', accept: 'video/*', group: 'Производство' },
  { k: 'voice', label: 'Озвучка', hint: 'записи реплик S05_03.mp3', type: 'media', accept: 'audio/*', group: 'Производство' },
  { k: 'sound', label: 'Музыка и звуки', hint: 'треки, атмосферы, эффекты — в библиотеку звуков', type: 'sound', accept: 'audio/*', group: 'Производство' },
];

const ALL_TABS = ['dev', 'library', 'board', 'conveyor', 'voice', 'sound', 'edit'];
const TAB_NAME = { dev: 'Разработка', library: 'Материалы', board: 'Раскадровка', conveyor: 'Конвейер', voice: 'Озвучка', sound: 'Звук', edit: 'Монтаж' };

// Шаг разработки → что из анкеты его закрывает.
const STEP_HAVE = { world: 'world', cast: 'cast', plan: 'plan', scenes: 'script', shots: 'shots', voices: 'voice' };

// have — уже есть; optional — нужен только чтобы написать то, что уже есть; need — предстоит сделать.
function stepState(k, have) {
  if (!have) return 'need';
  if (have[STEP_HAVE[k]]) return 'have';
  if (k === 'world' && (have.cast || have.plan || have.script)) return 'optional';
  if (k === 'plan' && have.script) return 'optional';
  return 'need';
}

// Порядок вкладок проекта: без сценария начинаем с разработки, со сценарием — с материалов.
function projectTabs(p) {
  const have = p.have;
  if (!have || S.showAllTabs) return ALL_TABS;
  const devNeed = Object.keys(STEP_HAVE).some(k => stepState(k, have) === 'need');
  const tabs = have.script ? ['library', devNeed ? 'dev' : null] : ['dev', 'library'];
  tabs.push('board');
  if (!(have.images && have.video)) tabs.push('conveyor');
  if (!have.voice) tabs.push('voice');
  tabs.push('sound', 'edit');
  return tabs.filter(Boolean);
}

function landingTab(p) {
  const have = p.have || {};
  if (!have.script) return 'dev';
  return p.scenes.length ? 'board' : 'library';
}

// Что, судя по содержимому, в проекте уже есть — для старых проектов, где анкету не заполняли.
function guessHave(p) {
  const kinds = new Set(p.docs.map(d => d.kind));
  const shots = p.scenes.flatMap(sc => sc.shots);
  const dev = p.dev || {};
  return { idea: !!dev.idea, world: kinds.has('bible'), cast: kinds.has('cast'), plan: !!(dev.steps && dev.steps.plan), script: kinds.has('script'),
    shots: !!(dev.steps && dev.steps.shots), images: shots.some(sh => sh.assets.image), video: shots.some(sh => sh.assets.video),
    voice: shots.some(sh => sh.assets.audio), sound: !!(p.sound && p.sound.library && p.sound.library.length) };
}

function openSetup(isNew) {
  const p = isNew ? null : S.p;
  const have = Object.assign({}, p ? (p.have || guessHave(p)) : {});
  const files = {}, texts = {};
  const name = h('input', { type: 'text', value: p ? p.name : 'Новый фильм' });
  const order = h('div', { class: 'muted small setup-order' });
  const showOrder = () => {
    const tabs = projectTabs({ have, scenes: [] });
    const steps = Object.keys(STEP_HAVE).filter(k => stepState(k, have) === 'need').map(k => ({ world: 'библия мира', cast: 'каст-библия', plan: 'план', scenes: 'текст сцен', shots: 'шот-лист', voices: 'голоса' })[k]);
    fill(order, h('b', {}, 'Порядок работ: '), tabs.map(t => TAB_NAME[t] + (t === 'dev' && steps.length ? ` (${steps.join(', ')})` : '')).join(' → '));
  };

  const row = item => {
    const extra = h('div', { class: 'setup-extra' });
    const fillExtra = () => {
      if (!have[item.k]) return fill(extra);
      if (item.type === 'text') return fill(extra, h('textarea', { rows: 3, placeholder: 'Опишите идею — её можно дописать потом в «Разработке»', value: texts.idea || (p && p.dev && p.dev.idea) || '', oninput: e => { texts.idea = e.target.value; } }));
      const picked = files[item.k] || [];
      const pick = async () => {
        const got = await pickFile(item.type === 'doc' ? '.md,.txt,.markdown' : item.accept, item.type !== 'doc');
        if (got.length) { files[item.k] = got; fillExtra(); }
      };
      fill(extra,
        h('div', { class: 'row wrap' },
          btn(item.type === 'doc' ? '📄 Загрузить файл (.md, .txt)' : '📎 Загрузить файлы', pick, 'small'),
          picked.length ? h('span', { class: 'small' }, '✓ ' + picked.map(f => f.name).join(', ')) : h('span', { class: 'muted small' }, item.type === 'doc' ? 'или вставьте текст ниже · можно и позже, на вкладке «Материалы»' : 'можно и позже')),
        item.type === 'doc' && !picked.length ? h('textarea', { rows: 3, placeholder: 'Текст документа (из Google Docs, Word…)', value: texts[item.k] || '', oninput: e => { texts[item.k] = e.target.value; } }) : null);
    };
    fillExtra();
    return h('div', { class: 'setup-item' },
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!have[item.k], onchange: e => { have[item.k] = e.target.checked; fillExtra(); showOrder(); } }),
        h('b', {}, item.label), h('span', { class: 'muted small' }, ' — ' + item.hint)),
      extra);
  };

  let done = false;
  const dlg = h('dialog', { class: 'setup' },
    h('h3', {}, isNew ? 'Новый проект' : 'Что есть в проекте'),
    field('Название', name),
    h('p', { class: 'muted' }, 'Отметьте, что у вас уже есть. Проект может начинаться с любой стадии: студия покажет только нужные разделы в нужном порядке. Документы можно загрузить прямо здесь.'),
    ['Разработка', 'Производство'].map(g => [h('h4', {}, g), HAVE.filter(x => x.group === g).map(row)]),
    order,
    h('div', { class: 'row' },
      h('span', { class: 'grow' }),
      btn('Отмена', () => dlg.close(), 'ghost'),
      btn(isNew ? 'Создать проект' : 'Сохранить', async () => { done = true; dlg.close(); await applySetup(isNew, name.value.trim() || 'Новый фильм', have, files, texts); }, 'primary')));
  showOrder();
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg); dlg.showModal();
}

async function applySetup(isNew, name, have, files, texts) {
  if (isNew) {
    await flush();
    const np = newProject(name); await DB.saveProject(np); S.list.unshift(np); selectProject(np.id);
  } else S.p.name = name;
  const p = S.p;
  p.have = Object.assign({}, have); p.setup = true;
  const read = async k => have[k] ? (files[k] && files[k][0] ? await files[k][0].text() : (texts[k] || '').trim()) : '';
  const done = [];
  if (have.idea && texts.idea != null) devConf().idea = texts.idea.trim();
  // Порядок важен: герои и локации до сценария, сценарий до шот-листа, сцены до файлов.
  for (const k of ['world', 'cast', 'plan', 'script']) {
    const text = await read(k);
    if (!text) continue;
    if (k === 'plan') devConf().steps.plan = text;
    const fileName = files[k] && files[k][0] ? files[k][0].name : `${k}.md`;
    if (k === 'script' && Parser.detectKind(text) !== 'script') { toast('Сценарий не распознан: нужны строки «СЦЕНА 1. МЕСТО - ВРЕМЯ» и ракурсы в квадратных скобках. Он сохранён как справка.'); }
    if (k === 'cast' && Parser.detectKind(text) !== 'cast') { toast('Каст-библия не распознана: нужны блоки кода с SET: / LOOK: / STYLE:. Она сохранена как справка.'); }
    done.push(importDoc(fileName, text));
  }
  const shots = await read('shots');
  if (shots) { devConf().steps.shots = shots; if (p.scenes.length) devApplyShots(); }
  const media = ['images', 'video', 'voice'].flatMap(k => have[k] ? files[k] || [] : []);
  if (media.length) await bulkAssets(media);
  if (have.sound && files.sound && files.sound.length) await soundUpload(files.sound);
  touch();
  S.tab = landingTab(p);
  render(); window.scrollTo(0, 0);
  if (done.length) toast('Загружено: ' + done.join('; '));
}
