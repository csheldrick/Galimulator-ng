/**
 * Scriptable headless simulation report.
 *
 * Runs a fresh deterministic galaxy to the requested milestone ticks with no
 * rendering and prints the report to stdout — the same `runHeadlessReport()`
 * that the UI's "Headless report" button calls, now reachable from a terminal
 * or CI so simulation correctness can be checked without opening the app.
 *
 * Usage:
 *   npm run report                          # defaults: seed 42, 400 stars, milestones 1000,3000
 *   npm run report -- --seed 7 --stars 600  # override settings
 *   npm run report -- --milestones 1000,3000,10000   # full long-run health check
 *   npm run report -- --sweep               # run the preset sweep instead
 *   npm run report -- --no-determinism      # skip the replay determinism check
 *
 * The default milestones stop at 3000 ticks so the command (which runs the sim
 * twice for the determinism guard) finishes in a few seconds and is usable as a
 * CI/automated gate. Pass `--milestones 1000,3000,10000` for the deeper 10k-tick
 * run the UI's "Headless report" button performs.
 *
 * Determinism: by default the report is generated twice with the same seed and
 * the two outputs are compared. A mismatch means a tick subsystem reached for
 * randomness outside the seeded PRNG, which breaks save/replay continuity — the
 * script prints the divergence and exits non-zero so CI can catch it.
 */
import type { SimSettings } from "../src/types/sim";
import { runHeadlessReport, runPresetSweep } from "../src/sim/Headless";

const DEFAULT_SETTINGS: SimSettings = { seed: 42, numStars: 400, numEmpires: 12, ticksPerSecond: 4 };
const DEFAULT_MILESTONES = [1000, 3000];

function parseArgs(argv: string[]): { settings: SimSettings; milestones: number[]; sweep: boolean; checkDeterminism: boolean } {
  const settings: SimSettings = { ...DEFAULT_SETTINGS };
  let milestones = [...DEFAULT_MILESTONES];
  let sweep = false;
  let checkDeterminism = true;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) { console.error(`Missing value for ${arg}`); process.exit(2); }
      return v;
    };
    switch (arg) {
      case "--seed": settings.seed = Number(next()); break;
      case "--stars": settings.numStars = Number(next()); break;
      case "--empires": settings.numEmpires = Number(next()); break;
      case "--milestones": milestones = next().split(",").map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0); break;
      case "--sweep": sweep = true; break;
      case "--no-determinism": checkDeterminism = false; break;
      default: console.error(`Unknown argument: ${arg}`); process.exit(2);
    }
  }

  if (!Number.isFinite(settings.seed) || !Number.isFinite(settings.numStars) || !Number.isFinite(settings.numEmpires)) {
    console.error("seed, stars, and empires must be finite numbers");
    process.exit(2);
  }
  if (milestones.length === 0) milestones = [...DEFAULT_MILESTONES];

  return { settings, milestones, sweep, checkDeterminism };
}

/** Index of the first differing line, or -1 if identical. */
function firstDivergentLine(a: string, b: string): number {
  const la = a.split("\n");
  const lb = b.split("\n");
  const max = Math.max(la.length, lb.length);
  for (let i = 0; i < max; i++) {
    if (la[i] !== lb[i]) return i;
  }
  return -1;
}

function main(): void {
  const { settings, milestones, sweep, checkDeterminism } = parseArgs(process.argv.slice(2));

  const report = sweep ? runPresetSweep(settings) : runHeadlessReport(settings, milestones);
  console.log(report);

  if (!checkDeterminism) return;

  const replay = sweep ? runPresetSweep(settings) : runHeadlessReport(settings, milestones);
  const divergent = firstDivergentLine(report, replay);
  if (divergent !== -1) {
    console.error("");
    console.error(`✗ DETERMINISM CHECK FAILED — replay diverged at line ${divergent + 1}.`);
    console.error(`  This means a tick subsystem used non-seeded randomness. Compare:`);
    console.error(`    first run : ${JSON.stringify(report.split("\n")[divergent])}`);
    console.error(`    replay    : ${JSON.stringify(replay.split("\n")[divergent])}`);
    process.exit(1);
  }
  console.error("");
  console.error("✓ Determinism check passed — identical replay from the same seed.");
}

main();
