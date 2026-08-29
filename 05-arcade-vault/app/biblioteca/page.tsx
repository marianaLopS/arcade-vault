"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { CATS, GAMES, type Game } from "@/lib/games";

function GameCard({ game }: { game: Game }) {
  const tiltRef = useRef<HTMLDivElement>(null);

  // El tilt se escribe directo en el DOM: es puramente visual y no merece
  // un re-render por cada movimiento del ratón.
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = tiltRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `translateY(-6px) rotateX(${-py * 6}deg) rotateY(${px * 8}deg)`;
  };

  const onLeave = () => {
    const el = tiltRef.current;
    if (el) el.style.transform = "";
  };

  const colorBtn = game.color === "magenta" ? "magenta" : game.color === "yellow" ? "yellow" : "";

  return (
    <div ref={tiltRef} className="card" onMouseMove={onMove} onMouseLeave={onLeave}>
      <Link href={`/juegos/${game.id}`} aria-label={`Ver ${game.title}`}>
        <div className="cover">
          <div className={"cover-bg " + game.cover} />
          <div className="label">{game.cat}</div>
        </div>
      </Link>
      <div className="meta">
        <div className="title">{game.title}</div>
        <div className="desc">{game.short}</div>
        <div className="row">
          <div className="score-badge">
            <span>MEJOR PUNTUACIÓN</span>
            <b>{game.best.toLocaleString("es-ES")}</b>
          </div>
          <Link className={"btn " + colorBtn} href={`/juegos/${game.id}`}>
            JUGAR
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function Library() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("TODOS");

  const filtered = useMemo(
    () =>
      GAMES.filter(
        (g) => (cat === "TODOS" || g.cat === cat) && g.title.toLowerCase().includes(q.toLowerCase()),
      ),
    [q, cat],
  );

  return (
    <div className="fade-in">
      <section className="av-hero">
        <h1 className="flicker">ARCADE VAULT</h1>
        <div className="sub">
          INSERTA UNA MONEDA PARA JUGAR <span className="blink">_</span>
        </div>
      </section>

      <div className="av-filters">
        <div className="av-search">
          <span className="ico" aria-hidden>
            ⌕
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar un juego por nombre…"
            aria-label="Buscar un juego por nombre"
          />
        </div>
        <div className="av-chips">
          {CATS.map((c) => (
            <button
              key={c}
              className={"chip" + (cat === c ? " active" : "")}
              onClick={() => setCat(c)}
              aria-pressed={cat === c}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="av-grid">
        {filtered.map((g) => (
          <GameCard key={g.id} game={g} />
        ))}
        {filtered.length === 0 && (
          <div
            style={{
              gridColumn: "1 / -1",
              textAlign: "center",
              padding: 80,
              color: "var(--ink-faint)",
            }}
          >
            <div
              className="pixel"
              style={{ fontSize: 14, color: "var(--magenta)", marginBottom: 12 }}
            >
              NO HAY RESULTADOS
            </div>
            <div>Intenta otra búsqueda o categoría.</div>
          </div>
        )}
      </div>
    </div>
  );
}
