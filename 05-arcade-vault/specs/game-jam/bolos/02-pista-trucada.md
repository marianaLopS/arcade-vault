# SPEC — BOLOS: pista trucada

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-06
> **Objetivo:** Diseñar `bolos` como un bowling de táctica y riesgo: en vez de apuntar con ángulo, el jugador lanza con **efecto** (curva), cada frame tiene una **pista aceitada** distinta que decide dónde empieza a curvar la bola, hay tres **bolas** (normal, pesada y relámpago) de uso limitado y los strikes y spares **curvos** dan un bonus sobre la puntuación oficial.

---

## Por qué existe esta spec

Segunda variante de `bolos`, junto a `specs/game-jam/bolos/01-clasico-10-frames.md`. Comparte con
ella el género, el mundo lógico de 800×600, la pista horizontal con los 10 pinos a la derecha,
la geometría exacta de carril/canaletas/pinos, las reglas oficiales de 10 frames (strike, spare,
décimo frame con bola extra), el contrato `GameEngine`, el paso de física a 120 Hz y el tiro en
dos pulsaciones de espacio. Nada de eso cambia entre variantes.

Lo que cambia es **cómo se decide el tiro y qué rodea al tiro**. La variante 01 es el bowling
puro: posición + ángulo + potencia, y la gracia es el pulso. Aquí:

- el **ángulo desaparece** y lo sustituye el **efecto**: la bola sale recta y, una vez pasada la
  zona aceitada, se curva hacia un lado. El jugador no apunta a los pinos, apunta a **dónde
  quiere que llegue la curva**;
- cada frame tiene una **pista distinta** (el aceite acaba en un punto diferente), así que el
  mismo tiro no sirve dos veces y hay que releer la pista cada turno;
- hay **tres bolas** con comportamientos distintos y usos limitados, lo que introduce una
  decisión de gestión de recursos a lo largo de las 10 frames;
- se añade un **bonus sobre las reglas oficiales** por strikes y spares conseguidos con curva,
  que premia el riesgo (la curva fuerte se sale a la canaleta con más facilidad).

Como Snake (SPEC 10) y las demás jams sin referencia, las constantes de esta spec **son** el
diseño: los pasos 1–4 las fijan y cambiarlas durante la implementación es rediseñar.

---

## Alcance

**Dentro:**

- `lib/games/bolos/engine.ts`: **el mismo archivo** que la variante 01 — esta spec describe una
  implementación alternativa completa, no un parche. Si se promueve esta variante en lugar de
  la 01, es este documento el que gobierna el archivo.
- Mismo mundo (800×600), geometría de pista y pinos, física de círculos, reglas de frames y
  puntuación oficial de la variante 01 (se repiten abajo para que esta spec sea autosuficiente).
- **Efecto:** `spin` entero de −3 a +3 elegido con ←/→ (A/D). Sin ángulo: la bola sale siempre
  a 0° desde su posición elegida con ↑/↓.
- **Pista aceitada:** el efecto solo actúa a partir de `x = OIL_END[frame]`; la tabla de los 10
  frames fija ese punto (entre 300 y 380 px). La zona aceitada se dibuja con brillo.
- **Tres bolas:** `NORMAL` (ilimitada), `PESADA` (3 usos) y `RELÁMPAGO` (3 usos), alternadas con
  `C` / botón B táctil en la fase de apuntado.
- **Bonus curvo:** +25 puntos por strike con `|spin| ≥ 2` y +10 por spare con `|spin| ≥ 2` en la
  segunda bola, sumados al `score` oficial.
- Marcador de 10 casillas dibujado en el canvas con las marcas oficiales y el acumulado, y un
  panel de bolas (usos restantes) junto a la barra de potencia.
- Una línea `bolos` en `GAME_ENGINES` con `touch` para el mando virtual (SPEC 11).
- `lib/games.ts`: nueva ficha `bolos` (categoría `ARCADE`) y clase `.cover-bolos` en
  `app/globals.css`.
- Migración `insert into public.games (id, title) values ('bolos', 'BOLOS')` y su aplicación.

**Fuera de alcance (para specs futuras):**

- Ángulo de lanzamiento libre (es la variante 01).
- Pistas de más de un tipo seleccionables por el jugador, modos por frames elegidos o torneos.
- Más de tres bolas, compras o mejoras entre partidas.
- Obstáculos móviles en la pista o pinos especiales.
- Sonido, dos jugadores, perspectiva 3D.
- Cambiar `CATS` o crear una categoría nueva.

---

## Modelo de datos

**No se crea ninguna tabla nueva, ni columna, ni tipo de plataforma.** `scores` y `game_stats`
sirven a este juego sin tocarlas: la puntuación máxima de esta variante es 600 (300 oficiales +
12 bonus de 25), muy por debajo del `CHECK` de 0..1.000.000.

Tipos locales del motor, sin exportar:

```ts
type Phase = "aim" | "power" | "rolling" | "settling" | "sweep" | "gameover";
type BallKind = "normal" | "pesada" | "relampago";
type Pin = { x: number; y: number; vx: number; vy: number; homeX: number; homeY: number; down: boolean };
type Ball = { x: number; y: number; vx: number; vy: number; kind: BallKind; spin: number; gutter: boolean; done: boolean };
type Roll = { pins: number; spin: number }; // pinos derribados y efecto con el que se lanzó
type Frame = { rolls: Roll[] };
```

Estado en la clausura de `createBolosGame`:

- `frames: Frame[]` (10 entradas), `frameIdx` (0..9), `pins: Pin[]` (10), `ball: Ball`, `phase`.
- Apuntado: `aimY`, `spin` (−3..+3), `kind` (bola elegida), `uses: Record<BallKind, number>`.
- `power`, `powerPhaseMs`, `powerIdleMs`, `settleMs`, `sweepMs`, `physAccum`.
- `officialScore`, `bonusScore` y `score = officialScore + bonusScore`.
- `bannerText`, `bannerMs` (etiquetas `STRIKE!`, `SPARE!`, `STRIKE CURVO +25`…).
- Bucle: `rafId`, `lastTime`, `destroyed`. Entrada: `keys: Set<string>`.

**Geometría de la pista** (idéntica a la variante 01):

```
W 800 · H 600
CARRIL:    x 120..740 · y 100..400 (eje y = 250)
CANALETAS: y 60..100 (eje y = 80) y y 400..440 (eje y = 420)
LINEA_FALTA x = 120 · SALIDA_BOLA x = 90 · FONDO_PINOS x = 740 · FOSO x > 740
PINOS (r = 8): fila 0 x 620 y 250 · fila 1 x 646 y 235, 265 · fila 2 x 672 y 220, 250, 280
               fila 3 x 698 y 205, 235, 265, 295
BARRA_POTENCIA: x 120..420 · y 450..470
PANEL_BOLAS: x 450..780 · y 440..480 (3 casillas)
MARCADOR: y 500..590, 10 casillas de 70 px desde x = 50, la décima de 100 px
```

---

## Plan de implementación

### 1. Constantes y marco del motor

`lib/games/bolos/engine.ts`. Constantes de diseño:

```
BALL_R 14 · PIN_R 8 · PIN_MASS 1
BOLAS (masa · factor de velocidad · efecto permitido · usos):
  normal    6 · ×1.00 · sí · ∞
  pesada   10 · ×0.85 · sí · 3
  relampago 4 · ×1.20 · no (spin efectivo 0) · 3
AIM_Y_MIN 120 · AIM_Y_MAX 380 · AIM_Y_START 250 · AIM_Y_SPEED 160 px/s
SPIN_MIN -3 · SPIN_MAX 3 · SPIN_START 0 (un paso por pulsación, sin repetición automática)
HOOK_ACCEL 120 px/s² por unidad de spin (aceleración lateral, + = hacia abajo en pantalla)
OIL_END por frame: [330, 360, 300, 340, 380, 310, 350, 300, 370, 320]
  el frame 10 usa OIL_END[9] = 320 para sus 3 bolas
POWER_PERIOD 1200 ms · POWER_MIN_SPEED 360 px/s · POWER_MAX_SPEED 760 px/s
  velocidad = (POWER_MIN_SPEED + power·(POWER_MAX_SPEED − POWER_MIN_SPEED)) × factor de la bola
POWER_TIMEOUT 4000 ms (vuelve a `aim`, sin gastar bola ni uso)
JITTER_DEG 0.4 (ruido uniforme ±0.4° al soltar)
BALL_DRAG 20 px/s² · BALL_STOP_SPEED 25 px/s
RESTITUTION_BALL_PIN 0.8 · RESTITUTION_PIN_PIN 0.7 · PIN_DAMP 1.5 /s
PIN_FALL_DIST 14 px
PHYS_STEP 1000/120 ms · PHYS_STEPS_MAX 6 · DT_MAX 50 ms
SETTLE_QUIET 600 ms · SETTLE_MAX 6000 ms · SWEEP_MS 700
BONUS_STRIKE_CURVO 25 · BONUS_SPARE_CURVO 10 · CURVO_MIN_SPIN 2
FRAMES 10
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

`GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`, `KeyD`,
`KeyC`, `Space`. `preventDefault()` solo para esas. Listeners `keydown` / `keyup` / `blur` sobre
el canvas, nunca sobre `window`. `P` y `Escape` no llegan al motor. `blur` vacía `keys`.

La velocidad máxima posible es `760 × 1.20 = 912 px/s`: a 120 Hz son 7.6 px por paso, menor que
`BALL_R + PIN_R = 22`, así que no hay túnel.

Comprobación: `npm run build` limpio con el motor aún sin registrar.

### 2. Reglas de frame y puntuación

Idénticas a la variante 01, repetidas aquí para que la spec sea autosuficiente:

- Tras cada bola se cuentan los pinos nuevos derribados y se guardan en
  `frames[frameIdx].rolls` junto con el `spin` efectivo con el que se lanzó.
- Frames 1–9: strike cierra el frame con una bola; si no, segunda bola con los pinos en pie.
  Frame 10: dos bolas siempre, tercera solo si hubo strike en la 1 o spare en la 2; tras un
  strike o spare en el décimo se recolocan los 10 pinos. Entre frames 1–9 se recolocan siempre.
- `phase = "gameover"` al cerrar el frame 10: `stopLoop()` y `onGameOver(score)` una sola vez.

Puntuación oficial: frame normal = pinos; spare = 10 + pinos de la tirada siguiente; strike = 10
+ pinos de las dos siguientes; frame 10 = suma de sus 2–3 tiradas. `officialScore` es la suma de
los frames resueltos con los strikes/spares provisionales ya contados a 10 (nunca decrece).

**Bonus curvo (nuevo en esta variante):** se concede al cerrar la bola, una sola vez por
tirada, y se suma a `bonusScore`:

```
strike en la bola 1 del frame (o en cualquier strike del décimo) con |spin| ≥ 2 → +25
spare en la bola 2 con |spin| ≥ 2                                                → +10
(el spin se lee de la tirada que remata el strike/spare; el efecto de la bola
relámpago cuenta como 0, así que nunca da bonus)
```

`score = officialScore + bonusScore`. Máximo teórico: 300 + 12 × 25 = **600**. Mínimo: 0.
Cada bonus muestra `STRIKE CURVO +25` o `SPARE CURVO +10` en el canvas durante el barrido.

Comprobación: función interna de puntuación probada a mano con cuatro planillas — 12 strikes con
spin 3 (600), 12 strikes con spin 0 (300), 5/ ×10 + 5 con spin 2 en las segundas bolas
(150 + 10 × 10 = 250) y todo canaletas (0) — con `console.assert` temporal que se retira antes
de cerrar el paso.

### 3. Física, pista aceitada y efecto

Integración con paso fijo de `PHYS_STEP`, mismo esquema que la variante 01: `dt` capado a
`DT_MAX`, acumulado en `physAccum`, hasta `PHYS_STEPS_MAX` pasos por frame.

- **Bola:** sale de `(90, aimY)` con velocidad `v` solo en el eje x (ángulo 0°) más el ruido de
  `JITTER_DEG`. `BALL_DRAG` la frena; por debajo de `BALL_STOP_SPEED` queda `done`.
- **Efecto:** mientras `ball.x < OIL_END[frameIdx]` la bola va recta (zona aceitada). Cuando
  `ball.x ≥ OIL_END[frameIdx]` y no está en canaleta, cada paso suma
  `vy += spinEfectivo · HOOK_ACCEL · PHYS_STEP/1000`. El efecto **gira** la trayectoria; la bola
  conserva su `vx`, no «recupera» el eje.
- **Canaleta:** si el centro de la bola sale de `y 100..400` antes de tocar ningún pino se fija
  en `y = 80` o `y = 420`, `vy = 0`, `gutter = true`, y no colisiona con pinos. Con efecto fuerte
  esto pasa si se sale del carril *después* de la zona aceitada.
- **Choques:** bola vs pino y pino vs pino con impulso elástico, masa de la bola según `kind`
  (6, 10 o 4), `RESTITUTION_BALL_PIN` y `RESTITUTION_PIN_PIN`, y separación posicional.
- **Pinos:** paredes en `y = 100` y `y = 400` (40 % de pérdida), foso en `x > 740` cuenta como
  derribado, `PIN_DAMP`, derribado = desplazado más de `PIN_FALL_DIST` de su casilla; un pino
  derribado deja de colisionar y no se levanta dentro de la misma bola.
- `settling` y recuento: igual que la variante 01 (`SETTLE_QUIET`, `SETTLE_MAX`).

Reglas deducidas del diseño de pista: con `spin = 0` la bola es idéntica a la de la variante 01
a ángulo 0°; la bola `PESADA` curva igual que la normal pero con menos velocidad lateral por su
mayor masa de impulso (los pinos salen más dispersos); la `RELÁMPAGO` no curva nunca, pero llega
antes y con más energía de colisión por velocidad (aunque tiene poca masa).

Comprobación: tiro con `spin = +3` desde `aimY = 140` y `OIL_END = 300` cruza hacia el centro
de los pinos (entra por el eje de la fila 0); el mismo `spin` con `aimY = 380` se va a la
canaleta inferior; `spin = 0` es una recta.

### 4. Fases, bolas y entrada

- **`aim`:** ↑/↓ o W/S mueven `aimY` (velocidad `AIM_Y_SPEED`); ←/→ o A/D cambian `spin` un paso
  por pulsación entre −3 y +3; `C` cambia de bola en el orden `normal → pesada → relampago` (se
  salta una bola sin usos). `Space` pasa a `power`.
- **`power`:** la barra oscila con periodo `POWER_PERIOD`; `Space` fija `power`, resta un uso a
  la bola si no es `normal`, aplica el ruido y pasa a `rolling`. Tras `POWER_TIMEOUT` vuelve a
  `aim` sin gastar uso. Las demás teclas se ignoran en esta fase.
- **`rolling`/`settling`:** sin entrada del jugador.
- **`sweep`:** `SWEEP_MS` ms de barrido; muestra `STRIKE!` / `SPARE!` y, si procede, el bonus
  (cada etiqueta 900 ms). Después `phase = "aim"`, conservando `aimY`, `spin` y `kind`. Si la
  bola elegida se ha quedado sin usos pasa automáticamente a `normal`.
- `Space` mantenido no relanza: se exige `keyup` entre `aim → power` y `power → rolling`.
- El `spin` se conserva entre tiros (es el último valor elegido); un `spin` distinto de 0 con la
  bola `relampago` se dibuja tachado y se aplica como 0.

Comprobación: `npm run build` limpio; en pantalla el cambio de bola y los usos restantes se
actualizan al lanzar.

### 5. Dibujo y avisos a la plataforma

- `emit()` con `lastScore` / `lastLives` / `lastLevel`: `onLives(1)` **una vez**,
  `onLevel(frameIdx + 1)` al cambiar de frame, `onScore(score)` (oficial + bonus) al cambiar.
- `draw()` sin asignar arrays/objetos dentro (SPEC 13). Todo lo de la variante 01 (carril,
  pinos, bola, marcador, barra de potencia) más:
  - **zona aceitada:** rectángulo semitransparente con brillo desde la línea de falta hasta
    `x = OIL_END[frameIdx]`, con una raya clara en el borde; se dibuja **antes** de cada tiro
    para que el jugador la lea;
  - **indicador de efecto:** flecha curva (3 segmentos) desde la bola que muestra el sentido y la
    fuerza de `spin`, solo en `aim`/`power`;
  - **panel de bolas:** 3 casillas (`NORMAL ∞`, `PESADA 3`, `RELÁMPAGO 3`), la elegida
    resaltada, las agotadas atenuadas.
- El marcador y el panel son estado propio del juego (como el siguiente tetromino de Tetris): no
  duplican el HUD, que es dueño del total (oficial + bonus), del frame y de las vidas.
- Sin overlay de game over en el canvas. Etiqueta `PULSA ESPACIO` solo hasta el primer tiro.
- `pause()` / `resume()` / `restart()` / `destroy()` como en la variante 01: `restart()` devuelve
  los usos a 3/3, `spin` a 0, `kind` a `normal`, bonus a 0.

Comprobación: `npm run lint` y `npm run build` limpios; partida completa hasta el modal.

### 6. Catálogo: nueva ficha `bolos`

`lib/games.ts`, nueva entrada en `GAMES` (mismo `id`, `cat` y `cover` que la variante 01; copy
propio de esta variante):

```ts
{
  id: "bolos",
  title: "BOLOS",
  short: "Lee la pista, mete efecto y rompe el triángulo.",
  long: "La pista está aceitada y cada frame cambia dónde acaba el aceite. Lanza con efecto para curvar la bola hacia los pinos, elige entre la pesada y la relámpago y cobra bonus por cada strike curvo. Cuanto más arriesgas, más sumas.",
  cat: "ARCADE",
  cover: "cover-bolos",
  color: "cyan",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: `.cover-bolos` nueva, compartida con la variante 01 si se implementan ambas.

Comprobación: `/juegos/bolos` muestra la ficha con su portada antes de registrar el motor.

### 7. Registrar el motor

`lib/games/registry.ts`:

```ts
bolos: {
  create: createBolosGame,
  width: 800,
  height: 600,
  controls: "↑/↓ colocar la bola, ←/→ efecto, C cambiar de bola, espacio para fijar potencia y tirar",
  touch: { a: { code: "Space", label: "TIRAR" }, b: { code: "KeyC", label: "BOLA" } },
},
```

Comprobación: `/jugar/bolos` pinta el canvas real; el mando táctil tiene cruceta, `TIRAR` y `BOLA`.

### 8. Leaderboard

`supabase/migrations/<timestamp>_juego_bolos.sql`, con timestamp posterior a
`20260927130000`:

```sql
insert into public.games (id, title) values ('bolos', 'BOLOS');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. Los tipos no se
regeneran. Se usa **un único `game_id`** para ambas variantes: si se promueven las dos, la
segunda no inserta otra fila (ver «Decisiones»).

Comprobación: `select * from public.games` incluye la fila `bolos`.

### 9. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido manual
de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/bolos` muestra un canvas de 800×600 con pista, 10 pinos, bola, marcador de 10
      casillas, zona aceitada brillante y panel de 3 bolas, no la `.game-arena`.
- [ ] El HUD muestra 1 vida y `FRAME 01`; el juego no avanza hasta pulsar espacio.
- [ ] No existe control de ángulo: la bola siempre sale a 0° (con solo el ruido de ±0.4°).
- [ ] ←/→ (A/D) cambian el efecto en pasos de 1 entre −3 y +3 sin repetición automática, y el
      indicador de curva refleja el sentido y la fuerza.
- [ ] Con `spin = 0` la trayectoria es recta; con `spin = +3` desde `y 140` la bola entra por el
      centro de los pinos con `OIL_END = 300`; con `spin = +3` desde `y 380` acaba en la
      canaleta inferior.
- [ ] La bola va recta hasta `x = OIL_END[frame]` y solo curva a partir de ahí (se verifica en el
      frame 1, `OIL_END = 330`, y en el frame 3, `OIL_END = 300`: la curva empieza en sitios
      distintos).
- [ ] La zona aceitada dibujada coincide con `OIL_END` del frame actual y cambia al pasar de
      frame.
- [ ] `C` cambia de bola en el orden normal → pesada → relámpago y salta las agotadas.
- [ ] Lanzar con `PESADA` o `RELÁMPAGO` resta un uso del panel; con `NORMAL` no. A los 3 usos la
      bola se atenúa y deja de ser elegible.
- [ ] La `RELÁMPAGO` ignora el efecto aunque el indicador marque curva y llega más rápido que
      la normal a igual potencia.
- [ ] Si la bola elegida se agota durante la partida, la siguiente tirada vuelve a `NORMAL`.
- [ ] Un segundo espacio lanza con la velocidad de la barra en ese instante; sin él, a los 4 s
      vuelve a apuntar sin gastar bola ni uso.
- [ ] Un strike con `|spin| ≥ 2` suma 25 al `score` y muestra `STRIKE CURVO +25`; con `|spin| ≤ 1`
      o con `RELÁMPAGO` no hay bonus.
- [ ] Un spare con `|spin| ≥ 2` en la segunda bola suma 10 y muestra `SPARE CURVO +10`.
- [ ] Partida de 12 strikes con efecto 3 (forzada en una sesión de depuración, nunca en el
      código) termina con `score` 600; con efecto 0, 300; con todo canaletas, 0.
- [ ] El `score` del HUD no decrece nunca y es la suma del acumulado oficial del marcador más el
      bonus.
- [ ] Cada frame 1–9 con strike cierra con una bola; el frame 10 da tercera bola solo con strike
      o spare y recoloca los 10 pinos.
- [ ] El HUD pasa de `FRAME 01` a `FRAME 10`; cierra el frame 10 y se abre el modal
      `FIN DEL JUEGO` con la puntuación real.
- [ ] El canvas dibuja marcas por tirada, acumulado por frame y panel de bolas, pero no la
      puntuación total ni las vidas.
- [ ] `PAUSA` congela el juego en cualquier fase (incluida con la bola curvando) y `REANUDAR`
      continúa sin saltos; `P` y `Escape` hacen lo mismo.
- [ ] Con el canvas enfocado, flechas, WASD, `C` y espacio no hacen scroll; escribir esas teclas
      en el campo de iniciales no mueve, no cambia de bola ni lanza.
- [ ] `JUGAR DE NUEVO` reinicia a frame 1, 0 puntos, `spin 0`, bola `NORMAL`, usos 3/3 y bonus 0
      sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'bolos'`; aparece en
      `/salon?juego=bolos` y en `/juegos/bolos` sin recargar a mano; pulsarlo dos veces no
      inserta dos filas.
- [ ] Con `scores` vacía para este juego, `/salon?juego=bolos` muestra el estado vacío.
- [ ] En móvil en vertical el mando mueve la bola (↑/↓), cambia el efecto (←/→), `BOLA` cambia
      de bola y `TIRAR` hace las dos pulsaciones de espacio.
- [ ] Navegar de `/jugar/bolos` a `/biblioteca` y volver no duplica el bucle; dejar la pestaña
      en segundo plano no hace que la bola atraviese pinos.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid`, `/jugar/snake` y `/jugar/frogger`
      se juegan igual que antes.
- [ ] `select * from public.games` incluye una fila `bolos` además de las ya existentes.
- [ ] `lib/games.ts` mantiene sin tocar las fichas de los demás juegos.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/bolos`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** misma carpeta/`id` `bolos` que la variante 01. Son dos diseños del mismo juego; solo
  una de las dos se promueve a `lib/games/bolos/engine.ts`.
- **Sí:** sustituir el ángulo por **efecto**. Con ángulo y efecto a la vez, el espacio de tiro
  (posición × ángulo × curva) es demasiado grande para un teclado y un único botón táctil.
- **Sí:** `spin` en pasos enteros −3..+3 sin repetición. Un efecto continuo con teclas obliga a
  mantener pulsado y falla en táctil; los pasos son reproducibles y se pueden razonar.
- **Sí:** la zona aceitada decide dónde empieza la curva, y cambia cada frame. Obliga a releer
  la pista y evita una «jugada ganadora» fija, sin añadir otra fuente de azar.
- **Sí:** tres bolas con usos limitados. Introduce gestión de recursos sin tienda ni progresión
  entre partidas.
- **Sí:** `RELÁMPAGO` sin efecto. Es la apuesta de potencia frente a la de curva, y evita que la
  bola más rápida sea también la más versátil.
- **Sí:** bonus curvo del +25 / +10 con `|spin| ≥ 2`. Premia el riesgo real, porque con efecto
  fuerte la bola se sale más a la canaleta; con efecto 1 el bonus no compensaría.
- **Sí:** máximo oficial 300 intacto, y el bonus se suma aparte (`bonusScore`). La planilla del
  marcador sigue siendo la oficial; el bonus aparece en el HUD y como etiqueta.
- **Sí:** un único `id` y un único `game_id` en `scores`. Mezclar puntuaciones de las dos
  variantes en el ranking solo sería un problema si ambas coexistiesen, y la spec exige elegir
  una; si hiciera falta convivir, es otra spec con otro `id`.
- **Sí:** `onLives(1)` una vez y `onLevel(frame)`, igual que la variante 01.
- **No:** ángulo libre (es la variante 01), obstáculos móviles ni pinos especiales.
- **No:** sonido ni sembrar puntuaciones.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El efecto + la zona aceitada hacen que el 90 % de los tiros se vayan a la canaleta y el juego frustre. | `HOOK_ACCEL 120` y `OIL_END` entre 300 y 380 se fijan para que `spin ±1` corrija unos 25–40 px; el criterio exige al menos un tiro de efecto 3 que acierte y otro que falle según la posición. |
| La combinación `PESADA` + efecto fuerte + frame con `OIL_END` bajo es dominante y vuelve irrelevante a la `NORMAL`. | `PESADA` baja la velocidad a ×0.85 y solo tiene 3 usos; el bonus no depende de la bola, así que no hay incentivo por usarla siempre. |
| El bonus curvo se lleva el peso de la puntuación y distorsiona el ranking respecto al bowling real. | El máximo de bonus es 300 (12 × 25) frente a 300 oficiales; está documentado en «Decisiones» y se puede reducir sin tocar reglas porque `bonusScore` va separado. |
| Mostrar `score` provisional más bonus puede confundirse con el acumulado del marcador. | El marcador solo dibuja el acumulado oficial; el HUD suma el bonus y cada bonus sale como etiqueta en el momento. |
| Túnel: la bola relámpago a 912 px/s atraviesa un pino en un paso. | Paso fijo de 1/120 s → 7.6 px por paso, menor que `BALL_R + PIN_R = 22`; `DT_MAX` y `PHYS_STEPS_MAX` acotan el trabajo al volver de una pestaña oculta. |
| El jugador no entiende dónde empieza la curva. | La zona aceitada se dibuja antes del tiro y su borde es el punto exacto de `OIL_END`; verificación visual con los frames 1 y 3 en los criterios. |
| El `spin` conservado entre tiros hace que, al cambiar a `RELÁMPAGO`, parezca que se aplica un efecto que no se aplica. | El indicador se dibuja tachado con esa bola y el motor aplica `spinEfectivo = 0`. |
| Sin código de referencia, las constantes se ajustan «a ojo» al implementar. | Los pasos 1–4 las fijan y las declaran fuera de cambio, como Snake (SPEC 10). |
| `restart()` deja usos, `spin` o bonus de la partida anterior. | `initGame()` reinicia `uses`, `spin`, `kind`, `bonusScore` y `officialScore`; criterio de aceptación de `JUGAR DE NUEVO`. |

---

## Lo que **no** entra en esta spec

- Ángulo de lanzamiento libre (variante 01).
- Selección de pista, modos de torneo o frames elegidos por el jugador.
- Más bolas, tienda o mejoras entre partidas.
- Obstáculos móviles o pinos especiales.
- Sonido.
- Dos jugadores o partida por equipos.
- Skins (`clasico`/`neon`/`retro`).
- Una categoría nueva en `CATS`.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.
- Rate limiting, antitrampas y validación de la puntuación en servidor.

Cada una de ellas, si entra, va en su propia spec.
