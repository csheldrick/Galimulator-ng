# Original Galimulator Polish Implementation Plan

## Implementation Status

- Gap 1 (Sandbox commands): **Done** — `sandboxSpawnMonster`, `sandboxSpawnOddity`, `sandboxThrowMeteor`, `sandboxSeedFaction` on `Simulation`, surfaced in the inspector (system god controls + galaxy Sandbox section). Every command emits an event. Explicit `PlayerMode` enum not added; god controls remain the sandbox surface.
- Gap 2 (Subject states / diplomacy requests): **Done** — `SubjectRelation` (vassal/protectorate/tributary/client-state) in `src/sim/Subjects.ts`: tribute, loyalty/autonomy drift, protective war joins, rebellion, integration, liberation; created via one-sided peace, voluntary protectorates, and the `commandDemandSubmission` emperor command. Structural relation modifiers (Subject/Overlord/Tribute burden) and war/alliance/merge guards included.
- Gap 3 (Ship roles / build menu): **Done** — `ShipRole` layer (science/missionary/support/gunstation/dropship/disruptor) in `src/sim/ShipRoles.ts` with `buildableIn` metadata; the raider/strike/armada classes remain the battleship line. Systemic effects only: science raises tech and discovers artifacts, missionaries spread the state faith, support ships stabilize and repair, gun stations add stationary local defense, dropships sponsor frontier colonization, disruptors slow enemy fleets. Role-aware patrol routing; AI empires commission fitting specialists; compact build menu replaces the fixed Raider/Strike/Armada buttons; role tints + gunstation ring on the map.
- Gap 4 (Planet objects): **Done (lightweight)** — `Planet` objects in `StarSystem.worlds`, deterministically derived from tags (`worldsFromTags`); named worlds with type/habitability/population share in the inspector. Mechanics stay tag/star-level.
- Gap 5 (Faction polish): **Done** — `status`/`support`/`militancy`/`legitimacy` fields maintained each tick, shown in inspector, plus sandbox seed-faction command and headless tallies.
- Gap 6 (Career readability): **Done** — bounded career logs on `Character` (appointed, won/lost battles, mutinies) and milestone logs on `Person` (founded house, crowned ruler); shown in court tooltips and a ruler Milestones row in the lineage section; headless report tallies promotions/falls and names the top house by prestige.
- Gap 7 (Artifact build choice): **Done** — Build Artifact now has an artifact-kind menu in the Empire Control panel.
- Gap 8 (Report expansion): **Done** — headless report now tallies factions (active/worlds/near-uprising/formed/uprisings), subjects (by status, created/rebelled/integrated/liberated), quests, specialist ships by role, and career promotions/falls with the top house by prestige.

## Purpose

This is a planning-only audit. No implementation is included here.

Goal: bring `galimulator-ng` closer to the public feature shape of original Galimulator while keeping this project browser-native, deterministic, and original in content/assets/text.

## Source Evidence Used

### Public original Galimulator feature contract

- Steam app details for `Galimulator` describe the game as a galactic empire simulation and sandbox where empires rise/fall, dynasties gain prestige, and strange monsters can be introduced.
  Source: https://store.steampowered.com/api/appdetails?appids=808100&l=en
- Steam detailed description says original Galimulator simulates wars, revolutions, politics, research, and bizarre events in a random galaxy; supports Observer, Sandbox, and Emperor modes; and includes conquest, ship building, strange space monsters, intergalactic quests, technology, political modes, artifacts, transcendence, dynasties, individual people, flagship use, ship control, and spy networks.
  Source: https://store.steampowered.com/app/808100/Galimulator/
- Google Play repeats the same mode and feature list and explicitly calls out Sandbox freedom such as making empires degenerate and throwing meteors.
  Source: https://play.google.com/store/apps/details?id=snoddasmannen.galimulator&hl=en_US&gl=US

### Public Galimulator mod API evidence

These are not the original game source, but they are public wrapper/API evidence for concepts exposed by Galimulator:

- Factions can control stars and rebel into an empire: `stianloader/Starloader-API`, `Faction.java` lines 8, 41, 52.
  Source: https://github.com/stianloader/Starloader-API/blob/master/src/main/java/de/geolykt/starloader/api/empire/Faction.java
- Planets are part of star systems and expose keywords, population, and type: `Planet.java` lines 8, 22, 47, 55.
  Source: https://github.com/stianloader/Starloader-API/blob/master/src/main/java/de/geolykt/starloader/api/empire/Planet.java
- Alliances are first-class, named, colored, member-bearing diplomacy objects: `Alliance.java` lines 11, 28, 73.
  Source: https://github.com/stianloader/Starloader-API/blob/master/src/main/java/de/geolykt/starloader/api/empire/Alliance.java
- Spacecraft are actively built by empires and distinguish Emperor-buildable from Sandbox-buildable: `Spacecraft.java` lines 4, 18, 26.
  Source: https://github.com/stianloader/Starloader-API/blob/master/src/main/java/de/geolykt/starloader/api/actor/Spacecraft.java
- Diplomacy requests are discrete player-facing actions with text, validation, and action responses: `DiplomacyRequest.java` lines 8, 27, 35, 47.
  Source: https://github.com/stianloader/Starloader-API/blob/master/src/main/java/de/geolykt/starloader/api/player/DiplomacyRequest.java
- Active empires expose alliance, religion, ship-capacity modifiers, specials, and a Flagship import: `ActiveEmpire.java` lines 23, 55, 79, 124, 226.
  Source: https://github.com/stianloader/Starloader-API/blob/master/src/main/java/de/geolykt/starloader/api/empire/ActiveEmpire.java

### Current `galimulator-ng` implementation evidence

- Current core types already include alliances, factions, player control, galaxy shapes, oddities, dynasties/people, artifacts, and fleet kinds: `src/types/sim.ts` lines 205, 208, 405, 450, 469, 509, 520, 549, 576.
- Current emperor mode already has flagship, build ship, build artifact, spy mission, war room directive, faction engagement, religion adoption, and reform government commands: `src/sim/Simulation.ts` lines 398, 500, 545, 699, 720, 769, 797, 829, 849.
- Current UI exposes those emperor commands: `src/ui/EmpireControlPanel.tsx` lines 223, 226-230, 246-249, 257, 283, 285.
- Current tick loop already advances factions, quests, ambient ships, alliances, ship construction, oddities, artifacts, and player control: `src/sim/Tick.ts` lines 212, 328, 736, 755, 1190, 1823-1828.
- Current headless report covers broad health metrics but does not directly tally factions, quests, ship classes, subject diplomacy, or sandbox interventions: `src/sim/Headless.ts` lines 115-164.
- Current code has no `vassal`, `subject`, or `protector` type/command references; no `spawnMonster` command; and no `meteor` command. Evidence: targeted repo searches returned no matches in `src/types/sim.ts`, `src/sim/Simulation.ts`, `src/sim/Tick.ts`, and `src/sim/Headless.ts`.

## Coverage Assessment

`galimulator-ng` already covers the public broad strokes well:

- observer simulation
- generated galaxy and empires
- expansion, war, peace, collapse, rebellion, emergence
- research/technology progression
- politics, moods, governments, dynasties, court characters
- religion, trade, alliances, artifacts, quests, monsters, oddities, transcendence
- emperor mode with flagship, ship building, spy operations, war-room stances, artifacts, religion, reforms, factions
- sandbox-like god controls for systems, empires, war/peace, merges, and manual founding

The remaining work is a polish/parity pass. The highest-value gaps are below.

## Gap 1: Sandbox Mode Is Too Narrow

### Evidence

Original public pages present Sandbox as a first-class mode with broad freedom, including empire degeneration and meteor-like direct interventions. The Starloader `Spacecraft` API also separates Emperor-buildable from Sandbox-buildable actors.

Current `galimulator-ng` has god controls, but they are scattered through the inspector and limited to boost/devastate/free/found empire, strengthen/destabilize/inflame/pacify, force war/peace/merge. There are no current `spawnMonster`, `spawnOddity`, `spawnShip`, or `meteor` commands.

### Plan

1. Add an explicit `PlayerMode = "observer" | "sandbox" | "empire"` instead of treating inspector god controls as implicit sandbox.
2. Add a dedicated Sandbox tab with deterministic commands:
   - spawn monster
   - spawn oddity
   - throw meteor/devastating strike at a star
   - create artifact on selected star
   - seed faction on selected empire/star
   - spawn fleet/ship actor for selected empire
   - set owner/free/transfer selected star
   - force mood/state changes
3. Use existing sim primitives where possible: `devastateSystem`, `createArtifact`, oddity creation logic, fleet creation, `forceWar`, `forcePeace`, `forceMerge`.
4. Every sandbox command must create an event and mark related empire/system IDs.
5. Add headless counters for sandbox command events only if commands are allowed in automated reports; otherwise explicitly exclude sandbox mutations from reports.

## Gap 2: Diplomacy Needs Request-Style Actions And Subject States

### Evidence

Original public pages emphasize politics and Emperor-mode control. Starloader exposes discrete `DiplomacyRequest` actions with text, validation, and responses. Current `galimulator-ng` diplomacy has relations, war/peace, alliances, merges, and relation modifiers, but no subject/vassal/protectorate model and no request/response diplomacy surface.

Targeted searches found no `vassal`, `subject`, or `protector` type/command references.

### Plan

1. Add a small treaty layer:
   - `TreatyKind = "alliance" | "vassalage" | "protectorate" | "tribute" | "non-aggression"`
   - `DiplomacyRequestKind = "demand-tribute" | "offer-protection" | "request-aid" | "demand-vassalage" | "break-treaty"`
2. Keep alliances as-is, but let treaties coexist as separate records.
3. Subject-state effects:
   - subject pays periodic wealth/tech tribute
   - overlord may be dragged into defense
   - subject cannot merge or join another alliance while treaty is active
   - high tension can trigger independence revolt
4. UI:
   - relationship row shows treaty badges
   - selected empire pair exposes valid diplomacy requests
   - responses are event-backed and added to relation modifiers
5. Headless report:
   - active treaties by kind
   - subject revolts
   - tribute totals

## Gap 3: Ship Ecology Is Present But Still Coarse

### Evidence

Original public pages call out ship building and ship control. Starloader exposes many spacecraft specs, including battleships, dropships, gunstations, and healships, and each spacecraft declares whether it is Emperor-buildable and Sandbox-buildable.

Current `galimulator-ng` has `FleetKind = colonizer | war | patrol | merchant | pilgrim | refugee | flagship | quest` and `ShipClass = settler | raider | strike | armada`. Patrols level up, ambient ships exist, and war fleets vary by class, but there are no support ships, stations, dropships, heal/support roles, or explicit sandbox-buildable actor list.

### Plan

1. Keep strategic fleet resolution, but add a light `ShipRole` layer:
   - `battleship`
   - `dropship`
   - `gunstation`
   - `support`
   - `disruptor`
   - `missionary`
   - `science`
2. Add `buildableIn: { emperor: boolean; sandbox: boolean }` metadata for each role.
3. Effects remain systemic, not tactical:
   - gunstation adds local defense and marker
   - support improves patrol recovery/stability
   - dropship improves assault/colonization outcomes
   - disruptor temporarily blocks or slows lane use
   - science improves tech and discovers artifacts
   - missionary improves religion spread
4. UI:
   - replace fixed Build Raider/Strike/Armada buttons with a compact build menu
   - show capacity, active ships, and role effects
5. Rendering:
   - add distinct glyphs/colors for roles without adding full combat animation.

## Gap 4: Planets Need To Become Inspectable Local Objects

### Evidence

Starloader `Planet` exposes name, keywords, population, ordinal, parent star, and type. Current `galimulator-ng` has `StarSystem.planets?: PlanetTag[]`, not first-class planet objects.

This means planets currently work as lightweight modifiers/flavor, but cannot carry names, population, type, local history, or per-planet display.

### Plan

1. Replace or augment `PlanetTag[]` with:
   - `Planet { id, name, ordinal, type, population, habitability, tags, description?, recentEventIds? }`
2. Preserve save compatibility by upgrading `PlanetTag[]` into generated `Planet[]`.
3. Keep star ownership as the territorial unit; do not create planet-level conquest.
4. Use planets for:
   - inspector local flavor
   - population/habitability breakdown
   - artifact placement text
   - faction/religion event hooks
   - meteor/sandbox target flavor
5. Add headless metrics:
   - rare planet tags
   - planet-driven events

## Gap 5: Factions Exist But Need Star-Control Polish

### Evidence

Starloader `Faction` says factions can control stars and rebel. Current `galimulator-ng` has `Faction.systemIds`, `StarSystem.factionId`, faction spread, faction engagement, and faction uprising into a rebel empire.

Current faction model is functional, but narrow:

- faction kinds are only `separatist | religious | court | regional`
- no explicit faction status
- no faction-owned/controlled overlay
- no direct sandbox seed/suppress/dissolve controls
- headless report does not tally factions

### Plan

1. Add status and pressure fields:
   - `status = "organizing" | "suppressed" | "revolting" | "dissolved"`
   - `support`, `militancy`, `legitimacy`
2. Add map/inspector polish:
   - faction hotbed overlay toggle
   - faction-controlled stars visible in system inspector
   - empire inspector summarizes top active factions and projected revolt risk
3. Add player/sandbox commands:
   - seed faction
   - suppress faction
   - negotiate/integrate faction
   - force uprising
4. Headless report:
   - active factions
   - faction worlds
   - near-uprising count
   - successful/failed uprisings

## Gap 6: People And Dynasties Need More Readable Career Progression

### Evidence

Original public pages emphasize individual people rising from low-level roles into captains, ministers, and emperors, with dynasties accumulating prestige.

Current `galimulator-ng` has people, dynasties, rulers, courts, heirs, pretenders, marriages, successions, and dynastic events, but the readable career path is mostly implicit in event history and inspector snippets.

### Plan

1. Add a compact People/Dynasty inspector section:
   - ruler lineage
   - notable living court members
   - recent promotions/falls
   - dynasty prestige and current offices
2. Track explicit career milestones on `Person` or `Character`:
   - appointed
   - promoted
   - led fleet
   - won/lost battle
   - became ruler
   - founded/restored dynasty
3. Add top-story scoring for career events so notable people surface without reading raw logs.
4. Headless report:
   - top dynasty by prestige
   - deepest living chain
   - career promotions/falls

## Gap 7: Artifacts Need Build Choice And Visibility Polish

### Evidence

Original public pages call out powerful or useless artifacts built in space. Current `galimulator-ng` has typed persistent artifacts with effects, but the Emperor UI always sends `ARTIFACT_KINDS[0]` from `Build Artifact`, so the player cannot choose artifact kind even though the command accepts one.

### Plan

1. Replace single Build Artifact button with a menu of valid artifact kinds.
2. Show cost, effect, cooldown, and one-per-empire rule before command execution.
3. Add sandbox artifact creation without one-per-empire restriction.
4. Add artifact map filtering or hover labels at practical zoom levels.
5. Add report/event counters by artifact origin: precursor, built, gift, oddity.

## Gap 8: Validation Reports Need To Cover The New Polish Surface

### Evidence

Current `runHeadlessReport()` covers survival, wars, alliances, trade, artifacts, dynasties, monsters/oddities, and shape graph metrics. It does not tally quests, factions, ship roles/classes, diplomacy requests/treaties, sandbox interventions, or planet-driven events.

### Plan

1. Extend `TALLY_OF` and `snapshotMetrics()` for:
   - quests launched/completed/outcomes
   - active factions / near uprisings / faction worlds
   - ship roles/classes active and built
   - diplomacy requests accepted/rejected
   - treaties by kind
   - planet-tag/planet-event counts
2. Add a "parity smoke" preset sweep:
   - observer-only run
   - high-conflict run
   - many-small-empires run
   - sandbox-command excluded baseline
3. Add a manually invoked UI checklist because the repo has no test framework:
   - start observer mode
   - enter sandbox mode and run one command per category
   - enter emperor mode and issue flagship/build/spy/diplomacy/faction commands
   - export save, import save, continue deterministic tick progression

## Implementation Order

1. Sandbox mode surface and commands.
2. Diplomacy request/treaty layer, including subject states.
3. Ship-role metadata and build menu.
4. Planet object upgrade and inspector polish.
5. Faction visibility/status/reporting polish.
6. People/dynasty career readability.
7. Artifact build-choice polish.
8. Headless/report expansion and manual parity checklist.

## Non-Goals

- Do not copy original Galimulator text, names, sprites, sounds, or exact mechanics.
- Do not add tactical projectile combat.
- Do not make planets independently conquerable in the first pass.
- Do not let React own simulation mutations directly; all commands should stay on `Simulation` methods or pure sim helpers.
- Do not add nondeterministic randomness to sim code.
