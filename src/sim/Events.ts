import type { GalaxyState, SimEvent, Id, EventType } from "../types/sim";

let _eventCounter = 0;

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
  return event;
}
