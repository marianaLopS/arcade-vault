import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";
import type { Database } from "./database.types";
/**
 * Cliente de Supabase para Client Components.
 *
 * `createBrowserClient` ya devuelve la misma instancia en llamadas sucesivas,
 * así que se puede invocar dentro de un componente sin memoizar.
 */
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}
