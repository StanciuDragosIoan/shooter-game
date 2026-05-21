# Task 1 — What I Did & What I Learned

## What we built so far

A canvas with a dark background and a blue triangle (the player ship) drawn at the bottom center. The game loop is running — `update` and `draw` are called 60 times per second via `requestAnimationFrame`.

---

## Canvas setup

```js
const canvas = document.getElementById("game");
const canvasWidth = 480;
const canvasHeight = 400;
canvas.width = canvasWidth;
canvas.height = canvasHeight;
const ctx = canvas.getContext("2d");
```

**Key lessons:**
- `canvas.width` / `canvas.height` set the logical drawing size — use these
- `canvas.clientWidth` / `canvas.clientHeight` are read-only CSS layout values — do NOT use these to set size
- `ctx` is the 2D context — all drawing commands go through it
- Create `ctx` once at startup, reuse it everywhere — never recreate it inside `draw()`

---

## The coordinate system

The canvas origin `(0, 0)` is the **top-left corner**.
- x increases going **right**
- y increases going **down**

So `(240, 200)` on a 480×400 canvas is the center. `(0, 0)` is top-left. `(480, 400)` is bottom-right.

---

## Canvas 2D drawing — the methods

### Rectangles

```js
ctx.fillStyle = '#060616';   // set the color (must do this before painting)
ctx.fillRect(x, y, width, height);  // paint a filled rectangle
```

- `fillStyle` is just a setting — it doesn't draw anything on its own
- `fillRect` is what actually paints — always set `fillStyle` first
- `fillRect(0, 0, canvasWidth, canvasHeight)` fills the entire canvas — use this as the background every frame

### Paths (triangles, polygons, any custom shape)

Drawing a custom shape is a 6-step process:

```js
ctx.beginPath();              // 1. start a new shape (lift the pen)
ctx.moveTo(x, y);             // 2. place the pen at the first point (no line drawn)
ctx.lineTo(x, y);             // 3. draw a line to the next point
ctx.lineTo(x, y);             // 4. draw a line to the next point
ctx.closePath();              // 5. draw a line back to the start (closes the shape)
ctx.fillStyle = '#60a5fa';    // 6a. set the fill color
ctx.fill();                   // 6b. flood-fill the shape
```

Think of it like a pen on paper:
- `beginPath` = lift the pen, start fresh
- `moveTo` = put the pen down at a position, no mark yet
- `lineTo` = drag the pen to draw a line
- `closePath` = connect back to the start
- `fill` = paint inside the shape

### Drawing the player triangle

The player has `x, y` as its **center**, and `w, h` as its size.

```js
ctx.beginPath();
ctx.moveTo(player.x, player.y - player.h / 2);          // tip (top center)
ctx.lineTo(player.x + player.w / 2, player.y + player.h / 2);  // bottom-right
ctx.lineTo(player.x - player.w / 2, player.y + player.h / 2);  // bottom-left
ctx.closePath();
ctx.fillStyle = '#60a5fa';
ctx.fill();
```

Why center? Because the shape is symmetrical — you add/subtract half-width and half-height to get each corner. Also makes collision detection easier later.

**The pattern for each corner:**
- tip: same x as center, y shifted UP (`- h/2`)
- bottom-right: x shifted RIGHT (`+ w/2`), y shifted DOWN (`+ h/2`)
- bottom-left: x shifted LEFT (`- w/2`), y shifted DOWN (`+ h/2`)

---

## The game loop

```js
function update(now) {
    // all game logic goes here
}

function draw() {
    // all rendering goes here
}

function loop(now) {
    update(now);
    draw();
    requestAnimationFrame(loop);  // schedule the next frame
}

requestAnimationFrame(loop);  // boot — kick off the first frame
```

**Key lessons:**
- `requestAnimationFrame` fires ~60 times per second, before each screen redraw
- It passes a `now` timestamp (milliseconds) into your function automatically
- `loop` schedules itself — that's what makes it loop forever
- `draw()` must clear the canvas first every frame (the background `fillRect`) — otherwise old frames stack up
- Do NOT declare the same function twice — the second declaration overwrites the first silently

---

## Input — the keys object

```js
const keys = {};

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    keys[e.code] = true;
});

document.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});
```

**Key lessons:**
- `keys` is a scoreboard of what's currently held — `true` = pressed, `false`/`undefined` = not pressed
- `e.code` is the key name string: `'ArrowLeft'`, `'ArrowRight'`, `'Space'`, etc.
- `e.preventDefault()` for Space only — prevents the page from scrolling. Put it in `keydown` only.
- Never move the player inside the event listener — read `keys` in `update()` every frame instead

---

## Data setup — objects and variables

```js
const player = {
    x: canvasWidth / 2,   // center horizontally
    y: canvasHeight - 60, // near the bottom
    w: 36,
    h: 40
}

const enemy = {
    x: 60 + Math.random() * 360,  // random x between 60 and 420
    y: -30,                        // starts just above the canvas
    w: 32,
    h: 28
}

let bullet = null;      // null = no bullet, object = bullet in flight
let shootTimer = 0;     // timestamp of last shot
let gameState = 'playing';  // 'playing' | 'win' | 'lose'
```

**Key lessons:**
- Entities are plain objects with `x, y, w, h`
- `x, y` = center position, `w, h` = size
- Set up all data before writing the loop — the loop reads from these every frame
- `Math.random()` gives 0–1. For a range: `min + Math.random() * (max - min)`

---

## Common mistakes made (and fixed)

| Mistake | Fix |
|--------|-----|
| `canvas.clientWidth = 480` | Use `canvas.width = 480` |
| `ctx.fillStyle('red')` | `ctx.fillStyle = 'red'` — it's a property, not a function |
| `ctx.fillRect()` with no args | Always pass `(x, y, width, height)` |
| Declaring `draw()` twice | Second declaration silently overwrites first |
| `e.preventDefault()` on all keys | Only prevent Space, only in `keydown` |
| Drawing player outside the loop | Drawing belongs inside `draw()`, which the loop calls |
| Recreating `ctx` inside `draw()` | Create `ctx` once at startup |
| `player.y/2` instead of `player.h/2` | `h` is height, `y` is position — very different numbers |

---

## Practice exercises

Do these in a fresh HTML file each time. No copy-pasting — write from memory.

### Exercise 1 — Rectangles
- Canvas 400×400, black background
- Draw a red rectangle at the center (200×200 canvas means center is 200,200)
- Draw a smaller yellow rectangle inside it
- Draw a white 2px border around the red one using `ctx.strokeStyle` and `ctx.strokeRect`

### Exercise 2 — Triangle from scratch
- Canvas 400×400, dark background
- Draw a green triangle pointing upward, centered at (200, 300), 60px wide, 50px tall
- Draw a red triangle pointing downward, centered at (200, 100), same size
- No player object — just hardcode the numbers

### Exercise 3 — Moving rectangle (game loop)
- Canvas 400×300
- A white rectangle starts at x=0, y=150 (left edge, middle)
- Each frame it moves 2px to the right
- When it goes off the right edge, reset it to x=0
- Background must clear every frame or you'll see a trail

### Exercise 4 — Keyboard input
- Canvas 400×400
- A blue square (40×40) starts at center
- Arrow keys move it 4px per frame in each direction
- Clamp it so it never leaves the canvas

### Exercise 5 — Two shapes, one moving
- Canvas 400×400
- A stationary red circle at (200, 100) — use `ctx.arc(x, y, radius, 0, Math.PI * 2)`
- A blue triangle at the bottom center, moves left/right with arrow keys
- When the triangle's x gets within 30px of the circle's x (and it's close enough vertically), change the circle to green

---

## Still left to implement in task_1.html

1. Player movement in `update()` — read `keys`, adjust `player.x`, clamp to edges
2. Enemy falling — `enemy.y += ENEMY_SPEED` each frame
3. Draw enemy (inverted triangle, red)
4. `hits(a, b)` — AABB collision function
5. Bullet — spawn on Space, move upward, set to null off screen
6. Draw bullet (yellow rectangle)
7. Collision checks in `update()` — bullet hits enemy → `'win'`, enemy off bottom → `'lose'`
8. Win/lose text in `draw()`
