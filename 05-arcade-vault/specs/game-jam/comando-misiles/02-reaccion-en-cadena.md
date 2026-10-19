# SPEC — COMANDO MISILES: reacción en cadena

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-08
> **Objetivo:** Diseñar una variante de Missile Command donde cada misil enemigo destruido
> detona una explosión secundaria que puede destruir al siguiente, premiada con un combo por
> disparo, con munición escasa y un taller entre oleadas donde se gastan créditos en mejoras
> (radio, munición, profundidad de cadena y reconstrucción de ciudades), como ficha nueva
> `comando-misiles` en categoría SHOOTER, con motor real y leaderboard en Supabase.

---

## Por qué existe esta spec

La variante 01 (`01-defensa-clasica.md`) es la lectura fiel de 1980: la explosión del jugador
mata lo que toca y se acabó; la decisión es _dónde_ detonar y _cuánta_ munición gastar, y el
tablero se reinicia igual en cada oleada. Esta variante comparte con ella **todo lo que define
el género**: mundo 800×600, seis ciudades y tres baterías en las mismas posiciones, apuntado con
mira (ratón o teclado), misiles enemigos en línea recta hacia un objetivo vivo, división MIRV y
explosiones circulares con ciclo crecer/mantener/encoger. Lo que cambia es la **economía del
disparo**.

Hay dos cambios de diseño, y los dos empujan en la misma dirección: premiar al jugador que
**planifica un solo disparo para que haga el trabajo de varios**.

1. **Cadena.** Un misil enemigo que muere dentro de una explosión amiga deja otra explosión más
   pequeña en el punto donde murió. Una detonación bien colocada sobre un racimo desencadena una
   cascada; los kills de una misma cascada puntúan con un multiplicador creciente. La munición
   baja (8 por batería en vez de 10) porque la cadena la compensa: gastar un misil en un punto
   aislado es más caro que en la variante 01.
2. **Taller.** Cada kill y cada ciudad que sobrevive dan créditos, y entre oleadas el jugador
   los gasta en cuatro mejoras permanentes de la partida. Desaparece la ciudad extra gratuita
   cada 10 000 puntos de la variante 01: aquí **se compra** (mejora «reconstruir ciudad»), de modo
   que perder una ciudad es una decisión de coste, no un estado que el juego arregla solo.

Para que las mejoras tengan un enemigo contra el que valer, aparece el **misil blindado** desde
la oleada 4: necesita dos explosiones distintas. Se quita el bombardero de la variante 01, que
es su elemento especial; aquí el elemento especial es el blindado.

Como con Snake (SPEC 10) y con las propuestas de `ciempies` y `ranaria`, **no hay código de
referencia**: las constantes de este documento son el diseño en sí; cambiarlas durante la
implementación es rediseñar, no implementar. El motor dibuja todo con primitivas de canvas, sin
spritesheet.

---

## Alcance

**Dentro:**

- `lib/games/comando-misiles/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createComandoMisilesGame`, sin assets externos.
- Mundo lógico, geometría de ciudades/baterías, controles de mira (ratón o teclado) y disparo
  desde la batería viva con munición más cercana: **idénticos a la variante 01** (se repiten
  aquí las constantes que se usan, porque cada spec es autosuficiente).
- Reacción en cadena: explosión secundaria por cada misil enemigo destruido por una explosión
  amiga, hasta una profundidad máxima que sube con una mejora.
- Combo por cascada: el _n_-ésimo kill de una misma cascada puntúa `n` veces el valor base
  (con tope).
- Misil blindado (2 impactos de explosiones distintas) desde la oleada 4.
- División MIRV de misiles enemigos desde la oleada 2, como en la variante 01.
- Créditos: se ganan por kill, por cascada larga y por ciudad superviviente al cerrar la oleada.
- Estado `shop` (taller) dibujado en el canvas entre oleadas, con cuatro mejoras compradas con
  teclado (flechas/WASD + `Space` comprar + `Enter` continuar) o ratón (clic en la fila y en el
  botón `SIGUIENTE OLEADA`).
- Multiplicador de oleada más lento que en la variante 01 (`×4` tope).
- Nueva ficha `comando-misiles` en `lib/games.ts` (categoría `SHOOTER`) y clase de portada
  `cover-comando-misiles` en `app/globals.css`.
- Una línea `comando-misiles` en `GAME_ENGINES` (`lib/games/registry.ts`).
- Migración `insert into public.games (id, title) values ('comando-misiles', 'COMANDO MISILES')`
  y su aplicación.

**Fuera de alcance (para specs futuras o para la variante `01-defensa-clasica.md`):**

- Bombardero, satélite y misiles inteligentes.
- Bonus por misiles sobrantes (aquí la munición sobrante no puntúa: se pierde al recargar).
- Ciudad extra gratuita por umbral de puntos.
- Sonido.
- Mando táctil específico más allá del mapeo declarado en el registro.
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
type Target = { kind: "city" | "battery"; index: number; x: number }; // y = GROUND_Y
type EnemyMissile = {
  from: Vec;
  pos: Vec;
  target: Target;
  speed: number; // px/s
  hp: number; // 1 normal · 2 blindado
  lastBlastId: number; // id de la última explosión que le quitó HP; evita dos golpes de la misma
  splitsAt: number | null;
  isChild: boolean;
};
type PlayerMissile = { from: Vec; pos: Vec; dest: Vec; speed: number; battery: number };
type Blast = {
  id: number; // incremental, único por partida
  pos: Vec;
  r: number;
  rMax: number;
  phase: "grow" | "hold" | "shrink";
  holdLeft: number;
  hostile: boolean; // true = impacto enemigo en el suelo
  depth: number; // 0 = explosión del disparo; 1.. = explosiones secundarias
  lineage: number; // índice en el pool `lineages`; -1 si hostil
};
type PendingChain = { pos: Vec; delay: number; depth: number; lineage: number };
type Lineage = { kills: number; live: number }; // live = blasts + PendingChain activos
type City = { x: number; alive: boolean };
type Battery = { x: number; alive: boolean; ammo: number };
type Upgrades = { radius: number; ammo: number; chain: number }; // niveles comprados
```

Estado en la clausura de `createComandoMisilesGame`:

- `cities: City[]` (6), `batteries: Battery[]` (3), `upgrades: Upgrades`.
- `enemies: EnemyMissile[]`, `shots: PlayerMissile[]`, `blasts: Blast[]`,
  `pending: PendingChain[]`, `lineages: Lineage[]` (pool fijo de 32, ver paso 3).
- `cursor: Vec`, `cursorVisible`, `nextBlastId`.
- `score`, `wave`, `credits`.
- Cola de la oleada: `toSpawn`, `spawnAccum`.
- `state: "banner" | "playing" | "intermission" | "shop" | "dying" | "gameover"`,
  `stateAccum` (ms), `shopIndex` (fila seleccionada, 0..4), `fireCooldown` (ms).
- Bucle: `rafId`, `lastTime`, `destroyed`. Entrada: `keys: Set<string>`.

**Geometría fija**, idéntica a la variante 01:

```
GROUND_Y 560 · franja de suelo y 560..600
Baterías (x): 60 · 400 · 740
Ciudades (x): 160 · 240 · 320 · 480 · 560 · 640
CITY_W 44 · CITY_H 24 · BATTERY_W 40 · BATTERY_H 20
```

---

## Plan de implementación

### 1. Constantes y estado inicial

`lib/games/comando-misiles/engine.ts`, primera parte. Constantes de diseño:

```
W 800 · H 600 · GROUND_Y 560 · DT_MAX 50 ms
CITY_COUNT 6 · BATTERY_COUNT 3
AMMO_BASE 8   (por batería; la mejora MUNICIÓN suma AMMO_STEP 2 por nivel, hasta 3 niveles → 14)
CURSOR_MIN_Y 30 · CURSOR_MAX_Y 530 · CURSOR_KEY_SPEED 420 px/s
FIRE_COOLDOWN 120 ms · POST_SHOP_FIRE_LOCK 250 ms
BANNER_MS 1400 · INTERMISSION_MS 2600 · DYING_MS 1600
MAX_SCORE 999999   (scores.score tiene CHECK 0..1.000.000; el motor nunca emite más)
MAX_CREDITS 999
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

`initGame()` coloca ciudades y baterías vivas, `upgrades = { 0, 0, 0 }`, `credits = 0`,
`wave = 1`, `score = 0`, mira en `(400, 300)`, y entra en `banner`. `startWave()` recarga cada
batería **viva** a `AMMO_BASE + AMMO_STEP × upgrades.ammo`, **reconstruye las baterías
destruidas** (con esa misma munición), calcula `toSpawn` (paso 2) y entra en `banner`
durante `BANNER_MS`. **Las ciudades no se reconstruyen solas**: sólo con la mejora del taller.

Comprobación: `npm run build` limpio con el motor aún sin registrar.

### 2. Oleadas y misiles enemigos

Constantes (más misiles que en la variante 01, porque la cadena los hace más baratos de matar):

```
CARRIERS(wave) = min(14 + 2 * (wave - 1), 34)
ENEMY_SPEED(wave) = min(45 + 7 * (wave - 1), 130)  px/s
SPAWN_GAP(wave) = max(450, 1700 - 100 * (wave - 1))  ms
MAX_ACTIVE_CARRIERS(wave) = min(5 + wave, 14)
SPLIT_CHANCE(wave) = 0 en la oleada 1; min(0.15 + 0.05 * (wave - 2), 0.5) desde la 2
SPLIT_Y_RANGE [120, 300] · SPLIT_COUNT 2 o 3 (50/50) · hijos con isChild = true
ARMORED_FROM_WAVE 4
ARMORED_CHANCE(wave) = 0 antes de la 4; min(0.15 + 0.05 * (wave - 4), 0.4)
ARMORED_SPEED_FACTOR 0.8 · ARMORED_HP 2
```

Lógica de lanzamiento, vuelo, división e impacto: **igual que en la variante 01** (origen
`y = 0` y `x ∈ [20, 780]`, objetivo uniforme entre los vivos, trayectoria recta, estela desde
`from`; los hijos sortean objetivo propio; si el objetivo ya estaba destruido el misil sigue
hasta el suelo y detona sin efecto; al llegar a `GROUND_Y` crea una explosión hostil). Diferencias:

- Al nacer, un portador es blindado con probabilidad `ARMORED_CHANCE(wave)`. Un blindado
  **no se parte** (`splitsAt = null`) y avanza a `ENEMY_SPEED × ARMORED_SPEED_FACTOR`. Los hijos
  de una división nunca son blindados.
- La oleada termina cuando `toSpawn === 0`, no queda `EnemyMissile`, `shots`, `blasts` ni
  `pending` activos.
- Explosión hostil: igual que en 01 (`IMPACT_BLAST_R_MAX 30`, destruye sólo su `Target` si está
  a menos de `IMPACT_BLAST_R_MAX + 12` px en `x`; no mata misiles enemigos ni activa cadena).

Comprobación: `npm run build` limpio; la oleada 1 lanza 14 portadores, la 4 incluye al menos un
blindado (se fuerza con una semilla de prueba a mano).

### 3. Explosiones, cadena y combo

Constantes:

```
PLAYER_SPEED_SIDE 360 px/s · PLAYER_SPEED_CENTER 600 px/s
BLAST_R_BASE 34 px · RADIUS_STEP 6 px por nivel (máx 4 niveles → 58 px)
BLAST_GROW 100 px/s · BLAST_SHRINK 100 px/s
BLAST_HOLD_MS 150 (explosión del disparo) · CHAIN_HOLD_MS 100 (secundarias)
CHAIN_R_FACTOR 0.7   (rMax de una secundaria = round(rMax del disparo × 0.7))
CHAIN_DELAY_MS 80    (la secundaria nace 80 ms después de la muerte, para que la cascada se vea)
CHAIN_DEPTH_BASE 2 · CHAIN_DEPTH_STEP 1 por nivel (máx 3 niveles → 5)
MAX_BLASTS 64 · MAX_PENDING 32 · MAX_LINEAGES 32
```

- **Disparo:** clic o `Space` (sin autorepeat). Elige la batería viva con `ammo > 0` más
  cercana en `x` al punto de mira; si ninguna, se ignora. `ammo--`, nace un `PlayerMissile`
  con `dest` = mira. Sólo en estado `playing`.
- **Detonación:** al llegar a `dest`, nace una `Blast` con `depth = 0`, `rMax = BLAST_R_BASE +
  RADIUS_STEP × upgrades.radius`, `hostile = false`, y se reserva un `Lineage` libre del pool
  (`kills = 0`, `live = 1`). Si el pool está lleno (32 cascadas activas a la vez), la explosión
  nace igual pero **sin** linaje (`lineage = -1`): puntúa sin combo.
- **Muerte de un misil enemigo.** En cada frame, cada `EnemyMissile` con la cabeza dentro del
  radio de una `Blast` amiga (`!hostile`) y `blast.id !== enemy.lastBlastId` pierde 1 HP y fija
  `lastBlastId = blast.id`. Con `hp > 0` sobrevive (el blindado, tras el primer golpe, cambia de
  color). Con `hp === 0` muere en `pos`, y:
  1. `lineage.kills++` (si hay linaje) → `n = lineage.kills`.
  2. Puntos: `POINTS_MISSILE × MULT(wave) × min(n, COMBO_CAP)` (paso 4). Sin linaje, `n = 1`.
  3. Créditos: `+1` (`+2` si era blindado).
  4. Si `blast.depth < CHAIN_DEPTH_BASE + CHAIN_DEPTH_STEP × upgrades.chain`, se añade un
     `PendingChain` en `pos` con `delay = CHAIN_DELAY_MS`, `depth = blast.depth + 1` y el mismo
     linaje (`live++`). Si `pending` está lleno se descarta la secundaria (los puntos ya se
     contaron).
  Si el misil queda dentro de **varias** explosiones el mismo frame, cuenta sólo la de menor
  `id` (la más antigua): un solo kill y una sola secundaria.
- **Secundarias:** al agotarse `delay`, nace una `Blast` amiga con `rMax = round(rMax_del_disparo
  × CHAIN_R_FACTOR)`, `depth` y `lineage` heredados, ciclo grow/hold/shrink con
  `CHAIN_HOLD_MS`. Una secundaria nunca se origina en el suelo: se descartan las que nazcan con
  `y >= GROUND_Y - 4` (el misil murió pegado al impacto).
- **Cierre de linaje:** cuando una `Blast` o `PendingChain` desaparece, `lineage.live--`. Con
  `live === 0` el linaje se libera; si `kills >= COMBO_CREDIT_FROM (4)`, se otorgan
  `kills - 3` créditos de bonus (cascada de 6 → +3). Los créditos se acotan a `MAX_CREDITS`.
- Las explosiones del jugador y las secundarias **no** hacen daño a ciudades, baterías ni a otros
  misiles del jugador.

Comprobación: `npm run build` limpio; con tres misiles de prueba en fila, un solo clic provoca
tres muertes en cascada, con un hueco visible de ~80 ms entre explosiones.

### 4. Puntuación, multiplicador, créditos y cierre de oleada

Constantes:

```
POINTS_MISSILE 25 · POINTS_ARMORED 75 (en vez de 25 para blindados; también × combo)
MULT(wave) = min(1 + floor((wave - 1) / 3), 4)   (oleadas 1-3 ×1, 4-6 ×2, 7-9 ×3, 10+ ×4)
COMBO_CAP 6   (el sexto kill de una cascada y los siguientes valen ×6)
POINTS_SURVIVING_CITY 100 (× MULT) · CITY_CREDITS 3 (créditos por ciudad viva al cierre)
```

- `score = min(score + delta, MAX_SCORE)` en cada suma.
- Fin de oleada → `intermission` (`INTERMISSION_MS`): cuenta de ciudades vivas en el canvas;
  suma `POINTS_SURVIVING_CITY × MULT` y `CITY_CREDITS` por cada una. **La munición sobrante no
  puntúa ni da créditos.**
- Al terminar `intermission`, si hay al menos una mejora comprable o aunque no la haya, el
  estado pasa siempre a `shop` (la tienda se muestra aunque el jugador no pueda comprar nada:
  el botón de continuar siempre está disponible).
- El canvas **no** dibuja puntos, nivel ni vidas. Sí dibuja: `OLEADA N`, `DEFENDIDA`, el
  conteo `CIUDADES ×c` y, en el taller, los **créditos y costes** (que son recurso interno del
  juego, no puntuación del HUD).

Comprobación: `npm run build` limpio; una cascada de 5 kills en la oleada 1 suma
`25 × (1+2+3+4+5) = 375` en el HUD.

### 5. Taller (estado `shop`)

Cinco filas, dibujadas en el canvas, con una fila seleccionada (`shopIndex`):

```
0 RADIO             niveles 0..4 · coste [12, 20, 30, 44]  · +6 px al radio de explosión
1 MUNICIÓN          niveles 0..3 · coste [10, 18, 28]      · +2 misiles por batería
2 CADENA            niveles 0..3 · coste [16, 26, 40]      · +1 generación de secundarias
3 RECONSTRUIR       repetible    · coste 25                 · revive una ciudad (la más a la
                                                              izquierda destruida); desactivada
                                                              si no hay ninguna destruida
4 SIGUIENTE OLEADA  sin coste    · sale del taller, wave++ y startWave()
```

- Cada fila de mejora muestra nombre, pips de nivel (llenos/vacíos), coste del siguiente nivel
  (o `MAX`) y se atenúa si `credits < coste`.
- **Teclado:** `ArrowUp/ArrowDown` o `KeyW/KeyS` mueven `shopIndex` (con vuelta); `Space` compra
  la fila seleccionada si hay créditos y no está al máximo (descuenta `credits`, aplica el efecto,
  `nivel++`); en la fila 4, `Space` equivale a continuar. `Enter` continúa desde cualquier fila.
- **Ratón:** el clic sobre una fila (rectángulos de `x 200..600`, `y = 150 + 56 × i`, alto 48)
  selecciona **y** compra; el clic sobre la fila 4 continúa. En `shop` la mira no dispara.
- **Efectos al comprar:** RADIO y CADENA se leen en la siguiente detonación; MUNICIÓN suma
  `AMMO_STEP` a la munición actual de cada batería **viva** y a la recarga de oleadas
  siguientes; RECONSTRUIR deja la ciudad viva de inmediato.
- Al continuar: `wave++`, `startWave()` y `fireCooldown = POST_SHOP_FIRE_LOCK` para que el clic
  que continúa no dispare en la oleada nueva.
- El taller no tiene temporizador, pero sí respeta `PAUSA`: el bucle parado no procesa entrada.

Comprobación: `npm run build` limpio; comprar RADIO nivel 1 con 12 créditos deja 0 y el
siguiente disparo tiene `rMax = 40`.

### 6. Fin de partida

- Cuando `cities.every(c => !c.alive)` durante `playing`: `state = "dying"` durante `DYING_MS`,
  luego `stopLoop()` y `onGameOver(score)` **una sola vez**. Los misiles en vuelo siguen su
  curso; las cadenas pendientes se resuelven y puntúan hasta el final.
- No hay taller tras el game over, ni se pierde el score por créditos sin gastar.
- Quedarse sin munición no termina la partida: la oleada sigue hasta que caiga el último misil.
- `onLives(n)` reporta las **ciudades vivas** (6 al inicio); `onLevel(wave)` en cada `wave++`.

Comprobación: `npm run build` limpio; perder la sexta ciudad abre el modal `FIN DEL JUEGO`
tras `DYING_MS`.

### 7. Bucle, entrada y avisos

- `emit()` con `lastScore` / `lastLives` / `lastLevel`, llamando a los callbacks sólo cuando el
  valor cambia. `onLives(6)` y `onLevel(1)` al iniciar.
- `dt` en ms, capado a `DT_MAX`; `lastTime = null` al reanudar. **Todos** los acumuladores
  (`spawnAccum`, `stateAccum`, `holdLeft`, `delay` de cada `PendingChain`, `fireCooldown`)
  avanzan con `dt`.
- Ratón y teclado para la mira: igual que la variante 01 (normalización
  `(clientX - rect.left) * (W / rect.width)`, clamp a `CURSOR_MIN_Y..CURSOR_MAX_Y`,
  `canvas.style.cursor = "none"` restaurado en `destroy()`; manda el ratón mientras se movió en
  el frame anterior).
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`,
  `KeyD`, `Space`, `Enter`. `preventDefault()` solo para esas. `P` y `Escape` no llegan al
  motor.
- Listeners `keydown` / `keyup` / `blur` / `mousemove` / `mousedown` sobre el canvas, nunca
  sobre `window` o `document`.
- `restart()`: detiene el bucle, vacía enemigos/misiles/explosiones/pendientes/linajes, reinicia
  `score`, `wave`, `credits`, `upgrades`, ciudades y baterías, `initGame()`, `emit()`, arranca.
- `destroy()` cancela el frame, quita los listeners, restaura el cursor y es idempotente.
- Pools de tamaño fijo (`blasts` 64, `pending` 32, `lineages` 32, `shots` 32, `enemies` 64) y
  `draw()` sin asignaciones de arrays/objetos/clausuras (SPEC 13). Si un pool está lleno,
  el elemento nuevo se descarta de forma segura (ver paso 3).
- `initGame(); draw();` antes de devolver el motor.

Comprobación: `getEngine("comando-misiles")` (tras el paso 9) devuelve la entrada y
`npm run build` sigue limpio.

### 8. Catálogo: nueva ficha `comando-misiles`

`lib/games.ts`, nueva entrada en `GAMES`:

```ts
{
  id: "comando-misiles",
  title: "COMANDO MISILES",
  short: "Una explosión bien puesta derriba a todo el enjambre.",
  long: "Seis ciudades, tres baterías y munición escasa. Cada misil que derribas estalla a su vez y arrastra al siguiente: coloca una sola detonación sobre el racimo y deja que la cadena haga el resto. Entre oleadas, gasta tus créditos en radio, munición y reconstrucción antes de que lleguen los blindados.",
  cat: "SHOOTER",
  cover: "cover-comando-misiles",
  color: "yellow",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `.cover-comando-misiles` nueva, en el mismo patrón que las portadas
generadas existentes.

Comprobación: `/juegos/comando-misiles` muestra la ficha en la biblioteca con su portada,
antes de que el motor esté registrado.

### 9. Registrar el motor

`lib/games/registry.ts`:

```ts
"comando-misiles": {
  create: createComandoMisilesGame,
  width: 800,
  height: 600,
  controls: "ratón para apuntar y clic para disparar, o flechas/WASD para mover la mira y espacio para disparar; en el taller, flechas para elegir, espacio para comprar y enter para continuar",
  touch: { a: { code: "Space", label: "DISPARO" }, b: { code: "Enter", label: "SIGUIENTE" } },
},
```

La cruceta táctil mueve la mira en juego y la selección en el taller; A dispara o compra; B
continúa desde el taller. Un toque directo sobre el canvas dispara (o compra una fila) por el
`mousedown` sintético del navegador.

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
- [ ] El HUD muestra 6 «vidas» (ciudades) y oleada 01 desde el inicio.
- [ ] Cada batería arranca con 8 misiles; las laterales son más lentas que la central.
- [ ] Un clic detona en el punto exacto del clic con radio 34 px antes de cualquier mejora.
- [ ] Un misil enemigo derribado deja una explosión secundaria ~80 ms después en el punto donde
      murió, más pequeña (24 px) que la del disparo.
- [ ] Tres misiles alineados dentro del alcance de la cadena mueren con un solo disparo; el
      HUD suma `25 × (1 + 2 + 3) = 150` en la oleada 1.
- [ ] El sexto kill de una misma cascada y los siguientes valen `×6`, no más.
- [ ] Dos disparos distintos tienen cascadas independientes: el combo de uno no sube el del
      otro.
- [ ] Una cascada de 6 kills otorga `6 + 3` créditos (1 por kill + bonus de combo).
- [ ] Sin mejora de CADENA, las secundarias sólo se encadenan hasta profundidad 2; con el nivel
      3, hasta 5.
- [ ] Un misil dentro de dos explosiones a la vez muere una sola vez y genera una sola
      secundaria.
- [ ] Desde la oleada 4 aparece algún misil blindado: la primera explosión lo daña y cambia su
      color, la segunda **distinta** lo mata; dos fotogramas dentro de la misma explosión no
      cuentan como dos golpes.
- [ ] Un blindado muerto da 2 créditos y vale 75 × combo.
- [ ] Una explosión hostil (impacto en el suelo) no activa cadena ni mata misiles.
- [ ] Al terminar la oleada se muestra `CIUDADES ×c`, el HUD suma `100 × MULT × c` y se otorgan
      `3 × c` créditos; la munición sobrante no puntúa.
- [ ] Tras la pantalla de cierre aparece el taller con 5 filas, créditos visibles y la
      selección movible con flechas/WASD.
- [ ] `Space` en una fila de mejora con créditos suficientes la compra, descuenta el coste
      exacto y sube un pip; sin créditos suficientes no hace nada ni lanza error.
- [ ] La fila RECONSTRUIR está atenuada si no hay ciudades destruidas, y al comprarla revive
      la ciudad destruida más a la izquierda y el HUD pasa de 5 a 6 vidas.
- [ ] RADIO nivel 4 da un radio de explosión de 58 px; MUNICIÓN nivel 3 da 14 misiles por
      batería a partir de la recarga siguiente.
- [ ] Los niveles máximos muestran `MAX` y no se pueden comprar de nuevo.
- [ ] `Enter` o la fila `SIGUIENTE OLEADA` salen del taller; el clic o `Space` que continúa no
      dispara un misil en la oleada nueva.
- [ ] No hay ciudad extra gratuita al cruzar 10 000 puntos.
- [ ] No hay bombardero en ninguna oleada.
- [ ] El multiplicador pasa de ×1 a ×2 en la oleada 4 y se queda en ×4 desde la 10.
- [ ] Perder la sexta ciudad abre el modal `FIN DEL JUEGO` ~1,6 s después, con la puntuación
      real; la puntuación nunca excede 999 999.
- [ ] `JUGAR DE NUEVO` reinicia a oleada 1, 0 puntos, 0 créditos, mejoras a nivel 0 y 6 ciudades
      sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'comando-misiles'`.
- [ ] Esa puntuación aparece en `/salon?juego=comando-misiles` y en `/juegos/comando-misiles`
      sin recargar a mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Con `scores` vacía para este juego, `/salon?juego=comando-misiles` muestra el estado vacío.
- [ ] Con 32 cascadas simultáneas simuladas, el motor no lanza error y las explosiones extra se
      descartan en silencio.
- [ ] `PAUSA` congela misiles, explosiones, cadenas pendientes y taller; `REANUDAR` continúa
      sin saltos. `P` y `Escape` hacen lo mismo y el motor no los interpreta como jugada.
- [ ] Con el canvas enfocado, flechas, WASD, espacio y enter no hacen scroll de la página.
- [ ] Dejar la pestaña en segundo plano y volver no resuelve cadenas ni lanzamientos de golpe.
- [ ] Navegar de `/jugar/comando-misiles` a `/biblioteca` y volver no duplica el bucle ni deja
      el cursor oculto.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid` y `/jugar/snake` se juegan igual que
      antes.
- [ ] `select * from public.games` incluye una fila `comando-misiles` además de las ya
      existentes; `lib/games.ts` mantiene sin tocar las fichas de los demás juegos.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en
      `/jugar/comando-misiles`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** mismo mundo, geometría, controles y baterías que la variante 01. Las variantes
  difieren en la economía, no en la base; así el usuario compara reglas, no escenarios.
- **Sí:** la secundaria nace tras una pequeña demora (80 ms). Sin ella la cascada es
  instantánea e ilegible; con ella el jugador _ve_ la reacción propagarse.
- **Sí:** la secundaria es más pequeña (×0,7) que la explosión del disparo. Una cadena con el
  mismo radio barrería medio cielo con un clic y el juego dejaría de pedir puntería.
- **Sí:** profundidad máxima de cadena finita, mejorable. Una cadena infinita se autoalimentaría
  con un racimo denso y mataría la oleada entera.
- **Sí:** combo por linaje (el disparo que la origina), no por tiempo. Un combo por tiempo
  premiaría disparar rápido sin mirar; uno por linaje premia colocar bien un solo disparo.
- **Sí:** tope de combo ×6 y multiplicador de oleada más lento (×4). Con el combo ya
  inflando la puntuación, subir el multiplicador al ritmo de la variante 01 sobrepasaría el
  tope de 999 999 demasiado pronto.
- **Sí:** 8 misiles por batería en vez de 10. La cadena rinde más por misil; con 10 la partida
  sería demasiado fácil.
- **No:** bonus por munición sobrante. Aquí la economía de la munición se gestiona a través de
  la cadena (menos disparos, más kills), no de guardar misiles; premiar ambos contradiría la
  intención.
- **Sí:** el misil blindado necesita dos explosiones _distintas_ (`lastBlastId`). Si la
  misma explosión pudiera golpearlo dos frames seguidos, el blindado sería un misil normal con
  una animación distinta.
- **No:** blindados partibles. Un blindado que además se parte sería un enemigo difícil de
  leer; el MIRV y el blindado son dos presiones distintas.
- **Sí:** el taller se muestra siempre, aunque no se pueda comprar nada. Evita un salto
  de estado que parezca un fallo y mantiene un ritmo constante entre oleadas.
- **Sí:** la ciudad extra gratuita de la variante 01 se sustituye por la mejora RECONSTRUIR de
  25 créditos. Convierte la pérdida de una ciudad en una decisión económica y no en un estado
  que el juego restaura por sí solo.
- **Sí:** el canvas dibuja créditos y costes en el taller. No hay otro canal en `GameCallbacks`
  para un recurso interno y no es una puntuación; el HUD sigue mostrando sólo puntos, vidas y
  nivel.
- **Sí:** el clic en una fila del taller selecciona y compra a la vez; en un canvas táctil dos
  pasos serían una fricción innecesaria.
- **No:** sonido. **No:** sembrar puntuaciones en `scores`. **No:** skins.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Sin original, las constantes de radio, cadena y costes se ajustan «a ojo» durante la implementación. | Los pasos 1-5 las fijan y las declaran fuera de cambio, como hizo Snake (SPEC 10). |
| Una cascada bien colocada con CADENA al máximo limpia la oleada con un clic y el juego se vuelve trivial. | `CHAIN_R_FACTOR 0.7`, profundidad máxima 5, `CHAIN_DELAY_MS` y 8 misiles por batería lo acotan; se verifica jugando con las tres mejoras al máximo. |
| El pool de linajes (32) se agota en una oleada alta con muchos disparos simultáneos y desaparece el combo. | El caso está definido: la explosión nace sin linaje (sin combo, pero con daño), y hay un criterio de aceptación sobre el comportamiento con el pool lleno. |
| Un misil dentro de varias explosiones el mismo frame contaría varios kills y varias secundarias. | El paso 3 fija la regla: cuenta sólo la explosión de menor `id`. |
| Un blindado recibe dos golpes de la misma explosión en frames consecutivos. | `lastBlastId` en cada misil; criterio de aceptación específico. |
| El taller se queda atrapado: el clic que continúa dispara un misil en la oleada nueva y desperdicia munición. | `POST_SHOP_FIRE_LOCK 250 ms` tras salir del taller. |
| Comprar con un clic por error en una pantalla táctil. | El clic sólo compra en las filas con créditos suficientes y deja la fila atenuada si no; `MAX` deshabilita; el coste es visible antes de pulsar. |
| `draw()` en el taller asigna cadenas para pips y costes y provoca tirones (SPEC 13). | Los textos del taller son literales o se construyen sólo al comprar, no por frame; los pips usan bucles sobre contadores. |
| La puntuación con combo y multiplicador supera 999 999 en una partida larga. | `score = min(score + delta, MAX_SCORE)` en cada suma; criterio de aceptación sobre el tope. |
| El cursor nativo queda oculto tras un desmontaje defectuoso. | `destroy()` lo restaura y es idempotente; criterio de aceptación al navegar fuera de `/jugar`. |
| El jugador no entiende por qué una secundaria no mata (nace sin demora suficiente, o con radio 24 px lejos del siguiente misil). | Las secundarias se dibujan con un contorno más fino y se verifican visualmente; el tamaño se ajusta sólo en la spec, no durante la implementación. |

---

## Lo que **no** entra en esta spec

- Bombardero, satélite y misiles inteligentes.
- Bonus por munición sobrante y ciudad extra gratuita por puntos.
- Mejoras adicionales (velocidad de misiles, escudos, baterías extra) o un árbol de mejoras.
- Sonido.
- Mando táctil específico más allá de cruceta + A + B.
- Skins (`clasico`/`neon`/`retro`).
- Dos jugadores o modo cooperativo.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.
- Rate limiting, antitrampas y validación de la puntuación en servidor.

Cada una de ellas, si entra, va en su propia spec.
