import { useState } from "react";
import type { ArtifactKind, GalaxyState, Id, Empire, Person, EmpireAdjustableProperty, EmpireMood, Ideology, CharacterTrait, TotemKind, ShipClass, ShipRole } from "../types/sim";
import { SHIP_ROLES, SHIP_ROLE_SPEC } from "../sim/ShipRoles";
import { MOOD_LABEL, MOOD_COLOR, IDEOLOGY_LABEL, IDEOLOGY_COLOR, rulerDisplayName } from "../sim/Moods";
import { ROLE_LABEL, TRAIT_LABEL } from "../sim/Characters";
import { lineageChain, livingDynastyCount, dynastyMembers, personDisplayName } from "../sim/Dynasty";
import { GOVERNMENT_LABEL, PLANET_TAG_LABEL } from "../sim/Galaxy";
import { ARTIFACT_LABEL } from "../sim/Artifacts";
import { SUBJECT_STATUS_LABEL, subjectOf, subjectsOf } from "../sim/Subjects";
import { eventColor } from "../render/colors";
import { effectiveOpinion, effectiveTension, activeModifiers } from "../sim/Relations";

const ALLIANCE_PURPOSE_LABEL: Record<string, string> = {
  "defensive": "Defensive", "anti-hegemon": "Anti-hegemon", "trade": "Trade", "religious": "Religious", "survival": "Survival",
};

const FACTION_KIND_LABEL: Record<string, string> = {
  separatist: "Separatist", religious: "Religious", court: "Court", regional: "Regional",
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
  onStabilizeEmpire: (id: Id) => void;
  onWeakenEmpire: (id: Id) => void;
  onInflameEmpire: (id: Id) => void;
  onPacifyEmpire: (id: Id) => void;
  onAdjustEmpire: (id: Id, prop: EmpireAdjustableProperty, dir: number) => void;
  onSetEmpireMood: (id: Id, mood: EmpireMood) => void;
  onSetEmpireIdeology: (id: Id, ideology: Ideology) => void;
  onToggleRulerTrait: (id: Id, trait: CharacterTrait) => void;
  onSetSystemTotem: (id: Id, totem: TotemKind | null) => void;
  onMoveSystem: (id: Id, dx: number, dy: number) => void;
  onConnectNearest: (id: Id) => void;
  onPruneLane: (id: Id) => void;
  onBuildArtifact: (id: Id, kind?: ArtifactKind) => void;
  onBuildShip: (id: Id, shipClass: ShipClass, role?: ShipRole) => void;
  onForceWar: (a: Id, b: Id) => void;
  onForcePeace: (a: Id, b: Id) => void;
  onForceMerge: (dominant: Id, absorbed: Id) => void;
  onForceAlliance: (a: Id, b: Id) => void;
  onThrowMeteor: (id: Id) => void;
  onSpawnMonster: () => void;
  onSpawnOddity: () => void;
  onSeedFaction: (id: Id) => void;
}

const MARKER_GLYPH: Record<string, string> = {
  "ruin": "☠", "holy-site": "✦", "battlefield": "⚔", "shipyard": "⚙",
  "rebel-hotbed": "⚡", "artifact-aura": "◆", "dead-capital": "☽",
  "monster-wound": "✗", "trade-hub": "⊕", "plague-world": "☣",
  "transcendent-ruin": "✸", "totem": "🜲",
};

const EMPIRE_MOODS: EmpireMood[] = ["expanding", "fortifying", "degenerating", "rioting", "crusading", "transcending"];
const IDEOLOGIES_LIST: Ideology[] = ["militarist", "pacifist", "spiritualist", "materialist", "expansionist", "isolationist"];
const RULER_TRAITS: CharacterTrait[] = ["bright", "dull", "mechanic", "mutineer", "zealot", "merchant", "warlike", "popular", "corrupt"];
const TOTEMS: { kind: TotemKind; label: string }[] = [
  { kind: "prosperity", label: "Prosperity" }, { kind: "order", label: "Order" }, { kind: "war", label: "War" },
  { kind: "faith", label: "Faith" }, { kind: "growth", label: "Growth" },
];
const SHIP_CLASSES: { cls: ShipClass; label: string }[] = [
  { cls: "raider", label: "Raider" }, { cls: "strike", label: "Strike" }, { cls: "armada", label: "Armada" },
];
const ARTIFACT_KINDS: ArtifactKind[] = ["research-lab", "fleet-base", "holy-monument", "financial-center", "sentinel-station", "stellar-forcefield", "mind-control-hub", "lost-archive", "strange-engine"];

const EMPIRE_ADJUST_STATS: { prop: EmpireAdjustableProperty; label: string; get: (e: Empire) => number; dec: number }[] = [
  { prop: "wealth", label: "Wealth", get: e => e.wealth, dec: 0 },
  { prop: "militaryBonus", label: "Military +", get: e => e.militaryBonus ?? 0, dec: 0 },
  { prop: "cohesion", label: "Cohesion", get: e => e.cohesion, dec: 2 },
  { prop: "aggression", label: "Aggression", get: e => e.aggression, dec: 2 },
  { prop: "expansionism", label: "Expansion", get: e => e.expansionism, dec: 2 },
  { prop: "techLevel", label: "Tech", get: e => e.techLevel, dec: 2 },
];

function fmt(n: number, dec = 1) { return n.toFixed(dec); }
function eta(progress: number, totalDist: number, speed: number) { return Math.max(0, Math.ceil(((1 - progress) * totalDist) / Math.max(0.001, speed))); }
function traitText(traits?: readonly string[]) {
  return traits?.length ? traits.map(t => TRAIT_LABEL[t as keyof typeof TRAIT_LABEL] ?? t).join(", ") : "No traits";
}

function neighboringEmpireIds(snapshot: Readonly<GalaxyState>, emp: Empire): Set<Id> {
  const ids = new Set<Id>();
  for (const sysId of emp.ownedSystemIds) {
    const sys = snapshot.systems[sysId];
    if (!sys) continue;
    for (const neighborId of sys.connectedSystemIds) {
      const ownerId = snapshot.systems[neighborId]?.ownerEmpireId;
      if (ownerId && ownerId !== emp.id) ids.add(ownerId);
    }
  }
  return ids;
}

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
      {ruler?.milestones && ruler.milestones.length > 0 && (
        <div className="info-row" style={{ alignItems: "flex-start" }}>
          <span>Milestones</span>
          <span style={{ textAlign: "right", fontSize: 10, opacity: 0.75 }}>
            {ruler.milestones.slice(-3).map((m, i) => <span key={i} style={{ display: "block" }}>{m}</span>)}
          </span>
        </div>
      )}
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
      {dynasty && dynasty.historicalEventIds.length > 0 && (
        <>
          <h4 style={{ marginTop: 6, marginBottom: 3, opacity: 0.85 }}>Dynasty Chronicle</h4>
          {[...dynasty.historicalEventIds].reverse().slice(0, 5).map(eid => {
            const ev = snapshot.events[eid];
            return ev ? (
              <div key={eid} className="event-mini" style={{ borderLeft: `3px solid ${dynastyEventColor(ev.type)}`, paddingLeft: 5, marginBottom: 2 }}>
                <span style={{ opacity: 0.55, fontSize: 9 }}>t{ev.tick} </span>{ev.title}
              </div>
            ) : null;
          })}
        </>
      )}
    </>
  );
}

function dynastyEventColor(type: string): string {
  switch (type) {
    case "dynasty-founded": return "rgba(255,215,100,0.8)";
    case "dynasty-extinct": return "rgba(180,60,60,0.8)";
    case "dynasty-restored": return "rgba(100,200,255,0.8)";
    case "succession": return "rgba(160,160,200,0.7)";
    case "succession-crisis": return "rgba(240,140,30,0.8)";
    case "heir-born": return "rgba(120,220,140,0.8)";
    case "heir-died": return "rgba(200,100,100,0.7)";
    case "dynastic-marriage": return "rgba(220,160,255,0.8)";
    case "pretender-revolt": return "rgba(255,100,60,0.8)";
    default: return "rgba(140,160,200,0.6)";
  }
}

export function InspectorPanel({
  snapshot, selectedSystemId, selectedEmpireId, selectedFleetId, followEmpireId, onSelectEmpire, onSelectSystem, onSelectFleet, onClearSelection, onCancelFleet, onToggleFollow,
  onBoostSystem, onDevastateSystem, onNeutralizeSystem, onFoundEmpire, onBoostEmpire, onStabilizeEmpire, onWeakenEmpire, onInflameEmpire, onPacifyEmpire, onAdjustEmpire, onSetEmpireMood, onSetEmpireIdeology, onToggleRulerTrait, onSetSystemTotem, onMoveSystem, onConnectNearest, onPruneLane, onBuildArtifact, onBuildShip, onForceWar, onForcePeace, onForceMerge, onForceAlliance,
  onThrowMeteor, onSpawnMonster, onSpawnOddity, onSeedFaction,
}: Props) {
  const [sandboxArtifactKind, setSandboxArtifactKind] = useState<ArtifactKind>("research-lab");
  const fleet = selectedFleetId ? snapshot.fleets[selectedFleetId] : null;
  const sys = !fleet && selectedSystemId ? snapshot.systems[selectedSystemId] : null;
  const emp = selectedEmpireId ? snapshot.empires[selectedEmpireId] : null;
  const empNeighborIds = emp ? neighboringEmpireIds(snapshot, emp) : new Set<Id>();
  const sysFaction = sys?.factionId ? snapshot.factions?.[sys.factionId] : null;
  const nearbyOddities = sys
    ? Object.values(snapshot.oddities ?? {}).filter(o => Math.hypot(o.x - sys.x, o.y - sys.y) < 150)
    : [];

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
        {fleet.role && <div className="info-row"><span>Role</span><span title={SHIP_ROLE_SPEC[fleet.role].description}>{SHIP_ROLE_SPEC[fleet.role].label}</span></div>}
        {owner && <div className="info-row owner-row" onClick={() => onSelectEmpire(owner.id)}><span className="emp-dot" style={{ background: owner.color }} /><span>{owner.name}</span></div>}
        <div className="info-row"><span>Origin</span><span>{origin?.name ?? "?"}</span></div>
        <div className="info-row"><span>Target</span><span>{target?.name ?? "?"}</span></div>
        <div className="info-row"><span>Route</span><span>{fleet.path.length - 1} jump{fleet.path.length - 1 === 1 ? "" : "s"}</span></div>
        <div className="info-row"><span>Progress</span><span>{fmt(fleet.progress * 100, 0)}%</span></div>
        <div className="info-row"><span>ETA</span><span>{eta(fleet.progress, fleet.totalDist, fleet.speed)} ticks</span></div>
        <div className="info-row"><span>Strength</span><span>{fmt(fleet.strength, 0)}</span></div>
        {fleet.level !== undefined && <div className="info-row"><span>Level</span><span>{fleet.level} · XP {fleet.xp ?? 0}</span></div>}
        {fleet.hp !== undefined && fleet.maxHp !== undefined && <div className="info-row"><span>Hull</span><span>{fmt(fleet.hp, 0)}/{fmt(fleet.maxHp, 0)}</span></div>}
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
        <h4>Sandbox</h4>
        <div className="god-grid">
          <button onClick={onSpawnMonster}>Spawn monster</button>
          <button onClick={onSpawnOddity}>Spawn oddity</button>
        </div>
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
          {sysFaction && <div className="info-row"><span>Faction</span><span>{sysFaction.name} <small style={{ opacity: 0.6 }}>· {Math.round(sysFaction.uprisingProgress * 100)}%</small></span></div>}
          {sys.artifactName && <div className="info-row"><span>Artifact</span><span>◆ {sys.artifactName}</span></div>}
          {nearbyOddities.length > 0 && (
            <>
              <h4>Nearby Oddities</h4>
              {nearbyOddities.map(o => (
                <div key={o.id} className="event-mini" style={{ borderLeft: "3px solid rgba(180,120,255,0.7)", paddingLeft: 5, fontSize: 10, marginBottom: 2 }}>
                  {o.name} <span style={{ opacity: 0.55 }}>{o.kind.replace(/-/g, " ")}</span>
                </div>
              ))}
            </>
          )}
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
          {sys.worlds && sys.worlds.length > 0 ? (
            <>
              <h4>Worlds</h4>
              {sys.worlds.map(w => (
                <div key={w.id} className="event-mini" style={{ borderLeft: "3px solid rgba(140,200,160,0.5)", paddingLeft: 5, fontSize: 10, marginBottom: 2 }}>
                  {w.name} <span style={{ opacity: 0.55 }}>· {PLANET_TAG_LABEL[w.type]} · {Math.round(w.populationShare * 100)}% pop · hab {w.habitability.toFixed(2)}</span>
                </div>
              ))}
            </>
          ) : sys.planets && sys.planets.length > 0 && (
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
          <div className="god-grid"><button onClick={() => onBoostSystem(sys.id)}>Boost world</button><button onClick={() => onDevastateSystem(sys.id)}>Devastate</button><button onClick={() => onNeutralizeSystem(sys.id)} disabled={!sys.ownerEmpireId}>Free system</button><button onClick={() => onFoundEmpire(sys.id)}>Found empire</button><button onClick={() => onThrowMeteor(sys.id)}>Throw meteor</button><button onClick={() => onSeedFaction(sys.id)} disabled={!sys.ownerEmpireId || !!sys.factionId} title={sys.factionId ? "A faction already organizes here" : undefined}>Seed faction</button></div>
          <div className="control-row" style={{ marginTop: 4 }}>
            <label>Artifact</label>
            <select style={{ flex: 1 }} value={sandboxArtifactKind} onChange={e => setSandboxArtifactKind(e.target.value as ArtifactKind)}>
              {ARTIFACT_KINDS.map(k => <option key={k} value={k}>{ARTIFACT_LABEL[k]}</option>)}
            </select>
            <button onClick={() => onBuildArtifact(sys.id, sandboxArtifactKind)} disabled={!!sys.artifactId} title={sys.artifactId ? "This system already has an artifact" : "Place an artifact without emperor-mode cost limits"}>Build</button>
          </div>
          <div className="god-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            <button onClick={() => onMoveSystem(sys.id, 0, -24)} title="Move selected star north">N</button>
            <button onClick={() => onMoveSystem(sys.id, -24, 0)} title="Move selected star west">W</button>
            <button onClick={() => onMoveSystem(sys.id, 24, 0)} title="Move selected star east">E</button>
            <button onClick={() => onMoveSystem(sys.id, 0, 24)} title="Move selected star south">S</button>
            <button onClick={() => onConnectNearest(sys.id)} title="Connect this star to the nearest unconnected star">Lane +</button>
            <button onClick={() => onPruneLane(sys.id)} disabled={sys.connectedSystemIds.length === 0} title="Remove this star's longest lane">Lane -</button>
          </div>
          <div className="control-row" style={{ marginTop: 4 }}>
            <label>Totem</label>
            <select style={{ flex: 1 }} value={sys.totem ?? ""} onChange={e => onSetSystemTotem(sys.id, (e.target.value || null) as TotemKind | null)}>
              <option value="">None</option>
              {TOTEMS.map(t => <option key={t.kind} value={t.kind}>{t.label}</option>)}
            </select>
          </div>
          <div className="god-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            {SHIP_CLASSES.map(s => (
              <button key={s.cls} disabled={!sys.ownerEmpireId} title={sys.ownerEmpireId ? `Build a ${s.label}` : "Build needs an owning empire"} onClick={() => onBuildShip(sys.id, s.cls)}>{s.label}</button>
            ))}
          </div>
          <div className="god-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            {SHIP_ROLES.filter(r => SHIP_ROLE_SPEC[r].buildableIn.sandbox).map(r => (
              <button key={r} disabled={!sys.ownerEmpireId} title={SHIP_ROLE_SPEC[r].description} onClick={() => onBuildShip(sys.id, "settler", r)}>{SHIP_ROLE_SPEC[r].label.replace(" Ship", "")}</button>
            ))}
          </div>
          {sys.recentEventIds.length > 0 && <><h4>Recent Events</h4>{[...sys.recentEventIds].reverse().slice(0, 5).map(eid => { const ev = snapshot.events[eid]; return ev ? <div key={eid} className="event-mini" style={{ borderLeft: `3px solid ${eventColor(ev.type)}`, paddingLeft: 5 }}>{ev.title}</div> : null; })}</>}
        </>
      )}

      {emp && (
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
          {(() => {
            const bond = subjectOf(snapshot, emp.id);
            const overlord = bond ? snapshot.empires[bond.overlordEmpireId] : null;
            const vassals = subjectsOf(snapshot, emp.id);
            return (
              <>
                {bond && overlord && (
                  <div className="info-row">
                    <span>Subject state</span>
                    <span style={{ cursor: "pointer", textDecoration: "underline dotted" }} onClick={() => onSelectEmpire(overlord.id)}>
                      {SUBJECT_STATUS_LABEL[bond.status]} of {overlord.name} <small style={{ opacity: 0.6 }}>· loyalty {Math.round(bond.loyalty * 100)}% · autonomy {Math.round(bond.autonomy * 100)}% · tribute {Math.round(bond.tributeRate * 100)}%{bond.protection ? " · protected" : ""}</small>
                    </span>
                  </div>
                )}
                {vassals.length > 0 && (
                  <>
                    <h4>Subjects</h4>
                    {vassals.map(sr => {
                      const sub = snapshot.empires[sr.subjectEmpireId];
                      return sub ? (
                        <div key={sr.id} className="event-mini" style={{ borderLeft: "3px solid rgba(120,180,255,0.6)", paddingLeft: 5, fontSize: 10, marginBottom: 2, cursor: "pointer" }} onClick={() => onSelectEmpire(sub.id)}>
                          {sub.name} <span style={{ opacity: 0.55 }}>· {SUBJECT_STATUS_LABEL[sr.status]} · loyalty {Math.round(sr.loyalty * 100)}% · autonomy {Math.round(sr.autonomy * 100)}% · tribute {Math.round(sr.tributeRate * 100)}%</span>
                        </div>
                      ) : null;
                    })}
                  </>
                )}
              </>
            );
          })()}
          <LineageSection snapshot={snapshot} emp={emp} />
          {emp.court && emp.court.length > 0 && (
            <>
              <h4>Court</h4>
              <div className="court-list">
                {emp.court.map(c => (
                  <div key={c.id} className={`court-row role-${c.role}`} title={`House ${c.dynasty} · ${traitText(c.traits)} · skill ${c.skill.toFixed(2)} · renown ${c.renown.toFixed(2)} · loyalty ${c.loyalty.toFixed(2)}${c.career?.length ? `\nCareer:\n${c.career.slice(-5).join("\n")}` : ""}`}>
                    <span className="court-role">{ROLE_LABEL[c.role]}</span>
                    <span className="court-name">{c.title} {c.name} <small style={{ opacity: 0.55 }}>· {traitText(c.traits)}</small></span>
                    {c.renown >= 0.6 && <span className="court-star" title="renowned">★</span>}
                  </div>
                ))}
              </div>
            </>
          )}
          {Object.values(snapshot.factions ?? {}).some(f => f.targetEmpireId === emp.id) && (
            <>
              <h4>Factions</h4>
              {Object.values(snapshot.factions ?? {}).filter(f => f.targetEmpireId === emp.id).slice(0, 6).map(f => (
                <div key={f.id} className="event-mini" style={{ borderLeft: "3px solid rgba(255,160,30,0.8)", paddingLeft: 5, fontSize: 10, marginBottom: 2 }}>
                  {f.name} <span style={{ opacity: 0.55 }}>· {FACTION_KIND_LABEL[f.kind]}{f.status ? ` · ${f.status}` : ""} · {Math.round(f.uprisingProgress * 100)}% · {f.systemIds.length} worlds · {f.leader.title} {f.leader.name}</span>
                </div>
              ))}
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
          <div className="god-grid"><button onClick={() => onBoostEmpire(emp.id)}>Strengthen</button><button onClick={() => onStabilizeEmpire(emp.id)}>Stabilize</button><button onClick={() => onWeakenEmpire(emp.id)}>Destabilize</button><button onClick={() => onInflameEmpire(emp.id)}>Inflame</button><button onClick={() => onPacifyEmpire(emp.id)}>Pacify</button></div>
          <div className="god-stats">
            {EMPIRE_ADJUST_STATS.map(s => (
              <div className="god-stat-row" key={s.prop}>
                <span>{s.label}</span>
                <button title={`Lower ${s.label}`} onClick={() => onAdjustEmpire(emp.id, s.prop, -1)}>−</button>
                <b>{fmt(s.get(emp), s.dec)}</b>
                <button title={`Raise ${s.label}`} onClick={() => onAdjustEmpire(emp.id, s.prop, 1)}>+</button>
              </div>
            ))}
          </div>
          <div className="control-row" style={{ marginTop: 4 }}>
            <label>State</label>
            <select style={{ flex: 1 }} value={emp.mood} onChange={e => onSetEmpireMood(emp.id, e.target.value as EmpireMood)}>
              {EMPIRE_MOODS.map(m => <option key={m} value={m}>{MOOD_LABEL[m]}</option>)}
            </select>
          </div>
          <div className="control-row">
            <label>Ideology</label>
            <select style={{ flex: 1 }} value={emp.ideology} onChange={e => onSetEmpireIdeology(emp.id, e.target.value as Ideology)}>
              {IDEOLOGIES_LIST.map(i => <option key={i} value={i}>{IDEOLOGY_LABEL[i]}</option>)}
            </select>
          </div>
          <div className="trait-chips">
            {RULER_TRAITS.map(t => {
              const on = emp.ruler.traits?.includes(t) ?? false;
              return <button key={t} className={on ? "trait-chip on" : "trait-chip"} onClick={() => onToggleRulerTrait(emp.id, t)}>{TRAIT_LABEL[t]}</button>;
            })}
          </div>
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
            {Object.values(snapshot.empires).filter(other => other.id !== emp.id).map(other => ({ other, rel: emp.relationshipByEmpireId[other.id] })).sort((a, b) => {
              const aAtWar = a.rel?.atWar ?? emp.activeWarEmpireIds.includes(a.other.id);
              const bAtWar = b.rel?.atWar ?? emp.activeWarEmpireIds.includes(b.other.id);
              return Number(bAtWar) - Number(aAtWar)
                || Number(empNeighborIds.has(b.other.id)) - Number(empNeighborIds.has(a.other.id))
                || effectiveTension(b.rel, snapshot.tick) - effectiveTension(a.rel, snapshot.tick)
                || effectiveOpinion(b.rel, snapshot.tick) - effectiveOpinion(a.rel, snapshot.tick)
                || b.other.ownedSystemIds.length - a.other.ownedSystemIds.length;
            }).map(({ other, rel }) => {
              const atWar = rel?.atWar ?? emp.activeWarEmpireIds.includes(other.id);
              const tension = effectiveTension(rel, snapshot.tick); const opinion = effectiveOpinion(rel, snapshot.tick);
              const mods = activeModifiers(rel, snapshot.tick);
              const bond = Object.values(snapshot.subjects ?? {}).find(sr =>
                (sr.subjectEmpireId === emp.id && sr.overlordEmpireId === other.id) ||
                (sr.subjectEmpireId === other.id && sr.overlordEmpireId === emp.id));
              const sharedAlliance = (emp.allianceIds ?? []).some(id => (other.allianceIds ?? []).includes(id));
              return (
                <div key={other.id} className={atWar ? "relation-row at-war" : "relation-row"}>
                  <div className="relation-head" onClick={() => onSelectEmpire(other.id)}><span className="emp-dot" style={{ background: other.color }} /><span>{other.name}</span>{bond && <small style={{ opacity: 0.6, marginLeft: 4 }}>{bond.subjectEmpireId === other.id ? `· ${SUBJECT_STATUS_LABEL[bond.status]}` : "· Overlord"}</small>}</div>
                  <div className="relation-stats"><span>T {fmt(tension, 0)}</span><span>O {fmt(opinion, 0)}</span><span>{atWar ? "WAR" : "peace"}</span></div>
                  <div className="relation-actions"><button onClick={() => onForceWar(emp.id, other.id)} disabled={atWar}>War</button><button onClick={() => onForcePeace(emp.id, other.id)} disabled={!atWar}>Peace</button><button onClick={() => onForceMerge(emp.id, other.id)} disabled={atWar}>Merge</button><button onClick={() => onForceAlliance(emp.id, other.id)} disabled={sharedAlliance}>Alliance</button></div>
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
