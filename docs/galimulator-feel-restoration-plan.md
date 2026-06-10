# Galimulator-ng Feel Restoration Plan

## Purpose

`galimulator-ng` already has most of the obvious Galimulator-like systems: empires, fleets, wars, peace, rebellion, collapse, emergence, rulers, dynasties, religions, ideologies, coups, culture drift, trade, monsters, artifacts, crises, top stories, map modes, and god controls.

The remaining gap is not primarily feature coverage. The game currently risks feeling like a clean, coherent 4X simulation rather than a chaotic observer sandbox.

The goal of this plan is to restore the missing feel:

- more visible motion
- more local weirdness
- more persistent scars
- messier collapse
- more disposable background life
- more map-first storytelling
- less sterile empire lifecycle behavior

No Galimulator content, assets, names, or exact mechanics should be copied. The target is an original browser sandbox that captures the same observer-driven energy: a galaxy that looks alive, absurd, and historically messy even when the player does nothing.

## Diagnosis

The current simulation is structurally strong but too orderly.

The tick loop is clean and readable:

```txt
growth -> progress -> religion -> characters -> moods -> rulers -> politics
-> fleets -> expansion -> conflict -> trade -> monsters -> crises
-> collapse -> emergence
```

That is good architecture, but it can produce a galaxy that feels composed rather than wild.

The game has many dramatic systems, but many of them resolve into scalar changes and event log entries. The player may read that something happened, but the map itself may not feel transformed enough.

The missing layer is not another major strategic system. It is a texture layer: background life, local marks, persistent scars, and visible consequences.

## Design Rule

Keep the game an observer sandbox first.

The player can intervene like a god, but autonomous history should remain the default experience.

Every change in this plan should answer at least one of these questions:

1. Does the galaxy look more alive while paused or watched passively?
2. Does a star system become more memorable after something happens there?
3. Does collapse leave historical residue instead of simply clearing ownership?
4. Can the player understand major drama from the map without reading the log?
5. Does the simulation create odd, asymmetric incidents that feel like history?

## Implementation Overview

Add one new cross-cutting layer:

```txt
Ambient Life + Scars Layer
```

This layer should not replace existing simulation systems. It should listen to them and make their consequences visible.

It has two halves:

1. Ambient ships: mostly cosmetic moving traffic that makes the galaxy feel inhabited.
2. World markers: persistent map scars and local identities left by events.

## Phase 1: Ambient Life

### Goal

Increase visual swarm and background motion without distorting the strategic simulation.

The current fleet model is mechanically sensible, but too sparse and strategic. Galimulator-like feel needs disposable motion: merchants, pilgrims, refugees, couriers, surveyors, missionaries, and noble retinues moving constantly along lanes.

These ships should mostly not matter. They exist to make the galaxy feel inhabited.

### Types

Add a new type, probably in `src/types/sim.ts`:

```ts
export type AmbientShipKind =
  | "merchant"
  | "pilgrim"
  | "courier"
  | "refugee"
  | "missionary"
  | "survey"
  | "noble-retinue";

export interface AmbientShip {
  id: Id;
  kind: AmbientShipKind;
  ownerEmpireId: Id | null;
  originSystemId: Id;
  targetSystemId: Id;
  path: Id[];
  legIndex: number;
  legProgress: number;
  x: number;
  y: number;
  speed: number;
  createdTick: number;
  expiresTick?: number;
}
```

Extend `GalaxyState`:

```ts
ambientShips: Record<Id, AmbientShip>;
```

Patch save rehydration in `Simulation.upgradeState()`:

```ts
state.ambientShips ??= {};
```

### Spawn Sources

Ambient ships should be triggered by existing systems:

- trade route established -> merchant traffic
- active trade route -> periodic merchant ships
- religion spread/adoption -> pilgrim or missionary ships
- empire collapse -> refugee ships
- rebellion -> refugee and courier ships
- succession -> noble retinue ships between capital and major worlds
- artifact discovery -> scholar/survey traffic
- crisis -> refugee/survey/courier ships
- frontier expansion -> survey ships

### Behavior

Ambient ships should:

- follow starlane paths using the same pathing helpers as fleets
- despawn on arrival
- have low memory/CPU cost
- cap globally, for example `maxAmbientShips = numStars * 2`
- optionally cap per empire
- be hidden behind a view toggle if needed

They should only rarely produce events. Most should just move.

Possible rare event examples:

```txt
A refugee convoy from Vessa reached the Free Koro League.
Pilgrims from the Lantern Faith gathered at Aun's holy world.
A merchant flotilla vanished in the storm lanes near Ix.
```

### Rendering

Render ambient ships separately from strategic fleets.

Strategic fleets should remain legible and important. Ambient ships should be smaller, dimmer, and more numerous.

Suggested visual distinction:

- merchant: tiny square or dot
- pilgrim/missionary: tiny cross/star/glow
- refugee: dim flickering dot
- courier: fast small dash
- survey: small ring
- noble-retinue: brighter ornamental dot

Do not assign high-contrast colors that compete with war fleets.

## Phase 2: World Markers / Persistent Scars

### Goal

Make important stars remember what happened there.

Right now events can alter system stats, but the map does not necessarily preserve visible historical identity. A star should become weird after enough history happens there.

### Types

Add:

```ts
export type WorldMarkerKind =
  | "ruin"
  | "holy-site"
  | "battlefield"
  | "shipyard"
  | "rebel-hotbed"
  | "artifact-aura"
  | "dead-capital"
  | "monster-wound"
  | "plague-world"
  | "storm-scar"
  | "transcendent-ruin"
  | "trade-hub";

export interface WorldMarker {
  id: Id;
  systemId: Id;
  kind: WorldMarkerKind;
  label: string;
  createdTick: number;
  strength: number;
  expiresTick?: number;
}
```

Extend `GalaxyState`:

```ts
worldMarkers: Record<Id, WorldMarker>;
```

Patch save rehydration:

```ts
state.worldMarkers ??= {};
```

### Marker Sources

Add or strengthen markers from existing events:

- empire collapse -> dead capital, ruin
- rebellion -> rebel hotbed
- major battle / repeated battle -> battlefield
- monster attack -> monster wound
- monster slain -> trophy/scar marker
- plague crisis -> plague world
- hyperlane storm -> storm scar
- artifact discovered -> artifact aura or relic site
- transcendence -> transcendent ruin
- trade hub route density -> trade hub
- religion holy world -> holy site
- repeated fleet launches -> shipyard

### Marker Behavior

Markers should have mechanical effects, but small ones.

Examples:

```txt
holy-site:
  boosts religion spread and pilgrimage traffic

battlefield:
  lowers stability slightly, raises military recruitment slightly

rebel-hotbed:
  raises rebellion chance and refugee traffic

trade-hub:
  increases wealth and merchant traffic

monster-wound:
  lowers population growth and stability until it fades

transcendent-ruin:
  raises tech/religion weirdness and emergence candidate score
```

Avoid making markers too deterministic or too balanced. Their job is to create history texture.

### Rendering

Render small persistent glyphs around systems.

The player should be able to glance at the map and identify:

- this was a capital
- this place was ruined
- this is holy
- this place keeps rebelling
- this region was hit by plague
- this world has a strange artifact legacy

System inspector should list active markers with short explanations.

## Phase 3: Messier Collapse

### Goal

Collapse should leave mess, not just neutral systems.

Current collapse behavior should be expanded so the fall of a major empire creates visible historical residue.

### Current Problem

The current collapse roughly does:

```txt
for each owned system:
  owner = null
  stability -= 0.3
create collapse event
remove empire
```

This is mechanically clear but emotionally flat.

### Desired Behavior

Collapse should produce a bundle of consequences:

- neutral ruined worlds
- successor states
- warlord pockets
- refugee ships
- dead capital marker
- ruined shipyard or battlefield markers
- religious schism chance
- claimant/pretender emergence seed
- cultural residue
- nearby tension spikes

### Suggested Collapse Algorithm

Replace simple collapse with staged collapse:

```txt
collapseEmpire(state, empire):
  1. identify capital, core worlds, frontier worlds, unstable worlds
  2. create dead-capital marker at capital
  3. create ruin markers on selected systems
  4. spawn refugee ambient ships from capital/frontier worlds
  5. possibly spawn 1-3 successor/warlord states immediately
  6. leave remaining systems neutral but culturally marked
  7. seed pretender/successor emergence weights for later
  8. create a major collapse event
  9. remove old empire
```

### Successor State Rules

A large empire should rarely disappear cleanly.

Suggested conditions:

```txt
if empire owned >= 8 systems:
  60% chance to create one successor immediately

if empire owned >= 15 systems:
  30% chance to create two successors

if empire had state religion and low cohesion:
  chance one successor adopts a schismatic faith

if empire had high tech:
  chance capital becomes transcendent ruin / lost archive
```

Successor states should inherit:

- old culture or local culture
- partial tech
- partial religion
- hatred/tension toward sibling successors
- name fragments from old empire or capital

### Warlord Pocket

Warlord states should be small, aggressive, and temporary-feeling.

```ts
kind: "warlord"
mood: "crusading" | "fortifying"
ideology: "militarist"
cohesion: medium-low
aggression: high
expansionism: medium
```

## Phase 4: Mood Should Become Visible

### Goal

Empire moods should be readable from behavior and visuals, not only from inspector text or event logs.

Current moods mostly affect scalars: cohesion, stability, tech, expansion chance, war chance. Keep that, but add visible expression.

### Mood Expression Table

```txt
expanding:
  more settler and survey ambient ships
  frontier stars pulse softly

fortifying:
  patrol loops around borders
  fortress/shipyard markers appear on capital or border worlds
  territory border appears steadier/thicker

degenerating:
  territory dims or flickers
  corruption/local unrest events increase
  dead-capital/rebel-hotbed markers become more likely

rioting:
  unstable systems flash
  refugee ships spawn
  rebellion markers intensify

crusading:
  war fleets get more visible banners
  pilgrim/missionary traffic increases
  religious border pressure becomes visible

transcending:
  territory glows strangely
  fleets slow or stop launching
  systems gain transcendent-ruin markers after ascension
  map shockwave on completion
```

### Implementation

Add a `stepMoodExpression()` after `stepMoods()` or inside it.

This function should not duplicate core mood mechanics. It should add:

- ambient ships
- temporary event flashes
- world markers
- render hints

## Phase 5: Map-First Storytelling

### Goal

The map should carry more of the narrative weight.

The event log and Galaxy Pulse are useful, but the player should understand the galaxy by watching it.

### Additions

1. Persistent event glyphs
   - Major events leave short-lived glyphs on the map.
   - Existing event flashes should be stronger for importance >= 4.

2. Region-level drama hints
   - War zones shimmer or pulse.
   - Collapse zones show debris/scars.
   - Plague/storm regions retain a fading halo.

3. Major story labels
   - Importance >= 5 events should briefly draw floating labels on the map.
   - These should fade slowly enough to notice while watching.

4. Camera assist
   - Optional setting: camera gently nudges or frames galaxy-defining events.
   - Should never fight manual camera control.

5. System inspector history
   - Show markers and recent local events as a compact history.
   - Make old capitals, holy worlds, ruins, and battlefields feel discoverable.

## Phase 6: More Local Star Weirdness

### Goal

Make individual stars memorable.

Systems already have enough base data. Add local identity through markers and lightweight conditions.

### Optional `WorldCondition`

Instead of or in addition to markers:

```ts
export type WorldCondition =
  | "fortress-world"
  | "holy-world"
  | "trade-hub"
  | "pirate-nest"
  | "quarantine-zone"
  | "rebel-hotbed"
  | "ancient-ruin"
  | "shipyard"
  | "decadent-capital"
  | "frontier-colony";
```

Markers are probably better because they can be historical, named, time-bound, and inspectable.

### Local Incident Examples

Add small events that fire from marker/system state:

```txt
A governor on a rebel-hotbed world refuses imperial taxes.
Pilgrims crowd a holy site and destabilize a neighboring faith.
A shipyard world launches an unauthorized expedition.
A plague world produces a refugee wave.
A dead capital attracts a pretender court.
A trade hub becomes too rich and invites raiders.
A monster-wounded system forms a doomsday cult.
```

These should be small but frequent enough to make stars feel alive.

## Phase 7: Tune Event Density

### Goal

Increase perceived chaos without overwhelming the simulation.

Current weirdness is likely too rare to define the experience. Crises and monsters exist, but they may not appear often enough during normal watching.

### Suggested Tuning

Make event density scale with galaxy age and size.

```txt
base weirdness chance = 0.001
+ age factor
+ empire count factor
+ war count factor
+ marker count factor
```

Possible target:

- minor local incident every 20-60 ticks
- visible ambient movement always present
- importance 4 event every 100-250 ticks
- importance 5 event every 500-1200 ticks
- monster/crisis rare, but not invisible

### Important Distinction

Do not make every event mechanically huge.

The galaxy should feel noisy, but not every event should alter balance.

Use three tiers:

```txt
texture events:
  mostly visual/log flavor

local events:
  affect one system or route

historical events:
  affect empires, regions, collapse, religion, war, crisis
```

## Phase 8: Preserve Strategic Clarity

### Risks

This plan could accidentally clutter the map or slow the app.

Mitigations:

- Add view toggles for ambient ships and world markers.
- Cap ambient ships globally.
- Cap markers per system or merge similar markers.
- Use cached rendering where possible.
- Do not clone large ambient objects into React every frame.
- Canvas should read live state imperatively, like existing fleets.
- UI snapshots can summarize counts, not every object.

### Suggested Caps

```txt
ambientShips <= numStars * 2
worldMarkers <= numStars * 1.5
markersPerSystem <= 4 visible, extra collapsed in inspector
majorFloatingLabels <= 5 active
```

## Files Likely Affected

Core types:

- `src/types/sim.ts`

Simulation lifecycle:

- `src/sim/Simulation.ts`
- `src/sim/Tick.ts`
- `src/sim/Events.ts`
- `src/sim/Pathing.ts`

Existing systems to hook:

- `src/sim/Trade.ts`
- `src/sim/Religion.ts`
- `src/sim/Crises.ts`
- `src/sim/Characters.ts`
- `src/sim/Diplomacy.ts`

Rendering/UI:

- canvas renderer files
- `src/ui/InspectorPanel.tsx`
- `src/ui/GalaxyPulse.tsx`
- control/view options components

Docs/tests:

- `README.md`
- headless report code
- any save/load tests or fixtures

## Suggested Build Order

### Step 1: Add state containers

- Add `AmbientShip` and `WorldMarker` types.
- Extend `GalaxyState`.
- Patch `upgradeState()`.
- Ensure save/load still works.
- Initialize empty records in galaxy generation.

### Step 2: Add helper modules

Create:

```txt
src/sim/Ambient.ts
src/sim/Markers.ts
```

Responsibilities:

```ts
spawnAmbientShip(...)
stepAmbientShips(...)
addWorldMarker(...)
decayWorldMarkers(...)
getSystemMarkers(...)
```

### Step 3: Render ambient ships and markers

- Draw ambient ships small and subtle.
- Draw marker glyphs near systems.
- Add view toggles.
- Add marker details to system inspector.

### Step 4: Hook low-risk systems

Start with non-invasive hooks:

- trade -> merchants
- religion -> pilgrims/missionaries
- artifact -> artifact marker
- monster attack -> monster wound marker
- plague/storm -> crisis markers

### Step 5: Improve collapse

Refactor `collapseEmpire()` after markers and ambient ships are available.

Add:

- dead capital markers
- ruins
- refugee ships
- immediate successor/warlord chance
- direct continuity with emergence system

### Step 6: Add mood expression

Add visible mood behaviors through ambient ships, markers, and render hints.

### Step 7: Tune density

Run headless milestones at 1,000 / 3,000 / 10,000 ticks.

Track:

- average ambient ships
- marker count
- number of major events
- number of collapses
- number of successor states
- active wars
- monster/crisis frequency
- frame performance

## Success Criteria

The change is successful when a passive observer can watch for a few minutes and say:

```txt
That region is cursed.
That old capital mattered.
That faith is spreading.
That empire is visibly falling apart.
That war zone is obvious.
That monster left a scar.
There are always little ships moving.
The galaxy feels alive even when no major war is happening.
```

The game should feel less like a clean strategic simulation and more like a strange living historical toy.

## Non-Goals

- Do not copy Galimulator assets, names, exact text, or exact mechanics.
- Do not turn the game into a full 4X.
- Do not make ambient ships strategically mandatory.
- Do not overload the UI with dashboards.
- Do not make every event important.
- Do not sacrifice deterministic seeded simulation.
- Do not move authoritative simulation state into React.

## One-Sentence Summary

Add an Ambient Life + Scars layer so existing systems leave visible motion, local weirdness, and persistent historical residue on the map.