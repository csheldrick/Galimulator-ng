import { useEffect, useRef, useCallback } from "react";
import type { Id, SimEvent, Fleet } from "../types/sim";
import type { Camera } from "./camera";
import { worldToScreen, screenToWorld, clampZoom } from "./camera";
import { colorWithAlpha, UNOWNED_COLOR, SELECTION_COLOR, BACKGROUND_COLOR } from "./colors";
import type { Simulation } from "../sim/Simulation";

export interface ViewOptions {
  territory: boolean;
  borders: boolean;
  labels: boolean;
  wars: boolean;
  events: boolean;
  fleets: boolean;
}

interface Props {
  simulation: Simulation;
  selectedSystemId: Id | null;
  selectedEmpireId: Id | null;
  selectedFleetId: Id | null;
  viewOptions: ViewOptions;
  resetCameraToken: number;
  onSelectSystem: (id: Id | null) => void;
  onSelectEmpire: (id: Id | null) => void;
  onSelectFleet: (id: Id | null) => void;
}

function eventColor(event: SimEvent): string {
  switch (event.type) {
    case "war-declared":
    case "border-conflict":
    case "empire-collapsed": return "rgba(255,90,90,0.75)";
    case "rebellion": return "rgba(255,210,90,0.75)";
    case "golden-age":
    case "technology-breakthrough": return "rgba(120,220,255,0.75)";
    default: return "rgba(255,255,255,0.45)";
  }
}

function fleetSize(fleet: Fleet): number { return fleet.kind === "war" ? Math.max(3, Math.min(8, fleet.strength / 8)) : 3.5; }

export function GalaxyCanvas({ simulation, selectedSystemId, selectedEmpireId, selectedFleetId, viewOptions, resetCameraToken, onSelectSystem, onSelectEmpire, onSelectFleet }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<Camera>({ x: 600, y: 450, zoom: 0.8 });
  const rafRef = useRef<number>(0);
  const dragRef = useRef<{ dragging: boolean; moved: boolean; lastX: number; lastY: number }>({ dragging: false, moved: false, lastX: 0, lastY: 0 });
  const hoverRef = useRef<Id | null>(null);
  const zoomAnimRef = useRef<{ target: number; wx: number; wy: number; cx: number; cy: number } | null>(null);
  const borderCacheRef = useRef<{ key: string; pairs: Array<[Id, Id, boolean]> }>({ key: "", pairs: [] });

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
      const snap = simulation.getSnapshot();
      const selectedEmpire = selectedEmpireId ? snap.empires[selectedEmpireId] : null;

      // smooth zoom toward wheel target, anchored at the cursor
      const anim = zoomAnimRef.current;
      if (anim) {
        cam.zoom += (anim.target - cam.zoom) * 0.25;
        if (Math.abs(anim.target - cam.zoom) < 0.001) { cam.zoom = anim.target; zoomAnimRef.current = null; }
        const [nx, ny] = worldToScreen(anim.wx, anim.wy, cam, w, h);
        cam.x += (nx - anim.cx) / cam.zoom;
        cam.y += (ny - anim.cy) / cam.zoom;
      }

      ctx.fillStyle = BACKGROUND_COLOR;
      ctx.fillRect(0, 0, w, h);

      if (viewOptions.territory) {
        for (const sys of Object.values(snap.systems)) {
          if (!sys.ownerEmpireId) continue;
          const emp = snap.empires[sys.ownerEmpireId];
          if (!emp) continue;
          const [sx, sy] = worldToScreen(sys.x, sys.y, cam, w, h);
          const r = (30 + sys.population * 24) * cam.zoom;
          const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
          grad.addColorStop(0, colorWithAlpha(emp.color, emp.id === selectedEmpireId ? 0.34 : 0.2));
          grad.addColorStop(1, colorWithAlpha(emp.color, 0));
          ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();
        }
      }

      if (viewOptions.borders) {
        const cacheKey = `${snap.seed}:${snap.tick}`;
        if (borderCacheRef.current.key !== cacheKey) {
          const BORDER_DIST = 75;
          const owned = Object.values(snap.systems).filter(s => s.ownerEmpireId);
          const pairs: Array<[Id, Id, boolean]> = [];
          for (let i = 0; i < owned.length; i++) {
            const a = owned[i];
            for (let j = i + 1; j < owned.length; j++) {
              const b = owned[j];
              if (a.ownerEmpireId === b.ownerEmpireId) continue;
              const dx = a.x - b.x, dy = a.y - b.y;
              if (dx * dx + dy * dy > BORDER_DIST * BORDER_DIST) continue;
              const atWar = snap.empires[a.ownerEmpireId!]?.activeWarEmpireIds.includes(b.ownerEmpireId!) ?? false;
              pairs.push([a.id, b.id, atWar]);
            }
          }
          borderCacheRef.current = { key: cacheKey, pairs };
        }
        for (const [aId, bId, atWar] of borderCacheRef.current.pairs) {
          const a = snap.systems[aId], b = snap.systems[bId];
          if (!a || !b) continue;
          const [ax, ay] = worldToScreen(a.x, a.y, cam, w, h);
          const [bx, by] = worldToScreen(b.x, b.y, cam, w, h);
          if ((ax < 0 && bx < 0) || (ax > w && bx > w) || (ay < 0 && by < 0) || (ay > h && by > h)) continue;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
          if (atWar) {
            ctx.strokeStyle = "rgba(255,70,70,0.7)"; ctx.lineWidth = 1.8;
          } else {
            const colA = snap.empires[a.ownerEmpireId!]?.color ?? UNOWNED_COLOR;
            const colB = snap.empires[b.ownerEmpireId!]?.color ?? UNOWNED_COLOR;
            const grad = ctx.createLinearGradient(ax, ay, bx, by);
            grad.addColorStop(0, colorWithAlpha(colA, 0.3));
            grad.addColorStop(1, colorWithAlpha(colB, 0.3));
            ctx.strokeStyle = grad; ctx.lineWidth = 1;
          }
          ctx.stroke();
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

      for (const sys of Object.values(snap.systems)) {
        const [sx, sy] = worldToScreen(sys.x, sys.y, cam, w, h);
        if (sx < -30 || sx > w + 30 || sy < -30 || sy > h + 30) continue;
        const r = Math.max(2, (2.5 + sys.population * 3) * cam.zoom);
        const emp = sys.ownerEmpireId ? snap.empires[sys.ownerEmpireId] : null;
        const color = emp ? emp.color : UNOWNED_COLOR;
        const isSelected = sys.id === selectedSystemId;
        const isHovered = sys.id === hoverRef.current;
        const isEmpireSel = Boolean(selectedEmpireId && sys.ownerEmpireId === selectedEmpireId);
        if (isSelected || isHovered || isEmpireSel) {
          ctx.beginPath(); ctx.arc(sx, sy, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = isSelected ? SELECTION_COLOR : colorWithAlpha(color, 0.75);
          ctx.lineWidth = isSelected ? 2 : 1.5; ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
        if (emp && emp.capitalSystemId === sys.id) {
          ctx.beginPath(); ctx.arc(sx, sy, r + 4, 0, Math.PI * 2); ctx.strokeStyle = colorWithAlpha(emp.color, 0.95); ctx.lineWidth = 1.5; ctx.stroke();
        }
      }

      if (viewOptions.fleets) {
        for (const fleet of Object.values(snap.fleets)) {
          const owner = snap.empires[fleet.ownerEmpireId];
          const target = snap.systems[fleet.targetSystemId];
          const origin = snap.systems[fleet.originSystemId];
          if (!owner || !target || !origin) continue;
          const [sx, sy] = worldToScreen(fleet.x, fleet.y, cam, w, h);
          const [tx, ty] = worldToScreen(target.x, target.y, cam, w, h);
          const [ox, oy] = worldToScreen(origin.x, origin.y, cam, w, h);
          const selected = fleet.id === selectedFleetId || fleet.ownerEmpireId === selectedEmpireId;
          ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(tx, ty);
          ctx.strokeStyle = colorWithAlpha(owner.color, selected ? 0.34 : 0.16);
          ctx.lineWidth = selected ? 1.4 : 0.8; ctx.setLineDash([2, 7]); ctx.stroke(); ctx.setLineDash([]);

          const size = fleetSize(fleet) * cam.zoom;
          ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.atan2(ty - sy, tx - sx));
          ctx.beginPath(); ctx.moveTo(size + 2, 0); ctx.lineTo(-size, -size * 0.65); ctx.lineTo(-size * 0.45, 0); ctx.lineTo(-size, size * 0.65); ctx.closePath();
          ctx.fillStyle = fleet.kind === "war" ? "rgba(255,220,220,0.92)" : "rgba(220,245,255,0.9)";
          ctx.strokeStyle = fleet.id === selectedFleetId ? SELECTION_COLOR : owner.color;
          ctx.lineWidth = fleet.id === selectedFleetId ? 2.5 : selected ? 1.5 : 1;
          ctx.fill(); ctx.stroke(); ctx.restore();

          if (fleet.id === selectedFleetId) {
            ctx.font = "11px monospace";
            const label = fleet.name;
            const tw = ctx.measureText(label).width;
            ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.fillRect(sx + 8, sy - 22, tw + 8, 18);
            ctx.fillStyle = SELECTION_COLOR; ctx.fillText(label, sx + 12, sy - 8);
          }
        }
      }

      if (viewOptions.events) {
        const recent = snap.eventLog.slice(-35).map(id => snap.events[id]).filter(Boolean).filter(ev => snap.tick - ev.tick < 40 && ev.relatedSystemIds.length > 0);
        for (const ev of recent) {
          const age = Math.max(0, snap.tick - ev.tick), alpha = Math.max(0, 1 - age / 40);
          for (const systemId of ev.relatedSystemIds.slice(0, 5)) {
            const sys = snap.systems[systemId]; if (!sys) continue;
            const [sx, sy] = worldToScreen(sys.x, sys.y, cam, w, h);
            ctx.beginPath(); ctx.arc(sx, sy, (10 + ev.importance * 4 + age * 0.35) * cam.zoom, 0, Math.PI * 2);
            ctx.strokeStyle = eventColor(ev).replace(/0\.\d+\)/, `${0.65 * alpha})`); ctx.lineWidth = Math.max(1, ev.importance * 0.35); ctx.stroke();
          }
        }
      }

      if (viewOptions.labels) {
        ctx.font = "11px monospace"; ctx.textBaseline = "middle";
        for (const emp of Object.values(snap.empires)) {
          const cap = snap.systems[emp.capitalSystemId]; if (!cap) continue;
          const [sx, sy] = worldToScreen(cap.x, cap.y, cam, w, h);
          if (sx < -80 || sx > w + 80 || sy < -20 || sy > h + 20) continue;
          const label = emp.name, tw = ctx.measureText(label).width;
          ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(sx + 8, sy - 8, tw + 6, 16); ctx.fillStyle = emp.color; ctx.fillText(label, sx + 11, sy);
        }
        if (selectedEmpire) {
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
          const lines = [
            `${sys.name}${emp && emp.capitalSystemId === sys.id ? " ★" : ""}`,
            emp ? emp.name : "Unowned",
            `pop ${Math.round(sys.population * 1000)} · stab ${sys.stability.toFixed(2)}`,
            `hab ${sys.habitability.toFixed(2)} · res ${sys.resources.toFixed(2)} · tech ${sys.techLevel.toFixed(2)}`,
          ];
          ctx.font = "12px monospace";
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
      ctx.font = "11px monospace"; ctx.fillStyle = "rgba(200,216,232,0.55)"; ctx.fillText(`drag pan · wheel zoom · click inspect`, 10, h - 12);
    }
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [simulation, selectedSystemId, selectedEmpireId, selectedFleetId, viewOptions, resetCameraToken]);

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
    const snap = simulation.getSnapshot(); const cam = camRef.current; const w = canvas.offsetWidth, h = canvas.offsetHeight;
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
    const snap = simulation.getSnapshot(); const cam = camRef.current; const w = canvas.offsetWidth, h = canvas.offsetHeight;
    let best: Id | null = null; let bestD = 16;
    for (const sys of Object.values(snap.systems)) {
      const [sx, sy] = worldToScreen(sys.x, sys.y, cam, w, h);
      const d = Math.sqrt((sx - cx) ** 2 + (sy - cy) ** 2);
      if (d < bestD) { bestD = d; best = sys.id; }
    }
    return best;
  }, [simulation]);

  const onMouseDown = useCallback((e: React.MouseEvent) => { dragRef.current = { dragging: true, moved: false, lastX: e.clientX, lastY: e.clientY }; }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect(); const cx = e.clientX - rect.left; const cy = e.clientY - rect.top;
    if (dragRef.current.dragging) {
      const dx = e.clientX - dragRef.current.lastX, dy = e.clientY - dragRef.current.lastY;
      if (Math.abs(dx) + Math.abs(dy) > 1) dragRef.current.moved = true;
      camRef.current.x -= dx / camRef.current.zoom; camRef.current.y -= dy / camRef.current.zoom;
      dragRef.current.lastX = e.clientX; dragRef.current.lastY = e.clientY;
    } else hoverRef.current = findSystemAt(cx, cy);
  }, [findSystemAt]);

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    const moved = dragRef.current.moved; dragRef.current.dragging = false; dragRef.current.moved = false; if (moved) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect(); const cx = e.clientX - rect.left; const cy = e.clientY - rect.top;
    const fleetId = viewOptions.fleets ? findFleetAt(cx, cy) : null;
    if (fleetId) {
      const snap = simulation.getSnapshot(); const fleet = snap.fleets[fleetId];
      onSelectFleet(fleetId); onSelectSystem(null); onSelectEmpire(fleet?.ownerEmpireId ?? null); return;
    }
    const sysId = findSystemAt(cx, cy);
    if (sysId) {
      onSelectFleet(null); onSelectSystem(sysId);
      const snap = simulation.getSnapshot(); const sys = snap.systems[sysId];
      if (sys?.ownerEmpireId) onSelectEmpire(sys.ownerEmpireId); else onSelectEmpire(null);
    } else { onSelectFleet(null); onSelectSystem(null); onSelectEmpire(null); }
  }, [simulation, viewOptions.fleets, findFleetAt, findSystemAt, onSelectSystem, onSelectEmpire, onSelectFleet]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault(); const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect(); const cx = e.clientX - rect.left; const cy = e.clientY - rect.top; const cam = camRef.current;
    const [wx, wy] = screenToWorld(cx, cy, cam, canvas.offsetWidth, canvas.offsetHeight);
    const factor = e.deltaY > 0 ? 0.85 : 1.18;
    const current = zoomAnimRef.current?.target ?? cam.zoom;
    zoomAnimRef.current = { target: clampZoom(current * factor), wx, wy, cx, cy };
  }, []);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair" }} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={() => { dragRef.current.dragging = false; dragRef.current.moved = false; hoverRef.current = null; }} onWheel={onWheel} />;
}
