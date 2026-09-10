# SPEC 03 — Envío real del formulario de contacto

> **Estado:** Implementado
> **Depende de:** SPEC 02
> **Fecha:** 2026-09-08
> **Objetivo:** Que el formulario de `/acerca` envíe un correo de verdad al equipo mediante Resend, conservando intacta la estética arcade (animación `shake`, terminal `VAULT-OS`).

---

## Por qué existe esta spec

SPEC 02 dejó el formulario de contacto como maqueta declarada: "no hay backend ni servicio de
correo; el botón sólo pinta la terminal de éxito". Esta spec cierra ese hueco.

## Alcance

- Server Action `sendContact` en `app/acerca/actions.ts` que valida con **zod** y envía con
  **Resend**.
- Extracción del `<form>` a `components/contact-form.tsx` (Client Component) para poder
  reiniciar el estado de `useActionState` remontando el componente.
- Errores de validación por campo y error global, con estilos `.field-error` / `.form-error`
  en `app/globals.css`.
- Estado de envío (`pending`): botón deshabilitado con texto `▸ TRANSMITIENDO…`.

**Fuera de alcance:**

- Correo de acuse de recibo al visitante. Requiere un dominio verificado en Resend.
- Rate limiting / antispam. El Server Action es un endpoint público; para producción
  convendría un límite por IP.
- Persistencia de los mensajes. Solo se envían por correo, no se guardan.

## Configuración

| Variable | Dónde | Para qué |
| --- | --- | --- |
| `RESEND_API_KEY` | `.env.local` (ignorado por git) | Clave de https://resend.com/api-keys |

Destinatario y remitente son constantes en `app/acerca/actions.ts`:

- `TO = "nanalosan@gmail.com"`
- `FROM = "Arcade Vault <onboarding@resend.dev>"`

`onboarding@resend.dev` es el remitente de pruebas de Resend: no exige verificar un dominio,
pero **solo entrega al correo con el que está registrada la cuenta de Resend** —
`nanalosan@gmail.com`. Cualquier otro destinatario devuelve un 403 `validation_error`. Para
enviar a otras direcciones hay que verificar un dominio propio en resend.com/domains y cambiar
`FROM` (y entonces `TO` puede ser el que se quiera).

## Validación (servidor)

| Campo | Regla |
| --- | --- |
| `name` | 2–80 caracteres (tras `trim`) |
| `email` | formato de correo, máx. 160 |
| `msg` | 10–2000 caracteres (tras `trim`) |

Los mensajes de error van en español y en mayúsculas, en el tono del sitio. El contenido del
usuario se escapa antes de interpolarlo en el `html` del correo. `replyTo` apunta al correo del
visitante para poder responder directamente.

## Decisiones

- **Sí:** Server Action en lugar de Route Handler. Progressive enhancement con `<form action>`
  y `useActionState`, sin `fetch` a mano ni endpoint público extra.
- **Sí:** `key={state.attempt}` en el `<form>` para reiniciar la animación `shake` en cada
  intento fallido, en vez de un `useState` + `setTimeout` dentro de un efecto (que ESLint
  rechaza con `react-hooks/set-state-in-effect`).
- **Sí:** el `Formulario` interno se remonta con una `key` desde `ContactForm` para que
  "ENVIAR OTRO MENSAJE" limpie también el estado de la acción.
- **No:** librería de toasts. El proyecto no tiene ninguna; los errores se pintan en la propia
  tarjeta.

## Verificación

1. `npm run lint` y `npm run build` limpios.
2. `/acerca`: enviar vacío → errores por campo + `shake`; correo inválido → error solo ahí.
3. Envío válido con `RESEND_API_KEY` puesta → terminal `VAULT-OS` y correo recibido, con
   **Responder** apuntando al correo del formulario.
4. `RESEND_API_KEY` vacía → "EL SERVIDOR DE CORREO NO ESTÁ CONFIGURADO", no una pantalla de
   error de Next.
