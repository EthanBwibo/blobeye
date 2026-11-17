import { describe, expect, it } from 'vitest';
import { PARTS } from './model';
import { PLATES, PLATE_WORDS, pickPlate } from './plates';

describe('headlamps', () => {
  const { headlamp, grille } = PARTS;
  it('keep both lamps and the reflector inside the lens, clear of each other and of the grille', () => {
    const PER_DEGREE = 0.36;
    const [outer, inner] = headlamp.lamps;
    // The lamps' dark surrounds are a fifth bigger than the lamps.
    expect((outer![0] - inner![0]) * PER_DEGREE).toBeGreaterThan((outer![2] + inner![2]) * 1.2);
    expect(inner![0] - (inner![2] * 1.2) / PER_DEGREE).toBeGreaterThan(headlamp.inner);
    expect(headlamp.reflector.angle - headlamp.reflector.halfWidth / PER_DEGREE).toBeGreaterThan(outer![0] + (outer![2] * 1.2) / PER_DEGREE);
    expect(headlamp.reflector.angle + headlamp.reflector.halfWidth / PER_DEGREE).toBeLessThan(headlamp.outer);
    expect(headlamp.inner).toBeGreaterThan(grille.topHalf);
    for (const [, y, r] of headlamp.lamps) {
      expect(y + r).toBeLessThan(headlamp.y + headlamp.outerUp);
      expect(y - r).toBeGreaterThan(headlamp.y - headlamp.outerDown);
    }
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
