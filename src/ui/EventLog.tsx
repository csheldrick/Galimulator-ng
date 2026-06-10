import type { GalaxyState } from "../types/sim";

interface Props {
  snapshot: Readonly<GalaxyState>;
  minImportance?: number;
  onMinImportanceChange?: (v: number) => void;
}

const TYPE_COLORS: Record<string, string> = {
  "empire-founded": "#4cc9f0",
  "system-colonized": "#8ac926",
  "border-conflict": "#f4a261",
  "war-declared": "#e63946",
  "peace-signed": "#2a9d8f",
  "empire-collapsed": "#9b2226",
  "rebellion": "#e9c46a",
  "golden-age": "#ffd166",
  "technology-breakthrough": "#6a4c93",
};

export function EventLog({ snapshot, minImportance = 1, onMinImportanceChange }: Props) {
  const events = [...snapshot.eventLog]
    .reverse()
    .slice(0, 80)
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
        {events.map(ev => (
          <div key={ev.id} className="event-entry">
            <span
              className="event-type-dot"
              style={{ background: TYPE_COLORS[ev.type] ?? "#888" }}
              title={ev.type}
            />
            <span className="event-tick">[{ev.tick}]</span>
            <span className="event-title">{ev.title}</span>
          </div>
        ))}
        {events.length === 0 && <div className="event-empty">No events yet.</div>}
      </div>
    </div>
  );
}
