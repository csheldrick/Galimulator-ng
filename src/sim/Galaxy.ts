import type { PRNG, StarSystem, Empire, GalaxyState, Id, Ruler, Religion, Person, Dynasty, CharacterTrait } from "../types/sim";
import type { GalaxyShape, StarlaneMode, EmpireLayout, GridAlignment, PlanetTag, GovernmentType } from "../types/sim";
import { resetEventCounter } from "./Events";
import { resetModifierSeq } from "./Relations";
import { makeReligion } from "./Religion";
import { IDEOLOGIES } from "./Moods";
import { makeCourt, resetCharacterCounter } from "./Characters";
import { foundDynasty, resetDynastyCounters } from "./Dynasty";

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

const RULER_TRAITS: CharacterTrait[] = ["bright", "dull", "warlike", "popular", "corrupt", "merchant", "zealot"];

function makeRulerTraits(rng: PRNG): CharacterTrait[] {
  const traits: CharacterTrait[] = [];
  if (rng.next() < 0.75) traits.push(rng.pick(RULER_TRAITS));
  if (rng.next() < 0.12) {
    const extra = rng.pick(RULER_TRAITS);
    if (!traits.includes(extra)) traits.push(extra);
  }
  return traits;
}

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
    traits: makeRulerTraits(rng),
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

function barredSpiralPoint(rng: PRNG, width: number, height: number): [number, number] {
  const cx = width / 2, cy = height / 2;
  const scale = Math.min(width, height);
  // a third of stars form the dense central bar; the rest trail off its ends
  if (rng.next() < 0.34) {
    const t = rng.range(-1, 1);
    return [cx + t * scale * 0.22 + rng.range(-15, 15), cy + t * scale * 0.05 + rng.range(-25, 25)];
  }
  const end = rng.next() < 0.5 ? 1 : -1;
  const t = rng.range(0.05, 1.0);
  const angle = (end > 0 ? 0 : Math.PI) + t * 2.4 * end + rng.range(-0.3, 0.3);
  const r = scale * 0.2 + t * scale * 0.26 + rng.range(-18, 18);
  return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
}

function ellipticalPoint(rng: PRNG, width: number, height: number): [number, number] {
  const cx = width / 2, cy = height / 2;
  const r = Math.sqrt(rng.next());
  const angle = rng.next() * Math.PI * 2;
  // stretched dense oval: many close neighbors, diplomacy-heavy early game
  return [
    cx + Math.cos(angle) * r * Math.min(width, height) * 0.46 + rng.range(-8, 8),
    cy + Math.sin(angle) * r * Math.min(width, height) * 0.24 + rng.range(-8, 8),
  ];
}

function irregularPoint(rng: PRNG, width: number, height: number): [number, number] {
  // lopsided cloud: three weighted lobes of different density and size
  const lobes: Array<[number, number, number, number]> = [
    [width * 0.36, height * 0.42, Math.min(width, height) * 0.3, 0.55],
    [width * 0.68, height * 0.6, Math.min(width, height) * 0.18, 0.3],
    [width * 0.58, height * 0.26, Math.min(width, height) * 0.1, 0.15],
  ];
  let roll = rng.next();
  let lobe = lobes[0];
  for (const l of lobes) { roll -= l[3]; if (roll <= 0) { lobe = l; break; } }
  const angle = rng.next() * Math.PI * 2;
  const r = Math.pow(rng.next(), 0.7) * lobe[2];
  return [lobe[0] + Math.cos(angle) * r, lobe[1] + Math.sin(angle) * r];
}

function hubPoint(rng: PRNG, width: number, height: number): [number, number] {
  const cx = width / 2, cy = height / 2;
  const scale = Math.min(width, height);
  // half the stars form a large central cluster, the rest split into satellite clusters
  if (rng.next() < 0.5) {
    const angle = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.next()) * scale * 0.18;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  }
  const SATELLITES = 5;
  const idx = rng.nextInt(0, SATELLITES - 1);
  const satAngle = (idx / SATELLITES) * Math.PI * 2 + 0.4;
  const sx = cx + Math.cos(satAngle) * scale * 0.4;
  const sy = cy + Math.sin(satAngle) * scale * 0.4;
  const angle = rng.next() * Math.PI * 2;
  const r = Math.sqrt(rng.next()) * scale * 0.09;
  return [sx + Math.cos(angle) * r, sy + Math.sin(angle) * r];
}

function webPoint(rng: PRNG, width: number, height: number): [number, number] {
  const cx = width / 2, cy = height / 2;
  const scale = Math.min(width, height);
  const NODES = 6;
  const nodeAt = (i: number): [number, number] => [
    cx + Math.cos((i / NODES) * Math.PI * 2) * scale * 0.36,
    cy + Math.sin((i / NODES) * Math.PI * 2) * scale * 0.36,
  ];
  const roll = rng.next();
  if (roll < 0.3) {
    // hub nodes of the web
    const [nx, ny] = rng.next() < 0.25 ? [cx, cy] : nodeAt(rng.nextInt(0, NODES - 1));
    const angle = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.next()) * scale * 0.07;
    return [nx + Math.cos(angle) * r, ny + Math.sin(angle) * r];
  }
  // filament stars strung between two hubs (rim chord or spoke to center)
  const a = rng.nextInt(0, NODES - 1);
  const spoke = rng.next() < 0.45;
  const [ax, ay] = nodeAt(a);
  const [bx, by] = spoke ? [cx, cy] : nodeAt((a + 1) % NODES);
  const t = rng.range(0.1, 0.9);
  return [ax + (bx - ax) * t + rng.range(-14, 14), ay + (by - ay) * t + rng.range(-14, 14)];
}

function continentsPoint(rng: PRNG, width: number, height: number): [number, number] {
  // landmass-like blobs separated by voids; thin bridge chains connect them
  const masses: Array<[number, number, number]> = [
    [width * 0.28, height * 0.32, Math.min(width, height) * 0.2],
    [width * 0.72, height * 0.3, Math.min(width, height) * 0.16],
    [width * 0.5, height * 0.72, Math.min(width, height) * 0.18],
  ];
  if (rng.next() < 0.08) {
    // bridge worlds between two random landmasses
    const i = rng.nextInt(0, masses.length - 1);
    const j = (i + 1 + rng.nextInt(0, masses.length - 2)) % masses.length;
    const t = rng.range(0.25, 0.75);
    return [
      masses[i][0] + (masses[j][0] - masses[i][0]) * t + rng.range(-12, 12),
      masses[i][1] + (masses[j][1] - masses[i][1]) * t + rng.range(-12, 12),
    ];
  }
  const m = masses[rng.nextInt(0, masses.length - 1)];
  const angle = rng.next() * Math.PI * 2;
  const r = Math.pow(rng.next(), 0.6) * m[2];
  return [m[0] + Math.cos(angle) * r, m[1] + Math.sin(angle) * r];
}

function getShapePoint(shape: GalaxyShape, rng: PRNG, width: number, height: number, index: number, total: number): [number, number] {
  switch (shape) {
    case "barred-spiral": return barredSpiralPoint(rng, width, height);
    case "disc": return discPoint(rng, width, height);
    case "hollow-disc": return hollowDiscPoint(rng, width, height);
    case "elliptical": return ellipticalPoint(rng, width, height);
    case "irregular": return irregularPoint(rng, width, height);
    case "clustered": return clusteredPoint(rng, width, height);
    case "hub": return hubPoint(rng, width, height);
    case "chaos": return chaosPoint(rng, width, height);
    case "grid": return gridPoint(rng, width, height, index, total);
    case "web": return webPoint(rng, width, height);
    case "string": return stringPoint(rng, width, height);
    case "continents": return continentsPoint(rng, width, height);
    case "spiral":
    default: return spiralPoint(rng, width, height);
  }
}

// ── Grid alignment ────────────────────────────────────────────────────────────

const GRID_CELL = 34;

function applyGridAlignment(x: number, y: number, alignment: GridAlignment, rng: PRNG): [number, number] {
  if (alignment === "square") {
    return [
      Math.round(x / GRID_CELL) * GRID_CELL + rng.range(-3, 3),
      Math.round(y / GRID_CELL) * GRID_CELL + rng.range(-3, 3),
    ];
  }
  if (alignment === "hex") {
    const rowH = GRID_CELL * 0.866;
    const row = Math.round(y / rowH);
    const offset = row % 2 === 0 ? 0 : GRID_CELL / 2;
    return [
      Math.round((x - offset) / GRID_CELL) * GRID_CELL + offset + rng.range(-3, 3),
      row * rowH + rng.range(-3, 3),
    ];
  }
  return [x, y];
}

// ── Starlane builder ──────────────────────────────────────────────────────────

function buildStarlanes(systemList: StarSystem[], mode: StarlaneMode = "standard"): void {
  const neighborLinks = mode === "webbed" ? 5 : mode === "dense" ? 4 : mode === "sparse" ? 2 : mode === "string" ? 1 : 3;
  const maxLane = mode === "dense" ? 160 : mode === "sparse" ? 100 : 130;
  // string lanes suppress high-degree junctions so the map reads as chains and front lines
  const maxDegree = mode === "string" ? 2 : Infinity;
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
    if (a.connectedSystemIds.length >= maxDegree) continue;
    const candidates: Array<{ s: StarSystem; d: number }> = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const b = systemList[j];
      if (b.connectedSystemIds.length >= maxDegree) continue;
      const dx = a.x - b.x, dy = a.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= maxLane) candidates.push({ s: b, d });
    }
    candidates.sort((p, q) => p.d - q.d);
    for (const { s } of candidates.slice(0, neighborLinks)) {
      if (a.connectedSystemIds.length >= maxDegree) break;
      if (s.connectedSystemIds.length >= maxDegree) continue;
      link(a, s);
    }
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

// ── Planet tags ───────────────────────────────────────────────────────────────

const ALL_PLANET_TAGS: PlanetTag[] = ["barren","oceanic","industrial","sacred","ruined","fortress","garden","toxic","frozen","ancient"];

function makePlanets(rng: PRNG, habitability: number, resources: number, hasArtifact: boolean): PlanetTag[] {
  const tags: PlanetTag[] = [];
  if (hasArtifact) tags.push("ancient");
  else if (habitability > 0.75) tags.push(rng.next() < 0.5 ? "garden" : "oceanic");
  else if (habitability < 0.2) tags.push(rng.next() < 0.5 ? "barren" : "frozen");
  else if (resources > 0.75) tags.push("industrial");
  else if (rng.next() < 0.06) tags.push("sacred");
  else if (rng.next() < 0.04) tags.push("ruined");
  else tags.push(rng.pick(ALL_PLANET_TAGS));
  return tags;
}

// ── Government type ───────────────────────────────────────────────────────────

const GOVERNMENT_TYPES: GovernmentType[] = [
  "empire","republic","theocracy","oligarchy","military-junta","tribal-council","technocracy","merchant-guild"
];

export const GOVERNMENT_LABEL: Record<GovernmentType, string> = {
  "empire": "Empire", "republic": "Republic", "theocracy": "Theocracy",
  "oligarchy": "Oligarchy", "military-junta": "Military Junta",
  "tribal-council": "Tribal Council", "technocracy": "Technocracy", "merchant-guild": "Merchant Guild",
};

export const GOVERNMENT_RULER_TITLE: Record<GovernmentType, string[]> = {
  "empire": ["Emperor","Empress","Overlord","Autarch","Despot"],
  "republic": ["First Citizen","Consul","President","Chancellor","Magistrate"],
  "theocracy": ["High Priest","Oracle","Archon","Eternal Sage","Prophet-King"],
  "oligarchy": ["Grand Patriarch","Grand Matriarch","Speaker","Archon","High Council"],
  "military-junta": ["Warlord","Supreme Commander","Marshal","General","Strategos"],
  "tribal-council": ["High Chieftain","Elder Speaker","Warchief","Tribal Lord","Pathfinder"],
  "technocracy": ["Architect","Prime Engineer","Chief Artificer","Master Planner","Grand Analyst"],
  "merchant-guild": ["Grand Merchant","Trade Master","Guild Lord","Harbor Master","Coin Emperor"],
};

export function pickGovernmentType(rng: PRNG, ideology: import("../types/sim").Ideology): GovernmentType {
  switch (ideology) {
    case "militarist": return rng.pick(["empire","military-junta","empire"]);
    case "spiritualist": return rng.pick(["theocracy","empire","theocracy"]);
    case "materialist": return rng.pick(["merchant-guild","technocracy","oligarchy"]);
    case "expansionist": return rng.pick(["empire","republic","empire"]);
    case "isolationist": return rng.pick(["oligarchy","tribal-council","republic"]);
    case "pacifist": return rng.pick(["republic","merchant-guild","tribal-council"]);
    default: return rng.pick(GOVERNMENT_TYPES);
  }
}

export function makeEmpireName(rng: PRNG, capitalName: string): string {
  const roll = rng.next();
  if (roll < 0.4) return `${rng.pick(EMPIRE_ADJ)} ${rng.pick(EMPIRE_NOUN)}`;
  if (roll < 0.75) return `${rng.pick(EMPIRE_NOUN)} of ${capitalName}`;
  return `${capitalName} ${rng.pick(EMPIRE_NOUN)}`;
}

// ── Galaxy generator ──────────────────────────────────────────────────────────

// ── Shape-specific resource biasing ──────────────────────────────────────────

function applyShapeBias(sys: StarSystem, shape: GalaxyShape, cx: number, cy: number): void {
  const dx = sys.x - cx, dy = sys.y - cy;
  const r = Math.sqrt(dx * dx + dy * dy);
  switch (shape) {
    case "hollow-disc":
      // rim worlds are richer and more habitable (outer colonies)
      sys.resources = Math.min(1.5, sys.resources * 1.15);
      sys.habitability = Math.min(1, sys.habitability * 1.1);
      break;
    case "clustered":
      // cluster cores are rich, edges are frontier wastelands
      break;
    case "grid":
      // ordered grid: resources more uniform, less variance
      sys.resources = 0.3 + sys.resources * 0.7;
      sys.habitability = 0.3 + sys.habitability * 0.7;
      break;
    case "chaos":
      // chaotic: higher variance; some extremely rich, some barren
      sys.resources = Math.min(1.5, sys.resources * (r < 200 ? 1.3 : 0.85));
      break;
    case "string":
      // string nodes: high tech/resources at connection hubs
      sys.techLevel = Math.min(0.9, sys.techLevel * 1.2);
      break;
    case "barred-spiral":
      // the central bar is richer; the arms are contested frontier
      if (r < 220) sys.resources = Math.min(1.5, sys.resources * 1.25);
      break;
    case "disc":
      // wealth and tech bias toward the dense center
      if (r < 180) { sys.resources = Math.min(1.5, sys.resources * 1.2); sys.techLevel = Math.min(0.9, sys.techLevel * 1.15); }
      break;
    case "hub":
      // the core cluster is the seat of trade and dominance pressure
      if (r < 170) sys.resources = Math.min(1.5, sys.resources * 1.2);
      break;
    case "web":
      // chokepoint/filament worlds carry the galaxy's commerce
      sys.resources = Math.min(1.5, sys.resources * 1.05);
      break;
    case "irregular":
      // uneven gifts: some regions blessed, others starved
      sys.resources = Math.min(1.5, sys.resources * (sys.x < cx ? 1.2 : 0.8));
      break;
    case "continents":
      // bridge/strait worlds between landmasses become trade magnets
      sys.localWealth = (sys.localWealth ?? 0) + 5;
      break;
    default:
      break;
  }
}

// ── Empire layout modes ───────────────────────────────────────────────────────

/** Shapes with separated regions seed at least one power per angular sector so
 *  isolated civilizations develop apart and collide later. */
function pickCapitalsBySector(sorted: StarSystem[], numEmpires: number, cx: number, cy: number): StarSystem[] | null {
  const sectors = Math.max(2, Math.min(numEmpires, 8));
  const bySector: StarSystem[][] = Array.from({ length: sectors }, () => []);
  for (const s of sorted) {
    const angle = Math.atan2(s.y - cy, s.x - cx) + Math.PI;
    const idx = Math.min(sectors - 1, Math.floor((angle / (Math.PI * 2)) * sectors));
    bySector[idx].push(s);
  }
  const result: StarSystem[] = [];
  const used = new Set<Id>();
  for (let i = 0; result.length < numEmpires && i < numEmpires * sectors; i++) {
    const bucket = bySector[i % sectors];
    const candidate = bucket.find(s => !used.has(s.id));
    if (candidate) { used.add(candidate.id); result.push(candidate); }
  }
  return result.length === numEmpires ? result : null;
}

function pickEmpireCapitals(sorted: StarSystem[], numEmpires: number, layout: EmpireLayout, rng: PRNG, shape: GalaxyShape = "spiral"): StarSystem[] {
  // region-aware shapes distribute classic starts across clusters/ring/landmasses
  if (layout === "classic" || layout === "random-blobs") {
    if (shape === "clustered" || shape === "hollow-disc" || shape === "continents" || shape === "hub" || shape === "web") {
      const bySector = pickCapitalsBySector(sorted, numEmpires, 600, 450);
      if (bySector) return bySector;
    }
  }
  const used = new Set<Id>();
  const result: StarSystem[] = [];
  switch (layout) {
    case "few-big-blobs": {
      // place empires at extreme ends so they start far apart
      const thirds = [sorted.slice(0, Math.ceil(sorted.length / 3)), sorted.slice(Math.ceil(sorted.length / 3), Math.ceil(2 * sorted.length / 3)), sorted.slice(Math.ceil(2 * sorted.length / 3))];
      for (let i = 0; i < numEmpires; i++) {
        const bucket = thirds[i % thirds.length];
        for (const c of bucket) { if (!used.has(c.id)) { used.add(c.id); result.push(c); break; } }
      }
      break;
    }
    case "many-one-star": {
      // each empire starts on a single mid-quality world, closely packed
      const mid = sorted.slice(Math.floor(sorted.length * 0.2), Math.floor(sorted.length * 0.8));
      for (let i = 0; i < numEmpires && i < mid.length; i++) {
        used.add(mid[i].id); result.push(mid[i]);
      }
      break;
    }
    case "rim": {
      // empires on the farthest systems from center
      const byDist = [...sorted].sort((a, b) => {
        const da = Math.hypot(a.x - 600, a.y - 450), db = Math.hypot(b.x - 600, b.y - 450);
        return db - da;
      });
      for (const c of byDist) {
        if (result.length >= numEmpires) break;
        if (!used.has(c.id)) { used.add(c.id); result.push(c); }
      }
      break;
    }
    case "scattered": {
      // random selection from mid-to-high habitability
      const pool = sorted.slice(0, Math.floor(sorted.length * 0.7));
      for (let tries = 0; tries < pool.length && result.length < numEmpires; tries++) {
        const c = pool[rng.nextInt(0, pool.length - 1)];
        if (!used.has(c.id)) { used.add(c.id); result.push(c); }
      }
      break;
    }
    case "classic":
    case "random-blobs":
    default: {
      // classic: high hab, minimum separation
      for (const candidate of sorted) {
        if (result.length >= numEmpires) break;
        if (used.has(candidate.id)) continue;
        let tooClose = false;
        for (const placed of result) {
          if (Math.hypot(candidate.x - placed.x, candidate.y - placed.y) < 80) { tooClose = true; break; }
        }
        if (!tooClose) { used.add(candidate.id); result.push(candidate); }
      }
      break;
    }
  }
  while (result.length < numEmpires) {
    const fallback = sorted[result.length % sorted.length];
    if (!used.has(fallback.id)) { used.add(fallback.id); result.push(fallback); }
    else result.push(fallback);
  }
  return result;
}

export function generateGalaxy(
  seed: number,
  numStars: number,
  numEmpires: number,
  rng: PRNG,
  galaxyShape: GalaxyShape = "spiral",
  starlaneMode: StarlaneMode = "standard",
  empireLayout: EmpireLayout = "classic",
  gridAlignment: GridAlignment = "none"
): GalaxyState {
  resetEventCounter();
  resetModifierSeq();
  resetCharacterCounter();
  resetDynastyCounters();
  const WIDTH = 1200;
  const HEIGHT = 900;
  const systems: Record<Id, StarSystem> = {};
  const systemList: StarSystem[] = [];

  const CX = WIDTH / 2, CY = HEIGHT / 2;
  for (let i = 0; i < numStars; i++) {
    const id = `sys-${i}`;
    const [rawX, rawY] = getShapePoint(galaxyShape, rng, WIDTH, HEIGHT, i, numStars);
    const [x, y] = applyGridAlignment(rawX, rawY, gridAlignment, rng);
    const hasArtifact = rng.next() < 0.04;
    const habitability = rng.range(0.1, 1.0);
    const resources = rng.range(0.1, 1.0);
    const system: StarSystem = {
      id,
      name: makeName(rng),
      x,
      y,
      population: rng.range(0.1, 1.0),
      resources,
      habitability,
      stability: rng.range(0.5, 1.0),
      ownerEmpireId: null,
      cultureId: "none",
      religionId: null,
      artifactName: hasArtifact ? makeArtifactName(rng) : null,
      techLevel: rng.range(0.1, 0.5),
      recentEventIds: [],
      connectedSystemIds: [],
      markers: [],
      localWealth: rng.range(0, 30),
      planets: makePlanets(rng, habitability, resources, hasArtifact),
      factionId: null,
    };
    applyShapeBias(system, galaxyShape, CX, CY);
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
  const capitals = pickEmpireCapitals(sorted, numEmpires, empireLayout, rng, galaxyShape);

  const empires: Record<Id, Empire> = {};
  const people: Record<Id, Person> = {};
  const dynasties: Record<Id, Dynasty> = {};
  const colors = [...EMPIRE_COLORS];
  for (let i = colors.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    [colors[i], colors[j]] = [colors[j], colors[i]];
  }

  for (let i = 0; i < numEmpires; i++) {
    const capital = capitals[i] ?? sorted[i % sorted.length];
    const empId = `emp-${i}`;
    const cultureId = `culture-${i}`;
    capital.ownerEmpireId = empId;
    capital.cultureId = cultureId;
    capital.population = Math.max(capital.population, 0.5);

    const ideology = rng.pick(IDEOLOGIES);
    const govType = pickGovernmentType(rng, ideology);
    const titlePool = GOVERNMENT_RULER_TITLE[govType];

    const ruler = { name: makeName(rng), title: rng.pick(titlePool), dynasty: makeName(rng), ordinal: 1, accessionTick: 0, traits: makeRulerTraits(rng) };
    const empire: Empire = {
      id: empId,
      name: makeEmpireName(rng, capital.name),
      color: colors[i % colors.length],
      mood: "expanding",
      moodSince: 0,
      ideology,
      ruler,
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
      governmentType: govType,
      builtArtifactIds: [],
    };
    empires[empId] = empire;
    // Stand up the ruling house around the freshly-minted ruler shim.
    foundDynasty({ people, dynasties }, empire, 0, rng);
  }

  return {
    tick: 0, seed, systems, empires, fleets: {}, religions, tradeRoutes: {},
    monsters: {}, events: {}, eventLog: [], alliances: {}, oddities: {},
    people, dynasties, factions: {},
    playerControl: { controlledEmpireId: null, mode: "observer", authority: 100, legitimacy: 75, commandCooldowns: {} },
  };
}
