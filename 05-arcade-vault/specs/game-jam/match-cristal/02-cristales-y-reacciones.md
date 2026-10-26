# SPEC — MATCH CRISTAL: cristales y reacciones

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-07
> **Objetivo:** Diseñar `match-cristal` como una contrarreloj de 60 segundos con cristales
> especiales (rayado, bomba y prisma) que nacen de líneas largas y figuras, reacciones en cadena
> entre especiales y un multiplicador de combo que caduca, para una partida corta, explosiva y
> de alta varianza de puntuación.

---

## Por qué existe esta spec

Segunda variante de diseño para `match-cristal`, junto a
`specs/game-jam/match-cristal/01-clasico-por-movimientos.md`. Comparte con ella el género, el
mundo lógico de 576×640, la grilla de 8×8 celdas de 64 px, los seis cristales distinguibles por
forma, el intercambio de vecinos, la gravedad con relleno aleatorio, los controles y el contrato
`GameEngine`. Nada de eso cambia entre variantes.

Lo que cambia es el eje: la variante 01 es lenta y de planificación (20 movimientos, meta de
puntos, sin especiales); esta es **rápida y de aprovechar el caos**. No hay límite de
movimientos, hay un reloj de 60 s que solo se alarga con jugadas buenas, y las líneas de 4 o 5
y las figuras en L/T/cruz dejan cristales especiales que, al detonarse, limpian filas, columnas,
áreas o todo un color. Los especiales que detonan a otros especiales provocan reacciones en
cadena, que es donde nace la puntuación alta.

Como Snake (SPEC 10) y la variante 01, no hay código de referencia: las constantes de este
documento son el diseño, no un ajuste posterior.

---

## Alcance

**Dentro:**

- `lib/games/match-cristal/engine.ts`: **el mismo motor y el mismo archivo** que la variante 01
  implementaría. Esta spec describe una implementación alternativa completa, no un parche. Si
  se promueve esta variante en vez de la 01, es este documento el que gobierna el archivo.
- Mismo mundo lógico: 576×640, tablero de 8×8 en `x 32..544`, `y 96..608`; la franja
  superior de 96 px muestra el reloj y el combo en lugar de movimientos y meta.
- Mismo intercambio, mismas cascadas, mismos seis cristales y mismos controles de ratón,
  táctil y teclado.
- **Reloj:** 60 s al empezar, tope de 99 s. Solo baja con el tiempo; las jugadas buenas lo
  suben.
- **Tres cristales especiales:**
  - **Rayado** (línea de 4): al detonar borra su fila o su columna entera.
  - **Bomba** (L, T o cruz): al detonar borra el área de 3×3 a su alrededor.
  - **Prisma** (línea de 5 o más): al intercambiarlo con un cristal normal borra todos los
    cristales de ese color.
- **Reacciones en cadena:** un especial alcanzado por el efecto de otro se detona también.
- **Combo:** multiplicador ×1..×5 que sube con jugadas consecutivas dentro de una ventana de
  3 s y se reinicia si caduca.
- **Nivel:** `1 + floor(score / 3000)`. Sube la dificultad con un séptimo cristal desde el
  nivel 4 y un bonus de tiempo por especial que se reduce con el nivel.
- **Pista** de un movimiento posible tras 5 s sin input.
- Entrada por ratón/táctil y por teclado, igual que la variante 01.
- Nueva ficha `match-cristal` en `lib/games.ts` (categoría `PUZZLE`), clase `cover-cristal`
  en `app/globals.css` y entrada en `GAME_ENGINES`, idénticas a las de la variante 01 salvo
  el copy y `controls`.
- Migración `insert into public.games (id, title) values ('match-cristal', 'MATCH CRISTAL')`
  y su aplicación.

**Fuera de alcance (para specs futuras o si se prefiere la variante 01):**

- Movimientos limitados y metas de puntos por nivel (variante 01).
- Combinar dos especiales por intercambio directo (rayado+bomba, bomba+bomba…): solo el
  prisma tiene efecto al intercambiarse; los demás se detonan al formar parte de una línea o
  por una cadena.
- Obstáculos de tablero.
- Sonido.
- Skins.
- Mando táctil de plataforma: el juego se controla tocando el propio canvas.
- Autenticación, `scores.user_id` desde el motor y la fila `▸ TU MEJOR MARCA` real: los pone la
  plataforma (SPEC 14/15).

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni clave de `localStorage`.** `scores` y `game_stats`
sirven a este juego sin tocarlas; el leaderboard se enciende con una fila en `games`.

Tipos locales del motor, sin exportar:

```ts
type Gem = 0 | 1 | 2 | 3 | 4 | 5 | 6;           // 6 solo existe desde el nivel 4
type Special = "none" | "stripeH" | "stripeV" | "bomb" | "prism";
type Cell = { gem: Gem | null; special: Special; yOff: number }; // prism ignora `gem`
type Phase = "idle" | "swap" | "swapBack" | "clear" | "fall" | "shuffle" | "gameover";
type Pos = { c: number; r: number };
```

Estado en la clausura:

- `board: Cell[][]`, `phase: Phase`, `phaseT` (ms en la fase actual).
- `swapA`, `swapB`, `selected`, `cursor` (como en la variante 01).
- `timeLeft` (ms), `comboMult` (1..5), `comboT` (ms restantes de la ventana), `chain` (nº de
  pasos de cascada del movimiento actual), `idleT` (ms sin input, para la pista).
- `score`, `level`, `hint: [Pos, Pos] | null`, `popups`, `flashes` (decorado de detonaciones).
- `clearing: Pos[]`, `pending: { pos: Pos; special: Special; gem: Gem }[]` (especiales que
  nacen al terminar la fase `clear`).
- Bucle: `rafId`, `lastTime`, `destroyed`. Entrada: `dragStart`.

---

## Plan de implementación

### 1. Constantes de diseño

`lib/games/match-cristal/engine.ts`:

```
W 576 · H 640 · COLS 8 · ROWS 8 · CELL 64 · BOARD_X 32 · BOARD_Y 96
GEM_COUNT(level) = level >= 4 ? 7 : 6
TIME_START 60000 ms · TIME_MAX 99000 ms · DT_MAX 50 ms
SWAP_MS 150 · SWAP_BACK_MS 150 · CLEAR_MS 200 · FALL_SPEED 800 px/s · SHUFFLE_MS 500
DRAG_MIN 24 px
RUN_POINTS: 3 → 20 · 4 → 60 · 5 → 120 · n ≥ 6 → 120 + 80 * (n - 5)
SPECIAL_CELL_POINTS 15 por cada cristal borrado por un efecto especial
PRISM_SWAP_BONUS 100 (fijo, al detonar un prisma por intercambio)
COMBO_WINDOW 3000 ms · COMBO_MAX 5
  cada jugada que puntúa dentro de la ventana: comboMult = min(5, comboMult + 1); la ventana se renueva
  si la ventana caduca: comboMult = 1
TIME_BONUS: línea de 4 → +2 s · línea de 5+ → +4 s · detonar un especial → +1 s · subir de nivel → +5 s
  bonus real = round(TIME_BONUS * max(0.5, 1 - 0.1 * (level - 1)))
LEVEL(score) = 1 + floor(score / 3000)
HINT_DELAY 5000 ms
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Paleta y formas: las seis de la variante 01 (cian rombo, magenta círculo, amarillo triángulo,
verde cuadrado redondeado, naranja hexágono, violeta estrella) y, desde el nivel 4, el séptimo
`6` blanco `#e8f0ff` en forma de gota. Los especiales se dibujan sobre el cristal: **rayado**
con dos franjas paralelas (horizontales para `stripeH`, verticales para `stripeV`), **bomba**
con un halo y un núcleo brillante, **prisma** como un cristal blanco irisado con borde
cambiante (no depende de ningún color).

Comprobación: `npm run build` limpio.

### 2. Motor: tablero, líneas y nacimiento de especiales

- Generación inicial y `findRuns()` como en la variante 01 (sin líneas al empezar, con al
  menos un movimiento válido), con `GEM_COUNT(level)` valores.
- **Nacimiento al borrar una línea:**
  - línea de **4** → rayado en la celda movida si participó en el intercambio, y si no (cascada)
    en la celda `index = floor((len - 1) / 2)` de la línea. Orientación: una línea horizontal
    deja `stripeV` (borra una columna) y una vertical `stripeH` (borra una fila).
  - **L, T o cruz** (una línea horizontal y una vertical que comparten una celda) → bomba en
    la celda compartida.
  - línea de **5 o más** → prisma en la misma celda que la regla del rayado.
  - Si una celda cumple varias reglas, gana: prisma > bomba > rayado.
  - El especial nace al **final** de la fase `clear` (no se borra a sí mismo) y conserva el
    `gem` de la línea que lo creó, que es su color para el prisma y para dibujarlo.
- **Un especial que forma parte de una línea de 3+** de su color se borra y **se detona**
  según su tipo, sumando su área a las celdas de `clearing` (ver paso 3).
- **Movimiento válido:** a) el intercambio genera una línea de 3+; o b) uno de los dos
  cristales es un prisma. Intercambiar dos especiales que no son prisma sin formar línea es
  inválido, como cualquier otro intercambio sin línea.

Comprobación: `npm run build` limpio.

### 3. Motor: detonaciones, cadenas y fases

Fases como en la variante 01 (`idle` → `swap` → `clear` → `fall` → …), con estas diferencias:

- **Prisma por intercambio:** al intercambiar un prisma con un cristal normal de color `g`, el
  prisma se borra, se borran **todos** los cristales de color `g` (y los especiales de ese
  color se detonan), y puntúa `PRISM_SWAP_BONUS + SPECIAL_CELL_POINTS * n`. Intercambiar un
  prisma con otro prisma borra **todo el tablero** (`PRISM_SWAP_BONUS + SPECIAL_CELL_POINTS *
  64`).
- **Detonación:** efecto por tipo al entrar un especial en `clearing`:
  - `stripeH` → toda su fila · `stripeV` → toda su columna · `bomb` → 3×3 centrado en él ·
    `prism` (detonado por línea o cadena, no por intercambio) → todos los cristales del color
    `gem` con el que se creó.
  - Cada celda añadida por un efecto puntúa `SPECIAL_CELL_POINTS`.
- **Cadena:** las celdas añadidas se procesan en una cola (BFS). Un especial alcanzado se
  detona **una sola vez** (`detonated: Set<number>` por fase `clear`). La cola está acotada
  por las 64 celdas del tablero, así que termina siempre.
- **Puntuación y combo:** al empezar cada fase `clear` se suma
  `(Σ RUN_POINTS de líneas + SPECIAL_CELL_POINTS × celdas de efecto) × comboMult`. El
  `comboMult` se evalúa **una vez por movimiento del jugador**, no por paso de cascada: la
  primera fase `clear` tras un intercambio sube el combo (ventana de 3 s); las fases de
  cascada posteriores usan el mismo `comboMult` y añaden `chain` como bonus plano
  `+10 * chain` por paso. Así el combo premia jugar rápido, no la suerte del relleno.
- **Tiempo:** `TIME_BONUS` se suma al reloj al empezar la fase `clear` que lo causa (4, 5+,
  detonación), con tope `TIME_MAX`.
- **Fin:** el reloj baja solo en fase `idle` y en `swap`/`swapBack`; **se congela durante
  `clear`, `fall` y `shuffle`**, para que las cascadas largas no cuesten tiempo. Al llegar a 0
  durante `idle` se pasa a `gameover`; si llega a 0 durante `swap` o `swapBack`, se termina
  de resolver el movimiento en curso (incluidas cascadas) y entonces `gameover`. El jugador
  siempre cobra el movimiento que ya hizo.
- **Nivel:** `LEVEL(score)` se recalcula tras puntuar; si sube, `+TIME_BONUS` de nivel,
  `onLevel` y desde el nivel 4 los gems nuevos ya pueden ser del séptimo color.
- **Sin movimientos:** tablero estabilizado y `!hasMoves()` → `shuffle` (como la variante 01,
  con un prisma o especial presente cuenta como movimiento válido).
- `gameover`: `stopLoop()` y `onGameOver(score)` **una sola vez**.

Comprobación: `npm run build` limpio.

### 4. Motor: entrada y pista

Igual que la variante 01 (Pointer Events con conversión de coordenadas, arrastre ≥ 24 px,
toque-toque, cursor de teclado con `Space`/`Enter`, listeners en el canvas, no en `window`),
con estas diferencias:

- `idleT` se pone a 0 con cualquier input válido y sube con `dt` solo en `idle`. Al superar
  `HINT_DELAY`, `hint` toma el primer movimiento válido hallado y se pinta con un brillo
  pulsante sobre las dos celdas; cualquier input o cambio de fase borra `hint`.
- Los especiales se pueden seleccionar y arrastrar como cualquier cristal.

Comprobación: `npm run build` limpio.

### 5. Motor: dibujo, avisos y ciclo de vida

- `emit()` con `lastScore` / `lastLevel`; `onScore` y `onLevel` solo si el valor cambia.
  `onLives(1)` una vez.
- `draw()`: fondo `#0a0a18`; franja superior con una barra de **reloj** (ancho proporcional a
  `timeLeft / TIME_MAX`, roja bajo 10 s con parpadeo) y el multiplicador `×N` con su barra de
  ventana de combo. El reloj y el combo son estado propio del juego; la puntuación, el nivel y
  las vidas **no** se dibujan en el canvas. Los efectos de detonación (rayos de fila/columna,
  anillo de bomba, destello de prisma) duran ≤ 300 ms y son decorado sin estado de juego.
- Rótulos permitidos: `¡TIEMPO!` al llegar el reloj a 0 mientras se resuelve el último
  movimiento y `SIN MOVIMIENTOS · BARAJANDO` en `shuffle`. Ningún overlay de game over.
- `resume()` es no-op tras `gameover`; `restart()` reinicia reloj, combo, nivel y tablero;
  `destroy()` cancela el frame, quita listeners y suelta el pointer capture, idempotente.
- `dt` capado a `DT_MAX`; `lastTime = null` al reanudar, de modo que la pausa **no** consume
  reloj ni ventana de combo.
- `initGame(); draw();` antes de devolver.

Comprobación: `npm run build` limpio.

### 6. Catálogo: nueva ficha `match-cristal`

`lib/games.ts`, nueva entrada en `GAMES` (mismo `id`, `cat` y `cover` que la variante 01; copy
propio de esta variante):

```ts
{
  id: "match-cristal",
  title: "MATCH CRISTAL",
  short: "Sesenta segundos, cristales explosivos y combos al límite.",
  long: "Un minuto de reloj y una cámara de cristales. Las líneas largas dejan cristales especiales: rayos que limpian filas, bombas de área y prismas que borran un color entero. Encadénalos, mantén el combo y exprime cada segundo.",
  cat: "PUZZLE",
  cover: "cover-cristal",
  color: "cyan",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `.cover-cristal` nueva (compartida con la variante 01 si se
implementan ambas; misma portada, distinto motor por debajo).

Comprobación: `/juegos/match-cristal` muestra la ficha en la biblioteca con su portada, antes
de que el motor esté registrado.

### 7. Registrar el motor

`lib/games/registry.ts`:

```ts
"match-cristal": {
  create: createMatchCristalGame,
  width: 576,
  height: 640,
  controls: "ratón o toque para arrastrar un cristal a su vecino, o flechas y espacio para elegir y mover; forma líneas largas para crear especiales",
  touch: {},
},
```

Comprobación: `/jugar/match-cristal` pinta el canvas real en vez de `.game-arena`.

### 8. Leaderboard

`supabase/migrations/<timestamp>_juego_match_cristal.sql`, con timestamp posterior a
`20260927130000`:

```sql
insert into public.games (id, title) values ('match-cristal', 'MATCH CRISTAL');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. Los tipos no se
regeneran. El `CHECK` de `scores.score` es de 0..1.000.000; la puntuación máxima de esta
variante se acota en el riesgo correspondiente.

Comprobación: `select * from public.games` incluye la fila `match-cristal`.

### 9. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido
manual de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/match-cristal` muestra un canvas de 576×640 con tablero de 8×8 y barra de reloj.
- [ ] El reloj empieza en 60 s, baja en tiempo real y no pasa de 99 s.
- [ ] El reloj se congela durante `clear`, `fall` y `shuffle` y con la pausa.
- [ ] Una línea de 3 suma 20 en la primera jugada; de 4 suma 60; de 5 suma 120 (con ×1).
- [ ] Una línea de 4 deja un rayado: horizontal → rayado vertical, vertical → rayado horizontal.
- [ ] Una L, T o cruz deja una bomba en la celda compartida.
- [ ] Una línea de 5 o más deja un prisma; si una celda cumple varias reglas, gana el prisma.
- [ ] Un rayado detonado borra su fila o su columna entera; una bomba, el área de 3×3.
- [ ] Intercambiar un prisma con un cristal normal borra todos los cristales de ese color y
      puntúa `100 + 15 × n`.
- [ ] Intercambiar dos prismas borra todo el tablero.
- [ ] Un especial alcanzado por el efecto de otro se detona y nunca dos veces en la misma fase.
- [ ] Una cadena de especiales siempre termina (sin bucles) y el tablero queda consistente.
- [ ] Una línea de 4 suma +2 s, una de 5 suma +4 s y detonar un especial suma +1 s al reloj.
- [ ] El multiplicador sube a ×2 con una segunda jugada dentro de 3 s y vuelve a ×1 si
      transcurren 3 s sin puntuar; nunca supera ×5.
- [ ] Las cascadas posteriores a un intercambio no suben el combo; suman `+10 × paso`.
- [ ] El HUD pasa a nivel 02 a los 3000 puntos y suma +5 s al reloj.
- [ ] Desde el nivel 4 aparece un séptimo cristal (gota blanca) distinguible por forma.
- [ ] El bonus de tiempo disminuye con el nivel y nunca baja del 50 %.
- [ ] Tras 5 s sin input aparece el brillo de pista sobre un movimiento válido y desaparece
      al mover.
- [ ] Con el reloj en 0 durante `idle` se abre `FIN DEL JUEGO` con la puntuación real.
- [ ] Con el reloj en 0 a mitad de una cascada se termina de resolver y se cobra antes del modal.
- [ ] Un intercambio sin línea y sin prisma se anima de ida y vuelta y no puntúa.
- [ ] Un tablero sin movimientos posibles se baraja solo, con el reloj congelado.
- [ ] El canvas muestra reloj y combo, pero no puntuación total, nivel, vidas ni overlay de
      game over.
- [ ] El HUD muestra 1 vida desde el inicio.
- [ ] `PAUSA`, `REANUDAR`, `P` y `Escape` congelan y reanudan sin consumir reloj ni combo.
- [ ] Con el canvas enfocado, las flechas y el espacio no hacen scroll de la página.
- [ ] Escribir `W`, `A`, `S`, `D` o espacio en el campo de iniciales no mueve ni reinicia el juego.
- [ ] En móvil, tocar y arrastrar sobre el canvas funciona con el canvas escalado por CSS.
- [ ] `JUGAR DE NUEVO` reinicia reloj a 60 s, nivel 1, 0 puntos y combo ×1 sin recargar.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'match-cristal'` y una
      puntuación dentro de 0..1.000.000.
- [ ] Esa puntuación aparece en `/salon?juego=match-cristal` y en `/juegos/match-cristal` sin
      recargar a mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Con `scores` vacía para este juego, `/salon?juego=match-cristal` muestra el estado vacío.
- [ ] Navegar de `/jugar/match-cristal` a `/biblioteca` y volver no duplica el bucle.
- [ ] Dejar la pestaña en segundo plano y volver no consume reloj ni resuelve cascadas de golpe.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid` y `/jugar/snake` se juegan igual que antes.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/match-cristal`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** mismo `id` `match-cristal` que la variante 01; son alternativas, no juegos distintos.
  Solo una entra en el catálogo.
- **Sí:** reloj en vez de movimientos. Es la diferencia de ritmo que justifica una segunda
  variante.
- **Sí:** congelar el reloj durante cascadas. Penalizar la animación sería castigar el éxito.
- **Sí:** terminar de resolver un movimiento ya iniciado aunque el reloj llegue a 0.
- **Sí:** tres especiales con reglas de creación disjuntas (4 → rayado, forma → bomba,
  5 → prisma). Cada uno tiene un efecto reconocible y un coste de creación proporcional.
- **Sí:** solo el prisma actúa al intercambiarse; los demás se detonan al formar línea o por
  cadena. Evita una matriz de combinaciones de 3×3 especiales por intercambio.
- **Sí:** combo por movimiento del jugador, no por paso de cascada. Premia la rapidez de
  decisión, no el azar del relleno.
- **Sí:** `LEVEL(score)` por puntuación, no por tiempo. Un jugador mejor sube más de nivel y
  recibe un séptimo cristal que le dificulta las líneas, en vez de un reloj más corto.
- **Sí:** pista tras 5 s. En un juego con reloj, quedarse atascado es la peor experiencia.
- **Sí:** el bonus de tiempo decrece hasta el 50 %. Evita partidas infinitas de un jugador
  muy hábil.
- **Sí:** sin imágenes; todo con rutas de canvas.
- **No:** combinar especiales por intercambio directo. Otra spec si llega.
- **No:** movimientos limitados. Es la variante 01.
- **No:** sonido ni skins.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo                                                                                       | Mitigación                                                                                                   |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Una cadena de especiales entra en bucle o detona un especial dos veces.                      | BFS con `detonated: Set` por fase `clear`; la cola está acotada por las 64 celdas.                           |
| Reloj + bonus de tiempo hacen la partida infinita.                                           | Tope `TIME_MAX` 99 s y bonus decreciente hasta el 50 % por nivel.                                            |
| La puntuación se dispara por combos y prismas y supera el `CHECK` de 1.000.000.              | Techo ×5 de combo; el reloj acota la partida; se verifica una partida larga y, si se roza, se acota en una spec posterior (`Math.min(score, 1_000_000)` en el emit). |
| El especial recién nacido se borra en la misma fase en que se crea.                          | Nace al final de la fase `clear`, tras resolver `clearing`.                                                  |
| Cascadas largas inflan la duración percibida y el jugador siente que «pierde tiempo».        | Reloj congelado durante `clear`, `fall` y `shuffle`.                                                         |
| El reloj llega a 0 a mitad de movimiento y el jugador pierde puntos ya ganados.              | Se termina de resolver el movimiento en curso antes de `gameover`.                                           |
| La pausa o la pestaña en segundo plano consumen reloj o ventana de combo.                    | `dt` capado a 50 ms y `lastTime = null` al reanudar; el reloj y el combo avanzan solo con `dt`.              |
| El prisma por intercambio rompe la regla de «solo intercambio con línea» y sale de `hasMoves()`. | `hasMoves()` cuenta cualquier prisma adyacente a un cristal como movimiento válido.                      |
| El séptimo cristal confunde por color con el blanco del prisma.                              | El prisma es irisado y de borde cambiante; la gota blanca es plana y de forma distinta.                      |
| El canvas escalado por CSS desplaza la celda elegida con el dedo.                            | Conversión `(cliente - rect) * (W / rect.width)` y criterio de aceptación en móvil.                          |
| WASD y espacio llegan al motor mientras se escriben iniciales.                               | Bucle parado con el modal abierto y listeners en el canvas, no en `window`.                                  |

---

## Lo que **no** entra en esta spec

- Movimientos limitados y metas de puntos (variante 01).
- Combinar dos especiales no-prisma por intercambio directo.
- Obstáculos de tablero y objetivos de nivel.
- Sonido.
- Skins.
- Mando táctil de plataforma.
- Varias vidas.
- Tabla de puntuaciones por modo o por variante: solo una variante entra en el catálogo.
- Autenticación, `scores.user_id` desde el motor y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
