# galimulator-ng

A browser-based real-time galaxy civilization sandbox inspired by the observer-driven feel of Galimulator.

The simulation generates a seeded galaxy, spawns autonomous empires, and lets galactic history unfold through expansion, war, peace, rebellion, collapse, golden ages, and technological breakthroughs.

## Run

```bash
npm install
npm run dev
```

Build check:

```bash
npm run build
```

## Current implementation

- Vite + React + TypeScript app
- Canvas 2D renderer
- Browser-only runtime
- No backend
- No database
- Seeded deterministic generation and tick randomness
- Fixed-timestep simulation loop separated from rendering
- Authoritative simulation state lives outside React
- React owns controls, selection, and coarse UI snapshots only
- Canvas draws imperatively from simulation snapshots

## Simulation systems

Implemented:

- Procedural spiral-ish galaxy generation
- Procedural star/system names
- Initial empire spawning on high-habitability systems
- Empire colors, traits, cohesion, aggression, expansionism, wealth, military, technology
- Autonomous system colonization
- Passive population, stability, wealth, and military updates
- Neighbor detection
- Relationship/tension model
- War declarations
- Peace treaties
- Border conflict resolution and territory transfer
- Capital relocation after conquest
- Overextension/war-strain collapse pressure
- Rebellions and splinter empires
- Full empire collapse
- Golden ages
- Technology breakthroughs
- Global, empire, and system event history

## UI

Implemented:

- Start / pause / step controls
- Run-ahead buttons: `+25`, `+100`
- Reset and new seed
- Speed, star count, empire count, and seed controls
- Camera reset
- Galaxy stats cards
- Top empire ranking
- View toggles:
  - territory halos
  - labels
  - war lines
  - event flashes
- Clickable systems
- Empire inspector
- System inspector
- Relationship inspector
- Clickable event log
- Event importance filtering
- JSON state export
- Markdown history report export

## God controls

System controls:

- Boost world
- Devastate
- Free system
- Found empire

Empire controls:

- Strengthen
- Destabilize
- Inflame
- Pacify
- Force war
- Force peace

## Controls

- Drag: pan
- Mouse wheel: zoom
- Click star: inspect system
- Click empire in panel: inspect empire
- Click event: jump to related system or empire

## Architecture

```txt
Simulation class
  owns mutable GalaxyState
  owns seeded PRNG
  advances only through deterministic ticks
  exposes immutable snapshots

Canvas renderer
  requestAnimationFrame loop
  reads snapshots directly
  does not mutate simulation state

React UI
  controls
  selection
  view options
  coarse snapshot refresh
  no per-frame entity rendering
```

## Milestone status

### Milestone 1: Running galaxy

Complete.

- seeded galaxy generation
- canvas rendering
- simulation loop
- controls
- expansion
- clickable systems
- inspector
- event log

### Milestone 2: Conflict and history

Complete.

- neighboring empires
- tension model
- war declarations
- simple war outcomes
- territory changes
- event logging
- active wars display
- relationship UI

### Milestone 3: Collapse and emergence

Complete for the initial sandbox scope.

- cohesion/stability model
- rebellions
- empire collapse
- splinter empires
- timelines via global, empire, and system event histories

### Milestone 4: Better visualization

Substantially complete for Canvas 2D scope.

- pan/zoom
- camera reset
- territory halos
- selected empire highlighting
- war overlays
- event flashes
- capital labels
- optional labels
- hover tooltip

## Intentionally deferred

These are future depth features, not missing from the current milestone scope:

- religions
- ideologies
- internal politics
- dynasty/leader simulation
- deep culture drift
- economy/trade routes
- complex technologies
- save-file rehydration with PRNG continuation
- WebGL renderer
- mobile/touch-optimized controls
- actual Galimulator content/assets

## Design rule

Keep the game an observer sandbox first.

The user can intervene like a god, but autonomous history should remain the default experience.
