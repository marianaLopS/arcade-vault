# SPEC 05 — Asteroids: el primer juego real del vault

> **Estado:** Aprobado
> **Depende de:** SPEC 01
> **Fecha:** 2026-09-10
> **Objetivo:** Portar el clon de Asteroids de `References/.../started-games/02-asteroids/` a un motor TypeScript montado sobre un canvas dentro de `/jugar/[id]`, dejando el patrón listo para los juegos siguientes.

---

## Por qué existe esta spec

Arcade Vault presume de ocho juegos y no tiene ninguno. `components/game-player.tsx` es un
contador: un `setInterval` que suma puntos al azar cada 220 ms para poder ver los estados de la
maqueta —en marcha, en pausa, fin de partida—. El marco CRT, el HUD, el modal de fin de partida
y `saveScore()` ya funcionan; lo único que falta detrás es un juego.

En `References/resources/resources/templates/started-games/02-asteroids/` hay uno completo y
probado: 510 líneas de `game.js`, canvas 800×600, sin dependencias ni bundler. No hay que
diseñar un juego, hay que **adaptar uno que ya existe** a React 19 y al App Router, y hacerlo de
forma que los tres que quedan en esa misma carpeta (`03-tetris`, `04-arkanoid`) entren después
por el mismo agujero en vez de por un `if` nuevo.

Ese es el trabajo de esta spec: un contrato `GameEngine`, un registro por `id`, y Asteroids como
su primera implementación.

---

## Alcance

**Dentro:**

- Renombrar la ficha `rocas` a `asteroids` en `lib/games.ts` (`id` y `title`).
- `lib/games/engine.ts`: el contrato `GameEngine` / `GameCallbacks` / `GameFactory`.
- `lib/games/asteroids/engine.ts`: port del `game.js` original a TypeScript, sin variables
  globales de módulo.
- `lib/games/registry.ts`: `GAME_ENGINES` y `getEngine(id)`.
- `components/game-canvas.tsx`: Client Component que monta el canvas, cablea los callbacks,
  gestiona el foco del teclado y destruye el motor al desmontar.
- `components/game-player.tsx`: pinta el canvas real cuando el juego tiene motor, y la
  simulación de siempre cuando no lo tiene.
- Estilos del canvas escalado dentro de `.crt-screen`, en `app/globals.css`.

**Fuera de alcance (para specs futuras):**

- Los otros siete juegos. Siguen con la simulación del contador, sin ningún cambio visible.
- Puntuaciones reales en Supabase. Se guarda con `saveScore()` en `localStorage`, igual que hoy.
  `lib/session.tsx` no se toca ni una línea.
- Rankings, `best` y `plays` reales de `lib/games.ts`. Siguen siendo números inventados.
- Controles táctiles y jugar en móvil. El canvas se escala y se ve, pero se juega con teclado.
- Sonido. El original no tiene, y añadirlo es diseño nuevo, no port.
- OVNIs, que la descripción larga de la ficha promete y el juego original no implementa.
- High score persistente por juego dentro del propio motor.
- Borrar `/debug/supabase`, que es responsabilidad de la spec de autenticación.

---

## Modelo de datos

Esta spec **no crea tablas, ni columnas, ni claves de `localStorage`**. Las estructuras nuevas
son los tipos del contrato del motor, en `lib/games/engine.ts`:

```ts
export type GameCallbacks = {
  onScore: (score: number) => void;
  onLives: (lives: number) => void;
  onLevel: (level: number) => void;
  onGameOver: (finalScore: number) => void;
};

export type GameEngine = {
  start: () => void;
  pause: () => void;
  resume: () => void;
  restart: () => void;
  /** Cancela el requestAnimationFrame y quita los listeners. Idempotente. */
  destroy: () => void;
};

export type GameFactory = (
  canvas: HTMLCanvasElement,
  callbacks: GameCallbacks,
) => GameEngine;
```

Y el registro, en `lib/games/registry.ts`:

```ts
export const GAME_ENGINES: Record<string, GameFactory> = {
  asteroids: createAsteroidsGame,
};
export function getEngine(id: string): GameFactory | undefined;
```

Las claves de `GAME_ENGINES` son los `id` de `GAMES` en `lib/games.ts`. Un juego sin entrada en
el registro es, por definición, un juego que todavía es maqueta.

El estado interno del juego (`ship`, `bullets`, `asteroids`, `particles`, `powerUps`, `score`,
`lives`, `level`, `state`, `deadTimer`) deja de ser un conjunto de `let` de módulo y pasa a vivir
en la clausura de `createAsteroidsGame`. Es la diferencia entre poder abrir dos partidas y no
poder.

---

## Plan de implementación

1. **Renombrar la ficha.** En `lib/games.ts`, la entrada `rocas` pasa a `id: "asteroids"` y
   `title: "ASTEROIDS"`. `short`, `long`, `cat: "SHOOTER"`, `color: "yellow"`, `best`, `plays` y
   `cover: "cover-rocas"` se quedan como están —la clase CSS de `app/globals.css` no se toca—.
   Comprobación: `/juegos/asteroids` y `/jugar/asteroids` responden 200, `/juegos/rocas` da 404,
   y la portada de la biblioteca se ve igual que antes.
2. **`lib/games/engine.ts`.** Los tres tipos de la sección anterior, sin implementación.
   Comprobación: `npm run build` sigue limpio.
3. **`lib/games/asteroids/engine.ts`** — el grueso del trabajo. Port literal de `game.js` con
   estas reglas:
   - Clases `Bullet`, `Asteroid`, `PowerUp`, `Ship` y `Particle` con campos tipados. Cada una
     conserva `update(dt)`, `draw()` y la bandera `dead`.
   - `ctx` y las dimensiones `W = 800` / `H = 600` se capturan en la clausura de la factoría, no
     en el ámbito de módulo. Las clases reciben `ctx` o se declaran dentro de la factoría.
   - Constantes idénticas al original: `RADII = [0,16,30,50]`, `SPEEDS = [0,85,55,32]`,
     `POINTS = [0,100,50,20]`, `POWERUP_DROP_CHANCE = 0.15`, `POWERUP_DURATION = 5`,
     `POWERUP_TTL = 12`, `TRIPLE_SPREAD = 0.18`, rotación `3.5`, empuje `260`, drag `0.987`,
     cadencia `0.2`, invencibilidad `3`, tres vidas, `spawnAsteroids(4)` y `3 + level` después.
     **Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**
   - Helpers `wrap`, `dist`, `rand`, `randInt` tal cual.
   - `dt` capado a `0.05` s, igual que el original.
   - **Se elimina** `drawHUD()`, `drawLifeIcon()`, `drawOverlay()` y la rama
     `if (pressed('Space')) initGame()` del estado `gameover`: HUD y reinicio los pone la
     plataforma.
   - Los cambios de `score`, `lives` y `level` se notifican por callback. Se emiten sólo cuando
     el valor cambia, no en cada frame. Al agotarse la última vida: `onGameOver(score)` y el
     bucle se detiene.
   - `destroy()` hace `cancelAnimationFrame` y quita los listeners, y es seguro llamarlo dos
     veces.
   - `pause()` detiene el bucle y `resume()` lo reanuda poniendo `lastTime = null`, de modo que
     el primer frame tras la pausa tenga `dt = 0` y la nave no salte.
4. **`lib/games/registry.ts`.** `GAME_ENGINES` con la única entrada `asteroids` y `getEngine(id)`.
   Comprobación: `getEngine("caida")` devuelve `undefined`.
5. **`components/game-canvas.tsx`** — Client Component. Recibe `factory`, `paused` y los
   callbacks. En un `useEffect` con `[factory]` crea el motor sobre el `<canvas ref>` con
   `width={800} height={600}`, llama a `start()` y devuelve `destroy()` como limpieza. El canvas
   lleva `tabIndex={0}` y `aria-label`; los listeners de teclado van **en el elemento canvas**,
   no en `window`, y hacen `preventDefault()` sobre `ArrowUp/ArrowDown/ArrowLeft/ArrowRight` y
   `Space` sólo mientras tiene el foco. Se enfoca al montar y al hacer clic. Un `blur` suelta
   todas las teclas para que la nave no se quede girando. El `paused` se propaga con un
   `useEffect` que llama a `pause()` / `resume()`.
6. **`components/game-player.tsx`.** Al principio, `const factory = getEngine(game.id)`.
   - Si hay factoría: se renderiza `<GameCanvas>` dentro de `.crt-screen` en lugar de
     `.game-arena`; `score`, `lives` y `level` pasan a alimentarse de los callbacks; el
     `setInterval` de simulación y el `level` derivado de `PUNTOS_POR_NIVEL` **no se ejecutan**;
     el botón `FIN` deja de forzar el fin y `over` lo dispara `onGameOver`; `restart()` llama
     además a `engine.restart()`.
   - Si no hay factoría: exactamente el comportamiento actual, incluido `PUNTOS_POR_NIVEL`.
   - El HUD, el overlay `EN PAUSA`, el modal `FIN DEL JUEGO`, el campo de iniciales y
     `saveScore({ game: game.id, score, name })` se reusan sin cambios.
   - `P` y `Escape` alternan la pausa; se atienden en el mismo manejador del canvas y no llegan
     al motor.
7. **Estilos.** En `app/globals.css`, la regla del canvas dentro de `.crt-screen`:
   `width: 100%`, `height: auto`, `aspect-ratio: 4 / 3`, `display: block`,
   `image-rendering: pixelated`, `outline` visible al enfocar. Los tokens que hagan falta van al
   bloque `@theme inline`; no hay `tailwind.config.js`.
8. **Repaso final.** `npm run lint` y `npm run build` limpios. Recorrido manual de `/`,
   `/biblioteca`, `/juegos/asteroids`, `/jugar/asteroids` y `/jugar/caida`.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/asteroids` muestra un canvas negro con la nave, no la `.game-arena` de la maqueta.
- [ ] Las flechas rotan y propulsan, y el espacio dispara.
- [ ] Al destruir un asteroide grande, el marcador del HUD sube exactamente 20; el mediano, 50;
      el pequeño, 100.
- [ ] Un asteroide grande se parte en dos medianos, y cada mediano en dos pequeños; los pequeños
      no se parten.
- [ ] Al chocar, las vidas del HUD bajan de 3 a 2 y la nave reaparece en el centro parpadeando.
- [ ] Al limpiar la pantalla, el nivel del HUD sube y aparecen más asteroides que en el anterior.
- [ ] El power-up `3x` aparece como muy tarde a la quinta destrucción, y al recogerlo la nave
      dispara tres balas por vez durante 5 segundos.
- [ ] El botón `PAUSA` congela el juego y muestra el overlay `EN PAUSA`; `REANUDAR` lo reanuda
      sin que la nave dé un salto.
- [ ] `P` y `Escape` hacen lo mismo que el botón.
- [ ] Con el canvas enfocado, las flechas y el espacio no hacen scroll de la página.
- [ ] Con el foco fuera del canvas, las flechas y el espacio vuelven a hacer scroll con normalidad.
- [ ] Al perder la tercera vida se abre el modal `FIN DEL JUEGO` con la puntuación real de la
      partida, no con la del contador.
- [ ] `GUARDAR PUNTUACIÓN` escribe en `av_scores` una entrada con `game: "asteroids"` y la
      puntuación real.
- [ ] `JUGAR DE NUEVO` reinicia la partida a 3 vidas, 0 puntos y nivel 1 sin recargar la página.
- [ ] Navegar de `/jugar/asteroids` a `/biblioteca` y volver no duplica el bucle: el juego no va
      al doble de velocidad y no queda ningún `requestAnimationFrame` vivo.
- [ ] Dejar la pestaña en segundo plano un minuto y volver no teletransporta la nave ni mata al
      jugador.
- [ ] `/jugar/caida` y los otros seis juegos sin motor se comportan exactamente igual que antes.
- [ ] `lib/session.tsx` no ha cambiado ni una línea.
- [ ] `/juegos/asteroids` responde 200 y la portada se ve igual que la de `rocas`.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/asteroids`.

---

## Decisiones

- **Sí:** renombrar `rocas` a `asteroids`. El `id` es el segmento de URL y la clave del registro
  de motores; que la URL diga el nombre del juego que se está portando ahorra una traducción
  mental en cada spec siguiente. `rocas` sólo aparecía en `lib/games.ts`, así que el renombrado
  no arrastra nada.
- **No:** renombrar la clase CSS `cover-rocas`. Es un degradado en `app/globals.css` que ya se ve
  bien; tocarlo es riesgo visual a cambio de nada.
- **No:** reescribir `short` y `long` de la ficha. El texto largo promete OVNIs que el juego no
  tiene, pero corregirlo es una decisión de copy, no del port. Queda anotado.
- **Sí:** portar a TypeScript en lugar de servir `game.js` desde `/public`. Con un `<Script>` el
  juego seguiría escribiendo en `window` y no habría forma limpia de leer el marcador ni de
  parar el bucle al navegar; con un `iframe` habría que inventar un protocolo `postMessage` para
  cuatro números.
- **Sí:** estado en la clausura de la factoría, no en `let` de módulo. Con `let` de módulo, dos
  montajes del componente comparten `score` y `asteroids`, y en desarrollo el StrictMode de React
  monta dos veces.
- **Sí:** registro `GAME_ENGINES` por `id`. Tetris y Arkanoid entran añadiendo una línea; con un
  `if` por juego, `app/jugar/[id]/page.tsx` acaba siendo una cadena de condicionales.
- **Sí:** los siete juegos restantes conservan la simulación. Sustituirla por
  "PRÓXIMAMENTE" apaga siete pantallas que hoy demuestran algo.
- **Sí:** HUD de la plataforma y no `drawHUD()` en el canvas. El marco CRT, la tipografía y el
  modal de fin de partida ya existen; dibujar un segundo HUD en monoespaciada dentro del canvas
  daría dos estéticas en la misma pantalla.
- **Sí:** eliminar el reinicio con Espacio del motor. El modal tiene un campo de iniciales;
  escribir un espacio ahí no puede reiniciar la partida.
- **Sí:** mundo lógico de 800×600 y escalado por CSS. Cambiar `W`/`H` obligaría a revisar radios,
  velocidades, distancia de seguridad de aparición y el `wrap`; el escalado por CSS no toca la
  física.
- **No:** escalar por `devicePixelRatio`. El juego es vectorial en blanco sobre negro y el coste
  es un `resize` observado y un `ctx.scale` que hay que mantener sincronizado con las
  coordenadas.
- **Sí:** listeners en el canvas con `preventDefault` sólo con el foco puesto. Un
  `preventDefault` global sobre las flechas rompe la navegación con teclado del resto de la
  página mientras la pantalla de juego esté montada.
- **Sí:** `pause()` que pone `lastTime = null` al reanudar. Sin eso, el primer `dt` tras la pausa
  vale lo que haya durado la pausa entera.
- **Sí:** `saveScore()` de `localStorage`. La spec de Supabase cambiará dónde se guarda una
  puntuación, no cómo se juega; mezclarlas obligaría a diseñar la tabla `scores` mientras se
  depura la detección de colisiones.
- **Nota de numeración:** la SPEC 04 reservaba el número 05 para la autenticación. Este trabajo
  ocupa el 05 por orden de llegada; la autenticación —y el borrado de `/debug/supabase`— pasan a
  la SPEC 06.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El `requestAnimationFrame` sobrevive a la navegación cliente y el juego corre al doble de velocidad al volver. | `destroy()` cancela el frame y quita los listeners, y es la función de limpieza del `useEffect`. Hay un criterio de aceptación que lo comprueba entrando y saliendo de la pantalla. |
| El StrictMode de desarrollo monta el efecto dos veces y arrancan dos bucles sobre el mismo canvas. | El estado vive en la clausura y `destroy()` es idempotente: el primer montaje se limpia antes de que el segundo arranque. |
| Volver de una pestaña en segundo plano produce un `dt` enorme y la nave atraviesa medio mapa. | `dt` sigue capado a 50 ms como en el original, y `resume()` pone `lastTime = null`. |
| Emitir `onScore` en cada frame provoca un `setState` por frame y 60 renders por segundo. | Los callbacks se emiten sólo cuando el valor cambia. |
| Un `preventDefault` global sobre flechas y espacio deja la página sin scroll ni navegación por teclado. | Los listeners están en el canvas y sólo actúan con el foco puesto; hay un criterio de aceptación para el caso sin foco. |
| El canvas renderizado en servidor provoca un aviso de hidratación. | `components/game-canvas.tsx` es `"use client"` y todo el dibujo ocurre dentro de `useEffect`, nunca durante el render. |
| El hook `strip-blank-lines` deja el motor de ~500 líneas ilegible de un bloque. | Se separan las secciones con comentarios `// ── Nombre ──`, como ya hace el `game.js` original, en vez de con líneas en blanco. |
| Portar "a ojo" cambia una constante y el juego deja de sentirse igual. | El paso 3 lista los valores exactos y declara que cambiarlos queda fuera de esta spec. |

---

## Lo que **no** entra en esta spec

- Tetris, Arkanoid y los otros cinco juegos.
- Puntuaciones, rankings y `best`/`plays` reales en Supabase.
- Controles táctiles, sonido y OVNIs.
- Cambios en `lib/session.tsx`, `av_user` o `av_scores`.
- El borrado de `/debug/supabase`.

Cada una de ellas, si entra, va en su propia spec.
