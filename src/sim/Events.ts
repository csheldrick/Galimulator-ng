import type { GalaxyState, SimEvent, Id, EventType } from "../types/sim";

let _eventCounter = 0;

// Called when a galaxy is (re)generated so event ids stay deterministic per seed.
export function resetEventCounter(): void {
  _eventCounter = 0;
  _sinceGc = 0;
}

// Saved games restore the counter so event ids keep incrementing without collisions.
export function getEventCounter(): number { return _eventCounter; }
export function setEventCounter(value: number): void { _eventCounter = Math.max(0, Math.floor(value)); }

const EVENT_LOG_LIMIT = 240;
const EMPIRE_HISTORY_LIMIT = 20;
const SYSTEM_RECENT_LIMIT = 5;

// Run a full sweep this often (in events created). The id lists that reference
// events are all bounded, so between sweeps at most this many orphans accumulate.
const GC_INTERVAL = 128;
let _sinceGc = 0;

function retainTail(ids: Id[], limit: number): Id[] {
  return ids.length > limit ? ids.slice(-limit) : ids;
}

// The UI only renders the recent global log, a short per-empire history, and a
// handful of recent system events. Keep those references tight, then drop any
// event object no retained list still points at so snapshots stay bounded.
export function gcEvents(state: GalaxyState): void {
  state.eventLog = retainTail(state.eventLog, EVENT_LOG_LIMIT);
  const referenced = new Set<Id>(state.eventLog);
  for (const emp of Object.values(state.empires)) {
    emp.historicalEventIds = retainTail(emp.historicalEventIds, EMPIRE_HISTORY_LIMIT);
    for (const eid of emp.historicalEventIds) referenced.add(eid);
  }
  for (const sys of Object.values(state.systems)) {
    sys.recentEventIds = retainTail(sys.recentEventIds, SYSTEM_RECENT_LIMIT);
    for (const eid of sys.recentEventIds) referenced.add(eid);
  }
  for (const eid of Object.keys(state.events)) {
    if (!referenced.has(eid)) delete state.events[eid];
  }
}

export function createEvent(
  state: GalaxyState,
  tick: number,
  type: EventType,
  title: string,
  description: string,
  importance: number,
  relatedEmpireIds: Id[],
  relatedSystemIds: Id[]
): SimEvent {
  const id = `evt-${tick}-${_eventCounter++}`;
  const event: SimEvent = {
    id, tick, type, title, description, importance,
    relatedEmpireIds, relatedSystemIds,
  };
  state.events[id] = event;
  state.eventLog.push(id);
  if (state.eventLog.length > EVENT_LOG_LIMIT) state.eventLog.shift();

  for (const eid of relatedEmpireIds) {
    const emp = state.empires[eid];
    if (emp) {
      emp.historicalEventIds.push(id);
      if (emp.historicalEventIds.length > EMPIRE_HISTORY_LIMIT) emp.historicalEventIds.shift();
    }
  }
  for (const sid of relatedSystemIds) {
    const sys = state.systems[sid];
    if (sys) {
      sys.recentEventIds.push(id);
      if (sys.recentEventIds.length > SYSTEM_RECENT_LIMIT) sys.recentEventIds.shift();
    }
  }

  // Amortized cleanup of orphaned events so state.events stays bounded.
  if (++_sinceGc >= GC_INTERVAL) { _sinceGc = 0; gcEvents(state); }

  return event;
}
