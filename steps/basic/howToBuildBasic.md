# How to Build the Basic Game

This is the simplest complete version of Sky Assault. Plain rectangles, no sound, no particles. Every line has a reason. Read this before anything else in the project.

---

## What you're building

```
┌─────────────────────────────┐
│ SCORE 400   WAVE 2   HI 800 │
│                             │
│   ██  ██  ██  ██  ██        │  ← enemies (red squares)
│   ██  ██  ██  ██  ██        │
│                             │
│           ██                │  ← player (blue square)
│ ■ ■ ■                       │  ← lives
└─────────────────────────────┘
```

- A/D or Arrow keys to move left/right
- Space to shoot
- Enemies fly down and shoot back
- 3 lives — you blink briefly after a hit
- Score, hi-score, wave counter

Everything is in `game.html`. ~170 lines of JS, no libraries, no build step.

---

## The one concept you must understand

A game is not event-driven. It doesn't wait for something to happen. It runs a loop 60 times per second whether anything changed or not:

```
requestAnimationFrame fires
  → update()  — move everything, check collisions, change state
  → draw()    — wipe the canvas, repaint everything from scratch
  → schedule the next frame
```

There is no DOM. No HTML elements are created or destroyed. Everything is drawn with the Canvas 2D API each frame.

---

## Section 0 — HTML shell

The entire game lives in a single `.html` file. There is no build step, no bundler, no dependencies.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Sky Assault — Minimal</title>
  <style>
    body { margin: 0; background: #000; display: flex; justify-content: center; align-items: center; height: 100vh; }
    canvas { display: block; background: #060616; }
  </style>
</head>
<body>
<canvas id="game"></canvas>
<script>

  /* all JS goes here */

</script>
</body>
</html>
```

Key points:
- `margin: 0` removes browser default whitespace. `display: flex` + `justify/align: center` centers the canvas on screen.
- The `<canvas>` has no `width` or `height` attributes — the JS sets them (Section 1). Without that the default is 300×150.
- All game code is in one `<script>` block, inlined in the body. Order matters: the `<canvas>` element must exist before the script runs, so the script comes after it.

---

## Section 1 — Canvas setup

```js
const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');
const W = canvas.width  = 480;
const H = canvas.height = 700;
```

`ctx` is the drawing context — every drawing command goes through it.  
`W` and `H` define the game world. All coordinates are in this 480×700 space.

---

## Section 2 — Constants

```js
const PLAYER_SPEED   = 5;     // pixels per frame
const BULLET_SPEED   = 10;    // pixels per frame
const SHOOT_COOLDOWN = 300;   // ms between player shots
const WAVE_PAUSE     = 1800;  // ms between waves
```

All timing values are in milliseconds because delta time (`dt`) is in milliseconds. Keep magic numbers here so they're easy to tune.

---

## Section 3 — State

```js
let gameState = 'start';   // 'start' | 'playing' | 'gameover'
let score     = 0;
let hiScore   = parseInt(localStorage.getItem('min-hi') || '0');
let wave      = 1;
let lastTime  = 0;    // timestamp of previous frame — used to compute dt
let shootTimer = 0;   // timestamp of last shot — used for cooldown
let waveTimer  = 0;   // timestamp of when the wave was cleared
let waveDone   = false;

let player       = null;
let bullets      = [];
let enemyBullets = [];
let enemies      = [];
```

Entities live in plain arrays. The player is a single object. All positions are **center-based** — `x` and `y` are the center of the rectangle. This matters for collision (see Section 8).

`hiScore` is loaded from `localStorage` at startup. `parseInt(... || '0')` handles the first visit when the key doesn't exist.

---

## Section 4 — Input

```js
const keys = {};
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if ((e.code === 'Space' || e.code === 'Enter') && gameState !== 'playing') startGame();
});
document.addEventListener('keyup', e => { keys[e.code] = false; });
```

`keys` is a plain object used as a set. `keys['ArrowLeft']` is `true` while the key is held, `undefined` (falsy) otherwise.

Checking `keys` inside `update()` every frame gives smooth continuous movement. Reacting to individual `keydown` events would give choppy movement with a key-repeat delay.

`e.code` is the physical key (layout-independent). `e.key` is the typed character — it changes with keyboard language and Shift.

`e.preventDefault()` on Space stops the browser from scrolling the page.

---

## Section 5 — Factories

```js
function createPlayer() {
  return { x: W / 2, y: H - 60, w: 30, h: 20, lives: 3, invincible: 0 };
}

function createEnemy(x, y) {
  return { x, y, w: 28, h: 20, speed: 0.8 + wave * 0.1, shootRate: 0.0008 };
}
```

Factory functions return plain objects. No classes needed.

`speed: 0.8 + wave * 0.1` means wave 5 enemies move 50% faster than wave 1. Difficulty scales automatically — no extra logic.

---

## Section 6 — Wave spawning

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

Enemies start at `y = -40` — off-screen above the canvas. Their `y` increases each frame so they fly in naturally.

`startX` centers the grid horizontally. `Math.min(..., max)` caps the grid so the canvas never overflows.

---

## Section 7 — Start and restart

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

Everything is reset here. `spawnWave` fills the enemies array. The game loop is already running — it just starts calling `update` now that `gameState === 'playing'`.

---

## Section 8 — Collision

```js
function hits(a, b) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
         Math.abs(a.y - b.y) < (a.h + b.h) / 2;
}
```

This is AABB (Axis-Aligned Bounding Box). Two rectangles overlap if they overlap on both axes at the same time.

Because all positions are **center-based**, the check is:  
*"are the centers closer than the sum of their half-widths?"*

If positions were top-left corner instead, you'd need to add `w/2` and `h/2` everywhere — center-based is less arithmetic.

---

## Section 9 — Hurt player

```js
function hurtPlayer() {
  if (player.invincible > 0) return;
  player.lives--;
  player.invincible = 2000;
  if (player.lives <= 0) {
    gameState = 'gameover';
    if (score > hiScore) { hiScore = score; localStorage.setItem('min-hi', hiScore); }
  }
}
```

Called when an enemy bullet or enemy body hits the player.

**Invincibility frames** — `player.invincible` is a countdown in ms. While it's > 0, `hurtPlayer()` returns immediately. Without this, a single enemy spray could wipe all 3 lives at once.

Inside `update()`: `if (player.invincible > 0) player.invincible -= dt;`  
Inside `draw()`, the player blinks: `if (player.invincible <= 0 || Math.floor(now / 120) % 2 === 0)`.

`Math.floor(now / 120) % 2` alternates between 0 and 1 every 120ms — that's the blink.

---

## Section 10 — Update

This is the core of the game. Called once per frame while playing.

**Move player:**
```js
if (keys['ArrowLeft'] || keys['KeyA']) player.x -= PLAYER_SPEED;
if (keys['ArrowRight']|| keys['KeyD']) player.x += PLAYER_SPEED;
player.x = Math.max(player.w / 2, Math.min(W - player.w / 2, player.x));
```
`Math.max/min` clamps the player inside the canvas. The bounds account for the half-width so the player doesn't go halfway off-screen.

**Shoot:**
```js
if (keys['Space'] && now - shootTimer > SHOOT_COOLDOWN) {
  shootTimer = now;
  bullets.push({ x: player.x, y: player.y - player.h / 2, w: 4, h: 12, dy: -BULLET_SPEED });
}
```
The cooldown is a timestamp comparison — no timers, no intervals. `dy` is negative so the bullet travels upward. The bullet spawns at the tip of the player (`player.y - player.h / 2`).

**Move bullets — filter removes off-screen ones:**
```js
bullets = bullets.filter(b => { b.y += b.dy; return b.y > 0; });
```
`filter` returns a new array containing only elements where the callback returns `true`. Returning `false` removes the element. Here: move the bullet, keep it if still on screen.

**Move enemies and let them fire:**
```js
for (const e of enemies) {
  e.y += e.speed;
  if (Math.random() < e.shootRate) {
    enemyBullets.push({ x: e.x, y: e.y + e.h / 2, w: 4, h: 10, dy: 3 + wave * 0.2 });
  }
}
```
`Math.random() < 0.0008` evaluated at 60fps means an enemy fires roughly once every 21 seconds on average. Low probability × many frames = occasional shots.

**Player bullets vs enemies:**
```js
bullets = bullets.filter(b => {
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (!hits(b, enemies[i])) continue;
    score += 100;
    enemies.splice(i, 1);
    return false;   // bullet is consumed
  }
  return true;
});
```
Iterate enemies backwards so `splice` doesn't mess up the index. Return `false` from the filter to remove the bullet when it hits.

Why `splice` here instead of another `filter`? We're already inside a `bullets.filter` loop — we need to remove the enemy immediately when the hit is found, not after the loop.

**Wave progression:**
```js
if (enemies.length === 0 && !waveDone) { waveDone = true; waveTimer = now; }
if (waveDone && now - waveTimer > WAVE_PAUSE) { wave++; spawnWave(wave); }
```
Two separate conditions. The first fires once when all enemies are gone. The second fires after the pause. `waveDone` prevents the first condition from triggering every frame.

---

## Section 11 — Draw

The canvas is **stateless** — it remembers nothing between frames. Every frame starts by wiping it:

```js
ctx.fillStyle = '#060616';
ctx.fillRect(0, 0, W, H);
```

Then draw everything in order (back to front):
1. Background wipe
2. Start/gameover screen (return early if not playing)
3. Player rectangle
4. Bullets
5. Enemies
6. HUD (score, wave, lives)
7. Wave-clear banner

**Drawing rectangles:**
```js
ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
```
`fillRect` takes `(left, top, width, height)`. Because positions are center-based, subtract half-dimensions to get the top-left corner. This is the only offset conversion you need.

**Blinking text** (used for "PRESS SPACE" and player invincibility):
```js
if (Math.floor(now / 600) % 2)
```
`now / 600` increases over time. `Math.floor` removes the decimal. `% 2` makes it 0 or 1. Alternates every 600ms — draw text when it's 1, skip when it's 0.

**Wave-clear banner with fade in/out:**
```js
const t = now - waveTimer;
const a = Math.min(1, t / 300) * (1 - t / WAVE_PAUSE);
```
- `Math.min(1, t / 300)` — ramps from 0→1 in the first 300ms (fade in)
- `(1 - t / WAVE_PAUSE)` — ramps from 1→0 over the full pause (fade out)
- Multiplied: fades in quickly, then slowly fades out

Set `ctx.globalAlpha = a` before drawing. Reset it to `1` after.

---

## Section 12 — Game loop

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

`requestAnimationFrame(loop)` — the browser calls `loop` before painting the next frame (~60fps). It passes the current time in ms as `now`.

`dt` is delta time — how many ms since the last frame (~16ms at 60fps). `Math.min(..., 50)` caps it so switching tabs doesn't teleport entities when you return.

`update` only runs when `gameState === 'playing'`. `draw` always runs — so the start and gameover screens still work.

---

## Full flow at a glance

```
Boot
  → requestAnimationFrame(loop)

Each frame
  → dt = min(now - lastTime, 50)
  → if playing: update(dt, now)
      → move player (read keys, clamp)
      → cooldown check → maybe spawn bullet
      → move player bullets (filter off-screen)
      → move enemy bullets (filter off-screen)
      → move enemies + maybe fire
      → collide: bullets vs enemies → score, remove
      → collide: enemy bullets vs player → hurtPlayer
      → collide: enemies vs player → hurtPlayer
      → wave done? → set timer → advance wave
  → draw(now)
      → wipe canvas
      → start / gameover screen? → return early
      → player (blink if invincible)
      → bullets, enemy bullets, enemies
      → HUD, lives, wave-clear banner
  → requestAnimationFrame(loop)
```

---

## What's in `basic.html` (the next step)

Once this version makes sense, `../../basic.html` adds:

| Feature | What changes |
|---|---|
| Scrolling starfield | 100 objects in a `stars` array, wrapping `y` |
| Triangle ships | `drawShip()` function using `ctx.beginPath/lineTo/fill` |
| Explosion particles | `particles` array, `life` countdown, `globalAlpha` fade |
| Web Audio sounds | `AudioContext`, oscillators, noise buffers |
| Touch controls | `touchstart/move/end` events, inverse canvas projection |
| Responsive scaling | `canvas.style.width/height` scaled to fit the window |

Each feature adds a new section in `update()` and a new section in `draw()`. The loop structure never changes.
