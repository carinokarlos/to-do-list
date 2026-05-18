// ── THEME ──
const THEME_ICONS = { auto: '○', light: '◑', dark: '●' };
const THEME_LABELS = { auto: 'auto', light: 'light', dark: 'dark' };
let themeMode = 'auto';
try { themeMode = localStorage.getItem('done_theme') || 'auto'; } catch(e) {}

function applyTheme() {
  const root = document.documentElement;
  if (themeMode === 'dark') root.setAttribute('data-theme', 'dark');
  else if (themeMode === 'light') root.setAttribute('data-theme', 'light');
  else root.removeAttribute('data-theme');
  const icon = document.getElementById('theme-icon');
  const label = document.getElementById('theme-label');
  const bnavIcon = document.getElementById('bnav-theme-icon');
  if (icon) icon.textContent = THEME_ICONS[themeMode];
  if (label) label.textContent = THEME_LABELS[themeMode];
  if (bnavIcon) bnavIcon.textContent = THEME_ICONS[themeMode];
}

function cycleTheme() {
  const order = ['auto', 'light', 'dark'];
  themeMode = order[(order.indexOf(themeMode) + 1) % order.length];
  try { localStorage.setItem('done_theme', themeMode); } catch(e) {}
  applyTheme();
  toast('Theme: ' + THEME_LABELS[themeMode]);
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (themeMode === 'auto') applyTheme();
});

applyTheme();

// ── SIDEBAR (mobile) ──
function toggleSidebar() {
  document.querySelector('aside').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}
function closeSidebar() {
  document.querySelector('aside').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

// ── BOTTOM NAV FILTER (mobile) ──
function setFilterMobile(f, btn) {
  document.querySelectorAll('.bottom-nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentFilter = f;
  currentTagFilter = null;
  document.querySelectorAll('.filter-btn[data-filter]').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === f);
  });
  closeSidebar();
  renderList();
}

// ── STATE ──
let _stored = '[]';
try { _stored = localStorage.getItem('done_tasks') || '[]'; } catch(e) {}
let tasks = JSON.parse(_stored);
let currentFilter = 'all';
let currentTagFilter = null;
let showDone = true;
let groupByDate = false;
let selectedIds = new Set();
let editId = null;
let newTags = [];
let editTags = [];
let newSubtasks = [];  // [{id,text,done}]
let editSubtasks = [];

const PRIORITY_ORDER = { high: 0, med: 1, low: 2, none: 3 };

let _storageAvailable = false;
try { localStorage.setItem('_test','1'); localStorage.removeItem('_test'); _storageAvailable = true; } catch(e) {}

function save() {
  try { localStorage.setItem('done_tasks', JSON.stringify(tasks)); } catch(e) {}
  const ind = document.getElementById('storage-indicator');
  if (ind) ind.textContent = _storageAvailable ? '● saved' : '⚠ open as local .html to persist';
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDue(d) {
  if (!d) return '';
  const t = today();
  if (d === t) return 'Today';
  const diff = Math.round((new Date(d) - new Date(t)) / 86400000);
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 0 && diff < 7) return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(d).getDay()];
  return d;
}

function isOverdue(t) { return t.due && t.due < today() && !t.done; }
function isToday(t) { return t.due === today(); }
function isUpcoming(t) { return t.due && t.due > today() && !t.done; }

function allTags() {
  const set = new Set();
  tasks.forEach(t => (t.tags || []).forEach(g => set.add(g)));
  return [...set].sort();
}

// ── FILTER / SORT ──
function getFiltered() {
  let list = [...tasks];
  switch (currentFilter) {
    case 'today':    list = list.filter(t => isToday(t) && !t.done); break;
    case 'upcoming': list = list.filter(t => isUpcoming(t)); break;
    case 'overdue':  list = list.filter(t => isOverdue(t)); break;
    case 'done':     list = list.filter(t => t.done); break;
    case 'noduedate':list = list.filter(t => !t.due && !t.done); break;
    case 'p-high':   list = list.filter(t => t.priority === 'high' && !t.done); break;
    case 'p-med':    list = list.filter(t => t.priority === 'med' && !t.done); break;
    case 'p-low':    list = list.filter(t => t.priority === 'low' && !t.done); break;
  }
  if (currentTagFilter) list = list.filter(t => (t.tags || []).includes(currentTagFilter));
  if (!showDone && currentFilter !== 'done') list = list.filter(t => !t.done);

  const q = document.getElementById('search-input').value.trim().toLowerCase();
  if (q) list = list.filter(t => t.title.toLowerCase().includes(q) || (t.note || '').toLowerCase().includes(q));

  const s = document.getElementById('sort-select').value;
  if (s === 'due') list.sort((a, b) => {
    if (!a.due && !b.due) return 0; if (!a.due) return 1; if (!b.due) return -1;
    return a.due.localeCompare(b.due);
  });
  else if (s === 'priority') list.sort((a, b) => PRIORITY_ORDER[a.priority||'none'] - PRIORITY_ORDER[b.priority||'none']);
  else if (s === 'alpha') list.sort((a, b) => a.title.localeCompare(b.title));
  else list.sort((a, b) => (a._order ?? b.created) - (b._order ?? a.created));

  return list;
}

// ── RENDER ──
function renderList() {
  const list = getFiltered();
  const wrap = document.getElementById('task-list');
  wrap.innerHTML = '';

  if (!list.length) {
    wrap.innerHTML = `<div class="empty-state"><span class="big">✓</span><p>Nothing here. Add a task to get started.</p></div>`;
    updateStats();
    return;
  }

  if (groupByDate) {
    const groups = {};
    list.forEach(t => {
      let key = t.due ? formatDue(t.due) : 'No due date';
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    Object.keys(groups).forEach(k => {
      const hdr = document.createElement('div');
      hdr.className = 'date-group-header';
      hdr.innerHTML = `<span>${k}</span><span>${groups[k].length} task${groups[k].length !== 1 ? 's' : ''}</span>`;
      wrap.appendChild(hdr);
      groups[k].forEach(t => wrap.appendChild(makeTaskEl(t)));
    });
  } else {
    list.forEach(t => wrap.appendChild(makeTaskEl(t)));
  }

  updateStats();
  initDragDrop();
}

function makeTaskEl(t) {
  const el = document.createElement('div');
  el.className = `task-item ${t.done ? 'done' : ''} ${t.priority && t.priority !== 'none' ? 'priority-' + t.priority : ''}`;
  el.dataset.id = t.id;
  el.setAttribute('draggable', 'true');

  const due = formatDue(t.due);
  const overdue = isOverdue(t);
  const tagsHtml = (t.tags || []).map(g => `<span class="tag">${g}</span>`).join('');
  const recurHtml = t.recur ? `<span class="task-recur">↻ ${t.recur}</span>` : '';

  // Reminder
  let reminderHtml = '';
  if (t.reminder) {
    const rDate = new Date(t.reminder);
    const now = new Date();
    const diff = rDate - now;
    if (diff > 0) {
      reminderHtml = `<span class="task-reminder">🔔 ${rDate.toLocaleDateString()} ${rDate.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>`;
    }
  }

  // Subtasks
  let subtaskHtml = '';
  const subs = t.subtasks || [];
  if (subs.length) {
    const doneSubs = subs.filter(s => s.done).length;
    const pct = Math.round((doneSubs / subs.length) * 100);
    subtaskHtml = `
      <div class="subtask-progress">
        <div class="subtask-bar"><div class="subtask-bar-fill" style="width:${pct}%"></div></div>
        <span class="subtask-count">${doneSubs}/${subs.length} subtasks</span>
      </div>`;
  }

  el.innerHTML = `
    <div class="drag-handle" title="Drag to reorder">
      <svg width="10" height="14" viewBox="0 0 10 14" fill="none">
        <circle cx="3" cy="3" r="1.2" fill="currentColor"/>
        <circle cx="7" cy="3" r="1.2" fill="currentColor"/>
        <circle cx="3" cy="7" r="1.2" fill="currentColor"/>
        <circle cx="7" cy="7" r="1.2" fill="currentColor"/>
        <circle cx="3" cy="11" r="1.2" fill="currentColor"/>
        <circle cx="7" cy="11" r="1.2" fill="currentColor"/>
      </svg>
    </div>
    <input type="checkbox" class="task-checkbox" ${t.done ? 'checked' : ''} onchange="toggleDoneTask('${t.id}')">
    <div class="task-body">
      <div class="task-title">${escHtml(t.title)}</div>
      <div class="task-meta">
        ${due ? `<span class="task-due ${overdue ? 'overdue' : ''}">◷ ${due}${overdue ? ' · overdue' : ''}</span>` : ''}
        ${tagsHtml}
        ${t.priority && t.priority !== 'none' ? `<span class="tag outline">${t.priority}</span>` : ''}
        ${recurHtml}
        ${reminderHtml}
      </div>
      ${t.note ? `<div class="task-note">${escHtml(t.note)}</div>` : ''}
      ${subtaskHtml}
    </div>
    <div class="task-actions">
      <button class="icon-btn" onclick="openEdit('${t.id}')" title="Edit">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M2 11.5l8-8 2.5 2.5-8 8H2v-2.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
      </button>
      <button class="icon-btn" onclick="duplicateTask('${t.id}')" title="Duplicate">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="8" height="9" rx="1" stroke="currentColor" stroke-width="1.5"/><path d="M3 11V2h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
      <button class="icon-btn delete" onclick="deleteTask('${t.id}')" title="Delete">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V2h4v2M5 4v9h6V4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
  `;
  return el;
}

function escHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function updateStats() {
  const all       = tasks.filter(t => !t.done);
  const done      = tasks.filter(t => t.done);
  const todayT    = tasks.filter(t => isToday(t) && !t.done);
  const upcoming  = tasks.filter(t => isUpcoming(t));
  const overdue   = tasks.filter(t => isOverdue(t));
  const nodue     = tasks.filter(t => !t.due && !t.done);
  const hi        = tasks.filter(t => t.priority === 'high' && !t.done);
  const med       = tasks.filter(t => t.priority === 'med'  && !t.done);
  const lo        = tasks.filter(t => t.priority === 'low'  && !t.done);

  document.getElementById('stat-total').textContent = tasks.length;
  document.getElementById('stat-done').textContent  = done.length;
  document.getElementById('stat-today').textContent = todayT.length;
  document.getElementById('cnt-all').textContent     = tasks.filter(t => !t.done).length;
  document.getElementById('cnt-today').textContent   = todayT.length;
  document.getElementById('cnt-upcoming').textContent= upcoming.length;
  document.getElementById('cnt-overdue').textContent = overdue.length;
  document.getElementById('cnt-done').textContent    = done.length;
  document.getElementById('cnt-noduedate').textContent = nodue.length;
  document.getElementById('cnt-p-high').textContent  = hi.length;
  document.getElementById('cnt-p-med').textContent   = med.length;
  document.getElementById('cnt-p-low').textContent   = lo.length;

  const pct = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;
  document.getElementById('progress-pct').textContent = pct + '%';
  document.getElementById('progress-fill').style.width = pct + '%';

  // tags
  const tagFiltersEl = document.getElementById('tag-filters');
  tagFiltersEl.innerHTML = '';
  allTags().forEach(g => {
    const cnt = tasks.filter(t => (t.tags || []).includes(g)).length;
    const b = document.createElement('button');
    b.className = 'filter-btn' + (currentTagFilter === g ? ' active' : '');
    b.innerHTML = `# ${g} <span class="count">${cnt}</span>`;
    b.onclick = () => {
      currentTagFilter = currentTagFilter === g ? null : g;
      document.querySelectorAll('[data-filter]').forEach(x => x.classList.remove('active'));
      renderList();
    };
    tagFiltersEl.appendChild(b);
  });
}

function setFilter(f, btn) {
  currentFilter = f;
  currentTagFilter = null;
  document.querySelectorAll('.filter-btn[data-filter]').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
  closeSidebar();
  renderList();
}

function toggleDoneTask(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  t.doneAt = t.done ? Date.now() : null;

  // handle recurrence: create next task
  if (t.done && t.recur && t.due) {
    const d = new Date(t.due);
    if (t.recur === 'daily')   d.setDate(d.getDate() + 1);
    if (t.recur === 'weekly')  d.setDate(d.getDate() + 7);
    if (t.recur === 'monthly') d.setMonth(d.getMonth() + 1);
    const next = { ...t, id: uid(), done: false, doneAt: null, created: Date.now(), due: d.toISOString().slice(0,10) };
    tasks.unshift(next);
    toast('Recurring task scheduled ↻');
  }

  save();
  renderList();
  if (t.done) toast('Task completed ✓');
}

// ── ADD TASK ──
function addTask() {
  const title = document.getElementById('new-title').value.trim();
  if (!title) { document.getElementById('new-title').focus(); return; }
  const t = {
    id: uid(),
    title,
    priority: document.getElementById('new-priority').value,
    due: document.getElementById('new-due').value || null,
    note: document.getElementById('new-note').value.trim() || null,
    tags: [...newTags],
    recur: document.getElementById('new-recur').value || null,
    reminder: document.getElementById('new-reminder').value ? new Date(document.getElementById('new-reminder').value).getTime() : null,
    subtasks: newSubtasks.map(s => ({...s})),
    done: false,
    created: Date.now()
  };
  tasks.unshift(t);
  save();
  clearAddForm();
  renderList();
  toast('Task added');
  scheduleReminder(t);
}

function clearAddForm() {
  ['new-title','new-due','new-note','new-tag-input','new-subtask-input'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('new-priority').value = 'none';
  document.getElementById('new-recur').value = '';
  document.getElementById('new-reminder').style.display = 'none';
  document.getElementById('new-reminder').value = '';
  document.getElementById('new-reminder-enable').checked = false;
  newTags = [];
  newSubtasks = [];
  document.getElementById('new-tags-preview').innerHTML = '';
  document.getElementById('new-subtasks-list').innerHTML = '';
}

function closeAddForm() {
  document.getElementById('add-form').classList.remove('open');
  clearAddForm();
}

function toggleAddForm() {
  const f = document.getElementById('add-form');
  f.classList.toggle('open');
  if (f.classList.contains('open')) document.getElementById('new-title').focus();
}

function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  save();
  renderList();
  toast('Task deleted');
}

function duplicateTask(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  const copy = { ...t, id: uid(), title: t.title + ' (copy)', created: Date.now(), done: false };
  tasks.unshift(copy);
  save();
  renderList();
  toast('Task duplicated');
}

// ── EDIT MODAL ──
function openEdit(id) {
  editId = id;
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  document.getElementById('edit-title').value     = t.title;
  document.getElementById('edit-priority').value  = t.priority || 'none';
  document.getElementById('edit-due').value       = t.due || '';
  document.getElementById('edit-note').value      = t.note || '';
  document.getElementById('edit-recur').value     = t.recur || '';

  const hasReminder = !!t.reminder;
  document.getElementById('edit-reminder-enable').checked = hasReminder;
  const reminderInput = document.getElementById('edit-reminder');
  if (hasReminder) {
    const d = new Date(t.reminder);
    reminderInput.value = d.toISOString().slice(0,16);
    reminderInput.style.display = 'block';
  } else {
    reminderInput.value = '';
    reminderInput.style.display = 'none';
  }

  editTags = [...(t.tags || [])];
  editSubtasks = (t.subtasks || []).map(s => ({...s}));
  renderTagPreview('edit-tags-preview', editTags, 'edit-tags');
  renderSubtaskList('edit');
  document.getElementById('edit-modal').classList.add('open');
}

function saveEdit() {
  const t = tasks.find(x => x.id === editId);
  if (!t) return;
  t.title    = document.getElementById('edit-title').value.trim() || t.title;
  t.priority = document.getElementById('edit-priority').value;
  t.due      = document.getElementById('edit-due').value || null;
  t.note     = document.getElementById('edit-note').value.trim() || null;
  t.tags     = [...editTags];
  t.recur    = document.getElementById('edit-recur').value || null;
  const hasReminder = document.getElementById('edit-reminder-enable').checked;
  const reminderVal = document.getElementById('edit-reminder').value;
  t.reminder = (hasReminder && reminderVal) ? new Date(reminderVal).getTime() : null;
  t.subtasks = editSubtasks.map(s => ({...s}));
  save();
  renderList();
  closeModal();
  toast('Task updated');
  scheduleReminder(t);
}

function closeModal() {
  document.getElementById('edit-modal').classList.remove('open');
  editId = null;
}

// ── REMINDER TOGGLE ──
function toggleReminderField(ctx) {
  const enabled = document.getElementById(ctx + '-reminder-enable').checked;
  const field = document.getElementById(ctx + '-reminder');
  field.style.display = enabled ? 'block' : 'none';
  if (!enabled) field.value = '';
}

// ── REMINDERS ──
const _scheduledReminders = {};

function scheduleReminder(task) {
  if (!task.reminder || task.done) return;
  const delay = task.reminder - Date.now();
  if (delay <= 0 || delay > 7 * 24 * 60 * 60 * 1000) return;
  if (_scheduledReminders[task.id]) clearTimeout(_scheduledReminders[task.id]);
  _scheduledReminders[task.id] = setTimeout(() => {
    showReminderBanner(task);
  }, delay);
}

function showReminderBanner(task) {
  const banner = document.getElementById('reminder-banner');
  document.getElementById('reminder-title').textContent = '🔔 Reminder: ' + task.title;
  document.getElementById('reminder-body').textContent = task.due ? 'Due: ' + formatDue(task.due) : (task.note || '');
  banner.style.display = 'block';
  setTimeout(() => { banner.style.display = 'none'; }, 10000);
}

// Schedule all existing reminders on load
tasks.forEach(scheduleReminder);

// ── TAGS ──
function handleTagKey(e, store) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const input = e.target;
  const val = input.value.trim().toLowerCase().replace(/\s+/g, '-');
  if (!val) return;
  const arr = store === 'new-tags' ? newTags : editTags;
  if (!arr.includes(val)) arr.push(val);
  input.value = '';
  const previewId = store === 'new-tags' ? 'new-tags-preview' : 'edit-tags-preview';
  renderTagPreview(previewId, arr, store);
}

function renderTagPreview(previewId, arr, store) {
  const el = document.getElementById(previewId);
  if (!el) return;
  el.innerHTML = arr.map((g, i) => `
    <span class="tag-removable" onclick="removeTag(${i},'${store}','${previewId}')">${g} ✕</span>
  `).join('');
}

function removeTag(i, store, previewId) {
  const arr = store === 'new-tags' ? newTags : editTags;
  arr.splice(i, 1);
  renderTagPreview(previewId, arr, store);
}

// ── SUBTASKS ──
function addSubtaskField(ctx) {
  const input = document.getElementById(ctx + '-subtask-input');
  const text = input.value.trim();
  if (!text) return;
  const sub = { id: uid(), text, done: false };
  if (ctx === 'new') newSubtasks.push(sub);
  else editSubtasks.push(sub);
  input.value = '';
  renderSubtaskList(ctx);
}

function renderSubtaskList(ctx) {
  const arr = ctx === 'new' ? newSubtasks : editSubtasks;
  const el = document.getElementById(ctx + '-subtasks-list');
  if (!el) return;
  el.innerHTML = arr.map((s, i) => `
    <div class="subtask-item ${s.done ? 'done-sub' : ''}">
      <input type="checkbox" ${s.done ? 'checked' : ''} onchange="toggleSubtask('${ctx}',${i})">
      <span>${escHtml(s.text)}</span>
      <button class="subtask-remove" onclick="removeSubtask('${ctx}',${i})">✕</button>
    </div>
  `).join('');
}

function toggleSubtask(ctx, i) {
  const arr = ctx === 'new' ? newSubtasks : editSubtasks;
  arr[i].done = !arr[i].done;
  renderSubtaskList(ctx);
}

function removeSubtask(ctx, i) {
  const arr = ctx === 'new' ? newSubtasks : editSubtasks;
  arr.splice(i, 1);
  renderSubtaskList(ctx);
}

// ── DRAG & DROP ──
let dragSrcId = null;

function initDragDrop() {
  document.querySelectorAll('.task-item[draggable]').forEach(el => {
    el.addEventListener('dragstart', e => {
      dragSrcId = el.dataset.id;
      setTimeout(() => el.classList.add('dragging'), 0);
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      document.querySelectorAll('.task-item').forEach(x => x.classList.remove('drag-over'));
    });
    el.addEventListener('dragover', e => {
      e.preventDefault();
      document.querySelectorAll('.task-item').forEach(x => x.classList.remove('drag-over'));
      el.classList.add('drag-over');
    });
    el.addEventListener('drop', e => {
      e.preventDefault();
      el.classList.remove('drag-over');
      if (!dragSrcId || dragSrcId === el.dataset.id) return;
      const srcIdx = tasks.findIndex(t => t.id === dragSrcId);
      const dstIdx = tasks.findIndex(t => t.id === el.dataset.id);
      if (srcIdx === -1 || dstIdx === -1) return;
      const [moved] = tasks.splice(srcIdx, 1);
      tasks.splice(dstIdx, 0, moved);
      save();
      renderList();
    });
  });
}

// ── TOGGLE DONE / GROUP ──
function toggleDone() {
  showDone = !showDone;
  document.getElementById('show-done-label').textContent = showDone ? 'Hide done' : 'Show done';
  renderList();
}

function toggleGroupBy() {
  groupByDate = !groupByDate;
  document.getElementById('group-label').textContent = groupByDate ? 'Group: on' : 'Group: off';
  renderList();
}

// ── BULK ──
function bulkComplete() {
  selectedIds.forEach(id => {
    const t = tasks.find(x => x.id === id);
    if (t) { t.done = true; t.doneAt = Date.now(); }
  });
  save(); clearSelection(); renderList(); toast('Tasks completed');
}

function bulkDelete() {
  tasks = tasks.filter(t => !selectedIds.has(t.id));
  save(); clearSelection(); renderList(); toast('Tasks deleted');
}

function clearSelection() {
  selectedIds.clear();
  document.getElementById('bulk-bar').classList.remove('visible');
  renderList();
}

// ── TOAST ──
function toast(msg) {
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

// ── EXPORT CSV ──
function exportCSV() {
  const headers = ['Title','Priority','Due','Done','Tags','Note','Recur','Subtasks'];
  const rows = tasks.map(t => [
    `"${(t.title||'').replace(/"/g,'""')}"`,
    t.priority || 'none',
    t.due || '',
    t.done ? 'yes' : 'no',
    `"${(t.tags||[]).join(', ')}"`,
    `"${(t.note||'').replace(/"/g,'""')}"`,
    t.recur || '',
    `"${(t.subtasks||[]).map(s => (s.done?'[x] ':'[ ] ') + s.text).join(' | ')}"`,
  ].join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  download('tasks.csv', 'text/csv', csv);
  toast('CSV exported');
}

// ── EXPORT PDF (print) ──
function exportPDF() {
  const active = getFiltered();
  const html = `<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>Task List</title>
    <style>
      body { font-family: -apple-system, sans-serif; font-size: 13px; color: #111; padding: 2rem; }
      h1 { font-size: 1.4rem; margin-bottom: 1rem; border-bottom: 2px solid #111; padding-bottom: 0.5rem; }
      .task { padding: 0.6rem 0; border-bottom: 1px solid #eee; display:flex; gap: 0.5rem; align-items:flex-start; }
      .cb { width:14px;height:14px;border:1px solid #999;border-radius:3px;margin-top:2px;flex-shrink:0; }
      .done-mark { background:#111; }
      .title { font-weight:500; }
      .done-title { text-decoration:line-through; opacity:0.5; }
      .meta { font-size:0.7rem; color:#777; margin-top:2px; }
      .sub { font-size:0.75rem; color:#555; margin-top:4px; padding-left:0.5rem; }
    </style>
  </head><body>
    <h1>Task List — ${new Date().toLocaleDateString()}</h1>
    ${active.map(t => `
      <div class="task">
        <div class="cb ${t.done ? 'done-mark' : ''}"></div>
        <div>
          <div class="title ${t.done ? 'done-title' : ''}">${escHtml(t.title)}</div>
          <div class="meta">${[t.due ? '◷ ' + t.due : '', t.priority && t.priority !== 'none' ? t.priority : '', (t.tags||[]).join(', ')].filter(Boolean).join(' · ')}</div>
          ${t.note ? `<div class="meta">${escHtml(t.note)}</div>` : ''}
          ${(t.subtasks||[]).length ? `<div class="sub">${(t.subtasks||[]).map(s => (s.done?'☑':'☐') + ' ' + s.text).join('<br>')}</div>` : ''}
        </div>
      </div>`).join('')}
  </body></html>`;
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.onload = () => { w.print(); };
  toast('Print dialog opened');
}

function download(filename, mime, content) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
}

// ── GMAIL ──
function openGmailModal() {
  document.getElementById('gmail-modal').classList.add('open');
}

function closeGmailModal() {
  document.getElementById('gmail-modal').classList.remove('open');
}

function sendGmail() {
  const to      = document.getElementById('gmail-to').value.trim();
  const subject = document.getElementById('gmail-subject').value.trim() || 'My Task List';
  const filter  = document.getElementById('gmail-filter').value;

  let list = [...tasks];
  if (filter === 'today')    list = list.filter(t => isToday(t) && !t.done);
  if (filter === 'upcoming') list = list.filter(t => isUpcoming(t));
  if (filter === 'overdue')  list = list.filter(t => isOverdue(t));
  if (filter === 'active')   list = list.filter(t => !t.done);

  const lines = list.map(t => {
    let line = `${t.done ? '[x]' : '[ ]'} ${t.title}`;
    if (t.due) line += ` (due: ${t.due})`;
    if (t.priority && t.priority !== 'none') line += ` [${t.priority}]`;
    if (t.tags && t.tags.length) line += ` #${t.tags.join(' #')}`;
    if (t.note) line += `\n    Note: ${t.note}`;
    if (t.subtasks && t.subtasks.length) {
      line += '\n' + t.subtasks.map(s => `    ${s.done ? '[x]' : '[ ]'} ${s.text}`).join('\n');
    }
    return line;
  });

  const body = `Task List — ${new Date().toLocaleDateString()}\n${'─'.repeat(40)}\n\n${lines.join('\n\n')}\n\n${'─'.repeat(40)}\nGenerated by Task Manager`;

  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.open(mailto, '_blank');
  closeGmailModal();
  toast('Gmail opened ✉');
}

// ── KEYBOARD ──
document.getElementById('edit-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('edit-modal')) closeModal();
});

document.getElementById('gmail-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('gmail-modal')) closeGmailModal();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeGmailModal(); }
  if (e.key === 'n' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    toggleAddForm();
  }
});

renderList();