// URL pública del sitio (SPEC 16), para los `redirectTo` de Supabase Auth.
//
// Sólo la lee el servidor: sin prefijo `NEXT_PUBLIC_` no viaja al bundle. Es
// fija a propósito, en vez de salir de las cabeceras `Origin` o
// `x-forwarded-host`, que dependen del proxy que haya delante de la app.
//
// En desarrollo cae a localhost para no obligar a tocar `.env.local`; en
// producción lanza, como `lib/supabase/env.ts`: mejor no arrancar que
// redirigir a un origen equivocado.
function siteUrl(valor: string | undefined): string {
  if (valor) return valor.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "development") return "http://localhost:3000";
  throw new Error("FALTA SITE_URL EN .env.local");
}
export const SITE_URL = siteUrl(process.env.SITE_URL);
