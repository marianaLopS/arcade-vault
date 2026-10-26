# SPEC — EMPUJA CAJAS: modo clásico

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-09-28
> **Objetivo:** Diseñar `empuja-cajas` como un Sokoban clásico — empujar cajas hasta casillas
> objetivo en niveles fijos, sin enemigos, sin límite de tiempo y sin condición de derrota —
> sobre el contrato `GameEngine`, con leaderboard real basado en eficiencia de movimientos.

---

## Por qué existe esta spec

El catálogo de Arcade Vault es, hoy, puro reflejo: cuatro motores reales (`asteroids`,
`caida`, `arkanoid`, `snake`) y `frogger` comparten todos el mismo pulso — reflejos, un reloj
que corre, una entidad que persigue o un tablero que cae encima. `caida` es la única ficha de
categoría `PUZZLE`, y su puzzle es de reflejos: encajar antes de que el techo aplaste. No hay,
en ningún juego actual, una sola partida que se pueda **pensar antes de mover**.

`empuja-cajas` es exactamente eso: un Sokoban. Un jugador, cajas, casillas objetivo, un tablero
fijo por nivel. Cada movimiento es una decisión, no un reflejo — no hay reloj, no hay vidas que
perder por lentitud, no hay enemigo que castigue la duda. La única forma de "perder" es
encerrarse uno mismo empujando una caja a una esquina sin salida, y la única herramienta que
hace falta para eso es deshacer el último movimiento o reiniciar el nivel — nunca un `game over`
por fallo. El ritmo pausado y la resolución de rompecabezas fijos son precisamente lo que el
catálogo no tiene todavía, y complementan a `caida` (piezas que caen, contrarreloj) en vez de
repetirlo.

Como Snake (SPEC 10) y como `ciempies` (`specs/game-jam/ciempies/`), no hay código de
referencia: no existe ninguna carpeta `References/.../sokoban` ni similar. Las constantes de
este documento —incluidos los niveles, escritos a mano— **son** el diseño del juego, no un
ajuste posterior a un original.

Esta es la primera de dos variantes de diseño para `empuja-cajas`. Comparte con
`02-hielo-deslizante.md` el género, el mundo lógico, el contrato de niveles y el esquema de
controles — lo que cambia entre variantes es la mecánica de movimiento de cajas y jugador sobre
el tablero, nunca la base.

---

## Alcance

**Dentro:**

- `lib/games/empuja-cajas/engine.ts`: motor nuevo con todo el estado en la clausura de
  `createEmpujaCajasGame`.
- `lib/games/empuja-cajas/levels.ts`: los cuatro niveles de esta variante, como datos puros
  (arrays de strings en notación Sokoban clásica) sin estado.
- Mundo lógico de **640×600**: área de tablero de 560×560 (grilla máxima de 14×14 celdas de
  40 px, cada nivel centrado dentro de ella) y panel lateral de 80×600 a la derecha con el
  contador de cajas colocadas, el contador de movimientos y los atajos de teclado.
- Movimiento por turnos: el jugador se desplaza una celda; si hay una caja alineada delante y
  la celda siguiente está libre, la empuja una celda. Sin física continua ni colisión de
  proyectiles.
- Deshacer (`Z`) del último movimiento y reiniciar el nivel actual (`R`), ambos ilimitados.
- Puntuación por caja colocada y bono de nivel por eficiencia de movimientos frente a un valor
  de referencia (`PAR`) declarado por nivel.
- Victoria al completar el cuarto nivel: única condición de fin de partida, sin derrota posible.
- Control con flechas o WASD.
- Nueva ficha `empuja-cajas` en `lib/games.ts` (categoría `PUZZLE`) y clase de portada
  `cover-empuja-cajas` en `app/globals.css`.
- Una línea `empuja-cajas` en `GAME_ENGINES` (`lib/games/registry.ts`).
- Migración `insert into public.games (id, title) values ('empuja-cajas', 'EMPUJA CAJAS')` y su
  aplicación.

**Fuera de alcance (para specs futuras o si se prefiere la variante 02):**

- Las casillas de hielo y el deslizamiento de `02-hielo-deslizante.md`.
- Más de cuatro niveles, un selector de nivel o guardar el progreso entre partidas.
- Sonido.
- Controles táctiles más allá del D-pad y los dos botones declarados en el registro.
- Skins (`clasico`/`neon`/`retro`).
- Editor de niveles o niveles generados proceduralmente.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla nueva, ni columna, ni tipo de plataforma.** `GameEngineEntry` ya
existe desde la SPEC 08, `scores` y `game_stats` sirven a este juego sin tocarlas, y el
leaderboard se enciende con una fila en `games`.

Formato de nivel — notación Sokoban clásica (XSB), un array de strings por nivel, un carácter
por celda:

```
# muro          . objetivo vacío       @ jugador
  suelo         $ caja                 + jugador sobre objetivo
                * caja sobre objetivo
```

Cada fila puede tener longitud distinta (se completa con `#` a la derecha hasta la fila más
larga del nivel); un nivel mide como máximo 14 columnas × 14 filas.

```ts
type LevelDef = {
  id: number;
  /** Nombre corto mostrado en el panel, p. ej. "NIVEL 1". */
  name: string;
  /** Filas en notación XSB, de igual longitud tras el relleno. */
  rows: string[];
  /** Movimientos de una solución de referencia; ver el bono de nivel. */
  par: number;
};
```

Tipos locales del motor, sin exportar:

```ts
type Cell = { x: number; y: number };
type Dir = "up" | "down" | "left" | "right";
type BoxState = { cell: Cell; everScored: boolean };
type Move = {
  playerFrom: Cell;
  playerTo: Cell;
  boxIndex: number | null; // índice en boxes[] si el movimiento empujó una caja
  boxFrom: Cell | null;
  boxTo: Cell | null;
};
```

Estado en la clausura de `createEmpujaCajasGame`:

- `levelIndex` (0-based), `walls: boolean[]` y `targets: boolean[]` (arrays planos de
  `cols × rows` del nivel actual), `boxes: BoxState[]`, `player: Cell`.
- `moves: number` (movimientos válidos del nivel actual), `history: Move[]` (pila de deshacer,
  se vacía al reiniciar nivel o al pasar de nivel).
- `score`, `boxesOnTarget` (derivado de `boxes`, no se guarda aparte).
- `anim: { from: Cell; to: Cell; startedAt: number } | null` por entidad animada (jugador y,
  si aplica, la caja empujada) — puramente visual, no bloquea la lógica del siguiente input.
- `state: "playing" | "won"`.
- Bucle: `rafId`, `lastTime`, `destroyed`. Entrada: `keys: Set<string>` (una pulsación por
  tecla, sin repetición automática — ver paso 4).

---

## Plan de implementación

### 1. Datos: los cuatro niveles

`lib/games/empuja-cajas/levels.ts`. Constantes de diseño:

```
CELL 40 px · GRID_COLS_MAX 14 · GRID_ROWS_MAX 14  (área de tablero 560×560)
BOX_POINTS 50
LEVEL_BONUS_BASE 200 · PENALTY_PER_MOVE 2 · MIN_LEVEL_BONUS 50
  bono(nivel, movimientos) =
    max(MIN_LEVEL_BONUS × nivel,
        LEVEL_BONUS_BASE × nivel − PENALTY_PER_MOVE × max(0, movimientos − PAR(nivel)))
```

**Cualquier cambio de estos números, o de las filas de los niveles, es un cambio de diseño y no
entra en esta spec.**

Los cuatro niveles, en notación XSB (`#` muro, ` ` suelo, `.` objetivo, `$` caja, `@` jugador):

```
NIVEL 1 — par 5, 1 caja                NIVEL 2 — par 18, 2 cajas
#######                                #########
#     #                                #   #   #
# $ . #                                # $   $ #
#  @  #                                #  ###  #
#     #                                # .   . #
#     #                                #   @   #
#######                                #########

NIVEL 3 — par 30, 3 cajas              NIVEL 4 — par 25, 2 cajas (recorrido en L)
#############                          #########
#   #   #   #                          #       #
# $   $   $ #                          #  $    #
#  ### ###  #                          #       #
# .   .   . #                          #    .  #
#     @     #                          #    $  #
#############                          #       #
                                        #  .   @#
                                        #########
```

`PAR` es la longitud de una solución de referencia verificada a mano durante el diseño de este
documento; se confirma jugando cada nivel en la implementación (ver Riesgos).

Comprobación: `npm run build` limpio con el motor aún sin registrar.

### 2. Motor: carga de nivel y reglas de movimiento

`lib/games/empuja-cajas/engine.ts`. `loadLevel(i)` parsea `LEVELS[i].rows` a `walls`,
`targets`, `boxes` y `player`, rellena filas cortas con `#`, vacía `history` y pone `moves = 0`.

Reglas de un intento de movimiento en dirección `dir`:

1. Se calcula `dest = player + dir`. Si `walls[dest]` es `true`, el movimiento se rechaza por
   completo: no cambia `player`, no cambia `moves`, no se apila en `history`.
2. Si `dest` no tiene caja, el jugador se mueve a `dest`. Movimiento válido.
3. Si `dest` tiene caja, se calcula `boxDest = dest + dir`. Si `walls[boxDest]` es `true` o hay
   otra caja en `boxDest`, el movimiento se rechaza por completo (igual que el punto 1).
   Si no, la caja se mueve a `boxDest` y el jugador se mueve a `dest`. Movimiento válido.
4. Un movimiento válido incrementa `moves`, apila el `Move` correspondiente en `history` y
   dispara la comprobación de puntuación del paso 3.

**Solo un movimiento que cambia el estado cuenta como movimiento.** Chocar contra un muro o
contra una caja bloqueada no incrementa `moves` ni el HUD del panel.

Comprobación: con el motor arrancado a mano, empujar una caja contra un muro no cambia el
contador de movimientos del panel; una caja no puede empujar a otra caja.

### 3. Motor: puntuación, victoria y deshacer

- Al completar el punto 3 anterior, si `boxDest` es un objetivo y la caja movida tiene
  `everScored === false`, se suma `BOX_POINTS` y se marca `everScored = true`. Retirar
  después esa misma caja del objetivo **no** resta puntos ni revierte la marca: cada caja
  puntúa como máximo una vez en toda la partida, para que deshacer y repetir no infle la
  puntuación.
- Nivel completado cuando `boxes.every(b => targets[b.cell])`. En ese instante se suma el bono
  de nivel `bono(nivel, moves)` (nivel 1-based) y:
  - Si es el nivel 4 (el último): `state = "won"`, `stopLoop()`, `onGameOver(score)` una sola
    vez. `resume()` es no-op después.
  - Si no: se espera 900 ms (para que se vea la última caja encajar) y se llama `loadLevel(i+1)`
    seguido de `emit()`. `onLevel(i + 2)` porque el HUD cuenta desde 1.
- `undo()` (tecla `Z`): si `history` no está vacía, saca el último `Move`, restaura
  `player = move.playerFrom` y, si `move.boxIndex` no es `null`, restaura esa caja a
  `move.boxFrom`. Decrementa `moves`. **No** revierte `everScored` ni la puntuación ya sumada
  — deshacer corrige el tablero, no borra puntos ganados de forma honesta.
- `restartLevel()` (tecla `R`): vuelve a `loadLevel(levelIndex)` sin tocar `score` ni el nivel
  actual; sí vacía `history` y pone `moves = 0`. No afecta a `everScored` de cajas de niveles
  ya completados (son cajas distintas, de otro nivel).

Comprobación: completar el nivel 1 sin deshacer suma `BOX_POINTS + bono(1, moves)`; deshacer una
caja ya puntuada y volver a colocarla no vuelve a sumar `BOX_POINTS`.

### 4. Motor: bucle, entrada, animación y dibujo

- `emit()` con `lastScore` / `lastLives` / `lastLevel`; `onLives(1)` una vez al iniciar, como
  Tetris y Snake — el juego no tiene condición de derrota, así que "una vida" es la lectura
  honesta para la casilla `Vidas` del HUD.
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`, `KeyD`,
  `KeyZ`, `KeyR`. `preventDefault()` solo para esas. **Sin repetición automática**: una pulsación
  de dirección procesa como máximo un movimiento; hay que soltar y volver a pulsar para el
  siguiente (evita vaciar un nivel por mantener pulsada una tecla en un puzzle sin reflejos).
  Se implementa comprobando `keydown` una vez por tecla (ignorando el auto-repeat nativo del
  navegador) en vez de sondear `keys` en cada frame.
- Listeners `keydown` / `blur` sobre el canvas, nunca sobre `window`. `P` y `Escape` no llegan
  al motor: los atiende `components/game-canvas.tsx`.
- `anim`: cuando un movimiento válido mueve al jugador (y, si aplica, una caja), se guarda
  `{ from, to, startedAt: now }` por entidad; `draw()` interpola la posición visual entre
  `from` y `to` durante `ANIM_MS = 120` ms. La lógica de movimiento **no espera** a que termine
  la animación: un segundo `keydown` que llega durante los 120 ms se procesa igual (la
  animación en curso se corta y arranca una nueva desde la posición lógica actual), para que el
  juego no se sienta perezoso al encadenar movimientos rápido.
- `draw()`: tablero con `CELL = 40`, muros como bloques sólidos, objetivos como aro tenue en el
  suelo, cajas como bloques con relieve (más claro si `everScored`/sobre objetivo), jugador como
  figura simple orientada a `dir`. Panel a la derecha (`x = 560..640`): `NIVEL n/4`,
  `CAJAS x/y` (colocadas / total del nivel), `MOVS n`, y dos líneas de ayuda `Z DESHACER` /
  `R REINICIAR NIVEL`.
- `dt` capado a `DT_MAX = 50` ms para el render (la animación usa tiempo real, no `dt` del
  juego, porque no hay física que avanzar); `lastTime = null` al reanudar.
- `destroy()` cancela el frame, quita los listeners y es idempotente.
- `restart()` (el del contrato `GameEngine`, distinto de la tecla `R`): reinicia **toda la
  partida** — `score = 0`, `levelIndex = 0`, `loadLevel(0)`, `state = "playing"`, `emit()`,
  arranca. Es lo que dispara el botón `JUGAR DE NUEVO` de la plataforma. La tecla `R` del motor
  solo reinicia el nivel en curso, sin tocar la puntuación ni el nivel alcanzado.

Comprobación: `getEngine("empuja-cajas")` (tras el paso 6) devuelve la entrada y
`npm run build` sigue limpio.

### 5. Catálogo: nueva ficha `empuja-cajas`

`lib/games.ts`, nueva entrada en `GAMES`:

```ts
{
  id: "empuja-cajas",
  title: "EMPUJA CAJAS",
  short: "Empuja cada caja hasta su marca. Sin reloj, sin prisa.",
  long: "Un tablero fijo, cajas y sus marcas de destino. Cada movimiento cuenta y cada error se deshace: no hay enemigos ni cronómetro, solo la lógica de encontrar el camino correcto antes de gastar más pasos de los necesarios.",
  cat: "PUZZLE",
  cover: "cover-empuja-cajas",
  color: "cyan",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `.cover-empuja-cajas` nueva.

Comprobación: `/juegos/empuja-cajas` muestra la ficha en la biblioteca con su portada, antes de
que el motor esté registrado.

### 6. Registrar el motor

`lib/games/registry.ts`:

```ts
"empuja-cajas": {
  create: createEmpujaCajasGame,
  width: 640,
  height: 600,
  controls: "flechas o WASD para mover y empujar cajas, Z para deshacer, R para reiniciar el nivel",
  touch: { a: { code: "KeyZ", label: "DESHACER" }, b: { code: "KeyR", label: "REINICIAR" } },
},
```

Comprobación: `/jugar/empuja-cajas` pinta el canvas real en vez de `.game-arena`.

### 7. Leaderboard

`supabase/migrations/<timestamp>_juego_empuja_cajas.sql`:

```sql
insert into public.games (id, title) values ('empuja-cajas', 'EMPUJA CAJAS');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. Los tipos no se
regeneran: insertar una fila no cambia el esquema.

Comprobación: `select * from public.games` incluye la fila `empuja-cajas`.

### 8. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido
manual de los criterios de aceptación, incluidos los cuatro niveles completos de punta a punta.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/empuja-cajas` muestra un canvas de 640×600 con tablero y panel lateral, no la
      `.game-arena`.
- [ ] El nivel 1 se ve centrado dentro del área de tablero de 560×560, con sus muros, la caja,
      el objetivo y el jugador en las celdas exactas del mapa.
- [ ] Flechas y WASD mueven al jugador una celda; empujar una caja alineada con celda libre
      detrás la desplaza una celda.
- [ ] Empujar una caja contra un muro o contra otra caja no mueve nada y no incrementa `MOVS`.
- [ ] Mantener pulsada una flecha no repite el movimiento: hace falta soltar y volver a pulsar.
- [ ] Colocar una caja sobre su objetivo suma 50 puntos al HUD la primera vez; sacarla y
      volver a colocarla no vuelve a sumarlos.
- [ ] Completar el nivel 1 en el número de movimientos de referencia (`par = 5`) suma el bono
      máximo de nivel; completarlo con más movimientos suma un bono menor, nunca por debajo del
      mínimo declarado.
- [ ] Al completar un nivel el HUD de `NIVEL` avanza y el panel pasa a mostrar el nivel
      siguiente con su propio contador de cajas y movimientos a cero.
- [ ] `Z` deshace el último movimiento (jugador y, si aplica, la caja empujada) y decrementa
      `MOVS`; deshacer repetidamente vuelve al estado inicial del nivel sin romper el contador.
- [ ] `R` reinicia solo el nivel en curso: el tablero vuelve a su estado inicial, `MOVS` a 0, sin
      tocar la puntuación ni el nivel alcanzado.
- [ ] Completar el nivel 4 abre el modal `FIN DEL JUEGO` con la puntuación real; no existe
      ninguna forma de perder o de que aparezca ese modal antes de completar el nivel 4.
- [ ] El botón `PAUSA` congela el juego; `REANUDAR` lo reanuda sin saltos ni movimientos
      fantasma.
- [ ] `P` y `Escape` hacen lo mismo que el botón, y el motor no los interpreta como jugada.
- [ ] Con el canvas enfocado, las flechas no hacen scroll de la página; con el foco fuera,
      vuelve a hacerlo.
- [ ] Escribir `Z`, `R`, `W`, `A`, `S` o `D` en el campo de iniciales del modal no mueve ni
      reinicia el juego.
- [ ] `JUGAR DE NUEVO` reinicia toda la partida al nivel 1 con 0 puntos, sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'empuja-cajas'`.
- [ ] Esa puntuación aparece en `/salon?juego=empuja-cajas` y en `/juegos/empuja-cajas` sin
      recargar a mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Con `scores` vacía para este juego, `/salon?juego=empuja-cajas` muestra el estado vacío.
- [ ] Navegar de `/jugar/empuja-cajas` a `/biblioteca` y volver no duplica el bucle.
- [ ] Dejar la pestaña en segundo plano y volver no mueve al jugador ni completa un movimiento
      pendiente por sí solo.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid`, `/jugar/snake` y `/jugar/frogger` se
      juegan igual que antes.
- [ ] `select * from public.games` incluye una fila `empuja-cajas` además de las ya existentes.
- [ ] `lib/games.ts` mantiene sin tocar las fichas de los demás juegos.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en
      `/jugar/empuja-cajas`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** sin condición de derrota. Es la naturaleza del género — un Sokoban no mata al
  jugador, lo encierra en un tablero que puede deshacer. `onGameOver` solo se dispara al
  completar el último nivel, igual que la victoria de Arkanoid (SPEC 09).
- **Sí:** `onLives(1)` fijo, como Tetris y Snake. El HUD de la plataforma tiene una casilla
  `Vidas` para todos los juegos; mentir con un guion es peor que decir «una vida».
- **Sí:** deshacer ilimitado y sin coste. Es la herramienta estándar del género — sin ella, un
  solo error mueve al jugador a reiniciar el nivel entero por costumbre, y el juego deja de
  sentirse como un puzzle para sentirse como un examen de memoria.
- **Sí:** puntuar cada caja como máximo una vez (`everScored`). Sin este freno, sacar y volver a
  meter la misma caja en su objetivo mediante deshacer/rehacer sería una forma trivial de inflar
  la puntuación sin resolver nada nuevo.
- **Sí:** bono de nivel por eficiencia de movimientos frente a un `PAR` declarado, con piso
  mínimo. Da sentido a la puntuación en un género sin reloj: la habilidad se mide en pasos, no
  en segundos, y el piso evita que un jugador que tarda de más se quede sin recompensa alguna.
- **Sí:** un movimiento que no cambia el estado (chocar contra muro o caja bloqueada) no cuenta
  para `MOVS` ni para el bono. Penalizar la exploración natural de un puzzle espacial sería
  castigar la forma normal de jugarlo.
- **Sí:** sin repetición automática al mantener una tecla pulsada. Un Sokoban se juega
  movimiento a movimiento; el auto-repeat de teclado vaciaría niveles enteros por accidente.
- **Sí:** `R` reinicia solo el nivel actual; `restart()` del contrato reinicia toda la partida.
  Son necesidades distintas — corregir un nivel mal jugado frente a "JUGAR DE NUEVO" desde cero
  — y el contrato ya reserva `restart()` para lo segundo.
- **Sí:** niveles como datos puros en `levels.ts`, separados del motor, igual que `sprites.ts`
  en Arkanoid y Snake. Cambiar un mapa no debería tocar la lógica de movimiento.
- **Sí:** animación de interpolación de 120 ms que no bloquea el siguiente input. Sin ella el
  juego se ve como un salto brusco celda a celda; bloqueando el input se sentiría lento incluso
  en un puzzle sin prisa.
- **No:** varias vidas o penalización por reiniciar un nivel. Contradice el género: la
  exploración y el error son parte de resolver el rompecabezas, no un fallo que castigar.
- **No:** niveles generados proceduralmente o editor de niveles. Cuatro niveles hechos a mano
  bastan para esta primera variante; generarlos añade una capa de validación de solvencia que
  no entra en el alcance de una game jam.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Los valores `PAR` de cada nivel se fijaron a mano durante el diseño de este documento, sin un solver automático; un `PAR` demasiado ajustado castigaría incluso una solución razonable. | El paso 8 exige jugar los cuatro niveles de punta a punta antes de dar la spec por implementada; si un `PAR` resulta injustamente bajo, se corrige como parte de la implementación y se anota, igual que la SPEC 08 ajustó constantes de Tetris al jugarlo. |
| Un jugador puede empujar una caja a una esquina o contra una pared sin objetivo adyacente y quedar sin forma de resolver el nivel sin deshacer mucho. | El género no tiene condición de derrota: `Z` y `R` son ilimitados y gratuitos, así que un atasco nunca es permanente ni penaliza más allá de los movimientos ya gastados. |
| Sin repetición automática de teclado, un jugador que mantenga pulsada una flecha esperando movimiento continuo (hábito de Snake o Frogger) puede pensar que el juego no responde. | El `aria-label` del canvas (`controls` del registro) lo describe explícitamente, y el criterio de aceptación correspondiente verifica el comportamiento esperado, no uno accidental. |
| La pila `history` de deshacer podría crecer sin límite en un nivel jugado de forma muy exploratoria y consumir memoria de forma perceptible. | Cada `Move` es un objeto minúsculo (dos o tres pares de coordenadas); un nivel de 14×14 no admite más movimientos únicos razonables que unos pocos miles, muy por debajo de cualquier límite práctico. |
| Portar «a ojo» sin código de referencia hace que las constantes de puntuación se sientan arbitrarias si no se prueban jugando. | Los pasos 1 y 3 las fijan explícitamente y las declaran fuera de cambio, como hizo Snake (SPEC 10) y `ciempies`. |
| El relleno automático de filas cortas con `#` puede introducir un muro donde el diseño del nivel esperaba una celda transitable, si una fila del mapa se escribe con un espacio de menos. | El paso 1 declara que las filas deben tener igual longitud tras el relleno, y el criterio de aceptación de cada nivel se verifica jugándolo, no solo leyendo el mapa. |

---

## Lo que **no** entra en esta spec

- Casillas de hielo, deslizamiento o cualquier mecánica de `02-hielo-deslizante.md`.
- Más de cuatro niveles, selector de nivel o progreso persistente entre partidas.
- Sonido.
- Controles táctiles más allá del D-pad y los botones `Z`/`R` declarados en el registro.
- Skins (`clasico`/`neon`/`retro`).
- Editor de niveles o generación procedimental.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.
- Rate limiting, antitrampas y validación de la puntuación en servidor.

Cada una de ellas, si entra, va en su propia spec.
