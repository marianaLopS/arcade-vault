# SPEC — CIEMPIÉS: infestación creciente

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-09-27
> **Objetivo:** Diseñar `ciempies` como una progresión de oleadas con dificultad explícita
> creciente (densidad de hongos y velocidad por fórmula, no por incremento fijo) y dos enemigos
> adicionales del arcade original — la pulga, que resiembra hongos cuando el campo queda pelado,
> y el escorpión, que envenena hongos y hace que el ciempiés se lance en picado hacia el
> jugador — para una partida con arco de tensión largo en vez de oleadas idénticas.

---

## Por qué existe esta spec

Esta es la segunda variante de diseño para `ciempies`, junto a
`specs/game-jam/ciempies/01-clasico-arcade.md`. Comparte con ella el género, el mundo lógico de
600×720, la grilla de 20×24 celdas de 30 px, el contrato `GameEngine` y los controles: mismo
movimiento libre del jugador en su franja inferior, mismo disparo vertical con cadencia
limitada, mismo modelo de ciempiés seguidor con división al impacto en el cuerpo. Nada de eso
cambia entre variantes, tal y como exige el diseño compartido.

Lo que cambia es el eje central: en vez de una progresión simple (más segmentos, más velocidad,
hongos añadidos sin borrar), aquí cada oleada **resiembra el campo entero** con una densidad de
hongos que crece por fórmula, y aparecen dos enemigos que el arcade original tenía desde el
primer nivel y que la variante 01 deja fuera a propósito: la **pulga**, que cae en línea recta y
plantа hongos nuevos si el jugador ha dejado el campo demasiado pelado, y el **escorpión**, que
envenena los hongos que toca — un hongo envenenado hace que el segmento de ciempiés que lo
alcanza deje de zigzaguear y se lance en picado, en línea recta, hacia la zona del jugador. Es la
mecánica que en el arcade original convierte una partida tranquila en una emergencia repentina.

Como en la variante 01 y como Snake (SPEC 10), no hay código de referencia: no existe ninguna
carpeta `References/.../centipede`, así que las constantes de este documento son el diseño, no
un ajuste posterior.

---

## Alcance

**Dentro:**

- `lib/games/ciempies/engine.ts`: **el mismo motor y el mismo archivo** que la variante 01
  implementaría — esta spec describe una implementación alternativa completa, no un parche. Si
  se promueve esta variante en vez de la 01, es este documento el que gobierna el archivo.
- Mismo mundo lógico: 600×720, grilla de 20×24 celdas de 30 px, campo de hongos en las filas
  0..18 y zona del jugador de movimiento libre en las filas 19..23.
- Mismo modelo base de ciempiés (seguidor por segmentos, zigzagueo, división al impacto en el
  cuerpo, decapitación simple en la cabeza) y de disparo (un disparo activo, cadencia limitada).
- **Progresión explícita por nivel:** cada nivel resiembra el campo completo con una densidad de
  hongos, un número de segmentos y una velocidad de ciempiés calculados por fórmula a partir del
  número de nivel, en vez de un incremento fijo constante.
- **Pulga:** aparece cuando el número de hongos vivos en el campo cae por debajo de un umbral
  (que también depende del nivel), cae en línea recta por una columna y siembra hongos nuevos
  más frágiles a su paso.
- **Escorpión:** cruza una fila del campo en línea recta y envenena los hongos que toca; un
  segmento de ciempiés que llega a un hongo envenenado se lanza en picado hacia la zona del
  jugador en vez de zigzaguear.
- Nueva ficha `ciempies` en `lib/games.ts` (categoría `SHOOTER`) y clase de portada
  `cover-ciempies` en `app/globals.css` — mismo `id`, copy propio de esta variante.
- Una línea `ciempies` en `GAME_ENGINES` (`lib/games/registry.ts`), idéntica a la de la
  variante 01 salvo por apuntar a esta implementación.
- Migración `insert into public.games (id, title) values ('ciempies', 'CIEMPIÉS')` y su
  aplicación.

**Fuera de alcance (para specs futuras o si se prefiere la variante 01):**

- La araña errática de la variante 01. Esta variante concentra su presupuesto de enemigos
  nuevos en pulga y escorpión; añadir también la araña sería una tercera variante, no esta.
- Un segundo modo de juego adicional a la progresión de oleadas descrita aquí.
- Sonido.
- Controles táctiles más allá del botón de disparo declarado en el registro.
- Skins (`clasico`/`neon`/`retro`).
- Selector de dificultad inicial o de nivel de partida.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla nueva, ni columna, ni tipo de plataforma.** `GameEngineEntry` ya
existe desde la SPEC 08, `scores` y `game_stats` sirven a este juego sin tocarlas, y el
leaderboard se enciende con una fila en `games`.

Tipos locales del motor, sin exportar:

```ts
type Dir = -1 | 1;
type Segment = { col: number; row: number; diving: boolean }; // diving = en picado venenoso
type Centipede = { segments: Segment[]; dir: Dir; tickAccum: number };
type Mushroom = { hp: number; poisonedUntil: number }; // poisonedUntil en ms de partida, 0 = no envenenado
type Player = { x: number; y: number };
type Shot = { x: number; y: number };
type Flea = { x: number; y: number; col: number };
type Scorpion = { x: number; row: number; dir: Dir };
```

Estado en la clausura de `createCiempiesGame`:

- `mushrooms: Mushroom[]` — array plano de `COLS * ROWS`, igual disposición que la variante 01,
  pero cada celda añade `poisonedUntil`.
- `centipedes: Centipede[]`, `player: Player`, `shot: Shot | null`.
- `flea: Flea | null`, `scorpion: Scorpion | null`.
- `score`, `lives`, `level`, `elapsedMs` (reloj de partida, usado para expirar el veneno).
- `shotCooldownAccum`, `fleaCheckAccum`, `scorpionSpawnAccum`, `nextScorpionIn`.
- Bucle: `rafId`, `lastTime`, `destroyed`. Entrada: `keys: Set<string>`.

**Grilla y zonas**, idénticas a la variante 01:

```
COLS 20 · ROWS 24 · CELL 30 px
CAMPO: filas 0..18 (19 filas) · y 0..570
ZONA_JUGADOR: filas 19..23 (5 filas) · y 570..720
```

---

## Plan de implementación

### 1. Constantes compartidas y grilla de hongos

Idéntico a la variante 01 en lo estructural, con el campo `poisonedUntil` añadido:

```
W 600 · H 720 · CELL 30 · COLS 20 · ROWS 24
MUSHROOM_HP_MAX 4
POINTS_MUSHROOM_HIT 1
POISON_DURATION_MS 15000 (tras este tiempo sin que el escorpión lo retoque, el hongo deja de
  estar envenenado; el veneno no cambia su HP ni su aspecto de daño, solo añade un tinte visual)
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Comprobación: `npm run build` limpio con el motor aún sin registrar.

### 2. Progresión por nivel y resiembra del campo

Constantes de progresión, **fórmulas explícitas** en vez de incrementos fijos:

```
SEGMENT_COUNT(nivel) = min(10 + nivel * 3, 30)
TICK_MS(nivel) = max(50, 140 - nivel * 10)
MUSHROOM_DENSITY(nivel) = min(0.05 + nivel * 0.015, 0.18)
```

Al empezar el nivel 1 y al completar cada nivel (`centipedes.length === 0`, ver paso 3): se
**resiembra el campo entero** desde cero a `MUSHROOM_DENSITY(nivel)` (no se conservan los hongos
del nivel anterior, a diferencia de la variante 01), se limpian `flea` y `scorpion` activos, y se
crea un ciempiés nuevo de `SEGMENT_COUNT(nivel)` segmentos en la fila 0.

Comprobación: con el motor arrancado a mano y forzando `level = 5`, el campo se resiembra con
notablemente más hongos que en `level = 1`.

### 3. Ciempiés: movimiento, división y picado venenoso

Mismo modelo base que la variante 01 (seguidor por segmentos, zigzagueo con inversión y descenso
de fila al chocar, decapitación simple en la cabeza, división en dos cadenas independientes al
impacto en el cuerpo con `POINTS_HEAD 100` / `POINTS_BODY 10` y un hongo nuevo en la celda del
impacto). Se añade una regla:

- Si la celda a la que la cabeza intentaría avanzar tiene un hongo con `poisonedUntil > elapsedMs`
  (envenenado y aún vigente), el segmento no invierte `dir` ni desciende por el choque normal:
  entra en modo `diving` — mantiene su columna y su `dir` horizontal congelados y desciende una
  fila cada tick, ignorando hongos y bordes, hasta salir de la fila del campo (entrar en
  `ZONA_JUGADOR`) o hasta que el veneno de esa celda expire, momento en el que retoma el
  comportamiento normal desde su fila y columna actuales.
- Un segmento en modo `diving` sigue pudiendo ser alcanzado por un disparo con las mismas reglas
  de cabeza/cuerpo del paso 2 de la variante 01.

Comprobación: con un hongo marcado `poisonedUntil` a mano por delante del ciempiés, el segmento
que lo alcanza desciende en línea recta en vez de invertir de sentido.

### 4. La pulga

Constantes:

```
FLEA_THRESHOLD(nivel) = max(3, 5 - floor(nivel / 3))
FLEA_CHECK_INTERVAL_MS 1000 (cada segundo, si los hongos vivos del campo están por debajo del
  umbral y no hay ya una pulga activa, aparece una con probabilidad 0.4)
FLEA_SPEED 260 px/s, cae en línea recta por una columna aleatoria desde la fila 0
FLEA_MUSHROOM_CHANCE 0.35 por cada fila que atraviesa: si la celda no tiene ya hongo, plantа uno
  nuevo con hp = 1 (más frágil que uno sembrado al inicio del nivel)
FLEA_POINTS 200 · un disparo la destruye
```

Tocar al jugador aplica la misma penalización de vida que un ciempiés (ver paso 6). Si llega a
`ZONA_JUGADOR` sin ser destruida, desaparece sin más efecto.

Comprobación: vaciando el campo de hongos a mano por debajo del umbral, aparece una pulga dentro
del segundo siguiente con probabilidad visible en varias repeticiones.

### 5. El escorpión

Constantes:

```
SCORPION_SPAWN_INTERVAL_MS: aleatorio entre 12000 y 20000 tras cada desaparición; uno activo
  como máximo a la vez
SCORPION_ROW: aleatoria entre 0 y 18 al aparecer
SCORPION_SPEED 160 px/s, cruza en línea recta de un borde lateral al otro
SCORPION_POINTS 1000 · un disparo lo destruye
```

- Al pasar por la celda de un hongo con `hp > 0`, le fija `poisonedUntil = elapsedMs +
  POISON_DURATION_MS` sin cambiar su `hp`.
- Al salir del lado opuesto de la pantalla desaparece sin más efecto.
- Tocar al jugador **no** aplica penalización: el escorpión, como en el original, es peligroso
  por lo que envenena, no por contacto directo.

Comprobación: con el motor arrancado a mano, un hongo tocado por el escorpión queda marcado
`poisonedUntil` durante 15 segundos y luego vuelve a su comportamiento normal.

### 6. Jugador, disparo, bucle, entrada y avisos

Idéntico a los pasos 3 y 5 de la variante 01: mismo `PLAYER_SIZE`, `PLAYER_SPEED`, `SHOT_SPEED`,
`SHOT_COOLDOWN`, `MAX_SHOTS_ON_SCREEN`, `LIVES_START`, mismas `GAME_KEYS`
(`ArrowUp/Down/Left/Right`, `KeyW/A/S/D`, `Space`), mismos listeners sobre el canvas y mismo
`emit()`/`onGameOver()`/`restart()`/`destroy()`. El disparo, además de ciempiés y araña (que no
existe en esta variante), resuelve colisión contra pulga y escorpión con la misma prioridad
sobre el terreno que en la variante 01.

Comprobación: `getEngine("ciempies")` (tras el paso 8) devuelve la entrada y `npm run build`
sigue limpio.

### 7. Catálogo: nueva ficha `ciempies`

`lib/games.ts`, nueva entrada en `GAMES` (mismo `id`, `cat` y `cover` que la variante 01; copy
propio de esta variante):

```ts
{
  id: "ciempies",
  title: "CIEMPIÉS",
  short: "Ciempiés, pulgas y un escorpión venenoso: sobrevive a la infestación.",
  long: "El campo de hongos crece de oleada en oleada: más denso, más rápido, más hostil. Las pulgas siembran hongos nuevos si dejas el terreno pelado, y un escorpión envenena los hongos que toca, haciendo que el ciempiés se lance en picado directo hacia ti. ¿Aguantarás la progresión completa?",
  cat: "SHOOTER",
  cover: "cover-ciempies",
  color: "green",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `.cover-ciempies` nueva, compartida con la variante 01 si se implementan
ambas (misma portada, distinto motor por debajo).

Comprobación: `/juegos/ciempies` muestra la ficha en la biblioteca con su portada, antes de que
el motor esté registrado.

### 8. Registrar el motor

`lib/games/registry.ts`, idéntico a la variante 01:

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

### 9. Leaderboard

`supabase/migrations/<timestamp>_juego_ciempies.sql`:

```sql
insert into public.games (id, title) values ('ciempies', 'CIEMPIÉS');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. Los tipos no se
regeneran: insertar una fila no cambia el esquema.

Comprobación: `select * from public.games` incluye la fila `ciempies`.

### 10. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido
manual de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/ciempies` muestra un canvas de 600×720 con hongos, ciempiés y jugador, no la
      `.game-arena`.
- [ ] El nivel 1 arranca con un ciempiés de 13 segmentos (`SEGMENT_COUNT(1) = 13`) y una
      densidad de hongos visiblemente menor que el nivel 5.
- [ ] Al completar un nivel (todos los ciempiés eliminados), el campo se resiembra por completo
      con más hongos que el nivel anterior, según `MUSHROOM_DENSITY(nivel)`.
- [ ] La velocidad del ciempiés aumenta de forma medible entre el nivel 1 y el nivel 4
      (`TICK_MS` menor, avance más rápido).
- [ ] Un disparo en la cabeza del ciempiés lo acorta sin partirlo; un disparo en el cuerpo lo
      parte en dos cadenas independientes y deja un hongo nuevo en la celda del impacto, igual
      que en la variante clásica.
- [ ] Vaciar el campo de hongos por debajo del umbral de nivel hace aparecer una pulga dentro
      del minuto siguiente.
- [ ] La pulga cae en línea recta por una columna y planta al menos un hongo nuevo a su paso en
      una repetición de varias caídas.
- [ ] Un disparo destruye la pulga y suma 200 puntos.
- [ ] Un escorpión cruza el campo en línea recta a intervalos entre 12 y 20 segundos.
- [ ] Un hongo tocado por el escorpión queda marcado como envenenado (diferenciable
      visualmente) durante 15 segundos y luego vuelve a la normalidad.
- [ ] Un segmento de ciempiés que llega a un hongo envenenado se lanza en picado en línea recta
      hacia la zona del jugador en vez de invertir de sentido.
- [ ] Un disparo destruye el escorpión y suma 1000 puntos; tocarlo con el jugador no resta vida.
- [ ] El jugador se mueve en las 8 direcciones dentro de su franja inferior y no puede salir de
      ella.
- [ ] Sólo hay un disparo activo a la vez.
- [ ] Tocar al jugador con un segmento de ciempiés o con la pulga resta una vida en el HUD.
- [ ] Perder la última vida abre el modal `FIN DEL JUEGO` con la puntuación real.
- [ ] `JUGAR DE NUEVO` reinicia al nivel 1 con su densidad y velocidad correspondientes, sin
      recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'ciempies'`.
- [ ] Esa puntuación aparece en `/salon?juego=ciempies` y en `/juegos/ciempies` sin recargar a
      mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Con `scores` vacía para este juego, `/salon?juego=ciempies` muestra el estado vacío.
- [ ] El botón `PAUSA` congela el juego, incluido el temporizador de veneno, y `REANUDAR` lo
      reanuda sin que un hongo pierda su estado envenenado de golpe.
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

- **Sí:** compartir con la variante 01 el mundo lógico, la grilla, el modelo de ciempiés
  seguidor con división al impacto y el esquema de controles. Son las decisiones que el tema
  fija antes de diseñar las variantes; cambiar cualquiera de ellas aquí produciría dos juegos
  distintos en vez de dos diseños del mismo juego.
- **Sí:** resiembra completa del campo en cada nivel en vez de conservar los hongos
  supervivientes (a diferencia de la variante 01). Es lo que hace visible la fórmula de
  densidad creciente: si se conservaran los hongos viejos, la densidad real dependería de cuánto
  haya destruido el jugador, no del nivel.
- **Sí:** fórmulas explícitas (`min`/`max` con el número de nivel) en vez de una tabla de
  valores fija por nivel. Escalan sin límite de niveles definidos de antemano, y acotan el
  extremo (`min(...)`, `max(...)`) para que el juego no se vuelva imposible o trivial de golpe.
- **Sí:** pulga y escorpión en vez de la araña de la variante 01. Cubren un tipo de amenaza
  distinto — presión sobre el terreno (pulga) y sabotaje del comportamiento del ciempiés
  (escorpión) — mientras que la araña es amenaza directa contra el jugador; mezclar los tres en
  una sola variante sería una tercera propuesta, no una alternativa clara a la 01.
- **Sí:** el picado venenoso ignora hongos y bordes mientras dura. Es la regla clásica del
  arcade original y es lo que distingue un hongo envenenado de uno normal: sin este efecto, el
  escorpión sería solo un enemigo más para dispararle, sin aportar nada al ciempiés.
- **No:** el escorpión hace daño al jugador por contacto. En el arcade original su peligro es
  indirecto (lo que provoca en el ciempiés); convertirlo también en amenaza de contacto directo
  lo volvería redundante con la pulga.
- **Sí:** la pulga solo aparece cuando el campo está pelado (`FLEA_THRESHOLD` depende del
  nivel). Es la regla original y le da al jugador una razón para no arrasar todos los hongos sin
  criterio.
- **No:** araña. Queda reservada a la variante 01; incluirla aquí también borraría la diferencia
  real de diseño entre ambas propuestas.
- **No:** selector de dificultad inicial. La progresión ya empieza suave (`nivel 1`) y sube por
  fórmula; un selector añadiría una decisión de UI que no cambia el diseño del juego.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Resembrar el campo entero en cada nivel puede destruir hongos justo debajo del jugador y dejarlo expuesto sin terreno de cobertura durante un instante. | La resiembra ocurre solo entre niveles, cuando ya no hay ciempiés activos ni amenaza inmediata; se verifica que el jugador no reciba daño en ese instante. |
| La fórmula `MUSHROOM_DENSITY(nivel)` sin techo bien probado podría saturar el campo de hongos en niveles altos y bloquear el avance del ciempiés de forma poco interesante. | El `min(..., 0.18)` acota la densidad máxima; se verifica jugando hasta nivel alto que el campo siga siendo transitable. |
| El picado venenoso puede dejar a un segmento fuera de los límites de columna si el veneno expira justo en un borde. | El segmento retoma el comportamiento normal desde su columna y fila actuales, que siempre son válidas porque el picado nunca cambia de columna. |
| Un hongo puede quedar marcado `poisonedUntil` de una partida anterior si `restart()` no lo limpia. | El paso 2 resiembra el campo entero al reiniciar, lo que descarta cualquier estado de veneno previo. |
| La pulga y el escorpión activos a la vez, más un ciempiés en picado, generan varias fuentes de amenaza simultáneas difíciles de depurar. | Cada entidad tiene su propio temporizador de aparición y como mucho una instancia activa de cada tipo; se verifica cada mecánica por separado antes de probarlas juntas. |
| Portar «a ojo» sin código de referencia hace que las constantes se ajusten durante la implementación en vez de fijarse antes. | Los pasos 1, 2, 4 y 5 las fijan explícitamente y las declaran fuera de cambio, como hizo Snake (SPEC 10). |
| El escorpión y la pulga son eventos poco frecuentes (12–20 s y dependientes de umbral), lo que dificulta verificar sus criterios de aceptación por inspección casual. | Los criterios se verifican jugando el tiempo necesario o forzando las condiciones a mano (vaciar hongos, esperar el intervalo), nunca dándolos por buenos sin observarlos. |

---

## Lo que **no** entra en esta spec

- La araña errática de la variante 01.
- Un segundo modo de juego adicional a esta progresión de oleadas.
- Sonido.
- Controles táctiles más allá del botón de disparo declarado en el registro.
- Skins (`clasico`/`neon`/`retro`).
- Selector de dificultad inicial o de nivel de partida.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.
- Rate limiting, antitrampas y validación de la puntuación en servidor.

Cada una de ellas, si entra, va en su propia spec.
