# SPEC 15 — Seguridad básica: RLS, contraseñas, límites y headers

> **Estado:** Aprobado
> **Depende de:** SPEC 04, SPEC 06, SPEC 14
> **Fecha:** 2026-09-27
> **Objetivo:** Cerrar el checklist de seguridad básico (`References/resources/resources/security/security-checklist.md`) endureciendo RLS de `scores`, exigiendo contraseñas fuertes en Supabase y en la UI, limitando signups por IP, quitando a `anon`/`authenticated` el permiso de ejecutar `rls_auto_enable()` y enviando headers de seguridad desde Next.js.

## Por qué existe esta spec

El advisor de seguridad de Supabase da tres warnings y el checklist deja cinco puntos abiertos.
Estado al escribir la spec:

| Punto del checklist | Estado real |
| --- | --- |
| RLS en `games` y `scores` | Activa. Pero `scores` acepta `insert` con `with check (true)`: cualquiera inserta cualquier cosa. |
| Contraseña mínima 8 | `actions.ts` exige 8 caracteres sin más reglas; el dashboard no está alineado. |
| Leaked password protection | Desactivada. **Sólo existe en plan Pro**: el proyecto es Free. |
| Límite de signups por IP | Default de Supabase (30 / 5 min), sin revisar. |
| Headers en Next.js | Ninguno. |
| Panel de warnings | 2 lints por `public.rls_auto_enable()` (SECURITY DEFINER ejecutable por `anon` y `authenticated`) + leaked password. |

`rls_auto_enable()` no la creó ninguna migración del repo (la generó Supabase). **Corrección
durante la implementación:** sí la usa el event trigger `ensure_rls` (`ddl_command_end` en
`CREATE TABLE`), que activa RLS en cada tabla nueva. El `drop` falló por esa dependencia, así que la
función se mantiene y se le revoca `EXECUTE`.

## Alcance

**Dentro:**

- **Migración** `supabase/migrations/20260927130000_seguridad_basica.sql`, aplicada con
  `apply_migration` del MCP:
  - `revoke execute on function public.rls_auto_enable() from public, anon, authenticated;`
  - `scores.user_id uuid null references auth.users(id) on delete set null` (null = invitado).
  - Sustituir la política de insert de `scores` por una que exige
    `user_id is null or user_id = (select auth.uid())`: nadie puede firmar una puntuación en nombre
    de otro usuario.
  - `games`: sin cambios de políticas. Sigue teniendo sólo `select` público y ninguna política de
    escritura. Se deja comprobado en los criterios.
- **`guardarScore`** (`app/jugar/actions.ts`) rellena `user_id` con el `sub` de la sesión
  (`supabase.auth.getClaims()`), o `null` si no hay sesión. Los invitados siguen guardando igual.
- **Regla de contraseña compartida** en `lib/password.ts` (sin `"use server"`, importable desde
  cliente y servidor):
  - `PASSWORD_FUERTE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/`
  - `ERROR_PASSWORD = "MÍNIMO 8 CARACTERES CON MAYÚSCULA, MINÚSCULA, NÚMERO Y SÍMBOLO"`
  - `esPasswordFuerte(p: string): boolean`
- **Validación en servidor**: `registrar` y `cambiarPassword` (`app/acceso/actions.ts`) usan
  `esPasswordFuerte` en lugar de `MIN_PASSWORD`, que desaparece. `mensajeDe` traduce el código
  `weak_password` de Supabase a `ERROR_PASSWORD`. `iniciarSesion` **no** valida la regla, porque
  las cuentas antiguas pueden tener contraseñas que ya no la cumplen.
- **Validación en UI, al enviar**: en la pestaña de registro de `app/acceso/auth-card.tsx` y en
  `app/acceso/nueva-clave/form.tsx`, si la contraseña no pasa `esPasswordFuerte` no se llama a la
  acción. Se muestra `ERROR_PASSWORD` en el `.form-error` existente, con el `shake` actual. No hay
  lista de requisitos en vivo.
- **Headers de seguridad** en `next.config.ts` con `headers()` para `source: "/(.*)"`:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-DNS-Prefetch-Control: off`
- **Configuración manual en el dashboard de Supabase** (el MCP no tiene acceso a la config de Auth),
  documentada paso a paso en la spec:
  - Auth > Providers > Email: *Minimum password length* = 8; *Password requirements* =
    "Lowercase, uppercase letters, digits and symbols".
  - Auth > Rate Limits: *Sign-ups and sign-ins* = **10 por 5 min por IP**.
- **Leaked password protection**: warning **aceptado y documentado**. No se puede activar en plan
  Free. Queda anotado en `CLAUDE.md` como pendiente al pasar a Pro.
- Regenerar `lib/supabase/database.types.ts` con `generate_typescript_types` del MCP. Actualizar
  `CLAUDE.md`: fila `scores` con `user_id` y política nueva, sección nueva "Seguridad (SPEC 15)"
  con headers, regla de contraseña, rate limit y el warning aceptado.
- Marcar el checklist `security-checklist.md` con `[x]` en los puntos cerrados.
- Proteccion de rutas con Proxy Next.js: informacion sobre proxy aqui: https://nextjs.org/docs/app/getting-started/proxy 

Ejemplo: proxy.ts 
```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
 
// This function can be marked `async` if using `await` inside
export function proxy(request: NextRequest) {
  return NextResponse.redirect(new URL('/home', request.url))
}
 
// Alternatively, you can use a default export:
// export default function proxy(request: NextRequest) { ... }
 
export const config = {
  matcher: '/about/:path*',
}
```

**Fuera de alcance:**

- CAPTCHA (Turnstile/hCaptcha) en el registro.
- Rellenar las iniciales desde el perfil, la fila `▸ TU MEJOR MARCA` y enseñar puntuaciones por
  usuario: sigue siendo la spec de vincular puntuaciones. Aquí sólo se guarda `user_id`.
- Rellenar `user_id` en las puntuaciones que ya existen.
- Rate limit propio en las Server Actions (por ejemplo contra el spam de `guardarScore`).
- Activar leaked password protection (requiere Pro).
- SMTP propio.
- Lista de requisitos de contraseña en vivo.

## Modelo de datos

`supabase/migrations/20260927130000_seguridad_basica.sql`:

```sql
-- SPEC 15: seguridad básica.
-- Función generada por Supabase y usada por el event trigger `ensure_rls`. Se queda, sin EXECUTE para la API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Autor de la puntuación: null = invitado. Si se borra la cuenta, la marca queda como invitado.
alter table public.scores
  add column user_id uuid null references auth.users (id) on delete set null;
comment on column public.scores.user_id is
  'Cuenta que guardó la puntuación; null = invitado. Sólo se puede insertar la propia.';

drop policy "cualquiera puede guardar una puntuación" on public.scores;
create policy "invitados o la propia cuenta guardan puntuación" on public.scores
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));
```

Sin cambios en `games`, `profiles` ni `game_stats`. `lib/password.ts` es código, no datos
persistidos.

## Plan de implementación

1. **Migración.** Escribir el `.sql`, aplicarlo con `apply_migration` y comprobar con
   `list_tables` / `execute_sql` sobre `pg_policy` que la política nueva está y la vieja no. La app
   sigue funcionando: `guardarScore` todavía no manda `user_id`, así que la fila entra con `null`.
2. **Tipos.** Regenerar `lib/supabase/database.types.ts` con `generate_typescript_types`.
3. **`guardarScore`.** Leer `getClaims()` y mandar `user_id: claims?.sub ?? null` en el insert.
4. **`lib/password.ts`** con la regex, el mensaje y `esPasswordFuerte`.
5. **Servidor.** En `app/acceso/actions.ts`: `registrar` y `cambiarPassword` usan
   `esPasswordFuerte`; se borra `MIN_PASSWORD`; `mensajeDe` añade `case "weak_password"`.
6. **UI.** En `auth-card.tsx` (sólo la pestaña de registro) y `nueva-clave/form.tsx`: comprobar
   antes de llamar a la acción y enseñar `ERROR_PASSWORD` en `.form-error`.
7. **Headers** en `next.config.ts`.
8. **Dashboard (manual, lo hace la usuaria).** Poner password min 8 + requisitos, y el rate limit de
   sign-ups/sign-ins a 10 / 5 min.
9. **Advisor.** Ejecutar `get_advisors` (security): sólo debe quedar `auth_leaked_password_protection`.
10. **Proteccion de rutas con Proxy Next.js**
11. **Docs.** Actualizar `CLAUDE.md` y marcar el checklist. Ejecutar `npm run lint` y `npm run build`.

## Criterios de aceptación

- [ ] `get_advisors(security)` devuelve **sólo** `auth_leaked_password_protection`.
- [ ] `anon` y `authenticated` no tienen `EXECUTE` sobre `rls_auto_enable()`, y el event trigger `ensure_rls` sigue activo.
- [ ] RLS activa (`rls_enabled: true`) en `games`, `scores` y `profiles`.
- [ ] `games` no tiene políticas de insert, update ni delete.
- [ ] `scores` tiene una sola política de insert, con `user_id is null or user_id = auth.uid()`, y
      ninguna de update ni delete.
- [ ] Un insert en `scores` como `anon` con un `user_id` ajeno falla por RLS. Con `user_id` null
      funciona.
- [ ] Como invitado, al guardar una puntuación desde `/jugar/<id>` se crea la fila con `user_id` null.
      Con sesión iniciada, se crea con `user_id` = id del usuario.
- [ ] En `/acceso` (registro), enviar `abcdefgh` muestra `MÍNIMO 8 CARACTERES CON MAYÚSCULA,
      MINÚSCULA, NÚMERO Y SÍMBOLO` y **no** sale ninguna petición a la Server Action (se comprueba
      en la pestaña Network o con Playwright).
- [ ] Pasa lo mismo en `/acceso/nueva-clave`.
- [ ] Si se llama a `registrar` directamente con una contraseña débil, devuelve `ERROR_PASSWORD`.
- [ ] Iniciar sesión con una cuenta antigua sigue funcionando aunque su contraseña no cumpla la regla.
- [ ] `curl -sI http://localhost:3000/` y `curl -sI http://localhost:3000/jugar/asteroids` muestran
      los 4 headers con los valores de la spec.
- [ ] Dashboard: password min 8 con "Lowercase, uppercase letters, digits and symbols", y rate limit
      de sign-ups/sign-ins en 10 / 5 min (confirmado por la usuaria).
- [ ] `CLAUDE.md` documenta `scores.user_id`, la política nueva, la sección de seguridad y el warning
      aceptado.
- [ ] `npm run lint` y `npm run build` terminan sin errores.

## Decisiones tomadas y descartadas

| Decisión | Alternativa descartada | Por qué |
| --- | --- | --- |
| `user_id` nullable + política `null or propia` | Sólo autenticados guardan | Se sigue jugando como invitado (SPEC 14). Lo importante es que nadie pueda firmar por otro. |
| Añadir `user_id` en esta spec | Esperar a la spec de vincular puntuaciones | La usuaria quiere que la política de insert ya dependa de `auth.uid()`. Aquí sólo se guarda; enseñarlo es de la otra spec. |
| Revocar `EXECUTE` de `rls_auto_enable()` | Borrarla con `drop ... cascade` | El plan original era borrarla, pero la usa el event trigger `ensure_rls`, que sirve de red de seguridad (las tablas nuevas nacen con RLS). Revocar basta para que el advisor deje de marcarla. |
| Regex con los 4 tipos de carácter, igual que "Lowercase, uppercase letters, digits and symbols" de Supabase | Sólo longitud 8 | Pedido explícito. Además compensa en parte que no haya leaked password protection en Free. |
| Validar al enviar | Lista de requisitos en vivo | Menos UI y reutiliza `.form-error` y `shake`. |
| Regla en `lib/password.ts` compartida | Duplicarla en cliente y servidor | Una sola fuente de verdad. `actions.ts` es `"use server"` y no puede exportar constantes al cliente. |
| No validar la regla al iniciar sesión | Validarla también | Las cuentas antiguas con contraseñas débiles quedarían bloqueadas. |
| Headers: los 3 del checklist + `X-DNS-Prefetch-Control: off` | Añadir CSP y HSTS | CSP con nonces y HSTS requieren más configuración y dominio. Spec aparte. |
| Rate limit 10 / 5 min | Dejar 30 (default) o bajar a 5 | Frena bots sin bloquear a quien se equivoca unas cuantas veces. |
| Leaked password: warning aceptado | Pasar a Pro | Plan Free. Queda documentado como pendiente. |
| Migración con MCP `apply_migration` y archivo en `supabase/migrations/` | CLI de Supabase | No hay CLI. Es el patrón que ya siguen las migraciones anteriores. |

## Riesgos identificados

- **El rate limit es conjunto para sign-ups y sign-ins**: 10 intentos fallidos de login desde la
  misma IP (una NAT compartida, por ejemplo) bloquean también los registros durante 5 min. Ya existe
  el mensaje `DEMASIADOS INTENTOS. ESPERA UNOS MINUTOS`.
- **Regex y dashboard pueden desalinearse**: si alguien cambia uno sin el otro, Supabase devuelve
  `weak_password`. Por eso `mensajeDe` lo traduce a `ERROR_PASSWORD`.
- **`X-Frame-Options: DENY`** impide incrustar la app en un iframe. Hoy no se usa ninguno, pero
  habría que revisarlo si se añade un embed.
- **La política de `scores` no frena el spam de invitados**: un anónimo puede seguir insertando
  filas con `user_id` null directamente contra PostgREST. Los `CHECK` limitan los valores, no el
  volumen. Queda fuera de esta spec.
- **La configuración del dashboard no está versionada.** Si se recrea el proyecto, hay que repetir el
  paso 8 a mano.
