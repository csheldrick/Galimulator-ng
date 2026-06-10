import { useEffect, useState, useCallback } from "react";
import type { GalaxyState, Id, SimSettings, SimEvent } from "../types/sim";
import { Simulation } from "../sim/Simulation";
import { GalaxyCanvas } from "../render/GalaxyCanvas";
import type { ViewOptions } from "../render/GalaxyCanvas";
import { ControlPanel } from "../ui/ControlPanel";
import { InspectorPanel } from "../ui/InspectorPanel";
import { EventLog } from "../ui/EventLog";
import "./App.css";

const DEFAULT_SETTINGS: SimSettings = {
  seed: 42,
  numStars: 400,
  numEmpires: 12,
  ticksPerSecond: 4,
};

const DEFAULT_VIEW: ViewOptions = {
  territory: true,
  labels: false,
  wars: true,
  events: true,
};

function downloadText(filename: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildReport(snapshot: Readonly<GalaxyState>): string {
  const empires = Object.values(snapshot.empires).sort((a, b) => b.ownedSystemIds.length - a.ownedSystemIds.length);
  const systems = Object.values(snapshot.systems);
  const wars = new Set<string>();
  for (const e of empires) for (const w of e.activeWarEmpireIds) wars.add([e.id, w].sort().join("~"));
  const events = [...snapshot.eventLog].slice(-80).map(id => snapshot.events[id]).filter(Boolean);

  return [
    `# galimulator-ng history report`,
    ``,
    `Seed: ${snapshot.seed}`,
    `Tick: ${snapshot.tick}`,
    `Systems: ${systems.length}`,
    `Owned systems: ${systems.filter(s => s.ownerEmpireId).length}`,
    `Empires: ${empires.length}`,
    `Active wars: ${wars.size}`,
    ``,
    `## Leading empires`,
    ...empires.slice(0, 12).map((e, i) => `${i + 1}. ${e.name} — ${e.ownedSystemIds.length} systems, pop ${Math.round(e.population)}, tech ${e.techLevel.toFixed(2)}, cohesion ${e.cohesion.toFixed(2)}`),
    ``,
    `## Recent history`,
    ...events.map(ev => `- [${ev.tick}] ${ev.title}: ${ev.description}`),
    ``,
  ].join("\n");
}

export default function App() {
  const [sim] = useState(() => new Simulation(DEFAULT_SETTINGS));
  const [snapshot, setSnapshot] = useState<Readonly<GalaxyState>>(
    () => sim.getSnapshot()
  );
  const [running, setRunning] = useState(false);
  const [settings, setSettings] = useState<SimSettings>(DEFAULT_SETTINGS);
  const [viewOptions, setViewOptions] = useState<ViewOptions>(DEFAULT_VIEW);
  const [resetCameraToken, setResetCameraToken] = useState(0);
  const [selectedSystemId, setSelectedSystemId] = useState<Id | null>(null);
  const [selectedEmpireId, setSelectedEmpireId] = useState<Id | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<Id | null>(null);
  const [minImportance, setMinImportance] = useState(1);

  const refreshSnapshot = useCallback(() => {
    setSnapshot(sim.getSnapshot());
  }, [sim]);

  useEffect(() => {
    const id = window.setInterval(refreshSnapshot, 250);
    return () => window.clearInterval(id);
  }, [refreshSnapshot]);

  const handleStart = useCallback(() => {
    sim.start();
    setRunning(true);
  }, [sim]);

  const handlePause = useCallback(() => {
    sim.pause();
    setRunning(false);
    refreshSnapshot();
  }, [sim, refreshSnapshot]);

  const handleStep = useCallback(() => {
    sim.step();
    refreshSnapshot();
  }, [sim, refreshSnapshot]);

  const handleRunTicks = useCallback((count: number) => {
    sim.runTicks(count);
    refreshSnapshot();
  }, [sim, refreshSnapshot]);

  const handleReset = useCallback(() => {
    sim.reset(settings);
    setRunning(false);
    setSelectedSystemId(null);
    setSelectedEmpireId(null);
    setSelectedEventId(null);
    setResetCameraToken(t => t + 1);
    refreshSnapshot();
  }, [sim, settings, refreshSnapshot]);

  const handleNewSeed = useCallback(() => {
    const newSeed = Math.floor(Math.random() * 0xffffff);
    const newSettings = { ...settings, seed: newSeed };
    setSettings(newSettings);
    sim.reset(newSettings);
    setRunning(false);
    setSelectedSystemId(null);
    setSelectedEmpireId(null);
    setSelectedEventId(null);
    setResetCameraToken(t => t + 1);
    refreshSnapshot();
  }, [sim, settings, refreshSnapshot]);

  const handleSettingsChange = useCallback((partial: Partial<SimSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      if (partial.ticksPerSecond !== undefined) {
        sim.setSpeed(partial.ticksPerSecond);
      }
      return next;
    });
  }, [sim]);

  const handleClearSelection = useCallback(() => {
    setSelectedSystemId(null);
    setSelectedEmpireId(null);
    setSelectedEventId(null);
  }, []);

  const withRefresh = useCallback((fn: () => void) => {
    fn();
    refreshSnapshot();
  }, [refreshSnapshot]);

  const handleSelectEmpire = useCallback((id: Id | null) => {
    setSelectedSystemId(null);
    setSelectedEmpireId(id);
    setSelectedEventId(null);
  }, []);

  const handleSelectSystem = useCallback((id: Id | null) => {
    setSelectedSystemId(id);
    setSelectedEventId(null);
  }, []);

  const handleFoundEmpire = useCallback((systemId: Id) => {
    const id = sim.foundEmpireAtSystem(systemId);
    if (id) {
      setSelectedSystemId(null);
      setSelectedEmpireId(id);
    }
    refreshSnapshot();
  }, [sim, refreshSnapshot]);

  const handleSelectEvent = useCallback((event: SimEvent) => {
    setSelectedEventId(event.id);
    const systemId = event.relatedSystemIds.find(id => snapshot.systems[id]);
    const empireId = event.relatedEmpireIds.find(id => snapshot.empires[id]);
    setSelectedSystemId(systemId ?? null);
    setSelectedEmpireId(systemId ? (snapshot.systems[systemId]?.ownerEmpireId ?? empireId ?? null) : (empireId ?? null));
  }, [snapshot]);

  const handleExportJson = useCallback(() => {
    const snap = sim.getSnapshot();
    downloadText(`galimulator-ng-${snap.seed}-tick-${snap.tick}.json`, JSON.stringify(snap, null, 2), "application/json");
  }, [sim]);

  const handleExportReport = useCallback(() => {
    const snap = sim.getSnapshot();
    downloadText(`galimulator-ng-${snap.seed}-tick-${snap.tick}.md`, buildReport(snap), "text/markdown");
  }, [sim]);

  return (
    <div className="app-layout">
      <ControlPanel
        snapshot={snapshot}
        running={running}
        onStart={handleStart}
        onPause={handlePause}
        onStep={handleStep}
        onRunTicks={handleRunTicks}
        onReset={handleReset}
        onNewSeed={handleNewSeed}
        onResetCamera={() => setResetCameraToken(t => t + 1)}
        onExportJson={handleExportJson}
        onExportReport={handleExportReport}
        settings={settings}
        onSettingsChange={handleSettingsChange}
        viewOptions={viewOptions}
        onViewOptionsChange={setViewOptions}
      />
      <div className="canvas-area">
        <GalaxyCanvas
          simulation={sim}
          selectedSystemId={selectedSystemId}
          selectedEmpireId={selectedEmpireId}
          viewOptions={viewOptions}
          resetCameraToken={resetCameraToken}
          onSelectSystem={handleSelectSystem}
          onSelectEmpire={setSelectedEmpireId}
        />
      </div>
      <div className="right-panel">
        <InspectorPanel
          snapshot={snapshot}
          selectedSystemId={selectedSystemId}
          selectedEmpireId={selectedEmpireId}
          onSelectEmpire={handleSelectEmpire}
          onClearSelection={handleClearSelection}
          onBoostSystem={id => withRefresh(() => sim.boostSystem(id))}
          onDevastateSystem={id => withRefresh(() => sim.devastateSystem(id))}
          onNeutralizeSystem={id => withRefresh(() => sim.neutralizeSystem(id))}
          onFoundEmpire={handleFoundEmpire}
          onBoostEmpire={id => withRefresh(() => sim.boostEmpire(id))}
          onWeakenEmpire={id => withRefresh(() => sim.weakenEmpire(id))}
          onInflameEmpire={id => withRefresh(() => sim.inflameEmpire(id))}
          onPacifyEmpire={id => withRefresh(() => sim.pacifyEmpire(id))}
          onForceWar={(a, b) => withRefresh(() => sim.forceWar(a, b))}
          onForcePeace={(a, b) => withRefresh(() => sim.forcePeace(a, b))}
        />
        <EventLog
          snapshot={snapshot}
          minImportance={minImportance}
          onMinImportanceChange={setMinImportance}
          selectedEventId={selectedEventId}
          onSelectEvent={handleSelectEvent}
        />
      </div>
    </div>
  );
}
