# How to Build the TaskBoard Prototype (Vanilla JS)

No React, no Tailwind, no libraries. Just an `index.html`, a `style.css`, and an `app.js`. Data lives in `localStorage`. This is the best way to understand what a framework actually does for you — by doing it yourself first.

---

## What you're building

The same Kanban board: 5 columns, draggable cards, a create/edit modal, dark/light theme. The visual design is nearly identical to the React version. The drag-and-drop is built manually using the browser's native HTML5 Drag and Drop API.

---

## File structure

```
taskboard-vanilla/
├── index.html
├── style.css
└── app.js
```

Three files. No build step, no `npm install`, no config. Open `index.html` in a browser and it works.

---

## How this differs from the React version

| React version | Vanilla version |
|---|---|
| State lives in `useState` hooks | State lives in plain `let` variables |
| UI updates via re-render on state change | UI updates by calling `render()` manually |
| Drag-and-drop via `@dnd-kit` | Drag-and-drop via native HTML5 DnD API |
| Data persisted to Supabase | Data persisted to `localStorage` |
| Components are functions returning JSX | Components are functions returning DOM elements |
| CSS via Tailwind utilities | CSS via custom properties + plain selectors |

---

## Step 1 — index.html

Create `index.html`. This is the static shell — just structure, no data. JavaScript will fill in the board and cards.

```html
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TaskBoard</title>
  <link rel="stylesheet" href="style.css" />

  <!-- Anti-flash theme script: runs before first paint, same as the React version -->
  <script>
    (function () {
      var t = localStorage.getItem('taskboard-theme');
      if (t === 'light') document.documentElement.classList.remove('dark');
      else document.documentElement.classList.add('dark');
    })();
  </script>
</head>
<body>

  <!-- ── App shell ──────────────────────────────────────── -->
  <div id="app">

    <header id="header">
      <div class="header-left">
        <div class="logo">T</div>
        <div>
          <h1 class="app-title">TaskBoard</h1>
          <p id="task-count" class="task-count"></p>
        </div>
      </div>
      <div class="header-right">
        <button id="theme-btn" class="icon-btn" title="Toggle theme"></button>
        <button id="new-task-btn" class="btn-primary">+ New Task</button>
      </div>
    </header>

    <div id="board" class="board"></div>

  </div>

  <!-- ── Modal ──────────────────────────────────────────── -->
  <div id="modal-backdrop" class="modal-backdrop hidden">
    <div class="modal" role="dialog" aria-modal="true">

      <div class="modal-header">
        <h2 id="modal-title">New task</h2>
        <button id="modal-close" class="icon-btn" aria-label="Close">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div class="field">
        <label for="field-title">Title <span class="required">*</span></label>
        <input id="field-title" type="text" placeholder="What needs to be done?" />
      </div>

      <div class="field">
        <label for="field-from">From</label>
        <input id="field-from" type="text" placeholder="Who commissioned this task?" />
      </div>

      <div class="field">
        <label for="field-desc">Description</label>
        <textarea id="field-desc" rows="3" placeholder="Add more context…"></textarea>
      </div>

      <div class="field-row">
        <div class="field">
          <label>Priority</label>
          <div id="priority-btns" class="choice-group"></div>
        </div>
        <div class="field">
          <label>Column</label>
          <div id="column-btns" class="choice-group choice-group--col"></div>
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label for="field-tags">Tags <span class="hint">(comma separated)</span></label>
          <input id="field-tags" type="text" placeholder="ui, backend" />
        </div>
        <div class="field">
          <label for="field-assignee">Assignee <span class="hint">(initials)</span></label>
          <input id="field-assignee" type="text" placeholder="AM" maxlength="3" />
        </div>
      </div>

      <div class="modal-actions">
        <div id="delete-area"></div>
        <div class="modal-actions-right">
          <button id="modal-cancel" class="btn-secondary">Cancel</button>
          <button id="modal-save" class="btn-save">Create task</button>
        </div>
      </div>

      <p class="modal-hint">⌘ Enter to save · Esc to cancel</p>

    </div>
  </div>

  <script src="app.js"></script>
</body>
</html>
```

> **Why is the board empty in the HTML?** The `#board` div has no content — `app.js` builds and injects all columns and cards via JavaScript. This is the same pattern as React: the HTML is a shell, JavaScript owns the content.

> **Why `class="dark"` on `<html>`?** Same reason as the React version — the inline `<script>` in `<head>` will immediately override it based on `localStorage` before the first paint. Starting with `dark` means the server-rendered default is dark, and the script corrects it if needed.

---

## Step 2 — style.css

Create `style.css`. The theming approach is identical to the React version: CSS custom properties on `:root` (light) and `.dark` (dark), toggled by a class on `<html>`.

```css
/* ── Reset ────────────────────────────────────────────── */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* ── Theme tokens ─────────────────────────────────────── */
:root {
  --bg-board:      #eef0f8;
  --bg-col:        #ffffff;
  --bg-card:       #ffffff;
  --bg-card-hover: #f5f5ff;

  --text-hi:       #12122a;
  --text-lo:       #5a5a80;
  --text-dim:      #9999b8;

  --border:        rgba(18, 18, 42, 0.08);
  --border-strong: rgba(18, 18, 42, 0.18);

  --shadow-card:   0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.05);
  --shadow-drag:   0 12px 40px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.12);
  --shadow-modal:  0 24px 64px rgba(0,0,0,0.22);

  --bar-h: 56px;
}

.dark {
  --bg-board:      #07070f;
  --bg-col:        #0e0e1c;
  --bg-card:       #161628;
  --bg-card-hover: #1e1e32;

  --text-hi:       #e4e4f8;
  --text-lo:       #8888aa;
  --text-dim:      #55557a;

  --border:        rgba(255, 255, 255, 0.06);
  --border-strong: rgba(255, 255, 255, 0.14);

  --shadow-card:   0 1px 3px rgba(0,0,0,0.5);
  --shadow-drag:   0 16px 48px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4);
  --shadow-modal:  0 24px 64px rgba(0,0,0,0.6);
}

/* ── Base ─────────────────────────────────────────────── */
html { scroll-behavior: smooth; }

body {
  background: var(--bg-board);
  color: var(--text-hi);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 15px;
  line-height: 1.5;
  min-height: 100vh;
  transition: background 0.25s ease, color 0.25s ease;
  -webkit-font-smoothing: antialiased;
}

/* ── Header ───────────────────────────────────────────── */
#header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: var(--bar-h);
  background: var(--bg-col);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 10;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, #a78bfa, #38bdf8);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}

.app-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-hi);
}

.task-count {
  font-size: 11px;
  color: var(--text-dim);
  margin-top: 1px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── Buttons ──────────────────────────────────────────── */
button { cursor: pointer; font-family: inherit; }

.icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-lo);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s, color 0.15s;
}

.icon-btn:hover {
  border-color: var(--border-strong);
  color: var(--text-hi);
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #8b5cf6, #38bdf8);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  transition: opacity 0.15s;
}

.btn-primary:hover { opacity: 0.9; }

.btn-secondary {
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-lo);
  font-size: 13px;
  transition: border-color 0.15s;
}

.btn-secondary:hover { border-color: var(--border-strong); }

.btn-save {
  padding: 8px 16px;
  border-radius: 10px;
  border: none;
  background: #a78bfa;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  transition: opacity 0.15s;
}

.btn-save:hover:not(:disabled) { opacity: 0.9; }
.btn-save:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-delete {
  padding: 6px 12px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-dim);
  font-size: 12px;
  transition: color 0.15s;
}

.btn-delete:hover { color: #f87171; }

/* ── Board ────────────────────────────────────────────── */
.board {
  display: flex;
  gap: 16px;
  padding: 24px;
  overflow-x: auto;
  align-items: flex-start;
  min-height: calc(100vh - var(--bar-h));
}

/* ── Column ───────────────────────────────────────────── */
.column {
  width: 288px;
  flex-shrink: 0;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: var(--bg-col);
  padding: 12px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

/* Highlight when a card is dragged over this column */
.column.drag-over {
  border-color: var(--col-color);
  box-shadow: 0 0 0 1px var(--col-color, #a78bfa), 0 0 20px color-mix(in srgb, var(--col-color, #a78bfa) 20%, transparent);
}

.col-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  padding: 0 4px;
}

.col-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.col-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.col-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-lo);
}

.col-count {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 99px;
  background: var(--border);
  color: var(--text-dim);
}

.col-accent {
  height: 1px;
  border-radius: 99px;
  opacity: 0.4;
  margin-bottom: 10px;
}

.card-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 60px;
}

.add-task-btn {
  margin-top: 10px;
  width: 100%;
  padding: 8px;
  border-radius: 8px;
  border: 1px dashed var(--border);
  background: transparent;
  color: var(--text-dim);
  font-size: 12px;
  font-weight: 500;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.add-task-btn:hover {
  color: var(--col-color);
  border-color: var(--col-color);
  background: color-mix(in srgb, var(--col-color) 6%, transparent);
}

/* ── Card ─────────────────────────────────────────────── */
.card {
  border-radius: 12px;
  padding: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-card);
  cursor: grab;
  user-select: none;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s, opacity 0.15s;
}

.card:hover {
  background: var(--bg-card-hover);
  border-color: var(--border-strong);
}

.card:active { cursor: grabbing; }

/* The original card fades while being dragged */
.card.dragging { opacity: 0.35; }

.card-top {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.priority-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.tag {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 500;
  color: var(--text-lo);
  background: var(--border);
}

.card-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-hi);
  line-height: 1.4;
  margin-bottom: 6px;
}

.card-desc {
  font-size: 11px;
  color: var(--text-lo);
  line-height: 1.5;
  margin-bottom: 12px;
  /* Clamp to 2 lines */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
  color: #fff;
}

.drag-handle {
  opacity: 0.3;
}

/* ── Drop indicator ───────────────────────────────────── */
/* The blue line that appears between cards during a drag */
.drop-indicator {
  height: 2px;
  border-radius: 2px;
  background: #a78bfa;
  box-shadow: 0 0 6px #a78bfa88;
  margin: 2px 0;
  pointer-events: none;
}

/* ── Modal ────────────────────────────────────────────── */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 50;
}

.modal-backdrop.hidden { display: none; }

.modal {
  width: 100%;
  max-width: 500px;
  background: var(--bg-col);
  border: 1px solid var(--border-strong);
  border-radius: 20px;
  padding: 24px;
  box-shadow: var(--shadow-modal);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-header h2 {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-hi);
}

/* ── Form fields ──────────────────────────────────────── */
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.field label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-lo);
}

.field input,
.field textarea {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-hi);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
  resize: none;
}

.field input:focus,
.field textarea:focus {
  border-color: var(--border-strong);
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.required { color: #f87171; }
.hint { font-weight: 400; opacity: 0.6; }

/* ── Choice buttons (priority / column) ───────────────── */
.choice-group {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}

.choice-group--col {
  grid-template-columns: 1fr;
}

.choice-btn {
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-lo);
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 6px;
}

.col-dot-sm {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* ── Modal actions ────────────────────────────────────── */
.modal-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 4px;
}

.modal-actions-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-hint {
  font-size: 10px;
  color: var(--text-dim);
  text-align: center;
}

/* ── Scrollbars ───────────────────────────────────────── */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-dim); }
```

> **Why `color-mix()` in `.add-task-btn:hover` and `.column.drag-over`?** `color-mix(in srgb, #color 20%, transparent)` creates a semi-transparent version of any color without needing to know its RGB values in advance. This lets the column color variable (`--col-color`) drive the hover tint dynamically. It's a modern CSS feature — if you need to support older browsers, replace it with a fixed `rgba()` value.

---

## Step 3 — app.js

Create `app.js`. This is where everything happens. Build it in sections.

### 3.1 — Constants and state

```js
// ── Constants ─────────────────────────────────────────────

const COLUMNS = [
  { id: 'backlog',     title: 'Backlog',     color: '#64748b' },
  { id: 'todo',        title: 'To Do',       color: '#38bdf8' },
  { id: 'in-progress', title: 'In Progress', color: '#a78bfa' },
  { id: 'review',      title: 'Review',      color: '#fbbf24' },
  { id: 'done',        title: 'Done',        color: '#34d399' },
];

const PRIORITY_CONFIG = {
  low:    { label: 'Low',    color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
  medium: { label: 'Medium', color: '#fb923c', bg: 'rgba(251,146,60,0.12)' },
  high:   { label: 'High',   color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
  urgent: { label: 'Urgent', color: '#e879f9', bg: 'rgba(232,121,249,0.12)' },
};

// ── State ─────────────────────────────────────────────────

let tasks = loadTasks();

// Everything about the current drag lives here
let drag = {
  taskId: null,        // id of the card being dragged
  startColumnId: null, // column it came from
};

// Per-column counters — explained in the DnD section
const dragCounters = {};

// Modal state
let modal = {
  isOpen: false,
  task: null,          // null = create mode, Task = edit mode
  defaultColumnId: 'todo',
};
```

> **Why plain `let` variables instead of a React-style state object?** In vanilla JS there is no reactive system — changing a variable doesn't automatically update the UI. Instead, after every mutation you manually call `render()`. The variables are the data; `render()` is what turns data into DOM.

### 3.2 — localStorage

```js
// ── Storage ───────────────────────────────────────────────

function loadTasks() {
  try {
    return JSON.parse(localStorage.getItem('taskboard-tasks') || '[]');
  } catch {
    return []; // Guard against corrupted JSON
  }
}

function saveTasks() {
  localStorage.setItem('taskboard-tasks', JSON.stringify(tasks));
}
```

> **Why `try/catch` on `JSON.parse`?** `localStorage` stores strings. If the data was ever written incorrectly (manually edited, truncated by a browser bug), `JSON.parse` would throw. The catch returns an empty array so the app starts clean instead of crashing.

> **Why `|| '[]'` and not `|| []`?** `localStorage.getItem()` returns `null` when the key doesn't exist, so the `||` fallback handles that case. The fallback must be a **string** — `JSON.parse` only accepts strings. Passing `|| []` would hand an array to `JSON.parse`, which internally calls `.toString()` on it, producing `""` (empty string), which is invalid JSON and throws immediately. An alternative that avoids the string fallback entirely is `const raw = localStorage.getItem('taskboard-tasks'); return raw ? JSON.parse(raw) : [];` — only call `JSON.parse` when there's actually something to parse.

### 3.3 — CRUD

```js
// ── CRUD ──────────────────────────────────────────────────

function addTask(data) {
  tasks.push({ ...data, id: crypto.randomUUID() });
  saveTasks();
  render();
}

function updateTask(data) {
  tasks = tasks.map(t => t.id === data.id ? data : t);
  saveTasks();
  render();
}

function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
  render();
}
```

> **Why `render()` at the end of every mutation?** This is the vanilla equivalent of React re-rendering on state change. There is no reactivity system watching the variables — you have to tell the UI to update manually. Every mutation ends with `saveTasks()` (persist) then `render()` (redraw).

### 3.4 — Rendering

This is the core rendering layer. Functions take data, return DOM elements.

```js
// ── Rendering ─────────────────────────────────────────────

function render() {
  const board = document.getElementById('board');
  // Wipe the board and rebuild from scratch.
  // Simple, but re-creates every DOM element on every change.
  board.innerHTML = '';
  COLUMNS.forEach(col => {
    const colTasks = tasks.filter(t => t.columnId === col.id);
    board.appendChild(renderColumn(col, colTasks));
  });
  updateHeader();
}

function renderColumn(col, colTasks) {
  const el = document.createElement('div');
  el.className = 'column';
  el.dataset.columnId = col.id;
  // CSS variable so the column can drive its own accent color
  el.style.setProperty('--col-color', col.color);

  el.innerHTML = `
    <div class="col-header">
      <div class="col-header-left">
        <span class="col-dot" style="background:${col.color};box-shadow:0 0 8px ${col.color}88"></span>
        <h2 class="col-title">${col.title}</h2>
        <span class="col-count">${colTasks.length}</span>
      </div>
    </div>
    <div class="col-accent" style="background:linear-gradient(90deg,${col.color},transparent)"></div>
    <div class="card-list" data-column-id="${col.id}"></div>
    <button class="add-task-btn" data-column-id="${col.id}">+ Add task</button>
  `;

  // Render cards into the card-list
  const cardList = el.querySelector('.card-list');
  colTasks.forEach(task => cardList.appendChild(renderCard(task)));

  // Wire up drag-and-drop events on the column
  el.addEventListener('dragover',  e => handleDragOver(e, col.id));
  el.addEventListener('dragenter', e => handleDragEnter(e, col.id));
  el.addEventListener('dragleave', e => handleDragLeave(e, col.id));
  el.addEventListener('drop',      e => handleDrop(e, col.id));

  el.querySelector('.add-task-btn').addEventListener('click', () => {
    openModal(null, col.id);
  });

  return el;
}

function renderCard(task) {
  const prio = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;

  const el = document.createElement('div');
  el.className = 'card';
  el.draggable = true;        // makes this element participate in HTML5 DnD
  el.dataset.taskId = task.id; // bridge between DOM and data

  const tagsHtml = (task.tags || []).slice(0, 3)
    .map(tag => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join('');

  const urgentIcon = task.priority === 'urgent'
    ? `<svg width="10" height="10" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>`
    : '';

  el.innerHTML = `
    <div class="card-top">
      <span class="priority-badge" style="color:${prio.color};background:${prio.bg}">
        ${urgentIcon}${prio.label}
      </span>
      ${tagsHtml}
    </div>
    <p class="card-title">${escapeHtml(task.title)}</p>
    ${task.description
      ? `<p class="card-desc">${escapeHtml(task.description)}</p>`
      : ''}
    <div class="card-footer">
      ${task.assignee
        ? `<div class="avatar" style="background:${stringToColor(task.assignee)}">${escapeHtml(task.assignee.slice(0, 2).toUpperCase())}</div>`
        : '<div></div>'}
      <svg class="drag-handle" width="12" height="12" fill="currentColor" viewBox="0 0 20 20">
        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"/>
      </svg>
    </div>
  `;

  el.addEventListener('dragstart', e => handleDragStart(e, task.id, task.columnId));
  el.addEventListener('dragend',   handleDragEnd);
  el.addEventListener('click',     () => openModal(task));

  return el;
}

function updateHeader() {
  const done = tasks.filter(t => t.columnId === 'done').length;
  document.getElementById('task-count').textContent =
    `${tasks.length} tasks · ${done} done`;
}
```

> **Why `escapeHtml()`?** When you write user-provided text into `innerHTML`, the browser interprets it as HTML. If a task title contains `<script>alert('xss')</script>`, it would execute. `escapeHtml` converts `<`, `>`, `&`, `"` into safe HTML entities (`&lt;`, `&gt;` etc.) so they render as text, not markup. This is an XSS (cross-site scripting) vulnerability that's easy to forget.

> **Why `el.dataset.taskId = task.id`?** `data-*` attributes are how you attach data to DOM elements in vanilla JS. When a drag event fires, you only get the DOM element — the `dataset` lets you look up which task it belongs to. In React, you'd use closure variables; here the DOM is the bridge.

> **Why `innerHTML = ''` then rebuild?** This is the simplest approach: wipe everything and redraw from the current data. The downside is that every DOM element is destroyed and re-created on every change, which is slower than React's virtual DOM diffing. For a board with a few dozen cards this is imperceptible, but at thousands of items you'd need a smarter approach.

---

## Step 4 — Drag and Drop (the hard part)

This is where vanilla JS diverges most from the React version. Instead of `@dnd-kit`, you use the browser's built-in **HTML5 Drag and Drop API**.

### How the HTML5 DnD API works

Five events matter:

| Event | Fires on | When |
|---|---|---|
| `dragstart` | the dragged element | drag begins |
| `dragenter` | a drop target | dragged element enters it |
| `dragover` | a drop target | dragged element moves over it (fires continuously) |
| `dragleave` | a drop target | dragged element leaves it |
| `drop` | a drop target | mouse released over a valid drop target |
| `dragend` | the dragged element | drag ends (drop or cancel) |

`dataTransfer` is the object that passes data from the drag source to the drop target. Think of it as a clipboard for a single drag operation.

### The `dragenter`/`dragleave` counter problem

When you drag over a column, `dragenter` fires. But if you then move over a **child element** (a card inside the column), `dragleave` fires on the column (you "left" it) and immediately `dragenter` fires again (you "entered" a child which is still inside the column). This causes the highlight to flicker on and off.

The fix: keep a counter per column. Increment on `dragenter`, decrement on `dragleave`. Only remove the highlight when the counter reaches zero — meaning you truly left the column entirely, not just moved to a child.

```
Move into column:  counter = 1  → highlight ON
Move over a card:  counter = 2  (dragenter on card fires first)
                   counter = 1  (dragleave on column fires)
                   → highlight still ON (counter > 0)
Move out of column: counter = 0 → highlight OFF
```

### The implementation

```js
// ── Drag and Drop ──────────────────────────────────────────

function handleDragStart(e, taskId, columnId) {
  drag.taskId = taskId;
  drag.startColumnId = columnId;

  // Store the task id in the drag payload
  e.dataTransfer.setData('text/plain', taskId);
  e.dataTransfer.effectAllowed = 'move';

  // requestAnimationFrame: we can't apply the .dragging class immediately
  // because the browser uses the element's current appearance to generate
  // the drag image. If we fade it before the screenshot, the drag image
  // also looks faded. Deferring one frame lets the browser capture first.
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-task-id="${taskId}"]`);
    if (el) el.classList.add('dragging');
  });
}

function handleDragEnd() {
  // Remove ghost styling from the original card
  const el = document.querySelector(`[data-task-id="${drag.taskId}"]`);
  if (el) el.classList.remove('dragging');

  // Remove all column highlights
  document.querySelectorAll('.column').forEach(col => col.classList.remove('drag-over'));

  // Remove the drop indicator line
  document.querySelectorAll('.drop-indicator').forEach(el => el.remove());

  // Reset state
  drag.taskId = null;
  drag.startColumnId = null;
  Object.keys(dragCounters).forEach(k => { dragCounters[k] = 0; });
}

function handleDragEnter(e, columnId) {
  e.preventDefault();
  dragCounters[columnId] = (dragCounters[columnId] || 0) + 1;
  // querySelector looks for the column element with this id
  document.querySelector(`.column[data-column-id="${columnId}"]`)
    ?.classList.add('drag-over');
}

function handleDragLeave(e, columnId) {
  dragCounters[columnId] = (dragCounters[columnId] || 0) - 1;
  if (dragCounters[columnId] <= 0) {
    document.querySelector(`.column[data-column-id="${columnId}"]`)
      ?.classList.remove('drag-over');
    dragCounters[columnId] = 0;
  }
}

function handleDragOver(e, columnId) {
  // THIS LINE IS REQUIRED. Without it, the browser treats the element as
  // a non-drop-target and the 'drop' event will never fire.
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  // Remove existing indicator
  document.querySelectorAll('.drop-indicator').forEach(el => el.remove());

  // Find what card the mouse is directly over
  const cardEl = e.target.closest('.card');

  if (cardEl && cardEl.dataset.taskId !== drag.taskId) {
    // Determine if mouse is in the top or bottom half of the hovered card
    const rect = cardEl.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;

    const indicator = document.createElement('div');
    indicator.className = 'drop-indicator';

    if (e.clientY < midpoint) {
      // Insert indicator BEFORE the card
      cardEl.parentNode.insertBefore(indicator, cardEl);
    } else {
      // Insert indicator AFTER the card
      cardEl.parentNode.insertBefore(indicator, cardEl.nextSibling);
    }
  }
}

function handleDrop(e, columnId) {
  e.preventDefault();
  const taskId = e.dataTransfer.getData('text/plain');
  if (!taskId) return;

  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  // Find the drop indicator to know the insertion position
  const indicator = document.querySelector('.drop-indicator');

  if (indicator) {
    // The card after the indicator is where we insert before
    const nextCard = indicator.nextElementSibling;
    const nextTaskId = nextCard?.dataset?.taskId;

    // Remove the dragged task from wherever it currently is
    tasks = tasks.filter(t => t.id !== taskId);

    if (nextTaskId) {
      const idx = tasks.findIndex(t => t.id === nextTaskId);
      tasks.splice(idx, 0, { ...task, columnId });
    } else {
      // No card after indicator — append to end of column
      tasks.push({ ...task, columnId });
    }
  } else {
    // Dropped on empty column space — append
    tasks = tasks.filter(t => t.id !== taskId);
    tasks.push({ ...task, columnId });
  }

  saveTasks();
  render();
}
```

> **Why `e.preventDefault()` in `dragover` (not `drop`)?** This is the single biggest DnD gotcha. The browser's default behavior for `dragover` is to *deny* the drop. Calling `preventDefault()` on `dragover` is how you signal "this is a valid drop target, allow it." Without it, the cursor shows a 🚫 and `drop` never fires, no matter what you do in the `drop` handler.

> **Why `requestAnimationFrame` in `dragstart`?** When `dragstart` fires, the browser has already taken a screenshot of the element to use as the drag image. If you add `.dragging` (which sets `opacity: 0.35`) immediately, the drag image also looks faded. Wrapping the class-add in `requestAnimationFrame` defers it until after the screenshot, so the drag image looks normal and only the original card fades.

> **Why the drop indicator approach for reordering?** We need to show the user *exactly* where the card will land. During `dragover`, we check if the mouse is in the top or bottom half of the card being hovered, then insert a visible line element (`.drop-indicator`) at that position. On `drop`, we read the DOM to find what's after that indicator and insert the task data at that position. The DOM is acting as the source of truth for the intended insertion index.

---

## Step 5 — Modal

```js
// ── Modal ──────────────────────────────────────────────────

function openModal(task = null, defaultColumnId = 'todo') {
  modal.isOpen = true;
  modal.task = task;
  modal.defaultColumnId = defaultColumnId;

  // Populate form fields
  document.getElementById('field-title').value       = task?.title ?? '';
  document.getElementById('field-from').value        = task?.from ?? '';
  document.getElementById('field-desc').value        = task?.description ?? '';
  document.getElementById('field-tags').value        = task?.tags?.join(', ') ?? '';
  document.getElementById('field-assignee').value    = task?.assignee ?? '';

  document.getElementById('modal-title').textContent = task ? 'Edit task' : 'New task';
  document.getElementById('modal-save').textContent  = task ? 'Save changes' : 'Create task';

  renderPriorityButtons(task?.priority ?? 'medium');
  renderColumnButtons(task?.columnId ?? defaultColumnId);
  renderDeleteArea(task);

  // Update save button color to match selected column
  updateSaveBtnColor(task?.columnId ?? defaultColumnId);

  document.getElementById('modal-backdrop').classList.remove('hidden');
  document.body.style.overflow = 'hidden'; // prevent background scroll
  document.getElementById('field-title').focus();
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
  document.body.style.overflow = '';
  modal.isOpen = false;
  modal.task = null;
}

function renderPriorityButtons(selected) {
  const container = document.getElementById('priority-btns');
  container.innerHTML = '';

  Object.entries(PRIORITY_CONFIG).forEach(([key, cfg]) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = cfg.label;
    btn.dataset.value = key;
    btn.style.color = cfg.color;

    const activate = () => {
      container.querySelectorAll('.choice-btn').forEach(b => {
        b.style.background = '';
        b.style.borderColor = '';
      });
      btn.style.background = cfg.bg;
      btn.style.borderColor = cfg.color + '44';
    };

    if (key === selected) activate();
    btn.addEventListener('click', activate);
    container.appendChild(btn);
  });
}

function renderColumnButtons(selected) {
  const container = document.getElementById('column-btns');
  container.innerHTML = '';

  COLUMNS.forEach(col => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.dataset.value = col.id;
    btn.innerHTML = `<span class="col-dot-sm" style="background:${col.color}"></span>${col.title}`;

    const activate = () => {
      container.querySelectorAll('.choice-btn').forEach(b => {
        b.style.color = '';
        b.style.background = '';
        b.style.borderColor = '';
      });
      btn.style.color = col.color;
      btn.style.background = col.color + '18';
      btn.style.borderColor = col.color + '44';
      updateSaveBtnColor(col.id);
    };

    if (col.id === selected) activate();
    btn.addEventListener('click', activate);
    container.appendChild(btn);
  });
}

function updateSaveBtnColor(columnId) {
  const col = COLUMNS.find(c => c.id === columnId);
  const btn = document.getElementById('modal-save');
  if (col) btn.style.background = col.color;
}

function renderDeleteArea(task) {
  const area = document.getElementById('delete-area');
  area.innerHTML = '';
  if (!task) return;

  const btn = document.createElement('button');
  btn.className = 'btn-delete';
  btn.textContent = 'Delete';
  let confirming = false;

  btn.addEventListener('click', () => {
    if (!confirming) {
      confirming = true;
      btn.textContent = 'Sure? Click again to confirm';
      btn.style.color = '#f87171';
      // Auto-reset after 3s if not confirmed
      setTimeout(() => {
        if (confirming) {
          confirming = false;
          btn.textContent = 'Delete';
          btn.style.color = '';
        }
      }, 3000);
    } else {
      deleteTask(task.id);
      closeModal();
    }
  });

  area.appendChild(btn);
}

function handleSave() {
  const title = document.getElementById('field-title').value.trim();
  if (!title) return;

  const priority = document.querySelector('#priority-btns .choice-btn[style*="background"]')?.dataset.value ?? 'medium';
  const columnId = document.querySelector('#column-btns .choice-btn[style*="background"]')?.dataset.value ?? 'todo';

  const data = {
    title,
    description: document.getElementById('field-desc').value.trim(),
    from:        document.getElementById('field-from').value.trim(),
    priority,
    columnId,
    tags:      document.getElementById('field-tags').value
                 .split(',').map(t => t.trim()).filter(Boolean),
    assignee:  document.getElementById('field-assignee').value.trim().toUpperCase().slice(0, 3),
  };

  if (modal.task) {
    updateTask({ ...data, id: modal.task.id });
  } else {
    addTask(data);
  }

  closeModal();
}
```

---

## Step 6 — Theme

```js
// ── Theme ──────────────────────────────────────────────────

const SUN_ICON = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>`;
const MOON_ICON = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>`;

function setTheme(isDark) {
  document.documentElement.classList.toggle('dark', isDark);
  localStorage.setItem('taskboard-theme', isDark ? 'dark' : 'light');
  document.getElementById('theme-btn').innerHTML = isDark ? SUN_ICON : MOON_ICON;
}

function toggleTheme() {
  setTheme(!document.documentElement.classList.contains('dark'));
}

function initTheme() {
  const isDark = localStorage.getItem('taskboard-theme') !== 'light';
  setTheme(isDark);
}
```

---

## Step 7 — Utility functions

```js
// ── Utilities ──────────────────────────────────────────────

// Prevent XSS when inserting user text into innerHTML
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Same deterministic color from initials as the React version
function stringToColor(str) {
  const colors = [
    '#6366f1','#8b5cf6','#ec4899','#f43f5e',
    '#f97316','#eab308','#22c55e','#06b6d4',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}
```

---

## Step 8 — Init

Wire everything up and kick off the first render.

```js
// ── Init ───────────────────────────────────────────────────

function init() {
  initTheme();
  render();

  // Header buttons
  document.getElementById('theme-btn').addEventListener('click', toggleTheme);
  document.getElementById('new-task-btn').addEventListener('click', () => openModal());

  // Modal buttons
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', handleSave);

  // Click outside modal = close
  document.getElementById('modal-backdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (!modal.isOpen) return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave();
  });
}

init();
```

---

## How it all connects

```
localStorage
    ↕  (loadTasks on init, saveTasks after every mutation)
tasks[]  ← the single source of truth
    ↓
render()
    ├── renderColumn() × 5
    │       └── renderCard() × n  (attaches dragstart/dragend/click handlers)
    │       └── DnD handlers on column (dragover/dragenter/dragleave/drop)
    └── updateHeader()

User drags card
    dragstart  → stores taskId in drag{} + dataTransfer
    dragover   → preventDefault (allows drop) + moves drop indicator
    dragenter  → increments counter + highlights column
    dragleave  → decrements counter + maybe removes highlight
    drop       → reads indicator position, splices tasks[], saveTasks(), render()
    dragend    → cleanup (always fires, even on cancel)

User clicks card  → openModal(task)
User saves modal  → addTask() or updateTask() → saveTasks() → render()
User deletes      → deleteTask() → saveTasks() → render()
```

---

## Key differences vs the React version — summarised

**Rendering:** React diffs a virtual DOM and surgically updates only what changed. Here, `render()` wipes `board.innerHTML` and rebuilds everything. Simpler to reason about, but every task edit recreates every column and card even if 99% of them didn't change.

**State:** React's `useState` triggers re-renders automatically when data changes. Here, you call `render()` manually — it's explicit, but you must remember to do it after every mutation.

**Drag and drop:** `@dnd-kit` wraps the browser's Pointer Events API, gives you smooth animations, accessibility, and handles the `dragenter`/`dragleave` flicker problem automatically. The native HTML5 DnD API is simpler to set up but rougher — you handle the counter problem yourself, the browser-generated drag image is harder to customise, and there are no built-in smooth reorder animations.

**Security:** React's JSX auto-escapes values. When you write `{task.title}` in JSX, React treats it as text, never HTML. With `innerHTML` you must escape manually — if you forget `escapeHtml()`, any task title containing `<` or `>` can break the layout or execute arbitrary scripts.
