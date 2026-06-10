import type { GalaxyState, Id, EmpirePriority, PlayerControlState } from "../types/sim";
import { MOOD_LABEL, MOOD_COLOR, IDEOLOGY_LABEL, rulerDisplayName } from "../sim/Moods";
import { ROLE_LABEL } from "../sim/Characters";

interface Props {
  snapshot: Readonly<GalaxyState>;
  playerControl: PlayerControlState;
  selectedSystemId: Id | null;
  selectedEmpireId: Id | null;
  onStartControl: (empireId: Id) => void;
  onStopControl: () => void;
  onSetPriority: (p: EmpirePriority) => void;
  onRallyFleet: (systemId: Id) => void;
  onFortify: (systemId: Id) => void;
  onStabilize: (systemId: Id) => void;
  onProposePeace: (empireId: Id) => void;
  onProvokeWar: (empireId: Id) => void;
  onSponsorColonization: (systemId: Id) => void;
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

export function EmpireControlPanel({
  snapshot, playerControl, selectedSystemId, selectedEmpireId,
  onStartControl, onStopControl, onSetPriority,
  onRallyFleet, onFortify, onStabilize, onProposePeace, onProvokeWar, onSponsorColonization,
}: Props) {
  const { mode, controlledEmpireId, authority, legitimacy, commandCooldowns } = playerControl;
  const controlled = controlledEmpireId ? snapshot.empires[controlledEmpireId] : null;
  const selectedSys = selectedSystemId ? snapshot.systems[selectedSystemId] : null;
  const selectedEmp = selectedEmpireId ? snapshot.empires[selectedEmpireId] : null;

  const cooldownLeft = (key: string, cd: number) => {
    const last = commandCooldowns[key] ?? 0;
    return Math.max(0, cd - (snapshot.tick - last));
  };

  function CmdBtn({ label, onClick, disabled, cooldownKey, cooldown }: {
    label: string; onClick: () => void; disabled?: boolean; cooldownKey?: string; cooldown?: number;
  }) {
    const cd = cooldownKey && cooldown ? cooldownLeft(cooldownKey, cooldown) : 0;
    const isDisabled = disabled || cd > 0;
    return (
      <button
        className="cmd-btn"
        onClick={onClick}
        disabled={isDisabled}
        title={cd > 0 ? `Cooldown: ${cd} ticks` : undefined}
        style={{ opacity: isDisabled ? 0.45 : 1 }}
      >
        {label}{cd > 0 ? ` (${cd})` : ""}
      </button>
    );
  }

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
          {IDEOLOGY_LABEL[controlled.ideology]} · {controlled.ownedSystemIds.length} systems{atWar.length > 0 ? ` · ${atWar.length} wars` : ""}
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
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: c.loyalty < 0.3 ? "#ff595e" : "rgba(200,220,255,0.7)", marginBottom: 2 }}>
              <span>{c.title} {c.name} <span style={{ opacity: 0.6 }}>({ROLE_LABEL[c.role]})</span></span>
              <span style={{ color: c.loyalty < 0.3 ? "#ff595e" : "rgba(200,220,255,0.45)" }}>
                {c.loyalty < 0.3 ? "⚠" : ""} {Math.round(c.loyalty * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10, color: "rgba(200,220,255,0.55)", marginBottom: 4 }}>Commands</div>
      <div className="cmd-grid">
        {ownsSys && (
          <>
            <CmdBtn label="Fortify" onClick={() => onFortify(selectedSystemId!)} cooldownKey="fortify" cooldown={20} disabled={authority < 15} />
            <CmdBtn label="Stabilize" onClick={() => onStabilize(selectedSystemId!)} cooldownKey="stabilize" cooldown={10} disabled={authority < 10} />
          </>
        )}
        {(isEnemy || ownsSys) && (
          <CmdBtn label="Rally Fleet" onClick={() => onRallyFleet(selectedSystemId!)} cooldownKey="rally" cooldown={15} disabled={authority < 20} />
        )}
        {neutralNeighbor && (
          <CmdBtn label="Sponsor Colony" onClick={() => onSponsorColonization(selectedSystemId!)} cooldownKey="colonize" cooldown={25} disabled={authority < 18} />
        )}
        {atWarWith && (
          <CmdBtn label="Propose Peace" onClick={() => onProposePeace(selectedEmpireId!)} cooldownKey="peace" cooldown={30} disabled={authority < 25} />
        )}
        {notAtWarWith && (
          <CmdBtn label="Provoke War" onClick={() => onProvokeWar(selectedEmpireId!)} cooldownKey="war" cooldown={40} disabled={authority < 30} />
        )}
        {atWar.length > 0 && !atWarWith && !selectedIsEnemy && (
          atWar.slice(0, 2).map(eid => {
            const e = snapshot.empires[eid];
            if (!e) return null;
            return <CmdBtn key={eid} label={`Peace: ${e.name.split(" ")[0]}`} onClick={() => onProposePeace(eid)} cooldownKey="peace" cooldown={30} disabled={authority < 25} />;
          })
        )}
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
