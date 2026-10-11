// Shared UI for SwimNotes. Each version supplies generate.js with:
//   APP                      { notes: 'parts' | 'single', pdf: boolean }
//   getSkillLabels(level)    skill names for the dropdowns
//   getLevelDescription(l)   short level summary
//   formatName(raw)          tidy a typed name ("liam chen" -> "Liam Chen")
//   produceComment(values)   resolves to { text, picks? } or rejects with { userMessage }
//
// A "class" is one level plus its students. Several classes can be open at once;
// the level buttons always apply to the selected class, and "Generate all comments"
// writes every student in every class.

let classCount = 0;
let studentCount = 0;
let activeClassId = null;
const classes = [];
const lastPicks = {};

const $ = id => document.getElementById(id);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const scrollBehavior = () => (reducedMotion.matches ? 'auto' : 'smooth');
const icon = name => `<svg class="icon" aria-hidden="true" focusable="false"><use href="#ph-${name}"/></svg>`;

/* ---------- classes ---------- */

const classById = id => classes.find(cls => cls.id === id);
const activeClass = () => classById(activeClassId);
const cardId = card => parseInt(card.id.replace('student-', ''), 10);
const allCards = () => [...document.querySelectorAll('.student-card')];
const cardsOf = classId => allCards().filter(card => Number(card.dataset.classId) === classId);
const classOfCard = id => classById(Number($(`student-${id}`).dataset.classId));

function classLabel(cls) {
  const baseOf = c => (c.name || '').trim() || c.level || 'New class';
  const base = baseOf(cls);
  const same = classes.filter(c => baseOf(c) === base);
  return same.length > 1 ? `${base} (${same.indexOf(cls) + 1})` : base;
}

function addClass(activate = true) {
  classCount++;
  const cls = { id: classCount, level: null, name: '', studentNumber: 0 };
  classes.push(cls);
  if (activate) {
    activateClass(cls.id);
    if (classes.length > 1) {
      announce('New class added. Choose its level.');
      if (window.matchMedia('(max-width: 1023px)').matches) {
        $('level-heading').scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      }
    }
  }
  return cls;
}

function activateClass(id) {
  activeClassId = id;
  allCards().forEach(card => { card.hidden = Number(card.dataset.classId) !== id; });
  syncLevelUi();
  checkGenerateAll();
}

function updateClassName(value) {
  const cls = activeClass();
  if (!cls) return;
  cls.name = value;
  renderClassBar();
  refreshCombinedIfVisible();
}

function renderClassBar() {
  const multi = classes.length > 1;
  $('class-bar').hidden = !multi;
  $('rail-hint').hidden = !multi;

  const tabs = $('class-tabs');
  tabs.replaceChildren();
  if (multi) {
    classes.forEach(cls => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'class-tab';
      if (cls.id === activeClassId) tab.setAttribute('aria-current', 'true');

      const label = document.createElement('span');
      label.textContent = classLabel(cls);
      const count = document.createElement('span');
      count.className = 'class-tab-count';
      const students = cardsOf(cls.id).length;
      count.textContent = students;
      count.setAttribute('aria-label', `${students} student${students === 1 ? '' : 's'}`);

      tab.append(label, count);
      tab.addEventListener('click', () => activateClass(cls.id));
      tabs.appendChild(tab);
    });
  }

  const nameInput = $('class-name');
  const active = activeClass();
  nameInput.placeholder = active && active.level ? `e.g. Tuesday 5 pm (default: ${active.level})` : 'e.g. Tuesday 5 pm (optional)';
  if (document.activeElement !== nameInput) nameInput.value = active ? active.name : '';
}

function removeActiveClass() {
  const cls = activeClass();
  if (!cls || classes.length < 2) return;
  const label = classLabel(cls);
  const index = classes.indexOf(cls);
  const cards = cardsOf(cls.id).map(card => ({ card, next: card.nextElementSibling }));
  cards.forEach(({ card }) => card.remove());
  classes.splice(index, 1);
  activateClass((classes[index] || classes[index - 1]).id);
  refreshCombinedIfVisible();

  let restored = false;
  showToast(`${label} removed.`, {
    actionLabel: 'Undo',
    duration: 8000,
    onAction: () => {
      restored = true;
      classes.splice(index, 0, cls);
      const container = $('students-container');
      cards.forEach(({ card }) => container.appendChild(card));
      activateClass(cls.id);
      refreshCombinedIfVisible();
      announce(`${label} restored.`);
    },
    onExpire: () => {
      if (!restored) cards.forEach(({ card }) => delete lastPicks[cardId(card)]);
    }
  });
}

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
    if (!button.isConnected) return;
    setButtonFace(button, idleIcon, idleLabel);
    button.classList.remove('copied');
  }, 2000);
}

/* ---------- level selection ---------- */

document.querySelectorAll('.level-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    const cls = activeClass();
    cls.level = pill.dataset.level;
    $('no-level-msg').classList.remove('visible');
    syncLevelUi();
    updateStudentSelects(cls.id);
    renderClassBar();
    if (!cardsOf(cls.id).length) addStudent(false);
    refreshCombinedIfVisible();
    if (window.matchMedia('(max-width: 1023px)').matches) {
      $('students-heading').scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    }
  });
});

function syncLevelUi() {
  const cls = activeClass();
  const level = cls ? cls.level : null;
  document.querySelectorAll('.level-pill').forEach(pill => {
    pill.setAttribute('aria-pressed', String(pill.dataset.level === level));
  });
  const bar = $('level-info-bar');
  if (level) {
    bar.classList.add('visible');
    $('level-info-title').textContent = level;
    $('level-info-desc').textContent = getLevelDescription(level);
  } else {
    bar.classList.remove('visible');
  }
  renderClassBar();
}

function updateStudentSelects(classId) {
  const cards = classId === undefined ? allCards() : cardsOf(classId);
  cards.forEach(card => {
    const level = classById(Number(card.dataset.classId)).level;
    const labels = level ? getSkillLabels(level) : [];
    card.querySelectorAll('.skill-select').forEach(sel => {
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
  const cls = activeClass();
  if (!cls || !cls.level) {
    $('no-level-msg').classList.add('visible');
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
    return;
  }

  studentCount++;
  cls.studentNumber++;
  const id = studentCount;
  const card = document.createElement('div');
  card.className = 'student-card is-new';
  card.id = `student-${id}`;
  card.dataset.classId = cls.id;

  card.innerHTML = `
    <div class="student-card-header">
      <div>
        <p class="student-number">Student ${cls.studentNumber}</p>
        <p class="student-name-display empty" id="name-display-${id}">Enter name below</p>
      </div>
      <button type="button" class="remove-btn" onclick="removeStudent(${id})" title="Remove student" aria-label="Remove student ${cls.studentNumber}">${icon('x')}</button>
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
  card.addEventListener('animationend', () => card.classList.remove('is-new'), { once: true });

  $('students-container').appendChild(card);
  updateStudentSelects(cls.id);

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
  $('generate-all-wrap').classList.toggle('visible', allCards().length >= 2);
  const cls = activeClass();
  $('students-empty').hidden = !!cls && cardsOf(cls.id).length > 0;
  renderClassBar();
}

/* ---------- validation ---------- */

function readCard(id) {
  const value = key => ($(`${key}-${id}`) ? $(`${key}-${id}`).value : '');
  return {
    name: formatName(value('name')),
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
    if (focusField) {
      const owner = classOfCard(id);
      if (owner && owner.id !== activeClassId) activateClass(owner.id);
      field.focus();
    }
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
    const result = await produceComment({ level: classOfCard(id).level, ...values, avoid });
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
  for (const card of allCards()) {
    const id = cardId(card);
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
    if (first) {
      const owner = classOfCard(first.id);
      if (owner && owner.id !== activeClassId) activateClass(owner.id);
      $(first.problem.fieldId).focus();
    }
    return;
  }

  if ($('all-comments-wrap').classList.contains('visible')) {
    const total = getCommentGroups().reduce((sum, group) => sum + group.entries.length, 0);
    announce(`${total} comment${total === 1 ? '' : 's'} ready.`);
    $('all-comments-wrap').scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  }
}

/* ---------- combined comments (grouped by class) ---------- */

function getCommentGroups() {
  return classes.map(cls => ({
    id: cls.id,
    label: classLabel(cls),
    entries: cardsOf(cls.id).map(card => {
      const id = cardId(card);
      const comment = $(`comment-text-${id}`).textContent.trim();
      if (!comment) return null;
      return { name: formatName($(`name-${id}`).value) || `Student ${id}`, comment };
    }).filter(Boolean)
  })).filter(group => group.entries.length);
}

const entriesAsText = entries => entries.map(({ name, comment }) => `${name}:\n${comment}`).join('\n\n');
const safeFileName = text => (text || '').replace(/[^\w &().-]/g, '').trim() || 'Report Cards';

function groupButton(iconName, label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copy-all-btn';
  button.innerHTML = `${icon(iconName)}<span class="btn-label">${label}</span>`;
  button.addEventListener('click', onClick);
  return button;
}

function renderAllComments() {
  const groups = getCommentGroups();
  const multi = groups.length > 1;
  const box = $('all-comments-box');
  box.replaceChildren();

  groups.forEach(group => {
    const section = document.createElement('section');
    section.className = 'comment-group';

    if (multi) {
      const head = document.createElement('div');
      head.className = 'comment-group-head';
      const title = document.createElement('h3');
      title.className = 'comment-group-title';
      title.textContent = group.label;
      const actions = document.createElement('div');
      actions.className = 'group-actions';
      const copy = groupButton('copy', 'Copy', () => copyWithFeedback(copy, entriesAsText(group.entries), 'copy', 'Copy'));
      actions.append(copy);
      if (APP.pdf) actions.append(groupButton('download-simple', 'PDF', () => downloadGroupPdf(group.id)));
      head.append(title, actions);
      section.appendChild(head);
    }

    group.entries.forEach(({ name, comment }) => {
      const entry = document.createElement('article');
      entry.className = 'all-comment-entry';

      const nameEl = document.createElement(multi ? 'h4' : 'h3');
      nameEl.className = 'all-comment-name';
      nameEl.textContent = `${name}:`;

      const textEl = document.createElement('p');
      textEl.className = 'all-comment-text';
      textEl.textContent = comment;

      entry.append(nameEl, textEl);
      section.appendChild(entry);
    });

    box.appendChild(section);
  });

  $('all-comments-wrap').classList.toggle('visible', groups.length > 0);
}

function refreshCombinedIfVisible() {
  if ($('all-comments-wrap').classList.contains('visible')) renderAllComments();
}

function copyAllComments() {
  const groups = getCommentGroups();
  if (!groups.length) return;
  const text = groups.length > 1
    ? groups.map(group => `${group.label}\n\n${entriesAsText(group.entries)}`).join('\n\n\n')
    : entriesAsText(groups[0].entries);
  copyWithFeedback($('copy-all-btn'), text, 'copy', 'Copy all');
}

function copyComment(id) {
  const text = $(`comment-text-${id}`).textContent;
  if (!text) return;
  copyWithFeedback($(`copy-btn-${id}`), text, 'copy', 'Copy');
}

function downloadAllCommentsPdf() {
  const groups = getCommentGroups();
  if (!groups.length) return;
  if (groups.length === 1) {
    downloadReportCardsPdf(groups[0].entries.map(e => e.comment), `${safeFileName(groups[0].label)} Report Cards.pdf`);
  } else {
    downloadReportCardsPdf(
      groups.map(group => ({ label: group.label, comments: group.entries.map(e => e.comment) })),
      'All Classes Report Cards.pdf'
    );
  }
  announce('PDF downloaded.');
}

function downloadGroupPdf(classId) {
  const group = getCommentGroups().find(g => g.id === classId);
  if (!group) return;
  downloadReportCardsPdf(group.entries.map(e => e.comment), `${safeFileName(group.label)} Report Cards.pdf`);
  announce('PDF downloaded.');
}

/* ---------- guard against losing work ---------- */

function hasUnsavedWork() {
  return $('class-name').value ||
    allCards().some(card =>
      [...card.querySelectorAll('input, select, textarea')].some(field => field.value) ||
      card.querySelector('.result-area.visible'));
}

window.addEventListener('beforeunload', event => {
  if (hasUnsavedWork()) {
    event.preventDefault();
    event.returnValue = '';
  }
});

addClass();
checkGenerateAll();
