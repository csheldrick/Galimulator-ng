# STATE

## Current goal
- Recover and intensify the original Galimulator-like observer fantasy: a galaxy that feels historically alive, socially entangled, and surprising without becoming mechanically bloated.

## Active context
- Galimulator-ng is a browser-based real-time galaxy civilization sandbox inspired by the observer-driven feel of Galimulator.
- The simulation already includes empires, rulers, dynasties, succession, rebellions, collapse, religions, ideologies, politics, culture drift, trade, monsters, crises, and history events.
- The missing quality is not “more systems”; it is stronger continuity, memory, and narrative causality.
- The next feature should make the galaxy feel like it remembers what happened.
- The best test is whether a user can watch the galaxy unfold and notice that past events shape future behavior.

## Open questions
- Which history-memory mechanic gives the biggest lived-history gain with the smallest implementation?
- Should the first pass focus on dynastic grudges, remembered atrocities, empire legends, historical eras, or ruler memory?
- Where should remembered history surface first: event log, empire inspector, system inspector, relationship behavior, or markdown history export?

## Risks
- Adding a pile of mechanics instead of one coherent causal loop.
- Creating hidden memory state that never affects behavior or visible history.
- Drifting into generic 4X mechanics instead of Galimulator-style observer history.
- Bloated UI before the simulation produces meaningful remembered events.

## Next best action
- Design and implement one small visible history-memory mechanic that changes future behavior or event text based on remembered past events.