# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # install dependencies
npm run dev        # start Vite dev server (http://localhost:5173)
npm run build      # type-check with tsc then Vite production build
npm run lint       # ESLint (TypeScript + react-hooks + react-refresh rules)
npm run preview    # preview the production build locally
npm run report     # run the headless simulation report from the terminal (tsx)
```

There is no third-party test framework, but `npm run test:unit` runs focused
correctness tests via Node's built-in test runner (`node --import tsx --test
src/sim/*.test.ts`) — currently covering the empire-merge subject/vassal
transfer branches in `src/sim/Merge.test.ts`. Prefer this for logic with
distinct branches that are cheap to hit directly (an invariant, an edge case)
rather than reachable only by chance in a long run.

Broader simulation correctness is validated via `runHeadlessReport()` in
`src/sim/Headless.ts`, which is reachable two ways:

- the UI's "Headless report" button, and
- `npm run report` — a scriptable, no-render run of the same function
  (`scripts/headless-report.ts`). It accepts `--seed`, `--stars`, `--empires`,
  `--milestones a,b,c`, and `--sweep`, and by default replays the run once to
  assert the output is byte-identical (a determinism guard for the seeded-PRNG
  invariant), exiting non-zero on divergence. Pass `--no-determinism` to skip
  the replay. The default stops at 3000 ticks so it finishes in seconds and
  works as a CI gate; pass `--milestones 1000,3000,10000` for the deeper run.
  This is the closest thing to an automated correctness check, so prefer
  running it after touching anything under `src/sim/`.

## Architecture

The project is a browser-only, no-backend galaxy civilization sandbox. Three distinct layers that must stay decoupled:

### `src/sim/` — Pure simulation (no DOM, no React)

- **`Simulation.ts`** — Public API class. Owns the mutable `GalaxyState` and a `SeededRandom` PRNG. Exposes two state accessors with different cost profiles:
  - `getLiveState()` — returns the real mutable state object directly (no clone). Used by the canvas renderer every RAF.
  - `getSnapshot()` — returns a `structuredClone` of state, cached until the next tick. Used by React panels polling at 250 ms.
  - `getRevision()` — a monotonic counter that bumps on every state change; lets the canvas detect "did anything change" without object identity checks.
- **`Tick.ts`** — `executeTick(state, rng)` is the single entry point for advancing time. It calls every subsystem in a fixed order: growth → progress → religion → characters → moods → rulers → politics → fleets → expansion → conflict → trade → monsters → crises → collapse → emergence → `state.tick++`. Subsystems are private functions in this file.
- **`Galaxy.ts`** — Galaxy generation: 3-arm spiral layout, nearest-neighbor starlane construction with connectivity stitching, empire seeding on high-habitability systems, initial religion placement.
- **`Diplomacy.ts`** — Relationship updates, war declarations, peace treaties.
- **`Pathing.ts`** — BFS along `connectedSystemIds` for fleet routing.
- **`Religion.ts`**, **`Trade.ts`**, **`Crises.ts`**, **`Characters.ts`**, **`Moods.ts`** — each encapsulates one simulation subsystem. `Moods.ts` also exports display-label constants (`MOOD_LABEL`, `IDEOLOGY_LABEL`, `rulerDisplayName`) shared with the renderer and UI.
- **`Dynasty.ts`** — First-class genealogy: `Person` and `Dynasty` graphs in `state.people`/`state.dynasties`. `foundDynasty()` stands up a ruling house around an empire's `ruler` shim (founder + consort + heirs + relatives); `stepDynasties()` replaces the old random `stepRulers` with heir-based succession (children → kin → pretenders → nobles → new house), plus rare dynastic life events (births, marriages, heir deaths, pretender revolts). `installPretender()`/`usurpThroneByName()` give coups a real claimant identity. `Empire.ruler` is kept as a display shim mirroring `rulerPersonId`. Has its own id counters (`resetDynastyCounters()`, persisted in saves) like `Events.ts`.
- **`Events.ts`** — `createEvent()` helper plus a module-level counter (must be reset on galaxy generation via `resetEventCounter()`).
- **`Random.ts`** — `SeededRandom` — the sole PRNG. All randomness must flow through it so replays are deterministic.
- **`Headless.ts`** — Runs a full galaxy to configurable milestone ticks in-process with no rendering, for balance/health checks.

### `src/render/` — Canvas 2D renderer (no React state mutations)

- **`GalaxyCanvas.tsx`** — A single React component that owns a `<canvas>` and drives its own `requestAnimationFrame` loop entirely inside a `useEffect`. Reads `simulation.getLiveState()` every frame. Never calls React state setters except for pointer/interaction callbacks passed as props.
- **`territory.ts`** — Builds an off-screen canvas bitmap using a nearest-star (Voronoi-style) algorithm. Rebuilds only when `ownershipKey()` changes (i.e., actual ownership or map mode changed), not every frame, so pan/zoom stays cheap. Supports three map modes: `empire`, `religion`, `wealth`.
- **`camera.ts`** — Pure coordinate transforms: `worldToScreen`, `screenToWorld`, `clampZoom`.
- **`colors.ts`** — Color utilities including `parseColorToRgb` used by the territory builder.

### `src/ui/` — React panels (read snapshots, call Simulation methods)

React components read the 250ms-polled `snapshot` prop from `App.tsx`. They never access live state directly and never mutate simulation state — they call handler props that go through `Simulation` god-control methods (`boostSystem`, `forceWar`, etc.).

- **`ControlPanel.tsx`** — Left sidebar: playback controls, settings, empire list, save/load.
- **`InspectorPanel.tsx`** — Right panel: system/empire/fleet/relationship inspector with god controls.
- **`TopStories.tsx`** — Ranked recent events with impact explanation and follow-empire button.
- **`GalaxyPulse.tsx`** — Activity pulse display.
- **`EventLog.tsx`** — Filterable chronological event log.

### `src/app/App.tsx` — Root coordinator

Owns all selection/follow state (`selectedSystemId`, `selectedEmpireId`, `selectedFleetId`, `followEmpireId`) and wires the three layers together. The snapshot poll is `setInterval(refreshSnapshot, 250)`. Speed changes go directly to `sim.setSpeed()` without a reset.

### `src/types/sim.ts` — Single source of truth for all simulation types

`GalaxyState`, `Empire`, `StarSystem`, `Fleet`, `Monster`, `Religion`, `TradeRoute`, `SimEvent`, `SaveFile`, and all enums live here. `SaveFile` wraps `GalaxyState` with a `version` number, `rngState`, and `eventCounter` so loaded games continue deterministically.

## Key invariants

- **Determinism**: Every random decision must use `rng` (the `SeededRandom` instance). Never use `Math.random()` inside sim code.
- **State mutation**: `GalaxyState` is mutated in-place by `executeTick` and god controls. Only `getSnapshot()` ever clones it. Don't add intermediate clones inside tick subsystems.
- **Save compatibility**: `Simulation.importSave()` calls `upgradeState()` to patch missing fields from older saves. When adding new fields to `GalaxyState`, `Empire`, `StarSystem`, or `Fleet`, also add a `??=` default in `upgradeState()` and bump `SAVE_VERSION` if the shape change is breaking.
- **Event IDs**: Empire and system event arrays (`historicalEventIds`, `recentEventIds`) store `Id` references into `state.events`. The global `eventLog` array is the ordered log of all event IDs.
- **React / canvas split**: React components must not be in the canvas RAF loop. The canvas component must not set React state on every frame.
