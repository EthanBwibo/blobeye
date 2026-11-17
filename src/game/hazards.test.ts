import { describe, expect, it } from 'vitest';
import { CAR_RADIUS, GRAVITY, HAZARDS, NO_HAZARDS, groundAt, inWater, roomAt, stepFlight, underAt, zebraAt, type Flight } from './hazards';
import { buildStage, bump, herdAt, locate, newTrial, placeAt, poseAt, stepTrial, type Stage, type Trial } from './stage';

const DT = 1 / 120;
const stage = buildStage();
const bare = buildStage(undefined, undefined, undefined, NO_HAZARDS);
const speedOf = (trial: Trial) => Math.hypot(trial.car.vx, trial.car.vy);

/** A run already under way: the car on the road at a distance along it, going at a speed. */
function launch(on: Stage, along: number, speed: number, across = 0): Trial {
  const trial = newTrial(on);
  const { x, y, heading } = placeAt(on, along, across);
  trial.car = { x, y, heading, vx: Math.cos(heading) * speed, vy: Math.sin(heading) * speed };
  trial.phase = 'running';
  trial.index = Math.max(0, on.along.findIndex((d) => d > along) - 1);
  trial.progress = along;
  return trial;
}

/** Steer for a point a little way up the middle of the road. */
function steerFor(on: Stage, trial: Trial): number {
  const aim = poseAt(on, trial.progress + 10 + speedOf(trial) * 0.45);
  const off = Math.atan2(aim.y - trial.car.y, aim.x - trial.car.x) - trial.car.heading;
  return Math.max(-1, Math.min(1, Math.atan2(Math.sin(off), Math.cos(off)) * 3));
}

/** Drive on for a while, keeping to the road unless told to hold the wheel straight, and say what happened on the way. */
function run(on: Stage, trial: Trial, seconds: number, throttle = 0, steering = true) {
  const events = new Set<string>();
  let [air, highest, widest] = [0, 0, 0];
  for (let t = 0; t < seconds; t += DT) {
    stepTrial(on, trial, { throttle, brake: 0, steer: steering ? steerFor(on, trial) : 0 }, DT);
    if (trial.event) events.add(trial.event);
    if (trial.airborne) air += DT;
    highest = Math.max(highest, trial.height);
    widest = Math.max(widest, locate(on, trial.car.x, trial.car.y, trial.index).offset);
  }
  return { events, air, highest, widest };
}

describe('the hazards as laid out', () => {
  it('are all on the stage, in the order they are met, clear of the start and the finish', () => {
    const { rocks, water, bridge, zebra, crest } = HAZARDS;
    const order = [rocks[0]!.along, water.from, bridge.from - bridge.taper, zebra.at, crest.at - crest.reach];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order[0]).toBeGreaterThan(stage.startAt + 100);
    expect(crest.at + crest.reach).toBeLessThan(stage.finishAt - 100);
  });

  it('leave a way past the rocks', () => {
    // The rocks lie to one side: the other side of the road is clear, with room for the car.
    for (const rock of HAZARDS.rocks) {
      expect(Math.abs(rock.across) + rock.r).toBeLessThan(stage.halfWidth);
      expect(rock.across - rock.r - CAR_RADIUS).toBeGreaterThan(-stage.halfWidth + 2 * CAR_RADIUS + 4);
    }
    expect(stage.rocks).toHaveLength(HAZARDS.rocks.length);
  });
});

describe('the crest', () => {
  it('is a hump in a flat road', () => {
    const { at, reach, height } = HAZARDS.crest;
    expect(groundAt(HAZARDS, at)).toBeCloseTo(height);
    expect(groundAt(HAZARDS, at - reach)).toBeCloseTo(0);
    expect(groundAt(HAZARDS, at + reach + 5)).toBe(0);
    expect(groundAt(HAZARDS, at - 6)).toBeCloseTo(groundAt(HAZARDS, at + 6));
    expect(groundAt(HAZARDS, 100)).toBe(0);
  });

  it('knows its own shape: level at the top, climbing before it, and curving away over it', () => {
    const { at, reach } = HAZARDS.crest;
    expect(underAt(HAZARDS, at).slope).toBeCloseTo(0);
    expect(underAt(HAZARDS, at).arch).toBeLessThan(0);
    expect(underAt(HAZARDS, at - reach / 2).slope).toBeGreaterThan(0);
    expect(underAt(HAZARDS, at + reach / 2).slope).toBeLessThan(0);
    expect(underAt(HAZARDS, 100)).toEqual({ height: 0, slope: 0, arch: 0 });
    // The slope and the curve are those of the height.
    for (const d of [at - 15, at - 4, at + 9]) {
      const h = 0.01;
      const [before, here, after] = [groundAt(HAZARDS, d - h), groundAt(HAZARDS, d), groundAt(HAZARDS, d + h)];
      expect(underAt(HAZARDS, d).slope).toBeCloseTo((after - before) / (2 * h), 4);
      expect(underAt(HAZARDS, d).arch).toBeCloseTo((after - 2 * here + before) / (h * h), 3);
    }
  });

  it('keeps a car on flat ground, and on a steady climb', () => {
    let flight: Flight = { height: 0, rise: 0, airborne: false };
    for (let i = 0; i < 240; i++) flight = stepFlight(flight, { height: 0, slope: 0, arch: 0 }, 40, DT);
    expect(flight).toMatchObject({ height: 0, rise: 0, airborne: false });
    for (let i = 1; i <= 240; i++) flight = stepFlight(flight, { height: i * 0.01, slope: 0.1, arch: 0 }, 30, DT);
    expect(flight.airborne).toBe(false);
    expect(flight.height).toBeCloseTo(2.4);
    expect(flight.rise).toBeCloseTo(3);
  });

  it('lets go of a car when the ground drops away, and brings it down under gravity', () => {
    // The road arches away sharply enough at this pace, and not at half of it.
    const arched = { height: 2, slope: 0, arch: -0.02 };
    expect(stepFlight({ height: 2, rise: 0, airborne: false }, arched, 15, DT).airborne).toBe(false);
    let flight: Flight = stepFlight({ height: 2, rise: 0, airborne: false }, arched, 30, DT);
    expect(flight.airborne).toBe(true);
    let fell = 0;
    let landed = false;
    while (!landed && fell < 5) {
      const next = stepFlight(flight, { height: 0, slope: 0, arch: 0 }, 30, DT);
      landed = next.landed;
      flight = next;
      fell += DT;
    }
    // Two metres takes the square root of 2h/g to fall.
    expect(fell).toBeCloseTo(Math.sqrt(4 / GRAVITY), 1);
    expect(flight).toMatchObject({ height: 0, airborne: false });
  });

  it('gets the car airborne at speed, and lands it once', () => {
    const { at, height } = HAZARDS.crest;
    const trial = launch(stage, at - 70, 40);
    const before = run(stage, trial, 1, 1);
    expect(before.air).toBe(0);
    const over = run(stage, trial, 2.5, 1);
    expect(over.air).toBeGreaterThan(0.5);
    expect(over.air).toBeLessThan(1.6);
    expect(over.highest).toBeGreaterThan(height);
    expect(over.events.has('land')).toBe(true);
    expect(trial.airborne).toBe(false);
    expect(trial.height).toBe(0);
    // Flat out is the way over: it comes down still on the road and still quick.
    expect(over.widest).toBeLessThan(stage.halfWidth);
    expect(speedOf(trial)).toBeGreaterThan(35);
  });

  it('keeps a slow car on the ground', () => {
    const trial = launch(stage, HAZARDS.crest.at - 40, 16);
    const over = run(stage, trial, 6, 0.2);
    expect(trial.progress).toBeGreaterThan(HAZARDS.crest.at + HAZARDS.crest.reach);
    expect(over.air).toBe(0);
    expect(over.events.has('land')).toBe(false);
    expect(over.highest).toBeCloseTo(HAZARDS.crest.height, 1);
  });

  it('cannot be steered or braked in the air', () => {
    const trial = launch(stage, HAZARDS.crest.at - 70, 42);
    // Well off the ground, not the first moment the wheels go light.
    while (trial.aloft < 0.2) stepTrial(stage, trial, { throttle: 1, brake: 0, steer: 0 }, DT);
    const { heading, vx, vy } = trial.car;
    for (let i = 0; i < 20; i++) stepTrial(stage, trial, { throttle: 0, brake: 1, steer: 1 }, DT);
    expect(trial.airborne).toBe(true);
    expect(trial.car).toMatchObject({ heading, vx, vy });
  });
});

describe('the ford', () => {
  it('slows the car and throws up spray', () => {
    const { from, to } = HAZARDS.water;
    expect(inWater(HAZARDS, (from + to) / 2)).toBe(true);
    expect(inWater(HAZARDS, from - 1)).toBe(false);
    const [wet, dry] = [launch(stage, from - 20, 30), launch(bare, from - 20, 30)];
    const seen = new Set<string>();
    // Hold the speed up to the water, then coast through and out the other side.
    for (const [on, trial] of [[stage, wet], [bare, dry]] as const) {
      for (let t = 0; t < 4 && trial.progress < to + 3; t += DT) {
        stepTrial(on, trial, { throttle: trial.progress < from ? 0.4 : 0, brake: 0, steer: steerFor(on, trial) }, DT);
        if (trial.event) seen.add(trial.event);
        if (on === stage && trial.progress > from + 1 && trial.progress < to - 1) expect(trial.wet).toBe(true);
      }
    }
    expect(seen).toEqual(new Set(['splash']));
    expect(wet.wet).toBe(false);
    expect(wet.progress).toBeGreaterThan(to);
    // It costs a good part of the car's speed, but does not stop it.
    expect(speedOf(wet)).toBeLessThan(speedOf(dry) * 0.75);
    expect(speedOf(wet)).toBeGreaterThan(speedOf(dry) * 0.3);
  });
});

describe('the bridge', () => {
  const { from, to, taper, half } = HAZARDS.bridge;

  it('narrows the road by degrees, and gives it back', () => {
    expect(roomAt(HAZARDS, from - taper - 1, 7)).toBe(7);
    expect(roomAt(HAZARDS, from - taper / 2, 7)).toBeCloseTo((7 + half) / 2);
    expect(roomAt(HAZARDS, (from + to) / 2, 7)).toBe(half);
    expect(roomAt(HAZARDS, to + taper + 1, 7)).toBe(7);
    expect(roomAt(NO_HAZARDS, 500, 7)).toBe(7);
    // The car fits, with a little to spare each side.
    expect(half).toBeGreaterThan(CAR_RADIUS + 1);
  });

  it('lets a car through down the middle untouched', () => {
    const [on, off] = [launch(stage, from - taper - 10, 30), launch(bare, from - taper - 10, 30)];
    const seen = run(stage, on, 3, 1);
    run(bare, off, 3, 1);
    expect(seen.events.has('scrape')).toBe(false);
    expect(on.progress).toBeCloseTo(off.progress, 5);
  });

  it('holds a car that strays inside the rails, and makes it pay', () => {
    // One car holds its line out near the edge of the road, straight at the rails. The other keeps to the middle.
    const wide = launch(stage, from - taper - 10, 30, -5);
    const middle = launch(stage, from - taper - 10, 30);
    let scraped = false;
    for (let t = 0; t < 3; t += DT) {
      // Once it has touched the rails, it steers for the gap like anyone would.
      stepTrial(stage, wide, { throttle: 1, brake: 0, steer: scraped ? steerFor(stage, wide) : 0 }, DT);
      stepTrial(stage, middle, { throttle: 1, brake: 0, steer: steerFor(stage, middle) }, DT);
      scraped ||= wide.event === 'scrape';
      const where = locate(stage, wide.car.x, wide.car.y, wide.index);
      expect(Math.abs(where.across)).toBeLessThanOrEqual(roomAt(HAZARDS, where.along, stage.halfWidth) + 0.05);
    }
    expect(scraped).toBe(true);
    expect(wide.progress).toBeGreaterThan(to);
    expect(wide.progress).toBeLessThan(middle.progress - 2);
  });
});

describe('the rocks', () => {
  it('stop a car that hits one, and never let it inside', () => {
    const rock = HAZARDS.rocks[0]!;
    const solid = stage.rocks[0]!;
    const trial = launch(stage, rock.along - 12, 28, rock.across);
    let knocked = false;
    let slowest = Infinity;
    for (let t = 0; t < 1.5; t += DT) {
      stepTrial(stage, trial, { throttle: 0, brake: 0, steer: 0 }, DT);
      knocked ||= trial.event === 'knock';
      if (knocked) slowest = Math.min(slowest, speedOf(trial));
      expect(Math.hypot(trial.car.x - solid.x, trial.car.y - solid.y)).toBeGreaterThanOrEqual(solid.r + CAR_RADIUS - 1e-6);
    }
    expect(knocked).toBe(true);
    expect(slowest).toBeLessThan(12);
  });

  it('leave a car on the clear side of the road alone', () => {
    const rock = HAZARDS.rocks[0]!;
    const [on, off] = [launch(stage, rock.along - 20, 28, -3), launch(bare, rock.along - 20, 28, -3)];
    expect(run(stage, on, 1.5, 1).events.size).toBe(0);
    run(bare, off, 1.5, 1);
    expect(on.car).toEqual(off.car);
    expect(on.progress).toBeGreaterThan(HAZARDS.rocks[HAZARDS.rocks.length - 1]!.along);
  });

  it('take less from a glancing blow than from a square one', () => {
    const thing = { x: 0, y: 0, r: 1 };
    const square = bump({ x: -1.5, y: 0, heading: 0, vx: 20, vy: 0 }, thing)!;
    const glance = bump({ x: -0.6, y: 1.7, heading: 0, vx: 20, vy: 0 }, thing)!;
    expect(square.hard).toBe(true);
    // Square on, the car is thrown back the way it came, slowly.
    expect(square.car.vx).toBeLessThan(0);
    expect(Math.hypot(square.car.vx, square.car.vy)).toBeLessThan(8);
    expect(Math.hypot(glance.car.vx, glance.car.vy)).toBeGreaterThan(Math.hypot(square.car.vx, square.car.vy));
    expect(glance.car.vx).toBeGreaterThan(0);
    expect(bump({ x: -5, y: 0, heading: 0, vx: 20, vy: 0 }, thing)).toBeNull();
  });
});

describe('the zebra', () => {
  const { at, count, span, r } = HAZARDS.zebra;

  it('are the same herd on every run, and keep moving', () => {
    expect(zebraAt(HAZARDS, 31.5)).toEqual(zebraAt(HAZARDS, 31.5));
    expect(zebraAt(HAZARDS, 31.5)).toHaveLength(count);
    expect(zebraAt(HAZARDS, 32.5)).not.toEqual(zebraAt(HAZARDS, 31.5));
    expect(zebraAt(NO_HAZARDS, 10)).toEqual([]);
  });

  it('walk across the road and back, never far from where they cross', () => {
    const [seenLeft, seenRight, onRoad] = [new Set<number>(), new Set<number>(), new Set<number>()];
    for (let t = 0; t < 120; t += 0.25) {
      zebraAt(HAZARDS, t).forEach((zebra, i) => {
        expect(Math.abs(zebra.across)).toBeLessThanOrEqual(span / 2 + 1e-9);
        expect(Math.abs(zebra.along - at)).toBeLessThan(5);
        if (zebra.across < -stage.halfWidth) seenLeft.add(i);
        if (zebra.across > stage.halfWidth) seenRight.add(i);
        if (Math.abs(zebra.across) < stage.halfWidth) onRoad.add(i);
      });
    }
    for (const seen of [seenLeft, seenRight, onRoad]) expect(seen.size).toBe(count);
  });

  it('do not jump: each moves at a walk from one moment to the next', () => {
    for (let t = 0; t < 120; t += 0.1) {
      const [a, b] = [zebraAt(HAZARDS, t), zebraAt(HAZARDS, t + 0.1)];
      a.forEach((zebra, i) => expect(Math.abs(b[i]!.across - zebra.across)).toBeLessThan(0.5));
    }
  });

  it('face the way they are walking, across the road', () => {
    const herd = herdAt(stage, 20);
    const later = herdAt(stage, 20.1);
    herd.forEach((zebra, i) => {
      const [dx, dy] = [later[i]!.x - zebra.x, later[i]!.y - zebra.y];
      if (later[i]!.heading !== zebra.heading) return; // it turned round in between
      expect(Math.cos(zebra.heading) * dx + Math.sin(zebra.heading) * dy).toBeCloseTo(Math.hypot(dx, dy), 3);
    });
  });

  it('stop a car that drives into one', () => {
    // Find a moment when a zebra is in the middle of the road, and send the car at it.
    let when = 0;
    while (!zebraAt(HAZARDS, when).some((zebra) => Math.abs(zebra.across) < 0.3)) when += 0.05;
    const target = zebraAt(HAZARDS, when + 0.5).reduce((a, b) => (Math.abs(a.across) < Math.abs(b.across) ? a : b));
    const trial = launch(stage, target.along - 15, 30, target.across);
    trial.time = when;
    let knocked = false;
    for (let t = 0; t < 1; t += DT) {
      stepTrial(stage, trial, { throttle: 0, brake: 0, steer: 0 }, DT);
      knocked ||= trial.event === 'knock';
      for (const zebra of herdAt(stage, trial.time)) {
        expect(Math.hypot(trial.car.x - zebra.x, trial.car.y - zebra.y)).toBeGreaterThan(r + CAR_RADIUS - 0.1);
      }
    }
    expect(knocked).toBe(true);
    expect(speedOf(trial)).toBeLessThan(15);
  });
});
