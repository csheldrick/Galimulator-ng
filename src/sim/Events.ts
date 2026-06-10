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

// Run a full sweep this often (in events created). The id lists that reference
// events are all bounded, so between sweeps at most this many orphans accumulate.
const GC_INTERVAL = 256;
let _sinceGc = 0;

// The event objects in state.events are only ever reachable through the bounded
// id lists below (eventLog, per-empire history, per-system recent events). Once
// an id ages out of every list its object is orphaned. Nothing deletes it, so
// state.events grows without bound over a long run and eventually OOM-crashes
// the tab. This sweep drops any event no list still references.
export function gcEvents(state: GalaxyState): void {
  const referenced = new Set<Id>(state.eventLog);
  for (const emp of Object.values(state.empires)) {
    for (const eid of emp.historicalEventIds) referenced.add(eid);
  }
  for (const sys of Object.values(state.systems)) {
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
  // keep log bounded
  if (state.eventLog.length > 500) state.eventLog.shift();

  for (const eid of relatedEmpireIds) {
    const emp = state.empires[eid];
    if (emp) {
      emp.historicalEventIds.push(id);
      if (emp.historicalEventIds.length > 100) emp.historicalEventIds.shift();
    }
  }
  for (const sid of relatedSystemIds) {
    const sys = state.systems[sid];
    if (sys) {
      sys.recentEventIds.push(id);
      if (sys.recentEventIds.length > 20) sys.recentEventIds.shift();
    }
  }

  // Amortized cleanup of orphaned events so state.events stays bounded.
  if (++_sinceGc >= GC_INTERVAL) { _sinceGc = 0; gcEvents(state); }

  return event;
}
