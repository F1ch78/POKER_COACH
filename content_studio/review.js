'use strict';
// Проверка результатов: у готового материала каждой стадии (картинка, видео, звук шота или сцены, саунд-дизайн сцены)
// есть оценка и заметка. Цвета: серый — пусто, синий — ждёт проверки, зелёный — готово, жёлтый — доработать, красный — переделать.
// Пользуется общими помощниками студии (h, btn, touch…), поэтому подключается до studio.js.

const REVIEW = {
  ok: { icon: '✓', label: 'Готово' },
  fix: { icon: '✎', label: 'Доработать' },
  redo: { icon: '✕', label: 'Переделать' },
};
const STATE_LABEL = { empty: 'нет результата', wait: 'ждёт проверки', ok: 'готово', fix: 'доработать', redo: 'переделать' };
const STAGE_LABEL = { image: 'Картинка', video: 'Видео', audio: 'Звук', sound: 'Саунд-дизайн' };
const STATE_RANK = { redo: 4, fix: 3, wait: 2, ok: 1, empty: 0 };

// holder — шот или сцена; stage — image | video | audio | sound (только у сцены).
function hasResult(holder, stage) {
  if (stage === 'sound') return !!((holder.ambience && holder.ambience.asset) || (holder.shots || []).some(sh => (sh.sfx || []).some(fx => fx.asset)));
  return !!(holder.assets && holder.assets[stage] && S.p.assets[holder.assets[stage]]);
}
const reviewOf = (holder, stage) => (holder.review || {})[stage] || null;
function reviewState(holder, stage) {
  if (!hasResult(holder, stage)) return 'empty';
  const r = reviewOf(holder, stage);
  return (r && r.s) || 'wait';
}
const reviewNote = (holder, stage) => (reviewOf(holder, stage) || {}).note || '';

function setReview(holder, stage, patch) {
  holder.review = holder.review || {};
  const r = Object.assign(holder.review[stage] || { s: '', note: '' }, patch, { at: Date.now() });
  if (!r.s && !r.note) delete holder.review[stage]; else holder.review[stage] = r;
  touch();
}

// Новый файл — новая проверка: оценка сбрасывается, заметка остаётся (видно, что просили поправить).
function reviewReset(holder, stage) {
  const r = reviewOf(holder, stage);
  if (r && r.s) { r.was = r.s; r.s = ''; }
}

// Стадии шота, которые имеют смысл: у чёрного кадра и титра нет картинки и видео.
const shotStages = sh => (Prompts.noPicture(sh) ? [] : ['image', 'video']).concat('audio');
// Главная картинка шота — видео, если оно есть, иначе кадр.
const visualStage = sh => sh.assets.video ? 'video' : 'image';

// Итог по шоту: изображение решает, есть ли материал; звук может только ухудшить оценку.
function shotState(sh) {
  if (Prompts.noPicture(sh)) return hasResult(sh, 'audio') ? reviewState(sh, 'audio') : 'none';
  const vis = reviewState(sh, visualStage(sh));
  if (vis === 'empty') return 'empty';
  const states = [vis].concat(hasResult(sh, 'audio') ? [reviewState(sh, 'audio')] : []);
  return states.sort((a, b) => STATE_RANK[b] - STATE_RANK[a])[0];
}

const hasNotes = holder => Object.values(holder.review || {}).some(r => r.note);
const reviewCount = (shots, s) => shots.filter(sh => shotStages(sh).some(st => reviewState(sh, st) === s)).length;

// Цветная метка стадии; по щелчку раскрывает оценку и заметку.
function reviewDot(holder, stage, onclick, on) {
  const st = reviewState(holder, stage), note = reviewNote(holder, stage);
  return h('button', { class: 'rv rv-' + st + (on ? ' sel' : ''), onclick,
    title: `${STAGE_LABEL[stage]}: ${STATE_LABEL[st]}` + (note ? '\n' + note : '') },
    (REVIEW[st] ? REVIEW[st].icon + ' ' : '') + STAGE_LABEL[stage], note ? h('span', { class: 'rv-note-mark' }, ' 📝') : null);
}

// Оценка и заметка под результатом.
function reviewBar(holder, stage, opts = {}) {
  const r = reviewOf(holder, stage) || {}, st = reviewState(holder, stage);
  const rerender = opts.rerender || render;
  const pick = s => () => { setReview(holder, stage, { s: r.s === s ? '' : s }); rerender(); };
  return h('div', { class: 'review rv-box-' + st },
    h('div', { class: 'row wrap' },
      opts.title ? h('b', { class: 'small' }, opts.title) : null,
      hasResult(holder, stage) ? Object.entries(REVIEW).map(([k, v]) =>
        h('button', { class: 'rv-btn rv-' + k + (r.s === k ? ' on' : ''), onclick: pick(k) }, v.icon + ' ' + v.label))
        : h('span', { class: 'muted small' }, 'Результата пока нет — оценить нечего, но заметку оставить можно'),
      r.was && !r.s ? h('span', { class: 'muted small', title: 'Файл заменили после оценки' }, `было: ${STATE_LABEL[r.was]} → проверьте новый вариант`) : null),
    h('textarea', { class: 'rv-note', rows: opts.rows || (r.note ? 2 : 1), placeholder: 'Заметка: что получилось, что поправить…', value: r.note || '',
      onchange: e => { setReview(holder, stage, { note: e.target.value.trim() }); rerender(); } }));
}

// Список правок для команды: всё, что надо доработать или переделать, и все заметки.
function reviewReport() {
  const out = [`# Правки: ${S.p.name}`, ''];
  let n = 0;
  for (const sc of S.p.scenes) {
    const rows = [];
    const add = (code, holder, stage) => {
      const st = reviewState(holder, stage), note = reviewNote(holder, stage);
      if (!note && st !== 'fix' && st !== 'redo') return;
      rows.push(`- **${code} · ${STAGE_LABEL[stage]}** — ${STATE_LABEL[st]}${note ? ': ' + note.replace(/\n+/g, ' ') : ''}`);
      n++;
    };
    add('Сцена', sc, 'audio'); add('Сцена', sc, 'sound');
    sc.shots.forEach(sh => shotStages(sh).forEach(stage => add(Prompts.code(sc, sh), sh, stage)));
    if (rows.length) out.push(`## Сцена ${sc.num}. ${sc.heading}`, '', ...rows, '');
  }
  if (!n) out.push('Правок нет.');
  return out.join('\n');
}
