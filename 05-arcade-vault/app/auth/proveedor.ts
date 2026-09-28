/** Proveedores OAuth de SPEC 14. */
export type Proveedor = "google" | "github";
/**
 * Cookie con el proveedor en curso: la pone `entrarCon` y la lee
 * `/auth/callback` para nombrarlo en el error. Vive aquí y no en
 * `app/acceso/actions.ts` porque un archivo `"use server"` sólo puede exportar
 * funciones asíncronas.
 */
export const COOKIE_PROVEEDOR = "av_oauth";
export function esProveedor(valor: unknown): valor is Proveedor {
  return valor === "google" || valor === "github";
}
