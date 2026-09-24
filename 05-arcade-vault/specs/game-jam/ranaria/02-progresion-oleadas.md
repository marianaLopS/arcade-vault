# SPEC — RANARIA: variante de oleadas con progresión y power-ups

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-09-22
> **Objetivo:** Diseñar el Frogger de `ranaria` como una progresión de oleadas con dificultad creciente, cronómetro global (no por vida) y tres power-ups temporales, para una partida con arco de tensión largo en vez de rondas idénticas repetidas.

---

## Por qué existe esta spec

Esta es la segunda variante de diseño para `ranaria`, junto a
`specs/game-jam/ranaria/01-clasica-grilla.md`. Comparte con ella el género, el mundo lógico
de 800×600 y el contrato `GameEngine`, pero cambia el eje central del diseño: en vez de rondas
infinitas de dificultad plana, aquí cada oleada completada (los 5 nenúfares llenos) sube el
nivel y reconfigura los carriles — más velocidad, más obstáculos, carriles que cambian de
sentido — y aparece cada cierto tiempo un power-up recogible que da una ventaja temporal.
También cambia la regla de tiempo: aquí el reloj es **global por partida**, no se resetea al
llegar a un nenúfar, lo que crea presión creciente de principio a fin en vez de una serie de
sprints idénticos.

Como en la variante 01 y como Snake (SPEC 10), no hay código de referencia propio: las
constantes de este documento son el diseño, no un ajuste posterior.

---

## Alcance

**Dentro:**

- `lib/games/ranaria/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createRanariaGame`, sin sprites externos — rectángulos y formas simples con `ctx`.
- Misma grilla base que la variante 01: 16×12 celdas de 50 px, 800×600, disposición de
  carriles (goal / river ×5 / median / road ×5).
- Movimiento discreto por celda, un salto por pulsación, sin diagonales — igual mecánica base
  que la variante 01.
- **Progresión por nivel:** completar una oleada (llenar los 5 nenúfares) sube el nivel,
  reconstruye los carriles con más velocidad y más obstáculos, y algunos carriles invierten
  su sentido respecto al nivel anterior.
- **Power-ups:** aparecen sobre la isla central (fila `median`) a intervalos, con un tiempo
  de vida limitado antes de desaparecer si no se recogen. Tres tipos: `SCUDO` (invulnerable
  a la siguiente colisión), `LENTO` (ralentiza todos los obstáculos unos segundos) y
  `SALTO_LARGO` (el siguiente salto avanza dos celdas en la dirección pulsada).
- **Reloj global:** un único `timeLeft` para toda la partida, no por vida. Llegar a 0 es game
  over directo, sin vidas de por medio para el tiempo (las vidas siguen existiendo para
  colisiones).
- 3 vidas para colisiones (atropello, ahogamiento, choque contra nenúfar ocupado).
- Puntuación: puntos por fila nueva, bonus por nenúfar, bonus extra por nivel alcanzado, y
  puntos por recoger un power-up.
- Controles: flechas.
- Una línea `ranaria` en `GAME_ENGINES` (referencial: esta spec no la aplica).

**Fuera de alcance (para specs futuras o si se prefiere la variante 01):**

- Sprites o spritesheet: todo geometría de color plano, con un color/forma distinto por tipo
  de power-up para diferenciarlos sin arte.
- Sonido.
- Más de tres tipos de power-up, o power-ups acumulables/stackeables.
- Selector de dificultad inicial.
- Controles táctiles.
- Modificar `lib/games.ts` o `lib/games/registry.ts`.
- Migraciones de Supabase.
- Autenticación, `scores.user_id`.

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni tipo de plataforma nuevo.** `scores` y
`game_stats` sirven a este juego sin tocarlas; el leaderboard se enciende con una fila en
`games` cuando la variante se promueva fuera de `specs/game-jam/`.

Tipos locales del motor, sin exportar:

```ts
type Cell = { col: number; row: number };
type LaneKind = "grass" | "road" | "median" | "river" | "goal";
type Lane = {
  row: number;
  kind: LaneKind;
  dir: 1 | -1;
  speed: number;
  obstacles: Obstacle[];
};
type Obstacle = { x: number; w: number };
type PowerUpKind = "shield" | "slow" | "long-jump";
type PowerUp = { kind: PowerUpKind; col: number; ttl: number }; // ttl en segundos, en la fila median
type ActiveEffect = { kind: PowerUpKind; timeLeft: number } | null; // solo shield/slow duran; long-jump se consume en el próximo salto
```

Estado en la clausura de `createRanariaGame`:

- `frog: Cell`, `jumpFrom`, `jumpTo`, `jumpProgress`, `jumpDistance` (1 o 2 celdas, según
  `SALTO_LARGO` activo).
- `lanes: Lane[]` (12 filas, reconstruidas en cada `initGame()` y en cada subida de nivel).
- `slots: boolean[]` (5 nenúfares).
- `visitedRows: Set<number>`.
- `score`, `lives`, `level`, `timeLeft` (global, no se resetea por vida).
- `activePowerUp: PowerUp | null` (el que está en el tablero, si hay uno vivo),
  `powerUpSpawnTimer` (segundos hasta el próximo spawn).
- `activeEffect: ActiveEffect` (shield o slow en curso), `pendingLongJump: boolean`.
- `state: "jumping" | "idle" | "gameover"`.
- Bucle: `rafId`, `lastTime`, `destroyed`.

---

## Plan de implementación

### 1. Motor: constantes, carriles y curva de nivel

`lib/games/ranaria/engine.ts`. Constantes de diseño:

```
W 800 · H 600 · CELL 50 px · COLS 16 · ROWS 12
Misma disposición de filas que la variante 01 (goal 0, river 1-5, median 6, road 7-11)
START_CELL (col 8, row 11)
LIVES_START 3 · JUMP_DURATION 120 ms
TIME_TOTAL 90 s (reloj global, no se resetea al llegar a un nenúfar ni al perder vida)
ROAD_BASE_SPEEDS [90, 130, 110, 160, 140] px/s (nivel 1)
RIVER_BASE_SPEEDS [70, 100, 85, 120, 95] px/s (nivel 1)
SPEED_STEP_PER_LEVEL 12% (multiplicador 1.12^(level-1) sobre las velocidades base, cap en 2.2x)
GAP_STEP_PER_LEVEL: ROAD_GAP y RIVER_GAP bajan 8% por nivel desde 220px/260px,
  con piso ROAD_GAP_MIN 130 px, RIVER_GAP_MIN 170 px (más obstáculos, menos hueco)
DIR_FLIP_LANES_PER_LEVEL: en cada subida de nivel, 2 carriles elegidos por
  ((level * 3) % 10) invierten su `dir` respecto al nivel anterior (determinista, no aleatorio)
ROAD_CAR_W 70 px · RIVER_LOG_W 130 px
POWERUP_SPAWN_INTERVAL 12 s · POWERUP_TTL 6 s (desaparece si no se recoge)
POWERUP_COLS [2, 5, 8, 11, 14] (elige una por `(level + spawnCount) % 5`, determinista)
SHIELD_ABSORBS 1 golpe · SLOW_DURATION 5 s · SLOW_FACTOR 0.5 (multiplica speed de obstáculos)
LONG_JUMP: el próximo salto avanza 2 celdas en vez de 1, se consume al saltar
POINTS_PER_NEW_ROW 10 · POINTS_GOAL 200 · POINTS_LEVEL_UP = 100 * level · POINTS_POWERUP 50
DT_MAX 50 ms
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

`initGame()` fija `level = 1`, construye `lanes` con las velocidades y huecos base,
`timeLeft = TIME_TOTAL`, `lives = LIVES_START`, `score = 0`, `slots` vacíos, `visitedRows`
vacío, `activePowerUp = null`, `powerUpSpawnTimer = POWERUP_SPAWN_INTERVAL`,
`activeEffect = null`, `pendingLongJump = false`, rana en `START_CELL`.

`levelUp()` (se llama al llenar los 5 nenúfares): `level++`, recalcula `lanes` con
`ROAD_BASE_SPEEDS[i] * 1.12^(level-1)` (cap 2.2x), gaps reducidos según la fórmula, invierte
los 2 carriles que toque, vacía `slots`, `visitedRows.clear()`, rana vuelve a `START_CELL`,
`score += POINTS_LEVEL_UP`. El reloj `timeLeft` **no** se toca aquí: sigue corriendo.

Comprobación: `npm run build` limpio.

### 2. Motor: movimiento, colisiones y power-ups

- Igual que la variante 01 para el ciclo de salto (`idle` → pulsación → `jumping` con
  interpolación → resolución), con dos diferencias:
  - Si `pendingLongJump`, el destino se calcula a 2 celdas en la dirección pulsada (clampado
    a los límites del mundo) y `pendingLongJump = false` al iniciar el salto, se consuma o
    no aterrice con éxito.
  - Al resolver una colisión letal (`road` sin hueco, `river` sin tronco, deriva fuera del
    mundo, `goal` ocupado/inválido): si `activeEffect?.kind === "shield"`, la colisión se
    ignora una vez, `activeEffect = null`, y la rana se queda en la celda de destino como si
    fuera segura (no vuelve a `START_CELL`). Si no hay escudo, se llama `loseLife()` igual
    que en la variante 01.
- `river`: la rana se mueve con el tronco (`obstacle.speed * dir`, afectado por `slow` si
  está activo) igual que en la variante 01.
- Filas nuevas dentro del intento actual: `POINTS_PER_NEW_ROW`, igual que la variante 01,
  reiniciado por `visitedRows.clear()` en `levelUp()` y en `loseLife()`.
- Nenúfar libre alcanzado: `slots[i] = true`, `score += POINTS_GOAL`, rana vuelve a
  `START_CELL`, `visitedRows.clear()`. Si con esto los 5 quedan ocupados → `levelUp()`.
- Power-ups: `powerUpSpawnTimer -= dt`; al llegar a 0 y si `activePowerUp === null`, se crea
  uno en `median` con `col = POWERUP_COLS[(level + spawnCount) % 5]`,
  `kind` rotando en orden `shield → slow → long-jump → shield...` según `spawnCount % 3`,
  `ttl = POWERUP_TTL`, y `powerUpSpawnTimer = POWERUP_SPAWN_INTERVAL`. Si `ttl` llega a 0 sin
  recogerse, `activePowerUp = null` sin penalización.
- Recoger un power-up: al aterrizar en `median` sobre la columna exacta de `activePowerUp`,
  se aplica su efecto (`shield`/`slow` → `activeEffect = { kind, timeLeft: SLOW_DURATION }`
  para `slow`, o `activeEffect = { kind: "shield", timeLeft: Infinity }` hasta consumirse en
  la próxima colisión; `long-jump` → `pendingLongJump = true`, sin pasar por `activeEffect`),
  `score += POINTS_POWERUP`, `activePowerUp = null`. Solo un efecto activo a la vez: recoger
  uno nuevo mientras hay otro activo lo reemplaza.
- `loseLife()`: `lives--`; si `lives <= 0` → `state = "gameover"`, `stopLoop()`,
  `onGameOver(score)`. Si quedan vidas → rana a `START_CELL`, `visitedRows.clear()`,
  `activeEffect = null`, `pendingLongJump = false`, `state = "idle"`. El nivel, `timeLeft` y
  `slots` **no** se reinician al perder una vida (a diferencia de la variante 01, que sí
  reinicia el tiempo por vida): perder una vida cuesta la posición, no el progreso de oleada.
- `timeLeft -= dt` siempre que `state !== "gameover"`. Al llegar a 0:
  `state = "gameover"`, `stopLoop()`, `onGameOver(score)`, sin gastar una vida (fin de
  partida directo por reloj).

Comprobación: `npm run build` limpio.

### 3. Motor: bucle, entrada, dibujo y avisos

- `emit()` con `lastScore` / `lastLives` / `lastLevel`. `onLevel(level)` se llama en cada
  `levelUp()`, a diferencia de la variante 01 que lo fija en 1 siempre.
- `draw()`: mismas franjas de carril que la variante 01. Además:
  - `activePowerUp` dibujado como un rombo de color por tipo (`shield` cian,
    `slow` amarillo, `long-jump` magenta) sobre su celda de `median`, con un parpadeo en el
    último segundo de su `ttl`.
  - Si `activeEffect?.kind === "shield"`, la rana se dibuja con un aro cian alrededor.
    Si `activeEffect?.kind === "slow"`, los obstáculos se dibujan con un tinte azulado.
    Si `pendingLongJump`, la rana se dibuja con una flecha doble sobre la cabeza.
  - Barra de tiempo global en la franja superior de 20 px, igual posición que la variante 01
    pero reflejando `timeLeft / TIME_TOTAL` de toda la partida, no de la vida.
- Sin puntuación, vidas ni nivel dibujados fuera de esa barra y los indicadores de efecto: el
  resto lo pone el HUD de la plataforma (`onScore`, `onLives`, `onLevel`).
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`. `preventDefault()` solo
  para esas. Sin cola de saltos, igual razón que la variante 01.
- Listeners `keydown` / `blur` sobre el canvas, nunca sobre `window`.
- `dt` capado a `DT_MAX`; `lastTime = null` al reanudar. `slow` afecta la velocidad de
  obstáculos multiplicando por `SLOW_FACTOR` dentro del cálculo de posición, no el `dt` del
  motor (para que el salto de la rana no se vea afectado).
- `destroy()` cancela el frame, quita los listeners, es idempotente.
- `restart()`: detiene el bucle, `initGame()`, `emit()`, arranca.
- `initGame(); draw();` antes de devolver.

Comprobación: `npm run build` limpio.

### 4. Repaso final (cuando esta variante se promueva)

`npm run lint` y `npm run build` limpios, recorrido manual de los criterios de aceptación.
Esta spec no ejecuta este paso: es trabajo de `/spec-impl` o `nuevo-juego` tras promover la
variante.

---

## Criterios de aceptación

- [ ] `/jugar/ranaria` (una vez cableado) muestra un canvas de 800×600 con la misma
      disposición de carriles que la variante base, más un indicador de power-up cuando hay
      uno en el tablero.
- [ ] Llenar los 5 nenúfares sube el nivel en el HUD, reconstruye los carriles con
      velocidades mayores según `1.12^(level-1)` y no reinicia el cronómetro global.
- [ ] Dos carriles cambian de sentido en cada subida de nivel, de forma determinista y
      reproducible (mismo nivel siempre invierte los mismos carriles).
- [ ] Perder una vida devuelve la rana a `START_CELL` sin reiniciar `level`, `slots` ni
      `timeLeft`.
- [ ] Un power-up aparece cada `POWERUP_SPAWN_INTERVAL` segundos en `median` si no hay uno ya
      en el tablero, y desaparece solo tras `POWERUP_TTL` segundos si no se recoge.
- [ ] Recoger `SCUDO` hace que la siguiente colisión letal no reste vida ni devuelva la rana
      al inicio, y consume el efecto.
- [ ] Recoger `LENTO` reduce visiblemente la velocidad de coches y troncos durante
      `SLOW_DURATION` segundos y luego vuelve a la normalidad.
- [ ] Recoger `SALTO_LARGO` hace que el próximo salto avance dos celdas en la dirección
      pulsada, y se consume tanto si aterriza bien como si no.
- [ ] Recoger un power-up mientras otro está activo reemplaza el efecto en curso, no los
      acumula.
- [ ] El reloj global baja de forma continua durante toda la partida, sin resetearse al
      llegar a un nenúfar ni al perder una vida.
- [ ] Llegar a 0 en el reloj global termina la partida inmediatamente, sin consumir una vida
      extra ni mostrar el efecto de escudo.
- [ ] Perder la tercera vida (por colisión, sin escudo) abre el flujo de fin de juego con la
      puntuación real.
- [ ] El canvas no dibuja puntuación, vidas ni nivel como texto fuera de la barra de tiempo y
      los indicadores visuales de efecto activo.
- [ ] Con el canvas enfocado, las flechas no hacen scroll de la página.
- [ ] `destroy()` dejado en medio de un salto o con un power-up vivo en el tablero no deja un
      `requestAnimationFrame` huérfano.

---

## Decisiones

- **Sí:** reloj global en vez de reloj por vida (a diferencia de la variante 01). Crea
  presión creciente de partida completa en vez de sprints repetidos idénticos, y hace que
  perder tiempo en power-ups o en re-cruzar tras una muerte tenga coste real.
- **No:** reiniciar `level` o `slots` al perder una vida. Si cada muerte borrara el progreso
  de oleada, el jugador nunca superaría niveles altos y la progresión no se sentiría.
- **Sí:** inversión determinista de 2 carriles por nivel en vez de regenerar todo
  aleatoriamente. Mantiene la partida depurable y evita que una subida de nivel sea
  injugable por mala suerte de generación.
- **Sí:** solo un efecto de power-up activo a la vez, sin stack. Simplifica el estado y evita
  combinaciones (p. ej. escudo + lento simultáneos) que no se han diseñado ni probado.
- **Sí:** tres tipos de power-up, no más. Cada uno cubre un tipo de riesgo distinto
  (colisión, velocidad, distancia); un cuarto tipo sin un riesgo nuevo que cubrir sería
  relleno.
- **No:** power-ups en los carriles de carretera o río. Colocarlos solo en `median` evita que
  recogerlos compita con el riesgo de cruzar un carril peligroso, y los mantiene como una
  recompensa por llegar a mitad de camino, no un señuelo letal.
- **Sí:** `SALTO_LARGO` se consume aunque el salto falle (choque). Si se reembolsara en fallo
  perdería tensión: usarlo mal también tiene costo.
- **No:** sprites ni sonido, mismas razones que la variante 01: no bloquear el diseño en arte
  inexistente.

---

## Riesgos

| Riesgo                                                                                                                       | Mitigación                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La curva `1.12^(level-1)` se vuelve injugable rápido en niveles altos y nadie llega a verlos.                                | Cap explícito en `2.2x` sobre la velocidad base; se ajusta el exponente en verificación jugando varios niveles si se siente injusto antes de ese tope.    |
| El reloj global castiga doblemente una muerte por colisión (pierde posición y tiempo a la vez).                              | Es intencional (ver Decisiones), pero se vigila en verificación que `TIME_TOTAL = 90s` deje margen real para llegar al menos al nivel 2 sin power-ups.    |
| Dos carriles invertidos en el mismo nivel confunden al jugador que memorizó el patrón anterior.                              | La fórmula `(level*3) % 10` es determinista y se documenta; el color de fondo por `dir` (opcional en dibujo) ayuda a leerlo de un vistazo.                |
| `SCUDO` recogido justo antes de un `game over` por tiempo no sirve de nada y se siente como un bug.                          | Está documentado en los criterios de aceptación: el reloj a 0 termina la partida sin importar el escudo, por diseño, no por omisión.                      |
| Con `SLOW_FACTOR` afectando solo obstáculos y no el `dt` del motor, un bug fácil es aplicarlo por error al salto de la rana. | El paso 3 aísla explícitamente el cálculo: `slow` multiplica la posición de los `Obstacle`, nunca el `dt` global ni `JUMP_DURATION`.                      |
| Power-ups solo en `median` los vuelve fáciles de ignorar si el jugador prefiere velocidad.                                   | Aceptado: son opcionales por diseño, no obligatorios para progresar; se revisa el balance de `POINTS_POWERUP` en verificación si se sienten irrelevantes. |

---

## Lo que **no** entra en esta spec

- Sprites, spritesheet o sonido.
- Más de tres tipos de power-up o efectos combinables.
- Selector de dificultad o modo sin power-ups.
- Controles táctiles.
- `lib/games.ts`, `lib/games/registry.ts`, migraciones, catálogo o leaderboard reales — eso
  ocurre solo si esta variante se promueve fuera de `specs/game-jam/`.
- Autenticación, `scores.user_id`.

Cada una de ellas, si entra, va en su propia spec.
