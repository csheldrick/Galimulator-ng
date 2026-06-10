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
  const NEIGHBOR_DIST = 120;

  for (const sysId of empire.ownedSystemIds) {
    const sys = state.systems[sysId];
    for (const other of Object.values(state.systems)) {
      if (other.ownerEmpireId && other.ownerEmpireId !== empireId) {
        const dx = sys.x - other.x;
        const dy = sys.y - other.y;
        if (Math.sqrt(dx * dx + dy * dy) < NEIGHBOR_DIST) {
          neighbors.add(other.ownerEmpireId);
        }
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

  const warChance = attacker.aggression * 0.3 + rel.tension / 200;
  if (rng.next() > warChance) return;

  rel.atWar = true;
  const relBack = defender.relationshipByEmpireId[attacker.id];
  if (relBack) relBack.atWar = true;

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

  // peace more likely when both sides weakened
  const peaceChance = (1 - empire.cohesion) * 0.05 + 0.005;
  if (rng.next() > peaceChance) return;

  rel.atWar = false;
  rel.tension = Math.max(0, rel.tension - 30);
  const relBack = enemy.relationshipByEmpireId[empire.id];
  if (relBack) { relBack.atWar = false; relBack.tension = Math.max(0, relBack.tension - 30); }

  empire.activeWarEmpireIds = empire.activeWarEmpireIds.filter(id => id !== enemyId);
  enemy.activeWarEmpireIds = enemy.activeWarEmpireIds.filter(id => id !== empire.id);

  createEvent(
    state, state.tick, "peace-signed",
    `Peace: ${empire.name} & ${enemy.name}`,
    `${empire.name} and ${enemy.name} signed a peace treaty.`,
    2, [empire.id, enemyId], []
  );
}
