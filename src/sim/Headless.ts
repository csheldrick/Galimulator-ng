import type { GalaxyState, SimSettings, EventType, Id } from "../types/sim";
import { SeededRandom } from "./Random";
import { generateGalaxy } from "./Galaxy";
import { executeTick } from "./Tick";
import { ensureArtifactObjects } from "./Artifacts";
import { lineageChain, dynastyLegitimacy } from "./Dynasty";
import { summarizeGrievances } from "./Relations";

export interface Tally {
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
  crises: number;
  artifacts: number;
  mergers: number;
  factionsFormed: number;
  factionUprisings: number;
  questsLaunched: number;
  questsCompleted: number;
  subjectsCreated: number;
  subjectRebellions: number;
  subjectIntegrations: number;
  subjectLiberations: number;
  promotions: number;
  falls: number;
}

function emptyTally(): Tally {
  return { founded: 0, collapsed: 0, transcended: 0, rebellions: 0, warsDeclared: 0, coups: 0, monstersSpawned: 0, monstersSlain: 0, conversions: 0, newFaiths: 0, crises: 0, artifacts: 0, mergers: 0, factionsFormed: 0, factionUprisings: 0, questsLaunched: 0, questsCompleted: 0, subjectsCreated: 0, subjectRebellions: 0, subjectIntegrations: 0, subjectLiberations: 0, promotions: 0, falls: 0 };
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
  "galactic-crisis": "crises",
  "artifact-discovered": "artifacts",
  "empire-merged": "mergers",
  "faction-formed": "factionsFormed",
  "faction-uprising": "factionUprisings",
  "quest-launched": "questsLaunched",
  "quest-completed": "questsCompleted",
  "subject-created": "subjectsCreated",
  "subject-rebelled": "subjectRebellions",
  "subject-integrated": "subjectIntegrations",
  "subject-liberated": "subjectLiberations",
  "character-rose": "promotions",
  "character-fell": "falls",
};

function graphMetrics(state: GalaxyState) {
  const systems = Object.values(state.systems);
  if (systems.length === 0) return { avgDegree: 0, avgPathProxy: 0, maxDegree: 0 };
  const degrees = systems.map(s => s.connectedSystemIds.length);
  const avgDegree = degrees.reduce((a, b) => a + b, 0) / systems.length;
  const maxDegree = Math.max(...degrees);
  let samples = 0;
  let sumNearest = 0;
  for (let i = 0; i < systems.length; i += Math.max(1, Math.floor(systems.length / 40))) {
    const a = systems[i];
    for (const nid of a.connectedSystemIds.slice(0, 4)) {
      const b = state.systems[nid];
      if (!b) continue;
      sumNearest += Math.hypot(a.x - b.x, a.y - b.y);
      samples++;
    }
  }
  return { avgDegree, avgPathProxy: samples ? sumNearest / samples : 0, maxDegree };
}

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
  const largest = [...empires].sort((a, b) => b.ownedSystemIds.length - a.ownedSystemIds.length)[0];
  const largestShare = largest && systems.length ? largest.ownedSystemIds.length / systems.length : 0;
  // Lineage health: how deep a chain of rulers the longest-reigning house has accumulated.
  const dynasties = state.dynasties ?? {};
  const livingDynasties = Object.values(dynasties).filter(d => d.extinctTick === undefined).length;
  let deepestChain = 0; let deepestName = "";
  for (const e of empires) {
    const len = lineageChain(state, e, 999).length;
    if (len > deepestChain) { deepestChain = len; deepestName = `${e.name} (House of ${state.dynasties?.[e.dynastyId ?? ""]?.name ?? "?"})`; }
  }
  const factionList = Object.values(state.factions ?? {});
  const subjectList = Object.values(state.subjects ?? {});
  const subjectsByStatus: Record<string, number> = {};
  for (const sr of subjectList) subjectsByStatus[sr.status] = (subjectsByStatus[sr.status] ?? 0) + 1;
  const shipsByRole: Record<string, number> = {};
  for (const f of Object.values(state.fleets)) if (f.role) shipsByRole[f.role] = (shipsByRole[f.role] ?? 0) + 1;
  const topDynasty = Object.values(dynasties).filter(d => d.extinctTick === undefined).sort((a, b) => b.prestige - a.prestige)[0] ?? null;
  const topDynastyLegit = topDynasty ? dynastyLegitimacy(state, topDynasty.id) : 0;
  const grievances = summarizeGrievances(state);
  return {
    grievances,
    topDynastyLegit,
    shipsByRole,
    topDynasty,
    factionsActive: factionList.length,
    factionWorlds: factionList.reduce((sum, f) => sum + f.systemIds.length, 0),
    nearUprisings: factionList.filter(f => f.uprisingProgress > 0.75).length,
    subjects: subjectList.length,
    subjectsByStatus,
    people: Object.keys(state.people ?? {}).length,
    dynasties: Object.keys(dynasties).length,
    livingDynasties,
    deepestChain,
    deepestName,
    empires: empires.length,
    survivors,
    ownedSystems: systems.filter(s => s.ownerEmpireId).length,
    wars: wars.size,
    fleets: Object.keys(state.fleets).length,
    monsters: Object.keys(state.monsters).length,
    oddities: Object.keys(state.oddities ?? {}).length,
    faiths: Object.keys(state.religions).length,
    alliances: Object.keys(state.alliances ?? {}).length,
    tradeRoutes: Object.keys(state.tradeRoutes ?? {}).length,
    artifacts: Object.keys(state.artifacts ?? {}).length,
    markers: systems.reduce((sum, s) => sum + (s.markers?.length ?? 0), 0),
    topFaiths,
    largest,
    largestShare,
    graph: graphMetrics(state),
  };
}

/**
 * Runs a fresh, deterministic galaxy headlessly and returns the markdown report
 * plus the final cumulative event tally. The tally lets callers assert minimum
 * simulation health without parsing the report text.
 */
export function runHeadlessStats(settings: SimSettings, milestones: number[] = [1000, 3000, 10000]): { report: string; tally: Tally } {
  const sorted = [...milestones].sort((a, b) => a - b);
  const maxTick = sorted[sorted.length - 1];
  const rng = new SeededRandom(settings.seed);
  const state = generateGalaxy(settings.seed, settings.numStars, settings.numEmpires, rng, settings.galaxyShape, settings.starlaneMode, settings.empireLayout, settings.gridAlignment);
  ensureArtifactObjects(state, rng);
  const originalIds = new Set(Object.keys(state.empires));
  const startCount = originalIds.size;
  const startGraph = graphMetrics(state);

  const cumulative = emptyTally();
  const lines: string[] = [
    `# galimulator-ng headless report`, ``,
    `Seed: ${settings.seed} · Stars: ${settings.numStars} · Starting empires: ${startCount}`,
    `Shape: ${settings.galaxyShape ?? "spiral"} · Lanes: ${settings.starlaneMode ?? "standard"} · Layout: ${settings.empireLayout ?? "classic"}`,
    `Initial graph: avg degree ${startGraph.avgDegree.toFixed(2)} · max degree ${startGraph.maxDegree} · avg lane length ${startGraph.avgPathProxy.toFixed(1)}`,
    `Milestones: ${sorted.join(", ")} ticks`, ``,
  ];

  let lastFounded = 0, lastCollapsed = 0;
  let nextIdx = 0;

  for (let t = 0; t < maxTick; t++) {
    const tickValue = state.tick;
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
        `- Largest power: ${m.largest ? `${m.largest.name} (${m.largest.ownedSystemIds.length} systems, ${(m.largestShare * 100).toFixed(1)}% of map)` : "none"}`,
        `- Active wars now: ${m.wars} · cumulative wars declared: ${cumulative.warsDeclared}`,
        `- Alliances: ${m.alliances} blocs · Trade routes: ${m.tradeRoutes}`,
        `- Artifacts: ${m.artifacts} · Markers/scars: ${m.markers}`,
        `- Dynasties: ${m.dynasties} (${m.livingDynasties} living) · People: ${m.people} · Deepest ruler chain: ${m.deepestChain}${m.deepestName ? ` — ${m.deepestName}` : ""}`,
        `- Grievances: ${m.grievances.active} active across ${m.grievances.pairs} feuds (${m.grievances.holders} empires) · avg +${m.grievances.avgTension} tension, peak +${m.grievances.peakTension} · ${m.grievances.shareOfHistorical}% of historical modifiers · oldest ${m.grievances.oldestAgeTicks}t`,
        `- Graph now: avg degree ${m.graph.avgDegree.toFixed(2)} · max degree ${m.graph.maxDegree} · avg lane length ${m.graph.avgPathProxy.toFixed(1)}`,
        `- Churn since last milestone: ${churn} empire births+deaths`,
        `- Cumulative: ${cumulative.founded} founded, ${cumulative.collapsed} collapsed, ${cumulative.mergers} merged, ${cumulative.rebellions} rebellions, ${cumulative.coups} coups, ${cumulative.transcended} transcended`,
        `- Religion: ${m.faiths} faiths · ${cumulative.newFaiths} founded · ${cumulative.conversions} state conversions`,
        `  - Spread: ${m.topFaiths.map(f => `${f.name} (${f.worlds})`).join(", ") || "none"}`,
        `- Monsters: ${m.monsters} at large · ${cumulative.monstersSpawned} spawned · ${cumulative.monstersSlain} slain · Oddities roaming: ${m.oddities} · Crises/oddity events: ${cumulative.crises}`,
        `- Factions: ${m.factionsActive} active (${m.factionWorlds} worlds, ${m.nearUprisings} near uprising) · ${cumulative.factionsFormed} formed · ${cumulative.factionUprisings} uprisings`,
        `- Subjects: ${m.subjects} active${m.subjects ? ` (${Object.entries(m.subjectsByStatus).map(([k, n]) => `${n} ${k}`).join(", ")})` : ""} · ${cumulative.subjectsCreated} created · ${cumulative.subjectRebellions} rebellions · ${cumulative.subjectIntegrations} integrations · ${cumulative.subjectLiberations} liberations`,
        `- Quests: ${cumulative.questsLaunched} launched · ${cumulative.questsCompleted} completed`,
        `- Specialist ships: ${Object.keys(m.shipsByRole).length ? Object.entries(m.shipsByRole).map(([r, n]) => `${n} ${r}`).join(", ") : "none"} active`,
        `- Careers: ${cumulative.promotions} promotions · ${cumulative.falls} falls · top house: ${m.topDynasty ? `${m.topDynasty.name} (prestige ${m.topDynasty.prestige.toFixed(0)}, legitimacy ${m.topDynastyLegit >= 0 ? "+" : ""}${m.topDynastyLegit.toFixed(2)})` : "none"}`,
        ``,
      );
      lastFounded = cumulative.founded;
      lastCollapsed = cumulative.collapsed;
      nextIdx++;
    }
  }

  return { report: lines.join("\n"), tally: cumulative };
}

/**
 * Convenience wrapper for callers that only need the markdown string (e.g. the
 * UI's "Headless report" download button). For structured access to the tally
 * use `runHeadlessStats`.
 */
export function runHeadlessReport(settings: SimSettings, milestones: number[] = [1000, 3000, 10000]): string {
  return runHeadlessStats(settings, milestones).report;
}

export function runPresetSweep(base: SimSettings): string {
  const presets: Array<[string, Partial<SimSettings>]> = [
    ["Classic Spiral", { galaxyShape: "spiral", starlaneMode: "standard", empireLayout: "classic" }],
    ["Ring War", { galaxyShape: "hollow-disc", starlaneMode: "webbed", empireLayout: "random-blobs" }],
    ["Clustered Civilizations", { galaxyShape: "clustered", starlaneMode: "sparse", empireLayout: "few-big-blobs" }],
    ["Trade Web", { galaxyShape: "web", starlaneMode: "webbed", empireLayout: "scattered" }],
    ["Death Chain", { galaxyShape: "string", starlaneMode: "string", empireLayout: "many-one-star" }],
    ["Toybox Chaos", { galaxyShape: "chaos", starlaneMode: "dense", empireLayout: "random-blobs" }],
    ["Empire Archipelago", { galaxyShape: "continents", starlaneMode: "standard", empireLayout: "few-big-blobs" }],
    ["Core and Frontier", { galaxyShape: "hub", starlaneMode: "standard", empireLayout: "classic" }],
  ];
  return presets.map(([name, patch]) => {
    const settings = { ...base, ...patch };
    return [`# Preset: ${name}`, runHeadlessReport(settings, [1000, 3000])].join("\n\n");
  }).join("\n\n---\n\n");
}
