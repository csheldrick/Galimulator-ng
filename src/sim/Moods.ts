import type { Empire, EmpireMood, Ideology } from "../types/sim";

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

export const IDEOLOGY_LABEL: Record<Ideology, string> = {
  militarist: "Militarist",
  pacifist: "Pacifist",
  spiritualist: "Spiritualist",
  materialist: "Materialist",
  expansionist: "Expansionist",
  isolationist: "Isolationist",
};

export const IDEOLOGY_COLOR: Record<Ideology, string> = {
  militarist: "#e63946",
  pacifist: "#80ed99",
  spiritualist: "#c77dff",
  materialist: "#ffd166",
  expansionist: "#4cc9f0",
  isolationist: "#9a8c98",
};

/** Behavioral fingerprints: how each creed bends aggression, expansion, and research. */
export const IDEOLOGY_MODS: Record<Ideology, { aggression: number; expansion: number; research: number }> = {
  militarist: { aggression: 1.5, expansion: 1.0, research: 0.9 },
  pacifist: { aggression: 0.4, expansion: 0.8, research: 1.15 },
  spiritualist: { aggression: 0.9, expansion: 0.9, research: 0.95 },
  materialist: { aggression: 0.8, expansion: 1.0, research: 1.3 },
  expansionist: { aggression: 1.1, expansion: 1.6, research: 0.95 },
  isolationist: { aggression: 0.6, expansion: 0.5, research: 1.1 },
};

export const IDEOLOGIES: Ideology[] = ["militarist", "pacifist", "spiritualist", "materialist", "expansionist", "isolationist"];

export const MOOD_FLAVOR: Record<EmpireMood, string> = {
  expanding: "turned its gaze outward, hungry for new worlds",
  fortifying: "pulled back its fleets and began strengthening its worlds",
  degenerating: "slipped into decadence and slow decline",
  rioting: "erupted in unrest as riots spread across its worlds",
  crusading: "whipped itself into a fervor and beat the drums of war",
  transcending: "turned away from conquest toward something beyond the stars",
};
