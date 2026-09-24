// Покерная математика: оценка рук, диапазоны, эквити (Монте-Карло), пот-оддсы, EV пуша.
// Порт poker_math.py с ПК-версии.
(function (root) {
  const RANKING = (typeof HAND_RANKING !== 'undefined') ? HAND_RANKING : require('./ranking.js');
  const RANKS = '23456789TJQKA';
  const SUITS = 'cdhs';
  const CATEGORY_RU = ['старшая карта', 'пара', 'две пары', 'сет/трипс', 'стрит', 'флеш',
    'фулл-хаус', 'каре', 'стрит-флеш'];

  // ---------------------------------------------------------------- карты
  function card(s) {
    const r = RANKS.indexOf(s[0].toUpperCase());
    const su = SUITS.indexOf(s[1].toLowerCase());
    if (r < 0 || su < 0) throw new Error('Не понял карту: ' + s);
    return r * 4 + su;
  }
  function parseCards(s) {
    if (!s) return [];
    s = String(s).replace(/10/g, 'T').replace(/[\s,;]+/g, '');
    if (s.length % 2) throw new Error('Не понял карты: ' + s);
    const out = [];
    for (let i = 0; i < s.length; i += 2) out.push(card(s.substr(i, 2)));
    return out;
  }

  // ---------------------------------------------------------------- оценка руки
  function straightHigh(mask) {
    const ext = (mask << 1) | ((mask >> 12) & 1); // бит 0 = туз как единица
    for (let hi = 13; hi >= 4; hi--) {
      if (((ext >> (hi - 4)) & 31) === 31) return hi - 1;
    }
    return -1;
  }
  function pack(cat, ks) {
    let v = cat;
    for (let i = 0; i < 5; i++) v = v * 16 + (ks[i] !== undefined ? ks[i] + 1 : 0);
    return v;
  }
  // Сила руки из 5–7 карт: число, больше = сильнее.
  function evaluate(cards) {
    const counts = new Array(13).fill(0);
    const suitMask = [0, 0, 0, 0];
    const suitCnt = [0, 0, 0, 0];
    for (const c of cards) {
      const r = c >> 2, s = c & 3;
      counts[r]++;
      suitMask[s] |= 1 << r;
      suitCnt[s]++;
    }
    for (let s = 0; s < 4; s++) {
      if (suitCnt[s] >= 5) {
        const sh = straightHigh(suitMask[s]);
        if (sh >= 0) return pack(8, [sh]);
        const top = [];
        for (let r = 12; r >= 0 && top.length < 5; r--) if (suitMask[s] & (1 << r)) top.push(r);
        return pack(5, top);
      }
    }
    const quads = [], trips = [], pairs = [], singles = [];
    let mask = 0;
    for (let r = 12; r >= 0; r--) {
      const n = counts[r];
      if (n) mask |= 1 << r;
      if (n === 4) quads.push(r); else if (n === 3) trips.push(r);
      else if (n === 2) pairs.push(r); else if (n === 1) singles.push(r);
    }
    const kick = (excl, k) => {
      const o = [];
      for (let r = 12; r >= 0 && o.length < k; r--) if (counts[r] && !excl.includes(r)) o.push(r);
      return o;
    };
    if (quads.length) return pack(7, [quads[0], ...kick([quads[0]], 1)]);
    if (trips.length && (trips.length > 1 || pairs.length)) {
      const p = Math.max(...trips.slice(1), ...pairs);
      return pack(6, [trips[0], p]);
    }
    const sh = straightHigh(mask);
    if (sh >= 0) return pack(4, [sh]);
    if (trips.length) return pack(3, [trips[0], ...kick([trips[0]], 2)]);
    if (pairs.length >= 2) return pack(2, [pairs[0], pairs[1], ...kick([pairs[0], pairs[1]], 1)]);
    if (pairs.length) return pack(1, [pairs[0], ...kick([pairs[0]], 3)]);
    return pack(0, singles.slice(0, 5));
  }
  const category = v => Math.floor(v / Math.pow(16, 5));

  // ---------------------------------------------------------------- диапазоны
  function combosOfClass(cls) {
    const r1 = RANKS.indexOf(cls[0]), r2 = RANKS.indexOf(cls[1]);
    const suf = cls[2] || '';
    const res = [];
    for (let s1 = 0; s1 < 4; s1++) for (let s2 = 0; s2 < 4; s2++) {
      const a = r1 * 4 + s1, b = r2 * 4 + s2;
      if (a === b) continue;
      if (r1 === r2) { if (s1 < s2) res.push([a, b]); }
      else if (suf === 's') { if (s1 === s2) res.push([a, b]); }
      else if (suf === 'o') { if (s1 !== s2) res.push([a, b]); }
      else res.push([a, b]);
    }
    return res;
  }
  function topPercent(p) {
    const target = 1326 * p / 100;
    const out = [];
    let n = 0;
    for (const cls of RANKING) {
      if (n >= target) break;
      out.push(cls);
      n += combosOfClass(cls).length;
    }
    return out;
  }
  function expandToken(tok) {
    if (tok.includes('-')) {
      const [a, b] = tok.split('-');
      if (a[0] === a[1] && b[0] === b[1]) {
        const lo = Math.min(RANKS.indexOf(a[0]), RANKS.indexOf(b[0]));
        const hi = Math.max(RANKS.indexOf(a[0]), RANKS.indexOf(b[0]));
        const o = [];
        for (let i = lo; i <= hi; i++) o.push(RANKS[i] + RANKS[i]);
        return o;
      }
      const suf = a.slice(2);
      const lo = Math.min(RANKS.indexOf(a[1]), RANKS.indexOf(b[1]));
      const hi = Math.max(RANKS.indexOf(a[1]), RANKS.indexOf(b[1]));
      const o = [];
      for (let i = lo; i <= hi; i++) o.push(a[0] + RANKS[i] + suf);
      return o;
    }
    const plus = tok.endsWith('+');
    const t = tok.replace(/\+$/, '');
    if (t[0] === t[1]) {
      if (!plus) return [t];
      const o = [];
      for (let i = RANKS.indexOf(t[0]); i < 13; i++) o.push(RANKS[i] + RANKS[i]);
      return o;
    }
    const suf = t.slice(2);
    if (!plus) return suf ? [t] : [t + 's', t + 'o'];
    const o = [];
    for (let i = RANKS.indexOf(t[1]); i < RANKS.indexOf(t[0]); i++) {
      const base = t[0] + RANKS[i];
      if (suf) o.push(base + suf); else o.push(base + 's', base + 'o');
    }
    return o;
  }
  // Строка -> массив комбинаций [[a,b],...] или null (любая рука)
  function parseRange(spec) {
    if (spec === null || spec === undefined) return null;
    if (Array.isArray(spec)) return spec;
    const s = String(spec).trim();
    const low = s.toLowerCase();
    if (['', 'random', 'any', 'любая', '100%'].includes(low)) return null;
    const m = low.match(/^(?:top|топ)?\s*(\d+(?:[.,]\d+)?)\s*%$/);
    if (m) {
      const out = [];
      for (const cls of topPercent(parseFloat(m[1].replace(',', '.')))) out.push(...combosOfClass(cls));
      return out;
    }
    const compact = s.replace(/\s+/g, '').replace(/10/g, 'T');
    if (/^([2-9TJQKAtjqka][cdhsCDHS]){2}$/.test(compact)) return [parseCards(compact)];
    const seen = new Set(), combos = [];
    for (let tok of s.split(/[,\s]+/)) {
      if (!tok) continue;
      tok = tok.slice(0, 2).toUpperCase() + tok.slice(2).toLowerCase();
      for (const cls of expandToken(tok)) {
        for (const c of combosOfClass(cls)) {
          const k = Math.min(...c) * 64 + Math.max(...c);
          if (!seen.has(k)) { seen.add(k); combos.push(c); }
        }
      }
    }
    if (!combos.length) throw new Error('Пустой диапазон: ' + spec);
    return combos;
  }

  // ---------------------------------------------------------------- эквити
  function sample(range, dead) {
    if (range === null) {
      for (;;) {
        const a = (Math.random() * 52) | 0, b = (Math.random() * 52) | 0;
        if (a !== b && !dead[a] && !dead[b]) return [a, b];
      }
    }
    for (let i = 0; i < 200; i++) {
      const c = range[(Math.random() * range.length) | 0];
      if (!dead[c[0]] && !dead[c[1]]) return c;
    }
    const ok = range.filter(c => !dead[c[0]] && !dead[c[1]]);
    if (!ok.length) throw new Error('Диапазон полностью заблокирован картами');
    return ok[(Math.random() * ok.length) | 0];
  }
  function equity(ranges, board, trials) {
    board = board || [];
    trials = trials || 20000;
    const n = ranges.length;
    const wins = new Array(n).fill(0);
    const dead = new Uint8Array(52);
    for (let t = 0; t < trials; t++) {
      dead.fill(0);
      for (const c of board) dead[c] = 1;
      const hands = [];
      for (const r of ranges) {
        const h = sample(r, dead);
        dead[h[0]] = dead[h[1]] = 1;
        hands.push(h);
      }
      const full = board.slice();
      while (full.length < 5) {
        const c = (Math.random() * 52) | 0;
        if (!dead[c]) { dead[c] = 1; full.push(c); }
      }
      let best = -1, winners = [];
      for (let i = 0; i < n; i++) {
        const v = evaluate([hands[i][0], hands[i][1], ...full]);
        if (v > best) { best = v; winners = [i]; } else if (v === best) winners.push(i);
      }
      for (const i of winners) wins[i] += 1 / winners.length;
    }
    return wins.map(w => w / trials);
  }
  const r1 = x => Math.round(x * 10) / 10;

  function calcEquity(hero, villains, board, trials) {
    const ranges = [parseRange(hero), ...(villains && villains.length ? villains : ['random']).map(parseRange)];
    const b = parseCards(board || '');
    const eq = equity(ranges, b, trials || 20000);
    const res = { hero_equity_pct: r1(eq[0] * 100), villains_equity_pct: eq.slice(1).map(e => r1(e * 100)) };
    if (b.length >= 3 && ranges[0] && ranges[0].length === 1) {
      res.hero_made_hand = CATEGORY_RU[category(evaluate([...ranges[0][0], ...b]))];
    }
    return res;
  }
  function potOdds(pot, toCall) {
    return { required_equity_pct: r1(toCall / (pot + toCall) * 100), odds: `${Math.round(pot / toCall * 100) / 100} к 1` };
  }

  // ---------------------------------------------------------------- EV пуша
  function payout(contrib, strengths, deadMoney) {
    const n = contrib.length;
    const win = new Array(n).fill(0);
    const levels = [...new Set(contrib.filter(c => c > 0))].sort((a, b) => a - b);
    let prev = 0, first = true;
    for (const lv of levels) {
      let pot = 0;
      for (const c of contrib) pot += Math.min(c, lv) - Math.min(c, prev);
      if (first) { pot += deadMoney; first = false; }
      const elig = [];
      for (let i = 0; i < n; i++) if (contrib[i] >= lv) elig.push(i);
      const best = Math.max(...elig.map(i => strengths[i]));
      const ws = elig.filter(i => strengths[i] === best);
      for (const i of ws) win[i] += pot / ws.length;
      prev = lv;
    }
    return win;
  }
  // villains: [{stack_bb, posted_bb, call_range}] в порядке хода после героя
  function pushEV(heroHand, heroStack, villains, heroPosted, antes, trials) {
    trials = trials || 30000;
    heroPosted = +heroPosted || 0;
    antes = +antes || 0;
    const hero = parseRange(heroHand);
    const callSets = villains.map(v => {
      const r = parseRange(v.call_range || 'top 30%');
      return r === null ? null : new Set(r.map(c => Math.min(...c) * 64 + Math.max(...c)));
    });
    const stacks = [+heroStack, ...villains.map(v => +v.stack_bb)];
    const posted = [heroPosted, ...villains.map(v => +(v.posted_bb || 0))];
    const potBefore = antes + posted.reduce((a, b) => a + b, 0);
    let total = 0, allFold = 0;
    const calls = villains.map(() => 0);
    const dead = new Uint8Array(52);
    for (let t = 0; t < trials; t++) {
      dead.fill(0);
      const h = sample(hero, dead);
      dead[h[0]] = dead[h[1]] = 1;
      const callers = [], vh = [];
      callSets.forEach((cs, i) => {
        const v = sample(null, dead);
        dead[v[0]] = dead[v[1]] = 1;
        vh.push(v);
        if (cs === null || cs.has(Math.min(...v) * 64 + Math.max(...v))) callers.push(i);
      });
      if (!callers.length) { allFold++; total += potBefore; continue; }
      callers.forEach(i => calls[i]++);
      const maxCall = Math.max(...callers.map(i => stacks[i + 1]));
      const contrib = [Math.min(stacks[0], maxCall), ...callers.map(i => Math.min(stacks[i + 1], stacks[0]))];
      let deadMoney = antes;
      villains.forEach((_, i) => { if (!callers.includes(i)) deadMoney += posted[i + 1]; });
      const board = [];
      while (board.length < 5) {
        const c = (Math.random() * 52) | 0;
        if (!dead[c]) { dead[c] = 1; board.push(c); }
      }
      const strengths = [evaluate([...h, ...board]), ...callers.map(i => evaluate([...vh[i], ...board]))];
      const win = payout(contrib, strengths, deadMoney);
      total += win[0] - (contrib[0] - posted[0]);
    }
    const ev = Math.round(total / trials * 100) / 100;
    return {
      ev_push_bb: ev, ev_fold_bb: 0, decision: ev > 0 ? 'пуш' : 'фолд',
      all_fold_pct: r1(allFold / trials * 100),
      call_pct_by_villain: calls.map(c => r1(c / trials * 100)),
      note: 'чип-EV без ICM; для Spin&Go (победитель забирает всё) хорошее приближение'
    };
  }

  const api = { parseCards, evaluate, category, parseRange, topPercent, equity, calcEquity, potOdds, pushEV, CATEGORY_RU };
  root.Poker = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
