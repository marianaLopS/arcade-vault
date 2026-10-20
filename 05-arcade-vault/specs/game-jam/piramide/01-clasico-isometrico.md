# SPEC — PIRÁMIDE: clásico isométrico

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-20
> **Objetivo:** Diseñar un port fiel al Q*bert de 1982 — un saltarín que recorre en diagonal una
> pirámide isométrica de 28 cubos cambiándoles el color, esquivando bolas rojas y una serpiente
> que lo persigue, y escapando por discos voladores — como ficha nueva `piramide` en categoría
> ARCADE, con motor real y leaderboard en Supabase desde el primer día.

---

## Por qué existe esta spec

Ninguno de los juegos del catálogo tiene movimiento **discreto en diagonal** ni una vista
**isométrica**: Asteroids, Arkanoid, Snake y Frogger son cenitales o laterales planos, y las
maquetas (`gloton`, `invasores`, `duelo-pixel`) también. Q*bert aporta además un tipo de
habilidad que no existe en el catálogo: no hay proyectiles, ni gravedad, ni colisión por
solapamiento; el reto es **planificar una ruta** sobre un tablero de 28 casillas mientras un
perseguidor calcula la suya. Eso lo hace distinto de Snake (que también planifica rutas, pero
sin enemigos que reaccionen ni terreno que cambie) y de Frogger (cruce sin estado persistente).

Como con Snake (SPEC 10), `ciempies` y `ranaria`, **no hay código de referencia**: no existe
ninguna carpeta `References/.../qbert` en el repositorio, solo la mención en
`game-suggestions-todo.md`. Las constantes de este documento **son** el diseño, no el ajuste de
un port; cambiarlas durante la implementación es rediseñar, no implementar. El motor dibuja todo
con primitivas de canvas (polígonos y arcos): no hay spritesheet que portar, y los cubos
isométricos son tres rombos/paralelogramos por cubo.

Para no usar la marca del original, el juego se llama `piramide` (título `PIRÁMIDE`), el
protagonista es «el saltarín» y los enemigos son «la roja» y «la cobra». La mecánica es la del
arcade de 1982.

Esta variante es la lectura **fiel y mínima**: un solo cubo-objetivo por ronda al principio,
bolas rojas, cobra y discos de escape, con la progresión clásica de colores por nivel. La segunda
variante (`02-derrumbe.md`) cambia el contrato del tablero: la pirámide se desmorona desde abajo
con el tiempo y los puntos premian la velocidad.

---

## Alcance

**Dentro:**

- `lib/games/piramide/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createPiramideGame`, sin assets externos.
- Mundo lógico de **800×600**. Pirámide de 7 filas (28 cubos) proyectada en isométrica, con
  vértice en `(400, 70)`.
- Salto en diagonal entre cubos vecinos con arco parabólico y entrada de una sola pulsación por
  salto (con un buffer corto).
- Cubos que cambian de estado al aterrizar; el objetivo depende del nivel (un salto, dos saltos,
  o alternancia).
- Enemigos: **la roja** (bola que cae en zigzag aleatorio, mata al contacto) y **la cobra**
  (aparece como bola, al llegar a la fila inferior se transforma y persigue al jugador).
- **Discos de escape**: dos, uno a cada lado, que llevan al jugador de vuelta al vértice y
  eliminan a la cobra si esta salta tras él.
- Caer fuera de la pirámide cuesta una vida; tres vidas; vida extra a los 8000 puntos.
- Ronda completa cuando todos los cubos están en estado objetivo: bonus y siguiente nivel.
- Nueva ficha `piramide` en `lib/games.ts` (categoría `ARCADE`) y clase de portada
  `cover-piramide` en `app/globals.css`.
- Una línea `piramide` en `GAME_ENGINES` (`lib/games/registry.ts`).
- Migración `insert into public.games (id, title) values ('piramide', 'PIRÁMIDE')` y su
  aplicación.

**Fuera de alcance (para specs futuras o para la variante `02-derrumbe.md`):**

- Pirámide que se desmorona, duendes que revierten cubos y multiplicador de combo.
- Otras formas de tablero (hexágono, escalera) o niveles de patrón distinto.
- Sonido.
- Controles táctiles: el mando virtual de la SPEC 11 no tiene diagonales, así que necesita su
  propio diseño de entrada.
- Skins (`clasico`/`neon`/`retro`).
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real (la plataforma ya añade
  `user_id` al guardar, SPEC 15; el motor no interviene).

---

## Modelo de datos

**No se crea ninguna tabla nueva, ni columna, ni tipo de plataforma.** `GameEngineEntry` existe
desde la SPEC 08, `scores` y `game_stats` sirven a este juego sin tocarlas y el leaderboard se
enciende con una fila en `games`.

Tipos locales del motor, sin exportar:

```ts
type Cell = { r: number; c: number }; // r: fila 0..6 (0 = vértice) · c: columna 0..r
type Hop = { from: Cell; to: Cell; t: number }; // t: 0..1 de avance del salto en curso
type Hero = { cell: Cell; hop: Hop | null; buffered: Dir | null; invulnMs: number };
type Dir = "ul" | "ur" | "dl" | "dr"; // arriba-izq, arriba-der, abajo-izq, abajo-der
type Red = { cell: Cell; hop: Hop | null; waitMs: number };
type Cobra = {
  cell: Cell;
  hop: Hop | null;
  waitMs: number;
  hatched: boolean; // false = bola morada; true = cobra que persigue
};
type Disc = { side: "left" | "right"; used: boolean };
type Ride = { disc: Disc; t: number } | null; // viaje del jugador sobre un disco
```

Estado en la clausura de `createPiramideGame`:

- `cubes: number[]` — 28 estados (`índice = r*(r+1)/2 + c`), valores `0..2`.
- `hero: Hero`, `reds: Red[]` (máx. 2), `cobra: Cobra | null`, `discs: Disc[]`, `ride: Ride`.
- `score`, `lives`, `level`, `extraLifeGiven`.
- `redSpawnAccum`, `nextRedIn`, `cobraSpawnAccum`, `respawnDelayMs`.
- `state: "playing" | "falling" | "clearing" | "gameover"`, `stateAccum` (ms del estado
  transitorio).
- Bucle: `rafId`, `lastTime`, `destroyed`. Entrada: `keys: Set<string>` (solo para evitar
  repetición de tecla: los saltos se disparan en `keydown`).

**Geometría**, mundo lógico 800×600 — cada cubo es un cubo isométrico de tapa 80×40 y lados de
40 px de alto:

```
x(r, c) = 400 + (c - r / 2) * 80      (centro de la tapa)
y(r, c) = 70 + r * 60                 (centro de la tapa)
vecinos de (r, c):  ul = (r-1, c-1) · ur = (r-1, c) · dl = (r+1, c) · dr = (r+1, c+1)
un vecino es válido si 0 <= r' <= 6 y 0 <= c' <= r'; si no, saltar allí es caer
```

---

## Plan de implementación

### 1. Constantes y geometría

`lib/games/piramide/engine.ts`, primera parte. Constantes de diseño:

```
W 800 · H 600 · ROWS 7 · CUBE_COUNT 28
CUBE_TOP_W 80 · CUBE_TOP_H 40 · CUBE_SIDE_H 40 · APEX (400, 70) · ROW_STEP_Y 60
HOP_MS 220 · HOP_ARC 28 px (altura máxima del arco) · INPUT_BUFFER_MS 100
LIVES_START 3 · EXTRA_LIFE_AT 8000 (una sola vez)
DISC_LEFT = celda virtual (2, -1) → (240, 190) · DISC_RIGHT = celda virtual (2, 3) → (560, 190)
DISC_RIDE_MS 1100 (del disco al vértice, trayectoria en curva suave)
POINTS_CUBE 25 · POINTS_DISC_KILL 500 · BONUS_ROUND_BASE 1000 · BONUS_ROUND_PER_LEVEL 250
BONUS_DISC_UNUSED 200 (por disco sin usar al completar la ronda)
DT_MAX 50 ms
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Funciones puras: `idx(r, c)`, `toPx(r, c)` (`x`/`y` de la fórmula del modelo de datos),
`neighbor(cell, dir)` (devuelve `Cell | null`, donde `null` significa caída o disco),
`isDiscCell(cell)`.

Comprobación: `npm run build` limpio con el motor aún sin registrar.

### 2. Cubos: estados y niveles

```
modo(level): level 1–2 → "simple" (objetivo 1) · 3–4 → "doble" (objetivo 2) · >= 5 → "alterna" (objetivo 1)
```

- Todos los cubos empiezan en estado `0` al empezar cada ronda.
- **simple:** aterrizar en un cubo `0` lo pasa a `1` y suma `POINTS_CUBE`; en uno `1`, no cambia.
- **doble:** aterrizar en `0` → `1` (+25); en `1` → `2` (+25); en `2` no cambia.
- **alterna:** aterrizar en `0` → `1` (+25); aterrizar en un cubo `1` lo devuelve a `0` (sin
  puntos).
- Ronda completa cuando todos los cubos valen el objetivo del modo.
- Colores de la tapa: estado 0 `#2a3a7a` (azul oscuro), estado 1 `#ffd23f` (amarillo neón),
  estado 2 `#ff3da8` (magenta neón); lados `#14204d` (izquierdo) y `#0c1433` (derecho) en los
  tres estados, para que solo la tapa informe del estado.

Comprobación: `npm run build` limpio; recorrer a mano 28 cubos en modo simple completa la ronda.

### 3. Saltarín: salto y caída

- `keydown` sobre el canvas mapea una tecla a una `Dir` (ver paso 7) y llama `queueHop(dir)`.
- `queueHop`: si el saltarín está en el suelo y no hay `ride`, empieza el salto; si está en
  mitad de un salto y le quedan menos de `INPUT_BUFFER_MS` de salto, guarda la dirección en
  `buffered` (una sola); en cualquier otro caso la descarta.
- El salto interpola `x`/`y` entre el origen y el destino con `t = elapsed / HOP_MS` y suma un
  arco `-4 * HOP_ARC * t * (1 - t)` a la `y`. La lógica de aterrizaje se ejecuta cuando `t`
  llega a 1, no al empezar el salto.
- Destino fuera de la pirámide (`neighbor === null`): el salto se dibuja entero hacia fuera y al
  terminar `state = "falling"` durante 900 ms (el saltarín cae por delante y se desvanece).
  Termina con `lives--`, `onLives(lives)`.
- Destino = `DISC_LEFT` o `DISC_RIGHT` y el disco no está `used`: empieza `ride` (paso 5).
  Cualquier otro destino fuera es caída.
- Aterrizar en una celda válida aplica la regla de estados del paso 2 y comprueba
  colisión con enemigos (paso 4).
- Tras la caída, si `lives > 0`: el saltarín reaparece en el vértice con
  `invulnMs = 1500`, `reds` y `cobra` se eliminan, se retrasa el siguiente spawn con
  `respawnDelayMs = 1500` y los cubos **conservan** su estado. Si `lives === 0`:
  `state = "gameover"`, se detiene el bucle y se llama `onGameOver(score)` una sola vez.

Comprobación: `npm run build` limpio; saltar fuera del borde izquierdo muestra la caída y resta
una vida.

### 4. Enemigos: la roja y la cobra

Constantes (por nivel `L`):

```
RED_HOP_MS(L) = max(320, 540 - (L-1) * 20)    (pausa entre saltos de la roja, aterrizada)
RED_SPAWN_MS(L) = aleatorio entre max(1500, 3500 - (L-1) * 200) y esa cifra + 1500
RED_MAX 2
COBRA_FIRST_MS 6000 (desde empezar la ronda o reaparecer, antes de la primera cobra)
COBRA_HOP_MS(L) = max(260, 460 - (L-1) * 20)  (pausa entre saltos de la cobra eclosionada)
COBRA_EGG_HOP_MS 520 (pausa entre saltos mientras es bola, no depende del nivel)
COBRA_RESPAWN_MS 4000 (desde que desaparece una cobra hasta la siguiente)
ENEMY_HOP_MS = HOP_MS (mismo arco que el saltarín)
```

- **La roja:** aparece en el vértice. Cada salto elige al azar `dl` o `dr` con 50 % de
  probabilidad. Al saltar fuera desde la fila 6 se elimina sin puntos. No cambia el color de los
  cubos.
- **La cobra:** aparece como bola morada en el vértice con la misma regla de salto aleatorio
  hacia abajo que la roja, con `COBRA_EGG_HOP_MS`. Al aterrizar en la fila 6 eclosiona
  (`hatched = true`, se dibuja la serpiente) y desde entonces, en cada salto:
  1. Calcula, de sus cuatro vecinos válidos, el que minimiza la distancia al saltarín
     (`dist` = número mínimo de saltos entre dos celdas de la pirámide, que en este tablero es
     `max(|dr|, |dc|, |dr - dc|)`, con `dr = r2 - r1` y `dc = c2 - c1`).
  2. En empate elige al azar entre los empatados. Con probabilidad **0,15** elige un vecino
     válido al azar para no ser perfectamente predecible.
  3. Nunca salta fuera por su cuenta mientras haya vecino válido, **salvo** el caso del disco
     (paso 5).
- Si el saltarín está en un `ride`, la cobra persigue hacia la celda del disco usado (la celda
  virtual `DISC_LEFT`/`DISC_RIGHT`): si en ese momento es vecina de ella, salta y cae (muere).
- **Colisión:** se evalúa solo cuando alguien aterriza, y solo entre entidades en el suelo en
  la misma celda. Si coinciden un enemigo y el saltarín con `invulnMs === 0`: `state =
  "falling"` (misma caída, mismo coste, con sprite de choque) — no se resta vida dos veces.
  Dos saltos que se **cruzan** en el aire (A→B mientras el otro B→A) no cuentan como colisión.
- Una roja y la cobra se ignoran entre sí; pueden compartir celda.
- Con `invulnMs > 0` los enemigos no matan y no se generan nuevos.

Comprobación: `npm run build` limpio; con el motor arrancado a mano, la roja baja en zigzag y la
cobra eclosionada reduce la distancia al saltarín en cada salto.

### 5. Discos de escape

- Dos discos, `left` y `right`, visibles desde el inicio de cada ronda, dibujados como elipses
  planas giratorias (3 colores alternos cada 120 ms) en las celdas virtuales `DISC_LEFT` /
  `DISC_RIGHT`. Solo son alcanzables saltando desde `(3, 0)` con `ul` hacia el izquierdo y desde
  `(3, 3)` con `ur` hacia el derecho, **no** desde otros cubos de borde (desde ahí es caída).
- Al subir: `ride` empieza, el saltarín sigue el disco `DISC_RIDE_MS` hasta el vértice con una
  curva Bézier cuadrática de punto de control `(400, 20)`, y el disco queda `used = true` y
  desaparece. Mientras `ride`, el saltarín no acepta entradas, es intocable, y los enemigos
  siguen moviéndose.
- Al llegar al vértice (`(0, 0)`), el saltarín queda en el suelo en esa celda con
  `invulnMs = 500` y se aplica la regla de estado del paso 2 a ese cubo. Si había un enemigo
  aterrizado en el vértice, se ignora por la invulnerabilidad.
- Una cobra que salta a la celda virtual del disco usado cae y suma `POINTS_DISC_KILL`; la cobra
  se elimina y `COBRA_RESPAWN_MS` empieza a contar.
- Al completar la ronda con discos sin usar, cada uno suma `BONUS_DISC_UNUSED`.

Comprobación: `npm run build` limpio; subir al disco izquierdo lleva al vértice y lo consume.

### 6. Rondas, vidas y fin de partida

- Ronda completa (paso 2): `state = "clearing"` durante 1200 ms (los cubos parpadean entre sus
  colores), `reds`, `cobra` desaparecen, suma `BONUS_ROUND_BASE + BONUS_ROUND_PER_LEVEL *
  (level - 1)` más el bonus de discos sin usar, `level++`, `onLevel(level)`, nueva pirámide con
  discos nuevos y el saltarín en el vértice con `invulnMs = 1500`.
- Vida extra a `score >= EXTRA_LIFE_AT`, una sola vez: `lives++`, `onLives(lives)`, tope en 5.
- `onLives(LIVES_START)` y `onLevel(1)` al iniciar la partida.
- `restart()`: detiene el bucle, reinicia cubos, enemigos, discos, `score`, `lives`, `level`,
  `extraLifeGiven`, `state = "playing"`, `emit()` y arranca.

Comprobación: `npm run build` limpio; completar una ronda sube el nivel en el HUD y a nivel 3
cada cubo pide dos saltos.

### 7. Bucle, entrada, dibujo y avisos

- `emit()` con `lastScore` / `lastLives` / `lastLevel`, llamando a los callbacks solo cuando el
  valor cambia.
- **Mapa de teclas** (la diagonal se lee con la geometría visual de la pirámide):
  `ArrowLeft` / `KeyQ` → `ul` · `ArrowUp` / `KeyW` → `ur` · `ArrowDown` / `KeyA` → `dl` ·
  `ArrowRight` / `KeyS` → `dr`.
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyQ`, `KeyW`, `KeyA`, `KeyS`.
  `preventDefault()` solo para esas.
- `keydown` ignora `event.repeat`: mantener la tecla no encadena saltos; cada salto es una
  pulsación.
- Orden de dibujo (algoritmo del pintor): por filas de arriba abajo, dentro de cada fila de
  izquierda a derecha; cada entidad se dibuja justo después de su cubo de destino (si está
  saltando, el de la fila mayor entre `from` y `to`), y los discos antes de todo. Sombra elíptica
  bajo cada entidad en el suelo.
- Fondo negro con el degradado oscuro del resto de juegos; **ni puntos, ni vidas, ni nivel en el
  canvas**. Mientras `state === "clearing"` se permite el rótulo `RONDA SUPERADA` y al reaparecer
  `LISTO` 800 ms, porque son estados propios del juego.
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
  short: "Salta por la pirámide y pinta cada cubo sin caer.",
  long: "Un saltarín de nariz larga recorre en diagonal una pirámide de neón: cada cubo que pisa cambia de color y solo hay una forma de terminar la ronda, pisarlos todos. Esquiva las bolas rojas, escapa de la cobra con los discos voladores y no te despistes: un salto mal medido y caes al vacío.",
  cat: "ARCADE",
  cover: "cover-piramide",
  color: "yellow",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `.cover-piramide` nueva, mismo patrón que las portadas generadas
existentes (gradientes cónicos y lineales que forman rombos, sin imagen externa).

Comprobación: `/juegos/piramide` muestra la ficha con su portada antes de registrar el motor
(cae en `.game-arena` con `seededScores()`).

### 9. Registrar el motor

`lib/games/registry.ts`:

```ts
piramide: {
  create: createPiramideGame,
  width: 800,
  height: 600,
  controls: "flechas o QWAS para saltar en diagonal por la pirámide",
},
```

Sin `touch` en esta spec (ver «Fuera de alcance»).

Comprobación: `/jugar/piramide` pinta el canvas real en vez de `.game-arena`.

### 10. Leaderboard

`supabase/migrations/<timestamp>_juego_piramide.sql`, con timestamp posterior al de la última
migración existente:

```sql
insert into public.games (id, title) values ('piramide', 'PIRÁMIDE');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. Los tipos no se
regeneran: insertar una fila no cambia el esquema.

Comprobación: `select * from public.games` incluye la fila `piramide`.

### 11. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido
manual de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/piramide` muestra un canvas de 800×600 con una pirámide isométrica de 28 cubos, no
      la `.game-arena`.
- [ ] El saltarín empieza en el vértice y no se mueve hasta pulsar una dirección.
- [ ] Las flechas y `QWAS` saltan en las cuatro diagonales según el mapa del paso 7; cada
      pulsación es un salto y mantener la tecla no encadena saltos.
- [ ] Aterrizar en un cubo azul lo vuelve amarillo y suma 25 puntos en el HUD; pisarlo otra vez
      no suma nada (niveles 1 y 2).
- [ ] Una pulsación hecha durante los últimos 100 ms de un salto se ejecuta justo al aterrizar;
      una hecha antes se descarta.
- [ ] Saltar fuera del borde de la pirámide muestra la caída, resta una vida en el HUD y el
      saltarín reaparece en el vértice, intocable 1,5 s, con los cubos como estaban.
- [ ] Una roja aparece en el vértice cada pocos segundos, baja en zigzag, y nunca hay más de dos
      a la vez.
- [ ] Aterrizar en la celda de una roja (o que una roja aterrice en la tuya) cuesta una vida;
      cruzarse con ella en el aire no.
- [ ] La cobra aparece como bola morada, eclosiona al llegar a la fila inferior y desde entonces
      se acerca al saltarín en cada salto.
- [ ] Subir al disco izquierdo desde `(3, 0)` con `ul` lleva al vértice en ~1,1 s, consume el
      disco, y el saltarín es intocable mientras viaja.
- [ ] Una cobra vecina del disco usado salta tras el saltarín, cae y suma 500 puntos.
- [ ] Desde un cubo de borde distinto de `(3, 0)` / `(3, 3)`, saltar hacia fuera es caída, no
      disco.
- [ ] Completar los 28 cubos muestra `RONDA SUPERADA`, suma el bonus de ronda más 200 por disco
      sin usar, y sube el nivel en el HUD.
- [ ] En el nivel 3 cada cubo necesita dos saltos (azul → amarillo → magenta); en el 5 pisar un
      cubo ya amarillo lo devuelve a azul.
- [ ] A los 8000 puntos el HUD suma una vida, una sola vez por partida (tope 5).
- [ ] El HUD muestra 3 vidas desde el inicio.
- [ ] Perder la última vida abre el modal `FIN DEL JUEGO` con la puntuación real.
- [ ] El canvas no dibuja puntos, nivel ni vidas, ni overlay de game over; solo los rótulos
      `RONDA SUPERADA` y `LISTO`.
- [ ] `JUGAR DE NUEVO` reinicia pirámide, enemigos, puntuación, vidas y nivel sin recargar la
      página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'piramide'`.
- [ ] Esa puntuación aparece en `/salon?juego=piramide` y en `/juegos/piramide` sin recargar a
      mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Con `scores` vacía para este juego, `/salon?juego=piramide` muestra el estado vacío.
- [ ] El botón `PAUSA` congela el juego (incluido un salto en el aire) y `REANUDAR` lo reanuda
      sin que ninguna entidad dé un salto brusco.
- [ ] `P` y `Escape` hacen lo mismo que el botón y el motor no los interpreta como jugada.
- [ ] Con el canvas enfocado, las flechas no hacen scroll de la página.
- [ ] Escribir `Q`, `W`, `A` o `S` en el campo de iniciales no mueve ni reinicia el juego.
- [ ] Navegar de `/jugar/piramide` a `/biblioteca` y volver no duplica el bucle.
- [ ] Dejar la pestaña en segundo plano y volver no hace avanzar a los enemigos varios saltos de
      golpe.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid`, `/jugar/snake` y `/jugar/frogger`
      se juegan igual que antes.
- [ ] `lib/games.ts` mantiene sin tocar las fichas de los demás juegos.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/piramide`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** nombre `piramide` / `PIRÁMIDE`, protagonista y enemigos sin nombre de marca. La
  mecánica es la del arcade de 1982; la marca no.
- **Sí:** mundo 800×600, mismo marco 4/3 que Asteroids, Arkanoid y Snake. La pirámide de siete
  filas cabe holgada sin escalar el canvas.
- **Sí:** isométrica dibujada con polígonos y el algoritmo del pintor. Es la única forma sin
  assets y mantiene el contrato `GameEngine` tal cual: un canvas, sin overlays de React.
- **Sí:** 7 filas, 28 cubos, como el original. Menos filas harían la ronda trivial; más no
  cabrían en 600 px sin encoger los cubos.
- **Sí:** el salto se lógica-aterriza al final del arco, no al empezar. Es lo que hace posible el
  cruce en el aire sin colisión y que la roja «pase por debajo» de un salto.
- **Sí:** un salto por pulsación, sin autorrepetición, y un buffer de 100 ms. Sin esto las
  pulsaciones largas despeñan al jugador y las muy tempranas se pierden.
- **No:** colisión en el aire entre saltos que se cruzan. Es la regla del original y evita
  muertes que el jugador percibe como injustas.
- **Sí:** niveles con tres modos de color (simple, doble, alterna) en vez de una escala de
  dificultad solo por velocidad. Es la progresión reconocible del género y el motivo por el que
  la ronda 5 se siente distinta de la 1.
- **Sí:** cobra con 15 % de ruido en su elección. Persigue de verdad pero no es una IA perfecta
  que haga el juego imposible a niveles altos.
- **Sí:** los discos solo se alcanzan desde `(3, 0)` y `(3, 3)`. Es el comportamiento original
  (un disco por lado, a media altura) y limita la fuga a una decisión de posición, no a un
  botón de pánico.
- **Sí:** los cubos conservan su estado al perder una vida. Perder una vida duele por la
  posición y el tiempo, no por rehacer lo pintado.
- **No:** duendes que revierten cubos, desmoronamiento ni combo en esta variante. Son la capa
  de `02-derrumbe.md`; incluirlos aquí duplicaría esa spec en vez de ofrecer una alternativa.
- **No:** controles táctiles. El mando virtual no tiene diagonales; una versión móvil necesita
  su propia spec (cuatro botones diagonales o swipe).
- **No:** sembrar puntuaciones en `scores`.
- **No:** skins. La paleta de estados de cubo es parte de la lectura del juego; una capa de
  skins puede añadirse después con `skin-designer`.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El mapa de teclas diagonal es poco intuitivo: el jugador espera que `ArrowUp` suba recto. | Se fija en el paso 7 con la lectura visual (`ArrowUp` = arriba-derecha) y se muestra en el texto `controls`; se verifica jugando que las cuatro direcciones corresponden a su flecha dibujada. |
| La ordenación de dibujo isométrica (algoritmo del pintor) hace que un enemigo en mitad de un salto se vea por detrás de un cubo que debería quedar por delante. | La regla de dibujar tras el cubo de **destino** de fila mayor está fijada en el paso 7; se verifica con saltos hacia abajo y hacia arriba. |
| La cobra, al perseguir por distancia mínima, se queda oscilando entre dos celdas si el jugador no se mueve. | En cada salto debe elegir un vecino que reduzca la distancia; si ya está adyacente, salta sobre el jugador (colisión). El ruido del 15 % rompe empates de oscilación. |
| La cobra que persigue al saltarín montado en disco no tiene una celda válida que elegir y se bloquea. | Paso 4: durante `ride` persigue la celda virtual del disco; si no es vecina, sigue acercándose por distancia. Nunca se queda sin movimiento. |
| El `dt` grande al volver de una pestaña en segundo plano dispara varios saltos de enemigos. | `dt` capado a 50 ms y `lastTime = null` al reanudar; cada entidad lleva su propio `waitMs` y salta como mucho una vez por frame. |
| `RED_SPAWN_MS` y `COBRA_FIRST_MS` hacen que el vértice esté ocupado al reaparecer y mate al saltarín al instante. | `invulnMs` de 1500 ms al reaparecer, sin spawns durante `respawnDelayMs`, y los enemigos se eliminan en cada muerte. |
| Sin referencia, las constantes se ajustan «a ojo» durante la implementación. | El paso 1 las fija y las declara fuera de alcance. |
| Escribir en el campo de iniciales mueve al saltarín (`QWAS` son letras). | Bucle parado con el modal abierto y listeners en el canvas, no en `window`. |

---

## Lo que **no** entra en esta spec

- Pirámide que se desmorona, duendes que revierten cubos y multiplicador de combo
  (`02-derrumbe.md`).
- Sonido.
- Controles táctiles.
- Skins.
- Otros tableros o niveles de patrón.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
