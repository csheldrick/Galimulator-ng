import type { GalaxyState, SimSettings } from "../types/sim";

interface Props {
  snapshot: Readonly<GalaxyState>;
  running: boolean;
  onStart: () => void;
  onPause: () => void;
  onStep: () => void;
  onRunTicks: (count: number) => void;
  onReset: () => void;
  onNewSeed: () => void;
  settings: SimSettings;
  onSettingsChange: (s: Partial<SimSettings>) => void;
}

function fmt(n: number, dec = 0) { return n.toFixed(dec); }

export function ControlPanel({
  snapshot,
  running,
  onStart,
  onPause,
  onStep,
  onRunTicks,
  onReset,
  onNewSeed,
  settings,
  onSettingsChange,
}: Props) {
  const empires = Object.values(snapshot.empires);
  const systems = Object.values(snapshot.systems);
  const populated = systems.filter(s => s.ownerEmpireId).length;
  const totalPop = empires.reduce((sum, e) => sum + e.population, 0);
  const activeWars = new Set<string>();
  for (const e of empires) for (const w of e.activeWarEmpireIds) activeWars.add([e.id, w].sort().join("~"));

  return (
    <div className="control-panel">
      <h2>galimulator-ng</h2>

      <div className="stat-grid">
        <div><b>{snapshot.tick}</b><span>tick</span></div>
        <div><b>{empires.length}</b><span>empires</span></div>
        <div><b>{populated}</b><span>owned</span></div>
        <div><b>{activeWars.size}</b><span>wars</span></div>
        <div><b>{fmt(totalPop / 1000)}K</b><span>pop</span></div>
        <div><b>{snapshot.eventLog.length}</b><span>events</span></div>
      </div>

      <div className="section-title">Simulation</div>
      <div className="btn-row">
        {running
          ? <button onClick={onPause}>⏸ Pause</button>
          : <button onClick={onStart}>▶ Start</button>
        }
        <button onClick={onStep} disabled={running}>Step</button>
        <button onClick={() => onRunTicks(25)} disabled={running}>+25</button>
        <button onClick={() => onRunTicks(100)} disabled={running}>+100</button>
      </div>
      <div className="btn-row">
        <button onClick={onReset}>Reset</button>
        <button onClick={onNewSeed}>New Seed</button>
      </div>

      <div className="section-title">Settings</div>
      <div className="control-row">
        <label>Speed</label>
        <input
          type="range" min={1} max={20} step={1}
          value={settings.ticksPerSecond}
          onChange={e => onSettingsChange({ ticksPerSecond: Number(e.target.value) })}
        />
        <span>{settings.ticksPerSecond}x</span>
      </div>
      <div className="control-row">
        <label>Stars</label>
        <input
          type="range" min={100} max={1000} step={50}
          value={settings.numStars}
          onChange={e => onSettingsChange({ numStars: Number(e.target.value) })}
        />
        <span>{settings.numStars}</span>
      </div>
      <div className="control-row">
        <label>Empires</label>
        <input
          type="range" min={4} max={24} step={1}
          value={settings.numEmpires}
          onChange={e => onSettingsChange({ numEmpires: Number(e.target.value) })}
        />
        <span>{settings.numEmpires}</span>
      </div>
      <div className="control-row seed-row">
        <label>Seed</label>
        <input
          type="number"
          value={settings.seed}
          onChange={e => onSettingsChange({ seed: Number(e.target.value) || 0 })}
        />
      </div>

      <div className="section-title">Top Empires</div>
      <div className="mini-ranking">
        {[...empires]
          .sort((a, b) => b.ownedSystemIds.length - a.ownedSystemIds.length)
          .slice(0, 8)
          .map(e => (
            <div key={e.id} className="rank-row">
              <span className="emp-dot" style={{ background: e.color }} />
              <span>{e.name}</span>
              <b>{e.ownedSystemIds.length}</b>
            </div>
          ))}
      </div>
    </div>
  );
}
