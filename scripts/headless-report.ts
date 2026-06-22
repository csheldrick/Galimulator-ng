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
 *   npm run report -- --assert-health       # exit non-zero if simulation looks broken
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
 *
 * Health assertions (--assert-health): checks that the run produced at least
 * one war declaration and one empire collapse. A zero tally for either indicates
 * a badly broken simulation even when the determinism check passes.
 */
import type { SimSettings } from "../src/types/sim";
import { runHeadlessStats, runPresetSweep } from "../src/sim/Headless";

const DEFAULT_SETTINGS: SimSettings = { seed: 42, numStars: 400, numEmpires: 12, ticksPerSecond: 4 };
const DEFAULT_MILESTONES = [1000, 3000];

const HELP = `\
Usage: npm run report [-- <options>]

Run a headless galaxy simulation and print a health/stats report to stdout.

Options:
  --seed <n>              PRNG seed (default: 42)
  --stars <n>             Number of star systems (default: 400)
  --empires <n>           Number of starting empires (default: 12)
  --milestones <a,b,...>  Tick checkpoints to report (default: 1000,3000)
  --sweep                 Run the preset milestone sweep instead
  --no-determinism        Skip the replay determinism check
  --assert-health         Exit non-zero if zero wars or zero collapses observed
  --help, -h              Print this help and exit

Examples:
  npm run report                               # defaults: seed 42, 400 stars, checkpoints 1000 & 3000
  npm run report -- --seed 7 --stars 600       # custom seed and galaxy size
  npm run report -- --milestones 1000,3000,10000  # deeper run including 10k ticks
  npm run report -- --assert-health            # CI gate: fails if simulation looks broken
  npm run report -- --no-determinism           # skip the byte-identical replay check

Exit codes:
  0   Report printed; determinism and health checks (if requested) passed.
  1   Determinism divergence detected, or health check failed.
  2   Bad arguments.`;

function parseArgs(argv: string[]): { settings: SimSettings; milestones: number[]; sweep: boolean; checkDeterminism: boolean; assertHealth: boolean } {
  const settings: SimSettings = { ...DEFAULT_SETTINGS };
  let milestones = [...DEFAULT_MILESTONES];
  let sweep = false;
  let checkDeterminism = true;
  let assertHealth = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) { console.error(`Missing value for ${arg}`); process.exit(2); }
      return v;
    };
    switch (arg) {
      case "--help": case "-h": console.log(HELP); process.exit(0); break;
      case "--seed": settings.seed = Number(next()); break;
      case "--stars": settings.numStars = Number(next()); break;
      case "--empires": settings.numEmpires = Number(next()); break;
      case "--milestones": milestones = next().split(",").map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0); break;
      case "--sweep": sweep = true; break;
      case "--no-determinism": checkDeterminism = false; break;
      case "--assert-health": assertHealth = true; break;
      default: console.error(`Unknown argument: ${arg}`); process.exit(2);
    }
  }

  if (!Number.isFinite(settings.seed) || !Number.isFinite(settings.numStars) || !Number.isFinite(settings.numEmpires)) {
    console.error("seed, stars, and empires must be finite numbers");
    process.exit(2);
  }
  if (milestones.length === 0) milestones = [...DEFAULT_MILESTONES];

  return { settings, milestones, sweep, checkDeterminism, assertHealth };
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
  const { settings, milestones, sweep, checkDeterminism, assertHealth } = parseArgs(process.argv.slice(2));

  const { report, tally } = sweep
    ? { report: runPresetSweep(settings), tally: null }
    : runHeadlessStats(settings, milestones);
  console.log(report);

  if (checkDeterminism) {
    const replay = sweep ? runPresetSweep(settings) : runHeadlessStats(settings, milestones).report;
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

  if (assertHealth && tally !== null) {
    const failures: string[] = [];
    if (tally.warsDeclared === 0) failures.push(`0 wars declared — conflict subsystem may be broken`);
    if (tally.collapsed === 0) failures.push(`0 empires collapsed — churn subsystem may be broken`);
    if (failures.length > 0) {
      console.error("");
      for (const f of failures) console.error(`✗ HEALTH CHECK FAILED — ${f}`);
      process.exit(1);
    }
    console.error(`✓ Health check passed — ${tally.warsDeclared} wars declared, ${tally.collapsed} empires collapsed.`);
  }
}

main();
