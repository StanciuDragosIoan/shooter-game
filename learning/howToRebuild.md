# How to Rebuild TaskBoard from Scratch

This guide walks you through rebuilding the app step by step, explaining **why** each piece exists so you understand the architecture, not just the code.

---

## What you're building

A Kanban board with 5 fixed columns (Backlog → Done), drag-and-drop cards, a create/edit modal, dark/light theme, and a Supabase Postgres backend.

---

## Step 1 — Create the Next.js project

```bash
npx create-next-app@latest tasks-board --typescript --tailwind --app --no-src-dir --no-eslint
cd tasks-board
```

When asked, choose the App Router (default). The `--app` flag gives you the `app/` directory structure.

Then install the extra dependencies:

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities @supabase/supabase-js
```

- **@dnd-kit** — drag-and-drop. Three packages: `core` (context + events), `sortable` (reordering within a list), `utilities` (CSS transform helpers)
- **@supabase/supabase-js** — Supabase client for reading/writing the database

### ⚠️ Important: upgrade to Tailwind v4

`create-next-app` installs **Tailwind v3** by default. This project uses **Tailwind v4**, which has a completely different syntax. If you skip this step, the `globals.css` will silently do nothing and the entire UI will be broken.

```bash
npm install tailwindcss@^4 @tailwindcss/postcss@^4
```

Then replace `postcss.config.mjs` with:

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

Also **delete `tailwind.config.ts`** (or `.js`) if it exists — Tailwind v4 does not use a config file.

**v3 vs v4 differences that affect this project:**

| | Tailwind v3 | Tailwind v4 |
|---|---|---|
| CSS entry | `@tailwind base/components/utilities` | `@import "tailwindcss"` |
| Dark mode config | `darkMode: 'class'` in config file | `@custom-variant dark (...)` in CSS |
| Font theme | `extend.fontFamily` in config | `@theme inline { ... }` in CSS |
| PostCSS plugin | `tailwindcss` | `@tailwindcss/postcss` |

---

## Step 2 — Supabase setup

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. In the SQL editor, run this to create your tasks table:

```sql
create table tasks (
  id uuid primary key,
  title text not null,
  column_id text not null default 'todo',
  description text,
  priority text default 'medium',
  tags text[] default '{}',
  assignee text,
  "from" text,
  created_at timestamptz default now()
);
```

> **Why UUID as primary key with no default?** The app generates UUIDs client-side using `crypto.randomUUID()` before inserting. This is intentional — if you set a DB-side default (like `gen_random_uuid()`), you could skip the client-side generation, but generating it client-side means you know the ID immediately without waiting for the DB response.

3. From your project's **Settings → API**, copy:
   - `Project URL`
   - `anon public` key

4. Create `.env.local` at the project root:

```
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

> Variables prefixed `NEXT_PUBLIC_` are exposed to the browser. Safe for the anon key (it's public by design) but never put your service_role key here.

---

## Step 3 — Types and constants

Create `app/types/index.ts`. This file is the single source of truth for your data shapes and static config.

```ts
export type Priority = "low" | "medium" | "high" | "urgent";

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  tags: string[];
  assignee: string;
  columnId: string;
  from: string;
}

export interface ColumnType {
  id: string;
  title: string;
  color: string;
}

export const COLUMNS: ColumnType[] = [
  { id: "backlog",     title: "Backlog",     color: "#64748b" },
  { id: "todo",        title: "To Do",       color: "#38bdf8" },
  { id: "in-progress", title: "In Progress", color: "#a78bfa" },
  { id: "review",      title: "Review",      color: "#fbbf24" },
  { id: "done",        title: "Done",        color: "#34d399" },
];

export const PRIORITY_CONFIG: Record<
  Priority,
  { label: string; color: string; bg: string }
> = {
  low:    { label: "Low",    color: "#4ade80", bg: "rgba(74,222,128,0.12)"  },
  medium: { label: "Medium", color: "#fb923c", bg: "rgba(251,146,60,0.12)"  },
  high:   { label: "High",   color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  urgent: { label: "Urgent", color: "#e879f9", bg: "rgba(232,121,249,0.12)" },
};
```

> `COLUMNS` and `PRIORITY_CONFIG` are defined here so every component imports from one place. If you add a column or change a color, you do it here and it propagates everywhere.

---

## Step 4 — Supabase client

Create `app/lib/supabase.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
```

> A single exported client instance. Import it anywhere you need to query the DB. The `!` after each env var tells TypeScript "trust me, this won't be undefined" — make sure `.env.local` is set up or you'll get runtime errors.

---

## Step 5 — Global CSS and theming

Replace the contents of `app/globals.css`:

```css
@import "tailwindcss";

/* Class-based dark mode — toggled by adding .dark to <html> */
@custom-variant dark (&:where(.dark, .dark *));

@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

/* ── Theme tokens (light) ───────────────────────────── */
:root {
  --bg-board:       #eef0f8;
  --bg-col:         #ffffff;
  --bg-card:        #ffffff;
  --bg-card-hover:  #f5f5ff;

  --text-hi:        #12122a;
  --text-lo:        #5a5a80;
  --text-dim:       #9999b8;

  --border:         rgba(18, 18, 42, 0.08);
  --border-strong:  rgba(18, 18, 42, 0.18);

  --shadow-card:    0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.05);
  --shadow-drag:    0 12px 40px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.12);
}

/* ── Theme tokens (dark) ────────────────────────────── */
.dark {
  --bg-board:       #07070f;
  --bg-col:         #0e0e1c;
  --bg-card:        #161628;
  --bg-card-hover:  #1e1e32;

  --text-hi:        #e4e4f8;
  --text-lo:        #8888aa;
  --text-dim:       #55557a;

  --border:         rgba(255, 255, 255, 0.06);
  --border-strong:  rgba(255, 255, 255, 0.14);

  --shadow-card:    0 1px 3px rgba(0,0,0,0.5);
  --shadow-drag:    0 16px 48px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4);
}

/* ── Base ───────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; }

body {
  background-color: var(--bg-board);
  color: var(--text-hi);
  font-family: var(--font-geist-sans, system-ui, sans-serif);
  transition: background-color 0.25s ease, color 0.25s ease;
  -webkit-font-smoothing: antialiased;
}

/* ── Scrollbars ─────────────────────────────────────── */
::-webkit-scrollbar        { width: 6px; height: 6px; }
::-webkit-scrollbar-track  { background: transparent; }
::-webkit-scrollbar-thumb  { background: var(--border-strong); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-dim); }
```

> Instead of hardcoding colors in components, every color is a CSS variable. Switching theme is just toggling the `.dark` class on `<html>` — no React re-render needed for colors. `@custom-variant dark` tells Tailwind 4 to treat `.dark` as a class-based variant.

---

## Step 6 — Root layout

Replace `app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TaskBoard",
  description: "Drag-and-drop task management board",
};

// Runs synchronously before first paint — prevents flash of wrong theme
const themeScript = `
  (function() {
    var t = localStorage.getItem('taskboard-theme');
    if (t === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  })()
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
```

> **Why `suppressHydrationWarning`?** The inline script mutates the DOM (adds/removes `dark` class) before React hydrates. React would see a mismatch between server HTML and client DOM and throw a warning. Suppressing it here is intentional and safe.

> **Why an inline script instead of `useEffect`?** `useEffect` runs *after* paint. An inline `<script>` in `<head>` runs *before* paint, so there's no visible flash.

---

## Step 7 — Entry page

Replace `app/page.tsx`:

```tsx
import { Board } from "@/app/components/Board";

export default function Home() {
  return <Board />;
}
```

Just a thin wrapper. The page itself is a Server Component; `Board` declares `"use client"` and takes over from there.

---

## Step 8 — TaskCard component

Create `app/components/TaskCard.tsx`.

This is the individual draggable card. Build it before `Column` and `Board` since both depend on it.

```tsx
"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "@/app/types";
import { PRIORITY_CONFIG } from "@/app/types";

interface TaskCardProps {
  task: Task;
  onEdit?: () => void;
  overlay?: boolean; // true when rendered inside <DragOverlay>
}

export function TaskCard({ task, onEdit, overlay = false }: TaskCardProps) {
  const {
    attributes,   // aria attributes
    listeners,    // pointer/keyboard event handlers that start a drag
    setNodeRef,   // attach to DOM so dnd-kit can track position
    transform,    // x/y delta while dragging
    transition,   // CSS transition for smooth snap-back
    isDragging,   // true while this card is the active dragged item
  } = useSortable({ id: task.id });

  const prio = PRIORITY_CONFIG[task.priority];

  // Shared card content — same markup for both normal and overlay renders
  const cardContent = (
    <>
      {/* Priority badge + tags */}
      <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase"
          style={{ color: prio.color, background: prio.bg }}
        >
          {task.priority === "urgent" && (
            <svg className="w-2.5 h-2.5 mr-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          )}
          {prio.label}
        </span>
        {task.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="px-1.5 py-0.5 rounded text-[10px] font-medium"
            style={{ color: "var(--text-lo)", background: "var(--border)" }}
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Title */}
      <p className="text-sm font-medium leading-snug mb-1.5" style={{ color: "var(--text-hi)" }}>
        {task.title}
      </p>

      {/* Description (optional, clamped to 2 lines) */}
      {task.description && (
        <p className="text-xs leading-relaxed mb-3 line-clamp-2" style={{ color: "var(--text-lo)" }}>
          {task.description}
        </p>
      )}

      {/* Footer: assignee avatar */}
      <div className="flex items-center justify-between">
        {task.assignee ? (
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{ background: stringToColor(task.assignee), color: "#fff" }}
          >
            {task.assignee.slice(0, 2).toUpperCase()}
          </div>
        ) : (
          <div />
        )}
        <svg className="w-3 h-3 opacity-30" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </div>
    </>
  );

  // Overlay variant: shown following the cursor during drag.
  // No sortable hooks, slightly rotated, stronger shadow.
  if (overlay) {
    return (
      <div
        className="rounded-xl p-3 w-72 cursor-grabbing rotate-2"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-strong)",
          boxShadow: "var(--shadow-drag)",
        }}
      >
        {cardContent}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-card)",
        opacity: isDragging ? 0.35 : 1, // ghost effect on the original card
      }}
      {...attributes}
      {...listeners}
      onClick={onEdit}
      className="rounded-xl p-3 cursor-grab active:cursor-grabbing select-none transition-[background,border-color,box-shadow] duration-150 hover:border-[var(--border-strong)] hover:bg-[var(--bg-card-hover)]"
    >
      {cardContent}
    </div>
  );
}

// Deterministic color from initials string (so the same assignee always gets the same color)
function stringToColor(str: string): string {
  const colors = [
    "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
    "#f97316", "#eab308", "#22c55e", "#06b6d4",
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}
```

> **Why two render paths (`overlay` vs normal)?** During a drag, dnd-kit renders two things: the original card (faded, stays in place) and a `DragOverlay` (follows the cursor). The overlay can't use `useSortable` hooks — it's outside the sortable context — so it just renders the markup without any dnd wiring.

#### The `if (overlay)` block — explained

When you drag a card, dnd-kit renders **two copies** of it at the same time:

```
Drag starts
    ├── original card  → normal render path, isDragging=true → opacity 0.35 (the "ghost")
    └── <DragOverlay>  → renders <TaskCard task={activeTask} overlay={true}> → follows cursor
```

**The original card** stays in its column. It fades to 35% opacity so you can see where the card *came from* while dragging.

**The overlay card** is what visually follows your cursor. It's rendered by `<DragOverlay>` in `Board.tsx`:

```tsx
<DragOverlay>
  {activeTask && <TaskCard task={activeTask} overlay />}
</DragOverlay>
```

The `if (overlay)` block returns early with a plain wrapper div — **no `ref`, no `{...listeners}`, no `{...attributes}`**. This is required, not optional. The `<DragOverlay>` exists outside the `<SortableContext>`, so dnd-kit has no record of this card. If you called `useSortable` on it normally and spread its props, dnd-kit would error trying to look up an id it can't find in any sortable list.

The `rotate-2` class (a 2° tilt) and `--shadow-drag` (stronger shadow) on the overlay are just visual polish to make it feel like a card being physically lifted off the board.

### TaskCard — deep dive

#### `useSortable` — what each value does

```ts
const {
  attributes,  // aria-* props: role="button", aria-roledescription, aria-describedby etc.
               // spread onto the div so screen readers announce it as draggable
  listeners,   // onPointerDown, onKeyDown — the actual event handlers that start a drag
               // spread onto the same div so any pointer interaction initiates dnd-kit's drag
  setNodeRef,  // callback ref — pass to the DOM element so dnd-kit knows which element to track
  transform,   // { x, y, scaleX, scaleY } delta from the card's resting position while dragging
  transition,  // CSS string like "transform 250ms ease" — animates the snap-back when dropped
  isDragging,  // boolean — true only on the *original* card while it's being dragged
} = useSortable({ id: task.id });
```

#### `CSS.Transform.toString(transform)`

While a card is being dragged, dnd-kit sets `transform` to the pixel offset from its original position (`{ x: 120, y: -40, scaleX: 1, scaleY: 1 }`). `CSS.Transform.toString` converts that to `translate3d(120px, -40px, 0) scaleX(1) scaleY(1)` so you can apply it directly as a `style`. When the card is not being dragged, `transform` is `null`, and `CSS.Transform.toString(null)` returns `undefined`, which React ignores.

#### Why `cardContent` is extracted as a variable

Both render paths (normal card and overlay) need the exact same inner markup — priority badge, tags, title, description, assignee avatar. Extracting it as `const cardContent = (...)` avoids duplicating that JSX. The two `return` statements then just differ in the wrapper `<div>` (one has sortable wiring, one doesn't).

#### The ghost effect

```tsx
opacity: isDragging ? 0.35 : 1
```

When you pick up a card, two things exist simultaneously: the original card (still in its column, faded to 35% opacity — this is the "ghost") and the `DragOverlay` card that follows your cursor. The ghost shows you where the card *was* and gives spatial context. Without it, the column would appear to collapse and you'd lose track of origin position.

#### Why `onClick` and `{...listeners}` can coexist

`listeners` spreads `onPointerDown` (not `onClick`). React treats these as separate events so they don't conflict. The `PointerSensor` is configured with `activationConstraint: { distance: 6 }` — a drag only starts after the pointer moves 6px. A short tap/click never triggers the drag, so `onClick={onEdit}` fires normally for clicks and the drag fires for sustained pointer movement.

#### Tags are capped at 3

```tsx
task.tags.slice(0, 3)
```

A task can have many tags but the card is compact (288px wide). Showing more than 3 tags would overflow or push the title down. The full list is visible in the edit modal.

#### `line-clamp-2` on description

The `line-clamp-2` Tailwind utility applies `-webkit-line-clamp: 2` which truncates the text after two lines with an ellipsis. Without this, a long description would make cards different heights and the column would look uneven.

#### `stringToColor` — deterministic avatar colors

```ts
function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}
```

The same initials (e.g. "AM") always produce the same hash, so the same person always gets the same avatar color across all cards and sessions. `(hash << 5) - hash` is equivalent to `hash * 31` — a common hash mixing step that spreads characters across the bit range. The result is modulo'd against the 8-color palette.

---

## Step 9 — Column component

Create `app/components/Column.tsx`.

```tsx
"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Task, ColumnType } from "@/app/types";
import { TaskCard } from "./TaskCard";

interface ColumnProps {
  column: ColumnType;
  tasks: Task[];
  onAddTask: () => void;
  onEditTask: (task: Task) => void;
}

export function Column({ column, tasks, onAddTask, onEditTask }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div
      ref={setNodeRef}
      className="flex flex-col w-72 shrink-0 rounded-2xl transition-all duration-200"
      style={{
        background: "var(--bg-col)",
        border: isOver ? `1px solid ${column.color}` : "1px solid var(--border)",
        // Glow effect when a card is dragged over this column
        boxShadow: isOver ? `0 0 0 1px ${column.color}44, 0 0 20px ${column.color}22` : undefined,
        padding: "12px",
      }}
    >
      {/* Column header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: column.color, boxShadow: `0 0 8px ${column.color}88` }}
          />
          <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-lo)" }}>
            {column.title}
          </h2>
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: "var(--border)", color: "var(--text-dim)" }}
          >
            {tasks.length}
          </span>
        </div>
      </div>

      {/* Subtle accent line under the header */}
      <div
        className="h-px mb-3 rounded-full opacity-40"
        style={{ background: `linear-gradient(90deg, ${column.color}, transparent)` }}
      />

      {/* Task list — SortableContext enables reordering within this column */}
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2 flex-1 min-h-[80px]">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onEdit={() => onEditTask(task)} />
          ))}
        </div>
      </SortableContext>

      {/* Add task button */}
      <button
        onClick={onAddTask}
        className="mt-3 w-full py-2 flex items-center justify-center gap-1 rounded-lg text-xs font-medium transition-all duration-150"
        style={{ color: "var(--text-dim)", border: "1px dashed var(--border)" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = column.color;
          e.currentTarget.style.borderColor = column.color + "66";
          e.currentTarget.style.background = column.color + "0d";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--text-dim)";
          e.currentTarget.style.borderColor = "var(--border)";
          e.currentTarget.style.background = "transparent";
        }}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
        </svg>
        Add task
      </button>
    </div>
  );
}
```

> **`useDroppable` vs `SortableContext`**: `useDroppable` registers the column as a drop target so a card dragged over empty space (not over another card) still has a valid drop destination. `SortableContext` handles the reordering animation between cards inside the same column. You need both.

---

## Step 10 — TaskModal component

Create `app/components/TaskModal.tsx`.

```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import type { Task, Priority } from "@/app/types";
import { COLUMNS, PRIORITY_CONFIG } from "@/app/types";

interface TaskModalProps {
  task?: Task;                                    // undefined = create mode
  defaultColumnId?: string;
  onSave: (task: Task | Omit<Task, "id">) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function TaskModal({ task, defaultColumnId, onSave, onDelete, onClose }: TaskModalProps) {
  const [title, setTitle]           = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [from, setFrom]             = useState(task?.from ?? "");
  const [priority, setPriority]     = useState<Priority>(task?.priority ?? "medium");
  const [tags, setTags]             = useState(task?.tags.join(", ") ?? "");
  const [assignee, setAssignee]     = useState(task?.assignee ?? "");
  const [columnId, setColumnId]     = useState(task?.columnId ?? defaultColumnId ?? "todo");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    document.body.style.overflow = "hidden"; // prevent background scroll
    return () => { document.body.style.overflow = ""; };
  }, []);

  function handleSave() {
    if (!title.trim()) return;
    const data = {
      title: title.trim(),
      description: description.trim(),
      from: from.trim(),
      priority,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      assignee: assignee.trim().toUpperCase().slice(0, 3),
      columnId,
    };
    // If task exists, pass back with id (edit). Otherwise omit id (create).
    onSave(task ? { ...data, id: task.id } : data);
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose(); // click outside modal = close
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave();
  }

  const colConfig = COLUMNS.find((c) => c.id === columnId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6 flex flex-col gap-4"
        style={{
          background: "var(--bg-col)",
          border: "1px solid var(--border-strong)",
          boxShadow: "var(--shadow-drag)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: "var(--text-hi)" }}>
            {task ? "Edit task" : "New task"}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5" style={{ color: "var(--text-dim)" }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Title field */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-lo)" }}>
            Title <span style={{ color: "#f87171" }}>*</span>
          </label>
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-hi)" }}
          />
        </div>

        {/* From field */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-lo)" }}>
            From
          </label>
          <input
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="Who commissioned this task?"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-hi)" }}
          />
        </div>

        {/* Description field */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-lo)" }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add more context…"
            rows={3}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-hi)" }}
          />
        </div>

        {/* Priority + Column selectors */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-lo)" }}>Priority</label>
            <div className="grid grid-cols-2 gap-1">
              {(Object.entries(PRIORITY_CONFIG) as [Priority, typeof PRIORITY_CONFIG[Priority]][]).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setPriority(key)}
                  className="px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                  style={{
                    color: cfg.color,
                    background: priority === key ? cfg.bg : "var(--bg-card)",
                    border: `1px solid ${priority === key ? cfg.color + "44" : "var(--border)"}`,
                  }}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-lo)" }}>Column</label>
            <div className="flex flex-col gap-1">
              {COLUMNS.map((col) => (
                <button
                  key={col.id}
                  onClick={() => setColumnId(col.id)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium text-left transition-all"
                  style={{
                    background: columnId === col.id ? col.color + "18" : "var(--bg-card)",
                    border: `1px solid ${columnId === col.id ? col.color + "44" : "var(--border)"}`,
                    color: columnId === col.id ? col.color : "var(--text-lo)",
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: col.color }} />
                  {col.title}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tags + Assignee */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-lo)" }}>
              Tags <span className="font-normal opacity-60">(comma separated)</span>
            </label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="ui, backend, urgent"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-hi)" }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-lo)" }}>
              Assignee <span className="font-normal opacity-60">(initials)</span>
            </label>
            <input
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              placeholder="AM"
              maxLength={3}
              className="w-full px-3 py-2 rounded-lg text-sm uppercase outline-none"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-hi)" }}
            />
          </div>
        </div>

        {/* Actions row */}
        <div className="flex items-center justify-between pt-1">
          {/* Delete (two-step confirm) */}
          <div>
            {onDelete && !confirmDelete && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-xs font-medium px-3 py-1.5 rounded-lg"
                style={{ color: "var(--text-dim)" }}
              >
                Delete
              </button>
            )}
            {confirmDelete && (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: "#f87171" }}>Sure?</span>
                <button
                  onClick={onDelete}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{ color: "#f87171", background: "rgba(248,113,113,0.1)" }}
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ color: "var(--text-dim)" }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Cancel + Save */}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-sm px-4 py-2 rounded-xl"
              style={{ color: "var(--text-lo)", border: "1px solid var(--border)" }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!title.trim()}
              className="text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: colConfig?.color ?? "#a78bfa",
                color: "#fff",
                boxShadow: title.trim() ? `0 0 16px ${(colConfig?.color ?? "#a78bfa") + "66"}` : undefined,
              }}
            >
              {task ? "Save changes" : "Create task"}
            </button>
          </div>
        </div>

        <p className="text-[10px] text-center" style={{ color: "var(--text-dim)" }}>
          ⌘ Enter to save · Esc to cancel
        </p>
      </div>
    </div>
  );
}
```

> **Why `onSave` accepts `Task | Omit<Task, "id">`?** In create mode there's no `id` yet — `Board` will generate one before inserting. In edit mode we already have an `id`, so we pass the full `Task`. The parent (`Board`) checks `"id" in taskData` to decide which path to take.

---

## Step 11 — Board component (main)

Create `app/components/Board.tsx`. This is the most complex file — it owns all state and coordinates the other components.

```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import {
  DndContext, DragEndEvent, DragOverEvent, DragOverlay,
  DragStartEvent, PointerSensor, KeyboardSensor,
  useSensor, useSensors, closestCorners,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { Task } from "@/app/types";
import { COLUMNS } from "@/app/types";
import { Column } from "./Column";
import { TaskCard } from "./TaskCard";
import { TaskModal } from "./TaskModal";
import { supabase } from "../lib/supabase";

type ModalState =
  | { open: false }
  | { open: true; task?: Task; defaultColumnId?: string };

export function Board() {
  const [tasks, setTasks]   = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [isDark, setIsDark] = useState(true);
  const [modal, setModal]   = useState<ModalState>({ open: false });

  // Ref (not state) — needed in handleDragEnd after handleDragOver already
  // mutated local task state. Using state here would read a stale value.
  const dragStartColumnRef = useRef<string | null>(null);

  // ── Load tasks from Supabase on mount ──────────────────
  useEffect(() => {
    async function loadTasks() {
      setLoading(true);
      const { data, error } = await supabase.from("tasks").select("*");
      if (error) { console.error("Load error:", error); setLoading(false); return; }
      setTasks(
        (data ?? []).map((t) => ({
          id:          t.id,
          title:       t.title,
          columnId:    t.column_id,
          description: t.description ?? "",
          priority:    t.priority ?? "medium",
          tags:        t.tags ?? [],
          assignee:    t.assignee ?? "",
          from:        t.from ?? "",
        }))
      );
      setLoading(false);
    }
    loadTasks();
  }, []);

  // ── Sync theme state with what the layout script already applied ──
  useEffect(() => {
    const stored = localStorage.getItem("taskboard-theme");
    setIsDark(stored !== "light");
  }, []);

  // ── CRUD ────────────────────────────────────────────────

  async function addTask(task: Omit<Task, "id">) {
    const payload = {
      id:          crypto.randomUUID(), // generate UUID client-side
      title:       task.title,
      column_id:   task.columnId,
      description: task.description ?? "",
      priority:    task.priority ?? "medium",
      tags:        task.tags ?? [],
      assignee:    task.assignee ?? null,
    };
    const { data, error } = await supabase.from("tasks").insert(payload).select().single();
    if (error) { console.error("Insert error:", error); return; }
    setTasks((prev) => [...prev, {
      id: data.id, title: data.title, columnId: data.column_id,
      description: data.description, priority: data.priority,
      tags: data.tags, assignee: data.assignee, from: data.from,
    }]);
  }

  async function updateTask(updated: Task) {
    const { data, error } = await supabase
      .from("tasks")
      .update({
        title: updated.title, column_id: updated.columnId,
        description: updated.description, priority: updated.priority,
        tags: updated.tags, assignee: updated.assignee,
      })
      .eq("id", updated.id)
      .select().single();
    if (error) { console.error("Update error:", error); return; }
    setTasks((prev) => prev.map((t) =>
      t.id === updated.id
        ? { id: data.id, title: data.title, columnId: data.column_id,
            description: data.description, priority: data.priority,
            tags: data.tags, assignee: data.assignee, from: data.from }
        : t
    ));
  }

  async function deleteTask(id: string) {
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) { console.error("Delete error:", error); return; }
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  // ── Theme ───────────────────────────────────────────────

  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("taskboard-theme", next ? "dark" : "light");
  }

  // ── DnD sensors ─────────────────────────────────────────
  // distance:6 means the drag only starts after moving 6px — prevents
  // accidental drags when clicking to open the edit modal.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ── DnD handlers ────────────────────────────────────────

  function handleDragStart({ active }: DragStartEvent) {
    const task = tasks.find((t) => t.id === String(active.id)) ?? null;
    setActiveTask(task);
    dragStartColumnRef.current = task?.columnId ?? null; // remember where drag started
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    // Called continuously as the card moves. Update local state immediately
    // (optimistic) so the UI responds in real time.
    if (!over) return;
    const activeId = String(active.id);
    const overId   = String(over.id);
    if (activeId === overId) return;

    const activeTask = tasks.find((t) => t.id === activeId);
    if (!activeTask) return;

    // `over` can be either a column id or another task id — resolve to a column
    const overColumn     = COLUMNS.find((c) => c.id === overId);
    const overTask       = tasks.find((t) => t.id === overId);
    const targetColumnId = overColumn?.id ?? overTask?.columnId;

    if (targetColumnId && activeTask.columnId !== targetColumnId) {
      setTasks((prev) =>
        prev.map((t) => t.id === activeId ? { ...t, columnId: targetColumnId } : t)
      );
    }
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const startColumn = dragStartColumnRef.current;
    dragStartColumnRef.current = null;
    setActiveTask(null);
    if (!over) return;

    const activeId = String(active.id);
    const overId   = String(over.id);

    const draggedTask    = tasks.find((t) => t.id === activeId);
    if (!draggedTask) return;

    const overColumn     = COLUMNS.find((c) => c.id === overId);
    const overTask       = tasks.find((t) => t.id === overId);
    const targetColumnId = overColumn?.id ?? overTask?.columnId;
    if (!targetColumnId) return;

    // Compare against startColumn, not draggedTask.columnId — handleDragOver
    // already updated local state so the column looks changed even if it wasn't.
    if (startColumn !== targetColumnId) {
      updateTask({ ...draggedTask, columnId: targetColumnId });
    }
  }

  // ── Modal helpers ────────────────────────────────────────

  function openNewTask(defaultColumnId?: string) {
    setModal({ open: true, defaultColumnId });
  }

  function openEditTask(task: Task) {
    setModal({ open: true, task });
  }

  function handleSave(taskData: Task | Omit<Task, "id">) {
    if ("id" in taskData) updateTask(taskData);
    else addTask(taskData);
    setModal({ open: false });
  }

  function handleDelete(id: string) {
    deleteTask(id);
    setModal({ open: false });
  }

  // ── Render ───────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--bg-board)" }}>

      {/* Header */}
      <header
        className="flex items-center justify-between px-6 py-4 shrink-0"
        style={{ background: "var(--bg-col)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
            style={{ background: "linear-gradient(135deg, #a78bfa, #38bdf8)" }}
          >
            T
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight" style={{ color: "var(--text-hi)" }}>
              TaskBoard
            </h1>
            <p className="text-[10px]" style={{ color: "var(--text-dim)" }}>
              {tasks.length} tasks · {tasks.filter((t) => t.columnId === "done").length} done
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-lo)" }}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          {/* New task */}
          <button
            onClick={() => openNewTask()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #8b5cf6, #38bdf8)" }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            New Task
          </button>
        </div>
      </header>

      {/* Board */}
      <DndContext
        id="taskboard-dnd"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 p-6 overflow-x-auto flex-1 items-start">
          {COLUMNS.map((column) => (
            <Column
              key={column.id}
              column={column}
              tasks={tasks.filter((t) => t.columnId === column.id)}
              onAddTask={() => openNewTask(column.id)}
              onEditTask={openEditTask}
            />
          ))}
        </div>

        {/* The card that follows the cursor during drag */}
        <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.18,0.67,0.6,1.22)" }}>
          {activeTask && <TaskCard task={activeTask} overlay />}
        </DragOverlay>
      </DndContext>

      {/* Modal */}
      {modal.open && (
        <TaskModal
          task={modal.task}
          defaultColumnId={modal.defaultColumnId}
          onSave={handleSave}
          onDelete={modal.task ? () => handleDelete(modal.task!.id) : undefined}
          onClose={() => setModal({ open: false })}
        />
      )}
    </div>
  );
}
```

---

## How data flows

```
Supabase DB
    ↕  (on mount: load all tasks)
Board.tsx  ← single source of truth for tasks[]
    ├── passes tasks filtered by columnId to each Column
    ├── Column passes each task to TaskCard
    ├── DragOverlay renders TaskCard with overlay=true
    └── TaskModal reads/writes via onSave / onDelete callbacks back to Board
```

The pattern is: **Board owns state, children receive props and fire callbacks.**

---

## How drag-and-drop works end to end

```
User grabs card
    ↓
handleDragStart
    → finds the Task object, stores it in activeTask (renders DragOverlay)
    → stores task.columnId in dragStartColumnRef (a ref, not state)

User moves card over columns/cards (fires many times)
    ↓
handleDragOver
    → resolves the "over" target to a column id
    → if column changed: updates task.columnId in local state immediately (optimistic)
    → Column/TaskCard re-render to show the card in the new position

User drops card
    ↓
handleDragEnd
    → compares targetColumnId against dragStartColumnRef.current
       (NOT against task.columnId — handleDragOver already changed that)
    → if actually moved to a different column: calls updateTask() → Supabase
    → clears activeTask (DragOverlay disappears)
```

---

## Build order summary

1. Supabase table + env vars
2. `app/types/index.ts` — data shapes and constants
3. `app/lib/supabase.ts` — DB client
4. `app/globals.css` — theme variables
5. `app/layout.tsx` — fonts, theme flash prevention
6. `app/page.tsx` — entry point
7. `app/components/TaskCard.tsx` — leaf component, no dependencies on other components
8. `app/components/Column.tsx` — depends on TaskCard
9. `app/components/TaskModal.tsx` — depends on types only
10. `app/components/Board.tsx` — depends on everything above
