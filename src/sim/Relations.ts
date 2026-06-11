import type { GalaxyState, EmpireRelationship, RelationModifier, RelationModifierInput } from "../types/sim";

// Sequence for relation-modifier ids. Mirrors the event counter: reset on galaxy
// generation, persisted in saves so ids keep incrementing without collisions.
let _modifierSeq = 0;
export function resetModifierSeq(): void { _modifierSeq = 0; }
export function getModifierSeq(): number { return _modifierSeq; }
export function setModifierSeq(value: number): void { _modifierSeq = Math.max(0, Math.floor(value)); }

/** Stamp a modifier with a unique id and append it to the ledger.
 *  Structural modifiers are standing conditions (faith, alliance, trade, common enemy),
 *  recomputed each pass, so a new one replaces the prior structural entry of the same label.
 *  Every other kind is a discrete historical incident and coexists with its peers, so repeated
 *  wars, clashes, spy operations and diplomatic incidents accumulate as real history (and lapse
 *  individually via expiresAtTick). The id makes two sides of the same event distinct entries. */
export function addRelationModifier(rel: EmpireRelationship, mod: RelationModifierInput): void {
  const full: RelationModifier = { ...mod, id: `relmod-${_modifierSeq++}` };
  const existing = rel.modifiers ?? [];
  if (full.kind === "structural") {
    rel.modifiers = [...existing.filter(m => !(m.kind === "structural" && m.label === full.label)), full];
  } else {
    rel.modifiers = [...existing, full];
  }
}

export function activeModifiers(rel: EmpireRelationship | undefined, tick: number): RelationModifier[] {
  return (rel?.modifiers ?? []).filter(m => m.expiresAtTick === undefined || m.expiresAtTick > tick);
}

export function effectiveOpinion(rel: EmpireRelationship | undefined, tick: number): number {
  let v = rel?.opinion ?? 50;
  for (const m of activeModifiers(rel, tick)) v += m.opinionDelta;
  return Math.max(0, Math.min(100, v));
}

export function effectiveTension(rel: EmpireRelationship | undefined, tick: number): number {
  let v = rel?.tension ?? 0;
  for (const m of activeModifiers(rel, tick)) v += m.tensionDelta;
  return Math.max(0, Math.min(100, v));
}

/** Drop lapsed modifiers from every relationship so saves and snapshots stay lean. */
export function pruneExpiredModifiers(state: GalaxyState): void {
  for (const emp of Object.values(state.empires)) {
    for (const rel of Object.values(emp.relationshipByEmpireId)) {
      if (rel.modifiers?.length) {
        rel.modifiers = rel.modifiers.filter(
          m => m.expiresAtTick === undefined || m.expiresAtTick > state.tick
        );
      }
    }
  }
}

/** Recompute the standing (non-expiring) modifiers for one directed relationship. */
export function refreshStructuralModifiers(state: GalaxyState, rel: EmpireRelationship, fromId: string): void {
  const from = state.empires[fromId];
  const to = state.empires[rel.targetEmpireId];
  if (!from || !to) return;

  // strip prior structural entries, keep historical (expiring) ones
  rel.modifiers = (rel.modifiers ?? []).filter(m => m.kind !== "structural");

  // faith
  if (from.stateReligionId && to.stateReligionId) {
    if (from.stateReligionId === to.stateReligionId) {
      addRelationModifier(rel, { kind: "structural", label: "Same faith", opinionDelta: 12, tensionDelta: -5 });
    } else {
      const zealot = from.ideology === "spiritualist" || from.mood === "crusading";
      addRelationModifier(rel, { kind: "structural", label: "Different faith", opinionDelta: zealot ? -18 : -8, tensionDelta: zealot ? 8 : 3 });
    }
  }

  // alliance
  const allied = (from.allianceIds ?? []).some(aid => (to.allianceIds ?? []).includes(aid));
  if (allied) addRelationModifier(rel, { kind: "structural", label: "Allied", opinionDelta: 22, tensionDelta: -18 });

  // trade partner
  const trades = Object.values(state.tradeRoutes).some(
    r => (r.empireAId === fromId && r.empireBId === to.id) || (r.empireAId === to.id && r.empireBId === fromId)
  );
  if (trades) addRelationModifier(rel, { kind: "structural", label: "Trade partner", opinionDelta: 12, tensionDelta: -8 });

  // common enemy: someone both empires are at war with
  const commonEnemy = from.activeWarEmpireIds.some(e => e !== to.id && to.activeWarEmpireIds.includes(e));
  if (commonEnemy) addRelationModifier(rel, { kind: "structural", label: "Common enemy", opinionDelta: 14, tensionDelta: -6 });
}
