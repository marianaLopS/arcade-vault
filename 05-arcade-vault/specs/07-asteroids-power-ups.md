# SPEC 07 — Asteroids: reponer el motor con el template actualizado

> **Estado:** Aprobado
> **Depende de:** SPEC 05
> **Fecha:** 2026-09-10
> **Objetivo:** Sustituir `lib/games/asteroids/engine.ts` por el port de la versión actual de `References/.../started-games/02-asteroides/game.js`, que añade cuatro mecánicas nuevas, sin tocar el contrato `GameEngine` ni el marcador.

---

## Por qué existe esta spec

El motor que entró con la SPEC 05 portaba un `game.js` de ~510 líneas con un único power-up
(disparo triple). El template ha seguido creciendo: hoy son 719 líneas con escudo activable,
cámara lenta, bomba nova e hiperpropulsión. La física, las constantes de tamaño
(`RADII`/`SPEEDS`/`POINTS`) y el ciclo `playing | dead | gameover` son los mismos, así que no es
una reescritura: es reponer el juego con la versión buena y quedarse con las adaptaciones de
plataforma que ya funcionaban.

---

## Alcance

**Dentro:**

- `lib/games/asteroids/engine.ts`: port completo del `game.js` actual.
- `components/game-player.tsx`: el `aria-label` del canvas, único sitio de la UI donde se
  documentan los controles.

**Fuera:** `lib/games/engine.ts`, `lib/games/registry.ts`, `components/game-canvas.tsx`,
`app/jugar/**`, `lib/scores.ts`, el esquema de Supabase y `app/globals.css`. El `id` sigue
siendo `asteroids`, así que la fila de `games` y las puntuaciones ya guardadas no se tocan.

---

## Mecánicas nuevas

| Mecánica        | Tecla    | Comportamiento                                                                                                                                                   |
| --------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Escudo          | `↓`      | Gasta una carga (0..3, +1 por nivel). 5 s activo; absorbe un asteroide —lo vaporiza sin puntos ni fragmentos— y deja 1 s de gracia.                              |
| Cámara lenta    | power-up | 6 s con el `dt` de los asteroides ×0.5. La nave y las balas van a velocidad normal.                                                                              |
| Bomba nova      | `B`      | Power-up escaso (18 %), máximo una guardada. Pulveriza todos los asteroides en pantalla: sí da puntos, no da fragmentos. Onda expansiva de 620 px durante 0,6 s. |
| Hiperpropulsión | `Shift`  | Empuje ×2.5 mientras se mantiene. Reserva de 8 s que se drena al usarla y recupera 0,5 s por segundo. Se necesitan 0,6 s de reserva para (re)activarla.          |

El disparo triple pasa de 5 s / spread 0.18 a **6 s / spread 0.22** y deja de vivir en `Ship`:
los cuatro temporizadores son estado de la partida, no de la nave. Los power-ups ahora tienen
`type` (`triple | slow | nova`) y se sueltan uno por nivel, garantizado cuando quedan ≤ 2
asteroides.

Al morir se pierden triple, lento y escudo activo, y la reserva de hiper vuelve a tope; las
**cargas** de escudo se conservan.

---

## Adaptaciones que se mantienen (no se porta el original tal cual)

El template es un script global: `window.addEventListener`, `requestAnimationFrame` sin handle,
`initGame()` al cargar y HUD completo dentro del canvas. Todo eso sigue adaptado igual que en la
SPEC 05:

- Estado en la clausura de `createAsteroidsGame`, nunca en variables de módulo.
- Listeners en el **canvas**, no en `window`; `blur` suelta todas las teclas.
- `start/pause/resume/restart/destroy` con `cancelAnimationFrame` y guarda `destroyed`.
- Las entidades no leen estado global: lo que el original consulta desde `hiperActivo` o
  `tripleTimer` entra por parámetro (`ship.update(dt, keys, hiper)`, `ship.tryShoot(triple)`).
- Fin de partida → `callbacks.onGameOver(score)` y modal de React. **No** se porta
  `drawOverlay('GAME OVER', …)` ni el reinicio con `Espacio`.

`GAME_KEYS` crece con `ShiftLeft`, `ShiftRight` y `KeyB`. `KeyP` y `Escape` siguen fuera: los
intercepta `components/game-canvas.tsx` para la pausa.

## HUD

El canvas pinta **sólo el estado de los power-ups** —`ESCUDO x{n}` / cuenta atrás,
`NOVA x{n} [B]`, `TRIPLE {t}`, `LENTO {t}` y la barra `HIPER [SHIFT]`—. Puntuación, vidas y
nivel se quedan donde estaban, en el HUD de React, para no duplicarlos. Por eso no se portan
`SCORE`, `NIVEL` ni `drawLifeIcon` del `drawHUD` del template, y `GameCallbacks` no cambia.

---

## Verificación

- `npm run lint` y `npm run build`.
- `/jugar/asteroids`: `↓` con carga activa el escudo, `B` detona la nova, `Shift` acelera y
  drena la barra; cada indicador del canvas responde.
- Pausa con `P`/`Escape`/botón y reanudación sin salto de `dt`.
- Perder la tercera vida abre el modal de React (no un overlay en el canvas) y `Espacio` no
  reinicia solo; guardar la puntuación sigue llegando a `/salon` y `/juegos/asteroids`.
- «JUGAR DE NUEVO» reinicia con todos los contadores nuevos a cero y sin duplicar el bucle.
