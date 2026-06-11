import type { GalaxyState, StarSystem, Religion, Id, PRNG } from "../types/sim";
import { createEvent } from "./Events";
import { makeName } from "./Galaxy";

const RELIGION_FORMS = [
  "Church of {n}", "Cult of {n}", "Path of {n}", "{n} Mysteries", "Order of {n}",
  "Faith of {n}", "{n} Communion", "Disciples of {n}", "Song of {n}", "Void Creed of {n}",
];

const RELIGION_COLORS = [
  "#ffd166", "#9b5de5", "#00bbf9", "#f15bb5", "#00f5d4",
  "#fee440", "#ff7b00", "#80ed99", "#c77dff", "#48cae4",
];

export function makeReligion(state: GalaxyState, sys: StarSystem, rng: PRNG): Religion {
  const id = `rel-${Object.keys(state.religions).length}-${state.tick}`;
  const form = rng.pick(RELIGION_FORMS);
  return {
    id,
    name: form.replace("{n}", makeName(rng)),
    color: RELIGION_COLORS[Object.keys(state.religions).length % RELIGION_COLORS.length],
    foundedTick: state.tick,
    holySystemId: sys.id,
  };
}

export function foundReligion(state: GalaxyState, sys: StarSystem, rng: PRNG): Religion {
  const religion = makeReligion(state, sys, rng);
  state.religions[religion.id] = religion;
  sys.religionId = religion.id;
  createEvent(state, state.tick, "religion-founded", `${religion.name} founded`,
    `A new faith, the ${religion.name}, arose on ${sys.name}.`, 3, sys.ownerEmpireId ? [sys.ownerEmpireId] : [], [sys.id]);
  return religion;
}

function majorityReligion(state: GalaxyState, systemIds: Id[]): Id | null {
  const counts: Record<Id, number> = {};
  let total = 0;
  for (const id of systemIds) {
    const sys = state.systems[id];
    if (!sys?.religionId) continue;
    counts[sys.religionId] = (counts[sys.religionId] ?? 0) + 1;
    total++;
  }
  let best: Id | null = null, bestCount = 0;
  for (const [rid, count] of Object.entries(counts)) if (count > bestCount) { best = rid; bestCount = count; }
  // a faith must hold a real majority of the faithful worlds to become the state creed
  return best && bestCount > total / 2 ? best : null;
}

export function stepReligion(state: GalaxyState, rng: PRNG): void {
  // faith spreads along starlanes, fastest into faithless worlds
  for (const sys of Object.values(state.systems)) {
    if (sys.population < 0.05) continue;
    const owner = sys.ownerEmpireId ? state.empires[sys.ownerEmpireId] : null;
    const prophet = owner?.court?.find(c => c.role === "prophet");
    const prophetTraits = prophet?.traits ?? [];
    const prophetMul = prophet
      ? (1 + prophet.skill * 0.6) * (prophetTraits.includes("zealot") ? 1.35 : 1) * (prophetTraits.includes("corrupt") ? 0.85 : 1)
      : 1;
    const spiritual = (owner?.ideology === "spiritualist" ? 2.2 : 1) * prophetMul;
    for (const nid of sys.connectedSystemIds) {
      const from = state.systems[nid];
      if (!from?.religionId || from.religionId === sys.religionId) continue;
      const pressure = from.population * 0.0015 * spiritual;
      const resist = sys.religionId ? 0.25 : 1; // conversion is slower than evangelization
      if (rng.next() < pressure * resist) { sys.religionId = from.religionId; break; }
    }
  }

  // empires adopt the majority faith of their worlds as the state religion
  for (const emp of Object.values(state.empires)) {
    const majority = majorityReligion(state, emp.ownedSystemIds);
    if (majority && majority !== emp.stateReligionId && emp.ownedSystemIds.length >= 3) {
      emp.stateReligionId = majority;
      const religion = state.religions[majority];
      const cap = state.systems[emp.capitalSystemId];
      if (religion) createEvent(state, state.tick, "religion-adopted", `${emp.name} embraced the ${religion.name}`,
        `The ${religion.name} became the state faith of ${emp.name}.`, 3, [emp.id], cap ? [cap.id] : []);
    }
    // shared faith soothes, rival faiths inflame holy warriors
    for (const rel of Object.values(emp.relationshipByEmpireId)) {
      const other = state.empires[rel.targetEmpireId];
      if (!other || !emp.stateReligionId || !other.stateReligionId) continue;
      if (emp.stateReligionId === other.stateReligionId) rel.opinion = Math.min(100, rel.opinion + 0.03);
      else if (emp.mood === "crusading") rel.tension = Math.min(100, rel.tension + 0.5);
    }
  }

  // majority/minority pressure: state-faith worlds are calmer; dissenting worlds are restless
  for (const emp of Object.values(state.empires)) {
    if (!emp.stateReligionId) continue;
    for (const sysId of emp.ownedSystemIds) {
      const sys = state.systems[sysId];
      if (!sys) continue;
      if (sys.religionId === emp.stateReligionId) {
        sys.stability = Math.min(1, sys.stability + 0.0003);
      } else if (sys.religionId && sys.religionId !== emp.stateReligionId) {
        sys.stability = Math.max(0.05, sys.stability - 0.0004);
        // crusading empires put extra pressure on minority faiths
        if (emp.mood === "crusading" && rng.next() < 0.002 * sys.population) {
          sys.religionId = emp.stateReligionId;
        }
      }
    }
  }

  // a great unrest can birth a reform faith
  if (rng.next() < 0.0009) {
    const candidates = Object.values(state.systems).filter(s => s.population > 0.5 && s.stability < 0.5);
    if (candidates.length > 0) foundReligion(state, rng.pick(candidates), rng);
  }
}
