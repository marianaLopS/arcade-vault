import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_PROVEEDOR, esProveedor } from "@/app/auth/proveedor";
import { createClient } from "@/lib/supabase/server";
/**
 * Vuelta de Google y GitHub (flujo PKCE, SPEC 14).
 *
 * El proveedor redirige aquí con `?code=…`; se canjea por una sesión, que el
 * cliente de servidor escribe en cookies. El verificador PKCE lo dejó en una
 * cookie la acción `entrarCon` al iniciar el flujo, junto con `av_oauth`, que
 * dice qué proveedor era para nombrarlo en el error.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const proveedor = request.cookies.get(COOKIE_PROVEEDOR)?.value;
  let destino = "/biblioteca";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback]", error.code ?? error.message);
      destino = "/acceso?error=oauth";
    }
  } else {
    // Sin `code`: el usuario canceló en el proveedor o éste devolvió `?error=…`.
    destino = "/acceso?error=oauth";
  }
  if (destino !== "/biblioteca" && esProveedor(proveedor)) {
    destino += `&proveedor=${proveedor}`;
  }
  const respuesta = NextResponse.redirect(new URL(destino, request.url));
  respuesta.cookies.delete(COOKIE_PROVEEDOR);
  return respuesta;
}
