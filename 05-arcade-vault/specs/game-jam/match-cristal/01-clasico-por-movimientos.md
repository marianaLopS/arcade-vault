# SPEC — MATCH-CRISTAL: clásico por movimientos

> **Estado:** Propuesta (game jam). No entra en la numeración `specs/NN-*.md` del repo hasta que se elija esta variante y se promueva por `/spec` o la skill `nuevo-juego`.
> **Depende de:** SPEC 05, SPEC 06, SPEC 08, SPEC 11, SPEC 13, SPEC 14, SPEC 15
> **Fecha:** 2026-10-21
> **Objetivo:** Un match-3 de intercambio en grilla de 8×8, sin twist: 25 movimientos, cascadas con multiplicador y niveles que regalan movimientos, listo para el contrato `GameEngine` con leaderboard real en `scores`.

---

## Por qué existe esta spec

La categoría PUZZLE del vault solo tiene TETRIS (`caida`), cuya lógica es de piezas que caen y
se encajan. Un match-3 es el otro gran arquetipo de puzzle de consola y móvil —intercambiar dos
gemas contiguas para alinear tres— y no está en el catálogo (`lib/games.ts`) ni en ninguna spec.
Figuraba como sugerencia pendiente de `game-planner` (2026-09-22).

Esta es la variante **mínima y limpia**: las reglas de Bejeweled de 2001 con un único límite,
los movimientos. Es la que se implementa si se quiere el juego completo con el menor riesgo.
La variante `02-reacciones-en-cadena.md` añade cristales especiales, combos entre ellos y metas
por nivel; ambas comparten el mismo mundo lógico, los mismos controles y la misma integración
con Supabase, y solo se diferencian en las reglas de la partida.

Como Snake (SPEC 10), no hay código de referencia: las constantes de esta spec **son** el
diseño del juego. El paso 2 las fija con la misma regla que los ports: cambiarlas durante la
implementación es rediseñar, no implementar.

Dos rasgos nuevos para el vault, porque el match-3 es el primer juego **de ratón**:

- La entrada principal es puntero (clic, arrastre y toque sobre el canvas). El teclado y el
  mando táctil de la SPEC 11 son equivalentes completos, no un añadido.
- El motor tiene fases animadas encadenadas (intercambio, vaciado, caída). Toda la temporización
  va por `dt` acumulado, nunca por `setTimeout`, para que `pause()` congele la animación.

---

## Alcance

**Dentro:**

- `lib/games/match-cristal/engine.ts`: motor nuevo con todo el estado en la clausura de
  `createMatchCristalGame`.
- `lib/games/match-cristal/skins.ts`: paletas `clasico`, `neon`, `retro` (`SkinId` de
  `lib/games/skins.ts`).
- Tablero de 8×8 celdas de 64 px en un mundo lógico de **576×576**.
- Seis tipos de cristal, distinguibles por forma además de por color.
- Intercambio de dos cristales adyacentes, válido solo si forma una línea de 3 o más.
- Cascadas con gravedad hacia abajo, relleno desde arriba y multiplicador de cadena.
- Partida de **25 movimientos**; cada nivel superado regala 5 más.
- Nivel por puntos; más tipos de cristal a partir del nivel 2.
- Reshuffle automático cuando el tablero queda sin movimientos posibles.
- Pista visual tras 6 s sin actuar.
- Controles de teclado, ratón (clic y arrastre) y táctil (pointer events + mando SPEC 11).
- Una línea `match-cristal` en `GAME_ENGINES` con `skins: true` y `touch`.
- Ficha nueva en `lib/games.ts` (`id: "match-cristal"`, `cat: "PUZZLE"`) y su CSS de portada.
- Migración `insert into public.games (id, title) values ('match-cristal', 'MATCH-CRISTAL')`.

**Fuera de alcance (para specs futuras):**

- Cristales especiales, bombas, rayos y combos entre ellos (es la variante 02).
- Metas por nivel, obstáculos, hielo, cristales bloqueados.
- Modo por tiempo, modo zen y modos diarios.
- Sonido.
- Vidas reales o continuar tras el fin de la partida.
- Perfil, rachas o la fila `▸ TU MEJOR MARCA` por cuenta.

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni tipo de plataforma nuevo.** `scores` y `game_stats`
sirven a este juego sin tocarlas; el leaderboard se enciende con una fila en `games`.

`scores` ya tiene `game_id` (FK a `games`), `player` (`^[A-Z]{1,3}$`), `score` (0..1.000.000) y
`user_id` (FK a `auth.users`, `null` = invitado; SPEC 14/15). El motor no sabe nada de eso: solo
llama a `onGameOver(finalScore)`; la Server Action `guardarScore` valida y rellena `user_id` con
`getClaims()`. Para respetar el `CHECK (score <= 1000000)` el motor topa la puntuación en
`SCORE_MAX = 999999`.

Tipos locales del motor, sin exportar:

```ts
type Gem = number; // 0..5 = tipo de cristal; -1 = celda vacía
type Phase = "idle" | "swapping" | "reverting" | "clearing" | "falling" | "shuffling" | "gameover";
type Cell = { c: number; r: number }; // columna y fila, origen arriba-izquierda
```

Estado en la clausura de `createMatchCristalGame`:

- `grid: Int8Array(64)` — `grid[r * COLS + c]`.
- `offY: Float32Array(64)` — desplazamiento vertical en px de cada celda mientras cae (0 en reposo).
- `fade: Float32Array(64)` — 1 → 0 en las celdas que se están vaciando.
- `marked: Uint8Array(64)` — celdas que el último `findMatches` marcó para vaciar.
- `phase: Phase`, `phaseT` (ms transcurridos en la fase), `paused: boolean`.
- `swapA`, `swapB: number` (índices de celda del intercambio en curso, `-1` si ninguno).
- `cursor: number` (índice de celda del cursor de teclado, `-1` hasta usar el teclado),
  `selected: number` (índice del cristal elegido o `-1`).
- `score`, `moves`, `level`, `chain` (cascada actual, empieza en 1), `pendingMoves`
  (movimientos de bonus por subida de nivel aún sin aplicar).
- `idleT` (ms sin actuar, para la pista), `hintA`, `hintB` (índices de la pista o `-1`).
- `popups: Popup[]` — pool fija de `POPUP_POOL = 16` entradas `{ x, y, text, t, active }`.
- `drag: { active, from, x0, y0 }` — arrastre de puntero en curso.
- Bucle: `rafId`, `lastTime`, `destroyed`. `lastScore` / `lastMoves` / `lastLevel` para `emit()`.

---

## Plan de implementación

### 1. Skins

`lib/games/match-cristal/skins.ts` con una paleta por `SkinId`: seis colores de cristal, fondo,
color de la rejilla, color del cursor y color de la pista. Los seis cristales **se distinguen
también por forma** (accesibilidad para daltonismo): rombo, círculo, triángulo, cuadrado,
hexágono y estrella de cuatro puntas, en ese orden de tipo 0..5. Legibles en modo oscuro.

| Tipo | Forma    | clasico   | neon      | retro     |
| ---- | -------- | --------- | --------- | --------- |
| 0    | rombo    | `#e53935` | `#ff2d6f` | `#d9482b` |
| 1    | círculo  | `#1e88e5` | `#2d9bff` | `#3a6ea5` |
| 2    | triángulo| `#43a047` | `#39ff14` | `#5a9a3c` |
| 3    | cuadrado | `#fdd835` | `#ffee00` | `#e0b030` |
| 4    | hexágono | `#8e24aa` | `#c13bff` | `#8a4f9e` |
| 5    | estrella | `#00acc1` | `#00fff0` | `#3fa39b` |

Fondo / rejilla: `clasico` `#10131c` / `#1b2030`, `neon` `#05010d` / `#140826`, `retro`
`#1c1710` / `#2a2418`. Cursor `#ffffff` en las tres; pista `#ffd54f`.

Comprobación: `npm run build` limpio; las tres paletas tienen seis colores distintos entre sí.

### 2. Motor: constantes y lógica

`lib/games/match-cristal/engine.ts`. Constantes de diseño:

```
W 576 · H 576 · CELL 64 px · COLS 8 · ROWS 8 · BOARD_X 32 · BOARD_Y 32
GEM_TYPES(level) = min(6, 4 + level)            // nivel 1 → 5 tipos, nivel 2+ → 6
START_MOVES 25 · MOVES_BONUS 5 · LEVEL_STEP 2000 · LEVEL_MAX 99
  level = min(LEVEL_MAX, 1 + floor(score / LEVEL_STEP))
MATCH_POINTS: línea 3 → 30 · 4 → 60 · 5 → 100 · n ≥ 6 → 100 + 50 * (n - 5)
CHAIN_MULT(chain) = min(chain, 8)
  puntos de un lote = Σ MATCH_POINTS[largo de cada línea] * CHAIN_MULT(chain)
SCORE_MAX 999999
SWAP_MS 160 · REVERT_MS 160 · CLEAR_MS 220 · FALL_MS_PER_CELL 70 · FALL_MS_MIN 120
SHUFFLE_MS 600 · HINT_DELAY 6000 · HINT_PERIOD 900
DRAG_MIN 26 px · SHUFFLE_TRIES 50 · POPUP_POOL 16 · POPUP_MS 700 · DT_MAX 50 ms
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Lógica:

- `findMatches()`: recorre filas y columnas; toda racha de 3 o más cristales iguales es una
  línea. Marca en `marked` la unión de celdas de todas las líneas y devuelve la lista de largos
  de línea. Una celda en dos líneas (forma L, T o cruz) se vacía una vez, **pero ambas líneas
  puntúan**. Ignora celdas con `-1`.
- Intercambio: solo entre celdas adyacentes en horizontal o vertical (no diagonal). Se hace el
  `swap` en `grid`; si `findMatches()` encuentra algo, la jugada es **válida**, consume 1
  movimiento y arranca la cascada; si no, es **inválida**: fase `reverting`, se deshace el swap
  y **no consume movimiento**.
- Cascada, un ciclo = `clearing` (`CLEAR_MS`, `fade` 1→0) → puntuar → poner `-1` en las celdas
  marcadas → `falling`: cada columna compacta sus cristales hacia abajo y rellena arriba con
  cristales aleatorios de `GEM_TYPES(level)`. Cada celda que cae arranca con `offY` negativo y lo
  lleva a 0; la duración de la fase es `max(FALL_MS_MIN, FALL_MS_PER_CELL * caídaMáxima)` con
  `caídaMáxima` en celdas. Después se vuelve a llamar a `findMatches()`: si encuentra algo,
  `chain++` y otro ciclo; si no, la cascada ha terminado y `chain` vuelve a 1.
- Fin de cascada, en este orden: (1) aplicar nivel (si `level` subió, `pendingMoves` pasa a
  `moves`, `onLevel`, popup `+5 MOVIMIENTOS`); (2) si no hay ningún movimiento válido,
  `shuffling`; (3) si `moves === 0`, `gameover`; (4) si no, `idle`.
- `hasValidMove()`: para cada celda prueba el swap con la derecha y con abajo, llama a
  `findMatches()` sin dejar marcas y deshace. Devuelve el primero que encuentra (también sirve
  para la pista).
- Reshuffle: permuta de Fisher-Yates los cristales existentes hasta que no haya líneas de 3 y sí
  haya un movimiento válido; hasta `SHUFFLE_TRIES`. Si se agotan, regenera todo el tablero con la
  rutina de inicio. **No consume movimiento ni resta puntos.** Popup `BARAJANDO`.
- Tablero inicial (`initGame`): se rellena celda a celda eligiendo un tipo que no forme línea de
  3 con las dos celdas de la izquierda ni las dos de arriba; después, si `hasValidMove()` es
  falso, se repite. Arranca con `moves = START_MOVES`, `score = 0`, `level = 1`.
- Puntos: `score = min(SCORE_MAX, score + puntos)`.
- Los cristales de relleno pueden formar líneas al caer: eso **es** la cascada, no un error.

Comprobación: `npm run build` limpio.

### 3. Motor: bucle, fases y dibujo

- Bucle `requestAnimationFrame` con `dt` capado a `DT_MAX`; `lastTime = null` al reanudar.
  Cada frame suma `dt` a `phaseT` y avanza la fase actual; no hay `setTimeout` ni
  `setInterval`.
- `pause()`: `paused = true` y cancela el frame **sin tocar `phase` ni `phaseT`**. Pausar durante
  un `falling` y reanudar continúa la caída exactamente donde estaba. `resume()` es no-op si
  `phase === "gameover"`.
- Mientras `phase !== "idle"` toda entrada de jugada se descarta; solo se permite mover el
  cursor de teclado.
- `emit()`: `onScore`, `onLives(moves)`, `onLevel` solo cuando el valor cambia, con
  `lastScore` / `lastMoves` / `lastLevel`. `onLives(25)` se emite al iniciar y `onLives(0)` al
  quedarse sin movimientos, como Tetris con `onLives(1)`/`onLives(0)` (SPEC 08): el HUD de la
  plataforma rotula `Vidas` y aquí muestra los movimientos restantes.
- `draw()`: fondo, rejilla, cristales (con `offY`, `fade` y escala), cursor, selección con
  contorno blanco pulsante, pista dorada pulsante cada `HINT_PERIOD`, popups de puntos
  (`+90`, `x2`, `BARAJANDO`). Sin asignar arrays, objetos ni clausuras dentro de `draw()` (SPEC 13):
  `offY`, `fade`, `marked` y `popups` están preasignados.
- Sin puntos, movimientos ni nivel dibujados fuera de los popups: los muestra el HUD de React.
  Nada de overlay de `FIN DEL JUEGO` en el canvas.
- Game over: `stopLoop()` y `onGameOver(score)` una sola vez.
- `restart()`: detiene el bucle, `initGame()`, `emit()`, arranca. Descarta cualquier animación
  en curso.
- `destroy()`: cancela el frame, quita listeners, restaura `canvas.style.touchAction`, es
  idempotente.
- `initGame(); draw();` antes de devolver.

Comprobación: `npm run build` limpio; la partida corre en `npm run dev` con la `.game-arena`
sustituida por el canvas.

### 4. Entrada: teclado, ratón y táctil

Teclas, `preventDefault()` solo para éstas:

```
GAME_KEYS: ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Space, Enter, KeyX
```

- Teclado sin selección: las flechas mueven el cursor una celda (se queda en el borde, no da la
  vuelta); la primera pulsación lo muestra en la celda `(3, 3)`. `Space` o `Enter` **eligen** el
  cristal bajo el cursor.
- Teclado con selección: una flecha **intercambia** el cristal elegido con su vecino en esa
  dirección (si cae fuera del tablero, se ignora). `Space`, `Enter` o `KeyX` deshacen la
  selección.
- Ratón y táctil con pointer events sobre el canvas (`pointerdown`, `pointermove`, `pointerup`,
  `pointercancel`), con `setPointerCapture`. El motor pone `canvas.style.touchAction = "none"`
  para que arrastrar no haga scroll y lo restaura en `destroy()`.
- Coordenadas: se convierten con `getBoundingClientRect()` y la escala `W / rect.width`, porque
  el CSS estira el canvas (SPEC 08).
- Clic sobre un cristal sin selección: lo elige. Clic sobre un vecino adyacente del elegido:
  intercambia. Clic sobre un cristal no adyacente: cambia la selección a ese. Clic sobre el
  elegido: lo suelta. Clic fuera del tablero: suelta.
- Arrastre: con `pointerdown` sobre un cristal y un `pointermove` que supere `DRAG_MIN` px en el
  eje dominante, intercambia con el vecino en esa dirección y cancela el arrastre (un solo swap
  por gesto).
- Mando táctil (SPEC 11): la cruceta envía las cuatro flechas y los botones `Space` y `KeyX`, así
  que el teclado cubre el móvil sin código táctil propio en la lógica de jugada. Ningún
  `isTrusted`.
- Listeners `keydown` / `blur` sobre el canvas, nunca sobre `window`. `P` y `Escape` no llegan
  al motor. `blur` suelta la selección y cancela el arrastre.
- Cualquier entrada válida pone `idleT = 0` y borra la pista.

Comprobación: con `npm run dev`, jugar una partida entera solo con teclado, solo con ratón y
solo con el mando táctil emulado (`pointer: coarse` en DevTools).

### 5. Registrar y dar de alta la ficha

`lib/games/registry.ts`:

```ts
"match-cristal": {
  create: createMatchCristalGame,
  width: 576,
  height: 576,
  controls: "flechas para mover el cursor, espacio para elegir un cristal y una flecha para intercambiarlo; o clic y arrastre con el ratón",
  skins: true,
  touch: { a: { code: "Space", label: "ELEGIR" }, b: { code: "KeyX", label: "SOLTAR" } },
},
```

Sin `repeat: true`: un toque en la cruceta es un paso o un swap; mantenerla pulsada no debe
encadenar swaps involuntarios.

`lib/games.ts`: nueva ficha `id: "match-cristal"`, `title: "MATCH-CRISTAL"`, `cat: "PUZZLE"`,
`cover: "cover-cristal"` y `color` de una paleta ya usada. `best` y `plays` como el resto de
fichas con motor real (los reales los lee `lib/scores.ts`). `app/globals.css`: bloque
`.cover-cristal` con una rejilla de rombos de colores; es maquetación, no motor.

Comprobación: `/jugar/match-cristal` pinta el canvas real y el selector de skins;
`/jugar/gloton` y los otros no cambian.

### 6. Leaderboard

`supabase/migrations/<timestamp>_juego_match_cristal.sql`, con timestamp posterior a
`20260927130000`:

```sql
insert into public.games (id, title) values ('match-cristal', 'MATCH-CRISTAL');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. Los tipos no se
regeneran: insertar una fila no cambia el esquema. El borde de la política RLS de `insert` en
`scores` (`user_id is null or user_id = auth.uid()`) ya cubre al invitado y al jugador con
sesión; no hay ninguna política nueva.

Comprobación: `select id from public.games` incluye `match-cristal`.

### 7. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, medidor `?fps=1`
(SPEC 13) sin `draw()` que asigne, y el recorrido manual de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/match-cristal` muestra un canvas de 576×576 con un tablero de 8×8, no la `.game-arena`.
- [ ] Al empezar el tablero no tiene ninguna línea de 3 ya hecha y tiene al menos un movimiento válido.
- [ ] Al empezar el HUD muestra 25 en `Vidas`, 0 puntos y nivel 01.
- [ ] Hay 5 tipos de cristal en el nivel 1 y 6 desde el nivel 2; los seis se distinguen por forma además de por color.
- [ ] Intercambiar dos cristales adyacentes que forman una línea de 3 la vacía, puntúa 30 y resta 1 movimiento.
- [ ] Un swap que no forma línea se anima, se deshace y **no** resta movimiento.
- [ ] No se puede intercambiar en diagonal ni con una celda no adyacente.
- [ ] Una línea de 4 puntúa 60 y una de 5 puntúa 100 en la primera cascada.
- [ ] Una forma en L o T vacía todas sus celdas y suma la puntuación de ambas líneas.
- [ ] La segunda cascada de una jugada puntúa ×2, la tercera ×3, hasta un tope de ×8.
- [ ] Los cristales de arriba caen y se rellenan por arriba tras cada vaciado, sin huecos.
- [ ] Mientras hay animación, un clic o una flecha de swap no hace nada.
- [ ] Teclado: flechas mueven el cursor, `Space` elige y una flecha intercambia; `Space` o `X` sueltan.
- [ ] Ratón: clic + clic en un vecino intercambia; arrastrar más de 26 px en un eje intercambia con el vecino de esa dirección.
- [ ] Táctil: arrastrar sobre el canvas intercambia y la página no hace scroll; el mando virtual (cruceta + ELEGIR / SOLTAR) juega una partida completa.
- [ ] Con el canvas enfocado, las flechas y `Space` no hacen scroll de la página.
- [ ] Al llegar a 2000 puntos el HUD pasa a nivel 02, suma 5 movimientos y aparece el popup `+5 MOVIMIENTOS`.
- [ ] Si el tablero queda sin movimientos, se baraja sin consumir movimiento, aparece `BARAJANDO` y el resultado no tiene líneas hechas.
- [ ] Tras 6 s sin actuar se pulsa en dorado un swap válido; actuar lo apaga.
- [ ] Al llegar a 0 movimientos, el juego termina **después** de resolver todas las cascadas pendientes, y el modal `FIN DEL JUEGO` muestra la puntuación real.
- [ ] El canvas no dibuja puntos, movimientos ni nivel fuera de popups, ni ningún overlay de game over.
- [ ] El botón `PAUSA` congela una caída a medias y `REANUDAR` la continúa sin saltarse ni repetir pasos; `P` y `Escape` hacen lo mismo.
- [ ] Pausar con un cristal elegido no pierde la selección.
- [ ] Escribir flechas, espacio o `X` en el campo de iniciales no mueve ni reinicia el juego.
- [ ] `JUGAR DE NUEVO` reinicia a 25 movimientos, 0 puntos y nivel 1 sin recargar la página, aunque se pulse en mitad de una animación.
- [ ] La puntuación nunca supera 999999.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'match-cristal'`; con sesión abierta lleva `user_id`, como invitado lleva `null`.
- [ ] Esa puntuación aparece en `/salon?juego=match-cristal` y en `/juegos/match-cristal` sin recargar a mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Con `scores` vacía para este juego, `/salon?juego=match-cristal` muestra el estado vacío.
- [ ] Los tres skins se ven y distinguen sus seis cristales en modo oscuro.
- [ ] Navegar de `/jugar/match-cristal` a `/biblioteca` y volver no duplica el bucle ni los listeners.
- [ ] Dejar la pestaña en segundo plano y volver no avanza varias fases de golpe.
- [ ] En `?fps=1`, una partida con cascadas largas no registra frames > 50 ms ni crece el heap.
- [ ] Los juegos ya implementados y los de maqueta se juegan igual que antes.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/match-cristal`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** tablero 8×8, el estándar del género. Con 64 celdas la búsqueda de jugadas es trivial
  y no hay que optimizar.
- **Sí:** mundo cuadrado 576×576. Caída ya rompió el marco 4/3 en la SPEC 08; un tablero cuadrado
  no necesita panel lateral porque el HUD de la plataforma ya muestra puntos, nivel y movimientos.
- **Sí:** límite de movimientos como única condición de fin. Es la forma más clara de pensar
  cada jugada y da una partida corta y rejugable.
- **Sí:** el swap inválido **no** consume movimiento. Castigarlo desanima a explorar con el ratón.
- **Sí:** reshuffle automático sin coste. Un tablero sin jugadas no es una derrota del jugador.
- **Sí:** `onLives(moves)` para enseñar los movimientos en la casilla `Vidas`, igual que Tetris
  usa `onLives(1)`. Un HUD por juego queda fuera, como en la SPEC 08.
- **Sí:** el nivel sube por puntos y regala movimientos. Sin eso una partida acabaría siempre en
  la misma cifra y el HUD de nivel sería decorativo.
- **Sí:** más tipos de cristal a partir del nivel 2. Es la palanca de dificultad más simple.
- **No:** vidas. El movimiento es el recurso; añadir vidas lo duplicaría.
- **Sí:** los cristales se distinguen por forma. Seis colores saturados no sirven a todos los ojos.
- **Sí:** el rellenado puede producir líneas. Rellenar con «sin líneas» eliminaría las cascadas
  que dan la gracia al género.
- **Sí:** teclado, ratón y táctil como equivalentes. El match-3 nace del ratón, pero el vault
  se juega con teclado y con el mando de la SPEC 11.
- **Sí:** el motor activa `touch-action: none` en su canvas. Sin eso, arrastrar en móvil hace
  scroll de la página.
- **No:** `repeat: true` en el mando. Un toque es un paso.
- **Sí:** cursor de teclado oculto hasta la primera pulsación. En ratón un cursor fijo molesta.
- **No:** sonido. No hay assets de audio.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo                                                                        | Mitigación                                                                                                   |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `setTimeout` en las animaciones: `PAUSA` no las congela y el juego se rompe. | Todo avanza con `dt` acumulado en `phaseT`; `pause()` solo cancela el frame. Criterio de aceptación explícito. |
| Arrastre táctil que hace scroll de la página en móvil.                        | `touch-action: none` desde el motor, restaurado en `destroy()`.                                              |
| Coordenadas de puntero erróneas porque el CSS estira el canvas.               | Conversión con `getBoundingClientRect()` y escala `W / rect.width`; se comprueba con el marco redimensionado. |
| Tablero sin jugadas que deja la partida atascada.                             | `hasValidMove()` tras cada cascada y `shuffling`; tras `SHUFFLE_TRIES` se regenera el tablero entero.        |
| Cascadas largas que bloquean la entrada y parecen un cuelgue.                 | Cada ciclo dura ≤ 220 + 8 × 70 ms; el multiplicador tope ×8 no alarga la cascada. Los popups dan feedback.   |
| Fin de partida a mitad de cascada con puntos pendientes sin contar.           | El game over solo se evalúa en el paso (3) del fin de cascada, nunca durante un ciclo.                        |
| Doble `onGameOver` si se reinicia justo al terminar.                          | Bandera `phase === "gameover"` y `stopLoop()` antes de llamar al callback.                                   |
| Asignaciones en `draw()` por popups o por listas de celdas, caídas de fps.    | Pool de 16 popups y `Float32Array`/`Uint8Array` preasignados; se mide con `?fps=1` (SPEC 13).               |
| Escribir las iniciales mueve el cursor del motor.                             | Bucle y listeners en el canvas, no en `window`; el modal retira el foco.                                     |
| La puntuación supera el `CHECK` de `scores` y el insert falla.                | `SCORE_MAX = 999999` en el motor.                                                                            |
| Una partida demasiado larga por el bonus de movimientos.                      | `LEVEL_STEP` fijo en 2000: cada +5 movimientos exige más de lo que se cobra; se ajusta en spec futura.       |

---

## Lo que **no** entra en esta spec

- Cristales especiales, bombas, rayos, prismas y combos entre ellos.
- Metas por nivel, obstáculos o hielo.
- Modos por tiempo, zen o diarios.
- Sonido.
- Vidas o continuar tras el fin de la partida.
- Perfil, rachas o la fila `▸ TU MEJOR MARCA` por cuenta.
- Implementación de ningún tipo: este documento es una propuesta para revisar. Elegirla implica
  promoverla a `specs/NN-*.md` y ejecutarla con `/spec-impl-game` o la skill `nuevo-juego`.

Cada una de ellas, si entra, va en su propia spec.
