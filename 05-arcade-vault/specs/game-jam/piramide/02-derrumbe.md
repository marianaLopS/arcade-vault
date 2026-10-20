# SPEC — PIRÁMIDE: derrumbe

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-20
> **Objetivo:** Diseñar una variante contrarreloj de `piramide`: la misma pirámide isométrica de
> 28 cubos y el mismo salto diagonal, pero **la pirámide se desmorona desde la fila inferior**
> mientras se pinta, un duende revierte los cubos ya pintados, y los puntos premian la velocidad
> y el encadenado — como ficha nueva `piramide` en categoría ARCADE, con motor real y
> leaderboard en Supabase.

---

## Por qué existe esta spec

La variante `01-clasico-isometrico.md` es la lectura fiel del arcade de 1982: tablero estable,
tensión de ruta contra un perseguidor y progresión por modos de color. Esta variante conserva
el salto en diagonal, el tablero y la cobra, pero **cambia el contrato del tablero**: el suelo
no es seguro. Cada pocos segundos la fila más baja tiembla y cae, así que el jugador pasa de
«planificar una ruta» a «planificar una ruta **con fecha de caducidad**», y las filas
desaparecidas son también un arma, porque se llevan consigo a cualquier cobra que esté encima.

El resultado es un juego de ritmo distinto: rondas más cortas (30–60 s), decisión constante
entre pintar rápido abajo (más puntos, más riesgo) o asegurar arriba, y una puntuación que ya
no es «cubos pisados» sino **cubos × combo × cubos que quedan en pie**. No es la variante 01
reescrita: no hay discos, no hay roja, el objetivo de color es siempre un salto, y los enemigos
son otros (la cobra y el duende).

Como con la variante 01, Snake (SPEC 10), `ciempies` y `ranaria`, **no hay código de
referencia**. Las constantes de este documento son el diseño; cambiarlas durante la
implementación es rediseñar, no implementar. Geometría, controles y contrato son los mismos que
en `01-clasico-isometrico.md`, repetidos aquí para que cada archivo sea autosuficiente.

---

## Alcance

**Dentro:**

- `lib/games/piramide/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createPiramideGame`, sin assets externos.
- Mundo lógico de **800×600**. Pirámide de 7 filas (28 cubos) isométrica con vértice en
  `(400, 70)`, salto en diagonal de una pulsación por salto con buffer corto.
- Objetivo único por ronda: pisar **una vez** cada cubo que siga en pie.
- **Derrumbe:** la fila inferior en pie tiembla (aviso) y cae, repetidamente, hasta que solo
  quedan las 3 filas superiores. Un saltarín sobre una fila que cae pierde una vida; una cobra,
  muere.
- **La cobra:** igual que en la variante 01 (bola que eclosiona en la fila inferior y persigue),
  adaptada al tablero que mengua.
- **El duende** (sustituye a la roja): bola verde inofensiva que revierte a su estado inicial
  cualquier cubo en el que aterriza y que el saltarín puede **atrapar** por puntos.
- **Combo:** multiplicador de puntos por cubos nuevos pintados en seguido.
- Bonus de ronda proporcional a los cubos que quedaban en pie al completarla.
- Tres vidas, sin vida extra; partida sin fin hasta perderlas.
- Nueva ficha `piramide` en `lib/games.ts` (categoría `ARCADE`) y clase de portada
  `cover-piramide` en `app/globals.css`.
- Una línea `piramide` en `GAME_ENGINES` (`lib/games/registry.ts`).
- Migración `insert into public.games (id, title) values ('piramide', 'PIRÁMIDE')` y su
  aplicación.

**Fuera de alcance (para specs futuras o para la variante `01-clasico-isometrico.md`):**

- Discos voladores, bolas rojas, modos de color doble o alterna, vida extra.
- Derrumbes por columnas o por bordes, o pirámides distintas de 7 filas.
- Sonido.
- Controles táctiles: el mando virtual de la SPEC 11 no tiene diagonales.
- Skins.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real (la plataforma ya añade
  `user_id` al guardar, SPEC 15).

---

## Modelo de datos

**No se crea ninguna tabla nueva, ni columna, ni tipo de plataforma.** `GameEngineEntry` existe
desde la SPEC 08; `scores` y `game_stats` sirven a este juego sin tocarlas y el leaderboard se
enciende con una fila en `games`.

Tipos locales del motor, sin exportar:

```ts
type Cell = { r: number; c: number }; // r: fila 0..6 (0 = vértice) · c: columna 0..r
type Dir = "ul" | "ur" | "dl" | "dr"; // arriba-izq, arriba-der, abajo-izq, abajo-der
type Hop = { from: Cell; to: Cell; t: number }; // t: 0..1 del salto en curso
type Hero = { cell: Cell; hop: Hop | null; buffered: Dir | null; invulnMs: number };
type Cobra = { cell: Cell; hop: Hop | null; waitMs: number; hatched: boolean };
type Imp = { cell: Cell; hop: Hop | null; waitMs: number }; // el duende
type Collapse = { row: number; phase: "warn" | "fall"; accum: number } | null;
```

Estado en la clausura de `createPiramideGame`:

- `cubes: number[]` — 28 valores (`índice = r*(r+1)/2 + c`): `0` sin pintar, `1` pintado.
- `alive: boolean[]` — 28 flags; `false` = el cubo ya cayó.
- `lowestRow: number` — fila más baja aún en pie (empieza en 6; el derrumbe la reduce hasta 2).
- `collapse: Collapse`, `collapseTimer` (ms hasta empezar el siguiente aviso).
- `hero: Hero`, `cobra: Cobra | null`, `imp: Imp | null`.
- `score`, `lives`, `level`, `streak` (cubos nuevos pintados en seguido), `multiplier`.
- `impSpawnAccum`, `nextImpIn`, `cobraSpawnAccum`, `respawnDelayMs`.
- `state: "playing" | "falling" | "clearing" | "gameover"`, `stateAccum` (ms).
- Bucle: `rafId`, `lastTime`, `destroyed`. Entrada: `keys: Set<string>`.

**Geometría**, mundo lógico 800×600 — cada cubo es un cubo isométrico de tapa 80×40 y lados de
40 px de alto:

```
x(r, c) = 400 + (c - r / 2) * 80      (centro de la tapa)
y(r, c) = 70 + r * 60                 (centro de la tapa)
vecinos de (r, c):  ul = (r-1, c-1) · ur = (r-1, c) · dl = (r+1, c) · dr = (r+1, c+1)
un vecino es válido si 0 <= r' <= lowestRow, 0 <= c' <= r' y alive[idx(r', c')];
si no, saltar allí es caer
```

---

## Plan de implementación

### 1. Constantes y geometría

`lib/games/piramide/engine.ts`, primera parte. Constantes de diseño:

```
W 800 · H 600 · ROWS 7 · CUBE_COUNT 28
CUBE_TOP_W 80 · CUBE_TOP_H 40 · CUBE_SIDE_H 40 · APEX (400, 70) · ROW_STEP_Y 60
HOP_MS 220 · HOP_ARC 28 px · INPUT_BUFFER_MS 100
LIVES_START 3 · RESPAWN_INVULN_MS 1500
POINTS_CUBE 25 (base, antes del multiplicador)
POINTS_IMP_CATCH 300 · POINTS_COBRA_FALL 300
POINTS_CLEAR_PER_CUBE 150 (por cubo aún en pie al completar la ronda)
COMBO_STEP 4 (cubos nuevos en seguido para subir un escalón) · COMBO_MAX 4 (multiplicador ×4)
  multiplicador = min(COMBO_MAX, 1 + floor(streak / COMBO_STEP))
MIN_ROWS 3 (las filas 0, 1 y 2 nunca caen) · DT_MAX 50 ms
```

```
COLLAPSE_FIRST_MS(L) = max(9000, 16000 - (L-1) * 1000)   (desde empezar la ronda hasta el 1.er aviso)
COLLAPSE_STEP_MS(L)  = max(5000,  9000 - (L-1) * 500)    (entre el final de una caída y el siguiente aviso)
COLLAPSE_WARN_MS 1500 (la fila tiembla y parpadea antes de caer) · COLLAPSE_FALL_MS 450 (animación)
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Funciones puras: `idx(r, c)`, `toPx(r, c)`, `neighbor(cell, dir)` (con la regla de validez de
arriba, o `null` = caída), `dist(a, b) = max(|dr|, |dc|, |dr - dc|)`.

Comprobación: `npm run build` limpio con el motor aún sin registrar.

### 2. Cubos y objetivo

- Todos los cubos empiezan en `0` y `alive = true` al empezar cada ronda; `lowestRow = 6`.
- Aterrizar en un cubo en pie con valor `0` lo pasa a `1` y suma `POINTS_CUBE * multiplicador`;
  `streak++`. Aterrizar en uno ya en `1` no cambia nada y **reinicia** `streak = 0`.
- Ronda completa cuando todos los cubos con `alive === true` valen `1`.
- Colores de la tapa: estado 0 `#2a3a7a`, estado 1 `#7dff6a` (verde neón); lados `#14204d`
  (izquierdo) y `#0c1433` (derecho). Una fila en aviso alterna su tapa entre su color y
  `#ff3d3d` cada 120 ms.

Comprobación: `npm run build` limpio; pintar a mano toda la pirámide antes del primer aviso
completa la ronda.

### 3. Saltarín: salto y caída

- `keydown` sobre el canvas mapea tecla → `Dir` (paso 7) y llama `queueHop(dir)`, con las
  mismas reglas que en la variante 01: en el suelo y sin `invulnMs` de bloqueo salta; en los
  últimos `INPUT_BUFFER_MS` de un salto guarda **una** dirección en `buffered`; en otro caso la
  descarta.
- El salto interpola `x`/`y` con `t = elapsed / HOP_MS` y suma el arco `-4 * HOP_ARC * t * (1 -
  t)` a la `y`. El aterrizaje (estados, colisiones, caída) se resuelve cuando `t` llega a 1.
- Destino inválido (`neighbor === null`: fuera de la pirámide o sobre un cubo ya caído): el
  salto se dibuja entero y al terminar `state = "falling"` 900 ms; después `lives--`,
  `onLives(lives)`.
- Si el cubo donde está el saltarín cae (paso 4), pierde la vida con la misma caída, sin
  esperar a un salto.
- Tras la caída, con `lives > 0`: el saltarín reaparece en el vértice con
  `invulnMs = RESPAWN_INVULN_MS`, `cobra` e `imp` se eliminan, `respawnDelayMs = 1500` y
  **el derrumbe se congela** (`collapseTimer` no avanza) mientras dura el retraso. Los cubos
  pintados y los caídos se conservan; `streak = 0`. Con `lives === 0`: `state = "gameover"`,
  se detiene el bucle y `onGameOver(score)` una sola vez.

Comprobación: `npm run build` limpio; saltar a un cubo caído muestra la caída y resta una vida.

### 4. Derrumbe

- `collapseTimer` empieza en `COLLAPSE_FIRST_MS(level)`. Cuando llega a 0 y `lowestRow >
  MIN_ROWS - 1` (es decir, quedan más de 3 filas), empieza `collapse = { row: lowestRow, phase:
  "warn", accum: 0 }`.
- Durante `warn` (`COLLAPSE_WARN_MS`) los cubos de esa fila parpadean y tiemblan ±2 px. Siguen
  siendo pisables y los enemigos los usan con normalidad.
- Al terminar `warn` pasa a `fall` (`COLLAPSE_FALL_MS`): los cubos de la fila bajan y se
  desvanecen. **La lógica es instantánea al empezar `fall`**: `alive = false` para los cubos de
  la fila, `lowestRow--`, y a partir de ese frame saltar a ellos es caer.
- Todo lo que esté **aterrizado** en un cubo de la fila al empezar `fall` cae con él:
  - el saltarín pierde una vida (paso 3), también si está a mitad de un salto cuyo destino es
    un cubo de la fila;
  - la cobra muere y suma `POINTS_COBRA_FALL`; `COBRA_RESPAWN_MS` empieza a contar;
  - el duende desaparece sin puntos.
- Tras `fall`, `collapseTimer = COLLAPSE_STEP_MS(level)`. Con `lowestRow === 2` ya no hay más
  derrumbes: la pirámide se queda en 6 cubos y la ronda continúa hasta completarse.
- Un salto cuyo **destino** deja de existir antes de aterrizar acaba en caída; uno cuyo
  **origen** cae mientras está en el aire no mata al saltarín, que sigue hacia su destino.

Comprobación: `npm run build` limpio; a los 16 s del nivel 1 la fila inferior tiembla 1,5 s y
cae.

### 5. Enemigos: la cobra y el duende

Constantes (por nivel `L`):

```
COBRA_FIRST_MS 5000 (desde empezar la ronda o reaparecer, antes de la primera cobra)
COBRA_HOP_MS(L) = max(260, 460 - (L-1) * 20) · COBRA_EGG_HOP_MS 520
COBRA_RESPAWN_MS 6000 (desde que muere una cobra hasta la siguiente)
IMP_HOP_MS(L) = max(340, 560 - (L-1) * 20)
IMP_SPAWN_MS = aleatorio entre 5000 y 8000 (desde que desaparece uno)
IMP_MAX 1 · COBRA_MAX 1
```

- **La cobra:** igual que en la variante 01. Aparece como bola morada en el vértice, salta al
  azar hacia abajo (`dl`/`dr`, 50 %) y al aterrizar en `lowestRow` eclosiona. Eclosionada, en
  cada salto elige el vecino válido que minimiza `dist` al saltarín; empate al azar; con
  probabilidad **0,15** elige un vecino válido al azar. Aquí no hay discos: no tiene una celda
  trampa a la que seguir, y su única forma de morir es el derrumbe (paso 4).
- Si, al empezar un `warn`, la cobra eclosionada está en la fila que va a caer, **no** huye: sigue
  persiguiendo. Es decisión de diseño — es el modo en que el jugador la mata.
- **El duende:** aparece en el vértice como bola verde con las mismas reglas de salto aleatorio
  hacia abajo que la bola de la cobra. Cada vez que **aterriza** en un cubo con valor `1` lo
  pone a `0` (el jugador pierde ese progreso; si es el cubo del saltarín, no le afecta). Al
  salir por la fila `lowestRow` desaparece.
- **Atrapar al duende:** si el saltarín y el duende coinciden en una celda aterrizados (el que
  llega ocupa la celda del otro), el duende desaparece y suma `POINTS_IMP_CATCH` (sin
  multiplicador de combo; no altera `streak`).
- **Colisión con la cobra:** se evalúa solo cuando alguien aterriza, entre entidades en el suelo
  y en la misma celda. Con `invulnMs === 0`, `state = "falling"` y se resta una vida una sola
  vez. Los saltos que se **cruzan** en el aire no cuentan.
- Con `invulnMs > 0` o `respawnDelayMs > 0` no se generan enemigos nuevos.

Comprobación: `npm run build` limpio; con el motor arrancado a mano, el duende deja cubos en
azul a su paso y la cobra cae cuando se derrumba su fila.

### 6. Combo, rondas y puntuación

- `multiplicador = min(COMBO_MAX, 1 + floor(streak / COMBO_STEP))`: 4 cubos nuevos seguidos →
  ×2, 8 → ×3, 12 → ×4. Un aterrizaje en cubo ya pintado, una caída o ser atrapado por un
  derrumbe reinician `streak`.
- Ronda completa: `state = "clearing"` 1200 ms (cubos parpadeando en verde), suma
  `POINTS_CLEAR_PER_CUBE * cubos en pie` (28 cubos = 4200; 6 cubos = 900), `level++`,
  `onLevel(level)`, nueva pirámide completa, saltarín en el vértice con `invulnMs = 1500`,
  `streak = 0`, `lowestRow = 6`, `collapseTimer = COLLAPSE_FIRST_MS(level)`.
- Sin vida extra: las tres vidas son todo el margen.
- `onLives(LIVES_START)` y `onLevel(1)` al iniciar la partida.
- `restart()`: detiene el bucle, reinicia cubos, `alive`, `lowestRow`, enemigos, `score`,
  `lives`, `level`, `streak`, `state = "playing"`, `emit()` y arranca.

Comprobación: `npm run build` limpio; completar la pirámide entera antes del primer derrumbe da
el bonus máximo.

### 7. Bucle, entrada, dibujo y avisos

- `emit()` con `lastScore` / `lastLives` / `lastLevel`, llamando a los callbacks solo cuando el
  valor cambia.
- **Mapa de teclas:** `ArrowLeft` / `KeyQ` → `ul` · `ArrowUp` / `KeyW` → `ur` · `ArrowDown` /
  `KeyA` → `dl` · `ArrowRight` / `KeyS` → `dr`.
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyQ`, `KeyW`, `KeyA`, `KeyS`.
  `preventDefault()` solo para esas. `keydown` ignora `event.repeat`.
- Orden de dibujo: algoritmo del pintor, filas de arriba abajo y de izquierda a derecha; cada
  entidad justo después de su cubo de destino (la fila mayor entre `from` y `to` si salta).
  Los cubos en `fall` se dibujan **detrás** de todo lo demás, con `alpha` decreciente y la `y`
  bajando 80 px en `COLLAPSE_FALL_MS`.
- **Ni puntos, ni vidas, ni nivel en el canvas.** Sí se permite dentro del canvas, por ser
  estado propio del juego: `RONDA SUPERADA`, `LISTO` y un indicador pequeño del multiplicador
  (`×2`, `×3`, `×4`) junto al saltarín mientras `multiplicador > 1`.
- `dt` en milisegundos capado a `DT_MAX`; `lastTime = null` al reanudar.
- Listeners `keydown` / `blur` sobre el canvas, nunca sobre `window`. `P` y `Escape` no llegan.
  `blur` descarta `buffered`.
- `destroy()` cancela el frame, quita los listeners y es idempotente.
- `initGame(); draw();` antes de devolver el motor.

Comprobación: `getEngine("piramide")` (tras el paso 9) devuelve la entrada y `npm run build`
sigue limpio.

### 8. Catálogo: nueva ficha `piramide`

`lib/games.ts`, nueva entrada en `GAMES`:

```ts
{
  id: "piramide",
  title: "PIRÁMIDE",
  short: "Pinta la pirámide antes de que se derrumbe bajo tus pies.",
  long: "Salta en diagonal por una pirámide de neón y píntala entera, pero el suelo no espera: cada pocos segundos la fila de abajo tiembla y se desploma. Encadena cubos nuevos para multiplicar tus puntos, atrapa al duende verde que borra tu trabajo y deja que la cobra te persiga hasta el borde de un derrumbe.",
  cat: "ARCADE",
  cover: "cover-piramide",
  color: "yellow",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `.cover-piramide` nueva, mismo patrón que las portadas generadas
existentes (rombos con gradientes, sin imagen externa).

Comprobación: `/juegos/piramide` muestra la ficha con su portada antes de registrar el motor
(cae en `.game-arena` con `seededScores()`).

### 9. Registrar el motor

`lib/games/registry.ts`:

```ts
piramide: {
  create: createPiramideGame,
  width: 800,
  height: 600,
  controls: "flechas o QWAS para saltar en diagonal; pinta antes del derrumbe",
},
```

Sin `touch` en esta spec.

Comprobación: `/jugar/piramide` pinta el canvas real en vez de `.game-arena`.

### 10. Leaderboard

`supabase/migrations/<timestamp>_juego_piramide.sql`, con timestamp posterior al de la última
migración existente:

```sql
insert into public.games (id, title) values ('piramide', 'PIRÁMIDE');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. Los tipos no se
regeneran.

Comprobación: `select * from public.games` incluye la fila `piramide`.

### 11. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos y el recorrido manual
de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/piramide` muestra un canvas de 800×600 con una pirámide isométrica de 28 cubos, no
      la `.game-arena`.
- [ ] El saltarín empieza en el vértice y no se mueve hasta pulsar una dirección.
- [ ] Las flechas y `QWAS` saltan en las cuatro diagonales según el mapa del paso 7; mantener la
      tecla no encadena saltos.
- [ ] Aterrizar en un cubo azul lo vuelve verde y suma 25 puntos en el HUD; pisarlo otra vez no
      suma nada.
- [ ] Pintar 4 cubos nuevos seguidos sube el multiplicador a ×2 (el indicador `×2` aparece junto
      al saltarín) y el quinto suma 50; pisar un cubo ya verde lo devuelve a ×1.
- [ ] A los 16 s de la partida (nivel 1), la fila inferior tiembla y parpadea en rojo 1,5 s y
      después cae; durante ese aviso aún se puede pisar.
- [ ] Estar aterrizado en un cubo de la fila que cae cuesta una vida; saltar a un cubo ya caído
      también.
- [ ] Un salto cuyo origen cae mientras está en el aire no mata al saltarín.
- [ ] Tras la caída de la fila 6 empieza a contar el siguiente aviso y, con 3 filas en pie
      (`lowestRow === 2`), no cae ninguna más.
- [ ] La cobra aparece como bola morada, eclosiona al llegar a `lowestRow` y se acerca al
      saltarín; si cae con su fila suma 300 puntos y no reaparece hasta 6 s después.
- [ ] El duende aparece en el vértice, nunca hay más de uno, y los cubos verdes en los que
      aterriza vuelven a azul.
- [ ] Aterrizar en la celda del duende (o que él aterrice en la tuya) lo elimina y suma 300
      puntos sin cambiar el multiplicador.
- [ ] Tocar a la cobra aterrizados en la misma celda cuesta una vida; cruzarse en el aire no.
- [ ] Completar la ronda con 28 cubos en pie suma 4200 puntos de bonus; con 6 en pie, 900.
- [ ] Completar la ronda muestra `RONDA SUPERADA`, sube el nivel en el HUD y repone la pirámide
      completa con el primer derrumbe más cercano que en el nivel anterior (15 s en el nivel 2).
- [ ] Tras perder una vida, el saltarín reaparece en el vértice intocable 1,5 s, el derrumbe se
      congela durante ese retraso y los cubos pintados y caídos se conservan.
- [ ] El HUD muestra 3 vidas desde el inicio y nunca se concede vida extra.
- [ ] Perder la última vida abre el modal `FIN DEL JUEGO` con la puntuación real.
- [ ] El canvas no dibuja puntos, nivel ni vidas, ni overlay de game over; solo los rótulos
      `RONDA SUPERADA`, `LISTO` y el indicador de multiplicador.
- [ ] `JUGAR DE NUEVO` reinicia pirámide, derrumbe, enemigos, puntuación, vidas y nivel sin
      recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'piramide'`.
- [ ] Esa puntuación aparece en `/salon?juego=piramide` y en `/juegos/piramide` sin recargar a
      mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Con `scores` vacía para este juego, `/salon?juego=piramide` muestra el estado vacío.
- [ ] El botón `PAUSA` congela el juego (incluido el temporizador del derrumbe y un salto en el
      aire) y `REANUDAR` lo reanuda sin saltos bruscos.
- [ ] `P` y `Escape` hacen lo mismo que el botón y el motor no los interpreta como jugada.
- [ ] Con el canvas enfocado, las flechas no hacen scroll de la página.
- [ ] Escribir `Q`, `W`, `A` o `S` en el campo de iniciales no mueve ni reinicia el juego.
- [ ] Navegar de `/jugar/piramide` a `/biblioteca` y volver no duplica el bucle.
- [ ] Dejar la pestaña en segundo plano y volver no adelanta el derrumbe ni hace saltar a los
      enemigos varias veces de golpe.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid`, `/jugar/snake` y `/jugar/frogger`
      se juegan igual que antes.
- [ ] `lib/games.ts` mantiene sin tocar las fichas de los demás juegos.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/piramide`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** mismo tablero, mismo mapa de teclas y mismo contrato que `01-clasico-isometrico.md`.
  Lo que cambia es el contrato del suelo, no el salto; así las dos variantes se comparan en lo
  único que difieren.
- **Sí:** el derrumbe empieza por la fila **inferior** y se detiene en 3 filas. Empezar por
  arriba aislaría el vértice sin salida; parar en 3 filas evita que la ronda acabe en un
  tablero de 1 cubo.
- **Sí:** fila en aviso 1,5 s antes de caer, todavía pisable. El aviso convierte el derrumbe en
  una decisión (quedarse a pintar un cubo más o subir), no en una muerte aleatoria.
- **Sí:** el derrumbe mata a la cobra y es la **única** forma de matarla. Sin discos, el
  jugador necesita una herramienta contra el perseguidor, y es la misma que le amenaza a él.
- **No:** discos voladores ni bolas rojas. Son de la variante 01; aquí el peligro viene del
  tablero y de la cobra.
- **Sí:** el duende revierte cubos pero no mata. Castiga el progreso, no la vida, y da una
  segunda razón para perseguir: atraparlo vale 300 puntos.
- **Sí:** combo ×4 con escalones de 4 cubos. Es lo que recompensa pintar rápido y arriesgar
  filas inferiores; con escalones de 1 la puntuación se dispararía, con 8 casi nunca se vería.
- **Sí:** bonus de ronda proporcional a los cubos que siguen en pie. Es lo que hace valer
  terminar **antes** del derrumbe, no solo terminar.
- **Sí:** objetivo de color siempre de un salto. La dificultad ya llega del tiempo, así que los
  modos doble y alterna de la variante 01 sobrarían.
- **Sí:** sin vida extra. Con derrumbes y un duende que borra progreso, el margen de error ya
  es amplio; una cuarta vida lo alargaría sin aportar tensión.
- **Sí:** el derrumbe se congela tras perder una vida. Reaparecer con el suelo cayendo sería una
  muerte encadenada.
- **No:** controles táctiles. El mando virtual no tiene diagonales; necesita su propia spec.
- **No:** sembrar puntuaciones en `scores`.
- **No:** skins; una capa independiente que se puede añadir después con `skin-designer`.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El derrumbe se siente injusto si cae una fila con el saltarín a mitad de un salto. | Regla fija en el paso 4: lo que cuenta es dónde **aterriza**; un origen que cae no mata, un destino que ya no existe sí, y el aviso de 1,5 s permite anticiparlo. |
| El combo crea una ventaja desproporcionada que dispara las puntuaciones y distorsiona el ranking. | `COMBO_MAX 4` y escalones de 4 cubos acotan el multiplicador; el bonus de ronda domina en una partida promedio. |
| La cobra es un perseguidor demasiado fuerte en un tablero que mengua y sin discos. | Su única amenaza real es la persecución por distancia, con 15 % de ruido y la fila inferior cayendo bajo ella; `COBRA_RESPAWN_MS 6000` da respiro tras matarla. |
| El duende revierte el último cubo necesario y la ronda parece que no acaba nunca. | Solo aparece uno a la vez, cada 5–8 s, y se puede atrapar (+300); si el jugador lo ignora, el derrumbe le quita el problema. |
| Tras el último derrumbe (`lowestRow === 2`) quedan solo 6 cubos y la ronda puede quedarse sin tensión. | Cobra y duende siguen activos en esas tres filas; además el bonus de 150 por cubo baja a 900, así que no merece la pena esperar. |
| El temporizador del derrumbe avanza con la pestaña oculta o durante la pausa. | `dt` capado a 50 ms, `lastTime = null` al reanudar y `collapseTimer` descontando solo `dt` real del bucle. |
| El orden de dibujo de los cubos en caída tapa a las entidades vivas. | Los cubos en `fall` se dibujan detrás de todo y con `alpha` decreciente (paso 7). |
| Sin referencia, las constantes se ajustan «a ojo» durante la implementación. | El paso 1 las fija y las declara fuera de alcance. |
| Escribir en el campo de iniciales mueve al saltarín (`QWAS` son letras). | Bucle parado con el modal abierto y listeners en el canvas, no en `window`. |

---

## Lo que **no** entra en esta spec

- Discos voladores, bolas rojas y modos de color doble o alterna (`01-clasico-isometrico.md`).
- Sonido.
- Controles táctiles.
- Skins.
- Derrumbes por columnas o por bordes, pirámides distintas de 7 filas.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
