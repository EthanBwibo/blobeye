import { describe, expect, it } from 'vitest';
import { HAZARDS, NO_HAZARDS } from './hazards';
import { NOTES, bendAt, callAt, corners, gradeOf, paceNotes, type Note } from './notes';
import { buildStage, type Spot } from './stage';

const stage = buildStage();
const bare = buildStage(undefined, undefined, undefined, NO_HAZARDS);
const CORNER = /^(Left|Right) [1-6](, (tightens|opens|long))?$/;

describe('reading the road', () => {
  it('grades a bend from 1, the tightest, to 6', () => {
    expect(gradeOf(0.004)).toBe(6);
    expect(gradeOf(-0.004)).toBe(6);
    expect(gradeOf(0.01)).toBe(4);
    expect(gradeOf(0.02)).toBe(2);
    expect(gradeOf(-0.05)).toBe(1);
  });

  it('tells left from right', () => {
    // East, then south on the page: y grows, which is a turn to the right. And the other way.
    const right: Spot[] = [[0, 0], [150, 0], [300, 0], [380, 60], [400, 150], [400, 300], [400, 450]];
    const left = right.map(([x, y]) => [x, -y] as Spot);
    const [r, l] = [buildStage(right, 1, 4, NO_HAZARDS), buildStage(left, 1, 4, NO_HAZARDS)];
    expect(bendAt(r, 340)).toBeGreaterThan(NOTES.straight);
    expect(bendAt(l, 340)).toBeLessThan(-NOTES.straight);
    expect(bendAt(r, 80)).toBeCloseTo(0, 3);
    expect(new Set(corners(r).map((c) => c.turn))).toEqual(new Set(['Right']));
    expect(new Set(corners(l).map((c) => c.turn))).toEqual(new Set(['Left']));
    // The bend is found where it is: after the first straight, and over before the last one ends.
    const found = corners(r);
    expect(found[0]!.from).toBeGreaterThan(200);
    expect(found[found.length - 1]!.to).toBeLessThan(r.finishAt - 100);
    for (const note of paceNotes(r)) expect(note.text).toMatch(/^Right [1-6]/);
    // A mirrored road gets the same calls, mirrored.
    expect(paceNotes(l).map((n) => n.text)).toEqual(paceNotes(r).map((n) => n.text.replace('Right', 'Left')));
  });

  it('finds the corners of the stage in order, without overlap', () => {
    const found = corners(stage);
    expect(found.length).toBeGreaterThan(8);
    found.forEach((corner, i) => {
      expect(corner.to).toBeGreaterThan(corner.from);
      expect(corner.to - corner.from).toBeLessThanOrEqual(NOTES.longest + NOTES.step);
      expect(corner.grade).toBeGreaterThanOrEqual(1);
      expect(corner.grade).toBeLessThanOrEqual(6);
      if (i) expect(corner.from).toBeGreaterThanOrEqual(found[i - 1]!.to);
    });
    expect(new Set(found.map((c) => c.turn))).toEqual(new Set(['Left', 'Right']));
    // The stage has corners that tighten, and it has easy ones and hard ones.
    expect(found.some((c) => c.change === 'tightens')).toBe(true);
    expect(Math.min(...found.map((c) => c.grade))).toBeLessThanOrEqual(3);
    expect(Math.max(...found.map((c) => c.grade))).toBeGreaterThanOrEqual(5);
  });

  it('calls a corner by how it starts when it tightens', () => {
    for (const corner of corners(stage)) {
      const half = (corner.from + corner.to) / 2;
      const tightest = (from: number, to: number) => {
        let most = 0;
        for (let d = from; d < to; d += NOTES.step) most = Math.max(most, Math.abs(bendAt(stage, d)));
        return gradeOf(most);
      };
      if (corner.change === 'tightens') expect(tightest(half, corner.to)).toBeLessThan(corner.grade);
      if (corner.change === 'opens') expect(tightest(half, corner.to)).toBeGreaterThan(corner.grade);
    }
  });
});

describe('the pace notes', () => {
  const notes = paceNotes(stage);
  const texts = notes.map((n) => n.text);

  it('call every hazard, each before it is reached', () => {
    const { rocks, water, bridge, zebra, crest } = HAZARDS;
    const at = (text: string) => notes.find((n) => n.text === text)!.at;
    expect(at('Water!')).toBe(water.from);
    expect(at('Crest, keep it flat')).toBe(crest.at - crest.reach);
    expect(at('Narrow bridge')).toBe(bridge.from - bridge.taper);
    expect(at('Caution, zebra!')).toBeLessThan(zebra.at);
    // The rocks are on the right, so the way past is on the left.
    expect(at('Rocks on the right, keep left')).toBeLessThan(Math.min(...rocks.map((r) => r.along)));
  });

  it('say which side the rocks are on', () => {
    const mirrored = buildStage(undefined, undefined, undefined, { ...HAZARDS, rocks: HAZARDS.rocks.map((r) => ({ ...r, across: -r.across })) });
    expect(paceNotes(mirrored).map((n) => n.text)).toContain('Rocks on the left, keep right');
  });

  it('are in the order they come, and everything else is a corner', () => {
    expect(notes.map((n) => n.at)).toEqual([...notes.map((n) => n.at)].sort((a, b) => a - b));
    const hazards = ['Water!', 'Crest, keep it flat', 'Narrow bridge', 'Caution, zebra!', 'Rocks on the right, keep left'];
    for (const text of texts) if (!hazards.includes(text)) expect(text).toMatch(CORNER);
    expect(texts.filter((t) => hazards.includes(t))).toHaveLength(5);
  });

  it('have nothing but corners to call on a bare stage', () => {
    const plain = paceNotes(bare).map((n) => n.text);
    expect(plain.length).toBe(corners(bare).length);
    for (const text of plain) expect(text).toMatch(CORNER);
  });
});

describe('the call on the screen', () => {
  const notes: Note[] = [
    { at: 200, text: 'Left 4' },
    { at: 240, text: 'Water!' },
    { at: 600, text: 'Right 3' },
  ];

  it('is quiet until the next thing is close', () => {
    expect(callAt(notes, 0)).toBeNull();
    expect(callAt(notes, 200 - NOTES.lead - 1)).toBeNull();
    expect(callAt(notes, 400)).toBeNull();
    expect(callAt([], 100)).toBeNull();
  });

  it('goes up before the corner and stays a moment into it', () => {
    expect(callAt(notes, 200 - NOTES.lead)?.now).toBe('Left 4');
    expect(callAt(notes, 200 + NOTES.hold - 1)?.now).toBe('Left 4');
    expect(callAt(notes, 200 + NOTES.hold)?.now).toBe('Water!');
  });

  it('adds what follows when that is close too', () => {
    expect(callAt(notes, 120)).toEqual({ now: 'Left 4', then: null });
    expect(callAt(notes, 180)).toEqual({ now: 'Left 4', then: 'Water!' });
    expect(callAt(notes, 230)).toEqual({ now: 'Water!', then: null });
    expect(callAt(notes, 560)).toEqual({ now: 'Right 3', then: null });
  });

  it('has nothing left to say after the last one', () => {
    expect(callAt(notes, 600 + NOTES.hold)).toBeNull();
  });

  it('gives every call on the stage its turn', () => {
    const all = paceNotes(stage);
    const shown = new Set<string>();
    for (let d = stage.startAt; d < stage.finishAt; d += 1) {
      const call = callAt(all, d);
      if (call) shown.add(call.now);
    }
    for (const note of all) expect(shown.has(note.text)).toBe(true);
  });
});
