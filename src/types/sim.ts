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
  | "faction-dissolved";

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

/** Specific historical events that permanently or semi-permanently modify a diplomatic relationship.
 *  Deltas are absolute points applied on top of the stored base opinion/tension to produce
 *  the *effective* values that war/peace/alliance logic reads. */
export interface RelationModifier {
  label: string;
  opinionDelta: number;
  tensionDelta: number;
  /** Tick this modifier lapses. Undefined = structural/standing (refreshed each pass). */
  expiresAtTick?: number;
}

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
  | "disc"
  | "hollow-disc"
  | "clustered"
  | "chaos"
  | "grid"
  | "string";

export type StarlaneMode = "standard" | "webbed" | "dense" | "sparse";

export type EmpireLayout =
  | "classic"
  | "few-big-blobs"
  | "many-one-star"
  | "random-blobs"
  | "scattered"
  | "rim";

/** Bespoke weird actors that are not standard monsters. */
export type OddityKind = "star-eater" | "puppet-mind" | "sloth-cloud" | "replicator" | "void-gate";

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
}

export interface SimSettings {
  seed: number;
  numStars: number;
  numEmpires: number;
  ticksPerSecond: number;
  galaxyShape?: GalaxyShape;
  starlaneMode?: StarlaneMode;
  empireLayout?: EmpireLayout;
}

/** Saved-game envelope; rngState lets a loaded galaxy continue deterministically. */
export interface SaveFile {
  version: number;
  settings: SimSettings;
  rngState: number;
  eventCounter: number;
  state: GalaxyState;
}
