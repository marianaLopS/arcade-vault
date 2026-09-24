// Paletas de Snake, una por skin (ver lib/games/skins.ts).
//
// `clasico` copia tal cual los colores que el motor tenía fijos. La fruta sale
// de un spritesheet: sin `fruitTint` se dibuja con sus colores originales; con
// él, el motor cachea una silueta plana de cada fruta al cargar la hoja.
import type { SkinId } from "@/lib/games/skins";
export type Palette = {
  /** Fondo del canvas. */
  bg: string;
  /** Líneas de la cuadrícula (decorado, sin requisito de contraste). */
  grid: string;
  body: string;
  head: string;
  /** Texto "PULSA UNA FLECHA". */
  hint: string;
  /** Color plano de la fruta; null = sprite original. */
  fruitTint: string | null;
  /** Color del glow de la fruta (sólo con `glow` > 0). */
  fruitGlow: string;
  /** `shadowBlur` del glow; 0 = sin glow. */
  glow: number;
};
export const PALETTES: Record<SkinId, Palette> = {
  clasico: {
    bg: "#000",
    grid: "#0f1a12",
    body: "#39ff14",
    head: "#b6ff9e",
    hint: "#e8e8f0",
    fruitTint: null,
    fruitGlow: "#000",
    glow: 0,
  },
  // Tokens del sitio (--cyan, --yellow, --magenta, --ink) con glow.
  neon: {
    bg: "#05050a",
    grid: "#14122a",
    body: "#00f5ff",
    head: "#f5ff00",
    hint: "#e6e9ff",
    fruitTint: null,
    fruitGlow: "#ff006e",
    glow: 12,
  },
  // Monitor ámbar: 5 colores, sin glow. La fruta es una silueta plana. Las
  // scanlines ya las pone .crt-screen::after, no se repiten en el canvas.
  retro: {
    bg: "#120a00",
    grid: "#2e1c00",
    body: "#ffb000",
    head: "#ffe08a",
    hint: "#ffe08a",
    fruitTint: "#ff5a1f",
    fruitGlow: "#000",
    glow: 0,
  },
};
