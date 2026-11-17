/**
 * The chase camera and the 3-2-1 start. Pure functions, in the same units and axes as `handling.ts`:
 * x and y are the ground, seen from above, and heights are metres above it.
 */
import { carSpeeds, type CarState } from './handling';

export const CHASE = {
  /** How far behind the car the camera sits at rest, and how far above the ground. */
  distance: 7.2,
  height: 2.7,
  /** It drops back by this many metres for each m/s of speed. */
  stretch: 0.05,
  /** How quickly it takes up a new distance, per second. */
  stretchRate: 3,
  /** How quickly it swings round behind the car, per second. Lower lags more. */
  follow: 5.5,
  /** How far it leans towards the way the car is travelling rather than the way it points: 1 is all the way. */
  swing: 0.9,
  /** The most a slide can pull it round, in radians. */
  maxSwing: 0.6,
  /** Below this speed a slide does not pull it round at all; it comes in gradually above. */
  swingFrom: 10,
  /** The camera looks at a point this far past the car, at this height. */
  lookAhead: 5,
  lookHeight: 1,
  /** Of the angle between where the camera faces and where the nose points, the share the look point takes up. */
  lead: 0.35,
  /** The lens, in degrees, and how much it widens for each m/s. */
  fov: 58,
  fovGain: 0.28,
} as const;

export interface Chase {
  /** Which way the camera faces along the ground, in the same sense as the car's heading. */
  yaw: number;
  /** How far behind the car it is. */
  reach: number;
}

export interface Place {
  x: number;
  y: number;
  height: number;
}

const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v));

/** The short way round from one angle to another. */
export function turnBetween(from: number, to: number): number {
  const turn = to - from;
  return Math.atan2(Math.sin(turn), Math.cos(turn));
}

/** Where the camera wants to face: behind the nose, pulled towards the direction of travel when the car slides. */
export function chaseAim(car: CarState): number {
  const { forward, sideways } = carSpeeds(car);
  const slip = Math.atan2(sideways, Math.max(Math.abs(forward), 6));
  const weight = Math.min(1, Math.hypot(forward, sideways) / CHASE.swingFrom);
  return car.heading + clamp(slip * CHASE.swing * weight, -CHASE.maxSwing, CHASE.maxSwing);
}

/** A camera settled directly behind the car. */
export function newChase(car: CarState): Chase {
  return { yaw: car.heading, reach: CHASE.distance };
}

/** Advance the camera by `dt` seconds. Returns a new state. */
export function stepChase(chase: Chase, car: CarState, dt: number): Chase {
  const yaw = chase.yaw + turnBetween(chase.yaw, chaseAim(car)) * (1 - Math.exp(-CHASE.follow * dt));
  const wanted = CHASE.distance + CHASE.stretch * Math.hypot(car.vx, car.vy);
  const reach = chase.reach + (wanted - chase.reach) * (1 - Math.exp(-CHASE.stretchRate * dt));
  return { yaw, reach };
}

/** Where the camera is and what it looks at. */
export function chaseView(chase: Chase, car: CarState): { eye: Place; target: Place } {
  const look = chase.yaw + turnBetween(chase.yaw, car.heading) * CHASE.lead;
  return {
    eye: { x: car.x - Math.cos(chase.yaw) * chase.reach, y: car.y - Math.sin(chase.yaw) * chase.reach, height: CHASE.height },
    target: { x: car.x + Math.cos(look) * CHASE.lookAhead, y: car.y + Math.sin(look) * CHASE.lookAhead, height: CHASE.lookHeight },
  };
}

/** The lens for a speed, in degrees: wider the faster the car goes. `steady` keeps it fixed, for reduced motion. */
export function chaseFov(speed: number, steady = false): number {
  return CHASE.fov + (steady ? 0 : CHASE.fovGain * Math.min(Math.abs(speed), 50));
}

/** Seconds each number of the start is shown, and how long "Go" stays up. */
export const START = { beat: 0.8, go: 0.9 } as const;

/**
 * The start, `elapsed` seconds after the car lines up: 3, 2, 1, then Go. While `held` is true the car
 * may not move. `call` is what to show, or null once Go has gone.
 */
export function countdown(elapsed: number): { call: '3' | '2' | '1' | 'Go' | null; held: boolean } {
  const beat = Math.floor(Math.max(0, elapsed) / START.beat);
  if (beat < 3) return { call: (['3', '2', '1'] as const)[beat]!, held: true };
  return { call: elapsed < START.beat * 3 + START.go ? 'Go' : null, held: false };
}
