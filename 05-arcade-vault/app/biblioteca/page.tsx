import { GAMES } from "@/lib/games";
import { topScores } from "@/lib/scores";
import { Library, type Marca } from "./library";
export default async function BibliotecaPage() {
  // Récord real por juego (top 1 de `scores`). Un error de BD o un juego sin
  // puntuaciones da `[]` y la tarjeta pinta "SIN RÉCORD" en vez de un número inventado.
  const tops = await Promise.all(GAMES.map((g) => topScores(g.id, 1)));
  const records: Record<string, Marca> = Object.fromEntries(
    GAMES.map((g, i) => {
      const r = tops[i][0];
      return [g.id, r ? { player: r.name, score: r.score } : null];
    }),
  );
  return <Library records={records} />;
}
