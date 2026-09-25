// FROGGER — motor escrito desde cero contra el contrato GameEngine.
//
// No hay original del que portar: las constantes de este archivo son el diseño
// del juego (SPEC game-jam/ranaria/01, paso 2). Todo se dibuja con primitivas
// canvas, sin sprites. Como en los demás motores, el estado vive en la clausura
// de la factoría.
import type { GameCallbacks, GameEngine } from "@/lib/games/engine";
const COLS = 16;
const ROWS = 14;
const CELL = 40; // px
const CANVAS_W = COLS * CELL; // 640 — se escala con CSS al contenedor
const CANVAS_H = ROWS * CELL; // 560
// Zonas (índice de fila, 0 = arriba)
const ROW_GOALS = 0;
const ROW_RIVER_TOP = 1;
const ROW_RIVER_BOT = 6;
const ROW_SAFE_MID = 7;
const ROW_ROAD_TOP = 8;
const ROW_ROAD_BOT = 12;
const ROW_START = 13;
type Direction = "up" | "down" | "left" | "right";
interface Lane {
  row: number;
  speed: number;
  dir: 1 | -1;
  entities: Entity[];
}
interface Entity {
  col: number;
  width: number;
  type: "car" | "truck" | "log" | "turtle";
  submerged?: boolean;
  /** Sólo tortugas: ms dentro del ciclo visible → sumergida. */
  diveT?: number;
}
interface Frog {
  col: number;
  row: number;
  animating: boolean;
  animT: number;
  targetCol: number;
  targetRow: number;
}
// ── Carriles ──
const LEVEL_SPEEDUP = 1.15; // +15 % de velocidad por nivel
const TURTLE_VISIBLE_MS = 3000;
const TURTLE_DIVE_MS = 1500;
const TURTLE_CYCLE_MS = TURTLE_VISIBLE_MS + TURTLE_DIVE_MS;
/**
 * Diseño de cada carril a nivel 1. `speed` en px/frame (a 60 fps); `count`
 * entidades repartidas a espacio constante en el bucle de COLS + width celdas,
 * así el hueco entre ellas se conserva al reintroducirse por el lado opuesto.
 */
type LaneDef = {
  row: number;
  speed: number;
  dir: 1 | -1;
  type: Entity["type"];
  width: number;
  count: number;
};
const LANE_DEFS: LaneDef[] = [
  // Río (filas 1–6): huecos de al menos 1 celda.
  { row: 1, speed: 1.8, dir: 1, type: "log", width: 3, count: 3 },
  { row: 2, speed: 2.5, dir: -1, type: "log", width: 2, count: 4 },
  { row: 3, speed: 1, dir: 1, type: "log", width: 4, count: 3 },
  { row: 4, speed: 2, dir: -1, type: "turtle", width: 2, count: 5 },
  { row: 5, speed: 1.5, dir: 1, type: "log", width: 3, count: 3 },
  { row: 6, speed: 1.2, dir: -1, type: "turtle", width: 3, count: 4 },
  // Carretera (filas 8–12): sentidos alternos, huecos atravesables.
  { row: 8, speed: 4, dir: -1, type: "car", width: 1, count: 2 },
  { row: 9, speed: 1.8, dir: 1, type: "truck", width: 3, count: 2 },
  { row: 10, speed: 2.5, dir: -1, type: "car", width: 2, count: 3 },
  { row: 11, speed: 2, dir: 1, type: "car", width: 1, count: 3 },
  { row: 12, speed: 1.5, dir: -1, type: "car", width: 1, count: 4 },
];
function buildLanes(level: number): Lane[] {
  const factor = LEVEL_SPEEDUP ** (level - 1);
  return LANE_DEFS.map((def) => {
    const spacing = (COLS + def.width) / def.count;
    const entities: Entity[] = [];
    for (let i = 0; i < def.count; i++) {
      const e: Entity = { col: i * spacing - def.width, width: def.width, type: def.type };
      if (def.type === "turtle") {
        // Desfase por grupo: no se sumergen todas a la vez.
        e.diveT = (i * 1700 + def.row * 900) % TURTLE_CYCLE_MS;
        e.submerged = e.diveT >= TURTLE_VISIBLE_MS;
      }
      entities.push(e);
    }
    return { row: def.row, speed: def.speed * factor, dir: def.dir, entities };
  });
}
// ── Partida ──
const START_LIVES = 3;
const JUMP_MS = 120;
const DT_MAX = 50;
const ROUND_TIME_BASE = 15; // s a nivel 1
const ROUND_TIME_MIN = 8; // s: −1 s por nivel hasta aquí
const POINTS_PER_ROW = 10;
const POINTS_PER_GOAL = 50;
const POINTS_PER_SECOND_LEFT = 10;
/** Bocas destino de la fila 0: 2 columnas cada una, separadas por 1 de muro. */
const GOAL_COLS = [1, 4, 7, 10, 13];
const HUD_BAND = 12; // px superiores de la fila 0 para el texto del HUD
const TIME_BAR_H = 4; // px inferiores de la fila 0 para la barra de tiempo
const DELTA: Record<Direction, { col: number; row: number }> = {
  up: { col: 0, row: -1 },
  down: { col: 0, row: 1 },
  left: { col: -1, row: 0 },
  right: { col: 1, row: 0 },
};
const COLORS = {
  goalsBg: "#3fa34d",
  goal: "#0f3d1a",
  goalBorder: "#f5c542",
  river: "#0a1a4a",
  safe: "#123d1c",
  road: "#000000",
  lane: "#3a3a3a",
  cars: ["#ff3b3b", "#f5ff00", "#2f7bff"],
  wheel: "#111111",
  truck: "#9a9aa6",
  truckCab: "#d0d0da",
  log: "#7a4a1e",
  logLine: "#5a3412",
  turtle: "#1f9e4a",
  turtleScale: "#0d5e28",
  frog: "#39ff14",
  frogDark: "#1a9e0a",
  eyeWhite: "#ffffff",
  eyeBlack: "#000000",
  hud: "#ffffff",
  timeOk: "#00ff88",
  timeWarn: "#f5ff00",
  timeLow: "#ff3b3b",
};
function roundTimeMs(level: number): number {
  return Math.max(ROUND_TIME_MIN, ROUND_TIME_BASE - (level - 1)) * 1000;
}
function isRiverRow(row: number): boolean {
  return row >= ROW_RIVER_TOP && row <= ROW_RIVER_BOT;
}
/** Centro horizontal de la rana, en celdas: el punto que se compara con las entidades. */
function frogCenter(frog: Frog): number {
  return frog.col + 0.5;
}
function covers(e: Entity, x: number): boolean {
  return x >= e.col && x < e.col + e.width;
}
function checkRoadCollision(frog: Frog, lanes: Lane[]): boolean {
  const x = frogCenter(frog);
  return lanes.some(
    (lane) =>
      lane.row === frog.row &&
      lane.row >= ROW_ROAD_TOP &&
      lane.row <= ROW_ROAD_BOT &&
      lane.entities.some((e) => covers(e, x)),
  );
}
/** Entidad de río que sostiene a la rana, o null (agua, o tortuga sumergida). */
function getSupport(frog: Frog, lanes: Lane[]): { lane: Lane; entity: Entity } | null {
  const lane = lanes.find((l) => l.row === frog.row);
  if (!lane || !isRiverRow(lane.row)) return null;
  const x = frogCenter(frog);
  const entity = lane.entities.find((e) => covers(e, x));
  if (!entity || entity.submerged) return null;
  return { lane, entity };
}
/**
 * Rana en la fila de metas: marca la boca libre que le corresponde y devuelve
 * su índice; -1 si cayó en un muro o en una boca ya ocupada (muerte).
 */
function checkGoal(frog: Frog, goals: boolean[]): number {
  if (frog.row !== ROW_GOALS) return -1;
  const col = Math.round(frog.col);
  const i = GOAL_COLS.findIndex((g) => col >= g && col < g + 2);
  if (i === -1 || goals[i]) return -1;
  goals[i] = true;
  return i;
}
export function createFroggerGame(canvas: HTMLCanvasElement, callbacks: GameCallbacks): GameEngine {
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) throw new Error("FROGGER: el canvas no tiene contexto 2D");
  const ctx: CanvasRenderingContext2D = ctx2d;
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  // ── Estado de la partida ──
  let lanes: Lane[] = [];
  let frog: Frog = newFrog();
  let facing: Direction = "up";
  let pendingDir: Direction | null = null;
  /** Fila más alta (menor índice) alcanzada por la rana actual: +10 por cada nueva. */
  let bestRow = ROW_START;
  let goals: boolean[] = GOAL_COLS.map(() => false);
  let score = 0;
  let lives = START_LIVES;
  let level = 1;
  let timeLeft = roundTimeMs(1);
  let state: "playing" | "gameover" = "playing";
  function newFrog(): Frog {
    const col = Math.floor(COLS / 2) - 1;
    return {
      col,
      row: ROW_START,
      animating: false,
      animT: 0,
      targetCol: col,
      targetRow: ROW_START,
    };
  }
  /** Rana nueva en la salida con el reloj lleno: tras morir o llegar a una boca. */
  function resetFrog() {
    frog = newFrog();
    facing = "up";
    pendingDir = null;
    bestRow = ROW_START;
    timeLeft = roundTimeMs(level);
  }
  function initGame() {
    score = 0;
    lives = START_LIVES;
    level = 1;
    goals = GOAL_COLS.map(() => false);
    lanes = buildLanes(level);
    state = "playing";
    resetFrog();
  }
  // ── Lógica ──
  function moveEntities(dt: number) {
    for (const lane of lanes) {
      // speed en px/frame a 60 fps → celdas: dt/16 frames, /CELL px por celda.
      const step = (lane.speed * lane.dir * dt) / 16 / CELL;
      for (const e of lane.entities) {
        e.col += step;
        if (lane.dir === 1 && e.col >= COLS) e.col -= COLS + e.width;
        else if (lane.dir === -1 && e.col <= -e.width) e.col += COLS + e.width;
        if (e.type === "turtle" && e.diveT !== undefined) {
          e.diveT = (e.diveT + dt) % TURTLE_CYCLE_MS;
          e.submerged = e.diveT >= TURTLE_VISIBLE_MS;
        }
      }
    }
  }
  function startJump(d: Direction) {
    facing = d;
    const targetCol = frog.col + DELTA[d].col;
    const targetRow = frog.row + DELTA[d].row;
    // Bordes: la rana no sale por los lados ni por abajo; arriba termina en las bocas.
    if (targetCol < 0 || targetCol > COLS - 1 || targetRow < ROW_GOALS || targetRow > ROW_START)
      return;
    frog.animating = true;
    frog.animT = 0;
    frog.targetCol = targetCol;
    frog.targetRow = targetRow;
  }
  /** Muerte de la rana. Provisional hasta killFrog (paso 7): sin restar vida. */
  function die() {
    resetFrog();
  }
  /** Lógica de la celda en la que acaba de aterrizar la rana. */
  function resolveLanding() {
    if (!isRiverRow(frog.row)) frog.col = Math.round(frog.col);
    if (frog.row < bestRow) {
      score += POINTS_PER_ROW * (bestRow - frog.row);
      bestRow = frog.row;
    }
    if (frog.row === ROW_GOALS) {
      if (checkGoal(frog, goals) === -1) return die();
      score += POINTS_PER_GOAL + Math.floor(timeLeft / 1000) * POINTS_PER_SECOND_LEFT;
      resetFrog();
    }
  }
  function updateFrog(dt: number) {
    if (!frog.animating) {
      if (pendingDir) startJump(pendingDir);
      pendingDir = null;
      return;
    }
    frog.animT += dt;
    if (frog.animT < JUMP_MS) return;
    frog.col = frog.targetCol;
    frog.row = frog.targetRow;
    frog.animating = false;
    frog.animT = 0;
    resolveLanding();
  }
  /**
   * Peligros de la celda actual, cada frame y sólo en reposo: los coches se
   * mueven hacia la rana y el apoyo del río puede sumergirse o irse.
   */
  function checkHazards(dt: number) {
    if (frog.animating) return;
    if (checkRoadCollision(frog, lanes)) return die();
    if (!isRiverRow(frog.row)) return;
    const support = getSupport(frog, lanes);
    if (!support) return die();
    // La rana viaja con el tronco o las tortugas que la sostienen.
    frog.col += (support.lane.speed * support.lane.dir * dt) / 16 / CELL;
    const x = frogCenter(frog);
    if (x < 0 || x >= COLS) die();
  }
  function update(dt: number) {
    if (state !== "playing") return;
    moveEntities(dt);
    updateFrog(dt);
    checkHazards(dt);
    timeLeft = Math.max(0, timeLeft - dt);
  }
  // ── Avisos al HUD: sólo cuando el valor cambia ──
  let lastScore = -1;
  let lastLives = -1;
  let lastLevel = -1;
  function emit() {
    if (score !== lastScore) {
      lastScore = score;
      callbacks.onScore(score);
    }
    if (lives !== lastLives) {
      lastLives = lives;
      callbacks.onLives(lives);
    }
    if (level !== lastLevel) {
      lastLevel = level;
      callbacks.onLevel(level);
    }
  }
  // ── Dibujo (primitivas canvas, sin sprites) ──
  function drawBackground() {
    for (let row = 0; row < ROWS; row++) {
      if (row === ROW_GOALS) ctx.fillStyle = COLORS.goalsBg;
      else if (isRiverRow(row)) ctx.fillStyle = COLORS.river;
      else if (row === ROW_SAFE_MID || row === ROW_START) ctx.fillStyle = COLORS.safe;
      else ctx.fillStyle = COLORS.road;
      ctx.fillRect(0, row * CELL, CANVAS_W, CELL);
    }
    // Marcas de carril discontinuas entre las filas de carretera.
    ctx.strokeStyle = COLORS.lane;
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 12]);
    ctx.beginPath();
    for (let row = ROW_ROAD_TOP + 1; row <= ROW_ROAD_BOT; row++) {
      ctx.moveTo(0, row * CELL);
      ctx.lineTo(CANVAS_W, row * CELL);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function drawFrogShape(cx: number, cy: number, dir: Direction, jumping: boolean, alpha = 1) {
    const angle = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[dir];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    // Patas: recogidas en reposo, extendidas durante el salto.
    const reach = jumping ? 16 : 11;
    ctx.fillStyle = COLORS.frogDark;
    for (const sx of [-1, 1]) {
      ctx.fillRect(sx * reach - 3, -reach + 2, 6, 6);
      ctx.fillRect(sx * reach - 3, reach - 8, 6, 6);
    }
    ctx.fillStyle = COLORS.frog;
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const sx of [-1, 1]) {
      ctx.fillStyle = COLORS.eyeWhite;
      ctx.beginPath();
      ctx.arc(sx * 6, -9, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.eyeBlack;
      ctx.beginPath();
      ctx.arc(sx * 6, -10, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  function drawGoals() {
    const top = HUD_BAND;
    const h = CELL - HUD_BAND - TIME_BAR_H - 2;
    GOAL_COLS.forEach((col, i) => {
      const x = col * CELL;
      ctx.fillStyle = COLORS.goal;
      ctx.fillRect(x + 2, top, 2 * CELL - 4, h);
      ctx.strokeStyle = COLORS.goalBorder;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, top, 2 * CELL - 4, h);
      if (goals[i]) drawFrogShape(x + CELL, top + h / 2, "down", false, 0.85);
    });
  }
  function drawCar(x: number, y: number, w: number, color: string) {
    ctx.fillStyle = COLORS.wheel;
    for (const wx of [x + 8, x + w - 8]) {
      ctx.beginPath();
      ctx.arc(wx, y + 8, 5, 0, Math.PI * 2);
      ctx.arc(wx, y + CELL - 8, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = color;
    ctx.fillRect(x + 3, y + 8, w - 6, CELL - 16);
  }
  function drawTruck(x: number, y: number, w: number, dir: 1 | -1) {
    ctx.fillStyle = COLORS.truck;
    ctx.fillRect(x + 2, y + 6, w - 4, CELL - 12);
    // Cabina en el morro: el lado hacia el que avanza.
    ctx.fillStyle = COLORS.truckCab;
    const cabX = dir === 1 ? x + w - CELL + 4 : x + 2;
    ctx.fillRect(cabX, y + 8, CELL - 6, CELL - 16);
  }
  function drawLog(x: number, y: number, w: number) {
    ctx.fillStyle = COLORS.log;
    ctx.fillRect(x + 1, y + 6, w - 2, CELL - 12);
    ctx.strokeStyle = COLORS.logLine;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const ly of [y + 14, y + 20, y + 26]) {
      ctx.moveTo(x + 6, ly);
      ctx.lineTo(x + w - 6, ly);
    }
    ctx.stroke();
  }
  function drawTurtles(x: number, y: number, w: number, submerged: boolean) {
    for (let i = 0; i < w / CELL; i++) {
      const cx = x + i * CELL + CELL / 2;
      const cy = y + CELL / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 15, 0, Math.PI * 2);
      if (submerged) {
        // Bajo el agua: sólo el contorno, semitransparente. No sirve de apoyo.
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = COLORS.turtle;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.fillStyle = COLORS.turtle;
      ctx.fill();
      ctx.fillStyle = COLORS.turtleScale;
      for (const [dx, dy] of [
        [0, 0],
        [-7, -6],
        [7, -6],
        [-7, 6],
        [7, 6],
      ]) {
        ctx.beginPath();
        ctx.arc(cx + dx, cy + dy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  function drawLanes() {
    for (const lane of lanes) {
      const y = lane.row * CELL;
      const carColor = COLORS.cars[lane.row % COLORS.cars.length];
      for (const e of lane.entities) {
        const x = e.col * CELL;
        const w = e.width * CELL;
        if (e.type === "car") drawCar(x, y, w, carColor);
        else if (e.type === "truck") drawTruck(x, y, w, lane.dir);
        else if (e.type === "log") drawLog(x, y, w);
        else drawTurtles(x, y, w, !!e.submerged);
      }
    }
  }
  function drawFrog() {
    // Durante el salto se interpola entre la celda de origen y la de destino.
    const t = frog.animating ? Math.min(frog.animT / JUMP_MS, 1) : 0;
    const col = frog.col + (frog.targetCol - frog.col) * t;
    const row = frog.row + (frog.targetRow - frog.row) * t;
    drawFrogShape(col * CELL + CELL / 2, row * CELL + CELL / 2, facing, frog.animating);
  }
  function drawHud() {
    ctx.font = "bold 12px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textBaseline = "top";
    ctx.fillStyle = COLORS.hud;
    ctx.textAlign = "left";
    ctx.fillText(String(score).padStart(6, "0"), 4, 0);
    ctx.textAlign = "center";
    ctx.fillText("NIVEL " + level, CANVAS_W / 2, 0);
    // Vidas: un círculo verde por vida, alineados a la derecha.
    ctx.fillStyle = COLORS.frog;
    for (let i = 0; i < lives; i++) {
      ctx.beginPath();
      ctx.arc(CANVAS_W - 8 - i * 14, 6, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Barra de tiempo en el borde inferior de la fila 0.
    const ratio = timeLeft / roundTimeMs(level);
    ctx.fillStyle = ratio > 0.5 ? COLORS.timeOk : ratio > 0.25 ? COLORS.timeWarn : COLORS.timeLow;
    ctx.fillRect(0, CELL - TIME_BAR_H, CANVAS_W * ratio, TIME_BAR_H);
  }
  function draw() {
    drawBackground();
    drawGoals();
    drawLanes();
    drawFrog();
    drawHud();
  }
  // ── Bucle ──
  let rafId: number | null = null;
  let lastTime: number | null = null;
  let destroyed = false;
  function loop(ts: number) {
    rafId = null;
    if (destroyed) return;
    // dt capado: volver de una pestaña en segundo plano no teletransporta nada.
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
    if (destroyed || rafId !== null || state === "gameover") return;
    lastTime = null;
    rafId = requestAnimationFrame(loop);
  }
  // ── Entrada: listeners en el canvas, nunca en window ──
  // `KeyP` y `Escape` no están: la pausa la atiende components/game-canvas.tsx.
  const GAME_KEYS: Record<string, Direction> = {
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
    const d = GAME_KEYS[e.code];
    if (!d) return;
    e.preventDefault();
    // Un salto por pulsación: mantener la tecla no encadena saltos.
    if (e.repeat || rafId === null || state !== "playing") return;
    pendingDir = d;
  }
  function onBlur() {
    pendingDir = null;
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
      initGame();
      draw();
      lastScore = -1;
      lastLives = -1;
      lastLevel = -1;
      emit();
      startLoop();
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      stopLoop();
      canvas.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("blur", onBlur);
    },
  };
}
