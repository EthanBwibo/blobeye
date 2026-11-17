import { describe, expect, it } from 'vitest';
import { rimProfile, tyreProfile } from './model';
import { BELT, CABIN, DOOR_HALF_WIDTH, PARTS, RING, RING_SIZE, SIDE_TOP, WHEELS, bodyHalfWidth, flareAt, lerpAt, section, sideX, surfacePoint, topHalfWidth, wrapPoint } from './model';

describe('lerpAt', () => {
  const line = [[10, 0], [0, 4], [-10, 2]] as const;
  it('returns traced points exactly and blends between them', () => {
    expect(lerpAt(line, 0)).toBe(4);
    expect(lerpAt(line, 5)).toBeCloseTo(2);
    expect(lerpAt(line, -5)).toBeCloseTo(3);
  });
  it('holds the end values beyond the nose and tail', () => {
    expect(lerpAt(line, 99)).toBe(0);
    expect(lerpAt(line, -99)).toBe(2);
  });
});

describe('body width', () => {
  it('keeps the shell to the door width and puts the rest in the flares', () => {
    expect(bodyHalfWidth(WHEELS.frontZ)).toBe(DOOR_HALF_WIDTH);
    expect(flareAt(WHEELS.frontZ)).toBeGreaterThan(1);
    expect(flareAt(0)).toBe(0);
  });
  it('narrows the cabin to the roof and widens again over the boot', () => {
    expect(topHalfWidth(0)).toBe(CABIN.roofHalfWidth);
    expect(topHalfWidth((CABIN.cowl + CABIN.roofFront) / 2)).toBeGreaterThan(CABIN.roofHalfWidth);
    expect(topHalfWidth(CABIN.deck - 2)).toBeGreaterThan(CABIN.roofHalfWidth);
  });
});

describe('wheels', () => {
  const face = WHEELS.width / 2;
  it('have tyres whose sidewalls bulge past the bead and roll over onto the tread', () => {
    const tyre = tyreProfile();
    const radii = tyre.map(([r]) => r);
    expect(Math.max(...radii)).toBeCloseTo(WHEELS.radius, 5);
    expect(Math.min(...radii)).toBeCloseTo(WHEELS.rimRadius - 0.1, 5);
    const widest = Math.max(...tyre.map(([, a]) => a));
    expect(widest).toBeGreaterThan(face + 0.2);
    expect(Math.min(...tyre.map(([, a]) => a))).toBeCloseTo(-widest, 5);
    // The tread is narrower than the sidewalls
    const tread = tyre.filter(([r]) => r > WHEELS.radius - 0.01).map(([, a]) => Math.abs(a));
    expect(Math.max(...tread)).toBeLessThan(face);
  });
  it('have rims with a lip that stands proud of the bead and a dish behind it', () => {
    const lip = Math.max(...rimProfile().map(([, a]) => a));
    expect(lip).toBeGreaterThan(face);
    expect(lip - (face - WHEELS.dish)).toBeGreaterThan(0.8);
    expect(Math.max(...rimProfile().map(([r]) => r))).toBeLessThan(WHEELS.radius - 1);
  });
});

describe('glasshouse', () => {
  const { glass } = PARTS;
  it('rises from the cowl to the roof steeply, and falls to the boot steeply', () => {
    // The rise or fall across the middle of each screen, per unit along the car (the first trace was about 0.5)
    const windscreen = (lerpAt(SIDE_TOP, 10) - lerpAt(SIDE_TOP, 18)) / 8;
    const rearScreen = (lerpAt(SIDE_TOP, -22) - lerpAt(SIDE_TOP, -30)) / 8;
    expect(windscreen).toBeGreaterThan(0.6);
    expect(rearScreen).toBeGreaterThan(0.6);
  });
  it('has tall side windows, over a third of the car height from belt to roof', () => {
    expect(lerpAt(SIDE_TOP, glass.pillar) - lerpAt(BELT, glass.pillar)).toBeGreaterThan(11);
  });
  it('has thin pillars', () => {
    expect(glass.pillarHalf * 2).toBeLessThan(1);
    expect(CABIN.cowl - glass.frontLow).toBeLessThan(3.5);
    expect(glass.frontTop - CABIN.roofFront).toBeLessThan(1);
    expect(glass.rearTop - CABIN.roofRear).toBeLessThan(1);
  });
});

describe('section', () => {
  it('starts and ends on the centre line', () => {
    for (const z of [49, 30, 0, -30, -49]) {
      const ring = section(z);
      expect(ring).toHaveLength(RING_SIZE);
      expect(ring[RING.floorCentre]![0]).toBe(0);
      expect(ring[RING.topCentre]![0]).toBe(0);
    }
  });
  it('never dips below the floor or pokes above the roof line', () => {
    for (let z = 50; z >= -50; z -= 2.5) {
      const ring = section(z);
      const floor = ring[RING.floorCentre]![1];
      const top = ring[RING.topCentre]![1];
      for (const [x, y] of ring) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(floor - 1e-9);
        expect(y).toBeLessThanOrEqual(top + 1e-9);
      }
    }
  });
});

describe('surfacePoint', () => {
  it('lands on the ring points at whole numbers', () => {
    const ring = section(-5);
    for (let i = 0; i < RING_SIZE; i++) {
      const [x, y] = surfacePoint(-5, i);
      expect([x, y]).toEqual([ring[i]![0], ring[i]![1]]);
    }
  });
  it('mirrors the right side from the left', () => {
    const [x, y, z] = surfacePoint(10, 6.4, 1);
    expect(surfacePoint(10, 6.4, -1)).toEqual([-x, y, z]);
  });
});

describe('sideX', () => {
  it('matches the widest part of the body at mid height', () => {
    expect(sideX(0, 12)).toBeCloseTo(bodyHalfWidth(0), 1);
  });
});

describe('wrapPoint', () => {
  it('lands on the face of the car straight ahead and straight behind', () => {
    const [x, y, z] = wrapPoint(1, 0, 12);
    expect([x, y]).toEqual([0, 12]);
    expect(z).toBeGreaterThan(48);
    expect(wrapPoint(1, 0, 8)[2]).toBeLessThanOrEqual(50);
    expect(wrapPoint(-1, 0, 16)[2]).toBeLessThan(-45);
  });
  it('wraps round the corner onto the side of the body', () => {
    const [x, , z] = wrapPoint(1, 1.1, 12);
    expect(z).toBeLessThan(45);
    expect(x).toBeCloseTo(sideX(z, 12), 1);
  });
  it('mirrors left to right', () => {
    const [x, y, z] = wrapPoint(1, 0.6, 14);
    const [mx, my, mz] = wrapPoint(1, -0.6, 14);
    expect([mx, my, mz]).toEqual([-x, y, z]);
  });
});
