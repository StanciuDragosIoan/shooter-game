# How It Works

## What it is

A Kanban-style task management board built with Next.js, backed by Supabase (Postgres), with drag-and-drop support.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14+ (App Router) |
| Database | Supabase (Postgres) via `@supabase/supabase-js` |
| Drag & drop | `@dnd-kit/core` + `@dnd-kit/sortable` |
| Styling | Tailwind CSS + CSS custom properties for theming |
| Fonts | Geist Sans / Geist Mono (Google Fonts) |

---

## File structure

```
app/
├── layout.tsx          # Root layout, Geist fonts, dark/light theme flash prevention
├── page.tsx            # Entry point — just renders <Board />
├── globals.css         # CSS variables for theming (--bg-board, --text-hi, etc.)
├── types/index.ts      # Task/ColumnType interfaces + COLUMNS config + PRIORITY_CONFIG
├── lib/supabase.ts     # Supabase client (reads env vars)
└── components/
    ├── Board.tsx       # Main component — state owner, Supabase CRUD, DnD context
    ├── Column.tsx      # A single board column, droppable + sortable context
    ├── TaskCard.tsx    # Individual task card, sortable + drag overlay variant
    └── TaskModal.tsx   # Create/edit task form (title, description, priority, tags, assignee)
```

---

## Data model

### `Task`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | UUID, generated client-side via `crypto.randomUUID()` |
| `title` | `string` | Required |
| `description` | `string` | Optional |
| `from` | `string` | Who commissioned the task |
| `priority` | `"low" \| "medium" \| "high" \| "urgent"` | |
| `tags` | `string[]` | |
| `assignee` | `string` | Up to 3-char initials |
| `columnId` | `string` | One of: `backlog`, `todo`, `in-progress`, `review`, `done` |

### `ColumnType`

| Field | Type |
|---|---|
| `id` | `string` |
| `title` | `string` |
| `color` | `string` (hex) |

### Supabase table (`tasks`)

The DB uses snake_case column names. `Board.tsx` maps between them on every read and write:

| DB column | Frontend field |
|---|---|
| `id` | `id` |
| `title` | `title` |
| `column_id` | `columnId` |
| `description` | `description` |
| `priority` | `priority` |
| `tags` | `tags` |
| `assignee` | `assignee` |
| `from` | `from` |

---

## Component breakdown

### `Board.tsx` — state owner

The root client component. Responsible for:

- **Loading** all tasks from Supabase on mount (`useEffect` → `supabase.from("tasks").select("*")`)
- **CRUD operations**: `addTask`, `updateTask`, `deleteTask` — each calls Supabase and syncs local React state from the DB response
- **Drag-and-drop context**: wraps everything in `<DndContext>` and wires up the three drag handlers
- **Modal state**: controls whether `<TaskModal>` is open and whether it's in create or edit mode
- **Theme toggle**: reads/writes `localStorage` key `taskboard-theme`, toggles the `dark` class on `<html>`

### `Column.tsx` — droppable container

Each of the 5 columns (`backlog`, `todo`, `in-progress`, `review`, `done`). Responsible for:

- Registering itself as a **droppable zone** via `useDroppable({ id: column.id })`
- Wrapping its task list in `<SortableContext>` so cards can be reordered within the column
- Glowing with its column color when a card is dragged over it (`isOver` flag)
- Rendering an "Add task" button that opens the modal pre-filled with this column

### `TaskCard.tsx` — sortable card

Each individual task. Responsible for:

- Registering as **sortable** via `useSortable({ id: task.id })`, which provides transform/transition CSS for smooth reordering
- Rendering priority badge, tags (up to 3), title, description (clamped to 2 lines), and assignee avatar
- Assignee avatar color is derived deterministically from the initials string via `stringToColor()`
- When `overlay={true}` (used in `<DragOverlay>`): renders without sortable hooks, slightly rotated, with a drag shadow — this is the "ghost" card that follows the cursor

### `TaskModal.tsx` — create / edit form

A full-screen backdrop modal. Responsible for:

- Controlled form state for all task fields
- Handles both **create** (no `task` prop) and **edit** (receives existing `task`) — `onSave` receives either `Task` or `Omit<Task, "id">` accordingly
- Two-step delete confirmation (`confirmDelete` state)
- Keyboard shortcuts: `Esc` to close, `⌘ Enter` to save
- Locks body scroll while open

---

## Drag-and-drop flow

```
User grabs card
    ↓
handleDragStart   → stores active task + records starting columnId in a ref
    ↓
handleDragOver    → optimistically moves task to new column in local state
   (fires many times as card moves over columns/cards)
    ↓
handleDragEnd     → compares target column against the ref'd start column
                    if different → calls updateTask() to persist to Supabase
                    always       → clears activeTask (hides DragOverlay)
```

The `dragStartColumnRef` ref (not state) is used in `handleDragEnd` because `handleDragOver` has already mutated local state by the time `handleDragEnd` fires — comparing against `task.columnId` at that point would always show them as equal.

---

## Theming

CSS custom properties defined in `globals.css` drive all colors (`--bg-board`, `--bg-col`, `--bg-card`, `--text-hi`, `--text-lo`, `--border`, etc.). The `dark` class on `<html>` switches the active variable set.

To prevent a flash of the wrong theme on load, `layout.tsx` injects an inline `<script>` that runs synchronously before the first paint, reading `localStorage` and applying/removing the `dark` class before React hydrates.

---

## Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon/public API key |

Both must be set in `.env.local` for the app to connect to the database.
