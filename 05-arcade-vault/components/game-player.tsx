"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { guardarScore } from "@/app/jugar/actions";
import { GameCanvas, type GameCanvasHandle } from "@/components/game-canvas";
import { Leaderboard } from "@/components/leaderboard";
import type { Game, ScoreRow } from "@/lib/games";
import { getEngine } from "@/lib/games/registry";
import { DEFAULT_SKIN, SKIN_IDS, SKIN_LABELS } from "@/lib/games/skins";
import { useSkin } from "@/lib/games/use-skin";
import { limpiarIniciales, normalizarIniciales } from "@/lib/iniciales";
import { useSession } from "@/lib/session";
/** Puntos que cuesta subir de nivel en la simulación. */
const PUNTOS_POR_NIVEL = 2500;
export function GamePlayer({
  game,
  hasLeaderboard,
  scores,
}: {
  game: Game;
  /** Top del juego, para la columna del ranking junto a la pantalla. */
  scores: ScoreRow[];
  /** ¿Tiene fila en `games`? Sólo entonces se puede guardar la puntuación. */
  hasLeaderboard: boolean;
}) {
  const { user } = useSession();
  const entry = getEngine(game.id);
  const [skin, setSkin] = useSkin(game.id);
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
  // La pantalla ocupa el alto de la ventana menos la barra de navegación, cuyo
  // alto cambia con el ancho (los enlaces se parten). Se mide en vivo y se
  // publica como --av-nav-h para que el CSS no dependa de un número fijo.
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>(".av-nav");
    if (!nav) return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => {
      root.style.setProperty("--av-nav-h", nav.offsetHeight + "px");
    });
    ro.observe(nav);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--av-nav-h");
    };
  }, []);
  const level = entry ? engineLevel : 1 + Math.floor(score / PUNTOS_POR_NIVEL);
  const name = customName ?? user?.name ?? "INVITADO";
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
          {/* Cambiar de skin recrea el motor: la partida vuelve a empezar. */}
          {entry?.skins && (
            <div className="skin-picker">
              <div className="skin-picker-label" id="av-skin-label">
                Skin · reinicia la partida
              </div>
              <div className="skin-picker-opts" role="radiogroup" aria-labelledby="av-skin-label">
                {SKIN_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={skin === id}
                    className={`skin-opt ${id}`}
                    disabled={over}
                    onClick={() => {
                      if (id !== skin) setSkin(id);
                    }}
                  >
                    <span className="skin-swatch" aria-hidden="true" />
                    {SKIN_LABELS[id]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="crt">
        {/* `crt-fit` es un contenedor de tamaño: la pantalla se encaja en él por
            alto o por ancho, lo que llegue antes, sin restar a mano el chrome. */}
        <div className="crt-fit">
          <div className="crt-screen">
            {entry ? (
              <GameCanvas
                ref={canvasRef}
                entry={entry}
                paused={paused || over}
                skin={entry.skins ? skin : DEFAULT_SKIN}
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
        </div>
        <div className="crt-bottom">
          <span className="led">SEÑAL OK</span>
          <span>{game.title} · CRT-83 · 60 HZ</span>
          <span>CARGA · 1MB</span>
        </div>
      </div>
      {entry && <Leaderboard scores={scores} className="player-board" />}
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
              <Link className="btn magenta" href={`/salon?juego=${game.id}`}>
                VOLVER AL LEADERBOARD
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
