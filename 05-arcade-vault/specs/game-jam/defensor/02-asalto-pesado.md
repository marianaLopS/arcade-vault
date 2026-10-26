# SPEC — DEFENSOR: asalto pesado

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-02
> **Objetivo:** Diseñar una variante de Defender centrada en la presión creciente — oleadas con
> composición explícita por nivel que mezclan Landers, Bombarderos que siembran minas y Vainas
> que se abren en Enjambres, un Cazador que castiga tardar demasiado, e hiperespacio como salida de
> emergencia con riesgo — como ficha nueva `defensor` en categoría SHOOTER, con motor real y
> leaderboard en Supabase desde el primer día.

---

## Por qué existe esta spec

`01-clasico-rescate.md` es la lectura mínima del género: Landers, Mutantes y humanoides con 10
Landers por oleada, siempre iguales. Eso es fiel pero plano: la oleada 7 se juega igual que la 1.
Esta variante conserva exactamente la misma base —viewport 800×600, mundo circular de 3200 px,
nave inercial, radar, humanoides, láser y bomba— y cambia lo que **pasa en cada oleada**: una tabla
de composición con fórmulas, tres enemigos nuevos que obligan a jugar distinto (minas que cercan el
espacio, enjambres que persiguen en masa) y un temporizador que castiga la lentitud.

Las diferencias con la otra variante son de diseño real, no de cantidad: aquí hay que decidir
**qué enemigo matar primero**, **cuándo gastar la bomba** (una Vaina destruida por bomba no suelta
Enjambre) y **cuándo arriesgar el hiperespacio**. En la variante 01 casi siempre la respuesta es
«el Lander más cercano».

Como con Snake (SPEC 10) y con las propuestas `ciempies` y `ranaria`, **no hay código de
referencia**: las constantes de este documento **son** el diseño; cambiarlas durante la
implementación es rediseñar, no implementar. Todo se dibuja con primitivas de canvas, sin
spritesheet ni audio.

---

## Alcance

**Dentro:**

- `lib/games/defensor/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createDefensorGame`, sin assets externos.
- Viewport de **800×600**, mundo lógico circular de **3200 px**, franja de radar de 56 px
  (`y 0..56`) dibujada en el canvas, zona de juego `y 56..600`, terreno determinista periódico.
- Nave con empuje inercial, láser con barrido de colisión, bomba inteligente e **hiperespacio**
  con riesgo de explosión.
- 10 humanoides con el ciclo completo: secuestro, caída, caza al vuelo, depósito.
- Enemigos: Lander, Mutante, **Bombardero** (siembra minas), **Vaina** (se abre en Enjambres),
  **Enjambre** (rápido y errático) y **Cazador** (aparece si la oleada se alarga).
- **Tabla de oleadas** con fórmulas explícitas de composición y velocidad.
- Destrucción del planeta al perder el último humanoide; restauración cada 4 oleadas.
- 3 vidas, vida y bomba extra cada 10 000 puntos.
- Nueva ficha `defensor` en `lib/games.ts` (`SHOOTER`) y clase `cover-defensor` en
  `app/globals.css`.
- Una línea `defensor` en `GAME_ENGINES` (`lib/games/registry.ts`).
- Migración `insert into public.games (id, title) values ('defensor', 'DEFENSOR')` y su
  aplicación.

**Fuera de alcance (para specs futuras o para la variante `01-clasico-rescate.md`):**

- Un segundo modo de juego o selección de dificultad.
- Sonido.
- Skins (`clasico`/`neon`/`retro`).
- Hiperespacio desde mando táctil (solo teclado `H`: el mando táctil tiene solo A y B).
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real: el guardado es el flujo de
  plataforma existente; el motor solo emite `onGameOver(score)`.

---

## Modelo de datos

**No se crea ninguna tabla nueva, ni columna, ni tipo de plataforma.** `GameEngineEntry` existe
desde la SPEC 08, `scores` y `game_stats` sirven a este juego sin tocarlas, y el leaderboard se
enciende con una fila en `games`.

Tipos locales del motor, sin exportar:

```ts
type Ship = { x: number; y: number; vx: number; facing: -1 | 1; invuln: number; carrying: Human | null; hyperCd: number };
type Laser = { x: number; y: number; dir: -1 | 1; life: number };
type Human = { x: number; y: number; state: "walking" | "captured" | "falling" | "carried"; dir: -1 | 1; turnAccum: number; fallFromY: number; abductor: Lander | null };
type Lander = { x: number; y: number; state: "hunt" | "abduct"; target: Human | null; shotAccum: number };
type Mutant = { x: number; y: number; shotAccum: number; jitter: number };
type Bomber = { x: number; y: number; vx: number; sine: number; mineAccum: number };
type Mine = { x: number; y: number; life: number };
type Pod = { x: number; y: number; vx: number; vy: number };
type Swarmer = { x: number; y: number; vx: number; vy: number; shotAccum: number };
type Baiter = { x: number; y: number; shotAccum: number };
type Bullet = { x: number; y: number; vx: number; vy: number };
```

Estado en la clausura de `createDefensorGame`:

- `ship`, `lasers`, `humans`, `landers`, `mutants`, `bombers`, `mines`, `pods`, `swarmers`,
  `baiters`, `bullets`.
- `camX`, `planetAlive`.
- `score`, `lives`, `level`, `bombs`, `nextExtraAt`.
- `spawnQueue: { kind; at: number }[]` (enemigos de la oleada por aparecer, con su tiempo),
  `waveClock` (ms desde que empezó la oleada), `baiterAccum` (ms).
- `laserCooldown`, `respawnAccum`, `state: "playing" | "dying" | "waveclear" | "gameover"`,
  `stateAccum`.
- Bucle: `rafId`, `lastTime`, `destroyed`. Entrada: `keys: Set<string>`.

Todas las coordenadas son de **mundo** (`0 ≤ x < WORLD_W`) y la distancia horizontal siempre es
circular: `dx = ((b - a + 1600 + 3200) % 3200) - 1600`. Es la única definición de `dx` que se usa
en colisiones, persecución y bomba.

---

## Plan de implementación

### 1. Constantes, mundo y terreno

`lib/games/defensor/engine.ts`, primera parte. Constantes de diseño:

```
W 800 · H 600 · WORLD_W 3200 · RADAR_H 56 · PLAY_TOP 56
terrainY(x) = 545 + 16 * sin(2π x / 800) + 9 * sin(2π x / 320)
SHIP_Y_MIN 70 · SHIP_Y_MAX(x) = terrainY(x) - 28
HUMANS_START 10 · LIVES_START 3 · BOMBS_START 3
EXTRA_EVERY 10000 (+1 vida y +1 bomba) · LIVES_MAX 6 · BOMBS_MAX 6
RESTORE_EVERY 4 (oleadas) · MAX_ENEMIES 60 (tope duro de enemigos vivos simultáneos)
DT_MAX 50 ms
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

`dxCirc(a, b)`, `wrapX(x)` y `worldToScreen(x) = ((x - camX + 1600 + 3200) % 3200) - 1600 + 400`;
un objeto es visible si su `screenX` está en `-40..840`.

Comprobación: `npm run build` limpio con el motor aún sin registrar.

### 2. Nave, cámara e hiperespacio

Constantes:

```
SHIP_W 36 · SHIP_H 14 · posición inicial (x=1600, y=300), facing 1
SHIP_VY 280 px/s · SHIP_ACCEL 900 px/s² · SHIP_DRAG 520 px/s² · SHIP_VX_MAX 520 px/s
CAM_OFFSET_RIGHT 240 · CAM_OFFSET_LEFT 560 · CAM_LERP 6 (1/s)
HYPER_COOLDOWN 4000 ms · HYPER_FAIL 0.15 · HYPER_INVULN_MS 600
```

- Control igual que en un Defender clásico: `←`/`A` y `→`/`D` fijan `facing` al instante y aceleran;
  sin tecla horizontal, `vx` decae con `SHIP_DRAG`. `↑`/`↓` o `W`/`S` mueven en vertical sin inercia.
- `KeyH` (sin repetición, y solo si `hyperCd <= 0`): la nave desaparece y reaparece en un `x`
  aleatorio del mundo a una `y` aleatoria dentro de `[SHIP_Y_MIN, SHIP_Y_MAX(x) - 20]`, con
  `vx = 0` y `invuln = HYPER_INVULN_MS`. Con probabilidad `HYPER_FAIL` la materialización falla:
  la nave explota (cuenta como muerte normal del paso 7). `hyperCd = HYPER_COOLDOWN`.
- Si la nave llevaba un humanoide, lo suelta en `falling` desde su `y` actual al hacer hiperespacio.

Comprobación: `npm run build` limpio; la nave se mueve como en la variante 01 y `H` la teletransporta.

### 3. Láser y bomba inteligente

Constantes:

```
LASER_SPEED 1100 px/s · LASER_LEN 150 px · LASER_LIFE 450 ms · LASER_COOLDOWN 140 ms · MAX_LASERS 4
BOMB_RANGE 400 px de distancia circular a cada lado de la nave
```

- `Space` dispara; la colisión es un **barrido de segmento** (punta anterior → nueva) contra el
  rectángulo del enemigo ampliado 4 px, para que 55 px por frame no atraviesen un enemigo.
- `KeyB` (sin repetición) gasta una bomba y destruye todo enemigo, mina y disparo enemigo dentro de
  `BOMB_RANGE`, puntuándolos como muertes de láser, **con una excepción de diseño: una Vaina
  destruida por bomba no suelta Enjambre** (por láser sí). Es el motivo táctico de la bomba contra
  las Vainas.
- Destello blanco de 120 ms.

Comprobación: `npm run build` limpio.

### 4. Humanoides y Landers

Idénticos a la variante 01, constantes incluidas, y declarados aquí para que esta spec sea
autosuficiente:

```
HUMAN_W 10 · HUMAN_H 18 · HUMAN_SPEED 20 px/s · HUMAN_TURN_MS 2000..5000
LANDER_W 26 · LANDER_H 22 · LANDER_HUNT_VX 60 · LANDER_HUNT_VY 40 · LANDER_GRAB_DIST 14
LANDER_RISE_VY -35 · techo de absorción y = 68 · LANDER_SHOT_MS 2500..4000 · LANDER_BULLET_SPEED 220
FALL_G 300 px/s² · FALL_SAFE_PX 180
POINTS_LANDER 150 · POINTS_CATCH 500 · POINTS_DELIVER 500
```

- `walking` → `captured` (sube con el Lander) → desaparece arriba y el Lander se vuelve Mutante.
- Lander muerto con humanoide: `POINTS_LANDER` y el humanoide pasa a `falling` con
  `fallFromY`; muere si cae más de `FALL_SAFE_PX`; si la nave lo atrapa en vuelo (solape) lo carga
  (`POINTS_CATCH`) y al depositarlo en el suelo (`ship.y >= terrainY(ship.x) - 44`) puntúa
  `POINTS_DELIVER`. La nave carga uno a la vez.
- Dos Landers sobre el mismo humanoide: solo el primero lo captura; el otro elige otro objetivo.

Comprobación: `npm run build` limpio.

### 5. Mutantes, Bombarderos, Vainas, Enjambres y minas

Constantes:

```
MUTANT_W 26 · MUTANT_H 22 · MUTANT_SPEED 170 · jitter ±60 cada 400 ms · MUTANT_SHOT_MS 900..1600 · POINTS_MUTANT 150

BOMBER_W 30 · BOMBER_H 20 · BOMBER_VX 90 px/s (dirección fija al aparecer) · oscilación vertical
  y = base + 40 * sin(t * 2.2) · MINE_DROP_MS 1100..1700 · POINTS_BOMBER 250
MINE_R 8 · MINE_LIFE_MS 12000 · POINTS_MINE 25 (la mina se puede disparar, no persigue)

POD_W 28 · POD_H 28 · POD_VX 70 px/s · POD_VY ±30 px/s con rebote en PLAY_TOP+20 / terrainY-60
  POD_SWARMERS 6 (al morir por láser) · POINTS_POD 1000

SWARMER_W 14 · SWARMER_H 10 · SWARMER_SPEED 240 px/s con aceleración lateral 600 px/s²
  hacia la nave · SWARMER_SHOT_MS 1500..2800 (solo si la nave está a menos de 300 px)
  POINTS_SWARMER 150
```

- El Bombardero cruza el viewport de lado a lado, deja Minas estáticas en el aire y **nunca ataca
  a la nave directamente**; es una amenaza de área. Dura hasta ser destruido.
- Una Mina tocando la nave la mata (como un disparo). Se destruye con un láser (`POINTS_MINE`) o con
  bomba, y desaparece sola a los `MINE_LIFE_MS`.
- La Vaina cruza lenta y sin disparar. Al morir por **láser**, suelta `POD_SWARMERS` Enjambres en su
  posición con velocidades iniciales radiales distintas. Al morir por bomba no suelta ninguno.
- Los Enjambres se aceleran hacia la nave pero con inercia, así que pasan de largo y vuelven en
  curvas; son los enemigos más rápidos del juego tras el Cazador.
- Un Mutante nace como en la variante 01: un Lander que consuma el secuestro.

Comprobación: `npm run build` limpio; un Bombardero de prueba deja minas y una Vaina de prueba
suelta 6 Enjambres al morir por láser y ninguno por bomba.

### 6. Tabla de oleadas, planeta y Cazador

Constantes y fórmulas por `level` (oleada actual, empieza en 1):

```
LANDERS(level)   = min(8 + 2 * level, 26)
BOMBERS(level)   = level < 2 ? 0 : min(level - 1, 6)
PODS(level)      = level < 3 ? 0 : min(floor((level - 1) / 2), 4)
SPAWN_BATCH      = 4 Landers al inicio; el resto en spawnQueue con at = i * SPAWN_STEP(level)
SPAWN_STEP(level)= max(900, 2400 - 100 * level) ms
Bombarderos y Vainas entran a los 6000 ms y 10000 ms de waveClock, repartidos con 3000 ms entre sí
ENEMY_SPEED_MULT(level) = min(1 + 0.04 * (level - 1), 1.5)  (se aplica a LANDER_HUNT_VX/VY,
  MUTANT_SPEED, BOMBER_VX, POD_VX y SWARMER_SPEED)
WAVE_HUMAN_BONUS(level) = 100 * min(level, 5) por humanoide vivo
WAVE_CLEAR_PAUSE_MS 2500
BAITER_AFTER_MS 45000 · BAITER_EVERY_MS 8000 · MAX_BAITERS 3
BAITER_W 28 · BAITER_H 14 · BAITER_SPEED 380 px/s hacia la nave · BAITER_SHOT_MS 700..1100
POINTS_BAITER 200
```

- Una oleada está superada cuando `spawnQueue` está vacía y no quedan Landers, Mutantes,
  Bombarderos, Vainas ni Enjambres. **Las Minas y los Cazadores no cuentan:** al superar la oleada
  se limpian todas.
- Pasados `BAITER_AFTER_MS` de `waveClock` sin superarla, aparece un Cazador a `x` aleatorio fuera
  de la vista y cada `BAITER_EVERY_MS` otro, hasta `MAX_BAITERS`. Castigan la lentitud, no bloquean
  el avance.
- El tope `MAX_ENEMIES` se respeta: si una Vaina va a soltar Enjambres y se supera, solo se crean
  los que caben. Las minas no cuentan para el tope pero se limitan a 24 vivas (la más antigua se
  elimina primero).
- Planeta destruido al perder el último humanoide: `planetAlive = false`, terreno oculto, los
  Landers vivos pasan a Mutantes, y las oleadas siguientes no tienen humanoides (los Landers solo
  vagan y disparan). Cada `RESTORE_EVERY` oleadas el planeta se restaura con `HUMANS_START`
  humanoides.
- Umbral extra: cada `EXTRA_EVERY` puntos, +1 vida y +1 bomba (topes `LIVES_MAX` / `BOMBS_MAX`).

Comprobación: `npm run build` limpio; la oleada 1 trae 10 Landers y ningún otro enemigo, la 2 añade
un Bombardero y la 3 una Vaina.

### 7. Muerte, radar y dibujo

Constantes:

```
DYING_MS 1200 · RESPAWN_INVULN_MS 2000 · SHIP_HITBOX 30×10
RADAR_X 160 · RADAR_W 480 · RADAR_SCALE 0.15
```

- La nave muere al tocar un Lander, Mutante, Bombardero, Vaina, Enjambre, Cazador, Mina o disparo
  enemigo, si `invuln <= 0`. `lives--`, `onLives(lives)`, `state = "dying"` durante `DYING_MS`.
  Un fallo de hiperespacio entra por el mismo camino. Si llevaba un humanoide, lo suelta.
- Pasado `DYING_MS`: con `lives === 0`, `state = "gameover"`, el bucle se detiene y
  `onGameOver(score)` se llama **una sola vez**; si no, reaparece en `(ship.x, 300)` con
  `invuln = RESPAWN_INVULN_MS` parpadeando. Los enemigos no desaparecen, salvo las Minas
  a menos de 120 px del punto de reaparición, que se eliminan para no matar en el acto.
- `draw()`: fondo negro; terreno polilínea si `planetAlive`; humanoides amarillos; Landers verdes;
  Mutantes magenta; Bombarderos naranja; Vainas violeta; Enjambres rosa pequeños; Cazadores
  blancos; Minas rojas parpadeantes; nave cian orientada según `facing`; láseres blancos;
  disparos enemigos rojos. Visible solo si `screenX` está en `-40..840`.
- **Radar** (`y 0..56`): marco, línea de terreno, un punto por entidad en
  `RADAR_X + x * RADAR_SCALE` (Minas y disparos no se pintan) y un corchete con el viewport.
- Dentro del canvas solo hay radar, iconos de bomba, un indicador pequeño de enfriamiento del
  hiperespacio junto al radar y un rótulo `OLEADA N` de 1,5 s al empezar cada oleada. Sin
  puntuación, vidas ni overlay de game over: viajan por callbacks al HUD de plataforma.

Comprobación: `npm run build` limpio.

### 8. Bucle, entrada y avisos

- `emit()` con `lastScore` / `lastLives` / `lastLevel`, solo cuando cambia. `onLives(3)` y
  `onLevel(1)` al iniciar.
- `restart()`: detiene el bucle, vacía todas las listas, reinicia `score`, `lives`, `bombs`,
  `level`, `waveClock`, `nextExtraAt`, restaura planeta y humanoides, arranca la oleada 1 y emite.
- `dt` capado a `DT_MAX`; `lastTime = null` al reanudar.
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`, `KeyD`,
  `Space`, `KeyB`, `KeyH`. `preventDefault()` solo para esas.
- Listeners `keydown` / `keyup` / `blur` sobre el canvas, nunca sobre `window` o `document`;
  `blur` vacía `keys`. `P` y `Escape` no llegan al motor.
- `destroy()` cancela el frame, quita los tres listeners y es idempotente. `resume()` es no-op tras
  `gameover`.
- `initGame(); draw();` antes de devolver el motor.

Comprobación: `npm run build` limpio.

### 9. Catálogo: nueva ficha `defensor`

`lib/games.ts`, nueva entrada en `GAMES`:

```ts
{
  id: "defensor",
  title: "DEFENSOR",
  short: "Oleadas cada vez más pesadas sobre un planeta que defender.",
  long: "Un planeta de cuatro pantallas, diez humanoides que proteger y enemigos que no dejan de llegar: secuestradores, bombarderos que siembran minas y vainas que se abren en enjambres. Gasta la bomba con cabeza, rescata a los civiles en caída libre y salta al hiperespacio solo cuando no quede otra... si no explota en el intento.",
  cat: "SHOOTER",
  cover: "cover-defensor",
  color: "cyan",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `.cover-defensor` nueva, mismo patrón que las portadas generadas
existentes, sin imagen externa.

Comprobación: `/juegos/defensor` muestra la ficha con su portada antes de registrar el motor.

### 10. Registrar el motor

`lib/games/registry.ts`:

```ts
defensor: {
  create: createDefensorGame,
  width: 800,
  height: 600,
  controls: "flechas o WASD para mover y acelerar, espacio para disparar, B para la bomba inteligente, H para el hiperespacio",
  touch: { a: { code: "Space", label: "DISPARO" }, b: { code: "KeyB", label: "BOMBA" }, repeat: true },
},
```

Comprobación: `/jugar/defensor` pinta el canvas real en vez de `.game-arena`.

### 11. Leaderboard

`supabase/migrations/<timestamp>_juego_defensor.sql`:

```sql
insert into public.games (id, title) values ('defensor', 'DEFENSOR');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. Los tipos no se
regeneran.

Comprobación: `select * from public.games` incluye la fila `defensor`.

### 12. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido manual
de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/defensor` muestra un canvas de 800×600 con radar, terreno, nave y enemigos, no la
      `.game-arena`.
- [ ] La nave acelera y frena con inercia (≈520 px/s máx.), gira el morro al instante y la cámara
      deja más pantalla por delante.
- [ ] El mundo da la vuelta tras 3200 px sin salto visible ni enemigos que desaparezcan en el borde.
- [ ] El láser no atraviesa enemigos, incluso tras una pausa larga de pestaña; hay como máximo 4 a
      la vez.
- [ ] La oleada 1 trae solo Landers (10); la 2 añade un Bombardero; la 3 añade una Vaina.
- [ ] Un Bombardero cruza el viewport y deja Minas en el aire que matan al tocarlas y desaparecen a
      los 12 s.
- [ ] Una Mina se puede destruir con el láser y suma 25 puntos.
- [ ] Una Vaina destruida con láser suelta 6 Enjambres; destruida con `B`, ninguno.
- [ ] Los Enjambres pasan de largo y regresan en curva; solo disparan si la nave está a menos de
      300 px.
- [ ] Un Lander agarra un humanoide y lo sube; si llega arriba nace un Mutante; si muere antes, el
      humanoide cae y puede atraparse (+500) y depositarse (+500).
- [ ] Un humanoide soltado desde más de 180 px y no atrapado muere al caer.
- [ ] `B` destruye todo lo que hay en el viewport y gasta una bomba; mantenerla pulsada gasta una
      sola.
- [ ] `H` teletransporta la nave a una posición aleatoria con 0,6 s de invulnerabilidad y no se
      puede repetir antes de 4 s; en pruebas largas ~15 % de los usos acaba en explosión.
- [ ] `H` no tiene efecto en el mando táctil y no rompe nada.
- [ ] Tras 45 s sin completar la oleada aparece un Cazador, y otro cada 8 s hasta tres.
- [ ] Las Minas y los Cazadores no impiden superar la oleada y se limpian al hacerlo.
- [ ] Nunca hay más de 60 enemigos vivos ni más de 24 minas.
- [ ] El radar muestra nave, enemigos y humanoides de todo el mundo, sin pintar Minas ni disparos.
- [ ] Superar la oleada suma `100 × min(nivel, 5)` por humanoide vivo y el HUD sube de nivel.
- [ ] Perder el último humanoide oculta el terreno y convierte los Landers en Mutantes; en la
      oleada 4 el planeta vuelve con 10 humanoides.
- [ ] Cada 10 000 puntos el HUD suma una vida y sube el contador de bombas.
- [ ] Ser alcanzado resta una vida, la nave explota, reaparece parpadeando 2 s y las Minas a menos de
      120 px desaparecen.
- [ ] Perder la última vida abre el modal `FIN DEL JUEGO` con la puntuación real, una sola vez.
- [ ] El canvas no dibuja puntuación, vidas ni overlay de game over.
- [ ] `JUGAR DE NUEVO` reinicia planeta, enemigos, puntuación, vidas, bombas y nivel sin recargar.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'defensor'`.
- [ ] Esa puntuación aparece en `/salon?juego=defensor` y en `/juegos/defensor` sin recargar a mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Con `scores` vacía para este juego, `/salon?juego=defensor` muestra el estado vacío.
- [ ] `PAUSA` congela el juego (incluidos temporizadores de Cazador y enfriamiento de `H`) y
      `REANUDAR` lo reanuda sin saltos.
- [ ] `P` y `Escape` hacen lo mismo que el botón; con el canvas enfocado, flechas, WASD, espacio,
      `B` y `H` no hacen scroll de la página.
- [ ] Escribir `B`, `H`, `A`, `S`, `D` o espacio en el campo de iniciales no mueve ni dispara.
- [ ] Con 40+ enemigos y varias minas en pantalla el juego se mantiene fluido (≥ 50 FPS en el
      navegador de desarrollo).
- [ ] Navegar de `/jugar/defensor` a `/biblioteca` y volver no duplica el bucle.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid`, `/jugar/snake` y `/jugar/frogger` se
      juegan igual que antes.
- [ ] `select * from public.games` incluye una fila `defensor` además de las ya existentes.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/defensor`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** misma base que la variante 01 (viewport, mundo, nave, láser, radar, humanoides). Las
  variantes comparten el juego y se diferencian en el contenido de las oleadas.
- **Sí:** tabla de composición con fórmulas y tope. Hace que cada oleada se sienta distinta sin
  depender de ajustes «a ojo».
- **Sí:** la bomba no libera Enjambres al destruir una Vaina. Da una razón táctica para gastarla
  contra la Vaina y no solo contra grupos de Landers.
- **Sí:** el Bombardero no ataca directamente: siembra minas. Cambia el problema del jugador de
  «apuntar» a «ocupar el espacio con cuidado», que es lo que el género aporta con este enemigo.
- **Sí:** hiperespacio con 15 % de fallo y 4 s de enfriamiento. Salida de emergencia con riesgo
  real; sin riesgo sería un botón de invulnerabilidad.
- **Sí:** Cazador a los 45 s. Castiga esperar y evita que alguien alargue una oleada indefinidamente
  para farmear.
- **Sí:** minas y Cazadores no cuentan para superar la oleada. Si lo hicieran, una mina huérfana
  podría bloquear el avance.
- **Sí:** tope duro de 60 enemigos y 24 minas. Es un tope de rendimiento y de legibilidad, no de
  diseño.
- **Sí:** el planeta vuelve cada 4 oleadas, no cada 5: al haber más enemigos las partidas con
  planeta destruido son más duras, y esperar menos lo compensa.
- **Sí:** hiperespacio solo por teclado. El mando táctil tiene solo A y B y ampliar `TouchControls`
  es decisión de plataforma, no de esta spec.
- **No:** sonido ni skins en esta propuesta.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Muchas entidades con colisión por barrido contra todos los enemigos penalizan el rendimiento. | Tope de 60 enemigos y 24 minas, descarte de dibujo fuera de `-40..840` y criterio de aceptación de ≥ 50 FPS con 40+ enemigos. |
| Una Vaina soltando Enjambres sobre una nave cercana causa muertes injustas. | Los Enjambres nacen con velocidades radiales, no apuntadas, y la nave tiene `HYPER_INVULN_MS` / `RESPAWN_INVULN_MS` como ventanas de gracia; la bomba los evita del todo. |
| Las Minas del respawn matan a la nave nada más reaparecer. | Las Minas a menos de 120 px del punto de reaparición se eliminan. |
| El hiperespacio fallido en una nave con pocas vidas se siente injusto. | Riesgo de 15 % fijado y declarado fuera de cambio; el enfriamiento de 4 s evita usarlo como botón de pánico repetido. |
| La inercia combinada con minas estáticas hace el control frustrante. | Mismas constantes de nave que la variante 01 y minas con vida limitada de 12 s. |
| Las fórmulas de oleada se ajustan «a ojo» durante la implementación. | El paso 6 las fija y las declara fuera de cambio; cambiarlas es rediseñar. |
| Dos Landers compiten por el mismo humanoide y oscilan. | Solo el primero lo captura y el otro elige otro objetivo. |
| Cambio de pestaña acumula `dt` y dispara Cazadores o Enjambres de golpe. | `dt` capado a 50 ms, `lastTime = null` al reanudar, y `waveClock` solo avanza con `state === "playing"`. |
| Distancias mal calculadas en el borde del mundo. | `dxCirc` es la única definición de distancia horizontal; hay un criterio específico de cruce del borde. |

---

## Lo que **no** entra en esta spec

- Un segundo modo de juego o selección de dificultad.
- Sonido.
- Skins (`clasico`/`neon`/`retro`).
- Hiperespacio en el mando táctil.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.
- Rate limiting, antitrampas y validación de la puntuación en servidor.

Cada una de ellas, si entra, va en su propia spec.
