"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
/** Tope de la columna `score` en la base: el mismo CHECK, aquí para explicarlo. */
const MAX_SCORE = 1_000_000;
export type GuardarScoreResult = { ok: true } | { ok: false; error: string };
/**
 * Normaliza las iniciales del modal de fin de partida al formato que acepta la
 * base (`^[A-Z]{1,3}$`): mayúsculas, sin acentos ni símbolos, tres letras como
 * mucho. Si no queda nada utilizable, el jugador es `AAA`.
 */
function normalizarNombre(raw: string): string {
  const limpio = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
  return limpio || "AAA";
}
/**
 * Guarda una puntuación. La validación de verdad son los CHECK de la tabla —una
 * petición directa a PostgREST se salta este archivo—; esto existe para
 * devolver un mensaje legible en español en vez de un error de Postgres.
 */
export async function guardarScore(input: {
  game: string;
  score: number;
  name: string;
}): Promise<GuardarScoreResult> {
  const { game, name } = input;
  const score = Math.trunc(input.score);
  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
    return { ok: false, error: "LA PUNTUACIÓN NO ES VÁLIDA" };
  }
  const player = normalizarNombre(name);
  try {
    const supabase = await createClient();
    const { data: juego, error: errorJuego } = await supabase
      .from("games")
      .select("id")
      .eq("id", game)
      .maybeSingle();
    if (errorJuego) {
      console.error("[guardarScore] games", game, errorJuego.message);
      return { ok: false, error: "NO SE PUDO CONECTAR CON EL SALÓN DE LA FAMA" };
    }
    if (!juego) {
      return { ok: false, error: "ESTE JUEGO TODAVÍA NO TIENE MARCADOR" };
    }
    const { error } = await supabase.from("scores").insert({ game_id: game, player, score });
    if (error) {
      console.error("[guardarScore] insert", game, error.message);
      return { ok: false, error: "NO SE PUDO GUARDAR LA PUNTUACIÓN. INTÉNTALO DE NUEVO" };
    }
  } catch (e) {
    console.error("[guardarScore]", e);
    return { ok: false, error: "NO SE PUDO GUARDAR LA PUNTUACIÓN. INTÉNTALO DE NUEVO" };
  }
  revalidatePath("/salon");
  revalidatePath(`/juegos/${game}`);
  return { ok: true };
}
