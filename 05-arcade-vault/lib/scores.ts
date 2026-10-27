import { createClient } from "@/lib/supabase/server";
/** Una fila del leaderboard, ya lista para pintar. */
export type LeaderboardRow = {
  rank: number;
  name: string;
  score: number;
  /** Fecha formateada dd/mm/aaaa, como la que devolvía `seededScores()`. */
  date: string;
};
export type GameStats = {
  /** `null` cuando el juego todavía no tiene ninguna puntuación. */
  best: number | null;
  plays: number;
};
// ── Reglas de esta capa ──
// Todas las funciones devuelven el caso vacío ante un error y lo registran en
// consola: un fallo de red del leaderboard no puede tumbar la ficha de un juego
// ni el Salón de la Fama. La pantalla se degrada, no se cae.
function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}
/**
 * ¿Este juego existe en la tabla `games`? Sólo los juegos con motor real están
 * ahí; los demás siguen siendo maqueta y se pintan con `seededScores()`.
 */
export async function hasLeaderboard(gameId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("games").select("id").eq("id", gameId).maybeSingle();
  if (error) {
    console.error("[scores] hasLeaderboard", gameId, error.message);
    return false;
  }
  return data !== null;
}
/** Top del juego, de mayor a menor. Empate: gana la puntuación más antigua. */
export async function topScores(gameId: string, limit = 12): Promise<LeaderboardRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scores")
    .select("player, score, created_at")
    .eq("game_id", gameId)
    .order("score", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[scores] topScores", gameId, error.message);
    return [];
  }
  return (data ?? []).map((row, i) => ({
    rank: i + 1,
    name: row.player,
    score: row.score,
    date: formatDate(row.created_at),
  }));
}
/**
 * `best` y `plays` reales, desde la vista `game_stats`. Un juego sin ninguna
 * puntuación no aparece en la vista: eso se lee como `{ best: null, plays: 0 }`.
 */
export async function gameStats(gameId: string): Promise<GameStats> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("game_stats")
    .select("best, plays")
    .eq("game_id", gameId)
    .maybeSingle();
  if (error) {
    console.error("[scores] gameStats", gameId, error.message);
    return { best: null, plays: 0 };
  }
  return { best: data?.best ?? null, plays: data?.plays ?? 0 };
}
export type RecentScore = {
  player: string;
  score: number;
  gameId: string;
  /** ISO de `created_at`, sin formatear: la home lo pinta como "hace X". */
  createdAt: string;
};
/** Últimas puntuaciones de cualquier juego, de la más reciente a la más antigua. */
export async function recentScores(limit = 7): Promise<RecentScore[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scores")
    .select("player, score, game_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[scores] recentScores", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    player: row.player,
    score: row.score,
    gameId: row.game_id,
    createdAt: row.created_at,
  }));
}
/** Partidas guardadas en total, de todos los juegos. */
export async function totalPlays(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("scores")
    .select("*", { count: "exact", head: true });
  if (error) {
    console.error("[scores] totalPlays", error.message);
    return 0;
  }
  return count ?? 0;
}
