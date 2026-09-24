# SPEC 11 — Controles táctiles: los juegos reales se juegan en el móvil

> **Estado:** Aprobado
> **Depende de:** SPEC 05, SPEC 06, SPEC 08, SPEC 09, SPEC 10
> **Fecha:** 2026-09-24
> **Objetivo:** Que los cuatro juegos con motor (asteroids, caida, arkanoid, snake) se jueguen en un móvil táctil en vertical, con el canvas arriba y un mando virtual común (cruceta + hasta dos botones A/B) debajo, sin tocar los motores.

---

## Por qué existe esta spec

Hoy los cuatro motores sólo entienden teclado (y ratón en Arkanoid). En un móvil el canvas se ve,
pero no hay forma de jugar: no hay teclas, y el HUD de escritorio ocupa media pantalla encima del
juego.

Los cuatro motores escuchan `keydown` / `keyup` **sobre el canvas** y deciden por `e.code`. Eso
permite resolver el táctil en la plataforma: un mando en React que despacha `KeyboardEvent`
sintéticos al canvas. Ningún `engine.ts` cambia.

---

## Alcance

**Dentro:**

- `lib/games/registry.ts`: campo opcional `touch` en `GameEngineEntry` con el mapeo de A/B y si
  la cruceta autorrepite. Relleno para los cuatro juegos.
- `components/game-canvas.tsx`: `GameCanvasHandle.key(code, down)` que despacha el evento al canvas.
- `components/touch-pad.tsx` (nuevo, `TouchPad`): cruceta de 4 flechas + botones A y B con su
  rótulo por juego. Un botón sin mapeo **no se pinta** (Snake sólo muestra la cruceta).
- `components/game-player.tsx`: monta `TouchPad` bajo el CRT; en táctil el HUD se reduce a una barra
  compacta y skin / SALIR pasan al overlay de pausa.
- `app/globals.css`: layout táctil vertical bajo `@media (pointer: coarse)`.
- Bloqueo de zoom por doble toque, scroll, selección de texto y menú contextual **sobre el mando y
  el canvas**.
- Vibración corta al pulsar un botón del mando, donde `navigator.vibrate` exista.
- Documentar el campo `touch` en `CLAUDE.md` y en la skill `nuevo-juego` (las dos copias).

**Fuera de alcance (para specs futuras):**

- Orientación horizontal: se ve, pero no tiene layout propio ni se verifica.
- Gestos (swipe en Snake/Tetris, arrastrar la pala en Arkanoid).
- Más de dos botones de acción; la hiperpropulsión de Asteroids (Shift) no tiene botón.
- Botón de pantalla completa.
- Interruptor manual para mostrar/ocultar el mando en portátiles táctiles.
- Los cuatro juegos de maqueta (`gloton`, `invasores`, `ranaria`, `duelo-pixel`): no tienen motor,
  no reciben mando.
- Cambios en motores, contrato `GameEngine`, esquema de Supabase o leaderboard.
- Bloquear el zoom de toda la página (`user-scalable=no`).

---

## Modelo de datos

**Sin tablas, columnas ni migraciones.** Sólo tipos en `lib/games/registry.ts`:

```ts
/** Un botón de acción del mando táctil: la tecla que imita y su rótulo. */
export type TouchButton = { code: string; label: string };
export type TouchControls = {
  a?: TouchButton; // botón derecho, el principal
  b?: TouchButton; // botón izquierdo
  /** La cruceta reenvía keydown mientras se mantiene (motores que mueven por pulsación). */
  repeat?: boolean;
};
// GameEngineEntry gana: touch?: TouchControls;
```

La cruceta siempre envía `ArrowUp` / `ArrowDown` / `ArrowLeft` / `ArrowRight`.

| Juego       | A                   | B                 | `repeat` |
| ----------- | ------------------- | ----------------- | -------- |
| `asteroids` | `Space` · `DISPARO` | `KeyB` · `BOMBA`  | no       |
| `caida`     | `KeyX` · `GIRAR`    | `Space` · `CAÍDA` | sí       |
| `arkanoid`  | `Space` · `LANZAR`  | `KeyM` · `SONIDO` | no       |
| `snake`     | —                   | —                 | no       |

En Asteroids, flecha abajo de la cruceta = escudo, como en teclado.

Constantes de `TouchPad`: `REPEAT_DELAY 200 ms`, `REPEAT_INTERVAL 70 ms`, `VIBRATE_MS 10`.

---

## Plan de implementación

### 1. Tipos y mapeo en el registro

`TouchButton`, `TouchControls` y `touch` en `GameEngineEntry`; rellenar los cuatro juegos según la
tabla. Comprobación: `npm run build` limpio.

### 2. `GameCanvasHandle.key`

`key(code, down)` hace
`canvas.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true, cancelable: true }))`.
Los listeners de los motores ya están en el canvas; no se comprueba `isTrusted` en ninguno.
Comprobación: build limpio; escritorio igual que antes.

### 3. `components/touch-pad.tsx`

- Props: `controls: TouchControls`, `disabled: boolean`, `onKey(code, down)`.
- Cada botón es independiente (multitoque: propulsar + disparar a la vez).
- `pointerdown`: `preventDefault()` (el botón **no** roba el foco al canvas, porque el `blur` del
  canvas suelta las teclas en los motores), `setPointerCapture`, `onKey(code, true)`,
  `navigator.vibrate?.(VIBRATE_MS)`.
- `pointerup` / `pointercancel` / `lostpointercapture`: `onKey(code, false)`, una sola vez.
- Con `repeat` y sólo en la cruceta: tras `REPEAT_DELAY`, `onKey(code, true)` cada `REPEAT_INTERVAL`
  mientras siga pulsado.
- `disabled` (pausa o fin de partida): no emite y suelta lo que estuviera pulsado.
- Desmontar suelta todo y limpia temporizadores.
- `contextmenu` bloqueado; CSS `touch-action: none`, `user-select: none`,
  `-webkit-touch-callout: none`.
- A y B muestran su `label` bajo el botón; sin mapeo no se renderizan.
- Accesibilidad: cada botón con `aria-label` (flecha o rótulo).

### 4. Integración en `GamePlayer`

- Renderiza `<TouchPad>` tras `.crt` cuando `entry?.touch` existe, con
  `disabled={paused || over}` y `onKey` → `canvasRef.current?.key`.
- Siempre en el DOM; lo muestra u oculta el CSS (sin detección en JS → sin desajuste de hidratación).
- El overlay `EN PAUSA` gana un bloque `.pause-extras` (selector de skin + `SALIR`), visible sólo en
  táctil. Cambiar skin en pausa ya nace pausado (`pausedRef`).

### 5. CSS táctil vertical

Bajo `@media (pointer: coarse)`:

- `.touch-pad` visible (fuera de esa media query: `display: none`).
- HUD en una sola línea compacta: puntuación · vidas · nivel · `PAUSA`. Se ocultan jugador, skin y
  `SALIR` del HUD (pasan a la pausa).
- `.av-player.has-canvas` en columna de alto `100svh - var(--av-nav-h)`: HUD, CRT, mando.
  `.crt-fit` vuelve a ser `container-type: size` para que el canvas encaje por alto (Tetris 420×600)
  o ancho. Marco CRT con menos padding y `.crt-bottom` oculto.
- Sin ranking, barra de navegación (logo, `Iniciar sesión`, menú) ni footer mientras se juega: se sale
  con `SALIR` desde la pausa.
- Mando: cruceta a la izquierda, A/B a la derecha, botones de al menos 48 px.
- Estética coherente con la del sitio (usar la skill `frontend-design`).

### 6. Documentación

`CLAUDE.md` (sección "Arquitectura de juegos") y `nuevo-juego` (`.claude/skills/` y
`.agents/skills/`): todo juego nuevo declara `touch` en su entrada del registro.

### 7. Repaso final

`npm run lint` y `npm run build` limpios; recorrido de los criterios en el móvil real.

---

## Criterios de aceptación

- [ ] `npm run build` y `npm run lint` limpios.
- [ ] Ningún `lib/games/*/engine.ts` cambia (`git diff` vacío en ellos).
- [ ] En escritorio (ratón) `/jugar/<juego>` se ve y se juega exactamente igual que antes; no hay mando.
- [ ] En el móvil real, vertical, `/jugar/asteroids|caida|arkanoid|snake` muestra barra HUD, canvas
      y mando en la primera pantalla sin hacer scroll.
- [ ] En táctil, `/jugar/<juego>` no muestra el ranking, la barra de navegación ni el footer, y no hay scroll.
- [ ] Asteroids: cruceta rota/propulsa/escudo; A dispara, B lanza la bomba; propulsar y disparar a la vez funciona.
- [ ] Tetris: mantener ← / → desplaza la pieza repetidamente; A gira; B deja caer de golpe.
- [ ] Arkanoid: ← / → mueven la pala; A lanza la bola; B silencia y aparece `SIN SONIDO`.
- [ ] Snake: sólo se ve la cruceta, sin A ni B; la cruceta gira la serpiente.
- [ ] A y B muestran el rótulo de su función en cada juego.
- [ ] Levantar el dedo detiene la acción (la nave deja de propulsar, la pala se para).
- [ ] Pulsar el mando no hace zoom por doble toque, ni scroll, ni selecciona texto, ni abre menú contextual.
- [ ] Pulsar un botón vibra brevemente en el móvil (Android/Chrome).
- [ ] `PAUSA` congela el juego y el mando deja de actuar; en la pausa aparecen skin y `SALIR`.
- [ ] En el modal `FIN DEL JUEGO` se pueden escribir iniciales y guardar la puntuación.
- [ ] La consola no muestra errores ni avisos de hidratación.

---

## Decisiones

- **Sí:** un único mando igual para todos (cruceta + A/B). Dos botones bastan para arcade.
- **Sí:** eventos de teclado sintéticos sobre el canvas. Motores intactos.
- **No:** método `input()` nuevo en `GameEngine`: obligaría a tocar los cuatro motores.
- **Sí:** mapeo en `GameEngineEntry.touch`: igual que `controls` y `skins`, es dato por juego.
- **Sí:** botón sin función = botón no pintado, y rótulo por juego en A/B.
- **Sí:** Asteroids A=disparo, B=bomba; la hiperpropulsión queda sin botón en móvil.
- **Sí:** autorrepetición sólo en Tetris, que mueve por pulsación; los demás leen tecla mantenida.
- **Sí:** mostrar el mando por `pointer: coarse`, en CSS, sin detección JS.
- **No:** interruptor manual ni detección por ancho.
- **Sí:** sólo vertical.
- **Sí:** HUD compacto; skin y SALIR se mueven a la pausa.
- **Sí:** en táctil, sin ranking, barra de navegación ni footer al jugar (cambio pedido durante la
  implementación; antes el ranking quedaba bajo el mando, con scroll).
- **Sí:** bloqueo de gestos sólo en mando y canvas; **no** se desactiva el zoom de la página.
- **Sí:** vibración; **no** pantalla completa.
- **Sí:** verificación en el móvil real de la usuaria por LAN.

---

## Riesgos

| Riesgo                                                                              | Mitigación                                                                                 |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Tocar un botón quita el foco al canvas; su `blur` suelta las teclas en los motores. | `preventDefault()` en `pointerdown`; el foco no se mueve.                                  |
| Un dedo que sale del botón deja la tecla pulsada para siempre.                      | `setPointerCapture` + `keyup` en `pointerup`, `pointercancel` y `lostpointercapture`.      |
| Tetris no se mueve al mantener, porque dependía del autorepeat del SO.              | `repeat: true` en `caida`.                                                                 |
| Canvas + mando no caben en móviles bajos.                                           | `.crt-fit` como contenedor de tamaño; el canvas encoge, el mando mantiene alto fijo.       |
| Desajuste de hidratación al decidir el mando en JS.                                 | Todo por CSS `pointer: coarse`.                                                            |
| `next dev` rechaza el origen del móvil por LAN.                                     | `allowedDevOrigins` en `next.config.ts` con la IP LAN actual (ajuste local de desarrollo). |
| `navigator.vibrate` no existe (iOS Safari).                                         | Llamada opcional; sin vibración no falla nada.                                             |

---

## Lo que **no** entra en esta spec

- Orientación horizontal, gestos, pantalla completa, interruptor manual del mando.
- Más de dos botones o la hiperpropulsión de Asteroids en móvil.
- Los cuatro juegos de maqueta.
- Cambios en motores, contrato o Supabase.

Cada una de ellas, si entra, va en su propia spec.
