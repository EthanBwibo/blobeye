import { describe, expect, it } from 'vitest';
import { CABIN, DOOR_HALF_WIDTH, RING, RING_SIZE, WHEELS, bodyHalfWidth, endZ, flareAt, lerpAt, section, sideX, surfacePoint, topHalfWidth } from './model';

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

describe('endZ', () => {
  it('finds the nose further back at the corners than in the middle', () => {
    expect(endZ(0, 12, 1)).toBeGreaterThan(endZ(15, 12, 1));
  });
  it('mirrors left to right and finds the tail behind the car', () => {
    expect(endZ(-12, 12, 1)).toBe(endZ(12, 12, 1));
    expect(endZ(0, 16, -1)).toBeLessThan(-45);
  });
});
