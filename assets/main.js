// ── THEME ──
// modes: 'auto' | 'light' | 'dark'
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

// listen for OS theme changes when in auto mode
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
  // sync sidebar buttons too
  document.querySelectorAll('.filter-btn[data-filter]').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === f);
  });
  closeSidebar();
  renderList();
}

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

const PRIORITY_ORDER = { high: 0, med: 1, low: 2, none: 3 };

let _storageAvailable = false;
try { localStorage.setItem('_test','1'); localStorage.removeItem('_test'); _storageAvailable = true; } catch(e) {}

function save() {
  try { localStorage.setItem('done_tasks', JSON.stringify(tasks)); } catch(e) {}
  const ind = document.getElementById('storage-indicator');
  if (ind) ind.textContent = _storageAvailable ? '● saved' : '⚠ open as local .html file to persist data';
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

function isOverdue(t) {
  return t.due && t.due < today() && !t.done;
}

function isToday(t) {
  return t.due === today();
}

function isUpcoming(t) {
  return t.due && t.due > today() && !t.done;
}

function allTags() {
  const set = new Set();
  tasks.forEach(t => (t.tags || []).forEach(g => set.add(g)));
  return [...set].sort();
}

function getFiltered() {
  let list = [...tasks];

  // filter
  switch (currentFilter) {
    case 'today': list = list.filter(t => isToday(t) && !t.done); break;
    case 'upcoming': list = list.filter(t => isUpcoming(t)); break;
    case 'overdue': list = list.filter(t => isOverdue(t)); break;
    case 'done': list = list.filter(t => t.done); break;
    case 'noduedate': list = list.filter(t => !t.due && !t.done); break;
    case 'p-high': list = list.filter(t => t.priority === 'high' && !t.done); break;
    case 'p-med': list = list.filter(t => t.priority === 'med' && !t.done); break;
    case 'p-low': list = list.filter(t => t.priority === 'low' && !t.done); break;
  }

  if (currentTagFilter) list = list.filter(t => (t.tags || []).includes(currentTagFilter));
  if (!showDone && currentFilter !== 'done') list = list.filter(t => !t.done);

  // search
  const q = document.getElementById('search-input').value.trim().toLowerCase();
  if (q) list = list.filter(t => t.title.toLowerCase().includes(q) || (t.note || '').toLowerCase().includes(q));

  // sort
  const s = document.getElementById('sort-select').value;
  if (s === 'due') list.sort((a, b) => {
    if (!a.due && !b.due) return 0;
    if (!a.due) return 1;
    if (!b.due) return -1;
    return a.due.localeCompare(b.due);
  });
  else if (s === 'priority') list.sort((a, b) => PRIORITY_ORDER[a.priority || 'none'] - PRIORITY_ORDER[b.priority || 'none']);
  else if (s === 'alpha') list.sort((a, b) => a.title.localeCompare(b.title));
  else list.sort((a, b) => b.created - a.created);

  return list;
}

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
}

function makeTaskEl(t) {
  const el = document.createElement('div');
  el.className = `task-item ${t.done ? 'done' : ''} ${t.priority && t.priority !== 'none' ? 'priority-' + t.priority : ''}`;
  el.dataset.id = t.id;

  const due = formatDue(t.due);
  const overdue = isOverdue(t);

  const tagsHtml = (t.tags || []).map(g => `<span class="tag">${g}</span>`).join('');

  el.innerHTML = `
    <input type="checkbox" class="task-checkbox" ${t.done ? 'checked' : ''} onchange="toggleDoneTask('${t.id}')">
    <div class="task-body">
      <div class="task-title">${escHtml(t.title)}</div>
      <div class="task-meta">
        ${due ? `<span class="task-due ${overdue ? 'overdue' : ''}">◷ ${due}${overdue ? ' — overdue' : ''}</span>` : ''}
        ${tagsHtml}
        ${t.priority && t.priority !== 'none' ? `<span class="tag outline">${t.priority}</span>` : ''}
      </div>
      ${t.note ? `<div class="task-note">${escHtml(t.note)}</div>` : ''}
    </div>
    <div class="task-actions">
      <button class="icon-btn" onclick="openEdit('${t.id}')" title="Edit">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 11.5l8-8 2.5 2.5-8 8H2v-2.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
      </button>
      <button class="icon-btn" onclick="duplicateTask('${t.id}')" title="Duplicate">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="8" height="9" rx="1" stroke="currentColor" stroke-width="1.5"/><path d="M3 11V2h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
      <button class="icon-btn delete" onclick="deleteTask('${t.id}')" title="Delete">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V2h4v2M5 4v9h6V4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
  `;
  return el;
}

function escHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function updateStats() {
  const all = tasks.filter(t => !t.done);
  const done = tasks.filter(t => t.done);
  const todayTasks = tasks.filter(t => isToday(t) && !t.done);
  const overdue = tasks.filter(t => isOverdue(t));
  const upcoming = tasks.filter(t => isUpcoming(t));
  const hi = tasks.filter(t => t.priority === 'high' && !t.done);
  const med = tasks.filter(t => t.priority === 'med' && !t.done);
  const lo = tasks.filter(t => t.priority === 'low' && !t.done);
  const nodue = tasks.filter(t => !t.due && !t.done);

  document.getElementById('stat-total').textContent = tasks.length;
  document.getElementById('stat-done').textContent = done.length;
  document.getElementById('stat-today').textContent = todayTasks.length;

  document.getElementById('cnt-all').textContent = all.length;
  document.getElementById('cnt-today').textContent = todayTasks.length;
  document.getElementById('cnt-upcoming').textContent = upcoming.length;
  document.getElementById('cnt-overdue').textContent = overdue.length;
  document.getElementById('cnt-done').textContent = done.length;
  document.getElementById('cnt-noduedate').textContent = nodue.length;
  document.getElementById('cnt-p-high').textContent = hi.length;
  document.getElementById('cnt-p-med').textContent = med.length;
  document.getElementById('cnt-p-low').textContent = lo.length;

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
  save();
  renderList();
  if (t.done) toast('Task completed ✓');
}

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
    done: false,
    created: Date.now()
  };
  tasks.unshift(t);
  save();
  clearAddForm();
  renderList();
  toast('Task added');
}

function clearAddForm() {
  ['new-title','new-due','new-note','new-tag-input'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('new-priority').value = 'none';
  newTags = [];
  document.getElementById('new-tags-preview').innerHTML = '';
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

function openEdit(id) {
  editId = id;
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  document.getElementById('edit-title').value = t.title;
  document.getElementById('edit-priority').value = t.priority || 'none';
  document.getElementById('edit-due').value = t.due || '';
  document.getElementById('edit-note').value = t.note || '';
  editTags = [...(t.tags || [])];
  renderTagPreview('edit-tags-preview', editTags, 'edit-tags');
  document.getElementById('edit-modal').classList.add('open');
}

function saveEdit() {
  const t = tasks.find(x => x.id === editId);
  if (!t) return;
  t.title = document.getElementById('edit-title').value.trim() || t.title;
  t.priority = document.getElementById('edit-priority').value;
  t.due = document.getElementById('edit-due').value || null;
  t.note = document.getElementById('edit-note').value.trim() || null;
  t.tags = [...editTags];
  save();
  renderList();
  closeModal();
  toast('Task updated');
}

function closeModal() {
  document.getElementById('edit-modal').classList.remove('open');
  editId = null;
}

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
  el.innerHTML = arr.map((g, i) => `
    <span class="tag-removable" onclick="removeTag(${i},'${store}','${previewId}')">
      ${g} ✕
    </span>
  `).join('');
}

function removeTag(i, store, previewId) {
  const arr = store === 'new-tags' ? newTags : editTags;
  arr.splice(i, 1);
  renderTagPreview(previewId, arr, store);
}

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

function bulkComplete() {
  selectedIds.forEach(id => {
    const t = tasks.find(x => x.id === id);
    if (t) { t.done = true; t.doneAt = Date.now(); }
  });
  save();
  clearSelection();
  renderList();
  toast('Tasks completed');
}

function bulkDelete() {
  tasks = tasks.filter(t => !selectedIds.has(t.id));
  save();
  clearSelection();
  renderList();
  toast('Tasks deleted');
}

function clearSelection() {
  selectedIds.clear();
  document.getElementById('bulk-bar').classList.remove('visible');
  renderList();
}

function toast(msg) {
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

// close modal on overlay click
document.getElementById('edit-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('edit-modal')) closeModal();
});

// keyboard shortcut: N to add
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'n' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    toggleAddForm();
  }
});

renderList();
