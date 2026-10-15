# SPEC — DIG DUG: derrumbe

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06, SPEC 11, SPEC 13
> **Fecha:** 2026-10-15
> **Objetivo:** Diseñar una variante de Dig Dug en la que **los túneles se cierran solos** — los que nadie transita se agrietan y se rellenan de tierra, enterrando a quien siga dentro — con gemas escondidas en el subsuelo en lugar de rocas, como ficha nueva `dig-dug` en categoría ARCADE con motor real y leaderboard en Supabase.

---

## Por qué existe esta spec

La variante `01-clasico-excavacion.md` es el Dig Dug de 1982: el terreno cambia **solo cuando el jugador excava**, y el arma de terreno son las rocas, que son un puñado de objetos fijos que se aprovechan una vez. Esa variante trata el subsuelo como un lienzo que sólo se destruye.

Aquí la idea es la contraria: **el subsuelo se regenera**. Cada celda excavada empieza a «envejecer» en cuanto nadie la pisa; pasado un tiempo se agrieta durante 1,2 s y, si sigue vacía, vuelve a ser tierra. Si en ese momento hay alguien dentro, queda enterrado. Eso convierte los túneles en un recurso con fecha de caducidad y cambia tres cosas del juego base:

1. **El jugador debe seguir moviéndose**: un túnel largo detrás de él se va cerrando, y las rutas de retirada desaparecen.
2. **Los enemigos se pueden cazar con el terreno**: atraer a un Pooka a un túnel viejo, o engancharlo y dejarlo inflado dentro de una celda que ya está agrietada, mata sin gastar bomba. Es el papel que hacían las rocas, pero el arma ahora es el escenario entero y no depende de un objeto fijo.
3. **Los enemigos pueden quedar aislados**: un bolsillo que se cierra deja a su ocupante sin camino hasta el jugador y lo fuerza a convertirse en fantasma, lo que lo hace intocable durante un rato.

Para que cavar siga teniendo recompensa más allá de «llegar al enemigo», las rocas se sustituyen por **gemas enterradas** que se cobran con encadenamiento. El resto de la identidad — Pooka, Fygar, bomba de aire en cuatro bombeos, fantasma, estratos — se mantiene, pero se reequilibra: sin rocas ni huida, el peso del juego pasa al reloj del terreno.

Como el resto de propuestas de la game-jam, **no hay código de referencia** y las constantes de esta spec son el diseño. El motor dibuja con primitivas de canvas, sin assets ni audio.

---

## Alcance

**Dentro:**

- `lib/games/dig-dug/engine.ts`: motor nuevo, todo el estado en la clausura de `createDigDugGame`, sin assets externos.
- Mundo lógico de **560×720**: grilla de 14×18 celdas de 40 px. La fila 0 es la superficie (nunca se cierra); las filas 1..17 son tierra en cuatro estratos de color.
- Terreno excavable con **edad**: cada celda excavada acumula tiempo sin ocupar, se agrieta y se rellena.
- Enterramiento: quien esté en una celda cuando se rellena muere (enemigo o jugador); los fantasmas son inmunes.
- Jugador con movimiento celda a celda interpolado, excavación y orientación.
- Bomba de aire: arpón de 3 celdas y bombeo mantenido en 4 etapas.
- Pooka y Fygar (aliento de fuego de 3 celdas), con modo fantasma al quedar aislados.
- Seis gemas enterradas por ronda, con cobro encadenado.
- Apresura: pasado un minuto por ronda los enemigos aceleran y se vuelven fantasma con más frecuencia.
- Tres vidas, una extra cada 15 000 puntos, tope 5.
- Rondas sucesivas con más enemigos y un reloj de terreno más rápido.
- Nueva ficha `dig-dug` en `lib/games.ts` (categoría `ARCADE`, color `yellow`) y clase de portada `cover-dig-dug` en `app/globals.css`.
- Una línea `dig-dug` en `GAME_ENGINES` (`lib/games/registry.ts`), con mando táctil.
- Migración `insert into public.games (id, title) values ('dig-dug', 'DIG DUG')` y su aplicación.

**Fuera de alcance (para specs futuras o para la variante `01-clasico-excavacion.md`):**

- Rocas, verdura de bonus y huida del último enemigo.
- Diseños de cueva distintos por ronda.
- Que el jugador provoque derrumbes a voluntad (bomba o pico).
- Sonido.
- Skins (`clasico`/`neon`/`retro`).
- Modo de dos jugadores.
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
  stuckMs: number; wanderMs: number; deflateMs: number;
  fire: { state: "idle" | "charge" | "burn"; ms: number; cooldown: number };
  prev: Cell | null;
  dead: number;               // 0 = vivo; >0 = ms de animación de muerte
};
type Harpoon = { state: "idle" | "out" | "attached" | "retract"; len: number; target: Enemy | null; ms: number };
type Gem = { cell: Cell; stratum: 0 | 1 | 2 | 3; taken: boolean };
```

Estado en la clausura de `createDigDugGame`:

- `terrain: boolean[]` — array plano de `COLS * ROWS`; `true` = celda excavada (`índice = row * COLS + col`).
- `age: Float32Array` y `crack: Float32Array`, ambos de `COLS * ROWS`, reservados una sola vez: `age` = ms que lleva la celda sin ocupar; `crack` = ms que le quedan al agrietado (`0` = no agrietada).
- `player`, `enemies: Enemy[]`, `gems: Gem[]`, `harpoon: Harpoon`.
- `score`, `lives`, `round`, `nextExtraLife`, `gemChain`, `gemChainMs`, `gemsTaken` (esta ronda), `roundMs`.
- `pumpAccum`, `pathTick`, `roundState: "playing" | "clear" | "dying" | "gameover"`, `stateMs`.
- Bucle: `rafId`, `lastTime`, `destroyed`. Entrada: `keys: Set<string>`, `dirStack: Dir[]`.

**Grilla y estratos**, mundo lógico 560×720:

```
COLS 14 · ROWS 18 · CELL 40 px
fila 0 — superficie (y 0..40), siempre libre y sin edad
estrato 0: filas 1..4   · estrato 1: filas 5..8
estrato 2: filas 9..12  · estrato 3: filas 13..17
```

---

## Plan de implementación

### 1. Constantes, terreno y diseño de la cueva

`lib/games/dig-dug/engine.ts`. Constantes de diseño:

```
W 560 · H 720 · CELL 40 · COLS 14 · ROWS 18
LIVES_START 3 · MAX_LIVES 5 · EXTRA_LIFE_EVERY 15000
PLAYER_START (7, 0) · START_SHAFT: (7,1), (7,2) excavadas
WALK_STEP_MS 190 · DIG_STEP_MS 330          // ms por celda
RESPAWN_GRACE_MS 1500 · DEATH_MS 900 · CLEAR_MS 1500
DT_MAX 50
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Diseño de cueva (idéntico en todas las rondas):

```
POCKETS (col inicial, fila, 3 celdas):  A (2,4) · B (9,7) · C (3,11) · D (8,14) · E (1,16) · F (10,12)
GEMS    (col, fila, estrato):           (1,3,0) · (12,3,0) · (6,6,1) · (12,9,2) · (7,11,2) · (6,15,3)
```

`initRound(round)`: `terrain` todo `false` salvo fila 0, `START_SHAFT` y los bolsillos; `age` y `crack` a cero; las seis gemas con `taken = false` en celdas de tierra; `gemChain = 0`, `gemsTaken = 0`, `roundMs = 0`; enemigos según `ENEMY_COUNT` (paso 4) en los bolsillos A, B, C, D, E, F por ese orden, uno por bolsillo, en la celda central.

Comprobación: `npm run build` limpio; con `initRound(1)` solo están excavadas fila 0, el pozo de inicio y los bolsillos, y las seis gemas están en celdas de tierra.

### 2. Jugador: movimiento, excavación y gemas

Movimiento celda a celda con interpolación (`prog` 0..1):

- Sin paso en curso (`to === null`), se lee `dirStack` y se toma la **última** dirección aún pulsada. La celda destino debe estar dentro de la grilla.
- Si el destino es tierra, el paso dura `DIG_STEP_MS`; si está excavado (incluida una celda agrietada), `WALK_STEP_MS`. La celda se marca excavada cuando `prog ≥ 0.5` del paso hacia ella; en ese instante se resetea `age` de esa celda a 0.
- Con un paso en curso, la dirección **opuesta** lo invierte al instante (`prog = 1 - prog`, origen y destino intercambiados). Cualquier otra dirección se ignora hasta llegar al centro de la celda.
- Al excavar una celda con una gema sin tomar, la gema se cobra (paso 6).
- Mientras `harpoon.state` sea `out`, `attached` o `retract`, el jugador no se mueve.
- La superficie es transitable en horizontal; entrar en la fila 1 desde la 0 excava como cualquier tierra.
- Una celda que se rellena **mientras el jugador la está cruzando** es un derrumbe (paso 5): el jugador se considera dentro de la celda de origen hasta `prog ≥ 0.5` y de la de destino a partir de ahí.

Comprobación: con `npm run dev`, el jugador deja un túnel exacto de 1 celda de ancho y reculando a mitad de paso no deja medio túnel.

### 3. Bomba de aire

Máquina de estados de `harpoon`, accionada por `Espacio` (las mismas reglas que la variante `01`, repetidas aquí porque cada spec es autosuficiente):

- **idle → out:** al pulsar `Espacio` sin arpón activo. Crece desde el centro del jugador en la dirección de `facing` a `HARPOON_SPEED 800` px/s hasta `HARPOON_RANGE 120` px (3 celdas), solo por celdas excavadas (una celda agrietada cuenta como excavada). Se detiene en la primera tierra. Sin impacto, pasa a **retract**.
- Impacto: el primer enemigo no fantasma a menos de 18 px del eje del arpón y dentro de su longitud. Pasa a **attached**: el enemigo queda inmóvil y su fuego se cancela.
- **attached:** con `Espacio` pulsado, `pumpAccum += dt`; cada `PUMP_STAGE_MS 280` el enemigo sube un `stage`. En `stage 4` revienta.
- Soltar `Espacio` → **retract** (`HARPOON_RETRACT_MS 120`), `pumpAccum = 0`, y el enemigo se desinfla un `stage` cada `DEFLATE_MS 600`. Con `stage ≥ 1` está aturdido e inofensivo; con `stage 0` vuelve a moverse.
- Re-enganchar a un enemigo conserva su `stage`. Un solo arpón a la vez. No alcanza a fantasmas.
- Si el objetivo muere por derrumbe mientras el arpón está enganchado, el arpón pasa a **retract**.

Comprobación: tres tiros que no lleguen a 4 bombeos dejan al Pooka en `stage 3`; esperar 600 ms lo baja a 2; 1 120 ms de bombeo continuo lo revienta.

### 4. Enemigos: Pooka y Fygar

Constantes:

```
ENEMY_COUNT(round)   = min(2 + round, 6)
FYGARS(round)        = min(1 + floor((round - 1) / 3), 3)   // el resto son Pookas
ENEMY_STEP_MS(round) = max(160, 300 - 12 * (round - 1))
GHOST_STEP_MS 380 · GHOST_AFTER_STUCK_MS 2500 · GHOST_MIN_MS 1200
GHOST_RANDOM_MS(round) = max(6000, 14000 - 1000 * (round - 1))
RANDOM_TURN 0.2 · PATH_TICK_MS 250 · CONTACT_RADIUS 24 px
FIRE_COOLDOWN_MS 2500 · FIRE_CHARGE_MS 500 · FIRE_BURN_MS 400 · FIRE_RANGE 3 celdas · FIRE_SIGHT 4 celdas
HURRY_AFTER_MS 60000 · HURRY_STEP_FACTOR 0.77 · HURRY_GHOST_FACTOR 0.5
```

Ronda 1: 3 enemigos (1 Fygar, 2 Pookas). Ronda 4: 6 enemigos (2 Fygars), tope.

**Movimiento normal.** En el centro de cada celda el enemigo elige entre los vecinos excavados el que minimice la distancia Manhattan al jugador; con probabilidad `RANDOM_TURN` elige uno al azar. No recula salvo en callejón sin salida; si no hay ningún vecino excavado se queda parado (y acumula `stuckMs`).

**Caminos.** Cada `PATH_TICK_MS` se hace **una** BFS desde la celda del jugador sobre celdas excavadas (las agrietadas cuentan como abiertas). Un enemigo fuera de esa componente acumula `stuckMs`; los demás lo resetean. `wanderMs` acumula siempre que no sea fantasma.

**Fantasma.** Un enemigo con `stage 0` pasa a fantasma si `stuckMs ≥ GHOST_AFTER_STUCK_MS` o `wanderMs ≥ GHOST_RANDOM_MS(round)`. Como fantasma: solo ojos, paso `GHOST_STEP_MS`, avanza hacia el jugador en línea recta (primero el eje de mayor distancia) **excavando** lo que cruza, no es alcanzable por el arpón y es **inmune al enterramiento**. Vuelve a normal cuando han pasado `GHOST_MIN_MS` y su celda está excavada y pertenece a la componente BFS del jugador.

**Fygar.** Con `stage 0`, no fantasma, `fire.cooldown ≤ 0`, jugador en su fila a ≤ `FIRE_SIGHT` celdas, Fygar mirándole y todas las celdas intermedias excavadas: `charge` (parado `FIRE_CHARGE_MS`, parpadeando), luego `burn` (`FIRE_BURN_MS`): llama de `FIRE_RANGE` celdas hacia delante que se detiene en la primera tierra y mata al jugador si le alcanza. Después `cooldown = FIRE_COOLDOWN_MS`. Enganchar al Fygar durante `charge` o `burn` cancela el fuego.

**Contacto.** Un enemigo con `stage 0` (fantasma incluido) a menos de `CONTACT_RADIUS` px del jugador lo mata, salvo durante `RESPAWN_GRACE_MS`.

**Apresura.** Cuando `roundMs ≥ HURRY_AFTER_MS`: `ENEMY_STEP_MS` y `GHOST_STEP_MS` se multiplican por `HURRY_STEP_FACTOR`, y `GHOST_RANDOM_MS` por `HURRY_GHOST_FACTOR`. El motor pinta el rótulo `¡APRESURA!` en el canvas una sola vez durante 1 500 ms al cruzar el umbral.

Comprobación: en ronda 1 hay 1 Fygar y 2 Pookas; aislar a un enemigo 2,5 s lo convierte en ojos; a los 60 s de ronda los enemigos son visiblemente más rápidos y aparece el rótulo.

### 5. Derrumbe de túneles

Constantes:

```
TUNNEL_LIFE_MS(round) = max(5000, 9000 - 500 * (round - 1))
CRACK_MS 1200 · BURY_RADIUS 20 px
```

Cada frame, para cada celda excavada de las filas 1..17:

1. Si **hay alguien dentro** (el centro del jugador o de un enemigo no fantasma a menos de `BURY_RADIUS` px del centro de la celda): `age = 0` (si la celda ya estaba agrietándose, el agrietado **continúa**: nadie lo detiene).
2. Si no, `age += dt`. Al llegar a `TUNNEL_LIFE_MS(round)` empieza el agrietado: `crack = CRACK_MS`.
3. Si `crack > 0`: `crack -= dt`. Al llegar a 0 la celda **colapsa**:
   - se comprueba quién está dentro con el mismo `BURY_RADIUS`: los enemigos no fantasma mueren por **enterramiento** (puntuación en el paso 6), el jugador muere (salvo `grace > 0`), y los fantasmas no se ven afectados;
   - la celda vuelve a `terrain = false` (tierra), `age = 0`, `crack = 0`.

Reglas adicionales:

- La fila 0 no tiene edad ni se agrieta.
- Un enemigo parado dentro de una celda (aturdido por el arpón o desinflándose) cuenta como «dentro»: reinicia `age` hasta que la celda empieza a agrietarse, pero **no** salva a su ocupante una vez agrietada.
- Cuando varias celdas colapsan en el mismo frame y entierran a varios enemigos, `burialChain` cuenta cuántos para el multiplicador del paso 6.
- Un enemigo sin camino por el cierre de un túnel se trata como aislado (paso 4).
- Una celda con una gema sin cobrar nunca está excavada (la gema se cobra al excavar), así que no envejece.
- El motor no asigna arrays ni objetos en este bucle: `age` y `crack` son `Float32Array` preasignados, y la comprobación de ocupantes recorre el array `enemies` por celda.

Comprobación: abrir un túnel largo y esperar sin pisarlo: a los 9 s las celdas más antiguas tiemblan 1,2 s y vuelven a ser tierra en el mismo orden en que se cavaron; quedarse quieto en una celda ya agrietada la entierra; la celda ocupada que no está agrietada no se cierra.

### 6. Gemas, rondas, vidas y puntuación

```
POOKA_POINTS = [100, 200, 300, 400]    // por estrato de la celda del enemigo al reventar
FYGAR_POINTS = [150, 300, 450, 600]    // ×2 si revienta con el jugador en su misma fila
BURY_MULT 3 · BURY_CHAIN = [1, 2, 3, 4]  // multiplicador por el n-ésimo enterrado en el mismo frame
GEM_POINTS  = [300, 500, 700, 900]     // por estrato de la gema
GEM_CHAIN_MS 5000 · GEM_CHAIN_MAX 4
CLEAR_BONUS_PER_GEM 200
```

- **Pop con bomba:** puntos de la tabla por tipo y estrato (`stratumOfRow(row)` de la celda del enemigo).
- **Enterramiento:** `BURY_MULT ×` los puntos que habría dado reventarlo en esa celda, multiplicado por `BURY_CHAIN[n-1]` (saturando en el último). Enterrar a un Fygar en el estrato 3 vale `600 × 3 = 1 800`.
- **Gema:** se cobra al excavar su celda. Puntos = `GEM_POINTS[estrato] × mult`, con `mult = min(1 + gemChain, GEM_CHAIN_MAX)`; luego `gemChain++` y `gemChainMs = GEM_CHAIN_MS`. Si `gemChainMs` llega a 0, `gemChain = 0`. Las gemas no las cobran los enemigos ni los fantasmas.
- Ronda completa cuando no queda ningún enemigo vivo. `CLEAR_BONUS_PER_GEM × gemsTaken` puntos, estado `clear` de `CLEAR_MS`, `round++`, `onLevel(round)` y `initRound`.
- Vida extra cada `EXTRA_LIFE_EVERY` puntos (15 000, 30 000, …), tope `MAX_LIVES`; en el tope no se otorga pero el siguiente umbral avanza.
- Muerte del jugador (contacto, fuego o enterramiento): `dying = DEATH_MS`, `lives--`. Al terminar la animación, con vidas: reaparece en `PLAYER_START` con `grace = RESPAWN_GRACE_MS`, el arpón se limpia, los enemigos vuelven a `stage 0` sin fantasma ni fuego, y los enemigos no avanzan durante los 500 ms siguientes. Sin vidas: `gameover`.

Comprobación: dos gemas cobradas en 5 s en estrato 0 suman 300 + 600; un Pooka reventado en el estrato 2 suma 300; el mismo Pooka enterrado en esa celda suma 900; dos enterrados en el mismo frame suman `900 + 1 800`.

### 7. Bucle, entrada, dibujo y avisos

- `emit()` con `lastScore` / `lastLives` / `lastLevel`, llamando a los callbacks solo cuando el valor cambia. `onLives(LIVES_START)` y `onLevel(1)` al iniciar.
- `onGameOver(score)` una sola vez, después de detener el bucle, al terminar la animación de la última muerte.
- `restart()`: detiene el bucle, reinicia `score`, `lives`, `round`, `nextExtraLife`, `initRound(1)`, `emit()` y arranca.
- `dt` en milisegundos capado a `DT_MAX`; `lastTime = null` al reanudar.
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`, `KeyD`, `Space`. `preventDefault()` solo para esas.
- Listeners `keydown` / `keyup` / `blur` sobre el canvas, nunca sobre `window` o `document`. `blur` vacía `keys`, `dirStack` y suelta `Espacio`. `P` y `Escape` no llegan al motor.
- `draw()`: estratos con su tono y textura de motas; celdas excavadas en negro; **celdas agrietadas** con grietas claras y un temblor de ±2 px que se intensifica en los últimos 400 ms, y borde que oscurece según `crack`; gemas como rombos brillantes en su estrato; Pooka rojo con gafas, Fygar verde con aletas, inflándose según `stage`; fantasmas como dos ojos; jugador con casco blanco; arpón como línea con punta; llama de 3 celdas en degradado.
- Sin puntuación, vidas ni ronda en el canvas; sí `¡LISTO!` durante `CLEAR_MS` y `¡APRESURA!`, por ser estado propio del juego.
- Ningún `draw()` ni bucle de actualización asigna arrays, objetos o clausuras por frame (SPEC 13).
- `destroy()` cancela el frame, quita los tres listeners y es idempotente.
- `initRound(1); draw();` antes de devolver el motor.

Comprobación: `npm run build` limpio; con `?fps=1` en `/jugar/dig-dug` no hay frames > 50 ms ni crecimiento de heap sostenido durante 2 minutos de juego.

### 8. Catálogo: nueva ficha `dig-dug`

`lib/games.ts`, nueva entrada en `GAMES`:

```ts
{
  id: "dig-dug",
  title: "DIG DUG",
  short: "Excava, infla a los monstruos y no dejes que la mina se cierre sobre ti.",
  long: "Un minero abre túneles en un subsuelo vivo: los pasadizos que nadie pisa se agrietan y se rellenan de tierra, enterrando a quien siga dentro. Cobra gemas en cadena, revienta a Pookas y Fygars con tu bomba de aire o atráelos a un túnel que se cierra. Si te aíslan, se vuelven fantasmas.",
  cat: "ARCADE",
  cover: "cover-dig-dug",
  color: "yellow",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `.cover-dig-dug` nueva (bandas de color de estrato con una grieta en zigzag y una gema, sin imagen externa).

Comprobación: `/juegos/dig-dug` muestra la ficha en la biblioteca con su portada antes de registrar el motor.

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

Comprobación: `/jugar/dig-dug` pinta el canvas real; en móvil aparece el mando con `BOMBA` y mantenerlo pulsado infla.

### 10. Leaderboard

`supabase/migrations/<timestamp>_juego_dig_dug.sql`:

```sql
insert into public.games (id, title) values ('dig-dug', 'DIG DUG');
```

Idéntica a la de la variante `01`: solo se aplica **una** de las dos, la que el usuario promueva. Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`; los tipos no se regeneran.

Comprobación: `select * from public.games` incluye la fila `dig-dug`.

### 11. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido manual de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/dig-dug` muestra un canvas de 560×720 con cielo, cuatro estratos, un pozo inicial, bolsillos con enemigos y seis gemas visibles en la tierra.
- [ ] El jugador empieza en la superficie con 3 vidas en el HUD y ronda 01.
- [ ] Mover el jugador por tierra abre un túnel de una celda de ancho; por un túnel abierto va más rápido que excavando.
- [ ] Pulsar la dirección contraria a mitad de paso invierte el movimiento sin dejar medio túnel.
- [ ] Una celda excavada que nadie ocupa se agrieta a los 9 s en la ronda 1 y tiembla 1,2 s antes de cerrarse.
- [ ] Una celda excavada en la que hay alguien dentro no empieza a agrietarse.
- [ ] Una celda ya agrietada que el jugador cruza se cierra igualmente; si sigue dentro al terminar el agrietado, pierde una vida.
- [ ] La fila 0 nunca se agrieta.
- [ ] Una celda cerrada vuelve a ser tierra y se puede excavar de nuevo.
- [ ] En la ronda 5 las celdas se agrietan a los 7 s; nunca antes de 5 s en ninguna ronda.
- [ ] `Espacio` dispara un arpón de 3 celdas que se detiene en la primera tierra y atraviesa celdas agrietadas.
- [ ] El arpón engancha a un enemigo; con `Espacio` mantenido infla en 4 etapas visibles y a los 1 120 ms revienta.
- [ ] Soltar `Espacio` a medias retrae el arpón y el enemigo se desinfla una etapa cada 600 ms.
- [ ] Un enemigo con `stage ≥ 1` no mata al tocarlo; con `stage 0` sí.
- [ ] Un Pooka persigue al jugador por los túneles abiertos y se detiene si un cierre lo aísla.
- [ ] Un enemigo sin camino al jugador durante 2,5 s se convierte en ojos que atraviesan la tierra y vuelve a ser sólido al entrar en un túnel conectado.
- [ ] Un fantasma no puede ser enganchado y no muere si la celda en la que está se cierra.
- [ ] Un enemigo aturdido o inflado dentro de una celda agrietada muere enterrado cuando ésta se cierra.
- [ ] Reventar un Pooka con la bomba en el estrato 0 suma 100 y en el estrato 3 suma 400; enterrarlo en la misma celda suma el triple.
- [ ] Un Fygar reventado con el jugador en su misma fila suma el doble que fuera de ella.
- [ ] Dos enemigos enterrados en el mismo frame suman 1× y 2× sus puntos de enterramiento respectivamente.
- [ ] Un Fygar alineado a ≤ 4 celdas parpadea 500 ms y lanza una llama de 3 celdas que mata al jugador y se detiene ante la tierra; engancharlo durante la carga cancela el fuego.
- [ ] Excavar la celda de una gema la cobra: 300/500/700/900 según estrato, con multiplicador ×2, ×3, ×4 si se encadena en menos de 5 s.
- [ ] Pasados 5 s sin cobrar otra gema, el multiplicador vuelve a ×1.
- [ ] Completar la ronda suma 200 por cada gema cobrada en ella, muestra `¡LISTO!`, pasa a ronda 02 y aparecen 4 enemigos con las seis gemas de nuevo.
- [ ] A los 60 s de ronda aparece `¡APRESURA!` una sola vez y los enemigos van más rápido.
- [ ] Morir con vidas restantes hace reaparecer al jugador en la superficie con 1 500 ms de parpadeo; si su pozo se ha cerrado, puede excavar de nuevo.
- [ ] A los 15 000 puntos el HUD pasa de 3 a 4 vidas; con 5 vidas no pasa de 5.
- [ ] Perder la última vida abre el modal `FIN DEL JUEGO` con la puntuación real, una sola vez.
- [ ] El canvas no dibuja puntos, vidas ni ronda, ni overlay de game over.
- [ ] El botón `PAUSA` congela el juego, incluidos los relojes de agrietado, y `REANUDAR` lo reanuda sin que ninguna celda se cierre de golpe.
- [ ] `P` y `Escape` hacen lo mismo que el botón.
- [ ] Con el canvas enfocado, flechas y espacio no hacen scroll de la página.
- [ ] Escribir `W`, `A`, `S`, `D` o espacio en el campo de iniciales no mueve ni dispara.
- [ ] `JUGAR DE NUEVO` reinicia a ronda 1, 0 puntos y 3 vidas sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'dig-dug'`, y dos pulsaciones seguidas no insertan dos filas.
- [ ] Esa puntuación aparece en `/salon?juego=dig-dug` y en `/juegos/dig-dug` sin recargar a mano.
- [ ] Con `scores` vacía para este juego, `/salon?juego=dig-dug` muestra el estado vacío.
- [ ] En móvil el mando táctil muestra la cruceta y `BOMBA`; mantener `BOMBA` infla.
- [ ] Con `?fps=1` no hay frames > 50 ms ni crecimiento sostenido del heap tras 2 minutos de partida con muchas celdas agrietándose.
- [ ] Navegar de `/jugar/dig-dug` a `/biblioteca` y volver no duplica el bucle.
- [ ] Dejar la pestaña en segundo plano y volver no cierra varias celdas ni mueve enemigos varias celdas de golpe.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid`, `/jugar/snake` y `/jugar/frogger` se juegan igual que antes.
- [ ] `/jugar/gloton` y los otros juegos sin motor se comportan igual que antes.
- [ ] `select * from public.games` incluye `dig-dug` y no pierde ninguna fila anterior.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/dig-dug`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** mismo `game-id`, mundo, grilla y controles que `01-clasico-excavacion.md`. Las dos variantes son alternativas para la **misma** ficha; se promueve una, nunca las dos.
- **Sí:** los túneles se cierran solos. Es la única regla de fondo que separa esta variante del clásico, y hace del terreno un recurso con caducidad, no un lienzo permanente.
- **Sí:** el cierre **no** perdona al jugador: si está dentro cuando se rellena, muere. Un telegrafiado de 1,2 s y un paso de 190 ms dejan tiempo de sobra para salir; que sea letal es lo que lo convierte en arma contra los enemigos también.
- **Sí:** entrar en una celda agrietada no la salva. Sin esta regla bastaría pisar el túnel para evitar cualquier cierre y el reloj no tendría efecto.
- **Sí:** las celdas ocupadas no envejecen. Evita que un enemigo parado en un callejón o el propio jugador quieto sufran un derrumbe sin aviso.
- **Sí:** los fantasmas son inmunes al enterramiento. Mantiene su papel de amenaza que atraviesa la tierra y evita la contradicción de «enterrar a unos ojos» en una celda que ellos mismos excavan.
- **Sí:** quitar las rocas. El derrumbe cumple su papel de arma de terreno y dos sistemas de aplastamiento complicarían la lectura y el testeo.
- **Sí:** gemas en lugar de verdura. Dan una razón para excavar hacia zonas sin enemigos y un cobro encadenado que premia rutas planificadas.
- **Sí:** sin huida del último enemigo. Con un terreno que se cierra, el último enemigo acaba aislado y convertido en fantasma por sí solo; la ronda no se alarga por esconderse.
- **Sí:** `¡APRESURA!` a los 60 s. Sustituye a la huida como freno a rondas eternas.
- **Sí:** puntuaciones de pop reducidas respecto a `01` (100–400 en vez de 200–500) y enterrar vale ×3. Empuja a usar el terreno, que es la identidad de esta variante.
- **No:** que el jugador provoque derrumbes a voluntad. Sería un nuevo botón y otra spec.
- **No:** sonido ni skins. No hay assets y los motores nuevos no los exigen.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo                                                                                        | Mitigación                                                                                                            |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| El cierre mata al jugador sin que lo vea venir y la partida se siente injusta.                | 1,2 s de temblor visible, intensificado en los últimos 400 ms, más 1 500 ms de gracia al reaparecer; criterio de aceptación de legibilidad. |
| El reloj de 9 s es demasiado corto o largo y el juego es frustrante o trivial.                | `TUNNEL_LIFE_MS` y `CRACK_MS` fijados en el paso 5 como constantes de diseño; se ajustan en una revisión de la spec, no a ojo en el motor. |
| El jugador se queda sin túnel de retirada en un callejón y no puede ir a ningún sitio.        | Siempre puede excavar cualquier celda adyacente; la peor caída es perder tiempo, no quedar atrapado.                  |
| Recorrer las 238 celdas excavables por frame castiga en móviles.                  | `Float32Array` preasignados, un solo recorrido lineal por frame y comprobación de ocupantes por distancia; criterio `?fps=1`. |
| Un enemigo aturdido en una celda que se agrieta hace que el jugador pierda el arpón-objetivo. | El arpón pasa a `retract` si el objetivo muere; no se queda enganchado a un enemigo inexistente.                      |
| Pestaña en segundo plano: `age` acumula `dt` y cierra decenas de celdas de golpe.             | `dt` capado a 50 ms y `lastTime = null` al reanudar; el reloj de terreno usa el mismo `dt`.                           |
| Aislar a todos los enemigos a la vez los convierte en fantasmas y el jugador no puede hacer nada. | `GHOST_MIN_MS` de 1 200 ms y vuelta a la normalidad al conectar con la componente del jugador; la apresura acorta los plazos. |
| El mando táctil no envía `keyup` fiable y el bombeo se atasca.                                | El motor trata `Espacio` como estado (`keys`) y suelta en `blur`; criterio de aceptación en móvil real.               |
| Espacio mantenido en el campo de iniciales sigue inflando.                                    | Bucle parado con el modal abierto y listeners en el canvas, no en `window`.                                           |

---

## Lo que **no** entra en esta spec

- Rocas, verdura de bonus y huida del último enemigo (variante `01-clasico-excavacion.md`).
- Diseños de cueva distintos por ronda.
- Provocar derrumbes a voluntad.
- Sonido.
- Skins.
- Dos jugadores.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
