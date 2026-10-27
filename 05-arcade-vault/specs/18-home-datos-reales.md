# SPEC 18 — Home con datos reales

> **Estado:** Implementado
> **Depende de:** SPEC 02, SPEC 15
> **Fecha:** 2026-10-26
> **Objetivo:** Que la banda de estadísticas y la sección "ACTIVIDAD EN VIVO" de la home dejen de mostrar datos de maqueta y lean lo que hay en Supabase.

## Por qué existe esta spec

La home seguía pintando literales de `lib/home-data.ts` heredados de la maqueta:

1. **`12+ JUEGOS`**: el catálogo tiene 5 juegos.
2. **`MILES DE PARTIDAS`**: la tabla `scores` tiene unas decenas de filas.
3. **`ÚLTIMAS PUNTUACIONES`** y **`TOP JUGADORES · HOY`**: jugadores inventados y juegos que ya no
   existen (Glotón, Invasores, Rocas…).

## Alcance

**Dentro:**

- Banda de estadísticas:
  - `TODAS` / `LAS EDADES` / `APTO PARA TODA LA FAMILIA` en lugar de `12+ JUEGOS` (decisión de producto: sin edad mínima concreta).
  - Número real de partidas (`count` de `scores`) / `PARTIDAS` / `GUARDADAS EN EL RANKING`.
  - `GLOBAL` / `RANKING` sin cambios.
- `ÚLTIMAS PUNTUACIONES`: las 7 puntuaciones más recientes (jugador, título del juego del
  catálogo, puntos, "hace X").
- `CAMPEONES · POR JUEGO` en lugar de `TOP JUGADORES · HOY`: el récord de cada juego (una fila
  por juego con puntuación, en el orden de `GAMES`). No se mezclan puntuaciones de juegos
  distintos porque sus escalas no son comparables.
- Lecturas nuevas en `lib/scores.ts`: `recentScores(limit)` y `totalPlays()`, con la misma regla
  que el resto: ante un error devuelven el caso vacío y lo registran en consola. Los campeones
  reutilizan `topScores(id, 1)`.
- `app/page.tsx` pasa a Server Component (`async`); el efecto `.reveal` se monta con
  `components/reveal.tsx`.
- Se eliminan `STATS`, `TICKER`, `TOP_TODAY` y sus tipos de `lib/home-data.ts`.

**Fuera:** cambios de esquema, políticas o migraciones; rankings por cuenta; tiempo real
(suscripciones de Supabase).

## Criterios de aceptación

- [ ] La banda muestra `TODAS LAS EDADES` y el mismo número de partidas que `select count(*) from scores`.
- [ ] El ticker coincide con las 7 últimas filas de `scores` por `created_at`, y sólo nombra juegos del catálogo.
- [ ] La tabla de campeones tiene una fila por juego con puntuación, y cada puntuación es el `max(score)` de ese juego.
- [ ] Sin puntuaciones, ticker y campeones muestran un estado vacío legible en vez de romper.
- [ ] Las secciones `.reveal` se siguen revelando.
- [ ] `npm run lint` y `npm run build` pasan; `/` es dinámica.
