# SPEC 09 — ARKANOID: la ficha `bloque-buster` se vuelve jugable

> **Estado:** Borrador
> **Depende de:** SPEC 05, SPEC 06, SPEC 08
> **Fecha:** 2026-09-13
> **Objetivo:** Portar el Arkanoid de `../04-arkanoid/` al contrato `GameEngine`, con sonido y spritesheet, sobre la ficha `bloque-buster` renombrada a `arkanoid`, y darlo de alta en `games` para que tenga leaderboard real.

---

## Por qué existe esta spec

La SPEC 08 pagó el precio de generalizar el registro: `GameEngineEntry` ya lleva `create`,
`width`, `height` y `controls`, y el CSS del marco CRT ya no asume `4 / 3`. Arkanoid es el
tercer juego y el primero que entra **sin tocar la plataforma**: una carpeta de motor, una línea
en el registro, una ficha renombrada y una fila en `games`.

Lo nuevo que trae es lo que ninguno de los dos anteriores tenía: **assets externos**. Un
spritesheet PNG que se carga de forma asíncrona y dos MP3 con un pool de instancias. Los dos
tienen que vivir dentro de la clausura del motor y morir con `destroy()`, aunque la imagen aún no
haya terminado de cargar.

El original de `../04-arkanoid/` no es el que describe `port-guide.md` (cinco niveles en
`levels.js`, sin cap de `dt`, selector de niveles en la pausa). Es una versión posterior: tres
niveles escritos en `game.js`, bola pegada a la pala que se lanza con espacio, bloques grises
resistentes, explosiones animadas desde el spritesheet, sonido con `M` para silenciar y `dt`
capado a 0,05 s. Esta spec porta **esa** versión.

---

## Alcance

**Dentro:**

- `lib/games/arkanoid/sprites.ts`: `SPRITES`, `EXPLOSION_FRAMES` y `EXPLOSION_DURATION` de
  `assets/spritesheet.js`, como datos puros sin estado.
- `lib/games/arkanoid/engine.ts`: port de `game.js` a TypeScript, con todo el estado en la
  clausura de `createArkanoidGame`.
- Los tres niveles del original, los bloques grises de dos golpes y las explosiones de 4 frames.
- Control de la pala con flechas y con ratón, lanzamiento con espacio.
- Sonido de rebote y de rotura, con `M` para silenciar y el rótulo `SIN SONIDO` en el canvas.
- `public/juegos/arkanoid/spritesheet-breakout.png` y
  `public/juegos/arkanoid/sounds/{ball-bounce,break-sound}.mp3`.
- Una línea `arkanoid` en `GAME_ENGINES`.
- `lib/games.ts`: la ficha `bloque-buster` pasa a `id: "arkanoid"` y `title: "ARKANOID"`.
- Migración `insert into public.games (id, title) values ('arkanoid', 'ARKANOID')` y su
  aplicación.

**Fuera de alcance (para specs futuras):**

- El HUD dibujado en el canvas del original (`PUNTOS`, `NIVEL n/3`, las bolas de vidas): lo pone
  la plataforma.
- Los overlays `inicio`, `nivel`, `victoria` y `gameover`, y reiniciar con espacio.
- Persistir el silencio entre sesiones, o un control de volumen.
- Controles táctiles.
- Niveles nuevos, power-ups o cualquier mecánica que el original no tenga.
- Cambiar la portada `cover-bricks`, el copy de la ficha, `best` o `plays`.
- Los cinco juegos de maqueta restantes.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni tipo de plataforma nuevo.** `GameEngineEntry` ya
existe desde la SPEC 08, `scores` y `game_stats` sirven a este juego sin tocarlas, y el
leaderboard se enciende con una fila en `games`.

El estado de la partida del original —`blocks`, `explosions`, `score`, `lives`, `level`,
`screen`, `paddle`, `ball`, `keys`, `justPressed`, `mouseX`, `muted`, los pools de sonido,
`lastTs` y el spritesheet cargado— deja de ser módulo y pasa a la clausura de
`createArkanoidGame`. El discriminante `screen` (`inicio | jugando | nivel | victoria |
gameover`) se reduce a `state: "playing" | "gameover"`.

Un bloque sigue siendo lo que era:

```ts
type Block = {
  x: number;
  y: number;
  w: number;
  h: number;
  color: BlockColor;
  hits: number;
  points: number;
  dead: boolean;
};
```

Un layout de nivel sigue siendo un array de strings, un carácter por celda, con `BLOCK_CHARS`
traduciendo a color. El tamaño de bloque se deriva repartiendo `GRID_W × GRID_H` entre filas y
columnas del layout.

---

## Plan de implementación

### 1. Datos del spritesheet

`lib/games/arkanoid/sprites.ts` con `SPRITES`, `EXPLOSION_FRAMES` y `EXPLOSION_DURATION = 150`
copiados coordenada a coordenada de `assets/spritesheet.js`. La carga de la imagen **no** va
aquí: `ssImg`, `ssLoaded` y `ssCallbacks` eran estado de módulo y pasan al motor.

Comprobación: `npm run build` limpio.

### 2. Motor: constantes y entidades

`lib/games/arkanoid/engine.ts`, primera mitad. Constantes **idénticas al original**:

```
W 800 · H 600
PADDLE_H 14 · PADDLE_SPEED 520 px/s · PADDLE_Y = H - 40
PADDLE_WIDTHS [96, 84, 72]            (uno por nivel)
BALL_SIZE 12 · BALL_SPEED 340 px/s · LAUNCH_VX_RATIO 0.5
GRID_X 80 · GRID_Y 70 · GRID_W 640 · GRID_H 144
ROW_COLORS ['red','yellow','green','cyan','magenta','hotpink']
BLOCK_CHARS R red · Y yellow · G green · C cyan · M magenta · P hotpink · X gray
LIVES_START 3 · POINTS_PER_BLOCK 10
HITS_RESISTENTE 2 · POINTS_RESISTENTE 20
DT_MAX 0.05 s
EXPLOSION_TIME = EXPLOSION_DURATION / 1000 = 0.15 s (total de los 4 frames)
SOUND_POOL 4 · SOUND_VOLUME 0.5
LEVELS: los tres layouts del original, carácter a carácter (10, 10 y 12 columnas)
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Se porta sin tocar la lógica: `clamp`, `colisionan`, la pala (el ratón manda si se movió desde el
último frame; si no, las flechas), la bola (pegada a la pala hasta `Space`; rebote en tres muros
invirtiendo solo el signo; con la pala solo si `vy > 0`), `colisionarBloques` (como mucho un
bloque por frame, rebote por el eje de menor solape, un gris que aguanta cambia a un color
aleatorio de `ROW_COLORS` y no puntúa), `crearBloques` y `crearExplosion` (frame derivado de
`t`). Todo lo que el original leía de un global —`ctx`, `keys`, `mouseX`, el spritesheet, `play`—
llega por parámetro o por la clausura.

Comprobación: `npm run build` limpio con el motor aún sin registrar.

### 3. Motor: bucle, entrada, assets y avisos

- `emit()` con `lastScore` / `lastLives` / `lastLevel`; `onLevel(level + 1)` porque el HUD
  cuenta desde 1. Sustituye a `drawHUD()` y `drawLives()`.
- `cargarNivel(i)` como el original: bloques nuevos, `lives = LIVES_START`, ancho de pala del
  nivel, bola pegada. La puntuación acumula.
- Sin overlays: la bola pegada a la pala ya es la pantalla de inicio y la de cambio de nivel.
- Cambio de nivel y victoria esperan a que se apague la última explosión, como el original.
- Victoria tras el nivel 3 y `lives <= 0` terminan igual: `stopLoop()` y `onGameOver(score)`
  una sola vez. `resume()` es no-op después.
- `restart()`: detiene el bucle, suelta teclas y `mouseX`, `score = 0`, `cargarNivel(0)`,
  `emit()`, arranca.
- Spritesheet: `new Image()` con `src = "/juegos/arkanoid/spritesheet-breakout.png"`. Hasta que
  carga, `draw()` pinta negro y `update()` no avanza. `onload` comprueba `destroyed`;
  `destroy()` anula `onload`/`onerror`.
- Sonido: pools de `SOUND_POOL` instancias de `Audio` creados en la factoría,
  `play().catch(() => {})`, `muted` conmutado con `KeyM`. `pause()` y `destroy()` pausan todas
  las instancias.
- `SIN SONIDO` se dibuja en el canvas: es estado del juego, no de la plataforma.
- `dt` en segundos capado a `DT_MAX`; `lastTime = null` al reanudar.
- `GAME_KEYS`: `ArrowLeft`, `ArrowRight`, `Space`, `KeyM`. `preventDefault()` solo para esas.
- Listeners `keydown` / `keyup` / `blur` / `mousemove` sobre el canvas, nunca sobre `window`.
  `mousemove` escala por `W / rect.width` porque el CSS estira el canvas.
- `destroy()` cancela el frame, quita los cuatro listeners, corta la carga pendiente, pausa el
  audio y es idempotente.
- `initGame(); draw();` antes de devolver.

Desaparecen del port: `OVERLAYS`, `drawOverlay`, `drawHUD`, `drawLives`, `reiniciar` por
espacio, `document.getElementById` y los `addEventListener` globales.

Comprobación: `npm run build` limpio.

### 4. Assets

Copiar `assets/spritesheet-breakout.png` y `assets/sounds/*.mp3` a `public/juegos/arkanoid/`.
Sin `.DS_Store`.

Comprobación: `/juegos/arkanoid/spritesheet-breakout.png` responde 200 con `npm run dev`.

### 5. Registrar y renombrar la ficha

`lib/games/registry.ts`:
`arkanoid: { create: createArkanoidGame, width: 800, height: 600, controls: "flechas o ratón para mover la pala, espacio para lanzar la bola, M para silenciar" }`.

`lib/games.ts`: la entrada `bloque-buster` pasa a `id: "arkanoid"` y `title: "ARKANOID"`.
`short`, `long`, `cat: "ARCADE"`, `cover: "cover-bricks"`, `color: "cyan"`, `best` y `plays` no
cambian. El comentario de ejemplo `/juegos/bloque-buster` pasa a `/juegos/arkanoid`.

Comprobación: `/jugar/arkanoid` pinta el canvas real; `/jugar/bloque-buster` da 404.

### 6. Leaderboard

`supabase/migrations/<timestamp>_juego_arkanoid.sql`:

```sql
insert into public.games (id, title) values ('arkanoid', 'ARKANOID');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. **Los tipos no se
regeneran**: insertar una fila no cambia el esquema. `bloque-buster` nunca estuvo en `games`, así
que no hay fila que renombrar ni puntuaciones que migrar.

Comprobación: `select * from public.games` devuelve tres filas.

### 7. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido
manual de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/arkanoid` muestra un canvas de 800×600 con bloques, pala y bola del spritesheet, no la `.game-arena`.
- [ ] La bola empieza pegada a la pala y sale al pulsar espacio.
- [ ] Las flechas mueven la pala; mover el ratón sobre el canvas la centra bajo el cursor a cualquier tamaño de ventana.
- [ ] Romper un bloque de color suma 10; un gris necesita dos golpes, cambia de color al primero y suma 20 al segundo.
- [ ] Cada bloque roto muestra su explosión de 4 frames del color correcto.
- [ ] Perder la bola resta una vida en el HUD y la bola vuelve pegada a la pala.
- [ ] Al vaciar el nivel 1 el HUD pasa a nivel 02, las vidas vuelven a 3 y la pala es más estrecha.
- [ ] El nivel 3 tiene 12 columnas.
- [ ] Rebote y rotura suenan; `M` silencia y muestra `SIN SONIDO`, y otra `M` lo quita.
- [ ] El canvas no dibuja puntos, nivel ni vidas, ni ningún overlay de inicio, nivel, victoria o game over.
- [ ] El botón `PAUSA` congela el juego y `REANUDAR` lo reanuda sin que la bola pegue un salto.
- [ ] `P` y `Escape` hacen lo mismo que el botón.
- [ ] Con el canvas enfocado, las flechas y el espacio no hacen scroll de la página.
- [ ] Perder la última vida abre el modal `FIN DEL JUEGO` con la puntuación real.
- [ ] Vaciar el nivel 3 abre el mismo modal con la puntuación real.
- [ ] Escribir un espacio en el campo de iniciales no reinicia el juego.
- [ ] `JUGAR DE NUEVO` reinicia a nivel 1, 0 puntos y 3 vidas sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'arkanoid'`.
- [ ] Esa puntuación aparece en `/salon?juego=arkanoid` y en `/juegos/arkanoid` sin recargar a mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Con `scores` vacía para este juego, `/salon?juego=arkanoid` muestra el estado vacío.
- [ ] Navegar de `/jugar/arkanoid` a `/biblioteca` y volver no duplica el bucle ni el sonido.
- [ ] Dejar la pestaña en segundo plano y volver no hace atravesar la pala a la bola.
- [ ] `/jugar/asteroids` y `/jugar/caida` se juegan igual que antes.
- [ ] `/jugar/serpentina` y los otros juegos sin motor se comportan igual que antes.
- [ ] `select * from public.games` devuelve exactamente tres filas: `asteroids`, `caida` y `arkanoid`.
- [ ] `grep -r "bloque-buster" lib app components` no devuelve nada.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/arkanoid`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** renombrar `bloque-buster` a `arkanoid`, como la SPEC 05 renombró `rocas` a `asteroids`.
  La URL dice el nombre del juego portado y `bloque-buster` nunca tuvo fila ni puntuaciones.
- **No:** tocar `cover-bricks` ni el copy. La portada ya es un muro de bloques y el texto largo
  describe este juego.
- **Sí:** portar la versión real de `../04-arkanoid/`, no la que describe `port-guide.md`.
- **Sí:** el sonido entra, con `M`. Es parte del juego que hay en la carpeta y los MP3 ya existen.
- **No:** persistir el silencio. Reintroduciría `localStorage`, que la SPEC 06 retiró.
- **Sí:** la victoria llama a `onGameOver(score)` sin bonus. El modal ya enseña la puntuación;
  inventar un bonus sería rediseñar el marcador.
- **No:** overlays de inicio y de nivel. La bola pegada esperando espacio ya comunica ambos, y el
  nivel lo muestra el HUD.
- **Sí:** mantener que las vidas vuelvan a 3 en cada nivel. Es del original.
- **Sí:** `SIN SONIDO` en el canvas. Es estado propio del juego, como los power-ups de Asteroids.
- **Sí:** `sprites.ts` aparte. Son datos puros sin estado y copiarlos a mano dentro del motor
  alarga el archivo sin ganar nada.
- **Sí:** la física no avanza hasta que carga el spritesheet. Así la primera jugada no ocurre a
  ciegas.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo                                                                                     | Mitigación                                                                                  |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| La pala se desalinea del cursor porque el canvas está estirado por CSS.                    | `mousemove` escala por `W / rect.width` y hay un criterio que lo verifica a varios tamaños. |
| El componente se desmonta con el PNG aún cargando y el `onload` arranca un bucle huérfano. | `onload` comprueba `destroyed` y `destroy()` anula el callback.                             |
| El audio sigue sonando tras pausar o salir de la página.                                   | `pause()` y `destroy()` pausan todas las instancias de los pools.                           |
| El navegador bloquea `play()` antes de la primera interacción y ensucia la consola.        | `play().catch(() => {})`, como el original.                                                 |
| `Space` llega a la vez al lanzamiento y al campo de iniciales del modal.                   | El bucle está parado con el modal abierto y los listeners son del canvas, no de `window`.   |
| Portar «a ojo» cambia una constante y el juego deja de sentirse igual.                     | El paso 2 lista los valores exactos y los declara fuera de alcance.                         |
| `M` choca con otra tecla de la plataforma.                                                 | La plataforma solo reserva `P` y `Escape`.                                                  |
| El nivel 3 y la victoria son difíciles de alcanzar en la verificación.                     | Se verifican jugando; si no se alcanza, se reporta en vez de darlo por bueno.               |

---

## Lo que **no** entra en esta spec

- HUD dibujado en el canvas y overlays del original.
- Persistencia del silencio y control de volumen.
- Controles táctiles.
- Niveles nuevos o mecánicas que el original no tenga.
- Rediseñar `cover-bricks` o reescribir el copy de la ficha.
- Los cinco juegos de maqueta restantes.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
