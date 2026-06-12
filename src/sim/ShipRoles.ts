import type { ShipRole } from "../types/sim";

/** Specialized ship roles built alongside the classic raider/strike/armada combat classes
 *  (those remain the "battleship" line). Effects are systemic, not tactical: each role
 *  applies one readable rule on patrol arrival or during conflict resolution. */
export interface ShipRoleSpec {
  label: string;
  description: string;
  /** Wealth cost when built via the emperor command. */
  cost: number;
  /** Authority cost when built via the emperor command. */
  authority: number;
  baseStrength: number;
  speedMul: number;
  /** Stationary ships hold their build system instead of patrolling. */
  stationary: boolean;
  buildableIn: { emperor: boolean; sandbox: boolean };
}

export const SHIP_ROLE_SPEC: Record<ShipRole, ShipRoleSpec> = {
  science: {
    label: "Science Ship",
    description: "Surveys ancient and artifact worlds: raises tech, can discover buried artifacts.",
    cost: 120, authority: 20, baseStrength: 8, speedMul: 1.1, stationary: false,
    buildableIn: { emperor: true, sandbox: true },
  },
  missionary: {
    label: "Missionary Ship",
    description: "Carries the state faith to unconverted and minority-faith worlds.",
    cost: 90, authority: 15, baseStrength: 6, speedMul: 1.0, stationary: false,
    buildableIn: { emperor: true, sandbox: true },
  },
  support: {
    label: "Support Ship",
    description: "Stabilizes worlds it visits and patches up stationed fleets.",
    cost: 100, authority: 15, baseStrength: 10, speedMul: 0.9, stationary: false,
    buildableIn: { emperor: true, sandbox: true },
  },
  gunstation: {
    label: "Gun Station",
    description: "Immobile bastion: adds its strength to the local defense of its star.",
    cost: 150, authority: 22, baseStrength: 30, speedMul: 0, stationary: true,
    buildableIn: { emperor: true, sandbox: true },
  },
  dropship: {
    label: "Dropship",
    description: "Frontier assault carrier: sponsors colonization pushes from border worlds.",
    cost: 130, authority: 20, baseStrength: 16, speedMul: 0.95, stationary: false,
    buildableIn: { emperor: true, sandbox: true },
  },
  disruptor: {
    label: "Disruptor",
    description: "Scrambles starlanes: slows enemy fleets routed through the worlds it visits.",
    cost: 140, authority: 22, baseStrength: 12, speedMul: 1.05, stationary: false,
    buildableIn: { emperor: true, sandbox: true },
  },
};

export const SHIP_ROLES: ShipRole[] = ["science", "missionary", "support", "gunstation", "dropship", "disruptor"];
