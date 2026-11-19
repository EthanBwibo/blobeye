import { describe, expect, it } from 'vitest';
import { BUZZ, FULL_TILT, STEADY, STEERING, WHEEL_REACH, buzzFor, nextSteering, padSteer, readSteering, tiltSteer, wheelSteer } from './touch';

describe('the steering setting on a phone', () => {
  it('goes round the wheel, tilt and the arrow pads', () => {
    expect(STEERING).toEqual(['wheel', 'tilt', 'pads']);
    expect(nextSteering('wheel')).toBe('tilt');
    expect(nextSteering('tilt')).toBe('pads');
    expect(nextSteering('pads')).toBe('wheel');
  });

  it('is read back from the device, and a phone that steered by tilt before there was a choice still does', () => {
    expect(readSteering('pads')).toBe('pads');
    expect(readSteering('tilt', 'off')).toBe('tilt');
    expect(readSteering(null)).toBe('wheel');
    expect(readSteering('joystick')).toBe('wheel');
    expect(readSteering(null, 'on')).toBe('tilt');
    expect(readSteering(null, 'off')).toBe('wheel');
    // Once a choice is kept, the old setting no longer counts.
    expect(readSteering('wheel', 'on')).toBe('wheel');
  });

  it('steers all or nothing on the arrow pads, and straight with both held', () => {
    expect(padSteer(false, false)).toBe(0);
    expect(padSteer(true, false)).toBe(-1);
    expect(padSteer(false, true)).toBe(1);
    expect(padSteer(true, true)).toBe(0);
  });
});

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

describe('the steering wheel', () => {
  it('is straight until it is dragged, and turns the way the finger goes', () => {
    expect(wheelSteer(0, 120)).toBe(0);
    expect(wheelSteer(20, 120)).toBeGreaterThan(0);
    expect(wheelSteer(-20, 120)).toBeLessThan(0);
    expect(wheelSteer(-20, 120)).toBeCloseTo(-wheelSteer(20, 120));
  });

  it('turns more the further it is dragged, up to full lock', () => {
    expect(wheelSteer(30, 120)).toBeGreaterThan(wheelSteer(15, 120));
    expect(wheelSteer(120 * WHEEL_REACH, 120)).toBe(1);
    expect(wheelSteer(500, 120)).toBe(1);
    expect(wheelSteer(-500, 120)).toBe(-1);
  });

  it('asks the same of a thumb on a small wheel as on a big one', () => {
    expect(wheelSteer(20, 100)).toBeCloseTo(wheelSteer(40, 200));
  });

  it('stays straight on nonsense', () => {
    expect(wheelSteer(NaN, 120)).toBe(0);
    expect(wheelSteer(30, 0)).toBe(0);
  });
});

describe('buzzing', () => {
  it('buzzes on a knock, on landing and on a change of gear', () => {
    expect(buzzFor('knock', 3, 3)).toBe(BUZZ.knock);
    expect(buzzFor('land', 3, 3)).toBe(BUZZ.land);
    expect(buzzFor(null, 2, 3)).toBe(BUZZ.gear);
    expect(buzzFor(null, 3, 2)).toBe(BUZZ.gear);
  });

  it('feels a knock more than a gear change', () => {
    expect(BUZZ.knock).toBeGreaterThan(BUZZ.gear);
  });

  it('stays still for nothing, for a scrape or a splash, and going into or out of reverse', () => {
    expect(buzzFor(null, 3, 3)).toBe(0);
    expect(buzzFor('scrape', 3, 3)).toBe(0);
    expect(buzzFor('splash', 3, 3)).toBe(0);
    expect(buzzFor(null, 1, 'R')).toBe(0);
    expect(buzzFor(null, 'R', 1)).toBe(0);
  });
});
