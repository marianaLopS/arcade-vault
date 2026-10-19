# SPEC — PINBALL: mesa de misiones

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-19
> **Objetivo:** Diseñar una variante de pinball con objetivos encadenados — tres blancos
> abatibles, una rampa que lleva a un modo multibola y un empujón (`nudge`) limitado con
> penalización `TILT` — sobre la misma mesa física que `01-mesa-clasica.md`, como ficha
> `pinball` en categoría ARCADE con leaderboard en Supabase.

---

## Por qué existe esta spec

La variante 01 es el pinball mínimo: la habilidad es sólo mantener la bola viva. El pinball que
engancha desde los años 90 añade **reglas encima de la física**: objetivos que se completan en
orden, un modo especial que se gana y se pierde, y la tentación de golpear la máquina. Esta
variante es esa lectura, con el mismo mundo, la misma bola y los mismos controles base — lo que
cambia es qué se persigue y qué se arriesga.

Comparte con la 01 todo lo que es física (gravedad, restituciones, flippers, muelle) para que,
si el usuario elige esta, la implementación reutilice el mismo núcleo. Pero **no es la 01 con
extras pegados**: aquí la puntuación sale principalmente de las misiones y del multibola, los
bumpers pasan a ser secundarios, y el empujón introduce una decisión de riesgo que la otra
variante no tiene.

Como la 01, **no hay código de referencia**: las constantes son el diseño. El motor dibuja con
primitivas de canvas, sin assets.

---

## Alcance

**Dentro:**

- `lib/games/pinball/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createPinballGame`, sin assets externos.
- Mundo lógico **600×800**; física idéntica a la variante 01 (paso fijo 4 ms, gravedad 900,
  `BALL_R` 9, flippers de 78 px) — se repiten las constantes en el paso 1 para que la spec sea
  autosuficiente.
- Tres bumpers (50 puntos, secundarios), dos slingshots y dos carriles de retorno.
- **Tres blancos abatibles** (`drop targets`) en la zona alta-izquierda: al derribar los tres se
  completa la misión 1 y se reinician.
- **Rampa** en la zona alta-derecha: la bola que la sube sale por el carril de retorno derecho
  y puntúa; completa la misión 2 tras 3 subidas.
- **Misiones encadenadas**: `BLANCOS` → `RAMPA` → `MULTIBOLA`. Cada una desbloquea la siguiente;
  la tercera lanza el modo multibola.
- **Multibola**: al activarse, dos bolas extra entran en juego (3 simultáneas) durante hasta
  25 s; cada bola drenada durante el modo no resta vida. El modo acaba al quedar una sola bola
  o al agotarse el tiempo.
- **Empujón** (`nudge`): `ShiftLeft`/`ShiftRight` o `KeyN` desplazan la bola con un impulso; al
  tercer empujón en 6 s se activa `TILT`: flippers inertes hasta que la bola actual drene.
- Tres bolas por partida; fin al drenar la última.
- Nueva ficha `pinball` y clase `cover-pinball`; línea en `GAME_ENGINES`; migración
  `insert into public.games (id, title) values ('pinball', 'PINBALL')`.

**Fuera de alcance:**

- La mesa clásica sin misiones (es la variante 01).
- Más de una mesa, rampas con segundo nivel visual, modos adicionales.
- Sonido, skins, controles táctiles más allá de los declarados.
- Bola extra por puntos.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla, columna ni tipo de plataforma.** `scores` y `game_stats` sirven sin
tocarlas.

Tipos locales del motor, sin exportar:

```ts
type Vec = { x: number; y: number };
type Ball = { x: number; y: number; vx: number; vy: number; id: number };
type Seg = { a: Vec; b: Vec };
type Flipper = { pivot: Vec; length: number; angle: number; omega: number; side: "L" | "R" };
type Bumper = { x: number; y: number; r: number; flash: number };
type DropTarget = { x: number; y: number; w: number; h: number; down: boolean };
type Mission = "blancos" | "rampa" | "multibola";
type Phase = "plunger" | "playing" | "drained" | "gameover";
```

Estado en la clausura de `createPinballGame`:

- `balls: Ball[]` (1 normalmente, hasta 3 en multibola), `phase`, `plungerCharge`, `plungerHeld`.
- `flippers`, `bumpers`, `targets: DropTarget[]` (3), `rampHits` (0..3).
- `mission: Mission`, `missionsDone` (contador para el nivel del HUD), `multiballTimer` (ms).
- `nudgeTimes: number[]` (marcas de tiempo de los últimos empujones), `tilted` (bool).
- `score`, `ballsLeft`, `drainTimer`.
- Bucle: `rafId`, `lastTime`, `accum`, `destroyed`. Entrada: `keys: Set<string>`.

---

## Plan de implementación

### 1. Constantes de física y mesa (compartidas con la variante 01)

`lib/games/pinball/engine.ts`, primera parte:

```
W 600 · H 800 · BALL_R 9 · GRAVITY 900 px/s²
STEP_MS 4 · SUBSTEPS_MAX 12 · DT_MAX 50 · VMAX 1400
RESTITUTION_WALL 0.55 · RESTITUTION_BUMPER 1.15
BALLS_START 3 · BALL_START (570,720)
FLIPPER_LEN 78 · pivotes (190,720) y (400,720) · reposo +30° / 150° · activo -25° / 205°
FLIPPER_OMEGA_UP 22 rad/s · FLIPPER_OMEGA_DOWN 9 rad/s
PLUNGER_CHARGE_MS 1200 · LAUNCH_VY -700 … -1250 · DRAIN_PAUSE_MS 900
```

Las paredes, el arco superior, el carril del muelle y las rampas de drenaje son las de la
variante 01 (paso 1 de esa spec), con **un cambio**: el carril superior de dos huecos se
sustituye por la rampa del paso 3.

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Comprobación: `npm run build` limpio; la bola de prueba rebota sin atravesar paredes.

### 2. Flippers y colisiones

Idénticos a la variante 01: el flipper aporta `omega × r` a la velocidad relativa de contacto,
teclas `ArrowLeft`/`KeyZ`/`KeyA` y `ArrowRight`/`Slash`/`KeyD`. Con `tilted === true` ambos
flippers quedan en reposo y no responden a las teclas.

Con varias bolas, cada una se integra y colisiona de forma independiente en cada subpaso;
no hay colisión bola-bola (decisión de diseño, ver Decisiones).

Comprobación: con dos bolas de prueba, ambas rebotan en los flippers sin interferirse.

### 3. Bumpers, blancos y rampa

Constantes:

```
BUMPER_R 22 · posiciones (330,330), (430,390), (300,430) · POINTS_BUMPER 50
SLINGSHOTS como en la variante 01 · POINTS_SLING 10
BLANCOS: 3 rectángulos 14×36 px en x=70, y=300 / 350 / 400 (zona izquierda)
  derribo: una bola que los toca los baja (down = true) y rebota con restitución 0.4
  POINTS_TARGET 250 por blanco · POINTS_TARGETS_ALL 2000 al derribar los tres
RAMPA: entrada en (480,260)→(540,200), salida por el carril de retorno derecho (x=540, y=420)
  la bola que cruza la entrada se «teletransporta» a la salida con la misma rapidez y dirección
  hacia abajo (vy = +400), tras 350 ms de espera invisible
  POINTS_RAMP 500 por subida · RAMP_HITS_GOAL 3
```

- Con `mission = "blancos"` los tres blancos están activos. Al caer el tercero:
  `+POINTS_TARGETS_ALL`, `mission = "rampa"`, `missionsDone++`, y los blancos se reinician tras
  1,5 s para poder repetirse.
- Con `mission = "rampa"`, cada subida suma `POINTS_RAMP` y `rampHits++`; al llegar a
  `RAMP_HITS_GOAL`: `mission = "multibola"`.
- Con `mission = "multibola"` y la bola en juego, se dispara el paso 4 automáticamente.
- Fuera de su misión, los blancos y la rampa siguen puntuando (250 y 500) pero no avanzan la
  cadena.

Comprobación: `npm run build` limpio; derribar los tres blancos de prueba cambia la misión
activa a `rampa`.

### 4. Multibola

Constantes:

```
MULTIBALL_BALLS 3 (la bola original + 2 extras)
MULTIBALL_MS 25000 · MULTIBALL_SPAWN: extras entran por el centro (300,200) con vx ±150
POINTS_MULTIBALL_START 3000 · MULTIBALL_MULT 2 (todo puntúa doble mientras dura)
```

- Al activarse: `+POINTS_MULTIBALL_START`, se añaden 2 bolas extra, `multiballTimer =
  MULTIBALL_MS`, y la misión vuelve a `blancos` (el ciclo es repetible).
- Una bola que drena durante el modo se elimina de `balls` **sin** restar `ballsLeft`.
- El modo termina cuando queda una sola bola en juego o cuando `multiballTimer <= 0`; a partir
  de entonces las bolas extra restantes se retiran suavemente (drenan sin penalización) y la
  puntuación vuelve a x1.
- Si la última bola en juego drena mientras `multiballTimer > 0` y sólo quedaba esa, se resta
  una bola normal.

Comprobación: `npm run build` limpio; el modo lanza tres bolas, puntúa doble y termina al
quedar una.

### 5. Empujón y TILT

Constantes:

```
NUDGE_IMPULSE 180 px/s sobre la bola más cercana al centro, en la dirección de la tecla
  (ShiftLeft/KeyN → izquierda · ShiftRight → derecha)
NUDGE_COOLDOWN_MS 250 · TILT_LIMIT 3 empujones dentro de TILT_WINDOW_MS 6000
```

- Cada empujón válido (respetando el cooldown) registra `performance.now()` en `nudgeTimes`,
  descarta marcas más viejas que `TILT_WINDOW_MS` y, si quedan `TILT_LIMIT`, activa `tilted`.
- `tilted` apaga flippers y bumpers (los bumpers dejan de puntuar) hasta que **todas** las bolas
  en juego drenen; en `phase = "plunger"` se reinicia `tilted = false`.
- El HUD no puede mostrar `TILT`; el canvas dibuja el rótulo `TILT` (estado propio del juego,
  permitido igual que `PULSA ESPACIO`).

Comprobación: `npm run build` limpio; tres empujones en menos de 6 s dejan los flippers inertes.

### 6. Puntuación y avisos

- `score` acumula bumpers, slingshots, blancos, rampa y multibola, ya multiplicados por
  `MULTIBALL_MULT` mientras corre el modo.
- Bonus de drenaje de la última bola de la ronda: `500 × missionsDone`.
- `emit()` con `lastScore` / `lastLives` / `lastLevel`. `onLevel(missionsDone + 1)` refleja el
  progreso de misiones en el HUD. `onLives(ballsLeft)` al iniciar y al drenar.
- `onGameOver(score)` una sola vez, tras detener el bucle.

Comprobación: `npm run build` limpio; el nivel del HUD sube al completar cada misión.

### 7. Bucle, entrada, dibujo y ficha

- Bucle de paso fijo idéntico a la variante 01 (acumulador, `SUBSTEPS_MAX`, `DT_MAX`,
  `lastTime = null` al reanudar).
- `draw()`: mesa, bumpers, blancos (derribados en gris), rampa resaltada según la misión
  activa, barra de carga del muelle, indicador de misión actual (texto corto
  `BLANCOS`/`RAMPA`/`MULTIBOLA` en el borde superior, estado propio del juego), barra de tiempo
  del multibola. Sin puntos ni vidas dibujados.
- `GAME_KEYS`: `ArrowLeft`, `ArrowRight`, `KeyZ`, `KeyA`, `KeyD`, `Slash`, `Space`, `ShiftLeft`,
  `ShiftRight`, `KeyN`. `preventDefault()` solo para esas.
- Listeners `keydown` / `keyup` / `blur` sobre el canvas, nunca sobre `window`.
- `restart()` y `destroy()` como en la variante 01, además de limpiar misiones, blancos,
  multibola y `nudgeTimes`.

`lib/games.ts`: ficha `pinball` con `short: "Completa misiones y desata el multibola."`,
`cat: "ARCADE"`, `cover: "cover-pinball"`, `color: "cyan"`, `best: 0`, `plays: "0"`.
`.cover-pinball` en `app/globals.css`.

`lib/games/registry.ts`:

```ts
pinball: {
  create: createPinballGame,
  width: 600,
  height: 800,
  controls: "flechas o Z y / para los flippers, espacio para el muelle, mayúsculas o N para empujar",
  touch: { left: { code: "ArrowLeft", label: "◀" }, right: { code: "ArrowRight", label: "▶" }, a: { code: "Space", label: "MUELLE" } },
},
```

Comprobación: `/jugar/pinball` pinta el canvas real.

### 8. Leaderboard

`supabase/migrations/<timestamp>_juego_pinball.sql`:

```sql
insert into public.games (id, title) values ('pinball', 'PINBALL');
```

Se aplica con `apply_migration` y se comprueba con `execute_sql`; los tipos no se regeneran.

Comprobación: `select * from public.games` incluye la fila `pinball`.

### 9. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido
manual de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/pinball` muestra un canvas de 600×800 con bumpers, tres blancos, rampa y flippers,
      no la `.game-arena`.
- [ ] La partida empieza con la bola en el muelle, 3 bolas en el HUD y nivel 01.
- [ ] El muelle carga manteniendo `Space` y la fuerza de salida depende de la carga.
- [ ] Derribar los tres blancos suma 250 por blanco + 2000 y cambia la misión visible a `RAMPA`.
- [ ] Los blancos se reinician ~1,5 s después de completarse.
- [ ] Subir la rampa tres veces con la misión `RAMPA` activa dispara el multibola.
- [ ] Al activarse el multibola hay tres bolas en pantalla y todo puntúa doble.
- [ ] Una bola que drena durante el multibola no resta una bola del HUD.
- [ ] El multibola termina al quedar una sola bola o a los 25 s, y la puntuación vuelve a x1.
- [ ] Tras el multibola la misión vuelve a `BLANCOS` y el ciclo puede repetirse.
- [ ] Fuera de su misión, blancos y rampa puntúan pero no avanzan la cadena.
- [ ] Dos empujones seguidos mueven la bola sin penalización; el tercero en 6 s activa `TILT`.
- [ ] Con `TILT` los flippers no responden y los bumpers no puntúan hasta que drenan las bolas.
- [ ] `TILT` se limpia al volver a `phase = "plunger"`.
- [ ] Drenar la última bola abre `FIN DEL JUEGO` con la puntuación real.
- [ ] El canvas no dibuja puntos, bolas restantes ni overlay de game over; sólo `TILT`,
      `PULSA ESPACIO` y el indicador de misión.
- [ ] La bola nunca atraviesa paredes, flippers ni blancos, con una o tres bolas.
- [ ] `PAUSA` y `P`/`Escape` congelan física, temporizador de multibola y ventana de `TILT`
      sin que ninguno salte al reanudar.
- [ ] Con el canvas enfocado, flechas, espacio y mayúsculas no hacen scroll ni abren nada del
      navegador.
- [ ] Escribir en el campo de iniciales no empuja ni mueve flippers.
- [ ] `JUGAR DE NUEVO` reinicia puntuación, misiones, blancos y bolas sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'pinball'`, y no inserta
      dos pulsando dos veces seguidas.
- [ ] Esa puntuación aparece en `/salon?juego=pinball` y en `/juegos/pinball` sin recargar a
      mano; con `scores` vacía se ve el estado vacío.
- [ ] Navegar fuera y volver no duplica el bucle; la pestaña en segundo plano no teletransporta
      ninguna bola.
- [ ] Los demás juegos con motor se juegan igual que antes y sus fichas no cambian.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/pinball`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** misiones lineales y cíclicas (`BLANCOS` → `RAMPA` → `MULTIBOLA` → `BLANCOS`). Un solo
  objetivo visible a la vez mantiene legible la mesa en un canvas de 600×800.
- **Sí:** multibola con puntuación x2. Es el momento de riesgo/recompensa del género; sin
  multiplicador el modo sería sólo caos.
- **Sí:** las bolas extra drenan sin penalización. Penalizarlas castigaría justo el modo que se
  pretende premiar.
- **No:** colisión bola-bola. Triplica el coste de física y produce atascos difíciles de
  depurar; con rebotes independientes el modo sigue siendo espectacular.
- **Sí:** empujón limitado con `TILT` a 3 en 6 s. Da una salida desesperada útil y un coste real
  si se abusa; es la decisión que más separa esta variante de la 01.
- **Sí:** `TILT` dura hasta que drenen todas las bolas. Un castigo por tiempo se confundiría con
  un fallo del motor.
- **Sí:** bumpers a 50 puntos, subordinados a las misiones. La mesa premia completar objetivos,
  no sólo golpear cosas.
- **Sí:** la rampa teletransporta la bola a la salida tras 350 ms. Evita modelar un segundo
  nivel de geometría sin perder la lectura de «subí y bajé».
- **Sí:** `onLevel` refleja misiones completadas. Reutiliza el HUD existente sin ampliar el
  contrato.
- **No:** sonido, skins ni sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Tres bolas simultáneas multiplican el coste de física y pueden caer el framerate. | Bolas independientes sin colisión mutua; `SUBSTEPS_MAX` 12; se verifica el multibola con el medidor de FPS de la plataforma. |
| La rampa «teletransporte» deja una bola invisible si la partida se pausa durante los 350 ms. | La espera cuenta en pasos de física, no en reloj de pared; pausa y reanudación la respetan. |
| El jugador ignora las misiones y juega como la variante 01, haciendo irrelevante la capa extra. | El multibola y el bonus de drenaje por misiones pesan más que cualquier cadena de bumpers (3000 + x2 frente a 50 por golpe). |
| `TILT` por un empujón accidental frustra a jugadores nuevos. | Tecla separada de los flippers, cooldown de 250 ms y tope de 3 antes de penalizar. |
| Mezclar temporizadores (multibola, ventana de tilt) con pausa hace que avancen durante `PAUSA`. | Todos corren sobre `dt` del bucle, que no avanza en pausa; criterio de aceptación específico. |
| Sin referencia, las constantes se ajustan «a ojo» durante la implementación. | Los pasos 1-5 las fijan y las declaran fuera de cambio, como Snake (SPEC 10). |

---

## Lo que **no** entra en esta spec

- La mesa clásica sin misiones (variante `01-mesa-clasica.md`).
- Colisión bola-bola.
- Varias mesas o modos adicionales.
- Sonido y skins.
- Controles táctiles más allá de los declarados (no incluyen el empujón).
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.
- Rate limiting, antitrampas y validación de la puntuación en servidor.

Cada una de ellas, si entra, va en su propia spec.
