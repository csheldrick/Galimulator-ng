export type Id = string;

export interface PRNG {
  readonly seed: number;
  next(): number;
  nextInt(min: number, max: number): number;
  range(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  clone(): PRNG;
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
  | "technology-breakthrough";

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
  techLevel: number;
  recentEventIds: Id[];
}

export type FleetKind = "colonizer" | "war" | "patrol";

export interface Fleet {
  id: Id;
  kind: FleetKind;
  ownerEmpireId: Id;
  originSystemId: Id;
  targetSystemId: Id;
  x: number;
  y: number;
  progress: number;
  speed: number;
  strength: number;
  createdTick: number;
}

export interface EmpireRelationship {
  targetEmpireId: Id;
  tension: number;
  opinion: number;
  atWar: boolean;
}

export interface Empire {
  id: Id;
  name: string;
  color: string;
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
  relationshipByEmpireId: Record<Id, EmpireRelationship>;
  activeWarEmpireIds: Id[];
  historicalEventIds: Id[];
}

export interface GalaxyState {
  tick: number;
  seed: number;
  systems: Record<Id, StarSystem>;
  empires: Record<Id, Empire>;
  fleets: Record<Id, Fleet>;
  events: Record<Id, SimEvent>;
  eventLog: Id[];
}

export interface SimSettings {
  seed: number;
  numStars: number;
  numEmpires: number;
  ticksPerSecond: number;
}
