# CONSTRAINTS

## Musts
- Preserve seeded deterministic simulation behavior.
- Keep the runtime browser-only.
- Keep authoritative simulation state outside React.
- Keep Canvas rendering read-only from simulation snapshots.
- Prefer one coherent mechanic over a pile of unrelated features.
- New mechanics must create observable history, not just extra stats.
- Build must pass with `npm run build`.
- New per-empire relational state (subjects, alliances, factions) needs transfer logic in both mergeEmpires and removeEmpireFromGalaxy. — mergeEmpires silently dropped subject/vassal bonds on merge; only removeEmpireFromGalaxy handled subject cleanup, so merges left stale/dangling ids.
- Any new Id reference into state.events (modifiers, factions, subjects) must be added to gcEvents()'s referenced set in Events.ts. — gcEvents missed sourceEventId/historicalEventIds on modifiers, factions, subjects, silently corrupting grievance-age and legitimacy read-outs.

## Must-nots
- Do not add a backend.
- Do not add a database.
- Do not move simulation authority into React state.
- Do not make the renderer mutate simulation state.
- Do not add random “content” that has no systemic effect.
- Do not bloat the UI before the simulation mechanic is meaningful.