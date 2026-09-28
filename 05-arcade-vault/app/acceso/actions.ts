"use server";
import type { AuthError } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_PROVEEDOR, esProveedor, type Proveedor } from "@/app/auth/proveedor";
import { createClient } from "@/lib/supabase/server";
export type AuthResult = { ok: true; aviso?: string } | { ok: false; error: string };
const USERNAME = /^[a-z0-9_]{3,16}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const ERROR_GENERICO = "ALGO FALLÓ. INTÉNTALO DE NUEVO";

/** Traduce el error de Supabase Auth al mensaje de la tabla de SPEC 14. */
function mensajeDe(error: AuthError): string {
  switch (error.code) {
    case "invalid_credentials":
      return "EMAIL O CONTRASEÑA INCORRECTOS";
    case "email_not_confirmed":
      return "CONFIRMA TU CORREO ANTES DE ENTRAR";
    case "user_already_exists":
    case "email_exists":
      return "ESE CORREO YA TIENE CUENTA";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "DEMASIADOS INTENTOS. ESPERA UNOS MINUTOS";
    default:
      return ERROR_GENERICO;
  }
}
function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}
/**
 * Alta con usuario + email + contraseña. No inicia sesión: la confirmación de
 * correo es obligatoria y el enlace pasa por `/auth/confirm`. El username lo
 * guarda en `profiles` el trigger `handle_new_user` a partir de los metadatos.
 */
export async function registrar(_prev: AuthResult | null, formData: FormData): Promise<AuthResult> {
  const username = texto(formData, "username").toLowerCase();
  const email = texto(formData, "email");
  const password = formData.get("password");
  if (!USERNAME.test(username)) {
    return { ok: false, error: "EL USUARIO: 3 A 16 LETRAS, NÚMEROS O _" };
  }
  if (!EMAIL.test(email)) return { ok: false, error: "ESE CORREO NO TIENE BUENA PINTA" };
  if (typeof password !== "string" || password.length < MIN_PASSWORD) {
    return { ok: false, error: `LA CONTRASEÑA NECESITA AL MENOS ${MIN_PASSWORD} CARACTERES` };
  }
  try {
    const supabase = await createClient();
    // Pre-comprobación para el caso normal: si el username ya existe, el
    // trigger le pondría sufijo en silencio, y aquí el usuario lo eligió él.
    const { data: ocupado, error: errorPerfil } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (errorPerfil) {
      console.error("[registrar] profiles", errorPerfil.message);
      return { ok: false, error: ERROR_GENERICO };
    }
    if (ocupado) return { ok: false, error: "ESE USUARIO YA EXISTE" };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    if (error) {
      console.error("[registrar] signUp", error.code ?? error.message);
      return { ok: false, error: mensajeDe(error) };
    }
    // Con confirmación activa, Supabase no da error para un email ya
    // confirmado: devuelve un usuario sin identidades para no revelarlo.
    if (data.user && data.user.identities?.length === 0) {
      return { ok: false, error: "ESE CORREO YA TIENE CUENTA" };
    }
  } catch (e) {
    console.error("[registrar]", e);
    return { ok: false, error: ERROR_GENERICO };
  }
  return { ok: true, aviso: "REVISA TU CORREO" };
}
/** Entrada con email + contraseña. Si va bien, redirige a la biblioteca. */
export async function iniciarSesion(
  _prev: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const email = texto(formData, "email");
  const password = formData.get("password");
  if (!EMAIL.test(email) || typeof password !== "string" || password.length === 0) {
    return { ok: false, error: "EMAIL O CONTRASEÑA INCORRECTOS" };
  }
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error("[iniciarSesion]", error.code ?? error.message);
      return { ok: false, error: mensajeDe(error) };
    }
  } catch (e) {
    console.error("[iniciarSesion]", e);
    return { ok: false, error: ERROR_GENERICO };
  }
  // `redirect` lanza: fuera del `try` para que no lo capture el `catch`.
  redirect("/biblioteca");
}
/** Cierra la sesión (borra las cookies) y vuelve a la portada. */
export async function cerrarSesion(): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) console.error("[cerrarSesion]", error.code ?? error.message);
  } catch (e) {
    console.error("[cerrarSesion]", e);
  }
  redirect("/");
}
/** Origen de la petición (`http://localhost:3000` en desarrollo), para la vuelta del proveedor. */
async function origen(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
/**
 * Inicia el flujo OAuth (PKCE) con Google o GitHub. El verificador PKCE queda
 * en una cookie y el proveedor vuelve a `/auth/callback`.
 */
export async function entrarCon(proveedor: Proveedor): Promise<AuthResult> {
  if (!esProveedor(proveedor)) return { ok: false, error: ERROR_GENERICO };
  const fallo = `NO SE PUDO CONECTAR CON ${proveedor.toUpperCase()}`;
  let url: string;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: proveedor,
      options: { redirectTo: `${await origen()}/auth/callback`, skipBrowserRedirect: true },
    });
    if (error || !data.url) {
      console.error("[entrarCon]", proveedor, error?.code ?? error?.message);
      return { ok: false, error: fallo };
    }
    // Con el proveedor desactivado Supabase no avisa aquí: la URL existe pero
    // su `/authorize` responde 400 con un JSON. Se comprueba antes de mandar
    // al usuario a esa página en crudo; si está bien configurado, redirige.
    const prueba = await fetch(data.url, { redirect: "manual" });
    if (prueba.status < 300 || prueba.status >= 400) {
      console.error("[entrarCon]", proveedor, "authorize", prueba.status);
      return { ok: false, error: fallo };
    }
    url = data.url;
    (await cookies()).set(COOKIE_PROVEEDOR, proveedor, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
  } catch (e) {
    console.error("[entrarCon]", proveedor, e);
    return { ok: false, error: fallo };
  }
  redirect(url);
}
