# galimulator-ng

A browser-based real-time galaxy civilization sandbox inspired by the observer-driven feel of Galimulator.

The simulation generates a seeded galaxy, spawns autonomous empires, and lets galactic history unfold through expansion, fleet travel, war, peace, rebellion, collapse, golden ages, and technological breakthroughs.

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
- Starlane network connecting every system (nearest-neighbor links plus connectivity stitching)
- Procedural star/system names
- Initial empire spawning on high-habitability systems
- Empire colors, traits, cohesion, aggression, expansionism, wealth, military, technology
- Empire moods (expanding, fortifying, degenerating, rioting, crusading, transcending) that change behavior and emit events
- Named rulers with titles and dynasties; deaths, successions, and dynasty turnover
- Lane-based expansion: empires colonize only systems adjacent to their territory, so they grow as contiguous regions
- Autonomous colony fleet launching
- Autonomous war fleet launching against lane-border systems
- Multi-hop fleet travel along starlane routes (BFS pathing)
- Fleet arrival, colonization, and assault resolution
- Passive population, stability, wealth, and military updates
- Lane-based neighbor detection
- Relationship/tension model
- War declarations
- Peace treaties
- Border conflict resolution and territory transfer
- Capital relocation after conquest
- Overextension/war-strain collapse pressure
- Rebellions and splinter empires
- Full empire collapse
- Transcendence: high-tech empires may ascend and leave the galaxy in a blaze of glory
- New empires emerge from the ruins, so the galaxy never goes quiet
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
- Full empire navigation in the left sidebar
- Empire search and sort modes
- Selected empire summary card
- Galaxy Pulse activity panel
- View toggles:
  - territory (solid Voronoi-style region fill with crisp borders)
  - starlanes
  - labels (empire names drawn across territory, scaled by empire size)
  - war lines
  - event flashes
  - fleets
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
- Click empire in left sidebar: inspect empire
- Click event: jump to related system or empire

## Architecture

```txt
Simulation class
  owns mutable GalaxyState
  owns seeded PRNG
  advances only through deterministic ticks
  owns systems, empires, fleets, events
  exposes immutable snapshots

Canvas renderer
  requestAnimationFrame loop
  reads snapshots directly
  draws territory bitmap, starlanes, systems, wars, fleets, events, empire names
  territory is a cached nearest-star region bitmap rebuilt only when ownership changes
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
- fleet-based war missions
- simple war outcomes
- territory changes
- event logging
- active wars display
- relationship UI

### Milestone 3: Collapse and emergence

Complete for the current sandbox scope.

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
- fleet routes and moving fleet glyphs
- event flashes
- capital labels
- optional labels
- hover tooltip

## Next Galimulator-like depth targets

Done so far: starlanes, lane-based contiguous expansion, multi-hop fleet routing, solid territory regions with empire names drawn across them, empire moods, rulers/dynasties/successions, transcendence, and empire emergence.

Remaining areas that would push the feel further:

- multiple fleet classes
- religions
- ideologies
- internal politics
- culture drift
- trade routes
- special galactic events
- weird artifacts / monsters / crises
- save-file rehydration with PRNG continuation
- mobile/touch-optimized controls
- actual Galimulator content/assets should not be copied

## Design rule

Keep the game an observer sandbox first.

The user can intervene like a god, but autonomous history should remain the default experience.
