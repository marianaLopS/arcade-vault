# SPEC 01 — MVP jugable de Arkanoid

> **Estado:** Aprobado
> **Depende de:** —
> **Fecha:** 2026-08-22
> **Objetivo:** Tener un Arkanoid jugable de principio a fin en una sola pantalla: pala, bola, rejilla de bloques, tres vidas, puntuación y overlays de inicio, victoria y derrota.

## Por qué existe este spec

El proyecto está vacío: hoy solo hay `assets/`. Este spec crea los tres archivos base (`index.html`, `style.css`, `game.js`) y fija las convenciones que heredarán los specs siguientes: entidades con `update(dt)`/`draw()`/`dead`, movimiento en px/s escalado por `dt`, `keys[code]` para acciones continuas y `pressed(code)` para pulsaciones únicas.

## Alcance

**Dentro:**

- `index.html` con un único `<canvas>` de 800×600, `assets/spritesheet.js` cargado antes de `game.js`.
- `style.css` mínimo: fondo oscuro, canvas centrado, sin scroll.
- `game.js` con el bucle de juego completo (`update`/`draw`/`loop`) y `dt` en segundos clampeado a 0.05.
- Pala controlada por **teclado y ratón simultáneamente**: `ArrowLeft`/`ArrowRight` mueven a velocidad fija; mover el ratón sobre el canvas coloca la pala centrada en el cursor. La última fuente de entrada usada manda; ambas quedan siempre activas.
- Bola con rebote en los tres muros (izquierda, derecha, techo) y **reflexión simple** en la pala (invierte `vy`).
- Física predecible: sin gravedad, sin fricción, sin aceleración. El módulo de la velocidad de la bola es constante durante toda la partida; los rebotes solo invierten el signo de `vx` o `vy`.
- Rejilla fija generada por código: 6 filas × 10 bloques, un color por fila, todos de un solo golpe.
- Tres vidas. La bola que sale por abajo resta una vida y vuelve a quedar pegada a la pala.
- Puntuación: 10 puntos por bloque roto.
- HUD dibujado en el canvas con puntuación y vidas.
- Bola pegada a la pala al empezar y tras perder vida; `Space` la lanza.
- Tres overlays dibujados sobre la misma pantalla de juego (no hay pantallas separadas): inicio, victoria y game over. Se cierran o reinician con `Space`.

**Fuera de alcance (para specs futuros):**

- Varios niveles y progresión de dificultad.
- Power-ups de cualquier tipo.
- Sonidos (`ball-bounce.mp3`, `break-sound.mp3`).
- Animación de explosión (`EXPLOSION_FRAMES`, `EXPLOSION_DURATION`).
- Bloques resistentes de varios golpes (grises) y bloques indestructibles.
- Rebote angular según el punto de impacto en la pala.
- Persistencia de récords, pausa, ajustes.

## Modelo de datos

Todo vive en el scope global de `game.js`, sin módulos.

```js
// Constantes de mundo (W/H deben coincidir con el <canvas> de index.html)
const W = 800, H = 600;
const PADDLE_W = 96, PADDLE_H = 14, PADDLE_SPEED = 520;   // px/s
const BALL_SIZE = 12, BALL_SPEED = 340;                    // px/s
const BLOCK_W = 64, BLOCK_H = 24;
const COLS = 10, ROWS = 6;
const GRID_X = 80, GRID_Y = 70;                            // origen de la rejilla
const ROW_COLORS = ['red', 'yellow', 'green', 'cyan', 'magenta', 'hotpink'];
const LIVES_START = 3, POINTS_PER_BLOCK = 10;

// Entidades: todas exponen update(dt), draw() y la bandera dead
paddle = { x, y, w, h, dead:false }
ball   = { x, y, w, h, vx, vy, stuck, dead:false }         // stuck = pegada a la pala
block  = { x, y, w, h, color, dead:false }

// Estado global
let blocks = [];            // el loop filtra los dead
let score = 0;
let lives = LIVES_START;
let screen = 'inicio';      // 'inicio' | 'jugando' | 'victoria' | 'gameover'
```

Convenciones: origen arriba-izquierda, velocidades en píxeles/segundo, colisiones por AABB.

## Plan de implementación

1. Crear `index.html` con el `<canvas id="game" width="800" height="600">`, enlazar `style.css` y, al final del `<body>`, `assets/spritesheet.js` seguido de `game.js`. Crear `style.css` (fondo oscuro, canvas centrado). Prueba manual: `python3 -m http.server 8000` desde `04-arkanoid/` muestra un canvas negro sin errores en consola.
2. En `game.js`, esqueleto: `'use strict'`, constantes `W`/`H`, referencias a canvas y contexto, bloque de Input (`keys`, `pressed`, listeners de teclado y de `mousemove` sobre el canvas) y `loop(ts)` con `dt` en segundos clampeado a 0.05, arrancado dentro del callback de `loadSpritesheet`. Prueba manual: la consola no lanza errores y el loop corre.
3. Entidad `paddle`: `update(dt)` con teclado y ratón, `clamp` a los bordes del canvas; `draw()` con `drawSprite(ctx, 'paddle', …)`. Prueba manual: la pala se mueve con flechas y siguiendo el ratón, sin salirse.
4. Entidad `ball` en estado `stuck`: se dibuja centrada sobre la pala y la sigue. `Space` (vía `pressed`) la lanza hacia arriba con un `vx` inicial fijo. Prueba manual: la bola sale al pulsar espacio.
5. Movimiento libre de la bola y rebote en los tres muros; salir por abajo la devuelve al estado `stuck`. Prueba manual: la bola rebota en muros y se repega al caer.
6. Colisión bola-pala por AABB con reflexión simple (`vy = -Math.abs(vy)`) y reposicionamiento de la bola justo encima de la pala para evitar reenganches. Prueba manual: la bola no atraviesa ni se pega a la pala.
7. Función que genera `blocks` (6 filas × 10 columnas, color por fila) y su `draw()` con `drawSprite(ctx, 'block_' + color, …)`. Prueba manual: se ve la rejilla completa.
8. Colisión bola-bloque: marcar el bloque como `dead`, sumar `POINTS_PER_BLOCK` e invertir el eje de menor solape (`vx` o `vy`); el loop filtra los `dead`. Prueba manual: los bloques desaparecen y el score sube de 10 en 10.
9. Vidas: al caer la bola, `lives--`; si llega a 0, `screen = 'gameover'`. Si `blocks.length === 0`, `screen = 'victoria'`. HUD con puntuación y vidas dibujado con `ctx.fillText`. Prueba manual: perder tres bolas lleva a game over; limpiar la rejilla lleva a victoria.
10. Overlays: rectángulo semitransparente sobre el canvas con el texto de cada estado (inicio, victoria, game over) y la indicación de pulsar `Space`. Función `reiniciar()` que restaura `blocks`, `score`, `lives` y la bola. Prueba manual: `Space` inicia la partida desde el overlay de inicio y reinicia desde victoria y game over.

## Criterios de aceptación

- [ ] El juego carga en `http://localhost:8000` sin errores en la consola.
- [ ] Al cargar se ve el overlay de inicio y el juego no avanza hasta pulsar `Space`.
- [ ] Las flechas ← y → mueven la pala y esta no sale del canvas.
- [ ] Mover el ratón sobre el canvas coloca la pala centrada en el cursor.
- [ ] La bola arranca pegada a la pala y se lanza con `Space`.
- [ ] La bola rebota en los muros izquierdo, derecho y superior.
- [ ] La bola rebota en la pala invirtiendo su dirección vertical.
- [ ] Romper un bloque suma exactamente 10 puntos y el bloque desaparece.
- [ ] La rejilla inicial tiene 60 bloques (6 filas × 10 columnas).
- [ ] Perder la bola por abajo resta una vida y la bola vuelve pegada a la pala.
- [ ] Con 0 vidas aparece el overlay de game over.
- [ ] Al romper los 60 bloques aparece el overlay de victoria.
- [ ] `Space` desde victoria o game over reinicia la partida con 3 vidas y 0 puntos.
- [ ] El HUD muestra en todo momento la puntuación y las vidas restantes.
- [ ] Las constantes `W`/`H` de `game.js` coinciden con los atributos del `<canvas>`.

## Decisiones

- **Sí:** una sola pantalla con overlays dibujados en el canvas. Menos estados y menos código que pantallas separadas; suficiente para un MVP.
- **No:** pantallas de victoria y game over independientes. Se descartó por coste sin ganancia en el MVP.
- **Sí:** teclado y ratón activos a la vez, sin modo de entrada configurable. Decisión cerrada por el usuario.
- **Sí:** reflexión simple en la pala (`vy` invertido). Decisión del usuario: es lo mínimo para tener el juego en pie.
- **No:** rebote angular según el punto de impacto. Es el rebote clásico y da más control, pero se aplaza a otro spec.
- **Sí:** rejilla fija generada por código. Menos superficie que un sistema de layouts para un único nivel.
- **No:** layout como array de strings. Se hará cuando existan varios niveles.
- **No:** sonidos y animación de explosión, pese a estar los assets disponibles. Decisión del usuario: el MVP es puramente visual.
- **Sí:** bola pegada a la pala con lanzamiento por `Space`. Evita perder vidas antes de estar listo tras cada muerte.
- **Sí:** 10 puntos fijos por bloque, sin bonus por color ni combos.
- **Sí:** velocidad de la bola constante durante toda la partida. Física predecible al estilo Arkanoid clásico; nada de aceleración progresiva.
- **Sí:** rejilla de 6 filas × 10 columnas (60 bloques), un color por fila usando los seis colores del spritesheet. Cabe holgada: 640 px de ancho centrados y 144 px de alto por debajo del HUD.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La reflexión simple puede dejar la bola en un bucle casi vertical y aburrido | El `vx` inicial del lanzamiento es no nulo y nunca se anula, así que la bola siempre conserva desplazamiento horizontal. Si aun así molesta, el rebote angular entra en otro spec. |
| La bola puede atravesar un bloque a `dt` alto | `dt` está clampeado a 0.05 y la velocidad es moderada (340 px/s ⇒ máx. 17 px por frame, menos que la altura de bloque). |
| La bola puede quedar enganchada dentro de la pala tras la colisión | Al colisionar se reposiciona la bola justo encima de la pala antes de invertir `vy`. |
| Abrir `index.html` con `file://` rompe la carga del spritesheet | El juego se sirve siempre por HTTP; documentado en `CLAUDE.md` y en el plan. |

## Lo que **no** entra en este spec

- Varios niveles y dificultad progresiva.
- Power-ups.
- Sonidos y animación de explosión.
- Bloques de varios golpes o indestructibles.
- Rebote angular en la pala.
- Récords persistentes y pausa.

Cada uno de ellos, si llega, va en su propio spec.
