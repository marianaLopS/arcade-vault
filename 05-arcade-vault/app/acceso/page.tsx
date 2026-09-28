import { esProveedor } from "@/app/auth/proveedor";
import { AuthCard } from "./auth-card";
export const metadata = { title: "Acceso · Arcade Vault" };
/** Errores que llegan en la URL desde `/auth/confirm` y `/auth/callback`. */
function errorDeUrl(error: string | undefined, proveedor: string | undefined): string | null {
  if (error === "enlace") return "EL ENLACE HA CADUCADO";
  if (error === "oauth") {
    const nombre = esProveedor(proveedor) ? proveedor : "EL PROVEEDOR";
    return `NO SE PUDO CONECTAR CON ${nombre.toUpperCase()}`;
  }
  return null;
}
export default async function Acceso({ searchParams }: PageProps<"/acceso">) {
  const { error, proveedor } = await searchParams;
  const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  return (
    <div className="av-auth-wrap fade-in">
      <AuthCard errorInicial={errorDeUrl(texto(error), texto(proveedor))} />
    </div>
  );
}
