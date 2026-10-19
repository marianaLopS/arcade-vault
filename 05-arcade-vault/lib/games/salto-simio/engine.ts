// SALTO SIMIO — motor escrito desde cero contra el contrato GameEngine.
//
// No hay original del que portar: las constantes de este archivo son el diseño
// del juego (SPEC game-jam/salto-simio/01, paso 1). Cambiarlas es rediseñar, no
// implementar. Todo se dibuja con primitivas canvas, sin sprites. Como en los
// demás motores, el estado vive en la clausura de la factoría.
import type { GameCallbacks, GameEngine } from "@/lib/games/engine";
const W = 800;
const H = 600;
type Girder = { x0: number; x1: number; y0: number; y1: number }; // y0 en x0, y1 en x1 (superficie)
type Ladder = { x: number; lower: number; upper: number }; // índices de Girder que conecta
type Barrel = {
  x: number; // centro
  y: number;
  dir: 1 | -1;
  girder: number; // índice de viga sobre la que rueda; -1 si cae
  vy: number;
  jumped: boolean; // ya otorgó los puntos de salto
};
type HeroState = "ground" | "air" | "ladder" | "dying" | "won";
// ── Nivel: una pantalla fija, literal (y crece hacia abajo) ──
const GIRDERS: Girder[] = [
  { x0: 0, x1: 800, y0: 568, y1: 568 }, // G0 suelo, plano
  { x0: 0, x1: 720, y0: 470, y1: 490 }, // G1 baja hacia la derecha
  { x0: 80, x1: 800, y0: 400, y1: 380 }, // G2 baja hacia la izquierda
  { x0: 0, x1: 720, y0: 290, y1: 310 }, // G3 baja hacia la derecha
  { x0: 80, x1: 800, y0: 220, y1: 200 }, // G4 baja hacia la izquierda
  { x0: 0, x1: 560, y0: 110, y1: 110 }, // G5 cima, plana
];
const TOP = GIRDERS.length - 1;
const LADDERS: Ladder[] = [
  { x: 640, lower: 0, upper: 1 },
  { x: 200, lower: 0, upper: 1 },
  { x: 120, lower: 1, upper: 2 },
  { x: 520, lower: 1, upper: 2 },
  { x: 680, lower: 2, upper: 3 },
  { x: 300, lower: 2, upper: 3 },
  { x: 140, lower: 3, upper: 4 },
  { x: 480, lower: 3, upper: 4 },
  { x: 480, lower: 4, upper: 5 },
];
const LADDER_W = 24;
const LADDER_GRAB = 10; // tolerancia de agarre: ±10 px del centro
const OIL_DRUM = { x0: 0, x1: 40 }; // sobre G0
const SIMIO = { x0: 40, x1: 120 }; // sobre G5
const GOAL = { x0: 500, x1: 540 }; // rescate, sobre G5
// ── Héroe ──
const HERO_W = 24;
const HERO_H = 32;
const START_X = 60; // sobre G0
const GRAVITY = 1800; // px/s²
const JUMP_VY = -560; // px/s → altura ≈ 87 px, menor que los 90 px entre vigas
const RUN_SPEED = 150; // px/s
const JUMP_AIR_CONTROL = 0; // en el aire vx se congela al despegar
const CLIMB_SPEED = 90; // px/s
const FALL_DEATH = 100; // px desde el pico del salto o de la viga
// ── Barriles ──
const BARREL_R = 10;
const BARREL_SPEED = 110; // px/s
const BARREL_FALL_VX = 40; // px/s
const BARREL_GRAVITY = 1400; // px/s²
const BARREL_SPAWN_X = 130; // sobre G5
const SPAWN_INTERVAL_L1 = 3000; // ms
const SPAWN_STEP = 250; // ms menos por nivel
const SPAWN_MIN = 1600; // ms
const SPAWN_FIRST = 1000; // ms hasta el primer barril de cada pantalla
const BARREL_SPEED_STEP = 0.08; // +8 % por nivel
const BARREL_SPEED_CAP = 1.8;
const BARREL_MAX = 14;
// ── Bono, vidas y puntos ──
const BONUS_START = 5000;
const BONUS_TICK = 100; // puntos que se descuentan…
const BONUS_TICK_MS = 2000; // …cada tanto tiempo
const LIVES_START = 3;
const DYING_MS = 900;
const WON_MS = 1500;
const DT_MAX = 50; // ms
const SCORE_CAP = 999999; // CHECK de scores: 0..1.000.000
const POINTS_JUMP = 100;
const POINTS_GOAL = 1000; // + bono restante íntegro
function surface(g: Girder, x: number): number {
  return g.y0 + ((g.y1 - g.y0) * (x - g.x0)) / (g.x1 - g.x0);
}
function spawnInterval(level: number): number {
  return Math.max(SPAWN_MIN, SPAWN_INTERVAL_L1 - SPAWN_STEP * (level - 1));
}
function barrelSpeed(level: number): number {
  return BARREL_SPEED * Math.min(BARREL_SPEED_CAP, 1 + BARREL_SPEED_STEP * (level - 1));
}
export function createSaltoSimioGame(
  canvas: HTMLCanvasElement,
  callbacks: GameCallbacks,
): GameEngine {
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) throw new Error("SALTO SIMIO: el canvas no tiene contexto 2D");
  const ctx: CanvasRenderingContext2D = ctx2d;
  canvas.width = W;
  canvas.height = H;
  // ── Estado de la partida ──
  /** `x` centro, `y` pies. */
  const hero = {
    x: START_X,
    y: surface(GIRDERS[0], START_X),
    vx: 0,
    vy: 0,
    face: 1 as 1 | -1,
    girder: 0,
    peakY: 0,
    ladder: null as Ladder | null,
  };
  let heroState: HeroState = "ground";
  /** ms en el estado actual del héroe (para `dying` y `won`). */
  let stateTime = 0;
  const barrels: Barrel[] = [];
  let spawnTimer = SPAWN_FIRST;
  let score = 0;
  let lives = LIVES_START;
  let level = 1;
  let bonus = BONUS_START;
  /** ms hacia el siguiente descuento del bono. */
  let bonusAccum = 0;
  const keys = { left: false, right: false, up: false, down: false };
  /** Espacio pulsado: se consume en el frame siguiente, haya podido saltar o no. */
  let jumpQueued = false;
  let state: "playing" | "gameover" = "playing";
  function releaseKeys() {
    keys.left = false;
    keys.right = false;
    keys.up = false;
    keys.down = false;
    jumpQueued = false;
  }
  /** Pantalla nueva: conserva `score`, `lives` y `level`. */
  function resetStage() {
    hero.x = START_X;
    hero.y = surface(GIRDERS[0], START_X);
    hero.vx = 0;
    hero.vy = 0;
    hero.face = 1;
    hero.girder = 0;
    hero.peakY = hero.y;
    hero.ladder = null;
    heroState = "ground";
    stateTime = 0;
    barrels.length = 0;
    spawnTimer = SPAWN_FIRST;
    bonus = BONUS_START;
    bonusAccum = 0;
    releaseKeys();
  }
  function initGame() {
    level = 1;
    score = 0;
    lives = LIVES_START;
    state = "playing";
    resetStage();
  }
  function addScore(points: number) {
    score = Math.min(SCORE_CAP, score + points);
  }
  // ── Héroe ──
  function die() {
    if (heroState === "dying" || heroState === "won") return;
    heroState = "dying";
    stateTime = 0;
  }
  /** Escalera cuya viga inferior es la actual, a ≤ LADDER_GRAB del héroe. */
  function ladderUp(): Ladder | null {
    for (let i = 0; i < LADDERS.length; i++) {
      const l = LADDERS[i];
      if (l.lower === hero.girder && Math.abs(hero.x - l.x) < LADDER_GRAB) return l;
    }
    return null;
  }
  /** Escalera cuyo extremo superior pisa el héroe (pies a ≤ 4 px de la viga superior). */
  function ladderDown(): Ladder | null {
    for (let i = 0; i < LADDERS.length; i++) {
      const l = LADDERS[i];
      if (
        l.upper === hero.girder &&
        Math.abs(hero.x - l.x) < LADDER_GRAB &&
        Math.abs(hero.y - surface(GIRDERS[l.upper], l.x)) <= 4
      )
        return l;
    }
    return null;
  }
  function clampX(x: number): number {
    return Math.min(W - HERO_W / 2, Math.max(HERO_W / 2, x));
  }
  function updateGround(dt: number, dir: number, jump: boolean) {
    if (jump) {
      hero.vy = JUMP_VY;
      hero.vx = dir * RUN_SPEED;
      hero.peakY = hero.y;
      heroState = "air";
      return;
    }
    if (keys.up && !keys.down) {
      const l = ladderUp();
      if (l) {
        hero.ladder = l;
        hero.x = l.x;
        heroState = "ladder";
        return;
      }
    }
    if (keys.down && !keys.up) {
      const l = ladderDown();
      if (l) {
        hero.ladder = l;
        hero.x = l.x;
        heroState = "ladder";
        return;
      }
    }
    const g = GIRDERS[hero.girder];
    hero.x = clampX(hero.x + dir * RUN_SPEED * dt);
    // Fuera del rango de su viga: cae por el borde, con la inercia de la carrera.
    if (hero.x < g.x0 || hero.x > g.x1) {
      hero.vy = 0;
      hero.vx = dir * RUN_SPEED;
      hero.peakY = hero.y;
      heroState = "air";
      return;
    }
    // Sin gravedad en el suelo: los pies siguen la pendiente exacta.
    hero.y = surface(g, hero.x);
  }
  function updateAir(dt: number, dir: number) {
    hero.vx += (dir * RUN_SPEED - hero.vx) * JUMP_AIR_CONTROL;
    hero.vy += GRAVITY * dt;
    const prevY = hero.y;
    hero.x = clampX(hero.x + hero.vx * dt);
    hero.y += hero.vy * dt;
    hero.peakY = Math.min(hero.peakY, hero.y);
    if (hero.vy <= 0) return;
    // Vigas de una vía: sólo se aterriza cruzando la superficie desde arriba.
    for (let i = 0; i < GIRDERS.length; i++) {
      const g = GIRDERS[i];
      if (hero.x < g.x0 || hero.x > g.x1) continue;
      const s = surface(g, hero.x);
      if (prevY > s + 1 || hero.y < s) continue;
      hero.y = s;
      if (hero.y - hero.peakY > FALL_DEATH) {
        die();
        return;
      }
      hero.girder = i;
      hero.vx = 0;
      hero.vy = 0;
      heroState = "ground";
      return;
    }
  }
  function updateLadder(dt: number) {
    const l = hero.ladder;
    if (!l) return;
    const climb = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
    hero.y -= climb * CLIMB_SPEED * dt;
    // Cada extremo sólo se comprueba en el sentido de la marcha: al bajar
    // desde arriba los pies empiezan justo sobre la viga superior.
    const top = surface(GIRDERS[l.upper], l.x);
    const bottom = surface(GIRDERS[l.lower], l.x);
    if (climb > 0 && hero.y <= top) {
      hero.y = top;
      hero.girder = l.upper;
    } else if (climb < 0 && hero.y >= bottom) {
      hero.y = bottom;
      hero.girder = l.lower;
    } else return;
    hero.ladder = null;
    heroState = "ground";
  }
  function reachedGoal(): boolean {
    return (
      heroState === "ground" &&
      hero.girder === TOP &&
      hero.x + HERO_W / 2 > GOAL.x0 &&
      hero.x - HERO_W / 2 < GOAL.x1
    );
  }
  /** `dt` en ms. */
  function updateHero(dt: number) {
    const s = dt / 1000;
    if (heroState === "dying") {
      stateTime += dt;
      if (stateTime < DYING_MS) return;
      lives--;
      if (lives <= 0) state = "gameover";
      else resetStage();
      return;
    }
    if (heroState === "won") {
      stateTime += dt;
      if (stateTime < WON_MS) return;
      addScore(POINTS_GOAL + bonus);
      level++;
      resetStage();
      return;
    }
    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (dir !== 0 && heroState !== "ladder") hero.face = dir > 0 ? 1 : -1;
    // Se consume siempre: un Espacio pulsado en el aire no se guarda.
    const jump = jumpQueued;
    jumpQueued = false;
    if (heroState === "ground") updateGround(s, dir, jump);
    else if (heroState === "air") updateAir(s, dir);
    else if (heroState === "ladder") updateLadder(s);
    if (reachedGoal()) {
      heroState = "won";
      stateTime = 0;
    }
  }
  initGame();
  // Pasos 3–4 de la spec: barriles, bucle, entrada y dibujo.
  return {
    start: () => {},
    pause: () => {},
    resume: () => {},
    restart: () => {},
    destroy: () => {},
  };
}
