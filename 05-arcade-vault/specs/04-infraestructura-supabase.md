# SPEC 04 — Infraestructura de Supabase

> **Estado:** Aprobado
> **Depende de:** SPEC 03
> **Fecha:** 2026-09-09
> **Objetivo:** Dejar montados y verificados los clientes de Supabase (navegador, servidor y refresco de sesión en `proxy.ts`) sin cambiar todavía ninguna pantalla del sitio.

---

## Por qué existe esta spec

La sesión y las puntuaciones de Arcade Vault son maqueta: `lib/session.tsx` guarda `av_user` y
`av_scores` en `localStorage`, `/acceso` acepta cualquier envío y el Salón de la Fama pinta
`seededScores()`. Sustituir eso por datos reales son tres trabajos distintos —autenticación,
persistencia de puntuaciones y rankings— y los tres necesitan la misma base: un cliente de
Supabase que funcione en Server Components, en Client Components y en el borde de la petición.

Esta spec construye sólo esa base y la deja demostrable. Así la spec de autenticación no tiene
que discutir a la vez cómo se leen las cookies y cómo se ve el formulario de login.

---

## Alcance

**Dentro:**

- Dependencias `@supabase/supabase-js` y `@supabase/ssr`.
- Variables `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en `.env.local`,
  documentadas en `.env.example` y en `CLAUDE.md`.
- `lib/supabase/env.ts`: lectura de las dos variables con error legible si faltan.
- `lib/supabase/client.ts`: `createBrowserClient` para Client Components.
- `lib/supabase/server.ts`: `createClient()` asíncrono con `cookies()` de `next/headers`.
- `lib/supabase/proxy.ts` + `proxy.ts` en la raíz: refresco de la sesión en cada petición.
- `lib/supabase/database.types.ts`: tipos generados del esquema remoto, con la orden de
  regeneración documentada.
- `app/debug/supabase/page.tsx`: ruta temporal de diagnóstico que prueba los tres caminos.

**Fuera de alcance (para specs futuras):**

- Login, registro y logout reales. `/acceso` sigue siendo maqueta y sigue llamando a `signIn()`
  de `lib/session.tsx`. Va en la SPEC 05.
- Cualquier cambio en `lib/session.tsx`. `av_user` y `av_scores` siguen intactos en
  `localStorage`, y `useSession()` conserva su API.
- Tablas, migraciones y RLS. El esquema `public` se queda vacío en esta spec.
- Puntuaciones reales y rankings. `seededScores()` sigue alimentando `/salon` y `/juegos/[id]`.
- Protección de rutas. El `proxy` refresca la sesión, no redirige a nadie.
- Proveedores OAuth (Google, GitHub). Los botones de `/acceso` siguen sin hacer nada.
- Supabase CLI y desarrollo local con Docker. Se trabaja contra el proyecto remoto.
- Borrar `/debug/supabase`. Lo borra la SPEC 05, cuando `/acceso` demuestre lo mismo de verdad.

---

## Configuración

| Variable | Dónde | Para qué |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` (ignorado por git) | `https://wlofsbjzfzywdgvovibv.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `.env.local` (ignorado por git) | Clave publicable (`sb_publishable_…`) del mismo proyecto |

Ambas llevan prefijo `NEXT_PUBLIC_` porque el cliente de navegador las necesita, y ambas son
públicas por diseño: la seguridad real la da RLS, no el secreto de la clave. La clave de
servicio (`service_role`) **no** entra en este repositorio.

`lib/supabase/env.ts` las lee escribiendo `process.env.NEXT_PUBLIC_SUPABASE_URL` de forma
literal —Next sustituye la expresión en tiempo de compilación y un acceso dinámico
(`process.env[nombre]`) no se sustituiría— y lanza `Error` con el nombre de la variable que
falta. A diferencia de `RESEND_API_KEY` en la SPEC 03, aquí no se degrada: el correo de contacto
es una función opcional, mientras que una app sin backend de datos no tiene un modo reducido
sensato que ofrecer.

---

## Modelo de datos

Esta spec **no introduce ninguna estructura de datos nueva**. No crea tablas, no crea columnas y
no toca `av_user` ni `av_scores`. El único archivo con forma de modelo es
`lib/supabase/database.types.ts`, que es un artefacto generado a partir del esquema remoto —hoy
vacío— y no una decisión de diseño.

Se genera con el MCP de Supabase (`generate_typescript_types`) y se regenera cada vez que una
spec futura añada una tabla. Los tres clientes se declaran como `SupabaseClient<Database>`
importando ese tipo, de modo que la primera tabla que exista quede tipada sin tocar los
clientes.

---

## Plan de implementación

1. **Dependencias.** `npm install @supabase/supabase-js @supabase/ssr`.
   Comprobación: `npm run build` sigue limpio y `package.json` lista las dos.
2. **Variables de entorno.** Añadir las dos claves a `.env.example` con valor vacío y un
   comentario, y a `.env.local` con los valores reales del proyecto `wlofsbjzfzywdgvovibv`.
   Actualizar la tabla de "Variables de entorno" de `CLAUDE.md`.
   Comprobación: `.env.local` sigue ignorado por git.
3. **`lib/supabase/env.ts`.** Exporta `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` leyendo
   `process.env.<NOMBRE>` literal y lanzando `Error("FALTA <NOMBRE> EN .env.local")` cuando el
   valor es `undefined` o cadena vacía.
   Comprobación: renombrar una variable en `.env.local` y ver ese mensaje, no un fallo del SDK.
4. **`lib/supabase/database.types.ts`.** Generar los tipos del esquema remoto con el MCP. El
   archivo saldrá prácticamente vacío (0 tablas); se deja con un comentario de cabecera que
   explique que es generado y cómo regenerarlo.
5. **`lib/supabase/client.ts`.** `createBrowserClient<Database>(SUPABASE_URL,
   SUPABASE_PUBLISHABLE_KEY)` exportado como `createClient()`.
   Comprobación: importarlo desde un Client Component compila.
6. **`lib/supabase/server.ts`.** `export async function createClient()` que hace
   `const cookieStore = await cookies()` (en Next 16 `cookies()` es asíncrono) y llama a
   `createServerClient<Database>` con `cookies: { getAll, setAll }`. El `setAll` va envuelto en
   `try/catch` vacío: desde un Server Component no se pueden escribir cookies, y el refresco lo
   hace el `proxy`.
7. **`lib/supabase/proxy.ts`.** `export async function updateSession(request: NextRequest)` que
   crea un `NextResponse.next({ request })`, monta un `createServerClient` cuyo `setAll` escribe
   en la petición y en la respuesta, llama a `supabase.auth.getClaims()` para forzar el refresco
   del token y devuelve esa misma respuesta sin sustituirla por otra —cambiarla por un
   `NextResponse` nuevo perdería las cookies recién escritas y cerraría la sesión al azar.
8. **`proxy.ts` en la raíz del repositorio.** Exporta `export async function proxy(request:
   NextRequest) { return await updateSession(request) }` y un `config.matcher` que excluye
   `_next/static`, `_next/image`, `favicon.ico` y los archivos de imagen. **No** se llama
   `middleware.ts`: en Next 16 ese nombre está deprecado y renombrado a `proxy` (ver
   `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`).
   Comprobación: `npm run dev` arranca sin avisos de deprecación y las páginas siguen cargando.
9. **`app/debug/supabase/page.tsx`** — Server Component. Pinta el host de
   `NEXT_PUBLIC_SUPABASE_URL`, si la clave publicable está presente (sin imprimirla), y el
   resultado de `await supabase.auth.getClaims()` desde servidor: `SIN SESIÓN` o el `sub` del
   usuario. Incluye un pequeño Client Component hermano que hace la misma llamada desde el
   navegador, para demostrar que los dos clientes funcionan. Cabecera visible: "RUTA TEMPORAL DE
   DIAGNÓSTICO — LA BORRA LA SPEC 05". Sin enlace desde el nav.
10. **Repaso final.** `npm run lint` y `npm run build` limpios, y comprobación manual de que
    `/`, `/biblioteca`, `/salon`, `/acerca` y `/acceso` siguen comportándose igual que antes.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `package.json` lista `@supabase/supabase-js` y `@supabase/ssr`.
- [ ] `.env.example` documenta `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- [ ] `CLAUDE.md` describe las dos variables nuevas en su sección de variables de entorno.
- [ ] Existe `proxy.ts` en la raíz y **no** existe `middleware.ts`.
- [ ] `npm run dev` no emite ningún aviso de deprecación sobre `middleware`.
- [ ] `/debug/supabase` responde 200 y muestra el host del proyecto y `CLAVE: PRESENTE`.
- [ ] `/debug/supabase` muestra `SIN SESIÓN` en el bloque de servidor y en el de cliente, porque
      todavía no hay login.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/debug/supabase`.
- [ ] Con `NEXT_PUBLIC_SUPABASE_URL` vacía, la app falla con el texto
      `FALTA NEXT_PUBLIC_SUPABASE_URL EN .env.local`, no con un error del SDK.
- [ ] La clave `service_role` no aparece en ningún archivo del repositorio.
- [ ] `lib/session.tsx` no ha cambiado ni una línea.
- [ ] `/acceso` sigue entrando al vault con cualquier envío, igual que antes.
- [ ] `/salon` y `/juegos/[id]` siguen mostrando las puntuaciones de `seededScores()`.
- [ ] `/`, `/biblioteca` y `/acerca` cargan sin cambios visibles.
- [ ] Ningún enlace del sitio apunta a `/debug/supabase`.

---

## Decisiones

- **Sí:** spec de solo infraestructura. Auth, puntuaciones y rankings son tres trabajos; hacerlos
  en una spec obligaría a decidir el diseño del login mientras se depura el paso de cookies.
- **No:** crear tablas o RLS aquí. Sin identidad real no hay política de RLS que escribir que no
  sea `true`, y una política provisional es la que se queda.
- **Sí:** `@supabase/ssr` con los tres clientes desde el principio. Empezar solo con el cliente
  de navegador significaría reescribir la capa entera en cuanto haya una Server Action.
- **Sí:** `proxy.ts`, no `middleware.ts`. Next 16 deprecó el nombre; la guía de Supabase ya
  publica la variante `proxy`.
- **Sí:** `auth.getClaims()` en el `proxy` y en `/debug/supabase`. Valida la firma del JWT contra
  las claves públicas del proyecto; `getSession()` en servidor no garantiza revalidar el token y
  la cookie se puede falsificar.
- **Sí:** fallar con `Error` cuando falta una variable. La SPEC 03 degrada porque el correo es
  opcional; el backend de datos no lo es, y un fallo silencioso se descubriría en producción.
- **Sí:** clave publicable (`sb_publishable_…`) en lugar de la `anon` legacy. Se rota de forma
  independiente y es lo que recomienda Supabase para proyectos nuevos.
- **Sí:** ruta `/debug/supabase` temporal. Una spec sin nada observable no se puede verificar más
  allá de "compila"; queda declarada como temporal y con dueño para su borrado.
- **No:** tabla `ping` de prueba. Verificaría lo mismo dejando datos y una política de RLS que
  habría que recordar borrar.
- **Sí:** tipos generados desde ya, aunque el esquema esté vacío. El patrón
  `SupabaseClient<Database>` queda montado y la primera tabla no obliga a tocar los clientes.
- **No:** Supabase CLI y stack local con Docker. Añade un requisito de entorno y un paso de
  arranque a un proyecto que hoy corre con `npm run dev` y nada más.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Copiar la guía de Supabase tal cual crea `middleware.ts`, deprecado en Next 16. | El paso 8 lo nombra explícitamente y hay un criterio de aceptación que exige que `middleware.ts` no exista. |
| Devolver un `NextResponse` nuevo desde `updateSession` descarta las cookies refrescadas y cierra sesiones. | El paso 7 obliga a devolver el mismo objeto de respuesta y explica por qué. |
| Las dos claves quedan expuestas en el bundle del navegador y alguien las trata como secretos. | Son públicas por diseño; la sección de configuración lo declara y prohíbe meter `service_role` en el repositorio. |
| `/debug/supabase` se queda publicada para siempre. | La página lleva un cartel de ruta temporal, no está enlazada desde el nav, y su borrado es responsabilidad declarada de la SPEC 05. |
| El `proxy` se ejecuta en rutas estáticas y añade latencia a todo el sitio. | El `matcher` excluye `_next/static`, `_next/image`, `favicon.ico` y las imágenes. |
| `process.env` leído dinámicamente no se sustituye en el bundle y la clave llega `undefined` al navegador. | `lib/supabase/env.ts` escribe los nombres de variable literales, y el paso 3 lo indica. |

---

## Lo que **no** entra en esta spec

- Login, registro, logout y OAuth.
- Cambios en `lib/session.tsx`, `av_user` o `av_scores`.
- Tablas, migraciones y políticas de RLS.
- Puntuaciones reales y rankings del Salón de la Fama.
- Protección de rutas y redirecciones por sesión.
- Supabase CLI y desarrollo local.

Cada una de ellas, si entra, va en su propia spec.
