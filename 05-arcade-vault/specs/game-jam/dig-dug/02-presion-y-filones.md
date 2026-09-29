# SPEC — DIG DUG: presión y filones

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-09-29
> **Objetivo:** Diseñar una variante de Dig Dug donde el subsuelo **no perdona**: los túneles se cierran solos con el tiempo, el aire de la bomba es un depósito finito que hay que reponer, y el subsuelo esconde gemas y burbujas de aire que obligan a bajar a por ellas — como ficha nueva `dig-dug` en categoría `ARCADE`, con motor real y leaderboard en Supabase desde el primer día.

---

## Por qué existe esta spec

La variante `01-clasico-excavador.md` es el arcade original: un mapa que solo se vacía, aire ilimitado y
rocas como peligro ambiental. Funciona, pero deja una vez abierto un túnel el terreno fijo para siempre, y
la partida se resuelve casi siempre con el mismo gesto: cavar hasta el enemigo y bombear.

Esta variante cambia las **reglas del terreno y del arma**, no el género:

- **La tierra vuelve a cerrarse.** Un túnel que el jugador deja atrás se rellena a los 9 segundos. Los
  enemigos que siguen dentro quedan enterrados. Cavar deja de ser un gasto único y pasa a ser presión de
  tiempo: hay que usar los túneles antes de que se cierren.
- **El aire es finito.** La bomba consume un depósito de 16 unidades que solo se repone recogiendo burbujas
  enterradas o subiendo a la superficie. Reventar enemigos sin pensar deja al jugador sin arma a
  mitad del subsuelo.
- **Hay gemas enterradas** a distinta profundidad. Recogerlas puntúa más que reventar enemigos poco
  profundos y obliga a bajar aunque el peligro crezca con la profundidad.

Las **rocas del original desaparecen**: el cierre del terreno ya cumple la función de peligro y de arma
ambiental, y tener las dos cosas haría ilegible el mapa. Como en la variante 01 y en Snake (SPEC 10), no
hay código de referencia: las constantes son el diseño; cambiarlas durante la implementación es
rediseñar. Todo se dibuja con primitivas de canvas.

Ambas variantes usan el mismo `game-id` (`dig-dug`) y son **excluyentes**: si el usuario elige una, la otra
queda descartada o se archiva. La comparten en mundo, grilla, jugador, arpón, enemigos base y
estratos; difieren en el terreno, el arma y la puntuación.

---

## Alcance

**Dentro:**

- `lib/games/dig-dug/engine.ts`: motor nuevo con todo el estado en la clausura de `createDigDugGame`.
  Sin assets externos.
- Mundo lógico **600×720**: grilla de 15×18 celdas de 40 px; fila 0 superficie, filas 1..17 tierra en
  cuatro estratos (mismos rangos y valores base que la variante 01).
- **Regeneración de tierra:** cada celda cavada por movimiento (del jugador o de un Pooka fantasma) se
  cierra `REGROW_MS` después de que el jugador la abandone. Aviso visual previo.
- **Enterrado:** un enemigo dentro de una celda que se cierra muere y puntúa.
- **Depósito de aire:** 16 unidades. Lanzar el arpón cuesta 1; cada bombeo, 1. Se repone con burbujas
  (`+8`) y en la superficie (`+1` cada 400 ms).
- **Gemas:** 6 por nivel, con valor por estrato y bonus por recogerlas todas.
- **Burbujas de aire:** 5 por nivel, enterradas.
- Pooka (con fantasma) y Fygar (con fuego), con las reglas de la variante 01.
- Último enemigo vivo huye a la superficie.
- Vidas: 3; una vida extra al cruzar 20.000 puntos, una sola vez.
- Progresión por nivel: más enemigos y más rápidos, con topes más bajos que en la variante 01.
- Nueva ficha `dig-dug` en `lib/games.ts` (categoría `ARCADE`) y clase de portada `cover-dig-dug`.
- Una línea `dig-dug` en `GAME_ENGINES`.
- Migración `insert into public.games (id, title) values ('dig-dug', 'DIG DUG')` y su aplicación.

**Fuera de alcance (para specs futuras):**

- Rocas que caen.
- Frutas o verduras bonus.
- Disposiciones de nivel distintas: gemas, burbujas y bolsillos son los mismos en todos los niveles.
- Mejoras compradas o persistentes entre partidas.
- Modo de dos jugadores.
- Sonido.
- Controles táctiles.
- Skins.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni tipo de plataforma nuevo.** `scores` y `game_stats` sirven a
este juego sin tocarlas y el leaderboard se enciende con una fila en `games`.

Tipos locales del motor, sin exportar:

```ts
type Dir = "up" | "down" | "left" | "right";
type Cell = { col: number; row: number };
type Player = Cell & { dir: Dir; moving: number; alive: boolean };
type EnemyKind = "pooka" | "fygar";
type EnemyMode = "walk" | "ghost" | "flee" | "hooked";
type Enemy = Cell & {
  kind: EnemyKind;
  dir: Dir;
  mode: EnemyMode;
  stage: 0 | 1 | 2 | 3;
  stepAccum: number;
  ghostIn: number;
  fireAccum: number;
};
type Hook = { dir: Dir; len: number; target: Enemy | null };
type Pickup = Cell & { kind: "gem" | "air"; taken: boolean };
```

Estado en la clausura de `createDigDugGame`:

- `dug: boolean[]` — `COLS * ROWS`, `índice = row * COLS + col`. `true` = celda abierta.
- `regrow: number[]` — misma longitud; ms restantes hasta que la celda se cierra. `-1` = celda
  permanente o sin cuenta atrás activa.
- `player`, `enemies`, `hook`, `pickups: Pickup[]`.
- `tank` (0..`TANK_MAX`), `tankFlash` (ms de parpadeo rojo del indicador), `surfaceAccum` (ms).
- `score`, `lives`, `level`, `extraLifeGiven`, `gemsTaken`.
- `inputQueue`, `pumpPressed`, `hookCooldown`, `deflateAccum`, `respawnTimer`.
- `state: "playing" | "respawn" | "levelclear" | "gameover"`, `levelClearTimer`.
- Bucle: `rafId`, `lastTime`, `destroyed`. Entrada: `keys: Set<string>`.

**Estratos** (fila → valor base de un enemigo reventado):

```
filas  1..4   estrato 0 · ámbar    · 200      gema 100
filas  5..9   estrato 1 · naranja  · 300      gema 200
filas 10..13  estrato 2 · rojo     · 400      gema 300
filas 14..17  estrato 3 · granate  · 500      gema 400
```

**Disposición fija** (col, row), igual en todos los niveles:

```
START (7, 1) con (7, 0) y (7, 1) ya cavadas
BOLSILLOS (permanentes; 3 celdas horizontales, 2 enemigos por bolsillo en los extremos):
  B1 cols 2..4 row 5 · B2 cols 10..12 row 7 · B3 cols 2..4 row 11
  B4 cols 10..12 row 14 · B5 cols 6..8 row 9 · B6 cols 6..8 row 16
GEMAS:     (1, 2) · (13, 3) · (4, 7) · (8, 12) · (13, 13) · (2, 16)
BURBUJAS:  (7, 4) · (1, 9) · (13, 9) · (4, 13) · (9, 15)
```

Gemas y burbujas están **dentro de tierra sólida**: no hay túnel hasta ellas. Se ven en el mapa (brillo
tenue) para que el jugador pueda planear la ruta.

---

## Plan de implementación

### 1. Constantes y terreno

`lib/games/dig-dug/engine.ts`, primera parte. Constantes de diseño:

```
W 600 · H 720 · CELL 40 · COLS 15 · ROWS 18
PLAYER_STEP_MS 110 · INPUT_BUFFER 1
POOKA_STEP_BASE 260 · FYGAR_STEP_BASE 280 · STEP_PER_LEVEL 12 · POOKA_STEP_MIN 150 · FYGAR_STEP_MIN 170
GHOST_EVERY_MIN 4000 · GHOST_EVERY_MAX 8000 · GHOST_TIME_MAX 1800 · GHOST_STEP_MS 340
FIRE_RANGE 3 · FIRE_TELEGRAPH 600 · FIRE_DURATION 500 · FIRE_COOLDOWN 2500
PUMP_RANGE 3 · HOOK_COOLDOWN 350 · PUMP_STAGES 4 · DEFLATE_MS 900
REGROW_MS 9000 · REGROW_WARN 1500
TANK_MAX 16 · SHOT_COST 1 · PUMP_COST 1 · AIR_REFILL 8 · SURFACE_REFILL_MS 400 · TANK_FLASH_MS 300
GEMS_PER_LEVEL 6 · GEM_CLEAR_BONUS 2000 · ENTOMB_MULT 1.5 · FYGAR_HORIZONTAL_MULT 2
POINTS_DIG 0
FLEE_STEP_MS 300 · RESPAWN_MS 1200 · LEVEL_CLEAR_MS 1500 · LIVES 3
EXTRA_LIFE_AT 20000 · DT_MAX 50
```

`paso(kind, level) = max(MIN, BASE - STEP_PER_LEVEL * (level - 1))`. Enemigos por nivel:
`pookas = min(5, 2 + ceil(level / 2))`, `fygars = min(3, 1 + floor(level / 2))`. Nivel 1: 3 Pookas y
1 Fygar; tope desde el nivel 7: 5 y 3.

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

`initLevel(level)`: `dug` y `regrow` a `false` / `-1`, cava fila 0, `START` y los seis bolsillos
(permanentes: `regrow = -1` y sin marca de cierre), coloca gemas y burbujas, reparte enemigos alternando
Fygar/Pooka por B1..B6, `tank = TANK_MAX`, `gemsTaken = 0`, jugador en `START` mirando `down`.

Comprobación: `npm run build` limpio.

### 2. Movimiento, cavado y recogida

- Movimiento encajado a celda con paso de `PLAYER_STEP_MS` y cola de una dirección, igual que la
  variante 01. Cavar es gratuito (`POINTS_DIG 0`, ver Decisiones).
- Al **terminar** un paso hacia una celda sólida de las filas 1..17: `dug = true` y `regrow = REGROW_MS`.
  Mientras el jugador esté dentro o a mitad de paso hacia una celda, la cuenta de esa celda se mantiene en
  `REGROW_MS`; al salir, empieza a bajar.
- Las celdas de superficie (fila 0), `START` y los bolsillos **no se cierran nunca**.
- Si el destino tiene una gema: `taken = true`, `gemsTaken++`, se suma `gema(estrato)`. Si recoge la sexta,
  `+GEM_CLEAR_BONUS` y `tank = TANK_MAX`.
- Si el destino tiene una burbuja: `taken = true`, `tank = min(TANK_MAX, tank + AIR_REFILL)`.
- El jugador **nunca** queda aplastado por el cierre: la celda que ocupa no cuenta atrás.

Comprobación: dejar un túnel y esperar 9 s lo rellena por completo desde el extremo más antiguo; una gema
recogida suma 100/200/300/400 según su estrato.

### 3. Cierre del terreno y enterrado

- Cada `dt`, toda celda con `regrow > 0` y sin jugador dentro resta `dt`. Con `regrow <= REGROW_WARN` se
  dibuja parpadeando en el color del estrato.
- Al llegar a 0 la celda pasa a `dug = false`, `regrow = -1`.
- Si esa celda contiene un enemigo en `walk`, `hooked` o `flee`: **enterrado**, muere, se elimina y suma
  `floor(base(estrato) * ENTOMB_MULT)`: 300, 450, 600, 750. Si estaba enganchado, el arpón desaparece.
- Un enemigo en `ghost` no se entierra: estar en tierra es su estado normal.
- Si el arpón atraviesa una celda que se cierra, se retrae; el enemigo enganchado sigue enganchado solo si
  su propia celda sigue abierta.

Comprobación: un Pooka que queda en un tramo abandonado muere a los 9 s exactos con su puntuación.

### 4. Depósito de aire y bomba

- Lanzar el arpón exige `tank >= SHOT_COST`. Cada bombeo con enemigo enganchado exige `tank >= PUMP_COST`.
  Sin aire no ocurre nada, y `tankFlash = TANK_FLASH_MS` para que el indicador parpadee en rojo.
- Lanzar cuesta 1 aunque el arpón no enganche. Cada bombeo cuesta 1. Reventar un enemigo cuesta por tanto
  `1 + 4 = 5` unidades: un depósito lleno da tres reventones completos y un lanzamiento de sobra.
- Recoger burbuja: `+AIR_REFILL`, tope `TANK_MAX`.
- Con el jugador en la fila 0, cada `SURFACE_REFILL_MS` ms suma 1 unidad hasta el tope.
- El alcance, el enganche, el inflado, el desinflado y la cancelación con flecha son idénticos a los de
  la variante 01 (`PUMP_RANGE 3`, `PUMP_STAGES 4`, `DEFLATE_MS 900`). Un enemigo que se desinfla
  por falta de aire no se reinfla.

Comprobación: con `tank = 0`, `Espacio` no lanza el arpón y el indicador parpadea; recoger una burbuja
sube exactamente 8.

### 5. Enemigos

Iguales a la variante 01 salvo por lo siguiente:

- Pooka: `ghostIn` entre `GHOST_EVERY_MIN` y `GHOST_EVERY_MAX` (4-8 s), porque los túneles se cierran y
  necesita cruzar tierra con más frecuencia. Las celdas que cava en fantasma entran en `regrow`
  con `REGROW_MS` desde el momento en que las pisa, exista o no jugador cerca.
- Fygar: fuego con las mismas reglas de alineación, alcance y enfriamiento. El fuego se recorta contra
  las celdas **actualmente** abiertas: si una celda se cierra durante el fuego, deja de pasar por ella.
- Último enemigo vivo: huye a la superficie a `FLEE_STEP_MS` cavando a su paso si el túnel se ha cerrado.
  Si lo entierra un cierre durante la huida, muere y puntúa como enterrado.
- Puntos por reventar: `base(estrato)`; Fygar en la fila del jugador `× FYGAR_HORIZONTAL_MULT`.
  Se aplica antes que cualquier otro multiplicador.

Comprobación: un Fygar alineado a 3 celdas echa fuego; si entre ambos se cierra una celda mientras dura el
fuego, el jugador no muere.

### 6. Muerte, vidas y niveles

- Causas de muerte: contacto con enemigo `walk` o `ghost`, o fuego. No hay rocas ni aplastamiento.
- `state = respawn` durante `RESPAWN_MS`; `lives--`. Sin vidas → `gameover`, `stopLoop()` y
  `onGameOver(score)` una sola vez.
- Al reaparecer: jugador en `START` con `tank` intacto (no se rellena: perder una vida no repone aire),
  arpón cancelado, enemigos vivos devueltos a su bolsillo en `walk` con `stage = 0`, `regrow` de todas las
  celdas no permanentes reiniciado a `REGROW_MS` **para las celdas abiertas** (no se pierde el terreno por
  morir), gemas y burbujas recogidas siguen recogidas.
- Todos los enemigos muertos o huidos → `levelclear` durante `LEVEL_CLEAR_MS`; luego `level++` e
  `initLevel(level)` (el depósito se rellena solo al empezar nivel).
- Vida extra al primer `score >= EXTRA_LIFE_AT`.

Comprobación: perder las tres vidas abre el modal una sola vez; morir con 2 unidades de aire reaparece con 2.

### 7. Bucle, entrada y dibujo

- `emit()` con `lastScore` / `lastLives` / `lastLevel`; `onLives(3)` al empezar.
- `draw()`: fila 0 como cielo y hierba; tierra por estratos; túneles en negro; celdas a punto de cerrarse
  parpadeando en el color de su estrato; gemas como rombos brillantes, burbujas como círculos azules;
  jugador, Pooka rojo con gafas, Fygar verde con cola, hinchazón con `escala = 1 + 0.25 * stage`; arpón y
  fuego.
- **El depósito de aire se dibuja dentro del canvas**, como una barra de 200×14 px en la fila 0
  (`x 16..216`, `y 13..27`), porque no existe callback de plataforma para él y ampliar `GameCallbacks`
  queda fuera de esta spec. Parpadea en rojo `TANK_FLASH_MS` ms cuando se intenta usar sin aire. No dibuja
  puntos, vidas ni nivel.
- `dt` capado a `DT_MAX`; `lastTime = null` al reanudar.
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`, `KeyD`, `Space`.
  `preventDefault()` solo para esas.
- Listeners `keydown` / `keyup` / `blur` sobre el canvas, nunca sobre `window`. `P` y `Escape` no llegan
  al motor. `blur` limpia `keys` y `pumpPressed`.
- `restart()`: detiene el bucle, `score = 0`, `lives = 3`, `level = 1`, `extraLifeGiven = false`,
  `initLevel(1)`, `emit()` y arranca.
- `destroy()` cancela el frame, quita los listeners y es idempotente. `initLevel(1); draw();` antes de
  devolver.

Comprobación: `npm run build` limpio.

### 8. Registrar y dar de alta

`lib/games/registry.ts`:
`"dig-dug": { create: createDigDugGame, width: 600, height: 720, controls: "flechas o WASD para cavar, espacio para bombear aire" }`.

`lib/games.ts`: ficha `id: "dig-dug"`, `title: "DIG DUG"`, `cat: "ARCADE"`, `cover: "cover-dig-dug"`,
`color: "cyan"`, `best: 0`, `plays: "0"`. `app/globals.css`: `cover-dig-dug` con estratos de tierra, una
gema y un túnel a medio cerrar.

`supabase/migrations/<timestamp>_juego_dig_dug.sql`, con timestamp posterior a `20260927130000`:

```sql
insert into public.games (id, title) values ('dig-dug', 'DIG DUG');
```

Se aplica con `apply_migration` del MCP. Los tipos no se regeneran.

Comprobación: `/jugar/dig-dug` pinta el canvas real; `select * from public.games` incluye `dig-dug`.

### 9. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos y recorrido manual de los
criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/dig-dug` muestra un canvas de 600×720 con superficie, cuatro estratos, jugador, enemigos,
      6 gemas, 5 burbujas y la barra de aire; no hay rocas.
- [ ] El jugador se mueve una celda cada 110 ms y deja un túnel abierto.
- [ ] Un túnel cavado y abandonado empieza a parpadear a los 7,5 s y se cierra a los 9 s.
- [ ] La celda que ocupa el jugador no se cierra nunca mientras está dentro.
- [ ] Fila 0, `START` y los bolsillos no se cierran nunca.
- [ ] Un enemigo `walk` dentro de una celda que se cierra muere y suma 300, 450, 600 o 750 según el estrato.
- [ ] Un Pooka en fantasma dentro de tierra no muere cuando se cierra la celda.
- [ ] La partida empieza con 16 unidades de aire; lanzar el arpón cuesta 1 y cada bombeo cuesta 1.
- [ ] Reventar un enemigo enganchado a la primera consume 5 unidades.
- [ ] Con 0 unidades, `Espacio` no lanza el arpón y la barra parpadea en rojo 300 ms.
- [ ] Recoger una burbuja suma 8 unidades, sin pasar de 16.
- [ ] En la superficie el aire sube 1 unidad cada 400 ms.
- [ ] Una gema suma 100, 200, 300 o 400 según el estrato de su fila.
- [ ] Recoger las 6 gemas suma 2000 extra y rellena el depósito.
- [ ] Reventar un Fygar en la misma fila que el jugador suma el doble de su valor base.
- [ ] El fuego de Fygar deja de atravesar una celda que se ha cerrado durante los 500 ms de fuego.
- [ ] Con un único enemigo vivo, este huye a la superficie y el nivel termina sin puntos por él.
- [ ] Morir devuelve al jugador a la salida con el aire que tenía y conserva las gemas ya recogidas.
- [ ] El nivel 1 tiene 3 Pookas y 1 Fygar; el nivel 2 tiene 4 Pookas y 2 Fygars.
- [ ] Empezar un nivel nuevo repone el depósito a 16.
- [ ] El HUD muestra 3 vidas al empezar y una vida extra al pasar de 20.000 puntos, solo una vez.
- [ ] Perder la última vida abre el modal `FIN DEL JUEGO` con la puntuación real y una sola vez.
- [ ] El canvas no dibuja puntos, nivel ni vidas, ni ningún overlay de game over; solo la barra de aire.
- [ ] `PAUSA` congela el juego, incluidas las cuentas atrás de cierre, y `REANUDAR` no las hace saltar.
- [ ] `P` y `Escape` hacen lo mismo que el botón.
- [ ] Con el canvas enfocado, ni flechas ni espacio hacen scroll.
- [ ] Escribir `W`, `A`, `S`, `D` o espacio en el campo de iniciales no mueve ni bombea.
- [ ] `JUGAR DE NUEVO` reinicia a nivel 1, 0 puntos, 3 vidas y 16 de aire sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'dig-dug'`; dos pulsaciones
      seguidas no insertan dos filas.
- [ ] Esa puntuación aparece en `/salon?juego=dig-dug` y en `/juegos/dig-dug`.
- [ ] Navegar a otra ruta y volver no duplica el bucle.
- [ ] Los demás juegos con motor se juegan igual que antes.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/dig-dug`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** cerrar la tierra a los 9 s. Menos y el jugador no llega a usar sus túneles; más y la mecánica no
  se nota. 9 s equivalen a unas 80 celdas de paso del jugador.
- **Sí:** el jugador nunca queda enterrado. Sería una muerte sin contrapartida jugable: el cierre existe
  para castigar a los enemigos y presionar rutas, no para matar al jugador.
- **Sí:** bolsillos, `START` y superficie permanentes, para que los enemigos no mueran nada más aparecer.
- **Sí:** enterrado vale `1.5 ×` el valor base. Pagar más que un reventón de bomba compensa que
  no cueste aire, pero menos que un Fygar horizontal.
- **Sí:** aire finito de 16 unidades. Con 5 por reventón, el depósito lleno da tres muertes limpias y obliga
  a recoger burbujas o subir.
- **Sí:** gemas y burbujas visibles dentro de tierra sólida. Descubrirlas al azar sería frustrante en un
  juego de reflejos.
- **Sí:** `POINTS_DIG 0`. Con regeneración, puntuar por cavar permitiría cavar y recavar la misma celda
  indefinidamente para sumar puntos.
- **Sí:** morir no repone aire; solo lo hace empezar nivel. Evita usar la muerte como recarga.
- **No:** rocas. Dos peligros ambientales a la vez volverían ilegible el mapa.
- **Sí:** dibujar la barra de aire en el canvas. No hay callback para ella y ampliar `GameCallbacks`
  afectaría a todos los juegos. Si se aprueba la variante, un `onGauge` de plataforma sería otra spec.
- **Sí:** topes de enemigos más bajos (5 Pookas y 3 Fygars) que en la variante 01; el aire limitado hace
  que más enemigos simultáneos sean irresolubles.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo                                                                                       | Mitigación                                                                                            |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| El cierre de celdas deja al jugador aislado de la superficie y sin aire, sin salida.         | Cavar es gratuito: siempre puede abrirse paso; la superficie recarga; el depósito nunca bloquea moverse. |
| El depósito vacío sin burbujas cercanas produce una partida imposible.                       | Cinco burbujas fijas repartidas por estratos y recarga en superficie a 400 ms/unidad.                 |
| Los enemigos quedan enterrados sin que el jugador intervenga y la partida se vuelve trivial. | `ENTOMB_MULT` paga poco más que la bomba, los bolsillos no se cierran y los Pooka cruzan en fantasma. |
| Cuentas atrás por celda: 270 celdas actualizándose cada frame afectan al rendimiento.        | Solo se procesan celdas con `regrow > 0`; se lleva una lista de celdas activas.                       |
| La barra de aire dentro del canvas rompe la norma de «sin HUD dentro del motor».             | Se documenta como excepción; no hay callback y el resto del HUD sigue en React.                       |
| Explotar la regeneración para recavar gemas o puntos.                                        | Las gemas se marcan `taken` y `POINTS_DIG` es 0.                                                      |
| Un cierre y un reventón ocurren en el mismo frame y puntúan dos veces al mismo enemigo.      | Un enemigo se elimina en un único punto del bucle, con un flag `dead` que lo saca del resto de comprobaciones. |
| WASD o espacio llegan al motor mientras se escriben iniciales.                               | Bucle parado con el modal abierto y listeners en el canvas, no en `window`.                           |
| Pestaña en segundo plano: cuentas atrás de cierre saltan y entierran a todos.                | `dt` capado a 50 ms y `lastTime = null` al reanudar.                                                  |

---

## Lo que **no** entra en esta spec

- Rocas que caen.
- Frutas o verduras bonus.
- Ampliar `GameCallbacks` con un callback de indicador.
- Mejoras persistentes entre partidas.
- Disposiciones de nivel distintas.
- Dos jugadores.
- Sonido.
- Controles táctiles.
- Skins.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
