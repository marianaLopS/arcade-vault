import Link from "next/link";
import { HallYouRow } from "@/components/hall-you-row";
import { GAMES, seededScores } from "@/lib/games";
import { hasLeaderboard, topScores } from "@/lib/scores";
export default async function HallOfFame({ searchParams }: PageProps<"/salon">) {
  // La pestaña vive en la URL: así cada pestaña es enlazable y sus puntuaciones
  // se leen en servidor. Un id desconocido cae en la primera, sin romper.
  const { juego } = await searchParams;
  const pedido = Array.isArray(juego) ? juego[0] : juego;
  const game = GAMES.find((g) => g.id === pedido) ?? GAMES[0];
  const conMarcador = await hasLeaderboard(game.id);
  const rows = conMarcador
    ? await topScores(game.id, 12)
    : seededScores(game.id.length * 23 + 7, 12);
  const vacio = rows.length === 0;
  return (
    <div className="av-hall fade-in">
      <div className="hall-head">
        <h1>SALÓN DE LA FAMA</h1>
        <p className="pixel" style={{ fontSize: 10 }}>
          LOS NOMBRES QUE NUNCA SE BORRAN DE LA PANTALLA
        </p>
      </div>
      <div className="hall-tabs">
        {GAMES.map((g) => (
          <Link
            key={g.id}
            href={`/salon?juego=${g.id}`}
            className={"chip" + (game.id === g.id ? " active" : "")}
            aria-current={game.id === g.id ? "page" : undefined}
          >
            {g.title}
          </Link>
        ))}
      </div>
      {/* El podio indexa las tres primeras filas: cada hueco se pinta sólo si su
          fila existe, y con la tabla vacía quedan las tres plazas sin reclamar. */}
      <div className="podium">
        <div className={"podium-slot" + (rows[1] ? " silver" : " empty")}>
          <div className="rank-num">02</div>
          <div className="name">{rows[1]?.name ?? "— — —"}</div>
          <div className="score">{rows[1] ? rows[1].score.toLocaleString("es-ES") : "—"}</div>
          <div className="date">{rows[1]?.date ?? ""}</div>
        </div>
        <div className={"podium-slot" + (rows[0] ? " gold" : " empty")}>
          <div
            className="pixel"
            style={{ fontSize: 9, color: "var(--gold)", letterSpacing: "0.18em" }}
          >
            {rows[0] ? "CAMPEÓN" : "PLAZA LIBRE"}
          </div>
          <div className="rank-num" style={{ fontSize: 36, marginTop: 4 }}>
            01
          </div>
          <div className="name">{rows[0]?.name ?? "— — —"}</div>
          <div className="score" style={{ fontSize: 20 }}>
            {rows[0] ? rows[0].score.toLocaleString("es-ES") : "—"}
          </div>
          <div className="date">{rows[0]?.date ?? ""}</div>
        </div>
        <div className={"podium-slot" + (rows[2] ? " bronze" : " empty")}>
          <div className="rank-num">03</div>
          <div className="name">{rows[2]?.name ?? "— — —"}</div>
          <div className="score">{rows[2] ? rows[2].score.toLocaleString("es-ES") : "—"}</div>
          <div className="date">{rows[2]?.date ?? ""}</div>
        </div>
      </div>
      <div className="hall-table">
        <div className="th">
          <div>RANGO</div>
          <div>JUGADOR</div>
          <div>PUNTUACIÓN</div>
          <div>FECHA</div>
        </div>
        {vacio && (
          <p className="board-cta">
            EL MARCADOR DE {game.title} ESTÁ EN BLANCO.
            <br />
            JUEGA UNA PARTIDA Y QUÉDATE EL <b>#01</b>
            <span className="caret" />
          </p>
        )}
        {rows.map((r, i) => (
          <div
            key={r.name + i}
            className={"tr" + (i === 0 ? " top1" : i === 1 ? " top2" : i === 2 ? " top3" : "")}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="rk">#{String(r.rank).padStart(2, "0")}</div>
            <div className="pl">{r.name}</div>
            <div className="sc">{r.score.toLocaleString("es-ES")}</div>
            <div className="dt">{r.date}</div>
          </div>
        ))}
        {!conMarcador && <HallYouRow gameId={game.id} gameTitle={game.title} rows={rows} />}
      </div>
      <div style={{ textAlign: "center", marginTop: 32 }}>
        <Link className="btn lg" href="/biblioteca">
          VOLVER A LA BIBLIOTECA
        </Link>
      </div>
    </div>
  );
}
