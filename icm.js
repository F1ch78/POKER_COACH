// ICM (модель Малмута–Харвилла) и EV пуша с учётом выплат. Отдельный модуль, использует Poker из poker.js.
(function (root) {
  const P = root.Poker || (typeof require !== 'undefined' ? require('./poker.js') : null);

  // Выплаты по форматам PokerOK Spin & Gold (доли призового фонда)
  const SPIN_GOLD_PAYOUTS = {
    3: { 2: [1], 3: [1], 4: [1], 5: [1], 10: [0.8, 0.2], 50: [0.6, 0.3, 0.1], 100: [0.6, 0.3, 0.1], jackpot: [0.5, 0.3, 0.2] },
    6: { 4: [0.625, 0.375], 6: [2 / 3, 1 / 3], 8: [0.625, 0.375], 10: [0.5, 0.3, 0.2], 20: [0.5, 0.3, 0.2],
      100: [0.4, 0.3, 0.2, 0.1], 200: [0.4, 0.3, 0.2, 0.1], jackpot: [0.30, 0.22, 0.17, 0.13, 0.10, 0.08] },
  };

  function normPayouts(p) {
    if (!p || !p.length) return [1];
    const arr = p.map(Number).filter(x => x >= 0);
    const s = arr.reduce((a, b) => a + b, 0) || 1;
    return arr.map(x => x / s);
  }

  // Доля призового фонда каждого игрока по стекам. Игроки с нулём занимают последние места.
  function icmEquity(stacks, payouts) {
    const pay = normPayouts(payouts);
    const n = stacks.length;
    const res = new Array(n).fill(0);
    const alive = [];
    stacks.forEach((s, i) => { if (s > 0) alive.push(i); });
    const busted = stacks.map((s, i) => i).filter(i => !(stacks[i] > 0));
    if (busted.length) {
      // вылетевшие делят места alive.length+1 … n
      let sum = 0;
      for (let k = alive.length; k < n; k++) sum += pay[k] || 0;
      for (const i of busted) res[i] = sum / busted.length;
    }
    const m = alive.length;
    if (!m) return res;
    const st = alive.map(i => stacks[i]);
    const places = Math.min(pay.length, m);
    const memo = new Map();
    // f(mask, place): распределение равенства для оставшихся игроков, начиная с места place
    function f(mask, place) {
      if (place >= places || mask === 0) return null;
      const key = mask * 16 + place;
      if (memo.has(key)) return memo.get(key);
      let total = 0;
      for (let j = 0; j < m; j++) if (mask & (1 << j)) total += st[j];
      const out = new Array(m).fill(0);
      for (let j = 0; j < m; j++) {
        if (!(mask & (1 << j))) continue;
        const pr = st[j] / total;
        out[j] += pr * pay[place];
        const sub = f(mask & ~(1 << j), place + 1);
        if (sub) for (let k = 0; k < m; k++) out[k] += pr * sub[k];
      }
      memo.set(key, out);
      return out;
    }
    const eq = f((1 << m) - 1, 0) || new Array(m).fill(0);
    alive.forEach((i, j) => { res[i] = eq[j]; });
    return res;
  }

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

  // EV пуша префлоп в фишках и по ICM.
  // Все стеки — на начало раздачи (до блайндов), в BB.
  // villains: игроки, которым ходить после пуша, по порядку: [{stack_bb, posted_bb, call_range}]
  // others_bb: стеки игроков, которые уже сфолдили или не участвуют (для ICM)
  // При фолде героя банк (блайнды и анте) достаётся последнему в списке villains (обычно большой блайнд).
  function pushICM(opts) {
    const trials = opts.trials || 30000;
    const heroPosted = +opts.hero_posted_bb || 0;
    const antes = +opts.antes_bb || 0;
    const pay = normPayouts(opts.payouts);
    const villains = opts.villains || [];
    const others = (opts.others_bb || []).map(Number);
    const hero = P.parseRange(opts.hero_hand);
    const H = +opts.hero_stack_bb;
    const V = villains.map(v => +v.stack_bb);
    const posted = villains.map(v => +(v.posted_bb || 0));
    const callSets = villains.map(v => {
      const r = P.parseRange(v.call_range || 'top 30%');
      return r === null ? null : new Set(r.map(c => Math.min(...c) * 64 + Math.max(...c)));
    });
    const potBefore = antes + heroPosted + posted.reduce((a, b) => a + b, 0);
    const memo = new Map();
    const heroICM = stacks => {
      const k = stacks.map(x => Math.round(x * 100)).join(',');
      if (!memo.has(k)) memo.set(k, icmEquity(stacks, pay)[0]);
      return memo.get(k);
    };
    // фолд
    const foldStacks = [H - heroPosted, ...V.map((v, i) => v - posted[i]), ...others];
    if (V.length) foldStacks[V.length] += potBefore;
    const icmFold = heroICM(foldStacks);

    let chip = 0, icm = 0, allFold = 0;
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
      const fin = [H, ...V.map((v, i) => v - posted[i]), ...others];
      if (!callers.length) {
        allFold++;
        fin[0] = H - heroPosted + potBefore;
      } else {
        const maxCall = Math.max(...callers.map(i => V[i]));
        const contrib = [Math.min(H, maxCall), ...callers.map(i => Math.min(V[i], H))];
        let deadMoney = antes;
        villains.forEach((_, i) => { if (!callers.includes(i)) deadMoney += posted[i]; });
        const board = [];
        while (board.length < 5) {
          const c = (Math.random() * 52) | 0;
          if (!dead[c]) { dead[c] = 1; board.push(c); }
        }
        const strengths = [P.evaluate([...h, ...board]), ...callers.map(i => P.evaluate([...vh[i], ...board]))];
        const win = payout(contrib, strengths, deadMoney);
        fin[0] = H - contrib[0] + win[0];
        callers.forEach((i, j) => { fin[i + 1] = V[i] - contrib[j + 1] + win[j + 1]; });
      }
      chip += fin[0] - (H - heroPosted);
      icm += heroICM(fin);
    }
    const r1 = x => Math.round(x * 10) / 10;
    const icmPush = icm / trials;
    return {
      chip_ev_push_bb: Math.round(chip / trials * 100) / 100,
      icm_push_pct: r1(icmPush * 100),
      icm_fold_pct: r1(icmFold * 100),
      icm_diff_pct: Math.round((icmPush - icmFold) * 1000) / 10,
      decision_icm: icmPush > icmFold ? 'пуш' : 'фолд',
      decision_chip: chip > 0 ? 'пуш' : 'фолд',
      all_fold_pct: r1(allFold / trials * 100),
      note: 'проценты — доля призового фонда (ICM); при фолде банк отдан последнему оппоненту в списке',
    };
  }

  // Колл олл-ина одного соперника: ICM колла против фолда.
  // opts: hero_hand, hero_stack_bb, hero_posted_bb, pusher {stack_bb, posted_bb, range},
  //       dead_bb (анте + блайнды сфолдивших), others_bb (стеки остальных), payouts
  function callICM(opts) {
    const trials = opts.trials || 30000;
    const pay = normPayouts(opts.payouts);
    const hero = P.parseRange(opts.hero_hand);
    const vr = P.parseRange(opts.pusher.range || 'top 30%');
    const H = +opts.hero_stack_bb, V = +opts.pusher.stack_bb;
    const hp = +opts.hero_posted_bb || 0, vp = +opts.pusher.posted_bb || 0;
    const deadBB = +opts.dead_bb || 0;
    const others = (opts.others_bb || []).map(Number);
    const memo = new Map();
    const heroICM = stacks => {
      const k = stacks.map(x => Math.round(x * 100)).join(',');
      if (!memo.has(k)) memo.set(k, icmEquity(stacks, pay)[0]);
      return memo.get(k);
    };
    const icmFold = heroICM([H - hp, V + hp + deadBB, ...others]);
    const eff = Math.min(H, V);
    let icm = 0, chip = 0, win = 0;
    const dead = new Uint8Array(52);
    for (let t = 0; t < trials; t++) {
      dead.fill(0);
      const h = sample(hero, dead); dead[h[0]] = dead[h[1]] = 1;
      const v = sample(vr, dead); dead[v[0]] = dead[v[1]] = 1;
      const board = [];
      while (board.length < 5) { const c = (Math.random() * 52) | 0; if (!dead[c]) { dead[c] = 1; board.push(c); } }
      const a = P.evaluate([...h, ...board]), b = P.evaluate([...v, ...board]);
      const share = a > b ? 1 : a === b ? 0.5 : 0;
      win += share;
      const pot = 2 * eff + deadBB;
      const hf = H - eff + share * pot, vf = V - eff + (1 - share) * pot;
      chip += hf - (H - hp);
      icm += heroICM([hf, vf, ...others]);
    }
    const r1 = x => Math.round(x * 10) / 10;
    const icmCall = icm / trials;
    const eq = win / trials;
    // эквити, нужное по фишкам: (сколько доставить) / (банк после колла)
    const toCall = eff - hp;
    const needChip = toCall / (2 * eff + deadBB);
    return {
      equity_pct: r1(eq * 100),
      need_equity_chip_pct: r1(needChip * 100),
      chip_ev_call_bb: Math.round(chip / trials * 100) / 100,
      icm_call_pct: r1(icmCall * 100), icm_fold_pct: r1(icmFold * 100),
      icm_diff_pct: Math.round((icmCall - icmFold) * 1000) / 10,
      decision_icm: icmCall > icmFold ? 'колл' : 'фолд',
      decision_chip: chip > 0 ? 'колл' : 'фолд',
    };
  }

  function icmTable(stacks, payouts) {
    const eq = icmEquity(stacks.map(Number), payouts);
    return { equity_pct: eq.map(e => Math.round(e * 1000) / 10), payouts: normPayouts(payouts) };
  }

  const api = { icmEquity, icmTable, pushICM, callICM, SPIN_GOLD_PAYOUTS, normPayouts };
  root.ICM = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
