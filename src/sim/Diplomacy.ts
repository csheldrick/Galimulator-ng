import type { GalaxyState, Empire, Id } from "../types/sim";
import { createEvent } from "./Events";

export function updateRelationships(state: GalaxyState): void {
  const empireList = Object.values(state.empires);
  for (const emp of empireList) {
    for (const other of empireList) {
      if (other.id === emp.id) continue;
      if (!emp.relationshipByEmpireId[other.id]) {
        emp.relationshipByEmpireId[other.id] = {
          targetEmpireId: other.id,
          tension: 0,
          opinion: 50,
          atWar: false,
        };
      }
      const rel = emp.relationshipByEmpireId[other.id];
      // opinion drifts back toward neutral; war erodes it
      if (rel.atWar) rel.opinion = Math.max(0, rel.opinion - 0.2);
      else rel.opinion += (50 - rel.opinion) * 0.005;
    }
  }
}

export function getNeighboringEmpires(
  state: GalaxyState,
  empireId: Id
): Id[] {
  const empire = state.empires[empireId];
  if (!empire) return [];
  const neighbors = new Set<Id>();

  // neighbors share a starlane with our territory
  for (const sysId of empire.ownedSystemIds) {
    const sys = state.systems[sysId];
    if (!sys) continue;
    for (const nid of sys.connectedSystemIds) {
      const other = state.systems[nid];
      if (other?.ownerEmpireId && other.ownerEmpireId !== empireId) {
        neighbors.add(other.ownerEmpireId);
      }
    }
  }
  return [...neighbors];
}

export function tryDeclareWar(
  state: GalaxyState,
  attacker: Empire,
  defenderId: Id,
  rng: { next(): number; range(a: number, b: number): number }
): void {
  const defender = state.empires[defenderId];
  if (!defender) return;

  const rel = attacker.relationshipByEmpireId[defenderId];
  if (!rel || rel.atWar) return;

  const warChance = (attacker.aggression * 0.3 + rel.tension / 200) * (1.5 - rel.opinion / 100);
  if (rng.next() > warChance) return;

  rel.atWar = true;
  rel.opinion = Math.max(0, rel.opinion - 25);
  const relBack = defender.relationshipByEmpireId[attacker.id];
  if (relBack) { relBack.atWar = true; relBack.opinion = Math.max(0, relBack.opinion - 25); }

  if (!attacker.activeWarEmpireIds.includes(defenderId))
    attacker.activeWarEmpireIds.push(defenderId);
  if (!defender.activeWarEmpireIds.includes(attacker.id))
    defender.activeWarEmpireIds.push(attacker.id);

  createEvent(
    state, state.tick, "war-declared",
    `War: ${attacker.name} vs ${defender.name}`,
    `${attacker.name} declared war on ${defender.name}.`,
    3, [attacker.id, defenderId], []
  );
}

export function tryMakePeace(
  state: GalaxyState,
  empire: Empire,
  enemyId: Id,
  rng: { next(): number }
): void {
  const enemy = state.empires[enemyId];
  if (!enemy) return;
  const rel = empire.relationshipByEmpireId[enemyId];
  if (!rel || !rel.atWar) return;

  // peace more likely when weakened or when grudges are mild
  const peaceChance = ((1 - empire.cohesion) * 0.05 + 0.005) * (0.5 + rel.opinion / 100);
  if (rng.next() > peaceChance) return;

  rel.atWar = false;
  rel.tension = Math.max(0, rel.tension - 30);
  rel.opinion = Math.min(100, rel.opinion + 15);
  const relBack = enemy.relationshipByEmpireId[empire.id];
  if (relBack) { relBack.atWar = false; relBack.tension = Math.max(0, relBack.tension - 30); relBack.opinion = Math.min(100, relBack.opinion + 15); }

  empire.activeWarEmpireIds = empire.activeWarEmpireIds.filter(id => id !== enemyId);
  enemy.activeWarEmpireIds = enemy.activeWarEmpireIds.filter(id => id !== empire.id);

  createEvent(
    state, state.tick, "peace-signed",
    `Peace: ${empire.name} & ${enemy.name}`,
    `${empire.name} and ${enemy.name} signed a peace treaty.`,
    2, [empire.id, enemyId], []
  );
}
