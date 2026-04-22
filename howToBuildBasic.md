# How to Build a Basic Top-Down Shooter (Vanilla JS + Canvas)

This is the simplest complete version of Sky Assault. One enemy type, no music, no power-ups. It covers every system you need to make a real game — nothing more.

Read this before `howToBuild.md`. Once you understand everything here, that guide makes sense in full.

---

## What's in, what's out

**Included — the core systems:**
- Canvas setup + dark space background
- Player ship (rectangle) with WASD / arrow key movement
- Space to shoot (single bullet stream)
- One enemy type (straight down, shoots back)
- Grid wave spawning that grows each wave
- AABB collision detection
- 3 lives + invincibility frames after a hit
- Score + hi-score (localStorage)
- Wave counter
- Start screen and game over screen
- Wave-clear banner

**Left out (covered in `howToBuild.md`):**
- Parallax starfield
- Explosion particles
- Sound effects
- Multiple enemy types and boss waves
- Power-ups (spread shot, shield, extra life)
- Background music
- Touch / mobile controls
- Responsive canvas scaling

---

## What you're building

```
  ┌─────────────────────────────────┐
  │  SCORE  400    WAVE 2   HI  800 │
  │                                 │
  │      ■   ■   ■   ■   ■         │  ← enemies
  │      ■   ■   ■   ■   ■         │
  │                                 │
  │              ■                  │  ← player
  │  ■ ■ ■                         │
  └─────────────────────────────────┘
```

- Arrow keys / WASD to move
- Space to shoot
- Enemies fly down and shoot back
- Three lives — you blink briefly after a hit
- Score, hi-score, wave counter

Everything lives in `basic.html`. ~270 lines of JS, no dependencies.

---

## The core idea — understand this first

A game is not event-driven like a normal web page. Instead of "user clicks → something happens", a game runs a tight loop 60 times per second regardless of whether anything happened.

```
requestAnimationFrame fires
    → update()  — move everything, check collisions, mutate state
    → draw()    — read state and repaint the canvas from scratch
    → schedule the next frame
```

There is no DOM, no innerHTML. Everything is painted to a `<canvas>` element using the Canvas 2D API. Each frame the canvas is wiped and redrawn completely.

---

## Step 1 — HTML and canvas setup

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Sky Assault — Basic</title>
  <style>
    body {
      margin: 0;
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
    }
    canvas { display: block; background: #060616; }
  </style>
</head>
<body>
  <canvas id="game"></canvas>
  <script>
    const canvas = document.getElementById('game');
    const ctx    = canvas.getContext('2d');
    const W = canvas.width  = 480;
    const H = canvas.height = 700;
  </script>
</body>
</html>
```

`ctx` is the drawing context — everything you draw goes through it. `W` and `H` are the fixed dimensions of the game world. All coordinates live in this 480×700 pixel space.

The CSS centers the canvas in the window.

---

## Step 2 — Constants and state

```js
const PLAYER_SPEED   = 5;    // pixels per frame
const BULLET_SPEED   = 10;   // pixels per frame
const SHOOT_COOLDOWN = 300;  // ms between player shots
const WAVE_PAUSE     = 1800; // ms between waves
```

```js
let gameState  = 'start';  // 'start' | 'playing' | 'gameover'
let score      = 0;
let hiScore    = parseInt(localStorage.getItem('min-hi') || '0');
let wave       = 1;
let lastTime   = 0;
let shootTimer = 0;
let waveTimer  = 0;
let waveDone   = false;
```

All timing constants are in milliseconds because delta time (`dt`) is in milliseconds.

`hiScore` is loaded from `localStorage` at startup. `parseInt(... || '0')` handles the first-ever visit when the key doesn't exist yet. It's saved back when the game ends.

---

## Step 3 — Input

```js
const keys = {};
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if ((e.code === 'Space' || e.code === 'Enter') && gameState !== 'playing') {
    startGame();
  }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });
```

Rather than reacting to each keydown event, we track which keys are currently held in a plain object. Inside `update()` we check `if (keys['ArrowLeft'])` every frame. This gives smooth continuous movement.

`e.preventDefault()` on Space stops the browser from scrolling.

> **Why `e.code` not `e.key`?** `e.code` is the physical key (`'Space'`, `'KeyA'`) regardless of keyboard layout. `e.key` gives the typed character, which changes with Shift, Caps Lock, or different keyboard languages.

---

## Step 4 — Entity collections

```js
let player       = null;
let bullets      = [];
let enemyBullets = [];
let enemies      = [];
```

Entities are plain objects in arrays. A bullet is `{ x, y, dy, w, h }`. An enemy is `{ x, y, w, h, speed, shootRate }`. There are no classes.

```js
function createPlayer() {
  return { x: W / 2, y: H - 60, w: 30, h: 20, lives: 3, invincible: 0 };
}

function createEnemy(x, y) {
  return { x, y, w: 28, h: 20, speed: 0.8 + wave * 0.1, shootRate: 0.0008 };
}
```

Factory functions return fresh plain objects. `speed: 0.8 + wave * 0.1` means enemies in wave 5 move 50% faster than wave 1 — difficulty scales automatically without extra logic.

> **Why plain objects and not classes?** For a game this size, plain objects with standalone functions (`hits(a, b)`) are less code and easier to read in the console. There's no inheritance to think about.

---

## Step 5 — Start / restart

```js
function startGame() {
  gameState    = 'playing';
  score        = 0;
  wave         = 1;
  player       = createPlayer();
  bullets      = [];
  enemyBullets = [];
  waveDone     = false;
  spawnWave(wave);
}
```

Called when Space or Enter is pressed on the start or game over screen. Resets all state and spawns the first wave. This is the only place `player` gets created — until `startGame()` runs, `player` is `null`.

---

## Step 6 — Wave spawning

```js
function spawnWave(n) {
  enemies  = [];
  waveDone = false;
  const cols    = Math.min(4 + n, 9);
  const rows    = Math.min(1 + Math.floor(n / 2), 4);
  const spacing = Math.floor((W - 60) / cols);
  const startX  = (W - (cols - 1) * spacing) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      enemies.push(createEnemy(startX + c * spacing, -40 - r * 50));
    }
  }
}
```

Enemies start at `y = -40` or lower — off-screen above the canvas. Their `y` increases each frame so they fly in naturally. No teleporting, no special enter state.

The grid grows each wave. `Math.min(..., max)` caps the size so the canvas never becomes impossibly crowded. Each wave automatically has more enemies and faster ones (because `createEnemy` reads `wave` directly).

---

## Step 7 — The game loop

```js
function loop(now) {
  const dt = Math.min(now - lastTime, 50);
  lastTime = now;
  if (gameState === 'playing') update(dt, now);
  draw(now);
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
```

`requestAnimationFrame` calls `loop` before the browser paints the next frame, typically 60 times per second. It passes the current timestamp `now` in milliseconds.

`dt` is delta time — milliseconds since the last frame (~16ms at 60fps). `Math.min(..., 50)` caps it so switching tabs doesn't teleport entities halfway across the screen when you return.

`update` only runs when playing. `draw` always runs — so the start and game over screens are still drawn even though nothing is moving.

---

## Step 8 — Collision detection

```js
function hits(a, b) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
         Math.abs(a.y - b.y) < (a.h + b.h) / 2;
}
```

This is **AABB** — Axis-Aligned Bounding Box. Two rectangles overlap if they overlap on both X and Y simultaneously.

Every entity uses `x, y` as its **center** (not top-left corner). That's why the check is `abs(a.x - b.x) < (a.w + b.w) / 2` — the centers must be closer than the sum of their half-widths.

> **Why center-based?** Canvas drawing with `fillRect` still needs a top-left corner, but you subtract `w/2` and `h/2` only once at draw time. Collision math, spawning, and movement all work directly with the center — no constant offset arithmetic.

---

## Step 9 — Hurting the player

```js
function hurtPlayer() {
  if (player.invincible > 0) return;
  player.lives--;
  player.invincible = 2000;  // ~2 seconds of blinking mercy
  if (player.lives <= 0) {
    gameState = 'gameover';
    if (score > hiScore) { hiScore = score; localStorage.setItem('min-hi', hiScore); }
  }
}
```

**Invincibility frames** are the classic mercy window after a hit. `player.invincible` is set to 2000ms on hit. Inside `update()` it counts down each frame (`player.invincible -= dt`). While it's > 0, `hurtPlayer()` returns immediately — a single enemy spray can't wipe out all lives at once.

---

## Step 10 — The update() function

`update(dt, now)` runs once per frame while `gameState === 'playing'`. It moves everything, checks collisions, and advances game state. Here is the complete function:

```js
function update(dt, now) {
  // Move player left/right, clamp to canvas edges
  if (keys['ArrowLeft'] || keys['KeyA']) player.x -= PLAYER_SPEED;
  if (keys['ArrowRight'] || keys['KeyD']) player.x += PLAYER_SPEED;
  player.x = Math.max(player.w / 2, Math.min(W - player.w / 2, player.x));
  if (player.invincible > 0) player.invincible -= dt;

  // Shoot — inline cooldown check
  if (keys['Space'] && now - shootTimer > SHOOT_COOLDOWN) {
    shootTimer = now;
    bullets.push({ x: player.x, y: player.y - player.h / 2, w: 4, h: 12, dy: -BULLET_SPEED });
  }

  // Move player bullets; remove when off top of canvas
  bullets = bullets.filter(b => { b.y += b.dy; return b.y > 0; });

  // Move enemy bullets; remove when off bottom of canvas
  enemyBullets = enemyBullets.filter(b => { b.y += b.dy; return b.y < H; });

  // Move enemies; let them shoot occasionally
  for (const e of enemies) {
    e.y += e.speed;
    if (Math.random() < e.shootRate) {
      enemyBullets.push({ x: e.x, y: e.y + e.h / 2, w: 4, h: 10, dy: 3 + wave * 0.2 });
    }
  }

  // Player bullets vs enemies
  bullets = bullets.filter(b => {
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (!hits(b, enemies[i])) continue;
      score += 100;
      enemies.splice(i, 1);  // remove enemy immediately
      return false;           // bullet is consumed
    }
    return true;  // bullet missed everything, keep it
  });

  // Enemy bullets vs player
  enemyBullets = enemyBullets.filter(b => {
    if (!hits(b, player)) return true;
    hurtPlayer();
    return false;
  });

  // Enemies ramming player or leaving canvas
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.y > H + 10) { enemies.splice(i, 1); continue; }
    if (hits(player, e)) { enemies.splice(i, 1); hurtPlayer(); }
  }

  // Wave progression
  if (enemies.length === 0 && !waveDone) { waveDone = true; waveTimer = now; }
  if (waveDone && now - waveTimer > WAVE_PAUSE) { wave++; spawnWave(wave); }
}
```

A few things to notice:

**Invincibility countdown** — `player.invincible -= dt` must be inside `update()`. If you forget it, the player becomes permanently invincible after the first hit.

**Enemy bullets need their own movement filter.** The enemy loop pushes bullets into `enemyBullets`, but a separate filter is still needed to move them each frame and remove off-screen ones.

**Filtering arrays is how you remove entities.** There is no `removeEnemy(id)` function — arrays are replaced each frame by filtering. A callback returning `false` removes the element:

```js
bullets = bullets.filter(b => {
  b.y += b.dy;   // move
  return b.y > 0; // false removes it
});
```

**Why `splice` inside the bullet filter but `filter` for enemies elsewhere?** `splice` is used inside the bullet loop because we're already inside a `bullets.filter` — enemies must be removed immediately as hits are found. Outside a nested loop, `filter` is cleaner.

**Enemies ram the player** — if an enemy reaches the player's bounding box it counts as a collision and hurts. If an enemy flies off the bottom without hitting, it's removed silently (no points, no damage).

---

## Step 11 — Drawing with Canvas

Nothing uses DOM elements. Everything is painted with Canvas 2D API calls inside `draw()`.

### Structure and flow of the draw() function

`draw(now)` is called every frame. It receives `now` (the current timestamp in milliseconds) so it can drive time-based effects like blinking text and fade transitions.

The function follows a strict **top-to-bottom layering order** — the **painter's algorithm**: draw what's furthest "back" first, then paint closer things on top. Anything drawn later overwrites what's beneath it.

```
1. Wipe the canvas (background fill)
2. Set default text alignment
3. Early-return screens (start / gameover)
4. Player ship (with invincibility blink)
5. Player bullets
6. Enemy bullets
7. Enemies
8. HUD — score, wave, hi-score, lives
9. Wave-clear banner (floats above everything)
```

**1. Wipe the canvas**

```js
ctx.fillStyle = '#060616';
ctx.fillRect(0, 0, W, H);
```

The canvas does **not** clear itself between frames. Without this, every frame stacks on top of the previous one and you see motion blur smeared across the entire canvas. A full-screen rectangle wipe is the standard fix.

**2. Default text alignment**

```js
ctx.textAlign    = 'center';
ctx.textBaseline = 'middle';
```

Set once up front so `ctx.fillText('...', W/2, y)` centres text automatically. These are stable defaults — individual HUD items override them inline only when needed.

**3. Early-return screens**

```js
if (gameState === 'start') {
  // draw title and instructions
  return;
}
if (gameState === 'gameover') {
  // draw score and prompts
  return;
}
```

Early `return` keeps the function flat. Everything after this point only runs during actual gameplay — no wrapping `if (gameState === 'playing')` block needed.

**Blinking "PRESS SPACE" text** uses a time-based toggle:

```js
if (Math.floor(now / 600) % 2) {
  ctx.fillText('PRESS SPACE TO START', W / 2, H / 2 + 80);
}
```

`Math.floor(now / 600)` counts how many 600ms intervals have elapsed. `% 2` alternates between 0 and 1. When it's 1, draw the text; when 0, skip it. No extra state variable — just `now`.

**4. Drawing the player (with invincibility blink)**

```js
if (player.invincible <= 0 || Math.floor(now / 120) % 2 === 0) {
  ctx.fillStyle = '#60a5fa';
  ctx.fillRect(player.x - player.w / 2, player.y - player.h / 2, player.w, player.h);
}
```

`fillRect` expects a **top-left corner**, but all entity positions are **centers**. Subtracting half the width and half the height converts from center to top-left — the same offset used everywhere in the draw function.

When `invincible > 0`, `Math.floor(now / 120) % 2` toggles every 120ms, making the ship appear and disappear ~4 times per second. The blink makes it obvious the player is temporarily protected.

**5–7. Bullets and enemies**

```js
ctx.fillStyle = '#facc15';
for (const b of bullets) ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);

ctx.fillStyle = '#f87171';
for (const b of enemyBullets) ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);

ctx.fillStyle = '#f87171';
for (const e of enemies) ctx.fillRect(e.x - e.w / 2, e.y - e.h / 2, e.w, e.h);
```

Each group sets `fillStyle` once before the loop, not inside it — avoids redundant property assignments on every entity. All three use the same center-to-top-left offset trick.

**8. HUD**

```js
ctx.font         = 'bold 13px monospace';
ctx.textBaseline = 'top';
ctx.fillStyle    = '#ccc';
ctx.textAlign = 'left';   ctx.fillText('SCORE ' + score,   12, 12);
ctx.textAlign = 'center'; ctx.fillText('WAVE '  + wave,  W/2, 12);
ctx.textAlign = 'right';  ctx.fillText('HI '    + hiScore, W - 12, 12);
```

The HUD is drawn after all game objects so it always appears on top. `textBaseline = 'top'` anchors text to the top of the canvas at `y = 12`. Each item overrides `textAlign` inline — left for score, centre for wave, right for hi-score — so all three sit at the same `y` and snap to their respective edges.

Lives are small squares, not text:

```js
ctx.fillStyle = '#60a5fa';
for (let i = 0; i < player.lives; i++) ctx.fillRect(12 + i * 18, H - 22, 12, 12);
```

**9. Wave-clear banner**

```js
if (waveDone) {
  const t = now - waveTimer;
  const a = Math.min(1, t / 300) * (1 - t / WAVE_PAUSE);
  if (a > 0) {
    ctx.globalAlpha = a;
    ctx.fillStyle   = '#facc15';
    ctx.font        = 'bold 34px monospace';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('WAVE CLEAR!', W / 2, H / 2);
    ctx.globalAlpha = 1;
  }
}
```

`globalAlpha` scales the opacity of everything drawn while it's active. The alpha formula breaks into two parts:

- `Math.min(1, t / 300)` — ramps 0→1 over the first 300ms (fast fade in)
- `(1 - t / WAVE_PAUSE)` — decreases 1→0 over the full 1800ms pause (slow fade out)

Multiplied together: the banner arrives quickly and fades out gradually. When `a <= 0` the guard skips drawing entirely.

`ctx.globalAlpha = 1` resets opacity immediately after. If you forget this, every subsequent draw call in every future frame will be partially transparent.

---

## Step 12 — The screens

Three game states: `'start'`, `'playing'`, `'gameover'`. The `draw()` function reads `gameState` and branches:

```js
function draw(now) {
  ctx.fillStyle    = '#060616';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  if (gameState === 'start')    { /* title + instructions */ return; }
  if (gameState === 'gameover') { /* score + prompt       */ return; }

  // Playing: player, enemies, bullets, HUD, wave-clear banner
}
```

**Blinking text** uses `Math.floor(now / 600) % 2` — toggles between 0 and 1 every 600ms. If it's 1, draw the text; if 0, skip it. No extra timer variable needed.

**Wave-clear banner** fades in then out using a single alpha formula:

```js
const elapsed = now - waveTimer;
const alpha   = Math.min(1, elapsed / 300) * (1 - elapsed / WAVE_PAUSE);
```

`Math.min(1, elapsed / 300)` ramps from 0→1 over the first 300ms (fade in). `(1 - elapsed / WAVE_PAUSE)` goes from 1→0 over the full pause duration (fade out). Multiplied together: the banner fades in quickly and then slowly fades out. When `alpha <= 0`, skip drawing.

---

## The full picture

```
Boot
  → requestAnimationFrame(loop)

Each frame (loop)
  → dt = min(now - lastTime, 50)
  → if playing: update(dt, now)
  → draw(now)
  → requestAnimationFrame(loop)

update(dt, now)
  → move player (read keys, clamp to canvas)
  → tick invincibility timer (player.invincible -= dt)
  → shoot if Space held (cooldown check)
  → move player bullets (filter off top)
  → move enemy bullets (filter off bottom)
  → move enemies + occasionally fire
  → collide: player bullets vs enemies → score
  → collide: enemy bullets vs player → hurtPlayer
  → collide: enemies ramming player → hurtPlayer
  → enemies leaving canvas → remove silently
  → if enemies.length === 0 → waveDone → waveTimer
  → if waveDone and pause elapsed → wave++, spawnWave

draw(now)
  → wipe canvas
  → if start: title + instructions → return
  → if gameover: score text + prompt → return
  → player ship (blue rect, blink if invincible)
  → player bullets (yellow rects)
  → enemy bullets (red rects)
  → enemies (red rects)
  → HUD: score, wave, hi-score, lives
  → wave-clear banner (if active)
```

---

## What to add next

Once this is working and you understand every line, `howToBuild.md` walks through adding:

| Feature | What changes |
|---|---|
| Multiple enemy types | `ENEMY_TEMPLATES` + `createEnemy(x, y, type)` |
| Enemy boss waves | Branch in `spawnWave` on `waveNum % 5 === 0` |
| Power-ups | New entity array, new collision check, timed player state |
| Parallax starfield | `stars` array, scroll in `update()`, draw with `globalAlpha` |
| Explosion particles | `particles` array, `explode(x, y)`, age + filter each frame |
| Sound effects | Web Audio API — oscillators + gain nodes, no audio files |
| Background music | Look-ahead scheduler with Web Audio API |
| Touch controls | `touchstart/move/end` + inverse projection for position |
| Hi-score persistence | Already in this version — `localStorage.getItem/setItem` |

Each feature slots into the same loop. `update` handles the new logic, `draw` handles the new visuals. The pattern doesn't change — just more objects in the arrays.
