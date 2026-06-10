import type { Empire, EmpireMood } from "../types/sim";

export const MOOD_LABEL: Record<EmpireMood, string> = {
  expanding: "Expanding",
  fortifying: "Fortifying",
  degenerating: "Degenerating",
  rioting: "Rioting",
  crusading: "Crusading",
  transcending: "Transcending",
};

export const MOOD_COLOR: Record<EmpireMood, string> = {
  expanding: "#8ac926",
  fortifying: "#4cc9f0",
  degenerating: "#9a8c98",
  rioting: "#e63946",
  crusading: "#ff9f1c",
  transcending: "#ffd166",
};

export function roman(n: number): string {
  const table: Array<[number, string]> = [[50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, sym] of table) while (n >= v) { out += sym; n -= v; }
  return out;
}

export function rulerDisplayName(emp: Empire): string {
  const ord = emp.ruler.ordinal > 1 ? ` ${roman(emp.ruler.ordinal)}` : "";
  return `${emp.ruler.title} ${emp.ruler.name}${ord}`;
}

export const MOOD_FLAVOR: Record<EmpireMood, string> = {
  expanding: "turned its gaze outward, hungry for new worlds",
  fortifying: "pulled back its fleets and began strengthening its worlds",
  degenerating: "slipped into decadence and slow decline",
  rioting: "erupted in unrest as riots spread across its worlds",
  crusading: "whipped itself into a fervor and beat the drums of war",
  transcending: "turned away from conquest toward something beyond the stars",
};
