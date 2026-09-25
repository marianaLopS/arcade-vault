// FROGGER — motor escrito desde cero contra el contrato GameEngine.
//
// No hay original del que portar: las constantes de este archivo son el diseño
// del juego (SPEC game-jam/ranaria/01, paso 2). Todo se dibuja con primitivas
// canvas, sin sprites. Como en los demás motores, el estado vive en la clausura
// de la factoría.
import type { GameCallbacks, GameEngine, GameOptions } from "@/lib/games/engine";
import { PALETTES } from "@/lib/games/frogger/skins";
import { DEFAULT_SKIN } from "@/lib/games/skins";
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
const TURTLE_VISIBLE_MS = 5000;
const TURTLE_DIVE_MS = 1500;
const TURTLE_CYCLE_MS = TURTLE_VISIBLE_MS + TURTLE_DIVE_MS;
/** Último tramo visible en el que las tortugas parpadean antes de sumergirse. */
const TURTLE_WARN_MS = 900;
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
const POINTS_PER_ROUND = 200;
/** Bocas destino de la fila 0: 2 columnas cada una, separadas por 1 de muro. */
const GOAL_COLS = [1, 4, 7, 10, 13];
const TIME_BAR_H = 3; // px superiores de la fila 0: barra de tiempo
const HUD_PAD = 14; // margen lateral del HUD: la esquina redondeada del CRT no lo tapa
const GOAL_TOP = 6; // px: las bocas empiezan bajo la barra de tiempo
// ── Constantes de dibujo: fuera del frame para que draw() no asigne nada ──
const SIDES = [-1, 1] as const;
const FROG_ANGLE: Record<Direction, number> = {
  up: 0,
  right: Math.PI / 2,
  down: Math.PI,
  left: -Math.PI / 2,
};
const LANE_DASH = [12, 12];
const NO_DASH: number[] = [];
/** Vetas del tronco: [y relativa a la fila, margen horizontal]. */
const LOG_GRAIN = [
  [15, 18],
  [21, 28],
  [27, 14],
] as const;
/** Aletas de la tortuga: desplazamiento [x, y] desde el centro. */
const TURTLE_FLIPPERS = [
  [-9, -11],
  [9, -11],
  [-9, 11],
  [9, 11],
] as const;
/** Placas del caparazón: 6 radios, cos/sin precalculados. */
const SHELL_COS = [0, 1, 2, 3, 4, 5].map((a) => Math.cos((a * Math.PI) / 3));
const SHELL_SIN = [0, 1, 2, 3, 4, 5].map((a) => Math.sin((a * Math.PI) / 3));
const HUD_FONT = "bold 12px ui-monospace, SFMono-Regular, Menlo, monospace";
const DELTA: Record<Direction, { col: number; row: number }> = {
  up: { col: 0, row: -1 },
  down: { col: 0, row: 1 },
  left: { col: -1, row: 0 },
  right: { col: 1, row: 0 },
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
export function createFroggerGame(
  canvas: HTMLCanvasElement,
  callbacks: GameCallbacks,
  options?: GameOptions,
): GameEngine {
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) throw new Error("FROGGER: el canvas no tiene contexto 2D");
  const ctx: CanvasRenderingContext2D = ctx2d;
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  // Estado de texto fijo: se asigna una vez (save/restore de la rana lo conserva).
  ctx.font = HUD_FONT;
  ctx.textBaseline = "middle";
  // Paleta del skin, resuelta una vez (ver lib/games/frogger/skins.ts).
  const pal = PALETTES[options?.skin ?? DEFAULT_SKIN];
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
  /** Las 5 bocas llenas: sube el nivel, carriles más rápidos y reloj más corto. */
  function completeRound() {
    score += POINTS_PER_ROUND;
    goals = GOAL_COLS.map(() => false);
    level++;
    // onLevel lo emite emit() en este mismo frame, al detectar el cambio.
    lanes = buildLanes(level);
    // Después de subir el nivel: el reloj de la rana nueva ya es el del nivel siguiente.
    resetFrog();
  }
  /**
   * Muerte de la rana. Con vidas, rana nueva en la salida y reloj lleno; sin
   * ellas, fin de partida: loop() emite onLives(0) y después onGameOver(score).
   */
  function killFrog() {
    lives--;
    if (lives <= 0) {
      lives = 0;
      state = "gameover";
      return;
    }
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
      if (checkGoal(frog, goals) === -1) return killFrog();
      score += POINTS_PER_GOAL + Math.floor(timeLeft / 1000) * POINTS_PER_SECOND_LEFT;
      if (goals.every(Boolean)) completeRound();
      else resetFrog();
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
    if (checkRoadCollision(frog, lanes)) return killFrog();
    if (!isRiverRow(frog.row)) return;
    const support = getSupport(frog, lanes);
    if (!support) return killFrog();
    // La rana viaja con el tronco o las tortugas que la sostienen.
    frog.col += (support.lane.speed * support.lane.dir * dt) / 16 / CELL;
    const x = frogCenter(frog);
    if (x < 0 || x >= COLS) killFrog();
  }
  function update(dt: number) {
    if (state !== "playing") return;
    moveEntities(dt);
    updateFrog(dt);
    checkHazards(dt);
    if (state !== "playing") return;
    timeLeft = Math.max(0, timeLeft - dt);
    if (timeLeft === 0) killFrog();
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
  /** Neón: activa el glow para el siguiente elemento. Sin efecto si `pal.glow` es 0. */
  function glow(color: string) {
    if (pal.glow <= 0) return;
    ctx.shadowBlur = pal.glow;
    ctx.shadowColor = color;
  }
  /** Quita el glow tras cada elemento: no se arrastra al resto del frame. */
  function noGlow() {
    if (pal.glow > 0) ctx.shadowBlur = 0;
  }
  function drawBackground() {
    for (let row = 0; row < ROWS; row++) {
      if (row === ROW_GOALS) ctx.fillStyle = pal.goalsBg;
      else if (isRiverRow(row)) ctx.fillStyle = pal.river;
      else if (row === ROW_SAFE_MID || row === ROW_START) ctx.fillStyle = pal.safe;
      else ctx.fillStyle = pal.road;
      ctx.fillRect(0, row * CELL, CANVAS_W, CELL);
    }
    // Marcas de carril discontinuas entre las filas de carretera.
    ctx.strokeStyle = pal.lane;
    ctx.lineWidth = 2;
    ctx.setLineDash(LANE_DASH);
    ctx.beginPath();
    for (let row = ROW_ROAD_TOP + 1; row <= ROW_ROAD_BOT; row++) {
      ctx.moveTo(0, row * CELL);
      ctx.lineTo(CANVAS_W, row * CELL);
    }
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
  }
  function drawFrogShape(cx: number, cy: number, dir: Direction, jumping: boolean, alpha = 1) {
    const angle = FROG_ANGLE[dir];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    // Patas: recogidas en reposo, extendidas durante el salto.
    const reach = jumping ? 16 : 11;
    ctx.fillStyle = pal.frogDark;
    for (const sx of SIDES) {
      ctx.fillRect(sx * reach - 3, -reach + 2, 6, 6);
      ctx.fillRect(sx * reach - 3, reach - 8, 6, 6);
    }
    ctx.fillStyle = pal.frog;
    glow(pal.frog);
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    noGlow();
    for (const sx of SIDES) {
      ctx.fillStyle = pal.eyeWhite;
      ctx.beginPath();
      ctx.arc(sx * 6, -9, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal.eyeBlack;
      ctx.beginPath();
      ctx.arc(sx * 6, -10, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  /** Rectángulo de esquinas redondeadas (path nuevo; el que llama rellena o traza). */
  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }
  function drawGoals() {
    // Bocas como nichos abiertos por arriba: laterales y fondo con borde.
    const h = CELL - GOAL_TOP - 2;
    for (let i = 0; i < GOAL_COLS.length; i++) {
      const x = GOAL_COLS[i] * CELL + 3;
      const w = 2 * CELL - 6;
      ctx.fillStyle = pal.goal;
      ctx.fillRect(x, GOAL_TOP, w, h);
      ctx.strokeStyle = pal.goalBorder;
      ctx.lineWidth = 2;
      glow(pal.goalBorder);
      ctx.beginPath();
      ctx.moveTo(x, GOAL_TOP);
      ctx.lineTo(x, GOAL_TOP + h);
      ctx.lineTo(x + w, GOAL_TOP + h);
      ctx.lineTo(x + w, GOAL_TOP);
      ctx.stroke();
      noGlow();
      if (goals[i]) drawFrogShape(x + w / 2, GOAL_TOP + h / 2 + 2, "down", false, 0.9);
    }
  }
  /** Ruedas: bloques oscuros que asoman por arriba y por abajo de la carrocería. */
  function drawWheels(x: number, y: number, w: number) {
    ctx.fillStyle = pal.wheel;
    for (let k = 0; k < 2; k++) {
      const wx = k === 0 ? x + 6 : x + w - 16;
      ctx.fillRect(wx, y + 7, 10, 5);
      ctx.fillRect(wx, y + CELL - 12, 10, 5);
    }
  }
  function drawCar(x: number, y: number, w: number, color: string, dir: 1 | -1) {
    drawWheels(x, y, w);
    // Carrocería.
    ctx.fillStyle = color;
    glow(color);
    roundRect(x + 3, y + 10, w - 6, CELL - 20, 6);
    ctx.fill();
    noGlow();
    // Habitáculo con el parabrisas hacia el morro (el sentido de avance).
    const front = dir === 1 ? x + w - 3 : x + 3;
    const cabW = Math.min(18, w - 16);
    const cabX = dir === 1 ? front - cabW - 7 : front + 7;
    ctx.fillStyle = pal.carWindow;
    roundRect(cabX, y + 13, cabW, CELL - 26, 3);
    ctx.fill();
    // Faros.
    ctx.fillStyle = pal.headlight;
    const hx = dir === 1 ? front - 3 : front;
    ctx.fillRect(hx, y + 12, 3, 4);
    ctx.fillRect(hx, y + CELL - 16, 3, 4);
  }
  function drawTruck(x: number, y: number, w: number, dir: 1 | -1) {
    drawWheels(x, y, w);
    const cabW = 26;
    const gap = 3;
    const trailerX = dir === 1 ? x + 3 : x + 3 + cabW + gap;
    const trailerW = w - 6 - cabW - gap;
    const cabX = dir === 1 ? x + w - 3 - cabW : x + 3;
    // Remolque: caja con borde y listones.
    ctx.fillStyle = pal.truck;
    glow(pal.truckOutline);
    roundRect(trailerX, y + 8, trailerW, CELL - 16, 3);
    ctx.fill();
    ctx.strokeStyle = pal.truckOutline;
    ctx.lineWidth = 2;
    ctx.stroke();
    noGlow();
    ctx.strokeStyle = pal.truckOutline;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let lx = trailerX + 12; lx < trailerX + trailerW - 6; lx += 12) {
      ctx.moveTo(lx + 0.5, y + 11);
      ctx.lineTo(lx + 0.5, y + CELL - 11);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Cabina con ventanilla delantera.
    ctx.fillStyle = pal.truckCab;
    glow(pal.truckOutline);
    roundRect(cabX, y + 10, cabW, CELL - 20, 5);
    ctx.fill();
    noGlow();
    ctx.fillStyle = pal.carWindow;
    const winX = dir === 1 ? cabX + cabW - 11 : cabX + 4;
    ctx.fillRect(winX, y + 13, 7, CELL - 26);
  }
  function drawLog(x: number, y: number, w: number) {
    // Tronco: cuerpo redondeado, vetas de corteza y un corte con anillos en cada punta.
    ctx.fillStyle = pal.log;
    glow(pal.log);
    roundRect(x + 2, y + 7, w - 4, CELL - 14, 12);
    ctx.fill();
    noGlow();
    ctx.strokeStyle = pal.logLine;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [dy, inset] of LOG_GRAIN) {
      ctx.moveTo(x + inset, y + dy);
      ctx.lineTo(x + w - inset, y + dy);
    }
    ctx.stroke();
    for (let k = 0; k < 2; k++) {
      const ex = k === 0 ? x + 10 : x + w - 10;
      ctx.fillStyle = pal.logEnd;
      ctx.beginPath();
      ctx.ellipse(ex, y + CELL / 2, 6, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = pal.logLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(ex, y + CELL / 2, 3, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  function drawTurtles(x: number, y: number, w: number, dir: 1 | -1, diveT: number) {
    const submerged = diveT >= TURTLE_VISIBLE_MS;
    // Aviso: en el último tramo visible parpadean, a medio hundir.
    const warning = !submerged && diveT >= TURTLE_VISIBLE_MS - TURTLE_WARN_MS;
    const sinking = warning && Math.floor(diveT / 150) % 2 === 0;
    for (let i = 0; i < w / CELL; i++) {
      const cx = x + i * CELL + CELL / 2;
      const cy = y + CELL / 2;
      if (submerged) {
        // Bajo el agua: sólo el contorno, semitransparente. No sirve de apoyo.
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = pal.turtleSub;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 13, 11, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }
      if (sinking) ctx.globalAlpha = 0.55;
      // Aletas y cabeza, asomando del caparazón hacia el sentido de avance.
      ctx.fillStyle = pal.turtleScale;
      for (const [fx, fy] of TURTLE_FLIPPERS) {
        ctx.beginPath();
        ctx.ellipse(cx + fx, cy + fy, 5, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(cx + dir * 15, cy, 4.5, 0, Math.PI * 2);
      ctx.fill();
      // Caparazón con placas.
      ctx.fillStyle = pal.turtle;
      glow(pal.turtle);
      ctx.beginPath();
      ctx.ellipse(cx, cy, 13, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      noGlow();
      ctx.strokeStyle = pal.turtleScale;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 5, 4, 0, 0, Math.PI * 2);
      for (let a = 0; a < 6; a++) {
        ctx.moveTo(cx + SHELL_COS[a] * 5, cy + SHELL_SIN[a] * 4);
        ctx.lineTo(cx + SHELL_COS[a] * 12, cy + SHELL_SIN[a] * 10);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  function drawLanes() {
    for (const lane of lanes) {
      const y = lane.row * CELL;
      const carColor = pal.cars[lane.row % pal.cars.length];
      for (const e of lane.entities) {
        const x = e.col * CELL;
        const w = e.width * CELL;
        if (e.type === "car") drawCar(x, y, w, carColor, lane.dir);
        else if (e.type === "truck") drawTruck(x, y, w, lane.dir);
        else if (e.type === "log") drawLog(x, y, w);
        else drawTurtles(x, y, w, lane.dir, e.diveT ?? 0);
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
  // Caché del HUD: textos y anchos del último valor pintado.
  let hudScore = -1;
  let hudScoreText = "";
  let hudScoreW = 0;
  let hudLevel = -1;
  let hudLevelText = "";
  let hudLevelW = 0;
  const HUD_TY = GOAL_TOP + 12;
  /** Etiqueta del HUD sobre su fondo oscuro; `tw` es el ancho ya medido. */
  function hudLabel(text: string, tw: number, x: number, align: CanvasTextAlign, color: string) {
    ctx.textAlign = align;
    const left = align === "left" ? x : align === "center" ? x - tw / 2 : x - tw;
    ctx.fillStyle = pal.hudBg;
    roundRect(left - 5, HUD_TY - 9, tw + 10, 18, 3);
    ctx.fill();
    ctx.fillStyle = color;
    glow(color);
    ctx.fillText(text, x, HUD_TY + 1);
    noGlow();
  }
  function drawHud() {
    // Barra de tiempo a lo ancho, pegada arriba.
    const ratio = timeLeft / roundTimeMs(level);
    const barColor = ratio > 0.5 ? pal.timeOk : ratio > 0.25 ? pal.timeWarn : pal.timeLow;
    ctx.fillStyle = barColor;
    glow(barColor);
    ctx.fillRect(0, 0, CANVAS_W * ratio, TIME_BAR_H);
    noGlow();
    // Textos con fondo propio: se leen igual sobre una boca vacía u ocupada.
    // Texto y ancho se recalculan sólo cuando cambia el valor.
    if (score !== hudScore) {
      hudScore = score;
      hudScoreText = "SCORE " + String(score).padStart(6, "0");
      hudScoreW = ctx.measureText(hudScoreText).width;
    }
    if (level !== hudLevel) {
      hudLevel = level;
      hudLevelText = "LVL " + String(level).padStart(2, "0");
      hudLevelW = ctx.measureText(hudLevelText).width;
    }
    hudLabel(hudScoreText, hudScoreW, HUD_PAD, "left", pal.hudScore);
    hudLabel(hudLevelText, hudLevelW, CANVAS_W / 2, "center", pal.hudLevel);
    // Vidas: una rana pequeña (círculo) por vida, alineadas a la derecha.
    const livesW = lives * 14;
    if (lives > 0) {
      ctx.fillStyle = pal.hudBg;
      roundRect(CANVAS_W - HUD_PAD - livesW - 3, HUD_TY - 9, livesW + 6, 18, 3);
      ctx.fill();
    }
    ctx.fillStyle = pal.frog;
    glow(pal.frog);
    for (let i = 0; i < lives; i++) {
      ctx.beginPath();
      ctx.arc(CANVAS_W - HUD_PAD - 7 - i * 14, HUD_TY, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    noGlow();
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
