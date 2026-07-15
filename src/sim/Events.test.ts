import { test } from "node:test";
import assert from "node:assert/strict";
import type { GalaxyState, Id } from "../types/sim";
import { SeededRandom } from "./Random";
import { generateGalaxy } from "./Galaxy";
import { createEvent, gcEvents } from "./Events";
import { createSubjectRelation } from "./SubjectRelations";
import { formFaction } from "./Tick";

function makeState(): GalaxyState {
  const rng = new SeededRandom(2024);
  return generateGalaxy(2024, 40, 6, rng);
}

function empireIds(state: GalaxyState, count: number): Id[] {
  const ids = Object.keys(state.empires);
  assert.ok(ids.length >= count, `fixture needs at least ${count} empires, got ${ids.length}`);
  return ids.slice(0, count);
}

/** Push enough throwaway events, touching the given empires/systems, to age a prior
 *  event out of the eventLog and every empire/system history tail list. Isolates
 *  whichever longer-lived reference (modifier, faction, subject relation) we're
 *  testing gcEvents against as the *only* thing still pointing at it. */
function flushWithFillerEvents(state: GalaxyState, relatedEmpireIds: Id[] = [], relatedSystemIds: Id[] = []): void {
  for (let i = 0; i < 300; i++) {
    createEvent(state, state.tick, "empire-founded", "filler", "filler", 1, relatedEmpireIds, relatedSystemIds);
  }
}

test("gcEvents keeps an event still pointed at by a relationship modifier's sourceEventId", () => {
  const state = makeState();
  const [a, b] = empireIds(state, 2);
  const empA = state.empires[a];

  const modEvent = createEvent(state, state.tick, "diplomatic-incident", "incident", "d", 1, [], []);
  empA.relationshipByEmpireId[b] = {
    targetEmpireId: b, tension: 0, opinion: 50, atWar: false,
    modifiers: [{ id: "relmod-test", kind: "grievance", label: "test grievance", opinionDelta: -10, tensionDelta: 20, sourceEventId: modEvent.id }],
  };

  flushWithFillerEvents(state);
  gcEvents(state);

  assert.ok(state.events[modEvent.id], "event referenced only by a modifier's sourceEventId must survive GC");
});

test("gcEvents keeps an event still pointed at by a faction's historicalEventIds", () => {
  const state = makeState();
  const [a] = empireIds(state, 1);
  const emp = state.empires[a];
  const sys = state.systems[emp.capitalSystemId];
  const rng = new SeededRandom(7);

  formFaction(state, emp, sys, rng);
  const faction = Object.values(state.factions ?? {})[0];
  assert.ok(faction, "setup: formFaction should create a faction");
  const factionEventId = faction.historicalEventIds[0];
  assert.ok(factionEventId, "setup: faction should record its formation event");

  // Evict the formation event from emp.historicalEventIds and sys.recentEventIds so
  // the faction's own historicalEventIds is the only thing still pointing at it.
  flushWithFillerEvents(state, [a], [sys.id]);
  gcEvents(state);

  assert.ok(state.events[factionEventId], "event referenced only by a faction's historicalEventIds must survive GC");
});

test("gcEvents keeps an event still pointed at by a subject relation's historicalEventIds", () => {
  const state = makeState();
  const [subjectId, overlordId] = empireIds(state, 2);

  const rel = createSubjectRelation(state, subjectId, overlordId, "vassal", state.tick);
  assert.ok(rel, "setup: subject relation should be created");
  const subjectEventId = rel!.historicalEventIds[0];
  assert.ok(subjectEventId, "setup: subject relation should record its creation event");

  // Evict the creation event from both empires' historicalEventIds so the subject
  // relation's own historicalEventIds is the only thing still pointing at it.
  flushWithFillerEvents(state, [subjectId, overlordId]);
  gcEvents(state);

  assert.ok(state.events[subjectEventId], "event referenced only by a subject relation's historicalEventIds must survive GC");
});

test("gcEvents still drops events with no surviving reference at all", () => {
  const state = makeState();
  const orphan = createEvent(state, state.tick, "empire-founded", "orphan", "d", 1, [], []);

  flushWithFillerEvents(state);
  gcEvents(state);

  assert.equal(state.events[orphan.id], undefined, "an event with no surviving reference should still be collected");
});
