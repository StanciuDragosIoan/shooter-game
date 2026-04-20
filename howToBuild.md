# How to Build a Top-Down Shooter (Vanilla JS + Canvas)

This is Sky Assault — a top-down vertical shooter in a single HTML file. No libraries, no build tools. Enemies fly down, you fly up, you shoot each other.

The goal here is to understand the core systems that make any real-time game work: the game loop, entity collections, collision detection, and how to tie it all together cleanly.

---

## What you're building

```
  ┌─────────────────────────────────┐
  │  SCORE  1200    WAVE 2   HI 4000│
  │                                 │
  │      ▽   ▽   ▽   ▽   ▽         │  ← enemies
  │        ◇       ◇               │  ← tanks
  │  ∨   ∨   ∨   ∨   ∨   ∨        │  ← zigzag enemies
  │                                 │
  │              ●                  │  ← power-up
  │                                 │
  │              △                  │  ← player
  │  ♥ ♥ ♥          SPREAD SHOT    │
  └─────────────────────────────────┘
```

- Arrow keys / WASD to move in all four directions; drag finger on mobile
- Space to shoot (hold it down); auto-fires while finger is held on mobile
- Enemies shoot back — aim varies by wave
- Three enemy types + a boss every 5th wave
- Power-ups: spread shot, shield, extra life
- Score, hi-score (localStorage), wave counter
- M key toggles music on desktop

Everything lives in one file: `index.html`. No external dependencies.

---

## The core idea — understand this first

A browser game is not event-driven like a normal web app. Instead of "user clicks → something happens", a game runs a tight loop that fires 60 times per second, whether anything happens or not.

```
requestAnimationFrame fires
    → update()   — move everything, check collisions, mutate state
    → draw()     — read state and paint the canvas from scratch
    → schedule the next frame
```

There is no DOM, no innerHTML. Everything is drawn to a `<canvas>` element using the Canvas 2D API. Each frame the canvas is completely repainted.

---

## File structure

Everything is in one file to keep it simple. Inside `<script>`, the code is divided into clearly labeled sections:

```
CANVAS SETUP       — create canvas, get 2D context, set dimensions, responsive scaling, touch helpers
CONSTANTS          — speeds, cooldowns, timings
AUDIO              — Web Audio API: all sound effects synthesized, no files
MUSIC              — procedural chiptune sequencer (look-ahead scheduler)
STATE              — game-wide variables (score, wave, gameState, hiScore, etc.)
ENTITY COLLECTIONS — arrays: bullets, enemies, particles, powerUps, stars
STARS              — parallax background
PLAYER             — createPlayer() factory function
ENEMIES            — ENEMY_TEMPLATES + createEnemy() factory
WAVE SPAWNING      — spawnWave(waveNum)
START / RESTART    — startGame()
SHOOTING           — playerShoot(now)
COLLISION          — hits(a, b)
PARTICLES          — explode(x, y, color, count)
POWER-UPS          — maybeSpawnPowerUp, applyPowerUp
KILL PLAYER        — hurtPlayer(), endGame()
UPDATE             — the full update loop
DRAW HELPERS       — drawShip, drawEnemy, drawPowerUpIcon
HUD                — drawHUD: score, lives, mute indicator, power-up bar
SCREENS            — drawStartScreen, drawGameOverScreen
DRAW               — the full draw loop
GAME LOOP          — loop(now) via requestAnimationFrame
BOOT               — favicon generation, initStars(), first requestAnimationFrame call
```

---

## Step 1 — Canvas setup

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <title>Sky Assault</title>
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      height: 100dvh;    /* dynamic viewport height — accounts for iOS address bar */
      overflow: hidden;
      font-family: 'Courier New', monospace;
    }
    canvas { display: block; touch-action: none; }  /* hand all touch events to JS */
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

`ctx` is the drawing context — everything you draw goes through it. `W` and `H` are the **logical** dimensions of the game world. All coordinates are in pixels within this 480×700 space.

> **Why hardcode the size?** A fixed canvas makes collision math simple — you always know the boundaries. Responsive sizing adds complexity (you'd have to scale all coordinates) that distracts from the core systems.

### Responsive scaling

The logical size stays 480×700, but the CSS display size scales to fill the viewport:

```js
function resizeCanvas() {
  const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  canvas.style.width  = Math.floor(W * scale) + 'px';
  canvas.style.height = Math.floor(H * scale) + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
```

`Math.min` picks whichever axis runs out of room first, so the canvas fits the screen without distortion. This only changes the CSS size — the internal drawing coordinate system is always 480×700.

### Touch coordinate helper

When the canvas is scaled by CSS, touch coordinates from the browser are in screen pixels, not game pixels. This function converts them:

```js
function toCanvas(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (clientX - r.left) * (W / r.width),
    y: (clientY - r.top)  * (H / r.height),
  };
}
```

`getBoundingClientRect()` gives the canvas's actual on-screen size and position. Dividing by `r.width` and multiplying by `W` maps from screen pixels back to game pixels.

---

## Step 2 — State and entity collections

```js
let gameState  = 'start';   // 'start' | 'playing' | 'gameover'
let score      = 0;
let hiScore    = parseInt(localStorage.getItem('sky-assault-hi') || '0');
let wave       = 1;
let lastTime   = 0;
let shootTimer = 0;
let waveTimer  = 0;
let waveDone   = false;
```

`hiScore` is loaded from `localStorage` at startup. It's saved back when the game ends (see `endGame`). `parseInt(...|| '0')` handles the first-ever visit when the key doesn't exist yet.

Entities are plain objects in arrays. A bullet is just `{ x, y, dx, dy, w, h }`. An enemy is `{ x, y, w, h, hp, type, ... }`. There are no classes.

```js
let player       = null;
let bullets      = [];   // player bullets
let enemyBullets = [];
let enemies      = [];
let particles    = [];
let powerUps     = [];
let stars        = [];
```

> **Why plain objects and not classes?** Classes imply inheritance hierarchies and methods. For a game this size, simple data objects with standalone functions (`hits(a, b)`, `explode(x, y)`) are less code, easier to read, and easier to debug.

---

## Step 3 — Constants

```js
const PLAYER_SPEED       = 5;
const BULLET_SPEED       = 11;
const ENEMY_BULLET_SPEED = 4;
const SHOOT_COOLDOWN     = 180;   // ms between player shots
const WAVE_PAUSE         = 2200;  // ms between waves
```

All timing constants are in milliseconds because `dt` (delta time) is in milliseconds. Putting them all in one place means you tune difficulty by changing one number, not hunting through logic.

---

## Step 4 — Input

### Keyboard

```js
const keys = {};
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  getAudio();   // ensure AudioContext is created/resumed on first key press
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyM') toggleMute();
  if ((e.code === 'Space' || e.code === 'Enter') && gameState !== 'playing') {
    startGame();
  }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });
```

Rather than responding to each individual `keydown` event, we track which keys are currently held in a `keys` object. Inside `update()`, we check `if (keys['ArrowLeft'])` every frame. This gives smooth, continuous movement.

> **Why `e.code` instead of `e.key`?** `e.code` is the physical key (`'KeyA'`, `'Space'`) regardless of keyboard layout or modifier keys. `e.key` gives the character typed (`'a'` vs `'A'`), which can vary with Shift or caps lock.

`e.preventDefault()` on Space stops the browser from scrolling the page. `getAudio()` on the first keydown satisfies the browser's requirement that audio can't start before a user gesture.

### Touch controls

Mobile players drag their finger to steer, and the ship auto-fires while the finger is down:

```js
const touch = { active: false, x: W / 2, y: H - 80 };

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  getAudio();   // same gesture requirement as keyboard
  const p = toCanvas(e.touches[0].clientX, e.touches[0].clientY);
  touch.active = true;
  touch.x = p.x;
  touch.y = p.y;
  if (gameState !== 'playing') startGame();
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  const p = toCanvas(e.touches[0].clientX, e.touches[0].clientY);
  touch.x = p.x;
  touch.y = p.y;
}, { passive: false });

canvas.addEventListener('touchend',   e => { e.preventDefault(); touch.active = false; }, { passive: false });
canvas.addEventListener('touchcancel',e => { e.preventDefault(); touch.active = false; }, { passive: false });
```

`{ passive: false }` is required because we call `e.preventDefault()` inside — this disables native scroll/zoom while the finger is on the canvas. `touchcancel` fires when the OS interrupts a gesture (e.g. a phone call arrives), so it should do the same cleanup as `touchend`.

Inside `update()`, `touch.active` is treated like `keys['Space']` — it triggers shooting — and the ship glides toward `touch.x / touch.y` (see Step 7).

---

## Step 5 — Entities: factories, not constructors

```js
function createPlayer() {
  return {
    x: W / 2, y: H - 80,
    w: 36, h: 40,
    lives: 5,
    invincible: 0,      // ms remaining; player blinks and cannot be hit
    powerUp: null,      // 'spread' | 'shield' | null
    powerTimer: 0,      // ms remaining on active power-up
  };
}
```

```js
const ENEMY_TEMPLATES = {
  basic:  { w: 32, h: 28, hp: 1,  speed: 1.6, score: 100,  color: '#f87171', shootRate: 0.0018 },
  zigzag: { w: 28, h: 26, hp: 1,  speed: 1.8, score: 150,  color: '#fb923c', shootRate: 0.001  },
  tank:   { w: 40, h: 36, hp: 3,  speed: 0.9, score: 300,  color: '#a78bfa', shootRate: 0.003  },
  boss:   { w: 80, h: 60, hp: 20, speed: 1.0, score: 2000, color: '#f43f5e', shootRate: 0.007  },
};

function createEnemy(x, y, type) {
  const t = ENEMY_TEMPLATES[type];
  return {
    x, y,
    w: t.w, h: t.h,
    hp: t.hp, maxHp: t.hp,
    speed: t.speed,
    score: t.score,
    color: t.color,
    type,
    shootRate: t.shootRate,
    angle: 0,      // used for oscillation (zigzag / boss)
    hitFlash: 0,   // frames to flash white after being hit
  };
}
```

Each entity type has a factory function that returns a fresh plain object. `ENEMY_TEMPLATES` holds the stat block for each type — `createEnemy` just copies those stats onto a new object with a position.

> **Why a templates object instead of hardcoding stats in the function?** Separation of data and logic. If you want to tweak boss HP from 20 to 30, you change one number in `ENEMY_TEMPLATES`.

---

## Step 6 — Wave spawning

```js
function spawnWave(waveNum) {
  enemies  = [];
  waveDone = false;

  if (waveNum % 5 === 0) {
    // Boss wave: one big enemy + 4 escorts
    enemies.push(createEnemy(W / 2, -70, 'boss'));
    for (let i = 0; i < 4; i++) {
      enemies.push(createEnemy(70 + i * 115, -150 - i * 40, 'basic'));
    }
  } else {
    // Grid formation: rows × cols, type depends on row and waveNum
    const rows    = Math.min(2 + Math.floor(waveNum / 3), 5);
    const cols    = Math.min(4 + Math.floor(waveNum / 2), 8);
    const spacing = Math.min((W - 60) / cols, 54);
    const startX  = (W - (cols - 1) * spacing) / 2;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = startX + col * spacing;
        const y = -60 - row * 64;
        let type = 'basic';
        if (waveNum >= 3 && row === 0 && col % 3 === 0) type = 'tank';
        if (waveNum >= 2 && row === rows - 1)           type = 'zigzag';
        enemies.push(createEnemy(x, y, type));
      }
    }
  }
}
```

Enemies start at `y = -60` or lower — off-screen above the canvas. Their `y` increases every frame, so they naturally fly in from the top. No teleporting, no special "enter" state.

The grid gets larger each wave. `Math.min(..., max)` caps it so the canvas doesn't become impossibly crowded. Waves 5, 10, 15... trigger boss waves instead.

---

## Step 7 — Start / restart

```js
function startGame() {
  gameState    = 'playing';
  score        = 0;
  wave         = 1;
  player       = createPlayer();
  bullets      = [];
  enemyBullets = [];
  particles    = [];
  powerUps     = [];
  waveDone     = false;
  initStars();
  spawnWave(wave);
  startMusic();
}
```

`startGame` is called both on first play (from a keydown/touchstart on the start screen) and when restarting after game over. It resets every piece of mutable state and then kicks off the first wave and the music.

---

## Step 8 — The game loop

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

`requestAnimationFrame` calls `loop` before the browser paints the next frame, typically 60 times per second. It passes the current timestamp (`now`) in milliseconds.

**`dt`** is "delta time" — how many milliseconds passed since the last frame. On a smooth 60fps display that's ~16ms. The `Math.min(..., 50)` cap prevents a huge dt spike if the tab was in the background for a few seconds, which would otherwise launch entities hundreds of pixels in one frame.

> **Why pass `now` and `dt` instead of using `Date.now()` inside update?** Consistency. `now` comes from the browser's high-resolution timer and is the same value across every check in that frame.

---

## Step 9 — Shooting

```js
function playerShoot(now) {
  if (now - shootTimer < SHOOT_COOLDOWN) return;
  shootTimer = now;
  sndShoot();

  if (player.powerUp === 'spread') {
    bullets.push({ x: player.x, y: player.y - player.h / 2, dx: -2, dy: -BULLET_SPEED, w: 4, h: 12 });
    bullets.push({ x: player.x, y: player.y - player.h / 2, dx:  0, dy: -BULLET_SPEED, w: 4, h: 12 });
    bullets.push({ x: player.x, y: player.y - player.h / 2, dx:  2, dy: -BULLET_SPEED, w: 4, h: 12 });
  } else {
    bullets.push({ x: player.x, y: player.y - player.h / 2, dx: 0, dy: -BULLET_SPEED, w: 4, h: 12 });
  }
}
```

`shootTimer` tracks the last time the player fired. If not enough time has passed (`SHOOT_COOLDOWN` ms), the function returns early. This is the standard "cooldown" pattern — no timers or intervals, just a comparison against `now`.

The spread power-up fires three bullets with slight horizontal `dx` offsets. Normal mode fires one bullet straight up (`dx: 0`).

---

## Step 10 — Collision detection

```js
function hits(a, b) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
         Math.abs(a.y - b.y) < (a.h + b.h) / 2;
}
```

This is **AABB** — Axis-Aligned Bounding Box. Every entity is treated as a rectangle. Two rectangles overlap if they overlap on both the X axis and the Y axis simultaneously.

All entities use `{ x, y }` as their **center** point (not top-left corner). That's why the check is `abs(a.x - b.x) < (a.w + b.w) / 2` — the centers must be closer than the sum of their half-widths.

> **Why center-based instead of top-left?** Drawing helpers like `ctx.arc(x, y, r)` and `ctx.ellipse(x, y, ...)` are center-based. If your logical position and your drawing position use the same point, there's no offset arithmetic to track.

---

## Step 11 — Particles

```js
function explode(x, y, color, count = 12) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
    const speed = 1 + Math.random() * 3.5;
    particles.push({
      x, y,
      dx:    Math.cos(angle) * speed,
      dy:    Math.sin(angle) * speed,
      life:  1,
      decay: 0.018 + Math.random() * 0.03,
      size:  2 + Math.random() * 3,
      color,
    });
  }
}
```

Each particle has a `life` value starting at `1.0`. Every frame, `life -= decay`. When `life <= 0`, the particle is filtered out. The `life` value also drives `globalAlpha` and `size` — so particles naturally shrink and fade at the same rate they age.

`dx/dy` are multiplied by `0.96` each frame (friction), so particles slow down and drift rather than flying off at constant speed.

---

## Step 12 — Power-ups

```js
const POWERUP_TYPES = ['spread', 'shield', 'life'];

function maybeSpawnPowerUp(x, y) {
  if (Math.random() > 0.13) return;
  powerUps.push({
    x, y,
    type: POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)],
    w: 20, h: 20,
    dy: 1.5,
  });
}

function applyPowerUp(type) {
  if (type === 'spread') { player.powerUp = 'spread'; player.powerTimer = 8000; }
  if (type === 'shield') { player.powerUp = 'shield'; player.powerTimer = 5000; }
  if (type === 'life')   { player.lives = Math.min(player.lives + 1, 5); }
  score += 50;
  sndPowerUp();
}
```

Power-ups are just objects that fall down the screen like slow bullets. The same `hits(player, p)` collision check picks them up (inside `update()` — see Step 13). When collected, `applyPowerUp` modifies the player object directly and sets a `powerTimer`. Each frame, `powerTimer -= dt` counts down. When it hits zero, `powerUp` is cleared back to `null`.

`maybeSpawnPowerUp` is called every time an enemy is destroyed. It has a 13% chance to drop something, so power-ups appear naturally but not too often.

---

## Step 13 — Hurting and killing the player

These two functions centralize all damage logic so every hit path (enemy bullet, ramming, etc.) behaves the same way:

```js
function hurtPlayer() {
  if (player.invincible > 0) return;   // already hit recently, ignore

  if (player.powerUp === 'shield') {
    // Shield absorbs the hit but is consumed
    player.powerUp   = null;
    player.powerTimer = 0;
    player.invincible = 1000;
    explode(player.x, player.y, '#34d399', 10);
    sndShieldAbsorb();
    return;
  }

  player.lives--;
  player.invincible = 2200;   // ~2s of blinking invincibility after a hit
  explode(player.x, player.y, '#60a5fa', 18);
  sndPlayerHurt();
  if (player.lives <= 0) endGame();
}

function endGame() {
  gameState = 'gameover';
  stopMusic();
  sndGameOver();
  if (score > hiScore) {
    hiScore = score;
    localStorage.setItem('sky-assault-hi', hiScore);
  }
}
```

**Invincibility frames** (`player.invincible`) are the classic "mercy window" after taking a hit. The player blinks visually and cannot be hurt again until the timer expires. This prevents a single enemy spray from wiping out all lives instantly.

`endGame` saves the hi-score to `localStorage` if beaten. The value is loaded back at startup (Step 2), so it persists between sessions.

---

## Step 14 — Update loop internals

`update(dt, now)` runs every frame while `gameState === 'playing'`. It processes everything in this order:

```
1.  Move stars (slow scroll for parallax)
2.  Move player (read keys, glide toward touch position, clamp to canvas bounds)
3.  Shoot if Space held or touch active (respects cooldown)
4.  Tick invincibility and power-up timers
5.  Move player bullets — filter out ones that left the canvas
6.  Move enemy bullets — filter out ones that left the canvas
7.  Move enemies (type-specific patterns) + fire toward player
8.  Move power-ups — collect on player collision
9.  Collide: player bullets → enemies
10. Collide: enemy bullets → player
11. Collide: enemies ramming player
12. Age particles (apply friction, reduce life)
13. Check if wave is done → start next wave timer
```

The order matters. Movement before collision means bullets move to their new position before we check if they hit anything. If you reversed that, a fast bullet could tunnel through a thin enemy in one frame.

Here is the complete `update` function:

```js
function update(dt, now) {

  // ── Stars ──────────────────────────────────────────────
  for (const s of stars) {
    s.y += s.speed;
    if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
  }

  // ── Player movement ────────────────────────────────────
  if (keys['ArrowLeft'] || keys['KeyA']) player.x -= PLAYER_SPEED;
  if (keys['ArrowRight']|| keys['KeyD']) player.x += PLAYER_SPEED;
  if (keys['ArrowUp']   || keys['KeyW']) player.y -= PLAYER_SPEED;
  if (keys['ArrowDown'] || keys['KeyS']) player.y += PLAYER_SPEED;

  // Touch: glide toward finger position (capped at PLAYER_SPEED per axis)
  if (touch.active) {
    const dx   = touch.x - player.x;
    const dy   = touch.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 2) {
      const spd = Math.min(PLAYER_SPEED * 1.6, dist);
      player.x += (dx / dist) * spd;
      player.y += (dy / dist) * spd;
    }
  }

  player.x = Math.max(player.w / 2, Math.min(W - player.w / 2, player.x));
  player.y = Math.max(player.h / 2, Math.min(H - player.h / 2, player.y));

  if (keys['Space'] || touch.active) playerShoot(now);

  // Countdown timers
  if (player.invincible > 0) player.invincible -= dt;
  if (player.powerTimer > 0) {
    player.powerTimer -= dt;
    if (player.powerTimer <= 0) player.powerUp = null;
  }

  // ── Player bullets ─────────────────────────────────────
  bullets = bullets.filter(b => {
    b.x += b.dx;
    b.y += b.dy;
    return b.y > -20 && b.x > -10 && b.x < W + 10;
  });

  // ── Enemy bullets ──────────────────────────────────────
  enemyBullets = enemyBullets.filter(b => {
    b.x += b.dx;
    b.y += b.dy;
    return b.y < H + 20;
  });

  // ── Enemy movement + firing ────────────────────────────
  for (const e of enemies) {
    if (e.type === 'zigzag') {
      e.angle += 0.045;
      e.x += Math.sin(e.angle) * 2.8;
      e.y += e.speed * 0.55;
    } else if (e.type === 'boss') {
      e.angle += 0.018;
      e.x = W / 2 + Math.sin(e.angle) * (W / 2 - 60);
      e.y = Math.min(e.y + e.speed * 0.4, 110);   // settle in top area
    } else {
      e.y += e.speed;   // basic + tank: straight down
    }

    // Enemy fires toward player
    const shootChance = e.shootRate * (1 + wave * 0.08);
    if (Math.random() < shootChance) {
      const dx  = player.x - e.x;
      const dy  = player.y - e.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const spd = e.type === 'boss' ? ENEMY_BULLET_SPEED * 1.4 : ENEMY_BULLET_SPEED;
      enemyBullets.push({
        x: e.x, y: e.y + e.h / 2,
        dx: (dx / len) * spd,
        dy: (dy / len) * spd,
        w: 5, h: 10,
      });
    }

    if (e.hitFlash > 0) e.hitFlash--;
  }

  // ── Power-ups ──────────────────────────────────────────
  powerUps = powerUps.filter(p => {
    p.y += p.dy;
    if (hits(player, p)) {
      applyPowerUp(p.type);
      explode(p.x, p.y, '#facc15', 8);
      return false;
    }
    return p.y < H + 30;
  });

  // ── Collision: player bullets → enemies ────────────────
  bullets = bullets.filter(b => {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (!hits(b, e)) continue;

      e.hp--;
      e.hitFlash = 6;

      if (e.hp <= 0) {
        score += e.score;
        const blastCount = e.type === 'boss' ? 32 : 12;
        explode(e.x, e.y, e.color, blastCount);
        sndExplosion(e.type === 'boss');
        maybeSpawnPowerUp(e.x, e.y);
        enemies.splice(i, 1);
      } else {
        sndEnemyHit();
      }
      return false;  // bullet is consumed on first enemy hit
    }
    return true;
  });

  // ── Collision: enemy bullets → player ─────────────────
  enemyBullets = enemyBullets.filter(b => {
    if (!hits(b, player)) return true;
    hurtPlayer();
    explode(b.x, b.y, '#f43f5e', 5);
    return false;
  });

  // ── Collision: enemies ramming player ─────────────────
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.y > H + 10) { enemies.splice(i, 1); continue; }
    if (hits(player, e)) {
      explode(e.x, e.y, e.color, 14);
      enemies.splice(i, 1);
      hurtPlayer();
    }
  }

  // ── Particles ──────────────────────────────────────────
  particles = particles.filter(p => {
    p.x  += p.dx;
    p.y  += p.dy;
    p.dx *= 0.96;
    p.dy *= 0.96;
    p.life -= p.decay;
    return p.life > 0;
  });

  // ── Wave progression ───────────────────────────────────
  if (enemies.length === 0 && !waveDone) {
    waveDone  = true;
    waveTimer = now;
    sndWaveClear();
  }
  if (waveDone && now - waveTimer > WAVE_PAUSE) {
    wave++;
    spawnWave(wave);
  }
}
```

A few patterns worth noting:

**Filtering arrays is how you remove entities.** `bullets.filter(b => { ...; return b.y > -20; })` moves the bullet and returns `false` when it goes off-screen, which removes it. No index juggling, no splice-while-iterating bugs.

**`splice` inside the bullet loop, `filter` elsewhere.** Inside `bullets.filter`, we need to remove enemies immediately as we find hits — `splice(i, 1)` does that in-place. Outside a loop, `filter` is cleaner.

**Enemy movement patterns.** `Math.sin(angle)` oscillates smoothly between -1 and +1 as `angle` increases. Multiplying by an amplitude controls how wide the oscillation is. The boss's `x` is set directly (not incremented) so it always tracks the center of its sine wave regardless of prior position.

**Enemy firing.** Each enemy has a `shootRate` — the probability per frame that it fires. `shootRate * (1 + wave * 0.08)` makes enemies fire more frequently as waves progress. The bullet's `dx/dy` is a unit vector toward the player, scaled by `spd`.

---

## Step 15 — Drawing with Canvas

Nothing in the game uses DOM elements or HTML. Everything is drawn with Canvas 2D API calls inside `draw()`.

The canvas is **stateless** — it doesn't remember what you drew last frame. Every frame, you redraw everything from scratch:

```js
ctx.fillStyle = '#060616';
ctx.fillRect(0, 0, W, H);   // wipe the canvas with the background color
// ... then draw everything on top
```

### Drawing ships

```js
function drawShip(x, y, w, h, color) {
  // Main body — triangle pointing up
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x,       y - h / 2);   // tip
  ctx.lineTo(x + w/2, y + h / 2);   // bottom-right
  ctx.lineTo(x - w/2, y + h / 2);   // bottom-left
  ctx.closePath();
  ctx.fill();

  // Engine glow
  ctx.fillStyle  = '#facc15';
  ctx.shadowColor = '#facc15';
  ctx.shadowBlur  = 10;
  ctx.beginPath();
  ctx.ellipse(x, y + h / 2, w / 7, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Cockpit window
  ctx.fillStyle = 'rgba(190,235,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(x, y - h / 6, w / 5, h / 5, 0, 0, Math.PI * 2);
  ctx.fill();
}
```

**Glow effects** use `ctx.shadowBlur` and `ctx.shadowColor`. Always reset `shadowBlur` to `0` after using it — the shadow state persists and will bleed onto everything drawn after it if you forget.

### Drawing enemies

Each enemy type has its own shape drawn inside `drawEnemy(e)`. The `hitFlash` field turns the color white for a few frames after a bullet hit — a classic damage indicator:

```js
function drawEnemy(e) {
  const c = e.hitFlash > 0 ? '#ffffff' : e.color;
  ctx.fillStyle = c;

  if (e.type === 'basic') {
    // Inverted triangle pointing down
    ctx.beginPath();
    ctx.moveTo(e.x,        e.y + e.h / 2);
    ctx.lineTo(e.x + e.w/2, e.y - e.h / 2);
    ctx.lineTo(e.x - e.w/2, e.y - e.h / 2);
    ctx.closePath();
    ctx.fill();
    // Dark eye
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y - 2, e.w / 5, e.h / 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  else if (e.type === 'zigzag') {
    // Arrow / chevron shape
    ctx.beginPath();
    ctx.moveTo(e.x,        e.y + e.h / 2);
    ctx.lineTo(e.x + e.w/2, e.y - e.h / 2);
    ctx.lineTo(e.x,        e.y);
    ctx.lineTo(e.x - e.w/2, e.y - e.h / 2);
    ctx.closePath();
    ctx.fill();
  }

  else if (e.type === 'tank') {
    // Chunky diamond
    ctx.beginPath();
    ctx.moveTo(e.x,        e.y - e.h / 2);
    ctx.lineTo(e.x + e.w/2, e.y);
    ctx.lineTo(e.x,        e.y + e.h / 2);
    ctx.lineTo(e.x - e.w/2, e.y);
    ctx.closePath();
    ctx.fill();
    // HP bar
    const bw = e.w + 4;
    ctx.fillStyle = '#222';
    ctx.fillRect(e.x - bw / 2, e.y - e.h / 2 - 8, bw, 4);
    ctx.fillStyle = '#34d399';
    ctx.fillRect(e.x - bw / 2, e.y - e.h / 2 - 8, bw * (e.hp / e.maxHp), 4);
  }

  else if (e.type === 'boss') {
    // Large saucer body with glow
    ctx.shadowColor = e.color;
    ctx.shadowBlur  = 18;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, e.w / 2, e.h / 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Dome on top
    ctx.fillStyle = e.hitFlash > 0 ? '#fff' : 'rgba(255,80,80,0.85)';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y - 6, e.w / 4, e.h / 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // HP bar
    const bw = e.w + 24;
    ctx.fillStyle = '#222';
    ctx.fillRect(e.x - bw / 2, e.y - e.h / 2 - 12, bw, 7);
    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(e.x - bw / 2, e.y - e.h / 2 - 12, bw * (e.hp / e.maxHp), 7);
  }
}
```

### Drawing power-up icons

Power-ups pulse in brightness using `Math.sin(now / 280)` so they catch the player's eye:

```js
function drawPowerUpIcon(p, now) {
  const color = p.type === 'spread' ? '#fb923c'
              : p.type === 'shield' ? '#34d399'
              : '#f472b6';
  const pulse = 0.65 + Math.sin(now / 280) * 0.35;

  ctx.globalAlpha  = pulse;
  ctx.shadowColor  = color;
  ctx.shadowBlur   = 14;
  ctx.fillStyle    = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur  = 0;
  ctx.globalAlpha = 1;

  ctx.fillStyle    = '#fff';
  ctx.font         = 'bold 9px Courier New';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    p.type === 'spread' ? 'SPR' : p.type === 'shield' ? 'SHD' : '♥',
    p.x, p.y
  );
}
```

---

## Step 16 — HUD

The HUD is drawn every frame on top of everything else. It reads from the global state variables — no special HUD state object needed:

```js
function drawHUD(now) {
  ctx.font         = 'bold 13px Courier New';
  ctx.textBaseline = 'top';
  ctx.fillStyle    = '#c4c4e0';

  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${score}`, 12, 12);

  ctx.textAlign = 'center';
  ctx.fillText(`WAVE ${wave}`, W / 2, 12);

  ctx.textAlign = 'right';
  ctx.fillText(`HI  ${hiScore}`, W - 12, 12);

  // Lives as mini ships
  for (let i = 0; i < player.lives; i++) {
    drawShip(18 + i * 30, H - 22, 16, 18, '#60a5fa');
  }

  // Mute indicator — show on desktop always, on mobile only when muted
  if (!('ontouchstart' in window) || musicMuted) {
    ctx.font         = '11px Courier New';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle    = musicMuted ? '#f43f5e' : '#444466';
    ctx.fillText(musicMuted ? 'M: MUTED' : 'M: MUSIC', W - 12, 32);
  }

  // Active power-up bar
  if (player.powerUp) {
    const label = player.powerUp === 'spread' ? 'SPREAD SHOT' : 'SHIELD';
    const color = player.powerUp === 'spread' ? '#fb923c' : '#34d399';
    const maxMs = player.powerUp === 'spread' ? 8000 : 5000;
    const pct   = player.powerTimer / maxMs;

    ctx.fillStyle    = color;
    ctx.font         = 'bold 11px Courier New';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, W - 12, H - 18);

    ctx.fillStyle = '#333';
    ctx.fillRect(W - 94, H - 14, 82, 6);
    ctx.fillStyle = color;
    ctx.fillRect(W - 94, H - 14, 82 * pct, 6);
  }
}
```

The lives row draws small ships using the same `drawShip` helper used in the game. The power-up bar is a pair of overlapping `fillRect` calls: a dark background rectangle, then a colored foreground rectangle whose width is `82 * pct` where `pct = powerTimer / maxDuration`. One formula covers both power-up types.

---

## Step 17 — The screens

There are three game states: `'start'`, `'playing'`, `'gameover'`. The `draw()` function checks `gameState` and calls the appropriate draw function.

```js
function drawStartScreen(now) {
  ctx.fillStyle    = '#60a5fa';
  ctx.font         = 'bold 44px Courier New';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor  = '#60a5fa';
  ctx.shadowBlur   = 20;
  ctx.fillText('SKY ASSAULT', W / 2, H / 2 - 100);
  ctx.shadowBlur   = 0;

  drawShip(W / 2, H / 2 - 22, 52, 60, '#60a5fa');

  const isMobile = 'ontouchstart' in window;
  ctx.fillStyle = '#c4c4e0';
  ctx.font      = '15px Courier New';
  if (isMobile) {
    ctx.fillText('DRAG  — move ship',    W / 2, H / 2 + 60);
    ctx.fillText('AUTO-FIRE while held', W / 2, H / 2 + 84);
  } else {
    ctx.fillText('MOVE :  Arrow Keys / WASD', W / 2, H / 2 + 60);
    ctx.fillText('SHOOT:  Space',             W / 2, H / 2 + 84);
  }

  // Blinking prompt — toggles every 600ms
  if (Math.floor(now / 600) % 2) {
    ctx.fillStyle = '#facc15';
    ctx.font      = 'bold 17px Courier New';
    ctx.fillText(isMobile ? 'TAP TO START' : 'PRESS SPACE TO START', W / 2, H / 2 + 128);
  }

  ctx.fillStyle = '#666688';
  ctx.font      = '12px Courier New';
  ctx.fillText(`HI SCORE: ${hiScore}`, W / 2, H / 2 + 164);

  if (!isMobile) {
    ctx.fillStyle = '#444466';
    ctx.font      = '11px Courier New';
    ctx.fillText('M — toggle music', W / 2, H / 2 + 190);
  }
}

function drawGameOverScreen(now) {
  ctx.fillStyle = 'rgba(6,6,22,0.72)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle   = '#f43f5e';
  ctx.font        = 'bold 50px Courier New';
  ctx.shadowColor = '#f43f5e';
  ctx.shadowBlur  = 22;
  ctx.fillText('GAME OVER', W / 2, H / 2 - 70);
  ctx.shadowBlur  = 0;

  ctx.fillStyle = '#c4c4e0';
  ctx.font      = '20px Courier New';
  ctx.fillText(`SCORE : ${score}`, W / 2, H / 2);
  ctx.fillText(`WAVE  : ${wave}`,  W / 2, H / 2 + 34);

  if (score >= hiScore) {
    ctx.fillStyle = '#facc15';
    ctx.font      = 'bold 15px Courier New';
    ctx.fillText('NEW HIGH SCORE!', W / 2, H / 2 + 72);
  }

  if (Math.floor(now / 600) % 2) {
    ctx.fillStyle    = '#facc15';
    ctx.font         = 'bold 15px Courier New';
    const isMobile   = 'ontouchstart' in window;
    ctx.fillText(isMobile ? 'TAP TO PLAY AGAIN' : 'PRESS SPACE TO PLAY AGAIN', W / 2, H / 2 + 115);
  }
}
```

`Math.floor(now / 600) % 2` produces 0 or 1 alternating every 600ms — a simple blink with no extra variables.

`'ontouchstart' in window` detects a touch-capable device and swaps the instruction text. No user-agent sniffing needed.

---

## Step 18 — The draw loop

```js
function draw(now) {
  // Background (always)
  ctx.fillStyle = '#060616';
  ctx.fillRect(0, 0, W, H);

  // Stars (always — visible on all screens)
  for (const s of stars) {
    ctx.globalAlpha = s.brightness;
    ctx.fillStyle   = '#fff';
    ctx.fillRect(s.x, s.y, s.size, s.size);
  }
  ctx.globalAlpha = 1;

  if (gameState === 'start') {
    drawStartScreen(now);
    return;
  }

  if (gameState === 'gameover') {
    drawGameOverScreen(now);
    // Let particles finish playing out on the game-over screen
    for (const p of particles) {
      ctx.globalAlpha = p.life;
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }

  // ── Playing ────────────────────────────────────────────

  // Player (blink every 100ms while invincible)
  const visible = player.invincible <= 0 || Math.floor(now / 100) % 2 === 0;
  if (visible) {
    if (player.powerUp === 'shield') {
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth   = 2;
      ctx.globalAlpha = 0.5 + Math.sin(now / 180) * 0.5;
      ctx.shadowColor = '#34d399';
      ctx.shadowBlur  = 12;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.w + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur  = 0;
      ctx.globalAlpha = 1;
    }
    drawShip(player.x, player.y, player.w, player.h, '#60a5fa');
  }

  // Player bullets
  ctx.shadowColor = '#facc15';
  ctx.shadowBlur  = 8;
  ctx.fillStyle   = '#facc15';
  for (const b of bullets) {
    ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
  }
  ctx.shadowBlur = 0;

  // Enemy bullets
  ctx.shadowColor = '#f43f5e';
  ctx.shadowBlur  = 6;
  ctx.fillStyle   = '#f87171';
  for (const b of enemyBullets) {
    ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
  }
  ctx.shadowBlur = 0;

  // Enemies
  for (const e of enemies) drawEnemy(e);

  // Power-ups
  for (const p of powerUps) drawPowerUpIcon(p, now);

  // Particles
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle   = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // HUD
  drawHUD(now);

  // Wave-clear banner
  if (waveDone) {
    const elapsed = now - waveTimer;
    const alpha   = Math.min(1, elapsed / 300) * (1 - elapsed / WAVE_PAUSE);
    if (alpha > 0) {
      ctx.globalAlpha  = alpha;
      ctx.fillStyle    = '#facc15';
      ctx.font         = 'bold 34px Courier New';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor  = '#facc15';
      ctx.shadowBlur   = 16;
      ctx.fillText('WAVE CLEAR!', W / 2, H / 2);
      ctx.shadowBlur   = 0;
      ctx.globalAlpha  = 1;
    }
  }
}
```

The banner alpha formula `Math.min(1, elapsed/300) * (1 - elapsed/WAVE_PAUSE)` fades in over 300ms and then fades out over the full `WAVE_PAUSE` duration. When `alpha <= 0` we skip drawing it entirely.

The shield bubble around the player uses `Math.sin(now / 180)` to pulse between 0 and 1 alpha — same trick as the power-up icons.

---

## Step 19 — Sound effects (Web Audio API)

The browser has a built-in audio synthesizer called the **Web Audio API**. No files, no libraries — you describe sounds as graphs of nodes connected together, and the browser generates them in real time.

### The AudioContext

Everything routes through a single `AudioContext`:

```js
let audioCtx    = null;
let noiseBuffer = null;  // white noise, generated once and reused

function getAudio() {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
```

It's created lazily (on first call) because browsers block audio until the user interacts with the page. Calling `getAudio()` inside a keydown or touchstart handler satisfies that requirement.

### White noise buffer

Oscillators produce pitched tones. For unpitched sounds (explosions, snare), you need **white noise** — random values at every sample:

```js
function getNoise() {
  if (noiseBuffer) return noiseBuffer;   // generate once, reuse forever
  const ac   = getAudio();
  const buf  = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return noiseBuffer;
}
```

### How a sound is built

Every sound follows the same pattern: **source → modifier → gain → destination**.

```js
function sndShoot() {
  const ac   = getAudio();
  const osc  = ac.createOscillator();
  const gain = ac.createGain();

  osc.type = 'square';
  osc.frequency.setValueAtTime(900, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(200, ac.currentTime + 0.09);

  gain.gain.setValueAtTime(0.15, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.09);

  osc.connect(gain);
  gain.connect(ac.destination);

  osc.start();
  osc.stop(ac.currentTime + 0.09);
}
```

**`setValueAtTime` + `exponentialRampToValueAtTime`** — these schedule parameter changes on the audio clock. The ramp from 900Hz down to 200Hz is what gives the laser its "pew" quality.

**`exponentialRampToValueAtTime(0.001, ...)` not `0`** — exponential ramps can't reach zero (log of zero is undefined). `0.001` is inaudibly quiet.

### Waveform types

| Type | Character | Used for |
|---|---|---|
| `square` | Harsh, buzzy | Laser shots |
| `sawtooth` | Bright, aggressive | Player hurt, game over |
| `triangle` | Soft, hollow | Shield absorb, power-up chime |
| `sine` | Pure tone | Kick drum, explosion thump |

### All 8 sound functions

```js
function sndEnemyHit() {
  const ac = getAudio();
  const src = ac.createBufferSource(), filt = ac.createBiquadFilter(), gain = ac.createGain();
  src.buffer = getNoise();
  filt.type = 'bandpass'; filt.frequency.value = 900; filt.Q.value = 3;
  gain.gain.setValueAtTime(0.25, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.055);
  src.connect(filt); filt.connect(gain); gain.connect(ac.destination);
  src.start(); src.stop(ac.currentTime + 0.055);
}

function sndExplosion(big = false) {
  const ac  = getAudio();
  const dur = big ? 0.85 : 0.38;
  const vol = big ? 0.55 : 0.38;

  // Noise burst (the crackle)
  const src = ac.createBufferSource(), filt = ac.createBiquadFilter(), ng = ac.createGain();
  src.buffer = getNoise();
  filt.type = 'lowpass'; filt.frequency.value = big ? 500 : 1000;
  ng.gain.setValueAtTime(vol, ac.currentTime);
  ng.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
  src.connect(filt); filt.connect(ng); ng.connect(ac.destination);
  src.start(); src.stop(ac.currentTime + dur);

  // Low sine thump (the body of the boom)
  const osc = ac.createOscillator(), og = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(big ? 50 : 90, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(big ? 15 : 25, ac.currentTime + dur);
  og.gain.setValueAtTime(vol, ac.currentTime);
  og.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur * 0.75);
  osc.connect(og); og.connect(ac.destination);
  osc.start(); osc.stop(ac.currentTime + dur);
}

function sndPlayerHurt() {
  const ac = getAudio();
  const osc = ac.createOscillator(), gain = ac.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(280, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(55, ac.currentTime + 0.45);
  gain.gain.setValueAtTime(0.38, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.45);
  osc.connect(gain); gain.connect(ac.destination);
  osc.start(); osc.stop(ac.currentTime + 0.45);
}

function sndShieldAbsorb() {
  const ac = getAudio();
  const osc = ac.createOscillator(), gain = ac.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(180, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1400, ac.currentTime + 0.18);
  gain.gain.setValueAtTime(0.22, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.22);
  osc.connect(gain); gain.connect(ac.destination);
  osc.start(); osc.stop(ac.currentTime + 0.22);
}

function sndPowerUp() {
  const ac = getAudio();
  [523, 659, 784, 1047].forEach((freq, i) => {   // C5 E5 G5 C6
    const osc = ac.createOscillator(), gain = ac.createGain();
    const t = ac.currentTime + i * 0.075;
    osc.type = 'triangle'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    osc.connect(gain); gain.connect(ac.destination);
    osc.start(t); osc.stop(t + 0.11);
  });
}

function sndWaveClear() {
  const ac = getAudio();
  [523, 659, 784, 1047].forEach((freq, i) => {   // C5 E5 G5 C6
    const osc = ac.createOscillator(), gain = ac.createGain();
    const t = ac.currentTime + i * 0.11;
    osc.type = 'square'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.13, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(gain); gain.connect(ac.destination);
    osc.start(t); osc.stop(t + 0.16);
  });
}

function sndGameOver() {
  const ac = getAudio();
  [440, 349, 294, 220].forEach((freq, i) => {   // A4 F4 D4 A3 — descending
    const osc = ac.createOscillator(), gain = ac.createGain();
    const t = ac.currentTime + i * 0.22;
    osc.type = 'sawtooth'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    osc.connect(gain); gain.connect(ac.destination);
    osc.start(t); osc.stop(t + 0.32);
  });
}
```

| Function | Trigger | Technique |
|---|---|---|
| `sndShoot` | Player fires | Square osc, 900Hz → 200Hz |
| `sndEnemyHit` | Bullet hits, enemy survives | Bandpass noise burst |
| `sndExplosion(big)` | Enemy / boss killed | Lowpass noise + sine thump |
| `sndPlayerHurt` | Player takes damage | Sawtooth, 280Hz → 55Hz |
| `sndShieldAbsorb` | Shield absorbs hit | Triangle, 180Hz → 1400Hz (rising) |
| `sndPowerUp` | Power-up collected | 4-note ascending arpeggio (C E G C) |
| `sndWaveClear` | All enemies cleared | Same arpeggio in square wave |
| `sndGameOver` | Player dies | 4-note descending sawtooth (A F D A) |

---

## Step 20 — Background music (look-ahead scheduler)

The music system needs to stay perfectly in time across many seconds. A naive approach — `setTimeout(playNote, interval)` — drifts badly because JS timers are imprecise and can be delayed by other work on the main thread.

The solution is the **look-ahead scheduler**, a standard Web Audio pattern:

```
every 28ms (setTimeout):
    while nextNoteTime < audioContext.currentTime + 0.13:
        schedule note at nextNoteTime using the audio clock
        nextNoteTime += stepDuration
```

The audio clock (`ac.currentTime`) is a high-precision hardware timer. By scheduling notes into it slightly ahead of time (0.13s), the actual playback stays perfectly on the beat even if the setTimeout fires a few milliseconds late.

### Music state and constants

```js
let musicTimer    = null;   // setTimeout handle; null = stopped
let musicStep     = 0;      // current position in the 32-step loop
let musicNextTime = 0;      // AudioContext time to schedule next step
let musicMuted    = false;
let masterGain    = null;   // all music routes through this so mute is instant

const BPM      = 138;
const STEP_S   = 60 / BPM / 4;   // one 16th note ≈ 0.109 s
const LOOKAHEAD = 0.13;           // schedule this far ahead
const TICK_MS   = 28;             // scheduler poll interval
```

### Note frequencies and patterns

```js
// A minor pentatonic: A C D E G — any combination sounds good together
const N = {
  A2: 110.00,
  C3: 130.81, D3: 146.83, E3: 164.81, G3: 196.00, A3: 220.00,
  C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.00, A4: 440.00,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 784.00, A5: 880.00,
};

// Bass plays on every other step (8th notes). null = rest.
const BASS_PAT = [
  N.A2, null, N.A2, null,   N.E3, null, N.E3, null,
  N.A2, null, N.A2, null,   N.G3, null, N.G3, null,
  N.D3, null, N.D3, null,   N.A2, null, N.A2, null,
  N.E3, null, N.C3, null,   N.A2, null, N.A2, null,
];

// Melody arpeggio plays on every step (16th notes).
const MELODY_PAT = [
  N.A4, N.C5, N.E5, N.A5,   N.G4, N.A4, N.C5, N.E5,
  N.E5, N.G5, N.A5, N.G5,   N.E5, N.C5, N.A4, N.E5,
  N.D5, N.A4, N.D5, N.G5,   N.A5, N.G5, N.E5, N.D5,
  N.C5, N.E5, N.A5, N.E5,   N.C5, N.A4, N.E4, N.A4,
];

// Drums: 'k'=kick, 's'=snare, 'h'=hi-hat, null=rest
const DRUM_PAT = [
  'k', 'h', null, 'h',   's', 'h', null, 'h',
  'k', 'h',  'k', 'h',   's', 'h', null, 'h',
  'k', 'h', null, 'h',   's', 'h', null, 'h',
  'k', 'h', null, 'h',   's', 'h',  'k', 'h',
];

// Chord pad: two-note power chords, one per bar (fires on step 0 and step 16)
const CHORD_PAT = [
  [N.A2, N.E3],   // bar 1 — Am root + fifth
  [N.D3, N.A3],   // bar 2 — Dm root + fifth
];
```

All notes are in **A minor pentatonic** (A, C, D, E, G) — a scale where any combination of notes sounds good together.

### Master gain (music bus)

All music nodes connect to a `masterGain` node instead of directly to `ac.destination`. Muting is then one line:

```js
function getMasterGain() {
  if (masterGain) return masterGain;
  masterGain = getAudio().createGain();
  masterGain.gain.value = musicMuted ? 0 : 0.52;
  masterGain.connect(getAudio().destination);
  return masterGain;
}

function toggleMute() {
  musicMuted = !musicMuted;
  if (masterGain) {
    masterGain.gain.cancelScheduledValues(getAudio().currentTime);
    masterGain.gain.setValueAtTime(musicMuted ? 0 : 0.52, getAudio().currentTime);
  }
}
```

`cancelScheduledValues` clears any in-flight ramps before the `setValueAtTime` so the new value takes effect immediately.

### Low-level note and drum schedulers

```js
function musicNote(freq, type, vol, t, dur) {
  const ac   = getAudio();
  const osc  = ac.createOscillator();
  const gain = ac.createGain();
  osc.type           = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain);
  gain.connect(getMasterGain());
  osc.start(t);
  osc.stop(t + dur + 0.01);
}

function musicDrum(type, t) {
  const ac   = getAudio();
  const gain = ac.createGain();
  gain.connect(getMasterGain());

  if (type === 'k') {
    // Kick: sine with fast pitch drop — the classic electronic kick
    const osc = ac.createOscillator();
    osc.frequency.setValueAtTime(155, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.12);
    gain.gain.setValueAtTime(0.65, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(gain);
    osc.start(t); osc.stop(t + 0.14);

  } else if (type === 's') {
    // Snare: high-pass filtered noise burst
    const src = ac.createBufferSource(), filt = ac.createBiquadFilter();
    src.buffer = getNoise();
    filt.type = 'highpass'; filt.frequency.value = 1400;
    gain.gain.setValueAtTime(0.32, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    src.connect(filt); filt.connect(gain);
    src.start(t); src.stop(t + 0.1);

  } else if (type === 'h') {
    // Hi-hat: very-high-pass noise tick
    const src = ac.createBufferSource(), filt = ac.createBiquadFilter();
    src.buffer = getNoise();
    filt.type = 'highpass'; filt.frequency.value = 9000;
    gain.gain.setValueAtTime(0.09, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
    src.connect(filt); filt.connect(gain);
    src.start(t); src.stop(t + 0.025);
  }
}
```

### The sequencer

```js
function scheduleStep(t) {
  const step = musicStep % 32;

  if (BASS_PAT[step]) {
    musicNote(BASS_PAT[step], 'square', 0.30, t, STEP_S * 1.75);
  }
  musicNote(MELODY_PAT[step], 'square', 0.11, t, STEP_S * 0.72);
  if (DRUM_PAT[step]) musicDrum(DRUM_PAT[step], t);

  if (step === 0 || step === 16) {
    CHORD_PAT[step === 0 ? 0 : 1].forEach(freq => {
      musicNote(freq, 'triangle', 0.09, t, STEP_S * 15.5);
    });
  }

  musicStep++;
}

function musicTick() {
  if (!musicTimer) return;
  const ac = getAudio();
  while (musicNextTime < ac.currentTime + LOOKAHEAD) {
    scheduleStep(musicNextTime);
    musicNextTime += STEP_S;
  }
  musicTimer = setTimeout(musicTick, TICK_MS);
}

function startMusic() {
  if (musicTimer) stopMusic();   // clean restart on new game
  const ac      = getAudio();
  musicStep     = 0;
  musicNextTime = ac.currentTime + 0.05;
  musicTimer    = setTimeout(musicTick, 0);
}

function stopMusic() {
  clearTimeout(musicTimer);
  musicTimer = null;
}
```

> **Why can't you cancel already-scheduled notes?** Once a note is scheduled into the audio clock, it's committed. The cleanest approach is to let the lookahead tail finish (~0.13s). In practice this is inaudible.

---

## Step 21 — Stars (parallax background)

```js
function initStars() {
  stars = [];
  for (let i = 0; i < 130; i++) {
    stars.push({
      x:          Math.random() * W,
      y:          Math.random() * H,
      speed:      0.3 + Math.random() * 1.4,
      size:       Math.random() < 0.85 ? 1 : 2,
      brightness: 0.25 + Math.random() * 0.75,
    });
  }
}
```

Stars move downward each frame at varying speeds — slower stars appear further away, creating parallax depth without any 3D math. When a star exits the bottom of the canvas, it wraps to the top at a random `x` position. `brightness` drives `globalAlpha` when drawing, so stars vary from dim to bright.

---

## Step 22 — Boot and favicon

The very last code that runs before the game starts:

```js
// Generate a 32×32 favicon using the same Canvas 2D API as the game
(function setFavicon() {
  const fc   = document.createElement('canvas');
  fc.width   = fc.height = 32;
  const fctx = fc.getContext('2d');

  // Background with rounded corners
  fctx.fillStyle = '#060616';
  fctx.beginPath();
  fctx.roundRect(0, 0, 32, 32, 5);
  fctx.fill();

  // Stars
  [[4,5],[26,9],[22,3],[8,20],[28,24]].forEach(([x,y]) => {
    fctx.fillStyle = 'rgba(255,255,255,0.65)';
    fctx.fillRect(x, y, 1.5, 1.5);
  });

  // Ship body
  fctx.fillStyle = '#60a5fa';
  fctx.beginPath();
  fctx.moveTo(16, 2);
  fctx.lineTo(27, 30);
  fctx.lineTo(5,  30);
  fctx.closePath();
  fctx.fill();

  // Engine glow
  fctx.fillStyle  = '#facc15';
  fctx.shadowColor = '#facc15';
  fctx.shadowBlur  = 4;
  fctx.beginPath();
  fctx.ellipse(16, 30, 4, 3, 0, 0, Math.PI * 2);
  fctx.fill();
  fctx.shadowBlur = 0;

  // Cockpit window
  fctx.fillStyle = 'rgba(190,235,255,0.85)';
  fctx.beginPath();
  fctx.ellipse(16, 13, 3, 4, 0, 0, Math.PI * 2);
  fctx.fill();

  const link = document.createElement('link');
  link.rel   = 'icon';
  link.href  = fc.toDataURL('image/png');
  document.head.appendChild(link);
})();

initStars();
requestAnimationFrame(loop);
```

The favicon is drawn on a separate off-screen canvas and converted to a data URL with `toDataURL`. This approach requires zero image files — the browser tab icon is generated by the same drawing API as the game itself.

`initStars()` must run before the first `requestAnimationFrame(loop)` call, because `draw()` iterates `stars` immediately on the first frame.

---

## The full picture

```
Boot
  → setFavicon() (IIFE)
  → initStars()
  → requestAnimationFrame(loop)

Each frame (loop)
  → dt = min(now - lastTime, 50)
  → if playing: update(dt, now)
  → draw(now)
  → requestAnimationFrame(loop)

update(dt, now)
  → move: stars, player (keyboard + touch), bullets, enemyBullets, enemies, powerUps
  → shoot if Space held or touch active → playerShoot(now)
  → tick invincibility and power-up timers
  → collide: bullets vs enemies  → explode, score, maybeSpawnPowerUp
  → collide: enemyBullets vs player → hurtPlayer
  → collide: enemies vs player (ramming) → hurtPlayer
  → age particles (friction, decay)
  → if enemies.length === 0 → waveDone = true → sndWaveClear
  → if waveDone and pause elapsed → wave++, spawnWave

draw(now)
  → fillRect (background wipe)
  → stars
  → if start: drawStartScreen → return
  → if gameover: drawGameOverScreen + particles → return
  → player ship (blink if invincible, shield bubble if active)
  → player bullets, enemy bullets
  → enemies (drawEnemy per type)
  → power-ups (drawPowerUpIcon)
  → particles
  → drawHUD (score, wave, hi-score, lives, mute, power-up bar)
  → wave-clear banner (fade in/out)
```

---

## What to add next

| Feature | What it teaches |
|---|---|
| Enemy formation movement (all move together) | Shared state, group behavior |
| Scrolling terrain / obstacles | Tile-based world, camera offset |
| Local leaderboard | `localStorage`, JSON serialization |
| Animated sprites (spritesheets) | `drawImage`, frame indexing by time |
| Difficulty scaling | Parameterize all constants by wave |
| Dynamic music (tempo increases with wave) | Mutating `STEP_S` on the fly |

Each addition follows the same core loop: update state → draw state. Once you understand that, everything else is just more objects in the arrays.
