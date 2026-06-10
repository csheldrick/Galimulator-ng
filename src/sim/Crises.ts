import type { GalaxyState, StarSystem, Monster, MonsterKind, PRNG } from "../types/sim";
import { createEvent } from "./Events";
import { findPath, advanceAlongPath, dist } from "./Pathing";
import { makeName } from "./Galaxy";

export function discoverArtifact(state: GalaxyState, sys: StarSystem): void {
  if (!sys.artifactName || !sys.ownerEmpireId) return;
  const owner = state.empires[sys.ownerEmpireId];
  if (!owner) return;
  const name = sys.artifactName;
  sys.artifactName = null;
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
  if (Object.keys(state.monsters).length < 2 && empireCount > 3 && rng.next() < 0.0012) spawnMonster(state, rng);

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

// Rare galaxy-shaking events that punctuate the slow grind of history.
export function stepCrises(state: GalaxyState, rng: PRNG): void {
  if (rng.next() > 0.0011) return;
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
