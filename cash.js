// cash.js — сценарий «Кэш»: стол на 2–9 игроков, равные стартовые стеки в BB.
// Стол, позиции и разбор фраз — из tour-engine.js. Здесь: запуск и расчёты для совета (эквити, пот-оддсы, диапазоны открытия).
(function () {
  const E = () => window.TourEngine;

  // названия позиций при данном числе игроков (как в tour-engine.js)
  const EARLY = {
    0: [], 1: ['CO'], 2: ['HJ', 'CO'], 3: ['UTG', 'HJ', 'CO'], 4: ['UTG', 'LJ', 'HJ', 'CO'],
    5: ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO'], 6: ['UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO'],
  };
  function positionsFor(n) {
    if (n === 2) return ['BTN', 'BB'];
    return [...(EARLY[n - 3] || []), 'BTN', 'SB', 'BB'];
  }
  const POS_LABEL = { BTN: 'Баттон', SB: 'МБ', BB: 'ББ', CO: 'CO', HJ: 'HJ', LJ: 'LJ', UTG: 'UTG', 'UTG+1': 'UTG+1', 'UTG+2': 'UTG+2' };
  const POS_RU = () => E().POS_RU;

  // Ориентиры диапазона открытия первым (в % рук) — стандартные значения для онлайн-кэша 100 BB
  function rfiPct(pos, n) {
    if (n === 2) return 80;                      // хедз-ап: баттон (он же МБ)
    if (n === 3) return { BTN: 48, SB: 55 }[pos] ?? 100;
    const six = { UTG: 15, HJ: 19, CO: 27, BTN: 43, SB: 40, LJ: 17 };
    const nine = { UTG: 10, 'UTG+1': 11, 'UTG+2': 12, LJ: 14, HJ: 18, CO: 26, BTN: 42, SB: 40 };
    const t = n >= 7 ? nine : six;
    return t[pos] ?? 20;
  }

  // В какой топ-% попадает рука (по эквити против случайной руки)
  function handTopPct(cls) {
    const R = window.HAND_RANKING;
    let n = 0;
    for (const c of R) {
      n += c.length === 2 ? 6 : c[2] === 's' ? 4 : 12;
      if (c === cls) return Math.round(n / 1326 * 1000) / 10;
    }
    return 100;
  }

  function start(size, stackBB, myPos) {
    const T = E();
    const r = T.applyCommands(T.initialState(), T.sortCommands([
      { type: 'table', size }, { type: 'myPos', pos: myPos },
    ]));
    const st = r.state;
    st.seats.forEach(s => { s.stack = stackBB; });
    st.cash = { size, stack: stackBB };
    return st;
  }

  const r1 = x => Math.round(x * 10) / 10;

  function analyze(st) {
    const T = E();
    if (!st || !st.cash || !st.hand) return null;
    const p = T.positions(st);
    const m = T.tableMoney(st);
    const n = p.order.length;
    const me = p.order.indexOf(1);
    if (me < 0) return null;
    const myPos = p.bySeat[1] === 'BTN/SB' ? 'BTN' : p.bySeat[1];
    const cls = st.hand.cards;
    const H = st.seats[0].stack;
    const acts = {};
    st.hand.actions.forEach(a => { acts[a.seat] = a; });
    const before = p.order.slice(0, me);
    const raisers = before.filter(x => acts[x] && (acts[x].act === 'raise' || acts[x].act === 'allin'));
    const limpers = before.filter(x => acts[x] && acts[x].act === 'limp');
    const callers = before.filter(x => acts[x] && acts[x].act === 'call');
    const top = handTopPct(cls);
    const lines = [];
    const posOf = s => (POS_RU()[p.bySeat[s]] || p.bySeat[s]);
    const stackOf = s => st.seats[s - 1].stack;
    const eff = s => Math.min(H ?? 100, stackOf(s) ?? 100);

    try {
      if (!raisers.length && !limpers.length && !callers.length) {
        if (myPos === 'BB') return 'Все сфолдили до большого блайнда — банк мой без борьбы.';
        const rfi = rfiPct(myPos, n);
        lines.push(`Расчёт приложения: ${cls} — это топ ${top}% рук. Ориентир открытия первым с позиции ${POS_RU()[myPos] || myPos} за столом на ${n}: около ${rfi}% рук → рука ${top <= rfi ? 'ВХОДИТ в диапазон открытия' : 'НЕ входит в диапазон открытия (фолд)'}.`);
        lines.push(myPos === 'SB' ? 'Размер открытия из МБ: около 3 BB.' : myPos === 'BTN' ? 'Размер открытия: 2–2.5 BB.' : 'Размер открытия: 2.5 BB.');
        return lines.join('\n');
      }
      if (!raisers.length && limpers.length) {
        const rfi = rfiPct(myPos === 'BB' ? 'SB' : myPos, n);
        lines.push(`Расчёт приложения: перед мной лимперы (${limpers.length}). ${cls} — топ ${top}% рук.`);
        lines.push(`Изолирующий рейз: ${3 + limpers.length} BB в позиции, ${4 + limpers.length} BB без позиции. С сильными и играбельными руками (примерно топ ${Math.round(rfi * 0.6)}%) — изоляция, спекулятивные можно доставить${myPos === 'BB' ? ' или чекнуть' : ''}.`);
        return lines.join('\n');
      }
      if (raisers.length === 1) {
        const r = raisers[0];
        const a = acts[r];
        const allin = a.act === 'allin';
        const rPos = p.bySeat[r] === 'BTN/SB' ? 'BTN' : p.bySeat[r];
        // олл-ин: чем он глубже, тем уже диапазон (глубокие пуши в кэше — почти всегда премиум)
        const shove = a.amount || stackOf(r) || 100;
        let pct = allin ? (shove > 40 ? 4 : shove > 20 ? 8 : 15) : Math.min(rfiPct(rPos, n) + 3, 85);
        const rangeTxt = `топ ${pct}%`;
        const eq = window.Poker.calcEquity(cls, [rangeTxt, ...callers.map(() => 'top 20%')], '', 8000).hero_equity_pct;
        const need = m.toCall / (m.pot + m.toCall) * 100;
        const ip = p.order.indexOf(1) > p.order.indexOf(r) && !['SB', 'BB'].includes(myPos);
        lines.push(`Расчёт приложения: ${allin ? 'олл-ин' : 'рейз'} игрока ${r} (${posOf(r)}${a.amount ? ', ' + r1(a.amount) + ' BB' : ''}; предполагаемый диапазон ${rangeTxt})${callers.length ? `, коллы: ${callers.length}` : ''}.`);
        lines.push(`Моё эквити ${eq}% против этого диапазона, по пот-оддсам для колла нужно ${r1(need)}% (доставить ${r1(m.toCall)} BB в банк ${r1(m.pot)} BB).`);
        if (allin) {
          lines.push(`Олл-ин — дальше игры нет, решение чисто по эквити: ${eq > need ? 'КОЛЛ прибылен' : 'ФОЛД'}.`);
        } else {
          const size = ip ? 3 : 4;
          const threeBet = r1((a.amount || 2.5) * size + (callers.length ? callers.length * (a.amount || 2.5) : 0));
          lines.push(`Эффективный стек ${r1(eff(r))} BB. ${ip ? 'Я в позиции' : 'Я без позиции'} — ${ip ? 'эквити реализуется лучше' : 'эквити реализуется хуже, колл нужен с запасом'}.`);
          lines.push(`Ориентир: 3-бет примерно до ${threeBet} BB с топ ~${Math.max(3, Math.round(pct / 4))}% (вэлью) и частью блефов с блокерами; колл — с руками, у которых эквити с запасом выше нужного и хорошая играбельность; остальное фолд.`);
        }
        return lines.join('\n');
      }
      if (raisers.length >= 2) {
        const last = raisers[raisers.length - 1];
        const a = acts[last];
        const pct = a.act === 'allin' ? 8 : 6;
        const eq = window.Poker.calcEquity(cls, [`top ${pct}%`], '', 8000).hero_equity_pct;
        const need = m.toCall / (m.pot + m.toCall) * 100;
        lines.push(`Расчёт приложения: перед мной рейз и ре-рейз (последний — игрок ${last}, ${posOf(last)}; предполагаемый диапазон топ ${pct}%).`);
        lines.push(`Моё эквити ${eq}%, по пот-оддсам нужно ${r1(need)}%. Против 3-бета и 4-бета продолжают в основном с премиум-руками (QQ+, AK).`);
        return lines.join('\n');
      }
    } catch (e) {
      return 'Расчёт приложения не выполнен: ' + e.message;
    }
    return null;
  }

  function context(st) {
    if (!st || !st.cash) return '';
    const lines = [`ФОРМАТ: кэш-игра, стол на ${st.cash.size}, стартовые стеки ${st.cash.stack} BB. Фишки = деньги, ICM нет, решения по EV в BB.`];
    const a = analyze(st);
    if (a) lines.push(a);
    return lines.join('\n');
  }

  const ADVICE_SYSTEM = `Ты тренер по кэш-играм в безлимитный холдем (онлайн, 2–9 игроков), игра на виртуальные фишки, цель — обучение.
Тебе дают точное состояние стола префлоп (позиции, стеки и ставки в BB, действия соперников) и, если есть, РАСЧЁТ ПРИЛОЖЕНИЯ (процентиль руки, эквити против предполагаемого диапазона, пот-оддсы).
Особенности кэша: фишки равны деньгам, ICM нет, стеки обычно глубокие (100 BB), важны позиция, размеры ставок и реализация эквити; пуш-фолд почти не применяется.
Ответ будет озвучен голосом:
- по-русски, 1–2 коротких предложения, без списков, звёздочек и символов;
- начинай с действия: «Фолд», «Колл», «Рейз до …», «Три-бет до …», «Олл-ин», «Чек»;
- размеры называй в BB («рейз до двух с половиной»);
- если есть расчёт приложения — опирайся на него и не пересчитывай; кратко объясни: позиция, диапазон соперника, пот-оддсы или глубина стеков;
- карты и позиции называй словами по-русски, не пиши латинские обозначения вроде A5s;
- не называй точных процентов эквити.
Если стеки соперников неизвестны — считай по 100 BB. Не переспрашивай.`;

  window.CASH = { positionsFor, POS_LABEL, rfiPct, handTopPct, start, analyze, context, ADVICE_SYSTEM };
})();
