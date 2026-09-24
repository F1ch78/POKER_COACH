// «Мозг»: Claude API напрямую с телефона (стриминг + инструменты), карточка сессии, база знаний.
const SYSTEM_PROMPT = `Ты — профессиональный игрок в покер и тренер (турниры MTT, Spin&Go, SNG). Ты ведёшь голосовой разбор раздач с учеником: он рассказывает про турниры и раздачи, ты объясняешь, как правильно играть и почему.

КАК ОТВЕЧАТЬ (ответ будет озвучен голосом):
- Говори как живой тренер: коротко и по делу, обычно 2–6 предложений. Подробнее — только если просят.
- Сначала вывод (что делать), потом главная причина. Без воды и без повторения вопроса.
- Никакого форматирования: без списков, звёздочек, заголовков, таблиц, эмодзи.
- Карты называй по-русски словами: «туз-пятёрка одномастные», «пара семёрок», «король-девять разномастные». Не пиши латинские обозначения вроде A5s в ответе. Позиции: баттон, малый блайнд, большой блайнд, ранняя позиция и т. п. Числа можно цифрами.
- Если в рассказе не хватает данных, критичных для решения (стек, позиция, действия), спроси коротко одно уточнение.
- Текст ученика получен распознаванием речи и может содержать ошибки: «ТУС» — туз, «блан» — блайнд и т. п. Понимай по смыслу.

КОНТЕКСТ И КАРТОЧКА СЕССИИ:
- Ниже дана карточка сессии: турнир, список раздач и текущая раздача. Опирайся на неё и не переспрашивай то, что там уже есть.
- Когда ученик сообщает новые данные о турнире — сразу вызови update_tournament.
- Когда он начинает новую раздачу («следующая раздача», «дальше была рука…») — вызови upsert_hand без hand_id (создастся новая раздача и станет текущей). Вводные турнира (блайнды, стек) подставляй сам, если он их не менял.
- Когда он уточняет или исправляет текущую раздачу — upsert_hand с её hand_id.
- «Вернись ко второй», «в той раздаче» — переключись через set_current_hand и отвечай про неё.
- В полях карточки пиши карты в нотации: As 5s или A5s, стеки в BB или фишках, как сказал ученик.

РАСЧЁТЫ:
- Эквити, пот-оддсы, EV пуша никогда не считай в уме — вызывай calc_equity, pot_odds, push_ev и опирайся на результат. Диапазоны оппонентов оценивай сам по ситуации и типичной игре на этих лимитах и скажи ученику, какой диапазон ты предположил.
- Нотация для инструментов: конкретные карты 'Ah5h', класс 'A5s'/'KTo'/'77', диапазоны '77+,A2s+,KTo+', 'top 25%', 'random'.

БАЗА ЗНАНИЙ:
- Если ниже есть фрагменты из базы ученика — они в приоритете, опирайся на них. Для дополнительного поиска есть search_knowledge.`;

const TOOLS = [
  { name: 'update_tournament', description: 'Записать/обновить сведения о турнире в карточке сессии.',
    input_schema: { type: 'object', properties: {
      title: { type: 'string', description: 'короткое название сессии' },
      format: { type: 'string', description: 'Spin&Go / MTT / SNG ...' }, buy_in: { type: 'string' },
      players: { type: 'integer' }, starting_stack: { type: 'string' }, stage: { type: 'string' },
      blinds: { type: 'string' }, ante: { type: 'string' }, hero_stack: { type: 'string' }, notes: { type: 'string' } } } },
  { name: 'upsert_hand', description: 'Создать новую раздачу (без hand_id) или обновить существующую (с hand_id). По умолчанию делает её текущей.',
    input_schema: { type: 'object', properties: {
      hand_id: { type: 'integer' }, hero_position: { type: 'string' }, hero_cards: { type: 'string' },
      hero_stack: { type: 'string' }, blinds: { type: 'string' },
      villains: { type: 'string', description: 'оппоненты: позиции, стеки, особенности' },
      preflop: { type: 'string' }, flop: { type: 'string' }, turn: { type: 'string' }, river: { type: 'string' },
      result: { type: 'string' }, notes: { type: 'string' },
      summary: { type: 'string', description: 'одна строка — суть раздачи' }, make_current: { type: 'boolean' } } } },
  { name: 'set_current_hand', description: 'Переключить текущую раздачу.',
    input_schema: { type: 'object', properties: { hand_id: { type: 'integer' } }, required: ['hand_id'] } },
  { name: 'calc_equity', description: 'Эквити руки героя против одного или нескольких диапазонов (Монте-Карло).',
    input_schema: { type: 'object', properties: {
      hero: { type: 'string', description: "'Ah5h' или 'A5s'" },
      villains: { type: 'array', items: { type: 'string' }, description: "диапазон каждого оппонента: 'top 20%', '77+,ATs+', 'random', 'KdKc'" },
      board: { type: 'string', description: "карты борда, напр. 'Kc7d2h' или пусто" } }, required: ['hero', 'villains'] } },
  { name: 'pot_odds', description: 'Пот-оддсы: сколько эквити нужно для колла.',
    input_schema: { type: 'object', properties: {
      pot: { type: 'number', description: 'банк до нашего колла, включая ставку оппонента' }, to_call: { type: 'number' } },
      required: ['pot', 'to_call'] } },
  { name: 'push_ev', description: 'Чип-EV олл-ина префлоп против диапазонов колла оппонентов (по сравнению с фолдом), с сайд-потами.',
    input_schema: { type: 'object', properties: {
      hero_hand: { type: 'string' },
      hero_stack_bb: { type: 'number', description: 'стек героя в BB на начало раздачи' },
      hero_posted_bb: { type: 'number', description: 'уже поставлено героем: МБ 0.5, ББ 1, иначе 0' },
      antes_bb: { type: 'number', description: 'сумма всех анте в BB' },
      villains: { type: 'array', description: 'оппоненты, которым ходить после пуша, по порядку',
        items: { type: 'object', properties: { stack_bb: { type: 'number' }, posted_bb: { type: 'number' }, call_range: { type: 'string' } },
          required: ['stack_bb', 'call_range'] } } },
      required: ['hero_hand', 'hero_stack_bb', 'villains'] } },
  { name: 'search_knowledge', description: 'Поиск по локальной базе знаний ученика (книги, конспекты, чарты).',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
];

class Brain {
  constructor(settings, session) {
    this.settings = settings;
    this.session = session;
    this.onCardChanged = () => {};
    this.onLog = () => {};
    this.abort = null;
  }

  url() {
    const base = (this.settings.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
    return base + '/v1/messages';
  }
  headers() {
    return {
      'content-type': 'application/json',
      'x-api-key': this.settings.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  }

  runTool(name, a) {
    const s = this.session;
    try {
      switch (name) {
        case 'update_tournament': { const r = s.updateTournament(a); this.onCardChanged(); return r; }
        case 'upsert_hand': { const r = s.upsertHand(a); this.onCardChanged(); return r; }
        case 'set_current_hand': { const r = s.setCurrentHand(+a.hand_id); this.onCardChanged(); return r; }
        case 'calc_equity': return Poker.calcEquity(a.hero, a.villains, a.board || '');
        case 'pot_odds': return Poker.potOdds(+a.pot, +a.to_call);
        case 'push_ev': return Poker.pushEV(a.hero_hand, a.hero_stack_bb, a.villains || [], a.hero_posted_bb, a.antes_bb);
        case 'search_knowledge': {
          const hits = KB.search(a.query, 4);
          return hits.length ? { results: hits.map(h => ({ source: h.src, text: h.text })) } : { results: [], note: 'в базе ничего не найдено' };
        }
      }
      return { error: 'неизвестный инструмент ' + name };
    } catch (e) {
      return { error: String(e.message || e) };
    }
  }

  system(userText) {
    const parts = [SYSTEM_PROMPT, '\n=== КАРТОЧКА СЕССИИ ===\n' + this.session.cardText()];
    const hand = this.session.currentHand();
    const hits = KB.search(userText + ' ' + (hand && hand.summary || ''), 3);
    if (hits.length) parts.push('\n=== ИЗ БАЗЫ ЗНАНИЙ УЧЕНИКА ===\n' + hits.map(h => `[${h.src}]\n${h.text}`).join('\n---\n'));
    return parts.join('\n');
  }

  // Один потоковый запрос. Возвращает {content, stop_reason}
  async streamOnce(body, onText) {
    this.abort = new AbortController();
    const resp = await fetch(this.url(), {
      method: 'POST', headers: this.headers(), signal: this.abort.signal,
      body: JSON.stringify(Object.assign({}, body, { stream: true })),
    });
    if (!resp.ok) {
      let msg = resp.status + ' ' + resp.statusText;
      try { const j = await resp.json(); msg = (j.error && j.error.message) || msg; } catch (e) {}
      throw new Error(explainHttp(resp.status, msg));
    }
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const blocks = [];
    let stop = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const dataLine = raw.split('\n').find(l => l.startsWith('data:'));
        if (!dataLine) continue;
        let ev;
        try { ev = JSON.parse(dataLine.slice(5).trim()); } catch (e) { continue; }
        switch (ev.type) {
          case 'content_block_start': {
            const b = ev.content_block;
            blocks[ev.index] = b.type === 'tool_use' ? { type: 'tool_use', id: b.id, name: b.name, input: {}, _json: '' }
              : { type: 'text', text: b.text || '' };
            break;
          }
          case 'content_block_delta': {
            const b = blocks[ev.index];
            if (ev.delta.type === 'text_delta') { b.text += ev.delta.text; onText(ev.delta.text); }
            else if (ev.delta.type === 'input_json_delta') b._json += ev.delta.partial_json;
            break;
          }
          case 'content_block_stop': {
            const b = blocks[ev.index];
            if (b && b.type === 'tool_use') {
              try { b.input = b._json ? JSON.parse(b._json) : {}; } catch (e) { b.input = {}; }
              delete b._json;
            }
            break;
          }
          case 'message_delta':
            if (ev.delta && ev.delta.stop_reason) stop = ev.delta.stop_reason;
            break;
          case 'error':
            throw new Error((ev.error && ev.error.message) || 'Ошибка потока');
        }
      }
    }
    return { content: blocks.filter(Boolean), stop_reason: stop };
  }

  async compress() {
    const hist = this.session.data.history;
    const max = this.settings.maxHistory || 40;
    if (hist.length <= max) return;
    let cut = hist.length - Math.floor(max / 2);
    if (hist[cut].role !== 'user') cut++;
    const old = hist.slice(0, cut);
    const text = old.map(m => (m.role === 'user' ? 'Ученик: ' : 'Тренер: ') + m.content).join('\n');
    try {
      const r = await fetch(this.url(), { method: 'POST', headers: this.headers(), body: JSON.stringify({
        model: this.settings.model, max_tokens: 600,
        messages: [{ role: 'user', content: 'Сожми разбор покерной сессии в выжимку до 150 слов: ключевые выводы по раздачам, ошибки ученика, договорённости. Предыдущая выжимка: ' + (this.session.data.summary || 'нет') + '\n\nНовый фрагмент:\n' + text }],
      }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error && j.error.message);
      this.session.data.summary = j.content.filter(b => b.type === 'text').map(b => b.text).join('');
      this.session.data.history = hist.slice(cut);
      await this.session.save();
    } catch (e) { this.onLog('Не удалось сжать историю: ' + e.message); }
  }

  async ask(userText, onText) {
    await this.compress();
    const messages = this.session.data.history.map(m => ({ role: m.role, content: m.content }));
    messages.push({ role: 'user', content: userText });
    const system = this.system(userText);
    let answer = '';
    const emit = t => { answer += t; onText(t); };
    for (let round = 0; round < 8; round++) {
      const msg = await this.streamOnce({ model: this.settings.model, max_tokens: 1200, system, messages, tools: TOOLS }, emit);
      if (msg.stop_reason !== 'tool_use') break;
      messages.push({ role: 'assistant', content: msg.content.filter(b => b.type === 'tool_use' || (b.text || '').length) });
      const results = [];
      for (const b of msg.content) {
        if (b.type !== 'tool_use') continue;
        const res = this.runTool(b.name, b.input);
        this.onLog(`🔧 ${b.name} → ${JSON.stringify(res).slice(0, 200)}`);
        results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(res) });
      }
      messages.push({ role: 'user', content: results });
      emit(' ');
    }
    answer = answer.trim();
    this.session.addTurn('user', userText);
    this.session.addTurn('assistant', answer || '(без ответа)');
    return answer;
  }

  async ping() {
    const r = await fetch(this.url(), { method: 'POST', headers: this.headers(),
      body: JSON.stringify({ model: this.settings.model, max_tokens: 5, messages: [{ role: 'user', content: 'Скажи: ок' }] }) });
    if (!r.ok) {
      let msg = r.status;
      try { const j = await r.json(); msg = j.error && j.error.message || msg; } catch (e) {}
      throw new Error(explainHttp(r.status, msg));
    }
    return true;
  }
}

function explainHttp(status, msg) {
  const hint = {
    401: 'Неверный API-ключ.',
    403: 'Доступ запрещён — возможно, API недоступен из вашего региона без VPN.',
    404: 'Не найдена модель — проверьте название модели в настройках.',
    429: 'Слишком много запросов или закончился баланс.',
    529: 'Сервер Claude перегружен, повторите через минуту.',
  }[status];
  return (hint ? hint + ' ' : '') + '(' + msg + ')';
}

if (typeof module !== 'undefined') module.exports = { Brain, TOOLS, SYSTEM_PROMPT };
