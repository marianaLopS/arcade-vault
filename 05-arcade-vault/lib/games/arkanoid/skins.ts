// Paletas de Arkanoid, una por skin (ver lib/games/skins.ts).
//
// Arkanoid pinta con spritesheet, así que el skin no cambia `fillStyle` sino
// el propio sheet: al cargar, tint.ts recolorea una copia en un canvas fuera de
// pantalla (una vez por motor, nunca por frame). `clasico` usa el sheet tal
// cual (`recolor: "none"`): los colores de sprite de su paleta son sólo el tono
// dominante del PNG original, a título de referencia.
//
// Ojo con los nombres: son las claves de BlockColor del original, no el color
// real del sprite (`green` es azul, `magenta` es violeta, `hotpink` es naranja).
import type { BlockColor } from "@/lib/games/arkanoid/sprites";
import type { SkinId } from "@/lib/games/skins";
/**
 * - `none`: sheet original sin tocar.
 * - `shade`: conserva el sombreado del sprite, con el tono del skin.
 * - `flat`: dos tonos, color plano + contorno negro, alpha binario (8 bits).
 */
export type Recolor = "none" | "shade" | "flat";
export type Palette = {
  /** Fondo del canvas. */
  bg: string;
  /** Rótulo SIN SONIDO. */
  text: string;
  /** Cuerpo de la pala. */
  paddle: string;
  /** Remates saturados de los extremos de la pala. */
  paddleAccent: string;
  ball: string;
  /** Un color por bloque; la explosión de un bloque usa el suyo. */
  blocks: Record<BlockColor, string>;
  recolor: Recolor;
  /** `shadowBlur` del glow; 0 = sin glow. */
  glow: number;
};
export const PALETTES: Record<SkinId, Palette> = {
  clasico: {
    bg: "#000",
    text: "#fff",
    paddle: "#babac5",
    paddleAccent: "#af2a44",
    ball: "#babac5",
    blocks: {
      gray: "#323142",
      red: "#c02a3e",
      yellow: "#d9bd4c",
      cyan: "#4fc99c",
      magenta: "#632ff4",
      hotpink: "#fc7d1c",
      green: "#44aaf3",
    },
    recolor: "none",
    glow: 0,
  },
  neon: {
    bg: "#05050a",
    text: "#00f5ff",
    paddle: "#00f5ff",
    paddleAccent: "#ff006e",
    ball: "#ffffff",
    blocks: {
      gray: "#d4d4ff",
      red: "#ff2a55",
      yellow: "#f5ff00",
      cyan: "#00f5ff",
      magenta: "#c040ff",
      hotpink: "#ff8a00",
      green: "#3d8bff",
    },
    recolor: "shade",
    glow: 10,
  },
  // NES: 8 colores contando el negro del fondo y de los contornos.
  retro: {
    bg: "#000000",
    text: "#fcfcfc",
    paddle: "#fcfcfc",
    paddleAccent: "#f83800",
    ball: "#fcfcfc",
    blocks: {
      gray: "#fcfcfc",
      red: "#f83800",
      yellow: "#f8d878",
      cyan: "#3cbcfc",
      magenta: "#9878f8",
      hotpink: "#fca044",
      green: "#6888fc",
    },
    recolor: "flat",
    glow: 0,
  },
};
