import type { SimSettings } from "../types/sim";

interface Props {
  running: boolean;
  onStart: () => void;
  onPause: () => void;
  onStep: () => void;
  onReset: () => void;
  onNewSeed: () => void;
  settings: SimSettings;
  onSettingsChange: (s: Partial<SimSettings>) => void;
}

export function ControlPanel({
  running, onStart, onPause, onStep, onReset, onNewSeed, settings, onSettingsChange,
}: Props) {
  return (
    <div className="control-panel">
      <h2>galimulator-ng</h2>
      <div className="btn-row">
        {running
          ? <button onClick={onPause}>⏸ Pause</button>
          : <button onClick={onStart}>▶ Start</button>
        }
        <button onClick={onStep} disabled={running}>⏭ Step</button>
        <button onClick={onReset}>↺ Reset</button>
        <button onClick={onNewSeed}>🎲 New Seed</button>
      </div>
      <div className="control-row">
        <label>Speed</label>
        <input
          type="range" min={1} max={10} step={1}
          value={settings.ticksPerSecond}
          onChange={e => onSettingsChange({ ticksPerSecond: Number(e.target.value) })}
        />
        <span>{settings.ticksPerSecond}x</span>
      </div>
      <div className="control-row">
        <label>Stars</label>
        <input
          type="range" min={100} max={800} step={50}
          value={settings.numStars}
          onChange={e => onSettingsChange({ numStars: Number(e.target.value) })}
        />
        <span>{settings.numStars}</span>
      </div>
      <div className="control-row">
        <label>Empires</label>
        <input
          type="range" min={4} max={20} step={1}
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
          onChange={e => onSettingsChange({ seed: Number(e.target.value) })}
        />
      </div>
    </div>
  );
}
