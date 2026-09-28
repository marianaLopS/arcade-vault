"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { pedirRecuperacion, type AuthResult } from "../actions";
/** Pide el email y, tras enviarlo, muestra siempre el mismo aviso. */
export function RecuperarForm() {
  const [email, setEmail] = useState("");
  const [estado, pedir, pidiendo] = useActionState<AuthResult | null, FormData>(
    pedirRecuperacion,
    null,
  );
  if (estado?.ok) {
    return (
      <div className="auth-sent slide-in" role="status">
        <div className="auth-sent-env" aria-hidden />
        <p className="auth-sent-title pixel">REVISA TU CORREO</p>
        <p className="auth-sent-copy">{estado.aviso}</p>
        <p className="auth-sent-mail">{email}</p>
        <p className="auth-sent-copy">
          El enlace te llevará a elegir una contraseña nueva. Si no llega, mira en spam.
        </p>
        <Link className="btn ghost" href="/acceso" style={{ width: "100%", marginTop: 12 }}>
          VOLVER A INICIAR SESIÓN
        </Link>
      </div>
    );
  }
  const error = estado && !estado.ok ? estado.error : null;
  return (
    <form action={pedir} className={error ? "auth-form shake" : "auth-form"}>
      <p className="auth-sent-copy" style={{ marginBottom: 16 }}>
        Escribe el correo de tu cuenta y te enviaremos un enlace para elegir una contraseña nueva.
      </p>
      <div className="field">
        <label htmlFor="av-email">Correo electrónico</label>
        <input
          id="av-email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jugador@vault.gg"
          autoComplete="email"
          required
        />
      </div>
      {error && (
        <p className="form-error pixel" role="alert">
          ▸ {error}
        </p>
      )}
      <button
        className="btn lg press"
        type="submit"
        disabled={pidiendo}
        style={{ width: "100%", marginTop: 8 }}
      >
        {pidiendo ? "▸ ENVIANDO…" : "ENVIAR ENLACE"}
      </button>
      <Link className="btn ghost" href="/acceso" style={{ width: "100%", marginTop: 10 }}>
        VOLVER
      </Link>
    </form>
  );
}
