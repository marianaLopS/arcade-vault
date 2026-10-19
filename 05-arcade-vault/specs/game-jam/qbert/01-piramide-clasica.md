# SPEC — QBERT: pirámide clásica

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-12
> **Objetivo:** Diseñar un port fiel al Q*bert de 1982 — saltar en diagonal por una pirámide isométrica de 28 cubos hasta pintarlos todos, esquivando a Coily y a las bolas rojas, y escapando con los discos voladores — como ficha nueva `qbert` en categoría ARCADE, con motor real y leaderboard en Supabase desde el primer día.

---

## Por qué existe esta spec

Ningún juego del catálogo se mueve **por saltos discretos sobre una geometría isométrica**. Asteroids
y Arkanoid son física continua, Tetris y Snake son grillas ortogonales, Frogger salta pero en
cuadrícula plana vista desde arriba. Q*bert aporta tres cosas que no existen hoy en Arcade Vault:
una vista isométrica (el catálogo es todo cenital o lateral plano), un movimiento en el que el
jugador _decide_ cada salto y no puede frenar en el aire, y un «arma» que es el propio terreno: el
disco volador que hace caer al perseguidor. Es el candidato `qbert` de la lista de sugerencias de
`game-suggestions-todo.md`.

Como con Snake (SPEC 10) y con los demás game-jam, **no hay código de referencia**: no existe
ninguna carpeta `References/.../qbert` en el repositorio. Las constantes de este documento son el
diseño en sí, no el ajuste de un port; cambiarlas durante la implementación es rediseñar, no
implementar. El motor dibuja todo con primitivas de canvas — rombos y paralelogramos para los
cubos, círculos y arcos para los personajes — sin spritesheet externo.

Esta variante es la lectura **mínima y fiel** del arcade: cada cubo se pinta con un solo salto,
un solo perseguidor (Coily), un solo tipo de bola (roja, mortal) y los discos de escape. La segunda
variante (`02-cubos-inestables.md`) conserva la misma pirámide y el mismo salto pero cambia las
reglas de los cubos (varios pasos de color, cubos que se revierten), añade enemigos que deshacen
el trabajo y un power-up, y recompensa las rachas. Las dos comparten el mismo mundo lógico, la
misma geometría y los mismos controles; difieren en reglas, enemigos y puntuación.

---

## Alcance

**Dentro:**

- `lib/games/qbert/engine.ts`: motor nuevo, todo el estado en la clausura de `createQbertGame`,
  sin assets externos.
- Mundo lógico de **800×600**, pirámide isométrica de 7 filas (28 cubos) centrada en `x = 400`.
- Jugador con salto diagonal discreto en 4 direcciones, con un salto en búfer.
- Cada cubo cambia a su color objetivo con **un** aterrizaje; la ronda termina cuando los 28 están
  pintados.
- Dos discos voladores (uno a cada lado de la pirámide) que llevan al jugador a la cima y hacen
  caer a Coily si lo seguía.
- Enemigos: **bolas rojas** (rebotan hacia abajo al azar, matan al contacto) y **Coily** (huevo que
  baja al azar, eclosiona en la fila inferior y persigue al jugador).
- Caída al vacío (saltar fuera de la pirámide sin disco) cuesta una vida; contacto con enemigo
  también.
- Tres vidas, vida extra cada 8000 puntos (máximo 5).
- Progresión por rondas: cada ronda acelera a Coily y a las bolas.
- Nueva ficha `qbert` en `lib/games.ts` (categoría `ARCADE`, `color: "yellow"`) y clase de portada
  `cover-qbert` en `app/globals.css`.
- Una línea `qbert` en `GAME_ENGINES` (`lib/games/registry.ts`).
- Migración `insert into public.games (id, title) values ('qbert', 'QBERT')` y su aplicación.

**Fuera de alcance (para otras specs o para la variante `02-cubos-inestables.md`):**

- Cubos de varios pasos, cubos que se revierten, Slick/Sam (gemelos), bola verde, puntos por racha.
- Sonido.
- Controles táctiles propios más allá de la cruceta del mando virtual común.
- Skins (`clasico`/`neon`/`retro`): las aplica después `skin-designer`.
- Mapas con otra forma que la pirámide de 7 filas, Ugg y Wrongway.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla nueva, ni columna, ni tipo de plataforma.** `GameEngineEntry` ya existe
desde la SPEC 08, `scores` y `game_stats` sirven a este juego sin tocarlas, y el leaderboard se
enciende con una fila en `games`.

Tipos locales del motor, sin exportar:

```ts
type Dir = "ul" | "ur" | "dl" | "dr"; // arriba-izq, arriba-der, abajo-izq, abajo-der
type Pos = { r: number; c: number }; // fila 0..6, columna 0..r; fuera de rango = vacío/disco
type Hopper = {
  from: Pos; to: Pos; // celdas lógicas de origen y destino
  t: number; // 0..1 progreso del salto; 1 = posado
  falling: boolean; fallVy: number; y: number; x: number; // al saltar fuera de la pirámide
};
type Enemy =
  | { kind: "red"; h: Hopper; hopAccum: number }
  | { kind: "egg"; h: Hopper; hopAccum: number }
  | { kind: "coily"; h: Hopper; hopAccum: number; hatching: number };
type Disc = { pos: Pos; taken: boolean }; // celda lógica fuera de la pirámide
```

Estado en la clausura de `createQbertGame`:

- `cubes: boolean[]` — 28 entradas (`índice = r*(r+1)/2 + c`); `true` = pintado.
- `player: Hopper`, `buffered: Dir | null` (un salto en búfer).
- `enemies: Enemy[]`, `discs: Disc[]` (siempre 2 al inicio de ronda), `ride: { t: number; from: {x,y} } | null`.
- `score`, `lives`, `level`, `nextExtraLife` (siguiente umbral de vida extra).
- `redSpawnAccum`, `coilySpawnAccum`, `deathAccum`, `clearAccum` (ms).
- `state: "ready" | "playing" | "dying" | "roundclear" | "gameover"`.
- Bucle: `rafId`, `lastTime`, `destroyed`. Entrada: ninguna estructura persistente (cada `keydown` se traduce a `Dir`).

**Geometría isométrica**, mundo 800×600, centro de la cara superior del cubo `(r, c)`:

```
x(r,c) = ORIGIN_X + (2*c - r) * DX      y(r,c) = ORIGIN_Y + r * DY
```

Hacia fuera de la pirámide se usa la misma fórmula con `c < 0` o `c > r`: así los discos tienen
posición en pantalla sin caso especial.

---

## Plan de implementación

### 1. Constantes y geometría

`lib/games/qbert/engine.ts`, primera parte. Constantes de diseño:

```
W 800 · H 600
ROWS 7 · CUBES 28
ORIGIN_X 400 · ORIGIN_Y 120 · DX 40 · DY 60
TOP_HALF_W 40 · TOP_HALF_H 20 · SIDE_H 40          (cubo: rombo 80×40 + caras laterales de 40 px)
DISC_L (3, -1)  →  x 200, y 300                     (se alcanza con "ul" desde (4, 0))
DISC_R (3, 4)   →  x 600, y 300                     (se alcanza con "ur" desde (4, 4))
HOP_MS 180 · HOP_ARC 22 px                          (arco parabólico: dy = -4*ARC*t*(1-t))
FALL_GRAVITY 1800 px/s² · FALL_END_Y 660            (la caída termina al pasar H + 60)
RIDE_MS 900 · RIDE_ARC 80 px                        (viaje del disco a la cima (0,0))
HIT_RADIUS 24 px                                    (distancia entre centros para contacto)
DEATH_MS 900 · CLEAR_MS 1500
START_LIVES 3 · MAX_LIVES 5 · EXTRA_LIFE_EVERY 8000
POINTS_CUBE 25 · POINTS_COILY_FALL 500 · POINTS_DISC_LEFT 50
POINTS_ROUND 1000 + 250 * (level - 1)
RED_SPAWN_FIRST 2500 ms · RED_SPAWN(level) = max(1500, 3500 - 250 * (level - 1)) ms · MAX_RED 2
RED_PERIOD 600 ms  (tiempo entre inicios de salto de la bola roja)
EGG_SPAWN_FIRST 4000 ms · COILY_RESPAWN 6000 ms tras morir/caer · MAX_COILY 1
EGG_PERIOD 500 ms · HATCH_MS 400
COILY_PERIOD(level) = max(260, 480 - 40 * (level - 1)) ms
DT_MAX 50 ms
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Funciones puras: `px(r,c)`, `py(r,c)`, `cubeIndex(r,c)`, `onPyramid(r,c)` (`0 ≤ r ≤ 6` y
`0 ≤ c ≤ r`), `step(pos, dir)` con `ul = (r-1, c-1)`, `ur = (r-1, c)`, `dl = (r+1, c)`,
`dr = (r+1, c+1)`.

Comprobación: `npm run build` limpio.

### 2. Estado inicial y rondas

`initGame()` pone `score = 0`, `lives = START_LIVES`, `level = 1`, `nextExtraLife = EXTRA_LIFE_EVERY`
y llama a `initRound()`. `initRound()` pone los 28 cubos a `false`, vacía `enemies`, crea los dos
discos, coloca al jugador en `(0, 0)` posado, vacía `buffered` y deja `state = "ready"`. Mientras
`ready`, ningún temporizador de enemigos corre; el primer salto válido pasa a `playing`.

La cima `(0,0)` **no** se pinta al empezar: el cubo de partida se pinta al aterrizar en él por
primera vez, como cualquier otro. (Evita ronda regalada de 1 cubo.)

Comprobación: `npm run build` limpio.

### 3. Jugador: salto, búfer y caída

- Entrada válida solo en `ready`/`playing`. Una pulsación calcula `Dir`; si el jugador está posado
  (`t === 1`) y no cayendo, inicia salto; si está en el aire, guarda `buffered` (se sobrescribe, un
  único búfer). Al posarse, si hay `buffered`, salta de inmediato en esa dirección.
- Salto: `t` avanza `dt / HOP_MS`; posición = `lerp(from, to, t)` en píxeles + arco vertical.
- Aterrizaje en cubo de la pirámide: si `cubes[i] === false` → `true`, `+POINTS_CUBE`. Si ya
  estaba pintado, no pasa nada (sin penalización). Si con ese aterrizaje los 28 están pintados →
  `roundClear()` **antes** de evaluar colisiones.
- Aterrizaje fuera de la pirámide:
  - Si la celda es la de un disco no tomado → `startRide(disc)` (paso 4).
  - Si no → `falling = true` con `fallVy = 0`; el jugador cae con `FALL_GRAVITY` hasta `FALL_END_Y` y
    entonces `loseLife()`.
- Mientras `falling`, `ride` o `dying`, el búfer se ignora y se vacía.

Comprobación: saltar al borde sin disco cae y quita una vida; dos pulsaciones seguidas encadenan dos saltos sin pausa.

### 4. Discos voladores

- Un disco es una elipse girando en `(x(3,-1), y(3,-1))` / `(x(3,4), y(3,4))`. Solo sirve **una vez**:
  `taken = true` al usarse y desaparece.
- `startRide(disc)`: `state` sigue `playing`, `ride = { t: 0, from: posición del disco }`. Durante
  `RIDE_MS` el jugador viaja con arco `RIDE_ARC` desde el disco hasta `(x(0,0), y(0,0))`; **no es
  alcanzable** por enemigos (se omite su colisión). Al terminar el jugador queda posado en `(0,0)`
  y, si ese cubo no estaba pintado, se pinta (+25).
- **Coily y los discos:** cuando Coily (ya serpiente) elige salto, su objetivo es la celda lógica
  del jugador; durante el viaje el objetivo es la **celda del disco usado**. Si el mejor salto de
  Coily lleva a esa celda (está adyacente a ella), salta al vacío y cae: `+POINTS_COILY_FALL`,
  Coily se elimina y arranca `COILY_RESPAWN`. Si no está adyacente, sigue acercándose normalmente.
- Los discos no usados al terminar la ronda dan `+POINTS_DISC_LEFT` cada uno.

Comprobación: usar un disco con Coily pegado a la salida lo hace caer y suma 500; el disco no reaparece en la ronda.

### 5. Enemigos

**Reglas comunes:** los enemigos saltan por celdas lógicas con el mismo `HOP_MS` y arco que el
jugador; solo viven sobre la pirámide.

- **Bola roja** (`red`): aparece en `(0,0)` cada `RED_SPAWN(level)` (máximo `MAX_RED` vivas; el
  primer spawn tras `RED_SPAWN_FIRST`). Cada `RED_PERIOD` ms inicia un salto `dl` o `dr` al azar
  50/50. Al saltar fuera de la pirámide por la fila 6 desaparece sin puntos. Mata al contacto.
- **Huevo** (`egg`) → **Coily** (`coily`): el huevo aparece en `(0,0)` a los `EGG_SPAWN_FIRST` ms
  de la primera pulsación y después `COILY_RESPAWN` ms tras desaparecer el anterior (solo uno a la
  vez). Baja `dl`/`dr` al azar cada `EGG_PERIOD` ms. Al posarse en la fila 6, `hatching = HATCH_MS`
  (inmóvil, dibujado como huevo agrietado) y luego se convierte en `coily`. Un huevo **no** mata;
  Coily sí.
- **Coily** persigue: cada `COILY_PERIOD(level)` ms evalúa los 4 `Dir` cuyo destino esté en la
  pirámide (o sea la celda del disco usado, ver paso 4) y elige el que minimiza la distancia en
  píxeles entre `(x,y)` del destino y `(x,y)` del jugador; los empates se rompen en el orden
  `dl, dr, ul, ur`.
- Las bolas rojas no interactúan entre sí ni con Coily.

Comprobación: tras unos 4 s aparece el huevo; tras bajar y eclosionar, Coily sigue al jugador; las bolas rojas nunca suben.

### 6. Colisiones, vidas y fin de ronda

- Cada frame, con `state === "playing"` y el jugador no cayendo ni en `ride`: para cada enemigo que
  mate (`red`, `coily`), si la distancia entre su posición en píxeles y la del jugador es
  `< HIT_RADIUS` → `loseLife()`. Los huevos se ignoran.
- `loseLife()`: `lives--`, `emit()`, `state = "dying"`, `deathAccum = DEATH_MS`. Durante `dying` el
  jugador queda donde murió (o cayendo) y los enemigos se congelan. Al terminar: si `lives === 0` →
  `gameOver()`; si no, `enemies = []`, jugador a `(0,0)`, timers de spawn a su valor inicial y
  `state = "ready"` (los cubos ya pintados **se conservan**).
- `roundClear()`: `state = "roundclear"`, `clearAccum = CLEAR_MS`, `+POINTS_ROUND`, `+50` por disco
  sin usar, `enemies = []`. Durante `CLEAR_MS` los cubos parpadean entre el color objetivo y blanco.
  Al terminar: `level++`, `emit()`, `initRound()`.
- Vida extra: cuando `score >= nextExtraLife` y `lives < MAX_LIVES`, `lives++` y
  `nextExtraLife += EXTRA_LIFE_EVERY`. Si `lives === MAX_LIVES` el umbral se desplaza igualmente.
- `gameOver()`: `stopLoop()` y `onGameOver(score)` una sola vez; `resume()` es no-op después.

Comprobación: perder todas las vidas abre el modal con la puntuación; morir no despinta cubos.

### 7. Bucle, entrada y dibujo

- `emit()` con `lastScore` / `lastLives` / `lastLevel`: solo emite cuando el valor cambia.
- `dt` capado a `DT_MAX`; `lastTime = null` al reanudar.
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`, `KeyD`.
  `preventDefault()` solo para esas. Mapa (joystick girado 45°, como el arcade):
  `ArrowUp`/`KeyW` = `ur`, `ArrowLeft`/`KeyA` = `ul`, `ArrowRight`/`KeyD` = `dr`, `ArrowDown`/`KeyS` = `dl`.
  Se ignora `e.repeat` para que mantener pulsada una tecla no encadene saltos.
- Listeners `keydown` / `blur` sobre el canvas, nunca sobre `window`. `P` y `Escape` no llegan al
  motor. `blur` vacía el búfer.
- `draw()`: fondo negro; los cubos de atrás hacia delante (filas ascendentes) con cara superior
  (color según pintado: azul apagado `#1d3a8a` → magenta `#ff2bd6`), cara izquierda al 70 % y
  derecha al 50 % de luminosidad; discos como elipses cian girando; sombra elíptica bajo cada
  personaje; jugador = círculo naranja `#ff9a1f` de radio 14 con hocico rectangular y dos ojos
  blancos; bola roja = círculo `#ff3030` de radio 11; huevo = círculo violeta de radio 11; Coily =
  tres círculos violetas apilados (cabeza de radio 13) con ojos; todos con el arco del salto
  aplicado a la `y`. Sin puntuación, vidas ni nivel dentro del canvas. Rótulo `PULSA UNA FLECHA`
  mientras `ready` y `RONDA COMPLETA` en `roundclear` (son estado propio del juego, como en Snake).
- Ningún `new`/array/closure dentro de `draw()` (SPEC 13): colores como constantes de módulo,
  cálculo de las 4 caras con variables locales numéricas.
- `restart()`: detiene el bucle, vacía `buffered`, `initGame()`, `emit()`, arranca.
- `destroy()` cancela el frame, quita los listeners y es idempotente.
- `initGame(); draw();` antes de devolver.

Comprobación: `npm run build` limpio; se ve la pirámide con el jugador en la cima.

### 8. Registro, catálogo y portada

`lib/games/registry.ts`:

```ts
qbert: {
  create: createQbertGame,
  width: 800,
  height: 600,
  controls: "flechas o WASD para saltar en diagonal por la pirámide (arriba y derecha, abajo y izquierda…)",
  touch: {},
},
```

`lib/games.ts`: nueva ficha `{ id: "qbert", title: "QBERT", cat: "ARCADE", cover: "cover-qbert", color: "yellow", best: 0, plays: "0" }` con `short` y `long` en el tono de las demás (p. ej. «Salta, pinta y no te dejes atrapar.»). `app/globals.css`: `.cover-qbert` con un
apilado de rombos CSS (`clip-path` o gradientes cónicos) en los colores de la pirámide.

Comprobación: `/jugar/qbert` pinta el canvas real en vez de `.game-arena`; la ficha aparece en `/biblioteca`.

### 9. Leaderboard

`supabase/migrations/<timestamp>_juego_qbert.sql`, con timestamp posterior a `20260927130000`:

```sql
insert into public.games (id, title) values ('qbert', 'QBERT');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. Los tipos no se
regeneran: insertar una fila no cambia el esquema. La puntuación llega a `scores` por la Server
Action `guardarScore` existente (valida `0..1.000.000`; ver Riesgos).

Comprobación: `select * from public.games` incluye la fila `qbert`.

### 10. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido manual de
los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/qbert` muestra un canvas de 800×600 con la pirámide de 28 cubos, el jugador en la cima y dos discos laterales, no la `.game-arena`.
- [ ] La partida no avanza (ni aparecen enemigos) hasta pulsar una flecha o WASD.
- [ ] Cada tecla salta en la diagonal indicada: `↑` arriba-derecha, `←` arriba-izquierda, `→` abajo-derecha, `↓` abajo-izquierda.
- [ ] Aterrizar en un cubo azul lo pinta de magenta y suma 25; aterrizar en uno ya pintado no cambia nada.
- [ ] Pulsar una segunda dirección durante un salto la ejecuta al posarse, sin perder la pulsación; una tercera pulsación sobrescribe la segunda.
- [ ] Mantener pulsada una tecla no encadena saltos (solo uno por pulsación).
- [ ] Saltar fuera de la pirámide sin disco hace caer al jugador, quita una vida y, tras la animación, lo devuelve a la cima conservando los cubos pintados.
- [ ] Una bola roja aparece en la cima a los ~2,5 s del primer salto, baja saltando hasta salir por abajo y mata al contacto.
- [ ] Un huevo violeta aparece a los ~4 s, baja, se agrieta en la fila inferior y se convierte en Coily, que sigue al jugador; matar un huevo no existe (no mata al contacto).
- [ ] Saltar a un disco libre lleva al jugador a la cima en ~0,9 s sin que ningún enemigo pueda tocarlo; el disco desaparece.
- [ ] Si Coily estaba adyacente al disco usado, salta al vacío, suma 500 y reaparece como huevo ~6 s después.
- [ ] Pintar los 28 cubos muestra `RONDA COMPLETA`, suma `1000 + 250 × (nivel − 1)` más 50 por disco sin usar, y sube el HUD al nivel 02.
- [ ] En la ronda 2, Coily salta visiblemente más rápido y las bolas rojas aparecen con más frecuencia que en la ronda 1.
- [ ] Al llegar a 8000 puntos el HUD sube una vida (hasta 5 como máximo).
- [ ] El HUD muestra 3 vidas al inicio; con 0 vidas se abre el modal `FIN DEL JUEGO` con la puntuación real y el canvas no dibuja ningún overlay de game over.
- [ ] El canvas no dibuja puntos, nivel ni vidas.
- [ ] El botón `PAUSA` congela el juego (incluido un salto a medias) y `REANUDAR` lo reanuda sin saltos de tiempo; `P` y `Escape` hacen lo mismo.
- [ ] Con el canvas enfocado, las flechas no hacen scroll de la página.
- [ ] Escribir `W`, `A`, `S`, `D` en el campo de iniciales no mueve ni reinicia el juego.
- [ ] `JUGAR DE NUEVO` reinicia a nivel 1, 0 puntos, 3 vidas y 28 cubos sin pintar, sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'qbert'`; pulsarlo dos veces seguidas no inserta dos filas.
- [ ] Esa puntuación aparece en `/salon?juego=qbert` y en `/juegos/qbert`; con `scores` vacía, el estado vacío.
- [ ] Navegar de `/jugar/qbert` a `/biblioteca` y volver no duplica el bucle.
- [ ] Dejar la pestaña en segundo plano y volver no produce un salto de tiempo (como mucho 50 ms de `dt`).
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid`, `/jugar/snake` y `/jugar/frogger` se juegan igual que antes.
- [ ] `/jugar/gloton` y los otros juegos sin motor se comportan igual que antes.
- [ ] `select * from public.games` incluye `qbert` además de los juegos previos.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/qbert`.
- [ ] `?fps=1` en `/jugar/qbert` no muestra frames > 50 ms sostenidos.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** id `qbert`, título `QBERT`, categoría `ARCADE`. No hay categoría de plataformas; `ARCADE` es la que ya acoge a Snake y Frogger.
- **Sí:** mundo 800×600 con pirámide de 7 filas. Mismo marco 4/3 que Asteroids, Arkanoid y Snake, y la pirámide cabe con margen (cima en `y 100`, base en `y 540`).
- **Sí:** controles con las flechas _giradas_ 45° (arriba = arriba-derecha) como el joystick del arcade. **No:** teclas diagonales dedicadas (Q/E/Z/C), porque la cruceta táctil común solo manda las 4 flechas y así el juego es jugable en móvil sin tocar la plataforma.
- **Sí:** un único salto en búfer. Sin él, jugar a 180 ms por salto se siente torpe; con más de uno el jugador salta a ciegas.
- **No:** frenar o cancelar un salto en el aire. Es la esencia del juego: cada pulsación es un compromiso.
- **Sí:** un aterrizaje pinta el cubo; aterrizar de nuevo es inocuo. La penalización por repintar es de la variante 02.
- **Sí:** colisión por distancia en píxeles (`HIT_RADIUS 24`), no por celda lógica, para que dos saltadores que se cruzan en el aire sí choquen.
- **Sí:** el jugador es intocable durante el viaje del disco. Es la recompensa de tomar el disco y evita muertes arbitrarias al aterrizar en la cima.
- **Sí:** Coily persigue minimizando distancia en píxeles. Es determinista y legible: el jugador puede predecirlo y usar el disco con intención.
- **No:** inventar un segundo perseguidor ni gemelos en esta variante. Es lo que diferencia a la variante 02.
- **Sí:** los cubos pintados se conservan al morir. Morir en un juego de pintar con tres vidas no debe borrar la ronda.
- **No:** sonido ni sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Sin original, las constantes se ajustan «a ojo» durante la implementación. | El paso 1 las fija y las declara fuera de alcance. |
| El mapa de flechas a diagonales confunde al jugador nuevo. | El `aria-label` del canvas lo explica y el rótulo `PULSA UNA FLECHA` aparece al empezar; el mapa es el del arcade. |
| Coily se vuelve injusto a ritmos altos (`COILY_PERIOD` 260 ms apenas supera `HOP_MS` 180). | Mínimo acotado por `max(260, …)`; el jugador salta cada 180 ms, así que siempre es posible superar a Coily con un disco. |
| Colisión por píxeles dispara una muerte «fantasma» al cruzarse en el aire. | `HIT_RADIUS 24` es menor que el ancho de cubo (80); solo choca realmente cuando comparten celda o se cruzan; se verifica en el recorrido manual. |
| La puntuación máxima supera el `CHECK` de `scores` (`0..1.000.000`). | A ~3500 puntos por ronda la cota está a >250 rondas; se acepta, y la acción rechazaría el exceso con mensaje legible. |
| La vida extra se concede varias veces en el mismo frame con un bonus grande. | `while (score >= nextExtraLife)` con tope `MAX_LIVES`. |
| Un `keydown` repetido (auto-repeat) llena el búfer y el jugador salta fuera sin querer. | Se ignora `e.repeat` y el búfer es de una sola posición. |
| Pestaña en segundo plano: los temporizadores de spawn disparan en ráfaga al volver. | `dt` capado a 50 ms y `lastTime = null` al reanudar. |
| WASD llega al motor mientras se escriben iniciales. | Bucle parado con el modal abierto y listeners en el canvas, no en `window`. |
| `draw()` asigna objetos por frame y rompe el criterio de SPEC 13. | Constantes de color de módulo y cero literales de objeto/array dentro de `draw()`. |

---

## Lo que **no** entra en esta spec

- Cubos de varios pasos, cubos que se revierten, gemelos (Slick/Sam), bola verde y puntos por racha (variante `02-cubos-inestables.md`).
- Sonido.
- Skins `clasico` / `neon` / `retro` (los aplica `skin-designer`).
- Soporte táctil más allá de la cruceta común (`mobile-porter`).
- Pirámides con otra forma o tamaño, Ugg y Wrongway.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
