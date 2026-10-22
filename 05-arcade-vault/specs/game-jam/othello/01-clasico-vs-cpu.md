# SPEC — OTHELLO: clásico contra la CPU

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-22
> **Objetivo:** Diseñar un Othello/Reversi 8×8 fiel a las reglas de siempre — el jugador (negras) contra una CPU (blancas) de una sola partida — como ficha nueva `othello` en categoría `VERSUS`, con motor real, ratón/táctil/teclado y leaderboard en Supabase desde el primer día.

---

## Por qué existe esta spec

El catálogo es, sin excepción, un catálogo de **reflejos en tiempo real**: `asteroids`, `arkanoid`,
`snake`, `frogger` y las maquetas (`gloton`, `invasores`, `duelo-pixel`) se ganan con la mano, y
`caida` (Tetris) con ritmo. Ningún juego se gana **pensando**: no hay turnos, ni tablero discreto,
ni un oponente que responda a lo que el jugador acaba de hacer. `game-suggestions-todo.md` ya lo
señala para OTHELLO / REVERSI: estrategia simple de tablero 8×8, sin sprites animados que pesen,
bajo coste de motor y máximo contraste de género. Además aprovecha el hueco `VERSUS` — hoy sólo
ocupado por `duelo-pixel`, aún en maqueta — con una partida contra la CPU que no necesita segundo
jugador humano.

Como con Snake (SPEC 10) y con las variantes de `ciempies`, **no hay código de referencia**: no
existe ninguna carpeta `References/.../othello`. Las constantes de este documento son el diseño en
sí, no el ajuste de un port; cambiarlas durante la implementación es rediseñar, no implementar. El
motor dibuja todo con primitivas de canvas (rectángulos, círculos, gradientes) y no usa ningún
asset externo.

Esta variante es la lectura **mínima y fiel**: una partida, un oponente de dificultad fija, las
reglas oficiales y nada más. La segunda variante (`02-torneo-piedras.md`) añade una campaña de
cinco rondas con piedras bloqueadas, CPU cada vez más fuerte, vidas y un deshacer; esta se queda
deliberadamente en el conjunto más pequeño que ya es reconociblemente Othello.

---

## Alcance

**Dentro:**

- `lib/games/othello/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createOthelloGame`, sin assets externos.
- Mundo lógico de **640×640**: tablero 8×8 de celdas de 64 px en `(64, 64)–(576, 576)`; franja
  superior de 64 px para el marcador de fichas y el turno, franja inferior de 64 px para mensajes
  de estado.
- Reglas oficiales: colocar una ficha que voltee al menos una línea contigua de fichas rivales
  (8 direcciones) cerrada por una ficha propia; pasar turno automáticamente si no hay jugada
  legal; fin de partida cuando ninguno de los dos puede mover o el tablero está lleno.
- El jugador lleva las **negras y mueve primero**; la CPU lleva las blancas.
- CPU de dificultad fija: evaluación de 1 jugada por tabla de pesos posicionales
  (`POSITION_WEIGHTS`), con desempate aleatorio entre jugadas igual de buenas y una pausa de
  «pensar» antes de cada jugada.
- Pista permanente de jugadas legales (puntos tenues en las celdas válidas del jugador).
- Animación de volteo de fichas con escalonado por distancia a la ficha colocada.
- Control con ratón/dedo (clic o toque sobre una celda) y con teclado (cursor con flechas/WASD,
  `Space`/`Enter` para colocar).
- Puntuación en vivo `fichas del jugador × 10` y bonus de victoria/empate al terminar.
- Nueva ficha `othello` en `lib/games.ts` (categoría `VERSUS`) y clase de portada
  `cover-othello` en `app/globals.css`.
- Una línea `othello` en `GAME_ENGINES` (`lib/games/registry.ts`).
- Migración `insert into public.games (id, title) values ('othello', 'OTHELLO')` y su aplicación.

**Fuera de alcance (para specs futuras o para la variante `02-torneo-piedras.md`):**

- Varias dificultades, minimax o cualquier búsqueda a más de 1 jugada.
- Campaña por rondas, piedras bloqueadas, vidas, deshacer.
- Partida local a dos jugadores humanos.
- Elegir color (el jugador siempre lleva negras).
- Cronómetro por jugada o reloj de partida.
- Sonido.
- Skins (`clasico`/`neon`/`retro`).
- Nueva categoría `ESTRATEGIA`.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla nueva, ni columna, ni tipo de plataforma.** `GameEngineEntry` ya existe
desde la SPEC 08, `scores` y `game_stats` sirven a este juego sin tocarlas, y el leaderboard se
enciende con una fila en `games`. `Cat` y `CATS` no cambian: el juego entra en `VERSUS`.

Tipos locales del motor, sin exportar:

```ts
type Side = 1 | 2; // 1 = negras (jugador), 2 = blancas (CPU)
type Cell = 0 | Side; // 0 = vacía
type Move = { col: number; row: number; flips: number[] }; // flips: índices (row * 8 + col) a voltear
type Flip = { index: number; delay: number; elapsed: number; to: Side }; // animación de un volteo
type Phase = "player" | "cpu-think" | "animating" | "pass" | "gameover";
```

Estado en la clausura de `createOthelloGame`:

- `board: Cell[]` — array plano de 64 celdas, índice `row * 8 + col`.
- `turn: Side`, `phase: Phase`, `cursor: { col: number; row: number }` (celda resaltada).
- `flips: Flip[]` — volteos en curso; mientras haya alguno, `phase === "animating"`.
- `pendingNext: Phase | null` — fase a la que se pasa cuando termina la animación.
- `legal: Move[]` — jugadas legales del bando que tiene el turno, recalculadas al cambiar de turno.
- `score`, `thinkAccum` (ms), `passAccum` (ms), `badFlash: { index: number; left: number } | null`.
- `message: string | null` — texto de la franja inferior (`CPU PASA`, `NO TIENES JUGADAS`, …).
- `result: "win" | "draw" | "loss" | null`.
- Bucle: `rafId`, `lastTime`, `destroyed`.

**Geometría del mundo lógico 640×640:**

```
W 640 · H 640 · CELL 64 · BOARD_X 64 · BOARD_Y 64 · COLS 8 · ROWS 8
franja superior  y 0..64    — marcador de fichas (negras / blancas) y turno
tablero          y 64..576  — 8×8
franja inferior  y 576..640 — mensajes de estado
```

---

## Plan de implementación

### 1. Constantes y reglas puras

`lib/games/othello/engine.ts`, primera parte. Constantes de diseño:

```
W 640 · H 640 · CELL 64 · BOARD_X 64 · BOARD_Y 64
START: (3,3) blanca · (4,3) negra · (3,4) negra · (4,4) blanca   (col, row)
PLAYER 1 (negras, mueve primero) · CPU 2 (blancas)
POINTS_PER_DISC 10 · WIN_BONUS 300 · DRAW_BONUS 100
CPU_THINK_MS 700 · PASS_MS 1400 · BAD_FLASH_MS 250
FLIP_MS 220 · FLIP_STAGGER_MS 60 (por casilla de distancia a la ficha colocada)
DT_MAX 50
POSITION_WEIGHTS (fila a fila, simétrica):
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

- `flipsFor(board, col, row, side): number[]` — para una celda vacía, recorre las 8 direcciones;
  en cada una acumula fichas rivales contiguas y sólo las cuenta si la línea termina en una ficha
  de `side`. Devuelve los índices a voltear (vacío = jugada ilegal).
- `legalMoves(board, side): Move[]` — todas las celdas vacías con `flipsFor` no vacío.
- `applyMove(board, move, side): Cell[]` — copia del tablero con la ficha colocada y las `flips`
  volteadas.
- `count(board, side): number`.

Comprobación: `npm run build` limpio. Con el tablero inicial, `legalMoves(board, 1)` devuelve
exactamente 4 jugadas: `(3,2)`, `(2,3)`, `(5,4)`, `(4,5)`.

### 2. Flujo de turnos, pasar y fin de partida

Máquina de fases:

- `player`: espera clic/tecla. Si `legal` está vacío al empezar el turno → `message = "NO TIENES
  JUGADAS"`, `phase = "pass"` durante `PASS_MS`, y el turno pasa a la CPU.
- Al colocar: se calcula el `Move`, se actualiza `board` **inmediatamente** (la lógica no espera a
  la animación), se crean los `Flip` con `delay = FLIP_STAGGER_MS × distancia` y `phase =
  "animating"`; al terminar el último volteo se aplica `pendingNext`.
- `cpu-think`: acumula `thinkAccum`; al llegar a `CPU_THINK_MS` elige jugada y repite el flujo.
  Si la CPU no tiene jugadas: `message = "CPU PASA"`, `phase = "pass"` durante `PASS_MS` y vuelve
  al jugador.
- Fin de partida: si ningún bando tiene jugada legal, o no quedan celdas vacías → `phase =
  "gameover"`. Si el jugador no puede mover pero la CPU sí, la CPU juega varias veces seguidas
  (cada una con su `CPU_THINK_MS`) hasta que el jugador pueda mover o termine la partida.

**Elección de la CPU:** para cada jugada legal suma `POSITION_WEIGHTS` de la celda colocada más
`1` por cada ficha volteada; elige la de mayor valor. Empates → aleatorio uniforme entre las
empatadas.

Comprobación: con `console.assert` puntuales durante el desarrollo (retirados antes de cerrar):
una partida simulada CPU contra CPU termina siempre con `count(1) + count(2) ≤ 64` y nunca
queda una jugada legal sin jugar.

### 3. Puntuación y avisos

- Puntuación en vivo: `score = count(board, 1) × POINTS_PER_DISC`. Al cambiar, `onScore`.
- Al terminar: `result = win` si `count(1) > count(2)`, `draw` si son iguales, `loss` si menos.
  `score += WIN_BONUS` (victoria) o `DRAW_BONUS` (empate); la derrota no suma bonus. Máximo
  teórico: `64 × 10 + 300 = 940`.
- `onLives(1)` al iniciar la partida y `onLives(0)` al terminar, igual que Tetris/Snake: el HUD
  de la plataforma tiene una casilla `Vidas` fija. `onLevel(1)` una sola vez; no hay niveles.
- `onGameOver(score)` una sola vez, **después** de que acabe la última animación de volteo y
  de mostrar el resultado durante 1200 ms (`RESULT_HOLD_MS`) en la franja inferior
  (`GANAS`, `EMPATE`, `PIERDES`), con el bucle detenido.

Comprobación: terminar una partida abre el modal `FIN DEL JUEGO` con la puntuación del HUD.

### 4. Dibujo

`draw()` con las primitivas de canvas, nada de imágenes:

- Fondo `#0a0a18`; tablero verde oscuro (`#0b4a2a`) con líneas de celda tenues.
- Fichas: círculos de radio 26 px con gradiente radial (negras `#111`→`#444`, blancas
  `#ddd`→`#fff`) y aro de 2 px. El volteo escala la ficha en X de 1→0→1 en `FLIP_MS`; el color
  cambia a mitad de la animación.
- Jugadas legales del jugador: punto de 6 px de radio, `rgba(255,255,255,0.25)`, sólo durante
  `phase === "player"`.
- Cursor: borde de 3 px cian sobre la celda `cursor`; `badFlash`: borde rojo sobre la celda
  pulsada durante `BAD_FLASH_MS`.
- Última jugada de la CPU: marca de 6 px en la esquina de la celda, para que el jugador vea qué
  ha cambiado.
- Franja superior: ficha negra + recuento, ficha blanca + recuento y un triángulo bajo el bando
  que tiene el turno. Son estado propio del juego (como `PULSA UNA FLECHA` en Snake), no una copia
  de la puntuación.
- Franja inferior: `message` centrado (`TU TURNO`, `PENSANDO…`, `CPU PASA`, `NO TIENES JUGADAS`,
  resultado).
- Sin puntuación, nivel, vidas ni overlay de game over: eso es el HUD de la plataforma.

Comprobación: `npm run build` limpio; a ojo, el tablero ocupa el cuadrado central y no hay texto
fuera de las dos franjas.

### 5. Entrada y bucle

- `pointerdown` sobre el canvas: convierte `clientX/Y` con `getBoundingClientRect()` al mundo
  lógico 640×640 (el CSS estira el canvas; **la conversión usa la escala, no 1:1**). Si cae
  dentro del tablero y la celda es legal en `phase === "player"`, juega; si no es legal, activa
  `badFlash`. `pointermove` actualiza `cursor` (no en dispositivos táctiles sin hover).
- Teclado con el canvas enfocado: flechas/WASD mueven `cursor` una celda, sin wrap; `Space` y
  `Enter` juegan en la celda del cursor. Al empezar cada turno del jugador el cursor salta a la
  primera jugada legal (orden fila-columna) si el cursor actual no es legal.
- Mientras `phase !== "player"` toda la entrada se ignora (no se encola ninguna jugada).
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`, `KeyD`,
  `Space`, `Enter`. `preventDefault()` solo para esas.
- Listeners `keydown` / `blur` / `pointerdown` / `pointermove` sobre el canvas, nunca sobre
  `window` ni `document`. `P` y `Escape` no llegan al motor: los gestiona la plataforma.
- `emit()` con `lastScore` / `lastLives` / `lastLevel`, llamando a los callbacks sólo cuando el
  valor cambia.
- `dt` en milisegundos, capado a `DT_MAX`; `lastTime = null` al reanudar. Todos los temporizadores
  (`thinkAccum`, `passAccum`, `badFlash.left`, `flips[].elapsed`) avanzan con `dt`, así que
  `pause()` los congela.
- `restart()`: detiene el bucle, reinicia tablero, `score`, `result`, `message`, `flips`, vuelve a
  `phase = "player"` y arranca.
- `destroy()` cancela el frame, quita los cuatro listeners y es idempotente.
- `initGame(); draw();` antes de devolver el motor.

Comprobación: `getEngine("othello")` (tras el paso 7) devuelve la entrada y `npm run build` sigue
limpio.

### 6. Catálogo: nueva ficha `othello`

`lib/games.ts`, nueva entrada en `GAMES`:

```ts
{
  id: "othello",
  title: "OTHELLO",
  short: "Voltea las fichas rivales. Gana el que domine el tablero.",
  long: "El clásico de estrategia sobre un tablero de 8×8. Coloca una ficha para encerrar las del rival y voltearlas a tu color; si no puedes mover, pasas. Gana quien tenga más fichas al llenarse el tablero. Contra una CPU que valora las esquinas.",
  cat: "VERSUS",
  cover: "cover-othello",
  color: "green",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `.cover-othello` nueva, en el mismo patrón que las portadas generadas
existentes (gradiente verde de tablero con dos círculos, uno claro y uno oscuro, mediante
`radial-gradient` en `::after`; sin imagen externa).

Comprobación: `/juegos/othello` muestra la ficha en la biblioteca con su portada, antes de que el
motor esté registrado (cae en `.game-arena` con `seededScores()`), y el filtro `VERSUS` la
incluye.

### 7. Registrar el motor

`lib/games/registry.ts`:

```ts
othello: {
  create: createOthelloGame,
  width: 640,
  height: 640,
  controls:
    "ratón o toque para colocar una ficha, flechas o WASD para mover el cursor, espacio o Enter para colocar",
  touch: { a: { code: "Space", label: "PONER" }, repeat: true },
},
```

Comprobación: `/jugar/othello` pinta el canvas real en vez de `.game-arena`.

### 8. Leaderboard

`supabase/migrations/<timestamp>_juego_othello.sql`, con timestamp posterior a la última
migración existente:

```sql
insert into public.games (id, title) values ('othello', 'OTHELLO');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. Los tipos no se
regeneran: insertar una fila no cambia el esquema.

Comprobación: `select * from public.games` incluye la fila `othello`.

### 9. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido manual
de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/othello` muestra un canvas de 640×640 con tablero 8×8, no la `.game-arena`.
- [ ] La partida empieza con 4 fichas (2 negras, 2 blancas) en el centro y 4 puntos de jugada
      legal visibles para el jugador.
- [ ] Clic (o toque) en una celda legal coloca una ficha negra y voltea exactamente las fichas
      que cumplen la regla, en cualquiera de las 8 direcciones.
- [ ] Clic en una celda ilegal (ocupada o sin volteo) no hace nada salvo el parpadeo rojo de
      250 ms; no pasa el turno.
- [ ] Las flechas/WASD mueven el cursor sin salirse del tablero; `Space` y `Enter` juegan en la
      celda del cursor si es legal.
- [ ] Tras la jugada del jugador la CPU espera unos 700 ms («PENSANDO…») y juega; mientras
      tanto, clics y teclas se ignoran.
- [ ] La CPU prefiere esquinas disponibles frente a otras jugadas con más volteos.
- [ ] Los volteos se animan en cascada (más lejos de la ficha colocada, más tarde) y no se puede
      jugar hasta que terminan.
- [ ] Si el jugador no tiene jugada legal, aparece `NO TIENES JUGADAS` y el turno pasa solo; si
      es la CPU quien no puede, aparece `CPU PASA`.
- [ ] Si un bando no puede mover pero el otro sí, el otro juega seguido hasta que el primero
      pueda mover o la partida acabe.
- [ ] El HUD muestra `fichas negras × 10` y se actualiza tras cada jugada; sube y baja con los
      volteos.
- [ ] Ganar suma 300 al final, empatar 100, perder 0; el HUD y el modal muestran el mismo número.
- [ ] La partida termina cuando ningún bando puede mover o el tablero se llena, muestra
      `GANAS` / `EMPATE` / `PIERDES` unos 1200 ms y abre el modal `FIN DEL JUEGO`.
- [ ] El HUD muestra 1 vida al inicio y 0 al terminar.
- [ ] El botón `PAUSA` congela el juego (incluido el «pensar» de la CPU y las animaciones) y
      `REANUDAR` lo reanuda sin saltar tiempo.
- [ ] `P` y `Escape` hacen lo mismo que el botón, y el motor no los interpreta como jugada.
- [ ] Con el canvas enfocado, las flechas, WASD, espacio y Enter no hacen scroll de la página.
- [ ] Escribir `W`, `A`, `S`, `D`, espacio o Enter en el campo de iniciales no mueve ni reinicia
      el juego.
- [ ] En un viewport estrecho (canvas escalado por CSS), el toque cae en la celda correcta.
- [ ] En móvil el mando táctil muestra la cruceta y el botón `PONER`.
- [ ] `JUGAR DE NUEVO` reinicia tablero, puntuación y turno sin recargar la página.
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

- **Sí:** id `othello`. Libre en `lib/games.ts`, en `GAME_ENGINES` y en `specs/game-jam/`.
- **Sí:** categoría `VERSUS`. Hay un rival (la CPU) y es la categoría con menos juegos; evita
  ampliar `Cat`/`CATS` y tocar el filtro de la biblioteca por un solo juego. Una categoría
  `ESTRATEGIA` queda para una spec propia si llegan más juegos de tablero.
- **Sí:** tablero 8×8, jugador negras y mueve primero. Es la convención oficial.
- **Sí:** mundo 640×640 cuadrado, a diferencia del 4/3 de Asteroids/Arkanoid/Snake. Un tablero 8×8
  es cuadrado y las franjas de 64 px dan sitio a marcador y mensajes sin overlays de React. El
  marco de la plataforma ya se adapta por `GameEngineEntry.width/height` (precedente: Tetris 420×600).
- **Sí:** CPU de 1 jugada con tabla de pesos. Es reconocible (juega esquinas, evita casillas
  X/C) y barata; una búsqueda más profunda es otra variante.
- **No:** minimax en esta variante. Se reserva para `02-torneo-piedras.md`.
- **Sí:** pista permanente de jugadas legales. Reduce fricción en una primera partida y evita
  clics fallidos en táctil.
- **Sí:** la lógica actualiza el tablero al instante y la animación es sólo visual. Evita estados
  intermedios inconsistentes si se pausa a mitad.
- **Sí:** puntuación en vivo `fichas × 10` más bonus final. Premia ganar por mucho y deja una
  puntuación distinta de cero aunque se pierda.
- **Sí:** `onLives(1)` / `onLives(0)`, igual que Tetris y Snake, para el HUD de vidas fijo.
- **Sí:** listeners de puntero en el canvas con conversión por escala. El canvas se estira por CSS.
- **No:** sonido, skins, dificultades, 2 jugadores locales ni elegir color.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo                                                                                          | Mitigación                                                                                           |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Un fallo en `flipsFor` (línea sin cerrar, borde del tablero) rompe la partida sin avisar.        | Paso 1: comprobación con las 4 jugadas iniciales y partida simulada CPU-vs-CPU antes de dibujar.     |
| Mala conversión de coordenadas con el canvas estirado por CSS: el toque cae en la celda vecina.  | La conversión usa `getBoundingClientRect()` y la escala `W / rect.width`; criterio de aceptación en viewport estrecho. |
| Pausar durante el «pensar» de la CPU o una animación deja un temporizador vivo.                  | Todo temporizador avanza con `dt`; `pause()` detiene el bucle y `lastTime = null` al reanudar.        |
| El jugador queda sin jugadas y la CPU encadena turnos: el bucle de pases puede no terminar.      | Cada pasada comprueba fin de partida (ninguno puede mover o tablero lleno) antes de ceder el turno.  |
| Tras muchas partidas una CPU de 1 jugada resulta demasiado fácil para un jugador habitual.       | Es intencional en esta variante; la dificultad progresiva es la variante `02-torneo-piedras.md`.     |
| El mismo clic o `Space` dispara jugada y `restart()` al cerrar el modal de fin.                 | Bucle parado y listeners en el canvas; con el modal abierto el canvas no tiene el foco.              |
| Doble `onGameOver` si el último volteo termina a la vez que expira `RESULT_HOLD_MS`.             | Guarda `phase === "gameover"` y un booleano `reported`; `onGameOver` sólo se emite una vez.          |

---

## Lo que **no** entra en esta spec

- Varias dificultades o búsqueda minimax.
- Campaña por rondas, piedras bloqueadas, vidas y deshacer (variante `02-torneo-piedras.md`).
- Partida local a dos jugadores.
- Sonido y skins.
- Categoría `ESTRATEGIA`.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
