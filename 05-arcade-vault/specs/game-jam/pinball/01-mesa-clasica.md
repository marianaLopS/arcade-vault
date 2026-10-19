# SPEC — PINBALL: mesa clásica

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-19
> **Objetivo:** Diseñar un pinball de mesa única — bola con física de gravedad y rebote, dos
> flippers, tres bumpers, dos slingshots, carriles laterales y un muelle de lanzamiento — como
> ficha nueva `pinball` en categoría ARCADE, con motor real y leaderboard en Supabase desde el
> primer día.

---

## Por qué existe esta spec

Todo lo que hoy tiene motor real en Arcade Vault resuelve la colisión con geometría simple:
rectángulos contra rectángulos (Arkanoid, Tetris, Snake) o círculos contra círculos (Asteroids).
Ninguno tiene **gravedad constante**, **rebote con pérdida de energía** ni **superficies
inclinadas**. Pinball es el género arcade donde la física *es* el juego, y la sugerencia consta
en `game-suggestions-todo.md` (2026-09-22) con ese motivo exacto.

Como con Snake (SPEC 10) y las propuestas de `ciempies`, **no hay código de referencia**: las
constantes de este documento son el diseño en sí. Cambiarlas durante la implementación es
rediseñar, no implementar. El motor dibuja todo con primitivas de canvas (líneas, arcos,
rectángulos); no hay spritesheet.

Esta variante es la lectura **mínima y fiel** del pinball electromecánico: una mesa fija, sin
objetivos que recordar ni multibola. La segunda variante (`02-mesa-de-misiones.md`) añade
objetivos encadenados, multibola y empujón con penalización; esta se queda en el conjunto más
pequeño que ya es reconociblemente pinball.

---

## Alcance

**Dentro:**

- `lib/games/pinball/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createPinballGame`, sin assets externos.
- Mundo lógico de **600×800**. Mesa de una sola pantalla, sin scroll.
- Física propia: integración con paso fijo y subpasos, gravedad, colisión círculo-segmento y
  círculo-círculo, sin librería externa.
- Dos flippers (izquierdo y derecho) controlados por teclado.
- Muelle de lanzamiento con carga mantenida (la fuerza depende de cuánto se mantiene la tecla).
- Tres bumpers circulares (100 puntos) y dos slingshots triangulares sobre los flippers (10).
- Dos carriles superiores y dos carriles de retorno laterales con bonificación.
- Tres bolas por partida; la partida acaba al drenar la tercera.
- Nueva ficha `pinball` en `lib/games.ts` (categoría `ARCADE`) y clase `cover-pinball` en
  `app/globals.css`.
- Una línea `pinball` en `GAME_ENGINES` (`lib/games/registry.ts`).
- Migración `insert into public.games (id, title) values ('pinball', 'PINBALL')` y su aplicación.

**Fuera de alcance (para otras specs o para la variante `02-mesa-de-misiones.md`):**

- Multibola, misiones, rampas con subida a un segundo nivel y empujón (`nudge`)/`TILT`.
- Más de una mesa.
- Sonido.
- Controles táctiles más allá de los botones declarados en el registro.
- Skins.
- Bola extra por puntuación.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla, columna ni tipo de plataforma.** `scores` y `game_stats` sirven a
este juego sin tocarlas; el leaderboard se enciende con una fila en `games`.

Tipos locales del motor, sin exportar:

```ts
type Vec = { x: number; y: number };
type Ball = { x: number; y: number; vx: number; vy: number }; // px y px/s, centro
type Seg = { a: Vec; b: Vec };                                  // pared fija
type Flipper = { pivot: Vec; length: number; angle: number; omega: number; side: "L" | "R" };
type Bumper = { x: number; y: number; r: number; flash: number }; // flash en ms restantes
type Phase = "plunger" | "playing" | "drained" | "gameover";
```

Estado en la clausura de `createPinballGame`:

- `ball: Ball`, `phase: Phase`, `plungerCharge` (0..1), `plungerHeld` (bool).
- `flippers: [Flipper, Flipper]`, `bumpers: Bumper[]`, `lanes: boolean[]` (4 carriles).
- `score`, `ballsLeft`, `level` (fijo a 1 salvo el multiplicador de carriles; ver paso 5).
- `laneMult` (1..4), `drainTimer` (ms de pausa tras un drenaje).
- Bucle: `rafId`, `lastTime`, `accum`, `destroyed`. Entrada: `keys: Set<string>`.

---

## Plan de implementación

### 1. Constantes y geometría de la mesa

`lib/games/pinball/engine.ts`, primera parte. Constantes de diseño:

```
W 600 · H 800
BALL_R 9 px · GRAVITY 900 px/s² (la mesa está inclinada, no es gravedad terrestre)
STEP_MS 4 (paso fijo de física, 250 Hz) · SUBSTEPS_MAX 12 por frame · DT_MAX 50 ms
RESTITUTION_WALL 0.55 · RESTITUTION_BUMPER 1.15 (los bumpers suman energía) · VMAX 1400 px/s
BALLS_START 3 · BALL_START en el carril del muelle (x=570, y=720)
```

Paredes (`Seg[]`), en coordenadas de mundo:

```
Borde izquierdo      (20,780)→(20,180)    Borde derecho   (560,780)→(560,180)
Arco superior        arco de radio 270 centrado en (290,180), de (20,180) a (560,180),
                     aproximado con 12 segmentos
Carril del muelle    pared (560,780)→(560,200) + pared (590,780)→(590,200); la bola sale por
                     un hueco de la pared interior en y∈[180,200] hacia la mesa
Rampas de drenaje    (20,640)→(150,720)   (560,640)→(430,720)
Zona de drenaje      cualquier y > 800 (la bola fuera de la mesa)
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Colisión círculo-segmento: punto más cercano del segmento al centro; si `dist < BALL_R`, se
empuja la bola fuera por la normal y se refleja la componente normal de la velocidad con
`RESTITUTION_WALL`, conservando la tangencial.

Comprobación: `npm run build` limpio; con el motor sin registrar, una bola de prueba soltada
rebota en las paredes sin atravesarlas.

### 2. Flippers

Constantes:

```
FLIPPER_LEN 78 px · FLIPPER_THICK 12 px
Pivote izquierdo (190,720) · pivote derecho (400,720)
Ángulo en reposo: izquierdo +30° (apunta hacia abajo-derecha) · derecho 150°
Ángulo activo: izquierdo -25° · derecho 205°   (recorrido de 55°)
FLIPPER_OMEGA_UP 22 rad/s (subida) · FLIPPER_OMEGA_DOWN 9 rad/s (bajada)
```

- Cada flipper se trata como un segmento con extremo redondeado. Se mueve a velocidad angular
  fija hasta el ángulo objetivo (activo si su tecla está pulsada, reposo si no).
- Al colisionar con la bola, la velocidad de la superficie en el punto de contacto
  (`omega × r`) se suma a la velocidad relativa antes de reflejar. Así un flipper que sube
  lanza la bola y uno quieto sólo la desvía.
- Teclas: `ArrowLeft` / `KeyZ` / `KeyA` → izquierdo; `ArrowRight` / `Slash` / `KeyD` → derecho.

Comprobación: con la bola de prueba, mantener la tecla lanza la bola al menos 300 px hacia arriba
si cae sobre el flipper en reposo.

### 3. Bumpers, slingshots y carriles

Constantes:

```
BUMPER_R 24 px · posiciones (230,300), (360,300), (295,390)
POINTS_BUMPER 100 · BUMPER_FLASH_MS 120
SLINGSHOT: triángulos en (60,560)-(60,640)-(160,690) y (520,560)-(520,640)-(420,690);
  el lado interior aplica restitución 1.0 y un impulso adicional de 220 px/s hacia fuera
POINTS_SLING 10
CARRILES SUPERIORES: 2 huecos de 40 px en y=120, centros x=230 y x=360
CARRILES DE RETORNO: 2 canales a x=40 y x=540, desde y=420 hasta y=620
POINTS_LANE 50 · LANE_MULT_MAX 4
```

- Un bumper impacta como círculo fijo con `RESTITUTION_BUMPER`, suma `POINTS_BUMPER × laneMult`
  y enciende su `flash`.
- Cruzar un carril superior lo enciende; cuando los dos están encendidos, `laneMult` sube en 1
  (tope `LANE_MULT_MAX`) y ambos se apagan. Los carriles de retorno suman `POINTS_LANE` sin
  afectar el multiplicador.
- `laneMult` se reinicia a 1 al drenar la bola.

Comprobación: `npm run build` limpio; golpear un bumper de prueba suma 100 puntos y lo hace
parpadear 120 ms.

### 4. Muelle de lanzamiento y fases

Constantes:

```
PLUNGER_CHARGE_MS 1200 (tiempo para llegar de 0 a 1 manteniendo Space)
LAUNCH_VY_MIN -700 px/s · LAUNCH_VY_MAX -1250 px/s  (interpolado por la carga)
DRAIN_PAUSE_MS 900
```

- `phase = "plunger"`: la bola reposa en (570,720). Mantener `Space` carga; al soltar, la bola
  sale con `vy = lerp(LAUNCH_VY_MIN, LAUNCH_VY_MAX, plungerCharge)` y `phase = "playing"`.
- Soltar con carga < 0.15 no lanza lo bastante para salir del carril: la bola vuelve al muelle.
- Al drenar (`ball.y > H + BALL_R`): `ballsLeft--`, `onLives(ballsLeft)`, `phase = "drained"`
  durante `DRAIN_PAUSE_MS`; después, `phase = "plunger"` con bola nueva, o `"gameover"` si
  `ballsLeft === 0`.

Comprobación: `npm run build` limpio; la bola sale por el hueco superior del carril con carga
máxima y no con carga mínima.

### 5. Puntuación y avisos

- `score` es la suma de bumpers, slingshots y carriles (ya multiplicados donde aplica).
- Bonus de drenaje: `100 × (carriles encendidos al drenar)`, sumado al perder la bola.
- `emit()` con `lastScore` / `lastLives` / `lastLevel`, llamando a los callbacks sólo cuando el
  valor cambia. `onLevel(laneMult)` refleja el multiplicador actual (`x1`..`x4`) en el HUD.
- `onLives(BALLS_START)` al iniciar. `onGameOver(score)` una sola vez, tras detener el bucle.

Comprobación: `npm run build` limpio; el HUD muestra 3 vidas al empezar y baja al drenar.

### 6. Bucle, entrada y dibujo

- Paso fijo: `accum += dt`; mientras `accum >= STEP_MS` y se hayan hecho menos de
  `SUBSTEPS_MAX` pasos, se integra la física. `dt` capado a `DT_MAX`; `lastTime = null` al
  reanudar. El resto de `accum` se descarta si se agota `SUBSTEPS_MAX`.
- Integración semi-implícita: `vy += GRAVITY·h`, `pos += v·h`, con `h = STEP_MS/1000`.
  La velocidad se limita a `VMAX` tras cada colisión (evita el efecto túnel contra paredes).
- `draw()`: fondo oscuro, paredes como líneas gruesas, bumpers como círculos con anillo, bola
  blanca con brillo, flippers como cápsulas, barra de carga del muelle junto al carril. Ningún
  puntaje, bola restante ni overlay de game over dentro del canvas; `PULSA ESPACIO` está
  permitido en `phase = "plunger"` porque es estado propio del juego.
- `GAME_KEYS`: `ArrowLeft`, `ArrowRight`, `KeyZ`, `KeyA`, `KeyD`, `Slash`, `Space`.
  `preventDefault()` solo para esas. `P` y `Escape` no llegan al motor.
- Listeners `keydown` / `keyup` / `blur` sobre el canvas, nunca sobre `window`. `blur` suelta
  flippers y muelle.
- `restart()`: detiene el bucle, reinicia bola, flippers, carriles, `score`, `ballsLeft`,
  `laneMult`, `phase = "plunger"`, `emit()` y arranca.
- `destroy()` cancela el frame, quita los listeners y es idempotente.
- `initGame(); draw();` antes de devolver el motor.

Comprobación: `npm run build` limpio; una partida completa de tres bolas termina en
`onGameOver`.

### 7. Catálogo y registro

`lib/games.ts`, nueva entrada:

```ts
{
  id: "pinball",
  title: "PINBALL",
  short: "Mantén la bola en juego con dos flippers.",
  long: "Una sola mesa, una bola de acero y tres oportunidades. Lanza con el muelle, golpea los bumpers y enciende los carriles para subir el multiplicador. Cuando la bola cae, solo los flippers te separan del drenaje.",
  cat: "ARCADE",
  cover: "cover-pinball",
  color: "magenta",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `.cover-pinball` en el mismo patrón que las portadas generadas.

`lib/games/registry.ts`:

```ts
pinball: {
  create: createPinballGame,
  width: 600,
  height: 800,
  controls: "flechas o Z y / para los flippers, mantén espacio para cargar el muelle",
  touch: { left: { code: "ArrowLeft", label: "◀" }, right: { code: "ArrowRight", label: "▶" }, a: { code: "Space", label: "MUELLE" } },
},
```

Comprobación: `/juegos/pinball` muestra la ficha; `/jugar/pinball` pinta el canvas real.

### 8. Leaderboard

`supabase/migrations/<timestamp>_juego_pinball.sql`:

```sql
insert into public.games (id, title) values ('pinball', 'PINBALL');
```

Se aplica con `apply_migration` y se comprueba con `execute_sql`. Los tipos no se regeneran.
La inserción de puntuaciones sigue la política vigente de SPEC 15 (`user_id` incluido).

Comprobación: `select * from public.games` incluye la fila `pinball`.

### 9. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido
manual de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/pinball` muestra un canvas de 600×800 con mesa, bumpers, flippers y bola, no la
      `.game-arena`.
- [ ] La partida empieza en `phase = "plunger"` con la bola en el carril del muelle y 3 bolas
      en el HUD.
- [ ] Mantener `Space` llena la barra de carga en ~1,2 s; soltar con carga máxima saca la bola a
      la mesa y con carga mínima la devuelve al muelle.
- [ ] Los flippers suben al pulsar su tecla y bajan al soltarla, cada uno de forma independiente.
- [ ] Una bola que cae sobre un flipper en reposo sale desviada; sobre un flipper que sube sale
      lanzada con claramente más velocidad.
- [ ] Un bumper suma 100 × multiplicador y parpadea; los slingshots suman 10 y empujan la bola.
- [ ] Encender los dos carriles superiores sube el multiplicador en 1 (tope x4) y lo muestra en
      el HUD como nivel.
- [ ] La bola nunca atraviesa una pared ni un flipper, ni siquiera a velocidad máxima.
- [ ] Drenar resta una bola, hace una pausa de ~0,9 s y deja una bola nueva en el muelle.
- [ ] Drenar la tercera bola abre el modal `FIN DEL JUEGO` con la puntuación real.
- [ ] El multiplicador vuelve a x1 tras cada drenaje.
- [ ] El canvas no dibuja puntos, bolas restantes ni overlay de game over.
- [ ] `PAUSA` congela física y flippers; `REANUDAR` continúa sin que la bola dé un salto.
- [ ] `P` y `Escape` hacen lo mismo que el botón, y el motor no los interpreta como jugada.
- [ ] Con el canvas enfocado, flechas y espacio no hacen scroll de la página.
- [ ] Escribir en el campo de iniciales no mueve flippers ni lanza el muelle.
- [ ] `JUGAR DE NUEVO` reinicia puntuación, bolas y multiplicador sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'pinball'`.
- [ ] Esa puntuación aparece en `/salon?juego=pinball` y en `/juegos/pinball` sin recargar a
      mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Con `scores` vacía para este juego, `/salon?juego=pinball` muestra el estado vacío.
- [ ] Dejar la pestaña en segundo plano y volver no teletransporta la bola (`dt` capado).
- [ ] Navegar de `/jugar/pinball` a `/biblioteca` y volver no duplica el bucle.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid` y `/jugar/snake` se juegan igual que
      antes.
- [ ] `lib/games.ts` mantiene sin tocar las fichas de los demás juegos.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/pinball`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** mundo 600×800, vertical como una mesa real. Un 800×600 apaisado obligaría a girar la
  mesa o a acortar el recorrido de caída, que es lo que da tiempo de reacción.
- **Sí:** física propia con paso fijo de 4 ms. Pinball es sensible al `dt`; un paso variable
  haría que la misma jugada rebotase distinto a 30 y a 144 Hz.
- **Sí:** subpasos limitados a 12 por frame. Evita la espiral de la muerte tras una pausa
  larga, a costa de descartar tiempo.
- **Sí:** el flipper aporta su velocidad de superficie a la colisión. Sin ello, los flippers
  serían paredes móviles y no se podría «lanzar» la bola.
- **Sí:** restitución de bumper > 1. Es lo que los distingue de una pared y mantiene viva la bola
  en la zona alta.
- **Sí:** tres bolas y vidas en el HUD como bolas restantes. Reutiliza `onLives` sin tocar el
  contrato.
- **Sí:** `onLevel` expone el multiplicador. El HUD ya tiene un nivel; sirve sin ampliar el
  contrato.
- **No:** empujón (`nudge`). Es la capa extra de la variante 02; aquí la mesa es inamovible.
- **No:** bola extra por puntos. Alarga partidas sin aportar decisiones.
- **No:** sonido, skins ni sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Efecto túnel: la bola atraviesa una pared o un flipper a alta velocidad. | Paso fijo de 4 ms y `VMAX` 1400 px/s: máximo 5,6 px por paso, menos que `BALL_R`. |
| La bola se queda atrapada rebotando eternamente entre dos superficies. | Las restituciones < 1 en paredes la frenan; los bumpers (> 1) están lejos de los huecos cerrados; se verifica jugando una partida larga. |
| Colisión con flipper en movimiento da rebotes incoherentes (velocidad de superficie mal signada). | El paso 2 fija la fórmula `omega × r` y un criterio de aceptación compara flipper en reposo vs. subiendo. |
| El pico de `dt` tras volver de otra pestaña hace saltar la bola. | `dt` capado a 50 ms, `SUBSTEPS_MAX` y `lastTime = null` al reanudar. |
| Una bola lanzada con poca carga se queda en el carril sin salir ni volver. | Regla explícita del paso 4: carga < 0.15 devuelve la bola al muelle. |
| Sin referencia, las constantes se ajustan «a ojo» durante la implementación. | Los pasos 1-4 las fijan y las declaran fuera de cambio, como Snake (SPEC 10). |

---

## Lo que **no** entra en esta spec

- Multibola, misiones, rampas de segundo nivel, empujón y `TILT`.
- Varias mesas.
- Sonido.
- Skins.
- Controles táctiles más allá de los botones declarados en el registro.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.
- Rate limiting, antitrampas y validación de la puntuación en servidor.

Cada una de ellas, si entra, va en su propia spec.
