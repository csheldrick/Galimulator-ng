import { useEffect, useState, useCallback } from "react";
import type { ArtifactKind, GalaxyState, Id, SimSettings, SimEvent, EmpirePriority, SpyMission, ShipClass, WarFocus  } from "../types/sim";
import { EmpireControlPanel } from "../ui/EmpireControlPanel";
import { Simulation } from "../sim/Simulation";
import { GalaxyCanvas } from "../render/GalaxyCanvas";
import type { ViewOptions } from "../render/GalaxyCanvas";
import { ControlPanel } from "../ui/ControlPanel";
import { InspectorPanel } from "../ui/InspectorPanel";
import { GalaxyPulse } from "../ui/GalaxyPulse";
import { EventLog } from "../ui/EventLog";
import { TopStories } from "../ui/TopStories";
import { MOOD_LABEL, IDEOLOGY_LABEL, rulerDisplayName } from "../sim/Moods";
import { runHeadlessReport, runPresetSweep } from "../sim/Headless";
import "./App.css";

const DEFAULT_SETTINGS: SimSettings = { seed: 42, numStars: 400, numEmpires: 12, ticksPerSecond: 4 };
const DEFAULT_VIEW: ViewOptions = { territory: true, lanes: true, labels: true, wars: true, events: true, fleets: true, trade: true, monsters: true, mapMode: "empire" };

type BottomTab = "control" | "empire";
type RightSection = "inspector" | "stories" | "pulse" | "events";

const LS_VIEW_KEY = "galimng_viewOptions";
const LS_SETTINGS_KEY = "galimng_settings";

function loadViewOptions(): ViewOptions {
  try {
    const raw = localStorage.getItem(LS_VIEW_KEY);
    if (raw) return { ...DEFAULT_VIEW, ...JSON.parse(raw) };
  } catch { /* unavailable or corrupt; use defaults */ }
  return DEFAULT_VIEW;
}

function loadSettings(): SimSettings {
  try {
    const raw = localStorage.getItem(LS_SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* unavailable or corrupt; use defaults */ }
  return DEFAULT_SETTINGS;
}

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
  const religions = Object.values(snapshot.religions).map(r => {
    const followers = systems.filter(s => s.religionId === r.id).length;
    return { r, followers };
  }).sort((a, b) => b.followers - a.followers);
  return [
    `# galimulator-ng history report`, ``,
    `Seed: ${snapshot.seed}`, `Tick: ${snapshot.tick}`, `Systems: ${systems.length}`,
    `Owned systems: ${systems.filter(s => s.ownerEmpireId).length}`,
    `Empires: ${empires.length}`, `Active wars: ${wars.size}`,
    `Fleets in transit: ${Object.keys(snapshot.fleets).length}`,
    `Trade routes: ${Object.keys(snapshot.tradeRoutes).length}`,
    `Monsters at large: ${Object.keys(snapshot.monsters).length}`,
    `Oddities active: ${Object.keys(snapshot.oddities ?? {}).length}`,
    `Artifacts: ${Object.keys(snapshot.artifacts ?? {}).length}`, ``,
    `## Leading empires`,
    ...empires.slice(0, 12).map((e, i) => `${i + 1}. ${e.name} — ${e.ownedSystemIds.length} systems, ${MOOD_LABEL[e.mood].toLowerCase()}, ${IDEOLOGY_LABEL[e.ideology].toLowerCase()}, ruled by ${rulerDisplayName(e)} of the ${e.ruler.dynasty} dynasty, pop ${Math.round(e.population)}, tech ${e.techLevel.toFixed(2)}, cohesion ${e.cohesion.toFixed(2)}`),
    ``, `## Faiths`,
    ...religions.map(({ r, followers }) => `- ${r.name} — ${followers} worlds (holy world: ${snapshot.systems[r.holySystemId]?.name ?? "lost"})`),
    ``, `## Recent history`, ...events.map(ev => `- [${ev.tick}] ${ev.title}: ${ev.description}`), ``,
  ].join("\n");
}

function Section({ id, title, collapsed, onToggle, children }: { id: RightSection; title: string; collapsed: boolean; onToggle: (id: RightSection) => void; children: React.ReactNode }) {
  return (
    <section className={collapsed ? "right-section collapsed" : "right-section"}>
      <button className="right-section-header" onClick={() => onToggle(id)}>
        <span>{collapsed ? "▸" : "▾"}</span>
        <b>{title}</b>
      </button>
      {!collapsed && <div className="right-section-body">{children}</div>}
    </section>
  );
}

export default function App() {
  const [sim] = useState(() => new Simulation(loadSettings()));
  const [snapshot, setSnapshot] = useState<Readonly<GalaxyState>>(() => sim.getSnapshot());
  const [running, setRunning] = useState(false);
  const [settings, setSettings] = useState<SimSettings>(loadSettings);
  const [viewOptions, setViewOptions] = useState<ViewOptions>(loadViewOptions);
  const [resetCameraToken, setResetCameraToken] = useState(0);
  const [selectedSystemId, setSelectedSystemId] = useState<Id | null>(null);
  const [selectedEmpireId, setSelectedEmpireId] = useState<Id | null>(null);
  const [selectedFleetId, setSelectedFleetId] = useState<Id | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<Id | null>(null);
  const [followEmpireId, setFollowEmpireId] = useState<Id | null>(null);
  const [minImportance, setMinImportance] = useState(1);
  const [bottomTab, setBottomTab] = useState<BottomTab>("control");
  const [collapsedRight, setCollapsedRight] = useState<Record<RightSection, boolean>>({ inspector: false, stories: true, pulse: true, events: false });

  const refreshSnapshot = useCallback(() => { setSnapshot(sim.getSnapshot()); }, [sim]);
  useEffect(() => { const id = window.setInterval(refreshSnapshot, 250); return () => window.clearInterval(id); }, [refreshSnapshot]);
  useEffect(() => { try { localStorage.setItem(LS_VIEW_KEY, JSON.stringify(viewOptions)); } catch { /* ignore */ } }, [viewOptions]);
  useEffect(() => { try { localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ } }, [settings]);

  const toggleRight = useCallback((id: RightSection) => setCollapsedRight(prev => ({ ...prev, [id]: !prev[id] })), []);

  const handleStart = useCallback(() => { sim.start(); setRunning(true); }, [sim]);
  const handlePause = useCallback(() => { sim.pause(); setRunning(false); refreshSnapshot(); }, [sim, refreshSnapshot]);
  const handleStep = useCallback(() => { sim.step(); refreshSnapshot(); }, [sim, refreshSnapshot]);
  const handleRunTicks = useCallback((count: number) => { sim.runTicks(count); refreshSnapshot(); }, [sim, refreshSnapshot]);
  const handleReset = useCallback(() => {
    sim.reset(settings);
    setRunning(false); setSelectedSystemId(null); setSelectedEmpireId(null); setSelectedFleetId(null); setSelectedEventId(null); setFollowEmpireId(null);
    setResetCameraToken(t => t + 1); refreshSnapshot();
  }, [sim, settings, refreshSnapshot]);
  const handleNewSeed = useCallback(() => {
    const newSeed = Math.floor(Math.random() * 0xffffff);
    const newSettings = { ...settings, seed: newSeed };
    setSettings(newSettings); sim.reset(newSettings);
    setRunning(false); setSelectedSystemId(null); setSelectedEmpireId(null); setSelectedFleetId(null); setSelectedEventId(null); setFollowEmpireId(null);
    setResetCameraToken(t => t + 1); refreshSnapshot();
  }, [sim, settings, refreshSnapshot]);

  const handleFollowEmpire = useCallback((id: Id | null) => {
    setFollowEmpireId(id);
    if (id) { setSelectedEmpireId(id); setSelectedSystemId(null); setSelectedFleetId(null); }
  }, []);
  const handleToggleFollow = useCallback((id: Id) => { setFollowEmpireId(prev => (prev === id ? null : id)); }, []);
  const handleSettingsChange = useCallback((partial: Partial<SimSettings>) => {
    setSettings(prev => { const next = { ...prev, ...partial }; if (partial.ticksPerSecond !== undefined) sim.setSpeed(partial.ticksPerSecond); return next; });
  }, [sim]);
  const handleClearSelection = useCallback(() => { setSelectedSystemId(null); setSelectedEmpireId(null); setSelectedFleetId(null); setSelectedEventId(null); }, []);
  const withRefresh = useCallback((fn: () => void) => { fn(); refreshSnapshot(); }, [refreshSnapshot]);
  const handleSelectEmpire = useCallback((id: Id | null) => { setSelectedSystemId(null); setSelectedFleetId(null); setSelectedEmpireId(id); setSelectedEventId(null); }, []);
  const handleSelectSystem = useCallback((id: Id | null) => { setSelectedSystemId(id); setSelectedFleetId(null); setSelectedEventId(null); }, []);
  const handleSelectFleet = useCallback((id: Id | null) => { setSelectedFleetId(id); setSelectedSystemId(null); setSelectedEventId(null); }, []);
  const handleFoundEmpire = useCallback((systemId: Id) => {
    const id = sim.foundEmpireAtSystem(systemId);
    if (id) { setSelectedSystemId(null); setSelectedFleetId(null); setSelectedEmpireId(id); }
    refreshSnapshot();
  }, [sim, refreshSnapshot]);
  const handleSelectEvent = useCallback((event: SimEvent) => {
    setSelectedEventId(event.id); setSelectedFleetId(null);
    const systemId = event.relatedSystemIds.find(id => snapshot.systems[id]);
    const empireId = event.relatedEmpireIds.find(id => snapshot.empires[id]);
    setSelectedSystemId(systemId ?? null);
    setSelectedEmpireId(systemId ? (snapshot.systems[systemId]?.ownerEmpireId ?? empireId ?? null) : (empireId ?? null));
  }, [snapshot]);
  const handleCancelFleet = useCallback((fleetId: Id) => { withRefresh(() => sim.cancelFleet(fleetId)); setSelectedFleetId(null); }, [sim, withRefresh]);

  const handleStartControl = useCallback((empireId: Id) => { sim.startEmpireControl(empireId); setSelectedEmpireId(empireId); setFollowEmpireId(empireId); setBottomTab("empire"); refreshSnapshot(); }, [sim, refreshSnapshot]);
  const handleStopControl = useCallback(() => { sim.stopEmpireControl(); setFollowEmpireId(null); refreshSnapshot(); }, [sim, refreshSnapshot]);
  const handleSetPriority = useCallback((p: EmpirePriority) => { withRefresh(() => sim.setEmpirePriority(p)); }, [sim, withRefresh]);
  const handleRallyFleet = useCallback((sid: Id) => { withRefresh(() => sim.commandRallyFleet(sid)); }, [sim, withRefresh]);
  const handleMoveFlagship = useCallback((sid: Id) => { withRefresh(() => sim.commandMoveFlagship(sid)); }, [sim, withRefresh]);
  const handleFortify = useCallback((sid: Id) => { withRefresh(() => sim.commandFortifySystem(sid)); }, [sim, withRefresh]);
  const handleStabilize = useCallback((sid: Id) => { withRefresh(() => sim.commandStabilizeSystem(sid)); }, [sim, withRefresh]);
  const handleBuildArtifact = useCallback((sid: Id, kind?: ArtifactKind) => { withRefresh(() => sim.commandBuildArtifact(sid, kind)); }, [sim, withRefresh]);
  const handleBuildShip = useCallback((sid: Id, shipClass: ShipClass) => { withRefresh(() => sim.commandBuildShip(sid, shipClass)); }, [sim, withRefresh]);
  const handleProposePeace = useCallback((eid: Id) => { withRefresh(() => sim.commandProposePeace(eid)); }, [sim, withRefresh]);
  const handleProvokeWar = useCallback((eid: Id) => { withRefresh(() => sim.commandProvokeWar(eid)); }, [sim, withRefresh]);
  const handleSpyMission = useCallback((eid: Id, mission: SpyMission) => { withRefresh(() => sim.commandSpyMission(eid, mission)); }, [sim, withRefresh]);
  const handleEngageFaction = useCallback((fid: Id) => { withRefresh(() => sim.commandEngageFaction(fid)); }, [sim, withRefresh]);
  const handleSponsorColonization = useCallback((sid: Id) => { withRefresh(() => sim.commandSponsorColonization(sid)); }, [sim, withRefresh]);
  const handleAdoptReligion = useCallback((rid: Id) => { withRefresh(() => sim.commandAdoptReligion(rid)); }, [sim, withRefresh]);
  const handleReformGovernment = useCallback(() => { withRefresh(() => sim.commandReformGovernment()); }, [sim, withRefresh]);
  const handleSetWarDirective = useCallback((eid: Id, focus: WarFocus) => { withRefresh(() => sim.commandSetWarDirective(eid, focus)); }, [sim, withRefresh]);

  const handleExportJson = useCallback(() => { const snap = sim.getSnapshot(); downloadText(`galimulator-ng-${snap.seed}-tick-${snap.tick}.json`, sim.exportSave(), "application/json"); }, [sim]);
  const handleExportReport = useCallback(() => { const snap = sim.getSnapshot(); downloadText(`galimulator-ng-${snap.seed}-tick-${snap.tick}.md`, buildReport(snap), "text/markdown"); }, [sim]);
  const handleHeadlessReport = useCallback(() => { const text = runHeadlessReport(settings); downloadText(`galimulator-ng-${settings.seed}-headless.md`, text, "text/markdown"); }, [settings]);
  const handlePresetSweep = useCallback(() => { const text = runPresetSweep(settings); downloadText(`galimulator-ng-${settings.seed}-preset-sweep.md`, text, "text/markdown"); }, [settings]);
  const handleImportSave = useCallback((text: string) => {
    const error = sim.importSave(text);
    if (error) { window.alert(error); return; }
    setRunning(false); setSelectedSystemId(null); setSelectedEmpireId(null); setSelectedFleetId(null); setSelectedEventId(null); setFollowEmpireId(null);
    setSettings(sim.getSettings()); setResetCameraToken(t => t + 1); refreshSnapshot();
  }, [sim, refreshSnapshot]);

  const empireControl = (
    <EmpireControlPanel
      snapshot={snapshot}
      playerControl={snapshot.playerControl}
      selectedSystemId={selectedSystemId}
      selectedEmpireId={selectedEmpireId}
      onStartControl={handleStartControl}
      onStopControl={handleStopControl}
      onSetPriority={handleSetPriority}
      onRallyFleet={handleRallyFleet}
      onMoveFlagship={handleMoveFlagship}
      onFortify={handleFortify}
      onStabilize={handleStabilize}
      onBuildArtifact={handleBuildArtifact}
      onBuildShip={handleBuildShip}
      onProposePeace={handleProposePeace}
      onProvokeWar={handleProvokeWar}
      onSpyMission={handleSpyMission}
      onEngageFaction={handleEngageFaction}
      onSponsorColonization={handleSponsorColonization}
      onAdoptReligion={handleAdoptReligion}
      onReformGovernment={handleReformGovernment}
      onSetWarDirective={handleSetWarDirective}
    />
  );

  return (
    <div className="app-layout">
      <div className="play-area">
        <div className="main-stage">
          <div className="canvas-area">
            <GalaxyCanvas simulation={sim} selectedSystemId={selectedSystemId} selectedEmpireId={selectedEmpireId} selectedFleetId={selectedFleetId} followEmpireId={followEmpireId} viewOptions={viewOptions} resetCameraToken={resetCameraToken} onSelectSystem={handleSelectSystem} onSelectEmpire={setSelectedEmpireId} onSelectFleet={handleSelectFleet} onManualPan={() => setFollowEmpireId(null)} />
          </div>
        </div>
        <div className="bottom-hud tabbed">
          <div className="bottom-tabs">
            <button className={bottomTab === "control" ? "active" : ""} onClick={() => setBottomTab("control")}>Controls</button>
            <button className={bottomTab === "empire" ? "active" : ""} onClick={() => setBottomTab("empire")}>Empire Control</button>
          </div>
          <div className="bottom-tab-body">
            {bottomTab === "control" ? (
              <ControlPanel snapshot={snapshot} selectedEmpireId={selectedEmpireId} followEmpireId={followEmpireId} running={running} onStart={handleStart} onPause={handlePause} onStep={handleStep} onRunTicks={handleRunTicks} onReset={handleReset} onNewSeed={handleNewSeed} onResetCamera={() => setResetCameraToken(t => t + 1)} onExportJson={handleExportJson} onExportReport={handleExportReport} onHeadlessReport={handleHeadlessReport} onPresetSweep={handlePresetSweep} onImportSave={handleImportSave} onSelectEmpire={handleSelectEmpire} onToggleFollow={handleToggleFollow} settings={settings} onSettingsChange={handleSettingsChange} viewOptions={viewOptions} onViewOptionsChange={setViewOptions} />
            ) : empireControl}
          </div>
        </div>
      </div>
      <div className="right-panel">
        <Section id="inspector" title="Inspector" collapsed={collapsedRight.inspector} onToggle={toggleRight}>
          <InspectorPanel snapshot={snapshot} selectedSystemId={selectedSystemId} selectedEmpireId={selectedEmpireId} selectedFleetId={selectedFleetId} followEmpireId={followEmpireId} onSelectEmpire={handleSelectEmpire} onSelectSystem={handleSelectSystem} onSelectFleet={handleSelectFleet} onClearSelection={handleClearSelection} onCancelFleet={handleCancelFleet} onToggleFollow={handleToggleFollow} onBoostSystem={id => withRefresh(() => sim.boostSystem(id))} onDevastateSystem={id => withRefresh(() => sim.devastateSystem(id))} onNeutralizeSystem={id => withRefresh(() => sim.neutralizeSystem(id))} onFoundEmpire={handleFoundEmpire} onBoostEmpire={id => withRefresh(() => sim.boostEmpire(id))} onWeakenEmpire={id => withRefresh(() => sim.weakenEmpire(id))} onInflameEmpire={id => withRefresh(() => sim.inflameEmpire(id))} onPacifyEmpire={id => withRefresh(() => sim.pacifyEmpire(id))} onForceWar={(a, b) => withRefresh(() => sim.forceWar(a, b))} onForcePeace={(a, b) => withRefresh(() => sim.forcePeace(a, b))} onForceMerge={(a, b) => withRefresh(() => sim.forceMerge(a, b))} />
        </Section>
        <Section id="stories" title="Top Stories" collapsed={collapsedRight.stories} onToggle={toggleRight}>
          <TopStories snapshot={snapshot} selectedEventId={selectedEventId} onSelectEvent={handleSelectEvent} onFollowEmpire={handleFollowEmpire} />
        </Section>
        <Section id="pulse" title="Galaxy Pulse" collapsed={collapsedRight.pulse} onToggle={toggleRight}>
          <GalaxyPulse snapshot={snapshot} />
        </Section>
        <Section id="events" title="Event Log" collapsed={collapsedRight.events} onToggle={toggleRight}>
          <EventLog snapshot={snapshot} minImportance={minImportance} onMinImportanceChange={setMinImportance} selectedEventId={selectedEventId} onSelectEvent={handleSelectEvent} />
        </Section>
      </div>
    </div>
  );
}
