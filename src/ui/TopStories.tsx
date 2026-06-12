import type { GalaxyState, Id, SimEvent, EventType } from "../types/sim";

interface Props {
  snapshot: Readonly<GalaxyState>;
  selectedEventId: Id | null;
  onSelectEvent: (event: SimEvent) => void;
  onFollowEmpire: (id: Id) => void;
}

// How urgently each kind of event reads as "a story worth following".
const TYPE_WEIGHT: Partial<Record<EventType, number>> = {
  "empire-collapsed": 9,
  "transcended": 9,
  "galactic-crisis": 8,
  "coup": 7,
  "rebellion": 7,
  "war-declared": 6,
  "monster-attack": 6,
  "monster-spawned": 5,
  "artifact-discovered": 5,
  "empire-founded": 4,
  "monster-slain": 4,
  "religion-adopted": 3,
  "peace-signed": 3,
  "character-rose": 2,
  "character-fell": 2,
  "empire-merged": 7,
  "quest-launched": 2,
  "quest-completed": 5,
  "faction-formed": 4,
  "faction-engaged": 3,
  "faction-uprising": 8,
  "faction-dissolved": 3,
  "subject-created": 6,
  "subject-rebelled": 7,
  "subject-integrated": 6,
  "subject-liberated": 5,
  "meteor-strike": 6,
  "dynasty-extinct": 7,
  "succession-crisis": 6,
  "pretender-revolt": 6,
  "dynasty-restored": 5,
  "dynastic-marriage": 3,
  "heir-born": 2,
  "heir-died": 2,
};

function biggestEmpire(snapshot: Readonly<GalaxyState>, ids: Id[]) {
  let best = null as null | { id: Id; name: string; size: number };
  for (const id of ids) {
    const e = snapshot.empires[id];
    if (e && (!best || e.ownedSystemIds.length > best.size)) best = { id, name: e.name, size: e.ownedSystemIds.length };
  }
  return best;
}

function reasonFor(ev: SimEvent, snapshot: Readonly<GalaxyState>): string {
  const big = biggestEmpire(snapshot, ev.relatedEmpireIds);
  const scale = big ? (big.size >= 12 ? "a major power" : big.size >= 5 ? "a rising power" : "a minor power") : "";
  switch (ev.type) {
    case "empire-collapsed": return `${scale ? `${big!.name}, ${scale}, is gone` : "A power is gone"} — its worlds are now contested.`;
    case "transcended": return "An empire ascended beyond the galaxy, abandoning its enlightened worlds.";
    case "galactic-crisis": return "A galaxy-wide crisis is reshaping the map.";
    case "coup": return "A regime change has flipped an empire's whole direction.";
    case "rebellion": return `A breakaway state is fracturing ${big ? big.name : "an empire"}.`;
    case "faction-formed": return `${big ? big.name : "An empire"} now has organized internal opposition.`;
    case "faction-engaged": return `${big ? big.name : "An empire"} is trying to contain organized dissent.`;
    case "faction-uprising": return `A faction has become a new rebel state${big ? ` around ${big.name}` : ""}.`;
    case "faction-dissolved": return `${big ? big.name : "An empire"} contained an internal faction.`;
    case "war-declared": return `War has broken out${big ? ` involving ${big.name}` : ""} — borders are about to move.`;
    case "empire-merged": return `${big ? big.name : "A power"} has absorbed another empire, redrawing the balance of power.`;
    case "quest-launched": return `${big ? big.name : "An empire"} is gambling resources on a deep-space expedition.`;
    case "quest-completed": return `${big ? big.name : "An empire"} returned from a quest with consequences.`;
    case "monster-attack":
    case "monster-spawned": return "A monster is bearing down on populous worlds.";
    case "artifact-discovered": return `${big ? big.name : "Someone"} just leapt ahead with a precursor artifact.`;
    case "empire-founded": return `${big ? big.name : "A new power"} has entered the galactic stage.`;
    case "monster-slain": return "A galactic menace has finally been put down.";
    case "religion-adopted": return `A faith has captured the soul of ${big ? big.name : "an empire"}.`;
    case "dynasty-extinct": return `A ruling house has died out${big ? ` in ${big.name}` : ""} — the throne passes to a new line.`;
    case "succession-crisis": return `${big ? big.name : "An empire"} is gripped by a contested succession.`;
    case "pretender-revolt": return `A pretender has raised a claim against ${big ? big.name : "an empire"}'s throne.`;
    case "dynasty-restored": return "A fallen dynasty has clawed its way back to power.";
    case "dynastic-marriage": return "Two ruling houses have bound themselves by marriage.";
    default: return ev.description;
  }
}

export function TopStories({ snapshot, selectedEventId, onSelectEvent, onFollowEmpire }: Props) {
  const now = snapshot.tick;
  const scored = snapshot.eventLog
    .slice(-160)
    .map(id => snapshot.events[id])
    .filter((ev): ev is SimEvent => Boolean(ev) && now - ev.tick <= 220)
    .map(ev => {
      const age = now - ev.tick;
      const recency = Math.max(0, 1 - age / 220);
      const big = biggestEmpire(snapshot, ev.relatedEmpireIds);
      const magnitude = big ? Math.min(2, big.size / 12) : 0;
      const score = (TYPE_WEIGHT[ev.type] ?? ev.importance) + ev.importance + recency * 3 + magnitude;
      return { ev, score, big };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  return (
    <div className="top-stories">
      <div className="top-stories-header">
        <h3>Top Stories</h3>
        <span>why it matters</span>
      </div>
      <div className="top-stories-list">
        {scored.map(({ ev, big }) => {
          const defining = ev.importance >= 4;
          return (
            <div key={ev.id} className={`story-card${defining ? " defining" : ""}${ev.id === selectedEventId ? " selected" : ""}`}>
              <button className="story-main" onClick={() => onSelectEvent(ev)} title={ev.description}>
                <div className="story-top">
                  {defining && <span className="story-flag">★ DEFINING</span>}
                  <span className="story-tick">St. Y {(25000 + ev.tick).toLocaleString("en-US")}</span>
                </div>
                <div className="story-title">{ev.title}</div>
                <div className="story-why">{reasonFor(ev, snapshot)}</div>
              </button>
              {big && (
                <button className="story-follow" title={`Follow ${big.name}`} onClick={() => onFollowEmpire(big.id)}>
                  ⌖ Follow {big.name}
                </button>
              )}
            </div>
          );
        })}
        {scored.length === 0 && <div className="event-empty">The galaxy is quiet for now.</div>}
      </div>
    </div>
  );
}
