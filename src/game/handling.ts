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
  /** 0 to 1. Locks the rear wheels: the tail lets go and the nose swings round, for hairpins. Never reverses. */
  handbrake?: number;
}

export const HANDLING = {
  /** Pull away at this rate, in m/s². It tails off towards top speed. */
  accel: 15,
  topSpeed: 46,
  brake: 26,
  reverseSpeed: 8,
  /** Share of speed lost per second with the throttle shut. */
  coast: 0.4,
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
  /** The handbrake slows the car at this rate, in m/s², and only going forwards. */
  handbrake: 9,
  /** Sideways grip with the handbrake on: the rear wheels are locked, so the tail barely holds. */
  handbrakeGrip: 0.9,
  /** With the handbrake on the nose swings this much faster for the same turn of the wheel. */
  handbrakeTurn: 1.8,
} as const;

/**
 * What the tyres are on. Off the road, and on sand and mud, the car does not stop dead: it grips less and
 * is held back a little, so it can always be driven back.
 */
export interface Surface {
  /** Sideways grip, as a share of the road's. Lower slides more. */
  grip: number;
  /** Share of speed lost per second on top of the usual. */
  drag: number;
  /** The fastest the car can be driven here, in m/s. */
  top: number;
  /** How much of the throttle and the brakes reach the ground, as a share. */
  bite: number;
}

export const SURFACES = {
  /** Red murram: the road itself. */
  murram: { grip: 1, drag: 0, top: HANDLING.topSpeed, bite: 1 },
  /** Loose sand: the tail slides, and it drags. */
  sand: { grip: 0.42, drag: 0.3, top: 38, bite: 0.75 },
  /** Mud: slippery, with little to push or brake against. */
  mud: { grip: 0.3, drag: 0.12, top: 40, bite: 0.55 },
  /** The grass verge beside the road. */
  grass: { grip: 0.7, drag: 0.18, top: 36, bite: 0.85 },
  /** Further out, in the bush: slower, but never a wall. */
  bush: { grip: 0.5, drag: 0.55, top: 24, bite: 0.7 },
  /** Where the rains have cut the road away: ruts and holes that slow anything. */
  washout: { grip: 0.6, drag: 0.9, top: 24, bite: 0.7 },
  /** A cattle grid: steel bars across the road. A rattle, and a little less grip. */
  grid: { grip: 0.85, drag: 0.15, top: HANDLING.topSpeed, bite: 1 },
} as const satisfies Record<string, Surface>;

/** One surface turning into another: `t` of 0 is `a`, 1 is `b`. */
export function blendSurface(a: Surface, b: Surface, t: number): Surface {
  const k = Math.min(1, Math.max(0, t));
  const mix = (x: number, y: number) => x + (y - x) * k;
  return { grip: mix(a.grip, b.grip), drag: mix(a.drag, b.drag), top: mix(a.top, b.top), bite: mix(a.bite, b.bite) };
}

const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v));

/** Speed along the nose (negative when reversing) and across it (positive when sliding to the car's right). */
export function carSpeeds(car: CarState): { forward: number; sideways: number } {
  const fx = Math.cos(car.heading);
  const fy = Math.sin(car.heading);
  return { forward: car.vx * fx + car.vy * fy, sideways: -car.vx * fy + car.vy * fx };
}

/** Advance the car by `dt` seconds on `ground`: a surface, or true for the road and false for the bush. Returns a new state. */
export function stepCar(car: CarState, input: DriveInput, dt: number, ground: Surface | boolean = true): CarState {
  const H = HANDLING;
  const under: Surface = ground === true ? SURFACES.murram : ground === false ? SURFACES.bush : ground;
  const throttle = clamp(input.throttle, 0, 1);
  const brake = clamp(input.brake, 0, 1);
  const steer = clamp(input.steer, -1, 1);
  const handbrake = clamp(input.handbrake ?? 0, 0, 1);

  // Swing the nose. The car keeps travelling the way it was going, so this is what starts a slide.
  const before = carSpeeds(car).forward;
  const pace = Math.abs(before);
  const bite = Math.min(1, pace / H.steerFrom) / (1 + pace / H.steerFade);
  const swing = 1 + (H.handbrakeTurn - 1) * handbrake;
  const heading = car.heading + steer * H.turnRate * bite * swing * Math.sign(before) * dt;

  let { forward, sideways } = carSpeeds({ ...car, heading });

  if (throttle > 0) forward += throttle * H.accel * under.bite * Math.max(0, 1 - forward / under.top) * dt;
  if (brake > 0) {
    if (forward > 0.5) forward = Math.max(0, forward - brake * H.brake * under.bite * dt);
    else forward = Math.max(-H.reverseSpeed, forward - brake * H.accel * 0.5 * under.bite * dt);
  }
  if (handbrake > 0 && forward > 0) forward = Math.max(0, forward - handbrake * H.handbrake * dt);
  // Over its top speed, a surface holds the car back gently rather than all at once.
  const over = Math.max(0, forward - under.top) / under.top;
  const drag = (throttle > 0 ? 0 : H.coast) + under.drag + over * 0.8;
  forward *= Math.exp(-drag * dt);

  // The tyres scrub off sideways speed. Less so with the wheel turned and a pedal down, and hardly at all
  // with the rear wheels locked.
  const provoke = Math.abs(steer) * Math.max(throttle, brake);
  const grip = ((H.grip + (H.slideGrip - H.grip) * provoke) * (1 - handbrake) + H.handbrakeGrip * handbrake) * under.grip;
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

/** The gear the car is in at a road speed, as the instruments show it: 1 to 5, or R going backwards. */
export function gearFor(speed: number): number | 'R' {
  if (speed < -0.5) return 'R';
  const i = GEARS.findIndex((g) => Math.abs(speed) < g);
  return (i < 0 ? GEARS.length - 1 : i) + 1;
}

/** Keys are all or nothing, so the wheel is eased towards where the keys ask. */
export function easeSteer(current: number, target: number, dt: number): number {
  const rate = target === 0 ? 9 : 6;
  return current + clamp(target - current, -rate * dt, rate * dt);
}
