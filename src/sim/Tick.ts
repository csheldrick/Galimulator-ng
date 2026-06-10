import type { GalaxyState, Empire, StarSystem, Id } from "../types/sim";
import type { PRNG } from "../types/sim";
import { createEvent } from "./Events";
import { updateRelationships, getNeighboringEmpires, tryDeclareWar, tryMakePeace } from "./Diplomacy";

function dist(a: StarSystem, b: StarSystem): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function findNearestUnowned(
  state: GalaxyState,
  empire: Empire,
  maxDist: number
): StarSystem | null {
  let best: StarSystem | null = null;
  let bestScore = -Infinity;

  for (const sys of Object.values(state.systems)) {
    if (sys.ownerEmpireId !== null) continue;
    let minD = Infinity;
    for (const ownedId of empire.ownedSystemIds) {
      const owned = state.systems[ownedId];
      if (!owned) continue;
      const d = dist(sys, owned);
      if (d < minD) minD = d;
    }
    if (minD > maxDist) continue;
    const score = (sys.habitability + sys.resources) / 2 - minD / 1000;
    if (score > bestScore) { bestScore = score; best = sys; }
  }
  return best;
}

function findBorderConflictTarget(
  state: GalaxyState,
  attacker: Empire,
  enemyId: Id
): StarSystem | null {
  const enemy = state.empires[enemyId];
  if (!enemy) return null;

  let best: StarSystem | null = null;
  let bestScore = -Infinity;

  for (const targetId of enemy.ownedSystemIds) {
    const target = state.systems[targetId];
    if (!target) continue;
    let minD = Infinity;
    for (const ownedId of attacker.ownedSystemIds) {
      const owned = state.systems[ownedId];
      if (!owned) continue;
      const d = dist(target, owned);
      if (d < minD) minD = d;
    }
    if (minD > 150) continue;
    const score = target.resources - minD / 500;
    if (score > bestScore) { bestScore = score; best = target; }
  }
  return best;
}

function stepGrowth(state: GalaxyState): void {
  for (const sys of Object.values(state.systems)) {
    if (sys.ownerEmpireId) {
      sys.population = Math.min(sys.population + 0.002 * sys.habitability, 2.0);
      sys.stability = Math.min(sys.stability + 0.001, 1.0);
    }
  }
  for (const emp of Object.values(state.empires)) {
    emp.wealth += emp.ownedSystemIds.reduce((s, id) => {
      const sys = state.systems[id];
      return s + (sys ? sys.resources * 2 : 0);
    }, 0);
    emp.wealth = Math.max(0, emp.wealth);
    emp.militaryStrength = emp.ownedSystemIds.length * 10 +
      emp.techLevel * 50 + emp.wealth * 0.05;
    emp.population = emp.ownedSystemIds.reduce(
      (s, id) => s + (state.systems[id]?.population ?? 0) * 1000, 0
    );
  }
}

function stepProgress(state: GalaxyState, rng: PRNG): void {
  for (const emp of Object.values(state.empires)) {
    if (emp.ownedSystemIds.length === 0) continue;

    const avgStability = emp.ownedSystemIds.reduce((sum, id) => sum + (state.systems[id]?.stability ?? 0), 0) / emp.ownedSystemIds.length;
    const avgResources = emp.ownedSystemIds.reduce((sum, id) => sum + (state.systems[id]?.resources ?? 0), 0) / emp.ownedSystemIds.length;
    const peaceBonus = emp.activeWarEmpireIds.length === 0 ? 1 : 0.35;
    const progressChance = 0.004 * emp.cohesion * avgStability * peaceBonus + 0.001 * avgResources;

    if (rng.next() < progressChance) {
      const gain = rng.range(0.03, 0.09);
      emp.techLevel = Math.min(3, emp.techLevel + gain);
      for (const id of emp.ownedSystemIds) {
        const sys = state.systems[id];
        if (sys) sys.techLevel = Math.max(sys.techLevel, emp.techLevel * rng.range(0.7, 1.0));
      }
      const cap = state.systems[emp.capitalSystemId];
      createEvent(state, state.tick, "technology-breakthrough",
        `${emp.name} advanced`,
        `${emp.name} made a technological breakthrough.`,
        3, [emp.id], cap ? [cap.id] : []
      );
    }

    const goldenChance = 0.002 * emp.cohesion * avgStability * peaceBonus * Math.min(emp.wealth / 500, 1.5);
    if (rng.next() < goldenChance) {
      emp.wealth += 120;
      emp.cohesion = Math.min(1, emp.cohesion + 0.04);
      for (const id of emp.ownedSystemIds.slice(0, 20)) {
        const sys = state.systems[id];
        if (sys) {
          sys.stability = Math.min(1, sys.stability + 0.04);
          sys.population = Math.min(2.5, sys.population + 0.03 * sys.habitability);
        }
      }
      const cap = state.systems[emp.capitalSystemId];
      createEvent(state, state.tick, "golden-age",
        `${emp.name} entered a golden age`,
        `${emp.name} prospered during a period of stability and wealth.`,
        3, [emp.id], cap ? [cap.id] : []
      );
    }
  }
}

function stepExpansion(state: GalaxyState, rng: PRNG): void {
  const MAX_EXPAND_DIST = 160;

  for (const emp of Object.values(state.empires)) {
    if (emp.wealth < 10) continue;
    const expandChance = emp.expansionism * 0.4 * emp.cohesion * Math.min(emp.wealth / 200, 1);
    if (rng.next() > expandChance) continue;

    const target = findNearestUnowned(state, emp, MAX_EXPAND_DIST);
    if (!target) continue;

    target.ownerEmpireId = emp.id;
    target.cultureId = emp.cultureId;
    emp.ownedSystemIds.push(target.id);
    emp.wealth -= 20;

    if (state.tick % 5 === 0 || rng.next() < 0.3) {
      createEvent(state, state.tick, "system-colonized",
        `${emp.name} colonized ${target.name}`,
        `${emp.name} expanded to ${target.name}.`,
        1, [emp.id], [target.id]
      );
    }
  }
}

function stepConflict(state: GalaxyState, rng: PRNG): void {
  updateRelationships(state);

  for (const emp of Object.values(state.empires)) {
    const neighbors = getNeighboringEmpires(state, emp.id);

    for (const neighborId of neighbors) {
      const rel = emp.relationshipByEmpireId[neighborId];
      if (!rel) continue;
      rel.tension = Math.min(100, rel.tension + emp.aggression * 2);

      if (!rel.atWar && rel.tension > 50) {
        tryDeclareWar(state, emp, neighborId, rng);
      }

      if (rel.atWar) {
        tryMakePeace(state, emp, neighborId, rng);

        if (rng.next() < 0.15) {
          resolveWarConflict(state, emp, neighborId, rng);
        }
      }
    }
    for (const rid of Object.keys(emp.relationshipByEmpireId)) {
      if (!neighbors.includes(rid)) {
        const r = emp.relationshipByEmpireId[rid];
        r.tension = Math.max(0, r.tension - 1);
      }
    }
  }
}

function resolveWarConflict(
  state: GalaxyState,
  attacker: Empire,
  defenderId: Id,
  rng: PRNG
): void {
  const defender = state.empires[defenderId];
  if (!defender) return;

  const target = findBorderConflictTarget(state, attacker, defenderId);
  if (!target) return;

  const atkPower = attacker.militaryStrength * (0.7 + rng.next() * 0.6);
  const defPower = defender.militaryStrength * (0.7 + rng.next() * 0.6);

  if (atkPower > defPower) {
    defender.ownedSystemIds = defender.ownedSystemIds.filter(id => id !== target.id);
    target.ownerEmpireId = attacker.id;
    attacker.ownedSystemIds.push(target.id);
    target.stability = Math.max(0.1, target.stability - 0.3);
    target.population = Math.max(0.05, target.population * 0.8);
    attacker.cohesion = Math.min(1, attacker.cohesion + 0.01);
    defender.cohesion = Math.max(0.1, defender.cohesion - 0.05);
    if (defender.capitalSystemId === target.id && defender.ownedSystemIds.length > 0) {
      defender.capitalSystemId = defender.ownedSystemIds[0];
    }

    createEvent(state, state.tick, "border-conflict",
      `${attacker.name} took ${target.name}`,
      `${attacker.name} seized ${target.name} from ${defender.name}.`,
      2, [attacker.id, defenderId], [target.id]
    );
  } else {
    attacker.cohesion = Math.max(0.1, attacker.cohesion - 0.03);
  }
}

function stepCollapse(state: GalaxyState, rng: PRNG): void {
  for (const emp of Object.values(state.empires)) {
    if (emp.ownedSystemIds.length === 0) {
      collapseEmpire(state, emp);
      continue;
    }

    const overextension = Math.max(0, emp.ownedSystemIds.length - 15) * 0.005;
    const warStrain = emp.activeWarEmpireIds.length * 0.02;
    const collapseRisk = (1 - emp.cohesion) * 0.05 + overextension + warStrain;

    if (rng.next() > collapseRisk * 0.1) continue;

    if (emp.ownedSystemIds.length > 4 && rng.next() < 0.5) {
      spawnRebellion(state, emp, rng);
    } else if (emp.cohesion < 0.2 && emp.ownedSystemIds.length > 2) {
      collapseEmpire(state, emp);
    }
  }
}

function spawnRebellion(state: GalaxyState, empire: Empire, rng: PRNG): void {
  const numDefect = rng.nextInt(1, Math.max(1, Math.floor(empire.ownedSystemIds.length / 3)));
  const defectingSet = new Set<Id>();

  for (let i = 0; i < numDefect; i++) {
    const idx = rng.nextInt(0, empire.ownedSystemIds.length - 1);
    const sysId = empire.ownedSystemIds[idx];
    if (sysId !== empire.capitalSystemId) defectingSet.add(sysId);
  }
  const defecting = [...defectingSet];
  if (defecting.length === 0) return;

  const newId = `${empire.id}-rebel-${state.tick}`;
  const rebelNames = [
    "Liberation Front","Free States","Rebel Council","Independence Movement",
    "Separatist League","Resistance","New Order","Sovereign Collective"
  ];
  const nameAdj = rng.pick(["Broken","Free","New","Rogue","Rising","Lost"]);
  const nameNoun = rng.pick(rebelNames);

  const newEmpire: Empire = {
    id: newId,
    name: `${nameAdj} ${nameNoun}`,
    color: `hsl(${rng.nextInt(0, 360)},${rng.nextInt(50, 90)}%,${rng.nextInt(35, 65)}%)`,
    capitalSystemId: defecting[0],
    ownedSystemIds: [],
    population: 0,
    wealth: 50,
    militaryStrength: 30,
    cohesion: rng.range(0.4, 0.8),
    aggression: rng.range(0.3, 0.8),
    expansionism: rng.range(0.3, 0.7),
    techLevel: empire.techLevel * 0.8,
    cultureId: `culture-rebel-${newId}`,
    relationshipByEmpireId: {},
    activeWarEmpireIds: [],
    historicalEventIds: [],
  };

  for (const sysId of defecting) {
    const sys = state.systems[sysId];
    if (!sys) continue;
    empire.ownedSystemIds = empire.ownedSystemIds.filter(id => id !== sysId);
    sys.ownerEmpireId = newId;
    sys.cultureId = newEmpire.cultureId;
    newEmpire.ownedSystemIds.push(sysId);
  }
  state.empires[newId] = newEmpire;
  empire.cohesion = Math.max(0.1, empire.cohesion - 0.2);

  createEvent(state, state.tick, "rebellion",
    `Rebellion in ${empire.name}`,
    `${newEmpire.name} broke away from ${empire.name}.`,
    4, [empire.id, newId], defecting
  );
}

function collapseEmpire(state: GalaxyState, empire: Empire): void {
  for (const sysId of empire.ownedSystemIds) {
    const sys = state.systems[sysId];
    if (!sys) continue;
    sys.ownerEmpireId = null;
    sys.stability = Math.max(0.1, sys.stability - 0.3);
  }
  createEvent(state, state.tick, "empire-collapsed",
    `${empire.name} collapsed`,
    `${empire.name} has disintegrated.`,
    5, [empire.id], empire.ownedSystemIds
  );
  delete state.empires[empire.id];
  for (const other of Object.values(state.empires)) {
    delete other.relationshipByEmpireId[empire.id];
    other.activeWarEmpireIds = other.activeWarEmpireIds.filter(id => id !== empire.id);
  }
}

export function executeTick(state: GalaxyState, rng: PRNG): void {
  stepGrowth(state);
  stepProgress(state, rng);
  stepExpansion(state, rng);
  stepConflict(state, rng);
  stepCollapse(state, rng);
  state.tick++;
}
