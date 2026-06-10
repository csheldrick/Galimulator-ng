import type { GalaxyState, Empire, Id, PRNG } from "../types/sim";
import { createEvent } from "./Events";
import { getNeighboringEmpires } from "./Diplomacy";

const MAX_ROUTES_PER_EMPIRE = 3;
const ROUTE_INCOME = 1.6;

function routesOf(state: GalaxyState, empireId: Id) {
  return Object.values(state.tradeRoutes).filter(r => r.empireAId === empireId || r.empireBId === empireId);
}

function hasRouteBetween(state: GalaxyState, a: Id, b: Id): boolean {
  return Object.values(state.tradeRoutes).some(r =>
    (r.empireAId === a && r.empireBId === b) || (r.empireAId === b && r.empireBId === a));
}

function severRoute(state: GalaxyState, routeId: Id, reason: string): void {
  const route = state.tradeRoutes[routeId];
  if (!route) return;
  delete state.tradeRoutes[routeId];
  const a = state.empires[route.empireAId], b = state.empires[route.empireBId];
  createEvent(state, state.tick, "trade-severed", `Trade severed: ${a?.name ?? "?"} × ${b?.name ?? "?"}`,
    `The trade lane between ${a?.name ?? "a fallen power"} and ${b?.name ?? "a fallen power"} ${reason}.`,
    2, [route.empireAId, route.empireBId].filter(id => state.empires[id]), []);
}

export function severEmpireRoutes(state: GalaxyState, empireId: Id, reason: string): void {
  for (const route of routesOf(state, empireId)) severRoute(state, route.id, reason);
}

export function stepTrade(state: GalaxyState, rng: PRNG): void {
  // routes pay both partners and slowly build goodwill
  for (const route of Object.values(state.tradeRoutes)) {
    const a = state.empires[route.empireAId], b = state.empires[route.empireBId];
    if (!a || !b) { severRoute(state, route.id, "collapsed with its partner"); continue; }
    if (a.activeWarEmpireIds.includes(b.id)) { severRoute(state, route.id, "was cut by war"); continue; }
    const materialist = (e: Empire) => e.ideology === "materialist" ? 1.5 : 1;
    a.wealth += ROUTE_INCOME * materialist(a);
    b.wealth += ROUTE_INCOME * materialist(b);
    // shared prosperity cools tempers: trading partners rarely come to blows
    const relA = a.relationshipByEmpireId[b.id], relB = b.relationshipByEmpireId[a.id];
    if (relA) { relA.opinion = Math.min(100, relA.opinion + 0.02); relA.tension = Math.max(0, relA.tension - 1.6); }
    if (relB) { relB.opinion = Math.min(100, relB.opinion + 0.02); relB.tension = Math.max(0, relB.tension - 1.6); }
  }

  // friendly lane-neighbors open new routes
  for (const emp of Object.values(state.empires)) {
    if (routesOf(state, emp.id).length >= MAX_ROUTES_PER_EMPIRE) continue;
    const openness = emp.ideology === "materialist" ? 0.06 : emp.ideology === "isolationist" ? 0.004 : 0.02;
    if (rng.next() > openness) continue;
    for (const otherId of getNeighboringEmpires(state, emp.id)) {
      const other = state.empires[otherId];
      const rel = emp.relationshipByEmpireId[otherId];
      if (!other || !rel || rel.atWar || rel.opinion < 48 || rel.tension > 55) continue;
      if (hasRouteBetween(state, emp.id, otherId)) continue;
      if (routesOf(state, otherId).length >= MAX_ROUTES_PER_EMPIRE) continue;
      const id = `trade-${state.tick}-${Object.keys(state.tradeRoutes).length}`;
      state.tradeRoutes[id] = {
        id, empireAId: emp.id, empireBId: otherId,
        systemAId: emp.capitalSystemId, systemBId: other.capitalSystemId,
        establishedTick: state.tick,
      };
      createEvent(state, state.tick, "trade-established", `Trade opened: ${emp.name} × ${other.name}`,
        `${emp.name} and ${other.name} opened a trade lane between their capitals.`, 2, [emp.id, otherId],
        [emp.capitalSystemId, other.capitalSystemId]);
      break;
    }
  }
}
