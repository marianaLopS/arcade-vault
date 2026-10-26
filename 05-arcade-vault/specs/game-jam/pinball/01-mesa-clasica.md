# SPEC — PINBALL: mesa clásica

> **Estado:** Propuesta (game jam). No entra en la numeración `specs/NN-*.md` del repo hasta que
> el usuario elija una variante y la promueva con `/spec` o la skill `nuevo-juego`.
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-05
> **Objetivo:** Diseñar `pinball` como una sola mesa vertical de pinball clásico — muelle,
> dos flippers, tres bumpers, dos slingshots, banco de dianas y calles superiores — con física
> propia de círculo contra segmentos y tres bolas por partida, sobre el contrato `GameEngine`.

---

## Por qué existe esta spec

El catálogo tiene reflejos de paleta (Arkanoid), de giro (Snake) y de salto (Frogger), pero
ningún juego cuya gracia sea **física de rebote continua y propulsión del jugador sobre un
objeto en movimiento**. Pinball es el género arcade icónico que falta: la bola nunca se
detiene, el jugador no la controla directamente sino que le «pega», y la habilidad está en
leer trayectorias. Esa sensación necesita un motor de física propio (colisiones círculo contra
segmentos y círculos, con flippers que transfieren velocidad), que es exactamente lo que ni
Arkanoid (rebote en ejes alineados) ni Asteroids (sin gravedad ni paredes) tienen.

Esta es la **variante 01**: el pinball mínimo y reconocible, una mesa fija sin modos ni misiones.
La variante `02-multibola-misiones.md` comparte con ésta el género, el mundo lógico de 540×720,
la geometría base de la mesa (paredes, carril del muelle, arco superior, flippers, slingshots),
el modelo de física y los controles; cambia el eje de diseño (misiones, bloqueo de bolas,
multibola, empujón con TILT). Nada de lo compartido cambia entre variantes.

Como Snake (SPEC 10), no hay código de referencia: ninguna carpeta `References/.../pinball`
existe. Las constantes de esta spec **son** el diseño, y el paso 2 las fija con la misma regla
que los ports: cambiarlas durante la implementación es rediseñar, no implementar.

La plataforma no se toca: `GameEngineEntry` (con `touch`) existe desde las SPEC 08 y 11, y el
leaderboard se enciende con una fila en `games`.

---

## Alcance

**Dentro:**

- `lib/games/pinball/engine.ts`: motor nuevo con todo el estado en la clausura de
  `createPinballGame`. Si la geometría crece, `lib/games/pinball/table.ts` con datos puros
  (segmentos y círculos) sin estado.
- Mundo lógico 540×720. Mesa jugable `x 20..490`; carril del muelle `x 490..520`.
- Una bola en juego, tres bolas por partida (`onLives` = bolas restantes incluida la actual).
- Muelle con carga mantenida; dos flippers; tres bumpers; dos slingshots; banco de tres dianas
  caídas; tres calles superiores con multiplicador.
- Física con paso fijo de 1/240 s, círculo contra segmentos, círculos y cápsulas (flippers).
- Bola extra única al llegar a 50 000 puntos.
- Tope de puntuación a 999 999 (la tabla `scores` rechaza más de 1 000 000).
- `public/`: ningún asset. Todo se dibuja con trazos y rellenos de canvas.
- Una línea `pinball` en `GAME_ENGINES`, con `touch`.
- `lib/games.ts`: ficha nueva `pinball`, `cat: "ARCADE"`, `cover: "cover-pinball"`, `color: "magenta"`.
- `app/globals.css`: clase `cover-pinball`.
- Migración `insert into public.games (id, title) values ('pinball', 'PINBALL')`.

**Fuera de alcance (para specs futuras):**

- Sonido.
- Misiones, multibola, bloqueo de bolas y empujón (TILT): son la variante 02.
- Skins (`skins: true`): el motor usa una paleta fija neón.
- Mesas alternativas o selección de mesa.
- Múltiples jugadores por turnos.
- Rampas, spinners, imanes, bola de otro tamaño o cualquier cosa que necesite más de un plano.
- Controles de inclinación por acelerómetro.
- Cambiar `best` o `plays` de otras fichas.

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni tipo de plataforma nuevo.** `scores` y `game_stats`
sirven a este juego sin tocarlas. El motor solo emite el contrato `GameCallbacks`: la
plataforma guarda la puntuación final con `game_id = 'pinball'` al pulsar
`GUARDAR PUNTUACIÓN`.

Tipos locales del motor, sin exportar:

```ts
type Vec = { x: number; y: number };
type Seg = { a: Vec; b: Vec; e: number }; // pared de grosor 0; e = restitución
type Disc = { c: Vec; r: number };        // bumper o sensor
type Flipper = {
  pivot: Vec; len: number; rest: number; up: number; // ángulos en rad, y hacia abajo
  angle: number; omega: number; pressed: boolean; side: "L" | "R";
};
type Target = { x: number; y: number; w: number; h: number; down: boolean };
type Phase = "plunger" | "playing" | "drained" | "gameover";
```

Estado en la clausura de `createPinballGame`:

- `ball: { p: Vec; v: Vec }`, `phase: Phase`, `charge` (0..1, carga del muelle), `chargeMs`.
- `flippers: [Flipper, Flipper]`, `targets: Target[3]`, `lanes: boolean[3]` (calles encendidas),
  `litLane` (índice de calle que rota con los flippers).
- `score`, `ballsLeft`, `level`, `banks` (bancos de dianas completados), `mult` (1..4),
  `extraGiven` (bool), `flash: Map<id, ms>` (destellos de bumpers/dianas).
- `drainMs` (pausa tras perder bola), `stuckMs` (reloj anti-atasco).
- Bucle: `rafId`, `lastTime`, `acc` (acumulador de física), `destroyed`.

---

## Plan de implementación

### 1. Geometría de la mesa (datos puros)

Todas las coordenadas en el mundo 540×720, `y` hacia abajo. La mesa es simétrica respecto a
`x = 255`: el espejo de `x` es `510 - x`.

```
PAREDES (restitución e entre paréntesis)
  arco superior   centro (270, 270) radio 250, 16 segmentos desde (20,270) por arriba
                  hasta (520,270)                                               (0.45)
  pared izquierda (20,270) → (20,585)                                           (0.45)
  guía del carril (490,282) → (490,700)                                          (0.45)
  pared carril    (520,270) → (520,700)                                          (0.45)
  suelo del muelle (490,688) → (520,688)                                         (0.00)
  rampa izq.      (20,585) → (135,634)                                           (0.30)
  rampa der.      (490,585) → (375,634)                                          (0.30)
SLINGSHOTS (cara de patada; patada 480 px/s a lo largo de la normal, 10 puntos)
  izq.  (70,500) → (115,570)        der. (440,500) → (395,570)
BUMPERS (discos, radio 22; patada 520 px/s a lo largo de la normal, 100 puntos)
  B1 (170,230)   B2 (340,230)   B3 (255,320)
DIANAS CAÍDAS (rectángulos 40×10, centros en y = 150)
  T1 x=195   T2 x=255   T3 x=315
CALLES SUPERIORES (sensores, radio 14, en y = 90)
  L1 x=190   L2 x=255   L3 x=320
FLIPPERS
  izq. pivote (145,640), der. pivote (365,640)
  longitud 80, cápsula de radio 8
  reposo +30° (punta hacia abajo y hacia el centro), activo −25°
  ángulos del flipper derecho espejados (180° − ángulo)
DRENAJE  bola perdida cuando ball.p.y > 735
```

El hueco entre puntas de flipper en reposo es ≈ 81 px, mayor que el diámetro de la bola (18 px):
la bola puede drenar por el centro y por ningún otro sitio. El carril entre la pared izquierda y
la slingshot izquierda (≈ 50 px) desemboca en la rampa y de ahí al flipper.

Comprobación: `npm run build` limpio; un volcado de los segmentos pintado en el canvas
reproduce la silueta descrita y es simétrico respecto a `x = 255` (salvo carril y arco).

### 2. Motor: constantes y física

`lib/games/pinball/engine.ts`. Constantes de diseño:

```
W 540 · H 720 · BALL_R 9
STEP 1/240 s · DT_MAX 50 ms (como mucho 12 pasos por frame)
GRAVITY 1000 px/s² (+40 por nivel, tope 1200)  · V_MAX 1500 px/s
REST_WALL 0.45 · REST_RAMP 0.30 · REST_FLIPPER 0.40
FLIPPER_SWING 80 ms de reposo a activo · FLIPPER_RETURN 120 ms de activo a reposo
  omega_up = (55° en rad) / 0.080 s ≈ 12.0 rad/s · omega_down ≈ 8.0 rad/s
PLUNGER_START (505, 679) · CHARGE_MS 900
  launch_speed = 1100 + 350 * charge  px/s, hacia arriba (v.y negativo)
BUMPER_KICK 520 · SLING_KICK 480 px/s
PTS_BUMPER 100 · PTS_SLING 10 · PTS_TARGET 500 · PTS_BANK 2000 · PTS_LANE 50
MULT_MAX 4 · EXTRA_BALL_AT 50000 · SCORE_CAP 999999
BALLS_START 3 · DRAIN_PAUSE 900 ms
STUCK_SPEED 5 px/s · STUCK_MS 3000 · STUCK_KICK 250 px/s
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Bucle de física: `acc += min(dt, DT_MAX)`; mientras `acc ≥ STEP` se ejecuta un paso:

1. Flippers: `angle` se acerca al ángulo objetivo (activo si `pressed`, reposo si no) a
   `omega_up` / `omega_down` y se guarda `omega` (rad/s con signo, 0 si ya llegó al tope).
2. Bola: `v.y += GRAVITY * STEP`; `p += v * STEP`; `|v|` se recorta a `V_MAX`. A `V_MAX` la bola
   recorre 6.25 px por paso, menos que su radio: no atraviesa paredes.
3. Colisión contra cada segmento (paredes, rampas, slingshots): punto más cercano al centro; si
   la distancia es menor que `BALL_R`, se saca la bola por la normal y, si `v·n < 0`, se
   refleja: `v ← v − (1 + e)(v·n)n`. Las slingshots, además, imponen `v·n ≥ SLING_KICK`.
4. Colisión contra bumpers: igual con la normal centro-bola; `v·n ≥ BUMPER_KICK` tras el rebote.
5. Colisión contra flippers (cápsula): punto más cercano de la bola al eje del flipper; la
   velocidad de la superficie en ese punto es `omega × r` (r desde el pivote). Se resuelve la
   velocidad relativa `v_rel = v − v_superficie`; si `v_rel·n < 0`,
   `v_rel ← v_rel − (1 + REST_FLIPPER)(v_rel·n)n` y `v ← v_rel + v_superficie`. Así un flipper en
   movimiento lanza la bola y uno quieto la deja rodar.
6. Dianas: rectángulo contra círculo; golpe → `down = true`, `+PTS_TARGET * mult`, rebote como
   pared con `e = 0.45`. Una diana caída no colisiona.
7. Calles: si el centro de la bola entra en un sensor (cruce de fuera a dentro), esa calle se
   enciende y suma `PTS_LANE * mult`.

Reglas de juego:

- **Muelle (`phase = "plunger"`):** la bola reposa en `PLUNGER_START`. Mientras se mantiene
  `Space` o `ArrowDown`, `chargeMs` sube hasta `CHARGE_MS`; al soltar, `charge = chargeMs /
  CHARGE_MS` y la bola sale con `launch_speed`. Un toque corto lanza con 1100 px/s, que alcanza
  `y ≈ 85`: suficiente para llegar al arco.
- **Banco de dianas:** al caer las tres, `+PTS_BANK * mult`, `banks++`, las dianas se levantan
  y `level = 1 + banks`. El nivel sube la gravedad (+40 por nivel, tope 1200).
- **Calles:** `ArrowLeft`/`KeyZ` y `ArrowRight`/`KeyX` rotan las calles encendidas una posición
  a izquierda/derecha (solo si hay alguna encendida pero no todas), como en el pinball clásico.
  Al encender las tres: `mult = min(MULT_MAX, mult + 1)`, +`PTS_BANK / 2` y las calles se apagan.
- **Multiplicador:** `×mult` a bumpers, dianas, banco y calles; nunca a slingshots. Se conserva
  al perder la bola y vuelve a 1 solo en `restart()`.
- **Bola extra:** al cruzar `EXTRA_BALL_AT` por primera vez, `ballsLeft++` (una vez por partida).
- **Drenaje:** `ball.p.y > 735` → `phase = "drained"` durante `DRAIN_PAUSE`; después
  `ballsLeft--`; si queda alguna bola, `phase = "plunger"` y bola nueva; si no, game over.
- **Anti-atasco:** si `|v| < STUCK_SPEED` durante `STUCK_MS` fuera de `plunger`, se aplica un
  impulso `STUCK_KICK` hacia arriba con una componente `x` aleatoria entre −80 y +80 px/s.
- **Tope:** `score = min(score, SCORE_CAP)` tras cada suma.

Comprobación: `npm run build` limpio.

### 3. Motor: bucle, entrada y dibujo

- `emit()` con `lastScore` / `lastLives` / `lastLevel`: avisa solo si cambia el valor.
  `onLives(ballsLeft)` al empezar y en cada cambio; `onLevel(level)` al subir de nivel.
- `draw()`: fondo negro, paredes y rampas en cian tenue, bumpers como discos magenta que se
  ensanchan 4 px y se aclaran durante 120 ms al golpearse, slingshots amarillas, dianas
  verdes (apagadas en gris oscuro cuando están caídas), calles como círculos que se rellenan al
  encenderse, flippers como cápsulas blancas, bola blanca con halo. En `plunger` se dibuja el
  muelle comprimido proporcional a `charge` y el rótulo `MANTÉN ESPACIO Y SUELTA` dentro del
  canvas, porque es estado propio del juego.
- Sin puntuación, bolas, nivel ni overlays de game over en el canvas.
- Game over: `stopLoop()` y `onGameOver(score)` una sola vez. `resume()` es no-op después.
- `restart()`: detiene el bucle, `initGame()` (bolas 3, `mult` 1, dianas arriba), `emit()`,
  arranca.
- `dt` capado a `DT_MAX`; `lastTime = null` y `acc = 0` al reanudar.
- `GAME_KEYS`: `ArrowLeft`, `ArrowRight`, `ArrowDown`, `KeyZ`, `KeyX`, `Slash`, `Space`.
  `preventDefault()` solo para esas. Izquierda: `ArrowLeft` o `KeyZ`. Derecha: `ArrowRight`,
  `KeyX` o `Slash`. Muelle: `Space` o `ArrowDown`.
- Los flippers siguen el estado de la tecla (keydown/keyup), no un evento puntual. El `blur`
  del canvas suelta todas las teclas (flippers bajan, muelle se dispara si estaba cargado).
- Listeners `keydown` / `keyup` / `blur` sobre el canvas, nunca sobre `window`. `P` y `Escape`
  no llegan.
- `destroy()` cancela el frame, quita los listeners y es idempotente.
- `initGame(); draw();` antes de devolver.

Comprobación: `npm run build` limpio.

### 4. Registrar la ficha y la portada

`lib/games/registry.ts`:

```
pinball: {
  create: createPinballGame, width: 540, height: 720,
  controls: "flechas izquierda y derecha o Z y X para los flippers, espacio o flecha abajo para lanzar la bola",
  touch: { a: { code: "KeyX", label: "DER" }, b: { code: "KeyZ", label: "IZQ" } },
}
```

La cruceta táctil envía `ArrowDown` (lanzar) y las flechas laterales (flippers), así que el
mando táctil tiene los tres controles sin botón extra. `repeat` no se activa: los flippers
necesitan mantener pulsado, no repetir pulsaciones.

`lib/games.ts`: ficha nueva `pinball` (`title: "PINBALL"`, `cat: "ARCADE"`,
`cover: "cover-pinball"`, `color: "magenta"`, `best` y `plays` de mock coherentes con las demás
fichas) y `.cover-pinball` en `app/globals.css` (bola y dos flippers sobre bumpers, mismo tamaño
que las otras portadas).

Comprobación: `/jugar/pinball` pinta el canvas real; `/biblioteca` muestra la ficha.

### 5. Leaderboard

`supabase/migrations/<timestamp>_juego_pinball.sql`, con timestamp posterior a la última
migración existente:

```sql
insert into public.games (id, title) values ('pinball', 'PINBALL');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. Los tipos no se
regeneran. El motor garantiza `score ≤ 999 999`, que es el límite del `check` de `scores`.

Comprobación: `select * from public.games` incluye `pinball`.

### 6. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos y recorrido manual
de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/pinball` muestra un canvas de 540×720 con la mesa descrita, no la `.game-arena`.
- [ ] La bola empieza en el carril del muelle y no se mueve hasta soltar `Espacio`/`↓`.
- [ ] Mantener `Espacio` comprime visiblemente el muelle durante 900 ms; un toque corto lleva
      la bola al arco superior y la deja caer a la mesa.
- [ ] Un lanzamiento a carga máxima (≥ 900 ms) sale más rápido que uno corto.
- [ ] `←`/`Z` levanta solo el flipper izquierdo y `→`/`X`/`/` solo el derecho, en menos de 100 ms.
- [ ] Un flipper en movimiento lanza la bola claramente más fuerte que uno quieto.
- [ ] Una bola que rueda sobre un flipper quieto no lo atraviesa.
- [ ] Golpear un bumper suma `100 × multiplicador` y el bumper se ensancha un instante.
- [ ] Golpear una slingshot suma 10 y empuja la bola; nunca la multiplica.
- [ ] Derribar las tres dianas suma 3 × 500 más 2 000 de banco, las levanta y sube el nivel a 02.
- [ ] Encender las tres calles sube el multiplicador una unidad y las apaga; tope ×4.
- [ ] Las flechas laterales rotan las calles encendidas cuando hay alguna pero no todas.
- [ ] El HUD muestra 3 bolas al inicio; perder una deja 2 y reaparece el muelle tras una pausa.
- [ ] Al cruzar 50 000 puntos el HUD pasa de N a N+1 bolas, una sola vez por partida.
- [ ] La puntuación nunca supera 999 999.
- [ ] Perder la tercera bola abre el modal `FIN DEL JUEGO` con la puntuación real.
- [ ] El canvas no dibuja puntos, bolas ni nivel, ni ningún overlay de game over.
- [ ] La bola no atraviesa ninguna pared a velocidad máxima (ni al salir del muelle a carga plena).
- [ ] Dejar la bola quieta en una concavidad la libera en ≤ 3.5 s.
- [ ] `PAUSA` congela bola y flippers y `REANUDAR` continúa sin salto de posición; `P` y `Escape`
      hacen lo mismo.
- [ ] Con el canvas enfocado, las flechas y el espacio no hacen scroll de la página.
- [ ] Escribir `Z`, `X`, `/` o espacio en el campo de iniciales no mueve flippers ni reinicia.
- [ ] `JUGAR DE NUEVO` reinicia a nivel 1, 0 puntos, 3 bolas, multiplicador 1 sin recargar.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'pinball'` y no inserta
      dos al pulsar dos veces.
- [ ] Esa puntuación aparece en `/salon?juego=pinball` y en `/juegos/pinball` sin recargar a mano.
- [ ] Con `scores` vacía para este juego, `/salon?juego=pinball` muestra el estado vacío.
- [ ] En el móvil, la cruceta (↓ lanza, ← y → flippers) y los botones `IZQ` / `DER` juegan la partida.
- [ ] Navegar de `/jugar/pinball` a `/biblioteca` y volver no duplica el bucle.
- [ ] Pestaña en segundo plano y vuelta no dispara más de 12 pasos de física en un frame.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid`, `/jugar/snake` y `/jugar/frogger`
      se juegan igual que antes.
- [ ] `select * from public.games` incluye `pinball` y ninguna fila previa cambia.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/pinball`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** mundo 540×720, vertical. Es la proporción natural de una mesa; el CSS solo estira el
  píxel, la física no cambia.
- **Sí:** física propia y paso fijo de 1/240 s. Con paso variable, la misma jugada daría
  resultados distintos según los fps y el rebote en flippers sería irreproducible.
- **Sí:** flippers como cápsulas con velocidad de superficie. Es lo que hace que un flipper en
  movimiento «pegue» y uno quieto no.
- **Sí:** el carril del muelle comparte la guía con la mesa, sin puerta unidireccional. Una bola
  que vuelve a caer en el carril regresa al muelle y se relanza: no se pierde. Más simple y sin
  casos de bola atrapada.
- **No:** puerta unidireccional. Añadiría un segmento con regla de colisión por dirección para
  evitar un caso que ya está cubierto.
- **Sí:** tres bolas y una bola extra única. Da el arco clásico de partida sin hacerla infinita.
- **Sí:** multiplicador que persiste entre bolas. Premia aguantar la partida.
- **No:** multiplicar slingshots. Son una fuente de puntos de ruido; multiplicarlas inflaría la
  puntuación sin mérito.
- **Sí:** anti-atasco con impulso aleatorio pequeño. Una bola en equilibrio perfecto sobre un
  borde es imposible de resolver para el jugador.
- **Sí:** `cat: "ARCADE"`. `Cat` solo admite ARCADE, PUZZLE, SHOOTER y VERSUS y no se amplía aquí.
- **No:** skins. Costaría una paleta por skin y no cambia el diseño del juego.
- **No:** sonido. No hay assets de audio.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo                                                                          | Mitigación                                                                                          |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Túnel: la bola atraviesa un flipper en movimiento o una pared fina.             | Paso de 1/240 s y `V_MAX` 1500 (6.25 px por paso < radio 9); flipper como cápsula de radio 8.       |
| Bola atrapada entre flipper y rampa, vibrando sin salir.                        | La rampa y el flipper dejan hueco de reposo; anti-atasco a los 3 s con impulso hacia arriba.        |
| Sin original, la sensación se ajusta «a ojo» durante la implementación.         | El paso 2 fija las constantes y las declara fuera de alcance; los criterios son jugables.           |
| Los flippers se sienten lentos o regalan la bola.                               | `FLIPPER_SWING` 80 ms y velocidad de superficie en la colisión; se verifica con el criterio de 100 ms. |
| Un lanzamiento corto cae de vuelta al carril y desespera.                       | El mínimo 1100 px/s alcanza `y ≈ 85`; una bola que vuelve al carril se relanza sin coste.            |
| Puntuación por encima de 1 000 000 rompe el `check` de `scores` y el guardado.  | `SCORE_CAP` 999 999 aplicado tras cada suma.                                                        |
| Tecla de flipper pegada si el canvas pierde foco con la tecla pulsada.          | El `blur` del canvas libera todas las teclas.                                                       |
| Pestaña en segundo plano: el acumulador dispara cientos de pasos al volver.     | `dt` capado a 50 ms, `acc = 0` y `lastTime = null` al reanudar; máximo 12 pasos por frame.          |
| Espacio/flechas de la mesa llegan al campo de iniciales.                        | Bucle parado con el modal abierto y listeners en el canvas, no en `window`.                         |
| El mando táctil no puede mantener dos flippers y el muelle a la vez.            | Cruceta y dos botones son controles independientes; se verifica con dos pulgares.                   |

---

## Lo que **no** entra en esta spec

- Sonido.
- Misiones, multibola, bloqueo de bolas y empujón con TILT (variante 02).
- Skins.
- Mesas alternativas, rampas, spinners, imanes o partida multijugador.
- Acelerómetro.
- Rediseñar otras fichas o tocar `best` / `plays` de juegos existentes.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
