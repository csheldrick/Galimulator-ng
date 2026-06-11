import type { Empire, Id, Ruler, RulerLineageEntry, RulerLineageOrigin } from "../types/sim";

function rulerEntryId(empireId: Id, ruler: Ruler): Id {
  return `${empireId}-ruler-${ruler.accessionTick}-${ruler.dynasty}-${ruler.name}-${ruler.ordinal}`;
}

export function makeLineageEntry(
  empireId: Id,
  ruler: Ruler,
  origin: RulerLineageOrigin,
  predecessorId: Id | null = null,
  parentId: Id | null = null,
): RulerLineageEntry {
  return {
    id: rulerEntryId(empireId, ruler),
    name: ruler.name,
    title: ruler.title,
    dynasty: ruler.dynasty,
    ordinal: ruler.ordinal,
    accessionTick: ruler.accessionTick,
    origin,
    predecessorId,
    parentId,
    traits: ruler.traits,
  };
}

export function initialLineage(empireId: Id, ruler: Ruler, origin: RulerLineageOrigin = "founder"): RulerLineageEntry[] {
  return [makeLineageEntry(empireId, ruler, origin)];
}

export function ensureLineage(empire: Empire, origin: RulerLineageOrigin = "founder"): RulerLineageEntry[] {
  if (!empire.rulerLineage || empire.rulerLineage.length === 0) {
    empire.rulerLineage = initialLineage(empire.id, empire.ruler, origin);
  }
  return empire.rulerLineage;
}

export function currentLineageEntry(empire: Empire): RulerLineageEntry {
  const lineage = ensureLineage(empire);
  return [...lineage].reverse().find(entry => entry.endTick === undefined) ?? lineage[lineage.length - 1];
}

export function recordRulerTransition(
  empire: Empire,
  nextRuler: Ruler,
  tick: number,
  origin: RulerLineageOrigin,
  endReason: string,
  parentId?: Id | null,
): RulerLineageEntry {
  const lineage = ensureLineage(empire);
  const predecessor = currentLineageEntry(empire);
  if (predecessor.endTick === undefined) {
    predecessor.endTick = tick;
    predecessor.endReason = endReason;
  }

  const inferredParentId = parentId !== undefined
    ? parentId
    : nextRuler.dynasty === empire.ruler.dynasty
      ? predecessor.id
      : null;
  const nextEntry = makeLineageEntry(empire.id, nextRuler, origin, predecessor.id, inferredParentId);
  empire.ruler = nextRuler;
  lineage.push(nextEntry);
  if (lineage.length > 16) empire.rulerLineage = lineage.slice(-16);
  return nextEntry;
}
