# SPEC 06 — Leaderboard real y tabla de juegos en Supabase

> **Estado:** Aprobado
> **Depende de:** SPEC 04, SPEC 05
> **Fecha:** 2026-09-10
> **Objetivo:** Crear las tablas `games` y `scores` en Supabase, registrar ahí sólo los juegos que existen de verdad —hoy `asteroids`— y enchufar a esos datos los dos leaderboards que ya están pintados en el sitio.

---

## Por qué existe esta spec

Los dos leaderboards ya existen visualmente y ninguno está enlazado a nada: el global de `/salon`
—podio de tres puestos y tabla de doce— y el del detalle de `/juegos/[id]`. Los dos se alimentan
de `seededScores()`, un generador determinista de nombres inventados. En paralelo, la SPEC 05
dejó Asteroids jugable: al perder la tercera vida se abre el modal `FIN DEL JUEGO`, el jugador
escribe sus iniciales, pulsa `GUARDAR PUNTUACIÓN` y la puntuación cae en `localStorage`, donde no
la lee nadie. Se juega de verdad y se puntúa de mentira.

La SPEC 04 dejó los tres clientes de Supabase montados y verificados con el esquema `public`
vacío. Esta spec pone ahí las dos primeras tablas.

La decisión que da forma a todo lo demás: **`games` no es el catálogo de la maqueta**. Los ocho
juegos de `lib/games.ts` son fichas de escaparate y siete de ellos no existen. En Supabase entra
sólo lo que se puede jugar, que hoy es una fila: `asteroids`. Así `scores.game_id` tiene una clave
foránea que significa algo, y el día que Tetris tenga motor entra con un `insert` de una línea,
igual que entró en `GAME_ENGINES`.

---

## Alcance

**Dentro:**

- Migración SQL en `supabase/migrations/`, aplicada con el MCP de Supabase: tablas `games` y
  `scores`, vista `game_stats`, políticas de RLS e inserción de la fila `asteroids`.
- Regenerar `lib/supabase/database.types.ts` con el esquema nuevo.
- `lib/scores.ts`: lecturas tipadas (top de un juego, estadísticas de un juego).
- `app/salon/actions.ts` (o el archivo de acciones que corresponda): Server Action `guardarScore`
  con validación de iniciales y puntuación, y `revalidatePath` de las pantallas afectadas.
- `components/game-player.tsx`: `GUARDAR PUNTUACIÓN` llama a la Server Action en lugar de a
  `saveScore()`, con estado de envío y de error.
- `lib/session.tsx`: se eliminan `saveScore` y la clave `av_scores`.
- `app/salon/page.tsx`: pasa a Server Component; la pestaña activa viaja en `?juego=<id>`. Los
  juegos con fila en `games` muestran datos reales; los demás siguen con `seededScores()`.
- `app/juegos/[id]/page.tsx`: leaderboard lateral y las cifras `Partidas` / `Mejor global` reales
  para los juegos con fila; `seededScores()` y `best`/`plays` de `lib/games.ts` para los demás.
- Estado vacío de los dos leaderboards, porque `scores` arranca sin ninguna fila.

**Fuera de alcance (para specs futuras):**

- Autenticación real. `av_user` y `useSession()` no se tocan: el jugador sigue siendo unas
  iniciales escritas a mano y las puntuaciones son anónimas. `scores.user_id` no existe todavía.
- Los siete juegos de maqueta. No entran en `games`, siguen con `seededScores()`, `best` y
  `plays` inventados, y su pantalla de juego sigue siendo el contador de la SPEC 05.
- La landing. El ticker de puntuaciones y el top 5 de `lib/home-data.ts` siguen siendo literales
  fijos.
- La fila `▸ TU MEJOR MARCA` de `/salon`, que hoy es un rango inventado a partir del nombre. Sin
  identidad real no hay forma de saber cuál de las filas anónimas es tuya.
- Rate limiting, antitrampas y verificación de la puntuación en servidor.
- Borrado o edición de puntuaciones, y cualquier pantalla de administración.
- Paginación e histórico. Se leen los diez o doce primeros y ya.
- Borrar `/debug/supabase`, que sigue siendo responsabilidad de la spec de autenticación.

---

## Modelo de datos

Dos tablas y una vista en el esquema `public`.

```sql
create table public.games (
  id          text primary key,            -- el slug: "asteroids". Mismo id que GAMES y GAME_ENGINES.
  title       text not null,
  created_at  timestamptz not null default now()
);

create table public.scores (
  id          uuid primary key default gen_random_uuid(),
  game_id     text not null references public.games(id) on delete cascade,
  player      text not null check (player ~ '^[A-Z]{1,3}$'),
  score       integer not null check (score >= 0 and score <= 1000000),
  created_at  timestamptz not null default now()
);

create index scores_game_score_idx on public.scores (game_id, score desc, created_at);

create view public.game_stats as
  select game_id,
         max(score)::integer as best,
         count(*)::integer   as plays
  from public.scores
  group by game_id;
```

`games.id` es texto y es el slug, no un uuid: ese mismo valor es ya el segmento de URL
(`/jugar/asteroids`) y la clave de `GAME_ENGINES` en `lib/games/registry.ts`. Un uuid obligaría a
resolver slug → uuid en cada escritura y en cada lectura a cambio de nada.

`best` y `plays` son una vista derivada de `scores`, no columnas de `games`: no pueden quedar
desincronizadas y no hay trigger que mantener. Un juego sin ninguna puntuación no aparece en la
vista, y eso se lee como `best: null`, `plays: 0`.

`player` son las iniciales del modal de fin de partida, en mayúsculas, de una a tres letras. No
hay `user_id`: las puntuaciones de esta spec son anónimas por diseño y la spec de autenticación
añadirá la columna.

**RLS**, activada en las dos tablas:

| Tabla | `select` | `insert` | `update` / `delete` |
| --- | --- | --- | --- |
| `games` | público (`anon`, `authenticated`) | ninguna política | ninguna política |
| `scores` | público | público, con los `check` de la tabla | ninguna política |

Sin política es negado: nadie puede editar ni borrar puntuaciones, ni dar de alta juegos, desde
las claves publicables. Los juegos se insertan desde la migración.

**Semilla**: una sola fila en `games` —`('asteroids', 'ASTEROIDS')`— y `scores` vacía. No se
siembran puntuaciones falsas: la tabla real existe precisamente para no tener más marcadores
inventados.

**Lo que desaparece**: `saveScore()` y `SavedScore` de `lib/session.tsx`, y la clave
`av_scores` de `localStorage`. `seededScores()` **se queda**, porque siete juegos de maqueta la
siguen necesitando.

---

## Plan de implementación

1. **Migración.** `supabase/migrations/<timestamp>_leaderboard.sql` con las dos tablas, el
   índice, la vista, `alter table … enable row level security`, las tres políticas y el `insert`
   de `asteroids`. Aplicarla con `apply_migration` del MCP.
   Comprobación: `list_tables` muestra `games` y `scores`; `select * from games` devuelve una fila.
2. **Tipos.** Regenerar `lib/supabase/database.types.ts` con `generate_typescript_types`,
   conservando el comentario de cabecera que explica que es un archivo generado.
   Comprobación: `Database["public"]["Tables"]["scores"]` existe y `npm run build` sigue limpio.
3. **`lib/scores.ts`.** Funciones de lectura sobre el cliente de servidor:
   - `topScores(gameId: string, limit = 12)` → filas ordenadas por `score desc, created_at asc`.
   - `gameStats(gameId: string)` → `{ best: number | null; plays: number }` desde `game_stats`.
   - `hasLeaderboard(gameId: string)` → si el juego tiene fila en `games`.
   Cada una devuelve el caso vacío en vez de lanzar cuando la consulta falla, y registra el error
   en consola: un fallo de red del leaderboard no puede tumbar la ficha de un juego.
   Comprobación: llamarlas desde `/juegos/asteroids` devuelve lista vacía y `plays: 0`.
4. **Server Action `guardarScore`.** Recibe `{ game, score, name }`. Valida: el juego tiene fila
   en `games`; `name` normalizado a mayúsculas y recortado a `^[A-Z]{1,3}$` —si queda vacío,
   `AAA`—; `score` entero entre 0 y 1.000.000. Inserta con el cliente de servidor y hace
   `revalidatePath("/salon")` y `revalidatePath(\`/juegos/${game}\`)`. Devuelve
   `{ ok: true }` o `{ ok: false, error: string }` con un mensaje legible en español; nunca lanza.
   Comprobación: insertar desde la acción y ver la fila con `execute_sql`.
5. **`components/game-player.tsx`.** `guardar()` pasa a ser asíncrono: llama a la Server Action
   dentro de un `useTransition`, deshabilita el botón mientras está en vuelo, muestra
   `GUARDADA` al terminar y el mensaje de error si `ok` es `false` —sin cerrar el modal y
   dejando reintentar—. Se elimina `saveScore` de la desestructuración de `useSession()`. El
   botón sólo aparece para juegos con leaderboard; para los siete de maqueta se mantiene el modal
   sin guardado. Nada del canvas, el HUD ni la pausa se toca.
6. **`lib/session.tsx`.** Se borran `saveScore`, el tipo `SavedScore`, `readScores` y la
   constante `SCORES_KEY`. `user`, `signIn`, `signOut` y `av_user` se quedan exactamente igual.
   Comprobación: `grep -r av_scores` no devuelve nada y `npm run build` está limpio.
7. **`app/juegos/[id]/page.tsx`.** Ya es Server Component asíncrono. Si `hasLeaderboard(id)`:
   `Partidas` y `Mejor global` salen de `gameStats`, y el panel lateral de `topScores(id, 10)`,
   con la fecha formateada desde `created_at`. Si no: exactamente lo de hoy. Con leaderboard
   pero sin filas, el panel muestra `AÚN NO HAY PUNTUACIONES — SÉ EL PRIMERO`, `Partidas` `0` y
   `Mejor global` `—`.
   Comprobación: `/juegos/asteroids` muestra el estado vacío y `/juegos/caida` no cambia.
8. **`app/salon/page.tsx` → Server Component.** El estado de la pestaña pasa de `useState` a
   `?juego=<id>` en `searchParams`; las pestañas son `<Link href={"/salon?juego=" + g.id}>` y la
   activa se marca comparando con el parámetro. Sin parámetro, `GAMES[0]`. Un `id` desconocido
   cae en `GAMES[0]` en vez de romper. Las filas vienen de `topScores(juego, 12)` cuando el juego
   tiene leaderboard, y de `seededScores()` cuando no.
   El podio indexa `rows[0..2]` sin comprobar nada: con menos de tres puntuaciones reales eso
   revienta, así que cada hueco del podio se pinta sólo si su fila existe y, con la tabla vacía,
   el bloque entero se sustituye por el mismo mensaje de estado vacío. La fila
   `▸ TU MEJOR MARCA` desaparece de los juegos con leaderboard —es un número inventado— y se
   conserva en los de maqueta.
   Comprobación: `/salon` y `/salon?juego=asteroids` responden 200, sin errores de hidratación y
   sin `useState` en el archivo.
9. **Recorrido completo.** Jugar una partida de Asteroids, guardar la puntuación con unas
   iniciales, y verla aparecer en `/salon?juego=asteroids` y en `/juegos/asteroids` sin recargar
   a mano.
10. **Repaso final.** `npm run lint` y `npm run build` limpios; `get_advisors` de Supabase sin
    avisos de seguridad sobre las tablas nuevas; documentar en `CLAUDE.md` que el esquema ya no
    está vacío y cómo regenerar los tipos.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `supabase/migrations/` contiene el `.sql` de esta spec y está commiteado.
- [ ] `list_tables` muestra `games` y `scores` con RLS activada en las dos.
- [ ] `select * from games` devuelve exactamente una fila: `asteroids` / `ASTEROIDS`.
- [ ] Un `insert` en `scores` con `game_id = 'caida'` falla por clave foránea.
- [ ] Un `insert` con `player = 'ab12'` o con `score = -5` falla por `check`.
- [ ] Un `update` o un `delete` sobre `scores` desde la clave publicable no afecta a ninguna fila.
- [ ] `lib/supabase/database.types.ts` incluye `games`, `scores` y `game_stats`.
- [ ] Con `scores` vacía, `/salon?juego=asteroids` muestra el estado vacío y **no** revienta al
      pintar el podio.
- [ ] Con `scores` vacía, `/juegos/asteroids` muestra `Partidas: 0`, `Mejor global: —` y el aviso
      de que aún no hay puntuaciones.
- [ ] Terminar una partida de Asteroids y pulsar `GUARDAR PUNTUACIÓN` inserta una fila en `scores`
      con `game_id = 'asteroids'`, la puntuación real y las iniciales escritas.
- [ ] Esa puntuación aparece en `/salon?juego=asteroids` y en el panel de `/juegos/asteroids` sin
      tener que recargar el navegador a mano.
- [ ] Las iniciales se guardan en mayúsculas aunque se escriban en minúsculas.
- [ ] Con el guardado fallando (URL de Supabase inválida), el modal muestra un mensaje legible en
      español, no cierra la partida y permite reintentar.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Las pestañas de `/salon` cambian la URL a `?juego=<id>`; recargar esa URL mantiene la
      pestaña, y `/salon?juego=inventado` cae en la primera pestaña sin error.
- [ ] `app/salon/page.tsx` ya no contiene `"use client"` ni `useState`.
- [ ] Los siete juegos sin fila en `games` muestran en `/salon` y en `/juegos/[id]` exactamente
      las mismas puntuaciones de `seededScores()` que antes.
- [ ] `grep -r "av_scores"` no devuelve ninguna coincidencia en el repositorio.
- [ ] `useSession()` sigue exponiendo `user`, `signIn` y `signOut`, y `/acceso` sigue funcionando
      igual que antes.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/salon`,
      `/juegos/asteroids` ni `/jugar/asteroids`.
- [ ] `get_advisors` no reporta tablas sin RLS ni políticas permisivas inesperadas.
- [ ] `lib/home-data.ts` no ha cambiado: la landing sigue con sus literales.

---

## Decisiones

- **Sí:** `games` contiene sólo los juegos jugables, hoy únicamente `asteroids`. Es la fuente de
  verdad de "qué juego puede recibir puntuaciones", y así la clave foránea de `scores` impide por
  construcción que se guarde una partida de un juego que no existe. Meter los ocho crearía siete
  leaderboards vacíos de juegos que nadie puede jugar.
- **No:** migrar el catálogo entero (`short`, `long`, `cover`, `cat`, `color`) a Supabase.
  `lib/games.ts` sigue siendo la ficha de escaparate: es copy y CSS, cambia en un commit y no
  gana nada por vivir en una tabla. La tabla guarda identidad, no maquetación.
- **Sí:** `games.id` textual con el slug. Ya es el segmento de URL y la clave de `GAME_ENGINES`;
  un uuid añadiría una traducción en cada consulta a cambio de ortodoxia.
- **Sí:** vista `game_stats` en vez de columnas `best`/`plays` en `games`. Estado derivado en vez
  de estado duplicado: sin trigger que mantener y sin posibilidad de que el contador mienta.
- **Sí:** escritura anónima con RLS abierta al `insert`. Sin autenticación, la alternativa es
  bloquear el leaderboard hasta que exista el login, y entonces Asteroids se queda otra spec más
  guardando en `localStorage`. Queda declarado: hoy cualquiera que conozca el endpoint puede
  inventarse una puntuación.
- **Sí:** Server Action en lugar del cliente de navegador. La validación vive en código revisable
  además de en los `check`, y `revalidatePath` refresca `/salon` y la ficha del juego sin
  inventar un mecanismo aparte.
- **Sí:** validación duplicada en la acción y en la base. Los `check` son la garantía real —una
  petición directa se los come igual—; la acción existe para devolver un mensaje en español en
  vez de un error de Postgres.
- **No:** rate limiting ni antitrampas. Requiere decidir almacenamiento del contador y qué se
  hace con las IP compartidas; es una spec propia, y sin auth la mitad de las defensas no se
  pueden montar.
- **Sí:** `/salon` a Server Component con `?juego=` en la URL. Las puntuaciones se leen en
  servidor, la pestaña es enlazable y compartible, y no hace falta un `useEffect` con spinner.
- **Sí:** `seededScores()` sobrevive. Siete juegos siguen siendo maqueta y una pantalla vacía en
  cada uno apagaría siete leaderboards que hoy demuestran el diseño.
- **Sí:** `scores` arranca vacía. Sembrar puntuaciones falsas en la tabla real haría imposible
  distinguir una partida de verdad de un dato de relleno, justo lo que esta spec viene a arreglar.
- **Sí:** borrar `saveScore` y `av_scores`. Escribir en los dos sitios obliga a decidir cuál gana
  al leer, y nadie lee `localStorage` después de esta spec.
- **No:** tocar `av_user` ni `useSession()`. La identidad es trabajo de la spec de autenticación;
  aquí el jugador son tres letras escritas en el modal.
- **No:** la fila `▸ TU MEJOR MARCA` sobre datos reales. Las puntuaciones son anónimas: no hay
  forma honesta de saber cuál es la del visitante hasta que haya sesión.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El podio de `/salon` indexa `rows[0]`, `rows[1]` y `rows[2]` sin comprobar y la tabla real empieza vacía. | El paso 8 obliga a pintar cada hueco sólo si su fila existe, y hay un criterio de aceptación con la tabla vacía. |
| RLS abierta al `insert` permite inflar el leaderboard con puntuaciones inventadas. | Los `check` acotan formato y rango, no hay `update` ni `delete`, y el riesgo queda declarado como aceptado hasta la spec de auth. |
| Convertir `/salon` en Server Component rompe la interactividad de las pestañas. | Las pestañas pasan a `<Link>` con `?juego=`; el criterio de aceptación exige que recargar la URL mantenga la pestaña. |
| El leaderboard cae y se lleva por delante la ficha del juego o el Salón. | Las funciones de `lib/scores.ts` devuelven el caso vacío ante un error en vez de lanzar. |
| Doble clic en `GUARDAR PUNTUACIÓN` inserta dos filas iguales. | El botón se deshabilita durante el `useTransition` y hay un criterio de aceptación para el doble clic. |
| `revalidatePath` no refresca y el jugador no ve su puntuación, así que la vuelve a guardar. | El paso 9 es un recorrido manual completo y hay un criterio que exige verla sin recargar a mano. |
| Los tipos generados quedan desfasados respecto al esquema y el `build` pasa con consultas rotas. | La regeneración es el paso 2 del plan y un criterio de aceptación comprueba que las tres entidades aparecen. |
| Quitar `saveScore` deja `lib/session.tsx` a medias o rompe `/acceso`. | Un criterio exige que `useSession()` siga exponiendo `user`, `signIn` y `signOut` y que `/acceso` funcione igual. |

---

## Lo que **no** entra en esta spec

- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.
- Los siete juegos de maqueta: ni en `games`, ni con puntuaciones reales.
- El ticker y el top 5 de la landing.
- Rate limiting, antitrampas y validación de la puntuación en servidor.
- Administración, edición y borrado de puntuaciones.
- Paginación e histórico del leaderboard.
- El borrado de `/debug/supabase`.

Cada una de ellas, si entra, va en su propia spec.
