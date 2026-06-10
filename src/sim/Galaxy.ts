import type { PRNG, StarSystem, Empire, GalaxyState, Id } from "../types/sim";

const SYLLABLES = [
  "al","ar","an","ax","az","bar","bel","cer","cor","den","dor","el","en",
  "eth","far","fen","gar","gel","har","hex","ig","il","jar","kel","lar",
  "len","lor","mal","mar","mor","nar","nel","nor","or","os","par","pel",
  "pri","qal","ren","rix","sar","sel","sol","sor","tar","tel","tir","tor",
  "ul","ur","val","var","vel","vor","wal","xar","yal","zan","zel","zor"
];

function makeName(rng: PRNG): string {
  const n = rng.nextInt(2, 3);
  let name = "";
  for (let i = 0; i < n; i++) name += rng.pick(SYLLABLES);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

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

function makeEmpireName(rng: PRNG): string {
  return `${rng.pick(EMPIRE_ADJ)} ${rng.pick(EMPIRE_NOUN)}`;
}

export function generateGalaxy(
  seed: number,
  numStars: number,
  numEmpires: number,
  rng: PRNG
): GalaxyState {
  const WIDTH = 1200;
  const HEIGHT = 900;
  const systems: Record<Id, StarSystem> = {};
  const systemList: StarSystem[] = [];

  for (let i = 0; i < numStars; i++) {
    const id = `sys-${i}`;
    const [x, y] = spiralPoint(rng, WIDTH, HEIGHT);
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
      techLevel: rng.range(0.1, 0.5),
      recentEventIds: [],
    };
    systems[id] = system;
    systemList.push(system);
  }

  // Sort by habitability descending to pick capital candidates
  const sorted = [...systemList].sort((a, b) => b.habitability - a.habitability);

  const empires: Record<Id, Empire> = {};
  const usedCapitals = new Set<Id>();
  const colors = [...EMPIRE_COLORS];
  // shuffle colors
  for (let i = colors.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    [colors[i], colors[j]] = [colors[j], colors[i]];
  }

  let colorIdx = 0;
  for (let i = 0; i < numEmpires; i++) {
    // pick a capital not too close to existing capitals
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
      name: makeEmpireName(rng),
      color: colors[colorIdx++ % colors.length],
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
      relationshipByEmpireId: {},
      activeWarEmpireIds: [],
      historicalEventIds: [],
    };
    empires[empId] = empire;
  }

  return { tick: 0, seed, systems, empires, events: {}, eventLog: [] };
}
