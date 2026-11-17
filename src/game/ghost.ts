/**
 * The ghost: the player's best run on a stage, recorded as the car's place and heading every tenth of a
 * second, and played back beside the next run as a see-through car. Pure functions: storing it on the
 * device is `rally.ts`'s job, with `parseGhost` and `ghostText` here.
 */

/** How often the car is recorded, in seconds. */
export const GHOST_STEP = 0.1;
/** Values kept for each moment: x, y, heading and height. */
const FIELDS = 4;
/** The longest run worth keeping, in seconds: the shared board's own limit. A slower one is not a best. */
const LONGEST = 600;

export interface GhostPose {
  x: number;
  y: number;
  heading: number;
  /** Above the flat ground: on a crest, and in the air past it. */
  height: number;
}

export interface Ghost {
  /** Which stage it was driven on. */
  stage: string;
  /** Its finishing time, in seconds. */
  time: number;
  /** x, y, heading and height, one moment after another, `GHOST_STEP` apart, from the clock's start. */
  frames: number[];
}

/** A run being recorded. */
export interface Recorder {
  frames: number[];
}

export function newRecorder(): Recorder {
  return { frames: [] };
}

/** How many moments a recording holds. */
export const momentsIn = (ghost: Pick<Ghost, 'frames'>): number => Math.floor(ghost.frames.length / FIELDS);

/**
 * Note where the car is, `time` seconds into the run. Call it on every step: only the steps that reach a
 * new tenth of a second are kept, so the recording is the same whatever the frame rate.
 */
export function record(recorder: Recorder, time: number, pose: GhostPose): void {
  if (!Number.isFinite(time) || time > LONGEST) return;
  while (momentsIn(recorder) * GHOST_STEP <= time + 1e-9) {
    recorder.frames.push(pose.x, pose.y, pose.heading, pose.height);
  }
}

/** The finished recording, as a ghost for `stage`. */
export function finishGhost(recorder: Recorder, stage: string, time: number): Ghost | null {
  if (!Number.isFinite(time) || time <= 0 || momentsIn(recorder) < 2) return null;
  return { stage, time, frames: recorder.frames.slice(0, momentsIn(recorder) * FIELDS) };
}

const turnBetween = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/**
 * Where the ghost is `time` seconds into its run, between the moments either side. It waits on the start
 * line before the clock starts, and on its last moment after it finishes. Null if there is no ghost.
 */
export function ghostAt(ghost: Ghost | null, time: number): GhostPose | null {
  if (!ghost) return null;
  const count = momentsIn(ghost);
  if (count === 0) return null;
  const at = Math.min(count - 1, Math.max(0, (Number.isFinite(time) ? time : 0) / GHOST_STEP));
  const i = Math.min(count - 2, Math.floor(at));
  if (i < 0) return pose(ghost.frames, 0);
  const t = at - i;
  const [a, b] = [pose(ghost.frames, i), pose(ghost.frames, i + 1)];
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    // The short way round, so a heading that passes through ±π does not spin the car.
    heading: a.heading + turnBetween(a.heading, b.heading) * t,
    height: a.height + (b.height - a.height) * t,
  };
}

const pose = (frames: readonly number[], i: number): GhostPose => ({
  x: frames[i * FIELDS]!,
  y: frames[i * FIELDS + 1]!,
  heading: frames[i * FIELDS + 2]!,
  height: frames[i * FIELDS + 3]!,
});

/** Whether a new run should take the ghost's place: there is none yet, or it is quicker. */
export function beatsGhost(ghost: Ghost | null, time: number): boolean {
  return Number.isFinite(time) && time > 0 && (ghost === null || time < ghost.time);
}

/** A ghost as stored: to the centimetre and the milliradian, which is plenty and keeps it small. */
export function ghostText(ghost: Ghost): string {
  const frames = ghost.frames.map((v, i) => (i % FIELDS === 2 ? Math.round(v * 1000) / 1000 : Math.round(v * 100) / 100));
  return JSON.stringify({ stage: ghost.stage, time: ghost.time, step: GHOST_STEP, frames });
}

/** Read a stored ghost for `stage`. Anything that is not one, or is one for another stage, is no ghost. */
export function parseGhost(text: string | null, stage: string): Ghost | null {
  if (!text) return null;
  try {
    const data = JSON.parse(text) as { stage?: unknown; time?: unknown; step?: unknown; frames?: unknown } | null;
    if (!data || data.stage !== stage || data.step !== GHOST_STEP) return null;
    const { time, frames } = data;
    if (typeof time !== 'number' || !Number.isFinite(time) || time <= 0 || time > LONGEST) return null;
    if (!Array.isArray(frames) || frames.length < FIELDS * 2 || frames.length % FIELDS !== 0) return null;
    if (!frames.every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
    // It must cover the run it claims to be, give or take a moment.
    if (Math.abs((frames.length / FIELDS - 1) * GHOST_STEP - time) > GHOST_STEP * 2) return null;
    return { stage, time, frames: frames as number[] };
  } catch {
    return null;
  }
}
