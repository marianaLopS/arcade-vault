// SNAKE — motor escrito desde cero contra el contrato GameEngine.
//
// No hay original del que portar: las constantes de este archivo son el diseño
// del juego (SPEC 10, paso 2). Cambiarlas es rediseñar, no implementar. Como en
// los demás motores, todo el estado vive en la clausura de la factoría.
import type { GameCallbacks, GameEngine } from "@/lib/games/engine";
import { FRUIT_SPRITES } from "@/lib/games/snake/sprites";
const W = 800;
const H = 600;
const CELL = 25;
const COLS = 32;
const ROWS = 24;
const START_LEN = 3;
const START_HEAD = { x: 8, y: 12 };
const START_DIR: Dir = "right";
const TICK_BASE = 150;
const TICK_STEP = 10;
const TICK_MIN = 60;
const FRUITS_PER_LEVEL = 5;
const POINTS_PER_FRUIT = 10;
const MAX_TURNS = 2;
const DT_MAX = 50;
const FRUIT_SRC = "/juegos/snake/fruits.png";
const GRID_COLOR = "#0f1a12";
const BODY_COLOR = "#39ff14";
const HEAD_COLOR = "#b6ff9e";
type Cell = { x: number; y: number }; // coordenadas de grilla, origen arriba-izquierda
type Dir = "up" | "down" | "left" | "right";
const DELTA: Record<Dir, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const OPPOSITE: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };
function tickMs(level: number): number {
  return Math.max(TICK_MIN, TICK_BASE - TICK_STEP * (level - 1));
}
function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}
export function createSnakeGame(canvas: HTMLCanvasElement, callbacks: GameCallbacks): GameEngine {
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) throw new Error("SNAKE: el canvas no tiene contexto 2D");
  const ctx: CanvasRenderingContext2D = ctx2d;
  canvas.width = W;
  canvas.height = H;
  // ── Estado de la partida ──
  let snake: Cell[] = [];
  let dir: Dir = START_DIR;
  /** Giros pendientes, validados contra el último encolado. Máximo MAX_TURNS. */
  let turns: Dir[] = [];
  let fruit: Cell = { x: 0, y: 0 };
  let fruitSprite = 0;
  let score = 0;
  let level = 1;
  let eaten = 0;
  let tickAccum = 0;
  /** Quieta hasta el primer giro: no choca al abrir la página ni tras reiniciar. */
  let waiting = true;
  let state: "playing" | "gameover" = "playing";
  // ── Lógica de la partida ──
  function placeFruit() {
    const free: Cell[] = [];
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        if (!snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
    // Tablero lleno: no hay dónde poner fruta, la partida termina.
    if (!free.length) {
      state = "gameover";
      return;
    }
    fruit = free[Math.floor(Math.random() * free.length)];
    fruitSprite = Math.floor(Math.random() * FRUIT_SPRITES.length);
  }
  function initGame() {
    snake = Array.from({ length: START_LEN }, (_, i) => ({ x: START_HEAD.x - i, y: START_HEAD.y }));
    dir = START_DIR;
    turns = [];
    score = 0;
    level = 1;
    eaten = 0;
    tickAccum = 0;
    waiting = true;
    state = "playing";
    placeFruit();
  }
  function enqueueTurn(next: Dir) {
    // Se valida contra el último giro encolado, no contra `dir`: así dos giros
    // de 90° dentro del mismo tick no se convierten en un 180°.
    const last = turns.length ? turns[turns.length - 1] : dir;
    if (next === last || next === OPPOSITE[last]) return;
    if (turns.length >= MAX_TURNS) return;
    turns.push(next);
    waiting = false;
  }
  function step() {
    const turn = turns.shift();
    if (turn) dir = turn;
    const d = DELTA[dir];
    const head = { x: snake[0].x + d.x, y: snake[0].y + d.y };
    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
      state = "gameover";
      return;
    }
    const eats = sameCell(head, fruit);
    // Si no come, la última celda de la cola se mueve este mismo tick y no cuenta.
    const body = eats ? snake : snake.slice(0, -1);
    if (body.some((s) => sameCell(s, head))) {
      state = "gameover";
      return;
    }
    snake.unshift(head);
    if (!eats) {
      snake.pop();
      return;
    }
    score += POINTS_PER_FRUIT * level;
    eaten++;
    level = 1 + Math.floor(eaten / FRUITS_PER_LEVEL);
    placeFruit();
  }
  function update(dt: number) {
    if (state !== "playing" || waiting) return;
    tickAccum += dt;
    const interval = tickMs(level);
    if (tickAccum < interval) return;
    // Con dt capado a DT_MAX < TICK_MIN, como mucho un tick por frame.
    tickAccum -= interval;
    step();
  }
  // ── Hoja de frutas ──
  // Hasta que carga, la fruta no se dibuja, pero la partida avanza igual: es
  // decorado y la lógica no depende de ella.
  const img = new Image();
  let imgReady = false;
  img.onload = () => {
    if (destroyed) return;
    imgReady = true;
    if (rafId === null) draw(); // pausado o en espera de start(): que se vea la fruta
  };
  img.onerror = () => console.error("No se pudo cargar la hoja de frutas de Snake");
  img.src = FRUIT_SRC;
  // ── Avisos al HUD: sólo cuando el valor cambia ──
  let lastScore = -1;
  let lastLives = -1;
  let lastLevel = -1;
  function emit() {
    if (score !== lastScore) {
      lastScore = score;
      callbacks.onScore(score);
    }
    // Una sola vida, como Tetris: el aviso sale una vez y no vuelve a cambiar.
    if (lastLives !== 1) {
      lastLives = 1;
      callbacks.onLives(1);
    }
    if (level !== lastLevel) {
      lastLevel = level;
      callbacks.onLevel(level);
    }
  }
  // ── Dibujo ──
  function drawGrid() {
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) {
      ctx.moveTo(x * CELL + 0.5, 0);
      ctx.lineTo(x * CELL + 0.5, H);
    }
    for (let y = 1; y < ROWS; y++) {
      ctx.moveTo(0, y * CELL + 0.5);
      ctx.lineTo(W, y * CELL + 0.5);
    }
    ctx.stroke();
  }
  function drawFruit() {
    if (!imgReady) return;
    const s = FRUIT_SPRITES[fruitSprite];
    // Escalada a la celda conservando la proporción del recorte, centrada.
    const scale = Math.min(CELL / s.w, CELL / s.h);
    const dw = s.w * scale;
    const dh = s.h * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      img,
      s.x,
      s.y,
      s.w,
      s.h,
      fruit.x * CELL + (CELL - dw) / 2,
      fruit.y * CELL + (CELL - dh) / 2,
      dw,
      dh,
    );
  }
  function drawSnake() {
    for (let i = snake.length - 1; i >= 0; i--) {
      const c = snake[i];
      ctx.fillStyle = i === 0 ? HEAD_COLOR : BODY_COLOR;
      ctx.fillRect(c.x * CELL + 1, c.y * CELL + 1, CELL - 2, CELL - 2);
    }
  }
  function drawHint() {
    ctx.font = "20px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#e8e8f0";
    ctx.fillText("PULSA UNA FLECHA", W / 2, H / 2 - 3 * CELL);
  }
  function draw() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    drawGrid();
    drawFruit();
    drawSnake();
    if (waiting && state === "playing") drawHint();
  }
  // ── Bucle ──
  let rafId: number | null = null;
  let lastTime: number | null = null;
  let destroyed = false;
  function loop(ts: number) {
    rafId = null;
    if (destroyed) return;
    // dt capado: volver de una pestaña en segundo plano no avanza varias celdas.
    const dt = lastTime === null ? 0 : Math.min(ts - lastTime, DT_MAX);
    lastTime = ts;
    update(dt);
    draw();
    emit();
    if (state === "gameover") {
      stopLoop();
      callbacks.onGameOver(score);
      return;
    }
    rafId = requestAnimationFrame(loop);
  }
  function stopLoop() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  }
  function startLoop() {
    // `state === "gameover"` convierte en no-op un resume() tras el fin de partida.
    if (destroyed || rafId !== null || state === "gameover") return;
    // Sin esto, el primer dt tras una pausa valdría toda la pausa.
    lastTime = null;
    rafId = requestAnimationFrame(loop);
  }
  // ── Entrada: listeners en el canvas, nunca en window ──
  // `KeyP` y `Escape` no están: la pausa la atiende components/game-canvas.tsx.
  const GAME_KEYS: Record<string, Dir> = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    KeyW: "up",
    KeyS: "down",
    KeyA: "left",
    KeyD: "right",
  };
  function onKeyDown(e: KeyboardEvent) {
    const next = GAME_KEYS[e.code];
    if (!next) return;
    // Con el canvas enfocado, las flechas no hacen scroll.
    e.preventDefault();
    // Bucle parado (pausa, fin de partida o antes de start()): no se encola nada.
    if (rafId === null || state !== "playing") return;
    // En espera, la dirección actual también arranca (sin encolarse); el 180° no.
    if (waiting && next === dir) {
      waiting = false;
      return;
    }
    enqueueTurn(next);
  }
  function onBlur() {
    // Los giros pendientes eran para la jugada de antes de perder el foco.
    turns = [];
  }
  canvas.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("blur", onBlur);
  initGame();
  draw();
  return {
    start: () => {
      if (destroyed) return;
      emit();
      startLoop();
    },
    pause: stopLoop,
    resume: startLoop,
    restart: () => {
      if (destroyed) return;
      stopLoop();
      turns = [];
      initGame();
      draw();
      emit();
      startLoop();
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      stopLoop();
      img.onload = null;
      img.onerror = null;
      // Corta la descarga pendiente.
      img.src = "";
      canvas.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("blur", onBlur);
    },
  };
}
