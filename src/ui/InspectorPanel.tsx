import type { GalaxyState, Id, Empire, Person } from "../types/sim";
import { MOOD_LABEL, MOOD_COLOR, IDEOLOGY_LABEL, IDEOLOGY_COLOR, rulerDisplayName } from "../sim/Moods";
import { ROLE_LABEL } from "../sim/Characters";
import { lineageChain, livingDynastyCount, dynastyMembers, personDisplayName } from "../sim/Dynasty";
import { GOVERNMENT_LABEL } from "../sim/Galaxy";
import { ARTIFACT_LABEL } from "../sim/Artifacts";
import { eventColor } from "../render/colors";
import { effectiveOpinion, effectiveTension, activeModifiers } from "../sim/Relations";

const ALLIANCE_PURPOSE_LABEL: Record<string, string> = {
  "defensive": "Defensive", "anti-hegemon": "Anti-hegemon", "trade": "Trade", "religious": "Religious", "survival": "Survival",
};

interface Props {
  snapshot: Readonly<GalaxyState>;
  selectedSystemId: Id | null;
  selectedEmpireId: Id | null;
  selectedFleetId: Id | null;
  followEmpireId: Id | null;
  onSelectEmpire: (id: Id) => void;
  onSelectSystem: (id: Id) => void;
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

const MARKER_GLYPH: Record<string, string> = {
  "ruin": "☠", "holy-site": "✦", "battlefield": "⚔", "shipyard": "⚙",
  "rebel-hotbed": "⚡", "artifact-aura": "◆", "dead-capital": "☽",
  "monster-wound": "✗", "trade-hub": "⊕", "plague-world": "☣",
  "transcendent-ruin": "✸",
};

function fmt(n: number, dec = 1) { return n.toFixed(dec); }
function eta(progress: number, totalDist: number, speed: number) { return Math.max(0, Math.ceil(((1 - progress) * totalDist) / Math.max(0.001, speed))); }

/** Ruler identity, ruling house, heir, predecessor/parent ties, and a compact lineage chain. */
function LineageSection({ snapshot, emp }: { snapshot: Readonly<GalaxyState>; emp: Empire }) {
  const people = snapshot.people ?? {};
  const ruler: Person | null = emp.rulerPersonId ? people[emp.rulerPersonId] ?? null : null;
  const dynasty = emp.dynastyId ? snapshot.dynasties?.[emp.dynastyId] ?? null : null;
  const dynastyName = dynasty?.name ?? emp.ruler.dynasty;

  // Heir apparent: strongest-claim living member of the ruling house (not the ruler).
  const heir = emp.dynastyId
    ? dynastyMembers(snapshot, emp.dynastyId, { aliveOnly: true })
        .filter(p => p.id !== emp.rulerPersonId && p.role !== "consort" && (p.empireId === emp.id || p.empireId === null))
        .sort((a, b) => b.claimStrength - a.claimStrength)[0] ?? null
    : null;

  // Predecessor on the throne, and the ruler's parent (for "child of …" flavor).
  const predecessor = ruler?.predecessorPersonId ? people[ruler.predecessorPersonId] ?? null : null;
  const rulerParent = ruler?.parentIds.map(id => people[id]).find(Boolean) ?? null;

  const livingHouse = livingDynastyCount(snapshot, emp.dynastyId);
  const chain = lineageChain(snapshot, emp, 6);

  return (
    <>
      <div className="info-row"><span>Ruler</span><span>{ruler ? personDisplayName(ruler) : rulerDisplayName(emp)}</span></div>
      <div className="info-row"><span>House</span><span>{dynastyName}{dynasty ? <small style={{ opacity: 0.6 }}> · since {dynasty.foundedTick} · prestige {fmt(dynasty.prestige, 0)}</small> : null}</span></div>
      {rulerParent && <div className="info-row"><span>Parentage</span><span>{ruler && ruler.gender === "female" ? "daughter" : ruler && ruler.gender === "male" ? "son" : "child"} of {personDisplayName(rulerParent)}</span></div>}
      {!rulerParent && predecessor && <div className="info-row"><span>Succeeded</span><span>{personDisplayName(predecessor)}</span></div>}
      <div className="info-row"><span>Heir</span><span>{heir ? <>{personDisplayName(heir)} <small style={{ opacity: 0.6 }}>· claim {fmt(heir.claimStrength, 2)}</small></> : <em style={{ opacity: 0.6 }}>none — no clear successor</em>}</span></div>
      <div className="info-row"><span>House members</span><span>{livingHouse} living</span></div>
      {chain.length > 1 && (
        <div className="info-row" style={{ alignItems: "flex-start" }}>
          <span>Lineage</span>
          <span style={{ textAlign: "right" }}>
            {chain.map((p, i) => (
              <span key={p.id} style={{ opacity: i === 0 ? 1 : 0.55 - i * 0.05 }}>
                {i > 0 ? " ← " : ""}{p.title} {p.name}
              </span>
            ))}
          </span>
        </div>
      )}
    </>
  );
}

export function InspectorPanel({
  snapshot, selectedSystemId, selectedEmpireId, selectedFleetId, followEmpireId, onSelectEmpire, onSelectSystem, onSelectFleet, onClearSelection, onCancelFleet, onToggleFollow,
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
        {Object.values(snapshot.oddities ?? {}).length > 0 && (
          <>
            <h4>Space Oddities</h4>
            {Object.values(snapshot.oddities ?? {}).map(o => (
              <div key={o.id} className="info-row"><span>{o.name}</span><span style={{ opacity: 0.7 }}>{o.kind.replace(/-/g, " ")}</span></div>
            ))}
          </>
        )}
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
          {sys.minorityReligionId && snapshot.religions[sys.minorityReligionId] && (
            <div className="info-row"><span>Minority faith</span><span style={{ opacity: 0.75 }}>{snapshot.religions[sys.minorityReligionId]?.name}</span></div>
          )}
          {emp && <div className="info-row"><span>Culture</span><span>{sys.cultureId === emp.cultureId ? "Assimilated" : "Foreign"}</span></div>}
          {sys.artifactName && <div className="info-row"><span>Artifact</span><span>◆ {sys.artifactName}</span></div>}
          {(() => {
            const artifact = sys.artifactId ? snapshot.artifacts?.[sys.artifactId] : null;
            if (!artifact) return null;
            const ownerName = artifact.ownerEmpireId ? snapshot.empires[artifact.ownerEmpireId]?.name : null;
            return (
              <div className="event-mini" style={{ borderLeft: "3px solid rgba(255,224,130,0.6)", paddingLeft: 5, fontSize: 10, marginBottom: 3 }}>
                {ARTIFACT_LABEL[artifact.kind]} · {artifact.origin}
                {artifact.discoveredTick === undefined && artifact.origin === "precursor" ? " · undiscovered" : ""}
                {ownerName ? ` · held by ${ownerName}` : ""}
                {artifact.capturedTick !== undefined ? ` · captured t${artifact.capturedTick}` : artifact.origin === "built" ? ` · built t${artifact.createdTick}` : ""}
              </div>
            );
          })()}
          {sys.planets && sys.planets.length > 0 && (
            <div className="info-row"><span>Worlds</span><span style={{ fontSize: 10, color: "rgba(200,220,255,0.7)" }}>{sys.planets.join(", ")}</span></div>
          )}
          {sys.markers && sys.markers.length > 0 && (
            <>
              <h4>Markers</h4>
              {sys.markers.map(m => (
                <div key={m.kind} className="event-mini" style={{ borderLeft: "3px solid rgba(180,180,255,0.5)", paddingLeft: 5, fontSize: 10, marginBottom: 2 }}>
                  {MARKER_GLYPH[m.kind] ?? "•"} {m.label ?? m.kind.replace(/-/g, " ")} <span style={{ opacity: 0.45 }}>tick {m.since}</span>
                </div>
              ))}
            </>
          )}
          <h4>God Controls</h4>
          <div className="god-grid"><button onClick={() => onBoostSystem(sys.id)}>Boost world</button><button onClick={() => onDevastateSystem(sys.id)}>Devastate</button><button onClick={() => onNeutralizeSystem(sys.id)} disabled={!sys.ownerEmpireId}>Free system</button><button onClick={() => onFoundEmpire(sys.id)}>Found empire</button></div>
          {sys.recentEventIds.length > 0 && <><h4>Recent Events</h4>{[...sys.recentEventIds].reverse().slice(0, 5).map(eid => { const ev = snapshot.events[eid]; return ev ? <div key={eid} className="event-mini" style={{ borderLeft: `3px solid ${eventColor(ev.type)}`, paddingLeft: 5 }}>{ev.title}</div> : null; })}</>}
        </>
      )}

      {emp && !sys && (
        <>
          <div className="inspector-header"><h3 style={{ color: emp.color }}>{emp.name}</h3><button className="close-btn" onClick={onClearSelection}>✕</button></div>
          <button className={followEmpireId === emp.id ? "follow-btn active" : "follow-btn"} onClick={() => onToggleFollow(emp.id)}>{followEmpireId === emp.id ? "⌖ Following — click to stop" : "⌖ Follow this empire"}</button>
          <div className="info-row"><span>Mood</span><span className="mood-badge" style={{ color: MOOD_COLOR[emp.mood] }}>{MOOD_LABEL[emp.mood]} <small>since {emp.moodSince}</small></span></div>
          <div className="info-row"><span>Ideology</span><span style={{ color: IDEOLOGY_COLOR[emp.ideology] }}>{IDEOLOGY_LABEL[emp.ideology]}</span></div>
          {emp.governmentType && <div className="info-row"><span>Government</span><span>{GOVERNMENT_LABEL[emp.governmentType]}</span></div>}
          <div className="info-row"><span>Faith</span><span>{emp.stateReligionId ? (snapshot.religions[emp.stateReligionId]?.name ?? "?") : "Secular"}</span></div>
          {(emp.allianceIds ?? []).map(aid => snapshot.alliances?.[aid]).filter(Boolean).map(al => al && (
            <div key={al.id} className="info-row"><span>Alliance</span><span style={{ color: al.color ?? "inherit" }}>{al.emblem ?? "◇"} {al.name} <small style={{ opacity: 0.6 }}>· {ALLIANCE_PURPOSE_LABEL[al.purpose ?? "defensive"]} · {al.memberEmpireIds.length} · {snapshot.tick - al.formedTick}t</small></span></div>
          ))}
          <div className="info-row"><span>Trade</span><span>{Object.values(snapshot.tradeRoutes).filter(r => r.empireAId === emp.id || r.empireBId === emp.id).length} routes</span></div>
          <LineageSection snapshot={snapshot} emp={emp} />
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
          <div className="info-row">
            <span>Capital</span>
            <span
              style={{ cursor: "pointer", textDecoration: "underline dotted" }}
              onClick={() => { if (snapshot.systems[emp.capitalSystemId]) onSelectSystem(emp.capitalSystemId); }}
            >
              {snapshot.systems[emp.capitalSystemId]?.name ?? "?"}
            </span>
          </div>
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
          {(() => {
            const empFleets = Object.values(snapshot.fleets).filter(f => f.ownerEmpireId === emp.id);
            const visible = empFleets.slice(0, 6);
            const hidden = empFleets.length - visible.length;
            return (
              <div className="fleet-list">
                {visible.map(f => <button key={f.id} className="fleet-row" onClick={() => onSelectFleet(f.id)}><span>{f.name}</span><b>{fmt(f.progress * 100, 0)}%</b></button>)}
                {hidden > 0 && <div className="empty-hint">and {hidden} more</div>}
              </div>
            );
          })()}
          <h4>Relations</h4>
          <div className="relations-list">
            {Object.values(snapshot.empires).filter(other => other.id !== emp.id).map(other => ({ other, rel: emp.relationshipByEmpireId[other.id] })).sort((a, b) => Number(b.rel?.atWar ?? false) - Number(a.rel?.atWar ?? false) || effectiveTension(b.rel, snapshot.tick) - effectiveTension(a.rel, snapshot.tick)).slice(0, 10).map(({ other, rel }) => {
              const atWar = rel?.atWar ?? emp.activeWarEmpireIds.includes(other.id);
              const tension = effectiveTension(rel, snapshot.tick); const opinion = effectiveOpinion(rel, snapshot.tick);
              const mods = activeModifiers(rel, snapshot.tick);
              return (
                <div key={other.id} className={atWar ? "relation-row at-war" : "relation-row"}>
                  <div className="relation-head" onClick={() => onSelectEmpire(other.id)}><span className="emp-dot" style={{ background: other.color }} /><span>{other.name}</span></div>
                  <div className="relation-stats"><span>T {fmt(tension, 0)}</span><span>O {fmt(opinion, 0)}</span><span>{atWar ? "WAR" : "peace"}</span></div>
                  <div className="relation-actions"><button onClick={() => onForceWar(emp.id, other.id)} disabled={atWar}>War</button><button onClick={() => onForcePeace(emp.id, other.id)} disabled={!atWar}>Peace</button></div>
                  {mods.length > 0 && <div style={{ fontSize: 9, color: "rgba(180,200,240,0.6)", gridColumn: "1/-1", paddingLeft: 4, paddingBottom: 2 }}>{mods.map(m => `${m.opinionDelta >= 0 ? "+" : ""}${m.opinionDelta} ${m.label}`).join(" · ")}</div>}
                </div>
              );
            })}
          </div>
          {emp.historicalEventIds.length > 0 && <><h4>History</h4>{[...emp.historicalEventIds].reverse().slice(0, 6).map(eid => { const ev = snapshot.events[eid]; return ev ? <div key={eid} className="event-mini" style={{ borderLeft: `3px solid ${eventColor(ev.type)}`, paddingLeft: 5 }}>{ev.title}</div> : null; })}</>}
        </>
      )}
    </div>
  );
}
