# SPEC — MATCH CRISTAL: clásico por movimientos

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-07
> **Objetivo:** Diseñar `match-cristal` como un match-3 de intercambio en grilla de 8×8 con
> seis cristales de forma y color distintos, un presupuesto fijo de movimientos por nivel y una
> meta de puntos creciente, sin cristales especiales: la versión mínima y legible del género.

---

## Por qué existe esta spec

El catálogo tiene un solo juego PUZZLE real, `caida` (Tetris), y es de reflejos: la presión es
la gravedad. `match-cristal` aporta el otro polo del género: lógica por turnos, sin reloj, donde
la presión viene de un número limitado de movimientos y de una meta de puntos. Es el clásico
swap-and-match (Bejeweled / Candy Crush) que `References/.../game-suggestions-todo.md` lista como
pendiente.

Esta es la primera de dos variantes. Comparte con `02-cristales-y-reacciones.md` el género, el
mundo lógico de 576×640, la grilla de 8×8 celdas de 64 px, los seis cristales, la mecánica de
intercambio, la gravedad con relleno aleatorio, los controles y el contrato `GameEngine`. Nada
de eso cambia entre variantes.

Lo que cambia es el eje de la partida. Aquí: **movimientos limitados, meta de puntos por nivel,
cero cristales especiales**. Gana quien planifica cascadas con 20 movimientos; es un puzzle de
cabeza fría. La variante 02 cambia el movimiento por un reloj y añade cristales especiales.

Como Snake (SPEC 10), no hay código de referencia: ninguna carpeta `References/.../match3`
existe. Las constantes de esta spec **son** el diseño; cambiarlas durante la implementación es
rediseñar, no implementar.

---

## Alcance

**Dentro:**

- `lib/games/match-cristal/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createMatchCristalGame`.
- Mundo lógico de **576×640**: franja superior de 96 px para el estado propio del juego
  (movimientos restantes y barra de progreso hacia la meta) y tablero de 8×8 celdas de 64 px
  (512×512) en `x 32..544`, `y 96..608`.
- Seis cristales distinguibles por **forma además de color** (rombo, círculo, triángulo,
  cuadrado, hexágono, estrella), dibujados con rutas de canvas, sin imágenes.
- Intercambio de dos cristales adyacentes, solo válido si genera una línea de 3 o más.
- Cascadas: gravedad, relleno aleatorio desde arriba y re-evaluación hasta que el tablero se
  estabiliza.
- Niveles: 20 movimientos por nivel, meta de puntos creciente; pasar de nivel convierte los
  movimientos sobrantes en bonus.
- Reorganización automática del tablero cuando no queda ningún movimiento válido.
- Entrada por ratón/táctil (arrastrar o toque-toque) y por teclado (cursor + selección).
- Una entrada `match-cristal` en `GAME_ENGINES`.
- Nueva ficha `match-cristal` en `lib/games.ts` (categoría `PUZZLE`) y clase de portada
  `cover-cristal` en `app/globals.css`.
- Migración `insert into public.games (id, title) values ('match-cristal', 'MATCH CRISTAL')` y
  su aplicación.

**Fuera de alcance (para specs futuras o si se prefiere la variante 02):**

- Cristales especiales (rayados, bombas, prismas) y cualquier efecto de área.
- Reloj de partida o presión temporal de cualquier tipo.
- Obstáculos de tablero (hielo, piedra, huecos), objetivos distintos de «alcanzar puntos».
- Pistas automáticas de movimiento posible.
- Sonido.
- Skins (`clasico`/`neon`/`retro`).
- Mando táctil de plataforma: el juego se controla tocando el propio canvas.
- Varias vidas. Autenticación, `scores.user_id` desde el motor y la fila `▸ TU MEJOR MARCA`
  real: los pone la plataforma (SPEC 14/15), no el motor.

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni clave de `localStorage`.** `scores` y `game_stats`
sirven a este juego sin tocarlas; el leaderboard se enciende con una fila en `games`. El
`user_id` de la puntuación (SPEC 15) lo rellena la plataforma al guardar, no el motor.

Tipos locales del motor, sin exportar:

```ts
type Gem = 0 | 1 | 2 | 3 | 4 | 5;            // índice en GEM_SHAPES / GEM_COLORS
type Cell = { gem: Gem | null; yOff: number } // null = hueco; yOff = desplazamiento visual en px (≤ 0 al caer)
type Phase = "idle" | "swap" | "swapBack" | "clear" | "fall" | "shuffle" | "levelUp" | "gameover";
type Pos = { c: number; r: number };          // columna, fila; origen arriba-izquierda
```

Estado en la clausura:

- `board: Cell[][]` (`board[r][c]`), `phase: Phase`, `phaseT` (ms en la fase actual).
- `swapA: Pos | null`, `swapB: Pos | null` (el intercambio en curso).
- `selected: Pos | null` (cursor de selección), `cursor: Pos` (cursor de teclado).
- `clearing: Pos[]` (celdas que se están borrando), `cascade` (nº de cascada del movimiento
  actual, 0 al empezar).
- `score`, `levelScore` (puntos ganados en el nivel actual), `level`, `moves` (restantes).
- `popups: { x, y, text, age }[]` (números flotantes de puntos; solo decorado).
- Bucle: `rafId`, `lastTime`, `destroyed`. Entrada: `dragStart: { pos, px, py } | null`.

---

## Plan de implementación

### 1. Constantes de diseño

`lib/games/match-cristal/engine.ts`. Constantes, fijadas de una vez:

```
W 576 · H 640 · COLS 8 · ROWS 8 · CELL 64 · BOARD_X 32 · BOARD_Y 96
GEM_COUNT 6 · GEM_RADIUS 24 px (el cristal ocupa ~75 % de la celda)
MOVES_PER_LEVEL 20
TARGET(level) = 1500 + 750 * (level - 1)
SWAP_MS 180 · SWAP_BACK_MS 180 · CLEAR_MS 220 · SHUFFLE_MS 600 · LEVELUP_MS 1200
FALL_SPEED 720 px/s (constante, sin aceleración) · DT_MAX 50 ms
DRAG_MIN 24 px (en espacio lógico) para reconocer un arrastre
RUN_POINTS: 3 → 30 · 4 → 80 · 5 → 150 · n ≥ 6 → 150 + 100 * (n - 5)
CASCADE_MULT(k) = min(5, k + 1)  // k = 0 para la primera línea del movimiento
LEFTOVER_BONUS 50 por movimiento sobrante
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Paleta fija (hex), cada índice con su forma: `0` cian `#00e5ff` rombo · `1` magenta `#ff2bd6`
círculo · `2` amarillo `#ffe23a` triángulo · `3` verde `#39ff88` cuadrado redondeado ·
`4` naranja `#ff8a2b` hexágono · `5` violeta `#9a6bff` estrella de 5 puntas. Distinguibles
por forma con la paleta en escala de grises.

Comprobación: `npm run build` limpio.

### 2. Motor: tablero y detección de líneas

- **Generación inicial:** rellenar fila a fila; cada celda con un gem aleatorio, rechazando los
  valores que formarían una línea de 3 con las dos celdas anteriores en horizontal o vertical.
  Tras generar, si no hay ningún movimiento válido, se regenera entero (máx. 20 intentos; si
  se agotan, se aplica la reorganización del paso 4).
- **Línea:** 3 o más celdas consecutivas con el mismo gem en fila o columna. `findRuns()`
  devuelve cada línea maximal por separado. Una celda que pertenece a una línea horizontal y a
  una vertical (forma L, T o cruz) se borra **una sola vez** pero **puntúa en ambas** líneas.
- **Movimiento válido:** intercambiar dos celdas adyacentes (ortogonal; nunca diagonal ni
  distancia 2) tal que `findRuns()` sobre el tablero resultante no esté vacío. `hasMoves()`
  recorre todos los pares adyacentes con intercambio simulado y deshecho.
- **Intercambio inválido:** se anima el intercambio (`SWAP_MS`), se anima la vuelta
  (`SWAP_BACK_MS`) y **no consume movimiento**.

Comprobación: `npm run build` limpio.

### 3. Motor: resolución, puntuación y gravedad

Máquina de fases (`phase`), solo `idle` acepta entrada:

1. `idle` → el jugador intercambia A↔B. Si es válido: `moves--`, `cascade = 0`, fase `swap`.
   Si no: fase `swap` y luego `swapBack`.
2. `swap` (`SWAP_MS`): interpolación visual de A y B. Al terminar se llama a `findRuns()`; con
   resultado vacío (intercambio inválido) pasa a `swapBack`; con resultado, a `clear`.
3. `clear` (`CLEAR_MS`): las celdas de `clearing` se encogen y desaparecen. Al empezar la fase
   se suma la puntuación: por cada línea `RUN_POINTS[len] * CASCADE_MULT(cascade)`; se suma a
   `score` y a `levelScore`, y se emite un `popup` en el centro de cada línea. `cascade++`.
4. `fall`: los huecos se llenan: cada columna se compacta hacia abajo y se generan gems nuevos
   aleatorios por encima del tablero (`yOff` negativo). Las celdas bajan a `FALL_SPEED`; al
   terminar todas se vuelve a `findRuns()`: si hay líneas, `clear` (cascada); si no, se
   estabiliza.
5. Estabilizado (sin líneas): se evalúa en este orden — a) `levelScore >= TARGET(level)` →
   fase `levelUp`; b) `moves == 0` → fase `gameover`; c) `!hasMoves()` → fase `shuffle`;
   d) fase `idle`.
   - Se evalúa a) antes que b): alcanzar la meta con el último movimiento **gana** el nivel.
   - Las cascadas **no** se interrumpen al alcanzar la meta: la meta se comprueba solo cuando el
     tablero se estabiliza, para que el jugador cobre toda la cascada.
6. `levelUp` (`LEVELUP_MS`): bonus `LEFTOVER_BONUS * moves` sumado a `score`; `level++`,
   `moves = MOVES_PER_LEVEL`, `levelScore = 0`; tablero nuevo con la generación inicial.
   `onLevel` se emite una vez al empezar la fase.
7. `shuffle` (`SHUFFLE_MS`): se baraja el contenido actual del tablero (mismos gems, otras
   posiciones) hasta que `findRuns()` esté vacío y `hasMoves()` sea verdadero (máx. 50
   intentos; si se agotan, se regenera el tablero con la generación inicial). No consume
   movimiento ni puntúa.
8. `gameover`: `stopLoop()` y `onGameOver(score)` **una sola vez**.

Comprobación: `npm run build` limpio.

### 4. Motor: entrada

`GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`,
`KeyD`, `Space`, `Enter`. `preventDefault()` solo para esas. `P` y `Escape` no llegan al
motor; las gestiona la plataforma.

- **Ratón / táctil (Pointer Events sobre el canvas):**
  - `pointerdown` sobre una celda la selecciona y arranca `dragStart` (con
    `setPointerCapture`).
  - `pointermove`: si el desplazamiento supera `DRAG_MIN` en espacio lógico, se intercambia
    con la celda vecina en el eje dominante (empate → horizontal) y se limpia la selección.
  - `pointerup` sin arrastre: si ya había otra celda **adyacente** seleccionada, se
    intercambian; si no adyacente, la nueva toma la selección; tocar la misma deselecciona.
  - Coordenadas: `lógica = (cliente - rect) * (W / rect.width)`, porque el CSS escala el
    canvas.
  - Con `phase !== "idle"` toda entrada se descarta (la selección se pierde).
- **Teclado:** flechas o WASD mueven `cursor` (se queda en el borde, no da la vuelta);
  `Space`/`Enter` marca o desmarca `selected` en el cursor; con `selected` activo, una flecha
  intercambia en esa dirección y limpia la selección.
- Listeners `keydown`, `blur` y `pointer*` sobre el canvas, nunca sobre `window`. `blur`
  cancela `dragStart` y la selección.

Comprobación: `npm run build` limpio.

### 5. Motor: dibujo, avisos y ciclo de vida

- `emit()` con `lastScore` / `lastLevel`; `onScore` y `onLevel` solo cuando el valor cambia.
  `onLives(1)` una sola vez al arrancar, como Tetris y Snake: la plataforma rotula `Vidas`
  para todos y el motor no tiene vidas.
- `draw()`: fondo `#0a0a18`; panel superior con el rótulo `MOVIMIENTOS` y el número grande,
  más una barra de progreso `levelScore / TARGET(level)` (llena = meta). La barra y el
  contador de movimientos son estado propio del juego y se dibujan en el canvas; la
  puntuación total, el nivel y las vidas **no** se dibujan (los pone el HUD). Tablero con
  celdas alternas ligeramente más claras; cursor de teclado con borde; celda seleccionada con
  brillo pulsante; popups de puntos que suben y se desvanecen en 700 ms.
- Con `phase === "levelUp"` se permite un rótulo `NIVEL SUPERADO` dentro del canvas; con
  `shuffle`, `SIN MOVIMIENTOS · BARAJANDO`. Ningún overlay de game over: lo muestra la
  plataforma.
- `resume()` es no-op tras `gameover`. `restart()`: detiene el bucle, `initGame()`, `emit()`,
  arranca. `destroy()` cancela el frame, quita los listeners, suelta el pointer capture y es
  idempotente.
- `dt` capado a `DT_MAX`; `lastTime = null` al reanudar, para que una pestaña en segundo plano
  no resuelva varias cascadas de golpe.
- `initGame(); draw();` antes de devolver.

Comprobación: `npm run build` limpio.

### 6. Catálogo: nueva ficha `match-cristal`

`lib/games.ts`, nueva entrada en `GAMES`:

```ts
{
  id: "match-cristal",
  title: "MATCH CRISTAL",
  short: "Alinea cristales y planifica cada movimiento.",
  long: "Una cámara de cristales de seis formas y colores. Intercambia dos vecinos para alinear tres o más, provoca cascadas y alcanza la meta antes de agotar tus veinte movimientos. Cada nivel pide más.",
  cat: "PUZZLE",
  cover: "cover-cristal",
  color: "cyan",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `.cover-cristal` nueva (degradado oscuro + una rejilla de rombos
pequeños con `radial-gradient`/`linear-gradient`, como las otras portadas generadas), compartida
con la variante 02 si se implementan ambas.

Comprobación: `/juegos/match-cristal` muestra la ficha en la biblioteca con su portada, antes
de que el motor esté registrado.

### 7. Registrar el motor

`lib/games/registry.ts`:

```ts
"match-cristal": {
  create: createMatchCristalGame,
  width: 576,
  height: 640,
  controls: "ratón o toque para arrastrar un cristal a su vecino, o flechas y espacio para elegir y mover",
  touch: {},
},
```

`touch: {}` (sin botones): el juego se controla tocando el canvas, como Snake.

Comprobación: `/jugar/match-cristal` pinta el canvas real en vez de `.game-arena`.

### 8. Leaderboard

`supabase/migrations/<timestamp>_juego_match_cristal.sql`, con timestamp posterior a
`20260927130000`:

```sql
insert into public.games (id, title) values ('match-cristal', 'MATCH CRISTAL');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. Los tipos no se
regeneran: insertar una fila no cambia el esquema. La puntuación la guarda la plataforma con
`user_id` según la SPEC 15; el motor solo llama a `onGameOver(score)`.

Comprobación: `select * from public.games` incluye la fila `match-cristal`.

### 9. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido
manual de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/match-cristal` muestra un canvas de 576×640 con tablero de 8×8, no la `.game-arena`.
- [ ] Al empezar no hay ninguna línea de 3 en el tablero y existe al menos un movimiento válido.
- [ ] Los seis cristales se distinguen por forma además de por color.
- [ ] Arrastrar un cristal hacia un vecino lo intercambia; arrastrar menos de 24 px no hace nada.
- [ ] Toque-toque sobre dos celdas adyacentes las intercambia; sobre dos no adyacentes la
      segunda pasa a ser la selección.
- [ ] Con el teclado, flechas/WASD mueven el cursor, `Space` selecciona y una flecha intercambia.
- [ ] Un intercambio que no forma línea se anima de ida y vuelta y **no** descuenta movimiento.
- [ ] Un intercambio válido descuenta exactamente 1 movimiento del contador del canvas.
- [ ] Una línea de 3 suma 30, de 4 suma 80 y de 5 suma 150 en la primera cascada.
- [ ] Una cascada de segundo nivel multiplica ×2 y la de quinto nivel o más ×5, nunca más.
- [ ] Una figura en L, T o cruz borra la celda compartida una vez y puntúa ambas líneas.
- [ ] Los cristales nuevos caen por gravedad; ningún cristal queda flotando sobre un hueco.
- [ ] Mientras el tablero se anima (`swap`, `clear`, `fall`) el input se ignora.
- [ ] Al alcanzar `TARGET(level)` el HUD pasa a nivel 02, los movimientos vuelven a 20 y los
      sobrantes suman `50` cada uno.
- [ ] Alcanzar la meta con el último movimiento **gana** el nivel, no abre `FIN DEL JUEGO`.
- [ ] Con 0 movimientos y la meta sin cumplir se abre el modal `FIN DEL JUEGO` con la
      puntuación acumulada real.
- [ ] Un tablero sin movimientos posibles se baraja solo, muestra el rótulo y no gasta movimiento.
- [ ] El HUD muestra 1 vida desde el inicio.
- [ ] El canvas no dibuja puntuación total, nivel ni vidas ni overlay de game over; sí
      movimientos y barra de meta.
- [ ] El botón `PAUSA` congela el juego (incluida una cascada a medias) y `REANUDAR` lo
      continúa sin saltarse fases; `P` y `Escape` hacen lo mismo.
- [ ] Con el canvas enfocado, las flechas y el espacio no hacen scroll de la página.
- [ ] Escribir `W`, `A`, `S`, `D` o espacio en el campo de iniciales no mueve ni reinicia el juego.
- [ ] En un móvil, tocar y arrastrar sobre el canvas funciona con el canvas escalado por CSS
      (las celdas se eligen donde se toca, no desplazadas).
- [ ] `JUGAR DE NUEVO` reinicia a nivel 1, 0 puntos y 20 movimientos sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'match-cristal'`.
- [ ] Esa puntuación aparece en `/salon?juego=match-cristal` y en `/juegos/match-cristal` sin
      recargar a mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Con `scores` vacía para este juego, `/salon?juego=match-cristal` muestra el estado vacío.
- [ ] Navegar de `/jugar/match-cristal` a `/biblioteca` y volver no duplica el bucle.
- [ ] Dejar la pestaña en segundo plano y volver no resuelve varias cascadas de golpe.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid` y `/jugar/snake` se juegan igual que antes.
- [ ] `select * from public.games` incluye `match-cristal` y no pierde ninguna fila existente.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/match-cristal`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** `id` `match-cristal`. No choca con ningún `id` de `lib/games.ts` ni con otra carpeta
  de `specs/game-jam/`.
- **Sí:** movimientos limitados y meta de puntos. Convierte el match-3 en un puzzle de
  planificación y da sentido al HUD de nivel; el reloj es el eje de la variante 02.
- **Sí:** el intercambio inválido no cuesta movimiento. Penalizar un fallo de puntería en
  móvil sería castigar la precisión del dedo, no la decisión.
- **Sí:** comprobar la meta al estabilizarse, no a mitad de cascada. Cobrar la cascada
  completa evita la sensación de «me cortó la combinación».
- **Sí:** meta antes que fin de movimientos. El último movimiento puede ganar el nivel.
- **Sí:** celda compartida en L/T/cruz puntúa en ambas líneas. Premia las figuras sin inventar
  una tabla aparte.
- **Sí:** multiplicador de cascada con techo ×5. Sin techo una cascada afortunada rompe el
  leaderboard.
- **Sí:** seis gems con forma distinta. Accesibilidad para daltonismo sin coste de assets.
- **Sí:** 8×8 de 64 px. El tamaño estándar del género; 64 px es un objetivo táctil cómodo
  incluso con el canvas escalado en un móvil estrecho.
- **Sí:** sin imágenes, todo con rutas de canvas. Evita carga de assets y el riesgo de
  callbacks vivos al desmontar.
- **Sí:** `onLives(1)` una vez, como Tetris y Snake.
- **No:** especiales, reloj, obstáculos, pistas. Son variante 02 u otras specs.
- **No:** sonido. No hay assets de audio.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo                                                                                          | Mitigación                                                                                                        |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Cascadas aleatorias que dejan el tablero sin movimientos válidos.                               | `hasMoves()` tras cada estabilización y fase `shuffle` automática.                                                |
| El barajado no encuentra una disposición válida y el juego se cuelga.                           | Máx. 50 intentos y, si fallan, regeneración completa con la generación inicial.                                   |
| El canvas escalado por CSS desplaza la celda elegida con el dedo.                               | Conversión `(cliente - rect) * (W / rect.width)` y criterio de aceptación en móvil.                               |
| Un arrastre diagonal dispara el intercambio equivocado.                                         | Eje dominante; empate → horizontal; `DRAG_MIN` de 24 px.                                                          |
| Entrada durante la animación corrompe el tablero.                                               | Solo `idle` acepta input; `blur` y fases no idle limpian la selección.                                            |
| Pestaña en segundo plano: un `dt` enorme resuelve muchas cascadas de golpe.                     | `dt` capado a 50 ms y `lastTime = null` al reanudar.                                                              |
| La meta de nivel crece más rápido que la habilidad y el juego se vuelve imposible hacia el nivel 8. | Fórmula lineal (+750) y movimientos fijos; se verifica manualmente hasta el nivel 5; ajustar sería rediseñar.     |
| Una partida buena produce puntuaciones desproporcionadas por el techo de cascada ×5.            | Techo explícito en `CASCADE_MULT` y meta lineal; sin bonus acumulativos fuera de `LEFTOVER_BONUS`.                |
| Doble `onGameOver` si la fase se re-evalúa tras una pausa.                                      | `gameover` detiene el bucle y `resume()` es no-op tras él.                                                        |
| WASD y espacio llegan al motor mientras se escriben iniciales.                                  | Bucle parado con el modal abierto y listeners en el canvas, no en `window`.                                       |

---

## Lo que **no** entra en esta spec

- Cristales especiales, prismas, bombas o cualquier efecto de área (variante 02).
- Reloj, tiempo extra o modo contrarreloj (variante 02).
- Obstáculos de tablero y objetivos distintos de «alcanzar puntos».
- Pistas de movimiento posible.
- Sonido.
- Skins.
- Mando táctil de plataforma.
- Varias vidas.
- Rediseñar otras portadas o reescribir el copy de otras fichas.
- Autenticación, `scores.user_id` desde el motor y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
