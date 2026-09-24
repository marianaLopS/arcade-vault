// Recoloreado del spritesheet de Arkanoid según el skin.
//
// Se ejecuta UNA vez, cuando carga el PNG, sobre el canvas fuera de pantalla
// que el motor ya usa como sheet: los frames siguen dibujándose con el mismo
// drawImage y las mismas coordenadas de sprites.ts. Nada de esto corre por frame.
//
// Técnica: por píxel, luma relativa al tono dominante del sprite (k). El tono
// dominante pasa a ser exactamente el color del skin; el resto conserva su
// relación de brillo (`shade`) o se reduce a color plano + contorno negro (`flat`).
import type { BlockColor, SpriteFrame } from "@/lib/games/arkanoid/sprites";
import { EXPLOSION_FRAMES, SPRITES } from "@/lib/games/arkanoid/sprites";
import type { Palette } from "@/lib/games/arkanoid/skins";
type Rgb = [number, number, number];
/** Por debajo de esta fracción del tono dominante, `flat` pinta contorno negro. */
const FLAT_THRESHOLD = 0.5;
/** Saturación a partir de la cual un píxel de la pala es remate (accent). */
const ACCENT_SAT = 0.4;
function hexToRgb(hex: string): Rgb {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luma(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
function saturation(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
}
/** Luma del color opaco más frecuente del frame (ignorando el negro del contorno). */
function dominantLuma(
  px: Uint8ClampedArray,
  w: number,
  f: SpriteFrame,
  keep: (r: number, g: number, b: number) => boolean,
): number {
  const counts = new Map<number, number>();
  for (let y = f.sy; y < f.sy + f.sh; y++) {
    for (let x = f.sx; x < f.sx + f.sw; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b, a] = [px[i], px[i + 1], px[i + 2], px[i + 3]];
      if (a < 128 || luma(r, g, b) < 20 || !keep(r, g, b)) continue;
      const key = (r << 16) | (g << 8) | b;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let best = -1;
  let bestN = 0;
  for (const [key, n] of counts) {
    if (n > bestN) {
      best = key;
      bestN = n;
    }
  }
  return best < 0 ? 255 : luma((best >> 16) & 255, (best >> 8) & 255, best & 255);
}
type Target = { rgb: Rgb; base: number };
function recolorFrame(
  px: Uint8ClampedArray,
  w: number,
  f: SpriteFrame,
  mode: "shade" | "flat",
  main: Target,
  accent?: Target,
) {
  for (let y = f.sy; y < f.sy + f.sh; y++) {
    for (let x = f.sx; x < f.sx + f.sw; x++) {
      const i = (y * w + x) * 4;
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      const t = accent && saturation(r, g, b) > ACCENT_SAT ? accent : main;
      const k = luma(r, g, b) / t.base;
      let out: Rgb;
      if (mode === "flat") {
        px[i + 3] = px[i + 3] < 128 ? 0 : 255;
        out = k < FLAT_THRESHOLD ? [0, 0, 0] : t.rgb;
      } else if (k <= 1) {
        out = [t.rgb[0] * k, t.rgb[1] * k, t.rgb[2] * k];
      } else {
        const up = Math.min(1, k - 1);
        out = [
          t.rgb[0] + (255 - t.rgb[0]) * up,
          t.rgb[1] + (255 - t.rgb[1]) * up,
          t.rgb[2] + (255 - t.rgb[2]) * up,
        ];
      }
      px[i] = out[0];
      px[i + 1] = out[1];
      px[i + 2] = out[2];
    }
  }
}
/** Recolorea en sitio el sheet copiado. No-op con `recolor: "none"` (clásico). */
export function recolorSheet(sheet: HTMLCanvasElement, palette: Palette) {
  const mode = palette.recolor;
  if (mode === "none") return;
  const ctx = sheet.getContext("2d");
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, sheet.width, sheet.height);
  const px = img.data;
  const w = sheet.width;
  const any = () => true;
  const grey = (r: number, g: number, b: number) => saturation(r, g, b) <= ACCENT_SAT;
  const vivid = (r: number, g: number, b: number) => saturation(r, g, b) > ACCENT_SAT;
  // Las bases se miden ANTES de tocar nada: el tono dominante del bloque sirve
  // también para sus explosiones, que comparten paleta.
  const colors = Object.keys(SPRITES.blocks) as BlockColor[];
  const blockBase = new Map(
    colors.map((c) => [c, dominantLuma(px, w, SPRITES.blocks[c], any)] as const),
  );
  const paddleBase = dominantLuma(px, w, SPRITES.paddle, grey);
  const accentBase = dominantLuma(px, w, SPRITES.paddle, vivid);
  const ballBase = dominantLuma(px, w, SPRITES.ball, any);
  // Cada región se recolorea una sola vez: los frames de explosión de `gray`
  // son los de `red` en el PNG, así que se saltan.
  const done = new Set<string>();
  const once = (f: SpriteFrame, fn: () => void) => {
    const key = `${f.sx},${f.sy}`;
    if (done.has(key)) return;
    done.add(key);
    fn();
  };
  for (const c of colors) {
    const target = { rgb: hexToRgb(palette.blocks[c]), base: blockBase.get(c) ?? 255 };
    once(SPRITES.blocks[c], () => recolorFrame(px, w, SPRITES.blocks[c], mode, target));
    if (c === "gray") continue;
    for (const f of EXPLOSION_FRAMES[c]) once(f, () => recolorFrame(px, w, f, mode, target));
  }
  recolorFrame(
    px,
    w,
    SPRITES.paddle,
    mode,
    { rgb: hexToRgb(palette.paddle), base: paddleBase },
    { rgb: hexToRgb(palette.paddleAccent), base: accentBase },
  );
  recolorFrame(px, w, SPRITES.ball, mode, { rgb: hexToRgb(palette.ball), base: ballBase });
  ctx.putImageData(img, 0, 0);
}
