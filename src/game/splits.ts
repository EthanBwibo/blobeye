/**
 * Split times against the player's own best run, and the bronze, silver and gold times to beat.
 * Pure functions. Times are in seconds.
 */

/** Where the three checkpoints stand, as shares of the way from the start line to the finish. */
export const CHECKPOINTS = [0.25, 0.5, 0.75] as const;

export function checkpointsOf(startAt: number, finishAt: number): number[] {
  return CHECKPOINTS.map((share) => startAt + (finishAt - startAt) * share);
}

export type Medal = 'gold' | 'silver' | 'bronze';
export const MEDALS: readonly Medal[] = ['gold', 'silver', 'bronze'];
/** The time to beat for each medal, in seconds. Each stage has its own (see `stages.ts`). */
export type Targets = Readonly<Record<Medal, number>>;

/**
 * Naivasha's times to beat. Set against the tests' scripted driver, which keeps to the middle of the road
 * and, missing the animals, takes a little under 64 seconds: gold wants a braver run than that. Hitting an
 * animal costs 5 seconds (see `HIT` in hazards.ts). Nobody has driven the stage yet, so expect to move these.
 */
export const TARGETS: Targets = { gold: 62.5, silver: 70, bronze: 80 };

/** The best medal a time earns, or null if it misses bronze. */
export function medalFor(time: number, targets: Targets = TARGETS): Medal | null {
  if (!Number.isFinite(time) || time <= 0) return null;
  return MEDALS.find((medal) => time <= targets[medal]) ?? null;
}

/**
 * Medals that follow the drivers. Each stage's benchmark, "the pace", is the third-fastest time of the current
 * season on the shared board (the fastest, should there be fewer than three). Gold is within 3% of it, silver
 * within 8%, bronze within 15%. Until the stage has `least` times this season, its fixed `targets` stand instead.
 */
export const PACE = { rank: 3, least: 5, within: { gold: 0.03, silver: 0.08, bronze: 0.15 } } as const;

/** The times to beat for a run, and where they came from: the season's pace (`benchmark`), or the stage's fixed times (null). */
export interface MedalTimes {
  targets: Targets;
  benchmark: number | null;
}

/**
 * The medal times for a stage from this season's times on the shared board (any order; the top ten is
 * plenty, as only the third-fastest counts and the count only has to reach `PACE.least`). With too few
 * times, or none to be had, the stage's `fixed` times. Each time to beat is cut to the hundredth, the
 * way the clock shows it, so a time that reads the same as the target earns the medal.
 */
export function paceTargets(times: readonly number[], fixed: Targets): MedalTimes {
  const kept = times.filter(validTime).sort((a, b) => a - b);
  if (kept.length < PACE.least) return { targets: fixed, benchmark: null };
  const benchmark = kept[Math.min(PACE.rank, kept.length) - 1]!;
  const cut = (share: number) => Math.floor(benchmark * (1 + share) * 100 + 1e-6) / 100;
  return { targets: { gold: cut(PACE.within.gold), silver: cut(PACE.within.silver), bronze: cut(PACE.within.bronze) }, benchmark };
}

/** What a medal's time means, for the end screen: "Gold: within 3% of the pace", or "Gold: the stage's set time". */
export function medalNote(medal: Medal, times: MedalTimes): string {
  const name = medal.charAt(0).toUpperCase() + medal.slice(1);
  if (times.benchmark === null) return `${name}: the stage's set time`;
  return `${name}: within ${Math.round(PACE.within[medal] * 100)}% of the pace`;
}

/** One line under the medal times, saying where they come from. */
export function paceLine(times: MedalTimes, format: (seconds: number) => string): string {
  if (times.benchmark === null) return `Set times until the stage has ${PACE.least} this season`;
  return `The pace: ${format(times.benchmark)}, third-fastest this season`;
}

const LINES: Record<Medal | 'slow', string> = {
  gold: "Sawa. That's a stage time.",
  silver: 'Tidy. Gold is close.',
  bronze: 'On the pace. Now find some time.',
  slow: 'Even the zebra overtook you.',
};

/** The line on the end screen for a time. */
export function verdict(time: number, targets: Targets = TARGETS): string {
  return LINES[medalFor(time, targets) ?? 'slow'];
}

/** A run worth remembering: its time and the clock at each checkpoint. */
export interface BestRun {
  time: number;
  splits: number[];
}

const validTime = (time: unknown): time is number => typeof time === 'number' && Number.isFinite(time) && time > 0;

/** How far a split is off the best run's: negative is ahead. Null when there is nothing to compare with. */
export function splitGap(best: BestRun | null, index: number, time: number): number | null {
  const mark = best?.splits[index];
  return validTime(mark) && validTime(time) ? time - mark : null;
}

/**
 * The time spent in each sector: from the start to the first checkpoint, between checkpoints, and from the
 * last one to the finish. `splits` are the clock at each checkpoint; `finish` is the final time, if there is one.
 */
export function sectorTimes(splits: readonly number[], finish: number | null = null): number[] {
  const marks = finish === null ? splits : [...splits, finish];
  return marks.map((mark, i) => mark - (i ? marks[i - 1]! : 0));
}

/** How far a sector is off the same sector of the best run: negative is quicker. Null with nothing to compare. */
export function sectorGap(best: BestRun | null, index: number, time: number): number | null {
  if (!best || !validTime(time)) return null;
  const mark = sectorTimes(best.splits, best.time)[index];
  return validTime(mark) ? time - mark : null;
}

/** A gap as it is shown: -0.42 or +1.20. */
export function formatGap(gap: number): string {
  const hundredths = Math.round(Math.abs(gap) * 100);
  return `${gap < 0 && hundredths > 0 ? '-' : '+'}${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, '0')}`;
}

/** The quicker of the run on record and a new one. */
export function keepBest(best: BestRun | null, run: BestRun): BestRun | null {
  if (!validTime(run.time)) return best;
  return best === null || run.time < best.time ? { time: run.time, splits: run.splits.slice() } : best;
}

/** Read a stored best run. Anything that is not one is no best run. */
export function parseBestRun(text: string | null): BestRun | null {
  if (!text) return null;
  try {
    const run = JSON.parse(text) as { time?: unknown; splits?: unknown } | null;
    if (!run || !validTime(run.time) || !Array.isArray(run.splits) || run.splits.length !== CHECKPOINTS.length) return null;
    const splits = run.splits as unknown[];
    if (!splits.every((s, i) => validTime(s) && s < (run.time as number) && (i === 0 || s > (splits[i - 1] as number)))) return null;
    return { time: run.time, splits: splits as number[] };
  } catch {
    return null;
  }
}
