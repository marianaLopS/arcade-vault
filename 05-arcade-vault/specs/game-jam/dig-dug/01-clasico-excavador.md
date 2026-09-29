# SPEC — DIG DUG: clásico excavador

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-09-29
> **Objetivo:** Diseñar un port fiel al Dig Dug de 1982 — un excavador que cava túneles en un subsuelo por estratos, hincha a los enemigos con una bomba de aire hasta reventarlos y aplasta a otros con rocas — como ficha nueva `dig-dug` en categoría `ARCADE`, con motor real y leaderboard en Supabase desde el primer día.

---

## Por qué existe esta spec

`game-suggestions-todo.md` propone `dig-dug` porque combina laberinto y habilidad como `gloton`, pero con
**terreno que se crea al jugar**: el laberinto no viene dado, lo abre el jugador cavando. Ninguno de los
juegos del catálogo tiene un mapa mutable de esa clase. `snake` y `arkanoid` juegan sobre un tablero fijo;
`asteroids` sobre vacío; `caida` sobre una grilla que solo se llena. Aquí la grilla empieza sólida y cada
paso del jugador la vacía.

No hay código de referencia: no existe carpeta de Dig Dug en `References/`. Como en Snake (SPEC 10), las
constantes de este documento **son** el diseño; cambiarlas durante la implementación es rediseñar, no
implementar. Todo se dibuja con primitivas de canvas (rectángulos, arcos y líneas), sin spritesheet.

Esta variante es la lectura **mínima y fiel** del arcade: túneles, Pooka y Fygar, bomba de aire y rocas
que caen. La segunda variante (`02-presion-y-filones.md`) cambia las reglas del terreno — la tierra vuelve
a cerrarse, el aire es finito y hay gemas enterradas — y no incluye rocas; esta se queda con el conjunto
original y ninguna capa extra.

---

## Alcance

**Dentro:**

- `lib/games/dig-dug/engine.ts`: motor nuevo con todo el estado en la clausura de `createDigDugGame`.
  Sin assets externos.
- Mundo lógico **600×720**: grilla de 15×18 celdas de 40 px. La fila 0 es la superficie (aire libre); las
  filas 1..17 son tierra en cuatro estratos de color.
- Terreno mutable: array plano de celdas cavadas. Cavar es gratuito e instantáneo al entrar en la celda.
- Jugador con movimiento celda a celda, orientado, que cava mientras se mueve.
- Bomba de aire: arpón de 3 celdas en la dirección en que mira el jugador; el enemigo enganchado se hincha
  con cada pulsación y revienta al cuarto estado.
- Dos enemigos: **Pooka** (cuerpo redondo, atraviesa tierra en modo fantasma) y **Fygar** (dragón, echa
  fuego en horizontal).
- Rocas: tres por nivel; caen cuando se vacía la celda inferior y aplastan a lo que haya debajo.
- Puntuación por profundidad del enemigo, bonus por rocas y bonus por Fygar reventado en horizontal.
- Último enemigo vivo huye a la superficie.
- Vidas: 3, y una vida extra al cruzar 20.000 puntos, una sola vez por partida.
- Progresión por nivel: más enemigos y más rápidos, con tope.
- Nueva ficha `dig-dug` en `lib/games.ts` (categoría `ARCADE`) y clase de portada `cover-dig-dug` en
  `app/globals.css`.
- Una línea `dig-dug` en `GAME_ENGINES` (`lib/games/registry.ts`).
- Migración `insert into public.games (id, title) values ('dig-dug', 'DIG DUG')` y su aplicación.

**Fuera de alcance (para specs futuras o para la variante `02`):**

- Aire finito, gemas, tierra que se regenera.
- Frutas o verduras bonus.
- Disposiciones de nivel distintas: el mapa de rocas y bolsillos es el mismo en todos los niveles.
- Modo de dos jugadores.
- Sonido.
- Controles táctiles.
- Skins (`clasico`/`neon`/`retro`).
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni tipo de plataforma nuevo.** `GameEngineEntry` existe desde la
SPEC 08; `scores` y `game_stats` sirven a este juego sin tocarlas y el leaderboard se enciende con una
fila en `games`.

Tipos locales del motor, sin exportar:

```ts
type Dir = "up" | "down" | "left" | "right";
type Cell = { col: number; row: number };
type Player = Cell & { dir: Dir; moving: number; alive: boolean }; // moving: ms restantes del paso
type EnemyKind = "pooka" | "fygar";
type EnemyMode = "walk" | "ghost" | "flee" | "hooked" | "crushed";
type Enemy = Cell & {
  kind: EnemyKind;
  dir: Dir;
  mode: EnemyMode;
  stage: 0 | 1 | 2 | 3; // estados de inflado; al cuarto bombeo revienta
  stepAccum: number; // ms hacia el siguiente paso
  ghostIn: number; // ms hasta el próximo modo fantasma (solo Pooka)
  fireAccum: number; // ms; Fygar: cuenta atrás de aviso/fuego/enfriamiento
};
type Rock = Cell & { state: "still" | "wobble" | "falling" | "broken"; timer: number; kills: number };
type Hook = { dir: Dir; len: number; target: Enemy | null }; // arpón activo o null
```

Estado en la clausura de `createDigDugGame`:

- `dug: boolean[]` — `COLS * ROWS` celdas, `índice = row * COLS + col`. `true` = túnel o aire.
- `player`, `enemies: Enemy[]`, `rocks: Rock[]`, `hook: Hook | null`.
- `score`, `lives`, `level`, `extraLifeGiven`.
- `inputQueue: Dir | null` (una dirección pendiente), `pumpPressed` (pulsación de bomba sin consumir),
  `hookCooldown`, `deflateAccum`, `respawnTimer`.
- `state: "playing" | "respawn" | "levelclear" | "gameover"`, `levelClearTimer`.
- Bucle: `rafId`, `lastTime`, `destroyed`. Entrada: `keys: Set<string>`.

**Estratos** (fila → valor base de un enemigo reventado a esa profundidad):

```
filas  1..4   estrato 0 · tierra ámbar     · 200
filas  5..9   estrato 1 · tierra naranja   · 300
filas 10..13  estrato 2 · tierra roja      · 400
filas 14..17  estrato 3 · tierra granate   · 500
```

**Disposición fija** (col, row), igual en todos los niveles:

```
START (7, 1) con (7, 0) y (7, 1) ya cavadas
BOLSILLOS (3 celdas horizontales cavadas, cada uno admite 2 enemigos, en sus extremos):
  B1 cols 2..4  row 5   · B2 cols 10..12 row 7  · B3 cols 2..4  row 11
  B4 cols 10..12 row 14 · B5 cols 6..8   row 9  · B6 cols 6..8  row 16
ROCAS: (4, 3) · (9, 5) · (12, 10)
```

---

## Plan de implementación

### 1. Constantes y terreno

`lib/games/dig-dug/engine.ts`, primera parte. Constantes de diseño:

```
W 600 · H 720 · CELL 40 · COLS 15 · ROWS 18
PLAYER_STEP_MS 110 · INPUT_BUFFER 1 (una dirección encolada)
POOKA_STEP_BASE 260 · FYGAR_STEP_BASE 280 · STEP_PER_LEVEL 12 · POOKA_STEP_MIN 140 · FYGAR_STEP_MIN 160
  paso(kind, level) = max(MIN, BASE - STEP_PER_LEVEL * (level - 1))
GHOST_EVERY_MIN 5000 · GHOST_EVERY_MAX 9000 · GHOST_TIME_MAX 1800 · GHOST_STEP_MS 340
FIRE_RANGE 3 · FIRE_TELEGRAPH 600 · FIRE_DURATION 500 · FIRE_COOLDOWN 2500
PUMP_RANGE 3 · HOOK_COOLDOWN 350 · PUMP_STAGES 4 · DEFLATE_MS 900
ROCK_WOBBLE_MS 600 · ROCK_FALL_MS 125 (por celda) · ROCK_BREAK_MS 500
FLEE_STEP_MS 300
RESPAWN_MS 1200 · LEVEL_CLEAR_MS 1500 · LIVES 3
POINTS_DIG 10 · FYGAR_HORIZONTAL_MULT 2
POINTS_ROCK_KILLS [1000, 2500, 4000]   (1, 2, 3 o más enemigos aplastados con la misma roca)
EXTRA_LIFE_AT 20000
DT_MAX 50
```

Enemigos por nivel: `pookas = min(6, 2 + ceil(level / 2))`, `fygars = min(4, 1 + floor(level / 2))`.
Nivel 1: 3 Pookas y 1 Fygar. Nivel 11 en adelante: 6 y 4 (tope).

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

`initLevel(level)`: `dug` a `false`, cava la fila 0 entera, cava `START`, cava los seis bolsillos, coloca las
tres rocas, reparte los enemigos alternando Fygar/Pooka por bolsillos B1..B6 (extremo izquierdo antes que
derecho), `ghostIn` aleatorio entre `GHOST_EVERY_MIN` y `GHOST_EVERY_MAX`, jugador en `START` mirando
`down`.

Comprobación: `npm run build` limpio.

### 2. Movimiento del jugador y cavado

- Movimiento **encajado a celda**: un paso dura `PLAYER_STEP_MS`, interpolado visualmente. La entrada se
  lee al terminar cada paso; una dirección pulsada durante el paso se guarda en `inputQueue` y se aplica
  al terminar (mismo criterio que la cola de giros de Snake, con longitud 1).
- Al empezar un paso, `player.dir` pasa a la dirección pedida aunque el paso no se pueda dar.
- Un paso es válido si la celda destino está dentro de la grilla y no contiene una roca en estado
  `still`, `wobble` ni `falling`. Cavar no cuesta nada: al **terminar** el paso, si la celda destino
  estaba sólida, `dug[índice] = true` y se suman `POINTS_DIG`.
- Entrar en una celda con un enemigo `walk` o `ghost` mata al jugador (paso 6). Un enemigo `hooked` con
  `stage >= 1` no mata al contacto: está hinchado e inofensivo.
- Mientras hay arpón activo (`hook != null`) el jugador no se mueve por sí mismo; pulsar una dirección
  **cancela el arpón** y esa misma pulsación no mueve al jugador.

Comprobación: `npm run build` limpio; la superficie es transitable y cada celda pisada queda vacía.

### 3. Bomba de aire

- `Espacio` con `hook == null` y `hookCooldown == 0` lanza el arpón: recorre celdas cavadas en la
  dirección de `player.dir`, hasta `PUMP_RANGE`. Se detiene en la primera celda sólida, en el borde de la
  grilla o en el primer enemigo que encuentre; si engancha, `hook.target` = ese enemigo y
  `enemy.mode = "hooked"`.
- Si no engancha nada, el arpón se retrae al instante y arranca `HOOK_COOLDOWN`.
- Con enemigo enganchado, cada nueva pulsación de `Espacio` (no mantenida: se consume `pumpPressed`) suma
  un estado: `stage++`. Al llegar a `PUMP_STAGES` (4) el enemigo revienta: se puntúa (paso 5) y se elimina.
- Si pasan `DEFLATE_MS` sin pulsación, `stage--`; al llegar a 0 el enemigo se suelta, vuelve a `walk` y el
  arpón se retira. Mantener `Espacio` pulsado **no** bombea: hay que pulsar cada vez.
- Un enemigo enganchado no se mueve ni ataca. Si otro enemigo o una roca lo desplaza o lo elimina, el
  arpón desaparece.

Comprobación: un Pooka a 3 celdas en línea se hincha con 4 pulsaciones y desaparece; a 4 celdas no engancha.

### 4. Enemigos

- **Pooka:** en `walk` avanza un paso cada `paso("pooka", level)` ms por celdas cavadas, persiguiendo la
  celda del jugador con el algoritmo simple «reduce la mayor de |Δcol| y |Δrow| si esa celda es
  transitable; si no, prueba el otro eje; si no, gira 90° o da la vuelta». Cuando `ghostIn` llega a 0
  entra en `ghost`: durante `GHOST_TIME_MAX` ms (o hasta llegar a una celda cavada) se mueve en línea
  recta hacia el jugador a `GHOST_STEP_MS`, atravesando tierra y cavando cada celda que pisa. Al volver a
  `walk`, `ghostIn` se recalcula aleatorio en el mismo rango, restando 300 ms por nivel con suelo de
  2500 ms.
- **Fygar:** se mueve como Pooka pero **nunca** entra en fantasma. Si está en la misma fila que el
  jugador a `FIRE_RANGE` celdas o menos y sin tierra entre ambos, inicia `FIRE_TELEGRAPH` ms parpadeando
  y después lanza fuego `FIRE_DURATION` ms sobre esas tres celdas cavadas en su dirección. El fuego mata
  al jugador que esté en ellas y no atraviesa tierra ni rocas. Luego `FIRE_COOLDOWN` ms sin volver a
  disparar.
- **Último enemigo:** cuando solo queda uno con vida y `mode == "walk"`, pasa a `flee`: se dirige a la
  celda de la fila 0 más cercana a `FLEE_STEP_MS`; al llegar sale y el nivel termina **sin puntos**.
  Engancharlo con el arpón interrumpe la huida y se puntúa normal.
- Los enemigos nunca entran en una celda con roca `still` ni `falling`.

Comprobación: un Fygar alineado a 3 celdas parpadea, luego echa fuego y el jugador muere; a 4 celdas no.

### 5. Rocas y puntuación

- Una roca `still` pasa a `wobble` cuando la celda inmediata inferior está cavada y libre de jugador.
  Tras `ROCK_WOBBLE_MS` pasa a `falling`; cae una celda cada `ROCK_FALL_MS` mientras la de abajo esté
  cavada, y se rompe (`broken`) al llegar a tierra sólida, a otra roca o al fondo. `broken` dura
  `ROCK_BREAK_MS` y luego desaparece, dejando su celda cavada.
- Cada enemigo cuya celda ocupe la roca en `falling` queda `crushed` (muere) y suma a `rock.kills`. Al
  romperse, se concede `POINTS_ROCK_KILLS[min(kills, 3) - 1]` si `kills >= 1`.
- Si la roca alcanza al jugador, este muere (paso 6). Si el jugador sale de la celda inferior durante el
  `wobble`, la roca cae igualmente.
- Puntos por enemigo reventado: `base(estrato de su fila)`. Si es un **Fygar** y el jugador está en su
  misma fila en el momento del reventón, `× FYGAR_HORIZONTAL_MULT`. Los enemigos que huyen y salen por
  arriba, o que mueren en `crushed`, no usan esta tabla.
- Vida extra: la primera vez que `score >= EXTRA_LIFE_AT`, `lives++` y `extraLifeGiven = true`.

Comprobación: aplastar 2 enemigos con una roca suma 2500; reventar a un Fygar en fila a profundidad 12
suma `400 × 2 = 800`.

### 6. Muerte, vidas y niveles

- Causas de muerte del jugador: contacto con enemigo activo, fuego de Fygar, roca en caída. `state`
  pasa a `respawn` durante `RESPAWN_MS`; `lives--`. Sin vidas → `gameover`, `stopLoop()` y `onGameOver(score)`
  una sola vez.
- Al reaparecer: jugador en `START`, arpón cancelado, enemigos vivos devueltos a su bolsillo de origen en
  modo `walk` con `stage = 0`, rocas en `broken` eliminadas y `still`/`wobble` en su sitio.
- Todos los enemigos muertos o huidos → `levelclear` durante `LEVEL_CLEAR_MS` sin daño posible; luego
  `level++` e `initLevel(level)`.

Comprobación: perder las tres vidas abre el modal de fin de juego una sola vez.

### 7. Bucle, entrada y dibujo

- `emit()` con `lastScore` / `lastLives` / `lastLevel`; `onLives(3)` al empezar.
- `draw()`: cielo y hierba en la fila 0; tierra por estratos con un ligero motivo de grano; túneles en
  negro; jugador (cuerpo blanco y azul, casco), Pooka rojo con gafas, Fygar verde con cola, hinchazón
  con `escala = 1 + 0.25 * stage`; arpón como línea con punta; rocas grises con sombra; fuego naranja.
  Sin puntos, nivel ni vidas en el canvas.
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
`"dig-dug": { create: createDigDugGame, width: 600, height: 720, controls: "flechas o WASD para cavar, espacio para bombear" }`.

`lib/games.ts`: ficha `id: "dig-dug"`, `title: "DIG DUG"`, `cat: "ARCADE"`, `cover: "cover-dig-dug"`,
`color: "cyan"`, `best: 0`, `plays: "0"`, con `short` y `long` en el tono de las demás.
`app/globals.css`: `cover-dig-dug` con bloques de tierra en capas y un túnel.

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
- [ ] `/jugar/dig-dug` muestra un canvas de 600×720 con superficie, cuatro estratos de tierra, jugador,
      enemigos y tres rocas.
- [ ] El jugador se mueve una celda cada 110 ms y deja un túnel negro a su paso.
- [ ] Una segunda dirección pulsada durante un paso se aplica al terminar ese paso.
- [ ] `Espacio` a 3 celdas de un enemigo alineado y sin tierra entre medias lo engancha; a 4 celdas o con
      tierra en medio no.
- [ ] Cuatro pulsaciones de `Espacio` revientan al enemigo; mantener `Espacio` no lo revienta.
- [ ] Sin pulsar durante 900 ms el enemigo pierde un estado de inflado; al llegar a 0 queda libre.
- [ ] Pulsar una flecha con el arpón activo lo cancela sin mover al jugador.
- [ ] Reventar un enemigo en las filas 1..4 suma 200, en las 5..9 suma 300, en las 10..13 suma 400 y en
      las 14..17 suma 500.
- [ ] Reventar un Fygar estando el jugador en su misma fila suma el doble.
- [ ] Un Pooka entra en modo fantasma cada 5-9 s, atraviesa tierra y deja túnel tras de sí.
- [ ] Un Fygar alineado a 3 celdas parpadea 600 ms y luego echa fuego 500 ms; el fuego no cruza tierra.
- [ ] Una roca sobre una celda recién cavada tiembla 600 ms, cae y se rompe al tocar tierra sólida.
- [ ] Aplastar 1, 2 y 3 enemigos con una roca suma 1000, 2500 y 4000 respectivamente.
- [ ] Una roca que cae sobre el jugador le quita una vida.
- [ ] Con un único enemigo vivo, este huye a la superficie y el nivel termina sin puntos por él.
- [ ] Morir devuelve al jugador a la salida y a los enemigos vivos a sus bolsillos; el nivel no se reinicia.
- [ ] El nivel 1 tiene 3 Pookas y 1 Fygar; el nivel 2 tiene 4 Pookas y 2 Fygars.
- [ ] El HUD muestra 3 vidas al empezar y una vida extra al pasar de 20.000 puntos, solo una vez.
- [ ] Perder la última vida abre el modal `FIN DEL JUEGO` con la puntuación real y una sola vez.
- [ ] El canvas no dibuja puntos, nivel ni vidas, ni ningún overlay de game over.
- [ ] `PAUSA` congela el juego, incluidos rocas y fuego, y `REANUDAR` lo reanuda sin saltos.
- [ ] `P` y `Escape` hacen lo mismo que el botón.
- [ ] Con el canvas enfocado, ni flechas ni espacio hacen scroll.
- [ ] Escribir `W`, `A`, `S`, `D` o espacio en el campo de iniciales no mueve ni bombea.
- [ ] `JUGAR DE NUEVO` reinicia a nivel 1, 0 puntos y 3 vidas sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'dig-dug'`; dos pulsaciones
      seguidas no insertan dos filas.
- [ ] Esa puntuación aparece en `/salon?juego=dig-dug` y en `/juegos/dig-dug`.
- [ ] Navegar a otra ruta y volver no duplica el bucle.
- [ ] Volver de una pestaña en segundo plano no avanza a nadie más de un paso de golpe.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid`, `/jugar/snake` y `/jugar/frogger` se
      juegan igual que antes.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/dig-dug`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** `game-id` `dig-dug`, con guion, siguiendo el slug de `duelo-pixel`. Título `DIG DUG`.
- **Sí:** categoría `ARCADE`. `SHOOTER` promete disparo libre, y aquí el arma es un arpón de alcance 3.
- **Sí:** movimiento encajado a celda con interpolación visual. Hace el cavado, la alineación del arpón y
  el fuego de Fygar deterministas y verificables, y encaja con el estilo de ticks de Snake.
- **No:** movimiento libre en píxeles. Complicaría alinear el arpón y decidir qué celdas se cavan.
- **Sí:** cavar es gratuito y da `POINTS_DIG`. Recompensa abrir terreno nuevo sin exigir un contador.
- **Sí:** bombeo por pulsación, no mantenido. Es el rasgo de habilidad del original y evita que un dedo
  pegado a la tecla resuelva el juego.
- **Sí:** el enemigo enganchado es inofensivo. Sin esto, bombear a bocajarro sería suicida.
- **Sí:** Pooka con fantasma temporizado y Fygar sin él. Dos amenazas distintas: una que ignora el
  terreno, otra que lo respeta y lo usa como cobertura.
- **Sí:** mapa fijo entre niveles. La dificultad sube por cantidad y velocidad, no por diseño de nivel.
- **No:** frutas bonus. Otra spec si llegan.
- **Sí:** un solo `extraLifeGiven`. Un umbral repetido haría inestable la duración de las partidas.
- **Sí:** el último enemigo huye. Evita partidas atascadas persiguiendo a uno solo.
- **Sí:** el motor no dibuja puntos, vidas ni nivel; el HUD de React ya los muestra.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo                                                                                   | Mitigación                                                                                          |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Sin original, la IA de Pooka atasca a un enemigo en un rincón del túnel.                 | Regla de persecución con giro de 90° y vuelta atrás; el modo fantasma rompe cualquier bloqueo.      |
| Una roca cae justo al salir el jugador y parece injusta.                                 | `ROCK_WOBBLE_MS` de 600 ms con animación visible antes de caer.                                     |
| Fuego de Fygar que atraviesa rocas o tierra por un error de índice.                      | El fuego se recorta celda a celda con la misma función que el arpón; criterio de aceptación propio. |
| Arpón y bombeo compiten con la cola de dirección y cancelan el arpón sin querer.         | Mientras hay arpón solo una flecha lo cancela; `pumpPressed` es un flag aparte de `inputQueue`.     |
| El último enemigo huye por una celda cerrada y no llega a la superficie.                 | La huida recalcula ruta cada paso y, si no hay túnel, cava como en fantasma.                        |
| WASD o espacio llegan al motor mientras se escriben iniciales.                           | Bucle parado con el modal abierto y listeners en el canvas, no en `window`.                         |
| Pestaña en segundo plano: los acumuladores de enemigos disparan muchos pasos al volver.  | `dt` capado a 50 ms y `lastTime = null` al reanudar.                                                |
| Cambiar de nivel con `dug` reiniciado deja referencias a celdas de rocas del nivel anterior. | `initLevel` reconstruye `dug`, `rocks`, `enemies` y `hook` por completo.                        |

---

## Lo que **no** entra en esta spec

- Aire finito, gemas o tierra que se regenera (variante `02-presion-y-filones.md`).
- Frutas o verduras bonus.
- Disposiciones de nivel distintas.
- Dos jugadores.
- Sonido.
- Controles táctiles.
- Skins.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
