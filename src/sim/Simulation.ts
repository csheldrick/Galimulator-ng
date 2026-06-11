import type { ArtifactKind, GalaxyState, SimSettings, SaveFile, Id, Empire, EmpireRelationship, EmpirePriority, StarSystem, SpyMission, WarFocus } from "../types/sim";
import { SeededRandom } from "./Random";
import { generateGalaxy, makeRuler } from "./Galaxy";
import { executeTick } from "./Tick";
import { createEvent, getEventCounter, setEventCounter } from "./Events";
import { IDEOLOGIES } from "./Moods";
import { makeCourt } from "./Characters";
import { addRelationModifier } from "./Relations";
import { createArtifact, ensureArtifactObjects, pickArtifactKind, ARTIFACT_LABEL } from "./Artifacts";

const SAVE_VERSION = 6;

function defaultPlayerControl() {
  return { controlledEmpireId: null, mode: "observer" as const, authority: 100, legitimacy: 75, commandCooldowns: {}, flagshipFleetId: null, corruption: 0 };
}

function upgradeState(state: GalaxyState): GalaxyState {
  state.religions ??= {};
  state.tradeRoutes ??= {};
  state.monsters ??= {};
  state.alliances ??= {};
  state.artifacts ??= {};
  state.oddities ??= {};
  state.playerControl ??= defaultPlayerControl();
  state.playerControl.commandCooldowns ??= {};
  state.playerControl.flagshipFleetId ??= null;
  state.playerControl.corruption ??= 0;
  for (const sys of Object.values(state.systems)) {
    sys.religionId ??= null;
    sys.minorityReligionId ??= null;
    sys.artifactName ??= null;
    sys.artifactId ??= null;
    sys.godBoostTicks ??= 0;
    sys.markers ??= [];
    sys.localWealth ??= 0;
    sys.planets ??= [];
  }
  for (const emp of Object.values(state.empires)) {
    emp.ideology ??= IDEOLOGIES[0];
    emp.stateReligionId ??= null;
    emp.court ??= [];
    emp.godBoostTicks ??= 0;
    emp.allianceIds ??= [];
    emp.warDirectives ??= {};
  }
  for (const fleet of Object.values(state.fleets)) {
    fleet.shipClass ??= fleet.kind === "war" || fleet.kind === "flagship" ? "strike" : "settler";
  }
  return state;
}

export type SimListener = (snapshot: Readonly<GalaxyState>) => void;

const FIXED_TICK_MS = 50;
const BASE_TICKS_PER_SECOND = 20;

export class Simulation {
  private state: GalaxyState;
  private rng: SeededRandom;
  private settings: SimSettings;
  private listeners: Set<SimListener> = new Set();
  private running = false;
  private rafId: number | null = null;
  private lastTime = 0;
  private accumulator = 0;
  private _snapshot: Readonly<GalaxyState>;
  private _snapshotDirty = true;
  private _revision = 0;

  constructor(settings: SimSettings) {
    this.settings = settings;
    this.rng = new SeededRandom(settings.seed);
    this.state = generateGalaxy(settings.seed, settings.numStars, settings.numEmpires, this.rng, settings.galaxyShape, settings.starlaneMode, settings.empireLayout, settings.gridAlignment);
    ensureArtifactObjects(this.state, this.rng);
    this._fireFoundedEvents();
    this._snapshot = this._buildSnapshot();
    this._snapshotDirty = false;
  }

  private _fireFoundedEvents(): void {
    for (const emp of Object.values(this.state.empires)) {
      createEvent(this.state, 0, "empire-founded",
        `${emp.name} founded`,
        `${emp.name} established at ${this.state.systems[emp.capitalSystemId]?.name ?? "unknown"}.`,
        3, [emp.id], [emp.capitalSystemId]
      );
    }
  }

  private _buildSnapshot(): Readonly<GalaxyState> { return structuredClone(this.state) as Readonly<GalaxyState>; }
  getSnapshot(): Readonly<GalaxyState> { if (this._snapshotDirty) { this._snapshot = this._buildSnapshot(); this._snapshotDirty = false; } return this._snapshot; }
  getLiveState(): Readonly<GalaxyState> { return this.state; }
  getRevision(): number { return this._revision; }
  subscribe(fn: SimListener): () => void { this.listeners.add(fn); fn(this.getSnapshot()); return () => { this.listeners.delete(fn); }; }
  private _notify(): void { this._revision++; this._snapshotDirty = true; if (this.listeners.size === 0) return; const snap = this.getSnapshot(); for (const fn of this.listeners) fn(snap); }
  private _touch(): void { this._notify(); }

  private _relationship(source: Empire, targetId: Id): EmpireRelationship {
    const existing = source.relationshipByEmpireId[targetId];
    if (existing) return existing;
    const rel: EmpireRelationship = { targetEmpireId: targetId, tension: 0, opinion: 50, atWar: false, modifiers: [] };
    source.relationshipByEmpireId[targetId] = rel;
    return rel;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    const loop = (now: number) => {
      if (!this.running) return;
      const elapsed = now - this.lastTime;
      this.lastTime = now;
      const ticksPerSecond = Math.max(1, this.settings.ticksPerSecond);
      const msPerTick = FIXED_TICK_MS / (ticksPerSecond / BASE_TICKS_PER_SECOND);
      this.accumulator += elapsed;
      let ticked = false;
      let safeGuard = 0;
      while (this.accumulator >= msPerTick && safeGuard < 20) {
        executeTick(this.state, this.rng);
        this.accumulator -= msPerTick;
        ticked = true;
        safeGuard++;
      }
      if (this.accumulator >= msPerTick) this.accumulator = 0;
      if (ticked) this._notify();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  pause(): void { this.running = false; if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; } }
  step(): void { executeTick(this.state, this.rng); this._notify(); }
  reset(newSettings?: Partial<SimSettings>): void {
    this.pause();
    if (newSettings) this.settings = { ...this.settings, ...newSettings };
    this.rng = new SeededRandom(this.settings.seed);
    this.state = generateGalaxy(this.settings.seed, this.settings.numStars, this.settings.numEmpires, this.rng, this.settings.galaxyShape, this.settings.starlaneMode, this.settings.empireLayout, this.settings.gridAlignment);
    ensureArtifactObjects(this.state, this.rng);
    this._fireFoundedEvents();
    this._notify();
  }
  runTicks(count: number): void { const n = Math.max(1, Math.min(500, Math.floor(count))); for (let i = 0; i < n; i++) executeTick(this.state, this.rng); this._notify(); }

  exportSave(): string {
    const save: SaveFile = {
      version: SAVE_VERSION,
      settings: { ...this.settings },
      rngState: this.rng.getState(),
      eventCounter: getEventCounter(),
      state: this.state,
    };
    return JSON.stringify(save, null, 2);
  }

  importSave(text: string): string | null {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return "File is not valid JSON."; }
    if (!parsed || typeof parsed !== "object") return "File is not a galimulator-ng save.";
    const obj = parsed as Partial<SaveFile> & Partial<GalaxyState>;
    const isSave = typeof obj.version === "number" && obj.state && typeof obj.state === "object";
    const state = isSave ? (obj.state as GalaxyState) : (obj as unknown as GalaxyState);
    if (!state.systems || !state.empires || typeof state.tick !== "number") return "File is not a galimulator-ng save.";
    this.pause();
    this.state = upgradeState(structuredClone(state));
    if (isSave && obj.settings) this.settings = { ...this.settings, ...obj.settings };
    else this.settings = { ...this.settings, seed: state.seed };
    this.rng = new SeededRandom(this.settings.seed);
    if (isSave && typeof obj.rngState === "number") this.rng.setState(obj.rngState);
    ensureArtifactObjects(this.state, this.rng);
    setEventCounter(isSave && typeof obj.eventCounter === "number" ? obj.eventCounter : state.eventLog.length + Object.keys(state.events).length);
    this._notify();
    return null;
  }

  cancelFleet(fleetId: Id): void {
    const fleet = this.state.fleets[fleetId];
    if (!fleet) return;
    const owner = this.state.empires[fleet.ownerEmpireId];
    const target = this.state.systems[fleet.targetSystemId];
    delete this.state.fleets[fleetId];
    if (this.state.playerControl.flagshipFleetId === fleetId) this.state.playerControl.flagshipFleetId = null;
    createEvent(this.state, this.state.tick, "peace-signed", `${fleet.name} recalled`, `${fleet.name} was removed from its mission${target ? ` to ${target.name}` : ""}.`, 1, owner ? [owner.id] : [], target ? [target.id] : []);
    this._touch();
  }

  boostSystem(systemId: Id): void {
    const sys = this.state.systems[systemId];
    if (!sys) return;
    sys.population = Math.min(3, sys.population + 0.7);
    sys.resources = Math.min(1.5, sys.resources + 0.4);
    sys.habitability = Math.min(1, sys.habitability + 0.25);
    sys.stability = Math.min(1, sys.stability + 0.4);
    sys.techLevel = Math.min(3, sys.techLevel + 0.25);
    sys.godBoostTicks = 600;
    createEvent(this.state, this.state.tick, "golden-age", `${sys.name} flourished`, `${sys.name} entered a divine golden age.`, 2, sys.ownerEmpireId ? [sys.ownerEmpireId] : [], [sys.id]);
    this._touch();
  }

  devastateSystem(systemId: Id): void {
    const sys = this.state.systems[systemId];
    if (!sys) return;
    sys.population = Math.max(0.02, sys.population * 0.35);
    sys.stability = Math.max(0.05, sys.stability - 0.45);
    sys.resources = Math.max(0.05, sys.resources - 0.2);
    createEvent(this.state, this.state.tick, "border-conflict", `${sys.name} devastated`, `${sys.name} suffered severe damage.`, 3, sys.ownerEmpireId ? [sys.ownerEmpireId] : [], [sys.id]);
    this._touch();
  }

  neutralizeSystem(systemId: Id): void {
    const sys = this.state.systems[systemId];
    if (!sys || !sys.ownerEmpireId) return;
    const oldOwner = this.state.empires[sys.ownerEmpireId];
    if (oldOwner) oldOwner.ownedSystemIds = oldOwner.ownedSystemIds.filter(id => id !== systemId);
    sys.ownerEmpireId = null;
    sys.cultureId = "none";
    sys.stability = Math.max(0.1, sys.stability - 0.2);
    createEvent(this.state, this.state.tick, "rebellion", `${sys.name} became independent`, `${sys.name} slipped out of imperial control.`, 3, oldOwner ? [oldOwner.id] : [], [sys.id]);
    this._touch();
  }

  foundEmpireAtSystem(systemId: Id): Id | null {
    const sys = this.state.systems[systemId];
    if (!sys) return null;
    const oldOwnerId = sys.ownerEmpireId;
    if (oldOwnerId) {
      const old = this.state.empires[oldOwnerId];
      if (old) old.ownedSystemIds = old.ownedSystemIds.filter(id => id !== systemId);
    }
    const id = `god-emp-${this.state.tick}-${Object.keys(this.state.empires).length}`;
    const cultureId = `culture-${id}`;
    const empire: Empire = {
      id, name: `${sys.name} Ascendancy`, color: `hsl(${this.rng.nextInt(0, 360)},75%,58%)`,
      mood: "expanding", moodSince: this.state.tick, ideology: this.rng.pick(IDEOLOGIES), ruler: makeRuler(this.rng, this.state.tick),
      court: makeCourt(this.rng, this.state.tick, sys.religionId !== null),
      capitalSystemId: sys.id,
      ownedSystemIds: [sys.id], population: Math.max(sys.population * 1000, 500), wealth: 700, militaryStrength: 200,
      cohesion: 0.9, aggression: this.rng.range(0.2, 0.8), expansionism: this.rng.range(0.4, 0.9), techLevel: Math.max(sys.techLevel, 0.8),
      cultureId, stateReligionId: sys.religionId, relationshipByEmpireId: {}, activeWarEmpireIds: [], historicalEventIds: [],
      godBoostTicks: 400, allianceIds: [],
    };
    sys.ownerEmpireId = id;
    sys.cultureId = cultureId;
    sys.population = Math.max(sys.population, 0.8);
    sys.godBoostTicks = 400;
    this.state.empires[id] = empire;
    createEvent(this.state, this.state.tick, "empire-founded", `${empire.name} founded`, `${empire.name} rose at ${sys.name}.`, 4, [id], [sys.id]);
    this._touch();
    return id;
  }

  boostEmpire(empireId: Id): void {
    const emp = this.state.empires[empireId];
    if (!emp) return;
    emp.wealth += 1200;
    emp.cohesion = Math.min(1, emp.cohesion + 0.35);
    emp.techLevel = Math.min(3, emp.techLevel + 0.3);
    emp.godBoostTicks = 600;
    createEvent(this.state, this.state.tick, "golden-age", `${emp.name} strengthened`, `${emp.name} received a divine surge of power.`, 3, [emp.id], []);
    this._touch();
  }

  weakenEmpire(empireId: Id): void { const emp = this.state.empires[empireId]; if (!emp) return; emp.wealth = Math.max(0, emp.wealth * 0.4); emp.cohesion = Math.max(0.05, emp.cohesion - 0.35); emp.militaryStrength = Math.max(1, emp.militaryStrength * 0.45); for (const sysId of emp.ownedSystemIds) { const sys = this.state.systems[sysId]; if (sys) sys.stability = Math.max(0.05, sys.stability - 0.15); } createEvent(this.state, this.state.tick, "empire-collapsed", `${emp.name} destabilized`, `${emp.name} was weakened by outside forces.`, 3, [emp.id], emp.ownedSystemIds.slice(0, 8)); this._touch(); }

  forceWar(attackerId: Id, defenderId: Id): void {
    if (attackerId === defenderId) return;
    const attacker = this.state.empires[attackerId]; const defender = this.state.empires[defenderId]; if (!attacker || !defender) return;
    const rel = this._relationship(attacker, defenderId); const relBack = this._relationship(defender, attackerId);
    rel.atWar = true; relBack.atWar = true; rel.tension = 100; relBack.tension = 100; rel.opinion = Math.min(rel.opinion, 5); relBack.opinion = Math.min(relBack.opinion, 5);
    const forcedWar = { label: "Forced into war", opinionDelta: -25, tensionDelta: 20, expiresAtTick: this.state.tick + 700 };
    addRelationModifier(rel, forcedWar); addRelationModifier(relBack, { ...forcedWar });
    if (!attacker.activeWarEmpireIds.includes(defenderId)) attacker.activeWarEmpireIds.push(defenderId);
    if (!defender.activeWarEmpireIds.includes(attackerId)) defender.activeWarEmpireIds.push(attackerId);
    createEvent(this.state, this.state.tick, "war-declared", `War: ${attacker.name} vs ${defender.name}`, `${attacker.name} and ${defender.name} were forced into war.`, 4, [attackerId, defenderId], []);
    this._touch();
  }

  forcePeace(empireId: Id, otherId: Id): void {
    if (empireId === otherId) return;
    const empire = this.state.empires[empireId]; const other = this.state.empires[otherId]; if (!empire || !other) return;
    const rel = this._relationship(empire, otherId); const relBack = this._relationship(other, empireId);
    rel.atWar = false; relBack.atWar = false; rel.tension = Math.min(rel.tension, 20); relBack.tension = Math.min(relBack.tension, 20); rel.opinion = Math.max(rel.opinion, 45); relBack.opinion = Math.max(relBack.opinion, 45);
    const forcedPeace = { label: "Forced into peace", opinionDelta: -8, tensionDelta: -15, expiresAtTick: this.state.tick + 500 };
    addRelationModifier(rel, forcedPeace); addRelationModifier(relBack, { ...forcedPeace });
    empire.activeWarEmpireIds = empire.activeWarEmpireIds.filter(id => id !== otherId); other.activeWarEmpireIds = other.activeWarEmpireIds.filter(id => id !== empireId);
    createEvent(this.state, this.state.tick, "peace-signed", `Peace: ${empire.name} & ${other.name}`, `${empire.name} and ${other.name} were forced into peace.`, 3, [empireId, otherId], []);
    this._touch();
  }

  inflameEmpire(empireId: Id): void { const emp = this.state.empires[empireId]; if (!emp) return; emp.aggression = Math.min(1, emp.aggression + 0.25); for (const other of Object.values(this.state.empires)) { if (other.id === emp.id) continue; const rel = this._relationship(emp, other.id); rel.tension = Math.min(100, rel.tension + 30); rel.opinion = Math.max(0, rel.opinion - 20); } createEvent(this.state, this.state.tick, "border-conflict", `${emp.name} radicalized`, `${emp.name} became more aggressive toward its rivals.`, 3, [emp.id], []); this._touch(); }
  pacifyEmpire(empireId: Id): void { const emp = this.state.empires[empireId]; if (!emp) return; emp.aggression = Math.max(0, emp.aggression - 0.25); emp.cohesion = Math.min(1, emp.cohesion + 0.1); for (const rel of Object.values(emp.relationshipByEmpireId)) { rel.tension = Math.max(0, rel.tension - 40); rel.opinion = Math.min(100, rel.opinion + 20); } createEvent(this.state, this.state.tick, "peace-signed", `${emp.name} pacified`, `${emp.name} turned inward and reduced foreign tensions.`, 2, [emp.id], []); this._touch(); }

  // ── Empire Control ─────────────────────────────────────────────────────────

  getPlayerControl() { return this.state.playerControl; }

  private _spawnFlagship(emp: Empire): Id | null {
    const cap = this.state.systems[emp.capitalSystemId];
    if (!cap) return null;
    const id = `flagship-${emp.id}-${this.state.tick}`;
    this.state.fleets[id] = {
      id,
      name: `${emp.ruler.title} ${emp.ruler.name}'s Flagship`,
      kind: "flagship",
      shipClass: "armada",
      ownerEmpireId: emp.id,
      originSystemId: cap.id,
      targetSystemId: cap.id,
      path: [cap.id],
      legIndex: 0,
      legProgress: 1,
      totalDist: 1,
      x: cap.x,
      y: cap.y,
      progress: 1,
      speed: 3,
      strength: Math.max(25, emp.militaryStrength * 0.08),
      createdTick: this.state.tick,
    };
    return id;
  }

  startEmpireControl(empireId: Id): void {
    const emp = this.state.empires[empireId];
    if (!emp) return;
    const flagshipFleetId = this._spawnFlagship(emp);
    this.state.playerControl = { controlledEmpireId: empireId, mode: "empire", authority: 100, legitimacy: 75, commandCooldowns: {}, flagshipFleetId, corruption: 0 };
    createEvent(this.state, this.state.tick, "succession", `${emp.name} accepts direct rule`, `${emp.ruler.title} ${emp.ruler.name} took personal command of ${emp.name}.`, 3, [emp.id], [emp.capitalSystemId]);
    this._touch();
  }

  stopEmpireControl(): void {
    const pc = this.state.playerControl;
    if (pc.controlledEmpireId) {
      const emp = this.state.empires[pc.controlledEmpireId];
      if (emp) emp.playerPriority = undefined;
    }
    if (pc.flagshipFleetId && this.state.fleets[pc.flagshipFleetId]) delete this.state.fleets[pc.flagshipFleetId];
    this.state.playerControl = defaultPlayerControl();
    this._touch();
  }

  setEmpirePriority(priority: EmpirePriority): void {
    const pc = this.state.playerControl;
    if (pc.mode !== "empire" || !pc.controlledEmpireId) return;
    const emp = this.state.empires[pc.controlledEmpireId];
    if (!emp) return;
    emp.playerPriority = priority;
    this._touch();
  }

  private _checkCommand(commandKey: string, cooldown: number, authCost: number): boolean {
    const pc = this.state.playerControl;
    if (pc.mode !== "empire" || !pc.controlledEmpireId) return false;
    if (pc.authority < authCost) return false;
    const last = pc.commandCooldowns[commandKey] ?? 0;
    if (this.state.tick - last < cooldown) return false;
    pc.commandCooldowns[commandKey] = this.state.tick;
    pc.authority = Math.max(0, pc.authority - authCost);
    pc.corruption = Math.min(100, (pc.corruption ?? 0) + Math.max(1, authCost * 0.08));
    return true;
  }

  private _nearestOwned(emp: Empire, target: StarSystem): StarSystem | null {
    let best: StarSystem | null = null, bestD = Infinity;
    for (const id of emp.ownedSystemIds) {
      const s = this.state.systems[id]; if (!s) continue;
      const d = Math.hypot(s.x - target.x, s.y - target.y);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  commandRallyFleet(targetSystemId: Id): boolean {
    if (!this._checkCommand("rally", 15, 20)) return false;
    const pc = this.state.playerControl;
    const emp = this.state.empires[pc.controlledEmpireId!]!;
    const target = this.state.systems[targetSystemId];
    if (!target) return false;
    const origin = this._nearestOwned(emp, target);
    if (!origin) return false;
    const kind = target.ownerEmpireId && target.ownerEmpireId !== emp.id ? "war" : "colonizer";
    const strength = Math.max(15, emp.militaryStrength * 0.12);
    const id = `fleet-cmd-${this.state.tick}-${Object.keys(this.state.fleets).length}`;
    this.state.fleets[id] = {
      id, name: `Imperial Rally Fleet to ${target.name}`, kind, shipClass: kind === "war" ? "armada" : "settler",
      ownerEmpireId: emp.id, originSystemId: origin.id, targetSystemId,
      path: [origin.id, targetSystemId], legIndex: 0, legProgress: 0,
      totalDist: Math.max(1, Math.hypot(origin.x - target.x, origin.y - target.y)),
      x: origin.x, y: origin.y, progress: 0, speed: 2.5, strength, createdTick: this.state.tick,
    };
    createEvent(this.state, this.state.tick, "border-conflict", `${emp.name}: Imperial fleet rallied`, `${emp.ruler.title} ${emp.ruler.name} ordered a fleet toward ${target.name}.`, 3, [emp.id], [target.id]);
    this._touch();
    return true;
  }

  commandMoveFlagship(systemId: Id): boolean {
    if (!this._checkCommand("flagship", 8, 8)) return false;
    const pc = this.state.playerControl;
    const emp = this.state.empires[pc.controlledEmpireId!]!;
    const dest = this.state.systems[systemId];
    if (!dest) return false;
    let fleet = pc.flagshipFleetId ? this.state.fleets[pc.flagshipFleetId] : null;
    if (!fleet) {
      const id = this._spawnFlagship(emp);
      fleet = id ? this.state.fleets[id] : null;
      pc.flagshipFleetId = id;
    }
    if (!fleet) return false;
    const origin = this.state.systems[fleet.targetSystemId] ?? this.state.systems[emp.capitalSystemId];
    if (!origin) return false;
    fleet.originSystemId = origin.id;
    fleet.targetSystemId = dest.id;
    fleet.path = [origin.id, dest.id];
    fleet.legIndex = 0;
    fleet.legProgress = 0;
    fleet.totalDist = Math.max(1, Math.hypot(origin.x - dest.x, origin.y - dest.y));
    fleet.progress = 0;
    createEvent(this.state, this.state.tick, "border-conflict", `${emp.name} flagship dispatched`, `${fleet.name} was ordered to ${dest.name}.`, 3, [emp.id], [dest.id]);
    this._touch();
    return true;
  }

  commandFortifySystem(systemId: Id): boolean {
    if (!this._checkCommand("fortify", 20, 15)) return false;
    const pc = this.state.playerControl;
    const emp = this.state.empires[pc.controlledEmpireId!]!;
    const sys = this.state.systems[systemId];
    if (!sys || sys.ownerEmpireId !== emp.id) return false;
    sys.stability = Math.min(1, sys.stability + 0.2);
    sys.markers ??= [];
    const existing = sys.markers.findIndex(m => m.kind === "shipyard");
    const marker = { kind: "shipyard" as const, since: this.state.tick, label: "Fortified by imperial decree" };
    if (existing >= 0) sys.markers[existing] = marker; else sys.markers.push(marker);
    createEvent(this.state, this.state.tick, "golden-age", `${emp.name} fortified ${sys.name}`, `${emp.ruler.title} ${emp.ruler.name} ordered the fortification of ${sys.name}.`, 2, [emp.id], [systemId]);
    this._touch();
    return true;
  }

  commandStabilizeSystem(systemId: Id): boolean {
    if (!this._checkCommand("stabilize", 10, 10)) return false;
    const pc = this.state.playerControl;
    const emp = this.state.empires[pc.controlledEmpireId!]!;
    const sys = this.state.systems[systemId];
    if (!sys || sys.ownerEmpireId !== emp.id) return false;
    sys.stability = Math.min(1, sys.stability + 0.25);
    emp.cohesion = Math.min(1, emp.cohesion + 0.02);
    createEvent(this.state, this.state.tick, "golden-age", `${emp.name} stabilized ${sys.name}`, `Imperial policy brought calm to ${sys.name}.`, 2, [emp.id], [systemId]);
    this._touch();
    return true;
  }

  commandProposePeace(targetEmpireId: Id): boolean {
    if (!this._checkCommand("peace", 30, 25)) return false;
    const pc = this.state.playerControl;
    const emp = this.state.empires[pc.controlledEmpireId!]!;
    const target = this.state.empires[targetEmpireId];
    if (!target) return false;
    const rel = emp.relationshipByEmpireId[targetEmpireId];
    if (!rel?.atWar) return false;
    pc.legitimacy = Math.max(0, pc.legitimacy - 5);
    this.forcePeace(emp.id, targetEmpireId);
    createEvent(this.state, this.state.tick, "peace-signed", `${emp.name} proposed peace to ${target.name}`, `${emp.ruler.title} ${emp.ruler.name} personally negotiated an end to hostilities with ${target.name}.`, 3, [emp.id, targetEmpireId], []);
    return true;
  }

  commandProvokeWar(targetEmpireId: Id): boolean {
    if (!this._checkCommand("war", 40, 30)) return false;
    const pc = this.state.playerControl;
    const emp = this.state.empires[pc.controlledEmpireId!]!;
    const target = this.state.empires[targetEmpireId];
    if (!target) return false;
    this.forceWar(emp.id, targetEmpireId);
    const admiral = emp.court.find(c => c.role === "admiral");
    const minister = emp.court.find(c => c.role === "minister");
    if (admiral) admiral.loyalty = Math.min(1, admiral.loyalty + 0.08);
    if (minister) minister.loyalty = Math.max(0, minister.loyalty - 0.1);
    createEvent(this.state, this.state.tick, "war-declared", `${emp.name}: Imperial war declaration`, `${emp.ruler.title} ${emp.ruler.name} personally declared war on ${target.name}.${admiral ? ` ${admiral.title} ${admiral.name} rallied behind the throne.` : ""}`, 4, [emp.id, targetEmpireId], []);
    return true;
  }

  commandSponsorColonization(systemId: Id): boolean {
    if (!this._checkCommand("colonize", 25, 18)) return false;
    const pc = this.state.playerControl;
    const emp = this.state.empires[pc.controlledEmpireId!]!;
    const target = this.state.systems[systemId];
    if (!target || target.ownerEmpireId !== null) return false;
    let origin: StarSystem | null = null;
    for (const nid of target.connectedSystemIds) {
      const s = this.state.systems[nid];
      if (s?.ownerEmpireId === emp.id) { origin = s; break; }
    }
    if (!origin) return false;
    const id = `fleet-col-${this.state.tick}-${Object.keys(this.state.fleets).length}`;
    this.state.fleets[id] = {
      id, name: `Imperial Colonization to ${target.name}`, kind: "colonizer", shipClass: "settler",
      ownerEmpireId: emp.id, originSystemId: origin.id, targetSystemId: systemId,
      path: [origin.id, systemId], legIndex: 0, legProgress: 0,
      totalDist: Math.max(1, Math.hypot(origin.x - target.x, origin.y - target.y)),
      x: origin.x, y: origin.y, progress: 0, speed: 2.8, strength: 10, createdTick: this.state.tick,
    };
    createEvent(this.state, this.state.tick, "system-colonized", `${emp.name} sponsored colonization of ${target.name}`, `By imperial decree, a colony fleet was dispatched to ${target.name}.`, 2, [emp.id], [systemId]);
    emp.wealth = Math.max(0, emp.wealth - 15);
    this._touch();
    return true;
  }

  commandBuildArtifact(systemId: Id, kind?: ArtifactKind): boolean {
    if (!this._checkCommand("artifact", 120, 45)) return false;
    const pc = this.state.playerControl;
    const emp = this.state.empires[pc.controlledEmpireId!]!;
    const sys = this.state.systems[systemId];
    if (!sys || sys.ownerEmpireId !== emp.id || sys.artifactId) return false;
    if (emp.wealth < 450) return false;
    const artifact = createArtifact(this.state, sys, this.rng, kind ?? pickArtifactKind(this.rng), "built", emp.id);
    emp.wealth -= 450;
    pc.legitimacy = Math.max(0, pc.legitimacy - 4);
    createEvent(this.state, this.state.tick, "artifact-discovered", `${emp.name} built ${artifact.name}`, `${emp.ruler.title} ${emp.ruler.name} commissioned ${artifact.name}, a ${ARTIFACT_LABEL[artifact.kind].toLowerCase()}, at ${sys.name}.`, 4, [emp.id], [sys.id]);
    this._touch();
    return true;
  }

  commandSpyMission(targetEmpireId: Id, mission: SpyMission): boolean {
    if (!this._checkCommand(`spy-${mission}`, 70, 25)) return false;
    const pc = this.state.playerControl;
    const emp = this.state.empires[pc.controlledEmpireId!]!;
    const target = this.state.empires[targetEmpireId];
    if (!target || target.id === emp.id) return false;
    const success = this.rng.next() < Math.max(0.25, Math.min(0.85, 0.55 + emp.techLevel * 0.08 - target.cohesion * 0.25));
    const rel = this._relationship(target, emp.id);
    if (!success) {
      addRelationModifier(rel, { label: "Caught spy network", opinionDelta: -18, tensionDelta: 18, expiresAtTick: this.state.tick + 450 });
      pc.legitimacy = Math.max(0, pc.legitimacy - 8);
      createEvent(this.state, this.state.tick, "border-conflict", `${emp.name} spy network exposed`, `${target.name} exposed ${emp.name}'s ${mission.replace("-", " ")} operation.`, 3, [emp.id, target.id], []);
      this._touch();
      return true;
    }
    switch (mission) {
      case "steal-tech":
        emp.techLevel = Math.min(3, emp.techLevel + Math.max(0.02, target.techLevel * 0.04));
        break;
      case "incite-riots": {
        target.cohesion = Math.max(0.05, target.cohesion - 0.06);
        const sys = this.state.systems[target.ownedSystemIds[0]];
        if (sys) { sys.stability = Math.max(0.05, sys.stability - 0.15); sys.markers ??= []; sys.markers.push({ kind: "rebel-hotbed", since: this.state.tick, label: `Agitated by ${emp.name} spies` }); }
        break;
      }
      case "improve-relations": {
        const forward = this._relationship(emp, target.id);
        addRelationModifier(forward, { label: "Secret diplomatic channel", opinionDelta: 18, tensionDelta: -8, expiresAtTick: this.state.tick + 500 });
        addRelationModifier(this._relationship(target, emp.id), { label: "Secret diplomatic channel", opinionDelta: 12, tensionDelta: -6, expiresAtTick: this.state.tick + 500 });
        break;
      }
      case "sabotage-fleet": {
        const fleet = Object.values(this.state.fleets).find(f => f.ownerEmpireId === target.id && f.kind === "war");
        if (fleet) delete this.state.fleets[fleet.id];
        else target.militaryStrength = Math.max(1, target.militaryStrength * 0.9);
        break;
      }
    }
    createEvent(this.state, this.state.tick, "border-conflict", `${emp.name} spy mission succeeded`, `${emp.name}'s agents completed a ${mission.replace("-", " ")} operation against ${target.name}.`, 3, [emp.id, target.id], []);
    this._touch();
    return true;
  }

  commandSetWarDirective(targetEmpireId: Id, focus: WarFocus): boolean {
    const pc = this.state.playerControl;
    if (pc.mode !== "empire" || !pc.controlledEmpireId) return false;
    const emp = this.state.empires[pc.controlledEmpireId];
    const target = this.state.empires[targetEmpireId];
    if (!emp || !target || !emp.activeWarEmpireIds.includes(targetEmpireId)) return false;
    if (pc.authority < 10) return false;
    pc.authority = Math.max(0, pc.authority - 10);
    emp.warDirectives ??= {};
    emp.warDirectives[targetEmpireId] = { targetEmpireId, focus, createdTick: this.state.tick };
    const admiral = emp.court.find(c => c.role === "admiral");
    if (admiral && (focus === "attack" || focus === "raid")) admiral.loyalty = Math.min(1, admiral.loyalty + 0.04);
    createEvent(this.state, this.state.tick, "war-declared", `${emp.name} war room: ${focus} ${target.name}`,
      `${emp.ruler.title} ${emp.ruler.name} ordered the war against ${target.name} fought with a doctrine of ${focus}.`,
      2, [emp.id, targetEmpireId], []);
    this._touch();
    return true;
  }

  commandAdoptReligion(religionId: Id): boolean {
    if (!this._checkCommand("religion", 90, 35)) return false;
    const pc = this.state.playerControl;
    const emp = this.state.empires[pc.controlledEmpireId!]!;
    const religion = this.state.religions[religionId];
    if (!religion) return false;
    const old = emp.stateReligionId;
    emp.stateReligionId = religionId;
    pc.legitimacy = Math.max(0, pc.legitimacy - (old && old !== religionId ? 12 : 4));
    const prophet = emp.court.find(c => c.role === "prophet");
    if (prophet) prophet.loyalty = old && old !== religionId ? Math.max(0, prophet.loyalty - 0.18) : Math.min(1, prophet.loyalty + 0.1);
    createEvent(this.state, this.state.tick, "religion-adopted", `${emp.name} adopted ${religion.name}`, `${emp.ruler.title} ${emp.ruler.name} declared ${religion.name} the favored faith of ${emp.name}.`, 4, [emp.id], [religion.holySystemId]);
    this._touch();
    return true;
  }

  commandReformGovernment(): boolean {
    if (!this._checkCommand("reform", 140, 35)) return false;
    const pc = this.state.playerControl;
    const emp = this.state.empires[pc.controlledEmpireId!]!;
    pc.corruption = Math.max(0, (pc.corruption ?? 0) - 35);
    pc.legitimacy = Math.max(0, pc.legitimacy - 6);
    emp.cohesion = Math.max(0.05, emp.cohesion - 0.04);
    const cap = this.state.systems[emp.capitalSystemId];
    if (cap) cap.stability = Math.max(0.05, cap.stability - 0.08);
    createEvent(this.state, this.state.tick, "coup", `${emp.name} reformed its government`, `${emp.ruler.title} ${emp.ruler.name} launched a painful anti-corruption reform across ${emp.name}.`, 3, [emp.id], cap ? [cap.id] : []);
    this._touch();
    return true;
  }

  isRunning(): boolean { return this.running; }
  getSettings(): SimSettings { return { ...this.settings }; }
  setSpeed(ticksPerSecond: number): void { this.settings.ticksPerSecond = ticksPerSecond; }
  getSystem(id: Id) { return this.state.systems[id] ?? null; }
  getEmpire(id: Id) { return this.state.empires[id] ?? null; }
  getFleet(id: Id) { return this.state.fleets[id] ?? null; }
}
