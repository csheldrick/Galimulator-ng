import type { GalaxyState, Empire, StarSystem, Id, Fleet, FleetKind } from "../types/sim";
import type { PRNG } from "../types/sim";
import { createEvent } from "./Events";
import { updateRelationships, getNeighboringEmpires, tryDeclareWar, tryMakePeace } from "./Diplomacy";

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

function findNearestUnowned(state: GalaxyState, empire: Empire, maxDist: number): StarSystem | null {
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

function findBorderConflictTarget(state: GalaxyState, attacker: Empire, enemyId: Id): StarSystem | null {
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

function hasFleetTo(state: GalaxyState, ownerEmpireId: Id, targetSystemId: Id, kind?: FleetKind): boolean {
  return Object.values(state.fleets).some(f => f.ownerEmpireId === ownerEmpireId && f.targetSystemId === targetSystemId && (!kind || f.kind === kind));
}

function launchFleet(state: GalaxyState, empire: Empire, origin: StarSystem, target: StarSystem, kind: FleetKind, strength: number, rng: PRNG): void {
  if (hasFleetTo(state, empire.id, target.id, kind)) return;
  const id = `fleet-${state.tick}-${Object.keys(state.fleets).length}-${rng.nextInt(0, 9999)}`;
  const fleet: Fleet = {
    id,
    name: fleetName(kind, empire, target, rng),
    kind,
    ownerEmpireId: empire.id,
    originSystemId: origin.id,
    targetSystemId: target.id,
    x: origin.x,
    y: origin.y,
    progress: 0,
    speed: rng.range(0.012, 0.028) + empire.techLevel * 0.004,
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
    emp.militaryStrength = emp.ownedSystemIds.length * 10 + emp.techLevel * 50 + emp.wealth * 0.05;
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

function stepExpansion(state: GalaxyState, rng: PRNG): void {
  const MAX_EXPAND_DIST = 160;
  for (const emp of Object.values(state.empires)) {
    if (emp.wealth < 18 || emp.ownedSystemIds.length === 0) continue;
    const expandChance = emp.expansionism * 0.22 * emp.cohesion * Math.min(emp.wealth / 250, 1);
    if (rng.next() > expandChance) continue;
    const target = findNearestUnowned(state, emp, MAX_EXPAND_DIST);
    if (!target || hasFleetTo(state, emp.id, target.id)) continue;
    const origin = nearestOwnedTo(state, emp, target);
    if (!origin) continue;
    launchFleet(state, emp, origin, target, "colonizer", 8 + emp.techLevel * 6, rng);
    emp.wealth -= 8;
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
      if (!rel.atWar && rel.tension > 50) tryDeclareWar(state, emp, neighborId, rng);
      if (rel.atWar) { tryMakePeace(state, emp, neighborId, rng); if (rng.next() < 0.16) launchWarFleet(state, emp, neighborId, rng); }
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
    fleet.progress = Math.min(1, fleet.progress + fleet.speed);
    fleet.x = origin.x + (target.x - origin.x) * fleet.progress;
    fleet.y = origin.y + (target.y - origin.y) * fleet.progress;
    if (fleet.progress < 1) continue;
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
    const collapseRisk = (1 - emp.cohesion) * 0.05 + overextension + warStrain;
    if (rng.next() > collapseRisk * 0.1) continue;
    if (emp.ownedSystemIds.length > 4 && rng.next() < 0.5) spawnRebellion(state, emp, rng); else if (emp.cohesion < 0.2 && emp.ownedSystemIds.length > 2) collapseEmpire(state, emp);
  }
}

function spawnRebellion(state: GalaxyState, empire: Empire, rng: PRNG): void {
  const numDefect = rng.nextInt(1, Math.max(1, Math.floor(empire.ownedSystemIds.length / 3))); const defectingSet = new Set<Id>();
  for (let i = 0; i < numDefect; i++) { const idx = rng.nextInt(0, empire.ownedSystemIds.length - 1); const sysId = empire.ownedSystemIds[idx]; if (sysId !== empire.capitalSystemId) defectingSet.add(sysId); }
  const defecting = [...defectingSet]; if (defecting.length === 0) return;
  const newId = `${empire.id}-rebel-${state.tick}`;
  const rebelNames = ["Liberation Front","Free States","Rebel Council","Independence Movement","Separatist League","Resistance","New Order","Sovereign Collective"];
  const newEmpire: Empire = { id: newId, name: `${rng.pick(["Broken","Free","New","Rogue","Rising","Lost"])} ${rng.pick(rebelNames)}`, color: `hsl(${rng.nextInt(0, 360)},${rng.nextInt(50, 90)}%,${rng.nextInt(35, 65)}%)`, capitalSystemId: defecting[0], ownedSystemIds: [], population: 0, wealth: 50, militaryStrength: 30, cohesion: rng.range(0.4, 0.8), aggression: rng.range(0.3, 0.8), expansionism: rng.range(0.3, 0.7), techLevel: empire.techLevel * 0.8, cultureId: `culture-rebel-${newId}`, relationshipByEmpireId: {}, activeWarEmpireIds: [], historicalEventIds: [] };
  for (const sysId of defecting) { const sys = state.systems[sysId]; if (!sys) continue; empire.ownedSystemIds = empire.ownedSystemIds.filter(id => id !== sysId); sys.ownerEmpireId = newId; sys.cultureId = newEmpire.cultureId; newEmpire.ownedSystemIds.push(sysId); }
  state.empires[newId] = newEmpire; empire.cohesion = Math.max(0.1, empire.cohesion - 0.2);
  createEvent(state, state.tick, "rebellion", `Rebellion in ${empire.name}`, `${newEmpire.name} broke away from ${empire.name}.`, 4, [empire.id, newId], defecting);
}

function collapseEmpire(state: GalaxyState, empire: Empire): void {
  for (const sysId of empire.ownedSystemIds) { const sys = state.systems[sysId]; if (!sys) continue; sys.ownerEmpireId = null; sys.stability = Math.max(0.1, sys.stability - 0.3); }
  createEvent(state, state.tick, "empire-collapsed", `${empire.name} collapsed`, `${empire.name} has disintegrated.`, 5, [empire.id], empire.ownedSystemIds);
  delete state.empires[empire.id];
  for (const other of Object.values(state.empires)) { delete other.relationshipByEmpireId[empire.id]; other.activeWarEmpireIds = other.activeWarEmpireIds.filter(id => id !== empire.id); }
  for (const fleet of Object.values(state.fleets)) if (fleet.ownerEmpireId === empire.id) delete state.fleets[fleet.id];
}

export function executeTick(state: GalaxyState, rng: PRNG): void {
  stepGrowth(state); stepProgress(state, rng); stepFleets(state, rng); stepExpansion(state, rng); stepConflict(state, rng); stepCollapse(state, rng); state.tick++;
}
