import type { GalaxyState, EmpireRelationship, RelationModifier } from "../types/sim";

/** Standing modifiers are recomputed every relationship pass and never expire on their own;
 *  they vanish when their underlying condition (shared faith, alliance, trade...) ends. */
const STRUCTURAL_LABELS = new Set([
  "Same faith",
  "Different faith",
  "Allied",
  "Trade partner",
  "Common enemy",
]);

/** Add or replace a modifier by label so the ledger never stacks duplicates. */
export function addRelationModifier(rel: EmpireRelationship, mod: RelationModifier): void {
  rel.modifiers = [...(rel.modifiers ?? []).filter(m => m.label !== mod.label), mod];
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
  rel.modifiers = (rel.modifiers ?? []).filter(m => !STRUCTURAL_LABELS.has(m.label));

  // faith
  if (from.stateReligionId && to.stateReligionId) {
    if (from.stateReligionId === to.stateReligionId) {
      addRelationModifier(rel, { label: "Same faith", opinionDelta: 12, tensionDelta: -5 });
    } else {
      const zealot = from.ideology === "spiritualist" || from.mood === "crusading";
      addRelationModifier(rel, { label: "Different faith", opinionDelta: zealot ? -18 : -8, tensionDelta: zealot ? 8 : 3 });
    }
  }

  // alliance
  const allied = (from.allianceIds ?? []).some(aid => (to.allianceIds ?? []).includes(aid));
  if (allied) addRelationModifier(rel, { label: "Allied", opinionDelta: 22, tensionDelta: -18 });

  // trade partner
  const trades = Object.values(state.tradeRoutes).some(
    r => (r.empireAId === fromId && r.empireBId === to.id) || (r.empireAId === to.id && r.empireBId === fromId)
  );
  if (trades) addRelationModifier(rel, { label: "Trade partner", opinionDelta: 12, tensionDelta: -8 });

  // common enemy: someone both empires are at war with
  const commonEnemy = from.activeWarEmpireIds.some(e => e !== to.id && to.activeWarEmpireIds.includes(e));
  if (commonEnemy) addRelationModifier(rel, { label: "Common enemy", opinionDelta: 14, tensionDelta: -6 });
}
