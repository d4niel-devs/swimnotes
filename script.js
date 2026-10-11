// Shared UI for SwimNotes. Each version supplies generate.js with:
//   APP                      { notes: 'parts' | 'single', pdf: boolean }
//   getSkillLabels(level)    skill names for the dropdowns
//   getLevelDescription(l)   short level summary
//   formatName(raw)          tidy a typed name ("liam chen" -> "Liam Chen")
//   produceComment(values)   resolves to { text, picks? } or rejects with { userMessage }

let selectedLevel = null;
let studentCount = 0;
const lastPicks = {};

const $ = id => document.getElementById(id);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const scrollBehavior = () => (reducedMotion.matches ? 'auto' : 'smooth');
const icon = name => `<svg class="icon" aria-hidden="true" focusable="false"><use href="#ph-${name}"/></svg>`;

/* ---------- announcements, toast, clipboard ---------- */

function announce(message) {
  const region = $('sr-status');
  region.textContent = '';
  requestAnimationFrame(() => { region.textContent = message; });
}

let toastTimer = null;
let toastOnExpire = null;

function hideToast() {
  clearTimeout(toastTimer);
  $('toast').hidden = true;
}

function showToast(message, { actionLabel, onAction, duration = 6000, onExpire } = {}) {
  if (toastOnExpire) { const previous = toastOnExpire; toastOnExpire = null; previous(); }
  const toast = $('toast');
  clearTimeout(toastTimer);
  toast.replaceChildren();

  const text = document.createElement('span');
  text.textContent = message;
  toast.append(text);

  if (actionLabel) {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'toast-action';
    action.textContent = actionLabel;
    action.addEventListener('click', () => {
      toastOnExpire = null;
      hideToast();
      if (onAction) onAction();
    });
    toast.append(action);
  }

  toastOnExpire = onExpire || null;
  toast.hidden = false;
  toastTimer = setTimeout(() => {
    hideToast();
    if (toastOnExpire) { const expire = toastOnExpire; toastOnExpire = null; expire(); }
  }, duration);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    try {
      const helper = document.createElement('textarea');
      helper.value = text;
      helper.setAttribute('readonly', '');
      helper.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(helper);
      helper.select();
      const copied = document.execCommand('copy');
      helper.remove();
      return copied;
    } catch (_) {
      return false;
    }
  }
}

function setButtonFace(button, iconName, label) {
  button.querySelector('use').setAttribute('href', `#ph-${iconName}`);
  button.querySelector('.btn-label').textContent = label;
}

async function copyWithFeedback(button, text, idleIcon, idleLabel) {
  const copied = await copyText(text);
  if (!copied) {
    showToast("Couldn't copy automatically. Select the text and press Ctrl+C (Cmd+C on Mac).", { duration: 8000 });
    return;
  }
  setButtonFace(button, 'check', 'Copied');
  button.classList.add('copied');
  announce('Copied to clipboard.');
  setTimeout(() => {
    setButtonFace(button, idleIcon, idleLabel);
    button.classList.remove('copied');
  }, 2000);
}

/* ---------- level selection ---------- */

document.querySelectorAll('.level-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.level-pill').forEach(p => p.setAttribute('aria-pressed', 'false'));
    pill.setAttribute('aria-pressed', 'true');
    selectedLevel = pill.dataset.level;
    updateLevelInfo();
    $('no-level-msg').classList.remove('visible');
    updateStudentSelects();
    if (!document.querySelector('.student-card')) addStudent(false);
    if (window.matchMedia('(max-width: 1023px)').matches) {
      $('students-heading').scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    }
  });
});

function updateLevelInfo() {
  const bar = $('level-info-bar');
  if (selectedLevel) {
    bar.classList.add('visible');
    $('level-info-title').textContent = selectedLevel;
    $('level-info-desc').textContent = getLevelDescription(selectedLevel);
  } else {
    bar.classList.remove('visible');
  }
}

function updateStudentSelects() {
  const labels = selectedLevel ? getSkillLabels(selectedLevel) : [];
  document.querySelectorAll('.skill-select').forEach(sel => {
    const current = sel.value;
    const placeholder = sel.querySelector('option[disabled]').textContent;
    sel.replaceChildren();
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = placeholder;
    empty.disabled = true;
    empty.selected = true;
    sel.appendChild(empty);
    labels.forEach(skill => {
      const opt = document.createElement('option');
      opt.value = skill;
      opt.textContent = skill;
      if (skill === current) opt.selected = true;
      sel.appendChild(opt);
    });
    if (current) sel.value = current;
  });
}

/* ---------- student cards ---------- */

function noteFields(id) {
  if (APP.notes === 'single') {
    return `
      <div class="field-group">
        <div class="field-head">
          <label class="field-label" for="notes-${id}">Extra notes</label>
          <span class="field-badge badge-optional">Optional</span>
        </div>
        <textarea id="notes-${id}" name="notes" autocomplete="off" placeholder="e.g. Struggles with water in face but very eager to try. Shy at first but opened up by end of session. Has been attending for 3 sessions…" rows="3"></textarea>
        <p class="hint">These details will be woven into the generated comment.</p>
      </div>`;
  }
  return '';
}

function partNote(id, key, fieldName, labelText, placeholder) {
  if (APP.notes !== 'parts') return '';
  return `
          <label class="sr-only" for="${key}-${id}">${labelText}</label>
          <input type="text" class="part-note" id="${key}-${id}" name="${fieldName}" autocomplete="off" placeholder="${placeholder}" />`;
}

function addStudent(scrollToCard = true) {
  if (!selectedLevel) {
    $('no-level-msg').classList.add('visible');
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
    return;
  }

  studentCount++;
  const id = studentCount;
  const card = document.createElement('div');
  card.className = 'student-card';
  card.id = `student-${id}`;

  card.innerHTML = `
    <div class="student-card-header">
      <div>
        <p class="student-number">Student ${id}</p>
        <p class="student-name-display empty" id="name-display-${id}">Enter name below</p>
      </div>
      <button type="button" class="remove-btn" onclick="removeStudent(${id})" title="Remove student" aria-label="Remove student ${id}">${icon('x')}</button>
    </div>
    <div class="student-card-body">

      <div class="field-row single">
        <div class="field-group">
          <div class="field-head"><label class="field-label" for="name-${id}">Student name</label></div>
          <input type="text" id="name-${id}" name="studentName" placeholder="e.g. Daniel" autocomplete="off" spellcheck="false" oninput="updateNameDisplay(${id})" onblur="this.value = formatName(this.value)" />
        </div>
      </div>

      <div class="field-row">
        <div class="field-group">
          <div class="field-head">
            <label class="field-label" for="s1-${id}">Strength 1</label>
            <span class="field-badge badge-strength">Positive</span>
          </div>
          <select class="skill-select" id="s1-${id}" name="strength1" autocomplete="off">
            <option value="" disabled selected>Select a skill strength…</option>
          </select>${partNote(id, 'n1', 'note1', 'Optional note for Strength 1', 'Optional note added to this praise…')}
        </div>
        <div class="field-group">
          <div class="field-head">
            <label class="field-label" for="s2-${id}">Strength 2</label>
            <span class="field-badge badge-strength">Positive</span>
          </div>
          <select class="skill-select" id="s2-${id}" name="strength2" autocomplete="off">
            <option value="" disabled selected>Select a skill strength…</option>
          </select>${partNote(id, 'n2', 'note2', 'Optional note for Strength 2', 'Optional note added to this praise…')}
        </div>
      </div>

      <div class="field-row single">
        <div class="field-group">
          <div class="field-head">
            <label class="field-label" for="w1-${id}">Area for growth</label>
            <span class="field-badge badge-weakness">Constructive</span>
          </div>
          <select class="skill-select" id="w1-${id}" name="growth" autocomplete="off">
            <option value="" disabled selected>Select an area for growth…</option>
          </select>${partNote(id, 'nw', 'noteGrowth', 'Optional note for the area for growth', 'Optional note added to this critique…')}
        </div>
      </div>
      ${noteFields(id)}
      <div class="card-divider"></div>

      <p class="form-error" id="error-${id}" role="alert" hidden></p>

      <button type="button" class="generate-btn" id="gen-btn-${id}" onclick="generateComment(${id})">
        ${icon('sparkle').replace('<svg ', `<svg id="gen-icon-${id}" `)}
        <span id="gen-btn-text-${id}">Generate comment</span>
      </button>

      <div class="result-area" id="result-${id}">
        <div class="result-box" id="result-box-${id}">
          <div class="result-head">
            <span class="result-label">Generated comment</span>
            <button type="button" class="copy-btn" id="copy-btn-${id}" onclick="copyComment(${id})">${icon('copy')}<span class="btn-label">Copy</span></button>
          </div>
          <p class="result-text" id="comment-text-${id}"></p>
        </div>
      </div>

    </div>
  `;

  card.addEventListener('input', () => clearCardError(id));
  card.addEventListener('change', () => clearCardError(id));

  $('students-container').appendChild(card);
  updateStudentSelects();

  if (scrollToCard) {
    card.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
    $(`name-${id}`).focus({ preventScroll: true });
  }

  checkGenerateAll();
}

function removeStudent(id) {
  const card = $(`student-${id}`);
  if (!card) return;
  const container = card.parentElement;
  const next = card.nextElementSibling;
  let restored = false;

  const finish = () => {
    card.remove();
    checkGenerateAll();
    refreshCombinedIfVisible();
    showToast('Student removed.', {
      actionLabel: 'Undo',
      duration: 8000,
      onAction: () => {
        restored = true;
        card.classList.remove('is-leaving');
        container.insertBefore(card, next && next.isConnected ? next : null);
        checkGenerateAll();
        refreshCombinedIfVisible();
        announce('Student restored.');
      },
      onExpire: () => { if (!restored) delete lastPicks[id]; }
    });
  };

  card.classList.add('is-leaving');
  if (reducedMotion.matches) finish();
  else setTimeout(finish, 160);
}

function updateNameDisplay(id) {
  const name = formatName($(`name-${id}`).value);
  const display = $(`name-display-${id}`);
  if (name) {
    display.textContent = name;
    display.classList.remove('empty');
  } else {
    display.textContent = 'Enter name below';
    display.classList.add('empty');
  }
}

function checkGenerateAll() {
  const count = document.querySelectorAll('.student-card').length;
  $('generate-all-wrap').classList.toggle('visible', count >= 2);
  $('students-empty').hidden = count > 0;
}

/* ---------- validation ---------- */

function readCard(id) {
  const value = key => ($(`${key}-${id}`) ? $(`${key}-${id}`).value : '');
  return {
    name: value('name').trim(),
    s1: value('s1'),
    s2: value('s2'),
    w1: value('w1'),
    notes: APP.notes === 'single'
      ? { general: value('notes').trim() }
      : { s1: value('n1'), s2: value('n2'), w1: value('nw') }
  };
}

function findProblem(id, values) {
  const missing = (message, field) => ({ kind: 'input', message, fieldId: `${field}-${id}` });
  if (!values.name) return missing("Add the student's name, then try again.", 'name');
  if (!values.s1) return missing('Choose a skill for Strength 1, then try again.', 's1');
  if (!values.s2) return missing('Choose a skill for Strength 2, then try again.', 's2');
  if (!values.w1) return missing('Choose a skill for the area for growth, then try again.', 'w1');
  if (values.s2 === values.s1) {
    return missing('Strength 1 and Strength 2 are the same skill. Choose two different strengths.', 's2');
  }
  if (values.w1 === values.s1 || values.w1 === values.s2) {
    return missing('The area for growth matches a strength. Choose a different skill for it.', 'w1');
  }
  return null;
}

function clearCardError(id) {
  const error = $(`error-${id}`);
  if (!error || error.hidden) return;
  error.hidden = true;
  error.textContent = '';
  ['name', 's1', 's2', 'w1'].forEach(key => {
    const field = $(`${key}-${id}`);
    if (field) { field.removeAttribute('aria-invalid'); field.removeAttribute('aria-describedby'); }
  });
}

function showCardError(id, problem, focusField) {
  const error = $(`error-${id}`);
  if (!error) return;
  error.innerHTML = `${icon('warning')}<span></span>`;
  error.lastElementChild.textContent = problem.message;
  error.hidden = false;
  const field = problem.fieldId ? $(problem.fieldId) : null;
  if (field) {
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', `error-${id}`);
    if (focusField) field.focus();
  }
}

/* ---------- generating ---------- */

function setBusy(button, busy) {
  button.disabled = busy;
  button.classList.toggle('is-busy', busy);
  if (busy) button.setAttribute('aria-busy', 'true');
  else button.removeAttribute('aria-busy');
}

async function generateComment(id, batchAvoid = new Set(), silent = false) {
  clearCardError(id);
  const values = readCard(id);
  const problem = findProblem(id, values);
  if (problem) {
    if (!silent) showCardError(id, problem, true);
    return { ok: false, problem };
  }

  const button = $(`gen-btn-${id}`);
  const label = $(`gen-btn-text-${id}`);
  const previousLabel = label.textContent;
  label.textContent = 'Generating…';
  setBusy(button, true);

  try {
    const avoid = new Set([...(lastPicks[id] || []), ...batchAvoid]);
    const result = await produceComment({ level: selectedLevel, ...values, avoid });
    lastPicks[id] = new Set(result.picks || []);

    $(`comment-text-${id}`).textContent = result.text;
    const resultArea = $(`result-${id}`);
    resultArea.classList.add('visible');
    label.textContent = 'Regenerate comment';
    $(`gen-icon-${id}`).querySelector('use').setAttribute('href', '#ph-arrow-counter-clockwise');

    if (!silent) {
      refreshCombinedIfVisible();
      announce(`Comment ready for ${formatName(values.name)}.`);
      resultArea.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
    }
    return { ok: true, picks: result.picks || [] };
  } catch (error) {
    label.textContent = previousLabel;
    const failure = {
      kind: 'service',
      message: (error && error.userMessage) || 'Could not write this comment. Check your connection, then try again.'
    };
    showCardError(id, failure, false);
    return { ok: false, problem: failure };
  } finally {
    setBusy(button, false);
  }
}

async function generateAll() {
  const button = $('generate-all-btn');
  const summary = $('generate-all-error');
  summary.hidden = true;
  setBusy(button, true);

  const batchAvoid = new Set();
  const skipped = [];
  for (const card of document.querySelectorAll('.student-card')) {
    const id = parseInt(card.id.replace('student-', ''), 10);
    const outcome = await generateComment(id, batchAvoid, true);
    if (outcome.ok) outcome.picks.forEach(pick => batchAvoid.add(pick));
    else skipped.push({ id, problem: outcome.problem });
  }
  setBusy(button, false);
  renderAllComments();

  if (skipped.length) {
    skipped.forEach(({ id, problem }) => showCardError(id, problem, false));
    const inputIssues = skipped.filter(s => s.problem.kind === 'input').length;
    const count = skipped.length;
    summary.innerHTML = `${icon('warning')}<span></span>`;
    summary.lastElementChild.textContent = inputIssues
      ? `${count} student${count > 1 ? 's were' : ' was'} skipped. Add a name and three different skills for each, then generate again.`
      : `${count} comment${count > 1 ? 's' : ''} could not be written. Check your connection, then generate again.`;
    summary.hidden = false;
    const first = skipped.find(s => s.problem.fieldId);
    if (first) $(first.problem.fieldId).focus();
    return;
  }

  if ($('all-comments-wrap').classList.contains('visible')) {
    announce(`${getAllCommentEntries().length} comments ready.`);
    $('all-comments-wrap').scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  }
}

/* ---------- combined comments ---------- */

function getAllCommentEntries() {
  const entries = [];
  document.querySelectorAll('.student-card').forEach(card => {
    const id = parseInt(card.id.replace('student-', ''), 10);
    const commentEl = $(`comment-text-${id}`);
    const comment = commentEl ? commentEl.textContent.trim() : '';
    if (!comment) return;
    entries.push({ name: formatName($(`name-${id}`).value) || `Student ${id}`, comment });
  });
  return entries;
}

function renderAllComments() {
  const entries = getAllCommentEntries();
  const box = $('all-comments-box');
  box.replaceChildren();

  entries.forEach(({ name, comment }) => {
    const entry = document.createElement('article');
    entry.className = 'all-comment-entry';

    const nameEl = document.createElement('h3');
    nameEl.className = 'all-comment-name';
    nameEl.textContent = `${name}:`;

    const textEl = document.createElement('p');
    textEl.className = 'all-comment-text';
    textEl.textContent = comment;

    entry.append(nameEl, textEl);
    box.appendChild(entry);
  });

  $('all-comments-wrap').classList.toggle('visible', entries.length > 0);
}

function refreshCombinedIfVisible() {
  if ($('all-comments-wrap').classList.contains('visible')) renderAllComments();
}

function copyAllComments() {
  const entries = getAllCommentEntries();
  if (!entries.length) return;
  const text = entries.map(({ name, comment }) => `${name}:\n${comment}`).join('\n\n');
  copyWithFeedback($('copy-all-btn'), text, 'copy', 'Copy all');
}

function copyComment(id) {
  const text = $(`comment-text-${id}`).textContent;
  if (!text) return;
  copyWithFeedback($(`copy-btn-${id}`), text, 'copy', 'Copy');
}

function downloadAllCommentsPdf() {
  const entries = getAllCommentEntries();
  if (!entries.length) return;
  const safeLevel = (selectedLevel || 'Swim').replace(/[^\w &-]/g, '').trim();
  downloadReportCardsPdf(entries.map(entry => entry.comment), `${safeLevel} Report Cards.pdf`);
  announce('PDF downloaded.');
}

/* ---------- guard against losing work ---------- */

function hasUnsavedWork() {
  return [...document.querySelectorAll('.student-card')].some(card =>
    [...card.querySelectorAll('input, select, textarea')].some(field => field.value) ||
    card.querySelector('.result-area.visible'));
}

window.addEventListener('beforeunload', event => {
  if (hasUnsavedWork()) {
    event.preventDefault();
    event.returnValue = '';
  }
});

checkGenerateAll();
