/**
 * How the car drives on gravel. Pure functions: no DOM, no clock, no randomness.
 *
 * Units are metres, seconds and radians. The ground is seen from above with x to the right and y down
 * the screen, so a heading of 0 points right and turning right makes the heading grow.
 *
 * The numbers are tuned for feel, not taken from the real car.
 */

export interface CarState {
  x: number;
  y: number;
  /** Which way the nose points. */
  heading: number;
  /** Which way the car is actually travelling. On gravel the two differ: that is the drift. */
  vx: number;
  vy: number;
}

export interface DriveInput {
  /** 0 to 1. */
  throttle: number;
  /** 0 to 1. Held at a standstill it reverses. */
  brake: number;
  /** -1 is full left, 1 is full right. */
  steer: number;
}

export const HANDLING = {
  /** Pull away at this rate, in m/s². It tails off towards top speed. */
  accel: 15,
  topSpeed: 46,
  /** Off the road the car cannot hold more than this. */
  roughTopSpeed: 16,
  brake: 26,
  reverseSpeed: 8,
  /** Share of speed lost per second with the throttle shut. */
  coast: 0.4,
  /** Extra share of speed lost per second off the road. */
  roughDrag: 1.6,
  /** Fastest the nose can swing, in radians per second. */
  turnRate: 2.5,
  /** Below this speed the steering has less to work with. */
  steerFrom: 7,
  /** Steering gets heavier with speed: at this speed the nose swings half as fast. */
  steerFade: 60,
  /** How quickly sideways speed is scrubbed off, per second. Lower is looser. */
  grip: 6,
  /** The same with the wheel turned and a pedal down: the tail steps out. */
  slideGrip: 3,
} as const;

const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v));

/** Speed along the nose (negative when reversing) and across it (positive when sliding to the car's right). */
export function carSpeeds(car: CarState): { forward: number; sideways: number } {
  const fx = Math.cos(car.heading);
  const fy = Math.sin(car.heading);
  return { forward: car.vx * fx + car.vy * fy, sideways: -car.vx * fy + car.vy * fx };
}

/** Advance the car by `dt` seconds. Returns a new state. */
export function stepCar(car: CarState, input: DriveInput, dt: number, onRoad = true): CarState {
  const H = HANDLING;
  const throttle = clamp(input.throttle, 0, 1);
  const brake = clamp(input.brake, 0, 1);
  const steer = clamp(input.steer, -1, 1);

  // Swing the nose. The car keeps travelling the way it was going, so this is what starts a slide.
  const before = carSpeeds(car).forward;
  const pace = Math.abs(before);
  const bite = Math.min(1, pace / H.steerFrom) / (1 + pace / H.steerFade);
  const heading = car.heading + steer * H.turnRate * bite * Math.sign(before) * dt;

  let { forward, sideways } = carSpeeds({ ...car, heading });

  if (throttle > 0) forward += throttle * H.accel * Math.max(0, 1 - forward / (onRoad ? H.topSpeed : H.roughTopSpeed)) * dt;
  if (brake > 0) {
    if (forward > 0.5) forward = Math.max(0, forward - brake * H.brake * dt);
    else forward = Math.max(-H.reverseSpeed, forward - brake * H.accel * 0.5 * dt);
  }
  const drag = (throttle > 0 ? 0 : H.coast) + (onRoad ? 0 : H.roughDrag);
  forward *= Math.exp(-drag * dt);

  // The tyres scrub off sideways speed. Less so with the wheel turned and a pedal down.
  const provoke = Math.abs(steer) * Math.max(throttle, brake);
  const grip = H.grip + (H.slideGrip - H.grip) * provoke;
  sideways *= Math.exp(-grip * dt);

  const fx = Math.cos(heading);
  const fy = Math.sin(heading);
  const vx = forward * fx - sideways * fy;
  const vy = forward * fy + sideways * fx;
  return { x: car.x + vx * dt, y: car.y + vy * dt, heading, vx, vy };
}

/** Top speed in each gear, in m/s. */
const GEARS = [13, 21, 30, 39, 48] as const;
const SHIFT_RPM = 6800;
const IDLE_RPM = 900;

/** Engine revs for a road speed, for the exhaust note: they climb through each gear and drop at the change. */
export function engineRpm(speed: number): number {
  const pace = Math.abs(speed);
  const top = GEARS.find((g) => pace < g) ?? GEARS[GEARS.length - 1]!;
  return clamp((SHIFT_RPM * pace) / top, IDLE_RPM, SHIFT_RPM);
}

/** Keys are all or nothing, so the wheel is eased towards where the keys ask. */
export function easeSteer(current: number, target: number, dt: number): number {
  const rate = target === 0 ? 9 : 6;
  return current + clamp(target - current, -rate * dt, rate * dt);
}
