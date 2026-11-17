/**
 * Split times against the player's own best run, and the bronze, silver and gold times to beat.
 * Pure functions. Times are in seconds.
 */

/** Where the three checkpoints stand, as shares of the way from the start line to the finish. */
export const CHECKPOINTS = [0.25, 0.5, 0.75] as const;

export function checkpointsOf(startAt: number, finishAt: number): number[] {
  return CHECKPOINTS.map((share) => startAt + (finishAt - startAt) * share);
}

/**
 * Times to beat. Set against the tests' scripted driver, which keeps to the middle of the road and
 * takes a little over 64 seconds: gold wants a braver run than that. Nobody has driven the stage yet,
 * so expect to move these.
 */
export const TARGETS = { gold: 64, silver: 70, bronze: 80 } as const;
export type Medal = keyof typeof TARGETS;
export const MEDALS: readonly Medal[] = ['gold', 'silver', 'bronze'];

/** The best medal a time earns, or null if it misses bronze. */
export function medalFor(time: number): Medal | null {
  if (!Number.isFinite(time) || time <= 0) return null;
  return MEDALS.find((medal) => time <= TARGETS[medal]) ?? null;
}

const LINES: Record<Medal | 'slow', string> = {
  gold: "Sawa. That's a stage time.",
  silver: 'Tidy. Gold is close.',
  bronze: 'On the pace. Now find some time.',
  slow: 'Even the zebra overtook you.',
};

/** The line on the end screen for a time. */
export function verdict(time: number): string {
  return LINES[medalFor(time) ?? 'slow'];
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
