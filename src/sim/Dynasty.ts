import type { GalaxyState, Empire, Person, Dynasty, PersonRole, Gender, Id, PRNG } from "../types/sim";
import { createEvent } from "./Events";
import { makeName } from "./Galaxy";
import { addRelationModifier } from "./Relations";

// ── Id counters ───────────────────────────────────────────────────────────────
// Mirror the event/modifier counters: reset on galaxy generation, persisted in saves
// so ids keep incrementing without collisions across a load.
let _personSeq = 0;
let _dynastySeq = 0;
export function resetDynastyCounters(): void { _personSeq = 0; _dynastySeq = 0; _sinceGc = 0; }
export function getPersonCounter(): number { return _personSeq; }
export function getDynastyCounter(): number { return _dynastySeq; }
export function setPersonCounter(v: number): void { _personSeq = Math.max(0, Math.floor(v)); }
export function setDynastyCounter(v: number): void { _dynastySeq = Math.max(0, Math.floor(v)); }

// ── Title pools ───────────────────────────────────────────────────────────────

const HEIR_TITLE: Record<Gender, string[]> = {
  male: ["Prince", "Crown Prince", "Heir", "Scion"],
  female: ["Princess", "Crown Princess", "Heir", "Scion"],
};
const RELATIVE_TITLE: Record<Gender, string[]> = {
  male: ["Duke", "Archduke", "Lord", "Count", "Baron"],
  female: ["Duchess", "Archduchess", "Lady", "Countess", "Baroness"],
};
const CONSORT_TITLE: Record<Gender, string[]> = {
  male: ["Prince Consort", "Consort"],
  female: ["Royal Consort", "Consort", "Lady"],
};
const NOBLE_TITLE: Record<Gender, string[]> = {
  male: ["Lord", "Magnate", "Patriarch", "Margrave"],
  female: ["Lady", "Magnate", "Matriarch", "Margravine"],
};
const PRETENDER_TITLE: Record<Gender, string[]> = {
  male: ["Pretender", "Claimant", "Usurper", "Rival Heir"],
  female: ["Pretender", "Claimant", "Usurper", "Rival Heir"],
};

function titleFor(role: PersonRole, gender: Gender, rng: PRNG): string {
  switch (role) {
    case "heir": return rng.pick(HEIR_TITLE[gender]);
    case "relative": return rng.pick(RELATIVE_TITLE[gender]);
    case "consort": return rng.pick(CONSORT_TITLE[gender]);
    case "noble": return rng.pick(NOBLE_TITLE[gender]);
    case "pretender": return rng.pick(PRETENDER_TITLE[gender]);
    case "ruler": return gender === "female" ? "Empress" : "Emperor";
  }
}

// "son"/"daughter"/"child" word for succession prose.
function childWord(p: Person): string { return p.gender === "female" ? "daughter" : p.gender === "male" ? "son" : "child"; }
function siblingWord(p: Person): string { return p.gender === "female" ? "sister" : p.gender === "male" ? "brother" : "sibling"; }

export function personDisplayName(p: Person): string { return `${p.title} ${p.name}`; }

// ── State shape used during generation (events unavailable then) ───────────────
type PeopleHost = Pick<GalaxyState, "people" | "dynasties">;

function ensureGraphs(host: PeopleHost): void {
  host.people ??= {};
  host.dynasties ??= {};
}

// ── Person / dynasty factories ─────────────────────────────────────────────────

function makePerson(
  host: PeopleHost,
  opts: {
    dynastyId: Id;
    role: PersonRole;
    empireId: Id | null;
    bornTick: number;
    rng: PRNG;
    gender?: Gender;
    name?: string;
    title?: string;
    claimStrength?: number;
    loyalty?: number;
    skill?: number;
    renown?: number;
  },
): Person {
  ensureGraphs(host);
  const rng = opts.rng;
  const gender: Gender = opts.gender ?? (rng.next() < 0.5 ? "female" : "male");
  const role = opts.role;
  const person: Person = {
    id: `person-${_personSeq++}`,
    name: opts.name ?? makeName(rng),
    gender,
    dynastyId: opts.dynastyId,
    role,
    title: opts.title ?? titleFor(role, gender, rng),
    bornTick: opts.bornTick,
    parentIds: [],
    spouseIds: [],
    childIds: [],
    claimStrength: opts.claimStrength ?? defaultClaim(role, rng),
    loyalty: opts.loyalty ?? (role === "pretender" ? rng.range(0.05, 0.3) : rng.range(0.5, 0.95)),
    skill: opts.skill ?? rng.range(0.25, 0.95),
    renown: opts.renown ?? (role === "ruler" ? rng.range(0.4, 0.7) : rng.range(0.1, 0.45)),
    empireId: opts.empireId,
    alive: true,
  };
  host.people![person.id] = person;
  return person;
}

function defaultClaim(role: PersonRole, rng: PRNG): number {
  switch (role) {
    case "ruler": return 1;
    case "heir": return rng.range(0.6, 0.9);
    case "relative": return rng.range(0.3, 0.6);
    case "consort": return rng.range(0.15, 0.35);
    case "noble": return rng.range(0.1, 0.3);
    case "pretender": return rng.range(0.35, 0.7);
  }
}

/** Wire a parent→child link in both directions. */
function linkChild(parent: Person, child: Person): void {
  if (!child.parentIds.includes(parent.id)) child.parentIds.push(parent.id);
  if (!parent.childIds.includes(child.id)) parent.childIds.push(child.id);
}

/** Wire a marriage in both directions. */
function linkSpouses(a: Person, b: Person): void {
  if (!a.spouseIds.includes(b.id)) a.spouseIds.push(b.id);
  if (!b.spouseIds.includes(a.id)) b.spouseIds.push(a.id);
}

// ── Founding a dynasty ──────────────────────────────────────────────────────────

/** Stand up a ruling house around an empire's existing `ruler` shim: a founder person,
 *  an optional consort, sometimes a clutch of heirs and a noble relative or two. Mutates the
 *  people/dynasty graphs and back-references the empire. Does NOT emit events (safe to call
 *  during galaxy generation before `state.events` is live). */
export function foundDynasty(host: PeopleHost, emp: Empire, tick: number, rng: PRNG): Dynasty {
  ensureGraphs(host);
  const dynastyId = `dynasty-${_dynastySeq++}`;
  // Reuse the empire's existing ruler shim so government-specific titles/names survive.
  const founderGender: Gender = /Empress|Queen|Matriarch|Lady|Princess|Duchess/.test(emp.ruler.title)
    ? "female" : rng.next() < 0.5 ? "female" : "male";
  const founder = makePerson(host, {
    dynastyId, role: "ruler", empireId: emp.id, bornTick: Math.max(0, tick - rng.nextInt(25, 55)),
    rng, gender: founderGender, name: emp.ruler.name, title: emp.ruler.title,
    claimStrength: 1, loyalty: 1, renown: rng.range(0.45, 0.75),
  });
  founder.milestones = [`Founded the House of ${emp.ruler.dynasty} (t${tick})`];

  const dynasty: Dynasty = {
    id: dynastyId,
    name: emp.ruler.dynasty,
    founderPersonId: founder.id,
    foundedTick: tick,
    rulingEmpireIds: [emp.id],
    prestige: rng.range(20, 45),
    historicalEventIds: [],
  };
  host.dynasties![dynastyId] = dynasty;

  emp.dynastyId = dynastyId;
  emp.rulerPersonId = founder.id;
  emp.ruler.personId = founder.id;

  // Consort (most rulers are married).
  let consort: Person | null = null;
  if (rng.next() < 0.75) {
    consort = makePerson(host, {
      dynastyId, role: "consort", empireId: emp.id, bornTick: Math.max(0, tick - rng.nextInt(20, 50)),
      rng, gender: founderGender === "female" ? "male" : "female",
    });
    linkSpouses(founder, consort);
  }

  // 1–3 children sometimes already grown into heirs.
  if (rng.next() < 0.7) {
    const n = rng.nextInt(1, 3);
    for (let i = 0; i < n; i++) {
      const heir = makePerson(host, {
        dynastyId, role: "heir", empireId: emp.id, bornTick: Math.max(0, tick - rng.nextInt(0, 25)),
        rng, claimStrength: rng.range(0.6, 0.9) - i * 0.05,
      });
      linkChild(founder, heir);
      if (consort) linkChild(consort, heir);
    }
  }

  // 1–2 relatives / nobles round out the house.
  if (rng.next() < 0.5) {
    const n = rng.nextInt(1, 2);
    for (let i = 0; i < n; i++) {
      makePerson(host, {
        dynastyId, role: rng.next() < 0.6 ? "relative" : "noble",
        empireId: emp.id, bornTick: Math.max(0, tick - rng.nextInt(20, 50)), rng,
      });
    }
  }

  return dynasty;
}

/** Guarantee an empire has a dynasty + ruler person, generating wrappers for legacy/runtime
 *  empires that were created before the lineage system (or loaded from old saves). */
export function ensureDynasty(state: GalaxyState, emp: Empire, rng: PRNG): void {
  ensureGraphs(state);
  if (emp.rulerPersonId && state.people![emp.rulerPersonId] && emp.dynastyId && state.dynasties![emp.dynastyId]) return;
  foundDynasty(state, emp, state.tick, rng);
}

// ── Living-member queries ───────────────────────────────────────────────────────

export function dynastyMembers(state: GalaxyState, dynastyId: Id | undefined, opts: { aliveOnly?: boolean } = {}): Person[] {
  if (!dynastyId || !state.people) return [];
  const out: Person[] = [];
  for (const p of Object.values(state.people)) {
    if (p.dynastyId !== dynastyId) continue;
    if (opts.aliveOnly && !p.alive) continue;
    out.push(p);
  }
  return out;
}

export function livingDynastyCount(state: GalaxyState, dynastyId: Id | undefined): number {
  return dynastyMembers(state, dynastyId, { aliveOnly: true }).length;
}

/** Walk the chronological chain of rulers back from the current monarch via predecessor links. */
export function lineageChain(state: GalaxyState, emp: Empire, limit = 6): Person[] {
  const chain: Person[] = [];
  if (!state.people || !emp.rulerPersonId) return chain;
  let cur: Person | undefined = state.people[emp.rulerPersonId];
  const seen = new Set<Id>();
  while (cur && !seen.has(cur.id) && chain.length < limit) {
    chain.push(cur);
    seen.add(cur.id);
    cur = cur.predecessorPersonId ? state.people[cur.predecessorPersonId] : undefined;
  }
  return chain;
}

// ── Garbage collection ───────────────────────────────────────────────────────
// state.people and state.dynasties only ever grow. Two distinct leaks compound:
//
//  1. Dead people are merely flagged alive=false and extinct dynasties tagged with
//     extinctTick — nothing is ever deleted, so orphaned ancestors and dead houses
//     pile up forever.
//  2. The *living* population also grows without bound: births outpace heir deaths
//     several to one, and unchosen heirs, surplus relatives, and exiled remnants of
//     fallen empires stay alive indefinitely, never culled.
//
// Because getSnapshot() structuredClones the entire people/dynasty graph every
// 250 ms for the React UI, this unbounded growth makes each snapshot bigger and
// slower until the tab OOM-crashes. Succession and pretender logic only ever query
// *alive* people, so we can prune freely as long as we keep each empire's ruling
// family and a bounded recent pool of claimants intact.

// How deep the inspector's lineage chain can walk (limit 6) plus headroom.
const LINEAGE_RETAIN = 10;
// Baseline of non-essential living claimants (surplus relatives, nobles, exiles) to
// retain, plus this many per empire. Bounds the living population to roughly
// rulers + consorts + this pool, which keeps snapshots cheap while leaving plenty
// of pretenders and stray nobles for succession drama.
const LIVING_POOL_BASE = 40;
const LIVING_POOL_PER_EMPIRE = 8;
// Run a sweep this often (in stepDynasties calls ≈ ticks).
const GC_INTERVAL = 200;
let _sinceGc = 0;

// Higher score = more worth keeping. Favours strong, renowned, young claimants who
// still belong to a living empire, so culling sheds the stalest hangers-on first.
function claimantScore(p: Person): number {
  return (p.empireId ? 1 : 0) * 2 + p.claimStrength * 1.5 + p.renown + p.bornTick * 1e-9;
}

// Bound both the living and dead genealogy graphs, and drop dynasties nothing
// references any more. Deterministic (uses no rng), so replays stay identical.
export function gcDynasties(state: GalaxyState): void {
  if (!state.people) return;
  const people = state.people;

  // Essential living people that must never be culled: every empire's current ruler
  // and that ruler's consort(s). These anchor active reigns and the lineage display.
  const essential = new Set<Id>();
  for (const emp of Object.values(state.empires)) {
    if (!emp.rulerPersonId) continue;
    essential.add(emp.rulerPersonId);
    const ruler = people[emp.rulerPersonId];
    if (ruler) for (const sid of ruler.spouseIds) if (people[sid]?.alive) essential.add(sid);
  }

  // 1. Cap the living pool: keep all essentials plus the top-scoring extra claimants,
  //    deleting the surplus (stale relatives, nobles, and exiled remnants).
  const extras: Person[] = [];
  for (const p of Object.values(people)) {
    if (p.alive && !essential.has(p.id)) extras.push(p);
  }
  const livingCap = LIVING_POOL_BASE + Object.keys(state.empires).length * LIVING_POOL_PER_EMPIRE;
  if (extras.length > livingCap) {
    // Deterministic order: score desc, id asc to break ties.
    extras.sort((a, b) => claimantScore(b) - claimantScore(a) || (a.id < b.id ? -1 : 1));
    for (const p of extras.slice(livingCap)) delete people[p.id];
  }

  // 2. Retain dead people only where a display still reaches them.
  const keep = new Set<Id>();
  for (const p of Object.values(people)) if (p.alive) keep.add(p.id);
  // Immediate family the inspector renders for each living person.
  for (const id of [...keep]) {
    const p = people[id];
    if (!p) continue;
    if (p.predecessorPersonId) keep.add(p.predecessorPersonId);
    for (const pid of p.parentIds) keep.add(pid);
    for (const sid of p.spouseIds) keep.add(sid);
  }
  // Each current ruler's predecessor chain, for the lineage-chain panel.
  for (const emp of Object.values(state.empires)) {
    let cur: Person | undefined = emp.rulerPersonId ? people[emp.rulerPersonId] : undefined;
    let depth = 0;
    const seen = new Set<Id>();
    while (cur && !seen.has(cur.id) && depth < LINEAGE_RETAIN) {
      keep.add(cur.id);
      seen.add(cur.id);
      cur = cur.predecessorPersonId ? people[cur.predecessorPersonId] : undefined;
      depth++;
    }
  }
  for (const id of Object.keys(people)) {
    if (!keep.has(id)) delete people[id];
  }

  // 3. Scrub references in survivors that now point at deleted people.
  for (const p of Object.values(people)) {
    if (p.predecessorPersonId && !people[p.predecessorPersonId]) p.predecessorPersonId = undefined;
    p.parentIds = p.parentIds.filter(id => people[id]);
    p.childIds = p.childIds.filter(id => people[id]);
    p.spouseIds = p.spouseIds.filter(id => people[id]);
  }

  // 4. Drop dynasties no surviving person belongs to and no empire still rules under.
  //    Built in one pass to avoid an O(houses × people) scan.
  if (state.dynasties) {
    const liveDynastyIds = new Set<Id>();
    for (const p of Object.values(people)) liveDynastyIds.add(p.dynastyId);
    for (const emp of Object.values(state.empires)) if (emp.dynastyId) liveDynastyIds.add(emp.dynastyId);
    for (const id of Object.keys(state.dynasties)) {
      if (!liveDynastyIds.has(id)) delete state.dynasties[id];
    }
  }
}

// ── Relationship prose ──────────────────────────────────────────────────────────

function shareParent(a: Person, b: Person): boolean {
  return a.parentIds.some(p => b.parentIds.includes(p));
}

/** Describe how `cand` relates to the deceased ruler `dead`, for succession prose. */
function relationToDead(cand: Person, dead: Person): { kind: "child" | "sibling" | "spouse" | "kin" | "pretender" | "outsider"; word: string } {
  if (cand.parentIds.includes(dead.id)) return { kind: "child", word: `${childWord(cand)} of` };
  if (cand.spouseIds.includes(dead.id)) return { kind: "spouse", word: cand.gender === "female" ? "widow of" : "widower of" };
  if (shareParent(cand, dead)) return { kind: "sibling", word: `${siblingWord(cand)} of` };
  if (cand.role === "pretender") return { kind: "pretender", word: "pretender to" };
  if (cand.dynastyId === dead.dynastyId) return { kind: "kin", word: "kin of" };
  return { kind: "outsider", word: "rival of" };
}

// ── Successor selection ─────────────────────────────────────────────────────────

interface SuccessorPick {
  person: Person;
  /** A prose clause describing the relationship, e.g. "daughter of Emperor Y". */
  relationClause: string;
  /** True when the throne passes to a different house. */
  dynastyChange: boolean;
  /** True when multiple strong claimants existed — a contested succession. */
  contested: boolean;
}

/** Choose who inherits the throne, preferring children → siblings/kin → pretenders/nobles,
 *  and only founding a fresh dynasty when no claimant exists. */
export function selectSuccessor(state: GalaxyState, emp: Empire, dead: Person, rng: PRNG): SuccessorPick | null {
  ensureGraphs(state);
  const deadDisplay = personDisplayName(dead);

  const sameEmpire = (p: Person) => p.empireId === emp.id || p.empireId === null;
  const eligible = Object.values(state.people!).filter(p => p.alive && p.id !== dead.id && p.role !== "consort");

  // Tier 1: living children of the dead ruler.
  const children = eligible.filter(p => p.parentIds.includes(dead.id) && sameEmpire(p))
    .sort((a, b) => b.claimStrength - a.claimStrength);
  // Tier 2: siblings / cousins / other members of the ruling house.
  const kin = eligible.filter(p => p.dynastyId === dead.dynastyId && sameEmpire(p) && !p.parentIds.includes(dead.id))
    .sort((a, b) => b.claimStrength - a.claimStrength);
  // Tier 3: pretenders attached to this empire (relatives, foreign-backed, old-dynasty remnants).
  const pretenders = eligible.filter(p => p.role === "pretender" && sameEmpire(p))
    .sort((a, b) => b.claimStrength - a.claimStrength);
  // Tier 4: any other noble of this empire.
  const nobles = eligible.filter(p => p.role === "noble" && sameEmpire(p))
    .sort((a, b) => b.claimStrength - a.claimStrength);

  const ordered = [...children, ...kin, ...pretenders, ...nobles];
  const strongClaimants = ordered.filter(p => p.claimStrength >= 0.45).length;
  const contested = strongClaimants >= 2;

  let chosen: Person | null = ordered[0] ?? null;

  // Occasionally a weak first-in-line is shoved aside by a more renowned/ambitious claimant.
  if (chosen && ordered.length > 1 && rng.next() < 0.2) {
    const rival = ordered[1];
    if (rival.renown + rival.claimStrength > chosen.renown + chosen.claimStrength) chosen = rival;
  }

  if (!chosen) {
    // No claimant at all: the house may be extinct here. A new dynasty rises from a noble.
    return null;
  }

  const rel = relationToDead(chosen, dead);
  const relationClause = rel.kind === "outsider" || rel.kind === "pretender"
    ? `${rel.word} the late ${deadDisplay}`
    : `${rel.word} ${deadDisplay}`;
  return { person: chosen, relationClause, dynastyChange: chosen.dynastyId !== dead.dynastyId, contested };
}

// ── Promotion to the throne ─────────────────────────────────────────────────────

/** Install `heir` as the reigning monarch of `emp`, inheriting the throne's office title and
 *  recording the predecessor link. Returns the pre-accession title for prose. */
function enthrone(state: GalaxyState, emp: Empire, heir: Person, dead: Person | null, tick: number): string {
  const preTitle = heir.title;
  const officeTitle = emp.ruler.title; // the office persists across holders
  heir.milestones = [...(heir.milestones ?? []), `Crowned ${officeTitle} of ${emp.name} (t${tick})`].slice(-10);
  heir.role = "ruler";
  heir.title = officeTitle;
  heir.empireId = emp.id;
  heir.claimStrength = 1;
  heir.loyalty = 1;
  heir.predecessorPersonId = dead?.id;
  emp.rulerPersonId = heir.id;
  // Ordinal: count prior rulers of this dynasty sharing the new ruler's name.
  const sameName = dynastyMembers(state, heir.dynastyId).filter(p => p.id !== heir.id && p.name === heir.name && (p.role === "ruler" || !p.alive)).length;
  emp.ruler = {
    name: heir.name,
    title: officeTitle,
    dynasty: state.dynasties?.[heir.dynastyId]?.name ?? emp.ruler.dynasty,
    ordinal: sameName + 1,
    accessionTick: tick,
    personId: heir.id,
  };
  if (heir.dynastyId && emp.dynastyId !== heir.dynastyId) emp.dynastyId = heir.dynastyId;
  const dyn = state.dynasties?.[heir.dynastyId];
  if (dyn && !dyn.rulingEmpireIds.includes(emp.id)) dyn.rulingEmpireIds.push(emp.id);
  return preTitle;
}

/** Mark a person dead and detach them as ruler. */
function killPerson(p: Person, tick: number, reason: string): void {
  p.alive = false;
  p.diedTick = tick;
  p.deathReason = reason;
}

function checkExtinction(state: GalaxyState, dynastyId: Id | undefined, tick: number): boolean {
  if (!dynastyId) return false;
  const dyn = state.dynasties?.[dynastyId];
  if (!dyn || dyn.extinctTick !== undefined) return false;
  if (livingDynastyCount(state, dynastyId) === 0) {
    dyn.extinctTick = tick;
    dyn.prestige = Math.max(0, dyn.prestige - 15);
    return true;
  }
  return false;
}

// Create a fresh outsider noble to seize a throne when no claimant survives.
function makeUsurperDynasty(state: GalaxyState, emp: Empire, tick: number, rng: PRNG): { person: Person; dynasty: Dynasty } {
  const dynastyId = `dynasty-${_dynastySeq++}`;
  const person = makePerson(state, {
    dynastyId, role: "ruler", empireId: emp.id, bornTick: Math.max(0, tick - rng.nextInt(28, 55)), rng,
    claimStrength: 1, loyalty: 1, renown: rng.range(0.4, 0.7),
  });
  const dynasty: Dynasty = {
    id: dynastyId, name: makeName(rng), founderPersonId: person.id, foundedTick: tick,
    rulingEmpireIds: [emp.id], prestige: rng.range(15, 35), historicalEventIds: [],
  };
  state.dynasties![dynastyId] = dynasty;
  return { person, dynasty };
}

// ── Pretenders ──────────────────────────────────────────────────────────────────

/** Find or mint a pretender to challenge `emp`'s throne — usually a real relative with a grievance,
 *  occasionally an old-dynasty remnant or foreign-backed claimant. */
export function findOrMakePretender(state: GalaxyState, emp: Empire, rng: PRNG): { person: Person; reason: string } {
  ensureGraphs(state);
  // Prefer a disloyal living relative of the ruling house.
  const kin = dynastyMembers(state, emp.dynastyId, { aliveOnly: true })
    .filter(p => p.role !== "ruler" && p.role !== "consort")
    .sort((a, b) => (a.loyalty - b.loyalty) || (b.claimStrength - a.claimStrength));
  if (kin.length > 0 && rng.next() < 0.7) {
    const p = kin[0];
    p.role = "pretender";
    p.loyalty = Math.min(p.loyalty, rng.range(0.05, 0.25));
    p.claimStrength = Math.max(p.claimStrength, rng.range(0.45, 0.7));
    const reason = p.parentIds.length && state.people && p.parentIds.some(id => state.people![id]?.role === "ruler")
      ? "a disinherited child of the old line"
      : "a slighted cousin of the ruling house";
    return { person: p, reason };
  }

  // An old-dynasty remnant: a surviving member of a house that once ruled here.
  if (state.people && rng.next() < 0.4) {
    const remnant = Object.values(state.people).find(p => p.alive && p.dynastyId !== emp.dynastyId && p.empireId === emp.id);
    if (remnant) {
      remnant.role = "pretender";
      remnant.claimStrength = Math.max(remnant.claimStrength, rng.range(0.4, 0.65));
      return { person: remnant, reason: "the last remnant of a fallen dynasty" };
    }
  }

  // Otherwise mint a fresh claimant (foreign-backed or self-proclaimed).
  const dynastyId = emp.dynastyId ?? `dynasty-${_dynastySeq++}`;
  const person = makePerson(state, {
    dynastyId, role: "pretender", empireId: emp.id, bornTick: Math.max(0, state.tick - rng.nextInt(25, 50)), rng,
    claimStrength: rng.range(0.4, 0.7), loyalty: rng.range(0.05, 0.2),
  });
  return { person, reason: rng.pick(["a foreign-backed claimant", "an ambitious sibling passed over for the throne"]) };
}

/** Install a pretender on the throne via coup. Used by court coups and unrest coups so the
 *  usurper has a real identity and lineage instead of a throwaway random ruler. */
export function installPretender(
  state: GalaxyState, emp: Empire, rng: PRNG,
  pretender?: { person: Person; reason: string },
): { person: Person; reason: string; oldDynastyName: string } {
  ensureDynasty(state, emp, rng);
  const oldRulerPerson = emp.rulerPersonId ? state.people?.[emp.rulerPersonId] : null;
  const oldDynastyName = state.dynasties?.[emp.dynastyId ?? ""]?.name ?? emp.ruler.dynasty;
  const claim = pretender ?? findOrMakePretender(state, emp, rng);
  if (oldRulerPerson && oldRulerPerson.alive) killPerson(oldRulerPerson, state.tick, "deposed in a coup");
  enthrone(state, emp, claim.person, oldRulerPerson ?? null, state.tick);
  const oldDyn = oldRulerPerson ? state.dynasties?.[oldRulerPerson.dynastyId] : undefined;
  if (oldDyn) {
    oldDyn.prestige = Math.max(0, oldDyn.prestige - 8);
    oldDyn.rulingEmpireIds = oldDyn.rulingEmpireIds.filter(id => id !== emp.id || claim.person.dynastyId === oldDyn.id);
  }
  if (oldRulerPerson) checkExtinction(state, oldRulerPerson.dynastyId, state.tick);
  return { ...claim, oldDynastyName };
}

/** A named court figure (e.g. an ambitious admiral) seizes the throne, founding their own house.
 *  Gives court coups a real person/lineage instead of a throwaway random ruler. */
export function usurpThroneByName(
  state: GalaxyState, emp: Empire, rng: PRNG,
  opts: { name: string; skill?: number; renown?: number },
): Person {
  ensureDynasty(state, emp, rng);
  const oldRulerPerson = emp.rulerPersonId ? state.people?.[emp.rulerPersonId] : null;
  const dynastyId = `dynasty-${_dynastySeq++}`;
  const person = makePerson(state, {
    dynastyId, role: "ruler", empireId: emp.id, bornTick: Math.max(0, state.tick - rng.nextInt(28, 55)), rng,
    name: opts.name, claimStrength: 1, loyalty: 1, skill: opts.skill, renown: opts.renown ?? rng.range(0.5, 0.8),
  });
  const dynasty: Dynasty = {
    id: dynastyId, name: opts.name, founderPersonId: person.id, foundedTick: state.tick,
    rulingEmpireIds: [emp.id], prestige: rng.range(15, 35), historicalEventIds: [],
  };
  state.dynasties![dynastyId] = dynasty;
  if (oldRulerPerson && oldRulerPerson.alive) killPerson(oldRulerPerson, state.tick, "deposed in a coup");
  enthrone(state, emp, person, oldRulerPerson ?? null, state.tick);
  if (oldRulerPerson) {
    const oldDyn = state.dynasties?.[oldRulerPerson.dynastyId];
    if (oldDyn) { oldDyn.prestige = Math.max(0, oldDyn.prestige - 8); oldDyn.rulingEmpireIds = oldDyn.rulingEmpireIds.filter(id => id !== emp.id); }
    checkExtinction(state, oldRulerPerson.dynastyId, state.tick);
  }
  return person;
}

// ── Diplomacy hooks ──────────────────────────────────────────────────────────────

function relBetween(emp: Empire, otherId: Id) {
  let rel = emp.relationshipByEmpireId[otherId];
  if (!rel) { rel = { targetEmpireId: otherId, tension: 0, opinion: 50, atWar: false, modifiers: [] }; emp.relationshipByEmpireId[otherId] = rel; }
  return rel;
}

/** A marriage tie between two ruling houses warms relations between their empires. */
function applyMarriageDiplomacy(a: Empire, b: Empire, tick: number, eventId: Id): void {
  const mod = { kind: "diplomacy" as const, label: "Dynastic marriage", opinionDelta: 18, tensionDelta: -10, expiresAtTick: tick + 1200, sourceEventId: eventId };
  addRelationModifier(relBetween(a, b.id), { ...mod });
  addRelationModifier(relBetween(b, a.id), { ...mod });
}

/** A foreign-backed claimant sours relations with the backer. */
export function applyForeignClaimantDiplomacy(victim: Empire, backer: Empire, tick: number, eventId: Id): void {
  const mod = { kind: "diplomacy" as const, label: "Backed a pretender", opinionDelta: -20, tensionDelta: 22, expiresAtTick: tick + 800, sourceEventId: eventId };
  addRelationModifier(relBetween(victim, backer.id), { ...mod });
}

// ── Dynasty legitimacy ────────────────────────────────────────────────────────────

const LEGITIMACY_POSITIVE: ReadonlySet<string> = new Set(["heir-born", "succession", "dynasty-restored", "dynastic-marriage"]);
const LEGITIMACY_NEGATIVE: ReadonlySet<string> = new Set(["heir-died", "succession-crisis", "pretender-revolt", "dynasty-extinct"]);

/** Derive a [-1, 1] legitimacy score from recent dynasty chronicle events.
 *  Positive events (smooth successions, heir births, marriages) push toward +1.
 *  Negative events (crises, revolts, heir deaths) push toward -1.
 *  Returns 0 for dynasties with no chronicle yet. */
export function dynastyLegitimacy(state: GalaxyState, dynastyId: Id | undefined): number {
  if (!dynastyId || !state.dynasties || !state.events) return 0;
  const dyn = state.dynasties[dynastyId];
  if (!dyn || dyn.historicalEventIds.length === 0) return 0;
  let score = 0;
  for (const eid of dyn.historicalEventIds) {
    const ev = state.events[eid];
    if (!ev) continue;
    if (LEGITIMACY_POSITIVE.has(ev.type)) score++;
    else if (LEGITIMACY_NEGATIVE.has(ev.type)) score--;
  }
  return Math.max(-1, Math.min(1, score / dyn.historicalEventIds.length));
}

// ── Dynasty chronicle helpers ─────────────────────────────────────────────────────

const DYNASTY_HISTORY_LIMIT = 12;

/** Push an event into a dynasty's own history ledger. */
function recordDynastyEvent(state: GalaxyState, dynastyId: Id | undefined, eventId: Id): void {
  if (!dynastyId || !state.dynasties) return;
  const dyn = state.dynasties[dynastyId];
  if (!dyn) return;
  dyn.historicalEventIds.push(eventId);
  if (dyn.historicalEventIds.length > DYNASTY_HISTORY_LIMIT) dyn.historicalEventIds.shift();
}

// ── Per-tick dynastic life ────────────────────────────────────────────────────────

const RULER_DEATH_CAP = 0.008;

/** Replaces the old purely-random ruler turnover with genealogy-driven succession,
 *  plus rare dynastic life events (births, marriages, heir deaths). */
export function stepDynasties(state: GalaxyState, rng: PRNG): void {
  ensureGraphs(state);
  for (const emp of Object.values(state.empires)) {
    ensureDynasty(state, emp, rng);
    maybeLifeEvents(state, emp, rng);

    const reign = state.tick - emp.ruler.accessionTick;
    const deathChance = Math.min(RULER_DEATH_CAP, 0.0006 + reign * 0.000003);
    if (rng.next() > deathChance) continue;
    handleSuccession(state, emp, reign, rng);
  }

  // Amortized cleanup so the genealogy graph stays bounded over long runs.
  if (++_sinceGc >= GC_INTERVAL) { _sinceGc = 0; gcDynasties(state); }
}

function handleSuccession(state: GalaxyState, emp: Empire, reign: number, rng: PRNG): void {
  const dead = emp.rulerPersonId ? state.people?.[emp.rulerPersonId] : null;
  if (!dead) { ensureDynasty(state, emp, rng); return; }
  killPerson(dead, state.tick, "died of natural causes");
  const oldDisplay = personDisplayName(dead);
  const oldDynastyName = state.dynasties?.[dead.dynastyId]?.name ?? emp.ruler.dynasty;

  const pick = selectSuccessor(state, emp, dead, rng);
  const cap = state.systems[emp.capitalSystemId];

  // A reign that ends without a strong, undisputed heir shakes the realm.
  if (!pick) {
    // No claimant — the house ends here and a new dynasty seizes power.
    const extinct = checkExtinction(state, dead.dynastyId, state.tick);
    const { person, dynasty } = makeUsurperDynasty(state, emp, state.tick, rng);
    enthrone(state, emp, person, dead, state.tick);
    if (extinct) {
      const ev = createEvent(state, state.tick, "dynasty-extinct", `The House of ${oldDynastyName} dies out`,
        `With the death of ${oldDisplay}, no heir of the House of ${oldDynastyName} remained. ${personDisplayName(person)} founded the House of ${dynasty.name} over ${emp.name}.`,
        4, [emp.id], cap ? [cap.id] : []);
      recordDynastyEvent(state, dead.dynastyId, ev.id);
      recordDynastyEvent(state, dynasty.id, ev.id);
    } else {
      const ev = createEvent(state, state.tick, "succession-crisis", `Succession crisis in ${emp.name}`,
        `${oldDisplay} left no clear heir. After a scramble, ${personDisplayName(person)} of the new House of ${dynasty.name} took the throne of ${emp.name}.`,
        4, [emp.id], cap ? [cap.id] : []);
      recordDynastyEvent(state, dead.dynastyId, ev.id);
      recordDynastyEvent(state, dynasty.id, ev.id);
    }
    emp.cohesion = Math.max(0.1, emp.cohesion - 0.12);
    emp.aggression = Math.min(1, Math.max(0.05, emp.aggression + rng.range(-0.2, 0.2)));
    emp.expansionism = Math.min(1, Math.max(0.05, emp.expansionism + rng.range(-0.2, 0.2)));
    return;
  }

  const preTitle = enthrone(state, emp, pick.person, dead, state.tick);
  emp.aggression = Math.min(1, Math.max(0.05, emp.aggression + rng.range(-0.2, 0.2)));
  emp.expansionism = Math.min(1, Math.max(0.05, emp.expansionism + rng.range(-0.2, 0.2)));

  const dyn = state.dynasties?.[pick.person.dynastyId];
  const newDisplay = `${preTitle} ${pick.person.name}`; // pre-accession identity for the prose

  if (pick.contested) {
    emp.cohesion = Math.max(0.1, emp.cohesion - 0.08);
    if (cap) cap.stability = Math.max(0.05, cap.stability - 0.08);
  }

  if (pick.dynastyChange) {
    const extinct = checkExtinction(state, dead.dynastyId, state.tick);
    if (extinct) {
      const ev = createEvent(state, state.tick, "dynasty-extinct", `The House of ${oldDynastyName} ends`,
        `After a reign of ${reign} ticks, ${oldDisplay} died and the House of ${oldDynastyName} ended. ${newDisplay}, ${pick.relationClause}, raised the House of ${dyn?.name ?? "a new line"} over ${emp.name}.`,
        4, [emp.id], cap ? [cap.id] : []);
      recordDynastyEvent(state, dead.dynastyId, ev.id);
      if (dyn) recordDynastyEvent(state, dyn.id, ev.id);
    } else {
      const restored = dyn && dyn.extinctTick === undefined && dyn.foundedTick < dead.bornTick;
      const ev = createEvent(state, state.tick, restored ? "dynasty-restored" : "succession", `${oldDisplay} of ${emp.name} has died`,
        `After a reign of ${reign} ticks, ${newDisplay}, ${pick.relationClause}, took the throne of ${emp.name}. The House of ${oldDynastyName} gave way to the House of ${dyn?.name ?? "another line"}.`,
        3, [emp.id], cap ? [cap.id] : []);
      recordDynastyEvent(state, dead.dynastyId, ev.id);
      if (dyn) recordDynastyEvent(state, dyn.id, ev.id);
    }
  } else {
    if (dyn) dyn.prestige = Math.min(100, dyn.prestige + Math.min(8, reign * 0.004));
    const ev = createEvent(state, state.tick, "succession", `${oldDisplay} of ${emp.name} has died`,
      `After a reign of ${reign} ticks, ${newDisplay}, ${pick.relationClause}, inherited the throne of ${emp.name}.`,
      2, [emp.id], cap ? [cap.id] : []);
    recordDynastyEvent(state, pick.person.dynastyId, ev.id);
  }
}

// Per-empire chance each tick that a dynastic life event fires. Kept low so a house's
// story unfolds slowly across a long game.
const LIFE_EVENT_CHANCE = 0.004;

function maybeLifeEvents(state: GalaxyState, emp: Empire, rng: PRNG): void {
  if (rng.next() > LIFE_EVENT_CHANCE) return;
  const roll = rng.next();
  if (roll < 0.45) birthOfHeir(state, emp, rng);
  else if (roll < 0.7) dynasticMarriage(state, emp, rng);
  else if (roll < 0.85) heirDies(state, emp, rng);
  else maybePretenderRevolt(state, emp, rng);
}

function birthOfHeir(state: GalaxyState, emp: Empire, rng: PRNG): void {
  const ruler = emp.rulerPersonId ? state.people?.[emp.rulerPersonId] : null;
  if (!ruler || !ruler.alive || !emp.dynastyId) return;
  const consortId = ruler.spouseIds[0];
  const consort = consortId ? state.people?.[consortId] : null;
  const heir = makePerson(state, {
    dynastyId: emp.dynastyId, role: "heir", empireId: emp.id, bornTick: state.tick, rng,
    claimStrength: rng.range(0.6, 0.85),
  });
  linkChild(ruler, heir);
  if (consort) linkChild(consort, heir);
  const cap = state.systems[emp.capitalSystemId];
  const ev = createEvent(state, state.tick, "heir-born", `An heir is born to ${personDisplayName(ruler)}`,
    `${personDisplayName(heir)}, ${childWord(heir)} of ${personDisplayName(ruler)}, was born into the House of ${state.dynasties?.[emp.dynastyId]?.name ?? "?"} of ${emp.name}.`,
    2, [emp.id], cap ? [cap.id] : []);
  recordDynastyEvent(state, emp.dynastyId, ev.id);
}

function dynasticMarriage(state: GalaxyState, emp: Empire, rng: PRNG): void {
  if (!emp.dynastyId) return;
  // Find an unmarried adult of this house to wed.
  const candidates = dynastyMembers(state, emp.dynastyId, { aliveOnly: true })
    .filter(p => p.spouseIds.length === 0 && (p.role === "heir" || p.role === "relative" || p.role === "ruler") && state.tick - p.bornTick >= 16);
  if (candidates.length === 0) return;
  const groom = rng.pick(candidates);

  // Roughly half the time it's a cross-empire union with a partner empire — a diplomatic tie.
  const others = Object.values(state.empires).filter(e => e.id !== emp.id && e.dynastyId && e.dynastyId !== emp.dynastyId);
  const cap = state.systems[emp.capitalSystemId];
  if (others.length > 0 && rng.next() < 0.5) {
    const partnerEmp = rng.pick(others);
    const partnerPool = dynastyMembers(state, partnerEmp.dynastyId, { aliveOnly: true })
      .filter(p => p.spouseIds.length === 0 && p.role !== "consort" && state.tick - p.bornTick >= 16);
    if (partnerPool.length > 0) {
      const bride = rng.pick(partnerPool);
      linkSpouses(groom, bride);
      const ev = createEvent(state, state.tick, "dynastic-marriage", `Dynastic union of ${emp.name} and ${partnerEmp.name}`,
        `${personDisplayName(groom)} of the House of ${state.dynasties?.[emp.dynastyId]?.name ?? "?"} wed ${personDisplayName(bride)} of ${partnerEmp.name}, binding the two houses.`,
        3, [emp.id, partnerEmp.id], cap ? [cap.id] : []);
      applyMarriageDiplomacy(emp, partnerEmp, state.tick, ev.id);
      const dyn = state.dynasties?.[emp.dynastyId];
      if (dyn) dyn.prestige = Math.min(100, dyn.prestige + 4);
      recordDynastyEvent(state, emp.dynastyId, ev.id);
      if (bride.dynastyId && bride.dynastyId !== emp.dynastyId) recordDynastyEvent(state, bride.dynastyId, ev.id);
      return;
    }
  }

  // Otherwise a domestic marriage that simply continues the line.
  const consort = makePerson(state, {
    dynastyId: emp.dynastyId, role: "consort", empireId: emp.id, bornTick: Math.max(0, state.tick - rng.nextInt(16, 40)),
    rng, gender: groom.gender === "female" ? "male" : "female",
  });
  linkSpouses(groom, consort);
  if (rng.next() < 0.4) {
    const ev = createEvent(state, state.tick, "dynastic-marriage", `${personDisplayName(groom)} of ${emp.name} marries`,
      `${personDisplayName(groom)} of the House of ${state.dynasties?.[emp.dynastyId]?.name ?? "?"} took ${personDisplayName(consort)} as consort.`,
      1, [emp.id], cap ? [cap.id] : []);
    recordDynastyEvent(state, emp.dynastyId, ev.id);
  }
}

function heirDies(state: GalaxyState, emp: Empire, rng: PRNG): void {
  if (!emp.dynastyId) return;
  const heirs = dynastyMembers(state, emp.dynastyId, { aliveOnly: true }).filter(p => p.role === "heir");
  if (heirs.length === 0) return;
  const victim = rng.pick(heirs);
  killPerson(victim, state.tick, rng.pick(["lost to illness", "killed in an accident", "slain in a duel", "lost to a wasting sickness"]));
  const cap = state.systems[emp.capitalSystemId];
  const ev = createEvent(state, state.tick, "heir-died", `${personDisplayName(victim)} of ${emp.name} dies`,
    `${personDisplayName(victim)}, an heir of the House of ${state.dynasties?.[emp.dynastyId]?.name ?? "?"}, ${victim.deathReason}, dimming the line of succession in ${emp.name}.`,
    2, [emp.id], cap ? [cap.id] : []);
  recordDynastyEvent(state, emp.dynastyId, ev.id);
  checkExtinction(state, emp.dynastyId, state.tick);
}

function maybePretenderRevolt(state: GalaxyState, emp: Empire, rng: PRNG): void {
  // Legitimacy shifts the revolt threshold: a dynasty with a strong positive chronicle
  // requires deeper instability before a pretender dares rise (threshold falls to 0.45),
  // while a dynasty with a troubled recent history is vulnerable even at higher cohesion (up to 0.65).
  const legit = dynastyLegitimacy(state, emp.dynastyId);
  const revoltThreshold = 0.55 - legit * 0.10;
  if (emp.cohesion > revoltThreshold) return;
  const { person, reason } = findOrMakePretender(state, emp, rng);
  const cap = state.systems[emp.capitalSystemId];
  emp.cohesion = Math.max(0.1, emp.cohesion - 0.05);
  if (cap) cap.stability = Math.max(0.05, cap.stability - 0.06);

  // A foreign-backed claimant implicates a rival power — sour relations with the backer.
  if (reason.includes("foreign-backed")) {
    const rivals = Object.values(state.empires).filter(e => e.id !== emp.id);
    if (rivals.length > 0) {
      const backer = rng.pick(rivals);
      const ev = createEvent(state, state.tick, "pretender-revolt", `${personDisplayName(person)} claims the throne of ${emp.name}`,
        `${personDisplayName(person)}, ${reason} sponsored by ${backer.name}, raised a banner of revolt against ${rulerDisplay(state, emp)} of ${emp.name}.`,
        3, [emp.id, backer.id], cap ? [cap.id] : []);
      applyForeignClaimantDiplomacy(emp, backer, state.tick, ev.id);
      recordDynastyEvent(state, emp.dynastyId, ev.id);
      recordDynastyEvent(state, person.dynastyId, ev.id);
      return;
    }
  }
  const ev = createEvent(state, state.tick, "pretender-revolt", `${personDisplayName(person)} claims the throne of ${emp.name}`,
    `${personDisplayName(person)}, ${reason}, raised a banner of revolt against ${rulerDisplay(state, emp)} of ${emp.name}.`,
    3, [emp.id], cap ? [cap.id] : []);
  recordDynastyEvent(state, emp.dynastyId, ev.id);
  recordDynastyEvent(state, person.dynastyId, ev.id);
}

function rulerDisplay(state: GalaxyState, emp: Empire): string {
  const p = emp.rulerPersonId ? state.people?.[emp.rulerPersonId] : null;
  return p ? personDisplayName(p) : `${emp.ruler.title} ${emp.ruler.name}`;
}
