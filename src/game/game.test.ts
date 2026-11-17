import { describe, expect, it } from 'vitest';
import { HANDLING, SURFACES, carSpeeds, engineRpm, stepCar, type CarState, type DriveInput } from './handling';
import { buildStage, formatTime, isNewBest, locate, newTrial, poseAt, stepTrial, type Stage, type Trial } from './stage';
import { CHASE, START, chaseAim, chaseFov, chaseView, countdown, newChase, stepChase, turnBetween } from './chase';
import { RUN_OUT, growScenery, roadFrame } from './scenery';
import { TARGETS, medalFor } from './splits';

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
    expect(Math.hypot(car.vx, car.vy)).toBeLessThan(SURFACES.bush.top);
  });

  it('brakes hard, and reverses if the brake is held at a standstill', () => {
    const fast = drive(still, { throttle: 1 }, 6);
    const slowed = carSpeeds(drive(fast, { brake: 1 }, 0.5)).forward;
    expect(slowed).toBeGreaterThan(0);
    expect(slowed).toBeLessThan(carSpeeds(fast).forward - 10);
    expect(carSpeeds(drive(still, { brake: 1 }, 3)).forward).toBeCloseTo(-HANDLING.reverseSpeed, 0);
  });

  it('swings the tail round on the handbrake, for a hairpin', () => {
    const fast = drive(still, { throttle: 1 }, 3);
    const steered = drive(fast, { steer: 1 }, 0.5);
    const pulled = drive(fast, { steer: 1, handbrake: 1 }, 0.5);
    // The nose comes round further, and the car slides more.
    expect(pulled.heading).toBeGreaterThan(steered.heading + 0.2);
    expect(Math.abs(carSpeeds(pulled).sideways)).toBeGreaterThan(Math.abs(carSpeeds(steered).sideways) + 2);
    // It scrubs off speed too, but less than the brake.
    const [handbraked, braked] = [carSpeeds(drive(fast, { handbrake: 1 }, 0.5)).forward, carSpeeds(drive(fast, { brake: 1 }, 0.5)).forward];
    expect(handbraked).toBeLessThan(carSpeeds(fast).forward - 3);
    expect(handbraked).toBeGreaterThan(braked);
  });

  it('never reverses on the handbrake, and does nothing with it off', () => {
    expect(carSpeeds(drive(still, { handbrake: 1 }, 2)).forward).toBe(0);
    const fast = drive(still, { throttle: 1 }, 3);
    expect(drive(fast, { steer: 1, handbrake: 0 }, 0.5)).toEqual(drive(fast, { steer: 1 }, 0.5));
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
    // It passed all three checkpoints on the way, in order.
    expect(trial.splits).toHaveLength(3);
    expect(trial.splits).toEqual([...trial.splits].sort((a, b) => a - b));
    expect(trial.splits[2]).toBeLessThan(trial.time);
    // The medal times are set against this driver: it takes silver, with gold just out of its reach.
    expect(medalFor(trial.time)).toBe('silver');
    expect(trial.time - TARGETS.gold).toBeLessThan(2);
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

describe('chase camera', () => {
  const settle = (car: CarState, seconds = 3) => {
    let chase = newChase({ ...car, vx: 0, vy: 0 });
    for (let t = 0; t < seconds; t += DT) chase = stepChase(chase, car, DT);
    return chase;
  };

  it('starts behind and above the car, looking past it', () => {
    const car: CarState = { x: 10, y: 20, heading: Math.PI / 2, vx: 0, vy: 0 };
    const { eye, target } = chaseView(newChase(car), car);
    expect(eye.x).toBeCloseTo(10);
    expect(eye.y).toBeCloseTo(20 - CHASE.distance);
    expect(eye.height).toBeGreaterThan(target.height);
    expect(target.y).toBeGreaterThan(20);
  });

  it('lags when the car turns, then comes round behind it', () => {
    const turned: CarState = { ...still, heading: 1 };
    let chase = newChase(still);
    for (let t = 0; t < 0.1; t += DT) chase = stepChase(chase, turned, DT);
    expect(chase.yaw).toBeGreaterThan(0.2);
    expect(chase.yaw).toBeLessThan(0.8);
    expect(settle(turned).yaw).toBeCloseTo(1, 2);
  });

  it('swings wide in a drift, towards the way the car is travelling', () => {
    // Nose along +x, turning right (towards +y) and sliding to its own left (-y), as in a right-hand bend.
    const sliding: CarState = { ...still, vx: 28, vy: -9 };
    expect(chaseAim(sliding)).toBeLessThan(-0.15);
    // The camera comes to rest on the inside of the nose's line (+y), so the car is seen side-on, out wide.
    const { eye } = chaseView(settle(sliding), sliding);
    expect(eye.y).toBeGreaterThan(1);
    expect(Math.abs(chaseAim({ ...still, vx: 5, vy: -40 }))).toBeLessThanOrEqual(CHASE.maxSwing);
    // A slow shuffle does not throw it about.
    expect(Math.abs(chaseAim({ ...still, vx: 1, vy: -1 }))).toBeLessThan(0.1);
  });

  it('drops back and widens with speed, unless motion is reduced', () => {
    const fast: CarState = { ...still, vx: 40 };
    expect(settle(fast).reach).toBeGreaterThan(CHASE.distance + 1);
    expect(chaseFov(40)).toBeGreaterThan(chaseFov(0));
    expect(chaseFov(40, true)).toBe(CHASE.fov);
  });

  it('takes the short way round', () => {
    expect(turnBetween(3, -3)).toBeCloseTo(Math.PI * 2 - 6);
    const chase = stepChase({ yaw: 3, reach: CHASE.distance }, { ...still, heading: -3 }, DT);
    expect(chase.yaw).toBeGreaterThan(3);
  });
});

describe('the start', () => {
  it('counts 3, 2, 1 with the car held, then lets it go', () => {
    expect(countdown(0)).toEqual({ call: '3', held: true });
    expect(countdown(START.beat * 1.5)).toEqual({ call: '2', held: true });
    expect(countdown(START.beat * 2.99)).toEqual({ call: '1', held: true });
    expect(countdown(START.beat * 3)).toEqual({ call: 'Go', held: false });
    expect(countdown(START.beat * 3 + START.go + 0.01)).toEqual({ call: null, held: false });
  });
});

describe('scenery', () => {
  const stage = buildStage();
  const bush = growScenery(stage);

  it('is the same on every visit', () => {
    expect(growScenery(stage)).toEqual(bush);
    expect(bush.trees.length).toBeGreaterThan(100);
    expect(bush.rocks.length).toBeGreaterThan(50);
    expect(bush.tufts.length).toBeGreaterThan(1000);
  });

  it('keeps off the road', () => {
    for (const plant of [...bush.trees, ...bush.rocks, ...bush.tufts]) {
      let nearest = Infinity;
      for (const p of stage.points) nearest = Math.min(nearest, Math.hypot(p[0] - plant.x, p[1] - plant.y));
      if (nearest - plant.r <= stage.halfWidth) throw new Error(`something is growing on the road at ${plant.x}, ${plant.y}`);
    }
  });

  it('carries the road on straight past both ends', () => {
    const end = roadFrame(stage, stage.length);
    const beyond = roadFrame(stage, stage.length + RUN_OUT);
    expect(Math.hypot(beyond.x - end.x, beyond.y - end.y)).toBeCloseTo(RUN_OUT, 0);
    expect(beyond.ahead[0]).toBeCloseTo(end.ahead[0], 1);
    const middle = roadFrame(stage, 300);
    expect(middle.ahead[0] * middle.right[0] + middle.ahead[1] * middle.right[1]).toBeCloseTo(0);
    // Right of the road is the same side as the car's right.
    const pose = poseAt(stage, 300);
    expect(middle.right[0]).toBeCloseTo(-Math.sin(pose.heading), 1);
    expect(middle.right[1]).toBeCloseTo(Math.cos(pose.heading), 1);
  });
});
