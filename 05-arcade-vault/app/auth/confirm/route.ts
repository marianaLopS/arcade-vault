import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { COOKIE_RECUPERACION, OPCIONES_RECUPERACION } from "../recuperacion";
/** Adónde lleva cada tipo de enlace de correo una vez verificado. */
const DESTINO = { email: "/biblioteca", recovery: "/acceso/nueva-clave" } as const;
/**
 * Verifica los enlaces de los correos de Supabase (SPEC 14).
 *
 * Las plantillas "Confirm signup" y "Reset password" apuntan aquí con
 * `?token_hash=…&type=email|recovery`. Verificar el `token_hash` en el servidor
 * deja la sesión escrita en cookies; el enlace por defecto de Supabase usa el
 * fragmento `#`, que el servidor no llega a ver.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  if (tokenHash && (type === "email" || type === "recovery")) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      const respuesta = NextResponse.redirect(new URL(DESTINO[type], request.url));
      // Sólo esta sesión, recién abierta por el correo, puede cambiar la contraseña.
      if (type === "recovery" && data.user) {
        respuesta.cookies.set(COOKIE_RECUPERACION, data.user.id, OPCIONES_RECUPERACION);
      }
      return respuesta;
    }
    console.error("[auth/confirm]", type, error.code ?? error.message);
  }
  return NextResponse.redirect(new URL("/acceso?error=enlace", request.url));
}
