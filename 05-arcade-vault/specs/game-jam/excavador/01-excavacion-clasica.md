# SPEC — EXCAVADOR: excavación clásica

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-09-30
> **Objetivo:** Diseñar un port fiel al Dig Dug de 1982 — un minero que cava túneles en un
> subsuelo por capas, hincha con una bomba de aire a los monstruos que lo persiguen hasta
> reventarlos y aplasta a otros dejando caer rocas — como ficha nueva `excavador` en categoría
> ARCADE, con motor real y leaderboard en Supabase desde el primer día.

---

## Por qué existe esta spec

El catálogo real tiene tres juegos de reflejos sobre un campo abierto (`asteroids`, `arkanoid`,
`snake`) y uno de piezas (`caida`). Ninguno tiene **terreno que el jugador crea al moverse**: en
todos, el escenario es fijo o lo destruyen los disparos. Dig Dug convierte el movimiento en la
herramienta — cada celda que cruzas queda vaciada para siempre y esa red de túneles decide por
dónde pueden llegar los enemigos, dónde caen las rocas y qué rutas de huida tienes. Es la
mecánica de "excavación/creación de terreno" que `game-suggestions-todo.md` señala como hueco
del catálogo, y encaja en ARCADE sin duplicar a `snake` (recorrido en grilla, pero sin terreno)
ni a `gloton` (laberinto fijo).

Como con Snake (SPEC 10), **no hay código de referencia**: no existe ninguna carpeta
`References/.../dig-dug` en el repositorio, sólo la mención en `game-suggestions-todo.md`. Las
constantes de este documento son el diseño en sí, no el ajuste de un port; cambiarlas durante la
implementación es rediseñar, no implementar. Igual que Snake, el motor dibuja todo con
primitivas de canvas — rectángulos y arcos — sin spritesheet externo.

Esta variante es la lectura **mínima y fiel** del arcade original: minero, dos monstruos
(Pooka y Fygar), bomba de aire y rocas. La segunda variante (`02-descenso-profundo.md`) cambia el
objetivo (descender en vez de limpiar la pantalla), añade un depósito de aire finito, gemas y
bolsas de magma; esta se queda deliberadamente en el conjunto más pequeño que ya es
reconociblemente Dig Dug.

---

## Alcance

**Dentro:**

- `lib/games/excavador/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createExcavadorGame`, sin assets externos.
- Mundo lógico **800×600**: grilla de 32×24 celdas de 25 px. Las filas 0–1 son el cielo (sin
  tierra, sin enemigos, con la salida); las filas 2–23 son el subsuelo, en cuatro capas de
  color con puntuación creciente.
- Terreno como grilla de booleanos `dug`: el minero vacía toda celda que ocupa. No se rellena.
- Minero con movimiento por ejes (nunca diagonal), 4 direcciones, con tolerancia de giro a
  centro de celda.
- Bomba de aire: arpón de alcance limitado que se engancha al primer monstruo en línea recta
  por túnel; cada pulsación de disparo hincha un estado; el 4.º lo revienta.
- Dos monstruos: **Pooka** (persigue por túneles y, a intervalos, atraviesa tierra en modo
  fantasma) y **Fygar** (igual, más un aliento de fuego horizontal telegrafiado).
- Rocas: caen al quedarse sin tierra debajo, aplastan a monstruos y al minero, y se rompen al
  aterrizar.
- Ronda terminada al eliminar a todos los monstruos; el último superviviente intenta huir por
  el cielo.
- Progresión por ronda: más monstruos, más rápidos, más rocas.
- 3 vidas y vida extra por puntos.
- Nueva ficha `excavador` en `lib/games.ts` (categoría `ARCADE`) y clase de portada
  `cover-excavador` en `app/globals.css`.
- Una línea `excavador` en `GAME_ENGINES` (`lib/games/registry.ts`).
- Migración `insert into public.games (id, title) values ('excavador', 'EXCAVADOR')` y su
  aplicación.

**Fuera de alcance (para specs futuras o para la variante `02-descenso-profundo.md`):**

- Depósito de aire finito, gemas, magma, mapa con scroll vertical.
- Vegetales bonus que aparecen a mitad de ronda.
- Sonido y música.
- Controles táctiles.
- Skins (`clasico`/`neon`/`retro`).
- Modo de dos jugadores.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla nueva, ni columna, ni tipo de plataforma.** `GameEngineEntry` ya
existe desde la SPEC 08, `scores` y `game_stats` sirven a este juego sin tocarlas, y el
leaderboard se enciende con una fila en `games`.

Tipos locales del motor, sin exportar:

```ts
type Dir = "up" | "down" | "left" | "right";
type Cell = { col: number; row: number };
type Miner = { x: number; y: number; dir: Dir; facing: Dir; state: "walk" | "pumping" | "dying" };
type Monster = {
  kind: "pooka" | "fygar";
  x: number; y: number; dir: Dir;
  mode: "walk" | "ghost" | "inflated" | "flee" | "crushed";
  inflate: number;        // 0..4; 4 = revienta
  modeTimer: number;      // ms restantes del modo actual
  ghostIn: number;        // ms hasta el próximo modo fantasma
  fire: { phase: "idle" | "telegraph" | "burn"; timer: number; cooldown: number } | null; // sólo fygar
};
type Rock = { col: number; row: number; state: "idle" | "wobble" | "fall" | "broken"; timer: number; y: number; crushed: number };
type Harpoon = { dir: Dir; len: number; target: Monster | null } | null;
```

Estado en la clausura de `createExcavadorGame`:

- `dug: boolean[]` — array plano de `COLS * ROWS`; `índice = row * COLS + col`. Las filas 0–1
  son `true` siempre.
- `miner: Miner`, `harpoon: Harpoon`, `monsters: Monster[]`, `rocks: Rock[]`.
- `score`, `lives`, `level`, `nextExtraLife` (umbral de puntos de la siguiente vida extra).
- `state: "playing" | "respawn" | "roundClear" | "gameover"`, `stateTimer` (ms).
- `pumpCooldown` (ms), `deflateAccum` (ms).
- Bucle: `rafId`, `lastTime`, `destroyed`. Entrada: `keys: Set<string>`.

**Grilla y capas**, mundo lógico 800×600:

```
COLS 32 · ROWS 24 · CELL 25 px
CIELO: filas 0..1 · y 0..50 — salida de los monstruos, sin tierra
CAPA 1: filas 2..6   (5 filas) · ámbar     · Pooka 200 · Fygar 200
CAPA 2: filas 7..11  (5 filas) · naranja   · Pooka 300 · Fygar 300
CAPA 3: filas 12..17 (6 filas) · marrón    · Pooka 400 · Fygar 400
CAPA 4: filas 18..23 (6 filas) · rojo oscuro · Pooka 500 · Fygar 500
```

---

## Plan de implementación

### 1. Constantes y generación del nivel

`lib/games/excavador/engine.ts`, primera parte. Constantes de diseño:

```
W 800 · H 600 · CELL 25 · COLS 32 · ROWS 24
START_CELL (16, 11) · START_LIVES 3 · EXTRA_LIFE_FIRST 20000 · EXTRA_LIFE_EVERY 40000
MINER_SPEED 100 px/s · TURN_TOLERANCE 6 px · DT_MAX 50 ms
MONSTERS(level) = min(8, 3 + floor((level - 1) / 2))   (Pooka y Fygar alternados, empieza Pooka)
SPEED_MULT(level) = min(1.6, 1 + 0.06 * (level - 1))
POOKA_SPEED 70 px/s · FYGAR_SPEED 62 px/s · GHOST_SPEED_FACTOR 0.6 (sobre la velocidad del monstruo)
ROCKS(level) = min(5, 2 + floor((level - 1) / 3))
POCKET_LEN 3 (celdas horizontales pre-excavadas por monstruo) · POCKET_MIN_DIST 6 celdas entre bolsas
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

`buildLevel(level)`:

- `dug` empieza con las filas 0–1 en `true` y todo lo demás en `false`.
- Pozo inicial: la columna 16 de las filas 2..11 y la celda de salida quedan vaciadas, así el
  minero baja desde el cielo hasta `START_CELL`.
- Cada monstruo nace en el centro de una bolsa horizontal de `POCKET_LEN` celdas, sembrada en
  filas 4..22 con distancia mínima `POCKET_MIN_DIST` entre bolsas y al pozo. Las bolsas quedan
  aisladas: el monstruo tiene que cavar el modo fantasma para salir (ver paso 3).
- Rocas: `ROCKS(level)` celdas de tierra en filas 3..20 que **no** tengan una celda vaciada
  inmediatamente debajo (si no, caerían en el primer frame) ni estén en la columna 16.

Comprobación: `npm run build` limpio.

### 2. Minero: movimiento, excavación y giro

- Cada frame, la dirección deseada es la tecla más recientemente pulsada de `keys` (flechas o
  WASD). Sin tecla, el minero se detiene.
- Movimiento por ejes: el minero sólo se mueve sobre una fila o una columna de celdas. Para
  cambiar de eje, su posición en el eje perpendicular debe estar a ≤ `TURN_TOLERANCE` px del
  centro de celda; entonces se le ajusta ("snap") al centro. Invertir el sentido en el mismo eje
  es siempre inmediato.
- Toda celda cuyo centro cruza el minero se marca `dug = true`. Cavar no ralentiza.
- Los límites son el mundo: no puede salir de `0..W` / `0..H`. Las filas 0–1 son transitables
  (cielo).
- `facing` guarda la última dirección con movimiento; es hacia donde dispara el arpón.

Comprobación: `npm run build` limpio; el minero deja túnel visible al moverse.

### 3. Monstruos: túneles, modo fantasma y huida

- Modo `walk`: el monstruo se mueve por celdas vaciadas hacia el minero. Elige dirección en cada
  centro de celda por distancia de Manhattan al minero entre las celdas adyacentes vaciadas,
  sin dar la vuelta salvo callejón sin salida. Velocidad = base × `SPEED_MULT(level)`.
- Modo `ghost`: cuando `ghostIn` llega a 0 el monstruo pasa a `ghost` durante `GHOST_DURATION`
  y se mueve en línea recta hacia el minero atravesando tierra a `GHOST_SPEED_FACTOR` de su
  velocidad; al terminar el modo, se solidifica y vacía las celdas que ocupa. Se dibuja sólo
  como dos ojos.
  ```
  GHOST_IN_MIN 6000 ms · GHOST_IN_MAX 10000 ms (aleatorio uniforme, recalculado al terminar)
  GHOST_DURATION 2500 ms
  ```
  Un monstruo en `ghost` **no puede** ser enganchado por el arpón.
- Contacto: si el centro de un monstruo en `walk` o `ghost` queda a < 0.6 × `CELL` del minero,
  el minero muere.
- Modo `flee`: cuando queda **un solo** monstruo vivo, pasa a `flee`: sube hacia el cielo por el
  camino vaciado (o en modo fantasma si no hay) a 1.3 × su velocidad. Si sale por la fila 0, la
  ronda termina **sin** puntos por él (`ESCAPE`).
- Fygar en `walk` con el minero en su misma fila, a ≤ 4 celdas y con camino libre entre ambos:
  pasa a `telegraph` (parpadea, 600 ms), luego `burn` (fuego de 3 celdas hacia el minero,
  500 ms) y luego `cooldown`.
  ```
  FYGAR_TELEGRAPH 600 ms · FYGAR_BURN 500 ms · FYGAR_COOLDOWN 3000 ms · FIRE_RANGE 3 celdas
  ```
  El fuego atraviesa celdas vaciadas, no tierra, y mata al minero si comparte celda con él.

Comprobación: `npm run build` limpio; un monstruo aislado en su bolsa acaba llegando al minero
en modo fantasma.

### 4. Bomba de aire

- `Space` dispara el arpón en la dirección `facing` si no hay ya uno activo y `pumpCooldown` es 0.
- El arpón crece a `HARPOON_SPEED` hasta `HARPOON_RANGE`; se detiene al chocar con tierra
  (celda no vaciada) y desaparece.
- Si en su recorrido cruza el centro de un monstruo en `walk`, se engancha: `target = monstruo`,
  el monstruo pasa a `inflated` (quieto) y el minero a `pumping` (quieto).
- Con el arpón enganchado, **cada pulsación** de `Space` (`keydown` no repetido) suma 1 a
  `inflate`. Al llegar a `INFLATE_MAX` el monstruo revienta y se suman puntos.
- Sin pulsar durante `DEFLATE_EVERY` ms, `inflate` baja en 1; al llegar a 0 el monstruo se
  libera y vuelve a `walk`, y el arpón se suelta.
- Si el minero se aleja más de `HARPOON_RANGE + CELL` px del monstruo enganchado, el arpón se
  rompe (el monstruo se desinfla igual que arriba).
  ```
  HARPOON_SPEED 400 px/s · HARPOON_RANGE 75 px (3 celdas) · PUMP_COOLDOWN 250 ms tras soltar
  INFLATE_MAX 4 · DEFLATE_EVERY 800 ms
  ```
- Puntos al reventar: valor de la capa donde estaba (200/300/400/500). Fygar reventado estando
  en la misma fila que el minero: ×2.

Comprobación: `npm run build` limpio; cuatro pulsaciones seguidas revientan un Pooka en línea.

### 5. Rocas

- Una roca en `idle` pasa a `wobble` cuando la celda inmediatamente debajo queda vaciada (por
  el minero, por un monstruo solidificado o por otra roca rota). `wobble` dura `ROCK_WOBBLE` ms.
- Luego cae (`fall`) a `ROCK_FALL_SPEED` hasta que la celda de debajo es tierra o el fondo del
  mundo; al aterrizar pasa a `broken` y desaparece tras `ROCK_BROKEN_MS`.
- Durante `fall`, todo monstruo cuyo centro cae dentro de su celda pasa a `crushed`. Si la roca
  aplasta al minero, este muere.
- Una roca que cae **no** vacía las celdas que atraviesa (ya estaban vaciadas) ni las de su
  aterrizaje; la tierra bajo ella se mantiene.
  ```
  ROCK_WOBBLE 500 ms · ROCK_FALL_SPEED 300 px/s · ROCK_BROKEN_MS 600 ms
  ROCK_CRUSH_POINTS = [1000, 2500, 4000, 6000, 8000, 10000, 12000, 15000]
    (índice = monstruos aplastados por esa misma roca - 1; el total se suma al aterrizar)
  ```
- Un monstruo `inflated` que queda bajo la roca también cuenta como aplastado.

Comprobación: `npm run build` limpio; cavar bajo una roca la hace caer tras el temblor.

### 6. Vidas, rondas y avisos

- Muerte del minero (contacto, fuego o roca): estado `respawn` de `RESPAWN_MS`; se resta una
  vida; si quedan, el minero vuelve a `START_CELL`, los monstruos vivos vuelven a `walk` en su
  posición actual y las rocas conservan su estado. Con 0 vidas: `gameover`.
- Ronda terminada (0 monstruos vivos o `ESCAPE`): estado `roundClear` de `ROUND_CLEAR_MS`;
  `level++`; `buildLevel(level)` nuevo.
- Vida extra al cruzar `nextExtraLife`: `lives++` (máximo 5), `nextExtraLife += EXTRA_LIFE_EVERY`.
  ```
  RESPAWN_MS 1500 · ROUND_CLEAR_MS 1200 · LIVES_MAX 5
  ```
- `emit()` con `lastScore` / `lastLives` / `lastLevel`; los avisos se emiten sólo al cambiar.
- Game over: `stopLoop()` y `onGameOver(score)` una sola vez. `resume()` es no-op después.

### 7. Bucle, entrada y dibujo

- `dt` capado a `DT_MAX`; `lastTime = null` al reanudar.
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`, `KeyD`,
  `Space`. `preventDefault()` solo para esas.
- Listeners `keydown` / `keyup` / `blur` sobre el canvas, nunca sobre `window`. `P` y `Escape`
  no llegan. `blur` vacía `keys`.
- `draw()`: cielo azul en filas 0–1; cuatro capas de tierra con sus colores; celdas `dug` en
  negro; rocas gris con grieta; minero, Pooka (círculo rojo con gafas), Fygar (verde con cresta)
  con rectángulos/arcos; monstruo inflado escalado 1 + 0.25 × `inflate`; arpón como línea con
  punta; fuego como tres rectángulos naranja.
- Sin puntuación, ronda ni vidas dibujadas en el canvas. Mientras `state = "roundClear"` se
  permite el rótulo `RONDA n` dentro del canvas, porque es estado propio del juego.
- `destroy()` cancela el frame, quita los listeners y es idempotente.
- `initGame(); draw();` antes de devolver.

Comprobación: `npm run build` limpio.

### 8. Catálogo: nueva ficha `excavador`

`lib/games.ts`, entrada nueva:

```ts
{
  id: "excavador",
  title: "EXCAVADOR",
  short: "Cava túneles, hincha monstruos y aplástalos con rocas.",
  long: "Abre galerías en un subsuelo de cuatro capas mientras Pookas y Fygars te cazan por los túneles. Hincha a los monstruos con tu bomba de aire hasta reventarlos, o deja caer una roca en el momento justo. Cuanto más hondo revientes, más puntos.",
  cat: "ARCADE",
  cover: "cover-excavador",
  color: "yellow",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `cover-excavador` con la misma técnica que las demás portadas
(degradados CSS, sin imagen): franjas horizontales de las cuatro capas y una galería vaciada en
zigzag.

Comprobación: `/biblioteca` y `/juegos/excavador` muestran la ficha con su portada.

### 9. Registrar el motor

`lib/games/registry.ts`:
`excavador: { create: createExcavadorGame, width: 800, height: 600, controls: "flechas o WASD para cavar y moverte · ESPACIO para bombear aire" }`.

Comprobación: `/jugar/excavador` pinta el canvas real, no la `.game-arena`.

### 10. Leaderboard

`supabase/migrations/<timestamp>_juego_excavador.sql`, con timestamp posterior a la última
migración existente:

```sql
insert into public.games (id, title) values ('excavador', 'EXCAVADOR');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. **Los tipos no se
regeneran.**

Comprobación: `select id from public.games` incluye `excavador`.

### 11. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido manual
de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/excavador` muestra un canvas de 800×600 con cielo, cuatro capas de tierra, minero y monstruos, no la `.game-arena`.
- [ ] El minero empieza en la celda (16, 11) con un pozo vaciado hasta el cielo y no se mueve hasta pulsar una dirección.
- [ ] Flechas y WASD mueven al minero por ejes; nunca en diagonal.
- [ ] Al moverse, el minero deja una celda negra (túnel) por cada celda que cruza, y los túneles no se rellenan.
- [ ] Girar a 90° a menos de 6 px del centro de celda se aplica con ajuste al centro; girar más lejos espera al siguiente centro.
- [ ] `ESPACIO` lanza el arpón en la dirección de la última marcha y se detiene a 3 celdas o al chocar con tierra.
- [ ] Un arpón que alcanza a un monstruo en `walk` lo engancha y deja quietos a ambos.
- [ ] Cuatro pulsaciones de `ESPACIO` seguidas revientan al monstruo enganchado y suman los puntos de su capa (200/300/400/500).
- [ ] Dejar de pulsar 800 ms desinfla un estado; sin pulsar durante 3.2 s el monstruo se libera.
- [ ] Reventar un Fygar en la misma fila que el minero suma el doble.
- [ ] Un monstruo en modo fantasma se ve como dos ojos, atraviesa tierra hacia el minero y no puede ser enganchado.
- [ ] Al solidificarse, el monstruo deja las celdas que ocupa vaciadas.
- [ ] Un Fygar en la misma fila, a ≤ 4 celdas y con camino libre, parpadea 600 ms y lanza fuego de 3 celdas; el fuego mata al minero pero no atraviesa tierra.
- [ ] Una roca tiembla 500 ms cuando la celda de debajo queda vaciada, y luego cae.
- [ ] Una roca que cae sobre un monstruo lo aplasta y suma 1000; dos monstruos por la misma roca suman 2500.
- [ ] Una roca que cae sobre el minero lo mata; una roca aterrizada se rompe y desaparece.
- [ ] Ningún nivel generado tiene una roca con una celda vaciada justo debajo al empezar.
- [ ] Al quedar un solo monstruo, huye hacia el cielo y, si sale, la ronda termina sin puntos por él.
- [ ] Al terminar la ronda, la siguiente tiene más monstruos o más velocidad según la fórmula del paso 1 y el HUD pasa a nivel 02.
- [ ] El HUD muestra 3 vidas al inicio; cada muerte resta una y el minero reaparece en la celda (16, 11).
- [ ] Cruzar 20 000 puntos suma una vida, con tope de 5.
- [ ] Con 0 vidas se abre el modal `FIN DEL JUEGO` con la puntuación real, una sola vez.
- [ ] El canvas no dibuja puntos ni vidas, ni ningún overlay de game over.
- [ ] El botón `PAUSA` congela el juego y `REANUDAR` lo reanuda sin saltos; `P` y `Escape` hacen lo mismo.
- [ ] Con el canvas enfocado, las flechas y `ESPACIO` no hacen scroll de la página.
- [ ] Escribir `W`, `A`, `S`, `D` o espacio en el campo de iniciales no mueve ni dispara.
- [ ] `JUGAR DE NUEVO` reinicia a nivel 1, 0 puntos, 3 vidas y terreno intacto sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'excavador'`, y no duplica al pulsarlo dos veces.
- [ ] Esa puntuación aparece en `/salon?juego=excavador` y en `/juegos/excavador` sin recargar a mano.
- [ ] Con `scores` vacía para este juego, `/salon?juego=excavador` muestra el estado vacío.
- [ ] Navegar de `/jugar/excavador` a `/biblioteca` y volver no duplica el bucle.
- [ ] Dejar la pestaña en segundo plano y volver no teletransporta a monstruos ni al minero.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid` y `/jugar/snake` se juegan igual que antes.
- [ ] Los juegos sin motor se comportan igual que antes.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/excavador`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** id `excavador` y título `EXCAVADOR`, no el nombre comercial del arcade original.
  Sigue el patrón de `ciempies` y `caida`.
- **Sí:** mundo 800×600 con grilla 32×24 de 25 px. Mismo marco 4/3 y misma grilla que Snake.
- **Sí:** terreno como grilla de booleanos que sólo pasa de tierra a vaciado. Es lo que hace que
  el nivel se sienta modelado por el jugador y mantiene la lógica de rocas trivial.
- **Sí:** movimiento por ejes con tolerancia de giro. Es lo que permite girar "a la primera"
  sin que el minero se atasque en una esquina.
- **Sí:** una pulsación = un bombeo. Es la mecánica que da el ritmo tenso del original.
- **Sí:** modo fantasma periódico en ambos monstruos. Sin él, un monstruo encerrado en su bolsa
  nunca llegaría al minero y la ronda se estancaría.
- **Sí:** el último monstruo huye. Evita rondas eternas cuando el jugador no quiere acercarse.
- **No:** vegetales bonus, ni scroll, ni depósito de aire. Es la otra variante.
- **No:** sonido. No hay assets de audio.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo                                                                                    | Mitigación                                                                                       |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Sin original, las constantes se ajustan «a ojo» durante la implementación.                | El paso 1 las fija y las declara fuera de alcance.                                               |
| Giros en esquinas que no enganchan (el minero pasa de largo un cruce).                    | `TURN_TOLERANCE` de 6 px con ajuste al centro; criterio de aceptación explícito.                |
| Rocas colocadas que caen en el primer frame o bloquean el pozo inicial.                   | Regla de generación del paso 1: nunca sobre celdas vaciadas ni en la columna 16.                |
| El modo fantasma hace injugable la ronda (monstruos siempre encima).                      | Intervalo 6–10 s, duración 2.5 s y velocidad al 60 %; el arpón sólo falla mientras dura.        |
| Cadena de aplastamientos en el mismo frame puntúa de más o dos veces.                     | Cada roca acumula `crushed` y suma una sola vez al aterrizar; un monstruo `crushed` sale del bucle. |
| Pestaña en segundo plano: monstruos y rocas avanzan de golpe al volver.                   | `dt` capado a 50 ms y `lastTime = null` al reanudar.                                             |
| `Space` llega al motor mientras se escriben iniciales.                                    | Bucle parado con el modal abierto y listeners en el canvas, no en `window`.                     |
| Un solo monstruo que huye y queda atrapado sin camino ni fantasma nunca sale.             | `flee` fuerza el modo fantasma si no hay camino vaciado hacia la fila 1.                        |

---

## Lo que **no** entra en esta spec

- Depósito de aire, gemas, magma y scroll vertical (variante `02-descenso-profundo.md`).
- Vegetales bonus.
- Sonido.
- Controles táctiles.
- Skins.
- Modo de dos jugadores.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
