'use strict';
// Обращения к Claude прямо из браузера (как в покерном тренере: ключ хранится только на устройстве).
// Работает и напрямую с Anthropic, и через шлюзы-посредники: формат Anthropic (/v1/messages)
// или OpenAI-совместимый (/v1/chat/completions) определяется сам при первом запросе.

const AI = (() => {
  // mode: api — запросы прямо из браузера; manual — запрос копируется в Chatbox (или другой чат), ответ вставляется обратно.
  const DEFAULTS = { apiKey: '', model: 'claude-opus-5-5', baseUrl: '', apiPath: '', apiFormat: 'auto', effort: 'medium', mode: 'api' };
  // Шлюзы, адрес которых можно подставить по префиксу ключа.
  // imageFormat: как сервис рисует. CheapVibeCode работает через аккаунты ChatGPT — картинки рисует сама GPT-модель
  // инструментом image_generation (API Responses), отдельные модели картинок там недоступны.
  const KNOWN = [{ prefix: 'sk-cvc-', baseUrl: 'https://ru.cheapvibecode.ru/v1', format: 'openai', imageFormat: 'responses', name: 'CheapVibeCode' }];
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
    if (/not available through the connected ChatGPT accounts/i.test(msg || ''))
      return 'Эта модель недоступна у вашего сервиса: он работает через аккаунты ChatGPT. Выберите модель GPT или нажмите «Подобрать автоматически» в ⚙ → «Картинки». (' + status + ': ' + msg + ')';
    const hint = {
      400: 'Сервер не принял запрос — проверьте название модели.',
      401: 'Неверный API-ключ.',
      402: 'Закончился баланс у сервиса.',
      403: 'Доступ запрещён — ключ не подходит к этому адресу или регион закрыт.',
      404: 'Не найдено — проверьте адрес API и название модели.',
      429: 'Слишком много запросов или закончился баланс.',
      503: 'Сервис или модель сейчас недоступны.',
      529: 'Сервер перегружен, повторите через минуту.',
    }[status];
    return (hint ? hint + ' ' : '') + '(' + status + (msg ? ': ' + msg : '') + ')';
  }

  // Мост (server.ps1): если студия открыта через start-studio.bat, запросы идут через программу на компьютере,
  // как в Chatbox, и запрет браузера на чужие адреса (CORS) не мешает.
  let bridgeCheck = null;
  function bridge() {
    if (!bridgeCheck) bridgeCheck = /^https?:$/.test(location.protocol)
      ? fetch('/__studio', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => !!(j && j.bridge)).catch(() => false)
      : Promise.resolve(false);
    return bridgeCheck;
  }

  async function request(url, opts) {
    if (!(await bridge())) return fetch(url, opts);
    return fetch('/proxy', Object.assign({}, opts, { headers: Object.assign({}, opts.headers, { 'x-studio-target': url }) }));
  }

  async function send(fmt, body) {
    const url = endpoint(fmt);
    let resp;
    try {
      resp = await request(url, { method: 'POST', headers: headers(fmt), body: JSON.stringify(body) });
    } catch (e) {
      const err = new Error(await bridge()
        ? 'Мост не отвечает. Проверьте, что окно start-studio.bat открыто.'
        : direct()
          ? 'Нет связи с сервером Claude. Проверьте интернет; из России обычно нужен VPN или шлюз-посредник.'
          : 'Нет связи с ' + root() + '. Браузер не пускает запросы к этому сервису. Откройте студию через start-studio.bat (как Chatbox) или включите режим «Через Chatbox».');
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

  // images: [{ mime, b64 }] — картинки к запросу (референсы идеи, кадры из видео).
  const anthropicContent = (user, images) => images && images.length
    ? images.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.mime, data: i.b64 } })).concat({ type: 'text', text: user }) : user;
  const openaiContent = (user, images) => images && images.length
    ? images.map(i => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.b64}` } })).concat({ type: 'text', text: user }) : user;

  function anthropicBody({ system, user, schema, maxTokens, images }) {
    const body = { model: settings.model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: anthropicContent(user, images) }] };
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

  async function call({ system, user, schema, maxTokens = 16000, noManual, images }) {
    // Шлюзы не всегда поддерживают структурированный ответ, поэтому формат JSON всегда дублируем в тексте.
    if (schema) user += '\n\nReturn only a JSON object matching this JSON Schema, with no other text:\n' + JSON.stringify(schema);
    if (settings.mode === 'manual' && manual && !noManual) return parse(await manual({ system, user, images }), schema);
    if (!settings.apiKey) throw new Error('Укажите API-ключ в настройках (⚙) или включите режим «через Chatbox».');
    try {
      return parse(await viaApi({ system, user, schema, maxTokens, images }), schema);
    } catch (e) {
      // Браузер не достучался до сервиса (часто это запрет CORS) — предлагаем сделать этот запрос через Chatbox.
      if (e.network && manual && !noManual) return parse(await manual({ system, user, images, reason: e.message }), schema);
      throw e;
    }
  }

  // Один запрос с автоопределением формата: при отказе пробуем второй формат (Anthropic ↔ OpenAI-совместимый).
  async function viaApi({ system, user, schema, maxTokens, images }) {
    const fmt = pathFormat() || (settings.apiFormat === 'auto' ? (settings.detected || (known(settings.apiKey) || {}).format || 'anthropic') : settings.apiFormat);
    let text;
    try {
      text = await callAs(fmt, { system, user, schema, maxTokens, images });
    } catch (e) {
      const other = fmt === 'anthropic' ? 'openai' : 'anthropic';
      const switchable = settings.apiFormat === 'auto' && !settings.apiPath && !direct() && (e.network || [400, 404, 405, 415, 422].includes(e.status));
      if (!switchable) throw e;
      try { text = await callAs(other, { system, user, schema, maxTokens, images }); }
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
        messages: [{ role: 'system', content: req.system }, { role: 'user', content: openaiContent(req.user, req.images) }] });
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
        const r = await request(root() + '/v1/models', { headers: h });
        if (!r.ok) continue;
        const j = await r.json();
        const list = (j.data || j.models || []).map(m => m.id || m.name).filter(Boolean);
        if (list.length) return list;
      } catch (e) { /* пробуем дальше */ }
    }
    return [];
  }

  // ---------------------------------------------------------------- картинки
  // Сервис картинок: тот же шлюз, что для текста, Google Gemini (Nano Banana) или любой OpenAI-совместимый.
  // Форматы: gemini — generateContent с картинками-референсами; chat — /chat/completions с modalities image
  // (так шлюзы отдают Nano Banana и похожие модели); images — классический /images/generations.
  const IMG_DEFAULTS = { provider: 'same', apiKey: '', baseUrl: '', model: '', format: 'auto', concurrency: 2 };
  const imageSettings = () => Object.assign({}, IMG_DEFAULTS, settings.image || {});

  function imgCfg() {
    const c = imageSettings();
    const trim = u => (u || '').trim().replace(/\/+$/, '');
    if (c.provider === 'gemini') return { provider: 'gemini', format: 'gemini', key: c.apiKey.trim(), model: c.model.trim(),
      root: trim(c.baseUrl) || 'https://generativelanguage.googleapis.com' };
    if (c.provider === 'custom') return { provider: 'custom', format: c.format, key: c.apiKey.trim(), model: c.model.trim(), root: trim(c.baseUrl).replace(/\/v1$/, '') };
    return { provider: 'same', format: c.format, key: settings.apiKey.trim(), model: c.model.trim(), root: root() };
  }

  async function postJson(url, hdrs, body) {
    const text = await postText(url, hdrs, body);
    try { return JSON.parse(text); } catch (e) { throw new Error('Сервис ответил не JSON: ' + text.slice(0, 120)); }
  }

  async function postText(url, hdrs, body) {
    let r;
    try { r = await request(url, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, hdrs), body: JSON.stringify(body) }); }
    catch (e) {
      const err = new Error('Нет связи с ' + url.replace(/^https?:\/\//, '').split('/')[0] + ((await bridge()) ? '.' : '. Откройте студию через start-studio.bat.'));
      err.network = true; throw err;
    }
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}
    if (!r.ok) {
      const m = json && json.error ? (json.error.message || JSON.stringify(json.error)) : text.slice(0, 300);
      const err = new Error(explain(r.status, m)); err.status = r.status; err.raw = String(m);
      throw err;
    }
    return text;
  }

  function b64ToBlob(b64, mime) {
    const bin = atob(b64.replace(/\s/g, ''));
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime || 'image/png' });
  }

  async function urlToBlob(url) {
    const m = url.match(/^data:([^;,]+);base64,(.*)$/);
    if (m) return b64ToBlob(m[2], m[1]);
    const r = await request(url, { method: 'GET', headers: {} });
    if (!r.ok) throw new Error('Не удалось скачать картинку (' + r.status + ').');
    return r.blob();
  }

  const bearer = c => ({ authorization: 'Bearer ' + c.key });

  async function genGemini(c, prompt, refs, aspect) {
    const url = `${c.root}/v1beta/models/${encodeURIComponent(c.model.replace(/^models\//, ''))}:generateContent`;
    const parts = [{ text: prompt }].concat(refs.map(r => ({ inline_data: { mime_type: r.mime, data: r.b64 } })));
    const body = { contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: aspect } } };
    let j;
    try { j = await postJson(url, { 'x-goog-api-key': c.key }, body); }
    catch (e) {
      if (e.status !== 400 || !/imageConfig|aspect/i.test(e.raw || '')) throw e;
      delete body.generationConfig.imageConfig;
      j = await postJson(url, { 'x-goog-api-key': c.key }, body);
    }
    if (j.promptFeedback && j.promptFeedback.blockReason) throw new Error('Запрос отклонён фильтром сервиса: ' + j.promptFeedback.blockReason);
    const cand = (j.candidates || [])[0] || {};
    const out = (cand.content && cand.content.parts) || [];
    const im = out.find(p => p.inlineData || p.inline_data);
    if (!im) throw new Error('Сервис не вернул картинку' + (cand.finishReason ? ' (' + cand.finishReason + ')' : '') +
      (out.find(p => p.text) ? ': ' + out.find(p => p.text).text.slice(0, 150) : '.'));
    const d = im.inlineData || im.inline_data;
    return b64ToBlob(d.data, d.mimeType || d.mime_type);
  }

  function findImageUrl(msg) {
    for (const i of msg.images || []) {
      const u = i.image_url ? (i.image_url.url || i.image_url) : (i.url || (i.b64_json && 'data:image/png;base64,' + i.b64_json));
      if (u) return u;
    }
    if (Array.isArray(msg.content)) for (const p of msg.content) {
      if (p.image_url) return p.image_url.url || p.image_url;
      if (p.b64_json || (p.type === 'image' && p.data)) return 'data:image/png;base64,' + (p.b64_json || p.data);
    }
    const s = typeof msg.content === 'string' ? msg.content : '';
    const m = s.match(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/) || s.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/) || s.match(/https?:\/\/\S+\.(?:png|jpe?g|webp)\S*/i);
    return m ? (m[1] || m[0]) : null;
  }

  async function genChat(c, prompt, refs, aspect) {
    const content = [{ type: 'text', text: prompt + `\n\nAspect ratio ${aspect}.` }]
      .concat(refs.map(r => ({ type: 'image_url', image_url: { url: `data:${r.mime};base64,${r.b64}` } })));
    const j = await postJson(c.root + '/v1/chat/completions', bearer(c), { model: c.model, messages: [{ role: 'user', content }], modalities: ['image', 'text'] });
    const msg = ((j.choices || [])[0] || {}).message || {};
    const url = findImageUrl(msg);
    if (!url) {
      const err = new Error('Модель не вернула картинку' + (typeof msg.content === 'string' && msg.content ? ': ' + msg.content.slice(0, 150) : '.'));
      err.noImage = true; throw err;
    }
    return urlToBlob(url);
  }

  async function genImages(c, prompt, refs, aspect) {
    const body = { model: c.model, prompt, n: 1, size: aspect === '9:16' ? '1024x1536' : '1536x1024', response_format: 'b64_json' };
    let j;
    for (;;) {
      try { j = await postJson(c.root + '/v1/images/generations', bearer(c), body); break; }
      catch (e) {
        // Модели расходятся в параметрах: убираем тот, на который сервис ругается, и повторяем.
        if (e.status === 400 && body.response_format && /response_format/i.test(e.raw || '')) { delete body.response_format; continue; }
        if (e.status === 400 && body.size && /size/i.test(e.raw || '')) { delete body.size; continue; }
        throw e;
      }
    }
    const d = (j.data || [])[0] || {};
    if (d.b64_json) return b64ToBlob(d.b64_json, 'image/png');
    if (d.url) return urlToBlob(d.url);
    const err = new Error('Сервис не вернул картинку.'); err.noImage = true; throw err;
  }

  // Ищем в ответе API Responses (обычный JSON или поток событий) готовую картинку инструмента image_generation.
  function findGenerated(text) {
    const scan = o => {
      if (!o || typeof o !== 'object') return null;
      if (o.type === 'image_generation_call' && typeof o.result === 'string' && o.result.length > 100) return o.result;
      for (const k in o) { const r = scan(o[k]); if (r) return r; }
      return null;
    };
    try { return scan(JSON.parse(text)); } catch (e) {}
    let found = null;
    for (const line of text.split('\n')) {
      if (!line.startsWith('data:')) continue;
      try { found = scan(JSON.parse(line.slice(5).trim())) || found; } catch (e) {}
    }
    return found;
  }

  function responsesText(text) {
    const m = text.match(/"(?:output_)?text"\s*:\s*"((?:[^"\\]|\\.){1,200})/);
    return m ? m[1] : '';
  }

  async function genResponses(c, prompt, refs, aspect) {
    const content = [{ type: 'input_text', text: prompt + `\n\nDraw this image now with the image generation tool. Aspect ratio ${aspect}.` }]
      .concat(refs.map(r => ({ type: 'input_image', image_url: `data:${r.mime};base64,${r.b64}` })));
    const body = { model: c.model || settings.model, input: [{ role: 'user', content }],
      tools: [{ type: 'image_generation', size: aspect === '9:16' ? '1024x1536' : '1536x1024' }], tool_choice: { type: 'image_generation' } };
    // Особенности шлюза, найденные на прошлых картинках, применяем сразу, чтобы не тратить лишние запросы.
    const quirks = Object.assign({}, (settings.image || {}).quirks);
    if (quirks.noToolChoice) delete body.tool_choice;
    if (quirks.noSize) delete body.tools[0].size;
    if (quirks.stream) body.stream = true;
    const learn = q => { Object.assign(quirks, q); save(Object.assign({}, settings, { image: Object.assign({}, settings.image, { quirks }) })); };
    let text;
    for (;;) {
      try { text = await postText(c.root + '/v1/responses', bearer(c), body); break; }
      catch (e) {
        // Шлюзы по-разному понимают параметры: убираем тот, на который ругаются, и повторяем.
        if (e.status === 400 && body.tool_choice && /tool_choice/i.test(e.raw || '')) { delete body.tool_choice; learn({ noToolChoice: true }); continue; }
        if (e.status === 400 && body.tools[0].size && /size/i.test(e.raw || '')) { delete body.tools[0].size; learn({ noSize: true }); continue; }
        if (e.status === 400 && !body.stream && /stream/i.test(e.raw || '')) { body.stream = true; learn({ stream: true }); continue; }
        throw e;
      }
    }
    const b64 = findGenerated(text);
    if (!b64) {
      const said = responsesText(text);
      const err = new Error('Модель не нарисовала картинку' + (said ? ': ' + said : '.')); err.noImage = true; throw err;
    }
    return b64ToBlob(b64, 'image/png');
  }

  // Порядок форматов для «Авто»: сначала запомненный, потом подходящий к сервису и модели.
  function formatOrder(c) {
    if (c.format !== 'auto') return [c.format];
    const all = ['responses', 'chat', 'images'];
    const saved = (settings.image || {}).detected;
    const kf = (known(c.key) || {}).imageFormat;
    const m = c.model;
    const first = saved || kf || (/gpt-image|dall-e/i.test(m) ? 'images'
      : /image|banana|imagen|flux|seedream|kandinsky/i.test(m) ? 'chat'
      : !m || /^(gpt-|o\d|chatgpt|codex)/i.test(m) ? 'responses' : 'images');
    return [first].concat(all.filter(f => f !== first));
  }

  // Одна картинка: { prompt, refs: [{ mime, b64 }], aspect } → { blob, format }
  async function generateImage({ prompt, refs = [], aspect = '16:9' }) {
    const c = imgCfg();
    if (c.provider === 'same' && direct()) throw new Error('Anthropic не рисует картинки. В ⚙ → «Картинки» выберите сервис картинок.');
    if (!c.key) throw new Error('Укажите ключ сервиса картинок в ⚙ → «Картинки».');
    if (c.provider === 'custom' && !c.root) throw new Error('Укажите адрес сервиса картинок в ⚙ → «Картинки».');
    if (c.format === 'gemini') {
      if (!c.model) throw new Error('Укажите модель картинок в ⚙ → «Картинки» (кнопка «Проверить картинки» покажет список).');
      return { blob: await genGemini(c, prompt, refs, aspect), format: 'gemini' };
    }
    // Без модели картинок можно только через Responses: рисует модель, выбранная для текста.
    const order = formatOrder(c).filter(f => f === 'responses' || c.model);
    if (!order.length) throw new Error('Укажите модель картинок в ⚙ → «Картинки» или нажмите там «Подобрать автоматически».');
    const saved = (settings.image || {}).detected;
    let first = null;
    for (const f of order) {
      try {
        const blob = await ({ chat: genChat, images: genImages, responses: genResponses })[f](c, prompt, refs, aspect);
        if (c.format === 'auto' && saved !== f) save(Object.assign({}, settings, { image: Object.assign({}, settings.image, { detected: f }) }));
        return { blob, format: f };
      } catch (e) {
        if (!first) first = e;
        const tryOther = c.format === 'auto' && (e.noImage || [404, 405, 415, 422, 501, 503].includes(e.status) || (e.status === 400 && /modalit|not support|unknown|unrecogni|invalid|tool/i.test(e.raw || '')));
        if (!tryOther) throw e;
      }
    }
    throw first;
  }

  async function imageModels(all) {
    const c = imgCfg();
    const pick = list => { const img = list.filter(m => /image|banana|imagen|flux|dall|gpt-image|seedream|kandinsky|midjourney|recraft|ideogram/i.test(m)); return all || !img.length ? list : img; };
    try {
      if (c.format === 'gemini') {
        const r = await request(c.root + '/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': c.key } });
        if (!r.ok) return [];
        const j = await r.json();
        return pick((j.models || []).filter(m => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent')).map(m => m.name.replace(/^models\//, '')));
      }
      const r = await request(c.root + '/v1/models', { headers: bearer(c) });
      if (!r.ok) return [];
      const j = await r.json();
      return pick((j.data || j.models || []).map(m => m.id || m.name).filter(Boolean));
    } catch (e) { return []; }
  }

  // Подбор рабочего способа рисовать: перебираем модели и форматы на маленькой тестовой картинке.
  async function autoPickImage(onStep) {
    const c = imgCfg();
    if (c.format === 'gemini') throw new Error('Для Gemini выберите модель из списка и нажмите «Проверить картинки».');
    const list = await imageModels(true);
    const cands = [];
    const add = (format, model) => { if (model && !cands.some(x => x.format === format && x.model === model)) cands.push({ format, model }); };
    add('responses', settings.model);
    list.filter(m => /^(gpt-5|gpt-4\.1|gpt-4o|o\d)/i.test(m) && !/image|audio|realtime|transcri|tts|search|codex-mini/i.test(m)).slice(0, 3).forEach(m => add('responses', m));
    list.filter(m => /gpt-image|dall-e/i.test(m)).slice(0, 2).forEach(m => add('images', m));
    list.filter(m => /image|banana|imagen|flux|seedream/i.test(m) && !/gpt-image|dall-e/i.test(m)).slice(0, 3).forEach(m => add('chat', m));
    const before = settings.image;
    for (const cand of cands.slice(0, 8)) {
      onStep(`Пробую ${cand.model} (${cand.format})…`);
      save(Object.assign({}, settings, { image: Object.assign({}, before, { model: cand.model, format: cand.format, detected: '' }) }));
      try {
        const t0 = performance.now();
        const r = await generateImage({ prompt: 'A single red apple on a dark wooden table, soft side light, photographic film still. No text.', aspect: '16:9' });
        return Object.assign({ ms: performance.now() - t0 }, cand, r);
      } catch (e) {
        onStep(`✗ ${cand.model} (${cand.format}): ${e.message.slice(0, 140)}`);
        if (e.status === 401 || e.network) { save(Object.assign({}, settings, { image: before })); throw e; }
      }
    }
    save(Object.assign({}, settings, { image: before }));
    throw new Error('Ни один вариант не сработал. Похоже, ваш сервис не умеет рисовать картинки — выберите в «Сервис» Google Gemini или другой сервис картинок.');
  }

  // ---------------------------------------------------------------- видео
  // Видео рисуется долго (минуты), поэтому везде одна схема: создать задачу → опрашивать → скачать mp4.
  // openai — /v1/videos (Sora; так же отвечают и шлюзы); fal — очередь fal.ai; replicate — predictions;
  // gemini — Veo через predictLongRunning.
  const VID_DEFAULTS = { provider: 'none', apiKey: '', baseUrl: '', model: '', extra: '', concurrency: 1, maxPrompt: 2000 };
  const videoSettings = () => Object.assign({}, VID_DEFAULTS, settings.video || {});
  const VIDEO_MODELS = {
    same: ['sora-2', 'sora-2-pro'],
    openai: ['sora-2', 'sora-2-pro'],
    fal: ['fal-ai/kling-video/v2.1/standard/image-to-video', 'fal-ai/wan/v2.2-a14b/image-to-video', 'fal-ai/minimax/hailuo-02/standard/image-to-video', 'fal-ai/bytedance/seedance/v1/lite/image-to-video'],
    replicate: ['kwaivgi/kling-v2.1', 'wan-video/wan-2.2-i2v-fast', 'minimax/hailuo-02', 'bytedance/seedance-1-lite'],
    gemini: ['veo-3.0-fast-generate-001', 'veo-3.0-generate-001'],
  };

  function vidCfg() {
    const c = videoSettings();
    const trim = u => (u || '').trim().replace(/\/+$/, '');
    const base = { provider: c.provider, key: c.apiKey.trim(), model: c.model.trim(), extra: c.extra };
    if (c.provider === 'same') return Object.assign(base, { provider: 'openai', key: settings.apiKey.trim(), root: root(), model: base.model || 'sora-2' });
    if (c.provider === 'openai') return Object.assign(base, { root: trim(c.baseUrl).replace(/\/v1$/, '') || 'https://api.openai.com', model: base.model || 'sora-2' });
    if (c.provider === 'fal') return Object.assign(base, { root: trim(c.baseUrl) || 'https://queue.fal.run' });
    if (c.provider === 'replicate') return Object.assign(base, { root: trim(c.baseUrl) || 'https://api.replicate.com' });
    if (c.provider === 'gemini') return Object.assign(base, { root: trim(c.baseUrl) || 'https://generativelanguage.googleapis.com', model: base.model || 'veo-3.0-fast-generate-001' });
    return base;
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const nearest = (v, list) => list.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);

  async function getJson(url, hdrs) {
    let r;
    try { r = await request(url, { method: 'GET', headers: hdrs || {} }); }
    catch (e) { const err = new Error('Нет связи с ' + url.replace(/^https?:\/\//, '').split('/')[0]); err.network = true; throw err; }
    const text = await r.text();
    let j = null;
    try { j = JSON.parse(text); } catch (e) {}
    if (!r.ok) {
      const m = j && (j.error ? (j.error.message || j.error) : j.detail) || text.slice(0, 300);
      const err = new Error(explain(r.status, typeof m === 'string' ? m : JSON.stringify(m))); err.status = r.status; err.raw = String(m);
      throw err;
    }
    return j || {};
  }

  async function download(url, hdrs) {
    const r = await request(url, { method: 'GET', headers: hdrs || {} });
    if (!r.ok) throw new Error('Не удалось скачать видео (' + r.status + ').');
    const b = await r.blob();
    return b.type && b.type !== 'application/octet-stream' ? b : new Blob([b], { type: 'video/mp4' });
  }

  // Ищем ссылку на ролик в ответе любого формата.
  function findVideoUrl(o) {
    if (!o) return null;
    if (typeof o === 'string') return /^https?:\/\//.test(o) ? o : null;
    if (Array.isArray(o)) { for (const x of o) { const u = findVideoUrl(x); if (u) return u; } return null; }
    if (typeof o === 'object') {
      for (const k of ['video', 'videos', 'generatedSamples', 'samples', 'url', 'uri', 'output', 'download_url', 'file', 'data', 'result']) { const u = findVideoUrl(o[k]); if (u) return u; }
    }
    return null;
  }

  function extraParams(c) {
    if (!c.extra || !c.extra.trim()) return {};
    try { return JSON.parse(c.extra); } catch (e) { throw new Error('«Доп. параметры» видео — не JSON: ' + e.message); }
  }

  // Ожидание готовности: check() возвращает { done, url?, blob?, progress?, error? }.
  async function waitJob(check, onProgress, shouldStop) {
    const t0 = Date.now();
    for (let i = 0; ; i++) {
      if (shouldStop && shouldStop()) throw new Error('Остановлено');
      const st = await check();
      if (st.error) throw new Error('Сервис не смог сделать видео: ' + st.error);
      if (st.done) return st;
      const min = Math.floor((Date.now() - t0) / 60000), sec = Math.floor((Date.now() - t0) / 1000) % 60;
      onProgress((st.progress != null ? Math.round(st.progress) + '% · ' : '') + `${min}:${String(sec).padStart(2, '0')}`);
      if (Date.now() - t0 > 30 * 60000) throw new Error('Видео не готово за 30 минут — сервис, видимо, завис.');
      await sleep(i < 6 ? 5000 : 10000);
    }
  }

  // Sora ждёт кадр ровно в размере видео: подгоняем с обрезкой по центру.
  async function fitFrame(blob, w, h) {
    const bmp = await createImageBitmap(blob);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const k = Math.max(w / bmp.width, h / bmp.height);
    cv.getContext('2d').drawImage(bmp, (w - bmp.width * k) / 2, (h - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
    return new Promise(r => cv.toBlob(r, 'image/jpeg', 0.92));
  }

  async function vidOpenAI(c, o) {
    const size = o.aspect === '9:16' ? '720x1280' : '1280x720';
    const fd = new FormData();
    fd.append('model', c.model);
    fd.append('prompt', o.prompt);
    fd.append('seconds', String(nearest(o.seconds, [4, 8, 12])));
    fd.append('size', size);
    if (o.image) { const [w, h] = size.split('x').map(Number); fd.append('input_reference', await fitFrame(o.image.blob, w, h), 'frame.jpg'); }
    for (const [k, v] of Object.entries(extraParams(c))) fd.set(k, String(v));
    let r;
    try { r = await request(c.root + '/v1/videos', { method: 'POST', headers: bearer(c), body: fd }); }
    catch (e) { const err = new Error('Нет связи с сервисом видео.'); err.network = true; throw err; }
    const text = await r.text();
    let job = null;
    try { job = JSON.parse(text); } catch (e) {}
    if (!r.ok) {
      const m = job && job.error ? (job.error.message || JSON.stringify(job.error)) : text.slice(0, 300);
      const err = new Error(explain(r.status, m)); err.status = r.status; err.raw = m; throw err;
    }
    if (!job || !job.id) throw new Error('Сервис не вернул номер задачи: ' + text.slice(0, 150));
    await waitJob(async () => {
      const j = await getJson(`${c.root}/v1/videos/${job.id}`, bearer(c));
      if (j.status === 'failed') return { error: (j.error && (j.error.message || j.error.code)) || 'failed' };
      return { done: j.status === 'completed', progress: j.progress };
    }, o.onProgress, o.shouldStop);
    return download(`${c.root}/v1/videos/${job.id}/content`, bearer(c));
  }

  async function vidFal(c, o) {
    const hd = { authorization: 'Key ' + c.key };
    const input = Object.assign({ prompt: o.prompt, aspect_ratio: o.aspect, duration: String(nearest(o.seconds, [5, 10])) },
      o.image ? { image_url: `data:${o.image.mime};base64,${o.image.b64}` } : {}, extraParams(c));
    const sub = await postJson(`${c.root}/${c.model}`, hd, input);
    const id = sub.request_id;
    const statusUrl = sub.status_url || `${c.root}/${c.model}/requests/${id}/status`;
    const resultUrl = sub.response_url || `${c.root}/${c.model}/requests/${id}`;
    await waitJob(async () => {
      const j = await getJson(statusUrl, hd);
      if (/FAIL|ERROR/i.test(j.status || '')) return { error: j.error || j.status };
      return { done: j.status === 'COMPLETED', progress: null };
    }, o.onProgress, o.shouldStop);
    const res = await getJson(resultUrl, hd);
    const url = findVideoUrl(res);
    if (!url) throw new Error('В ответе нет ссылки на видео: ' + JSON.stringify(res).slice(0, 150));
    return download(url);
  }

  async function vidReplicate(c, o) {
    const imgKey = /kling/i.test(c.model) ? 'start_image' : /minimax|hailuo/i.test(c.model) ? 'first_frame_image' : 'image';
    const input = Object.assign({ prompt: o.prompt, duration: nearest(o.seconds, [5, 10]), aspect_ratio: o.aspect },
      o.image ? { [imgKey]: `data:${o.image.mime};base64,${o.image.b64}` } : {}, extraParams(c));
    const versioned = c.model.includes(':');
    const job = await postJson(versioned ? `${c.root}/v1/predictions` : `${c.root}/v1/models/${c.model}/predictions`, bearer(c),
      versioned ? { version: c.model.split(':')[1], input } : { input });
    const getUrl = (job.urls && job.urls.get) || `${c.root}/v1/predictions/${job.id}`;
    let out = null;
    await waitJob(async () => {
      const j = await getJson(getUrl, bearer(c));
      if (j.status === 'failed' || j.status === 'canceled') return { error: j.error || j.status };
      if (j.status === 'succeeded') { out = j.output; return { done: true }; }
      return { done: false };
    }, o.onProgress, o.shouldStop);
    const url = findVideoUrl(out);
    if (!url) throw new Error('В ответе нет ссылки на видео.');
    return download(url);
  }

  async function vidVeo(c, o) {
    const hd = { 'x-goog-api-key': c.key };
    const inst = { prompt: o.prompt };
    if (o.image) inst.image = { bytesBase64Encoded: o.image.b64, mimeType: o.image.mime };
    const op = await postJson(`${c.root}/v1beta/models/${c.model.replace(/^models\//, '')}:predictLongRunning`, hd,
      { instances: [inst], parameters: Object.assign({ aspectRatio: o.aspect }, extraParams(c)) });
    let res = null;
    await waitJob(async () => {
      const j = await getJson(`${c.root}/v1beta/${op.name}`, hd);
      if (j.error) return { error: j.error.message || JSON.stringify(j.error) };
      if (j.done) { res = j.response; return { done: true }; }
      return { done: false };
    }, o.onProgress, o.shouldStop);
    const url = findVideoUrl(res && (res.generateVideoResponse || res));
    if (!url) throw new Error('Сервис не вернул видео' + (res && res.generateVideoResponse && res.generateVideoResponse.raiMediaFilteredReasons ? ': ' + res.generateVideoResponse.raiMediaFilteredReasons.join('; ') : '.'));
    return download(url, hd);
  }

  // { prompt, image?: { blob, mime, b64 }, seconds, aspect, onProgress, shouldStop } → Blob (mp4)
  async function generateVideo(o) {
    const c = vidCfg();
    if (!c.provider || c.provider === 'none') throw new Error('Выберите сервис видео в ⚙ → «Видео».');
    if (!c.key) throw new Error('Укажите ключ сервиса видео в ⚙ → «Видео».');
    if (!c.model) throw new Error('Укажите модель видео в ⚙ → «Видео».');
    if (c.provider === 'replicate' && !(await bridge())) throw new Error('Replicate работает только через мост: откройте студию через start-studio.bat.');
    o = Object.assign({ seconds: 5, aspect: '16:9', onProgress: () => {} }, o);
    const fn = { openai: vidOpenAI, fal: vidFal, replicate: vidReplicate, gemini: vidVeo }[c.provider];
    return fn(c, o);
  }

  const VISUAL_RULES = `Rules for every description:
- English, present tense, concrete and visual: who is in frame, what they do, what is around them.
- Never use personal names or place names; describe people by appearance cue ("the man in the black cloak", "the elf woman with the scarlet ponytail", "the small elf girl").
- Do not describe camera framing or lens (added separately), music, or sound.
- No text, letters or signs in the frame.
- 1–3 sentences, at most 60 words.`;

  // Переводит шоты сцены в английские визуальные описания для генераторов картинок и видео.
  async function describeScene(scene, ctx, cast) {
    const shots = scene.shots.map((s, i) => ({
      i, kind: s.kind, action: s.text || (s.title ? 'Title card on black: ' + s.title : ''),
      dialogue: s.dialogue.map(d => `${d.who}${d.vo ? ' (V.O.)' : ''}: ${d.line}`).join(' / '),
    }));
    const system = `You are a storyboard artist preparing prompts for an AI image model and an AI video model. The film is described below.\n\n${ctx}\n\n${VISUAL_RULES}`;
    const user = `Scene ${scene.num}. ${scene.heading}. Type: ${scene.type}.\n${scene.notes.join('\n')}\n\nFor each shot return:\n- "image": what the still frame shows (the moment of the shot);\n- "motion": what moves during the shot for the video model (actions, camera-independent), one sentence;\n- "characters": which of these characters are visible in the frame (exact names from this list, [] if none): ${(cast || []).join(', ')}. A character speaking off-screen (V.O.) is not visible unless the action shows them.\nDialogue shots: show the speaker in the act of speaking.\n\nShots (JSON):\n${JSON.stringify(shots, null, 1)}`;
    const schema = {
      type: 'object', additionalProperties: false, required: ['shots'],
      properties: { shots: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['i', 'image', 'motion', 'characters'],
        properties: { i: { type: 'integer' }, image: { type: 'string' }, motion: { type: 'string' }, characters: { type: 'array', items: { type: 'string' } } } } } },
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

  return { get settings() { return settings; }, save, known, call, ping, models, describeScene, locationSet, characterTags, setManual: fn => { manual = fn; }, bridge,
    imageSettings, generateImage, imageModels, autoPickImage, videoSettings, generateVideo, VIDEO_MODELS, imageNeedsModel: () => { const c = imgCfg(); return c.format === 'gemini' || formatOrder(c)[0] !== 'responses'; } };
})();
