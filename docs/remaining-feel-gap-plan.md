# Remaining Feel Gap Plan

## Purpose

`galimulator-ng` now has the core missing-feel layers in place:

- galaxy shape variety
- starlane modes
- empire layouts
- markers/scars
- ambient merchant/pilgrim/refugee fleets
- alliances
- local wealth
- planet tags
- government flavor
- oddity events
- empire control mode
- authority/legitimacy
- ruler commands
- court loyalty display

The remaining gaps are not broad missing systems. They are places where the current implementation is still a first-pass slice rather than a fully expressive toy system.

This plan focuses on the next layer of depth.

## Summary of Remaining Gaps

Highest-impact remaining gaps:

1. Relation modifiers exist as a type, but diplomacy still needs a real modifier ledger.
2. Artifacts are still system strings with effects, not typed persistent structures.
3. Empire control works, but needs stronger toys: flagship, spy network, war room, religion/government actions.
4. Oddities are crisis events, not persistent map actors.
5. Planets exist as tags, but do not yet influence local history or inspector storytelling enough.
6. Alliances exist, but need diplomatic identity, map mode, and war/peace influence.
7. Shape/layout variety exists, but needs headless comparison metrics and preset tuning.

## Phase 1: Real Relation Modifier Ledger

### Current state

`RelationModifier` exists in the type model and `EmpireRelationship` can hold `modifiers`, but relationship creation still mostly works through raw `tension`, `opinion`, and `atWar` fields.

### Goal

Make diplomatic relations feel historical instead of purely numeric.

The player should be able to inspect two empires and understand why they hate, trust, fear, admire, or tolerate each other.

### Types

Expand `RelationModifier`:

```ts
export type RelationModifierKind =
  | "same-religion"
  | "different-religion"
  | "same-alliance"
  | "common-enemy"
  | "recent-war"
  | "recent-peace"
  | "capital-occupied"
  | "border-clash"
  | "trade-partner"
  | "dynastic-ties"
  | "spy-sabotage"
  | "spy-diplomacy"
  | "diplomatic-accident"
  | "diplomatic-masterstroke"
  | "tech-envy"
  | "tech-awe"
  | "crusade-hatred"
  | "player-forced-war"
  | "player-forced-peace";

export interface RelationModifier {
  id: Id;
  kind: RelationModifierKind;
  label: string;
  opinionDelta: number;
  tensionDelta: number;
  createdTick: number;
  expiresAtTick?: number;
  decayPerTick?: number;
  sourceEventId?: Id;
}
```

### Helpers

Create `src/sim/Relations.ts` or extend `Diplomacy.ts`:

```ts
addRelationModifier(state, fromEmpireId, toEmpireId, modifier)
removeExpiredRelationModifiers(state)
calculateEffectiveOpinion(baseOpinion, modifiers)
calculateEffectiveTension(baseTension, modifiers)
getRelationBreakdown(state, fromEmpireId, toEmpireId)
```

### Behavior

Do not replace raw opinion/tension immediately. Instead:

```txt
base opinion/tension remains stored
modifiers produce effective opinion/tension
war/peace/alliance logic reads effective values
UI displays both current total and modifier breakdown
```

### Sources of modifiers

```txt
same state religion:
  recurring positive opinion

different state religion:
  mild negative opinion, stronger for crusading/spiritualist empires

same alliance:
  strong positive opinion, reduced tension

common enemy:
  positive opinion, lower war chance

recent war:
  negative opinion, high tension, decays slowly

recent peace:
  temporary lower tension

trade partner:
  positive opinion, lower tension

capital occupied:
  major resentment

border clash:
  short-lived tension boost

diplomatic accident:
  random negative event

diplomatic masterstroke:
  random positive event

player forced war:
  resentment marker against controlled empire

player forced peace:
  lowered tension but possible legitimacy/court backlash
```

### UI

In empire inspector, for selected empire vs another empire:

```txt
Relations with X:
  Opinion: 72
  Tension: 18
  At war: no

Modifiers:
  +20 Same alliance
  +12 Trade partner
  -15 Different faith
  -10 Border clash, expires in 42 ticks
```

### Success criteria

```txt
A war has an understandable cause.
A peace has lingering resentment.
Alliances are supported by visible relation reasons.
Player intervention leaves diplomatic memory.
Diplomacy feels like history, not random thresholds.
```

## Phase 2: Typed Persistent Artifacts

### Current state

Artifacts still mostly exist as `artifactName: string | null` on `StarSystem`. They now have ongoing effects and markers, but they are not first-class objects with type, ownership, cooldowns, active powers, or build/capture history.

### Goal

Artifacts should be strange map objects that empires build, capture, fight over, and remember.

### Types

Add:

```ts
export type ArtifactKind =
  | "research-lab"
  | "missile-station"
  | "mind-control-hub"
  | "fleet-base"
  | "stellar-forcefield"
  | "financial-center"
  | "holy-monument"
  | "sentinel-station"
  | "imperial-tomb"
  | "weapons-platform"
  | "lost-archive"
  | "strange-engine"
  | "wormhole-disruptor";

export interface Artifact {
  id: Id;
  name: string;
  kind: ArtifactKind;
  systemId: Id;
  ownerEmpireId: Id | null;
  origin: "precursor" | "built" | "gift" | "oddity";
  createdTick: number;
  discoveredTick?: number;
  capturedTick?: number;
  active: boolean;
  cooldownUntilTick?: number;
  historicalEventIds: Id[];
}
```

Extend `GalaxyState`:

```ts
artifacts: Record<Id, Artifact>;
```

Keep `artifactName` only for migration or remove it after conversion.

### Migration

In `upgradeState()`:

```txt
for each system with artifactName:
  create Artifact object
  attach artifact id to system, or derive by systemId
  clear artifactName or keep for display compatibility
```

### Effects

```txt
research-lab:
  boosts local/system/empire tech growth

missile-station:
  damages enemy fleets arriving at or near system

mind-control-hub:
  increases stability but lowers legitimacy / raises oddity risk

fleet-base:
  increases war fleet launch strength and patrol chance

stellar-forcefield:
  makes conquest harder

financial-center:
  boosts local wealth and merchant traffic

holy-monument:
  boosts religion spread and pilgrim traffic

sentinel-station:
  attacks monsters/oddities

imperial-tomb:
  boosts legitimacy but attracts pretenders after collapse

lost-archive:
  high tech reward, can trigger oddities

strange-engine:
  unpredictable periodic effect

wormhole-disruptor:
  periodically blocks or reroutes nearby lanes/fleets
```

### Empire control integration

Add command:

```txt
Build Artifact
```

Rules:

```txt
requires controlled empire
requires owned system
costs authority + wealth + legitimacy risk
one major built artifact per empire lifetime at first
court reaction depends on artifact kind
construction creates marker and event
```

### UI

System inspector should show:

```txt
Artifact: Crown of Arel
Kind: Fleet Base
Origin: Built by the Iron Dominion
Effect: War fleets launched from this world are stronger.
History: Built tick 1204, captured tick 1890
```

### Success criteria

```txt
Artifacts are visible strategic and narrative landmarks.
Empires fight over artifact worlds.
Artifacts survive collapse and change hands.
Player-built artifacts feel like monuments, not stat buttons.
```

## Phase 3: Stronger Empire Control Toys

### Current state

Empire control now exists and works:

- take control
- authority
- legitimacy
- priority
- rally fleet
- fortify
- stabilize
- propose peace
- provoke war
- sponsor colonization
- court loyalty display
- coup failure condition

### Goal

Make empire control feel more like ruling a weird living empire rather than issuing a small list of commands.

### Additions

#### 3.1 Flagship

Add a ruler flagship as the player's direct imperial toy.

```ts
export interface FlagshipState {
  fleetId: Id | null;
  destroyedTick?: number;
  respawnAtTick?: number;
}
```

Or represent it as a special fleet:

```ts
FleetKind = ... | "flagship"
```

Behavior:

```txt
created when player takes control
can move to selected owned/neutral/enemy system
boosts stability and military defense nearby
can inspire invasions
if destroyed, legitimacy drops sharply
if present at capital during coup, coup chance decreases
```

Commands:

```txt
Move Flagship
Lead Assault
Inspire Capital
Evacuate Ruler
```

#### 3.2 Spy Network

Add one spy action per target empire per cooldown.

```ts
export type SpyMission =
  | "steal-tech"
  | "sabotage-fleet"
  | "incite-riots"
  | "improve-relations"
  | "scout-strength"
  | "sabotage-artifact";
```

Rules:

```txt
costs authority and wealth
success chance based on tech, cohesion, target stability
failure creates relation modifier and legitimacy loss
success creates hidden or visible event
```

First pass missions:

```txt
steal-tech:
  small tech gain, target relation penalty if discovered

incite-riots:
  lowers target stability, may create rebel-hotbed marker

improve-relations:
  adds positive relation modifier

sabotage-fleet:
  deletes or weakens one target war fleet
```

#### 3.3 War Room

Add war target assignment rather than full micromanagement.

```ts
export interface WarDirective {
  targetEmpireId: Id;
  focus: "attack" | "defend" | "raid" | "exhaust";
  assignedAdmiralId?: Id;
  createdTick: number;
}
```

Add to Empire:

```ts
warDirectives?: Record<Id, WarDirective>;
```

Effects:

```txt
attack:
  more war fleets, higher strength

defend:
  more patrol/fortify behavior, lower conquest chance

raid:
  faster raider fleets, wealth damage

exhaust:
  fewer risky attacks, tension stays high, waits for target instability
```

#### 3.4 Change Religion / State Faith Policy

Command:

```txt
Adopt Faith
Sponsor Faith
Tolerate Faiths
Suppress Heresy
```

Effects:

```txt
adopt faith:
  changes stateReligionId
  costs legitimacy
  can trigger unrest in old-faith worlds

sponsor faith:
  increases pilgrim/missionary traffic
  improves prophet loyalty

tolerate faiths:
  reduces religious rebellion chance
  lowers prophet loyalty

suppress heresy:
  increases short-term uniformity
  creates rebel-hotbed / low legitimacy risk
```

#### 3.5 Reform / Corruption

Add soft control-state corruption:

```ts
corruption?: number;
```

Behavior:

```txt
using emergency/ruler commands increases corruption slowly
high corruption lowers authority regen and stability
reform reduces corruption but causes temporary instability
```

Command:

```txt
Reform Government
Emergency Taxes
Purge Court
```

### Success criteria

```txt
Taking control produces unique stories.
The player has a flagship they care about.
Spy actions can backfire diplomatically.
War room directives alter autonomous wars without replacing them.
Religion/government actions create internal consequences.
Empire control feels dangerous and political.
```

## Phase 4: Persistent Oddity Actors

### Current state

Oddities exist as rare crisis events with distinct rules. This is good, but they are not persistent map actors.

### Goal

Some oddities should remain visible and move/interact over time, like strange creatures or cosmic objects the galaxy must live with.

### Types

Add:

```ts
export interface Oddity {
  id: Id;
  kind: OddityKind;
  name: string;
  x: number;
  y: number;
  systemId?: Id;
  targetSystemId?: Id;
  path?: Id[];
  legIndex?: number;
  legProgress?: number;
  strength: number;
  spawnedTick: number;
  expiresTick?: number;
  state: Record<string, number | string | boolean>;
  relatedEmpireIds: Id[];
}
```

Extend `GalaxyState`:

```ts
oddities: Record<Id, Oddity>;
```

### Actor behavior

```txt
star-eater:
  moves slowly between rich/populous systems
  scars systems over time
  can be hunted by sentinel artifacts or fleets

puppet-mind:
  drifts near capitals
  periodically shifts moods or hijacks fleets

sloth-cloud:
  moves slowly through lanes
  slows/deletes fleets and lowers regional stability

replicator:
  lands on systems, spreads copies, then burns out

void-gate:
  stationary anomaly that occasionally teleports fleets
```

### Rendering

Oddities should be visible on the map with unique glyphs and labels.

System inspector should show if an oddity is nearby or affecting the system.

### Events

Oddities should emit events only when something meaningful happens:

```txt
spawned
arrived at system
scarred system
split/replicated
was destroyed
went dormant
warped fleet
changed empire mood
```

### Success criteria

```txt
The player can point at an oddity on the map.
Oddities create ongoing regional stories.
Some oddities are threats; some are weird opportunities.
Oddities interact with artifacts, fleets, and empire control.
```

## Phase 5: Planets as Local Story Inputs

### Current state

Systems have `planets?: PlanetTag[]`, generated during galaxy creation.

### Goal

Planets should provide local flavor and small mechanical hooks without becoming full simulated entities.

### Inspector

For selected system:

```txt
Worlds:
  garden world
  ancient moon
  industrial belt
```

### Mechanical hooks

```txt
garden/oceanic:
  growth bonus, refugee attraction

industrial:
  local wealth and shipyard chance

sacred:
  holy-site/religion events more likely

ruined/ancient:
  artifact/oddity/research events more likely

fortress:
  defense bonus, fortify command stronger

toxic/frozen/barren:
  lower growth, mining/resource events possible
```

### Event hooks

```txt
An ancient moon awakened beneath Varo.
Pilgrims gathered on the sacred ocean of Renmar.
The industrial belts of Kora funded a fleet surge.
Refugees settled the garden world of Iskel.
```

### Success criteria

```txt
Planet tags appear in inspector and reports.
Some local events refer to planet tags.
Planet tags subtly bias system behavior.
Stars feel less like identical dots.
```

## Phase 6: Alliance Identity and Map Mode

### Current state

Alliances exist and form/dissolve automatically, but they are still fairly thin.

### Goal

Alliances should feel like historical entities, not just relationship flags.

### Expand Alliance

```ts
export interface Alliance {
  id: Id;
  name: string;
  color: string;
  emblem: string;
  memberEmpireIds: Id[];
  formedTick: number;
  leaderId: Id;
  purpose: "defensive" | "anti-hegemon" | "trade" | "religious" | "survival";
  historicalEventIds: Id[];
}
```

### Behavior

```txt
anti-hegemon:
  forms against largest nearby empire or common enemy

defensive:
  forms among peaceful/friendly neighbors

trade:
  forms among rich/trade-heavy empires

religious:
  forms among same-faith empires

survival:
  forms among small empires bordering a giant
```

### Map mode

Add `mapMode: "alliance"`.

Rules:

```txt
color empires by alliance if they belong to one
unallied empires use dim own color
show alliance labels at member centroid
```

### Inspector

Empire inspector:

```txt
Alliance: The Varo-Kel Pact
Purpose: Anti-hegemon
Members: 3
Age: 420 ticks
```

Alliance panel:

```txt
members
leader
wars involving members
recent alliance events
```

### Success criteria

```txt
The player can see alliance blocs at a glance.
Alliances form for understandable reasons.
Alliance history survives individual wars.
Alliances shape diplomacy and war decisions.
```

## Phase 7: Shape/Layout Metrics and Preset Tuning

### Current state

Galaxy shapes, starlane modes, and empire layouts exist.

### Goal

Make sure each shape actually creates different historical dynamics, not just different geometry.

### Headless report fields

Add to headless report:

```txt
galaxyShape
starlaneMode
empireLayout
average node degree
average path length
connected component count before stitching if available
largest empire share at 1k/3k/10k
active wars at 1k/3k/10k
empire churn
collapse count
emergence count
alliance count
trade route count
oddity/crisis count
```

### Preset sweep

Add helper:

```txt
runPresetSweep()
```

Presets:

```txt
Classic Spiral
Ring War
Clustered Civilizations
Trade Web
Death Chain
Toybox Chaos
Few Big Blobs
Many One-Star Chaos
```

### Success criteria

```txt
Clustered maps delay contact and then create collision events.
String maps create front-line wars.
Hollow-disc maps create ring-front wars.
Dense lanes increase diplomacy/trade/war complexity.
Few-big-blobs feels different from many-one-star.
Headless reports reveal stagnant presets quickly.
```

## Suggested Implementation Order

### Batch 1: Diplomacy Memory

1. Implement relation modifier helpers.
2. Add modifiers for war, peace, trade, same alliance, common enemy, player forced war/peace.
3. Make diplomacy use effective opinion/tension.
4. Show relation breakdown in inspector.

### Batch 2: Artifact Objects

1. Add `Artifact` type and `state.artifacts`.
2. Migrate existing `artifactName` systems into artifact objects.
3. Implement 4 artifact kinds first:
   - research-lab
   - fleet-base
   - holy-monument
   - financial-center
4. Show artifacts in map/inspector.
5. Add empire-control `Build Artifact` command.

### Batch 3: Empire Control Toys

1. Add flagship fleet kind and spawn on control start.
2. Add flagship commands.
3. Add spy network with two missions: steal tech, incite riots.
4. Add change religion/tolerate faith command.
5. Add corruption/reform as a soft control consequence.

### Batch 4: Persistent Oddities

1. Add `state.oddities`.
2. Convert star-eater into persistent actor.
3. Render oddity glyph.
4. Add oddity inspector info.
5. Add fleet/artifact interactions.

### Batch 5: Planets and Alliances

1. Display planet tags in inspector.
2. Add planet tag behavior hooks.
3. Expand alliance data with purpose/color/emblem/history.
4. Add alliance map mode.
5. Add alliance inspector summary.

### Batch 6: Metrics

1. Expand headless report with shape/layout metrics.
2. Add preset sweep.
3. Tune shape/layout defaults based on report output.

## Non-goals

- Do not turn planets into full colony entities.
- Do not turn empire control into a traditional 4X queue system.
- Do not make every artifact or oddity deterministic and balanced.
- Do not require players to use empire control.
- Do not overload the map without toggles.
- Do not copy Galimulator names, assets, text, or exact mechanics.

## Final Target Feel

The galaxy should support three overlapping modes of play:

```txt
Observer:
  watch strange autonomous history unfold

God sandbox:
  poke the galaxy from outside history

Empire control:
  rule one empire from inside history, with limited authority and political consequences
```

The remaining work should make those modes share the same historical substrate:

```txt
relations remember
artifacts persist
oddities wander
alliances become blocs
planets color local stories
player rule leaves diplomatic and internal scars
```

## One-sentence summary

Turn the new first-pass systems into persistent historical toys: relation memories, artifact structures, flagship/spy control, wandering oddities, planet-driven local stories, alliance blocs, and shape-aware metrics.
