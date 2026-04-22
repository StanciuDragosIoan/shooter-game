# How to Build a Basic Kanban Board (Vanilla JS)

This is the simplest possible version of the board. Three columns, cards with just a title, drag between columns, localStorage persistence. No modal, no reordering, no theme toggle.

The goal is to understand the core loop clearly before all the extra complexity is added on top.

---

## What you're building

```
[ Todo ]        [ In Progress ]    [ Done ]
  Card A           Card C
  Card B
  [+ Add]          [+ Add]          [+ Add]
```

- Click **+ Add** to type a new card inline
- Drag any card to a different column
- Refresh the page — cards are still there (localStorage)

That's it. ~80 lines of JS, ~100 lines of CSS.

---

## The core loop — understand this first

Everything in a vanilla JS app follows this pattern:

```
user does something
    → you update the data (tasks array)
    → you save to localStorage
    → you call render() to redraw the UI from scratch
```

There is no magic. No reactivity. You change data, then you manually redraw. Every single function ends with `saveTasks()` and `render()`.

---

## File structure

```
basic-board/
├── index.html
├── style.css
└── app.js
```

---

## Step 1 — index.html

Just a shell. The board is built entirely by JavaScript.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Basic Board</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>

  <header class="header">
    <div class="logo">T</div>
    <h1>TaskBoard</h1>
  </header>

  <!-- JavaScript fills this in -->
  <div id="board" class="board"></div>

  <script src="app.js"></script>
</body>
</html>
```

---

## Step 2 — style.css

```css
/* ── Reset ─────────────────────────────── */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* ── Base ──────────────────────────────── */
body {
  background: #07070f;
  color: #e4e4f8;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 15px;
  min-height: 100vh;
}

/* ── Header ────────────────────────────── */
.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 24px;
  height: 52px;
  background: #0e0e1c;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.logo {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: linear-gradient(135deg, #a78bfa, #38bdf8);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
}

h1 {
  font-size: 13px;
  font-weight: 700;
  color: #e4e4f8;
}

/* ── Board ─────────────────────────────── */
.board {
  display: flex;
  gap: 16px;
  padding: 24px;
  align-items: flex-start;
  overflow-x: auto;
}

/* ── Column ────────────────────────────── */
.column {
  width: 260px;
  flex-shrink: 0;
  background: #0e0e1c;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 14px;
  padding: 12px;
  /* Each column sets --col-color on itself so CSS can use it */
  transition: border-color 0.2s, box-shadow 0.2s;
}

/* Glow effect when a card is dragged over */
.column.drag-over {
  border-color: var(--col-color);
  box-shadow: 0 0 0 1px var(--col-color), 0 0 20px color-mix(in srgb, var(--col-color) 20%, transparent);
}

.col-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.col-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.col-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.col-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #8888aa;
}

.col-count {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 99px;
  background: rgba(255,255,255,0.06);
  color: #55557a;
}

.add-btn {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.06);
  background: transparent;
  color: #55557a;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s, border-color 0.15s;
  line-height: 1;
}

.add-btn:hover {
  color: var(--col-color);
  border-color: var(--col-color);
}

/* ── Cards ─────────────────────────────── */
.card-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 40px;
}

.card {
  background: #161628;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 13px;
  color: #e4e4f8;
  cursor: grab;
  user-select: none;
  transition: background 0.15s, border-color 0.15s, opacity 0.15s;
}

.card:hover {
  background: #1e1e32;
  border-color: rgba(255,255,255,0.14);
}

/* The original card fades while being dragged */
.card.dragging { opacity: 0.3; }

/* ── Inline add input ──────────────────── */
.add-input {
  width: 100%;
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.14);
  background: #161628;
  color: #e4e4f8;
  font-size: 13px;
  font-family: inherit;
  outline: none;
}

.add-input:focus {
  border-color: #a78bfa;
}
```

---

## Step 3 — app.js

Build it in four small pieces.

### 3.1 — Data

```js
// The three columns. Fixed — users can't add or remove columns.
const COLUMNS = [
  { id: 'todo',        title: 'Todo',        color: '#38bdf8' },
  { id: 'doing',       title: 'In Progress', color: '#a78bfa' },
  { id: 'done',        title: 'Done',        color: '#34d399' },
];

// All tasks. Loaded from localStorage on startup.
// Each task is just: { id, title, columnId }
let tasks = loadTasks();

// Which task is currently being dragged
let dragTaskId = null;
```

> **Why so few fields on a task?** On purpose. `{ id, title, columnId }` is the minimum needed for a working board. Once you understand how these three fields drive everything — rendering, dragging, persisting — adding more fields (priority, tags, assignee) is just repetition of the same pattern.

### 3.2 — localStorage

```js
function loadTasks() {
  const raw = localStorage.getItem('basic-board-tasks');
  return raw ? JSON.parse(raw) : [];
}

function saveTasks() {
  localStorage.setItem('basic-board-tasks', JSON.stringify(tasks));
}
```

> **The pattern:** `loadTasks` runs once at startup to populate `tasks`. `saveTasks` runs after every change. The data always lives in the JS variable `tasks`; localStorage is just the backup that survives page refresh.

### 3.3 — CRUD

```js
function addTask(title, columnId) {
  tasks.push({
    id: crypto.randomUUID(),
    title,
    columnId,
  });
  saveTasks();
  render();
}

function moveTask(taskId, newColumnId) {
  tasks = tasks.map(t =>
    t.id === taskId ? { ...t, columnId: newColumnId } : t
  );
  saveTasks();
  render();
}

function deleteTask(taskId) {
  tasks = tasks.filter(t => t.id !== taskId);
  saveTasks();
  render();
}
```

> **Every function ends the same way:** `saveTasks()` then `render()`. This is the core loop of vanilla JS UI. You will write this pair hundreds of times.

> **Why `tasks.map(...)` to update instead of finding and mutating?** `tasks.map` returns a brand new array where everything is the same except the one item you changed. This is safer than doing `task.columnId = newColumnId` directly on the object (mutating), because it avoids hard-to-track bugs where two variables point to the same object.

### 3.4 — Rendering

```js
function render() {
  const board = document.getElementById('board');
  board.innerHTML = '';  // wipe everything

  COLUMNS.forEach(col => {
    const colTasks = tasks.filter(t => t.columnId === col.id);
    board.appendChild(renderColumn(col, colTasks));
  });
}

function renderColumn(col, colTasks) {
  // Create the column element
  const el = document.createElement('div');
  el.className = 'column';
  el.dataset.columnId = col.id;
  el.style.setProperty('--col-color', col.color); // CSS can now use var(--col-color)

  el.innerHTML = `
    <div class="col-header">
      <div class="col-header-left">
        <span class="col-dot" style="background:${col.color}"></span>
        <span class="col-title">${col.title}</span>
        <span class="col-count">${colTasks.length}</span>
      </div>
      <button class="add-btn" title="Add card">+</button>
    </div>
    <div class="card-list"></div>
  `;

  // Render each card into the card-list
  const list = el.querySelector('.card-list');
  colTasks.forEach(task => list.appendChild(renderCard(task)));

  // "+" button — shows an inline input
  el.querySelector('.add-btn').addEventListener('click', () => {
    showAddInput(el, col.id);
  });

  // Drop zone events (explained in the DnD section)
  el.addEventListener('dragover',  handleDragOver);
  el.addEventListener('dragenter', handleDragEnter);
  el.addEventListener('dragleave', handleDragLeave);
  el.addEventListener('drop',      e => handleDrop(e, col.id));

  return el;
}

function renderCard(task) {
  const el = document.createElement('div');
  el.className = 'card';
  el.draggable = true;           // opt this element into HTML5 DnD
  el.dataset.taskId = task.id;   // attach the task id to the DOM element
  el.textContent = task.title;   // safe — textContent never parses HTML

  el.addEventListener('dragstart', e => {
    dragTaskId = task.id;
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
    requestAnimationFrame(() => el.classList.add('dragging'));
  });

  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    dragTaskId = null;
    document.querySelectorAll('.column').forEach(c => c.classList.remove('drag-over'));
  });

  // Double-click to delete
  el.addEventListener('dblclick', () => {
    if (confirm(`Delete "${task.title}"?`)) deleteTask(task.id);
  });

  return el;
}
```

> **Why `textContent` instead of `innerHTML` for the card title?** `textContent` always writes plain text — it never interprets HTML tags. `innerHTML` would, which means a task titled `<b>hello</b>` would render as **hello** (bold), and a task titled `<script>...` could execute code. For user-supplied text, always use `textContent` when you can.

> **Why `el.dataset.taskId = task.id`?** The DOM element is a visual thing — it has no direct connection to your data. `dataset` is how you attach your own data to it. When a drag event fires, you get the DOM element. `element.dataset.taskId` is how you find which task in your `tasks` array it represents.

> **Why `requestAnimationFrame` before adding `.dragging`?** The browser takes a screenshot of the card to use as the drag image the moment `dragstart` fires. If you immediately set `opacity: 0.3`, the drag image also looks faded. `requestAnimationFrame` defers the class one frame — after the screenshot is taken — so the drag image looks normal and only the original card fades.

### 3.5 — Inline add input

When the user clicks "+", an `<input>` appears at the bottom of the column. Pressing Enter saves the card; pressing Escape cancels.

```js
function showAddInput(columnEl, columnId) {
  // Don't show two inputs at once
  if (columnEl.querySelector('.add-input')) return;

  const input = document.createElement('input');
  input.className = 'add-input';
  input.type = 'text';
  input.placeholder = 'Card title…';
  columnEl.appendChild(input);
  input.focus();

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const title = input.value.trim();
      if (title) addTask(title, columnId);  // addTask calls render(), removing the input
      else input.remove();
    }
    if (e.key === 'Escape') {
      input.remove();
    }
  });

  // Click outside = cancel
  input.addEventListener('blur', () => input.remove());
}
```

> **Why does `addTask` remove the input automatically?** Because `addTask` calls `render()`, which does `board.innerHTML = ''` — wiping and rebuilding everything, including the column that has the input. The input disappears as a side effect of the full redraw.

### 3.6 — Drag and Drop

```js
// Track enter/leave per column to prevent highlight flickering
// (explained in detail in howToBuildPrototype.md)
const dragCounters = {};

function handleDragOver(e) {
  // REQUIRED — without this line, the 'drop' event never fires
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
  e.preventDefault();
  const col = e.currentTarget;
  const id = col.dataset.columnId;
  dragCounters[id] = (dragCounters[id] || 0) + 1;
  col.classList.add('drag-over');
}

function handleDragLeave(e) {
  const col = e.currentTarget;
  const id = col.dataset.columnId;
  dragCounters[id] = (dragCounters[id] || 0) - 1;
  if (dragCounters[id] <= 0) {
    col.classList.remove('drag-over');
    dragCounters[id] = 0;
  }
}

function handleDrop(e, columnId) {
  e.preventDefault();
  const taskId = e.dataTransfer.getData('text/plain');
  if (taskId) moveTask(taskId, columnId);
}
```

> **`e.currentTarget` vs `e.target`** — this is important. `e.target` is the exact element the mouse is over (could be a card, a span, anything inside the column). `e.currentTarget` is always the element the event listener is attached to — the column itself. You want `e.currentTarget` here because you need the column's id, not whatever child element the mouse happens to be over.

### 3.7 — Init

```js
render();
```

One line. That's the entire init. `render()` builds the board from `tasks`, which was already loaded from localStorage at the top of the file. There's nothing else to set up.

---

## The full picture

```
Page loads
    → tasks = loadTasks()     (read from localStorage)
    → render()                (build DOM from tasks)

User clicks "+"
    → showAddInput()          (append an <input> to the column)
    → user types + Enter
    → addTask(title, colId)   (push to tasks[])
    → saveTasks()             (write to localStorage)
    → render()                (rebuild DOM — input disappears, new card appears)

User drags card
    → dragstart               (store taskId, fade original card)
    → dragover × many         (preventDefault on each — keeps drop allowed)
    → dragenter/dragleave     (manage highlight with counter)
    → drop                    (read taskId, call moveTask)
    → moveTask(id, newColId)  (update tasks[], saveTasks(), render())
    → dragend                 (cleanup classes)

User double-clicks card
    → deleteTask(id)          (filter tasks[], saveTasks(), render())
```

---

## What's missing vs the full prototype — and why

| Feature | Why left out here |
|---|---|
| Within-column reordering | Requires tracking insertion position via a drop indicator — a separate concept on top of basic DnD |
| Modal | Just more DOM and state management — same patterns you already see here, more fields |
| Priority / tags / assignee | More fields on the task object — same render/save/load pattern repeated |
| Theme toggle | One more variable + a class on `<html>` — adds noise without teaching anything new |
| `dragenter`/`dragleave` counter explanation | Covered in `howToBuildPrototype.md` — understand this version first |

Once this version feels natural to rebuild from memory, add one feature at a time from the full prototype. Each addition is the same core loop: update data → save → render.
