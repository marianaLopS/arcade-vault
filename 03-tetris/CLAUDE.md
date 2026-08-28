# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Idioma

Responder siempre en español, en todas las interacciones de este proyecto (explicaciones, resúmenes, preguntas, mensajes de commit). El código y los identificadores siguen en inglés; la UI y los textos visibles al usuario, en español.

## Project

Vanilla-JS Tetris (HTML5 Canvas). No dependencies, no package.json, no build step, no tests, no linter. Three source files: `index.html`, `style.css`, `game.js`. UI text is Spanish.

## Running

Open `index.html` directly, or serve statically:

```bash
python3 -m http.server 8000   # then http://localhost:8000
```

## Architecture (`game.js`)

Single-file, module-less script with **top-level mutable globals** (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `dropAccum`, `animId`). DOM elements are resolved once at load; the script runs `init()` at the bottom, so it must stay the last element in `<body>`.

- **Board**: `ROWS × COLS` array of ints — `0` empty, `1–7` = piece type, which indexes both `COLORS` and `PIECES`. The same integer is the color key, so piece type and color are inseparable.
- **Pieces**: square matrices in `PIECES`; rotation (`rotateCW`) builds a new transposed/reversed matrix. `tryRotate` applies basic wall kicks (offsets `0, -1, 1, -2, 2`) — not SRS.
- **Loop**: `requestAnimationFrame` accumulator (`dropAccum` vs `dropInterval`). Pause cancels the frame; resume resets `lastTime` before re-entering `loop` to avoid a large `dt` spike. `init()` cancels `animId` before starting to prevent double loops on restart.
- **Locking**: `lockPiece()` → `merge()` → `clearLines()` → `spawn()`. `spawn()` promotes `next` to `current` and calls `endGame()` if the new piece collides immediately.
- **Scoring**: `LINE_SCORES[cleared] * level`; hard drop +2/cell, soft drop +1/row. Level = `floor(lines/10)+1`, speed = `max(100, 1000 - (level-1)*90)`.
- **Rendering**: everything redraws each frame — grid, board, ghost (`ghostY()` at `alpha 0.2`), then current piece. `drawNext()` is only called on spawn, on its own canvas.

## Gotchas

- Canvas dimensions are hardcoded in `index.html` (`300×600`). Changing `COLS`, `ROWS`, or `BLOCK` in `game.js` requires updating them to `COLS*BLOCK × ROWS*BLOCK`.
- Keyboard handling is one `keydown` listener; `P` is checked before the `paused || gameOver` guard so pause always works.
