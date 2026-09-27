# SPEC — PINBALL: mesa clásica

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06, SPEC 08
> **Fecha:** 2026-09-27
> **Objetivo:** Definir un pinball vertical de una sola bola, dos flippers y tres bumpers fijos sobre el contrato `GameEngine`, con un multiplicador de combo como única progresión.

---

## Por qué existe esta spec

`game-planner` tiene anotado desde 2026-09-22, en el lote de "retro clásicos misceláneos", que
Arcade Vault no cubre ningún juego de físicas de rebote real: todo lo existente es colisión
simple tipo breakout (`arkanoid`) o grilla discreta (`caida`, `snake`, `frogger`). Un pinball
aporta un género de mecánica genuinamente distinta — bola con gravedad continua, flippers
rotatorios accionados por el jugador, bumpers que devuelven energía — sin solaparse con ningún
juego del catálogo ni con los cuatro que siguen en maqueta (`gloton`, `invasores`, `ranaria`,
`duelo-pixel`).

Esta variante fija la mesa más simple posible que ya es reconociblemente un pinball: una bola,
dos flippers, tres bumpers, un plunger y tres vidas. Toda la profundidad extra — multibola,
drop targets, bola extra — queda para la variante `02-pinball-multibola.md`. Ninguna de las dos
es la spec final: son dos propuestas para que el usuario elija (o combine) antes de promover una
a `specs/NN-*.md` con `/spec` o la skill `nuevo-juego`.

---

## Alcance

**Dentro:**

- `lib/games/pinball/engine.ts`: motor nuevo, física y estado en la clausura de
  `createPinballGame`. Sin sprites externos: todo se dibuja con primitivas de canvas (como
  `ranaria`/`frogger`), porque no hay asset de pinball en el repo.
- Mesa vertical de 480×800 con esquinas superiores cortadas a 45°, carril de plunger a la
  derecha del campo principal.
- Física de bola: gravedad constante, rebote contra muros y esquinas, bola limitada a
  `MAX_BALL_SPEED`.
- Dos flippers rotatorios (izquierdo/derecho) accionados por teclado, con impulso propio al
  golpear la bola en movimiento (no solo reflejo pasivo).
- Tres bumpers circulares fijos y dos slingshots triangulares junto a los flippers, todos con
  puntuación propia.
- Combo/nivel: golpear los tres bumpers distintos dentro de una ventana de tiempo sube el
  multiplicador de puntos; se resetea al perder la bola.
- Plunger: mantener pulsado para cargar potencia, soltar para lanzar la bola por el carril.
- Drenaje entre flippers: la bola que cae sin ser golpeada resta una vida; a la tercera, game
  over.
- Una línea `pinball` en `GAME_ENGINES`.
- `lib/games.ts`: nueva ficha `{ id: "pinball", title: "PINBALL", cat: "ARCADE", cover:
  "cover-pinball", color: "cyan", ... }` (portada y copy definitivos se redactan al promover la
  spec, no aquí).
- Migración `insert into public.games (id, title) values ('pinball', 'PINBALL')`.

**Fuera de alcance (para specs futuras):**

- Multibola, drop targets, rampas, spinner, bola extra: variante `02-pinball-multibola.md`.
- Tilt (sacudir la mesa) y su penalización.
- Sonido.
- Selector de mesas o temas visuales (skins).
- Controles táctiles.
- Bonus de fin de bola (recuento animado) más allá de sumar el score final al `onGameOver`.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni tipo de plataforma nuevo.** `scores` y `game_stats`
sirven a este juego sin tocarlas; el leaderboard se enciende con la fila en `games` del paso 7.

Tipos locales del motor, sin exportar:

```ts
type Vec2 = { x: number; y: number };
type Ball = { pos: Vec2; vel: Vec2; inPlay: boolean };
type FlipperSide = "left" | "right";
type Flipper = {
  side: FlipperSide;
  pivot: Vec2;
  angle: number; // radianes, ángulo actual
  angularVel: number; // signo según si sube o baja
  active: boolean; // tecla pulsada
};
type Bumper = { pos: Vec2; radius: number; flashUntil: number };
```

Estado en la clausura de `createPinballGame`:

- `ball: Ball`, `flippers: [Flipper, Flipper]`, `bumpers: Bumper[]` (3), `slingshots` (2,
  geometría fija, sin estado propio salvo `flashUntil`).
- `score`, `lives`, `level` (multiplicador de combo, arranca en 1).
- `comboHits: Set<number>` (índices de bumpers golpeados en la ventana actual), `comboDeadline`
  (ms, `null` si no hay combo abierto).
- `plunger: { charging: boolean; power: number; chargeStart: number | null }`.
- `state: "waiting" | "playing" | "gameover"` (`waiting` = bola en el carril, plunger listo).
- Bucle: `rafId`, `lastTime`, `destroyed`.

---

## Plan de implementación

### 1. Motor: constantes y física base

`lib/games/pinball/engine.ts`, constantes de diseño:

```
W 480 · H 800
PLAY_LEFT 20 · PLAY_RIGHT_MAIN 420 · CORNER_CUT 60 (recorte a 45° en las dos esquinas superiores)
PLUNGER_LANE_X [420, 460] · PLUNGER_LANE_TOP 40
BALL_RADIUS 9 · BALL_RESTITUTION 0.55 · GRAVITY 1400 px/s² · MAX_BALL_SPEED 1200 px/s
DT_MAX 0.02 s (varios sub-pasos por frame si `dt` real es mayor, para evitar atravesar muros)
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

`update(dt)` integra la bola en sub-pasos de `DT_MAX` como mucho: `vel.y += GRAVITY * dt`,
`pos += vel * dt`, clamp de `|vel|` a `MAX_BALL_SPEED`. Colisión contra los muros del perímetro
(incluidas las dos aristas de las esquinas cortadas) por reflexión del vector velocidad sobre la
normal del segmento, multiplicando el módulo resultante por `BALL_RESTITUTION`.

Comprobación: con los flippers y bumpers aún sin implementar, soltar la bola dentro del campo
principal (sin plunger) la hace rebotar contra los muros indefinidamente sin atravesarlos ni
quedar quieta.

### 2. Motor: flippers

```
FLIPPER_LEN 85 px
FLIPPER_PIVOT_L (150, 720) · FLIPPER_PIVOT_R (330, 720)
FLIPPER_REST_ANGLE 30° (hacia abajo y afuera) · FLIPPER_SWING 55° (hacia arriba al activar)
FLIPPER_ANGULAR_SPEED 720 °/s
FLIPPER_HIT_BOOST 260 px/s (impulso extra a lo largo de la normal del flipper si estaba en
  movimiento ascendente al contacto; 0 si el flipper está quieto o bajando)
DRAIN_GAP 90 px (hueco entre las puntas de los flippers en reposo, centrado en x = 240)
```

Cada flipper es un segmento rígido que rota entre `FLIPPER_REST_ANGLE` y
`FLIPPER_REST_ANGLE - FLIPPER_SWING` (izquierdo) o el espejo (derecho) a `FLIPPER_ANGULAR_SPEED`
mientras la tecla está pulsada, y vuelve a la misma velocidad al soltarla. Colisión bola-flipper:
segmento vs círculo, igual método que los muros pero con la normal del segmento en su ángulo
actual, más `FLIPPER_HIT_BOOST` a lo largo de esa normal si el flipper subía en el momento del
contacto.

Comprobación: con la bola cayendo desde el centro del campo, pulsar el flipper izquierdo antes
del contacto la desvía hacia la derecha con más velocidad que la de caída libre.

### 3. Motor: bumpers, slingshots y combo/nivel

```
BUMPER_RADIUS 26 px · BUMPER_POINTS 100 · BUMPER_KICK_SPEED 620 px/s · BUMPER_FLASH_MS 150
BUMPER_POS [(150, 260), (330, 260), (240, 170)]
SLINGSHOT_POINTS 50 · SLINGSHOT_KICK_SPEED 500 px/s
SLINGSHOT_POS: triángulos pegados a la pared sobre cada flipper (geometría fija, sin física de
  segmento rotante: rebote como un muro con `BUMPER_KICK_SPEED` propio)
COMBO_WINDOW_MS 4000 · LEVEL_MAX 5
```

Bumper: colisión círculo-círculo; al contacto, la bola sale despedida a `BUMPER_KICK_SPEED` en la
dirección centro-bumpo → bola (ignora la velocidad de entrada), suma `BUMPER_POINTS * level` y
marca `flashUntil`. Slingshot: rebote de muro normal más `SLINGSHOT_KICK_SPEED` de impulso extra,
suma `SLINGSHOT_POINTS * level`.

Combo: al golpear un bumper no marcado en `comboHits` dentro de la ventana abierta (o al abrir una
ventana nueva con el primer golpe), se añade su índice; si `comboHits` llega a 3, `level =
min(level + 1, LEVEL_MAX)`, se llama `onLevel(level)`, y `comboHits`/`comboDeadline` se
reinician. Si pasan `COMBO_WINDOW_MS` sin completar los tres, la ventana se cierra sin subir de
nivel y el siguiente bumper abre una ventana nueva.

Comprobación: golpear los tres bumpers en menos de 4 s sube el nivel a 2 y el siguiente bumper
puntúa el doble; esperar más de 4 s entre el primero y el tercero no lo sube.

### 4. Motor: plunger, drenaje, vidas y ciclo de partida

```
PLUNGER_CHARGE_MAX_MS 900 · PLUNGER_MIN_SPEED 500 px/s · PLUNGER_MAX_SPEED 1000 px/s
LIVES_START 3
```

`state === "waiting"`: la bola descansa en la base del carril del plunger. Mantener `Space`
acumula `power = min(1, transcurrido / PLUNGER_CHARGE_MAX_MS)`; soltar lanza la bola hacia
arriba por el carril a `PLUNGER_MIN_SPEED + power * (PLUNGER_MAX_SPEED - PLUNGER_MIN_SPEED)` y
pasa a `state = "playing"`. Al llegar al final del carril la bola entra al campo principal por
simple continuidad de física (el carril no tiene tope, solo una pared que lo separa del campo).

Drenaje: si `pos.y > H` con `pos.x` dentro de `DRAIN_GAP`, `lives--`, `onLives(lives)`; si
`lives > 0`, la bola vuelve al carril y `state = "waiting"` con `level` reseteado a 1 y
`onLevel(1)`; si `lives === 0`, `state = "gameover"`, `stopLoop()`, `onGameOver(score)`.
`resume()` es no-op tras game over.

`restart()`: detiene el bucle, `score = 0`, `lives = LIVES_START`, `level = 1`, bola de vuelta al
carril, `emit()`, arranca.

`GAME_KEYS`: `ArrowLeft`/`KeyZ` (flipper izquierdo), `ArrowRight`/`KeyM` (flipper derecho),
`Space` (plunger). `preventDefault()` solo para esas. Listeners `keydown`/`keyup`/`blur` sobre el
canvas, nunca sobre `window`. `destroy()` cancela el frame, quita los listeners y es idempotente.

Comprobación: dejar caer tres bolas sin tocar los flippers termina la partida con el modal de fin
de juego mostrando la puntuación acumulada de las tres.

### 5. Dibujo

Fondo de mesa oscuro, muros y esquinas cortadas trazados en neón cian, flippers como rectángulos
redondeados que rotan con su ángulo real, bumpers como círculos que destellan mientras
`Date.now() < flashUntil`, slingshots como triángulos, bola como círculo blanco con sombra. Barra
de carga del plunger dibujada en el carril mientras `plunger.charging`. Sin overlays de inicio:
la bola en el carril ya comunica que hay que lanzar.

Comprobación: `npm run build` limpio.

### 6. Registrar la ficha

`lib/games/registry.ts`:
`pinball: { create: createPinballGame, width: 480, height: 800, controls: "flecha izquierda o Z para el flipper izquierdo, flecha derecha o M para el flipper derecho, espacio para cargar y soltar el plunger" }`.

`lib/games.ts`: nueva entrada `pinball` (título, `short`, `long`, `cat: "ARCADE"`, `cover:
"cover-pinball"`, `color`, `best`, `plays` a definir al promover la spec).

Comprobación: `/jugar/pinball` pinta el canvas real de 480×800.

### 7. Leaderboard

`supabase/migrations/<timestamp>_juego_pinball.sql`:

```sql
insert into public.games (id, title) values ('pinball', 'PINBALL');
```

Aplicada con `apply_migration` del MCP, comprobada con `execute_sql`.

Comprobación: `select * from public.games` incluye la fila `pinball`.

### 8. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, recorrido manual de
los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/pinball` muestra un canvas de 480×800 con mesa, flippers, bumpers y bola, no la
      `.game-arena`.
- [ ] La bola arranca en reposo en el carril del plunger; no se mueve hasta lanzarla.
- [ ] Mantener `Space` carga el plunger de forma visible; soltarlo antes de `PLUNGER_CHARGE_MAX_MS`
      lanza la bola con menos potencia que mantenerlo el máximo.
- [ ] `ArrowLeft`/`Z` y `ArrowRight`/`M` rotan cada flipper de forma independiente y vuelven a su
      ángulo de reposo al soltar la tecla.
- [ ] Golpear la bola con un flipper en movimiento ascendente la acelera más que un rebote pasivo
      con el flipper quieto.
- [ ] Cada bumper suma `100 × nivel` puntos y destella al ser golpeado.
- [ ] Cada slingshot suma `50 × nivel` puntos.
- [ ] Golpear los tres bumpers distintos en menos de 4 s sube el nivel visible en el HUD; no
      completarlos a tiempo no lo sube.
- [ ] El nivel vuelve a 1 cada vez que se pierde una bola.
- [ ] La bola que cae por el hueco entre flippers resta una vida y el HUD lo refleja.
- [ ] Tras perder una bola con vidas restantes, la siguiente bola vuelve al carril del plunger.
- [ ] Perder la tercera bola abre el modal `FIN DEL JUEGO` con la puntuación acumulada real.
- [ ] El canvas no dibuja puntos, vidas ni nivel: los pinta el HUD de la plataforma.
- [ ] El botón `PAUSA` congela la física (la bola no sigue cayendo) y `REANUDAR` la reanuda sin
      saltos de posición.
- [ ] `P` y `Escape` hacen lo mismo que el botón.
- [ ] Con el canvas enfocado, las flechas y el espacio no hacen scroll de la página.
- [ ] Escribir un espacio en el campo de iniciales del modal no carga el plunger ni reinicia el
      juego.
- [ ] `JUGAR DE NUEVO` reinicia a 0 puntos, nivel 1 y 3 vidas sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'pinball'`.
- [ ] Esa puntuación aparece en `/salon?juego=pinball` y en `/juegos/pinball` sin recargar a mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] La bola nunca queda atravesando un muro, una esquina cortada ni un flipper de forma
      permanente durante una sesión de juego de varios minutos.
- [ ] Dejar la pestaña en segundo plano y volver no hace que la bola salte varias posiciones de
      golpe ni atraviese un muro.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid`, `/jugar/snake` y `/jugar/frogger` se
      juegan igual que antes.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/pinball`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** mesa vertical 480×800, no horizontal. Un pinball reconocible es vertical; forzarlo a
  4/3 apaisado como Asteroids/Arkanoid rompería el género.
- **Sí:** primitivas de canvas, sin spritesheet. No hay asset de pinball en el repo y una mesa de
  formas geométricas ya se lee bien, como `ranaria`/`frogger`.
- **Sí:** el nivel del HUD es el multiplicador de combo, no una progresión de dificultad. Da al
  `onLevel` del contrato un significado real sin inventar oleadas que no tiene el pinball
  clásico.
- **No:** tilt. Penalizar sacudir la mesa requeriría detectar una tecla de "empujón" que esta
  variante no define; queda para si el usuario la pide explícitamente.
- **Sí:** el flipper con impulso propio (`FLIPPER_HIT_BOOST`), no un rebote puramente pasivo. Sin
  él la bola nunca gana velocidad de vuelta a los bumpers y la partida se apaga sola.
- **Sí:** tres vidas, plunger para cada una. Es la convención universal del género (bolas, no
  "vidas" narrativas) y encaja con el campo `lives` del contrato sin renombrarlo.
- **No:** multibola ni drop targets aquí. Es la variante `02`.
- **Sí:** sub-pasos de física acotados a `DT_MAX` en vez de un único paso por frame. A
  `MAX_BALL_SPEED` un solo paso a 60 fps puede atravesar un flipper o un muro delgado.

---

## Riesgos

| Riesgo                                                                              | Mitigación                                                                                     |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| La bola atraviesa un flipper o un muro a alta velocidad ("tunneling").               | `MAX_BALL_SPEED` acotado y varios sub-pasos de `DT_MAX` por frame en vez de un único paso largo. |
| La bola queda estable rebotando en un bucle sin perder energía nunca.                | `BALL_RESTITUTION < 1` en cada rebote de muro; solo bumpers y flippers activos devuelven energía. |
| La bola se cuela por la esquina cortada sin colisionar por un error de normal.       | La comprobación del paso 1 se hace antes de añadir flippers/bumpers, con la esquina ya trazada.   |
| El combo se completa "sin querer" con el orden de golpes equivocado y confunde al jugador. | El HUD de nivel del contrato ya muestra el número; no hace falta feedback extra para esta variante. |
| Los dos flippers comparten por error una sola tecla y no se pueden accionar a la vez. | `GAME_KEYS` fija cuatro teclas distintas (dos por flipper) y el paso 2 las prueba por separado.  |
| Portrait 480×800 no encaja con el marco CRT actual, pensado para 4/3.                | Se reporta como riesgo de integración a resolver por quien promueva la spec, no se fuerza aquí.  |

---

## Lo que **no** entra en esta spec

- Multibola, drop targets, rampas, spinner y bola extra (variante `02-pinball-multibola.md`).
- Tilt.
- Sonido.
- Selector de mesas o skins visuales.
- Controles táctiles.
- Animación de recuento de bonus al final de cada bola.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
