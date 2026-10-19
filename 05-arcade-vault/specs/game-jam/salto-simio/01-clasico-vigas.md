# SPEC — SALTO SIMIO: variante clásica de vigas

> **Estado:** Implementado (pasos 1–4; 5–7 en SPEC 17)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-09
> **Objetivo:** Diseñar `salto-simio` como el plataformas vertical clásico de una sola pantalla: escalar cinco vigas inclinadas esquivando barriles que ruedan, llegar a la cima y repetir con dificultad creciente, con tres vidas y un bono de tiempo.

---

## Por qué existe esta spec

Sale del tema «donkey-kong» de `References/resources/resources/game-suggestions-todo.md`
(sugerencia del 2026-09-22, estado `pendiente`): el catálogo no tiene ningún juego con salto,
gravedad y escaleras. `asteroids` y `arkanoid` son de física libre, `caida` y `snake` son de
grilla, y `frogger` (nacido de la game-jam `ranaria`) se mueve por celdas discretas. Este es el
primer juego de **plataformeo con física continua** de Arcade Vault. Por derechos de marca el
juego se llama `SALTO SIMIO`: un héroe (el «saltador»), un simio que lanza barriles y un objetivo
a rescatar arriba del todo.

Esta es la variante 01, la mínima y fiel al género. Comparte con la variante 02
(`specs/game-jam/salto-simio/02-torre-ardiente.md`) el género, el mundo lógico de 800×600, el
héroe, las físicas de salto y los controles; lo que cambia es el diseño del nivel y la presión:
aquí hay **una pantalla fija** de vigas inclinadas por las que ruedan los barriles y la presión
es un **bono de tiempo**, sin power-ups ni enemigos extra.

Como Snake (SPEC 10) y las variantes de `ranaria`, no hay código de referencia: las constantes
de este documento **son** el diseño. Cambiarlas durante la implementación es rediseñar.

---

## Alcance

**Dentro:**

- `lib/games/salto-simio/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createSaltoSimioGame`. Sin sprites externos: rectángulos, círculos y líneas con `ctx`.
- Mundo de 800×600. Una pantalla fija de seis vigas (`G0` suelo a `G5` cima) con cinco tramos
  de escaleras, definida de forma literal en datos (no generada).
- Héroe con carrera, salto de altura fija, escaleras y muerte por barril o por caída larga.
- Barriles: aparecen en la cima, ruedan siguiendo la pendiente de cada viga, caen por los
  huecos de los extremos y se destruyen al llegar al barril de aceite del suelo.
- Bono de tiempo que baja con el reloj; llegar a 0 cuesta una vida.
- 3 vidas. Completar la pantalla sube el nivel: barriles más rápidos y más frecuentes.
- Puntuación por salto sobre barril, por completar la pantalla y por bono restante.
- Controles: flechas o WASD + Espacio para saltar.
- Reporte al HUD de la plataforma por `onScore` / `onLives` / `onLevel` / `onGameOver`.
- Una línea `salto-simio` en `GAME_ENGINES` (referencial: esta spec no la aplica).

**Fuera de alcance (para specs futuras o para la variante 02):**

- Martillo, power-ups, bolas de fuego u otros enemigos.
- Pantallas distintas por nivel (ascensores, cintas transportadoras).
- Barriles que bajan por escaleras.
- Sprites, spritesheet o sonido.
- Controles táctiles (los cubre `mobile-porter` tras promover la variante).
- Modificar `lib/games.ts` o `lib/games/registry.ts`.
- Migraciones de Supabase (el paso 6 las describe, no las aplica).
- Autenticación y `scores.user_id` más allá de lo que ya hace `guardarScore`.

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni tipo de plataforma nuevo.** `scores` y `game_stats`
sirven a este juego sin tocarlas; el leaderboard se enciende con una fila en `games` cuando la
variante se promueva fuera de `specs/game-jam/`. El motor solo emite un `number` entero a
`onGameOver`, que el modal de la plataforma guarda en `scores` con `game_id = 'salto-simio'`.

Tipos locales del motor, sin exportar:

```ts
type Girder = { x0: number; x1: number; y0: number; y1: number }; // y0 en x0, y1 en x1 (superficie)
type Ladder = { x: number; lower: number; upper: number }; // índices de Girder que conecta
type Barrel = {
  x: number;
  y: number; // centro
  dir: 1 | -1;
  girder: number; // índice de viga sobre la que rueda; -1 si cae
  vy: number;
  jumped: boolean; // ya otorgó los puntos de salto
};
type HeroState = "ground" | "air" | "ladder" | "dying" | "won";
```

Estado en la clausura de `createSaltoSimioGame`:

- `hero: { x, y, vx, vy, face: 1 | -1, girder: number, peakY: number, ladder: Ladder | null }`
  (`x` centro, `y` pies).
- `heroState: HeroState`, `stateTime` (ms en el estado actual, para `dying` y `won`).
- `barrels: Barrel[]` (máximo `BARREL_MAX`), `spawnTimer` (ms).
- `score`, `lives`, `level`, `bonus`, `bonusAccum` (ms hacia el siguiente descuento).
- `keys: { left, right, up, down }` (booleanos) y `jumpQueued` (booleano de un solo uso).
- `state: "playing" | "gameover"`.
- Bucle: `rafId`, `lastTime`, `destroyed`.

---

## Plan de implementación

### 1. Motor: geometría del nivel y constantes

`lib/games/salto-simio/engine.ts`. Constantes de diseño:

```
W 800 · H 600
GIRDERS (superficie; y crece hacia abajo):
  G0 x 0..800  y 568 → 568            (suelo, plano)
  G1 x 0..720  y 470 → 490            (baja hacia la derecha)
  G2 x 80..800 y 400 → 380            (baja hacia la izquierda)
  G3 x 0..720  y 290 → 310            (baja hacia la derecha)
  G4 x 80..800 y 220 → 200            (baja hacia la izquierda)
  G5 x 0..560  y 110 → 110            (cima, plana)
  surface(g, x) = g.y0 + (g.y1 - g.y0) * (x - g.x0) / (g.x1 - g.x0)
LADDERS (x, lower → upper):
  (640, G0→G1) (200, G0→G1) (120, G1→G2) (520, G1→G2) (680, G2→G3)
  (300, G2→G3) (140, G3→G4) (480, G3→G4) (480, G4→G5)
  LADDER_W 24 (tolerancia de agarre ±10 px del centro)
OIL_DRUM x 0..40 sobre G0 · SIMIO x 40..120 sobre G5 · GOAL (rescate) x 500..540 sobre G5
HERO_W 24 · HERO_H 32 · START (60, G0)
GRAVITY 1800 px/s² · JUMP_VY -560 px/s (altura ≈ 87 px, menor que los 90 px entre vigas)
RUN_SPEED 150 px/s · JUMP_AIR_CONTROL 0.0 (en el aire vx se congela al despegar)
CLIMB_SPEED 90 px/s · FALL_DEATH 100 px (caída desde el pico del salto o de la viga)
BARREL_R 10 · BARREL_SPEED 110 px/s · BARREL_FALL_VX 40 px/s · BARREL_GRAVITY 1400 px/s²
SPAWN_INTERVAL_L1 3000 ms · SPAWN_STEP 250 ms por nivel · SPAWN_MIN 1600 ms
BARREL_SPEED_STEP 8% por nivel (cap ×1.8) · BARREL_MAX 14
BONUS_START 5000 · BONUS_TICK 100 puntos cada 2000 ms
LIVES_START 3 · DYING_MS 900 · WON_MS 1500 · DT_MAX 50 ms · SCORE_CAP 999999
POINTS_JUMP 100 · POINTS_GOAL 1000 · bono restante se suma íntegro al llegar a la meta
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

`initGame()`: `level = 1`, `score = 0`, `lives = LIVES_START`, y llama a `resetStage()`.
`resetStage()`: héroe en START (`heroState = "ground"`, `girder = 0`), `barrels = []`,
`spawnTimer = 1000`, `bonus = BONUS_START`, `bonusAccum = 0`, teclas y `jumpQueued` a falso.

Comprobación: `npm run build` limpio.

### 2. Motor: héroe y entrada

- **Suelo:** con `heroState = "ground"`, `x += dir * RUN_SPEED * dt`, `dir = right - left`
  (izquierda y derecha a la vez se anulan). `x` se limita a `HERO_W/2 .. W - HERO_W/2`.
  `y = surface(girder, x)`. Si `x` sale del rango `[x0, x1]` de su viga el héroe pasa a `air`
  con `vy = 0` (cae por el borde).
- **Salto:** `jumpQueued` y estado `ground` → `vy = JUMP_VY`, `vx = dir * RUN_SPEED`,
  `peakY = y`, `heroState = "air"`. `jumpQueued` se consume siempre en el frame siguiente a la
  pulsación, haya podido saltar o no: un Espacio pulsado en el aire no se guarda.
- **Aire:** `vy += GRAVITY * dt`, `x += vx * dt`, `y += vy * dt`, `peakY = min(peakY, y)`.
  Aterrizaje de una vía: se busca la viga `g` tal que `vy > 0`, `x` dentro de su rango, la `y`
  del frame anterior `<= surface(g, x) + 1` y la `y` actual `>= surface(g, x)`. Al aterrizar:
  si `y - peakY > FALL_DEATH` → `die()`; si no, `girder = g`, `y = surface`, `heroState = "ground"`.
  Las vigas no bloquean por debajo ni por los lados.
- **Escalera:** con `ground` y `up` pulsado a menos de 10 px del `x` de una escalera cuya viga
  inferior es la actual → `heroState = "ladder"`, `x = ladder.x`. Con `down` pulsado sobre el
  extremo superior de una escalera (pies a ≤ 4 px de `surface(upper, ladder.x)`) → también
  `ladder` y empieza a bajar. En `ladder`: `y -= (up - down) * CLIMB_SPEED * dt`, sin movimiento
  lateral y sin salto. Al llegar `y <= surface(upper, ladder.x)` → `ground` sobre `upper`; al
  llegar `y >= surface(lower, ladder.x)` → `ground` sobre `lower`.
- **Muerte:** `die()` pone `heroState = "dying"`, congela al héroe y a los barriles durante
  `DYING_MS`; después `lives--`; si `lives <= 0` → `state = "gameover"`, `stopLoop()`,
  `onGameOver(score)` una sola vez; si no, `resetStage()` conservando `score` y `level`.
- **Victoria:** el rectángulo del héroe solapa con GOAL estando en `G5` → `heroState = "won"`
  durante `WON_MS` (nada se mueve salvo un parpadeo del rescate), luego
  `score += POINTS_GOAL + bonus`, `level++`, `resetStage()`.

Comprobación: `npm run build` limpio.

### 3. Motor: barriles y bono

- **Spawn:** cada `spawnInterval(level) = max(SPAWN_MIN, SPAWN_INTERVAL_L1 - SPAWN_STEP * (level - 1))`
  nace un barril en `x = 130, y = surface(G5, 130) - BARREL_R`, `dir = 1`, `girder = 5`, si hay
  menos de `BARREL_MAX`.
- **Rodar:** `x += dir * speed(level) * dt`, con `speed(level) = BARREL_SPEED * min(1.8, 1 + 0.08 * (level - 1))`;
  `y = surface(girder, x) - BARREL_R`. Al pasar el extremo de la viga (`x > x1` si `dir = 1`,
  `x < x0` si `dir = -1`) el barril pasa a `girder = -1`, conserva `BARREL_FALL_VX` en su
  sentido y cae con `BARREL_GRAVITY`. Aterriza con el mismo barrido de una vía que el héroe, en
  la viga inmediatamente inferior cuyo rango contiene su `x`, e invierte `dir`.
- La cadena resultante es fija: G5 → derecha → G4 → izquierda → G3 → derecha → G2 → izquierda →
  G1 → derecha → G0 → izquierda. Un barril de G0 que llega a `x < 40` (barril de aceite) se
  elimina.
- **Colisión:** círculo del barril contra el rectángulo `HERO_W × HERO_H` del héroe, en cualquier
  estado salvo `dying` / `won` → `die()`.
- **Salto sobre barril:** si en un frame el héroe está en `air`, `|barrel.x - hero.x| <= 14`,
  la `y` de sus pies `<= barrel.y - BARREL_R` y `!barrel.jumped` → `jumped = true`,
  `score += POINTS_JUMP`. Un barril da puntos una sola vez.
- **Bono:** `bonusAccum += dt`; cada 2000 ms `bonus -= 100` (mínimo 0). Con `bonus = 0` → `die()`.
- Todo `score` se limita a `SCORE_CAP` antes de emitir.

Comprobación: `npm run build` limpio.

### 4. Motor: bucle, entrada y dibujo

- `emit()` con `lastScore` / `lastLives` / `lastLevel`: avisa solo cuando cambia el valor.
  `onLives(3)` y `onLevel(1)` al iniciar.
- `draw()`: fondo negro; vigas como polígonos de 16 px de grosor en magenta neón; escaleras en
  cian; barril de aceite, simio (rectángulo grande sobre G5) y rescate (rectángulo pequeño
  parpadeante) con colores planos; barriles como círculos amarillos con una raya que gira;
  héroe como rectángulo cian con un pequeño marcador de la cara. Barra de bono en la franja
  superior (20 px), proporcional a `bonus / BONUS_START`. Sin puntuación, vidas ni nivel
  dibujados: eso lo pone el HUD de la plataforma.
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`, `KeyD`,
  `Space`. `preventDefault()` solo para esas. `keyup` suelta la tecla; `Space` solo en `keydown`
  y sin `e.repeat`.
- Listeners `keydown` / `keyup` / `blur` sobre el canvas, nunca sobre `window`. `blur` suelta
  todas las teclas y descarta `jumpQueued`. `P` y `Escape` no llegan al motor.
- `dt` capado a `DT_MAX`; `lastTime = null` al reanudar. Física en un único paso por frame.
- Game over: `stopLoop()` y `onGameOver(score)` una sola vez; `resume()` es no-op después.
- `restart()`: detiene el bucle, `initGame()`, `emit()`, arranca. `destroy()` cancela el frame,
  quita los listeners y es idempotente.
- Ninguna asignación de arrays, objetos o clausuras dentro de `draw()` (SPEC 13): los barriles
  se dibujan recorriendo el array existente.
- `initGame(); draw();` antes de devolver.

Comprobación: `npm run build` limpio.

### 5. Registro (cuando la variante se promueva)

`lib/games/registry.ts`:
`salto-simio: { create: createSaltoSimioGame, width: 800, height: 600, controls: "flechas o WASD para moverte y trepar, espacio para saltar", touch: { a: { code: "Space", label: "SALTO" } } }`.
`lib/games.ts`: ficha nueva `id: "salto-simio"`, `title: "SALTO SIMIO"`, `cat: "ARCADE"`,
`cover` y `color` a decidir en la skill `nuevo-juego`. Esta spec no los toca.

Comprobación: `/jugar/salto-simio` pinta el canvas real.

### 6. Leaderboard (cuando la variante se promueva)

`supabase/migrations/<timestamp>_juego_salto_simio.sql`, con timestamp posterior al último de
`supabase/migrations/`:

```sql
insert into public.games (id, title) values ('salto-simio', 'SALTO SIMIO');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. **Los tipos no se
regeneran**: insertar una fila no cambia el esquema. La puntuación sigue el `CHECK` existente
de `scores` (0..1.000.000), por eso el motor limita a `SCORE_CAP = 999999`; el nombre `player`
(`^[A-Z]{1,3}$`) y `user_id` los gestiona el modal y `guardarScore` sin cambios.

Comprobación: `select * from public.games` incluye `salto-simio`.

### 7. Repaso final (cuando esta variante se promueva)

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos y recorrido manual de
los criterios de aceptación. Esta spec no ejecuta este paso: es trabajo de `/spec-impl-game` o
`nuevo-juego` tras promover la variante.

---

## Criterios de aceptación

- [ ] `/jugar/salto-simio` (una vez cableado) muestra un canvas de 800×600 con seis vigas, nueve
      escaleras, simio, rescate y barril de aceite, no la `.game-arena`.
- [ ] El héroe arranca en `(60, G0)` y no se mueve hasta pulsar una tecla.
- [ ] Flechas y WASD mueven al héroe a 150 px/s; izquierda y derecha a la vez lo dejan quieto.
- [ ] Espacio salta con una altura de unos 87 px: no basta para subir de una viga a la siguiente.
- [ ] En el aire no se puede cambiar de dirección; Espacio en el aire no encola otro salto.
- [ ] Arriba junto a una escalera la sube; abajo sobre su extremo superior la baja; en la
      escalera no se mueve en horizontal ni se salta.
- [ ] El héroe sigue la pendiente de cada viga sin «saltitos» visibles al caminar.
- [ ] Caminar fuera del borde de una viga hace caer al héroe sin matarlo (≈ 90 px); caer dos
      vigas seguidas lo mata al aterrizar.
- [ ] Un barril nace en la cima cada 3 s en el nivel 1 y recorre la cadena G5 → G0 en el orden
      del paso 3, cayendo por los huecos y desapareciendo en el barril de aceite.
- [ ] Tocar un barril abre la animación de muerte de 900 ms y descuenta una vida; el escenario
      se reinicia sin tocar `score` ni `level`.
- [ ] Saltar sobre un barril suma 100 una sola vez por barril, incluso si pasan dos seguidos.
- [ ] La barra de bono baja 100 puntos cada 2 s; al llegar a 0 cuesta una vida.
- [ ] Llegar a la meta suma `1000 + bono restante`, sube el nivel en el HUD y regenera la
      pantalla con barriles un 8 % más rápidos y un intervalo 250 ms menor.
- [ ] El intervalo de aparición no baja de 1,6 s ni la velocidad supera ×1,8 en niveles altos.
- [ ] Al perder la tercera vida se abre el modal `FIN DEL JUEGO` con la puntuación real, una
      sola vez.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'salto-simio'` y aparece
      en `/salon?juego=salto-simio` y en `/juegos/salto-simio` sin recargar a mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] La puntuación emitida nunca supera 999 999.
- [ ] El canvas no dibuja puntos, vidas ni nivel como texto, solo la barra de bono.
- [ ] `PAUSA` congela héroe, barriles y bono; `REANUDAR` continúa sin saltos bruscos de física.
- [ ] Con el canvas enfocado, flechas y Espacio no hacen scroll de la página.
- [ ] Escribir `W`, `A`, `S`, `D` o espacio en el campo de iniciales no mueve ni reinicia el juego.
- [ ] Dejar la pestaña en segundo plano y volver no hace caer al héroe a través de una viga ni
      adelanta barriles varias vigas.
- [ ] Perder el foco con una flecha pulsada no deja al héroe corriendo solo.
- [ ] Navegar de `/jugar/salto-simio` a `/biblioteca` y volver no duplica el bucle.
- [ ] Los otros juegos se juegan igual que antes.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/salto-simio`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** nombre `SALTO SIMIO` y `game-id` `salto-simio`, según la nomenclatura de la
  sugerencia del to-do y sin usar la marca original.
- **Sí:** vigas de una vía (solo se aterriza desde arriba). Evita colisiones laterales y
  esquinas, y hace el motor implementable con barridos simples.
- **Sí:** pendientes fijas de 20 px por viga que alternan sentido. Es lo que hace que los
  barriles «rueden» sin simular físicas de rotación.
- **Sí:** el salto no alcanza la viga superior (87 px frente a 90). Obliga a usar escaleras y a
  que el riesgo sea de ritmo, no de saltos imposibles.
- **No:** control en el aire. Es el clásico: comprometerse al saltar es la mecánica.
- **Sí:** muerte por caída larga (> 100 px). Penaliza saltar al vacío sin romper las caídas de
  una viga a otra.
- **Sí:** el bono de tiempo es lo único que presiona al jugador además de los barriles.
- **No:** barriles por escaleras ni aleatoriedad en barriles. Todo el recorrido es determinista,
  lo que permite aprender patrones y depurar.
- **Sí:** `SCORE_CAP` en el motor en lugar de confiar en el `CHECK` de la tabla, para que
  el modal nunca ofrezca guardar una puntuación que la BD rechazaría.
- **No:** sprites ni sonido; no hay assets y no deben bloquear el diseño.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo                                                                                 | Mitigación                                                                                                                                               |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El héroe atraviesa una viga si `dt` es grande (pestaña en segundo plano, hitch de GC). | `dt` capado a 50 ms: a `vy` máxima (~900 px/s) son 45 px por frame, menos que el hueco que permite el barrido de una vía; `lastTime = null` al reanudar. |
| Al caminar por una viga inclinada el héroe «flota» o se hunde en los extremos.         | `y` se recalcula con `surface(girder, x)` cada frame; no se integra gravedad en `ground`.                                                                |
| La escalera comparte `x` con el borde de una viga y el héroe cae en vez de subir.      | Todas las escaleras de la tabla están al menos 40 px dentro de ambas vigas; el agarre usa tolerancia ±10 px.                                             |
| El salto sobre barril puntúa varias veces o no puntúa al ir muy rápido.                | Marca `jumped` por barril y comprobación por frame con ventana de ±14 px, más ancha que el avance por frame del barril (≈ 2 px).                         |
| Barriles que se acumulan en G0 y bloquean la partida a niveles altos.                  | `BARREL_MAX 14` y eliminación en el barril de aceite; si se alcanza el máximo, no nacen más.                                                             |
| El bono de 5000 es demasiado corto/largo para la pantalla y obliga a correr.           | Son 100 s de margen frente a un recorrido de ≈ 25 s; se ajusta solo en verificación y se anota.                                                          |
| Espacio llega al motor mientras se escriben iniciales en el modal.                     | Bucle parado con el modal abierto y listeners en el canvas, no en `window`.                                                                              |
| El héroe queda pegado en `ladder` si pierde el foco con una tecla pulsada.             | `blur` suelta las teclas; el estado `ladder` solo avanza con `up`/`down` pulsados.                                                                       |

---

## Lo que **no** entra en esta spec

- Martillos, power-ups, fuego o enemigos adicionales (ver variante 02).
- Pantallas distintas por nivel, ascensores o cintas.
- Barriles que bajan por escaleras o trayectorias aleatorias.
- Sprites, spritesheet o sonido.
- Controles táctiles, más allá del campo `touch` referencial del registro.
- `lib/games.ts`, `lib/games/registry.ts`, migraciones, catálogo o leaderboard reales — eso
  ocurre solo si esta variante se promueve fuera de `specs/game-jam/`.
- Autenticación, `scores.user_id`.

Cada una de ellas, si entra, va en su propia spec.
