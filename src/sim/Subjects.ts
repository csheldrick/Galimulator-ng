import type { GalaxyState, Id, Empire, PRNG, SubjectRelation, SubjectStatus } from "../types/sim";
import { createEvent } from "./Events";
import { addRelationModifier, effectiveOpinion } from "./Relations";
import { getNeighboringEmpires } from "./Diplomacy";
import { mergeEmpires } from "./Merge";

export const SUBJECT_STATUS_LABEL: Record<SubjectStatus, string> = {
  "vassal": "Vassal",
  "protectorate": "Protectorate",
  "tributary": "Tributary",
  "client-state": "Client State",
};

/** Per-status defaults: where autonomy drifts, what tribute flows, and what the subject may still do. */
const STATUS_PROFILE: Record<SubjectStatus, { autonomy: number; tribute: number; protection: boolean; wars: boolean; alliances: boolean }> = {
  "vassal": { autonomy: 0.4, tribute: 0.1, protection: true, wars: false, alliances: false },
  "protectorate": { autonomy: 0.75, tribute: 0.04, protection: true, wars: true, alliances: false },
  "tributary": { autonomy: 0.85, tribute: 0.12, protection: false, wars: true, alliances: true },
  "client-state": { autonomy: 0.35, tribute: 0.08, protection: true, wars: false, alliances: false },
};

export function subjectOf(state: GalaxyState, empireId: Id): SubjectRelation | null {
  for (const sr of Object.values(state.subjects ?? {})) if (sr.subjectEmpireId === empireId) return sr;
  return null;
}

export function subjectsOf(state: GalaxyState, overlordEmpireId: Id): SubjectRelation[] {
  return Object.values(state.subjects ?? {}).filter(sr => sr.overlordEmpireId === overlordEmpireId);
}

/** True when a subject tie binds the two empires in either direction. */
export function isSubjectPair(state: GalaxyState, aId: Id, bId: Id): boolean {
  return Object.values(state.subjects ?? {}).some(sr =>
    (sr.subjectEmpireId === aId && sr.overlordEmpireId === bId) ||
    (sr.subjectEmpireId === bId && sr.overlordEmpireId === aId));
}

export function createSubjectRelation(
  state: GalaxyState,
  subjectEmpireId: Id,
  overlordEmpireId: Id,
  status: SubjectStatus,
  tick: number,
  startLoyalty?: number
): SubjectRelation | null {
  state.subjects ??= {};
  if (subjectEmpireId === overlordEmpireId) return null;
  const subject = state.empires[subjectEmpireId];
  const overlord = state.empires[overlordEmpireId];
  if (!subject || !overlord) return null;
  // one overlord per subject; no chains where the new overlord is itself a subject
  if (subjectOf(state, subjectEmpireId) || subjectOf(state, overlordEmpireId)) return null;
  // no cycles: the would-be subject must not already hold the overlord as its own subject
  if (subjectsOf(state, subjectEmpireId).length > 0) return null;
  const profile = STATUS_PROFILE[status];
  const id = `subject-${tick}-${subjectEmpireId}`;
  const rel: SubjectRelation = {
    id, subjectEmpireId, overlordEmpireId, status, createdTick: tick,
    autonomy: profile.autonomy, loyalty: startLoyalty ?? 0.55, tributeRate: profile.tribute,
    protection: profile.protection, canDeclareWars: profile.wars, canJoinAlliances: profile.alliances,
    historicalEventIds: [],
  };
  state.subjects[id] = rel;
  const ev = createEvent(state, tick, "subject-created",
    `${subject.name} became a ${SUBJECT_STATUS_LABEL[status].toLowerCase()} of ${overlord.name}`,
    `${subject.name} now stands as a ${SUBJECT_STATUS_LABEL[status].toLowerCase()} under ${overlord.name}${profile.protection ? ", under its protection" : ""}${profile.tribute > 0 ? `, paying ${Math.round(profile.tribute * 100)}% tribute` : ""}.`,
    4, [subjectEmpireId, overlordEmpireId], []);
  rel.historicalEventIds.push(ev.id);
  return rel;
}

export function breakSubjectRelation(state: GalaxyState, relationId: Id, reason: "rebellion" | "liberation" | "integration" | "collapse"): void {
  const rel = state.subjects?.[relationId];
  if (!rel) return;
  delete state.subjects![relationId];
  if (reason === "liberation") {
    const subject = state.empires[rel.subjectEmpireId];
    if (subject) {
      createEvent(state, state.tick, "subject-liberated", `${subject.name} regained independence`,
        `With its overlord broken, ${subject.name} cast off its ${SUBJECT_STATUS_LABEL[rel.status].toLowerCase()} bonds and stands free.`,
        4, [rel.subjectEmpireId], []);
    }
  }
}

/** Force a war between two empires (used for subject rebellions and protective interventions). */
function setAtWar(a: Empire, b: Empire): void {
  const rel = a.relationshipByEmpireId[b.id];
  const relBack = b.relationshipByEmpireId[a.id];
  if (rel) { rel.atWar = true; rel.opinion = Math.max(0, rel.opinion - 25); }
  if (relBack) { relBack.atWar = true; relBack.opinion = Math.max(0, relBack.opinion - 25); }
  if (!a.activeWarEmpireIds.includes(b.id)) a.activeWarEmpireIds.push(b.id);
  if (!b.activeWarEmpireIds.includes(a.id)) b.activeWarEmpireIds.push(a.id);
}

function power(emp: Empire): number {
  return emp.militaryStrength + (emp.militaryBonus ?? 0) + emp.ownedSystemIds.length * 10;
}

/** Weak empires beside a friendly giant occasionally accept protection voluntarily. */
function maybeVoluntaryProtectorate(state: GalaxyState, rng: PRNG): void {
  for (const emp of Object.values(state.empires)) {
    if (emp.ownedSystemIds.length > 3 || emp.activeWarEmpireIds.length > 0) continue;
    if (subjectOf(state, emp.id) || subjectsOf(state, emp.id).length > 0) continue;
    if (rng.next() > 0.08) continue;
    for (const neighborId of getNeighboringEmpires(state, emp.id)) {
      const big = state.empires[neighborId];
      if (!big || subjectOf(state, neighborId)) continue;
      if (power(big) < power(emp) * 3) continue;
      const rel = emp.relationshipByEmpireId[neighborId];
      if (!rel || rel.atWar || effectiveOpinion(rel, state.tick) < 70) continue;
      createSubjectRelation(state, emp.id, neighborId, "protectorate", state.tick);
      return;
    }
    return; // only one candidate considered per pass to keep these rare
  }
}

export function stepSubjects(state: GalaxyState, rng: PRNG): void {
  state.subjects ??= {};
  if (rng.next() < 0.02) maybeVoluntaryProtectorate(state, rng);

  for (const rel of [...Object.values(state.subjects)]) {
    const subject = state.empires[rel.subjectEmpireId];
    const overlord = state.empires[rel.overlordEmpireId];
    if (!subject) { delete state.subjects[rel.id]; continue; }
    if (!overlord) { breakSubjectRelation(state, rel.id, "liberation"); continue; }

    // tribute: a steady trickle from subject to overlord
    const tribute = Math.max(0, subject.wealth * rel.tributeRate * 0.004);
    if (Number.isFinite(tribute) && tribute > 0) { subject.wealth -= tribute; overlord.wealth += tribute; }

    // loyalty drift
    const subjRel = subject.relationshipByEmpireId[overlord.id];
    let drift = 0;
    // Resentment: a freshly-defeated subject (low starting loyalty) nurses a grudge.
    // While loyalty is below 0.45 the power advantage feels oppressive rather than reassuring,
    // and the subject looks for a chance to break free.
    const resentful = rel.loyalty < 0.45;
    if (!resentful && power(overlord) > power(subject) * 1.5) drift += 0.0006;
    if (resentful) drift -= 0.0005;
    if (overlord.stateReligionId && overlord.stateReligionId === subject.stateReligionId) drift += 0.0004;
    drift += (effectiveOpinion(subjRel, state.tick) - 50) * 0.00002;
    drift -= rel.tributeRate * 0.004;
    drift -= (1 - rel.autonomy) * 0.0006;
    if (overlord.activeWarEmpireIds.length >= 2) drift -= 0.0005;
    if (rel.protection) drift += 0.0003;
    rel.loyalty = Math.max(0, Math.min(1, rel.loyalty + drift + rng.range(-0.0005, 0.0005)));

    // autonomy drifts toward the status profile
    rel.autonomy += (STATUS_PROFILE[rel.status].autonomy - rel.autonomy) * 0.002;

    // protection: overlord joins the defense when its subject is attacked
    if (rel.protection) {
      for (const enemyId of subject.activeWarEmpireIds) {
        if (enemyId === overlord.id || overlord.activeWarEmpireIds.includes(enemyId)) continue;
        const enemy = state.empires[enemyId];
        if (enemy && rng.next() < 0.03 + rel.loyalty * 0.03) {
          setAtWar(overlord, enemy);
          createEvent(state, state.tick, "war-declared", `${overlord.name} defends ${subject.name}`,
            `${overlord.name} entered the war against ${enemy.name} to defend its ${SUBJECT_STATUS_LABEL[rel.status].toLowerCase()} ${subject.name}.`,
            3, [overlord.id, enemyId, subject.id], []);
        }
      }
    }
    // loyal vassals are pulled into the overlord's defensive wars
    if (!rel.canDeclareWars && rel.loyalty > 0.6) {
      for (const enemyId of overlord.activeWarEmpireIds) {
        if (enemyId === subject.id || subject.activeWarEmpireIds.includes(enemyId)) continue;
        const enemy = state.empires[enemyId];
        if (enemy && rng.next() < 0.01 * rel.loyalty) setAtWar(subject, enemy);
      }
    }

    // rebellion: disloyal subjects with the muscle to try it
    if (rel.loyalty < 0.25 && power(subject) > power(overlord) * 0.25 && rng.next() < 0.0035) {
      breakSubjectRelation(state, rel.id, "rebellion");
      setAtWar(subject, overlord);
      const ev = createEvent(state, state.tick, "subject-rebelled", `${subject.name} rebelled against ${overlord.name}`,
        `${subject.name} renounced its ${SUBJECT_STATUS_LABEL[rel.status].toLowerCase()} oaths and declared war on its overlord ${overlord.name}.`,
        4, [subject.id, overlord.id], []);
      const mod = { kind: "war" as const, label: "Subject rebellion", opinionDelta: -25, tensionDelta: 20, expiresAtTick: state.tick + 900, sourceEventId: ev.id };
      const a = subject.relationshipByEmpireId[overlord.id];
      const b = overlord.relationshipByEmpireId[subject.id];
      if (a) addRelationModifier(a, mod);
      if (b) addRelationModifier(b, { ...mod });
      continue;
    }

    // integration: loyal, low-autonomy subjects fold into the overlord peacefully
    if ((rel.status === "vassal" || rel.status === "client-state")
      && rel.loyalty > 0.85 && rel.autonomy < 0.45
      && state.tick - rel.createdTick > 800 && rng.next() < 0.002) {
      const subjectName = subject.name;
      breakSubjectRelation(state, rel.id, "integration");
      if (mergeEmpires(state, overlord.id, subject.id, "peaceful integration of a loyal subject")) {
        createEvent(state, state.tick, "subject-integrated", `${subjectName} integrated into ${overlord.name}`,
          `After generations of loyal subordination, ${subjectName} was peacefully absorbed into ${overlord.name}.`,
          4, [overlord.id], []);
      }
    }
  }
}
