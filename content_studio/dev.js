'use strict';
// Разработка: от идеи до документов, с которых начинается производство (логлайн → синопсис → библия мира →
// каст-библия → сценарий), и критика проекта глазами разных специалистов.
// Два способа: помощник в студии (через ИИ из ⚙) или гайд — готовые запросы для своего чата (ChatGPT, Claude, DeepSeek…).
// Пользуется общими помощниками студии (h, btn, busy, importDoc…), поэтому подключается до studio.js.

const FENCE = '```';

const DEV_STEPS = [
  { k: 'logline', title: '1. Логлайн и концепция',
    hint: 'О чём история в одном предложении: герой, цель, препятствие, ставка. Тема, конфликт, жанр, тон, финал.',
    ask: `Предложи 3 разных варианта логлайна (одно предложение: герой, его цель, препятствие, что он теряет при неудаче).
Для лучшего варианта распиши концепцию: тема (о чём на самом деле), главный конфликт, жанр и тон, главный герой и его изменение, финал в одном абзаце, чем история цепляет зрителя.
В конце отметь, какой вариант рекомендуешь и почему.
Оформи в Markdown с заголовком «# Концепция: <рабочее название>».` },
  { k: 'synopsis', title: '2. Синопсис и поэпизодный план',
    hint: 'Пересказ истории на страницу и список сцен с хронометражем.',
    ask: `Напиши синопсис на одну страницу (завязка, развитие, кульминация, развязка) и поэпизодный план:
пронумерованные сцены — место и время, что происходит, чем сцена двигает историю, хронометраж в секундах.
Сумма хронометража сцен должна совпасть с общим хронометражом проекта.
Оформи в Markdown с заголовком «# Синопсис: <название>».` },
  { k: 'world', title: '3. Библия мира', kind: 'bible',
    hint: 'Правила мира, тон, визуальный и звуковой язык, описания локаций. Это справка для ИИ при описании кадров.',
    ask: `Напиши библию мира в Markdown с заголовком «# Библия мира: <название>». Разделы:
## Мир и его правила
## Предыстория
## Тон и темы
## Визуальный язык — палитра, свет, оптика и крупности, движение камеры, фактуры, референсы фильмов и художников
## Звук и музыка
## Локации — по каждой: как выглядит, свет, звук, что там происходит
## Чего в этом мире не бывает
Не используй блоки кода (${FENCE}).` },
  { k: 'cast', title: '4. Каст-библия: стиль, герои, локации', kind: 'cast',
    hint: 'Тег-сеты героев и плейты локаций по-английски для генераторов, плюс общий стиль. Студия разберёт их сама.',
    ask: `Напиши каст-библию СТРОГО в этом формате (его разбирает программа, отступать нельзя):

# Каст-библия: <название>

## Стиль
${FENCE}
LOOK: <по-английски, 25–40 слов: плёнка или цифра, цвет, контраст, зерно, свет>

STYLE: <по-английски, 20–30 слов: жанр картинки, референсы, настроение>

NEGATIVE: <по-английски, через запятую: чего не должно быть в кадре>
${FENCE}

## Герои
**<Имя героя так, как оно пишется в сценарии>**
${FENCE}
<по-английски, 35–50 слов: пол и возраст, телосложение, лицо и особая примета, волосы, глаза, кожа, костюм. Без имени, эмоций и освещения>
${FENCE}

(и так для каждого героя)

## Локации
### Плейт <Название локации>
${FENCE}
SET: <по-английски, 40–60 слов: архитектура или местность, масштаб, материалы, один источник света, погода и воздух. Без людей и надписей>
${FENCE}

(и так для каждой локации)

Внутри блоков кода — только английский текст, вне блоков — только заголовки.` },
  { k: 'script', title: '5. Сценарий', kind: 'script',
    hint: 'Сцены и шоты в формате студии: после «В материалы» они появятся в раскадровке.',
    ask: `Напиши сценарий СТРОГО в этом формате (его разбирает программа):

# <Название> — текст сцен

### СЦЕНА 1. <МЕСТО> - <ВРЕМЯ СУТОК>
**Тип:** статичная  (или: камера движется)
Хронометраж: по плану <секунд> с
[ОБЩИЙ] <что видно в кадре: одно действие, одно-два предложения>
[КРУПНЫЙ] <...>
<ИМЯ ГЕРОЯ>: <реплика — строкой сразу под шотом, в котором её говорят>
<ИМЯ ГЕРОЯ> (V.O.): <реплика за кадром>
РАССКАЗЧИК: <закадровый текст, если он нужен>
[ДЕТАЛЬ] <...> (звук: <важный звук в кадре>)
[ПАУЗА 2] <пауза на 2 секунды>
ЧЁРНЫЙ ЭКРАН. «<титр>»

Правила:
- каждая строка шота начинается с крупности в квадратных скобках: ДЕТАЛЬ, КРУПНЫЙ, СРЕДНИЙ, ОБЩИЙ, ОБЩИЙ С ВЫСОТЫ, МАСТЕР, РАКУРС А, РАКУРС Б, ПАУЗА <секунд>;
- имена в репликах — ЗАГЛАВНЫМИ буквами и так же, как в каст-библии;
- один шот — одно действие длиной 2–6 секунд; сумма хронометража сцен = общий хронометраж;
- в кадре только то, что можно снять: без мыслей и воспоминаний словами.` },
];

const EXPERTS = [
  ['producer', 'Продюсер', 'жизнеспособность идеи, целевая аудитория, реализуемость на ИИ-генераторах, сроки, риски'],
  ['writer', 'Сценарист-драматург', 'структура, конфликт, арки героев, мотивация, диалоги, логика, темп'],
  ['director', 'Режиссёр', 'режиссёрское решение, мизансцены, ритм, атмосфера, цельность высказывания'],
  ['dop', 'Оператор-постановщик', 'крупности, ракурсы, композиция, свет, движение камеры, визуальная непрерывность'],
  ['designer', 'Художник-постановщик', 'локации, декорации, реквизит, палитра, эпоха и правдоподобие мира'],
  ['costume', 'Художник по костюмам и гриму', 'костюмы, грим, узнаваемость и постоянство внешности героев'],
  ['editor', 'Монтажёр', 'длительности шотов, склейки, ритм, переходы, общий хронометраж'],
  ['sound', 'Звукорежиссёр и композитор', 'звуковая драматургия, атмосферы, эффекты, музыка, голоса'],
  ['ai', 'Специалист по ИИ-генерации', 'насколько описания и промпты реализуемы генераторами, постоянство персонажей, риск артефактов'],
  ['viewer', 'Зритель целевой аудитории', 'интерес, понятность, эмоции, где скучно или непонятно'],
];

const CRIT_STAGES = [
  ['idea', 'Идея и концепция'], ['synopsis', 'Синопсис'], ['world', 'Библия мира'], ['cast', 'Каст-библия'],
  ['script', 'Сценарий'], ['board', 'Раскадровка'], ['production', 'Производство: готовые материалы и оценки'],
];

const DEV_FORMATS = ['Короткий метр', 'Реклама', 'Музыкальный клип', 'Трейлер / тизер', 'Серия сериала', 'Полный метр', 'Вертикальное видео', 'Другое'];

function devConf() {
  const d = S.p.dev || (S.p.dev = {});
  d.mode = d.mode || 'ai';
  d.idea = d.idea || '';
  d.params = Object.assign({ format: DEV_FORMATS[0], minutes: '3', genre: '', tone: '', audience: '', refs: '' }, d.params || {});
  d.steps = d.steps || {};
  d.chat = d.chat || [];
  d.critiques = d.critiques || [];
  d.experts = d.experts || EXPERTS.map(e => e[0]);
  return d;
}

const cut = (t, n) => (t = String(t || '')).length > n ? t.slice(0, n) + '\n…(обрезано)' : t;

function devBrief() {
  const d = devConf(), pr = d.params;
  return [`Проект: ${S.p.name}`, `Идея автора: ${d.idea || '(не указана)'}`,
    `Формат: ${pr.format}; хронометраж: ${pr.minutes || '?'} мин.`, pr.genre && `Жанр: ${pr.genre}`, pr.tone && `Тон: ${pr.tone}`,
    pr.audience && `Аудитория: ${pr.audience}`, pr.refs && `Референсы: ${pr.refs}`,
    'Производство: кадры и видео делаются ИИ-генераторами (картинка → видео), озвучка — синтез речи, монтаж в студии. Значит: мало персонажей и локаций, понятные действия в кадре, шоты по 2–6 секунд.'].filter(Boolean).join('\n');
}

// Что уже написано: шаги разработки, а если их нет — документы из «Материалов».
function devDoc(k) {
  const d = devConf();
  if (d.steps[k]) return d.steps[k];
  const kind = { world: 'bible', cast: 'cast', script: 'script' }[k];
  return kind ? S.p.docs.filter(x => x.kind === kind).map(x => x.text).join('\n\n') : '';
}

const DEV_SYSTEM = `Ты — креативный продюсер, сценарист и шоураннер студии, которая делает фильмы и ролики с помощью ИИ-генераторов.
Помогаешь автору пройти путь от идеи до документов для производства. Пишешь по-русски, живо и конкретно, без воды и вступлений вроде «Конечно!».
Уважаешь замысел автора: развиваешь его, а не подменяешь своим. Учитываешь, что каждый кадр будет сгенерирован: история должна сниматься малым числом героев и локаций.`;

function devRequest(step, note) {
  const d = devConf();
  const prev = DEV_STEPS.slice(0, DEV_STEPS.indexOf(step)).map(s => devDoc(s.k) && `=== ${s.title} ===\n${cut(devDoc(s.k), 20000)}`).filter(Boolean);
  const current = d.steps[step.k];
  const user = [devBrief(), prev.length ? 'Уже написано:\n\n' + prev.join('\n\n') : '',
    `Задача — ${step.title}.\n${step.ask}`,
    note && current ? `Вот текущая версия:\n\n${cut(current, 30000)}\n\nПерепиши её с учётом замечания автора: ${note}` : note ? `Учти пожелание автора: ${note}` : ''].filter(Boolean).join('\n\n');
  return { system: DEV_SYSTEM, user };
}

// Для своего чата: системная часть и задача одним текстом.
const asChat = r => r.system + '\n\n' + r.user;

async function devGenerate(step, note) {
  await busy(`Помощник пишет: ${step.title}`, async () => {
    const r = devRequest(step, note);
    const text = await AI.call(Object.assign(r, { maxTokens: 16000 }));
    devConf().steps[step.k] = String(text).trim();
  });
}

function devToMaterials(step) {
  const text = devConf().steps[step.k];
  if (!text) return toast('Сначала напишите или вставьте текст');
  const kind = Parser.detectKind(text);
  if (step.kind === 'script' && kind !== 'script') return toast('Это не похоже на сценарий: нужны строки «### СЦЕНА 1. МЕСТО - ВРЕМЯ». Попросите помощника переписать в формате студии.');
  if (step.kind === 'cast' && kind !== 'cast') return toast('Это не похоже на каст-библию: нужны блоки кода с SET: / LOOK: / STYLE:. Попросите переписать в формате студии.');
  toast('В материалах: ' + importDoc(`razrabotka_${step.k}.md`, text));
  touch(); render();
}

// ---------------------------------------------------------------- критика
function critMaterial(stage) {
  const p = S.p;
  if (stage === 'idea') return devBrief() + '\n\n' + cut(devDoc('logline'), 20000);
  if (stage === 'synopsis' || stage === 'world' || stage === 'cast' || stage === 'script') return cut(devDoc(stage), 60000);
  if (stage === 'board') return cut(p.scenes.map(sc => `### Сцена ${sc.num}. ${sc.heading} (${sc.shots.reduce((a, x) => a + (+x.dur || 0), 0)} с)\n` +
    sc.shots.map(sh => `${Prompts.code(sc, sh)} [${sh.kind}, ${sh.dur} с] ${sh.text || sh.title || ''}` +
      (sh.dialogue.length ? ' / ' + sh.dialogue.map(x => `${x.who}: ${x.line}`).join(' / ') : '') + (sh.en ? `\n   EN: ${sh.en}` : '') + (sh.sound ? `\n   звук: ${sh.sound}` : '')).join('\n')).join('\n\n'), 60000);
  if (stage === 'production') {
    const all = p.scenes.flatMap(sc => sc.shots.map(sh => ({ sc, sh })));
    const cnt = k => all.filter(x => x.sh.assets[k]).length;
    const snd = p.sound || {};
    return [`Шотов: ${all.length}. Картинок: ${cnt('image')}, видео: ${cnt('video')}, звук у шотов: ${cnt('audio')}.`,
      `Музыкальных треков: ${(snd.cues || []).filter(c => c.asset).length}. Сцен с атмосферой: ${p.scenes.filter(sc => sc.ambience && sc.ambience.asset).length}.`,
      'Оценки и заметки команды:', reviewReport(),
      'Раскадровка:', critMaterial('board').slice(0, 30000)].join('\n\n');
  }
  return '';
}

function critRequest(stage, experts) {
  const list = EXPERTS.filter(e => experts.includes(e[0]));
  const stageName = (CRIT_STAGES.find(s => s[0] === stage) || [])[1];
  const system = `Ты собираешь худсовет из опытных специалистов кино- и видеопроизводства. Каждый говорит строго со своей профессиональной точки зрения, честно и конкретно:
называет сильные стороны, проблемы (со ссылкой на конкретное место: сцену, шот, героя) и что именно сделать. Без общих слов и комплиментов ради комплиментов. Пишешь по-русски.
Учитывай, что проект делается ИИ-генераторами картинок и видео, синтезом речи и монтажом в браузерной студии.`;
  const user = `${devBrief()}

Стадия: ${stageName}.

Материал:
${critMaterial(stage) || '(материала для этой стадии пока нет)'}

Эксперты (id — роль — на что смотрит):
${list.map(e => `${e[0]} — ${e[1]} — ${e[2]}`).join('\n')}

Для каждого эксперта: оценка от 1 до 10, итог в 1–2 предложениях, 2–4 сильные стороны, 2–5 проблем, 2–5 конкретных советов.`;
  const schema = { type: 'object', additionalProperties: false, required: ['experts'], properties: { experts: { type: 'array', items: {
    type: 'object', additionalProperties: false, required: ['id', 'score', 'summary', 'strengths', 'problems', 'advice'],
    properties: { id: { type: 'string' }, score: { type: 'integer' }, summary: { type: 'string' },
      strengths: { type: 'array', items: { type: 'string' } }, problems: { type: 'array', items: { type: 'string' } }, advice: { type: 'array', items: { type: 'string' } } } } } } };
  return { system, user, schema };
}

async function devCritique(stage) {
  const d = devConf();
  if (!d.experts.length) return toast('Выберите хотя бы одного эксперта');
  if (!critMaterial(stage).trim() || critMaterial(stage).length < 40) return toast('Для этой стадии пока нет материала');
  await busy('Худсовет читает проект', async () => {
    const r = await AI.call(Object.assign(critRequest(stage, d.experts), { maxTokens: 16000 }));
    const experts = (r.experts || []).map(x => Object.assign(x, { id: String(x.id) }));
    d.critiques.unshift({ id: uid(), stage, at: Date.now(), experts });
    d.critiques = d.critiques.slice(0, 20);
  });
}

// Гайд целиком: можно отдать сценаристу или пройти в любом чате.
function devGuide() {
  const out = [`# Гайд по разработке: ${S.p.name}`, '',
    'Как пользоваться: проходите шаги по порядку в любом чате с ИИ (ChatGPT, Claude, DeepSeek, GigaChat). Каждый шаг — отдельное сообщение. ' +
    'Ответ проверяйте и правьте, затем переходите к следующему шагу в том же чате, чтобы ИИ помнил уже написанное. ' +
    'Готовые библию мира, каст-библию и сценарий перетащите в студию на вкладку «Материалы» как файлы .md.', '',
    '## Роль для ИИ (первое сообщение)', '', DEV_SYSTEM, '', '## Бриф проекта', '', devBrief(), ''];
  DEV_STEPS.forEach(s => out.push(`## ${s.title}`, '', s.hint, '', s.ask, ''));
  out.push('## Критика', '', 'Попросите ИИ разобрать результат с точки зрения специалистов:', '',
    ...EXPERTS.map(e => `- **${e[1]}** — ${e[2]}`), '');
  return out.join('\n');
}

// ---------------------------------------------------------------- вкладка
function renderDev() {
  const d = devConf(), pr = d.params, ai = d.mode === 'ai';
  const set = (k, v) => { pr[k] = v; touch(); };
  const modeBtn = (m, label) => h('button', { class: 'tab' + (d.mode === m ? ' on' : ''), onclick: () => { d.mode = m; touch(); render(); } }, label);

  const head = h('div', { class: 'card' },
    h('h2', {}, 'Разработка проекта'),
    h('p', { class: 'muted' }, 'От идеи до документов, с которых начинается производство: логлайн, синопсис, библия мира, каст-библия и сценарий. Готовые документы одной кнопкой уходят в «Материалы», и студия сама разбирает их на сцены, шоты, героев и локации.'),
    h('div', { class: 'row wrap' }, modeBtn('ai', '🤖 Помощник в студии (через ИИ из ⚙)'), modeBtn('guide', '📋 Гайд: делаю в своём чате'),
      h('span', { class: 'grow' }), btn('📄 Скачать гайд .md', () => download(safeName(S.p.name) + '_gajd.md', devGuide(), 'text/markdown;charset=utf-8'), 'ghost', 'Все шаги, форматы и роль для ИИ одним файлом')),
    ai ? h('p', { class: 'muted small' }, 'Помощник пишет каждый шаг сам, с учётом идеи и уже написанного. Нужен ключ в ⚙ (или режим «Через Chatbox»).')
      : h('p', { class: 'muted small' }, 'У каждого шага кнопка «⧉ Запрос для чата»: вставьте его в ChatGPT, Claude или другой чат, а ответ вставьте в поле шага. Запрос уже содержит идею и всё, что написано на прошлых шагах.'));

  const idea = h('div', { class: 'card' },
    h('h3', {}, 'Идея'),
    area(d.idea, v => { d.idea = v; }, 4, 'О чём ваш фильм? Пара фраз, образ, сцена, которая не отпускает, — с чего всё началось.'),
    h('div', { class: 'row wrap' },
      field('Формат', h('select', { onchange: e => { set('format', e.target.value); } }, DEV_FORMATS.map(f => h('option', { selected: f === pr.format }, f)))),
      field('Хронометраж, мин', input(pr.minutes, v => set('minutes', v), '3')),
      field('Жанр', input(pr.genre, v => set('genre', v), 'драма, триллер, сказка…')),
      field('Тон', input(pr.tone, v => set('tone', v), 'мрачный, ироничный, светлый…')),
      field('Аудитория', input(pr.audience, v => set('audience', v), 'кто будет смотреть'))),
    field('Референсы', input(pr.refs, v => set('refs', v), 'фильмы, художники, клипы, на которые похоже')));

  const steps = DEV_STEPS.map(step => {
    const text = d.steps[step.k] || '', note = h('input', { type: 'text', placeholder: 'Что поправить (например: «короче», «героиня старше», «финал светлее»)', class: 'grow' });
    const imported = step.kind && S.p.docs.some(x => x.file === `razrabotka_${step.k}.md`);
    return h('div', { class: 'card dev-step' + (text ? ' done' : '') },
      h('div', { class: 'row wrap' }, h('h3', { class: 'grow' }, step.title),
        text ? h('span', { class: 'chip' }, `${text.length} зн.`) : h('span', { class: 'muted small' }, 'пусто'),
        imported ? h('span', { class: 'chip', title: 'Документ уже в «Материалах»' }, '✓ в материалах') : null),
      h('div', { class: 'muted small' }, step.hint),
      area(text, v => { d.steps[step.k] = v; render(); }, text ? 12 : 3, ai ? 'Здесь появится текст помощника. Его можно править.' : 'Вставьте сюда ответ из своего чата.'),
      h('div', { class: 'row wrap' },
        ai ? btn(S.busy ? S.busy + '…' : text ? '↻ Написать заново' : '🤖 Написать', () => devGenerate(step), text ? '' : 'primary') : null,
        btn('⧉ Запрос для чата', () => copy(asChat(devRequest(step, note.value.trim())), 'Запрос'), ai ? 'ghost' : 'primary', 'Скопировать запрос для ChatGPT, Claude или другого чата'),
        step.kind ? btn('→ В материалы', () => devToMaterials(step), '', 'Отправить документ в «Материалы»: студия разберёт его') : null),
      text ? h('div', { class: 'row' }, note,
        ai ? btn('✎ Поправить', () => { if (!note.value.trim()) return toast('Напишите, что поправить'); devGenerate(step, note.value.trim()); }, '') : null) : null);
  });

  const qa = h('textarea', { rows: 2, placeholder: 'Спросите помощника о чём угодно по проекту: «как сократить до 2 минут?», «придумай имя героине», «чем заменить сцену в метро?»' });
  const chat = ai ? h('div', { class: 'card' },
    h('h3', {}, 'Помощник'),
    d.chat.slice(-8).map(m => h('div', { class: 'dev-msg' }, h('div', { class: 'small muted' }, '— ' + m.q), h('div', { class: 'dev-answer' }, m.a))),
    qa,
    h('div', { class: 'row' }, btn(S.busy ? S.busy + '…' : 'Спросить', () => {
      const q = qa.value.trim();
      if (!q) return;
      busy('Помощник думает', async () => {
        const ctx = DEV_STEPS.map(s => devDoc(s.k) && `=== ${s.title} ===\n${cut(devDoc(s.k), 12000)}`).filter(Boolean).join('\n\n');
        const recent = d.chat.slice(-4).map(m => `Автор: ${m.q}\nПомощник: ${m.a}`).join('\n\n');
        const a = await AI.call({ system: DEV_SYSTEM, user: `${devBrief()}\n\n${ctx}\n\n${recent ? 'Недавний разговор:\n' + recent + '\n\n' : ''}Вопрос автора: ${q}`, maxTokens: 8000 });
        d.chat.push({ q, a: String(a).trim(), at: Date.now() });
        d.chat = d.chat.slice(-30);
      });
    }, 'primary'), d.chat.length ? btn('Очистить', () => { d.chat = []; touch(); render(); }, 'ghost small') : null)) : null;

  const stageSel = h('select', {}, CRIT_STAGES.map(([k, l]) => h('option', { value: k, selected: k === S.critStage }, l)));
  stageSel.onchange = () => { S.critStage = stageSel.value; };
  const expert = id => EXPERTS.find(e => e[0] === id) || [id, id, ''];
  const crit = h('div', { class: 'card' },
    h('h3', {}, 'Критика: худсовет экспертов'),
    h('p', { class: 'muted small' }, 'Покажите проект специалистам на любой стадии. Каждый оценит со своей стороны и скажет, что исправить. Это мнение ИИ в роли эксперта, а не приговор.'),
    h('div', { class: 'row wrap' }, field('Что смотрим', stageSel)),
    h('div', { class: 'row wrap experts' }, EXPERTS.map(([id, label, what]) => h('label', { class: 'check', title: what },
      h('input', { type: 'checkbox', checked: d.experts.includes(id), onchange: e => { d.experts = e.target.checked ? d.experts.concat(id) : d.experts.filter(x => x !== id); touch(); } }), label)),
      btn('все', () => { d.experts = EXPERTS.map(e => e[0]); touch(); render(); }, 'ghost small'), btn('никого', () => { d.experts = []; touch(); render(); }, 'ghost small')),
    h('div', { class: 'row wrap' },
      ai ? btn(S.busy ? S.busy + '…' : '🎓 Получить критику', () => devCritique(stageSel.value), 'primary') : null,
      btn('⧉ Запрос для чата', () => { const r = critRequest(stageSel.value, d.experts); copy(r.system + '\n\n' + r.user + '\n\nОтветь текстом: по разделу на каждого эксперта.', 'Запрос на критику'); }, ai ? 'ghost' : 'primary')),
    d.critiques.map(c => h('details', { class: 'crit', open: c === d.critiques[0] },
      h('summary', {}, `${(CRIT_STAGES.find(s => s[0] === c.stage) || [])[1]} · ${new Date(c.at).toLocaleString('ru-RU')} · средняя оценка ${(c.experts.reduce((a, x) => a + (+x.score || 0), 0) / Math.max(1, c.experts.length)).toFixed(1)}`,
        btn('✕', e => { e.preventDefault(); d.critiques = d.critiques.filter(x => x !== c); touch(); render(); }, 'ghost small', 'Удалить')),
      h('div', { class: 'crit-grid' }, c.experts.map(x => h('div', { class: 'crit-card score-' + (x.score >= 8 ? 'ok' : x.score >= 5 ? 'fix' : 'redo') },
        h('div', { class: 'row' }, h('b', { class: 'grow' }, expert(x.id)[1]), h('span', { class: 'crit-score' }, (+x.score || 0) + '/10')),
        h('p', {}, x.summary),
        x.strengths && x.strengths.length ? [h('div', { class: 'small muted' }, 'Сильные стороны'), h('ul', {}, x.strengths.map(t => h('li', {}, t)))] : null,
        x.problems && x.problems.length ? [h('div', { class: 'small muted' }, 'Проблемы'), h('ul', {}, x.problems.map(t => h('li', {}, t)))] : null,
        x.advice && x.advice.length ? [h('div', { class: 'small muted' }, 'Что сделать'), h('ul', {}, x.advice.map(t => h('li', {}, t)))] : null))))));

  return h('div', { class: 'page dev' }, head, idea, steps, chat, crit);
}
