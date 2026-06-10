export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export function worldToScreen(
  wx: number, wy: number, cam: Camera, w: number, h: number
): [number, number] {
  const sx = (wx - cam.x) * cam.zoom + w / 2;
  const sy = (wy - cam.y) * cam.zoom + h / 2;
  return [sx, sy];
}

export function screenToWorld(
  sx: number, sy: number, cam: Camera, w: number, h: number
): [number, number] {
  const wx = (sx - w / 2) / cam.zoom + cam.x;
  const wy = (sy - h / 2) / cam.zoom + cam.y;
  return [wx, wy];
}

export function clampZoom(z: number): number {
  return Math.max(0.15, Math.min(5, z));
}
