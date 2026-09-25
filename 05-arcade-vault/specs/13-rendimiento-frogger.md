# SPEC 13 — Rendimiento de FROGGER: avisos a React y memoria

> **Estado:** Aprobado
> **Depende de:** `game-jam/ranaria/01-frogger-core`, SPEC 11
> **Fecha:** 2026-09-25
> **Objetivo:** Que FROGGER no pierda frames ni haga crecer la memoria del navegador desde que arranca, llevando puntos, vidas y nivel a `useRef` para que la partida no re-renderice React, y midiendo el resultado con un medidor de FPS.

## Por qué existe esta spec

Síntoma reportado (observación en el navegador, sin herramientas): **nada más arrancar
FROGGER los FPS caen visiblemente y la memoria del navegador empieza a subir**. La hipótesis de
la usuaria es que el motor dispara demasiados renders de React, y que la pantalla de juego
(`GamePlayer`: HUD, selector de skin, `Leaderboard`, mando táctil) es pesada de re-renderizar.

Regla que fija esta spec: **el juego sólo avisa al HUD cuando hace falta**. Si no cambian vidas,
puntos o nivel, ni hay pausa o fin de partida, React no recibe nada y no re-renderiza.

### Lo que ya se midió al escribir la spec (2026-09-25)

Chromium headless de Playwright contra `npm run dev`, 1280×800, skin `retro`, sin input:

| Medida                                                                | Resultado         |
| --------------------------------------------------------------------- | ----------------- |
| Mutaciones DOM dentro de `.av-player` en 8 s                          | **0**             |
| Heap JS al empezar / al acabar los 8 s                                | 20,1 MB / 18,8 MB |
| FPS FROGGER · ASTEROIDS · SNAKE · ARKANOID · CAÍDA                    | 5 · 5 · 4 · 2 · 7 |
| FROGGER sin efectos CSS de página                                     | 4 fps             |
| FROGGER con el canvas `visibility: hidden` (el motor sigue dibujando) | 45 fps            |

Lectura: en ese entorno (sin GPU) el cuello es pintar/componer el canvas, no React, y la caída
afecta a todos los juegos. Además `emit()` del motor ya sólo llama a los callbacks cuando el
valor cambia. **No invalida la hipótesis en el navegador real de la usuaria**, pero obliga a que
el paso 1 del plan sea medir allí antes de tocar nada, y a que los criterios sean números, no
impresiones.

## Alcance

**Dentro:**

- **Medidor de FPS** activado con `?fps=1` en `/jugar/[id]`: overlay en la esquina inferior
  izquierda de `.crt-screen` con fps medio (ventana 1 s), p95 de frame en ms, nº de frames > 50 ms,
  **nº de renders de `GamePlayer`** y heap JS (`performance.memory` si existe). Publica
  `window.__avFps` para leerlo desde Playwright. Sin el parámetro no se monta ni corre nada.
- **Garantía de avisos sólo en cambio** en FROGGER: `onScore`, `onLives`, `onLevel` y
  `onGameOver` se emiten únicamente cuando el valor cambia (o una vez en `start`/`restart`).
  Nada por frame. Se deja cubierto por un criterio medible (contador de renders).
- **`useState` al mínimo en `GamePlayer`, `useRef` para lo que cambia durante la partida**:
  - `score`, `lives` y `engineLevel` dejan de ser estado: viven en refs y los callbacks del motor
    escriben directamente el `textContent` de los `.v` de sus `hud-stat` (refs a los nodos DOM).
    Cambiar puntos, vidas o nivel **no re-renderiza** `GamePlayer` ni nada debajo.
  - La puntuación final se guarda en el mismo estado que abre el modal:
    `over: number | null` (`null` = jugando) sustituye a `over: boolean`.
  - `saved` + `errorGuardado` se funden en un solo estado `guardado`.
  - Quedan como estado sólo los que cambian lo que React pinta: `paused`, `over`, `guardado`,
    `customName` y la transición `guardando`.
  - La simulación de los juegos en maqueta (el `setInterval` de puntos) usa la misma ref + DOM,
    sin estado.
- **Props estables** hacia `GameCanvas`, `TouchPad` y `Leaderboard` (`useCallback` / refs), y
  `memo` en `Leaderboard`: al pausar/reanudar no se re-renderiza la tabla.
- **Memoria de FROGGER**: localizar y eliminar cualquier crecimiento sostenido del heap durante
  la partida (listeners no retirados, motores no destruidos al recrear por skin/StrictMode,
  asignaciones por frame en `draw`).
- **Quick wins de dibujo en FROGGER sin cambio visual**: cero asignaciones por frame en `draw`
  (arrays literales y mapas elevados a constantes de módulo, clausura `label` del HUD fuera de
  `drawHud`), `font`/`measureText` sólo cuando cambia el texto, y no dibujar mientras está en
  pausa (verificar que se cumple).

**Fuera de alcance (para specs futuras):**

- Motores de ASTEROIDS, CAÍDA, ARKANOID y SNAKE. Si la medición confirma que también caen, spec
  aparte (el medidor ya servirá para ellos). _Nota:_ `GamePlayer` es común, así que el cambio de
  estado a refs les llega a los cinco juegos sin tocar sus motores.
- Arquitectura robusta de dibujo: canvas offscreen, fondo pre-renderizado, caché de sprites,
  dirty-rect rendering.
- Quitar o reducir `shadowBlur` / cambiar el look de cualquier skin.
- Mover el HUD entero al canvas o eliminar el HUD de React.
- Throttle/debounce por tiempo de los callbacks (se sustituye por «sólo en cambio»).
- Efectos CSS de la página (`.av-bg`, `backdrop-filter`, scanlines): medidos sin impacto.
- Cambios en el contrato `GameEngine` / `GameCallbacks` o en `lib/games/registry.ts`.

## Modelo de datos

Sin datos persistentes ni cambios en tipos del contrato. Estado de `GamePlayer`, antes → después:

| Antes (`useState`)       | Después                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| `score`                  | `scoreRef = useRef(0)` + `scoreEl = useRef<HTMLDivElement>(null)` |
| `lives`                  | `livesRef` + `livesEl`                                            |
| `engineLevel`            | `levelRef` + `levelEl`                                            |
| `over: boolean`          | `over: number \| null` (puntuación final o `null`)                |
| `saved`, `errorGuardado` | `guardado: { ok: true } \| { error: string } \| null`             |
| `paused`, `customName`   | sin cambios                                                       |

Tipo nuevo del medidor, en memoria:

```ts
// components/fps-meter.tsx
declare global {
  interface Window {
    __avFps?: {
      fps: number;
      p95: number;
      long50: number;
      renders: number; // renders de GamePlayer desde el montaje
      heapMB: number | null;
      reset: () => void;
    };
  }
}
```

## Plan de implementación

1. **Medidor** — `components/fps-meter.tsx`, montado por `GamePlayer` dentro de `.crt-screen`
   cuando hay `entry` y la URL trae `fps=1` (leído en un efecto con `window.location.search`).
   Bucle rAF propio; buffer circular de 120 frames para el p95. `GamePlayer` incrementa un
   contador en una ref en cada render y el medidor lo lee. Comprobación: overlay visible con
   `?fps=1`, ausente sin él.
2. **Línea base en el navegador real** — la usuaria abre `/jugar/frogger?fps=1` en su Chrome,
   juega 60 s en `clasico`, `neon` y `retro`, y se anota fps / p95 / >50 ms / renders / heap en la
   tabla de resultados. Además, DevTools → Performance (10 s) para ver qué domina: _Scripting_
   (React o motor) o _Rendering/Painting_. Sin cambios de código.
3. **Avisos sólo en cambio** — revisar `emit()`, `start` y `restart` de
   `lib/games/frogger/engine.ts` y `GameCanvas` para que ningún callback se dispare sin cambio de
   valor. Comprobación: 30 s quieta en la salida → `renders` no sube.
4. **Estado a refs** — en `components/game-player.tsx`: refs de valor y de nodo para score,
   vidas y nivel; funciones `pintarScore/pintarVidas/pintarNivel` que actualizan ref y
   `textContent` (formato idéntico: `toLocaleString("es-ES")`, `♥`, `padStart(2)`); `over` con la
   puntuación final; `guardado` unificado; `jugarDeNuevo` resetea refs y DOM. Callbacks hacia
   `GameCanvas` y `onKey` de `TouchPad` estables; `memo` en `Leaderboard`. Comprobación: con React
   DevTools _Highlight updates_, subir una fila no resalta nada; el HUD muestra el valor correcto.
5. **Memoria** — heap snapshot a los 10 s y a los 70 s de partida (con GC forzado antes de cada
   uno), comparar por constructor; también tras 5 cambios de skin. Corregir lo que crezca.
6. **Quick wins de dibujo** — constantes elevadas, `label` fuera de `drawHud`, medida de texto
   cacheada por texto. Comprobación: allocation timeline de 10 s sin asignaciones atribuibles a
   `draw`.
7. **Medir de nuevo** (paso 2) y rellenar **Después**. Si el perfil del paso 2 mostró que domina
   _Rendering/Painting_ y el objetivo no se cumple, anotarlo en **Pendiente** como spec futura de
   arquitectura de dibujo en lugar de ampliar esta.
8. **Cierre** — `npm run lint`, `npm run build`; documentar `?fps=1` en `CLAUDE.md`.

## Resultados

`/jugar/frogger?fps=1`, 60 s de partida con input (flechas cada 700 ms).

**Antes** medido en Chromium headless de Playwright (sin GPU) contra `npm run dev`, por decisión
de la usuaria en lugar de su Chrome. Equipo bajo presión de memoria durante la medida: 3,7 GB de
RAM con 384 MB disponibles, 4,9 GB de swap en uso, carga media ~10,8 en 4 núcleos. Los números
absolutos no son fiables; sirven para comparar Antes/Después en la misma máquina.

**Después** medido igual (headless, `npm run dev`), con carga media ~6 y 5 GB de swap. El `fps` es
el de la última ventana de 0,5 s y varía mucho entre corridas (clasico bajó y neon/retro subieron
sin cambios que los distingan): la comparación fiable es `renders` (7–9 → 4, sólo arranque) y
heap (18–19 → 14 MB). p95 y frames > 50 ms siguen en el mismo orden: el cuello no era React.

¹ Sin perfil de DevTools: con el canvas en `visibility: hidden` (el motor sigue dibujando) la
página sube de 5 a 45 fps, y los renders de `GamePlayer` en 60 s son 7–9. Domina el pintado, no React.

| Skin    | Antes fps / p95 / >50 ms / renders / heap | Después fps / p95 / >50 ms / renders / heap | Qué dominaba (paso 2) | Pendiente                                                                       |
| ------- | ----------------------------------------- | ------------------------------------------- | --------------------- | ------------------------------------------------------------------------------- |
| clasico | 18 / 1116,6 ms / 174 / 9 / 18,4 MB        | 8 / 1283,2 ms / 146 / 4 / 13,7 MB           | Pintado del canvas¹   | No cumple: domina el pintado del canvas → spec futura de arquitectura de dibujo |
| neon    | 11 / 1016,7 ms / 161 / 7 / 18,5 MB        | 21 / 683,2 ms / 183 / 4 / 14,0 MB           | Pintado del canvas¹   | No cumple: domina el pintado del canvas → spec futura de arquitectura de dibujo |
| retro   | 3 / 1131,2 ms / 157 / 8 / 19,4 MB         | 25 / 366,7 ms / 209 / 4 / 14,8 MB           | Pintado del canvas¹   | No cumple: domina el pintado del canvas → spec futura de arquitectura de dibujo |

**Memoria (paso 5)**, headless, `clasico`, heap JS tras GC forzado por CDP: 9,33 MB a los 10 s y
9,36 MB a los 70 s de partida (+0,03 MB). Tras 5 cambios de skin: 9,27 → 9,37 MB, 1 solo
`HTMLCanvasElement` vivo y el canvas con 1 listener `keydown` y 1 `blur` (los motores anteriores se
destruyen). Sin fugas: no hubo nada que corregir.

## Criterios de aceptación

- [ ] `npm run build` y `npm run lint` limpios.
- [ ] `/jugar/frogger?fps=1` muestra el medidor; sin `fps=1` no aparece y `window.__avFps` no existe.
- [ ] Con la rana quieta en la salida 30 s (sin morir, sin puntos, sin pausa): `renders` de
      `GamePlayer` no aumenta.
- [ ] En 60 s de partida con puntos, muertes y subida de nivel: `renders` ≤ nº de pausas/reanudaciones + 2
      (cambiar puntos, vidas o nivel no re-renderiza).
- [ ] `GamePlayer` no tiene `useState` para `score`, `lives` ni nivel; tiene como mucho 4 `useState`
      (`paused`, `over`, `guardado`, `customName`) más `useTransition`.
- [ ] El HUD muestra siempre los mismos valores y formato que antes (puntuación, `♥`, nivel a 2
      cifras) en los 5 juegos con motor y en la maqueta.
- [ ] El modal de fin de partida muestra y guarda la puntuación final correcta; «JUGAR DE NUEVO»
      deja el HUD a 0 / 3 vidas / nivel 01.
- [ ] Pausar/reanudar no re-renderiza `Leaderboard` (React DevTools Profiler).
- [ ] Heap JS tras GC a los 70 s ≤ heap tras GC a los 10 s + 2 MB; tras 5 cambios de skin no quedan
      motores ni canvas retenidos en el snapshot.
- [ ] `draw()` de FROGGER no crea arrays, objetos ni clausuras.
- [ ] Con el juego en pausa no se ejecuta `draw()` (0 llamadas en 5 s).
- [ ] En el Chrome de la usuaria, los 3 skins: p95 ≤ 16,7 ms y 0 frames > 50 ms, **o** la fila tiene
      en **Pendiente** la causa medida (Rendering/Painting) que lo impide.
- [ ] Capturas de FROGGER en los 3 skins sin diferencias visibles respecto a antes.
- [ ] Mecánica idéntica: `git diff` no toca `update`, `moveEntities`, `checkHazards`,
      `resolveLanding` ni constantes de juego.
- [ ] `git diff` de `lib/games/engine.ts`, `lib/games/registry.ts` y de los motores de los otros
      cuatro juegos vacío.
- [ ] Tabla de resultados completa y `CLAUDE.md` documenta `?fps=1`.

## Decisiones

- **Sí:** sólo FROGGER; los otros cuatro motores, a otra spec si hace falta.
- **Sí:** el motor avisa a React **sólo cuando cambia algo** (vidas, puntos, nivel, pausa, fin); sin
  throttle por tiempo, que retrasaría el HUD sin necesidad.
- **Sí:** `useState` al mínimo: sólo lo que cambia la estructura que pinta React (pausa, modal,
  guardado, iniciales). Lo que cambia durante la partida va en `useRef` y se escribe en el DOM.
- **Sí:** el HUD sigue siendo marcado de React (mismo JSX y CSS); sólo cambia quién escribe el
  número. **No** se mueve al canvas.
- **Sí:** el cambio en `GamePlayer` aplica a los 5 juegos (componente común); sus motores no se tocan.
- **No:** `memo` repartido por todo el árbol: si `GamePlayer` no re-renderiza, sobra. Sólo en
  `Leaderboard`, que es lo más pesado y se re-renderizaría al pausar.
- **Sí:** medir primero en el navegador real: la medición headless no reproduce el problema de
  React y apunta al pintado, así que la causa se confirma antes de optimizar.
- **Sí:** medidor por `?fps=1` en `GamePlayer`, con contador de renders, no dentro del motor.
- **Sí:** quick wins de dibujo sin cambio visual; **no** arquitectura robusta (offscreen, sprites,
  dirty-rect) en esta spec.
- **No:** tocar `shadowBlur` ni el look de los skins.
- **No:** efectos CSS de página: desactivarlos no cambió los fps medidos.
- **Sustituye** a la versión anterior de esta spec (5 motores + offscreen + CSS), descartada tras
  las respuestas de clarificación.

## Riesgos

| Riesgo                                                                        | Mitigación                                                                                                                                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| La causa real es el pintado del canvas y no React: la spec no alcanza 60 fps. | Paso 2 lo detecta con el perfil; el criterio admite cerrar con la causa medida y abre spec de arquitectura de dibujo.                                              |
| `memo` con props que cambian de referencia en cada render no evita nada.      | Props estables (`useCallback`, valores primitivos) y comprobación con el Profiler.                                                                                 |
| Escribir `textContent` a mano y que React lo pise en un render posterior.     | Los `.v` de score/vidas/nivel se renderizan vacíos (sin hijos de React) y sólo los escribe la ref; se repintan desde la ref en `useLayoutEffect` tras cada render. |
| El SSR/hidratación pinta el HUD vacío un instante.                            | Valor inicial escrito en el primer `useLayoutEffect`; el motor emite en `start` de todas formas.                                                                   |
| `performance.memory` no existe fuera de Chromium.                             | El medidor muestra `—`; la verificación de memoria se hace con heap snapshots de DevTools.                                                                         |
| StrictMode en dev monta dos motores y confunde la medida de memoria.          | Comparar también con `npm run build && npm start`.                                                                                                                 |
| El contador de renders en una ref altera lo que mide.                         | Incremento O(1) sin estado de React; no provoca renders.                                                                                                           |
