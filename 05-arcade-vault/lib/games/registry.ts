// Registro de motores reales.
//
// Las claves son los `id` de GAMES en lib/games.ts. Un juego que no aparezca
// aquí sigue siendo maqueta: components/game-player.tsx le pinta la simulación.
// Añadir un juego nuevo es añadir una línea, no un `if`.
import type { GameFactory } from "@/lib/games/engine";
import { createArkanoidGame } from "@/lib/games/arkanoid/engine";
import { createAsteroidsGame } from "@/lib/games/asteroids/engine";
import { createCaidaGame } from "@/lib/games/caida/engine";
import { createFroggerGame } from "@/lib/games/frogger/engine";
import { createSnakeGame } from "@/lib/games/snake/engine";
/** Un botón de acción del mando táctil: la tecla que imita y su rótulo. */
export type TouchButton = { code: string; label: string };
/**
 * Mando táctil del juego. La cruceta siempre envía las cuatro flechas; A y B
 * sólo se pintan si el juego les da función.
 */
export type TouchControls = {
  /** Botón derecho, el principal. */
  a?: TouchButton;
  /** Botón izquierdo. */
  b?: TouchButton;
  /** La cruceta reenvía keydown mientras se mantiene (motores que mueven por pulsación). */
  repeat?: boolean;
};
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
  /** Tiene paletas clasico / neon / retro: GamePlayer muestra el selector. */
  skins?: boolean;
  /** Mapeo del mando táctil; sin él no se pinta mando en móvil. */
  touch?: TouchControls;
};
export const GAME_ENGINES: Record<string, GameEngineEntry> = {
  asteroids: {
    create: createAsteroidsGame,
    width: 800,
    height: 600,
    controls:
      "flechas para rotar y propulsar, espacio para disparar, flecha abajo para el escudo, B para la bomba nova, Shift para la hiperpropulsión",
    skins: true,
    touch: { a: { code: "Space", label: "DISPARO" }, b: { code: "KeyB", label: "BOMBA" } },
  },
  caida: {
    create: createCaidaGame,
    width: 420,
    height: 600,
    controls: "flechas para mover y bajar, flecha arriba o X para rotar, espacio para caída rápida",
    touch: {
      a: { code: "KeyX", label: "GIRAR" },
      b: { code: "Space", label: "CAÍDA" },
      repeat: true,
    },
  },
  arkanoid: {
    create: createArkanoidGame,
    width: 800,
    height: 600,
    controls: "flechas o ratón para mover la pala, espacio para lanzar la bola, M para silenciar",
    skins: true,
    touch: { a: { code: "Space", label: "LANZAR" }, b: { code: "KeyM", label: "SONIDO" } },
  },
  snake: {
    create: createSnakeGame,
    width: 800,
    height: 600,
    controls: "flechas o WASD para girar la serpiente",
    skins: true,
    touch: {},
  },
  frogger: {
    create: createFroggerGame,
    width: 640,
    height: 560,
    controls: "flechas o WASD para saltar una casilla",
  },
};
export function getEngine(id: string): GameEngineEntry | undefined {
  return GAME_ENGINES[id];
}
