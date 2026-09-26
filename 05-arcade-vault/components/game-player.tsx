"use client";
import Link from "next/link";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { guardarScore } from "@/app/jugar/actions";
import { FpsMeter } from "@/components/fps-meter";
import { GameCanvas, type GameCanvasHandle } from "@/components/game-canvas";
import { Leaderboard } from "@/components/leaderboard";
import { TouchPad } from "@/components/touch-pad";
import type { Game, ScoreRow } from "@/lib/games";
import { getEngine } from "@/lib/games/registry";
import { DEFAULT_SKIN, isSkinId, SKIN_IDS, SKIN_LABELS } from "@/lib/games/skins";
import { useSkin } from "@/lib/games/use-skin";
import { limpiarIniciales, normalizarIniciales } from "@/lib/iniciales";
import { useSession } from "@/lib/session";
/** Puntos que cuesta subir de nivel en la simulación. */
const PUNTOS_POR_NIVEL = 2500;
/** Pausar re-renderiza GamePlayer; la tabla no cambia, así que no se repinta. */
const MemoLeaderboard = memo(Leaderboard);
// Formato de los tres valores del HUD que cambian durante la partida. No son
// estado de React: los escribe `pintar` directamente en el DOM (SPEC 13).
const fmtScore = (v: number) => v.toLocaleString("es-ES");
const fmtVidas = (v: number) => "♥ ".repeat(v).trim() || "—";
const fmtNivel = (v: number) => String(v).padStart(2, "0");
function pintar(el: HTMLElement | null, text: string) {
  if (el && el.textContent !== text) el.textContent = text;
}
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
  /** Renders confirmados de este componente; lo lee el medidor `?fps=1`. */
  const renders = useRef(0);
  useEffect(() => {
    renders.current++;
  });
  // Puntos, vidas y nivel cambian durante la partida: viven en refs y se
  // escriben en el DOM, así el motor no re-renderiza la página al avisar.
  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  const levelRef = useRef(1);
  const scoreEl = useRef<HTMLDivElement>(null);
  const livesEl = useRef<HTMLDivElement>(null);
  const levelEl = useRef<HTMLDivElement>(null);
  const pintarNivel = useCallback((v: number) => {
    levelRef.current = v;
    pintar(levelEl.current, fmtNivel(v));
  }, []);
  const pintarVidas = useCallback((v: number) => {
    livesRef.current = v;
    pintar(livesEl.current, fmtVidas(v));
  }, []);
  const pintarScore = useCallback(
    (v: number) => {
      scoreRef.current = v;
      pintar(scoreEl.current, fmtScore(v));
      // Sin motor, el nivel de la simulación se deriva de los puntos.
      if (!entry) pintarNivel(1 + Math.floor(v / PUNTOS_POR_NIVEL));
    },
    [entry, pintarNivel],
  );
  // Los `.v` de arriba no tienen hijos de React: tras cada render (y en el
  // primero, tras hidratar) se reescriben desde las refs.
  useLayoutEffect(() => {
    pintar(scoreEl.current, fmtScore(scoreRef.current));
    pintar(livesEl.current, fmtVidas(livesRef.current));
    pintar(levelEl.current, fmtNivel(levelRef.current));
  });
  const [paused, setPaused] = useState(false);
  /** Puntuación final mientras se enseña el modal; `null` = partida en curso. */
  const [over, setOver] = useState<number | null>(null);
  const [guardado, setGuardado] = useState<{ ok: true } | { error: string } | null>(null);
  const saved = guardado !== null && "ok" in guardado;
  const errorGuardado = guardado !== null && "error" in guardado ? guardado.error : null;
  const [guardando, startGuardado] = useTransition();
  /** Iniciales escritas en el modal; si es null manda el nombre de la sesión. */
  const [customName, setCustomName] = useState<string | null>(null);
  // Sólo para los juegos que todavía no tienen motor: esto no es un juego, es
  // un contador que finge una partida para poder ver los estados de la maqueta
  // (en marcha, en pausa, fin de partida).
  useEffect(() => {
    if (entry || over !== null || paused) return;
    const t = setInterval(() => {
      pintarScore(scoreRef.current + Math.floor(10 + Math.random() * 90));
    }, 220);
    return () => clearInterval(t);
  }, [entry, over, paused, pintarScore]);
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
  const name = customName ?? user?.name ?? "INVITADO";
  // Lo que se va a guardar de verdad: la columna `player` acepta tres letras.
  const iniciales = normalizarIniciales(name);
  const guardar = () => {
    if (guardando || saved || over === null) return;
    setGuardado(null);
    startGuardado(async () => {
      const res = await guardarScore({ game: game.id, score: over, name: iniciales });
      setGuardado(res.ok ? { ok: true } : { error: res.error });
    });
  };
  // Nueva partida desde el modal: el motor se reinicia y vuelve a avisar de
  // score, vidas y nivel; aquí sólo se limpia el estado del fin de partida.
  const jugarDeNuevo = () => {
    setOver(null);
    setGuardado(null);
    setPaused(false);
    // Antes del restart: el motor vuelve a avisar enseguida con sus valores.
    pintarScore(0);
    pintarVidas(3);
    pintarNivel(1);
    canvasRef.current?.restart();
  };
  // Callbacks estables hacia GameCanvas y TouchPad.
  const onGameOver = useCallback(
    (finalScore: number) => {
      pintarScore(finalScore);
      setOver(finalScore);
    },
    [pintarScore],
  );
  const togglePause = useCallback(() => setPaused((p) => !p), []);
  const onPadKey = useCallback(
    (code: string, down: boolean) => canvasRef.current?.key(code, down),
    [],
  );
  // El selector de skin vive en el HUD y, en táctil, dentro de la pausa: el
  // CSS enseña uno u otro. Cada copia necesita su propio `id` para el label.
  const skinPicker = (id: string) =>
    entry?.skins && (
      <div className="skin-picker">
        <label className="skin-picker-label" htmlFor={id}>
          Tema
        </label>
        <div className={`skin-select ${skin}`}>
          <span className="skin-swatch" aria-hidden="true" />
          <select
            id={id}
            value={skin}
            disabled={over !== null}
            onChange={(e) => {
              if (isSkinId(e.target.value)) setSkin(e.target.value);
            }}
          >
            {SKIN_IDS.map((sid) => (
              <option key={sid} value={sid}>
                {SKIN_LABELS[sid]}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
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
            <div className="v" ref={scoreEl} />
          </div>
          <div className="hud-stat lives">
            <div className="l">Vidas</div>
            <div className="v" ref={livesEl} />
          </div>
          <div className="hud-stat level">
            <div className="l">Nivel</div>
            <div className="v" ref={levelEl} />
          </div>
          {/* Cambiar de skin recrea el motor: la partida vuelve a empezar. */}
          {skinPicker("av-skin")}
        </div>
        <div className="hud-actions">
          <button className="btn yellow" onClick={() => setPaused((p) => !p)}>
            {paused ? "REANUDAR" : "PAUSA"}
          </button>
          {/* Con motor real el fin de partida lo decide el juego, no un botón. */}
          {!entry && (
            <button className="btn magenta" onClick={() => setOver(scoreRef.current)}>
              FIN
            </button>
          )}
          <Link className="btn ghost hud-exit" href={`/juegos/${game.id}`}>
            SALIR
          </Link>
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
                paused={paused || over !== null}
                skin={entry.skins ? skin : DEFAULT_SKIN}
                onScore={pintarScore}
                onLives={pintarVidas}
                onLevel={pintarNivel}
                onGameOver={onGameOver}
                onTogglePause={togglePause}
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
            {entry && <FpsMeter renders={renders} />}
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
                  {/* Sólo en táctil: lo que la barra compacta del HUD esconde. */}
                  {entry?.touch && (
                    <div className="pause-extras">
                      {skinPicker("av-skin-pausa")}
                      <Link className="btn ghost" href={`/juegos/${game.id}`}>
                        SALIR
                      </Link>
                    </div>
                  )}
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
      {entry?.touch && (
        <TouchPad controls={entry.touch} disabled={paused || over !== null} onKey={onPadKey} />
      )}
      {entry && <MemoLeaderboard scores={scores} className="player-board" />}
      {over !== null && (
        <div className="modal-bd">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="av-fin-titulo">
            <h2 id="av-fin-titulo">FIN DEL JUEGO</h2>
            <div className="final-label">PUNTUACIÓN FINAL</div>
            <div className="final">{fmtScore(over)}</div>
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
              {entry && (
                <button className="btn yellow" onClick={jugarDeNuevo}>
                  JUGAR DE NUEVO
                </button>
              )}
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
