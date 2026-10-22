// tour-engine.js — сценарий «Турнир»: состояние стола, позиции, фишки, разбор фраз. Работает без сети.
(function () {
// ===== Движок сценария «Турнир» =====
// Состояние стола хранит приложение. Нейросеть получает готовую картину и только советует.

const WORD_NUM = {
  "ноль":0,"один":1,"одна":1,"первый":1,"два":2,"две":2,"второй":2,"три":3,"третий":3,
  "четыре":4,"четвертый":4,"четвёртый":4,"пять":5,"пятый":5,"шесть":6,"шестой":6,
  "семь":7,"седьмой":7,"восемь":8,"восьмой":8,"девять":9,"девятый":9,"десять":10,"десятый":10
};

// Порядок позиций, не считая BTN/SB/BB (ранние → поздние)
const EARLY = {
  0: [], 1: ["CO"], 2: ["HJ","CO"], 3: ["UTG","HJ","CO"], 4: ["UTG","LJ","HJ","CO"],
  5: ["UTG","UTG+1","LJ","HJ","CO"], 6: ["UTG","UTG+1","UTG+2","LJ","HJ","CO"],
  7: ["UTG","UTG+1","UTG+2","UTG+3","LJ","HJ","CO"]
};

const POS_RU = { "BTN":"баттон","SB":"малый блайнд","BB":"большой блайнд","BTN/SB":"баттон (он же малый блайнд)",
  "CO":"катофф","HJ":"хайджек","LJ":"лоджек","UTG":"UTG","UTG+1":"UTG+1","UTG+2":"UTG+2","UTG+3":"UTG+3" };

function initialState() {
  return {
    tournamentLeft: null, tableSize: null, seats: [], buttonSeat: null,
    blinds: null, ante: 0, handNo: 0, hand: null, firstHandPending: true,
    notes: []
  };
}

const clone = (s) => JSON.parse(JSON.stringify(s));

// ---------- нормализация текста ----------
function normalize(text) {
  let t = " " + text.toLowerCase().replace(/ё/g, "е") + " ";
  // "1 500" → "1500", но «игрока 3 900» — это игрок 3 и 900
  t = t.replace(/(игрок\S*\s+(?:номер\s+)?)?(\d{1,3})[\s\u00a0](\d{3})(?!\d)/g, (m, pl, a, b) => pl ? m : a + b);
  t = t.replace(/(\d+)[.,](\d+)\s*тыс\S*/g, (_, a, b) => String(Math.round(parseFloat(a + "." + b) * 1000)));
  t = t.replace(/полтор\S*\s+тыс\S*/g, "1500");
  t = t.replace(/(\d+)\s*тыс\S*/g, (_, a) => String(+a * 1000));
  t = t.replace(/(\d+)\s*к(?=[\s,.]|$)/g, (_, a) => String(+a * 1000));
  // словесные числа перед "тысяч"
  t = t.replace(/(один|одна|две|два|три|четыре|пять|шесть|семь|восемь|девять|десять)\s+тыс\S*/g,
    (_, w) => String(WORD_NUM[w] * 1000));
  t = t.replace(/\s(тысяча|тысячу)\s/g, " 1000 ");
  // стеки и ставки — в больших блайндах: «2,5», «полтора», «три с половиной», «15 бб»
  t = t.replace(/(\d)[,.](\d)/g, "$1.$2");
  t = t.replace(/(^|\s)полтора(?=\s)/g, "$11.5");
  t = t.replace(/(\d+|один|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять)\s+с\s+половин\S*/g,
    (_, a) => String((/\d/.test(a) ? +a : WORD_NUM[a]) + 0.5));
  t = t.replace(/(\d(?:\.\d+)?)\s*(?:бб|bb|б\s?б|бэ\s?бэ|биг\S*(?:\s+блайнд\S*)?|больш\S*\s+блайнд\S*|блайнд\S*)(?=[\s,;!?]|$)/g, "$1");
  return t;
}

// числа в сегменте команды (слова → цифры)
function numbersIn(seg) {
  const words = seg.split(/[\s,/]+|\sна\s/).filter(Boolean);
  const out = [];
  for (const w of words) {
    const m = w.match(/^(\d+(?:\.\d+)?)/);
    if (m) out.push(parseFloat(m[1]));
    else if (w in WORD_NUM) out.push(WORD_NUM[w]);
  }
  return out;
}

// ---------- распознавание карт ----------
function rankOf(word) {
  const w = word.replace(/[^а-яa-z0-9]/g, "");
  if (!w) return null;
  if (/^\d+$/.test(w)) { const n = +w; return n === 10 ? "T" : (n >= 2 && n <= 9 ? String(n) : null); }
  if (w.startsWith("туз") || w.startsWith("тус")) return "A";
  if (w.startsWith("корол")) return "K";
  if (/^дам/.test(w)) return "Q";
  if (/^вал[еь]т|^вальт|^валет/.test(w)) return "J";
  if (w.startsWith("десят")) return "T";
  if (w.startsWith("девят")) return "9";
  if (w.startsWith("восьм") || w.startsWith("восем")) return "8";
  if (/^сем[ьеё]/.test(w) || w === "семь") return "7";
  if (w.startsWith("шест")) return "6";
  if (w.startsWith("пят")) return "5";
  if (/^четыр|^четвер/.test(w)) return "4";
  if (/^тро[йе]к|^три$|^тройк/.test(w)) return "3";
  if (/^двой|^двое|^два$|^две$/.test(w)) return "2";
  return null;
}
const RANK_ORDER = "AKQJT98765432";

function parseCards(seg) {
  // латиница: AKs, 99, QJo
  const lat = seg.match(/(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))([akqjt2-9])([akqjt2-9])\s*([so])?(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))/i);
  const words = seg.split(/[\s,.\-–]+/).filter(Boolean);
  let ranks = words.map(rankOf).filter(Boolean);
  let pairFlag = /(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))пар[аыу](?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))|карманн/.test(seg);
  let suit = null;
  if (/одномаст|в масть|одной масти|масти одной|suited/.test(seg)) suit = "s";
  if (/разномаст|разной масти|разных мастей|офсьют|оффсьют|offsuit/.test(seg)) suit = "o";
  if (ranks.length === 0 && lat) {
    ranks = [lat[1].toUpperCase(), lat[2].toUpperCase()];
    if (lat[3]) suit = lat[3].toLowerCase();
  }
  if (ranks.length === 1 && pairFlag) ranks = [ranks[0], ranks[0]];
  if (ranks.length !== 2) return null;
  // точные масти: «туз пик король червей»
  const named = cardsWithSuits(seg);
  let exact = null;
  if (named.length === 2 && named.every(c => c.s && c.s !== "my")) {
    named.sort((a, b) => RANK_ORDER.indexOf(a.r) - RANK_ORDER.indexOf(b.r));
    if (named[0].r + named[0].s !== named[1].r + named[1].s) {
      exact = named[0].r + named[0].s + named[1].r + named[1].s;
      if (named[0].r !== named[1].r) suit = named[0].s === named[1].s ? "s" : "o";
    }
  }
  ranks.sort((a, b) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b));
  if (ranks[0] === ranks[1]) return { code: ranks[0] + ranks[1], suitGuessed: false, exact };
  const guessed = suit === null;
  return { code: ranks[0] + ranks[1] + (suit || "o"), suitGuessed: guessed, exact };
}

// ---------- карты с мастями (борд и точные карты героя) ----------
function suitOf(word, next) {
  const w = word.replace(/[^а-яa-z]/g, "");
  if (/^пик|^пики|^пиков/.test(w)) return "s";
  if (/^черв|^черен/.test(w)) return "h";
  if (/^бубн|^бубен|^буб$/.test(w)) return "d";
  if (/^треф|^крест/.test(w)) return "c";
  if (/^(мое|моей|мою|моя)$/.test(w) && next && /^маст/.test(next)) return "my";
  return null;
}
// «туз червей семь пик двойка» → [{r:"A",s:"h"},{r:"7",s:"s"},{r:"2",s:null}]
function cardsWithSuits(seg) {
  const out = [];
  const lat = seg.replace(/10/g, "t").match(/(?:^|\s)((?:[akqjt2-9][shdc]){1,5})(?=\s|$)/i);
  if (lat) {
    for (let i = 0; i < lat[1].length; i += 2) out.push({ r: lat[1][i].toUpperCase(), s: lat[1][i + 1].toLowerCase() });
    return out;
  }
  const words = seg.split(/[\s,.\-–]+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const su = suitOf(words[i], words[i + 1]);
    if (su) { const last = out[out.length - 1]; if (last && !last.s) last.s = su; continue; }
    if (/^маст/.test(words[i])) continue;
    const r = rankOf(words[i]);
    if (r) out.push({ r, s: null });
  }
  return out;
}

// ---------- позиция по словам ----------
function parsePosition(seg) {
  if (/utg ?\+ ?1|утг ?(\+|плюс) ?(1|один)/.test(seg)) return "UTG+1";
  if (/utg ?\+ ?2|утг ?(\+|плюс) ?(2|два)/.test(seg)) return "UTG+2";
  if (/мал\S* блайнд|(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))мб(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))|(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))sb(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))|смол/.test(seg)) return "SB";
  if (/больш\S* блайнд|(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))бб(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))|(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))bb(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))|биг/.test(seg)) return "BB";
  if (/баттон|батон|кнопк|дилер|(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))btn(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))/.test(seg)) return "BTN";
  if (/катоф|кат оф|(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))co(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))|(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))ко(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))/.test(seg)) return "CO";
  if (/хайдж|хай дж|(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))hj(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))/.test(seg)) return "HJ";
  if (/лоудж|лоджек|ло джек|(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))lj(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))/.test(seg)) return "LJ";
  if (/(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))utg(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))|(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))утг(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))|под прицел|первым|ранн/.test(seg)) return "UTG";
  return null;
}

// ---------- геометрия стола ----------
function aliveSeats(st) { return st.seats.filter(s => s.alive).map(s => s.seat); }
// рассадка текущей раздачи фиксируется при её начале; вылеты учитываются со следующей раздачи
function handSeats(st) { return st.hand && st.hand.seatsAtStart ? st.hand.seatsAtStart : aliveSeats(st); }

function nextAliveAfter(st, seat) {
  const n = st.seats.length;
  for (let i = 1; i <= n; i++) {
    const s = ((seat - 1 + i) % n) + 1;
    if (st.seats[s - 1].alive) return s;
  }
  return seat;
}

// позиции: {seat: "CO", ...} + порядок хода префлоп
function positions(st) {
  const res = { bySeat: {}, order: [] };
  if (st.buttonSeat == null || !st.seats.length) return res;
  const alive = handSeats(st);
  const n = alive.length;
  if (n < 2) return res;
  // места раздачи по часовой, начиная с баттона
  const sorted = [...alive].sort((a, b) => a - b);
  let bi = sorted.findIndex(x => x >= st.buttonSeat);
  if (bi < 0) bi = 0;
  const ring = [...sorted.slice(bi), ...sorted.slice(0, bi)];
  if (n === 2) {
    res.bySeat[ring[0]] = "BTN/SB"; res.bySeat[ring[1]] = "BB";
    res.order = [ring[0], ring[1]];
    return res;
  }
  const early = EARLY[n - 3] || EARLY[7];
  res.bySeat[ring[0]] = "BTN"; res.bySeat[ring[1]] = "SB"; res.bySeat[ring[2]] = "BB";
  const rest = ring.slice(3);
  rest.forEach((seat, i) => { res.bySeat[seat] = early[i] || ("MP" + (i + 1)); });
  res.order = [...rest, ring[0], ring[1], ring[2]];
  return res;
}

// какое место должно быть баттоном, чтобы игрок 1 стоял на позиции pos
function buttonForMyPosition(st, pos) {
  const alive = handSeats(st);
  const n = alive.length;
  // пробуем каждое место раздачи как баттон
  for (const cand of alive) {
    const tmp = { ...st, buttonSeat: cand };
    const p = positions(tmp).bySeat[1];
    if (p === pos || (n === 2 && pos === "BTN" && p === "BTN/SB") || (n === 2 && pos === "SB" && p === "BTN/SB")) return cand;
  }
  return null;
}

// ---------- разбор фразы в команды ----------
function splitSegments(t) {
  return t.split(/(?<!\d)[.,]|[.,](?!\d)|[;!?]|\sпотом\s|\sзатем\s|\sа\s+игрок|\sи\s+(?=игрок|у игрока|у меня|блайнд)/)
    .map(s => s.trim()).filter(Boolean);
}

function parseSegment(seg) {
  const cmds = [];
  const s = " " + seg + " ";

  if (/нов\S* сесси|начать заново|сбросить все|сброс сессии/.test(s)) return [{ type: "reset" }];
  if (/(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))отмен|(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))отмени|(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))назад(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))/.test(s)) return [{ type: "undo" }];

  // пересадка
  if (/пересад/.test(s)) {
    const n = numbersIn(s)[0];
    cmds.push({ type: "reseat", size: n || null });
    const pos = parsePosition(s); if (pos) cmds.push({ type: "myPos", pos });
    return cmds;
  }

  // блайнды / анте
  if (/блайнд|блайнды|уровень/.test(s) && !/я на|я в\s|у меня|позици/.test(s)) {
    const nums = numbersIn(s.replace(/анте.*/, ""));
    if (nums.length >= 2) cmds.push({ type: "blinds", sb: nums[0], bb: nums[1] });
    else if (nums.length === 1) cmds.push({ type: "blinds", sb: nums[0] / 2, bb: nums[0] });
    const a = s.match(/анте\s+(\d+(?:\.\d+)?)/); if (a) cmds.push({ type: "ante", value: parseFloat(a[1]) });
    if (cmds.length) return cmds;
  }
  { const a = s.match(/анте\s+(\d+(?:\.\d+)?)/); if (a) return [{ type: "ante", value: parseFloat(a[1]) }]; }

  // турнир / осталось игроков
  { const m = s.match(/турнир\S*\s+(?:на\s+)?(\d+)|(\d+)\s+(?:игрок\S*|человек)\s+в\s+турнир|осталось\s+(\d+)/);
    if (m) cmds.push({ type: "tournament", left: +(m[1] || m[2] || m[3]) }); }

  // размер стола
  { const m = s.match(/за столом\s+(\d+|\S+)|(\d+)\s+(?:игрок\S*|человек)\s+за столом|стол\S*\s+на\s+(\d+)/);
    if (m) { const v = m[1] ? (+m[1] || WORD_NUM[m[1]]) : +(m[2] || m[3]); if (v) cmds.push({ type: "table", size: v }); } }

  // баттон у игрока N
  { const m = s.match(/(?:баттон|батон|кнопк\S*|дилер)\s+(?:у|на)\s+игрок\S*\s+(\d+|\S+)/);
    if (m) { const v = +m[1] || WORD_NUM[m[1]]; if (v) cmds.push({ type: "button", seat: v }); return cmds; } }

  // мои действия: «я колл», «я рейз 3», «я пуш», «я чек», «я фолд», «я ставка 4»
  { const m = s.match(/(?:^|\s)я\s+(.*)/);
    if (m && !/^(на|в|во|сижу|сейчас|вылетел)\s/.test(m[1] + " ")) {
      const act = actOf(m[1]);
      if (act) return [{ type: "act", seat: 1, act, amount: numbersIn(m[1])[0] || null }];
    }
  }

  // моя позиция
  if (/(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))я\s+(на|в|сижу|сейчас)|моя позици|позиция\s/.test(s)) {
    const pos = parsePosition(s); if (pos) cmds.push({ type: "myPos", pos });
  }

  // мой стек
  { const m = s.match(/(?:у меня|мой стек|мой баланс|у меня стек)\s+(\d+(?:\.\d+)?)/);
    if (m) cmds.push({ type: "stack", seat: 1, value: parseFloat(m[1]) }); }

  // игроки
  { const m = s.match(/у игрок\S*\s+(\d+|\S+)\s+(?:стек\s+)?(\d+(?:\.\d+)?)/) || s.match(/игрок\S*\s+(\d+|\S+)\s+(?:стек|баланс|имеет)\s+(\d+(?:\.\d+)?)/);
    if (m) { const v = +m[1] || WORD_NUM[m[1]]; if (v) cmds.push({ type: "stack", seat: v, value: parseFloat(m[2]) }); } }

  { const m = s.match(/игрок\S*\s+(?:номер\s+)?(\d+|\S+)\s+(.*)/);
    if (m && !/^у игрок/.test(s.trim())) {
      const seat = +m[1] || WORD_NUM[m[1]];
      const rest = m[2];
      if (seat) {
        const amt = numbersIn(rest)[0];
        if (/вылетел|выбыл|вышел|ушел|вылет/.test(rest)) cmds.push({ type: "out", seat });
        else { const act = actOf(rest); if (act) cmds.push({ type: "act", seat, act, amount: act === "fold" || act === "check" || act === "limp" ? null : amt || null }); }
      }
    }
  }

  if (/(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))я\s+вылетел/.test(s)) cmds.push({ type: "out", seat: 1 });

  if (cmds.length) return cmds;

  // карты — только если в сегменте нет командных слов
  const c = parseCards(s);
  if (c) return [{ type: "hand", cards: c.code, suitGuessed: c.suitGuessed, ...(c.exact ? { exact: c.exact } : {}) }];
  return [];
}

const WB = "(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))";
function actOf(rest) {
  if (new RegExp("(?<![к])олл|ол ин|ол-ин|all|ва-?банк|пуш|вс[её]" + WB + "|на все").test(rest)) return "allin";
  if (/рейз|повыс|поднял|опен|ставк|бет|поставил/.test(rest)) return "raise";
  if (new RegExp("колл|" + WB + "кол" + WB + "|уравн|заколл").test(rest)) return "call";
  if (/лимп|докин|доставил/.test(rest)) return "limp";
  if (new RegExp("фолд|сброс|пас" + WB + "|скинул|сбросил").test(rest)) return "fold";
  if (/чек/.test(rest)) return "check";
  return null;
}

// борд: «флоп туз червей семь двойка», «тёрн король», «ривер пятёрка пик» (запятые внутри разрешены)
const STREET_WORD = /(?:^|\s)(флоп|flop|терн|turn|ривер|river)\s+/;
function extractBoard(t) {
  const cmds = [];
  let m;
  while ((m = t.match(STREET_WORD))) {
    const start = m.index;
    const after = t.slice(start + m[0].length);
    const stop = after.search(/(?:^|[\s,.;!?])(?:игрок|у игрока|я\s|флоп|flop|терн|turn|ривер|river|банк|у меня)|[.;!?]/);
    const body = stop < 0 ? after : after.slice(0, stop);
    const street = /флоп|flop/.test(m[1]) ? "flop" : /терн|turn/.test(m[1]) ? "turn" : "river";
    cmds.push({ type: "board", street, cards: cardsWithSuits(body) });
    t = t.slice(0, start) + " , " + (stop < 0 ? "" : after.slice(stop));
  }
  return { t, cmds };
}

function sortCommands(commands) {
  // порядок применения: сброс/отмена, стол, позиция, прочее, раздача, действия
  const rank = { reset: 0, undo: 0, reseat: 1, table: 1, tournament: 2, blinds: 2, ante: 2,
    myPos: 3, button: 3, stack: 4, out: 4, hand: 5, act: 6, board: 6 };
  // действия и улицы идут в порядке, в котором их назвали
  commands.forEach((c, i) => { c._i = c._i ?? i; });
  commands.sort((a, b) => ((rank[a.type] ?? 9) - (rank[b.type] ?? 9)) || (a._i - b._i));
  // «пересадили, за столом 3» → одна команда пересадки
  const rs = commands.find(c => c.type === "reseat"), tb = commands.find(c => c.type === "table");
  if (rs && tb) { rs.size = rs.size || tb.size; commands.splice(commands.indexOf(tb), 1); }
  return commands;
}

function parsePhrase(text) {
  const b = extractBoard(normalize(text));
  const t = b.t;
  const segs = splitSegments(t);
  const commands = [...b.cmds], unknown = [];
  for (const seg of segs) {
    const c = parseSegment(seg);
    if (c.length) commands.push(...c); else unknown.push(seg);
  }
  sortCommands(commands);
  return { commands, unknown };
}

// ---------- применение команд ----------
function makeSeats(n, keepMyStack) {
  return Array.from({ length: n }, (_, i) => ({ seat: i + 1, stack: i === 0 ? keepMyStack ?? null : null, alive: true }));
}

function applyCommands(state, commands) {
  let st = clone(state);
  const msgs = [];
  let newHand = false, actionsChanged = false, newStreet = false;
  const heroActs = [];

  for (const c of commands) {
    switch (c.type) {
      case "reset": st = initialState(); msgs.push("Новая сессия. Назовите состав стола и вашу позицию."); break;
      case "tournament": st.tournamentLeft = c.left; msgs.push(`В турнире: ${c.left}`); break;
      case "table": {
        const my = st.seats[0]?.stack ?? null;
        st.tableSize = c.size; st.seats = makeSeats(c.size, my); st.buttonSeat = null; st.firstHandPending = true; st.hand = null;
        msgs.push(`За столом ${c.size}, вы — игрок 1, дальше по часовой 2…${c.size}`); break;
      }
      case "reseat": {
        const my = st.seats[0]?.stack ?? null;
        const size = c.size || st.tableSize;
        if (!size) { msgs.push("Пересадка: назовите, сколько за новым столом"); break; }
        st.tableSize = size; st.seats = makeSeats(size, my); st.buttonSeat = null; st.firstHandPending = true; st.hand = null;
        msgs.push(`Новый стол на ${size}, нумерация заново. Назовите вашу позицию`); break;
      }
      case "blinds": st.blinds = { sb: c.sb, bb: c.bb }; msgs.push(`Блайнды ${c.sb}/${c.bb}`); break;
      case "ante": st.ante = c.value; msgs.push(`Анте ${fmt(c.value)} BB в банк`); break;
      case "myPos": {
        if (!st.seats.length) { msgs.push("Сначала скажите, сколько игроков за столом"); break; }
        const b = buttonForMyPosition(st, c.pos);
        if (b == null) { msgs.push(`Позиции ${c.pos} нет при таком числе игроков`); break; }
        st.buttonSeat = b; msgs.push(`Вы на позиции ${c.pos}, баттон у игрока ${b}`); break;
      }
      case "button":
        if (!st.seats[c.seat - 1]) { msgs.push(`Игрока ${c.seat} нет за столом`); break; }
        st.buttonSeat = c.seat; msgs.push(`Баттон у игрока ${c.seat}`); break;
      case "stack":
        if (!st.seats[c.seat - 1]) { msgs.push(`Игрока ${c.seat} нет за столом`); break; }
        st.seats[c.seat - 1].stack = c.value; msgs.push(`${c.seat === 1 ? "Ваш стек" : "Стек игрока " + c.seat}: ${fmt(c.value)} BB`); break;
      case "out":
        if (!st.seats[c.seat - 1]) break;
        st.seats[c.seat - 1].alive = false;
        if (st.tournamentLeft) st.tournamentLeft -= 1;
        msgs.push(c.seat === 1 ? "Вы вылетели" : `Игрок ${c.seat} вылетел`); break;
      case "hand": {
        if (!st.seats.length || st.buttonSeat == null) { msgs.push("Сначала: сколько за столом и ваша позиция"); break; }
        if (st.firstHandPending) st.firstHandPending = false;
        else st.buttonSeat = nextAliveAfter(st, st.buttonSeat);
        st.handNo += 1;
        st.hand = { cards: c.cards, exact: c.exact || null, actions: [], seatsAtStart: aliveSeats(st), street: "preflop", board: [] };
        newHand = true;
        msgs.push(`Раздача ${st.handNo}: ${c.exact || c.cards}${c.suitGuessed ? " (масть не названа — считаю разномастными)" : ""}`);
        break;
      }
      case "act": {
        if (!st.hand) { msgs.push("Действие без раздачи — сначала назовите карты"); break; }
        if (!st.seats[c.seat - 1]) { msgs.push(`Игрока ${c.seat} нет за столом`); break; }
        const street = st.hand.street || "preflop";
        const a = { seat: c.seat, act: c.act, amount: c.amount, street };
        // момент моего решения: снимок расчёта до действия (для статистики и разбора)
        if (c.seat === 1 && hooks.onHeroAct) { try { Object.assign(a, hooks.onHeroAct(st, a)); } catch (e) {} }
        st.hand.actions.push(a);
        if (c.act === "allin" && c.amount && street === "preflop") st.seats[c.seat - 1].stack = c.amount;
        if (c.seat === 1) heroActs.push(a); else actionsChanged = true;
        break;
      }
      case "board": {
        if (!st.hand) { msgs.push("Борд без раздачи — сначала назовите карты"); break; }
        const need = { flop: 3, turn: 1, river: 1 }[c.street];
        const cards = c.cards.slice(0, need);
        if (cards.length < need) { msgs.push(`Не расслышал карты ${STREET_RU[c.street]}а — повторите`); break; }
        const keep = { flop: 0, turn: 3, river: 4 }[c.street];
        if ((st.hand.board || []).length < keep) { msgs.push(`Сначала назовите ${keep === 3 ? "флоп" : "тёрн"}`); break; }
        st.hand.board = [...(st.hand.board || []).slice(0, keep), ...cards];
        st.hand.street = c.street;
        newStreet = true;
        msgs.push(`${STREET_RU[c.street][0].toUpperCase() + STREET_RU[c.street].slice(1)}: ${cards.map(x => x.r + (x.s && x.s !== "my" ? SUIT_SIGN[x.s] : "")).join(" ")}`);
        break;
      }
    }
  }
  return { state: st, msgs, heroActs, needAdvice: (newHand || actionsChanged || newStreet) && !!st.hand };
}
const STREET_RU = { preflop: "префлоп", flop: "флоп", turn: "тёрн", river: "ривер" };
const SUIT_SIGN = { s: "♠", h: "♥", d: "♦", c: "♣" };
const hooks = {};

// конкретные карты героя и борда; неназванные масти подбираются так, чтобы не было лишних флеш-дро
function concreteCards(hand) {
  if (!hand) return { hero: [], board: [] };
  const board = hand.board || [];
  const taken = new Set(board.filter(c => c.s && c.s !== "my").map(c => c.r + c.s));
  let hero;
  if (hand.exact) hero = [hand.exact.slice(0, 2), hand.exact.slice(2, 4)];
  else {
    const [r1, r2, t] = hand.cards;
    const opts = [];
    const S = "hsdc";
    if (r1 === r2) { for (const a of S) for (const b of S) if (a < b) opts.push([r1 + a, r2 + b]); }
    else if (t === "s") { for (const a of S) opts.push([r1 + a, r2 + a]); }
    else { for (const a of S) for (const b of S) if (a !== b) opts.push([r1 + a, r2 + b]); }
    hero = opts.find(o => !o.some(c => taken.has(c))) || opts[0];
  }
  const used = new Set([...hero, ...taken]);
  const heroSuits = hero.map(c => c[1]);
  const out = [];
  const seenSuits = [];
  for (const c of board) {
    let s = c.s;
    if (s === "my") s = heroSuits[0];
    if (!s || hero.includes(c.r + s) || (!c.s && used.has(c.r + s)) || (c.s === "my" && used.has(c.r + s))) {
      // сначала масти, которых нет ни у меня, ни на борде, — радуга
      const pref = [..."cdsh"].sort((a, b) => (heroSuits.includes(a) + seenSuits.filter(x => x === a).length) - (heroSuits.includes(b) + seenSuits.filter(x => x === b).length));
      s = pref.find(x => !used.has(c.r + x)) || s;
    }
    if (c.s === "my" && used.has(c.r + s) && !taken.has(c.r + s)) { /* моя масть занята — оставляем подбор выше */ }
    used.add(c.r + s); seenSuits.push(s);
    out.push(c.r + s);
  }
  return { hero, board: out };
}
const cardSign = (c) => (c[0] === "T" ? "10" : c[0]) + SUIT_SIGN[c[1]];

// ---------- фишки на столе: всё в больших блайндах ----------
// МБ = 0.5, ББ = 1. Анте — общая сумма в банке в BB. «Рейз 3» — рейз до 3 BB, «олл-ин» — весь стек.
const fmt = (v) => (v == null ? "—" : String(Math.round(v * 10) / 10));

const STREETS = ["preflop", "flop", "turn", "river"];
function tableMoney(st) {
  const res = { bets: {}, pot: 0, antes: 0, toCall: 0, high: 0, folded: {}, sbSeat: null, bbSeat: null,
    committed: {}, street: "preflop", left: {} };
  if (!st.hand || st.buttonSeat == null) return res;
  const p = positions(st);
  for (const [seat, pos] of Object.entries(p.bySeat)) {
    if (pos === "SB" || pos === "BTN/SB") res.sbSeat = +seat;
    if (pos === "BB") res.bbSeat = +seat;
  }
  const cur = st.hand.street || "preflop";
  res.street = cur;
  const stackOf = (s) => st.seats[s - 1] ? st.seats[s - 1].stack : null;
  const committed = {};
  const leftOf = (s) => { const k = stackOf(s); return k != null ? Math.max(0, k - (committed[s] || 0)) : null; };
  // постфлоп: кто не вошёл в банк префлоп (и не назван), считается сбросившим; ББ в лимп-банке остаётся
  if (cur !== "preflop") {
    const pre = st.hand.actions.filter(a => (a.street || "preflop") === "preflop");
    const preHigh = Math.max(1, ...pre.filter(a => a.act !== "fold" && a.act !== "check").map(a => a.amount || (a.act === "limp" ? 1 : 2)));
    for (const s of handSeats(st)) {
      if (s === 1 || pre.some(a => a.seat === s)) continue;
      if (s === res.bbSeat && preHigh <= 1) continue;
      res.folded[s] = true;
    }
  }
  for (const street of STREETS.slice(0, STREETS.indexOf(cur) + 1)) {
    const bets = {};
    const cap = (s, v) => { const k = leftOf(s); return k != null ? Math.min(v, k) : v; };
    let high = 0;
    if (street === "preflop") {
      if (res.sbSeat) bets[res.sbSeat] = cap(res.sbSeat, 0.5);
      if (res.bbSeat) bets[res.bbSeat] = cap(res.bbSeat, 1);
      high = 1;
    }
    for (const a of st.hand.actions) {
      if ((a.street || "preflop") !== street) continue;
      const was = bets[a.seat] || 0;
      if (a.act === "fold") { res.folded[a.seat] = true; continue; }
      if (a.act === "check") continue;
      let v = was;
      if (a.act === "raise") v = a.amount || (high ? high * 2 : 1);
      else if (a.act === "call") v = a.amount || high;
      else if (a.act === "limp") v = 1;
      else if (a.act === "allin") v = leftOf(a.seat) != null ? leftOf(a.seat) + was
        : a.amount ? a.amount : Math.max(high, leftOf(1) != null ? leftOf(1) + (bets[1] || 0) : high);  // стек неизвестен — считаю, что он меня покрывает
      v = cap(a.seat, Math.max(v, was));
      bets[a.seat] = v;
      if (v > high) high = v;
    }
    if (street === cur) { res.bets = bets; res.high = high; }
    else for (const [s, v] of Object.entries(bets)) committed[s] = (committed[s] || 0) + v;
  }
  for (const [s, v] of Object.entries(res.bets)) res.committed[s] = (committed[s] || 0) + v;
  for (const [s, v] of Object.entries(committed)) if (!(s in res.committed)) res.committed[s] = v;
  for (const s of handSeats(st)) { const k = stackOf(s); if (k != null) res.left[s] = Math.max(0, Math.round((k - (res.committed[s] || 0)) * 100) / 100); }
  res.antes = st.ante || 0;
  res.pot = Math.round((res.antes + Object.values(res.committed).reduce((x, y) => x + y, 0)) * 100) / 100;
  res.toCall = Math.max(0, res.high - (res.bets[1] || 0));
  if (res.left[1] != null) res.toCall = Math.min(res.toCall, res.left[1]);
  return res;
}

// ---------- описание ситуации для нейросети ----------
const ACT_RU = { fold: "фолд", call: "колл", raise: "рейз", allin: "олл-ин", limp: "лимп", check: "чек" };

function describe(st) {
  const p = positions(st);
  const m = tableMoney(st);
  const lines = [];
  if (st.tournamentLeft) lines.push(`Осталось в турнире: ${st.tournamentLeft}.`);
  lines.push(`За столом в раздаче: ${handSeats(st).length}.`);
  lines.push("Все стеки и ставки — в больших блайндах (BB). МБ 0.5, ББ 1." + (st.ante ? ` Анте в банке: ${fmt(st.ante)} BB.` : " Анте нет.") +
    (st.blinds ? ` Уровень блайндов ${st.blinds.sb}/${st.blinds.bb}.` : ""));
  const street = st.hand ? st.hand.street || "preflop" : "preflop";
  if (st.hand) {
    const cc = concreteCards(st.hand);
    lines.push(`Раздача №${st.handNo}. Мои карты: ${st.hand.cards}${cc.hero.length ? ` (${cc.hero.join(" ")})` : ""}.`);
    if (street !== "preflop") {
      lines.push(`Улица: ${STREET_RU[street]}. Борд: ${cc.board.join(" ")}.`);
      const prev = st.hand.actions.filter(a => a.street !== street);
      if (prev.length) lines.push("Действия на прошлых улицах: " + prev.map(a => `${STREET_RU[a.street || "preflop"]} — ${a.seat === 1 ? "я" : "игрок " + a.seat} ${ACT_RU[a.act]}${a.amount ? " " + fmt(a.amount) : ""}`).join("; ") + ".");
    }
    lines.push(`Банк сейчас: ${fmt(m.pot)} BB. Максимальная ставка на этой улице: ${fmt(m.high)} BB. Мне доставить до колла: ${fmt(m.toCall)} BB.`);
  }
  lines.push(street === "preflop" ? "Порядок хода префлоп:" : `Игроки (ставки — на улице ${STREET_RU[street]}):`);
  const acted = {};
  if (st.hand) for (const a of st.hand.actions) if ((a.street || "preflop") === street) acted[a.seat] = a;
  for (const seat of p.order) {
    const s = st.seats[seat - 1];
    const who = seat === 1 ? "Я (игрок 1)" : `Игрок ${seat}`;
    if (street !== "preflop" && m.folded[seat]) continue;
    const stack = m.left[seat] != null && street !== "preflop" ? `осталось ${fmt(m.left[seat])} BB` : s.stack != null ? `стек ${fmt(s.stack)} BB` : "стек неизвестен";
    const bet = m.bets[seat] ? `, в банке ${fmt(m.bets[seat])} BB` : "";
    const a = acted[seat];
    const act = seat === 1 ? (a ? `${ACT_RU[a.act]}${a.amount ? " " + fmt(a.amount) + " BB" : ""} (моё действие)` : "← МОЙ ХОД") : m.folded[seat] ? "фолд" : a ? `${ACT_RU[a.act]}${a.amount ? " " + fmt(a.amount) + " BB" : ""}` : "действие не названо";
    lines.push(`- ${p.bySeat[seat]}: ${who}, ${stack}${bet}, ${act}`);
  }
  return lines.join("\n");
}


const ADVICE_SYSTEM = `Ты тренер по турнирному покеру (MTT, Spin&Go, SNG), игра на виртуальные фишки, цель — обучение.
Тебе дают точное состояние стола (префлоп или постфлоп с бордом): позиции, стеки и ставки в больших блайндах (BB), действия соперников. Ответ будет озвучен голосом:
- по-русски, 1–2 коротких предложения, без списков, звёздочек и символов;
- начинай с действия: «Фолд», «Колл», «Рейз до …», «Олл-ин», «Чек»;
- размер рейза называй в BB («рейз до двух с половиной»);
- затем одно короткое объяснение: стек в BB, позиция, кто уже вошёл в банк;
- карты и позиции называй словами по-русски, не пиши латинские обозначения вроде A5s;
- не называй точных процентов эквити.
Если стеки соперников неизвестны — исходи из средних. Не переспрашивай.`;

const PARSE_SYSTEM = `Преобразуй фразу игрока о покерном столе в JSON-массив команд. Верни ТОЛЬКО JSON, без пояснений.
Текст получен распознаванием речи и может содержать ошибки. Игрок 1 — говорящий, остальные пронумерованы по часовой.
Все стеки и ставки — в больших блайндах (BB), бывают дробные: 2.5. Анте — общая сумма в банке в BB.
{"type":"hand","cards":"AKs"} — новые карты (пары "99", одномастные s, разномастные o)
{"type":"act","seat":N,"act":"fold|call|raise|allin|limp|check","amount":BB или null}   (seat 1 — это «я»; ставка/бет — raise)
{"type":"board","street":"flop|turn|river","cards":[{"r":"A","s":"h"},{"r":"7","s":null}]} — карты борда (r: AKQJT98765432, s: s h d c или null)
{"type":"stack","seat":N,"value":BB}   {"type":"out","seat":N}
{"type":"ante","value":BB}
{"type":"table","size":N}   {"type":"tournament","left":N}
{"type":"myPos","pos":"BTN|SB|BB|UTG|UTG+1|UTG+2|LJ|HJ|CO"}   {"type":"button","seat":N}
Если это вопрос или фраза не про состояние стола — верни [].`;

window.TourEngine = { fmt, tableMoney, concreteCards, cardSign, hooks, STREET_RU, handSeats, initialState, parsePhrase, sortCommands, applyCommands, positions, describe, ACT_RU, POS_RU, ADVICE_SYSTEM, PARSE_SYSTEM };
})();
