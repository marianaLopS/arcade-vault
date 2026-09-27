# SPEC 14 — Autenticación: registro, inicio de sesión y cuentas

> **Estado:** Aprobado
> **Depende de:** SPEC 01, SPEC 04, SPEC 06
> **Fecha:** 2026-09-27
> **Objetivo:** Sustituir la sesión de maqueta de `/acceso` por cuentas reales de Supabase Auth (email + contraseña con confirmación por correo, Google y GitHub), con un perfil de usuario único, cierre de sesión en el nav y recuperación de contraseña.

## Por qué existe esta spec

`/acceso` es maqueta: cualquier envío llama a `signIn({ name })` de `lib/session.tsx`, que guarda
`av_user` en localStorage, y los botones GOOGLE/GITHUB no hacen nada. SPEC 04 dejó montados los
clientes de Supabase y el refresco de sesión en `proxy.ts` precisamente para esta spec, y SPEC 06
dejó la identidad fuera de las puntuaciones a la espera de ella.

Esta spec construye **sólo la identidad**: quién eres y cómo entras y sales. Vincular puntuaciones
a la cuenta es la spec siguiente.

## Alcance

**Dentro:**

- **Registro** con usuario + email + contraseña (`supabase.auth.signUp`), con **confirmación de
  correo obligatoria**: tras enviar, la tarjeta muestra el estado `REVISA TU CORREO`.
- **Ruta `/auth/confirm`** (Route Handler) que verifica el `token_hash` del correo con
  `verifyOtp` y redirige: `type=email` → `/biblioteca`; `type=recovery` → `/acceso/nueva-clave`.
- **Inicio de sesión** con email + contraseña (`signInWithPassword`). Redirige a `/biblioteca`.
- **OAuth Google y GitHub** (`signInWithOAuth`, flujo PKCE) con **Route Handler
  `/auth/callback`** que hace `exchangeCodeForSession` y redirige a `/biblioteca`.
- **Tabla `profiles`** (1:1 con `auth.users`) con `username` único, creada por un **trigger** al
  crear el usuario. En OAuth el username se deriva del proveedor/email, con sufijo numérico si choca.
- **Cerrar sesión** desde el nav: el botón con el nombre abre un menú con `SALIR`.
- **Recuperar contraseña**: enlace `¿OLVIDASTE LA CONTRASEÑA?` en `/acceso` → `/acceso/recuperar`
  (pide email) → correo → `/auth/confirm?type=recovery` → `/acceso/nueva-clave` (fija la nueva).
- **Todas las operaciones de auth como Server Actions** en `app/acceso/actions.ts`, con el
  cliente de servidor de SPEC 04 y mensajes de error legibles en español y en mayúsculas.
- **`lib/session.tsx` reescrito**: `useSession()` lee Supabase Auth (`getUser` inicial +
  `onAuthStateChange`) y el `username` de `profiles`. Desaparecen `av_user`, `signIn` y el store
  sobre localStorage. `nav.tsx`, `game-player.tsx` y `hall-you-row.tsx` siguen usando
  `useSession()` sin cambiar su forma de leer `user.name`.
- `JUGAR COMO INVITADO` se mantiene y sigue entrando a `/biblioteca` sin cuenta.
- **Pasos manuales documentados** (dashboard Supabase y consolas OAuth), ver "Configuración
  externa".
- Actualizar `CLAUDE.md` (sección de base de datos y variables) y regenerar
  `lib/supabase/database.types.ts`.

**Fuera de alcance (para specs futuras):**

- `scores.user_id`, rellenar las iniciales desde el perfil y la fila `▸ TU MEJOR MARCA` real.
- Editar el username o cualquier dato del perfil (pantalla de cuenta).
- Pantalla para elegir username tras el primer login OAuth: el trigger lo deriva y basta.
- Protección de rutas o redirecciones por falta de sesión. El `proxy` sigue sin redirigir.
- SMTP propio (Resend u otro). Se usa el SMTP por defecto de Supabase.
- Borrar `/debug/supabase`.
- Otros proveedores OAuth, magic link, 2FA, borrar cuenta, avatares.
- Login con username (sólo email).

## Modelo de datos

Migración `supabase/migrations/20260927120000_auth_profiles.sql`:

```sql
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text not null check (username ~ '^[a-z0-9_]{3,16}$'),
  created_at timestamptz not null default now()
);
create unique index profiles_username_key on public.profiles (username);
alter table public.profiles enable row level security;
-- select público (anon, authenticated); ninguna política de insert/update/delete.
```

Trigger `on_auth_user_created` (`after insert on auth.users`) → función
`public.handle_new_user()` `security definer`, `set search_path = ''`:

- Candidato: `raw_user_meta_data->>'username'` (registro por email) o, si falta,
  `user_name` (GitHub) / `name` (Google) / parte local del email.
- Normaliza a `[a-z0-9_]`, recorta a 16, rellena hasta 3 con `_` si hace falta.
- Si ya existe, prueba `<base recortada><n>` con n = 1, 2, … hasta encontrar uno libre.
- Inserta en `profiles`. Un fallo aquí aborta el alta: la función no debe lanzar por choque.

Username: siempre minúsculas en la base; la UI lo pinta en mayúsculas.

`lib/session.tsx`:

```ts
export type User = { id: string; name: string }; // name = profiles.username
type SessionValue = { user: User | null; loading: boolean; signOut: () => Promise<void> };
```

`app/acceso/actions.ts` (todas devuelven un resultado, no lanzan):

```ts
export type AuthResult = { ok: true; aviso?: string } | { ok: false; error: string };
registrar(prev, formData)          // username, email, password → REVISA TU CORREO
iniciarSesion(prev, formData)      // email, password → redirect("/biblioteca")
entrarCon(provider: "google" | "github") // redirect(url de OAuth)
cerrarSesion()                     // signOut → redirect("/")
pedirRecuperacion(prev, formData)  // email → siempre el mismo aviso
cambiarPassword(prev, formData)    // password, confirmación → redirect("/biblioteca")
```

Reglas de validación en las acciones (la base es la garantía real):

- Username: `^[a-z0-9_]{3,16}$` tras pasarlo a minúsculas; si ya existe en `profiles` →
  `ESE USUARIO YA EXISTE`.
- Contraseña: mínimo 8 caracteres.
- Email: formato básico; el resto lo decide Supabase.

Mensajes de error (mapeo desde el error de Supabase):

| Caso                                     | Mensaje                                        |
| ---------------------------------------- | ---------------------------------------------- |
| Credenciales inválidas                   | `EMAIL O CONTRASEÑA INCORRECTOS`               |
| Email sin confirmar                      | `CONFIRMA TU CORREO ANTES DE ENTRAR`           |
| Email ya registrado                      | `ESE CORREO YA TIENE CUENTA`                   |
| Límite de envíos de correo               | `DEMASIADOS INTENTOS. ESPERA UNOS MINUTOS`     |
| Proveedor OAuth no configurado / fallo   | `NO SE PUDO CONECTAR CON <GOOGLE/GITHUB>`      |
| Enlace de correo caducado o inválido     | `/acceso?error=enlace` → `EL ENLACE HA CADUCADO` |
| Cualquier otro                           | `ALGO FALLÓ. INTÉNTALO DE NUEVO`               |

`pedirRecuperacion` responde siempre `SI EXISTE UNA CUENTA, TE HEMOS ENVIADO UN CORREO`, exista o
no el email.

## Configuración externa (pasos manuales)

1. **Supabase → Authentication → URL Configuration**: Site URL `http://localhost:3000`;
   Redirect URLs `http://localhost:3000/auth/callback` y `http://localhost:3000/auth/confirm`
   (más las de producción cuando haya dominio).
2. **Email → Confirm email**: activado.
3. **Plantillas de correo** "Confirm signup" y "Reset password": el enlace pasa a
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` (y `type=recovery`), para
   que la verificación la haga el servidor y no dependa del fragmento `#`.
4. **Google Cloud Console**: cliente OAuth web con redirect
   `https://wlofsbjzfzywdgvovibv.supabase.co/auth/v1/callback`; id/secret en Supabase → Providers
   → Google.
5. **GitHub → Developer settings → OAuth Apps**: misma callback; id/secret en Providers → GitHub.

Sin los pasos 4–5 el botón del proveedor muestra su error legible; email + contraseña funciona
igual.

## Plan de implementación

1. Migración `profiles` + trigger `handle_new_user` con `apply_migration`. Regenerar
   `database.types.ts`. Comprobar con `get_advisors` (security) que no hay avisos nuevos.
2. Pasos manuales 1–3 de "Configuración externa" (la usuaria en el dashboard).
3. `app/auth/confirm/route.ts` y `app/auth/callback/route.ts`. Leer antes la guía de Route
   Handlers en `node_modules/next/dist/docs/`.
4. `app/acceso/actions.ts` con `registrar`, `iniciarSesion` y `cerrarSesion`.
5. Reescribir `lib/session.tsx` sobre el cliente de navegador (`getUser` +
   `onAuthStateChange` + lectura de `profiles`). Quitar `signIn` y `av_user`.
6. `app/acceso/page.tsx`: formularios conectados a las acciones con `useActionState`, estado
   pendiente en el botón, error bajo el formulario y estado `REVISA TU CORREO` tras registrarse.
   Muestra `?error=enlace`. Diseño con `/frontend-design`, reutilizando `.auth-card`/`.field`.
7. `components/nav.tsx`: menú del usuario con `SALIR` (llama a `cerrarSesion`), en escritorio y
   en el menú móvil.
8. Acción `entrarCon` y botones GOOGLE/GITHUB conectados. Pasos manuales 4–5.
9. Recuperación: `pedirRecuperacion`, `cambiarPassword`, páginas `app/acceso/recuperar/page.tsx`
   y `app/acceso/nueva-clave/page.tsx` (esta última, sin sesión de recuperación, redirige a
   `/acceso`).
10. Actualizar `CLAUDE.md` (tabla `profiles`, flujo de auth, pasos manuales). `npm run lint` y
    `npm run build`.

## Criterios de aceptación

- [ ] Existe `public.profiles` con RLS activa, `select` público y sin políticas de escritura.
- [ ] Registrarse con usuario `px_kai`, email y contraseña de 8+ caracteres muestra
      `REVISA TU CORREO` y no inicia sesión.
- [ ] Tras el alta existe una fila en `profiles` con `username = 'px_kai'`.
- [ ] Registrarse con un username ya usado muestra `ESE USUARIO YA EXISTE` y no crea usuario.
- [ ] Una contraseña de 7 caracteres muestra un error y no llama a Supabase.
- [ ] Iniciar sesión antes de confirmar muestra `CONFIRMA TU CORREO ANTES DE ENTRAR`.
- [ ] Abrir el enlace del correo de confirmación deja la sesión iniciada en `/biblioteca`.
- [ ] Una contraseña incorrecta muestra `EMAIL O CONTRASEÑA INCORRECTOS`.
- [ ] Con sesión, el nav muestra el username en mayúsculas; `SALIR` cierra sesión y el nav vuelve
      a `INICIAR SESIÓN`.
- [ ] Recargar la página con sesión mantiene al usuario en el nav.
- [ ] Entrar con GitHub y con Google termina en `/biblioteca` con sesión y crea su fila en
      `profiles` con un username válido.
- [ ] Un segundo usuario OAuth cuyo nombre choca recibe un username con sufijo numérico.
- [ ] `¿OLVIDASTE LA CONTRASEÑA?` → email → enlace → `/acceso/nueva-clave` → nueva contraseña →
      se puede iniciar sesión con ella y no con la antigua.
- [ ] Pedir recuperación para un email inexistente muestra el mismo aviso que para uno existente.
- [ ] Abrir `/acceso/nueva-clave` sin sesión de recuperación redirige a `/acceso`.
- [ ] Un enlace de correo manipulado lleva a `/acceso` con `EL ENLACE HA CADUCADO`.
- [ ] `JUGAR COMO INVITADO` entra a `/biblioteca` sin sesión.
- [ ] No queda ninguna referencia a `av_user` ni a `signIn` de `useSession` en el repo.
- [ ] `/debug/supabase` muestra el `sub` del usuario con sesión, en servidor y en cliente.
- [ ] `npm run lint` y `npm run build` pasan sin errores.

## Decisiones

- **Sí:** email + contraseña, Google y GitHub en la misma spec. Decisión de la usuaria.
- **Sí:** confirmación de correo obligatoria. Decisión de la usuaria; cuesta la ruta
  `/auth/confirm` y el límite de envíos del SMTP por defecto.
- **Sí:** SMTP por defecto de Supabase. Suficiente para desarrollo; SMTP propio es otra spec.
- **No:** Resend como SMTP ahora. Exige dominio verificado.
- **Sí:** tabla `profiles` con username único y login sólo por email. No hay que resolver
  usuario → email en servidor ni exponer emails.
- **No:** login con username. Más superficie (RPC que devuelve emails) sin necesidad.
- **Sí:** username creado por trigger `security definer`. Cubre email y OAuth por el mismo
  camino y no deja usuarios sin perfil.
- **No:** pantalla para elegir username tras OAuth. Más estados y redirecciones; el derivado con
  sufijo basta hasta la spec de perfil.
- **Sí:** `^[a-z0-9_]{3,16}$`, minúsculas en la base. Unicidad sin `lower()` en el índice.
- **Sí:** Server Actions, como `guardarScore`. Las cookies las escribe el servidor.
- **No:** llamar a `supabase.auth.*` desde componentes para entrar o salir. Mezcla patrones.
  El cliente de navegador sólo **lee** la sesión en `useSession()`.
- **Sí:** verificar correos por `token_hash` en `/auth/confirm`. Funciona en servidor con SSR;
  el enlace por defecto usa el fragmento `#` y el servidor no lo ve.
- **Sí:** reemplazar `av_user` por Supabase. Una sola fuente de verdad.
- **Sí:** mismo aviso en recuperación exista o no el email. Evita enumerar cuentas.
- **No:** proteger rutas. Se juega como invitado; se decidirá si hace falta.
- **No:** vincular puntuaciones. Spec siguiente.
- **No:** borrar `/debug/supabase` ahora. Sirve para verificar esta spec.

## Riesgos

| Riesgo                                                                 | Mitigación                                                                                                                  |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| SMTP por defecto limita a pocos correos por hora.                      | Error legible `DEMASIADOS INTENTOS…`. Probar con pocos altas. SMTP propio en otra spec.                                     |
| El trigger falla y el alta entera devuelve "Database error".           | La función nunca lanza por choque de username (sufijo). Pre-comprobación en `registrar` para el caso normal.               |
| Carrera: dos altas con el mismo username a la vez.                     | El índice único la para; el trigger reintenta con sufijo; la acción muestra el error genérico si aun así falla.            |
| Plantillas de correo sin cambiar → el enlace no pasa por `/auth/confirm`. | Paso manual 3 explícito; criterio de aceptación del enlace de confirmación lo detecta.                                     |
| Proveedor OAuth sin configurar.                                        | Error legible por proveedor; email + contraseña no depende de él.                                                          |
| `useSession()` pinta "sin sesión" un instante al cargar.               | Campo `loading`; el nav no pinta el botón de sesión hasta que `loading` es `false`.                                          |
| `onAuthStateChange` + consulta a `profiles` dentro del callback bloquea. | Leer `profiles` fuera del callback (efecto aparte), como recomienda Supabase.                                               |

## Lo que **no** entra en esta spec

- `scores.user_id`, iniciales desde el perfil y `▸ TU MEJOR MARCA` real.
- Editar el perfil o elegir username tras OAuth.
- Protección de rutas.
- SMTP propio.
- Borrar `/debug/supabase`.
- Otros proveedores, magic link, 2FA, borrar cuenta, avatares.

Cada una, si llega, va en su propia spec.

