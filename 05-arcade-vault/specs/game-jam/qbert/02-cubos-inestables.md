# SPEC — QBERT: cubos inestables

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-12
> **Objetivo:** Diseñar una variante de Q*bert en la que los cubos necesitan varios aterrizajes y pueden revertirse, con enemigos que deshacen el trabajo (gemelos), un power-up que congela el tablero (bola verde) y un multiplicador de racha que premia saltar sin desperdiciar movimientos — como ficha `qbert` con motor real y leaderboard en Supabase.

---

## Por qué existe esta spec

La variante `01-piramide-clasica.md` es el Q*bert mínimo: un salto pinta un cubo y todo el riesgo
viene de los enemigos que te persiguen. Esta variante parte del mismo juego base — misma pirámide
isométrica de 28 cubos, mismo salto diagonal, mismos discos, mismo Coily — pero mueve el desafío
**desde los enemigos hacia el propio tablero**. Los cubos tienen varios estados, pisar uno ya
terminado puede deshacerlo, y los jugadores deben planificar una ruta eficiente en lugar de limitarse a
huir. A cambio hay un enemigo inofensivo que hay que cazar (los gemelos que despintan) y un
power-up táctico (la bola verde que congela), y la puntuación premia la **racha**: encadenar
aterrizajes útiles multiplica los puntos y un salto en falso rompe el multiplicador.

El resultado es una partida de ritmo más pensado: menos «sobrevive hasta pintar» y más «traza la
ruta». Es una variante distinta, no una reescritura: el tablero, los controles y la mayor parte de
las constantes de movimiento son iguales, pero las reglas de los cubos, la tabla de enemigos, la
puntuación y la progresión por rondas cambian por completo.

Como con las demás propuestas de game jam, **no hay código de referencia**: las constantes de este
documento son el diseño. Se repiten completas (aunque coincidan con la variante 01) para que la
spec sea autosuficiente. Cambiarlas durante la implementación es rediseñar, no implementar.

---

## Alcance

**Dentro:**

- `lib/games/qbert/engine.ts`: motor nuevo, todo el estado en la clausura de `createQbertGame`, sin
  assets externos.
- Mundo lógico de **800×600**, pirámide isométrica de 7 filas (28 cubos), salto diagonal discreto
  con un salto en búfer, dos discos voladores. Idénticos a la variante 01.
- **Cubos de varios pasos:** cada cubo tiene un estado `0..STEPS`; cada aterrizaje lo avanza un
  paso hasta `STEPS`. La ronda termina cuando los 28 están en `STEPS`.
- **Cubos reversibles** a partir de la ronda 3: aterrizar en un cubo ya completo lo baja un paso.
- Enemigos: bola roja (mata), Coily (mata), **gemelos** (inofensivos, retroceden un paso al cubo
  donde aterrizan, se cazan por contacto) y **bola verde** (power-up de congelación).
- **Racha:** multiplicador `×1..×5` por aterrizajes útiles consecutivos; se rompe al desperdiciar
  un salto y al perder una vida.
- Bonus por tiempo al terminar la ronda.
- Tres vidas, vida extra cada 10000 puntos (máximo 5).
- Progresión por rondas con una tabla de configuración (pasos, reversible, enemigos activos).
- Nueva ficha `qbert` en `lib/games.ts` (categoría `ARCADE`, `color: "yellow"`), clase
  `cover-qbert` en `app/globals.css`, línea en `GAME_ENGINES`, y migración
  `insert into public.games (id, title) values ('qbert', 'QBERT')`.

**Fuera de alcance:**

- Sonido.
- Controles táctiles más allá de la cruceta del mando virtual común.
- Skins (`clasico`/`neon`/`retro`): las aplica después `skin-designer`.
- Otros mapas, Ugg, Wrongway, un segundo jugador.
- Guardar el multiplicador o las rondas jugadas en la base de datos: solo la puntuación final va a `scores`.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla nueva, ni columna, ni tipo de plataforma.** El leaderboard se enciende
con una fila en `games`; `scores` y `game_stats` no se tocan. Esta spec y la 01 usan el **mismo
`game-id`**: solo una de las dos se promueve fuera de `specs/game-jam/`, nunca las dos a la vez.

Tipos locales del motor, sin exportar:

```ts
type Dir = "ul" | "ur" | "dl" | "dr";
type Pos = { r: number; c: number }; // fila 0..6, columna 0..r; fuera = vacío/disco
type Hopper = {
  from: Pos; to: Pos; t: number; // 0..1; 1 = posado
  falling: boolean; fallVy: number; x: number; y: number;
};
type Enemy =
  | { kind: "red" | "green" | "twin"; h: Hopper; hopAccum: number }
  | { kind: "egg"; h: Hopper; hopAccum: number; hatching: number }
  | { kind: "coily"; h: Hopper; hopAccum: number };
type RoundCfg = { steps: 2 | 3; reversible: boolean; twins: boolean; greens: boolean };
type Disc = { pos: Pos; taken: boolean };
```

Estado en la clausura de `createQbertGame`:

- `cubes: number[]` — 28 entradas (`índice = r*(r+1)/2 + c`), cada una `0..cfg.steps`.
- `player: Hopper`, `buffered: Dir | null`, `enemies: Enemy[]`, `discs: Disc[]`, `ride`.
- `score`, `lives`, `level`, `nextExtraLife`, `streak` (aterrizajes útiles seguidos), `mult`
  (derivado de `streak`).
- `freezeLeft` (ms de congelación restante), `roundMs` (ms jugados en la ronda).
- Spawns: `redAccum`, `twinAccum`, `greenAccum`, `coilyAccum` (ms).
- `deathAccum`, `clearAccum`.
- `state: "ready" | "playing" | "dying" | "roundclear" | "gameover"`.
- Bucle: `rafId`, `lastTime`, `destroyed`.

**Geometría isométrica**, mundo 800×600 (igual que 01): centro de la cara superior de `(r, c)`:

```
x(r,c) = ORIGIN_X + (2*c - r) * DX      y(r,c) = ORIGIN_Y + r * DY
```

**Configuración por ronda** (`cfg(level)`):

| Ronda | `steps` | `reversible` | `twins` | `greens` |
| --- | --- | --- | --- | --- |
| 1 | 2 | no | no | sí |
| 2 | 2 | no | sí | sí |
| 3–4 | 2 | sí | sí | sí |
| 5+ | 3 | sí | sí | sí |

---

## Plan de implementación

### 1. Constantes y geometría

`lib/games/qbert/engine.ts`, primera parte. Constantes de diseño:

```
W 800 · H 600 · ROWS 7 · CUBES 28
ORIGIN_X 400 · ORIGIN_Y 120 · DX 40 · DY 60
TOP_HALF_W 40 · TOP_HALF_H 20 · SIDE_H 40
DISC_L (3, -1) · DISC_R (3, 4)                       (x 200 / 600, y 300)
HOP_MS 180 · HOP_ARC 22 px · FALL_GRAVITY 1800 px/s² · FALL_END_Y 660
RIDE_MS 900 · RIDE_ARC 80 px · HIT_RADIUS 24 px
DEATH_MS 900 · CLEAR_MS 1500 · DT_MAX 50 ms
START_LIVES 3 · MAX_LIVES 5 · EXTRA_LIFE_EVERY 10000

POINTS_ADVANCE 25 (× mult) · POINTS_COILY_FALL 500 · POINTS_TWIN 300 · POINTS_GREEN 100
POINTS_DISC_LEFT 50 · POINTS_ROUND 1000 + 250 * (level - 1)
TIME_BONUS_MAX 2000 · TIME_BONUS_DECAY 20 por segundo jugado  → bonus = max(0, 2000 - 20 * floor(roundMs / 1000))
STREAK_PER_MULT 4 · MULT_MAX 5                        → mult = min(5, 1 + floor(streak / 4))

RED_SPAWN_FIRST 3000 ms · RED_SPAWN(level) = max(1800, 3800 - 250 * (level - 1)) ms · MAX_RED 2 · RED_PERIOD 600 ms
EGG_SPAWN_FIRST 5000 ms · COILY_RESPAWN 6000 ms · EGG_PERIOD 500 ms · HATCH_MS 400
COILY_PERIOD(level) = max(280, 500 - 35 * (level - 1)) ms
TWIN_SPAWN_FIRST 4000 ms · TWIN_SPAWN 7000 ms · MAX_TWIN 1 · TWIN_PERIOD 700 ms
GREEN_SPAWN_FIRST 9000 ms · GREEN_SPAWN 14000 ms · MAX_GREEN 1 · GREEN_PERIOD 600 ms
FREEZE_MS 3000
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Funciones puras: `px(r,c)`, `py(r,c)`, `cubeIndex(r,c)`, `onPyramid(r,c)`, `step(pos, dir)`
(`ul = (r-1,c-1)`, `ur = (r-1,c)`, `dl = (r+1,c)`, `dr = (r+1,c+1)`), `cfg(level)`, `multOf(streak)`.

Comprobación: `npm run build` limpio.

### 2. Estado inicial y rondas

`initGame()` pone `score = 0`, `lives = 3`, `level = 1`, `nextExtraLife = EXTRA_LIFE_EVERY`,
`streak = 0` y llama a `initRound()`. `initRound()` pone los 28 cubos a `0`, vacía `enemies`,
crea los dos discos, jugador en `(0,0)`, `freezeLeft = 0`, `roundMs = 0`, los acumuladores de spawn
en `0` y `state = "ready"`. Los acumuladores solo corren en `playing` y fuera de congelación. El
primer salto válido pasa a `playing`. La cima no empieza avanzada: se avanza al aterrizar en ella.

Comprobación: `npm run build` limpio.

### 3. Jugador, salto y cubos

Salto, búfer y caída: **idénticos a la variante 01** — un salto en búfer, `HOP_MS`, arco
parabólico, caída con `FALL_GRAVITY` al saltar fuera sin disco, ignorar `e.repeat`.

Regla de aterrizaje en un cubo `i` (en `playing`, tanto tras un salto como al acabar el viaje del
disco):

1. Si `cubes[i] < steps` → `cubes[i]++`, `streak++`, `mult = multOf(streak)`,
   `score += POINTS_ADVANCE * mult`. **Aterrizaje útil.**
2. Si `cubes[i] === steps` y `reversible` → `cubes[i]--` (vuelve a `steps - 1`) y `streak = 0`.
   Aterrizaje de **desperdicio** que además deshace trabajo.
3. Si `cubes[i] === steps` y no `reversible` → no cambia nada y `streak = 0`. Desperdicio inocuo.
4. Si tras (1) los 28 cubos valen `steps` → `roundClear()` **antes** de evaluar colisiones.

Comprobación: en la ronda 3, pisar un cubo terminado lo baja un paso y reinicia la racha.

### 4. Discos voladores

Dos discos de un solo uso; viaje de `RIDE_MS` a la cima con arco `RIDE_ARC` y jugador intocable.
Al terminar el viaje el jugador queda en `(0,0)` y se aplica la regla de aterrizaje del paso 3
(en rondas reversibles, llegar a una cima completa **la revierte**: es una decisión consciente, ver
Decisiones). Tomar un disco **no** rompe la racha.

**Coily y los discos:** durante el viaje el objetivo de Coily es la celda del disco usado; si salta
a ella (estaba adyacente) cae: `+POINTS_COILY_FALL`, desaparece y arranca `COILY_RESPAWN`. Los discos
sin usar al cerrar la ronda dan `+POINTS_DISC_LEFT` cada uno.

Comprobación: el viaje no rompe la racha; el disco no reaparece en la ronda.

### 5. Enemigos

Comunes: saltan por celdas lógicas con `HOP_MS` y arco, solo viven sobre la pirámide, no
interactúan entre sí ni cambian cubos (salvo el gemelo, abajo). Todos los temporizadores de
spawn y de salto se detienen mientras `freezeLeft > 0`.

- **Bola roja:** como en la variante 01 (`dl`/`dr` 50/50 cada `RED_PERIOD`, sale por la fila 6, mata al contacto). No cuenta como obstáculo para la racha.
- **Huevo → Coily:** como en 01 (aparece a los `EGG_SPAWN_FIRST` ms, baja al azar cada `EGG_PERIOD`, eclosiona en la fila 6 tras `HATCH_MS`, persigue minimizando distancia en píxeles con desempate `dl, dr, ul, ur` cada `COILY_PERIOD(level)`). Mata al contacto; el huevo no.
- **Gemelo** (solo si `cfg.twins`): aparece en `(0,0)` a los `TWIN_SPAWN_FIRST` ms y luego cada
  `TWIN_SPAWN` ms (máx. `MAX_TWIN`). Baja `dl`/`dr` al azar cada `TWIN_PERIOD`. **Cada vez que
  aterriza** en un cubo con `cubes[i] > 0`, hace `cubes[i]--` (el cubo parpadea en blanco 200 ms).
  Es **inofensivo**: el contacto con el jugador (distancia `< HIT_RADIUS`) lo elimina y suma
  `+POINTS_TWIN` sin romper la racha. Sale por la fila 6 sin efecto. Un gemelo no puede revertir el
  cubo si dejaría la ronda ya cerrada: el cierre solo se evalúa en aterrizajes del jugador.
- **Bola verde** (solo si `cfg.greens`): aparece en `(0,0)` a los `GREEN_SPAWN_FIRST` ms y luego
  cada `GREEN_SPAWN` ms (máx. `MAX_GREEN`). Baja `dl`/`dr` al azar cada `GREEN_PERIOD`. Al contacto
  con el jugador: `freezeLeft = FREEZE_MS`, `+POINTS_GREEN`, la bola desaparece. **No mata.**
  Durante la congelación, los enemigos terminan el salto en curso y quedan inmóviles (dibujados
  con tinte cian), los spawns se detienen y `roundMs` sí sigue contando.

Comprobación: un gemelo cazado suma 300; su rastro baja el paso del cubo; la bola verde detiene a todos durante ~3 s.

### 6. Colisiones, vidas y fin de ronda

- Cada frame en `playing` (jugador no cayendo ni en viaje): contacto con `red` o `coily` →
  `loseLife()`. Contacto con `twin` o `green` → su efecto y se retiran. `egg` se ignora.
  Si el jugador y un enemigo mortal coinciden **a la vez** que un power-up, gana la muerte.
- `loseLife()`: `lives--`, `streak = 0`, `freezeLeft = 0`, `state = "dying"`, `deathAccum = DEATH_MS`.
  Al terminar: con `lives === 0` → `gameOver()`; si no, `enemies = []`, jugador a `(0,0)`, spawns a
  su valor inicial, `state = "ready"`. **Los cubos conservan su estado.**
- `roundClear()`: `state = "roundclear"`, `clearAccum = CLEAR_MS`, suma `POINTS_ROUND`,
  `50` por disco sin usar y el bonus por tiempo, vacía `enemies`, parpadeo de cubos. Al terminar:
  `level++`, `emit()`, `initRound()` con la `cfg` nueva. La racha **se conserva** entre rondas.
- Vida extra: `while (score >= nextExtraLife)`; si `lives < MAX_LIVES`, `lives++`;
  `nextExtraLife += EXTRA_LIFE_EVERY`.
- `gameOver()`: `stopLoop()` y `onGameOver(score)` una sola vez; `resume()` no-op después.

Comprobación: con `streak` ≥ 4 el multiplicador sube a ×2; perder una vida lo baja a ×1.

### 7. Bucle, entrada y dibujo

- `emit()` con `lastScore` / `lastLives` / `lastLevel`: solo emite al cambiar el valor.
- `dt` capado a `DT_MAX`; `lastTime = null` al reanudar.
- Mismo mapa de teclas que 01: `ArrowUp`/`KeyW` = `ur`, `ArrowLeft`/`KeyA` = `ul`,
  `ArrowRight`/`KeyD` = `dr`, `ArrowDown`/`KeyS` = `dl`; `preventDefault()` solo para esas; `e.repeat`
  ignorado; listeners `keydown`/`blur` en el canvas, nunca en `window`; `P`/`Escape` no llegan.
- `draw()`: fondo negro; cubos de atrás hacia delante con 3 caras. Color de la cara superior por
  paso (`steps = 2`: `#1d3a8a` → `#ffd400` → `#ff2bd6`; con `steps = 3` se intercala `#27d3ff`
  entre el amarillo y el magenta; el estado final siempre es magenta). Un cubo revertido o
  rebajado por un gemelo parpadea en blanco 200 ms. Discos como elipses cian; jugador naranja
  como en 01; bola roja `#ff3030`; bola verde `#2bff6b` (radio 11); gemelo = círculo verde oscuro
  `#12a84a` con dos ojos (radio 12); huevo y Coily violetas como en 01; enemigos congelados con
  tinte cian.
- **Indicador de racha dentro del canvas:** una barra pequeña arriba a la izquierda
  `RACHA ×N` con relleno proporcional a `streak % 4` (como el HUD no tiene hueco para el
  multiplicador, es estado propio del juego y no una puntuación duplicada). Sin puntos, vidas ni
  nivel en el canvas. Rótulos `PULSA UNA FLECHA` en `ready` y `RONDA COMPLETA` en `roundclear`.
- Ningún objeto/array/closure dentro de `draw()` (SPEC 13).
- `restart()`: detiene el bucle, vacía `buffered`, `initGame()`, `emit()`, arranca. `destroy()`
  cancela el frame, quita listeners y es idempotente. `initGame(); draw();` antes de devolver.

Comprobación: `npm run build` limpio; se ven los cubos en tres colores en la ronda 5.

### 8. Registro, catálogo y portada

`lib/games/registry.ts`:

```ts
qbert: {
  create: createQbertGame,
  width: 800,
  height: 600,
  controls: "flechas o WASD para saltar en diagonal; caza a los gemelos verdes y esquiva a Coily",
  touch: {},
},
```

`lib/games.ts`: ficha `{ id: "qbert", title: "QBERT", cat: "ARCADE", cover: "cover-qbert", color: "yellow", best: 0, plays: "0" }` con `short`/`long` en el tono del resto. `app/globals.css`: `.cover-qbert` con
rombos apilados en tres colores (la portada sugiere los pasos de color).

Comprobación: `/jugar/qbert` pinta el canvas real; la ficha aparece en `/biblioteca`.

### 9. Leaderboard

`supabase/migrations/<timestamp>_juego_qbert.sql`, con timestamp posterior a `20260927130000`:

```sql
insert into public.games (id, title) values ('qbert', 'QBERT');
```

Se aplica con `apply_migration` y se comprueba con `execute_sql`. Los tipos no se regeneran. La
puntuación llega a `scores` por la Server Action `guardarScore` existente.

Comprobación: `select * from public.games` incluye `qbert`.

### 10. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y recorrido manual de
los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/qbert` muestra un canvas de 800×600 con la pirámide, el jugador en la cima, dos discos y la barra `RACHA ×1`, no la `.game-arena`.
- [ ] La partida no avanza hasta pulsar una flecha o WASD, y las teclas saltan en las diagonales de la variante 01 (`↑` arriba-derecha, `←` arriba-izquierda, `→` abajo-derecha, `↓` abajo-izquierda).
- [ ] En la ronda 1 un cubo necesita **dos** aterrizajes: azul → amarillo → magenta, sumando 25 en cada uno (×1 al inicio).
- [ ] Aterrizar en un cubo magenta en la ronda 1 o 2 no cambia nada, suma 0 y reinicia la racha a ×1.
- [ ] Cuatro aterrizajes útiles seguidos suben el multiplicador a ×2 (el siguiente avance suma 50); a los 16 llega a ×5 y no sube más.
- [ ] Perder una vida o saltar a un cubo ya completo baja el multiplicador a ×1.
- [ ] En la ronda 3, aterrizar en un cubo magenta lo baja a amarillo y reinicia la racha.
- [ ] En la ronda 5 aparece el tercer color (cian) en la secuencia de pasos y la ronda exige tres aterrizajes por cubo.
- [ ] La ronda 1 no genera gemelos; desde la ronda 2 aparece uno verde oscuro a los ~4 s que baja por la pirámide y, al aterrizar en un cubo con progreso, lo baja un paso con un parpadeo blanco.
- [ ] Tocar un gemelo lo elimina, suma 300 y no mata ni reinicia la racha.
- [ ] Una bola verde aparece a los ~9 s; tocarla suma 100 y congela a todos los enemigos y spawns ~3 s, con tinte cian; pasado el tiempo se reanudan.
- [ ] Una bola roja o Coily matan al contacto; un huevo, un gemelo y una bola verde no.
- [ ] Usar un disco con Coily adyacente lo hace caer: +500, reaparece como huevo ~6 s después; tomar el disco no rompe la racha.
- [ ] En una ronda reversible, tomar el disco con la cima ya completa la baja un paso (comportamiento documentado).
- [ ] Pintar los 28 cubos al estado final muestra `RONDA COMPLETA`, suma `1000 + 250 × (nivel − 1)` más 50 por disco sin usar más el bonus por tiempo, y el HUD pasa al siguiente nivel; la racha se conserva.
- [ ] El bonus por tiempo es 2000 al instante y 0 a partir de los 100 s de ronda; una ronda de 30 s paga 1400.
- [ ] Al llegar a 10000 puntos el HUD sube una vida (hasta 5).
- [ ] Morir conserva los pasos de los cubos y reinicia al jugador en la cima con racha ×1.
- [ ] Con 0 vidas se abre el modal `FIN DEL JUEGO` con la puntuación real; el canvas no dibuja puntos, nivel ni vidas ni overlay de game over.
- [ ] El botón `PAUSA` congela el juego (incluida la congelación de la bola verde y los saltos a medias) y `REANUDAR` continúa sin saltos; `P` y `Escape` hacen lo mismo.
- [ ] Con el canvas enfocado, las flechas no hacen scroll de la página; escribir `W`, `A`, `S`, `D` en el campo de iniciales no mueve ni reinicia el juego.
- [ ] `JUGAR DE NUEVO` reinicia a nivel 1, 0 puntos, 3 vidas, racha ×1 y cubos a cero sin recargar.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'qbert'`; pulsarlo dos veces seguidas no inserta dos filas.
- [ ] Esa puntuación aparece en `/salon?juego=qbert` y en `/juegos/qbert`; con `scores` vacía, el estado vacío.
- [ ] Navegar de `/jugar/qbert` a `/biblioteca` y volver no duplica el bucle; dejar la pestaña en segundo plano no produce saltos de tiempo.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid`, `/jugar/snake` y `/jugar/frogger` se juegan igual que antes; los juegos sin motor, también.
- [ ] `select * from public.games` incluye `qbert` además de los previos.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/qbert`; `?fps=1` no muestra frames > 50 ms sostenidos.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** mismo `game-id` y misma ficha que la variante 01. Son alternativas de diseño, no dos juegos del catálogo.
- **Sí:** reutilizar geometría, salto, discos y Coily de la variante 01. Cambiar el tablero a la vez que las reglas haría imposible juzgar la propuesta.
- **Sí:** cubos de varios pasos con escalada por ronda (2 pasos → 2 reversibles → 3 reversibles). Cada salto exige decisión de ruta, no solo supervivencia.
- **Sí:** reversión solo desde la ronda 3. La ronda 1–2 sirven de aprendizaje antes de castigar el aterrizaje inútil.
- **Sí:** el viaje en disco puede revertir la cima en rondas reversibles. Hace que el disco sea una decisión (salvarse del enemigo vs. costar un paso) en vez de un botón gratis.
- **Sí:** gemelos inofensivos y cazables. Convierten a un enemigo en un objetivo que da puntos y obliga a desviarse de la ruta óptima.
- **No:** gemelos letales. Mezclar tres enemigos mortales con cubos de varios pasos saturaría la pantalla.
- **Sí:** la bola verde congela, no mata ni da vidas: es la herramienta táctica del jugador, no un premio.
- **Sí:** racha que se conserva entre rondas pero se rompe al desperdiciar un salto o morir. Premia la fluidez, el sentido de «estar en racha».
- **Sí:** dibujar el multiplicador en el canvas como barra. El HUD no tiene hueco para él y es estado propio del juego.
- **No:** guardar racha máxima ni tiempo en `scores`. El esquema solo guarda puntuación y no se toca.
- **Sí:** bonus por tiempo lineal con tope en 100 s. Compensa jugar rápido sin hacer imposible el bonus a quien juega con calma.
- **Sí:** los cubos conservan estado al morir, como en 01.
- **No:** sonido ni sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Más reglas que en 01: el jugador no entiende por qué baja el multiplicador. | La barra `RACHA ×N` se reinicia visiblemente con un destello, y los rótulos/tutorial de `ready` explican la regla en 1 línea. |
| Cubos reversibles + discos que revierten la cima frustran al jugador. | Se documenta en Decisiones y se verifica en el recorrido manual; es una regla explícita, no un bug. |
| Gemelos y bola verde saturan la pirámide con 5+ sprites a la vez. | Máximos `MAX_RED 2`, `MAX_TWIN 1`, `MAX_GREEN 1`, `MAX_COILY 1`; un máximo de 5 enemigos simultáneos. |
| Congelación mal acotada deja al jugador a salvo por tiempo indefinido. | `FREEZE_MS 3000` fijo, sin acumulación (tocar otra bola verde reinicia, no suma), y una sola bola verde viva. |
| La racha se conserva entre rondas y produce puntuaciones desproporcionadas. | `MULT_MAX 5` y rondas de ~3500+ puntos; la cota de `scores` (`0..1.000.000`) queda a muchas rondas de distancia, y la acción rechazaría el exceso con mensaje legible. |
| Un gemelo reverte el último cubo y el jugador cree que cerró la ronda. | El cierre solo se evalúa en aterrizajes del jugador y se recalcula con el estado actual de los 28 cubos. |
| Pestaña en segundo plano: los spawns y la congelación disparan en ráfaga. | `dt` capado a 50 ms; `lastTime = null` al reanudar; la congelación se descuenta con el `dt` capado. |
| `e.repeat` o doble pulsación llena el búfer y salta fuera sin querer. | `e.repeat` ignorado, búfer de una sola posición. |
| WASD llega al motor mientras se escriben iniciales. | Bucle parado con el modal abierto y listeners en el canvas, no en `window`. |
| `draw()` asigna objetos por frame y rompe SPEC 13. | Constantes de color de módulo; cero literales de objeto/array dentro de `draw()`. |

---

## Lo que **no** entra en esta spec

- Sonido.
- Skins `clasico` / `neon` / `retro` (los aplica `skin-designer`).
- Soporte táctil más allá de la cruceta común (`mobile-porter`).
- Otros mapas, Ugg, Wrongway, o modo de dos jugadores.
- Guardar racha máxima, tiempo de ronda o ronda alcanzada en base de datos.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
