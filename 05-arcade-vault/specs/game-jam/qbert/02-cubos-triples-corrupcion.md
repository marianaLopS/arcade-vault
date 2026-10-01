# SPEC — QBERT: cubos triples y corrupción

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06 (y SPEC 14/15 para `scores.user_id`)
> **Fecha:** 2026-10-01
> **Objetivo:** Diseñar un Q\*bert con twist sobre la misma pirámide isométrica: cubos de tres pasos, pirámide que crece de 5 a 7 filas con el nivel, una «corrupción» temporizada que deshace cubos ya pintados y un multiplicador de combo, para una partida de ritmo y planificación de ruta en vez de pura evasión.

---

## Por qué existe esta spec

Es la segunda variante de `qbert`, junto a `specs/game-jam/qbert/01-clasico-piramide.md`. Comparte con
ella el género, el mundo lógico de 800×600, la proyección isométrica, el sistema de coordenadas
`(r, c)`, el salto discreto en 4 diagonales, la rotación de 45° de los controles, los discos de
escape y el contrato `GameEngine`. Cambia el eje de diseño: en la variante 01 la dificultad viene de
**quién te persigue**; aquí viene de **qué tienes que repetir y en qué orden**.

Tres cambios lo hacen otro juego, no la misma spec reescrita:

1. **Cubos de tres pasos** (`0 → 1 → 2`): hay que pisar cada cubo dos veces, así que una pirámide
   se resuelve recorriéndola en rutas con solapamiento, no en una pasada.
2. **Corrupción**: cada pocos segundos un cubo pintado pierde un paso, avisado antes con un parpadeo.
   El tablero «se deshace» solo, y hay un reloj implícito sin cronómetro en pantalla.
3. **Combo y pirámide creciente**: los saltos consecutivos que avanzan un cubo multiplican los
   puntos, y la pirámide pasa de 5 a 7 filas durante los tres primeros niveles.

Se quitan Slick (la corrupción ocupa su papel) y la bola roja solo aparece desde el nivel 1 como
estorbo; Coily entra desde el nivel 2. Como en la variante 01 y en Snake (SPEC 10), no hay código de
referencia: las constantes del paso 2 **son** el diseño.

---

## Alcance

**Dentro:**

- `lib/games/qbert/engine.ts`: motor nuevo, estado en la clausura de `createQbertGame`, sin sprites
  externos (polígonos y arcos de `ctx`).
- Mundo 800×600, cubos de 80 px de cara superior, mismas fórmulas isométricas que la variante 01.
- **Pirámide de tamaño variable**: `rows(level) = min(7, 4 + level)` filas (nivel 1 → 5 filas y 15
  cubos; nivel 2 → 6 y 21; nivel ≥3 → 7 y 28), centrada verticalmente.
- **Cubos de tres estados** `0 → 1 → 2`; el estado 2 es el objetivo y no revierte por pisarlo.
- **Corrupción** con aviso visible de 800 ms y cancelable aterrizando sobre el cubo avisado.
- **Combo**: multiplicador `×1…×5` por rachas de saltos que avanzan un cubo.
- Enemigos: **bola roja** (letal, desde el nivel 1) y **Coily** (huevo + serpiente, letal, desde el
  nivel 2). Sin Slick.
- Dos **discos de escape** en `(2,-1)` y `(2,3)`, de un solo uso (existen en cualquier tamaño de
  pirámide porque se llega a ellos desde la fila 3, y la pirámide tiene siempre al menos 5 filas).
- 3 vidas, bono de tiempo por nivel y niveles infinitos (el tamaño se detiene en 7 filas; la
  velocidad y la corrupción siguen apretando hasta el nivel 10).
- Puntuación vía `onScore`, vidas vía `onLives`, nivel vía `onLevel`, fin vía `onGameOver`.
- Controles: flechas o WASD rotadas 45° (mismo mapa que la variante 01).
- Una línea `qbert` en `GAME_ENGINES` y fila en `games` **al promover**; esta spec no las aplica.

**Fuera de alcance (para specs futuras o para la variante 01):**

- Slick, Sam, Ugg y Wrongway; cubos que revierten al re-pisar.
- Power-ups, vidas extra, más de un tipo de corrupción.
- Cronómetro visible en el HUD de React: el motor no puede añadir overlays; la presión se lee en el
  parpadeo de aviso.
- Sprites, skins (`skins: false`), sonido.
- Botones táctiles propios (`touch: {}`: la cruceta de la plataforma ya envía las cuatro flechas).
- Modo dos jugadores.
- Tocar `lib/games.ts`, `lib/games/registry.ts`, `globals.css` o las portadas.
- Migraciones de Supabase y autenticación nueva.

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni tipo de plataforma nuevo.** El leaderboard se enciende con
una fila en `games` al promover la spec.

Integración con `scores` (la hace `components/game-player.tsx`, no el motor):

- El motor llama a `onScore(n)` cuando cambia y a `onGameOver(finalScore)` **una sola vez**.
- `GUARDAR PUNTUACIÓN` inserta `{ game_id: 'qbert', player: <1-3 letras A-Z>, score, user_id }`, con
  `user_id` `null` (invitado) o `auth.uid()` según SPEC 15.
- `scores.score` tiene `check (score >= 0 and score <= 1000000)`: el motor satura `score` a
  `1_000_000`. Con el combo ×5 y el bono de tiempo, una partida larga puede acercarse al techo.
- Esta variante y la 01 usan el mismo `game_id`, `qbert`: son **alternativas**, no dos juegos. Solo
  una se promueve; las puntuaciones de la otra no existirían en la tabla.

Tipos locales del motor, sin exportar:

```ts
type Cell = { r: number; c: number }; // 0 <= c <= r < rows; (2,-1) y (2,3) = casillas de disco
type Dir = "ul" | "ur" | "dl" | "dr";
type Cube = {
  step: 0 | 1 | 2; // 2 = objetivo
  warn: number; // ms restantes de aviso de corrupción, 0 = sin aviso
};
type Disc = { side: "left" | "right"; cell: Cell; used: boolean };

type Hopper = { cell: Cell; from: Cell; t: number; phase: "idle" | "hop" | "fall" | "disc" };
type Enemy =
  | (Hopper & { kind: "red" })
  | (Hopper & { kind: "egg" | "coily"; hatchT: number });
```

Estado en la clausura de `createQbertGame`:

- `rows`, `cubes: Cube[]` (índice `r*(r+1)/2 + c`), `discs: Disc[]`, `qbert: Hopper`, `enemies: Enemy[]`, `queued: Dir | null`.
- `score`, `lives`, `level`, `streak` (saltos avanzando seguidos), `levelMs` (tiempo en el nivel).
- `state: "waiting" | "playing" | "dying" | "clearing" | "gameover"`.
- Temporizadores: `corruptTimer`, `redTimer`, `coilyTimer`, `stateTimer`, `graceTimer`; `warned: number | null` (índice del cubo en aviso).
- Bucle: `rafId`, `lastTime`, `destroyed`. `emit()`: `lastScore`, `lastLives`, `lastLevel`.

---

## Plan de implementación

### 1. Geometría isométrica y pirámide variable

`lib/games/qbert/engine.ts`. Constantes:

```
W 800 · H 600 · MAX_ROWS 7 · MIN_ROWS 5
CUBE_W 80 · CUBE_TOP_H 40 · SIDE_H 40 · STEP_X 40 · STEP_Y 60
rows(level)  = min(MAX_ROWS, 4 + level)
originY(rows) = 100 + (MAX_ROWS - rows) * 30       // recentra la pirámide más baja
screenX(r,c) = 400 + (c - r/2) * 80
screenY(r)   = originY(rows) + r * 60
Disco izquierdo en (2,-1), derecho en (2,3), radio 28×14, anclados con el mismo screenX/screenY
```

Vecinos: `ul = (r-1,c-1)` · `ur = (r-1,c)` · `dl = (r+1,c)` · `dr = (r+1,c+1)`. Es pirámide si
`0 <= r < rows` y `0 <= c <= r`. Con `rows = 5`, la fila 4 es la última: los discos siguen siendo
accesibles desde `(3,0)` y `(3,3)`.

Comprobación: `npm run build` limpio; las tres alturas (5, 6 y 7 filas) quedan dentro de 800×600 sin
solaparse con los discos.

### 2. Motor: constantes y lógica

Constantes de diseño:

```
HOP_MS 160 · HOP_ARC 24 px · INPUT_BUFFER 1 salto
FALL_MS 500 · FALL_DIST 260 px · DISC_RIDE_MS 900 · DT_MAX 50 ms
LIVES 3 · RESPAWN_GRACE_MS 1500 · DEATH_FREEZE_MS 900 · LEVEL_CLEAR_MS 1200

Cubos:        STEP_TARGET 2 · STEP_POINTS 15
Combo:        mult = min(5, 1 + floor(streak / 3))   // streak 0-2 → ×1, 3-5 → ×2, ... 12+ → ×5
              streak++ al aterrizar en un cubo cuyo step aumenta
              streak = 0 al aterrizar en un cubo ya en step 2, al subirse a un disco, o al perder una vida
Corrupción:   CORRUPT_INTERVAL_MS(level) = max(3000, 7000 - 500*(level-1))
              CORRUPT_WARN_MS 800
              Víctima: cubo al azar con step >= 1, distinto del que ocupa Q*bert y de cualquier celda
              ocupada por un enemigo. Sin víctima válida, el temporizador se reinicia sin efecto.
              Aterrizar Q*bert sobre el cubo en aviso cancela la corrupción (warn = 0).
Bola roja:    RED_SPAWN_MS(level) = max(2400, 4200 - 200*(level-1)) · RED_HOP_MS 480 · MAX_RED 2
Coily:        desde level >= 2 · COILY_FIRST_MS 3000 · COILY_RESPAWN_MS 4500
              EGG_HOP_MS 520 · HATCH_MS 400
              COILY_HOP_MS(level) = max(280, 440 - 20*(level-1)) · MAX_COILY 1
Spawn de enemigos: fila 1, columna 0 o 1 al azar; reintento a 500 ms si Q*bert ocupa la celda.
Cap de dificultad: los `max(...)` de arriba se saturan en level = 10.

Puntos:       COILY_DISC_POINTS 500 · DISC_BONUS 50 (por disco sin usar al completar)
              CLEAR_BASE(level) 400 * level
              TIME_BONUS = max(0, 60 - floor(levelMs/1000)) * 10   // al completar la pirámide
              SCORE_MAX 1_000_000
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Reglas, con `dt` en milisegundos:

- **Espera.** En `waiting` no corren temporizadores ni `levelMs`. El primer salto válido pasa a
  `playing` y arranca `corruptTimer`, `redTimer` y (desde el nivel 2) `coilyTimer`. Los temporizadores
  de corrupción, aviso, spawns y `levelMs` solo avanzan en `playing`; se detienen en `dying`,
  `clearing`, durante `DISC_RIDE_MS` y en pausa.
- **Entrada y salto.** Idénticos a la variante 01: mapa `ArrowUp`/`KeyW` → `ur`, `ArrowRight`/`KeyD`
  → `dr`, `ArrowDown`/`KeyS` → `dl`, `ArrowLeft`/`KeyA` → `ul`; un solo hueco `queued`; saltar fuera
  de la pirámide sin disco es caer.
- **Aterrizaje en cubo.** Si `step < 2`: `step++`, `+STEP_POINTS * mult` (el multiplicador se calcula
  con el `streak` previo) y `streak++`. Si `step == 2`: sin puntos y `streak = 0`. Si el cubo estaba en
  aviso: `warn = 0` y se libera la víctima (`warned = null`).
- **Corrupción.** Cada `CORRUPT_INTERVAL_MS(level)` se elige víctima y se marca `warn =
  CORRUPT_WARN_MS`. Al llegar `warn` a 0 sin cancelación, `step--` (nunca por debajo de 0). La víctima
  elegida no puede coincidir con el cubo bajo Q\*bert **en el momento del aviso**; si Q\*bert aterriza
  después, cancela. Solo hay un cubo en aviso a la vez.
- **Disco.** Igual que la variante 01: congela enemigos, temporizadores y corrupción durante
  `DISC_RIDE_MS`, lleva a Q\*bert a `(0,0)`, Coily eclosionado cae a mitad del viaje con
  `COILY_DISC_POINTS`, el disco queda `used`. Además `streak = 0` al subir.
- **Bola roja y Coily.** Reglas y distancia de grafo (BFS sobre las celdas de la pirámide actual,
  de 15, 21 o 28) idénticas a la variante 01, con las constantes de arriba. Los enemigos que se
  generan en un nivel no sobreviven al siguiente.
- **Colisión letal.** Misma regla: coincidir en celda al aterrizar cualquiera, o intercambio de celdas
  en el mismo instante. Ignorada durante `RESPAWN_GRACE_MS`, `disc` y `fall`.
- **Vida perdida.** `state = "dying"`, `lives--`, `streak = 0`. Con `lives > 0`: Q\*bert a `(0,0)`,
  enemigos eliminados, **los `step` de los cubos se conservan** pero cualquier aviso de corrupción en
  curso se cancela y `corruptTimer` se reinicia, `RESPAWN_GRACE_MS`. Con 0 vidas: `gameover`.
- **Nivel completo.** Cuando todos los cubos de la pirámide están en `step == 2`:
  `state = "clearing"`, `LEVEL_CLEAR_MS` de parpadeo, y entonces `+CLEAR_BASE(level) + TIME_BONUS +
  DISC_BONUS × discos sin usar`, `level++`, pirámide nueva de `rows(level)` filas con `step = 0`,
  discos repuestos, `levelMs = 0`, `streak = 0`, enemigos y temporizadores a cero, `state = "waiting"`.
- **Aritmética.** `score = min(score + points, SCORE_MAX)`.

Comprobación: `npm run build` limpio.

### 3. Motor: bucle, entrada y dibujo

- `emit()` con `lastScore` / `lastLives` / `lastLevel`; `onLives(3)` y `onLevel(1)` al arrancar.
- `draw()`, en orden: fondo `#0a0a1a`; cubos de la fila 0 a la última; discos; sombras; enemigos;
  Q\*bert; personajes en `fall` al final.
- **Color de cubo por `step`**: `0` → `base`, `1` → intermedio (mezcla 50 % base/objetivo), `2` →
  `target`. Caras laterales al 70 % y 50 % de luminosidad. Paleta por nivel, solo visual:
  `PALETTES[(level-1) % 4]` = `[ {base:"#2b3a9e", target:"#ffd23f"}, {base:"#7a1fa2", target:"#33e0a1"},
  {base:"#1b6a5d", target:"#ff7a3d"}, {base:"#3a3a3a", target:"#f2f2f2"} ]`.
- **Aviso de corrupción**: contorno magenta `#ff2bd6` de 3 px alrededor de la cara superior, que
  parpadea a 8 Hz y se acelera a 16 Hz en los últimos 300 ms. Al ejecutarse, el cubo hace un destello
  blanco de 120 ms y baja un paso. Sin texto.
- **Indicador de combo dentro del canvas**: el aro de la sombra de Q\*bert crece con el multiplicador
  (radio base 18 px + 4 px por cada `×` por encima de 1) y toma color: `×1` blanco, `×2` cian, `×3`
  verde, `×4` amarillo, `×5` magenta. Es estado propio del juego, no HUD: la puntuación y el
  multiplicador numérico no se escriben en el canvas.
- Personajes como en la variante 01 (Q\*bert naranja con hocico, bola roja `#ff3b3b`, huevo y Coily
  `#b36bff`). Burbuja `¡@#!` en `DEATH_FREEZE_MS`. Rótulo `PULSA UNA FLECHA` con diagrama de flechas en
  `waiting`.
- Game over: `stopLoop()` y `onGameOver(score)` una vez; `resume()` no-op después.
- `restart()`: `initGame()` (nivel 1, 5 filas, 3 vidas, 0 puntos), `emit()`, arranca.
- `dt` capado a `DT_MAX`; `lastTime = null` al reanudar.
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`, `KeyD`;
  `preventDefault()` solo para esas. Listeners `keydown` / `blur` sobre el canvas; `blur` descarta
  `queued`. `P` y `Escape` no llegan al motor.
- `destroy()` cancela el frame, quita listeners, idempotente. `initGame(); draw();` antes de devolver.

Comprobación: `npm run build` limpio; se ve el aviso de corrupción y el aro de combo.

### 4. Registrar (al promover)

`lib/games/registry.ts`:
`qbert: { create: createQbertGame, width: 800, height: 600, controls: "flechas o WASD para saltar en diagonal: arriba = arriba-derecha, derecha = abajo-derecha, abajo = abajo-izquierda, izquierda = arriba-izquierda", touch: {} }`.

`lib/games.ts`: ficha `{ id: "qbert", title: "Q*BERT", cat: "ARCADE", color: "yellow", best: 0, plays: "0" }`
con `short` y `long` que mencionen los cubos de tres pasos y la corrupción.

Comprobación: `/jugar/qbert` pinta el canvas real; el resto de juegos no cambia.

### 5. Leaderboard (al promover)

`supabase/migrations/<timestamp>_juego_qbert.sql`, timestamp posterior a `20260927130000`:

```sql
insert into public.games (id, title) values ('qbert', 'Q*BERT');
```

Se aplica con `apply_migration` y se comprueba con `execute_sql`. Sin regenerar tipos.

Comprobación: `select * from public.games` incluye `qbert`.

### 6. Repaso final

`npm run lint`, `npm run build`, `get_advisors` sin avisos nuevos y el recorrido manual de los
criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/qbert` muestra un canvas de 800×600 con una pirámide isométrica de **5 filas (15 cubos)** en el nivel 1, centrada.
- [ ] No hay movimiento, enemigos ni corrupción hasta la primera flecha; mientras tanto se ve `PULSA UNA FLECHA`.
- [ ] Las 4 flechas y `WASD` saltan en el mismo mapa rotado que la variante 01, con un solo hueco de búfer.
- [ ] Un cubo necesita dos aterrizajes para llegar al color objetivo; el primero lo deja en color intermedio.
- [ ] Cada aterrizaje que avanza un cubo suma `15 × multiplicador`; aterrizar en un cubo ya completo no suma.
- [ ] Tres aterrizajes avanzando seguidos suben el multiplicador a ×2; doce, a ×5 (máximo).
- [ ] Aterrizar en un cubo completo, subirse a un disco o morir reinicia la racha a ×1 y el aro de la sombra vuelve a blanco.
- [ ] El aro de la sombra crece y cambia de color con el multiplicador.
- [ ] A los 7 s (nivel 1) un cubo con `step >= 1` parpadea en magenta durante 0,8 s y luego baja un paso con un destello.
- [ ] El cubo bajo Q\*bert nunca es elegido como víctima en el momento del aviso.
- [ ] Aterrizar en el cubo avisado antes de que termine el parpadeo cancela la corrupción.
- [ ] Si todos los cubos están en `step 0`, no hay víctima y el temporizador se reinicia sin efecto ni errores.
- [ ] La corrupción se detiene durante la pausa, el viaje en disco y la animación de muerte.
- [ ] En el nivel 1 solo aparecen bolas rojas; Coily empieza a aparecer en el nivel 2.
- [ ] Coily eclosiona en la fila más baja de la pirámide actual (fila 4 en nivel 1… fila 6 en nivel ≥3), no siempre en la 6.
- [ ] Los discos están a la altura de la fila 2 y funcionan igual con pirámides de 5, 6 y 7 filas; un disco se usa una vez.
- [ ] Subirse a un disco con Coily eclosionado lo hace caer y suma 500.
- [ ] Perder una vida conserva los `step` de los cubos, cancela el aviso en curso y reinicia el temporizador de corrupción.
- [ ] Completar todos los cubos suma `400 × nivel` más el bono de tiempo (`10` por segundo restante de 60) más 50 por disco sin usar.
- [ ] El nivel 2 trae una pirámide de 6 filas (21 cubos) y el nivel 3 una de 7 filas (28), siempre centradas verticalmente.
- [ ] Del nivel 1 al 10 la corrupción llega más seguido (7 s → 3 s) y Coily salta más rápido; de ahí en adelante no cambia.
- [ ] El HUD muestra 3 vidas al inicio y el nivel correcto; al llegar a 0 vidas se abre `FIN DEL JUEGO` con la puntuación real.
- [ ] El canvas no dibuja puntos, vidas, nivel, multiplicador numérico ni modal de game over.
- [ ] `PAUSA`/`REANUDAR`, `P` y `Escape` congelan y reanudan sin que el aviso de corrupción ni los saltos se adelanten.
- [ ] Con el canvas enfocado, las flechas no hacen scroll; escribir `W/A/S/D` en el campo de iniciales no mueve a Q\*bert.
- [ ] `JUGAR DE NUEVO` reinicia a nivel 1, 5 filas, 3 vidas y 0 puntos sin recargar.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'qbert'`; pulsarlo dos veces no inserta dos.
- [ ] La puntuación aparece en `/salon?juego=qbert` y `/juegos/qbert`; con `scores` vacía se ve el estado vacío.
- [ ] `score` nunca supera 1 000 000.
- [ ] Navegar fuera y volver no duplica el bucle; la pestaña en segundo plano no dispara varias corrupciones ni spawns al volver.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid`, `/jugar/snake` y `/jugar/frogger` se juegan igual que antes.
- [ ] La consola no muestra errores ni avisos de hidratación; `get_advisors` no reporta avisos nuevos.

---

## Decisiones

- **Sí:** tres estados por cubo (`0 → 1 → 2`). Es el cambio que obliga a planificar rutas; con dos
  pasos se resolvería como el Q\*bert clásico con más saltos.
- **Sí:** pirámide de 5 a 7 filas por nivel. Da arco de dificultad sin tocar las reglas, y baja el
  coste de aprender: el primer nivel tiene 15 cubos.
- **Sí:** la corrupción baja un paso y **no** revierte a 0. Un revert total castiga demasiado a una
  ruta larga; un paso hace que dos pasadas sigan valiendo.
- **Sí:** aviso de 800 ms cancelable. Sin aviso, la corrupción sería azar injusto; con aviso, es una
  decisión (¿corro a salvar ese cubo o sigo mi ruta?).
- **Sí:** la víctima nunca es el cubo bajo Q\*bert en el aviso ni uno ocupado por un enemigo. Evita
  corrupciones que parezcan un fallo visual.
- **Sí:** combo por racha de saltos que avanzan, con tope ×5. Premia las rutas limpias sin dejar que
  el multiplicador desborde el `check` de la tabla.
- **Sí:** indicador de combo como aro de la sombra, no como texto. El motor no pinta HUD, pero el
  jugador necesita ver su racha.
- **Sí:** quitar Slick. La corrupción ya revierte cubos; tener las dos cosas sería doble castigo.
- **Sí:** Coily solo desde el nivel 2 y bolas rojas desde el 1, para que el nivel inicial enseñe
  cubos de tres pasos y corrupción sin una serpiente encima.
- **Sí:** al perder una vida se cancelan avisos y se reinicia el temporizador de corrupción, para que
  nadie reaparezca con un cubo parpadeando a punto de bajar.
- **Sí:** bono de tiempo por nivel, con tope en 60 s. Recompensa la limpieza sin un cronómetro en
  pantalla.
- **Sí:** saturar `score` a 1 000 000.
- **No:** skins ni sonido, igual que la variante 01.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo                                                                                                  | Mitigación                                                                                                                         |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| La corrupción se siente injusta o invisible en un monitor pequeño.                                     | Aviso de 800 ms con parpadeo y contorno de 3 px, y cancelable; criterio de aceptación explícito de aviso visible.                  |
| Pirámide de 5 filas con discos en la fila 2: los discos quedan demasiado cerca de la cima.             | Los discos se alcanzan desde la fila 3, que existe siempre; la cima sigue a 3 saltos de un disco. Se valida visualmente en nivel 1. |
| Q\*bert queda sin víctima válida y el temporizador entra en bucle.                                      | Si no hay cubo elegible, se reinicia el temporizador sin efecto; criterio de aceptación para el caso de todos en `step 0`.          |
| El combo, el bono de tiempo y el tope de 1 000 000 chocan en partidas largas.                           | `SCORE_MAX` saturado en el motor y multiplicador máximo ×5.                                                                         |
| La pirámide cambia de tamaño y los enemigos o discos de un nivel anterior se quedan en celdas ilegales. | `initGame`/cambio de nivel vacía `enemies`, repone `discs` y recalcula `rows` antes de dibujar.                                    |
| Coily eclosiona en la fila 6 aunque la pirámide solo llegue a la 4.                                    | La fila de eclosión es `rows - 1`, no una constante; criterio de aceptación explícito.                                             |
| El BFS de Coily usa un grafo de 28 celdas fijo en una pirámide menor.                                  | El grafo se construye en `initGame` a partir de `rows`.                                                                            |
| Temporizadores de corrupción y spawn acumulados con la pestaña oculta.                                 | `dt` capado a 50 ms, `lastTime = null` al reanudar, y los temporizadores solo avanzan en `playing`.                                 |
| El mapa de flechas rotadas desorienta.                                                                  | Diagrama en el rótulo de espera y descripción en `controls`.                                                                       |
| WASD llega al motor mientras se escriben iniciales.                                                     | Bucle parado con el modal abierto y listeners en el canvas, no en `window`.                                                        |

---

## Lo que **no** entra en esta spec

- Slick, Sam, Ugg, Wrongway y cubos que revierten al pisarlos de nuevo.
- Power-ups, vidas extra y más de un tipo de corrupción.
- Cronómetro o multiplicador numérico dentro del canvas.
- Sprites, skins, sonido y botones táctiles propios.
- Modo dos jugadores.
- Tocar `lib/games.ts`, `lib/games/registry.ts` y la migración en esta fase: son del paso de promoción.
- Autenticación nueva o cambios en `scores.user_id`.

Cada una de ellas, si entra, va en su propia spec.
