import type { GalaxyState, Id, SubjectRelation, SubjectStatus } from "../types/sim";
import { createEvent } from "./Events";

/**
 * Pure subject/vassal relation primitives: creation, queries, and dissolution.
 * Kept free of any dependency on Merge.ts or Subjects.ts's per-tick stepping so
 * that both can import these without forming a module cycle (Subjects.ts calls
 * mergeEmpires for peaceful integration; Merge.ts needs these primitives to
 * transfer subject bonds during a merge).
 */

export const SUBJECT_STATUS_LABEL: Record<SubjectStatus, string> = {
  "vassal": "Vassal",
  "protectorate": "Protectorate",
  "tributary": "Tributary",
  "client-state": "Client State",
};

/** Per-status defaults: where autonomy drifts, what tribute flows, and what the subject may still do. */
export const STATUS_PROFILE: Record<SubjectStatus, { autonomy: number; tribute: number; protection: boolean; wars: boolean; alliances: boolean }> = {
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
