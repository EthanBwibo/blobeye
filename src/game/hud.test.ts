import { describe, expect, it } from 'vitest';
import { CODRIVER, WRONG_WAY, angleToRoad, dueCalls, isStale, joinCalls, measureDelay, newWrongWay, pickVoice, sayFrom, stepWrongWay } from './codriver';
import { engineRpm, gearFor } from './handling';
import { REV_METER, kmh, needleAngle, revMeterSvg } from './instruments';
import { fitMap, minimapSvg } from './minimap';
import { NOTES, cornerCaution, cornerNote, paceNotes, shownAt, type Note } from './notes';
import { ARROW_TURN, arrowPath, caption, cautionSvg, cornerTone, signSvg, tone } from './paceIcons';
import { sectorGap, sectorTimes } from './splits';
import { buildStage, poseAt } from './stage';

const stage = buildStage();
const notes = paceNotes(stage);

describe('pace-note signs', () => {
  it('give every call an icon kind and a line to say', () => {
    const kinds = new Set(notes.map((n) => n.sign.kind));
    expect(kinds).toEqual(new Set(['corner', 'crest', 'water', 'bridge', 'rocks', 'animals', 'mud', 'branch']));
    for (const note of notes) expect(note.say.length).toBeGreaterThan(3);
  });

  it('say corners in words: "Left four, tightens"', () => {
    const c = cornerNote({ from: 100, to: 160, turn: 'Left', grade: 4, change: 'tightens' });
    expect(c.say).toBe('Left four, tightens');
    expect(c.text).toBe('Left 4, tightens');
    expect(c.sign).toMatchObject({ kind: 'corner', turn: 'Left', grade: 4, change: 'tightens' });
  });

  it('say the hazards the way a co-driver would', () => {
    const said = notes.map((n) => n.say);
    expect(said).toContain('Over crest');
    expect(said).toContain('Water!');
    expect(said).toContain('Mud!');
    expect(said).toContain('Branch, keep right');
    // Every animal has the one icon, so the call names it.
    expect(said).toContain('Zebra!');
    expect(said).toContain('Giraffe crossing!');
    // Short enough to be over before the car is there.
    for (const line of said) expect(line.split(' ').length).toBeLessThanOrEqual(4);
  });

  it('ask for more care on tighter corners, and most when they tighten', () => {
    expect(cornerCaution(5, null)).toBe(0);
    expect(cornerCaution(2, null)).toBe(1);
    expect(cornerCaution(1, null)).toBe(2);
    expect(cornerCaution(1, 'tightens')).toBe(3);
  });

  it('finds the places in the list for the icons, the same as the written call', () => {
    expect(shownAt(notes, stage.startAt - 500)).toBeNull();
    const first = notes[0]!;
    expect(shownAt(notes, first.at - NOTES.lead)?.now).toBe(0);
  });
});

describe('pace-note icons', () => {
  it('draw a tighter arrow for a lower grade', () => {
    for (let g = 1; g < 6; g++) expect(ARROW_TURN[g]).toBeGreaterThan(ARROW_TURN[g + 1]!);
    // The arrow for a hairpin comes back down the way it went up; a six barely bends.
    expect(arrowPath(ARROW_TURN[1]).end[1]).toBeGreaterThan(arrowPath(ARROW_TURN[6]).end[1]);
  });

  it('stay inside the icon', () => {
    for (let g = 1; g <= 6; g++) {
      const coords = arrowPath(ARROW_TURN[g]!).line.match(/-?\d+(\.\d+)?/g)!.map(Number);
      for (const v of coords) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('mirror the arrow for a left and keep the number readable', () => {
    const left = signSvg({ kind: 'corner', turn: 'Left', grade: 3, change: null, caution: 0 });
    const right = signSvg({ kind: 'corner', turn: 'Right', grade: 3, change: null, caution: 0 });
    expect(left).toContain('matrix(-1 0 0 1 100 0)');
    expect(right).not.toContain('matrix(');
    expect(left).toMatch(/<text[^>]*>3<\/text>/);
  });

  it('have one for every hazard, as inline SVG', () => {
    for (const kind of ['crest', 'water', 'bridge', 'animals', 'sand', 'mud', 'washout', 'grid'] as const) expect(signSvg({ kind, caution: 1 })).toMatch(/^<svg[^>]*viewBox="0 0 100 100"[^]*<\/svg>$/);
    expect(signSvg({ kind: 'rocks', side: 'Right', caution: 2 })).toContain('<path');
    expect(signSvg({ kind: 'branch', side: 'Left', caution: 2 })).toContain('<path');
    // Every animal shares the one antelope icon; its name goes under it.
    const animals = (['zebra', 'giraffe', 'warthog', 'ostrich', 'flamingo'] as const).map((animal) => signSvg({ kind: 'animals', animal, caution: 1 }));
    expect(new Set(animals).size).toBe(1);
    expect(caption({ kind: 'animals', animal: 'warthog', caution: 2 })).toBe('Warthogs');
    expect(caption({ kind: 'animals', caution: 2 })).toBe('Zebra');
    expect(caption({ kind: 'branch', side: 'Right', caution: 2 })).toBe('Branch · keep left');
  });

  it('colour a corner by how tight it is, the arrow and its number alike', () => {
    expect([1, 2, 3, 4, 5, 6].map(cornerTone)).toEqual(['red', 'red', 'amber', 'amber', 'green', 'green']);
    for (const grade of [1, 3, 6]) {
      const svg = signSvg({ kind: 'corner', turn: 'Right', grade, change: null, caution: 0 });
      // One colour for the whole icon: arrow and number both draw in currentColor, and nothing sets another.
      expect(svg).toContain(`class="sign ${cornerTone(grade)}"`);
      expect(svg).not.toMatch(/(fill|stroke)="(?!currentColor|none)/);
    }
  });

  it('draw every hazard in the one warning style, with rounded lines and no box', () => {
    const hazards = [
      { kind: 'crest', caution: 1 },
      { kind: 'mud', caution: 2 },
      { kind: 'animals', animal: 'giraffe', caution: 3 },
      { kind: 'rocks', side: 'Left', caution: 2 },
    ] as const;
    for (const sign of hazards) {
      expect(tone(sign)).toBe('hazard');
      const svg = signSvg(sign);
      expect(svg).toContain('class="sign hazard"');
      expect(svg).toContain('stroke-linecap="round" stroke-linejoin="round"');
      expect(svg).not.toContain('<rect');
    }
    expect(cautionSvg(2, 'red')).toContain('class="caution red"');
    expect(cautionSvg(2)).toContain('class="caution hazard"');
  });

  it('show caution as one, two or three exclamation marks', () => {
    expect(cautionSvg(0)).toBe('');
    expect(cautionSvg(1)).toContain('>!<');
    expect(cautionSvg(2)).toContain('>!!<');
    expect(cautionSvg(3)).toContain('>!!!<');
  });

  it('carry a short caption', () => {
    expect(caption({ kind: 'corner', turn: 'Left', grade: 2, change: 'opens', caution: 1 })).toBe('opens');
    expect(caption({ kind: 'rocks', side: 'Right', caution: 2 })).toBe('Rocks · keep left');
  });
});

describe('the spoken co-driver', () => {
  const note = (at: number, say: string): Note => ({ at, say, text: say, sign: { kind: 'water', caution: 1 } });
  const list = [note(200, 'Left four'), note(230, 'Caution, water'), note(600, 'Right three')];

  it('speaks a set time before the corner, the faster the car the further out, within limits', () => {
    expect(CODRIVER.leadSeconds).toBe(2.5);
    expect(sayFrom(0)).toBe(CODRIVER.nearest);
    expect(sayFrom(20, 0)).toBeCloseTo(20 * 2.5);
    expect(sayFrom(200)).toBe(CODRIVER.farthest);
    expect(sayFrom(-20)).toBe(sayFrom(20));
  });

  it("allows for the voice's own start delay", () => {
    expect(sayFrom(20, 0.8)).toBeCloseTo(20 * (2.5 + 0.8));
    expect(sayFrom(20, 0.8)).toBeGreaterThan(sayFrom(20, 0.1));
    // A wild measurement is held to the limit.
    expect(sayFrom(20, 10)).toBeCloseTo(20 * (2.5 + CODRIVER.maxDelay));
  });

  it('measures the start delay as a running average, within limits', () => {
    let delay: number = CODRIVER.delay;
    for (let i = 0; i < 30; i++) delay = measureDelay(delay, 0.9);
    expect(delay).toBeCloseTo(0.9, 2);
    expect(measureDelay(0.3, 50)).toBeLessThanOrEqual(CODRIVER.maxDelay);
    expect(measureDelay(0.3, -1)).toBeGreaterThanOrEqual(0);
  });

  it('counts a call stale once the car would be at it before the words start', () => {
    expect(isStale(100, 101, 20)).toBe(true);
    expect(isStale(100, 100, 0)).toBe(true);
    expect(isStale(100, 40, 20)).toBe(false);
    // 30 m out at 20 m/s is 1.5 s: fine with a quick voice, too late with a slow one.
    expect(isStale(100, 70, 20, 0.2)).toBe(false);
    expect(isStale(100, 70, 20, 1.2)).toBe(true);
  });

  it('says each call once, when it is due', () => {
    expect(dueCalls(list, 0, 100, 10)).toEqual({ due: [], next: 0 });
    expect(dueCalls(list, 0, 200 - sayFrom(10) - 1, 10).due).toEqual([]);
    const first = dueCalls(list, 0, 200 - sayFrom(10), 10);
    expect(first.due.map((n) => n.say)).toEqual(['Left four']);
    expect(dueCalls(list, first.next, 200 - sayFrom(10), 10).due).toEqual([]);
  });

  it('runs calls that come together into one line', () => {
    const both = dueCalls(list, 0, 180, 20);
    expect(both.due).toHaveLength(2);
    expect(joinCalls(both.due)).toBe('Left four into caution, water');
  });

  it('drops a call that would be stale by the time it is said, instead of saying it late', () => {
    const late = dueCalls(list, 0, 231, 10);
    expect(late.due).toEqual([]);
    expect(late.next).toBe(2);
    // Too close to say in time, though not yet reached: the next one is said on its own.
    const close = dueCalls(list, 0, 196, 20, 0.3);
    expect(close.due.map((n) => n.say)).toEqual(['Caution, water']);
  });

  it('says every call on the stage in a run at a steady pace, in order', () => {
    let next = 0;
    const said: Note[] = [];
    for (let d = stage.startAt; d < stage.finishAt; d += 0.5) {
      const calls = dueCalls(notes, next, d, 25);
      next = calls.next;
      said.push(...calls.due);
      for (const call of calls.due) expect(call.at - d).toBeGreaterThan(0);
    }
    expect(said).toEqual(notes);
  });

  it('picks an English voice, British first', () => {
    const voices = [
      { lang: 'fr-FR', default: true },
      { lang: 'en-US', localService: true },
      { lang: 'en-GB', localService: true },
    ];
    expect(pickVoice(voices)?.lang).toBe('en-GB');
    expect(pickVoice([{ lang: 'en-US' }, { lang: 'en_AU' }])?.lang).toBe('en_AU');
    expect(pickVoice([{ lang: 'de-DE' }])).toBeNull();
    expect(pickVoice([])).toBeNull();
  });
});

describe('wrong way', () => {
  const along = 300;
  const road = poseAt(stage, along).heading;

  it('measures how far the nose is from the road', () => {
    expect(angleToRoad(stage, along, road)).toBeCloseTo(0);
    expect(angleToRoad(stage, along, road + Math.PI)).toBeCloseTo(Math.PI);
    expect(angleToRoad(stage, along, road - Math.PI / 2)).toBeCloseTo(Math.PI / 2);
  });

  it('goes up after more than a second facing backwards, once', () => {
    let state = newWrongWay();
    let began = 0;
    for (let t = 0; t < WRONG_WAY.after - 0.05; t += 0.1) state = stepWrongWay(state, Math.PI, 0.1);
    expect(state.shown).toBe(false);
    for (let t = 0; t < 1; t += 0.1) {
      const next = stepWrongWay(state, Math.PI, 0.1);
      if (next.began) began++;
      state = next;
    }
    expect(state.shown).toBe(true);
    expect(began).toBe(1);
  });

  it('clears once the car turns round', () => {
    const up = { for: 2, shown: true };
    expect(stepWrongWay(up, (100 * Math.PI) / 180, 0.1).shown).toBe(true);
    expect(stepWrongWay(up, 0.2, 0.1)).toEqual({ for: 0, shown: false, began: false });
  });

  it('is not set off by a slide side-on', () => {
    let state = newWrongWay();
    for (let t = 0; t < 5; t += 0.1) state = stepWrongWay(state, Math.PI / 2, 0.1);
    expect(state.shown).toBe(false);
  });
});

describe('instruments', () => {
  it('sweep the needle from one end of the dial to the other', () => {
    expect(needleAngle(0)).toBe(-REV_METER.sweep);
    expect(needleAngle(REV_METER.max)).toBe(REV_METER.sweep);
    expect(needleAngle(REV_METER.max * 2)).toBe(REV_METER.sweep);
    expect(needleAngle(REV_METER.max / 2)).toBeCloseTo(0);
  });

  it('put the redline below the top of the dial, and the engine can reach it', () => {
    expect(REV_METER.redline).toBeLessThan(REV_METER.max);
    expect(engineRpm(20.9)).toBeGreaterThan(REV_METER.redline);
    expect(revMeterSvg()).toContain('class="red"');
    expect(revMeterSvg()).toContain('data-needle');
  });

  it('show the speed in km/h and the gear the revs are in', () => {
    expect(kmh(10)).toBe(36);
    expect(kmh(-10)).toBe(36);
    expect(gearFor(0)).toBe(1);
    expect(gearFor(-3)).toBe('R');
    expect(gearFor(25)).toBe(3);
    expect(gearFor(99)).toBe(5);
    // Up a gear, the revs drop.
    expect(engineRpm(13.5)).toBeLessThan(engineRpm(12.5));
    expect(gearFor(13.5)).toBe(2);
  });
});

describe('sectors', () => {
  it('split a run into the time in each sector', () => {
    expect(sectorTimes([15, 32, 50])).toEqual([15, 17, 18]);
    expect(sectorTimes([15, 32, 50], 66)).toEqual([15, 17, 18, 16]);
    expect(sectorTimes([])).toEqual([]);
  });

  it('compare a sector with the same one of the best run', () => {
    const best = { time: 66, splits: [15, 32, 50] };
    expect(sectorGap(best, 1, 16)).toBeCloseTo(-1);
    expect(sectorGap(best, 3, 17)).toBeCloseTo(1);
    expect(sectorGap(null, 0, 15)).toBeNull();
  });
});

describe('the minimap', () => {
  it('fits the stage inside the map, keeping its shape', () => {
    const project = fitMap(stage.points, 170, 12);
    for (const [x, y] of stage.points) {
      const [mx, my] = project(x, y);
      expect(mx).toBeGreaterThanOrEqual(12 - 1e-6);
      expect(mx).toBeLessThanOrEqual(158 + 1e-6);
      expect(my).toBeGreaterThanOrEqual(12 - 1e-6);
      expect(my).toBeLessThanOrEqual(158 + 1e-6);
    }
    const [a, b] = [project(0, 0), project(10, 0)];
    const [c] = [project(0, 10)];
    expect(b[0] - a[0]).toBeCloseTo(c[1] - a[1]);
  });

  it('marks every sector boundary, the start, the finish and the car', () => {
    const { svg } = minimapSvg(stage);
    expect(svg.match(/class="gate"/g)).toHaveLength(stage.checkpoints.length);
    expect(svg).toContain('class="start"');
    expect(svg).toContain('class="finish"');
    expect(svg).toContain('data-car');
  });
});
