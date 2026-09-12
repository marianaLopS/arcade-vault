# Port guide — from `game.js` to `GameFactory`

Reference material for `/nuevo-juego`. Read it before Phase 2 (the source inventory), reuse its
constants and risks when writing the spec in Phase 3, and keep it open during Phase 6 (the port).

---

## 1. The contract

`lib/games/engine.ts` — three types, no implementation. The engine knows nothing about React:
it draws on a canvas and reports by callback.

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
  /** Cancels the requestAnimationFrame and removes the listeners. Idempotent. */
  destroy: () => void;
};
export type GameFactory = (canvas: HTMLCanvasElement, callbacks: GameCallbacks) => GameEngine;
```

What each method has to mean in practice:

| Method | Contract |
| --- | --- |
| `start` | Enters the loop. Called once, from the mount effect, right after the factory returns. The first frame is already drawn by then. |
| `pause` | Cancels the frame and nothing else. State is untouched. Called whenever the platform pauses — the `PAUSA` button, `P`, `Escape`, and also when the game-over modal opens. |
| `resume` | Re-enters the loop with `lastTime = null`, so the first `dt` after the pause is 0. Must be a no-op once the game is over. |
| `restart` | Stops the loop, releases held keys, re-initializes state, starts again. Same canvas, no remount. It backs `JUGAR DE NUEVO`. |
| `destroy` | The `useEffect` cleanup. Cancels the frame, removes every listener, cancels pending asset loads. Safe to call twice. |

What the callbacks mean: `onScore`, `onLives` and `onLevel` feed the platform HUD and fire
**only on change**. `onGameOver(finalScore)` fires exactly once, after the loop has stopped;
it opens the `FIN DEL JUEGO` modal with the real score.

A game with no `lives` still has to report something coherent — Tetris has one life and calls
`onLives(1)` once, so the HUD does not show `—` forever.

---

## 2. Anatomy of the reference port

`lib/games/asteroids/engine.ts`, 748 lines, one export. Its section banners are the skeleton to
copy:

```
// ── Mundo ──        W = 800, H = 600. The logical world. CSS only stretches pixels.
// ── Utils ──        wrap, dist, rand, randInt — copied from the original.
// ── Constantes ──   Every tunable, with its unit in a trailing comment.
// ── Bullet ──       }
// ── Asteroid ──     } Entity classes: module-level, but holding no game state.
// ── PowerUp ──      } Each has update(dt, …), draw(ctx, …) and a `dead` flag.
// ── Ship ──         } Anything the original read from a global arrives as a parameter.
// ── Partículas ──   }
// ── Motor ──        The factory. Everything mutable lives here.
```

Inside `Motor`, in order:

1. `const ctx2d = canvas.getContext("2d")`, throw if null, then re-annotate
   `const ctx: CanvasRenderingContext2D = ctx2d` — the narrowing is lost inside the closures
   below. Set `canvas.width` / `canvas.height` from the world constants.
2. Game state as closure `let`s: entity arrays, `score` / `lives` / `level`, timers, a
   `state: "playing" | "dead" | "gameover"` discriminant.
3. Loop state: `rafId`, `lastTime`, `destroyed`.
4. Input state: `keys`, `justPressed`, and a `pressed(code)` helper that consumes the edge.
5. The emit block:
   ```ts
   let lastScore = -1, lastLives = -1, lastLevel = -1;
   function emit() { /* fires each callback only when its value moved */ }
   ```
   `emit()` runs at the end of `initGame()` and once per frame at the end of `loop()`.
6. `initGame`, plus the game's own lifecycle helpers (`spawnAsteroids`, `nextLevel`, `explode`,
   `killShip`).
7. `update(dt)`, branching on `state`.
8. `draw()`: clear to black, then layer back to front.
9. `loop(ts)` with `const dt = Math.min((ts - lastTime) / 1000, 0.05)`; `stopLoop()`;
   `startLoop()` guarded by `destroyed || rafId !== null || state === "gameover"` and resetting
   `lastTime = null`.
10. `onKeyDown` / `onKeyUp` filtered through a `GAME_KEYS` set before `preventDefault()`, and an
    `onBlur` that releases every key. All three attached to `canvas`.
11. `initGame(); draw();` then `return { start: startLoop, pause: stopLoop, resume: startLoop,
    restart, destroy }`.

The header comment of that file is worth copying in spirit: it names the original and lists
every deliberate difference (closure state, no global reads, canvas HUD limited to power-ups,
no GAME OVER overlay). A reader comparing the port against the original should not have to
guess which changes were on purpose.

---

## 3. The templates

Base path: `References/resources/resources/templates/started-games/`.

| Template | Canvas | HUD | State | Port cost |
| --- | --- | --- | --- | --- |
| `02-asteroids` (510 l.) | 800×600 | in canvas | `playing\|dead\|gameover` | **already ported** — SPEC 05 |
| `02-asteroides` (719 l.) | 800×600 | in canvas | same + power-up timers | **already ported** — same game, superset; SPEC 07 |
| `04-arkanoid` (268 l. + 2) | 800×600 | in canvas | `playing\|paused\|gameover\|win` | medium |
| `03-tetris` (584 l.) | 300×600 **+ a second 120×120** | **in the DOM** | `paused` / `gameOver` booleans | high |

### `04-arkanoid` — the medium case

Three script tags load in order: `assets/spritesheet.js`, `levels.js`, `game.js`. They become
one module.

- **Assets.** `assets/spritesheet-breakout.png` and `assets/sounds/{ball-bounce,break-sound}.mp3`
  go to `public/juegos/<slug>/`. `loadSpritesheet(cb)` is an async boot: the original does
  `loadSpritesheet(() => { initPaddle(); loadLevel(1); requestAnimationFrame(loop) })`. In the
  port that callback must respect `destroyed` — a component unmounted while the PNG is still
  loading must not start a loop afterwards.
- **`levels.js`** is data: `LEVELS`, five levels of `blocks[]` plus `ballSpeedMultiplier`. It
  can stay a separate file, `lib/games/<slug>/levels.ts`, since it is pure data with no state.
- **Mouse.** The paddle follows `mousemove` on the canvas, converting with
  `getBoundingClientRect()`. The canvas is CSS-stretched in Arcade Vault, so the conversion has
  to scale by `canvas.width / rect.width` — otherwise the paddle drifts from the cursor at
  every viewport size. This is the single most likely thing to break in this port.
- **No restart.** Reaching `gameover` just draws an overlay; there is no key handler. The port
  has to implement `restart()` from scratch — it is what `JUGAR DE NUEVO` calls.
- **Pause overlay.** The original draws a five-button level selector inside the canvas and
  hit-tests clicks on it. The platform already owns pause (`P`, `Escape`, the `PAUSA` button
  and the `EN PAUSA` overlay), so decide explicitly: either drop the in-canvas selector, or
  keep it as a game feature on a different key. Do not ship two pause overlays.
- **No `dt` cap** in the original. Add one; a backgrounded tab otherwise sends the ball through
  the paddle.
- Lives start at 3 and `gameState` has a fourth value, `win`, for clearing all five levels.
  Decide what `win` does: the modal says `FIN DEL JUEGO`, so either reuse it with the final
  score or treat the win as a game over with a bonus.

### `03-tetris` — the expensive case

- **Two canvases.** `#board` at 300×600 (`COLS*BLOCK × ROWS*BLOCK`, 10×20 cells of 30px) and
  `#next-canvas` at 120×120 for the next piece. `GameCanvas` renders one canvas, so either draw
  the next piece inside the main one (a reserved strip, which changes the world width) or leave
  it out of the first pass. Do not widen `COLS` to make room — that changes the game.
- **Ratio 1/2, not 4/3.** This is the template that forces Phase 5: the registry entry's
  `width` / `height`, the inline `aspect-ratio`, and the `.crt` `max-width` computation in
  `.av-player.has-canvas` all have to stop assuming 4/3.
- **The HUD is DOM.** `#score`, `#lines`, `#level`, `#overlay`, `#power-toast`, `#power-status`,
  two `<aside>` panels and 399 lines of `style.css`. `updateHUD()` sets `textContent`. In the
  port, score / lines / level become callbacks; the panels either disappear or are rebuilt as
  platform UI. **Do not port `style.css`.**
- **Restart is a button** (`#restart-btn` → `init()`), not a key. That maps cleanly onto
  `restart()`.
- **Milliseconds, not seconds.** The loop accumulates `dropAccum` against `dropInterval` in ms
  and does not scale by a seconds-based `dt`. Keep the original's units inside the engine and
  only cap the frame delta; converting everything to seconds is a rewrite and will drift the
  drop speed.
- **Generation-token loop.** `loopGen` invalidates in-flight frames on restart, in place of the
  `rafId` guard. Either pattern is fine as long as `destroy()` stays idempotent.
- **`localStorage`** holds the theme (`tetris-theme`). Out of scope: Arcade Vault has its own
  look, and SPEC 06 deleted the last `localStorage` key the platform owned.
- `P` is checked before the `paused || gameOver` guard in the original. In the port `P` never
  reaches the engine at all — the platform handles it.

---

## 4. Port checklist

Paste it at the end of Phase 6 with the boxes filled in. Every box here should already appear as
an acceptance criterion in the spec written in Phase 3:

- [ ] One export, `create<Nombre>Game: GameFactory`. No other module-level mutable binding.
- [ ] Header comment naming the original and every deliberate difference.
- [ ] The original's constants copied verbatim, units included.
- [ ] `canvas.width` / `canvas.height` set from the world constants, matching the registry entry.
- [ ] `emit()` fires each callback only on change; `onGameOver` fires once, after the loop stops.
- [ ] `dt` capped; `lastTime = null` on resume.
- [ ] `keydown` / `keyup` / `blur` on the canvas, filtered through a key set before
      `preventDefault()`; `blur` releases everything.
- [ ] `P` and `Escape` not handled by the engine.
- [ ] No score / lives / level drawn in the canvas; no GAME OVER overlay; no key-to-restart.
- [ ] `restart()` works without a remount; `destroy()` is idempotent and leaves nothing running.
- [ ] Assets under `public/juegos/<slug>/`, and a pending load cannot outlive `destroy()`.
- [ ] No blank lines: sections separated by `// ── Nombre ──`.
