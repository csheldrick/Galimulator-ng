import type { GalaxyState, SimSettings, Id } from "../types/sim";
import { SeededRandom } from "./Random";
import { generateGalaxy } from "./Galaxy";
import { executeTick } from "./Tick";
import { createEvent } from "./Events";

export type SimListener = (snapshot: Readonly<GalaxyState>) => void;

const FIXED_TICK_MS = 50;

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
    return () => this.listeners.delete(fn);
  }

  private _notify(): void {
    this._snapshotDirty = true;
    const snap = this.getSnapshot();
    for (const fn of this.listeners) fn(snap);
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
      const msPerTick = FIXED_TICK_MS / Math.max(0.1, this.settings.ticksPerSecond / 20);
      this.accumulator += elapsed;
      let ticked = false;
      let safeGuard = 0;
      while (this.accumulator >= msPerTick && safeGuard < 20) {
        executeTick(this.state, this.rng);
        this.accumulator -= msPerTick;
        ticked = true;
        safeGuard++;
      }
      if (ticked) this._notify();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  pause(): void {
    this.running = false;
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
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

  isRunning(): boolean { return this.running; }

  getSettings(): SimSettings { return { ...this.settings }; }

  setSpeed(ticksPerSecond: number): void {
    this.settings.ticksPerSecond = ticksPerSecond;
  }

  getSystem(id: Id) { return this.state.systems[id] ?? null; }
  getEmpire(id: Id) { return this.state.empires[id] ?? null; }
}
