import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthHeader } from "../auth-header";
import { NuevaClaveForm } from "./form";
export const metadata = { title: "Nueva contraseña · Arcade Vault" };
/**
 * Destino del enlace de recuperación (`/auth/confirm?type=recovery`), que ya
 * dejó la sesión en cookies. Sin sesión no hay a quién cambiarle la contraseña.
 */
export default async function NuevaClave() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/acceso");
  return (
    <div className="av-auth-wrap fade-in">
      <div className="auth-card">
        <AuthHeader sub="NUEVA CONTRASEÑA" />
        <NuevaClaveForm />
      </div>
    </div>
  );
}
