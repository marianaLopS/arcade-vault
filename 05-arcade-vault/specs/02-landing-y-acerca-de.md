# SPEC 02 — Landing y Acerca de

> **Estado:** Aprobado
> **Depende de:** SPEC 01
> **Fecha:** 2026-08-28
> **Objetivo:** Portar el pack `templates/home-about/` a rutas reales, convirtiendo `/` en la landing de Arcade Vault, moviendo la Biblioteca a `/biblioteca` y añadiendo `/acerca`.

---

## Por qué existe esta spec

SPEC 01 dejó cinco pantallas navegables con la Biblioteca en `/`. El pack
`References/resources/resources/templates/home-about/home-about/` añade dos pantallas que
faltan —una landing comercial y una página de Acerca de con formulario de contacto— y trae un
`nav.jsx` actualizado con cuatro enlaces (Inicio, Biblioteca, Salón de la Fama, Acerca de).
Ese nav asume que la portada del sitio es la landing, no la Biblioteca: de ahí la reorganización
de rutas.

El `styles.css` del pack es un superconjunto del `app/globals.css` actual: mismo `:root`, mismas
983 líneas ya portadas, más los bloques de home, about, activity y pricing. Sólo hay que anexar
lo que falta, sin tocar lo existente.

---

## Alcance

**Dentro:**

- Nueva ruta `/` — landing (`home.jsx`): hero con siluetas flotantes, sección "¿POR QUÉ ARCADE
  VAULT?" con 4 tarjetas, rail de 6 juegos, banda de estadísticas, actividad en vivo (ticker +
  top jugadores), precios con FAQ y CTA final.
- Nueva ruta `/acerca` — Acerca de (`about.jsx`): misión, fila de destacados, divisor animado y
  formulario de contacto de maqueta con terminal falsa de éxito.
- Movimiento de la Biblioteca de `/` a `/biblioteca`, con actualización de todos los enlaces que
  apuntaban a `/` como "el vault".
- `Nav` con los cuatro enlaces del pack nuevo, en escritorio y en el panel móvil.
- `lib/home-data.ts`: constantes tipadas de los datos inventados de la landing.
- `lib/use-reveal.ts`: hook compartido del `IntersectionObserver` que añade `.in` a `.reveal`,
  respetando `prefers-reduced-motion`.
- Anexado a `app/globals.css` de los bloques CSS que faltan.

**Fuera de alcance:**

- Envío real del formulario de contacto. No hay backend ni servicio de correo; el botón sólo
  pinta la terminal de éxito, igual que `/acceso` en SPEC 01 no autentica.
- Datos reales en el ticker, el top de jugadores y las estadísticas. Son literales fijos, no
  salen de `av_scores` ni de `seededScores()`.
- Las clases `gp-*`, `dp-*`, `lg-*`, `.screw`, `.rivet`, `.score-pop` y el bloque "Theme
  variants" del `styles.css` del pack (líneas 1151–1620): pertenecen a una plantilla de cabina
  y gamepad que ninguna pantalla de este repositorio usa.
- Cualquier juego jugable. Sigue sin implementarse ninguno.
- El precio `$0` es decorativo; no hay pasarela de pago ni planes.
- `generateMetadata` por ruta más allá del `title`/`description` que ya define el layout.

---

## Modelo de datos

`lib/home-data.ts` — literales de la landing, extraídos de `home.jsx`:

```ts
export type Feature = { icon: "GAMEPAD" | "FREE" | "TROPHY" | "ROCKET"; title: string; desc: string; color: "cyan" | "yellow" | "magenta" | "green" };
export type StatBlock = { n: string; u: string; s: string };
export type TickerRow = { player: string; game: string; score: number; ago: string; color: "cyan" | "magenta" | "yellow" | "green" };
export type TopRow = { rank: number; player: string; score: number };
export type Faq = { q: string; a: string };

export const FEATURES: readonly Feature[];    // 4 tarjetas
export const STATS: readonly StatBlock[];     // 12+ / MILES / GLOBAL
export const TICKER: readonly TickerRow[];    // 7 filas
export const TOP_TODAY: readonly TopRow[];    // 5 filas
export const FAQS: readonly Faq[];            // 3 preguntas
export const PLAN_FEATURES: readonly string[]; // 6 líneas de la tarjeta de precio
```

`about.jsx` sólo introduce estado local del formulario (`{ name, email, msg }`, `sent`,
`shake`); no hay estructura persistida ni clave nueva en `localStorage`. `lib/games.ts` y
`lib/session.tsx` no cambian.

---

## Plan de implementación

1. **CSS.** Anexar a `app/globals.css`, en este orden y sin modificar lo ya existente, los
   bloques del `styles.css` del pack: `HOME PAGE` (líneas 930–1070), `ABOUT PAGE` (1071–1150),
   `ACTIVITY` (1621–1671) y `PRICING` (1672–1744). Se omite el rango 1151–1620.
   Comprobación: el `:root` y las 983 líneas previas quedan intactas y `npm run build` compila.
2. **`lib/use-reveal.ts`** (`"use client"`). Hook que observa `.reveal` con
   `IntersectionObserver` (`threshold: 0.12`), añade `.in` y deja de observar. Si
   `prefers-reduced-motion: reduce`, marca todo como `.in` sin observar.
3. **`lib/home-data.ts`.** Portar los literales con los tipos de arriba.
4. **Mover la Biblioteca.** `app/page.tsx` → `app/biblioteca/page.tsx`, sin cambios de
   contenido. Actualizar los enlaces "volver al vault" de `app/not-found.tsx`,
   `components/game-player.tsx` y `app/acceso/page.tsx` para que apunten a `/biblioteca`.
   Comprobación: `/biblioteca` funciona igual que antes y ningún enlace lleva a `/` esperando
   la rejilla de juegos.
5. **`components/nav.tsx`.** Cuatro enlaces: Inicio (`/`), Biblioteca (`/biblioteca`), Salón de
   la Fama (`/salon`), Acerca de (`/acerca`). Activo de Biblioteca incluye `/juegos/*` y
   `/jugar/*`; Inicio sólo se activa en `/` exacto. Mismos enlaces en el panel móvil, más la
   entrada de sesión. Comprobación: en `/juegos/caida` está activa Biblioteca, no Inicio.
6. **`app/page.tsx` — landing** (`"use client"`, por `useReveal` y el hover del rail). Hero con
   `FloatingSilhouettes` (los 8 SVG de siluetas, `aria-hidden`), eyebrow, título de tres líneas,
   subtítulo y los dos CTA (`/biblioteca` y `/acceso`) como `<Link className="btn xl …">`.
7. **Secciones 01 y 02 de la landing.** Rejilla de features con `FeatureIcon` (los 4 SVG) y rail
   de `MiniCard` con `GAMES.slice(0, 6)`, cada tarjeta enlazando a `/juegos/[id]`, más el botón
   "VER TODOS LOS JUEGOS →".
8. **Bandas de stats y actividad.** `home-stats` con `STATS` y la rejilla de actividad con
   `TICKER` y `TOP_TODAY`; el enlace "VER SALÓN →" apunta a `/salon`. Los números se formatean
   con `toLocaleString("es-ES")`.
9. **Precios y CTA final.** Tarjeta de plan con `PLAN_FEATURES`, columna de `FAQS`, sello
   "FREE PLAY", y bloque final con el botón "INSERTAR MONEDA →" hacia `/biblioteca`.
10. **`app/acerca/page.tsx`** (`"use client"`). Hero de misión, `highlight-row` con los 3
    `HighlightIcon`, divisor animado de 24 píxeles y bloque de contacto: intro con tips y
    formulario controlado. Envío con algún campo vacío dispara `shake` durante 400 ms; envío
    válido sustituye el formulario por la terminal de éxito con el nombre en mayúsculas y el
    botón "ENVIAR OTRO MENSAJE" que lo reinicia.
11. **Repaso final.** `npm run lint` y `npm run build` limpios, y comprobación manual de que
    ninguna ruta de SPEC 01 se rompió al mover la Biblioteca.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/` muestra la landing y `/biblioteca` la rejilla de juegos con buscador y chips.
- [ ] `/acerca` responde y muestra la misión y el formulario de contacto.
- [ ] El nav lista los cuatro enlaces en escritorio y en el panel móvil.
- [ ] En `/` está activo "Inicio"; en `/biblioteca`, `/juegos/caida` y `/jugar/caida` está activo
      "Biblioteca".
- [ ] Ningún enlace del sitio lleva a `/` esperando encontrar la Biblioteca.
- [ ] "▶ EXPLORAR JUEGOS" e "INSERTAR MONEDA →" navegan a `/biblioteca`.
- [ ] "✦ CREAR CUENTA" y "EMPEZAR GRATIS →" navegan a `/acceso`.
- [ ] "VER SALÓN →" navega a `/salon`.
- [ ] El rail muestra exactamente 6 juegos y cada uno navega a su `/juegos/<id>`.
- [ ] Al hacer scroll, las secciones con `.reveal` pasan de invisibles a visibles.
- [ ] Con `prefers-reduced-motion: reduce`, todas las secciones se ven desde el primer render.
- [ ] Enviar el formulario de `/acerca` vacío no muestra la terminal y sacude la tarjeta.
- [ ] Enviar el formulario con los tres campos rellenos muestra la terminal con el nombre en
      mayúsculas.
- [ ] "ENVIAR OTRO MENSAJE" devuelve el formulario con los campos vacíos.
- [ ] A 375 px de ancho la landing no provoca scroll horizontal.
- [ ] `app/globals.css` conserva íntegras sus 983 líneas actuales y sólo añade bloques al final.
- [ ] La consola del navegador no muestra errores de hidratación en `/` ni en `/acerca`.

---

## Decisiones

- **Sí:** landing en `/` y Biblioteca en `/biblioteca`. Es el modelo del `nav.jsx` del pack, que
  distingue "Inicio" de "Biblioteca", y da al sitio una portada real.
- **No:** dejar la landing en `/inicio`. Nadie la vería al abrir el sitio, que es justo lo que
  una landing existe para evitar.
- **Sí:** portar también `about.jsx`. El nav nuevo enlaza "Acerca de"; dejarla fuera obligaría a
  publicar un nav con un enlace muerto o un nav a medias.
- **Sí:** anexar sólo los bloques CSS de home, about, activity y pricing. El resto del
  `styles.css` del pack ya está en `globals.css` con las fuentes adaptadas a `next/font`;
  reemplazar el archivo entero obligaría a re-aplicar a mano `--pixel` y `--mono`.
- **No:** portar las clases de la cabina y el gamepad (`gp-*`, `dp-*`, `lg-*`, `.screw`,
  `.rivet`, `.score-pop`, "Theme variants"). Son ~470 líneas que ninguna pantalla usa.
- **Sí:** datos de la landing en `lib/home-data.ts` tipado. El JSX queda legible y mañana esos
  literales se pueden sustituir por datos reales sin reescribir la maqueta.
- **Sí:** hook compartido `useReveal()`. `home.jsx` y `about.jsx` duplican el mismo observer;
  un hook evita la copia y es el sitio natural para atender `prefers-reduced-motion`.
- **Sí:** formulario de contacto como maqueta. Coherente con SPEC 01, donde `/acceso` tampoco
  valida nada; añadir envío real arrastraría backend y antispam a una spec visual.
- **No:** aviso de "esto es una demo" en el formulario. El template no lo tiene y rompería la
  estética de la terminal.
- **Sí:** `<Link>` en lugar de `<button onClick={navigate}>` donde el template navega. URLs
  reales, prefetch y clic con el botón central, igual que en SPEC 01.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Mover `app/page.tsx` deja enlaces colgando hacia `/` que ya no muestran la Biblioteca. | El paso 4 revisa `not-found.tsx`, `game-player.tsx` y `acceso/page.tsx`, y hay un criterio de aceptación explícito para ello. |
| El `IntersectionObserver` no dispara y las secciones `.reveal` quedan invisibles para siempre. | El hook marca todo como `.in` cuando `prefers-reduced-motion` está activo, y el criterio de aceptación comprueba ambos caminos. |
| Los bloques CSS anexados chocan con selectores ya presentes en `globals.css`. | Los 122 selectores que faltan no existen hoy en `globals.css`; se anexan al final, así que en el peor caso ganan por orden de cascada. |
| El ticker y el top de jugadores parecen datos reales y confunden. | Quedan declarados como literales fijos en el alcance y en `lib/home-data.ts`; ninguna spec futura debe leerlos como fuente de verdad. |
