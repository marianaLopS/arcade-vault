import { notFound } from "next/navigation";
import { GamePlayer } from "@/components/game-player";
import { getGame } from "@/lib/games";

export default async function PlayPage({ params }: PageProps<"/jugar/[id]">) {
  const { id } = await params;
  const game = getGame(id);
  if (!game) notFound();

  return <GamePlayer game={game} />;
}
