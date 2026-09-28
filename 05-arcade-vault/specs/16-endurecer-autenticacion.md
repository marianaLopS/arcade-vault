# SPEC 16 — Endurecer la autenticación: reautenticación, registro sin enumeración, cookies y origen OAuth

> **Estado:** aprobado
> **Depende de:** SPEC 14, SPEC 15
> **Fecha:** 2026-09-28
> **Objetivo:** Cerrar los cinco huecos de la revisión de autenticación exigiendo reautenticación para cambiar la contraseña fuera de la recuperación, respondiendo igual en el registro exista o no el email, marcando `secure` las cookies propias en producción, exigiendo `amr` con fecha y sacando el `redirectTo` de OAuth de una URL fija.

## Por qué existe esta spec

Tras SPEC 15 se revisó a mano la parte de autenticación (`proxy.ts`, `lib/supabase/*`,
`app/acceso/*`, `app/auth/*`, `lib/session.tsx`). La base es correcta: `getClaims()` en servidor,
destinos de redirección fijos, PKCE, recuperación sin enumeración y errores de URL por lista
blanca. Quedaron cinco hallazgos:

| #   | Hallazgo                                      | Estado real                                                                                                                                                                                                      | Gravedad |
| --- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | Cambio de contraseña fuera de la recuperación | `cambiarPassword` exige `av_recovery` y `amr`, pero el JWT está en cookies que lee el navegador. Cualquier sesión puede llamar a `supabase.auth.updateUser({ password })` desde la consola y saltarse la acción. | Media    |
| 2   | Enumeración de emails en el registro          | `registrar` (`app/acceso/actions.ts`) responde `ESE CORREO YA TIENE CUENTA` cuando `identities` viene vacío o con `user_already_exists` / `email_exists`. Contradice a `pedirRecuperacion`, que no revela nada.  | Media    |
| 3   | Cookies propias sin `secure`                  | `av_recovery` (`OPCIONES_RECUPERACION` en `app/auth/recuperacion.ts`) y `av_oauth` (`entrarCon`) se emiten sin `Secure`.                                                                                         | Baja     |
| 4   | Origen de OAuth desde cabeceras               | `origen()` en `actions.ts` construye el `redirectTo` con `Origin`, `x-forwarded-host` y `x-forwarded-proto`. Hoy lo frena la lista de Redirect URLs de Supabase.                                                 | Baja     |
| 5   | `amr` sin fecha aceptado                      | `amrDeRecuperacion` acepta la entrada `"recovery"` (string) sin `timestamp`. En ese caso el plazo lo pone sólo la cookie, que se puede fabricar con el id del usuario.                                           | Baja     |

## Alcance

**Dentro:**

- **Secure password change (dashboard, manual, lo hace la usuaria).** Auth > Providers > Email >
  _Secure password change_ activado. Con él, GoTrue pide reautenticación (nonce) para
  `updateUser({ password })` si la sesión no es reciente. La sesión que abre el correo de
  recuperación es nueva, así que `/acceso/nueva-clave` sigue funcionando sin cambios.
- **Registro sin enumeración** en `registrar` (`app/acceso/actions.ts`):
  - Si `data.user.identities` viene vacío, o el error es `user_already_exists` / `email_exists`,
    se devuelve `{ ok: true, aviso: "REVISA TU CORREO" }`, igual que un alta nueva.
  - `mensajeDe` conserva esos casos, pero `registrar` los intercepta antes de llamarlo.
  - Se **mantiene** `ESE USUARIO YA EXISTE`: los usernames son públicos (`profiles` tiene `select`
    público) y ocultarlo no protege nada.
- **Copy de la vista "REVISA TU CORREO"** en `app/acceso/auth-card.tsx`:
  - `Te enviamos un enlace de confirmación a` pasa a `Si el correo es nuevo, te enviamos un enlace de confirmación a`.
  - Nueva línea `¿Ya tenías cuenta?` con enlace `RECUPERA LA CONTRASEÑA` a `/acceso/recuperar`.
- **Cookies `secure` en producción**: `secure: process.env.NODE_ENV === "production"` en
  `OPCIONES_RECUPERACION` (`app/auth/recuperacion.ts`) y en la cookie `av_oauth` de `entrarCon`.
- **`amr` con fecha obligatoria**: en `amrDeRecuperacion` se quita la rama `entrada === "recovery"`.
  Sólo cuentan objetos con `method === "recovery"` y `timestamp` numérico de hace menos de `PLAZO`.
  Se actualiza el comentario de la función.
- **Origen de OAuth fijo**:
  - Nuevo `lib/site.ts` que exporta `SITE_URL`, leído de `process.env.SITE_URL` (server-only, sin
    `NEXT_PUBLIC_`).
  - Sin la variable: en desarrollo cae a `http://localhost:3000`; en producción lanza
    `FALTA SITE_URL EN .env.local`, con el mismo estilo que `requerida` de `lib/supabase/env.ts`.
  - `entrarCon` usa `` `${SITE_URL}/auth/callback` ``. Se borran `origen()` y el import de `headers`.
  - `.env.example` añade `SITE_URL=` con un comentario.
- **Docs**:
  - `CLAUDE.md`: `SITE_URL` en "Variables de entorno"; nueva sección "Seguridad (SPEC 16)" con
    _Secure password change_, registro sin enumeración, cookies `secure` y `SITE_URL`.
  - `References/resources/resources/security/security-status.md`: los cinco hallazgos como cerrados.

**Fuera de alcance:**

- Flujo de reautenticación con nonce en la UI (`supabase.auth.reauthenticate()`). Hoy la contraseña
  sólo se cambia por la recuperación, que no lo necesita.
- CSP y HSTS (siguen pendientes de SPEC 15).
- CAPTCHA en el registro.
- Rate limit propio en las Server Actions.
- Integridad de las puntuaciones (el cliente envía el score).
- Ocultar que un username está ocupado.
- Enviar un correo al dueño de un email ya registrado cuando alguien intenta registrarlo.

## Modelo de datos

Esta spec no introduce tablas, columnas, políticas ni migraciones. No hay que regenerar
`lib/supabase/database.types.ts`.

Sólo aparece una variable de entorno y su módulo:

```ts
// lib/site.ts — URL pública del sitio, para los redirectTo de Supabase Auth.
// SITE_URL=https://arcadevault.example   (en .env.local; en dev es opcional)
export const SITE_URL: string; // sin barra final
```

Opciones de cookie resultantes:

```ts
// app/auth/recuperacion.ts
export const OPCIONES_RECUPERACION = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: PLAZO,
} as const;
```

## Plan de implementación

1. **`SITE_URL`.** Crear `lib/site.ts` y añadir `SITE_URL=` a `.env.example`. Cambiar `entrarCon`
   para usar `SITE_URL` y borrar `origen()` y el import de `headers`. Prueba manual: entrar con
   GitHub en dev vuelve a `/auth/callback`.
2. **Cookies `secure`.** Añadir `secure` a `OPCIONES_RECUPERACION` y a la cookie `av_oauth`.
3. **`amr`.** Quitar la rama de string en `amrDeRecuperacion` y ajustar su comentario.
4. **Registro.** En `registrar`, devolver `{ ok: true, aviso: "REVISA TU CORREO" }` cuando el email
   ya exista. Cambiar el copy de la vista de éxito en `auth-card.tsx` y añadir el enlace a
   `/acceso/recuperar`.
5. **Dashboard (manual, lo hace la usuaria).** Activar _Secure password change_.
6. **Docs.** Actualizar `CLAUDE.md` y `security-status.md`. Ejecutar `npm run lint` y `npm run build`.

## Criterios de aceptación

- [ ] Registrarse con un email ya confirmado muestra la vista `REVISA TU CORREO`, igual que con uno
      nuevo.
- [ ] Ninguna respuesta de `registrar` contiene `ESE CORREO YA TIENE CUENTA`.
- [ ] Registrarse con un username ocupado sigue mostrando `ESE USUARIO YA EXISTE`.
- [ ] La vista de éxito del registro dice `Si el correo es nuevo, te enviamos un enlace de
  confirmación a` y enlaza a `/acceso/recuperar`.
- [ ] `grep -nE "headers\(\)|x-forwarded-host|origen\(" app/acceso/actions.ts` no devuelve nada.
- [ ] En `npm run dev`, sin `SITE_URL`, entrar con Google y con GitHub vuelve a
      `http://localhost:3000/auth/callback` y abre sesión.
- [ ] Sobre el build (`npm start`) sin `SITE_URL`, entrar con Google o GitHub falla y el log del
      servidor muestra `FALTA SITE_URL EN .env.local`. El resto de la app arranca y funciona: Next
      sólo carga el módulo de la acción al invocarla, así que el error no sale al arrancar.
- [ ] En el build de producción, `av_oauth` y `av_recovery` llevan el atributo `Secure`. En
      `npm run dev` no lo llevan.
- [ ] `amrDeRecuperacion(["recovery"])` devuelve `false`.
- [ ] El flujo completo de recuperación (correo → `/auth/confirm?type=recovery` →
      `/acceso/nueva-clave` → guardar) sigue cambiando la contraseña y acaba en `/biblioteca`.
- [ ] _Secure password change_ está activado en el dashboard (lo confirma la usuaria).
- [ ] Con una sesión normal de más de 24 h, `updateUser({ password })` desde la consola del
      navegador falla con `reauthentication_needed`.
- [ ] `CLAUDE.md` documenta `SITE_URL` y la sección "Seguridad (SPEC 16)".
- [ ] `npm run lint` y `npm run build` terminan sin errores.

## Decisiones tomadas y descartadas

| Decisión                                        | Alternativa descartada                        | Por qué                                                                                                             |
| ----------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| _Secure password change_ en el dashboard        | Bloquear `updateUser` en el cliente           | GoTrue es público con la clave publicable. El cliente no se puede cerrar; el control tiene que estar en Supabase.   |
| No añadir flujo de nonce en la UI               | Pantalla de reautenticación                   | Hoy no hay "cambiar contraseña" con sesión normal. La recuperación abre una sesión nueva y no necesita nonce.       |
| Mismo aviso en el registro exista o no el email | Mantener `ESE CORREO YA TIENE CUENTA`         | Coherencia con `pedirRecuperacion`. Evita comprobar qué emails tienen cuenta.                                       |
| Mantener `ESE USUARIO YA EXISTE`                | Ocultarlo y dejar que el trigger ponga sufijo | Los usernames ya son públicos. Ocultarlo empeora la UX sin ganar privacidad.                                        |
| `SITE_URL` server-only                          | `NEXT_PUBLIC_SITE_URL`                        | Sólo la lee una Server Action. No hace falta mandarla al bundle.                                                    |
| `SITE_URL` fija                                 | Seguir leyendo `Origin` / `x-forwarded-host`  | Las cabeceras dependen del proxy delante de la app. Una URL fija no depende de eso.                                 |
| Fallback a `localhost:3000` sólo en desarrollo  | Lanzar siempre                                | Nadie tiene que tocar `.env.local` para trabajar en local. En producción, fallar pronto es mejor que redirigir mal. |
| `secure` según `NODE_ENV`                       | `secure: true` siempre                        | En `http://localhost` el navegador descartaría la cookie y se romperían OAuth y la recuperación.                    |
| Quitar la rama `amr` de string                  | Mantenerla por compatibilidad                 | Supabase emite objetos con `timestamp`. La rama sólo abría la puerta a depender de la cookie.                       |

## Riesgos identificados

| Riesgo                                                                                                                                           | Mitigación                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| _Secure password change_ sólo pide reautenticación si la sesión tiene más de 24 h. Una sesión recién robada todavía puede cambiar la contraseña. | Mitigación parcial, documentada en `CLAUDE.md`. Cerrarlo del todo necesitaría el flujo de nonce, que queda fuera.                                     |
| Quien olvidó que tenía cuenta se registra y no recibe correo.                                                                                    | El nuevo copy dice "Si el correo es nuevo" y enlaza a recuperar la contraseña.                                                                        |
| En producción falta `SITE_URL` o no está en las Redirect URLs de Supabase.                                                                       | Sin la variable, la app no arranca (intencional). Añadir la URL de producción a Redirect URLs forma parte del despliegue (ya anotado en `CLAUDE.md`). |
| Si Supabase vuelve a emitir `amr` como strings, la recuperación deja de funcionar.                                                               | `usuarioEnRecuperacion` ya registra `amr sin recovery reciente` en el log. Se vería en la primera prueba del criterio de recuperación.                |
| La configuración del dashboard no está versionada.                                                                                               | Queda en `CLAUDE.md`, como las de SPEC 15.                                                                                                            |

## Qué **no** entra en esta spec

- Pantalla de reautenticación con nonce.
- CSP y HSTS.
- CAPTCHA.
- Rate limit propio en las Server Actions.
- Integridad o antitrampas de las puntuaciones.
- Ocultar los usernames ocupados.
- Correo de aviso al dueño de un email ya registrado.

Cada una, si llega, va en su propia spec.
