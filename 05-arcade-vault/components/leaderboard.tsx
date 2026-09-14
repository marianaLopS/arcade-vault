import type { ScoreRow } from "@/lib/games";
/** Tabla de mejores puntuaciones: la comparten la ficha del juego y la pantalla de juego. */
export function Leaderboard({ scores, className }: { scores: ScoreRow[]; className?: string }) {
  return (
    <div className={"leaderboard" + (className ? " " + className : "")}>
      <h3>MEJORES PUNTUACIONES</h3>
      {scores.length === 0 && (
        <>
          {[1, 2, 3].map((n) => (
            <div className="lb-row ghost" key={n} aria-hidden="true">
              <div className="rk">#{String(n).padStart(2, "0")}</div>
              <div className="pl">— — —</div>
              <div className="sc">—</div>
            </div>
          ))}
          <p className="board-cta">
            NADIE HA FIRMADO TODAVÍA.
            <br />
            JUEGA UNA PARTIDA Y QUÉDATE EL <b>#01</b>
            <span className="caret" />
          </p>
        </>
      )}
      {scores.map((r, i) => (
        <div
          key={r.name + i}
          className={"lb-row" + (i === 0 ? " top1" : i === 1 ? " top2" : i === 2 ? " top3" : "")}
        >
          <div className="rk">#{String(r.rank).padStart(2, "0")}</div>
          <div className="pl">
            {r.name}
            <div
              className="dt"
              style={{ fontSize: 10, color: "var(--ink-faint)", letterSpacing: "0.1em" }}
            >
              {r.date}
            </div>
          </div>
          <div className="sc">{r.score.toLocaleString("es-ES")}</div>
        </div>
      ))}
    </div>
  );
}
