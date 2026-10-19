# SPEC — DIG DUG: clásico de excavación

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06, SPEC 11
> **Fecha:** 2026-10-15
> **Objetivo:** Diseñar un port fiel al Dig Dug de 1982 — un mineralero que excava túneles en un subsuelo por estratos, infla con una bomba de aire a Pookas y Fygars hasta reventarlos y los aplasta soltando rocas — como ficha nueva `dig-dug` en categoría ARCADE, con motor real y leaderboard en Supabase desde el primer día.

---

## Por qué existe esta spec

`todo` marca `dig-dug` como pendiente: «combina laberinto + habilidad como `gloton`, pero con mecánica de excavación/creación de terreno en vez de recorrido fijo». Ninguno de los juegos reales (`asteroids`, `caida`, `arkanoid`, `snake`, `frogger`) ni de las maquetas (`gloton`, `invasores`, `duelo-pixel`) deja que el jugador **cree** el espacio por el que se mueve: en todos el escenario es dado. Aquí el terreno es el estado principal del juego — cada celda excavada abre camino al jugador **y** a los enemigos, y las rocas convierten la excavación en un arma de doble filo.

Como con Snake (SPEC 10) y con las variantes de `ciempies` y `ranaria`, **no hay código de referencia**: no existe ninguna carpeta de Dig Dug en el repositorio, sólo la mención en `game-suggestions-todo.md`. Las constantes de este documento son el diseño en sí; cambiarlas durante la implementación es rediseñar, no implementar. El motor dibuja todo con primitivas de canvas — rectángulos, círculos y arcos — sin spritesheet ni audio: no hay ningún asset que portar.

Esta variante es la lectura **fiel y mínima** del arcade de 1982: estratos de tierra, Pooka, Fygar con aliento de fuego, bomba de aire en cuatro bombeos, rocas que caen, huida del último enemigo y verdura de bonus. La segunda variante (`02-derrumbe.md`) cambia la regla central — los túneles se cierran solos — y sustituye las rocas por gemas; esta se queda en el conjunto que ya es reconociblemente Dig Dug.

---

## Alcance

**Dentro:**

- `lib/games/dig-dug/engine.ts`: motor nuevo, todo el estado en la clausura de `createDigDugGame`, sin assets externos.
- Mundo lógico de **560×720**: grilla de 14×18 celdas de 40 px. La fila 0 es la superficie (siempre libre); las filas 1..17 son tierra en cuatro estratos de color.
- Terreno excavable: matriz de celdas `dirt | dug`, más rocas como objetos aparte.
- Jugador que se mueve celda a celda con interpolación, excava al entrar en tierra y recuerda su orientación.
- Bomba de aire: arpón de 3 celdas que se engancha a un enemigo; mantener `Espacio` lo infla en 4 bombeos hasta reventarlo.
- Dos enemigos: **Pooka** (persigue por los túneles) y **Fygar** (igual, más aliento de fuego horizontal de 3 celdas).
- Modo fantasma: un enemigo atrapado o aburrido atraviesa la tierra como un par de ojos y vuelve a la normalidad al llegar a un túnel conectado con el jugador.
- Cuatro rocas por ronda: se bambolean y caen al quedarse sin apoyo, aplastan a lo que alcancen (enemigos o jugador).
- Huida del último enemigo hacia la superficie.
- Verdura de bonus tras soltar la segunda roca de la ronda.
- Rondas sucesivas: más enemigos y más rápidos sobre el mismo diseño de cuevas.
- Tres vidas, una vida extra a los 10 000 puntos y cada 40 000 después, tope de 5.
- Nueva ficha `dig-dug` en `lib/games.ts` (categoría `ARCADE`, color `yellow`) y clase de portada `cover-dig-dug` en `app/globals.css`.
- Una línea `dig-dug` en `GAME_ENGINES` (`lib/games/registry.ts`), con mando táctil.
- Migración `insert into public.games (id, title) values ('dig-dug', 'DIG DUG')` y su aplicación.

**Fuera de alcance (para specs futuras o para la variante `02-derrumbe.md`):**

- Túneles que se cierran, gemas y cualquier mecánica de terreno vivo.
- Diseños de cueva distintos por ronda.
- Pantallas de transición, mapa de rondas o animación de intro/outro.
- Sonido.
- Skins (`clasico`/`neon`/`retro`).
- Modo de dos jugadores alternados.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla nueva, ni columna, ni tipo de plataforma.** `GameEngineEntry` existe desde la SPEC 08 y el mando táctil desde la SPEC 11; `scores` y `game_stats` sirven a este juego sin tocarlas, y el leaderboard se enciende con una fila en `games`.

Tipos locales del motor, sin exportar:

```ts
type Dir = "up" | "down" | "left" | "right";
type Cell = { col: number; row: number };
type Mover = {
  col: number; row: number;   // celda de origen del paso en curso
  to: Cell | null;            // celda destino; null = parado en el centro de (col,row)
  prog: number;               // 0..1 a lo largo del paso
  facing: Dir;
};
type Player = Mover & { dying: number; grace: number }; // ms restantes de muerte / invulnerabilidad
type Enemy = Mover & {
  kind: "pooka" | "fygar";
  stage: 0 | 1 | 2 | 3 | 4;   // grado de hinchado; 4 = revienta
  ghost: boolean; ghostMs: number;
  stuckMs: number; wanderMs: number;
  deflateMs: number;
  fire: { state: "idle" | "charge" | "burn"; ms: number; cooldown: number };
  prev: Cell | null;          // celda de la que viene, para no recular
  fleeing: boolean;
  dead: number;               // 0 = vivo; >0 = ms de animación de muerte
};
type Rock = { col: number; row: number; y: number; state: "idle" | "wobble" | "fall" | "break"; ms: number };
type Harpoon = { state: "idle" | "out" | "attached" | "retract"; len: number; target: Enemy | null; ms: number };
```

Estado en la clausura de `createDigDugGame`:

- `terrain: boolean[]` — array plano de `COLS * ROWS`; `true` = celda excavada (`índice = row * COLS + col`).
- `player`, `enemies: Enemy[]`, `rocks: Rock[]`, `harpoon: Harpoon`, `bonus: { cell: Cell; ms: number } | null`.
- `score`, `lives`, `round`, `nextExtraLife`, `rocksDropped` (rocas soltadas esta ronda), `crushChain` (enemigos aplastados por la caída en curso).
- `pumpAccum` (ms de `Espacio` mantenido con el arpón enganchado), `pathTick` (ms hasta recalcular los caminos), `roundState: "playing" | "clear" | "dying" | "gameover"`, `stateMs`.
- Bucle: `rafId`, `lastTime`, `destroyed`. Entrada: `keys: Set<string>`, `dirStack: Dir[]` (orden de pulsación).

**Grilla y estratos**, mundo lógico 560×720:

```
COLS 14 · ROWS 18 · CELL 40 px
fila 0 — superficie (y 0..40), siempre libre
estrato 0: filas 1..4   · estrato 1: filas 5..8
estrato 2: filas 9..12  · estrato 3: filas 13..17
```

---

## Plan de implementación

### 1. Constantes, terreno y diseño de la cueva

`lib/games/dig-dug/engine.ts`. Constantes de diseño:

```
W 560 · H 720 · CELL 40 · COLS 14 · ROWS 18
LIVES_START 3 · MAX_LIVES 5 · EXTRA_LIFE_FIRST 10000 · EXTRA_LIFE_EVERY 40000
PLAYER_START (7, 0) · START_SHAFT: (7,1), (7,2) excavadas
WALK_STEP_MS 190 · DIG_STEP_MS 330          // ms por celda
RESPAWN_GRACE_MS 1500 · DEATH_MS 900 · CLEAR_MS 1500
DT_MAX 50
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Diseño de cueva (idéntico en todas las rondas). Cada bolsillo es una cámara horizontal de 3 celdas excavada al empezar; cada roca va dos filas por encima de su bolsillo, con una celda de tierra entre medias:

```
POCKETS (col inicial, fila, 3 celdas):  A (2,4) · B (9,7) · C (3,11) · D (8,14) · E (1,16) · F (10,12)
ROCKS (col, fila):                       (3,2) · (10,5) · (4,9) · (9,12)
```

`initRound(round)`: `terrain` todo `false` salvo fila 0 y `START_SHAFT`; excava los bolsillos; coloca las cuatro rocas en estado `idle`; crea los enemigos según `ENEMY_COUNT` (paso 4) en los bolsillos A, B, C, D, E, F por ese orden, uno por bolsillo, en la celda central.

Comprobación: `npm run build` limpio; con `initRound(1)` y un volcado a consola del `terrain` solo hay excavadas fila 0, el pozo de inicio y los bolsillos.

### 2. Jugador: movimiento y excavación

Movimiento celda a celda con interpolación (`prog` 0..1):

- Sin paso en curso (`to === null`), se lee `dirStack` y se toma la **última** dirección aún pulsada. La celda destino debe estar dentro de la grilla y no contener roca.
- Si el destino es tierra, el paso dura `DIG_STEP_MS`; si está excavado, `WALK_STEP_MS`. La celda se marca excavada cuando `prog ≥ 0.5` del paso hacia ella (el centro del jugador la cruza).
- Con un paso en curso, pulsar la dirección **opuesta** invierte el paso al instante: se intercambian origen y destino y `prog = 1 - prog`. Cualquier otra dirección se ignora hasta llegar al centro de la celda, momento en que se relee `dirStack`.
- `facing` se actualiza con cada paso iniciado, aunque no se complete.
- Mientras `harpoon.state` sea `out`, `attached` o `retract`, el jugador no se mueve (pero sí puede soltar `Espacio`).
- La superficie (fila 0) es transitable en horizontal sin coste; entrar en la fila 1 desde la 0 excava como cualquier otra tierra.
- Cavar justo debajo de una roca no la mueve todavía (ver paso 5).

Comprobación: con `npm run dev`, el jugador deja un túnel exacto de 1 celda de ancho, gira solo en centros de celda y reculando a mitad de paso no deja medio túnel.

### 3. Bomba de aire

Máquina de estados de `harpoon`, accionada por `Espacio`:

- **idle → out:** al pulsar `Espacio` sin arpón activo. El arpón crece desde el centro del jugador en la dirección de `facing` a `HARPOON_SPEED 800` px/s hasta `HARPOON_RANGE 120` px (3 celdas).
- El arpón avanza solo por celdas excavadas: se detiene en la primera celda de tierra o roca. Alcanzar ese tope sin impacto pasa a **retract**.
- Impacto: el primer enemigo no fantasma cuya posición esté a menos de 18 px del eje del arpón y dentro de su longitud. Pasa a **attached** y el enemigo queda inmóvil, con su fuego cancelado.
- **attached:** mientras `Espacio` siga pulsado, `pumpAccum += dt`; cada `PUMP_STAGE_MS 280` el enemigo sube un `stage`. En `stage 4` revienta (paso 6, puntuación).
- Soltar `Espacio` con el arpón enganchado → **retract** (`HARPOON_RETRACT_MS 120`), `pumpAccum = 0`, y el enemigo empieza a desinflarse: `DEFLATE_MS 600` por `stage`. Un enemigo con `stage ≥ 1` está aturdido e **inofensivo**; con `stage 0` vuelve a moverse.
- Se puede volver a disparar al mismo enemigo: conserva su `stage` actual.
- Un solo arpón a la vez. El arpón no atraviesa enemigos fantasma ni los alcanza si están en tierra.

Comprobación: tres tiros sobre un Pooka sin llegar a mantener 4 bombeos lo dejan en `stage 3`; esperar 600 ms lo baja a 2; un bombeo continuo de 1 120 ms lo revienta.

### 4. Enemigos: Pooka y Fygar

Constantes:

```
ENEMY_COUNT(round) = min(2 + round, 6)
FYGARS(round)      = min(1 + floor((round - 1) / 2), 3)   // el resto son Pookas
ENEMY_STEP_MS(round) = max(150, 300 - 15 * (round - 1))
GHOST_STEP_MS 380 · GHOST_AFTER_STUCK_MS 3000 · GHOST_MIN_MS 1200
GHOST_RANDOM_MS(round) = max(6000, 14000 - 1000 * (round - 1))
RANDOM_TURN 0.2 · PATH_TICK_MS 250 · CONTACT_RADIUS 24 px
FIRE_COOLDOWN_MS 2500 · FIRE_CHARGE_MS 500 · FIRE_BURN_MS 400 · FIRE_RANGE 3 celdas · FIRE_SIGHT 4 celdas
FLEE_SPEED_FACTOR 1.5
```

Ronda 1: 3 enemigos (1 Fygar, 2 Pookas). Ronda 5: 6 enemigos (3 Fygars, 3 Pookas), tope.

**Movimiento normal.** En el centro de cada celda el enemigo elige entre los vecinos excavados sin roca: el que minimice la distancia Manhattan al jugador; con probabilidad `RANDOM_TURN` elige uno al azar. No recula salvo que sea un callejón sin salida.

**Caminos.** Cada `PATH_TICK_MS` se calcula una BFS sobre celdas excavadas desde la celda del jugador (14×18 celdas, coste despreciable). Un enemigo cuya celda no está en esa componente acumula `stuckMs`; el resto lo resetea. Además `wanderMs` acumula siempre que el enemigo no sea fantasma.

**Fantasma.** Un enemigo normal con `stage 0` pasa a fantasma si `stuckMs ≥ GHOST_AFTER_STUCK_MS` o `wanderMs ≥ GHOST_RANDOM_MS(round)`. Como fantasma: se dibujan sólo los ojos, el paso dura `GHOST_STEP_MS`, avanza **hacia el jugador en línea recta** (primero el eje de mayor distancia) ignorando la tierra y **excavando** las celdas que cruza, pero nunca atraviesa una roca. No puede ser alcanzado por el arpón. Vuelve a normal cuando han pasado `GHOST_MIN_MS` y su celda pertenece a la componente BFS del jugador; entonces `stuckMs = wanderMs = 0`.

**Fygar.** Con `stage 0`, sin ser fantasma, `fire.cooldown ≤ 0`, el jugador en su misma fila a ≤ `FIRE_SIGHT` celdas, el Fygar mirando hacia él y todas las celdas intermedias excavadas: entra en `charge` (parado `FIRE_CHARGE_MS`, parpadeando), luego `burn` (`FIRE_BURN_MS`): llama de `FIRE_RANGE` celdas hacia delante que se detiene en la primera tierra o roca y mata al jugador si le alcanza. Después `cooldown = FIRE_COOLDOWN_MS`. Engancharlo con el arpón durante `charge` o `burn` cancela el fuego.

**Contacto.** Un enemigo con `stage 0` (fantasma incluido) a menos de `CONTACT_RADIUS` px del centro del jugador lo mata, salvo durante `RESPAWN_GRACE_MS`.

**Huida.** Cuando queda exactamente un enemigo vivo y no está enganchado, pasa a `fleeing`: se vuelve fantasma sin `GHOST_MIN_MS`, con paso `GHOST_STEP_MS / FLEE_SPEED_FACTOR`, y sube hacia la fila 0 en línea recta. Si llega a la fila 0, abandona la partida sin puntos y la ronda termina. Sigue pudiendo reventarse con el arpón **sólo** si en ese momento está en una celda excavada y a tiro; como fantasma no lo está.

Comprobación: en ronda 1 hay 1 Fygar y 2 Pookas; dejar un enemigo aislado de un túnel 3 s lo convierte en ojos que cruzan la tierra hasta el pozo; un Fygar a 3 celdas en línea parpadea y escupe una llama de 3 celdas.

### 5. Rocas

```
ROCK_WOBBLE_MS 600 · ROCK_FALL_PX_S 400 · ROCK_BREAK_MS 400 · CRUSH_RADIUS 24 px
```

- Una roca `idle` está en una celda que cuenta como sólida para el jugador, los enemigos normales y el arpón.
- Cuando la celda **inmediatamente inferior** está excavada y el jugador **no** se encuentra en ella ni la está cruzando, pasa a `wobble` durante `ROCK_WOBBLE_MS`. Si el jugador vuelve a entrar en la celda inferior durante el bamboleo, la roca sigue su cuenta y cae igualmente.
- `fall`: baja a `ROCK_FALL_PX_S` px/s, un máximo de 18 px por frame con `DT_MAX`, comprobando celda a celda. Se detiene al llegar a una celda inferior que sea tierra, roca o el fondo del mapa.
- Mientras cae, cualquier enemigo o el jugador a menos de `CRUSH_RADIUS` px de su centro muere (incluidos enemigos fantasma). `crushChain` cuenta los enemigos muertos en esa caída.
- `break`: al detenerse pasa `ROCK_BREAK_MS` agrietándose y desaparece, dejando la celda excavada. `rocksDropped++`.
- Una roca que cae sobre otra celda excavada con una roca debajo se apila encima como si fuera tierra.

Comprobación: cavar bajo la roca (3,2) y apartarse: 600 ms de temblor, caída hasta el bolsillo A y desaparición con el enemigo aplastado si estaba debajo; quedarse debajo cuando cae es muerte.

### 6. Rondas, bonus, vidas y puntuación

```
POOKA_POINTS    = [200, 300, 400, 500]   // por estrato de la celda del enemigo al reventar
FYGAR_POINTS    = [200, 400, 600, 800]   // ×2 si revienta con el jugador en su misma fila
CRUSH_POINTS    = [1000, 2500, 4000, 6000, 8000, 10000]   // por el n-ésimo enemigo de la misma caída
BONUS_POINTS    = [400, 600, 800, 1000, 2000, 3000, 4000, 5000]  // índice min(round-1, 7)
BONUS_MS 8000
```

- Estrato de un enemigo = el estrato de su celda de origen en ese instante (`stratumOfRow(row)`).
- Los puntos de aplastamiento se otorgan por enemigo: el 1.º de una caída vale 1 000, el 2.º 2 500, etc. (`crushChain` indexa la tabla, saturando en el último valor).
- La **verdura** aparece cuando se rompe la **segunda** roca de la ronda, en su celda de aterrizaje, y dura `BONUS_MS`. Se recoge pasando por su celda. Si dura más que su tiempo desaparece sin penalización.
- Ronda completa cuando no queda ningún enemigo vivo (ni huyendo). Estado `clear` de `CLEAR_MS`, `round++`, `onLevel(round)` y `initRound`.
- Vida extra al cruzar `nextExtraLife` (primero 10 000, luego +40 000); tope `MAX_LIVES`. Si ya está en el tope no se otorga pero `nextExtraLife` avanza.
- Muerte del jugador: `dying = DEATH_MS`, `lives--`. Al terminar la animación, si `lives > 0`: el jugador reaparece en `PLAYER_START` con `grace = RESPAWN_GRACE_MS`, el arpón se limpia y los enemigos conservan posición pero vuelven a `stage 0`, sin fantasma ni fuego en curso. Si `lives == 0`: `gameover`.

Comprobación: reventar un Pooka en el estrato 2 suma 400; aplastar dos enemigos con la misma roca suma 1 000 + 2 500; la verdura de la ronda 1 vale 400.

### 7. Bucle, entrada, dibujo y avisos

- `emit()` con `lastScore` / `lastLives` / `lastLevel`, llamando a los callbacks sólo cuando el valor cambia. `onLives(LIVES_START)` y `onLevel(1)` al iniciar.
- `onGameOver(score)` una sola vez, después de detener el bucle, cuando termina la animación de la última muerte.
- `restart()`: detiene el bucle, reinicia `score`, `lives`, `round`, `nextExtraLife`, `initRound(1)`, `emit()` y arranca.
- `dt` en milisegundos capado a `DT_MAX`; `lastTime = null` al reanudar.
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`, `KeyD`, `Space`. `preventDefault()` solo para esas.
- Listeners `keydown` / `keyup` / `blur` sobre el canvas, nunca sobre `window` o `document`. `blur` vacía `keys`, `dirStack` y suelta `Espacio`. `P` y `Escape` no llegan al motor.
- `draw()`: cielo en la fila 0; cada estrato con su tono (amarillo, naranja, rojo oscuro, granate) y textura de motas; celdas excavadas en negro; rocas como polígonos grises con grieta durante `wobble`; Pooka como círculo rojo con gafas, Fygar como cuerpo verde con aletas, inflándose según `stage`; fantasmas como dos ojos blancos; jugador con casco blanco y pistón; arpón como línea con punta; llama como degradado naranja de 3 celdas.
- Sin puntuación, vidas ni ronda dibujadas en el canvas: lo pone el HUD de la plataforma. Un rótulo `¡LISTO!` durante `CLEAR_MS` y al reaparecer sí puede vivir en el canvas, por ser estado propio del juego.
- `destroy()` cancela el frame, quita los tres listeners y es idempotente.
- `initRound(1); draw();` antes de devolver el motor.

Comprobación: `npm run build` limpio; `P`/`Escape` pausan y `JUGAR DE NUEVO` reinicia sin duplicar el bucle.

### 8. Catálogo: nueva ficha `dig-dug`

`lib/games.ts`, nueva entrada en `GAMES`:

```ts
{
  id: "dig-dug",
  title: "DIG DUG",
  short: "Excava, infla y revienta a los monstruos bajo tierra.",
  long: "Un minero abre túneles en un subsuelo de cuatro estratos y combate con una bomba de aire a los Pookas y a los Fygars de aliento de fuego. Hincha a cada uno hasta que explote o suelta una roca sobre sus cabezas. Si te acorralan, se convierten en ojos que atraviesan la tierra.",
  cat: "ARCADE",
  cover: "cover-dig-dug",
  color: "yellow",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `.cover-dig-dug` nueva, en el mismo patrón que las portadas generadas existentes (bandas horizontales de color de estrato y un túnel negro, sin imagen externa).

Comprobación: `/juegos/dig-dug` muestra la ficha en la biblioteca con su portada, antes de registrar el motor (cae en `.game-arena` con `seededScores()`).

### 9. Registrar el motor

`lib/games/registry.ts`:

```ts
"dig-dug": {
  create: createDigDugGame,
  width: 560,
  height: 720,
  controls: "flechas o WASD para moverte y excavar, mantén espacio para inflar al enemigo",
  touch: { a: { code: "Space", label: "BOMBA" } },
},
```

Comprobación: `/jugar/dig-dug` pinta el canvas real en vez de `.game-arena`; en móvil aparece el mando con el botón `BOMBA` y mantenerlo pulsado infla.

### 10. Leaderboard

`supabase/migrations/<timestamp>_juego_dig_dug.sql`:

```sql
insert into public.games (id, title) values ('dig-dug', 'DIG DUG');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. Los tipos no se regeneran: insertar una fila no cambia el esquema. El `id` con guion tiene precedente en `duelo-pixel`.

Comprobación: `select * from public.games` incluye la fila `dig-dug`.

### 11. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido manual de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/dig-dug` muestra un canvas de 560×720 con cielo, cuatro estratos de tierra, un pozo inicial y bolsillos con enemigos, no la `.game-arena`.
- [ ] El jugador empieza en la superficie, con 3 vidas en el HUD y ronda 01.
- [ ] Mover el jugador por tierra abre un túnel de una celda de ancho; por un túnel ya abierto va más rápido que excavando.
- [ ] Pulsar la dirección contraria a mitad de paso invierte el movimiento sin dejar medio túnel.
- [ ] Un giro sólo se aplica al llegar al centro de una celda; el jugador nunca queda entre dos celdas.
- [ ] `Espacio` dispara un arpón de 3 celdas que se detiene en la primera tierra o roca.
- [ ] El arpón engancha a un enemigo; con `Espacio` mantenido infla en 4 etapas visibles y a los 1 120 ms revienta.
- [ ] Soltar `Espacio` a medias retrae el arpón y el enemigo se desinfla una etapa cada 600 ms.
- [ ] Un enemigo con `stage ≥ 1` no mata al tocarlo; con `stage 0` sí.
- [ ] Mientras el arpón está fuera o enganchado, el jugador no se mueve.
- [ ] Un Pooka persigue al jugador por los túneles excavados y no atraviesa la tierra.
- [ ] Un enemigo sin camino al jugador durante 3 s se convierte en ojos que cruzan la tierra y vuelve a ser sólido al entrar en un túnel conectado.
- [ ] Un fantasma no puede ser enganchado por el arpón.
- [ ] Un Fygar alineado a ≤ 4 celdas parpadea 500 ms y lanza una llama de 3 celdas que mata al jugador y se detiene ante la tierra.
- [ ] Enganchar a un Fygar durante la carga de su llama cancela el fuego.
- [ ] Cavar bajo una roca y apartarse la hace temblar 600 ms y caer; si el jugador sigue bajo ella, muere.
- [ ] Una roca que cae sobre un enemigo lo aplasta: 1 000 el primero, 2 500 el segundo de la misma caída.
- [ ] La roca se rompe al aterrizar y deja la celda excavada.
- [ ] Tras romperse la segunda roca aparece la verdura en su celda, dura 8 s y suma `BONUS_POINTS` al recogerla.
- [ ] Reventar un Pooka en el estrato 0 suma 200 y en el estrato 3 suma 500; un Fygar con el jugador en su fila suma el doble.
- [ ] Cuando queda un solo enemigo, sube a la superficie como fantasma y, al salir, la ronda termina.
- [ ] Completar la ronda muestra `¡LISTO!`, el HUD pasa a ronda 02 y aparecen 4 enemigos; el diseño de la cueva es el mismo.
- [ ] Morir con vidas restantes hace reaparecer al jugador en la superficie con 1 500 ms de parpadeo en los que nada le mata.
- [ ] A los 10 000 puntos el HUD pasa de 3 a 4 vidas; con 5 vidas no pasa de 5.
- [ ] Perder la última vida abre el modal `FIN DEL JUEGO` con la puntuación real, una sola vez.
- [ ] El canvas no dibuja puntos, vidas ni ronda, ni overlay de game over.
- [ ] El botón `PAUSA` congela el juego (incluidos temporizadores de roca y de fuego) y `REANUDAR` lo reanuda sin saltos.
- [ ] `P` y `Escape` hacen lo mismo que el botón.
- [ ] Con el canvas enfocado, flechas y espacio no hacen scroll de la página.
- [ ] Escribir `W`, `A`, `S`, `D` o espacio en el campo de iniciales no mueve ni dispara.
- [ ] `JUGAR DE NUEVO` reinicia a ronda 1, 0 puntos y 3 vidas sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'dig-dug'`, y dos pulsaciones seguidas no insertan dos filas.
- [ ] Esa puntuación aparece en `/salon?juego=dig-dug` y en `/juegos/dig-dug` sin recargar a mano.
- [ ] Con `scores` vacía para este juego, `/salon?juego=dig-dug` muestra el estado vacío.
- [ ] En móvil el mando táctil muestra la cruceta y `BOMBA`; mantener `BOMBA` infla.
- [ ] Navegar de `/jugar/dig-dug` a `/biblioteca` y volver no duplica el bucle.
- [ ] Dejar la pestaña en segundo plano y volver no hace caer rocas ni mover enemigos varias celdas de golpe.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid`, `/jugar/snake` y `/jugar/frogger` se juegan igual que antes.
- [ ] `/jugar/gloton` y los otros juegos sin motor se comportan igual que antes.
- [ ] `select * from public.games` incluye `dig-dug` y no pierde ninguna fila anterior.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/dig-dug`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** `game-id` `dig-dug`, con guion como `duelo-pixel`, igual que figura en `todo`. Título `DIG DUG`, coherente con `ASTEROIDS`, `TETRIS` y `SNAKE`.
- **Sí:** categoría `ARCADE`, como razona el `todo`: excavación sin duplicar `snake`, `arkanoid` ni `gloton`.
- **Sí:** grilla de 14×18 celdas de 40 px (560×720). Es la proporción del arcade original (224×288) a escala 2,5 y encaja en el marco vertical que ya usa `ciempies`.
- **Sí:** movimiento celda a celda con interpolación, no libre en píxeles. Hace exactos los túneles, el giro, la BFS de los enemigos y la colisión con rocas.
- **Sí:** excavar es más lento que caminar por túnel ya abierto (`330` vs `190` ms/celda). Es el coste de abrir camino y lo que hace táctica la ruta.
- **Sí:** bombeo **mantenido**, no pulsaciones repetidas. Funciona igual con teclado y con el botón táctil (`repeat` no hace falta) y evita el aporreo de tecla.
- **Sí:** el enemigo inflado queda aturdido e inofensivo. Premia al jugador por enganchar a tiempo.
- **Sí:** el fantasma excava la tierra que cruza. Así el jugador puede seguirle y el mapa no se queda con «paredes fantasma».
- **Sí:** el fantasma nunca atraviesa una roca. Evita el caso de una roca suspendida sobre una celda ocupada.
- **Sí:** la verdura aparece donde cae la segunda roca. Garantiza una celda excavada y transitable sin una lista aparte de posiciones.
- **Sí:** mismo diseño de cueva todas las rondas; sólo cambian número y velocidad de los enemigos. Un diseño por ronda es otra spec.
- **Sí:** el último enemigo huye. Es el cierre característico del arcade y evita rondas que se alargan por un enemigo que se esconde.
- **Sí:** reaparición con 1 500 ms de invulnerabilidad. El original no la tiene, pero sin ella un enemigo pegado al pozo de inicio quita vidas en cadena.
- **No:** sonido ni skins. No hay assets y los motores nuevos no los exigen.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo                                                                                       | Mitigación                                                                                                       |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Sin original, las constantes se ajustan «a ojo» durante la implementación.                   | El paso 1 y el paso 4 las fijan y las declaran fuera de cambio.                                                  |
| El mando táctil envía `keydown` repetidos o no envía `keyup` fiable y el bombeo se atasca.     | El motor trata `Espacio` como estado (`keys`) y suelta en `blur`; criterio de aceptación en móvil real.         |
| Un enemigo fantasma atravesando una celda con roca deja la roca sin apoyo.                  | El fantasma nunca entra en celdas con roca; la caída sólo se dispara desde celdas excavadas por el jugador o por un fantasma bajo la roca, y ambas siguen la regla del paso 5. |
| El jugador se queda encerrado entre una roca `idle` y tierra sin salida.                     | Siempre puede excavar cualquier celda que no tenga roca; el criterio de movimiento lo cubre.                   |
| La BFS cada 250 ms con muchos enemigos pesa en móviles.                                      | Una sola BFS por tick desde el jugador, no una por enemigo; 252 celdas, coste despreciable.                     |
| Pestaña en segundo plano: rocas y enemigos recorren varias celdas en un frame.               | `dt` capado a 50 ms: máximo 18 px de caída por frame, la caída se comprueba celda a celda; `lastTime = null` al reanudar. |
| El arpón engancha a un enemigo que acaba de convertirse en fantasma en el mismo frame.       | El impacto sólo considera enemigos con `ghost === false` evaluado antes de resolver el arpón en el frame.      |
| Reaparecer sobre un enemigo parado a la salida del pozo.                                     | `RESPAWN_GRACE_MS` de invulnerabilidad; los enemigos no avanzan durante los primeros 500 ms tras reaparecer.   |
| Espacio mantenido en el campo de iniciales sigue inflando.                                   | Bucle parado con el modal abierto y listeners en el canvas, no en `window`.                                     |

---

## Lo que **no** entra en esta spec

- Túneles que se cierran por sí solos, gemas o cualquier terreno vivo (variante `02-derrumbe.md`).
- Diseños de cueva distintos por ronda.
- Animaciones de intro, de transición entre rondas o pantalla de mapa.
- Sonido.
- Skins.
- Dos jugadores.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
