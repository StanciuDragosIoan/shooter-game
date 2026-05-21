# Sky Assault — Game Overview

## Top-level structure

The game is one HTML file. Everything lives inside a single `<script>` tag, organized into sections:

```
Canvas Setup
Input (keyboard + touch)
Audio (Web Audio API, synthesized sounds)
Music (procedural chiptune sequencer)
State (start / playing / gameover)
Entity collections (player, bullets, enemies, particles, stars, powerUps)
Update function  ← all game logic, runs every frame while playing
Draw function    ← all rendering, runs every frame always
Game Loop        ← requestAnimationFrame driving update + draw
Boot             ← favicon generation, initStars(), first requestAnimationFrame call
```

---

## The Game Loop

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

`requestAnimationFrame` fires roughly 60 times per second. Each call receives `now` — a high-resolution timestamp in milliseconds. `dt` is how many ms elapsed since the previous frame (typically ~16ms at 60fps). It's capped at 50ms so a tab switch or system stall doesn't cause a massive physics jump.

Every frame: update game state → draw everything → schedule the next frame.

---

## Canvas — two coordinate systems

The canvas has a fixed **logical size** of 480×700. All game math — positions, speeds, sizes — uses those numbers. This never changes.

The CSS `width` and `height` are set separately in `resizeCanvas()` to scale the canvas display to fit whatever screen the player has, while the logical coordinate system stays the same. Touch positions get converted from screen pixels to logical coordinates via `toCanvas()` before being used in game logic.

```js
const W = canvas.width = 480;
const H = canvas.height = 700;

function resizeCanvas() {
  const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  canvas.style.width  = Math.floor(W * scale) + 'px';
  canvas.style.height = Math.floor(H * scale) + 'px';
}
```

---

## State Machine

```js
let gameState = 'start';   // 'start' | 'playing' | 'gameover'
```

Three states, one variable. `update()` only runs when `'playing'`. `draw()` always runs but branches on state to show the right screen. State transitions: `startGame()` sets it to `'playing'`; `endGame()` sets it to `'gameover'`.

---

## Input

**Keyboard:** a `keys` object tracks which keys are currently held. `keydown` sets `keys[e.code] = true`; `keyup` sets it to `false`. Each frame, `update()` reads `keys['ArrowLeft']` etc. directly — no event queue needed.

**Touch:** a `touch` object tracks `{ active, x, y }`. `touchstart` and `touchmove` update it; `touchend/touchcancel` set `active = false`. In `update()`, if `touch.active`, the player glides toward `touch.x, touch.y` at `PLAYER_SPEED * 1.6`, capped by distance (so it doesn't overshoot).

---

## Entities as plain objects in arrays

Every game object is a plain JS object with position (`x`, `y`), size (`w`, `h`), and type-specific properties. Similar objects live in arrays:

```js
let bullets      = [];
let enemyBullets = [];
let enemies      = [];
let particles    = [];
let powerUps     = [];
```

**The filter pattern** — move and remove in one pass:

```js
bullets = bullets.filter(b => {
  b.x += b.dx;
  b.y += b.dy;
  return b.y > -20;   // false = remove from array
});
```

For enemies, `splice(i, 1)` is used when iterating backwards (`for i = length-1 downto 0`) to safely remove mid-loop.

---

## Collision Detection — AABB

All entities use `x, y` as their center and `w, h` as their size. Two axis-aligned rectangles overlap when they're close enough on both axes simultaneously:

```js
function hits(a, b) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
         Math.abs(a.y - b.y) < (a.h + b.h) / 2;
}
```

This is Axis-Aligned Bounding Box (AABB) collision — fast and sufficient for a shooter where nothing rotates.

---

## Player

```js
{
  x, y,           // center position
  w: 36, h: 40,
  lives: 5,
  invincible: 0,  // ms remaining; player blinks and can't be hit
  powerUp: null,  // 'spread' | 'shield' | null
  powerTimer: 0,  // ms remaining on active power-up
}
```

Movement is clamped each frame: `player.x = Math.max(w/2, Math.min(W - w/2, player.x))`.

Invincibility countdown: `player.invincible -= dt` each frame. While > 0 the player blinks (visible = `Math.floor(now / 100) % 2 === 0`) and `hurtPlayer()` returns early.

---

## Shooting

`playerShoot(now)` checks the cooldown timer before pushing a new bullet object into `bullets`. With the `spread` power-up, three bullets are pushed — one straight, two angled left/right with `dx` values.

Enemies fire toward the player using vector math: compute `(dx, dy)` from enemy to player, normalize to length 1, multiply by bullet speed. This makes enemy bullets always aim at the player's current position.

---

## Enemies

Four types, defined as templates:

| Type    | HP | Speed | Behavior                        | Score |
|---------|----|-------|---------------------------------|-------|
| basic   | 1  | 1.6   | Falls straight down             | 100   |
| zigzag  | 1  | 1.8   | Oscillates left/right (sin wave)| 150   |
| tank    | 3  | 0.9   | Falls straight, has HP bar      | 300   |
| boss    | 20 | 1.0   | Sinusoidal sweep, settles at top| 2000  |

Zigzag uses `e.angle += 0.045` each frame, then `e.x += Math.sin(e.angle) * 2.8`. Boss uses a similar approach but moves the full `x` position: `e.x = W/2 + Math.sin(e.angle) * (W/2 - 60)`.

`hitFlash` counts down frames after a hit, and the enemy is drawn white during that window.

---

## Wave Spawning

```js
if (waveNum % 5 === 0) {
  // Boss wave: one boss + 4 basic escorts
} else {
  // Grid formation: rows × cols, type varies by wave number and position
}
```

Wave progression: when `enemies.length === 0` and `!waveDone`, a timer starts. After `WAVE_PAUSE` (2200ms), `wave++` and `spawnWave(wave)` is called.

---

## Particles

`explode(x, y, color, count)` pushes `count` particle objects, each with a random angle, random speed, a `life` (starts at 1.0) and `decay` rate. Each frame: move by `dx/dy`, apply friction (`*= 0.96`), reduce life. Drawn with `ctx.globalAlpha = p.life` — they naturally fade out. Removed when `life <= 0`.

---

## Power-Ups

Drop from enemies at 13% chance on kill. Three types:
- `spread` — 3-way shot for 8 seconds
- `shield` — absorbs one hit (with invincibility window), lasts 5 seconds
- `life` — adds one life (capped at 5)

Drawn as pulsing circles (using `Math.sin(now / 280)` for the pulse). Collected on AABB overlap with the player.

---

## Drawing — Canvas 2D API

All rendering uses `ctx` (the 2D context). Draw order each frame:

1. Background fill (clears previous frame)
2. Stars
3. State-specific screen (`start` → title screen; `gameover` → overlay)
4. Player (with optional shield ring and blink logic)
5. Player bullets
6. Enemy bullets
7. Enemies (each type has its own shape)
8. Power-ups
9. Particles (with `globalAlpha = p.life`)
10. HUD (score, wave, hi-score, lives, power-up bar)
11. Wave-clear banner (fades in and out using `globalAlpha`)

Shapes are built with `ctx.beginPath()`, `ctx.moveTo()`, `ctx.lineTo()` / `ctx.ellipse()`, then `ctx.fill()`. Glow effects use `ctx.shadowColor` and `ctx.shadowBlur`.

---

## Audio — Web Audio API

No audio files. Every sound is synthesized at runtime by creating nodes, connecting them, scheduling an envelope, and letting them auto-clean up.

**Common pattern:**
1. Create an oscillator or buffer source node
2. Create a gain node (volume envelope)
3. Use `setValueAtTime` + `exponentialRampToValueAtTime` to shape the volume
4. Connect: source → gain → destination
5. Call `.start()` / `.stop(now + duration)` — node cleans itself up

**Noise:** a 0.5s white noise buffer is generated once and reused by all noise-based sounds (explosions, snare, hi-hat). Filtered with `BiquadFilterNode` to shape the timbre.

**AudioContext is created lazily** on the first user gesture (key press or touch) — browsers block audio before interaction.

---

## Music — Procedural Sequencer

A 32-step (2-bar) loop at 138 BPM plays four layers simultaneously: bass, melody arpeggio, drums, and a chord pad.

**Look-ahead scheduler pattern:** a `setTimeout` fires every 28ms. It checks how far ahead the AudioContext clock is and schedules any notes that fall within the next 130ms window. This decouples musical timing precision from JS timer jitter — `setTimeout` can drift, but AudioContext scheduling is sample-accurate.

```js
function musicTick() {
  while (musicNextTime < ac.currentTime + LOOKAHEAD) {
    scheduleStep(musicNextTime);
    musicNextTime += STEP_S;
  }
  musicTimer = setTimeout(musicTick, TICK_MS);
}
```

All music routes through a `masterGain` node — muting is instant with one gain value change.

---

## HUD

Drawn last (on top of everything). Uses `ctx.fillText()` with `textAlign` set appropriately for each element:
- Score: left-aligned, top-left
- Wave: center-aligned, top-center
- Hi-score: right-aligned, top-right
- Lives: mini ship icons drawn with `drawShip()` at the bottom-left
- Power-up bar: label + progress bar at bottom-right, percentage based on `powerTimer / maxMs`

---

## Screens

**Start screen:** title text with glow shadow, a large ship icon, controls, blinking "PRESS SPACE" prompt (toggled by `Math.floor(now / 600) % 2`), hi-score. Detects mobile via `'ontouchstart' in window` to show touch vs keyboard instructions.

**Game Over screen:** semi-transparent overlay drawn first so gameplay is visible underneath. Score, wave reached, new high score flash if applicable, blinking restart prompt.
