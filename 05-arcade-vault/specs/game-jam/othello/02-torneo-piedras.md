# SPEC — OTHELLO: torneo de piedras

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-22
> **Objetivo:** Diseñar un Othello 8×8 en formato campaña — cinco rondas contra una CPU cada vez más fuerte, con **piedras** bloqueadas que rompen las líneas de volteo, tres vidas y un único deshacer por ronda — como ficha nueva `othello` en categoría `VERSUS`, con motor real y leaderboard en Supabase desde el primer día.

---

## Por qué existe esta spec

Una partida suelta de Othello (variante `01-clasico-vs-cpu.md`) dura unos minutos y tiene un techo
bajo de puntuación: el leaderboard de Arcade Vault premia partidas largas y arriesgadas, no un
único duelo. Esta variante convierte el juego en una **campaña con progresión**, que es lo que el
HUD de la plataforma ya sabe enseñar (`Nivel`, `Vidas`) y lo que da sentido a un ranking: llegar a
la ronda 5 con vidas de sobra debe valer mucho más que ganar la ronda 1.

El giro de diseño son las **piedras**: celdas del tablero que no se pueden ocupar y que **cortan**
cualquier línea de volteo que las cruce. Cambian de verdad la estrategia — las esquinas dejan de
ser seguras cuando se convierten en piedras, los bordes se fragmentan — sin cambiar las reglas
básicas. La CPU escala de una jugada greedy a una búsqueda de 5 plies, de modo que cada ronda es
un problema distinto contra un rival más sólido.

Como con Snake (SPEC 10) y las variantes de `ciempies`, **no hay código de referencia**: las
constantes de este documento son el diseño en sí; cambiarlas durante la implementación es
rediseñar, no implementar. El motor dibuja todo con primitivas de canvas, sin assets externos.

Esta variante es autosuficiente: repite las reglas oficiales y lo que comparte con la variante
`01-clasico-vs-cpu.md` (mundo 640×640, tablero, entrada), y añade piedras, rondas, vidas, deshacer y
una CPU con búsqueda.

---

## Alcance

**Dentro:**

- `lib/games/othello/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createOthelloGame`, sin assets externos.
- Mundo lógico de **640×640**: tablero 8×8 de celdas de 64 px en `(64, 64)–(576, 576)`; franja
  superior de 64 px (recuento de fichas, turno, deshacer disponible) y franja inferior de 64 px
  (mensajes).
- Reglas oficiales: colocar una ficha que voltee al menos una línea contigua de fichas rivales
  (8 direcciones) cerrada por una ficha propia; pasar turno automáticamente si no hay jugada
  legal; fin de ronda cuando ninguno puede mover o no quedan celdas libres.
- **Piedras**: celdas fijas por ronda, no ocupables, que **interrumpen** las líneas de volteo
  (una piedra no es ficha propia ni rival: la línea no se cierra a través de ella).
- Campaña de **5 rondas**, cada una con su distribución de piedras y su nivel de CPU:

  | Ronda | Piedras                     | Nº | Profundidad CPU | Evaluación           |
  | ----- | --------------------------- | -- | --------------- | -------------------- |
  | 1     | —                           | 0  | 1               | posicional           |
  | 2     | grupo A                     | 4  | 2               | posicional           |
  | 3     | grupos A + B                | 8  | 3               | posicional + movilidad |
  | 4     | grupos A + C                | 8  | 4               | posicional + movilidad |
  | 5     | grupos A + B + C            | 12 | 5               | posicional + movilidad |

  Grupos, en `(col, row)` base 0: **A** = `(2,2) (5,2) (2,5) (5,5)`; **B** = `(0,3) (7,4) (3,0)
  (4,7)`; **C** = `(0,0) (7,0) (0,7) (7,7)` (las cuatro esquinas). Todos los grupos son simétricos
  por rotación de 180° para no favorecer a ningún bando.
- 3 vidas. Perder una ronda (menos fichas al terminar) cuesta una vida y repite la misma ronda
  desde cero; empatar cuenta como victoria a medias; ganar avanza a la siguiente.
- **Deshacer** (`U`): una vez por ronda, revierte la última jugada del jugador **y** la respuesta
  de la CPU. No disponible antes de la primera jugada del jugador. Ganar la ronda sin haberlo
  usado da un bonus.
- Pausa de presentación de ronda (`RONDA n`) de 1800 ms con las piedras apareciendo, saltable con
  `Space`/`Enter`/clic.
- CPU con búsqueda alfa-beta de profundidad fija por ronda, con orden de jugadas por peso posicional
  y un tope de nodos por decisión.
- Control con ratón/dedo y con teclado (cursor con flechas/WASD, `Space`/`Enter` para colocar, `U`
  para deshacer).
- Puntuación acumulada por ronda ganada y bonus por vidas restantes al completar la campaña.
- Nueva ficha `othello` en `lib/games.ts` (categoría `VERSUS`) y clase de portada
  `cover-othello` en `app/globals.css`.
- Una línea `othello` en `GAME_ENGINES` (`lib/games/registry.ts`).
- Migración `insert into public.games (id, title) values ('othello', 'OTHELLO')` y su aplicación.

**Fuera de alcance (para specs futuras o para la variante `01-clasico-vs-cpu.md`):**

- Partida única sin campaña (es la otra variante).
- Piedras que aparecen o desaparecen durante la ronda, o distribuciones aleatorias.
- Más de un deshacer, rehacer, o deshacer múltiple.
- Elegir color o dificultad.
- Partida local a dos jugadores.
- Cronómetro por jugada.
- Sonido y skins.
- Nueva categoría `ESTRATEGIA`.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla nueva, ni columna, ni tipo de plataforma.** `GameEngineEntry` ya existe
desde la SPEC 08, `scores` y `game_stats` sirven a este juego sin tocarlas, y el leaderboard se
enciende con una fila en `games`. `Cat` y `CATS` no cambian.

Tipos locales del motor, sin exportar:

```ts
type Side = 1 | 2; // 1 = negras (jugador), 2 = blancas (CPU)
type Cell = 0 | Side | 3; // 0 = vacía, 3 = piedra
type Move = { col: number; row: number; flips: number[] }; // flips: índices (row * 8 + col)
type Flip = { index: number; delay: number; elapsed: number; to: Side };
type Snapshot = { board: Cell[]; lastCpu: number | null }; // para deshacer
type Phase = "intro" | "player" | "cpu-think" | "animating" | "pass" | "round-end" | "gameover";
type RoundDef = { stones: number[]; depth: number; mobility: boolean };
```

Estado en la clausura de `createOthelloGame`:

- `rounds: RoundDef[]` — las 5 definiciones, construidas una vez a partir de los grupos A/B/C.
- `round` (1..5), `lives`, `score`, `board: Cell[]` (64 celdas, índice `row * 8 + col`).
- `turn: Side`, `phase: Phase`, `cursor: { col: number; row: number }`, `legal: Move[]`.
- `flips: Flip[]`, `pendingNext: Phase | null`.
- `undoLeft: 0 | 1`, `undoStack: Snapshot | null` — foto del tablero **antes** de la última
  jugada del jugador (solo una; la jugada del jugador y la respuesta de la CPU se revierten juntas).
- `introAccum`, `thinkAccum`, `passAccum`, `endAccum` (ms), `badFlash`, `message`, `lastCpu`.
- `roundResult: "win" | "draw" | "loss" | null`, `reported` (para el `onGameOver` único).
- Bucle: `rafId`, `lastTime`, `destroyed`.

**Geometría del mundo lógico 640×640:**

```
W 640 · H 640 · CELL 64 · BOARD_X 64 · BOARD_Y 64 · COLS 8 · ROWS 8
franja superior  y 0..64    — fichas, turno, deshacer (U)
tablero          y 64..576  — 8×8
franja inferior  y 576..640 — mensajes
```

---

## Plan de implementación

### 1. Constantes, rondas y reglas puras

`lib/games/othello/engine.ts`, primera parte. Constantes de diseño:

```
W 640 · H 640 · CELL 64 · BOARD_X 64 · BOARD_Y 64
START: (3,3) blanca · (4,3) negra · (3,4) negra · (4,4) blanca
PLAYER 1 · CPU 2 · STONE 3
ROUNDS 5 · LIVES_START 3 · UNDO_PER_ROUND 1
POINTS_PER_DISC 10
ROUND_WIN_BASE 200 (× nº de ronda) · DRAW_FACTOR 0.5 (suelo del valor base)
UNDO_UNUSED_BONUS 100 · LIFE_BONUS 200 (por vida restante, solo al ganar la ronda 5)
INTRO_MS 1800 · CPU_THINK_MS 700 · PASS_MS 1400 · ROUND_END_MS 1500 · BAD_FLASH_MS 250
FLIP_MS 220 · FLIP_STAGGER_MS 60 · DT_MAX 50
NODE_BUDGET 40000 (por decisión de la CPU)
MOBILITY_WEIGHT 8 · TERMINAL_WEIGHT 1000
STONES_A [(2,2),(5,2),(2,5),(5,5)] · B [(0,3),(7,4),(3,0),(4,7)] · C [(0,0),(7,0),(0,7),(7,7)]
POSITION_WEIGHTS (fila a fila, simétrica; las piedras valen 0 y se ignoran):
  100 -20  10   5   5  10 -20 100
  -20 -50  -2  -2  -2  -2 -50 -20
   10  -2  -1  -1  -1  -1  -2  10
    5  -2  -1  -1  -1  -1  -2   5
    5  -2  -1  -1  -1  -1  -2   5
   10  -2  -1  -1  -1  -1  -2  10
  -20 -50  -2  -2  -2  -2 -50 -20
  100 -20  10   5   5  10 -20 100
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Funciones puras, sin estado de módulo:

- `flipsFor(board, col, row, side)` — como en Othello normal, pero una celda `3` (piedra) o
  vacía **corta** la línea sin cerrarla.
- `legalMoves(board, side)`, `applyMove(board, move, side)`, `count(board, side)`.
- `freeCells(board)` — celdas con valor `0`; la ronda termina por tablero lleno cuando es 0.

Comprobación: `npm run build` limpio. En la ronda 2 `legalMoves(board, 1)` desde el inicio
devuelve las mismas 4 jugadas que en la ronda 1 (las piedras A no tocan el centro ni sus
líneas inmediatas); en una posición construida a mano, una piedra entre una ficha rival y una
propia hace ilegal la jugada que sin la piedra sería legal.

### 2. Rondas, vidas y flujo de campaña

- `startRound(n)`: `board` vacío + piedras de `rounds[n-1].stones` + las 4 fichas de `START`;
  `turn = 1`; `undoLeft = 1`; `undoStack = null`; `phase = "intro"` con `introAccum = 0`. Emite
  `onLevel(n)`.
- Fase `intro`: dibuja `RONDA n` y las piedras apareciendo; pasa a `player` al llegar a `INTRO_MS`
  o con `Space`/`Enter`/clic.
- Fin de ronda: ningún bando puede mover o `freeCells === 0`. Se muestra el resultado
  (`RONDA SUPERADA` / `EMPATE` / `RONDA PERDIDA`) durante `ROUND_END_MS`, tras la última animación.
  - **Victoria** (más fichas): suma `discs × 10 + 200 × n`, más `100` si `undoLeft === 1`. Si
    `n < 5` → `startRound(n + 1)`. Si `n === 5` → suma `200 × lives` y `gameover`.
  - **Empate:** suma `floor((discs × 10 + 200 × n) × 0.5)` (sin bonus de deshacer) y avanza como
    una victoria.
  - **Derrota:** `lives--`, `onLives(lives)`. Si `lives > 0` → `startRound(n)` (misma ronda,
    tablero desde cero, `undoLeft = 1` otra vez, sin sumar puntos). Si `lives === 0` → `gameover`.
- `onScore` se emite sólo al cerrar ronda (la puntuación no sube ni baja durante la partida).
- `onLives(3)` al iniciar la campaña, `onLevel(1)` en la primera ronda.
- `onGameOver(score)` una sola vez, tras mostrar el mensaje final 1500 ms (`CAMPAÑA COMPLETA` o
  `FIN DE LA CAMPAÑA`), con el bucle detenido.

Máximos de referencia (para ajustar el techo del leaderboard): una campaña perfecta con 3 vidas
y deshacer sin usar ronda a ronda ronda ≈ `Σ(discs×10 + 200n + 100) + 600` → varios miles de
puntos; perder rondas penaliza vía vidas y por rondas repetidas sin puntos.

Comprobación: simular desde consola/test manual el avance 1→5, la repetición tras derrota y el
fin por 0 vidas; el `onLevel` sólo cambia al ganar o empatar.

### 3. Turnos, pasar y animación

Igual que el Othello oficial:

- Al colocar, el tablero lógico se actualiza **inmediatamente**; los `Flip` son sólo visuales
  (`delay = FLIP_STAGGER_MS × distancia`). `phase = "animating"` hasta el último volteo, y luego
  `pendingNext`.
- Sin jugadas legales: `message = "NO TIENES JUGADAS"` / `"CPU PASA"` durante `PASS_MS` y cede el
  turno. Si ambos bandos están bloqueados, fin de ronda. Si un bando no puede mover pero el otro
  sí, el otro encadena jugadas.
- Antes de cada jugada del jugador se guarda `undoStack = { board: copia, lastCpu }`.

Comprobación: partida CPU-vs-CPU simulada con piedras termina siempre sin jugadas legales
colgando y con `count(1) + count(2) + count(piedras) + freeCells = 64`.

### 4. IA de la CPU

- Ronda 1 (`depth 1`): igual que la variante clásica — valor por `POSITION_WEIGHTS` de la celda +
  1 por ficha volteada; desempate aleatorio.
- Rondas 2–5: alfa-beta de profundidad `depth`, con orden de jugadas por peso de celda
  descendente para que la poda funcione. Evaluación en hojas no terminales:
  `Σ pesos(CPU) − Σ pesos(jugador)` más, desde la ronda 3, `MOBILITY_WEIGHT × (movs CPU − movs
  jugador)`. Hoja terminal (ningún bando mueve): `TERMINAL_WEIGHT × (fichas CPU − fichas jugador)`.
- El peso de una esquina que es **piedra** es 0 (no se puede ocupar), de modo que la CPU deja de
  sobrevalorar una celda inalcanzable.
- `NODE_BUDGET`: el contador de nodos se comprueba en cada expansión; al agotarse devuelve la
  mejor jugada encontrada en la profundidad anterior (profundización iterativa 1..`depth`).
- Desempate aleatorio entre jugadas con la misma evaluación máxima.
- La búsqueda es síncrona y no toca estado de módulo; debe tardar bien por debajo de un frame
  largo en un portátil medio. La pausa `CPU_THINK_MS` se cuenta **desde el final de la animación**,
  no incluye el coste de la búsqueda.

Comprobación: en la ronda 1 la CPU nunca elige una jugada de menor valor que otra disponible; en
la ronda 5 una decisión con posición abierta tarda menos de 50 ms medidos con `performance.now()`
durante el desarrollo (el log se retira antes de cerrar).

### 5. Deshacer

- `U` o botón táctil `DESHACER` en `phase === "player"` con `undoLeft === 1` y `undoStack !==
  null`: restaura `board` desde `undoStack.board`, `turn = 1`, borra `flips` en curso y recalcula
  `legal`; `undoLeft = 0`; `message = "DESHECHO"` durante `PASS_MS`.
- Si se pulsa durante `animating` o `cpu-think`, no hace nada (no se encola).
- Al deshacer se revierte **la última jugada del jugador y la respuesta de la CPU**: el jugador
  vuelve al turno previo a su jugada.
- Sin jugada previa (`undoStack === null`) o sin cargas: se ignora sin parpadeo.
- El indicador en la franja superior muestra `U ✔` cuando hay carga y `U ✘` cuando no.

Comprobación: tras jugar una vez y deshacer, el tablero es idéntico al inicial y la CPU no ha
jugado; un segundo `U` en la misma ronda no hace nada; en la ronda siguiente vuelve a haber carga.

### 6. Dibujo

`draw()` con primitivas de canvas:

- Fondo `#0a0a18`; tablero verde oscuro (`#0b4a2a`); fichas como en la variante clásica
  (radio 26 px, gradiente radial, volteo en X).
- **Piedras:** cuadrado de 52 px, gris azulado (`#3a3f55`) con bisel de 2 px claro arriba/izquierda
  y oscuro abajo/derecha, para distinguirlas de una ficha. Aparecen con escala 0→1 durante la fase
  `intro`.
- Jugadas legales, cursor, `badFlash` y marca de la última jugada de la CPU como en la variante
  clásica.
- Franja superior: ficha negra + recuento, ficha blanca + recuento, triángulo de turno, indicador
  `U ✔/✘` y `RONDA n/5` — estado propio del juego, no copia del HUD.
- Fase `intro`: velo semitransparente con `RONDA n` y debajo el número de piedras; se retira al
  empezar `player`.
- Franja inferior: `message` centrado.
- Sin puntuación, nivel, vidas ni overlay de game over en el canvas: eso es el HUD de la plataforma.

Comprobación: `npm run build` limpio; a ojo, las piedras no se confunden con fichas y la franja
superior cabe en 640 px sin recortar.

### 7. Entrada y bucle

- `pointerdown` sobre el canvas, con conversión **por escala** vía `getBoundingClientRect()`:
  celda legal → juega; ilegal → `badFlash`; durante `intro` salta la presentación. `pointermove`
  actualiza `cursor`.
- Teclado con el canvas enfocado: flechas/WASD mueven el cursor, `Space`/`Enter` juegan (o saltan
  `intro`), `U` deshace. Al comenzar cada turno del jugador el cursor salta a la primera jugada
  legal si el actual no lo es.
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`, `KeyD`,
  `Space`, `Enter`, `KeyU`. `preventDefault()` solo para esas.
- Listeners `keydown` / `blur` / `pointerdown` / `pointermove` sobre el canvas, nunca sobre
  `window` ni `document`. `P` y `Escape` no llegan al motor.
- `emit()` con `lastScore` / `lastLives` / `lastLevel`, sólo cuando el valor cambia.
- `dt` en milisegundos capado a `DT_MAX`; `lastTime = null` al reanudar. Todos los temporizadores
  avanzan con `dt`, así que `pause()` los congela.
- `restart()`: detiene el bucle, `round = 1`, `lives = 3`, `score = 0`, `reported = false`,
  `startRound(1)`, `emit()` y arranca.
- `destroy()` cancela el frame, quita los cuatro listeners y es idempotente.
- `initGame(); draw();` antes de devolver el motor.

Comprobación: `getEngine("othello")` (tras el paso 9) devuelve la entrada y `npm run build` sigue
limpio.

### 8. Catálogo: nueva ficha `othello`

`lib/games.ts`, nueva entrada en `GAMES`:

```ts
{
  id: "othello",
  title: "OTHELLO",
  short: "Cinco rondas, piedras en el tablero y una CPU que aprende.",
  long: "Othello en formato torneo: cinco rondas contra una CPU cada vez más fuerte, con piedras que bloquean casillas y cortan tus líneas de volteo. Tienes tres vidas y un deshacer por ronda. Domina las esquinas, cuida tu movilidad y llega a la final.",
  cat: "VERSUS",
  cover: "cover-othello",
  color: "green",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `.cover-othello` nueva, mismo patrón que las portadas generadas
existentes (gradiente verde con dos fichas y una piedra cuadrada gris mediante gradientes en
`::after`; sin imagen externa).

Comprobación: `/juegos/othello` muestra la ficha en la biblioteca con su portada antes de que el
motor esté registrado, y el filtro `VERSUS` la incluye.

### 9. Registrar el motor

`lib/games/registry.ts`:

```ts
othello: {
  create: createOthelloGame,
  width: 640,
  height: 640,
  controls:
    "ratón o toque para colocar una ficha, flechas o WASD para mover el cursor, espacio o Enter para colocar, U para deshacer",
  touch: {
    a: { code: "Space", label: "PONER" },
    b: { code: "KeyU", label: "DESHACER" },
    repeat: true,
  },
},
```

Comprobación: `/jugar/othello` pinta el canvas real en vez de `.game-arena`.

### 10. Leaderboard

`supabase/migrations/<timestamp>_juego_othello.sql`, con timestamp posterior a la última
migración existente:

```sql
insert into public.games (id, title) values ('othello', 'OTHELLO');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. Los tipos no se
regeneran.

Comprobación: `select * from public.games` incluye la fila `othello`.

### 11. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido manual
de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/othello` muestra un canvas de 640×640 con tablero 8×8, no la `.game-arena`.
- [ ] Al empezar, el HUD muestra Nivel 01, 3 vidas y 0 puntos, y aparece `RONDA 1` durante unos
      1800 ms (saltable con `Space`/`Enter`/clic).
- [ ] La ronda 1 no tiene piedras; la 2 tiene 4; la 3 tiene 8; la 4 tiene 8 (esquinas incluidas); la
      5 tiene 12.
- [ ] Las piedras se dibujan distintas de las fichas, no se pueden ocupar y un clic sobre ellas
      parpadea en rojo.
- [ ] Una línea de fichas rivales que cruza una piedra antes de cerrarse con una ficha propia
      **no** se voltea, y esa jugada no aparece como legal.
- [ ] Las jugadas legales se señalan con puntos tenues y las flechas/WASD mueven el cursor sin
      salir del tablero.
- [ ] Tras la jugada del jugador la CPU espera unos 700 ms y juega; entre medias, clics y teclas se
      ignoran.
- [ ] La CPU de la ronda 1 elige siempre la jugada de mayor peso posicional; las de rondas 4–5
      son notablemente más fuertes que la de la 1.
- [ ] La decisión de la CPU en la ronda 5 no congela visiblemente la animación ni el HUD.
- [ ] `U` (o el botón `DESHACER`) revierte la última jugada del jugador **y** la respuesta de la
      CPU, una sola vez por ronda; en la ronda siguiente vuelve a estar disponible.
- [ ] `U` antes de la primera jugada, durante la animación o durante el «pensar» de la CPU no
      hace nada.
- [ ] Si un bando no tiene jugadas aparece `NO TIENES JUGADAS` / `CPU PASA` y el turno pasa solo.
- [ ] Ganar una ronda suma `fichas × 10 + 200 × n` (más 100 si no se usó el deshacer) y pasa a
      la siguiente ronda con `onLevel` actualizado.
- [ ] Empatar suma la mitad (redondeada abajo) del valor base y también avanza.
- [ ] Perder una ronda resta una vida en el HUD, no suma puntos y repite la misma ronda desde cero
      con el deshacer recargado.
- [ ] Perder con una sola vida restante abre el modal `FIN DEL JUEGO` con la puntuación acumulada.
- [ ] Ganar la ronda 5 suma `200 × vidas restantes` y abre el modal `FIN DEL JUEGO` tras
      `CAMPAÑA COMPLETA`.
- [ ] El HUD muestra el mismo número que el modal final, y la puntuación no cambia durante una
      ronda en curso.
- [ ] El botón `PAUSA` congela el juego (incluido el «pensar» de la CPU, la presentación y las
      animaciones) y `REANUDAR` lo reanuda sin saltar tiempo.
- [ ] `P` y `Escape` hacen lo mismo que el botón, y el motor no los interpreta como jugada.
- [ ] Con el canvas enfocado, las flechas, WASD, espacio, Enter y `U` no hacen scroll ni
      escriben fuera del canvas.
- [ ] Escribir `W`, `A`, `S`, `D`, `U`, espacio o Enter en el campo de iniciales no mueve,
      deshace ni reinicia el juego.
- [ ] En un viewport estrecho (canvas escalado por CSS), el toque cae en la celda correcta.
- [ ] En móvil el mando táctil muestra la cruceta y los botones `PONER` y `DESHACER`.
- [ ] `JUGAR DE NUEVO` reinicia a ronda 1, 3 vidas y 0 puntos sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'othello'`.
- [ ] Esa puntuación aparece en `/salon?juego=othello` y en `/juegos/othello` sin recargar a mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Con `scores` vacía para este juego, `/salon?juego=othello` muestra el estado vacío.
- [ ] Navegar de `/jugar/othello` a `/biblioteca` y volver no duplica el bucle ni los listeners.
- [ ] Dejar la pestaña en segundo plano y volver no hace que la CPU juegue varias veces de golpe.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid` y `/jugar/snake` se juegan igual que
      antes.
- [ ] `lib/games.ts` mantiene sin tocar las fichas de los demás juegos.
- [ ] `select * from public.games` incluye una fila `othello` además de las ya existentes.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/othello`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** id `othello`, categoría `VERSUS`. Libre en el catálogo y en `specs/game-jam/`; sin
  ampliar `Cat`/`CATS` (`ESTRATEGIA` queda para una spec propia).
- **Sí:** piedras que cortan las líneas. Es el giro que cambia la estrategia sin tocar las reglas
  básicas; una piedra no es ficha de nadie, así que no puede cerrar ni voltearse.
- **Sí:** distribuciones fijas y simétricas (180°) por ronda. Hacen la campaña reproducible y
  justa; las aleatorias harían imposible equilibrar la CPU.
- **Sí:** las esquinas como piedras en las rondas 4 y 5. Quita la heurística más conocida del
  juego y obliga a jugar de otra manera.
- **Sí:** profundidad de CPU 1→5 con tope de nodos y profundización iterativa. Una escalada
  perceptible y un coste de búsqueda acotado en un único hilo.
- **Sí:** 3 vidas y repetir ronda al perder. Da sentido al HUD de `Vidas` y a un ranking; no hay
  «continue» infinito.
- **Sí:** empate = victoria a medias. Evita un bucle de rondas empatadas.
- **Sí:** un deshacer por ronda que revierte jugador + CPU. Si sólo revirtiera la CPU o sólo al
  jugador, el estado quedaría con el turno equivocado.
- **Sí:** `onScore` sólo al cerrar ronda. Una puntuación que sube y baja durante la partida
  confundiría en un ranking; aquí sólo crece.
- **Sí:** lógica inmediata y animación sólo visual; pausa congela todos los temporizadores.
- **Sí:** mundo 640×640 cuadrado con franjas de 64 px, igual que la variante clásica.
- **No:** sonido, skins, color elegible, dos jugadores locales.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo                                                                                             | Mitigación                                                                                                   |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| La búsqueda de profundidad 5 bloquea el hilo y congela el canvas en un dispositivo lento.           | `NODE_BUDGET 40000` con profundización iterativa; el criterio de aceptación exige no congelar visiblemente. |
| `flipsFor` trata mal las piedras (las cruza o las voltea).                                          | Paso 1: comprobación con una posición construida a mano; la piedra corta la línea sin cerrarla.              |
| Una distribución de piedras deja a un bando sin jugada legal desde el principio.                    | Los grupos A/B/C no tocan el centro ni sus líneas inmediatas; paso 1 verifica las 4 jugadas iniciales.       |
| El deshacer deja `flips`, `phase` o `legal` incoherentes con el tablero restaurado.                | El deshacer sólo funciona en `phase === "player"`, limpia `flips` y recalcula `legal` desde `board`.         |
| La campaña repetida por derrotas permite farmear puntos.                                            | La derrota no suma puntos y cuesta una vida; el bonus de la ronda sólo se cobra al ganarla.                   |
| Pausar durante `intro`, «pensar» o `round-end` deja un temporizador vivo y salta de fase al volver. | Todos los temporizadores avanzan con `dt`; `pause()` detiene el bucle y `lastTime = null` al reanudar.        |
| Doble `onGameOver` al coincidir el fin de campaña con el último volteo.                             | `reported` y la guarda `phase === "gameover"`; `onGameOver` sólo se emite una vez.                            |
| El toque cae en la celda vecina con el canvas estirado por CSS.                                     | Conversión con `getBoundingClientRect()` y la escala `W / rect.width`; criterio en viewport estrecho.         |
| Con 12 piedras en la ronda 5 el tablero se llena pronto y la ronda es demasiado corta.              | Quedan 52 celdas útiles; si resulta corta, ajustar el grupo en la implementación solo con aprobación (es diseño). |

---

## Lo que **no** entra en esta spec

- Partida única sin campaña (variante `01-clasico-vs-cpu.md`).
- Piedras dinámicas o aleatorias.
- Más de un deshacer, rehacer o deshacer múltiple.
- Elegir color o dificultad; dos jugadores locales.
- Sonido y skins.
- Categoría `ESTRATEGIA`.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
