# HANDOFF

## What changed
- Implemented one visible history-memory mechanic: capital conquest creates a remembered grievance. When a war fleet captures an enemy capital, Tick.ts now adds event text that House <dynasty> will remember the fall, then records a grievance relation modifier against the conqueror with -35 opinion, +30 tension, 3600 tick duration, and sourceEventId. RelationModifierKind now includes grievance, Simulation upgrade maps legacy Capital occupied modifiers to grievance, and App.tsx history markdown export lists active remembered grievances. Existing inspector relation modifier text also surfaces the grievance. Build and lint passed
- no test script or test files found.

## Current status
- Goal: Recover and intensify the original Galimulator-like observer fantasy: a galaxy that feels historically alive, socially entangled, and surprising without becoming mechanically bloated.
- Implemented: Add one small history-memory mechanic.
- Remaining work: observe and tune the grievance loop if needed.

## Behavior transferred
- Source: Fable-like project cognition
- Target adapter: strong
- Primitives applied: Intent Lens, State Grounding, Constraint Guard, Artifact Gravity, Repair Loop, Compression Handoff, Mode Binder, Taste Vector, Tension Holder, Constructive Challenge
- Transfer result: 2026-06-13 overlay.md: avg 3.5/4 (strong); primitives 9✓/1~/0✗

## Decisions made
- Initialized Noet artifacts — Externalize project cognition into durable memory
- Chose capital-conquest grievances as the single mechanic because capital capture already has a major event, a clear attacker/defender pair, and an existing relationship ledger that affects diplomacy.
- Reused relation modifiers instead of adding a global memory system so the memory is compact, deterministic, visible, and behavior-linked.

## Constraints preserved
- MUST: Preserve seeded deterministic simulation behavior.
- MUST: Keep the runtime browser-only.
- MUST: Keep authoritative simulation state outside React.
- MUST: Keep Canvas rendering read-only from simulation snapshots.
- MUST: Prefer one coherent mechanic over a pile of unrelated features.
- MUST: New mechanics must create observable history, not just extra stats.
- MUST: Build must pass with `npm run build`.
- MUST NOT: Do not add a backend.
- MUST NOT: Do not add a database.
- MUST NOT: Do not move simulation authority into React state.
- MUST NOT: Do not make the renderer mutate simulation state.
- MUST NOT: Do not add random “content” that has no systemic effect.
- MUST NOT: Do not bloat the UI before the simulation mechanic is meaningful.

## Open questions
- Whether 3600 ticks is the right grievance duration after observing long-run seeds.
- Whether future successor/remnant states should inherit grievances from collapsed ancestors.

## Known risks
- Adding a pile of mechanics instead of one coherent causal loop.
- Creating hidden memory state that never affects behavior or visible history.
- Drifting into generic 4X mechanics instead of Galimulator-style observer history.
- Bloated UI before the simulation produces meaningful remembered events.
- Feature pile instead of lived history
- Generic strategy-game drift
- Invisible mechanic
- Capital captures may be uncommon in some seeds, so the mechanic is noticeable when wars reach capitals but not constant.
- The markdown report lists active grievances only; expired memories remain visible only while their source events are retained.

## Next best action
- Observe several seeds/headless runs and tune grievance duration or strength if capital-capture grudges are too rare or too dominant; do not add a second memory mechanic unless explicitly requested.

## Files or artifacts touched
- `src/sim/Tick.ts`
- `src/types/sim.ts`
- `src/sim/Simulation.ts`
- `src/app/App.tsx`
- `.noet/HANDOFF.md`
- `.noet/TASKS.md`
- `.noet/sessions/2026-06-13-130536.md`

## Resume prompt
You are continuing a Noet-applied project. Read PROJECT.md, STATE.md, DECISIONS.md, CONSTRAINTS.md, STYLE.md, TASKS.md, FAILURES.md, HANDOFF.md, and TRANSFER.md. Recover state, preserve the transfer target, choose one mode, produce the next concrete artifact, evaluate against the Noet contract, and update HANDOFF.md.
