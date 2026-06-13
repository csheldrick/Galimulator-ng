# Enhanced Output

## Explicit request
Implement one small visible history-memory mechanic in `Galimulator-ng`. Session and weekly token limits acknowledged; I kept the patch narrow.

## Latent objective
Make the galaxy feel historically continuous: past events should affect future behavior and be visible to the observer.

## Chosen mechanic
Capital-conquest grievances. When a war fleet captures an enemy capital, the defeated house remembers it as a grievance against the conqueror.

## Files changed
- `src/sim/Tick.ts`
- `src/types/sim.ts`
- `src/sim/Simulation.ts`
- `src/app/App.tsx`
- `.noet/HANDOFF.md`
- `.noet/TASKS.md`
- `.noet/sessions/2026-06-13-130536.md`

## What changed
Capital capture now adds event text that the defending dynasty will remember the fall, then records a `grievance` relation modifier: `-35` opinion, `+30` tension, lasting `3600` ticks. Existing diplomacy already reads effective opinion/tension, so this can raise future war pressure and reduce peace likelihood.

The markdown history report now includes active `## Remembered grievances`, and the existing inspector relation modifier display surfaces the grievance without adding a new UI system.

## Constraints preserved
No new randomness, backend, database, React-owned sim state, or canvas mutation. The mechanic stays in simulation state and uses existing event/report/inspector paths.

## Validation
- `npm run build` passed.
- `npm run lint` passed.
- No `test` script, test runner config, or test files were found.

## Self-evaluation against Noet
Intent, state grounding, constraint guard, artifact usefulness, non-genericity, and handoff all pass. Repair performed: after `noet handoff --help` unexpectedly wrote a default handoff, I reran `noet handoff` with real notes, cleaned accidental session logs, and repaired the generated handoff content.

## Risks / follow-up
Capital captures may be rare in some seeds, so the next best action is observation/tuning, not adding another mechanic. Duration/strength may need adjustment after long-run watching.

## Handoff summary
Used `noet handoff` to write the handoff/session log, then updated `.noet/HANDOFF.md` and `.noet/TASKS.md` so the artifacts reflect the completed grievance mechanic and next tuning step.
