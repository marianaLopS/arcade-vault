# SPEC 01 — MVP visual: las cinco pantallas de Arcade Vault

> **Estado:** Aprobado
> **Depende de:** —
> **Fecha:** 2026-08-28
> **Objetivo:** Portar las plantillas de `References/resources/resources/templates/` a rutas reales del App Router de Next 16, dejando navegables las cinco pantallas de Arcade Vault sin implementar ningún juego.

---

## Por qué existe esta spec

El repositorio ya tiene el tema visual portado: `app/globals.css` contiene las 200 clases de
`styles.css` (paridad total verificada) y `app/layout.tsx` ya carga `Press_Start_2P` y
`JetBrains_Mono` y pinta las capas `.av-bg` / `.av-noise`. Lo que falta es el árbol de
componentes y rutas: `app/page.tsx` sigue siendo la plantilla de `create-next-app`.

Las plantillas de referencia son React 18 UMD con `window.X = X`, estado de ruta en el hash y
`GAMES` como global. Esta spec traduce ese modelo a rutas reales, TypeScript estricto y
módulos ES, sin tocar el CSS ya portado.

---

## Alcance

**Dentro:**

- Cinco rutas del App Router: `/` (Biblioteca), `/juegos/[id]` (Detalle), `/jugar/[id]`
  (Reproductor), `/salon` (Salón de la Fama), `/acceso` (Auth).
- `Nav` fijo y `footer`, movidos a `app/layout.tsx`, presentes en todas las rutas.
- Menú móvil lateral con backdrop, con la lógica de `nav.jsx`.
- Datos mock tipados en `lib/games.ts`: `GAMES` (8 juegos), `CATS`, `seededScores()`.
- Sesión falsa con React Context + `localStorage` (`av_user`, `av_scores`).
- Simulación de partida en el Reproductor: puntuación auto-incremental, pausa, fin de
  partida y modal de guardado. Es maqueta, no hay juego.
- `app/not-found.tsx` con estética del vault para ids inexistentes.
- Accesibilidad básica: `aria-label` en el botón hamburguesa, cierre del menú móvil con
  `Escape`, foco visible, `<button>` real donde la plantilla usa `<a>` sin `href`.

**Fuera de alcance (para specs futuras):**

- Cualquier juego jugable. Ninguno de los 8 títulos se implementa.
- Backend, base de datos, autenticación real. El formulario de `/acceso` no valida nada.
- Puntuaciones reales o compartidas. Las tablas se generan con `seededScores()`.
- `generateMetadata` por juego y auditoría de responsive más allá de lo que ya resuelve
  `globals.css`. Se descartaron explícitamente en la fase de preguntas.
- El contador `CRÉDITOS · 03` del nav es decorativo y fijo; no hay lógica de créditos.
- Reescritura de los estilos a utilidades de Tailwind.

---

## Modelo de datos

`lib/games.ts` — puerto literal de `data.jsx` a TypeScript:

```ts
export type Cat = "ARCADE" | "PUZZLE" | "SHOOTER" | "VERSUS";

export type Game = {
  id: string;        // "bloque-buster" — también el segmento de URL
  title: string;     // "BLOQUE BUSTER"
  short: string;     // descripción de tarjeta
  long: string;      // descripción de detalle
  cat: Cat;
  cover: string;     // clase CSS: "cover-bricks", "cover-tetro"…
  color: "cyan" | "magenta" | "yellow" | "green";
  best: number;
  plays: string;     // "12.4K"
};

export type ScoreRow = { rank: number; name: string; score: number; date: string };

export const GAMES: Game[];              // los 8 juegos de data.jsx, sin cambios
export const CATS: readonly string[];    // ["TODOS", "ARCADE", "PUZZLE", "SHOOTER", "VERSUS"]
export function seededScores(seed: number, count?: number): ScoreRow[];
```

`seededScores` conserva el LCG de `data.jsx` (`s = (s * 9301 + 49297) % 233280`). Es
determinista: la misma semilla da la misma tabla en servidor y en cliente, así que no hay
desajuste de hidratación. Las semillas también se conservan: `id.length * 17 + 3` en el
detalle (10 filas) y `id.length * 23 + 7` en el salón (12 filas).

`lib/session.tsx` — sesión falsa:

```ts
export type User = { name: string };                     // "PX_KAI", máx. 10 caracteres
export type SavedScore = { game: string; score: number; name: string; at: number };

// Contexto expuesto por useSession()
{ user: User | null; signIn(u: User): void; signOut(): void; saveScore(e: Omit<SavedScore, "at">): void }
```

Claves de `localStorage`, iguales a las de la plantilla: `av_user` (un `User`) y `av_scores`
(un `SavedScore[]`). La lectura inicial ocurre en `useEffect`, no en el inicializador de
`useState`, para que el primer render del servidor y el del cliente coincidan.

---

## Plan de implementación

1. **`lib/games.ts`.** Portar `GAMES`, `CATS` y `seededScores` con los tipos de arriba.
   Comprobación: `npm run lint` pasa y `npm run build` compila.
2. **`lib/session.tsx`.** `SessionProvider` cliente y hook `useSession()`, con lectura de
   `localStorage` en `useEffect` y escritura en `signIn` / `signOut` / `saveScore`.
   Todo acceso a `localStorage` va envuelto en `try/catch`.
3. **`components/nav.tsx`** (`"use client"`). Puerto de `nav.jsx`: logo, enlaces con `<Link>`,
   estado activo derivado de `usePathname()` (`/juegos/*` y `/jugar/*` marcan Biblioteca),
   contador de créditos, botón de sesión desde `useSession()`, panel móvil con backdrop,
   `aria-label` en el hamburguesa y cierre con `Escape`.
4. **`app/layout.tsx`.** Envolver `children` en `<SessionProvider>`, insertar `<Nav />`,
   `<main className="av-main">` y el `<footer>` de `app.jsx`. Comprobación: el nav se ve en
   todas las rutas y el menú móvil abre y cierra.
5. **`app/page.tsx` — Biblioteca** (`"use client"`, por buscador y filtro). Hero, buscador,
   chips de categoría, grid y `GameCard` con el efecto tilt de `biblioteca.jsx`, más el
   estado vacío "NO HAY RESULTADOS". Cada tarjeta enlaza a `/juegos/[id]`.
6. **`app/juegos/[id]/page.tsx` — Detalle** (Server Component). Portada, etiquetas,
   descripción larga, `stat-strip`, acciones y tabla lateral de 10 puntuaciones. Si el id no
   está en `GAMES`, `notFound()`. `params` se resuelve con `await` (Next 16). Los botones que
   navegan son `<Link>` con clase `btn`.
7. **`app/not-found.tsx`.** Pantalla "GAME OVER · 404 · CARTUCHO NO ENCONTRADO" con las
   clases del tema y un enlace de vuelta a `/`.
8. **`app/jugar/[id]/page.tsx` — Reproductor.** Página servidor que valida el id y delega en
   `components/game-player.tsx` (`"use client"`): HUD, marco CRT con arena animada, overlay de
   pausa. Sin modal todavía. Comprobación: la puntuación sube, PAUSA la detiene.
9. **Modal de fin de partida** en `game-player.tsx`: puntuación final, input de iniciales
   (mayúsculas, 10 caracteres), `saveScore()`, mensaje "PUNTUACIÓN GUARDADA_" y botones de
   reinicio y vuelta al vault.
10. **`app/salon/page.tsx` — Salón de la Fama** (`"use client"`, por las pestañas). Cabecera,
    pestañas por juego, podio de tres puestos, tabla de 12 filas con retardo de animación
    escalonado y bloque "TU MEJOR MARCA" visible sólo si hay usuario.
11. **`app/acceso/page.tsx` — Auth** (`"use client"`). Tarjeta con pestañas Iniciar Sesión /
    Crear Cuenta, campos (el de correo sólo en Crear Cuenta), envío que llama a `signIn` con
    el usuario en mayúsculas —`PLAYER1` si está vacío— y navega a `/`, botón de invitado que
    navega a `/` sin crear sesión, separador y botones sociales inertes.
12. **Limpieza.** Borrar de `public/` los SVG del scaffold que ya no se usan y comprobar que
    no queda ninguna referencia a la plantilla de `create-next-app`.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] Las cinco rutas responden: `/`, `/juegos/caida`, `/jugar/caida`, `/salon`, `/acceso`.
- [ ] El nav y el footer aparecen en las cinco rutas.
- [ ] En `/juegos/caida` el enlace "Biblioteca" del nav está marcado como activo.
- [ ] Escribir "cai" en el buscador de `/` deja una sola tarjeta visible.
- [ ] Pulsar el chip "PUZZLE" deja visibles sólo los juegos de esa categoría.
- [ ] Una búsqueda sin resultados muestra el bloque "NO HAY RESULTADOS".
- [ ] Hacer clic en una tarjeta navega a `/juegos/<id>` de ese juego.
- [ ] `/juegos/inexistente` y `/jugar/inexistente` muestran la pantalla 404 del vault.
- [ ] El detalle de un juego lista 10 puntuaciones y las tres primeras filas están destacadas.
- [ ] En `/jugar/caida` la puntuación aumenta sola y se detiene al pulsar PAUSA.
- [ ] Con la partida en pausa se ve el overlay "EN PAUSA".
- [ ] Pulsar FIN abre el modal con la puntuación final.
- [ ] Guardar en el modal muestra "PUNTUACIÓN GUARDADA_" y añade una entrada a `av_scores`.
- [ ] "JUGAR DE NUEVO" reinicia puntuación a 0, vidas a 3 y nivel a 01, y cierra el modal.
- [ ] En `/salon` cambiar de pestaña cambia el podio y las 12 filas de la tabla.
- [ ] Sin sesión, `/salon` no muestra el bloque "TU MEJOR MARCA".
- [ ] Enviar el formulario de `/acceso` con "px_kai" navega a `/` y el nav muestra "PX_KAI ▾".
- [ ] Recargar la página tras iniciar sesión mantiene el nombre en el nav.
- [ ] Pulsar el nombre en el nav cierra la sesión y devuelve el botón "Iniciar Sesión".
- [ ] "JUGAR COMO INVITADO" navega a `/` y el nav sigue mostrando "Iniciar Sesión".
- [ ] En `/acceso`, la pestaña "CREAR CUENTA" añade el campo de correo electrónico.
- [ ] A 375 px de ancho aparece el botón hamburguesa y abre el panel lateral.
- [ ] El panel móvil se cierra con `Escape` y al pulsar el backdrop.
- [ ] La consola del navegador no muestra errores de hidratación en ninguna ruta.
- [ ] `app/globals.css` no tiene cambios respecto a su estado actual.

---

## Decisiones

- **Sí:** rutas reales del App Router en vez del estado `route` con hash de `app.jsx`. Da URLs
  compartibles y permite que Detalle sea Server Component.
- **No:** replicar la SPA de una sola página. Desperdiciaría el App Router y obligaría a que
  todo fuese cliente.
- **Sí:** reutilizar las clases CSS ya portadas en `app/globals.css`. La paridad con
  `styles.css` está verificada; los componentes sólo aplican `className`.
- **No:** traducir las 980 líneas de CSS a utilidades de Tailwind. Trabajo grande con riesgo de
  perder animaciones, pseudoelementos y máscaras del CRT.
- **Sí:** mantener la simulación de partida del reproductor. Sin ella no se pueden ver los
  estados de pausa, fin de partida y guardado, que son parte de la maqueta.
- **No:** confundir la simulación con un juego. No hay bucle de render, física ni entrada de
  teclado; el contador es un `setInterval`.
- **Sí:** Context + `localStorage` para la sesión falsa. La persistencia entre recargas es lo
  que da sentido al bloque "TU MEJOR MARCA" del salón.
- **Sí:** leer `localStorage` en `useEffect` y no en el inicializador de `useState`. Evita el
  desajuste de hidratación que provoca el patrón de `app.jsx`.
- **Sí:** invitado equivale a no tener sesión, como en `auth.jsx` (`onLogin(null)`).
- **Sí:** `notFound()` con `app/not-found.tsx` propio. Redirigir a `/` escondería el error.
- **Sí:** accesibilidad básica como único extra sobre las plantillas. El usuario pidió a la vez
  "accesibilidad básica" y "nada extra"; se interpreta que la accesibilidad entra y que
  `generateMetadata` por juego y la auditoría de responsive quedan fuera.
- **No:** framework de tests. El repositorio no tiene ninguno y esta spec no lo introduce.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Desajuste de hidratación al leer `localStorage` durante el render | Toda lectura ocurre en `useEffect`; el primer render siempre asume `user = null`. |
| `localStorage` deshabilitado (modo privado) | Lecturas y escrituras dentro de `try/catch`; la app funciona, simplemente no persiste. |
| `params` de rutas dinámicas cambió en Next 16 | Consultar `node_modules/next/dist/docs/` antes de escribir las rutas dinámicas, según `AGENTS.md`. |
| Tocar `app/globals.css` y romper la paridad con la plantilla | El CSS no se modifica en esta spec; hay un criterio de aceptación que lo verifica. |
| El efecto tilt de las tarjetas escribe `style.transform` directo en el DOM | Se conserva vía `ref`, sin estado de React, tal como en `biblioteca.jsx`. |

---

## Lo que **no** entra en esta spec

- Ningún juego jugable: ni Bloque Buster, ni Caída, ni ninguno de los otros seis.
- Backend, base de datos y autenticación real.
- Puntuaciones reales, compartidas o persistidas fuera del navegador.
- Sistema de créditos funcional.
- Reescritura de los estilos a Tailwind.
- `generateMetadata` por juego y auditoría de responsive.

Cada uno de esos puntos, si llega, va en su propia spec.
