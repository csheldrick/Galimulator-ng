import type { GalaxyState, Id } from "../types/sim";

interface Props {
  snapshot: Readonly<GalaxyState>;
  selectedSystemId: Id | null;
  selectedEmpireId: Id | null;
  onSelectEmpire: (id: Id) => void;
  onClearSelection: () => void;
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

export function InspectorPanel({
  snapshot,
  selectedSystemId,
  selectedEmpireId,
  onSelectEmpire,
  onClearSelection,
  onBoostSystem,
  onDevastateSystem,
  onNeutralizeSystem,
  onFoundEmpire,
  onBoostEmpire,
  onWeakenEmpire,
  onInflameEmpire,
  onPacifyEmpire,
  onForceWar,
  onForcePeace,
}: Props) {
  const sys = selectedSystemId ? snapshot.systems[selectedSystemId] : null;
  const emp = selectedEmpireId ? snapshot.empires[selectedEmpireId] : null;

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
        <div className="info-row">
          <span>Owned</span>
          <span>{Object.values(snapshot.systems).filter(s => s.ownerEmpireId).length}</span>
        </div>
        <div className="info-row"><span>Wars</span><span>{activeWars.size}</span></div>
        <div className="info-row">
          <span>Population</span>
          <span>{fmt(empList.reduce((s, e) => s + e.population, 0) / 1000, 0)}K</span>
        </div>
        <div className="empty-hint">Select a system on the map, an empire from the left sidebar, or an event from the log.</div>
      </div>
    );
  }

  return (
    <div className="inspector-panel">
      {sys && (
        <>
          <div className="inspector-header">
            <h3>{sys.name}</h3>
            <button className="close-btn" onClick={onClearSelection}>✕</button>
          </div>
          {emp && (
            <div className="info-row owner-row" onClick={() => onSelectEmpire(emp.id)}>
              <span className="emp-dot" style={{ background: emp.color }} />
              <span>{emp.name}</span>
            </div>
          )}
          {!emp && <div className="info-row"><span>Owner</span><span>Unowned</span></div>}
          <div className="info-row"><span>Population</span><span>{fmt(sys.population * 1000, 0)}</span></div>
          <div className="info-row"><span>Resources</span><span>{fmt(sys.resources)}</span></div>
          <div className="info-row"><span>Habitability</span><span>{fmt(sys.habitability)}</span></div>
          <div className="info-row"><span>Stability</span><span>{fmt(sys.stability)}</span></div>
          <div className="info-row"><span>Tech</span><span>{fmt(sys.techLevel)}</span></div>

          <h4>God Controls</h4>
          <div className="god-grid">
            <button onClick={() => onBoostSystem(sys.id)}>Boost world</button>
            <button onClick={() => onDevastateSystem(sys.id)}>Devastate</button>
            <button onClick={() => onNeutralizeSystem(sys.id)} disabled={!sys.ownerEmpireId}>Free system</button>
            <button onClick={() => onFoundEmpire(sys.id)}>Found empire</button>
          </div>

          {sys.recentEventIds.length > 0 && (
            <>
              <h4>Recent Events</h4>
              {[...sys.recentEventIds].reverse().slice(0, 5).map(eid => {
                const ev = snapshot.events[eid];
                return ev ? <div key={eid} className="event-mini">{ev.title}</div> : null;
              })}
            </>
          )}
        </>
      )}

      {emp && !sys && (
        <>
          <div className="inspector-header">
            <h3 style={{ color: emp.color }}>{emp.name}</h3>
            <button className="close-btn" onClick={onClearSelection}>✕</button>
          </div>
          <div className="info-row"><span>Capital</span><span>{snapshot.systems[emp.capitalSystemId]?.name ?? "?"}</span></div>
          <div className="info-row"><span>Systems</span><span>{emp.ownedSystemIds.length}</span></div>
          <div className="info-row"><span>Population</span><span>{fmt(emp.population / 1000, 0)}K</span></div>
          <div className="info-row"><span>Wealth</span><span>{fmt(emp.wealth, 0)}</span></div>
          <div className="info-row"><span>Military</span><span>{fmt(emp.militaryStrength, 0)}</span></div>
          <div className="info-row"><span>Cohesion</span><span>{fmt(emp.cohesion)}</span></div>
          <div className="info-row"><span>Aggression</span><span>{fmt(emp.aggression)}</span></div>
          <div className="info-row"><span>Expansion</span><span>{fmt(emp.expansionism)}</span></div>
          <div className="info-row"><span>Tech</span><span>{fmt(emp.techLevel)}</span></div>

          <h4>God Controls</h4>
          <div className="god-grid">
            <button onClick={() => onBoostEmpire(emp.id)}>Strengthen</button>
            <button onClick={() => onWeakenEmpire(emp.id)}>Destabilize</button>
            <button onClick={() => onInflameEmpire(emp.id)}>Inflame</button>
            <button onClick={() => onPacifyEmpire(emp.id)}>Pacify</button>
          </div>

          <h4>Relations</h4>
          <div className="relations-list">
            {Object.values(snapshot.empires)
              .filter(other => other.id !== emp.id)
              .map(other => ({ other, rel: emp.relationshipByEmpireId[other.id] }))
              .sort((a, b) => Number(b.rel?.atWar ?? false) - Number(a.rel?.atWar ?? false) || (b.rel?.tension ?? 0) - (a.rel?.tension ?? 0))
              .slice(0, 10)
              .map(({ other, rel }) => {
                const atWar = rel?.atWar ?? emp.activeWarEmpireIds.includes(other.id);
                const tension = rel?.tension ?? 0;
                const opinion = rel?.opinion ?? 50;
                return (
                  <div key={other.id} className={atWar ? "relation-row at-war" : "relation-row"}>
                    <div className="relation-head" onClick={() => onSelectEmpire(other.id)}>
                      <span className="emp-dot" style={{ background: other.color }} />
                      <span>{other.name}</span>
                    </div>
                    <div className="relation-stats">
                      <span>T {fmt(tension, 0)}</span>
                      <span>O {fmt(opinion, 0)}</span>
                      <span>{atWar ? "WAR" : "peace"}</span>
                    </div>
                    <div className="relation-actions">
                      <button onClick={() => onForceWar(emp.id, other.id)} disabled={atWar}>War</button>
                      <button onClick={() => onForcePeace(emp.id, other.id)} disabled={!atWar}>Peace</button>
                    </div>
                  </div>
                );
              })}
          </div>

          {emp.historicalEventIds.length > 0 && (
            <>
              <h4>History</h4>
              {[...emp.historicalEventIds].reverse().slice(0, 6).map(eid => {
                const ev = snapshot.events[eid];
                return ev ? <div key={eid} className="event-mini">{ev.title}</div> : null;
              })}
            </>
          )}
        </>
      )}
    </div>
  );
}
