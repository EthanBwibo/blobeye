/**
 * The spoken co-driver and the wrong-way warning: when to say each call, which voice to say it in, and
 * when the car is facing back down the road. Pure functions; the speaking itself is in `voice.ts`.
 */
import type { Note } from './notes';
import { poseAt, type Stage } from './stage';

export const CODRIVER = {
  /** A call is said this many seconds before the car reaches what it warns of, at the speed it is going. */
  leadSeconds: 2.5,
  /** However slow the car, never closer than this many metres; however fast, never further. */
  nearest: 30,
  farthest: 220,
  /** A call that would start with the car less than this many seconds from what it warns of is too late to say. */
  latest: 0.6,
  /** The voice's start delay assumed until one has been measured, and the most it is ever taken to be, in seconds. */
  delay: 0.3,
  maxDelay: 1.5,
} as const;

/**
 * How far ahead of a note it is said, in metres, at a road speed in metres per second: the lead time plus
 * the voice's measured start delay, so the words begin `leadSeconds` before the corner, not later.
 */
export function sayFrom(speed: number, delay: number = CODRIVER.delay): number {
  const ahead = CODRIVER.leadSeconds + Math.min(CODRIVER.maxDelay, Math.max(0, delay));
  return Math.min(CODRIVER.farthest, Math.max(CODRIVER.nearest, Math.abs(speed) * ahead));
}

/**
 * Whether a call for something at `at` is too late to be any use if it starts `delay` seconds from now:
 * the car would be at it, or nearly, before the first word.
 */
export function isStale(at: number, progress: number, speed: number, delay: number = 0): boolean {
  const left = at - progress;
  return left <= 0 || left < Math.abs(speed) * (Math.max(0, delay) + CODRIVER.latest);
}

/**
 * The calls due now. `next` is the first call not yet said. A call that would be stale by the time the
 * voice starts it is dropped unsaid: late is worse than nothing. Returns the calls to say, in order, and the new `next`.
 */
export function dueCalls(notes: readonly Note[], next: number, progress: number, speed: number, delay: number = CODRIVER.delay): { due: Note[]; next: number } {
  const due: Note[] = [];
  let i = next;
  const reach = sayFrom(speed, delay);
  while (i < notes.length) {
    const note = notes[i]!;
    if (isStale(note.at, progress, speed, delay)) {
      i++;
      continue;
    }
    if (note.at - progress > reach) break;
    due.push(note);
    i++;
  }
  return { due, next: i };
}

/** The voice's start delay after one more measurement, in seconds: a running average, within limits. */
export function measureDelay(was: number, measured: number): number {
  const seen = Math.min(CODRIVER.maxDelay, Math.max(0, measured));
  return was + (seen - was) * 0.3;
}

/** Calls that come together are said in one breath. */
export function joinCalls(due: readonly Pick<Note, 'say'>[]): string {
  return due.map((note, i) => (i ? note.say.charAt(0).toLowerCase() + note.say.slice(1) : note.say)).join(' into ');
}

/** The voice to use: an English one, British first, then the other Commonwealth ones, then American. */
export function pickVoice<V extends { lang: string; default?: boolean; localService?: boolean }>(voices: readonly V[]): V | null {
  const rank = (lang: string): number => {
    const tag = lang.replace('_', '-').toLowerCase();
    if (!tag.startsWith('en')) return Infinity;
    if (tag === 'en-gb') return 0;
    if (['en-au', 'en-nz', 'en-ie', 'en-za', 'en-ke'].includes(tag)) return 1;
    if (tag === 'en-us') return 2;
    return 3;
  };
  let best: V | null = null;
  let bestScore = Infinity;
  for (const voice of voices) {
    // Within a language, a voice on the device answers at once; a network one can lag behind the car.
    const score = rank(voice.lang) * 4 + (voice.localService === false ? 2 : 0) + (voice.default ? 0 : 1);
    if (score < bestScore) [best, bestScore] = [voice, score];
  }
  return best;
}

export const WRONG_WAY = {
  /** Facing more than this far from the road's direction is facing back down it. */
  backwards: (110 * Math.PI) / 180,
  /** Turned this far back round, the warning clears. */
  round: (80 * Math.PI) / 180,
  /** Seconds facing backwards before the warning shows. */
  after: 1,
  /** While it stays up, the co-driver calls again this often, in seconds, going round these lines. */
  repeat: 4,
  lines: ['Wrong way!', 'Turn around!', 'Geuza!'],
} as const;

export interface WrongWay {
  /** Seconds the car has been facing backwards. */
  for: number;
  shown: boolean;
  /** How many calls have been made since it went up, and the seconds since the last. */
  said: number;
  since: number;
}

export const newWrongWay = (): WrongWay => ({ for: 0, shown: false, said: 0, since: 0 });

/** How far the car's nose is from the road's direction where it is, in radians: 0 to pi. */
export function angleToRoad(stage: Stage, along: number, heading: number): number {
  const road = poseAt(stage, along).heading;
  return Math.abs(Math.atan2(Math.sin(heading - road), Math.cos(heading - road)));
}

/**
 * Advance the warning. `began` is true on the step it goes up, `cleared` on the step it comes down, and `call`
 * is the line to say on this step, if any: one as it goes up, then the next of `WRONG_WAY.lines` every
 * `WRONG_WAY.repeat` seconds for as long as it stays up.
 */
export function stepWrongWay(state: WrongWay, angle: number, dt: number): WrongWay & { began: boolean; cleared: boolean; call: string | null } {
  if (angle < WRONG_WAY.round) return { ...newWrongWay(), began: false, cleared: state.shown, call: null };
  // Between the two angles the car is side-on: the count holds, so a slide does not set it off.
  const time = angle > WRONG_WAY.backwards ? state.for + dt : state.for;
  const shown = state.shown || time > WRONG_WAY.after;
  const began = shown && !state.shown;
  if (!shown) return { for: time, shown, said: 0, since: 0, began, cleared: false, call: null };
  const since = began ? WRONG_WAY.repeat : state.since + dt;
  if (since < WRONG_WAY.repeat - 1e-6) return { for: time, shown, said: state.said, since, began, cleared: false, call: null };
  const call = WRONG_WAY.lines[state.said % WRONG_WAY.lines.length]!;
  // The remainder is carried over, so the calls keep to the beat whatever the step.
  return { for: time, shown, said: state.said + 1, since: Math.max(0, since - WRONG_WAY.repeat), began, cleared: false, call };
}

/** The co-driver asks for the lights this long into the count, so the call is not lost in the cut to the stage. */
export const LIGHTS_CALL_AFTER = 0.5;

/** Whether to call "Lights!": on a night run, with them off, once, early in the count. */
export function wantsLights(dark: boolean, lightsOn: boolean, alreadyAsked: boolean, waited: number): boolean {
  return dark && !lightsOn && !alreadyAsked && waited >= LIGHTS_CALL_AFTER;
}
