// Registro de motores reales.
//
// Las claves son los `id` de GAMES en lib/games.ts. Un juego que no aparezca
// aquí sigue siendo maqueta: components/game-player.tsx le pinta la simulación.
// Añadir un juego nuevo es añadir una línea, no un `if`.
import type { GameFactory } from "@/lib/games/engine";
import { createAsteroidsGame } from "@/lib/games/asteroids/engine";
export const GAME_ENGINES: Record<string, GameFactory> = {
  asteroids: createAsteroidsGame,
};
export function getEngine(id: string): GameFactory | undefined {
  return GAME_ENGINES[id];
}
