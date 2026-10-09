# SPEC — SALTO SIMIO: variante «torre ardiente» con lava, martillos y fuego

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-09
> **Objetivo:** Diseñar `salto-simio` como una escalada contra el reloj físico de una lava que sube, sobre una torre de plataformas planas con huecos que hay que saltar, con martillos temporales para romper barriles y bolas de fuego que persiguen al héroe.

---

## Por qué existe esta spec

Es la segunda variante de `salto-simio`, el plataformas que sale del tema «donkey-kong» de
`References/resources/resources/game-suggestions-todo.md`, junto a
`specs/game-jam/salto-simio/01-clasico-vigas.md`. Comparte con ella el género, el mundo lógico
de 800×600, el héroe (misma caja, mismas constantes de salto, carrera y escalera), la cadena de
barriles que nace en la cima y los controles. Cambia el eje del diseño:

- **El nivel:** en vez de vigas inclinadas continuas, aquí hay una torre de seis niveles de
  plataformas **planas y con huecos** de 60 px. Saltar huecos es una habilidad nueva que la
  variante 01 no pide (allí el salto solo sirve para esquivar barriles).
- **La presión:** no hay bono de tiempo; sube una **lava** desde el fondo a velocidad creciente.
  Quedarse parado cuesta la partida, esperar un barril es un riesgo.
- **El contraataque:** dos **martillos** por pantalla dan 8 s de invulnerabilidad ofensiva.
- **Un enemigo nuevo:** la **bola de fuego**, que persigue al héroe por plataformas y escaleras
  desde el nivel 2.

Como Snake (SPEC 10), `ranaria` y la variante 01, no hay código de referencia: las constantes de
este documento **son** el diseño.

---

## Alcance

**Dentro:**

- `lib/games/salto-simio/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createSaltoSimioGame`. Sin sprites externos: formas simples con `ctx`.
- Mundo de 800×600. Torre de **diez piezas** de plataforma plana (seis alturas) y diez
  escaleras, definida de forma literal.
- Héroe con las mismas físicas que la variante 01: carrera, salto de altura fija sin control en
  el aire, escaleras, muerte por caída > 100 px.
- Saltar huecos de 60 px entre piezas del mismo nivel (el salto cubre ≈ 93 px).
- Barriles de cadena fija, que **mueren al tocar la lava**.
- **Lava ascendente** con retardo inicial y velocidad por nivel; tocarla mata.
- **Martillos:** 2 por pantalla, 8 s de efecto, rompen barriles y bolas de fuego.
- **Bolas de fuego** desde el nivel 2: persiguen al héroe sin cruzar huecos.
- 3 vidas. Completar la pantalla sube el nivel; la lava sube más rápido.
- Puntuación por altura nueva, por salto sobre barril, por romper con martillo, por meta y por
  margen de lava.
- Controles: flechas o WASD + Espacio.
- Una línea `salto-simio` en `GAME_ENGINES` (referencial: esta spec no la aplica).

**Fuera de alcance (para specs futuras o para la variante 01):**

- Vigas inclinadas, bono de tiempo y barril de aceite (son de la variante 01).
- Más de un tipo de martillo, o martillos que reaparecen dentro de la misma pantalla.
- Pantallas distintas por nivel.
- Sprites, spritesheet y sonido.
- Controles táctiles (los cubre `mobile-porter`).
- Modificar `lib/games.ts` o `lib/games/registry.ts`.
- Migraciones de Supabase (el paso 7 las describe, no las aplica).
- Autenticación y `scores.user_id` más allá de lo que ya hace `guardarScore`.

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni tipo de plataforma nuevo.** `scores` y `game_stats`
sirven a este juego sin tocarlas; el leaderboard se enciende con una fila en `games` cuando la
variante se promueva. El motor solo emite un `number` entero a `onGameOver`, guardado por el
modal en `scores` con `game_id = 'salto-simio'`.

Tipos locales del motor, sin exportar:

```ts
type Piece = { x0: number; x1: number; y: number; row: number }; // plataforma plana; row 0 = suelo
type Ladder = { x: number; lower: number; upper: number }; // índices de Piece
type Barrel = { x: number; y: number; dir: 1 | -1; piece: number; vy: number; jumped: boolean };
type Fireball = { x: number; y: number; dir: 1 | -1; piece: number; ladder: Ladder | null };
type Hammer = { x: number; piece: number; taken: boolean };
type HeroState = "ground" | "air" | "ladder" | "dying" | "won";
```

Estado en la clausura de `createSaltoSimioGame`:

- `hero: { x, y, vx, vy, face: 1 | -1, piece: number, peakY: number, ladder: Ladder | null }`.
- `heroState`, `stateTime` (ms), `hammerLeft` (ms de martillo; `> 0` = activo).
- `barrels: Barrel[]`, `fireballs: Fireball[]`, `hammers: Hammer[]`.
- `spawnTimer`, `fireTimer` (ms), `lavaDelay` (ms hasta empezar a subir), `lavaY` (superficie).
- `bestRow` (fila más alta alcanzada en este nivel; **no** se reinicia al perder una vida).
- `score`, `lives`, `level`, `keys`, `jumpQueued`, `state: "playing" | "gameover"`.
- Bucle: `rafId`, `lastTime`, `destroyed`.

---

## Plan de implementación

### 1. Motor: geometría y constantes

`lib/games/salto-simio/engine.ts`. Constantes de diseño:

```
W 800 · H 600
PIECES (superficie y; row = nivel de altura, 0 abajo):
  S0 x 0..800   y 568 row 0     S5 x 0..620   y 298 row 3
  S1 x 0..340   y 478 row 1     S6 x 680..800 y 298 row 3
  S2 x 400..800 y 478 row 1     S7 x 0..250   y 208 row 4
  S3 x 0..120   y 388 row 2     S8 x 310..800 y 208 row 4
  S4 x 180..800 y 388 row 2     S9 x 0..560   y 118 row 5 (cima)
  Huecos de 60 px entre S1/S2, S3/S4, S5/S6 y S7/S8.
LADDERS (x, lower → upper):
  (100, S0→S1) (700, S0→S2) (220, S1→S4) (620, S2→S4) (60, S3→S5)
  (500, S4→S5) (740, S4→S6) (150, S5→S7) (700, S6→S8) (400, S8→S9) (200, S7→S9)
  LADDER_W 24 (tolerancia de agarre ±10 px)
SIMIO x 40..120 sobre S9 · GOAL (rescate) x 500..540 sobre S9
HAMMERS: (650, S2) y (400, S5)
HERO_W 24 · HERO_H 32 · START (60, S0)
GRAVITY 1800 · JUMP_VY -560 (≈ 87 px, < 90 px entre niveles) · RUN_SPEED 150
CLIMB_SPEED 90 · FALL_DEATH 100 px · DT_MAX 50 ms · SCORE_CAP 999999
BARREL_R 10 · BARREL_SPEED 120 px/s · BARREL_FALL_VX 40 · BARREL_GRAVITY 1400
SPAWN_INTERVAL_L1 3500 ms · SPAWN_STEP 250 ms por nivel · SPAWN_MIN 1800 ms
BARREL_SPEED_STEP 6% por nivel (cap ×1.6) · BARREL_MAX 12
LAVA_START_Y 600 · LAVA_DELAY 5000 ms · LAVA_RATE_L1 4 px/s
LAVA_RATE_STEP 1.5 px/s por nivel (cap 10 px/s)
HAMMER_MS 8000 · HAMMER_REACH 30 px (delante) × 28 px de alto
FIREBALL_FROM_LEVEL 2 · FIREBALL_INTERVAL 15000 ms · FIREBALL_MAX min(level, 3)
FIREBALL_SIZE 14 · FIREBALL_SPEED 60 px/s · FIREBALL_CLIMB 50 px/s
LIVES_START 3 · DYING_MS 900 · WON_MS 1500
POINTS_ROW 50 · POINTS_JUMP 100 · POINTS_BARREL_HAMMER 300 · POINTS_FIRE_HAMMER 500
POINTS_GOAL 1500 · POINTS_LAVA_MARGIN 2 por px
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

`initGame()`: `level = 1`, `score = 0`, `lives = LIVES_START`, `bestRow = 0`, `resetStage()`.
`resetStage()`: héroe en START (`ground`, `piece = 0`), `barrels = []`, `fireballs = []`,
`hammers` con los dos de la tabla y `taken = false`, `hammerLeft = 0`, `spawnTimer = 1000`,
`fireTimer = FIREBALL_INTERVAL`, `lavaY = LAVA_START_Y`, `lavaDelay = LAVA_DELAY`, teclas y
`jumpQueued` a falso. `levelUp()` además pone `bestRow = 0`.

Comprobación: `npm run build` limpio.

### 2. Motor: héroe, entrada y huecos

- Movimiento en `ground`, salto, aire, escalera, aterrizaje de una vía, muerte por caída
  > `FALL_DEATH` y muerte en general: igual que la variante 01, con `surface()` sustituida por
  `piece.y` (superficie plana). Cambios:
  - Al salir de `[x0, x1]` de su pieza el héroe pasa a `air` (no hay pendiente): sobre un hueco
    cae; un salto bien medido cruza los 60 px.
  - El aterrizaje busca la pieza de `y` inmediatamente inferior que contiene `x`, con el barrido
    de una vía de la variante 01.
  - `jumpQueued` se consume siempre en el frame siguiente a la pulsación.
- **Martillo activo (`hammerLeft > 0`):** no se puede trepar ni saltar (`up`, `down` y Espacio
  se ignoran); la carrera sigue a 150 px/s. `hammerLeft -= dt`.
- **Recoger martillo:** el rectángulo del héroe solapa con un martillo no tomado en su pieza
  → `taken = true`, `hammerLeft = HAMMER_MS`. Recoger otro con uno activo reinicia a 8 s, no
  acumula.
- **Golpe:** con martillo activo, cualquier barril o bola de fuego dentro de la zona
  `HAMMER_REACH` × 28 px delante del héroe (hacia `face`) se destruye: `+300` (barril) o `+500`
  (fuego). Con martillo activo, tocar un barril o una bola de fuego fuera de esa zona **sigue
  matando**.
- **Altura:** al aterrizar o trepar a una pieza con `row > bestRow` → `score += POINTS_ROW *
  (row - bestRow)` y `bestRow = row`. Las filas ya alcanzadas no puntúan otra vez aunque el
  héroe muera y repita.
- **Victoria:** solapar GOAL estando en `S9` → `heroState = "won"` durante `WON_MS`; luego
  `score += POINTS_GOAL + POINTS_LAVA_MARGIN * max(0, round(lavaY - hero.y))`, `level++`,
  `levelUp()`, `resetStage()`.
- **Muerte:** igual que la variante 01 (900 ms congelado, `lives--`, `resetStage()` conservando
  `score`, `level` y `bestRow`; con `lives <= 0` → `gameover`, `stopLoop()`, `onGameOver(score)`
  una sola vez). `resetStage()` **sí** reinicia la lava.

Comprobación: `npm run build` limpio.

### 3. Motor: barriles, lava y bolas de fuego

- **Barriles:** nacen en `x = 130` sobre `S9` con `dir = 1` cada `spawnInterval(level)`
  (`max(SPAWN_MIN, 3500 - 250 * (level - 1))`), si hay menos de `BARREL_MAX`. Ruedan a velocidad
  constante `BARREL_SPEED * min(1.6, 1 + 0.06 * (level - 1))` (no hay pendiente). Al pasar un
  extremo de su pieza caen con `BARREL_GRAVITY` y `BARREL_FALL_VX` en su sentido, aterrizan en
  la primera pieza inferior que contiene su `x` y **invierten `dir`**. Cadena resultante: S9 →
  derecha → S8 → izquierda → S5 → derecha → S4 → izquierda → S1 → derecha → S0 → izquierda; al
  salir por `x < 0` de `S0` se elimina. Un barril que cae por el hueco S1/S2 aterriza en `S0`.
- **Colisión con barril y salto sobre barril:** igual que la variante 01 (círculo contra caja
  del héroe, `±14 px` y `jumped` por barril), con `POINTS_JUMP = 100`.
- **Lava:** `lavaDelay -= dt` hasta 0; después `lavaY -= lavaRate(level) * dt` con
  `lavaRate(level) = min(10, 4 + 1.5 * (level - 1))`. El héroe muere si `hero.y >= lavaY`
  (también en escalera o en el aire). Un barril o fuego con su base `>= lavaY` se elimina sin
  puntos. La lava sube sin parar: no hay tope, llegar a la cima antes que ella es el objetivo.
- **Bolas de fuego:** a partir del nivel 2, cada `FIREBALL_INTERVAL` nace una en `x = 140` sobre
  `S9` si hay menos de `min(level, 3)`. IA determinista, sin azar:
  - Se mueve por la pieza donde está, en `dir`, a 60 px/s. En los extremos de la pieza
    **invierte `dir`**; nunca cruza un hueco ni cae.
  - Si el héroe está en su misma pieza, `dir = sign(hero.x - fire.x)`.
  - Si no, y la bola pasa a ≤ 4 px del `x` de una escalera cuya otra punta lleva a una pieza de
    `row` más cercana al del héroe, la sube o baja a 50 px/s y reanuda en la nueva pieza.
  - Tocar al héroe sin martillo lo mata. Una bola que sube contra el martillo se destruye igual.

Comprobación: `npm run build` limpio.

### 4. Motor: bucle, entrada y dibujo

- `emit()` con `lastScore` / `lastLives` / `lastLevel`: avisa solo cuando cambia el valor.
  `onLives(3)` y `onLevel(1)` al iniciar. `score` se limita a `SCORE_CAP` antes de emitir.
- `draw()`: fondo negro; piezas planas en magenta, escaleras en cian, simio y rescate con colores
  planos, barriles amarillos, bolas de fuego naranjas con parpadeo, martillos como una `T`
  verde en la pieza, y la lava como un rectángulo naranja desde `lavaY` hasta el borde inferior
  con un borde ondulado calculado con `Math.sin` (sin asignaciones). Con martillo activo, el
  héroe dibuja un rectángulo delante que oscila cada 150 ms, y una barra fina sobre su cabeza
  muestra `hammerLeft / HAMMER_MS`. Sin puntuación, vidas ni nivel dibujados fuera de eso: lo
  pone el HUD de la plataforma.
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`, `KeyD`,
  `Space`. `preventDefault()` solo para esas. `Space` solo en `keydown` y sin `e.repeat`.
- Listeners `keydown` / `keyup` / `blur` sobre el canvas, nunca sobre `window`. `blur` suelta las
  teclas y descarta `jumpQueued`. `P` y `Escape` no llegan al motor.
- `dt` capado a `DT_MAX`; `lastTime = null` al reanudar. La lava avanza con el mismo `dt`
  capado: una pestaña en segundo plano no la hace subir de golpe.
- `destroy()` cancela el frame, quita los listeners y es idempotente. `restart()` detiene el
  bucle, `initGame()`, `emit()`, arranca.
- Ninguna asignación de arrays, objetos o clausuras dentro de `draw()` (SPEC 13).
- `initGame(); draw();` antes de devolver.

Comprobación: `npm run build` limpio.

### 5. Registro (cuando la variante se promueva)

`lib/games/registry.ts`:
`salto-simio: { create: createSaltoSimioGame, width: 800, height: 600, controls: "flechas o WASD para moverte y trepar, espacio para saltar; recoge martillos y huye de la lava", touch: { a: { code: "Space", label: "SALTO" } } }`.
`lib/games.ts`: ficha `id: "salto-simio"`, `title: "SALTO SIMIO"`, `cat: "ARCADE"`; `cover`/`color`
a decidir en la skill `nuevo-juego`. Esta spec no los toca.

Comprobación: `/jugar/salto-simio` pinta el canvas real.

### 6. Leaderboard (cuando la variante se promueva)

Igual que la variante 01, `supabase/migrations/<timestamp>_juego_salto_simio.sql`:

```sql
insert into public.games (id, title) values ('salto-simio', 'SALTO SIMIO');
```

Se aplica con `apply_migration` y se comprueba con `execute_sql`; los tipos no se regeneran. El
motor limita a `SCORE_CAP = 999999` por el `CHECK` de `scores` (0..1.000.000). Esta variante y
la 01 puntúan en escalas distintas, así que **no se promueven las dos a la vez** bajo el mismo
`game-id`: la elegida es la única que escribe en `salto-simio`.

Comprobación: `select * from public.games` incluye `salto-simio`.

### 7. Repaso final (cuando esta variante se promueva)

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos y recorrido manual de
los criterios de aceptación. Esta spec no ejecuta este paso.

---

## Criterios de aceptación

- [ ] `/jugar/salto-simio` (una vez cableado) muestra un canvas de 800×600 con la torre de diez
      piezas, once escaleras, dos martillos, simio y rescate, no la `.game-arena`.
- [ ] El héroe arranca en `(60, S0)`; carrera, salto y escaleras responden como en la variante 01.
- [ ] Un salto desde el borde de una pieza cruza un hueco de 60 px; un paso sin salto cae al
      nivel inferior (≈ 90 px) sin matar, y una caída de dos niveles mata.
- [ ] Los barriles siguen la cadena S9 → S0 en el orden del paso 3, sin rodar nunca por una
      pendiente y sin cruzar huecos «flotando».
- [ ] La lava no se mueve durante los primeros 5 s, y después sube a 4 px/s en el nivel 1.
- [ ] La lava mata al héroe en cuanto su `y` de pies la alcanza, estando en suelo, escalera o aire.
- [ ] Un barril que toca la lava desaparece sin dar puntos.
- [ ] Recoger un martillo muestra la barra de 8 s; mientras dura, `up`, `down` y Espacio no hacen
      nada y la carrera sigue.
- [ ] Con martillo, un barril delante a ≤ 30 px se rompe y suma 300; una bola de fuego suma 500.
- [ ] Con martillo, un barril que llega por detrás o desde arriba sigue matando.
- [ ] Un martillo recogido no reaparece hasta la siguiente pantalla; perder una vida lo repone.
- [ ] En el nivel 1 no hay bolas de fuego; desde el nivel 2 nace una cada 15 s hasta el máximo
      `min(level, 3)`.
- [ ] Una bola de fuego nunca cruza un hueco ni cae, y sube por una escalera solo cuando el
      héroe está en otro nivel; el mismo escenario siempre produce el mismo recorrido.
- [ ] Alcanzar una fila nueva suma 50 por fila; morir y repetir esas filas no vuelve a sumar.
- [ ] Saltar sobre un barril suma 100 una sola vez por barril.
- [ ] Llegar a la meta suma `1500 + 2 × (px de margen con la lava)`, sube el nivel y reinicia
      la torre con la lava más rápida (5,5 px/s en el nivel 2).
- [ ] La velocidad de la lava no supera 10 px/s ni la de barriles ×1,6 en niveles altos.
- [ ] Perder una vida reinicia la lava a 600 y el retardo de 5 s, conservando `score`, `level`
      y `bestRow`.
- [ ] Al perder la tercera vida se abre el modal `FIN DEL JUEGO` una sola vez, con la puntuación real.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'salto-simio'`, que aparece
      en `/salon?juego=salto-simio` y `/juegos/salto-simio` sin recargar a mano; guardar dos veces
      seguidas no inserta dos filas.
- [ ] La puntuación emitida nunca supera 999 999.
- [ ] `PAUSA` congela héroe, barriles, fuego, martillo y lava; `REANUDAR` continúa sin saltos.
- [ ] Con el canvas enfocado, flechas y Espacio no hacen scroll; escribir en el campo de
      iniciales no mueve ni reinicia el juego.
- [ ] Dejar la pestaña en segundo plano y volver no sube la lava de golpe ni hace caer al héroe
      a través de una plataforma.
- [ ] Navegar de `/jugar/salto-simio` a `/biblioteca` y volver no duplica el bucle.
- [ ] Los otros juegos se juegan igual que antes; la consola no muestra errores ni avisos de
      hidratación; `get_advisors` no reporta avisos nuevos.

---

## Decisiones

- **Sí:** plataformas planas con huecos de 60 px. El salto de la variante 01 (87 px de altura,
  ≈ 93 px de alcance) se reutiliza tal cual, y los huecos le dan un segundo uso sin tocar la física.
- **Sí:** lava ascendente en lugar de bono de tiempo. El peligro es físico y legible: se ve cuánto
  falta, y obliga a tomar rutas más arriesgadas.
- **Sí:** la lava se reinicia al perder una vida, pero `bestRow` no. Evita la espiral de
  muerte (empezar con la lava ya alta) sin permitir repetir filas para farmear puntos.
- **Sí:** martillo que bloquea saltar y trepar. Es el compromiso clásico: poder y vulnerabilidad
  a la vez, y evita que el martillo sea un escudo universal.
- **Sí:** el martillo solo golpea delante. Mantiene la decisión de posición y evita una
  invulnerabilidad total.
- **Sí:** IA de fuego determinista y confinada a su pieza. Es predecible, depurable y evita
  bolas de fuego atrapando al jugador en huecos o persiguiéndolo sin escape.
- **No:** aleatoriedad en barriles, fuego o martillos; la repetición permite aprender la pantalla.
- **No:** reaparecer martillos durante la misma pantalla; solo se reponen con una vida perdida o
  al subir de nivel.
- **No:** combinar esta variante con la 01 bajo el mismo `game-id` a la vez (ver paso 6).
- **No:** sprites ni sonido; mismo motivo que la variante 01.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo | Mitigación |
| ------ | ---------- |
| La lava hace imposible el nivel 1 si el héroe pierde tiempo con huecos o escaleras. | De 5 s de retardo más 4 px/s a tope se tarda ≈ 120 s en alcanzar S9; el recorrido ideal son ≈ 30 s. Se verifica jugando y se anota cualquier desvío. |
| El nivel 6+ (lava a 10 px/s) es injugable y nadie ve el final de la curva. | Cap explícito en 10 px/s; si no es superable en verificación se ajusta el paso, no el cap. |
| Un hueco de 60 px queda justo en el límite del alcance de salto (≈ 93 px) con el despegue. | El salto es siempre corriendo; en parado el alcance es 0 y no cruza. Se verifica con despegues en el borde y a 20 px de él. |
| Martillo + escalera: el jugador queda atrapado abajo sin poder subir hasta que el martillo acaba. | Dura 8 s, es explícito en Decisiones y la barra sobre la cabeza lo hace legible. |
| Las bolas de fuego confinadas a su pieza quedan «dormidas» lejos del héroe y se sienten inútiles. | Pueden subir y bajar escaleras siguiendo la fila del héroe; si en verificación estorban poco, se baja `FIREBALL_INTERVAL`. |
| Un barril muere en la lava justo bajo el héroe y da la sensación de un golpe injusto. | La lava se resuelve antes que los barriles en cada frame y el héroe muere por la lava, no por el barril. |
| `draw()` de la lava ondulada asigna un `Path2D` por frame y dispara el GC. | Se dibuja con `lineTo` en bucle sobre el `ctx` existente; ninguna asignación por frame (SPEC 13). |
| Espacio llega al motor mientras se escriben iniciales. | Bucle parado con el modal abierto y listeners en el canvas, no en `window`. |

---

## Lo que **no** entra en esta spec

- Vigas inclinadas, bono de tiempo, barril de aceite (ver variante 01).
- Más tipos de martillo o de enemigo, o martillos que reaparecen en la misma pantalla.
- Pantallas distintas por nivel.
- Sprites, spritesheet o sonido.
- Controles táctiles, más allá del campo `touch` referencial.
- `lib/games.ts`, `lib/games/registry.ts`, migraciones, catálogo o leaderboard reales — eso
  ocurre solo si esta variante se promueve fuera de `specs/game-jam/`.
- Autenticación, `scores.user_id`.

Cada una de ellas, si entra, va en su propia spec.
