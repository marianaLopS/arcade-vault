"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { guardarScore } from "@/app/jugar/actions";
import { GameCanvas, type GameCanvasHandle } from "@/components/game-canvas";
import type { Game } from "@/lib/games";
import { getEngine } from "@/lib/games/registry";
import { limpiarIniciales, normalizarIniciales } from "@/lib/iniciales";
import { useSession } from "@/lib/session";
/** Puntos que cuesta subir de nivel en la simulación. */
const PUNTOS_POR_NIVEL = 2500;
export function GamePlayer({
  game,
  hasLeaderboard,
}: {
  game: Game;
  /** ¿Tiene fila en `games`? Sólo entonces se puede guardar la puntuación. */
  hasLeaderboard: boolean;
}) {
  const { user } = useSession();
  const entry = getEngine(game.id);
  const canvasRef = useRef<GameCanvasHandle>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [engineLevel, setEngineLevel] = useState(1);
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  const [guardando, startGuardado] = useTransition();
  /** Iniciales escritas en el modal; si es null manda el nombre de la sesión. */
  const [customName, setCustomName] = useState<string | null>(null);
  // Sólo para los juegos que todavía no tienen motor: esto no es un juego, es
  // un contador que finge una partida para poder ver los estados de la maqueta
  // (en marcha, en pausa, fin de partida).
  useEffect(() => {
    if (entry || over || paused) return;
    const t = setInterval(() => {
      setScore((s) => s + Math.floor(10 + Math.random() * 90));
    }, 220);
    return () => clearInterval(t);
  }, [entry, over, paused]);
  const level = entry ? engineLevel : 1 + Math.floor(score / PUNTOS_POR_NIVEL);
  const name = customName ?? user?.name ?? "INVITADO";
  const restart = () => {
    setScore(0);
    setLives(3);
    setEngineLevel(1);
    setPaused(false);
    setOver(false);
    setSaved(false);
    setErrorGuardado(null);
    canvasRef.current?.restart();
  };
  // Lo que se va a guardar de verdad: la columna `player` acepta tres letras.
  const iniciales = normalizarIniciales(name);
  const guardar = () => {
    if (guardando || saved) return;
    setErrorGuardado(null);
    startGuardado(async () => {
      const res = await guardarScore({ game: game.id, score, name: iniciales });
      if (res.ok) setSaved(true);
      else setErrorGuardado(res.error);
    });
  };
  return (
    <div
      className={`av-player fade-in${entry ? " has-canvas" : ""}`}
      // El marco CRT necesita la razón del mundo lógico en dos números: calc()
      // no sabe multiplicar por un valor de aspect-ratio. Sin motor no se ponen
      // y el CSS cae en el 4 / 3 de siempre.
      style={
        entry
          ? ({ "--av-arw": entry.width, "--av-arh": entry.height } as React.CSSProperties)
          : undefined
      }
    >
      <div className="player-hud">
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div className="hud-stat">
            <div className="l">Jugador</div>
            <div className="v" style={{ color: "var(--ink)" }}>
              {name}
            </div>
          </div>
          <div className="hud-stat">
            <div className="l">Puntuación</div>
            <div className="v">{score.toLocaleString("es-ES")}</div>
          </div>
          <div className="hud-stat lives">
            <div className="l">Vidas</div>
            <div className="v">{"♥ ".repeat(lives).trim() || "—"}</div>
          </div>
          <div className="hud-stat level">
            <div className="l">Nivel</div>
            <div className="v">{String(level).padStart(2, "0")}</div>
          </div>
        </div>
        <div className="hud-actions">
          <button className="btn yellow" onClick={() => setPaused((p) => !p)}>
            {paused ? "REANUDAR" : "PAUSA"}
          </button>
          {/* Con motor real el fin de partida lo decide el juego, no un botón. */}
          {!entry && (
            <button className="btn magenta" onClick={() => setOver(true)}>
              FIN
            </button>
          )}
          <Link className="btn ghost" href={`/juegos/${game.id}`}>
            SALIR
          </Link>
        </div>
      </div>
      <div className="crt">
        <div className="crt-screen">
          {entry ? (
            <GameCanvas
              ref={canvasRef}
              entry={entry}
              paused={paused || over}
              onScore={setScore}
              onLives={setLives}
              onLevel={setEngineLevel}
              onGameOver={(finalScore) => {
                setScore(finalScore);
                setOver(true);
              }}
              onTogglePause={() => setPaused((p) => !p)}
            />
          ) : (
            <div className="game-arena">
              <div className="grid-floor" />
              <div className="enemy e1" />
              <div className="enemy e2" />
              <div className="enemy e3" />
              <div className="player-ship" />
            </div>
          )}
          {paused && (
            <div className="crt-content" style={{ background: "rgba(0,0,0,0.6)", zIndex: 5 }}>
              <div>
                <div className="pixel neon-yellow" style={{ fontSize: 22 }}>
                  EN PAUSA
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: "var(--ink-dim)",
                    marginTop: 10,
                    letterSpacing: "0.16em",
                  }}
                >
                  PULSA REANUDAR PARA CONTINUAR
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="crt-bottom">
          <span className="led">SEÑAL OK</span>
          <span>{game.title} · CRT-83 · 60 HZ</span>
          <span>CARGA · 1MB</span>
        </div>
      </div>
      {over && (
        <div className="modal-bd">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="av-fin-titulo">
            <h2 id="av-fin-titulo">FIN DEL JUEGO</h2>
            <div className="final-label">PUNTUACIÓN FINAL</div>
            <div className="final">{score.toLocaleString("es-ES")}</div>
            {hasLeaderboard &&
              (!saved ? (
                <>
                  <div className="input-row">
                    <input
                      value={customName ?? iniciales}
                      onChange={(e) => setCustomName(limpiarIniciales(e.target.value))}
                      placeholder="TUS INICIALES"
                      aria-label="Tus iniciales"
                      maxLength={3}
                      autoFocus
                    />
                    <button className="btn yellow" onClick={guardar} disabled={guardando}>
                      {guardando ? "GUARDANDO…" : "GUARDAR PUNTUACIÓN"}
                    </button>
                  </div>
                  {errorGuardado && (
                    <div className="save-error" role="alert">
                      ▸ {errorGuardado}
                    </div>
                  )}
                </>
              ) : (
                <div className="toast-saved">▸ PUNTUACIÓN GUARDADA_</div>
              ))}
            <div className="actions">
              <button className="btn" onClick={restart}>
                JUGAR DE NUEVO
              </button>
              <Link className="btn magenta" href="/biblioteca">
                VOLVER AL VAULT
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
