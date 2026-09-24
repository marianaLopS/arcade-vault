// Paletas de Asteroids, una por skin (ver lib/games/skins.ts).
//
// `clasico` copia tal cual los colores que el motor tenía fijos. Las claves
// `*Rgb` son tripletes "r, g, b" de los trazos cuyo alpha cambia por frame
// (partículas y onda nova): el motor compone el `rgba()` con ellos.
import type { SkinId } from "@/lib/games/skins";
export type Palette = {
  /** Fondo del canvas. */
  bg: string;
  ship: string;
  asteroid: string;
  bullet: string;
  powerUp: string;
  /** Llama del propulsor, normal y con hiperpropulsión. */
  thrust: string;
  thrustHiper: string;
  shield: string;
  /** Triplete "r, g, b" de partículas y onda nova. */
  particleRgb: string;
  novaRgb: string;
  /** Texto del HUD de power-ups. */
  hudText: string;
  /** Etiqueta "HIPER [SHIFT]". */
  hudLabel: string;
  /** Marco y relleno de la barra de hiperpropulsión. */
  hudFrame: string;
  hudBar: string;
  hudBarHiper: string;
  /** `shadowBlur` del glow; 0 = sin glow. */
  glow: number;
};
export const PALETTES: Record<SkinId, Palette> = {
  clasico: {
    bg: "#000",
    ship: "#fff",
    asteroid: "#fff",
    bullet: "#fff",
    powerUp: "#fff",
    thrust: "rgba(255, 130, 0, 0.85)",
    thrustHiper: "rgba(120, 200, 255, 0.9)",
    shield: "rgba(120, 200, 255, 0.8)",
    particleRgb: "255,255,255",
    novaRgb: "255, 255, 255",
    hudText: "#fff",
    hudLabel: "rgba(255,255,255,0.65)",
    hudFrame: "rgba(255,255,255,0.5)",
    hudBar: "rgba(255,255,255,0.75)",
    hudBarHiper: "rgba(120, 200, 255, 0.9)",
    glow: 0,
  },
  // Tokens del sitio (--cyan, --magenta, --yellow, --green, --ink) con glow.
  neon: {
    bg: "#05050a",
    ship: "#00f5ff",
    asteroid: "#ff006e",
    bullet: "#f5ff00",
    powerUp: "#00ff88",
    thrust: "rgba(255, 154, 31, 0.9)",
    thrustHiper: "rgba(245, 255, 0, 0.95)",
    shield: "rgba(0, 245, 255, 0.85)",
    particleRgb: "255, 0, 110",
    novaRgb: "0, 245, 255",
    hudText: "#e6e9ff",
    hudLabel: "rgba(230, 233, 255, 0.8)",
    hudFrame: "rgba(0, 245, 255, 0.6)",
    hudBar: "rgba(0, 245, 255, 0.85)",
    hudBarHiper: "rgba(245, 255, 0, 0.95)",
    glow: 10,
  },
  // Monitor de fósforo verde con acento ámbar: 5 colores, sin glow. Las
  // scanlines ya las pone .crt-screen::after, no se repiten en el canvas.
  retro: {
    bg: "#071207",
    ship: "#b6ffb6",
    asteroid: "#33ff66",
    bullet: "#b6ffb6",
    powerUp: "#ffb000",
    thrust: "#ffb000",
    thrustHiper: "#b6ffb6",
    shield: "#b6ffb6",
    particleRgb: "51, 255, 102",
    novaRgb: "182, 255, 182",
    hudText: "#33ff66",
    hudLabel: "rgba(51, 255, 102, 0.8)",
    hudFrame: "#1f9e40",
    hudBar: "#33ff66",
    hudBarHiper: "#ffb000",
    glow: 0,
  },
};
