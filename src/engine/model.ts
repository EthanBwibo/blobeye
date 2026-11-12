/**
 * The engine model. Everything the drawing shows and the speaker plays is
 * derived from these numbers, so the two can never disagree.
 *
 * Angles are crankshaft degrees. One full four-stroke cycle is 720 degrees.
 */

export type HeaderMode = 'unequal' | 'equal';

export interface Cylinder {
  /** Subaru's cylinder number. 1 and 3 are on the car's right, 2 and 4 on its left. */
  n: 1 | 2 | 3 | 4;
  /** Which bank: -1 is the car's right, +1 is the car's left. */
  side: -1 | 1;
  /** Position along the crankshaft. Positive is toward the front of the car. */
  z: number;
  /** Angle of this cylinder's crank pin relative to cylinder 2's, in radians. */
  pinOffset: number;
  /** Crank angle at which this cylinder fires. */
  fireAt: number;
}

/** Firing order 1-3-2-4, one cylinder every 180 degrees. */
export const CYLINDERS: readonly Cylinder[] = [
  { n: 1, side: -1, z: 0.75, pinOffset: Math.PI, fireAt: 0 },
  { n: 2, side: 1, z: 0.45, pinOffset: 0, fireAt: 360 },
  { n: 3, side: -1, z: -0.45, pinOffset: 0, fireAt: 180 },
  { n: 4, side: 1, z: -0.75, pinOffset: Math.PI, fireAt: 540 },
];

export const CYCLE = 720;
export const IDLE_RPM = 850;
export const LIMIT_RPM = 7000;
export const CRANK_RADIUS = 0.3;
export const ROD_LENGTH = 0.95;

/**
 * Crank degrees a pulse takes to travel from its exhaust port to the collector.
 * ILLUSTRATIVE, not measured: the values are exaggerated so the effect is easy
 * to see and hear. See docs/FACTS.md.
 */
export const PULSE_DELAY: Record<HeaderMode, Record<Cylinder['n'], number>> = {
  unequal: { 1: 60, 3: 60, 2: 150, 4: 150 },
  equal: { 1: 100, 2: 100, 3: 100, 4: 100 },
};

export function firingOrder(): number[] {
  return [...CYLINDERS].sort((a, b) => a.fireAt - b.fireAt).map((c) => c.n);
}

/** Degrees elapsed since `at`, wrapped into one cycle. */
export function degreesSince(crank: number, at: number): number {
  return (((crank - at) % CYCLE) + CYCLE) % CYCLE;
}

/** Crank angle at which a cylinder's pulse reaches the collector. */
export function arrivalAngle(c: Cylinder, mode: HeaderMode): number {
  return (c.fireAt + PULSE_DELAY[mode][c.n]) % CYCLE;
}

/** Gaps between successive pulses at the collector, starting from the earliest. */
export function pulseGaps(mode: HeaderMode): number[] {
  const arrivals = CYLINDERS.map((c) => arrivalAngle(c, mode)).sort((a, b) => a - b);
  return arrivals.map((a, i) => {
    const next = arrivals[(i + 1) % arrivals.length]!;
    return (next - a + CYCLE) % CYCLE || CYCLE;
  });
}

export interface PistonPose {
  /** Crank pin position in the engine's cross-section. */
  pinX: number;
  pinY: number;
  /** Wrist pin (piston) position along the cylinder axis. */
  wristX: number;
}

/** Slider-crank geometry for one cylinder at a given crank angle. */
export function pistonPose(c: Cylinder, crankDeg: number): PistonPose {
  const a = (crankDeg * Math.PI) / 180 + c.pinOffset;
  const pinX = CRANK_RADIUS * Math.cos(a);
  const pinY = CRANK_RADIUS * Math.sin(a);
  const wristX = pinX + c.side * Math.sqrt(ROD_LENGTH * ROD_LENGTH - pinY * pinY);
  return { pinX, pinY, wristX };
}

/** Move rpm toward idle or the limiter. Revs climb slower than they fall. */
export function stepRpm(rpm: number, throttle: boolean, dt: number): number {
  const target = throttle ? LIMIT_RPM : IDLE_RPM;
  const rate = throttle ? 1.5 : 2.2;
  return rpm + (target - rpm) * (1 - Math.exp(-dt * rate));
}

/**
 * How fast the drawing turns, in revolutions per second. The real engine is far
 * too fast to follow, so the drawing runs in slow motion and speeds up with revs.
 */
export function drawingRevsPerSecond(rpm: number, reducedMotion: boolean): number {
  const base = reducedMotion ? 0.18 : 0.32;
  return base + ((rpm - IDLE_RPM) / (LIMIT_RPM - IDLE_RPM)) * 5;
}

/** Live state shared by the drawing, the sound and the controls. */
export interface EngineState {
  mode: HeaderMode;
  rpm: number;
  throttle: boolean;
  running: boolean;
  crank: number;
}

export function createEngineState(): EngineState {
  return { mode: 'unequal', rpm: IDLE_RPM, throttle: false, running: false, crank: 0 };
}

export function stepEngine(s: EngineState, dt: number, reducedMotion: boolean): void {
  s.rpm = stepRpm(s.rpm, s.throttle, dt);
  s.crank = (s.crank + drawingRevsPerSecond(s.rpm, reducedMotion) * 360 * dt) % CYCLE;
}
