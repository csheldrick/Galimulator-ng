import { useMemo, useState } from "react";
import type { GalaxyState, Id, SimSettings } from "../types/sim";
import type { ViewOptions } from "../render/GalaxyCanvas";

type EmpireSort = "systems" | "population" | "military" | "tech" | "wars" | "name";

interface Props {
  snapshot: Readonly<GalaxyState>;
  selectedEmpireId: Id | null;
  running: boolean;
  onStart: () => void;
  onPause: () => void;
  onStep: () => void;
  onRunTicks: (count: number) => void;
  onReset: () => void;
  onNewSeed: () => void;
  onResetCamera: () => void;
  onExportJson: () => void;
  onExportReport: () => void;
  onSelectEmpire: (id: Id) => void;
  settings: SimSettings;
  onSettingsChange: (s: Partial<SimSettings>) => void;
  viewOptions: ViewOptions;
  onViewOptionsChange: (next: ViewOptions) => void;
}

function fmt(n: number, dec = 0) { return n.toFixed(dec); }

export function ControlPanel({
  snapshot,
  selectedEmpireId,
  running,
  onStart,
  onPause,
  onStep,
  onRunTicks,
  onReset,
  onNewSeed,
  onResetCamera,
  onExportJson,
  onExportReport,
  onSelectEmpire,
  settings,
  onSettingsChange,
  viewOptions,
  onViewOptionsChange,
}: Props) {
  const [empireQuery, setEmpireQuery] = useState("");
  const [empireSort, setEmpireSort] = useState<EmpireSort>("systems");
  const empires = Object.values(snapshot.empires);
  const systems = Object.values(snapshot.systems);
  const populated = systems.filter(s => s.ownerEmpireId).length;
  const totalPop = empires.reduce((sum, e) => sum + e.population, 0);
  const activeWars = new Set<string>();
  for (const e of empires) for (const w of e.activeWarEmpireIds) activeWars.add([e.id, w].sort().join("~"));

  const selectedEmpire = selectedEmpireId ? snapshot.empires[selectedEmpireId] : null;
  const filteredEmpires = useMemo(() => {
    const q = empireQuery.trim().toLowerCase();
    return [...empires]
      .filter(e => !q || e.name.toLowerCase().includes(q))
      .sort((a, b) => {
        switch (empireSort) {
          case "population": return b.population - a.population;
          case "military": return b.militaryStrength - a.militaryStrength;
          case "tech": return b.techLevel - a.techLevel;
          case "wars": return b.activeWarEmpireIds.length - a.activeWarEmpireIds.length;
          case "name": return a.name.localeCompare(b.name);
          case "systems":
          default: return b.ownedSystemIds.length - a.ownedSystemIds.length;
        }
      });
  }, [empires, empireQuery, empireSort]);

  const setView = (key: keyof ViewOptions, value: boolean) => {
    onViewOptionsChange({ ...viewOptions, [key]: value });
  };

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

      {selectedEmpire && (
        <div className="selected-empire-card" style={{ borderColor: selectedEmpire.color }}>
          <div className="selected-empire-title">
            <span className="emp-dot" style={{ background: selectedEmpire.color }} />
            <b>{selectedEmpire.name}</b>
          </div>
          <div className="selected-empire-stats">
            <span>{selectedEmpire.ownedSystemIds.length} systems</span>
            <span>{fmt(selectedEmpire.population / 1000)}K pop</span>
            <span>{fmt(selectedEmpire.militaryStrength)} mil</span>
            <span>{selectedEmpire.activeWarEmpireIds.length} wars</span>
          </div>
        </div>
      )}

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
        <button onClick={onResetCamera}>Camera</button>
      </div>

      <div className="section-title">View</div>
      <div className="toggle-grid">
        <label><input type="checkbox" checked={viewOptions.territory} onChange={e => setView("territory", e.target.checked)} /> Territory</label>
        <label><input type="checkbox" checked={viewOptions.labels} onChange={e => setView("labels", e.target.checked)} /> Labels</label>
        <label><input type="checkbox" checked={viewOptions.wars} onChange={e => setView("wars", e.target.checked)} /> Wars</label>
        <label><input type="checkbox" checked={viewOptions.events} onChange={e => setView("events", e.target.checked)} /> Events</label>
      </div>

      <div className="section-title">Export</div>
      <div className="btn-row">
        <button onClick={onExportJson}>JSON</button>
        <button onClick={onExportReport}>Report</button>
      </div>

      <div className="section-title">Settings</div>
      <div className="control-row">
        <label>Speed</label>
        <input type="range" min={1} max={20} step={1} value={settings.ticksPerSecond} onChange={e => onSettingsChange({ ticksPerSecond: Number(e.target.value) })} />
        <span>{settings.ticksPerSecond}x</span>
      </div>
      <div className="control-row">
        <label>Stars</label>
        <input type="range" min={100} max={1000} step={50} value={settings.numStars} onChange={e => onSettingsChange({ numStars: Number(e.target.value) })} />
        <span>{settings.numStars}</span>
      </div>
      <div className="control-row">
        <label>Empires</label>
        <input type="range" min={4} max={24} step={1} value={settings.numEmpires} onChange={e => onSettingsChange({ numEmpires: Number(e.target.value) })} />
        <span>{settings.numEmpires}</span>
      </div>
      <div className="control-row seed-row">
        <label>Seed</label>
        <input type="number" value={settings.seed} onChange={e => onSettingsChange({ seed: Number(e.target.value) || 0 })} />
      </div>

      <div className="section-title">Empires</div>
      <div className="empire-nav-tools">
        <input
          placeholder="Filter empires..."
          value={empireQuery}
          onChange={e => setEmpireQuery(e.target.value)}
        />
        <select value={empireSort} onChange={e => setEmpireSort(e.target.value as EmpireSort)}>
          <option value="systems">Systems</option>
          <option value="population">Population</option>
          <option value="military">Military</option>
          <option value="tech">Tech</option>
          <option value="wars">Wars</option>
          <option value="name">Name</option>
        </select>
      </div>
      <div className="sidebar-empire-list">
        {filteredEmpires.map(e => (
          <button
            key={e.id}
            className={e.id === selectedEmpireId ? "sidebar-empire selected" : "sidebar-empire"}
            onClick={() => onSelectEmpire(e.id)}
            title={`${e.name} — ${e.ownedSystemIds.length} systems, ${Math.round(e.population)} population`}
          >
            <span className="emp-dot" style={{ background: e.color }} />
            <span className="emp-name">{e.name}</span>
            <span className="emp-size">{e.ownedSystemIds.length}</span>
          </button>
        ))}
        {filteredEmpires.length === 0 && <div className="empty-hint">No empires match that filter.</div>}
      </div>
    </div>
  );
}
