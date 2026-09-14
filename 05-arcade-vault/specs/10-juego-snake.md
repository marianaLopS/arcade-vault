# SPEC 10 — SNAKE: la ficha `serpentina` se vuelve jugable

> **Estado:** Aprobada
> **Depende de:** SPEC 05, SPEC 06, SPEC 08, SPEC 09
> **Fecha:** 2026-09-13
> **Objetivo:** Escribir desde cero un Snake contra el contrato `GameEngine`, con las frutas pixel-art de `snake-assets/fruits.png`, sobre la ficha `serpentina` renombrada a `snake`, y darlo de alta en `games` para que tenga leaderboard real.

---

## Por qué existe esta spec

Es el cuarto juego y el primero **sin código de referencia**. Asteroids, Tetris y Arkanoid fueron
ports: sus constantes venían de un `game.js`. Aquí no hay original, así que las constantes de esta
spec **son** el diseño del juego, y el paso 2 las fija con la misma regla que los ports: cambiarlas
durante la implementación es rediseñar, no implementar.

Lo único que llega de fuera es el arte: `References/resources/resources/templates/source_assets/snake-assets/`
trae `fruits.png` (3790×442, RGBA, tres filas de 22 frutas) y `sprites.js`, un atlas con las
coordenadas de la fila central, la pixel-art. Los nombres de ese atlas no coinciden con el orden
visual de la hoja (la primera celda se llama `banana` y es una manzana), pero las coordenadas sí
recortan frutas enteras. Como la fruta es solo visual, el port usa las coordenadas por índice y
descarta los nombres.

La plataforma no se toca: `GameEngineEntry` existe desde la SPEC 08 y la carga de imagen cancelable
tiene precedente en la SPEC 09.

---

## Alcance

**Dentro:**

- `lib/games/snake/sprites.ts`: `FRUIT_SPRITES`, las 22 coordenadas `{ x, y, w, h }` de
  `sprites.js`, como array de datos puros sin estado.
- `lib/games/snake/engine.ts`: motor nuevo con todo el estado en la clausura de `createSnakeGame`.
- Grilla de 32×24 celdas de 25 px en un mundo de 800×600.
- Muros letales y morderse la cola letal. Una sola vida.
- Nivel cada 5 frutas: más velocidad y más puntos por fruta.
- Cada fruta nueva usa un sprite aleatorio de `FRUIT_SPRITES`.
- Control con flechas y WASD, con cola de hasta dos giros.
- `public/juegos/snake/fruits.png`.
- Una línea `snake` en `GAME_ENGINES`.
- `lib/games.ts`: la ficha `serpentina` pasa a `id: "snake"` y `title: "SNAKE"`.
- Migración `insert into public.games (id, title) values ('snake', 'SNAKE')` y su aplicación.

**Fuera de alcance (para specs futuras):**

- Sonido.
- Controles táctiles o swipe.
- Frutas bonus, frutas con valor distinto, obstáculos, portales o muros que atraviesan.
- Varias vidas.
- Sprites de serpiente: la hoja no los trae; la serpiente se dibuja con rectángulos.
- Cambiar la portada `cover-snake`, el copy de la ficha, `best` o `plays`.
- Los cuatro juegos de maqueta restantes.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni tipo de plataforma nuevo.** `scores` y `game_stats`
sirven a este juego sin tocarlas, y el leaderboard se enciende con una fila en `games`.

Tipos locales del motor, sin exportar:

```ts
type Cell = { x: number; y: number }; // coordenadas de grilla, origen arriba-izquierda
type Dir = "up" | "down" | "left" | "right";
```

Estado en la clausura de `createSnakeGame`:

- `snake: Cell[]` — la cabeza es `snake[0]`.
- `dir: Dir`, `turns: Dir[]` (cola de giros pendientes, máximo 2).
- `fruit: Cell`, `fruitSprite: number` (índice en `FRUIT_SPRITES`).
- `score`, `level`, `eaten` (frutas comidas en total).
- `tickAccum` (ms), `waiting` (true hasta el primer giro), `state: "playing" | "gameover"`.
- Bucle: `rafId`, `lastTime`, `destroyed`. Imagen: `img`, `imgReady`.

---

## Plan de implementación

### 1. Datos de sprites

`lib/games/snake/sprites.ts` con `FRUIT_SPRITES`: las 22 entradas de `sprites.js` en su orden,
coordenada a coordenada, sin nombres.

Comprobación: `npm run build` limpio.

### 2. Motor: constantes y lógica

`lib/games/snake/engine.ts`. Constantes de diseño:

```
W 800 · H 600 · CELL 25 px · COLS 32 · ROWS 24
START_LEN 3 · START_HEAD (8, 12) · START_DIR right
TICK_BASE 150 ms · TICK_STEP 10 ms por nivel · TICK_MIN 60 ms
  tick(level) = max(TICK_MIN, TICK_BASE - TICK_STEP * (level - 1))
FRUITS_PER_LEVEL 5 · POINTS_PER_FRUIT 10
  puntos por fruta = POINTS_PER_FRUIT * level
  level = 1 + floor(eaten / FRUITS_PER_LEVEL)
MAX_TURNS 2 · DT_MAX 50 ms
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Lógica por ticks discretos, con `dt` en milisegundos acumulado en `tickAccum`:

- Mientras `waiting`, la serpiente no avanza. El primer giro válido la pone en marcha.
- En cada tick: se saca un giro de `turns` si lo hay; se calcula la nueva cabeza.
- Fuera de `0..COLS-1` / `0..ROWS-1`: game over.
- Choque con el cuerpo: game over. La última celda de la cola **no** cuenta si ese tick no se come
  fruta, porque se mueve a la vez.
- Cabeza sobre la fruta: la serpiente crece una celda, suma puntos, `eaten++`, recalcula `level`
  y coloca fruta nueva.
- Fruta nueva: celda aleatoria entre las libres, nunca sobre la serpiente, con sprite aleatorio.
  Si no queda celda libre, game over (tablero lleno).
- Un giro se encola solo si no es el opuesto ni igual a la última dirección encolada (o a `dir` si
  la cola está vacía). Con la cola llena se descarta.

### 3. Motor: bucle, entrada, imagen y dibujo

- `emit()` con `lastScore` / `lastLives` / `lastLevel`. `onLives(1)` una vez, como Tetris.
- `draw()`: fondo negro, grilla tenue, fruta con `drawImage` del recorte escalado a la celda
  conservando proporción, serpiente con rectángulos verdes neón y cabeza de otro tono.
- Sin puntuación, nivel ni overlays en el canvas. Mientras `waiting` se permite un rótulo
  `PULSA UNA FLECHA` dentro del canvas, porque es estado propio del juego.
- Game over: `stopLoop()` y `onGameOver(score)` una sola vez. `resume()` es no-op después.
- `restart()`: detiene el bucle, vacía `turns`, `initGame()`, `emit()`, arranca.
- Imagen: `new Image()` con `src = "/juegos/snake/fruits.png"`. Hasta que carga, la fruta no se
  dibuja pero el juego sí puede avanzar. `onload` comprueba `destroyed`; `destroy()` anula
  `onload` / `onerror`.
- `dt` capado a `DT_MAX`; `lastTime = null` al reanudar.
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`, `KeyD`.
  `preventDefault()` solo para esas.
- Listeners `keydown` / `blur` sobre el canvas, nunca sobre `window`. `P` y `Escape` no llegan.
- `destroy()` cancela el frame, quita los listeners, corta la carga pendiente y es idempotente.
- `initGame(); draw();` antes de devolver.

Comprobación: `npm run build` limpio.

### 4. Asset

Copiar `fruits.png` a `public/juegos/snake/fruits.png`. Sin `__MACOSX` ni `sprites.js`.

Comprobación: `/juegos/snake/fruits.png` responde 200 con `npm run dev`.

### 5. Registrar y renombrar la ficha

`lib/games/registry.ts`:
`snake: { create: createSnakeGame, width: 800, height: 600, controls: "flechas o WASD para girar la serpiente" }`.

`lib/games.ts`: la entrada `serpentina` pasa a `id: "snake"` y `title: "SNAKE"`. `short`, `long`,
`cat: "ARCADE"`, `cover: "cover-snake"`, `color: "green"`, `best` y `plays` no cambian.

Comprobación: `/jugar/snake` pinta el canvas real; `/jugar/serpentina` da 404.

### 6. Leaderboard

`supabase/migrations/<timestamp>_juego_snake.sql`, con timestamp posterior a
`20260914001618`:

```sql
insert into public.games (id, title) values ('snake', 'SNAKE');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. **Los tipos no se
regeneran**: insertar una fila no cambia el esquema. `serpentina` nunca estuvo en `games`.

Comprobación: `select * from public.games` devuelve cuatro filas.

### 7. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido manual
de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/snake` muestra un canvas de 800×600 con serpiente y fruta pixel-art, no la `.game-arena`.
- [ ] La serpiente empieza con 3 celdas y no se mueve hasta pulsar una dirección.
- [ ] Flechas y WASD giran la serpiente; un giro de 180° se ignora.
- [ ] Dos giros rápidos dentro del mismo tick se aplican los dos, en orden.
- [ ] Comer una fruta alarga la serpiente una celda y suma `10 × nivel` en el HUD.
- [ ] La fruta nueva nunca aparece sobre la serpiente y cambia de sprite aleatoriamente.
- [ ] Tras 5 frutas el HUD pasa a nivel 02 y la serpiente va visiblemente más rápida.
- [ ] El HUD muestra 1 vida desde el inicio.
- [ ] Chocar con un muro abre el modal `FIN DEL JUEGO` con la puntuación real.
- [ ] Morderse la cola abre el mismo modal; perseguir la propia cola sin comer no mata.
- [ ] El canvas no dibuja puntos, nivel ni vidas, ni ningún overlay de game over.
- [ ] El botón `PAUSA` congela el juego y `REANUDAR` lo reanuda sin saltar celdas.
- [ ] `P` y `Escape` hacen lo mismo que el botón.
- [ ] Con el canvas enfocado, las flechas no hacen scroll de la página.
- [ ] Escribir `W`, `A`, `S`, `D` o espacio en el campo de iniciales no mueve ni reinicia el juego.
- [ ] `JUGAR DE NUEVO` reinicia a nivel 1, 0 puntos y 3 celdas sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'snake'`.
- [ ] Esa puntuación aparece en `/salon?juego=snake` y en `/juegos/snake` sin recargar a mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Con `scores` vacía para este juego, `/salon?juego=snake` muestra el estado vacío.
- [ ] Navegar de `/jugar/snake` a `/biblioteca` y volver no duplica el bucle.
- [ ] Dejar la pestaña en segundo plano y volver no hace avanzar varias celdas de golpe.
- [ ] `/jugar/asteroids`, `/jugar/caida` y `/jugar/arkanoid` se juegan igual que antes.
- [ ] `/jugar/gloton` y los otros juegos sin motor se comportan igual que antes.
- [ ] `select * from public.games` devuelve exactamente cuatro filas: `asteroids`, `caida`, `arkanoid` y `snake`.
- [ ] `grep -r "serpentina" lib app components` no devuelve nada.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/snake`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** renombrar `serpentina` a `snake`, como `rocas` → `asteroids` y `bloque-buster` →
  `arkanoid`. Nunca tuvo fila ni puntuaciones.
- **Sí:** título `SNAKE`, coherente con `ASTEROIDS`, `TETRIS` y `ARKANOID`.
- **No:** tocar `cover-snake` ni el copy. La portada ya es una serpiente y el texto describe el juego.
- **Sí:** mundo 800×600 con grilla 32×24 de 25 px. Mismo marco 4/3 que Asteroids y Arkanoid.
- **No:** 600×600 cuadrado. Obligaría a otra proporción de marco sin ganar jugabilidad.
- **Sí:** muros letales. Es el Snake clásico y hace que el tamaño del tablero importe.
- **No:** atravesar bordes.
- **Sí:** una vida, como Tetris. Snake no tiene reaparición natural.
- **Sí:** niveles cada 5 frutas con velocidad y puntos crecientes. Da sentido al HUD de nivel.
- **Sí:** fruta aleatoria solo visual. Usa toda la hoja sin inventar un sistema de valores.
- **No:** frutas bonus ni valor por tipo. Otra spec si llega.
- **Sí:** coordenadas de `sprites.js` por índice, sin sus nombres, que no corresponden al dibujo.
- **Sí:** esperar la primera dirección antes de mover. Evita chocar al abrir la página o tras
  `JUGAR DE NUEVO` sin foco.
- **Sí:** cola de hasta dos giros. Sin ella un giro rápido de 90°+90° se pierde o provoca un 180°.
- **Sí:** el juego avanza aunque la imagen no haya cargado. La fruta es decorado; la lógica no
  depende de ella.
- **Sí:** la cola que se mueve ese tick no cuenta como colisión. Es la regla estándar.
- **No:** sonido. No hay assets de audio.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo                                                                     | Mitigación                                                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Sin original, las constantes se ajustan «a ojo» durante la implementación. | El paso 2 las fija y las declara fuera de alcance.                                          |
| Dos giros rápidos en un tick producen un 180° y muerte instantánea.        | Cola de giros validada contra la última dirección encolada, no contra `dir`.                |
| Las coordenadas del atlas recortan mal alguna fruta.                       | Se comprueba visualmente en la verificación; si alguna falla se corrige el dato y se anota. |
| El componente se desmonta con el PNG cargando y deja un callback vivo.     | `onload` comprueba `destroyed` y `destroy()` anula el callback.                             |
| Pestaña en segundo plano: el acumulador dispara muchos ticks al volver.    | `dt` capado a 50 ms y `lastTime = null` al reanudar; como mucho un tick por frame.          |
| WASD llega al motor mientras se escriben iniciales.                        | Bucle parado con el modal abierto y listeners en el canvas, no en `window`.                 |
| A nivel alto el tick de 60 ms hace la verificación de colisiones difícil.  | Se verifica en niveles bajos; el mínimo está acotado por `TICK_MIN`.                        |

---

## Lo que **no** entra en esta spec

- Sonido.
- Controles táctiles.
- Frutas bonus, valores por tipo, obstáculos o wrap de bordes.
- Varias vidas.
- Rediseñar `cover-snake` o reescribir el copy de la ficha.
- Los cuatro juegos de maqueta restantes.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
