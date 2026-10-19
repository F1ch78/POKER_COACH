'use strict';
// История действий: узкая колонка справа, новые записи сверху. Огонёк у каждой записи:
// синий — в очереди, жёлтый — выполняется, зелёный — готово, красный — ошибка или прервано.
// Живёт отдельно от render() студии и сама обновляет свой кусок страницы. Хранится в localStorage.

const Activity = (() => {
  const KEY = 'cs-activity', MAX = 300;
  const STATE = { queue: 'в очереди', run: 'выполняется', done: 'готово', err: 'ошибка' };
  let items = [];
  try { items = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) {}
  // Что не успело закончиться до перезагрузки страницы, уже не закончится.
  items.forEach(it => { if (it.state === 'queue' || it.state === 'run') { it.state = 'err'; it.note = 'прервано'; } });

  let open = true;
  try { open = localStorage.getItem(KEY + '-open') !== '0' && window.innerWidth >= 900; } catch (e) {}
  let box = null, timer = null;

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX))); } catch (e) {} };
  const time = t => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  function draw() {
    timer = null;
    if (!box) { box = el('aside', 'activity'); document.body.append(box); }
    document.body.classList.toggle('with-activity', open);
    box.classList.toggle('closed', !open);
    const running = items.filter(it => it.state === 'run').length, queued = items.filter(it => it.state === 'queue').length;
    const toggle = el('button', 'ghost small', open ? '›' : '‹');
    toggle.title = open ? 'Свернуть историю' : 'Показать историю';
    toggle.onclick = () => { open = !open; try { localStorage.setItem(KEY + '-open', open ? '1' : '0'); } catch (e) {} draw(); };
    if (!open) {
      const dot = el('i', 'dot ' + (running ? 'run' : queued ? 'queue' : items[0] ? items[0].state : 'done'));
      box.replaceChildren(toggle, dot);
      return;
    }
    const clear = el('button', 'ghost small', 'очистить');
    clear.title = 'Убрать завершённые записи';
    clear.onclick = () => { items = items.filter(it => it.state === 'run' || it.state === 'queue'); save(); draw(); };
    const head = el('div', 'activity-head');
    head.append(toggle, el('b', '', 'История'), running || queued ? el('span', 'muted small', [running && `идёт ${running}`, queued && `в очереди ${queued}`].filter(Boolean).join(' · ')) : el('span', ''), clear);
    const list = el('div', 'activity-list');
    if (!items.length) list.append(el('div', 'muted small', 'Здесь будут действия студии и ИИ.'));
    for (const it of items.slice(0, MAX)) {
      const row = el('div', 'activity-item ' + it.state);
      row.title = `${STATE[it.state]} · ${time(it.t)}${it.end ? '–' + time(it.end) : ''}`;
      row.append(el('i', 'dot ' + it.state), el('span', 'activity-text', it.label + (it.note ? ' — ' + it.note : '')), el('span', 'activity-time', time(it.end || it.t)));
      list.append(row);
    }
    box.replaceChildren(head, list);
  }
  const redraw = () => { if (!timer) timer = setTimeout(draw, 60); };

  function add(label, state = 'done', note = '') {
    const it = { id: Math.random().toString(36).slice(2, 10), label: String(label), state, note, t: Date.now(), end: state === 'done' || state === 'err' ? Date.now() : 0 };
    items.unshift(it);
    if (items.length > MAX) items.length = MAX;
    save(); redraw();
    return it.id;
  }

  function set(id, state, note) {
    const it = items.find(x => x.id === id);
    if (!it) return;
    it.state = state;
    if (note != null) it.note = String(note);
    if (state === 'run') it.t = Date.now();
    if (state === 'done' || state === 'err') it.end = Date.now();
    save(); redraw();
  }

  // Задача: в очереди → выполняется → готово / ошибка.
  function task(label, state = 'queue') {
    const id = add(label, state);
    return {
      id,
      start: note => set(id, 'run', note),
      done: note => set(id, 'done', note),
      fail: note => set(id, 'err', note),
      get state() { const it = items.find(x => x.id === id); return it ? it.state : ''; },
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', draw); else draw();
  return { add, set, task };
})();
