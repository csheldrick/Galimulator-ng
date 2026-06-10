import { useEffect, useRef, useCallback } from "react";
import type { Id } from "../types/sim";
import type { Camera } from "./camera";
import { worldToScreen, screenToWorld, clampZoom } from "./camera";
import { colorWithAlpha, UNOWNED_COLOR, SELECTION_COLOR, BACKGROUND_COLOR } from "./colors";
import type { Simulation } from "../sim/Simulation";

interface Props {
  simulation: Simulation;
  selectedSystemId: Id | null;
  selectedEmpireId: Id | null;
  onSelectSystem: (id: Id | null) => void;
  onSelectEmpire: (id: Id | null) => void;
}

export function GalaxyCanvas({
  simulation,
  selectedSystemId,
  selectedEmpireId,
  onSelectSystem,
  onSelectEmpire,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<Camera>({ x: 600, y: 450, zoom: 0.8 });
  const rafRef = useRef<number>(0);
  const dragRef = useRef<{ dragging: boolean; moved: boolean; lastX: number; lastY: number }>({
    dragging: false, moved: false, lastX: 0, lastY: 0,
  });
  const hoverRef = useRef<Id | null>(null);

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

      ctx.fillStyle = BACKGROUND_COLOR;
      ctx.fillRect(0, 0, w, h);

      for (const sys of Object.values(snap.systems)) {
        if (!sys.ownerEmpireId) continue;
        const emp = snap.empires[sys.ownerEmpireId];
        if (!emp) continue;
        const [sx, sy] = worldToScreen(sys.x, sys.y, cam, w, h);
        const r = (30 + sys.population * 20) * cam.zoom;
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        grad.addColorStop(0, colorWithAlpha(emp.color, 0.22));
        grad.addColorStop(1, colorWithAlpha(emp.color, 0));
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }

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
          ctx.strokeStyle = "rgba(255,80,80,0.25)";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 6]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      for (const sys of Object.values(snap.systems)) {
        const [sx, sy] = worldToScreen(sys.x, sys.y, cam, w, h);
        if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) continue;

        const r = Math.max(2, (2.5 + sys.population * 3) * cam.zoom);
        const isSelected = sys.id === selectedSystemId;
        const isHovered = sys.id === hoverRef.current;
        const isEmpireSel = selectedEmpireId && sys.ownerEmpireId === selectedEmpireId;

        const emp = sys.ownerEmpireId ? snap.empires[sys.ownerEmpireId] : null;
        const color = emp ? emp.color : UNOWNED_COLOR;

        if (isSelected || isHovered || isEmpireSel) {
          ctx.beginPath();
          ctx.arc(sx, sy, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = isSelected ? SELECTION_COLOR : colorWithAlpha(color, 0.7);
          ctx.lineWidth = isSelected ? 2 : 1.5;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        if (emp && emp.capitalSystemId === sys.id) {
          ctx.beginPath();
          ctx.arc(sx, sy, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = colorWithAlpha(emp.color, 0.9);
          ctx.lineWidth = 1;
          ctx.stroke();
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
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [simulation, selectedSystemId, selectedEmpireId]);

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
