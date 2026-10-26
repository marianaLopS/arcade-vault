# SPEC 17 — Fluidez y bugs de ARKANOID

> **Estado:** Implementado
> **Depende de:** SPEC 09, SPEC 13
> **Fecha:** 2026-10-26
> **Objetivo:** Que ARKANOID se juegue sin tirones ni pausas de principio a fin y sin el lanzamiento fantasma de la bola, sin cambiar mecánica ni aspecto.

## Por qué existe esta spec

Síntoma reportado: **el juego no es fluido durante toda la partida, con varias pausas**, y
presenta bugs. SPEC 13 (checklist C1–C8) ya quitó clausuras y `ctx.font` por frame, pero dejó
pendiente el coste real de pintado (H1) y el `shadowBlur` de `neon`.

Causas encontradas en `lib/games/arkanoid/engine.ts`:

1. **Spritesheet en CPU.** El canvas fuera de pantalla del sheet se creaba con
   `willReadFrequently: true` en `neon`/`retro` (lo necesita `recolorSheet`), lo que lo deja sin
   aceleración: cada `drawImage` (≈60 bloques + pala + bola + explosiones por frame) volvía a
   subir la textura a la GPU.
2. **`shadowBlur` por bloque** en `neon`: ~60 desenfoques por frame sobre bloques estáticos.
3. **`HTMLAudioElement` para efectos**: `currentTime = 0` + `play()` en cada rebote y rotura
   provoca picos en el hilo principal justo al golpear.
4. **dt capado a 50 ms sin subpasos**: un frame lento ralentiza el juego entero (se percibe como
   pausa) y la física avanza a saltos.
5. **Bug del Espacio fantasma**: `pressed("Space")` sólo se consumía con la bola pegada. Pulsar
   Espacio con la bola en vuelo dejaba el flag armado y, al perder una vida o cambiar de nivel,
   la bola salía disparada sola.

## Alcance

**Dentro** (sólo `lib/games/arkanoid/engine.ts`):

- Tras recolorear, el sheet se copia a un canvas normal (acelerado) y ése es el que se dibuja.
- **Capa de bloques cacheada**: un canvas fuera de pantalla con los bloques vivos (glow incluido)
  que sólo se repinta cuando un bloque cambia (golpe a gris, rotura, nivel nuevo, sheet cargado).
  `draw()` la copia con un `drawImage`.
- **Web Audio**: los dos mp3 se decodifican una vez a `AudioBuffer`; cada sonido es un
  `AudioBufferSourceNode` con ganancia 0,5, máximo `SOUND_POOL` (4) voces por sonido. Mute con M,
  pausa corta las voces, `destroy()` cierra el `AudioContext`.
- **Subpasos fijos** de ≤ 1/120 s para pala, bola y explosiones; `DT_MAX` sube a 0,1 s. La
  entrada (M, Espacio, ratón) se lee una vez por frame.
- El Espacio se consume en cada frame: sólo lanza si la bola está pegada en ese momento.
- `blocks.filter` sólo cuando se ha roto algún bloque.

**Fuera:** física (velocidades, ángulo fijo de lanzamiento, reflexión simple en la pala, un
bloque por paso), niveles, puntuación, vidas por nivel, skins y su aspecto, contrato
`GameEngine`, registry, `GamePlayer`.

## Criterios de aceptación

- `npm run lint` y `npm run build` pasan.
- `/jugar/arkanoid?fps=1` en los tres skins: frames > 50 ms y p95 no peores que antes; mejora
  clara en `neon`/`retro` (medidas en `References/resources/resources/performance-status.md`).
- Capturas de `clasico`, `neon` y `retro` sin diferencia visible.
- Pulsar Espacio con la bola en vuelo y perderla: la bola queda pegada a la pala.
- Rebote y rotura suenan; M silencia; pausar corta el sonido; sin errores en consola.
