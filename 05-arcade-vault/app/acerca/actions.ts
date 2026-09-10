"use server";

import { Resend } from "resend";
import { z } from "zod";

// Cuenta de Resend: en modo de pruebas solo se puede entregar a esta dirección.
const TO = "nanalosan@gmail.com";
const FROM = "Arcade Vault <onboarding@resend.dev>";

type Campo = "name" | "email" | "msg";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "EL NOMBRE NECESITA AL MENOS 2 CARACTERES")
    .max(80, "EL NOMBRE ES DEMASIADO LARGO"),
  email: z
    .email("ESE CORREO NO TIENE BUENA PINTA")
    .max(160, "EL CORREO ES DEMASIADO LARGO"),
  msg: z
    .string()
    .trim()
    .min(10, "CUÉNTANOS UN POCO MÁS (MÍNIMO 10 CARACTERES)")
    .max(2000, "EL MENSAJE SUPERA LOS 2000 CARACTERES"),
});

export type ContactState = {
  ok: boolean;
  /** Contador de intentos: permite reiniciar la animación de error en el cliente. */
  attempt: number;
  name?: string;
  errors?: Partial<Record<Campo, string>>;
  formError?: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendContact(
  prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const attempt = prev.attempt + 1;
  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    msg: formData.get("msg"),
  });

  if (!parsed.success) {
    const errors: Partial<Record<Campo, string>> = {};
    for (const issue of parsed.error.issues) {
      const campo = issue.path[0] as Campo | undefined;
      if (campo && !errors[campo]) errors[campo] = issue.message;
    }
    return { ok: false, attempt, errors };
  }

  const { name, email, msg } = parsed.data;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      attempt,
      formError:
        "EL SERVIDOR DE CORREO NO ESTÁ CONFIGURADO. INTÉNTALO MÁS TARDE.",
    };
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM,
      to: TO,
      replyTo: email,
      subject: `[Arcade Vault] Mensaje de ${name}`,
      text: `Nombre: ${name}\nCorreo: ${email}\n\n${msg}`,
      html: `
        <h2>Nuevo mensaje desde Arcade Vault</h2>
        <p><strong>Nombre:</strong> ${escapeHtml(name)}</p>
        <p><strong>Correo:</strong> ${escapeHtml(email)}</p>
        <hr />
        <p style="white-space:pre-wrap">${escapeHtml(msg)}</p>
      `,
    });

    if (error) {
      console.error("Resend error:", error.name, "—", error.message);
      return {
        ok: false,
        attempt,
        formError:
          "NO PUDIMOS ENVIAR EL MENSAJE. INTÉNTALO DE NUEVO EN UN MOMENTO.",
      };
    }
  } catch (err) {
    console.error("Resend request failed:", err);
    return {
      ok: false,
      attempt,
      formError:
        "FALLO DE CONEXIÓN CON EL SERVIDOR DE CORREO. INTÉNTALO DE NUEVO.",
    };
  }

  return { ok: true, attempt, name };
}
