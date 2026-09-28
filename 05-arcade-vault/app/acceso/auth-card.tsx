"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import type { Proveedor } from "@/app/auth/proveedor";
import { ERROR_PASSWORD, esPasswordFuerte } from "@/lib/password";
import { AuthHeader } from "./auth-header";
import { entrarCon, iniciarSesion, registrar, type AuthResult } from "./actions";
type Tab = "in" | "up";
type Campos = { username: string; email: string; password: string };
/**
 * Tarjeta de `/acceso` (SPEC 14): entrar con email + contraseña o crear cuenta.
 *
 * Los campos son controlados y compartidos entre pestañas: React 19 vacía los
 * formularios no controlados tras cada acción, y un error no debe borrar lo
 * escrito. Cada pestaña tiene su propio `useActionState`.
 */
export function AuthCard({ errorInicial }: { errorInicial: string | null }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("in");
  const [campos, setCampos] = useState<Campos>({ username: "", email: "", password: "" });
  const [errorUrl, setErrorUrl] = useState(errorInicial);
  // Contraseña que no cumple la regla (SPEC 15): se avisa sin llamar a la acción.
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [entrada, entrar, entrando] = useActionState<AuthResult | null, FormData>(
    iniciarSesion,
    null,
  );
  const [alta, crear, creando] = useActionState<AuthResult | null, FormData>(registrar, null);
  // Si el proveedor responde, `entrarCon` redirige fuera y esto no vuelve.
  const [oauth, conectar, conectando] = useActionState<AuthResult | null, Proveedor>(
    (_prev, proveedor) => entrarCon(proveedor),
    null,
  );
  const set = (campo: keyof Campos) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCampos({ ...campos, [campo]: e.target.value });
  const cambiarTab = (next: Tab) => {
    setTab(next);
    setErrorUrl(null);
    setErrorLocal(null);
  };
  const resultado = tab === "in" ? entrada : alta;
  const error = errorLocal ?? (resultado && !resultado.ok ? resultado.error : errorUrl);
  const enviado = tab === "up" && alta?.ok;
  const pendiente = tab === "in" ? entrando : creando;
  return (
    <div className="auth-card">
      <AuthHeader />
      <div className="auth-tabs">
        <button
          type="button"
          className={tab === "in" ? "on" : ""}
          onClick={() => cambiarTab("in")}
          aria-pressed={tab === "in"}
        >
          INICIAR SESIÓN
        </button>
        <button
          type="button"
          className={tab === "up" ? "on" : ""}
          onClick={() => cambiarTab("up")}
          aria-pressed={tab === "up"}
        >
          CREAR CUENTA
        </button>
      </div>
      {enviado ? (
        <div className="auth-sent slide-in" role="status">
          <div className="auth-sent-env" aria-hidden />
          <p className="auth-sent-title pixel">{alta.aviso}</p>
          <p className="auth-sent-copy">Te enviamos un enlace de confirmación a</p>
          <p className="auth-sent-mail">{campos.email}</p>
          <p className="auth-sent-copy">
            Ábrelo para activar la cuenta de <strong>{campos.username.toUpperCase()}</strong>. Hasta
            entonces no podrás entrar.
          </p>
          <p className="auth-sent-wait pixel">
            ESPERANDO CONFIRMACIÓN<span className="blink">_</span>
          </p>
          <button
            type="button"
            className="btn ghost"
            style={{ width: "100%" }}
            onClick={() => cambiarTab("in")}
          >
            YA LO CONFIRMÉ · ENTRAR
          </button>
        </div>
      ) : (
        <form
          key={tab}
          className={error ? "auth-form shake" : "auth-form"}
          action={(fd) => {
            setErrorUrl(null);
            if (tab === "up" && !esPasswordFuerte(campos.password)) {
              setErrorLocal(ERROR_PASSWORD);
              return;
            }
            setErrorLocal(null);
            return tab === "in" ? entrar(fd) : crear(fd);
          }}
        >
          {tab === "up" && (
            <div className="field slide-in">
              <label htmlFor="av-usuario">Usuario</label>
              <input
                id="av-usuario"
                name="username"
                value={campos.username}
                onChange={set("username")}
                placeholder="px_kai"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={16}
                required
                aria-describedby="av-usuario-ayuda"
              />
              <p className="field-hint" id="av-usuario-ayuda">
                3 a 16 caracteres: letras, números o _
              </p>
            </div>
          )}
          <div className="field">
            <label htmlFor="av-email">Correo electrónico</label>
            <input
              id="av-email"
              name="email"
              type="email"
              value={campos.email}
              onChange={set("email")}
              placeholder="jugador@vault.gg"
              autoComplete="email"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="av-pass">Contraseña</label>
            <input
              id="av-pass"
              name="password"
              type="password"
              value={campos.password}
              onChange={set("password")}
              placeholder="••••••••"
              autoComplete={tab === "in" ? "current-password" : "new-password"}
              required
              aria-describedby={tab === "up" ? "av-pass-ayuda" : undefined}
            />
            {tab === "up" ? (
              <p className="field-hint" id="av-pass-ayuda">
                Mínimo 8 caracteres, con mayúscula, minúscula, número y símbolo
              </p>
            ) : (
              <Link className="auth-forgot" href="/acceso/recuperar">
                ¿OLVIDASTE LA CONTRASEÑA?
              </Link>
            )}
          </div>
          {error && (
            <p className="form-error pixel" role="alert">
              ▸ {error}
            </p>
          )}
          <button
            className="btn lg press"
            type="submit"
            disabled={pendiente}
            style={{ width: "100%", marginTop: 8 }}
          >
            {pendiente ? "▸ CONECTANDO…" : tab === "in" ? "ENTRAR AL VAULT" : "CREAR CUENTA"}
          </button>
        </form>
      )}
      <button
        type="button"
        className="btn ghost"
        style={{ width: "100%", marginTop: 10 }}
        onClick={() => router.push("/biblioteca")}
      >
        JUGAR COMO INVITADO
      </button>
      <div className="auth-divider">O CONTINÚA CON</div>
      <form className="social">
        <button className="btn ghost" formAction={() => conectar("google")} disabled={conectando}>
          ◆ GOOGLE
        </button>
        <button className="btn ghost" formAction={() => conectar("github")} disabled={conectando}>
          ▣ GITHUB
        </button>
      </form>
      {oauth && !oauth.ok && (
        <p className="form-error pixel" role="alert" style={{ marginTop: 12 }}>
          ▸ {oauth.error}
        </p>
      )}
      <div
        style={{
          marginTop: 18,
          textAlign: "center",
          fontSize: 11,
          color: "var(--ink-faint)",
          letterSpacing: "0.1em",
        }}
      >
        AL ENTRAR ACEPTAS LOS TÉRMINOS DEL SALÓN ARCADE
      </div>
    </div>
  );
}
