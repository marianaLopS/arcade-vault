# SPEC — ROMPECABEZAS NUMÉRICO: clásico 4×4 contrarreloj

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06, SPEC 11
> **Fecha:** 2026-10-27
> **Objetivo:** Diseñar el 15-puzzle clásico — tablero de 4×4 con 15 fichas numeradas y un hueco, fichas que se deslizan al hueco hasta ordenarlas del 1 al 15 — encadenando tableros cada vez más revueltos dentro de un reloj de partida que se recarga al resolver, como ficha nueva `rompecabezas-numerico` en categoría PUZZLE, con motor real y leaderboard en Supabase desde el primer día.

---

## Por qué existe esta spec

`game-suggestions-todo.md` lo propone como «puzzle de lógica minimalista y de bajo costo de
implementación»: grilla fija, sin física ni colisiones. La categoría PUZZLE solo tiene un juego
real (`caida`, Tetris), que es de reflejos y encaje de formas. El 15-puzzle aporta lo contrario:
ninguna presión de tiempo real sobre las piezas, decisión por turnos sobre una grilla estática y
una mecánica de **ordenar deslizando** que no existe en el catálogo. No se solapa con
`match-cristal` ni `empuja-cajas`, otras propuestas de game jam: aquí no hay emparejar ni empujar
objetos contra un mapa, solo una permutación que se resuelve por el único hueco.

Como con Snake (SPEC 10), `ciempies` y `match-cristal`, **no hay código de referencia**: ninguna
carpeta de `References/` trae un 15-puzzle. Las constantes de esta spec **son** el diseño del
juego; cambiarlas durante la implementación es rediseñar, no implementar. Y como ellos, el motor
dibuja todo con primitivas de canvas: no hay spritesheet que portar.

Un 15-puzzle puro no tiene condición de derrota, y el leaderboard necesita una puntuación que suba
y una partida que termine. Esta variante es la lectura **mínima**: un único reloj de partida, una
sola vida y un tablero de tamaño fijo. La segunda variante (`02-tamanos-y-candados.md`) elimina
el reloj y lo sustituye por presupuesto de movimientos, vidas, tamaños crecientes y fichas
bloqueadas.

---

## Alcance

**Dentro:**

- `lib/games/rompecabezas-numerico/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createRompecabezasNumericoGame`, sin assets externos.
- Mundo lógico de **560×620**: una franja superior de 60 px (`y 0..60`) con el contador de
  movimientos del tablero y el reloj de la partida, y debajo el tablero de **4×4 celdas de 130 px**
  (área de 520×520 con margen de 20 px, `x 20..540`, `y 80..600`).
- 15 fichas numeradas y un hueco. Estado resuelto: `1..15` en orden de lectura y el hueco abajo a
  la derecha.
- Tableros siempre **resolubles**: se generan desde el estado resuelto con una caminata aleatoria de
  movimientos legales, nunca barajando fichas al azar.
- Deslizar por **teclado** (flechas o WASD) y por **puntero** (clic o toque sobre una ficha; si
  comparte fila o columna con el hueco desliza toda la línea).
- Reloj de partida que arranca con el primer movimiento y se recarga al resolver cada tablero.
- Puntuación por tablero resuelto según los movimientos gastados; nivel = tableros resueltos + 1,
  con tableros más revueltos cada nivel.
- Resaltado de las fichas que ya están en su sitio.
- Nueva ficha `rompecabezas-numerico` en `lib/games.ts` (categoría `PUZZLE`) y clase de portada
  `cover-rompecabezas-numerico` en `app/globals.css`.
- Una línea `rompecabezas-numerico` en `GAME_ENGINES` (`lib/games/registry.ts`).
- Migración `insert into public.games (id, title) values ('rompecabezas-numerico', '15 PUZZLE')` y su
  aplicación.

**Fuera de alcance (para specs futuras):**

- Tableros de otros tamaños, fichas bloqueadas, vidas o presupuesto de movimientos (es la variante
  `02-tamanos-y-candados.md`).
- Deshacer movimientos.
- Solver o pista automática.
- Imágenes en lugar de números.
- Sonido y skins `clasico`/`neon`/`retro`.
- Modo de dos jugadores o carrera.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni tipo de plataforma nuevo.** `scores` y `game_stats`
sirven a este juego sin tocarlas, y el leaderboard se enciende con una fila en `games`.

Tipos locales del motor, sin exportar:

```ts
type Dir = "up" | "down" | "left" | "right"; // dirección en que SE MUEVE la ficha
type State = "playing" | "solved" | "gameover";
```

Estado en la clausura de `createRompecabezasNumericoGame`:

- `board: number[]` — 16 posiciones en orden de lectura (índice = `fila * 4 + col`); `0` es el hueco.
- `blank: number` — índice del hueco, siempre sincronizado con `board`.
- `moves` (fichas deslizadas en el tablero actual), `score`, `level`, `solvedCount`.
- `timeLeft` (ms de reloj de partida), `clockRunning` (false hasta el primer movimiento válido).
- `slides: { tile: number; from: number; t: number }[]` — animaciones activas de deslizamiento
  (`t` en ms desde su inicio).
- `state: State`, `solvedFlashMs` (ms restantes de la celebración al resolver).
- Bucle: `rafId`, `lastTime`, `destroyed`.

---

## Plan de implementación

### 1. Motor: constantes y lógica de tablero

`lib/games/rompecabezas-numerico/engine.ts`. Constantes de diseño:

```
W 560 · H 620 · HUD_H 60
N 4 · CELL 130 · TILE_INSET 4 · BOARD_X 20 · BOARD_Y 80
SLIDE_MS 90 · SOLVED_FLASH_MS 600 · DT_MAX 50 ms
TIME_START_MS 120000 · TIME_BONUS_MS 20000 · TIME_CAP_MS 180000
SCRAMBLE_BASE 30 · SCRAMBLE_STEP 10 · SCRAMBLE_MAX 100
  scrambleLen(level) = min(SCRAMBLE_MAX, SCRAMBLE_BASE + SCRAMBLE_STEP * (level - 1))
MIN_MISPLACED 8 (fichas fuera de sitio mínimas en un tablero recién generado)
SOLVE_BASE 1000 · MOVE_PENALTY 8 · SOLVE_MIN 100
  puntos(tablero) = max(SOLVE_MIN, SOLVE_BASE - MOVE_PENALTY * moves) * level
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Lógica:

- **Estado resuelto:** `board[i] = i + 1` para `i < 15` y `board[15] = 0`.
- **Generación:** parte del estado resuelto y hace `scrambleLen(level)` movimientos legales
  aleatorios: en cada paso elige al azar, entre los vecinos ortogonales del hueco, uno que **no sea
  la celda de la que acaba de venir el hueco** (prohíbe deshacer el paso anterior), e intercambia.
  Si al terminar hay menos de `MIN_MISPLACED` fichas fuera de sitio o el tablero ya está resuelto,
  repite la generación. Como solo se usan movimientos legales, el tablero es resoluble por
  construcción; **nunca** se baraja un array al azar (la mitad de las permutaciones no tiene
  solución).
- **Movimiento por dirección** `move(dir)`: la ficha que se mueve es la vecina del hueco situada en
  el lado **contrario** a `dir` (`dir = right` desliza hacia la derecha la ficha que está a la
  izquierda del hueco). Si el hueco está en ese borde, no ocurre nada: ni cuenta movimiento ni
  arranca el reloj.
- **Movimiento por clic** `moveAt(cell)`: si la celda comparte fila o columna con el hueco,
  desliza, de una en una desde la más cercana al hueco, todas las fichas intermedias hacia el hueco.
  Cada ficha deslizada suma **1 a `moves`** (clic sobre una ficha a 3 celdas = 3 movimientos), para
  que el atajo del ratón no sea más barato que el teclado. Clic sobre el hueco o sobre una ficha que
  no comparte línea con el hueco: no hace nada.
- Cada ficha deslizada añade una entrada a `slides` con su celda de origen; el estado lógico se
  actualiza **al instante** y la animación es solo visual (`SLIDE_MS`).
- **Resolución:** tras cada movimiento se comprueba si `board` es el estado resuelto. Si lo es:
  `state = "solved"`, `solvedFlashMs = SOLVED_FLASH_MS`, `score += puntos(tablero)`,
  `solvedCount++`, `timeLeft = min(TIME_CAP_MS, timeLeft + TIME_BONUS_MS)`. Durante `solved` el
  reloj no corre y las entradas se ignoran.
- Al acabar la celebración: `level = 1 + solvedCount`, tablero nuevo con `scrambleLen(level)`,
  `moves = 0`, `state = "playing"`. El reloj queda parado hasta el siguiente movimiento válido.
- **Reloj:** corre solo con `state === "playing"` y `clockRunning`. Si `timeLeft` llega a `0`
  estando en `playing`: `state = "gameover"`. Si el último movimiento resuelve el tablero en el
  mismo frame en que se agota el reloj, **gana la resolución** (se evalúa primero).

Comprobación: `npm run build` limpio; revisión manual con el tablero impreso por consola de que
50 generaciones seguidas devuelven tableros con ≥ 8 fichas fuera de sitio y resolubles (se pueden
deshacer con los movimientos inversos).

### 2. Motor: bucle, entrada y callbacks

- `emit()` con `lastScore` / `lastLives` / `lastLevel`. `onLives(1)` una vez, como Tetris y Snake.
- Bucle `requestAnimationFrame` con `dt` capado a `DT_MAX`; `lastTime = null` al reanudar. El
  reloj descuenta `dt`; las animaciones de `slides` avanzan `dt` y se descartan al pasar `SLIDE_MS`.
- Game over: `stopLoop()` y `onGameOver(score)` una sola vez. `resume()` es no-op después.
- `restart()`: detiene el bucle, `score = 0`, `solvedCount = 0`, `level = 1`, `timeLeft =
  TIME_START_MS`, tablero nuevo, `emit()`, arranca.
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`, `KeyD`.
  `preventDefault()` solo para esas. Mapeo: la tecla indica **hacia dónde se mueve la ficha**.
- Puntero: `pointerdown` sobre el canvas convierte `clientX/Y` a mundo con el factor
  `canvas.width / rect.width`, comprueba que cae dentro de `BOARD_X..BOARD_X+520` /
  `BOARD_Y..BOARD_Y+520` y calcula `cell = floor((y - BOARD_Y) / CELL) * 4 + floor((x - BOARD_X) / CELL)`.
  `canvas.style.touchAction = "none"`.
- Listeners `keydown` / `blur` / `pointerdown` sobre el canvas, nunca sobre `window`. `P` y `Escape`
  no llegan al motor.
- `destroy()` cancela el frame, quita los listeners y es idempotente.
- `initGame(); draw();` antes de devolver.

Comprobación: `npm run build` limpio.

### 3. Motor: dibujo

`draw()` pinta, en este orden:

- Fondo negro de 560×620 y una franja HUD (`y 0..60`) con `MOVS 000` alineado a la izquierda y
  `TIEMPO m:ss` a la derecha; el reloj pasa a magenta cuando `timeLeft < 15000`.
- Marco del tablero (520×520) con borde cian de 2 px.
- Cada ficha como rectángulo redondeado de `CELL - 2 * TILE_INSET` con el número centrado en
  `bold 56px monospace`. Fichas fuera de sitio: relleno oscuro y borde cian; **fichas en su sitio**:
  relleno verde neón apagado y borde verde. El hueco no se dibuja (se ve el fondo).
- Fichas en animación: se interpolan linealmente entre su celda de origen y la de destino con
  `t / SLIDE_MS`.
- `solved`: destello (alterna el borde del tablero entre verde y blanco cada 100 ms) y el rótulo
  `¡RESUELTO! +NNN` centrado sobre el tablero, dentro del canvas porque es estado propio del juego.
- Mientras `clockRunning` es false en el primer tablero de la partida: rótulo
  `MUEVE UNA FICHA PARA EMPEZAR` bajo la franja HUD.
- Sin puntuación, nivel ni overlays de game over en el canvas: eso lo pinta el HUD de React y el
  modal.

Comprobación: `/jugar/rompecabezas-numerico` pinta el canvas real (tras el paso 5).

### 4. Ficha del catálogo y portada

`lib/games.ts`, entrada nueva:

```ts
{
  id: "rompecabezas-numerico",
  title: "15 PUZZLE",
  short: "Desliza las fichas hasta ordenarlas antes de que se acabe el tiempo.",
  long: "Quince fichas numeradas y un único hueco. Desliza, ordena del 1 al 15 y recupera tiempo con cada tablero resuelto. Cada tablero llega más revuelto que el anterior.",
  cat: "PUZZLE",
  cover: "cover-rompecabezas-numerico",
  color: "yellow",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `.cover-rompecabezas-numerico` nueva, cuadrícula 4×4 de baldosas
oscuras con borde neón amarillo hecha con `repeating-linear-gradient`, y un hueco (celda sin
baldosa) abajo a la derecha, siguiendo el patrón de `.cover-tetro` y `.cover-snake`.

Comprobación: la tarjeta aparece en `/biblioteca` en el filtro PUZZLE con su portada.

### 5. Registro

`lib/games/registry.ts`:

```ts
"rompecabezas-numerico": {
  create: createRompecabezasNumericoGame,
  width: 560,
  height: 620,
  controls: "flechas o WASD para deslizar una ficha hacia el hueco, o clic sobre una ficha para deslizarla",
  touch: {},
},
```

`touch: {}` pinta solo la cruceta (la cruceta no autorrepite: cada pulsación es un movimiento).

Comprobación: `/jugar/rompecabezas-numerico` pinta el canvas real, no la `.game-arena`.

### 6. Leaderboard

`supabase/migrations/20261027120000_juego_rompecabezas_numerico.sql`, con timestamp posterior a
`20261026120000`:

```sql
insert into public.games (id, title) values ('rompecabezas-numerico', '15 PUZZLE');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. **Los tipos no se
regeneran**: insertar una fila no cambia el esquema.

Comprobación: `select id from public.games` incluye `rompecabezas-numerico`.

### 7. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos y el recorrido manual de
los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/rompecabezas-numerico` muestra un canvas de 560×620 con tablero de 4×4 y el hueco, no la `.game-arena`.
- [ ] El primer tablero tiene al menos 8 fichas fuera de su sitio y nunca aparece ya resuelto.
- [ ] El reloj no corre ni descuenta hasta el primer movimiento válido.
- [ ] Con el hueco abajo a la derecha, `→` desliza a la derecha la ficha situada a su izquierda y `↓` desliza hacia abajo la que está encima.
- [ ] Pulsar una dirección cuyo lado contrario no tiene ficha (hueco en el borde) no cambia nada ni cuenta movimiento.
- [ ] Hacer clic en una ficha vecina del hueco la desliza; hacer clic en una ficha a 3 celdas en la misma fila desliza las 3 y suma 3 a `MOVS`.
- [ ] Hacer clic en una ficha que no comparte fila ni columna con el hueco, o en el propio hueco, no hace nada.
- [ ] Las fichas en su posición final se pintan en verde; el resto, en oscuro con borde cian.
- [ ] Resolver el tablero pinta `¡RESUELTO!`, congela el reloj, suma `max(100, 1000 - 8 × movs) × nivel` en el HUD y añade 20 s al reloj sin superar 3:00.
- [ ] El siguiente tablero llega con nivel 02 y más revuelto: `scrambleLen` pasa de 30 a 40.
- [ ] Una partida de 100 tableros generados es resoluble: ninguno se queda atascado en la paridad (ver Riesgos).
- [ ] Con 15 s o menos el reloj del canvas pasa a magenta.
- [ ] Al llegar el reloj a 0:00 se abre el modal `FIN DEL JUEGO` con la puntuación real; una partida sin ningún tablero resuelto cierra con 0.
- [ ] Resolver el tablero y agotar el reloj en el mismo frame cuenta la resolución.
- [ ] El HUD muestra 1 vida desde el inicio.
- [ ] El canvas no dibuja puntos, nivel ni vidas, ni ningún overlay de game over.
- [ ] El botón `PAUSA` congela el reloj y las animaciones, y `REANUDAR` continúa sin descontar tiempo extra.
- [ ] `P` y `Escape` hacen lo mismo que el botón.
- [ ] Con el canvas enfocado, las flechas no hacen scroll de la página.
- [ ] Escribir `W`, `A`, `S`, `D` o espacio en el campo de iniciales no mueve ninguna ficha ni reinicia el juego.
- [ ] En móvil, la cruceta del mando táctil desliza fichas y tocar una ficha en el canvas también, sin scroll de página.
- [ ] `JUGAR DE NUEVO` reinicia a nivel 1, 0 puntos, reloj en 2:00 y tablero nuevo sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'rompecabezas-numerico'`.
- [ ] Esa puntuación aparece en `/salon?juego=rompecabezas-numerico` y en `/juegos/rompecabezas-numerico` sin recargar a mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Con `scores` vacía para este juego, `/salon?juego=rompecabezas-numerico` muestra el estado vacío.
- [ ] Navegar de `/jugar/rompecabezas-numerico` a `/biblioteca` y volver no duplica el bucle.
- [ ] Dejar la pestaña en segundo plano y volver no descuenta de golpe más de 50 ms al reloj.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid`, `/jugar/snake` y `/jugar/frogger` se juegan igual que antes.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/rompecabezas-numerico`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** generar el tablero con caminata aleatoria de movimientos legales desde el estado
  resuelto. Garantiza resolubilidad sin implementar un chequeo de paridad.
- **No:** barajar el array al azar. La mitad de las permutaciones del 15-puzzle no tiene solución.
- **Sí:** prohibir deshacer el paso anterior durante la caminata. Sin ello, a `scrambleLen` bajo el
  tablero puede quedar prácticamente resuelto.
- **Sí:** exigir `MIN_MISPLACED` fichas fuera de sitio. Evita tableros triviales de 2-3 movimientos.
- **Sí:** reloj único de partida con recarga al resolver. Es la forma más simple de dar derrota y
  ritmo a un juego que por sí mismo no los tiene.
- **No:** reloj por tablero. Un tablero atascado mataría la partida sin dar una segunda oportunidad.
- **Sí:** el reloj arranca con el primer movimiento y se detiene durante la celebración. Mirar el
  tablero antes de actuar no debe costar tiempo.
- **Sí:** una vida, como Tetris y Snake. La única condición de derrota es el reloj.
- **Sí:** las flechas indican hacia dónde **se mueve la ficha**. Es la lectura más directa para quien
  mira la ficha, no el hueco. Queda documentada en el `aria-label` del canvas.
- **Sí:** clic con deslizamiento de línea, contando una ficha = un movimiento. El ratón es cómodo,
  pero no más barato en puntos.
- **Sí:** puntos × nivel. Hace que sobrevivir más tableros pese más que ser perfecto en uno.
- **Sí:** resaltar fichas en su sitio. Es ayuda de lectura, no de resolución.
- **No:** deshacer, pista o solver. Cambiarían la economía de movimientos y puntos.
- **No:** sonido ni skins. No hay assets de audio y las paletas son una capa independiente.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Sin original, las constantes se ajustan «a ojo» durante la implementación. | El paso 1 las fija y las declara fuera de alcance. |
| Tablero generado irresoluble (error de paridad). | Solo se generan con movimientos legales desde el estado resuelto; nunca se baraja un array. |
| La caminata aleatoria deja tableros casi resueltos. | Se prohíbe el paso inverso inmediato y se exige `MIN_MISPLACED` con reintento. |
| Un clic de línea que desliza 3 fichas contradice la animación de una sola. | Cada ficha deslizada crea su propia entrada en `slides`; se anima en cascada con la lógica ya actualizada. |
| El jugador espera que la flecha mueva el hueco, no la ficha. | Rótulo de controles en el `aria-label`; la decisión queda registrada y es el único mapeo en la spec. |
| En móvil el toque sobre el canvas hace scroll o zoom. | `touch-action: none` en el canvas y `preventDefault` solo en `pointerdown` sobre el tablero. |
| El reloj sigue corriendo con el modal de iniciales abierto. | Bucle parado con el modal abierto; `onGameOver` se emite una sola vez. |
| Pestaña en segundo plano: un `dt` enorme agota el reloj de golpe. | `dt` capado a 50 ms y `lastTime = null` al reanudar. |
| Resolver y agotar el reloj en el mismo frame deja el estado ambiguo. | Se evalúa primero la resolución; el reloj se mira después. |
| Spam de teclas durante una animación rompe el estado visual. | La lógica es instantánea y las animaciones son solo visuales, por ficha. |

---

## Lo que **no** entra en esta spec

- Tableros de otros tamaños, fichas bloqueadas, vidas o presupuesto de movimientos
  (`02-tamanos-y-candados.md`).
- Deshacer, pista o solver.
- Sonido y skins.
- Modo de dos jugadores.
- Cambios a `scores`, `game_stats` o a la plataforma.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
