# SPEC 17 — Juego SALTO SIMIO: promoción al catálogo y leaderboard

> **Estado:** Implementado
> **Depende de:** SPEC 05, SPEC 06, SPEC 11, SPEC 13, `specs/game-jam/salto-simio/01-clasico-vigas.md`
> **Fecha:** 2026-10-19
> **Objetivo:** Hacer jugable `salto-simio` en Arcade Vault conectando el motor ya escrito al registro, al catálogo con una portada propia y a la tabla `games` para que tenga leaderboard real.

---

## Por qué existe esta spec

La variante 01 de la game-jam `salto-simio` (`specs/game-jam/salto-simio/01-clasico-vigas.md`)
se implementó en la rama `spec-salto-simio-01-clasico-vigas`, pero sólo sus pasos 1–4: el motor
`lib/games/salto-simio/engine.ts`. Sus pasos 5–7 (registro, catálogo, leaderboard, repaso final)
estaban fuera de su alcance «hasta que la variante se promueva». Sin ellos el juego no aparece en
`/biblioteca` ni se puede jugar en `/jugar/salto-simio`.

Esta spec es esa promoción, igual que FROGGER salió de la game-jam `ranaria`. Ninguna de las tres
maquetas (`gloton`, `invasores`, `duelo-pixel`) es un plataformas, así que el juego entra con
**ficha nueva** y portada nueva, no renombrando una maqueta.

El diseño del juego —geometría, físicas, puntos, constantes— **no se reabre aquí**: lo fija la
spec de la game-jam y el motor ya lo implementa. Esta spec sólo lo conecta a la plataforma y
verifica en el navegador los criterios que la variante 01 no podía comprobar.

---

## Alcance

**Dentro:**

- Línea `salto-simio` en `GAME_ENGINES` (`lib/games/registry.ts`), con `touch` (SPEC 11).
- Ficha nueva en `lib/games.ts`: `id: "salto-simio"`, `title: "SALTO SIMIO"`, `cat: "ARCADE"`,
  `color: "magenta"`, `cover: "cover-simio"`.
- Portada CSS nueva `.cover-simio` en `app/globals.css`, diseñada con `/frontend-design`.
- Migración `supabase/migrations/20261019120000_juego_salto_simio.sql` con la fila en `games`,
  aplicada con `apply_migration`.
- Verificación en el navegador (Playwright) de los criterios de la variante 01 y de esta spec.
- Cierre: esta spec y la variante 01 a `Implementado`, `CLAUDE.md` al día.

**Fuera de alcance (para specs futuras):**

- Cambiar el diseño del juego o cualquier constante del motor.
- Skins `clasico` / `neon` / `retro` (`skins: true`): los aplica después el agente `skin-designer`.
- Verificación táctil a fondo en móvil y ajustes de CSS `pointer: coarse`: los hace después el
  agente `mobile-porter`. Aquí sólo se declara el campo `touch`.
- Revisión de rendimiento con `?fps=1` (agente `game-performance-booster`).
- Sonido, sprites, martillo, power-ups y todo lo de la variante 02 (`02-torre-ardiente.md`).
- Las maquetas `gloton`, `invasores` y `duelo-pixel`.

---

## Modelo de datos

**No se crea ninguna tabla, columna ni tipo.** `scores` y `game_stats` sirven al juego sin
tocarlas; el leaderboard se enciende con una fila en `games`. Insertar una fila no cambia el
esquema, así que `lib/supabase/database.types.ts` **no se regenera**.

El registro reutiliza `GameEngineEntry` tal como está:

```ts
"salto-simio": {
  create: createSaltoSimioGame,
  width: 800,
  height: 600,
  controls: "flechas o WASD para moverte y trepar, espacio para saltar",
  touch: { a: { code: "Space", label: "SALTO" } },
},
```

`touch` sin `repeat`: el motor lee teclas mantenidas, como Arkanoid. La cruceta envía las cuatro
flechas (correr y trepar); A es el salto. Sin botón B: no se pinta.

---

## Plan de implementación

### 1. Motor (ya hecho)

`lib/games/salto-simio/engine.ts`, commiteado en `spec-salto-simio-01-clasico-vigas`. Implementa
el contrato `GameFactory` con las constantes de la variante 01 **sin cambios**. Esta spec no lo
toca. Decisiones de implementación ya tomadas, que se dan por buenas:

- Constantes que la variante usa sin nombrar: `SPAWN_FIRST 1000` ms, `BARREL_SPAWN_X 130`,
  `LADDER_GRAB 10` px, y las medidas y colores de dibujo (`COLOR_*`, `*_H`).
- Integración del aire con velocidad media del paso: el salto mide 87,1 px a 60 fps.
- Al caer por el borde de una viga el héroe conserva `vx = dir · RUN_SPEED`; `x` se limita a la
  pantalla también en el aire.

Comprobación: ninguna (no hay cambios).

### 2. Registro

`lib/games/registry.ts`: import de `createSaltoSimioGame` y la entrada del modelo de datos.

Comprobación: `npm run build` limpio.

### 3. Ficha del catálogo y portada

- `lib/games.ts`: ficha nueva tras `frogger`, con `short` y `long` en español en el tono de las
  demás, `best: 0`, `plays: "0"` (sólo se leen sin leaderboard, y este juego lo tiene).
- `/frontend-design` antes de escribir CSS. `.cover-simio` junto a las demás portadas en
  `app/globals.css`, con el patrón de la casa: `background` de degradados más capas `::after` /
  `::before`. Motivo: vigas magenta inclinadas y barriles amarillos sobre fondo oscuro. Tokens
  nuevos, si hacen falta, en `@theme inline`.

Comprobación: `npm run build` limpio; `/biblioteca` muestra la tarjeta y `/jugar/salto-simio`
pinta el canvas real.

### 4. Leaderboard

`supabase/migrations/20261019120000_juego_salto_simio.sql`:

```sql
insert into public.games (id, title) values ('salto-simio', 'SALTO SIMIO');
```

Aplicada con `apply_migration` (nunca con `execute_sql`). `lib/scores.ts`, `app/jugar/actions.ts`,
`app/salon/page.tsx` y `app/juegos/[id]/page.tsx` no se tocan: el juego pasa a datos reales en
cuanto existe la fila. `scores` empieza vacía; no se siembran puntuaciones.

Comprobación: `select * from public.games` incluye `salto-simio`.

### 5. Verificación

`npm run lint` y `npm run build` limpios, `get_advisors` (security) sin avisos nuevos y recorrido
con Playwright de los criterios de aceptación.

### 6. Cierre

- Esta spec y `specs/game-jam/salto-simio/01-clasico-vigas.md` a `Implementado`.
- `CLAUDE.md`: seis juegos jugables, `salto-simio` en la lista de motores y en la tabla `games`
  (6 filas); `References/resources/resources/implemented-games.md` con la fila nueva.

---

## Criterios de aceptación

**Catálogo y plataforma**

- [ ] `/biblioteca` muestra la tarjeta `SALTO SIMIO` con la portada `cover-simio`, en `ARCADE`.
- [ ] `/juegos/salto-simio` muestra la ficha con su leaderboard (vacío al principio).
- [ ] `/jugar/salto-simio` muestra un canvas de 800×600 con seis vigas, nueve escaleras, simio,
      rescate y barril de aceite, no la `.game-arena`.
- [ ] El `aria-label` del canvas describe los controles del registro.

**Juego (de la variante 01)**

- [ ] El héroe arranca en `(60, G0)` y no se mueve hasta pulsar una tecla.
- [ ] Flechas y WASD lo mueven; izquierda y derecha a la vez lo dejan quieto.
- [ ] Espacio salta ≈ 87 px: no basta para subir a la viga siguiente.
- [ ] En el aire no cambia de dirección; Espacio en el aire no encola otro salto.
- [ ] Sube y baja escaleras; en la escalera no se mueve en horizontal ni salta.
- [ ] Sigue la pendiente sin «saltitos»; caer por el borde de una viga no lo mata.
- [ ] Los barriles nacen en la cima cada 3 s en nivel 1, recorren G5 → G0 y desaparecen en el
      barril de aceite.
- [ ] Tocar un barril muestra la muerte de 900 ms y descuenta una vida sin tocar `score` ni `level`.
- [ ] Saltar sobre un barril suma 100 una sola vez por barril.
- [ ] La barra de bono baja; al llegar a 0 cuesta una vida.
- [ ] Llegar a la meta suma `1000 + bono` y sube el nivel en el HUD.
- [ ] El canvas no dibuja puntos, vidas ni nivel como texto, sólo la barra de bono.

**Plataforma (SPEC 05 / 06)**

- [ ] `PAUSA`, `P` y `Escape` congelan héroe, barriles y bono; `REANUDAR` sigue sin saltos.
- [ ] Con el canvas enfocado, flechas y Espacio no hacen scroll.
- [ ] Perder el foco con una flecha pulsada no deja al héroe corriendo solo.
- [ ] Al perder la tercera vida se abre `FIN DEL JUEGO` una sola vez con la puntuación real.
- [ ] Escribir `W`, `A`, `S`, `D` o espacio en las iniciales no mueve ni reinicia el juego.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila con `game_id = 'salto-simio'` (comprobada con
      `execute_sql`) que aparece en `/salon?juego=salto-simio` y en `/juegos/salto-simio` sin recargar.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Navegar a `/biblioteca` y volver no duplica el bucle.
- [ ] Consola sin errores ni avisos de hidratación en `/jugar/salto-simio`.

**Móvil (SPEC 11, comprobación mínima)**

- [ ] Con `pointer: coarse` y en vertical se ve el mando con cruceta y un solo botón `SALTO`.

**Regresión y calidad**

- [ ] `/jugar/asteroids` y `/jugar/frogger` se juegan igual que antes; `/jugar/gloton` sigue en maqueta.
- [ ] `npm run lint` y `npm run build` limpios.
- [ ] `get_advisors` (security) no reporta avisos nuevos (sólo el aceptado de _Leaked password protection_).

---

## Decisiones

- **Sí:** ficha nueva en vez de renombrar una maqueta: ninguna de las tres es un plataformas.
- **Sí:** `color: "magenta"`, el de las vigas del motor; hoy sólo lo usa TETRIS.
- **Sí:** portada CSS nueva `cover-simio` con `/frontend-design`, como `cover-frogger`.
- **Sí:** `best: 0` y `plays: "0"`: con leaderboard no se leen, y no se inventan cifras.
- **Sí:** `touch` con un solo botón A (`SALTO`), sin `repeat`.
- **No:** skins, verificación táctil completa ni rendimiento: cada uno tiene su agente.
- **No:** regenerar tipos de Supabase: una fila no cambia el esquema.
- **No:** sembrar puntuaciones.

---

## Riesgos

| Riesgo                                                                                                 | Mitigación                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| El `id` `salto-simio` lleva guion y no coincide en algún sitio (URL, registro, `games`, acción).       | Cadena idéntica en las cuatro piezas; `frogger` y `duelo-pixel` ya prueban ids con y sin guion en rutas. Clave del registro entre comillas.   |
| La migración se aplica con `execute_sql` y el historial remoto no coincide con `supabase/migrations/`. | Sólo `apply_migration`; comprobar con `list_migrations`.                                                                                      |
| Un criterio de juego falla al verificarse en el navegador (p. ej. el bono, la muerte por caída).       | Se reporta y se corrige en el motor sin tocar constantes; si exige cambiar un número, va a la spec de la game-jam, no al código por sorpresa. |
| La portada nueva rompe la cuadrícula de la biblioteca o el modo claro.                                 | Mismo patrón y medidas que las demás `cover-*`; revisión visual en `/biblioteca` en ambos temas.                                              |
| Espacio llega al motor mientras se escriben las iniciales.                                             | Bucle parado con el modal abierto y listeners en el canvas (ya en el motor).                                                                  |

---

## Lo que **no** entra en esta spec

- Cambios de diseño o de constantes del motor.
- Skins, controles táctiles más allá del campo `touch`, rendimiento.
- Variante 02 de `salto-simio` y las maquetas restantes.
- Autenticación y `scores.user_id` más allá de lo que ya hace `guardarScore`.

Cada una de ellas, si entra, va en su propia spec.
