import { describe, expect, it } from 'vitest';
import { CHASE, chaseView, newChase } from './chase';
import { INTRO, bearingInModel, blendOrbit, farShown, introCar, introDone, orbitOf, revealReach, swung, viewOf } from './intro';
import { buildStage, locate, newTrial } from './stage';

const stage = buildStage();

describe('the way in', () => {
  it('rolls the car up the road from behind the line and stops it exactly where the run starts', () => {
    const start = newTrial(stage).car;
    const first = introCar(stage, 0, 1.5);
    const behind = locate(stage, first.x, first.y, 0);
    expect(behind.along).toBeCloseTo(stage.startAt - INTRO.runUp, 3);
    expect(Math.hypot(first.vx, first.vy)).toBeCloseTo(1.5, 5);
    const last = introCar(stage, INTRO.roll, 1.5);
    expect(last.x).toBeCloseTo(start.x, 5);
    expect(last.y).toBeCloseTo(start.y, 5);
    expect(last.heading).toBeCloseTo(start.heading, 5);
    expect(Math.hypot(last.vx, last.vy)).toBe(0);
    // Always forward, never back, whatever pace it left the sheet at.
    for (const pace of [0, 1.5, 4, 40]) {
      let was = -Infinity;
      for (let t = 0; t <= INTRO.roll; t += 0.05) {
        const at = locate(stage, introCar(stage, t, pace).x, introCar(stage, t, pace).y, 0).along;
        expect(at).toBeGreaterThanOrEqual(was - 1e-6);
        was = at;
      }
    }
  });

  it('dissolves the grid from the car outwards, the horizon last, and is then all stage', () => {
    expect(revealReach(0)).toBe(0);
    let was = 0;
    for (let t = 0; t < INTRO.far; t += 0.05) {
      expect(revealReach(t)).toBeGreaterThanOrEqual(was);
      was = revealReach(t);
    }
    expect(revealReach(INTRO.near)).toBeCloseTo(INTRO.nearReach, 5);
    expect(revealReach(INTRO.far)).toBe(Infinity);
    expect(farShown(INTRO.near - 0.1)).toBe(0);
    expect(farShown(INTRO.far)).toBe(1);
  });

  it('swings the camera from the drawing\'s view to behind the car, and only then starts the count', () => {
    expect(swung(0)).toBe(0);
    expect(swung(INTRO.swing)).toBe(1);
    expect(introDone(INTRO.swing - 0.01)).toBe(false);
    expect(introDone(Math.max(INTRO.swing, INTRO.roll, INTRO.far))).toBe(true);
  });

  it('keeps a camera where it was relative to the car, and swings round the short way', () => {
    const car = newTrial(stage).car;
    const chase = chaseView(newChase(car), car);
    const orbit = orbitOf(car, chase);
    expect(Math.abs(orbit.eye.angle)).toBeCloseTo(Math.PI, 5);
    expect(orbit.eye.reach).toBeCloseTo(CHASE.distance, 5);
    const back = viewOf(car, orbit);
    expect(back.eye.x).toBeCloseTo(chase.eye.x, 5);
    expect(back.target.y).toBeCloseTo(chase.target.y, 5);
    // From just right of the nose, the way round to behind the car is by the right.
    const front = { eye: { angle: 0.3, reach: 9, height: 2 }, target: { angle: 0, reach: 1, height: 0.6 } };
    const half = blendOrbit(front, orbit, 0.5);
    expect(half.eye.angle).toBeGreaterThan(0.3);
    expect(half.eye.reach).toBeCloseTo((9 + CHASE.distance) / 2, 5);
    expect(blendOrbit(front, orbit, 1).eye.reach).toBeCloseTo(orbit.eye.reach, 9);
  });

  it('reads a place in the car model\'s frame: +z ahead, -x to the right, y up', () => {
    const ahead = bearingInModel([0, 0, 100], 0.046);
    expect(ahead.angle).toBeCloseTo(0, 9);
    expect(ahead.reach).toBeCloseTo(4.6, 9);
    expect(bearingInModel([-10, 0, 0], 1).angle).toBeCloseTo(Math.PI / 2, 9);
    expect(bearingInModel([0, 50, 0], 0.046).height).toBeCloseTo(2.3, 9);
  });
});
