import type { PRNG, StarSystem, Empire, GalaxyState, Id, Ruler, Religion } from "../types/sim";
import type { GalaxyShape, StarlaneMode } from "../types/sim";
import { resetEventCounter } from "./Events";
import { makeReligion } from "./Religion";
import { IDEOLOGIES } from "./Moods";
import { makeCourt, resetCharacterCounter } from "./Characters";

const SYLLABLES = [
  "al","ar","an","ax","az","bar","bel","cer","cor","den","dor","el","en",
  "eth","far","fen","gar","gel","har","hex","ig","il","jar","kel","lar",
  "len","lor","mal","mar","mor","nar","nel","nor","or","os","par","pel",
  "pri","qal","ren","rix","sar","sel","sol","sor","tar","tel","tir","tor",
  "ul","ur","val","var","vel","vor","wal","xar","yal","zan","zel","zor"
];

export function makeName(rng: PRNG): string {
  const n = rng.nextInt(2, 3);
  let name = "";
  for (let i = 0; i < n; i++) name += rng.pick(SYLLABLES);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const RULER_TITLES = [
  "Emperor","Empress","Overlord","High King","High Queen","Archon","Despot",
  "Autarch","Matriarch","Patriarch","Grand Vizier","Eternal Sage","Warlord","Oracle"
];

const ARTIFACT_FORMS = [
  "Orb of {n}", "{n} Relic", "Beacon of {n}", "The {n} Engine", "Shard of {n}",
  "{n} Monolith", "Crown of {n}", "The {n} Codex",
];

export function makeArtifactName(rng: PRNG): string {
  return rng.pick(ARTIFACT_FORMS).replace("{n}", makeName(rng));
}

export function makeRuler(rng: PRNG, accessionTick: number): Ruler {
  return {
    name: makeName(rng),
    title: rng.pick(RULER_TITLES),
    dynasty: makeName(rng),
    ordinal: 1,
    accessionTick,
  };
}

// ── Shape generators ──────────────────────────────────────────────────────────

function spiralPoint(rng: PRNG, width: number, height: number): [number, number] {
  const arms = 3;
  const arm = rng.nextInt(0, arms - 1);
  const t = rng.range(0.05, 1.0);
  const angle = (arm * (2 * Math.PI / arms)) + t * 3.5 + rng.range(-0.4, 0.4);
  const r = t * (Math.min(width, height) * 0.44) + rng.range(-20, 20);
  const cx = width / 2;
  const cy = height / 2;
  return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
}

function discPoint(rng: PRNG, width: number, height: number): [number, number] {
  const cx = width / 2, cy = height / 2;
  const maxR = Math.min(width, height) * 0.44;
  // use sqrt for uniform disc density
  const r = Math.sqrt(rng.next()) * maxR + rng.range(-10, 10);
  const angle = rng.next() * Math.PI * 2;
  return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
}

function hollowDiscPoint(rng: PRNG, width: number, height: number): [number, number] {
  const cx = width / 2, cy = height / 2;
  const maxR = Math.min(width, height) * 0.44;
  const minR = maxR * 0.35;
  const r = minR + rng.next() * (maxR - minR) + rng.range(-8, 8);
  const angle = rng.next() * Math.PI * 2;
  return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
}

function clusteredPoint(rng: PRNG, width: number, height: number): [number, number] {
  const NUM_CLUSTERS = 6;
  const spread = Math.min(width, height) * 0.14;
  const clusterR = Math.min(width, height) * 0.36;
  const clusterIdx = rng.nextInt(0, NUM_CLUSTERS - 1);
  const clusterAngle = (clusterIdx / NUM_CLUSTERS) * Math.PI * 2 + rng.range(-0.2, 0.2);
  const cr = clusterR * rng.range(0.5, 1.0);
  const cx = width / 2 + Math.cos(clusterAngle) * cr;
  const cy = height / 2 + Math.sin(clusterAngle) * cr;
  const angle = rng.next() * Math.PI * 2;
  const r = Math.sqrt(rng.next()) * spread;
  return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
}

function chaosPoint(rng: PRNG, width: number, height: number): [number, number] {
  const margin = 40;
  return [margin + rng.next() * (width - margin * 2), margin + rng.next() * (height - margin * 2)];
}

function gridPoint(rng: PRNG, width: number, height: number, index: number, total: number): [number, number] {
  const cols = Math.ceil(Math.sqrt(total * (width / height)));
  const rows = Math.ceil(total / cols);
  const col = index % cols;
  const row = Math.floor(index / cols);
  const cellW = (width - 80) / cols;
  const cellH = (height - 80) / rows;
  return [
    40 + col * cellW + cellW / 2 + rng.range(-cellW * 0.25, cellW * 0.25),
    40 + row * cellH + cellH / 2 + rng.range(-cellH * 0.25, cellH * 0.25),
  ];
}

function stringPoint(rng: PRNG, width: number, height: number): [number, number] {
  const NUM_STRINGS = 3;
  const strIdx = rng.nextInt(0, NUM_STRINGS - 1);
  const t = rng.range(0.02, 0.98);
  const stringAngle = (strIdx / NUM_STRINGS) * Math.PI;
  const cx = width / 2, cy = height / 2;
  const len = Math.min(width, height) * 0.42;
  const bx = cx + Math.cos(stringAngle) * len * (t - 0.5) * 2;
  const by = cy + Math.sin(stringAngle) * len * (t - 0.5) * 2;
  return [bx + rng.range(-18, 18), by + rng.range(-18, 18)];
}

function getShapePoint(shape: GalaxyShape, rng: PRNG, width: number, height: number, index: number, total: number): [number, number] {
  switch (shape) {
    case "disc": return discPoint(rng, width, height);
    case "hollow-disc": return hollowDiscPoint(rng, width, height);
    case "clustered": return clusteredPoint(rng, width, height);
    case "chaos": return chaosPoint(rng, width, height);
    case "grid": return gridPoint(rng, width, height, index, total);
    case "string": return stringPoint(rng, width, height);
    case "spiral":
    default: return spiralPoint(rng, width, height);
  }
}

// ── Starlane builder ──────────────────────────────────────────────────────────

function buildStarlanes(systemList: StarSystem[], mode: StarlaneMode = "standard"): void {
  const neighborLinks = mode === "webbed" ? 5 : mode === "dense" ? 4 : mode === "sparse" ? 2 : 3;
  const maxLane = mode === "dense" ? 160 : mode === "sparse" ? 100 : 130;
  const n = systemList.length;
  const linked = new Set<string>();

  const link = (a: StarSystem, b: StarSystem) => {
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    if (linked.has(key)) return;
    linked.add(key);
    a.connectedSystemIds.push(b.id);
    b.connectedSystemIds.push(a.id);
  };

  for (let i = 0; i < n; i++) {
    const a = systemList[i];
    const candidates: Array<{ s: StarSystem; d: number }> = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const b = systemList[j];
      const dx = a.x - b.x, dy = a.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= maxLane) candidates.push({ s: b, d });
    }
    candidates.sort((p, q) => p.d - q.d);
    for (const { s } of candidates.slice(0, neighborLinks)) link(a, s);
  }

  // merge components until the whole graph is connected
  const byId: Record<Id, StarSystem> = {};
  for (const s of systemList) byId[s.id] = s;
  for (;;) {
    const component = new Set<Id>();
    const queue = [systemList[0].id];
    component.add(systemList[0].id);
    while (queue.length) {
      const cur = byId[queue.pop()!];
      for (const nid of cur.connectedSystemIds) {
        if (!component.has(nid)) { component.add(nid); queue.push(nid); }
      }
    }
    if (component.size === n) break;
    let bestA: StarSystem | null = null, bestB: StarSystem | null = null, bestD = Infinity;
    for (const a of systemList) {
      if (!component.has(a.id)) continue;
      for (const b of systemList) {
        if (component.has(b.id)) continue;
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; bestA = a; bestB = b; }
      }
    }
    if (!bestA || !bestB) break;
    link(bestA, bestB);
  }
}

// ── Empire name pool ──────────────────────────────────────────────────────────

const EMPIRE_COLORS = [
  "#e63946","#457b9d","#2a9d8f","#e9c46a","#f4a261","#6a4c93",
  "#1982c4","#8ac926","#ff595e","#6a0572","#0096c7","#ff9f1c",
  "#d62828","#023e8a","#606c38","#bc6c25","#7209b7","#4cc9f0",
  "#f72585","#3a86ff"
];

const EMPIRE_ADJ = [
  "Grand","Imperial","Free","Ancient","United","Sacred","Iron","Golden",
  "Silver","Dark","Bright","Northern","Southern","Eastern","Western","Eternal"
];
const EMPIRE_NOUN = [
  "Alliance","Empire","Republic","Dominion","Collective","Realm","Confederacy",
  "Federation","Order","Kingdom","Sovereignty","Covenant","League","Union"
];

export function makeEmpireName(rng: PRNG, capitalName: string): string {
  const roll = rng.next();
  if (roll < 0.4) return `${rng.pick(EMPIRE_ADJ)} ${rng.pick(EMPIRE_NOUN)}`;
  if (roll < 0.75) return `${rng.pick(EMPIRE_NOUN)} of ${capitalName}`;
  return `${capitalName} ${rng.pick(EMPIRE_NOUN)}`;
}

// ── Galaxy generator ──────────────────────────────────────────────────────────

export function generateGalaxy(
  seed: number,
  numStars: number,
  numEmpires: number,
  rng: PRNG,
  galaxyShape: GalaxyShape = "spiral",
  starlaneMode: StarlaneMode = "standard"
): GalaxyState {
  resetEventCounter();
  resetCharacterCounter();
  const WIDTH = 1200;
  const HEIGHT = 900;
  const systems: Record<Id, StarSystem> = {};
  const systemList: StarSystem[] = [];

  for (let i = 0; i < numStars; i++) {
    const id = `sys-${i}`;
    const [x, y] = getShapePoint(galaxyShape, rng, WIDTH, HEIGHT, i, numStars);
    const system: StarSystem = {
      id,
      name: makeName(rng),
      x,
      y,
      population: rng.range(0.1, 1.0),
      resources: rng.range(0.1, 1.0),
      habitability: rng.range(0.1, 1.0),
      stability: rng.range(0.5, 1.0),
      ownerEmpireId: null,
      cultureId: "none",
      religionId: null,
      artifactName: rng.next() < 0.04 ? makeArtifactName(rng) : null,
      techLevel: rng.range(0.1, 0.5),
      recentEventIds: [],
      connectedSystemIds: [],
      markers: [],
      localWealth: rng.range(0, 30),
    };
    systems[id] = system;
    systemList.push(system);
  }

  buildStarlanes(systemList, starlaneMode);

  // seed the great faiths on populous worlds; they spread along starlanes from there
  const stateForReligions = { tick: 0, religions: {} as Record<Id, Religion> } as GalaxyState;
  const byPop = [...systemList].sort((a, b) => b.population - a.population);
  const numReligions = Math.min(rng.nextInt(4, 6), byPop.length);
  for (let i = 0; i < numReligions; i++) {
    const holy = byPop[i * 3 % byPop.length];
    const religion = makeReligion(stateForReligions, holy, rng);
    stateForReligions.religions[religion.id] = religion;
    holy.religionId = religion.id;
    for (const nid of holy.connectedSystemIds) {
      const neighbor = systems[nid];
      if (neighbor && !neighbor.religionId) neighbor.religionId = religion.id;
    }
  }
  const religions = stateForReligions.religions;

  const sorted = [...systemList].sort((a, b) => b.habitability - a.habitability);

  const empires: Record<Id, Empire> = {};
  const usedCapitals = new Set<Id>();
  const colors = [...EMPIRE_COLORS];
  for (let i = colors.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    [colors[i], colors[j]] = [colors[j], colors[i]];
  }

  let colorIdx = 0;
  for (let i = 0; i < numEmpires; i++) {
    let capital: StarSystem | null = null;
    for (const candidate of sorted) {
      if (usedCapitals.has(candidate.id)) continue;
      let tooClose = false;
      for (const cid of usedCapitals) {
        const other = systems[cid];
        const dx = candidate.x - other.x;
        const dy = candidate.y - other.y;
        if (Math.sqrt(dx * dx + dy * dy) < 80) { tooClose = true; break; }
      }
      if (!tooClose) { capital = candidate; break; }
    }
    if (!capital) capital = sorted[i % sorted.length];

    usedCapitals.add(capital.id);
    const empId = `emp-${i}`;
    const cultureId = `culture-${i}`;
    capital.ownerEmpireId = empId;
    capital.cultureId = cultureId;
    capital.population = Math.max(capital.population, 0.5);

    const empire: Empire = {
      id: empId,
      name: makeEmpireName(rng, capital.name),
      color: colors[colorIdx++ % colors.length],
      mood: "expanding",
      moodSince: 0,
      ideology: rng.pick(IDEOLOGIES),
      ruler: makeRuler(rng, 0),
      court: makeCourt(rng, 0, capital.religionId !== null),
      capitalSystemId: capital.id,
      ownedSystemIds: [capital.id],
      population: capital.population * 1000,
      wealth: rng.range(100, 500),
      militaryStrength: rng.range(50, 200),
      cohesion: rng.range(0.5, 1.0),
      aggression: rng.range(0.1, 1.0),
      expansionism: rng.range(0.2, 1.0),
      techLevel: capital.techLevel,
      cultureId,
      stateReligionId: capital.religionId,
      relationshipByEmpireId: {},
      activeWarEmpireIds: [],
      historicalEventIds: [],
      allianceIds: [],
    };
    empires[empId] = empire;
  }

  return {
    tick: 0, seed, systems, empires, fleets: {}, religions, tradeRoutes: {},
    monsters: {}, events: {}, eventLog: [], alliances: {},
  };
}
