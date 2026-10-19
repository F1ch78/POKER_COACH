'use strict';
// Обращения к Claude прямо из браузера (как в покерном тренере: ключ хранится только на устройстве).
// Работает и напрямую с Anthropic, и через шлюзы-посредники: формат Anthropic (/v1/messages)
// или OpenAI-совместимый (/v1/chat/completions) определяется сам при первом запросе.

const AI = (() => {
  // mode: api — запросы прямо из браузера; manual — запрос копируется в Chatbox (или другой чат), ответ вставляется обратно.
  const DEFAULTS = { apiKey: '', model: 'claude-opus-5-5', baseUrl: '', apiPath: '', apiFormat: 'auto', effort: 'medium', mode: 'api' };
  // Шлюзы, адрес которых можно подставить по префиксу ключа.
  const KNOWN = [{ prefix: 'sk-cvc-', baseUrl: 'https://ru.cheapvibecode.ru/v1', format: 'openai', name: 'CheapVibeCode' }];
  let settings = Object.assign({}, DEFAULTS);
  try { Object.assign(settings, JSON.parse(localStorage.getItem('cs-ai') || '{}')); } catch (e) {}

  const save = s => { settings = Object.assign({}, DEFAULTS, s); try { localStorage.setItem('cs-ai', JSON.stringify(settings)); } catch (e) {} };
  const known = key => KNOWN.find(k => (key || '').trim().startsWith(k.prefix));
  const baseFor = () => settings.baseUrl || (known(settings.apiKey) || {}).baseUrl || 'https://api.anthropic.com';
  // Адрес можно вписывать и с /v1 на конце, и без.
  const root = () => baseFor().trim().replace(/\/+$/, '').replace(/\/v1$/, '');
  // Как в Chatbox: если задан путь API, адрес запроса = Host + Path, а формат следует из пути.
  const pathFormat = () => settings.apiPath ? (/messages/i.test(settings.apiPath) ? 'anthropic' : 'openai') : null;
  function endpoint(fmt) {
    if (settings.apiPath) return baseFor().trim().replace(/\/+$/, '') + '/' + settings.apiPath.trim().replace(/^\/+/, '');
    return root() + (fmt === 'openai' ? '/v1/chat/completions' : '/v1/messages');
  }
  let manual = null;   // интерфейс подставляет сюда окно «запрос через Chatbox»
  const direct = () => { try { return /(^|\.)api\.anthropic\.com$/i.test(new URL(root()).hostname); } catch (e) { return false; } };

  function headers(fmt) {
    const key = settings.apiKey.trim();
    if (fmt === 'openai') return { 'content-type': 'application/json', 'authorization': 'Bearer ' + key };
    const h = { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' };
    if (direct()) {
      h['anthropic-dangerous-direct-browser-access'] = 'true';
      h['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    } else h['authorization'] = 'Bearer ' + key;   // шлюзы принимают ключ то в одном заголовке, то в другом
    return h;
  }

  function explain(status, msg) {
    const hint = {
      400: 'Сервер не принял запрос — проверьте название модели.',
      401: 'Неверный API-ключ.',
      402: 'Закончился баланс у сервиса.',
      403: 'Доступ запрещён — ключ не подходит к этому адресу или регион закрыт.',
      404: 'Не найдено — проверьте адрес API и название модели.',
      429: 'Слишком много запросов или закончился баланс.',
      529: 'Сервер перегружен, повторите через минуту.',
    }[status];
    return (hint ? hint + ' ' : '') + '(' + status + (msg ? ': ' + msg : '') + ')';
  }

  async function send(fmt, body) {
    const url = endpoint(fmt);
    let resp;
    try {
      resp = await fetch(url, { method: 'POST', headers: headers(fmt), body: JSON.stringify(body) });
    } catch (e) {
      const err = new Error(direct()
        ? 'Нет связи с сервером Claude. Проверьте интернет; из России обычно нужен VPN или шлюз-посредник.'
        : 'Нет связи с ' + root() + '. Проверьте адрес и интернет. Если адрес верный, сервер, возможно, не принимает запросы из браузера.');
      err.network = true;
      throw err;
    }
    if (!resp.ok) {
      let msg = resp.statusText;
      try { const j = await resp.json(); msg = (j.error && (j.error.message || j.error)) || j.message || j.detail || msg; } catch (e) {}
      const err = new Error(explain(resp.status, typeof msg === 'string' ? msg : JSON.stringify(msg)));
      err.status = resp.status; err.raw = String(msg);
      throw err;
    }
    return resp.json();
  }

  function anthropicBody({ system, user, schema, maxTokens }) {
    const body = { model: settings.model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] };
    if (direct()) {
      body.output_config = { effort: settings.effort || 'medium' };
      if (schema) body.output_config.format = { type: 'json_schema', schema };
      body.fallbacks = 'default';
    }
    return body;
  }

  function readAnthropic(data) {
    if (data.stop_reason === 'refusal') throw new Error('Модель отказалась отвечать на этот запрос' + (data.stop_details && data.stop_details.explanation ? ': ' + data.stop_details.explanation : '.'));
    return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  }

  function readOpenAI(data) {
    const ch = data.choices && data.choices[0];
    if (!ch) throw new Error('Пустой ответ сервера.');
    const c = ch.message && ch.message.content;
    return Array.isArray(c) ? c.map(x => x.text || '').join('') : (c || '');
  }

  async function call({ system, user, schema, maxTokens = 16000, noManual }) {
    // Шлюзы не всегда поддерживают структурированный ответ, поэтому формат JSON всегда дублируем в тексте.
    if (schema) user += '\n\nReturn only a JSON object matching this JSON Schema, with no other text:\n' + JSON.stringify(schema);
    if (settings.mode === 'manual' && manual && !noManual) return parse(await manual({ system, user }), schema);
    if (!settings.apiKey) throw new Error('Укажите API-ключ в настройках (⚙) или включите режим «через Chatbox».');
    try {
      return parse(await viaApi({ system, user, schema, maxTokens }), schema);
    } catch (e) {
      // Браузер не достучался до сервиса (часто это запрет CORS) — предлагаем сделать этот запрос через Chatbox.
      if (e.network && manual && !noManual) return parse(await manual({ system, user, reason: e.message }), schema);
      throw e;
    }
  }

  // Один запрос с автоопределением формата: при отказе пробуем второй формат (Anthropic ↔ OpenAI-совместимый).
  async function viaApi({ system, user, schema, maxTokens }) {
    const fmt = pathFormat() || (settings.apiFormat === 'auto' ? (settings.detected || (known(settings.apiKey) || {}).format || 'anthropic') : settings.apiFormat);
    let text;
    try {
      text = await callAs(fmt, { system, user, schema, maxTokens });
    } catch (e) {
      const other = fmt === 'anthropic' ? 'openai' : 'anthropic';
      const switchable = settings.apiFormat === 'auto' && !settings.apiPath && !direct() && (e.network || [400, 404, 405, 415, 422].includes(e.status));
      if (!switchable) throw e;
      try { text = await callAs(other, { system, user, schema, maxTokens }); }
      catch (e2) { throw e2.network || e2.status === 404 ? e : e2; }
      save(Object.assign({}, settings, { detected: other }));
      return text;
    }
    if (settings.apiFormat === 'auto' && settings.detected !== fmt) save(Object.assign({}, settings, { detected: fmt }));
    return text;
  }

  async function callAs(fmt, req) {
    if (fmt === 'openai') {
      const data = await send('openai', { model: settings.model, max_tokens: req.maxTokens,
        messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }] });
      return readOpenAI(data);
    }
    const body = anthropicBody(req);
    try {
      return readAnthropic(await send('anthropic', body));
    } catch (e) {
      // Прокси или старый шлюз может не знать новые параметры — повторяем без них.
      if (e.status === 400 && (body.fallbacks || body.output_config) && /fallback|output_config|effort|format|beta/i.test(e.raw || '')) {
        delete body.fallbacks; delete body.output_config;
        return readAnthropic(await send('anthropic', body));
      }
      throw e;
    }
  }

  function parse(text, schema) {
    if (!schema) return text;
    try { return JSON.parse(text); } catch (e) {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
      throw new Error('Не удалось разобрать ответ модели.');
    }
  }

  // Проверка связи: короткий запрос и список моделей сервиса (если он его отдаёт).
  async function ping() {
    const t0 = performance.now();
    const answer = await call({ system: 'Answer with one word.', user: 'Скажи «ок».', maxTokens: 400, noManual: true });
    const fmt = pathFormat() || (settings.apiFormat === 'auto' ? settings.detected : settings.apiFormat);
    return { answer: answer.replace(/```\w*/g, '').trim().slice(0, 40), fmt, ms: Math.round(performance.now() - t0), url: endpoint(fmt) };
  }

  async function models() {
    for (const fmt of ['anthropic', 'openai']) {
      try {
        const h = headers(fmt); delete h['content-type'];
        const r = await fetch(root() + '/v1/models', { headers: h });
        if (!r.ok) continue;
        const j = await r.json();
        const list = (j.data || j.models || []).map(m => m.id || m.name).filter(Boolean);
        if (list.length) return list;
      } catch (e) { /* пробуем дальше */ }
    }
    return [];
  }

  const VISUAL_RULES = `Rules for every description:
- English, present tense, concrete and visual: who is in frame, what they do, what is around them.
- Never use personal names or place names; describe people by appearance cue ("the man in the black cloak", "the elf woman with the scarlet ponytail", "the small elf girl").
- Do not describe camera framing or lens (added separately), music, or sound.
- No text, letters or signs in the frame.
- 1–3 sentences, at most 60 words.`;

  // Переводит шоты сцены в английские визуальные описания для генераторов картинок и видео.
  async function describeScene(scene, ctx) {
    const shots = scene.shots.map((s, i) => ({
      i, kind: s.kind, action: s.text || (s.title ? 'Title card on black: ' + s.title : ''),
      dialogue: s.dialogue.map(d => `${d.who}${d.vo ? ' (V.O.)' : ''}: ${d.line}`).join(' / '),
    }));
    const system = `You are a storyboard artist preparing prompts for an AI image model and an AI video model. The film is described below.\n\n${ctx}\n\n${VISUAL_RULES}`;
    const user = `Scene ${scene.num}. ${scene.heading}. Type: ${scene.type}.\n${scene.notes.join('\n')}\n\nFor each shot return:\n- "image": what the still frame shows (the moment of the shot);\n- "motion": what moves during the shot for the video model (actions, camera-independent), one sentence.\nDialogue shots: show the speaker in the act of speaking.\n\nShots (JSON):\n${JSON.stringify(shots, null, 1)}`;
    const schema = {
      type: 'object', additionalProperties: false, required: ['shots'],
      properties: { shots: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['i', 'image', 'motion'],
        properties: { i: { type: 'integer' }, image: { type: 'string' }, motion: { type: 'string' } } } } },
    };
    const r = await call({ system, user, schema });
    return r.shots || [];
  }

  async function locationSet(loc, sceneTexts, ctx) {
    const system = `You write location plates for an AI image model. ${ctx}\n\nA SET line is 40–60 words, English: architecture or terrain, scale, materials, the single light source, weather and air. No people, no names, no text.`;
    const user = `Location: ${loc.name}\n\nWhat happens there in the script:\n${sceneTexts.slice(0, 6000)}\n\nWrite only the SET text, without the "SET:" prefix.`;
    return (await call({ system, user, maxTokens: 4000 })).trim().replace(/^SET:\s*/, '');
  }

  async function characterTags(name, ctx) {
    const system = `You write character tag-sets for an AI image model. ${ctx}\n\nTag-set: 35–50 words, English: sex and age, build, face and distinctive mark, hair, eyes, skin, costume. No name, no emotion, no lighting.`;
    return (await call({ system, user: `Character: ${name}. Write only the tag-set.`, maxTokens: 4000 })).trim();
  }

  return { get settings() { return settings; }, save, known, call, ping, models, describeScene, locationSet, characterTags, setManual: fn => { manual = fn; } };
})();
