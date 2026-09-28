import { redirect } from "next/navigation";
import { usuarioEnRecuperacion } from "@/app/auth/recuperacion";
import { AuthHeader } from "../auth-header";
import { NuevaClaveForm } from "./form";
export const metadata = { title: "Nueva contraseña · Arcade Vault" };
/**
 * Destino del enlace de recuperación (`/auth/confirm?type=recovery`), que ya
 * dejó la sesión y la cookie `av_recovery` escritas. Una sesión normal, sin
 * pasar por el correo, no puede cambiar aquí la contraseña.
 */
export default async function NuevaClave() {
  if (!(await usuarioEnRecuperacion())) redirect("/acceso");
  return (
    <div className="av-auth-wrap fade-in">
      <div className="auth-card">
        <AuthHeader sub="NUEVA CONTRASEÑA" />
        <NuevaClaveForm />
      </div>
    </div>
  );
}
