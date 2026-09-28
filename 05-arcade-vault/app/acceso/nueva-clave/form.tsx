"use client";
import { useActionState, useState } from "react";
import { ERROR_PASSWORD, esPasswordFuerte } from "@/lib/password";
import { cambiarPassword, type AuthResult } from "../actions";
/** Contraseña nueva + confirmación. Si va bien, la acción redirige a la biblioteca. */
export function NuevaClaveForm() {
  const [campos, setCampos] = useState({ password: "", confirmacion: "" });
  const [estado, cambiar, cambiando] = useActionState<AuthResult | null, FormData>(
    cambiarPassword,
    null,
  );
  // Contraseña que no cumple la regla (SPEC 15): se avisa sin llamar a la acción.
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const error = errorLocal ?? (estado && !estado.ok ? estado.error : null);
  return (
    <form
      action={(fd) => {
        if (!esPasswordFuerte(campos.password)) {
          setErrorLocal(ERROR_PASSWORD);
          return;
        }
        setErrorLocal(null);
        cambiar(fd);
      }}
      className={error ? "auth-form shake" : "auth-form"}
    >
      <div className="field">
        <label htmlFor="av-pass">Contraseña nueva</label>
        <input
          id="av-pass"
          name="password"
          type="password"
          value={campos.password}
          onChange={(e) => setCampos({ ...campos, password: e.target.value })}
          placeholder="••••••••"
          autoComplete="new-password"
          required
          aria-describedby="av-pass-ayuda"
        />
        <p className="field-hint" id="av-pass-ayuda">
          Mínimo 8 caracteres, con mayúscula, minúscula, número y símbolo
        </p>
      </div>
      <div className="field">
        <label htmlFor="av-pass2">Repite la contraseña</label>
        <input
          id="av-pass2"
          name="confirmacion"
          type="password"
          value={campos.confirmacion}
          onChange={(e) => setCampos({ ...campos, confirmacion: e.target.value })}
          placeholder="••••••••"
          autoComplete="new-password"
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
        disabled={cambiando}
        style={{ width: "100%", marginTop: 8 }}
      >
        {cambiando ? "▸ GUARDANDO…" : "GUARDAR CONTRASEÑA"}
      </button>
    </form>
  );
}
