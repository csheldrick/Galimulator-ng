import { test } from "node:test";
import assert from "node:assert/strict";
import type { GalaxyState, Id } from "../types/sim";
import { SeededRandom } from "./Random";
import { generateGalaxy } from "./Galaxy";
import { mergeEmpires } from "./Merge";
import { createSubjectRelation, subjectOf, subjectsOf } from "./SubjectRelations";

/** A small deterministic galaxy with enough empires to wire up subject ties by hand. */
function makeState(): GalaxyState {
  const rng = new SeededRandom(1337);
  return generateGalaxy(1337, 40, 6, rng);
}

function empireIds(state: GalaxyState, count: number): Id[] {
  const ids = Object.keys(state.empires);
  assert.ok(ids.length >= count, `fixture needs at least ${count} empires, got ${ids.length}`);
  return ids.slice(0, count);
}

function assertNoDanglingReference(state: GalaxyState, removedId: Id): void {
  for (const sr of Object.values(state.subjects ?? {})) {
    assert.notEqual(sr.subjectEmpireId, removedId, `relation ${sr.id} still references removed empire as subject`);
    assert.notEqual(sr.overlordEmpireId, removedId, `relation ${sr.id} still references removed empire as overlord`);
  }
}

test("absorbed empire's subject status transfers to the dominant empire", () => {
  const state = makeState();
  const [dominant, absorbed, overlord] = empireIds(state, 3);
  const sr = createSubjectRelation(state, absorbed, overlord, "vassal", state.tick);
  assert.ok(sr, "setup: absorbed should become overlord's vassal");

  mergeEmpires(state, dominant, absorbed);

  const rel = state.subjects![sr!.id];
  assert.ok(rel, "relation should survive the merge");
  assert.equal(rel.subjectEmpireId, dominant);
  assert.equal(rel.overlordEmpireId, overlord);
  assertNoDanglingReference(state, absorbed);
});

test("absorbed empire's own subjects transfer to the dominant empire as their new overlord", () => {
  const state = makeState();
  const [dominant, absorbed, vassal] = empireIds(state, 3);
  const sr = createSubjectRelation(state, vassal, absorbed, "tributary", state.tick);
  assert.ok(sr, "setup: absorbed should become vassal's overlord");

  mergeEmpires(state, dominant, absorbed);

  const rel = state.subjects![sr!.id];
  assert.ok(rel, "relation should survive the merge");
  assert.equal(rel.subjectEmpireId, vassal);
  assert.equal(rel.overlordEmpireId, dominant);
  assertNoDanglingReference(state, absorbed);
});

test("a direct subject tie between the dominant and absorbed empire collapses", () => {
  const state = makeState();
  const [dominant, absorbed] = empireIds(state, 2);
  const sr = createSubjectRelation(state, absorbed, dominant, "client-state", state.tick);
  assert.ok(sr, "setup: absorbed should become dominant's client-state");

  mergeEmpires(state, dominant, absorbed);

  assert.equal(state.subjects![sr!.id], undefined, "self-tie should be removed, not transferred");
  assertNoDanglingReference(state, absorbed);
  assert.equal(subjectOf(state, dominant), null, "dominant must not end up subject of itself");
  assert.equal(subjectsOf(state, dominant).length, 0);
});

test("a conflicting subject transfer is liberated instead of creating a second overlord", () => {
  const state = makeState();
  const [dominant, absorbed, overlord, thirdParty] = empireIds(state, 4);
  // Dominant is already someone else's subject, so absorbed's own subject status cannot transfer.
  const dominantTie = createSubjectRelation(state, dominant, thirdParty, "vassal", state.tick);
  assert.ok(dominantTie, "setup: dominant should already be thirdParty's vassal");
  const absorbedTie = createSubjectRelation(state, absorbed, overlord, "tributary", state.tick);
  assert.ok(absorbedTie, "setup: absorbed should be overlord's tributary");

  mergeEmpires(state, dominant, absorbed);

  assert.equal(state.subjects![absorbedTie!.id], undefined, "conflicting tie should be liberated, not transferred");
  assertNoDanglingReference(state, absorbed);
  // Dominant's own pre-existing subject relation must be untouched.
  assert.ok(state.subjects![dominantTie!.id], "dominant's unrelated subject tie must survive");
  assert.equal(subjectsOf(state, dominant).length, 0, "dominant must not end up with two overlords or a subject of its own");
});

test("a conflicting overlord transfer is liberated instead of creating a subject chain", () => {
  const state = makeState();
  const [dominant, absorbed, vassal, thirdParty] = empireIds(state, 4);
  // Dominant is already someone else's subject, so it cannot also become an overlord (no chains).
  const dominantTie = createSubjectRelation(state, dominant, thirdParty, "vassal", state.tick);
  assert.ok(dominantTie, "setup: dominant should already be thirdParty's vassal");
  const absorbedTie = createSubjectRelation(state, vassal, absorbed, "vassal", state.tick);
  assert.ok(absorbedTie, "setup: absorbed should be vassal's overlord");

  mergeEmpires(state, dominant, absorbed);

  assert.equal(state.subjects![absorbedTie!.id], undefined, "conflicting tie should be liberated, not transferred");
  assertNoDanglingReference(state, absorbed);
  assert.ok(state.subjects![dominantTie!.id], "dominant's unrelated subject tie must survive");
  assert.equal(subjectOf(state, dominant)!.overlordEmpireId, thirdParty, "dominant must keep its one overlord, not gain a second role");
});
