"use client";
import type { ScoreRow } from "@/lib/games";
import { useSession } from "@/lib/session";
/**
 * Marca falsa del visitante, sólo para los juegos de maqueta: se calcula a
 * partir del nombre de la sesión, no de ninguna puntuación guardada. Los juegos
 * con marcador real no la pintan, porque las puntuaciones son anónimas y no hay
 * forma honesta de saber cuál es la tuya hasta que exista el login.
 */
export function HallYouRow({
  gameId,
  gameTitle,
  rows,
}: {
  gameId: string;
  gameTitle: string;
  rows: ScoreRow[];
}) {
  const { user } = useSession();
  if (!user) return null;
  const rank = 8 + (gameId.length % 4);
  const score = (rows[5]?.score ?? 12399) - 2400;
  return (
    <>
      <div className="tr you-label">▸ TU MEJOR MARCA EN {gameTitle}</div>
      <div className="tr you" style={{ animationDelay: `${rows.length * 50 + 50}ms` }}>
        <div className="rk" style={{ color: "var(--yellow)" }}>
          #{String(rank).padStart(2, "0")}
        </div>
        <div className="pl" style={{ color: "var(--yellow)" }}>
          {user.name}
        </div>
        <div
          className="sc"
          style={{ color: "var(--yellow)", textShadow: "0 0 6px rgba(245,255,0,0.5)" }}
        >
          {score.toLocaleString("es-ES")}
        </div>
        <div className="dt">11/05/2026</div>
      </div>
    </>
  );
}
