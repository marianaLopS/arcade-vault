# SPEC 08 — CAÍDA: el Tetris del vault

> **Estado:** Aprobado
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-09-11
> **Objetivo:** Portar el Tetris de `References/.../started-games/03-tetris/` al contrato `GameEngine` y darlo de alta en `games`, de modo que la ficha `caida` deje de ser maqueta y tenga leaderboard real.

---

## Por qué existe esta spec

La SPEC 05 dejó montado el contrato `GameFactory` y prometió que Tetris y Arkanoid entrarían
«por el mismo agujero en vez de por un `if` nuevo». La SPEC 06 dejó el leaderboard leyendo de
`games` y `scores`, con una sola fila en la tabla. Esta spec es la primera vez que se cobra esa
promesa: un segundo juego de verdad.

Y es la primera que **paga el precio de haber diseñado el contrato con un solo juego delante**.
Asteroids es 800×600, dibuja su HUD de power-ups en el canvas y describe sus controles en un
`aria-label` escrito a mano dentro de `components/game-player.tsx`. Tetris no es 800×600: es
300×600 más un panel lateral, y sus controles son otros. Tres sitios del código —el registro,
el canvas y el CSS del marco CRT— asumen que sólo hay un juego. Esta spec los generaliza antes
de portar nada.

El original de `03-tetris/` tampoco es un Tetris pelado: trae power-ups cada cinco líneas,
pentominós, una pieza 3×3 hueca como reto, una recompensa de pieza 1×1 tras un Tetris y un tema
claro/oscuro. Todo eso entra —es el juego— salvo el tema, que es maquetación de otro sitio.

---

## Alcance

**Dentro:**

- `lib/games/registry.ts`: `GAME_ENGINES` pasa de `Record<string, GameFactory>` a un registro de
  entradas con `create`, `width`, `height` y `controls`.
- `components/game-canvas.tsx`: el canvas toma sus dimensiones, su `aria-label` y su
  `aspect-ratio` de la entrada del registro en vez de tenerlos escritos.
- `components/game-player.tsx`: `factory` pasa a ser `entry`; desaparece el `label` de Asteroids.
- `app/globals.css`: `.game-canvas` y `.crt-screen` dejan de fijar `4 / 3`; el `max-width` de
  `.crt` deja de multiplicar por `4 / 3`.
- `lib/games/caida/engine.ts`: port de las 584 líneas de `game.js` a TypeScript, con el estado
  en la clausura de la factoría.
- Mundo lógico de **420×600**: tablero de 300×600 a la izquierda y panel de 120 px a la derecha
  con la pieza siguiente, las líneas y el estado del power-up.
- Migración `insert into public.games (id, title) values ('caida', 'CAÍDA')` y su aplicación.

**Fuera de alcance (para specs futuras):**

- El tema claro/oscuro del original, `THEME_KEY` y su `localStorage`. Arcade Vault tiene su
  propia estética y la SPEC 06 borró la última clave de `localStorage` de la plataforma.
- Las 399 líneas de `style.css` del original y sus paneles `<aside>`: el HUD lo pone la
  plataforma y el panel lateral se dibuja en el canvas.
- Un HUD por juego. `components/game-player.tsx` seguirá rotulando `Vidas` y `Nivel` para todos.
- Arkanoid y los seis juegos de maqueta restantes.
- Controles táctiles, sonido y la caída suave automática al mantener pulsado (`DAS`/`ARR`).
- Renombrar la ficha `caida` a `tetris`, tocar su copy o su portada `cover-tetro`.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni clave de `localStorage`.** `scores` y `game_stats`
sirven a este juego sin tocarlas, y el leaderboard se enciende con una fila en `games`.

Lo único nuevo en TypeScript es la entrada del registro, en `lib/games/registry.ts`:

```ts
export type GameEngineEntry = {
  create: GameFactory;
  /** Mundo lógico del motor. El CSS sólo estira el píxel: la física no cambia. */
  width: number;
  height: number;
  /** `aria-label` del canvas: los controles de este juego, en español. */
  controls: string;
};
export const GAME_ENGINES: Record<string, GameEngineEntry> = {
  asteroids: { create: createAsteroidsGame, width: 800, height: 600, controls: "…" },
  caida: { create: createCaidaGame, width: 420, height: 600, controls: "…" },
};
export function getEngine(id: string): GameEngineEntry | undefined;
```

El tablero sigue siendo el del original: `ROWS × COLS` enteros, donde `0` es vacío y `1..14` son
a la vez el tipo de pieza y su color en `COLORS`. El estado de la partida —`board`, `current`,
`next`, `score`, `lines`, `level`, `dropInterval`, `dropAccum`, `powerPending`, `nextPowerAt`,
`freezeMs`, `singlePending`— deja de ser un `let` de módulo y pasa a la clausura de
`createCaidaGame`, igual que hizo la SPEC 05 con Asteroids.

**Reparto del mundo lógico**, 420×600:

```
x 0..300    tablero, 10 × 20 celdas de BLOCK = 30 px  (idéntico al original)
x 300..420  panel: SIGUIENTE (4×4 celdas de 30), LÍNEAS, estado del power-up
```

`COLS`, `ROWS` y `BLOCK` no cambian. El panel es espacio añadido a la derecha, no espacio
robado al tablero.

**El registro actual queda desplazado**: hoy `GAME_ENGINES` mapea a `GameFactory` a secas y
`getEngine()` devuelve la factoría. Después devuelve la entrada completa. Es la única firma
pública que cambia, y sólo la consume `components/game-player.tsx`.

---

## Plan de implementación

### 1. Generalizar el registro y el canvas

`lib/games/registry.ts` pasa a `GameEngineEntry`. Asteroids se convierte en
`{ create: createAsteroidsGame, width: 800, height: 600, controls: "…" }`, donde `controls` es
literalmente el texto que hoy vive en `components/game-player.tsx` como `label`.

`components/game-canvas.tsx` recibe `entry: GameEngineEntry` en vez de `factory` y `label`.
Renderiza `width={entry.width}`, `height={entry.height}`, `aria-label={entry.controls}` y
`style={{ aspectRatio: entry.width + " / " + entry.height }}`. El efecto que crea el motor
sigue dependiendo de una sola referencia —`entry`— para no recrearse a mitad de partida.

`components/game-player.tsx` sustituye `const factory = getEngine(game.id)` por
`const entry = getEngine(game.id)`, borra el `label` escrito a mano y pasa
`--av-arw` / `--av-arh` como variables CSS en el `style` de `.av-player` cuando hay entrada.

Comprobación: `/jugar/asteroids` se ve y se juega exactamente igual que antes.

### 2. Soltar el `4 / 3` del CSS

En `app/globals.css`:

- `.game-canvas` pierde `aspect-ratio: 4 / 3` — ahora lo pone el `style` en línea.
- `.crt-screen` pasa a `aspect-ratio: var(--av-arw, 4) / var(--av-arh, 3)`.
- `.av-player.has-canvas .crt` pasa a
  `max-width: max(320px, calc((100svh - var(--av-chrome)) * var(--av-arw) / var(--av-arh) + var(--av-marco)))`.

Dos números en vez de una razón, porque `calc()` no sabe multiplicar por un valor de
`aspect-ratio`. Los juegos sin motor no llevan las variables y caen en el `4 / 3` de siempre.

Comprobación: `/jugar/asteroids` mantiene su marco 4/3 y `/jugar/serpentina` —sin motor— también.

### 3. Portar el motor: tablero y piezas

`lib/games/caida/engine.ts`, primera mitad. Constantes **idénticas al original**:

```
COLS 10 · ROWS 20 · BLOCK 30
COLORS[1..14] y PIECES[1..14] tal cual, con sus comentarios
WILD 8 · POWER_CELL 9 · PENTO_TYPES [10,11,12] · SINGLE_TYPE 13 · HOLLOW_TYPE 14
SOLID_TYPES [1,2,3,4,5,6,7,10,11,12,13,14]
PENTO_CHANCE 0.12 · HOLLOW_CHANCE 0.05 · HOLLOW_LEVEL 3 · HOLLOW_BONUS 300
LINE_SCORES [0,100,300,500,800] · más de 4 filas: 200 por fila
POWER_EVERY 5 · FREEZE_MS 5000 · TOAST_MS 2600
dropInterval inicial 1000 · dropInterval = max(100, 1000 - (level-1)*90)
level = floor(lines / 10) + 1 · hard drop +2 por celda · soft drop +1 por fila
power-up aplicado: +50 × level · kicks de rotación [0,-1,1,-2,2]
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Se portan sin tocar la lógica: `createBoard`, `makePiece`, `randomPiece`, `randomPowerPiece`,
`collide`, `rotateCW`, `tryRotate`, `merge`, `clearLines`, `ghostY`, `hardDrop`, `softDrop`,
`lockPiece`, `spawn`, y los cinco power-ups (`powerBomb`, `powerRay`, `powerTint`,
`powerGravity`, y el congelado por `freezeMs`).

Comprobación: `npm run build` limpio con el motor aún sin registrar.

### 4. Portar el motor: dibujo

`drawBlock` y `drawPowerBlock` reciben `ctx` por parámetro, como ya hacen las entidades de
Asteroids. `drawGrid` se queda con el color oscuro `#22222e`: sin tema, `GRID_COLORS` deja de
ser un objeto y pasa a ser una constante.

El panel de la derecha sustituye a `drawNext()` sobre el segundo canvas y a los `<aside>` del
original: se dibuja en el mismo `ctx`, desplazado a `x = 300`, y contiene la pieza siguiente
(misma lógica de centrado en una caja de 4×4 celdas de 30 px), el contador de líneas y el estado
del power-up que hoy escribe `updatePowerStatus()` en el DOM.

El aviso de power-up (`showPowerToast`) pasa de un `<div>` con `setTimeout` a un rótulo dibujado
sobre el tablero con un temporizador propio que descuenta `dt`: así la pausa lo congela en vez
de dejar correr un `setTimeout` de fondo.

Comprobación: un tablero con piezas y el panel se ven correctamente con el motor arrancado a
mano desde `/jugar/caida` tras el paso 6.

### 5. Portar el motor: bucle, entrada y avisos

- `emit()` con `lastScore` / `lastLines` / `lastLevel`, que sustituye a `updateHUD()` y sólo
  llama a los callbacks cuando el valor cambia.
- `onLives(1)` al iniciar la partida y `onLives(0)` al perder: Tetris no tiene vidas, pero el
  HUD de la plataforma tiene la casilla y mentir con un guion es peor que decir «una vida».
  Las líneas, que sí importan, van en el panel del canvas.
- `onGameOver(score)` una sola vez, después de detener el bucle, cuando `spawn()` colisiona.
- `dt` en **milisegundos**, como el original, y **capado a 50 ms** —el original no lo capa—;
  `lastTime = null` al reanudar.
- `startLoop()` / `stopLoop()` con `rafId` y la bandera `destroyed`, como Asteroids; se
  abandona el `loopGen` del original, que resolvía el mismo problema de otra forma.
- `GAME_KEYS` del motor: `ArrowLeft`, `ArrowRight`, `ArrowDown`, `ArrowUp`, `Space`, `KeyX`.
  **`KeyP` sale de la lista**: la pausa es de la plataforma y `components/game-canvas.tsx` ya la
  atiende sobre el mismo canvas.
- Listeners `keydown` / `keyup` / `blur` sobre el canvas, nunca sobre `document`.
- `destroy()` cancela el frame, quita los tres listeners y es idempotente.

Desaparecen del port: `setTheme`, `themeToggle`, `THEME_KEY`, `overlay`, `overlayTitle`,
`overlayScore`, `restartBtn`, `updateHUD`, `toastEl` y todos los `getElementById`.

Comprobación: `getEngine("caida")` devuelve la entrada y `npm run build` sigue limpio.

### 6. Registrar y dar de alta

Una línea en `GAME_ENGINES` con `width: 420`, `height: 600` y el `controls` de este juego:
«flechas para mover y bajar, flecha arriba o X para rotar, espacio para caída rápida».

`lib/games.ts` **no se toca**: la ficha `caida` ya tiene el `id`, el `title`, `cover-tetro`,
`cat: "PUZZLE"` y el `color: "magenta"` correctos, y su texto largo ya describe este juego.

Comprobación: `/jugar/caida` pinta el canvas real en vez de `.game-arena`.

### 7. Leaderboard

`supabase/migrations/<timestamp>_juego_caida.sql`:

```sql
insert into public.games (id, title) values ('caida', 'CAÍDA');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. **Los tipos no se
regeneran**: insertar una fila no cambia el esquema y `lib/supabase/database.types.ts` no se
toca.

No hay que editar `lib/scores.ts`, `app/jugar/actions.ts`, `app/salon/page.tsx` ni
`app/juegos/[id]/page.tsx`: las tres pantallas se mueven por `game.id` y `hasLeaderboard()`.

Comprobación: `select * from public.games` devuelve dos filas, y `/salon?juego=caida` pasa de
`seededScores()` al estado vacío real.

### 8. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido
manual de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/caida` muestra un canvas con el tablero y el panel lateral, no la `.game-arena`.
- [ ] El canvas de `/jugar/caida` mide 420×600 y su marco CRT no está recortado ni deformado.
- [ ] `/jugar/asteroids` sigue midiendo 800×600 y con el marco 4/3 de siempre.
- [ ] `/jugar/serpentina` y los otros cinco juegos sin motor se comportan igual que antes.
- [ ] Las flechas mueven y bajan la pieza, `↑` y `X` la rotan, y el espacio la deja caer de golpe.
- [ ] Una línea suma 100 × nivel; dos, 300; tres, 500; cuatro, 800.
- [ ] La caída rápida suma 2 puntos por celda recorrida y la caída suave 1 por fila.
- [ ] A las 10 líneas el nivel del HUD pasa a 02 y las piezas caen visiblemente más rápido.
- [ ] Cada 5 líneas aparece una pieza power-up, y al fijarla se aplica su efecto y suma 50 × nivel.
- [ ] `Congelar` detiene la caída 5 segundos sin impedir mover ni rotar la pieza.
- [ ] Tras un Tetris (4 líneas) la siguiente pieza de recompensa es el 1×1.
- [ ] A partir del nivel 3 aparece la pieza 3×3 hueca y colocarla suma 300 × nivel.
- [ ] El panel derecho muestra la pieza siguiente, las líneas y el power-up activo.
- [ ] El botón `PAUSA` congela el juego y muestra el overlay `EN PAUSA`; `REANUDAR` lo reanuda
      sin que la pieza pegue un salto.
- [ ] `P` y `Escape` hacen lo mismo que el botón, y el motor no los interpreta como jugada.
- [ ] Con el canvas enfocado, las flechas y el espacio no hacen scroll de la página; con el foco
      fuera, vuelven a hacerlo.
- [ ] Cuando la pieza nueva no cabe se abre el modal `FIN DEL JUEGO` con la puntuación real.
- [ ] `JUGAR DE NUEVO` reinicia a tablero vacío, 0 puntos y nivel 1 sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'caida'`, la puntuación
      real y las iniciales escritas en mayúsculas.
- [ ] Esa puntuación aparece en `/salon?juego=caida` y en `/juegos/caida` sin recargar a mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Con `scores` vacía, `/salon?juego=caida` y `/juegos/caida` muestran el estado vacío y no
      revientan al pintar el podio.
- [ ] Navegar de `/jugar/caida` a `/biblioteca` y volver no duplica el bucle ni acelera el juego.
- [ ] Dejar la pestaña en segundo plano un minuto y volver no hunde la pieza de golpe.
- [ ] `select * from public.games` devuelve exactamente dos filas: `asteroids` y `caida`.
- [ ] `grep -r "THEME_KEY\|tetris-theme"` no devuelve nada en el repositorio.
- [ ] `lib/games.ts` no ha cambiado.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/caida`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** el slug se queda en `caida`. La SPEC 05 renombró `rocas` a `asteroids` para que la URL
  dijera el nombre del juego portado, pero aquí ese nombre es una marca registrada, y el resto
  del catálogo usa nombres genéricos en español a propósito (`gloton`, `ranaria`,
  `bloque-buster`). Además, no renombrar deja `lib/games.ts` intacto.
- **Sí:** mundo lógico de 420×600 con el panel dentro del mismo canvas. `GameCanvas` monta un
  canvas y el original necesita dos. Ensanchar el mundo no toca ni una constante del juego:
  el tablero sigue siendo 10×20 celdas de 30 px.
- **No:** enseñar a `GameCanvas` a montar un canvas auxiliar. Complica el contrato de todos los
  juegos para resolver el caso de uno.
- **No:** quitar la pieza siguiente. Saber qué viene es parte de cómo se juega a esto.
- **Sí:** generalizar el registro con `width`, `height` y `controls` antes de portar. Los tres
  datos son por juego y hoy están escritos a mano en tres archivos distintos. Hacerlo después
  del port significa depurar el juego contra un canvas del tamaño equivocado.
- **Sí:** dos variables CSS (`--av-arw`, `--av-arh`) en vez de una razón. `calc()` no multiplica
  por un valor de `aspect-ratio`, y el `max-width` de `.crt` necesita multiplicar.
- **Sí:** se portan power-ups, pentominós, pieza hueca y recompensa 1×1. Son el juego que hay en
  la carpeta, no extras opcionales; dejarlos fuera sería portar otro Tetris.
- **No:** el tema claro/oscuro. Es maquetación del proyecto original, y la pantalla de juego de
  Arcade Vault ya tiene su propio marco CRT. Además reintroduciría una clave de `localStorage`
  justo después de que la SPEC 06 borrara la última.
- **Sí:** el panel y el aviso de power-up se dibujan en el canvas. Es lo que ya hace Asteroids
  con su HUD de power-ups: estado propio del juego dentro del canvas, estado de la plataforma
  —puntuación, vidas, nivel— en el HUD de React.
- **Sí:** `onLives(1)` y `onLives(0)`. El HUD de la plataforma tiene una casilla `Vidas` fija
  para todos los juegos. Una vida es la lectura honesta de un Tetris; un HUD por juego es otra
  spec.
- **Sí:** `dt` en milisegundos, como el original. Pasarlo todo a segundos obligaría a reescalar
  `dropInterval`, `FREEZE_MS` y `TOAST_MS`, y cualquier redondeo cambiaría la velocidad de caída.
- **Sí:** capar `dt` a 50 ms aunque el original no lo haga. Sin el cap, volver de una pestaña en
  segundo plano vacía `dropAccum` de golpe y hunde la pieza varias filas.
- **Sí:** cambiar el `loopGen` del original por el `rafId` + `destroyed` de Asteroids. Los dos
  resuelven lo mismo; tener un solo patrón de bucle en el repositorio vale más que la fidelidad
  literal.
- **Sí:** `KeyP` fuera del motor. `components/game-canvas.tsx` ya atiende `P` y `Escape` sobre
  el mismo canvas; si el motor también los mirara, una pulsación pausaría dos veces.
- **No:** tocar el copy ni la portada de la ficha. `cover-tetro` ya se ve bien y el texto largo
  describe este juego; cambiarlo es riesgo visual a cambio de nada.
- **No:** sembrar puntuaciones en `scores`. Igual que en la SPEC 06, la tabla arranca vacía.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El refactor del registro rompe Asteroids, que hoy funciona. | El paso 1 lo convierte a `GameEngineEntry` sin tocar su motor, y hay criterios de aceptación específicos para `/jugar/asteroids`. |
| El `4 / 3` está en tres reglas CSS distintas y se olvida una; el canvas queda recortado o deformado. | El paso 2 las enumera (`.game-canvas`, `.crt-screen`, `.crt`) y los criterios comprueban los dos formatos, 420×600 y 800×600. |
| Portar «a ojo» cambia una constante y el juego deja de sentirse igual. | El paso 3 lista los valores exactos y declara que cambiarlos queda fuera de esta spec. |
| Convertir el HUD del DOM en callbacks se lleva por delante el contador de líneas, que no tiene casilla en el HUD de la plataforma. | Las líneas se dibujan en el panel del canvas y hay un criterio de aceptación que lo exige. |
| El `dt` en milisegundos se mezcla con el patrón en segundos de Asteroids y la velocidad de caída se va. | El motor conserva las unidades del original de punta a punta; sólo se añade el cap de 50 ms. |
| `P` llega a la vez al motor y a `GameCanvas`, y la pausa se enciende y se apaga en la misma pulsación. | `KeyP` sale de `GAME_KEYS` del motor y hay un criterio de aceptación para `P` y `Escape`. |
| El `setTimeout` del aviso de power-up sobrevive a la pausa o al desmontaje. | El aviso pasa a un temporizador que descuenta `dt` dentro del bucle; no queda ningún `setTimeout` en el motor. |
| La pieza 3×3 hueca sólo aparece a partir del nivel 3 y con un 5 % de probabilidad: es fácil dar por buena la implementación sin haberla visto nunca. | Su criterio de aceptación se verifica jugando desde el nivel 3, no por inspección del código. |

---

## Lo que **no** entra en esta spec

- El tema claro/oscuro del original y su `localStorage`.
- Un HUD distinto por juego en `components/game-player.tsx`.
- Arkanoid y los seis juegos de maqueta restantes.
- Controles táctiles, sonido y repetición automática al mantener una tecla.
- Renombrar la ficha `caida`, reescribir su copy o rediseñar `cover-tetro`.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.
- Rate limiting, antitrampas y validación de la puntuación en servidor.

Cada una de ellas, si entra, va en su propia spec.
