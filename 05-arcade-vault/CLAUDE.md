# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Arcade Vault: plataforma web para jugar juegos arcade online y competir por puntuación.
Estado actual: scaffold de `create-next-app` sin código de dominio todavía — `app/page.tsx`
sigue siendo la plantilla por defecto. Los juegos aún no están implementados aquí.

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

| Objeto       | Qué es                                                                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `games`      | Juegos **jugables**, no el catálogo de la maqueta. `id` textual = el slug (`asteroids`), que es también el segmento de URL y la clave de `GAME_ENGINES`. Hoy tiene una fila. |
| `scores`     | Puntuaciones anónimas: `game_id` (FK a `games`), `player` (`^[A-Z]{1,3}$`), `score` (0..1.000.000). Sin `user_id`: la identidad llega con la spec de autenticación.          |
| `game_stats` | Vista (`security_invoker`) con `best` y `plays` por juego, derivados de `scores`. Un juego sin puntuaciones no aparece en ella.                                              |

RLS activa en las dos tablas: `select` público, `insert` público en `scores`, y **ninguna**
política de `update` ni `delete`. La escritura pasa por la Server Action `guardarScore`
(`app/jugar/actions.ts`), que valida y hace `revalidatePath`; los `CHECK` de la tabla son la
garantía real, la acción existe para dar un mensaje legible.

Las lecturas viven en `lib/scores.ts` (`hasLeaderboard`, `topScores`, `gameStats`) y devuelven el
caso vacío ante un error en vez de lanzar. Los siete juegos sin fila en `games` siguen pintando
`seededScores()` de `lib/games.ts`.

Tras cualquier cambio de esquema hay que regenerar los tipos:

```bash
npx supabase gen types typescript --project-id wlofsbjzfzywdgvovibv > lib/supabase/database.types.ts
```

## skills

usa siempre /fronted-desing para diseñar la interfaz del usuario

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
