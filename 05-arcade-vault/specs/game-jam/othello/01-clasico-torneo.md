# SPEC — OTHELLO: variante clásica «Torneo» contra la CPU

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-13
> **Objetivo:** Diseñar un Othello/Reversi 8×8 fiel a las reglas oficiales, jugado contra una CPU de cinco niveles de dificultad creciente, donde ganar sube de nivel, perder gasta una de tres vidas y la puntuación acumulada alimenta el leaderboard.

---

## Por qué existe esta spec

`Othello` / `Reversi` figura como sugerencia pendiente en `game-suggestions-todo.md`
(2026-09-22): estrategia de tablero 8×8, sin físicas ni sprites animados, con un costo de
motor bajo y el mayor contraste de género frente a lo que ya existe (`asteroids`, `caida`,
`arkanoid` y `snake` son reflejos en tiempo real; esto es decisión por turnos). No colisiona con
ningún `id` de `lib/games.ts` ni con `gloton`, `invasores`, `ranaria` o `duelo-pixel`.

Esta es la variante 01: el Othello **clásico**, sin reglas añadidas. Comparte con
`specs/game-jam/othello/02-eclipse-relampago.md` el género, el mundo lógico de 800×600 y el
contrato `GameEngine`, pero aquí el eje de diseño es la **escalera de rivales**: cinco CPUs cada
vez más fuertes, vidas para los tropiezos y una partida que termina cuando ya no te quedan.

Como Snake (SPEC 10), no hay código de referencia propio. Las constantes de esta spec **son** el
diseño del juego, y el paso 1 las fija: cambiarlas durante la implementación es rediseñar, no
implementar.

El contrato `GameEngine` encaja sin tocar nada: un `<canvas>` propio, estado en la clausura de
`createOthelloGame`, avisos por `onScore` / `onLives` / `onLevel` / `onGameOver`, y entrada por
puntero y teclado sobre el canvas. El juego es por turnos, así que el bucle de
`requestAnimationFrame` solo anima y cuenta los retardos de la CPU (nada de `setTimeout`, para que
la pausa congele todo).

---

## Alcance

**Dentro:**

- `lib/games/othello/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createOthelloGame`, sin sprites externos: círculos y rectángulos con `ctx`.
- `lib/games/othello/ai.ts`: la CPU como funciones puras sin estado (`legalMoves`, `applyMove`,
  `chooseMove(board, level)`), para poder razonar sobre ella sin el canvas.
- Tablero 8×8 de celdas de 64 px, centrado en un mundo de 800×600.
- Reglas oficiales: apertura con 4 fichas en el centro, el jugador (negras) mueve primero, un
  movimiento es legal si voltea al menos una línea contigua del rival en cualquiera de las 8
  direcciones, quien no tiene movimiento pasa, la partida acaba con tablero lleno o dos pases
  seguidos.
- CPU con cinco niveles (ver paso 1) y progresión: ganar una partida sube de nivel (tope 5),
  perder resta una vida, empatar repite el nivel sin coste.
- 3 vidas. Con 0 vidas, game over.
- Entrada: clic o toque sobre una celda legal (pointer events en el canvas) y, como alternativa de
  teclado, flechas para mover un cursor y `Enter` / espacio para colocar.
- Resaltado de las celdas legales y de la última ficha puesta por la CPU.
- Una línea `othello` en `GAME_ENGINES` (referencial: esta spec no la aplica).

**Fuera de alcance (para specs futuras o para la variante 02):**

- Cualquier regla que el Othello oficial no tenga: casillas bloqueadas, anclas, reloj de turno,
  power-ups. Eso es la variante 02.
- Partida a dos jugadores en local.
- Elegir color (el jugador siempre es negras) o nivel de CPU inicial.
- Animación de volteo en 3D: el volteo es un cambio de color con un fundido corto.
- Sonido.
- Deshacer jugada o sugerencias de «mejor movimiento».
- Modificar `lib/games.ts` o `lib/games/registry.ts`.
- Migraciones de Supabase.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni tipo de plataforma nuevo.** `scores` y `game_stats`
sirven a este juego sin tocarlas. El leaderboard se enciende con una fila en `games`
(`othello`, `OTHELLO`) cuando la variante se promueva fuera de `specs/game-jam/`; esa migración
no forma parte de esta propuesta. `scores.user_id` lo rellena la acción de guardado de la
plataforma (SPEC 15) sin que el motor sepa nada de ello.

Tipos locales, sin exportar fuera de `lib/games/othello/`:

```ts
type Piece = 0 | 1 | 2; // 0 vacía, 1 jugador (negras), 2 CPU (blancas)
type Board = Piece[]; // 64 posiciones, índice = row * 8 + col
type Move = { row: number; col: number; flips: number[] }; // flips = índices volteados
type Phase = "player" | "cpu-wait" | "flipping" | "match-over" | "gameover";
```

Estado en la clausura de `createOthelloGame`:

- `board: Board`, `turn: 1 | 2`, `legal: Move[]` (movimientos del jugador, recalculados al
  cambiar el turno).
- `score`, `lives`, `level` (1–5), `matchNo` (partidas jugadas en total).
- `cursor: { row; col }` (cursor de teclado), `hover: number | null` (celda bajo el puntero).
- `lastMove: number | null` (índice de la última ficha puesta), `flipAnim: { idx; t }[]`.
- `phase: Phase`, `cpuTimer` (ms hasta que la CPU mueve), `bannerText`, `bannerTimer` (ms).
- Bucle: `rafId`, `lastTime`, `destroyed`.

---

## Plan de implementación

### 1. Constantes de diseño

`lib/games/othello/engine.ts`. Constantes (declaradas fuera de cambio):

```
W 800 · H 600 · CELL 64 px · N 8 · BOARD 512 px
BOARD_X 144 · BOARD_Y 44   (tablero centrado: 144 + 512 + 144 = 800; 44 + 512 + 44 = 600)
START: (3,3)=2 · (3,4)=1 · (4,3)=1 · (4,4)=2     (negras = jugador, abajo-izq y arriba-der)
LIVES_START 3 · LEVEL_MAX 5
CPU_DELAY 600 ms · FLIP_DURATION 220 ms · BANNER_DURATION 1400 ms · DT_MAX 50 ms
MOVE_POINTS: +1 por ficha volteada · +10 si la ficha puesta es una esquina
MATCH_WIN: 100 × level + 5 × (fichas jugador − fichas CPU)
MATCH_DRAW: 50 × level
MATCH_LOSS: 0 puntos y −1 vida
```

Niveles de CPU (`chooseMove(board, level)`), todos deterministas salvo el desempate:

| Nivel | Estrategia                                                                    |
| ----- | ----------------------------------------------------------------------------- |
| 1     | Movimiento legal aleatorio.                                                   |
| 2     | Voraz: el que más fichas voltea; desempate aleatorio.                         |
| 3     | Tabla posicional (esquinas +100, casillas X/C −50/−20, bordes +10) a 1 capa.  |
| 4     | Minimax con poda alfa-beta a profundidad 3 con la tabla posicional.           |
| 5     | Minimax con poda alfa-beta a profundidad 5; en las últimas 8 casillas vacías, búsqueda exacta por diferencia de fichas. |

Presupuesto de cómputo: `chooseMove` corta a **40 000 nodos** y devuelve la mejor jugada hallada
hasta ese punto, de modo que ninguna decisión bloquee más de un frame largo.

Comprobación: `npm run build` limpio.

### 2. Reglas puras

`lib/games/othello/ai.ts`:

- `legalMoves(board, who): Move[]`: por cada celda vacía, recorre las 8 direcciones y recoge las
  líneas contiguas de rival cerradas por una ficha propia. Sin volteos, no es legal.
- `applyMove(board, move, who): Board`: devuelve un tablero nuevo, sin mutar el anterior.
- `count(board): { p1; p2; empty }`.
- `isOver(board)`: ninguno de los dos jugadores tiene movimiento legal.

Comprobación: con el tablero inicial, el jugador tiene exactamente 4 movimientos legales
(`(2,3)`, `(3,2)`, `(4,5)`, `(5,4)`).

### 3. Motor: turnos y partida

- `initMatch()`: tablero inicial, `turn = 1`, `phase = "player"`, recalcula `legal`. No toca
  `score`, `lives` ni `level`.
- `initGame()`: `score = 0`, `lives = 3`, `level = 1`, `matchNo = 0`, luego `initMatch()`.
- Turno del jugador: solo una celda en `legal` es válida; un clic en cualquier otra se ignora sin
  efecto. Al colocar: `applyMove`, `score += flips.length` (+10 si esquina), `phase = "flipping"`
  durante `FLIP_DURATION`, después pasa el turno.
- Cambio de turno: si el rival tiene movimiento, le toca; si no, **pasa** (banner
  `SIN MOVIMIENTOS`) y vuelve a mover quien movió; si ninguno puede, termina la partida.
- Turno de la CPU: `phase = "cpu-wait"`, `cpuTimer = CPU_DELAY`; al llegar a 0 se llama a
  `chooseMove(board, level)` y se aplica. La CPU no suma puntos.
- Fin de partida (`isOver`): se comparan fichas, se aplica `MATCH_WIN` / `MATCH_DRAW` /
  `MATCH_LOSS`, se muestra banner `GANAS` / `EMPATE` / `PIERDES` y `phase = "match-over"` durante
  `BANNER_DURATION`.
  - Victoria: `level = min(5, level + 1)`; nueva partida.
  - Empate: mismo nivel; nueva partida.
  - Derrota: `lives -= 1`; si `lives === 0`, game over; si no, mismo nivel, nueva partida.
- Game over: `stopLoop()` y `onGameOver(score)` **una sola vez**. `resume()` es no-op después.

Comprobación: forzar un tablero con un solo movimiento legal para cada bando y verificar el
pase; forzar un tablero lleno y verificar el cierre de partida.

### 4. Motor: bucle, entrada y dibujo

- `emit()` con `lastScore` / `lastLives` / `lastLevel`: solo avisa cuando el valor cambia.
  `onLives(3)` y `onLevel(1)` al inicio.
- Entrada de puntero: `pointerdown` sobre el canvas. Se convierte a coordenadas lógicas con
  `(clientX − rect.left) × W / rect.width` (y análogo en Y), porque el CSS estira el canvas.
  Fuera del tablero no hace nada. `pointermove` actualiza `hover`.
- Entrada de teclado: `GAME_KEYS` = `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Enter`,
  `Space`. `preventDefault()` solo para esas. Las flechas mueven `cursor` con tope en los bordes;
  `Enter` / `Space` colocan en `cursor`. `P` y `Escape` no llegan al motor.
- Mientras `phase !== "player"` la entrada se ignora (no se encola nada).
- Listeners `keydown`, `pointerdown`, `pointermove` y `blur` sobre el canvas, nunca sobre
  `window`.
- `draw()`: fondo oscuro; tablero verde con rejilla tenue; fichas como círculos negro/blanco con
  borde neón; las celdas legales del jugador con un punto tenue (y relleno más fuerte bajo
  `hover` o `cursor`); la `lastMove` de la CPU con un aro; el volteo como fundido de color
  durante `FLIP_DURATION`. En el canvas solo se dibuja el estado propio del juego: el rótulo
  `TU TURNO` / `CPU PIENSA…` y los banners `SIN MOVIMIENTOS` / `GANAS` / `EMPATE` / `PIERDES`.
  **Nunca** puntos, vidas, nivel ni overlay de game over: eso lo pone la plataforma.
- `dt` capado a `DT_MAX`; `lastTime = null` al reanudar, de modo que pausar durante `cpu-wait` no
  acorta ni alarga la espera.
- `restart()`: detiene el bucle, `initGame()`, `emit()`, arranca.
- `destroy()` cancela el frame, quita los listeners y es idempotente.
- `initGame(); draw();` antes de devolver.

Comprobación: `npm run build` limpio; con `npm run dev` el tablero se pinta y reacciona al ratón.

### 5. Registrar (referencial)

Al promover la spec, `lib/games/registry.ts` ganaría:
`othello: { create: createOthelloGame, width: 800, height: 600, controls: "clic en una casilla marcada o flechas y Enter para colocar" }`,
y `lib/games.ts` una ficha `othello` (`cat: "VERSUS"` o una categoría `ESTRATEGIA` si el
usuario la crea), más la migración `insert into public.games (id, title) values ('othello',
'OTHELLO')`. Nada de esto se hace en la propuesta.

### 6. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido manual
de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/othello` muestra un canvas de 800×600 con un tablero 8×8 centrado y 4 fichas
      iniciales, no la `.game-arena`.
- [ ] Al empezar hay exactamente 4 celdas marcadas como legales.
- [ ] Un clic en una celda no marcada no hace nada; un clic en una marcada coloca la ficha y
      voltea todas las líneas correctas (incluidas diagonales y varias líneas a la vez).
- [ ] Con el teclado, las flechas mueven el cursor sin salirse del tablero y `Enter` / espacio
      colocan solo si la celda es legal.
- [ ] Tras la jugada, la CPU espera ~600 ms y mueve; durante esa espera los clics se ignoran.
- [ ] Si un bando no tiene movimientos aparece `SIN MOVIMIENTOS` y el turno vuelve a quien movió.
- [ ] Con el tablero lleno, o con dos pases seguidos, la partida termina y se evalúa.
- [ ] Voltear fichas suma 1 punto por ficha y colocar en esquina suma 10 extra en el HUD.
- [ ] Ganar una partida suma `100 × nivel + 5 × diferencia`, sube el HUD de nivel (máx. 05) y
      empieza otra partida con la CPU más fuerte.
- [ ] Empatar repite el nivel sin quitar vida; perder quita una vida del HUD (3 → 2 → 1 → 0).
- [ ] Con 0 vidas se abre el modal `FIN DEL JUEGO` con la puntuación acumulada real.
- [ ] El nivel 1 comete errores evidentes (juega al azar) y el nivel 5 no entrega esquinas
      gratis en una partida normal.
- [ ] Ninguna decisión de la CPU congela la pestaña más de ~100 ms en un equipo de gama media.
- [ ] El canvas no dibuja puntos, nivel ni vidas, ni ningún overlay de game over.
- [ ] El botón `PAUSA` congela el juego (también la espera de la CPU) y `REANUDAR` lo reanuda sin
      saltarse ni duplicar el turno de la CPU; `P` y `Escape` hacen lo mismo.
- [ ] Con el canvas enfocado, las flechas y el espacio no hacen scroll de la página.
- [ ] Escribir flechas, espacio o `Enter` en el campo de iniciales no mueve el cursor ni coloca
      fichas.
- [ ] Un clic con el canvas escalado por CSS (ventana estrecha) cae en la celda correcta.
- [ ] `JUGAR DE NUEVO` reinicia a nivel 1, 0 puntos y 3 vidas sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'othello'` (una vez
      promovida la spec y dada de alta la fila en `games`), con `user_id` según SPEC 15.
- [ ] Esa puntuación aparece en `/salon?juego=othello` y en `/juegos/othello` sin recargar a
      mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Navegar de `/jugar/othello` a `/biblioteca` y volver no duplica el bucle ni los listeners.
- [ ] Dejar la pestaña en segundo plano y volver no hace mover a la CPU varias veces de golpe.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid` y `/jugar/snake` se juegan igual que
      antes.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/othello`.

---

## Decisiones

- **Sí:** reglas oficiales sin añadidos. La variante 01 es la referencia con la que comparar la 02.
- **Sí:** el jugador es negras y mueve primero, como dicta el reglamento.
- **Sí:** escalera de cinco CPUs. Da sentido al HUD de nivel y un arco de dificultad sin añadir
  reglas.
- **Sí:** vidas por derrota (no por jugada). Una partida de Othello dura ~30 turnos; castigar cada
  error sería desproporcionado.
- **Sí:** empate no cuesta vida. Es un resultado neutro y evita un bucle frustrante.
- **Sí:** puntos por volteo y bonus de esquina durante la partida, además del bonus final. Hace
  que el HUD se mueva en cada jugada y premia las esquinas, el concepto central del juego.
- **No:** puntuar a la CPU ni mostrar su marcador en el canvas; el HUD es de la plataforma.
- **Sí:** CPU sin `setTimeout`, con un temporizador en milisegundos dentro del bucle. La pausa
  tiene que congelarla.
- **Sí:** `ai.ts` separado del motor y puro. Permite verificar las reglas sin canvas.
- **Sí:** puntero y teclado a la vez. El puntero es natural en un tablero; el teclado mantiene la
  accesibilidad.
- **No:** WASD. Chocaría con la escritura de iniciales y no aporta nada sobre las flechas aquí.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo                                                                          | Mitigación                                                                                          |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| La búsqueda de nivel 5 bloquea el hilo principal en el medio juego.             | Corte duro a 40 000 nodos, devuelve la mejor jugada parcial; verificado en un equipo lento.        |
| Un bug en el recorrido de direcciones da jugadas legales falsas o pierde algunas. | `ai.ts` es puro; se comprueban a mano la apertura (4 jugadas), los pases y el tablero lleno.      |
| El clic cae en la celda equivocada con el canvas escalado por CSS.              | Conversión con `rect.width` / `rect.height`, nunca con `canvas.width`; criterio de aceptación propio. |
| Pausar durante la espera de la CPU hace que mueva al reanudar de golpe o dos veces. | `cpuTimer` solo decrece con `dt` del bucle; `lastTime = null` al reanudar; un único `chooseMove` por turno. |
| Dos pases seguidos o tablero lleno no cierran la partida y el bucle gira en vacío. | `isOver` se evalúa en cada cambio de turno antes de ceder el control.                            |
| La CPU de nivel 5 hace el juego imbatible y se pierde la progresión.            | Es intencional que sea fuerte; las 3 vidas y los niveles 1–4 mantienen el arco. Se ajusta la profundidad en una spec posterior, no durante la implementación. |
| Escribir en el campo de iniciales mueve el cursor.                              | Bucle parado con el modal abierto y listeners en el canvas, no en `window`.                         |
| Pestaña en segundo plano: `dt` enorme avanza animaciones y temporizadores a la vez. | `dt` capado a 50 ms y `lastTime = null` al reanudar.                                            |

---

## Lo que **no** entra en esta spec

- Casillas bloqueadas, anclas, reloj de turno y cualquier otra regla añadida (variante 02).
- Dos jugadores en local.
- Elegir color o nivel inicial de CPU.
- Sonido.
- Controles táctiles dedicados (el toque sobre una celda ya funciona por `pointerdown`; el mando
  táctil con cruceta es otra spec).
- Aplicar la migración, tocar `lib/games.ts` o `lib/games/registry.ts`.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
