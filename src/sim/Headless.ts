import type { GalaxyState, SimSettings, EventType, Id } from "../types/sim";
import { SeededRandom } from "./Random";
import { generateGalaxy } from "./Galaxy";
import { executeTick } from "./Tick";

interface Tally {
  founded: number;
  collapsed: number;
  transcended: number;
  rebellions: number;
  warsDeclared: number;
  coups: number;
  monstersSpawned: number;
  monstersSlain: number;
  conversions: number;
  newFaiths: number;
}

function emptyTally(): Tally {
  return { founded: 0, collapsed: 0, transcended: 0, rebellions: 0, warsDeclared: 0, coups: 0, monstersSpawned: 0, monstersSlain: 0, conversions: 0, newFaiths: 0 };
}

const TALLY_OF: Partial<Record<EventType, keyof Tally>> = {
  "empire-founded": "founded",
  "empire-collapsed": "collapsed",
  "transcended": "transcended",
  "rebellion": "rebellions",
  "war-declared": "warsDeclared",
  "coup": "coups",
  "monster-spawned": "monstersSpawned",
  "monster-slain": "monstersSlain",
  "religion-adopted": "conversions",
  "religion-founded": "newFaiths",
};

function snapshotMetrics(state: GalaxyState, originalIds: Set<Id>) {
  const empires = Object.values(state.empires);
  const systems = Object.values(state.systems);
  const wars = new Set<string>();
  for (const e of empires) for (const w of e.activeWarEmpireIds) wars.add([e.id, w].sort().join("~"));
  const survivors = empires.filter(e => originalIds.has(e.id)).length;
  const faithWorlds: Record<string, number> = {};
  for (const s of systems) if (s.religionId) faithWorlds[s.religionId] = (faithWorlds[s.religionId] ?? 0) + 1;
  const topFaiths = Object.entries(faithWorlds)
    .map(([id, n]) => ({ name: state.religions[id]?.name ?? "lost faith", worlds: n }))
    .sort((a, b) => b.worlds - a.worlds).slice(0, 3);
  return {
    empires: empires.length,
    survivors,
    ownedSystems: systems.filter(s => s.ownerEmpireId).length,
    wars: wars.size,
    fleets: Object.keys(state.fleets).length,
    monsters: Object.keys(state.monsters).length,
    faiths: Object.keys(state.religions).length,
    alliances: Object.keys(state.alliances ?? {}).length,
    tradeRoutes: Object.keys(state.tradeRoutes ?? {}).length,
    topFaiths,
    largest: [...empires].sort((a, b) => b.ownedSystemIds.length - a.ownedSystemIds.length)[0],
  };
}

/**
 * Runs a fresh, deterministic galaxy headlessly and reports the state of the
 * sandbox at each milestone tick — survival, churn, wars, religion spread,
 * monsters, and collapses — so a long run can be evaluated without watching it.
 */
export function runHeadlessReport(settings: SimSettings, milestones: number[] = [1000, 3000, 10000]): string {
  const sorted = [...milestones].sort((a, b) => a - b);
  const maxTick = sorted[sorted.length - 1];
  const rng = new SeededRandom(settings.seed);
  const state = generateGalaxy(settings.seed, settings.numStars, settings.numEmpires, rng);
  const originalIds = new Set(Object.keys(state.empires));
  const startCount = originalIds.size;

  const cumulative = emptyTally();
  const lines: string[] = [
    `# galimulator-ng headless report`, ``,
    `Seed: ${settings.seed} · Stars: ${settings.numStars} · Starting empires: ${startCount}`,
    `Milestones: ${sorted.join(", ")} ticks`, ``,
  ];

  let lastFounded = 0, lastCollapsed = 0;
  let nextIdx = 0;

  for (let t = 0; t < maxTick; t++) {
    const tickValue = state.tick; // events this step are stamped with this tick
    executeTick(state, rng);
    for (const ev of Object.values(state.events)) {
      if (ev.tick !== tickValue) continue;
      const key = TALLY_OF[ev.type];
      if (key) cumulative[key]++;
    }

    while (nextIdx < sorted.length && state.tick >= sorted[nextIdx]) {
      const m = snapshotMetrics(state, originalIds);
      const churn = (cumulative.founded - lastFounded) + (cumulative.collapsed - lastCollapsed);
      lines.push(
        `## Tick ${sorted[nextIdx]}`,
        ``,
        `- Living empires: ${m.empires} (${m.survivors}/${startCount} original founders survive — ${((m.survivors / startCount) * 100).toFixed(0)}% survival)`,
        `- Owned systems: ${m.ownedSystems}/${settings.numStars}`,
        `- Largest power: ${m.largest ? `${m.largest.name} (${m.largest.ownedSystemIds.length} systems)` : "none"}`,
        `- Active wars now: ${m.wars} · cumulative wars declared: ${cumulative.warsDeclared}`,
        `- Alliances: ${m.alliances} blocs · Trade routes: ${m.tradeRoutes}`,
        `- Churn since last milestone: ${churn} empire births+deaths`,
        `- Cumulative: ${cumulative.founded} founded, ${cumulative.collapsed} collapsed, ${cumulative.rebellions} rebellions, ${cumulative.coups} coups, ${cumulative.transcended} transcended`,
        `- Religion: ${m.faiths} faiths · ${cumulative.newFaiths} founded · ${cumulative.conversions} state conversions`,
        `  - Spread: ${m.topFaiths.map(f => `${f.name} (${f.worlds})`).join(", ") || "none"}`,
        `- Monsters: ${m.monsters} at large · ${cumulative.monstersSpawned} spawned · ${cumulative.monstersSlain} slain`,
        ``,
      );
      lastFounded = cumulative.founded;
      lastCollapsed = cumulative.collapsed;
      nextIdx++;
    }
  }

  return lines.join("\n");
}
