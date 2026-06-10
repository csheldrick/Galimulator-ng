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
- Religions: procedurally named faiths seeded on holy worlds that spread along starlanes, become state religions, soothe co-religionists, and inflame crusaders; reform faiths arise in unrest
- Ideologies: militarist, pacifist, spiritualist, materialist, expansionist, and isolationist creeds that bend aggression, expansion, research, trade, and faith
- Internal politics: coups topple rulers, flip ideologies, and shake capitals; war-weary pacifist courts invite the generals in
- Culture drift: conquered worlds keep their culture, chafe under foreign rule, slowly assimilate, and defect first in rebellions
- Trade routes: friendly lane-neighbors open capital-to-capital trade that pays both partners and cools tensions; war severs it
- Ship classes: settlers, raiders, strike fleets, and slow heavy armadas with distinct speed/strength tradeoffs
- Space monsters: void leviathans, star wraiths, and devourer swarms that hunt rich worlds along the lanes until local fleets bring them down
- Precursor artifacts: buried relics that reward whoever colonizes or conquers their worlds
- Galactic crises: plagues, hyperlane storms, ancient awakenings, and tech cascades

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
- Stardate display on the map
- Map modes: empires, religions, wealth
- View toggles:
  - territory (solid Voronoi-style region fill with crisp borders; neutral space reads as dim slate)
  - starlanes
  - labels (empire names drawn across territory, scaled by empire size; religion names in religion view)
  - war lines
  - event flashes
  - fleets
  - trade routes
  - monsters
- Clickable systems
- Empire inspector
- System inspector
- Relationship inspector
- Clickable event log
- Event importance filtering
- Save/load: full JSON saves including PRNG state, so loaded galaxies continue deterministically (legacy bare-state exports rehydrate too)
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

- Drag: pan (mouse or touch)
- Mouse wheel or pinch: zoom
- Click/tap star: inspect system
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

## Galimulator-like depth targets

All planned depth targets are implemented:

- starlanes, lane-based contiguous expansion, multi-hop fleet routing
- solid territory regions with empire names drawn across them
- empire moods, rulers/dynasties/successions, transcendence, empire emergence
- multiple fleet classes (settler, raider, strike, armada)
- religions with holy worlds, lane spread, state faiths, and reformations
- ideologies with behavioral modifiers
- internal politics (coups, ideology flips)
- culture drift, foreign-culture unrest, and culture-driven rebellions
- trade routes with tension-cooling economics
- special galactic events (plagues, hyperlane storms, awakenings, tech cascades)
- artifacts, monsters, and crises
- save-file rehydration with PRNG continuation
- touch-optimized controls (pointer pan, pinch zoom)
- map modes (empire / religion / wealth)

No Galimulator content or assets are copied; everything is procedural and original.

## Readable drama layer

Added to make the galaxy's story easy to read at a glance:

- **Follow this empire** camera mode — glides and frames a chosen empire's territory (any pan/zoom releases it)
- **Top Stories** feed — ranks recent events by impact and recency and explains *why each one matters*, with one-click follow on the empire involved
- **Named characters below rulers** — each empire keeps a court of admirals, ministers, and prophets. Admirals lead and stiffen war fleets and gain renown from victories, ministers grease wealth/cohesion, prophets accelerate their faith, and a renowned but disloyal officer can stage a named coup
- **Headless milestone report** — runs a fresh deterministic galaxy to 1,000 / 3,000 / 10,000 ticks and reports survival, empire churn, wars, religion spread, monsters, and collapses (no rendering required)
- **Galaxy-defining events** (importance ≥ 4) read distinctly — multi-ring shockwaves with floating headlines on the map, plus accented entries in the log and Top Stories

## Design rule

Keep the game an observer sandbox first.

The user can intervene like a god, but autonomous history should remain the default experience.
