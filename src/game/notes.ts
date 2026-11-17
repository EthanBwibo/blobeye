/**
 * The co-driver's pace notes: a short call before each corner and each hazard. They are worked out from
 * the stage itself (how the road bends, and what lies on it), so they stay true if the stage changes.
 * Pure functions.
 */
import type { Rock } from './hazards';
import { poseAt, type Stage } from './stage';

export interface Corner {
  /** Where it begins and ends, as distances along the road. */
  from: number;
  to: number;
  turn: 'Left' | 'Right';
  /** 1 is the tightest, 6 is nearly straight. For a corner that tightens, this is how it starts. */
  grade: number;
  change: 'tightens' | 'opens' | 'long' | null;
}

export interface Note {
  /** Where the thing it warns of begins, as a distance along the road. */
  at: number;
  text: string;
}

export const NOTES = {
  /** A call goes up this many metres before what it warns of, and stays this far into it. */
  lead: 85,
  hold: 12,
  /** The road's bend is read every `step` metres, across a stretch `window` metres long. */
  step: 5,
  window: 20,
  /** Less bend than this, in radians per metre, is a straight. */
  straight: 0.0035,
  /** A bend shorter than this is not worth a call. */
  shortest: 30,
  /** A bend longer than this is called in pieces. */
  longest: 170,
  /** Bend, in radians per metre, below which a corner is a 6, a 5, a 4, a 3 and a 2. Tighter than the last is a 1. */
  grades: [0.006, 0.0085, 0.0115, 0.0155, 0.025],
} as const;

const turnBetween = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** How sharply the road bends at a distance along it, in radians per metre. Positive is to the right. */
export function bendAt(stage: Stage, along: number): number {
  const half = NOTES.window / 2;
  return turnBetween(poseAt(stage, along - half).heading, poseAt(stage, along + half).heading) / NOTES.window;
}

/** The grade for a bend: 1 for the tightest, 6 for the gentlest. */
export function gradeOf(bend: number): number {
  const gentler = NOTES.grades.findIndex((limit) => Math.abs(bend) < limit);
  return gentler < 0 ? 1 : 6 - gentler;
}

/** The corners of a stage, in order, between its start and its finish. */
export function corners(stage: Stage): Corner[] {
  const bends: number[] = [];
  for (let d = stage.startAt; d <= stage.finishAt; d += NOTES.step) bends.push(bendAt(stage, d));
  const sideOf = (bend: number) => (Math.abs(bend) < NOTES.straight ? 0 : Math.sign(bend));
  const tightest = (from: number, to: number) => bends.slice(from, Math.max(from + 1, to)).reduce((most, b) => Math.max(most, Math.abs(b)), 0);

  const found: Corner[] = [];
  let i = 0;
  while (i < bends.length) {
    const side = sideOf(bends[i]!);
    let end = i + 1;
    while (end < bends.length && sideOf(bends[end]!) === side) end++;
    const length = (end - i) * NOTES.step;
    if (side !== 0 && length >= NOTES.shortest) {
      // A long bend is called in equal pieces, each with its own grade.
      const pieces = Math.ceil(length / NOTES.longest);
      for (let p = 0; p < pieces; p++) {
        const a = i + Math.round(((end - i) * p) / pieces);
        const b = i + Math.round(((end - i) * (p + 1)) / pieces);
        const middle = (a + b) >> 1;
        const [early, late] = [gradeOf(tightest(a, middle)), gradeOf(tightest(middle, b))];
        const change = late < early ? 'tightens' : late > early ? 'opens' : (b - a) * NOTES.step > 120 ? 'long' : null;
        found.push({ from: stage.startAt + a * NOTES.step, to: stage.startAt + b * NOTES.step, turn: side > 0 ? 'Right' : 'Left', grade: early, change });
      }
    }
    i = end;
  }
  return found;
}

/** Rocks lying close together are one field, and get one call. A gap longer than `NOTES.lead` starts another. */
export function rockFields(rocks: readonly Rock[]): Rock[][] {
  const fields: Rock[][] = [];
  for (const rock of [...rocks].sort((a, b) => a.along - b.along)) {
    const last = fields[fields.length - 1];
    if (last && rock.along - last[last.length - 1]!.along < NOTES.lead) last.push(rock);
    else fields.push([rock]);
  }
  return fields;
}

/** Every call for a stage, in the order they come: its corners, and what lies on the road. */
export function paceNotes(stage: Stage): Note[] {
  const notes: Note[] = corners(stage).map((c) => ({ at: c.from, text: `${c.turn} ${c.grade}${c.change ? `, ${c.change}` : ''}` }));
  const { water, bridge, zebra, crests } = stage.hazards;
  const onStage = (at: number) => at > stage.startAt && at < stage.finishAt;
  for (const rocks of rockFields(stage.hazards.rocks)) {
    const lean = rocks.reduce((sum, rock) => sum + rock.across, 0);
    const at = Math.min(...rocks.map((rock) => rock.along - rock.r));
    if (onStage(at)) notes.push({ at, text: lean > 0 ? 'Rocks on the right, keep left' : 'Rocks on the left, keep right' });
  }
  if (onStage(water.from)) notes.push({ at: water.from, text: 'Water!' });
  if (onStage(bridge.from)) notes.push({ at: bridge.from - bridge.taper, text: 'Narrow bridge' });
  if (zebra.count && onStage(zebra.at)) notes.push({ at: zebra.at - 4, text: 'Caution, zebra!' });
  for (const crest of crests) if (crest.height > 0 && onStage(crest.at)) notes.push({ at: crest.at - crest.reach, text: 'Crest, keep it flat' });
  return notes.sort((a, b) => a.at - b.at);
}

/**
 * The call to show at a distance along the road: the next thing coming, once it is close, and what
 * follows it if that is close too. Null on a quiet stretch.
 */
export function callAt(notes: readonly Note[], progress: number): { now: string; then: string | null } | null {
  const i = notes.findIndex((note) => progress < note.at + NOTES.hold);
  const near = (note: Note | undefined): note is Note => note !== undefined && progress >= note.at - NOTES.lead;
  const [next, after] = [notes[i], notes[i + 1]];
  if (i < 0 || !near(next)) return null;
  return { now: next.text, then: near(after) ? after.text : null };
}
