# SPEC — RANARIA: variante clásica de grilla

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-09-22
> **Objetivo:** Diseñar el Frogger de `ranaria` como un cruce por grilla discreta, fiel al arcade original — carriles de coches y río de troncos, un salto por pulsación, muerte instantánea al fallar — como primer motor jugable para la ficha que hoy solo existe en el catálogo.

---

## Por qué existe esta spec

`ranaria` lleva desde el primer commit del catálogo como una fila de `lib/games.ts` con copy
("Cruza la autopista de pixeles.") y `seededScores()`, pero nunca tuvo mecánica: no está en
`GAME_ENGINES`, no tiene carpeta en `lib/games/`, y no aparece en
`References/resources/resources/game-suggestions-todo.md` como descartado. Es un juego jamás
diseñado, no una duplicación de otro concepto del repo.

Esta variante fija la versión mínima y más fiel al Frogger original: movimiento por celdas
discretas (no física continua), una sola pulsación de flecha = un salto de una celda, y la
regla arcade dura — pisar mal un carril o caer al agua es game over inmediato de esa vida. Es
la base sobre la que la variante 02 (`specs/game-jam/ranaria/02-progresion-powerups.md`) añade
una capa de progresión. Como los dos primeros juegos sin código de referencia de este repo
(Snake, SPEC 10), las constantes numéricas de aquí **son** el diseño: no hay original propio
que copiar celda a celda, solo el género de referencia.

---

## Alcance

**Dentro:**

- `lib/games/ranaria/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createRanariaGame`, sin sprites externos — rectángulos y formas simples con `ctx`, como
  Asteroids.
- Grilla de 16×12 celdas de 50 px en un mundo de 800×600.
- Zona de salida (fila inferior, césped), 5 carriles de carretera, franja media de césped
  (isla de seguridad), 5 carriles de río, fila superior de nenúfares (meta).
- Rana con movimiento discreto por celda, un salto por pulsación de flecha, sin diagonales.
- Coches en los carriles de carretera: velocidad y dirección fijas por carril, patrón que se
  repite en bucle (wrap horizontal).
- Troncos en los carriles de río: igual que los coches pero la rana debe subirse encima para
  no ahogarse; el tronco arrastra a la rana con su velocidad.
- 3 vidas, temporizador por vida (barra de tiempo), 5 huecos de nenúfar de los que solo uno
  se ocupa por turno.
- Puntuación: puntos por avanzar de fila (solo la primera vez que se pisa esa fila en el
  intento actual) y bonus grande al llegar a un nenúfar.
- Game over cuando se agotan las 3 vidas o el tiempo llega a 0 en la vida actual.
- Controles: flechas (sin WASD, para no chocar con el patrón de Snake que sí usa ambos —
  aquí no hace falta, un solo esquema es más legible).
- Una línea `ranaria` en `GAME_ENGINES` (referencial: esta spec no la aplica, la aplica quien
  promueva la variante).

**Fuera de alcance (para specs futuras o para la variante 02):**

- Sprites o spritesheet: coches, troncos y rana son formas geométricas de color plano.
- Sonido.
- Power-ups, moscas, serpientes en el agua, cocodrilos disfrazados de tronco.
- Progresión de niveles (velocidad creciente por ronda) — eso es exactamente lo que añade la
  variante 02.
- Controles táctiles.
- Modificar `lib/games.ts` (portada, copy, `best`, `plays`) o `lib/games/registry.ts`.
- Migraciones de Supabase.
- Autenticación, `scores.user_id`.

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni tipo de plataforma nuevo.** `scores` y
`game_stats` sirven a este juego sin tocarlas; el leaderboard se enciende con una fila en
`games` cuando la variante se promueva fuera de `specs/game-jam/`.

Tipos locales del motor, sin exportar:

```ts
type Cell = { col: number; row: number }; // origen arriba-izquierda, fila 0 = nenúfares
type LaneKind = "grass" | "road" | "median" | "river" | "goal";
type Lane = {
  row: number;
  kind: LaneKind;
  dir: 1 | -1; // 1 = derecha, -1 = izquierda; irrelevante en grass/median/goal
  speed: number; // px/s de los obstáculos de ese carril
  obstacles: Obstacle[];
};
type Obstacle = { x: number; w: number }; // posición y ancho en px, y = lane.row * CELL
```

Estado en la clausura de `createRanariaGame`:

- `frog: Cell`, `frogPixelY` (para interpolar el salto en curso).
- `lanes: Lane[]` (12 filas, generadas una vez en `initGame`).
- `slots: boolean[]` (5 nenúfares, `true` = ocupado).
- `visitedRows: Set<number>` (filas ya puntuadas en el intento actual, se reinicia por vida).
- `score`, `lives`, `timeLeft` (segundos), `state: "jumping" | "idle" | "gameover"`.
- `jumpProgress` (0..1, dura `JUMP_DURATION`), `jumpFrom: Cell`, `jumpTo: Cell`.
- Bucle: `rafId`, `lastTime`, `destroyed`.

---

## Plan de implementación

### 1. Motor: constantes y disposición de carriles

`lib/games/ranaria/engine.ts`. Constantes de diseño:

```
W 800 · H 600 · CELL 50 px · COLS 16 · ROWS 12
Filas (de arriba/row 0 a abajo/row 11):
  row 0        goal (nenúfares, 5 huecos en columnas 1,4,7,10,13)
  rows 1..5    river (5 carriles)
  row 6        median (isla de seguridad)
  rows 7..11   road (5 carriles)
START_CELL (col 8, row 11)
LIVES_START 3 · TIME_PER_LIFE 25 s
JUMP_DURATION 120 ms
ROAD_SPEEDS [90, 130, 110, 160, 140] px/s, alternando dir [1,-1,1,-1,1]
RIVER_SPEEDS [70, 100, 85, 120, 95] px/s, alternando dir [-1,1,-1,1,-1]
ROAD_GAP 220 px entre coches del mismo carril · ROAD_CAR_W 70 px
RIVER_GAP 260 px entre troncos del mismo carril · RIVER_LOG_W 130 px
POINTS_PER_NEW_ROW 10 · POINTS_GOAL 200 · POINTS_TIME_BONUS = round(timeLeft) * 5
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

`initGame()` construye `lanes` con `obstacles` iniciales espaciados por `ROAD_GAP` /
`RIVER_GAP` empezando en un offset fijo por carril (no aleatorio, para que la partida sea
reproducible y depurable), coloca la rana en `START_CELL`, `slots` todo `false`,
`visitedRows` vacío, `lives = LIVES_START`, `timeLeft = TIME_PER_LIFE`, `score = 0`,
`state = "idle"`.

Comprobación: `npm run build` limpio.

### 2. Motor: movimiento de la rana y colisiones

- Una pulsación de flecha con `state === "idle"` fija `jumpFrom = frog`, calcula `jumpTo`
  clampado a `0..COLS-1` / `0..ROWS-1`, pone `state = "jumping"`, `jumpProgress = 0`.
- Mientras `jumping`, `jumpProgress += dt / JUMP_DURATION`; al llegar a 1, `frog = jumpTo`,
  `state = "idle"`, y se resuelve la celda de destino:
  - `kind === "road"`: si algún `obstacle` solapa la columna de la rana → pierde vida
    (`loseLife()`).
  - `kind === "river"`: si ningún tronco solapa la columna → se ahoga → `loseLife()`. Si hay
    tronco, la rana queda "montada": su `x` en píxeles se mueve con `obstacle.speed * dir` en
    cada frame siguiente mientras siga en ese carril y no salte.
  - `kind === "goal"`: si la columna no coincide con un hueco libre → `loseLife()` (choca
    contra el borde de un nenúfar o uno ya ocupado). Si coincide y está libre →
    `slots[i] = true`, `score += POINTS_GOAL + POINTS_TIME_BONUS`, rana vuelve a
    `START_CELL`, `timeLeft = TIME_PER_LIFE`, `visitedRows.clear()`. Si los 5 huecos quedan
    ocupados → ronda completa: se vacían los 5 `slots` y se mantiene el juego (bucle infinito
    de rondas, sin tope de nivel en esta variante).
  - Cualquier otro `kind` (`grass`, `median`): celda segura, no pasa nada más.
- Salir del river en marcha (deriva del tronco) hasta salir de los límites `0..COLS-1` en
  píxeles cuenta como game over de esa vida igual que ahogarse.
- Al entrar por primera vez en una fila no visitada de `visitedRows` en este intento:
  `score += POINTS_PER_NEW_ROW`, se añade la fila al set. Retroceder no resta puntos ni los
  vuelve a dar.
- `loseLife()`: `lives--`; si `lives <= 0` → `state = "gameover"`, `stopLoop()`,
  `onGameOver(score)`. Si quedan vidas → rana vuelve a `START_CELL`, `visitedRows.clear()`,
  `timeLeft = TIME_PER_LIFE`, `state = "idle"`.
- `timeLeft` desciende con `dt` solo mientras `state === "idle"` o `"jumping"` (no tras
  game over); al llegar a 0 → `loseLife()`.

Comprobación: `npm run build` limpio.

### 3. Motor: bucle, entrada, dibujo y avisos

- `emit()` con `lastScore` / `lastLives` / `lastLevel`. `onLevel(1)` fijo: esta variante no
  tiene niveles.
- `draw()`: fondo por franjas de color según `LaneKind` (césped verde oscuro, asfalto gris,
  río azul), coches como rectángulos con `dir` indicada por un triángulo, troncos como
  rectángulos marrones, nenúfares como círculos verdes (rellenos si `slots[i]`), rana como
  rectángulo verde claro con dos puntos de ojos, interpolada entre `jumpFrom` y `jumpTo` con
  `jumpProgress` mientras salta.
- Barra de tiempo dibujada dentro del canvas, en una franja superior de 20 px, como estado
  propio del juego (igual que `SIN SONIDO` en Arkanoid o `PULSA UNA FLECHA` en Snake).
- Sin puntuación, vidas ni nivel fuera de esa barra: el resto lo pone el HUD de la
  plataforma.
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`. `preventDefault()` solo
  para esas. Una pulsación solo se procesa si `state === "idle"` (sin cola de saltos: a
  diferencia de Snake, el salto discreto de 120 ms es corto y encolar añadiría deriva
  perceptible).
- Listeners `keydown` / `blur` sobre el canvas, nunca sobre `window`.
- `dt` capado a `DT_MAX = 50 ms`; `lastTime = null` al reanudar.
- `destroy()` cancela el frame, quita los listeners, es idempotente.
- `restart()`: detiene el bucle, `initGame()`, `emit()`, arranca.
- `initGame(); draw();` antes de devolver.

Comprobación: `npm run build` limpio.

### 4. Repaso final (cuando esta variante se promueva)

`npm run lint` y `npm run build` limpios, recorrido manual de los criterios de aceptación.
Esta spec no ejecuta este paso: es trabajo de `/spec-impl` o `nuevo-juego` tras promover la
variante.

---

## Criterios de aceptación

- [ ] `/jugar/ranaria` (una vez cableado) muestra un canvas de 800×600 con 5 carriles de
      carretera, isla central, 5 carriles de río y fila de nenúfares, no la `.game-arena`.
- [ ] La rana empieza en `START_CELL` (columna 8, fila 11) y solo se mueve una celda por
      pulsación, con una animación de salto de 120 ms.
- [ ] Mientras la rana salta, una segunda pulsación no altera el destino ya fijado.
- [ ] Pisar un carril de carretera con un coche encima en el instante del aterrizaje resta
      una vida y reinicia la posición.
- [ ] Saltar a un carril de río sin tronco debajo se considera ahogamiento y resta vida.
- [ ] Sobre un tronco, la rana se desplaza horizontalmente con él sin pulsar nada.
- [ ] Salir del mundo por el borde mientras va sobre un tronco resta vida.
- [ ] Llegar a un hueco de nenúfar libre lo marca ocupado, suma `200 + timeLeft*5` puntos y
      reinicia el tiempo de la vida actual.
- [ ] Llegar a un hueco ya ocupado o a la franja entre huecos resta vida en vez de contar
      como meta.
- [ ] Ocupar los 5 nenúfares vacía los 5 huecos y la partida continúa sin fin de juego.
- [ ] Avanzar a una fila nueva dentro del mismo intento suma 10 puntos una sola vez;
      retroceder y volver a esa fila no repite el bonus.
- [ ] La barra de tiempo baja de forma continua y llegar a 0 resta una vida.
- [ ] Perder la tercera vida abre el flujo de fin de juego con la puntuación real.
- [ ] El canvas no dibuja puntuación, vidas ni nivel fuera de la barra de tiempo.
- [ ] Con el canvas enfocado, las flechas no hacen scroll de la página.
- [ ] `destroy()` dejado en medio de un salto no deja un `requestAnimationFrame` vivo.

---

## Decisiones

- **Sí:** movimiento discreto celda a celda con animación corta de interpolación. Es la
  identidad del Frogger original; física continua rompería el género.
- **No:** WASD además de flechas. Un solo esquema es suficiente para 4 direcciones y evita
  ambigüedad con el campo de iniciales del modal (como en Snake, que sí necesita WASD por ser
  el estándar del género serpiente).
- **Sí:** sin cola de saltos, a diferencia de la cola de giros de Snake. El salto dura 120 ms;
  encolar introduciría inputs fantasma perceptibles en una mecánica de todo-o-nada.
- **Sí:** carriles con offset inicial fijo, no aleatorio. Reproducibilidad para depurar y
  para que el jugador pueda aprender el patrón, como el Frogger arcade original.
- **Sí:** ronda infinita (los nenúfares se vacían y se repite) sin subir dificultad. Es la
  variante mínima; la progresión de velocidad es justo lo que diferencia a la variante 02.
- **No:** vidas ilimitadas ni continue. 3 vidas y fin de juego, como el resto del catálogo.
- **Sí:** el tiempo se reinicia solo al llegar a un nenúfar, no al perder una vida por
  atropello (la vida perdida por tiempo agotado ya "gastó" su ventana).
- **No:** sprites. Formas geométricas de color, como Asteroids, para no bloquear esta
  variante en arte que no existe.

---

## Riesgos

| Riesgo                                                                                              | Mitigación                                                                                                                                          |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| La rana se "cae" del tronco por error de redondeo al comparar columna con `Cell`.                   | La colisión en `river`/`road` se calcula en píxeles (`obstacle.x`, `obstacle.w`) contra el centro de la celda de la rana, no por índice de columna. |
| Deriva del tronco saca a la rana del mundo sin que el jugador lo perciba a tiempo.                  | La barra de tiempo y el color de fondo del carril hacen visible la dirección y velocidad; se verifica jugando que hay margen de reacción.           |
| Sin sprites, coches y troncos se confunden visualmente en carriles adyacentes.                      | Paleta de color fija y contraste por tipo (`ROAD` gris con coches de color vivo, `RIVER` azul con troncos marrones), verificado en el paso 3.       |
| El bucle infinito de rondas nunca sube dificultad y el juego se vuelve monótono.                    | Es la variante mínima a propósito; la variante 02 resuelve esto con progresión explícita.                                                           |
| Perder una vida justo al aterrizar sobre el borde de un tronco por 1px genera quejas de injusticia. | Se usa solape real de rectángulos (no punto central estricto) con `RIVER_LOG_W` generoso; se ajusta en verificación si se siente injusto.           |

---

## Lo que **no** entra en esta spec

- Sprites, spritesheet o sonido.
- Power-ups, obstáculos adicionales (serpientes, cocodrilos, moscas).
- Progresión de niveles o dificultad creciente.
- Controles táctiles.
- `lib/games.ts`, `lib/games/registry.ts`, migraciones, catálogo o leaderboard reales — eso
  ocurre solo si esta variante se promueve fuera de `specs/game-jam/`.
- Autenticación, `scores.user_id`.

Cada una de ellas, si entra, va en su propia spec.
