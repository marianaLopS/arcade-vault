// Variables de entorno de Supabase.
//
// Los nombres se escriben literales en `process.env.<NOMBRE>` a propósito: Next
// sustituye esa expresión en tiempo de compilación y un acceso dinámico
// (`process.env[nombre]`) no se sustituiría, así que la clave llegaría
// `undefined` al navegador.
//
// A diferencia de `RESEND_API_KEY` —que degrada porque el correo es opcional—
// aquí se lanza: una app sin backend de datos no tiene modo reducido.
function requerida(valor: string | undefined, nombre: string): string {
  if (!valor) throw new Error(`FALTA ${nombre} EN .env.local`);
  return valor;
}
export const SUPABASE_URL = requerida(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  "NEXT_PUBLIC_SUPABASE_URL",
);
export const SUPABASE_PUBLISHABLE_KEY = requerida(
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
);
