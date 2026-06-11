import type { GalaxyState, StarSystem, Monster, MonsterKind, PRNG, SystemMarker, MarkerKind, Oddity, OddityKind } from "../types/sim";
import { createEvent } from "./Events";
import { findPath, advanceAlongPath, dist } from "./Pathing";
import { makeName } from "./Galaxy";

function addMarker(sys: StarSystem, kind: MarkerKind, tick: number, label?: string): void {
  if (!sys.markers) sys.markers = [];
  const existing = sys.markers.findIndex(m => m.kind === kind);
  const marker: SystemMarker = { kind, since: tick, label };
  if (existing >= 0) sys.markers[existing] = marker;
  else sys.markers.push(marker);
}

export function discoverArtifact(state: GalaxyState, sys: StarSystem): void {
  if (!sys.artifactName || !sys.ownerEmpireId) return;
  const owner = state.empires[sys.ownerEmpireId];
  if (!owner) return;
  const artifact = sys.artifactId ? state.artifacts?.[sys.artifactId] : null;
  if (artifact) {
    artifact.ownerEmpireId = owner.id;
    artifact.capturedTick = state.tick;
    if (artifact.discoveredTick !== undefined) return;
    artifact.discoveredTick = state.tick;
  }
  const name = artifact?.name ?? sys.artifactName;
  owner.techLevel = Math.min(3, owner.techLevel + 0.25);
  owner.wealth += 250;
  sys.techLevel = Math.min(3, sys.techLevel + 0.5);
  addMarker(sys, "artifact-aura", state.tick, `Aura of ${name}`);
  createEvent(state, state.tick, "artifact-discovered", `${owner.name} unearthed the ${name}`,
    `Excavations on ${sys.name} revealed the ${name}, a precursor artifact of immense value.`,
    4, [owner.id], [sys.id]);
}

const MONSTER_KINDS: Array<{ kind: MonsterKind; label: string; hp: number; strength: number; speed: [number, number] }> = [
  { kind: "leviathan", label: "Void Leviathan", hp: 320, strength: 60, speed: [0.7, 1.2] },
  { kind: "wraith", label: "Star Wraith", hp: 140, strength: 35, speed: [1.6, 2.6] },
  { kind: "swarm", label: "Devourer Swarm", hp: 220, strength: 45, speed: [1.0, 1.8] },
];

function pickMonsterTarget(state: GalaxyState, rng: PRNG, fromId: string): StarSystem | null {
  const owned = Object.values(state.systems).filter(s => s.ownerEmpireId && s.population > 0.3);
  if (owned.length === 0) return null;
  // hunt rich, populous worlds, preferring nearer ones
  const from = state.systems[fromId];
  const scored = owned.map(s => ({ s, score: s.population * 2 + s.resources - (from ? dist(from, s) / 600 : 0) + rng.next() }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0].s;
}

function spawnMonster(state: GalaxyState, rng: PRNG): void {
  const fringe = Object.values(state.systems).filter(s => !s.ownerEmpireId);
  if (fringe.length === 0) return;
  const origin = rng.pick(fringe);
  const target = pickMonsterTarget(state, rng, origin.id);
  if (!target) return;
  const spec = rng.pick(MONSTER_KINDS);
  const id = `monster-${state.tick}-${Object.keys(state.monsters).length}`;
  const monster: Monster = {
    id,
    name: `${spec.label} ${makeName(rng)}`,
    kind: spec.kind,
    path: findPath(state, origin.id, target.id),
    legIndex: 0,
    legProgress: 0,
    x: origin.x,
    y: origin.y,
    speed: rng.range(spec.speed[0], spec.speed[1]),
    hp: spec.hp,
    maxHp: spec.hp,
    strength: spec.strength,
    spawnedTick: state.tick,
  };
  state.monsters[id] = monster;
  createEvent(state, state.tick, "monster-spawned", `${monster.name} stirs`,
    `A ${spec.label.toLowerCase()} emerged from the deep void near ${origin.name} and is hunting inhabited worlds.`,
    4, [], [origin.id, target.id]);
}

export function stepMonsters(state: GalaxyState, rng: PRNG): void {
  const empireCount = Object.keys(state.empires).length;
  const markerCount = Object.values(state.systems).reduce((n, s) => n + (s.markers?.length ?? 0), 0);
  const monsterRate = 0.0010 + markerCount * 0.000004 + Math.min(0.0004, state.tick / 3000000);
  if (Object.keys(state.monsters).length < 2 && empireCount > 3 && rng.next() < monsterRate) spawnMonster(state, rng);

  for (const monster of Object.values(state.monsters)) {
    const arrived = advanceAlongPath(state, monster);
    if (!arrived) continue;
    const here = state.systems[monster.path[monster.path.length - 1]];
    if (!here) { delete state.monsters[monster.id]; continue; }

    const owner = here.ownerEmpireId ? state.empires[here.ownerEmpireId] : null;
    if (owner) {
      // rampage: the world bleeds while the local fleet bites back
      here.population = Math.max(0.02, here.population - 0.04 * (monster.strength / 40));
      here.stability = Math.max(0.05, here.stability - 0.03);
      const defense = owner.militaryStrength * 0.012 * rng.range(0.5, 1.5);
      monster.hp -= defense;
      if (rng.next() < 0.05) {
        createEvent(state, state.tick, "monster-attack", `${monster.name} ravages ${here.name}`,
          `The ${monster.name} is devastating ${here.name}; the fleets of ${owner.name} battle to drive it off.`,
          4, [owner.id], [here.id]);
      }
      if (monster.hp <= 0) {
        delete state.monsters[monster.id];
        owner.cohesion = Math.min(1, owner.cohesion + 0.06);
        owner.wealth += 180;
        createEvent(state, state.tick, "monster-slain", `${monster.name} slain at ${here.name}`,
          `The fleets of ${owner.name} destroyed the ${monster.name}. Songs will be sung of this day.`,
          5, [owner.id], [here.id]);
        continue;
      }
      // sometimes it gluts itself and moves to the next feast
      if (here.population <= 0.1 || rng.next() < 0.02) {
        const next = pickMonsterTarget(state, rng, here.id);
        if (next && next.id !== here.id) {
          monster.path = findPath(state, here.id, next.id);
          monster.legIndex = 0; monster.legProgress = 0;
        }
      }
    } else {
      // resting in dead space; old horrors eventually drift back into legend
      if (state.tick - monster.spawnedTick > 1500 && rng.next() < 0.01) { delete state.monsters[monster.id]; continue; }
      if (rng.next() < 0.04) {
        const next = pickMonsterTarget(state, rng, here.id);
        if (next) { monster.path = findPath(state, here.id, next.id); monster.legIndex = 0; monster.legProgress = 0; }
      }
    }
  }
}

const ODDITY_NAMES: Record<OddityKind, string[]> = {
  "star-eater": ["The Hungering Void", "Entropy's Maw", "The Great Consuming"],
  "puppet-mind": ["Xenomorphic Puppeteer", "The Hive Whisper", "Psychic Dominator"],
  "sloth-cloud": ["Torpor Nebula", "The Dreaming Density", "Lethic Cloud"],
  "replicator": ["The Copying Engine", "Mimetic Storm", "Reality Echo"],
  "void-gate": ["The Null Gate", "Void Aperture", "Tear in Space"],
};

const ODDITY_KINDS: OddityKind[] = ["star-eater", "puppet-mind", "sloth-cloud", "replicator", "void-gate"];

function pickDistantSystem(state: GalaxyState, from: StarSystem, rng: PRNG): StarSystem {
  const systems = Object.values(state.systems);
  const distant = systems.filter(s => dist(s, from) > 260);
  return rng.pick(distant.length ? distant : systems);
}

function spawnOddity(state: GalaxyState, rng: PRNG): void {
  state.oddities ??= {};
  const systems = Object.values(state.systems);
  if (systems.length === 0) return;
  const origin = rng.pick(systems);
  const target = pickDistantSystem(state, origin, rng);
  const kind = rng.pick(ODDITY_KINDS);
  const id = `oddity-${state.tick}-${Object.keys(state.oddities).length}-${rng.nextInt(0, 9999)}`;
  const oddity: Oddity = {
    id,
    kind,
    name: rng.pick(ODDITY_NAMES[kind]),
    x: origin.x,
    y: origin.y,
    targetSystemId: target.id,
    path: findPath(state, origin.id, target.id),
    legIndex: 0,
    legProgress: 0,
    speed: rng.range(0.35, 0.95),
    strength: rng.range(0.5, 1.2),
    spawnedTick: state.tick,
    lastPulseTick: state.tick,
  };
  state.oddities[id] = oddity;
  addMarker(origin, kind === "replicator" ? "artifact-aura" : "ruin", state.tick, `${oddity.name} manifested`);
  createEvent(state, state.tick, "galactic-crisis", `${oddity.name} manifested`,
    `A ${kind.replace("-", " ")} appeared near ${origin.name} and began drifting through the starlanes.`,
    5, [], [origin.id, target.id]);
}

function applyOddityPulse(state: GalaxyState, oddity: Oddity, center: StarSystem, rng: PRNG): void {
  const nearby = Object.values(state.systems).filter(s => dist(s, center) < 140);
  switch (oddity.kind) {
    case "star-eater":
      for (const s of nearby) {
        s.population = Math.max(0.02, s.population * 0.97);
        s.resources = Math.max(0.05, s.resources * 0.985);
        s.stability = Math.max(0.05, s.stability - 0.01);
        if (rng.next() < 0.08) addMarker(s, "ruin", state.tick, `Scorched by ${oddity.name}`);
      }
      break;
    case "puppet-mind":
      for (const emp of Object.values(state.empires)) {
        const cap = state.systems[emp.capitalSystemId];
        if (!cap || dist(cap, center) > 180) continue;
        emp.cohesion = Math.max(0.05, emp.cohesion - 0.012);
        if (rng.next() < 0.16) {
          const moods = ["rioting", "crusading", "degenerating"] as const;
          emp.mood = rng.pick(moods);
          emp.moodSince = state.tick;
        }
      }
      break;
    case "sloth-cloud":
      for (const fleet of Object.values(state.fleets)) {
        if (Math.hypot(fleet.x - oddity.x, fleet.y - oddity.y) < 120) {
          fleet.speed = Math.max(0.25, fleet.speed * 0.92);
        }
      }
      for (const s of nearby) s.stability = Math.max(0.05, s.stability - 0.004);
      break;
    case "replicator":
      for (const s of nearby) {
        s.techLevel = Math.min(3, s.techLevel + 0.006);
        if (s.ownerEmpireId) {
          const emp = state.empires[s.ownerEmpireId];
          if (emp) emp.techLevel = Math.min(3, emp.techLevel + 0.002);
        }
      }
      break;
    case "void-gate": {
      const warFleets = Object.values(state.fleets).filter(f => Math.hypot(f.x - oddity.x, f.y - oddity.y) < 90 && f.kind === "war");
      for (const fleet of warFleets.slice(0, 1)) {
        const dest = pickDistantSystem(state, center, rng);
        fleet.x = dest.x;
        fleet.y = dest.y;
        fleet.originSystemId = dest.id;
        fleet.targetSystemId = dest.id;
        fleet.path = [dest.id];
        fleet.legIndex = 0;
        fleet.legProgress = 0;
      }
      addMarker(center, "ruin", state.tick, `Space warped by ${oddity.name}`);
      break;
    }
  }
}

export function stepOddities(state: GalaxyState, rng: PRNG): void {
  state.oddities ??= {};
  if (Object.keys(state.oddities).length < 3 && rng.next() < 0.00022) spawnOddity(state, rng);

  for (const oddity of Object.values(state.oddities)) {
    const arrived = advanceAlongPath(state, oddity);
    const here = state.systems[oddity.path[Math.min(oddity.legIndex, oddity.path.length - 1)] ?? oddity.targetSystemId];
    if (!here) {
      delete state.oddities[oddity.id];
      continue;
    }
    if (state.tick - oddity.lastPulseTick > 45) {
      oddity.lastPulseTick = state.tick;
      applyOddityPulse(state, oddity, here, rng);
      if (rng.next() < 0.18) {
        createEvent(state, state.tick, "galactic-crisis", `${oddity.name} distorts ${here.name}`,
          `${oddity.name} passed through ${here.name}, leaving ${oddity.kind.replace("-", " ")} effects in its wake.`,
          3, [], [here.id]);
      }
    }
    if (arrived) {
      const next = pickDistantSystem(state, here, rng);
      oddity.targetSystemId = next.id;
      oddity.path = findPath(state, here.id, next.id);
      oddity.legIndex = 0;
      oddity.legProgress = 0;
    }
    if (state.tick - oddity.spawnedTick > 2600 && rng.next() < 0.006) {
      createEvent(state, state.tick, "galactic-crisis", `${oddity.name} faded`,
        `${oddity.name} dissolved back into deep space near ${here.name}.`,
        3, [], [here.id]);
      delete state.oddities[oddity.id];
    }
  }

  if (rng.next() > 0.00025) return;
  const systems = Object.values(state.systems);
  if (systems.length === 0) return;
  const center = rng.pick(systems);
  const roll = rng.next();

  if (roll < 0.2) {
    // Star-eater: devastates a rich sector
    const name = rng.pick(ODDITY_NAMES["star-eater"]);
    const struck = systems.filter(s => dist(s, center) < 200 && s.population > 0.1);
    for (const s of struck) {
      s.population = Math.max(0.02, s.population * rng.range(0.4, 0.7));
      s.resources = Math.max(0.05, s.resources * rng.range(0.6, 0.85));
      s.stability = Math.max(0.05, s.stability - 0.2);
      addMarker(s, "ruin", state.tick, `Consumed by ${name}`);
    }
    if (struck.length > 0) createEvent(state, state.tick, "galactic-crisis",
      `${name} manifested`,
      `${name} swept through ${struck.length} star systems near ${center.name}, consuming life and resources.`,
      5, [], struck.slice(0, 8).map(s => s.id));
  } else if (roll < 0.4) {
    // Puppet-mind: forces mood shifts on nearby empires
    const name = rng.pick(ODDITY_NAMES["puppet-mind"]);
    const affected: string[] = [];
    for (const emp of Object.values(state.empires)) {
      const cap = state.systems[emp.capitalSystemId];
      if (!cap || dist(cap, center) > 350) continue;
      const old = emp.mood;
      const forcedMoods = ["rioting", "crusading", "degenerating"] as const;
      emp.mood = rng.pick(forcedMoods);
      emp.moodSince = state.tick;
      emp.cohesion = Math.max(0.1, emp.cohesion - 0.1);
      affected.push(emp.id);
      createEvent(state, state.tick, "mood-shift",
        `${emp.name} gripped by psychic influence`,
        `${name} influenced ${emp.name}, shifting its mood from ${old} to ${emp.mood}.`,
        3, [emp.id], cap ? [cap.id] : []);
    }
    if (affected.length > 0) createEvent(state, state.tick, "galactic-crisis",
      `${name} detected`,
      `A xenopsychic entity — ${name} — manifested near ${center.name}, destabilizing ${affected.length} nearby civilizations.`,
      5, affected, [center.id]);
  } else if (roll < 0.6) {
    // Sloth-cloud: destroys all non-merchant fleets in a wide region
    const name = rng.pick(ODDITY_NAMES["sloth-cloud"]);
    const trapped = Object.values(state.fleets).filter(f =>
      Math.hypot(f.x - center.x, f.y - center.y) < 250 && f.kind !== "merchant"
    );
    for (const f of trapped) delete state.fleets[f.id];
    for (const s of systems) if (dist(s, center) < 250) s.stability = Math.max(0.05, s.stability - 0.04);
    createEvent(state, state.tick, "galactic-crisis",
      `${name} engulfs region near ${center.name}`,
      `A ${name} manifested near ${center.name}, consuming ${trapped.length} fleet${trapped.length === 1 ? "" : "s"} in stasis.`,
      4, [], [center.id]);
  } else if (roll < 0.8) {
    // Replicator: gives tech boosts to nearby empires
    const name = rng.pick(ODDITY_NAMES["replicator"]);
    const lucky: string[] = [];
    for (const emp of Object.values(state.empires)) {
      const cap = state.systems[emp.capitalSystemId];
      if (!cap || dist(cap, center) > 280) continue;
      emp.techLevel = Math.min(3, emp.techLevel + rng.range(0.15, 0.4));
      for (const sysId of emp.ownedSystemIds.slice(0, 10)) {
        const s = state.systems[sysId];
        if (s) s.techLevel = Math.max(s.techLevel, emp.techLevel * 0.85);
      }
      lucky.push(emp.id);
    }
    if (lucky.length > 0) createEvent(state, state.tick, "galactic-crisis",
      `${name} seeded near ${center.name}`,
      `${name} emerged near ${center.name}, replicating advanced technologies for ${lucky.length} nearby civilizations.`,
      4, lucky, [center.id]);
  } else {
    // Void-gate: shunts nearby fleets to distant systems
    const name = rng.pick(ODDITY_NAMES["void-gate"]);
    const fleetList = Object.values(state.fleets).filter(f =>
      Math.hypot(f.x - center.x, f.y - center.y) < 150 && f.kind === "war"
    );
    const distant = systems.filter(s => dist(s, center) > 400);
    let shunted = 0;
    for (const fleet of fleetList.slice(0, 3)) {
      if (distant.length === 0) break;
      const dest = rng.pick(distant);
      fleet.x = dest.x; fleet.y = dest.y;
      fleet.targetSystemId = dest.id; fleet.originSystemId = dest.id;
      fleet.path = [dest.id]; fleet.legIndex = 0; fleet.legProgress = 0;
      shunted++;
    }
    if (shunted > 0) {
      addMarker(center, "ruin", state.tick, `Site of ${name}`);
      createEvent(state, state.tick, "galactic-crisis",
        `${name} tears space near ${center.name}`,
        `${name} opened a void aperture near ${center.name}, shunting ${shunted} fleet${shunted === 1 ? "" : "s"} to distant corners of the galaxy.`,
        4, [], [center.id]);
    }
  }
}

// Rare galaxy-shaking events that punctuate the slow grind of history.
export function stepCrises(state: GalaxyState, rng: PRNG): void {
  // Scale crisis rate with galaxy age and active war count
  const warCount = Object.values(state.empires).reduce((n, e) => n + e.activeWarEmpireIds.length, 0);
  const markerCount = Object.values(state.systems).reduce((n, s) => n + (s.markers?.length ?? 0), 0);
  const baseRate = 0.0007 + Math.min(0.0006, state.tick / 4000000) + warCount * 0.000008 + markerCount * 0.000002;
  if (rng.next() > baseRate) return;
  const roll = rng.next();
  const systems = Object.values(state.systems);

  if (roll < 0.35) {
    // plague: sweeps a region around an unlucky populous world
    const populous = systems.filter(s => s.population > 0.5);
    if (populous.length === 0) return;
    const center = rng.pick(populous);
    const struck = systems.filter(s => dist(s, center) < 160 && s.population > 0.1);
    for (const s of struck) { s.population = Math.max(0.05, s.population * rng.range(0.55, 0.8)); s.stability = Math.max(0.05, s.stability - 0.15); }
    createEvent(state, state.tick, "galactic-crisis", `Plague spreads from ${center.name}`,
      `A virulent plague swept ${struck.length} worlds around ${center.name}, gutting their populations.`,
      5, [], struck.slice(0, 8).map(s => s.id));
  } else if (roll < 0.6) {
    // hyperlane storm: ships in a region are torn apart
    const center = rng.pick(systems);
    const lost = Object.values(state.fleets).filter(f => Math.hypot(f.x - center.x, f.y - center.y) < 180);
    for (const f of lost) delete state.fleets[f.id];
    for (const s of systems) if (dist(s, center) < 180) s.stability = Math.max(0.05, s.stability - 0.08);
    createEvent(state, state.tick, "galactic-crisis", `Hyperlane storm near ${center.name}`,
      `A hyperlane storm raged around ${center.name}${lost.length ? `, destroying ${lost.length} fleet${lost.length === 1 ? "" : "s"} in transit` : ""}.`,
      4, [], [center.id]);
  } else if (roll < 0.8) {
    // ancient awakening: something old and hungry wakes
    spawnMonster(state, rng);
  } else {
    // tech cascade: a random empire leaps ahead
    const empires = Object.values(state.empires);
    if (empires.length === 0) return;
    const lucky = rng.pick(empires);
    lucky.techLevel = Math.min(3, lucky.techLevel + 0.3);
    lucky.wealth += 200;
    const cap = state.systems[lucky.capitalSystemId];
    createEvent(state, state.tick, "galactic-crisis", `Tech cascade in ${lucky.name}`,
      `Researchers in ${lucky.name} triggered a cascade of breakthroughs, vaulting the empire a generation ahead.`,
      4, [lucky.id], cap ? [cap.id] : []);
  }
}
