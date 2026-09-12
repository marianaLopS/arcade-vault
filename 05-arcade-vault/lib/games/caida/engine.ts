// CAÍDA — port del Tetris de References/.../started-games/03-tetris/game.js.
//
// Las constantes y la lógica son las del original, número a número: cambiarlas
// es un cambio de diseño, no un detalle del port. Lo que sí cambia es la forma:
// el estado deja de ser global de módulo y vive en la clausura de la factoría,
// como en lib/games/asteroids/engine.ts, para que dos canvas no compartan
// partida.
import type { GameCallbacks, GameEngine } from "@/lib/games/engine";
const COLS = 10;
const ROWS = 20;
const BLOCK = 30;
/** Mundo lógico: tablero de 300×600 a la izquierda, panel de 120 px a la derecha. */
const PANEL_X = COLS * BLOCK;
const PANEL_W = 120;
const W = PANEL_X + PANEL_W;
const H = ROWS * BLOCK;
const COLORS: (string | null)[] = [
  null,
  "#4dd0e1", // I - cyan
  "#ffd54f", // O - yellow
  "#ba68c8", // T - purple
  "#81c784", // S - green
  "#e57373", // Z - red
  "#90caf9", // J - pale blue
  "#ffb74d", // L - orange
  "#f0f0f0", // 8 - comodín (WILD)
  null, // 9 - POWER_CELL: nunca se dibuja con drawBlock
  "#f06292", // 10 - pentominó +
  "#26a69a", // 11 - pentominó U
  "#ffab91", // 12 - pentominó Y
  "#c0ca33", // 13 - single 1×1 (recompensa)
  "#78909c", // 14 - 3×3 hueca (reto)
];
/** Valor de celda para los comodines que deja el power-up "Tinte". */
const WILD = 8;
// Valor usado sólo en el shape de una pieza power-up: nunca se escribe en el
// tablero, pero collide() lo trata como bloque sólido.
const POWER_CELL = 9;
type PowerId = "bomb" | "ray" | "tint" | "gravity" | "freeze";
type PowerUp = { id: PowerId; icon: string; color: string; name: string; desc: string };
const POWERUPS: PowerUp[] = [
  {
    id: "bomb",
    icon: "💣",
    color: "#ff7043",
    name: "Bomba",
    desc: "Destruye un área de 3×3 alrededor del bloque",
  },
  { id: "ray", icon: "⚡", color: "#fff176", name: "Rayo", desc: "Limpia la fila y la columna completas" },
  {
    id: "tint",
    icon: "🎨",
    color: "#f06292",
    name: "Tinte",
    desc: "Convierte un color en comodines y completa sus filas",
  },
  {
    id: "gravity",
    icon: "⬇",
    color: "#4db6ac",
    name: "Gravedad",
    desc: "Compacta los huecos del tablero hacia abajo",
  },
  { id: "freeze", icon: "❄", color: "#64b5f6", name: "Congelar", desc: "Pausa la caída durante 5 segundos" },
];
const POWER_EVERY = 5; // líneas entre power-ups
const FREEZE_MS = 5000; // duración de "Congelar"
const TOAST_MS = 2600; // duración del aviso en pantalla
const PIECES: (number[][] | null)[] = [
  null,
  [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ], // I
  [
    [2, 2],
    [2, 2],
  ], // O
  [
    [0, 3, 0],
    [3, 3, 3],
    [0, 0, 0],
  ], // T
  [
    [0, 4, 4],
    [4, 4, 0],
    [0, 0, 0],
  ], // S
  [
    [5, 5, 0],
    [0, 5, 5],
    [0, 0, 0],
  ], // Z
  [
    [6, 0, 0],
    [6, 6, 6],
    [0, 0, 0],
  ], // J
  [
    [0, 0, 7],
    [7, 7, 7],
    [0, 0, 0],
  ], // L
  null, // 8 - WILD, sin pieza
  null, // 9 - POWER_CELL, sin pieza
  [
    [0, 10, 0],
    [10, 10, 10],
    [0, 10, 0],
  ], // + (pentominó)
  [
    [11, 0, 11],
    [11, 11, 11],
    [0, 0, 0],
  ], // U (pentominó)
  [
    [0, 12, 0, 0],
    [12, 12, 0, 0],
    [0, 12, 0, 0],
    [0, 12, 0, 0],
  ], // Y (pentominó)
  [[13]], // single 1×1
  [
    [14, 14, 14],
    [14, 0, 14],
    [14, 14, 14],
  ], // 3×3 hueca
];
// Piezas no estándar: aparecen ocasionalmente en vez de una de las 7 clásicas.
const PENTO_TYPES = [10, 11, 12];
const SINGLE_TYPE = 13;
const HOLLOW_TYPE = 14;
/** Todos los tipos que pueden ocupar el tablero (sin contar el comodín). */
const SOLID_TYPES = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14];
const PENTO_CHANCE = 0.12; // probabilidad de pentominó (+, U, Y)
const HOLLOW_CHANCE = 0.05; // probabilidad de la 3×3 hueca (a partir del nivel 3)
const HOLLOW_LEVEL = 3; // nivel mínimo para que aparezca el reto
const HOLLOW_BONUS = 300; // bonus (× nivel) al colocar la 3×3 hueca
const LINE_SCORES = [0, 100, 300, 500, 800];
/** Sin tema claro: la rejilla es siempre la oscura del original. */
const GRID_COLOR = "#22222e";
type Board = number[][];
type Piece = {
  type: number;
  shape: number[][];
  x: number;
  y: number;
  /** Sólo la pieza power-up: dispara su efecto al fijarse y no se escribe en el tablero. */
  power?: PowerId;
};
function createBoard(): Board {
  return Array.from({ length: ROWS }, () => new Array<number>(COLS).fill(0));
}
function makePiece(type: number): Piece {
  const shape = PIECES[type]!.map((row) => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}
function randomPiece(level: number): Piece {
  if (level >= HOLLOW_LEVEL && Math.random() < HOLLOW_CHANCE) return makePiece(HOLLOW_TYPE);
  if (Math.random() < PENTO_CHANCE)
    return makePiece(PENTO_TYPES[Math.floor(Math.random() * PENTO_TYPES.length)]);
  return makePiece(Math.floor(Math.random() * 7) + 1);
}
function randomPowerPiece(): Piece {
  const power = POWERUPS[Math.floor(Math.random() * POWERUPS.length)].id;
  return { type: POWER_CELL, power, shape: [[POWER_CELL]], x: Math.floor(COLS / 2), y: 0 };
}
function powerInfo(id: PowerId): PowerUp {
  return POWERUPS.find((p) => p.id === id)!;
}
function collide(board: Board, shape: number[][], ox: number, oy: number): boolean {
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
function rotateCW(shape: number[][]): number[][] {
  const rows = shape.length,
    cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array<number>(rows).fill(0));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) result[c][rows - 1 - r] = shape[r][c];
  return result;
}
// ---- Power-ups: todos operan sobre el tablero que reciben ----
function powerBomb(board: Board, x: number, y: number) {
  for (let r = y - 1; r <= y + 1; r++)
    for (let c = x - 1; c <= x + 1; c++)
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) board[r][c] = 0;
}
function powerRay(board: Board, x: number, y: number) {
  if (y >= 0 && y < ROWS) board[y].fill(0);
  for (let r = 0; r < ROWS; r++) board[r][x] = 0;
}
// Tiñe un color al azar del tablero: sus bloques pasan a comodines y, en cada
// fila donde aparecía, los huecos se rellenan con comodines (esas filas quedan
// completas).
function powerTint(board: Board) {
  const present: number[] = [];
  for (const t of SOLID_TYPES) if (board.some((row) => row.includes(t))) present.push(t);
  if (!present.length) return;
  const target = present[Math.floor(Math.random() * present.length)];
  for (let r = 0; r < ROWS; r++) {
    if (!board[r].includes(target)) continue;
    for (let c = 0; c < COLS; c++) if (board[r][c] === target || board[r][c] === 0) board[r][c] = WILD;
  }
}
/** Compacta cada columna contra el fondo, eliminando huecos. */
function powerGravity(board: Board) {
  for (let c = 0; c < COLS; c++) {
    const stack: number[] = [];
    for (let r = 0; r < ROWS; r++) if (board[r][c]) stack.push(board[r][c]);
    for (let r = ROWS - 1; r >= 0; r--) board[r][c] = stack.length ? (stack.pop() as number) : 0;
  }
}
export function createCaidaGame(canvas: HTMLCanvasElement, callbacks: GameCallbacks): GameEngine {
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) throw new Error("CAÍDA: el canvas no tiene contexto 2D");
  const ctx: CanvasRenderingContext2D = ctx2d;
  canvas.width = W;
  canvas.height = H;
  // ── Estado de la partida ──
  let board: Board = createBoard();
  let current: Piece = makePiece(1);
  let next: Piece = makePiece(1);
  let score = 0;
  let lines = 0;
  let level = 1;
  let dropInterval = 1000;
  let dropAccum = 0;
  let gameOver = false;
  /** La siguiente pieza será un power-up (cada POWER_EVERY líneas). */
  let powerPending = false;
  let nextPowerAt = POWER_EVERY;
  /** Milisegundos que queda congelada la caída. */
  let freezeMs = 0;
  /** La siguiente pieza será el 1×1 de recompensa (tras un Tetris). */
  let singlePending = false;
  /** Aviso en pantalla del último power-up aplicado, y lo que le queda. */
  let toastPower: PowerId | null = null;
  let toastMs = 0;
  // ── Lógica de la partida ──
  function ghostY(): number {
    let gy = current.y;
    while (!collide(board, current.shape, current.x, gy + 1)) gy++;
    return gy;
  }
  function tryRotate() {
    const rotated = rotateCW(current.shape);
    const kicks = [0, -1, 1, -2, 2];
    for (const kick of kicks) {
      if (!collide(board, rotated, current.x + kick, current.y)) {
        current.shape = rotated;
        current.x += kick;
        return;
      }
    }
  }
  function merge() {
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        if (current.shape[r][c]) board[current.y + r][current.x + c] = current.shape[r][c];
  }
  function clearLines() {
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r].every((v) => v !== 0)) {
        board.splice(r, 1);
        board.unshift(new Array<number>(COLS).fill(0));
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
    }
  }
  function applyPower(id: PowerId, x: number, y: number) {
    switch (id) {
      case "bomb":
        powerBomb(board, x, y);
        break;
      case "ray":
        powerRay(board, x, y);
        break;
      case "tint":
        powerTint(board);
        break;
      case "gravity":
        powerGravity(board);
        break;
      case "freeze":
        freezeMs = FREEZE_MS;
        break;
    }
    score += 50 * level;
    toastPower = id;
    toastMs = TOAST_MS;
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
  function hardDrop() {
    const gy = ghostY();
    score += (gy - current.y) * 2;
    current.y = gy;
    lockPiece();
  }
  function softDrop() {
    if (!collide(board, current.shape, current.x, current.y + 1)) {
      current.y++;
      score += 1;
    } else {
      lockPiece();
    }
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
      next = randomPiece(level);
    }
    if (collide(board, current.shape, current.x, current.y)) gameOver = true;
  }
  function reset() {
    board = createBoard();
    score = 0;
    lines = 0;
    level = 1;
    dropInterval = 1000;
    dropAccum = 0;
    gameOver = false;
    powerPending = false;
    singlePending = false;
    nextPowerAt = POWER_EVERY;
    freezeMs = 0;
    toastPower = null;
    toastMs = 0;
    next = randomPiece(level);
    spawn();
  }
  // ── Dibujo ──
  // Igual que en Asteroids, todo lo que pinta recibe `ctx` por parámetro: aquí
  // no hay ningún canvas de módulo.
  function drawBlock(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    colorIndex: number,
    size: number,
    alpha = 1,
    ox = 0,
    oy = 0,
  ) {
    if (!colorIndex) return;
    const color = COLORS[colorIndex];
    if (!color) return;
    const px = ox + x * size;
    const py = oy + y * size;
    context.globalAlpha = alpha;
    context.fillStyle = color;
    context.fillRect(px + 1, py + 1, size - 2, size - 2);
    // highlight
    context.fillStyle = "rgba(255,255,255,0.12)";
    context.fillRect(px + 1, py + 1, size - 2, 4);
    if (colorIndex === WILD) {
      // marco para distinguir los comodines del resto de bloques claros
      context.strokeStyle = "#7aa2f7";
      context.lineWidth = 2;
      context.strokeRect(px + 2, py + 2, size - 4, size - 4);
    }
    context.globalAlpha = 1;
  }
  function drawPowerBlock(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    powerId: PowerId,
    size: number,
    alpha = 1,
    ox = 0,
    oy = 0,
  ) {
    const info = powerInfo(powerId);
    const px = ox + x * size;
    const py = oy + y * size;
    context.globalAlpha = alpha;
    context.fillStyle = info.color;
    context.fillRect(px + 1, py + 1, size - 2, size - 2);
    context.fillStyle = "rgba(255,255,255,0.12)";
    context.fillRect(px + 1, py + 1, size - 2, 4);
    context.font = `${Math.floor(size * 0.6)}px system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#0f0f17";
    context.fillText(info.icon, px + size / 2, py + size / 2 + 1);
    context.globalAlpha = 1;
  }
  function drawGrid() {
    ctx.strokeStyle = GRID_COLOR;
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
  function drawBoard() {
    drawGrid();
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) drawBlock(ctx, c, r, board[r][c], BLOCK);
    // tras el game over solo queda el tablero: la pieza que colisionó no se dibuja
    if (gameOver) return;
    const gy = ghostY();
    if (current.power) {
      drawPowerBlock(ctx, current.x, gy, current.power, BLOCK, 0.2);
      drawPowerBlock(ctx, current.x, current.y, current.power, BLOCK);
      return;
    }
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  }
  /** Rótulo pequeño del panel, en mayúsculas y espaciado. */
  function panelLabel(text: string, y: number) {
    ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#6f6f86";
    ctx.fillText(text, PANEL_X + 12, y);
  }
  /** Parte el texto en líneas que quepan en `maxWidth`. */
  function wrap(text: string, maxWidth: number): string[] {
    const out: string[] = [];
    let line = "";
    for (const word of text.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) out.push(line);
    return out;
  }
  // El panel sustituye al segundo canvas y a los <aside> del original: la pieza
  // siguiente, las líneas y el estado del power-up, dibujados en el mismo ctx.
  function drawPanel() {
    ctx.fillStyle = "#07070b";
    ctx.fillRect(PANEL_X, 0, PANEL_W, H);
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PANEL_X + 0.5, 0);
    ctx.lineTo(PANEL_X + 0.5, H);
    ctx.stroke();
    // SIGUIENTE: misma caja de 4×4 celdas de 30 px que el drawNext original.
    panelLabel("SIGUIENTE", 28);
    const boxY = 40;
    if (next.power) {
      drawPowerBlock(ctx, 1.5, 1.5, next.power, BLOCK, 1, PANEL_X, boxY);
    } else {
      const shape = next.shape;
      const offX = Math.floor((4 - shape[0].length) / 2);
      const offY = Math.floor((4 - shape.length) / 2);
      for (let r = 0; r < shape.length; r++)
        for (let c = 0; c < shape[r].length; c++)
          drawBlock(ctx, offX + c, offY + r, shape[r][c], BLOCK, 1, PANEL_X, boxY);
    }
    // LÍNEAS: no tiene casilla en el HUD de la plataforma, así que vive aquí.
    panelLabel("LÍNEAS", boxY + 150);
    ctx.font = "22px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "#e8e8f0";
    ctx.fillText(String(lines), PANEL_X + 12, boxY + 178);
    // PODER: lo que el original escribía en #power-status y #power-desc.
    panelLabel("PODER", boxY + 224);
    let titulo: string;
    let desc: string;
    if (freezeMs > 0) {
      const freeze = powerInfo("freeze");
      titulo = `${freeze.icon} ${(freezeMs / 1000).toFixed(1)} s`;
      desc = freeze.desc;
    } else {
      const active = current.power ?? next.power ?? null;
      if (active) {
        const info = powerInfo(active);
        titulo = `${info.icon} ${info.name}`;
        desc = info.desc;
      } else {
        titulo = "—";
        desc = "Aparece cada 5 líneas";
      }
    }
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "#e8e8f0";
    ctx.fillText(titulo, PANEL_X + 12, boxY + 248);
    ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "#6f6f86";
    let y = boxY + 266;
    for (const linea of wrap(desc, PANEL_W - 24)) {
      ctx.fillText(linea, PANEL_X + 12, y);
      y += 12;
    }
  }
  // Aviso del power-up recién aplicado. El original lo hacía con un <div> y un
  // setTimeout; aquí es un temporizador que descuenta `dt` dentro del bucle, así
  // la pausa lo congela en vez de dejarlo correr de fondo.
  function drawToast() {
    if (!toastPower || toastMs <= 0) return;
    const info = powerInfo(toastPower);
    // los últimos 400 ms se desvanecen
    const alpha = Math.min(1, toastMs / 400);
    const w = PANEL_X - 40;
    const x = 20;
    const y = 40;
    const h = 64;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(7,7,11,0.92)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = info.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = "20px system-ui, sans-serif";
    ctx.fillStyle = info.color;
    ctx.fillText(info.icon, x + 12, y + 32);
    ctx.font = "13px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(info.name.toUpperCase(), x + 42, y + 30);
    ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "#b9b9c9";
    let ty = y + 46;
    for (const linea of wrap(info.desc, w - 54)) {
      ctx.fillText(linea, x + 42, ty);
      ty += 11;
    }
    ctx.globalAlpha = 1;
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawBoard();
    drawPanel();
    drawToast();
  }
  // El bucle y la entrada llegan en el paso 5.
  reset();
  draw();
  void callbacks;
  void tryRotate;
  void hardDrop;
  void softDrop;
  void dropInterval;
  void dropAccum;
  return {
    start: () => {},
    pause: () => {},
    resume: () => {},
    restart: () => {
      reset();
      draw();
    },
    destroy: () => {},
  };
}
