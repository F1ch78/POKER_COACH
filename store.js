// Хранилище на телефоне (IndexedDB): настройки, сессии, база знаний.
const DB = (() => {
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('poker-coach', 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        db.createObjectStore('kv');
        db.createObjectStore('sessions', { keyPath: 'id' });
        db.createObjectStore('kb', { keyPath: 'name' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const req = fn(s);
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
    });
  }
  return {
    get: (store, key) => tx(store, 'readonly', s => s.get(key)),
    put: (store, val, key) => tx(store, 'readwrite', s => key === undefined ? s.put(val) : s.put(val, key)),
    del: (store, key) => tx(store, 'readwrite', s => s.delete(key)),
    all: (store) => tx(store, 'readonly', s => s.getAll()),
  };
})();

// ---------------------------------------------------------------- сессия разбора
class Session {
  constructor(data) {
    const now = new Date();
    this.data = Object.assign({
      id: now.toISOString().replace(/[:.]/g, '-'),
      created: now.toISOString(),
      updated: now.toISOString(),
      title: '',
      tournament: {},
      hands: [],
      current_hand: null,
      summary: '',
      history: [],
      tour: null,      // состояние стола сценария «Турнир»
      tourHist: [],    // история для «отмены»
    }, data || {});
  }
  async save() {
    this.data.updated = new Date().toISOString();
    await DB.put('sessions', JSON.parse(JSON.stringify(this.data)));
  }
  static async list() {
    const all = await DB.all('sessions');
    return all.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  }
  static async latest() {
    const l = await Session.list();
    return l.length ? new Session(l[0]) : new Session();
  }

  updateTournament(f) {
    for (const [k, v] of Object.entries(f)) {
      if (k === 'title') continue;
      if (v !== null && v !== undefined && v !== '') this.data.tournament[k] = v;
    }
    if (f.title) this.data.title = f.title;
    this.save();
    return { ok: true, tournament: this.data.tournament };
  }
  upsertHand(f) {
    const hands = this.data.hands;
    let hand = f.hand_id ? hands.find(h => h.id === f.hand_id) : null;
    if (!hand) {
      const id = hands.length ? Math.max(...hands.map(h => h.id)) + 1 : 1;
      hand = { id };
      if (this.data.tournament.blinds) hand.blinds = this.data.tournament.blinds;
      hands.push(hand);
    }
    for (const [k, v] of Object.entries(f)) {
      if (k === 'hand_id' || k === 'make_current') continue;
      if (v !== null && v !== undefined && v !== '') hand[k] = v;
    }
    if (f.make_current !== false) this.data.current_hand = hand.id;
    this.save();
    return { ok: true, hand, current_hand: this.data.current_hand };
  }
  setCurrentHand(id) {
    if (!this.data.hands.some(h => h.id === id)) return { ok: false, error: `Раздачи №${id} нет` };
    this.data.current_hand = id;
    this.save();
    return { ok: true, current_hand: id };
  }
  currentHand() {
    return this.data.hands.find(h => h.id === this.data.current_hand) || null;
  }
  addTurn(role, content) {
    this.data.history.push({ role, content });
    this.save();
  }
  cardText() {
    const d = this.data;
    const lines = ['ТУРНИР: ' + (Object.keys(d.tournament).length ? JSON.stringify(d.tournament) : 'пока не описан')];
    if (d.hands.length) {
      lines.push('РАЗДАЧИ:');
      for (const h of d.hands) {
        const { id, ...rest } = h;
        lines.push(`  №${id}: ${JSON.stringify(rest)}${id === d.current_hand ? '  <== ТЕКУЩАЯ' : ''}`);
      }
    } else lines.push('РАЗДАЧИ: пока нет');
    if (d.summary) lines.push('ВЫЖИМКА РАННЕЙ ЧАСТИ РАЗГОВОРА: ' + d.summary);
    return lines.join('\n');
  }
}
