import { describe, expect, it } from 'vitest';
import { FULL_TILT, STEADY, tiltSteer } from './touch';

describe('steering by tilting the phone', () => {
  // Held sideways with its top to the left (the screen turned 90°), tipped back to about 45°.
  const HELD = 90;

  it('goes straight when the phone is level, or nearly so', () => {
    expect(tiltSteer(0, 45, HELD)).toBeCloseTo(0);
    expect(tiltSteer(STEADY * 0.8, 45, HELD)).toBe(0);
    expect(tiltSteer(NaN, 0, HELD)).toBe(0);
  });

  it('steers right when the right of the screen dips, and left when the left does, either way round', () => {
    // Top of the phone to the left: the screen's right is the phone's bottom, so tipping the top up dips the right.
    expect(tiltSteer(10, 0, 90)).toBeGreaterThan(0);
    expect(tiltSteer(-10, 0, 90)).toBeLessThan(0);
    // Turned the other way round, the same tilt steers the other way.
    expect(tiltSteer(10, 0, 270)).toBeLessThan(0);
    expect(tiltSteer(10, 0, -90)).toBeLessThan(0);
    // Upright, the phone's own right is the screen's right.
    expect(tiltSteer(60, 10, 0)).toBeGreaterThan(0);
  });

  it('turns more the further it is tilted, up to full lock', () => {
    const [a, b] = [tiltSteer(8, 0, HELD), tiltSteer(16, 0, HELD)];
    expect(b).toBeGreaterThan(a);
    expect(tiltSteer(FULL_TILT, 0, HELD)).toBeCloseTo(1, 1);
    expect(tiltSteer(70, 0, HELD)).toBe(1);
    expect(tiltSteer(-70, 0, HELD)).toBe(-1);
  });

  it('reads the same lean whether the phone is held flat or upright like a wheel', () => {
    // Held sideways and flat, dipping the right edge by 15° is a beta of 15. Held upright like a wheel and
    // turned 15°, the phone's top leans 15° from straight up, which is the same lean of the screen's line.
    const flat = tiltSteer(15, 0, HELD);
    const wheel = tiltSteer(15, -90 + 1e-6, HELD);
    expect(flat).toBeGreaterThan(0.4);
    expect(wheel).toBeCloseTo(flat, 1);
  });
});
