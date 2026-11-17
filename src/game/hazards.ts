/**
 * What lies in wait along a stage: rocks on the road, a ford, a narrow bridge, zebra crossing, and crests.
 * Pure functions in road coordinates: `along` is metres along the road and `across` is metres to the right
 * of its middle. `stage.ts` turns these into places on the ground and applies them to the car.
 *
 * The hazards are invented, like the route. The numbers are tuned for feel.
 */

export interface Rock {
  along: number;
  across: number;
  /** Its radius on the ground. */
  r: number;
}

export interface Hazards {
  /** Rocks lying on the road. They are solid: hitting one stops most of the car's speed. */
  rocks: readonly Rock[];
  /** A ford. The water drags at the car and throws up spray. */
  water: { from: number; to: number };
  /** A bridge over a gully. Rails funnel the road down to `half` over `taper` metres before and after it. */
  bridge: { from: number; to: number; taper: number; half: number };
  /** A herd walking across the road and back, `gap` metres apart, out to `span / 2` either side. */
  zebra: { at: number; count: number; gap: number; span: number; pace: number; r: number };
  /** Humps in the road, in the order they come, none overlapping. Taken fast, the car flies. */
  crests: readonly Crest[];
}

/** A hump in the road, `height` at its top and `reach` metres long each side. */
export interface Crest {
  at: number;
  reach: number;
  height: number;
}

/** The ford, the bridge and the herd, for a stage that has none of them. */
export const NO_WATER: Hazards['water'] = { from: -2, to: -1 };
export const NO_BRIDGE: Hazards['bridge'] = { from: -2, to: -1, taper: 0, half: Infinity };
export const NO_ZEBRA: Hazards['zebra'] = { at: -1000, count: 0, gap: 1, span: 1, pace: 0, r: 0 };

/** The Naivasha stage's hazards. Distances are along the road as `buildStage` lays it by default. */
export const HAZARDS: Hazards = {
  // On the outside of a long left: run wide and they are waiting.
  rocks: [
    { along: 318, across: 5.6, r: 1.0 },
    { along: 323, across: 3.4, r: 0.8 },
    { along: 329, across: 5.0, r: 1.1 },
    { along: 334, across: 2.8, r: 0.7 },
  ],
  water: { from: 548, to: 564 },
  bridge: { from: 950, to: 978, taper: 26, half: 2.5 },
  zebra: { at: 1108, count: 5, gap: 9, span: 64, pace: 2.6, r: 1.1 },
  crests: [{ at: 1700, reach: 20, height: 1.4 }],
};

/** A stage with nothing on it, for tests of the bare road. */
export const NO_HAZARDS: Hazards = {
  rocks: [],
  water: NO_WATER,
  bridge: NO_BRIDGE,
  zebra: NO_ZEBRA,
  crests: [],
};

export const GRAVITY = 9.81;
/** The car as a circle, for bumping into things. */
export const CAR_RADIUS = 0.9;
/**
 * Share of speed the ford takes per second. Drag like this costs the same speed for every metre of
 * water whatever the pace: this many metres per second, per metre.
 */
export const WATER_DRAG = 0.5;
/** The same for the bridge rails, while the car scrapes along them. */
export const RAIL_DRAG = 0.5;
/** The rails only catch a car this close outside them; further out it is in the gully, not on the bridge. */
export const RAIL_REACH = 3;
/** Speed along a rock or a zebra that is kept when the car hits it, and how much of the speed into it bounces back. */
export const KNOCK = { keep: 0.6, bounce: 0.3 } as const;
/** Speed kept on landing from a jump. */
export const LANDING = 0.95;

/** The road under the car: how high it is, how steeply it climbs, and how sharply that changes (negative over a crest). */
export interface Ground {
  height: number;
  slope: number;
  arch: number;
}

/** The road's height and shape at a distance along it. Flat, except for the crests. */
export function underAt(hazards: Hazards, along: number): Ground {
  const crest = hazards.crests.find((c) => Math.abs(along - c.at) < c.reach);
  if (!crest) return { height: 0, slope: 0, arch: 0 };
  const { at, reach, height } = crest;
  const from = along - at;
  const turn = Math.PI / reach;
  return {
    height: (height * (1 + Math.cos(turn * from))) / 2,
    slope: (-height * turn * Math.sin(turn * from)) / 2,
    arch: (-height * turn * turn * Math.cos(turn * from)) / 2,
  };
}

/** How high the road is at a distance along it. */
export function groundAt(hazards: Hazards, along: number): number {
  return underAt(hazards, along).height;
}

/** How far from the middle the car may be at a distance along the road: the road's half width, less at the bridge. */
export function roomAt(hazards: Hazards, along: number, halfWidth: number): number {
  const { from, to, taper, half } = hazards.bridge;
  if (half >= halfWidth || along <= from - taper || along >= to + taper) return halfWidth;
  const outside = along < from ? from - along : along > to ? along - to : 0;
  return half + (halfWidth - half) * (outside / taper);
}

export function inWater(hazards: Hazards, along: number): boolean {
  return along >= hazards.water.from && along <= hazards.water.to;
}

export interface ZebraSpot {
  along: number;
  across: number;
  /** 1 walking to the right of the road, -1 walking back. */
  facing: 1 | -1;
}

/** Where each zebra is, `time` seconds into the run. The herd is the same on every run, so it can be learned. */
export function zebraAt(hazards: Hazards, time: number): ZebraSpot[] {
  const { at, count, gap, span, pace } = hazards.zebra;
  const herd: ZebraSpot[] = [];
  for (let i = 0; i < count; i++) {
    // Out across the road and back again: one lap of this is `span` there and `span` back.
    const walked = time * pace - i * gap;
    const lap = ((walked % (span * 2)) + span * 2) % (span * 2);
    const out = lap < span;
    herd.push({
      // Not in single file: each keeps a little ahead of or behind the next.
      along: at + (((i * 7) % 5) - 2) * 1.2,
      across: out ? lap - span / 2 : span * 1.5 - lap,
      facing: out ? 1 : -1,
    });
  }
  return herd;
}

export interface Flight {
  /** Height of the car above the flat ground. */
  height: number;
  /** How fast that is changing. */
  rise: number;
  airborne: boolean;
}

/**
 * The car's height as the road rises and falls under it. It follows the ground until the ground drops
 * away faster than the car can fall, which is what a crest does at speed: then it flies, and comes down
 * where its fall meets the road again. `under` is the road where the car now is, and `pace` its speed
 * along it. `landed` is true on the step it comes back down.
 */
export function stepFlight(flight: Flight, under: Ground, pace: number, dt: number): Flight & { landed: boolean } {
  // On the ground the car rises as fast as the road does.
  const grounded = { height: under.height, rise: under.slope * pace, airborne: false };
  if (!flight.airborne) {
    // Over a crest the road curves away downwards. Faster than gravity, and the wheels leave it.
    return { ...grounded, airborne: -under.arch * pace * pace > GRAVITY, landed: false };
  }
  const height = flight.height + flight.rise * dt - (GRAVITY * dt * dt) / 2;
  if (height > under.height) return { height, rise: flight.rise - GRAVITY * dt, airborne: true, landed: false };
  return { ...grounded, landed: true };
}
