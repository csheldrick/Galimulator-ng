import { useEffect, useState, useCallback } from "react";
import type { GalaxyState, Id, SimSettings } from "../types/sim";
import { Simulation } from "../sim/Simulation";
import { GalaxyCanvas } from "../render/GalaxyCanvas";
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

export default function App() {
  const [sim] = useState(() => new Simulation(DEFAULT_SETTINGS));
  const [snapshot, setSnapshot] = useState<Readonly<GalaxyState>>(
    () => sim.getSnapshot()
  );
  const [running, setRunning] = useState(false);
  const [settings, setSettings] = useState<SimSettings>(DEFAULT_SETTINGS);
  const [selectedSystemId, setSelectedSystemId] = useState<Id | null>(null);
  const [selectedEmpireId, setSelectedEmpireId] = useState<Id | null>(null);
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
  }, []);

  const withRefresh = useCallback((fn: () => void) => {
    fn();
    refreshSnapshot();
  }, [refreshSnapshot]);

  const handleSelectEmpire = useCallback((id: Id | null) => {
    setSelectedSystemId(null);
    setSelectedEmpireId(id);
  }, []);

  const handleFoundEmpire = useCallback((systemId: Id) => {
    const id = sim.foundEmpireAtSystem(systemId);
    if (id) {
      setSelectedSystemId(null);
      setSelectedEmpireId(id);
    }
    refreshSnapshot();
  }, [sim, refreshSnapshot]);

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
        settings={settings}
        onSettingsChange={handleSettingsChange}
      />
      <div className="canvas-area">
        <GalaxyCanvas
          simulation={sim}
          selectedSystemId={selectedSystemId}
          selectedEmpireId={selectedEmpireId}
          onSelectSystem={setSelectedSystemId}
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
        />
      </div>
    </div>
  );
}
