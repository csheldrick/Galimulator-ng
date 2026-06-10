import type { GalaxyState, SimSettings, Id, Empire } from "../types/sim";
import { SeededRandom } from "./Random";
import { generateGalaxy } from "./Galaxy";
import { executeTick } from "./Tick";
import { createEvent } from "./Events";

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

  private _buildSnapshot(): Readonly<GalaxyState> {
    return structuredClone(this.state) as Readonly<GalaxyState>;
  }

  getSnapshot(): Readonly<GalaxyState> {
    if (this._snapshotDirty) {
      this._snapshot = this._buildSnapshot();
      this._snapshotDirty = false;
    }
    return this._snapshot;
  }

  subscribe(fn: SimListener): () => void {
    this.listeners.add(fn);
    fn(this.getSnapshot());
    return () => { this.listeners.delete(fn); };
  }

  private _notify(): void {
    this._snapshotDirty = true;
    if (this.listeners.size === 0) return;
    const snap = this.getSnapshot();
    for (const fn of this.listeners) fn(snap);
  }

  private _touch(): void {
    this._notify();
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

  pause(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  step(): void {
    executeTick(this.state, this.rng);
    this._notify();
  }

  reset(newSettings?: Partial<SimSettings>): void {
    this.pause();
    if (newSettings) this.settings = { ...this.settings, ...newSettings };
    this.rng = new SeededRandom(this.settings.seed);
    this.state = generateGalaxy(
      this.settings.seed, this.settings.numStars, this.settings.numEmpires, this.rng
    );
    this._fireFoundedEvents();
    this._notify();
  }

  runTicks(count: number): void {
    const n = Math.max(1, Math.min(500, Math.floor(count)));
    for (let i = 0; i < n; i++) executeTick(this.state, this.rng);
    this._notify();
  }

  boostSystem(systemId: Id): void {
    const sys = this.state.systems[systemId];
    if (!sys) return;
    sys.population = Math.min(3, sys.population + 0.5);
    sys.resources = Math.min(1.5, sys.resources + 0.25);
    sys.habitability = Math.min(1, sys.habitability + 0.15);
    sys.stability = Math.min(1, sys.stability + 0.25);
    sys.techLevel = Math.min(3, sys.techLevel + 0.15);
    createEvent(this.state, this.state.tick, "golden-age", `${sys.name} flourished`, `${sys.name} entered a brief golden age.`, 2, sys.ownerEmpireId ? [sys.ownerEmpireId] : [], [sys.id]);
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
      id,
      name: `${sys.name} Ascendancy`,
      color: `hsl(${this.rng.nextInt(0, 360)},75%,58%)`,
      capitalSystemId: sys.id,
      ownedSystemIds: [sys.id],
      population: Math.max(sys.population * 1000, 500),
      wealth: 300,
      militaryStrength: 120,
      cohesion: 0.8,
      aggression: this.rng.range(0.2, 0.8),
      expansionism: this.rng.range(0.4, 0.9),
      techLevel: Math.max(sys.techLevel, 0.5),
      cultureId,
      relationshipByEmpireId: {},
      activeWarEmpireIds: [],
      historicalEventIds: [],
    };

    sys.ownerEmpireId = id;
    sys.cultureId = cultureId;
    sys.population = Math.max(sys.population, 0.7);
    this.state.empires[id] = empire;
    createEvent(this.state, this.state.tick, "empire-founded", `${empire.name} founded`, `${empire.name} rose at ${sys.name}.`, 4, [id], [sys.id]);
    this._touch();
    return id;
  }

  boostEmpire(empireId: Id): void {
    const emp = this.state.empires[empireId];
    if (!emp) return;
    emp.wealth += 500;
    emp.cohesion = Math.min(1, emp.cohesion + 0.2);
    emp.techLevel = Math.min(3, emp.techLevel + 0.2);
    emp.militaryStrength += 150;
    createEvent(this.state, this.state.tick, "golden-age", `${emp.name} strengthened`, `${emp.name} received a surge of wealth and cohesion.`, 3, [emp.id], []);
    this._touch();
  }

  weakenEmpire(empireId: Id): void {
    const emp = this.state.empires[empireId];
    if (!emp) return;
    emp.wealth = Math.max(0, emp.wealth * 0.4);
    emp.cohesion = Math.max(0.05, emp.cohesion - 0.35);
    emp.militaryStrength = Math.max(1, emp.militaryStrength * 0.45);
    for (const sysId of emp.ownedSystemIds) {
      const sys = this.state.systems[sysId];
      if (sys) sys.stability = Math.max(0.05, sys.stability - 0.15);
    }
    createEvent(this.state, this.state.tick, "empire-collapsed", `${emp.name} destabilized`, `${emp.name} was weakened by outside forces.`, 3, [emp.id], emp.ownedSystemIds.slice(0, 8));
    this._touch();
  }

  isRunning(): boolean { return this.running; }

  getSettings(): SimSettings { return { ...this.settings }; }

  setSpeed(ticksPerSecond: number): void {
    this.settings.ticksPerSecond = ticksPerSecond;
  }

  getSystem(id: Id) { return this.state.systems[id] ?? null; }
  getEmpire(id: Id) { return this.state.empires[id] ?? null; }
}
