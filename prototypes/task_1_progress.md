# Task 1 — Progress Log

## Done

### Canvas
- Got canvas element by id
- Set `canvas.width = 480` and `canvas.height = 400` (learned: use these, not `clientWidth/clientHeight`)
- Got 2D context with `getContext('2d')`
- Set `ctx.fillStyle = '#060616'` then `ctx.fillRect(0, 0, canvas.width, canvas.height)` to paint background
- Learned: `fillStyle` just sets the color, `fillRect` is what actually paints

### Constants
- `PLAYER_SPEED = 5`
- `BULLET_SPEED = 12`
- `SHOOT_COOLDOWN = 200`
- `ENEMY_SPEED = 1.5`

### Input
- `keys = {}` object to track held keys
- `keydown` listener sets `keys[e.code] = true`
- `keyup` listener sets `keys[e.code] = false`
- Learned: `e.preventDefault()` for Space only (in keydown only), not all keys
- Note: current file has `e.preventDefault()` in `keyUpHandler` for Space — move it to `keyDownHandler`

---

## Still To Do (in order)

1. **Player object** — `{ x: canvas.width/2, y: canvas.height - 60, w: 36, h: 40 }`
2. **Enemy object** — random x between 60–420, y starts at -30, w: 32, h: 28
3. **Bullet variable** — starts as `null`, becomes an object `{ x, y, w: 4, h: 12 }` when fired
4. **`shootTimer` variable** — starts at 0, tracks timestamp of last shot
5. **`gameState` variable** — starts as `'playing'`, can become `'win'` or `'lose'`
6. **`hits(a, b)` function** — AABB collision: checks if two center+size rectangles overlap
7. **`update(now)` function**
   - Move player left/right from `keys`, clamp to canvas edges
   - Move bullet upward, set to null if off top
   - Move enemy downward
   - Shoot if Space held + cooldown elapsed + no bullet
   - Check bullet vs enemy collision → `'win'`
   - Check enemy off bottom → `'lose'`
8. **`draw()` function**
   - Fill background
   - Draw player triangle (pointing up, blue)
   - Draw bullet rect if exists (yellow)
   - Draw enemy triangle (pointing down, red)
   - Draw win/lose text if state is not `'playing'`
9. **`loop(now)` function** — call `update(now)`, call `draw()`, call `requestAnimationFrame(loop)`
10. **Boot** — call `requestAnimationFrame(loop)` once at the bottom to start everything

---

## Key Concepts Learned So Far
- `canvas.width/height` sets logical size; `clientWidth/clientHeight` is read-only CSS layout
- `fillStyle` = set color, `fillRect` = paint it
- Game input: record key state in an object, read it every frame in the loop — don't act inside the event listener
- `e.code` gives the key name string (e.g. `'ArrowLeft'`, `'Space'`)
