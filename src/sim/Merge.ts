import type { EmpireRelationship, GalaxyState, Id, RelationModifier } from "../types/sim";
import { createEvent } from "./Events";
import { breakSubjectRelation, subjectOf, subjectsOf } from "./SubjectRelations";

function mergeModifiers(a: RelationModifier[] = [], b: RelationModifier[] = []): RelationModifier[] {
  const byLabel = new Map<string, RelationModifier>();
  for (const mod of [...a, ...b]) byLabel.set(mod.label, mod);
  return [...byLabel.values()].slice(0, 8);
}

function mergeRelationship(base: EmpireRelationship | undefined, incoming: EmpireRelationship): EmpireRelationship {
  if (!base) return { ...incoming, modifiers: [...(incoming.modifiers ?? [])] };
  return {
    targetEmpireId: base.targetEmpireId,
    tension: Math.max(0, Math.min(100, (base.tension + incoming.tension) / 2)),
    opinion: Math.max(0, Math.min(100, (base.opinion + incoming.opinion) / 2)),
    atWar: base.atWar || incoming.atWar,
    modifiers: mergeModifiers(base.modifiers, incoming.modifiers),
  };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function mergeEmpires(state: GalaxyState, dominantId: Id, absorbedId: Id, reason = "diplomatic union"): boolean {
  if (dominantId === absorbedId) return false;
  const dominant = state.empires[dominantId];
  const absorbed = state.empires[absorbedId];
  if (!dominant || !absorbed) return false;

  const absorbedSystems = [...absorbed.ownedSystemIds];
  for (const systemId of absorbedSystems) {
    const sys = state.systems[systemId];
    if (!sys) continue;
    sys.ownerEmpireId = dominant.id;
    if (!dominant.ownedSystemIds.includes(systemId)) dominant.ownedSystemIds.push(systemId);
  }

  dominant.population += absorbed.population;
  dominant.wealth += absorbed.wealth * 0.75;
  dominant.militaryStrength += absorbed.militaryStrength * 0.65;
  dominant.techLevel = Math.max(dominant.techLevel, absorbed.techLevel * 0.95);
  dominant.cohesion = Math.max(0.05, Math.min(1, dominant.cohesion * 0.82 + absorbed.cohesion * 0.18 + 0.03));
  dominant.aggression = Math.max(0.05, Math.min(1, dominant.aggression * 0.75 + absorbed.aggression * 0.25));
  dominant.expansionism = Math.max(0.05, Math.min(1, dominant.expansionism * 0.75 + absorbed.expansionism * 0.25));
  dominant.court = unique([...dominant.court, ...absorbed.court]).slice(0, 10);
  dominant.builtArtifactIds = unique([...(dominant.builtArtifactIds ?? []), ...(absorbed.builtArtifactIds ?? [])]);

  for (const artifact of Object.values(state.artifacts ?? {})) {
    if (artifact.ownerEmpireId === absorbed.id) artifact.ownerEmpireId = dominant.id;
  }
  for (const fleet of Object.values(state.fleets)) {
    if (fleet.ownerEmpireId === absorbed.id) fleet.ownerEmpireId = dominant.id;
  }
  for (const faction of Object.values(state.factions ?? {})) {
    if (faction.targetEmpireId === absorbed.id) faction.targetEmpireId = dominant.id;
    if (faction.originEmpireId === absorbed.id) faction.originEmpireId = dominant.id;
  }

  for (const [targetId, rel] of Object.entries(absorbed.relationshipByEmpireId)) {
    if (targetId === dominant.id || targetId === absorbed.id) continue;
    dominant.relationshipByEmpireId[targetId] = mergeRelationship(dominant.relationshipByEmpireId[targetId], rel);
    dominant.relationshipByEmpireId[targetId].targetEmpireId = targetId;
  }

  dominant.activeWarEmpireIds = unique([...dominant.activeWarEmpireIds, ...absorbed.activeWarEmpireIds])
    .filter(id => id !== dominant.id && id !== absorbed.id && state.empires[id]);

  for (const alliance of Object.values(state.alliances ?? {})) {
    if (!alliance.memberEmpireIds.includes(absorbed.id)) continue;
    alliance.memberEmpireIds = unique(alliance.memberEmpireIds.map(id => id === absorbed.id ? dominant.id : id));
    if (alliance.leaderId === absorbed.id) alliance.leaderId = dominant.id;
    if (!dominant.allianceIds?.includes(alliance.id)) dominant.allianceIds = [...(dominant.allianceIds ?? []), alliance.id];
    if (alliance.memberEmpireIds.length < 2) delete state.alliances[alliance.id];
  }

  for (const other of Object.values(state.empires)) {
    if (other.id === dominant.id || other.id === absorbed.id) continue;
    const absorbedRel = other.relationshipByEmpireId[absorbed.id];
    if (absorbedRel) {
      absorbedRel.targetEmpireId = dominant.id;
      other.relationshipByEmpireId[dominant.id] = mergeRelationship(other.relationshipByEmpireId[dominant.id], absorbedRel);
      other.relationshipByEmpireId[dominant.id].targetEmpireId = dominant.id;
    }
    delete other.relationshipByEmpireId[absorbed.id];
    other.activeWarEmpireIds = unique(other.activeWarEmpireIds.map(id => id === absorbed.id ? dominant.id : id))
      .filter(id => id !== other.id && state.empires[id]);
  }

  dominant.allianceIds = unique((dominant.allianceIds ?? []).filter(id => state.alliances[id]));
  delete dominant.relationshipByEmpireId[absorbed.id];

  // Subject bonds: the absorbed empire keeps existing, just under a new ruler, so its
  // subject/overlord ties transfer to the dominant empire rather than dangling or
  // silently dissolving. A tie to the dominant itself collapses (both sides are now one
  // empire); a transfer that would break the one-overlord/no-cycle invariant is liberated
  // instead, same as a dying overlord freeing its subjects in removeEmpireFromGalaxy.
  for (const sr of Object.values(state.subjects ?? {})) {
    if (sr.subjectEmpireId === absorbed.id && sr.overlordEmpireId === dominant.id) {
      delete state.subjects![sr.id];
    } else if (sr.overlordEmpireId === absorbed.id && sr.subjectEmpireId === dominant.id) {
      delete state.subjects![sr.id];
    } else if (sr.subjectEmpireId === absorbed.id) {
      if (subjectOf(state, dominant.id) || subjectsOf(state, dominant.id).length > 0) {
        breakSubjectRelation(state, sr.id, "liberation");
      } else {
        sr.subjectEmpireId = dominant.id;
      }
    } else if (sr.overlordEmpireId === absorbed.id) {
      if (subjectOf(state, dominant.id)) {
        breakSubjectRelation(state, sr.id, "liberation");
      } else {
        sr.overlordEmpireId = dominant.id;
      }
    }
  }

  delete state.empires[absorbed.id];

  if (state.playerControl.controlledEmpireId === absorbed.id) state.playerControl.controlledEmpireId = dominant.id;

  createEvent(
    state,
    state.tick,
    "empire-merged",
    `${absorbed.name} merged into ${dominant.name}`,
    `${absorbed.name} was absorbed by ${dominant.name} through ${reason}.`,
    4,
    [dominant.id],
    absorbedSystems.slice(0, 10),
  );
  return true;
}
