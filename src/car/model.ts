/**
 * The shape of the car body, as numbers. The drawing in `src/scene/carScene.ts` is built from this.
 *
 * Units: the car is 100 long, so every number reads as a percentage of its length.
 * Axes match the engine: +z is the front of the car, -x is the car's right, +y is up, y = 0 is the ground.
 *
 * The points were traced from two reference drawings kept out of the repo in `docs/reference/`:
 *   A. `blobeye-blueprint.png`, the road car: side, front and rear views.
 *   B. `blobeye-wrc-top-view.png`, the rally car of the same body shape: top view only.
 * Drawing A's printed length, width and height set the proportions. They are not shown on the site.
 */

export type Pair = readonly [number, number];
export type Point = readonly [x: number, y: number, z: number];

/** Upper outline from nose to tail, as [z, height]. Traced from A, side view. Scoop, mirror and wing left out. */
export const SIDE_TOP: readonly Pair[] = [
  [49.9, 12.1], [49.7, 13.2], [48.8, 14.4], [48.4, 15.7], [48.2, 16.3], [46.9, 17.1], [45.2, 18.0], // nose and bumper
  [42.9, 18.8], [39.5, 19.7], [36.0, 20.3], [32.6, 20.8], [28.8, 21.3], [25.0, 21.8], [21.1, 22.6], // bonnet
  [16.6, 25.9], [11.9, 29.3], [7.8, 31.7], // windscreen: steeper than the first trace, so the cabin stands up
  [4.8, 32.3], [-1.0, 32.6], [-13.4, 32.6], [-18.0, 32.3], // roof
  [-20.6, 31.4], [-23.8, 29.3], [-27.2, 27.0], [-30.8, 25.1], [-34.2, 24.1], // rear screen: falls away sooner
  [-37.2, 23.8], [-42.1, 23.4], [-46.8, 23.0], // boot
  [-47.2, 20.3], [-47.7, 17.1], [-48.1, 15.1], [-49.1, 14.6], [-50.0, 13.8], // tail and bumper
];

/** Lower outline from nose to tail, as [z, height]: bumpers and sill. Traced from A, side view. The wheel arches are separate. */
export const SIDE_BOTTOM: readonly Pair[] = [
  [49.9, 7.3], [49.0, 7.1], [48.9, 5.2], [36.5, 5.2], // front bumper
  [20.7, 4.8], [-20.2, 4.8], // sill
  [-35.7, 6.3], [-40.6, 6.3], [-43.6, 7.1], [-47.0, 7.9], [-48.5, 9.2], [-49.6, 10.0], [-50.0, 10.9], // rear bumper
];

/** The line under the side windows, carried on to the nose and tail, as [z, height]. Traced from A, side view. */
export const BELT: readonly Pair[] = [
  [42.0, 19.0], [20.7, 20.7], [12.2, 20.8], [-7.0, 21.2], [-27.2, 22.2], [-36.8, 23.7], [-45.3, 23.2],
];

/**
 * Half the body's width along its length, as [z, half-width]. Traced from B, top view, then scaled so the
 * widest point matches drawing A's overall width, because the rally car's arches are wider than the road car's.
 * The two bulges are the wheel arches.
 */
export const PLAN: readonly Pair[] = [
  [50.0, 3.6], [49.6, 8.4], [49.1, 10.4], [48.7, 12.0], [47.8, 14.1], [46.0, 17.0], [44.2, 18.1], [42.4, 18.6], // nose
  [38.8, 19.3], [33.4, 19.7], [22.6, 19.6], [20.8, 19.0], // front arch
  [19.0, 18.4], [-11.6, 18.4], // doors
  [-15.2, 19.0], [-17.0, 19.2], [-20.6, 19.4], [-24.2, 19.7], [-33.1, 19.7], [-36.7, 19.4], // rear arch
  [-38.5, 19.0], [-40.3, 18.6], [-42.1, 18.1], [-43.9, 17.6], [-45.7, 17.0], [-47.5, 15.9], [-49.3, 11.4], [-50.0, 4.3], // tail
];

/** Half-width at the doors, between the arches. From B, top view, scaled as above. */
export const DOOR_HALF_WIDTH = 18.4;

/** Cabin taper, from A, front view: the glass leans in from the belt to the edge of the roof. */
export const CABIN = {
  /** Half-width of the roof at its edge. */
  roofHalfWidth: 12.5,
  /** How far the glass sits inside the body side at the belt. */
  beltInset: 0.95,
  /** Where the windscreen meets the bonnet, the roof begins, the roof ends, and the rear screen meets the boot. */
  cowl: 21.1,
  roofFront: 6.0,
  roofRear: -18.6,
  deck: -37.2,
} as const;

/** Wheels and arches. Sizes and axle positions from A, side view; track from A, front view. */
export const WHEELS = {
  frontZ: 28.8,
  rearZ: -28.2,
  radius: 7.35,
  rimRadius: 5.43,
  archRadius: 8.52,
  /** Distance from the centre line to the middle of the tyre. */
  track: 16.8,
  width: 5.2,
  /** How far the spokes' faces sit back from the rim's lip, and the hub further still: the dish. */
  dish: 0.9,
  /** How far the tyre's sidewall bulges out past the rim's edge, at its widest. */
  bulge: 0.3,
} as const;

/**
 * The tyre's cross-section as [radius, across], from the inner bead round the tread to the outer bead.
 * `across` is 0 in the middle of the tyre and +half its width on the outer face. The sidewalls bulge out
 * past the bead, then roll over a rounded shoulder onto a flat tread.
 */
export function tyreProfile(): Pair[] {
  const { radius: R, rimRadius: rim, width, bulge } = WHEELS;
  const face = width / 2;
  const wall = (s: 1 | -1): Pair[] => {
    const points: Pair[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      // Up the sidewall from the bead: out to the bulge at about a third of the way, back in towards the shoulder
      const r = rim - 0.1 + t * (R - 0.55 - (rim - 0.1));
      points.push([r, s * (face + bulge * Math.sin(Math.PI * Math.min(1, t * 1.4)) - 0.25 * t * t)]);
    }
    // The shoulder, rounding onto the tread
    for (let i = 1; i <= 4; i++) {
      const a = (i / 4) * (Math.PI / 2);
      points.push([R - 0.55 + 0.55 * Math.sin(a), s * (face - 0.25 - 0.65 * (1 - Math.cos(a)))]);
    }
    return points;
  };
  return [...wall(-1), ...wall(1).reverse()];
}

/**
 * The rim's lip and barrel as [radius, across]: from deep inside the barrel, forward along it, up over a
 * rounded lip that stands proud of the tyre's bead, and down to tuck into the bead.
 */
export function rimProfile(): Pair[] {
  const { rimRadius: rim, width } = WHEELS;
  const face = width / 2;
  return [
    [rim - 0.55, face - 2.05],
    [rim - 0.55, face - 0.45],
    [rim - 0.7, face - 0.3],
    [rim - 0.62, face - 0.05],
    [rim - 0.4, face + 0.12],
    [rim - 0.12, face + 0.18],
    [rim + 0.08, face + 0.1],
    [rim + 0.14, face - 0.15],
  ];
}

/**
 * Signature parts. Positions along the car and heights are from A, side view. The parts on the nose and
 * tail are placed by angle, in degrees round the corner from straight ahead (or straight behind), so they
 * can wrap onto the wings: see `wrapPoint`. Their sizes started from A's front and rear views and were
 * then drawn larger, so they read at the size the car is shown.
 */
export const PARTS = {
  /** The bonnet is its own panel. `edge` is where it stops, as a place round the ring. */
  bonnet: { front: 44.5, rear: 22, edge: 10 },
  scoop: { front: 34.3, topFront: 33.1, topRear: 28.8, rear: 27.1, top: 22.6, halfWidth: 4.5 },
  wing: {
    /**
     * A low wing close to the boot. `under` is the lowest point of the plank at its ends and `camber` how far its
     * trailing edge curls up above its leading edge; `top` is the highest point of the profile. It is also bowed
     * across the car: `arch` higher in the middle. `upright` is how far out the uprights stand, at the boot edges.
     */
    front: -41.3, rear: -47.0, under: 25.0, top: 26.7, camber: 0.9, thick: 0.75, arch: 0.5, halfWidth: 15.0, upright: 14.25,
    /** Each upright is a short, thick blade, so there is only a slot of daylight between the wing and the boot lid. */
    strut: { baseFront: -42.4, baseRear: -45.9, topFront: -43.5, topRear: -45.7, halfThick: 0.45 },
    /** The plate on each end: how far it reaches below and above the plank, how far it sweeps back at the top, and its thickness. */
    endPlate: { below: 0.7, above: 1.0, sweep: 1.6, thick: 0.3 },
  },
  /**
   * The headlamps' insides, in the front view like `HEADLAMP_OUTLINE`: the two round lamps as [x, height, radius]
   * (the main beam outboard, the projector inboard, which is the round lamp drawn in A), the projector's own
   * small lens as a share of its lamp's radius, and the amber reflector at the outer end.
   */
  headlamp: {
    lamps: [[14.6, 15.4, 1.3], [11.86, 14.29, 1.16]],
    projector: 0.6,
    reflector: { x: 16.45, y: 14.2, halfWidth: 0.3, halfHeight: 0.75 },
  },
  grille: { top: 15.5, bottom: 13.0, topHalf: 17, bottomHalf: 14 },
  intake: { top: 9.3, bottom: 6.5, topHalf: 27, bottomHalf: 23 },
  fogCover: { angle: 43, y: 8.4, radius: 1.9 },
  /**
   * The tail lamps' insides, in the rear view like `TAIL_LAMP_OUTLINE`: the round lamp low on the inner side as
   * [x, height, radius], and the clear strip across the top, as its middle and half its width and height.
   */
  tailLamp: {
    lamps: [[11.66, 17.21, 0.87]],
    strip: { x: 14.2, y: 19.6, halfWidth: 2.7, halfHeight: 0.85 },
  },
  plate: { half: 15, top: 19.4, bottom: 16.3 },
  tailpipe: { x: 7.9, y: 6.9, radius: 1.15 },
  /** The side windows: where their front and rear edges meet the belt and the roof, and the middle of the B pillar. */
  glass: { frontLow: 18.0, frontTop: 5.2, rearTop: -18.0, rearLow: -29.8, pillar: -7.7, pillarHalf: 0.35 },
  doors: [18.6, -7.7, -22.9],
  /** Door handles, each from z to z, and the height they span. */
  handles: [[-3.0, -6.4], [-18.2, -21.6]],
  handleHeight: [18.5, 19.7],
  /**
   * The door mirrors: the middle of the housing, which is 2 out from its middle to its inner edge. Each is held off the
   * front door on a stalk of `stalk` radius, from a foot `foot` below the belt line.
   */
  mirror: { x: 22.3, y: 22.4, z: 13.2, halfWidth: 2.0, stalk: 0.32, foot: 0.55 },
} as const;

/** How much higher the wing's plank is at `x` across the car than at its ends: a shallow bow, highest in the middle. */
export function wingArch(x: number): number {
  const { arch, halfWidth } = PARTS.wing;
  const t = Math.min(1, Math.abs(x) / halfWidth);
  return arch * (1 - t * t);
}

/**
 * The headlamp's outline as A's front view shows it: a closed curve of [x, height] for the lamp on the car's
 * left, x being the distance from the centre line. Traced at A's scale and turned into car units. The outer
 * end is at the corner of the nose, so laid on the body (see `frontAngle`) it wraps round onto the wing.
 */
export const HEADLAMP_OUTLINE: readonly Pair[] = [
  [17.04, 13.23], [17.13, 14.18], [17.08, 15.24], [16.98, 16.2], [16.72, 16.89], [16.3, 17.23], [15.77, 17.34],
  [14.92, 17.34], [14.08, 17.27], [13.34, 17.08], [12.6, 16.75], [11.86, 16.39], [11.11, 16.0], [10.48, 15.62],
  [9.95, 15.24], [9.74, 14.71], [9.89, 14.08], [10.27, 13.44], [10.9, 13.0], [11.75, 12.85], [12.81, 13.08],
  [14.5, 13.17], [15.77, 13.19],
];

/** The tail lamp's outline as A's rear view shows it, as for `HEADLAMP_OUTLINE`: square on the outside, slanting in at the inner edge. */
export const TAIL_LAMP_OUTLINE: readonly Pair[] = [
  [17.36, 15.71], [17.55, 16.51], [17.57, 17.57], [17.57, 18.84], [17.55, 19.9], [17.42, 20.58], [17.13, 20.89],
  [16.62, 21.0], [15.56, 21.0], [14.5, 21.0], [13.65, 20.96], [12.91, 20.81], [12.24, 20.56], [11.64, 20.24],
  [11.18, 19.94], [10.82, 19.52], [10.61, 18.95], [10.39, 18.25], [10.1, 17.53], [9.78, 16.94], [9.51, 16.3],
  [9.38, 15.75], [11.11, 15.69], [13.02, 15.69], [14.92, 15.69], [16.41, 15.69],
];

/**
 * The angle, in degrees, at which `wrapPoint` lands on the nose (end = 1) or tail (end = -1) at height `y`
 * and at distance `x` from the centre line, as seen from straight ahead or behind. This lays a shape traced
 * in the front or rear view onto the body: each point keeps its place in that view.
 */
export function frontAngle(end: 1 | -1, x: number, y: number): number {
  let [low, high] = [0, 88];
  for (let i = 0; i < 16; i++) {
    const middle = (low + high) / 2;
    if (Math.abs(wrapPoint(end, (middle * Math.PI) / 180, y)[0]) < x) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/** Where a door mirror's stalk leaves the door: on the door skin just below the belt line, under the housing. */
export function mirrorFoot(): Point {
  const { z, foot } = PARTS.mirror;
  const y = lerpAt(BELT, z) - foot;
  return [sideX(z, y), y, z];
}

/** Where the centre of the engine sits in the car. */
export const ENGINE_BAY: Point = [0, 10.8, 33];

/** The middle of the car, for the camera to look at and the hero turn to pivot on. */
export const CAR_CENTRE: Point = [0, 15, 0];

/** Read a traced line at any position along the car. `points` run from nose to tail. */
export function lerpAt(points: readonly Pair[], z: number): number {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (z >= first[0]) return first[1];
  if (z <= last[0]) return last[1];
  const i = points.findIndex((p) => p[0] <= z);
  const a = points[i - 1]!;
  const b = points[i]!;
  return a[1] + ((b[1] - a[1]) * (a[0] - z)) / (a[0] - b[0]);
}

const mix = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));

/** Half-width of the body shell, without the arch flares, which are separate parts. */
export function bodyHalfWidth(z: number): number {
  return Math.min(lerpAt(PLAN, z), DOOR_HALF_WIDTH);
}

/** How far the arches stand out from the body side at this position along the car. */
export function flareAt(z: number): number {
  return Math.max(0, lerpAt(PLAN, z) - DOOR_HALF_WIDTH);
}

/** Half-width of the bonnet, roof or boot at its edge. The cabin narrows to the roof and widens again behind it. */
export function topHalfWidth(z: number): number {
  const edge = bodyHalfWidth(z) * 0.9;
  const { cowl, roofFront, roofRear, deck, roofHalfWidth } = CABIN;
  if (z >= cowl || z <= deck) return edge;
  if (z > roofFront) return mix(edge, roofHalfWidth, (cowl - z) / (cowl - roofFront));
  if (z >= roofRear) return roofHalfWidth;
  return mix(roofHalfWidth, edge, (roofRear - z) / (roofRear - deck));
}

/** Number of points round half a slice of the body. */
export const RING_SIZE = 16;
/** Places round the ring that the drawing refers to. */
export const RING = { floorCentre: 0, sill: 3, shoulder: 8, topEdge: 11, topCentre: 15 } as const;

/**
 * One slice across the car at `z`: sixteen [x, y] points up the car's left side, from the middle of the
 * floor (0), round the sill (3), up the curved side to the shoulder (8), in to the edge of the roof,
 * bonnet or boot (11), and over to the centre line (15).
 */
export function section(z: number): Pair[] {
  const w = bodyHalfWidth(z);
  const floor = lerpAt(SIDE_BOTTOM, z);
  const top = Math.max(floor + 0.6, lerpAt(SIDE_TOP, z));
  const shoulder = Math.max(floor + 0.4, Math.min(top - 1.0, lerpAt(BELT, z)));
  const edge = topHalfWidth(z);
  // Corners tighten where the body is small, at the very nose and tail.
  const k = Math.min(1, w / 10, (top - floor) / 8);
  const side = shoulder - floor;
  const rise = top - shoulder;
  const drop = Math.min(1.3, rise * 0.45);
  const glass = (t: number): Pair => [mix(w - CABIN.beltInset * k, edge, t) + 0.25 * k * Math.sin(Math.PI * t), mix(shoulder, top - drop, t)];
  return [
    [0, floor],
    [w * 0.6, floor],
    [w - 1.3 * k, floor],
    [w - 0.5 * k, floor + 0.5 * k],
    [w - 0.15 * k, floor + Math.min(1.6, side * 0.2)],
    [w, floor + side * 0.38],
    [w, floor + side * 0.72],
    [w - 0.3 * k, shoulder - Math.min(0.9, side * 0.12)],
    [w - CABIN.beltInset * k, shoulder],
    glass(0.34),
    glass(0.67),
    [edge, top - drop],
    [edge - 0.7 * k, top - drop * 0.5],
    [edge * 0.8, top - drop * 0.3],
    [edge * 0.5, top - drop * 0.1],
    [0, top],
  ];
}

/**
 * A point on the body's skin. `z` is the position along the car, `around` is the RING scale (0 to 15,
 * fractions allowed), and `side` is +1 for the car's left or -1 for its right.
 */
export function surfacePoint(z: number, around: number, side: 1 | -1 = 1): Point {
  const ring = section(z);
  const clamped = Math.min(RING_SIZE - 1, Math.max(0, around));
  const i = Math.min(RING_SIZE - 2, Math.floor(clamped));
  const t = clamped - i;
  const a = ring[i]!;
  const b = ring[i + 1]!;
  return [side * (a[0] + (b[0] - a[0]) * t), a[1] + (b[1] - a[1]) * t, z];
}

/** How far out the side of the body is at a given height, at this position along the car. */
export function sideX(z: number, y: number): number {
  const ring = section(z);
  for (let i = RING.sill; i < RING.topEdge; i++) {
    const a = ring[i]!;
    const b = ring[i + 1]!;
    if (y <= b[1]) return a[0] + ((b[0] - a[0]) * Math.max(0, y - a[1])) / Math.max(1e-6, b[1] - a[1]);
  }
  return ring[RING.topEdge]![0];
}

/** Whether a point, seen from the front, falls inside the slice at `z`. */
function inside(z: number, x: number, y: number): boolean {
  const ring = section(z);
  if (y < ring[0]![1] || y > ring[RING_SIZE - 1]![1]) return false;
  // Walk the ring as a polygon closed along the centre line.
  let hit = false;
  for (let i = 0, j = RING_SIZE - 1; i < RING_SIZE; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** The wrap angles are measured from a point on the centre line this far from the middle of the car. */
const WRAP_FROM = 30;

/**
 * A point on the nose (end = 1) or tail (end = -1) at height `y`, found by looking out from inside the car
 * at `angle` radians from straight ahead (or straight behind). Positive angles are towards the car's left.
 * Small angles land on the face of the car and large ones on its side, so a shape drawn in angle and
 * height wraps round the corner. Used to lay the lamps, grille and bumper lines on the body.
 */
export function wrapPoint(end: 1 | -1, angle: number, y: number): Point {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  // The traced lines hold their end values beyond the nose and tail, so stop at the ends of the car.
  const within = (t: number) => WRAP_FROM + t * cos <= 50 && inside(end * (WRAP_FROM + t * cos), Math.abs(t * sin), y);
  for (let t = 27; t > 0; t -= 0.25) {
    if (!within(t)) continue;
    // Narrow it down between this step and the one before, so shapes laid on the body stay smooth.
    let out = t + 0.25;
    let reach = t;
    for (let i = 0; i < 10; i++) {
      const mid = (out + reach) / 2;
      if (within(mid)) reach = mid;
      else out = mid;
    }
    return [reach * sin, y, end * (WRAP_FROM + reach * cos)];
  }
  return [0, y, end * WRAP_FROM];
}
