'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#f0f0f0', // 8 - comodín (WILD)
  null,      // 9 - POWER_CELL: nunca se dibuja con drawBlock
  '#f06292', // 10 - pentominó +
  '#26a69a', // 11 - pentominó U
  '#ffab91', // 12 - pentominó Y
  '#c0ca33', // 13 - single 1×1 (recompensa)
  '#78909c', // 14 - 3×3 hueca (reto)
];

// Valor de celda para los comodines que deja el power-up "Tinte".
const WILD = 8;
// Valor usado sólo en el shape de una pieza power-up: nunca se escribe en el tablero,
// pero collide() lo trata como bloque sólido.
const POWER_CELL = 9;

const POWERUPS = [
  { id: 'bomb',    icon: '💣', color: '#ff7043', name: 'Bomba',
    desc: 'Destruye un área de 3×3 alrededor del bloque' },
  { id: 'ray',     icon: '⚡', color: '#fff176', name: 'Rayo',
    desc: 'Limpia la fila y la columna completas' },
  { id: 'tint',    icon: '🎨', color: '#f06292', name: 'Tinte',
    desc: 'Convierte un color en comodines y completa sus filas' },
  { id: 'gravity', icon: '⬇',  color: '#4db6ac', name: 'Gravedad',
    desc: 'Compacta los huecos del tablero hacia abajo' },
  { id: 'freeze',  icon: '❄',  color: '#64b5f6', name: 'Congelar',
    desc: 'Pausa la caída durante 5 segundos' },
];

const POWER_EVERY = 5;    // líneas entre power-ups
const FREEZE_MS = 5000;   // duración de "Congelar"
const TOAST_MS = 2600;    // duración del aviso en pantalla

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  null,                                        // 8 - WILD, sin pieza
  null,                                        // 9 - POWER_CELL, sin pieza
  [[0,10,0],[10,10,10],[0,10,0]],             // + (pentominó)
  [[11,0,11],[11,11,11],[0,0,0]],             // U (pentominó)
  [[0,12,0,0],[12,12,0,0],[0,12,0,0],[0,12,0,0]], // Y (pentominó)
  [[13]],                                      // single 1×1
  [[14,14,14],[14,0,14],[14,14,14]],          // 3×3 hueca
];

// Piezas no estándar: aparecen ocasionalmente en vez de una de las 7 clásicas.
const PENTO_TYPES = [10, 11, 12];
const SINGLE_TYPE = 13;
const HOLLOW_TYPE = 14;

// Todos los tipos que pueden ocupar el tablero (sin contar el comodín).
const SOLID_TYPES = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14];

const PENTO_CHANCE = 0.12;   // probabilidad de pentominó (+, U, Y)
const HOLLOW_CHANCE = 0.05;  // probabilidad de la 3×3 hueca (a partir del nivel 3)
const HOLLOW_LEVEL = 3;      // nivel mínimo para que aparezca el reto
const HOLLOW_BONUS = 300;    // bonus (× nivel) al colocar la 3×3 hueca

const LINE_SCORES = [0, 100, 300, 500, 800];

const GRID_COLORS = { dark: '#22222e', light: '#d8d8e5' };
const THEME_KEY = 'tetris-theme';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const powerStatusEl = document.getElementById('power-status');
const powerDescEl = document.getElementById('power-desc');
const toastEl = document.getElementById('power-toast');
const toastIconEl = document.getElementById('toast-icon');
const toastNameEl = document.getElementById('toast-name');
const toastDescEl = document.getElementById('toast-desc');
let toastTimer = null;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, theme;
let powerPending, nextPowerAt, freezeMs;
// Recompensa pendiente: la siguiente pieza será el single 1×1 (tras un Tetris).
let singlePending;
// Identifica el bucle vigente: cualquier frame de una generación anterior se descarta.
let loopGen = 0;

function setTheme(t) {
  theme = t;
  document.body.classList.toggle('theme-light', t === 'light');
  themeToggle.checked = t === 'light';
  localStorage.setItem(THEME_KEY, t);
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPiece() {
  if (level >= HOLLOW_LEVEL && Math.random() < HOLLOW_CHANCE) return makePiece(HOLLOW_TYPE);
  if (Math.random() < PENTO_CHANCE)
    return makePiece(PENTO_TYPES[Math.floor(Math.random() * PENTO_TYPES.length)]);
  return makePiece(Math.floor(Math.random() * 7) + 1);
}

function randomPowerPiece() {
  const power = POWERUPS[Math.floor(Math.random() * POWERUPS.length)].id;
  return { type: POWER_CELL, power, shape: [[POWER_CELL]], x: Math.floor(COLS / 2), y: 0 };
}

function powerInfo(id) {
  return POWERUPS.find(p => p.id === id);
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    if (cleared >= 4) singlePending = true; // Tetris: recompensa con la pieza 1×1
    // El tinte puede limpiar más de 4 filas de golpe: fuera de la tabla, 200 por fila.
    score += (LINE_SCORES[cleared] ?? 200 * cleared) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    if (lines >= nextPowerAt) {
      powerPending = true;
      while (nextPowerAt <= lines) nextPowerAt += POWER_EVERY;
    }
    updateHUD();
  }
}

// ---- Power-ups ----

function applyPower(id, x, y) {
  switch (id) {
    case 'bomb':    powerBomb(x, y); break;
    case 'ray':     powerRay(x, y); break;
    case 'tint':    powerTint(); break;
    case 'gravity': powerGravity(); break;
    case 'freeze':  freezeMs = FREEZE_MS; break;
  }
  score += 50 * level;
  showPowerToast(id);
}

function powerBomb(x, y) {
  for (let r = y - 1; r <= y + 1; r++)
    for (let c = x - 1; c <= x + 1; c++)
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) board[r][c] = 0;
}

function powerRay(x, y) {
  if (y >= 0 && y < ROWS) board[y].fill(0);
  for (let r = 0; r < ROWS; r++) board[r][x] = 0;
}

// Tiñe un color al azar del tablero: sus bloques pasan a comodines y, en cada fila
// donde aparecía, los huecos se rellenan con comodines (esas filas quedan completas).
function powerTint() {
  const present = [];
  for (const t of SOLID_TYPES)
    if (board.some(row => row.includes(t))) present.push(t);
  if (!present.length) return;

  const target = present[Math.floor(Math.random() * present.length)];
  for (let r = 0; r < ROWS; r++) {
    if (!board[r].includes(target)) continue;
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === target || board[r][c] === 0) board[r][c] = WILD;
  }
}

// Compacta cada columna contra el fondo, eliminando huecos.
function powerGravity() {
  for (let c = 0; c < COLS; c++) {
    const stack = [];
    for (let r = 0; r < ROWS; r++) if (board[r][c]) stack.push(board[r][c]);
    for (let r = ROWS - 1; r >= 0; r--)
      board[r][c] = stack.length ? stack.pop() : 0;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (gameOver) return;
  // La pieza power-up nunca se fija en el tablero: dispara su efecto y desaparece.
  if (current.power) {
    applyPower(current.power, current.x, current.y);
  } else {
    merge();
    if (current.type === HOLLOW_TYPE) score += HOLLOW_BONUS * level; // reto superado
  }
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  // El power-up manda; la recompensa 1×1 espera su turno si coinciden.
  if (powerPending) {
    next = randomPowerPiece();
    powerPending = false;
  } else if (singlePending) {
    next = makePiece(SINGLE_TYPE);
    singlePending = false;
  } else {
    next = randomPiece();
  }
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
  updateHUD();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  updatePowerStatus();
}

function updatePowerStatus() {
  if (freezeMs > 0) {
    const freeze = powerInfo('freeze');
    powerStatusEl.textContent = `${freeze.icon} ${(freezeMs / 1000).toFixed(1)} s`;
    powerDescEl.textContent = freeze.desc;
    return;
  }
  const active = current && current.power ? current.power : (next && next.power ? next.power : null);
  if (!active) {
    powerStatusEl.textContent = '—';
    powerDescEl.textContent = 'Aparece cada 5 líneas';
    return;
  }
  const info = powerInfo(active);
  powerStatusEl.textContent = `${info.icon} ${info.name}`;
  powerDescEl.textContent = info.desc;
}

// Aviso flotante sobre el tablero al activarse un power-up.
function showPowerToast(id) {
  const info = powerInfo(id);
  toastIconEl.textContent = info.icon;
  toastNameEl.textContent = info.name;
  toastDescEl.textContent = info.desc;
  toastEl.style.setProperty('--toast-accent', info.color);
  toastEl.classList.remove('hidden');
  // reinicia la animación si ya había un aviso visible
  toastEl.classList.remove('show');
  void toastEl.offsetWidth;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hidePowerToast, TOAST_MS);
}

function hidePowerToast() {
  clearTimeout(toastTimer);
  toastTimer = null;
  toastEl.classList.remove('show');
  toastEl.classList.add('hidden');
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  if (colorIndex === WILD) {
    // marco para distinguir los comodines del resto de bloques claros
    context.strokeStyle = '#7aa2f7';
    context.lineWidth = 2;
    context.strokeRect(x * size + 2, y * size + 2, size - 4, size - 4);
  }
  context.globalAlpha = 1;
}

function drawPowerBlock(context, x, y, powerId, size, alpha) {
  const info = powerInfo(powerId);
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = info.color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.font = `${Math.floor(size * 0.6)}px system-ui, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#0f0f17';
  context.fillText(info.icon, x * size + size / 2, y * size + size / 2 + 1);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = GRID_COLORS[theme];
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // tras el game over solo queda el tablero: la pieza que colisionó no se dibuja
  if (gameOver) return;

  // ghost
  const gy = ghostY();
  if (current.power) {
    drawPowerBlock(ctx, current.x, gy, current.power, BLOCK, 0.2);
    drawPowerBlock(ctx, current.x, current.y, current.power, BLOCK);
    return;
  }
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (next.power) {
    drawPowerBlock(nextCtx, 1.5, 1.5, next.power, NB);
    return;
  }
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  stopLoop();
  draw(); // fija el estado final (el bucle ya no volverá a dibujar)
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    startLoop();
  } else {
    stopLoop();
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

// Detiene el bucle: invalida la generación actual, así ningún frame ya encolado
// (de este bucle o de uno anterior) puede seguir avanzando la partida.
function stopLoop() {
  loopGen++;
  cancelAnimationFrame(animId);
}

function startLoop() {
  stopLoop();
  const gen = loopGen;
  lastTime = performance.now();
  const frame = ts => {
    if (gen !== loopGen || gameOver || paused) return;
    tick(ts);
    if (gen !== loopGen || gameOver || paused) return;
    animId = requestAnimationFrame(frame);
  };
  animId = requestAnimationFrame(frame);
}

function tick(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  if (freezeMs > 0) {
    // Congelado: la pieza no baja, pero sigue siendo movible y rotable.
    freezeMs = Math.max(0, freezeMs - dt);
    dropAccum = 0;
    updatePowerStatus();
    draw();
    return;
  }
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
}

function init() {
  setTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark');
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  powerPending = false;
  singlePending = false;
  nextPowerAt = POWER_EVERY;
  freezeMs = 0;
  current = null;
  hidePowerToast();
  stopLoop(); // mata cualquier bucle previo antes de arrancar
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  restartBtn.blur(); // si no, Space/Enter volverían a pulsar el botón
  startLoop();
}

const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space', 'KeyX', 'KeyP'];

document.addEventListener('keydown', e => {
  // Evita el scroll de la página con flechas y barra espaciadora
  if (GAME_KEYS.includes(e.code)) e.preventDefault();
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

themeToggle.addEventListener('change', () => {
  setTheme(themeToggle.checked ? 'light' : 'dark');
  draw();
});

init();
