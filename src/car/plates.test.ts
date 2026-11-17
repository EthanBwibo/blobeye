import { describe, expect, it } from 'vitest';
import { HEADLAMP_OUTLINE, PARTS, SIDE_TOP, TAIL_LAMP_OUTLINE, frontAngle, lerpAt, topHalfWidth, wingArch, wrapPoint } from './model';
import { PLATES, PLATE_WORDS, pickPlate } from './plates';

/** Whether a point is inside a closed outline. */
const within = (outline: readonly (readonly [number, number])[], x: number, y: number): boolean => {
  let hit = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, yi] = outline[i]!;
    const [xj, yj] = outline[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};
/** Whether a round shape is wholly inside an outline: its middle and eight points round its edge. */
const fits = (outline: readonly (readonly [number, number])[], x: number, y: number, rx: number, ry = rx): boolean =>
  within(outline, x, y) && Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2).every((a) => within(outline, x + Math.cos(a) * rx, y + Math.sin(a) * ry));
const span = (outline: readonly (readonly [number, number])[], i: 0 | 1) => Math.max(...outline.map((p) => p[i])) - Math.min(...outline.map((p) => p[i]));

describe('headlamps', () => {
  const { headlamp, grille } = PARTS;
  it('are traced as closed curves of about twenty points', () => {
    for (const outline of [HEADLAMP_OUTLINE, TAIL_LAMP_OUTLINE]) {
      expect(outline.length).toBeGreaterThanOrEqual(18);
      expect(outline.length).toBeLessThanOrEqual(30);
    }
  });
  it('are large and rounded, not slits: well over half as tall as they are wide, seen from ahead', () => {
    expect(span(HEADLAMP_OUTLINE, 0)).toBeGreaterThan(6);
    expect(span(HEADLAMP_OUTLINE, 1)).toBeGreaterThan(4);
    expect(span(HEADLAMP_OUTLINE, 1) / span(HEADLAMP_OUTLINE, 0)).toBeGreaterThan(0.5);
  });
  it('keep the lamps and the reflector inside the lens, clear of each other', () => {
    const [main, projector] = headlamp.lamps;
    for (const [x, y, r] of headlamp.lamps) expect(fits(HEADLAMP_OUTLINE, x, y, r * 1.15)).toBe(true);
    expect(Math.hypot(main[0] - projector[0], main[1] - projector[1])).toBeGreaterThan((main[2] + projector[2]) * 1.15);
    const { reflector } = headlamp;
    expect(fits(HEADLAMP_OUTLINE, reflector.x, reflector.y, reflector.halfWidth, reflector.halfHeight)).toBe(true);
    expect(reflector.x - reflector.halfWidth).toBeGreaterThan(main[0] + main[2] * 1.15);
    expect(headlamp.projector).toBeLessThan(1);
  });
  it('land on the body where the front view puts them, clear of the grille', () => {
    for (const [x, y] of HEADLAMP_OUTLINE) expect(Math.abs(wrapPoint(1, (frontAngle(1, x, y) * Math.PI) / 180, y)[0])).toBeCloseTo(x, 1);
    const inner = Math.min(...HEADLAMP_OUTLINE.map(([x, y]) => frontAngle(1, x, y)));
    expect(inner).toBeGreaterThan(grille.topHalf);
  });
});

describe('tail lamps', () => {
  const { tailLamp } = PARTS;
  it('keep the round lamp and the clear strip inside the lens, clear of each other', () => {
    const { strip } = tailLamp;
    for (const [x, y, r] of tailLamp.lamps) {
      expect(fits(TAIL_LAMP_OUTLINE, x, y, r * 1.25)).toBe(true);
      expect(y + r * 1.25).toBeLessThan(strip.y - strip.halfHeight);
    }
    expect(fits(TAIL_LAMP_OUTLINE, strip.x, strip.y, strip.halfWidth, strip.halfHeight)).toBe(true);
  });
  it('land on the body where the rear view puts them', () => {
    for (const [x, y] of TAIL_LAMP_OUTLINE) expect(Math.abs(wrapPoint(-1, (frontAngle(-1, x, y) * Math.PI) / 180, y)[0])).toBeCloseTo(x, 1);
  });
});

describe('rear wing', () => {
  const { wing } = PARTS;
  it('is bowed: highest in the middle, level with its ends at the plates, the same on both sides', () => {
    expect(wingArch(0)).toBe(wing.arch);
    expect(wingArch(wing.halfWidth)).toBe(0);
    expect(wingArch(-5)).toBe(wingArch(5));
    expect(wingArch(4)).toBeGreaterThan(wingArch(9));
    expect(wingArch(99)).toBe(0);
  });
  it('sits low and close to the boot, with daylight still under the plank and under the end plates', () => {
    const deck = Math.max(lerpAt(SIDE_TOP, wing.front), lerpAt(SIDE_TOP, wing.rear));
    expect(wing.under - deck).toBeGreaterThan(2);
    expect(wing.under - deck).toBeLessThan(4);
    expect(wing.under - wing.endPlate.below - deck).toBeGreaterThan(1);
  });
  it('is curved: the trailing edge curls up, and the profile fits under its top', () => {
    expect(wing.camber).toBeGreaterThan(0.5);
    expect(wing.under + wing.thick / 2 + wing.camber).toBeLessThan(wing.top);
  });
  it('has short slim uprights out at the boot edges, inside the end plates', () => {
    const z = (wing.strut.baseFront + wing.strut.baseRear) / 2;
    expect(wing.strut.halfThick * 2).toBeLessThan(0.5);
    expect(wing.upright).toBeGreaterThan(topHalfWidth(z) - 2.5);
    expect(wing.upright + wing.strut.halfThick).toBeLessThan(wing.halfWidth);
  });
  it('has end plates that sweep back as they rise', () => {
    expect(wing.endPlate.sweep).toBeGreaterThan(1);
  });
});

describe('number plates', () => {
  it('carry one of the ten words, each as likely as the others', () => {
    expect(PLATE_WORDS).toHaveLength(10);
    expect(new Set(PLATE_WORDS).size).toBe(10);
    PLATE_WORDS.forEach((word, i) => expect(pickPlate((i + 0.5) / 10)).toBe(word));
  });
  it('always carry a word, whatever the dice say', () => {
    for (const roll of [0, 0.999999, 1, 5, -1, NaN]) expect(PLATE_WORDS).toContain(pickPlate(roll));
  });
  it('carry words short enough to read, in plate letters', () => {
    for (const word of PLATE_WORDS) expect(word).toMatch(/^[A-Z0-9 ]{4,7}$/);
  });
  it('fit where they go: the rear in its recess, the front between the grille and the intake', () => {
    const { plate, grille, intake } = PARTS;
    expect(PLATES.rear.y + PLATES.rear.height / 2).toBeLessThan(plate.top);
    expect(PLATES.rear.y - PLATES.rear.height / 2).toBeGreaterThan(plate.bottom);
    expect(PLATES.front.y + PLATES.front.height / 2).toBeLessThan(grille.bottom);
    expect(PLATES.front.y - PLATES.front.height / 2).toBeGreaterThan(intake.top);
  });
});
