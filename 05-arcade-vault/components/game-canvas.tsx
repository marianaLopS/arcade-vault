"use client";
import { useEffect, useImperativeHandle, useRef } from "react";
import type { GameEngine } from "@/lib/games/engine";
import type { GameEngineEntry } from "@/lib/games/registry";
import type { SkinId } from "@/lib/games/skins";
export type GameCanvasHandle = {
  /** Reinicia la partida sin desmontar el canvas. */
  restart: () => void;
  /** Devuelve el foco al canvas para que el teclado vuelva a llegar al juego. */
  focus: () => void;
  /**
   * Pulsa (`down`) o suelta una tecla sobre el canvas. La usa el mando táctil:
   * los motores escuchan keydown/keyup en el canvas y deciden por `e.code`, así
   * que un evento sintético les llega igual que uno del teclado.
   */
  key: (code: string, down: boolean) => void;
};
type Props = {
  /** Entrada del registro: la factoría, el mundo lógico y los controles. */
  entry: GameEngineEntry;
  paused: boolean;
  /** Paleta del motor. Cambiarla recrea el motor y reinicia la partida. */
  skin: SkinId;
  onScore: (score: number) => void;
  onLives: (lives: number) => void;
  onLevel: (level: number) => void;
  onGameOver: (finalScore: number) => void;
  /** La dispara `P` o `Escape`; el motor no ve esas teclas. */
  onTogglePause: () => void;
  ref?: React.Ref<GameCanvasHandle>;
};
export function GameCanvas({
  entry,
  paused,
  skin,
  onScore,
  onLives,
  onLevel,
  onGameOver,
  onTogglePause,
  ref,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  // Los callbacks cambian en cada render del padre (el HUD se repinta al subir
  // el marcador). Se guardan en una ref para que el efecto de abajo dependa
  // sólo de `entry` y `skin` y el motor no se recree a mitad de partida.
  const handlers = useRef({ onScore, onLives, onLevel, onGameOver, onTogglePause });
  // Si el motor se recrea (cambio de skin) con la partida en pausa, el nuevo
  // tiene que nacer pausado: el efecto de `paused` no vuelve a dispararse.
  const pausedRef = useRef(paused);
  useEffect(() => {
    handlers.current = { onScore, onLives, onLevel, onGameOver, onTogglePause };
    pausedRef.current = paused;
  });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = entry.create(
      canvas,
      {
        onScore: (v) => handlers.current.onScore(v),
        onLives: (v) => handlers.current.onLives(v),
        onLevel: (v) => handlers.current.onLevel(v),
        onGameOver: (v) => handlers.current.onGameOver(v),
      },
      { skin },
    );
    engineRef.current = engine;
    engine.start();
    if (pausedRef.current) engine.pause();
    canvas.focus();
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [entry, skin]);
  // Pausa y reanudación. No arranca nada por su cuenta: el efecto de arriba ya
  // dejó el bucle en marcha.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (paused) engine.pause();
    else engine.resume();
  }, [paused]);
  useImperativeHandle(ref, () => ({
    restart: () => {
      engineRef.current?.restart();
      canvasRef.current?.focus();
    },
    focus: () => canvasRef.current?.focus(),
    key: (code, down) => {
      canvasRef.current?.dispatchEvent(
        new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true, cancelable: true }),
      );
    },
  }));
  // `P` y `Escape` se atienden aquí y no llegan al motor, que sólo consume
  // flechas y espacio. El resto del teclado pasa de largo: no secuestramos
  // la navegación de la página.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (e.code === "KeyP" || e.code === "Escape") {
      e.preventDefault();
      onTogglePause();
    }
  };
  return (
    <canvas
      ref={canvasRef}
      className="game-canvas"
      width={entry.width}
      height={entry.height}
      style={{ aspectRatio: entry.width + " / " + entry.height }}
      tabIndex={0}
      role="application"
      aria-label={entry.controls}
      onKeyDown={handleKeyDown}
      onClick={() => canvasRef.current?.focus()}
    />
  );
}
