# Galimulator-ng Feel Restoration Plan

## Purpose

`galimulator-ng` already has most of the obvious Galimulator-like systems: empires, fleets, wars, peace, rebellion, collapse, emergence, rulers, dynasties, religions, ideologies, coups, culture drift, trade, monsters, artifacts, crises, top stories, map modes, and god controls.

The remaining gap is not mainly feature coverage. The game risks feeling like a clean, coherent 4X simulation instead of a chaotic observer sandbox that can also become a strange empire-control toy when the player chooses to intervene from inside history.

This plan restores the missing feel through four connected layers:

1. **Ambient Life** — more visible background motion and disposable ships.
2. **Persistent Scars** — stars remember what happened there.
3. **Messier History** — collapse, rebellion, crises, and moods leave visible consequences.
4. **Empire Control** — the player can take over an empire and steer it without turning the game into a traditional 4X.

No Galimulator content, assets, names, text, or exact mechanics should be copied. The goal is an original browser sandbox that captures the same kind of observer-driven energy: a galaxy that looks alive, absurd, playable, and historically messy even when the player mostly watches.

## Diagnosis

The current simulation is structurally strong but too orderly.

The tick loop is clean and readable:

```txt
growth -> progress -> religion -> characters -> moods -> rulers -> politics
-> fleets -> expansion -> conflict -> trade -> monsters -> crises
-> collapse -> emergence
```

That is good architecture, but it can produce a galaxy that feels composed rather than wild.

Many systems currently resolve into scalar changes and event log entries. The player may read that something happened, but the map itself may not feel transformed enough.

The missing pieces are:

- background motion that makes the galaxy feel inhabited
- local star identity and persistent historical scars
- collapse that leaves messy residue instead of clean neutral systems
- moods that are visible on the map, not just in inspector text
- empire control that lets the player become a ruler inside the simulation
- consequences that keep player intervention from feeling like a detached debug panel

## Design Rules

Keep the game an observer sandbox first.

The player should be able to watch history unfold with no input. But when they choose an empire, they should feel like they are becoming a ruler, not just pressing god buttons.

Every change in this plan should answer at least one of these questions:

1. Does the galaxy look more alive while watched passively?
2. Does a star system become more memorable after something happens there?
3. Does collapse leave historical residue instead of simply clearing ownership?
4. Can the player understand major drama from the map without reading the log?
5. Does the simulation create odd, asymmetric incidents that feel like history?
6. Can the player steer one empire without removing autonomous galactic history?
7. Do player actions create consequences, opposition, politics, and future story?

## Implementation Overview

Add three cross-cutting layers:

```txt
Ambient Life + Scars Layer
Empire Control Layer
Consequence Layer
```

The first makes the galaxy feel alive and historically marked.

The second lets the player take control of an empire from inside the simulation.

The third ensures player actions are not free debug commands: courts react, rivals respond, worlds destabilize, factions resist, and history remembers.

## Phase 1: Ambient Life

### Goal

Increase visual swarm and background motion without distorting the strategic simulation.

The current fleet model is mechanically sensible, but too sparse and strategic. A Galimulator-like sandbox needs disposable motion: merchants, pilgrims, refugees, couriers, surveyors, missionaries, and noble retinues moving constantly along lanes.

These ships should mostly not matter. They exist to make the galaxy feel inhabited.

### Types

Add to `src/types/sim.ts`:

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

- follow starlane paths using existing pathing helpers
- despawn on arrival
- have low memory/CPU cost
- cap globally, for example `maxAmbientShips = numStars * 2`
- optionally cap per empire
- be hidden behind a view toggle if needed

They should only rarely produce events. Most should just move.

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

## Phase 2: World Markers / Persistent Scars

### Goal

Make important stars remember what happened there.

Systems already have population, resources, habitability, stability, owner, culture, religion, artifact, tech, event history, and starlane connections. That is enough data, but the map needs persistent local identity.

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

Markers should have small mechanical effects, but they should mainly create history texture.

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

System inspector should list active markers with short explanations.

## Phase 3: Messier Collapse

### Goal

Collapse should leave mess, not just neutral systems.

Current collapse behavior should be expanded so the fall of a major empire creates visible historical residue.

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

## Phase 4: Mood Should Become Visible

### Goal

Empire moods should be readable from behavior and visuals, not only from inspector text or event logs.

Current moods mostly affect scalars: cohesion, stability, tech, expansion chance, and war chance. Keep that, but add visible expression.

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

Add a `stepMoodExpression()` after `stepMoods()` or inside it. It should add ambient ships, temporary event flashes, world markers, and render hints, not duplicate core mood mechanics.

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
   - Show markers and recent local events as compact history.
   - Make old capitals, holy worlds, ruins, and battlefields feel discoverable.

## Phase 6: More Local Star Weirdness

### Goal

Make individual stars memorable.

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

Current weirdness may be too rare to define the experience. Crises and monsters exist, but they may not appear often enough during normal watching.

Make event density scale with galaxy age and size:

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

Use three tiers:

```txt
texture events:
  mostly visual/log flavor

local events:
  affect one system or route

historical events:
  affect empires, regions, collapse, religion, war, crisis
```

## Phase 8: Empire Control Mode

### Goal

Add a mode where the player takes control of one empire from inside the simulation.

This should not become a full 4X with production queues, build trees, and micromanagement. It should feel like becoming the ruler of a living empire that already has momentum, factions, enemies, traditions, unstable worlds, and court figures.

The player should steer history, not replace the simulation.

### Difference From God Controls

God controls are outside-history interventions:

```txt
boost world
free system
found empire
strengthen empire
destabilize empire
force war
force peace
```

Empire control should be inside-history rule:

```txt
issue imperial policy
order fleets
negotiate diplomacy
manage succession pressure
suppress or appease rebellions
fund religious/cultural direction
appoint court figures
choose strategic priorities
accept consequences
```

God controls should remain available as sandbox tools. Empire control should be a separate mode with limits, costs, and political reactions.

### Player Role

Add a `PlayerControlState`:

```ts
export interface PlayerControlState {
  controlledEmpireId: Id | null;
  mode: "observer" | "empire";
  rulerPersona: "hands-off" | "conqueror" | "reformer" | "prophet" | "merchant" | "survivor";
  authority: number;
  legitimacy: number;
  commandCooldowns: Record<string, number>;
}
```

Extend `GalaxyState` or keep this in simulation-level state depending on save/load needs.

If saved games should preserve control mode, include it in `SaveFile`.

### Core Resources

Empire control should use soft political resources, not a traditional economy UI.

Suggested values:

```txt
authority:
  how much direct command power the ruler has

legitimacy:
  how accepted the ruler is by worlds, court, and culture

attention:
  optional per-tick/command budget to prevent micromanagement

favor:
  optional relation with court, clergy, generals, merchants, frontier
```

A simple first version only needs `authority` and `legitimacy`.

Authority should regenerate based on cohesion, capital stability, ruler traits, and court support.

Legitimacy should rise from victories, peace, prosperity, same-culture rule, fulfilled policies, and religious alignment. It should fall from failed wars, high instability, culture mismatch, coups, forced commands, and repeated emergency decrees.

### Empire Commands

Initial command set:

```txt
Military:
  rally fleet to selected border target
  fortify selected system
  order raid against enemy border world
  recall selected fleet
  prioritize war target

Diplomacy:
  propose peace
  provoke war
  improve relations
  denounce rival
  sponsor trade pact

Internal Rule:
  stabilize selected system
  suppress unrest
  grant autonomy
  move capital
  appoint court figure
  purge disloyal court figure

Expansion:
  prioritize frontier direction
  sponsor colonization of selected adjacent system
  restrict expansion / consolidate borders

Religion / Culture:
  adopt local faith
  sponsor state faith
  tolerate foreign culture
  assimilate selected world
  back reform movement

Technology / Wealth:
  fund research push
  fund shipyards
  tax heavily
  subsidize trade
```

Each command should have:

```txt
cost:
  authority / wealth / legitimacy / cooldown

requirements:
  controlled empire, valid target, enough resources, relationship state, adjacency, etc.

immediate effect:
  launch fleet, alter tension, add marker, change priority, modify stability

consequence:
  court reaction, faction pressure, legitimacy change, future event chance
```

### Strategic Priorities Instead of Micromanagement

The player should be able to set empire-wide priorities that bias autonomous behavior:

```ts
export type EmpirePriority =
  | "balanced"
  | "expand"
  | "fortify"
  | "conquer"
  | "trade"
  | "research"
  | "convert"
  | "stabilize"
  | "survive";
```

Add to `Empire`:

```ts
playerPriority?: EmpirePriority;
```

The existing autonomous systems should read this as a modifier, not a hard override.

Examples:

```txt
expand:
  increases colonizer launch chance and survey ambient traffic

fortify:
  increases cohesion/stability behavior and patrols

conquer:
  increases war fleet chance and tension tolerance

trade:
  favors peace, trade routes, merchant traffic

research:
  increases breakthrough chance but costs wealth

convert:
  increases missionary/pilgrim traffic and religious pressure

stabilize:
  suppresses rebellion risk, slows expansion

survive:
  prioritizes peace, capital defense, cohesion, refugee absorption
```

### Court and Faction Reactions

Empire control should use existing court characters.

Characters should not just provide bonuses; they should react to player decisions.

Examples:

```txt
admiral:
  likes raids, conquest, fortification
  dislikes repeated peace or military cuts

minister:
  likes trade, stability, wealth, consolidation
  dislikes heavy war spending and purges

prophet:
  likes conversion, holy sites, crusades, state faith
  dislikes tolerance of rival faiths

pretender:
  exploits low legitimacy, failed wars, purges, culture unrest
```

Add court reaction events:

```txt
Admiral Sava praised the campaign against Nox.
Minister Iren warned that emergency taxation is breaking the capital.
Prophet Olan denounced the toleration decree.
Pretender Kael gathered support among the frontier worlds.
```

Low loyalty + low legitimacy should increase coup, pretender, and rebellion chances.

### Command Consequences

Player commands should create history.

Examples:

```txt
Order raid:
  launches fleet now
  raises tension
  may anger pacifist/ministers
  may boost admiral renown
  may create battlefield marker

Suppress unrest:
  raises short-term stability
  lowers legitimacy
  may create rebel-hotbed marker
  may prevent immediate rebellion but worsen future revolt

Grant autonomy:
  raises stability on selected foreign-culture world
  lowers central authority
  may create autonomous-region marker
  lowers rebellion chance

Sponsor state faith:
  increases conversion pressure
  angers foreign-faith worlds
  boosts prophet renown
  may trigger schism/reform movement

Move capital:
  changes strategic center
  costs legitimacy
  old capital may gain dead-capital/resentful-core marker
  new capital gains imperial-seat marker
```

### UI

Add a clear mode switch:

```txt
Observer Mode
Empire Control Mode
God Controls
```

Empire control flow:

1. Select empire.
2. Click `Control Empire`.
3. Camera follows controlled empire by default.
4. Left/sidebar shows ruler panel:
   - empire name
   - ruler
   - mood
   - authority
   - legitimacy
   - active priority
   - court figures
   - active wars
   - unstable systems
   - suggested commands
5. Clicking a star or rival empire reveals contextual commands.

Examples:

```txt
Selected own system:
  fortify
  stabilize
  move capital
  sponsor faith
  assimilate/tolerate culture

Selected enemy border system:
  raid
  invade
  denounce owner
  claim world

Selected neutral adjacent system:
  sponsor colonization
  survey

Selected own fleet:
  recall
  reinforce
  redirect if valid

Selected rival empire:
  propose peace
  improve relations
  provoke war
  denounce
```

### AI Continues Running

Even in empire control mode:

- other empires remain autonomous
- controlled empire still has autonomous baseline behavior
- player priorities bias, not fully replace, autonomous behavior
- court/faction systems can resist the player
- low authority can block commands
- low legitimacy can make commands backfire
- collapse and coups can still happen

The key feel is: the player is powerful, but not omnipotent.

### Losing Control

Empire control should support failure.

The player can lose control if:

- the empire collapses
- a coup removes the ruler
- the controlled empire transcends
- pretenders win
- all systems are conquered

When that happens, offer:

```txt
return to observer
continue as successor state
continue as rebel faction
choose another empire
```

This preserves the rise-and-fall fantasy instead of treating loss as game over.

### Minimal First Version

First implementation should be small:

```txt
- observer/empire mode switch
- controlledEmpireId
- authority + legitimacy
- set empire priority
- contextual commands:
  - rally fleet
  - fortify system
  - stabilize system
  - propose peace
  - provoke war
  - sponsor colonization
- simple command costs/cooldowns
- command events in history log
- camera follow controlled empire
```

Do not implement full court/faction gameplay until the basic control loop feels good.

## Phase 9: Preserve Strategic Clarity

### Risks

This plan could clutter the map, slow rendering, or turn the game into a traditional 4X.

Mitigations:

- Add view toggles for ambient ships and world markers.
- Cap ambient ships globally.
- Cap markers per system or merge similar markers.
- Use cached rendering where possible.
- Do not clone large ambient objects into React every frame.
- Canvas should read live state imperatively, like existing fleets.
- UI snapshots can summarize counts, not every object.
- Empire control commands should be broad and dramatic, not queue-based micromanagement.
- Player priorities should bias autonomous behavior rather than replace it.

Suggested caps:

```txt
ambientShips <= numStars * 2
worldMarkers <= numStars * 1.5
markersPerSystem <= 4 visible, extra collapsed in inspector
majorFloatingLabels <= 5 active
contextualEmpireCommands <= 6 visible at once
```

## Files Likely Affected

Core types:

- `src/types/sim.ts`

Simulation lifecycle:

- `src/sim/Simulation.ts`
- `src/sim/Tick.ts`
- `src/sim/Events.ts`
- `src/sim/Pathing.ts`

New helpers:

- `src/sim/Ambient.ts`
- `src/sim/Markers.ts`
- `src/sim/EmpireControl.ts`

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
- `src/ui/ControlPanel.tsx`
- new empire-control panel/component
- control/view options components

Docs/tests:

- `README.md`
- headless report code
- save/load tests or fixtures

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

### Step 7: Add minimal empire control

Implement:

- `controlledEmpireId`
- observer/empire mode switch
- authority + legitimacy
- empire priority
- rally fleet
- fortify system
- stabilize system
- propose peace
- provoke war
- sponsor colonization
- command costs/cooldowns
- command events
- camera follow controlled empire

### Step 8: Add consequences and court reactions

After the basic loop works:

- court approval/disapproval
- legitimacy swings
- pretender pressure
- faction/culture/religion backlash
- command backfire events
- continue as successor/rebel after collapse

### Step 9: Tune density and performance

Run headless milestones at 1,000 / 3,000 / 10,000 ticks.

Track:

- average ambient ships
- marker count
- number of major events
- number of collapses
- number of successor states
- active wars
- monster/crisis frequency
- player command count if control mode is active
- legitimacy/authority range
- frame performance

## Success Criteria

The observer layer is successful when a passive observer can watch for a few minutes and say:

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

The empire-control layer is successful when a player can take over an empire and say:

```txt
I saved this empire for a while.
My conquest made the generals powerful.
My crackdown created a worse rebellion later.
My holy policy spread the faith but fractured the frontier.
I lost the throne and continued as the successor state.
I was steering history, not playing a separate 4X game.
```

## Non-Goals

- Do not copy Galimulator assets, names, exact text, or exact mechanics.
- Do not turn the game into a full 4X.
- Do not add production queues or deep micromanagement.
- Do not make ambient ships strategically mandatory.
- Do not overload the UI with dashboards.
- Do not make every event important.
- Do not sacrifice deterministic seeded simulation.
- Do not move authoritative simulation state into React.
- Do not make player empire control omnipotent.

## One-Sentence Summary

Add Ambient Life, Persistent Scars, and Empire Control so existing systems leave visible motion, local weirdness, historical residue, and playable ruler-level agency on the map.