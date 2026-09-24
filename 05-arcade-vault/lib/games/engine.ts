// Contrato que todo juego real de Arcade Vault implementa.
//
// El motor no sabe nada de React: dibuja en un canvas y avisa por callbacks.
// El reproductor (components/game-player.tsx) traduce esos avisos al HUD.
import type { SkinId } from "@/lib/games/skins";
/** Avisos del motor hacia la plataforma. Se emiten sólo cuando el valor cambia. */
export type GameCallbacks = {
  onScore: (score: number) => void;
  onLives: (lives: number) => void;
  onLevel: (level: number) => void;
  onGameOver: (finalScore: number) => void;
};
/** Mandos que la plataforma tiene sobre una partida en curso. */
export type GameEngine = {
  start: () => void;
  pause: () => void;
  resume: () => void;
  restart: () => void;
  /** Cancela el requestAnimationFrame y quita los listeners. Idempotente. */
  destroy: () => void;
};
/** Opciones de creación. Los motores sin skins las ignoran. */
export type GameOptions = {
  /** Paleta a usar; sin valor, DEFAULT_SKIN. */
  skin?: SkinId;
};
/**
 * Crea una partida sobre un canvas concreto. Cada llamada devuelve un motor
 * independiente: el estado vive en la clausura, no en variables de módulo.
 */
export type GameFactory = (
  canvas: HTMLCanvasElement,
  callbacks: GameCallbacks,
  options?: GameOptions,
) => GameEngine;
