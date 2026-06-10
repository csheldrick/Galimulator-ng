import { useEffect, useRef, useState, useCallback } from "react";
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
  const simRef = useRef<Simulation>(new Simulation(DEFAULT_SETTINGS));
  const [snapshot, setSnapshot] = useState<Readonly<GalaxyState>>(
    () => simRef.current.getSnapshot()
  );
  const [running, setRunning] = useState(false);
  const [settings, setSettings] = useState<SimSettings>(DEFAULT_SETTINGS);
  const [selectedSystemId, setSelectedSystemId] = useState<Id | null>(null);
  const [selectedEmpireId, setSelectedEmpireId] = useState<Id | null>(null);
  const [minImportance, setMinImportance] = useState(1);

  useEffect(() => {
    const unsub = simRef.current.subscribe((snap) => setSnapshot(snap));
    return unsub;
  }, []);

  const handleStart = useCallback(() => {
    simRef.current.start();
    setRunning(true);
  }, []);

  const handlePause = useCallback(() => {
    simRef.current.pause();
    setRunning(false);
  }, []);

  const handleStep = useCallback(() => {
    simRef.current.step();
  }, []);

  const handleReset = useCallback(() => {
    simRef.current.reset(settings);
    setRunning(false);
    setSelectedSystemId(null);
    setSelectedEmpireId(null);
  }, [settings]);

  const handleNewSeed = useCallback(() => {
    const newSeed = Math.floor(Math.random() * 0xffffff);
    const newSettings = { ...settings, seed: newSeed };
    setSettings(newSettings);
    simRef.current.reset(newSettings);
    setRunning(false);
    setSelectedSystemId(null);
    setSelectedEmpireId(null);
  }, [settings]);

  const handleSettingsChange = useCallback((partial: Partial<SimSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      if (partial.ticksPerSecond !== undefined) {
        simRef.current.setSpeed(partial.ticksPerSecond);
      }
      return next;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedSystemId(null);
    setSelectedEmpireId(null);
  }, []);

  return (
    <div className="app-layout">
      <ControlPanel
        simulation={simRef.current}
        running={running}
        onStart={handleStart}
        onPause={handlePause}
        onStep={handleStep}
        onReset={handleReset}
        onNewSeed={handleNewSeed}
        settings={settings}
        onSettingsChange={handleSettingsChange}
      />
      <div className="canvas-area">
        <GalaxyCanvas
          simulation={simRef.current}
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
          onSelectEmpire={setSelectedEmpireId}
          onClearSelection={handleClearSelection}
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
