import type { EventType } from "../types/sim";

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function colorWithAlpha(color: string, alpha: number): string {
  if (color.startsWith("#") && color.length === 7) return hexToRgba(color, alpha);
  if (color.startsWith("hsl(")) {
    return color.replace("hsl(", "hsla(").replace(")", `,${alpha})`);
  }
  return color;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r: number, g: number, b: number;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function parseColorToRgb(color: string): [number, number, number] {
  if (color.startsWith("#") && color.length === 7) {
    return [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
  }
  const m = color.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/);
  if (m) return hslToRgb(Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100);
  return [136, 136, 136];
}

export const UNOWNED_COLOR = "#7a8696";
export const SELECTION_COLOR = "#ffffff";
export const BACKGROUND_COLOR = "#000004";
export const STAR_COLOR = "#f2f6ff";

// Shared event tinting: map flashes and inspector/history rows use the same palette.
export function eventColor(type: EventType): string {
  switch (type) {
    case "war-declared":
    case "border-conflict":
    case "empire-collapsed":
    case "monster-attack":
    case "monster-spawned": return "rgba(255,90,90,0.75)";
    case "rebellion":
    case "coup":
    case "galactic-crisis": return "rgba(255,210,90,0.75)";
    case "golden-age":
    case "technology-breakthrough":
    case "artifact-discovered":
    case "monster-slain":
    case "transcended": return "rgba(120,220,255,0.75)";
    case "religion-founded":
    case "religion-adopted": return "rgba(200,140,255,0.75)";
    case "character-rose": return "rgba(255,224,130,0.75)";
    case "character-fell": return "rgba(180,190,210,0.6)";
    default: return "rgba(255,255,255,0.45)";
  }
}
