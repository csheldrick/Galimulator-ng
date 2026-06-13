import { useMemo, useRef, useState } from "react";
import type { GalaxyState, Id, SimSettings, GalaxyShape, StarlaneMode, EmpireLayout, GridAlignment } from "../types/sim";
import type { ViewOptions } from "../render/GalaxyCanvas";
import type { MapMode } from "../render/territory";
import { MOOD_LABEL, MOOD_COLOR, IDEOLOGY_LABEL, IDEOLOGY_COLOR, rulerDisplayName } from "../sim/Moods";

type EmpireSort = "systems" | "population" | "military" | "tech" | "wars" | "name";

interface Props {
  snapshot: Readonly<GalaxyState>;
  selectedEmpireId: Id | null;
  followEmpireId: Id | null;
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
  onHeadlessReport: () => void;
  onPresetSweep: () => void;
  onRiotGalaxy: () => void;
  onBalanceGalaxy: () => void;
  onWebStarlanes: () => void;
  onGodEmpire: () => void;
  transcendenceEnabled: boolean;
  onSetTranscendenceEnabled: (value: boolean) => void;
  onImportSave: (text: string) => void;
  onSelectEmpire: (id: Id) => void;
  onToggleFollow: (id: Id) => void;
  settings: SimSettings;
  onSettingsChange: (s: Partial<SimSettings>) => void;
  viewOptions: ViewOptions;
  onViewOptionsChange: (next: ViewOptions) => void;
}

function fmt(n: number, dec = 0) { return n.toFixed(dec); }

export function ControlPanel({
  snapshot,
  selectedEmpireId,
  followEmpireId,
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
  onHeadlessReport,
  onPresetSweep,
  onRiotGalaxy,
  onBalanceGalaxy,
  onWebStarlanes,
  onGodEmpire,
  transcendenceEnabled,
  onSetTranscendenceEnabled,
  onImportSave,
  onSelectEmpire,
  onToggleFollow,
  settings,
  onSettingsChange,
  viewOptions,
  onViewOptionsChange,
}: Props) {
  const [empireQuery, setEmpireQuery] = useState("");
  const [empireSort, setEmpireSort] = useState<EmpireSort>("systems");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const empires = Object.values(snapshot.empires);
  const systems = Object.values(snapshot.systems);
  const fleets = Object.values(snapshot.fleets);
  const populated = systems.filter(s => s.ownerEmpireId).length;
  const totalPop = empires.reduce((sum, e) => sum + e.population, 0);
  const activeWars = new Set<string>();
  for (const e of empires) for (const w of e.activeWarEmpireIds) activeWars.add([e.id, w].sort().join("~"));

  const selectedEmpire = selectedEmpireId ? snapshot.empires[selectedEmpireId] : null;
  const selectedFleetCount = selectedEmpireId ? fleets.filter(f => f.ownerEmpireId === selectedEmpireId).length : 0;
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
      <div className="hud-group hud-status">
        <h2>galimulator-ng</h2>

        <div className="stat-grid">
          <div><b>{snapshot.tick}</b><span>tick</span></div>
          <div><b>{empires.length}</b><span>empires</span></div>
          <div><b>{populated}</b><span>owned</span></div>
          <div><b>{activeWars.size}</b><span>wars</span></div>
          <div><b>{fleets.length}</b><span>fleets</span></div>
          <div><b>{fmt(totalPop / 1000)}K</b><span>pop</span></div>
          <div><b>{Object.keys(snapshot.alliances ?? {}).length}</b><span>alliances</span></div>
          <div><b>{Object.keys(snapshot.factions ?? {}).length}</b><span>factions</span></div>
        </div>

        {selectedEmpire && (
          <div className="selected-empire-card" style={{ borderColor: selectedEmpire.color }}>
            <div className="selected-empire-title">
              <span className="emp-dot" style={{ background: selectedEmpire.color }} />
              <b>{selectedEmpire.name}</b>
              <span className="mood-badge" style={{ color: MOOD_COLOR[selectedEmpire.mood] }}>{MOOD_LABEL[selectedEmpire.mood]}</span>
            </div>
            <div className="selected-empire-ruler">{rulerDisplayName(selectedEmpire)} · <span style={{ color: IDEOLOGY_COLOR[selectedEmpire.ideology] }}>{IDEOLOGY_LABEL[selectedEmpire.ideology]}</span></div>
            <div className="selected-empire-stats">
              <span>{selectedEmpire.ownedSystemIds.length} systems</span>
              <span>{fmt(selectedEmpire.population / 1000)}K pop</span>
              <span>{fmt(selectedEmpire.militaryStrength)} mil</span>
              <span>{selectedFleetCount} fleets</span>
            </div>
            <button className={followEmpireId === selectedEmpire.id ? "follow-btn active" : "follow-btn"} onClick={() => onToggleFollow(selectedEmpire.id)}>
              {followEmpireId === selectedEmpire.id ? "⌖ Following — click to stop" : "⌖ Follow this empire"}
            </button>
          </div>
        )}
      </div>

      <div className="hud-group hud-sim">
        <div className="section-title">Simulation</div>
        <div className="btn-row">
          {running ? <button onClick={onPause}>⏸ Pause</button> : <button onClick={onStart}>▶ Start</button>}
          <button onClick={onStep} disabled={running}>Step</button>
          <button onClick={() => onRunTicks(25)} disabled={running}>+25</button>
          <button onClick={() => onRunTicks(100)} disabled={running}>+100</button>
        </div>
        <div className="btn-row">
          <button onClick={onReset}>Reset</button>
          <button onClick={onNewSeed}>New Seed</button>
          <button onClick={onResetCamera}>Camera</button>
        </div>

        <div className="section-title">Scenarios</div>
        <div className="btn-row">
          <button onClick={onGodEmpire} title="Regenerate the galaxy with one god-blessed empire and homeworld, and take direct control of it">⚡ God Empire</button>
        </div>
        <div className="toggle-grid">
          <label title="When off, empires cannot transcend and leave the galaxy"><input type="checkbox" checked={transcendenceEnabled} onChange={e => onSetTranscendenceEnabled(e.target.checked)} /> Transcendence</label>
        </div>

        <div className="section-title">Galaxy God Controls</div>
        <div className="btn-row">
          <button onClick={onRiotGalaxy} title="Throw every empire into a riot">Riot All</button>
          <button onClick={onBalanceGalaxy} title="Destroy roughly half of all stars and fleets">Balance</button>
          <button onClick={onWebStarlanes} title="Add nearby starlanes across the whole map">Web Lanes</button>
        </div>

        <div className="section-title">Save / Load</div>
        <div className="btn-row">
          <button onClick={onExportJson}>Save</button>
          <button onClick={() => fileInputRef.current?.click()}>Load</button>
          <button onClick={onExportReport}>Report</button>
        </div>
        <div className="btn-row">
          <button onClick={onHeadlessReport} title="Run a fresh 1k/3k/10k-tick headless simulation and download the survival/churn/war report">Headless 10k Report</button>
          <button onClick={onPresetSweep} title="Run every galaxy preset headlessly to 3k ticks and download a comparison report (slow)">Preset Sweep</button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={e => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => { if (typeof reader.result === "string") onImportSave(reader.result); };
            reader.readAsText(file);
          }}
        />
      </div>

      <div className="hud-group hud-view-settings">
        <div className="view-settings-cols">
          <div>
            <div className="section-title">View</div>
            <div className="control-row">
              <label>Map</label>
              <select style={{ flex: 1 }} value={viewOptions.mapMode} onChange={e => onViewOptionsChange({ ...viewOptions, mapMode: e.target.value as MapMode })}>
                <option value="empire">Empires</option>
                <option value="religion">Religions</option>
                <option value="wealth">Wealth</option>
                <option value="alliance">Alliances</option>
                <option value="heat">Heat</option>
                <option value="faction">Factions</option>
              </select>
            </div>
            <div className="toggle-grid">
              <label><input type="checkbox" checked={viewOptions.territory} onChange={e => setView("territory", e.target.checked)} /> Territory</label>
              <label><input type="checkbox" checked={viewOptions.lanes} onChange={e => setView("lanes", e.target.checked)} /> Lanes</label>
              <label><input type="checkbox" checked={viewOptions.labels} onChange={e => setView("labels", e.target.checked)} /> Labels</label>
              <label><input type="checkbox" checked={viewOptions.wars} onChange={e => setView("wars", e.target.checked)} /> Wars</label>
              <label><input type="checkbox" checked={viewOptions.events} onChange={e => setView("events", e.target.checked)} /> Events</label>
              <label><input type="checkbox" checked={viewOptions.fleets} onChange={e => setView("fleets", e.target.checked)} /> Fleets</label>
              <label><input type="checkbox" checked={viewOptions.trade} onChange={e => setView("trade", e.target.checked)} /> Trade</label>
              <label><input type="checkbox" checked={viewOptions.monsters} onChange={e => setView("monsters", e.target.checked)} /> Monsters</label>
            </div>
          </div>
          <div>
            <div className="section-title">Settings</div>
            <div className="control-row"><label>Speed</label><input type="range" min={1} max={20} step={1} value={settings.ticksPerSecond} onChange={e => onSettingsChange({ ticksPerSecond: Number(e.target.value) })} /><span>{settings.ticksPerSecond}x</span></div>
            <div className="control-row"><label>Stars</label><input type="range" min={100} max={1000} step={50} value={settings.numStars} onChange={e => onSettingsChange({ numStars: Number(e.target.value) })} /><span>{settings.numStars}</span></div>
            <div className="control-row"><label>Empires</label><input type="range" min={4} max={24} step={1} value={settings.numEmpires} onChange={e => onSettingsChange({ numEmpires: Number(e.target.value) })} /><span>{settings.numEmpires}</span></div>
            <div className="control-row seed-row"><label>Seed</label><input type="number" value={settings.seed} onChange={e => onSettingsChange({ seed: Number(e.target.value) || 0 })} /></div>
            <div className="control-row">
              <label>Shape</label>
              <select style={{ flex: 1 }} value={settings.galaxyShape ?? "spiral"} onChange={e => onSettingsChange({ galaxyShape: e.target.value as GalaxyShape })}>
                <option value="spiral">Spiral</option>
                <option value="barred-spiral">Barred Spiral</option>
                <option value="disc">Disc</option>
                <option value="hollow-disc">Hollow Disc</option>
                <option value="elliptical">Elliptical</option>
                <option value="irregular">Irregular</option>
                <option value="clustered">Clustered</option>
                <option value="hub">Hub</option>
                <option value="web">Web</option>
                <option value="continents">Continents</option>
                <option value="chaos">Chaos</option>
                <option value="grid">Grid</option>
                <option value="string">String</option>
              </select>
            </div>
            <div className="control-row">
              <label>Lanes</label>
              <select style={{ flex: 1 }} value={settings.starlaneMode ?? "standard"} onChange={e => onSettingsChange({ starlaneMode: e.target.value as StarlaneMode })}>
                <option value="standard">Standard</option>
                <option value="webbed">Webbed</option>
                <option value="dense">Dense</option>
                <option value="sparse">Sparse</option>
                <option value="string">String</option>
              </select>
            </div>
            <div className="control-row">
              <label>Layout</label>
              <select style={{ flex: 1 }} value={settings.empireLayout ?? "classic"} onChange={e => onSettingsChange({ empireLayout: e.target.value as EmpireLayout })}>
                <option value="classic">Classic</option>
                <option value="few-big-blobs">Few Big Blobs</option>
                <option value="many-one-star">Many One-Star</option>
                <option value="random-blobs">Random Blobs</option>
                <option value="scattered">Scattered</option>
                <option value="rim">Rim</option>
              </select>
            </div>
            <div className="control-row">
              <label>Align</label>
              <select style={{ flex: 1 }} value={settings.gridAlignment ?? "none"} onChange={e => onSettingsChange({ gridAlignment: e.target.value as GridAlignment })}>
                <option value="none">Free</option>
                <option value="square">Square Grid</option>
                <option value="hex">Hex Grid</option>
              </select>
            </div>
            <div className="section-title" style={{ marginTop: 6 }}>Presets</div>
            <div className="btn-row" style={{ flexWrap: "wrap" }}>
              {([
                ["Classic Spiral", { galaxyShape: "spiral", starlaneMode: "standard", empireLayout: "classic", gridAlignment: "none" }],
                ["Ring War", { galaxyShape: "hollow-disc", starlaneMode: "webbed", empireLayout: "random-blobs", gridAlignment: "none" }],
                ["Clustered Civs", { galaxyShape: "clustered", starlaneMode: "sparse", empireLayout: "few-big-blobs", gridAlignment: "none" }],
                ["Trade Web", { galaxyShape: "web", starlaneMode: "webbed", empireLayout: "scattered", gridAlignment: "none" }],
                ["Death Chain", { galaxyShape: "string", starlaneMode: "string", empireLayout: "many-one-star", gridAlignment: "none" }],
                ["Toybox Chaos", { galaxyShape: "chaos", starlaneMode: "dense", empireLayout: "random-blobs", gridAlignment: "none" }],
                ["Archipelago", { galaxyShape: "continents", starlaneMode: "standard", empireLayout: "few-big-blobs", gridAlignment: "none" }],
              ] as Array<[string, Partial<SimSettings>]>).map(([name, patch]) => (
                <button key={name} style={{ fontSize: 10 }} onClick={() => onSettingsChange(patch)} title="Applies these galaxy settings; press Reset to regenerate">{name}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="hud-group hud-empires">
        <div className="section-title">Empires</div>
        <div className="empire-nav-tools">
          <input placeholder="Filter empires..." value={empireQuery} onChange={e => setEmpireQuery(e.target.value)} />
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
            <button key={e.id} className={e.id === selectedEmpireId ? "sidebar-empire selected" : "sidebar-empire"} onClick={() => onSelectEmpire(e.id)} title={`${e.name} — ${MOOD_LABEL[e.mood]}, ruled by ${rulerDisplayName(e)} — ${e.ownedSystemIds.length} systems, ${Math.round(e.population)} population`}>
              <span className="emp-dot" style={{ background: e.color }} />
              <span className="emp-name">{e.name}</span>
              <span className="emp-mood-dot" style={{ background: MOOD_COLOR[e.mood] }} title={MOOD_LABEL[e.mood]} />
              <span className="emp-size">{e.ownedSystemIds.length}</span>
            </button>
          ))}
          {filteredEmpires.length === 0 && <div className="empty-hint">No empires match.</div>}
        </div>
      </div>
    </div>
  );
}
