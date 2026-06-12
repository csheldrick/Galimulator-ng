import type { GalaxyState, Empire, Character, CharacterRole, CharacterTrait, PRNG, Id } from "../types/sim";
import { createEvent } from "./Events";
import { makeName } from "./Galaxy";
import { IDEOLOGIES, rulerDisplayName } from "./Moods";
import { usurpThroneByName } from "./Dynasty";

const ROLE_TITLES: Record<CharacterRole, string[]> = {
  admiral: ["Grand Admiral", "Fleet Marshal", "Star Admiral", "War Marshal", "Lord of Fleets"],
  minister: ["Grand Vizier", "Chancellor", "High Minister", "Lord Treasurer", "Steward"],
  prophet: ["High Prophet", "Hierophant", "Oracle", "Voice of the Faith", "Archpriest"],
  pretender: ["Pretender", "Claimant", "Usurper", "Rival Heir"],
  "faction-leader": ["Agitator", "Faction Speaker", "Cell Marshal", "Bloc Leader", "People's Voice"],
};

export const ROLE_LABEL: Record<CharacterRole, string> = {
  admiral: "Admiral",
  minister: "Minister",
  prophet: "Prophet",
  pretender: "Pretender",
  "faction-leader": "Faction Leader",
};

export const TRAIT_LABEL: Record<CharacterTrait, string> = {
  bright: "Bright",
  dull: "Dull",
  mechanic: "Mechanic",
  mutineer: "Mutineer",
  zealot: "Zealot",
  merchant: "Merchant",
  warlike: "Warlike",
  popular: "Popular",
  corrupt: "Corrupt",
};

const ROLE_TRAITS: Record<CharacterRole, CharacterTrait[]> = {
  admiral: ["warlike", "mechanic", "mutineer", "popular", "dull"],
  minister: ["bright", "merchant", "corrupt", "popular", "dull"],
  prophet: ["zealot", "popular", "bright", "corrupt", "dull"],
  pretender: ["mutineer", "popular", "warlike", "bright", "corrupt"],
  "faction-leader": ["popular", "mutineer", "zealot", "bright", "corrupt"],
};

let _charCounter = 0;
export function resetCharacterCounter(): void { _charCounter = 0; }

export function makeCharacter(rng: PRNG, role: CharacterRole, tick: number): Character {
  const traits = [rng.pick(ROLE_TRAITS[role])];
  if (rng.next() < 0.18) {
    const extra = rng.pick(ROLE_TRAITS[role]);
    if (!traits.includes(extra)) traits.push(extra);
  }
  return {
    id: `char-${tick}-${_charCounter++}`,
    name: makeName(rng),
    role,
    title: rng.pick(ROLE_TITLES[role]),
    dynasty: makeName(rng),
    traits,
    skill: rng.range(0.25, 0.95),
    renown: role === "pretender" ? rng.range(0.4, 0.8) : rng.range(0.1, 0.4),
    loyalty: role === "pretender" ? rng.range(0.05, 0.3) : rng.range(0.5, 0.95),
    bornTick: tick,
  };
}

/** A fresh court: always an admiral and a minister, plus a prophet for the faithful. */
export function makeCourt(rng: PRNG, tick: number, hasReligion: boolean): Character[] {
  const court = [makeCharacter(rng, "admiral", tick), makeCharacter(rng, "minister", tick)];
  if (hasReligion) court.push(makeCharacter(rng, "prophet", tick));
  return court;
}

export function topByRole(emp: Empire, role: CharacterRole): Character | null {
  let best: Character | null = null;
  for (const c of emp.court ?? []) {
    if (c.role !== role) continue;
    if (!best || c.skill > best.skill) best = c;
  }
  return best;
}

/** Find an admiral by id (war fleets remember the officer who led them). */
export function findCharacter(emp: Empire | undefined, id: Id | undefined): Character | null {
  if (!emp || !id) return null;
  return (emp.court ?? []).find(c => c.id === id) ?? null;
}

// Per-empire chance each tick that the court is re-evaluated. Kept low so figures
// have time to build (or squander) a reputation before turning over.
const COURT_CHECK_CHANCE = 0.02;

export function stepCharacters(state: GalaxyState, rng: PRNG): void {
  for (const emp of Object.values(state.empires)) {
    if (!emp.court) emp.court = [];

    // Ministers quietly grease the wheels of state every tick.
    const minister = topByRole(emp, "minister");
    if (minister) {
      const merchantMul = minister.traits.includes("merchant") ? 1.8 : 1;
      const corruptTax = minister.traits.includes("corrupt") ? 0.35 : 0;
      emp.wealth += minister.skill * 0.4 * merchantMul;
      emp.cohesion = Math.min(1, emp.cohesion + minister.skill * 0.00015 - corruptTax * 0.0002);
      if (minister.traits.includes("bright")) emp.techLevel = Math.min(3, emp.techLevel + 0.00008 * minister.skill);
    }

    // Make sure the empire keeps a minimal cast as it grows or loses faith.
    ensureCourtSlots(state, emp, rng);

    if (rng.next() > COURT_CHECK_CHANCE) continue;

    // Renown drifts up with tenure; loyalty erodes when the realm is unstable.
    for (const c of emp.court) {
      c.renown = Math.min(1, c.renown + 0.01 * c.skill);
      const popular = c.traits.includes("popular") ? 0.004 : 0;
      const corrupt = c.traits.includes("corrupt") ? -0.006 : 0;
      c.loyalty = Math.max(0, Math.min(1, c.loyalty + (emp.cohesion - 0.5) * 0.02 - 0.005 + popular + corrupt));
    }

    // An ambitious, renowned, disloyal officer in a shaky realm makes a play.
    const usurper = emp.court.find(c => c.role !== "pretender" && c.renown > 0.6 && c.loyalty < 0.25);
    if (usurper && emp.cohesion < 0.55 && rng.next() < 0.35) {
      stageCoup(state, emp, usurper, rng);
      continue;
    }

    // Otherwise a court member may simply die, retire, or be replaced.
    if (rng.next() < 0.25) churnCourt(state, emp, rng);
  }
}

/** Append a career milestone, keeping the log bounded so long-lived characters don't bloat saves. */
export function pushCareer(c: Character, note: string): void {
  c.career = [...(c.career ?? []), note].slice(-12);
}

function ensureCourtSlots(state: GalaxyState, emp: Empire, rng: PRNG): void {
  if (!emp.court.some(c => c.role === "admiral")) emp.court.push(promote(state, emp, "admiral", rng));
  if (!emp.court.some(c => c.role === "minister")) emp.court.push(promote(state, emp, "minister", rng));
  if (emp.stateReligionId && !emp.court.some(c => c.role === "prophet")) {
    emp.court.push(promote(state, emp, "prophet", rng));
  }
}

function promote(state: GalaxyState, emp: Empire, role: CharacterRole, rng: PRNG): Character {
  const c = makeCharacter(rng, role, state.tick);
  pushCareer(c, `Appointed ${c.title} of ${emp.name} (t${state.tick})`);
  if (c.renown > 0.3 || role === "prophet") {
    const cap = state.systems[emp.capitalSystemId];
    createEvent(state, state.tick, "character-rose", `${c.title} ${c.name} rises in ${emp.name}`,
      `${c.title} ${c.name} took up office under ${rulerDisplayName(emp)} of ${emp.name}.`,
      2, [emp.id], cap ? [cap.id] : []);
  }
  return c;
}

function churnCourt(state: GalaxyState, emp: Empire, rng: PRNG): void {
  const pool = emp.court.filter(c => c.role !== "pretender");
  if (pool.length === 0) return;
  const gone = rng.pick(pool);
  emp.court = emp.court.filter(c => c.id !== gone.id);
  const replacement = makeCharacter(rng, gone.role, state.tick);
  pushCareer(replacement, `Appointed ${replacement.title} of ${emp.name} (t${state.tick})`);
  emp.court.push(replacement);
  if (gone.renown > 0.45) {
    const cap = state.systems[emp.capitalSystemId];
    createEvent(state, state.tick, "character-fell", `${gone.title} ${gone.name} of ${emp.name} passes`,
      `${gone.title} ${gone.name} left the stage after ${state.tick - gone.bornTick} ticks of service; ${replacement.title} ${replacement.name} takes their place.`,
      2, [emp.id], cap ? [cap.id] : []);
  }
}

// A pretender topples the throne: the ruler is replaced by the usurper, the
// ideology lurches, and the realm is shaken. Mirrors a coup but with a named cause.
function stageCoup(state: GalaxyState, emp: Empire, usurper: Character, rng: PRNG): void {
  const oldRuler = rulerDisplayName(emp);
  // The court officer takes the throne as a real person, founding their own house.
  usurpThroneByName(state, emp, rng, { name: usurper.name, skill: usurper.skill, renown: usurper.renown });

  const flips = IDEOLOGIES.filter(i => i !== emp.ideology);
  emp.ideology = rng.pick(flips);
  emp.cohesion = Math.max(0.1, emp.cohesion - 0.15);
  emp.aggression = Math.min(1, emp.aggression + 0.15);
  emp.court = emp.court.filter(c => c.id !== usurper.id);
  const cap = state.systems[emp.capitalSystemId];
  if (cap) cap.stability = Math.max(0.05, cap.stability - 0.15);
  createEvent(state, state.tick, "coup", `${usurper.title} ${usurper.name} seizes ${emp.name}`,
    `${usurper.title} ${usurper.name} of House ${usurper.dynasty}, long a power behind the throne, deposed ${oldRuler} and crowned themselves ruler of ${emp.name}.`,
    4, [emp.id], cap ? [cap.id] : []);
}
