# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Arcade Vault: plataforma web para jugar juegos arcade online y competir por puntuación.
Estado actual: 5 juegos jugables con motor propio — **ASTEROIDS**, **TETRIS** (id `caida`),
**ARKANOID**, **SNAKE** y **FROGGER** (id `frogger`, nacido de la game-jam `ranaria`) — cada
uno con leaderboard real en Supabase. El resto del catálogo (`gloton`, `invasores`,
`duelo-pixel`) sigue en modo maqueta, pintando `seededScores()` de `lib/games.ts` en vez de
datos reales.

El README indica que el flujo de trabajo es **Spec Driven Design** con los comandos `/spec`
y `/spec-impl` de las skills `Klerith/fernando-skills` (instalar con
`npx skills@latest add Klerith/fernando-skills`). Escribe la spec antes de implementar.

## Comandos

```bash
npm run dev     # servidor de desarrollo
npm run build   # build de producción
npm start       # servir el build
npm run lint    # eslint (flat config, sin argumentos)
npm run format  # prettier --write . (todo el repo)
```

Formateo automático: el hook `PostToolUse` de `.claude/settings.json` procesa cada archivo
que Claude escribe o edita dentro del proyecto, en este orden:

1. `.claude/hooks/strip-blank-lines.mjs` elimina **todas las líneas en blanco** de
   `.ts/.tsx/.js/.jsx/.mjs/.css` — el código se mantiene compacto. El script respeta las
   líneas vacías que están dentro de template literals o comentarios de bloque, y no toca
   `.md` ni otros formatos donde las líneas en blanco son sintaxis.
2. `prettier --write --ignore-unknown` (config en `.prettierrc` / `.prettierignore`).
3. `eslint --fix` en `.ts/.tsx/.js/.jsx/.mjs`.

No escribas líneas en blanco separando bloques de código: el hook las quitará igual.

No hay framework de tests configurado; si se añade uno, documentarlo aquí.

## Arquitectura de juegos

Cada juego real vive en `lib/games/<slug>/engine.ts` (+ `sprites.ts` cuando usa spritesheet:
`arkanoid`, `snake`; + `skins.ts` con sus paletas: `asteroids`, `arkanoid`, `snake`, `frogger`;
`arkanoid` además tiene `tint.ts`) e implementa el contrato compartido de `lib/games/engine.ts`
(`GameCallbacks`, `GameEngine`, `GameFactory`): el motor dibuja en un `<canvas>` y reporta
eventos por callbacks, sin React dentro. `lib/games/registry.ts` (`GAME_ENGINES`,
`getEngine(id)`) mapea el slug al motor.

En el lado de React: `components/game-canvas.tsx` monta/desmonta el motor sobre el canvas;
`components/game-player.tsx` (`GamePlayer`) es el orquestador — HUD, pausa, modal de guardar
puntuación — y cae a una simulación `.game-arena` cuando `getEngine(id)` devuelve `undefined`
(los 3 juegos aún sin motor). `components/leaderboard.tsx` (`Leaderboard`) pinta la tabla de
mejores puntuaciones dentro de `GamePlayer` cuando `hasLeaderboard` es `true`.

Móvil (SPEC 11): `components/touch-pad.tsx` (`TouchPad`) es un mando virtual común — cruceta
que envía las cuatro flechas + botones A/B — que sólo se ve con `@media (pointer: coarse)` y en
vertical. Traduce toques en `KeyboardEvent` sintéticos sobre el canvas
(`GameCanvasHandle.key(code, down)`), así que los motores no tienen código táctil. El mapeo va en
el campo `touch` de `GameEngineEntry` (`{ a?, b?: { code, label }, repeat? }`): un botón sin
mapeo no se pinta, y un juego sin `touch` no tiene mando. En táctil el HUD se reduce a una barra
y el skin y `SALIR` pasan al overlay de pausa. Ningún motor debe comprobar `e.isTrusted`.

Rendimiento (SPEC 13): en `GamePlayer` puntos, vidas y nivel **no son estado de React** — viven en
refs y `pintarScore`/`pintarVidas`/`pintarNivel` escriben el `textContent` de los `.v` del HUD, así
que los avisos del motor no re-renderizan la página. Mantener `useState` sólo para lo que cambia lo
que React pinta (`paused`, `over` = puntuación final o `null`, `guardado`, `customName`). Los motores
no deben asignar arrays/objetos/clausuras dentro de `draw()`. Medidor de desarrollo: añadir
`?fps=1` a `/jugar/<id>` (`components/fps-meter.tsx`) muestra fps, p95, frames > 50 ms, renders de
`GamePlayer` y heap, y lo publica en `window.__avFps` para Playwright.

Para agregar un juego nuevo sigue el flujo de la skill `nuevo-juego` (ver sección "skills"),
no un proceso ad-hoc.

## Variables de entorno

`.env.local` (ignorado por git; ver `.env.example`):

- `RESEND_API_KEY` — clave de [Resend](https://resend.com/api-keys). La usa el Server Action
  `sendContact` (`app/acerca/actions.ts`) para enviar el formulario de contacto de `/acerca`.
  Sin ella el formulario muestra un error legible en vez de fallar.

- `NEXT_PUBLIC_SUPABASE_URL` — URL del proyecto de Supabase
  (`https://wlofsbjzfzywdgvovibv.supabase.co`).
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — clave publicable (`sb_publishable_…`) del mismo
  proyecto.

Las dos de Supabase llevan prefijo `NEXT_PUBLIC_` porque el cliente de navegador las necesita, y
las dos son públicas por diseño: la seguridad la da RLS, no el secreto de la clave. La clave
`service_role` **no** entra en este repositorio. A diferencia de `RESEND_API_KEY`, que degrada,
si falta una de estas `lib/supabase/env.ts` lanza `FALTA <NOMBRE> EN .env.local`.

## Base de datos (Supabase)

El esquema `public` ya no está vacío. Migraciones versionadas en `supabase/migrations/`,
aplicadas con `apply_migration` del MCP de Supabase.

| Objeto       | Qué es                                                                                                                                                                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `games`      | Juegos **jugables**, no el catálogo de la maqueta. `id` textual = el slug (`asteroids`), que es también el segmento de URL y la clave de `GAME_ENGINES`. Hoy tiene 5 filas: `asteroids`, `caida` (título TETRIS), `arkanoid`, `snake`, `frogger`. Detalle en `References/resources/resources/implemented-games.md`. |
| `scores`     | Puntuaciones: `game_id` (FK a `games`), `player` (`^[A-Z]{1,3}$`), `score` (0..1.000.000), `user_id` (FK a `auth.users`, `null` = invitado; SPEC 15). Enseñarlas por cuenta es la spec siguiente.                                                                                                                   |
| `profiles`   | 1:1 con `auth.users` (SPEC 14): `username` único `^[a-z0-9_]{3,16}$`, siempre en minúsculas (la UI lo pinta en mayúsculas). Lo crea el trigger `on_auth_user_created` (`handle_new_user()`, `security definer`) con sufijo numérico si choca. `select` público, sin políticas de escritura.                         |
| `game_stats` | Vista (`security_invoker`) con `best` y `plays` por juego, derivados de `scores`. Un juego sin puntuaciones no aparece en ella.                                                                                                                                                                                     |

RLS activa en `games`, `scores` y `profiles`: `select` público; `insert` en `scores` sólo con
`user_id is null or user_id = auth.uid()` (nadie firma por otra cuenta); **ninguna** política de
`update` ni `delete`. `guardarScore` rellena `user_id` con `getClaims()` o `null`. La escritura pasa por la Server Action `guardarScore`
(`app/jugar/actions.ts`), que valida y hace `revalidatePath`; los `CHECK` de la tabla son la
garantía real, la acción existe para dar un mensaje legible.

Las lecturas viven en `lib/scores.ts` (`hasLeaderboard`, `topScores`, `gameStats`) y devuelven el
caso vacío ante un error en vez de lanzar. Los tres juegos sin fila en `games` (`gloton`,
`invasores`, `duelo-pixel`) siguen pintando `seededScores()` de `lib/games.ts`.

Tras cualquier cambio de esquema hay que regenerar los tipos:

```bash
npx supabase gen types typescript --project-id wlofsbjzfzywdgvovibv > lib/supabase/database.types.ts
```

## Autenticación (SPEC 14)

Supabase Auth con email + contraseña (confirmación de correo obligatoria), Google y GitHub.

- **Entrar y salir son Server Actions** de `app/acceso/actions.ts` (`registrar`, `iniciarSesion`,
  `entrarCon`, `cerrarSesion`, `pedirRecuperacion`, `cambiarPassword`): devuelven `AuthResult` con
  mensajes en mayúsculas y nunca lanzan. No llamar a `supabase.auth.*` desde componentes para
  entrar o salir.
- **Route Handlers**: `/auth/confirm` verifica el `token_hash` de los correos (`type=email` →
  `/biblioteca`, `type=recovery` → `/acceso/nueva-clave`, fallo → `/acceso?error=enlace`);
  `/auth/callback` canjea el `code` de OAuth (fallo → `/acceso?error=oauth&proveedor=…`, el
  proveedor viaja en la cookie `av_oauth`, ver `app/auth/proveedor.ts`).
- **`useSession()`** (`lib/session.tsx`) sólo lee: `{ user: { id, name } | null, loading, signOut }`.
  `name` es `profiles.username` en mayúsculas. Relee la sesión con `getClaims` en cada cambio de
  ruta, porque las cookies las escriben las acciones en el servidor. El nav no pinta el botón de
  sesión mientras `loading`.
- Pantallas: `/acceso` (pestañas + `REVISA TU CORREO`), `/acceso/recuperar`,
  `/acceso/nueva-clave` (sólo con la sesión abierta por el correo de recuperación: `/auth/confirm` pone la cookie `av_recovery` = id del usuario, 15 min, y `cambiarPassword` la exige y la borra; además el `amr` firmado del JWT debe incluir `recovery` de hace menos de 15 min; si no, redirige a `/acceso`). No hay rutas protegidas: se juega como
  invitado.

Configuración externa (manual, ya hecha en desarrollo): en el dashboard de Supabase, Site URL
`http://localhost:3000` y Redirect URLs `/auth/callback` y `/auth/confirm`; "Confirm email"
activado; plantillas "Confirm signup" y "Reset password" con enlace
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` (o `type=recovery`); clientes
OAuth de Google Cloud y GitHub con callback `https://wlofsbjzfzywdgvovibv.supabase.co/auth/v1/callback`.
En producción hay que añadir las URLs del dominio. SMTP: el de Supabase por defecto (pocos correos
por hora).

## Seguridad (SPEC 15)

- **Contraseña**: mínimo 8 con minúscula, mayúscula, dígito y símbolo. La regla vive en
  `lib/password.ts` (`esPasswordFuerte`, `ERROR_PASSWORD`) y la usan los formularios (registro y
  `/acceso/nueva-clave` validan antes de enviar) y `registrar`/`cambiarPassword`. El login no la
  exige (cuentas antiguas). En el dashboard: _Minimum password length_ 8 y _Password requirements_
  "Lowercase, uppercase letters, digits and symbols". Si se cambia una, cambiar la otra;
  `weak_password` se traduce a `ERROR_PASSWORD`.
- **Rate limit** (dashboard, Auth > Rate Limits): sign-ups y sign-ins 10 / 5 min por IP.
- **Headers** en `next.config.ts` para todas las rutas: `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-DNS-Prefetch-Control: off`. CSP y HSTS pendientes (otra spec).
- **`rls_auto_enable()`** (generada por Supabase) la usa el event trigger `ensure_rls`, que activa
  RLS en cada tabla nueva: no borrarla. Sin `EXECUTE` para `anon`/`authenticated`.
- **Warning aceptado**: _Leaked password protection_ sólo existe en plan Pro; el proyecto es Free.
  Activarlo al pasar a Pro. Es el único aviso que debe dar `get_advisors` (security).
- Configuración del dashboard no versionada: repetirla a mano si se recrea el proyecto.

## skills

Todas viven en `.agents/skills/<nombre>/` con symlink en `.claude/skills/`.

`/frontend-design`: úsala siempre para diseñar la interfaz del usuario.

`nuevo-juego` (espejada en `.claude/skills/nuevo-juego/` y `.agents/skills/nuevo-juego/`, con
`port-guide.md`): skill propia del repo que formaliza el flujo para portar un juego nuevo —
escribir la spec primero, motor sobre el contrato `GameFactory`, entrada en el catálogo
(`lib/games.ts`), CSS de portada, línea en `lib/games/registry.ts`, fila en la tabla `games`
vía migración, y wiring del leaderboard. Úsala en vez de improvisar el proceso cuando se
agregue un juego.

`/spec` y `/spec-impl` (de `Klerith/fernando-skills`, ver README; copia local en
`.agents/skills/`) siguen siendo el flujo general de Spec Driven Design. Ya hay 15 specs en
`specs/01-...` a `specs/15-seguridad-basica.md`; seguir el mismo patrón de numeración al
agregar una nueva. Las propuestas de juego de la game-jam van aparte en
`specs/game-jam/<id>/` (hoy `ranaria/`).

`/spec-impl-game` (skill propia en `.agents/skills/spec-impl-game/`, symlink en
`.claude/skills/`): para specs de **juegos**. Sigue las Fases 1–4 de `/spec-impl` leyendo su
`SKILL.md` (no la duplica ni la modifica; también busca en `specs/game-jam/<id>/`), luego
`lint` + `build` y lanza en secuencia, nunca en paralelo, `skin-designer` y después
`mobile-porter` sobre el slug implementado. No hace commits.

## Agentes

Definidos en `.claude/agents/<nombre>.md`. Memorias en `References/resources/resources/`.

| Agente                     | Qué hace                                                                                                                                                 | Memoria                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `game-planner`             | Decide qué juego portar o incorporar a continuación (de los 3 en maqueta, o uno nuevo). Solo planifica.                                                  | `game-suggestions-todo.md`    |
| `game-jam`                 | A partir de un tema inventa un juego nuevo y escribe ≥ 2 specs variantes en `specs/game-jam/<id>/`. No implementa.                                       | —                             |
| `skin-designer`            | Aplica los 3 skins (`clasico`, `neon`, `retro`) legibles en modo oscuro a **un** juego, nunca a todos.                                                   | `game-with-themes.md`         |
| `mobile-porter`            | Soporte táctil de SPEC 11 en **un** juego con motor: `touch` en el registry + CSS, verificado con Playwright.                                            | `mobile-status.md`            |
| `game-performance-booster` | Revisa y corrige el rendimiento de **un** motor con la checklist C1–C8 de SPEC 13, midiendo antes/después con `?fps=1`.                                  | `performance-status.md`       |
| `security-auditor`         | Auditoría completa de seguridad de BD (advisors, RLS, grants, funciones) y app (headers, actions, auth, secretos) contra SPEC 14/15. Solo lee y propone. | `security/security-status.md` |

Para restricciones, herramientas y pasos de cada agente, leer el `description` del frontmatter y
el cuerpo de su archivo en `.claude/agents/`.

## Stack y convenciones

- **Next.js 16 (App Router)** + React 19. Ver `AGENTS.md`: esta versión tiene breaking
  changes respecto al conocimiento previo — consultar `node_modules/next/dist/docs/`
  antes de escribir código de Next.
- Tipos de props de rutas: helpers globales generados por Next (`LayoutProps<"/">`,
  `PageProps<...>`) en vez de interfaces escritas a mano — ver `app/layout.tsx`.
- **Tailwind CSS v4** vía `@tailwindcss/postcss`. No hay `tailwind.config.js`: el tema se
  define en `app/globals.css` con `@import "tailwindcss"` y el bloque `@theme inline`.
  Añadir tokens de diseño ahí, no en un config JS.
- Modo oscuro por `prefers-color-scheme` (variables CSS `--background`/`--foreground`)
  combinado con las variantes `dark:` de Tailwind.
- TypeScript `strict`. Alias de import `@/*` → raíz del repo.
- ESLint 9 flat config (`eslint.config.mjs`) extendiendo `core-web-vitals` + `typescript`.
