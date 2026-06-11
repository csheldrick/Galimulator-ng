import type { GalaxyState, Empire, StarSystem, Id, Fleet, FleetKind, EmpireMood, ShipClass, SystemMarker, MarkerKind, Alliance, AlliancePurpose } from "../types/sim";
import type { PRNG } from "../types/sim";
import { createEvent } from "./Events";
import { updateRelationships, getNeighboringEmpires, tryDeclareWar, tryMakePeace } from "./Diplomacy";
import { pruneExpiredModifiers, effectiveOpinion, effectiveTension, addRelationModifier } from "./Relations";
import type { WarFocus, RelationModifierInput } from "../types/sim";
import { makeName, makeRuler, makeEmpireName } from "./Galaxy";
import { MOOD_LABEL, MOOD_FLAVOR, IDEOLOGY_LABEL, IDEOLOGY_MODS, IDEOLOGIES, rulerDisplayName } from "./Moods";
import { dist, findPath, pathLength, advanceAlongPath } from "./Pathing";
import { stepReligion } from "./Religion";
import { stepTrade, severEmpireRoutes } from "./Trade";
import { stepMonsters, stepCrises, stepOddities, discoverArtifact } from "./Crises";
import { stepArtifacts } from "./Artifacts";
import { makeCourt, stepCharacters, topByRole, findCharacter } from "./Characters";

const SHIP_CLASS_MODS: Record<ShipClass, { speed: number; strength: number }> = {
  settler: { speed: 1, strength: 1 },
  raider: { speed: 1.45, strength: 0.6 },
  strike: { speed: 1, strength: 1 },
  armada: { speed: 0.7, strength: 1.9 },
};

function fleetName(kind: FleetKind, empire: Empire, target: StarSystem, rng: PRNG): string {
  const banner = empire.name.split(" ")[0] ?? "Imperial";
  if (kind === "merchant") return `${banner} ${rng.pick(["Merchant","Trading","Commerce"])} Convoy to ${target.name}`;
  if (kind === "pilgrim") return `${banner} ${rng.pick(["Pilgrim","Holy","Sacred"])} Voyage to ${target.name}`;
  if (kind === "refugee") return `${banner} ${rng.pick(["Refugee","Evacuation","Exodus"])} Fleet from ${target.name}`;
  const prefix = kind === "war" ? rng.pick(["Spear", "Hammer", "Vanguard", "Dagger", "Iron"])
    : rng.pick(["Hope", "Horizon", "Seed", "Dawn", "Pilgrim"]);
  const suffix = kind === "war" ? rng.pick(["Strike Fleet", "Battle Group", "Expedition", "Armada"])
    : rng.pick(["Colony Fleet", "Settler Wing", "Migration", "Expedition"]);
  return `${banner} ${prefix} ${suffix} to ${target.name}`;
}

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

function launchFleet(state: GalaxyState, empire: Empire, origin: StarSystem, target: StarSystem, kind: FleetKind, strength: number, rng: PRNG, shipClass: ShipClass = "settler", admiral?: import("../types/sim").Character | null): void {
  if (hasFleetTo(state, empire.id, target.id, kind)) return;
  const id = `fleet-${state.tick}-${Object.keys(state.fleets).length}-${rng.nextInt(0, 9999)}`;
  const path = findPath(state, origin.id, target.id);
  const mods = SHIP_CLASS_MODS[shipClass];
  const admiralBoost = admiral ? 1 + admiral.skill * 0.4 : 1;
  const baseName = fleetName(kind, empire, target, rng);
  const fleet: Fleet = {
    id,
    name: admiral ? `${baseName}, under ${admiral.title} ${admiral.name}` : baseName,
    kind,
    shipClass,
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
    speed: (rng.range(1.4, 2.8) + empire.techLevel * 0.5) * mods.speed,
    strength: strength * mods.strength * admiralBoost,
    createdTick: state.tick,
    admiralId: admiral?.id,
    admiralName: admiral ? `${admiral.title} ${admiral.name}` : undefined,
  };
  state.fleets[id] = fleet;
}

// ── System markers ────────────────────────────────────────────────────────────

function addMarker(sys: StarSystem, kind: MarkerKind, tick: number, label?: string): void {
  if (!sys.markers) sys.markers = [];
  const existing = sys.markers.findIndex(m => m.kind === kind);
  const marker: SystemMarker = { kind, since: tick, label };
  if (existing >= 0) sys.markers[existing] = marker;
  else sys.markers.push(marker);
}

// ── Local wealth ──────────────────────────────────────────────────────────────

function stepLocalWealth(state: GalaxyState): void {
  for (const sys of Object.values(state.systems)) {
    if (sys.localWealth === undefined) sys.localWealth = 0;
    if (sys.ownerEmpireId) {
      // owned worlds accumulate local commerce from resources and trade routes
      const tradeBonus = Object.values(state.tradeRoutes).some(r => r.systemAId === sys.id || r.systemBId === sys.id) ? 0.12 : 0;
      const industrialBonus = sys.planets?.includes("industrial") ? 0.06 : 0;
      sys.localWealth = Math.min(200, sys.localWealth + sys.resources * 0.08 + tradeBonus + industrialBonus);
      // trade-hubs get boosted local wealth marker
      if (sys.localWealth > 80 && !sys.markers?.some(m => m.kind === "trade-hub")) {
        addMarker(sys, "trade-hub", state.tick, "Prosperous trading hub");
      }
    } else {
      sys.localWealth = Math.max(0, sys.localWealth - 0.02);
    }
  }
}

// ── Ambient ships: merchants, pilgrims, refugees ──────────────────────────────

function stepAmbientShips(state: GalaxyState, rng: PRNG): void {
  // Merchants spawn along existing trade routes
  for (const route of Object.values(state.tradeRoutes)) {
    if (rng.next() > 0.004) continue;
    const empA = state.empires[route.empireAId];
    const sysA = state.systems[route.systemAId];
    const sysB = state.systems[route.systemBId];
    if (!empA || !sysA || !sysB) continue;
    if (hasFleetTo(state, empA.id, sysB.id, "merchant")) continue;
    const id = `fleet-amb-${state.tick}-${rng.nextInt(0, 99999)}`;
    const path = findPath(state, sysA.id, sysB.id);
    state.fleets[id] = {
      id, name: fleetName("merchant", empA, sysB, rng), kind: "merchant", shipClass: "settler",
      ownerEmpireId: empA.id, originSystemId: sysA.id, targetSystemId: sysB.id,
      path, legIndex: 0, legProgress: 0, totalDist: Math.max(1, pathLength(state, path)),
      x: sysA.x, y: sysA.y, progress: 0,
      speed: rng.range(1.8, 3.0), strength: 2, createdTick: state.tick,
    };
  }

  // Pilgrims spawn from holy systems toward religion-aligned worlds
  for (const religion of Object.values(state.religions)) {
    if (rng.next() > 0.003) continue;
    const holy = state.systems[religion.holySystemId];
    if (!holy || !holy.ownerEmpireId) continue;
    const empire = state.empires[holy.ownerEmpireId];
    if (!empire) continue;
    // Find a distant same-religion world to visit
    const candidates = Object.values(state.systems).filter(s =>
      s.religionId === religion.id && s.id !== holy.id && s.ownerEmpireId !== null
    );
    if (candidates.length === 0) continue;
    const dest = rng.pick(candidates);
    if (hasFleetTo(state, empire.id, dest.id, "pilgrim")) continue;
    const id = `fleet-plg-${state.tick}-${rng.nextInt(0, 99999)}`;
    const path = findPath(state, holy.id, dest.id);
    state.fleets[id] = {
      id, name: fleetName("pilgrim", empire, dest, rng), kind: "pilgrim", shipClass: "settler",
      ownerEmpireId: empire.id, originSystemId: holy.id, targetSystemId: dest.id,
      path, legIndex: 0, legProgress: 0, totalDist: Math.max(1, pathLength(state, path)),
      x: holy.x, y: holy.y, progress: 0,
      speed: rng.range(1.5, 2.5), strength: 1, createdTick: state.tick,
    };
  }

  // Mood expression: fortifying empires run visible patrols; rioting empires bleed refugees
  for (const emp of Object.values(state.empires)) {
    if (emp.mood === "fortifying" && emp.ownedSystemIds.length >= 2 && rng.next() < 0.006) {
      const border = emp.ownedSystemIds
        .map(id => state.systems[id])
        .filter((s): s is StarSystem => !!s && s.connectedSystemIds.some(nid => state.systems[nid]?.ownerEmpireId !== emp.id));
      if (border.length >= 1) {
        const from = rng.pick(border);
        const toCandidates = (border.length > 1 ? border.filter(s => s.id !== from.id) : emp.ownedSystemIds.map(id => state.systems[id]).filter((s): s is StarSystem => !!s && s.id !== from.id));
        if (toCandidates.length > 0 && !hasFleetTo(state, emp.id, toCandidates[0].id, "patrol")) {
          const to = rng.pick(toCandidates);
          const id = `fleet-pat-${state.tick}-${rng.nextInt(0, 99999)}`;
          const path = findPath(state, from.id, to.id);
          state.fleets[id] = {
            id, name: `${emp.name.split(" ")[0]} Border Patrol`, kind: "patrol", shipClass: "strike",
            ownerEmpireId: emp.id, originSystemId: from.id, targetSystemId: to.id,
            path, legIndex: 0, legProgress: 0, totalDist: Math.max(1, pathLength(state, path)),
            x: from.x, y: from.y, progress: 0,
            speed: rng.range(1.6, 2.4), strength: Math.max(6, emp.militaryStrength * 0.02), createdTick: state.tick,
          };
        }
      }
    }
    if (emp.mood === "rioting" && rng.next() < 0.004) {
      const unstable = emp.ownedSystemIds.map(id => state.systems[id]).filter((s): s is StarSystem => !!s && s.stability < 0.4);
      const dests = Object.values(state.systems).filter(s => s.ownerEmpireId && s.ownerEmpireId !== emp.id);
      if (unstable.length > 0 && dests.length > 0) {
        const from = rng.pick(unstable);
        const dest = rng.pick(dests);
        if (!hasFleetTo(state, emp.id, dest.id, "refugee")) {
          const id = `fleet-rfg-${state.tick}-${rng.nextInt(0, 99999)}`;
          const path = findPath(state, from.id, dest.id);
          state.fleets[id] = {
            id, name: `Refugees from ${from.name}`, kind: "refugee", shipClass: "settler",
            ownerEmpireId: emp.id, originSystemId: from.id, targetSystemId: dest.id,
            path, legIndex: 0, legProgress: 0, totalDist: Math.max(1, pathLength(state, path)),
            x: from.x, y: from.y, progress: 0,
            speed: rng.range(2.0, 3.0), strength: 1, createdTick: state.tick,
          };
        }
      }
    }
  }
}

// ── Alliance mechanics ────────────────────────────────────────────────────────

const ALLIANCE_NOUNS = ["Pact","Accord","League","Coalition","Compact","Union","Concordat","Alliance"];

const ALLIANCE_EMBLEM: Record<AlliancePurpose, string> = {
  "defensive": "⛨", "anti-hegemon": "⚔", "trade": "⊕", "religious": "✦", "survival": "❂",
};

/** Infer why two friendly empires banded together, from their circumstances. */
function _alliancePurpose(state: GalaxyState, a: Empire, b: Empire): AlliancePurpose {
  if (a.stateReligionId && a.stateReligionId === b.stateReligionId) return "religious";
  const trades = Object.values(state.tradeRoutes).some(
    r => (r.empireAId === a.id && r.empireBId === b.id) || (r.empireAId === b.id && r.empireBId === a.id)
  );
  if (trades && (a.ideology === "materialist" || b.ideology === "materialist")) return "trade";
  // a much larger neighbor turns the pact defensive (survival for the small, anti-hegemon otherwise)
  const pairMax = Math.max(a.ownedSystemIds.length, b.ownedSystemIds.length);
  let biggestNeighbor = 0;
  for (const nId of [...getNeighboringEmpires(state, a.id), ...getNeighboringEmpires(state, b.id)]) {
    if (nId === a.id || nId === b.id) continue;
    biggestNeighbor = Math.max(biggestNeighbor, state.empires[nId]?.ownedSystemIds.length ?? 0);
  }
  if (biggestNeighbor > pairMax * 2) return pairMax <= 3 ? "survival" : "anti-hegemon";
  return "defensive";
}

function stepAlliances(state: GalaxyState, rng: PRNG): void {
  const empireList = Object.values(state.empires);

  // Try forming new alliances between friendly neighbors
  if (empireList.length >= 2 && rng.next() < 0.006) {
    for (const empA of empireList) {
      if (rng.next() > 0.04) continue;
      const alreadyAllied = empA.allianceIds?.length ?? 0;
      if (alreadyAllied >= 2) continue;
      const neighbors = getNeighboringEmpires(state, empA.id);
      for (const neighborId of neighbors) {
        const empB = state.empires[neighborId];
        if (!empB) continue;
        if ((empB.allianceIds?.length ?? 0) >= 2) continue;
        const rel = empA.relationshipByEmpireId[neighborId];
        if (!rel || rel.atWar) continue;
        if (effectiveOpinion(rel, state.tick) < 60 || effectiveTension(rel, state.tick) > 40) continue;
        // Check they're not already allied together
        const sharedAlliance = empA.allianceIds?.some(aid => empB.allianceIds?.includes(aid));
        if (sharedAlliance) continue;

        const id = `alliance-${state.tick}-${rng.nextInt(0, 9999)}`;
        const name = `${empA.name.split(" ")[0]}-${empB.name.split(" ")[0]} ${rng.pick(ALLIANCE_NOUNS)}`;
        const purpose = _alliancePurpose(state, empA, empB);
        const alliance: Alliance = {
          id, name, memberEmpireIds: [empA.id, empB.id], formedTick: state.tick, leaderId: empA.id,
          purpose, color: empA.color, emblem: ALLIANCE_EMBLEM[purpose], historicalEventIds: [],
        };
        state.alliances[id] = alliance;
        empA.allianceIds = [...(empA.allianceIds ?? []), id];
        empB.allianceIds = [...(empB.allianceIds ?? []), id];
        const capA = state.systems[empA.capitalSystemId];
        createEvent(state, state.tick, "alliance-formed", `${name} formed`,
          `${empA.name} and ${empB.name} forged the ${name}.`,
          3, [empA.id, empB.id], capA ? [capA.id] : []);
        break;
      }
    }
  }

  // Existing blocs can grow: a neighbor friendly with every member may petition to join
  if (rng.next() < 0.004) {
    for (const alliance of Object.values(state.alliances)) {
      if (alliance.memberEmpireIds.length >= 5) continue;
      const leader = state.empires[alliance.leaderId] ?? state.empires[alliance.memberEmpireIds[0]];
      if (!leader) continue;
      for (const candidateId of getNeighboringEmpires(state, leader.id)) {
        if (alliance.memberEmpireIds.includes(candidateId)) continue;
        const candidate = state.empires[candidateId];
        if (!candidate || (candidate.allianceIds?.length ?? 0) >= 1) continue;
        const friendlyWithAll = alliance.memberEmpireIds.every(mid => {
          const rel = candidate.relationshipByEmpireId[mid];
          return rel && !rel.atWar && effectiveOpinion(rel, state.tick) >= 58;
        });
        if (!friendlyWithAll) continue;
        alliance.memberEmpireIds.push(candidateId);
        candidate.allianceIds = [...(candidate.allianceIds ?? []), alliance.id];
        const cap = state.systems[candidate.capitalSystemId];
        createEvent(state, state.tick, "alliance-formed", `${candidate.name} joined the ${alliance.name}`,
          `${candidate.name} was welcomed into the ${alliance.name}, bringing the bloc to ${alliance.memberEmpireIds.length} members.`,
          3, [candidateId, ...alliance.memberEmpireIds.slice(0, 3)], cap ? [cap.id] : []);
        break;
      }
    }
  }

  // Allies honor their pacts: a member may enter a war alongside an attacked partner
  if (rng.next() < 0.01) {
    for (const alliance of Object.values(state.alliances)) {
      for (const memberId of alliance.memberEmpireIds) {
        const member = state.empires[memberId];
        if (!member || member.activeWarEmpireIds.length === 0) continue;
        for (const enemyId of member.activeWarEmpireIds) {
          const enemy = state.empires[enemyId];
          if (!enemy) continue;
          for (const allyId of alliance.memberEmpireIds) {
            if (allyId === memberId) continue;
            const ally = state.empires[allyId];
            if (!ally || ally.activeWarEmpireIds.includes(enemyId)) continue;
            const allyRel = ally.relationshipByEmpireId[enemyId];
            if (!allyRel) continue;
            allyRel.tension = Math.min(100, allyRel.tension + 3);
            if (rng.next() < 0.12) {
              allyRel.atWar = true;
              const enemyRel = enemy.relationshipByEmpireId[allyId];
              if (enemyRel) enemyRel.atWar = true;
              if (!ally.activeWarEmpireIds.includes(enemyId)) ally.activeWarEmpireIds.push(enemyId);
              if (!enemy.activeWarEmpireIds.includes(allyId)) enemy.activeWarEmpireIds.push(allyId);
              createEvent(state, state.tick, "war-declared", `${ally.name} honors the ${alliance.name}`,
                `${ally.name} entered the war against ${enemy.name} in defense of its ally ${member.name}.`,
                4, [allyId, enemyId, memberId], []);
            }
          }
        }
      }
    }
  }

  // Rare peaceful merge: a small member folds itself into its larger long-time ally
  if (rng.next() < 0.0006) {
    for (const alliance of Object.values(state.alliances)) {
      if (state.tick - alliance.formedTick < 600) continue;
      const members = alliance.memberEmpireIds.map(id => state.empires[id]).filter((e): e is Empire => !!e);
      if (members.length < 2) continue;
      const sorted = [...members].sort((a, b) => b.ownedSystemIds.length - a.ownedSystemIds.length);
      const big = sorted[0], small = sorted[sorted.length - 1];
      if (big.id === small.id || small.ownedSystemIds.length > 3 || big.ownedSystemIds.length < small.ownedSystemIds.length * 3) continue;
      if (state.playerControl.controlledEmpireId === small.id) continue;
      const rel = small.relationshipByEmpireId[big.id];
      if (!rel || rel.atWar || effectiveOpinion(rel, state.tick) < 75) continue;
      for (const sysId of [...small.ownedSystemIds]) {
        const sys = state.systems[sysId];
        if (!sys) continue;
        sys.ownerEmpireId = big.id;
        big.ownedSystemIds.push(sysId);
      }
      big.wealth += small.wealth * 0.6;
      createEvent(state, state.tick, "empire-collapsed", `${small.name} merged into ${big.name}`,
        `After long partnership in the ${alliance.name}, ${small.name} dissolved its throne and joined ${big.name} as one realm.`,
        4, [big.id, small.id], small.ownedSystemIds.slice(0, 6));
      small.ownedSystemIds = [];
      removeEmpireFromGalaxy(state, small);
      break;
    }
  }

  // Dissolve alliances when members go to war with each other or collapse
  for (const alliance of Object.values(state.alliances)) {
    const living = alliance.memberEmpireIds.filter(id => state.empires[id]);
    if (living.length < 2) {
      _dissolveAlliance(state, alliance.id);
      continue;
    }
    // Check if any member pair is at war
    for (let i = 0; i < living.length; i++) {
      for (let j = i + 1; j < living.length; j++) {
        const empA = state.empires[living[i]];
        const rel = empA?.relationshipByEmpireId[living[j]];
        if (rel?.atWar) { _dissolveAlliance(state, alliance.id); break; }
      }
    }
  }
}

function _dissolveAlliance(state: GalaxyState, allianceId: Id): void {
  const alliance = state.alliances[allianceId];
  if (!alliance) return;
  for (const memberId of alliance.memberEmpireIds) {
    const emp = state.empires[memberId];
    if (emp) emp.allianceIds = emp.allianceIds?.filter(id => id !== allianceId) ?? [];
  }
  delete state.alliances[allianceId];
}

// ── Empire Control Mode ───────────────────────────────────────────────────────

function stepPlayerControl(state: GalaxyState, rng: PRNG): void {
  const pc = state.playerControl;
  if (pc.mode !== "empire" || !pc.controlledEmpireId) return;
  const emp = state.empires[pc.controlledEmpireId];
  if (!emp) {
    // Controlled empire no longer exists — fall back to observer
    pc.mode = "observer";
    pc.controlledEmpireId = null;
    return;
  }
  const cap = state.systems[emp.capitalSystemId];
  const avgStability = emp.ownedSystemIds.length
    ? emp.ownedSystemIds.reduce((s, id) => s + (state.systems[id]?.stability ?? 0), 0) / emp.ownedSystemIds.length
    : 0.5;

  // Authority regenerates based on cohesion and capital stability
  const authRegen = 0.5 * emp.cohesion * (cap ? cap.stability : 0.5);
  pc.authority = Math.min(100, pc.authority + authRegen);

  // Legitimacy drifts based on empire health
  const atWar = emp.activeWarEmpireIds.length > 0;
  const prospering = !atWar && avgStability > 0.6 && emp.cohesion > 0.6;
  if (prospering) pc.legitimacy = Math.min(100, pc.legitimacy + 0.06);
  else if (atWar) pc.legitimacy = Math.max(0, pc.legitimacy - 0.04);
  if (emp.mood === "rioting") pc.legitimacy = Math.max(0, pc.legitimacy - 0.08);
  if (emp.mood === "degenerating") pc.legitimacy = Math.max(0, pc.legitimacy - 0.04);

  // Flagship: persistent ruler ship that steadies wherever it is stationed
  const flagship = pc.flagshipFleetId ? state.fleets[pc.flagshipFleetId] : null;
  let flagshipAtCapital = false;
  if (flagship) {
    const stationedId = flagship.path[flagship.path.length - 1];
    const stationed = state.systems[stationedId];
    if (stationed) {
      const arrived = flagship.path.length <= 1 || flagship.legIndex >= flagship.path.length - 1;
      if (arrived) {
        if (stationed.ownerEmpireId === emp.id) {
          stationed.stability = Math.min(1, stationed.stability + 0.002);
          flagshipAtCapital = stationed.id === emp.capitalSystemId;
        } else if (stationed.ownerEmpireId && emp.activeWarEmpireIds.includes(stationed.ownerEmpireId)) {
          // caught behind enemy lines: the flagship is lost and the throne shamed
          delete state.fleets[flagship.id];
          pc.flagshipFleetId = null;
          pc.legitimacy = Math.max(0, pc.legitimacy - 20);
          createEvent(state, state.tick, "border-conflict", `${emp.name}'s flagship destroyed`,
            `${flagship.name} was caught at hostile ${stationed.name} and destroyed. The throne's prestige suffers gravely.`,
            4, [emp.id], [stationed.id]);
        }
      }
    }
  }

  // Low legitimacy increases coup and pretender pressure — unless the flagship guards the capital
  if (pc.legitimacy < 20 && !flagshipAtCapital && rng.next() < 0.001) {
    const pretender = emp.court.find(c => c.role === "pretender");
    if (pretender && pretender.loyalty < 0.35) {
      // Force a coup that ends player control
      emp.ruler = makeRuler(rng, state.tick);
      emp.cohesion = Math.max(0.1, emp.cohesion - 0.15);
      pc.mode = "observer";
      pc.controlledEmpireId = null;
      if (cap) cap.stability = Math.max(0.1, cap.stability - 0.2);
      createEvent(state, state.tick, "coup",
        `Player-ruler overthrown in ${emp.name}`,
        `${pretender.title} ${pretender.name} exploited imperial weakness and seized the throne. You return to observer mode.`,
        5, [emp.id], cap ? [cap.id] : []);
    }
  }

  // Apply priority modifiers to empire parameters this tick
  const prio = emp.playerPriority ?? "balanced";
  switch (prio) {
    case "expand":
      emp.expansionism = Math.min(1, emp.expansionism + 0.001);
      break;
    case "fortify":
      emp.cohesion = Math.min(1, emp.cohesion + 0.0005);
      if (cap) cap.stability = Math.min(1, cap.stability + 0.002);
      break;
    case "conquer":
      emp.aggression = Math.min(1, emp.aggression + 0.001);
      break;
    case "trade":
      emp.wealth += emp.ownedSystemIds.length * 0.05;
      emp.aggression = Math.max(0.05, emp.aggression - 0.0005);
      break;
    case "research":
      emp.techLevel = Math.min(3, emp.techLevel + 0.0003);
      emp.wealth = Math.max(0, emp.wealth - 0.2);
      break;
    case "stabilize":
      for (const id of emp.ownedSystemIds.slice(0, 10)) {
        const sys = state.systems[id];
        if (sys && sys.stability < 0.7) sys.stability = Math.min(0.7, sys.stability + 0.001);
      }
      break;
    case "survive":
      emp.cohesion = Math.min(1, emp.cohesion + 0.0003);
      emp.aggression = Math.max(0.05, emp.aggression - 0.001);
      break;
  }
}

// ── Core subsystems ───────────────────────────────────────────────────────────

/** Planet tags subtly bias local growth so stars feel distinct without being full colonies. */
function planetGrowthMul(sys: StarSystem): number {
  if (!sys.planets?.length) return 1;
  let m = 1;
  for (const p of sys.planets) {
    if (p === "garden" || p === "oceanic") m += 0.25;
    else if (p === "industrial") m += 0.1;
    else if (p === "toxic" || p === "frozen" || p === "barren") m -= 0.18;
  }
  return Math.max(0.4, m);
}

function stepGrowth(state: GalaxyState, rng: PRNG): void {
  for (const sys of Object.values(state.systems)) {
    if (sys.ownerEmpireId) {
      sys.population = Math.min(sys.population + 0.002 * sys.habitability * planetGrowthMul(sys), 2.0);
      const owner = state.empires[sys.ownerEmpireId];
      if (owner && sys.cultureId !== owner.cultureId) {
        sys.stability = Math.max(0.05, sys.stability - 0.0006);
        if (rng.next() < 0.0025 * owner.cohesion) sys.cultureId = owner.cultureId;
      } else {
        sys.stability = Math.min(sys.stability + 0.001, 1.0);
      }
    }
    if (sys.godBoostTicks && sys.godBoostTicks > 0) {
      sys.stability = Math.min(1, sys.stability + 0.005);
      sys.godBoostTicks--;
    }
  }
  for (const emp of Object.values(state.empires)) {
    emp.wealth += emp.ownedSystemIds.reduce((s, id) => s + ((state.systems[id]?.resources ?? 0) * 2), 0);
    emp.wealth = Math.max(0, emp.wealth);
    const militaryMood = emp.mood === "fortifying" ? 1.25 : emp.mood === "crusading" ? 1.1 : emp.mood === "rioting" ? 0.75 : 1;
    emp.militaryStrength = (emp.ownedSystemIds.length * 10 + emp.techLevel * 50 + emp.wealth * 0.05) * militaryMood;
    if (emp.godBoostTicks && emp.godBoostTicks > 0) {
      emp.militaryStrength *= 3;
      emp.godBoostTicks--;
    }
    emp.population = emp.ownedSystemIds.reduce((s, id) => s + (state.systems[id]?.population ?? 0) * 1000, 0);
  }
}

function stepProgress(state: GalaxyState, rng: PRNG): void {
  for (const emp of Object.values(state.empires)) {
    if (emp.ownedSystemIds.length === 0) continue;
    const avgStability = emp.ownedSystemIds.reduce((sum, id) => sum + (state.systems[id]?.stability ?? 0), 0) / emp.ownedSystemIds.length;
    const avgResources = emp.ownedSystemIds.reduce((sum, id) => sum + (state.systems[id]?.resources ?? 0), 0) / emp.ownedSystemIds.length;
    const peaceBonus = emp.activeWarEmpireIds.length === 0 ? 1 : 0.35;
    const progressChance = (0.004 * emp.cohesion * avgStability * peaceBonus + 0.001 * avgResources) * IDEOLOGY_MODS[emp.ideology].research;
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
    const warPenalty = Math.max(0.1, 1 - emp.activeWarEmpireIds.length * 0.35);
    const expandChance = emp.expansionism * 0.22 * emp.cohesion * Math.min(emp.wealth / 250, 1) * EXPANSION_MOOD_MULT[emp.mood] * IDEOLOGY_MODS[emp.ideology].expansion * warPenalty;
    if (rng.next() > expandChance) continue;
    const found = findExpansionTarget(state, emp);
    if (!found || hasFleetTo(state, emp.id, found.target.id)) continue;
    launchFleet(state, emp, found.origin, found.target, "colonizer", 8 + emp.techLevel * 6, rng);
    emp.wealth -= 8;
  }
}

/** How a war-room stance scales the autonomous war machine against one enemy. */
const WAR_FOCUS_MODS: Record<WarFocus, { fleetChance: number; strength: number }> = {
  attack: { fleetChance: 1.7, strength: 1.2 },
  defend: { fleetChance: 0.4, strength: 0.9 },
  raid: { fleetChance: 1.3, strength: 0.8 },
  exhaust: { fleetChance: 0.25, strength: 1.0 },
};

function stepConflict(state: GalaxyState, rng: PRNG): void {
  pruneExpiredModifiers(state);
  updateRelationships(state);
  for (const emp of Object.values(state.empires)) {
    const neighbors = getNeighboringEmpires(state, emp.id);
    const tensionMood = emp.mood === "crusading" ? 2 : emp.mood === "fortifying" ? 0.6 : emp.mood === "transcending" ? 0.3 : 1;
    const warFleetChance = emp.mood === "crusading" ? 0.3 : emp.mood === "fortifying" ? 0.08 : emp.mood === "transcending" ? 0.04 : 0.16;
    for (const neighborId of neighbors) {
      const rel = emp.relationshipByEmpireId[neighborId];
      if (!rel) continue;
      rel.tension = Math.min(100, rel.tension + emp.aggression * 2 * tensionMood * IDEOLOGY_MODS[emp.ideology].aggression);
      if (!rel.atWar && rel.tension > 65) tryDeclareWar(state, emp, neighborId, rng);
      if (rel.atWar) {
        tryMakePeace(state, emp, neighborId, rng);
        const directive = emp.warDirectives?.[neighborId];
        const focusMod = directive ? WAR_FOCUS_MODS[directive.focus].fleetChance : 1;
        if (rng.next() < warFleetChance * focusMod) launchWarFleet(state, emp, neighborId, rng);
        if (directive?.focus === "defend" && rng.next() < 0.02) {
          // defensive stance shores up the border instead of pressing forward
          for (const sysId of emp.ownedSystemIds) {
            const sys = state.systems[sysId];
            if (sys && sys.connectedSystemIds.some(nid => state.systems[nid]?.ownerEmpireId === neighborId)) {
              sys.stability = Math.min(1, sys.stability + 0.01);
            }
          }
        }
        if (directive?.focus === "exhaust") rel.tension = Math.min(100, rel.tension + 0.4);
      }
    }
    for (const rid of Object.keys(emp.relationshipByEmpireId)) if (!neighbors.includes(rid)) emp.relationshipByEmpireId[rid].tension = Math.max(0, emp.relationshipByEmpireId[rid].tension - 1);
    // war-room directives lapse when the war ends or the enemy is gone
    if (emp.warDirectives) {
      for (const targetId of Object.keys(emp.warDirectives)) {
        if (!state.empires[targetId] || !emp.activeWarEmpireIds.includes(targetId)) delete emp.warDirectives[targetId];
      }
    }
  }

  // Diplomatic accidents and master strokes: rare envoy-level luck that leaves a relation memory
  if (rng.next() < 0.0025) {
    const empireList = Object.values(state.empires);
    if (empireList.length >= 2) {
      const a = rng.pick(empireList);
      const neighbors = getNeighboringEmpires(state, a.id);
      if (neighbors.length > 0) {
        const bId = rng.pick(neighbors);
        const b = state.empires[bId];
        const rel = a.relationshipByEmpireId[bId];
        const relBack = b?.relationshipByEmpireId[a.id];
        if (b && rel && relBack && !rel.atWar) {
          if (rng.next() < 0.5) {
            const ev = createEvent(state, state.tick, "border-conflict", `Diplomatic accident: ${a.name} & ${b.name}`,
              `An envoy of ${a.name} gravely insulted the court of ${b.name}. Relations soured overnight.`,
              2, [a.id, b.id], []);
            const mod: RelationModifierInput = { kind: "diplomacy", label: "Diplomatic accident", opinionDelta: -14, tensionDelta: 10, expiresAtTick: state.tick + 400, sourceEventId: ev.id };
            addRelationModifier(rel, mod); addRelationModifier(relBack, { ...mod });
          } else {
            const ev = createEvent(state, state.tick, "peace-signed", `Diplomatic masterstroke: ${a.name} & ${b.name}`,
              `A brilliant envoy of ${a.name} charmed the court of ${b.name}; the two powers drew closer.`,
              2, [a.id, b.id], []);
            const mod: RelationModifierInput = { kind: "diplomacy", label: "Diplomatic masterstroke", opinionDelta: 16, tensionDelta: -12, expiresAtTick: state.tick + 400, sourceEventId: ev.id };
            addRelationModifier(rel, mod); addRelationModifier(relBack, { ...mod });
          }
        }
      }
    }
  }
}

function launchWarFleet(state: GalaxyState, attacker: Empire, defenderId: Id, rng: PRNG): void {
  const target = findBorderConflictTarget(state, attacker, defenderId);
  if (!target || hasFleetTo(state, attacker.id, target.id, "war")) return;
  const origin = nearestOwnedTo(state, attacker, target);
  if (!origin) return;
  const directive = attacker.warDirectives?.[defenderId];
  const strengthMod = directive ? WAR_FOCUS_MODS[directive.focus].strength : 1;
  const strength = Math.max(12, attacker.militaryStrength * rng.range(0.08, 0.18)) * strengthMod;
  const shipClass: ShipClass =
    directive?.focus === "raid" ? "raider"
      : attacker.wealth > 600 && (attacker.mood === "crusading" || rng.next() < 0.3) ? "armada"
      : rng.next() < 0.3 ? "raider" : "strike";
  if (shipClass === "armada") attacker.wealth -= 40;
  launchFleet(state, attacker, origin, target, "war", strength, rng, shipClass, topByRole(attacker, "admiral"));
}

function stepFleets(state: GalaxyState, rng: PRNG): void {
  for (const fleet of Object.values(state.fleets)) {
    const origin = state.systems[fleet.originSystemId]; const target = state.systems[fleet.targetSystemId]; const owner = state.empires[fleet.ownerEmpireId];
    if (!origin || !target || !owner) { delete state.fleets[fleet.id]; continue; }

    const arrived = advanceAlongPath(state, fleet);

    let travelled = 0;
    for (let i = 0; i < fleet.legIndex; i++) {
      const a = state.systems[fleet.path[i]], b = state.systems[fleet.path[i + 1]];
      if (a && b) travelled += dist(a, b);
    }
    const legA = state.systems[fleet.path[Math.min(fleet.legIndex, fleet.path.length - 1)]];
    const legB = state.systems[fleet.path[Math.min(fleet.legIndex + 1, fleet.path.length - 1)]];
    if (legA && legB) travelled += dist(legA, legB) * fleet.legProgress;
    fleet.progress = Math.min(1, travelled / fleet.totalDist);

    if (!arrived) continue;
    fleet.progress = 1;

    if (fleet.kind === "flagship") {
      // the flagship is persistent: it stations at its destination instead of disbanding
      const here = state.systems[fleet.path[fleet.path.length - 1]] ?? target;
      fleet.path = [here.id];
      fleet.legIndex = 0;
      fleet.legProgress = 1;
      fleet.originSystemId = here.id;
      fleet.targetSystemId = here.id;
      fleet.x = here.x;
      fleet.y = here.y;
      continue;
    }

    resolveFleetArrival(state, fleet, rng);
    delete state.fleets[fleet.id];
  }
}

function resolveFleetArrival(state: GalaxyState, fleet: Fleet, rng: PRNG): void {
  const owner = state.empires[fleet.ownerEmpireId]; const target = state.systems[fleet.targetSystemId];
  if (!owner || !target) return;

  if (fleet.kind === "merchant") {
    // merchants boost local wealth and empire wealth on arrival
    target.localWealth = Math.min(200, (target.localWealth ?? 0) + rng.range(3, 8));
    owner.wealth += rng.range(4, 12);
    return;
  }

  if (fleet.kind === "pilgrim") {
    // pilgrims spread their religion and boost stability
    if (owner.stateReligionId && !target.religionId) target.religionId = owner.stateReligionId;
    target.stability = Math.min(1, target.stability + 0.03);
    if (target.religionId && !target.markers?.some(m => m.kind === "holy-site")) {
      addMarker(target, "holy-site", state.tick, `Sacred to the faithful`);
    }
    return;
  }

  if (fleet.kind === "refugee") {
    // refugees settle at the destination, boosting population but stressing stability
    if (target.ownerEmpireId) {
      target.population = Math.min(2.5, target.population + 0.08);
      target.stability = Math.max(0.05, target.stability - 0.05);
    }
    return;
  }

  if (fleet.kind === "patrol") {
    // patrols steady the border world they sweep through; pure mood expression
    if (target.ownerEmpireId === owner.id) target.stability = Math.min(1, target.stability + 0.02);
    return;
  }

  if (fleet.kind === "colonizer") {
    if (target.ownerEmpireId !== null) {
      createEvent(state, state.tick, "system-colonized",
        `${fleet.name} found ${target.name} claimed`,
        `${fleet.name} arrived at ${target.name} but found it already under the control of ${state.empires[target.ownerEmpireId]?.name ?? "another power"}. The settlers dispersed.`,
        1, [owner.id], [target.id]);
      return;
    }
    target.ownerEmpireId = owner.id; target.cultureId = owner.cultureId; owner.ownedSystemIds.push(target.id); target.stability = Math.max(target.stability, 0.55);
    if (!target.religionId && owner.stateReligionId) target.religionId = owner.stateReligionId;
    createEvent(state, state.tick, "system-colonized", `${owner.name} colonized ${target.name}`, `${fleet.name} arrived and founded a colony for ${owner.name}.`, 1, [owner.id], [target.id]);
    discoverArtifact(state, target);
    return;
  }

  if (fleet.kind === "war") {
    const defenderId = target.ownerEmpireId;
    if (!defenderId || defenderId === owner.id) return;
    const defender = state.empires[defenderId]; if (!defender) return;
    const divineShield = (target.godBoostTicks ?? 0) > 0 ? 2.5 : 1;
    const fortressWorld = target.planets?.includes("fortress") ? 1.35 : 1;
    const forcefield = target.artifactId && state.artifacts?.[target.artifactId]?.kind === "stellar-forcefield" ? 1.4 : 1;
    const localDefense = (defender.militaryStrength * 0.08 + target.population * 18 + target.stability * 18) * rng.range(0.7, 1.35) * divineShield * fortressWorld * forcefield;
    const attack = fleet.strength * rng.range(0.75, 1.35);
    target.stability = Math.max(0.05, target.stability - 0.12); target.population = Math.max(0.03, target.population * rng.range(0.88, 0.98));

    // The battle leaves a scar regardless of outcome
    addMarker(target, "battlefield", state.tick, `Battle of ${target.name}`);

    if (attack > localDefense) {
      const tookCapital = defender.capitalSystemId === target.id;
      defender.ownedSystemIds = defender.ownedSystemIds.filter(id => id !== target.id); if (!owner.ownedSystemIds.includes(target.id)) owner.ownedSystemIds.push(target.id);
      target.ownerEmpireId = owner.id; target.stability = Math.max(0.1, target.stability - 0.18);
      owner.cohesion = Math.min(1, owner.cohesion + 0.01); defender.cohesion = Math.max(0.1, defender.cohesion - 0.05);
      if (fleet.shipClass === "raider") {
        // raiders strip the treasury as well as the world
        const loot = Math.min(defender.wealth, rng.range(25, 70));
        defender.wealth -= loot; owner.wealth += loot;
      }
      if (defender.capitalSystemId === target.id && defender.ownedSystemIds.length > 0) defender.capitalSystemId = defender.ownedSystemIds[0];
      const admiral = findCharacter(owner, fleet.admiralId);
      if (admiral) { admiral.renown = Math.min(1, admiral.renown + 0.08); admiral.loyalty = Math.min(1, admiral.loyalty + 0.02); }
      const credit = fleet.admiralName ? ` ${fleet.admiralName} is hailed for the victory.` : "";
      const captureEv = createEvent(state, state.tick, "border-conflict", `${owner.name} captured ${target.name}`, `${fleet.name} seized ${target.name} from ${defender.name}.${credit}`, tookCapital ? 4 : 3, [owner.id, defenderId], [target.id]);
      if (tookCapital) {
        // losing the throne world is a wound diplomacy remembers for a long time
        const relBack = defender.relationshipByEmpireId[owner.id];
        if (relBack) addRelationModifier(relBack, { kind: "clash", label: "Capital occupied", opinionDelta: -30, tensionDelta: 25, expiresAtTick: state.tick + 1500, sourceEventId: captureEv.id });
      }
      discoverArtifact(state, target);
      if (defender.ownedSystemIds.length === 0) collapseEmpire(state, defender, rng);
    } else {
      owner.cohesion = Math.max(0.1, owner.cohesion - 0.02);
      const clashEv = createEvent(state, state.tick, "border-conflict", `${owner.name} failed at ${target.name}`, `${fleet.name} was repelled by ${defender.name}.`, 2, [owner.id, defenderId], [target.id]);
      // a repelled assault still sours the border for a while
      const relBack = defender.relationshipByEmpireId[owner.id];
      if (relBack) addRelationModifier(relBack, { kind: "clash", label: "Border clash", opinionDelta: -6, tensionDelta: 8, expiresAtTick: state.tick + 300, sourceEventId: clashEv.id });
    }
  }
}

function stepCollapse(state: GalaxyState, rng: PRNG): void {
  for (const emp of Object.values(state.empires)) {
    if (emp.ownedSystemIds.length === 0) { collapseEmpire(state, emp, rng); continue; }
    if (emp.godBoostTicks && emp.godBoostTicks > 0) continue;
    const overextension = Math.max(0, emp.ownedSystemIds.length - 15) * 0.005;
    const warStrain = emp.activeWarEmpireIds.length * 0.02;
    const moodStrain = emp.mood === "rioting" ? 3 : emp.mood === "degenerating" ? 1.7 : 1;
    const collapseRisk = ((1 - emp.cohesion) * 0.05 + overextension + warStrain) * moodStrain;
    if (rng.next() > collapseRisk * 0.07) continue;
    if (emp.ownedSystemIds.length > 4 && rng.next() < 0.5) spawnRebellion(state, emp, rng); else if (emp.cohesion < 0.2 && emp.ownedSystemIds.length > 2) collapseEmpire(state, emp, rng);
  }
}

function spawnRebellion(state: GalaxyState, empire: Empire, rng: PRNG): void {
  const numDefect = rng.nextInt(1, Math.max(1, Math.floor(empire.ownedSystemIds.length / 3))); const defectingSet = new Set<Id>();
  const foreign = empire.ownedSystemIds.filter(id => { const s = state.systems[id]; return s && s.cultureId !== empire.cultureId && id !== empire.capitalSystemId; });
  for (const sysId of foreign.slice(0, numDefect)) defectingSet.add(sysId);
  for (let i = defectingSet.size; i < numDefect; i++) { const idx = rng.nextInt(0, empire.ownedSystemIds.length - 1); const sysId = empire.ownedSystemIds[idx]; if (sysId !== empire.capitalSystemId) defectingSet.add(sysId); }
  const defecting = [...defectingSet]; if (defecting.length === 0) return;
  const newId = `${empire.id}-rebel-${state.tick}`;
  const rebelNames = ["Liberation Front","Free States","Rebel Council","Independence Movement","Separatist League","Resistance","New Order","Sovereign Collective"];
  const rebelReligion = state.systems[defecting[0]]?.religionId ?? null;
  const newEmpire: Empire = { id: newId, name: `${rng.pick(["Broken","Free","New","Rogue","Rising","Lost"])} ${rng.pick(rebelNames)}`, color: `hsl(${rng.nextInt(0, 360)},${rng.nextInt(50, 90)}%,${rng.nextInt(35, 65)}%)`, mood: "expanding", moodSince: state.tick, ideology: rng.pick(IDEOLOGIES), ruler: makeRuler(rng, state.tick), court: makeCourt(rng, state.tick, rebelReligion !== null), capitalSystemId: defecting[0], ownedSystemIds: [], population: 0, wealth: 50, militaryStrength: 30, cohesion: rng.range(0.4, 0.8), aggression: rng.range(0.3, 0.8), expansionism: rng.range(0.3, 0.7), techLevel: empire.techLevel * 0.8, cultureId: `culture-rebel-${newId}`, stateReligionId: rebelReligion, relationshipByEmpireId: {}, activeWarEmpireIds: [], historicalEventIds: [], allianceIds: [] };
  for (const sysId of defecting) { const sys = state.systems[sysId]; if (!sys) continue; empire.ownedSystemIds = empire.ownedSystemIds.filter(id => id !== sysId); sys.ownerEmpireId = newId; sys.cultureId = newEmpire.cultureId; newEmpire.ownedSystemIds.push(sysId); }
  state.empires[newId] = newEmpire; empire.cohesion = Math.max(0.1, empire.cohesion - 0.2);

  // Spawn refugee ships from the most destabilized defecting systems
  if (defecting.length > 0 && rng.next() < 0.6) {
    const rebelSys = state.systems[defecting[0]];
    const destCandidates = Object.values(state.systems).filter(s => s.ownerEmpireId && s.ownerEmpireId !== newId && s.id !== defecting[0]);
    if (rebelSys && destCandidates.length > 0) {
      const dest = rng.pick(destCandidates);
      const rfId = `fleet-rfg-${state.tick}-${rng.nextInt(0, 9999)}`;
      const path = findPath(state, rebelSys.id, dest.id);
      state.fleets[rfId] = {
        id: rfId, name: `Refugees from ${rebelSys.name}`, kind: "refugee", shipClass: "settler",
        ownerEmpireId: newId, originSystemId: rebelSys.id, targetSystemId: dest.id,
        path, legIndex: 0, legProgress: 0, totalDist: Math.max(1, pathLength(state, path)),
        x: rebelSys.x, y: rebelSys.y, progress: 0,
        speed: rng.range(2.0, 3.2), strength: 1, createdTick: state.tick,
      };
    }
  }

  // Mark rebel hotbed on the capital of the defecting faction
  const rebelCapSys = state.systems[defecting[0]];
  if (rebelCapSys) addMarker(rebelCapSys, "rebel-hotbed", state.tick, `Birthplace of ${newEmpire.name}`);

  createEvent(state, state.tick, "rebellion", `Rebellion in ${empire.name}`, `${newEmpire.name} broke away from ${empire.name}.`, 4, [empire.id, newId], defecting);
}

function removeEmpireFromGalaxy(state: GalaxyState, empire: Empire): void {
  severEmpireRoutes(state, empire.id, "died with its partner");
  // Remove from alliances
  for (const allianceId of (empire.allianceIds ?? [])) {
    const alliance = state.alliances[allianceId];
    if (alliance) {
      alliance.memberEmpireIds = alliance.memberEmpireIds.filter(id => id !== empire.id);
      if (alliance.memberEmpireIds.length < 2) delete state.alliances[allianceId];
    }
  }
  delete state.empires[empire.id];
  for (const other of Object.values(state.empires)) { delete other.relationshipByEmpireId[empire.id]; other.activeWarEmpireIds = other.activeWarEmpireIds.filter(id => id !== empire.id); }
  for (const fleet of Object.values(state.fleets)) if (fleet.ownerEmpireId === empire.id) delete state.fleets[fleet.id];
}

function collapseEmpire(state: GalaxyState, empire: Empire, rng: PRNG): void {
  const collapsingSystems = [...empire.ownedSystemIds];
  for (const sysId of collapsingSystems) {
    const sys = state.systems[sysId];
    if (!sys) continue;
    sys.ownerEmpireId = null;
    sys.stability = Math.max(0.1, sys.stability - 0.3);
    // Mark ruins and dead capital
    addMarker(sys, "ruin", state.tick, `Ruins of ${empire.name}`);
    if (sysId === empire.capitalSystemId) addMarker(sys, "dead-capital", state.tick, `Former capital of ${empire.name}`);
  }

  // Messier collapse: sometimes a successor state rises from the ashes
  if (collapsingSystems.length >= 3 && rng.next() < 0.4) {
    const successorSysId = collapsingSystems[rng.nextInt(0, Math.min(2, collapsingSystems.length - 1))];
    const successorSys = state.systems[successorSysId];
    if (successorSys && successorSys.population > 0.2) {
      const sucId = `emp-suc-${empire.id}-${state.tick}`;
      const sucCultureId = empire.cultureId; // inherits culture
      const sucReligion = successorSys.religionId ?? empire.stateReligionId;
      const sucEmpire: Empire = {
        id: sucId,
        name: `${successorSys.name} ${rng.pick(["Remnant","Successor","Continuity","Restoration","Rump State"])}`,
        color: empire.color,
        mood: "fortifying", moodSince: state.tick,
        ideology: empire.ideology,
        ruler: makeRuler(rng, state.tick),
        court: makeCourt(rng, state.tick, sucReligion !== null),
        capitalSystemId: successorSysId,
        ownedSystemIds: [successorSysId],
        population: Math.max(successorSys.population * 800, 200),
        wealth: Math.max(50, empire.wealth * 0.1),
        militaryStrength: Math.max(20, empire.militaryStrength * 0.15),
        cohesion: rng.range(0.3, 0.6),
        aggression: empire.aggression * 0.7,
        expansionism: rng.range(0.2, 0.5),
        techLevel: empire.techLevel * 0.8,
        cultureId: sucCultureId,
        stateReligionId: sucReligion,
        relationshipByEmpireId: {},
        activeWarEmpireIds: [],
        historicalEventIds: [],
        allianceIds: [],
      };
      successorSys.ownerEmpireId = sucId;
      state.empires[sucId] = sucEmpire;
      createEvent(state, state.tick, "empire-founded",
        `${sucEmpire.name} rose from ${empire.name}'s ashes`,
        `As ${empire.name} crumbled, ${sucEmpire.name} claimed continuity at ${successorSys.name}.`,
        4, [sucId], [successorSysId]);
    }
  }

  // The fall scatters refugees toward whoever will take them
  const cap = state.systems[empire.capitalSystemId];
  if (cap) {
    const dests = Object.values(state.systems).filter(s => s.ownerEmpireId && s.ownerEmpireId !== empire.id);
    const waves = Math.min(2, dests.length);
    for (let i = 0; i < waves; i++) {
      if (rng.next() > 0.75) continue;
      const dest = rng.pick(dests);
      const rfId = `fleet-rfg-${state.tick}-${rng.nextInt(0, 99999)}`;
      const path = findPath(state, cap.id, dest.id);
      const destOwner = state.empires[dest.ownerEmpireId!];
      if (!destOwner) continue;
      state.fleets[rfId] = {
        id: rfId, name: `Refugees of fallen ${empire.name}`, kind: "refugee", shipClass: "settler",
        ownerEmpireId: destOwner.id, originSystemId: cap.id, targetSystemId: dest.id,
        path, legIndex: 0, legProgress: 0, totalDist: Math.max(1, pathLength(state, path)),
        x: cap.x, y: cap.y, progress: 0,
        speed: rng.range(2.0, 3.2), strength: 1, createdTick: state.tick,
      };
    }
  }

  createEvent(state, state.tick, "empire-collapsed", `${empire.name} collapsed`, `${empire.name} has disintegrated.`, 5, [empire.id], collapsingSystems);
  removeEmpireFromGalaxy(state, empire);
}

function transcendEmpire(state: GalaxyState, empire: Empire): void {
  for (const sysId of empire.ownedSystemIds) {
    const sys = state.systems[sysId];
    if (!sys) continue;
    sys.ownerEmpireId = null;
    sys.stability = Math.max(sys.stability, 0.7);
    sys.techLevel = Math.max(sys.techLevel, empire.techLevel * 0.9);
    addMarker(sys, "transcendent-ruin", state.tick, `Legacy of ${empire.name}`);
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
    if (emp.mood === "transcending") continue;
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
    const deathChance = Math.min(0.008, 0.0006 + reign * 0.000003);
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
    emp.aggression = Math.min(1, Math.max(0.05, emp.aggression + rng.range(-0.2, 0.2)));
    emp.expansionism = Math.min(1, Math.max(0.05, emp.expansionism + rng.range(-0.2, 0.2)));
    const cap = state.systems[emp.capitalSystemId];
    const dynastyNote = sameDynasty ? "" : ` The ${old.dynasty} dynasty has fallen; the ${emp.ruler.dynasty} dynasty rises.`;
    createEvent(state, state.tick, "succession", `${oldDisplay} of ${emp.name} has died`, `After a reign of ${reign} ticks, ${rulerDisplayName(emp)} ascended the throne of ${emp.name}.${dynastyNote}`, sameDynasty ? 2 : 3, [emp.id], cap ? [cap.id] : []);
  }
}

function stepPolitics(state: GalaxyState, rng: PRNG): void {
  for (const emp of Object.values(state.empires)) {
    const unrest = (1 - emp.cohesion) * (emp.mood === "rioting" ? 3 : emp.mood === "degenerating" ? 1.6 : 1);
    const warPressure = emp.ideology === "pacifist" && emp.activeWarEmpireIds.length >= 2 ? 0.002 : 0;
    if (rng.next() > unrest * 0.0009 + warPressure) continue;
    const oldRuler = rulerDisplayName(emp);
    const oldIdeology = emp.ideology;
    emp.ruler = makeRuler(rng, state.tick);
    const flips = IDEOLOGIES.filter(i => i !== oldIdeology);
    emp.ideology = warPressure > 0 ? "militarist" : rng.pick(flips);
    emp.cohesion = Math.max(0.1, emp.cohesion - 0.12);
    emp.aggression = Math.min(1, Math.max(0.05, emp.aggression + rng.range(-0.15, 0.3)));
    const cap = state.systems[emp.capitalSystemId];
    if (cap) cap.stability = Math.max(0.05, cap.stability - 0.15);
    createEvent(state, state.tick, "coup", `Coup in ${emp.name}`,
      `${oldRuler} was overthrown; ${rulerDisplayName(emp)} seized power and steered ${emp.name} from ${IDEOLOGY_LABEL[oldIdeology].toLowerCase()} rule toward ${IDEOLOGY_LABEL[emp.ideology].toLowerCase()} rule.`,
      4, [emp.id], cap ? [cap.id] : []);
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
  const techBase = candidate.kind === "native" ? 0.25
    : candidate.kind === "frontier" ? 0.35
    : Math.max(0.55, sys.techLevel * 0.75);
  const cohesionBonus = candidate.kind === "pretender" ? 0.08 : candidate.kind === "successor" ? -0.05 : 0;
  const aggressionBonus = candidate.kind === "pretender" ? 0.25 : candidate.kind === "successor" ? 0.1 : 0;

  return {
    id,
    name: emergenceName(candidate.kind, sys, rng),
    color: `hsl(${rng.nextInt(0, 360)},${rng.nextInt(55, 85)}%,${rng.nextInt(40, 62)}%)`,
    mood: candidate.kind === "pretender" ? "crusading" : "expanding",
    moodSince: state.tick,
    ideology: candidate.kind === "pretender" ? "militarist" : rng.pick(IDEOLOGIES),
    ruler: makeRuler(rng, state.tick),
    court: makeCourt(rng, state.tick, sys.religionId !== null),
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
    stateReligionId: sys.religionId,
    relationshipByEmpireId: {},
    activeWarEmpireIds: [],
    historicalEventIds: [],
    allianceIds: [],
  };
}

function stepEmergence(state: GalaxyState, rng: PRNG): void {
  const empireCount = Object.keys(state.empires).length;
  const targetEmpires = Math.max(6, Math.round(Object.keys(state.systems).length / 40));
  const deficit = Math.max(0, targetEmpires - empireCount);
  const chance = Math.max(0.0003, deficit * 0.0012);
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

// ── Relation modifier decay ───────────────────────────────────────────────────

function stepRelationModifiers(state: GalaxyState): void {
  for (const emp of Object.values(state.empires)) {
    for (const rel of Object.values(emp.relationshipByEmpireId)) {
      if (!rel.modifiers || rel.modifiers.length === 0) continue;
      for (const mod of rel.modifiers) {
        if (mod.expiresAtTick && state.tick >= mod.expiresAtTick) continue;
        rel.opinion = Math.max(0, Math.min(100, rel.opinion + mod.opinionDelta * 0.008));
        rel.tension = Math.max(0, Math.min(100, rel.tension + mod.tensionDelta * 0.008));
      }
      rel.modifiers = rel.modifiers.filter(m => !m.expiresAtTick || state.tick < m.expiresAtTick);
    }
  }
}

// ── Local star weirdness ──────────────────────────────────────────────────────

function stepLocalStarWeirdness(state: GalaxyState, rng: PRNG): void {
  if (rng.next() > 0.025) return;
  for (const sys of Object.values(state.systems)) {
    // planet-flavored local incidents: stars are more than ownership dots
    if (sys.planets?.length && sys.ownerEmpireId && rng.next() < 0.0008) {
      const emp = state.empires[sys.ownerEmpireId];
      if (emp) {
        if (sys.planets.includes("sacred") && sys.religionId) {
          sys.stability = Math.min(1, sys.stability + 0.02);
          if (!sys.markers?.some(m => m.kind === "holy-site")) addMarker(sys, "holy-site", state.tick, "Sacred world of pilgrimage");
          if (rng.next() < 0.3) createEvent(state, state.tick, "religion-adopted",
            `Pilgrims gather at ${sys.name}`,
            `Pilgrims crowded the sacred world of ${sys.name}, swelling the faith there.`,
            1, [emp.id], [sys.id]);
        } else if (sys.planets.includes("ancient") && rng.next() < 0.4) {
          emp.techLevel = Math.min(3, emp.techLevel + 0.01);
          sys.techLevel = Math.min(3, sys.techLevel + 0.02);
          if (rng.next() < 0.35) createEvent(state, state.tick, "technology-breakthrough",
            `Ancient vaults stir beneath ${sys.name}`,
            `Scholars of ${emp.name} pried another secret from the ancient ruins of ${sys.name}.`,
            2, [emp.id], [sys.id]);
        } else if (sys.planets.includes("industrial") && rng.next() < 0.3) {
          emp.wealth += rng.range(15, 40);
          if (rng.next() < 0.2) createEvent(state, state.tick, "golden-age",
            `The forges of ${sys.name} surge`,
            `The industrial belts of ${sys.name} delivered a windfall to ${emp.name}.`,
            1, [emp.id], [sys.id]);
        }
      }
    }
    if (!sys.markers || sys.markers.length === 0) continue;
    for (const marker of sys.markers) {
      if (rng.next() > 0.0015) continue;
      switch (marker.kind) {
        case "rebel-hotbed": {
          if (!sys.ownerEmpireId) break;
          const emp = state.empires[sys.ownerEmpireId];
          if (!emp) break;
          emp.wealth = Math.max(0, emp.wealth - rng.range(20, 55));
          emp.cohesion = Math.max(0.05, emp.cohesion - 0.008);
          if (rng.next() < 0.25) createEvent(state, state.tick, "rebellion",
            `Tax revolt at ${sys.name}`,
            `Rebel sympathizers at ${sys.name} refused imperial taxes, costing ${emp.name} dearly.`,
            2, [emp.id], [sys.id]);
          break;
        }
        case "plague-world": {
          const neighbors = sys.connectedSystemIds.map(id => state.systems[id]).filter(Boolean) as typeof sys[];
          if (neighbors.length > 0 && rng.next() < 0.35) {
            const victim = rng.pick(neighbors);
            victim.population = Math.max(0.05, victim.population * rng.range(0.88, 0.96));
            victim.stability = Math.max(0.05, victim.stability - 0.04);
          }
          if (rng.next() < 0.12 && sys.ownerEmpireId) {
            const emp = state.empires[sys.ownerEmpireId];
            const dests = Object.values(state.systems).filter(s => s.ownerEmpireId && s.id !== sys.id && s.population < 1.5);
            if (emp && dests.length > 0) {
              const dest = rng.pick(dests);
              const rfId = `fleet-rfg-${state.tick}-${rng.nextInt(0, 9999)}`;
              if (!hasFleetTo(state, emp.id, dest.id, "refugee")) {
                const path = findPath(state, sys.id, dest.id);
                state.fleets[rfId] = {
                  id: rfId, name: `Plague Refugees from ${sys.name}`, kind: "refugee", shipClass: "settler",
                  ownerEmpireId: emp.id, originSystemId: sys.id, targetSystemId: dest.id,
                  path, legIndex: 0, legProgress: 0, totalDist: Math.max(1, pathLength(state, path)),
                  x: sys.x, y: sys.y, progress: 0, speed: rng.range(2.5, 3.5), strength: 1, createdTick: state.tick,
                };
              }
            }
          }
          break;
        }
        case "dead-capital": {
          sys.stability = Math.max(0.05, sys.stability - 0.005);
          const nearEmpires = sys.connectedSystemIds
            .map(id => state.systems[id]?.ownerEmpireId)
            .filter(Boolean) as string[];
          if (nearEmpires.length > 0 && rng.next() < 0.25) {
            const empId = rng.pick(nearEmpires);
            const emp = state.empires[empId];
            const pretender = emp?.court.find(c => c.role === "pretender");
            if (pretender) {
              pretender.renown = Math.min(1, pretender.renown + 0.015);
              pretender.loyalty = Math.max(0, pretender.loyalty - 0.008);
            }
          }
          break;
        }
        case "trade-hub": {
          if (rng.next() < 0.07) {
            sys.stability = Math.max(0.05, sys.stability - 0.015);
            sys.localWealth = Math.max(0, (sys.localWealth ?? 0) - rng.range(5, 14));
            if (rng.next() < 0.18 && sys.ownerEmpireId) {
              const emp = state.empires[sys.ownerEmpireId];
              if (emp) createEvent(state, state.tick, "border-conflict",
                `Raiders strike ${sys.name}`,
                `Pirates exploited the prosperity of ${sys.name}'s trade hub, disrupting commerce for ${emp.name}.`,
                2, [emp.id], [sys.id]);
            }
          }
          break;
        }
        case "artifact-aura": {
          if (rng.next() < 0.04 && sys.ownerEmpireId) {
            const emp = state.empires[sys.ownerEmpireId];
            if (emp) { emp.techLevel = Math.min(3, emp.techLevel + 0.004); sys.techLevel = Math.min(3, sys.techLevel + 0.008); }
          }
          break;
        }
      }
    }
  }
}

export function executeTick(state: GalaxyState, rng: PRNG): void {
  stepGrowth(state, rng); stepProgress(state, rng); stepReligion(state, rng); stepCharacters(state, rng); stepMoods(state, rng); stepRulers(state, rng); stepPolitics(state, rng);
  stepFleets(state, rng); stepExpansion(state, rng); stepConflict(state, rng); stepTrade(state, rng); stepMonsters(state, rng); stepCrises(state, rng); stepOddities(state, rng);
  stepCollapse(state, rng); stepEmergence(state, rng);
  stepLocalWealth(state); stepArtifacts(state); stepAmbientShips(state, rng); stepAlliances(state, rng); stepPlayerControl(state, rng);
  stepRelationModifiers(state); stepLocalStarWeirdness(state, rng);
  state.tick++;
}
