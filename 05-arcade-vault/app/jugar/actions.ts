"use server";
import { revalidatePath } from "next/cache";
import { normalizarIniciales } from "@/lib/iniciales";
import { createClient } from "@/lib/supabase/server";
/** Tope de la columna `score` en la base: el mismo CHECK, aquí para explicarlo. */
const MAX_SCORE = 1_000_000;
export type GuardarScoreResult = { ok: true } | { ok: false; error: string };
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
  const player = normalizarIniciales(name);
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
