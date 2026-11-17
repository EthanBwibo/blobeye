import { describe, expect, it } from 'vitest';
import { DRIVETRAIN, HALF_SHAFTS, type Solid } from './drivetrain';
import { SIDE_TOP, WHEELS, bodyHalfWidth, lerpAt, type Point } from './model';

/** The corners of the smallest upright box round a solid. */
function extent(solid: Solid): { min: Point; max: Point } {
  if (solid.shape === 'box') {
    const { centre: c, size: s } = solid;
    return { min: [c[0] - s[0] / 2, c[1] - s[1] / 2, c[2] - s[2] / 2], max: [c[0] + s[0] / 2, c[1] + s[1] / 2, c[2] + s[2] / 2] };
  }
  const r = Math.max(solid.radius, solid.endRadius ?? 0);
  const along = (k: 0 | 1 | 2) => [Math.min(solid.from[k], solid.to[k]), Math.max(solid.from[k], solid.to[k])] as const;
  // A bar does not stick out past its own ends.
  const pad = (k: 0 | 1 | 2) => (solid.from[k] === solid.to[k] ? r : 0);
  const [x, y, z] = [along(0), along(1), along(2)];
  return { min: [x[0] - pad(0), y[0] - r, z[0] - pad(2)], max: [x[1] + pad(0), y[1] + r, z[1] + pad(2)] };
}

const part = (label: string) => DRIVETRAIN.find((p) => p.label === label)!;

describe('drivetrain', () => {
  it('names the six parts and nothing else', () => {
    expect(DRIVETRAIN.map((p) => p.label).sort()).toEqual(
      ['Centre differential', 'Engine', 'Front differential', 'Gearbox', 'Prop shaft', 'Rear differential'],
    );
  });

  it('runs from nose to tail', () => {
    const along = DRIVETRAIN.map((p) => p.anchor[2]);
    expect(along).toEqual([...along].sort((a, b) => b - a));
  });

  it('puts the front and rear differentials on the axle lines, at wheel-centre height', () => {
    expect(part('Front differential').anchor[2]).toBe(WHEELS.frontZ);
    expect(part('Rear differential').anchor[2]).toBe(WHEELS.rearZ);
    for (const shaft of HALF_SHAFTS) {
      if (shaft.shape !== 'rod') throw new Error('half shafts are bars');
      expect(shaft.from[1]).toBe(WHEELS.radius);
      expect([WHEELS.frontZ, WHEELS.rearZ]).toContain(shaft.from[2]);
    }
  });

  it('fits inside the body and above the ground', () => {
    for (const solid of [...DRIVETRAIN.flatMap((p) => p.solids), ...HALF_SHAFTS]) {
      const { min, max } = extent(solid);
      expect(min[1]).toBeGreaterThan(0);
      for (const z of [min[2], max[2]]) {
        expect(max[1]).toBeLessThan(lerpAt(SIDE_TOP, z));
        expect(Math.max(-min[0], max[0])).toBeLessThan(bodyHalfWidth(z));
      }
    }
  });

  it('joins up: engine, gearbox, centre differential, prop shaft, rear differential', () => {
    const z = (label: string) => {
      const boxes = part(label).solids.map(extent);
      return { front: Math.max(...boxes.map((b) => b.max[2])), rear: Math.min(...boxes.map((b) => b.min[2])) };
    };
    expect(z('Gearbox').front).toBeGreaterThanOrEqual(z('Engine').rear);
    expect(z('Gearbox').rear).toBe(z('Centre differential').front);
    expect(z('Centre differential').rear).toBe(z('Prop shaft').front);
    expect(z('Prop shaft').rear).toBeLessThanOrEqual(z('Rear differential').front);
  });

  it('takes a shaft from each differential to the inside of each wheel', () => {
    expect(HALF_SHAFTS).toHaveLength(4);
    for (const shaft of HALF_SHAFTS) {
      if (shaft.shape !== 'rod') throw new Error('half shafts are bars');
      expect(Math.abs(shaft.to[0])).toBeGreaterThan(WHEELS.track - WHEELS.width);
      expect(Math.abs(shaft.to[0])).toBeLessThan(WHEELS.track);
    }
  });

  it('keeps every name clear of the car: above the roof or below the ground', () => {
    const roof = Math.max(...SIDE_TOP.map((p) => p[1]));
    for (const p of DRIVETRAIN) expect(p.labelAt[1] > roof + 5 || p.labelAt[1] < -3).toBe(true);
  });
});
