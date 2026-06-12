import type { EmpireRelationship, GalaxyState, Empire, Id, RelationModifierInput } from "../types/sim";
import { createEvent } from "./Events";
import {
  addRelationModifier,
  effectiveOpinion,
  effectiveTension,
  refreshStructuralModifiers,
} from "./Relations";
import { isSubjectPair, createSubjectRelation, subjectOf, subjectsOf } from "./Subjects";

function defaultRelationship(targetId: Id): EmpireRelationship {
  return {
    targetEmpireId: targetId,
    tension: 0,
    opinion: 50,
    atWar: false,
    modifiers: [],
  };
}

export function ensureEmpireRelationships(state: GalaxyState, refreshStandingModifiers = false): void {
  const empireList = Object.values(state.empires);
  for (const emp of empireList) {
    for (const other of empireList) {
      if (other.id === emp.id) continue;
      emp.relationshipByEmpireId[other.id] ??= defaultRelationship(other.id);
      if (refreshStandingModifiers) refreshStructuralModifiers(state, emp.relationshipByEmpireId[other.id], emp.id);
    }
  }
}

export function updateRelationships(state: GalaxyState): void {
  ensureEmpireRelationships(state);
  const empireList = Object.values(state.empires);
  for (const emp of empireList) {
    for (const other of empireList) {
      if (other.id === emp.id) continue;
      const rel = emp.relationshipByEmpireId[other.id];
      // base opinion drifts back toward neutral; war erodes it. Standing reasons
      // (faith, alliance, trade, common enemy) live as refreshed modifiers on top.
      if (rel.atWar) rel.opinion = Math.max(0, rel.opinion - 0.2);
      else rel.opinion += (50 - rel.opinion) * 0.005;
      refreshStructuralModifiers(state, rel, emp.id);
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

  // overlords and subjects never drift into ordinary war; only rebellion breaks the bond
  if (isSubjectPair(state, attacker.id, defenderId)) return;
  // subjects barred from declaring wars stay out of wars of choice
  const attackerBond = subjectOf(state, attacker.id);
  if (attackerBond && !attackerBond.canDeclareWars) return;

  // war/peace decisions read the *effective* relationship, so a grudge or an alliance shifts the odds
  const effOpinion = effectiveOpinion(rel, state.tick);
  const effTension = effectiveTension(rel, state.tick);
  const warChance = (attacker.aggression * 0.3 + effTension / 200) * (1.5 - effOpinion / 100);
  if (rng.next() > warChance) return;

  rel.atWar = true;
  rel.opinion = Math.max(0, rel.opinion - 25);
  const relBack = defender.relationshipByEmpireId[attacker.id];
  if (relBack) {
    relBack.atWar = true; relBack.opinion = Math.max(0, relBack.opinion - 25);
  }

  if (!attacker.activeWarEmpireIds.includes(defenderId))
    attacker.activeWarEmpireIds.push(defenderId);
  if (!defender.activeWarEmpireIds.includes(attacker.id))
    defender.activeWarEmpireIds.push(attacker.id);

  const ev = createEvent(
    state, state.tick, "war-declared",
    `War: ${attacker.name} vs ${defender.name}`,
    `${attacker.name} declared war on ${defender.name}.`,
    3, [attacker.id, defenderId], []
  );
  const warMod: RelationModifierInput = { kind: "war", label: "Recent war", opinionDelta: -20, tensionDelta: 15, expiresAtTick: state.tick + 600, sourceEventId: ev.id };
  addRelationModifier(rel, warMod);
  if (relBack) addRelationModifier(relBack, { ...warMod });
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
  const peaceChance = ((1 - empire.cohesion) * 0.05 + 0.005) * (0.5 + effectiveOpinion(rel, state.tick) / 100);
  if (rng.next() > peaceChance) return;

  rel.atWar = false;
  rel.tension = Math.max(0, rel.tension - 60);
  rel.opinion = Math.min(100, rel.opinion + 15);
  const relBack = enemy.relationshipByEmpireId[empire.id];
  if (relBack) {
    relBack.atWar = false; relBack.tension = Math.max(0, relBack.tension - 60); relBack.opinion = Math.min(100, relBack.opinion + 15);
  }

  empire.activeWarEmpireIds = empire.activeWarEmpireIds.filter(id => id !== enemyId);
  enemy.activeWarEmpireIds = enemy.activeWarEmpireIds.filter(id => id !== empire.id);

  const ev = createEvent(
    state, state.tick, "peace-signed",
    `Peace: ${empire.name} & ${enemy.name}`,
    `${empire.name} and ${enemy.name} signed a peace treaty.`,
    2, [empire.id, enemyId], []
  );
  // peace lingers as lowered tension; the recent-war grudge stays until it lapses
  const peaceMod: RelationModifierInput = { kind: "peace", label: "Recent peace", opinionDelta: 6, tensionDelta: -25, expiresAtTick: state.tick + 800, sourceEventId: ev.id };
  addRelationModifier(rel, peaceMod);
  if (relBack) addRelationModifier(relBack, { ...peaceMod });

  // one-sided peace: a badly outmatched loser may survive as a subject instead of a free equal
  maybeSubjugateLoser(state, empire, enemy, rng);
}

/** After a peace, a much weaker survivor sometimes becomes a vassal or tributary of the winner. */
function maybeSubjugateLoser(state: GalaxyState, a: Empire, b: Empire, rng: { next(): number }): void {
  const powerOf = (e: Empire) => e.militaryStrength + (e.militaryBonus ?? 0) + e.ownedSystemIds.length * 10;
  const [winner, loser] = powerOf(a) >= powerOf(b) ? [a, b] : [b, a];
  if (loser.ownedSystemIds.length < 1 || loser.ownedSystemIds.length > winner.ownedSystemIds.length * 0.5) return;
  if (powerOf(loser) > powerOf(winner) * 0.4) return;
  if (winner.cohesion < 0.4) return;
  if (subjectOf(state, loser.id) || subjectOf(state, winner.id) || subjectsOf(state, loser.id).length > 0) return;
  if (rng.next() > 0.35) return;
  const status = loser.ownedSystemIds.length <= 2 ? "vassal" : "tributary";
  createSubjectRelation(state, loser.id, winner.id, status, state.tick);
}
