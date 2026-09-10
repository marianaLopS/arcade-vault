import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";
import type { Database } from "./database.types";
/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 *
 * Es asíncrono porque en Next 16 `cookies()` lo es. Hay que llamarlo dentro de
 * cada petición, nunca guardar el resultado en una variable de módulo: cada
 * petición trae sus propias cookies.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Desde un Server Component no se pueden escribir cookies. Se puede
          // ignorar: el refresco de la sesión lo hace `proxy.ts`.
        }
      },
    },
  });
}
