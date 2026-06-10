import type { Artifact, ArtifactKind, GalaxyState, Id, PRNG, StarSystem } from "../types/sim";
import { makeArtifactName } from "./Galaxy";

const ARTIFACT_KINDS: ArtifactKind[] = [
  "research-lab",
  "fleet-base",
  "holy-monument",
  "financial-center",
  "sentinel-station",
  "stellar-forcefield",
  "mind-control-hub",
  "lost-archive",
  "strange-engine",
];

export const ARTIFACT_LABEL: Record<ArtifactKind, string> = {
  "research-lab": "Research Lab",
  "fleet-base": "Fleet Base",
  "holy-monument": "Holy Monument",
  "financial-center": "Financial Center",
  "sentinel-station": "Sentinel Station",
  "stellar-forcefield": "Stellar Forcefield",
  "mind-control-hub": "Mind-Control Hub",
  "lost-archive": "Lost Archive",
  "strange-engine": "Strange Engine",
};

export function pickArtifactKind(rng: PRNG): ArtifactKind {
  return rng.pick(ARTIFACT_KINDS);
}

export function createArtifact(
  state: GalaxyState,
  system: StarSystem,
  rng: PRNG,
  kind: ArtifactKind = pickArtifactKind(rng),
  origin: Artifact["origin"] = "precursor",
  ownerEmpireId: Id | null = system.ownerEmpireId,
): Artifact {
  state.artifacts ??= {};
  const id = `artifact-${state.tick}-${Object.keys(state.artifacts).length}-${rng.nextInt(0, 9999)}`;
  const artifact: Artifact = {
    id,
    name: system.artifactName ?? makeArtifactName(rng),
    kind,
    systemId: system.id,
    ownerEmpireId,
    origin,
    createdTick: state.tick,
    discoveredTick: origin === "precursor" ? undefined : state.tick,
    active: true,
    historicalEventIds: [],
  };
  state.artifacts[id] = artifact;
  system.artifactId = id;
  system.artifactName = artifact.name;
  system.markers ??= [];
  if (!system.markers.some(m => m.kind === "artifact-aura")) {
    system.markers.push({ kind: "artifact-aura", since: state.tick, label: `${ARTIFACT_LABEL[kind]}: ${artifact.name}` });
  }
  return artifact;
}

export function ensureArtifactObjects(state: GalaxyState, rng: PRNG): void {
  state.artifacts ??= {};
  for (const sys of Object.values(state.systems)) {
    if (sys.artifactId && state.artifacts[sys.artifactId]) continue;
    if (!sys.artifactName) continue;
    createArtifact(state, sys, rng, pickArtifactKind(rng), "precursor", sys.ownerEmpireId);
  }
}

export function syncArtifactOwnership(state: GalaxyState): void {
  if (!state.artifacts) return;
  for (const artifact of Object.values(state.artifacts)) {
    const sys = state.systems[artifact.systemId];
    if (!sys) continue;
    if (artifact.ownerEmpireId !== sys.ownerEmpireId) {
      artifact.ownerEmpireId = sys.ownerEmpireId;
      artifact.capturedTick = state.tick;
    }
  }
}

export function stepArtifacts(state: GalaxyState): void {
  if (!state.artifacts) return;
  syncArtifactOwnership(state);
  for (const artifact of Object.values(state.artifacts)) {
    if (!artifact.active || !artifact.ownerEmpireId) continue;
    const sys = state.systems[artifact.systemId];
    const emp = state.empires[artifact.ownerEmpireId];
    if (!sys || !emp) continue;
    switch (artifact.kind) {
      case "research-lab":
      case "lost-archive":
        emp.techLevel = Math.min(3, emp.techLevel + 0.00025);
        sys.techLevel = Math.min(3, sys.techLevel + 0.00035);
        break;
      case "fleet-base":
        emp.militaryStrength = Math.min(emp.militaryStrength + 0.35, emp.militaryStrength * 1.0004 + 0.1);
        break;
      case "financial-center":
        emp.wealth += 0.6;
        sys.localWealth = Math.min(250, (sys.localWealth ?? 0) + 0.2);
        break;
      case "holy-monument":
        if (emp.stateReligionId && !sys.religionId) sys.religionId = emp.stateReligionId;
        sys.stability = Math.min(1, sys.stability + 0.0008);
        break;
      case "sentinel-station":
      case "stellar-forcefield":
        sys.stability = Math.min(1, sys.stability + 0.001);
        break;
      case "mind-control-hub":
        sys.stability = Math.min(1, sys.stability + 0.0015);
        emp.cohesion = Math.max(0.05, emp.cohesion - 0.0001);
        break;
      case "strange-engine":
        if (state.tick % 300 === 0) {
          const sign = (artifact.id.charCodeAt(artifact.id.length - 1) + state.tick) % 2 === 0 ? 1 : -1;
          emp.techLevel = Math.min(3, emp.techLevel + 0.01);
          emp.wealth += 30;
          sys.stability = Math.max(0.05, Math.min(1, sys.stability + sign * 0.04));
        }
        break;
    }
  }
}
