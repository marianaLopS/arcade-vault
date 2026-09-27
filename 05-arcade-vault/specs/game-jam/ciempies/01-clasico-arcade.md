# SPEC — CIEMPIÉS: clásico arcade

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-09-27
> **Objetivo:** Diseñar un port fiel al Centipede de 1981 — ciempiés segmentado que zigzaguea
> fila a fila por un campo de hongos destructibles, se divide en dos al recibir un impacto en
> el cuerpo, y una araña que cruza la zona del jugador de forma errática — como ficha nueva
> `ciempies` en categoría SHOOTER, con motor real y leaderboard en Supabase desde el primer día.

---

## Por qué existe esta spec

El catálogo tiene un solo juego SHOOTER real (`asteroids`, free-roam en gravedad cero) y uno en
maqueta (`invasores`, formación estática que desciende en bloque). Ninguno de los dos tiene un
enemigo **segmentado** que reacciona al impacto partiéndose, ni un **terreno destructible** que
condiciona el movimiento tanto del enemigo como del jugador. Centipede aporta las dos mecánicas
de una vez, y lo hace con un género de disparo distinto al de los otros dos: aquí no se dispara
en cualquier dirección ni se avanza en formación — se dispara siempre hacia arriba desde una
franja inferior fija, y el terreno se va comiendo a balazos según se juega.

Como con Snake (SPEC 10) y con la variante 01 de `ranaria`, **no hay código de referencia**: no
existe ninguna carpeta `References/.../centipede` en el repositorio, sólo la mención en
`game-suggestions-todo.md`. Las constantes de este documento son el diseño en sí, no el ajuste
de un port; cambiarlas durante la implementación es rediseñar, no implementar. Igual que Snake,
el motor dibuja todo con primitivas de canvas — rectángulos y arcos — sin spritesheet externo:
no hay ningún asset de Centipede que portar.

Esta variante es la lectura **mínima y fiel** del arcade original de 1981: ciempiés, hongos,
araña errática y la división al impacto. La segunda variante (`02-infestacion.md`) añade pulga,
escorpión y una progresión de dificultad explícita por oleada; esta se queda deliberadamente en
el conjunto más pequeño que ya es reconociblemente Centipede.

---

## Alcance

**Dentro:**

- `lib/games/ciempies/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createCiempiesGame`, sin assets externos — hongos, ciempiés, araña, jugador y disparos se
  dibujan con primitivas de canvas (rectángulos para hongos y jugador, círculos/arcos para
  cabeza de ciempiés y araña).
- Mundo lógico de **600×720**: grilla de 20×24 celdas de 30 px. Las 19 filas superiores
  (`y 0..570`) son el campo de hongos y ciempiés; las 5 filas inferiores (`y 570..720`) son la
  zona del jugador, de movimiento libre en píxeles (no encajado a celda).
- Campo de hongos destructibles: grilla de HP por celda, 4 impactos para destruir un hongo del
  todo, con degradación visual en cada impacto.
- Un ciempiés inicial de 12 segmentos que avanza celda a celda, invierte de sentido y desciende
  una fila al chocar con un hongo o con el borde del campo, y puede entrar en la zona del
  jugador.
- División del ciempiés: un disparo en la cabeza lo acorta por delante sin partirlo; un disparo
  en un segmento de cuerpo lo parte en dos ciempiés independientes y deja un hongo nuevo en la
  celda del impacto.
- Una araña que cruza la zona del jugador y las dos últimas filas del campo con trayectoria
  errática, puede comerse hongos a su paso y vale más puntos cuanto más cerca del jugador se la
  elimina.
- Jugador con movimiento libre en 8 direcciones dentro de su zona y disparo vertical con
  cadencia limitada.
- Progresión simple por oleada: al eliminar todos los ciempiés del campo aparece uno nuevo, más
  largo y más rápido, y se añaden hongos nuevos sin borrar los supervivientes.
- Nueva ficha `ciempies` en `lib/games.ts` (categoría `SHOOTER`) y clase de portada
  `cover-ciempies` en `app/globals.css`.
- Una línea `ciempies` en `GAME_ENGINES` (`lib/games/registry.ts`).
- Migración `insert into public.games (id, title) values ('ciempies', 'CIEMPIÉS')` y su
  aplicación.

**Fuera de alcance (para specs futuras o para la variante `02-infestacion.md`):**

- Pulga y escorpión, y cualquier mecánica de veneno sobre los hongos.
- Progresión de dificultad con fórmulas explícitas por nivel más allá del incremento simple de
  esta variante.
- Un segundo modo de juego.
- Sonido.
- Controles táctiles.
- Skins (`clasico`/`neon`/`retro`).
- Puntuación de bonus por vidas sobrantes al terminar la partida.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla nueva, ni columna, ni tipo de plataforma.** `GameEngineEntry` ya
existe desde la SPEC 08, `scores` y `game_stats` sirven a este juego sin tocarlas, y el
leaderboard se enciende con una fila en `games`.

Tipos locales del motor, sin exportar:

```ts
type Dir = -1 | 1; // sentido horizontal del ciempiés: -1 izquierda, 1 derecha
type Segment = { col: number; row: number };
type Centipede = { segments: Segment[]; dir: Dir; tickAccum: number };
type Mushroom = { hp: number }; // 0 = no hay hongo, 1..MUSHROOM_HP_MAX = vivo
type Player = { x: number; y: number }; // px, centro; clamado a ZONA_JUGADOR
type Shot = { x: number; y: number }; // px, único disparo activo posible
type Spider = { x: number; y: number; vx: number; vy: number; life: number };
```

Estado en la clausura de `createCiempiesGame`:

- `mushrooms: Mushroom[]` — array plano de `COLS * ROWS` celdas (`índice = row * COLS + col`);
  las celdas de `ZONA_JUGADOR` (`row >= 19`) también pueden tener hongos, con la misma regla.
- `centipedes: Centipede[]` — uno o varios ciempiés vivos a la vez tras una división.
- `player: Player`, `shot: Shot | null`, `spider: Spider | null`.
- `score`, `lives`, `level`.
- `shotCooldownAccum` (ms), `spiderSpawnAccum` (ms), `nextSpiderIn` (ms, recalculado tras cada
  desaparición).
- Bucle: `rafId`, `lastTime`, `destroyed`. Entrada: `keys: Set<string>`.

**Grilla y zonas**, mundo lógico 600×720:

```
COLS 20 · ROWS 24 · CELL 30 px
CAMPO: filas 0..18 (19 filas) · y 0..570 — hongos y ciempiés
ZONA_JUGADOR: filas 19..23 (5 filas) · y 570..720 — jugador de movimiento libre en píxeles
```

---

## Plan de implementación

### 1. Constantes y grilla de hongos

`lib/games/ciempies/engine.ts`, primera parte. Constantes de diseño:

```
W 600 · H 720 · CELL 30 · COLS 20 · ROWS 24
MUSHROOM_HP_MAX 4 (4 impactos degradan el hongo por 4 estados visuales antes de desaparecer)
MUSHROOM_DENSITY_INICIAL 0.06 (≈23 hongos sobre las 380 celdas de las 19 filas del campo,
  sembrados con posición aleatoria al iniciar la partida; nunca en la fila 0)
MUSHROOM_REGEN_POR_NIVEL 3 (hongos nuevos añadidos en celdas libres del campo al empezar cada
  nivel, sin tocar los hongos supervivientes)
POINTS_MUSHROOM_HIT 1 (por cada disparo que impacta un hongo, lo destruya o no)
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

`sembrarHongos(densidad)`, `impactarHongo(col, row)` (resta 1 de HP, devuelve si quedó
destruido), `hayHongo(col, row)`.

Comprobación: `npm run build` limpio con el motor aún sin registrar.

### 2. Ciempiés: movimiento, colisión y división

Constantes:

```
SEGMENT_COUNT(nivel) = min(12 + (nivel-1) * 2, 24)
TICK_MS(nivel) = max(60, 130 - (nivel-1) * 8)   (ms entre cada avance de una celda)
POINTS_HEAD 100 · POINTS_BODY 10
```

Lógica por tick, para cada `Centipede` de forma independiente:

- La cabeza intenta avanzar una celda en `dir`. Si la celda destino está fuera de `0..COLS-1` o
  tiene un hongo con `hp > 0`, la cabeza no avanza: invierte `dir` y desciende una fila
  (`row + 1`). Si `row` ya es `ROWS - 1` (última fila del mundo), se queda ahí y sigue
  invirtiendo `dir` contra los bordes laterales indefinidamente.
- Cada segmento de cuerpo ocupa, en el tick actual, la celda que ocupaba el segmento anterior en
  el tick previo — el mismo modelo seguidor que la cola de Snake (SPEC 10).
- Si cualquier celda del ciempiés coincide con la posición del jugador (ver paso 3), el jugador
  pierde una vida y ese segmento muere.
- Impacto de disparo en la cabeza (índice 0): el segmento muere, suma `POINTS_HEAD`, y el
  segmento 1 pasa a ser la nueva cabeza sin partir la cadena.
- Impacto de disparo en un segmento de cuerpo (índice `k > 0`): el segmento muere, suma
  `POINTS_BODY`, y crea un hongo nuevo (`hp = MUSHROOM_HP_MAX`) en su celda. La cadena se parte
  en dos: `A = segmentos[0..k-1]` conserva la cabeza, `dir` y fila originales; `B =
  segmentos[k+1..fin]`, donde el segmento `k+1` pasa a ser la nueva cabeza de `B`, con la misma
  fila y `dir` que tenía el ciempiés antes de partirse. Desde ese tick, `A` y `B` se mueven de
  forma completamente independiente.
- Un ciempiés sin segmentos se elimina de `centipedes`.
- Nivel superado cuando `centipedes.length === 0`: se llama `sembrarHongos` adicional
  (`MUSHROOM_REGEN_POR_NIVEL`), `level++`, y se crea un ciempiés nuevo de
  `SEGMENT_COUNT(level)` segmentos en la fila 0, sentido `1` (derecha), columna inicial 0.

Comprobación: `npm run build` limpio; con el motor arrancado a mano, un ciempiés de prueba
zigzaguea y desciende contra un hongo colocado a propósito.

### 3. Jugador y disparo

Constantes:

```
PLAYER_SIZE 22 px (cuadrado) · posición inicial (x=300, y=690)
PLAYER_SPEED 260 px/s en las 8 direcciones, clamado a x∈[11,589] · y∈[581,709]
SHOT_SPEED 480 px/s hacia arriba (vy negativa) desde el centro del jugador
SHOT_COOLDOWN 220 ms · MAX_SHOTS_ON_SCREEN 1
LIVES_START 3
```

- `keys` acumula `ArrowUp/Down/Left/Right`, `KeyW/A/S/D`: el vector de movimiento se normaliza
  en diagonal para no ir más rápido que `PLAYER_SPEED`.
- `Space` dispara solo si `shot === null` y `shotCooldownAccum >= SHOT_COOLDOWN`; crea un
  `Shot` en el centro del jugador y reinicia el acumulador.
- El disparo avanza cada frame; al salir de `y < 0` se destruye sin efecto. Contra un hongo,
  llama `impactarHongo` y suma `POINTS_MUSHROOM_HIT` si no había ciempiés ni araña en esa celda
  primero (los enemigos tienen prioridad de colisión sobre el terreno).
- Contra un segmento de ciempiés o la araña, aplica la lógica del paso 2 o del paso 4 y destruye
  el disparo.
- Tocar al jugador con un segmento de ciempiés o con la araña: `lives--`, `onLives(lives)`; si
  `lives === 0`, `onGameOver(score)`. Si quedan vidas, el jugador vuelve al centro de su zona
  (`x=300, y=690`) y el disparo activo se destruye.

Comprobación: `npm run build` limpio; el jugador se mueve dentro de su zona y el disparo destruye
un hongo de prueba en 4 impactos.

### 4. La araña

Constantes:

```
SPIDER_SPAWN_INTERVAL_MS: aleatorio entre 4000 y 9000 tras cada desaparición; una araña activa
  como máximo a la vez
SPIDER_ZONE: y ∈ [510, 720] (las dos últimas filas del campo más la zona del jugador)
SPIDER_SPEED: 140–220 px/s, fijada al azar por instancia
SPIDER_VECTOR_CHANGE_MS 300 (cada 300 ms elige un nuevo vector aleatorio dentro de su zona)
SPIDER_LIFETIME_MS 8000 (desaparece sola si nadie la elimina antes)
SPIDER_EAT_CHANCE 0.5 por cada 100 ms de contacto con la celda de un hongo (lo destruye del
  todo si acierta la probabilidad)
SPIDER_POINTS: 900 si el disparo la alcanza a menos de 100 px verticales del jugador, 600 entre
  100 y 250 px, 300 a más de 250 px
```

- Rebota en los bordes laterales (`x=0`, `x=600`) y en los límites verticales de su zona
  (`y=510`, `y=720`) invirtiendo la componente correspondiente de su vector.
- Tocar al jugador aplica la misma penalización de vida del paso 3 y la elimina.
- Un disparo que la alcanza suma los puntos según la distancia vertical al jugador **en el
  momento del impacto** y la elimina.

Comprobación: con el motor arrancado a mano, una araña de prueba cruza erráticamente su zona y
desaparece sola a los 8 segundos si no se le dispara.

### 5. Bucle, entrada y avisos

- `emit()` con `lastScore` / `lastLives` / `lastLevel`, llamando a los callbacks sólo cuando el
  valor cambia.
- `onLives(LIVES_START)` al iniciar la partida.
- `onGameOver(score)` una sola vez, cuando `lives` llega a 0, después de detener el bucle.
- `restart()`: detiene el bucle, limpia hongos/ciempiés/araña/disparo, reinicia `score`,
  `lives`, `level` a sus valores iniciales, siembra el campo y arranca un ciempiés nuevo.
- `dt` en milisegundos, capado a `DT_MAX 50`; `lastTime = null` al reanudar.
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`, `KeyD`,
  `Space`. `preventDefault()` solo para esas.
- Listeners `keydown` / `keyup` / `blur` sobre el canvas, nunca sobre `window` o `document`.
- `destroy()` cancela el frame, quita los tres listeners y es idempotente.
- `initGame(); draw();` antes de devolver el motor.

Comprobación: `getEngine("ciempies")` (tras el paso 7) devuelve la entrada y `npm run build`
sigue limpio.

### 6. Catálogo: nueva ficha `ciempies`

`lib/games.ts`, nueva entrada en `GAMES`:

```ts
{
  id: "ciempies",
  title: "CIEMPIÉS",
  short: "Dispara al ciempiés antes de que te alcance entre los hongos.",
  long: "Un ciempiés de doce segmentos serpentea fila a fila por un campo de hongos venenosos. Cada disparo en el cuerpo lo parte en dos amenazas independientes, y una araña errática cruza tu zona sin previo aviso. Sobrevive, despeja el campo y prepárate para la siguiente oleada, más larga y más rápida.",
  cat: "SHOOTER",
  cover: "cover-ciempies",
  color: "green",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `.cover-ciempies` nueva, en el mismo patrón que las portadas generadas
existentes (gradiente o patrón repetido, sin imagen externa).

Comprobación: `/juegos/ciempies` muestra la ficha en la biblioteca con su portada, antes de que
el motor esté registrado (cae en `.game-arena` con `seededScores()`).

### 7. Registrar el motor

`lib/games/registry.ts`:

```ts
ciempies: {
  create: createCiempiesGame,
  width: 600,
  height: 720,
  controls: "flechas o WASD para mover, espacio para disparar hacia arriba",
  touch: { a: { code: "Space", label: "DISPARO" } },
},
```

Comprobación: `/jugar/ciempies` pinta el canvas real en vez de `.game-arena`.

### 8. Leaderboard

`supabase/migrations/<timestamp>_juego_ciempies.sql`:

```sql
insert into public.games (id, title) values ('ciempies', 'CIEMPIÉS');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. Los tipos no se
regeneran: insertar una fila no cambia el esquema.

Comprobación: `select * from public.games` incluye la fila `ciempies`.

### 9. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido
manual de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/ciempies` muestra un canvas de 600×720 con hongos, ciempiés, araña y jugador, no
      la `.game-arena`.
- [ ] El ciempiés arranca con 12 segmentos en la fila 0 y avanza celda a celda hacia la derecha.
- [ ] Al chocar con un hongo o con el borde lateral, el ciempiés invierte de sentido y desciende
      una fila.
- [ ] Un disparo en la cabeza la elimina, suma 100 puntos y el siguiente segmento pasa a ser la
      nueva cabeza sin partir la cadena.
- [ ] Un disparo en un segmento de cuerpo lo elimina, suma 10 puntos, deja un hongo nuevo en esa
      celda y parte el ciempiés en dos cadenas que a partir de ese momento se mueven de forma
      independiente.
- [ ] Cuatro impactos sobre el mismo hongo lo destruyen, con degradación visual visible en cada
      impacto, y cada impacto suma 1 punto.
- [ ] El jugador se mueve en las 8 direcciones dentro de su franja inferior y no puede salir de
      ella.
- [ ] Sólo hay un disparo activo a la vez: pulsar espacio con un disparo en pantalla no crea uno
      segundo.
- [ ] Tocar al jugador con un segmento de ciempiés o con la araña resta una vida en el HUD y
      reaparece en el centro de su zona.
- [ ] Una araña aparece dentro de los primeros 9 segundos de partida, cruza erráticamente su
      zona y desaparece sola si nadie le dispara en 8 segundos.
- [ ] Dispararle a la araña cerca del jugador (menos de 100 px) suma más puntos que dispararle
      lejos (más de 250 px).
- [ ] Al eliminar todos los ciempiés del campo aparece uno nuevo con más segmentos y más rápido,
      y los hongos supervivientes no desaparecen.
- [ ] Perder la última vida abre el modal `FIN DEL JUEGO` con la puntuación real.
- [ ] `JUGAR DE NUEVO` reinicia campo, ciempiés, puntuación, vidas y nivel sin recargar la
      página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'ciempies'`.
- [ ] Esa puntuación aparece en `/salon?juego=ciempies` y en `/juegos/ciempies` sin recargar a
      mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Con `scores` vacía para este juego, `/salon?juego=ciempies` muestra el estado vacío.
- [ ] El botón `PAUSA` congela el juego y `REANUDAR` lo reanuda sin que ningún segmento pegue un
      salto.
- [ ] `P` y `Escape` hacen lo mismo que el botón, y el motor no los interpreta como jugada.
- [ ] Con el canvas enfocado, las flechas, WASD y el espacio no hacen scroll de la página.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid` y `/jugar/snake` se juegan igual que
      antes.
- [ ] `select * from public.games` incluye una fila `ciempies` además de las ya existentes.
- [ ] `lib/games.ts` mantiene sin tocar las fichas de los demás juegos.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/ciempies`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** mundo lógico 600×720, distinto de los 800×600 de Asteroids/Arkanoid/Snake y de los
  420×600 de Caída. El original de 1981 es vertical y angosto; forzar 800×600 estiraría el
  campo de hongos hasta hacerlo irreconocible.
- **Sí:** zona del jugador de movimiento libre en píxeles, no encajada a celda. Es fiel al
  original — la nave se mueve suave dentro de su franja — y es más jugable que un movimiento
  discreto para esquivar la araña.
- **Sí:** un disparo en pantalla a la vez, con cadencia de 220 ms. Es la regla clásica del
  arcade y evita convertir el juego en una cortina de balas que trivializa al ciempiés.
- **Sí:** la división del ciempiés deja un hongo nuevo en la celda del impacto. Es la regla
  original; además da al jugador una razón para pensar dónde dispara, no sólo cuándo.
- **No:** decapitar (impacto en la cabeza) también parte la cadena. En el original y en esta
  spec, matar la cabeza sólo acorta el ciempiés por delante; partirlo es exclusivo del cuerpo.
- **Sí:** un ciempiés que llega a la última fila se queda deambulando ahí en vez de desaparecer.
  Desaparecer premiaría dejarlo llegar abajo; quedarse ahí lo mantiene como amenaza constante en
  la zona del jugador.
- **Sí:** araña con vector aleatorio que cambia cada 300 ms, en vez de una trayectoria fija.
  Es lo que hace a la araña sentirse «errática» y no un enemigo predecible más.
- **Sí:** puntuación de la araña según distancia al jugador en el momento del disparo. Es la
  regla del original y premia el riesgo de dispararle de cerca.
- **No:** pulga, escorpión ni veneno en esta variante. Son la capa extra de `02-infestacion.md`;
  incluirlos aquí duplicaría esa spec en vez de ofrecer una alternativa real.
- **Sí:** progresión simple (más segmentos, más velocidad, hongos añadidos sin borrar los
  supervivientes) en vez de una fórmula de dificultad elaborada. Esta variante es la lectura
  mínima; la progresión explícita por nivel es la diferencia central de la otra variante.
- **No:** sembrar puntuaciones en `scores`.
- **No:** skins. Ningún juego SHOOTER nuevo necesita paletas alternativas para esta primera
  propuesta; es una capa independiente que puede añadirse después con `skin-designer`.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El modelo seguidor de segmentos (igual que la cola de Snake) puede desincronizarse tras una división si no se copian bien los índices. | El paso 2 fija la regla exacta de partición (`A = [0..k-1]`, `B = [k+1..fin]` con nueva cabeza) y hay un criterio de aceptación específico para verificarla jugando. |
| Varios ciempiés independientes tras sucesivas divisiones pueden acabar sincronizados y solaparse en la misma celda, rompiendo la ilusión de dos amenazas separadas. | Cada `Centipede` lleva su propio `tickAccum`, así que no todos avanzan en el mismo frame exacto; se verifica visualmente tras dos o más divisiones seguidas. |
| Un ciempiés atrapado en la última fila puede volverse trivial de esquivar si el jugador simplemente no se acerca. | Su presencia bloquea parte de la zona del jugador y la araña sigue cruzando esa misma franja, manteniendo la tensión. |
| La araña con vector puramente aleatorio puede quedarse pegada a un borde rebotando sin cruzar nunca la pantalla. | El cambio de vector cada 300 ms fuerza una nueva dirección aleatoria con regularidad; se verifica jugando varias apariciones. |
| Portar «a ojo» sin código de referencia hace que las constantes se ajusten durante la implementación en vez de fijarse antes. | El paso 1 y 2 las fijan explícitamente y las declaran fuera de cambio, como hizo Snake (SPEC 10). |
| Un disparo puede impactar a la vez un hongo y un segmento de ciempiés en la misma celda, y el orden de resolución decide qué puntúa. | El paso 3 fija la prioridad: los enemigos (ciempiés, araña) resuelven la colisión antes que el terreno. |

---

## Lo que **no** entra en esta spec

- Pulga, escorpión y veneno sobre los hongos.
- Progresión de dificultad con fórmulas explícitas de densidad y velocidad por nivel.
- Un segundo modo de juego.
- Sonido.
- Controles táctiles más allá del botón de disparo declarado en el registro.
- Skins (`clasico`/`neon`/`retro`).
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.
- Rate limiting, antitrampas y validación de la puntuación en servidor.

Cada una de ellas, si entra, va en su propia spec.
