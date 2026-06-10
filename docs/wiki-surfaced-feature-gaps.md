# Wiki-Surfaced Feature Gaps

## Purpose

This document captures additional `galimulator-ng` gaps surfaced from the Galimulator wiki after the initial feel-restoration and galaxy-creation plans.

The goal is not to copy Galimulator content, names, assets, or exact mechanics. The goal is to identify categories of feel that make the original more toy-like, weird, and history-rich, then translate those into original systems for `galimulator-ng`.

## High-level finding

`galimulator-ng` already has the broad categories: empires, stars, fleets, wars, religions, artifacts, monsters, crises, trade, collapse, and control tools.

The wiki suggests the missing feel is mostly in **depth, specificity, and toy interactions**:

- stars are more than ownership nodes
- planets exist under stars
- artifacts are persistent structures with weird active effects
- ships are a whole ecology, not just fleet classes
- diplomacy includes alliances, merges, relation modifiers, vassal-like states, and accidents
- emperor mode has spy networks, war-room assignments, ship building, government reform, corruption, factions, and a flagship
- governments are mostly flavor, but the flavor list is huge and absurd
- space oddities are not generic monsters; they are bespoke weird objects with highly distinct behavior

## Gap 1: Stars need substructure

### Wiki signal

Stars are the smallest controllable territorial unit, but each star can act as shipyard, capital, starlane hub, conquest target, religious location, faction site, and more. Each star also has variables such as wealth, majority/minority faith, and sometimes separatist faction control.

The wiki also describes star systems as having generated planets, habitability stars, random planet keywords, and rare planet descriptions.

### Current likely gap

`galimulator-ng` has strong star-level fields, but stars may still feel like abstract dots. Planets are not represented as inspectable local texture.

### Proposed feature

Add lightweight `Planet` data under each `StarSystem`:

```ts
export interface Planet {
  id: Id;
  name: string;
  habitability: number;
  populationCapacity: number;
  tags: PlanetTag[];
  description?: string;
}

export type PlanetTag =
  | "barren"
  | "oceanic"
  | "industrial"
  | "sacred"
  | "ruined"
  | "fortress"
  | "garden"
  | "toxic"
  | "ancient"
  | "mining"
  | "ringed"
  | "stormy"
  | "habitat"
  | "nomad-haven";
```

Planets do not need to be full simulation entities. They should mostly provide:

- inspector flavor
- local modifiers
- reasons a system matters
- event text hooks
- artifact placement flavor
- faction/religion flavor

## Gap 2: Majority/minority religion and faction pressure

### Wiki signal

Religion is not just an empire-level state. Each star has a major and minor religion; rebellions often happen when religion spreads from neighbors; religion affects diplomatic relation scores. Some religions also have exclusive ships.

### Current likely gap

`galimulator-ng` has one `religionId` per star and a `stateReligionId` per empire. This is good, but likely too binary.

### Proposed feature

Replace or augment star religion with:

```ts
religionMajorityId: Id | null;
religionMinorityId: Id | null;
religionPressure: Record<Id, number>;
```

A simpler first step:

```ts
minorityReligionId?: Id | null;
religiousTension?: number;
```

Use this to drive:

- reform movements
- religious rebellions
- crusader pressure
- faith-specific ambient ships
- state-faith backlash
- diplomacy modifiers

## Gap 3: Persistent artifacts with active effects

### Wiki signal

Artifacts are structures built on stars. An empire can build one during its lifetime, while others must be captured. All artifacts attract trade ships. Examples include wormhole disruption, research labs, missile stations, mind-control hubs, fleet bases, forcefields, financial centers, holy sites, sentinel stations, imperial tombs, and weapons platforms.

### Current likely gap

`galimulator-ng` has artifacts, but they are mostly discovered/reward events. The wiki points toward artifacts as persistent, visible, active, place-based objects.

### Proposed feature

Replace `artifactName: string | null` with persistent artifacts:

```ts
export type ArtifactKind =
  | "wormhole-disruptor"
  | "lunar-monument"
  | "research-lab"
  | "missile-station"
  | "mind-control-hub"
  | "fleet-base"
  | "stellar-forcefield"
  | "disrupt-launcher"
  | "financial-center"
  | "holy-site"
  | "sentinel-station"
  | "imperial-tomb"
  | "weapons-platform"
  | "lost-archive"
  | "strange-engine";

export interface Artifact {
  id: Id;
  systemId: Id;
  ownerEmpireId: Id | null;
  kind: ArtifactKind;
  name: string;
  builtTick?: number;
  discoveredTick?: number;
  cooldownUntilTick?: number;
  active: boolean;
}
```

Use artifacts to create:

- trade attraction
- map icons
- local defense/offense
- religious pressure
- tech acceleration
- wormhole/lane disruption
- ghost/warden/legacy events
- empire-control build choices

## Gap 4: Ship ecology is much richer than current fleet classes

### Wiki signal

Ships include combat ships, support ships, carriers, drop ships, science ships, disruptors, gun stations, terror ships, shield ships, dreadnoughts, native ships, flagships, wardens, mind-control pods, ghosts, trade ships, civilian ships, and religion-specific ships. Ships can gain XP and levels. Civilian ships are cosmetic and vary by tech tier.

### Current likely gap

`galimulator-ng` has fleet kinds and ship classes, but not a living ship ecology. This was already partially addressed by Ambient Life, but the wiki confirms it is a major feel source.

### Proposed feature

Add a layered ship model:

```txt
Strategic fleets:
  colonizer, war fleet, patrol, armada

Tactical/special ships:
  carrier, science ship, disruptor, station, flagship, warden, missionary ship

Ambient ships:
  civilian, trade, pilgrim, refugee, courier, survey
```

Do not implement full projectile combat in the first pass. Instead, represent special ships as map actors with simple effects:

- science ship visits systems and boosts research after enough discoveries
- disruptor temporarily blocks a lane/system
- carrier increases fleet strength and creates fighter visual particles
- warden guards relics after empire collapse/transcendence
- trade ships move between wealthy/resource/artifact systems
- civilian ship shape depends on tech tier
- religion-specific missionary ships spread faith
- flagship exists only in empire-control mode and can be directly moved

## Gap 5: Emperor mode needs concrete toy controls

### Wiki signal

Emperor mode includes: take control button, tap to summon/move a fleet, change religion, switch between fortifying/expanding, spy network, factions, diplomacy screen, war room, build artifact, ship construction, corruption/reform government, resign, negotiation actions, heirs, and faction leaders.

### Current plan coverage

The existing empire-control plan covers mode switching, authority/legitimacy, priorities, commands, and consequences, but it should explicitly include these toy controls.

### Additions to empire-control plan

```txt
Tap-to-command fleet:
  click/tap star to send flagship or rally fleet

Change religion:
  costs legitimacy, causes degeneration/unrest period, starts conversion pressure

Fortifying/expanding switch:
  hard player-facing stance toggle, not just hidden mood

Spy network:
  one spy mission per target empire:
    incite riots
    steal tech
    improve relations
    sabotage artifact
    scout war strength

Factions panel:
  show internal factions, separatists, religious blocs, court blocs

War room:
  assign named admirals or fleet focus to specific wars
  attack-focused vs defense-focused assignments

Build artifact:
  one major imperial artifact per empire lifetime unless captured

Ship construction:
  limited capacity based on empire size
  mostly broad choices, not micro queues

Corruption/reform:
  corruption rises during control
  reform reduces corruption but causes temporary instability and faster future corruption

Resign:
  leave empire control and return to observer

Flagship:
  direct-control ruler ship used only in empire mode
  can move without starlanes
  supports nearby systems
  respawns or returns if destroyed depending on difficulty
```

## Gap 6: Diplomacy needs relations as history, not just tension

### Wiki signal

Diplomacy is relation-score based. War/peace depends on relation crossing zero. Relations have many modifiers: basic compatibility, fortifying/building stance, diplomatic disasters/master strokes, common enemies, alliances, religion, dynasty, tech difference, spies, vassal-like relationships, rebels, capital occupation, crusades, and user intervention.

Two empires can merge, even if not friendly.

### Current likely gap

`galimulator-ng` has relationships/tensions, war declarations, peace treaties, and trade tension cooling. The missing layer is a richer relation ledger and diplomatic weirdness.

### Proposed feature

Add relationship modifiers as persistent records:

```ts
export interface RelationModifier {
  id: Id;
  kind: RelationModifierKind;
  label: string;
  value: number;
  sourceEmpireId?: Id;
  targetEmpireId?: Id;
  createdTick: number;
  expiresTick?: number;
  decayPerTick?: number;
  stackable: boolean;
}
```

Examples:

```txt
basic compatibility
same religion
different alliance
same dynasty
common enemy
capital occupied
recent rebellion
spy improves relations
diplomatic accident
master stroke
tech awe/fear
crusade hatred
user forced war/peace
```

Add:

- alliance formation and collapse
- alliance map mode
- relation breakdown inspector
- diplomatic accidents/master strokes
- rare empire merges
- vassal/protectorate status later

## Gap 7: Alliances as first-class historical actors

### Wiki signal

Alliances have emblems/flags/colors, can have unlimited members, usually form to fight common enemies or build relations, can age from birth like empires, and disappear when fewer than two members remain.

### Current likely gap

`galimulator-ng` has relationship and trade, but not first-class alliance entities.

### Proposed feature

Add:

```ts
export interface Alliance {
  id: Id;
  name: string;
  color: string;
  emblem: string;
  foundedTick: number;
  memberEmpireIds: Id[];
  locked?: boolean;
  historicalEventIds: Id[];
}
```

Alliance events:

```txt
formed against common enemy
member joined
member betrayed alliance
member collapsed
alliance dissolved
alliance victory
alliance schism
```

Alliance should influence:

- war decisions
- peace decisions
- trade route density
- map mode
- diplomacy modifiers
- player negotiation

## Gap 8: Government type flavor should be huge and weird

### Wiki signal

Galimulator has a large list of government and leadership names, but the wiki notes these do not change gameplay; they mostly affect naming/flavor.

### Current likely gap

`galimulator-ng` has ideologies and ruler titles, but government flavor may be too narrow.

### Proposed feature

Add `governmentType` as mostly flavor:

```ts
export interface GovernmentType {
  id: string;
  label: string;
  rulerTitlePool: string[];
  namePatternPool: string[];
  flavorTags: string[];
}
```

Use government type for:

- empire naming
- rebellion/successor naming
- court title flavor
- event text
- rare minor modifiers only if desired

Keep mechanics mostly on `ideology`, `mood`, `culture`, `religion`, and `relationships`, not government type.

## Gap 9: Space oddities should be bespoke, not generic monsters

### Wiki signal

Space Oddities include many highly specific entities: harmless ones, hunters, meteors, invincible star eaters, puppet/mind-control entities, degeneration clouds, dragons that split, self-replicating machines, love-spreading replicators, plagues, marauders, and more. The key is behavioral uniqueness.

### Current likely gap

`galimulator-ng` has three monster kinds and some galactic crises. Good start, but likely too generic.

### Proposed feature

Create an `Oddity` framework separate from generic monsters:

```ts
export type OddityKind =
  | "meteor-storm"
  | "hunter"
  | "star-eater"
  | "puppet-mind"
  | "sloth-cloud"
  | "dragon-chain"
  | "replicator-fragment"
  | "peaceful-wanderer"
  | "marauder"
  | "galaxy-plague"
  | "cosmic-gift";

export interface Oddity {
  id: Id;
  kind: OddityKind;
  name: string;
  state: Record<string, unknown>;
  x: number;
  y: number;
  spawnedTick: number;
  targetSystemIds: Id[];
  relatedEmpireIds: Id[];
}
```

Behavior principles:

- each oddity should have one memorable rule
- some should be harmless
- some should be existential
- some should interact with artifacts
- some should create cults/factions
- some should self-replicate
- some should be hunter/prey pairs
- some should leave scars/markers

Example original translations:

```txt
star-eater:
  marks several stars, then destroys or scars them

puppet-mind:
  hijacks ships/fleets temporarily

sloth-cloud:
  forces touched empires into degeneration/decay

replicator-fragment:
  lands on stars, spawns drones, eventually burns out

peaceful-wanderer:
  harmless visual entity that causes pilgrimages or festivals

hunter:
  neutral anti-oddity actor that appears when too many oddities exist
```

## Gap 10: Quests / gifts / unlocks

### Wiki signal

The wiki references quest gifts, ship unlocks by clicking ships, and oddities spawned by accepting gifts. It also mentions ships can be unlocked for sandbox spawning once seen/clicked.

### Current likely gap

`galimulator-ng` does not appear to have a meta toy unlock layer or quest/gift layer.

### Proposed feature

Add optional observer quests/gifts:

```txt
A strange courier offers a relic.
A dying empire asks you to protect its tomb.
A hunter asks permission to enter the galaxy.
A cult offers a gift that may summon a dangerous oddity.
A prophet asks you to sanctify a world.
```

This should be optional and light. It gives the observer small weird choices without becoming a campaign.

## Gap 11: Wealth should be local and visual

### Wiki signal

Wealth affects combat and research. The empire information page reports average wealth across stars. Artifacts and trade ships interact with wealth.

### Current likely gap

`galimulator-ng` has empire wealth and star resources, but wealth may not be visible/local enough.

### Proposed feature

Separate:

```txt
resources:
  natural/system value

wealth:
  economic development/current prosperity

trade value:
  moving commerce pressure from routes/artifacts
```

Use local wealth for:

- visual map mode
- trade ships
- artifacts
- research chance
- rebellion/corruption targets
- war target selection
- empire average display

## Priority recommendations

### Highest feel impact

1. Persistent artifacts with active effects
2. Alliance entities + alliance map mode
3. Richer ship ecology / civilian ships by tech tier
4. Star substructure / planets / majority-minority faith
5. Oddities as bespoke weird actors

### Best fit with existing plans

Already covered but should be strengthened:

- civilian/trade ships -> Ambient Life plan
- world markers/scars -> Persistent Scars plan
- empire control -> add spy network, war room, artifact building, ship construction, corruption/reform, flagship
- galaxy creation -> already captured in separate creation-variety plan

### Minimal next implementation batch

```txt
1. Add Alliance type and simple alliance map mode.
2. Convert artifacts from string reward to persistent structures.
3. Add civilian/trade ships by tech tier.
4. Add relation modifier ledger.
5. Add one bespoke oddity: star-eater or replicator-fragment.
6. Add planets as inspector flavor only.
```

## Non-goals

- Do not copy exact artifact names, sprites, religion names, ship names, or oddity names.
- Do not implement full projectile combat unless the project explicitly shifts toward that.
- Do not make every government type mechanically distinct.
- Do not turn quests into a campaign.
- Do not overload the map before adding view toggles and caps.

## One-sentence summary

The wiki points less to missing top-level systems and more to missing toy depth: persistent artifacts, ship ecology, alliances, relation ledgers, star/planet texture, bespoke oddities, and concrete emperor-mode controls.
