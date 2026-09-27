# Juegos implementados (Arcade Vault)

Fuente: tabla `games` + vista `game_stats` en Supabase. Consultado 2026-09-21.

| id (slug) | Título | Motor (`lib/games/<slug>/engine.ts`) | Mejor puntuación | Partidas jugadas | Creado |
| --- | --- | --- | --- | --- | --- |
| `asteroids` | ASTEROIDS | Sí | 2910 | 1 | 2026-09-10 |
| `caida` | TETRIS | Sí | 16896 | 1 | 2026-09-12 |
| `arkanoid` | ARKANOID | Sí (con `sprites.ts`) | 50 | 1 | 2026-09-14 |
| `snake` | SNAKE | Sí (con `sprites.ts`) | 110 | 2 | 2026-09-14 |

Cada uno tiene fila propia en `games`, leaderboard real en `scores` y aparece en `game_stats`
(vista derivada de `scores`, con `security_invoker`).

## Pendientes (modo maqueta)

Estos siguen sin motor propio ni fila en `games`; pintan `seededScores()` de `lib/games.ts`
en vez de datos reales:

- `gloton`
- `invasores`
- `ranaria`
- `duelo-pixel`

Para portar uno de estos a juego real, seguir la skill `nuevo-juego` del repo (spec primero,
luego motor, catálogo, CSS, registro, migración y leaderboard).
