# SPEC 12 — Apariencia del mando táctil: Gamepad MK-II

> **Estado:** Aprobado
> **Depende de:** SPEC 11
> **Fecha:** 2026-09-24
> **Objetivo:** Redibujar el mando táctil de SPEC 11 con la apariencia del Gamepad MK-II de `gamepad-assets` (carcasa, cruceta de teclas sueltas con gema central y botones A/B neón), sin cambiar su comportamiento ni su layout.

## Por qué existe esta spec

SPEC 11 dejó un mando funcional con estética propia. Hay una referencia visual cerrada (MK-II,
`gamepad.html`) y se quiere que el mando se vea como ella. Es un cambio **sólo visual**: la
lógica de `TouchPad` (captura de puntero, repetición, vibración, `disabled`) no se toca.

## Alcance

**Dentro:**

- Carcasa `.touch-pad` al estilo `.gp`: gradiente `#1c1c28 → #0c0c14`, borde `--line`, radio 16px,
  filo interior (`::before`), trama de puntos (`::after`) y resplandor cian inferior.
- Cruceta al estilo `.gp-dpad`: 4 teclas sueltas de 48px, radio 8px, gradiente oscuro, sombra de
  tecla `0 4px 0 #050507`, flecha SVG (triángulo) en `--ink-dim`; centro `.dp-hub` con gema cian
  romboidal que late (`pulse-led`).
- Estado pulsado de la cruceta (`[data-on]`): baja 3px, borde y flecha cian con glow, como `.dp.on`.
- Botones A/B al estilo `.ab`: círculos de 64px, borde 2px del color, relleno radial con brillo,
  letra en `--pixel` blanca con glow; A magenta, B cian. Anillo discontinuo `.ab-ring` visible al
  pulsar; pulsado baja 4px y escala 0.97 con glow más intenso.
- Se mantiene la **disposición diagonal** actual (B abajo-izquierda, A arriba-derecha) y el
  **rótulo** de función bajo cada botón, con el color del botón.
- Marcado de `components/touch-pad.tsx`: flechas SVG en vez de glifos, `<div class="touch-hub">`
  con gema, `<span class="touch-ring">` dentro de A/B. Sólo JSX de presentación.
- `prefers-reduced-motion`: sin transiciones ni pulso de la gema.

**Fuera de alcance (para specs futuras):**

- Cambios de comportamiento de `TouchPad` o de `GamePlayer` (eventos, repetición, vibración).
- Mostrar el mando en escritorio o reflejar el teclado físico en él (el `keydown` de la referencia).
- Estados `:hover` de la referencia (no aplican con puntero grueso).
- Fondo de página `.page` de la referencia y sus fuentes: el sitio ya carga `--pixel`.
- Disposición horizontal de A/B de la referencia.
- Variantes del mando por skin (`neon`/`retro`).
- Cambios en el layout táctil (`--t-pad`, HUD, CRT) de SPEC 11.

## Modelo de datos

Sin datos nuevos: ni tipos, ni tablas, ni cambios en `TouchControls`.

## Plan de implementación

1. **Marcado** (`components/touch-pad.tsx`): `DPAD` pasa de `glyph` a un `path` SVG
   (`viewBox 0 0 24 24`, triángulos de la referencia); la cruceta añade
   `<div className="touch-hub" aria-hidden><span className="touch-gem" /></div>`; A/B añaden
   `<span className="touch-ring" aria-hidden />`. Comprobación: build limpio, mando funciona igual.
2. **Carcasa** (`app/globals.css`, bloque `===== mando táctil (SPEC 11) =====`): sustituir fondo,
   borde, radio y sombras de `.touch-pad` y añadir `::before` / `::after`. Mantener `display: none`
   fuera de `pointer: coarse`, `touch-action`, `user-select` y `[data-disabled] { opacity: .4 }`.
3. **Cruceta**: `.touch-dpad` pasa de cruz de una pieza (`::before` + `clip-path`) a rejilla 3×3 de
   48px con teclas separadas por 1–3px y el hub en `2 / 2`; `.touch-dir` y `.touch-dir[data-on]`
   con los estilos de `.dp` / `.dp.on`. Se conserva el centrado sin botones (Snake).
4. **Botones A/B**: `.touch-ab` con los estilos de `.ab` a 64px; `--c` / `--c-rgb` por botón para
   borde, relleno y glow; `.touch-ring`; `.touch-ab[data-on]`. Diagonal y `.touch-label` se quedan,
   revisando que entren en `--t-pad: 172px`.
5. **Movimiento reducido** y repaso: `npm run lint`, `npm run build`, recorrido en móvil.

## Criterios de aceptación

- [ ] `npm run build` y `npm run lint` limpios.
- [ ] `git diff` de `lib/games/**`, `components/game-player.tsx` y `components/game-canvas.tsx` vacío.
- [ ] En `components/touch-pad.tsx` sólo cambia JSX de presentación: handlers, `Held`, constantes y
      props idénticos.
- [ ] En táctil vertical, `/jugar/asteroids` se ve como `gamepad-neon.png`: carcasa con borde cian
      y trama, cruceta de 4 teclas sueltas con gema central que late, B cian y A magenta con glow.
- [ ] A/B siguen en diagonal (A más alta) con su rótulo debajo en el color del botón.
- [ ] Teclas de cruceta ≥ 48px y A/B de 64px.
- [ ] Al pulsar, la tecla/botón baja y brilla; al soltar vuelve.
- [ ] `/jugar/snake`: sólo cruceta, centrada.
- [ ] En pausa el mando se ve atenuado (opacidad 0.4).
- [ ] HUD + canvas + mando siguen cabiendo sin scroll en 390×844.
- [ ] En escritorio no aparece el mando y nada cambia.
- [ ] Con `prefers-reduced-motion: reduce` la gema no late y no hay transiciones.

## Decisiones

- **Sí:** sólo apariencia; comportamiento y layout de SPEC 11 intactos.
- **Sí:** rótulos de función bajo A/B (SPEC 11), aunque la referencia no los tenga.
- **Sí:** disposición diagonal actual de A/B; **no** la horizontal de la referencia.
- **Sí:** cruceta 48px (mínimo de SPEC 11) en vez de los 46px de la referencia; A/B 64px como ella.
- **Sí:** sólo táctil (`pointer: coarse`); **no** mando en escritorio.
- **Sí:** flechas SVG inline como en la referencia, en vez de glifos de texto.
- **No:** `:hover` ni reflejo del teclado físico.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| A/B de 64px en diagonal + rótulo no caben en `--t-pad: 172px`. | Medir en 390×844; si no cabe, reducir el desplazamiento vertical de A antes que el tamaño. |
| `transform` al pulsar mueve el área de toque y suelta el puntero. | `setPointerCapture` ya retiene el puntero; `lostpointercapture` suelta limpio. |
| Glow y trama cuestan rendimiento en móviles modestos. | Sombras estáticas; la única animación es la gema (opacity/transform). |
| El `::before`/`::after` de la carcasa capta toques. | `pointer-events: none` en ambos. |
