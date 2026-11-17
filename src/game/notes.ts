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

/** How much care a call asks for: none, or one to three exclamation marks. */
export type Caution = 0 | 1 | 2 | 3;

/** What a call warns of, for the icon on the screen. */
export type Sign =
  | { kind: 'corner'; turn: Corner['turn']; grade: number; change: Corner['change']; caution: Caution }
  | { kind: 'crest' | 'water' | 'bridge' | 'animals'; caution: Caution }
  | { kind: 'rocks'; side: Corner['turn']; caution: Caution };

export interface Note {
  /** Where the thing it warns of begins, as a distance along the road. */
  at: number;
  /** The call as it is written down. */
  text: string;
  /** The call as the co-driver says it. */
  say: string;
  sign: Sign;
}

const NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'] as const;

/** A tight corner asks for care, more so when it tightens. */
export function cornerCaution(grade: number, change: Corner['change']): Caution {
  const tightens = change === 'tightens';
  if (grade <= 1) return tightens ? 3 : 2;
  if (grade === 2) return tightens ? 2 : 1;
  return grade === 3 && tightens ? 1 : 0;
}

/** The note for a corner: "Left 4, tightens", said as "Left four, tightens". */
export function cornerNote(c: Corner): Note {
  const tail = c.change ? `, ${c.change}` : '';
  return {
    at: c.from,
    text: `${c.turn} ${c.grade}${tail}`,
    say: `${c.turn} ${NUMBERS[c.grade] ?? c.grade}${tail}`,
    sign: { kind: 'corner', turn: c.turn, grade: c.grade, change: c.change, caution: cornerCaution(c.grade, c.change) },
  };
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
  const notes: Note[] = corners(stage).map(cornerNote);
  const { water, bridge, zebra, crests } = stage.hazards;
  const onStage = (at: number) => at > stage.startAt && at < stage.finishAt;
  for (const rocks of rockFields(stage.hazards.rocks)) {
    const lean = rocks.reduce((sum, rock) => sum + rock.across, 0);
    const at = Math.min(...rocks.map((rock) => rock.along - rock.r));
    const right = lean > 0;
    if (onStage(at)) {
      notes.push({
        at,
        text: right ? 'Rocks on the right, keep left' : 'Rocks on the left, keep right',
        say: right ? 'Rocks right, keep left' : 'Rocks left, keep right',
        sign: { kind: 'rocks', side: right ? 'Right' : 'Left', caution: 2 },
      });
    }
  }
  if (onStage(water.from)) notes.push({ at: water.from, text: 'Water!', say: 'Caution, water', sign: { kind: 'water', caution: 1 } });
  if (onStage(bridge.from)) notes.push({ at: bridge.from - bridge.taper, text: 'Narrow bridge', say: 'Narrow bridge, keep middle', sign: { kind: 'bridge', caution: 2 } });
  if (zebra.count && onStage(zebra.at)) notes.push({ at: zebra.at - 4, text: 'Caution, zebra!', say: 'Caution, zebra', sign: { kind: 'animals', caution: 3 } });
  for (const crest of crests) if (crest.height > 0 && onStage(crest.at)) notes.push({ at: crest.at - crest.reach, text: 'Crest, keep it flat', say: 'Over crest, keep it flat', sign: { kind: 'crest', caution: 1 } });
  return notes.sort((a, b) => a.at - b.at);
}

/**
 * The call to show at a distance along the road: the next thing coming, once it is close, and what
 * follows it if that is close too. Null on a quiet stretch.
 */
export function callAt(notes: readonly Note[], progress: number): { now: string; then: string | null } | null {
  const shown = shownAt(notes, progress);
  return shown && { now: notes[shown.now]!.text, then: shown.then === null ? null : notes[shown.then]!.text };
}

/** The same as `callAt`, as places in `notes`, for drawing their icons. */
export function shownAt(notes: readonly Pick<Note, 'at'>[], progress: number): { now: number; then: number | null } | null {
  const i = notes.findIndex((note) => progress < note.at + NOTES.hold);
  const near = (note: Pick<Note, 'at'> | undefined) => note !== undefined && progress >= note.at - NOTES.lead;
  if (i < 0 || !near(notes[i])) return null;
  return { now: i, then: near(notes[i + 1]) ? i + 1 : null };
}
