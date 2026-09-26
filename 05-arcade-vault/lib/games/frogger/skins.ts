// Paletas de Frogger, una por skin (ver lib/games/skins.ts).
//
// `clasico` parte del objeto COLORS original del motor (fila 0 oscurecida). En neón y
// retro, troncos y tortugas van a media luminancia: contrastan a la vez con el
// agua (debajo) y con la rana (encima), y se distinguen entre sí por el tono.
import type { SkinId } from "@/lib/games/skins";
export type Palette = {
  /** Fila 0 (metas + HUD). */
  goalsBg: string;
  /** Interior de cada boca destino. */
  goal: string;
  goalBorder: string;
  river: string;
  /** Filas seguras (mediana y salida). */
  safe: string;
  road: string;
  /** Marcas discontinuas de carril (decorado). */
  lane: string;
  /** Color de coche según `row % cars.length`. */
  cars: string[];
  wheel: string;
  /** Ventanillas de coches y camiones. */
  carWindow: string;
  headlight: string;
  truck: string;
  truckCab: string;
  /** Borde del remolque y la cabina. */
  truckOutline: string;
  log: string;
  logLine: string;
  /** Corte de la madera en las puntas del tronco. */
  logEnd: string;
  turtle: string;
  turtleScale: string;
  /** Contorno de la tortuga sumergida (se dibuja con alpha 0.35). */
  turtleSub: string;
  frog: string;
  frogDark: string;
  eyeWhite: string;
  eyeBlack: string;
  hud: string;
  /** Fondo de las etiquetas del HUD sobre la fila 0. */
  hudBg: string;
  hudScore: string;
  hudLevel: string;
  timeOk: string;
  timeWarn: string;
  timeLow: string;
  /** `shadowBlur` del glow; 0 = sin glow. */
  glow: number;
};
export const PALETTES: Record<SkinId, Palette> = {
  // Colores del diseño original; la fila 0 va oscura para que el HUD se lea.
  clasico: {
    goalsBg: "#14502a",
    goal: "#0a2a12",
    goalBorder: "#f5c542",
    river: "#0a1a4a",
    safe: "#123d1c",
    road: "#000000",
    lane: "#3a3a3a",
    cars: ["#ff3b3b", "#f5ff00", "#2f7bff"],
    wheel: "#111111",
    carWindow: "#1a2233",
    headlight: "#fff6c8",
    truck: "#9a9aa6",
    truckCab: "#d0d0da",
    truckOutline: "#5e5e6a",
    log: "#8a5424",
    logLine: "#5a3412",
    logEnd: "#c89060",
    turtle: "#1f9e4a",
    turtleScale: "#0d5e28",
    turtleSub: "#1f9e4a",
    frog: "#39ff14",
    frogDark: "#1a9e0a",
    eyeWhite: "#ffffff",
    eyeBlack: "#000000",
    hud: "#ffffff",
    hudBg: "rgba(0, 0, 0, 0.55)",
    hudScore: "#ffffff",
    hudLevel: "#f5c542",
    timeOk: "#00ff88",
    timeWarn: "#f5ff00",
    timeLow: "#ff3b3b",
    glow: 0,
  },
  // Neón armónico: casi negro de fondo, madera y tortugas cálidas/verdes con poco
  // glow, y el color saturado reservado a coches, HUD y rana.
  neon: {
    goalsBg: "#030806",
    goal: "#050d09",
    goalBorder: "#f5ff00",
    river: "#050d24",
    safe: "#0a2414",
    road: "#07070d",
    lane: "#23213d",
    cars: ["#ff2a6d", "#00f5ff", "#f5ff00", "#ff3b3b", "#d65bff"],
    wheel: "#000000",
    carWindow: "#0b0b18",
    headlight: "#ffffff",
    truck: "#08122e",
    truckCab: "#0f2a66",
    truckOutline: "#2f8bff",
    log: "#6e4424",
    logLine: "#3a2210",
    logEnd: "#a8744a",
    turtle: "#22d65a",
    turtleScale: "#0b5a26",
    turtleSub: "#22d65a",
    frog: "#39ff14",
    frogDark: "#1a9e0a",
    eyeWhite: "#ffffff",
    eyeBlack: "#000000",
    hud: "#e6e9ff",
    hudBg: "rgba(3, 8, 6, 0.75)",
    hudScore: "#00f5ff",
    hudLevel: "#ff2a9d",
    timeOk: "#39ff14",
    timeWarn: "#f5ff00",
    timeLow: "#ff2a6d",
    glow: 8,
  },
  // NES: 8 colores (negro, marino, verde oscuro, lima, ámbar, teja, azul,
  // blanco), sin glow. Las scanlines ya las pone .crt-screen::after.
  retro: {
    goalsBg: "#000000",
    goal: "#003800",
    goalBorder: "#f8b800",
    river: "#001858",
    safe: "#003800",
    road: "#000000",
    lane: "#001858",
    cars: ["#c84c0c", "#f8b800", "#fcfcfc"],
    wheel: "#000000",
    carWindow: "#001858",
    headlight: "#fcfcfc",
    truck: "#0078f8",
    truckCab: "#fcfcfc",
    truckOutline: "#fcfcfc",
    log: "#c84c0c",
    logLine: "#000000",
    logEnd: "#f8b800",
    turtle: "#0078f8",
    turtleScale: "#001858",
    turtleSub: "#fcfcfc",
    frog: "#b8f818",
    frogDark: "#b8f818",
    eyeWhite: "#fcfcfc",
    eyeBlack: "#000000",
    hud: "#fcfcfc",
    hudBg: "#000000",
    hudScore: "#fcfcfc",
    hudLevel: "#f8b800",
    timeOk: "#b8f818",
    timeWarn: "#f8b800",
    timeLow: "#c84c0c",
    glow: 0,
  },
};
