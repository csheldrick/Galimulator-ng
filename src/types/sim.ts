export type Id = string;

export interface PRNG {
  readonly seed: number;
  next(): number;
  nextInt(min: number, max: number): number;
  range(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  clone(): PRNG;
  getState(): number;
  setState(state: number): void;
}

export type EventType =
  | "empire-founded"
  | "system-colonized"
  | "border-conflict"
  | "war-declared"
  | "peace-signed"
  | "empire-collapsed"
  | "rebellion"
  | "golden-age"
  | "technology-breakthrough"
  | "succession"
  | "mood-shift"
  | "transcended"
  | "religion-founded"
  | "religion-adopted"
  | "trade-established"
  | "trade-severed"
  | "monster-spawned"
  | "monster-attack"
  | "monster-slain"
  | "artifact-discovered"
  | "galactic-crisis"
  | "coup"
  | "character-rose"
  | "character-fell"
  | "alliance-formed"
  | "alliance-dissolved"
  | "empire-merged"
  | "quest-launched"
  | "quest-completed"
  | "faction-formed"
  | "faction-engaged"
  | "faction-uprising"
  | "faction-dissolved"
  | "dynasty-founded"
  | "heir-born"
  | "dynastic-marriage"
  | "heir-died"
  | "succession-crisis"
  | "pretender-revolt"
  | "dynasty-restored"
  | "dynasty-extinct";

export interface SimEvent {
  id: Id;
  tick: number;
  type: EventType;
  title: string;
  description: string;
  importance: number;
  relatedEmpireIds: Id[];
  relatedSystemIds: Id[];
}

/** Surface-level characteristics of worlds at a star. */
export type PlanetTag =
  | "barren"
  | "oceanic"
  | "industrial"
  | "sacred"
  | "ruined"
  | "fortress"
  | "garden"
  | "toxic"
  | "frozen"
  | "ancient";

/** Category of a relationship modifier. `structural` entries are standing conditions
 *  (faith, alliance, trade, common enemy) that are recomputed and deduped each pass;
 *  every other kind is a discrete historical incident that coexists with its peers so
 *  repeated wars, clashes, spy operations and diplomatic incidents build a real ledger. */
export type RelationModifierKind =
  | "structural"
  | "war"
  | "peace"
  | "clash"
  | "spy"
  | "diplomacy";

/** Specific historical events that permanently or semi-permanently modify a diplomatic relationship.
 *  Deltas are absolute points applied on top of the stored base opinion/tension to produce
 *  the *effective* values that war/peace/alliance logic reads. */
export interface RelationModifier {
  /** Unique identity for this ledger entry, stamped by addRelationModifier. */
  id: Id;
  /** Drives dedupe: structural modifiers replace by label; historical ones coexist. */
  kind: RelationModifierKind;
  label: string;
  opinionDelta: number;
  tensionDelta: number;
  /** Tick this modifier lapses. Undefined = structural/standing (refreshed each pass). */
  expiresAtTick?: number;
  /** The SimEvent that produced this modifier, when applicable, linking the ledger to real history. */
  sourceEventId?: Id;
}

/** Input shape for addRelationModifier — callers supply everything except the id, which the
 *  function stamps so each ledger entry has its own identity even when two sides share data. */
export type RelationModifierInput = Omit<RelationModifier, "id">;

export type GovernmentType =
  | "empire"
  | "republic"
  | "theocracy"
  | "oligarchy"
  | "military-junta"
  | "tribal-council"
  | "technocracy"
  | "merchant-guild";

/** Persistent scars and landmarks that mark a star's history. */
export type MarkerKind =
  | "ruin"
  | "holy-site"
  | "battlefield"
  | "shipyard"
  | "rebel-hotbed"
  | "artifact-aura"
  | "dead-capital"
  | "monster-wound"
  | "trade-hub"
  | "plague-world"
  | "transcendent-ruin";

export interface SystemMarker {
  kind: MarkerKind;
  /** Tick when this marker was placed. */
  since: number;
  /** Optional label for display. */
  label?: string;
}

export type ArtifactKind =
  | "research-lab"
  | "fleet-base"
  | "holy-monument"
  | "financial-center"
  | "sentinel-station"
  | "stellar-forcefield"
  | "mind-control-hub"
  | "lost-archive"
  | "strange-engine";

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

export interface StarSystem {
  id: Id;
  name: string;
  x: number;
  y: number;
  population: number;
  resources: number;
  habitability: number;
  stability: number;
  ownerEmpireId: Id | null;
  cultureId: Id;
  religionId: Id | null;
  /** A dissenting faith held by part of the population after a conversion swept through. */
  minorityReligionId?: Id | null;
  /** Name of a precursor artifact buried here, if any. */
  artifactName: string | null;
  /** First-class artifact hosted here, if any. */
  artifactId?: Id | null;
  techLevel: number;
  recentEventIds: Id[];
  connectedSystemIds: Id[];
  /** Remaining ticks of a god boost; grants stability regen and a defense bonus. 0 = no boost. */
  godBoostTicks?: number;
  /** Persistent historical markers. At most one of each kind. */
  markers?: SystemMarker[];
  /** Local wealth pool — separate from empire wealth; represents commerce/infrastructure at this star. */
  localWealth?: number;
  /** Surface-level planet flavor. Generated at galaxy creation, may be modified by events. */
  planets?: PlanetTag[];
  /** Separatist, religious, or court faction currently organizing here. */
  factionId?: Id | null;
}

export type FleetKind = "colonizer" | "war" | "patrol" | "merchant" | "pilgrim" | "refugee" | "flagship" | "quest";

/** Ship class shapes speed/strength tradeoffs and the glyph on the map. */
export type ShipClass = "settler" | "raider" | "strike" | "armada";

export interface Fleet {
  id: Id;
  name: string;
  kind: FleetKind;
  shipClass: ShipClass;
  ownerEmpireId: Id;
  originSystemId: Id;
  targetSystemId: Id;
  /** Starlane route from origin to target, inclusive of both endpoints. */
  path: Id[];
  /** Index of the lane leg currently being traversed: path[legIndex] -> path[legIndex + 1]. */
  legIndex: number;
  /** 0..1 progress along the current leg. */
  legProgress: number;
  /** Total route length in world units. */
  totalDist: number;
  x: number;
  y: number;
  /** Overall 0..1 progress along the whole route. */
  progress: number;
  /** World units travelled per tick. */
  speed: number;
  strength: number;
  createdTick: number;
  hp?: number;
  maxHp?: number;
  level?: number;
  xp?: number;
  /** Named admiral leading a war fleet, if one was assigned from the court. */
  admiralId?: Id;
  admiralName?: string;
}

export interface EmpireRelationship {
  targetEmpireId: Id;
  tension: number;
  opinion: number;
  atWar: boolean;
  /** Persistent events that have modified this relationship and may carry ongoing opinion/tension effects. */
  modifiers?: RelationModifier[];
}

export type EmpireMood =
  | "expanding"
  | "fortifying"
  | "degenerating"
  | "rioting"
  | "crusading"
  | "transcending";

export type Ideology =
  | "militarist"
  | "pacifist"
  | "spiritualist"
  | "materialist"
  | "expansionist"
  | "isolationist";

export interface Ruler {
  name: string;
  title: string;
  dynasty: string;
  ordinal: number;
  accessionTick: number;
  traits?: CharacterTrait[];
}

export type RulerLineageOrigin =
  | "founder"
  | "succession"
  | "dynastic-succession"
  | "coup"
  | "rebellion"
  | "successor-state"
  | "emergence"
  | "appointed";

export interface RulerLineageEntry {
  id: Id;
  name: string;
  title: string;
  dynasty: string;
  ordinal: number;
  accessionTick: number;
  endTick?: number;
  endReason?: string;
  origin: RulerLineageOrigin;
  predecessorId?: Id | null;
  parentId?: Id | null;
  traits?: CharacterTrait[];
  /** The Person in `state.people` this throne-shim mirrors. Optional for legacy saves. */
  personId?: Id;
}

/** Where a person sits in the social graph of a dynasty. */
export type PersonRole =
  | "ruler"
  | "consort"
  | "heir"
  | "relative"
  | "noble"
  | "pretender";

export type Gender = "male" | "female";

/** A first-class human (or alien) being: the atoms of dynastic lineage. People are born,
 *  marry, have children, claim thrones, and die — and persist in `state.people` as a graph. */
export interface Person {
  id: Id;
  name: string;
  gender: Gender;
  dynastyId: Id;
  role: PersonRole;
  title: string;
  bornTick: number;
  diedTick?: number;
  deathReason?: string;
  /** Parents within the people graph (0, 1, or 2 entries). */
  parentIds: Id[];
  /** Marriages — usually one, occasionally dynastic unions across empires. */
  spouseIds: Id[];
  childIds: Id[];
  /** 0..1 strength of claim to a throne. Drives succession ordering. */
  claimStrength: number;
  /** 0..1 allegiance to the current ruler. Low loyalty breeds pretenders. */
  loyalty: number;
  /** 0..1 competence as a ruler. */
  skill: number;
  /** 0..1 fame. */
  renown: number;
  /** Empire this person belongs to, or null if stateless/exiled. */
  empireId: Id | null;
  alive: boolean;
  /** The ruler who reigned immediately before this person, when this person took a throne.
   *  Lets the UI walk a chronological chain of rulers regardless of blood relation. */
  predecessorPersonId?: Id;
}

/** A ruling house: a named lineage that can span generations and even branch into
 *  multiple empires, rise, fall, be restored, or die out entirely. */
export interface Dynasty {
  id: Id;
  name: string;
  founderPersonId: Id;
  foundedTick: number;
  /** Empires this house currently rules (a dynasty can branch across several). */
  rulingEmpireIds: Id[];
  /** 0..100 standing of the house; grows with long reigns, falls with coups/extinction. */
  prestige: number;
  historicalEventIds: Id[];
  /** Tick the last member died, if the house has gone extinct. */
  extinctTick?: number;
}

/** Named figures who serve below the ruler and give an empire its supporting cast. */
export type CharacterRole = "admiral" | "minister" | "prophet" | "pretender" | "faction-leader";

export type CharacterTrait =
  | "bright"
  | "dull"
  | "mechanic"
  | "mutineer"
  | "zealot"
  | "merchant"
  | "warlike"
  | "popular"
  | "corrupt";

export interface Character {
  id: Id;
  name: string;
  role: CharacterRole;
  title: string;
  dynasty: string;
  traits: CharacterTrait[];
  /** Competence, 0..1 — scales the perk the character provides. */
  skill: number;
  /** Fame, 0..1 — grows with deeds; renowned figures get their own events. */
  renown: number;
  /** Allegiance to the throne, 0..1 — low loyalty breeds pretenders. */
  loyalty: number;
  bornTick: number;
}

export interface Religion {
  id: Id;
  name: string;
  color: string;
  foundedTick: number;
  holySystemId: Id;
}

export interface TradeRoute {
  id: Id;
  empireAId: Id;
  empireBId: Id;
  systemAId: Id;
  systemBId: Id;
  establishedTick: number;
}

export type MonsterKind = "leviathan" | "wraith" | "swarm";

export interface Monster {
  id: Id;
  name: string;
  kind: MonsterKind;
  /** Lane route currently being followed, like a fleet. */
  path: Id[];
  legIndex: number;
  legProgress: number;
  x: number;
  y: number;
  speed: number;
  hp: number;
  maxHp: number;
  strength: number;
  spawnedTick: number;
}

export interface Empire {
  id: Id;
  name: string;
  color: string;
  mood: EmpireMood;
  moodSince: number;
  ideology: Ideology;
  ruler: Ruler;
  /** Succession chain for the ruling office. Current ruler is the entry without endTick. */
  rulerLineage?: RulerLineageEntry[];
  /** The reigning monarch's Person in `state.people`. Mirrors `ruler` for display. */
  rulerPersonId?: Id;
  /** The ruling house in `state.dynasties`. */
  dynastyId?: Id;
  /** Supporting cast: admirals, ministers, prophets, and would-be pretenders. */
  court: Character[];
  capitalSystemId: Id;
  ownedSystemIds: Id[];
  population: number;
  wealth: number;
  militaryStrength: number;
  cohesion: number;
  aggression: number;
  expansionism: number;
  techLevel: number;
  cultureId: Id;
  stateReligionId: Id | null;
  relationshipByEmpireId: Record<Id, EmpireRelationship>;
  activeWarEmpireIds: Id[];
  historicalEventIds: Id[];
  /** Remaining ticks of a god boost; multiplies military strength and blocks collapse. 0 = no boost. */
  godBoostTicks?: number;
  /** IDs of alliances this empire belongs to. */
  allianceIds?: Id[];
  /** Player-set strategic bias. Only meaningful when this empire is player-controlled. */
  playerPriority?: EmpirePriority;
  /** War-room stances toward specific enemies, keyed by target empire id. */
  warDirectives?: Record<Id, WarDirective>;
  /** Constitutional / cultural government flavor. Affects court titles and event text. */
  governmentType?: GovernmentType;
  /** Artifacts this empire personally commissioned; captured artifacts do not count. */
  builtArtifactIds?: Id[];
}

export type AlliancePurpose = "defensive" | "anti-hegemon" | "trade" | "religious" | "survival";

/** A formal alliance between two or more empires. */
export interface Alliance {
  id: Id;
  name: string;
  memberEmpireIds: Id[];
  formedTick: number;
  /** Dominant member (initiator). */
  leaderId: Id;
  /** Why the bloc came together. Shapes diplomacy flavor and the alliance map mode. */
  purpose?: AlliancePurpose;
  /** Bloc color, used by the alliance map mode and inspector. */
  color?: string;
  /** Single-glyph emblem for labels. */
  emblem?: string;
  historicalEventIds?: Id[];
}

export type FactionKind = "separatist" | "religious" | "court" | "regional";

/** Internal movement that pressures an empire before becoming an open rebellion. */
export interface Faction {
  id: Id;
  name: string;
  kind: FactionKind;
  originEmpireId: Id | null;
  targetEmpireId: Id | null;
  leader: Character;
  homeSystemId: Id;
  systemIds: Id[];
  foundedTick: number;
  uprisingProgress: number;
  uprisingRate: number;
  spreadRate: number;
  engagementScore: number;
  engagedUntilTick?: number;
  historicalEventIds: Id[];
}

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

export type SpyMission = "steal-tech" | "incite-riots" | "improve-relations" | "sabotage-fleet";

/** War-room stance toward one enemy. Biases autonomous war behavior; it does not micromanage fleets. */
export type WarFocus = "attack" | "defend" | "raid" | "exhaust";

export interface WarDirective {
  targetEmpireId: Id;
  focus: WarFocus;
  createdTick: number;
}

export interface PlayerControlState {
  controlledEmpireId: Id | null;
  mode: "observer" | "empire";
  authority: number;
  legitimacy: number;
  /** Tick timestamps when each command was last issued, for cooldown tracking. */
  commandCooldowns: Record<string, number>;
  flagshipFleetId?: Id | null;
  corruption?: number;
}

export type GalaxyShape =
  | "spiral"
  | "barred-spiral"
  | "disc"
  | "hollow-disc"
  | "elliptical"
  | "irregular"
  | "clustered"
  | "hub"
  | "chaos"
  | "grid"
  | "web"
  | "string"
  | "continents";

export type StarlaneMode = "standard" | "webbed" | "dense" | "sparse" | "string";

/** Optional post-generation snap of star positions onto a board-like lattice. */
export type GridAlignment = "none" | "square" | "hex";

export type EmpireLayout =
  | "classic"
  | "few-big-blobs"
  | "many-one-star"
  | "random-blobs"
  | "scattered"
  | "rim";

/** Bespoke weird actors that are not standard monsters. */
export type OddityKind = "star-eater" | "puppet-mind" | "sloth-cloud" | "replicator" | "void-gate";

// AI NOTE: This is broken attempting to merge...
/** A persistent space oddity: a strange object or entity that lives on the map,
 *  wanders or roosts, and interacts with the galaxy by one memorable rule. */
export interface Oddity {
  id: Id;
  kind: OddityKind;
  name: string;
  x: number;
  y: number;
  targetSystemId: Id;
  path: Id[];
  legIndex: number;
  legProgress: number;
  speed: number;
  strength: number;
  spawnedTick: number;
  lastPulseTick: number;
  /** System currently occupied/targeted, when the oddity is system-bound. */
  systemId?: Id | null;
  /** Lane route currently being followed (star-eater walks lanes like a monster). */
  path?: Id[];
  legIndex?: number;
  legProgress?: number;
  /** Free drift velocity for cloud-like oddities that ignore lanes. */
  vx?: number;
  vy?: number;
  speed: number;
  strength: number;
  spawnedTick: number;
  expiresTick?: number;
  /** Kind-specific counters: systems consumed, replications left, dwell timers... */
  state: Record<string, number>;
}

export interface GalaxyState {
  tick: number;
  seed: number;
  systems: Record<Id, StarSystem>;
  empires: Record<Id, Empire>;
  fleets: Record<Id, Fleet>;
  religions: Record<Id, Religion>;
  tradeRoutes: Record<Id, TradeRoute>;
  monsters: Record<Id, Monster>;
  events: Record<Id, SimEvent>;
  eventLog: Id[];
  alliances: Record<Id, Alliance>;
  playerControl: PlayerControlState;
  artifacts?: Record<Id, Artifact>;
  oddities?: Record<Id, Oddity>;
  factions?: Record<Id, Faction>;
  /** First-class people: rulers, heirs, consorts, relatives, nobles, pretenders. */
  people?: Record<Id, Person>;
  /** Ruling houses keyed by id. */
  dynasties?: Record<Id, Dynasty>;
}

export interface SimSettings {
  seed: number;
  numStars: number;
  numEmpires: number;
  ticksPerSecond: number;
  galaxyShape?: GalaxyShape;
  starlaneMode?: StarlaneMode;
  empireLayout?: EmpireLayout;
  gridAlignment?: GridAlignment;
}

/** Saved-game envelope; rngState lets a loaded galaxy continue deterministically. */
export interface SaveFile {
  version: number;
  settings: SimSettings;
  rngState: number;
  eventCounter: number;
  /** Sequence for relation-modifier ids so post-load entries never collide. Optional for older saves. */
  modifierCounter?: number;
  /** Sequences for person/dynasty ids so post-load entries never collide. Optional for older saves. */
  personCounter?: number;
  dynastyCounter?: number;
  state: GalaxyState;
}
