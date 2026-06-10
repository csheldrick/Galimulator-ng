import type { GalaxyState, SimSettings, SaveFile, Id, Empire, EmpireRelationship } from "../types/sim";
import { SeededRandom } from "./Random";
import { generateGalaxy, makeRuler } from "./Galaxy";
import { executeTick } from "./Tick";
import { createEvent, getEventCounter, setEventCounter } from "./Events";
import { IDEOLOGIES } from "./Moods";
import { makeCourt } from "./Characters";

const SAVE_VERSION = 3;

// Older saves and hand-edited files may lack newer fields; patch them in so
// rehydrated galaxies keep ticking.
function upgradeState(state: GalaxyState): GalaxyState {
  state.religions ??= {};
  state.tradeRoutes ??= {};
  state.monsters ??= {};
  for (const sys of Object.values(state.systems)) {
    sys.religionId ??= null;
    sys.artifactName ??= null;
    sys.godBoostTicks ??= 0;
  }
  for (const emp of Object.values(state.empires)) {
    emp.ideology ??= IDEOLOGIES[0];
    emp.stateReligionId ??= null;
    emp.court ??= [];
    emp.godBoostTicks ??= 0;
  }
  for (const fleet of Object.values(state.fleets)) {
    fleet.shipClass ??= fleet.kind === "war" ? "strike" : "settler";
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
    this.state = generateGalaxy(settings.seed, settings.numStars, settings.numEmpires, this.rng);
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
  /** Cloned, immutable state for React UI panels. Expensive — call sparingly (polled at low frequency). */
  getSnapshot(): Readonly<GalaxyState> { if (this._snapshotDirty) { this._snapshot = this._buildSnapshot(); this._snapshotDirty = false; } return this._snapshot; }
  /** Live, mutable simulation state for read-only same-thread consumers (the canvas renderer). No clone. */
  getLiveState(): Readonly<GalaxyState> { return this.state; }
  /** Bumps on every state change; lets renderers cheaply detect "did anything change" without object identity. */
  getRevision(): number { return this._revision; }
  subscribe(fn: SimListener): () => void { this.listeners.add(fn); fn(this.getSnapshot()); return () => { this.listeners.delete(fn); }; }
  private _notify(): void { this._revision++; this._snapshotDirty = true; if (this.listeners.size === 0) return; const snap = this.getSnapshot(); for (const fn of this.listeners) fn(snap); }
  private _touch(): void { this._notify(); }

  private _relationship(source: Empire, targetId: Id): EmpireRelationship {
    const existing = source.relationshipByEmpireId[targetId];
    if (existing) return existing;
    const rel: EmpireRelationship = { targetEmpireId: targetId, tension: 0, opinion: 50, atWar: false };
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
    this.state = generateGalaxy(this.settings.seed, this.settings.numStars, this.settings.numEmpires, this.rng);
    this._fireFoundedEvents();
    this._notify();
  }
  runTicks(count: number): void { const n = Math.max(1, Math.min(500, Math.floor(count))); for (let i = 0; i < n; i++) executeTick(this.state, this.rng); this._notify(); }

  /** Full save including PRNG state so a loaded galaxy continues deterministically. */
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

  /** Accepts a SaveFile or a bare GalaxyState export. Returns an error message or null on success. */
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
      godBoostTicks: 400,
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
    empire.activeWarEmpireIds = empire.activeWarEmpireIds.filter(id => id !== otherId); other.activeWarEmpireIds = other.activeWarEmpireIds.filter(id => id !== empireId);
    createEvent(this.state, this.state.tick, "peace-signed", `Peace: ${empire.name} & ${other.name}`, `${empire.name} and ${other.name} were forced into peace.`, 3, [empireId, otherId], []);
    this._touch();
  }

  inflameEmpire(empireId: Id): void { const emp = this.state.empires[empireId]; if (!emp) return; emp.aggression = Math.min(1, emp.aggression + 0.25); for (const other of Object.values(this.state.empires)) { if (other.id === emp.id) continue; const rel = this._relationship(emp, other.id); rel.tension = Math.min(100, rel.tension + 30); rel.opinion = Math.max(0, rel.opinion - 20); } createEvent(this.state, this.state.tick, "border-conflict", `${emp.name} radicalized`, `${emp.name} became more aggressive toward its rivals.`, 3, [emp.id], []); this._touch(); }
  pacifyEmpire(empireId: Id): void { const emp = this.state.empires[empireId]; if (!emp) return; emp.aggression = Math.max(0, emp.aggression - 0.25); emp.cohesion = Math.min(1, emp.cohesion + 0.1); for (const rel of Object.values(emp.relationshipByEmpireId)) { rel.tension = Math.max(0, rel.tension - 40); rel.opinion = Math.min(100, rel.opinion + 20); } createEvent(this.state, this.state.tick, "peace-signed", `${emp.name} pacified`, `${emp.name} turned inward and reduced foreign tensions.`, 2, [emp.id], []); this._touch(); }

  isRunning(): boolean { return this.running; }
  getSettings(): SimSettings { return { ...this.settings }; }
  setSpeed(ticksPerSecond: number): void { this.settings.ticksPerSecond = ticksPerSecond; }
  getSystem(id: Id) { return this.state.systems[id] ?? null; }
  getEmpire(id: Id) { return this.state.empires[id] ?? null; }
  getFleet(id: Id) { return this.state.fleets[id] ?? null; }
}
