import type { GalaxyState, Empire, PRNG } from "../types/sim";
import { createEvent } from "./Events";
import { addRelationModifier, effectiveOpinion } from "./Relations";
import { getNeighboringEmpires } from "./Diplomacy";
import { mergeEmpires } from "./Merge";
import { SUBJECT_STATUS_LABEL, STATUS_PROFILE, subjectOf, subjectsOf, createSubjectRelation, breakSubjectRelation } from "./SubjectRelations";

// Re-exported so existing call sites (Diplomacy.ts, Tick.ts, Simulation.ts, UI panels)
// can keep importing subject primitives from "./Subjects". The primitives themselves
// live in SubjectRelations.ts, which has no dependency on Merge.ts — Merge.ts imports
// them from there instead of from this file, breaking what would otherwise be a
// Merge.ts <-> Subjects.ts import cycle (this file already imports mergeEmpires).
export { SUBJECT_STATUS_LABEL, subjectOf, subjectsOf, isSubjectPair, createSubjectRelation, breakSubjectRelation } from "./SubjectRelations";

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
