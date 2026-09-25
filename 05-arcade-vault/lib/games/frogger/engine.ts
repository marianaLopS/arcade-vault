// FROGGER — motor escrito desde cero contra el contrato GameEngine.
//
// No hay original del que portar: las constantes de este archivo son el diseño
// del juego (SPEC game-jam/ranaria/01, paso 2). Todo se dibuja con primitivas
// canvas, sin sprites. Como en los demás motores, el estado vive en la clausura
// de la factoría.
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
