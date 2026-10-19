'use strict';
// Разработка по шаблону, которым сделана серия «Но пасаран»: библия мира → каст-библия и плейты →
// поэпизодный план → текст сцен → шот-лист → голоса. Промпты STILL/MOTION студия потом собирает сама.
// Два способа: помощник в студии (через ИИ из ⚙) или гайд — готовые запросы для своего чата.
// К идее можно приложить фото, видео и аудио: картинки и кадры из видео уходят ИИ вместе с запросом.
// Пользуется общими помощниками студии (h, btn, busy, importDoc…), поэтому подключается до studio.js.

const FENCE = '```';

// Визуальные константы шаблона: идут дословно в конец каждого промпта.
const NP_LOOK = 'Live-action feature film still, shot on ARRI Alexa 35 with anamorphic lenses, 2.39:1 widescreen composition, 24 fps. One motivated light source per scene, no fill light, deep true blacks, faces half in shadow. Volumetric haze in every interior, visible light beams, far background dissolving into darkness. Shallow depth of field on people, sharp eyes, soft background. Subtle 35mm film grain, gentle halation on highlights, mild anamorphic streaks on light sources. Minimal set dressing: bare walls, empty space. Photographed, not rendered: real skin pores, cloth weave, dust in the air, condensation.';
const NP_NEGATIVE = 'no music, no soundtrack, no score, no background music, no singing, no humming; bright even lighting, flat lighting, fill light, oversaturated colors, neon, glossy CGI, video game render, 3D render look, plastic skin, airbrushed faces; text, letters, numbers, signage, stickers, labels, posters, logos, watermark, subtitles, HUD, readable screens; busy cluttered set, extra fingers, distorted faces, deformed hands, extra limbs, duplicated character, morphing face, mouth not matching speech, cartoon, anime, illustration.';

const DEV_STEPS = [
  { k: 'world', title: '1. Библия мира', role: 'шоураннер', kind: 'bible', images: true,
    hint: 'Пишется один раз и вставляется в каждый следующий шаг — иначе второй фильм окажется из другой вселенной.',
    ask: () => `Собери БИБЛИЮ МИРА канала в Markdown с заголовком «# Библия мира: <название>»:
## 1. Мир — где происходит действие, какая эпоха, что случилось до начала истории (2–3 абзаца, конкретно).
## 2. Закон вселенной — одно жёсткое правило, по которому живёт мир (кто платит цену, за что, чем). Из него растут все конфликты канала.
## 3. Фракции — 2–4 силы со своими интересами, чтобы конфликт не сводился к «хороший против плохого».
## 4. Сквозные герои — 3–5 персонажей, которые переходят из фильма в фильм. На каждого: имя, возраст, внешность подробно, характер, чего хочет, чего боится, как говорит (темп, лексика, любимая присказка).
## 5. Визуальный код — палитра из 5 цветов, источник и температура света, фактуры, 3–5 повторяющихся образов-символов канала.
## 6. Банк из 10 сюжетов — нумерованный список, по одной строке: завязка, кто против кого, чем цепляет.
## Запреты — не копируй имена, расы и технологии известных франшиз; никаких реальных брендов; мир держится на своём законе, а не на отсылках.
Не используй блоки кода.` },
  { k: 'cast', title: '2. Каст-библия и плейты', role: 'художник-постановщик', kind: 'cast', images: true,
    hint: 'Готовые промпты для Nano Banana 2, чтобы герои не меняли лицо от кадра к кадру, а локации — геометрию.',
    ask: () => `Ты — художник-постановщик этого канала. По библии мира собери КАСТ-БИБЛИЮ И ПЛЕЙТЫ: готовые промпты для Nano Banana 2.
1. СТИЛЬ КАНАЛА: одна строка на английском из визуального кода библии — палитра приглушёнными цветами, кожа, 2–3 фактуры, откуда в кадре берётся тепло, правило костюмов. Кадр тёмный, насыщенность низкая.
2. ТЕГ-СЕТ каждого сквозного героя: одна строка на английском, 35–50 слов — пол и возраст, телосложение, лицо и особая примета, волосы, глаза, кожа, основной костюм. Без имени, эмоций и света.
3. ЛИСТ ПЕРСОНАЖА на каждого героя: пять ракурсов в одном кадре (анфас, три четверти, профиль, в полный рост, крупно лицо), нейтральное лицо, один мягкий студийный свет сверху слева, ровный тёмно-серый фон.
4. ЭТАЛОН ГЕРОЯ В СЦЕНЕ на каждого героя: первая строка — использовать приложенный лист персонажа как референс лица и костюма. Средний крупный план, 85mm, лицо в центральной полосе кадра 2.39:1 внутри 16:9. Один жёсткий источник света из мира героя (конкретно что светит и откуда), вторая половина лица в глубокой тени. Место — где герой проводит больше всего времени, фон тает в дымке и темноте.
5. ПЛЕЙТЫ трёх главных локаций из библии. На каждую сначала SET на английском, 40–60 слов: материалы, масштаб, единственный источник света, что мокрое или пыльное, один символ мира едва виден в темноте. Потом один промпт на три отдельных кадра одного места при одном свете: МАСТЕР (сверхобщий 24mm, две фигуры силуэтами посередине, источник света в кадре), РАКУРС А (через плечо 50mm, плечо слева в расфокусе, лиц нет), РАКУРС Б (зеркально, плечо справа, свет с той же стороны).

Правила:
- все промпты на английском, каждый в своём блоке кода, самодостаточный: копируется в Nano Banana 2 целиком;
- тег-сет и SET вставляются в промпты дословно;
- имена, названия мира и фракций в промпты не писать — генератор нарисует их буквами;
- в конец каждого промпта дословно: LOOK, строка стиля канала, NEGATIVE (ниже).

LOOK: ${devConf().look}
NEGATIVE: ${devConf().negative}

ОФОРМЛЕНИЕ СТРОГО ТАКОЕ (его разбирает программа):

# Каст-библия: <название>

## Стиль канала
${FENCE}
STYLE: <строка стиля канала>

LOOK: <LOOK дословно>

NEGATIVE: <NEGATIVE дословно>
${FENCE}

## Герои
**<ИМЯ как в библии>**
${FENCE}
<тег-сет>
${FENCE}
**<ИМЯ> — лист**
${FENCE}
<промпт листа персонажа>
${FENCE}
**<ИМЯ> — эталон в сцене**
${FENCE}
<промпт эталона>
${FENCE}

## Локации
### Плейт <Название локации>
${FENCE}
SET: <SET>
${FENCE}
${FENCE}
<промпт на три кадра МАСТЕР / РАКУРС А / РАКУРС Б>
${FENCE}` },
  { k: 'plan', title: '3. Поэпизодный план', role: 'сценарист', kind: 'bible', story: true,
    hint: 'Три акта по сюжету из банка: поворот каждые 8–12 минут, у каждого героя в сцене своя цель.',
    ask: () => `Ты — сценарист этого канала. Библия мира — закон. Героев и локации бери из каст-библии. Жанр, язык и хронометраж — из формата канала.

Сюжет фильма: ${devStory()}

Собери ПОЭПИЗОДНЫЙ ПЛАН на три акта в Markdown с заголовком «# Поэпизодный план: <название фильма>».
АКТ 1 (завязка, ~25% времени): открывайся сценой, а не объяснением. Первые 20–30 секунд без слов — действие, погоня или место, и сразу конфликт. Дальше мир глазами героя, событие, которое ломает его привычную жизнь, и точка невозврата в конце акта.
АКТ 2 (противостояние, ~50%): давление растёт, союзник оказывается не тем, кем казался, в середине герой проваливается и меняет метод.
АКТ 3 (расплата, ~25%): кульминация, где герой платит цену по закону вселенной, и финал с крючком на следующий фильм.

Для каждой сцены: номер, локация, время суток, кто в кадре, тип сцены (ЭКШЕН / ДИАЛОГ / НАРРАТОР-МОНТАЖ), что происходит одной фразой, чем сцена заканчивается, хронометраж.

Обязательно:
- поворот каждые 8–12 минут экранного времени;
- локации по возможности из трёх плейтов каст-библии; новую локацию помечай НОВАЯ, нового героя НОВЫЙ — на них понадобятся свои плейты и листы;
- у каждого героя в каждой сцене своя цель, а не просто присутствие;
- герои не объясняют мир в диалогах, историю мира даёт нарратор: 1–2 нарратор-монтажа на фильм;
- в конце плана одной строкой: что фильм обещает зрителю и в какой сцене это случается в кадре.` },
  { k: 'scenes', title: '4. Текст сцен', role: 'сценарист', kind: 'script', batch: true,
    hint: 'Пишется порциями по три сцены. Студия разберёт сцены на шоты по ракурсам в квадратных скобках.',
    ask: range => `Ты — сценарист этого канала. Пиши текст сцен по поэпизодному плану. Библия мира и каст-библия — закон. Язык реплик — как в плане.

Пиши сцены: ${range}

ФОРМАТ КАЖДОЙ СЦЕНЫ (его разбирает программа — строки и метки как в образце):
### СЦЕНА N. ЛОКАЦИЯ - ВРЕМЯ СУТОК
**Тип:** ЭКШЕН (без слов, камера движется) / ДИАЛОГ (камера стоит) / НАРРАТОР-МОНТАЖ (закадровый текст поверх общих планов)
РАКУРС А = через плечо [кого] на [кого], РАКУРС Б = зеркально.   ← только в диалоговых сценах, в начале
[РАКУРС] Что видно и слышно в кадре, 2–3 предложения.
[РАКУРС] ИМЯ: реплика. (звук в кадре: ...)
НАРРАТОР (V.O.): только в сценах НАРРАТОР-МОНТАЖ.
ИМЯ (V.O.): голос героя за кадром, например письмо.
[ПАУЗА 8 сек] что в кадре во время паузы
Сдвиг: кто-то что-то узнал, потерял или решил.
Хронометраж: по плану X с / по тексту Y с

ПРАВИЛА:
- ракурс в квадратных скобках перед каждой репликой и каждой сменой картинки, теми же словами, что плейты каст-библии: [МАСТЕР] в начале сцены, дальше чередуй [РАКУРС А] / [РАКУРС Б], [КРУПНЫЙ] на ключевой фразе, [ДЕТАЛЬ] на выходе из сцены; в экшене: [ОБЩИЙ С ВЫСОТЫ], [ОБЩИЙ], [СРЕДНИЙ], [КРУПНЫЙ], [ДЕТАЛЬ];
- внешность и костюмы героев только из тег-сетов каст-библии, новых деталей не добавляй;
- реплика 6–14 слов, длиннее 18 — режь на две. Говорят медленно и низко. Манеру, лексику и присказки каждого героя держи по библии;
- герои не объясняют мир друг другу. Историю мира даёт нарратор: абзац 40–70 слов на монтаж из 8–12 общих планов. В нарратор-монтаже только места и силуэты, без крупных лиц новых персонажей;
- первые 20–30 секунд фильма без слов;
- в диалоге речь занимает около 70% времени, остальное — картинка и звук места. После узлового момента пауза 8–16 секунд: [ПАУЗА N сек];
- каждая сцена заканчивается сдвигом: кто-то что-то узнал, потерял или решил;
- имена в репликах ЗАГЛАВНЫМИ. Расхождение хронометража больше 20% — сокращай текст, а не план.
Если этой порцией закончен весь план, последней строкой напиши: ПЛАН ЗАВЕРШЁН` },
  { k: 'shots', title: '5. Шот-лист', role: 'режиссёр монтажа', batch: true,
    hint: 'Каждый шот — карточка с ракурсом, плейтом, героями и длительностью. «→ В раскадровку» перестроит шоты сцен по ней.',
    ask: range => `Ты — режиссёр монтажа этого канала. Разложи сценарий на шоты для генерации видео. Каст-библия и плейты — закон.

Сцены: ${range}

Без таблиц и блоков кода. Каждый шот — отдельная карточка, между карточками пустая строка:

03-01 · сверху · 3 сек
Плейт: Зал реестра МАСТЕР
В кадре: Isaure
Действие: Изор идёт по проходу между скамьями
Реплика: -
Камера: стоит · Режим: СТИЛЛ→ВИДЕО

Что значит каждое поле:
- №: номер сцены и шота через дефис (03-05 = сцена 3, шот 5). Это же имя файла на генерации;
- ПЛАН: сверхобщий / общий / средний / РАКУРС А / РАКУРС Б / крупный / сверхкрупный / деталь / сверху / снизу / POV;
- ПЛЕЙТ: с какого плейта генерится стилл — локация + МАСТЕР, А или Б. Нет подходящего — НЕТ;
- В КАДРЕ: имена героев, чей эталон прикладывать к стиллу;
- ДЕЙСТВИЕ: одно действие одной фразой. Два действия — это два шота;
- РЕПЛИКА: ИМЯ: текст реплики, или «-»;
- КАМЕРА: стоит / медленный наезд / дрейф / движение;
- РЕЖИМ: СТИЛЛ→ВИДЕО для всех шотов с лицом или локацией с плейтом. ТЕКСТ→ВИДЕО только для шотов без лиц: туман, ландшафт, толпа издали;
- СЕК: длительность.

ПРАВИЛА:
- ритм эталона: медиана шота 5 секунд, РАКУРС А и Б 5–8 секунд, детали 1–3 секунды. Длиннее 8 секунд шот не бывает: длинную реплику режь на два шота со сменой ракурса;
- сцена открывается сверхобщим или общим. В диалоге второй шот — МАСТЕР с обоими героями;
- ракурсы реплик бери из строки «РАКУРС А = …» сценария. Реплика и ответ — разные ракурсы с одной стороны линии;
- крупный и сверхкрупный только на решение, реакцию и ключевую реплику. Деталь — на выходе из сцены;
- в сцене длиннее минуты все восемь планов; соседние шоты разной крупности;
- в диалоге камера стоит. Движение камеры только в экшене и на пролётах;
- в одном шоте максимум две фразы реплики, и они влезают в его секунды: 2–2,5 слова в секунду плюс пауза до и после;
- паузы из сценария — отдельные шоты без реплик: реакция, деталь или общий;
- в конце каждой сцены строка: «Шотов: N. Сумма: X сек / хронометраж сцены Y сек».
Если этой порцией закончен весь сценарий, последней строкой напиши: ПЛАН ЗАВЕРШЁН` },
  { k: 'voices', title: '6. Голоса героев', role: 'оператор-постановщик и режиссёр',
    hint: 'По строке на героя: по ней создаётся голос во Flow, и она же идёт в каждую его реплику в промптах MOTION.',
    ask: () => `Ты — оператор-постановщик и режиссёр этого канала. ГОЛОСА: на каждого героя с репликами одна строка на английском — пол, возраст, тембр, темп, акцент, манера.
По ней создаётся свой голос героя во Flow, и она же дословно идёт в каждую его реплику.
Звучание всего фильма: тихо, низко, близко к микрофону, местами почти шёпот, медленно, с паузами, грудной резонанс, сдержанная интонация без актёрского нажима.
Характер героя по библии сохраняй внутри этого звучания. Имён актёров и названий фильмов не пиши, только описание звука.
Отдельной строкой — голос нарратора для ElevenLabs в том же звучании.

Формат строго по строке на голос, без пояснений:
ИМЯ: <описание голоса на английском>
НАРРАТОР: <описание голоса на английском>` },
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
  ['idea', 'Идея и вложения'], ['world', 'Библия мира'], ['cast', 'Каст-библия и плейты'], ['plan', 'Поэпизодный план'],
  ['scenes', 'Текст сцен'], ['board', 'Раскадровка'], ['production', 'Производство: готовые материалы и оценки'],
];

const DEV_FORMATS = ['16:9 горизонтальный, полный метр 20–30 минут', '16:9 горизонтальный, короткий метр 5–15 минут', '16:9, музыкальный клип 3–4 минуты',
  '16:9, реклама 30–60 секунд', '9:16 вертикальный, 1–3 минуты', 'Другое'];

function devConf() {
  const d = S.p.dev || (S.p.dev = {});
  d.mode = d.mode || 'ai';
  d.idea = d.idea || '';
  d.params = Object.assign({ genre: '', visual: '', mood: '', audience: '', lang: 'русский', format: DEV_FORMATS[0], story: '' }, d.params || {});
  d.look = d.look || NP_LOOK;
  d.negative = d.negative || NP_NEGATIVE;
  d.steps = d.steps || {};
  d.refs = d.refs || [];
  d.chat = d.chat || [];
  d.critiques = d.critiques || [];
  d.experts = d.experts || EXPERTS.map(e => e[0]);
  return d;
}

const cut = (t, n) => (t = String(t || '')).length > n ? t.slice(0, n) + '\n…(обрезано)' : t;
const devStory = () => { const s = devConf().params.story.trim(); return /^\d+$/.test(s) ? `№ ${s} из банка сюжетов библии.` : s || 'выбери самый сильный из банка сюжетов библии и назови его номер.'; };

// ---------------------------------------------------------------- вложения к идее
const REF_KIND = { image: '🖼 фото', video: '🎬 видео', audio: '🎵 аудио' };
const refKind = id => ((S.p.assets[id] || {}).type || '').split('/')[0];

async function devAttach(files) {
  const d = devConf();
  let n = 0;
  for (const f of files) {
    const kind = (f.type || guessType(f.name)).split('/')[0];
    if (!REF_KIND[kind]) { toast(f.name + ': можно прикрепить фото, видео или аудио'); continue; }
    d.refs.push({ id: await addAsset(f), note: '' });
    n++;
  }
  if (n) { touch(); toast('Прикреплено: ' + n); }
  render();
}

function devRefList() {
  const refs = devConf().refs.filter(r => S.p.assets[r.id]);
  if (!refs.length) return '';
  return 'К идее приложены материалы:\n' + refs.map((r, i) => {
    const m = S.p.assets[r.id];
    return `${i + 1}. ${REF_KIND[refKind(r.id)]} «${m.name}»${m.duration ? `, ${m.duration} с` : ''}${r.note ? ' — ' + r.note : ''}`;
  }).join('\n') + '\nФото и кадры из видео приложены картинками; по ним бери настроение, внешность, места и свет. Аудио задаёт звучание и музыку.';
}

// Кадры из видео: три момента (начало, середина, конец) уменьшенными JPEG.
async function videoFrames(id, n = 3) {
  const url = await assetUrl(id);
  const v = h('video', { muted: true, playsInline: true, preload: 'auto' });
  v.src = url;
  await new Promise(r => { v.onloadeddata = r; v.onerror = r; setTimeout(r, 8000); });
  const out = [];
  for (let i = 0; i < n && v.duration; i++) {
    v.currentTime = v.duration * (0.15 + 0.7 * i / Math.max(1, n - 1));
    await new Promise(r => { v.onseeked = r; setTimeout(r, 4000); });
    const k = Math.min(1, 768 / Math.max(v.videoWidth, v.videoHeight || 1));
    const c = h('canvas', { width: Math.round(v.videoWidth * k), height: Math.round(v.videoHeight * k) });
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    out.push({ mime: 'image/jpeg', b64: c.toDataURL('image/jpeg', 0.85).split(',')[1] });
  }
  return out;
}

// Картинки для ИИ: фото и кадры из видео, не больше 10.
async function devImages() {
  const out = [];
  for (const r of devConf().refs.filter(x => S.p.assets[x.id])) {
    if (out.length >= 10) break;
    try {
      if (refKind(r.id) === 'image') { const x = await refData(r.id); if (x) out.push(x); }
      else if (refKind(r.id) === 'video') out.push(...(await videoFrames(r.id)).slice(0, 10 - out.length));
    } catch (e) { console.warn(e); }
  }
  return out;
}

// ---------------------------------------------------------------- запросы
function devBrief() {
  const d = devConf(), pr = d.params;
  return ['Ты — шоураннер канала оригинальных AI-фильмов.',
    `Проект: ${S.p.name}`,
    d.idea && `Идея автора: ${d.idea}`,
    `Жанр: ${pr.genre || '(предложи сам по идее)'}`,
    `Визуальное направление: ${pr.visual || '(предложи сам по идее)'}`,
    `Настроение: ${pr.mood || '(предложи сам по идее)'}`,
    `Аудитория: ${pr.audience || '(определи сам)'}`,
    `Язык фильмов: ${pr.lang || 'русский'}`,
    `Формат: ${pr.format}`,
    devRefList()].filter(Boolean).join('\n');
}

// Что уже написано: шаги разработки, а если их нет — документы из «Материалов».
function devDoc(k) {
  const d = devConf();
  if (d.steps[k]) return d.steps[k];
  const kind = { world: 'bible', cast: 'cast', scenes: 'script' }[k];
  return kind ? S.p.docs.filter(x => x.kind === kind && !/^razrabotka_plan/.test(x.file)).map(x => x.text).join('\n\n') : '';
}

const DEV_SYSTEM = `Ты работаешь в студии, которая делает фильмы с помощью ИИ-генераторов картинок и видео, синтеза речи и монтажа.
Помогаешь автору пройти путь от идеи до документов для производства. Пишешь по-русски (промпты для генераторов — по-английски), конкретно, без воды и вступлений вроде «Конечно!».
Уважаешь замысел автора: развиваешь его, а не подменяешь своим. Строго держишь форматы, которые тебе дают: их разбирает программа.`;

// Порции по три сцены: «Сцены 1–3», потом «Дальше: сцены 4–6».
function nextRange(k) {
  const text = devConf().steps[k] || '';
  const nums = k === 'scenes' ? [...text.matchAll(/^###\s*СЦЕНА\s*(\d+)/gmi)].map(m => +m[1]) : [...text.matchAll(/^(\d{1,3})\s*[-–]\s*\d{1,3}\s*·/gm)].map(m => +m[1]);
  const from = nums.length ? Math.max(...nums) + 1 : 1;
  return { from, label: `${from}–${from + 2}` };
}
const isDone = k => /ПЛАН ЗАВЕРШЁН/.test(devConf().steps[k] || '');

function devRequest(step, note) {
  const d = devConf();
  const need = { world: [], cast: ['world'], plan: ['world', 'cast'], scenes: ['world', 'cast', 'plan'], shots: ['cast', 'scenes'], voices: ['world', 'cast', 'scenes'] }[step.k];
  const prev = need.map(k => devDoc(k) && `=== ${DEV_STEPS.find(s => s.k === k).title} ===\n${cut(devDoc(k), k === 'scenes' ? 60000 : 30000)}`).filter(Boolean);
  const range = step.batch ? nextRange(step.k).label : '';
  const current = d.steps[step.k];
  const parts = [devBrief(), prev.length ? 'Уже написано выше в этом чате:\n\n' + prev.join('\n\n') : '', step.ask(range)];
  if (step.batch && current && !note) parts.push(`Уже написано в этом шаге (продолжай с того места, не повторяй):\n\n${cut(current, 30000)}`);
  if (note && current) parts.push(`Вот текущая версия:\n\n${cut(current, 40000)}\n\nПерепиши её целиком с учётом замечания автора: ${note}`);
  else if (note) parts.push(`Учти пожелание автора: ${note}`);
  return { system: DEV_SYSTEM, user: parts.filter(Boolean).join('\n\n') };
}

// Для своего чата: системная часть и задача одним текстом.
const asChat = r => r.system + '\n\n' + r.user;

async function devCallAI(req, step) {
  const images = step && step.images ? await devImages() : [];
  return String(await AI.call(Object.assign(req, { maxTokens: 16000, images }))).trim();
}

async function devGenerate(step, note) {
  await busy(`Помощник пишет: ${step.title}`, async () => {
    const d = devConf();
    const text = await devCallAI(devRequest(step, note), step);
    d.steps[step.k] = step.batch && !note && d.steps[step.k] ? d.steps[step.k].trimEnd() + '\n\n' + text : text;
    if (step.k === 'voices') devApplyVoices();
  });
}

// Порции до конца плана (не больше 15 запросов за раз).
async function devGenerateAll(step) {
  await busy(`Помощник пишет: ${step.title}`, async () => {
    const d = devConf();
    for (let i = 0; i < 15 && !isDone(step.k); i++) {
      S.busy = `Помощник пишет: ${step.title}, ${step.k === 'scenes' ? 'сцены' : 'шоты сцен'} ${nextRange(step.k).label}`; render();
      const text = await devCallAI(devRequest(step), step);
      d.steps[step.k] = d.steps[step.k] ? d.steps[step.k].trimEnd() + '\n\n' + text : text;
      touch();
      if (!text) break;
    }
  });
}

function devToMaterials(step) {
  const text = (devConf().steps[step.k] || '').replace(/^\s*ПЛАН ЗАВЕРШЁН\s*$/gm, '').trim();
  if (!text) return toast('Сначала напишите или вставьте текст');
  const kind = Parser.detectKind(text);
  if (step.kind === 'script' && kind !== 'script') return toast('Это не похоже на текст сцен: нужны строки «### СЦЕНА 1. МЕСТО - ВРЕМЯ». Попросите помощника переписать в формате студии.');
  if (step.kind === 'cast' && kind !== 'cast') return toast('Это не похоже на каст-библию: нужны блоки кода с SET: / LOOK: / STYLE:. Попросите переписать в формате студии.');
  if (step.kind === 'cast') { const st = Parser.parseCast(text).style; if (!st.look) S.p.style.look = devConf().look; if (!st.negative) S.p.style.negative = devConf().negative; }
  toast('В материалах: ' + importDoc(`razrabotka_${step.k}.md`, text));
  touch(); render();
}

// Сводка хронометража по тексту сцен: сцена, тип, по плану, по тексту.
function devTiming() {
  const scenes = Parser.parseScript(devConf().steps.scenes || '');
  if (!scenes.length) return null;
  const rows = scenes.map(sc => ({ num: sc.num, heading: sc.heading, type: sc.type, plan: sc.planSec, text: sc.textSec, shots: sc.shots.length }));
  return { rows, plan: rows.reduce((a, r) => a + r.plan, 0), text: rows.reduce((a, r) => a + r.text, 0) };
}

// ---------------------------------------------------------------- шот-лист → раскадровка
const PLAN_KIND = [[/сверхобщ|сверху|с высоты/i, 'ОБЩИЙ С ВЫСОТЫ'], [/мастер/i, 'МАСТЕР'], [/ракурс\s*а(?![а-яё])/i, 'РАКУРС А'], [/ракурс\s*б(?![а-яё])/i, 'РАКУРС Б'],
  [/сверхкрупн|детал/i, 'ДЕТАЛЬ'], [/крупн/i, 'КРУПНЫЙ'], [/средн|снизу|pov/i, 'СРЕДНИЙ'], [/общ/i, 'ОБЩИЙ'], [/пауз/i, 'ПАУЗА']];

function parseShotList(text) {
  const cards = [];
  let cur = null;
  for (const raw of Parser.clean(text).split('\n')) {
    const l = raw.trim().replace(/^\*\*|\*\*$/g, '').replace(/^\*\*(.+?):\*\*/, '$1:');
    let m = l.match(/^(\d{1,3})\s*[-–]\s*(\d{1,3})\s*·\s*(.+?)\s*·\s*(\d+(?:[.,]\d+)?)\s*сек/i);
    if (m) { cur = { scene: +m[1], shot: +m[2], plan: m[3].trim(), dur: +m[4].replace(',', '.'), plate: '', who: '', action: '', line: '', camera: '', mode: '' }; cards.push(cur); continue; }
    if (!cur) continue;
    if ((m = l.match(/^Плейт:\s*(.*)$/i))) cur.plate = m[1].trim();
    else if ((m = l.match(/^В кадре:\s*(.*)$/i))) cur.who = m[1].trim();
    else if ((m = l.match(/^Действие:\s*(.*)$/i))) cur.action = m[1].trim();
    else if ((m = l.match(/^Реплика:\s*(.*)$/i))) cur.line = m[1].trim();
    else if ((m = l.match(/^Камера:\s*(.*?)(?:\s*·\s*Режим:\s*(.*))?$/i))) { cur.camera = m[1].trim(); cur.mode = (m[2] || '').trim(); }
  }
  return cards;
}

function devApplyShots() {
  const cards = parseShotList(devConf().steps.shots || '');
  if (!cards.length) return toast('В шот-листе нет карточек вида «03-01 · крупный · 5 сек»');
  const p = S.p, byScene = new Map();
  cards.forEach(c => { if (!byScene.has(c.scene)) byScene.set(c.scene, []); byScene.get(c.scene).push(c); });
  const missing = [...byScene.keys()].filter(n => !p.scenes.some(sc => sc.num === n));
  if (missing.length === byScene.size) return toast('Сначала отправьте текст сцен в материалы: в раскадровке нет сцен ' + missing.join(', '));
  const withMedia = p.scenes.filter(sc => byScene.has(sc.num) && sc.shots.some(sh => sh.assets.image || sh.assets.video)).map(sc => sc.num);
  if (withMedia.length && !confirm(`В сценах ${withMedia.join(', ')} уже есть картинки или видео. Шоты будут перестроены по шот-листу, файлы останутся у шотов с теми же номерами. Продолжить?`)) return;
  const names = c => c.who && !/^(-|—|нет|никого)$/i.test(c.who) ? c.who.split(/[,;]|\sи\s/).map(x => x.trim()).filter(Boolean) : [];
  let n = 0;
  for (const sc of p.scenes) {
    const list = byScene.get(sc.num);
    if (!list) continue;
    const old = sc.shots;
    sc.shots = list.sort((a, b) => a.shot - b.shot).map((c, i) => {
      const o = old[i];
      const kind = (PLAN_KIND.find(([re]) => re.test(c.plan)) || [, 'СРЕДНИЙ'])[1];
      const sound = (c.line.match(/\((?:звук(?: в кадре)?):\s*([^)]*)\)/i) || [])[1] || '';
      const said = c.line.replace(/\((?:звук(?: в кадре)?):[^)]*\)/i, '').trim();
      const m = said.match(/^([А-ЯЁA-Za-zа-яё][^:(]{0,40}?)\s*(\((?:V\.O\.|ЗК|З\.К\.|O\.S\.)\))?\s*:\s*(.+)$/);
      const ids = names(c).map(nm => p.characters.find(ch => !ch.variantOf && (ch.aliases || [ch.name]).some(a => Parser.mentions(nm, a) || Parser.mentions(a, nm)))).filter(Boolean).map(ch => ch.id);
      n++;
      return { id: o ? o.id : uid(), kind, text: c.action, sound, dialogue: m && !/^[-—]$/.test(said) ? [{ who: m[1].trim().toUpperCase(), vo: !!m[2], line: m[3].trim() }] : [],
        dur: c.dur || 5, pinnedDur: true, characters: names(c).length ? ids : [], en: '', motion: c.camera && !/^сто/i.test(c.camera) ? c.camera : '', title: '',
        plan: c.plan, plate: c.plate, mode: c.mode, assets: o ? o.assets : {}, override: {}, review: o ? o.review : undefined, history: o ? o.history : undefined, sfx: o ? o.sfx : [] };
    });
  }
  touch(); render();
  toast(`Раскадровка перестроена по шот-листу, шотов: ${n}` + (missing.length ? `. Нет в раскадровке сцен: ${missing.join(', ')}` : ''));
}

// Голоса: «ИМЯ: описание» → в каждую реплику героя в промптах MOTION.
function devApplyVoices() {
  const v = {};
  for (const l of (devConf().steps.voices || '').split('\n')) {
    const m = l.trim().replace(/\*\*/g, '').match(/^[-•]?\s*([А-ЯЁA-Z][А-ЯЁA-Z .\-]{0,40}?)\s*[:—–]\s*(.{10,})$/);
    if (m) v[m[1].trim().toUpperCase()] = m[2].trim();
  }
  S.p.voices = v;
  return Object.keys(v).length;
}

// ---------------------------------------------------------------- критика
function critMaterial(stage) {
  const p = S.p;
  if (stage === 'idea') return devBrief();
  if (['world', 'cast', 'plan', 'scenes'].includes(stage)) return cut(devDoc(stage), 60000);
  if (stage === 'board') return cut(p.scenes.map(sc => `### Сцена ${sc.num}. ${sc.heading} (${sc.shots.reduce((a, x) => a + (+x.dur || 0), 0)} с)\n` +
    sc.shots.map(sh => `${Prompts.code(sc, sh)} [${sh.plan || sh.kind}, ${sh.dur} с]${sh.plate ? ' плейт: ' + sh.plate : ''} ${sh.text || sh.title || ''}` +
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
  if (critMaterial(stage).trim().length < 40) return toast('Для этой стадии пока нет материала');
  await busy('Худсовет читает проект', async () => {
    const images = stage === 'idea' ? await devImages() : [];
    const r = await AI.call(Object.assign(critRequest(stage, d.experts), { maxTokens: 16000, images }));
    const experts = (r.experts || []).map(x => Object.assign(x, { id: String(x.id) }));
    d.critiques.unshift({ id: uid(), stage, at: Date.now(), experts });
    d.critiques = d.critiques.slice(0, 20);
  });
}

// Гайд целиком: можно отдать сценаристу или пройти в любом чате.
function devGuide() {
  const out = [`# Гайд по разработке: ${S.p.name}`, '',
    'Принцип: всё делается в одном чате с ИИ (Claude, ChatGPT, DeepSeek). Библия мира пишется один раз и остаётся в чате выше — каждый следующий шаг опирается на неё, иначе второй фильм окажется из другой вселенной. ' +
    'Текст сцен и шот-лист пишутся порциями: «Сцены 1–3», дальше в том же чате «Дальше: сцены 4–6» и так до конца. ' +
    'Готовые каст-библию, текст сцен и шот-лист перенесите в студию: вкладка «Разработка», поле шага → «В материалы» / «В раскадровку».', '',
    '## Бриф (первое сообщение вместе с шагом 1)', '', devBrief(), ''];
  devConf().refs.length && out.push('Приложите к первому сообщению файлы из списка выше.', '');
  DEV_STEPS.forEach(s => out.push(`## ${s.title} — ${s.role}`, '', s.hint, '', s.ask(s.batch ? '1–3 (дальше в этом же чате: «Дальше: сцены 4–6» и так до конца)' : ''), ''));
  out.push('## Промпты STILL и MOTION', '', 'Их собирает студия: выберите «Шаблон: STILL» и «Шаблон: MOTION» в «Конвейере» или над шотами в раскадровке.', '',
    '## Критика', '', 'Попросите ИИ разобрать результат с точки зрения специалистов:', '', ...EXPERTS.map(e => `- **${e[1]}** — ${e[2]}`), '');
  return out.join('\n');
}

// ---------------------------------------------------------------- вкладка
function refCard(r, i) {
  const d = devConf(), m = S.p.assets[r.id], kind = refKind(r.id);
  const media = kind === 'image' ? thumb(r.id, '') : kind === 'video' ? (() => { const v = h('video', { controls: true, preload: 'metadata', playsInline: true }); assetUrl(r.id).then(u => { v.src = u; }); return v; })()
    : (() => { const a = h('audio', { controls: true, preload: 'none' }); assetUrl(r.id).then(u => { a.src = u; }); return a; })();
  return h('div', { class: 'dev-ref' },
    h('div', { class: 'dev-ref-media' }, media),
    h('div', { class: 'row' }, h('small', { class: 'grow muted', title: m.name }, `${i + 1}. ${REF_KIND[kind]} · ${m.name}`),
      btn('✕', () => { d.refs = d.refs.filter(x => x !== r); dropAsset(r.id); touch(); render(); }, 'ghost small', 'Убрать')),
    input(r.note, v => { r.note = v; }, 'что это: настроение, герой, место, музыка…'));
}

function renderDev() {
  const d = devConf(), pr = d.params, ai = d.mode === 'ai';
  const set = (k, v) => { pr[k] = v; touch(); };
  const modeBtn = (m, label) => h('button', { class: 'tab' + (d.mode === m ? ' on' : ''), onclick: () => { d.mode = m; touch(); render(); } }, label);

  const head = h('div', { class: 'card' },
    h('h2', {}, 'Разработка проекта'),
    h('p', { class: 'muted' }, 'Шаблон, которым сделана серия «Но пасаран»: библия мира → каст-библия и плейты → поэпизодный план → текст сцен → шот-лист → голоса. Каждый шаг опирается на предыдущие. Готовые документы уходят в «Материалы» и «Раскадровку», а промпты STILL и MOTION студия собирает сама.'),
    h('div', { class: 'row wrap' }, modeBtn('ai', '🤖 Помощник в студии (через ИИ из ⚙)'), modeBtn('guide', '📋 Гайд: делаю в своём чате'),
      h('span', { class: 'grow' }), btn('📄 Скачать гайд .md', () => download(safeName(S.p.name) + '_gajd.md', devGuide(), 'text/markdown;charset=utf-8'), 'ghost', 'Все шаги, правила и бриф одним файлом')),
    ai ? h('p', { class: 'muted small' }, 'Помощник пишет каждый шаг сам, с учётом идеи, вложений и уже написанного. Нужен ключ в ⚙ (или режим «Через Chatbox»). Фото и кадры из видео отправляются модели картинками — нужна модель, которая видит изображения.')
      : h('p', { class: 'muted small' }, 'Ведите всё в одном чате. У каждого шага кнопка «⧉ Запрос для чата»: вставьте его в Claude, ChatGPT или другой чат, ответ вставьте в поле шага. Текст сцен и шот-лист — порциями по три сцены: кнопка сама подставит следующие номера.'));

  const drop = h('div', { class: 'dev-refs' },
    d.refs.filter(r => S.p.assets[r.id]).map(refCard),
    h('button', { class: 'dev-ref add', onclick: async () => devAttach(await pickFile('image/*,video/*,audio/*', true)) }, '📎 Прикрепить фото, видео или аудио', h('small', { class: 'muted' }, 'или перетащите файлы сюда')));
  dropzone(drop, devAttach);

  const idea = h('div', { class: 'card' },
    h('h3', {}, 'Идея'),
    area(d.idea, v => { d.idea = v; }, 4, 'О чём ваш фильм или канал? Мир, герой, тайна, образ, который не отпускает.'),
    h('div', { class: 'muted small' }, 'Вложения: референсы настроения, внешности героев, мест, света, музыки. Подпишите, что это — так ИИ поймёт, зачем они.'),
    drop,
    h('div', { class: 'row wrap' },
      field('Жанр', input(pr.genre, v => set('genre', v), 'космическая фантастика, тёмное фэнтези…')),
      field('Визуальное направление', input(pr.visual, v => set('visual', v), 'звёздные корабли, холодный свет рубок…')),
      field('Настроение', input(pr.mood, v => set('mood', v), 'одиночество и величие, тревога…'))),
    h('div', { class: 'row wrap' },
      field('Аудитория', input(pr.audience, v => set('audience', v), 'кто смотрит, возраст')),
      field('Язык фильмов', input(pr.lang, v => set('lang', v), 'русский')),
      field('Формат', h('select', { onchange: e => set('format', e.target.value) }, DEV_FORMATS.map(f => h('option', { selected: f === pr.format }, f))))),
    h('details', {}, h('summary', { class: 'small muted' }, 'Визуальные константы: LOOK и NEGATIVE — идут дословно в конец каждого промпта'),
      field('LOOK', area(d.look, v => { d.look = v.trim() || NP_LOOK; }, 4)),
      field('NEGATIVE', area(d.negative, v => { d.negative = v.trim() || NP_NEGATIVE; }, 3))));

  const timing = devTiming();
  const steps = DEV_STEPS.map(step => {
    const text = d.steps[step.k] || '', note = h('input', { type: 'text', placeholder: 'Что поправить (например: «короче», «героиня старше», «финал светлее»)', class: 'grow' });
    const imported = step.kind && S.p.docs.some(x => x.file === `razrabotka_${step.k}.md`);
    const done = step.batch && isDone(step.k);
    const rng = step.batch ? nextRange(step.k).label : '';
    return h('div', { class: 'card dev-step' + (text ? ' done' : '') },
      h('div', { class: 'row wrap' }, h('h3', { class: 'grow' }, step.title, h('small', { class: 'muted' }, ' · ' + step.role)),
        text ? h('span', { class: 'chip' }, `${text.length} зн.`) : h('span', { class: 'muted small' }, 'пусто'),
        done ? h('span', { class: 'chip' }, '✓ план завершён') : null,
        imported ? h('span', { class: 'chip', title: 'Документ уже в «Материалах»' }, '✓ в материалах') : null),
      h('div', { class: 'muted small' }, step.hint),
      step.story ? field('Сюжет фильма: номер из банка сюжетов библии или свой', input(pr.story, v => set('story', v), 'например: 3')) : null,
      area(text, v => { d.steps[step.k] = v; if (step.k === 'voices') devApplyVoices(); render(); }, text ? 12 : 3, ai ? 'Здесь появится текст помощника. Его можно править.' : 'Вставьте сюда ответ из своего чата.' + (step.batch ? ' Порции добавляйте в конец.' : '')),
      h('div', { class: 'row wrap' },
        ai && !step.batch ? btn(S.busy ? S.busy + '…' : text ? '↻ Написать заново' : '🤖 Написать', () => devGenerate(step), text ? '' : 'primary') : null,
        ai && step.batch && !done ? btn(`🤖 ${text ? 'Дальше: ' : ''}сцены ${rng}`, () => devGenerate(step), text ? '' : 'primary') : null,
        ai && step.batch && !done ? btn('🤖 Все до конца', () => devGenerateAll(step), '', 'Порциями по три сцены, пока помощник не напишет «ПЛАН ЗАВЕРШЁН»') : null,
        btn(step.batch ? `⧉ Запрос: ${text ? 'дальше, ' : ''}сцены ${rng}` : '⧉ Запрос для чата', () => copy(asChat(devRequest(step, note.value.trim())), 'Запрос'), ai ? 'ghost' : 'primary', 'Скопировать запрос для Claude, ChatGPT или другого чата'),
        step.batch && text ? btn('↺ Начать заново', () => { if (confirm('Очистить ' + step.title + '?')) { d.steps[step.k] = ''; touch(); render(); } }, 'ghost small') : null,
        step.kind ? btn('→ В материалы', () => devToMaterials(step), '', 'Отправить документ в «Материалы»: студия разберёт его') : null,
        step.k === 'shots' ? btn('→ В раскадровку', devApplyShots, '', 'Перестроить шоты сцен по карточкам шот-листа: ракурс, плейт, герои, длительность, реплика') : null,
        step.k === 'voices' && text ? h('span', { class: 'muted small' }, `голосов: ${Object.keys(S.p.voices || {}).length} — идут в реплики промптов «Шаблон: MOTION»`) : null),
      step.k === 'scenes' && timing ? h('details', { class: 'small' }, h('summary', {}, `Сводка хронометража: ${timing.rows.length} сцен · по плану ${fmtDur(timing.plan)} · по тексту ${fmtDur(timing.text)}`),
        h('table', { class: 'dev-timing' }, h('tr', {}, ['Сцена', 'Тип', 'По плану', 'По тексту', 'Шотов'].map(x => h('th', {}, x))),
          timing.rows.map(r => h('tr', { class: r.plan && r.text && Math.abs(r.text - r.plan) / r.plan > 0.2 ? 'off' : '' },
            h('td', {}, `${r.num}. ${r.heading}`), h('td', {}, r.type), h('td', {}, r.plan ? r.plan + ' с' : '—'), h('td', {}, r.text ? r.text + ' с' : '—'), h('td', {}, r.shots))))) : null,
      text && !step.batch ? h('div', { class: 'row' }, note,
        ai ? btn('✎ Поправить', () => { if (!note.value.trim()) return toast('Напишите, что поправить'); devGenerate(step, note.value.trim()); }, '') : null) : null);
  });

  const qa = h('textarea', { rows: 2, placeholder: 'Спросите помощника о чём угодно по проекту: «как сократить до 10 минут?», «придумай имя героине», «чем заменить сцену в метро?»' });
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
        const a = await AI.call({ system: DEV_SYSTEM, user: `${devBrief()}\n\n${ctx}\n\n${recent ? 'Недавний разговор:\n' + recent + '\n\n' : ''}Вопрос автора: ${q}`, maxTokens: 8000, images: await devImages() });
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
      h('summary', {}, `${(CRIT_STAGES.find(s => s[0] === c.stage) || [, c.stage])[1]} · ${new Date(c.at).toLocaleString('ru-RU')} · средняя оценка ${(c.experts.reduce((a, x) => a + (+x.score || 0), 0) / Math.max(1, c.experts.length)).toFixed(1)}`,
        btn('✕', e => { e.preventDefault(); d.critiques = d.critiques.filter(x => x !== c); touch(); render(); }, 'ghost small', 'Удалить')),
      h('div', { class: 'crit-grid' }, c.experts.map(x => h('div', { class: 'crit-card score-' + (x.score >= 8 ? 'ok' : x.score >= 5 ? 'fix' : 'redo') },
        h('div', { class: 'row' }, h('b', { class: 'grow' }, expert(x.id)[1]), h('span', { class: 'crit-score' }, (+x.score || 0) + '/10')),
        h('p', {}, x.summary),
        x.strengths && x.strengths.length ? [h('div', { class: 'small muted' }, 'Сильные стороны'), h('ul', {}, x.strengths.map(t => h('li', {}, t)))] : null,
        x.problems && x.problems.length ? [h('div', { class: 'small muted' }, 'Проблемы'), h('ul', {}, x.problems.map(t => h('li', {}, t)))] : null,
        x.advice && x.advice.length ? [h('div', { class: 'small muted' }, 'Что сделать'), h('ul', {}, x.advice.map(t => h('li', {}, t)))] : null))))));

  return h('div', { class: 'page dev' }, head, idea, steps, chat, crit);
}
