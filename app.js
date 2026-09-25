// Интерфейс, голос (распознавание и синтез речи Android), сессии, настройки.
const $ = s => document.querySelector(s);
const chatEl = $('#chat');
const DEFAULTS = { apiKey: '', workspaceId: '', apiFormat: 'auto', model: 'claude-sonnet-4-5', baseUrl: '', voiceURI: '', rate: 1.1, autoListen: false, maxHistory: 40, scenario: 'dialog' };
let settings = { ...DEFAULTS };
let session = null;
let brain = null;
let state = 'idle'; // idle | listening | thinking | speaking
let busy = false;

// ================================================================ озвучка
const RANK_WORD = { A: 'туз', K: 'король', Q: 'дама', J: 'валет', T: 'десятка', 9: 'девятка', 8: 'восьмёрка',
  7: 'семёрка', 6: 'шестёрка', 5: 'пятёрка', 4: 'четвёрка', 3: 'тройка', 2: 'двойка' };
const PAIR_WORD = { A: 'тузов', K: 'королей', Q: 'дам', J: 'валетов', T: 'десяток', 9: 'девяток', 8: 'восьмёрок',
  7: 'семёрок', 6: 'шестёрок', 5: 'пятёрок', 4: 'четвёрок', 3: 'троек', 2: 'двоек' };
const REPL = [
  [/Spin\s*&\s*Go/gi, 'спин энд гоу'], [/\bMTT\b/g, 'эм ти ти'], [/\bSNG\b/g, 'эс эн джи'], [/\bICM\b/g, 'ай си эм'],
  [/\bEV\b/g, 'и ви'], [/\bGTO\b/g, 'джи ти о'], [/\bBB\b/g, 'бэ бэ'], [/\bSB\b/g, 'малый блайнд'], [/\bBTN\b/g, 'баттон'],
  [/\bHU\b/g, 'хедз ап'], [/(\d)\.(\d)/g, '$1,$2'], [/[*#_`>|]/g, ' '], [/\s*[—–]\s*/g, ', '],
];
function normalize(t) {
  t = t.replace(/\b([AKQJT2-9])([AKQJT2-9])([so])?\b/g, (m, a, b, s) => {
    if (!s && !/[AKQJT]/.test(a + b)) return m; // обычное число
    if (a === b && !s) return 'пара ' + PAIR_WORD[a];
    return `${RANK_WORD[a]} ${RANK_WORD[b]}${s === 's' ? ' одномастные' : s === 'o' ? ' разномастные' : ''}`;
  });
  for (const [p, r] of REPL) t = t.replace(p, r);
  return t.replace(/\s+/g, ' ').trim();
}

const Speech = {
  pending: 0,
  onIdle: () => {},
  voice() {
    const vs = speechSynthesis.getVoices();
    return vs.find(v => v.voiceURI === settings.voiceURI) || vs.find(v => /^ru/i.test(v.lang)) || null;
  },
  muted: false,
  say(text) {
    if (this.muted) return;
    const t = normalize(text);
    if (!/[а-яёa-z]/i.test(t)) return;
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'ru-RU';
    const v = this.voice();
    if (v) u.voice = v;
    u.rate = +settings.rate || 1;
    this.pending++;
    const done = () => { this.pending = Math.max(0, this.pending - 1); if (!this.pending) this.onIdle(); };
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
  },
  stop() { this.pending = 0; speechSynthesis.cancel(); },
  get busy() { return this.pending > 0; },
};

function sentenceBuffer(emit) {
  let buf = '';
  return {
    feed(chunk) {
      buf += chunk;
      let m;
      while ((m = buf.match(/[.!?…:;](?=\s)|\n/))) {
        const end = m.index + m[0].length;
        const s = buf.slice(0, end).trim();
        buf = buf.slice(end);
        if (s) emit(s);
      }
    },
    flush() { if (buf.trim()) emit(buf.trim()); buf = ''; },
  };
}

// ================================================================ распознавание речи
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, recStopByUser = false, silenceTimer = null, interimEl = null;

function listen() {
  if (!SR) { sys('Распознавание речи недоступно в этом браузере. Откройте приложение в Google Chrome.'); return; }
  if (rec) return;
  Speech.stop();
  wakeLock();
  const finals = [];
  let interim = '';
  rec = new SR();
  rec.lang = 'ru-RU';
  rec.continuous = true;
  rec.interimResults = true;
  recStopByUser = false;
  const text = () => (finals.join(' ') + ' ' + interim).replace(/\s+/g, ' ').trim();
  const armSilence = () => {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => rec && rec.stop(), 3500);
  };
  rec.onresult = e => {
    interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const tr = r[0].transcript.trim();
      if (r.isFinal) {
        const last = finals[finals.length - 1];
        // на части Android-телефонов финальные результаты повторяют предыдущие — убираем дубли
        if (last && tr.toLowerCase().startsWith(last.toLowerCase())) finals[finals.length - 1] = tr;
        else if (tr && tr !== last) finals.push(tr);
      } else interim += tr + ' ';
    }
    showInterim(text());
    armSilence();
  };
  rec.onerror = e => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') sys('Нет доступа к микрофону. Разрешите микрофон для этого сайта в настройках Chrome.');
    else if (e.error === 'network') sys('Распознаванию речи нужен интернет.');
    else if (e.error === 'no-speech') setStatus('Не расслышал — нажмите и говорите');
    else if (e.error !== 'aborted') sys('Микрофон: ' + e.error);
  };
  rec.onend = () => {
    clearTimeout(silenceTimer);
    const t = text();
    rec = null;
    clearInterim();
    if (t) handle(t);
    else setState('idle');
  };
  try { rec.start(); setState('listening'); } catch (e) { rec = null; sys('Микрофон: ' + e.message); }
}
function stopListening() { if (rec) { recStopByUser = true; rec.stop(); } }

function showInterim(t) {
  if (!interimEl) { interimEl = addMsg('user', ''); interimEl.classList.add('interim'); }
  interimEl.textContent = t || '…';
  scrollDown();
}
function clearInterim() { if (interimEl) { interimEl.remove(); interimEl = null; } }

// ================================================================ диалог
async function handle(text) {
  if (!settings.apiKey) { sys('Сначала укажите API-ключ Claude в настройках.'); openSheet('settings'); setState('idle'); return; }
  if (settings.scenario === 'tour' || settings.scenario === 'sng') return handleTour(text);
  return askCoach(text, false);
}

async function askCoach(text, alreadyShown) {
  busy = true;
  Speech.muted = false;
  if (!alreadyShown) addMsg('user', text);
  const bubble = addMsg('bot', '');
  setState('thinking');
  const sb = sentenceBuffer(s => { Speech.say(s); if (state !== 'speaking') setState('speaking'); });
  try {
    await brain.ask(text, chunk => { bubble.textContent = (bubble.textContent + chunk).replace(/^\s+/, ''); scrollDown(); sb.feed(chunk); });
    sb.flush();
    if (!bubble.textContent.trim()) bubble.remove();
  } catch (e) {
    if (!bubble.textContent.trim()) bubble.remove();
    const msg = e.message;
    sys('Ошибка: ' + msg);
  } finally {
    busy = false;
    renderHeader();
    if (!Speech.busy) afterAnswer();
  }
}
Speech.onIdle = () => { if (!busy) afterAnswer(); };

// ================================================================ сценарий «Турнир» и «Sit&Go»
// У каждого сценария свой стол: «Турнир» — data.tour, «Sit&Go» — data.sngTour
const isTable = () => settings.scenario === 'tour' || settings.scenario === 'sng';
const tourKey = () => settings.scenario === 'sng' ? 'sngTour' : 'tour';
const histKey = () => settings.scenario === 'sng' ? 'sngHist' : 'tourHist';
const curTour = () => session.data[tourKey()];
// Позиции, баттон и стеки считает tour-engine.js на телефоне. Нейросеть только советует.
async function handleTour(text) {
  const E = window.TourEngine;
  const d = session.data;
  busy = true;
  Speech.muted = false;
  addMsg('user', text);
  setState('thinking');
  let delegated = false;
  try {
    const sngMode = settings.scenario === 'sng';
    if (sngMode && !(d.sngTour && d.sngTour.sng)) { sys('Сначала выберите формат Sit&Go кнопками над чатом.'); return; }
    const before = d[tourKey()] || E.initialState();
    let { commands, unknown } = E.parsePhrase(text);

    if (commands.some(c => c.type === 'undo')) {
      const prev = (d[histKey()] || []).pop();
      if (prev) { d[tourKey()] = prev; await session.save(); renderTourBar(); sys('Отменил последнюю фразу'); Speech.say('Отменил'); }
      else sys('Отменять нечего');
      return;
    }

    if (unknown.length) {
      let extra = [];
      try { extra = await brain.parseTour(unknown.join(', ')); } catch (e) { brain.onLog('Разбор фразы: ' + e.message); }
      if (extra.length) commands = E.sortCommands([...commands, ...extra]);
      else if (!commands.length) {
        // это вопрос, а не данные о столе — отвечает тренер с учётом стола
        busy = false; delegated = true;
        return askCoach(text, true);
      }
    }
    if (!commands.length) { sys('Не понял фразу, скажите иначе'); return; }

    const r = E.applyCommands(before, commands);
    if (sngMode) {
      // пересадка/состав стола не должны терять формат Sit&Go; «новая сессия» — вернуть выбор формата
      if (before.sng && !r.state.sng && !commands.some(c => c.type === 'reset')) r.state.sng = before.sng;
      SNG.rescaleOnBlinds(before, r.state, commands);
    }
    d[histKey()] = [...(d[histKey()] || []).slice(-29), before];
    d[tourKey()] = r.state;
    syncCardFromTour(r.state);
    await session.save();
    renderTourBar();
    if (r.msgs.length) sys(r.msgs.join(' · '));

    if (r.needAdvice) {
      const bubble = addMsg('bot', '');
      const sb = sentenceBuffer(s => { Speech.say(s); if (state !== 'speaking') setState('speaking'); });
      const t0 = performance.now();
      let first = 0;
      const situation = E.describe(r.state) + (sngMode ? '\n' + SNG.context(r.state) : '');
      const ans = await brain.advise(situation, chunk => {
        if (!first) first = performance.now() - t0;
        bubble.textContent = (bubble.textContent + chunk).replace(/^\s+/, '');
        scrollDown(); sb.feed(chunk);
      }, sngMode ? SNG.ADVICE_SYSTEM : undefined);
      sb.flush();
      if (!ans) bubble.remove();
      else {
        session.addTurn('user', text);
        session.addTurn('assistant', ans);
        const t = document.createElement('small');
        t.style.cssText = 'display:block;opacity:.55;font-size:11px;margin-top:3px';
        t.textContent = `первое слово через ${(first / 1000).toFixed(1)} с`;
        bubble.appendChild(t);
      }
    } else if (r.msgs.length) Speech.say(r.msgs.join('. '));
  } catch (e) {
    sys('Ошибка: ' + e.message);
  } finally {
    if (!delegated) {
      busy = false;
      renderHeader();
      if (!Speech.busy) afterAnswer();
    }
  }
}

// Данные стола → «Карточка сессии» (турнир и раздачи), чтобы в «Диалоге» тренер видел то же самое
function syncCardFromTour(st) {
  const E = window.TourEngine;
  const t = {};
  if (st.tournamentLeft) t.players = st.tournamentLeft;
  if (st.sng) { t.format = `Spin&Gold ${st.sng.fmt}-max ${SNG.multLabel(st.sng.mult)}`; t.starting_stack = st.sng.chips + ' фишек'; }
  if (st.blinds) t.blinds = `${st.blinds.sb}/${st.blinds.bb}`;
  if (st.ante) t.ante = TourEngine.fmt(st.ante) + ' BB';
  const me = st.seats[0];
  if (me && me.stack != null) t.hero_stack = TourEngine.fmt(me.stack) + ' BB';
  if (Object.keys(t).length) session.updateTournament(t);
  if (st.hand) {
    const pos = E.positions(st).bySeat[1];
    const pre = st.hand.actions.map(a => `игрок ${a.seat} ${E.ACT_RU[a.act]}${a.amount ? ' ' + a.amount : ''}`).join(', ');
    const f = { hero_position: pos, hero_cards: st.hand.cards, hero_stack: me && me.stack != null ? E.fmt(me.stack) + ' BB' : undefined,
      blinds: t.blinds, preflop: pre || undefined, summary: `${pos || ''} ${st.hand.cards}`.trim() };
    if (st.hand.cardId) f.hand_id = st.hand.cardId;
    st.hand.cardId = session.upsertHand(f).hand.id;
  }
  brain.onCardChanged();
}

// ---------------------------------------------------------------- визуальный стол
// Показывает ровно то состояние, которое уходит нейросети: позиции, блайнды, ставки, банк.
// Позиции и баттон меняются только при новой раздаче (когда названы карты), ставки — по ходу раунда.
const SUIT_RED = { s: false, o: true };
function miniCards(code) {
  if (!code) return '<div class="tt-wait">ждём карты</div>';
  const r = c => c === 'T' ? '10' : c;
  const second = code[2] === 's' ? '♠' : '♥';
  return `<div class="tt-cards"><span class="cd">${r(code[0])}<em>♠</em></span>` +
    `<span class="cd${second === '♥' ? ' red' : ''}">${r(code[1])}<em>${second}</em></span></div>`;
}

let ttLastHand = null;
function renderTourTable() {
  const E = window.TourEngine;
  const bar = $('#tourBar');
  const st = curTour();
  if (settings.scenario === 'sng' && !(st && st.sng)) { renderSngSetup(); ttLastHand = null; return; }
  if (!st || !st.seats || !st.seats.length) {
    bar.innerHTML = '<div class="hint">Для начала скажите: «Турнир на 18, за столом 6, я на баттоне, у меня 15». Стеки — в больших блайндах.</div>';
    ttLastHand = null;
    return;
  }
  if (!bar.querySelector('.tt')) {
    bar.innerHTML = `<div class="tt-head"><span id="ttTitle"></span>
        <button id="ttNew" title="Новый Sit&Go">↺</button><button id="ttSeeBtn" title="Что видит нейросеть">👁</button><button id="ttFold" title="Свернуть">▾</button></div>
      <div class="tt"><div class="tt-felt"></div><div id="ttLayer"></div><i id="ttD">D</i></div>
      <pre id="ttSee"></pre>`;
    $('#ttSeeBtn').onclick = () => { settings.tableSee = !settings.tableSee; DB.put('kv', settings, 'settings'); renderTourTable(); };
    $('#ttFold').onclick = () => { settings.tableFolded = !settings.tableFolded; DB.put('kv', settings, 'settings'); renderTourTable(); };
    $('#ttNew').onclick = async () => {
      if (!confirm('Начать новый Sit&Go? Текущий стол будет сброшен.')) return;
      session.data.sngHist = [...(session.data.sngHist || []).slice(-29), session.data.sngTour];
      session.data.sngTour = null; await session.save(); $('#tourBar').innerHTML = ''; renderTourTable();
    };
  }
  const p = E.positions(st);
  const m = E.tableMoney(st);
  const acted = {};
  (st.hand ? st.hand.actions : []).forEach(a => { acted[a.seat] = a; });
  const newHand = ttLastHand !== st.handNo;
  ttLastHand = st.handNo;

  $('#ttTitle').textContent = [st.sng ? `${st.sng.fmt}-max ${SNG.multLabel(st.sng.mult)}` : '',
    st.hand ? `Раздача ${st.handNo}` : 'До первой раздачи',
    'стеки в BB', st.ante ? `анте ${E.fmt(st.ante)}` : '', st.blinds ? `уровень ${st.blinds.sb}/${st.blinds.bb}` : '',
    !st.sng && st.tournamentLeft ? `в турнире ${st.tournamentLeft}` : '',
    st.sng ? `платят ${st.sng.payouts.length}` : ''].filter(Boolean).join(' · ');
  $('#ttNew').style.display = st.sng ? '' : 'none';
  bar.querySelector('.tt').style.display = settings.tableFolded ? 'none' : '';
  $('#ttFold').textContent = settings.tableFolded ? '▸' : '▾';
  $('#ttSee').style.display = settings.tableSee ? '' : 'none';
  $('#ttSee').textContent = E.describe(st) + (st.sng ? '\n' + SNG.context(st) : '');
  $('#ttSeeBtn').classList.toggle('on', !!settings.tableSee);

  const n = st.seats.length;
  const pt = (i, rx, ry, shift = 0) => {
    const ang = Math.PI / 2 + i * 2 * Math.PI / n + shift;   // игрок 1 внизу, дальше по часовой
    return { x: 50 + rx * Math.cos(ang), y: 50 + ry * Math.sin(ang) };
  };
  let html = '';
  st.seats.forEach((s, i) => {
    const pos = p.bySeat[s.seat] || '';
    const a = acted[s.seat];
    const folded = m.folded[s.seat];
    const blind = s.seat === m.sbSeat ? ' sb' : s.seat === m.bbSeat ? ' bb' : '';
    const info = !s.alive ? 'вылетел' : folded ? 'фолд' : (s.stack != null ? E.fmt(s.stack) + ' bb' : '—');
    const act = a && !folded && s.alive ? `<u>${E.ACT_RU[a.act]}</u>` : '';
    const c = pt(i, 41, 41);
    html += `<div class="ts${s.seat === 1 ? ' me' : ''}${!s.alive || folded ? ' dim' : ''}" style="left:${c.x}%;top:${c.y}%">` +
      `<b>${s.seat === 1 ? 'Я' : s.seat}</b>${pos ? `<span class="pt${blind}${newHand ? ' flash' : ''}">${esc(pos)}</span>` : ''}` +
      `<small>${esc(info)}</small>${act}</div>`;
    const bet = m.bets[s.seat];
    if (bet) {
      const q = pt(i, 24, 22);
      html += `<div class="tb${blind}" style="left:${q.x}%;top:${q.y}%"><i></i>${E.fmt(bet)}</div>`;
    }
  });
  html += `<div class="tt-mid">${miniCards(st.hand && st.hand.cards)}` +
    (st.hand ? `<div class="tt-pot">банк ${E.fmt(m.pot)} BB${m.toCall ? `<br><span>мне колл ${E.fmt(m.toCall)}</span>` : ''}</div>` : '') + '</div>';
  $('#ttLayer').innerHTML = html;

  const d = $('#ttD');
  const bi = st.seats.findIndex(s => s.seat === st.buttonSeat);
  if (bi >= 0) { const q = pt(bi, 30, 28, 0.32); d.style.display = ''; d.style.left = q.x + '%'; d.style.top = q.y + '%'; }
  else d.style.display = 'none';
}

// ---------------------------------------------------------------- запуск Sit&Go
let sngPick = null;
function renderSngSetup() {
  const S = window.SNG;
  if (!sngPick) sngPick = Object.assign({ fmt: 3, mult: '2', chips: 300, pos: 'BTN' }, settings.sngLast || {});
  const pk = sngPick;
  if (!S.MULTS[pk.fmt].includes(pk.mult)) { pk.mult = S.MULTS[pk.fmt][0]; pk.chips = S.defaultChips(pk.fmt, pk.mult); }
  if (!S.POSITIONS[pk.fmt].includes(pk.pos)) pk.pos = 'BTN';
  const pay = S.payouts(pk.fmt, pk.mult).map(x => Math.round(x * 1000) / 10 + '%').join(' / ');
  const chip = (group, val, label, on) => `<button class="chip${on ? ' on' : ''}" data-g="${group}" data-v="${val}">${label}</button>`;
  $('#tourBar').innerHTML = `<div class="sng">
    <div class="sng-row"><span>Формат</span>${[3, 6].map(f => chip('fmt', f, f + '-max', pk.fmt === f)).join('')}</div>
    <div class="sng-row"><span>Множитель</span>${S.MULTS[pk.fmt].map(m => chip('mult', m, S.multLabel(m), pk.mult === m)).join('')}</div>
    <div class="sng-row"><span>Стек</span>${[300, 500, 800, 1000].map(c => chip('chips', c, c + ` <small>${c / 20} BB</small>`, pk.chips === c)).join('')}</div>
    <div class="sng-row"><span>Я на</span>${S.POSITIONS[pk.fmt].map(p => chip('pos', p, S.POS_LABEL[p], pk.pos === p)).join('')}</div>
    <div class="hint">Выплаты: ${pay}. Блайнды 10/20. Потом голосом: карты, действия соперников, «блайнды 15 30», «игрок 3 вылетел».</div>
    <button class="primary" id="sngGo" style="width:100%;margin-top:8px">Начать Sit&Go</button></div>`;
  $('#tourBar').querySelectorAll('.chip').forEach(b => b.onclick = () => {
    const g = b.dataset.g, v = b.dataset.v;
    if (g === 'fmt') { pk.fmt = +v; pk.mult = S.MULTS[pk.fmt][0]; pk.chips = S.defaultChips(pk.fmt, pk.mult); }
    else if (g === 'mult') { pk.mult = v; pk.chips = S.defaultChips(pk.fmt, v); }
    else if (g === 'chips') pk.chips = +v;
    else pk.pos = v;
    renderSngSetup();
  });
  $('#sngGo').onclick = async () => {
    const st = S.start(pk.fmt, pk.mult, pk.chips, pk.pos);
    session.data.sngTour = st;
    session.data.sngHist = [];
    settings.sngLast = { ...pk };
    await DB.put('kv', settings, 'settings');
    syncCardFromTour(st);
    await session.save();
    $('#tourBar').innerHTML = '';
    renderTourTable();
    const msg = `Sit&Go ${pk.fmt}-max ${S.multLabel(pk.mult)}, по ${pk.chips / 20} BB, вы на позиции ${S.POS_LABEL[pk.pos]}. Называйте карты.`;
    sys(msg + ' ' + S.stageText(st));
    Speech.say(msg);
  };
}

function renderTourBar() {
  const tour = isTable();
  $('#modeDialog').classList.toggle('on', settings.scenario === 'dialog' || !settings.scenario);
  $('#modeTour').classList.toggle('on', settings.scenario === 'tour');
  $('#modeSng').classList.toggle('on', settings.scenario === 'sng');
  $('#tourBar').style.display = tour ? '' : 'none';
  if (tour) renderTourTable();
}

async function setScenario(m) {
  if (settings.scenario === m) return;
  settings.scenario = m;
  await DB.put('kv', settings, 'settings');
  renderTourBar();
  renderChat();
  $('#tourBar').innerHTML = '';
  renderTourBar();
  sys(m === 'tour'
    ? 'Сценарий «Турнир». Назовите карты — начнётся новая раздача, баттон сдвинется сам. «Отмена» — отменить последнюю фразу.'
    : m === 'sng'
    ? 'Сценарий «Sit&Go» (Spin & Gold). Выберите формат, множитель, стек и позицию и нажмите «Начать». Дальше — как в «Турнире»: карты, действия, «отмена».'
    : 'Обычный диалог. Если стол заполнен, тренер его учитывает.');
}
$('#modeDialog').onclick = () => setScenario('dialog');
$('#modeTour').onclick = () => setScenario('tour');
$('#modeSng').onclick = () => setScenario('sng');
function afterAnswer() {
  if (rec) return;
  setState('idle');
  if (settings.autoListen) setTimeout(() => { if (state === 'idle' && !busy) listen(); }, 350);
}

function setState(s) {
  state = s;
  const mic = $('#mic');
  mic.className = s === 'idle' ? '' : s;
  mic.textContent = { idle: '🎤', listening: '■', thinking: '…', speaking: '🔊' }[s];
  setStatus({
    idle: settings.autoListen ? 'Режим разговора: нажмите 🎤 и говорите' : 'Нажмите 🎤 и говорите',
    listening: 'Слушаю… нажмите ■, когда закончите',
    thinking: 'Думаю…',
    speaking: 'Отвечаю… нажмите, чтобы перебить',
  }[s]);
}
function setStatus(t) { $('#status').textContent = t || ''; }

$('#mic').onclick = () => {
  // «разблокируем» синтез речи первым касанием (требование Chrome)
  if (!window._ttsUnlocked) { speechSynthesis.speak(new SpeechSynthesisUtterance(' ')); window._ttsUnlocked = true; }
  if (state === 'listening') stopListening();
  else if (state === 'speaking') {
    Speech.stop();
    if (busy) { Speech.muted = true; setState('thinking'); } else listen();
  }
  else if (state === 'thinking') { /* ждём */ }
  else listen();
};
$('#autoBtn').onclick = async () => {
  settings.autoListen = !settings.autoListen;
  $('#autoBtn').classList.toggle('on', settings.autoListen);
  await DB.put('kv', settings, 'settings');
  sys(settings.autoListen ? 'Режим разговора включён: после ответа тренера микрофон включается сам.' : 'Режим разговора выключен.');
  if (state === 'idle') setState('idle');
};
$('#kbdBtn').onclick = () => { $('#typeRow').classList.toggle('show'); if ($('#typeRow').classList.contains('show')) $('#typeInput').focus(); };
function sendTyped() {
  const t = $('#typeInput').value.trim();
  if (!t || busy) return;
  $('#typeInput').value = '';
  Speech.stop();
  handle(t);
}
$('#sendBtn').onclick = sendTyped;
$('#typeInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendTyped(); });

// ================================================================ чат
function addMsg(role, text) {
  const d = document.createElement('div');
  d.className = 'msg ' + role;
  d.textContent = text;
  const empty = chatEl.querySelector('.empty');
  if (empty) empty.remove();
  chatEl.appendChild(d);
  scrollDown();
  return d;
}
function sys(t) { addMsg('sys', t); }
function scrollDown() { chatEl.scrollTop = chatEl.scrollHeight; }
function renderChat() {
  chatEl.innerHTML = '';
  const h = session.data.history;
  if (!h.length && settings.scenario === 'sng') {
    chatEl.innerHTML = `<div class="empty"><b>Сценарий «Sit&Go»</b><br><br>
      Выберите над чатом формат (3 или 6 игроков), множитель, стек и свою позицию — и нажмите «Начать».<br><br>
      Дальше каждой фразой называйте карты: «туз король одномастные». Действия: «игрок 2 олл-ин», «игрок 3 фолд».
      Блайнды выросли — «блайнды 15 30», стеки пересчитаются сами. Вылет — «игрок 3 вылетел».
      Тренер учитывает выплаты множителя и баббл.</div>`;
    return;
  }
  if (!h.length && settings.scenario === 'tour') {
    chatEl.innerHTML = `<div class="empty"><b>Сценарий «Турнир»</b><br><br>
      Сначала состав стола: «турнир на 18, за столом 6, я на баттоне, у меня 15». Все стеки и ставки — в больших блайндах.<br><br>
      Дальше каждой фразой называйте карты: «пара девяток», «туз король одномастные». Можно добавить действия:
      «игрок 3 рейз 2,5», «у игрока 4 22», «игрок 5 вылетел», «анте 1».</div>`;
    return;
  }
  if (!h.length) {
    chatEl.innerHTML = `<div class="empty"><b>Расскажите про турнир и раздачу</b><br><br>
      Например: «Играл спин по пять долларов, стек 500, блайнды 10/20. Первая раздача: я на баттоне с туз-пятёркой одномастной…»<br><br>
      Потом просто: «следующая раздача», «вернись к первой», «а если бы я сфолдил?»</div>`;
    return;
  }
  for (const m of h.slice(-60)) addMsg(m.role === 'user' ? 'user' : 'bot', m.content);
}
function renderHeader() {
  const d = session.data;
  $('#sessTitle').textContent = d.title || d.tournament.format || 'Новая сессия';
  const dt = new Date(d.created);
  $('#sessSub').textContent = `${dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} · раздач: ${d.hands.length}`;
}

// ================================================================ шторки
function openSheet(name) {
  if (name === 'card') renderCard();
  if (name === 'sessions') renderSessions();
  if (name === 'kb') renderKB();
  if (name === 'settings') renderSettings();
  $('#sheet-' + name).classList.add('show');
}
document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openSheet(b.dataset.open));
document.querySelectorAll('.sheet').forEach(sh => {
  sh.addEventListener('click', e => { if (e.target === sh || e.target.hasAttribute('data-close')) sh.classList.remove('show'); });
});
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kvHtml = (obj, names) => Object.entries(obj).filter(([k]) => k !== 'id')
  .map(([k, v]) => `<div>${esc(names[k] || k)}</div><div>${esc(v)}</div>`).join('') || '<div>—</div><div></div>';

const T_NAMES = { format: 'Формат', buy_in: 'Бай-ин', players: 'Игроков', starting_stack: 'Старт. стек', stage: 'Стадия',
  blinds: 'Блайнды', ante: 'Анте', hero_stack: 'Мой стек', notes: 'Заметки' };
const H_NAMES = { hero_position: 'Позиция', hero_cards: 'Карты', hero_stack: 'Стек', blinds: 'Блайнды', villains: 'Оппоненты',
  preflop: 'Префлоп', flop: 'Флоп', turn: 'Тёрн', river: 'Ривер', result: 'Итог', notes: 'Заметки', summary: 'Суть' };

function renderCard() {
  const d = session.data;
  $('#cardTourney').innerHTML = kvHtml(d.tournament, T_NAMES);
  const ct = (settings.scenario === 'sng' ? d.sngTour : d.tour);
  $('#cardTableWrap').style.display = ct && ct.seats && ct.seats.length ? '' : 'none';
  $('#cardTable').textContent = ct && ct.seats && ct.seats.length ? TourEngine.describe(ct) + (ct.sng ? '\n' + SNG.context(ct) : '') : '';
  $('#cardHands').innerHTML = d.hands.map(h => `<div class="item ${h.id === d.current_hand ? 'current' : ''}" data-hand="${h.id}">
      <div class="grow">№${h.id} ${esc(h.summary || [h.hero_position, h.hero_cards].filter(Boolean).join(', '))}</div></div>`).join('')
    || '<div class="hint">Пока нет — начните рассказывать раздачу.</div>';
  $('#cardHands').querySelectorAll('[data-hand]').forEach(el => el.onclick = () => {
    session.setCurrentHand(+el.dataset.hand); renderCard();
  });
  const cur = session.currentHand();
  $('#cardHand').innerHTML = cur ? kvHtml(cur, H_NAMES) : '<div>—</div><div></div>';
}

async function renderSessions() {
  const list = await Session.list();
  $('#sessList').innerHTML = list.map(s => `<div class="item ${s.id === session.data.id ? 'current' : ''}">
      <div class="grow" data-open-sess="${esc(s.id)}">${esc(s.title || (s.tournament && s.tournament.format) || 'Без названия')}
        <small>${new Date(s.updated || s.created).toLocaleString('ru-RU')} · раздач: ${(s.hands || []).length}</small></div>
      <button data-del-sess="${esc(s.id)}">🗑</button></div>`).join('') || '<div class="hint">Пока пусто.</div>';
  $('#sessList').querySelectorAll('[data-open-sess]').forEach(el => el.onclick = async () => {
    const d = list.find(s => s.id === el.dataset.openSess);
    switchSession(new Session(d));
    $('#sheet-sessions').classList.remove('show');
  });
  $('#sessList').querySelectorAll('[data-del-sess]').forEach(el => el.onclick = async () => {
    if (!confirm('Удалить эту сессию?')) return;
    await DB.del('sessions', el.dataset.delSess);
    if (el.dataset.delSess === session.data.id) switchSession(new Session());
    renderSessions();
  });
}
$('#newSess').onclick = () => { switchSession(new Session()); $('#sheet-sessions').classList.remove('show'); sys('Новая сессия'); };

function switchSession(s) {
  Speech.stop();
  $('#tourBar').innerHTML = '';
  session = s;
  brain.session = s;
  renderChat();
  renderHeader();
  renderTourBar();
}

async function renderKB() {
  const docs = await DB.all('kb');
  $('#kbList').innerHTML = docs.map(d => `<div class="item"><div class="grow">${esc(d.name)}<small>фрагментов: ${d.chunks.length}</small></div>
      <button data-del-kb="${esc(d.name)}">🗑</button></div>`).join('') || '<div class="hint">Пусто.</div>';
  $('#kbList').querySelectorAll('[data-del-kb]').forEach(el => el.onclick = async () => {
    if (!confirm('Удалить файл из базы?')) return;
    await KB.remove(el.dataset.delKb);
    renderKB();
  });
}
$('#kbAdd').onclick = () => $('#kbFile').click();
$('#kbFile').onchange = async e => {
  const files = [...e.target.files];
  e.target.value = '';
  if (!files.length) return;
  try {
    await KB.addFiles(files, t => $('#kbStatus').textContent = t);
    $('#kbStatus').textContent = `Готово. Всего фрагментов в базе: ${KB.chunks.length}`;
  } catch (err) { $('#kbStatus').textContent = 'Ошибка: ' + err.message; }
  renderKB();
};

function renderSettings() {
  $('#setKey').value = settings.apiKey;
  $('#setWs').value = settings.workspaceId || '';
  $('#setModel').value = settings.model;
  $('#setBase').value = settings.baseUrl;
  $('#setFormat').value = settings.apiFormat || 'auto';
  $('#setRate').value = settings.rate;
  $('#rateVal').textContent = settings.rate;
  fillVoices();
}
function fillVoices() {
  const vs = speechSynthesis.getVoices();
  const ru = vs.filter(v => /^ru/i.test(v.lang));
  const list = ru.length ? ru : vs;
  $('#setVoice').innerHTML = list.map(v => `<option value="${esc(v.voiceURI)}">${esc(v.name)} (${esc(v.lang)})</option>`).join('')
    || '<option value="">голоса не найдены</option>';
  const cur = Speech.voice();
  if (cur) $('#setVoice').value = cur.voiceURI;
  if (!ru.length && vs.length) $('#setStatus').textContent = 'Русский голос не найден: Настройки Android → Синтез речи → Google → установите русский.';
}
speechSynthesis.onvoiceschanged = () => { if ($('#sheet-settings').classList.contains('show')) fillVoices(); };
$('#setRate').oninput = e => $('#rateVal').textContent = e.target.value;
function readSettingsForm() {
  settings.apiKey = $('#setKey').value.trim();
  settings.workspaceId = $('#setWs').value.trim();
  settings.model = $('#setModel').value.trim() || DEFAULTS.model;
  settings.baseUrl = $('#setBase').value.trim();
  settings.apiFormat = $('#setFormat').value;
  settings.voiceURI = $('#setVoice').value;
  settings.rate = +$('#setRate').value;
}
$('#saveSet').onclick = async () => {
  readSettingsForm();
  await DB.put('kv', settings, 'settings');
  $('#setStatus').textContent = 'Сохранено';
  $('#sheet-settings').classList.remove('show');
  setState('idle');
};
$('#testVoice').onclick = () => { readSettingsForm(); Speech.stop(); Speech.say('Привет! Разберём твои раздачи. Туз-пятёрка одномастные на баттоне — это открытие.'); };
$('#testApi').onclick = async () => {
  readSettingsForm();
  $('#setStatus').textContent = 'Проверяю…';
  try {
    const fmt = await brain.ping();
    settings.apiFormat = fmt;
    $('#setFormat').value = fmt;
    await DB.put('kv', settings, 'settings');
    $('#setStatus').textContent = '✅ Связь есть. Формат: ' + (fmt === 'openai' ? 'OpenAI-совместимый' : 'Anthropic') + '. Настройки сохранены.';
  } catch (e) { $('#setStatus').textContent = '❌ ' + e.message; }
};

// ================================================================ экран не гаснет во время разбора
let lock = null;
async function wakeLock() {
  try { if ('wakeLock' in navigator && !lock) { lock = await navigator.wakeLock.request('screen'); lock.onrelease = () => lock = null; } } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { Speech.stop(); stopListening(); } });

// ================================================================ старт
(async function init() {
  settings = { ...DEFAULTS, ...(await DB.get('kv', 'settings') || {}) };
  $('#autoBtn').classList.toggle('on', !!settings.autoListen);
  await KB.load();
  session = await Session.latest();
  brain = new Brain(settings, session);
  brain.onCardChanged = () => { renderHeader(); if ($('#sheet-card').classList.contains('show')) renderCard(); };
  brain.onLog = t => console.log(t);
  renderChat();
  renderHeader();
  renderTourBar();
  setState('idle');
  if (!SR) sys('Этот браузер не умеет распознавать речь. Откройте в Google Chrome — или печатайте вопросы.');
  if (!settings.apiKey) openSheet('settings');
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
