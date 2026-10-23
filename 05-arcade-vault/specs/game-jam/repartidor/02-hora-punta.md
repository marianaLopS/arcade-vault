# SPEC — REPARTIDOR: hora punta

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-23
> **Objetivo:** Diseñar una variante contrarreloj de la ruta de reparto — mismo repartidor en bici y mismo lanzamiento lateral, pero con stock limitado de periódicos, tráfico de coches cruzando la calle, combos de entregas seguidas y reputación en vez de vidas — como ficha nueva `repartidor` en categoría ARCADE, con motor real y leaderboard en Supabase.

---

## Por qué existe esta spec

La variante `01-ruta-clasica.md` mide supervivencia: tres vidas y obstáculos fijos. Esta mide **eficiencia bajo presión**: cada día es una ventana de 75 segundos con un número finito de periódicos, el tráfico cierra carriles de forma dinámica y el mejor repartidor no es el que sobrevive más sino el que encadena entregas sin fallar. Cambian el bucle de decisión (cuándo gastar un periódico), la condición de derrota (reputación a cero) y la estructura de puntos (multiplicador de combo), no sólo la cantidad de peligros.

Como en la variante clásica, **no hay código de referencia**: las constantes son el diseño y cambiarlas durante la implementación es rediseñar. Todo se dibuja con primitivas de canvas. Mundo, vista cenital con scroll, carriles y controles base son los mismos que en la 01; son las decisiones compartidas del juego base y no se redefinen aquí salvo lo que se indica.

Las dos specs son excluyentes: se promueve una u otra con el mismo `game-id` `repartidor`, nunca las dos.

---

## Alcance

**Dentro:**

- `lib/games/repartidor/engine.ts`: motor nuevo, estado en la clausura de `createRepartidorGame`, sin assets.
- Mundo lógico **600×720**, 3 carriles de bici, casas a ambos lados, scroll vertical (idénticos a la 01).
- **Stock** de periódicos: empiezas cada día con 14 y se recogen fardos (+6) tirados en la calzada. Sin stock no se puede lanzar.
- **Temporizador** por día de 75 s. Al llegar a 0 el día termina (no es game over).
- **Tráfico**: coches que cruzan la calzada de lado a lado en carriles de cruce, con aviso de faros.
- **Combo**: cada entrega acertada consecutiva sube el multiplicador (x1 → x4); fallar, romper una ventana suscriptora o chocar lo reinicia.
- **Reputación** (0..100, empieza en 100) en lugar de vidas: baja con fallos y choques; a 0 la partida termina.
- Día = nivel; 5 días por semana, después se repite más rápido.
- Nueva ficha `repartidor` en `lib/games.ts` (`ARCADE`), clase `cover-repartidor`, línea en `GAME_ENGINES` y migración de `games`.

**Fuera de alcance:**

- Vidas discretas, perro (aquí el peligro dinámico es el coche), obstáculos "charco" y "alcantarilla".
- Fase de bonus de pistas de obstáculos.
- Sonido, controles táctiles, skins, vista isométrica.
- Autenticación, `scores.user_id` y `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla, columna ni tipo de plataforma.** El leaderboard se enciende con una fila en `games`.

Tipos locales del motor, sin exportar:

```ts
type Side = -1 | 1;
type House = { y: number; side: Side; subscriber: boolean; delivered: boolean; broken: boolean };
type Bundle = { x: number; y: number; taken: boolean };
type Car = { x: number; y: number; vx: number; warn: number }; // warn: ms de aviso restantes
type Paper = { x: number; y: number; vx: number; ttl: number };
```

Estado en la clausura:

- `player: { x }`, `lane`, `invuln` (ms), `waiting`.
- `houses`, `bundles`, `cars`, `papers`.
- `stock`, `timeLeft` (ms), `combo` (1..4), `streak` (entregas seguidas), `reputation`.
- `score`, `level` (día), `scroll`, `speed`, `state: "playing" | "gameover"`.
- Bucle: `rafId`, `lastTime`, `destroyed`. Entrada: `keys: Set<string>`.

El motor expone a la plataforma `onLives(reputation_en_tercios)`: ver Plan 5 para el mapeo, porque `GameCallbacks` no tiene un canal de "reputación".

---

## Plan de implementación

### 1. Constantes de diseño

```
W 600 · H 720 · PLAYER_Y 560 · LANE_X [240, 300, 360] · LANE_CHANGE_MS 110
SPEED_BASE 160 px/s · SPEED_STEP 18 px/s por día · SPEED_MAX 320
DAY_MS 75000 · HOUSES_PER_DAY 20 · HOUSE_SPACING 150 · SUBSCRIBER_RATIO 0.7
STOCK_START 14 · BUNDLE_SIZE 6 · BUNDLES_PER_DAY 4 (repartidos en la calzada, carril aleatorio)
STOCK_MAX 20
PAPER_SPEED 380 px/s · PAPER_TTL 600 ms · THROW_COOLDOWN 250 ms (global, un solo cooldown)
CAR_SPEED 220 px/s · CAR_WARN_MS 500 · CAR_EVERY_MS 4000 al día 1, -300 por día, mínimo 1800
CAR_W 56 · CAR_H 32 (cruzan de acera a acera por una banda y)
REPUTATION_START 100 · REP_MISS -6 (periódico perdido) · REP_BROKEN_SUB -15 · REP_CRASH -25
REP_DELIVERY +2 (sin superar 100)
COMBO_STEPS [1, 2, 3, 4] · STREAK_PER_STEP 3 (3 entregas seguidas suben un escalón)
POINTS_MAILBOX 100 · POINTS_BROKEN_NON_SUB 50 · POINTS_DAY_CLEAR 400
POINTS_STOCK_LEFT 25 por periódico sobrante al acabar el día
INVULN_MS 1200 · DT_MAX 50
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Comprobación: `npm run build` limpio.

### 2. Generación del día

- Se generan 20 casas alternando lado, con `SUBSCRIBER_RATIO 0.7`. Hay siempre al menos 12 suscriptoras en el día, para que con 14 + 6×4 = 38 periódicos disponibles el stock no sea el único límite.
- 4 fardos: uno cada ~5 casas, en carril aleatorio, a 80 px de cualquier casa.
- Coches: se generan por el temporizador `CAR_EVERY_MS`, no por mapa; ver paso 4.
- Si el scroll llega a la última casa antes de agotar el tiempo, el día termina antes y los segundos restantes se pierden (no hay bono por tiempo; el bono es el stock sobrante).

Comprobación: arrancado a mano, el día genera 20 casas y 4 fardos y nunca menos de 12 suscriptoras.

### 3. Jugador, lanzamiento y combo

- Movimiento y controles idénticos a la 01: `←`/`→`/`A`/`D` por carril; `Z`/`X` lanzan a izquierda/derecha; `Espacio` al lado de la casa más cercana por delante. Un único `THROW_COOLDOWN` global.
- Lanzar consume 1 de `stock`; con `stock = 0` la pulsación no hace nada y el HUD no cambia.
- Acierto en buzón suscriptor: `+POINTS_MAILBOX × combo`, `streak++`, `REP_DELIVERY`. Cada 3 entregas seguidas, `combo` sube un escalón hasta x4.
- Periódico que expira sin impactar nada: `REP_MISS`, `streak = 0`, `combo = 1`.
- Ventana suscriptora rota: `REP_BROKEN_SUB`, `streak = 0`, `combo = 1`. Ventana de no suscriptor rota: `+POINTS_BROKEN_NON_SUB` y el combo **no** se rompe.
- Recoger un fardo (pasar por encima en el carril): `stock = min(STOCK_MAX, stock + BUNDLE_SIZE)`.
- No hay vidas: `REP_CRASH` con invulnerabilidad `INVULN_MS` por choque con coche; no se puede perder dos veces en la ventana.

Comprobación: tres entregas seguidas suben el combo a x2 y un fallo lo baja a x1.

### 4. Tráfico

- Cada `CAR_EVERY_MS` aparece un coche en una banda `y` visible, por un lado aleatorio; antes de entrar parpadean unos faros durante `CAR_WARN_MS` en el borde por donde saldrá.
- Cruza la calzada a `CAR_SPEED` ocupando los 3 carriles de esa banda; solo se evita adelantándose o retrasándose en `y` (cambiando el timing con la velocidad base) o recogiendo tiempo con el scroll. Para hacerlo evitable, el coche deja un hueco: ocupa solo una caja de `CAR_W × CAR_H`, así que la bici lo cruza si pasa antes o después de su paso.
- No se generan coches a menos de 120 px de un fardo ni sobre una casa.

Comprobación: los faros avisan 500 ms antes y el coche cruza una sola vez por aparición.

### 5. Fin de día, reputación y avisos

- Al llegar `timeLeft` a 0 o al pasar la última casa: `POINTS_DAY_CLEAR + POINTS_STOCK_LEFT × stock`, `level++`, `timeLeft = DAY_MS`, `stock = STOCK_START`, `speed` actualizado, `combo = 1`, `streak = 0`.
- Si `reputation <= 0` en cualquier momento: game over.
- Mapeo de callbacks: `onLives(Math.ceil(reputation / 34))` (100→3, 66→2, 33→1, 0→0) para que el HUD muestre algo con sentido sin tocar la plataforma. `onLevel(level)` en cada día.
- `emit()` con `lastScore` / `lastLives` / `lastLevel`; `onGameOver(score)` una sola vez.
- El canvas **sí** dibuja el stock, el temporizador y el combo (son estado propio del juego sin canal en `GameCallbacks`); no dibuja puntos, nivel ni overlay de game over.
- `restart()`, `dt` capado a `DT_MAX`, `lastTime = null` al reanudar, `destroy()` idempotente, listeners en el canvas, `GAME_KEYS` y `preventDefault()` solo para ellas: iguales a la 01.

Comprobación: `npm run build` limpio.

### 6. Catálogo, motor y leaderboard

`lib/games.ts`: ficha `repartidor` con `short: "Reparte contrarreloj sin quedarte sin periódicos."`, `cat: "ARCADE"`, `cover: "cover-repartidor"`, `color: "amber"`, `best: 0`, `plays: "0"`, y `long` que menciona stock, tráfico y combos.

`lib/games/registry.ts`: `repartidor: { create: createRepartidorGame, width: 600, height: 720, controls: "← → carriles, Z/X lanzan a izquierda/derecha, espacio al buzón más cercano" }`.

`supabase/migrations/<timestamp>_juego_repartidor.sql`:

```sql
insert into public.games (id, title) values ('repartidor', 'REPARTIDOR');
```

Se aplica con `apply_migration` y se comprueba con `execute_sql`; los tipos no se regeneran.

Comprobación: `/jugar/repartidor` pinta el canvas real y `select * from public.games` incluye `repartidor`.

### 7. Repaso final

`npm run lint`, `npm run build`, `get_advisors` y recorrido manual de los criterios.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/repartidor` muestra un canvas de 600×720 con stock, temporizador y combo dibujados dentro del canvas.
- [ ] El día empieza con 14 periódicos y el temporizador en 75 s, y ninguno avanza hasta la primera tecla.
- [ ] Lanzar consume exactamente 1 periódico; con stock 0 no se lanza nada.
- [ ] Recoger un fardo suma 6 de stock sin superar 20.
- [ ] Tres entregas seguidas suben el combo a x2; seis a x3; nueve a x4 y no más.
- [ ] Un periódico que expira sin impactar resta 6 de reputación y reinicia el combo.
- [ ] Romper la ventana de una suscriptora resta 15 de reputación; romper la de una no suscriptora suma 50 puntos y no rompe el combo.
- [ ] Un coche avisa con faros 500 ms antes y su choque resta 25 de reputación una sola vez por invulnerabilidad de 1,2 s.
- [ ] La reputación nunca supera 100.
- [ ] Al acabar el día suma 400 más 25 por periódico sobrante y el HUD pasa al nivel siguiente.
- [ ] Reputación 0 abre el modal `FIN DEL JUEGO` con la puntuación real.
- [ ] El HUD de vidas pasa de 3 a 2 a 1 a 0 según la reputación (>66, >33, >0, 0).
- [ ] El canvas no dibuja puntos, nivel ni overlay de game over.
- [ ] `PAUSA` congela también el temporizador y `REANUDAR` lo reanuda sin saltos; `P` y `Escape` igual.
- [ ] Con el canvas enfocado, las flechas y el espacio no hacen scroll de la página.
- [ ] Escribir `Z`, `X` o espacio en el campo de iniciales no mueve ni reinicia el juego.
- [ ] `JUGAR DE NUEVO` reinicia día 1, 0 puntos, stock 14, reputación 100 sin recargar.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'repartidor'`, y dos pulsaciones seguidas no insertan dos.
- [ ] La puntuación aparece en `/salon?juego=repartidor` y `/juegos/repartidor`.
- [ ] Navegar de `/jugar/repartidor` a `/biblioteca` y volver no duplica el bucle.
- [ ] Dejar la pestaña en segundo plano y volver no consume tiempo de día de golpe (dt capado).
- [ ] Los otros juegos se juegan igual que antes.
- [ ] La consola no muestra errores ni avisos de hidratación.

---

## Decisiones

- **Sí:** reputación en lugar de vidas, mapeada a `onLives`. Evita ampliar `GameCallbacks`.
- **Sí:** stock y temporizador dibujados en el canvas. No hay callback para ellos y el contrato no se toca.
- **Sí:** un solo cooldown global, para que el stock y no el spam sea la decisión.
- **Sí:** el combo no se rompe al romper la ventana de un no suscriptor; recompensa el gamberrismo sin castigar la racha.
- **Sí:** bono por stock sobrante. Premia la puntería frente al derroche.
- **No:** perro ni obstáculos fijos. El peligro es el tráfico, con aviso.
- **No:** nuevo callback de plataforma ni cambios en `components/game-player.tsx`.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Quedarse sin stock sin remedio por mala racha. | Mínimo de 12 suscriptoras y 4 fardos por día; el fardo es recuperable. |
| El mapeo reputación→vidas confunde en el HUD. | Fijado en el plan 5 y probado en criterios. |
| El coche es inevitable si cruza justo donde está la bici. | Aviso de 500 ms y caja pequeña; invulnerabilidad de 1,2 s tras choque. |
| El combo x4 hace las puntuaciones desbalanceadas. | Techo en 4 y reinicio en cada fallo. |
| Pausar durante el temporizador desincroniza el día. | `timeLeft` solo decrece con `dt` capado; `lastTime = null` al reanudar. |
| Pestaña en segundo plano consume tiempo de golpe. | `dt` capado a 50 ms por frame. |
| Las teclas llegan al motor mientras se escriben iniciales. | Bucle parado con el modal abierto y listeners en el canvas. |

---

## Lo que **no** entra en esta spec

- Vidas discretas, perro, charcos, alcantarillas.
- Fase de bonus, sonido, táctil, skins, vista isométrica.
- Autenticación, `scores.user_id` y `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
