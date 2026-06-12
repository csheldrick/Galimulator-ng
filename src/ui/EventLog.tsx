import type { GalaxyState, Id, SimEvent } from "../types/sim";

interface Props {
  snapshot: Readonly<GalaxyState>;
  minImportance?: number;
  onMinImportanceChange?: (v: number) => void;
  selectedEventId: Id | null;
  onSelectEvent: (event: SimEvent) => void;
}

const TYPE_COLORS: Record<string, string> = {
  "empire-founded": "#4cc9f0",
  "system-colonized": "#8ac926",
  "border-conflict": "#f4a261",
  "war-declared": "#e63946",
  "peace-signed": "#2a9d8f",
  "empire-collapsed": "#9b2226",
  "rebellion": "#e9c46a",
  "faction-formed": "#f4a261",
  "faction-engaged": "#ffd166",
  "faction-uprising": "#e9c46a",
  "faction-dissolved": "#b7c3d0",
  "subject-created": "#7fb5ff",
  "subject-rebelled": "#ff7b54",
  "subject-integrated": "#4d96ff",
  "subject-liberated": "#80ed99",
  "meteor-strike": "#ff9f1c",
  "golden-age": "#ffd166",
  "technology-breakthrough": "#6a4c93",
  "succession": "#c8b6ff",
  "mood-shift": "#90e0ef",
  "transcended": "#f9f871",
  "religion-founded": "#c77dff",
  "religion-adopted": "#9b5de5",
  "trade-established": "#ffd166",
  "trade-severed": "#bc6c25",
  "monster-spawned": "#d00000",
  "monster-attack": "#ff4d6d",
  "monster-slain": "#80ed99",
  "artifact-discovered": "#ffe066",
  "galactic-crisis": "#ff9f1c",
  "coup": "#f15bb5",
  "character-rose": "#ffe066",
  "character-fell": "#9aa5b8",
  "empire-merged": "#4d96ff",
  "quest-launched": "#90e0ef",
  "quest-completed": "#80ffdb",
  "dynasty-founded": "#ffc8a0",
  "heir-born": "#ffd6c0",
  "dynastic-marriage": "#ffb3d9",
  "heir-died": "#c89c8c",
  "succession-crisis": "#ffaa66",
  "pretender-revolt": "#ff8c66",
  "dynasty-restored": "#a0e0c0",
  "dynasty-extinct": "#b08c9c",
};

export function EventLog({
  snapshot,
  minImportance = 1,
  onMinImportanceChange,
  selectedEventId,
  onSelectEvent,
}: Props) {
  const events = [...snapshot.eventLog]
    .reverse()
    .slice(0, 120)
    .map(id => snapshot.events[id])
    .filter(ev => ev && ev.importance >= minImportance);

  return (
    <div className="event-log">
      <div className="event-log-header">
        <h3>Event Log</h3>
        {onMinImportanceChange && (
          <select
            value={minImportance}
            onChange={e => onMinImportanceChange(Number(e.target.value))}
          >
            <option value={1}>All</option>
            <option value={2}>Minor+</option>
            <option value={3}>Major+</option>
            <option value={4}>Critical</option>
          </select>
        )}
      </div>
      <div className="event-list">
        {events.map(ev => {
          const selected = ev.id === selectedEventId;
          const tier = ev.importance >= 5 ? " defining" : ev.importance >= 4 ? " major" : "";
          return (
            <button
              key={ev.id}
              className={`event-entry${tier}${selected ? " selected" : ""}`}
              onClick={() => onSelectEvent(ev)}
              title={ev.description}
            >
              <span
                className="event-type-dot"
                style={{ background: TYPE_COLORS[ev.type] ?? "#888" }}
                title={ev.type}
              />
              <span className="event-tick">[{ev.tick}]</span>
              <span className="event-main">
                <span className="event-title">{ev.title}</span>
                <span className="event-desc">{ev.description}</span>
              </span>
            </button>
          );
        })}
        {events.length === 0 && <div className="event-empty">No events yet.</div>}
      </div>
    </div>
  );
}
