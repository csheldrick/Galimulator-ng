# Galimulator-ng Remaining Feel Gap Plan

## Purpose

`galimulator-ng` now has most of the broad Galimulator-like systems:

- empires
- wars / peace
- alliances
- religions
- dynasties / lineage
- artifacts
- oddities
- galaxy shapes / lane modes
- empire control
- spies
- war room
- local wealth
- ambient ships
- relation modifier ledger

The remaining gaps are not “more stuff everywhere.” They are specific missing social, political, and toybox layers that make the galaxy feel alive rather than merely busy.

This plan closes the remaining high-value gaps:

1. Add first-class internal factions.
2. Add vassal / protectorate / subject-state diplomacy.
3. Add a light observer quest / gift / unlock toy layer.
4. Add modest ship-ecology depth without turning the sim into tactical combat.
5. Upgrade planet tags into slightly richer local planet flavor only where useful.

---

# Phase 1 — First-Class Internal Factions

## Why

The current sim has symptoms of unrest:

- cohesion
- system stability
- rebel-hotbed markers
- minority religions
- pretenders
- coups
- rebellions

But it does not have persistent internal political actors.

Galimulator-like feel needs internal movements that form, grow, pressure empires, negotiate, revolt, dissolve, or become successor states.

## Add types

In `src/types/sim.ts`:

```ts
export type FactionKind =
  | "separatist"
  | "religious"
  | "dynastic"
  | "regional"
  | "military"
  | "merchant"
  | "reformist";

export type FactionStatus =
  | "latent"
  | "active"
  | "suppressed"
  | "revolting"
  | "integrated"
  | "dissolved";

export interface FactionLeader {
  id: Id;
  name: string;
  title: string;
  personId?: Id;
  characterId?: Id;
}

export interface Faction {
  id: Id;
  name: string;
  kind: FactionKind;
  status: FactionStatus;

  originEmpireId: Id | null;
  targetEmpireId: Id | null;

  leader: FactionLeader;

  homeSystemId: Id;
  systemIds: Id[];

  foundedTick: number;
  lastEventTick: number;

  support: number;          // 0..1
  militancy: number;        // 0..1
  legitimacy: number;       // 0..1
  suppression: number;      // 0..1
  uprisingProgress: number; // 0..1

  religionId?: Id | null;
  dynastyId?: Id | null;
  cultureId?: Id | null;

  historicalEventIds: Id[];
}
```

Extend `GalaxyState`:

```ts
factions?: Record<Id, Faction>;
```

Add event types:

```ts
| "faction-formed"
| "faction-grew"
| "faction-suppressed"
| "faction-integrated"
| "faction-uprising"
| "faction-dissolved"
```

## New file

Create:

```txt
src/sim/Factions.ts
```

Exports:

```ts
export function stepFactions(state: GalaxyState, rng: PRNG): void;
export function ensureFactionDefaults(state: GalaxyState): void;
export function engageFaction(
  state: GalaxyState,
  factionId: Id,
  empireId: Id,
  stance: "negotiate" | "suppress" | "appease"
): boolean;
```

## Formation rules

A faction may form when one or more of these pressures exist.

### Separatist faction

Conditions:

```txt
system stability low
system far from capital
culture differs from owner
recent conquest marker or rebel-hotbed marker
empire cohesion low
```

### Religious faction

Conditions:

```txt
minorityReligionId exists
stateReligionId conflicts
religious tension / crusading mood
near holy site or sacred planet tag
```

### Dynastic faction

Conditions:

```txt
living pretender exists
recent succession crisis
dynasty was replaced
old dynasty has surviving members
ruler legitimacy low
```

### Regional faction

Conditions:

```txt
cluster of systems far from capital
trade hub / frontier region
empire has grown large
```

### Military faction

Conditions:

```txt
empire at war too long
admiral has high renown and low loyalty
military strength high, cohesion low
```

### Merchant faction

Conditions:

```txt
wealthy systems
trade routes
financial-center artifact
merchant-guild government
war disrupts trade
```

### Reformist faction

Conditions:

```txt
corruption high
repeated ruler changes
low cohesion but high tech
republic / technocracy / oligarchy context
```

## Tick behavior

Each faction tick:

```txt
support changes based on local stability, cohesion, matching religion/culture/dynasty
militancy rises if ignored, suppressed, or empire is weak
suppression decays slowly
uprisingProgress rises when support + militancy overcome suppression
faction spreads to nearby related systems
faction may dissolve if support collapses
```

## Outcomes

When `uprisingProgress >= 1`:

### Separatist / regional

Spawn a rebellion or successor empire from faction systems.

### Religious

Convert systems, cause a holy revolt, or found a theocracy successor.

### Dynastic

Install a pretender using existing dynasty/person mechanics.

### Military

Trigger a coup or military junta government reform.

### Merchant / reformist

Force government reform, lower corruption, or create a peaceful autonomy event.

## Player / empire-control interaction

Add command:

```ts
commandEngageFaction(
  factionId: Id,
  stance: "negotiate" | "suppress" | "appease"
): boolean;
```

Effects:

```txt
negotiate:
  costs authority
  lowers militancy
  may increase support/legitimacy

suppress:
  costs authority
  increases suppression
  risks violence / legitimacy loss

appease:
  costs wealth / legitimacy
  reduces uprising progress
  may create local autonomy
```

Use the command invariant already established for empire control:

```txt
validate first
spend authority second
mutate third
create event fourth
_touch once
```

## UI

Inspector empire section should show:

```txt
Internal factions
- The Red Synod — religious, 42% uprising, 3 worlds
- House Orun Loyalists — dynastic, 67% uprising, led by Duke Varan
```

System inspector should show local faction presence.

Headless report should include:

```txt
Factions: N active
Faction worlds: N
Faction uprisings: N
Faction integrations: N
```

## Success criteria

After 5k–10k ticks:

- Large empires develop internal factions.
- Minority-faith systems can produce religious factions.
- Succession crises can produce dynastic factions.
- Factions sometimes resolve peacefully.
- Factions sometimes revolt.
- Factions leave event history and inspector-visible state.
- Build and lint pass.

---

# Phase 2 — Vassals, Protectorates, and Subject States

## Why

Current diplomacy is mostly:

```txt
opinion
tension
war
peace
alliance
trade
merge
```

Galimulator-like politics benefits from non-binary relationships:

```txt
subordinate but alive
protected but resentful
tributary
client state
autonomous successor
```

## Add types

In `src/types/sim.ts`:

```ts
export type SubjectStatus =
  | "vassal"
  | "protectorate"
  | "tributary"
  | "client-state";

export interface SubjectRelation {
  id: Id;
  subjectEmpireId: Id;
  overlordEmpireId: Id;
  status: SubjectStatus;

  createdTick: number;
  autonomy: number;    // 0..1, high means more independent
  loyalty: number;     // 0..1, low means rebellion risk
  tributeRate: number; // 0..1, portion of subject wealth flow

  protection: boolean;
  canDeclareWars: boolean;
  canJoinAlliances: boolean;

  historicalEventIds: Id[];
}
```

Extend `GalaxyState`:

```ts
subjects?: Record<Id, SubjectRelation>;
```

Add event types:

```ts
| "subject-created"
| "subject-rebelled"
| "subject-integrated"
| "subject-liberated"
| "tribute-paid"
```

Add save upgrade defaults in `Simulation.upgradeState()`:

```ts
state.subjects ??= {};
```

## New subsystem

Create:

```txt
src/sim/Subjects.ts
```

Export:

```ts
export function stepSubjects(state: GalaxyState, rng: PRNG): void;
export function createSubjectRelation(
  state: GalaxyState,
  subjectEmpireId: Id,
  overlordEmpireId: Id,
  status: SubjectStatus,
  tick: number
): SubjectRelation | null;
export function subjectOf(state: GalaxyState, empireId: Id): SubjectRelation | null;
export function subjectsOf(state: GalaxyState, overlordEmpireId: Id): SubjectRelation[];
export function breakSubjectRelation(
  state: GalaxyState,
  relationId: Id,
  reason: "rebellion" | "liberation" | "integration" | "collapse"
): void;
```

## Subject creation paths

Add several low-frequency creation paths.

### One-sided peace treaty

When two empires are at war and one is much weaker, peace can create a subject relation instead of simple peace.

Suggested condition:

```txt
loser has fewer systems or much lower military
loser still has at least 1–2 systems
winner has enough cohesion
relationship tension high but war exhaustion is high
```

Status choice:

```txt
vassal:
  defeated empire remains political subject

tributary:
  loser pays wealth but keeps autonomy

protectorate:
  weak empire accepts protection from a stronger neighbor

client-state:
  created from collapse/successor context
```

### Alliance alternative

A small allied empire may become a protectorate instead of merging.

### Collapse successor

When an empire collapses and a successor emerges near a strong neighbor, it may spawn as a client-state.

### Player / empire-control command

Optional command:

```ts
commandDemandSubmission(targetEmpireId: Id): boolean;
```

Validate first, spend second. Do not mutate on invalid command.

## Subject tick behavior

Each tick, for each subject relation:

```txt
validate both empires exist; remove if not
tribute: subject wealth decreases slightly, overlord wealth increases
loyalty rises if overlord is strong, protects subject, same religion/alliance/dynasty, good opinion
loyalty falls if tribute too high, autonomy low, overlord loses wars, subject is attacked and not defended
autonomy drifts based on status
protectorates keep higher autonomy
vassals/client-states have lower autonomy
```

### Rebellion

If loyalty is low and the subject has enough military/cohesion:

```txt
break relation
set war between subject and overlord
create subject-rebelled event
record relation modifiers
```

### Integration

If loyalty is high and autonomy is low for long enough:

```txt
transfer subject systems to overlord
remove subject empire
create subject-integrated event
clean relation references
```

### Liberation

If overlord loses a major war or collapses:

```txt
subject becomes independent
create subject-liberated event
```

## Diplomacy integration

Use relation modifiers instead of raw hidden behavior where possible.

Add modifiers:

```txt
Overlord
Subject
Protected subject
Tribute burden
Liberated subject
Supported subject rebellion
```

Effects:

```txt
subject and overlord should not randomly declare war unless rebellion triggers
enemies of the overlord may have a chance to support subject independence later
subject cannot join new alliances unless canJoinAlliances
overlord may pull subject into defensive wars if protection
```

## War integration

When overlord is attacked:

```txt
protectorate/vassal may join defense depending on loyalty and status
```

When subject is attacked:

```txt
overlord should be likely to join defense if protection === true
```

When subject rebels:

```txt
war is explicitly created between subject and overlord
relation modifier records the rebellion
```

## UI

In `InspectorPanel` empire view, show:

For an overlord:

```txt
Subjects
- Namar Protectorate — loyalty 63%, autonomy 72%, tribute 6%
- Vel Tributary — loyalty 41%, autonomy 88%, tribute 12%
```

For a subject:

```txt
Subject State
Protectorate of the Red Concord
Loyalty 63%
Autonomy 72%
Tribute 6%
Protection: yes
```

In relationship inspector, show subject relation if one exists.

## Headless report

Add metrics:

```txt
Subjects: N
Vassals: N
Protectorates: N
Tributaries: N
Client states: N
Subject rebellions: N
Subject integrations: N
Liberations: N
```

## Save/load

- `subjects` persisted in `GalaxyState`
- `upgradeState()` defaults missing `subjects` to `{}`
- old saves load safely

## Invariants

Add defensive cleanup:

```txt
no subject relation references missing empires
subject cannot be its own overlord
one subject should not have multiple overlords
integration deletes/cleans relation references
collapse removes related subject relations
no tribute NaN
no event spam
```

## Success criteria

- Subjects appear occasionally but do not dominate the map.
- Defeated small empires sometimes survive as subordinate states.
- Subjects can rebel or be integrated.
- Protectorates are visibly different from vassals/tributaries.
- Diplomacy and inspector explain the relationship.
- Build and lint pass.

---

# Phase 3 — Observer Quests / Gifts / Unlock Toy Layer

## Why

The simulation is now rich, but Galimulator has toybox interaction: strange gifts, unlocks, oddity offers, and weird choices.

This layer should be light and optional. It should not become a campaign system.

## Add types

```ts
export type QuestKind =
  | "strange-gift"
  | "protect-tomb"
  | "sanctify-world"
  | "hunter-permit"
  | "cult-offer"
  | "artifact-request"
  | "refugee-aid"
  | "dynasty-restoration";

export type QuestStatus =
  | "offered"
  | "accepted"
  | "declined"
  | "completed"
  | "failed"
  | "expired";

export interface ObserverQuest {
  id: Id;
  kind: QuestKind;
  status: QuestStatus;

  title: string;
  description: string;

  offeredTick: number;
  expiresTick: number;

  relatedEmpireIds: Id[];
  relatedSystemIds: Id[];
  relatedPersonIds?: Id[];
  relatedArtifactIds?: Id[];

  reward?: string;
  risk?: string;

  historicalEventIds: Id[];
}
```

Extend `GalaxyState`:

```ts
quests?: Record<Id, ObserverQuest>;
```

Add event types:

```ts
| "quest-offered"
| "quest-accepted"
| "quest-completed"
| "quest-failed"
| "quest-expired"
```

## Quest examples

### Strange gift

```txt
A courier offers a relic.
Accept: creates artifact or oddity.
Decline: nothing.
Risk: cult/faction/oddity.
```

### Protect tomb

```txt
A dying dynasty asks you to protect its imperial tomb.
Accept: system gains marker/artifact.
Fail: dynasty loyalists become faction.
```

### Sanctify world

```txt
A prophet asks you to bless a sacred world.
Accept: strengthens religion, risks religious faction.
```

### Hunter permit

```txt
A hunter asks permission to enter the galaxy to hunt oddities.
Accept: spawns hunter oddity/actor.
Decline: oddities continue unchecked.
```

### Cult offer

```txt
A cult offers power.
Accept: artifact/tech boost, but may spawn puppet-mind or faction.
```

### Dynasty restoration

```txt
A surviving noble asks for help restoring an old house.
Accept: creates dynastic faction or pretender event.
```

## UI

Add a small “Offers” or “Strange Gifts” section:

```txt
A dying house requests protection
[Accept] [Decline]
```

No more than 1–3 active offers at a time.

## Unlocks

Add lightweight observer unlock tracking:

```ts
export interface UnlockState {
  seenOddityKinds: Record<OddityKind, boolean>;
  seenArtifactKinds: Record<ArtifactKind, boolean>;
  seenShipClasses: Record<string, boolean>;
}
```

Use unlocks only for sandbox spawning UI later. Do not gate normal simulation.

## Success criteria

- Player occasionally receives weird choices.
- Choices alter the simulation.
- Quests reference existing systems: dynasties, artifacts, oddities, factions, religions.
- No campaign complexity.
- Headless report tracks offers/completions.

---

# Phase 4 — Ship Ecology Depth

## Why

Ships are visible life. Current fleets are better than before, but still simplified.

Do not add tactical combat. Add memorable ship actors with simple map rules.

## Extend `FleetKind`

Current:

```ts
"colonizer" | "war" | "patrol" | "merchant" | "pilgrim" | "refugee" | "flagship"
```

Add carefully:

```ts
| "science"
| "missionary"
| "warden"
| "raider"
| "courier"
```

## Add optional fleet metadata

```ts
fleet.experience?: number;
fleet.level?: number;
fleet.special?: string;
```

## Ship rules

### Science ship

Visits high-resource / ancient / artifact systems.

Effect:

```txt
boosts tech
can discover artifacts
generates science event
```

### Missionary ship

Travels from holy world / religious empire to neighboring systems.

Effect:

```txt
spreads religion
strengthens minority faith
can trigger religious faction
```

### Warden

Appears around tombs, sentinel stations, dead capitals, or transcendent ruins.

Effect:

```txt
guards system
repels monsters/oddities
survives empire collapse
```

### Raider

Targets trade hubs / weak systems.

Effect:

```txt
steals local wealth
adds border-clash relation modifier
may be state-sponsored
```

### Courier

Tiny ambient / quest-related ship.

Effect:

```txt
delivers quest offers
connects dynastic marriage / diplomacy events
mostly visual
```

## XP / levels

Only for named/special fleets:

```txt
war fleet wins battle: +xp
flagship survives mission: +xp
warden repels oddity: +xp
science ship discovers artifact: +xp
```

Level effects should be small:

```txt
+speed
+strength
+event importance
title upgrade
```

## UI

Fleet inspector:

```txt
Class: Raider
Level: 2
Deed: Looted 3 trade hubs
```

## Success criteria

- Map has more non-war movement.
- Special ships create readable stories.
- No projectile combat or micro queues.
- Performance stays stable.

---

# Phase 5 — Planet Flavor Upgrade

## Why

Current planets are tags. That is probably enough mechanically, but it can feel thin in the inspector.

Do not build a full planet sim. Upgrade tags into lightweight named local flavor.

## Replace or augment

Current:

```ts
planets?: PlanetTag[];
```

Add optional full object support:

```ts
export interface Planet {
  id: Id;
  name: string;
  tags: PlanetTag[];
  habitability: number;
  populationShare: number;
  description?: string;
}
```

Use:

```ts
planets?: Planet[] | PlanetTag[];
```

Or migrate directly if simpler.

## Planet generation

Each star gets 1–4 planet entries:

```txt
garden moon
industrial world
ruined planet
fortress moon
sacred ocean
toxic mining world
ancient ring
```

## Mechanics stay light

Planets influence existing fields:

```txt
industrial: local wealth
fortress: defense
sacred: religion/faction events
ancient: artifacts/oddities
garden/oceanic: habitability
toxic/frozen/barren: low growth but maybe resources
ruined: markers, tombs, old dynasty hooks
```

## UI

System inspector:

```txt
Planets
- Vala Prime — garden, oceanic
- The Black Moon — ancient, ruined
- Kord Bastion — fortress
```

## Success criteria

- Systems feel like places.
- No per-planet tick loop unless necessary.
- Existing star-level mechanics remain primary.

---

# Phase 6 — Validation and Reports

## Build checks

After every phase:

```bash
npm run build
npm run lint
```

## Headless checks

Add/extend headless metrics:

```txt
factions active
faction uprisings
subjects active
subject rebellions
quests offered/completed
special ships spawned
deepest dynasty chain
```

## Scenario checks

Run these manually or via scripts:

```txt
1. 3k ticks classic spiral
2. 3k ticks string lanes
3. 3k ticks continents
4. 10k ticks high empire count
5. 30k soak
6. save/export/import after 5k ticks
```

## Required invariants

```txt
No crashes
No NaN fields
No orphan subject relations
No faction referencing missing systems/empires
No quest referencing deleted objects without fallback text
No duplicate event IDs
Save/load preserves counters
Deterministic replay remains deterministic for same seed/settings
```

---

# Implementation Order

Recommended order:

```txt
1. Factions
2. Vassals / protectorates
3. Quests / gifts / unlocks
4. Ship ecology
5. Planet flavor
6. Validation + docs
```

Each phase should be its own PR.

---

# PR 1 Prompt — Internal Factions

Implement first-class internal factions.

Add:

- `FactionKind`
- `FactionStatus`
- `FactionLeader`
- `Faction`
- `GalaxyState.factions`
- faction event types
- `src/sim/Factions.ts`
- `stepFactions(state, rng)`

Faction kinds:

- separatist
- religious
- dynastic
- regional
- military
- merchant
- reformist

Behavior:

- factions form from low stability, minority faith, succession crisis, old dynasty remnants, distant regions, disloyal admirals, wealthy trade hubs, or corruption.
- factions gain/lose support.
- factions spread to related systems.
- factions can be negotiated with, suppressed, integrated, dissolved, or revolt.
- revolts can spawn successor empires, install pretenders, force reform, or convert systems.

Wire:

- call `stepFactions()` in `executeTick()` after dynasties/politics and before collapse.
- add save upgrade defaults.
- add inspector display.
- add headless metrics.

Do not add vassals or quests in this PR.

---

# PR 2 Prompt — Subject States

Implement vassals/protectorates/tributaries/client states.

Add:

- `SubjectStatus`
- `SubjectRelation`
- `GalaxyState.subjects`
- subject event types
- `src/sim/Subjects.ts`
- `stepSubjects(state, rng)`

Behavior:

- one-sided peace can create subject states.
- small allies may become protectorates instead of merging.
- collapse successors may become client states.
- subjects pay tribute.
- overlords protect subjects.
- subjects can rebel, integrate, or be liberated.
- subject relations affect diplomacy via relation modifiers.

Wire:

- call `stepSubjects()` in `executeTick()`.
- add inspector display.
- add headless metrics.
- add save upgrade defaults.

Do not add quests in this PR.

---

# PR 3 Prompt — Observer Quests and Gifts

Implement light observer quest/gift toy layer.

Add:

- `QuestKind`
- `QuestStatus`
- `ObserverQuest`
- `GalaxyState.quests`
- quest event types
- `src/sim/Quests.ts`

Quest types:

- strange-gift
- protect-tomb
- sanctify-world
- hunter-permit
- cult-offer
- artifact-request
- refugee-aid
- dynasty-restoration

Behavior:

- at most 1–3 active offers.
- quests are optional observer choices.
- accepting/declining affects existing systems: artifacts, oddities, factions, dynasties, religions, refugees.
- expired quests fail quietly or create small consequences.

UI:

- add Offers panel or section.
- Accept / Decline buttons.

Do not create campaign progression.

---

# PR 4 Prompt — Ship Ecology

Add lightweight special ship ecology.

Add fleet kinds:

- science
- missionary
- warden
- raider
- courier

Add optional fleet fields:

- experience
- level
- special

Behavior:

- science ships discover/boost tech.
- missionary ships spread faith.
- wardens guard tombs/relics/transcendent ruins.
- raiders hit trade hubs and create relation memories.
- couriers support quest/diplomacy flavor.

No tactical combat.
No projectile system.
No micro ship queues.

---

# PR 5 Prompt — Planet Flavor Upgrade

Upgrade planet tags into lightweight planet objects.

Add:

- `Planet`
- generated planet names
- 1–4 planets per star
- inspector display

Keep mechanics star-level.

Planet effects:

- industrial: local wealth
- fortress: defense
- sacred: religion/faction events
- ancient: artifacts/oddities
- garden/oceanic: habitability
- toxic/frozen/barren: lower growth, possible resources
- ruined: tombs, old dynasty, markers

Do not add a per-planet simulation loop unless required.
