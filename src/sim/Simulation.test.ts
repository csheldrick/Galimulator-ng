import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "./Simulation";

test("sandbox empire creation keeps IDs unique after a same-tick merge", () => {
  const sim = new Simulation({ seed: 42, numStars: 80, numEmpires: 6, ticksPerSecond: 4 });
  const initial = sim.getLiveState();
  const neutralSystems = Object.values(initial.systems).filter(sys => sys.ownerEmpireId === null);
  const originalEmpireIds = Object.keys(initial.empires);
  assert.ok(neutralSystems.length >= 2, "fixture needs two neutral systems");
  assert.ok(originalEmpireIds.length >= 2, "fixture needs two original empires to merge");

  const firstSystem = neutralSystems[0];
  const secondSystem = neutralSystems[1];
  const firstId = sim.foundEmpireAtSystem(firstSystem.id);
  assert.ok(firstId, "first sandbox empire should be founded");
  const firstDynastyId = sim.getLiveState().empires[firstId].dynastyId;
  assert.ok(firstDynastyId, "first sandbox empire should have a dynasty");

  sim.forceMerge(originalEmpireIds[0], originalEmpireIds[1]);
  const secondId = sim.foundEmpireAtSystem(secondSystem.id);
  assert.ok(secondId, "second sandbox empire should be founded");

  const state = sim.getLiveState();
  assert.notEqual(secondId, firstId, "a reduced empire count must not reuse a live empire ID");
  assert.equal(state.systems[firstSystem.id].ownerEmpireId, firstId);
  assert.ok(state.empires[firstId].ownedSystemIds.includes(firstSystem.id));
  assert.equal(state.empires[firstId].dynastyId, firstDynastyId);
  assert.ok(state.dynasties?.[firstDynastyId].rulingEmpireIds.includes(firstId));
  assert.equal(state.systems[secondSystem.id].ownerEmpireId, secondId);
  assert.ok(state.empires[secondId].ownedSystemIds.includes(secondSystem.id));
});
