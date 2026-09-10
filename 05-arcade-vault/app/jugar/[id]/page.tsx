import { notFound } from "next/navigation";
import { GamePlayer } from "@/components/game-player";
import { getGame } from "@/lib/games";
import { hasLeaderboard } from "@/lib/scores";
export default async function PlayPage({ params }: PageProps<"/jugar/[id]">) {
  const { id } = await params;
  const game = getGame(id);
  if (!game) notFound();
  // Sólo los juegos con fila en `games` pueden recibir puntuaciones; los de
  // maqueta enseñan el modal de fin de partida sin guardar nada.
  const conMarcador = await hasLeaderboard(game.id);
  return <GamePlayer game={game} hasLeaderboard={conMarcador} />;
}
