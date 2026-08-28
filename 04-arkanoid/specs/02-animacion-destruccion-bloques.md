# SPEC 02 — Animación de destrucción de bloques

> **Estado:** Aprobado
> **Depende de:** SPEC 01
> **Fecha:** 2026-08-23
> **Objetivo:** Que romper un bloque deje en su lugar una animación de explosión de 4 frames del color del bloque, en vez de que desaparezca de golpe.

## Por qué existe este spec

El SPEC 01 dejó fuera la animación de explosión pese a estar los assets disponibles: `EXPLOSION_FRAMES[color]` (4 frames por color, `gray` reusa los de `red`) y `EXPLOSION_DURATION = 150`. Hoy el bloque se marca `dead` y desaparece en el mismo frame, sin ninguna respuesta visual al impacto. Este spec añade esa respuesta sin tocar la física ni la puntuación.

Además introduce la primera entidad **efímera** del proyecto: una entidad que nace en mitad de la partida, vive un tiempo y se marca `dead` sola. Fija el patrón que reutilizarán specs futuros (power-ups que caen, partículas).

## Alcance

**Dentro:**

- Nueva entidad `explosion` en `game.js`: `x`, `y`, `w`, `h`, `color`, `t`, `dead`, con `update(dt)` y `draw()`.
- Array global `explosions`, filtrado por el loop igual que `blocks`.
- Al marcar un bloque como `dead` en `colisionarBloques()`, se empuja una explosión en la posición y tamaño exactos del bloque, con su mismo `color`.
- Dibujo con `drawFrame(ctx, EXPLOSION_FRAMES[color][i], …)`, avanzando el frame por tiempo acumulado.
- La victoria pasa a exigir que no queden bloques **ni** explosiones vivas.
- `reiniciar()` vacía `explosions`.

**Fuera de alcance (para specs futuros):**

- Sonido de rotura (`break-sound.mp3`) y de rebote (`ball-bounce.mp3`). Decisión del usuario: este spec es puramente visual.
- Explosión o efecto visual al perder una vida, al rebotar en la pala o en los muros.
- Bloques de varios golpes o indestructibles (que necesitarían un efecto de "golpe sin romper").
- Partículas, sacudida de pantalla, destellos o cualquier otro efecto añadido.
- Power-ups liberados por el bloque roto.

## Modelo de datos

Todo en el scope global de `game.js`, sin módulos. No cambia ninguna estructura existente: solo se añaden una constante, una fábrica y un array.

```js
// Los 4 frames se reparten EXPLOSION_DURATION (150 ms) en total, no por frame.
// En segundos, porque todo el juego trabaja en px/s y dt en segundos.
const EXPLOSION_TIME = EXPLOSION_DURATION / 1000;   // 0.15 s de animación completa

// Entidad efímera: se marca dead sola al agotar su tiempo; el loop la filtra
explosion = { x, y, w, h, color, t, dead:false }
//   x, y, w, h -> copiados del bloque roto (64×24 en su posición exacta)
//   color      -> el del bloque; es la clave compartida con EXPLOSION_FRAMES
//   t          -> tiempo vivido en segundos, de 0 a EXPLOSION_TIME

// Estado global
let explosions = [];        // el loop filtra las dead, igual que blocks
```

El índice de frame se deriva de `t`, no se guarda:

```js
const frames = EXPLOSION_FRAMES[this.color];
const i = Math.min(Math.floor(this.t / EXPLOSION_TIME * frames.length), frames.length - 1);
```

El `clamp` al último índice evita que un `dt` justo en el límite pida un frame fuera del array.

## Plan de implementación

1. Añadir la constante `EXPLOSION_TIME` junto al resto de constantes de mundo y el array global `explosions = []` junto a `blocks`. Prueba manual: el juego sigue funcionando igual, sin errores en consola.
2. Añadir la fábrica `crearExplosion(x, y, w, h, color)` en el bloque de Entidades, después de `crearBloque`. `update(dt)` acumula `this.t += dt` y marca `this.dead = true` cuando `t >= EXPLOSION_TIME`. `draw()` calcula el índice de frame y llama a `drawFrame`. Prueba manual: sin errores; todavía no se ve nada porque nadie la crea.
3. En `colisionarBloques()`, justo después de `b.dead = true`, empujar `explosions.push(crearExplosion(b.x, b.y, b.w, b.h, b.color))`. Prueba manual: al romper un bloque se ve el destello en su sitio y desaparece solo.
4. En `update(dt)`, dentro del bloque de partida: `explosions.forEach(e => e.update(dt))` y `explosions = explosions.filter(e => !e.dead)`, en paralelo a lo que ya se hace con `blocks`. Prueba manual: romper muchos bloques seguidos no deja explosiones colgadas ni degrada el frame rate.
5. En `draw()`, dibujar `explosions` **después** de `ball` y antes de `drawHUD()`. Prueba manual: la explosión se ve entera aunque la bola pase justo por encima.
6. Cambiar la condición de victoria a `if (blocks.length === 0 && explosions.length === 0) screen = 'victoria';`. Prueba manual: al romper el último bloque se ve su explosión completa antes de que aparezca el overlay.
7. En `reiniciar()`, añadir `explosions = []`. Prueba manual: reiniciar desde victoria o game over empieza la partida sin explosiones heredadas en pantalla.

## Criterios de aceptación

- [ ] Al romper un bloque aparece una animación en su posición exacta, del mismo tamaño que el bloque (64×24).
- [ ] La animación usa los 4 frames de `EXPLOSION_FRAMES` correspondientes al color del bloque roto.
- [ ] La animación completa dura 150 ms y después la explosión desaparece sola.
- [ ] La explosión no colisiona con nada: la bola la atraviesa sin cambiar de dirección.
- [ ] Romper un bloque sigue sumando exactamente 10 puntos y sigue rebotando igual que antes de este spec.
- [ ] Las explosiones se dibujan por encima de la pala y de la bola, y por debajo del HUD y de los overlays.
- [ ] Al romper el último bloque se ve su explosión entera antes de que aparezca el overlay de victoria.
- [ ] Con un overlay en pantalla las explosiones no avanzan.
- [ ] Reiniciar la partida deja `explosions` vacío: no quedan explosiones de la partida anterior.
- [ ] Ninguna explosión sobrevive indefinidamente: `explosions.length` vuelve a 0 unos milisegundos después del último impacto.
- [ ] No hay errores en consola con la rejilla entera reventándose (p. ej. varios bloques en cadena).

## Decisiones

- **Sí:** `EXPLOSION_DURATION` es la duración **total** de los 4 frames (37,5 ms por frame). Es la lectura literal del nombre y da un destello seco que no estorba el ritmo.
- **No:** 150 ms por frame (600 ms totales). Más vistoso, pero con varios bloques cayendo seguidos la pantalla se llena de explosiones y tapa la bola.
- **Sí:** entidad `explosion` independiente en su propio array. El bloque muere exactamente igual que hoy, así que la colisión, la puntuación y el conteo de bloques no se tocan: riesgo cero de regresión en la física.
- **No:** estado `explotando` dentro del bloque. Ahorraría un array pero mete un caso raro en el bucle de colisión y en el conteo de victoria.
- **Sí:** la victoria espera a que no queden explosiones. Ver reventar el último bloque cierra mejor la partida que congelarlo bajo el overlay.
- **Sí:** la explosión ocupa el rectángulo exacto del bloque. Los frames son 32×16, la misma proporción que el sprite de bloque, así que escala sin deformarse y encaja con la rejilla.
- **No:** explosión escalada 1,5× y centrada. Se saldría sobre los bloques vecinos y taparía bloques todavía vivos.
- **Sí:** las explosiones se actualizan solo con `screen === 'jugando'`, dentro del mismo bloque que el resto de entidades. Mantiene la regla del SPEC 01 de que con overlay el juego no avanza.
- **Sí:** el índice de frame se deriva de `t` en cada `draw()`, no se guarda como campo. Un solo dato de estado (`t`) que no puede desincronizarse del frame mostrado.
- **No:** sonido de rotura. Decisión del usuario: el audio va en su propio spec, con el desbloqueo por interacción del navegador y el solapamiento de instancias.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `EXPLOSION_FRAMES` no tiene entrada para algún color futuro (p. ej. un bloque nuevo) | Los seis colores de `ROW_COLORS` están cubiertos y `gray` reusa los de `red`. El acoplamiento color ↔ `EXPLOSION_FRAMES` ya está documentado en `CLAUDE.md`: al añadir tipos de bloque hay que mantenerlo. |
| Índice de frame fuera de rango con un `dt` en el límite | El índice se clampea a `frames.length - 1` antes de indexar. |
| Muchas explosiones simultáneas degradan el frame rate | Cada explosión vive 150 ms y son un solo `drawImage`; el techo real son ~10 simultáneas. Además el loop las filtra cada frame, así que el array no crece. |
| La victoria podría no dispararse nunca si una explosión no muere | `t` se acumula siempre con `dt > 0` y `dt` está clampeado, así que toda explosión alcanza `EXPLOSION_TIME`. Criterio de aceptación explícito de que `explosions.length` vuelve a 0. |

## Lo que **no** entra en este spec

- Sonidos de rotura y de rebote.
- Efectos visuales al perder vida, al rebotar en pala o muros.
- Bloques de varios golpes o indestructibles.
- Partículas, sacudida de pantalla u otros efectos.
- Power-ups.

Cada uno, si llega, en su propio spec.
