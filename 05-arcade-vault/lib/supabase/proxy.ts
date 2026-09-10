import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";
import type { Database } from "./database.types";
/**
 * Refresca el token de sesión en cada petición y reescribe las cookies.
 *
 * Dos cosas que no se pueden cambiar sin romper la sesión:
 *
 * 1. Se devuelve el MISMO objeto `supabaseResponse`. Sustituirlo por un
 *    `NextResponse` nuevo descartaría las cookies recién escritas y cerraría
 *    sesiones al azar.
 * 2. Se llama a `getClaims()`, no a `getSession()`. `getClaims()` valida la
 *    firma del JWT contra las claves públicas del proyecto; la cookie que lee
 *    `getSession()` se puede falsificar y no garantiza revalidar el token.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });
  await supabase.auth.getClaims();
  return supabaseResponse;
}
