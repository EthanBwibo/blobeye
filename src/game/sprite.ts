/**
 * The car seen from above, taken from the same traced numbers as the 3D body in `src/car/model.ts`.
 * Shapes are in car units (the car is 100 long) as [forward, right]: forward is towards the nose.
 */
import { CABIN, PARTS, PLAN, WHEELS, topHalfWidth, type Pair } from '../car/model';

/** The body's outline: down one side from nose to tail, and back up the other. */
export function planOutline(): Pair[] {
  return [...PLAN.map(([z, w]) => [z, -w] as const), ...[...PLAN].reverse().map(([z, w]) => [z, w] as const)];
}

/** A strip down the middle of the car between two positions along it, as wide as `halfWidth` says. */
function strip(from: number, to: number, halfWidth: (z: number) => number, steps = 12): Pair[] {
  const zs = Array.from({ length: steps + 1 }, (_, i) => from + ((to - from) * i) / steps);
  return [...zs.map((z) => [z, -halfWidth(z)] as const), ...zs.reverse().map((z) => [z, halfWidth(z)] as const)];
}

/** The glass and roof together: from the bottom of the windscreen to the bottom of the rear screen. */
export function cabinOutline(): Pair[] {
  return strip(CABIN.cowl, CABIN.deck, (z) => topHalfWidth(z) - 0.6);
}

export function roofOutline(): Pair[] {
  return strip(CABIN.roofFront - 0.8, CABIN.roofRear + 0.8, () => CABIN.roofHalfWidth - 0.9, 1);
}

export function scoopOutline(): Pair[] {
  const { scoop } = PARTS;
  return strip(scoop.front, scoop.rear, () => scoop.halfWidth, 1);
}

export function wingOutline(): Pair[] {
  const { wing } = PARTS;
  return strip(wing.front, wing.rear, () => wing.halfWidth, 1);
}

export interface WheelSpot {
  /** The middle of the tyre. */
  at: Pair;
  front: boolean;
}

export const WHEEL_SPOTS: readonly WheelSpot[] = [WHEELS.frontZ, WHEELS.rearZ].flatMap((z) =>
  [-1, 1].map((side) => ({ at: [z, side * WHEELS.track] as const, front: z > 0 })),
);

/** A tyre from above: its length along the car and its width across. */
export const WHEEL_SIZE = { length: WHEELS.radius * 2, width: WHEELS.width } as const;
