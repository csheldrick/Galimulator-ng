import type { GalaxyState, StarSystem, Empire, Monster, MonsterKind, Oddity, OddityKind, PRNG, SystemMarker, MarkerKind } from "../types/sim";
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
  // The buried structure becomes a known, persistent artifact: a one-time
  // discovery windfall, then ongoing kind-specific effects via stepArtifacts.
  const artifact = sys.artifactId ? state.artifacts?.[sys.artifactId] : undefined;
  if (artifact) {
    if (artifact.discoveredTick !== undefined) return; // already unearthed
    artifact.discoveredTick = state.tick;
    artifact.ownerEmpireId = owner.id;
  }
  const name = sys.artifactName;
  if (!artifact) sys.artifactName = null; // no backing object: one-shot reward only
  owner.techLevel = Math.min(3, owner.techLevel + 0.25);
  owner.wealth += 250;
  sys.techLevel = Math.min(3, sys.techLevel + 0.5);
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

const MAX_ODDITIES = 3;

function spawnOddity(state: GalaxyState, rng: PRNG, forcedKind?: OddityKind): void {
  state.oddities ??= {};
  const systems = Object.values(state.systems);
  if (systems.length === 0) return;
  const kinds: OddityKind[] = ["star-eater", "puppet-mind", "sloth-cloud", "replicator", "void-gate"];
  const kind = forcedKind ?? rng.pick(kinds);
  const origin = rng.pick(systems.filter(s => !s.ownerEmpireId).length > 0
    ? systems.filter(s => !s.ownerEmpireId)
    : systems);
  const id = `oddity-${state.tick}-${Object.keys(state.oddities).length}`;
  const name = rng.pick(ODDITY_NAMES[kind]);
  const oddity: Oddity = {
    id, kind, name,
    x: origin.x, y: origin.y,
    systemId: origin.id,
    speed: kind === "star-eater" ? rng.range(0.5, 0.9) : kind === "sloth-cloud" ? rng.range(0.25, 0.5) : 0,
    strength: rng.range(30, 80),
    spawnedTick: state.tick,
    expiresTick: state.tick + (kind === "void-gate" ? 3000 : kind === "replicator" ? 1400 : 2200),
    state: {},
  };
  if (kind === "star-eater") {
    const target = pickMonsterTarget(state, rng, origin.id);
    oddity.path = target ? findPath(state, origin.id, target.id) : [origin.id];
    oddity.legIndex = 0; oddity.legProgress = 0;
    oddity.state.consumed = 0;
  }
  if (kind === "sloth-cloud" || kind === "puppet-mind") {
    const angle = rng.next() * Math.PI * 2;
    oddity.vx = Math.cos(angle) * oddity.speed || Math.cos(angle) * 0.3;
    oddity.vy = Math.sin(angle) * oddity.speed || Math.sin(angle) * 0.3;
  }
  if (kind === "replicator") oddity.state.generation = 0;
  state.oddities[id] = oddity;
  createEvent(state, state.tick, "galactic-crisis", `${name} sighted near ${origin.name}`,
    `A strange presence — ${name} — has appeared near ${origin.name}. Astronomers cannot agree on what it wants.`,
    4, [], [origin.id]);
}

function nearestSystem(state: GalaxyState, x: number, y: number): StarSystem | null {
  let best: StarSystem | null = null, bestD = Infinity;
  for (const s of Object.values(state.systems)) {
    const d = (s.x - x) ** 2 + (s.y - y) ** 2;
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

function stepStarEater(state: GalaxyState, oddity: Oddity, rng: PRNG): void {
  if (!oddity.path || oddity.path.length <= 1) {
    const here = nearestSystem(state, oddity.x, oddity.y);
    const target = here ? pickMonsterTarget(state, rng, here.id) : null;
    if (here && target && target.id !== here.id) {
      oddity.path = findPath(state, here.id, target.id);
      oddity.legIndex = 0; oddity.legProgress = 0;
    }
    return;
  }
  oddity.legIndex ??= 0;
  oddity.legProgress ??= 0;
  const arrived = advanceAlongPath(state, oddity as Oddity & { path: string[]; legIndex: number; legProgress: number });
  if (!arrived) return;
  const here = state.systems[oddity.path[oddity.path.length - 1]];
  if (!here) { oddity.path = undefined; return; }
  oddity.systemId = here.id;

  // sentinel stations and strong defenders can drive the eater off for good
  const owner = here.ownerEmpireId ? state.empires[here.ownerEmpireId] : null;
  const sentinel = here.artifactId && state.artifacts?.[here.artifactId]?.kind === "sentinel-station";
  if (owner && (sentinel || owner.militaryStrength * rng.next() > oddity.strength * 6)) {
    delete state.oddities![oddity.id];
    owner.cohesion = Math.min(1, owner.cohesion + 0.05);
    createEvent(state, state.tick, "monster-slain", `${oddity.name} repelled at ${here.name}`,
      `${sentinel ? "The sentinel station at" : "The fleets of"} ${here.name} drove off ${oddity.name}. The stars are safe — for now.`,
      5, [owner.id], [here.id]);
    return;
  }

  // consume the world: drained, scarred, remembered
  here.population = Math.max(0.02, here.population * rng.range(0.35, 0.6));
  here.resources = Math.max(0.05, here.resources * rng.range(0.55, 0.8));
  here.stability = Math.max(0.05, here.stability - 0.25);
  addMarker(here, "ruin", state.tick, `Consumed by ${oddity.name}`);
  oddity.state.consumed = (oddity.state.consumed ?? 0) + 1;
  createEvent(state, state.tick, "monster-attack", `${oddity.name} consumed ${here.name}`,
    `${oddity.name} fed on ${here.name}, draining its people and resources.`,
    4, owner ? [owner.id] : [], [here.id]);

  if (oddity.state.consumed >= 4) {
    delete state.oddities![oddity.id];
    createEvent(state, state.tick, "galactic-crisis", `${oddity.name} sated`,
      `Having consumed ${oddity.state.consumed} worlds, ${oddity.name} drifted back into the deep void.`,
      4, [], [here.id]);
    return;
  }
  const next = pickMonsterTarget(state, rng, here.id);
  if (next && next.id !== here.id) {
    oddity.path = findPath(state, here.id, next.id);
    oddity.legIndex = 0; oddity.legProgress = 0;
  }
}

function driftAndBounce(oddity: Oddity): void {
  oddity.x += oddity.vx ?? 0;
  oddity.y += oddity.vy ?? 0;
  if (oddity.x < 0 || oddity.x > 1200) oddity.vx = -(oddity.vx ?? 0);
  if (oddity.y < 0 || oddity.y > 900) oddity.vy = -(oddity.vy ?? 0);
}

function stepSlothCloud(state: GalaxyState, oddity: Oddity, rng: PRNG): void {
  driftAndBounce(oddity);
  // ships caught in the cloud fall into torpor; nearby worlds grow listless
  for (const f of Object.values(state.fleets)) {
    if (f.kind === "merchant" || f.kind === "flagship") continue;
    if (Math.hypot(f.x - oddity.x, f.y - oddity.y) > 90) continue;
    if (rng.next() < 0.04) {
      delete state.fleets[f.id];
      if (rng.next() < 0.3) {
        const owner = state.empires[f.ownerEmpireId];
        createEvent(state, state.tick, "galactic-crisis", `${f.name} lost to ${oddity.name}`,
          `${f.name} drifted into ${oddity.name} and fell silent.`, 3, owner ? [owner.id] : [], []);
      }
    } else {
      f.speed = Math.max(0.2, f.speed * 0.97);
    }
  }
  if (state.tick % 25 === 0) {
    for (const s of Object.values(state.systems)) {
      if (Math.hypot(s.x - oddity.x, s.y - oddity.y) < 110) s.stability = Math.max(0.05, s.stability - 0.004);
    }
  }
}

function stepPuppetMind(state: GalaxyState, oddity: Oddity, rng: PRNG): void {
  driftAndBounce(oddity);
  if (rng.next() > 0.004) return;
  // whisper into the nearest court: forced mood lurch
  let victim: Empire | null = null;
  let bestD = 300 * 300;
  for (const emp of Object.values(state.empires)) {
    const cap = state.systems[emp.capitalSystemId];
    if (!cap) continue;
    const d = (cap.x - oddity.x) ** 2 + (cap.y - oddity.y) ** 2;
    if (d < bestD) { bestD = d; victim = emp; }
  }
  if (!victim) return;
  const old = victim.mood;
  const forcedMoods = ["rioting", "crusading", "degenerating"] as const;
  victim.mood = rng.pick(forcedMoods);
  victim.moodSince = state.tick;
  victim.cohesion = Math.max(0.1, victim.cohesion - 0.08);
  const cap = state.systems[victim.capitalSystemId];
  createEvent(state, state.tick, "mood-shift", `${victim.name} gripped by psychic influence`,
    `${oddity.name} whispered into the court of ${victim.name}, twisting its mood from ${old} to ${victim.mood}.`,
    3, [victim.id], cap ? [cap.id] : []);
}

function stepReplicator(state: GalaxyState, oddity: Oddity, rng: PRNG): void {
  const here = oddity.systemId ? state.systems[oddity.systemId] : null;
  if (!here) { delete state.oddities![oddity.id]; return; }
  // gifts strange technology to whoever holds the world it roosts on
  if (here.ownerEmpireId && state.tick % 40 === 0) {
    const owner = state.empires[here.ownerEmpireId];
    if (owner) {
      owner.techLevel = Math.min(3, owner.techLevel + 0.004);
      here.techLevel = Math.min(3, here.techLevel + 0.008);
    }
  }
  // copies itself onto a neighboring world once, then both burn out on schedule
  const generation = oddity.state.generation ?? 0;
  if (generation < 2 && !oddity.state.replicated && rng.next() < 0.0012) {
    const neighbors = here.connectedSystemIds.map(id => state.systems[id]).filter(Boolean) as StarSystem[];
    if (neighbors.length > 0) {
      const dest = rng.pick(neighbors);
      const childId = `oddity-${state.tick}-${Object.keys(state.oddities ?? {}).length}`;
      state.oddities![childId] = {
        ...oddity, id: childId, x: dest.x, y: dest.y, systemId: dest.id,
        spawnedTick: state.tick, expiresTick: state.tick + 1400,
        state: { generation: generation + 1 },
      };
      oddity.state.replicated = 1;
      createEvent(state, state.tick, "galactic-crisis", `${oddity.name} replicated at ${dest.name}`,
        `A copy of ${oddity.name} unfolded itself above ${dest.name}.`, 3,
        dest.ownerEmpireId ? [dest.ownerEmpireId] : [], [dest.id]);
    }
  }
}

function stepVoidGate(state: GalaxyState, oddity: Oddity, rng: PRNG): void {
  // a stationary tear that flings passing warships across the galaxy
  for (const f of Object.values(state.fleets)) {
    if (f.kind !== "war") continue;
    if (Math.hypot(f.x - oddity.x, f.y - oddity.y) > 60) continue;
    if (rng.next() > 0.05) continue;
    const distant = Object.values(state.systems).filter(s => dist(s, { x: oddity.x, y: oddity.y } as StarSystem) > 400);
    if (distant.length === 0) return;
    const dest = rng.pick(distant);
    f.x = dest.x; f.y = dest.y;
    f.targetSystemId = dest.id; f.originSystemId = dest.id;
    f.path = [dest.id]; f.legIndex = 0; f.legProgress = 0;
    const owner = state.empires[f.ownerEmpireId];
    createEvent(state, state.tick, "galactic-crisis", `${f.name} swallowed by ${oddity.name}`,
      `${oddity.name} seized ${f.name} and cast it out near ${dest.name}.`, 3, owner ? [owner.id] : [], [dest.id]);
    return;
  }
}

/** Persistent space oddities: bespoke weird actors that live on the map and
 *  follow one memorable rule each, distinct from generic monsters. */
export function stepOddities(state: GalaxyState, rng: PRNG): void {
  state.oddities ??= {};
  const active = Object.values(state.oddities);

  if (active.length < MAX_ODDITIES && Object.keys(state.empires).length > 2 && rng.next() < 0.00045) {
    spawnOddity(state, rng);
  }

  for (const oddity of Object.values(state.oddities)) {
    if (oddity.expiresTick !== undefined && state.tick >= oddity.expiresTick) {
      delete state.oddities[oddity.id];
      const near = nearestSystem(state, oddity.x, oddity.y);
      createEvent(state, state.tick, "galactic-crisis", `${oddity.name} fades`,
        `${oddity.name} dissolved back into whatever strange place it came from.`,
        3, [], near ? [near.id] : []);
      continue;
    }
    switch (oddity.kind) {
      case "star-eater": stepStarEater(state, oddity, rng); break;
      case "sloth-cloud": stepSlothCloud(state, oddity, rng); break;
      case "puppet-mind": stepPuppetMind(state, oddity, rng); break;
      case "replicator": stepReplicator(state, oddity, rng); break;
      case "void-gate": stepVoidGate(state, oddity, rng); break;
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
