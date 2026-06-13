# CONSTRAINTS

## Musts
- Preserve seeded deterministic simulation behavior.
- Keep the runtime browser-only.
- Keep authoritative simulation state outside React.
- Keep Canvas rendering read-only from simulation snapshots.
- Prefer one coherent mechanic over a pile of unrelated features.
- New mechanics must create observable history, not just extra stats.
- Build must pass with `npm run build`.

## Must-nots
- Do not add a backend.
- Do not add a database.
- Do not move simulation authority into React state.
- Do not make the renderer mutate simulation state.
- Do not add random “content” that has no systemic effect.
- Do not bloat the UI before the simulation mechanic is meaningful.