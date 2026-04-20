# How to Build a Basic Top-Down Shooter (Vanilla JS + Canvas)

This is the simplest complete version of Sky Assault. One enemy type, three sound effects, no music, no power-ups. It covers every system you need to make a real game — nothing more.

Read this before `howToBuild.md`. Once you understand everything here, that guide makes sense in full.

---

## What's in, what's out

**Included — the core systems:**
- Canvas setup + dark space background
- Parallax starfield
- Player ship with engine glow and cockpit
- WASD / arrow key movement
- Space to shoot (single bullet stream)
- One enemy type (straight down, shoots back)
- Grid wave spawning that grows each wave
- AABB collision detection
- Explosion particles
- 3 lives + invincibility frames after a hit
- Score + hi-score (localStorage)
- Wave counter
- Start screen and game over screen
- 3 synthesized sound effects (no audio files)

**Left out (covered in `howToBuild.md`):**
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
  │      ▽   ▽   ▽   ▽   ▽         │  ← enemies
  │      ▽   ▽   ▽   ▽   ▽         │
  │                                 │
  │              △                  │  ← player
  │  ♥ ♥ ♥                         │
  └─────────────────────────────────┘
```

- Arrow keys / WASD to move
- Space to shoot
- Enemies fly down and shoot back
- Three lives — you blink briefly after a hit
- Score, hi-score, wave counter

Everything lives in `basic.html`. ~280 lines of JS, no dependencies.

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
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      overflow: hidden;
      font-family: 'Courier New', monospace;
    }
    canvas { display: block; }
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

The CSS centers the canvas in the window. `overflow: hidden` stops the page from scrolling if the canvas doesn't fit exactly.

---

## Step 2 — Constants and state

```js
const PLAYER_SPEED       = 5;
const BULLET_SPEED       = 12;
const ENEMY_BULLET_SPEED = 3.5;
const SHOOT_COOLDOWN     = 200;   // ms between player shots
const WAVE_PAUSE         = 2000;  // ms between waves
```

```js
let gameState  = 'start';   // 'start' | 'playing' | 'gameover'
let score      = 0;
let hiScore    = parseInt(localStorage.getItem('basic-hi') || '0');
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
  getAudio();   // wake up the AudioContext on first keypress
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
let particles    = [];
let stars        = [];
```

Entities are plain objects in arrays. A bullet is `{ x, y, dy, w, h }`. An enemy is `{ x, y, w, h, speed, shootRate }`. There are no classes.

```js
function createPlayer() {
  return { x: W / 2, y: H - 80, w: 36, h: 40, lives: 3, invincible: 0 };
}

function createEnemy(x, y) {
  return { x, y, w: 32, h: 28, speed: 1.4 + wave * 0.1, shootRate: 0.0012 };
}
```

Factory functions return fresh plain objects. `speed: 1.4 + wave * 0.1` means enemies in wave 5 move 50% faster than wave 1 — difficulty scales automatically without extra logic.

> **Why plain objects and not classes?** For a game this size, plain objects with standalone functions (`hits(a, b)`, `explode(x, y)`) are less code and easier to read in the console. There's no inheritance to think about.

---

## Step 5 — Stars

```js
function initStars() {
  stars = [];
  for (let i = 0; i < 100; i++) {
    stars.push({
      x:          Math.random() * W,
      y:          Math.random() * H,
      speed:      0.3 + Math.random() * 1.2,
      size:       Math.random() < 0.85 ? 1 : 2,
      brightness: 0.25 + Math.random() * 0.75,
    });
  }
}
```

Stars scroll downward inside `update()`:

```js
for (const s of stars) {
  s.y += s.speed;
  if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
}
```

Stars at different speeds appear to be at different distances — fast stars feel close, slow stars feel far. This is parallax, and it costs almost nothing.

When a star exits the bottom it wraps to the top at a random `x`. Drawn with `ctx.globalAlpha = s.brightness` so they vary from dim to bright.

---

## Step 6 — Wave spawning

```js
function spawnWave(waveNum) {
  enemies  = [];
  waveDone = false;
  const rows    = Math.min(2 + Math.floor(waveNum / 3), 4);
  const cols    = Math.min(4 + Math.floor(waveNum / 2), 8);
  const spacing = Math.min((W - 60) / cols, 54);
  const startX  = (W - (cols - 1) * spacing) / 2;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      enemies.push(createEnemy(startX + col * spacing, -60 - row * 60));
    }
  }
}
```

Enemies start at `y = -60` or lower — off-screen above the canvas. Their `y` increases each frame so they fly in naturally. No teleporting, no special enter state.

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

## Step 8 — Shooting

```js
function playerShoot(now) {
  if (now - shootTimer < SHOOT_COOLDOWN) return;
  shootTimer = now;
  sndShoot();
  bullets.push({ x: player.x, y: player.y - player.h / 2, dy: -BULLET_SPEED, w: 4, h: 12 });
}
```

Called inside `update()` every frame that Space is held: `if (keys['Space']) playerShoot(now)`.

`shootTimer` tracks the last fire time. If less than `SHOOT_COOLDOWN` ms has passed, return early — this is the **cooldown pattern**. No timers, no intervals, just a timestamp comparison against `now`.

The bullet spawns at the tip of the player ship (`player.y - player.h / 2`) with a negative `dy` so it travels upward. `x` and `y` are the bullet's **center point** — important for collision.

Enemies fire straight down occasionally:

```js
for (const e of enemies) {
  e.y += e.speed;
  if (Math.random() < e.shootRate * (1 + wave * 0.1)) {
    enemyBullets.push({ x: e.x, y: e.y + e.h / 2, dy: ENEMY_BULLET_SPEED, w: 5, h: 10 });
  }
}
```

`Math.random() < shootRate` is evaluated every frame. At 60fps with `shootRate = 0.0012`, an enemy fires roughly once every 14 seconds on average — sparse, but it adds real threat.

---

## Step 9 — Collision detection

```js
function hits(a, b) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
         Math.abs(a.y - b.y) < (a.h + b.h) / 2;
}
```

This is **AABB** — Axis-Aligned Bounding Box. Two rectangles overlap if they overlap on both X and Y simultaneously.

Every entity uses `x, y` as its **center** (not top-left corner). That's why the check is `abs(a.x - b.x) < (a.w + b.w) / 2` — the centers must be closer than the sum of their half-widths.

> **Why center-based?** Canvas drawing helpers like `ctx.arc(x, y, r)` and `ctx.ellipse(x, y, ...)` are center-based. If your logical position and your drawing position are the same point, there's no offset arithmetic to track.

---

## Step 10 — Filtering arrays is how you remove entities

There is no `removeEnemy(id)` function. Arrays are replaced each frame by filtering:

```js
// Move player bullets, remove the ones that left the screen
bullets = bullets.filter(b => {
  b.y += b.dy;
  return b.y > -20;  // false removes the bullet
});
```

The same pattern handles bullet-enemy collisions — move the bullet, check hits, return `false` to consume the bullet if it hit something:

```js
bullets = bullets.filter(b => {
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (!hits(b, enemies[i])) continue;
    score += 100;
    explode(enemies[i].x, enemies[i].y, '#f87171');
    sndExplosion();
    enemies.splice(i, 1);  // remove the enemy immediately
    return false;          // bullet is consumed
  }
  return true;  // bullet missed everything, keep it
});
```

> **Why `enemies.splice(i, 1)` here but `enemies.filter(...)` elsewhere?** `splice` is used inside the bullet loop because we're already inside a `bullets.filter` — we need to remove enemies immediately as hits are found. Outside a loop, `filter` is cleaner.

---

## Step 11 — Particles

```js
function explode(x, y, color) {
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI * 2 * i) / 10 + Math.random() * 0.5;
    const speed = 1 + Math.random() * 3;
    particles.push({
      x, y,
      dx:    Math.cos(angle) * speed,
      dy:    Math.sin(angle) * speed,
      life:  1,
      decay: 0.022 + Math.random() * 0.03,
      size:  2 + Math.random() * 3,
      color,
    });
  }
}
```

Each particle has a `life` starting at `1.0`. Every frame `life -= decay`. When `life <= 0` the filter removes it. The `life` value also drives both `globalAlpha` and `size` when drawing — particles naturally shrink and fade together.

`dx/dy` are multiplied by `0.96` each frame (friction), so particles slow to a drift rather than flying at constant speed.

Updated inside `update()`:

```js
particles = particles.filter(p => {
  p.x += p.dx; p.y += p.dy;
  p.dx *= 0.96; p.dy *= 0.96;
  p.life -= p.decay;
  return p.life > 0;
});
```

---

## Step 12 — Hurting the player

```js
function hurtPlayer() {
  if (player.invincible > 0) return;
  player.lives--;
  player.invincible = 2200;   // ~2 seconds of blinking mercy
  explode(player.x, player.y, '#60a5fa');
  if (player.lives <= 0) {
    gameState = 'gameover';
    if (score > hiScore) { hiScore = score; localStorage.setItem('basic-hi', hiScore); }
    sndGameOver();
  }
}
```

Called from two places in `update()`:

```js
// Enemy bullet hits player
enemyBullets = enemyBullets.filter(b => {
  if (!hits(b, player)) return true;
  hurtPlayer();
  return false;
});

// Enemy rams player
if (hits(player, e)) {
  explode(e.x, e.y, '#f87171');
  enemies.splice(i, 1);
  hurtPlayer();
}
```

**Invincibility frames** are the classic mercy window after a hit. `player.invincible` counts down each frame (`player.invincible -= dt`). While it's > 0, `hurtPlayer()` returns immediately. Without this a single enemy spray could wipe out all lives at once.

The blinking effect is:

```js
if (player.invincible <= 0 || Math.floor(now / 100) % 2 === 0) {
  drawShip(player.x, player.y, player.w, player.h, '#60a5fa');
}
```

`Math.floor(now / 100) % 2` toggles between 0 and 1 every 100ms — so the ship appears and disappears 5 times per second.

---

## Step 13 — Drawing with Canvas

Nothing uses DOM elements. Everything is painted with Canvas 2D API calls inside `draw()`.

The canvas is **stateless** — it remembers nothing from the previous frame. Every frame starts by wiping it:

```js
ctx.fillStyle = '#060616';
ctx.fillRect(0, 0, W, H);
```

**Drawing the player ship:**

```js
function drawShip(x, y, w, h, color) {
  // Body — upward-pointing triangle
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x,       y - h / 2);   // tip
  ctx.lineTo(x + w/2, y + h / 2);   // bottom-right
  ctx.lineTo(x - w/2, y + h / 2);   // bottom-left
  ctx.closePath();
  ctx.fill();

  // Engine glow
  ctx.fillStyle   = '#facc15';
  ctx.shadowColor = '#facc15';
  ctx.shadowBlur  = 10;
  ctx.beginPath();
  ctx.ellipse(x, y + h / 2, w / 7, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur  = 0;   // always reset — shadow bleeds onto everything after it

  // Cockpit window
  ctx.fillStyle = 'rgba(190,235,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(x, y - h / 6, w / 5, h / 5, 0, 0, Math.PI * 2);
  ctx.fill();
}
```

**Drawing enemies:**

```js
// Inverted triangle pointing down
ctx.fillStyle   = '#f87171';
ctx.shadowColor = '#f87171';
ctx.shadowBlur  = 8;
ctx.beginPath();
ctx.moveTo(e.x,         e.y + e.h / 2);   // point
ctx.lineTo(e.x + e.w/2, e.y - e.h / 2);   // top-left
ctx.lineTo(e.x - e.w/2, e.y - e.h / 2);   // top-right
ctx.closePath();
ctx.fill();
ctx.shadowBlur = 0;
```

The glow (`shadowBlur`) is what makes the game feel polished. Without it everything looks flat.

**Drawing bullets** — just a rectangle:

```js
ctx.fillStyle = '#facc15';
for (const b of bullets) ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
```

`b.x - b.w / 2` converts center position to top-left corner, which is what `fillRect` expects.

---

## Step 14 — Sound effects (Web Audio API)

The browser has a built-in synthesizer called the Web Audio API. No audio files needed — sounds are described as node graphs and generated in real time.

Everything routes through a single `AudioContext`:

```js
let audioCtx = null;

function getAudio() {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
```

Created lazily because browsers block audio until the user interacts with the page. Calling `getAudio()` on the first keydown satisfies that requirement.

**Shoot sound** — a square wave that drops quickly in pitch:

```js
function sndShoot() {
  const ac = getAudio(), o = ac.createOscillator(), g = ac.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(900, ac.currentTime);
  o.frequency.exponentialRampToValueAtTime(200, ac.currentTime + 0.09);
  g.gain.setValueAtTime(0.15, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.09);
  o.connect(g); g.connect(ac.destination);
  o.start(); o.stop(ac.currentTime + 0.09);
}
```

Every sound follows the same pattern: **source → gain → destination**. The `exponentialRampToValueAtTime` calls schedule parameter changes on the audio clock. Ramping from 900Hz to 200Hz over 90ms is what gives the laser its "pew" character.

**Explosion sound** — white noise through a lowpass filter:

```js
function sndExplosion() {
  const ac  = getAudio();
  const buf = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;  // white noise
  const src = ac.createBufferSource(), filt = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = buf; filt.type = 'lowpass'; filt.frequency.value = 800;
  g.gain.setValueAtTime(0.3, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.3);
  src.connect(filt); filt.connect(g); g.connect(ac.destination);
  src.start(); src.stop(ac.currentTime + 0.3);
}
```

White noise is random values at every sample. A lowpass filter (cuts frequencies above 800Hz) turns raw noise into the soft thump of an explosion. No oscillator — pitched tones come from oscillators, unpitched sounds come from filtered noise.

> Note: in the full game, the noise buffer is generated once and reused. Here it's generated fresh per explosion — fine for a basic version, but if explosions overlap frequently you'd want to cache it.

**Game over sound** — four descending sawtooth notes played with a staggered delay:

```js
function sndGameOver() {
  const ac = getAudio();
  [440, 349, 294, 220].forEach((freq, i) => {  // A4 F4 D4 A3
    const o = ac.createOscillator(), g = ac.createGain();
    const t = ac.currentTime + i * 0.22;        // stagger each note by 220ms
    o.type = 'sawtooth'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    o.connect(g); g.connect(ac.destination);
    o.start(t); o.stop(t + 0.32);
  });
}
```

All four oscillators are scheduled at once using the audio clock's precise timing. Scheduling at `ac.currentTime + i * 0.22` queues each note to play in the future — you can't do this reliably with `setTimeout`.

---

## Step 15 — The screens

Three game states: `'start'`, `'playing'`, `'gameover'`. The `draw()` function reads `gameState` and branches:

```js
function draw(now) {
  // Background + stars (always drawn first)
  ctx.fillStyle = '#060616';
  ctx.fillRect(0, 0, W, H);
  for (const s of stars) { /* draw each star */ }

  if (gameState === 'start')    { /* title, ship, instructions */ return; }
  if (gameState === 'gameover') { /* particles, score, prompt  */ return; }

  // Playing: player, enemies, bullets, particles, HUD
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
  → initStars()
  → requestAnimationFrame(loop)

Each frame (loop)
  → dt = min(now - lastTime, 50)
  → if playing: update(dt, now)
  → draw(now)
  → requestAnimationFrame(loop)

update(dt, now)
  → scroll stars
  → move player (read keys, clamp to canvas)
  → shoot if Space held (cooldown check)
  → tick invincibility timer
  → move player bullets (filter off-screen)
  → move enemy bullets (filter off-screen)
  → move enemies + occasionally fire
  → collide: player bullets vs enemies → explode, score
  → collide: enemy bullets vs player → hurtPlayer
  → collide: enemies ramming player → hurtPlayer
  → age particles
  → if enemies.length === 0 → waveDone → waveTimer
  → if waveDone and pause elapsed → wave++, spawnWave

draw(now)
  → wipe canvas
  → stars
  → if start: ship + title + instructions → return
  → if gameover: particles + score text → return
  → player ship (blink if invincible)
  → player bullets (yellow rects)
  → enemy bullets (red rects)
  → enemies (inverted triangles + glow)
  → particles (fading circles)
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
| Background music | Look-ahead scheduler with Web Audio API |
| Touch controls | `touchstart/move/end` + inverse projection for position |
| Hi-score persistence | Already in this version — `localStorage.getItem/setItem` |

Each feature slots into the same loop. `update` handles the new logic, `draw` handles the new visuals. The pattern doesn't change — just more objects in the arrays.
