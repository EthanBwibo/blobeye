import { describe, expect, it } from 'vitest';
import {
  CYLINDERS,
  IDLE_RPM,
  LIMIT_RPM,
  createEngineState,
  degreesSince,
  firingOrder,
  pistonPose,
  pulseGaps,
  stepEngine,
  stepRpm,
} from './model';

describe('firing', () => {
  it('fires 1-3-2-4', () => {
    expect(firingOrder()).toEqual([1, 3, 2, 4]);
  });

  it('fires one cylinder every half turn', () => {
    const angles = CYLINDERS.map((c) => c.fireAt).sort((a, b) => a - b);
    expect(angles).toEqual([0, 180, 360, 540]);
  });

  it('puts 1 and 3 on one bank and 2 and 4 on the other', () => {
    const bank = (n: number) => CYLINDERS.find((c) => c.n === n)!.side;
    expect(bank(1)).toBe(bank(3));
    expect(bank(2)).toBe(bank(4));
    expect(bank(1)).not.toBe(bank(2));
  });
});

describe('exhaust pulses', () => {
  it('arrive evenly with equal-length headers', () => {
    expect(pulseGaps('equal')).toEqual([180, 180, 180, 180]);
  });

  it('arrive unevenly with unequal-length headers', () => {
    const gaps = pulseGaps('unequal');
    expect(new Set(gaps).size).toBeGreaterThan(1);
    expect([...gaps].sort((a, b) => a - b)).toEqual([90, 180, 180, 270]);
  });

  it('always add up to one full cycle', () => {
    for (const mode of ['equal', 'unequal'] as const) {
      expect(pulseGaps(mode).reduce((a, b) => a + b, 0)).toBe(720);
    }
  });
});

describe('piston geometry', () => {
  it('moves opposing pistons in mirror image', () => {
    const [c1, c2, c3, c4] = CYLINDERS as [
      (typeof CYLINDERS)[number],
      (typeof CYLINDERS)[number],
      (typeof CYLINDERS)[number],
      (typeof CYLINDERS)[number],
    ];
    for (let deg = 0; deg < 720; deg += 15) {
      expect(pistonPose(c1, deg).wristX).toBeCloseTo(-pistonPose(c2, deg).wristX, 10);
      expect(pistonPose(c3, deg).wristX).toBeCloseTo(-pistonPose(c4, deg).wristX, 10);
    }
  });

  it('keeps every piston on its own side of the crank', () => {
    for (const c of CYLINDERS) {
      for (let deg = 0; deg < 720; deg += 15) {
        expect(Math.sign(pistonPose(c, deg).wristX)).toBe(c.side);
      }
    }
  });
});

describe('revs', () => {
  it('climb toward the limiter on throttle and never pass it', () => {
    let rpm = IDLE_RPM;
    for (let i = 0; i < 600; i++) rpm = stepRpm(rpm, true, 1 / 60);
    expect(rpm).toBeGreaterThan(LIMIT_RPM - 50);
    expect(rpm).toBeLessThanOrEqual(LIMIT_RPM);
  });

  it('settle back to idle off throttle', () => {
    let rpm = LIMIT_RPM;
    for (let i = 0; i < 600; i++) rpm = stepRpm(rpm, false, 1 / 60);
    expect(rpm).toBeCloseTo(IDLE_RPM, 0);
  });

  it('keep the crank angle inside one cycle', () => {
    const s = createEngineState();
    s.throttle = true;
    for (let i = 0; i < 2000; i++) {
      stepEngine(s, 1 / 60, false);
      expect(s.crank).toBeGreaterThanOrEqual(0);
      expect(s.crank).toBeLessThan(720);
    }
  });
});

describe('degreesSince', () => {
  it('wraps around the cycle', () => {
    expect(degreesSince(10, 700)).toBe(30);
    expect(degreesSince(700, 10)).toBe(690);
    expect(degreesSince(0, 0)).toBe(0);
  });
});
