import { AuthHeader } from "../auth-header";
import { RecuperarForm } from "./form";
export const metadata = { title: "Recuperar contraseña · Arcade Vault" };
export default function Recuperar() {
  return (
    <div className="av-auth-wrap fade-in">
      <div className="auth-card">
        <AuthHeader sub="RECUPERAR CONTRASEÑA" />
        <RecuperarForm />
      </div>
    </div>
  );
}
