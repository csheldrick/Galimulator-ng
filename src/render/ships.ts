import type { Fleet } from "../types/sim";
import { colorWithAlpha } from "./colors";

// Visual silhouette categories. Maps a fleet's gameplay kind/class to a hull
// shape so ships read as distinct vessels instead of identical arrows.
export type ShipShape =
  | "dreadnought"   // flagship — ornate capital with command prow
  | "battleship"    // war armada — heavy blocky warship
  | "frigate"       // standard war ship — pointed hull + swept wings
  | "raider"        // raider class — sleek narrow interceptor
  | "fighter"       // patrol — small X-winged escort
  | "freighter"     // merchant — boxy cargo hauler
  | "transport"     // pilgrim/refugee — rounded passenger pod
  | "explorer"      // quest — saucer scout with forward dish
  | "colony";       // colonizer — bulky settler with habitat dome

export function shipShape(fleet: Fleet): ShipShape {
  if (fleet.kind === "flagship") return "dreadnought";
  if (fleet.kind === "merchant") return "freighter";
  if (fleet.kind === "pilgrim" || fleet.kind === "refugee") return "transport";
  if (fleet.kind === "quest") return "explorer";
  if (fleet.kind === "colonizer") return "colony";
  if (fleet.kind === "patrol") return "fighter";
  // war ships split by class
  if (fleet.shipClass === "armada") return "battleship";
  if (fleet.shipClass === "raider") return "raider";
  return "frigate";
}

// Traces the hull outline in a local frame where +x is "forward". Caller has
// already translated/rotated the context. Does not fill or stroke — lets the
// caller own colors so selection/owner styling stays in one place.
function traceHull(ctx: CanvasRenderingContext2D, shape: ShipShape, s: number) {
  ctx.beginPath();
  switch (shape) {
    case "dreadnought":
      ctx.moveTo(s * 2.0, 0);
      ctx.lineTo(s * 1.1, -s * 0.28);
      ctx.lineTo(s * 0.7, -s * 0.6);
      ctx.lineTo(-s * 0.7, -s * 0.62);
      ctx.lineTo(-s * 1.3, -s * 0.32);
      ctx.lineTo(-s * 1.3, s * 0.32);
      ctx.lineTo(-s * 0.7, s * 0.62);
      ctx.lineTo(s * 0.7, s * 0.6);
      ctx.lineTo(s * 1.1, s * 0.28);
      ctx.closePath();
      break;
    case "battleship":
      ctx.moveTo(s * 1.8, 0);
      ctx.lineTo(s * 0.7, -s * 0.42);
      ctx.lineTo(-s * 0.9, -s * 0.5);
      ctx.lineTo(-s * 1.2, -s * 0.26);
      ctx.lineTo(-s * 1.2, s * 0.26);
      ctx.lineTo(-s * 0.9, s * 0.5);
      ctx.lineTo(s * 0.7, s * 0.42);
      ctx.closePath();
      break;
    case "frigate":
      ctx.moveTo(s * 1.7, 0);
      ctx.lineTo(s * 0.4, -s * 0.34);
      ctx.lineTo(-s * 1.0, -s * 0.34);
      ctx.lineTo(-s * 1.2, 0);
      ctx.lineTo(-s * 1.0, s * 0.34);
      ctx.lineTo(s * 0.4, s * 0.34);
      ctx.closePath();
      break;
    case "raider":
      ctx.moveTo(s * 1.9, 0);
      ctx.lineTo(s * 0.2, -s * 0.18);
      ctx.lineTo(-s * 1.0, -s * 0.16);
      ctx.lineTo(-s * 1.0, s * 0.16);
      ctx.lineTo(s * 0.2, s * 0.18);
      ctx.closePath();
      break;
    case "fighter":
      ctx.moveTo(s * 1.5, 0);
      ctx.lineTo(-s * 0.2, -s * 0.22);
      ctx.lineTo(-s * 1.0, -s * 0.18);
      ctx.lineTo(-s * 1.0, s * 0.18);
      ctx.lineTo(-s * 0.2, s * 0.22);
      ctx.closePath();
      break;
    case "freighter":
      ctx.moveTo(s * 1.3, 0);
      ctx.lineTo(s * 0.85, -s * 0.42);
      ctx.lineTo(-s * 1.15, -s * 0.5);
      ctx.lineTo(-s * 1.15, s * 0.5);
      ctx.lineTo(s * 0.85, s * 0.42);
      ctx.closePath();
      break;
    case "transport":
      // rounded passenger pod: nose cone + capsule body
      ctx.moveTo(s * 1.4, 0);
      ctx.quadraticCurveTo(s * 0.9, -s * 0.55, -s * 0.2, -s * 0.55);
      ctx.quadraticCurveTo(-s * 1.2, -s * 0.55, -s * 1.2, 0);
      ctx.quadraticCurveTo(-s * 1.2, s * 0.55, -s * 0.2, s * 0.55);
      ctx.quadraticCurveTo(s * 0.9, s * 0.55, s * 1.4, 0);
      ctx.closePath();
      break;
    case "explorer":
      // saucer scout with a forward sensor prong
      ctx.moveTo(s * 1.8, 0);
      ctx.lineTo(s * 0.5, -s * 0.18);
      ctx.lineTo(s * 0.2, -s * 0.6);
      ctx.lineTo(-s * 0.9, -s * 0.5);
      ctx.lineTo(-s * 0.9, s * 0.5);
      ctx.lineTo(s * 0.2, s * 0.6);
      ctx.lineTo(s * 0.5, s * 0.18);
      ctx.closePath();
      break;
    case "colony":
      // bulky settler hull with a habitat dome
      ctx.moveTo(s * 1.4, 0);
      ctx.lineTo(s * 0.6, -s * 0.5);
      ctx.lineTo(-s * 1.1, -s * 0.55);
      ctx.lineTo(-s * 1.1, s * 0.55);
      ctx.lineTo(s * 0.6, s * 0.5);
      ctx.closePath();
      break;
  }
}

// Secondary detail strokes (wings, nacelles, dome) drawn on top of the filled
// hull for extra ship-ness. Returns nothing; uses current stroke style.
function traceDetail(ctx: CanvasRenderingContext2D, shape: ShipShape, s: number) {
  ctx.beginPath();
  switch (shape) {
    case "dreadnought":
      // twin spinal lines + command bridge
      ctx.moveTo(s * 1.1, -s * 0.12); ctx.lineTo(-s * 1.1, -s * 0.12);
      ctx.moveTo(s * 1.1, s * 0.12); ctx.lineTo(-s * 1.1, s * 0.12);
      ctx.moveTo(s * 0.1, -s * 0.6); ctx.lineTo(s * 0.1, s * 0.6);
      break;
    case "battleship":
      // side nacelles
      ctx.moveTo(s * 0.4, -s * 0.42); ctx.lineTo(-s * 0.9, -s * 0.5);
      ctx.moveTo(s * 0.4, s * 0.42); ctx.lineTo(-s * 0.9, s * 0.5);
      break;
    case "frigate":
      // swept wings
      ctx.moveTo(-s * 0.1, -s * 0.3); ctx.lineTo(-s * 0.9, -s * 0.95); ctx.lineTo(-s * 1.0, -s * 0.3);
      ctx.moveTo(-s * 0.1, s * 0.3); ctx.lineTo(-s * 0.9, s * 0.95); ctx.lineTo(-s * 1.0, s * 0.3);
      break;
    case "raider":
      // sharply swept-back wings
      ctx.moveTo(s * 0.2, -s * 0.14); ctx.lineTo(-s * 1.2, -s * 0.85); ctx.lineTo(-s * 0.9, -s * 0.12);
      ctx.moveTo(s * 0.2, s * 0.14); ctx.lineTo(-s * 1.2, s * 0.85); ctx.lineTo(-s * 0.9, s * 0.12);
      break;
    case "fighter":
      // X-wing struts
      ctx.moveTo(-s * 0.3, 0); ctx.lineTo(-s * 1.1, -s * 0.7);
      ctx.moveTo(-s * 0.3, 0); ctx.lineTo(-s * 1.1, s * 0.7);
      break;
    case "freighter":
      // cargo container ridges
      ctx.moveTo(s * 0.4, -s * 0.42); ctx.lineTo(s * 0.4, s * 0.42);
      ctx.moveTo(-s * 0.2, -s * 0.48); ctx.lineTo(-s * 0.2, s * 0.48);
      ctx.moveTo(-s * 0.7, -s * 0.5); ctx.lineTo(-s * 0.7, s * 0.5);
      break;
    case "transport":
      // viewport band
      ctx.moveTo(s * 0.4, -s * 0.35); ctx.lineTo(s * 0.4, s * 0.35);
      break;
    case "explorer":
      // sensor dish ring
      ctx.moveTo(s * 0.5, -s * 0.18); ctx.lineTo(s * 0.5, s * 0.18);
      break;
    case "colony":
      // habitat dome
      ctx.moveTo(-s * 0.1, -s * 0.3);
      ctx.arc(-s * 0.1, 0, s * 0.3, -Math.PI / 2, Math.PI / 2);
      break;
  }
}

// Draws a fully styled ship in the caller's already-translated/rotated frame.
// `s` is the on-screen hull half-length. Engine glow flickers via `now`.
export function drawShip(
  ctx: CanvasRenderingContext2D,
  shape: ShipShape,
  s: number,
  fill: string,
  stroke: string,
  lineWidth: number,
  ownerColor: string,
  now: number,
  seed: number,
) {
  // Engine exhaust glow behind the hull — a soft flickering plume.
  const flick = 0.55 + 0.45 * Math.abs(Math.sin(now / 90 + seed));
  const rear = -s * (shape === "dreadnought" ? 1.3 : shape === "battleship" || shape === "freighter" ? 1.15 : 1.0);
  ctx.beginPath();
  ctx.moveTo(rear, -s * 0.22);
  ctx.lineTo(rear - s * (1.0 + flick), 0);
  ctx.lineTo(rear, s * 0.22);
  ctx.closePath();
  ctx.fillStyle = colorWithAlpha(ownerColor, 0.18 + 0.22 * flick);
  ctx.fill();

  // Hull
  traceHull(ctx, shape, s);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.stroke();

  // Detailing — only worth drawing when the ship is large enough to read.
  if (s > 3) {
    traceDetail(ctx, shape, s);
    ctx.strokeStyle = colorWithAlpha(stroke, 0.7);
    ctx.lineWidth = Math.max(0.5, lineWidth * 0.6);
    ctx.stroke();
  }
}
