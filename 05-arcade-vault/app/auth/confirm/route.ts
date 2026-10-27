import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { COOKIE_RECUPERACION, OPCIONES_RECUPERACION } from "../recuperacion";
/** Adónde lleva cada tipo de enlace de correo una vez verificado. */
const DESTINO = { email: "/biblioteca", recovery: "/acceso/nueva-clave" } as const;
/**
 * Verifica los enlaces de los correos de Supabase (SPEC 14). Acepta dos formas:
 *
 * - `?token_hash=…&type=email|recovery`: plantilla propia que apunta aquí.
 * - `?code=…&sb_flow_id=…`: plantilla por defecto (`{{ .ConfirmationURL }}`).
 *   Supabase verifica el token y vuelve al `redirectTo` que mandaron `registrar`
 *   y `pedirRecuperacion` con un código PKCE. El verificador está en una cookie
 *   del navegador que pidió el correo: el enlace hay que abrirlo en ese mismo.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  const type = searchParams.get("type");
  const supabase = await createClient();
  let tipo: keyof typeof DESTINO | null = null;
  let userId: string | null = null;
  if (tokenHash && (type === "email" || type === "recovery")) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) console.error("[auth/confirm]", type, error.code ?? error.message);
    else [tipo, userId] = [type, data.user?.id ?? null];
  } else if (code) {
    const flowId = searchParams.get("sb_flow_id") ?? undefined;
    const { data, error } = await supabase.auth.exchangeCodeForSession(code, { flowId });
    if (error) console.error("[auth/confirm] code", error.code ?? error.message);
    else {
      // auth-js devuelve `redirectType` ("recovery" si lo pidió `resetPasswordForEmail`),
      // pero su tipo `AuthTokenResponse` no lo declara.
      const { redirectType } = data as { redirectType?: string | null };
      [tipo, userId] = [redirectType === "recovery" ? "recovery" : "email", data.user.id];
    }
  }
  if (!tipo) return NextResponse.redirect(new URL("/acceso?error=enlace", request.url));
  const respuesta = NextResponse.redirect(new URL(DESTINO[tipo], request.url));
  // Sólo esta sesión, recién abierta por el correo, puede cambiar la contraseña.
  if (tipo === "recovery" && userId) {
    respuesta.cookies.set(COOKIE_RECUPERACION, userId, OPCIONES_RECUPERACION);
  }
  return respuesta;
}
