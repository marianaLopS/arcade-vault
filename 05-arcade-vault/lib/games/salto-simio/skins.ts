// Paletas de SALTO SIMIO, una por skin (ver lib/games/skins.ts).
//
// `clasico` copia los COLOR_* que tenía el motor. En neón la saturación se reparte
// por papel (vigas magenta, escaleras azul, héroe cian, barriles amarillos) y el glow
// va sólo en vigas, barriles y héroe. Retro: 8 colores de la paleta NES, sin glow.
import type { SkinId } from "@/lib/games/skins";
export type Palette = {
  bg: string;
  girder: string;
  ladder: string;
  /** Barril de aceite del suelo. */
  oil: string;
  simio: string;
  /** Rescate de la cima (parpadea). */
  goal: string;
  barrel: string;
  /** Raya que gira sobre el barril. */
  barrelStripe: string;
  hero: string;
  /** Héroe durante la animación de muerte. */
  heroDead: string;
  /** Marcador de la cara del héroe. */
  heroFace: string;
  bonus: string;
  /** Fondo de la barra de bono (parte ya gastada). */
  bonusBg: string;
  /** `shadowBlur` del glow; 0 = sin glow. */
  glow: number;
};
export const PALETTES: Record<SkinId, Palette> = {
  // Colores del motor antes de los skins, sin cambios.
  clasico: {
    bg: "#000000",
    girder: "#ff2bd6",
    ladder: "#00c8d8",
    oil: "#2f5cff",
    simio: "#a0522d",
    goal: "#ffffff",
    barrel: "#ffd400",
    barrelStripe: "#7a4a00",
    hero: "#5ff7ff",
    heroDead: "#ff4040",
    heroFace: "#003040",
    bonus: "#ffd400",
    bonusBg: "#2a2a2a",
    glow: 0,
  },
  neon: {
    bg: "#05050a",
    girder: "#ff006e",
    ladder: "#3d8bff",
    oil: "#4d6bff",
    simio: "#ff8a3d",
    goal: "#ffffff",
    barrel: "#f5ff00",
    barrelStripe: "#ff006e",
    hero: "#00f5ff",
    heroDead: "#ff3b3b",
    heroFace: "#05050a",
    bonus: "#00ff88",
    bonusBg: "#1a1a2e",
    glow: 10,
  },
  // NES: negro, rojo, azul claro, azul, marrón, blanco, naranja, verde.
  retro: {
    bg: "#000000",
    girder: "#d82800",
    ladder: "#3cbcfc",
    oil: "#0058f8",
    simio: "#ac7c00",
    goal: "#fcfcfc",
    barrel: "#fca044",
    barrelStripe: "#000000",
    hero: "#b8f818",
    heroDead: "#d82800",
    heroFace: "#000000",
    bonus: "#fca044",
    bonusBg: "#0058f8",
    glow: 0,
  },
};
