# SPEC — COMANDO MISILES: defensa clásica

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-08
> **Objetivo:** Diseñar un port fiel al Missile Command de 1980 — seis ciudades y tres baterías
> antiaéreas bajo una lluvia de misiles enemigos que se dividen en el aire, apuntados con un
> cursor y detonados como explosiones expansivas — como ficha nueva `comando-misiles` en
> categoría SHOOTER, con motor real y leaderboard en Supabase desde el primer día.

---

## Por qué existe esta spec

El catálogo tiene un solo SHOOTER real (`asteroids`, nave libre en gravedad cero) y un par de
propuestas de game jam (`ciempies`, `invasores` en maqueta) que comparten el mismo paradigma de
input: **la nave del jugador es un objeto que se mueve** y dispara en línea recta. Missile Command
cambia el paradigma de raíz: el jugador no controla ningún personaje, controla un **punto de
mira** y decide _dónde_ detonar, no _hacia dónde_ disparar. El proyectil es un medio de llegar a
un punto; el arma real es la explosión que se queda ahí unos instantes. Nada en el catálogo usa
apuntado con ratón como mecánica central (Arkanoid usa el ratón sólo para mover la pala), ni
trayectorias que el jugador tiene que **anticipar** (disparar a donde el misil estará, no a
donde está), ni un recurso de defensa que se agota (munición por batería) y que obliga a
administrar cada disparo.

Como con Snake (SPEC 10) y con las propuestas de `ciempies` y `ranaria`, **no hay código de
referencia**: no existe ninguna carpeta `References/.../missile-command` en el repositorio, sólo
la mención en `game-suggestions-todo.md`. Las constantes de este documento son el diseño en sí,
no el ajuste de un port; cambiarlas durante la implementación es rediseñar, no implementar. El
motor dibuja todo con primitivas de canvas — líneas, arcos y rectángulos — sin spritesheet: no
hay asset de Missile Command que portar.

Esta variante es la lectura **mínima y fiel** del arcade original: misiles enemigos que caen,
MIRV que se dividen, un bombardero que cruza la pantalla, tres baterías con munición limitada,
seis ciudades, bonus de fin de oleada y ciudad extra cada 10 000 puntos. La segunda variante
(`02-reaccion-en-cadena.md`) mantiene el mismo mundo, controles y mecánica base, pero cambia la
economía del juego: explosiones que se encadenan, multiplicador de combo y una tienda de mejoras
entre oleadas. Esta se queda deliberadamente en lo que ya es reconociblemente Missile Command.

---

## Alcance

**Dentro:**

- `lib/games/comando-misiles/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createComandoMisilesGame`, sin assets externos — ciudades, baterías, estelas, explosiones,
  bombardero y mira se dibujan con primitivas de canvas.
- Mundo lógico de **800×600**: cielo de `y 0..560`, franja de suelo de `y 560..600`.
- Seis ciudades y tres baterías (izquierda, centro, derecha) sobre el suelo, con posiciones
  fijas.
- Misiles enemigos que descienden en línea recta hacia un objetivo vivo (ciudad o batería),
  con una estela que se dibuja desde su punto de origen.
- División de misiles (MIRV): un misil enemigo puede partirse en pleno vuelo en 2–3 misiles hijos
  con objetivos propios, desde la oleada 2.
- Un bombardero por oleada, desde la oleada 3, que cruza el cielo horizontalmente y lanza
  misiles enemigos mientras vuela.
- Mira controlada con **ratón** (movimiento + clic) o con **teclado** (flechas/WASD para mover,
  espacio para disparar).
- Misiles del jugador: salen de la batería viva con munición más cercana al punto de mira, viajan
  en línea recta hasta ese punto y detonan una explosión circular que crece, se mantiene y se
  encoge. Todo misil enemigo dentro del radio de una explosión se destruye.
- Munición limitada: 10 misiles por batería, recargada al comenzar cada oleada; una batería
  destruida queda inutilizada hasta la siguiente oleada.
- Fin de oleada con pantalla de bonus dibujada en el canvas (cuenta de misiles sobrantes y de
  ciudades vivas, sin puntuaciones numéricas — esas viven en el HUD).
- Multiplicador de puntos por oleada, ciudad extra cada 10 000 puntos.
- Nueva ficha `comando-misiles` en `lib/games.ts` (categoría `SHOOTER`) y clase de portada
  `cover-comando-misiles` en `app/globals.css`.
- Una línea `comando-misiles` en `GAME_ENGINES` (`lib/games/registry.ts`).
- Migración `insert into public.games (id, title) values ('comando-misiles', 'COMANDO MISILES')`
  y su aplicación.

**Fuera de alcance (para specs futuras o para la variante `02-reaccion-en-cadena.md`):**

- Reacción en cadena entre explosiones, multiplicador de combo y tienda de mejoras.
- Satélites, misiles inteligentes («smart bombs») y aviones que esquivan explosiones.
- Sonido.
- Controles táctiles más allá del mapeo declarado en el registro (el apuntado por toque directo
  sobre el canvas lo cubre el ratón sintético del navegador; un mando específico es otra spec).
- Skins (`clasico`/`neon`/`retro`).
- Dos jugadores o modo cooperativo.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla nueva, ni columna, ni tipo de plataforma.** `GameEngineEntry` ya
existe desde la SPEC 08, `scores` y `game_stats` sirven a este juego sin tocarlas, y el
leaderboard se enciende con una fila en `games`.

Tipos locales del motor, sin exportar:

```ts
type Vec = { x: number; y: number }; // px de mundo, origen arriba-izquierda
type Target = { kind: "city" | "battery"; index: number; x: number }; // x fijo; y = GROUND_Y
type EnemyMissile = {
  from: Vec; // origen de la estela (donde nació o donde se partió el padre)
  pos: Vec; // posición actual de la cabeza
  target: Target;
  speed: number; // px/s
  splitsAt: number | null; // y a la que se parte; null = no se parte
  isChild: boolean; // los hijos no vuelven a partirse
};
type PlayerMissile = { from: Vec; pos: Vec; dest: Vec; speed: number; battery: number };
type Blast = {
  pos: Vec;
  r: number;
  phase: "grow" | "hold" | "shrink";
  holdLeft: number;
  hostile: boolean; // true = impacto enemigo en el suelo; false = explosión del jugador
};
type Bomber = { x: number; y: number; dir: -1 | 1; fireAccum: number };
type City = { x: number; alive: boolean };
type Battery = { x: number; alive: boolean; ammo: number };
```

Estado en la clausura de `createComandoMisilesGame`:

- `cities: City[]` (6), `batteries: Battery[]` (3).
- `enemies: EnemyMissile[]`, `shots: PlayerMissile[]`, `blasts: Blast[]` (explosiones de jugador
  **e** impactos enemigos en el suelo, distinguidas por un campo `hostile` — ver paso 4),
  `bomber: Bomber | null`.
- `cursor: Vec` (mira, en px de mundo), `cursorVisible` (false hasta el primer movimiento).
- `score`, `wave`, `bonusCitiesOwed` (ciudades extra ganadas aún sin reconstruir),
  `nextBonusAt` (umbral de puntos para la próxima ciudad extra).
- Cola de la oleada: `toSpawn` (misiles portadores aún por lanzar), `spawnAccum` (ms),
  `bomberPending` (bool).
- `state: "banner" | "playing" | "intermission" | "dying" | "gameover"` y `stateAccum` (ms).
- `fireCooldown` (ms).
- Bucle: `rafId`, `lastTime`, `destroyed`. Entrada: `keys: Set<string>`.

**Geometría fija**, mundo lógico 800×600:

```
GROUND_Y 560 · franja de suelo y 560..600
Baterías (x): 60 · 400 · 740
Ciudades (x): 160 · 240 · 320 · 480 · 560 · 640
CITY_W 44 · CITY_H 24 (dibujada sobre GROUND_Y)
BATTERY_W 40 · BATTERY_H 20
```

La simetría respecto a `x = 400` y el paso de 80 px entre ciudades son decisión de diseño
(objetivos separados lo bastante para que una sola explosión no cubra dos).

---

## Plan de implementación

### 1. Constantes y estado inicial

`lib/games/comando-misiles/engine.ts`, primera parte. Constantes de diseño:

```
W 800 · H 600 · GROUND_Y 560 · DT_MAX 50 ms
CITY_COUNT 6 · BATTERY_COUNT 3 · AMMO_PER_BATTERY 10
CURSOR_MIN_Y 30 · CURSOR_MAX_Y 530   (la mira no entra en la franja de suelo ni en el borde)
CURSOR_KEY_SPEED 420 px/s (flechas/WASD; la diagonal se normaliza)
FIRE_COOLDOWN 120 ms (evita el doble clic accidental que gasta dos misiles)
BANNER_MS 1400 · INTERMISSION_MS 3200 · DYING_MS 1600
MAX_SCORE 999999   (scores.score tiene CHECK 0..1.000.000; el motor nunca emite más)
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

`initGame()` coloca ciudades y baterías vivas, `wave = 1`, `score = 0`, `nextBonusAt = 10000`,
mira en el centro (`400, 300`), y entra en `state = "banner"`. `startWave()` rellena la munición
de **todas** las baterías vivas **y reconstruye las destruidas** (munición completa), calcula
`toSpawn` y `bomberPending` (paso 2) y pone `state = "banner"` durante `BANNER_MS`.

Comprobación: `npm run build` limpio con el motor aún sin registrar.

### 2. Oleadas y misiles enemigos

Constantes:

```
CARRIERS(wave) = min(12 + 2 * (wave - 1), 30)   (misiles portadores por oleada; los hijos de
  una división son extra y no cuentan aquí)
ENEMY_SPEED(wave) = min(45 + 7 * (wave - 1), 120)  px/s
SPAWN_GAP(wave) = max(500, 1800 - 100 * (wave - 1))  ms entre lanzamientos
MAX_ACTIVE_CARRIERS(wave) = min(4 + wave, 12)   (portadores simultáneos en el cielo)
SPLIT_CHANCE(wave) = 0 en la oleada 1; min(0.15 + 0.05 * (wave - 2), 0.5) desde la 2
SPLIT_Y_RANGE [120, 300]  (y a la que se parte un misil, sorteada al nacer)
SPLIT_COUNT 2 o 3 (50/50) · hijos con isChild = true, velocidad ENEMY_SPEED(wave)
BOMBER_FROM_WAVE 3
```

Lógica:

- En estado `playing`, `spawnAccum += dt`; cuando `spawnAccum >= SPAWN_GAP(wave)` **y**
  `toSpawn > 0` **y** el número de portadores vivos es menor que `MAX_ACTIVE_CARRIERS(wave)`,
  se lanza uno: origen `(x aleatorio en [20, 780], y = 0)`, objetivo sorteado entre los
  `Target` **vivos** (ciudades y baterías vivas, probabilidad uniforme), `toSpawn--`,
  `spawnAccum = 0`.
- La cabeza avanza en línea recta del origen al `x` del objetivo en `y = GROUND_Y` a
  `speed` px/s. La estela se dibuja de `from` a `pos`.
- Si el misil tiene `splitsAt` y su `pos.y` lo cruza, desaparece como portador y nacen
  `SPLIT_COUNT` hijos en esa posición, cada uno con **su propio objetivo vivo** sorteado
  (pueden coincidir entre sí). La estela de los hijos arranca en la posición de la división, pero
  se dibuja también la del padre (de `from` a la división) hasta el final de la oleada para que
  se vea de dónde vienen.
- Al llegar a `y >= GROUND_Y`, el misil impacta: se crea una explosión hostil (paso 4) en
  `(target.x, GROUND_Y)` y se elimina.
- **Si el objetivo ya estaba destruido al llegar** (otro misil lo mató antes), el misil sigue su
  trayectoria y detona igualmente en el suelo, sin efecto adicional. No se reasigna objetivo.
- La oleada termina cuando `toSpawn === 0`, no queda ningún `EnemyMissile`, no hay bombardero
  vivo ni pendiente, y no quedan `shots` ni `blasts` activos.

Comprobación: `npm run build` limpio; con el motor arrancado a mano, la oleada 1 lanza 12
misiles, ninguno se parte, y la oleada 2 incluye alguna división.

### 3. Bombardero

Constantes:

```
BOMBER_Y: aleatorio en [90, 220] al nacer · BOMBER_SPEED 110 px/s
BOMBER_SIZE 36 × 14
BOMBER_FIRE_GAP 1100 ms (lanza un misil enemigo desde su posición, objetivo vivo aleatorio,
  isChild = false pero sin splitsAt; no consume toSpawn)
BOMBER_MAX_MISSILES 3 por pasada
POINTS_BOMBER 100 (× multiplicador)
```

- Nace en `x = -40` (dir `1`) o `x = 840` (dir `-1`) al azar, en un instante aleatorio entre el
  20 % y el 60 % de la oleada (cuando `toSpawn` baja de ese umbral).
- Cruza la pantalla en línea recta; desaparece al salir por el lado opuesto, hayan salido o no
  sus tres misiles.
- Muere si el centro de su caja queda dentro del radio de una explosión **del jugador**.

Comprobación: en la oleada 3 cruza un bombardero; sus misiles aparecen desde su posición actual
y desaparece solo al salir de pantalla.

### 4. Misiles del jugador y explosiones

Constantes:

```
PLAYER_SPEED_SIDE 360 px/s (baterías izquierda y derecha) · PLAYER_SPEED_CENTER 600 px/s
BLAST_R_MAX 38 px · BLAST_GROW 100 px/s · BLAST_HOLD_MS 150 · BLAST_SHRINK 100 px/s
IMPACT_BLAST_R_MAX 30 px (explosión hostil en el suelo; ver abajo)
```

- **Disparo:** clic del ratón sobre el canvas o `Space` (con la mira donde esté). Se toma el
  punto de mira, se elige la batería **viva y con `ammo > 0` más cercana en `x` al punto**; si
  ninguna cumple, el disparo se ignora (el motor no gasta nada ni emite). `ammo--`, nace un
  `PlayerMissile` en la batería con `dest` = punto de mira. El disparo no hace nada en estados
  distintos de `playing`.
- **Vuelo:** línea recta a la velocidad de la batería de origen. La estela se dibuja desde la
  batería hasta la cabeza; la cabeza tiene una marca `X` en `dest` mientras vuela.
- **Detonación:** al alcanzar `dest` (distancia al destino ≤ la distancia recorrida en el frame)
  se elimina el misil y nace una `Blast` en `dest` con `r = 0`, fase `grow`.
- **Vida de la explosión:** `grow` hasta `BLAST_R_MAX`, `hold` durante `BLAST_HOLD_MS`,
  `shrink` hasta `r <= 0`. En cada frame toda cabeza enemiga con
  `dist(pos, blast.pos) <= blast.r` muere y suma `POINTS_MISSILE × multiplicador` (paso 5); si
  el bombardero queda dentro, muere.
- **Explosión hostil:** cuando un misil enemigo impacta en el suelo se crea una `Blast` con
  `hostile = true` de radio máximo `IMPACT_BLAST_R_MAX` (mismo ciclo grow/hold/shrink). Al
  inicio del impacto destruye su `Target` si está a menos de `IMPACT_BLAST_R_MAX + 12` px en `x`
  (la ciudad o la batería sobre la que cae, nunca las vecinas, separadas 80 px). **Una explosión
  hostil no destruye misiles ni al bombardero.**
- No hay fuego amigo: los misiles del jugador en vuelo no los afecta ningún misil enemigo ni
  ninguna explosión hostil.

Comprobación: `npm run build` limpio; un clic detona en el punto exacto del clic y un misil
enemigo que cruza el radio muere.

### 5. Puntuación, multiplicador, bonus y ciudades extra

Constantes:

```
POINTS_MISSILE 25
MULT(wave) = min(1 + floor((wave - 1) / 2), 6)    (oleadas 1-2 ×1, 3-4 ×2, … 11+ ×6)
POINTS_LEFTOVER_MISSILE 5 · POINTS_SURVIVING_CITY 100   (ambos × MULT)
BONUS_CITY_EVERY 10000
```

- Cada misil enemigo destruido suma `POINTS_MISSILE × MULT(wave)`; el bombardero suma
  `POINTS_BOMBER × MULT(wave)`. `score = min(score + delta, MAX_SCORE)`.
- Cada vez que `score >= nextBonusAt`, `bonusCitiesOwed++` y `nextBonusAt += BONUS_CITY_EVERY`
  (puede encadenar varios umbrales en una misma suma).
- **Fin de oleada → `intermission` (`INTERMISSION_MS`)**: se suman, con contadores que bajan en
  el canvas, `5 × MULT` por cada misil de jugador sin disparar (sumando las baterías **vivas** al
  cierre) y `100 × MULT` por cada ciudad viva. Dentro de esta pantalla se reconstruye una ciudad
  destruida por cada `bonusCitiesOwed` (de izquierda a derecha, hasta `CITY_COUNT`); si no hay
  ciudad destruida que reconstruir, la ciudad extra **se pierde** (no se acumula más allá de
  la ronda). Al terminar `INTERMISSION_MS`: `wave++`, `startWave()`.
- El canvas **no** dibuja puntos, nivel ni vidas. Sí dibuja, durante `banner` e `intermission`,
  rótulos de estado propios del juego: `OLEADA N`, `DEFENDIDA`, y los conteos `MISILES ×m` /
  `CIUDADES ×c` (cantidades, nunca puntuaciones).

Comprobación: `npm run build` limpio; el bonus de fin de oleada suma `5 × MULT × sobrantes +
100 × MULT × ciudades` exactamente en el HUD.

### 6. Fin de partida

- Cuando `cities.every(c => !c.alive)`: `state = "dying"` durante `DYING_MS` (las explosiones
  restantes terminan de dibujarse y los misiles enemigos aún en vuelo siguen su curso), luego
  `stopLoop()` y `onGameOver(score)` **una sola vez**.
- Quedarse sin munición **no** termina la partida: la oleada sigue hasta que caiga el último
  misil.
- `onLives(n)` reporta las **ciudades vivas** (6 al inicio). El HUD de la plataforma las
  presenta como vidas; ver Decisiones.
- Una batería destruida **no** cuenta como vida.

Comprobación: `npm run build` limpio; perder la última ciudad abre el modal `FIN DEL JUEGO`
tras `DYING_MS`.

### 7. Bucle, entrada y avisos

- `emit()` con `lastScore` / `lastLives` / `lastLevel`, llamando a los callbacks sólo cuando el
  valor cambia. `onLives(6)` y `onLevel(1)` al iniciar.
- `dt` en milisegundos, capado a `DT_MAX`; `lastTime = null` al reanudar. Todos los
  acumuladores (`spawnAccum`, `stateAccum`, `fireCooldown`, `holdLeft`) avanzan con `dt`, nunca
  con relojes de pared.
- **Ratón:** `mousemove` sobre el canvas actualiza `cursor`, normalizado al espacio de mundo con
  `(clientX - rect.left) * (W / rect.width)` (mismo patrón que Arkanoid, SPEC 09) y clampado a
  `CURSOR_MIN_Y..CURSOR_MAX_Y`; `mousedown` (botón 0) dispara. `cursorVisible = true` con el
  primer movimiento. `canvas.style.cursor = "none"` al crear el motor y se restaura en
  `destroy()`.
- **Teclado:** `keys` acumula `ArrowUp/Down/Left/Right`, `KeyW/A/S/D`; `Space` dispara en
  `keydown` (sin autorepeat: se ignora si `e.repeat`). Si el ratón se movió en el frame
  anterior manda el ratón; si no, el teclado (mismo criterio que Arkanoid).
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`,
  `KeyD`, `Space`. `preventDefault()` solo para esas. `P` y `Escape` no llegan al motor.
- Listeners `keydown` / `keyup` / `blur` / `mousemove` / `mousedown` sobre el canvas, nunca
  sobre `window` o `document`. `blur` vacía `keys`.
- `restart()`: detiene el bucle, vacía enemigos/misiles/explosiones/bombardero, reinicia
  `score`, `wave`, `nextBonusAt`, `bonusCitiesOwed`, ciudades y baterías, `initGame()`,
  `emit()`, arranca.
- `destroy()` cancela el frame, quita los cinco listeners, restaura `canvas.style.cursor` y es
  idempotente.
- `draw()` no asigna arrays, objetos ni clausuras (SPEC 13): las estelas se dibujan con
  `moveTo/lineTo` directos sobre los registros ya vivos.
- `initGame(); draw();` antes de devolver el motor.

Comprobación: `getEngine("comando-misiles")` (tras el paso 9) devuelve la entrada y
`npm run build` sigue limpio.

### 8. Catálogo: nueva ficha `comando-misiles`

`lib/games.ts`, nueva entrada en `GAMES`:

```ts
{
  id: "comando-misiles",
  title: "COMANDO MISILES",
  short: "Detona tus misiles donde caerán los suyos.",
  long: "Seis ciudades, tres baterías y una lluvia de misiles que se parte en pleno vuelo. Apunta con la mira, detona en el punto exacto y deja que la explosión haga el trabajo. La munición se acaba, los bombarderos no avisan y cada oleada cae más rápido que la anterior.",
  cat: "SHOOTER",
  cover: "cover-comando-misiles",
  color: "yellow",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `.cover-comando-misiles` nueva, en el mismo patrón que las portadas
generadas existentes (gradiente o patrón repetido, sin imagen externa).

Comprobación: `/juegos/comando-misiles` muestra la ficha en la biblioteca con su portada,
antes de que el motor esté registrado (cae en `.game-arena` con `seededScores()`).

### 9. Registrar el motor

`lib/games/registry.ts`:

```ts
"comando-misiles": {
  create: createComandoMisilesGame,
  width: 800,
  height: 600,
  controls: "ratón para apuntar y clic para disparar, o flechas/WASD para mover la mira y espacio para disparar",
  touch: { a: { code: "Space", label: "DISPARO" } },
},
```

La cruceta táctil mueve la mira (flechas) y el botón A dispara. Un toque directo sobre el canvas
también dispara a ese punto, porque el navegador emite `mousemove` + `mousedown` sintéticos.

Comprobación: `/jugar/comando-misiles` pinta el canvas real en vez de `.game-arena`.

### 10. Leaderboard

`supabase/migrations/<timestamp>_juego_comando_misiles.sql`:

```sql
insert into public.games (id, title) values ('comando-misiles', 'COMANDO MISILES');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. Los tipos no se
regeneran: insertar una fila no cambia el esquema.

Comprobación: `select * from public.games` incluye la fila `comando-misiles`.

### 11. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido
manual de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/comando-misiles` muestra un canvas de 800×600 con 6 ciudades, 3 baterías y una
      mira, no la `.game-arena`.
- [ ] El cursor nativo del sistema no se ve sobre el canvas; sólo la mira del juego.
- [ ] El HUD muestra 6 «vidas» (ciudades) y oleada 01 desde el inicio.
- [ ] La oleada 1 lanza exactamente 12 misiles portadores y ninguno se parte.
- [ ] Un clic detona una explosión en el punto exacto del clic tras el vuelo del misil, no en la
      batería ni en otro sitio.
- [ ] El misil sale de la batería viva con munición más cercana al punto de clic: clic a la
      izquierda → batería izquierda; clic cerca de `x = 400` → batería central.
- [ ] La batería central dispara visiblemente más rápido que las laterales.
- [ ] Un misil enemigo que cruza el radio de una explosión muere y suma 25 puntos en la
      oleada 1.
- [ ] La explosión crece, se mantiene un instante y se encoge hasta desaparecer.
- [ ] Una batería agotada (10 disparos) deja de disparar y el siguiente disparo sale de la
      siguiente más cercana; con las tres a cero, el clic no hace nada y no lanza error.
- [ ] Un misil enemigo que llega al suelo destruye la ciudad o batería sobre la que cae, pero
      nunca la vecina.
- [ ] Un misil cuyo objetivo ya estaba destruido sigue hasta el suelo y detona sin efecto.
- [ ] Desde la oleada 2 algún misil se parte en 2–3 hijos, cada uno con su propia estela
      hacia su propio objetivo.
- [ ] En la oleada 3 cruza un bombardero a `y ∈ [90, 220]` que lanza como mucho 3 misiles; matarlo
      suma 200 (100 × ×2).
- [ ] Una explosión hostil (impacto en el suelo) no destruye misiles enemigos ni al bombardero.
- [ ] Al terminar una oleada aparece la pantalla de bonus con los conteos de misiles sobrantes y
      ciudades vivas, sin cifras de puntuación en el canvas, y el HUD suma
      `5 × MULT × sobrantes + 100 × MULT × ciudades`.
- [ ] Las baterías destruidas reaparecen con 10 misiles al empezar la oleada siguiente.
- [ ] Al cruzar 10 000 puntos se reconstruye una ciudad destruida en el siguiente bonus; si no
      hay ninguna destruida, no ocurre nada.
- [ ] La oleada siguiente tiene más portadores y misiles más rápidos, hasta los topes del
      paso 2.
- [ ] Perder la sexta ciudad abre el modal `FIN DEL JUEGO` ~1,6 s después, con la puntuación
      real; la puntuación nunca excede 999 999.
- [ ] `JUGAR DE NUEVO` reinicia a oleada 1, 0 puntos, 6 ciudades y 10 misiles por batería sin
      recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'comando-misiles'`.
- [ ] Esa puntuación aparece en `/salon?juego=comando-misiles` y en `/juegos/comando-misiles`
      sin recargar a mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Con `scores` vacía para este juego, `/salon?juego=comando-misiles` muestra el estado vacío.
- [ ] Con el teclado solo, flechas/WASD mueven la mira y `Space` dispara; mantener `Space` no
      dispara en ráfaga.
- [ ] Con el canvas enfocado, las flechas, WASD y el espacio no hacen scroll de la página.
- [ ] El botón `PAUSA` congela el juego (misiles, explosiones y temporizadores de oleada) y
      `REANUDAR` lo reanuda sin que ningún misil pegue un salto.
- [ ] `P` y `Escape` hacen lo mismo que el botón, y el motor no los interpreta como jugada.
- [ ] Dejar la pestaña en segundo plano y volver no lanza varios misiles de golpe ni los
      adelanta.
- [ ] Navegar de `/jugar/comando-misiles` a `/biblioteca` y volver no duplica el bucle ni deja
      el cursor oculto en otras páginas.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid` y `/jugar/snake` se juegan igual que
      antes.
- [ ] `select * from public.games` incluye una fila `comando-misiles` además de las ya
      existentes.
- [ ] `lib/games.ts` mantiene sin tocar las fichas de los demás juegos.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en
      `/jugar/comando-misiles`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** mundo 800×600. Mismo marco 4/3 que Asteroids, Arkanoid y Snake; el original es casi
  cuadrado, pero un cielo más ancho da más margen de lectura a las trayectorias.
- **Sí:** el jugador apunta y **la plataforma elige la batería** (la más cercana con munición).
  El original usa tres botones; con ratón o con una sola tecla de disparo, elegir batería a
  mano añade fricción sin añadir decisión interesante. La decisión táctica que queda es _dónde_
  detonar y _cuánta_ munición gastar.
- **Sí:** reportar las ciudades vivas como `onLives`. El HUD ya tiene un contador de vidas y las
  ciudades son exactamente el recurso cuya pérdida acaba la partida; inventar otro canal
  rompería el contrato `GameCallbacks`.
- **No:** terminar la partida al quedarse sin munición. En el original la oleada continúa; el
  jugador ve cómo cae lo que no pudo interceptar y pierde ciudades por ello, que es el castigo.
- **Sí:** explosión con ciclo grow/hold/shrink de ~0,9 s. Es lo que convierte al juego en uno de
  anticipación: la explosión sirve como pared temporal, no como disparo instantáneo.
- **Sí:** los misiles enemigos no esquivan ni reaccionan a las explosiones. Es la regla del
  original y mantiene las trayectorias predecibles; la dificultad viene de la cantidad y la
  división, no de la inteligencia.
- **Sí:** los hijos de una división se sortean sus objetivos por separado. Es lo que hace
  peligrosa a la división: un solo portador se convierte en tres amenazas sobre blancos
  distintos.
- **No:** reasignar objetivo si el original cae. Reasignar convertiría una ciudad ya muerta en
  una oportunidad de redirigir el castigo; seguir hasta el suelo es más legible.
- **Sí:** una explosión hostil sólo mata a su propio objetivo. Con ciudades separadas 80 px,
  evita muertes en cadena injustas que el jugador no podría haber previsto.
- **Sí:** bombardero sólo desde la oleada 3 y como único «enemigo especial». Basta para romper
  la rutina de «todo cae desde arriba» sin abrir otro sistema; el satélite y los misiles
  inteligentes quedan fuera.
- **Sí:** el multiplicador sube cada dos oleadas hasta ×6. Mantiene la puntuación creciente sin
  que una partida larga sobrepase el tope de 999 999 del `CHECK` de `scores` con facilidad; si
  lo hiciera, el motor recorta.
- **Sí:** ciudad extra cada 10 000 puntos, con tope «una por ciudad destruida». Es la regla
  original y compensa lo duro de las oleadas altas sin permitir más de seis ciudades.
- **Sí:** el canvas dibuja `OLEADA N`, `DEFENDIDA` y los conteos del bonus. Son estado propio
  del juego, como el `PULSA UNA FLECHA` de Snake; las puntuaciones numéricas siguen siendo del
  HUD.
- **No:** sonido. No hay assets de audio.
- **No:** sembrar puntuaciones en `scores`.
- **No:** skins. Capa independiente que puede añadirse después con `skin-designer`.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Sin original, las constantes se ajustan «a ojo» durante la implementación en vez de fijarse antes. | Los pasos 1-5 las fijan explícitamente y las declaran fuera de cambio, como hizo Snake (SPEC 10). |
| Con ratón y teclado a la vez, la mira «salta» entre las dos fuentes. | Manda el ratón mientras se movió en el frame anterior; si no, el teclado. Mismo criterio ya probado en Arkanoid. |
| En móvil el toque directo dispara sin mover primero la mira, y un toque rápido consume un misil donde no se quería. | El toque es un `mousemove` + `mousedown` en el mismo punto, así que la mira y el disparo coinciden; `FIRE_COOLDOWN` evita el doble toque. |
| `canvas.style.cursor = "none"` se queda aplicado si el motor no se destruye bien. | `destroy()` lo restaura y es idempotente; criterio de aceptación al navegar fuera de `/jugar`. |
| Pausar con el ratón sobre el canvas deja la mira «congelada» y la reanudación dispara un clic fantasma. | El bucle parado no procesa `mousedown`; `blur` y el modal de pausa quitan el foco, y `lastTime = null` evita saltos al reanudar. |
| Una oleada alta con 12 portadores + hijos + explosiones puede asignar objetos cada frame y provocar tirones (SPEC 13). | Pools preasignados para `enemies`, `shots` y `blasts` con tope fijo (64 / 32 / 64) y `draw()` sin asignaciones; se mide con `?fps=1`. |
| La munición se agota antes de que termine la oleada y el jugador queda indefenso sin entender por qué. | Cada batería dibuja su munición restante como pips sobre su base (estado del juego, no puntuación); la batería agotada se atenúa. |
| Los misiles hijos pueden nacer exactamente sobre una explosión activa y morir al instante, trivializando la división. | La comprobación de muerte por explosión se aplica a la cabeza en el mismo frame; es válido y es la recompensa de anticipar el punto de división. Se deja explícito para no «arreglarlo». |
| El multiplicador ×6 y el bonus por ciudades pueden superar 999 999 en una partida larga. | `score = min(score + delta, MAX_SCORE)` en cada suma; criterio de aceptación sobre el tope. |
| Un objetivo sorteado puede ser el mismo para muchos misiles y mostrar poca variedad. | El sorteo es uniforme entre objetivos vivos; con 9 blancos vivos la repetición es estadísticamente corta, y se verifica jugando varias oleadas. |

---

## Lo que **no** entra en esta spec

- Reacción en cadena entre explosiones, combo y tienda de mejoras entre oleadas.
- Satélites, misiles inteligentes y aviones que esquivan.
- Sonido.
- Mando táctil específico más allá de cruceta (mira) + botón de disparo.
- Skins (`clasico`/`neon`/`retro`).
- Dos jugadores o modo cooperativo.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.
- Rate limiting, antitrampas y validación de la puntuación en servidor.

Cada una de ellas, si entra, va en su propia spec.
