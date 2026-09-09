"use client";

import { useActionState, useState } from "react";
import { sendContact, type ContactState } from "@/app/acerca/actions";

const ESTADO_INICIAL: ContactState = { ok: false, attempt: 0 };

function Formulario({ onReset }: { onReset: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", msg: "" });
  const [state, formAction, pending] = useActionState(
    sendContact,
    ESTADO_INICIAL,
  );

  const errores = state.errors;
  const hayError = Boolean(state.errors || state.formError);

  return (
    <form
      key={state.attempt}
      className={"contact-form" + (hayError ? " shake" : "")}
      action={formAction}
    >
      {!state.ok ? (
        <>
          <div className="field">
            <label htmlFor="contacto-nombre">NOMBRE</label>
            <input
              id="contacto-nombre"
              name="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="px_kai"
              aria-invalid={errores?.name ? true : undefined}
              aria-describedby={errores?.name ? "error-nombre" : undefined}
            />
            {errores?.name && (
              <p
                className="field-error pixel"
                id="error-nombre"
                aria-live="polite"
              >
                ▸ {errores.name}
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="contacto-correo">CORREO ELECTRÓNICO</label>
            <input
              id="contacto-correo"
              name="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="jugador@vault.gg"
              aria-invalid={errores?.email ? true : undefined}
              aria-describedby={errores?.email ? "error-correo" : undefined}
            />
            {errores?.email && (
              <p
                className="field-error pixel"
                id="error-correo"
                aria-live="polite"
              >
                ▸ {errores.email}
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="contacto-mensaje">MENSAJE</label>
            <textarea
              id="contacto-mensaje"
              name="msg"
              rows={5}
              value={form.msg}
              onChange={(e) => setForm({ ...form, msg: e.target.value })}
              placeholder="Cuéntanos qué tienes en mente…"
              aria-invalid={errores?.msg ? true : undefined}
              aria-describedby={errores?.msg ? "error-mensaje" : undefined}
            />
            {errores?.msg && (
              <p
                className="field-error pixel"
                id="error-mensaje"
                aria-live="polite"
              >
                ▸ {errores.msg}
              </p>
            )}
          </div>
          {state.formError && (
            <p className="form-error pixel" role="alert">
              ▸ {state.formError}
            </p>
          )}
          <button
            className="btn xl press"
            type="submit"
            disabled={pending}
            style={{ width: "100%" }}
          >
            {pending ? "▸ TRANSMITIENDO…" : "▶ ENVIAR MENSAJE"}
          </button>
        </>
      ) : (
        <div className="terminal-success">
          <div className="term-bar">
            <span className="dot r" />
            <span className="dot y" />
            <span className="dot g" />
            <span className="term-title">VAULT-OS // TERMINAL</span>
          </div>
          <div className="term-body">
            <div className="line">
              <span className="prompt">vault@arcade:~$</span> ./send_message
              --to=team
            </div>
            <div className="line dim">[OK] Conectando con servidor…</div>
            <div className="line dim">[OK] Validando contenido…</div>
            <div className="line dim">[OK] Transmitiendo paquete…</div>
            <div className="line success">
              &gt; MENSAJE RECIBIDO. TE RESPONDEREMOS PRONTO. GRACIAS,{" "}
              {state.name?.toUpperCase()}.<span className="caret">_</span>
            </div>
            <div style={{ marginTop: 18 }}>
              <button className="btn ghost" type="button" onClick={onReset}>
                ENVIAR OTRO MENSAJE
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

/**
 * El estado de `useActionState` vive dentro de `Formulario`; remontarlo con una `key`
 * nueva es lo que devuelve la tarjeta al estado inicial tras "ENVIAR OTRO MENSAJE".
 */
export function ContactForm() {
  const [formKey, setFormKey] = useState(0);
  return <Formulario key={formKey} onReset={() => setFormKey((k) => k + 1)} />;
}
