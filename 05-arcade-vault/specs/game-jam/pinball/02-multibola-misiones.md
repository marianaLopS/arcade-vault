# SPEC — PINBALL: multibola y misiones

> **Estado:** Propuesta (game jam). No entra en la numeración `specs/NN-*.md` del repo hasta que
> el usuario elija una variante y la promueva con `/spec` o la skill `nuevo-juego`.
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-05
> **Objetivo:** Diseñar `pinball` como una mesa con objetivos encadenados — misiones con
> cronómetro, un pozo que bloquea bolas y dispara una multibola con jackpot, bonus de fin de
> bola con multiplicador, protector de bola y empujón con TILT — sobre la misma geometría base
> y la misma física que la variante clásica.

---

## Por qué existe esta spec

Segunda variante de `pinball`, junto a `specs/game-jam/pinball/01-mesa-clasica.md`. Comparte
con ella el género, el mundo lógico de 540×720, la geometría base (arco superior, paredes,
carril del muelle, rampas, slingshots, flippers), el modelo de física de paso fijo de 1/240 s
con círculo contra segmentos y cápsulas, y los controles de flippers y muelle. Nada de eso
cambia entre variantes.

La variante 01 es un pinball de **puntuación continua**: no hay metas, solo acumular. Esta
cambia el eje de diseño a **objetivos con estado**. Una misión activa pide una hazaña concreta
dentro de un tiempo límite; el pozo bloquea bolas y a la tercera suelta una multibola con un
jackpot; al perder la bola se cobra un bonus que depende de lo bien que se jugó; el jugador puede
empujar la mesa, a costa de arriesgar un TILT que inutiliza los flippers. Es el arco de tensión
de un pinball de los 90 reducido a lo que cabe en un solo canvas.

Quita de la mesa lo que la 01 tenía y esta no necesita: el banco de dianas caídas, las tres
calles superiores y el tercer bumper. Pone en su lugar cuatro dianas laterales, un pozo de
bloqueo y un segundo conjunto de reglas. No es la misma spec con otras palabras: cambia la
geometría variable, el número de bolas simultáneas (hasta 3), la fuente de progresión (misiones
en vez de bancos) y el sistema de penalización (TILT).

Como Snake (SPEC 10) y la variante 01, no hay código de referencia. Las constantes de esta spec
son el diseño, y cambiarlas durante la implementación es rediseñar.

---

## Alcance

**Dentro:**

- `lib/games/pinball/engine.ts`: **el mismo archivo** que implementaría la variante 01; esta
  spec describe una implementación alternativa completa, no un parche. Si se promueve ésta,
  es este documento el que gobierna el archivo. `lib/games/pinball/table.ts` opcional con datos
  puros.
- Mundo lógico 540×720, mesa `x 20..490`, carril del muelle `x 490..520`, paredes, rampas,
  slingshots, flippers y arco **idénticos** a la variante 01.
- Geometría variable propia: dos bumpers, un pozo de bloqueo y cuatro dianas laterales.
- Hasta **3 bolas simultáneas** en mesa; sin colisión entre bolas (se atraviesan).
- Tres bolas por partida (`onLives` = bolas restantes incluida la actual).
- Cuatro misiones con cronómetro que rotan en orden.
- Bloqueo de hasta 2 bolas y multibola al tercer bloqueo, con jackpot único.
- Bonus de fin de bola con multiplicador `×1..×5`.
- Protector de bola (8 s tras cada lanzamiento) y bola extra por logro.
- Empujón (`ArrowUp`, `KeyA`, `KeyD`) y TILT.
- Tope de puntuación 999 999.
- Una línea `pinball` en `GAME_ENGINES`, con `touch`.
- `lib/games.ts`: ficha nueva `pinball` (`cat: "ARCADE"`, `cover: "cover-pinball"`,
  `color: "magenta"`); clase `cover-pinball` en `app/globals.css`.
- Migración `insert into public.games (id, title) values ('pinball', 'PINBALL')`.

**Fuera de alcance (para specs futuras):**

- Sonido.
- Colisión entre bolas.
- Skins.
- Más de una mesa, rampas, spinners, imanes o cualquier elemento de varios planos.
- Modo de dos jugadores por turnos.
- Misiones encadenadas o con varias fases; las cuatro de esta spec son atómicas.
- Persistencia de misiones o progreso entre partidas.
- Acelerómetro como empujón.

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni tipo de plataforma nuevo.** `scores` y `game_stats`
sirven a este juego sin tocarlas. El motor solo emite el contrato `GameCallbacks`.

Tipos locales del motor, sin exportar:

```ts
type Vec = { x: number; y: number };
type Ball = { p: Vec; v: Vec; saverMs: number };           // una por bola en mesa
type MissionId = "bumpers" | "dianas" | "pozo" | "slings";
type Phase = "plunger" | "playing" | "drained" | "gameover";
type Saucer = { holding: boolean; holdMs: number; queued: number }; // bolas por soltar
```

Estado en la clausura de `createPinballGame`:

- `balls: Ball[]` (0..3), `phase`, `charge`, `chargeMs` (muelle como en 01).
- `flippers[2]` (mismos campos que en 01), `tilted` (bool), `tiltMeter` (0..4, decimal),
  `nudgeCooldown` (ms).
- `locked` (0..2 bolas bloqueadas virtualmente), `multiball` (bool), `jackpotDone` (bool),
  `saucer`.
- `mission: { id, progress, target, remainMs } | null`, `missionGapMs`, `missionIndex`
  (0..3 cíclico), `missionsDone`.
- `targetsLit: boolean[4]` (dianas A..D, para el multiplicador de bonus), `missionHit:
  boolean[4]` (para la misión `dianas`).
- `bonusPts`, `bonusMult` (1..5), `extraGiven`.
- `score`, `ballsLeft`, `level` (= `1 + missionsDone`), `flash: Map<id, ms>`.
- Bucle: `rafId`, `lastTime`, `acc`, `destroyed`.

---

## Plan de implementación

### 1. Geometría de la mesa (datos puros)

Coordenadas en el mundo 540×720, `y` hacia abajo, espejo de `x` = `510 - x`.

**Compartido con la variante 01, sin cambios:**

```
arco superior   centro (270,270) radio 250, 16 segmentos (20,270) → (520,270)     e 0.45
pared izq.      (20,270) → (20,585)                                                e 0.45
guía carril     (490,282) → (490,700)         pared carril (520,270) → (520,700)  e 0.45
suelo muelle    (490,688) → (520,688)                                              e 0.00
rampa izq.      (20,585) → (135,634)          rampa der.   (490,585) → (375,634)  e 0.30
slingshots      izq. (70,500) → (115,570)     der. (440,500) → (395,570)
                patada 480 px/s a lo largo de la normal, 10 puntos
flippers        pivotes (145,640) y (365,640), longitud 80, cápsula de radio 8,
                reposo +30°, activo −25°
drenaje         bola perdida cuando ball.p.y > 735
```

**Propio de esta variante:**

```
BUMPERS (discos radio 22; patada 520 px/s; 100 puntos)
  B1 (170,250)    B2 (340,250)
POZO DE BLOQUEO  centro (255,190) radio de captura 14 (sensor, sin colisión)
  captura si la bola entra con |v| < 900 px/s y el pozo está libre
  retención 600 ms; expulsión a 500 px/s con ángulo aleatorio entre −100° y −80°
DIANAS LATERALES (segmentos de 40 px que cuentan impacto solo si ball.p.x < 490)
  A (20,330)→(20,370)   B (20,400)→(20,440)
  C (490,330)→(490,370) D (490,400)→(490,440)    restitución 0.45, 250 puntos
```

La regla `ball.p.x < 490` evita que una bola subiendo por el carril puntúe las dianas C y D desde
el otro lado de la guía. El pozo está justo debajo del arco, centrado: queda al alcance de un
disparo directo con flipper desde cualquier lado.

Comprobación: `npm run build` limpio; el volcado de los segmentos y sensores pintado en el
canvas reproduce la silueta y es simétrico en bumpers y dianas.

### 2. Motor: constantes y reglas

`lib/games/pinball/engine.ts`. Constantes de diseño, además de las físicas compartidas con 01
(`STEP 1/240 s`, `BALL_R 9`, `V_MAX 1500`, `GRAVITY 1000` + 40 por nivel con tope 1200,
`REST_WALL 0.45`, `REST_RAMP 0.30`, `REST_FLIPPER 0.40`, swing de flipper 80 ms / 120 ms,
muelle `1100 + 350 * charge` con `CHARGE_MS 900`, `DT_MAX 50 ms`):

```
BALLS_START 3 · MAX_BALLS 3 · DRAIN_PAUSE 900 ms
PTS_BUMPER 100 · PTS_SLING 10 · PTS_TARGET 250 · PTS_SAUCER 1000
PTS_LOCK 2500 · PTS_JACKPOT 10000 · SCORE_CAP 999999
BONUS_PER_BUMPER 50 · BONUS_PER_TARGET 250 · BONUS_PER_MISSION 1000
BONUS_MULT_MAX 5
SAVER_MS 8000 (por bola lanzada desde el muelle; una sola recolocación)
NUDGE_COOLDOWN 250 ms · NUDGE_IMPULSE 140 px/s (x: ±; y: hacia arriba con ArrowUp)
TILT_LIMIT 4 · TILT_WARN 3 · TILT_DECAY 1 por 1500 ms
MULTIBALL_GAP 600 ms entre bolas soltadas por el pozo
MISSION_GAP 3000 ms
MISSION_REWARD(n) = min(10000, 3000 + 1000 * n) con n = missionsDone antes de cobrar
EXTRA_BALL_MISSION 5 (una vez por partida)
STUCK_SPEED 5 px/s · STUCK_MS 3000 · STUCK_KICK 250 px/s
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Física por paso: igual que en 01, **por cada bola** de `balls`, contra paredes, rampas,
slingshots, bumpers, flippers y dianas laterales. Las bolas no interactúan entre sí. Los
flippers se actualizan una sola vez por paso, antes de las bolas. Con 3 bolas el coste por frame
son ≤ 36 pasos de colisión: sin asignaciones dentro del bucle.

**Misiones.** Una activa a la vez, que avanza solo en `phase = "playing"`. Rotan en este orden:

| `missionIndex` | Misión    | Objetivo                                                 | Tiempo |
| -------------- | --------- | -------------------------------------------------------- | ------ |
| 0              | `bumpers` | 10 impactos en bumpers                                   | 20 s   |
| 1              | `dianas`  | las cuatro dianas A, B, C y D al menos una vez           | 25 s   |
| 2              | `pozo`    | 2 capturas en el pozo                                    | 30 s   |
| 3              | `slings`  | 8 impactos en slingshots                                 | 15 s   |

- El `target` numérico de `bumpers`, `pozo` y `slings` sube en `floor(missionsDone / 4)` por
  cada vuelta completa al ciclo (la vuelta 2 pide 11 bumpers, 3 capturas, 9 slings).
- La primera misión arranca al primer lanzamiento de la primera bola. Tras un éxito o un
  agotamiento de tiempo, `missionGapMs = MISSION_GAP` y luego empieza la siguiente.
- Éxito: `score += MISSION_REWARD(missionsDone)`, `bonusPts += BONUS_PER_MISSION`,
  `missionsDone++`, `level = 1 + missionsDone`. Agotarse el tiempo no penaliza ni avanza el nivel.
- `missionIndex` avanza en ambos casos, así una misión imposible no se repite en bucle.
- Al perder la bola, el cronómetro se detiene hasta que reaparece la siguiente.
- Al completar la misión 5 (`missionsDone === EXTRA_BALL_MISSION`) y una sola vez: `ballsLeft++`.

**Pozo, bloqueo y multibola.**

- Una bola captura si entra en el sensor con el pozo libre y `|v| < 900`. Se retira de `balls`,
  `saucer.holding = true` y `holdMs = 600`; suma `PTS_SAUCER`.
- `locked < 2`: al terminar la retención no se expulsa. `locked++`, `score += PTS_LOCK`. La
  bola se considera bloqueada virtualmente y, si no queda ninguna bola en mesa, `phase =
  "plunger"` y sale una bola nueva sin gastar `ballsLeft`.
- Con `locked === 2` y una tercera captura arranca la **multibola**: `multiball = true`,
  `locked = 0`, `jackpotDone = false`, `saucer.queued = 2`. El pozo expulsa la bola capturada
  tras su retención y las otras dos a `MULTIBALL_GAP` de distancia cada una. Hay 3 bolas en mesa.
- Durante la multibola, la primera captura (`jackpotDone === false`) paga `PTS_JACKPOT` en vez
  de `PTS_SAUCER`, marca `jackpotDone = true` y expulsa a la bola tras la retención; las
  siguientes pagan `PTS_SAUCER`. Las capturas del pozo en multibola nunca bloquean.
- Una bola que se pierde con `multiball` activo no gasta `ballsLeft`. Cuando queda una sola
  bola en mesa, `multiball = false`.
- Capturas que cuentan para la misión `pozo`: todas, incluso bloqueos.

**Bonus y multiplicador.**

- `bonusPts += 50` por impacto en bumper, `+= 250` por impacto en diana lateral, `+= 1000` por
  misión cumplida.
- Cuando las cuatro dianas A..D han sido golpeadas (`targetsLit` todo `true`),
  `bonusMult = min(5, bonusMult + 1)` y `targetsLit` se apaga. Este sistema es independiente de
  la misión `dianas`: un mismo impacto actualiza ambos.
- Al perder la **última** bola en mesa (no en multibola, no por TILT): `score += bonusPts *
  bonusMult` y `bonusPts = 0`. `bonusMult` se conserva entre bolas y vuelve a 1 en `restart()`.

**Protector de bola.** Cada bola lanzada desde el muelle tiene `saverMs = SAVER_MS`. Mientras
`saverMs > 0` y la bola drena, vuelve al muelle con `phase = "plunger"` sin gastar bola, sin
bonus y con un nuevo `saverMs` solo la primera vez por bola lanzada (`saverMs` queda en 0 tras
usarse). No aplica en multibola ni con TILT.

**Empujón y TILT.**

- `ArrowUp` → `v.y -= NUDGE_IMPULSE`; `KeyA` → `v.x -= NUDGE_IMPULSE`; `KeyD` → `v.x +=
  NUDGE_IMPULSE`; aplicado a todas las bolas en mesa. Cada empujón suma `1` a `tiltMeter`.
- Con `NUDGE_COOLDOWN` activo los empujones se ignoran, no suman.
- `tiltMeter` baja `1` cada `TILT_DECAY` ms. A `TILT_WARN` el canvas rotula `¡CUIDADO!`.
- A `TILT_LIMIT`: `tilted = true`. Los flippers dejan de responder (bajan a reposo), los
  bumpers, slingshots y dianas dejan de puntuar, no hay bonus ni protector. `tilted` y
  `tiltMeter` se reinician al sacar la bola siguiente.
- El empujón no funciona en `plunger` ni en `drained`.

**Casos límite.**

- Bola que cae al pozo con el pozo ocupado: lo atraviesa como si no existiera.
- Bola perdida mientras `saucer.holding` o `saucer.queued > 0`: el pozo sigue su cuenta y
  completa sus expulsiones; la partida no termina hasta que no quede ninguna bola ni cola.
- Última bola perdida con `locked > 0`: las bolas bloqueadas se pierden, `locked = 0`.
- `ballsLeft` llega a 0 con `multiball` o `saucer.queued` pendientes: no ocurre, porque la
  multibola no gasta bola; si pasa en un estado inconsistente el game over lo dispara el
  drenaje de la última bola en mesa.
- Reiniciar durante `drained` o con el pozo reteniendo: `restart()` limpia `balls`, `saucer`,
  `mission`, `locked`, `tilted`.
- Puntuación: `score = min(score, SCORE_CAP)` tras cada suma.

Comprobación: `npm run build` limpio.

### 3. Motor: bucle, entrada y dibujo

- `emit()` con `lastScore` / `lastLives` / `lastLevel`. `onLives(ballsLeft)`, `onLevel(level)`.
  Los bloqueos y las bolas de multibola no cambian `onLives`.
- `draw()`: fondo negro, mesa en cian tenue, bumpers magenta con destello de 120 ms, dianas
  laterales amarillas (apagadas en gris oscuro una vez golpeadas, hasta completar el
  multiplicador), pozo como un círculo con un número de puntos dentro (`locked`), bolas
  blancas con halo, flippers blancos. Con la bola en el muelle: muelle comprimido y rótulo
  `MANTÉN ESPACIO Y SUELTA`.
- **Banner de misión dentro del canvas** (arriba de la mesa, `y ≈ 40`): nombre de la misión,
  progreso `n/target` y segundos restantes. Es estado propio del juego —la plataforma no
  tiene campo para él— y es la única información de estado que el canvas dibuja además de
  `¡CUIDADO!`, `TILT` y `MULTIBOLA`. No se dibujan puntos, bolas, nivel ni game over.
- `TILT` y `MULTIBOLA` aparecen como rótulos centrados 1.5 s.
- Game over: `stopLoop()` y `onGameOver(score)` una sola vez. `resume()` es no-op después.
- `restart()`: detiene el bucle, `initGame()`, `emit()`, arranca.
- `dt` capado a `DT_MAX`; `lastTime = null` y `acc = 0` al reanudar.
- `GAME_KEYS`: `ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`, `KeyZ`, `KeyX`, `Slash`,
  `KeyA`, `KeyD`, `Space`. `preventDefault()` solo para esas. Flipper izquierdo: `ArrowLeft` o
  `KeyZ`; derecho: `ArrowRight`, `KeyX` o `Slash`; muelle: `Space` o `ArrowDown`; empujón:
  `ArrowUp` (arriba), `KeyA` (izq.), `KeyD` (der.).
- Listeners `keydown` / `keyup` / `blur` sobre el canvas, nunca sobre `window`; `blur` libera
  teclas. `P` y `Escape` no llegan.
- `destroy()` cancela el frame, quita los listeners y es idempotente.
- `initGame(); draw();` antes de devolver.

Comprobación: `npm run build` limpio.

### 4. Registrar la ficha y la portada

`lib/games/registry.ts`:

```
pinball: {
  create: createPinballGame, width: 540, height: 720,
  controls: "flechas izquierda y derecha o Z y X para los flippers, espacio o flecha abajo para lanzar, flecha arriba o A y D para empujar la mesa",
  touch: { a: { code: "KeyX", label: "DER" }, b: { code: "KeyZ", label: "IZQ" } },
}
```

La cruceta táctil envía las cuatro flechas: `↓` lanza, `←`/`→` flippers y `↑` empuja arriba.
`A` y `D` de empujón lateral no tienen botón: es una pérdida aceptada de la versión móvil.
`repeat` no se activa.

`lib/games.ts`: ficha `pinball` con `title: "PINBALL"`, `cat: "ARCADE"`, `cover: "cover-pinball"`,
`color: "magenta"`; copy propio de esta variante (misiones y multibola). `.cover-pinball` en
`app/globals.css`.

Comprobación: `/jugar/pinball` pinta el canvas real; `/biblioteca` muestra la ficha.

### 5. Leaderboard

`supabase/migrations/<timestamp>_juego_pinball.sql`, con timestamp posterior a la última
migración existente:

```sql
insert into public.games (id, title) values ('pinball', 'PINBALL');
```

Se aplica con `apply_migration` y se comprueba con `execute_sql`. Los tipos no se regeneran. El
motor garantiza `score ≤ 999 999`, el límite del `check` de `scores`.

Comprobación: `select * from public.games` incluye `pinball`.

### 6. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos y recorrido manual
de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/pinball` muestra un canvas de 540×720 con dos bumpers, un pozo y cuatro dianas
      laterales, no la `.game-arena`.
- [ ] Muelle, flippers y paredes se comportan igual que en la mesa clásica (bola sin túnel a
      carga plena, flipper en movimiento lanza más fuerte que uno quieto).
- [ ] Al primer lanzamiento aparece el banner `BUMPERS 0/10` con 20 s de cuenta atrás.
- [ ] Cumplir la misión suma `3 000 + 1 000 × n` (tope 10 000), sube el nivel y arranca la
      siguiente tras 3 s.
- [ ] Agotar el tiempo no sube el nivel ni resta puntos, y la misión siguiente tampoco repite
      la fallida.
- [ ] La secuencia de misiones es bumpers, dianas, pozo, slings; en la vuelta 2 los objetivos
      numéricos suben una unidad.
- [ ] Las dianas C y D no puntúan con una bola que sube por el carril del muelle.
- [ ] Una bola que cae al pozo se retiene 600 ms y suma 1 000; una segunda bola que pasa por
      encima mientras tanto lo atraviesa.
- [ ] Los dos primeros bloqueos suman 2 500, dejan el HUD con las mismas bolas y sacan bola nueva
      al muelle sin gastar ninguna.
- [ ] El tercer bloqueo muestra `MULTIBOLA` y suelta 3 bolas separadas por 600 ms.
- [ ] El primer pozo en multibola suma 10 000; los siguientes, 1 000.
- [ ] Perder una bola en multibola no baja el contador de bolas; al quedar una, la multibola acaba.
- [ ] Al perder la última bola se cobra `bonusPts × multiplicador` y el contador se reinicia.
- [ ] Golpear las cuatro dianas laterales sube el multiplicador de bonus; tope ×5; se conserva
      entre bolas y vuelve a ×1 con `JUGAR DE NUEVO`.
- [ ] El protector devuelve al muelle una bola perdida antes de 8 s, una sola vez por bola.
- [ ] El protector no actúa en multibola ni tras un TILT.
- [ ] Empujar (`↑`, `A`, `D`) desplaza la bola; dos empujones dentro de 250 ms cuentan como uno.
- [ ] Al tercer empujón seguido aparece `¡CUIDADO!`; al cuarto, `TILT`: flippers inertes, sin
      puntos de bumpers/slings/dianas y sin bonus.
- [ ] El medidor de TILT baja con el tiempo (empujar una vez cada 3 s nunca provoca TILT).
- [ ] Cumplir la 5.ª misión suma una bola y solo ocurre una vez por partida.
- [ ] La puntuación nunca supera 999 999.
- [ ] El canvas no dibuja puntos, bolas ni nivel, ni overlay de game over; solo el banner de misión
      y los rótulos `¡CUIDADO!`, `TILT`, `MULTIBOLA` y la ayuda del muelle.
- [ ] Perder la última bola con bolas bloqueadas abre `FIN DEL JUEGO` con la puntuación real.
- [ ] `PAUSA` congela bolas, flippers, cronómetro de misión y cuenta del pozo; `REANUDAR`
      continúa sin saltos. `P` y `Escape` hacen lo mismo.
- [ ] Con el canvas enfocado, las flechas y el espacio no hacen scroll de la página.
- [ ] Escribir `A`, `D`, `Z`, `X`, `/` o espacio en el campo de iniciales no mueve ni reinicia.
- [ ] `JUGAR DE NUEVO` reinicia a nivel 1, 0 puntos, 3 bolas, multiplicador ×1, sin bloqueos ni
      misión previa.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'pinball'` y no inserta
      dos al pulsar dos veces.
- [ ] Esa puntuación aparece en `/salon?juego=pinball` y en `/juegos/pinball` sin recargar a mano.
- [ ] Con `scores` vacía para este juego, `/salon?juego=pinball` muestra el estado vacío.
- [ ] En móvil la cruceta (lanza, flippers, empujón arriba) y los botones `IZQ`/`DER` juegan.
- [ ] Con 3 bolas en mesa el juego se mantiene a 60 fps en el medidor `?fps=1`, sin asignaciones
      nuevas en `draw()`.
- [ ] Navegar de `/jugar/pinball` a `/biblioteca` y volver no duplica el bucle.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid`, `/jugar/snake` y `/jugar/frogger`
      se juegan igual que antes.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/pinball`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** misiones secuenciales, una a la vez. Deja el canvas legible y el objetivo del momento
  siempre claro; varias misiones simultáneas obligarían a un HUD que la plataforma no tiene.
- **Sí:** el banner de misión dentro del canvas. Es estado propio del juego, igual que el rótulo
  `PULSA UNA FLECHA` de Snake; `onLevel` solo expresa el número de misiones cumplidas.
- **Sí:** el nivel sube solo con misiones cumplidas, no con el tiempo. Falla sin penalizar.
- **Sí:** bloqueo virtual (la bola no vuelve a la mesa hasta la multibola). Evita simular un pozo
  que retiene físicamente varias bolas y sigue cabiendo en un solo canvas.
- **No:** colisión entre bolas. Añade resolución de contactos múltiples y casos de vibración
  para un efecto visual menor; las bolas se atraviesan.
- **Sí:** jackpot único por multibola. Un jackpot reutilizable convierte el pozo en una mina.
- **Sí:** bonus de fin de bola con multiplicador persistente. Premia jugar bien aunque se pierda
  la bola; es la fuente principal de puntos de partida larga.
- **Sí:** protector de 8 s. Una bola perdida en el primer segundo por un mal lanzamiento no
  debería costar una de tres.
- **Sí:** TILT inutiliza los flippers y anula el bonus, no termina la partida. Castiga sin
  frustrar.
- **Sí:** empujón por teclas y no por acelerómetro. Mantiene el contrato de teclado y el mando
  táctil sin código propio en el motor.
- **No:** skins ni sonido en esta spec.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo                                                                               | Mitigación                                                                                           |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Estado cruzado entre bloqueo, multibola, protector y TILT produce partidas inalcanzables. | Los casos límite de la sección 2 fijan la prioridad; criterios jugables cubren cada combinación.   |
| El pozo retiene una bola y la partida no termina al perder la última en mesa.         | `drain` evalúa `balls.length === 0 && !saucer.holding && saucer.queued === 0` antes del game over.   |
| Multibola con tres bolas multiplica el coste de física y baja los fps.                | Sin asignaciones por paso; tope `MAX_BALLS 3`; criterio con `?fps=1`.                                |
| Las dianas C y D puntúan desde el carril del muelle.                                  | Regla `ball.p.x < 490` en la colisión; criterio explícito.                                           |
| El empujón es explotable (spam sube la bola eternamente).                             | Cooldown 250 ms, medidor de TILT con límite 4 y TILT que anula flippers y puntos.                    |
| Una misión demasiado difícil o fácil rompe el ritmo y el jugador no la percibe.       | Las constantes de objetivo y tiempo son diseño; un fallo avanza al siguiente índice sin penalizar.   |
| Puntuación por encima de 1 000 000 rompe el `check` de `scores`.                      | `SCORE_CAP` 999 999 tras cada suma, incluido el bonus de fin de bola.                                |
| Las teclas `A`/`D` de empuje llegan al campo de iniciales.                            | Bucle parado con el modal abierto y listeners en el canvas, no en `window`.                          |
| En móvil falta empujón lateral y el TILT casi no se puede provocar.                   | Aceptado y documentado: `↑` cubre el caso principal; `A`/`D` son solo teclado.                       |
| Tecla de flipper pegada si el canvas pierde foco con la tecla pulsada.                | El `blur` del canvas libera todas las teclas.                                                        |

---

## Lo que **no** entra en esta spec

- Sonido.
- Colisión entre bolas.
- Skins.
- Mesas alternativas, rampas, spinners, imanes o dos jugadores por turnos.
- Misiones encadenadas o persistentes.
- Acelerómetro como empujón.
- Rediseñar otras fichas o tocar `best` / `plays` de juegos existentes.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
