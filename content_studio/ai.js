'use strict';
// Обращения к Claude прямо из браузера (как в покерном тренере: ключ хранится только на устройстве).

const AI = (() => {
  const DEFAULTS = { apiKey: '', model: 'claude-opus-5-5', baseUrl: '', effort: 'medium' };
  let settings = Object.assign({}, DEFAULTS);
  try { Object.assign(settings, JSON.parse(localStorage.getItem('cs-ai') || '{}')); } catch (e) {}

  const save = s => { settings = Object.assign({}, DEFAULTS, s); try { localStorage.setItem('cs-ai', JSON.stringify(settings)); } catch (e) {} };
  const root = () => (settings.baseUrl || 'https://api.anthropic.com').trim().replace(/\/+$/, '').replace(/\/v1$/, '');

  async function call({ system, user, schema, maxTokens = 16000 }) {
    if (!settings.apiKey) throw new Error('Укажите API-ключ Claude в настройках (⚙).');
    const body = {
      model: settings.model, max_tokens: maxTokens, system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort: settings.effort || 'medium' },
      fallbacks: 'default',
    };
    if (schema) body.output_config.format = { type: 'json_schema', schema };
    const headers = {
      'content-type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
    let resp;
    try {
      resp = await fetch(root() + '/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) });
      // Прокси или старый шлюз может не знать параметр fallbacks — повторяем без него.
      if (resp.status === 400) {
        const j = await resp.clone().json().catch(() => ({}));
        if (/fallback/i.test(JSON.stringify(j))) {
          delete body.fallbacks; delete headers['anthropic-beta'];
          resp = await fetch(root() + '/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) });
        }
      }
    } catch (e) {
      throw new Error('Нет связи с сервером Claude (' + root() + '). Проверьте интернет/VPN или адрес прокси.');
    }
    if (!resp.ok) {
      let msg = resp.status + ' ' + resp.statusText;
      try { const j = await resp.json(); msg = (j.error && j.error.message) || msg; } catch (e) {}
      if (resp.status === 401) msg = 'Неверный API-ключ (401).';
      throw new Error(msg);
    }
    const data = await resp.json();
    if (data.stop_reason === 'refusal') throw new Error('Модель отказалась отвечать на этот запрос' + (data.stop_details && data.stop_details.explanation ? ': ' + data.stop_details.explanation : '.'));
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    if (!schema) return text;
    try { return JSON.parse(text); } catch (e) {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
      throw new Error('Не удалось разобрать ответ модели.');
    }
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

  return { get settings() { return settings; }, save, call, describeScene, locationSet, characterTags };
})();
