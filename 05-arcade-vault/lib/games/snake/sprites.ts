// Coordenadas de las frutas de `snake-assets/fruits.png` (fila central, pixel-art).
//
// Copiadas de `sprites.js` en su orden, sin sus nombres: no corresponden al
// dibujo (la primera se llama `banana` y es una manzana). La fruta es solo
// visual, así que el motor las usa por índice.
export type FruitSprite = { x: number; y: number; w: number; h: number };
export const FRUIT_SPRITES: readonly FruitSprite[] = [
  { x: 34, y: 136, w: 110, h: 160 },
  { x: 186, y: 136, w: 150, h: 160 },
  { x: 378, y: 136, w: 110, h: 160 },
  { x: 540, y: 136, w: 130, h: 160 },
  { x: 712, y: 136, w: 130, h: 160 },
  { x: 894, y: 136, w: 110, h: 160 },
  { x: 1066, y: 136, w: 110, h: 160 },
  { x: 1228, y: 136, w: 130, h: 160 },
  { x: 1400, y: 136, w: 130, h: 160 },
  { x: 1582, y: 136, w: 110, h: 160 },
  { x: 1734, y: 136, w: 150, h: 160 },
  { x: 1906, y: 136, w: 150, h: 160 },
  { x: 2068, y: 136, w: 170, h: 160 },
  { x: 2250, y: 136, w: 140, h: 160 },
  { x: 2432, y: 136, w: 130, h: 160 },
  { x: 2604, y: 136, w: 130, h: 160 },
  { x: 2786, y: 136, w: 110, h: 160 },
  { x: 2948, y: 136, w: 130, h: 160 },
  { x: 3110, y: 136, w: 150, h: 160 },
  { x: 3302, y: 136, w: 110, h: 160 },
  { x: 3454, y: 136, w: 150, h: 160 },
  { x: 3637, y: 136, w: 130, h: 160 },
];
