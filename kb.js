// Локальная база знаний на телефоне: файлы .txt/.md/.pdf -> фрагменты -> поиск по ключевым словам (BM25).
const STARTER_DOC = `# Spin&Go — базовые принципы (стартовый конспект, дополняйте своим)

## Формат
Spin&Go — турнир на трёх игроков с короткими стеками (обычно 25 BB на старте, иногда 500 фишек при блайндах 10/20). Уровни блайндов короткие, поэтому большая часть игры проходит на стеках 10–20 BB. Чаще всего приз забирает только победитель, поэтому ICM почти не влияет, и решения можно оценивать через чип-EV.

## Игра на короткий стек
При стеке до 10–12 BB основное действие — пуш или фолд. Лимп и мин-рейз с последующим фолдом на пуш теряют фишки. Чем короче стек, тем шире диапазон пуша: блайнды и анте составляют большую долю стека, и фолд-эквити становится ценнее.

При 12–20 BB используется мин-рейз или рейз в 2–2,5 BB с сильными руками и частью средних, а также пуш с руками, которые плохо играют постфлоп, но имеют хорошее эквити против диапазона колла (малые пары, тузы с маленьким кикером).

## Позиции втроём
Баттон ходит первым префлоп и последним постфлоп. Малый блайнд против большого блайнда — это игра один на один: диапазоны здесь самые широкие. Большой блайнд защищается широко из-за хороших шансов банка.

## Пот-оддсы
Нужное эквити для колла = ставка для колла / (банк после нашего колла). Пример: в банке 100, нам нужно доставить 50 — нужно 50 / 150 = 33% эквити.

## Типичные ошибки на низких лимитах
Слишком узкий пуш с 8–10 BB с малого блайнда. Слишком частый колл пушей с руками вроде K-x, Q-x разномастных. Отказ от контбета на сухих бордах в хедз-апе. Лимп с баттона без плана.

## Против слабых оппонентов
Против пассивных игроков, которые часто коллируют, больше ставок на вэлью и меньше блефов. Против тайтовых игроков, которые часто фолдят, — шире пуш и больше краж блайндов.`;

// Справочники, которые приезжают вместе с приложением (добавляются в «Базу» автоматически)
const BUNDLED_DOCS = [
  { file: 'spin_gold.md', name: 'Spin & Gold (PokerOK) — правила и выплаты', version: '1' },
  { file: 'turniry.md', name: 'Покерные турниры — справочник', version: '1' },
];

const KB = {
  chunks: [], // {src, text, tf: Map, len}
  idf: new Map(),
  avg: 1,

  tokens(s) {
    return (s.toLowerCase().match(/[a-zа-яё0-9]+/g) || []).filter(w => w.length > 1).map(w => w.slice(0, 6));
  },

  chunk(text, size = 700, overlap = 150) {
    text = text.replace(/[ \t]+/g, ' ').replace(/\n(#+ )/g, '\n\n$1');
    const paras = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    const out = [];
    let cur = '';
    for (let p of paras) {
      if (cur.length + p.length < size && !p.startsWith('#')) cur = (cur + '\n' + p).trim();
      else {
        if (cur) out.push(cur);
        while (p.length > size) { out.push(p.slice(0, size)); p = p.slice(size - overlap); }
        cur = p;
      }
    }
    if (cur) out.push(cur);
    return out;
  },

  async load() {
    let docs = await DB.all('kb');
    if (!docs.length && !(await DB.get('kv', 'kb_initialized'))) {
      await DB.put('kb', { name: 'spin_go_основы.md', chunks: this.chunk(STARTER_DOC), added: new Date().toISOString() });
      await DB.put('kv', true, 'kb_initialized');
      docs = await DB.all('kb');
    }
    // встроенные справочники: один раз на версию (если пользователь удалил — не возвращаем)
    for (const b of BUNDLED_DOCS) {
      const key = 'bundled:' + b.file;
      if ((await DB.get('kv', key)) === b.version) continue;
      try {
        const r = await fetch(b.file, { cache: 'no-cache' });
        if (!r.ok) continue;
        await DB.put('kb', { name: b.name, chunks: this.chunk(await r.text()), added: new Date().toISOString() });
        await DB.put('kv', b.version, key);
      } catch (e) { /* нет сети — попробуем в следующий раз */ }
    }
    docs = await DB.all('kb');
    this.chunks = [];
    for (const d of docs) for (const t of d.chunks) this.chunks.push({ src: d.name, text: t });
    this.index();
    return docs;
  },

  index() {
    const df = new Map();
    let total = 0;
    for (const c of this.chunks) {
      const toks = this.tokens(c.text);
      c.len = toks.length;
      total += toks.length;
      c.tf = new Map();
      for (const w of toks) c.tf.set(w, (c.tf.get(w) || 0) + 1);
      for (const w of c.tf.keys()) df.set(w, (df.get(w) || 0) + 1);
    }
    const n = Math.max(this.chunks.length, 1);
    this.avg = total / n || 1;
    this.idf = new Map();
    for (const [w, c] of df) this.idf.set(w, Math.log(1 + (n - c + 0.5) / (c + 0.5)));
  },

  search(q, k = 3) {
    const qt = this.tokens(q);
    const scored = this.chunks.map(c => {
      let s = 0;
      for (const w of qt) {
        const f = c.tf.get(w);
        if (f) s += (this.idf.get(w) || 0) * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * c.len / this.avg));
      }
      return [s, c];
    }).filter(x => x[0] > 0.5).sort((a, b) => b[0] - a[0]).slice(0, k);
    return scored.map(([s, c]) => ({ src: c.src, text: c.text, score: s }));
  },

  async readFile(file) {
    const name = file.name;
    if (/\.pdf$/i.test(name)) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      const pages = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const tc = await (await pdf.getPage(i)).getTextContent();
        pages.push(tc.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join(''));
      }
      return pages.join('\n\n');
    }
    const buf = await file.arrayBuffer();
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder('windows-1251').decode(buf); }
  },

  async addFiles(files, onProgress) {
    for (const f of files) {
      onProgress && onProgress(`Читаю ${f.name}…`);
      const text = await this.readFile(f);
      const chunks = this.chunk(text);
      await DB.put('kb', { name: f.name, chunks, added: new Date().toISOString() });
    }
    return this.load();
  },

  async remove(name) {
    await DB.del('kb', name);
    return this.load();
  },
};

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Не загрузился ' + src));
    document.head.appendChild(s);
  });
}
