import { useEffect, useRef, useCallback } from "react";
import type { Id, Fleet, Monster, Oddity } from "../types/sim";
import type { Camera } from "./camera";
import { worldToScreen, screenToWorld, clampZoom } from "./camera";
import { colorWithAlpha, eventColor, UNOWNED_COLOR, SELECTION_COLOR, BACKGROUND_COLOR, STAR_COLOR } from "./colors";
import { buildTerritoryBitmap } from "./territory";
import type { TerritoryBitmap, MapMode } from "./territory";
import { MOOD_LABEL, MOOD_COLOR, IDEOLOGY_LABEL, rulerDisplayName } from "../sim/Moods";
import type { Simulation } from "../sim/Simulation";

export interface ViewOptions {
  territory: boolean;
  lanes: boolean;
  labels: boolean;
  wars: boolean;
  events: boolean;
  fleets: boolean;
  trade: boolean;
  monsters: boolean;
  mapMode: MapMode;
}

interface Props {
  simulation: Simulation;
  selectedSystemId: Id | null;
  selectedEmpireId: Id | null;
  selectedFleetId: Id | null;
  followEmpireId: Id | null;
  viewOptions: ViewOptions;
  resetCameraToken: number;
  onSelectSystem: (id: Id | null) => void;
  onSelectEmpire: (id: Id | null) => void;
  onSelectFleet: (id: Id | null) => void;
  onManualPan: () => void;
}

// Specialist role tints so science/missionary/support/etc. ships read distinctly on the map.
const ROLE_FILL: Record<string, string> = {
  science: "rgba(140,235,255,0.9)", missionary: "rgba(220,200,255,0.9)", support: "rgba(170,255,190,0.9)",
  gunstation: "rgba(255,170,120,0.95)", dropship: "rgba(255,240,150,0.9)", disruptor: "rgba(255,140,220,0.9)",
};

function fleetSize(fleet: Fleet): number {
  if (fleet.kind === "merchant" || fleet.kind === "pilgrim" || fleet.kind === "refugee") return 2.5;
  if (fleet.kind === "quest") return 3;
  const base = fleet.kind === "war" ? Math.max(3, Math.min(8, fleet.strength / 8)) : 3.5;
  if (fleet.shipClass === "armada") return base * 1.35;
  if (fleet.shipClass === "raider") return base * 0.8;
  return base;
}

const MARKER_GLYPH: Record<string, string> = {
  "ruin": "☠", "holy-site": "✦", "battlefield": "⚔", "shipyard": "⚙",
  "rebel-hotbed": "⚡", "artifact-aura": "◆", "dead-capital": "☽",
  "monster-wound": "✗", "trade-hub": "⊕", "plague-world": "☣",
  "transcendent-ruin": "✸",
};

const MARKER_COLOR: Record<string, string> = {
  "ruin": "rgba(160,120,80,0.85)", "holy-site": "rgba(255,220,100,0.9)", "battlefield": "rgba(220,80,80,0.85)",
  "shipyard": "rgba(100,180,255,0.85)", "rebel-hotbed": "rgba(255,160,30,0.9)", "artifact-aura": "rgba(255,224,130,0.9)",
  "dead-capital": "rgba(180,160,220,0.85)", "monster-wound": "rgba(180,80,200,0.85)", "trade-hub": "rgba(100,220,150,0.85)",
  "plague-world": "rgba(120,200,80,0.8)", "transcendent-ruin": "rgba(160,220,255,0.9)",
};

const MONSTER_COLOR: Record<Monster["kind"], string> = {
  leviathan: "#b14eea",
  wraith: "#9ff3ff",
  swarm: "#7ded7f",
};

const ODDITY_COLOR: Record<Oddity["kind"], string> = {
  "star-eater": "#ff5d8f",
  "puppet-mind": "#d0a2ff",
  "sloth-cloud": "#8fb8a8",
  "replicator": "#ffd166",
  "void-gate": "#74e0ff",
};

function drawOddity(ctx: CanvasRenderingContext2D, oddity: Oddity, sx: number, sy: number, zoom: number, now: number) {
  const color = ODDITY_COLOR[oddity.kind];
  const pulse = 1 + Math.sin(now / 350 + oddity.spawnedTick) * 0.2;
  const r = Math.max(5, (6 + oddity.strength / 14) * zoom) * pulse;
  ctx.save();
  ctx.translate(sx, sy);
  if (oddity.kind === "sloth-cloud") {
    // soft layered haze
    for (let k = 3; k >= 1; k--) {
      ctx.beginPath();
      ctx.arc(0, 0, r * k * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = colorWithAlpha(color, 0.07 * k);
      ctx.fill();
    }
  } else if (oddity.kind === "void-gate") {
    // a slowly rotating tear
    ctx.rotate(now / 1400);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.4, r * 0.45, 0, 0, Math.PI * 2);
    ctx.strokeStyle = colorWithAlpha(color, 0.9);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.7, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fillStyle = colorWithAlpha("#04060c", 0.95);
    ctx.fill();
  } else {
    // angular sigil: diamond with inner spin
    ctx.rotate(now / 700);
    ctx.beginPath();
    ctx.moveTo(0, -r); ctx.lineTo(r * 0.8, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.8, 0);
    ctx.closePath();
    ctx.fillStyle = colorWithAlpha(color, 0.75);
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  if (zoom > 0.8) {
    ctx.font = "italic 10px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = colorWithAlpha(color, 0.9);
    ctx.fillText(oddity.name, sx, sy + r + 14);
    ctx.textAlign = "left";
  }
}

function drawMonster(ctx: CanvasRenderingContext2D, monster: Monster, sx: number, sy: number, zoom: number, now: number) {
  const pulse = 1 + Math.sin(now / 220 + monster.x) * 0.15;
  const r = Math.max(4, (5 + monster.strength / 12) * zoom) * pulse;
  const spikes = monster.kind === "swarm" ? 10 : 7;
  const color = MONSTER_COLOR[monster.kind];
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(now / 900);
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const px = Math.cos(a) * radius, py = Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = colorWithAlpha(color, 0.85);
  ctx.strokeStyle = "rgba(0,0,0,0.8)";
  ctx.lineWidth = 1.5;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // health sliver
  const hpw = r * 2;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(sx - hpw / 2, sy - r - 6, hpw, 3);
  ctx.fillStyle = color;
  ctx.fillRect(sx - hpw / 2, sy - r - 6, hpw * Math.max(0, monster.hp / monster.maxHp), 3);
  if (zoom > 0.9) {
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = colorWithAlpha(color, 0.9);
    ctx.fillText(monster.name, sx, sy + r + 12);
    ctx.textAlign = "left";
  }
}

export function GalaxyCanvas({ simulation, selectedSystemId, selectedEmpireId, selectedFleetId, followEmpireId, viewOptions, resetCameraToken, onSelectSystem, onSelectEmpire, onSelectFleet, onManualPan }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<Camera>({ x: 600, y: 450, zoom: 0.8 });
  const rafRef = useRef<number>(0);
  const dragRef = useRef<{ dragging: boolean; moved: boolean; lastX: number; lastY: number }>({ dragging: false, moved: false, lastX: 0, lastY: 0 });
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number } | null>(null);
  const hoverRef = useRef<Id | null>(null);
  const zoomAnimRef = useRef<{ target: number; wx: number; wy: number; cx: number; cy: number } | null>(null);
  const territoryRef = useRef<{ bitmap: TerritoryBitmap | null; lastBuild: number; lastRevision: number; lastMode: MapMode }>({ bitmap: null, lastBuild: 0, lastRevision: -1, lastMode: "empire" });

  useEffect(() => { camRef.current = { x: 600, y: 450, zoom: 0.8 }; zoomAnimRef.current = null; }, [resetCameraToken]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function draw() {
      rafRef.current = requestAnimationFrame(draw);
      const ctx = canvas!.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas!.width / dpr, h = canvas!.height / dpr, cam = camRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const snap = simulation.getLiveState();
      const selectedEmpire = selectedEmpireId ? snap.empires[selectedEmpireId] : null;
      const now = performance.now();

      // smooth zoom toward wheel target, anchored at the cursor
      const anim = zoomAnimRef.current;
      if (anim) {
        cam.zoom += (anim.target - cam.zoom) * 0.25;
        if (Math.abs(anim.target - cam.zoom) < 0.001) { cam.zoom = anim.target; zoomAnimRef.current = null; }
        const [nx, ny] = worldToScreen(anim.wx, anim.wy, cam, w, h);
        cam.x += (nx - anim.cx) / cam.zoom;
        cam.y += (ny - anim.cy) / cam.zoom;
      }

      // Follow camera: glide to keep the watched empire's territory framed.
      const followEmpire = followEmpireId ? snap.empires[followEmpireId] : null;
      if (followEmpire && followEmpire.ownedSystemIds.length > 0 && !anim) {
        let cx = 0, cy = 0, n = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const id of followEmpire.ownedSystemIds) {
          const s = snap.systems[id]; if (!s) continue;
          cx += s.x; cy += s.y; n++;
          minX = Math.min(minX, s.x); minY = Math.min(minY, s.y);
          maxX = Math.max(maxX, s.x); maxY = Math.max(maxY, s.y);
        }
        if (n > 0) {
          cam.x += (cx / n - cam.x) * 0.07;
          cam.y += (cy / n - cam.y) * 0.07;
          const spanX = Math.max(60, maxX - minX), spanY = Math.max(60, maxY - minY);
          const fit = Math.min(w / (spanX * 1.5), h / (spanY * 1.5));
          const targetZoom = clampZoom(Math.max(0.6, Math.min(2.2, fit)));
          cam.zoom += (targetZoom - cam.zoom) * 0.05;
        }
      }

      ctx.fillStyle = BACKGROUND_COLOR;
      ctx.fillRect(0, 0, w, h);

      if (viewOptions.territory) {
        const cache = territoryRef.current;
        // Only re-derive ownership when the sim actually advanced or the map mode
        // changed — not every animation frame — so panning/zooming stays cheap.
        const revision = simulation.getRevision();
        if (revision !== cache.lastRevision || viewOptions.mapMode !== cache.lastMode) {
          cache.lastRevision = revision;
          cache.lastMode = viewOptions.mapMode;
          if (now - cache.lastBuild > 100) {
            cache.bitmap = buildTerritoryBitmap(snap, viewOptions.mapMode);
            cache.lastBuild = now;
          }
        }
        const bitmap = cache.bitmap;
        if (bitmap) {
          const [sx, sy] = worldToScreen(bitmap.originX, bitmap.originY, cam, w, h);
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(bitmap.canvas, sx, sy, bitmap.worldW * cam.zoom, bitmap.worldH * cam.zoom);
        }
      }

      // Mood halos — diffuse colored glow expressing each empire's current state
      if (viewOptions.territory) {
        for (const emp of Object.values(snap.empires)) {
          if (emp.ownedSystemIds.length === 0) continue;
          let cx = 0, cy = 0, n = 0;
          for (const id of emp.ownedSystemIds) {
            const s = snap.systems[id]; if (!s) continue;
            cx += s.x; cy += s.y; n++;
          }
          if (n === 0) continue;
          const [sx, sy] = worldToScreen(cx / n, cy / n, cam, w, h);
          const base = MOOD_COLOR[emp.mood];
          const haloR = Math.max(30, Math.sqrt(n) * 40 * cam.zoom);
          const alpha = emp.mood === "rioting" ? 0.09 + Math.sin(now / 300) * 0.035
            : emp.mood === "crusading" ? 0.07 + Math.sin(now / 220) * 0.025
            : emp.mood === "transcending" ? 0.10 + Math.sin(now / 160) * 0.04
            : 0.04;
          const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, haloR);
          grad.addColorStop(0, colorWithAlpha(base, alpha));
          grad.addColorStop(1, colorWithAlpha(base, 0));
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(sx, sy, haloR, 0, Math.PI * 2); ctx.fill();
        }
      }

      if (viewOptions.lanes) {
        for (const sys of Object.values(snap.systems)) {
          for (const nid of sys.connectedSystemIds) {
            if (nid < sys.id) continue; // each lane once
            const other = snap.systems[nid];
            if (!other) continue;
            const [ax, ay] = worldToScreen(sys.x, sys.y, cam, w, h);
            const [bx, by] = worldToScreen(other.x, other.y, cam, w, h);
            if ((ax < 0 && bx < 0) || (ax > w && bx > w) || (ay < 0 && by < 0) || (ay > h && by > h)) continue;
            ctx.strokeStyle = "rgba(170,190,220,0.10)";
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
          }
        }
      }

      if (viewOptions.trade) {
        for (const route of Object.values(snap.tradeRoutes)) {
          const a = snap.systems[route.systemAId], b = snap.systems[route.systemBId];
          if (!a || !b) continue;
          const [ax, ay] = worldToScreen(a.x, a.y, cam, w, h);
          const [bx, by] = worldToScreen(b.x, b.y, cam, w, h);
          ctx.beginPath(); ctx.moveTo(ax, ay);
          // gentle arc so trade reads differently from lanes and war lines
          ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 - 22 * cam.zoom, bx, by);
          ctx.strokeStyle = "rgba(255,209,102,0.4)";
          ctx.lineWidth = 1.4;
          ctx.setLineDash([6, 5]);
          ctx.lineDashOffset = -(now / 60) % 11;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.lineDashOffset = 0;
        }
      }

      if (viewOptions.wars) {
        for (const emp of Object.values(snap.empires)) for (const warId of emp.activeWarEmpireIds) {
          if (warId < emp.id) continue;
          const enemy = snap.empires[warId];
          const capA = snap.systems[emp.capitalSystemId];
          const capB = enemy ? snap.systems[enemy.capitalSystemId] : null;
          if (!enemy || !capA || !capB) continue;
          const [ax, ay] = worldToScreen(capA.x, capA.y, cam, w, h);
          const [bx, by] = worldToScreen(capB.x, capB.y, cam, w, h);
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
          ctx.strokeStyle = "rgba(255,80,80,0.38)";
          ctx.lineWidth = emp.id === selectedEmpireId || enemy.id === selectedEmpireId ? 2 : 1;
          ctx.setLineDash([4, 6]); ctx.stroke(); ctx.setLineDash([]);
        }
      }

      // stars: small bright points; the territory colors carry ownership
      for (const sys of Object.values(snap.systems)) {
        const [sx, sy] = worldToScreen(sys.x, sys.y, cam, w, h);
        if (sx < -30 || sx > w + 30 || sy < -30 || sy > h + 30) continue;
        const emp = sys.ownerEmpireId ? snap.empires[sys.ownerEmpireId] : null;
        const r = Math.max(1, (1.4 + sys.population * 1.1) * Math.min(1.6, Math.max(0.55, cam.zoom)));
        const isSelected = sys.id === selectedSystemId;
        const isHovered = sys.id === hoverRef.current;
        const isEmpireSel = Boolean(selectedEmpireId && sys.ownerEmpireId === selectedEmpireId);
        if (isSelected || isHovered || isEmpireSel) {
          ctx.beginPath(); ctx.arc(sx, sy, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = isSelected ? SELECTION_COLOR : colorWithAlpha(emp?.color ?? UNOWNED_COLOR, 0.8);
          ctx.lineWidth = isSelected ? 2 : 1.5; ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = emp ? STAR_COLOR : "rgba(220,228,244,0.6)";
        ctx.fill();
        if (emp && emp.capitalSystemId === sys.id) {
          // capitals get a crown ring in the empire color
          ctx.beginPath(); ctx.arc(sx, sy, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = colorWithAlpha(emp.color, 0.95); ctx.lineWidth = 1.8; ctx.stroke();
          ctx.beginPath(); ctx.arc(sx, sy, r + 6, 0, Math.PI * 2);
          ctx.strokeStyle = colorWithAlpha("#ffffff", 0.35); ctx.lineWidth = 0.8; ctx.stroke();
        }
        if (sys.artifactName && cam.zoom > 1.4) {
          ctx.font = "9px monospace"; ctx.fillStyle = "rgba(255,224,130,0.8)";
          ctx.fillText("◆", sx + r + 2, sy - r - 2);
        }
        // render world markers at medium zoom
        if (cam.zoom > 0.7 && sys.markers && sys.markers.length > 0) {
          ctx.font = `${Math.max(7, 9 * cam.zoom)}px monospace`;
          ctx.textBaseline = "middle";
          const visibleMarkers = sys.markers.slice(0, 3);
          for (let mi = 0; mi < visibleMarkers.length; mi++) {
            const marker = visibleMarkers[mi];
            ctx.fillStyle = MARKER_COLOR[marker.kind] ?? "rgba(200,200,200,0.8)";
            ctx.fillText(MARKER_GLYPH[marker.kind] ?? "•", sx - r - 10 - mi * 10, sy);
          }
          ctx.textBaseline = "alphabetic";
        }
      }

      if (viewOptions.fleets) {
        for (const fleet of Object.values(snap.fleets)) {
          const owner = snap.empires[fleet.ownerEmpireId];
          const target = snap.systems[fleet.targetSystemId];
          if (!owner || !target) continue;
          const [sx, sy] = worldToScreen(fleet.x, fleet.y, cam, w, h);
          const selected = fleet.id === selectedFleetId || fleet.ownerEmpireId === selectedEmpireId;

          // remaining route along the starlanes
          ctx.beginPath(); ctx.moveTo(sx, sy);
          for (let i = fleet.legIndex + 1; i < fleet.path.length; i++) {
            const node = snap.systems[fleet.path[i]];
            if (!node) continue;
            const [nx, ny] = worldToScreen(node.x, node.y, cam, w, h);
            ctx.lineTo(nx, ny);
          }
          ctx.strokeStyle = colorWithAlpha(owner.color, selected ? 0.34 : 0.16);
          ctx.lineWidth = selected ? 1.4 : 0.8; ctx.setLineDash([2, 7]); ctx.stroke(); ctx.setLineDash([]);

          const nextNode = snap.systems[fleet.path[Math.min(fleet.legIndex + 1, fleet.path.length - 1)]] ?? target;
          const [tx, ty] = worldToScreen(nextNode.x, nextNode.y, cam, w, h);
          const size = fleetSize(fleet) * cam.zoom;
          ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.atan2(ty - sy, tx - sx));
          ctx.beginPath(); ctx.moveTo(size + 2, 0); ctx.lineTo(-size, -size * 0.65); ctx.lineTo(-size * 0.45, 0); ctx.lineTo(-size, size * 0.65); ctx.closePath();
          const fleetFill = (fleet.role && ROLE_FILL[fleet.role])
            ? ROLE_FILL[fleet.role]
            : fleet.kind === "war" ? "rgba(255,220,220,0.92)"
            : fleet.kind === "merchant" ? "rgba(255,209,102,0.88)"
            : fleet.kind === "pilgrim" ? "rgba(200,240,200,0.88)"
            : fleet.kind === "refugee" ? "rgba(200,200,255,0.82)"
            : fleet.kind === "quest" ? "rgba(180,220,255,0.9)"
            : fleet.kind === "flagship" ? "rgba(255,215,80,0.95)"
            : fleet.kind === "patrol" ? "rgba(170,210,255,0.85)"
            : "rgba(220,245,255,0.9)";
          ctx.fillStyle = fleetFill;
          ctx.strokeStyle = fleet.id === selectedFleetId ? SELECTION_COLOR : owner.color;
          ctx.lineWidth = fleet.id === selectedFleetId ? 2.5 : selected ? 1.5 : 1;
          ctx.fill(); ctx.stroke(); ctx.restore();
          if (fleet.kind === "flagship") {
            // royal ring so the ruler's ship reads as unique on the map
            ctx.beginPath(); ctx.arc(sx, sy, size + 5, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(255,215,80,0.7)"; ctx.lineWidth = 1.5; ctx.stroke();
          }
          if (fleet.role === "gunstation") {
            // bastion ring so stationed defenses read as fixtures rather than traffic
            ctx.beginPath(); ctx.arc(sx, sy, size + 4, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(255,170,120,0.65)"; ctx.lineWidth = 1.2; ctx.stroke();
          }

          if (fleet.id === selectedFleetId) {
            ctx.font = "11px monospace";
            const label = `${fleet.name} (${fleet.shipClass})`;
            const tw = ctx.measureText(label).width;
            ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.fillRect(sx + 8, sy - 22, tw + 8, 18);
            ctx.fillStyle = SELECTION_COLOR; ctx.fillText(label, sx + 12, sy - 8);
          }
        }
      }

      if (viewOptions.monsters) {
        for (const monster of Object.values(snap.monsters)) {
          const [sx, sy] = worldToScreen(monster.x, monster.y, cam, w, h);
          if (sx < -60 || sx > w + 60 || sy < -60 || sy > h + 60) continue;
          drawMonster(ctx, monster, sx, sy, cam.zoom, now);
        }
        for (const oddity of Object.values(snap.oddities ?? {})) {
          const [sx, sy] = worldToScreen(oddity.x, oddity.y, cam, w, h);
          if (sx < -80 || sx > w + 80 || sy < -80 || sy > h + 80) continue;
          drawOddity(ctx, oddity, sx, sy, cam.zoom, now);
        }
      }

      if (viewOptions.events) {
        // Galaxy-defining events (importance >= 4) linger longer and read loudly.
        const recent = snap.eventLog.slice(-50).map(id => snap.events[id]).filter(Boolean)
          .filter(ev => ev.relatedSystemIds.length > 0 && snap.tick - ev.tick < (ev.importance >= 4 ? 90 : 40));
        for (const ev of recent) {
          const defining = ev.importance >= 4;
          const life = defining ? 90 : 40;
          const age = Math.max(0, snap.tick - ev.tick), alpha = Math.max(0, 1 - age / life);
          const baseColor = eventColor(ev.type);
          for (const systemId of ev.relatedSystemIds.slice(0, 5)) {
            const sys = snap.systems[systemId]; if (!sys) continue;
            const [sx, sy] = worldToScreen(sys.x, sys.y, cam, w, h);
            if (defining) {
              // expanding multi-ring shockwave, brighter and bolder
              for (let k = 0; k < 3; k++) {
                const ringAge = age - k * 6;
                if (ringAge < 0) continue;
                const ringAlpha = Math.max(0, (1 - ringAge / life)) * 0.8;
                ctx.beginPath();
                ctx.arc(sx, sy, (12 + ev.importance * 6 + ringAge * 0.9) * cam.zoom, 0, Math.PI * 2);
                ctx.strokeStyle = baseColor.replace(/0\.\d+\)/, `${ringAlpha})`);
                ctx.lineWidth = Math.max(1.5, ev.importance * 0.7);
                ctx.stroke();
              }
            } else {
              ctx.beginPath();
              ctx.arc(sx, sy, (10 + ev.importance * 4 + age * 0.35) * cam.zoom, 0, Math.PI * 2);
              ctx.strokeStyle = baseColor.replace(/0\.\d+\)/, `${0.65 * alpha})`);
              ctx.lineWidth = Math.max(1, ev.importance * 0.35);
              ctx.stroke();
            }
          }
          // defining events float their headline on the map for a few seconds
          if (defining && age < 55) {
            const anchor = snap.systems[ev.relatedSystemIds[0]];
            if (anchor) {
              const [sx, sy] = worldToScreen(anchor.x, anchor.y, cam, w, h);
              ctx.font = "700 12px 'Trebuchet MS', sans-serif";
              ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
              const labelY = sy - (18 + ev.importance * 6) * cam.zoom - 6;
              ctx.strokeStyle = `rgba(0,0,0,${0.85 * alpha})`; ctx.lineWidth = 3; ctx.lineJoin = "round";
              ctx.strokeText(ev.title, sx, labelY);
              ctx.fillStyle = baseColor.replace(/0\.\d+\)/, `${Math.min(1, alpha + 0.2)})`);
              ctx.fillText(ev.title, sx, labelY);
              ctx.textAlign = "left";
            }
          }
        }
      }

      if (viewOptions.labels) {
        // big empire names across their territory, scaled by empire size
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        for (const emp of Object.values(snap.empires)) {
          const count = emp.ownedSystemIds.length;
          if (count === 0) continue;
          let cx = 0, cy = 0, n = 0;
          for (const id of emp.ownedSystemIds) {
            const sys = snap.systems[id]; if (!sys) continue;
            cx += sys.x; cy += sys.y; n++;
          }
          if (n === 0) continue;
          const [sx, sy] = worldToScreen(cx / n, cy / n, cam, w, h);
          if (sx < -300 || sx > w + 300 || sy < -100 || sy > h + 100) continue;
          const fontSize = Math.min(58, (8 + Math.sqrt(count) * 5.5) * cam.zoom);
          if (fontSize < 6.5) continue;
          ctx.font = `700 ${fontSize}px "Trebuchet MS", sans-serif`;
          ctx.strokeStyle = "rgba(0,0,0,0.78)";
          ctx.lineWidth = Math.max(2.5, fontSize / 8);
          ctx.lineJoin = "round";
          ctx.strokeText(emp.name, sx, sy);
          ctx.fillStyle = emp.id === selectedEmpireId ? "#ffffff" : "rgba(255,255,255,0.92)";
          ctx.fillText(emp.name, sx, sy);
        }
        if (viewOptions.mapMode === "religion") {
          // faith names over their holy worlds
          for (const religion of Object.values(snap.religions)) {
            const holy = snap.systems[religion.holySystemId];
            if (!holy) continue;
            const [sx, sy] = worldToScreen(holy.x, holy.y, cam, w, h);
            if (sx < -200 || sx > w + 200 || sy < -60 || sy > h + 60) continue;
            const fontSize = Math.max(8, 13 * cam.zoom);
            ctx.font = `600 italic ${fontSize}px "Trebuchet MS", sans-serif`;
            ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.lineWidth = 3; ctx.lineJoin = "round";
            ctx.strokeText(religion.name, sx, sy - 14 * cam.zoom);
            ctx.fillStyle = religion.color;
            ctx.fillText(religion.name, sx, sy - 14 * cam.zoom);
          }
        }
        ctx.textAlign = "left";
        if (selectedEmpire) {
          ctx.font = "11px monospace";
          ctx.fillStyle = "rgba(220,235,255,0.7)";
          for (const id of selectedEmpire.ownedSystemIds) {
            const sys = snap.systems[id]; if (!sys) continue;
            const [sx, sy] = worldToScreen(sys.x, sys.y, cam, w, h);
            if (sx < -80 || sx > w + 80 || sy < -20 || sy > h + 20) continue;
            ctx.fillText(sys.name, sx + 7, sy + 10);
          }
        }
      }

      if (hoverRef.current) {
        const sys = snap.systems[hoverRef.current];
        if (sys) {
          const [sx, sy] = worldToScreen(sys.x, sys.y, cam, w, h);
          const emp = sys.ownerEmpireId ? snap.empires[sys.ownerEmpireId] : null;
          const religion = sys.religionId ? snap.religions[sys.religionId] : null;
          const lines = [
            `${sys.name}${emp && emp.capitalSystemId === sys.id ? " ★" : ""}${sys.artifactName ? " ◆" : ""}`,
            emp ? emp.name : "Unowned",
            ...(emp ? [`${rulerDisplayName(emp)} · ${MOOD_LABEL[emp.mood]} · ${IDEOLOGY_LABEL[emp.ideology]}`] : []),
            ...(religion ? [religion.name] : []),
            `pop ${Math.round(sys.population * 1000)} · stab ${sys.stability.toFixed(2)}`,
            `hab ${sys.habitability.toFixed(2)} · res ${sys.resources.toFixed(2)} · tech ${sys.techLevel.toFixed(2)}`,
          ];
          ctx.font = "12px monospace";
          ctx.textBaseline = "alphabetic";
          const tw = Math.max(...lines.map(l => ctx.measureText(l).width));
          const lh = 16, pad = 6;
          const bx = Math.min(sx + 10, w - tw - pad * 2 - 4);
          const by = Math.max(sy - lines.length * lh - pad * 2 - 6, 4);
          ctx.fillStyle = "rgba(4,8,16,0.85)";
          ctx.fillRect(bx, by, tw + pad * 2, lines.length * lh + pad * 2);
          ctx.strokeStyle = colorWithAlpha(emp?.color ?? UNOWNED_COLOR, 0.6);
          ctx.lineWidth = 1;
          ctx.strokeRect(bx, by, tw + pad * 2, lines.length * lh + pad * 2);
          lines.forEach((l, i) => {
            ctx.fillStyle = i === 0 ? "#fff" : i === 1 ? (emp?.color ?? "#9aa") : "#bcd";
            ctx.fillText(l, bx + pad, by + pad + 12 + i * lh);
          });
        }
      }

      // stardate, Galimulator style
      ctx.font = "700 17px 'Trebuchet MS', sans-serif";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "rgba(235,242,255,0.92)";
      ctx.fillText(`St. Y ${(25000 + snap.tick).toLocaleString("en-US")}`, 12, 24);
      ctx.font = "11px monospace";
      ctx.fillStyle = "rgba(200,216,232,0.45)";
      const modeLabel = viewOptions.mapMode !== "empire" ? ` · ${viewOptions.mapMode} view` : "";
      ctx.fillText(`drag pan · wheel/pinch zoom · click inspect${modeLabel}`, 12, h - 12);
    }
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [simulation, selectedSystemId, selectedEmpireId, selectedFleetId, followEmpireId, viewOptions, resetCameraToken]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas); resize();
    return () => ro.disconnect();
  }, []);

  const findFleetAt = useCallback((cx: number, cy: number): Id | null => {
    const canvas = canvasRef.current; if (!canvas) return null;
    const snap = simulation.getLiveState(); const cam = camRef.current; const w = canvas.offsetWidth, h = canvas.offsetHeight;
    let best: Id | null = null; let bestD = 14;
    for (const fleet of Object.values(snap.fleets)) {
      const [sx, sy] = worldToScreen(fleet.x, fleet.y, cam, w, h);
      const d = Math.sqrt((sx - cx) ** 2 + (sy - cy) ** 2);
      if (d < bestD) { bestD = d; best = fleet.id; }
    }
    return best;
  }, [simulation]);

  const findSystemAt = useCallback((cx: number, cy: number): Id | null => {
    const canvas = canvasRef.current; if (!canvas) return null;
    const snap = simulation.getLiveState(); const cam = camRef.current; const w = canvas.offsetWidth, h = canvas.offsetHeight;
    let best: Id | null = null; let bestD = 16;
    for (const sys of Object.values(snap.systems)) {
      const [sx, sy] = worldToScreen(sys.x, sys.y, cam, w, h);
      const d = Math.sqrt((sx - cx) ** 2 + (sy - cy) ** 2);
      if (d < bestD) { bestD = d; best = sys.id; }
    }
    return best;
  }, [simulation]);

  const zoomAt = useCallback((cx: number, cy: number, newZoom: number) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const cam = camRef.current;
    const w = canvas.offsetWidth, h = canvas.offsetHeight;
    const [wx, wy] = screenToWorld(cx, cy, cam, w, h);
    cam.zoom = clampZoom(newZoom);
    cam.x = wx - (cx - w / 2) / cam.zoom;
    cam.y = wy - (cy - h / 2) / cam.zoom;
  }, []);

  const localPos = (e: React.PointerEvent): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current; if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const [cx, cy] = localPos(e);
    pointersRef.current.set(e.pointerId, { x: cx, y: cy });
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
      dragRef.current.dragging = false;
    } else if (pointersRef.current.size === 1) {
      dragRef.current = { dragging: true, moved: false, lastX: e.clientX, lastY: e.clientY };
    }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const [cx, cy] = localPos(e);
    const tracked = pointersRef.current.get(e.pointerId);
    if (tracked) { tracked.x = cx; tracked.y = cy; }

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
      if (pinchRef.current.dist > 0) {
        zoomAnimRef.current = null;
        zoomAt(midX, midY, camRef.current.zoom * (dist / pinchRef.current.dist));
        onManualPan();
      }
      pinchRef.current.dist = dist;
      dragRef.current.moved = true;
      return;
    }

    if (dragRef.current.dragging && tracked) {
      const dx = e.clientX - dragRef.current.lastX, dy = e.clientY - dragRef.current.lastY;
      if (Math.abs(dx) + Math.abs(dy) > 1) { dragRef.current.moved = true; onManualPan(); }
      camRef.current.x -= dx / camRef.current.zoom; camRef.current.y -= dy / camRef.current.zoom;
      dragRef.current.lastX = e.clientX; dragRef.current.lastY = e.clientY;
    } else if (e.pointerType === "mouse") {
      hoverRef.current = findSystemAt(cx, cy);
    }
  }, [findSystemAt, zoomAt, onManualPan]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current; if (!canvas) return;
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    const wasTap = dragRef.current.dragging && !dragRef.current.moved && pointersRef.current.size === 0;
    if (pointersRef.current.size === 0) { dragRef.current.dragging = false; }
    if (!wasTap) { dragRef.current.moved = false; return; }
    dragRef.current.moved = false;
    const [cx, cy] = localPos(e);
    const fleetId = viewOptions.fleets ? findFleetAt(cx, cy) : null;
    if (fleetId) {
      const snap = simulation.getLiveState(); const fleet = snap.fleets[fleetId];
      onSelectFleet(fleetId); onSelectSystem(null); onSelectEmpire(fleet?.ownerEmpireId ?? null); return;
    }
    const sysId = findSystemAt(cx, cy);
    if (sysId) {
      onSelectFleet(null); onSelectSystem(sysId);
      const snap = simulation.getLiveState(); const sys = snap.systems[sysId];
      if (sys?.ownerEmpireId) onSelectEmpire(sys.ownerEmpireId); else onSelectEmpire(null);
    } else { onSelectFleet(null); onSelectSystem(null); onSelectEmpire(null); }
  }, [simulation, viewOptions.fleets, findFleetAt, findSystemAt, onSelectSystem, onSelectEmpire, onSelectFleet]);

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) { dragRef.current.dragging = false; dragRef.current.moved = false; }
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault(); onManualPan(); const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect(); const cx = e.clientX - rect.left; const cy = e.clientY - rect.top; const cam = camRef.current;
    const [wx, wy] = screenToWorld(cx, cy, cam, canvas.offsetWidth, canvas.offsetHeight);
    const factor = e.deltaY > 0 ? 0.85 : 1.18;
    const current = zoomAnimRef.current?.target ?? cam.zoom;
    zoomAnimRef.current = { target: clampZoom(current * factor), wx, wy, cx, cy };
  }, [onManualPan]);

  return <canvas
    ref={canvasRef}
    style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair", touchAction: "none" }}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onPointerCancel={onPointerCancel}
    onPointerLeave={e => { onPointerCancel(e); hoverRef.current = null; }}
    onWheel={onWheel}
  />;
}
