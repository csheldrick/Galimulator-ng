import type { ArtifactKind, GalaxyState, Id, EmpirePriority, PlayerControlState, SpyMission, ShipClass, WarFocus  } from "../types/sim";
import { MOOD_LABEL, MOOD_COLOR, IDEOLOGY_LABEL, rulerDisplayName } from "../sim/Moods";
import { ROLE_LABEL, TRAIT_LABEL } from "../sim/Characters";

interface Props {
  snapshot: Readonly<GalaxyState>;
  playerControl: PlayerControlState;
  selectedSystemId: Id | null;
  selectedEmpireId: Id | null;
  onStartControl: (empireId: Id) => void;
  onStopControl: () => void;
  onSetPriority: (p: EmpirePriority) => void;
  onRallyFleet: (systemId: Id) => void;
  onMoveFlagship: (systemId: Id) => void;
  onFortify: (systemId: Id) => void;
  onStabilize: (systemId: Id) => void;
  onBuildArtifact: (systemId: Id, kind?: ArtifactKind) => void;
  onBuildShip: (systemId: Id, shipClass: ShipClass) => void;
  onProposePeace: (empireId: Id) => void;
  onProvokeWar: (empireId: Id) => void;
  onSpyMission: (empireId: Id, mission: SpyMission) => void;
  onEngageFaction: (factionId: Id) => void;
  onSponsorColonization: (systemId: Id) => void;
  onAdoptReligion: (religionId: Id) => void;
  onReformGovernment: () => void;
  onSetWarDirective: (empireId: Id, focus: WarFocus) => void;
}

const PRIORITY_LABELS: Record<EmpirePriority, string> = {
  balanced: "Balanced", expand: "Expand", fortify: "Fortify", conquer: "Conquer",
  trade: "Trade", research: "Research", convert: "Convert", stabilize: "Stabilize", survive: "Survive",
};

const PRIORITY_DESC: Record<EmpirePriority, string> = {
  balanced: "Default autonomous behavior",
  expand: "Boost colonization rate",
  fortify: "Improve cohesion and capital stability",
  conquer: "Raise aggression and war fleet rate",
  trade: "Favor wealth and merchant traffic",
  research: "Push tech at wealth cost",
  convert: "Increase religious pressure",
  stabilize: "Reduce rebellion risk and unrest",
  survive: "Prioritize peace and defense",
};

const ARTIFACT_KINDS: ArtifactKind[] = ["research-lab", "fleet-base", "holy-monument", "financial-center", "sentinel-station", "stellar-forcefield", "mind-control-hub", "lost-archive", "strange-engine"];

function CmdBtn({ label, onClick, disabled, cd = 0, cooldownLeft = 0 }: {
  label: string; onClick: () => void; disabled?: boolean; cd?: number; cooldownLeft?: number;
}) {
  const remaining = Math.max(cd, cooldownLeft);
  const isDisabled = disabled || remaining > 0;
  return (
    <button
      className="cmd-btn"
      onClick={onClick}
      disabled={isDisabled}
      title={remaining > 0 ? `Cooldown: ${remaining} ticks` : undefined}
      style={{ opacity: isDisabled ? 0.45 : 1 }}
    >
      {label}{remaining > 0 ? ` (${remaining})` : ""}
    </button>
  );
}

function Bar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.12)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${Math.round((value / max) * 100)}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: 10, color: "rgba(200,220,255,0.7)", minWidth: 28, textAlign: "right" }}>{Math.round(value)}</span>
    </div>
  );
}

function traitText(traits?: readonly string[]) {
  return traits?.length ? traits.map(t => TRAIT_LABEL[t as keyof typeof TRAIT_LABEL] ?? t).join(", ") : "No traits";
}

export function EmpireControlPanel({
  snapshot, playerControl, selectedSystemId, selectedEmpireId,
  onStartControl, onStopControl, onSetPriority,
  onRallyFleet, onMoveFlagship, onFortify, onStabilize, onBuildArtifact, onBuildShip,
  onProposePeace, onProvokeWar, onSpyMission, onEngageFaction, onSponsorColonization, onAdoptReligion, onReformGovernment, onSetWarDirective
}: Props) {
  const { mode, controlledEmpireId, authority, legitimacy, commandCooldowns, corruption = 0, flagshipFleetId } = playerControl;
  const controlled = controlledEmpireId ? snapshot.empires[controlledEmpireId] : null;
  const selectedSys = selectedSystemId ? snapshot.systems[selectedSystemId] : null;
  const selectedEmp = selectedEmpireId ? snapshot.empires[selectedEmpireId] : null;
  const flagship = flagshipFleetId ? snapshot.fleets[flagshipFleetId] : null;

  const cooldownLeft = (key: string, cd: number) => {
    const last = commandCooldowns[key] ?? 0;
    return Math.max(0, cd - (snapshot.tick - last));
  };

  if (mode === "observer") {
    return (
      <div className="empire-control-panel">
        <div className="section-title">Empire Control</div>
        <div style={{ fontSize: 11, color: "rgba(200,220,255,0.55)", marginBottom: 6 }}>
          Observer mode — galaxy runs autonomously.
        </div>
        {selectedEmp && (
          <button
            className="control-empire-btn"
            style={{ borderColor: selectedEmp.color, color: selectedEmp.color }}
            onClick={() => onStartControl(selectedEmp.id)}
          >
            ⚑ Take Control of {selectedEmp.name}
          </button>
        )}
        {!selectedEmp && (
          <div style={{ fontSize: 11, color: "rgba(200,220,255,0.4)" }}>Select an empire to take control.</div>
        )}
      </div>
    );
  }

  if (!controlled) return null;

  const atWar = controlled.activeWarEmpireIds;
  const ownsSys = selectedSys?.ownerEmpireId === controlled.id;
  const isEnemy = selectedSys?.ownerEmpireId && selectedSys.ownerEmpireId !== controlled.id;
  const isNeutral = selectedSys && !selectedSys.ownerEmpireId;
  const neutralNeighbor = isNeutral && selectedSys.connectedSystemIds.some(
    nid => snapshot.systems[nid]?.ownerEmpireId === controlled.id
  );
  const selectedIsEnemy = selectedEmpireId && selectedEmpireId !== controlled.id;
  const atWarWith = selectedIsEnemy && controlled.activeWarEmpireIds.includes(selectedEmpireId!);
  const notAtWarWith = selectedIsEnemy && !controlled.activeWarEmpireIds.includes(selectedEmpireId!);
  const religions = Object.values(snapshot.religions);
  const factions = Object.values(snapshot.factions ?? {}).filter(f => f.targetEmpireId === controlled.id);
  const shipCapacity = Math.max(1, Math.floor(controlled.ownedSystemIds.length / 3) + Math.floor(controlled.techLevel));
  const builtShips = Object.values(snapshot.fleets).filter(f => f.ownerEmpireId === controlled.id && (f.kind === "patrol" || f.kind === "war" || f.kind === "flagship")).length;
  const shipSlotsFull = builtShips >= shipCapacity;
  const shipBuildSystemId = ownsSys && selectedSystemId ? selectedSystemId : controlled.capitalSystemId;

  return (
    <div className="empire-control-panel">
      <div className="section-title">
        <span style={{ color: controlled.color }}>⚑</span> Ruling {controlled.name}
      </div>

      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 11, color: "rgba(200,220,255,0.7)", marginBottom: 2 }}>
          {rulerDisplayName(controlled)} · <span style={{ color: MOOD_COLOR[controlled.mood] }}>{MOOD_LABEL[controlled.mood]}</span>
        </div>
        <div style={{ fontSize: 10, color: "rgba(200,220,255,0.5)" }}>
          House {controlled.ruler.dynasty} · {traitText(controlled.ruler.traits)}
        </div>
        <div style={{ fontSize: 10, color: "rgba(200,220,255,0.5)" }}>
          {IDEOLOGY_LABEL[controlled.ideology]} · {controlled.ownedSystemIds.length} systems{atWar.length > 0 ? ` · ${atWar.length} wars` : ""}{flagship ? ` · flagship active` : ""}
        </div>
        <div style={{ fontSize: 10, color: shipSlotsFull ? "#f4a261" : "rgba(200,220,255,0.5)" }}>
          Ships {builtShips}/{shipCapacity}
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(200,220,255,0.6)", marginBottom: 2 }}>
          <span>Authority</span><span>{Math.round(authority)}/100</span>
        </div>
        <Bar value={authority} color="#4cc9f0" />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(200,220,255,0.6)", marginBottom: 2, marginTop: 4 }}>
          <span>Legitimacy</span><span>{Math.round(legitimacy)}/100</span>
        </div>
        <Bar value={legitimacy} color={legitimacy < 30 ? "#ff595e" : legitimacy < 60 ? "#f4a261" : "#8ac926"} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(200,220,255,0.6)", marginBottom: 2, marginTop: 4 }}>
          <span>Corruption</span><span>{Math.round(corruption)}/100</span>
        </div>
        <Bar value={corruption} color={corruption > 65 ? "#ff595e" : corruption > 35 ? "#f4a261" : "#8ac926"} />
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: "rgba(200,220,255,0.55)", marginBottom: 4 }}>Strategic Priority</div>
        <select
          style={{ width: "100%", fontSize: 11 }}
          value={controlled.playerPriority ?? "balanced"}
          onChange={e => onSetPriority(e.target.value as EmpirePriority)}
          title={PRIORITY_DESC[controlled.playerPriority ?? "balanced"]}
        >
          {(Object.keys(PRIORITY_LABELS) as EmpirePriority[]).map(p => (
            <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
          ))}
        </select>
      </div>

      {controlled.court.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: "rgba(200,220,255,0.55)", marginBottom: 3 }}>Court</div>
          {controlled.court.slice(0, 4).map(c => (
            <div key={c.id} title={`House ${c.dynasty} · ${traitText(c.traits)}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 10, color: c.loyalty < 0.3 ? "#ff595e" : "rgba(200,220,255,0.7)", marginBottom: 2 }}>
              <span>{c.title} {c.name} <span style={{ opacity: 0.6 }}>({ROLE_LABEL[c.role]} · {traitText(c.traits)})</span></span>
              <span style={{ color: c.loyalty < 0.3 ? "#ff595e" : "rgba(200,220,255,0.45)" }}>
                {c.loyalty < 0.3 ? "⚠" : ""} {Math.round(c.loyalty * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {factions.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: "rgba(200,220,255,0.55)", marginBottom: 3 }}>Factions</div>
          {factions.slice(0, 4).map(f => (
            <div key={f.id} title={`${f.kind} · ${f.leader.title} ${f.leader.name}`} style={{ display: "grid", gridTemplateColumns: "34px 1fr auto", gap: 6, alignItems: "center", fontSize: 10, color: "rgba(200,220,255,0.72)", marginBottom: 3 }}>
              <span>{Math.round(f.uprisingProgress * 100)}%</span>
              <span>{f.name} <span style={{ opacity: 0.55 }}>· {f.systemIds.length} worlds · {f.engagementScore.toFixed(1)}</span></span>
              <button onClick={() => onEngageFaction(f.id)} disabled={authority < 18 || cooldownLeft("faction", 45) > 0}>Engage</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10, color: "rgba(200,220,255,0.55)", marginBottom: 4 }}>Commands</div>
      <div className="cmd-grid">
        {ownsSys && (
          <>
            <CmdBtn label="Fortify" onClick={() => onFortify(selectedSystemId!)} cooldownLeft={cooldownLeft("fortify", 20)} disabled={authority < 15} />
            <CmdBtn label="Stabilize" onClick={() => onStabilize(selectedSystemId!)} cooldownLeft={cooldownLeft("stabilize", 10)} disabled={authority < 10} />
            <CmdBtn label="Build Artifact" onClick={() => onBuildArtifact(selectedSystemId!, ARTIFACT_KINDS[0])} cooldownLeft={cooldownLeft("artifact", 120)} disabled={authority < 45 || controlled.wealth < 450 || !!selectedSys?.artifactId || (controlled.builtArtifactIds?.length ?? 0) > 0} />
          </>
        )}
        <CmdBtn label="Build Raider" onClick={() => onBuildShip(shipBuildSystemId, "raider")} cooldownLeft={cooldownLeft("ship-raider", 18)} disabled={authority < 18 || controlled.wealth < 80 || shipSlotsFull} />
        <CmdBtn label="Build Strike" onClick={() => onBuildShip(shipBuildSystemId, "strike")} cooldownLeft={cooldownLeft("ship-strike", 18)} disabled={authority < 18 || controlled.wealth < 110 || shipSlotsFull} />
        <CmdBtn label="Build Armada" onClick={() => onBuildShip(shipBuildSystemId, "armada")} cooldownLeft={cooldownLeft("ship-armada", 18)} disabled={authority < 28 || controlled.wealth < 180 || shipSlotsFull} />
        {selectedSys && (
          <CmdBtn label="Move Flagship" onClick={() => onMoveFlagship(selectedSystemId!)} cooldownLeft={cooldownLeft("flagship", 8)} disabled={authority < 8} />
        )}
        {(isEnemy || ownsSys) && (
          <CmdBtn label="Rally Fleet" onClick={() => onRallyFleet(selectedSystemId!)} cd={cooldownLeft("rally", 15)} disabled={authority < 20} />
        )}
        {neutralNeighbor && (
          <CmdBtn label="Sponsor Colony" onClick={() => onSponsorColonization(selectedSystemId!)} cd={cooldownLeft("colonize", 25)} disabled={authority < 18} />
        )}
        {atWarWith && (
          <CmdBtn label="Propose Peace" onClick={() => onProposePeace(selectedEmpireId!)} cd={cooldownLeft("peace", 30)} disabled={authority < 25} />
        )}
        {notAtWarWith && (
          <CmdBtn label="Provoke War" onClick={() => onProvokeWar(selectedEmpireId!)} cd={cooldownLeft("war", 40)} disabled={authority < 30} />
        )}
        {selectedIsEnemy && (
          <>
            <CmdBtn label="Spy: Steal Tech" onClick={() => onSpyMission(selectedEmpireId!, "steal-tech")} cd={cooldownLeft("spy-steal-tech", 70)} disabled={authority < 25} />
            <CmdBtn label="Spy: Incite Riots" onClick={() => onSpyMission(selectedEmpireId!, "incite-riots")} cd={cooldownLeft("spy-incite-riots", 70)} disabled={authority < 25} />
            <CmdBtn label="Spy: Improve Ties" onClick={() => onSpyMission(selectedEmpireId!, "improve-relations")} cd={cooldownLeft("spy-improve-relations", 70)} disabled={authority < 25} />
            <CmdBtn label="Spy: Sabotage Fleet" onClick={() => onSpyMission(selectedEmpireId!, "sabotage-fleet")} cd={cooldownLeft("spy-sabotage-fleet", 70)} disabled={authority < 25} />
          </>
        )}
        {atWarWith && (() => {
          const current = controlled.warDirectives?.[selectedEmpireId!]?.focus;
          return (
            <div style={{ gridColumn: "1/-1" }}>
              <div style={{ fontSize: 10, color: "rgba(200,220,255,0.55)", margin: "4px 0 3px" }}>
                War Room{current ? ` — doctrine: ${current}` : ""}
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {(["attack", "defend", "raid", "exhaust"] as WarFocus[]).map(f => (
                  <button
                    key={f}
                    className="cmd-btn"
                    style={{ flex: 1, fontSize: 10, opacity: authority < 10 ? 0.45 : current === f ? 1 : 0.8, borderColor: current === f ? "#f4a261" : undefined }}
                    disabled={authority < 10 || current === f}
                    onClick={() => onSetWarDirective(selectedEmpireId!, f)}
                  >
                    {f[0].toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
        {atWar.length > 0 && !atWarWith && !selectedIsEnemy && (
          atWar.slice(0, 2).map(eid => {
            const e = snapshot.empires[eid];
            if (!e) return null;
            return <CmdBtn key={eid} label={`Peace: ${e.name.split(" ")[0]}`} onClick={() => onProposePeace(eid)} cooldownLeft={cooldownLeft("peace", 30)} disabled={authority < 25} />;
          })
        )}
        {religions.length > 0 && (
          <CmdBtn label="Adopt Major Faith" onClick={() => onAdoptReligion(religions[0].id)} cooldownLeft={cooldownLeft("religion", 90)} disabled={authority < 35 || controlled.stateReligionId === religions[0].id} />
        )}
        <CmdBtn label="Reform Gov" onClick={onReformGovernment} cooldownLeft={cooldownLeft("reform", 140)} disabled={authority < 35 || corruption < 10} />
        {!selectedSys && !selectedIsEnemy && (
          <div style={{ fontSize: 10, color: "rgba(200,220,255,0.35)", gridColumn: "1/-1" }}>
            Select a system or empire to see contextual commands.
          </div>
        )}
      </div>

      <div style={{ marginTop: 8 }}>
        <button
          style={{ width: "100%", fontSize: 11, opacity: 0.7, background: "rgba(255,80,80,0.15)", borderColor: "rgba(255,80,80,0.4)" }}
          onClick={onStopControl}
        >
          Relinquish Control
        </button>
      </div>
    </div>
  );
}
