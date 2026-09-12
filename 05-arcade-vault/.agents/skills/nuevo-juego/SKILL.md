---
name: nuevo-juego
description: Ports a game into Arcade Vault end to end — writes its spec first, following the /spec skill and the existing specs/, then builds the TypeScript engine on the GameFactory contract, its catalog entry, CSS cover, registry line, the row in the `games` table and a working leaderboard. Distills SPEC 05 and SPEC 06. Use it when adding a playable game, whether it comes from References/.../started-games or is written from scratch.
disable-model-invocation: true
argument-hint: '<started-games folder | game name | path to a game.js>'
allowed-tools: Read, Glob, Grep, Edit, Write, AskUserQuestion, Skill, Bash(git:*), Bash(ls:*), Bash(cat:*), Bash(cp:*), Bash(mkdir:*), Bash(date:*), Bash(wc:*), Bash(grep:*), Bash(sed:*), Bash(npm run lint), Bash(npm run build), Bash(npx supabase gen types:*), mcp__supabase__list_tables, mcp__supabase__execute_sql, mcp__supabase__apply_migration, mcp__supabase__generate_typescript_types, mcp__supabase__get_advisors, mcp__playwright__browser_navigate, mcp__playwright__browser_snapshot, mcp__playwright__browser_click, mcp__playwright__browser_type, mcp__playwright__browser_press_key, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_console_messages
---

# /nuevo-juego — From a loose `game.js` to a game with a real leaderboard

## Session context

Today's date (use it for the spec header and the migration timestamp, never guess it):
!`date +%F`

Specs that already exist — the next number follows the highest one here:
!`ls specs/ 2>/dev/null || echo "There is no specs/ folder yet"`

Templates available in the references folder:
!`ls References/resources/resources/templates/started-games 2>/dev/null || echo "No started-games folder — the game must come from somewhere else"`

Engines registered today:
!`cat lib/games/registry.ts 2>/dev/null`

Engine folders that already exist:
!`ls lib/games 2>/dev/null`

Catalog entries (`id` of each card in lib/games.ts):
!`grep -n 'id: "' lib/games.ts 2>/dev/null`

Migrations applied so far:
!`ls supabase/migrations 2>/dev/null`

Current branch and working tree:
!`git branch --show-current` / !`git status --short`

---

## What this skill is

SPEC 05 built the engine contract and ported Asteroids. SPEC 06 built the `games` / `scores`
tables and wired both leaderboards to them. Both are done and shipped. This skill is those two
specs turned into a repeatable procedure, so the **second**, third and fourth games cost a
session instead of two specs.

The project works spec-first — `README.md` and `CLAUDE.md` both say so — and this skill does
not get an exception. It writes the spec itself, in Phase 3, borrowing the method and the
document shape from the `/spec` skill instead of improvising a format. What it does not do is
re-run `/spec`'s interview: Phases 1 and 2 already gathered what that interview would ask, and
the engine contract, the leaderboard wiring and the porting rules are settled by SPEC 05 and
SPEC 06. The spec this skill writes is short and concrete — this game, this slug, these
constants, these acceptance criteria.

**You write code here**, unlike `/spec` — but only after the spec exists and the user has
approved it. Work in phases, pausing after each one to show the diff. Read `port-guide.md`
(next to this file) before Phase 2 and keep it open during Phase 6: it holds the engine
contract, the anatomy of the reference port, and the per-template porting deltas.

Your replies must be in **Spanish**: the repo, its specs and its UI are in Spanish. The skill
body is in English; your answers and the spec you write are not.

---

## Phases

Follow them in order. **Do not advance if the previous phase did not finish cleanly.** Stop
after each phase, summarize what changed and show the diff.

### Phase 1 — Identify the source and the slot in the catalog

The received argument is: `$ARGUMENTS`

It can be a `started-games` folder (`03-tetris`, `04`, `tetris`), a path to a `game.js`
anywhere on disk, or a plain description of a game to write from scratch.

If `$ARGUMENTS` is empty: show the template listing from the session context and ask which game
to port. Stop and wait.

Then resolve, with `AskUserQuestion`:

1. **Does it take over a mockup card or create a new one?** The eight entries in `lib/games.ts`
   are shop-window cards and seven of them have no engine: `caida` is Tetris, `bloque-buster`
   is Arkanoid, `invasores` is Space Invaders, and so on. Taking over an existing card —
   renaming it the way SPEC 05 renamed `rocas` to `asteroids` — is the normal path. A brand new
   card is the exception, and it means a new CSS cover too.
2. **The definitive `id`.** One string, four roles: URL segment of `/juegos/[id]` and
   `/jugar/[id]`, key in `GAME_ENGINES`, primary key in the `games` table, and the value the
   Server Action validates. Also settle `title`, `cat`, `color`, and whether the `cover-*` class
   is reused or has to be created.

**Hard stop:** do not start Phase 2 without a confirmed `id`. It goes into the spec header, into
seven files and into a migration; changing it later is a rename across all of them.

### Phase 2 — Inventory the source

Read the original (`game.js`, plus `index.html`, `style.css`, `levels.js`, `assets/` when they
exist) and write a short inventory **before writing the spec**, because the spec's
implementation plan is built out of it. Seven points:

1. Canvas dimensions, and whether there is more than one canvas.
2. Module-level mutable globals — the list of what moves into the factory closure.
3. Where the HUD lives: inside the canvas (Asteroids, Arkanoid) or in the DOM (Tetris).
4. Listeners: on `window`/`document` or on the canvas; which keys; is there mouse input.
5. How the game ends and how it restarts (Asteroids restarts with Space; Arkanoid does not
   restart at all).
6. External assets (Arkanoid ships a spritesheet PNG and two MP3s).
7. The unit of `dt`: seconds (Asteroids, Arkanoid) or milliseconds (Tetris).

Also list the **exact constants** of the original — radii, speeds, points, drop rates,
durations, probabilities. They go into the spec verbatim, because "the port changed a number by
eye" is the failure mode SPEC 05 wrote a risk row about.

`port-guide.md` already answers these seven for the three known templates. For a game written
from scratch, the inventory is the design sketch instead.

### Phase 3 — Write the spec

**Read these, in this order, before writing anything:**

1. `.agents/skills/spec/SKILL.md` — the method: what a spec is for in this repo, how it is
   structured, and what makes one useful instead of decorative.
2. `.agents/skills/spec/template.md` — the shape each section must respect. It is a reference,
   not text to copy verbatim.
3. The two most recent files in `specs/` (see the session context listing). They set the
   conventions that win over the English template: the specs in this repo are written **in
   Spanish**, the header is a **blockquote** with `**Estado:**` / `**Depende de:**` /
   `**Fecha:**` / `**Objetivo:**`, the state used for a ready spec is `Aprobado`, and the
   section headings are `## Por qué existe esta spec`, `## Alcance` (with `**Dentro:**` and
   `**Fuera de alcance (para specs futuras):**`), `## Modelo de datos`,
   `## Plan de implementación`, `## Criterios de aceptación`, `## Decisiones`, `## Riesgos` and
   `## Lo que **no** entra en esta spec`.
   `specs/05-juego-asteroids.md` is the closest precedent for a port and
   `specs/06-leaderboard-y-tabla-de-juegos.md` for the leaderboard half — the new spec is the
   two of them narrowed to one game.

Then write `specs/NN-juego-<slug>.md`, where `NN` is the next free number in `specs/`:

- **Estado: `Borrador`.** You do not approve your own spec.
- **Depende de:** SPEC 05 and SPEC 06 at minimum — the contract and the leaderboard.
- Objective in one sentence. Scope with both halves: what goes in, and what explicitly does not
  (sound, touch controls, the other mockup games, anything the original has and the port drops).
- **Modelo de datos:** for most games this spec creates no table — the engine types already
  exist and the leaderboard only needs one row in `games`. Say that plainly instead of padding
  the section. If Phase 5's registry refactor applies, its `GameEngineEntry` type belongs here.
- **Plan de implementación:** the numbered steps of Phases 4 through 11 below, made concrete for
  this game, each with its own check. Constants from Phase 2 go here verbatim, with the sentence
  SPEC 05 uses: changing any of them is a design change and is out of scope.
- **Criterios de aceptación:** a boolean checklist. Reuse the ones from SPEC 05 and 06 that
  still apply (lint and build clean, no double insert on a double click, no hydration warnings,
  the engine-less games unchanged, `get_advisors` quiet) and add the ones specific to this game:
  its scoring, its collisions, its levels, its controls.
- **Riesgos:** the ones `port-guide.md` names for this template, with their mitigation.

Show the spec and **stop**. The user changes `Estado` to `Aprobado` by hand — that is the gate,
exactly as in `/spec-impl`. Do not touch code until they do. If they ask for changes, rewrite
and stop again.

### Phase 4 — Branch

The working tree must be clean apart from the new spec file. If `git status --short` shows
anything else, stop and ask what to do with it — never stash or discard on your own.

Then `git checkout -b juego-<slug>`, mirroring what `/spec-impl` does with `spec-NN-slug`, and
commit the approved spec as the first commit on the branch.

### Phase 5 — Generalize the registry (only the first time it is needed)

Today `GAME_ENGINES` is a `Record<string, GameFactory>`, `components/game-canvas.tsx` hardcodes
`width={800} height={600}`, `.game-canvas` in `app/globals.css` hardcodes `aspect-ratio: 4/3`,
and the canvas `aria-label` describing the controls is written by hand for Asteroids in
`components/game-player.tsx`. With a second game all four stop being true.

Check the registry printed in the session context. If it still maps to a bare `GameFactory`,
do this refactor now:

```ts
// lib/games/registry.ts
export type GameEngineEntry = {
  create: GameFactory;
  /** Logical world of the engine. CSS only stretches pixels; physics never changes. */
  width: number;
  height: number;
  /** The canvas aria-label: this game's controls, in Spanish. */
  controls: string;
};
export const GAME_ENGINES: Record<string, GameEngineEntry> = { … };
export function getEngine(id: string): GameEngineEntry | undefined;
```

- `components/game-canvas.tsx`: take `entry: GameEngineEntry` instead of `factory` + `label`.
  Render `width={entry.width} height={entry.height}`, `aria-label={entry.controls}` and
  `style={{ aspectRatio: entry.width + " / " + entry.height }}`. The engine effect must keep
  depending on a single stable reference, so it is never recreated mid-game.
- `app/globals.css`: drop the fixed `aspect-ratio: 4/3` from `.game-canvas` — the inline style
  now supplies it — and parameterize the `max-width` of `.crt` inside `.av-player.has-canvas`,
  which today multiplies by a literal `4/3`, with a CSS variable.
- `components/game-player.tsx`: `factory` becomes `entry`; the hardcoded Asteroids `label`
  disappears; `getEngine(game.id)` still decides canvas-vs-mockup exactly as before.

Asteroids keeps working unchanged: it becomes
`{ create: createAsteroidsGame, width: 800, height: 600, controls: "…" }` with its current
label text moved in. Do the refactor even when the new game is also 800×600 — `controls` is
per-game regardless.

### Phase 6 — Port the engine

Create `lib/games/<slug>/engine.ts` with a single export,
`export const create<Nombre>Game: GameFactory`, following `port-guide.md` and using
`lib/games/asteroids/engine.ts` as the living template:

- A header comment stating what it is a port of and every deliberate difference from the
  original.
- Section banners `// ── Nombre ──` instead of blank lines.
- The original's constants copied verbatim, with their unit comments.
- Entity classes with `update(dt, …)` / `draw(ctx, …)` and a `dead` flag; anything the original
  read from a global comes in as a parameter.
- A `Motor` section with the game state in closure `let`s, an `emit()` that fires the callbacks
  only when a value changed, `loop` / `startLoop` / `stopLoop`, keyboard listeners attached to
  the canvas, and the returned `{ start, pause, resume, restart, destroy }`.
- `initGame(); draw();` before returning, so the first frame is visible before `start()`.

Then one line in `GAME_ENGINES` with the entry shape from Phase 5.

### Phase 7 — Catalog card and cover

- `lib/games.ts`: rename the mockup entry, or add a new one, with `id`, `title`, `short`,
  `long`, `cat`, `cover`, `color`, `best`, `plays`. `best` and `plays` are only read for games
  **without** a leaderboard; once the game has a row in `games`, `gameStats()` covers them.
  Leave them as they are rather than inventing new numbers.
- Cover: reusing the existing `cover-*` class of the card being taken over is the low-risk
  choice — SPEC 05 explicitly kept `cover-rocas` for Asteroids. If a new class is genuinely
  needed, invoke `/frontend-design` first (`CLAUDE.md` requires it for UI work) and add
  `.cover-<x>` next to the others in `app/globals.css`, with the house pattern: a `background`
  of gradients plus `::after` / `::before` detail layers. New design tokens go in the
  `@theme inline` block — there is no `tailwind.config.js`.

### Phase 8 — Assets, if the game has any

Copy them to `public/juegos/<slug>/` and reference them with absolute paths from the engine.
Asynchronous loading (spritesheet, audio) is resolved inside the factory: `start()` may draw an
empty first frame and enter the loop once the image is ready, and `destroy()` has to be able to
cancel a load that is still in flight without leaving a callback behind.

### Phase 9 — Leaderboard

1. Write `supabase/migrations/<YYYYMMDDHHMMSS>_juego_<slug>.sql`. For a game that is new to the
   table, one statement is the whole migration:
   `insert into public.games (id, title) values ('<slug>', '<TITLE>');`
   If the slug of a game that is already registered changed, the same file carries the
   `update public.games set id = …` — `scores.game_id` cascades on delete, not on update, so
   prefer inserting a new row over renaming one that already has scores.
2. Apply it with `apply_migration` from the Supabase MCP. Never with a raw `execute_sql`: the
   file in `supabase/migrations/` and the remote history have to match.
3. Verify with `execute_sql`: `select * from public.games;` shows the new row.
4. **Regenerate types only if the schema changed.** Inserting a row does not touch
   `lib/supabase/database.types.ts`. Say so out loud instead of producing an empty diff.

Nothing else needs editing. `lib/scores.ts`, `app/jugar/actions.ts`, `app/salon/page.tsx` and
`app/juegos/[id]/page.tsx` are all driven by `game.id` plus `hasLeaderboard()`: the podium, the
table, `Partidas` and `Mejor global` switch over to real data the moment the row exists. And
`scores` starts empty — the empty state is the correct first screen. Never seed fake scores.

### Phase 10 — Verification

Walk the spec's acceptance criteria one by one and tick them off. At minimum:

- `npm run lint` and `npm run build`, both clean.
- `get_advisors` from the Supabase MCP with no new security warnings.
- Walkthrough with the Playwright MCP: `/jugar/<slug>` renders the real canvas, the controls
  respond, `PAUSA` freezes it and `REANUDAR` resumes without a jump, `P` and `Escape` do the
  same, and with the canvas focused the arrows and Space do not scroll the page. Play — or lose
  — until the `FIN DEL JUEGO` modal opens with the real score, type initials, press
  `GUARDAR PUNTUACIÓN`, then confirm the row with `execute_sql` and see it on
  `/salon?juego=<slug>` and in the side panel of `/juegos/<slug>` without reloading by hand.
- Pressing `GUARDAR PUNTUACIÓN` twice must not insert two rows.
- Browser console clean: no errors, no hydration warnings.
- Regression: `/jugar/asteroids` still plays, and a game with no engine (`/jugar/serpentina`)
  still shows the mockup counter exactly as before.

Any criterion that cannot be met is reported, not silently dropped.

### Phase 11 — Close

- Change the spec's `Estado` to `Implementado`.
- Update `CLAUDE.md` — its Supabase table says how many rows `games` has and which games are
  still mockups, and both sentences just became wrong.
- Commit with the repo's message format, and report what is left for a future session.

---

## Hard rules

Non-negotiable. They come from SPEC 05, SPEC 06 and the project's `CLAUDE.md`.

- **No code before an approved spec.** Phase 3 ends with `Estado: Borrador` and a stop. The
  user is the one who writes `Aprobado`.
- **The spec's format is not invented here.** It comes from `.agents/skills/spec/template.md`
  and, where the two disagree, from the specs already in `specs/` — which are in Spanish and
  use the blockquote header.
- **No mutable module-level state.** The whole game lives in the factory closure. React
  StrictMode mounts effects twice in development; two mounts must share nothing.
- **`destroy()` cancels the `requestAnimationFrame`, removes every listener, and is
  idempotent.** It is the `useEffect` cleanup — a leaked loop means the game runs at double
  speed after navigating away and back.
- **Listeners on the canvas element, never on `window` or `document`.** `preventDefault()` only
  on the keys the game actually uses, and only while the canvas has focus. A blur releases all
  held keys.
- **`P` and `Escape` belong to the platform.** `components/game-canvas.tsx` handles them; the
  engine never sees them.
- **The canvas does not draw score, lives or level.** That is the HUD in `game-player.tsx`.
  Game-specific state — power-ups, the next piece, a level number that is part of the board —
  may be drawn in the canvas.
- **`onScore` / `onLives` / `onLevel` fire only when the value changes**, never once per frame:
  a `setState` per frame is 60 renders a second.
- **Cap `dt`** (0.05 s in Asteroids) and set `lastTime = null` on resume, so a backgrounded tab
  does not teleport anything.
- **No GAME OVER overlay and no key-to-restart inside the engine.** The modal owns both; typing
  a space into the initials field must not restart the game.
- **Copy the original's constants verbatim.** Changing radii, speeds, points or drop rates is
  redesigning the game, not porting it. If a number has to change, it is a decision for the
  spec, not something done by eye during the port.
- **No blank lines in `.ts` / `.tsx` / `.css`.** The `PostToolUse` hook strips them all. Use
  `// ── Nombre ──` banners to separate sections. Markdown — the spec included — keeps its
  blank lines.
- **Next.js 16 is not the Next.js you remember.** Read the relevant guide in
  `node_modules/next/dist/docs/` before touching routing code. See `AGENTS.md`.
- **Only playable games go into `games`.** A card with no engine stays out of the table and
  keeps its `seededScores()`. And `scores` never gets seeded data.
- **Pause after every phase**, show the diff, and wait. Do not chain phases.

---

## Arguments

`$ARGUMENTS` is the source of the game, and it is optional:

| Form | Meaning |
| --- | --- |
| `03-tetris`, `04`, `tetris` | A folder under `References/resources/resources/templates/started-games/`. Match loosely: full name, number only, or slug only. |
| `path/to/game.js` or a folder | Any game on disk, inside or outside the repo. |
| A description ("a Snake for `serpentina`") | No source: the engine is written from scratch against the same contract. Phase 2 becomes a design sketch. |
| empty | List the templates and ask. |

If the argument matches nothing, show what is available and ask — never guess which game was
meant.

---

## Related skills

| Skill | Relationship |
| --- | --- |
| `/spec` | Phase 3 reads its `SKILL.md` and `template.md` for the method and the document shape. Use `/spec` directly instead of this skill when the work is not a game port. |
| `/spec-impl` | The generic implementer of an approved spec. This skill is its specialization for games: same gate on `Aprobado`, same branch-then-steps rhythm, but it already knows the engine contract and the leaderboard wiring. A spec written here can also be handed to `/spec-impl`. |
| `/frontend-design` | Required by `CLAUDE.md` for any UI work — Phase 7 calls it when a new `cover-*` class is needed. |
