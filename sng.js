// sng.js — сценарий «Sit&Go» (PokerOK Spin & Gold, 3-max и 6-max).
// Стол, позиции и разбор фраз — из tour-engine.js. Здесь: запуск, выплаты, пересчёт стеков, расчёт ICM для совета.
(function () {
  const E = () => window.TourEngine;

  const MULTS = {
    3: ['2', '3', '4', '5', '10', '50', '100', 'jackpot'],
    6: ['4', '6', '8', '10', '20', '100', '200', 'jackpot'],
  };
  const multLabel = m => m === 'jackpot' ? 'Джекпот' : 'x' + m;
  // стартовый стек по умолчанию: два самых частых множителя — 300, остальные — 500
  const defaultChips = (fmt, mult) => (MULTS[fmt].indexOf(mult) < 2 ? 300 : 500);
  const POSITIONS = { 3: ['BTN', 'SB', 'BB'], 6: ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'] };
  const POS_LABEL = { BTN: 'Баттон', SB: 'МБ', BB: 'ББ', UTG: 'UTG', HJ: 'HJ', CO: 'CO' };

  function payouts(fmt, mult) {
    return (window.ICM.SPIN_GOLD_PAYOUTS[fmt] || {})[mult] || [1];
  }

  // Новый стол Sit&Go: все стеки одинаковые, блайнды 10/20
  function start(fmt, mult, chips, myPos) {
    const T = E();
    const bbChips = 20;
    const r = T.applyCommands(T.initialState(), T.sortCommands([
      { type: 'table', size: fmt }, { type: 'tournament', left: fmt },
      { type: 'blinds', sb: 10, bb: bbChips }, { type: 'myPos', pos: myPos },
    ]));
    const st = r.state;
    st.seats.forEach(s => { s.stack = chips / bbChips; });
    st.sng = { fmt, mult, chips, payouts: payouts(fmt, mult) };
    return st;
  }

  // При смене блайндов стеки в BB уменьшаются: 15 BB при 10/20 → 10 BB при 15/30.
  // Стеки, названные в этой же фразе, не трогаем — они уже в новых BB.
  function rescaleOnBlinds(before, after, commands) {
    if (!after.sng || !before.blinds || !after.blinds) return;
    const k = before.blinds.bb / after.blinds.bb;
    if (!k || k === 1) return;
    const setNow = new Set(commands.filter(c => c.type === 'stack').map(c => c.seat));
    after.seats.forEach(s => {
      if (s.stack != null && !setNow.has(s.seat)) s.stack = Math.round(s.stack * k * 10) / 10;
    });
  }

  const pctList = p => p.map(x => Math.round(x * 1000) / 10 + '%').join(' / ');

  function stageText(st) {
    const s = st.sng;
    const alive = st.seats.filter(x => x.alive).length;
    const paid = s.payouts.length;
    if (alive <= 1) return 'Турнир окончен.';
    if (paid === 1) return `Осталось ${alive}. Приз получает только победитель — ICM нет, решения в фишках (чип-EV).`;
    if (alive <= paid) {
      if (alive === 2) return `Осталось 2, оба в призах (хедз-ап). Разница 1-го и 2-го места — ${Math.round((s.payouts[0] - s.payouts[1]) * 100)}% фонда. ICM почти не влияет, играй широко.`;
      return `Осталось ${alive}, все в призах. ICM влияет: скачки выплат между местами.`;
    }
    if (alive === paid + 1) return `Осталось ${alive} — БАББЛ: следующий вылетевший не получает ничего. ICM сильно влияет, коллы олл-инов резко сужаются.`;
    return `Осталось ${alive}, призов ${paid}. До баббла ICM умеренный: избегай маргинальных олл-инов против стеков, которые тебя покрывают.`;
  }

  // Стеки для ICM: неизвестные — делим остаток фишек поровну
  function stacksFor(st) {
    const s = st.sng;
    const bb = st.blinds ? st.blinds.bb : 20;
    const total = s.fmt * s.chips / bb;
    const alive = st.seats.filter(x => x.alive);
    const known = alive.filter(x => x.stack != null);
    const unknown = alive.filter(x => x.stack == null);
    const rest = Math.max(unknown.length, total - known.reduce((a, x) => a + x.stack, 0));
    const res = {};
    alive.forEach(x => { res[x.seat] = x.stack != null ? x.stack : rest / unknown.length; });
    return { stacks: res, estimated: unknown.map(x => x.seat) };
  }

  // Оценка диапазона колла/пуша соперника (предположение, озвучивается тренером)
  function callRangePct(st, villainPos, villainStack, heroStack, bubble, wta, headsUp) {
    let p = headsUp ? 40 : villainPos === 'BB' ? 28 : 20;
    if (wta && !headsUp) p += 2;
    if (bubble) p = villainStack < 5 ? 35 : (villainStack > heroStack * 1.5 ? 22 : 12);
    if (heroStack <= 6) p += 10;
    return Math.min(p, 80);
  }
  function pushRangePct(st, pusherPos, pusherStack, heroStack, bubble, headsUp) {
    let p = headsUp ? (pusherStack <= 10 ? 60 : 40) : pusherPos === 'SB' ? (pusherStack <= 10 ? 50 : 35) : (pusherStack <= 10 ? 30 : 20);
    if (bubble && pusherStack > heroStack) p = Math.max(p, 45); // большой стек давит на баббле
    return Math.min(p, 85);
  }

  // Анализ текущего решения героя: пуш (первым в банк) или колл олл-ина
  function analyze(st) {
    const T = E();
    if (!st || !st.sng || !st.hand) return null;
    const s = st.sng;
    const p = T.positions(st);
    const m = T.tableMoney(st);
    const { stacks, estimated } = stacksFor(st);
    const H = stacks[1];
    if (H == null) return null;
    const alive = st.seats.filter(x => x.alive).length;
    const paid = s.payouts.length;
    const bubble = paid > 1 && alive === paid + 1;
    const wta = paid === 1;
    const headsUp = p.order.length === 2;
    const order = p.order;
    const me = order.indexOf(1);
    if (me < 0) return null;
    const acts = {};
    st.hand.actions.forEach(a => { acts[a.seat] = a; });
    const before = order.slice(0, me);
    const after = order.slice(me + 1).filter(x => !m.folded[x]);
    const posted = seat => (p.bySeat[seat] === 'SB' || p.bySeat[seat] === 'BTN/SB') ? 0.5 : p.bySeat[seat] === 'BB' ? 1 : 0;
    const aggressive = before.filter(x => acts[x] && ['raise', 'allin', 'call', 'limp'].includes(acts[x].act));
    const heroPosted = posted(1);
    const eff = Math.min(H, Math.max(...Object.entries(stacks).filter(([k]) => +k !== 1).map(([, v]) => v)));
    const lines = [];
    const note = estimated.length ? ` (стеки игроков ${estimated.join(', ')} не названы — оценены поровну из остатка фишек)` : '';

    try {
      if (!aggressive.length && eff <= 20) {
        // первым в банк: пуш или фолд
        const villains = after.map(seat => ({
          seat, stack_bb: stacks[seat], posted_bb: posted(seat),
          pct: callRangePct(st, p.bySeat[seat], stacks[seat], H, bubble, wta, headsUp),
        }));
        const others = Object.keys(stacks).map(Number).filter(x => x !== 1 && !after.includes(x)).map(x => stacks[x]);
        const r = window.ICM.pushICM({
          hero_hand: st.hand.cards, hero_stack_bb: H, hero_posted_bb: heroPosted, antes_bb: st.ante || 0,
          villains: villains.map(v => ({ stack_bb: v.stack_bb, posted_bb: v.posted_bb, call_range: `top ${v.pct}%` })),
          others_bb: others, payouts: s.payouts, trials: 15000,
        });
        const ranges = villains.map(v => `игрок ${v.seat} (${T.POS_RU[p.bySeat[v.seat]] || p.bySeat[v.seat]}) коллирует топ ${v.pct}%`).join(', ');
        const dec = wta ? r.decision_chip : r.decision_icm;
        lines.push(`Расчёт приложения для ПУША ${st.hand.cards} на ${Math.round(H * 10) / 10} BB (предположение: ${ranges})${note}:`);
        lines.push(`в фишках ${r.chip_ev_push_bb > 0 ? '+' : ''}${r.chip_ev_push_bb} BB` +
          (wta ? '' : `, по ICM ${r.icm_diff_pct > 0 ? '+' : ''}${r.icm_diff_pct}% призового фонда`) +
          ` → пуш ${dec === 'пуш' ? 'ВЫГОДЕН' : 'НЕВЫГОДЕН, лучше фолд'}. Все сфолдят в ${r.all_fold_pct}% случаев.`);
        if (!wta && r.decision_chip !== r.decision_icm) lines.push('Внимание: в фишках и по ICM решения разные — важнее ICM.');
        if (eff > 12) lines.push('Стек больше 12 BB: рассмотри и рейз меньшим размером вместо пуша.');
        return lines.join('\n');
      }
      const allins = before.filter(x => acts[x] && acts[x].act === 'allin');
      const callers = before.filter(x => acts[x] && ['call', 'raise', 'limp'].includes(acts[x].act));
      if (allins.length === 1 && !callers.length) {
        const pusher = allins[0];
        const V = stacks[pusher];
        const pct = pushRangePct(st, p.bySeat[pusher], V, H, bubble, headsUp);
        let dead = st.ante || 0;
        order.forEach(x => { if (x !== 1 && x !== pusher) dead += posted(x); });
        const others = Object.keys(stacks).map(Number).filter(x => x !== 1 && x !== pusher).map(x => stacks[x]);
        const r = window.ICM.callICM({
          hero_hand: st.hand.cards, hero_stack_bb: H, hero_posted_bb: heroPosted,
          pusher: { stack_bb: V, posted_bb: posted(pusher), range: `top ${pct}%` },
          dead_bb: dead, others_bb: others, payouts: s.payouts, trials: 15000,
        });
        const dec = wta ? r.decision_chip : r.decision_icm;
        lines.push(`Расчёт приложения для КОЛЛА олл-ина игрока ${pusher} (${Math.round(V * 10) / 10} BB, предположение: пушит топ ${pct}%)${note}:`);
        lines.push(`моё эквити ${r.equity_pct}%, по фишкам нужно ${r.need_equity_chip_pct}%` +
          (wta ? '' : `; по ICM колл ${r.icm_diff_pct > 0 ? '+' : ''}${r.icm_diff_pct}% призового фонда`) +
          ` → ${dec === 'колл' ? 'КОЛЛ выгоден' : 'ФОЛД'}.`);
        if (!wta && r.decision_chip !== r.decision_icm) lines.push('Внимание: по фишкам колл, но ICM требует фолда — важнее ICM.');
        return lines.join('\n');
      }
    } catch (e) {
      return 'Расчёт приложения не выполнен: ' + e.message;
    }
    return null;
  }

  function context(st) {
    if (!st || !st.sng) return '';
    const s = st.sng;
    const lines = [
      `ФОРМАТ: PokerOK Spin & Gold ${s.fmt}-max, множитель ${multLabel(s.mult)}, стартовый стек ${s.chips} фишек (${s.chips / 20} BB при 10/20).`,
      `Выплаты по местам: ${pctList(s.payouts)}.`,
      stageText(st),
    ];
    const a = analyze(st);
    if (a) lines.push(a);
    return lines.join('\n');
  }

  const ADVICE_SYSTEM = `Ты тренер по Sit&Go и спинам (PokerOK Spin & Gold), игра на виртуальные фишки, цель — обучение.
Тебе дают точное состояние стола префлоп (позиции, стеки и ставки в BB), формат, выплаты, стадию турнира и, если есть, РАСЧЁТ ПРИЛОЖЕНИЯ (Монте-Карло с ICM).
Ответ будет озвучен голосом:
- по-русски, 1–2 коротких предложения, без списков, звёздочек и символов;
- начинай с действия: «Фолд», «Колл», «Рейз до …», «Олл-ин», «Чек»;
- если есть расчёт приложения — следуй его решению и не пересчитывай; кратко скажи причину: стадия (баббл, хедз-ап, победитель берёт всё), стек в BB, предположенный диапазон соперника;
- на баббле 6-max объясняй через риск вылететь без приза;
- карты и позиции называй словами по-русски, не пиши латинские обозначения вроде A5s;
- не называй точных процентов эквити.
Если расчёта нет — решай сам по стеку, позиции, стадии и выплатам. Не переспрашивай.`;

  window.SNG = { MULTS, multLabel, defaultChips, POSITIONS, POS_LABEL, payouts, start, rescaleOnBlinds, stageText, analyze, context, ADVICE_SYSTEM };
})();
