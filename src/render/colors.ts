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

export const UNOWNED_COLOR = "#556677";
export const SELECTION_COLOR = "#ffffff";
export const BACKGROUND_COLOR = "#080c14";
