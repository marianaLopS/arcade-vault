import Link from "next/link";
import { notFound } from "next/navigation";
import { getGame, seededScores } from "@/lib/games";
import { Leaderboard } from "@/components/leaderboard";
import { gameStats, hasLeaderboard, topScores } from "@/lib/scores";

export default async function GameDetail({ params }: PageProps<"/juegos/[id]">) {
  const { id } = await params;
  const game = getGame(id);
  if (!game) notFound();

  // Sólo los juegos con fila en `games` tienen datos reales. Los de maqueta
  // siguen con `seededScores()` y con el `best`/`plays` inventado de la ficha.
  const conMarcador = await hasLeaderboard(game.id);
  const scores = conMarcador ? await topScores(game.id, 10) : seededScores(id.length * 17 + 3, 10);
  const stats = conMarcador ? await gameStats(game.id) : null;
  const partidas = stats ? stats.plays.toLocaleString("es-ES") : game.plays;
  const mejor = stats
    ? (stats.best?.toLocaleString("es-ES") ?? "—")
    : game.best.toLocaleString("es-ES");

  return (
    <div className="av-detail fade-in">
      <div>
        <div className="detail-cover">
          <div className={"cover-bg " + game.cover} />
        </div>
        <div style={{ marginTop: 20 }} className="detail-info">
          <div className="detail-tags">
            <span>{game.cat}</span>
            <span>1 JUGADOR</span>
            <span>TECLADO / TÁCTIL</span>
            <span>RETRO 1985</span>
          </div>
          <h2 className="neon-cyan">{game.title}</h2>
          <p>{game.long}</p>
          <div className="stat-strip">
            <div>
              <div className="l">Partidas</div>
              <div className="v">{partidas}</div>
            </div>
            <div>
              <div className="l">Mejor global</div>
              <div
                className="v"
                style={{ color: "var(--magenta)", textShadow: "0 0 6px rgba(255,0,110,0.5)" }}
              >
                {mejor}
              </div>
            </div>
            <div>
              <div className="l">Dificultad</div>
              <div
                className="v"
                style={{ color: "var(--yellow)", textShadow: "0 0 6px rgba(245,255,0,0.5)" }}
              >
                ★ ★ ★ ☆ ☆
              </div>
            </div>
          </div>
          <div className="detail-actions">
            <Link className="btn xl pulse" href={`/jugar/${game.id}`}>
              ▶ JUGAR AHORA
            </Link>
            <Link className="btn ghost lg" href="/biblioteca">
              VOLVER AL VAULT
            </Link>
          </div>
        </div>
      </div>

      <aside>
        <Leaderboard scores={scores} />
      </aside>
    </div>
  );
}
