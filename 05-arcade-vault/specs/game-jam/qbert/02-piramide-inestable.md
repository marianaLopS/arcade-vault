# SPEC — QBERT: pirámide inestable

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-16
> **Objetivo:** Diseñar una variante de Q*bert donde el peligro principal no son los enemigos
> sino la propia pirámide: cada pocos segundos la fila inferior se desmorona, encoger el mapa
> acelera la partida, y encadenar saltos que pintan sin pisar cubos ya terminados multiplica la
> puntuación — como ficha nueva `qbert` en categoría `ARCADE`, con motor real y leaderboard en
> Supabase desde el primer día.

---

## Por qué existe esta spec

La variante `01-piramide-clasica.md` es el arcade de 1982 casi tal cual: la presión viene de
cuatro tipos de enemigo y de tres reglas de color. Esta variante conserva **la misma base** —
pirámide de 7 filas, salto discreto en diagonal, pintar cubos, Coily, bolas rojas, discos de
escape, mismo mundo 800×600 y mismos controles — y cambia **qué presiona al jugador**:

- Un **derrumbe periódico** quita la fila inferior de la pirámide, de abajo hacia arriba. El
  mapa se encoge, así que el nivel se completa antes, pero el terreno seguro desaparece, los
  discos laterales se pierden con su fila y Coily tiene menos sitio donde quedar atrapado.
- Un **combo** premia el ritmo: cada salto que avanza el color seguido de otro igual sube el
  multiplicador; pisar un cubo ya terminado lo rompe. La puntuación pasa de «recorrer todo» a
  «recorrer todo sin dudar ni retroceder».
- Se **quitan** Slick y las reglas `toggle`/`two` por nivel: con el mapa menguando, un enemigo
  que despinta cubos y una regla de doble pisada harían el nivel imposible de terminar.

Es decir: no es la misma spec con otras palabras. Cambian las reglas de presión, de puntuación
y de progresión, y cambian el modelo de datos (cubos con `alive`), el plan de implementación
y los criterios de aceptación.

Como con las demás propuestas de la game jam, **no hay código de referencia**: las constantes de
este documento son el diseño; cambiarlas durante la implementación es rediseñar, no implementar.
El motor dibuja con primitivas de canvas, sin assets externos.

**Nota de nombre:** igual que en la variante 01, `Q*bert` es una marca registrada; ver Riesgos.

---

## Alcance

**Dentro:**

- `lib/games/qbert/engine.ts`: motor nuevo, todo el estado en la clausura de `createQbertGame`,
  sin assets externos.
- Mundo lógico de **800×600** y pirámide de **7 filas** (28 cubos) en proyección isométrica
  fija; misma geometría y mismo mapeo de teclas que la variante 01.
- Movimiento por salto discreto en las cuatro diagonales, con buffer de un salto e
  ignorando `e.repeat`.
- **Derrumbe por filas**: aviso, caída y pérdida de lo que hay encima.
- **Combo** con multiplicador de x1 a x4 sobre los puntos de pintar.
- Regla de color `one` (un salto por cubo) en los niveles 1–2 y `two` (dos saltos) desde el
  nivel 3, sin `toggle`.
- Enemigos: **huevo → Coily** y **bola roja**. Sin Slick.
- **Dos discos de escape** anclados a las filas 4 (se caen con ellas).
- 3 vidas, vida extra cada 10 000 puntos con tope de 5.
- Bonus de nivel por filas que siguen en pie al terminarlo.
- Controles de teclado y cruceta táctil (flechas) sin botones A/B.
- Nueva ficha `qbert` en `lib/games.ts` (categoría `ARCADE`) y clase de portada `cover-qbert`
  en `app/globals.css`.
- Una línea `qbert` en `GAME_ENGINES` (`lib/games/registry.ts`).
- Migración `insert into public.games (id, title) values ('qbert', 'QBERT')` y su aplicación.

**Fuera de alcance (para specs futuras o para la variante `01-piramide-clasica.md`):**

- Slick, Sam, Ugg, Wrongway y la regla de color `toggle`.
- Pirámides de otras formas, mapas por nivel o discos en posiciones variables.
- Power-ups, pausar el derrumbe o reconstruir filas.
- Sonido.
- Skins (`clasico`/`neon`/`retro`).
- Modo de dos jugadores.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla nueva, ni columna, ni tipo de plataforma.** `scores` y `game_stats`
sirven a este juego sin tocarlas, y el leaderboard se enciende con una fila en `games`.

Tipos locales del motor, sin exportar:

```ts
type Hop = "ul" | "ur" | "dl" | "dr";
type Cell = { r: number; c: number };            // r 0..6 · c 0..r · fuera = vacío/disco
type Cube = { s: number; alive: boolean };       // s: 0 base, 1 intermedio, 2 objetivo (regla two)
type Rule = "one" | "two";
type EnemyKind = "egg" | "coily" | "ball";
type Mover = { from: Cell; to: Cell; t: number; dur: number };
type Player = Mover & { mode: "idle" | "hop" | "fall" | "disc" | "hit" };
type Enemy = Mover & { kind: EnemyKind; wait: number; hatch: number; doomed: boolean };
type Disc = { cell: Cell; anchor: Cell; used: boolean; alive: boolean };
type Collapse = {
  row: number;                                    // fila afectada ahora, 6..3; -1 = ninguna activa
  phase: "idle" | "warn" | "fall";
  t: number;                                      // ms dentro de la fase
  next: number;                                   // ms hasta el siguiente aviso
};
```

Estado en la clausura de `createQbertGame`:

- `cubes: Cube[]` — 28 entradas (`índice = r*(r+1)/2 + c`), `alive` pasa a `false` al caer.
- `rule: Rule`, `target: number` (1 en `one`, 2 en `two`).
- `player: Player`, `pending: Hop | null`, `enemies: Enemy[]`, `discs: Disc[]` (siempre 2).
- `collapse: Collapse`, `firstHop: boolean` (el reloj del derrumbe no corre hasta el primer
  salto del nivel).
- `streak` (saltos que avanzan seguidos), `mult` (1..4, derivado de `streak`).
- `score`, `lives`, `level`, `nextExtraLife`.
- `state: "ready" | "playing" | "dying" | "levelclear" | "gameover"`, `stateT`.
- `spawnAccum`, `spawnGrace` (ms).
- Bucle: `rafId`, `lastTime`, `destroyed`.

**Geometría isométrica** (idéntica a la variante 01, repetida aquí porque esta spec es
autosuficiente):

```
CUBE_W 64 · TOP_H 32 · SIDE_H 32 · ROW_DX 32 · ROW_DY 48 · APEX (400, 110)
centro(r, c) = ( 400 + (c - r/2) * 64 , 110 + r * 48 )
step: ul → (r-1, c-1) · ur → (r-1, c) · dl → (r+1, c) · dr → (r+1, c+1)
distancia entre celdas = |Δc| + |Δ(r−c)|
```

`valid(r, c)` pasa a exigir además `cubes[idx(r, c)].alive`: una celda de una fila caída es
vacío a todos los efectos (salto, enemigos, Coily).

---

## Plan de implementación

### 1. Constantes, geometría y reglas de color

`lib/games/qbert/engine.ts`, primera parte. Constantes de diseño:

```
W 800 · H 600 · ROWS 7 · CUBES 28
HOP_MS 240 · HOP_ARC 26 px · SPRITE_LIFT 14 px
FALL_MS 800 · HIT_MS 900 · RESPAWN_GRACE_MS 1500 · LEVELCLEAR_MS 1600
DISC_LEFT  celda virtual (3, -1), ancla (4, 0), salto "ul"
DISC_RIGHT celda virtual (3,  4), ancla (4, 4), salto "ur"
DISC_FLIGHT_MS 1000
LIVES_START 3 · MAX_LIVES 5 · EXTRA_LIFE_EVERY 10000
DT_MAX 50
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Regla por nivel: `rule(level) = level <= 2 ? "one" : "two"`. Colores: estado 0 `#3b4cca`,
estado 1 `#ffd23f`, estado 2 `#ff4fa3`; caras laterales al 65 % y 45 % de brillo. En `one` el
objetivo es el estado 1; en `two`, el 2 (pisar un cubo en 2 no hace nada).

Puntos base por pisada que **avanza** el color: `POINTS_STEP 25` (en `two`, el primer paso da
`15` y el segundo `25`). Esos puntos se multiplican por `mult` (paso 3).

Funciones puras: `idx`, `valid` (con `alive`), `step`, `centro`.

Comprobación: `npm run build` limpio con el motor aún sin registrar.

### 2. Derrumbe por filas

Constantes:

```
COLLAPSE_FIRST_MS(L)   = max(9000, 15000 - 600 * (L - 1))    // desde el primer salto del nivel
COLLAPSE_INTERVAL_MS(L) = max(6500, 11000 - 500 * (L - 1))   // entre derrumbes sucesivos
COLLAPSE_WARN_MS 1800 · COLLAPSE_FALL_MS 600
COLLAPSE_MIN_ROW 3     // las filas 3..6 pueden caer; la 0..2 (6 cubos) siempre quedan
POINTS_COLLAPSE_BANK 10 por cubo ya en estado objetivo en la fila que cae
POINTS_COLLAPSE_COILY 200 si Coily cae con la fila
```

Máquina por nivel (solo corre en `playing` y tras `firstHop`):

1. `idle`: `next` cuenta atrás. Al llegar a 0 se elige `row` = la fila más baja con algún cubo
   `alive` y `row ≥ COLLAPSE_MIN_ROW`; si no existe, el derrumbe termina en este nivel.
2. `warn` (`COLLAPSE_WARN_MS`): los cubos de la fila parpadean entre su color y rojo a 6 Hz y
   tiemblan ±2 px. **Todo sigue funcionando**: se puede pisar la fila, saltar a ella y
   comerse un spawn en ella.
3. `fall` (`COLLAPSE_FALL_MS`): los cubos de la fila caen con aceleración (`y += 900 * (t/1000)²`)
   y se desvanecen. Al empezar la fase, `alive = false` en toda la fila; desde ese instante
   `valid` es falso para ellos.
4. Al terminar `fall`, `next = COLLAPSE_INTERVAL_MS(L)` y se vuelve a `idle`.

**Qué pasa con lo que hay encima en el instante en que empieza `fall`:**

- **Jugador `idle` sobre un cubo de la fila**: entra en `mode = "fall"` y pierde una vida
  (paso 7).
- **Jugador en `hop` con destino en la fila**: si aterriza después de caer la fila, el destino
  ya no es `valid`, así que el aterrizaje es una caída (misma regla que saltar al vacío).
  Si el salto sale de la fila y el destino sigue en pie, el salto se completa con normalidad.
- **Enemigo sobre la fila**: cae. Un Coily o un huevo eclosionado que cae suma
  `POINTS_COLLAPSE_COILY 200` al jugador; las bolas rojas y los huevos sin eclosionar caen sin
  puntos.
- **Disco con ancla en la fila**: el disco ancla de la fila 4 (ambos) se pierde con ella:
  `alive = false`, se dibuja cayendo con la fila y deja de ser alcanzable.
- **Puntos de banco:** por cada cubo de la fila ya en el estado objetivo, `POINTS_COLLAPSE_BANK 10`
  (sin multiplicador). Los cubos sin completar se pierden sin penalización: se descuentan del
  objetivo del nivel.

El objetivo del nivel pasa a ser **«todos los cubos `alive` en el estado objetivo»**. Si un
derrumbe deja el resto del mapa ya completo, el nivel se gana en ese mismo instante, al terminar
la fase `fall`, con el jugador ileso.

Comprobación: `npm run build` limpio; con un temporizador acortado a mano, la fila 6 cae, la 5 le
sigue, y ninguna fila de la 2 hacia arriba cae jamás.

### 3. Jugador, salto y combo

Entrada y salto idénticos a la variante 01: mapeo girado 45° (`ArrowUp/KeyW/KeyE → ur`,
`ArrowRight/KeyD/KeyC → dr`, `ArrowDown/KeyS/KeyZ → dl`, `ArrowLeft/KeyA/KeyQ → ul`),
`e.repeat` ignorado, buffer de un salto, `HOP_MS 240` con arco parabólico, aterrizaje lógico
al final del salto, entrada descartada en `dying`/`levelclear`/`gameover`. El primer salto del
nivel pone `firstHop = true` y arranca el reloj del derrumbe y el del spawner.

**Combo (nuevo):**

```
streak: sube 1 con cada aterrizaje que avanza el color de un cubo (incluido el paso 0→1 de two)
        vuelve a 0 con: aterrizar en un cubo ya en estado objetivo, perder una vida, cambiar de nivel
        NO cambia con: usar un disco (queda igual), saltos mientras enemigo se cruza sin tocarlo
mult  = 1 + floor(streak / 4), con tope 4     // x1: 0–3, x2: 4–7, x3: 8–11, x4: 12+
puntos de pintar = POINTS_STEP * mult         // el paso 15 de two también se multiplica
```

Mostrar el combo: una barra de 4 pips bajo el indicador de objetivo (dentro del canvas, porque
es estado de juego y no un dato del HUD) y un `×2`/`×3`/`×4` que flota 600 ms sobre el jugador
al subir de multiplicador. El canvas **no** dibuja puntos, nivel ni vidas.

Un nivel completo sin romper nunca el combo requiere 28 cubos en 28 saltos consecutivos, algo
imposible en la pirámide real: el combo se rompe por geometría. Eso es intencional: el
multiplicador premia recorridos largos y planeados, no un camino perfecto.

Comprobación: `npm run build` limpio; cuatro aterrizajes consecutivos en cubos nuevos suben a
x2 y volver a pisar un cubo ya objetivo lo reinicia a x1.

### 4. Enemigos: huevo, Coily y bola roja

Mismas reglas que la variante 01 con estas diferencias:

- Se quita **Slick**. Pesos de spawn: huevo 55 · bola roja 45. Topes: 1 línea huevo/Coily,
  2 bolas.
- Ritmo: `COILY_HOP_MS(L) = max(240, 420 - 20 * (L - 1))`, `BALL_HOP_MS(L) = max(320, 600 - 20 *
  (L - 1))`, `SPAWN_INTERVAL_MS(L) = max(2000, 3600 - 150 * (L - 1))`,
  `FIRST_SPAWN_MS 2600`, `HATCH_MS 500`.
- Huevo y bola caminan `dl`/`dr` al azar entre celdas `valid`; si alguna de las dos casillas
  de destino ya cayó, eligen la otra; si ninguna es `valid`, se despeñan por el borde inferior
  como una bola que llega a la fila 6.
- Coily elige el vecino `valid` que minimiza la distancia; con el mapa menguando, un Coily en
  la fila que va a caer **no huye**: tras su aviso sigue persiguiendo y cae con ella.
- No hay spawns durante `ready`, `dying`, `levelclear`, `spawnGrace`, ni durante la fase `fall`
  de un derrumbe (para que un enemigo no nazca encima de una fila que ya no existe).
- Colisión: igual que en la variante 01 (aterrizaje coincidente o intercambio de celdas con
  saltos solapados). Contra cualquiera de los tres tipos, el jugador muere.

Comprobación: `npm run build` limpio; un Coily de prueba sigue al jugador hasta caer con una
fila derrumbada y suma 200.

### 5. Bucle y orden de resolución

Por frame, solo en `playing`, con `dt` capado a `DT_MAX`:

1. Avanzar el derrumbe (`warn` → `fall` → `idle`). Si empieza `fall`, aplicar sobre jugador,
   enemigos y discos lo descrito en el paso 2 y sumar puntos de banco.
2. Avanzar el salto del jugador; si aterriza:
   1. Si el destino ya no es `valid` → caída.
   2. Si hay un enemigo en la celda → muerte, sin pintar.
   3. Aplicar la regla de color; actualizar `streak`/`mult`; sumar puntos.
   4. Si todos los cubos `alive` están en el objetivo → `levelclear` inmediato, borrando
      enemigos; los aterrizajes enemigos del mismo frame no se evalúan.
   5. Ejecutar `pending`.
3. Avanzar enemigos y resolver colisiones.
4. Avanzar el spawner.

Bonus de nivel al entrar en `levelclear`:

```
LEVEL_BONUS = 1000 + 250 * (level - 1)
STANDING_ROW_BONUS = 100 por fila con algún cubo alive en el momento de completar (3..7 filas)
DISC_BONUS = 50 por disco sin usar y todavía alive
```

`state = "levelclear"` durante `LEVELCLEAR_MS` con parpadeo de los cubos restantes; al terminar,
`level++`, `onLevel(level)`, pirámide y discos completos de nuevo, `streak = 0`,
`collapse` reiniciado, `firstHop = false`.

`emit()` con `lastScore` / `lastLives` / `lastLevel`. `onLives(LIVES_START)` y `onLevel(1)` al
iniciar. Vida extra al cruzar 10 000, 20 000, … con tope `MAX_LIVES`.

Comprobación: `npm run build` limpio; completar el nivel con 3 filas en pie suma 300 de bonus
de filas.

### 6. Discos de escape

Mismo comportamiento que la variante 01 (aterrizar sobre el disco → vuelo de
`DISC_FLIGHT_MS` al vértice, jugador intangible, spawner detenido, Coily eclosionado cae y da
500, resto de enemigos desaparece), con estas diferencias:

- Cada disco tiene `anchor`: la celda (4, 0) o (4, 4). Se puede alcanzar solo mientras
  `cubes[anchor].alive` y el disco esté `alive`.
- Si el derrumbe de la fila 4 empieza mientras el jugador vuela en el disco, el vuelo continúa
  y el jugador aterriza en el vértice, que nunca cae: **el disco es la única salida garantizada
  de una fila que se derrumba**.
- Usar un disco **no** rompe ni sube el combo, y no pausa el reloj del derrumbe.

Comprobación: `npm run build` limpio; cuando la fila 4 cae, ambos discos caen con ella y saltar
hacia donde estaban es una caída.

### 7. Muerte, vidas y game over

Idéntico a la variante 01 en estados y avisos (`dying` por enemigo o caída, `lives--`,
`onLives`, reaparición en (0, 0) con los cubos pintados intactos, `spawnGrace`, `onGameOver`
una sola vez), con tres reglas propias:

- Perder una vida pone `streak = 0`.
- **El reloj del derrumbe sigue corriendo mientras el jugador muere y reaparece**; una caída
  por derrumbe no se «reinicia». Así no se puede dejar de jugar para ganar tiempo.
- Si el derrumbe en `warn`/`fall` coincide con la animación `dying`, la fila termina de caer
  igualmente.

Comprobación: `npm run build` limpio; perder 3 vidas abre `FIN DEL JUEGO`.

### 8. Dibujo y ciclo de vida

- `draw()`: fondo `#0a0a1a`; cubos `alive` de atrás hacia delante; durante `warn` la fila
  parpadea en rojo y tiembla; durante `fall` los cubos descienden y se atenúan; discos y
  personajes ordenados por `y` junto con su fila; sombra elíptica bajo cada personaje.
- Personajes y paleta idénticos a la variante 01 (sin Slick).
- Indicador de objetivo (esquina superior izquierda) y barra de combo de 4 pips debajo. Un
  cronómetro del derrumbe: una barra horizontal fina de 120 px bajo el combo que se vacía hasta
  el aviso y parpadea en `warn`. `PULSA UNA FLECHA` mientras `state === "ready"`. Sin puntos,
  nivel ni vidas dibujados.
- `GAME_KEYS`: las 12 teclas del mapeo. `preventDefault()` solo para esas. Listeners
  `keydown` / `blur` sobre el canvas, nunca `window`. `P` y `Escape` no llegan.
- `dt` capado a `DT_MAX`; `lastTime = null` al reanudar (también congela el reloj del derrumbe).
- `destroy()` cancela el frame, quita los listeners y es idempotente.
- `initGame(); draw();` antes de devolver.

Comprobación: `npm run build` limpio; la barra del derrumbe se vacía y pausar la congela.

### 9. Catálogo: nueva ficha `qbert`

`lib/games.ts`, nueva entrada en `GAMES`:

```ts
{
  id: "qbert",
  title: "QBERT",
  short: "Pinta la pirámide antes de que se te caiga encima.",
  long: "Un saltarín recorre una pirámide isométrica cambiando el color de cada cubo, pero el suelo no es eterno: cada pocos segundos la fila inferior se agrieta y se desploma. Encadena saltos para multiplicar tu puntuación, esquiva a la serpiente morada y huye en un disco volador antes de que el mapa se encoja bajo tus pies.",
  cat: "ARCADE",
  cover: "cover-qbert",
  color: "yellow",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `.cover-qbert` nueva, con la pirámide de rombos y su fila inferior en
degradado rojo (esta variante la «agrieta»), sin imagen externa.

Comprobación: `/juegos/qbert` muestra la ficha antes de registrar el motor.

### 10. Registrar el motor

`lib/games/registry.ts`:

```ts
qbert: {
  create: createQbertGame,
  width: 800,
  height: 600,
  controls:
    "flechas o WASD para saltar en diagonal: arriba = arriba-derecha, derecha = abajo-derecha, abajo = abajo-izquierda, izquierda = arriba-izquierda",
  touch: {},
},
```

Comprobación: `/jugar/qbert` pinta el canvas real en vez de `.game-arena`.

### 11. Leaderboard

`supabase/migrations/<timestamp>_juego_qbert.sql`, con timestamp posterior a
`20260927130000`:

```sql
insert into public.games (id, title) values ('qbert', 'QBERT');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. Los tipos no se
regeneran.

Comprobación: `select * from public.games` incluye la fila `qbert`.

### 12. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido
manual de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/qbert` muestra un canvas de 800×600 con una pirámide isométrica de 28 cubos, no la
      `.game-arena`.
- [ ] El jugador empieza en el vértice y no se mueve hasta pulsar una flecha; el canvas muestra
      `PULSA UNA FLECHA` mientras tanto.
- [ ] Las flechas, WASD y Q/E/Z/C saltan a la diagonal del mapeo; mantener una tecla da un solo
      salto.
- [ ] El reloj del derrumbe no empieza hasta el primer salto del nivel.
- [ ] A los 15 s del primer salto (nivel 1) la fila inferior parpadea en rojo durante 1.8 s y
      después cae en 0.6 s.
- [ ] Durante el aviso, la fila sigue siendo pisable; tras caer, saltar a ella es una caída.
- [ ] Estar sobre un cubo de la fila cuando empieza a caer quita una vida.
- [ ] Un salto que parte de la fila que cae hacia un cubo que sigue en pie se completa sin daño.
- [ ] La fila 4 cae con sus dos discos, que dejan de ser alcanzables.
- [ ] Ninguna de las filas 0, 1 o 2 cae jamás, aunque el nivel dure minutos.
- [ ] Los cubos ya en el estado objetivo de una fila que cae suman 10 puntos cada uno.
- [ ] Completar todos los cubos que quedan en pie —incluso si es por el derrumbe de la última
      fila incompleta— abre `levelclear` y suma `1000 + 250 × (nivel − 1)` + 100 por fila en pie.
- [ ] Cuatro aterrizajes seguidos que avanzan el color suben el combo a x2; ocho a x3; doce a x4.
- [ ] Pisar un cubo ya en el estado objetivo, perder una vida o pasar de nivel reinicia el combo.
- [ ] El multiplicador se aplica a los 25 (y 15) puntos de pintar y no a bonus de banco, discos
      ni Coily.
- [ ] Usar un disco no rompe ni sube el combo.
- [ ] En los niveles 1–2 un cubo necesita una pisada; desde el 3, dos.
- [ ] Un huevo aparece a los ~2.6 s del primer salto, baja al azar y eclosiona en Coily en la
      fila 6 si la fila sigue en pie.
- [ ] Un huevo o bola roja no nace durante la fase `fall` de un derrumbe.
- [ ] Un Coily que cae con una fila derrumbada suma 200 y desaparece.
- [ ] Un Coily eclosionado + disco = 500 puntos y tablero despejado.
- [ ] Tocar un huevo, Coily o bola roja quita una vida; los cubos pintados se conservan y el
      reloj del derrumbe no se reinicia.
- [ ] No aparece ningún enemigo verde (Slick) en ninguna partida.
- [ ] El HUD muestra 3 vidas al inicio y sube una vida cada 10 000 puntos, con tope de 5.
- [ ] Perder la última vida abre el modal `FIN DEL JUEGO` con la puntuación real, una sola vez.
- [ ] El canvas no dibuja puntos, nivel ni vidas ni overlay de game over; solo objetivo, combo,
      barra de derrumbe y `PULSA UNA FLECHA`.
- [ ] `JUGAR DE NUEVO` restablece los 28 cubos, los discos, el combo, el reloj del derrumbe,
      la puntuación, las vidas y el nivel sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'qbert'`.
- [ ] Esa puntuación aparece en `/salon?juego=qbert` y en `/juegos/qbert` sin recargar a mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Con `scores` vacía para este juego, `/salon?juego=qbert` muestra el estado vacío.
- [ ] `PAUSA` congela salto, enemigos y reloj del derrumbe; `REANUDAR` los reanuda sin
      adelantar el aviso ni teletransportar a nadie. `P` y `Escape` hacen lo mismo.
- [ ] Con el canvas enfocado, las flechas no hacen scroll de la página.
- [ ] Escribir `W`, `A`, `S`, `D`, `Q`, `E`, `Z` o `C` en el campo de iniciales no mueve ni
      reinicia el juego.
- [ ] En móvil, la cruceta táctil mueve al jugador un salto por toque.
- [ ] Navegar de `/jugar/qbert` a `/biblioteca` y volver no duplica el bucle.
- [ ] Dejar la pestaña en segundo plano y volver no adelanta el derrumbe más de 50 ms.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid`, `/jugar/snake` y `/jugar/frogger`
      se juegan igual que antes.
- [ ] `select * from public.games` incluye una fila `qbert` además de las ya existentes.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/qbert`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** derrumbe de abajo hacia arriba con parada en la fila 3. Quitar filas de arriba
  aislaría al jugador del vértice y de los discos; de abajo, el mapa menguante es siempre una
  pirámide más pequeña y legible.
- **Sí:** el derrumbe sigue corriendo al morir. Permitir que la muerte pause el reloj sería un
  exploit para ganar tiempo.
- **Sí:** aviso de 1.8 s pisable. Menos sería injusto; no ser pisable lo volvería un parpadeo
  sin significado de juego.
- **Sí:** los discos caen con la fila 4. Es el coste real de tardar: la salida de emergencia se
  pierde si no se usa a tiempo, y dota de sentido al reloj.
- **Sí:** el objetivo del nivel es «todo lo que queda en pie». Es lo que hace que el derrumbe
  sea a la vez amenaza y atajo, que es el núcleo de la variante.
- **Sí:** el combo premia avanzar el color y se rompe al pisar un cubo ya objetivo. Premia
  planificar el recorrido; romperlo por morir o ganar evita arrastrar el bonus entre niveles.
- **Sí:** el multiplicador solo afecta a los puntos de pintar, no a bonus. Si no, un
  `levelclear` con x4 sería un vector de inflación de `scores` (tope en BD: 1 000 000).
- **Sí:** vida extra a 10 000 en vez de 8 000, porque el combo infla la puntuación media.
- **No:** Slick ni regla `toggle`. Con el mapa menguando, despintar cubos haría el nivel
  incompletable, y un tercer nivel de reglas mezclaría dos fuentes de dificultad.
- **No:** reconstruir filas ni pausar el derrumbe con un objeto. Es una capa más; si se quiere,
  va en otra spec.
- **Sí:** reutilizar sin cambios mundo, geometría, mapeo de teclas y contrato con el registry de
  la variante 01. Las dos variantes comparten base y solo difieren en lo que las hace distintas.
- **No:** sembrar puntuaciones en `scores`.
- **No:** skins. Pueden añadirse después con `skin-designer`.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `Q*bert` es una marca registrada y el nombre/personajes originales pueden ser un problema de publicación. | Personajes con formas genéricas; `game-id` y título son un solo valor fácil de cambiar antes de publicar (ficha + registro + migración). |
| El derrumbe resta demasiada pirámide y el nivel se vuelve trivial (se gana por inercia). | El objetivo solo cuenta cubos en pie, pero el bonus por fila en pie premia no esperar; el intervalo mínimo es 6.5 s y la fila 3 es el tope. Se verifica jugando los niveles 1, 4 y 10. |
| El derrumbe resta tan poco tiempo que es imposible pintar 28 cubos antes de que caiga la fila 6. | Los cubos de filas caídas no cuentan en el objetivo, así que nunca hay que pintar lo ya perdido. El primer aviso a 15 s (nivel 1) da margen para ~60 saltos. |
| Un salto en el aire sobre una fila que cae resuelve distinto según el instante del aterrizaje. | Regla explícita: el destino se evalúa **al aterrizar**; los casos «sale de la fila que cae» y «llega a la fila que cae» son criterios de aceptación separados. |
| El derrumbe y la muerte por enemigo ocurren en el mismo frame y se pierden dos vidas. | En ese frame se resuelve una sola muerte (la primera en el orden del paso 5); `lives` baja una unidad y el estado pasa a `dying` una sola vez. |
| El combo hace crecer la puntuación sin techo y supera el `CHECK` de 1 000 000 de `scores`. | Tope x4 solo sobre puntos de pintar, y el máximo realista por nivel es de unos pocos miles; a pesar de ello se verifica en pruebas largas y `guardarScore` ya rechaza valores fuera de rango con un mensaje legible. |
| Pestaña en segundo plano: el reloj del derrumbe acumula el tiempo que pasó oculta. | `dt` capado a 50 ms y `lastTime = null` al reanudar; el reloj avanza con `dt` capado, no con el reloj de pared. |
| Coily es injusto cuando el mapa es pequeño. | Tope inferior de `COILY_HOP_MS` en 240 ms y su inercia de caer con la fila; el huevo no puede eclosionar si la fila 6 ya cayó (cae antes de eclosionar). |
| WASD y Q/E/Z/C llegan al motor mientras se escriben iniciales. | Bucle parado con el modal abierto y listeners en el canvas, no en `window`. |
| `touch: {}` obliga a un toque por salto y hace difícil esquivar con precisión en móvil, y esta variante exige más ritmo. | Se acepta para esta propuesta; mejorar el mando táctil sería una spec propia posterior a la SPEC 11. |

---

## Lo que **no** entra en esta spec

- Slick, Sam, Ugg, Wrongway y la regla `toggle`.
- Reconstruir filas, ralentizar o pausar el derrumbe con objetos.
- Pirámides distintas o mapas por nivel.
- Sonido.
- Skins.
- Dos jugadores.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
