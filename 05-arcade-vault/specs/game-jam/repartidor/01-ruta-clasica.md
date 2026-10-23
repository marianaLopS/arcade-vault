# SPEC — REPARTIDOR: ruta clásica

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-23
> **Objetivo:** Diseñar un port fiel en espíritu al Paperboy de 1984 — un repartidor en bici que baja por una calle con scroll vertical, lanza periódicos a los buzones de los suscriptores, esquiva obstáculos y evita romper ventanas de quien no lo es — como ficha nueva `repartidor` en categoría ARCADE, con motor real y leaderboard en Supabase desde el primer día.

---

## Por qué existe esta spec

El catálogo no tiene ningún juego de **scroll continuo con puntería**: Asteroids es free-roam en gravedad cero, Snake y Tetris son por ticks de grilla, Arkanoid es de rebote. Paperboy combina dos habilidades que ninguno junta: esquivar obstáculos en una vía que avanza sola y, a la vez, apuntar un lanzamiento lateral con trayectoria corta. Además introduce una regla de puntuación que no existe en el catálogo: **no todos los objetivos valen lo mismo y algunos penalizan** (acertar al no suscriptor).

Como con Snake (SPEC 10), `ciempies` y `ranaria`, **no hay código de referencia**: no existe ninguna carpeta de Paperboy en el repositorio, sólo la mención en `game-suggestions-todo.md`. Las constantes de esta spec **son** el diseño; cambiarlas durante la implementación es rediseñar, no implementar. El motor dibuja todo con primitivas de canvas, sin spritesheet externo. La vista es cenital con scroll vertical (no isométrica): el original isométrico exigiría proyecciones que el contrato `GameEngine` no necesita para ser divertido.

Esta variante es la lectura **mínima y fiel**: una sola ruta, tres vidas, obstáculos estáticos y un perro. La segunda variante (`02-hora-punta.md`) cambia el reto de fondo — tiempo, stock de periódicos y tráfico — en vez de añadir más de lo mismo.

---

## Alcance

**Dentro:**

- `lib/games/repartidor/engine.ts`: motor nuevo, todo el estado en la clausura de `createRepartidorGame`, sin assets externos.
- Mundo lógico **600×720**. La calle scrollea hacia abajo (la bici "avanza" hacia arriba) a velocidad creciente por día.
- Calle de 3 carriles de bici en el centro; aceras y casas a ambos lados.
- Casas alternando lado izquierdo/derecho; cada casa tiene un buzón y una ventana. Cada casa es **suscriptora** (verde) o **no suscriptora** (gris).
- Lanzamiento de periódico lateral (`Z`/`X`, o `Espacio` al lado más cercano) con trayectoria corta; un único periódico en vuelo por lado.
- Obstáculos estáticos en calzada (cubos de basura, charcos, bocas de alcantarilla) y un perro que cruza.
- Tres vidas; nivel = día de la semana (7 días, después se repite con mayor velocidad).
- Nueva ficha `repartidor` en `lib/games.ts` (categoría `ARCADE`) y clase `cover-repartidor` en `app/globals.css`.
- Una línea `repartidor` en `GAME_ENGINES`.
- Migración `insert into public.games (id, title) values ('repartidor', 'REPARTIDOR')` y su aplicación.

**Fuera de alcance (para specs futuras o `02-hora-punta.md`):**

- Temporizador por día, stock limitado de periódicos y tráfico de coches.
- Fase de bonus de pistas de obstáculos al final del día.
- Sonido, controles táctiles, skins.
- Vista isométrica.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla, columna ni tipo de plataforma.** `scores` y `game_stats` sirven sin tocarlas; el leaderboard se enciende con una fila en `games`.

Tipos locales del motor, sin exportar:

```ts
type Side = -1 | 1; // -1 izquierda, 1 derecha
type House = { y: number; side: Side; subscriber: boolean; delivered: boolean; broken: boolean };
type Obstacle = { x: number; y: number; w: number; h: number; kind: "bin" | "puddle" | "drain" };
type Dog = { x: number; y: number; vx: number };
type Paper = { x: number; y: number; vx: number; vy: number; ttl: number };
```

Estado en la clausura de `createRepartidorGame`:

- `player: { x: number }` (centro en px; la `y` es fija, `PLAYER_Y`), `lane: 0 | 1 | 2` objetivo y `invuln` (ms).
- `houses: House[]`, `obstacles: Obstacle[]`, `dog: Dog | null`, `papers: Paper[]`.
- `scroll` (px recorridos en el día), `speed` (px/s), `score`, `lives`, `level` (día, 1-based), `housesPassed`.
- `throwCooldown: { l: number; r: number }` (ms).
- `state: "playing" | "gameover"`, `waiting` (true hasta la primera tecla).
- Bucle: `rafId`, `lastTime`, `destroyed`. Entrada: `keys: Set<string>`.

---

## Plan de implementación

### 1. Constantes de diseño

`lib/games/repartidor/engine.ts`, primera parte:

```
W 600 · H 720 · PLAYER_Y 560 · PLAYER_W 28 · PLAYER_H 44
CARRILES 3 · LANE_X [240, 300, 360] · LANE_CHANGE_MS 110 (interpolación lineal entre carriles)
CALZADA x 200..400 · ACERA izq x 150..200 · ACERA der x 400..450 · CASAS fuera de 150/450
SPEED_BASE 140 px/s · SPEED_STEP 20 px/s por día · SPEED_MAX 300
HOUSE_SPACING 180 px entre casas consecutivas (alternando lado) · HOUSES_PER_DAY 12
SUBSCRIBER_RATIO 0.6 (la 1ª y 2ª casa del día siempre son suscriptoras)
PAPER_SPEED 360 px/s lateral · PAPER_VY -80 (relativo; sigue al scroll) · PAPER_TTL 650 ms
THROW_COOLDOWN 350 ms por lado
MAILBOX_HIT_W 36 (ancho de acierto en el eje y alrededor del buzón)
LIVES_START 3 · INVULN_MS 1500 · DT_MAX 50
POINTS_MAILBOX 100 · POINTS_WINDOW_SUBSCRIBER_BONUS 0 · POINTS_BROKEN_PENALTY -50
POINTS_DAY_CLEAR 300 + 100 por casa suscriptora servida · POINTS_OBSTACLE_PASSED 0
OBSTACLES_PER_DAY 10 + 2 por día (máx 24) · DOG_EVERY 4 casas desde el día 2
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Comprobación: `npm run build` limpio.

### 2. Calle, casas y generación del día

- Al empezar el día se generan 12 casas en `y` creciente (`y = -HOUSE_SPACING * i`, medidas en coordenadas de mundo del scroll), lado alternado empezando por la derecha.
- Cada casa tiene buzón (a `±(CALZADA_BORDE+10)`) y ventana; la ventana se rompe si un periódico la golpea y la casa **no** está ya entregada.
- Los obstáculos se reparten con `Math.random` sobre los 3 carriles, nunca los 3 carriles bloqueados en la misma banda de 120 px (siempre queda un carril libre). Se prohíbe un obstáculo a menos de 100 px de una casa para que no tape el buzón.
- El día termina al pasar la última casa más 240 px: se suma `POINTS_DAY_CLEAR`, `level++`, regenera.

Comprobación: arrancado a mano, el día genera 12 casas y nunca una banda con los 3 carriles bloqueados.

### 3. Jugador, lanzamiento y colisiones

- Movimiento: `←`/`→` (o `A`/`D`) cambian de carril de uno en uno; `waiting` termina con la primera tecla.
- Lanzamiento: `Z` o `Q` lanza a la izquierda, `X` o `E` a la derecha; `Espacio` lanza al lado de la casa más cercana por delante. Un periódico por lado en vuelo: si ya hay uno de ese lado, se ignora la pulsación. Respeta `THROW_COOLDOWN`.
- Acierto: el periódico entra en la caja del buzón (`MAILBOX_HIT_W`) de una casa suscriptora no entregada → `+POINTS_MAILBOX`, casa `delivered`. Si golpea el buzón de una no suscriptora → sin puntos, sin penalización (el periódico se pierde). Si entra en la ventana de una casa no entregada → `broken`: `POINTS_BROKEN_PENALTY` si es suscriptora, **+50 si es no suscriptora** (el gamberro tiene premio).
- Colisión con obstáculo o perro: pierde una vida, `invuln = INVULN_MS` (parpadeo), la bici vuelve al carril central y la velocidad cae a `SPEED_BASE` del día.
- Un periódico no puede atravesar obstáculos (no los toca; sólo viaja lateral por las aceras).

Comprobación: con teclas a mano, acertar un buzón suma 100 y romper una ventana suscriptora resta 50.

### 4. Perro

- Aparece desde el día 2 cada 4 casas: cruza la calzada de un lado al otro a `vx = ±120 px/s` en una banda libre de obstáculos.
- Es una colisión como un obstáculo, pero se puede evitar cambiando de carril porque anuncia su entrada con un parpadeo de 400 ms al borde de la acera.

Comprobación: el perro cruza una sola vez cada 4 casas y su aviso es visible 400 ms antes.

### 5. Bucle, entrada y avisos

- `emit()` con `lastScore` / `lastLives` / `lastLevel`; `onLives(LIVES_START)` al iniciar.
- `onGameOver(score)` una sola vez al llegar `lives` a 0, tras detener el bucle. `resume()` es no-op después.
- `restart()`: detiene el bucle, reinicia `score`, `lives`, `level`, `speed`, regenera el día 1, `waiting = true`.
- `dt` en ms, capado a `DT_MAX`; `lastTime = null` al reanudar.
- `GAME_KEYS`: `ArrowLeft`, `ArrowRight`, `KeyA`, `KeyD`, `KeyZ`, `KeyX`, `KeyQ`, `KeyE`, `Space`. `preventDefault()` solo para esas.
- Listeners `keydown` / `keyup` / `blur` sobre el canvas, nunca sobre `window`. `P` y `Escape` no llegan.
- `destroy()` cancela el frame, quita los listeners y es idempotente.
- `initGame(); draw();` antes de devolver.
- `draw()`: fondo de asfalto, aceras, casas con ventana y buzón (verde = suscriptora), obstáculos, perro, periódicos, bici. Sin puntuación, vidas ni overlays de game over; mientras `waiting` un rótulo `PULSA UNA TECLA`.

Comprobación: `npm run build` limpio.

### 6. Catálogo: nueva ficha

`lib/games.ts`:

```ts
{
  id: "repartidor",
  title: "REPARTIDOR",
  short: "Lanza el periódico al buzón correcto sin chocar.",
  long: "Recorre la calle en bici esquivando basura, charcos y perros. Acierta los buzones de tus suscriptores, no rompas sus ventanas y completa los siete días de la semana, cada uno más rápido que el anterior.",
  cat: "ARCADE",
  cover: "cover-repartidor",
  color: "amber",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: `.cover-repartidor` con gradiente/patrón generado, sin imagen. Comprobación: `/juegos/repartidor` muestra la ficha.

### 7. Registrar el motor

```ts
repartidor: {
  create: createRepartidorGame,
  width: 600,
  height: 720,
  controls: "← → para cambiar de carril, Z/X lanzan a izquierda/derecha, espacio lanza al buzón más cercano",
},
```

Comprobación: `/jugar/repartidor` pinta el canvas real.

### 8. Leaderboard

`supabase/migrations/<timestamp>_juego_repartidor.sql` (timestamp posterior a `20260927130000`):

```sql
insert into public.games (id, title) values ('repartidor', 'REPARTIDOR');
```

Se aplica con `apply_migration` y se comprueba con `execute_sql`. Los tipos no se regeneran.

### 9. Repaso final

`npm run lint`, `npm run build`, `get_advisors` sin avisos nuevos y recorrido manual de los criterios.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/repartidor` muestra un canvas de 600×720 con calle, casas y bici, no la `.game-arena`.
- [ ] La calle no scrollea hasta pulsar la primera tecla.
- [ ] `←`/`→` y `A`/`D` mueven la bici de carril en carril y no pueden salir de los 3 carriles.
- [ ] `Z` lanza a la izquierda, `X` a la derecha, `Espacio` al lado de la casa más cercana por delante.
- [ ] Con un periódico en vuelo en un lado, volver a lanzar a ese lado no crea otro; el otro lado sigue disponible.
- [ ] Acertar el buzón de una casa suscriptora suma 100 y la marca como entregada.
- [ ] Romper la ventana de una casa suscriptora resta 50; romper la de una no suscriptora suma 50.
- [ ] El HUD nunca baja de 0 puntos por penalización (puntuación mínima 0).
- [ ] Ninguna banda de 120 px de calzada tiene los 3 carriles bloqueados.
- [ ] Chocar con un obstáculo o el perro resta una vida y da 1,5 s de invulnerabilidad con parpadeo.
- [ ] Tras 12 casas el HUD pasa a nivel 02 y la velocidad sube 20 px/s.
- [ ] El perro aparece desde el día 2 y avisa 400 ms antes de cruzar.
- [ ] El HUD muestra 3 vidas desde el inicio y la partida termina al llegar a 0.
- [ ] El canvas no dibuja puntos, nivel ni vidas ni overlay de game over.
- [ ] `PAUSA` congela el juego y `REANUDAR` lo reanuda sin saltos; `P` y `Escape` hacen lo mismo.
- [ ] Con el canvas enfocado, las flechas y el espacio no hacen scroll de la página.
- [ ] Escribir `Z`, `X` o espacio en el campo de iniciales no mueve ni reinicia el juego.
- [ ] `JUGAR DE NUEVO` reinicia a nivel 1, 0 puntos y 3 vidas sin recargar.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'repartidor'`; pulsarlo dos veces no inserta dos.
- [ ] La puntuación aparece en `/salon?juego=repartidor` y en `/juegos/repartidor`.
- [ ] Navegar de `/jugar/repartidor` a `/biblioteca` y volver no duplica el bucle.
- [ ] Dejar la pestaña en segundo plano y volver no teletransporta la bici por la calle (dt capado).
- [ ] Los otros juegos con motor se juegan igual que antes.
- [ ] La consola no muestra errores ni avisos de hidratación en `/jugar/repartidor`.

---

## Decisiones

- **Sí:** vista cenital con scroll vertical. La isométrica del original no aporta jugabilidad y complica colisiones.
- **Sí:** 3 carriles discretos. Hace el esquive legible y garantiza un carril libre.
- **Sí:** lanzamiento por lado con un periódico en vuelo por lado. Da puntería sin ráfagas.
- **Sí:** romper la ventana de un no suscriptor da puntos. Es el guiño del original y crea una decisión de riesgo.
- **No:** periódicos limitados ni temporizador en esta variante. Es el eje de `02-hora-punta.md`.
- **Sí:** tres vidas con invulnerabilidad corta, para que un choque no encadene otro.
- **Sí:** puntuación con suelo en 0.
- **No:** sonido ni táctil.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Las constantes se ajustan «a ojo» sin original. | El paso 1 las fija y las declara fuera de cambio. |
| El perro mata sin posibilidad de reacción. | Aviso de 400 ms y velocidad lateral fija de 120 px/s. |
| Un obstáculo tapa el buzón y hace la entrega imposible. | Distancia mínima de 100 px entre obstáculo y casa. |
| Tres carriles bloqueados generan una muerte injusta. | Regla de generación: siempre un carril libre por banda. |
| Lanzar con tres teclas confunde. | `Espacio` resuelve el caso común; `Z`/`X` son la vía precisa. |
| Pestaña en segundo plano: el scroll salta decenas de píxeles. | `dt` capado a 50 ms y `lastTime = null` al reanudar. |
| Las teclas llegan al motor mientras se escriben iniciales. | Bucle parado con el modal abierto y listeners en el canvas. |

---

## Lo que **no** entra en esta spec

- Temporizador, stock de periódicos y tráfico (ver `02-hora-punta.md`).
- Sonido, táctil, skins, vista isométrica.
- Autenticación, `scores.user_id` y `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
