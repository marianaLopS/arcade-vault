# SPEC — DEFENSOR: clásico rescate

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-02
> **Objetivo:** Diseñar un port fiel al Defender de 1981 en su versión mínima — nave con empuje
> inercial sobre un mundo que da la vuelta en horizontal, humanoides que los Landers secuestran y
> que el jugador puede cazar al vuelo y devolver al suelo, Mutantes cuando el secuestro se
> consuma, radar y bomba inteligente — como ficha nueva `defensor` en categoría SHOOTER, con
> motor real y leaderboard en Supabase desde el primer día.

---

## Por qué existe esta spec

El catálogo tiene un solo SHOOTER real (`asteroids`, free-roam en gravedad cero sobre una
pantalla fija), uno en maqueta (`invasores`, formación estática) y otro propuesto en game jam
(`ciempies`, disparo vertical desde una franja). Ninguno tiene **un mundo mayor que la pantalla**
ni un objetivo que no sea «destruir todo»: en Defender el jugador protege a unos civiles
indefensos, y perderlos cambia las reglas de la partida. Esa tensión entre disparar y rescatar
es lo que el género aporta y lo que esta spec conserva.

Como con Snake (SPEC 10) y con las propuestas `ciempies` y `ranaria`, **no hay código de
referencia**: no existe ninguna carpeta `References/.../defender` en el repositorio, solo la
mención en `game-suggestions-todo.md`. Las constantes de este documento **son** el diseño; cambiarlas
durante la implementación es rediseñar, no implementar. Igual que Snake, todo se dibuja con
primitivas de canvas — sin spritesheet ni audio.

Esta variante es la lectura **mínima y fiel**: Lander, Mutante, humanoide, radar y bomba. La
segunda variante (`02-asalto-pesado.md`) añade Bombarderos, Vainas/Enjambres, Cazadores por
tiempo e hiperespacio, con una tabla de oleadas explícita; esta se queda en el conjunto más
pequeño que ya es reconociblemente Defender.

---

## Alcance

**Dentro:**

- `lib/games/defensor/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createDefensorGame`, sin assets externos.
- Viewport (canvas) de **800×600**. Mundo lógico de **3200 px** de ancho que da la vuelta
  (`x` módulo `WORLD_W`), con cámara horizontal que sigue a la nave.
- Franja superior de 56 px (`y 0..56`) ocupada por el **radar**, dibujado en el propio canvas
  porque es parte de la jugabilidad (muestra el mundo entero); zona de juego `y 56..600`.
- Terreno determinista (función periódica, sin aleatoriedad) sobre el que caminan los humanoides.
- Nave con empuje inercial horizontal, movimiento vertical directo, giro instantáneo del frente.
- Láser en ráfaga con barrido de colisión y bomba inteligente limitada.
- 10 humanoides; Landers que los secuestran y los llevan arriba; el humanoide soltado cae y puede
  ser cazado al vuelo por la nave y depositado en el suelo.
- Mutantes: Landers que consuman el secuestro, rápidos y que disparan.
- Destrucción del planeta al perder el último humanoide, y restauración cada 5 oleadas.
- 3 vidas, vida y bomba extra cada 10 000 puntos.
- Nueva ficha `defensor` en `lib/games.ts` (`SHOOTER`) y clase de portada `cover-defensor` en
  `app/globals.css`.
- Una línea `defensor` en `GAME_ENGINES` (`lib/games/registry.ts`).
- Migración `insert into public.games (id, title) values ('defensor', 'DEFENSOR')` y su
  aplicación.

**Fuera de alcance (para specs futuras o para la variante `02-asalto-pesado.md`):**

- Bombarderos, Vainas, Enjambres y Cazadores (Baiters).
- Hiperespacio.
- Progresión de dificultad con fórmulas por oleada más allá del incremento simple de esta variante.
- Un segundo modo de juego.
- Sonido.
- Skins (`clasico`/`neon`/`retro`).
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real: el guardado de la
  puntuación es el flujo de plataforma ya existente; el motor solo emite `onGameOver(score)`.

---

## Modelo de datos

**No se crea ninguna tabla nueva, ni columna, ni tipo de plataforma.** `GameEngineEntry` ya
existe desde la SPEC 08, `scores` y `game_stats` sirven a este juego sin tocarlas, y el
leaderboard se enciende con una fila en `games`.

Tipos locales del motor, sin exportar:

```ts
type Ship = { x: number; y: number; vx: number; facing: -1 | 1; invuln: number; carrying: Human | null };
type Laser = { x: number; y: number; dir: -1 | 1; life: number }; // x,y = punta; px de mundo
type Human = {
  x: number; y: number;
  state: "walking" | "captured" | "falling" | "carried";
  dir: -1 | 1; turnAccum: number; fallFromY: number; abductor: Lander | null;
};
type Lander = { x: number; y: number; state: "hunt" | "abduct"; target: Human | null; shotAccum: number };
type Mutant = { x: number; y: number; shotAccum: number; jitter: number };
type Bullet = { x: number; y: number; vx: number; vy: number };
```

Estado en la clausura de `createDefensorGame`:

- `ship: Ship`, `lasers: Laser[]`, `humans: Human[]`, `landers: Lander[]`, `mutants: Mutant[]`,
  `bullets: Bullet[]` (disparos enemigos).
- `camX` (px de mundo, esquina izquierda del viewport), `planetAlive: boolean`.
- `score`, `lives`, `level` (oleada), `bombs`, `nextExtraAt` (siguiente umbral de 10 000).
- `landersToSpawn`, `spawnAccum` (ms), `laserCooldown` (ms), `respawnAccum` (ms),
  `state: "playing" | "dying" | "waveclear" | "gameover"`, `stateAccum` (ms).
- Bucle: `rafId`, `lastTime`, `destroyed`. Entrada: `keys: Set<string>`.

Todas las coordenadas de entidades son de **mundo** (`0 ≤ x < WORLD_W`). La distancia horizontal
entre dos entidades siempre es la **distancia circular**: `dx = ((b - a + 1600 + 3200) % 3200) - 1600`.
Es la única definición de `dx` que se usa en colisiones, persecución y bomba.

---

## Plan de implementación

### 1. Constantes, mundo y terreno

`lib/games/defensor/engine.ts`, primera parte. Constantes de diseño:

```
W 800 · H 600 · WORLD_W 3200 · RADAR_H 56 · PLAY_TOP 56
terrainY(x) = 545 + 16 * sin(2π x / 800) + 9 * sin(2π x / 320)     (px; periódica en 3200)
SHIP_Y_MIN 70 · SHIP_Y_MAX(x) = terrainY(x) - 28
HUMANS_START 10 · LIVES_START 3 · BOMBS_START 3
EXTRA_EVERY 10000 (puntos: +1 vida y +1 bomba) · LIVES_MAX 6 · BOMBS_MAX 6
RESTORE_EVERY 5 (oleadas: el planeta vuelve y reaparecen 10 humanoides)
DT_MAX 50 ms
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

`dxCirc(a, b)` según la fórmula del modelo de datos; `wrapX(x)`; `worldToScreen(x) = ((x - camX +
1600 + 3200) % 3200) - 1600 + 400` — un objeto es visible si su `screenX` cae en `-40..840`.

Comprobación: `npm run build` limpio con el motor aún sin registrar.

### 2. Nave y cámara

Constantes:

```
SHIP_W 36 · SHIP_H 14 · posición inicial (x=1600, y=300), facing 1
SHIP_VY 280 px/s (movimiento vertical directo con ↑/↓ o W/S, sin inercia)
SHIP_ACCEL 900 px/s² hacia el frente mientras se mantiene ←/→ o A/D
SHIP_DRAG 520 px/s² cuando no se pulsa ninguna tecla horizontal
SHIP_VX_MAX 520 px/s
CAM_OFFSET_RIGHT 240 · CAM_OFFSET_LEFT 560 · CAM_LERP 6 (1/s)
```

- Pulsar `←`/`A` pone `facing = -1` al instante y acelera hacia la izquierda; `→`/`D`, lo
  contrario. Si el frente cambia con la nave en movimiento, `vx` se frena con `SHIP_ACCEL` (no se
  invierte de golpe): es la inercia que define el control del género.
- `x = wrapX(x + vx * dt)`; `y` clamado a `[SHIP_Y_MIN, SHIP_Y_MAX(x)]`.
- Cámara: `camTarget = ship.x - (facing === 1 ? CAM_OFFSET_RIGHT : CAM_OFFSET_LEFT)`; cada frame
  `camX += dxCirc(camX, camTarget) * min(1, CAM_LERP * dt/1000)`, luego `wrapX`. Así la nave
  «mira» hacia donde va y deja más pantalla delante.

Comprobación: `npm run build` limpio; con el motor arrancado a mano la nave acelera, frena con
inercia y la cámara cambia de lado al girar.

### 3. Láser y bomba inteligente

Constantes:

```
LASER_SPEED 1100 px/s · LASER_LEN 150 px · LASER_LIFE 450 ms (≈ 495 px de alcance)
LASER_COOLDOWN 140 ms · MAX_LASERS 4
BOMB_RANGE 400 px de distancia circular a cada lado de la nave (el viewport completo)
```

- `Space` dispara si `laserCooldown <= 0` y `lasers.length < MAX_LASERS`: crea un `Laser` en el
  morro de la nave con `dir = facing`.
- El láser avanza `LASER_SPEED * dt`; **la colisión es un barrido**: el segmento recorrido en el
  frame (de la punta anterior a la nueva) contra el rectángulo del enemigo ampliado 4 px, para que
  con `dt = 50 ms` (55 px por frame) no atraviese un Lander de 26 px.
- `KeyB` (una pulsación, no repetición: se ignora `e.repeat`) gasta una bomba si `bombs > 0`:
  destruye todos los Landers, Mutantes y disparos enemigos con `|dxCirc(ship.x, e.x)| <= BOMB_RANGE`
  y puntúa cada enemigo como si lo hubiera matado el láser. Un destello blanco de 120 ms
  cubre el canvas.
- Un Lander con humanoide capturado destruido por láser **o** por bomba suelta al humanoide
  (paso 4).

Comprobación: `npm run build` limpio; el láser mata un Lander de prueba a 400 px sin atravesarlo.

### 4. Humanoides, Landers y secuestro

Constantes:

```
HUMAN_W 10 · HUMAN_H 18 · HUMAN_SPEED 20 px/s · HUMAN_TURN_MS 2000..5000 (aleatorio)
LANDER_W 26 · LANDER_H 22
LANDER_HUNT_VX 60 px/s hacia el humanoide libre más cercano · LANDER_HUNT_VY 40 px/s (baja)
LANDER_GRAB_DIST 14 px (distancia a la que lo agarra, ya en el suelo)
LANDER_RISE_VY -35 px/s con el humanoide · techo de absorción y = PLAY_TOP + 12
LANDER_SHOT_MS 2500..4000 (aleatorio) · LANDER_BULLET_SPEED 220 px/s hacia la nave
FALL_G 300 px/s² · FALL_SAFE_PX 180 (altura de caída que aún se sobrevive)
POINTS_LANDER 150 · POINTS_CATCH 500 · POINTS_DELIVER 500
```

Máquina de estados del humanoide:

- `walking`: camina `HUMAN_SPEED` con `dir`, cambia `dir` cada `HUMAN_TURN_MS`, pegado a `terrainY`.
- `captured`: sube con su Lander (`abductor`), `y` igual a `lander.y + 20`.
- `falling`: soltado en el aire; `vy += FALL_G * dt`. Al tocar `terrainY`: si `y_caída =
  terrainY - fallFromY > FALL_SAFE_PX` **muere**; si no, vuelve a `walking`.
- `carried`: la nave lo ha cazado al vuelo (solape nave–humanoide en `falling`); `puntúa
  POINTS_CATCH` y viaja pegado bajo la nave. Cuando `ship.y >= terrainY(ship.x) - 44` lo
  deposita (`walking`) y puntúa `POINTS_DELIVER`. La nave solo carga uno a la vez.

Máquina de estados del Lander:

- `hunt`: elige el humanoide `walking` libre más cercano (por `dxCirc`) y se desplaza hacia él;
  baja a `LANDER_HUNT_VY` hasta `y = terrainY - 22`. Si no queda ningún humanoide libre, vaga a
  `y = 160` sin perseguir. Dispara a la nave si está dentro del viewport.
- `abduct`: al llegar a `LANDER_GRAB_DIST` toma al humanoide (`captured`) y sube a `LANDER_RISE_VY`.
  Al alcanzar el techo, el humanoide **desaparece** (+0 puntos) y el Lander se convierte en
  **Mutante** en la misma posición.
- Si el Lander muere con `state = abduct`: suma `POINTS_LANDER` y el humanoide pasa a `falling`
  con `fallFromY` = su `y` en ese instante.
- Si dos Landers apuntan al mismo humanoide, solo el primero que llega lo captura; el otro vuelve
  a elegir objetivo.

Comprobación: `npm run build` limpio; un Lander de prueba captura un humanoide, y matarlo en el
aire hace caer al humanoide, que muere si cae desde más de 180 px.

### 5. Mutantes, planeta y oleadas

Constantes:

```
MUTANT_W 26 · MUTANT_H 22 · MUTANT_SPEED 170 px/s hacia la nave con jitter lateral
  ±60 px/s (cambia cada 400 ms) · MUTANT_SHOT_MS 900..1600 · MUTANT_BULLET_SPEED 260 px/s
POINTS_MUTANT 150
WAVE_LANDERS 10 · WAVE_FIRST_BATCH 5 · WAVE_SPAWN_MS 2500 (uno cada 2,5 s hasta completar los 10)
WAVE_HUMAN_BONUS(nivel) = 100 * min(nivel, 5) por humanoide vivo
WAVE_CLEAR_PAUSE_MS 2500
```

- Al empezar una oleada, `landersToSpawn = WAVE_LANDERS`; salen 5 de golpe en `x` aleatorios del
  mundo a `y = PLAY_TOP + 20`, y el resto de uno en uno cada `WAVE_SPAWN_MS`.
- **Oleada superada** cuando `landersToSpawn === 0` y no quedan Landers ni Mutantes: se pasa a
  `waveclear`, se suma `WAVE_HUMAN_BONUS(level) × humanoides vivos` y tras `WAVE_CLEAR_PAUSE_MS`
  empieza `level + 1`. Los humanoides supervivientes se conservan entre oleadas.
- **Planeta destruido** cuando muere o desaparece el último humanoide: `planetAlive = false`, el
  terreno deja de pintarse (el fondo del radar también), los Landers vivos pasan a Mutantes de
  golpe y las oleadas siguientes ya no tienen humanoides: los Landers solo vagan y disparan.
- Cada `RESTORE_EVERY` oleadas (`level % 5 === 0` al empezar) el planeta se restaura:
  `planetAlive = true` y reaparecen `HUMANS_START` humanoides.
- Umbral extra: al cruzar `nextExtraAt`, `lives = min(lives + 1, LIVES_MAX)`,
  `bombs = min(bombs + 1, BOMBS_MAX)` y `nextExtraAt += EXTRA_EVERY`.

Comprobación: `npm run build` limpio; matar a los 10 Landers con los 10 humanoides vivos pasa a la
oleada 2 con el bonus aplicado.

### 6. Muerte, vidas, radar y dibujo

Constantes:

```
DYING_MS 1200 · RESPAWN_INVULN_MS 2000 · SHIP_HITBOX 30×10 (más pequeña que el dibujo)
RADAR_X 160 · RADAR_W 480 · RADAR_SCALE 0.15 (= 480 / 3200)
```

- Tocar a la nave: Lander, Mutante o disparo enemigo, solo si `invuln <= 0`. `lives--`,
  `onLives(lives)`, `state = "dying"` durante `DYING_MS` (explosión de partículas simples). Si la
  nave llevaba un humanoide, lo suelta en `falling`. Los enemigos no desaparecen.
- Pasado `DYING_MS`: si `lives === 0`, `state = "gameover"`, se detiene el bucle y
  `onGameOver(score)` se llama **una sola vez**; si no, la nave reaparece en `(x = ship.x,
  y = 300)` con `invuln = RESPAWN_INVULN_MS` (parpadea).
- `draw()`: fondo negro; terreno como polilínea (cada 8 px) si `planetAlive`; humanoides como
  rectángulos amarillos; Landers verdes, Mutantes magenta; nave cian en forma de punta con el
  frente según `facing`; láseres blancos; disparos enemigos rojos. Cada entidad se dibuja en
  `worldToScreen(x)` y se descarta fuera de `-40..840`.
- **Radar** (`y 0..56`): marco, línea del terreno, y un punto por entidad en `RADAR_X + x *
  RADAR_SCALE` con color propio (nave blanca, Landers verdes, Mutantes magenta, humanoides
  amarillos) y un corchete con la porción visible del viewport. Es el único elemento de UI
  dentro del canvas, más el rótulo `OLEADA N` de 1,5 s al empezar cada oleada (como el `PULSA UNA FLECHA` de Snake,
  es estado propio del juego).
- Sin puntuación, vidas, bombas ni overlay de game over dibujados en el canvas: puntuación, vidas y
  nivel viajan por callbacks al HUD de plataforma. Las bombas restantes se dibujan como
  iconos junto al radar porque no existe callback para ellas (decisión explícita, ver abajo).

Comprobación: `npm run build` limpio; morir con vidas restantes reaparece parpadeando, y con la
última vida dispara `onGameOver`.

### 7. Bucle, entrada y avisos

- `emit()` con `lastScore` / `lastLives` / `lastLevel`, llamando a los callbacks solo cuando el
  valor cambia. `onLives(LIVES_START)` y `onLevel(1)` al iniciar.
- `restart()`: detiene el bucle, vacía todas las listas, reinicia `score`, `lives`, `bombs`,
  `level`, `nextExtraAt = EXTRA_EVERY`, restaura planeta y humanoides, arranca la oleada 1 y emite.
- `dt` en milisegundos capado a `DT_MAX`; `lastTime = null` al reanudar.
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`, `KeyD`,
  `Space`, `KeyB`. `preventDefault()` solo para esas.
- Listeners `keydown` / `keyup` / `blur` sobre el canvas, nunca sobre `window` o `document`;
  `blur` vacía `keys`. `P` y `Escape` no llegan al motor.
- `destroy()` cancela el frame, quita los tres listeners y es idempotente. `resume()` es no-op tras
  `gameover`.
- `initGame(); draw();` antes de devolver el motor.

Comprobación: `npm run build` limpio.

### 8. Catálogo: nueva ficha `defensor`

`lib/games.ts`, nueva entrada en `GAMES`:

```ts
{
  id: "defensor",
  title: "DEFENSOR",
  short: "Protege a los humanoides de los secuestradores alienígenas.",
  long: "Tu nave patrulla un planeta que no cabe en la pantalla. Los Landers bajan a secuestrar a los humanoides y, si consiguen subirlos, se transforman en mutantes letales. Dispáralos, atrapa a los civiles en caída libre y devuélvelos al suelo antes de que el planeta se quede sin vida.",
  cat: "SHOOTER",
  cover: "cover-defensor",
  color: "cyan",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `.cover-defensor` nueva, mismo patrón que las portadas generadas
existentes (gradiente o patrón repetido, sin imagen externa).

Comprobación: `/juegos/defensor` muestra la ficha con su portada antes de registrar el motor.

### 9. Registrar el motor

`lib/games/registry.ts`:

```ts
defensor: {
  create: createDefensorGame,
  width: 800,
  height: 600,
  controls: "flechas o WASD para mover y acelerar, espacio para disparar, B para la bomba inteligente",
  touch: { a: { code: "Space", label: "DISPARO" }, b: { code: "KeyB", label: "BOMBA" }, repeat: true },
},
```

Comprobación: `/jugar/defensor` pinta el canvas real en vez de `.game-arena`.

### 10. Leaderboard

`supabase/migrations/<timestamp>_juego_defensor.sql`:

```sql
insert into public.games (id, title) values ('defensor', 'DEFENSOR');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. Los tipos no se
regeneran: insertar una fila no cambia el esquema.

Comprobación: `select * from public.games` incluye la fila `defensor`.

### 11. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido manual
de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/defensor` muestra un canvas de 800×600 con radar, terreno, nave y enemigos, no la
      `.game-arena`.
- [ ] Mantener `→` acelera la nave progresivamente hasta ~520 px/s; soltar la tecla la frena con
      inercia en unos 1,0 s, no al instante.
- [ ] Pulsar `←` con la nave yendo a la derecha gira el morro al instante pero la nave tarda en
      invertir su movimiento.
- [ ] La cámara deja más pantalla delante: con la nave mirando a la derecha aparece a ~30 % del
      ancho; mirando a la izquierda, a ~70 %.
- [ ] Volar en una dirección sin parar vuelve al punto de partida tras 3200 px: el mundo da la
      vuelta sin salto visible ni enemigos que desaparezcan al cruzar el borde.
- [ ] La nave no puede bajar del terreno ni subir por encima del radar.
- [ ] El láser nunca atraviesa un Lander, ni siquiera tras una pausa larga de la pestaña.
- [ ] Hay como máximo 4 láseres a la vez y el ritmo de disparo no supera ~7 por segundo.
- [ ] La oleada 1 empieza con 5 Landers y el resto llega de uno en uno cada ~2,5 s hasta 10.
- [ ] Un Lander desciende, agarra un humanoide y lo sube; si llega arriba, el humanoide
      desaparece y el Lander se convierte en Mutante.
- [ ] Matar al Lander durante el ascenso suelta al humanoide; si lo atrapas antes de que toque
      suelo suma 500 y, al depositarlo en el suelo, otros 500.
- [ ] Un humanoide soltado desde más de 180 px de altura y no atrapado muere al caer; desde menos
      de 180 px sobrevive.
- [ ] El radar muestra a la nave, los enemigos y los humanoides del mundo entero, con el corchete
      sobre la parte visible.
- [ ] `B` destruye todos los enemigos del viewport y gasta una bomba; sin bombas no hace nada.
      Mantener `B` pulsado gasta una sola bomba.
- [ ] Al perder el último humanoide el terreno desaparece y los Landers restantes se vuelven
      Mutantes; en la oleada 5 el planeta vuelve con 10 humanoides.
- [ ] Al cruzar 10 000 puntos el HUD suma una vida y el contador de bombas sube.
- [ ] Ser alcanzado resta una vida en el HUD, la nave explota, reaparece parpadeando y no puede
      morir durante 2 s.
- [ ] Perder la última vida abre el modal `FIN DEL JUEGO` con la puntuación real, una sola vez.
- [ ] Superar la oleada suma el bonus `100 × min(nivel, 5)` por humanoide vivo y el HUD pasa a
      nivel 02.
- [ ] El canvas no dibuja puntos, vidas ni overlay de game over (solo radar, iconos de bomba y el
      rótulo de oleada).
- [ ] `JUGAR DE NUEVO` reinicia planeta, humanoides, puntuación, vidas, bombas y nivel sin
      recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'defensor'`.
- [ ] Esa puntuación aparece en `/salon?juego=defensor` y en `/juegos/defensor` sin recargar a mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Con `scores` vacía para este juego, `/salon?juego=defensor` muestra el estado vacío.
- [ ] El botón `PAUSA` congela el juego y `REANUDAR` lo reanuda sin saltos de cámara ni de entidades.
- [ ] `P` y `Escape` hacen lo mismo que el botón; con el canvas enfocado, flechas, WASD, espacio y
      `B` no hacen scroll de la página.
- [ ] Escribir `B`, `A`, `S`, `D` o espacio en el campo de iniciales no mueve ni dispara.
- [ ] Navegar de `/jugar/defensor` a `/biblioteca` y volver no duplica el bucle.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid`, `/jugar/snake` y `/jugar/frogger` se
      juegan igual que antes.
- [ ] `select * from public.games` incluye una fila `defensor` además de las ya existentes.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/defensor`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** viewport 800×600 y mundo de 3200 px. Mantiene el marco 4/3 de Asteroids, Arkanoid y
  Snake y deja el mundo en exactamente 4 pantallas, lo que hace la función de terreno periódica
  sin costuras.
- **Sí:** todo el mundo es circular y toda distancia usa `dxCirc`. Es la regla que hace creíble el
  scroll infinito y evita la clase de bugs «el enemigo no me ve al otro lado del borde».
- **Sí:** empuje inercial y giro de morro instantáneo. Es lo que distingue a Defender de un
  shooter lateral genérico; con control directo sería otro juego.
- **Sí:** barrido de colisión del láser. A 1100 px/s y `DT_MAX = 50 ms` un láser avanza 55 px por
  frame, más que un Lander entero.
- **Sí:** el planeta se destruye al perder el último humanoide y se restaura cada 5 oleadas. Es la
  regla central del original: el jugador no solo sobrevive, **defiende algo**.
- **Sí:** caída segura hasta 180 px. Da margen a rescatar sin que cada humanoide soltado sea una
  muerte segura.
- **Sí:** radar dibujado en el canvas. Sin él un mundo de 4 pantallas es injugable; es estado del
  juego y no un overlay de plataforma.
- **Sí:** iconos de bomba junto al radar. `GameCallbacks` no tiene canal para bombas y ampliar el
  contrato es una decisión de plataforma que esta spec no toma.
- **No:** Bombarderos, Vainas, Enjambres, Cazadores ni hiperespacio en esta variante. Son la capa
  de `02-asalto-pesado.md`; incluirlos aquí duplicaría esa spec en vez de ofrecer una alternativa.
- **Sí:** bonus por humanoides vivos acotado a ×5. Premia proteger sin que una racha larga
  desborde la puntuación.
- **No:** sonido ni skins. Ningún asset de audio y cero paletas alternativas para esta primera
  propuesta; skins puede añadirse después con `skin-designer`.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Distancias mal calculadas en el borde del mundo (enemigos que no persiguen o colisiones perdidas al cruzar x = 0/3200). | `dxCirc` es la única definición de distancia horizontal y hay un criterio de aceptación específico de cruce del borde. |
| El láser atraviesa enemigos con `dt` alto. | Colisión por barrido de segmento con margen de 4 px y `dt` capado a 50 ms. |
| La cámara con `lerp` marea al invertir el frente repetidamente. | `CAM_LERP` 6/s y los dos offsets fijados en el paso 2; se verifica girando rápido. |
| La inercia hace el control poco preciso sin referencia previa. | Las constantes (`SHIP_ACCEL`, `SHIP_DRAG`, `SHIP_VX_MAX`) están fijadas y declaradas fuera de cambio; se ajustan en una spec posterior, no durante la implementación. |
| Dos Landers compiten por el mismo humanoide y se quedan oscilando. | Solo el primero que llega lo captura; el otro vuelve a elegir objetivo entre los libres. |
| Sin humanoides la partida puede alargarse sin presión. | Los Landers pasan a Mutantes de golpe y la oleada 5 restaura el planeta. |
| El mando táctil necesita empuje continuo y la cruceta envía keydown. | `touch.repeat: true` y `keys` en el motor: la cruceta mantiene el empuje mientras se pulsa. |
| El cambio de pestaña acumula `dt` enorme. | `dt` capado a 50 ms y `lastTime = null` al reanudar. |
| Portar sin código de referencia hace que las constantes se ajusten sobre la marcha. | Los pasos 1–6 las fijan y las declaran fuera de cambio, como Snake (SPEC 10). |

---

## Lo que **no** entra en esta spec

- Bombarderos, Vainas, Enjambres, Cazadores e hiperespacio.
- Fórmulas de dificultad por oleada más allá de lo fijado en el paso 5.
- Un segundo modo de juego.
- Sonido.
- Skins (`clasico`/`neon`/`retro`).
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.
- Rate limiting, antitrampas y validación de la puntuación en servidor.

Cada una de ellas, si entra, va en su propia spec.
