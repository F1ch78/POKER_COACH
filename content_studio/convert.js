'use strict';
// Перенос готовых материалов в формат студии. Автор загружает всё, что есть, в любом виде
// (сценарий, библию, раскадровку, промпты, заметки), а ИИ по ним заполняет проект: паспорт и идею,
// стиль, героев и плейты, текст сцен, шот-лист, голоса и английские описания шотов.
// Заполняется только то, чего в проекте ещё нет: распознанное студией напрямую не переписывается.
// Пользуется помощниками студии и разработки (busy, importDoc, devConf, devApplyShots…), подключается до studio.js.

const CONVERT_RULE = `Материалы автора — закон. Сюжет, порядок и нумерацию сцен, кадры, хронометраж, внешность героев, места, палитру, свет и правила мира бери из них.
Готовые английские описания и промпты из материалов переноси по смыслу, а не сочиняй заново. Недостающее дополняй в духе материалов и ничего не противоречащего им не добавляй.`;

const PASSPORT_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' }, idea: { type: 'string' }, genre: { type: 'string' }, visual: { type: 'string' },
    mood: { type: 'string' }, audience: { type: 'string' }, lang: { type: 'string' }, format: { type: 'string' }, vertical: { type: 'boolean' },
  },
  required: ['name', 'idea', 'genre', 'visual', 'mood', 'audience', 'lang', 'format', 'vertical'],
};

const convertSource = sources => cut(sources.map(s => `=== ${s.name} ===\n${s.text.trim()}`).join('\n\n'), 120000);

function convertPassportAsk(src) {
  return `${CONVERT_RULE}

Материалы автора:

${src}

Составь паспорт проекта по этим материалам:
- name — название фильма;
- idea — о чём фильм, 2–4 предложения по-русски: герой, чего хочет, что мешает, чем кончается;
- genre, visual (визуальное направление и техника: живое кино, 3D, 2D, моушн-графика…), mood, audience — коротко по-русски;
- lang — язык реплик;
- format — формат и хронометраж одной строкой, например «9:16 вертикальный, 2–3 минуты»;
- vertical — true, если кадр вертикальный.`;
}

function convertCastAsk(src) {
  return `${CONVERT_RULE}

Материалы автора:

${src}

Переложи эти материалы в КАСТ-БИБЛИЮ И ПЛЕЙТЫ студии.
1. Стиль: LOOK — техника изображения (камера и плёнка для живого кино, техника рисунка или рендера для анимации), STYLE — палитра, свет, формы и фактуры, NEGATIVE — что генератору рисовать нельзя, через запятую, обязательно текст, буквы, логотипы и водяные знаки. Всё по-английски.
2. Тег-сет каждого героя: одна строка по-английски, 35–60 слов — вид, возраст, телосложение, лицо и особые приметы, костюм. Без имени, эмоций и света.
3. Лист персонажа на каждого героя: промпт по-английски — несколько ракурсов в одном кадре на ровном фоне, в стиле проекта.
4. Если в части сцен герой выглядит иначе (другой костюм, виден только частично, например одни ноги), добавь вариант с отдельным тег-сетом: **<ИМЯ> <пояснение> (сцены N–M)**. Вариант начинается с имени героя.
5. Плейты всех мест, где идут сцены. На каждое: SET по-английски, 40–80 слов — материалы, масштаб, свет, характерные предметы; потом промпт пустого места без людей.

Правила:
- имена героев и названия мест — по-русски, как в материалах; названия мест короткие, их же ты потом поставишь в заголовки сцен;
- промпты по-английски, каждый в своём блоке кода, имена в промпты не писать;
- тег-сеты и SET вставляются дословно.

ОФОРМЛЕНИЕ СТРОГО ТАКОЕ (его разбирает программа):

# Каст-библия: <название>

## Стиль
${FENCE}
STYLE: <палитра, свет, формы>

LOOK: <техника изображения>

NEGATIVE: <через запятую>
${FENCE}

## Герои
**<ИМЯ>**
${FENCE}
<тег-сет>
${FENCE}
**<ИМЯ> — лист**
${FENCE}
<промпт листа персонажа>
${FENCE}

## Локации
### Плейт <Название места>
${FENCE}
SET: <SET>
${FENCE}
${FENCE}
<промпт пустого места>
${FENCE}`;
}

function convertCastBrief() {
  const p = S.p;
  return [p.locations.length && 'Места (плейты) студии: ' + p.locations.map(l => l.name).join(', ') + '.',
    p.characters.length && 'Герои студии: ' + p.characters.filter(c => !c.variantOf).map(c => c.name).join(', ') + '.'].filter(Boolean).join('\n');
}

function convertScenesAsk(src, written) {
  return `${CONVERT_RULE}

Материалы автора:

${src}

${convertCastBrief()}

Переложи сюжет из материалов в ТЕКСТ СЦЕН студии.
- Сохрани число, порядок и нумерацию сцен автора. Если у автора есть раскадровка или шот-лист, каждый его кадр — отдельная строка шота, в том же порядке. Ничего не сокращай и не добавляй нового сюжета.
- ЛОКАЦИЯ в заголовке — название места из списка выше, ВРЕМЯ — время суток.
- Строка шота: ракурс в квадратных скобках, потом что видно и слышно, 1–3 предложения по-русски. Ракурсы: [ОБЩИЙ С ВЫСОТЫ], [ОБЩИЙ], [СРЕДНИЙ], [КРУПНЫЙ], [ДЕТАЛЬ], [МАСТЕР], [РАКУРС А], [РАКУРС Б]; особый угол (снизу, строго сверху, POV, макро) допиши словами в описание.
- Звук шота — в конце строки: (звук: …).
- ИМЯ: реплика — только то, что звучит голосом. Надписи, таблички, титры, тексты песен и звукоподражания — не реплики: пиши их в описании шота или в (звук: …).
- Если в материалах есть хронометраж сцены, впиши его в строку «Хронометраж: по плану X с».

ФОРМАТ КАЖДОЙ СЦЕНЫ:
### СЦЕНА N. ЛОКАЦИЯ - ВРЕМЯ СУТОК
**Тип:** что за сцена, одной-двумя словами
[РАКУРС] Что видно и слышно в кадре. (звук: …)
[РАКУРС] ИМЯ: реплика.
Сдвиг: что изменилось к концу сцены.
Хронометраж: по плану X с

Если всё не помещается в один ответ, остановись на границе сцены. Когда написана последняя сцена, последней строкой напиши: ПЛАН ЗАВЕРШЁН${written ? `

Уже написано (продолжай со следующей сцены, не повторяй):

${cut(written, 40000)}` : ''}`;
}

function convertShotsAsk(src, scenesText, from, to) {
  return `${CONVERT_RULE}

Материалы автора:

${src}

${convertCastBrief()}

Текст сцен студии:

${cut(scenesText, 60000)}

Разложи сцены ${from}–${to} на карточки шот-листа студии.
- Одна строка шота в тексте сцен — одна карточка, в том же порядке. Номер карточки: номер сцены и номер шота по порядку, через дефис.
- Длительность, камеру и кто в кадре бери из материалов автора, если они там есть; иначе ставь сам: деталь 1–3 с, обычный шот 3–6 с, не длиннее 10 с.
- В кадре: имена героев из списка, которых видно в кадре, через запятую, или «-».
- Реплика: «ИМЯ: текст», если шот озвучен голосом, иначе «-». Звук шота можно дописать в скобках: (звук: …).
- Камера: стоит / медленный наезд / отъезд / дрейф / движение / панорама — как у автора.
- Режим: СТИЛЛ→ВИДЕО, если в кадре герой или место с плейтом, иначе ТЕКСТ→ВИДЕО.

Без таблиц и блоков кода. Между карточками пустая строка. Образец карточки:

03-01 · крупный · 3 сек
Плейт: <место> МАСТЕР
В кадре: <имена или ->
Действие: одно действие одной фразой
Реплика: -
Камера: стоит · Режим: СТИЛЛ→ВИДЕО`;
}

// Документы из анкеты: сохраняем как есть (распознанное студия разберёт сама), остальное переложит ИИ.
async function convertMaterials(sources) {
  const p = S.p, d = devConf();
  const src = convertSource(sources);
  const made = [];
  const step = label => { S.busy = 'ИИ перекладывает материалы: ' + label; render(); };
  const ask = (user, maxTokens = 16000, schema) => AI.call({ system: DEV_SYSTEM, user, maxTokens, schema });

  await busy('ИИ перекладывает материалы под студию', async () => {
    step('паспорт проекта');
    const pass = await ask(convertPassportAsk(src), 3000, PASSPORT_SCHEMA);
    if (pass && typeof pass === 'object') {
      if (!d.idea && pass.idea) d.idea = pass.idea;
      for (const k of ['genre', 'visual', 'mood', 'audience', 'lang']) if (pass[k] && !d.params[k]) d.params[k] = pass[k];
      const fmt = DEV_FORMATS.find(f => f === pass.format) || (pass.vertical ? DEV_FORMATS.find(f => /^9:16/.test(f)) : '');
      if (fmt) d.params.format = fmt;
      if (pass.vertical) p.render.size = '1080x1920';
      if (pass.name && /^(Новый фильм|Мой фильм)$/.test(p.name)) p.name = pass.name;
      made.push('паспорт');
      touch();
    }

    if (!p.characters.length || !p.locations.length) {
      step('стиль, герои и плейты');
      const text = await ask(convertCastAsk(src));
      d.steps.cast = text;
      if (Parser.detectKind(text) === 'cast') { importDoc('studio_kast.md', text); made.push(`героев ${p.characters.filter(c => !c.variantOf).length}, мест ${p.locations.length}`); }
      else toast('ИИ вернул каст-библию не в формате студии — она в «Разработке», шаг 2.');
      touch();
    }

    if (!p.scenes.some(sc => sc.shots.length)) {
      let written = '';
      for (let i = 0; i < 12; i++) {
        const nums = [...written.matchAll(/^#{0,4}\s*СЦЕНА\s*(\d+)/gmi)].map(m => +m[1]);
        step(nums.length ? `текст сцен после ${Math.max(...nums)}-й` : 'текст сцен');
        const part = String(await ask(convertScenesAsk(src, written))).trim();
        if (!part) break;
        const before = nums.length;
        written = written ? written.trimEnd() + '\n\n' + part : part;
        const after = [...written.matchAll(/^#{0,4}\s*СЦЕНА\s*(\d+)/gmi)].length;
        if (/ПЛАН ЗАВЕРШЁН/.test(part) || after === before) break;
      }
      written = written.replace(/^\s*ПЛАН ЗАВЕРШЁН\s*$/gm, '').trim();
      d.steps.scenes = written;
      if (Parser.detectKind(written) === 'script') { importDoc('studio_sceny.md', written); made.push(`сцен ${p.scenes.length}`); }
      else toast('ИИ вернул текст сцен не в формате студии — он в «Разработке», шаг 4.');
      touch();
    }

    if (p.scenes.length && !d.steps.shots) {
      const scenesText = d.steps.scenes || p.docs.filter(x => x.kind === 'script').map(x => x.text).join('\n\n');
      const nums = p.scenes.map(sc => sc.num);
      let cards = '';
      for (let i = 0; i < nums.length; i += 4) {
        const from = nums[i], to = nums[Math.min(i + 3, nums.length - 1)];
        step(`шот-лист, сцены ${from}–${to}`);
        cards = (cards ? cards.trimEnd() + '\n\n' : '') + String(await ask(convertShotsAsk(src, scenesText, from, to))).trim();
      }
      d.steps.shots = cards;
      if (parseShotList(cards).length) { devApplyShots(); made.push(`шотов ${p.scenes.reduce((a, sc) => a + sc.shots.length, 0)}`); }
      touch();
    }

    const talks = p.scenes.some(sc => sc.shots.some(sh => sh.dialogue.length));
    if (talks && !d.steps.voices) {
      step('голоса героев');
      d.steps.voices = String(await ask(devRequest(DEV_STEPS.find(s => s.k === 'voices')).user, 4000)).trim();
      if (devApplyVoices()) made.push('голоса');
      touch();
    }

    for (const sc of p.scenes) {
      const pics = sc.shots.filter(sh => !Prompts.noPicture(sh));
      if (!pics.length || pics.every(sh => sh.en && Array.isArray(sh.aiCharacters))) continue;
      step(`английские описания, сцена ${sc.num} из ${p.scenes.length}`);
      applyScene(sc, await AI.describeScene(sc, aiContext(), castNames()), true);
      touch();
    }
    if (p.scenes.some(sc => sc.shots.some(sh => sh.en))) made.push('английские описания');

    const hv = p.have || {};
    p.have = Object.assign(hv, {
      world: hv.world || p.docs.some(x => x.kind === 'bible'), cast: hv.cast || p.characters.length > 0,
      script: hv.script || p.scenes.length > 0, shots: hv.shots || !!d.steps.shots,
    });
  });
  return made;
}
