// game-stats.js — моментальные расчёты по ходу раздачи, оценка моих решений, накопительная статистика и отчёт.
// Всё считается на телефоне, без нейросети. Хранение — IndexedDB (store.js, ключ 'stats').
(function () {
  const E = () => window.TourEngine;
  const P = () => window.Poker;
  const r1 = x => Math.round(x * 10) / 10;
  const pct = x => Math.round(x * 100);
  const sayNum = x => String(r1(x)).replace('.', ',');

  // ---------------------------------------------------------------- диапазоны соперников
  // Предположение по префлоп-действию соперника. Тренер называет его вслух.
  function rangeFor(st, seat) {
    const pre = st.hand.actions.filter(a => (a.street || 'preflop') === 'preflop');
    const mine = pre.filter(a => a.seat === seat);
    const last = mine[mine.length - 1];
    const stack = st.seats[seat - 1] && st.seats[seat - 1].stack;
    if (!last) return { spec: 'random', label: 'любые две' };
    const raisesBefore = pre.slice(0, pre.indexOf(last)).filter(a => a.act === 'raise' || a.act === 'allin').length;
    if (last.act === 'allin') {
      const p = stack == null ? 25 : stack <= 8 ? 45 : stack <= 12 ? 32 : stack <= 20 ? 22 : 12;
      return { spec: `top ${raisesBefore ? Math.round(p * 0.6) : p}%`, label: `пуш ${raisesBefore ? Math.round(p * 0.6) : p}%` };
    }
    if (last.act === 'raise') return raisesBefore ? { spec: 'top 7%', label: 'ре-рейз 7%' } : { spec: 'top 18%', label: 'опен 18%' };
    if (last.act === 'call') return raisesBefore ? { spec: 'top 20%', label: 'колл рейза 20%' } : { spec: 'top 35%', label: 'колл 35%' };
    if (last.act === 'limp') return { spec: 'top 45%', label: 'лимп 45%' };
    return { spec: 'random', label: 'любые две' };
  }

  // ---------------------------------------------------------------- ауты
  // Карты, которые улучшают мою руку за счёт моих карманных (не только борда).
  function outsOf(hero, board) {
    if (board.length < 3 || board.length > 4) return null;
    const Pk = P();
    const used = new Set([...hero, ...board]);
    const cur = Pk.category(Pk.evaluate([...hero, ...board]));
    let n = 0;
    for (let c = 0; c < 52; c++) {
      if (used.has(c)) continue;
      const nb = [...board, c];
      const mine = Pk.category(Pk.evaluate([...hero, ...nb]));
      const boardOnly = nb.length >= 5 ? Pk.category(Pk.evaluate(nb)) : -1;
      if (mine > cur && mine > boardOnly && mine >= 2) n++;
    }
    const left = 52 - used.size;
    const hit = board.length === 3 ? 1 - ((left - n) * (left - n - 1)) / (left * (left - 1)) : n / left;
    return { outs: n, hitPct: pct(hit), toRiver: board.length === 3 };
  }

  // ---------------------------------------------------------------- расчёт ситуации
  // Эквити против предполагаемых диапазонов, пот-оддсы, ауты, готовая рука.
  function analyze(st, trials) {
    if (!st || !st.hand || st.buttonSeat == null) return null;
    const T = E(), Pk = P();
    const m = T.tableMoney(st);
    const cc = T.concreteCards(st.hand);
    if (m.folded[1]) return null;
    let opps = T.handSeats(st).filter(s => s !== 1 && !m.folded[s]);
    let unopened = false;
    if (m.street === 'preflop') {
      // префлоп считаем против тех, кто уже вошёл в банк; если никто — сила руки против одной случайной
      const entered = new Set(st.hand.actions.filter(a => a.seat !== 1 && ['call', 'raise', 'allin', 'limp'].includes(a.act)).map(a => a.seat));
      const inPot = opps.filter(s => entered.has(s));
      if (inPot.length) opps = inPot; else { opps = opps.slice(0, 1); unopened = true; }
    }
    if (!opps.length) return null;
    let hero, board;
    try { hero = Pk.parseCards(cc.hero.join('')); board = Pk.parseCards(cc.board.join('')); } catch (e) { return null; }
    const ranges = opps.map(s => ({ seat: s, ...rangeFor(st, s) }));
    const n = trials || Math.max(3000, Math.round(16000 / (ranges.length + 1)));
    let eq;
    try { eq = Pk.equity([[hero], ...ranges.map(r => Pk.parseRange(r.spec))], board, n)[0]; }
    catch (e) { return null; }
    const toCall = unopened ? 0 : m.toCall, pot = m.pot;
    const need = toCall > 0 ? toCall / (pot + toCall) : 0;
    const made = board.length >= 3 ? Pk.CATEGORY_RU[Pk.category(Pk.evaluate([...hero, ...board]))] : null;
    const outs = outsOf(hero, board);
    const street = m.street;
    const vsAllin = st.hand.actions.some(x => x.seat !== 1 && x.act === 'allin' && (x.street || 'preflop') === street);
    if (unopened) ranges[0].label = 'одной случайной руки';
    return { street, eq, need, pot, toCall, made, outs, ranges, hero: cc.hero, board: cc.board, vsAllin, unopened,
      evCall: toCall > 0 ? eq * (pot + toCall) - toCall : null };
  }

  // короткая строка для экрана и для озвучки
  function lineFor(a) {
    if (!a) return { text: '', speech: '' };
    const parts = [`эквити ${pct(a.eq)}%`];
    const sp = [a.unopened ? `Банк не открыт. Сила руки ${pct(a.eq)} процентов против случайной` : `Эквити ${pct(a.eq)} процентов`];
    if (a.toCall > 0) {
      parts.push(`нужно ${pct(a.need)}%`, `колл ${sayNum(a.toCall)} в банк ${sayNum(a.pot)}`);
      sp.push(`нужно ${pct(a.need)}. Колл ${sayNum(a.toCall)} в банк ${sayNum(a.pot)}`);
    } else { parts.push(`банк ${sayNum(a.pot)} BB`); if (!a.unopened) sp.push(`банк ${sayNum(a.pot)}`); }
    if (a.made && a.made !== 'старшая карта') parts.push(a.made);
    if (a.outs && a.outs.outs) {
      parts.push(`аутов ${a.outs.outs} (${a.outs.hitPct}%${a.outs.toRiver ? ' до ривера' : ''})`);
      sp.push(`аутов ${a.outs.outs}, ${a.outs.toRiver ? 'до ривера' : 'на ривере'} ${a.outs.hitPct} процентов`);
    }
    return {
      text: parts.join(' · ') + ` · против: ${a.ranges.map(r => `${r.seat} — ${r.label}`).join(', ')}`,
      speech: sp.join('. ') + '.',
    };
  }

  // ---------------------------------------------------------------- оценка моего действия
  // Строгая проверка только там, где хватает пот-оддсов: передо мной ставка, решаю колл или фолд.
  const MARGIN = 0.05;
  function judge(a, act) {
    if (!a || !(a.toCall > 0)) return { verdict: 'neutral' };
    const exact = a.street === 'river' || !!a.vsAllin; // точнее всего на ривере и против олл-ина
    const ev = a.evCall;
    if (act === 'fold' && a.eq > a.need + MARGIN) return { verdict: 'error', loss: r1(ev), why: `фолд при эквити ${pct(a.eq)}%, а нужно ${pct(a.need)}%`, exact };
    if (act === 'call' && a.eq < a.need - MARGIN) return { verdict: 'error', loss: r1(-ev), why: `колл при эквити ${pct(a.eq)}%, а нужно ${pct(a.need)}%`, exact };
    const why = `эквити ${pct(a.eq)}%, нужно ${pct(a.need)}%`;
    if ((act === 'fold' && a.eq <= a.need) || (act === 'call' && a.eq >= a.need)) return { verdict: 'ok', why };
    if (act === 'fold' || act === 'call') return { verdict: 'close', why };
    return { verdict: 'neutral' };
  }

  // хук движка: снимок расчёта в момент моего решения
  function onHeroAct(st, action) {
    const a = analyze(st, 6000);
    if (!a) return {};
    const j = judge(a, action.act);
    return { math: { eq: r1(a.eq * 100), need: r1(a.need * 100), pot: a.pot, toCall: a.toCall, made: a.made,
      outs: a.outs ? a.outs.outs : null, vs: a.ranges.map(r => r.label).join(', ') }, ...j };
  }
  function heroActSpeech(act) {
    const name = { fold: 'фолд', call: 'колл', raise: 'рейз', allin: 'олл-ин', limp: 'лимп', check: 'чек' }[act.act];
    if (act.verdict === 'error') return `Записал ${name}. Похоже на ошибку: ${act.why}, минус ${sayNum(act.loss)} бэ бэ.`;
    if (act.verdict === 'ok') return `Записал ${name}. По математике верно: ${act.why}.`;
    if (act.verdict === 'close') return `Записал ${name}. Решение на грани: ${act.why}.`;
    return `Записал ${name}.`;
  }

  // ---------------------------------------------------------------- запись раздач
  function stageOf(st, stack) {
    const n = E().handSeats(st).length;
    if (n === 2) return 'хедз-ап';
    if (st.sng && st.sng.payouts && st.sng.payouts.length > 1 && n === st.sng.payouts.length + 1) return 'баббл';
    if (stack == null) return 'стек неизвестен';
    return stack > 20 ? 'больше 20 BB' : stack >= 10 ? '10–20 BB' : 'меньше 10 BB';
  }
  function recordFrom(session, mode, st) {
    if (!st || !st.hand) return null;
    const T = E();
    const h = st.hand;
    const me = st.seats[0] || {};
    const pos = T.positions(st).bySeat[1] || '';
    const mine = h.actions.filter(a => a.seat === 1);
    const pre = mine.filter(a => (a.street || 'preflop') === 'preflop');
    const vol = pre.some(a => ['call', 'raise', 'allin', 'limp'].includes(a.act));
    const cc = T.concreteCards(h);
    const fmtName = st.sng ? `Spin&Gold ${st.sng.fmt}-max` : st.cash ? `Кэш на ${st.cash.size}` : 'Турнир';
    return {
      key: `${session.data.id}|${mode}|${st.handNo}`, session: session.data.id, mode, format: fmtName,
      ts: Date.now(), handNo: st.handNo, pos, cards: h.cards, hero: cc.hero.join(' '), board: cc.board.join(' '),
      players: T.handSeats(st).length, stack: me.stack ?? null, stage: stageOf(st, me.stack),
      street: h.street || 'preflop', vpip: vol, pfr: pre.some(a => a.act === 'raise' || a.act === 'allin'),
      allin: mine.some(a => a.act === 'allin'), folded: mine.some(a => a.act === 'fold'),
      sawFlop: (h.board || []).length >= 3 && !pre.some(a => a.act === 'fold'),
      decisions: mine.map(a => ({ street: a.street || 'preflop', act: a.act, amount: a.amount, math: a.math || null,
        verdict: a.verdict || 'neutral', loss: a.loss || 0, why: a.why || '' })),
    };
  }

  let cache = null, loading = null;
  function load() {
    if (cache) return Promise.resolve(cache);
    if (!loading) loading = (async () => {
      let c;
      try { c = (await DB.get('kv', 'stats')) || { hands: {} }; } catch (e) { c = { hands: {} }; }
      if (!c.hands) c.hands = {};
      cache = c;
      return c;
    })();
    return loading;
  }
  let saveTimer = null;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { DB.put('kv', cache, 'stats').catch(() => {}); }, 300);
  }
  async function track(session, mode, st) {
    const rec = recordFrom(session, mode, st);
    if (!rec) return;
    const s = await load();
    const old = s.hands[rec.key];
    if (old) rec.ts = old.ts;
    s.hands[rec.key] = rec;
    const keys = Object.keys(s.hands);
    if (keys.length > 5000) keys.sort((a, b) => s.hands[a].ts - s.hands[b].ts).slice(0, keys.length - 5000).forEach(k => delete s.hands[k]);
    saveSoon();
  }
  async function records(scope, sessionId) {
    const s = await load();
    const all = Object.values(s.hands).sort((a, b) => a.ts - b.ts);
    return scope === 'session' ? all.filter(r => r.session === sessionId) : all;
  }
  async function clearAll() { await load(); cache.hands = {}; await DB.put('kv', cache, 'stats'); }

  // ---------------------------------------------------------------- сводка
  function summarize(recs) {
    const n = recs.length;
    const share = f => n ? Math.round(recs.filter(f).length / n * 100) : 0;
    const decisions = recs.flatMap(r => r.decisions.map(d => ({ ...d, r })));
    const checked = decisions.filter(d => d.verdict !== 'neutral');
    const errors = decisions.filter(d => d.verdict === 'error');
    const byPos = {}, byStage = {};
    for (const r of recs) {
      const p = byPos[r.pos || '—'] = byPos[r.pos || '—'] || { hands: 0, vpip: 0, pfr: 0 };
      p.hands++; if (r.vpip) p.vpip++; if (r.pfr) p.pfr++;
    }
    for (const d of checked) {
      const g = byStage[d.r.stage] = byStage[d.r.stage] || { checked: 0, errors: 0, loss: 0 };
      g.checked++; if (d.verdict === 'error') { g.errors++; g.loss += d.loss; }
    }
    return {
      hands: n, vpip: share(r => r.vpip), pfr: share(r => r.pfr), allin: share(r => r.allin),
      sawFlop: share(r => r.sawFlop), decisions: decisions.length, checked: checked.length, errors: errors.length,
      lossBB: r1(errors.reduce((x, d) => x + d.loss, 0)),
      accuracy: checked.length ? Math.round((checked.length - errors.length) / checked.length * 100) : null,
      byPos, byStage: Object.fromEntries(Object.entries(byStage).map(([k, v]) => [k, { ...v, loss: r1(v.loss) }])),
      topErrors: errors.sort((a, b) => b.loss - a.loss).slice(0, 10),
    };
  }
  const POS_ORDER = ['UTG', 'UTG+1', 'UTG+2', 'UTG+3', 'LJ', 'HJ', 'CO', 'BTN', 'BTN/SB', 'SB', 'BB'];

  function speechSummary(sm, scopeLabel) {
    if (!sm.hands) return `${scopeLabel}: раздач пока нет.`;
    let t = `${scopeLabel}: ${sm.hands} раздач. Вход в банк ${sm.vpip} процентов, рейзы ${sm.pfr}, олл-ины ${sm.allin}.`;
    if (sm.checked) t += ` Проверено решений по пот-оддсам: ${sm.checked}, ошибок ${sm.errors}, потеря ${sayNum(sm.lossBB)} бэ бэ.`;
    const worst = Object.entries(sm.byStage).sort((a, b) => b[1].loss - a[1].loss)[0];
    if (worst && worst[1].errors) t += ` Больше всего теряете на стадии ${worst[0]}.`;
    return t;
  }

  // ---------------------------------------------------------------- текст для разбора тренером
  function coachDigest(recs, sm) {
    const lines = [`СТАТИСТИКА СЕССИИ (посчитана приложением): раздач ${sm.hands}, VPIP ${sm.vpip}%, PFR ${sm.pfr}%, олл-ины ${sm.allin}%, ` +
      `до флопа ${sm.sawFlop}%. Проверено решений колл/фолд по пот-оддсам: ${sm.checked}, ошибок ${sm.errors}, потеря ${sm.lossBB} BB.`];
    for (const [k, v] of Object.entries(sm.byStage)) lines.push(`Стадия ${k}: решений ${v.checked}, ошибок ${v.errors}, потеря ${v.loss} BB.`);
    lines.push('РАЗДАЧИ С МОИМИ ДЕЙСТВИЯМИ:');
    for (const r of recs.filter(r => r.decisions.length).slice(-40)) {
      lines.push(`№${r.handNo} ${r.pos} ${r.hero} стек ${r.stack ?? '?'} BB, игроков ${r.players}${r.board ? ', борд ' + r.board : ''}: ` +
        r.decisions.map(d => `${E().STREET_RU[d.street]} ${d.act}${d.amount ? ' ' + d.amount : ''}` +
          (d.math ? ` (эквити ${d.math.eq}%, нужно ${d.math.need}%, против ${d.math.vs})` : '') +
          (d.verdict === 'error' ? ` ОШИБКА −${d.loss} BB` : '')).join('; '));
    }
    return lines.join('\n');
  }
  const COACH_ASK = 'Разбери мою сессию по этим данным. Голосом, по-русски, 5–7 предложений без списков: что получается хорошо, ' +
    'три главные утечки (позиции, стадии, типовые ошибки), и одно конкретное упражнение на следующую сессию. ' +
    'Цифры статистики не пересчитывай, опирайся на них.';

  // ---------------------------------------------------------------- HTML-отчёт для скачивания
  const escH = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function reportHtml(recs, sm, title) {
    const posRows = POS_ORDER.filter(p => sm.byPos[p]).concat(Object.keys(sm.byPos).filter(p => !POS_ORDER.includes(p)))
      .map(p => { const v = sm.byPos[p]; return `<tr><td>${escH(p)}</td><td>${v.hands}</td><td>${Math.round(v.vpip / v.hands * 100)}%</td><td>${Math.round(v.pfr / v.hands * 100)}%</td></tr>`; }).join('');
    const stRows = Object.entries(sm.byStage).map(([k, v]) => `<tr><td>${escH(k)}</td><td>${v.checked}</td><td>${v.errors}</td><td>${v.loss}</td></tr>`).join('');
    const errRows = sm.topErrors.map(d => `<tr><td>№${d.r.handNo}</td><td>${escH(d.r.pos)}</td><td>${escH(d.r.hero)}</td><td>${escH(d.r.board)}</td>` +
      `<td>${escH(E().STREET_RU[d.street])}</td><td>${escH(d.why)}</td><td>−${d.loss}</td></tr>`).join('');
    const handRows = recs.map(r => `<tr><td>${r.handNo}</td><td>${escH(r.format)}</td><td>${escH(r.pos)}</td><td>${escH(r.hero)}</td><td>${r.stack ?? ''}</td>` +
      `<td>${escH(r.board)}</td><td>${escH(r.decisions.map(d => d.act + (d.amount ? ' ' + d.amount : '') + (d.verdict === 'error' ? ' ✗' : d.verdict === 'ok' ? ' ✓' : '')).join(', '))}</td></tr>`).join('');
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escH(title)}</title><style>
body{font:15px/1.45 system-ui,Roboto,sans-serif;margin:0;padding:20px max(16px,4vw);background:#f6f7f5;color:#18201c}
h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:26px 0 8px;text-transform:uppercase;letter-spacing:.05em;color:#4a5a52}
.k{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}.k div{background:#fff;border:1px solid #dfe5e1;border-radius:10px;padding:10px}
.k b{display:block;font-size:22px;font-variant-numeric:tabular-nums}.k span{color:#4a5a52;font-size:13px}
.t{overflow-x:auto}table{border-collapse:collapse;width:100%;background:#fff;font-variant-numeric:tabular-nums;font-size:14px}
th,td{border-bottom:1px solid #e6ebe8;padding:6px 8px;text-align:left;white-space:nowrap}th{color:#4a5a52;font-weight:600}
.m{color:#4a5a52;font-size:13px}</style></head><body>
<h1>${escH(title)}</h1><div class="m">Сформирован ${new Date().toLocaleString('ru-RU')} · Покерный тренер</div>
<h2>Сводка</h2><div class="k"><div><b>${sm.hands}</b><span>раздач</span></div><div><b>${sm.vpip}%</b><span>вход в банк (VPIP)</span></div>
<div><b>${sm.pfr}%</b><span>рейзы (PFR)</span></div><div><b>${sm.allin}%</b><span>олл-ины</span></div>
<div><b>${sm.accuracy == null ? '—' : sm.accuracy + '%'}</b><span>верных колл/фолд (${sm.checked})</span></div><div><b>−${sm.lossBB}</b><span>BB потеряно на ошибках</span></div></div>
<h2>По позициям</h2><div class="t"><table><tr><th>Позиция</th><th>Раздач</th><th>VPIP</th><th>PFR</th></tr>${posRows || '<tr><td colspan="4">—</td></tr>'}</table></div>
<h2>Ошибки по стадиям</h2><div class="t"><table><tr><th>Стадия</th><th>Проверено</th><th>Ошибок</th><th>Потеря, BB</th></tr>${stRows || '<tr><td colspan="4">Пока нет решений колл/фолд с расчётом</td></tr>'}</table></div>
<h2>Самые дорогие ошибки</h2><div class="t"><table><tr><th>Раздача</th><th>Поз.</th><th>Карты</th><th>Борд</th><th>Улица</th><th>Что не так</th><th>BB</th></tr>${errRows || '<tr><td colspan="7">Ошибок не найдено</td></tr>'}</table></div>
<h2>Все раздачи</h2><div class="t"><table><tr><th>№</th><th>Формат</th><th>Поз.</th><th>Карты</th><th>Стек</th><th>Борд</th><th>Мои действия</th></tr>${handRows}</table></div>
<p class="m">Проверка решений — по пот-оддсам против предполагаемых диапазонов соперников (Монте-Карло), без ICM и без будущих улиц. Точнее всего на ривере и против олл-ина.</p>
</body></html>`;
  }

  // ---------------------------------------------------------------- голосовые команды
  function voiceCommand(text) {
    const t = ' ' + text.toLowerCase().replace(/ё/g, 'е').replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ') + ' ';
    if (t.trim().split(' ').length > 6) return null;
    if (/разбер\S* (мою |всю )?сесси|анализ\S* сесси|разбор сесси|разбери игру/.test(t)) return { type: 'analyze' };
    if (/отчет/.test(t)) return { type: 'report' };
    if (/статистик|итог\S* сесси|мои цифры/.test(t)) return { type: 'stats', scope: /сесси|сегодня/.test(t) ? 'session' : 'all' };
    return null;
  }

  // в состоянии постфлопа префлоп-модули (SNG/кэш) не применяются
  const POSTFLOP_ADVICE = `Ты тренер по турнирному и кэш-покеру, игра на виртуальные фишки, цель — обучение.
Тебе дают точное состояние раздачи на постфлопе: борд, мои карты, банк и ставки в BB, кто остался в раздаче, и РАСЧЁТ ПРИЛОЖЕНИЯ (эквити против предполагаемых диапазонов, пот-оддсы, ауты).
Ответ будет озвучен голосом:
- по-русски, 1–2 коротких предложения, без списков, звёздочек и символов;
- начинай с действия: «Чек», «Ставка …», «Колл», «Рейз до …», «Олл-ин», «Фолд»; размер ставки называй в BB или долях банка;
- опирайся на расчёт приложения и не пересчитывай; коротко объясни через силу руки, дро и пот-оддсы;
- карты называй словами по-русски, не пиши латинские обозначения;
- проценты уже прозвучали, не повторяй их.
Не переспрашивай.`;
  function preflopView(st) {
    const v = JSON.parse(JSON.stringify(st));
    if (v.hand) v.hand.actions = v.hand.actions.filter(a => (a.street || 'preflop') === 'preflop' && a.seat !== 1);
    return v;
  }

  window.GameStats = { analyze, lineFor, judge, onHeroAct, heroActSpeech, track, records, clearAll, summarize, speechSummary,
    coachDigest, COACH_ASK, reportHtml, voiceCommand, POSTFLOP_ADVICE, preflopView, POS_ORDER, rangeFor };
  if (window.TourEngine) window.TourEngine.hooks.onHeroAct = onHeroAct;
})();
