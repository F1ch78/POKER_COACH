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
  ranks.sort((a, b) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b));
  if (ranks[0] === ranks[1]) return { code: ranks[0] + ranks[1], suitGuessed: false };
  const guessed = suit === null;
  return { code: ranks[0] + ranks[1] + (suit || "o"), suitGuessed: guessed };
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
        else if (/(?<![к])олл|ол ин|ол-ин|all|ва-?банк|пуш|вс[её](?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))|на все/.test(rest)) cmds.push({ type: "act", seat, act: "allin", amount: amt || null });
        else if (/рейз|повыс|поднял|опен|ставк|бет/.test(rest)) cmds.push({ type: "act", seat, act: "raise", amount: amt || null });
        else if (/колл|(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))кол(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))|уравн|заколл/.test(rest)) cmds.push({ type: "act", seat, act: "call", amount: amt || null });
        else if (/лимп|докин|доставил/.test(rest)) cmds.push({ type: "act", seat, act: "limp", amount: null });
        else if (/фолд|сброс|пас(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))|скинул|сбросил/.test(rest)) cmds.push({ type: "act", seat, act: "fold", amount: null });
        else if (/чек/.test(rest)) cmds.push({ type: "act", seat, act: "check", amount: null });
      }
    }
  }

  if (/(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))я\s+вылетел/.test(s)) cmds.push({ type: "out", seat: 1 });

  if (cmds.length) return cmds;

  // карты — только если в сегменте нет командных слов
  const c = parseCards(s);
  if (c) return [{ type: "hand", cards: c.code, suitGuessed: c.suitGuessed }];
  return [];
}

function sortCommands(commands) {
  // порядок применения: сброс/отмена, стол, позиция, прочее, раздача, действия
  const rank = { reset: 0, undo: 0, reseat: 1, table: 1, tournament: 2, blinds: 2, ante: 2,
    myPos: 3, button: 3, stack: 4, out: 4, hand: 5, act: 6 };
  commands.sort((a, b) => (rank[a.type] ?? 9) - (rank[b.type] ?? 9));
  // «пересадили, за столом 3» → одна команда пересадки
  const rs = commands.find(c => c.type === "reseat"), tb = commands.find(c => c.type === "table");
  if (rs && tb) { rs.size = rs.size || tb.size; commands.splice(commands.indexOf(tb), 1); }
  return commands;
}

function parsePhrase(text) {
  const t = normalize(text);
  const segs = splitSegments(t);
  const commands = [], unknown = [];
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
  let newHand = false, actionsChanged = false;

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
        st.hand = { cards: c.cards, actions: [], seatsAtStart: aliveSeats(st) };
        newHand = true;
        msgs.push(`Раздача ${st.handNo}: ${c.cards}${c.suitGuessed ? " (масть не названа — считаю разномастными)" : ""}`);
        break;
      }
      case "act":
        if (!st.hand) { msgs.push("Действие без раздачи — сначала назовите карты"); break; }
        if (!st.seats[c.seat - 1]) { msgs.push(`Игрока ${c.seat} нет за столом`); break; }
        st.hand.actions.push({ seat: c.seat, act: c.act, amount: c.amount });
        if (c.act === "allin" && c.amount) st.seats[c.seat - 1].stack = c.amount;
        actionsChanged = true;
        break;
    }
  }
  return { state: st, msgs, needAdvice: (newHand || actionsChanged) && !!st.hand };
}

// ---------- фишки на столе: всё в больших блайндах ----------
// МБ = 0.5, ББ = 1. Анте — общая сумма в банке в BB. «Рейз 3» — рейз до 3 BB, «олл-ин» — весь стек.
const fmt = (v) => (v == null ? "—" : String(Math.round(v * 10) / 10));

function tableMoney(st) {
  const res = { bets: {}, pot: 0, antes: 0, toCall: 0, high: 0, folded: {}, sbSeat: null, bbSeat: null };
  if (!st.hand || st.buttonSeat == null) return res;
  const p = positions(st);
  for (const [seat, pos] of Object.entries(p.bySeat)) {
    if (pos === "SB" || pos === "BTN/SB") res.sbSeat = +seat;
    if (pos === "BB") res.bbSeat = +seat;
  }
  const stackOf = (s) => st.seats[s - 1] ? st.seats[s - 1].stack : null;
  const cap = (s, v) => { const k = stackOf(s); return k != null ? Math.min(v, k) : v; };
  if (res.sbSeat) res.bets[res.sbSeat] = cap(res.sbSeat, 0.5);
  if (res.bbSeat) res.bets[res.bbSeat] = cap(res.bbSeat, 1);
  let high = 1;
  for (const a of st.hand.actions) {
    const cur = res.bets[a.seat] || 0;
    if (a.act === "fold") { res.folded[a.seat] = true; continue; }
    if (a.act === "check") continue;
    let v = cur;
    if (a.act === "raise") v = a.amount || high * 2;
    else if (a.act === "call") v = a.amount || high;
    else if (a.act === "limp") v = 1;
    else if (a.act === "allin") v = a.amount || stackOf(a.seat) || high;
    v = cap(a.seat, Math.max(v, cur));
    res.bets[a.seat] = v;
    if (v > high) high = v;
  }
  res.high = high;
  res.antes = st.ante || 0;
  res.pot = Math.round((res.antes + Object.values(res.bets).reduce((x, y) => x + y, 0)) * 100) / 100;
  res.toCall = Math.max(0, high - (res.bets[1] || 0));
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
  if (st.hand) {
    lines.push(`Раздача №${st.handNo}. Мои карты: ${st.hand.cards}.`);
    lines.push(`Банк сейчас: ${fmt(m.pot)} BB. Максимальная ставка: ${fmt(m.high)} BB. Мне доставить до колла: ${fmt(m.toCall)} BB.`);
  }
  lines.push("Порядок хода префлоп:");
  const acted = {};
  if (st.hand) for (const a of st.hand.actions) acted[a.seat] = a;
  for (const seat of p.order) {
    const s = st.seats[seat - 1];
    const who = seat === 1 ? "Я (игрок 1)" : `Игрок ${seat}`;
    const stack = s.stack != null ? `стек ${fmt(s.stack)} BB` : "стек неизвестен";
    const bet = m.bets[seat] ? `, в банке ${fmt(m.bets[seat])} BB` : "";
    const a = acted[seat];
    const act = seat === 1 ? "← МОЙ ХОД" : m.folded[seat] ? "фолд" : a ? `${ACT_RU[a.act]}${a.amount ? " " + fmt(a.amount) + " BB" : ""}` : "действие не названо";
    lines.push(`- ${p.bySeat[seat]}: ${who}, ${stack}${bet}, ${act}`);
  }
  return lines.join("\n");
}


const ADVICE_SYSTEM = `Ты тренер по турнирному покеру (MTT, Spin&Go, SNG), игра на виртуальные фишки, цель — обучение.
Тебе дают точное состояние стола префлоп: позиции, стеки и ставки в больших блайндах (BB), действия соперников. Ответ будет озвучен голосом:
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
{"type":"act","seat":N,"act":"fold|call|raise|allin|limp|check","amount":BB или null}
{"type":"stack","seat":N,"value":BB}   {"type":"out","seat":N}
{"type":"ante","value":BB}
{"type":"table","size":N}   {"type":"tournament","left":N}
{"type":"myPos","pos":"BTN|SB|BB|UTG|UTG+1|UTG+2|LJ|HJ|CO"}   {"type":"button","seat":N}
Если это вопрос или фраза не про состояние стола — верни [].`;

window.TourEngine = { fmt, tableMoney, initialState, parsePhrase, sortCommands, applyCommands, positions, describe, ACT_RU, POS_RU, ADVICE_SYSTEM, PARSE_SYSTEM };
})();
