/**
 * The spoken co-driver and the wrong-way warning: when to say each call, which voice to say it in, and
 * when the car is facing back down the road. Pure functions; the speaking itself is in `voice.ts`.
 */
import { NOTES, type Note } from './notes';
import { poseAt, type Stage } from './stage';

export const CODRIVER = {
  /** A call is said this many seconds before the car reaches what it warns of, at the speed it is going. */
  leadSeconds: 3.2,
  /** However slow the car, never closer than this many metres; however fast, never further. */
  nearest: 35,
  farthest: 150,
} as const;

/** How far ahead of a note it is said, in metres, at a road speed in metres per second. */
export function sayFrom(speed: number): number {
  return Math.min(CODRIVER.farthest, Math.max(CODRIVER.nearest, Math.abs(speed) * CODRIVER.leadSeconds));
}

/**
 * The calls due now. `next` is the first call not yet said. A call the car has already gone past is
 * dropped unsaid: late is worse than nothing. Returns the calls to say, in order, and the new `next`.
 */
export function dueCalls(notes: readonly Note[], next: number, progress: number, speed: number): { due: Note[]; next: number } {
  const due: Note[] = [];
  let i = next;
  const reach = sayFrom(speed);
  while (i < notes.length) {
    const note = notes[i]!;
    if (progress > note.at + NOTES.hold) {
      i++;
      continue;
    }
    if (note.at - progress > reach) break;
    due.push(note);
    i++;
  }
  return { due, next: i };
}

/** Calls that come together are said in one breath. */
export function joinCalls(due: readonly Pick<Note, 'say'>[]): string {
  return due.map((note, i) => (i ? note.say.charAt(0).toLowerCase() + note.say.slice(1) : note.say)).join(', into ');
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
} as const;

export interface WrongWay {
  /** Seconds the car has been facing backwards. */
  for: number;
  shown: boolean;
}

export const newWrongWay = (): WrongWay => ({ for: 0, shown: false });

/** How far the car's nose is from the road's direction where it is, in radians: 0 to pi. */
export function angleToRoad(stage: Stage, along: number, heading: number): number {
  const road = poseAt(stage, along).heading;
  return Math.abs(Math.atan2(Math.sin(heading - road), Math.cos(heading - road)));
}

/** Advance the warning. `began` is true on the step it goes up, so it is said once. */
export function stepWrongWay(state: WrongWay, angle: number, dt: number): WrongWay & { began: boolean } {
  if (angle < WRONG_WAY.round) return { for: 0, shown: false, began: false };
  // Between the two angles the car is side-on: the count holds, so a slide does not set it off.
  const time = angle > WRONG_WAY.backwards ? state.for + dt : state.for;
  const shown = state.shown || time > WRONG_WAY.after;
  return { for: time, shown, began: shown && !state.shown };
}
