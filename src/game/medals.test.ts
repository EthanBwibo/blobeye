import { describe, expect, it } from 'vitest';
import { formatTime } from './stage';
import { PACE, TARGETS, medalFor, medalNote, paceLine, paceTargets } from './splits';

const fixed = TARGETS;

describe('medals that follow the drivers', () => {
  it('keep the fixed times until the stage has five times this season', () => {
    expect(paceTargets([], fixed)).toEqual({ targets: fixed, benchmark: null });
    expect(paceTargets([60, 61, 62, 63], fixed)).toEqual({ targets: fixed, benchmark: null });
    expect(PACE.least).toBe(5);
  });

  it('take the third-fastest time as the pace, whatever order the times come in', () => {
    const { benchmark, targets } = paceTargets([65, 60, 70, 62, 61], fixed);
    expect(benchmark).toBe(62);
    expect(targets.gold).toBeCloseTo(63.86, 6);
    expect(targets.silver).toBeCloseTo(66.96, 6);
    expect(targets.bronze).toBeCloseTo(71.3, 6);
  });

  it('give gold within 3%, silver within 8% and bronze within 15% of the pace', () => {
    const times = paceTargets([100, 100, 100, 110, 120], fixed);
    expect(times.benchmark).toBe(100);
    expect(medalFor(103, times.targets)).toBe('gold');
    expect(medalFor(103.01, times.targets)).toBe('silver');
    expect(medalFor(108, times.targets)).toBe('silver');
    expect(medalFor(115, times.targets)).toBe('bronze');
    expect(medalFor(115.01, times.targets)).toBeNull();
    // Quicker than the pace itself is gold, of course.
    expect(medalFor(90, times.targets)).toBe('gold');
  });

  it('take the fastest when there are fewer than three, should the count ever allow it', () => {
    // The rule as written: the third-fastest, or the fastest with fewer than three. With five needed first, only
    // the third-fastest is reachable; the guard stays so a lower count cannot read past the end.
    const many = paceTargets([70, 71, 72, 73, 74, 75], fixed);
    expect(many.benchmark).toBe(72);
  });

  it('ignore anything that is not a time', () => {
    expect(paceTargets([60, NaN, -1, 0, Infinity, 61, 62, 63], fixed).benchmark).toBeNull();
    expect(paceTargets([60, NaN, 61, 62, 63, 64], fixed).benchmark).toBe(62);
  });

  it('cut each time to the hundredth, so the target reads exactly as the clock does', () => {
    const { targets } = paceTargets([61.237, 61.3, 61.4, 62, 63], fixed);
    for (const medal of ['gold', 'silver', 'bronze'] as const) {
      expect(Math.round(targets[medal] * 100)).toBeCloseTo(targets[medal] * 100, 6);
      expect(targets[medal]).toBeLessThanOrEqual(61.4 * (1 + PACE.within[medal]) + 1e-9);
    }
  });

  it('say what each medal means', () => {
    const pace = paceTargets([60, 61, 62, 63, 64], fixed);
    expect(medalNote('gold', pace)).toBe('Gold: within 3% of the pace');
    expect(medalNote('silver', pace)).toBe('Silver: within 8% of the pace');
    expect(medalNote('bronze', pace)).toBe('Bronze: within 15% of the pace');
    expect(paceLine(pace, formatTime)).toBe('The pace: 1:02.00, third-fastest this season');
    const set = paceTargets([], fixed);
    expect(medalNote('gold', set)).toBe("Gold: the stage's set time");
    expect(paceLine(set, formatTime)).toContain('5 this season');
  });
});
