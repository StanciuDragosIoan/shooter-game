# How to Build a 3D Space Shooter (Vanilla JS + Canvas 2D)

This is Sky Assault 3D — a third-person space shooter with real perspective projection, flat-shaded 3D models, and a chase camera. No WebGL, no Three.js, no libraries of any kind. Everything is drawn with the same Canvas 2D API you'd use to draw a rectangle.

The goal is to understand how 3D graphics actually work at the math level — projection, shading, depth sorting — and how to wire that into a complete, playable game.

Read `howToBuild.md` first if you haven't. This doc assumes you already understand the game loop, entity arrays, collision detection, and the Web Audio systems from that one. This doc only explains what's new in the 3D version.

---

## What you're building

```
  ┌──────────────────────────────────────────┐
  │  SCORE  2400     WAVE 3      HI  8000    │
  │                  · ·  ·  ·               │  ← distant stars
  │            ·  · ·   ·    ·               │
  │          ╱────────────────╲              │  ← perspective grid
  │        ╱    ╲  ╲   ╱  ╱   ╲             │
  │      ╱  ◉    ◉   ◉   ◉    ◉ ╲           │  ← 3D saucer enemies
  │           ◆       ◆          ╲          │  ← 3D tank enemies
  │                                          │
  │                  ▲                       │  ← player ship (3D, banking)
  │  ♥ ♥ ♥                  SPREAD SHOT    │
  └──────────────────────────────────────────┘
```

- Same controls as the 2D version (WASD / arrows + Space)
- Enemies are 3D polygon meshes that grow as they approach
- Player ship banks (rolls) when moving sideways
- A perspective grid on the "floor" gives spatial depth
- Stars stream toward the camera in 3D
- Four enemy types with unique 3D shapes: saucer, dart, tank, boss

Everything lives in one file: `rebuild3d.html`. No external dependencies.

---

## The fundamental difference from 2D

In the 2D game, entity positions are canvas pixel coordinates. An enemy at `x=240, y=100` appears at exactly that pixel.

In the 3D game, entity positions are **world coordinates** — abstract 3D space. To draw anything, you must first convert world coordinates to screen coordinates using a **projection**. That conversion is the heart of everything in this file.

```
World space [wx, wy, wz]
    → project()
    → Screen space [sx, sy]
    → ctx.lineTo(sx, sy)
```

---

## The coordinate system

```
        Y (up)
        │
        │
        └──── X (right)
       ╱
      Z (into screen — positive = away from camera)
```

- **Camera** sits at `[camX, 4.5, 0]`, looking in the +Z direction
- **Player** is fixed at Z=8 (in front of camera), moves freely in X and Y
- **Enemies** spawn at Z=70–90, fly toward Z=0 (toward the camera)
- **Bullets** travel in +Z (away from camera, toward enemies)

The camera is 4.5 units above Y=0 (the "ground"), which is why enemies and the player appear in the lower half of the screen — they're at Y=0 and the camera is above them looking slightly down.

---

## Step 1 — Perspective projection

This one function replaces all of the "x, y position = screen position" assumptions from the 2D game.

```js
const FOCAL = 420;  // focal length in pixels — controls field of view
const CAM_Y = 4.5;  // camera height above Y=0
let   camX  = 0;    // camera X, follows player

function project(wx, wy, wz) {
  if (wz < 0.15) return null;   // behind the camera — don't draw
  const s = FOCAL / wz;
  return {
    x: W / 2 + (wx - camX) * s,
    y: H / 2 - (wy - CAM_Y) * s,
    s,  // the scale — how big things appear at this depth
  };
}
```

The core formula is `s = FOCAL / wz`. This single division is all of perspective projection:

- Object at Z=10:  `s = 42`  — appears large (close)
- Object at Z=50:  `s = 8.4` — appears medium
- Object at Z=100: `s = 4.2` — appears small (far away)

The `s` value is used both for positioning (`worldX * s → screenX`) and for sizing — a model 2 world units wide appears `2 * s` pixels wide on screen. Far objects are automatically small. Close objects are automatically large. This is exactly how a real camera works.

> **Why subtract `camX` and `CAM_Y`?** The camera is not at the world origin. To project correctly you must express the world point relative to the camera. `(wx - camX)` is the X offset from the camera, `(wy - CAM_Y)` is the Y offset. These are what get scaled by `FOCAL/wz`.

> **Why `null` when `wz < 0.15`?** Objects behind the camera would produce a negative `s` and appear mirrored in front. Instead of drawing them wrongly, we skip them entirely.

> **Why flip Y?** Canvas Y increases downward. World Y increases upward. The minus sign in `-(wy - CAM_Y) * s` flips the axis so world-up = screen-up.

---

## Step 2 — 3D vector math

3D graphics needs three vector operations. They are small enough to write inline.

```js
// Cross product: returns a vector perpendicular to both a and b
const cross = (a, b) => [
  a[1]*b[2] - a[2]*b[1],
  a[2]*b[0] - a[0]*b[2],
  a[0]*b[1] - a[1]*b[0],
];

// Dot product: scalar measure of how parallel two vectors are
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];

// Normalize: scale a vector to length 1
const norm3 = a => {
  const l = Math.sqrt(dot(a, a)) || 1;
  return [a[0]/l, a[1]/l, a[2]/l];
};
```

These three operations are used for exactly one purpose in this game: **computing how bright each face of a 3D model should be**. The cross product gives you the face's normal (which way it's pointing). The dot product tells you how directly it faces the light. More on this in Step 5.

---

## Step 3 — Rotations

Two rotation types are needed.

**Y-axis rotation** — spins a point around the vertical axis. Used to:
- Face enemies toward the camera
- Spin the saucer enemy
- Sweep the boss side to side

```js
function rotY(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0]*c + v[2]*s, v[1], -v[0]*s + v[2]*c];
}
```

**Z-axis rotation** — tilts a point around the depth axis. Used only for:
- Banking the player ship left/right

```js
function rotZ(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0]*c - v[1]*s, v[0]*s + v[1]*c, v[2]];
}
```

These are the standard 3D rotation matrix formulas, written as functions that take and return `[x, y, z]` arrays.

**The transform pipeline** — converting a local model vertex to world space:

```js
function toWorld(v, pos, yaw, bank, scale) {
  let r = [v[0]*scale, v[1]*scale, v[2]*scale];  // 1. scale
  if (bank) r = rotZ(r, bank);                    // 2. bank (Z rotation)
  r = rotY(r, yaw);                               // 3. yaw (Y rotation)
  return [r[0]+pos[0], r[1]+pos[1], r[2]+pos[2]]; // 4. translate to world pos
}
```

Order matters. You scale first (so the rotation is around the model's own center), then rotate, then translate to the world position. Reversing the order produces wrong results.

---

## Step 4 — 3D Models

A 3D model is two arrays: **vertices** (points in local space) and **faces** (which vertices connect, plus a color).

```js
const PLAYER_VERTS = [
  [ 0,    0.15,  2.6],   // 0  nose tip
  [-3.0,  0,    -0.4],   // 1  left wing tip
  [ 2.5,  0,    -0.4],   // 2  right wing tip
  [ 0,    0.7,   0.4],   // 3  dorsal spine
  // ...
];

const PLAYER_FACES = [
  { verts: [0, 3, 1], color: '#7cb9fb' },  // top-left panel
  { verts: [0, 2, 3], color: '#60a5fa' },  // top-right panel
  // ...
];
```

Each vertex is in **local space** — coordinates relative to the model's own center, at its own scale. The nose of the player ship is at `[0, 0.15, 2.6]`, meaning 2.6 units in front of the model's origin, slightly above center.

All vertices are at **scale 1** in local space. The actual world size is set when you call `toWorld(..., scale)`. The player renders at `scale = 0.38`, enemies at `scale = 0.9–1.0`.

> **How to design a model**: work in local space with the origin at the model's center of mass. Decide which axis the "front" faces (we use +Z for all ships — nose forward). Keep models roughly within a -3 to +3 bounding box in local space; the `scale` parameter does the rest.

**The saucer model** uses a loop to generate its vertices mathematically:

```js
const ring = (n, r, y) =>
  Array.from({length: n}, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  });

const SAUCER_VERTS = [
  ...ring(8, 2.0,  0.28),   // top rim — 8 points equally spaced in XZ plane
  ...ring(8, 2.5, -0.22),   // bottom rim — wider and lower
  [0,  0.9,  0],            // dome apex
  [0, -0.5,  0],            // belly center
];
```

`Math.cos(a) * r` and `Math.sin(a) * r` place points around a circle. `a` steps evenly from 0 to 2π across the N segments. The result is a circular ring of N vertices at radius `r` and height `y`.

The faces for the saucer are also generated in a loop — each iteration produces a dome triangle, a band quad, and a belly triangle:

```js
const SAUCER_FACES = (() => {
  const f = [];
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;  // wrap around: index 7 connects back to index 0
    f.push({ verts: [i,    16, j         ], color: '#fca5a5' });  // dome
    f.push({ verts: [i,    8+i, 8+j, j  ], color: '#f87171' });  // band
    f.push({ verts: [8+i,  17, 8+j      ], color: '#b91c1c' });  // belly
  }
  return f;
})();
```

> **Why `(i + 1) % 8`?** The ring is a closed loop — vertex 7 must connect back to vertex 0. The modulo wraps the index around.

---

## Step 5 — Flat shading

This is what makes the models look 3D. Without shading, all faces are their base color and the shape looks flat. With shading, faces pointing toward the light are bright and faces pointing away are dark.

```js
const LIGHT = norm3([0.5, 1.0, -0.5]);  // direction light comes FROM

function renderMesh(localVerts, faces, pos, yaw, scale, bank, hitFlash) {
  const wv = localVerts.map(v => toWorld(v, pos, yaw, bank, scale));
  const sv = wv.map(v => project(v[0], v[1], v[2]));

  const out = [];
  for (const f of faces) {
    if (f.verts.some(i => !sv[i])) continue;  // skip if any vertex behind camera

    // Compute face normal using cross product of two edges
    const fw = f.verts.map(i => wv[i]);
    const e1 = [fw[1][0]-fw[0][0], fw[1][1]-fw[0][1], fw[1][2]-fw[0][2]];
    const e2 = [fw[2][0]-fw[0][0], fw[2][1]-fw[0][1], fw[2][2]-fw[0][2]];
    const n  = norm3(cross(e1, e2));

    // Brightness = how directly the face points at the light
    const br = Math.max(0.12, dot(n, LIGHT));

    // Scale the face's base color by brightness
    const rgb   = hexRgb(f.color);
    const color = litColor(rgb, br);
    out.push({ fs: f.verts.map(i => sv[i]), avgZ: ..., color });
  }
  // ... draw
}
```

The steps:

**1. Compute two edge vectors of the face.** Take the first three vertices of the face and subtract adjacent positions. This gives two vectors that lie in the plane of the face.

**2. Cross product → face normal.** The cross product of two vectors in a plane gives a vector perpendicular to that plane — pointing "outward" from the face. This is the normal.

**3. Dot product → brightness.** `dot(normal, lightDirection)` measures how parallel the two vectors are. If the face directly faces the light (same direction), dot = 1 → full brightness. If it faces away, dot = -1 → minimum brightness (clamped to 0.12 so nothing is pitch black).

**4. Scale the color.** Multiply each RGB channel by the brightness.

```js
function litColor(rgb, br) {
  return `rgb(${(rgb[0]*br)|0}, ${(rgb[1]*br)|0}, ${(rgb[2]*br)|0})`;
}
```

> **Why normalize the light direction?** The dot product only gives a value between -1 and 1 (measuring the angle) when both vectors have length 1. If they're not normalized, the dot product also encodes their magnitudes, which corrupts the brightness calculation.

> **Why `0.12` minimum?** Faces completely in shadow shouldn't be invisible — you need some ambient light so the model silhouette is always visible.

---

## Step 6 — Painter's algorithm (depth sorting)

Canvas 2D has no depth buffer (no Z-buffer). It has no way to automatically draw the closer polygon on top of the farther one. You have to sort manually.

```js
// Sort faces back-to-front before drawing
out.sort((a, b) => b.avgZ - a.avgZ);

for (const r of out) {
  ctx.fillStyle = r.color;
  ctx.beginPath();
  ctx.moveTo(r.fs[0].x, r.fs[0].y);
  for (let i = 1; i < r.fs.length; i++) ctx.lineTo(r.fs[i].x, r.fs[i].y);
  ctx.closePath();
  ctx.fill();
}
```

`avgZ` is the average world Z of all the face's vertices. Sorting by descending Z means far faces are drawn first, close faces are drawn last — and close faces paint over far ones, which is correct.

> **Why average Z and not min or max?** A single representative depth is needed for each face. Average Z works well for small convex faces. Alternatives (like centroid Z) produce the same result for triangles.

> **When does this break?** The painter's algorithm fails if two large polygons overlap each other in depth (like two crossing planes). For convex game-ship meshes this never happens — each face is clearly in front or behind each other face.

---

## Step 7 — The complete renderMesh function

Putting Steps 3–6 together:

```js
function renderMesh(localVerts, faces, pos, yaw, scale, bank, hitFlash) {
  // 1. Transform every vertex from local → world space
  const wv = localVerts.map(v => toWorld(v, pos, yaw, bank, scale));

  // 2. Project every vertex from world → screen space
  const sv = wv.map(v => project(v[0], v[1], v[2]));

  const out = [];
  for (const f of faces) {
    // 3. Skip any face with a vertex behind the camera
    if (f.verts.some(i => !sv[i])) continue;

    const fw   = f.verts.map(i => wv[i]);
    const avgZ = fw.reduce((s, v) => s + v[2], 0) / fw.length;

    // 4. Flat shading
    const e1  = [fw[1][0]-fw[0][0], fw[1][1]-fw[0][1], fw[1][2]-fw[0][2]];
    const e2  = [fw[2][0]-fw[0][0], fw[2][1]-fw[0][1], fw[2][2]-fw[0][2]];
    const n   = norm3(cross(e1, e2));
    const br  = Math.max(0.12, dot(n, LIGHT));
    const rgb = hexRgb(f.color);

    // 5. Hit flash: lerp face color toward white
    const color = hitFlash > 0
      ? flashColor(rgb, hitFlash)
      : litColor(rgb, br);

    out.push({ fs: f.verts.map(i => sv[i]), avgZ, color });
  }

  // 6. Painter's algorithm
  out.sort((a, b) => b.avgZ - a.avgZ);

  // 7. Draw each face as a filled polygon
  for (const r of out) {
    ctx.fillStyle   = r.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth   = 0.4;
    ctx.beginPath();
    ctx.moveTo(r.fs[0].x, r.fs[0].y);
    for (let i = 1; i < r.fs.length; i++) ctx.lineTo(r.fs[i].x, r.fs[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();  // thin dark outline sharpens face boundaries
  }
}
```

Every visible frame, this function runs for every enemy, the player ship, and any other mesh. It's the core of the entire 3D renderer.

---

## Step 8 — The camera

The camera follows the player's X position with a small lag. This creates a parallax effect — the world shifts slightly as the player moves, which reinforces the 3D depth.

```js
let camX = 0;

// In update(), every frame:
camX += (player.wx * 0.82 - camX) * 0.09;
```

`player.wx * 0.82` is the target camera position — 82% of the player's world X. The `* 0.09` lerp factor means the camera closes 9% of the gap each frame. At 60fps this gives a smooth ~0.5 second lag.

When `camX` equals `player.wx`, the player projects to exactly the center of the screen. Since it only reaches 82%, the player sits slightly off-center toward the direction of movement, which gives more visual space ahead.

> **Why not just set `camX = player.wx`?** A locked camera with no lag feels robotic. The small lag makes camera movement feel physical — like a real camera operator following a subject.

---

## Step 9 — The 3D starfield

Stars are points in 3D space. They move toward the camera each frame (decreasing Z), and are projected to the screen just like any other world point.

```js
function initStars() {
  stars = Array.from({length: 220}, () => ({
    x: (Math.random() - 0.5) * 90,
    y: (Math.random() - 0.5) * 70,
    z: Math.random() * 180 + 5,
    speed: 0.45 + Math.random() * 0.9,
  }));
}

function updateStars(tick) {
  for (const s of stars) {
    s.z -= s.speed * tick;
    if (s.z < 0.5) {
      s.z = 180 + Math.random() * 40;
      s.x = (Math.random() - 0.5) * 90;
      s.y = (Math.random() - 0.5) * 70;
    }
  }
}

function drawStars() {
  for (const s of stars) {
    const p = project(s.x, s.y, s.z);
    if (!p) continue;
    const br = Math.min(1, 5 / s.z + 0.15);
    const sz = Math.min(2.5, 60 / s.z);
    ctx.globalAlpha = br;
    ctx.fillStyle   = '#fff';
    ctx.fillRect(p.x - sz/2, p.y - sz/2, sz, sz);
  }
  ctx.globalAlpha = 1;
}
```

Three things scale automatically with depth (via `project` and the `s` value):
- **Screen position**: `project()` handles this
- **Brightness**: `5 / s.z` — close stars are brighter
- **Size**: `60 / s.z` — close stars are larger (capped at 2.5px)

When a star reaches Z < 0.5 (past the camera), it resets to a new random position far away. This creates the infinite tunnel effect.

---

## Step 10 — Ship banking

The player ship rolls into lateral movement, which makes the flight feel physical.

```js
// Track how much the ship is currently banked
player.bank = 0;  // in the player object

// In update(), every frame:
const targetBank = -moveX * 0.45;  // bank opposite to movement direction
player.bank += (targetBank - player.bank) * 0.12;  // lerp toward target
```

`moveX` is -1, 0, or +1 depending on input. `targetBank = -moveX * 0.45` means moving right → bank left (which looks correct visually — the ship tilts into the turn).

The bank is applied as a Z rotation in `toWorld()`:

```js
function toWorld(v, pos, yaw, bank, scale) {
  let r = [v[0]*scale, v[1]*scale, v[2]*scale];
  if (bank) r = rotZ(r, bank);   // tilt the whole model
  r = rotY(r, yaw);
  return [r[0]+pos[0], r[1]+pos[1], r[2]+pos[2]];
}
```

Because bank is applied before the Y rotation, the tilt is always around the ship's own nose axis — it rolls correctly regardless of which direction the ship is facing.

---

## Step 11 — Engine glow

Each ship has glowing engine exhausts. These are radial gradients drawn at specific world positions.

```js
function engineGlow(wx, wy, wz, r, g, b) {
  const p = project(wx, wy, wz);
  if (!p) return;
  const pr = 0.35 * p.s;  // glow radius scales with depth
  const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, pr);
  gr.addColorStop(0,   `rgba(${r},${g},${b},0.9)`);
  gr.addColorStop(0.5, `rgba(${r},${g},${b},0.3)`);
  gr.addColorStop(1,   'transparent');
  ctx.globalAlpha = 0.9;
  ctx.fillStyle   = gr;
  ctx.beginPath();
  ctx.arc(p.x, p.y, pr, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}
```

The glow world position is the world position of the engine exhaust, which is just behind the ship. For the player:

```js
// Left and right engines, slightly below and behind the ship center
engineGlow(player.wx - 0.265, player.wy - 0.114, player.wz - 0.494, 250, 204, 21);
engineGlow(player.wx + 0.265, player.wy - 0.114, player.wz - 0.494, 250, 204, 21);
```

The key is `p.s` — the projection scale. At `wz=8`, `p.s ≈ 52`, so `pr = 0.35 * 52 = 18px`. If the ship were at z=20, `p.s ≈ 21` and `pr = 7px`. The glow automatically shrinks as the ship recedes.

---

## Step 12 — The perspective grid

The grid on the "floor" of the scene gives your eye a reference plane for depth — without it the 3D scene feels ungrounded.

```js
ctx.strokeStyle = 'rgba(30,80,160,0.16)';
ctx.lineWidth   = 0.5;

// Vertical lines: constant X, span from near to far Z
for (let x = -30; x <= 30; x += 5) {
  const a = project(x, -2, 5);    // near end
  const b = project(x, -2, 160);  // far end
  if (!a || !b) continue;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

// Horizontal lines: constant Z, span from left to right X
for (let z = 10; z <= 160; z += 15) {
  const a = project(-30, -2, z);
  const b = project( 30, -2, z);
  if (!a || !b) continue;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}
```

All grid points are at `y = -2` (2 units below world Y=0). The camera at `y=4.5` looks down at it. The lines converge toward the vanishing point (center of screen, ~H/2) automatically — you get perspective convergence for free because `project()` handles it.

---

## Step 13 — 3D entity positions

In the 2D game, entities had `x` and `y`. In the 3D game, entities have `wx`, `wy`, `wz`:

```js
function createPlayer() {
  return {
    wx: 0, wy: 0, wz: 8,    // world position
    bank: 0,                  // visual roll angle
    lives: 3,
    // ...
  };
}

function createEnemy(wx, wy, wz, type) {
  return { wx, wy, wz, type, hp: ..., speed: ..., ... };
}
```

Enemies spawn far away and approach:

```js
// In update(), every frame:
if (e.type === 'basic') {
  e.wz -= e.speed * tick;        // fly straight toward camera
}
if (e.type === 'zigzag') {
  e.angle += 0.055 * tick;
  e.wx += Math.sin(e.angle) * 0.18 * tick;  // sine wave in X
  e.wz -= e.speed * tick;
}
if (e.type === 'boss') {
  e.angle += 0.02 * tick;
  e.wx  = Math.sin(e.angle) * 7;            // sweep side to side
  e.wz  = Math.max(e.wz - e.speed * tick, 22);  // settle at z=22
  e.yaw += 0.008 * tick;                    // slowly rotate
}
```

Bullets are 3D objects too. They move in +Z (forward) and their `(wx, wy)` determines where they appear on screen:

```js
bullets.push({ wx: player.wx, wy: player.wy, wz: player.wz + 1.5,
               dx: 0, radius: 0.3 });

// In update():
b.wx += (b.dx || 0);      // spread shot bullets drift sideways
b.wz += BULLET_SPEED * tick;
```

Bullets are drawn as perspective-correct line segments — two projected points connected:

```js
const p1 = project(b.wx, b.wy, b.wz);
const p2 = project(b.wx, b.wy, b.wz - 1.2);  // tail of the streak
if (!p1 || !p2) continue;
ctx.strokeStyle = '#facc15';
ctx.lineWidth   = Math.max(1.5, 0.12 * p1.s);  // thicker when close
ctx.beginPath();
ctx.moveTo(p1.x, p1.y);
ctx.lineTo(p2.x, p2.y);
ctx.stroke();
```

The bullet is always 1.2 world units long, but when close (high `p.s`) it appears as a long glowing streak. When far (low `p.s`) it's a short blip.

---

## Step 14 — 3D collision (sphere-sphere)

2D used AABB (rectangles). 3D uses sphere-sphere — simpler in 3D and good enough for game-sized objects.

```js
function dist3sq(a, b) {
  return (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2;
}

function hits3D(a, b, ra, rb) {
  return dist3sq([a.wx, a.wy, a.wz], [b.wx, b.wy, b.wz]) < (ra + rb)**2;
}
```

Every entity has a `radius`. Two entities collide if the distance between their centers is less than the sum of their radii.

Distance is computed squared (`dist3sq`) to avoid a `Math.sqrt` call — comparing `dist² < (ra+rb)²` is equivalent to `dist < ra+rb` but faster.

Each entity type has a tuned radius:

| Type | Radius |
|---|---|
| Player | 1.8 |
| Bullet | 0.3 |
| Basic saucer | 2.2 |
| Dart | 2.0 |
| Tank | 2.5 |
| Boss | 6.0 |

> **Why spheres and not the actual 3D mesh shape?** Computing intersections between arbitrary polygon meshes is complex and expensive. A sphere per entity gives 90% of the accuracy for 1% of the code. Players only notice wrong collision on direct head-on hits, which feel close enough.

---

## Step 15 — 3D particles

Particles are the same concept as 2D but with a third axis. They explode in all directions (a sphere of velocity), not just in a flat circle.

```js
function explode(wx, wy, wz, color, count) {
  for (let i = 0; i < count; i++) {
    const spd   = 0.04 + Math.random() * 0.14;
    const theta = Math.random() * Math.PI * 2;   // angle around Y axis
    const phi   = (Math.random() - 0.5) * Math.PI;  // angle above/below XZ plane

    particles.push({
      wx, wy, wz,
      dx: Math.cos(phi) * Math.cos(theta) * spd,
      dy: Math.sin(phi) * spd,
      dz: Math.cos(phi) * Math.sin(theta) * spd,
      life: 1, decay: 0.02 + Math.random() * 0.03,
      size: 0.07 + Math.random() * 0.1, color,
    });
  }
}
```

`theta` and `phi` are spherical coordinates. Together they uniformly distribute particles in all directions around the 3D explosion point.

Drawing particles uses the same `project()` call as everything else. The `size` (in world units) multiplied by `p.s` gives the screen pixel radius — larger when close, smaller when far:

```js
ctx.arc(sp.x, sp.y, Math.max(0.5, p.size * p.life * sp.s), 0, Math.PI * 2);
```

A gentle downward force (`p.dy -= 0.001 * tick`) gives particles a slight arc as they fall, which looks more natural than straight-line drift.

---

## Step 16 — Touch controls in 3D

In the 2D game, touch position mapped directly to canvas pixel space. In 3D, you need to convert the screen position back to world space.

The inverse of the projection formula:

```js
// project(): world → screen
// screenX = W/2 + (wx - camX) * (FOCAL / wz)
// screenY = H/2 - (wy - CAM_Y) * (FOCAL / wz)

// Inverse: screen → world (at a known depth wz)
// wx = (screenX - W/2) / (FOCAL / wz) + camX
// wy = -(screenY - H/2) / (FOCAL / wz) + CAM_Y

// In update(), when touch is active:
const s   = FOCAL / player.wz;
const twx = (touch.x - W/2) / s + camX;
const twy = -(touch.y - H/2) / s + CAM_Y;
```

This gives the world X/Y position that corresponds to where the player touched, at the player's Z depth. The ship then moves toward that point:

```js
const dx = twx - player.wx, dy = twy - player.wy;
const dist = Math.sqrt(dx*dx + dy*dy);
if (dist > 0.1) {
  const spd = Math.min(PLAYER_SPEED * 1.5, dist) * tick;
  // normalise dx/dy and apply speed
}
```

> **Why use the player's Z depth for the inverse projection?** You're computing "what world position corresponds to this screen position?" but the answer depends on which Z plane you're asking about. Using the player's Z gives you the world position at the player's depth — which is exactly where you want the ship to go.

---

## Step 17 — `tick` and frame-rate independence

```js
const tick = dt / 16.667;  // 1.0 at 60fps, 0.5 at 120fps, 2.0 at 30fps
```

Every movement is multiplied by `tick` instead of applying a fixed per-frame value. This makes the game run at the same speed on a 30fps phone and a 144fps monitor.

```js
e.wz -= e.speed * tick;     // speed in world units per 60fps frame
b.wz += BULLET_SPEED * tick;
player.wx += mx * PLAYER_SPEED * tick;
```

`tick = 1.0` at exactly 60fps. At 120fps (dt = 8ms), `tick = 0.5`, so each frame moves half as far but there are twice as many frames — same real-world speed.

---

## The draw order

Drawing order matters in 3D — you generally go back to front:

```
1. Background gradient wipe
2. Stars (furthest — z=180 down to z=5)
3. Perspective grid (floor plane)
4. Power-ups
5. Enemy bullets
6. Enemies (sorted back→front by .wz)
7. Player bullets
8. Particles
9. Player ship (always drawn last — always on top)
10. HUD (2D overlay in screen space — no projection)
```

The HUD is still drawn in plain 2D canvas coordinates — `ctx.fillText`, `ctx.fillRect` — with no projection. It's a flat overlay on top of the 3D scene.

---

## The full picture

```
Boot
  → initStars()
  → requestAnimationFrame(loop)

Each frame (loop)
  → dt = now - lastTime
  → tick = dt / 16.667
  → if playing: update(dt, now, tick)
  → draw(now)

update(dt, now, tick)
  → updateStars(tick)
  → lerp camX toward player.wx * 0.82
  → read keys / touch → compute moveX, moveY
  → move player: wx += moveX * SPEED * tick
  → lerp player.bank toward -moveX * 0.45
  → move bullets: wz += BULLET_SPEED * tick
  → move enemy bullets toward player
  → move enemies: wz -= speed * tick (+ type-specific patterns)
  → enemies shoot toward player
  → move power-ups
  → collide: bullets vs enemies (hits3D) → explode, score
  → collide: enemy bullets vs player → hurtPlayer
  → collide: enemies vs player (ram) → hurtPlayer
  → age particles
  → if enemies.length === 0 → waveDone → waveTimer

draw(now)
  → background gradient
  → drawStars()
  → perspective grid
  → power-ups (project → arc)
  → enemy bullets (project → arc)
  → enemies sorted by .wz → renderMesh() each
  → player bullets (project two points → lineTo streak)
  → particles (project → arc)
  → player ship → renderMesh()
  → engine glows → engineGlow()
  → drawHUD() [2D overlay, no projection]

renderMesh(localVerts, faces, pos, yaw, scale, bank, hitFlash)
  → toWorld() every vertex: scale → rotZ(bank) → rotY(yaw) → translate
  → project() every vertex: FOCAL/wz → screen x,y
  → per face: cross product → normal → dot(LIGHT) → brightness → color
  → sort faces by avgZ descending
  → draw each face as filled polygon
```

---

## What's the same as the 2D version

Everything outside the renderer is identical:
- Game loop (`requestAnimationFrame`, delta time, `update` + `draw`)
- Entity arrays and filter-as-remove
- Wave spawning logic
- Power-up system
- Audio (all 8 sound effects, same synthesis)
- Music (same look-ahead scheduler, same patterns)
- Hi-score via `localStorage`
- Mobile touch support

The 3D renderer is a layer that sits between the game logic and the canvas. The game logic doesn't know or care that rendering is 3D — it just has `wx, wy, wz` instead of `x, y`.

---

## What to add next

| Feature | What it teaches |
|---|---|
| Back-face culling | Dot product of face normal with camera direction; skip faces pointing away |
| Z-buffer | Per-pixel depth tracking; solves painter's algorithm failures |
| Texture mapping | UV coordinates per vertex; `ctx.transform` per face |
| Phong shading | Per-vertex normals + interpolation for smooth shading |
| Point lights | Multiple light sources; sum their contributions per face |
| Shadow casting | Project geometry onto a plane from a light's perspective |
| Fog | Lerp face colors toward a background color based on depth |
| 3D audio | `PannerNode` + `AudioListener` in Web Audio — sound position in 3D space |

Each addition builds directly on the math already in this game. Back-face culling uses the same dot product you already use for shading. Fog uses the `avgZ` you already compute. Start with back-face culling — it halves the number of faces drawn and teaches you to think about which way normals point.
