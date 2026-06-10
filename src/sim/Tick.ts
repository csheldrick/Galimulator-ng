import type { GalaxyState, Empire, StarSystem, Id, Fleet, FleetKind, EmpireMood } from "../types/sim";
import type { PRNG } from "../types/sim";
import { createEvent } from "./Events";
import { updateRelationships, getNeighboringEmpires, tryDeclareWar, tryMakePeace } from "./Diplomacy";
import { makeName, makeRuler, makeEmpireName } from "./Galaxy";
import { MOOD_LABEL, MOOD_FLAVOR, rulerDisplayName } from "./Moods";

function dist(a: StarSystem, b: StarSystem): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function fleetName(kind: FleetKind, empire: Empire, target: StarSystem, rng: PRNG): string {
  const banner = empire.name.split(" ")[0] ?? "Imperial";
  const prefix = kind === "war" ? rng.pick(["Spear", "Hammer", "Vanguard", "Dagger", "Iron"])
    : rng.pick(["Hope", "Horizon", "Seed", "Dawn", "Pilgrim"]);
  const suffix = kind === "war" ? rng.pick(["Strike Fleet", "Battle Group", "Expedition", "Armada"])
    : rng.pick(["Colony Fleet", "Settler Wing", "Migration", "Expedition"]);
  return `${banner} ${prefix} ${suffix} to ${target.name}`;
}

// Expansion follows starlanes: only unowned systems directly linked to the
// empire's territory are candidates, so empires grow as contiguous regions.
function findExpansionTarget(state: GalaxyState, empire: Empire): { origin: StarSystem; target: StarSystem } | null {
  let best: { origin: StarSystem; target: StarSystem } | null = null;
  let bestScore = -Infinity;
  for (const ownedId of empire.ownedSystemIds) {
    const owned = state.systems[ownedId];
    if (!owned) continue;
    for (const nid of owned.connectedSystemIds) {
      const sys = state.systems[nid];
      if (!sys || sys.ownerEmpireId !== null) continue;
      const score = (sys.habitability + sys.resources) / 2;
      if (score > bestScore) { bestScore = score; best = { origin: owned, target: sys }; }
    }
  }
  return best;
}

// Breadth-first route along starlanes. The lane graph is fully connected,
// but fall back to a direct hop just in case.
function findPath(state: GalaxyState, originId: Id, targetId: Id): Id[] {
  if (originId === targetId) return [originId];
  const cameFrom: Record<Id, Id> = {};
  const visited = new Set<Id>([originId]);
  const queue: Id[] = [originId];
  while (queue.length) {
    const cur = queue.shift()!;
    const sys = state.systems[cur];
    if (!sys) continue;
    for (const nid of sys.connectedSystemIds) {
      if (visited.has(nid)) continue;
      visited.add(nid);
      cameFrom[nid] = cur;
      if (nid === targetId) {
        const path: Id[] = [targetId];
        let step: Id = targetId;
        while (step !== originId) { step = cameFrom[step]; path.push(step); }
        return path.reverse();
      }
      queue.push(nid);
    }
  }
  return [originId, targetId];
}

function pathLength(state: GalaxyState, path: Id[]): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = state.systems[path[i]], b = state.systems[path[i + 1]];
    if (a && b) total += dist(a, b);
  }
  return total;
}

function nearestOwnedTo(state: GalaxyState, empire: Empire, target: StarSystem): StarSystem | null {
  let best: StarSystem | null = null;
  let bestD = Infinity;
  for (const ownedId of empire.ownedSystemIds) {
    const sys = state.systems[ownedId];
    if (!sys) continue;
    const d = dist(sys, target);
    if (d < bestD) { bestD = d; best = sys; }
  }
  return best;
}

// War fleets push along the lane front: enemy systems directly linked to the
// attacker's territory are preferred; otherwise fall back to nearby targets.
function findBorderConflictTarget(state: GalaxyState, attacker: Empire, enemyId: Id): StarSystem | null {
  let best: StarSystem | null = null;
  let bestScore = -Infinity;
  for (const ownedId of attacker.ownedSystemIds) {
    const owned = state.systems[ownedId];
    if (!owned) continue;
    for (const nid of owned.connectedSystemIds) {
      const target = state.systems[nid];
      if (!target || target.ownerEmpireId !== enemyId) continue;
      const score = target.resources + (1 - target.stability) * 0.5;
      if (score > bestScore) { bestScore = score; best = target; }
    }
  }
  if (best) return best;
  const enemy = state.empires[enemyId];
  if (!enemy) return null;
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
    if (minD > 200) continue;
    const score = target.resources - minD / 500;
    if (score > bestScore) { bestScore = score; best = target; }
  }
  return best;
}

function hasFleetTo(state: GalaxyState, ownerEmpireId: Id, targetSystemId: Id, kind?: FleetKind): boolean {
  return Object.values(state.fleets).some(f => f.ownerEmpireId === ownerEmpireId && f.targetSystemId === targetSystemId && (!kind || f.kind === kind));
}

function launchFleet(state: GalaxyState, empire: Empire, origin: StarSystem, target: StarSystem, kind: FleetKind, strength: number, rng: PRNG): void {
  if (hasFleetTo(state, empire.id, target.id, kind)) return;
  const id = `fleet-${state.tick}-${Object.keys(state.fleets).length}-${rng.nextInt(0, 9999)}`;
  const path = findPath(state, origin.id, target.id);
  const fleet: Fleet = {
    id,
    name: fleetName(kind, empire, target, rng),
    kind,
    ownerEmpireId: empire.id,
    originSystemId: origin.id,
    targetSystemId: target.id,
    path,
    legIndex: 0,
    legProgress: 0,
    totalDist: Math.max(1, pathLength(state, path)),
    x: origin.x,
    y: origin.y,
    progress: 0,
    speed: rng.range(1.4, 2.8) + empire.techLevel * 0.5,
    strength,
    createdTick: state.tick,
  };
  state.fleets[id] = fleet;
}

function stepGrowth(state: GalaxyState): void {
  for (const sys of Object.values(state.systems)) {
    if (sys.ownerEmpireId) {
      sys.population = Math.min(sys.population + 0.002 * sys.habitability, 2.0);
      sys.stability = Math.min(sys.stability + 0.001, 1.0);
    }
  }
  for (const emp of Object.values(state.empires)) {
    emp.wealth += emp.ownedSystemIds.reduce((s, id) => s + ((state.systems[id]?.resources ?? 0) * 2), 0);
    emp.wealth = Math.max(0, emp.wealth);
    const militaryMood = emp.mood === "fortifying" ? 1.25 : emp.mood === "crusading" ? 1.1 : emp.mood === "rioting" ? 0.75 : 1;
    emp.militaryStrength = (emp.ownedSystemIds.length * 10 + emp.techLevel * 50 + emp.wealth * 0.05) * militaryMood;
    emp.population = emp.ownedSystemIds.reduce((s, id) => s + (state.systems[id]?.population ?? 0) * 1000, 0);
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
      createEvent(state, state.tick, "technology-breakthrough", `${emp.name} advanced`, `${emp.name} made a technological breakthrough.`, 3, [emp.id], cap ? [cap.id] : []);
    }
    const goldenChance = 0.002 * emp.cohesion * avgStability * peaceBonus * Math.min(emp.wealth / 500, 1.5);
    if (rng.next() < goldenChance) {
      emp.wealth += 120;
      emp.cohesion = Math.min(1, emp.cohesion + 0.04);
      for (const id of emp.ownedSystemIds.slice(0, 20)) {
        const sys = state.systems[id];
        if (sys) { sys.stability = Math.min(1, sys.stability + 0.04); sys.population = Math.min(2.5, sys.population + 0.03 * sys.habitability); }
      }
      const cap = state.systems[emp.capitalSystemId];
      createEvent(state, state.tick, "golden-age", `${emp.name} entered a golden age`, `${emp.name} prospered during a period of stability and wealth.`, 3, [emp.id], cap ? [cap.id] : []);
    }
  }
}

const EXPANSION_MOOD_MULT: Record<EmpireMood, number> = {
  expanding: 1.7, fortifying: 0.25, degenerating: 0.5, rioting: 0.15, crusading: 0.6, transcending: 0.2,
};

function stepExpansion(state: GalaxyState, rng: PRNG): void {
  for (const emp of Object.values(state.empires)) {
    if (emp.wealth < 18 || emp.ownedSystemIds.length === 0) continue;
    const expandChance = emp.expansionism * 0.22 * emp.cohesion * Math.min(emp.wealth / 250, 1) * EXPANSION_MOOD_MULT[emp.mood];
    if (rng.next() > expandChance) continue;
    const found = findExpansionTarget(state, emp);
    if (!found || hasFleetTo(state, emp.id, found.target.id)) continue;
    launchFleet(state, emp, found.origin, found.target, "colonizer", 8 + emp.techLevel * 6, rng);
    emp.wealth -= 8;
  }
}

function stepConflict(state: GalaxyState, rng: PRNG): void {
  updateRelationships(state);
  for (const emp of Object.values(state.empires)) {
    const neighbors = getNeighboringEmpires(state, emp.id);
    const tensionMood = emp.mood === "crusading" ? 2 : emp.mood === "fortifying" ? 0.6 : emp.mood === "transcending" ? 0.3 : 1;
    const warFleetChance = emp.mood === "crusading" ? 0.3 : emp.mood === "fortifying" ? 0.08 : emp.mood === "transcending" ? 0.04 : 0.16;
    for (const neighborId of neighbors) {
      const rel = emp.relationshipByEmpireId[neighborId];
      if (!rel) continue;
      rel.tension = Math.min(100, rel.tension + emp.aggression * 2 * tensionMood);
      if (!rel.atWar && rel.tension > 50) tryDeclareWar(state, emp, neighborId, rng);
      if (rel.atWar) { tryMakePeace(state, emp, neighborId, rng); if (rng.next() < warFleetChance) launchWarFleet(state, emp, neighborId, rng); }
    }
    for (const rid of Object.keys(emp.relationshipByEmpireId)) if (!neighbors.includes(rid)) emp.relationshipByEmpireId[rid].tension = Math.max(0, emp.relationshipByEmpireId[rid].tension - 1);
  }
}

function launchWarFleet(state: GalaxyState, attacker: Empire, defenderId: Id, rng: PRNG): void {
  const target = findBorderConflictTarget(state, attacker, defenderId);
  if (!target || hasFleetTo(state, attacker.id, target.id, "war")) return;
  const origin = nearestOwnedTo(state, attacker, target);
  if (!origin) return;
  const strength = Math.max(12, attacker.militaryStrength * rng.range(0.08, 0.18));
  launchFleet(state, attacker, origin, target, "war", strength, rng);
}

function stepFleets(state: GalaxyState, rng: PRNG): void {
  for (const fleet of Object.values(state.fleets)) {
    const origin = state.systems[fleet.originSystemId]; const target = state.systems[fleet.targetSystemId]; const owner = state.empires[fleet.ownerEmpireId];
    if (!origin || !target || !owner) { delete state.fleets[fleet.id]; continue; }

    // advance along starlane legs, hopping star to star
    let remaining = fleet.speed;
    while (remaining > 0 && fleet.legIndex < fleet.path.length - 1) {
      const a = state.systems[fleet.path[fleet.legIndex]];
      const b = state.systems[fleet.path[fleet.legIndex + 1]];
      if (!a || !b) { fleet.legIndex = fleet.path.length - 1; break; }
      const legLen = Math.max(1, dist(a, b));
      const legRemain = (1 - fleet.legProgress) * legLen;
      if (remaining >= legRemain) { remaining -= legRemain; fleet.legIndex++; fleet.legProgress = 0; }
      else { fleet.legProgress += remaining / legLen; remaining = 0; }
    }

    let travelled = 0;
    for (let i = 0; i < fleet.legIndex; i++) {
      const a = state.systems[fleet.path[i]], b = state.systems[fleet.path[i + 1]];
      if (a && b) travelled += dist(a, b);
    }
    const legA = state.systems[fleet.path[Math.min(fleet.legIndex, fleet.path.length - 1)]];
    const legB = state.systems[fleet.path[Math.min(fleet.legIndex + 1, fleet.path.length - 1)]];
    if (legA && legB) {
      travelled += dist(legA, legB) * fleet.legProgress;
      fleet.x = legA.x + (legB.x - legA.x) * fleet.legProgress;
      fleet.y = legA.y + (legB.y - legA.y) * fleet.legProgress;
    }
    fleet.progress = Math.min(1, travelled / fleet.totalDist);

    if (fleet.legIndex < fleet.path.length - 1) continue;
    fleet.progress = 1;
    resolveFleetArrival(state, fleet, rng);
    delete state.fleets[fleet.id];
  }
}

function resolveFleetArrival(state: GalaxyState, fleet: Fleet, rng: PRNG): void {
  const owner = state.empires[fleet.ownerEmpireId]; const target = state.systems[fleet.targetSystemId];
  if (!owner || !target) return;
  if (fleet.kind === "colonizer") {
    if (target.ownerEmpireId !== null) return;
    target.ownerEmpireId = owner.id; target.cultureId = owner.cultureId; owner.ownedSystemIds.push(target.id); target.stability = Math.max(target.stability, 0.55);
    createEvent(state, state.tick, "system-colonized", `${owner.name} colonized ${target.name}`, `${fleet.name} arrived and founded a colony for ${owner.name}.`, 1, [owner.id], [target.id]);
    return;
  }
  if (fleet.kind === "war") {
    const defenderId = target.ownerEmpireId;
    if (!defenderId || defenderId === owner.id) return;
    const defender = state.empires[defenderId]; if (!defender) return;
    const localDefense = (defender.militaryStrength * 0.08 + target.population * 18 + target.stability * 18) * rng.range(0.7, 1.35);
    const attack = fleet.strength * rng.range(0.75, 1.35);
    target.stability = Math.max(0.05, target.stability - 0.12); target.population = Math.max(0.03, target.population * rng.range(0.88, 0.98));
    if (attack > localDefense) {
      defender.ownedSystemIds = defender.ownedSystemIds.filter(id => id !== target.id); if (!owner.ownedSystemIds.includes(target.id)) owner.ownedSystemIds.push(target.id);
      target.ownerEmpireId = owner.id; target.cultureId = owner.cultureId; target.stability = Math.max(0.1, target.stability - 0.18);
      owner.cohesion = Math.min(1, owner.cohesion + 0.01); defender.cohesion = Math.max(0.1, defender.cohesion - 0.05);
      if (defender.capitalSystemId === target.id && defender.ownedSystemIds.length > 0) defender.capitalSystemId = defender.ownedSystemIds[0];
      createEvent(state, state.tick, "border-conflict", `${owner.name} captured ${target.name}`, `${fleet.name} seized ${target.name} from ${defender.name}.`, 3, [owner.id, defenderId], [target.id]);
    } else { owner.cohesion = Math.max(0.1, owner.cohesion - 0.02); createEvent(state, state.tick, "border-conflict", `${owner.name} failed at ${target.name}`, `${fleet.name} was repelled by ${defender.name}.`, 2, [owner.id, defenderId], [target.id]); }
  }
}

function stepCollapse(state: GalaxyState, rng: PRNG): void {
  for (const emp of Object.values(state.empires)) {
    if (emp.ownedSystemIds.length === 0) { collapseEmpire(state, emp); continue; }
    const overextension = Math.max(0, emp.ownedSystemIds.length - 15) * 0.005;
    const warStrain = emp.activeWarEmpireIds.length * 0.02;
    const moodStrain = emp.mood === "rioting" ? 3 : emp.mood === "degenerating" ? 1.7 : 1;
    const collapseRisk = ((1 - emp.cohesion) * 0.05 + overextension + warStrain) * moodStrain;
    if (rng.next() > collapseRisk * 0.07) continue;
    if (emp.ownedSystemIds.length > 4 && rng.next() < 0.5) spawnRebellion(state, emp, rng); else if (emp.cohesion < 0.2 && emp.ownedSystemIds.length > 2) collapseEmpire(state, emp);
  }
}

function spawnRebellion(state: GalaxyState, empire: Empire, rng: PRNG): void {
  const numDefect = rng.nextInt(1, Math.max(1, Math.floor(empire.ownedSystemIds.length / 3))); const defectingSet = new Set<Id>();
  for (let i = 0; i < numDefect; i++) { const idx = rng.nextInt(0, empire.ownedSystemIds.length - 1); const sysId = empire.ownedSystemIds[idx]; if (sysId !== empire.capitalSystemId) defectingSet.add(sysId); }
  const defecting = [...defectingSet]; if (defecting.length === 0) return;
  const newId = `${empire.id}-rebel-${state.tick}`;
  const rebelNames = ["Liberation Front","Free States","Rebel Council","Independence Movement","Separatist League","Resistance","New Order","Sovereign Collective"];
  const newEmpire: Empire = { id: newId, name: `${rng.pick(["Broken","Free","New","Rogue","Rising","Lost"])} ${rng.pick(rebelNames)}`, color: `hsl(${rng.nextInt(0, 360)},${rng.nextInt(50, 90)}%,${rng.nextInt(35, 65)}%)`, mood: "expanding", moodSince: state.tick, ruler: makeRuler(rng, state.tick), capitalSystemId: defecting[0], ownedSystemIds: [], population: 0, wealth: 50, militaryStrength: 30, cohesion: rng.range(0.4, 0.8), aggression: rng.range(0.3, 0.8), expansionism: rng.range(0.3, 0.7), techLevel: empire.techLevel * 0.8, cultureId: `culture-rebel-${newId}`, relationshipByEmpireId: {}, activeWarEmpireIds: [], historicalEventIds: [] };
  for (const sysId of defecting) { const sys = state.systems[sysId]; if (!sys) continue; empire.ownedSystemIds = empire.ownedSystemIds.filter(id => id !== sysId); sys.ownerEmpireId = newId; sys.cultureId = newEmpire.cultureId; newEmpire.ownedSystemIds.push(sysId); }
  state.empires[newId] = newEmpire; empire.cohesion = Math.max(0.1, empire.cohesion - 0.2);
  createEvent(state, state.tick, "rebellion", `Rebellion in ${empire.name}`, `${newEmpire.name} broke away from ${empire.name}.`, 4, [empire.id, newId], defecting);
}

function removeEmpireFromGalaxy(state: GalaxyState, empire: Empire): void {
  delete state.empires[empire.id];
  for (const other of Object.values(state.empires)) { delete other.relationshipByEmpireId[empire.id]; other.activeWarEmpireIds = other.activeWarEmpireIds.filter(id => id !== empire.id); }
  for (const fleet of Object.values(state.fleets)) if (fleet.ownerEmpireId === empire.id) delete state.fleets[fleet.id];
}

function collapseEmpire(state: GalaxyState, empire: Empire): void {
  for (const sysId of empire.ownedSystemIds) { const sys = state.systems[sysId]; if (!sys) continue; sys.ownerEmpireId = null; sys.stability = Math.max(0.1, sys.stability - 0.3); }
  createEvent(state, state.tick, "empire-collapsed", `${empire.name} collapsed`, `${empire.name} has disintegrated.`, 5, [empire.id], empire.ownedSystemIds);
  removeEmpireFromGalaxy(state, empire);
}

function transcendEmpire(state: GalaxyState, empire: Empire): void {
  for (const sysId of empire.ownedSystemIds) {
    const sys = state.systems[sysId];
    if (!sys) continue;
    sys.ownerEmpireId = null;
    sys.stability = Math.max(sys.stability, 0.7);
    sys.techLevel = Math.max(sys.techLevel, empire.techLevel * 0.9);
  }
  createEvent(state, state.tick, "transcended", `${empire.name} transcended`, `${empire.name} ascended beyond the material galaxy, leaving its enlightened worlds behind.`, 5, [empire.id], empire.ownedSystemIds.slice(0, 12));
  removeEmpireFromGalaxy(state, empire);
}

const MOOD_CHECK_CHANCE = 0.012;

function pickMood(state: GalaxyState, emp: Empire, rng: PRNG): EmpireMood {
  const avgStability = emp.ownedSystemIds.length
    ? emp.ownedSystemIds.reduce((s, id) => s + (state.systems[id]?.stability ?? 0), 0) / emp.ownedSystemIds.length
    : 0.5;
  const atWar = emp.activeWarEmpireIds.length > 0;
  const hasFrontier = findExpansionTarget(state, emp) !== null;
  const weights: Array<[EmpireMood, number]> = [
    ["expanding", hasFrontier ? 0.8 + emp.expansionism * 1.6 : 0.05],
    ["fortifying", 0.4 + (atWar ? 0.9 : 0) + (1 - avgStability) * 0.8],
    ["degenerating", 0.15 + (1 - emp.cohesion) * 1.3 + emp.ownedSystemIds.length / 50],
    ["rioting", (avgStability < 0.45 ? 1.2 : 0.05) + (1 - emp.cohesion) * 0.6],
    ["crusading", emp.aggression * 1.1 + (atWar ? 0.7 : 0)],
    ["transcending", emp.techLevel > 2.2 && emp.wealth > 800 ? 1.2 : 0],
  ];
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let roll = rng.next() * total;
  for (const [mood, w] of weights) { roll -= w; if (roll <= 0) return mood; }
  return "expanding";
}

function stepMoods(state: GalaxyState, rng: PRNG): void {
  for (const emp of Object.values(state.empires)) {
    switch (emp.mood) {
      case "expanding":
        emp.cohesion = Math.min(1, emp.cohesion + 0.0003);
        break;
      case "fortifying":
        emp.cohesion = Math.min(1, emp.cohesion + 0.0006);
        for (const id of emp.ownedSystemIds) { const sys = state.systems[id]; if (sys) sys.stability = Math.min(1, sys.stability + 0.0015); }
        break;
      case "degenerating":
        emp.cohesion = Math.max(0.05, emp.cohesion - 0.0012);
        break;
      case "rioting":
        emp.cohesion = Math.max(0.05, emp.cohesion - 0.0008);
        for (const id of emp.ownedSystemIds) { const sys = state.systems[id]; if (sys) sys.stability = Math.max(0.05, sys.stability - 0.0025); }
        break;
      case "transcending":
        emp.techLevel = Math.min(3, emp.techLevel + 0.0025);
        if (emp.techLevel >= 3 && state.tick - emp.moodSince > 250) { transcendEmpire(state, emp); continue; }
        break;
    }
    if (rng.next() > MOOD_CHECK_CHANCE) continue;
    if (emp.mood === "transcending") continue; // transcendence runs to completion or collapse
    const next = pickMood(state, emp, rng);
    if (next === emp.mood) continue;
    emp.mood = next;
    emp.moodSince = state.tick;
    const cap = state.systems[emp.capitalSystemId];
    createEvent(state, state.tick, "mood-shift", `${emp.name} is ${MOOD_LABEL[next]}`, `${emp.name} ${MOOD_FLAVOR[next]}.`, next === "transcending" ? 4 : 2, [emp.id], cap ? [cap.id] : []);
  }
}

function stepRulers(state: GalaxyState, rng: PRNG): void {
  for (const emp of Object.values(state.empires)) {
    const reign = state.tick - emp.ruler.accessionTick;
    const deathChance = 0.0006 + reign * 0.000003;
    if (rng.next() > deathChance) continue;
    const old = emp.ruler;
    const oldDisplay = rulerDisplayName(emp);
    const sameDynasty = rng.next() < 0.65;
    if (sameDynasty) {
      const sameName = rng.next() < 0.5;
      emp.ruler = {
        name: sameName ? old.name : makeName(rng),
        title: rng.next() < 0.85 ? old.title : makeRuler(rng, state.tick).title,
        dynasty: old.dynasty,
        ordinal: sameName ? old.ordinal + 1 : 1,
        accessionTick: state.tick,
      };
    } else {
      emp.ruler = makeRuler(rng, state.tick);
    }
    // a new ruler bends the empire's temperament
    emp.aggression = Math.min(1, Math.max(0.05, emp.aggression + rng.range(-0.2, 0.2)));
    emp.expansionism = Math.min(1, Math.max(0.05, emp.expansionism + rng.range(-0.2, 0.2)));
    const cap = state.systems[emp.capitalSystemId];
    const dynastyNote = sameDynasty ? "" : ` The ${old.dynasty} dynasty has fallen; the ${emp.ruler.dynasty} dynasty rises.`;
    createEvent(state, state.tick, "succession", `${oldDisplay} of ${emp.name} has died`, `After a reign of ${reign} ticks, ${rulerDisplayName(emp)} ascended the throne of ${emp.name}.${dynastyNote}`, sameDynasty ? 2 : 3, [emp.id], cap ? [cap.id] : []);
  }
}

type EmergenceKind = "frontier" | "successor" | "native" | "pretender";

type EmergenceCandidate = {
  system: StarSystem;
  kind: EmergenceKind;
  score: number;
};

function hasOwnedNeighbor(state: GalaxyState, sys: StarSystem): boolean {
  return sys.connectedSystemIds.some(id => state.systems[id]?.ownerEmpireId);
}

function pickEmergenceCandidate(state: GalaxyState, rng: PRNG): EmergenceCandidate | null {
  const candidates: EmergenceCandidate[] = [];

  for (const sys of Object.values(state.systems)) {
    if (sys.ownerEmpireId !== null) continue;

    const hasResidue = sys.cultureId !== "none";
    const isolated = !hasOwnedNeighbor(state, sys);
    const lifeScore = sys.population * 2 + sys.habitability + sys.resources;
    const ruinScore = lifeScore + sys.techLevel * 1.6 + (1 - sys.stability) * 0.9;
    const frontierScore = lifeScore + (isolated ? 1.2 : 0) - sys.techLevel * 0.15;

    if (frontierScore > 1.7) {
      candidates.push({ system: sys, kind: "frontier", score: frontierScore });
    }

    if (hasResidue && ruinScore > 1.8) {
      candidates.push({ system: sys, kind: "successor", score: ruinScore + 0.9 });
    }

    if (hasResidue && sys.techLevel > 1.2 && sys.stability > 0.45) {
      candidates.push({ system: sys, kind: "pretender", score: ruinScore + sys.techLevel });
    }

    if (!hasResidue && sys.population > 0.35 && sys.habitability > 0.55 && rng.next() < 0.35) {
      candidates.push({ system: sys, kind: "native", score: lifeScore + sys.habitability });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);
  const pool = candidates.slice(0, Math.min(8, candidates.length));
  const total = pool.reduce((sum, c) => sum + Math.max(0.1, c.score), 0);
  let roll = rng.next() * total;
  for (const candidate of pool) {
    roll -= Math.max(0.1, candidate.score);
    if (roll <= 0) return candidate;
  }
  return pool[0];
}

function emergenceName(kind: EmergenceKind, sys: StarSystem, rng: PRNG): string {
  switch (kind) {
    case "successor":
      return `${sys.name} ${rng.pick(["Successor State", "Remnant", "Continuity", "Hegemony"])}`;
    case "native":
      return `${sys.name} ${rng.pick(["Assembly", "League", "Commonwealth", "Concord"])}`;
    case "pretender":
      return `${sys.name} ${rng.pick(["Restoration", "Pretender Court", "Claimant Dynasty", "Resurgence"])}`;
    case "frontier":
    default:
      return makeEmpireName(rng, sys.name);
  }
}

function emergenceDescription(kind: EmergenceKind, empire: Empire, sys: StarSystem): string {
  const ruler = rulerDisplayName(empire);
  switch (kind) {
    case "successor":
      return `${empire.name} rose from old imperial ruins on ${sys.name}, claiming continuity with the powers that fell before it under ${ruler}.`;
    case "native":
      return `The people of ${sys.name} reached for the stars and founded ${empire.name} under ${ruler}.`;
    case "pretender":
      return `A claimant court on ${sys.name} proclaimed ${empire.name}, promising to restore a lost galactic order under ${ruler}.`;
    case "frontier":
    default:
      return `A new frontier power, ${empire.name}, rose at ${sys.name} under ${ruler}.`;
  }
}

function createEmergentEmpire(state: GalaxyState, candidate: EmergenceCandidate, rng: PRNG): Empire {
  const sys = candidate.system;
  const id = `emp-rise-${candidate.kind}-${state.tick}-${Object.keys(state.empires).length}`;
  const cultureId = candidate.kind === "successor" || candidate.kind === "pretender" ? sys.cultureId : `culture-${id}`;
  const techBase = candidate.kind === "native" ? 0.25 : candidate.kind === "frontier" ? 0.35 : 0.55;
  const cohesionBonus = candidate.kind === "pretender" ? 0.08 : candidate.kind === "successor" ? -0.05 : 0;
  const aggressionBonus = candidate.kind === "pretender" ? 0.25 : candidate.kind === "successor" ? 0.1 : 0;

  return {
    id,
    name: emergenceName(candidate.kind, sys, rng),
    color: `hsl(${rng.nextInt(0, 360)},${rng.nextInt(55, 85)}%,${rng.nextInt(40, 62)}%)`,
    mood: candidate.kind === "pretender" ? "crusading" : "expanding",
    moodSince: state.tick,
    ruler: makeRuler(rng, state.tick),
    capitalSystemId: sys.id,
    ownedSystemIds: [sys.id],
    population: Math.max(sys.population * 1000, 400),
    wealth: rng.range(120, 320) + (candidate.kind === "successor" ? 80 : 0),
    militaryStrength: rng.range(40, 120) + (candidate.kind === "pretender" ? 70 : 0),
    cohesion: Math.min(0.98, Math.max(0.35, rng.range(0.6, 0.95) + cohesionBonus)),
    aggression: Math.min(1, rng.range(0.1, 0.85) + aggressionBonus),
    expansionism: rng.range(0.3, 1.0),
    techLevel: Math.max(sys.techLevel, techBase),
    cultureId,
    relationshipByEmpireId: {},
    activeWarEmpireIds: [],
    historicalEventIds: [],
  };
}

// New empires rise in different historical forms, so the galaxy never goes
// quiet: empty frontiers, ruins, native worlds, and claimant courts all compete
// to refill the sandbox when too few powers remain.
function stepEmergence(state: GalaxyState, rng: PRNG): void {
  const empireCount = Object.keys(state.empires).length;
  const targetEmpires = Math.max(6, Math.round(Object.keys(state.systems).length / 40));
  const deficit = Math.max(0, targetEmpires - empireCount);
  const chance = deficit * 0.0012;
  if (rng.next() > chance) return;

  const candidate = pickEmergenceCandidate(state, rng);
  if (!candidate) return;

  const empire = createEmergentEmpire(state, candidate, rng);
  const sys = candidate.system;
  sys.ownerEmpireId = empire.id;
  sys.cultureId = empire.cultureId;
  sys.population = Math.max(sys.population, candidate.kind === "native" ? 0.45 : 0.5);
  sys.stability = Math.max(sys.stability, candidate.kind === "pretender" ? 0.5 : 0.6);
  state.empires[empire.id] = empire;

  createEvent(state, state.tick, "empire-founded", `${empire.name} has risen`, emergenceDescription(candidate.kind, empire, sys), 4, [empire.id], [sys.id]);
}

export function executeTick(state: GalaxyState, rng: PRNG): void {
  stepGrowth(state); stepProgress(state, rng); stepMoods(state, rng); stepRulers(state, rng); stepFleets(state, rng); stepExpansion(state, rng); stepConflict(state, rng); stepCollapse(state, rng); stepEmergence(state, rng); state.tick++;
}
