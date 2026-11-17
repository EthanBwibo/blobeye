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

/*
 * A replay: a ghost packed small enough to send with a time to the shared board. It keeps the car's place,
 * rounded to the decimetre, and its heading, rounded to a 4096th of a turn, once every `GHOST_STEP`. Not
 * the height: whoever plays it back puts the car on the ground under it (see `unpackReplay`).
 *
 * The text is base64url: a version letter, the first place as two 4-letter numbers, then 6 letters for
 * each moment: how far it moved since the last (2 letters across, 2 down) and its heading (2). Every moment
 * is the same size, so the shared table checks a replay's length against its time in plain SQL (see
 * `supabase/migrations`), and `replayFits` here does the same.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const REPLAY_VERSION = '1';
/** Letters in the version and first place, and in each moment after it. */
const HEAD = 9;
const MOMENT = 6;
/** Places are kept in decimetres, and headings in this many parts of a turn. */
const PER_METRE = 10;
const TURN = 4096;
/** The furthest a 2-letter move can go, either way, in decimetres: 204 metres in a tenth of a second. */
const MOST_MOVE = 2047;
const FIRST_OFFSET = 2 ** 23;
/** How far a replay's moments may be from what its time calls for, either way. The shared table allows the same. */
export const REPLAY_SLACK = 3;

const digits = (value: number, count: number): string => {
  let text = '';
  for (let i = count - 1; i >= 0; i--) text += ALPHABET[Math.floor(value / 64 ** i) % 64];
  return text;
};
const number = (text: string, from: number, count: number): number => {
  let value = 0;
  for (let i = 0; i < count; i++) value = value * 64 + ALPHABET.indexOf(text[from + i]!);
  return value;
};

/** How many moments a replay holds, from its length alone. Not a whole number if it is no replay. */
const momentsInReplay = (text: string): number => (text.length - HEAD) / MOMENT;

/**
 * Whether a replay's length is about right for a run of `timeMs` milliseconds: one moment at the start
 * and one each tenth of a second after, give or take `REPLAY_SLACK`. The same rule as the shared table's.
 */
export function replayFits(text: string, timeMs: number): boolean {
  if (typeof text !== 'string' || !Number.isFinite(timeMs) || timeMs <= 0) return false;
  if (text[0] !== REPLAY_VERSION || !/^[A-Za-z0-9_-]+$/.test(text)) return false;
  const moments = momentsInReplay(text);
  return Number.isInteger(moments) && moments >= 2 && Math.abs(moments - (Math.floor(timeMs / 100) + 1)) <= REPLAY_SLACK;
}

/** A ghost as a replay, or null if it cannot be packed (a move too long for its letters). */
export function packReplay(ghost: Pick<Ghost, 'frames'>): string | null {
  const count = momentsIn(ghost);
  if (count < 2) return null;
  const at = (i: number, field: number) => Math.round(ghost.frames[i * FIELDS + field]! * PER_METRE);
  const [x0, y0] = [at(0, 0), at(0, 1)];
  if (Math.abs(x0) >= FIRST_OFFSET || Math.abs(y0) >= FIRST_OFFSET) return null;
  let text = REPLAY_VERSION + digits(x0 + FIRST_OFFSET, 4) + digits(y0 + FIRST_OFFSET, 4);
  let [x, y] = [x0, y0];
  for (let i = 0; i < count; i++) {
    const [nx, ny] = [at(i, 0), at(i, 1)];
    const [dx, dy] = [nx - x, ny - y];
    if (Math.abs(dx) > MOST_MOVE || Math.abs(dy) > MOST_MOVE) return null;
    const heading = ghost.frames[i * FIELDS + 2]!;
    const turn = ((Math.round((heading / (Math.PI * 2)) * TURN) % TURN) + TURN) % TURN;
    text += digits(dx + MOST_MOVE + 1, 2) + digits(dy + MOST_MOVE + 1, 2) + digits(turn, 2);
    [x, y] = [nx, ny];
  }
  return text;
}

/**
 * Read a replay of a `time`-second run on `stage` back into a ghost. `ground` gives the height of the road
 * under each place, in order. Null if it is not a replay, or its length does not fit its time.
 */
export function unpackReplay(text: string, stage: string, time: number, ground: (x: number, y: number) => number): Ghost | null {
  if (!Number.isFinite(time) || time <= 0 || time > LONGEST || !replayFits(text, Math.round(time * 1000))) return null;
  let x = number(text, 1, 4) - FIRST_OFFSET;
  let y = number(text, 5, 4) - FIRST_OFFSET;
  const frames: number[] = [];
  for (let at = HEAD; at < text.length; at += MOMENT) {
    x += number(text, at, 2) - MOST_MOVE - 1;
    y += number(text, at + 2, 2) - MOST_MOVE - 1;
    const turn = number(text, at + 4, 2);
    if (turn >= TURN) return null;
    const [px, py] = [x / PER_METRE, y / PER_METRE];
    frames.push(px, py, Math.atan2(Math.sin((turn / TURN) * Math.PI * 2), Math.cos((turn / TURN) * Math.PI * 2)), ground(px, py));
  }
  return { stage, time, frames };
}
