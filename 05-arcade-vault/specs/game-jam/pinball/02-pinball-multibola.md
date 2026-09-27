# SPEC — PINBALL: modo multibola

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06, SPEC 08
> **Fecha:** 2026-09-27
> **Objetivo:** Definir la misma mesa vertical de flippers y bumpers de `01-pinball-clasico.md`,
> pero con un banco de drop targets que desbloquea multibola, un spinner que gana velocidad con
> el nivel y una bola extra a puntuación fija, para una partida con progresión real en vez de solo
> un multiplicador de combo.

---

## Por qué existe esta spec

`01-pinball-clasico.md` fija la mesa mínima: una bola, dos flippers, tres bumpers, un
multiplicador que sube y baja con el combo. Es reconocible pero se agota rápido: no hay objetivo
a medio plazo más allá de "combo otra vez". El lote de sugerencias de 2026-09-22 pedía pinball
precisamente para cubrir un género de físicas que el catálogo no tiene, y un pinball real sin
multibola ni un objetivo de banco de targets se queda corto frente a lo que el jugador espera del
género.

Esta variante añade la capa que sí distingue un pinball de mesa completa de una demo de físicas:
un objetivo compuesto (tres drop targets) con una recompensa que cambia la partida (una segunda
bola en juego a la vez), un obstáculo que se mueve por sí mismo (el spinner, sin input del
jugador) y una bola extra que rompe el límite fijo de tres intentos. Comparte con `01` la mesa,
los flippers, los bumpers y el plunger tal cual — nada de eso se repite aquí explicado dos veces
salvo lo que cambia.

---

## Alcance

**Dentro:**

- Todo lo de `01-pinball-clasico.md` (mesa, física de bola, flippers, bumpers, slingshots,
  plunger, drenaje, combo/nivel) como base sin cambios de constantes.
- Banco de tres drop targets en la parte alta del campo: cada golpe los tumba; al tumbar los
  tres, se reinician tras un retardo y se marca "multibola lista".
- Multibola: con "multibola lista" y un bumper marcado como lanzador de multibola, el siguiente
  golpe a ese bumper añade una segunda bola en juego simultánea desde el carril, sin gastar una
  vida. Mientras hay dos bolas en juego, toda puntuación de bumper y slingshot se dobla.
- Spinner: obstáculo giratorio fijo en el campo, sin control del jugador, que suma puntos cada
  vez que una bola lo atraviesa y gira más rápido cuanto mayor es el nivel de combo.
- Bola extra: al cruzar por primera vez en la partida un umbral de puntuación fijo, se concede
  una vida adicional una única vez.
- Una línea `pinball` en `GAME_ENGINES` (la misma entrada que en `01`; solo una de las dos
  variantes llega a implementarse).
- `lib/games.ts` y migración: igual que en `01`, mismo `id: "pinball"`.

**Fuera de alcance (para specs futuras):**

- Tilt.
- Sonido.
- Rampas navegables o carriles adicionales más allá del spinner y el carril del plunger.
- Selector de mesas o skins visuales.
- Controles táctiles.
- Más de dos bolas en juego a la vez (multibola de 3+).
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni tipo de plataforma nuevo.** Igual que en `01`.

Tipos locales del motor añadidos sobre los de `01-pinball-clasico.md`:

```ts
type DropTarget = { pos: Vec2; w: number; h: number; down: boolean };
type Spinner = { pos: Vec2; radius: number; angle: number; lastBallSide: 1 | -1 | null };
```

Estado en la clausura de `createPinballGame`, extendiendo el de `01`:

- `balls: Ball[]` (uno o dos elementos; `01` usaba `ball: Ball` único).
- `dropTargets: DropTarget[]` (3).
- `spinner: Spinner`.
- `multiballReady: boolean`, `multiballActive: boolean` (`true` mientras `balls.length === 2`).
- `extraBallAwarded: boolean` (una sola concesión por partida).

---

## Plan de implementación

### 1. Base compartida con la variante clásica

Partir del motor de `01-pinball-clasico.md` (pasos 1 a 4: física de bola, flippers, bumpers,
slingshots, combo/nivel, plunger, drenaje, vidas) con una única diferencia estructural: `ball:
Ball` pasa a `balls: Ball[]`, y `update()`/colisiones/drenaje iteran sobre todas las bolas en
juego en vez de una sola. El drenaje de una bola con `balls.length === 2` la retira del array sin
restar vida ni cambiar `state`; solo cuando la última bola del array drena se aplica la resta de
vida de `01`.

Comprobación: con `balls` forzado a dos elementos a mano (antes de tener multibola real), ambas
bolas caen, rebotan y drenan de forma independiente sin que una vida se pierda hasta que la
segunda también cae.

### 2. Motor: drop targets

```
DROP_TARGET_COUNT 3 · DROP_TARGET_W 40 · DROP_TARGET_H 14
DROP_TARGET_POS [(170, 120), (240, 105), (310, 120)]
DROP_TARGET_POINTS 75 (por golpe individual, además de los puntos de bumper/slingshot normales)
DROP_TARGET_RESET_MS 3000 (tras tumbar los tres)
```

Colisión bola-target: rectángulo vs círculo, como un muro corto; al contacto con un target
`down === false`, pasa a `down = true`, deja de colisionar (la bola lo atraviesa en vertical) y
suma `DROP_TARGET_POINTS * level`. Cuando los tres están `down`, `multiballReady = true` y tras
`DROP_TARGET_RESET_MS` los tres vuelven a `down = false` (el banco se recicla; `multiballReady` no
se apaga con el reciclado, solo al consumirse en el paso 3).

Comprobación: tumbar los tres targets deja el banco plano durante 3 s y luego los tres reaparecen
en pie, sin que `multiballReady` se apague en ese momento.

### 3. Motor: multibola

```
MULTIBALL_TRIGGER_BUMPER 2 (índice del bumper superior en `BUMPER_POS` de 01, el más alto de los
  tres: (240, 170))
MULTIBALL_SCORE_FACTOR 2 (multiplica BUMPER_POINTS y SLINGSHOT_POINTS mientras balls.length === 2)
```

Mientras `multiballReady === true`, el bumper `MULTIBALL_TRIGGER_BUMPER` destella con un color
distinto (dato visual, sin nuevo campo de estado más allá de leer `multiballReady` en `draw()`).
Al golpearlo con `multiballReady`, además de su puntuación normal: `multiballReady = false`,
`multiballActive = true`, se añade una bola nueva a `balls` en reposo en el carril del plunger
recargado a `PLUNGER_MAX_SPEED` automáticamente (no requiere que el jugador cargue el plunger a
mano). `multiballActive` vuelve a `false` en cuanto `balls.length` cae a 1.

Comprobación: con una bola en juego, tumbar el banco de targets y golpear el bumper superior
añade una segunda bola visible que cae del carril sola; a partir de ese golpe, el siguiente golpe
a cualquier bumper o slingshot suma el doble de puntos hasta que una de las dos bolas drena.

### 4. Motor: spinner

```
SPINNER_POS (240, 340) · SPINNER_RADIUS 22
SPINNER_POINTS 30 (por cada bola que lo atraviesa)
SPINNER_BASE_SPEED 180 °/s · SPINNER_SPEED_PER_LEVEL 60 °/s (velocidad = BASE + PER_LEVEL * (level - 1))
```

El spinner gira de forma continua en `update()` a su velocidad actual, sin depender de input.
Colisión bola-spinner: círculo-círculo igual que un bumper, pero **sin** desviar la trayectoria de
la bola (la deja pasar) — solo suma `SPINNER_POINTS * level` la primera vez que la bola entra en
su radio por cada cruce (se controla con `lastBallSide`, el signo de `pos.x - spinner.pos.x` en el
frame anterior de esa bola: solo puntúa si cambió de signo respecto al frame anterior, así un
roce que no llega a cruzar el centro no puntúa dos veces por el mismo paso).

Comprobación: dejar caer una bola a través del spinner con el nivel en 1 lo hace girar despacio y
suma 30 puntos una sola vez por cruce; subir el nivel a 3 con un combo lo acelera visiblemente.

### 5. Motor: bola extra

```
EXTRA_BALL_SCORE 5000
```

En cada actualización de `score`, si `score >= EXTRA_BALL_SCORE` y `!extraBallAwarded`:
`lives++`, `onLives(lives)`, `extraBallAwarded = true`. No se vuelve a conceder en la misma
partida aunque el score siga subiendo; `restart()` resetea `extraBallAwarded` a `false`.

Comprobación: jugar hasta superar 5000 puntos añade una vida visible en el HUD exactamente una
vez, aunque el score siga subiendo después.

### 6. Dibujo

Sobre el dibujo de `01`: banco de targets como tres rectángulos que se aplanan a `down`, spinner
como línea que rota alrededor de su centro con una marca en una punta para que se vea el giro, y
el bumper de multibola con un aro adicional cuando `multiballReady`. Con dos bolas en juego, ambas
se dibujan igual (círculo blanco), sin diferenciarlas visualmente.

Comprobación: `npm run build` limpio.

### 7. Registrar la ficha

Igual que el paso 6 de `01-pinball-clasico.md`: una línea `pinball` en `GAME_ENGINES` con los
mismos `width`/`height`/`controls` (los controles no cambian: esta variante no añade teclas).

Comprobación: `/jugar/pinball` pinta el canvas real con el banco de targets y el spinner visibles
además de lo de `01`.

### 8. Leaderboard

Misma migración que el paso 7 de `01-pinball-clasico.md`: solo una de las dos variantes llega a
aplicarse, con el mismo `id: "pinball"`.

Comprobación: `select * from public.games` incluye la fila `pinball` una sola vez.

### 9. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, recorrido manual de
los criterios de aceptación, incluidos los heredados de `01` con dos bolas en juego a la vez.

---

## Criterios de aceptación

- [ ] Todos los criterios de `01-pinball-clasico.md` se cumplen también en esta variante.
- [ ] El banco de tres drop targets se dibuja en pie al iniciar la partida.
- [ ] Golpear un target lo tumba, suma `75 × nivel` puntos y deja de colisionar con la bola.
- [ ] Tumbar los tres targets los recicla (vuelven en pie) 3 s después, sin resetear el estado de
      "multibola lista".
- [ ] Con "multibola lista", el bumper superior se distingue visualmente de los otros dos.
- [ ] Golpear el bumper superior con "multibola lista" añade una segunda bola al campo desde el
      carril, sin restar ni sumar vidas.
- [ ] Mientras hay dos bolas en juego, un golpe de bumper o slingshot suma el doble de puntos que
      con una sola bola al mismo nivel.
- [ ] Cuando una de las dos bolas drena, la partida continúa con la bola restante sin restar vida
      ni abrir el modal de fin de juego.
- [ ] Cuando drena la última bola en juego, se resta una vida exactamente una vez (no dos, aunque
      momentos antes hubiera dos bolas).
- [ ] El spinner gira de forma continua sin necesitar ninguna tecla.
- [ ] Cruzar el spinner suma 30 puntos por cruce; rozarlo sin cruzar el centro no puntúa.
- [ ] Subir el nivel de combo acelera visiblemente el giro del spinner.
- [ ] Alcanzar 5000 puntos añade una vida al HUD exactamente una vez en toda la partida.
- [ ] Seguir sumando puntos por encima de 5000 no concede vidas adicionales.
- [ ] `JUGAR DE NUEVO` reinicia también el banco de targets, el spinner al ángulo inicial y la
      bandera de bola extra.
- [ ] Con dos bolas en juego, pausar con `PAUSA` congela ambas; `REANUDAR` las reanuda sin saltos.
- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/pinball` con
      multibola activa.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** multibola de solo dos bolas, no tres o más. Con la mesa de `01` (480×800, tres
  bumpers) una tercera bola simultánea satura el campo sin espacio real para reaccionar con dos
  flippers.
- **Sí:** el spinner no desvía la bola, solo puntúa al cruce. Un spinner que además rebota
  duplicaría el trabajo del paso de colisión de bumpers sin aportar una mecánica distinta.
- **Sí:** la bola extra es un umbral de score fijo (5000), no un target dedicado. Mantiene esta
  variante centrada en multibola como capa principal; un target de bola extra es otra spec si se
  quiere layering adicional.
- **No:** vidas ilimitadas por bola extra repetida. `extraBallAwarded` la limita a una vez porque
  el contrato de `lives` de la plataforma no está pensado para crecer sin límite.
- **Sí:** reciclar el banco de targets tras 3 s en vez de dejarlo caído el resto de la partida. Un
  banco agotado para siempre mata el objetivo principal de la variante a mitad de partida.
- **No:** diferenciar visualmente las dos bolas en juego (por ejemplo con colores distintos). No
  aporta a la jugabilidad y añade estado de dibujo que el paso 6 no necesita.
- **Sí:** compartir mesa, flippers, bumpers, plunger y drenaje al pie de la letra con `01`. El
  objetivo de esta variante es la capa de progresión, no rediseñar la física base ya probada.

---

## Riesgos

| Riesgo                                                                                    | Mitigación                                                                                          |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Dos bolas en juego a la vez duplican el coste de colisión por frame y bajan los fps.          | El campo es pequeño (480×800, 3 bumpers, 3 targets, 1 spinner): el paso 1 se verifica con `?fps=1` antes de dar el paso por bueno. |
| El drenaje simultáneo de las dos bolas en el mismo frame resta dos vidas en vez de una.        | El paso 1 fija que solo la caída de la última bola del array resta vida; se prueba a propósito con las dos cayendo juntas. |
| El spinner puntúa varias veces por un solo cruce si la bola oscila cerca del centro.           | `lastBallSide` exige cambio de signo respecto al frame anterior, no solo estar dentro del radio.       |
| La bola extra se concede más de una vez si `score` fluctúa alrededor del umbral.               | `extraBallAwarded` es una bandera de una sola vez, no una comparación repetible.                       |
| El banco de targets nunca se recicla si `DROP_TARGET_RESET_MS` se pierde por un bug de timer.  | El paso 2 se comprueba explícitamente con el banco tumbado y un cronómetro manual de los 3 s.          |
| La segunda bola del multibola aparece superpuesta con la primera y ambas quedan pegadas.       | Se añade siempre en el carril del plunger, físicamente separado del campo principal donde está la otra bola. |

---

## Lo que **no** entra en esta spec

- Tilt.
- Sonido.
- Rampas o carriles adicionales más allá del spinner y el carril del plunger.
- Selector de mesas o skins visuales.
- Controles táctiles.
- Multibola de más de dos bolas.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
