# SPEC — ROMPECABEZAS NUMÉRICO: tamaños y candados

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06, SPEC 11
> **Fecha:** 2026-10-27
> **Objetivo:** Diseñar un puzzle de fichas deslizantes por turnos y sin reloj — tableros de 3×3, 4×4 y 5×5 que crecen con el nivel, fichas bloqueadas con candado que no se pueden mover, presupuesto de movimientos por tablero, tres vidas y un deshacer limitado — como ficha nueva `rompecabezas-numerico` en categoría PUZZLE, con motor real y leaderboard en Supabase desde el primer día.

---

## Por qué existe esta spec

Es la segunda lectura del mismo juego base que `01-clasico-contrarreloj.md`: misma ficha
`rompecabezas-numerico`, mismo mundo de 560×620, misma regla de deslizar una ficha al hueco, mismo
leaderboard. Solo una de las dos se implementa; no conviven.

La variante clásica convierte el 15-puzzle en una carrera contra el reloj. Esta hace lo contrario:
**nada corre**. Quita el reloj y pone en su lugar un presupuesto de movimientos por tablero, de
modo que la presión sale de la planificación y no de la velocidad de manos. Para que la partida no
sea el mismo tablero 4×4 repetido, el tamaño crece (3×3 → 4×4 → 5×5) y aparece una capa nueva: las
**fichas con candado**, que se quedan clavadas en su sitio final y obligan a rodearlas. Y como el
presupuesto puede agotarse, hay tres vidas y un `deshacer` escaso para corregir un error sin que
sea gratis.

Como con la variante clásica, `ciempies` o `match-cristal`, **no hay código de referencia**. Las
constantes de esta spec **son** el diseño del juego; cambiarlas durante la implementación es
rediseñar, no implementar. El motor dibuja todo con primitivas de canvas, incluido el candado.

---

## Alcance

**Dentro:**

- `lib/games/rompecabezas-numerico/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createRompecabezasNumericoGame`, sin assets externos.
- Mundo lógico de **560×620**: franja superior de 60 px (`y 0..60`) con movimientos restantes del
  tablero y deshacer disponibles, y debajo un área de tablero de **520×520** (`x 20..540`,
  `y 80..600`) dividida en `N×N` celdas de `520 / N` px, con `N` = 3, 4 o 5 según el nivel.
- Tamaño por nivel: 3×3 en los niveles 1-2, 4×4 en los 3-5, 5×5 del 6 en adelante.
- **Fichas con candado:** 0 en 3×3, 1-2 en 4×4, 2-4 en 5×5. Un candado es una ficha numerada que
  empieza **y debe terminar** en su posición resuelta y que ningún movimiento puede desplazar.
- Tableros siempre **resolubles**: caminata aleatoria de movimientos legales desde el estado
  resuelto, sin tocar nunca las fichas con candado.
- Presupuesto de movimientos por tablero; agotarlo cuesta una vida y regenera un tablero nuevo del
  mismo nivel.
- Tres vidas; una resolución limpia (con al menos la mitad del presupuesto sin gastar) devuelve una
  vida, hasta un máximo de 3.
- `Z` deshace el último movimiento, **tres veces por tablero**; el deshacer no devuelve el
  movimiento gastado.
- Deslizar por **teclado** (flechas o WASD), por **puntero** (clic o toque sobre una ficha; desliza
  la línea hasta el hueco si no cruza un candado) y deshacer con `Z` o con el botón A del mando
  táctil.
- Puntuación por tamaño, movimientos sobrantes y candados; nivel = tableros resueltos + 1.
- Nueva ficha `rompecabezas-numerico` en `lib/games.ts` (categoría `PUZZLE`) y clase de portada
  `cover-rompecabezas-numerico` en `app/globals.css`.
- Una línea `rompecabezas-numerico` en `GAME_ENGINES` (`lib/games/registry.ts`).
- Migración `insert into public.games (id, title) values ('rompecabezas-numerico', '15 PUZZLE')` y su
  aplicación.

**Fuera de alcance (para specs futuras):**

- Reloj de partida o tiempo límite (es la variante `01-clasico-contrarreloj.md`).
- Tableros rectangulares, de 6×6 o más, o más de un hueco.
- Fichas de otros tipos (hielo, teletransporte, fichas que se mueven solas).
- Pista automática o solver.
- Sonido y skins `clasico`/`neon`/`retro`.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni tipo de plataforma nuevo.** `scores` y `game_stats`
sirven a este juego sin tocarlas.

Tipos locales del motor, sin exportar:

```ts
type Dir = "up" | "down" | "left" | "right"; // dirección en que SE MUEVE la ficha
type State = "playing" | "solved" | "lost" | "gameover";
```

Estado en la clausura de `createRompecabezasNumericoGame`:

- `n` (lado del tablero actual), `cell` (px por celda = `520 / n`).
- `board: number[]` — `n*n` posiciones en orden de lectura; `0` es el hueco.
- `locked: boolean[]` — misma indexación; `true` marca la ficha con candado de esa celda.
- `blank` — índice del hueco.
- `history: number[]` — celdas de origen de los movimientos hechos en el tablero actual
  (para el deshacer); `undosLeft`.
- `moves` (gastados en el tablero), `budget` (presupuesto total del tablero).
- `score`, `level`, `solvedCount`, `lives`.
- `slides` (animaciones activas) como en la variante clásica, `shakeMs` (temblor de una ficha
  bloqueada), `shakeCell`.
- `state: State`, `bannerMs` (ms restantes de rótulo al resolver o perder un tablero).
- Bucle: `rafId`, `lastTime`, `destroyed`.

---

## Plan de implementación

### 1. Motor: constantes y lógica de tablero

`lib/games/rompecabezas-numerico/engine.ts`. Constantes de diseño:

```
W 560 · H 620 · HUD_H 60 · BOARD_X 20 · BOARD_Y 80 · BOARD_SIZE 520
TILE_INSET 4 · SLIDE_MS 90 · BANNER_MS 700 · SHAKE_MS 200 · DT_MAX 50 ms
LIVES_START 3 · LIVES_MAX 3 · CLEAN_RATIO 0.5 (movimientos sobrantes / presupuesto)
UNDOS_PER_BOARD 3

tamaño(level): level <= 2 -> 3 · level <= 5 -> 4 · level >= 6 -> 5
candados(level): 3x3 -> 0
                 4x4 -> level 3: 1 · level 4: 1 · level 5: 2
                 5x5 -> min(4, 2 + floor((level - 6) / 2))
scrambleLen:  3x3 -> 25 · 4x4 -> 40 · 5x5 -> 60
budget:       3x3 -> 60 · 4x4 -> 150 · 5x5 -> 300
MIN_MISPLACED: 3x3 -> 4 · 4x4 -> 8 · 5x5 -> 14

SOLVE_BASE:   3x3 -> 300 · 4x4 -> 600 · 5x5 -> 1000
SPARE_POINTS 5 (por movimiento sobrante)
LOCK_BONUS 0.25 (multiplicador extra por candado)
  puntos(tablero) = round((SOLVE_BASE + SPARE_POINTS * (budget - moves)) * (1 + LOCK_BONUS * candados))
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Lógica:

- **Estado resuelto:** `board[i] = i + 1` para `i < n*n - 1` y `board[n*n - 1] = 0`.
- **Candados:** se eligen al azar `candados(level)` celdas del interior del tablero
  (`1 <= fila <= n-2` y `1 <= col <= n-2`), sin que dos candados compartan arista y sin la celda del
  hueco (esquina inferior derecha, que nunca es interior). Una ficha con candado nunca cambia de
  celda, ni durante la generación ni durante la partida; su celda es su celda resuelta.
- **Generación:** desde el estado resuelto, `scrambleLen` movimientos legales aleatorios; en cada
  paso se elige entre los vecinos ortogonales del hueco que **no tengan candado** y no sean la celda
  de la que acaba de venir el hueco; si no queda ninguno, se permite volver atrás. Si al terminar hay
  menos de `MIN_MISPLACED` fichas fuera de sitio o el tablero está resuelto, repite. Como solo se
  usan movimientos legales, el tablero es resoluble por construcción; **nunca** se baraja un array.
- **Movimiento por dirección** `move(dir)`: la ficha que se mueve es la vecina del hueco situada en
  el lado **contrario** a `dir`. Si el hueco está en ese borde, o la ficha tiene candado, no hay
  movimiento: no cuesta nada, y si era un candado se activa `shakeMs` sobre su celda.
- **Movimiento por clic** `moveAt(cell)`: igual que en la variante clásica si comparte fila o columna
  con el hueco, **pero** si entre la ficha pulsada y el hueco hay alguna con candado, no ocurre nada
  (solo el temblor del candado). Cada ficha deslizada suma 1 a `moves`.
- Cada ficha deslizada se apila en `history` con su celda de origen y descuenta del presupuesto.
- **Deshacer** `undo()` (`Z`): si `undosLeft > 0` y `history` no está vacío, devuelve la última ficha
  deslizada a su celda de origen, `undosLeft--`, **no** devuelve el movimiento gastado y **no** suma
  uno nuevo. Con `history` vacío o `undosLeft == 0`: no hace nada.
- **Resolución:** tras cada movimiento, si `board` es el estado resuelto: `state = "solved"`,
  `bannerMs = BANNER_MS`, `score += puntos(tablero)`, `solvedCount++`. Si
  `budget - moves >= CLEAN_RATIO * budget`, `lives = min(LIVES_MAX, lives + 1)`.
- **Presupuesto agotado:** si tras un movimiento no resuelto `moves >= budget`, `state = "lost"`,
  `bannerMs = BANNER_MS`, `lives--`. Si el último movimiento permitido resuelve el tablero, **gana la
  resolución** (se evalúa primero).
- Al acabar `bannerMs`: si `lives == 0` tras `lost`, `state = "gameover"`; si no,
  `level = 1 + solvedCount`, tablero nuevo (mismo tamaño si fue `lost`, el del nuevo nivel si fue
  `solved`) y `state = "playing"`. Durante `solved` y `lost` las entradas se ignoran.

Comprobación: `npm run build` limpio; revisión manual de que 50 generaciones por cada tamaño dejan
las fichas con candado exactamente en su celda y el tablero resoluble (los movimientos de la caminata,
invertidos, devuelven el estado resuelto).

### 2. Motor: bucle, entrada y callbacks

- `emit()` con `lastScore` / `lastLives` / `lastLevel`. `onLives` se emite en cada cambio de vidas.
- Bucle `requestAnimationFrame` con `dt` capado a `DT_MAX`; `lastTime = null` al reanudar. No hay
  reloj de juego: `dt` solo avanza animaciones, `bannerMs` y `shakeMs`.
- Game over: `stopLoop()` y `onGameOver(score)` una sola vez. `resume()` es no-op después.
- `restart()`: detiene el bucle, `score = 0`, `solvedCount = 0`, `level = 1`, `lives = LIVES_START`,
  tablero nuevo, `emit()`, arranca.
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`, `KeyD`,
  `KeyZ`. `preventDefault()` solo para esas. La tecla indica **hacia dónde se mueve la ficha**.
- Puntero: `pointerdown` sobre el canvas convierte `clientX/Y` a mundo con el factor
  `canvas.width / rect.width`; si cae dentro del área del tablero calcula
  `cell = floor((y - BOARD_Y) / cell) * n + floor((x - BOARD_X) / cell)`.
  `canvas.style.touchAction = "none"`.
- Listeners `keydown` / `blur` / `pointerdown` sobre el canvas, nunca sobre `window`. `P` y `Escape`
  no llegan al motor.
- `destroy()` cancela el frame, quita los listeners y es idempotente.
- `initGame(); draw();` antes de devolver.

Comprobación: `npm run build` limpio.

### 3. Motor: dibujo

`draw()` pinta, en este orden:

- Fondo negro de 560×620 y franja HUD con `MOVS 037/150` a la izquierda (magenta cuando quedan
  menos de 10) y `DESHACER ×3` a la derecha.
- Marco del tablero (520×520) con borde cian de 2 px.
- Cada ficha como rectángulo redondeado de `cell - 2 * TILE_INSET` con el número centrado en
  `bold` monospace de `cell * 0.4` px. Fuera de sitio: relleno oscuro y borde cian; **en su sitio**:
  relleno verde neón apagado y borde verde.
- **Ficha con candado:** relleno gris azulado, número atenuado y un candado dibujado con
  primitivas (cuerpo rectangular y arco) en la esquina superior derecha. Con `shakeMs > 0` oscila
  ±4 px horizontalmente.
- Fichas en animación: interpoladas entre su celda de origen y la de destino con `t / SLIDE_MS`.
- `solved`: borde del tablero verde y rótulo `¡RESUELTO! +NNN` (y `+1 VIDA` si fue resolución
  limpia). `lost`: borde magenta y rótulo `SIN MOVIMIENTOS −1 VIDA`. Dentro del canvas porque es
  estado propio del juego.
- Sin puntuación, nivel ni vidas en el canvas, y sin overlay de game over.

Comprobación: `/jugar/rompecabezas-numerico` pinta el canvas real (tras el paso 5).

### 4. Ficha del catálogo y portada

`lib/games.ts`, entrada nueva:

```ts
{
  id: "rompecabezas-numerico",
  title: "15 PUZZLE",
  short: "Desliza las fichas en orden, rodea los candados y cuida cada movimiento.",
  long: "Un hueco, un puñado de números y un presupuesto de movimientos. Los tableros crecen de 3×3 a 5×5 y algunas fichas llevan candado: no se mueven, tendrás que rodearlas. Tres vidas, tres deshacer.",
  cat: "PUZZLE",
  cover: "cover-rompecabezas-numerico",
  color: "yellow",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `.cover-rompecabezas-numerico` nueva, cuadrícula de baldosas oscuras con
borde neón amarillo, un hueco abajo a la derecha y una baldosa interior en tono gris azulado que
sugiere el candado, siguiendo el patrón de `.cover-tetro` y `.cover-snake`.

Comprobación: la tarjeta aparece en `/biblioteca` en el filtro PUZZLE con su portada.

### 5. Registro

`lib/games/registry.ts`:

```ts
"rompecabezas-numerico": {
  create: createRompecabezasNumericoGame,
  width: 560,
  height: 620,
  controls: "flechas o WASD para deslizar una ficha hacia el hueco, clic sobre una ficha para deslizarla, Z para deshacer",
  touch: { a: { code: "KeyZ", label: "DESHACER" } },
},
```

`repeat` queda sin definir: la cruceta no autorrepite, cada pulsación es un movimiento.

Comprobación: `/jugar/rompecabezas-numerico` pinta el canvas real y, en móvil, el mando muestra la
cruceta y el botón `DESHACER`.

### 6. Leaderboard

`supabase/migrations/20261027120000_juego_rompecabezas_numerico.sql`, con timestamp posterior a
`20261026120000`:

```sql
insert into public.games (id, title) values ('rompecabezas-numerico', '15 PUZZLE');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. **Los tipos no se
regeneran**.

Comprobación: `select id from public.games` incluye `rompecabezas-numerico`.

### 7. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos y el recorrido manual de
los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/rompecabezas-numerico` muestra un canvas de 560×620, no la `.game-arena`.
- [ ] El nivel 1 es un tablero 3×3 sin candados; el nivel 3 es 4×4 con 1 candado; el nivel 6 es 5×5 con 2.
- [ ] Los candados solo aparecen en celdas interiores, nunca contiguos entre sí.
- [ ] Una ficha con candado nunca se mueve: ni con flechas, ni con clic, ni por la caminata de generación; al intentarlo tiembla y no gasta movimiento.
- [ ] Un clic sobre una ficha cuya línea al hueco cruza un candado no mueve nada.
- [ ] Las flechas deslizan la ficha hacia la dirección pulsada, y una dirección sin ficha en el lado contrario del hueco no hace nada.
- [ ] La franja HUD muestra `MOVS usados/presupuesto` y pasa a magenta con menos de 10 restantes.
- [ ] `Z` devuelve la última ficha a su celda, descuenta uno de `DESHACER ×3` y no devuelve el movimiento gastado.
- [ ] Con 0 deshacer o historial vacío, `Z` no hace nada.
- [ ] Resolver un 3×3 en 20 movimientos suma `round((300 + 5 × 40) × 1)` = 500 puntos; un 4×4 con un candado se multiplica por 1,25.
- [ ] Resolver con al menos la mitad del presupuesto sin gastar devuelve una vida (sin pasar de 3); resolver más justo no.
- [ ] Gastar el último movimiento y resolver en el mismo movimiento cuenta como resolución, no como derrota.
- [ ] Agotar el presupuesto sin resolver quita una vida, pinta `SIN MOVIMIENTOS −1 VIDA` y genera un tablero nuevo del mismo nivel y tamaño.
- [ ] El HUD muestra 3 vidas al inicio y se actualiza en cada cambio.
- [ ] Perder la tercera vida abre el modal `FIN DEL JUEGO` con la puntuación real.
- [ ] No hay ningún reloj: dejar el juego quieto 5 minutos no cambia nada.
- [ ] El canvas no dibuja puntos, nivel ni vidas, ni ningún overlay de game over.
- [ ] El botón `PAUSA` congela animaciones y rótulos, y `REANUDAR` continúa sin saltos.
- [ ] `P` y `Escape` hacen lo mismo que el botón.
- [ ] Con el canvas enfocado, las flechas y `Z` no hacen scroll ni disparan atajos del navegador.
- [ ] Escribir `W`, `A`, `S`, `D`, `Z` o espacio en el campo de iniciales no mueve ninguna ficha ni deshace.
- [ ] En móvil, la cruceta y el botón `DESHACER` funcionan y tocar una ficha en el canvas también, sin scroll de página.
- [ ] `JUGAR DE NUEVO` reinicia a nivel 1, 0 puntos, 3 vidas y tablero 3×3 sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'rompecabezas-numerico'`.
- [ ] Esa puntuación aparece en `/salon?juego=rompecabezas-numerico` y en `/juegos/rompecabezas-numerico` sin recargar a mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Con `scores` vacía para este juego, `/salon?juego=rompecabezas-numerico` muestra el estado vacío.
- [ ] Navegar de `/jugar/rompecabezas-numerico` a `/biblioteca` y volver no duplica el bucle.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid`, `/jugar/snake` y `/jugar/frogger` se juegan igual que antes.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/rompecabezas-numerico`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** quitar el reloj y usar presupuesto de movimientos. Diferencia real con la variante
  clásica: la presión es de planificación, no de velocidad.
- **Sí:** tamaños 3×3 → 4×4 → 5×5 con el nivel. Es la progresión natural del género y da una curva
  de dificultad sin inventar mecánicas nuevas.
- **Sí:** candados solo en celdas interiores y no contiguos. Los bordes y las esquinas siguen libres
  para que el hueco siempre pueda rodear el tablero.
- **Sí:** el candado es una ficha que ya está en su sitio. No se añaden fichas que cambien la
  permutación base; solo se recorta el conjunto de movimientos legales.
- **Sí:** generar con caminata que nunca toca candados. Garantiza resolubilidad con la restricción
  añadida; barajar al azar con candados no la garantiza.
- **Sí:** presupuesto fijo por tamaño, no derivado de la longitud óptima. No hay solver en el motor;
  los valores (60/150/300) son holgados para humanos y se ajustan en juego, no en la spec.
- **Sí:** el deshacer no devuelve el movimiento gastado. Corrige errores, pero no es gratis.
- **Sí:** tres deshacer por tablero. Suficiente para un error, insuficiente para explorar a base de
  deshacer.
- **Sí:** tres vidas con recuperación solo en resolución limpia. Da margen para equivocarse, pero
  premia el juego eficiente.
- **Sí:** perder un tablero lo regenera del mismo nivel. No bloquea la partida con un tablero malo.
- **Sí:** el botón A del mando táctil es `DESHACER`. Es la única acción que no es una flecha.
- **No:** reloj de juego, hielo, teletransportes ni hueco adicional. Son otras variantes.
- **No:** sonido ni skins. No hay assets de audio y las paletas son una capa independiente.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Los candados dejan el tablero irresoluble o aíslan fichas. | Solo se generan con movimientos legales desde el estado resuelto sin tocar candados, así que el tablero siempre es resoluble. |
| Un candado interior rodeado de otros mueve el hueco a una zona sin salida. | Candados no contiguos y nunca en bordes: el anillo exterior queda libre. |
| El presupuesto resulta demasiado holgado o demasiado justo. | Valores fijados en el paso 1 y verificados con partidas reales; cambiarlos es rediseñar. |
| El jugador espera que la flecha mueva el hueco, no la ficha. | Rótulo en el `aria-label`; el mapeo es único y queda documentado. |
| El deshacer permite resolver por ensayo y error. | Máximo 3 por tablero y no devuelve movimientos. |
| Resolver y gastar el último movimiento en el mismo paso deja un estado ambiguo. | Se evalúa primero la resolución y después el presupuesto. |
| Un clic de línea cuenta N movimientos y agota el presupuesto sin querer. | El contador del HUD se actualiza al instante y la línea solo se desliza si no cruza un candado. |
| En 5×5, `cell = 104` px: las fichas son pequeñas en móvil. | El canvas escala con el CSS; el número usa `cell * 0.4` y se comprueba legible en 360 px de ancho. |
| El modal de iniciales recibe `Z`, `W`, `A`, `S` o `D`. | Bucle parado con el modal abierto y listeners en el canvas, no en `window`. |
| Pestaña en segundo plano: animaciones y rótulos saltan al volver. | `dt` capado a 50 ms y `lastTime = null` al reanudar. |

---

## Lo que **no** entra en esta spec

- Reloj de juego (`01-clasico-contrarreloj.md`).
- Tableros rectangulares, más grandes que 5×5 o con más de un hueco.
- Otros tipos de ficha especial: hielo, teletransporte, fichas móviles.
- Pista automática o solver.
- Sonido y skins.
- Cambios a `scores`, `game_stats` o a la plataforma.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
