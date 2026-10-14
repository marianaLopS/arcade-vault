# SPEC — MATCH CRISTAL: clásico por movimientos

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06, SPEC 11
> **Fecha:** 2026-10-14
> **Objetivo:** Diseñar un match-3 clásico de intercambio y cascadas — tablero de 8×8 gemas de
> seis tipos, intercambio de gemas adyacentes, líneas de 3 o más, caída y relleno en cascada —
> con presupuesto de **25 movimientos** que se amplía al superar los objetivos de nivel, como ficha
> nueva `match-cristal` en categoría PUZZLE, con motor real y leaderboard en Supabase desde el
> primer día.

---

## Por qué existe esta spec

La categoría PUZZLE tiene un solo juego real (`caida`, Tetris) y su lógica es de reflejos y
encaje de formas. Ningún juego del catálogo se juega **por turnos sobre una grilla estática**:
todo lo actual es tiempo real (Asteroids, Arkanoid, Snake, Tetris) o maqueta de tiempo real
(`gloton`, `invasores`, `ranaria`, `duelo-pixel`). Un match-3 aporta la mecánica de
«swap-and-match» (elegir qué intercambiar, anticipar la cascada) y un ritmo pausado de
decisión que no existe hoy, y entra en PUZZLE sin solaparse con Tetris.

Como con Snake (SPEC 10), `ciempies` y `ranaria`, **no hay código de referencia**: no existe
ninguna carpeta de match-3 en `References/`, solo la mención en `game-suggestions-todo.md`. Las
constantes de esta spec **son** el diseño del juego; cambiarlas durante la implementación es
rediseñar, no implementar. Igual que Snake y `ciempies`, el motor dibuja todo con primitivas de
canvas — no hay spritesheet que portar. Las seis gemas se distinguen por **forma y color**, no
solo por color, para que el juego sea legible sin depender del tono.

Esta variante es la lectura **mínima y reconocible** del género: sin gemas especiales, sin reloj,
sin obstáculos. Lo único que limita la partida es un contador de movimientos. La segunda variante
(`02-geodas-especiales.md`) cambia el límite de movimientos por un reloj y añade gemas
especiales (rayo, bomba, prisma); esta se queda deliberadamente en el conjunto más pequeño que ya
es un match-3 completo.

---

## Alcance

**Dentro:**

- `lib/games/match-cristal/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createMatchCristalGame`, sin assets externos: las gemas se dibujan con `Path2D`/primitivas.
- Mundo lógico de **560×620**: una franja superior de 60 px (`y 0..60`) con el contador de
  movimientos y la barra de progreso al siguiente nivel, y debajo el tablero de **8×8 celdas de
  70 px** (`y 60..620`).
- Seis tipos de gema, cada uno con forma y color propios.
- Intercambio de dos gemas **adyacentes en ortogonal**, solo válido si crea al menos una línea de
  3 o más; si no, la animación va y vuelve y no cuesta movimiento.
- Detección de líneas horizontales y verticales de 3 o más; las líneas que se cruzan (L, T, +)
  se limpian como unión de celdas.
- Caída por gravedad y relleno desde arriba con gemas aleatorias; las cascadas se resuelven hasta
  que el tablero queda estable.
- Presupuesto de movimientos, objetivos de nivel acumulados y movimientos extra al subir de nivel.
- Reorganización automática del tablero cuando no queda ningún movimiento válido.
- Pista visual tras 6 s sin jugar.
- Entrada por **puntero** (clic, toque y arrastre) y por **teclado** (cursor con flechas).
- Nueva ficha `match-cristal` en `lib/games.ts` (categoría `PUZZLE`) y clase de portada
  `cover-match-cristal` en `app/globals.css`.
- Una línea `match-cristal` en `GAME_ENGINES` (`lib/games/registry.ts`).
- Migración `insert into public.games (id, title) values ('match-cristal', 'MATCH CRISTAL')` y su
  aplicación.

**Fuera de alcance (para specs futuras o para la variante `02-geodas-especiales.md`):**

- Gemas especiales (rayo, bomba, prisma) y cualquier efecto de área.
- Reloj de partida.
- Obstáculos, casillas bloqueadas o gemas fijas.
- Sonido.
- Skins (`clasico`/`neon`/`retro`).
- Intercambios no adyacentes o en diagonal.
- Deshacer un movimiento.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla nueva, ni columna, ni tipo de plataforma.** `GameEngineEntry` ya
existe desde la SPEC 08, `scores` y `game_stats` sirven a este juego sin tocarlas, y el
leaderboard se enciende con una fila en `games`. La puntuación se guarda con la Server Action
`guardarScore` existente (que rellena `user_id` o `null` según la sesión, SPEC 15); el motor solo
llama a `onGameOver(score)`.

Tipos locales del motor, sin exportar:

```ts
type Gem = number; // 0..5 = tipo de gema; -1 = celda vacía (solo durante la resolución)
type Cell = { col: number; row: number }; // origen arriba-izquierda del tablero
type Phase = "idle" | "swap" | "swapback" | "clear" | "fall" | "shuffle" | "gameover";
type Anim = { elapsed: number; duration: number }; // ms
```

Estado en la clausura de `createMatchCristalGame`:

- `board: Gem[]` — array plano de `COLS * ROWS`, `índice = row * COLS + col`.
- `offsetY: number[]` — desplazamiento visual en px por celda (caída y relleno animados).
- `phase: Phase`, `anim: Anim`, `swapA: Cell | null`, `swapB: Cell | null`.
- `selected: Cell | null` (gema elegida), `cursor: Cell` y `cursorVisible: boolean`
  (cursor de teclado, oculto hasta que se pulsa una flecha).
- `dragStart: { cell: Cell; x: number; y: number } | null`.
- `clearing: boolean[]` — celdas marcadas para limpiar en la fase actual.
- `cascadeStep` (1 en la jugada, +1 por cada limpieza encadenada).
- `score`, `level`, `moves`, `levelMovesBonusGiven` (nivel hasta el que ya se dieron extras).
- `idleMs` (tiempo sin jugar, para la pista), `hintMove: [Cell, Cell] | null`, `bannerMs`.
- Bucle: `rafId`, `lastTime`, `destroyed`. Entrada: `pointerId`, `keys`.

**Grilla**, mundo lógico 560×620:

```
COLS 8 · ROWS 8 · CELL 70 px · HUD_H 60 px
FRANJA: y 0..60 — MOVS n · barra de progreso hacia el siguiente nivel
TABLERO: x 0..560 · y 60..620 — celda (col,row) en x = col*70, y = 60 + row*70
```

---

## Plan de implementación

### 1. Constantes y generación del tablero

`lib/games/match-cristal/engine.ts`, primera parte. Constantes de diseño:

```
W 560 · H 620 · HUD_H 60 · CELL 70 · COLS 8 · ROWS 8
GEM_TYPES 6
  0 círculo   cian     #00e5ff
  1 rombo     magenta  #ff2bd6
  2 triángulo amarillo #ffe600
  3 cuadrado  verde    #39ff14
  4 hexágono  naranja  #ff8a00
  5 estrella  violeta  #9b5cff
GEM_RADIUS 26 px (la forma cabe en un círculo de 26 px de radio dentro de la celda de 70)
MOVES_START 25 · MOVES_PER_LEVEL 10
POINTS_GEM 10 · BONUS_RUN_4 20 · BONUS_RUN_5 50
TARGET_CUM(level) = 400 * level * (level + 1) / 2     // 400, 1200, 2400, 4000, 6000…
  level = menor L tal que score < TARGET_CUM(L)
SWAP_MS 160 · CLEAR_MS 220 · FALL_MS_PER_CELL 70 · FALL_MS_MIN 120
HINT_IDLE_MS 6000 · BANNER_MS 1200 · DRAG_THRESHOLD 0.4 * CELL (28 px) · DT_MAX 50
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Funciones puras: `idx(col,row)`, `findRuns(board)` (devuelve las celdas marcadas y la lista de
runs con su longitud), `findValidMoves(board)` (todos los pares adyacentes cuyo intercambio crea
una línea), `hasMatch(board)`.

`newBoard()`: rellena cada celda con un tipo aleatorio evitando crear una línea de 3 al colocar
(se descarta el tipo que repetiría los dos anteriores a la izquierda o arriba). Si el resultado no
tiene ningún movimiento válido, se regenera (como máximo 100 intentos; el intento 101 aplica el
mismo algoritmo con una semilla de tipos reducida a 5 hasta lograrlo).

Comprobación: `npm run build` limpio con el motor aún sin registrar.

### 2. Intercambio, validación y limpieza

Reglas:

- Un intercambio solo se intenta con `phase === "idle"`. Pasa a `phase = "swap"` durante
  `SWAP_MS` y las dos gemas se interpolan linealmente a la posición de la otra.
- Al terminar, el motor aplica el intercambio al `board` y llama a `findRuns`:
  - **Sin runs:** `phase = "swapback"` durante `SWAP_MS`, el tablero vuelve al estado previo,
    **no** se resta movimiento y no se suma nada.
  - **Con runs:** `moves--`, `cascadeStep = 1`, `phase = "clear"`, y las celdas de las runs se
    marcan en `clearing`.
- Fase `clear` (`CLEAR_MS`): las gemas marcadas se encogen y se atenúan. Al terminar:
  - Puntos del paso = `(celdasLimpias * POINTS_GEM + Σ bonus de cada run) * cascadeStep`, con
    `bonus = BONUS_RUN_4` para una run de longitud 4 y `BONUS_RUN_5` para longitud ≥ 5 (las runs
    de 3 no dan bonus; una celda que pertenece a una run horizontal y a otra vertical cuenta una
    sola vez en `celdasLimpias` pero ambas runs dan su bonus).
  - Las celdas marcadas pasan a `-1` y `phase = "fall"`.
- Fase `fall`: cada columna se compacta hacia abajo; las gemas supervivientes parten desde su
  fila antigua y las nuevas desde por encima del tablero (`row < 0`), con tipo aleatorio uniforme
  entre los 6. Duración de la fase = `max(FALL_MS_MIN, FALL_MS_PER_CELL * mayorDistanciaDeCaída)`.
  Al terminar, `findRuns`: si hay runs, `cascadeStep++`, `phase = "clear"`; si no, el tablero
  está estable (paso 3).

Comprobación: `npm run build` limpio; con el motor arrancado a mano, un intercambio válido limpia,
cae y rellena; uno inválido va y vuelve sin gastar movimiento.

### 3. Estabilización, niveles y fin de partida

Cuando el tablero queda estable tras una jugada (`fall` sin runs nuevas):

1. **Nivel:** mientras `score >= TARGET_CUM(level)`, `level++` y `moves += MOVES_PER_LEVEL`
   (puede subir más de un nivel en una misma cascada gigante). `onLevel(level)` solo cuando el
   valor cambia.
2. **Fin de partida:** si `moves === 0`, `phase = "gameover"`, se detiene el bucle y se llama
   `onGameOver(score)` **una sola vez**. El orden importa: primero se evalúa el nivel y después los
   movimientos, de modo que una última jugada que alcanza el objetivo concede los movimientos
   extra antes de acabar.
3. **Sin movimientos:** si `findValidMoves(board)` está vacío, `phase = "shuffle"` y se muestra el
   rótulo `SIN MOVIMIENTOS` dentro del canvas durante `BANNER_MS`. La reorganización baraja las
   gemas existentes (mismo recuento por tipo) hasta que no haya runs y exista al menos un
   movimiento válido (máximo 50 barajados; si falla, `newBoard()` completo). No cuesta movimientos
   ni da puntos.
4. Si no se dio ninguna de las anteriores, `phase = "idle"`, `idleMs = 0`, `hintMove = null`.

Comprobación: `npm run build` limpio; forzando `moves = 1` a mano, la última jugada acaba la
partida solo cuando la cascada termina.

### 4. Entrada: puntero y teclado

Puntero (sobre el canvas, nunca sobre `window`):

- Se convierte la posición con `getBoundingClientRect()` y la escala `W / rect.width` (el CSS
  estira el canvas; la lógica trabaja en coordenadas del mundo). Fuera del tablero (`y < 60`) se
  ignora.
- `pointerdown` sobre una celda: `setPointerCapture`, guarda `dragStart`. Si no hay `selected`, la
  celda queda elegida; si hay `selected` y la celda es adyacente en ortogonal, intenta el
  intercambio; si hay `selected` y no es adyacente, la celda pasa a ser la elegida; si es la misma
  celda, se deselecciona.
- `pointermove` con `dragStart`: si el desplazamiento supera `DRAG_THRESHOLD` en un eje, intenta
  el intercambio de la celda inicial con su vecina en esa dirección (eje dominante) y descarta el
  arrastre.
- `pointerup` / `pointercancel` / `blur`: `dragStart = null`.
- Se ignora todo puntero secundario mientras haya uno activo (`pointerId`).
- `canvas.style.touchAction = "none"` para que arrastrar en móvil no haga scroll.

Teclado (con el canvas enfocado):

- Flechas y WASD mueven `cursor` dentro del tablero (sin envolver) y activan `cursorVisible`.
- `Space` o `Enter`: con `selected === null`, elige la celda del cursor; con `selected`, si es la
  misma se deselecciona; si el cursor está en una vecina adyacente, intercambia.
- Con `selected` activo, las flechas mueven el cursor igualmente; el intercambio se confirma con
  `Space`/`Enter` sobre la vecina (no hay «flecha = intercambio» para evitar jugadas por error).
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`, `KeyD`,
  `Space`, `Enter`. `preventDefault()` solo para esas. `P` y `Escape` no llegan al motor.
- Toda la entrada de juego se ignora si `phase !== "idle"` (el cursor sí puede moverse). Cualquier
  entrada válida reinicia `idleMs = 0` y borra `hintMove`.

Comprobación: `npm run build` limpio; se elige, deselecciona y se intercambia con ratón y con
teclado.

### 5. Dibujo, bucle y avisos

- `draw()`: fondo `#05060f`, grilla tenue de 8×8, gemas con su forma y color (un contorno claro de
  2 px y un brillo interior fijo para dar volumen), `selected` con un anillo blanco de 3 px, cursor
  de teclado con un cuadrado de 2 px punteado, pista como pulso de escala (`1 ± 0.12`, 600 ms) en
  las dos gemas de `hintMove`.
- Franja superior: `MOVS n` a la izquierda y, a la derecha, una barra de 220×10 px con el avance
  entre `TARGET_CUM(level - 1)` y `TARGET_CUM(level)`. **La puntuación y el nivel numéricos no se
  dibujan** (los pone el HUD de la plataforma). Los movimientos sí van en el canvas porque la
  plataforma no tiene campo para ellos.
- `emit()` con `lastScore` / `lastLevel`. `onLives(1)` una vez al iniciar (como Tetris y Snake).
- `onGameOver(score)` una sola vez; `resume()` es no-op después.
- `restart()`: detiene el bucle, `newBoard()`, `score = 0`, `level = 1`, `moves = MOVES_START`,
  limpia selección/cursor/pista, `emit()`, arranca.
- `dt` en ms capado a `DT_MAX`; `lastTime = null` al reanudar. Las animaciones avanzan con `dt`,
  de modo que pausar las congela donde estén.
- `destroy()` cancela el frame, quita los listeners (`pointerdown`, `pointermove`, `pointerup`,
  `pointercancel`, `keydown`, `blur`) y es idempotente.
- `initGame(); draw();` antes de devolver el motor.

Comprobación: `npm run build` limpio; pausar y reanudar en mitad de una cascada no salta frames.

### 6. Catálogo: nueva ficha `match-cristal`

`lib/games.ts`, nueva entrada en `GAMES`:

```ts
{
  id: "match-cristal",
  title: "MATCH CRISTAL",
  short: "Alinea tres gemas antes de quedarte sin movimientos.",
  long: "Un tablero de ocho por ocho gemas de seis formas y colores. Intercambia dos vecinas para alinear tres o más: caen las de arriba, llegan nuevas y las cascadas multiplican tus puntos. Cada movimiento cuenta, y solo superar el objetivo de nivel te regala diez más.",
  cat: "PUZZLE",
  cover: "cover-match-cristal",
  color: "magenta",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `.cover-match-cristal` nueva, patrón repetido de rombos/gemas con
gradientes cian-magenta-violeta, sin imagen externa, en el mismo patrón que las portadas
generadas existentes.

Comprobación: `/juegos/match-cristal` muestra la ficha en la biblioteca con su portada, antes de
registrar el motor (cae en `.game-arena` con `seededScores()`).

### 7. Registrar el motor

`lib/games/registry.ts`:

```ts
"match-cristal": {
  create: createMatchCristalGame,
  width: 560,
  height: 620,
  controls: "ratón o toque: elige una gema y su vecina, o arrastra; teclado: flechas para mover el cursor, espacio para elegir e intercambiar",
  touch: { a: { code: "Space", label: "ELEGIR" } },
},
```

La cruceta del mando táctil mueve el cursor y `ELEGIR` equivale a `Space`; el toque directo sobre
el canvas funciona sin el mando.

Comprobación: `/jugar/match-cristal` pinta el canvas real en vez de `.game-arena`.

### 8. Leaderboard

`supabase/migrations/<timestamp>_juego_match_cristal.sql`:

```sql
insert into public.games (id, title) values ('match-cristal', 'MATCH CRISTAL');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. Los tipos no se
regeneran: insertar una fila no cambia el esquema. El nombre del archivo lleva un timestamp
posterior a la última migración del repositorio.

Comprobación: `select * from public.games` incluye la fila `match-cristal`.

### 9. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido manual
de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/match-cristal` muestra un canvas de 560×620 con franja superior y tablero de 8×8,
      no la `.game-arena`.
- [ ] El tablero inicial no contiene ninguna línea de 3 y tiene al menos un movimiento válido.
- [ ] Las seis gemas se distinguen por forma además de por color.
- [ ] Un intercambio que crea una línea de 3 o más limpia las gemas, las de arriba caen y llegan
      nuevas desde arriba.
- [ ] Un intercambio que no crea línea va y vuelve y **no** descuenta movimiento.
- [ ] El contador `MOVS` empieza en 25 y baja en 1 solo con intercambios válidos.
- [ ] Una línea de 4 da +20 y una de 5 o más da +50 sobre los 10 puntos por gema.
- [ ] Las cascadas multiplican: el segundo paso encadenado vale ×2, el tercero ×3.
- [ ] Una figura en L o T limpia sus celdas una sola vez (sin doble puntuación de la celda común).
- [ ] Al alcanzar 400 puntos el HUD pasa a nivel 02 y el contador suma 10 movimientos.
- [ ] Una última jugada que alcanza el objetivo concede los movimientos extra y la partida sigue.
- [ ] Con 0 movimientos, el modal `FIN DEL JUEGO` aparece solo cuando la cascada ha terminado, con
      la puntuación real.
- [ ] Sin movimientos posibles, el tablero se reorganiza con el rótulo `SIN MOVIMIENTOS` y sin
      costar movimiento.
- [ ] Tras 6 s sin jugar, un par de gemas válido late como pista; cualquier entrada la apaga.
- [ ] Clic en una gema y luego en su vecina intercambia; clic en una no adyacente cambia la
      selección; clic en la misma la deselecciona.
- [ ] Arrastrar una gema más de 28 px hacia una vecina la intercambia sin segundo clic.
- [ ] En móvil, tocar y arrastrar sobre el canvas no hace scroll de la página.
- [ ] Con teclado: flechas mueven el cursor, `Space`/`Enter` eligen e intercambian, y el cursor
      no sale del tablero.
- [ ] Durante las animaciones (`swap`, `clear`, `fall`) los clics y `Space` no hacen nada.
- [ ] El HUD muestra 1 vida desde el inicio; el canvas no dibuja puntuación ni nivel numéricos
      ni overlays de game over.
- [ ] El botón `PAUSA` congela el juego, incluso a mitad de una cascada, y `REANUDAR` continúa sin
      saltos; `P` y `Escape` hacen lo mismo.
- [ ] Con el canvas enfocado, las flechas, `Space` y `Enter` no hacen scroll de la página.
- [ ] Escribir en el campo de iniciales del modal no mueve el cursor ni elige gemas.
- [ ] `JUGAR DE NUEVO` reinicia tablero, puntuación, nivel y movimientos sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'match-cristal'`, y
      pulsarlo dos veces seguidas no inserta dos filas.
- [ ] Esa puntuación aparece en `/salon?juego=match-cristal` y en `/juegos/match-cristal` sin
      recargar a mano; con `scores` vacía muestra el estado vacío.
- [ ] Navegar de `/jugar/match-cristal` a `/biblioteca` y volver no duplica el bucle ni los
      listeners.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid` y `/jugar/snake` se juegan igual que
      antes.
- [ ] `select * from public.games` incluye una fila `match-cristal` además de las existentes.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en
      `/jugar/match-cristal`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** mundo 560×620 con tablero de 8×8 y celdas de 70 px. Es el tamaño canónico del género y
  deja la celda lo bastante grande para tocarla con el dedo sin el mando.
- **Sí:** la franja superior de 60 px dentro del canvas con los movimientos. La plataforma solo
  tiene campos de puntos, vidas y nivel; los movimientos son estado propio del juego, como el
  rótulo `PULSA UNA FLECHA` de Snake.
- **No:** usar `onLives` para los movimientos. Mezclaría «vidas» con otro concepto en el HUD y
  rompería la expectativa del resto de juegos; `onLives(1)` queda fijo, como en Tetris y Snake.
- **Sí:** el intercambio inválido no cuesta movimiento. Penalizarlo castigaría el tanteo, que en
  un juego táctil es inevitable.
- **Sí:** distinguir las gemas por forma y color. Mejora la accesibilidad para daltonismo sin
  coste de motor.
- **Sí:** límite por movimientos y objetivos acumulados con +10 movimientos por nivel. La
  dificultad crece porque cada nivel pide más puntos que el anterior con el mismo margen de
  maniobra; no hace falta añadir tipos de gema ni obstáculos.
- **Sí:** el nivel se evalúa antes que el fin de partida en la última jugada. Evita la
  frustración de perder justo al cumplir el objetivo.
- **Sí:** relleno aleatorio sin evitar cascadas fortuitas. Son parte de la gracia del género y
  premian al azar de forma simétrica para todos los jugadores.
- **Sí:** reorganizar el tablero sin coste cuando no quedan movimientos. Terminar la partida por
  un tablero sin salida sería un fallo de diseño, no una derrota del jugador.
- **Sí:** pista tras 6 s. Es una ayuda que no cuesta puntos; la partida se rige por movimientos,
  no por tiempo, así que la ayuda no regala ventaja competitiva.
- **No:** intercambios diagonales ni deshacer. Cambian el cálculo de movimientos del género.
- **No:** gemas especiales, reloj ni obstáculos. Son la capa extra de `02-geodas-especiales.md`;
  incluirlos aquí duplicaría esa spec en vez de ofrecer una alternativa real.
- **No:** sonido ni skins. No hay assets de audio y las paletas son una capa independiente que se
  añade después con `skin-designer`.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Un tablero inicial o un reordenamiento sin ningún movimiento válido deja la partida atascada. | `newBoard()` y el barajado verifican `findValidMoves` y reintentan; hay un criterio de aceptación sobre el tablero inicial y otro sobre `SIN MOVIMIENTOS`. |
| Cascadas largas bloquean la entrada varios segundos y el jugador cree que el juego se colgó. | `FALL_MS_PER_CELL` y `CLEAR_MS` acotan cada paso; la entrada se ignora solo durante `swap/clear/fall`, y el cursor sigue moviéndose. |
| Doble conteo de las celdas comunes en L/T al puntuar. | El paso 2 define `celdasLimpias` como celdas únicas marcadas; el bonus se suma por run, no por celda. |
| El arrastre en móvil dispara el scroll de la página o un doble intercambio. | `touch-action: none`, un solo `pointerId` activo y `dragStart = null` tras el primer intercambio del arrastre. |
| Las coordenadas del puntero se desfasan porque el CSS estira el canvas. | La conversión usa `getBoundingClientRect()` y la escala `W / rect.width` en ambos ejes (precedente en el control por ratón de Arkanoid). |
| La pausa a mitad de animación deja el estado a medias o salta al reanudar. | Las animaciones avanzan con `dt` capado y `lastTime = null` al reanudar; la pausa no toca `phase`. |
| Portar «a ojo» sin código de referencia hace que las constantes se ajusten durante la implementación. | Los pasos 1 y 2 las fijan explícitamente y las declaran fuera de cambio, como hizo Snake (SPEC 10). |
| 25 movimientos y objetivos de 400 puntos pueden resultar demasiado fáciles o difíciles sin jugar. | Los números son el diseño; si el juego real los desmiente, se corrige en una spec posterior, no durante la implementación. |

---

## Lo que **no** entra en esta spec

- Gemas especiales (rayo, bomba, prisma) y efectos de área.
- Reloj de partida y bonus de tiempo.
- Obstáculos, casillas bloqueadas o niveles con tableros predefinidos.
- Sonido.
- Skins (`clasico`/`neon`/`retro`).
- Deshacer, intercambios diagonales o no adyacentes.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.
- Rate limiting, antitrampas y validación de la puntuación en servidor.

Cada una de ellas, si entra, va en su propia spec.
