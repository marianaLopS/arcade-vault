# SPEC — MATCH-CRISTAL: reacciones en cadena

> **Estado:** Propuesta (game jam). No entra en la numeración `specs/NN-*.md` del repo hasta que se elija esta variante y se promueva por `/spec` o la skill `nuevo-juego`.
> **Depende de:** SPEC 05, SPEC 06, SPEC 08, SPEC 11, SPEC 13, SPEC 14, SPEC 15
> **Fecha:** 2026-10-21
> **Objetivo:** Un match-3 de 8×8 donde las líneas grandes crean cristales especiales (rayo, bomba, prisma) que se combinan entre sí, con una meta de puntos por nivel y un presupuesto de movimientos que obliga a planificar las reacciones.

---

## Por qué existe esta spec

La variante `01-clasico-por-movimientos.md` es el match-3 sin adornos: una bolsa de 25
movimientos y puntos. Funciona, pero toda la decisión del jugador es «qué línea hago». Esta
variante cambia **la pregunta de diseño**: «qué línea hago hoy para que mañana explote el
tablero». Lo consigue con dos capas que la clásica no tiene:

1. **Cristales especiales** que nacen de líneas grandes y, al activarse, vacían filas, columnas,
   áreas o colores enteros, encadenándose con otros especiales.
2. **Metas por nivel**: cada nivel exige una cantidad de puntos dentro de un número limitado de
   movimientos. Si no llegas, la partida acaba. Los movimientos sobrantes se cobran a 100 puntos
   y detonan el tablero (el «final de nivel» de los match-3 de móvil).

El twist real es que el mismo cristal puede ser un pegote o una bomba según el orden en que lo
juegues, y que combinar dos especiales **sin necesidad de línea** es una jugada válida y la más
potente del juego. Eso obliga a un motor de efectos con cola de activación y cadenas, que no
existe en el clásico.

Mismo mundo lógico, mismos controles y misma integración con Supabase que la variante 01;
solo difieren las reglas de la partida. Cada archivo es autosuficiente.

Como Snake (SPEC 10), no hay código de referencia: las constantes de esta spec **son** el diseño
y cambiarlas durante la implementación es rediseñar, no implementar. Y es el primer juego **de
ratón** del vault, con fases animadas temporizadas por `dt` para que `pause()` las congele.

---

## Alcance

**Dentro:**

- `lib/games/match-cristal/engine.ts`: motor nuevo con todo el estado en la clausura de
  `createMatchCristalGame`.
- `lib/games/match-cristal/skins.ts`: paletas `clasico`, `neon`, `retro` (`SkinId`).
- Tablero de 8×8 celdas de 64 px en un mundo lógico de **576×576**.
- Seis tipos de cristal, distinguibles por forma además de por color.
- Tres cristales especiales: **Rayo** (de línea de 4), **Bomba** (de forma L/T/cruz) y **Prisma**
  (de línea de 5 o más).
- Combinaciones especial + especial con efecto propio, válidas sin línea.
- Cola de activación: un especial alcanzado por un efecto se activa en cadena.
- Cascadas con gravedad hacia abajo, relleno desde arriba y multiplicador de cadena.
- Niveles con meta de puntos y presupuesto de movimientos; final de nivel con cobro de
  movimientos sobrantes.
- Reshuffle automático sin movimientos posibles; pista tras 6 s.
- Barra de progreso de la meta en el margen superior del canvas, sin números.
- Teclado, ratón (clic y arrastre) y táctil (pointer events + mando SPEC 11).
- Una línea `match-cristal` en `GAME_ENGINES` con `skins: true` y `touch`, ficha nueva en
  `lib/games.ts` (`cat: "PUZZLE"`), CSS de portada y migración con la fila en `games`.

**Fuera de alcance (para specs futuras):**

- Hielo, cristales bloqueados, cajas, cadenas u otros obstáculos.
- Misiones distintas a «alcanzar puntos» (recoger N de un color, bajar ingredientes).
- Modo por tiempo, modo zen, potenciadores comprables y vidas extra.
- Cristales especiales distintos de Rayo, Bomba y Prisma.
- Sonido.
- Perfil, rachas o la fila `▸ TU MEJOR MARCA` por cuenta.

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni tipo de plataforma nuevo.** `scores` y `game_stats`
sirven a este juego sin tocarlas.

`scores` ya tiene `game_id` (FK a `games`), `player` (`^[A-Z]{1,3}$`), `score` (0..1.000.000) y
`user_id` (FK a `auth.users`, `null` = invitado; SPEC 14/15). El motor solo llama a
`onGameOver(finalScore)`; la Server Action `guardarScore` valida y rellena `user_id` con
`getClaims()`. Para respetar el `CHECK (score <= 1000000)`, el motor topa `score` en
`SCORE_MAX = 999999`. Las políticas RLS existentes (`insert` con `user_id is null or user_id =
auth.uid()`, sin `update` ni `delete`) bastan.

Tipos locales del motor, sin exportar:

```ts
type Kind = 0 | 1 | 2 | 3 | 4; // 0 normal, 1 RAYO_H, 2 RAYO_V, 3 BOMBA, 4 PRISMA
type Phase =
  | "idle" | "swapping" | "reverting" | "comboing" | "clearing"
  | "falling" | "shuffling" | "levelclear" | "gameover";
```

Estado en la clausura de `createMatchCristalGame`:

- `grid: Int8Array(64)` — tipo de color 0..5; `PRISMA_TYPE = 6` para el prisma (no casa con
  nada); `-1` celda vacía.
- `kind: Uint8Array(64)` — `Kind` de cada celda.
- `offY: Float32Array(64)`, `fade: Float32Array(64)`, `marked: Uint8Array(64)`,
  `spawn: Int8Array(64)` (`-1` ninguno o el `Kind` que nacerá en esa celda tras vaciar),
  `fired: Uint8Array(64)` (especiales ya activados en este lote).
- `queue: Int8Array(64)` y `qHead`, `qTail` — cola de activaciones, preasignada.
- `phase`, `phaseT` (ms en la fase), `paused`.
- `swapA`, `swapB` (índices del intercambio; `swapB` es el destino del cristal movido por el
  jugador), `cursor`, `selected`, `hintA`, `hintB`, `idleT`.
- `score`, `levelScore` (puntos ganados en este nivel), `moves`, `level`, `chain`.
- `bonusLeft` y `bonusT` — movimientos sobrantes por convertir y su temporizador, en
  `levelclear`.
- `popups: Popup[]` — pool fija de 16 `{ x, y, text, t, active }`.
- `drag: { active, from, x0, y0 }`.
- Bucle: `rafId`, `lastTime`, `destroyed`; `lastScore` / `lastMoves` / `lastLevel` para `emit()`.

---

## Plan de implementación

### 1. Skins

`lib/games/match-cristal/skins.ts` con una paleta por `SkinId`. Los seis cristales se distinguen
**también por forma**: rombo, círculo, triángulo, cuadrado, hexágono y estrella de cuatro puntas
(tipos 0..5). Los especiales se dibujan encima del cristal con un marcador de forma fija en
cualquier skin: Rayo = dos flechas opuestas (horizontales o verticales según `Kind`), Bomba =
círculo concéntrico con mecha, Prisma = rombo blanco facetado sin color de tipo.

| Tipo | Forma     | clasico   | neon      | retro     |
| ---- | --------- | --------- | --------- | --------- |
| 0    | rombo     | `#e53935` | `#ff2d6f` | `#d9482b` |
| 1    | círculo   | `#1e88e5` | `#2d9bff` | `#3a6ea5` |
| 2    | triángulo | `#43a047` | `#39ff14` | `#5a9a3c` |
| 3    | cuadrado  | `#fdd835` | `#ffee00` | `#e0b030` |
| 4    | hexágono  | `#8e24aa` | `#c13bff` | `#8a4f9e` |
| 5    | estrella  | `#00acc1` | `#00fff0` | `#3fa39b` |

Fondo / rejilla: `clasico` `#10131c` / `#1b2030`, `neon` `#05010d` / `#140826`, `retro`
`#1c1710` / `#2a2418`. Cursor `#ffffff`, pista `#ffd54f`, marcador de especial `#ffffff`, barra
de meta `#ffd54f` sobre `rejilla`.

Comprobación: `npm run build` limpio; un especial se distingue de un normal con la skin en
escala de grises.

### 2. Motor: constantes y lógica de partida

`lib/games/match-cristal/engine.ts`. Constantes de diseño:

```
W 576 · H 576 · CELL 64 px · COLS 8 · ROWS 8 · BOARD_X 32 · BOARD_Y 32
GEM_TYPES(level) = level < 4 ? 5 : 6
TARGET(L) = 1200 + 400 * (min(L, 30) - 1)           // puntos del nivel L
MOVES(L)  = max(15, 25 - floor((min(L, 30) - 1) / 2))
LEVEL_MAX_SCALING 30 · LEVEL_MAX 99
GEM_POINTS 10 · CHAIN_MULT(chain) = min(chain, 8)
LINE_BONUS: 4 → 20 · ≥5 → 50 · SHAPE_BONUS (L/T/cruz) 40
ACTIVATION: RAYO 50 · BOMBA 80 · PRISMA 150
COMBO_BONUS: Rayo+Rayo 100 · Rayo+Bomba 200 · Bomba+Bomba 250
             Prisma+Rayo 300 · Prisma+Bomba 300 · Prisma+Prisma 500
LEFTOVER_POINTS 100 por movimiento sobrante
SCORE_MAX 999999
SWAP_MS 160 · REVERT_MS 160 · CLEAR_MS 220 · CLEAR_SPECIAL_MS 360 · COMBO_MS 360
FALL_MS_PER_CELL 70 · FALL_MS_MIN 120 · SHUFFLE_MS 600 · BONUS_STEP_MS 180
HINT_DELAY 6000 · HINT_PERIOD 900 · DRAG_MIN 26 px · SHUFFLE_TRIES 50
POPUP_POOL 16 · POPUP_MS 700 · DT_MAX 50 ms
```

Los puntos de un lote son: `(10 × celdas vaciadas distintas + bonus de línea + bonus de forma +
activaciones + combo) × CHAIN_MULT(chain)`. **Cualquier cambio de estos números es un cambio de
diseño y no entra en esta spec.**

**Cristales y creación.** `findMatches()` marca la unión de las líneas de 3+ y mide cada una. Por
lote, en orden de prioridad (una celda solo genera un especial):

1. Línea de 5 o más → **Prisma** (`PRISMA_TYPE`, sin color).
2. Una celda donde se cruzan una línea horizontal y una vertical de 3+ (L, T o cruz) → **Bomba**
   con el color de las líneas, más `SHAPE_BONUS`.
3. Línea de exactamente 4 → **Rayo** con el color de la línea. Una línea **horizontal** crea un
   `RAYO_V` (limpia su columna) y una **vertical** crea un `RAYO_H` (limpia su fila): es
   perpendicular, como en Candy Crush, para que el especial «cruce» la línea que lo creó.

El especial nace en la celda `swapB` si está en la línea (el cristal que movió el jugador); si no
—cascadas o la celda movida no pertenece a la línea—, nace en la celda central de la línea
(la de índice `floor(len / 2)`). La celda del especial **se quita de `marked`**: sobrevive al
vaciado y conserva el color de su línea. El relleno nunca crea especiales.

**Los especiales casan como un cristal normal de su color** y, si forman parte de una línea
marcada, se activan (ver más abajo). El Prisma nunca casa.

**Activación (cola).** Para cada especial en `marked` (o alcanzado por un efecto) y no `fired`:
se marca `fired`, se encola y, al procesarla, añade celdas a `marked`; si añade otro especial
no `fired`, lo encola. El lote entero se resuelve en una única fase `clearing` con
`CLEAR_SPECIAL_MS` en vez de `CLEAR_MS`. Efectos:

- `RAYO_H`: toda la fila del especial. `RAYO_V`: toda la columna.
- `BOMBA`: el área de 3×3 centrada en la celda (recortada por los bordes).
- `PRISMA` alcanzado por un efecto (no por swap): vacía todos los cristales del tipo más
  abundante del tablero (empate: el tipo de menor índice) y a sí mismo.

**Intercambio válido.** Un swap entre celdas adyacentes (sin diagonales) es válido si:
(a) tras el swap `findMatches()` encuentra una línea, o (b) **ambas** celdas son especiales, o
(c) **alguna** es un Prisma. Una jugada válida consume 1 movimiento. Un swap inválido anima ida y
vuelta (`reverting`) y **no consume movimiento**.

**Combinaciones** (swap de dos especiales, o Prisma + cristal; no hace falta línea; fase
`comboing` de `COMBO_MS` y luego `clearing`):

| Swap                   | Efecto                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| Prisma + cristal normal| Vacía todos los cristales del color del normal (y el Prisma). Activación Prisma 150.            |
| Rayo + Rayo            | Fila **y** columna de la celda destino (cruz).                                                  |
| Rayo + Bomba           | Tres filas y tres columnas centradas en la celda destino (cruz gruesa).                         |
| Bomba + Bomba          | Área de 5×5 centrada en la celda destino.                                                       |
| Prisma + Rayo          | Todos los cristales del color del Rayo se convierten en Rayos (orientación alterna `H`, `V`) y se activan en cadena. |
| Prisma + Bomba         | Todos los cristales del color de la Bomba se convierten en Bombas y se activan en cadena.       |
| Prisma + Prisma        | Vacía el tablero entero.                                                                        |

El color del Rayo o de la Bomba es el del `grid` de su celda. Tras la combinación, la cola de
activación sigue funcionando: un especial alcanzado se activa.

**Cascada.** Tras `clearing`: puntuar, spawn de especiales (`spawn` → `kind`/`grid` de su celda),
`falling` (mismo cálculo que la variante 01: columnas compactadas, relleno aleatorio de
`GEM_TYPES(level)`, duración `max(FALL_MS_MIN, FALL_MS_PER_CELL × caídaMáxima)`) y un nuevo
`findMatches()`. Si hay línea: `chain++` y otro ciclo; si no, `chain = 1`.

**Fin de cascada**, en este orden: (1) si `levelScore >= TARGET(level)`, fase `levelclear`;
(2) si no y `moves === 0`, `gameover`; (3) si no hay movimiento válido, `shuffling`; (4) `idle`.
El orden importa: llegar a la meta con 0 movimientos **pasa** el nivel.

**Final de nivel (`levelclear`).** `bonusLeft = moves`. Cada `BONUS_STEP_MS`, mientras quede
`bonusLeft > 0`, un cristal normal elegido al azar se convierte en `RAYO_H` o `RAYO_V` (a suerte),
`score += LEFTOVER_POINTS` y `levelScore` no cambia. Cuando se agotan, se activan **todos** los
Rayos del tablero en un solo lote de `clearing` con `chain = 1` (sin multiplicador) y cascadas con
el mismo multiplicador de siempre. Al asentarse: `level++`, `levelScore = 0`,
`moves = MOVES(level)` (los sobrantes ya se cobraron), `onLevel`, popup `NIVEL nn`. Luego
continúa por los pasos (2)–(4) del fin de cascada con el nuevo nivel. La partida **no reinicia el
tablero** entre niveles.

**Barajado.** Igual que en la variante 01: permuta Fisher-Yates de todas las celdas (con su
`kind`) hasta que no haya líneas y haya un movimiento válido, hasta `SHUFFLE_TRIES`; si se agota,
se regenera el tablero con la rutina de inicio. Sin coste en movimientos ni puntos. Un tablero
con un Prisma siempre tiene movimiento (criterio c).

**Tablero inicial:** sin líneas hechas, sin especiales, con al menos un movimiento válido.
Arranca con `moves = MOVES(1)` = 25, `score = 0`, `level = 1`.

Comprobación: `npm run build` limpio.

### 3. Motor: bucle, fases y dibujo

- `requestAnimationFrame` con `dt` capado a `DT_MAX`; `lastTime = null` al reanudar. Cada frame
  suma `dt` a `phaseT`. Sin `setTimeout` ni `setInterval`.
- `pause()` cancela el frame sin tocar `phase`, `phaseT`, `bonusT` ni la cola: pausar en mitad de
  un `clearing` con cadena de especiales y reanudar continúa sin repetir activaciones.
  `resume()` es no-op en `gameover`.
- Mientras `phase !== "idle"` toda jugada se descarta; solo se mueve el cursor.
- `emit()`: `onScore`, `onLives(moves)`, `onLevel` solo cuando cambian. `onLives(moves)` se
  emite al iniciar y en cada cambio; `onLives(0)` en el game over. El HUD rotula `Vidas` y aquí
  muestra los movimientos restantes, como Tetris usa `onLives(1)`.
- `draw()`: fondo, rejilla, cristales con `offY`/`fade`, marcadores de especial, destellos del
  efecto (línea blanca que barre la fila/columna, anillo para la bomba) con `fade` y
  `phaseT`, cursor, selección, pista, popups y **barra de meta** (rectángulo de 512×8 px en
  `y = 12`, rellena `min(1, levelScore / TARGET(level))`). Sin asignaciones dentro de `draw()`.
- Sin puntos, movimientos ni nivel pintados fuera de popups; ni overlay de game over.
- Game over: `stopLoop()` y `onGameOver(score)` una vez.
- `restart()`: detiene el bucle, `initGame()`, vacía `queue`, `emit()`, arranca. Descarta animación
  en curso.
- `destroy()`: cancela el frame, quita listeners, restaura `canvas.style.touchAction`; idempotente.
- `initGame(); draw();` antes de devolver.

Comprobación: `npm run build` limpio; se ven los tres especiales en `/jugar/match-cristal`.

### 4. Entrada: teclado, ratón y táctil

```
GAME_KEYS: ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Space, Enter, KeyX
```

`preventDefault()` solo para éstas. `P` y `Escape` no llegan al motor.

- Teclado sin selección: flechas mueven el cursor (sin dar la vuelta); la primera pulsación lo
  muestra en `(3, 3)`. `Space`/`Enter` eligen el cristal bajo el cursor.
- Teclado con selección: una flecha intercambia con el vecino en esa dirección (fuera del
  tablero, se ignora). `Space`, `Enter` o `KeyX` sueltan.
- Puntero (`pointerdown`/`pointermove`/`pointerup`/`pointercancel`, `setPointerCapture`) en el
  canvas, con `canvas.style.touchAction = "none"` restaurado en `destroy()`. Las coordenadas se
  convierten con `getBoundingClientRect()` y escala `W / rect.width`.
- Clic: sin selección elige; sobre un vecino del elegido intercambia; sobre uno no adyacente
  cambia la selección; sobre el elegido o fuera del tablero suelta.
- Arrastre: desde un cristal, al superar `DRAG_MIN` px en el eje dominante intercambia con el vecino
  de esa dirección; un swap por gesto.
- Mando táctil: cruceta (flechas) y botones `Space` / `KeyX`; el teclado cubre el móvil sin
  código táctil en la lógica de jugada. Ningún `isTrusted`.
- Listeners `keydown` / `blur` sobre el canvas, nunca sobre `window`. `blur` suelta la selección
  y cancela el arrastre. Cualquier entrada válida pone `idleT = 0` y borra la pista.

Comprobación: partida completa solo con teclado, solo con ratón y solo con el mando emulado
(`pointer: coarse`), incluyendo una combinación Prisma + Rayo.

### 5. Registrar y dar de alta la ficha

`lib/games/registry.ts`:

```ts
"match-cristal": {
  create: createMatchCristalGame,
  width: 576,
  height: 576,
  controls: "flechas para mover el cursor, espacio para elegir un cristal y una flecha para intercambiarlo; o clic y arrastre con el ratón",
  skins: true,
  touch: { a: { code: "Space", label: "ELEGIR" }, b: { code: "KeyX", label: "SOLTAR" } },
},
```

Sin `repeat`: un toque es un paso. `lib/games.ts`: ficha `id: "match-cristal"`,
`title: "MATCH-CRISTAL"`, `cat: "PUZZLE"`, `cover: "cover-cristal"`; `app/globals.css`: bloque
`.cover-cristal`.

Comprobación: `/jugar/match-cristal` pinta el canvas y el selector de skins; el resto de juegos
no cambian.

### 6. Leaderboard

`supabase/migrations/<timestamp>_juego_match_cristal.sql`, con timestamp posterior a
`20260927130000`:

```sql
insert into public.games (id, title) values ('match-cristal', 'MATCH-CRISTAL');
```

Se aplica con `apply_migration` y se comprueba con `execute_sql`. Los tipos no se regeneran.

Comprobación: `select id from public.games` incluye `match-cristal`.

### 7. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, `?fps=1` (SPEC 13)
con una cadena larga de especiales sin frames > 50 ms ni crecimiento del heap, y recorrido manual
de los criterios.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/match-cristal` muestra un canvas de 576×576 con tablero 8×8, no la `.game-arena`.
- [ ] Al empezar: 25 en `Vidas`, 0 puntos, nivel 01, sin líneas hechas, sin especiales y con al menos un movimiento válido.
- [ ] La barra de meta de la parte superior del canvas está vacía al empezar y se llena con los puntos del nivel (1200 en el nivel 1) sin mostrar números.
- [ ] Una línea de 3 puntúa 30 y resta 1 movimiento; un swap sin línea (y sin especiales implicados) se deshace y no resta movimiento.
- [ ] Una línea horizontal de 4 crea un Rayo vertical del mismo color en la celda movida; una vertical de 4 crea un Rayo horizontal.
- [ ] Una L, T o cruz de 5 cristales crea una Bomba del color de las líneas y suma 40 de forma.
- [ ] Una línea de 5 o más crea un Prisma sin color; el Prisma no casa con ningún cristal en fila.
- [ ] El especial creado sobrevive al vaciado y cae con la gravedad como cualquier cristal.
- [ ] Un Rayo incluido en una línea vacía toda su fila o columna y suma 50.
- [ ] Una Bomba activada vacía el área de 3×3 y suma 80; en el borde se recorta sin error.
- [ ] Un especial alcanzado por el efecto de otro se activa en la misma fase, una sola vez.
- [ ] Prisma + cristal vacía todos los cristales de ese color; Prisma + Prisma vacía el tablero entero y suma 500.
- [ ] Rayo + Rayo vacía cruz; Rayo + Bomba, cruz gruesa de 3; Bomba + Bomba, 5×5.
- [ ] Prisma + Rayo convierte los cristales del color del Rayo en Rayos y los activa; Prisma + Bomba hace lo mismo con bombas.
- [ ] Un swap de dos especiales es válido aunque no forme línea, y un swap con Prisma siempre es válido; los dos consumen 1 movimiento.
- [ ] La segunda cascada puntúa ×2, la tercera ×3, hasta ×8; el bonus de línea y de activación también se multiplica.
- [ ] El relleno nunca genera especiales.
- [ ] Al alcanzar la meta del nivel el juego espera a que termine la cascada, convierte cada movimiento sobrante en un Rayo (uno cada 180 ms), suma 100 por cada uno y los detona.
- [ ] Alcanzar la meta con 0 movimientos pasa de nivel; no alcanzarla con 0 movimientos abre `FIN DEL JUEGO`.
- [ ] Al pasar al nivel 2 el HUD pasa a 02, `Vidas` marca 25, la meta es 1600 y el tablero **no** se reinicia.
- [ ] A partir del nivel 4 aparecen seis colores de cristal en el relleno.
- [ ] Sin movimientos posibles el tablero se baraja sin coste, con popup `BARAJANDO`, y el resultado no tiene líneas hechas.
- [ ] Tras 6 s sin actuar se pulsa en dorado un movimiento válido (incluidas jugadas de especiales); actuar lo apaga.
- [ ] Teclado: flechas mueven el cursor, `Space` elige y una flecha intercambia; `Space` o `X` sueltan.
- [ ] Ratón: clic + clic en un vecino intercambia; arrastrar más de 26 px en un eje intercambia con el vecino de esa dirección.
- [ ] Táctil: arrastrar sobre el canvas intercambia sin hacer scroll; el mando virtual (cruceta + ELEGIR / SOLTAR) juega una partida completa.
- [ ] Con el canvas enfocado, las flechas y `Space` no hacen scroll de la página.
- [ ] `PAUSA` en mitad de una cadena de especiales congela las activaciones; `REANUDAR` las continúa sin repetirlas ni saltarse ninguna; `P` y `Escape` hacen lo mismo.
- [ ] Pausar con un cristal elegido no pierde la selección.
- [ ] Mientras hay animación, el clic o el swap por teclado no hacen nada.
- [ ] El canvas no dibuja números de puntos, movimientos ni nivel fuera de popups, ni overlay de game over.
- [ ] El game over se emite una sola vez, después de resolver las cascadas pendientes.
- [ ] `JUGAR DE NUEVO` reinicia a nivel 1, 25 movimientos y 0 puntos sin recargar, también en mitad de una animación.
- [ ] La puntuación nunca supera 999999.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'match-cristal'`; con sesión lleva `user_id`, como invitado lleva `null`.
- [ ] Esa puntuación aparece en `/salon?juego=match-cristal` y en `/juegos/match-cristal` sin recargar a mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Con `scores` vacía, `/salon?juego=match-cristal` muestra el estado vacío.
- [ ] Escribir flechas, espacio o `X` en las iniciales no mueve ni reinicia el juego.
- [ ] Los tres skins distinguen sus seis cristales y los tres especiales en modo oscuro.
- [ ] Navegar fuera de `/jugar/match-cristal` y volver no duplica el bucle ni los listeners.
- [ ] Volver de una pestaña en segundo plano no avanza varias fases de golpe.
- [ ] Los juegos ya implementados y los de maqueta se juegan igual que antes.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** tres especiales, no más. Rayo, Bomba y Prisma cubren fila/columna, área y color;
  un cuarto especial duplicaría efectos.
- **Sí:** Rayo perpendicular a la línea que lo creó. Es la convención del género y evita que el
  jugador desperdicie el rayo sobre la línea que acaba de hacer.
- **Sí:** el especial nace en la celda que movió el jugador. Premia la jugada intencionada;
  en cascadas, el centro de la línea es la elección determinista más simple.
- **Sí:** combinar especiales no exige línea. Es lo que da sentido a guardarlos; hacer que
  exigieran línea los convertiría en ruido.
- **Sí:** un Rayo o Bomba + cristal normal solo es válido si hace línea. Si no, dejaría de haber
  swaps inválidos y la pista perdería sentido.
- **Sí:** el Prisma siempre es jugable. Garantiza que un tablero con Prisma no necesita barajarse.
- **Sí:** cola de activación con `fired`. Evita bucles infinitos y activaciones duplicadas.
- **Sí:** el lote de especiales se resuelve en una sola fase `clearing`. Menos estados y la
  animación sigue siendo legible.
- **Sí:** meta de puntos por nivel con presupuesto de movimientos. Da la tensión que la bolsa de
  movimientos de la variante 01 no tiene: se puede perder aunque sumes mucho.
- **Sí:** los movimientos sobrantes dan 100 y detonan Rayos. Hace que ahorrar movimientos sea
  una estrategia y que el cierre de nivel sea espectacular.
- **Sí:** el tablero persiste entre niveles. Reiniciarlo mataría las reacciones planificadas.
- **Sí:** `TARGET` lineal y `MOVES` decreciente hasta 15, con tope de escalado en el nivel 30. Más
  allá sigue subiendo el contador de nivel (hasta 99) pero no la dificultad.
- **Sí:** barra de meta dentro del canvas sin números. La meta es estado propio de la partida y el
  HUD de plataforma no tiene casilla para ella; los números siguen siendo del HUD de React.
- **Sí:** `onLives(moves)`. Misma decisión que la variante 01 y que Tetris (SPEC 08).
- **No:** obstáculos, misiones alternativas, potenciadores comprables. Cada uno es otra spec.
- **No:** `repeat: true` en el mando táctil. Un toque es un paso.
- **No:** sonido ni sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo                                                                             | Mitigación                                                                                                |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Cadena de especiales infinita o con activaciones duplicadas.                       | `fired` por celda y cola preasignada de 64; cada especial se activa una sola vez por lote.                |
| Pausa en mitad de una cadena repite o se salta efectos.                            | Las activaciones se calculan al entrar en `clearing`; la fase solo anima. `pause()` no toca la cola.      |
| Spawn de un especial sobre una celda que otro efecto vacía.                        | Las celdas de spawn se quitan de `marked` al final del cálculo del lote: el especial nuevo sobrevive.      |
| Prisma + Prisma o cadenas grandes suben la puntuación por encima del `CHECK`.      | `SCORE_MAX = 999999` en el motor; `LEFTOVER_POINTS` y bonus están acotados por constantes.                |
| El jugador no entiende qué hace cada especial.                                     | Marcadores de forma fija, destello del efecto al activarse y popups con el nombre (`RAYO`, `BOMBA`, `PRISMA`). |
| Dificultad mal calibrada: metas imposibles o triviales sin código de referencia.   | Constantes fijadas en el paso 2; la calibración se hace en una spec posterior, no durante la implementación. |
| Sin jugadas válidas tras un final de nivel con cascadas.                           | `hasValidMove()` en el paso (3) del fin de cascada y `shuffling`; `SHUFFLE_TRIES` y regeneración de reserva. |
| `setTimeout` en las animaciones: `PAUSA` no las congela.                           | Todo por `dt` acumulado en `phaseT`/`bonusT`. Criterio de aceptación explícito.                            |
| Arrastre táctil que hace scroll de la página.                                      | `touch-action: none` desde el motor, restaurado en `destroy()`.                                           |
| Coordenadas de puntero erróneas porque el CSS estira el canvas.                    | `getBoundingClientRect()` y escala `W / rect.width`.                                                      |
| Asignaciones en `draw()` o en la cola de activación bajan los fps con cadenas.     | Todo preasignado (`Int8Array`, `Uint8Array`, pool de popups); se mide con `?fps=1` (SPEC 13).             |
| Doble `onGameOver` o fin de partida durante un cobro de movimientos sobrantes.     | El game over solo se evalúa en el fin de cascada; `levelclear` siempre termina antes; bandera `gameover`. |
| El final de nivel convierte todos los cristales en Rayos y deja el tablero vacío.  | Un Rayo por movimiento sobrante, máximo 15 (no 64); el relleno repuebla el tablero tras la cascada.        |

---

## Lo que **no** entra en esta spec

- Hielo, cristales bloqueados, cajas, cadenas u otros obstáculos.
- Misiones distintas a alcanzar puntos.
- Modos por tiempo, zen o diarios; potenciadores comprables; vidas extra.
- Más tipos de cristal especial.
- Sonido.
- Perfil, rachas o la fila `▸ TU MEJOR MARCA` por cuenta.
- Implementación de ningún tipo: este documento es una propuesta para revisar. Elegirla implica
  promoverla a `specs/NN-*.md` y ejecutarla con `/spec-impl-game` o la skill `nuevo-juego`.

Cada una de ellas, si entra, va en su propia spec.
