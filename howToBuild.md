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

- Arrow keys / WASD to move in all four directions
- Space to shoot (hold it down)
- Enemies shoot back — aim varies by wave
- Three enemy types + a boss every 5th wave
- Power-ups: spread shot, shield, extra life
- Score, hi-score (localStorage), wave counter

Everything lives in one file: `shooter.html`. ~350 lines of JS, no external dependencies.

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
CANVAS SETUP       — create canvas, get 2D context, set dimensions
CONSTANTS          — speeds, cooldowns, timings
STATE              — game-wide variables (score, wave, gameState, etc.)
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
UPDATE             — the full update loop
DRAW HELPERS       — drawShip, drawEnemy, drawPowerUpIcon
HUD                — score, lives, power-up bar
SCREENS            — start screen, game-over screen
DRAW               — the full draw loop
GAME LOOP          — loop(now) via requestAnimationFrame
BOOT               — initStars() + first requestAnimationFrame call
```

---

## Step 1 — Canvas setup

```html
<canvas id="game"></canvas>
<script>
  const canvas = document.getElementById('game');
  const ctx    = canvas.getContext('2d');
  const W = canvas.width  = 480;
  const H = canvas.height = 700;
</script>
```

`ctx` is the drawing context — everything you draw goes through it. `W` and `H` are the logical dimensions of the game world. All coordinates are in pixels within this 480×700 space.

> **Why hardcode the size?** A fixed canvas makes collision math simple — you always know the boundaries. Responsive sizing adds complexity (you'd have to scale all coordinates) that distracts from the core systems.

---

## Step 2 — State and entity collections

```js
let gameState  = 'start';   // 'start' | 'playing' | 'gameover'
let score      = 0;
let wave       = 1;

let player       = null;
let bullets      = [];
let enemyBullets = [];
let enemies      = [];
let particles    = [];
let powerUps     = [];
```

Entities are plain objects in arrays. A bullet is just `{ x, y, dx, dy, w, h }`. An enemy is `{ x, y, w, h, hp, type, ... }`. There are no classes.

> **Why plain objects and not classes?** Classes imply inheritance hierarchies and methods. For a game this size, simple data objects with standalone functions (`hits(a, b)`, `explode(x, y)`) are less code, easier to read, and easier to debug. The data is easy to inspect in the console — it's just a plain object.

---

## Step 3 — The game loop

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

> **Why pass `now` and `dt` instead of using `Date.now()` inside update?** Consistency. `now` comes from the browser's high-resolution timer and is the same value across every check in that frame. If you called `Date.now()` in two places, you might get different values.

---

## Step 4 — Input

```js
const keys = {};
document.addEventListener('keydown', e => { keys[e.code] = true;  });
document.addEventListener('keyup',   e => { keys[e.code] = false; });
```

Rather than responding to each individual `keydown` event, we track which keys are currently held in a `keys` object. Inside `update()`, we check `if (keys['ArrowLeft'])` every frame. This gives smooth, continuous movement — the standard approach for keyboard-controlled games.

> **Why `e.code` instead of `e.key`?** `e.code` is the physical key (`'KeyA'`, `'Space'`) regardless of keyboard layout or modifier keys. `e.key` gives the character typed (`'a'` vs `'A'`), which can vary with Shift or caps lock.

---

## Step 5 — Entities: factories, not constructors

```js
function createPlayer() {
  return {
    x: W / 2, y: H - 80,
    w: 36, h: 40,
    lives: 3,
    invincible: 0,
    powerUp: null, powerTimer: 0,
  };
}

function createEnemy(x, y, type) {
  const t = ENEMY_TEMPLATES[type];
  return { x, y, w: t.w, h: t.h, hp: t.hp, maxHp: t.hp, ... };
}
```

Each entity type has a factory function that returns a fresh plain object. `ENEMY_TEMPLATES` holds the stat block for each type — `createEnemy` just copies those stats onto a new object with a position.

> **Why a templates object instead of hardcoding stats in the function?** Separation of data and logic. If you want to tweak boss HP from 20 to 30, you change one number in `ENEMY_TEMPLATES`. If stats were hardcoded in a switch statement inside the factory, you'd have to hunt for it.

---

## Step 6 — Wave spawning

```js
function spawnWave(waveNum) {
  enemies  = [];
  waveDone = false;

  if (waveNum % 5 === 0) {
    // Boss wave: one big enemy + 4 escorts
  } else {
    // Grid: rows × cols, type depends on row and waveNum
    const rows = Math.min(2 + Math.floor(waveNum / 3), 5);
    const cols = Math.min(4 + Math.floor(waveNum / 2), 8);
    // place enemies at negative y so they fly in from the top
  }
}
```

Enemies start at `y = -60` or lower — off-screen above the canvas. Their `y` increases every frame, so they naturally fly in from the top. No teleporting, no special "enter" state.

The grid gets larger each wave. `Math.min(..., max)` caps it so the canvas doesn't become impossibly crowded. Wave 5, 10, 15... trigger boss waves instead.

---

## Step 7 — Update loop internals

`update(dt, now)` runs in this order every frame:

```
1. Move stars (slow scroll for parallax)
2. Move player (read keys, clamp to canvas bounds)
3. Shoot if Space held (respects cooldown)
4. Tick invincibility and power-up timers
5. Move player bullets
6. Move enemy bullets
7. Move enemies (type-specific patterns)
8. Move power-ups
9. Collide: player bullets → enemies
10. Collide: enemy bullets → player
11. Collide: enemies ramming player
12. Age particles
13. Check if wave is done → start next wave timer
```

The order matters. Movement before collision means bullets move to their new position before we check if they hit anything. If you reversed that, a fast bullet could tunnel through a thin enemy in one frame.

---

## Step 8 — Collision detection

```js
function hits(a, b) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
         Math.abs(a.y - b.y) < (a.h + b.h) / 2;
}
```

This is **AABB** — Axis-Aligned Bounding Box. Every entity is treated as a rectangle. Two rectangles overlap if they overlap on both the X axis and the Y axis simultaneously.

All entities use `{ x, y }` as their center point (not top-left corner). That's why the check is `abs(a.x - b.x) < (a.w + b.w) / 2` — the centers must be closer than the sum of their half-widths.

> **Why center-based instead of top-left?** Drawing helpers like `ctx.arc(x, y, r)` and `ctx.ellipse(x, y, ...)` are center-based. If your logical position and your drawing position use the same point, there's no offset arithmetic to track.

---

## Step 9 — Filtering arrays is how you remove entities

```js
bullets = bullets.filter(b => {
  b.x += b.dx;
  b.y += b.dy;
  return b.y > -20;  // false removes it from the array
});
```

There is no `removeBullet(id)` function. Instead, we replace the array each frame by filtering: bullets that return `true` survive, bullets that return `false` are gone. This handles both movement and cleanup in one pass, with no index juggling or splice-while-iterating bugs.

The same pattern handles bullet-enemy collisions:

```js
bullets = bullets.filter(b => {
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (hits(b, enemies[i])) {
      enemies[i].hp--;
      if (enemies[i].hp <= 0) enemies.splice(i, 1);
      return false;  // bullet is consumed
    }
  }
  return true;  // bullet missed everything, keep it
});
```

> **Why `enemies.splice(i, 1)` here but `enemies = enemies.filter(...)` elsewhere?** `splice` is used inside the bullet loop because we're already inside a `bullets.filter` — we need to remove enemies immediately as we find hits. Outside a loop, `filter` is cleaner and doesn't modify the array in-place while iterating.

---

## Step 10 — Enemy movement patterns

Different enemy types move differently, but all share the same `x, y` position and update every frame:

```js
if (e.type === 'basic') {
  e.y += e.speed;                   // straight down
}
if (e.type === 'zigzag') {
  e.angle += 0.045;
  e.x += Math.sin(e.angle) * 2.8;  // side-to-side sine wave
  e.y += e.speed * 0.55;
}
if (e.type === 'boss') {
  e.angle += 0.018;
  e.x = W / 2 + Math.sin(e.angle) * (W / 2 - 60);  // sweep side-to-side
  e.y = Math.min(e.y + ..., 110);   // settle near the top
}
```

`Math.sin(angle)` oscillates smoothly between -1 and +1 as `angle` increases. Multiply by an amplitude to control how wide the oscillation is.

---

## Step 11 — Drawing with Canvas

Nothing in the game uses DOM elements or HTML. Everything is drawn with Canvas 2D API calls inside `draw()`.

The canvas is **stateless** — it doesn't remember what you drew last frame. Every frame, you redraw everything from scratch:

```js
ctx.fillStyle = '#060616';
ctx.fillRect(0, 0, W, H);   // wipe the canvas with the background color
// ... then draw everything on top
```

**Drawing a shape:**
```js
ctx.fillStyle = '#60a5fa';
ctx.beginPath();
ctx.moveTo(x,         y - h/2);   // tip of the triangle
ctx.lineTo(x + w/2,   y + h/2);   // bottom-right
ctx.lineTo(x - w/2,   y + h/2);   // bottom-left
ctx.closePath();
ctx.fill();
```

**Glow effects** use `ctx.shadowBlur` and `ctx.shadowColor`. Always reset `shadowBlur` to `0` after using it — the shadow state persists and will bleed onto everything drawn after it if you forget.

---

## Step 12 — Particles

Particles are small circles that fade and drift after an explosion:

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
      decay: 0.02 + Math.random() * 0.03,
      size:  2 + Math.random() * 3,
      color,
    });
  }
}
```

Each particle has a `life` value starting at `1.0`. Every frame, `life -= decay`. When `life <= 0`, the particle is filtered out. The `life` value also drives `globalAlpha` and `size` — so particles naturally shrink and fade at the same rate they age.

`dx/dy` are multiplied by `0.96` each frame (friction), so particles slow down and drift rather than flying off at constant speed.

---

## Step 13 — Power-ups

Power-ups are just objects that fall down the screen like slow bullets:

```js
powerUps.push({ x, y, type: 'spread', w: 20, h: 20, dy: 1.5 });
```

The same `hits(player, p)` collision check picks them up. When collected, `applyPowerUp` modifies the player object directly and sets a `powerTimer`. Each frame, `powerTimer -= dt` counts down. When it hits zero, `powerUp` is cleared back to `null`.

The HUD draws a shrinking bar proportional to `powerTimer / maxDuration`. One formula, all power-up types.

---

## Step 14 — The screens

There are three game states: `'start'`, `'playing'`, `'gameover'`. The `draw()` function checks `gameState` and calls the appropriate draw function. The `'playing'` branch is the normal game. The others are overlays drawn on top of the starfield.

```js
function draw(now) {
  // background + stars (always)
  if (gameState === 'start')    { drawStartScreen(now); return; }
  if (gameState === 'gameover') { drawGameOverScreen(now); return; }
  // ... draw game entities
}
```

Pressing Space on any non-playing screen calls `startGame()`, which resets all state and calls `spawnWave(1)`.

---

## Step 15 — Sound effects (Web Audio API)

The browser has a built-in audio synthesizer called the **Web Audio API**. No files, no libraries — you describe sounds as graphs of nodes connected together, and the browser generates them in real time.

### The AudioContext

Everything routes through a single `AudioContext`:

```js
let audioCtx = null;

function getAudio() {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
```

It's created lazily (on first call) because browsers block audio until the user interacts with the page. Calling `getAudio()` inside a keydown or touchstart handler satisfies that requirement.

### How a sound is built

Every sound follows the same pattern: **source → modifier → gain → destination**.

```js
function sndShoot() {
  const ac   = getAudio();
  const osc  = ac.createOscillator();   // source: generates a tone
  const gain = ac.createGain();          // modifier: controls volume

  osc.type = 'square';
  osc.frequency.setValueAtTime(900, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(200, ac.currentTime + 0.09);

  gain.gain.setValueAtTime(0.15, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.09);

  osc.connect(gain);
  gain.connect(ac.destination);  // destination = speakers

  osc.start();
  osc.stop(ac.currentTime + 0.09);  // auto-cleans up when done
}
```

Two key concepts:

**`setValueAtTime` + `exponentialRampToValueAtTime`** — these schedule parameter changes on the audio clock, which is separate from and more precise than JS execution time. The ramp from 900Hz down to 200Hz is what gives the laser its "pew" quality.

**`exponentialRampToValueAtTime(0.001, ...)` not `0`** — exponential ramps can't reach zero (log of zero is undefined). `0.001` is inaudibly quiet and effectively silent.

### Waveform types

| Type | Character | Used for |
|---|---|---|
| `square` | Harsh, buzzy | Laser shots |
| `sawtooth` | Bright, aggressive | Player hurt, game over |
| `triangle` | Soft, hollow | Shield absorb, power-up chime |
| `sine` | Pure tone | Kick drum, explosion thump |

### Noise-based sounds

Oscillators produce pitched tones. For unpitched sounds (explosions, snare), you need **white noise** — random values at every sample:

```js
let noiseBuffer = null;

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

To shape noise into a specific sound, route it through a **BiquadFilter**:

```js
function sndExplosion() {
  const ac  = getAudio();

  // Noise crackle (the texture)
  const src  = ac.createBufferSource();
  const filt = ac.createBiquadFilter();
  const gain = ac.createGain();
  src.buffer       = getNoise();
  filt.type        = 'lowpass';
  filt.frequency.value = 1000;   // only low frequencies pass through
  gain.gain.setValueAtTime(0.38, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.38);
  src.connect(filt); filt.connect(gain); gain.connect(ac.destination);
  src.start(); src.stop(ac.currentTime + 0.38);

  // Sine thump (the body of the boom)
  const osc = ac.createOscillator();
  const og  = ac.createGain();
  osc.frequency.setValueAtTime(90, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(25, ac.currentTime + 0.38);
  og.gain.setValueAtTime(0.38, ac.currentTime);
  og.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.28);
  osc.connect(og); og.connect(ac.destination);
  osc.start(); osc.stop(ac.currentTime + 0.38);
}
```

Two node graphs running simultaneously produce one explosion: noise gives the crackle, the sine gives the low boom.

> **Why does the sine pitch drop?** A real explosion starts high-energy and dissipates. Dropping 90Hz → 25Hz over ~0.4s mimics that physically and sounds much more satisfying than a flat tone.

### All 8 sound events

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

## Step 16 — Background music (look-ahead scheduler)

The music system is more involved than sound effects because it needs to stay perfectly in time across many seconds. A naive approach — `setTimeout(playNote, interval)` — drifts badly because JS timers are imprecise and can be delayed by other work on the main thread.

The solution is the **look-ahead scheduler**, a standard Web Audio pattern:

```
every 28ms (setTimeout):
    while nextNoteTime < audioContext.currentTime + 0.13:
        schedule note at nextNoteTime using the audio clock
        nextNoteTime += stepDuration
```

The audio clock (`ac.currentTime`) is a high-precision hardware timer. By scheduling notes into it slightly ahead of time (0.13s), the actual playback stays perfectly on the beat even if the setTimeout fires a few milliseconds late.

### The sequencer data

The music is a 32-step loop (2 bars at 138 BPM). Three arrays define what plays at each step:

```js
const STEP_S = 60 / 138 / 4;   // one 16th note = ~0.109 seconds

// Bass: square wave, plays on even steps (8th notes). null = rest.
const BASS_PAT = [
  N.A2, null, N.A2, null,   N.E3, null, N.E3, null,
  // ...
];

// Melody: square wave arpeggio, plays every step (16th notes).
const MELODY_PAT = [
  N.A4, N.C5, N.E5, N.A5,   N.G4, N.A4, N.C5, N.E5,
  // ...
];

// Drums: 'k'=kick, 's'=snare, 'h'=hi-hat, null=rest
const DRUM_PAT = [
  'k', 'h', null, 'h',   's', 'h', null, 'h',
  // ...
];
```

All notes are in **A minor pentatonic** (A, C, D, E, G) — a scale where any combination of notes sounds good together, which is why it's used in so much game music.

### Scheduling one step

```js
function scheduleStep(t) {
  const step = musicStep % 32;

  if (BASS_PAT[step]) {
    musicNote(BASS_PAT[step], 'square', 0.30, t, STEP_S * 1.75);
  }
  musicNote(MELODY_PAT[step], 'square', 0.11, t, STEP_S * 0.72);
  if (DRUM_PAT[step]) musicDrum(DRUM_PAT[step], t);

  // Chord pad fires once per bar (step 0 and step 16)
  if (step === 0 || step === 16) {
    CHORD_PAT[step === 0 ? 0 : 1].forEach(freq => {
      musicNote(freq, 'triangle', 0.09, t, STEP_S * 15.5);
    });
  }

  musicStep++;
}
```

`t` is the exact audio clock time this step should sound. Every instrument scheduled at the same `t` plays in perfect sync.

### The drum sounds

Three drum types, all synthesis — no samples:

```js
// Kick: sine wave that drops from 155Hz → 28Hz in 0.12s
// The pitch drop is what makes it feel like a physical kick.

// Snare: highpass-filtered white noise (cuts everything below 1400Hz)
// leaving only the bright, papery top end of the hit.

// Hi-hat: same noise but through a very high cutoff (9000Hz)
// so only the faintest tick comes through.
```

### Master gain for instant mute

All music nodes connect to a `masterGain` node instead of directly to `ac.destination`. This means muting is one line — no need to stop and restart anything:

```js
masterGain.gain.setValueAtTime(musicMuted ? 0 : 0.52, ac.currentTime);
```

### Starting and stopping

```js
function startMusic() {
  if (musicTimer) stopMusic();    // clean restart on new game
  musicStep     = 0;
  musicNextTime = ac.currentTime + 0.05;
  musicTimer    = setTimeout(musicTick, 0);
}

function stopMusic() {
  clearTimeout(musicTimer);
  musicTimer = null;
  // already-scheduled notes will finish playing — can't cancel them,
  // but they're at most 0.13s away so the cutoff is imperceptible.
}
```

> **Why can't you cancel already-scheduled notes?** Once a note is scheduled into the audio clock, it's committed. You can disconnect the `masterGain` node to silence everything instantly, but the cleanest approach is just to let the lookahead tail finish (~0.13s). In practice this is inaudible.

---

## The full picture

```
Boot
  → initStars()
  → requestAnimationFrame(loop)

Each frame (loop)
  → dt = now - lastTime
  → if playing: update(dt, now)
  → draw(now)
  → requestAnimationFrame(loop)   ← schedules next frame

update(dt, now)
  → move: stars, player, bullets, enemyBullets, enemies, powerUps
  → check shoot cooldown → push to bullets[]
  → collide: bullets vs enemies  → explode, score, maybeSpawnPowerUp
  → collide: enemyBullets vs player → hurtPlayer
  → collide: enemies vs player (ramming) → hurtPlayer
  → age particles
  → if enemies.length === 0 → waveDone = true → start waveTimer

draw(now)
  → fillRect (background wipe)
  → stars
  → player ship (skip every other 100ms frame if invincible)
  → bullets, enemyBullets
  → enemies
  → powerUps
  → particles
  → HUD: score, wave, hi-score, lives, power-up bar
  → wave-clear banner (fades in/out between waves)
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
