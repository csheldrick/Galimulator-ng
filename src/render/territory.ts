import type { GalaxyState, StarSystem } from "../types/sim";
import { parseColorToRgb } from "./colors";

export type MapMode = "empire" | "religion" | "wealth" | "alliance" | "heat" | "faction";

// Resolution of the territory bitmap in world units per cell. Lower is
// sharper but more expensive to rebuild.
const RES = 3;
// How far a star's influence reaches; space beyond this stays black.
const MAX_R = 42;
const MARGIN = MAX_R + 8;

// Unclaimed space inside the galaxy reads as dim slate, so the galaxy disc
// has a visible shape against the void like Galimulator's neutral zones.
const NEUTRAL_RGB: [number, number, number] = [88, 98, 112];
const FACTION_RGB: Record<string, [number, number, number]> = {
  separatist: [255, 146, 68],
  religious: [205, 145, 255],
  court: [255, 214, 102],
  regional: [112, 224, 178],
};
const CONFLICT_EVENTS = new Set([
  "war-declared", "border-conflict", "empire-collapsed", "rebellion", "monster-attack",
  "galactic-crisis", "coup", "faction-formed", "faction-uprising", "subject-rebelled",
  "meteor-strike", "succession-crisis", "pretender-revolt",
]);

export interface TerritoryBitmap {
  canvas: HTMLCanvasElement;
  originX: number;
  originY: number;
  worldW: number;
  worldH: number;
}

export function ownershipKey(snap: Readonly<GalaxyState>, mode: MapMode): string {
  const systems = Object.values(snap.systems).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (mode === "religion") {
    return `religion|${systems.map(s => `${s.id}:${s.religionId ?? ""}`).join("|")}`;
  }
  if (mode === "wealth") {
    return `wealth|${systems.map(s => {
      const v = Math.max(0, Math.min(1, (s.population / 2 + s.resources) / 2 + s.techLevel * 0.12));
      return `${s.id}:${Math.round(v * 10)}:${s.ownerEmpireId ?? ""}`;
    }).join("|")}`;
  }
  if (mode === "alliance") {
    return `alliance|${systems.map(s => {
      const owner = s.ownerEmpireId ? snap.empires[s.ownerEmpireId] : null;
      return `${s.id}:${owner?.allianceIds?.[0] ?? owner?.id ?? ""}`;
    }).join("|")}`;
  }
  if (mode === "heat") {
    return `heat|${systems.map(s => `${s.id}:${Math.round(conflictHeat(snap, s) * 8)}`).join("|")}`;
  }
  if (mode === "faction") {
    return `faction|${systems.map(s => {
      const faction = s.factionId ? snap.factions?.[s.factionId] : null;
      return `${s.id}:${faction?.id ?? ""}:${Math.round((faction?.uprisingProgress ?? 0) * 5)}`;
    }).join("|")}`;
  }
  return `empire|${systems.map(s => `${s.id}:${s.ownerEmpireId ?? ""}`).join("|")}`;
}

function wealthHeat(sys: StarSystem): [string, [number, number, number]] {
  // poor worlds cool blue, rich worlds hot gold
  const v = Math.max(0, Math.min(1, (sys.population / 2 + sys.resources) / 2 + sys.techLevel * 0.12));
  const bucket = Math.round(v * 10);
  const r = Math.round(40 + 215 * v);
  const g = Math.round(70 + 140 * v);
  const b = Math.round(160 - 120 * v);
  return [`w${bucket}`, [r, g, b]];
}

function conflictHeat(snap: Readonly<GalaxyState>, sys: StarSystem): number {
  let score = 0;
  const owner = sys.ownerEmpireId ? snap.empires[sys.ownerEmpireId] : null;
  if (owner) score += Math.min(0.35, owner.activeWarEmpireIds.length * 0.08);
  for (const nid of sys.connectedSystemIds) {
    const otherOwnerId = snap.systems[nid]?.ownerEmpireId;
    if (!owner || !otherOwnerId || otherOwnerId === owner.id) continue;
    if (owner.activeWarEmpireIds.includes(otherOwnerId)) score += 0.38;
    else score += 0.04;
  }
  for (const marker of sys.markers ?? []) {
    if (marker.kind === "battlefield") score += 0.24;
    else if (marker.kind === "rebel-hotbed") score += 0.22;
    else if (marker.kind === "monster-wound" || marker.kind === "plague-world") score += 0.18;
  }
  for (const eventId of sys.recentEventIds) {
    const ev = snap.events[eventId];
    if (!ev || !CONFLICT_EVENTS.has(ev.type)) continue;
    const age = Math.max(0, snap.tick - ev.tick);
    if (age <= 260) score += (ev.importance / 10) * (1 - age / 300);
  }
  return Math.max(0, Math.min(1, score));
}

function heatRgb(v: number): [number, number, number] {
  const r = Math.round(40 + 215 * v);
  const g = Math.round(72 + 110 * (1 - Math.abs(v - 0.45) * 1.7));
  const b = Math.round(170 - 145 * v);
  return [r, Math.max(35, Math.min(190, g)), Math.max(25, b)];
}

// Region group key + color for a system under the active map mode. Cells with
// different keys get a bright border between them.
function systemRegion(snap: Readonly<GalaxyState>, sys: StarSystem, mode: MapMode): { key: string; rgb: [number, number, number]; neutral: boolean } {
  if (mode === "religion") {
    const religion = sys.religionId ? snap.religions[sys.religionId] : null;
    if (!religion) return { key: "none", rgb: NEUTRAL_RGB, neutral: true };
    return { key: religion.id, rgb: parseColorToRgb(religion.color), neutral: false };
  }
  if (mode === "wealth") {
    const [key, rgb] = wealthHeat(sys);
    return { key, rgb, neutral: !sys.ownerEmpireId };
  }
  if (mode === "alliance") {
    const owner = sys.ownerEmpireId ? snap.empires[sys.ownerEmpireId] : null;
    if (!owner) return { key: "none", rgb: NEUTRAL_RGB, neutral: true };
    const allianceId = owner.allianceIds?.[0];
    const alliance = allianceId ? snap.alliances?.[allianceId] : null;
    if (alliance) return { key: alliance.id, rgb: parseColorToRgb(alliance.color ?? owner.color), neutral: false };
    // unallied empires read as their own dim color
    return { key: `solo-${owner.id}`, rgb: parseColorToRgb(owner.color), neutral: true };
  }
  if (mode === "heat") {
    const heat = conflictHeat(snap, sys);
    const bucket = Math.round(heat * 8);
    return { key: `heat-${bucket}`, rgb: heatRgb(bucket / 8), neutral: bucket === 0 };
  }
  if (mode === "faction") {
    const faction = sys.factionId ? snap.factions?.[sys.factionId] : null;
    if (faction) {
      const base = FACTION_RGB[faction.kind] ?? [255, 170, 80];
      const pulse = Math.max(0, Math.min(1, faction.uprisingProgress));
      return {
        key: `${faction.id}-${Math.round(pulse * 5)}`,
        rgb: [
          Math.min(255, Math.round(base[0] + (255 - base[0]) * pulse * 0.25)),
          Math.min(255, Math.round(base[1] + (255 - base[1]) * pulse * 0.18)),
          Math.min(255, Math.round(base[2] + (255 - base[2]) * pulse * 0.12)),
        ],
        neutral: false,
      };
    }
    const owner = sys.ownerEmpireId ? snap.empires[sys.ownerEmpireId] : null;
    if (!owner) return { key: "none", rgb: NEUTRAL_RGB, neutral: true };
    return { key: `quiet-${owner.id}`, rgb: parseColorToRgb(owner.color), neutral: true };
  }
  const emp = sys.ownerEmpireId ? snap.empires[sys.ownerEmpireId] : null;
  if (!emp) return { key: "none", rgb: NEUTRAL_RGB, neutral: true };
  return { key: emp.id, rgb: parseColorToRgb(emp.color), neutral: false };
}

// Nearest-star (Voronoi-style) region fill: every grid cell takes the color
// of its closest star's region, clipped to MAX_R, with brightened cells along
// region borders so empires read as solid shapes with crisp edges.
export function buildTerritoryBitmap(snap: Readonly<GalaxyState>, mode: MapMode): TerritoryBitmap | null {
  const systems = Object.values(snap.systems);
  if (systems.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of systems) {
    if (s.x < minX) minX = s.x;
    if (s.y < minY) minY = s.y;
    if (s.x > maxX) maxX = s.x;
    if (s.y > maxY) maxY = s.y;
  }
  minX -= MARGIN; minY -= MARGIN; maxX += MARGIN; maxY += MARGIN;
  const W = Math.max(1, Math.ceil((maxX - minX) / RES));
  const H = Math.max(1, Math.ceil((maxY - minY) / RES));

  // resolve each system's region once
  const regionKeyOf: string[] = [];
  const regionRgbOf: Array<[number, number, number]> = [];
  const regionNeutralOf: boolean[] = [];
  const regionIdxByKey = new Map<string, number>();
  const regionIdxOfSystem = new Int32Array(systems.length);
  systems.forEach((s, i) => {
    const region = systemRegion(snap, s, mode);
    let idx = regionIdxByKey.get(region.key);
    if (idx === undefined) {
      idx = regionKeyOf.length;
      regionIdxByKey.set(region.key, idx);
      regionKeyOf.push(region.key);
      regionRgbOf.push(region.rgb);
      regionNeutralOf.push(region.neutral);
    }
    regionIdxOfSystem[i] = idx;
  });

  const BUCKET = 64;
  const buckets = new Map<string, number[]>();
  systems.forEach((s, i) => {
    const k = `${Math.floor(s.x / BUCKET)},${Math.floor(s.y / BUCKET)}`;
    const list = buckets.get(k);
    if (list) list.push(i); else buckets.set(k, [i]);
  });

  const cellRegion = new Int32Array(W * H).fill(-1);
  const reach = Math.ceil(MAX_R / BUCKET);
  for (let gy = 0; gy < H; gy++) {
    const wy = minY + (gy + 0.5) * RES;
    const by = Math.floor(wy / BUCKET);
    for (let gx = 0; gx < W; gx++) {
      const wx = minX + (gx + 0.5) * RES;
      const bx = Math.floor(wx / BUCKET);
      let bestD = MAX_R * MAX_R;
      let bestSys = -1;
      for (let oy = -reach; oy <= reach; oy++) {
        for (let ox = -reach; ox <= reach; ox++) {
          const list = buckets.get(`${bx + ox},${by + oy}`);
          if (!list) continue;
          for (const i of list) {
            const s = systems[i];
            const dx = s.x - wx, dy = s.y - wy;
            const d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; bestSys = i; }
          }
        }
      }
      if (bestSys >= 0) cellRegion[gy * W + gx] = regionIdxOfSystem[bestSys];
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(W, H);
  const data = img.data;
  for (let gy = 0; gy < H; gy++) {
    for (let gx = 0; gx < W; gx++) {
      const i = gy * W + gx;
      const region = cellRegion[i];
      if (region < 0) continue;
      const isBorder =
        (gx > 0 && cellRegion[i - 1] !== region && cellRegion[i - 1] >= 0) ||
        (gx < W - 1 && cellRegion[i + 1] !== region && cellRegion[i + 1] >= 0) ||
        (gy > 0 && cellRegion[i - W] !== region && cellRegion[i - W] >= 0) ||
        (gy < H - 1 && cellRegion[i + W] !== region && cellRegion[i + W] >= 0);
      const isEdge =
        (gx > 0 && cellRegion[i - 1] < 0) || (gx < W - 1 && cellRegion[i + 1] < 0) ||
        (gy > 0 && cellRegion[i - W] < 0) || (gy < H - 1 && cellRegion[i + W] < 0);
      const [r, g, b] = regionRgbOf[region];
      const neutral = regionNeutralOf[region];
      const p = i * 4;
      if (isBorder && !neutral) {
        // bright, slightly whitened ridge between regions
        data[p] = Math.min(255, r + (255 - r) * 0.35);
        data[p + 1] = Math.min(255, g + (255 - g) * 0.35);
        data[p + 2] = Math.min(255, b + (255 - b) * 0.35);
        data[p + 3] = 245;
      } else {
        data[p] = r; data[p + 1] = g; data[p + 2] = b;
        data[p + 3] = neutral ? 52 : isEdge ? 110 : 158;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, originX: minX, originY: minY, worldW: W * RES, worldH: H * RES };
}
