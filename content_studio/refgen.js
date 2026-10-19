'use strict';
// Генерация референсов прямо в студии: лист героя и плейт локации рисуются сервисом картинок из ⚙
// и сразу становятся референсом карточки. Его студия потом прикладывает к каждому шоту с героем или местом.
// Пользуется помощниками студии (AI, setAsset, refData, Activity…), подключается до studio.js.

const refRunning = new Set();   // id героев и локаций, которые сейчас рисуются

function styleLine() {
  const s = S.p.style || {};
  return [s.look, s.style].filter(Boolean).join(' ');
}

// Промпт листа героя: готовый промпт из каст-библии, иначе собираем из тег-сета и стиля проекта.
function characterSheetPrompt(c, pr) {
  if (pr && pr.text) return pr.text;
  const sheet = (c.prompts || []).find(x => /лист|sheet/i.test(x.label));
  if (sheet) return sheet.text;
  if (!c.tags) return '';
  return `Character reference sheet of one character: ${c.tags.trim().replace(/\.$/, '')}. Several views of the same character on one canvas: front view, three-quarter view, side view, full body and a close-up of the face, neutral expression, plain even neutral background, identical proportions and costume in every view. ${styleLine()}`.trim();
}

function locationPlatePrompt(l) {
  if (l.plate) return l.plate;
  if (!l.set) return '';
  return `Empty location plate without people: ${l.set.trim().replace(/\.$/, '')}. One wide establishing view of the place, its geometry and light source clearly readable. ${styleLine()}`.trim();
}

async function drawRef(holder, prompt, refs, aspect, job) {
  refRunning.add(holder.id); render();
  job.start();
  try {
    const payload = [];
    for (const id of refs) { const d = await refData(id); if (d) payload.push(d); }
    const full = (payload.length ? 'Reference image is attached: keep the same character, face, proportions and costume.\n\n' : '') + prompt;
    const { blob } = await AI.generateImage({ prompt: full, refs: payload, aspect });
    const ext = ((blob.type || 'image/png').split('/')[1] || 'png').replace('jpeg', 'jpg');
    await setAsset(holder, 'ref', new File([blob], `ref_${holder.name}.${ext}`, { type: blob.type || 'image/png' }));
    job.done('референс готов');
  } catch (e) {
    job.fail(e.message);
    throw e;
  } finally {
    refRunning.delete(holder.id); render();
  }
}

async function genCharacterRef(c, pr, job) {
  const prompt = characterSheetPrompt(c, pr);
  if (!prompt) return toast(`${c.name}: нет ни промпта листа, ни тег-сета — сначала заполните тег-сет`);
  const base = c.variantOf && S.p.characters.find(x => x.id === c.variantOf);
  job = job || Activity.task(`🎨 Герой «${c.name}»${pr ? ': ' + pr.label : ''}`, 'queue');
  try { await drawRef(c, prompt, base && base.ref ? [base.ref] : [], '16:9', job); }
  catch (e) { toast(`${c.name}: ${e.message}`, true); }
}

async function genLocationRef(l, job) {
  const prompt = locationPlatePrompt(l);
  if (!prompt) return toast(`${l.name}: нет ни промпта плейта, ни SET — сначала заполните SET`);
  job = job || Activity.task(`🎨 Локация «${l.name}»`, 'queue');
  try { await drawRef(l, prompt, [], aspectFor(), job); }
  catch (e) { toast(`${l.name}: ${e.message}`, true); }
}

// Все герои и локации без референса — в очередь, рисуются по одному. Сначала основные герои, потом варианты (им нужен лист основного).
async function genMissingRefs() {
  const p = S.p;
  const chars = p.characters.filter(c => !c.ref && characterSheetPrompt(c)).sort((a, b) => (a.variantOf ? 1 : 0) - (b.variantOf ? 1 : 0));
  const locs = p.locations.filter(l => !l.ref && locationPlatePrompt(l));
  if (!chars.length && !locs.length) return toast('Рисовать нечего: у всех героев и локаций есть референсы (или нет ни промптов, ни тег-сетов)');
  const queue = chars.map(c => [c, Activity.task(`🎨 Герой «${c.name}»`, 'queue')]).concat(locs.map(l => [l, Activity.task(`🎨 Локация «${l.name}»`, 'queue')]));
  let stop = false;
  for (const [x, job] of queue) {
    if (stop) { job.fail('не выполнено'); continue; }
    try {
      if (p.characters.includes(x)) await drawRef(x, characterSheetPrompt(x), (() => { const b = x.variantOf && p.characters.find(o => o.id === x.variantOf); return b && b.ref ? [b.ref] : []; })(), '16:9', job);
      else await drawRef(x, locationPlatePrompt(x), [], aspectFor(), job);
    } catch (e) {
      toast(`${x.name}: ${e.message}`, true);
      if ([401, 402, 403].includes(e.status) || e.network || /ключ|адрес|модель|не рисует/i.test(e.message)) stop = true;
    }
  }
  toast('Референсы: готово');
}

const refBtnLabel = (holder, label) => refRunning.has(holder.id) ? '⏳ рисует…' : label;
