import type { GalaxyState } from "../types/sim";

const LABELS: Record<string, string> = {
  "empire-founded": "Founded",
  "system-colonized": "Colonies",
  "border-conflict": "Battles",
  "war-declared": "Wars",
  "peace-signed": "Peace",
  "empire-collapsed": "Collapsed",
  "rebellion": "Rebellions",
  "golden-age": "Golden Ages",
  "technology-breakthrough": "Tech",
  "succession": "Successions",
  "mood-shift": "Mood Shifts",
  "transcended": "Transcended",
};

interface Props { snapshot: Readonly<GalaxyState>; }

export function GalaxyPulse({ snapshot }: Props) {
  const recentEvents = snapshot.eventLog
    .slice(-100)
    .map(id => snapshot.events[id])
    .filter(Boolean)
    .filter(ev => snapshot.tick - ev.tick <= 100);

  const counts = recentEvents.reduce<Record<string, number>>((acc, ev) => {
    acc[ev.type] = (acc[ev.type] ?? 0) + 1;
    return acc;
  }, {});

  const activeWars = new Set<string>();
  for (const empire of Object.values(snapshot.empires)) {
    for (const enemyId of empire.activeWarEmpireIds) activeWars.add([empire.id, enemyId].sort().join("~"));
  }

  const empires = Object.values(snapshot.empires);
  const fleets = Object.values(snapshot.fleets);
  const avgCohesion = empires.length ? empires.reduce((sum, e) => sum + e.cohesion, 0) / empires.length : 0;
  const avgTech = empires.length ? empires.reduce((sum, e) => sum + e.techLevel, 0) / empires.length : 0;
  const topCounts = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="galaxy-pulse">
      <div className="pulse-header">
        <h3>Galaxy Pulse</h3>
        <span>last 100 ticks</span>
      </div>
      <div className="pulse-grid">
        <div><b>{recentEvents.length}</b><span>events</span></div>
        <div><b>{activeWars.size}</b><span>wars</span></div>
        <div><b>{fleets.length}</b><span>fleets</span></div>
        <div><b>{avgTech.toFixed(2)}</b><span>tech</span></div>
      </div>
      <div className="pulse-grid compact">
        <div><b>{fleets.filter(f => f.kind === "colonizer").length}</b><span>colonizers</span></div>
        <div><b>{fleets.filter(f => f.kind === "war").length}</b><span>warships</span></div>
        <div><b>{avgCohesion.toFixed(2)}</b><span>cohesion</span></div>
        <div><b>{empires.length}</b><span>powers</span></div>
      </div>
      <div className="pulse-bars">
        {topCounts.map(([type, count]) => {
          const pct = recentEvents.length ? Math.max(8, (count / recentEvents.length) * 100) : 0;
          return (
            <div key={type} className="pulse-bar-row">
              <span>{LABELS[type] ?? type}</span>
              <div className="pulse-bar-track"><div style={{ width: `${pct}%` }} /></div>
              <b>{count}</b>
            </div>
          );
        })}
        {topCounts.length === 0 && <div className="event-empty">No recent activity.</div>}
      </div>
    </div>
  );
}
