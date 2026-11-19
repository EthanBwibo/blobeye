/**
 * What lies in wait along a stage: rocks on the road, a ford, a narrow bridge, zebra crossing, crests,
 * stretches of sand, mud, washout, a cattle grid or a splash, fallen branches, and other animals: giraffe,
 * warthogs, ostrich and flamingos.
 * Pure functions in road coordinates: `along` is metres along the road and `across` is metres to the right
 * of its middle. `stage.ts` turns these into places on the ground and applies them to the car.
 *
 * The hazards are invented, like the route. The numbers are tuned for feel.
 */

import { SURFACES, blendSurface, type Surface } from './handling';

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
  /** Stretches of the road that are not plain murram. Optional: a stage without any leaves it out. */
  patches?: readonly Patch[];
  /** Fallen branches lying out from the edge of the road. */
  branches?: readonly Branch[];
  /** Animals other than the zebra. */
  animals?: readonly Animals[];
}

/** What a stretch of road is, besides plain murram. */
export type PatchKind = 'sand' | 'mud' | 'washout' | 'grid' | 'splash';

/** A stretch of road from one distance to another, all the way across. */
export interface Patch {
  kind: PatchKind;
  from: number;
  to: number;
}

/** A fallen acacia branch: it lies from the edge of the road on `side` (1 is the right), `reach` metres in. */
export interface Branch {
  along: number;
  side: 1 | -1;
  reach: number;
}

export type Species = 'giraffe' | 'warthog' | 'ostrich' | 'flamingo';

/**
 * A group of animals of one kind:
 * - giraffe cross the road slowly, out to `span / 2` either side and back, `gap` metres apart, like the zebra;
 * - warthogs dart across, `span` from side to side at `pace`, once every `every` seconds, then wait off the road;
 * - ostrich stand `out` metres off the edge on `side` until the car comes near, then run beside the road from `at` to `to`;
 * - flamingos stand in the water beside the road on `side`, and do not move.
 */
export type Animals =
  | { kind: 'giraffe'; at: number; count: number; gap: number; span: number; pace: number }
  | { kind: 'warthog'; at: number; count: number; span: number; pace: number; every: number }
  | { kind: 'ostrich'; at: number; to: number; count: number; side: 1 | -1; out: number; pace: number }
  | { kind: 'flamingo'; at: number; count: number; side: 1 | -1 };

/** How big each kind is on the ground, as a circle the car can hit. */
export const ANIMAL_SIZE: Record<Species, number> = { giraffe: 1.3, warthog: 0.55, ostrich: 0.6, flamingo: 0.35 };

/** Every animal on the stage, the zebra too. */
export type AnimalKind = 'zebra' | Species;

/**
 * Hitting an animal. It is knocked aside and the car loses this share of its speed, in proportion to the
 * animal's size: a giraffe or a zebra a lot, a warthog a little. `PENALTY` seconds go on the clock for each.
 * Below `slowest` m/s the car only nudges it, as it would a rock.
 */
export const HIT = {
  cost: { giraffe: 0.5, zebra: 0.4, ostrich: 0.16, warthog: 0.1, flamingo: 0.05 } as Record<AnimalKind, number>,
  penalty: 5,
  slowest: 3,
} as const;

/**
 * How a struck animal goes, cartoon fashion and with no harm shown: thrown the way the car was going and
 * away from it, it tumbles over once for `tumble` seconds and comes to rest on its side beside the road.
 * The big ones (`LIES_DOWN`) stay lying there; the rest lie dazed for `daze` seconds, get up over `rise`,
 * and limp off into the bush at `limp` m/s for `wander` metres.
 */
export const TUMBLE = { tumble: 1.1, grip: 2, daze: 1.2, rise: 0.35, limp: 1.3, wander: 14 } as const;
export const LIES_DOWN: Record<AnimalKind, boolean> = { giraffe: true, zebra: true, warthog: false, ostrich: false, flamingo: false };
/** Half the width of each kind's body, so one lying on its side lies on the ground and not half under it. */
export const HALF_WIDTH: Record<AnimalKind, number> = { giraffe: 0.4, zebra: 0.32, warthog: 0.25, ostrich: 0.3, flamingo: 0.12 };

/** A struck animal, from the moment it was hit. Places are on the ground, as in `stage.ts`. */
export interface Knocked {
  kind: AnimalKind;
  /** Which animal it was, as `creaturesAt` names them. */
  id: string;
  /** The clock when it was hit. */
  at: number;
  /** Where it was hit, where it comes to rest, and which way it limps off from there (a unit vector away from the road). */
  from: readonly [number, number];
  rest: readonly [number, number];
  away: readonly [number, number];
  /** The way it faced when hit, and how far it spins round as it tumbles, in radians. */
  heading: number;
  spin: number;
  /** How high it is thrown, in metres. */
  hop: number;
}

/** A struck animal's place at a moment: `roll` is how far it is turned over onto its side (π/2 is lying flat), `lift` its height off the ground. */
export interface KnockedPose {
  x: number;
  y: number;
  heading: number;
  roll: number;
  lift: number;
}

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** Where a struck animal is, `time` on the run's clock. */
export function knockedPose(k: Knocked, time: number): KnockedPose {
  const since = Math.max(0, time - k.at);
  const { tumble, grip, daze, rise, limp, wander } = TUMBLE;
  const flat = HALF_WIDTH[k.kind];
  if (since < tumble) {
    // Fast at first and slowing, over to the place it comes to rest.
    const share = (1 - Math.exp(-grip * since)) / (1 - Math.exp(-grip * tumble));
    const u = since / tumble;
    // Once right over and onto its side.
    const roll = (Math.PI * 2 + Math.PI / 2) * (1 - (1 - u) * (1 - u));
    return {
      x: k.from[0] + (k.rest[0] - k.from[0]) * share,
      y: k.from[1] + (k.rest[1] - k.from[1]) * share,
      heading: k.heading + k.spin * share,
      roll,
      lift: k.hop * Math.sin(Math.PI * Math.min(1, u * 1.6)) * (u < 0.625 ? 1 : 0) + flat * Math.abs(Math.sin(roll)),
    };
  }
  const lying = { x: k.rest[0], y: k.rest[1], heading: k.heading + k.spin, roll: Math.PI / 2, lift: flat };
  const after = since - tumble;
  if (LIES_DOWN[k.kind] || after < daze) return lying;
  const up = smooth((after - daze) / rise);
  const walked = Math.min(wander, Math.max(0, after - daze - rise) * limp);
  const facing = Math.atan2(k.away[1], k.away[0]);
  const turn = Math.atan2(Math.sin(facing - lying.heading), Math.cos(facing - lying.heading));
  // A limp: a dip and a lean on every other step, until it stops.
  const step = walked < wander ? Math.sin((after - daze - rise) * 7) : 0;
  return {
    x: k.rest[0] + k.away[0] * walked,
    y: k.rest[1] + k.away[1] * walked,
    heading: lying.heading + turn * up,
    roll: (Math.PI / 2) * (1 - up) + 0.12 * up * Math.max(0, step),
    lift: flat * (1 - up) + 0.05 * up * Math.abs(step),
  };
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
  // The lake shore is wet: mud on the way down to the ford.
  patches: [{ kind: 'mud', from: 520, to: 546 }],
  // On the outside of the long right after the ford: run wide and it is waiting.
  branches: [{ along: 860, side: -1, reach: 3.2 }],
  animals: [
    // Standing in the shallows beside the ford, on the left.
    { kind: 'flamingo', at: 556, count: 9, side: -1 },
    // Two giraffe crossing slowly before the crest.
    { kind: 'giraffe', at: 1632, count: 2, gap: 16, span: 40, pace: 1.1 },
  ],
};

/** A stage with nothing on it, for tests of the bare road. */
export const NO_HAZARDS: Hazards = {
  rocks: [],
  water: NO_WATER,
  bridge: NO_BRIDGE,
  zebra: NO_ZEBRA,
  crests: [],
  patches: [],
  branches: [],
  animals: [],
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

/** The stretch of road at a distance along it, or null on plain murram. */
export function patchAt(hazards: Hazards, along: number): Patch | null {
  return hazards.patches?.find((p) => along >= p.from && along <= p.to) ?? null;
}

/**
 * Off the road: the grass verge starts `blend` metres past the edge and runs `grass` metres out; then the
 * bush, which takes `into` metres to reach. Grip falls away by degrees, so running wide is a mistake, not a wall.
 */
export const VERGE = { blend: 2, grass: 4, into: 8 } as const;

/** What the tyres are on, at a distance along the road and `offset` metres from its middle. */
export function surfaceAt(hazards: Hazards, along: number, offset: number, halfWidth: number): Surface {
  const patch = patchAt(hazards, along);
  const road: Surface = patch && patch.kind !== 'splash' ? SURFACES[patch.kind] : SURFACES.murram;
  const out = offset - halfWidth;
  if (out <= 0) return road;
  const verge = blendSurface(road, SURFACES.grass, out / VERGE.blend);
  return blendSurface(verge, SURFACES.bush, (out - VERGE.grass) / VERGE.into);
}

/** Whether the car is in water: the ford, or a splash. */
export function inAnyWater(hazards: Hazards, along: number): boolean {
  return inWater(hazards, along) || patchAt(hazards, along)?.kind === 'splash';
}

/** A branch as solid circles on the road, in road coordinates: from the edge inward, angled a little along it. */
export function branchParts(branch: Branch, halfWidth: number): Rock[] {
  const parts: Rock[] = [];
  const count = Math.max(2, Math.ceil(branch.reach / 0.6));
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    // Thick at the butt by the verge, thin at the tip on the road.
    parts.push({ along: branch.along + t * branch.reach * 0.35, across: branch.side * (halfWidth + 0.6 - t * (branch.reach + 0.6)), r: 0.42 - t * 0.17 });
  }
  return parts;
}

/** One animal, in road coordinates. `facing` is the way it looks, in radians from straight up the road; positive turns right. */
export interface AnimalSpot {
  kind: Species;
  /** Which animal: its group and its place in it, the same on every run. */
  id: string;
  along: number;
  across: number;
  facing: number;
}

/** A number from 0 up to 1 for each `i`, the same every time: for spreading a flock about. */
const hash = (i: number, salt: number) => {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** Ostrich take off when the car comes within this many metres of where they stand. */
export const OSTRICH_WAKE = 70;

/**
 * Where every animal other than the zebra is, `time` seconds into the run. `woke` holds, for each group, the
 * clock when it was startled into running (only ostrich wait for that), or null. Like the zebra, they are the
 * same on every run, so they can be learned.
 */
export function animalsAt(hazards: Hazards, time: number, woke: readonly (number | null)[], halfWidth: number): AnimalSpot[] {
  const spots: AnimalSpot[] = [];
  (hazards.animals ?? []).forEach((group, g) => {
    for (let i = 0; i < group.count; i++) {
      if (group.kind === 'giraffe') {
        const walked = time * group.pace - i * group.gap;
        const lap = ((walked % (group.span * 2)) + group.span * 2) % (group.span * 2);
        const out = lap < group.span;
        spots.push({ kind: 'giraffe', id: `${g}.${i}`, along: group.at + i * 3.5, across: out ? lap - group.span / 2 : group.span * 1.5 - lap, facing: out ? Math.PI / 2 : -Math.PI / 2 });
      } else if (group.kind === 'warthog') {
        // Each goes a moment after the one in front, in a line.
        const own = time - i * 0.35 + group.every * 1000;
        const round = Math.floor(own / group.every);
        const way = round % 2 ? 1 : -1;
        const into = Math.min(group.span, (own - round * group.every) * group.pace);
        spots.push({ kind: 'warthog', id: `${g}.${i}`, along: group.at + i * 1.4, across: way * (into - group.span / 2), facing: (way * Math.PI) / 2 });
      } else if (group.kind === 'ostrich') {
        const start = woke[g] ?? null;
        const run = start === null ? 0 : Math.max(0, time - start) * group.pace;
        const along = Math.min(group.to, group.at + run) + i * 3;
        // They weave a little as they run.
        const sway = start === null ? 0 : Math.sin(along * 0.18 + i) * 0.6;
        spots.push({ kind: 'ostrich', id: `${g}.${i}`, along, across: group.side * (halfWidth + group.out + i * 1.6) + sway, facing: 0 });
      } else {
        spots.push({
          kind: 'flamingo',
          id: `${g}.${i}`,
          along: group.at + (hash(i, 1) - 0.5) * 22,
          across: group.side * (halfWidth + 3 + hash(i, 2) * 14),
          facing: hash(i, 3) * Math.PI * 2,
        });
      }
    }
  });
  return spots;
}
