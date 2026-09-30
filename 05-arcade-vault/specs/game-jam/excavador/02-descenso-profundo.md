# SPEC — EXCAVADOR: descenso profundo

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-09-30
> **Objetivo:** Diseñar una reinterpretación de Dig Dug como carrera hacia el fondo — un minero
> que cava hacia abajo por un pozo de 60 filas con scroll vertical, gestiona un depósito de aire
> finito para su bomba, recoge gemas enterradas y esquiva monstruos, rocas y bolsas de magma —
> como ficha nueva `excavador` en categoría ARCADE, con motor real y leaderboard en Supabase
> desde el primer día.

---

## Por qué existe esta spec

La variante `01-excavacion-clasica.md` es la lectura fiel del arcade: una pantalla, limpiar de
monstruos, repetir. Esta variante conserva el núcleo — el minero cava, la bomba hincha, las rocas
aplastan — pero cambia **el objetivo y la presión**: ya no se gana eliminando enemigos, se gana
**llegando abajo**. Los monstruos pasan de ser el objetivo a ser el obstáculo, y la bomba deja
de ser un recurso ilimitado: el aire se acaba, así que cada bombeo es una decisión (¿gasto aire
en este Pooka o rodeo por otro túnel?).

Tres capas nuevas hacen la partida distinta a la clásica, no una versión con más números:

- **Scroll vertical y objetivo de profundidad.** El mundo es un pozo de 60 filas; la cámara sigue
  al minero. La puntuación premia la profundidad máxima alcanzada.
- **Depósito de aire.** La bomba consume aire; se recarga en la superficie y en bolsas de aire
  enterradas. Sin aire no se puede hinchar a nadie.
- **Gemas y magma.** Las gemas son puntos escondidos en la tierra que invitan a desviarse; el
  magma es un peligro del subsuelo profundo que fluye por los túneles que tú mismo abres.

Como con Snake (SPEC 10), **no hay código de referencia**: las constantes de este documento son
el diseño en sí; cambiarlas durante la implementación es rediseñar. El motor dibuja todo con
primitivas de canvas, sin spritesheet externo.

---

## Alcance

**Dentro:**

- `lib/games/excavador/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createExcavadorGame`, sin assets externos.
- Mundo lógico visible **800×600** (canvas). Mapa completo de **32×60** celdas de 25 px
  (800×1500). Las filas 0–1 son el cielo; las filas 2–59 son el subsuelo, en cinco estratos.
- Cámara vertical que sigue al minero con suavizado, limitada a los bordes del mapa.
- Terreno como grilla `dug`: el minero vacía toda celda que ocupa.
- Minero con movimiento por ejes (4 direcciones) y tolerancia de giro a centro de celda.
- Bomba de aire con **depósito** (`air`): el arpón y cada bombeo cuestan aire; se recarga en el
  cielo y en bolsas de aire enterradas.
- Gemas de tres valores enterradas en la tierra, recogidas al cavar su celda.
- Monstruos **Pooka** y **Fygar** (con modo fantasma y, el Fygar, aliento de fuego), sembrados en
  bolsas por estrato; nuevos monstruos entran por el cielo mientras dura la partida.
- Rocas que aplastan (monstruos y minero), con temblor previo.
- **Magma**: bolsas en los estratos 4 y 5 que, al cavarlas, liberan lava que fluye por los túneles
  vaciados y mata al contacto.
- Objetivo de nivel: alcanzar la fila de salida (fila 59). Nivel siguiente = mapa nuevo, más
  hondo en dificultad, no en filas.
- 3 vidas; al morir se reaparece en el último punto de control.
- Nueva ficha `excavador` en `lib/games.ts` (categoría `ARCADE`) y clase de portada
  `cover-excavador` en `app/globals.css`.
- Una línea `excavador` en `GAME_ENGINES` (`lib/games/registry.ts`).
- Migración `insert into public.games (id, title) values ('excavador', 'EXCAVADOR')` y su
  aplicación.

**Fuera de alcance (para specs futuras o para la variante `01-excavacion-clasica.md`):**

- Modo "limpiar la pantalla" y huida del último monstruo.
- Vegetales bonus.
- Tienda o mejoras permanentes entre niveles.
- Sonido y música.
- Controles táctiles.
- Skins (`clasico`/`neon`/`retro`).
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla nueva, ni columna, ni tipo de plataforma.** `GameEngineEntry` ya
existe desde la SPEC 08, `scores` y `game_stats` sirven a este juego sin tocarlas, y el
leaderboard se enciende con una fila en `games`.

Tipos locales del motor, sin exportar:

```ts
type Dir = "up" | "down" | "left" | "right";
type Terrain = "dirt" | "dug" | "air" | "magma";           // "air" y "magma" son bolsas selladas
type Gem = { col: number; row: number; value: 100 | 250 | 500 };
type Miner = { x: number; y: number; dir: Dir; facing: Dir; state: "walk" | "pumping" | "dying" };
type Monster = {
  kind: "pooka" | "fygar";
  x: number; y: number; dir: Dir;
  mode: "walk" | "ghost" | "inflated" | "crushed";
  inflate: number;        // 0..4
  modeTimer: number;
  ghostIn: number;
  fire: { phase: "idle" | "telegraph" | "burn"; timer: number; cooldown: number } | null;
};
type Rock = { col: number; row: number; state: "idle" | "wobble" | "fall" | "broken"; timer: number; y: number };
type Lava = { col: number; row: number; age: number };     // celda inundada; se enfría al cumplir LAVA_LIFE
type Harpoon = { dir: Dir; len: number; target: Monster | null } | null;
```

Estado en la clausura de `createExcavadorGame`:

- `terrain: Terrain[]` — array plano de `COLS * ROWS`; `índice = row * COLS + col`.
- `gems: Gem[]`, `monsters: Monster[]`, `rocks: Rock[]`, `lava: Lava[]`.
- `miner`, `harpoon`, `air` (0..`AIR_MAX`), `checkpointRow`, `maxDepthRow`.
- `cameraY` (px, arriba de la vista).
- `score`, `lives`, `level`, `nextSpawnIn` (ms).
- `state: "playing" | "respawn" | "levelClear" | "gameover"`, `stateTimer` (ms).
- Bucle: `rafId`, `lastTime`, `destroyed`. Entrada: `keys: Set<string>`.

**Mapa y estratos**, mapa 32×60 celdas de 25 px, vista de 800×600 (24 filas visibles):

```
CIELO:      filas 0..1   · sin tierra, recarga de aire
ESTRATO 1:  filas 2..13  (12 filas) · ámbar       · Pooka 200 · Fygar 200 · sin magma
ESTRATO 2:  filas 14..25 (12 filas) · naranja     · Pooka 300 · Fygar 300 · sin magma
ESTRATO 3:  filas 26..37 (12 filas) · marrón      · Pooka 400 · Fygar 400 · sin magma
ESTRATO 4:  filas 38..49 (12 filas) · rojo oscuro · Pooka 500 · Fygar 500 · magma
ESTRATO 5:  filas 50..59 (10 filas) · negro-púrpura · Pooka 600 · Fygar 600 · magma
SALIDA:     fila 59 · celdas de cualquier columna; llegar con el centro del minero la activa
```

---

## Plan de implementación

### 1. Constantes y generación del mapa

`lib/games/excavador/engine.ts`, primera parte. Constantes de diseño:

```
W 800 · H 600 · CELL 25 · COLS 32 · ROWS 60 · VIEW_ROWS 24
START_CELL (16, 2) · START_LIVES 3 · LIVES_MAX 5 · EXTRA_LIFE_EVERY 30000
MINER_SPEED 100 px/s · TURN_TOLERANCE 6 px · DT_MAX 50 ms
CAMERA_LERP 0.12 por frame normalizado a 60 fps · CAMERA_LEAD 4 celdas (la cámara mira 4 filas
  por debajo del minero cuando baja)
POCKET_LEN 3 · MONSTERS_PER_STRATUM(level) = min(5, 2 + floor((level - 1) / 2))
SPEED_MULT(level) = min(1.5, 1 + 0.05 * (level - 1))
POOKA_SPEED 70 px/s · FYGAR_SPEED 62 px/s · GHOST_SPEED_FACTOR 0.6
ROCKS_PER_STRATUM(level) = min(4, 1 + floor((level - 1) / 2))
GEMS_PER_STRATUM 6 · AIR_POCKETS_PER_STRATUM 2
MAGMA_POCKETS_PER_STRATUM(level) = min(4, 1 + floor((level - 1) / 2))   (sólo estratos 4 y 5)
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

`buildLevel(level)`:

- `terrain` empieza con las filas 0–1 en `dug` y todo lo demás en `dirt`.
- Pozo inicial: las columnas 15..17 de las filas 2..5 vaciadas, para que el minero tenga sitio
  para girar. Checkpoint inicial en la fila 2.
- Por estrato: bolsas de monstruos (`POCKET_LEN` celdas `dug`, aisladas), gemas dentro de celdas
  `dirt` (nunca dentro de una bolsa), bolsas de aire (una celda `air` rodeada de `dirt`) y, en los
  estratos 4 y 5, bolsas de magma (una celda `magma` rodeada de `dirt`). Distancia mínima entre
  cualquier par de bolsas: 4 celdas.
- Valor de gema por estrato: estratos 1–2 → 100; 3–4 → 250; 5 → 500.
- Rocas: en celdas `dirt` que no tengan una celda `dug` debajo, ni sean bolsas, ni estén en las
  columnas 15..17 de las filas 2..5.

Comprobación: `npm run build` limpio.

### 2. Minero, cámara y cavar

- Movimiento por ejes idéntico al de una rejilla con tolerancia: cambiar de eje requiere estar a
  ≤ `TURN_TOLERANCE` px del centro de celda perpendicular, con ajuste al centro; invertir el
  sentido en el mismo eje es inmediato.
- Toda celda `dirt` cuyo centro cruza el minero pasa a `dug`. Cavar no ralentiza.
  - Si la celda era una gema (`gems` contiene esa celda): se retira la gema y se suman sus puntos.
  - Si era `air`: se recarga `AIR_POCKET_REFILL` de aire (tope `AIR_MAX`) y la celda pasa a `dug`.
  - Si era `magma`: ver paso 6.
- `maxDepthRow` = la mayor fila alcanzada. Cada fila nueva suma `DEPTH_POINTS`.
- Cada 10 filas de profundidad nueva (filas 12, 22, 32, 42, 52) se fija un punto de control:
  `checkpointRow`.
- Cámara: `cameraY` tiende a `(miner.y - H/2 + CAMERA_LEAD·CELL·dirDown)` con `CAMERA_LERP`,
  limitada a `0..(ROWS·CELL − H)`. `dirDown` vale 1 si el minero se mueve hacia abajo y 0 en otro
  caso.
  ```
  DEPTH_POINTS 10 por fila nueva · AIR_POCKET_REFILL 50
  ```

Comprobación: `npm run build` limpio; el mapa hace scroll al bajar y el minero queda dentro de
la vista.

### 3. Depósito de aire y bomba

- `AIR_MAX 100`, `air` empieza al máximo. Con el minero en las filas 0–1 (cielo) el aire se
  recarga a `AIR_REFILL_RATE` por segundo.
- `Space` lanza el arpón en `facing` si no hay uno activo, `air ≥ HARPOON_COST` y
  `pumpCooldown = 0`; cuesta `HARPOON_COST`.
- Cada pulsación de `Space` con el arpón enganchado suma 1 a `inflate` y cuesta `PUMP_COST`; si
  `air < PUMP_COST` la pulsación no hace nada y el depósito parpadea.
- El arpón se engancha al primer monstruo en `walk` en su línea de tiro por túnel; no atraviesa
  tierra. `INFLATE_MAX 4` revienta al monstruo.
- Sin pulsar durante `DEFLATE_EVERY` ms, `inflate` baja en 1 (el aire ya gastado no se devuelve).
  ```
  AIR_MAX 100 · AIR_REFILL_RATE 40 por segundo (sólo en el cielo)
  HARPOON_COST 4 · PUMP_COST 8 → reventar un monstruo limpio cuesta 4 + 4×8 = 36 de aire
  HARPOON_SPEED 400 px/s · HARPOON_RANGE 75 px (3 celdas) · PUMP_COOLDOWN 250 ms
  INFLATE_MAX 4 · DEFLATE_EVERY 800 ms
  ```
- Puntos al reventar: valor del estrato (200…600) por el tipo; Fygar reventado en la misma fila
  del minero: ×2.
- El depósito no se recarga con la muerte de un monstruo: el aire sólo vuelve del cielo o de las
  bolsas. Esa es la decisión central del modo.

Comprobación: `npm run build` limpio; con `air` a 0 el arpón no sale.

### 4. Monstruos: bolsas, modo fantasma y entradas por el cielo

- Comportamiento `walk` y `ghost` igual que un perseguidor de túneles: en `walk` elige dirección
  en cada centro de celda por distancia de Manhattan al minero entre celdas adyacentes `dug`; en
  `ghost` atraviesa tierra en línea recta a `GHOST_SPEED_FACTOR` de su velocidad y al terminar
  vacía las celdas que ocupa. El arpón no puede engancharlo mientras es `ghost`.
  ```
  GHOST_IN_MIN 6000 ms · GHOST_IN_MAX 10000 ms · GHOST_DURATION 2500 ms
  ```
- Fygar: telegrafía 600 ms y lanza fuego de 3 celdas por túnel (mismas reglas que un aliento
  horizontal: cae a 0 si hay tierra en medio) con enfriamiento de 3000 ms.
  ```
  FYGAR_TELEGRAPH 600 ms · FYGAR_BURN 500 ms · FYGAR_COOLDOWN 3000 ms · FIRE_RANGE 3
  ```
- **No hay ronda que limpiar.** Los monstruos sembrados son fijos por nivel; además, mientras
  `state = "playing"`, cada `SPAWN_EVERY` ms entra por el cielo un monstruo nuevo (Pooka o Fygar
  alternados) que empieza en modo `ghost` desde el punto donde el minero salió del cielo. Máximo
  `MONSTERS_MAX` vivos a la vez.
  ```
  SPAWN_EVERY 20000 ms (SPAWN_EVERY_MIN 8000 ms; baja 1500 ms por nivel) · MONSTERS_MAX 12
  ```
  Esto obliga a mantenerse en movimiento hacia abajo: quedarse a cazar monstruos sale caro.
- Contacto: centro del monstruo a < 0.6 × `CELL` del minero en `walk` o `ghost` mata al minero.

Comprobación: `npm run build` limpio; con el minero quieto 25 s en el estrato 1 entra un monstruo
por el cielo.

### 5. Rocas

- `idle` → `wobble` cuando la celda de debajo pasa a `dug`; `wobble` dura `ROCK_WOBBLE`; luego
  `fall` hasta que la celda de debajo no sea `dug`; al aterrizar pasa a `broken`, que desaparece
  tras `ROCK_BROKEN_MS`.
- Todo monstruo cuyo centro cae dentro de la celda de la roca en `fall` pasa a `crushed`. Si la
  roca aplasta al minero, este muere.
- Una roca que aterriza sobre una celda de `air`/`magma` sellada no la abre.
- Puntos por roca: `ROCK_CRUSH_POINTS[n - 1]`, con `n` = monstruos aplastados por esa misma roca.
  ```
  ROCK_WOBBLE 500 ms · ROCK_FALL_SPEED 300 px/s · ROCK_BROKEN_MS 600 ms
  ROCK_CRUSH_POINTS = [500, 1500, 3000, 5000, 8000]
  ```
  Los valores son menores que en el clásico porque aquí el objetivo no son los monstruos.
- Un monstruo `inflated` bajo una roca cuenta como aplastado.

Comprobación: `npm run build` limpio.

### 6. Magma

- Cuando el minero (o un monstruo solidificándose) vacía una celda `magma`, esa celda pasa a
  `dug` y se crea `Lava` en ella con `age = 0`.
- Cada `LAVA_STEP` ms, cada `Lava` que aún no haya propagado inunda **una** celda `dug`
  adyacente que no sea ya lava, hasta un total de `LAVA_MAX_CELLS` por bolsa. Nunca inunda
  `dirt`, `air` ni celdas del cielo.
- Cada `Lava` se enfría (y se retira, dejando la celda `dug`) al cumplir `LAVA_LIFE`.
- Tocar una celda con lava mata al minero. Un monstruo que la toca pasa a `crushed`, sin puntos.
- El humo (`age` en los últimos 800 ms) se dibuja más tenue, para que se lea el tiempo que queda.
  ```
  LAVA_STEP 400 ms · LAVA_MAX_CELLS 6 · LAVA_LIFE 5000 ms
  ```
- La lava avisa al abrir la bolsa: al vaciar la celda se emite un destello de `LAVA_FLASH_MS`
  antes de la primera propagación. Da un margen de reacción de tres pasos de minero.
  ```
  LAVA_FLASH_MS 500
  ```

Comprobación: `npm run build` limpio; abrir una bolsa de magma inunda como mucho 6 celdas y se
enfría a los 5 s.

### 7. Vidas, puntos de control y salida

- Muerte (contacto, fuego, roca o lava): estado `respawn` de `RESPAWN_MS`; se resta una vida; si
  quedan, el minero reaparece en `checkpointRow` (columna 16, celda `dug`), `air` vuelve a
  `AIR_MAX`, los monstruos vivos vuelven a `walk`, las rocas conservan su estado y la lava
  existente se retira.
- Llegar con el centro del minero a la fila 59 activa `levelClear` de `LEVEL_CLEAR_MS`. Se suman
  `LEVEL_BONUS` × `level` y `TIME_BONUS`: 10 puntos por cada segundo bajo `PAR_TIME` (mín. 0).
  `level++` y `buildLevel(level)` nuevo.
- Vida extra cada `EXTRA_LIFE_EVERY` puntos (tope `LIVES_MAX`).
  ```
  RESPAWN_MS 1500 · LEVEL_CLEAR_MS 1500 · LEVEL_BONUS 1000 · PAR_TIME 120 s
  ```
- Con 0 vidas: `gameover`, `stopLoop()` y `onGameOver(score)` una sola vez.
- `emit()` con `lastScore` / `lastLives` / `lastLevel`; los avisos se emiten sólo al cambiar.
  `resume()` es no-op después del game over.

### 8. Bucle, entrada y dibujo

- `dt` capado a `DT_MAX`; `lastTime = null` al reanudar.
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`, `KeyD`,
  `Space`. `preventDefault()` solo para esas.
- Listeners `keydown` / `keyup` / `blur` sobre el canvas, nunca sobre `window`. `P` y `Escape` no
  llegan. `blur` vacía `keys`.
- `draw()`: solo las filas dentro de `cameraY..cameraY+H` (recorte por fila); cielo, cinco estratos
  con su color, celdas `dug` en negro, gemas como rombos (colores por valor), bolsas de aire como
  burbujas azules bajo una capa fina de tierra, bolsas de magma como puntos naranja bajo tierra,
  lava con parpadeo, rocas, minero, monstruos y arpón con primitivas.
- **Medidor de aire dibujado dentro del canvas** (barra vertical en el borde izquierdo, anclada a
  la vista, no al mundo). La plataforma no tiene ningún hueco de HUD para un recurso propio del
  juego, y es estado de partida, igual que el rótulo `PULSA UNA FLECHA` de Snake. Sin puntuación,
  nivel ni vidas dibujados en el canvas. En el cielo se dibuja además el rótulo `RECARGA` mientras
  el aire sube.
- `destroy()` cancela el frame, quita los listeners y es idempotente.
- `initGame(); draw();` antes de devolver.

Comprobación: `npm run build` limpio.

### 9. Catálogo: nueva ficha `excavador`

`lib/games.ts`, entrada nueva:

```ts
{
  id: "excavador",
  title: "EXCAVADOR",
  short: "Baja al fondo con el aire justo y una bomba a medias.",
  long: "Cava hacia abajo por un pozo de cinco estratos mientras el aire se te acaba. Cada bombeo cuesta oxígeno: decide cuándo hinchar a un monstruo, cuándo rodearlo y cuándo desviarte a por una gema, sin abrir una bolsa de magma en mal momento.",
  cat: "ARCADE",
  cover: "cover-excavador",
  color: "yellow",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `cover-excavador` con la misma técnica que las demás portadas (sólo
degradados CSS): cinco franjas de estrato descendentes y un pozo vertical con un rombo de gema.

Comprobación: `/biblioteca` y `/juegos/excavador` muestran la ficha con su portada.

### 10. Registrar el motor

`lib/games/registry.ts`:
`excavador: { create: createExcavadorGame, width: 800, height: 600, controls: "flechas o WASD para cavar · ESPACIO para bombear (gasta aire)" }`.

Comprobación: `/jugar/excavador` pinta el canvas real, no la `.game-arena`.

### 11. Leaderboard

`supabase/migrations/<timestamp>_juego_excavador.sql`, con timestamp posterior a la última
migración existente:

```sql
insert into public.games (id, title) values ('excavador', 'EXCAVADOR');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. **Los tipos no se
regeneran.**

Comprobación: `select id from public.games` incluye `excavador`.

### 12. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido manual
de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/excavador` muestra un canvas de 800×600 con cielo y estratos, no la `.game-arena`.
- [ ] El minero empieza en la fila 2 con un espacio vaciado de 3×4 celdas y no se mueve hasta pulsar una dirección.
- [ ] Flechas y WASD mueven por ejes; nunca en diagonal; girar a ≤ 6 px del centro se aplica con ajuste al centro.
- [ ] Al cavar hacia abajo la cámara hace scroll suave y nunca sale de los bordes del mapa.
- [ ] Cada fila nueva de profundidad suma 10 puntos una sola vez; volver a subir y bajar no suma dos veces.
- [ ] El medidor de aire está dibujado en el canvas y empieza lleno.
- [ ] Lanzar el arpón cuesta 4 de aire y cada bombeo 8; reventar a un monstruo limpio cuesta 36.
- [ ] Con menos aire del que cuesta una acción, la acción no se ejecuta y el medidor parpadea.
- [ ] En las filas 0–1 el aire sube 40 por segundo; fuera de ellas no sube por sí solo.
- [ ] Cavar una bolsa de aire suma 50 de aire (tope 100).
- [ ] Cavar una celda con gema la recoge y suma 100, 250 o 500 según el estrato.
- [ ] Reventar un monstruo suma su valor de estrato (200 a 600) y no devuelve aire.
- [ ] Un monstruo en modo fantasma no puede ser enganchado; al solidificarse deja la celda vaciada.
- [ ] Un Fygar en línea a ≤ 4 celdas telegrafía 600 ms y lanza fuego de 3 celdas que no atraviesa tierra.
- [ ] Estando 25 s en el estrato 1, entra por el cielo un monstruo nuevo; nunca hay más de 12 vivos.
- [ ] Una roca tiembla 500 ms al vaciarse la celda de debajo y luego cae; aplasta a monstruos y mata al minero.
- [ ] Ningún nivel generado tiene una roca con una celda vaciada justo debajo al empezar.
- [ ] Abrir una bolsa de magma muestra un destello de 500 ms y después inunda como máximo 6 celdas de túnel.
- [ ] Tocar lava mata al minero; la lava nunca atraviesa tierra y se enfría a los 5 s.
- [ ] No existen bolsas de magma en los estratos 1 a 3.
- [ ] Llegar a la fila 59 suma 1000 × nivel más el bono de tiempo y genera un mapa nuevo, y el HUD pasa a nivel 02.
- [ ] El HUD muestra 3 vidas al inicio; cada muerte reaparece en el último punto de control (filas 12, 22, 32, 42, 52) con el aire lleno.
- [ ] Cada 30 000 puntos suma una vida, con tope de 5.
- [ ] Con 0 vidas se abre el modal `FIN DEL JUEGO` con la puntuación real, una sola vez.
- [ ] El canvas no dibuja puntos, nivel ni vidas, ni ningún overlay de game over.
- [ ] El botón `PAUSA` congela el juego y `REANUDAR` lo reanuda sin saltos de cámara ni de aire; `P` y `Escape` hacen lo mismo.
- [ ] Con el canvas enfocado, las flechas y `ESPACIO` no hacen scroll de la página.
- [ ] Escribir `W`, `A`, `S`, `D` o espacio en el campo de iniciales no mueve ni dispara.
- [ ] `JUGAR DE NUEVO` reinicia a nivel 1, 0 puntos, 3 vidas, aire lleno y mapa nuevo sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'excavador'`, y no duplica al pulsarlo dos veces.
- [ ] Esa puntuación aparece en `/salon?juego=excavador` y en `/juegos/excavador` sin recargar a mano.
- [ ] Con `scores` vacía para este juego, `/salon?juego=excavador` muestra el estado vacío.
- [ ] Navegar de `/jugar/excavador` a `/biblioteca` y volver no duplica el bucle.
- [ ] Dejar la pestaña en segundo plano y volver no hace saltar la cámara ni aparecer varios monstruos de golpe.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid` y `/jugar/snake` se juegan igual que antes.
- [ ] Los juegos sin motor se comportan igual que antes.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/excavador`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** id `excavador` y título `EXCAVADOR`, el mismo que la variante 01, para que ambas sean
  alternativas del mismo juego base. Sólo una puede promoverse.
- **Sí:** el objetivo es descender, no limpiar monstruos. Es lo que distingue esta variante de la
  clásica y hace que la profundidad sea el marcador.
- **Sí:** aire finito que no se recupera matando. Convierte la bomba en una decisión y no en un
  botón de disparo.
- **Sí:** magma sólo en los estratos 4 y 5, en bolsas selladas y con destello previo. Es un
  peligro que el jugador abre, no una trampa sin aviso.
- **Sí:** el medidor de aire dentro del canvas. Es el único recurso propio del juego que la
  plataforma no puede pintar en su HUD.
- **Sí:** monstruos nuevos por el cielo con temporizador. Evita que el jugador se quede cazando
  y mantiene el ritmo de descenso.
- **Sí:** puntos de control cada 10 filas. Sin ellos, morir en el estrato 5 cuesta la partida
  entera y el modo se vuelve frustrante.
- **No:** mejoras permanentes ni tienda entre niveles.
- **No:** sonido. No hay assets de audio.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo                                                                                     | Mitigación                                                                                                       |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Sin original, las constantes se ajustan «a ojo» durante la implementación.                 | El paso 1 las fija y las declara fuera de alcance.                                                               |
| El aire se acaba y no hay forma de recuperarlo: partida sin salida.                        | Bolsas de aire (2 por estrato) y recarga ilimitada en el cielo; el minero siempre puede subir.                  |
| Dibujar 60 filas × 32 columnas cada frame desde cero es caro.                              | Recorte por fila a la vista (≈ 24 filas) en `draw()`; el resto del mapa sólo se actualiza en lógica.            |
| La cámara con suavizado deja al minero fuera de la vista al caer deprisa.                  | `CAMERA_LEAD` de 4 filas hacia abajo y límites de cámara; criterio de aceptación explícito.                     |
| La lava se propaga hacia el minero sin dar tiempo a reaccionar.                            | Destello de 500 ms antes del primer paso, propagación lenta (400 ms/celda) y tope de 6 celdas.                  |
| Monstruos entrando por el cielo cada 20 s acorralan a quien baja lento.                    | Temporizador con suelo de 8 s, tope de 12 monstruos vivos y entrada en modo `ghost` que se puede esquivar.      |
| Puntos de profundidad sumados dos veces al subir y volver a bajar.                         | `maxDepthRow` sólo puntúa filas por encima de su valor.                                                          |
| Pestaña en segundo plano: cámara, lava y spawns avanzan de golpe al volver.                | `dt` capado a 50 ms y `lastTime = null` al reanudar; todos los temporizadores se descuentan de ese `dt`.        |
| `Space` llega al motor mientras se escriben iniciales.                                     | Bucle parado con el modal abierto y listeners en el canvas, no en `window`.                                     |

---

## Lo que **no** entra en esta spec

- Modo "limpiar la pantalla" y huida del último monstruo (variante `01-excavacion-clasica.md`).
- Vegetales bonus.
- Mejoras permanentes o tienda.
- Sonido.
- Controles táctiles.
- Skins.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
