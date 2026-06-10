import { useEffect, useRef, useCallback } from "react";
import type { Id, SimEvent, Fleet } from "../types/sim";
import type { Camera } from "./camera";
import { worldToScreen, screenToWorld, clampZoom } from "./camera";
import { colorWithAlpha, UNOWNED_COLOR, SELECTION_COLOR, BACKGROUND_COLOR } from "./colors";
import type { Simulation } from "../sim/Simulation";

export interface ViewOptions {
  territory: boolean;
  labels: boolean;
  wars: boolean;
  events: boolean;
  fleets: boolean;
}

interface Props {
  simulation: Simulation;
  selectedSystemId: Id | null;
  selectedEmpireId: Id | null;
  viewOptions: ViewOptions;
  resetCameraToken: number;
  onSelectSystem: (id: Id | null) => void;
  onSelectEmpire: (id: Id | null) => void;
}

function eventColor(event: SimEvent): string {
  switch (event.type) {
    case "war-declared":
    case "border-conflict":
    case "empire-collapsed":
      return "rgba(255,90,90,0.75)";
    case "rebellion":
      return "rgba(255,210,90,0.75)";
    case "golden-age":
    case "technology-breakthrough":
      return "rgba(120,220,255,0.75)";
    default:
      return "rgba(255,255,255,0.45)";
  }
}

function fleetSize(fleet: Fleet): number {
  return fleet.kind === "war" ? Math.max(3, Math.min(8, fleet.strength / 8)) : 3.5;
}

export function GalaxyCanvas({
  simulation,
  selectedSystemId,
  selectedEmpireId,
  viewOptions,
  resetCameraToken,
  onSelectSystem,
  onSelectEmpire,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<Camera>({ x: 600, y: 450, zoom: 0.8 });
  const rafRef = useRef<number>(0);
  const dragRef = useRef<{ dragging: boolean; moved: boolean; lastX: number; lastY: number }>({ dragging: false, moved: false, lastX: 0, lastY: 0 });
  const hoverRef = useRef<Id | null>(null);

  useEffect(() => { camRef.current = { x: 600, y: 450, zoom: 0.8 }; }, [resetCameraToken]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function draw() {
      rafRef.current = requestAnimationFrame(draw);
      const ctx = canvas!.getContext("2d");
      if (!ctx) return;
      const w = canvas!.width;
      const h = canvas!.height;
      const cam = camRef.current;
      const snap = simulation.getSnapshot();
      const selectedEmpire = selectedEmpireId ? snap.empires[selectedEmpireId] : null;

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
          const alpha = emp.id === selectedEmpireId ? 0.34 : 0.2;
          grad.addColorStop(0, colorWithAlpha(emp.color, alpha));
          grad.addColorStop(1, colorWithAlpha(emp.color, 0));
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        }
      }

      if (viewOptions.wars) {
        for (const emp of Object.values(snap.empires)) {
          for (const warId of emp.activeWarEmpireIds) {
            if (warId < emp.id) continue;
            const enemy = snap.empires[warId];
            if (!enemy) continue;
            const capA = snap.systems[emp.capitalSystemId];
            const capB = snap.systems[enemy.capitalSystemId];
            if (!capA || !capB) continue;
            const [ax, ay] = worldToScreen(capA.x, capA.y, cam, w, h);
            const [bx, by] = worldToScreen(capB.x, capB.y, cam, w, h);
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.strokeStyle = "rgba(255,80,80,0.38)";
            ctx.lineWidth = emp.id === selectedEmpireId || enemy.id === selectedEmpireId ? 2 : 1;
            ctx.setLineDash([4, 6]);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }

      for (const sys of Object.values(snap.systems)) {
        const [sx, sy] = worldToScreen(sys.x, sys.y, cam, w, h);
        if (sx < -30 || sx > w + 30 || sy < -30 || sy > h + 30) continue;
        const r = Math.max(2, (2.5 + sys.population * 3) * cam.zoom);
        const isSelected = sys.id === selectedSystemId;
        const isHovered = sys.id === hoverRef.current;
        const isEmpireSel = Boolean(selectedEmpireId && sys.ownerEmpireId === selectedEmpireId);
        const emp = sys.ownerEmpireId ? snap.empires[sys.ownerEmpireId] : null;
        const color = emp ? emp.color : UNOWNED_COLOR;
        if (isSelected || isHovered || isEmpireSel) {
          ctx.beginPath();
          ctx.arc(sx, sy, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = isSelected ? SELECTION_COLOR : colorWithAlpha(color, 0.75);
          ctx.lineWidth = isSelected ? 2 : 1.5;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        if (emp && emp.capitalSystemId === sys.id) {
          ctx.beginPath();
          ctx.arc(sx, sy, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = colorWithAlpha(emp.color, 0.95);
          ctx.lineWidth = 1.5;
          ctx.stroke();
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
          const selected = fleet.ownerEmpireId === selectedEmpireId;
          ctx.beginPath();
          ctx.moveTo(ox, oy);
          ctx.lineTo(tx, ty);
          ctx.strokeStyle = colorWithAlpha(owner.color, selected ? 0.32 : 0.16);
          ctx.lineWidth = selected ? 1.2 : 0.8;
          ctx.setLineDash([2, 7]);
          ctx.stroke();
          ctx.setLineDash([]);

          const size = fleetSize(fleet) * cam.zoom;
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(Math.atan2(ty - sy, tx - sx));
          ctx.beginPath();
          ctx.moveTo(size + 2, 0);
          ctx.lineTo(-size, -size * 0.65);
          ctx.lineTo(-size * 0.45, 0);
          ctx.lineTo(-size, size * 0.65);
          ctx.closePath();
          ctx.fillStyle = fleet.kind === "war" ? "rgba(255,220,220,0.92)" : "rgba(220,245,255,0.9)";
          ctx.strokeStyle = owner.color;
          ctx.lineWidth = selected ? 2 : 1;
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }

      if (viewOptions.events) {
        const recent = snap.eventLog.slice(-35).map(id => snap.events[id]).filter(Boolean).filter(ev => snap.tick - ev.tick < 40 && ev.relatedSystemIds.length > 0);
        for (const ev of recent) {
          const age = Math.max(0, snap.tick - ev.tick);
          const alpha = Math.max(0, 1 - age / 40);
          for (const systemId of ev.relatedSystemIds.slice(0, 5)) {
            const sys = snap.systems[systemId];
            if (!sys) continue;
            const [sx, sy] = worldToScreen(sys.x, sys.y, cam, w, h);
            ctx.beginPath();
            ctx.arc(sx, sy, (10 + ev.importance * 4 + age * 0.35) * cam.zoom, 0, Math.PI * 2);
            ctx.strokeStyle = eventColor(ev).replace(/0\.\d+\)/, `${0.65 * alpha})`);
            ctx.lineWidth = Math.max(1, ev.importance * 0.35);
            ctx.stroke();
          }
        }
      }

      if (viewOptions.labels) {
        ctx.font = "11px monospace";
        ctx.textBaseline = "middle";
        for (const emp of Object.values(snap.empires)) {
          const cap = snap.systems[emp.capitalSystemId];
          if (!cap) continue;
          const [sx, sy] = worldToScreen(cap.x, cap.y, cam, w, h);
          if (sx < -80 || sx > w + 80 || sy < -20 || sy > h + 20) continue;
          const label = emp.name;
          const tw = ctx.measureText(label).width;
          ctx.fillStyle = "rgba(0,0,0,0.55)";
          ctx.fillRect(sx + 8, sy - 8, tw + 6, 16);
          ctx.fillStyle = emp.color;
          ctx.fillText(label, sx + 11, sy);
        }
        if (selectedEmpire) {
          ctx.fillStyle = "rgba(220,235,255,0.7)";
          for (const id of selectedEmpire.ownedSystemIds) {
            const sys = snap.systems[id];
            if (!sys) continue;
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
          const label = `${sys.name}${emp ? ` (${emp.name})` : ""}`;
          ctx.font = "12px monospace";
          const tw = ctx.measureText(label).width;
          ctx.fillStyle = "rgba(0,0,0,0.75)";
          ctx.fillRect(sx + 8, sy - 18, tw + 8, 20);
          ctx.fillStyle = "#ddd";
          ctx.fillText(label, sx + 12, sy - 3);
        }
      }
      ctx.font = "11px monospace";
      ctx.fillStyle = "rgba(200,216,232,0.55)";
      ctx.fillText(`drag pan · wheel zoom · click inspect`, 10, h - 12);
    }
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [simulation, selectedSystemId, selectedEmpireId, viewOptions, resetCameraToken]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    });
    ro.observe(canvas);
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    return () => ro.disconnect();
  }, []);

  const findSystemAt = useCallback((cx: number, cy: number): Id | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const snap = simulation.getSnapshot();
    const cam = camRef.current;
    const w = canvas.width, h = canvas.height;
    let best: Id | null = null;
    let bestD = 16;
    for (const sys of Object.values(snap.systems)) {
      const [sx, sy] = worldToScreen(sys.x, sys.y, cam, w, h);
      const d = Math.sqrt((sx - cx) ** 2 + (sy - cy) ** 2);
      if (d < bestD) { bestD = d; best = sys.id; }
    }
    return best;
  }, [simulation]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { dragging: true, moved: false, lastX: e.clientX, lastY: e.clientY };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    if (dragRef.current.dragging) {
      const dx = e.clientX - dragRef.current.lastX;
      const dy = e.clientY - dragRef.current.lastY;
      if (Math.abs(dx) + Math.abs(dy) > 1) dragRef.current.moved = true;
      camRef.current.x -= dx / camRef.current.zoom;
      camRef.current.y -= dy / camRef.current.zoom;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
    } else {
      hoverRef.current = findSystemAt(cx, cy);
    }
  }, [findSystemAt]);

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    const moved = dragRef.current.moved;
    dragRef.current.dragging = false;
    dragRef.current.moved = false;
    if (moved) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const sysId = findSystemAt(cx, cy);
    if (sysId) {
      onSelectSystem(sysId);
      const snap = simulation.getSnapshot();
      const sys = snap.systems[sysId];
      if (sys?.ownerEmpireId) onSelectEmpire(sys.ownerEmpireId);
      else onSelectEmpire(null);
    } else {
      onSelectSystem(null);
      onSelectEmpire(null);
    }
  }, [simulation, findSystemAt, onSelectSystem, onSelectEmpire]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const cam = camRef.current;
    const [wx, wy] = screenToWorld(cx, cy, cam, canvas.width, canvas.height);
    const factor = e.deltaY > 0 ? 0.85 : 1.18;
    cam.zoom = clampZoom(cam.zoom * factor);
    const [nx, ny] = worldToScreen(wx, wy, cam, canvas.width, canvas.height);
    cam.x += (nx - cx) / cam.zoom;
    cam.y += (ny - cy) / cam.zoom;
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={() => { dragRef.current.dragging = false; dragRef.current.moved = false; hoverRef.current = null; }}
      onWheel={onWheel}
    />
  );
}
