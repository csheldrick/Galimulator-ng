# Galaxy Creation Variety Plan

## Why this matters

The current `galimulator-ng` galaxy generator is spiral-only. That means different seeds vary details, but the macro-board is always the same kind of board.

Original Galimulator's galaxy creation menu exposed much more than star count: galaxy shape, star connection type, grid alignment, and initial empire layout. That variety is part of the feel. A galaxy should not always begin as a spiral with different random names; it should sometimes begin as a ring, grid, hub, blob, web, continent, string, or strange symbolic map.

This plan adds galaxy creation variety without copying Galimulator content, assets, names, or exact algorithms.

## Design goal

Every new galaxy type should change both:

1. **Visual feel** — the map looks meaningfully different.
2. **Historical dynamics** — expansion, trade, war, collapse, religion, and empire control play differently.

The goal is not just shape variety. The goal is different historical terrain.

## New settings

Add to `SimSettings`:

```ts
export type GalaxyShape =
  | "spiral"
  | "barred-spiral"
  | "disc"
  | "hollow-disc"
  | "elliptical"
  | "irregular"
  | "clustered"
  | "hub"
  | "layered-hub"
  | "grid"
  | "web"
  | "string"
  | "continents"
  | "composite"
  | "chaos";

export type GridAlignment =
  | "none"
  | "square"
  | "hex";

export type StarlaneMode =
  | "standard"
  | "webbed"
  | "string"
  | "fast"
  | "dense";

export type InitialEmpireLayout =
  | "classic"
  | "custom"
  | "few-big-blobs"
  | "many-one-star"
  | "random-blobs"
  | "scenario";

export interface SimSettings {
  seed: number;
  numStars: number;
  numEmpires: number;
  ticksPerSecond: number;
  galaxyShape: GalaxyShape;
  gridAlignment: GridAlignment;
  starlaneMode: StarlaneMode;
  initialEmpireLayout: InitialEmpireLayout;
}
```

For migration, default old saves to:

```ts
galaxyShape: "spiral"
gridAlignment: "none"
starlaneMode: "standard"
initialEmpireLayout: "custom"
```

## Phase 1: Replace `spiralPoint()` with shape generators

Current generation calls one function for every star. Replace that with:

```ts
function generatePointForShape(
  shape: GalaxyShape,
  index: number,
  total: number,
  rng: PRNG,
  width: number,
  height: number
): [number, number]
```

Each shape should be deterministic from the seed.

### Shape behavior

```txt
spiral:
  current baseline; 3-arm spiral unless later tuned

barred-spiral:
  dense central bar with arms extending from both ends
  creates strong core powers and arm-frontier wars

disc:
  circular blob, denser and wealthier near center
  creates early contact and central hegemony

hollow-disc:
  ring galaxy with empty center
  creates circular expansion and wars propagating around the rim

elliptical:
  stretched dense oval
  creates many neighbors and diplomacy-heavy early game

irregular:
  asymmetric cloud with lopsided density
  creates unfair starts, weird borders, and surprising regional powers

clustered:
  multiple separated local clusters connected by sparse lanes
  creates isolated civilizations that collide later

hub:
  one large central cluster connected to smaller satellite clusters
  creates core-vs-frontier history

layered-hub:
  central cluster, middle satellite layer, outer satellite layer
  creates staged expansion and late outer wars

grid:
  multiple square-ish cells with chokepoint links
  creates province-like wars and strong regional identity

web:
  filaments and hubs
  makes trade, chokepoints, and long routes important

string:
  mostly one-dimensional chain or branching chain
  creates front-line wars and long succession chains

continents:
  landmass-like blobs separated by voids and bridges
  creates geographic regions and bridge conflicts

composite:
  combines 2-4 sub-shapes into one map
  creates mixed local histories

chaos:
  deliberately strange toy-box distribution
  high variety, unfair starts, odd chokepoints
```

## Phase 2: Grid alignment

After point generation, optionally snap stars to a grid.

```ts
function applyGridAlignment(
  point: [number, number],
  alignment: GridAlignment,
  cellSize: number
): [number, number]
```

Rules:

```txt
none:
  keep generated coordinates

square:
  snap to nearest square grid cell with jitter option

hex:
  snap to nearest hex-grid point with jitter option
```

Grid alignment should be optional because it radically changes the visual feel. Square and hex modes make the galaxy feel more board-like and toy-like, which is useful for some presets.

## Phase 3: Starlane modes

Current starlanes use nearest-neighbor links plus connectivity stitching. Keep that as `standard`, but add selectable modes.

```ts
function buildStarlanes(
  systemList: StarSystem[],
  mode: StarlaneMode,
  rng: PRNG
): void
```

### Modes

```txt
standard:
  current nearest-neighbor baseline plus connectivity stitching

webbed:
  more local links, especially in dense regions
  creates trade webs and many invasion paths

string:
  prevents high-degree nodes where possible
  creates chains, front lines, and long routes

fast:
  ignores some crossing/cleanliness constraints
  generates quickly and accepts messier lane geometry

dense:
  many links, high connectivity, chaotic diplomacy and war
```

### Shape-specific lane tuning

Some shapes should bias lane behavior:

```txt
hollow-disc:
  favor ring-adjacent links; add rare cross-ring bridges only if desired

clustered:
  dense intra-cluster lanes, sparse inter-cluster bridges

hub:
  strong hub-to-satellite lanes

web:
  preserve filament paths and hub links

string:
  enforce low node degree

continents:
  dense landmass-local lanes, sparse bridge/strait lanes
```

## Phase 4: Initial empire layouts

Original-style feel comes partly from different starting political configurations.

Add selectable initial layouts:

```txt
classic:
  small number of one-star powers

custom:
  current numEmpires behavior

few-big-blobs:
  3-6 larger initial empires with multiple systems each

many-one-star:
  many tiny powers, immediate chaos

random-blobs:
  5-15 powers with random multi-system starts
  can create scattered or unfair starts intentionally

scenario:
  loaded/saved starting configuration
```

### Empire placement rules by shape

```txt
spiral / barred-spiral:
  prefer high-habitability worlds but distribute across arms

disc / elliptical:
  prevent all powers from starting near the core

hollow-disc:
  distribute around ring angles

clustered / hub / layered-hub:
  seed at least one power per major cluster when possible

grid:
  seed by cell/region

web / string:
  avoid placing all powers on same filament unless chaos mode

continents:
  seed per landmass or bridge region

chaos:
  allow unfair starts
```

## Phase 5: Shape-specific resource and event bias

Shapes should affect more than coordinates.

```txt
spiral:
  balanced baseline

barred-spiral:
  richer central bar, contested arms

disc:
  wealth and tech bias toward center

hollow-disc:
  wealth peaks around ring, no central core

elliptical:
  dense contact, high early diplomacy

irregular:
  uneven resources, asymmetric starts

clustered:
  local religions and cultures diverge before contact

hub:
  central trade and central dominance pressure

web:
  trade hubs and chokepoint worlds matter more

string:
  border worlds and capitals are extremely strategic

continents:
  bridge worlds become trade hubs and war magnets

chaos:
  higher artifact, crisis, monster, and weird local marker rates
```

This should connect to the Ambient Life + Scars plan:

- web/continents/hub create more merchant traffic
- clustered creates more local religions and later conversion shocks
- string creates more refugee traffic along single corridors
- hollow-disc creates dramatic ring wars
- chaos increases weirdness and persistent scars

## Phase 6: UI

Add a galaxy setup section with:

```txt
Shape
Star count
Initial empires
Initial empire layout
Starlane mode
Grid alignment
Seed
```

Recommended UI behavior:

- keep defaults simple
- show an “Advanced” expander for starlane/grid/layout options
- include a short description for each shape
- include a randomize button for shape/settings
- include preset buttons

### Presets

```txt
Classic Spiral:
  shape spiral, standard lanes, custom empires

Ring War:
  hollow-disc, standard/webbed lanes, random blobs

Clustered Civilizations:
  clustered, sparse intercluster lanes, classic/few-big-blobs

Trade Web:
  web, webbed lanes, random blobs

Empire Archipelago:
  continents, standard lanes, few-big-blobs

Death Chain:
  string, string lanes, many-one-star

Toybox Chaos:
  chaos, dense/fast lanes, random blobs
```

## Phase 7: Save/load and reports

Include the new settings in saves.

Update headless reports to group results by shape:

```txt
shape
starlane mode
initial layout
survival at 1k / 3k / 10k
empire churn
wars
collapses
religion spread
trade routes
average path length
average node degree
largest empire share
```

This makes it clear which shapes produce stagnant galaxies, over-chaotic galaxies, or good rise-and-fall churn.

## Phase 8: Performance constraints

Some combinations can explode cost, especially dense lanes or high star counts.

Mitigations:

- warn for dense lanes over 500 stars
- cap max degree unless dense mode is explicit
- cache lane graph metrics
- avoid expensive crossing checks in fast mode
- use spatial buckets for nearest-neighbor searches if needed
- keep mobile defaults conservative

## Minimal first implementation

Start with the smallest high-impact set:

```txt
1. Add GalaxyShape setting.
2. Implement spiral, disc, hollow-disc, clustered, grid, string, chaos.
3. Add StarlaneMode setting with standard, webbed, string.
4. Add InitialEmpireLayout with custom, few-big-blobs, many-one-star, random-blobs.
5. Add setup UI selectors.
6. Include settings in save/load.
7. Update headless report to include shape metrics.
```

Do not start with moving stars or map-on-disk support. Those can come later if the static creation options feel good.

## Success criteria

The feature works when these statements are true:

```txt
A ring galaxy produces different wars than a spiral.
A clustered galaxy creates isolated histories before contact.
A string galaxy creates front-line pressure and desperate chokepoints.
A web galaxy makes trade and hubs visible.
A random-blob start immediately changes political texture.
A few-big-blobs start feels different from many-one-star chaos.
A player-controlled empire feels different depending on the map shape.
```

## Non-goals

- Do not copy Galimulator's exact map algorithms.
- Do not copy Galimulator's map assets or named scenarios.
- Do not implement moving stars in the first pass.
- Do not support arbitrary image-map imports in the first pass.
- Do not make advanced settings mandatory for casual play.

## One-sentence summary

Add galaxy shape, starlane, grid, and initial empire layout variety so every new run has a different historical board, not just a different spiral seed.
