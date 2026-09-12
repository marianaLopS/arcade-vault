// Registro de motores reales.
//
// Las claves son los `id` de GAMES en lib/games.ts. Un juego que no aparezca
// aquí sigue siendo maqueta: components/game-player.tsx le pinta la simulación.
// Añadir un juego nuevo es añadir una línea, no un `if`.
import type { GameFactory } from "@/lib/games/engine";
import { createAsteroidsGame } from "@/lib/games/asteroids/engine";
/**
 * Todo lo que la plataforma necesita saber de un juego para montarlo: cómo se
 * crea, qué mundo lógico dibuja y qué teclas entiende. Los tres datos son por
 * juego, así que viven aquí y no escritos a mano en el canvas ni en el HUD.
 */
export type GameEngineEntry = {
  create: GameFactory;
  /** Mundo lógico del motor. El CSS sólo estira el píxel: la física no cambia. */
  width: number;
  height: number;
  /** `aria-label` del canvas: los controles de este juego, en español. */
  controls: string;
};
export const GAME_ENGINES: Record<string, GameEngineEntry> = {
  asteroids: {
    create: createAsteroidsGame,
    width: 800,
    height: 600,
    controls:
      "flechas para rotar y propulsar, espacio para disparar, flecha abajo para el escudo, B para la bomba nova, Shift para la hiperpropulsión",
  },
};
export function getEngine(id: string): GameEngineEntry | undefined {
  return GAME_ENGINES[id];
}
