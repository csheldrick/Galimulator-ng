import type { GalaxyState, Id } from "../types/sim";
import { MOOD_LABEL, MOOD_COLOR, IDEOLOGY_LABEL, IDEOLOGY_COLOR, rulerDisplayName } from "../sim/Moods";
import { ROLE_LABEL } from "../sim/Characters";

interface Props {
  snapshot: Readonly<GalaxyState>;
  selectedSystemId: Id | null;
  selectedEmpireId: Id | null;
  selectedFleetId: Id | null;
  followEmpireId: Id | null;
  onSelectEmpire: (id: Id) => void;
  onSelectFleet: (id: Id | null) => void;
  onClearSelection: () => void;
  onCancelFleet: (id: Id) => void;
  onToggleFollow: (id: Id) => void;
  onBoostSystem: (id: Id) => void;
  onDevastateSystem: (id: Id) => void;
  onNeutralizeSystem: (id: Id) => void;
  onFoundEmpire: (id: Id) => void;
  onBoostEmpire: (id: Id) => void;
  onWeakenEmpire: (id: Id) => void;
  onInflameEmpire: (id: Id) => void;
  onPacifyEmpire: (id: Id) => void;
  onForceWar: (a: Id, b: Id) => void;
  onForcePeace: (a: Id, b: Id) => void;
}

function fmt(n: number, dec = 1) { return n.toFixed(dec); }
function eta(progress: number, totalDist: number, speed: number) { return Math.max(0, Math.ceil(((1 - progress) * totalDist) / Math.max(0.001, speed))); }

export function InspectorPanel({
  snapshot, selectedSystemId, selectedEmpireId, selectedFleetId, followEmpireId, onSelectEmpire, onSelectFleet, onClearSelection, onCancelFleet, onToggleFollow,
  onBoostSystem, onDevastateSystem, onNeutralizeSystem, onFoundEmpire, onBoostEmpire, onWeakenEmpire, onInflameEmpire, onPacifyEmpire, onForceWar, onForcePeace,
}: Props) {
  const fleet = selectedFleetId ? snapshot.fleets[selectedFleetId] : null;
  const sys = !fleet && selectedSystemId ? snapshot.systems[selectedSystemId] : null;
  const emp = selectedEmpireId ? snapshot.empires[selectedEmpireId] : null;

  if (fleet) {
    const owner = snapshot.empires[fleet.ownerEmpireId];
    const origin = snapshot.systems[fleet.originSystemId];
    const target = snapshot.systems[fleet.targetSystemId];
    return (
      <div className="inspector-panel">
        <div className="inspector-header">
          <h3>{fleet.name}</h3>
          <button className="close-btn" onClick={onClearSelection}>✕</button>
        </div>
        <div className="info-row"><span>Mission</span><span>{fleet.kind}</span></div>
        <div className="info-row"><span>Class</span><span>{fleet.shipClass}</span></div>
        {owner && <div className="info-row owner-row" onClick={() => onSelectEmpire(owner.id)}><span className="emp-dot" style={{ background: owner.color }} /><span>{owner.name}</span></div>}
        <div className="info-row"><span>Origin</span><span>{origin?.name ?? "?"}</span></div>
        <div className="info-row"><span>Target</span><span>{target?.name ?? "?"}</span></div>
        <div className="info-row"><span>Route</span><span>{fleet.path.length - 1} jump{fleet.path.length - 1 === 1 ? "" : "s"}</span></div>
        <div className="info-row"><span>Progress</span><span>{fmt(fleet.progress * 100, 0)}%</span></div>
        <div className="info-row"><span>ETA</span><span>{eta(fleet.progress, fleet.totalDist, fleet.speed)} ticks</span></div>
        <div className="info-row"><span>Strength</span><span>{fmt(fleet.strength, 0)}</span></div>
        <div className="info-row"><span>Speed</span><span>{fmt(fleet.speed, 3)}</span></div>
        <div className="info-row"><span>Launched</span><span>{fleet.createdTick}</span></div>
        <h4>God Controls</h4>
        <div className="god-grid">
          <button onClick={() => onCancelFleet(fleet.id)}>Recall fleet</button>
          {owner && <button onClick={() => onSelectEmpire(owner.id)}>Inspect owner</button>}
          {target && <button onClick={() => { onSelectFleet(null); }}>Clear fleet</button>}
        </div>
      </div>
    );
  }

  if (!sys && !emp) {
    const empList = Object.values(snapshot.empires);
    const activeWars = new Set<string>();
    for (const e of empList) for (const w of e.activeWarEmpireIds) activeWars.add([e.id, w].sort().join("-"));
    return (
      <div className="inspector-panel">
        <h3>Galaxy</h3>
        <div className="info-row"><span>Tick</span><span>{snapshot.tick}</span></div>
        <div className="info-row"><span>Seed</span><span>{snapshot.seed}</span></div>
        <div className="info-row"><span>Systems</span><span>{Object.keys(snapshot.systems).length}</span></div>
        <div className="info-row"><span>Empires</span><span>{empList.length}</span></div>
        <div className="info-row"><span>Fleets</span><span>{Object.keys(snapshot.fleets).length}</span></div>
        <div className="info-row"><span>Owned</span><span>{Object.values(snapshot.systems).filter(s => s.ownerEmpireId).length}</span></div>
        <div className="info-row"><span>Wars</span><span>{activeWars.size}</span></div>
        <div className="info-row"><span>Population</span><span>{fmt(empList.reduce((s, e) => s + e.population, 0) / 1000, 0)}K</span></div>
        <div className="info-row"><span>Trade routes</span><span>{Object.keys(snapshot.tradeRoutes).length}</span></div>
        <div className="info-row"><span>Monsters</span><span>{Object.keys(snapshot.monsters).length}</span></div>
        <h4>Faiths</h4>
        {Object.values(snapshot.religions).map(r => {
          const worlds = Object.values(snapshot.systems).filter(s => s.religionId === r.id).length;
          return <div key={r.id} className="info-row"><span><span className="emp-dot" style={{ background: r.color, marginRight: 5 }} />{r.name}</span><span>{worlds} worlds</span></div>;
        })}
        <div className="empty-hint">Select a system, fleet, empire, or event.</div>
      </div>
    );
  }

  return (
    <div className="inspector-panel">
      {sys && (
        <>
          <div className="inspector-header"><h3>{sys.name}</h3><button className="close-btn" onClick={onClearSelection}>✕</button></div>
          {emp && <div className="info-row owner-row" onClick={() => onSelectEmpire(emp.id)}><span className="emp-dot" style={{ background: emp.color }} /><span>{emp.name}</span></div>}
          {!emp && <div className="info-row"><span>Owner</span><span>Unowned</span></div>}
          <div className="info-row"><span>Population</span><span>{fmt(sys.population * 1000, 0)}</span></div>
          <div className="info-row"><span>Resources</span><span>{fmt(sys.resources)}</span></div>
          <div className="info-row"><span>Habitability</span><span>{fmt(sys.habitability)}</span></div>
          <div className="info-row"><span>Stability</span><span>{fmt(sys.stability)}</span></div>
          <div className="info-row"><span>Tech</span><span>{fmt(sys.techLevel)}</span></div>
          <div className="info-row"><span>Faith</span><span>{sys.religionId ? (snapshot.religions[sys.religionId]?.name ?? "?") : "None"}</span></div>
          {emp && <div className="info-row"><span>Culture</span><span>{sys.cultureId === emp.cultureId ? "Assimilated" : "Foreign"}</span></div>}
          {sys.artifactName && <div className="info-row"><span>Artifact</span><span>◆ {sys.artifactName}</span></div>}
          <h4>God Controls</h4>
          <div className="god-grid"><button onClick={() => onBoostSystem(sys.id)}>Boost world</button><button onClick={() => onDevastateSystem(sys.id)}>Devastate</button><button onClick={() => onNeutralizeSystem(sys.id)} disabled={!sys.ownerEmpireId}>Free system</button><button onClick={() => onFoundEmpire(sys.id)}>Found empire</button></div>
          {sys.recentEventIds.length > 0 && <><h4>Recent Events</h4>{[...sys.recentEventIds].reverse().slice(0, 5).map(eid => { const ev = snapshot.events[eid]; return ev ? <div key={eid} className="event-mini">{ev.title}</div> : null; })}</>}
        </>
      )}

      {emp && !sys && (
        <>
          <div className="inspector-header"><h3 style={{ color: emp.color }}>{emp.name}</h3><button className="close-btn" onClick={onClearSelection}>✕</button></div>
          <button className={followEmpireId === emp.id ? "follow-btn active" : "follow-btn"} onClick={() => onToggleFollow(emp.id)}>{followEmpireId === emp.id ? "⌖ Following — click to stop" : "⌖ Follow this empire"}</button>
          <div className="info-row"><span>Mood</span><span className="mood-badge" style={{ color: MOOD_COLOR[emp.mood] }}>{MOOD_LABEL[emp.mood]} <small>since {emp.moodSince}</small></span></div>
          <div className="info-row"><span>Ideology</span><span style={{ color: IDEOLOGY_COLOR[emp.ideology] }}>{IDEOLOGY_LABEL[emp.ideology]}</span></div>
          <div className="info-row"><span>Faith</span><span>{emp.stateReligionId ? (snapshot.religions[emp.stateReligionId]?.name ?? "?") : "Secular"}</span></div>
          <div className="info-row"><span>Trade</span><span>{Object.values(snapshot.tradeRoutes).filter(r => r.empireAId === emp.id || r.empireBId === emp.id).length} routes</span></div>
          <div className="info-row"><span>Ruler</span><span>{rulerDisplayName(emp)}</span></div>
          <div className="info-row"><span>Dynasty</span><span>{emp.ruler.dynasty} (since {emp.ruler.accessionTick})</span></div>
          {emp.court && emp.court.length > 0 && (
            <>
              <h4>Court</h4>
              <div className="court-list">
                {emp.court.map(c => (
                  <div key={c.id} className={`court-row role-${c.role}`} title={`skill ${c.skill.toFixed(2)} · renown ${c.renown.toFixed(2)} · loyalty ${c.loyalty.toFixed(2)}`}>
                    <span className="court-role">{ROLE_LABEL[c.role]}</span>
                    <span className="court-name">{c.title} {c.name}</span>
                    {c.renown >= 0.6 && <span className="court-star" title="renowned">★</span>}
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="info-row"><span>Capital</span><span>{snapshot.systems[emp.capitalSystemId]?.name ?? "?"}</span></div>
          <div className="info-row"><span>Systems</span><span>{emp.ownedSystemIds.length}</span></div>
          <div className="info-row"><span>Fleets</span><span>{Object.values(snapshot.fleets).filter(f => f.ownerEmpireId === emp.id).length}</span></div>
          <div className="info-row"><span>Population</span><span>{fmt(emp.population / 1000, 0)}K</span></div>
          <div className="info-row"><span>Wealth</span><span>{fmt(emp.wealth, 0)}</span></div>
          <div className="info-row"><span>Military</span><span>{fmt(emp.militaryStrength, 0)}</span></div>
          <div className="info-row"><span>Cohesion</span><span>{fmt(emp.cohesion)}</span></div>
          <div className="info-row"><span>Aggression</span><span>{fmt(emp.aggression)}</span></div>
          <div className="info-row"><span>Expansion</span><span>{fmt(emp.expansionism)}</span></div>
          <div className="info-row"><span>Tech</span><span>{fmt(emp.techLevel)}</span></div>
          <h4>God Controls</h4>
          <div className="god-grid"><button onClick={() => onBoostEmpire(emp.id)}>Strengthen</button><button onClick={() => onWeakenEmpire(emp.id)}>Destabilize</button><button onClick={() => onInflameEmpire(emp.id)}>Inflame</button><button onClick={() => onPacifyEmpire(emp.id)}>Pacify</button></div>
          <h4>Active Fleets</h4>
          <div className="fleet-list">{Object.values(snapshot.fleets).filter(f => f.ownerEmpireId === emp.id).slice(0, 6).map(f => <button key={f.id} className="fleet-row" onClick={() => onSelectFleet(f.id)}><span>{f.name}</span><b>{fmt(f.progress * 100, 0)}%</b></button>)}</div>
          <h4>Relations</h4>
          <div className="relations-list">
            {Object.values(snapshot.empires).filter(other => other.id !== emp.id).map(other => ({ other, rel: emp.relationshipByEmpireId[other.id] })).sort((a, b) => Number(b.rel?.atWar ?? false) - Number(a.rel?.atWar ?? false) || (b.rel?.tension ?? 0) - (a.rel?.tension ?? 0)).slice(0, 10).map(({ other, rel }) => {
              const atWar = rel?.atWar ?? emp.activeWarEmpireIds.includes(other.id); const tension = rel?.tension ?? 0; const opinion = rel?.opinion ?? 50;
              return <div key={other.id} className={atWar ? "relation-row at-war" : "relation-row"}><div className="relation-head" onClick={() => onSelectEmpire(other.id)}><span className="emp-dot" style={{ background: other.color }} /><span>{other.name}</span></div><div className="relation-stats"><span>T {fmt(tension, 0)}</span><span>O {fmt(opinion, 0)}</span><span>{atWar ? "WAR" : "peace"}</span></div><div className="relation-actions"><button onClick={() => onForceWar(emp.id, other.id)} disabled={atWar}>War</button><button onClick={() => onForcePeace(emp.id, other.id)} disabled={!atWar}>Peace</button></div></div>;
            })}
          </div>
          {emp.historicalEventIds.length > 0 && <><h4>History</h4>{[...emp.historicalEventIds].reverse().slice(0, 6).map(eid => { const ev = snapshot.events[eid]; return ev ? <div key={eid} className="event-mini">{ev.title}</div> : null; })}</>}
        </>
      )}
    </div>
  );
}
