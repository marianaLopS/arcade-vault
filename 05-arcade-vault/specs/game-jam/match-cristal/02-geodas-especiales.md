# SPEC — MATCH CRISTAL: geodas especiales contra reloj

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06, SPEC 11
> **Fecha:** 2026-10-14
> **Objetivo:** Diseñar `match-cristal` como un match-3 de ritmo rápido sobre un tablero de 9×9:
> sin límite de movimientos pero con un **reloj de 75 s** que solo corre mientras el jugador
> decide, que se recarga con cascadas y subidas de nivel, y con tres **gemas especiales** que
> nacen de líneas largas (rayo, bomba y prisma) y encadenan explosiones por el tablero.

---

## Por qué existe esta spec

La variante `01-clasico-movimientos.md` es la lectura mínima del género: un presupuesto de 25
movimientos y nada más. Su tensión es de planificación — cuánto vale cada jugada. Esta variante
cambia la tensión por completo: no se cuentan movimientos, se cuenta **tiempo**, y las jugadas
largas se premian con gemas especiales cuya activación en cadena es la fuente principal de
puntos. El jugador ya no decide «cuál es la mejor jugada», sino «cuál es la mejor jugada que
pueda ver antes de que se acabe el reloj».

Es un diseño distinto, no el mismo con otro contador: el reloj corre **solo en la fase de
espera** (`idle`), así que las cascadas y animaciones no gastan tiempo y las cascadas largas
**regalan** tiempo; las gemas especiales añaden un vocabulario nuevo (qué línea crea qué gema,
cómo se activa y cómo se encadenan) y el tablero crece a 9×9 para que haya sitio donde construirlas.

Como con Snake (SPEC 10), `ciempies` y la variante 01, **no hay código de referencia**: las
constantes de esta spec **son** el diseño; cambiarlas durante la implementación es rediseñar, no
implementar. El motor dibuja todo con primitivas de canvas, sin spritesheet. Las seis gemas
base se distinguen por forma y color (mismo catálogo que la variante 01) y las especiales
añaden una marca encima que no depende del color.

---

## Alcance

**Dentro:**

- `lib/games/match-cristal/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createMatchCristalGame`, sin assets externos.
- Mundo lógico de **558×618**: franja superior de 60 px (`y 0..60`) con el reloj y la barra de
  nivel, y debajo el tablero de **9×9 celdas de 62 px** (`y 60..618`).
- Seis tipos de gema base (idénticos a la variante 01: círculo, rombo, triángulo, cuadrado,
  hexágono, estrella).
- Tres gemas especiales que conservan el color de la gema que las originó:
  - **Rayo** (línea de 4 en recto): al activarse limpia su fila (si nació de una línea
    horizontal) o su columna (si nació de una vertical).
  - **Bomba** (figura en L, T o +): al activarse limpia el cuadrado de 3×3 a su alrededor.
  - **Prisma** (línea de 5 o más en recto): se activa **intercambiándola** con una gema vecina y
    limpia todas las gemas del tablero del color de esa vecina.
- Activación en cadena: una especial alcanzada por una explosión también se activa.
- Reloj de partida que solo corre en `idle`, con recarga por cascadas y por nivel.
- Reorganización automática si no queda ningún movimiento y pista tras 5 s sin jugar.
- Entrada por **puntero** (clic, toque y arrastre) y por **teclado** (cursor con flechas).
- Nueva ficha `match-cristal` en `lib/games.ts` (categoría `PUZZLE`) y clase de portada
  `cover-match-cristal` en `app/globals.css`.
- Una línea `match-cristal` en `GAME_ENGINES` (`lib/games/registry.ts`).
- Migración `insert into public.games (id, title) values ('match-cristal', 'MATCH CRISTAL')` y su
  aplicación.

**Fuera de alcance (para specs futuras o para la variante `01-clasico-movimientos.md`):**

- Límite de movimientos.
- Obstáculos, casillas bloqueadas, hielo o gemas fijas.
- Combinaciones especial + especial con efectos propios (se resuelven por la regla genérica del
  paso 3, sin animaciones nuevas).
- Sonido.
- Skins (`clasico`/`neon`/`retro`).
- Intercambios diagonales o deshacer.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla nueva, ni columna, ni tipo de plataforma.** `scores` y `game_stats`
sirven a este juego sin tocarlas y el leaderboard se enciende con una fila en `games`. La
puntuación se guarda con la Server Action `guardarScore` existente (que rellena `user_id` o
`null` según la sesión, SPEC 15); el motor solo llama a `onGameOver(score)`.

Tipos locales del motor, sin exportar:

```ts
type Special = 0 | 1 | 2 | 3 | 4; // 0 normal · 1 rayo-fila · 2 rayo-columna · 3 bomba · 4 prisma
type Gem = { t: number; s: Special }; // t = tipo 0..5; s = especial; t = -1 = vacío
type Cell = { col: number; row: number };
type Phase = "idle" | "swap" | "swapback" | "clear" | "fall" | "shuffle" | "gameover";
```

Estado en la clausura de `createMatchCristalGame`:

- `board: Gem[]` — array plano de `COLS * ROWS`, `índice = row * COLS + col`.
- `offsetY: number[]` — desplazamiento visual en px por celda para caída/relleno.
- `phase: Phase`, `phaseMs` (tiempo transcurrido en la fase), `swapA`, `swapB`.
- `selected`, `cursor`, `cursorVisible`, `dragStart` (igual que la variante 01).
- `clearing: boolean[]`, `spawnAt: { cell: Cell; gem: Gem }[]` (especiales que nacen al terminar
  la limpieza del paso actual), `cascadeStep`.
- `score`, `level`, `timeMs` (reloj restante), `idleMs`, `hintMove`, `bannerMs`.
- Bucle: `rafId`, `lastTime`, `destroyed`. Entrada: `pointerId`.

**Grilla**, mundo lógico 558×618:

```
COLS 9 · ROWS 9 · CELL 62 px · HUD_H 60 px
FRANJA: y 0..60 — barra de reloj (se vacía de derecha a izquierda) · barra de nivel
TABLERO: x 0..558 · y 60..618 — celda (col,row) en x = col*62, y = 60 + row*62
```

---

## Plan de implementación

### 1. Constantes y generación del tablero

Constantes de diseño:

```
W 558 · H 618 · HUD_H 60 · CELL 62 · COLS 9 · ROWS 9
GEM_TYPES 6  (cian círculo · magenta rombo · amarillo triángulo · verde cuadrado ·
              naranja hexágono · violeta estrella; mismos colores que la variante 01)
GEM_RADIUS 23 px
TIME_START_MS 75000 · TIME_MAX_MS 90000
TIME_PER_CASCADE_MS 1000   (por cada paso de cascada ≥ 2 en una misma jugada)
TIME_PER_LEVEL_MS 8000
POINTS_GEM 10 · BONUS_RUN_4 20 · BONUS_RUN_5 50 · BONUS_SHAPE 40 (L, T o +)
TARGET_CUM(level) = 1500 * level * (level + 1) / 2     // 1500, 4500, 9000, 15000…
  level = menor L tal que score < TARGET_CUM(L)
SWAP_MS 140 · CLEAR_MS 200 · FALL_MS_PER_CELL 60 · FALL_MS_MIN 110
HINT_IDLE_MS 5000 · BANNER_MS 1200 · DRAG_THRESHOLD 0.4 * CELL (25 px) · DT_MAX 50
LOW_TIME_MS 10000 (la barra de reloj pasa a rojo y late)
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

`newBoard()` igual que en la variante 01 (sin líneas de 3 iniciales, al menos un movimiento
válido), con 81 celdas y **sin especiales**. `findValidMoves` cuenta como válido, además de los
intercambios que crean línea, **cualquier intercambio que implique una gema prisma** (aunque no
haya línea).

Comprobación: `npm run build` limpio con el motor aún sin registrar.

### 2. Detección de líneas y nacimiento de especiales

`findRuns(board)` devuelve las runs horizontales y verticales de 3 o más (tipo de gema igual,
ignorando la marca de especial: una gema especial se empareja por su color). Para cada **grupo
conexo de runs** que comparten una celda se decide qué especial nace, en este orden de prioridad:

1. Run recta de longitud **≥ 5** → **prisma** (`s = 4`, `t` = color de la run).
2. Un cruce L/T/+ (una run horizontal y una vertical de ≥ 3 que comparten una celda) →
   **bomba** (`s = 3`).
3. Run recta de longitud **4** → **rayo**: `s = 1` (fila) si la run es horizontal, `s = 2`
   (columna) si es vertical.
4. Runs de 3 → no nace nada.

Celda donde nace la especial: la celda **destino de la gema que el jugador movió** si pertenece
al grupo; si no (cascada o relleno), la celda central de la run (en cruces, la celda de
intersección). Esa celda **no** se limpia: se queda en el tablero con la gema especial y el resto
de celdas del grupo se limpian. Una cascada puede generar especiales igual que una jugada.

Puntos del paso = `(celdasLimpias * POINTS_GEM + Σ bonus de cada grupo) * cascadeStep`, con
`BONUS_RUN_4`, `BONUS_RUN_5` o `BONUS_SHAPE` según el grupo (solo el de mayor prioridad por
grupo). Una celda compartida cuenta una sola vez en `celdasLimpias`.

Comprobación: `npm run build` limpio; una línea de 4, una de 5 y una L dejan respectivamente un
rayo, un prisma y una bomba en el tablero.

### 3. Activación de especiales y cadenas

Una gema especial se **activa** cuando:

- está dentro de una run que se limpia (rayo y bomba), o
- es alcanzada por el área de otra explosión (cualquier especial), o
- el jugador la intercambia con una vecina (solo prisma; un rayo o bomba intercambiados siguen
  la regla normal: el intercambio es válido solo si crea línea).

Efecto al activarse:

| Especial | Celdas que marca para limpiar |
| --- | --- |
| Rayo-fila | toda su fila |
| Rayo-columna | toda su columna |
| Bomba | el cuadrado de 3×3 centrado en ella (recortado al tablero) |
| Prisma (por intercambio) | la propia prisma + todas las gemas del color de la vecina intercambiada |
| Prisma (alcanzada por explosión) | la propia prisma + todas las gemas del color más frecuente en el tablero en ese momento |
| Prisma intercambiada con otra prisma | todo el tablero |

Las especiales marcadas por una explosión se activan en el mismo paso mediante una cola (BFS) con
un conjunto de «ya activadas» para no repetir ni entrar en bucle. Todas las celdas marcadas se
limpian en la misma fase `clear`. El paso de puntuación usa `POINTS_GEM` por cada celda marcada,
sin bonus extra por activación. Una especial que nace en este mismo paso (paso 2) no se activa
ni se limpia en él.

Un intercambio con prisma es válido siempre, **no** crea especiales nuevas por sí mismo y cuesta
tiempo igual que cualquier jugada (el reloj ya corrió en `idle`).

Comprobación: `npm run build` limpio; un rayo atrapado en una explosión se activa y limpia su
línea; una bomba junto a un rayo encadena ambos sin bucle infinito.

### 4. Intercambio, caída y estabilización

Misma máquina de fases que la variante 01 (`swap` → `swapback` o `clear` → `fall` → `clear` …)
con las duraciones del paso 1:

- Intercambio sin línea y sin prisma: `swapback`, sin penalización (no hay movimientos que
  contar; el reloj ya está parado durante la animación).
- Tras `clear`, `spawnAt` coloca las especiales nacidas, las celdas marcadas pasan a vacío y
  `fall` compacta cada columna y rellena desde arriba con gemas **normales** aleatorias (las
  especiales nunca aparecen por relleno).
- `cascadeStep` empieza en 1 y suma 1 por cada `fall` que produce nuevas runs. Cada paso con
  `cascadeStep >= 2` suma `TIME_PER_CASCADE_MS` al reloj, con tope `TIME_MAX_MS`.

Cuando el tablero queda estable:

1. **Nivel:** mientras `score >= TARGET_CUM(level)`, `level++` y `timeMs += TIME_PER_LEVEL_MS`
   (tope `TIME_MAX_MS`). `onLevel(level)` solo cuando cambia.
2. **Sin movimientos:** si `findValidMoves` está vacío, `phase = "shuffle"` con el rótulo
   `SIN MOVIMIENTOS` durante `BANNER_MS`; se baraja conservando los tipos **y las marcas de
   especial**, sin runs resultantes y con al menos un movimiento válido (máx. 50 intentos, luego
   `newBoard()` que sí descarta las especiales). No cuesta tiempo.
3. Si no, `phase = "idle"`, `idleMs = 0`, `hintMove = null`.

Comprobación: `npm run build` limpio; una cascada de 3 pasos suma 2 s al reloj.

### 5. Reloj y fin de partida

- `timeMs` solo disminuye con `phase === "idle"` y el juego sin pausar: `timeMs -= dt`.
- Cuando `timeMs <= 0` en `idle`: `timeMs = 0`, `phase = "gameover"`, se detiene el bucle y se
  llama `onGameOver(score)` **una sola vez**. Como el reloj solo corre en `idle`, nunca queda
  una cascada a medias al terminar.
- `LOW_TIME_MS`: la barra pasa a rojo y late a 4 Hz.
- `onLives(1)` una vez al iniciar; el reloj es estado propio del juego dibujado en la franja, no
  un campo del HUD.

Comprobación: `npm run build` limpio; dejar el tablero sin tocar 75 s abre `FIN DEL JUEGO`.

### 6. Entrada, dibujo y avisos

- **Puntero y teclado:** idénticos a la variante 01 (pasos 4 y 5 de esa spec), con
  `DRAG_THRESHOLD` de 25 px, `touch-action: none`, un solo `pointerId` activo, `GAME_KEYS`
  `ArrowUp`/`ArrowDown`/`ArrowLeft`/`ArrowRight`/`KeyW`/`KeyA`/`KeyS`/`KeyD`/`Space`/`Enter`.
  Las coordenadas se convierten con `getBoundingClientRect()` y la escala `W / rect.width`.
- Toda la entrada de juego se ignora si `phase !== "idle"`.
- `draw()`: fondo `#05060f`, grilla, gemas con forma y color; especiales con marca encima: rayo
  con una flecha doble (horizontal o vertical), bomba con un anillo punteado y prisma como una
  gema blanca irisada con un destello giratorio de 1 s. Selección, cursor y pista igual que en la
  variante 01. La franja dibuja la barra de reloj (558−32 px de ancho máximo) y la barra de nivel;
  **la puntuación y el nivel numéricos no se dibujan**.
- Rótulos dentro del canvas permitidos: `SIN MOVIMIENTOS` y un `+1s` flotante en la barra al ganar
  tiempo por cascada.
- `emit()` con `lastScore` / `lastLevel`. `restart()`: detiene el bucle, `newBoard()`, reinicia
  puntuación, nivel, `timeMs = TIME_START_MS`, selección y pista; `emit()` y arranca.
- `dt` capado a `DT_MAX`; `lastTime = null` al reanudar; pausa congela animaciones y reloj.
- `destroy()` cancela el frame, quita los listeners (`pointerdown`, `pointermove`, `pointerup`,
  `pointercancel`, `keydown`, `blur`) y es idempotente.
- `initGame(); draw();` antes de devolver el motor.

Comprobación: `npm run build` limpio; el reloj se congela con `PAUSA` y durante las cascadas.

### 7. Catálogo, registro y leaderboard

`lib/games.ts`:

```ts
{
  id: "match-cristal",
  title: "MATCH CRISTAL",
  short: "Alinea gemas contra reloj y detona geodas en cadena.",
  long: "Un tablero de nueve por nueve gemas y un reloj que solo corre mientras piensas. Las líneas de cuatro forjan rayos, las figuras en L son bombas y las de cinco, un prisma que arrasa un color entero. Encadena explosiones, gana segundos con cada cascada y llega lo más lejos posible.",
  cat: "PUZZLE",
  cover: "cover-match-cristal",
  color: "magenta",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `.cover-match-cristal` (patrón repetido de gemas cian-magenta-violeta,
sin imagen externa).

`lib/games/registry.ts`:

```ts
"match-cristal": {
  create: createMatchCristalGame,
  width: 558,
  height: 618,
  controls: "ratón o toque: elige una gema y su vecina, o arrastra; teclado: flechas para mover el cursor, espacio para elegir e intercambiar",
  touch: { a: { code: "Space", label: "ELEGIR" } },
},
```

`supabase/migrations/<timestamp>_juego_match_cristal.sql`:

```sql
insert into public.games (id, title) values ('match-cristal', 'MATCH CRISTAL');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`; los tipos no se
regeneran. El timestamp es posterior al de la última migración del repositorio.

Comprobación: `/jugar/match-cristal` pinta el canvas real; `select * from public.games` incluye
la fila `match-cristal`.

### 8. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido manual
de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/match-cristal` muestra un canvas de 558×618 con franja superior y tablero de 9×9,
      no la `.game-arena`.
- [ ] El tablero inicial no tiene líneas de 3, no tiene especiales y ofrece al menos un
      movimiento válido.
- [ ] El reloj empieza en 75 s y la barra se vacía solo mientras el tablero espera una jugada.
- [ ] Durante `swap`, `clear`, `fall` y `shuffle` el reloj no baja.
- [ ] Una línea de 4 deja un rayo (fila si era horizontal, columna si era vertical) en la celda
      de la gema movida.
- [ ] Una figura en L, T o + deja una bomba en la intersección o en la celda movida.
- [ ] Una línea de 5 o más deja un prisma.
- [ ] Una especial nacida en un paso no se activa en ese mismo paso.
- [ ] Un rayo incluido en una línea de 3 limpia toda su fila o columna.
- [ ] Una bomba incluida en una línea limpia el cuadrado de 3×3 a su alrededor, recortado en
      los bordes.
- [ ] Intercambiar un prisma con una gema vecina limpia todas las gemas de ese color, aunque no
      forme línea; intercambiar dos prismas limpia todo el tablero.
- [ ] Una explosión que alcanza otra especial la activa y la cadena termina sin bucle infinito.
- [ ] Las especiales conservan el color de origen y se distinguen por la marca, no solo por el
      color.
- [ ] El relleno nunca crea gemas especiales.
- [ ] Un intercambio que no crea línea (y sin prisma) va y vuelve y no resta tiempo.
- [ ] Cada paso de cascada ≥ 2 suma 1 s al reloj, con tope de 90 s.
- [ ] Al alcanzar 1500 puntos el HUD pasa a nivel 02 y el reloj suma 8 s.
- [ ] A menos de 10 s la barra de reloj se pone roja y late.
- [ ] Al llegar el reloj a 0 se abre el modal `FIN DEL JUEGO` con la puntuación real, y nunca a
      mitad de una cascada.
- [ ] Sin movimientos posibles, el tablero se reorganiza con el rótulo `SIN MOVIMIENTOS`,
      conservando las especiales, sin costar tiempo.
- [ ] Tras 5 s sin jugar un par válido late como pista; cualquier entrada la apaga.
- [ ] Clic en una gema y luego en su vecina intercambia; arrastrar más de 25 px la intercambia
      sin segundo clic; en móvil el arrastre no hace scroll.
- [ ] Con teclado: flechas mueven el cursor sin salir del tablero y `Space`/`Enter` eligen e
      intercambian.
- [ ] El HUD muestra 1 vida desde el inicio; el canvas no dibuja puntos, nivel numérico ni
      overlay de game over.
- [ ] `PAUSA` congela animaciones y reloj, incluso a mitad de una cascada, y `REANUDAR`
      continúa sin saltos; `P` y `Escape` hacen lo mismo.
- [ ] Con el canvas enfocado, las flechas, `Space` y `Enter` no hacen scroll de la página;
      escribir en el campo de iniciales no toca el juego.
- [ ] `JUGAR DE NUEVO` reinicia tablero, puntuación, nivel y reloj sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'match-cristal'`, sin
      duplicar con doble pulsación, y aparece en `/salon?juego=match-cristal` y en
      `/juegos/match-cristal`.
- [ ] Navegar de `/jugar/match-cristal` a `/biblioteca` y volver no duplica el bucle ni los
      listeners.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid` y `/jugar/snake` se juegan igual que
      antes.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en
      `/jugar/match-cristal`, y `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** reloj en lugar de movimientos. Es el cambio de ritmo que justifica esta variante frente
  a la 01: aquí se premia ver jugadas rápido, no planear la mejor.
- **Sí:** el reloj corre solo en `idle`. Castigar el tiempo de las animaciones penalizaría
  justamente las cascadas, que son lo más vistoso del género; así las cascadas largas regalan
  tiempo en vez de quitarlo.
- **Sí:** tablero de 9×9 con celdas de 62 px. Más espacio para construir especiales sin hacer la
  celda demasiado pequeña para el dedo.
- **Sí:** tres especiales (rayo, bomba, prisma) con la receta clásica del género (4 → rayo,
  L/T/+ → bomba, 5 → prisma). Es lo que el jugador de match-3 ya espera y no necesita tutorial.
- **Sí:** la especial conserva el color de origen y se empareja por ese color. Evita una gema
  «comodín» global que rompería la lectura del tablero.
- **Sí:** el prisma se activa por intercambio con cualquier vecina y es siempre válido. Se
  compensa porque cuesta construirlo (línea de 5) y consume una jugada.
- **Sí:** el prisma alcanzado por una explosión limpia el color más frecuente. Mantiene la cadena
  determinista sin pedir una elección al jugador.
- **Sí:** las especiales nunca nacen por relleno. Son un premio por jugar bien, no una lotería.
- **Sí:** sin bonus por activar especiales; el valor sale de las celdas que limpian. Mantiene la
  fórmula de puntuación igual que en la variante 01 y fácil de verificar.
- **No:** combinaciones especial + especial con efectos propios. Multiplican los casos de prueba y
  de animación; la regla genérica ya produce explosiones espectaculares.
- **No:** límite de movimientos, obstáculos ni sonido. Los movimientos son la identidad de la
  variante 01; los obstáculos serían otra spec con su propio diseño de niveles.
- **No:** skins. Capa independiente que se añade con `skin-designer` tras elegir variante.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Las cadenas de especiales entran en bucle o activan la misma especial dos veces. | El paso 3 usa una cola con conjunto de «ya activadas»; hay un criterio de aceptación sobre bomba + rayo en cadena. |
| Sin límite de movimientos, un jugador hábil puede estirar el reloj con cascadas sin acabar nunca. | `TIME_MAX_MS` 90 s acota la ganancia, el reloj sigue corriendo en `idle` y los objetivos de nivel crecen cuadráticamente. |
| El nacimiento de la especial en una cascada (sin celda movida) cae en una celda ambigua. | El paso 2 fija la regla: celda central de la run, o la intersección en cruces. |
| Una especial recién nacida se activa en el mismo paso y desaparece antes de verse. | El paso 3 la excluye de la activación y de la limpieza del paso en el que nace. |
| El barajado sin movimientos rompe o pierde las especiales del tablero. | El barajado conserva tipo y marca; si tras 50 intentos falla, `newBoard()` sustituye el tablero entero. |
| El prisma intercambiado con una especial vecina produce un resultado confuso para el jugador. | Se define por el color de la vecina (paso 3); cualquier excepción queda fuera de la spec y se añade en otra. |
| Un tablero de 9×9 con cascadas grandes baja los fps en móvil por reasignar objetos. | Los arrays de `board`, `offsetY` y `clearing` se reutilizan; ninguna asignación dentro de `draw()` (SPEC 13). |
| Las coordenadas del puntero se desfasan porque el CSS estira el canvas. | Conversión con `getBoundingClientRect()` y la escala `W / rect.width` (precedente en Arkanoid). |
| Portar «a ojo» sin código de referencia hace que las constantes se ajusten durante la implementación. | Los pasos 1–5 las fijan y las declaran fuera de cambio, como hizo Snake (SPEC 10). |

---

## Lo que **no** entra en esta spec

- Límite de movimientos.
- Obstáculos, hielo, casillas bloqueadas o niveles predefinidos.
- Efectos propios para combinaciones especial + especial.
- Sonido.
- Skins (`clasico`/`neon`/`retro`).
- Deshacer, intercambios diagonales o no adyacentes.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.
- Rate limiting, antitrampas y validación de la puntuación en servidor.

Cada una de ellas, si entra, va en su propia spec.
