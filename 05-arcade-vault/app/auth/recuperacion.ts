import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
/**
 * Marca de "sesión abierta por el correo de recuperación". La pone
 * `/auth/confirm` al verificar un enlace `type=recovery`, con el id del
 * usuario como valor; sin ella `/acceso/nueva-clave` no acepta una sesión
 * normal para cambiar la contraseña.
 */
export const COOKIE_RECUPERACION = "av_recovery";
/** Plazo para elegir la contraseña nueva tras abrir el enlace, en segundos. */
const PLAZO = 15 * 60;
export const OPCIONES_RECUPERACION = {
  httpOnly: true,
  sameSite: "lax",
  // En `http://localhost` el navegador descartaría una cookie `Secure`.
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: PLAZO,
} as const;
/**
 * `amr` del JWT (firmado por Supabase, no falsificable desde el navegador):
 * ¿la sesión se abrió con un enlace de recuperación hace menos de `PLAZO`?
 * Sólo cuentan entradas `AMREntry` con `timestamp` en segundos (SPEC 16): el
 * formato `string[]` (RFC 8176) no trae fecha, y aceptarlo dejaría el plazo en
 * manos de la cookie, que se puede fabricar con el id del usuario.
 */
function amrDeRecuperacion(amr: unknown): boolean {
  if (!Array.isArray(amr)) return false;
  const ahora = Date.now() / 1000;
  return amr.some((entrada: unknown) => {
    if (typeof entrada !== "object" || entrada === null) return false;
    const { method, timestamp } = entrada as { method?: unknown; timestamp?: unknown };
    return method === "recovery" && typeof timestamp === "number" && ahora - timestamp < PLAZO;
  });
}
/**
 * Devuelve el id del usuario si la sesión actual viene del enlace de
 * recuperación, o `null`. Dos comprobaciones: la cookie `av_recovery` del mismo
 * usuario (la cookie sola se puede crear a mano) y el `amr` firmado del JWT.
 */
export async function usuarioEnRecuperacion(): Promise<string | null> {
  const marca = (await cookies()).get(COOKIE_RECUPERACION)?.value;
  if (!marca) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub || sub !== marca) return null;
  if (!amrDeRecuperacion(data.claims.amr)) {
    console.error("[recuperacion] amr sin recovery reciente", JSON.stringify(data.claims.amr));
    return null;
  }
  return sub;
}
