import { describe, expect, it } from 'vitest';
import type { DriveInput } from './handling';
import { HALF_WIDTH, HIT, LIES_DOWN, NO_HAZARDS, TUMBLE, knockedPose, type Animals, type Hazards } from './hazards';
import { buildStage, creaturesAt, locate, newTrial, placeAt, stepTrial, worldTime, type Stage, type Trial } from './stage';
import { BUZZ, buzzFor } from './touch';

const DT = 1 / 120;
const COAST: DriveInput = { throttle: 0, brake: 0, steer: 0 };

/** A straight road with one animal standing still in the middle of it at 400 m, or a zebra herd frozen across it. */
const withAnimal = (kind: 'giraffe' | 'warthog' | 'ostrich'): Stage => {
  const group: Animals =
    kind === 'giraffe'
      ? { kind, at: 400, count: 1, gap: 1, span: 0.01, pace: 0 }
      : kind === 'warthog'
        ? { kind, at: 400, count: 1, span: 0.01, pace: 0, every: 1e6 }
        : { kind, at: 400, to: 400, count: 1, side: 1, out: -7, pace: 0 };
  return buildStage([[0, 0], [1600, 0]], 1, 4, { ...NO_HAZARDS, animals: [group] } as Hazards);
};
const withZebra = (): Stage =>
  buildStage([[0, 0], [1600, 0]], 1, 4, { ...NO_HAZARDS, zebra: { at: 400, count: 1, gap: 1, span: 0.02, pace: 0, r: 1.1 } });

function running(stage: Stage, along: number, speed: number): Trial {
  const trial = newTrial(stage);
  const { x, y, heading } = placeAt(stage, along, 0);
  trial.car = { x, y, heading, vx: Math.cos(heading) * speed, vy: Math.sin(heading) * speed };
  trial.phase = 'running';
  trial.progress = along;
  trial.index = Math.max(0, Math.floor(along / 4) - 2);
  return trial;
}

/** Drive at the animal at `speed` and coast until it is hit: the speed just before and just after, and the run. */
function strike(stage: Stage, speed: number): { before: number; after: number; trial: Trial } {
  const trial = running(stage, 385, speed);
  let before = speed;
  for (let t = 0; t < 3; t += DT) {
    before = Math.hypot(trial.car.vx, trial.car.vy);
    stepTrial(stage, trial, COAST, DT);
    if (trial.event === 'hit') return { before, after: Math.hypot(trial.car.vx, trial.car.vy), trial };
  }
  throw new Error('never hit it');
}

describe('hitting an animal', () => {
  it('costs the car speed in proportion to the animal: a zebra or a giraffe a lot, a warthog a little', () => {
    const lost = (stage: Stage) => {
      const { before, after } = strike(stage, 25);
      return 1 - after / before;
    };
    const [giraffe, zebra, ostrich, warthog] = [lost(withAnimal('giraffe')), lost(withZebra()), lost(withAnimal('ostrich')), lost(withAnimal('warthog'))];
    expect(giraffe).toBeCloseTo(HIT.cost.giraffe, 1);
    expect(zebra).toBeCloseTo(HIT.cost.zebra, 1);
    expect(warthog).toBeCloseTo(HIT.cost.warthog, 1);
    expect(giraffe).toBeGreaterThan(zebra);
    expect(zebra).toBeGreaterThan(ostrich);
    expect(ostrich).toBeGreaterThan(warthog);
    expect(warthog).toBeLessThan(0.15);
    expect(zebra).toBeGreaterThan(0.3);
  });

  it('puts the penalty on the clock, once for each animal, and counts it', () => {
    const { trial } = strike(withZebra(), 25);
    expect(trial.penalty).toBe(HIT.penalty);
    expect(HIT.penalty).toBe(5);
    expect(trial.time).toBeGreaterThan(HIT.penalty);
    expect(worldTime(trial)).toBeCloseTo(trial.time - HIT.penalty, 9);
    // Driving on through where it stood does not hit it again.
    for (let t = 0; t < 2; t += DT) stepTrial(withZebra(), trial, COAST, DT);
    expect(trial.knocked).toHaveLength(1);
    expect(trial.penalty).toBe(HIT.penalty);
  });

  it('only nudges an animal at walking pace: no penalty, nothing knocked', () => {
    const stage = withZebra();
    const trial = running(stage, 397, HIT.slowest * 0.6);
    for (let t = 0; t < 2; t += DT) stepTrial(stage, trial, COAST, DT);
    expect(trial.knocked).toHaveLength(0);
    expect(trial.penalty).toBe(0);
  });

  it('gives a good buzz', () => {
    expect(buzzFor('hit', 3, 3)).toBe(BUZZ.hit);
    expect(BUZZ.hit).toBeGreaterThan(BUZZ.knock);
  });
});

describe('a struck animal', () => {
  const stage = withZebra();
  const { trial } = strike(stage, 28);
  const k = trial.knocked[0]!;

  it('is thrown, tumbles over, and comes to rest beside the road, not on it', () => {
    const at = locate(stage, k.rest[0], k.rest[1], trial.index);
    expect(Math.abs(at.across)).toBeGreaterThan(stage.halfWidth + 1);
    // Thrown up, and round, as it goes over.
    const mid = knockedPose(k, k.at + TUMBLE.tumble * 0.3);
    expect(mid.lift).toBeGreaterThan(HALF_WIDTH.zebra);
    const end = knockedPose(k, k.at + TUMBLE.tumble + 0.01);
    expect(end.roll).toBeCloseTo(Math.PI / 2, 5);
    expect(end.x).toBeCloseTo(k.rest[0], 5);
    expect(end.y).toBeCloseTo(k.rest[1], 5);
    // It starts where it was hit, and moves without jumps.
    expect(knockedPose(k, k.at).x).toBeCloseTo(k.from[0], 5);
    let last = knockedPose(k, k.at);
    for (let t = k.at; t < k.at + 20; t += 0.05) {
      const now = knockedPose(k, t);
      // Never faster than the car that hit it, at 28 m/s.
      expect(Math.hypot(now.x - last.x, now.y - last.y)).toBeLessThan(28 * 0.05);
      last = now;
    }
  });

  it('is drawn where it lies, and can no longer be hit', () => {
    const all = creaturesAt(stage, worldTime(trial) + 5, trial.woke, trial.knocked);
    const zebra = all.find((a) => a.id === k.id)!;
    expect(zebra.down).toBe(true);
    expect(zebra.roll).toBeCloseTo(Math.PI / 2, 5);
    expect(zebra.x).toBeCloseTo(k.rest[0], 5);
  });

  it('a zebra or a giraffe stays lying beside the road; the others get up and limp off into the bush', () => {
    expect(LIES_DOWN.zebra && LIES_DOWN.giraffe).toBe(true);
    expect(LIES_DOWN.warthog || LIES_DOWN.ostrich).toBe(false);
    const late = knockedPose(k, k.at + 30);
    expect([late.x, late.y]).toEqual([k.rest[0], k.rest[1]]);

    const hog = withAnimal('warthog');
    const struck = strike(hog, 22).trial.knocked[0]!;
    const up = knockedPose(struck, struck.at + 40);
    expect(up.roll).toBeLessThan(0.2);
    const restAt = locate(hog, struck.rest[0], struck.rest[1], 90);
    const goneAt = locate(hog, up.x, up.y, 90);
    // Further from the road than where it lay, by the whole of its wander.
    expect(Math.abs(goneAt.across) - Math.abs(restAt.across)).toBeCloseTo(TUMBLE.wander, 0);
  });
});
