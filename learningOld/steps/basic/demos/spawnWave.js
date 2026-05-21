const W = 480;
const H = 700;

let wave = 0;
let enemies = [];
let waveDone = false;
function createEnemy(x, y) {
  return { x, y, w: 28, h: 20, speed: 0.8 + wave * 0.1, shootRate: 0.0008 };
}

function spawnWave() {
  enemies = [];
  waveDone = false;
  const cols = Math.min(4 + n, 9);
  const rows = Math.min(1 + Math.floor(n / 2), 4);
  const spacing = Math.floor((W - 60) / cols);
  const startX = (W - (cols - 1) * spacing) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      enemies.push(createEnemy(startX + c * spacing, -40 - r * 50));
    }
  }
}

spawnWave(2);
console.log(enemies);
