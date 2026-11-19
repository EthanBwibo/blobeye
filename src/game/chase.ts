/**
 * The cameras and the 3-2-1 start: a close and a far chase camera behind the car, and two fixed to it, on
 * the bonnet and in the driver's seat. Pure functions, in the same units and axes as `handling.ts`:
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
  /** The lens, in degrees, and how much it widens for each m/s. Widened from 58: the plain and the hills go wherever the camera does, so a wider view never runs off the edge of the world. */
  fov: 61,
  fovGain: 0.28,
} as const;

/** Where a chase camera sits and what it looks at. `CHASE` is the close one. */
export interface Rig {
  distance: number;
  height: number;
  stretch: number;
  lookAhead: number;
  lookHeight: number;
}

/** Further back and higher: more of the road ahead, less of the car. */
export const FAR_CHASE: Rig = { distance: 12.5, height: 4.6, stretch: 0.07, lookAhead: 9, lookHeight: 1.3 };

/** The cameras, in the order C (or the camera button) goes round them. */
export const CAMERAS = ['close', 'far', 'bonnet', 'cockpit'] as const;
export type CameraMode = (typeof CAMERAS)[number];
export const CAMERA_NAMES: Record<CameraMode, string> = { close: 'Close chase', far: 'Far chase', bonnet: 'Bonnet', cockpit: 'Cockpit' };

/** The camera after this one. */
export const nextCamera = (mode: CameraMode): CameraMode => CAMERAS[(CAMERAS.indexOf(mode) + 1) % CAMERAS.length]!;
/** The camera kept on the device, or the close chase if there is none or it is not one of these. */
export const readCamera = (stored: string | null): CameraMode => (CAMERAS as readonly string[]).includes(stored ?? '') ? (stored as CameraMode) : 'close';
/** The chase rig for a camera. The bonnet and cockpit cameras keep the close one running, so going back to it is smooth. */
export const rigFor = (mode: CameraMode): Rig => (mode === 'far' ? FAR_CHASE : CHASE);
/** Whether a camera rides on the car rather than following it. */
export const onBoard = (mode: CameraMode): mode is 'bonnet' | 'cockpit' => mode === 'bonnet' || mode === 'cockpit';

/**
 * The cameras fixed to the car, in metres in the car's own frame: `ahead` of its middle, to its `right`, and
 * `up` from the ground. It looks `look` metres ahead and `drop` metres lower. The cockpit is the driver's
 * seat, on the right: the car is right-hand drive, as in Kenya.
 */
export const MOUNTS = {
  bonnet: { ahead: 0.95, right: 0, up: 1.25, look: 30, drop: 1.1, fov: 65 },
  cockpit: { ahead: -0.2, right: 0.37, up: 1.2, look: 30, drop: 1.5, fov: 71 },
} as const;
/** How much a camera on the car widens for each m/s: less than the chase camera, as the road rushing past does the rest. */
export const MOUNT_FOV_GAIN = 0.12;

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
export function newChase(car: CarState, rig: Rig = CHASE): Chase {
  return { yaw: car.heading, reach: rig.distance };
}

/** Advance the camera by `dt` seconds. Returns a new state. */
export function stepChase(chase: Chase, car: CarState, dt: number, rig: Rig = CHASE): Chase {
  const yaw = chase.yaw + turnBetween(chase.yaw, chaseAim(car)) * (1 - Math.exp(-CHASE.follow * dt));
  const wanted = rig.distance + rig.stretch * Math.hypot(car.vx, car.vy);
  const reach = chase.reach + (wanted - chase.reach) * (1 - Math.exp(-CHASE.stretchRate * dt));
  return { yaw, reach };
}

/** Where the camera is and what it looks at. */
export function chaseView(chase: Chase, car: CarState, rig: Rig = CHASE): { eye: Place; target: Place } {
  const look = chase.yaw + turnBetween(chase.yaw, car.heading) * CHASE.lead;
  return {
    eye: { x: car.x - Math.cos(chase.yaw) * chase.reach, y: car.y - Math.sin(chase.yaw) * chase.reach, height: rig.height },
    target: { x: car.x + Math.cos(look) * rig.lookAhead, y: car.y + Math.sin(look) * rig.lookAhead, height: rig.lookHeight },
  };
}

/**
 * Where a camera on the car is and what it looks at: straight down the nose, `lift` metres up with the car,
 * and tipped with the body by `pitch` radians (nose down is positive).
 */
export function mountView(mode: 'bonnet' | 'cockpit', car: CarState, lift = 0, pitch = 0): { eye: Place; target: Place } {
  const m = MOUNTS[mode];
  const [fx, fy] = [Math.cos(car.heading), Math.sin(car.heading)];
  // The car's right, in the ground's terms: a quarter turn on from the nose.
  const [rx, ry] = [-fy, fx];
  const eye = { x: car.x + fx * m.ahead + rx * m.right, y: car.y + fy * m.ahead + ry * m.right, height: lift + m.up };
  return { eye, target: { x: eye.x + fx * m.look, y: eye.y + fy * m.look, height: eye.height - m.drop - Math.tan(pitch) * m.look } };
}

/** The lens for a camera on the car, in degrees. `steady` keeps it fixed, for reduced motion. */
export function mountFov(mode: 'bonnet' | 'cockpit', speed: number, steady = false): number {
  return MOUNTS[mode].fov + (steady ? 0 : MOUNT_FOV_GAIN * Math.min(Math.abs(speed), 50));
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
