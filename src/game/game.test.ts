import { describe, expect, it } from 'vitest';
import { HANDLING, carSpeeds, engineRpm, stepCar, type CarState, type DriveInput } from './handling';
import { buildStage, formatTime, isNewBest, locate, newTrial, poseAt, stepTrial, type Stage, type Trial } from './stage';
import { planOutline } from './sprite';

const DT = 1 / 120;
const still: CarState = { x: 0, y: 0, heading: 0, vx: 0, vy: 0 };
const drive = (car: CarState, input: Partial<DriveInput>, seconds: number, onRoad = true): CarState => {
  for (let t = 0; t < seconds; t += DT) car = stepCar(car, { throttle: 0, brake: 0, steer: 0, ...input }, DT, onRoad);
  return car;
};

describe('handling', () => {
  it('pulls away in a straight line and levels off at top speed', () => {
    const car = drive(still, { throttle: 1 }, 30);
    expect(car.y).toBeCloseTo(0);
    expect(carSpeeds(car).forward).toBeGreaterThan(HANDLING.topSpeed * 0.9);
    expect(carSpeeds(car).forward).toBeLessThanOrEqual(HANDLING.topSpeed);
  });

  it('slides wide when turned at speed, then gathers itself up', () => {
    const fast = drive(still, { throttle: 1 }, 6);
    const turning = drive(fast, { throttle: 1, steer: 1 }, 0.6);
    // Turning right, the car carries on towards its old line: it slides to its own left.
    expect(carSpeeds(turning).sideways).toBeLessThan(-3);
    const settled = drive(turning, {}, 1.5);
    expect(Math.abs(carSpeeds(settled).sideways)).toBeLessThan(0.5);
  });

  it('is looser with the power on than off', () => {
    const fast = drive(still, { throttle: 1 }, 6);
    const powered = drive(fast, { throttle: 1, steer: 1 }, 0.5);
    const lifted = drive(fast, { steer: 1 }, 0.5);
    expect(Math.abs(carSpeeds(powered).sideways)).toBeGreaterThan(Math.abs(carSpeeds(lifted).sideways));
  });

  it('is slow off the road', () => {
    const car = drive(still, { throttle: 1 }, 20, false);
    expect(Math.hypot(car.vx, car.vy)).toBeLessThan(HANDLING.roughTopSpeed);
  });

  it('brakes hard, and reverses if the brake is held at a standstill', () => {
    const fast = drive(still, { throttle: 1 }, 6);
    const slowed = carSpeeds(drive(fast, { brake: 1 }, 0.5)).forward;
    expect(slowed).toBeGreaterThan(0);
    expect(slowed).toBeLessThan(carSpeeds(fast).forward - 10);
    expect(carSpeeds(drive(still, { brake: 1 }, 3)).forward).toBeCloseTo(-HANDLING.reverseSpeed, 0);
  });

  it('keeps the revs between idle and the shift point', () => {
    expect(engineRpm(0)).toBe(900);
    for (let v = 0; v <= 60; v += 0.5) {
      expect(engineRpm(v)).toBeGreaterThanOrEqual(900);
      expect(engineRpm(v)).toBeLessThanOrEqual(6800);
    }
    // The revs drop at a gear change.
    expect(engineRpm(13.1)).toBeLessThan(engineRpm(12.9));
  });
});

/** A plain driver for the tests: aim at a point up the road, and slow down for what is coming. */
function autopilot(stage: Stage, trial: Trial): DriveInput {
  const turn = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const { car, progress } = trial;
  const speed = Math.hypot(car.vx, car.vy);
  const aim = poseAt(stage, progress + 10 + speed * 0.45);
  const error = turn(Math.atan2(aim.y - car.y, aim.x - car.x) - car.heading);
  const bend = Math.abs(turn(poseAt(stage, progress + 15 + speed * 1.3).heading - poseAt(stage, progress + 5).heading));
  const safe = HANDLING.topSpeed / (1 + bend * 1.5);
  return { throttle: speed < safe ? 1 : 0, brake: speed > safe + 4 ? 1 : 0, steer: Math.max(-1, Math.min(1, error * 3)) };
}

describe('stage', () => {
  const stage = buildStage();

  it('never comes close to crossing itself', () => {
    let closest = Infinity;
    for (let i = 0; i < stage.points.length; i++) {
      for (let j = i + 20; j < stage.points.length; j++) {
        closest = Math.min(closest, Math.hypot(stage.points[i]![0] - stage.points[j]![0], stage.points[i]![1] - stage.points[j]![1]));
      }
    }
    expect(closest).toBeGreaterThan(stage.halfWidth * 4);
  });

  it('finds the car on the road and how far off the middle it is', () => {
    const { x, y, heading } = poseAt(stage, 300);
    const index = stage.along.findIndex((d) => d > 300) - 1;
    const beside = locate(stage, x - Math.sin(heading) * 5, y + Math.cos(heading) * 5, index);
    expect(beside.along).toBeCloseTo(300, 0);
    expect(beside.offset).toBeCloseTo(5, 0);
  });

  it('does not count a short cut across the bush', () => {
    const far = poseAt(stage, stage.length * 0.8);
    expect(locate(stage, far.x, far.y, 0).along).toBeLessThan(100);
  });

  it('holds the clock until the throttle is pressed', () => {
    const trial = newTrial(stage);
    for (let i = 0; i < 240; i++) stepTrial(stage, trial, { throttle: 0, brake: 1, steer: 1 }, DT);
    expect(trial.phase).toBe('ready');
    expect(trial.time).toBe(0);
    expect(trial.progress).toBeCloseTo(stage.startAt, 3);
    stepTrial(stage, trial, { throttle: 1, brake: 0, steer: 0 }, DT);
    expect(trial.phase).toBe('running');
  });

  it('takes a tidy driver about a minute, and stops them after the line', () => {
    const trial = newTrial(stage);
    let offRoad = 0;
    for (let i = 0; i < 120 * 150 && trial.phase !== 'finished'; i++) {
      stepTrial(stage, trial, autopilot(stage, trial), DT);
      if (!trial.onRoad) offRoad += DT;
    }
    expect(trial.phase).toBe('finished');
    expect(trial.time).toBeGreaterThan(50);
    expect(trial.time).toBeLessThan(70);
    expect(offRoad).toBeLessThan(2);
    const clock = trial.time;
    for (let i = 0; i < 120 * 6; i++) stepTrial(stage, trial, { throttle: 1, brake: 0, steer: 0 }, DT);
    expect(trial.time).toBe(clock);
    expect(Math.hypot(trial.car.vx, trial.car.vy)).toBe(0);
    expect(trial.progress).toBeLessThan(stage.length);
  });
});

describe('times', () => {
  it('keeps the quicker time', () => {
    expect(isNewBest(null, 61.2)).toBe(true);
    expect(isNewBest(61.2, 58.4)).toBe(true);
    expect(isNewBest(58.4, 61.2)).toBe(false);
    expect(isNewBest(58.4, NaN)).toBe(false);
  });
  it('prints minutes, seconds and hundredths', () => {
    expect(formatTime(58.429)).toBe('0:58.42');
    expect(formatTime(65.5)).toBe('1:05.50');
    expect(formatTime(0)).toBe('0:00.00');
  });
});

describe('the car seen from above', () => {
  it('is the traced plan outline, closed and the same on both sides', () => {
    const outline = planOutline();
    const lengths = outline.map((p) => p[0]);
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeCloseTo(100);
    const half = outline.length / 2;
    for (let i = 0; i < half; i++) {
      const mirror = outline[outline.length - 1 - i]!;
      expect(mirror[0]).toBe(outline[i]![0]);
      expect(mirror[1]).toBe(-outline[i]![1]);
    }
  });
});
