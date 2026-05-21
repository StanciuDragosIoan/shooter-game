# Task 1 — Minimal Space Shooter MVP

Build a single `task_1.html` file from scratch. No libraries, no imports, no audio, no particles.

---

## Canvas

- Create a `<canvas>` element in the HTML body with `id="game"`
- Set its logical width to **480** and height to **400** in JavaScript (not CSS)
- Get a 2D context from it
- Fill the background with dark navy `#060616` every frame before drawing anything else

---

## Constants

Define these at the top of your script:

- `PLAYER_SPEED` — how many pixels the player moves per frame (try 4–5)
- `BULLET_SPEED` — how many pixels a bullet moves upward per frame (try 10–12)
- `SHOOT_COOLDOWN` — minimum milliseconds between shots (try 200)
- `ENEMY_SPEED` — how many pixels the enemy falls per frame (try 1.5)

---

## Input

- Declare an empty object `keys = {}`
- On `keydown`, set `keys[e.code] = true`
- On `keyup`, set `keys[e.code] = false`
- Prevent the default scroll behavior when Space is pressed

---

## Player

A plain object with these properties:

- `x` — starts at canvas center horizontally
- `y` — starts 60px from the bottom
- `w` — 36
- `h` — 40

Draw it as a **triangle pointing upward** using Canvas path commands:
- Top point: `(x, y - h/2)`
- Bottom-right: `(x + w/2, y + h/2)`
- Bottom-left: `(x - w/2, y + h/2)`
- Fill color: blue (`#60a5fa`)

Movement:
- Arrow Left / Arrow Right moves `x` by ±`PLAYER_SPEED` each frame
- Clamp `x` so the ship never goes outside the canvas edges (account for `w/2` on each side)

---

## Bullet

A single bullet at a time (no arrays needed for MVP). Represent it as either `null` (no bullet) or a plain object with:

- `x`, `y` — position
- `w` — 4
- `h` — 12

Shooting:
- Track a `shootTimer` (timestamp of last shot, starts at 0)
- When Space is held AND `now - shootTimer >= SHOOT_COOLDOWN` AND no bullet exists:
  - Create the bullet at the player's center x, top of player (`y - h/2`)
  - Update `shootTimer = now`

Each frame, if a bullet exists:
- Move it upward by `BULLET_SPEED`
- If it goes off the top of the canvas, set it back to `null`

Draw it as a small filled yellow rectangle (`#facc15`), centered on `x, y`.

---

## Enemy

A single plain object with:

- `x` — random position between 60 and 420 (to keep it away from edges)
- `y` — starts at -30 (just off the top)
- `w` — 32
- `h` — 28

Draw it as a **triangle pointing downward** (inverted from the player):
- Bottom point: `(x, y + h/2)`
- Top-right: `(x + w/2, y - h/2)`
- Top-left: `(x - w/2, y - h/2)`
- Fill color: red (`#f87171`)

Movement:
- Each frame, add `ENEMY_SPEED` to `y`

---

## Collision — AABB

Write a function `hits(a, b)` that returns `true` if two rectangles overlap.

Both `a` and `b` have `x, y` (center) and `w, h` (size).

The rule: two rectangles overlap if the distance between their centers is less than half their combined widths **and** less than half their combined heights. Check both axes.

---

## Game State

Track a variable `gameState` starting as `'playing'`. It can become `'win'` or `'lose'`.

Each frame in `update()`:

1. Only move things if `gameState === 'playing'`
2. Check: if bullet exists and `hits(bullet, enemy)` → set `gameState = 'win'`
3. Check: if `enemy.y > canvas height + enemy.h/2` → set `gameState = 'lose'`

---

## Draw

Clear the canvas, then draw in this order:

1. Background fill
2. Player (skip if game is over — optional)
3. Bullet (if it exists)
4. Enemy
5. If `gameState === 'win'`: draw centered text "YOU WIN" in yellow, large font
6. If `gameState === 'lose'`: draw centered text "GAME OVER" in red, large font

For text: set `ctx.textAlign = 'center'` and `ctx.textBaseline = 'middle'`, then draw at `(canvas.width / 2, canvas.height / 2)`.

---

## Game Loop

Write a `loop(now)` function that:

1. Calls `update(now)`
2. Calls `draw()`
3. Calls `requestAnimationFrame(loop)`

Call `requestAnimationFrame(loop)` once at the bottom of your script to start it.

Pass `now` (the timestamp `requestAnimationFrame` provides) into `update` so you can compare it against `shootTimer`.

---

## Structure to follow

```
<canvas> in HTML body

<script>
  canvas + ctx
  constants
  keys + event listeners
  player object
  bullet variable (null)
  enemy object
  shootTimer variable
  gameState variable

  function hits(a, b) { ... }
  function update(now) { ... }
  function draw() { ... }
  function loop(now) { ... }

  requestAnimationFrame(loop)
</script>
```

---

## Done when

- Ship moves left/right and stays on screen
- Space fires one bullet at a time with cooldown
- Bullet moves upward and disappears off the top
- Enemy falls from top to bottom
- Hitting the enemy shows "YOU WIN"
- Enemy reaching the bottom shows "GAME OVER"
