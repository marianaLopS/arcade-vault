# SPEC — BOLOS: clásico de 10 frames

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-06
> **Objetivo:** Diseñar `bolos` como un bowling fiel a las reglas oficiales — diez frames, strikes, spares y décimo frame con hasta tres bolas — con una física de trayectoria y choques bola/pinos simple y determinista, y una puntuación máxima de 300 que es la que viaja al leaderboard.

---

## Por qué existe esta spec

Sale de la sugerencia `BOWLING` de `References/resources/resources/game-suggestions-todo.md`
(lote del 2026-09-22), elegida al azar para esta game jam: «único juego de puntería con física
de trayectoria + pines; loop de turnos cortos (10 frames) y un sistema de scoring propio del
género (strikes/spares) distinto del score acumulado genérico». Ningún juego del catálogo tiene
turnos discretos con física entre turno y turno: Asteroids, Arkanoid y Frogger son tiempo real
continuo, Tetris y Snake son rejillas. Aquí el jugador **prepara** un tiro (posición, ángulo,
potencia), lo lanza y **mira** cómo la física lo resuelve.

Esta es la variante **clásica**, junto a `specs/game-jam/bolos/02-pista-trucada.md`. Comparten
el género, el mundo lógico de 800×600, la pista horizontal con los pinos a la derecha, el
contrato `GameEngine`, la regla de 10 frames y el mismo estilo de tirada en dos pulsaciones de
espacio. Lo que cambia entre variantes está en la sección «Decisiones»: aquí el tiro se define
con **posición + ángulo + potencia** y no hay nada más, así que todo el peso del juego recae en
la precisión; la variante 02 sustituye el ángulo por efecto (curva) y añade pista aceitada,
bolas especiales y bonus.

Como Snake (SPEC 10) y las variantes de `ciempies`, no hay código de referencia: las constantes
de esta spec **son** el diseño del juego, y los pasos 2 y 3 las fijan con la misma regla que los
ports: cambiarlas durante la implementación es rediseñar, no implementar.

---

## Alcance

**Dentro:**

- `lib/games/bolos/engine.ts`: motor nuevo con todo el estado en la clausura de `createBolosGame`.
- Mundo lógico de 800×600. Pista horizontal: la bola sale por la izquierda y los 10 pinos están
  a la derecha en triángulo (vértice hacia el jugador).
- Física propia de círculos: bola vs pinos, pinos vs pinos, bola/pinos vs paredes. Sin librerías.
- Reglas oficiales: 10 frames, 2 bolas por frame (1 si es strike), décimo frame con bola extra
  si hay strike o spare, bonus de strike (dos tiradas siguientes) y de spare (una).
- Tiro en tres fases: **posición** (↑/↓), **ángulo** (←/→) y **potencia** (barra que oscila).
- Canaletas: una bola que se sale del carril queda en la canaleta y suma 0.
- Marcador de 10 frames dibujado en el canvas (marcas `X`, `/`, `-`, acumulado por frame).
- Una línea `bolos` en `GAME_ENGINES` con `touch` para el mando virtual (SPEC 11).
- `lib/games.ts`: nueva ficha `bolos` (categoría `ARCADE`) y clase `.cover-bolos` en
  `app/globals.css`.
- Migración `insert into public.games (id, title) values ('bolos', 'BOLOS')` y su aplicación.

**Fuera de alcance (para specs futuras):**

- Efecto/curva de la bola, aceite en la pista, bolas especiales, bonus fuera de reglas: es la
  variante 02.
- Sonido.
- Modo dos jugadores o por equipos.
- Vista 3D o perspectiva: la pista se ve cenital y plana.
- Cámara que sigue a la bola.
- Handicap, selector de dificultad o de peso de la bola.
- Cambiar la categoría `CATS` o crear una categoría nueva.

---

## Modelo de datos

**No se crea ninguna tabla nueva, ni columna, ni tipo de plataforma.** `GameEngineEntry` existe
desde la SPEC 08, `scores` y `game_stats` sirven a este juego sin tocarlas (la puntuación máxima
de 300 cabe de sobra en el `CHECK` de 0..1.000.000) y el leaderboard se enciende con una fila en
`games`.

Tipos locales del motor, sin exportar:

```ts
type Phase = "aim" | "power" | "rolling" | "settling" | "sweep" | "gameover";
type Pin = { x: number; y: number; vx: number; vy: number; homeX: number; homeY: number; down: boolean };
type Ball = { x: number; y: number; vx: number; vy: number; gutter: boolean; done: boolean };
type Frame = { rolls: number[] }; // pinos derribados por tirada: 1-2 en los 9 primeros, 2-3 en el décimo
```

Estado en la clausura de `createBolosGame`:

- `frames: Frame[]` (10 entradas), `frameIdx` (0..9), `rollIdx` (tirada dentro del frame).
- `pins: Pin[]` (10), `ball: Ball`, `phase: Phase`.
- Apuntado: `aimY`, `aimAngle` (grados, positivo = hacia abajo en pantalla), `power` (0..1).
- `powerPhaseMs` (fase de la barra), `powerIdleMs` (tiempo en fase `power`), `settleMs`, `sweepMs`.
- `score` (acumulado oficial hasta el momento), `physAccum` (ms pendientes de integrar).
- Bucle: `rafId`, `lastTime`, `destroyed`. Entrada: `keys: Set<string>`.

**Geometría de la pista** (origen arriba-izquierda, en px de mundo):

```
W 800 · H 600
CARRIL:    x 120..740 · y 100..400 (alto 300, eje y = 250)
CANALETAS: y 60..100 (eje y = 80) y y 400..440 (eje y = 420)
LINEA_FALTA x = 120 · SALIDA_BOLA x = 90 · FONDO_PINOS x = 740 · FOSO x > 740
PINOS (r = 8), vértice hacia el jugador:
  fila 0: x 620 · y 250
  fila 1: x 646 · y 235, 265
  fila 2: x 672 · y 220, 250, 280
  fila 3: x 698 · y 205, 235, 265, 295
BARRA_POTENCIA: x 120..420 · y 450..470
MARCADOR: y 500..590, 10 casillas de 70 px desde x = 50, la décima de 100 px
```

---

## Plan de implementación

### 1. Constantes y marco del motor

`lib/games/bolos/engine.ts`. Constantes de diseño:

```
BALL_R 14 · BALL_MASS 6 · PIN_R 8 · PIN_MASS 1
AIM_Y_MIN 120 · AIM_Y_MAX 380 · AIM_Y_START 250 · AIM_Y_SPEED 160 px/s
ANGLE_MAX 12° · ANGLE_SPEED 20°/s · ANGLE_START 0°
POWER_PERIOD 1200 ms (triángulo 0→1→0) · POWER_MIN_SPEED 360 px/s · POWER_MAX_SPEED 760 px/s
  velocidad = POWER_MIN_SPEED + power * (POWER_MAX_SPEED - POWER_MIN_SPEED)
POWER_TIMEOUT 4000 ms (sin segunda pulsación: vuelve a `aim`, sin penalización)
JITTER_DEG 0.4 (ruido uniforme ±0.4° al soltar)
BALL_DRAG 20 px/s² · BALL_STOP_SPEED 25 px/s
RESTITUTION_BALL_PIN 0.8 · RESTITUTION_PIN_PIN 0.7 · PIN_DAMP 1.5 /s (v *= exp(-1.5·dt))
PIN_FALL_DIST 14 px (desplazamiento desde su casilla para contar como derribado)
PHYS_STEP 1000/120 ms · PHYS_STEPS_MAX 6 por frame · DT_MAX 50 ms
SETTLE_QUIET 600 ms (todos los pinos < 8 px/s) · SETTLE_MAX 6000 ms · SWEEP_MS 700
FRAMES 10
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

`GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`, `KeyD`,
`Space`. `preventDefault()` solo para esas. Listeners `keydown` / `keyup` / `blur` sobre el
canvas, nunca sobre `window`. `P` y `Escape` no llegan al motor. `blur` vacía `keys`.

Comprobación: `npm run build` limpio con el motor aún sin registrar.

### 2. Reglas de frame y puntuación

Máquina de turnos (en `phase === "settling"` → resolución):

- Tras cada bola se cuentan los pinos nuevos derribados (`down` que no lo estaban) y se añade a
  `frames[frameIdx].rolls`.
- Frames 1–9: strike (10 en la primera bola) cierra el frame; si no, hay segunda bola con los
  pinos que quedan en pie; tras la segunda el frame cierra.
- Frame 10: bola 1 siempre; bola 2 siempre; bola 3 solo si hubo strike en la 1 o spare en la 2.
  Tras un strike o un spare en el décimo, los pinos se **recolocan** (los 10) para la bola
  siguiente; en los demás casos se mantienen en pie los que quedan.
- Entre frames 1–9 se recolocan los 10 pinos al empezar el frame nuevo.
- `phase = "gameover"` al cerrar el frame 10: `stopLoop()` y `onGameOver(score)` una sola vez.

Puntuación oficial (la misma fórmula que cualquier planilla de bowling):

```
frame normal       = pinos de sus tiradas
spare  (/)         = 10 + pinos de la SIGUIENTE tirada (de cualquier frame)
strike (X)         = 10 + pinos de las DOS tiradas siguientes
frame 10           = suma de sus 2-3 tiradas (sin bonus extra)
```

`score` (el valor que va a `onScore` y al HUD) es la suma de los frames **ya resueltos**; un
strike o spare del frame actual suma sus 10 pronto como puntos «provisionales» y el bonus se
añade cuando existen las tiradas siguientes. Así una partida perfecta pasa por
`30, 60, …, 300` y nunca decrece. Máximo teórico: 300. Mínimo: 0.

Comprobación: función interna de puntuación probada a mano con tres planillas — partida
perfecta (12 strikes = 300), partida de spares con 5 en todo (`5/` ×10 + 5 = 150) y partida de
canaletas (0) — mediante `console.assert` temporal que se retira antes de cerrar el paso.

### 3. Física

Integración con paso fijo de `PHYS_STEP`; en cada frame se acumula `dt` (capado a `DT_MAX`) en
`physAccum` y se ejecutan hasta `PHYS_STEPS_MAX` pasos.

- **Bola:** movimiento rectilíneo. `BALL_DRAG` la frena; si su rapidez cae por debajo de
  `BALL_STOP_SPEED` queda `done`.
- **Canaleta:** si el centro de la bola sale de `y 100..400` (cruza el borde del carril) y aún
  no ha tocado ningún pino, se fija en `y = 80` o `y = 420` (el eje de la canaleta más cercana),
  `vy = 0`, `gutter = true`. Una bola en canaleta **no colisiona con pinos** y sigue hasta
  `x > 740`.
- **Bola vs pino** (círculos, masas 6 y 1): impulso elástico con `RESTITUTION_BALL_PIN`, más
  separación posicional para que no queden solapados.
- **Pino vs pino:** mismo esquema con masas iguales y `RESTITUTION_PIN_PIN`.
- **Pino vs paredes:** rebota en `y = 100` y `y = 400` (paredes del carril, pérdida de 40 % de
  velocidad); si cruza `x = 740` cae al foso y cuenta como derribado.
- `PIN_DAMP` frena a los pinos. Un pino está **derribado** cuando se ha movido más de
  `PIN_FALL_DIST` de su casilla de origen o ha caído al foso: pasa a `down = true`, se dibuja
  tumbado y **deja de colisionar** (así no actúa de obstáculo fantasma).
- Un pino derribado no vuelve a levantarse dentro de la misma bola.
- Si la bola queda `done` en medio del campo de pinos, se retira con el barrido (paso 4).

`settling` empieza cuando la bola está `done` o fuera (`x > 760`) y termina cuando todos los pinos
llevan `SETTLE_QUIET` ms por debajo de 8 px/s, o a `SETTLE_MAX` ms. Entonces se cuentan pinos.

Comprobación: tiro recto central a potencia máxima derriba entre 7 y 10 pinos de forma
consistente (con el ruido de `JITTER_DEG`); un tiro que se sale por la canaleta suma 0.

### 4. Fases, entrada y barrido

- **`aim`:** ↑/↓ o W/S mueven `aimY` entre `AIM_Y_MIN` y `AIM_Y_MAX`; ←/→ o A/D giran
  `aimAngle` (positivo hacia abajo en pantalla) entre `±ANGLE_MAX`. `Space` pasa a `power`.
- **`power`:** la barra oscila con periodo `POWER_PERIOD`; `Space` toma `power` en ese instante,
  aplica el ruido `JITTER_DEG` al ángulo, calcula la velocidad y pasa a `rolling`. Si pasan
  `POWER_TIMEOUT` ms sin pulsar, vuelve a `aim`. Las flechas se ignoran en esta fase.
- **`rolling`/`settling`:** sin entrada del jugador.
- **`sweep`:** `SWEEP_MS` ms de barrido visual (los pinos derribados desaparecen hacia el foso,
  la bola vuelve a `SALIDA_BOLA`); si procede un frame nuevo o un décimo con recolocación, los
  pinos reaparecen en su casilla. Después `phase = "aim"` con `aimAngle = 0` y `aimY` conservado.
- `Space` mantenido no relanza: el motor exige `keyup` entre `aim → power` y `power → rolling`.

Comprobación: `npm run build` limpio; los aprietos de espacio con la barra se ven en pantalla.

### 5. Dibujo y avisos a la plataforma

- `emit()` con `lastScore` / `lastLives` / `lastLevel`: `onLives(1)` **una vez** al inicio (como
  Tetris), `onLevel(frameIdx + 1)` al cambiar de frame, `onScore(score)` al cambiar.
- `draw()` sin asignar arrays/objetos dentro (SPEC 13): fondo oscuro, carril con vetas de
  madera (rectángulos), flechas guía en `x = 220`, canaletas más oscuras, línea de falta,
  pinos (círculo blanco con banda roja; derribados: elipse tumbada y opaca al 50 %), bola
  (círculo cian con tres agujeros), flecha de apuntado de longitud 60 px desde la bola con el
  ángulo actual (solo en `aim`/`power`), barra de potencia con relleno de verde a rojo (solo en
  `power`), marcador de 10 casillas con marcas y acumulado por frame (la casilla del frame
  actual resaltada).
- **El marcador del canvas es estado propio del juego**, como el siguiente tetromino de Tetris:
  no duplica el HUD, que sigue siendo el dueño del total y del frame actual. Las **marcas** por
  tirada (`X`, `/`, dígito, `-`) y el acumulado por frame se dibujan en el canvas; la puntuación
  total y las vidas, no.
- Etiquetas puntuales dentro del canvas permitidas: `STRIKE!` y `SPARE!` durante el `sweep`
  (900 ms) y `PULSA ESPACIO` mientras `aim` y la partida no ha empezado.
- Sin overlay de game over en el canvas: el modal lo pinta `GamePlayer`.
- `pause()` / `resume()`: congela el bucle y toda la física; `resume()` pone `lastTime = null`.
  Tras game over, `resume()` es no-op. `restart()`: detiene el bucle, resetea frames, pinos,
  bola, `score`, `keys`, llama a `emit()` y arranca. `destroy()` cancela el frame, quita los
  listeners y es idempotente. `initGame(); draw();` antes de devolver.

Comprobación: `npm run lint` y `npm run build` limpios; partida completa hasta el modal.

### 6. Catálogo: nueva ficha `bolos`

`lib/games.ts`, nueva entrada en `GAMES`:

```ts
{
  id: "bolos",
  title: "BOLOS",
  short: "Diez frames, diez pinos. Apunta, calcula la fuerza y tira.",
  long: "Coloca la bola, ajusta el ángulo y para la barra de potencia en el punto justo. Diez frames, strikes que valen el doble y una partida perfecta de 300 puntos que nadie en el salón ha visto todavía.",
  cat: "ARCADE",
  cover: "cover-bolos",
  color: "cyan",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `.cover-bolos` nueva (carril con triángulo de pinos), compartida con la
variante 02 si se implementan ambas.

Comprobación: `/juegos/bolos` muestra la ficha en la biblioteca con su portada antes de que el
motor esté registrado.

### 7. Registrar el motor

`lib/games/registry.ts`:

```ts
bolos: {
  create: createBolosGame,
  width: 800,
  height: 600,
  controls: "flechas o WASD para colocar y apuntar, espacio para fijar la potencia y tirar",
  touch: { a: { code: "Space", label: "TIRAR" } },
},
```

Comprobación: `/jugar/bolos` pinta el canvas real en vez de `.game-arena`. El mando táctil sale
con cruceta y un botón.

### 8. Leaderboard

`supabase/migrations/<timestamp>_juego_bolos.sql`, con timestamp posterior a
`20260927130000`:

```sql
insert into public.games (id, title) values ('bolos', 'BOLOS');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. Los tipos no se
regeneran: insertar una fila no cambia el esquema.

Comprobación: `select * from public.games` incluye la fila `bolos`.

### 9. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido manual
de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/bolos` muestra un canvas de 800×600 con la pista, 10 pinos en triángulo, la bola y
      el marcador de 10 casillas, no la `.game-arena`.
- [ ] El HUD muestra 1 vida y `FRAME 01` desde el inicio, y el juego no avanza hasta pulsar
      espacio.
- [ ] ↑/↓ (y W/S) mueven la bola entre `y 120` y `y 380` sin salirse del carril; ←/→ (y A/D)
      giran la flecha de apuntado hasta ±12° y no más.
- [ ] Un primer espacio arranca la barra de potencia; un segundo espacio lanza la bola con la
      velocidad correspondiente al valor de la barra en ese instante.
- [ ] Si no se pulsa el segundo espacio en 4 s, el juego vuelve a la fase de apuntado sin gastar
      bola.
- [ ] Mantener espacio pulsado no lanza la bola de golpe: hace falta soltar y volver a pulsar.
- [ ] Un tiro central a potencia alta derriba entre 7 y 10 pinos; con 20 tiros iguales hay al
      menos 2 resultados distintos (el ruido de `JITTER_DEG` funciona).
- [ ] Una bola lanzada fuera del carril cae a la canaleta, no choca con ningún pino y suma 0.
- [ ] Los pinos derribados se dibujan tumbados, dejan de estorbar, y no reaparecen hasta el
      barrido/recolocación.
- [ ] Un strike en el frame 1–9 cierra el frame con una sola bola y muestra `STRIKE!`.
- [ ] Un spare muestra `SPARE!` y el bonus del frame se suma al derribar con la bola siguiente.
- [ ] Partida de 12 strikes seguidos → `score` final 300 (comprobado forzando el resultado en una
      sesión de depuración, nunca dejándolo en el código).
- [ ] Partida con todo en canaletas → `score` final 0 y el modal `FIN DEL JUEGO` se abre igual.
- [ ] En el frame 10 un strike o spare da una tercera bola y recoloca los 10 pinos; un frame 10
      abierto termina tras 2 bolas.
- [ ] El `score` del HUD no decrece nunca durante la partida y coincide con el acumulado del
      último frame resuelto del marcador.
- [ ] El HUD pasa de `FRAME 01` a `FRAME 10` y se queda en 10 al terminar.
- [ ] El canvas dibuja marcas por tirada y acumulado por frame, pero no la puntuación total ni
      las vidas.
- [ ] `PAUSA` congela el juego en cualquier fase (incluida con la bola rodando) y `REANUDAR` lo
      continúa sin saltos; `P` y `Escape` hacen lo mismo.
- [ ] Con el canvas enfocado, las flechas, WASD y el espacio no hacen scroll de la página.
- [ ] Escribir `W`, `A`, `S`, `D` o espacio en el campo de iniciales no mueve ni lanza nada.
- [ ] `JUGAR DE NUEVO` reinicia a frame 1, 0 puntos y 10 pinos sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'bolos'`.
- [ ] Esa puntuación aparece en `/salon?juego=bolos` y en `/juegos/bolos` sin recargar a mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Con `scores` vacía para este juego, `/salon?juego=bolos` muestra el estado vacío.
- [ ] En un móvil en vertical el mando virtual mueve y apunta, y el botón `TIRAR` hace el trabajo
      de espacio en las dos pulsaciones.
- [ ] Navegar de `/jugar/bolos` a `/biblioteca` y volver no duplica el bucle.
- [ ] Dejar la pestaña en segundo plano y volver no hace que la bola atraviese pinos ni salte
      de posición de golpe.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid`, `/jugar/snake` y `/jugar/frogger`
      se juegan igual que antes.
- [ ] `select * from public.games` incluye una fila `bolos` además de las ya existentes.
- [ ] `lib/games.ts` mantiene sin tocar las fichas de los demás juegos.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/bolos`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** id `bolos`, en español como `caida`, `ciempies` o `ranaria`. No choca con ningún `id` de
  `lib/games.ts` ni con otra carpeta de `specs/game-jam/`.
- **Sí:** categoría `ARCADE`. No hay categoría de deportes y crearla toca `CATS` y la
  biblioteca; otra spec si llega.
- **Sí:** vista cenital con la pista en horizontal. Cabe en el marco 4/3 de 800×600 y deja el
  marcador abajo sin perspectiva.
- **Sí:** tiro en dos pulsaciones de espacio (fijar y soltar). Es el patrón clásico de los
  bolos arcade y funciona con un único botón táctil.
- **Sí:** posición + ángulo + potencia como único control de la bola. Es la variante «pura»: el
  efecto/curva queda para la variante 02.
- **Sí:** ruido de ±0.4° al soltar. Sin él, un tiro perfecto se repetiría 10 veces seguidas y
  una partida de 300 sería un ejercicio de memoria, no de pulso.
- **Sí:** física de círculos con paso fijo a 120 Hz. A 60 Hz con una bola a 760 px/s se
  atraviesan pinos de 8 px de radio; a 120 Hz el desplazamiento por paso (≈ 6.3 px) queda por
  debajo del radio del pino.
- **Sí:** marcador dibujado en el canvas. Es estado propio del juego, como `PULSA UNA FLECHA` en
  Snake; el total y las vidas siguen siendo del HUD.
- **Sí:** `onLevel` = número de frame (1..10), para dar sentido al HUD de nivel.
- **Sí:** `onLives(1)` una vez y nunca cambia, como Tetris y Snake: el juego termina por frames,
  no por vidas.
- **Sí:** `score` provisional que sube con strikes/spares y se completa con el bonus, para que
  el HUD no decrezca ni salte hacia atrás.
- **No:** efecto, aceite, bolas especiales ni bonus fuera de reglas. Es la variante 02.
- **No:** sonido. No hay assets de audio.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Sin código de referencia, las constantes de física se ajustan «a ojo» durante la implementación. | Los pasos 1 y 3 las fijan y las declaran fuera de cambio, como Snake (SPEC 10). Los criterios piden resultados medibles (7–10 pinos en tiro central). |
| Túnel: la bola a máxima velocidad atraviesa un pino en un solo paso de física. | Paso fijo de 1/120 s; el desplazamiento máximo por paso (≈ 6.3 px) es menor que `PIN_R`. `DT_MAX` y `PHYS_STEPS_MAX` limitan el trabajo al volver de una pestaña oculta. |
| Los pinos se quedan «temblando» en un empate de colisiones y `settling` no termina. | `PIN_DAMP` frena en exponencial y `SETTLE_MAX 6000 ms` cierra la bola pase lo que pase. |
| Un pino derribado sigue chocando y bloquea la bola como obstáculo invisible. | `down = true` apaga su colisión; se comprueba en la bola siguiente que atraviesa su casilla. |
| La partida puede ser determinista y resolverse memorizando un tiro (strike perfecto repetible). | `JITTER_DEG 0.4`; criterio de aceptación que exige variabilidad entre tiros idénticos. |
| El cálculo de puntuación de strikes y spares consecutivos y del décimo frame es fácil de equivocar. | El paso 2 prueba tres planillas conocidas (300, 150, 0) con `console.assert` temporal; criterio de aceptación con 12 strikes. |
| El jugador queda en la fase `power` sin pulsar (distraído o con el foco perdido) y la barra oscila para siempre. | `POWER_TIMEOUT 4000 ms` devuelve a `aim` sin gastar bola; `blur` vacía `keys`. |
| Con el mando táctil, ↑/↓ y ←/→ con repetición pueden dar saltos bruscos de ángulo o posición. | El apuntado se mueve por velocidad (`AIM_Y_SPEED`, `ANGLE_SPEED`) mientras la tecla está pulsada, no por incrementos por evento. |
| `restart()` deja pinos derribados o `phase` de la partida anterior. | `initGame()` reconstruye frames, pinos, bola, `phase = "aim"` y `score`; criterio de aceptación de `JUGAR DE NUEVO`. |

---

## Lo que **no** entra en esta spec

- Efecto/curva, pista aceitada, bolas especiales y bonus fuera de reglas (variante 02).
- Sonido.
- Dos jugadores o partida por equipos.
- Cámara, perspectiva 3D o animaciones de la bola de retorno.
- Skins (`clasico`/`neon`/`retro`).
- Selector de dificultad, handicap o peso de la bola.
- Una categoría nueva en `CATS`.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.
- Rate limiting, antitrampas y validación de la puntuación en servidor.

Cada una de ellas, si entra, va en su propia spec.
