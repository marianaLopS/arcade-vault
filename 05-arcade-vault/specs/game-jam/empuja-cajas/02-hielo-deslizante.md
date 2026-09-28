# SPEC — EMPUJA CAJAS: hielo deslizante

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-09-28
> **Objetivo:** Diseñar `empuja-cajas` con casillas de hielo — el jugador y las cajas que
> aterrizan sobre hielo se deslizan hasta la primera casilla firme o hasta chocar — como
> segunda variante de puzzle de trayectoria sobre el mismo Sokoban base de `01-clasico.md`.

---

## Por qué existe esta spec

Esta es la segunda variante de diseño para `empuja-cajas`, junto a
`specs/game-jam/empuja-cajas/01-clasico.md`. Comparte con ella el género (puzzle de lógica
pura, sin enemigos ni límite de tiempo, sobre niveles fijos), el mundo lógico de 640×600 con
área de tablero de 560×560 y panel lateral de 80×600, el contrato `GameEngine`, el formato de
nivel en notación Sokoban y el esquema de controles (flechas o WASD para mover, `Z` para
deshacer, `R` para reiniciar nivel). Nada de eso cambia entre variantes, tal y como exige el
diseño compartido.

Lo que cambia es el eje central del rompecabezas: en la variante 01, empujar una caja siempre
la mueve exactamente una celda — el reto es puramente combinatorio, de orden y ruta. Aquí se
añade una casilla nueva, el **hielo** (`~`): cualquier movimiento que aterrice sobre hielo — el
del jugador andando o el de una caja empujada — no se detiene ahí, sino que continúa
deslizándose en la misma dirección, celda a celda, hasta la primera casilla que no sea hielo o
hasta chocar contra un muro o una caja, momento en el que se detiene en la última casilla de
hielo antes del obstáculo. El reto deja de ser solo "qué orden" para volverse "hasta dónde
llega esto si lo suelto aquí" — trayectoria y física simple de deslizamiento, no solo
combinatoria de empujes. Es, además, la lectura más literal del nombre original bajo el que se
propuso este tema: un bloque que se desliza.

Como en la variante 01 y como Snake (SPEC 10), no hay código de referencia: las constantes de
este documento son el diseño, no un ajuste posterior.

---

## Alcance

**Dentro:**

- `lib/games/empuja-cajas/engine.ts`: **el mismo motor y el mismo archivo** que la variante 01
  implementaría — esta spec describe una implementación alternativa completa, no un parche. Si
  se promueve esta variante en vez de la 01, es este documento el que gobierna el archivo.
- `lib/games/empuja-cajas/levels.ts`: tres niveles propios de esta variante, con la casilla
  nueva `~` (hielo) en notación Sokoban extendida.
- Mismo mundo lógico, panel y controles base que la variante 01 (ver "Por qué existe esta
  spec"); se añade la regla de deslizamiento sobre hielo para jugador y cajas.
- **Regla de deslizamiento:** un desplazamiento de una celda que aterriza sobre `~` continúa
  automáticamente en la misma dirección hasta la primera celda que no sea `~` (donde se
  detiene) o hasta un muro/caja (donde se detiene en la última celda de hielo antes del
  obstáculo). Cuenta como **un solo movimiento** a efectos de `MOVS` y del bono de nivel, sin
  importar cuántas celdas recorra.
- Restricción de diseño: ninguna casilla `.`/objetivo es a la vez `~`/hielo, para que un
  deslizamiento nunca tenga que decidir si "para en el objetivo aunque siga siendo hielo" —
  un objetivo siempre detiene por definición al no ser hielo.
- Nueva ficha `empuja-cajas` en `lib/games.ts` (categoría `PUZZLE`) y clase de portada
  `cover-empuja-cajas` — mismo `id`, copy propio de esta variante.
- Una línea `empuja-cajas` en `GAME_ENGINES`, idéntica a la de la variante 01 salvo por apuntar
  a esta implementación.
- Migración `insert into public.games (id, title) values ('empuja-cajas', 'EMPUJA CAJAS')` y su
  aplicación.

**Fuera de alcance (para specs futuras o si se prefiere la variante 01):**

- El deshacer/rehacer parcial de una casilla dentro de un deslizamiento: deshacer revierte el
  deslizamiento completo de una vez (ver paso 4), no lo recorre celda a celda.
- Casillas de un solo sentido, teletransporte o cualquier otra casilla especial además del
  hielo. Esta variante concentra su presupuesto de diseño en una sola mecánica nueva; añadir
  más sería una tercera propuesta, no una alternativa clara a la 01.
- Un cuarto nivel adicional a los tres descritos aquí.
- Sonido.
- Controles táctiles más allá del D-pad y los botones `Z`/`R` declarados en el registro.
- Skins (`clasico`/`neon`/`retro`).
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla nueva, ni columna, ni tipo de plataforma.** `GameEngineEntry` ya
existe desde la SPEC 08, `scores` y `game_stats` sirven a este juego sin tocarlas, y el
leaderboard se enciende con una fila en `games`.

Notación de nivel extendida respecto a la variante 01, un carácter nuevo:

```
# muro    espacio suelo    . objetivo    $ caja    @ jugador    ~ hielo
```

```ts
type LevelDef = {
  id: number;
  name: string;
  rows: string[]; // admite '~' además de los caracteres de la variante 01
  par: number;
};
```

Tipos locales del motor, sin exportar — idénticos a la variante 01 salvo por el campo `ice`:

```ts
type Cell = { x: number; y: number };
type Dir = "up" | "down" | "left" | "right";
type BoxState = { cell: Cell; everScored: boolean };
type Move = {
  playerPath: Cell[]; // [origen, ...celdas intermedias del deslizamiento, destino final]
  boxIndex: number | null;
  boxPath: Cell[] | null; // igual forma que playerPath, para la caja empujada
};
```

Estado en la clausura de `createEmpujaCajasGame`: igual que la variante 01
(`walls`, `targets`, `boxes`, `player`, `moves`, `history`, `score`, `anim`, `state`, bucle y
entrada), más `ice: boolean[]` (array plano `cols × rows` del nivel actual, `true` donde hay
`~`).

---

## Plan de implementación

### 1. Datos: los tres niveles con hielo

`lib/games/empuja-cajas/levels.ts`. Constantes compartidas con la variante 01 (idénticas):

```
CELL 40 px · GRID_COLS_MAX 14 · GRID_ROWS_MAX 14  (área de tablero 560×560)
BOX_POINTS 50
LEVEL_BONUS_BASE 200 · PENALTY_PER_MOVE 2 · MIN_LEVEL_BONUS 50
```

**Cualquier cambio de estos números, o de las filas de los niveles, es un cambio de diseño y no
entra en esta spec.**

```
NIVEL 1 — par 1, 1 caja (deslizamiento directo a objetivo)
#########
#@$~~~~.#
#########

NIVEL 2 — par 6, 1 caja (el hielo detiene contra un muro; hace falta un segundo empuje normal)
#########
#       #
#@$~~~# #
#       #
#    .  #
#########

NIVEL 3 — par 18, 2 cajas (dos deslizamientos independientes, uno a cada lado)
#############
#     @     #
# $~~.  .~~$#
#           #
#############
```

Comprobación: `npm run build` limpio con el motor aún sin registrar.

### 2. Motor: carga de nivel

Igual que el paso 1 de la variante 01 (`loadLevel(i)` parsea `rows` a `walls`, `targets`,
`boxes`, `player`, vacía `history`, `moves = 0`), añadiendo el parseo de `~` a `ice[]`.

Comprobación: el nivel 1 de esta variante carga con `ice[]` marcado en las cuatro celdas entre
la caja y el objetivo.

### 3. Motor: deslizamiento

Función `slide(from: Cell, dir: Dir, isBlocked: (c: Cell) => boolean): Cell[]` compartida por
jugador y caja: parte de `from`, y mientras la celda actual sea `ice[cell]` **y** la siguiente
celda en `dir` no esté bloqueada por `isBlocked`, avanza una celda y la añade al camino;
se detiene devolviendo el camino completo (incluida la celda inicial) en cuanto la celda actual
deja de ser hielo, o en cuanto la siguiente estaría bloqueada.

Reglas de un intento de movimiento en dirección `dir`, sustituyendo al paso 2 de la variante 01:

1. `dest = player + dir`. Si `walls[dest]`, se rechaza igual que en la variante 01: sin cambio
   de estado, sin incrementar `moves`.
2. Si `dest` no tiene caja: el jugador se desplaza a `dest` y, si `ice[dest]`, continúa con
   `slide(dest, dir, c => walls[c] || hasBox(c))`. La posición final es la última celda de ese
   camino. El jugador **nunca empuja** una caja con la que se cruza mientras se desliza: si el
   siguiente paso del deslizamiento estaría ocupado por una caja, `slide` lo trata como
   bloqueado y el jugador se detiene una celda antes, igual que si fuera un muro.
3. Si `dest` tiene caja: `boxDest = dest + dir`. Si `walls[boxDest]` o hay otra caja en
   `boxDest`, se rechaza el movimiento completo. Si no, la caja se mueve a `boxDest` y, si
   `ice[boxDest]`, continúa con `slide(boxDest, dir, c => walls[c] || hasOtherBox(c))` —el
   jugador se mueve solo a `dest` (la celda original de la caja), **nunca sigue el
   deslizamiento de la caja**: el impulso es de la caja, no del jugador que la empujó, igual
   que en la variante 01 el jugador solo avanza una celda al empujar.
4. Un movimiento válido (con o sin deslizamiento) cuenta como **un solo movimiento**: incrementa
   `moves` en 1, apila un único `Move` en `history` con `playerPath`/`boxPath` completos, y
   dispara la comprobación de puntuación del paso 4 de la variante 01 usando la posición final
   de la caja tras el deslizamiento (si la hubo).

Ninguna casilla de objetivo es hielo (restricción del paso 1 de "Alcance"), así que `slide`
nunca necesita decidir si un objetivo detiene o no: un objetivo siempre es "no hielo" y detiene
por la condición normal del bucle.

Comprobación: en el nivel 1, empujar la caja hacia la derecha la mueve de un tirón hasta el
objetivo al otro lado del hielo, y `MOVS` pasa de 0 a 1, no a 5.

### 4. Motor: deshacer y reiniciar con caminos

`undo()`: saca el último `Move`; restaura `player = move.playerPath[0]` y, si `move.boxIndex`
no es `null`, restaura esa caja a `move.boxPath[0]`. Decrementa `moves` en 1 (un deslizamiento
completo cuenta como un solo movimiento también al deshacer). Igual que en la variante 01, no
revierte `everScored` de una caja ya puntuada.

`restartLevel()` (`R`) y `restart()` del contrato: idénticos a los pasos 3 y 4 de la variante
01.

Comprobación: tras el deslizamiento de un tirón del nivel 1, `Z` devuelve la caja y al jugador
a su posición original en un solo paso, no celda a celda.

### 5. Motor: animación, dibujo, bucle, entrada y registro

Idéntico a los pasos 4, 5 y 6 de la variante 01 (`emit()`, `onLives(1)`, `GAME_KEYS`, ausencia
de repetición automática, listeners sobre el canvas, `DT_MAX`, `destroy()`), con dos añadidos:

- `draw()` pinta las celdas de hielo con un tono azulado translúcido y una textura de líneas
  diagonales finas, distinguible del suelo normal a simple vista.
- La animación de un movimiento con deslizamiento interpola **cada celda del camino** en
  secuencia, `ANIM_MS = 120` ms por celda (un deslizamiento de 4 celdas se ve como 480 ms de
  movimiento continuo), pero sigue contando como el mismo único movimiento lógico del paso 3;
  un segundo `keydown` que llega durante la animación corta la interpolación en curso y aplica
  el siguiente movimiento desde la posición lógica ya resuelta, igual que en la variante 01.

Comprobación: `getEngine("empuja-cajas")` (tras el paso 7) devuelve la entrada y
`npm run build` sigue limpio.

### 6. Catálogo: nueva ficha `empuja-cajas`

`lib/games.ts`, nueva entrada en `GAMES` (mismo `id`, `cat` y `cover` que la variante 01; copy
propio de esta variante):

```ts
{
  id: "empuja-cajas",
  title: "EMPUJA CAJAS",
  short: "Cajas, marcas y hielo que no perdona un empujón de más.",
  long: "El hielo no se detiene donde tú quieres: empuja una caja sobre una placa helada y seguirá deslizándose hasta chocar. Calcula la trayectoria antes de soltarla — en este tablero, un movimiento de más puede mandarla al otro lado del nivel.",
  cat: "PUZZLE",
  cover: "cover-empuja-cajas",
  color: "cyan",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `.cover-empuja-cajas`, compartida con la variante 01 si se implementan
ambas (misma portada, distinto motor por debajo).

Comprobación: `/juegos/empuja-cajas` muestra la ficha en la biblioteca con su portada, antes de
que el motor esté registrado.

### 7. Registrar el motor

`lib/games/registry.ts`, idéntico a la variante 01:

```ts
"empuja-cajas": {
  create: createEmpujaCajasGame,
  width: 640,
  height: 600,
  controls: "flechas o WASD para mover y empujar cajas, Z para deshacer, R para reiniciar el nivel",
  touch: { a: { code: "KeyZ", label: "DESHACER" }, b: { code: "KeyR", label: "REINICIAR" } },
},
```

Comprobación: `/jugar/empuja-cajas` pinta el canvas real en vez de `.game-arena`.

### 8. Leaderboard

`supabase/migrations/<timestamp>_juego_empuja_cajas.sql`:

```sql
insert into public.games (id, title) values ('empuja-cajas', 'EMPUJA CAJAS');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. Los tipos no se
regeneran: insertar una fila no cambia el esquema.

Comprobación: `select * from public.games` incluye la fila `empuja-cajas`.

### 9. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido
manual de los criterios de aceptación, incluidos los tres niveles completos de punta a punta.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/empuja-cajas` muestra un canvas de 640×600 con tablero, hielo diferenciado
      visualmente del suelo normal, y panel lateral, no la `.game-arena`.
- [ ] En el nivel 1, empujar la caja hacia el hielo la desliza de un tirón hasta el objetivo al
      otro lado, y `MOVS` marca 1, no el número de celdas recorridas.
- [ ] En el nivel 2, el deslizamiento se detiene contra el muro antes del objetivo; un segundo
      empuje en otra dirección (sin hielo) mueve la caja la última celda hasta el objetivo.
- [ ] En el nivel 3, cada caja se desliza de forma independiente hasta su propio objetivo sin
      interferir con la otra.
- [ ] Si el jugador se desliza sobre hielo y la siguiente celda del camino tiene una caja, el
      jugador se detiene una celda antes de la caja en vez de empujarla o atravesarla.
- [ ] Si una caja empujada sobre hielo se desliza y la siguiente celda del camino tiene otra
      caja o un muro, se detiene en la última celda de hielo libre antes del obstáculo.
- [ ] El jugador que empuja una caja hacia el hielo nunca se desliza él mismo por el impulso de
      la caja: solo avanza una celda, como en la variante clásica.
- [ ] Colocar una caja sobre su objetivo mediante un deslizamiento suma 50 puntos la primera
      vez, igual que un empuje normal; sacarla y volver a colocarla no vuelve a sumarlos.
- [ ] `Z` deshace un movimiento con deslizamiento devolviendo al jugador y a la caja (si
      aplica) a su posición previa al movimiento completo, no celda a celda del camino.
- [ ] `R` reinicia solo el nivel en curso sin tocar la puntuación ni el nivel alcanzado.
- [ ] Completar el nivel 3 (el último de esta variante) abre el modal `FIN DEL JUEGO` con la
      puntuación real; no existe ninguna forma de perder.
- [ ] El botón `PAUSA` congela el juego, incluida cualquier animación de deslizamiento en curso;
      `REANUDAR` la retoma sin saltar celdas de golpe.
- [ ] `P` y `Escape` hacen lo mismo que el botón, y el motor no los interpreta como jugada.
- [ ] Con el canvas enfocado, las flechas no hacen scroll de la página.
- [ ] Un segundo `keydown` que llega mientras una caja aún se desliza visualmente aplica el
      siguiente movimiento desde la posición lógica ya resuelta, sin esperar a que termine la
      animación.
- [ ] `JUGAR DE NUEVO` reinicia toda la partida al nivel 1 con 0 puntos, sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'empuja-cajas'`.
- [ ] Esa puntuación aparece en `/salon?juego=empuja-cajas` y en `/juegos/empuja-cajas` sin
      recargar a mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Con `scores` vacía para este juego, `/salon?juego=empuja-cajas` muestra el estado vacío.
- [ ] Navegar de `/jugar/empuja-cajas` a `/biblioteca` y volver no duplica el bucle.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid`, `/jugar/snake` y `/jugar/frogger` se
      juegan igual que antes.
- [ ] `select * from public.games` incluye una fila `empuja-cajas` además de las ya existentes.
- [ ] `lib/games.ts` mantiene sin tocar las fichas de los demás juegos.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en
      `/jugar/empuja-cajas`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** compartir con la variante 01 el género, el mundo lógico, el panel y el esquema de
  controles. Son las decisiones que el tema fija antes de diseñar las variantes; cambiar
  cualquiera de ellas aquí produciría dos juegos distintos en vez de dos diseños del mismo
  juego.
- **Sí:** un deslizamiento completo cuenta como un solo movimiento. Es lo que hace del hielo una
  mecánica de trayectoria y no solo un empuje más largo — si cada celda deslizada sumara a
  `MOVS`, el hielo penalizaría exactamente lo que premia (llegar lejos de un solo impulso).
- **Sí:** ningún objetivo es también hielo. Sin esta restricción, `slide` tendría que decidir si
  un objetivo detiene el deslizamiento aunque siga siendo hielo debajo, una ambigüedad de
  diseño que no aporta nada y solo complica la regla.
- **Sí:** el jugador nunca hereda el impulso de una caja que empuja hacia el hielo. Mantiene la
  regla de la variante 01 de que el jugador avanza una sola celda al empujar; separar el
  impulso del jugador del de la caja evita una cascada de reglas sobre "quién arrastra a
  quién".
- **Sí:** el jugador que se desliza se detiene antes de una caja en su camino, sin empujarla.
  Empujar mientras se desliza abriría una clase entera de interacciones en cadena (deslizar,
  empujar, esa caja también sobre hielo…) que ninguna de las dos variantes necesita para ser un
  buen puzzle.
- **Sí:** deshacer revierte el deslizamiento completo de una vez, no celda a celda. Es
  coherente con que el deslizamiento cuenta como un solo movimiento: deshacer un movimiento
  deshace exactamente eso, un movimiento.
- **Sí:** tres niveles en vez de cuatro. El hielo es una mecánica más rica por nivel que un
  empuje simple — el nivel 1 ya enseña el concepto en un solo movimiento y el nivel 3 combina
  dos deslizamientos independientes — así que tres niveles bastan para demostrar la variante sin
  alargarla de forma artificial.
- **No:** casillas de un solo sentido, teletransporte u otras casillas especiales. Concentrar el
  presupuesto de diseño en una sola mecánica nueva mantiene esta variante como una alternativa
  clara a la 01, no una tercera propuesta distinta.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Un deslizamiento largo con animación celda a celda puede sentirse lento si el jugador ya sabe hacia dónde va. | Un segundo `keydown` corta la animación en curso y aplica el siguiente movimiento de inmediato desde la posición lógica ya resuelta; el criterio de aceptación correspondiente lo verifica. |
| La regla "el jugador se detiene antes de una caja en su camino de deslizamiento" es fácil de implementar al revés (que la atraviese o la empuje) si no se prueba explícitamente. | Hay un criterio de aceptación dedicado que fuerza ese escenario a mano antes de dar la spec por implementada. |
| Los valores `PAR` de los tres niveles se fijaron a mano sin un solver automático, igual que en la variante 01. | El paso 9 exige jugar los tres niveles de punta a punta; un `PAR` injusto se corrige como parte de la implementación y se anota. |
| Compartir el mismo archivo `engine.ts` que la variante 01 puede llevar a implementar ambas a la vez por error y mezclar sus reglas de movimiento. | Este documento y `01-clasico.md` declaran explícitamente que cada uno gobierna el archivo solo si se promueve esa variante; la implementación elige una, no fusiona las dos. |
| El deslizamiento de una caja puede dejarla en una posición sin salida hacia ningún objetivo (deadlock) más fácilmente que en la variante 01, porque un solo empuje puede moverla varias celdas de golpe. | El género no tiene condición de derrota: `Z` y `R` son ilimitados y gratuitos, igual que en la variante 01; un deadlock nunca es permanente. |
| Definir `ice[]` y `walls[]`/`targets[]` como arrays paralelos por índice de celda puede desincronizarse si el parseo de una fila con `~` no se prueba junto con el resto de caracteres. | El paso 2 tiene una comprobación dedicada a verificar que `ice[]` se parsea correctamente en el nivel 1 antes de continuar con la lógica de deslizamiento. |

---

## Lo que **no** entra en esta spec

- Casillas de un solo sentido, teletransporte o cualquier casilla especial además del hielo.
- Deshacer parcial (celda a celda) de un deslizamiento.
- Un cuarto nivel adicional a los tres descritos aquí.
- Sonido.
- Controles táctiles más allá del D-pad y los botones `Z`/`R` declarados en el registro.
- Skins (`clasico`/`neon`/`retro`).
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.
- Rate limiting, antitrampas y validación de la puntuación en servidor.

Cada una de ellas, si entra, va en su propia spec.
