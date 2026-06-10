import type { GalaxyState, Id } from "../types/sim";
import { parseColorToRgb } from "./colors";

// Resolution of the territory bitmap in world units per cell. Lower is
// sharper but more expensive to rebuild.
const RES = 3;
// How far a star's influence reaches; space beyond this stays black.
const MAX_R = 42;
const MARGIN = MAX_R + 8;

export interface TerritoryBitmap {
  canvas: HTMLCanvasElement;
  originX: number;
  originY: number;
  worldW: number;
  worldH: number;
}

// Cheap signature of who owns what; the bitmap only rebuilds when it changes.
export function ownershipKey(snap: Readonly<GalaxyState>): string {
  let key = "";
  for (const sys of Object.values(snap.systems)) key += (sys.ownerEmpireId ?? ".") + "|";
  return key;
}

// Nearest-star (Voronoi-style) region fill: every grid cell takes the color
// of its closest star's owner, clipped to MAX_R, with brightened cells along
// ownership borders so empires read as solid shapes with crisp edges.
export function buildTerritoryBitmap(snap: Readonly<GalaxyState>): TerritoryBitmap | null {
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

  const empireIds = Object.keys(snap.empires);
  const empIndexById: Record<Id, number> = {};
  const empRgb: Array<[number, number, number]> = [];
  empireIds.forEach((id, i) => {
    empIndexById[id] = i;
    empRgb.push(parseColorToRgb(snap.empires[id].color));
  });

  const BUCKET = 64;
  const buckets = new Map<string, typeof systems>();
  for (const s of systems) {
    const k = `${Math.floor(s.x / BUCKET)},${Math.floor(s.y / BUCKET)}`;
    const list = buckets.get(k);
    if (list) list.push(s); else buckets.set(k, [s]);
  }

  const ownerIdx = new Int32Array(W * H).fill(-1);
  const reach = Math.ceil(MAX_R / BUCKET);
  for (let gy = 0; gy < H; gy++) {
    const wy = minY + (gy + 0.5) * RES;
    const by = Math.floor(wy / BUCKET);
    for (let gx = 0; gx < W; gx++) {
      const wx = minX + (gx + 0.5) * RES;
      const bx = Math.floor(wx / BUCKET);
      let bestD = MAX_R * MAX_R;
      let bestOwner: Id | null = null;
      let found = false;
      for (let oy = -reach; oy <= reach; oy++) {
        for (let ox = -reach; ox <= reach; ox++) {
          const list = buckets.get(`${bx + ox},${by + oy}`);
          if (!list) continue;
          for (const s of list) {
            const dx = s.x - wx, dy = s.y - wy;
            const d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; bestOwner = s.ownerEmpireId; found = true; }
          }
        }
      }
      if (found && bestOwner !== null) {
        const idx = empIndexById[bestOwner];
        if (idx !== undefined) ownerIdx[gy * W + gx] = idx;
      }
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
      const owner = ownerIdx[i];
      if (owner < 0) continue;
      const isBorder =
        (gx > 0 && ownerIdx[i - 1] !== owner) ||
        (gx < W - 1 && ownerIdx[i + 1] !== owner) ||
        (gy > 0 && ownerIdx[i - W] !== owner) ||
        (gy < H - 1 && ownerIdx[i + W] !== owner);
      const [r, g, b] = empRgb[owner];
      const p = i * 4;
      data[p] = r; data[p + 1] = g; data[p + 2] = b;
      data[p + 3] = isBorder ? 215 : 92;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, originX: minX, originY: minY, worldW: W * RES, worldH: H * RES };
}
