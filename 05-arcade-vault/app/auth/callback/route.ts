import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
/**
 * Vuelta de Google y GitHub (flujo PKCE, SPEC 14).
 *
 * El proveedor redirige aquí con `?code=…`; se canjea por una sesión, que el
 * cliente de servidor escribe en cookies. El verificador PKCE lo dejó en una
 * cookie la acción `entrarCon` al iniciar el flujo.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/biblioteca", request.url));
    console.error("[auth/callback]", error.code ?? error.message);
  }
  return NextResponse.redirect(new URL("/acceso?error=oauth", request.url));
}
