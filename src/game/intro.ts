/**
 * The way in to the stage, as one shot. The car that drove off the drawing sheet is handed to the stage
 * (see `src/scene/handoff.ts`) and rolls up to the start line; the sheet's grid dissolves into murram and
 * savannah, outward from the car, and the camera swings round from where the drawing had it to behind the
 * car. Then the 3-2-1 starts. Pure functions, in the same units and axes as `handling.ts`.
 */
import type { Place } from './chase';
import type { CarState } from './handling';
import { poseAt, type Stage } from './stage';

export const INTRO = {
  /** Metres behind the start line the car rolls in from, and the seconds it takes to stop on it. */
  runUp: 10,
  roll: 2.6,
  /** Seconds for the camera to swing round behind the car. The count starts when it is there. */
  swing: 3,
  /** The grid holds this long, then murram spreads out from the car to `nearReach` metres by `near` seconds... */
  hold: 0.2,
  near: 1.7,
  nearReach: 70,
  /** ...and on out to the horizon, with the sky and the hills, by `far`. */
  far: 2.7,
  farReach: 2600,
} as const;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

/**
 * The car `time` seconds into the way in: rolling up the road from `INTRO.runUp` metres short of the start
 * at `pace` m/s, the speed it left the sheet at, and coming to rest exactly where the run starts.
 */
export function introCar(stage: Stage, time: number, pace: number): CarState {
  const { runUp: distance, roll } = INTRO;
  const u = clamp01(time / roll);
  // A Hermite curve: leaves at `pace`, arrives at rest. The pace is held low enough that it never rolls back.
  const lead = Math.min(Math.max(0, pace), (2.5 * distance) / roll) * roll;
  const s = (-2 * u ** 3 + 3 * u * u) * distance + (u ** 3 - 2 * u * u + u) * lead;
  const ds = u >= 1 ? 0 : ((-6 * u * u + 6 * u) * distance + (3 * u * u - 4 * u + 1) * lead) / roll;
  const { x, y, heading } = poseAt(stage, stage.startAt - distance + s);
  return { x, y, heading, vx: Math.cos(heading) * ds, vy: Math.sin(heading) * ds };
}

/** How far out from the car the stage has come through the grid, in metres, `time` seconds in. Infinity once it is all there. */
export function revealReach(time: number): number {
  const { hold, near, far, nearReach, farReach } = INTRO;
  if (time >= far) return Infinity;
  if (time < near) return nearReach * smooth((time - hold) / (near - hold));
  return nearReach * (farReach / nearReach) ** ((time - near) / (far - near));
}

/** How much of the sky and the far hills shows, 0 to 1. They come last, as the murram reaches the horizon. */
export const farShown = (time: number): number => smooth((time - INTRO.near) / (INTRO.far - INTRO.near));

/** How far the camera has swung round, 0 at the drawing's view and 1 at the stage's own. */
export const swung = (time: number): number => smooth(time / INTRO.swing);

/** Whether the way in is over and the count may start. */
export const introDone = (time: number): boolean => time >= Math.max(INTRO.roll, INTRO.swing, INTRO.far);

/** A point seen from the car: `angle` round from its nose (positive to its right), `reach` metres out and `height` up. */
export interface Bearing {
  angle: number;
  reach: number;
  height: number;
}

/** A camera as seen from the car: where it is, and where it looks. Swinging between two of these keeps the car in the middle. */
export interface Orbit {
  eye: Bearing;
  target: Bearing;
}

const turnBetween = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

function bearingOf(car: CarState, place: Place): Bearing {
  const [dx, dy] = [place.x - car.x, place.y - car.y];
  const ahead = dx * Math.cos(car.heading) + dy * Math.sin(car.heading);
  const right = -dx * Math.sin(car.heading) + dy * Math.cos(car.heading);
  return { angle: Math.atan2(right, ahead), reach: Math.hypot(ahead, right), height: place.height };
}

function placeOf(car: CarState, b: Bearing): Place {
  const way = car.heading + b.angle;
  return { x: car.x + Math.cos(way) * b.reach, y: car.y + Math.sin(way) * b.reach, height: b.height };
}

/** A camera on the ground, as seen from the car. */
export const orbitOf = (car: CarState, view: { eye: Place; target: Place }): Orbit => ({ eye: bearingOf(car, view.eye), target: bearingOf(car, view.target) });

/** A camera seen from the car, back on the ground. */
export const viewOf = (car: CarState, orbit: Orbit): { eye: Place; target: Place } => ({ eye: placeOf(car, orbit.eye), target: placeOf(car, orbit.target) });

/**
 * A place in the car model's own frame, as the drawing has it, seen from the car: the model is `unit` metres
 * to the unit, with +z to the front, -x to its right and y up from the ground.
 */
export const bearingInModel = ([x, y, z]: readonly [number, number, number], unit: number): Bearing => ({
  angle: Math.atan2(-x, z),
  reach: Math.hypot(x, z) * unit,
  height: y * unit,
});

/** Part of the way from one camera to another, `share` from 0 to 1, round the short way. */
export function blendOrbit(from: Orbit, to: Orbit, share: number): Orbit {
  const mix = (a: Bearing, b: Bearing): Bearing => ({
    angle: a.angle + turnBetween(a.angle, b.angle) * share,
    reach: a.reach + (b.reach - a.reach) * share,
    height: a.height + (b.height - a.height) * share,
  });
  return { eye: mix(from.eye, to.eye), target: mix(from.target, to.target) };
}
