import type { GalaxyState, StarSystem, Id } from "../types/sim";

export function dist(a: StarSystem, b: StarSystem): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Breadth-first route along starlanes. The lane graph is fully connected,
// but fall back to a direct hop just in case.
export function findPath(state: GalaxyState, originId: Id, targetId: Id): Id[] {
  if (originId === targetId) return [originId];
  const cameFrom: Record<Id, Id> = {};
  const visited = new Set<Id>([originId]);
  const queue: Id[] = [originId];
  while (queue.length) {
    const cur = queue.shift()!;
    const sys = state.systems[cur];
    if (!sys) continue;
    for (const nid of sys.connectedSystemIds) {
      if (visited.has(nid)) continue;
      visited.add(nid);
      cameFrom[nid] = cur;
      if (nid === targetId) {
        const path: Id[] = [targetId];
        let step: Id = targetId;
        while (step !== originId) { step = cameFrom[step]; path.push(step); }
        return path.reverse();
      }
      queue.push(nid);
    }
  }
  return [originId, targetId];
}

export function pathLength(state: GalaxyState, path: Id[]): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = state.systems[path[i]], b = state.systems[path[i + 1]];
    if (a && b) total += dist(a, b);
  }
  return total;
}

/** Advance a traveller (fleet or monster) along its lane path. Returns true when the route is finished. */
export function advanceAlongPath(
  state: GalaxyState,
  t: { path: Id[]; legIndex: number; legProgress: number; x: number; y: number; speed: number }
): boolean {
  let remaining = t.speed;
  while (remaining > 0 && t.legIndex < t.path.length - 1) {
    const a = state.systems[t.path[t.legIndex]];
    const b = state.systems[t.path[t.legIndex + 1]];
    if (!a || !b) { t.legIndex = t.path.length - 1; break; }
    const legLen = Math.max(1, dist(a, b));
    const legRemain = (1 - t.legProgress) * legLen;
    if (remaining >= legRemain) { remaining -= legRemain; t.legIndex++; t.legProgress = 0; }
    else { t.legProgress += remaining / legLen; remaining = 0; }
  }
  const legA = state.systems[t.path[Math.min(t.legIndex, t.path.length - 1)]];
  const legB = state.systems[t.path[Math.min(t.legIndex + 1, t.path.length - 1)]];
  if (legA && legB) {
    t.x = legA.x + (legB.x - legA.x) * t.legProgress;
    t.y = legA.y + (legB.y - legA.y) * t.legProgress;
  }
  return t.legIndex >= t.path.length - 1;
}
