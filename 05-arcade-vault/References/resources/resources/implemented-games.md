# Juegos implementados (Arcade Vault)

Fuente: tabla `games` + vista `game_stats` en Supabase. Consultado 2026-10-19.

| id (slug) | Título | Motor (`lib/games/<slug>/engine.ts`) | Mejor puntuación | Partidas jugadas | Creado |
| --- | --- | --- | --- | --- | --- |
| `asteroids` | ASTEROIDS | Sí | 2910 | 1 | 2026-09-10 |
| `caida` | TETRIS | Sí | 16896 | 1 | 2026-09-12 |
| `arkanoid` | ARKANOID | Sí (con `sprites.ts`) | 50 | 1 | 2026-09-14 |
| `snake` | SNAKE | Sí (con `sprites.ts`) | 110 | 3 | 2026-09-14 |
| `frogger` | FROGGER | Sí | 350 | 2 | 2026-09-25 |

Cada uno tiene fila propia en `games`, leaderboard real en `scores` y aparece en `game_stats`
(vista derivada de `scores`, con `security_invoker`).

## Maquetas eliminadas (2026-10-26)

`gloton`, `invasores` y `duelo-pixel` (sin motor ni fila en `games`) se quitaron de
`lib/games.ts` y sus portadas de `globals.css`; también la categoría `VERSUS`. Para añadir un
juego nuevo, seguir la skill `nuevo-juego`.
