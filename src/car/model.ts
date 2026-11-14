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
  [15.6, 25.7], [9.6, 29.2], [4.5, 31.8], // windscreen
  [1.1, 32.2], [-5.7, 32.6], [-13.4, 32.6], [-19.3, 32.2], // roof
  [-22.7, 31.2], [-26.1, 29.9], [-29.6, 28.0], [-33.0, 26.1], [-35.5, 24.5], // rear screen
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
  [42.0, 19.0], [20.7, 20.7], [12.2, 21.1], [-7.0, 21.6], [-27.2, 22.2], [-36.8, 23.7], [-45.3, 23.2],
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
  roofFront: 4.5,
  roofRear: -19.3,
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
} as const;

/** Signature parts. Positions from A: side view for z and heights, front and rear views for widths. */
export const PARTS = {
  scoop: { front: 34.3, topFront: 33.1, topRear: 28.8, rear: 27.1, top: 22.6, halfWidth: 4.5 },
  wing: { baseFront: -38.9, baseRear: -46.6, topFront: -41.3, topRear: -47.0, top: 29.5, under: 28.6, halfWidth: 13.5, upright: 12.6 },
  headlamp: { outer: 17.0, inner: 9.35, top: 17.25, innerTop: 15.15, bottom: 13.05, lamp: [10.9, 14.5, 1.7] },
  grille: { topHalfWidth: 7.2, top: 15.4, bottomHalfWidth: 6.3, bottom: 13.05 },
  intake: { halfWidth: 6.9, top: 9.3, bottom: 7.8 },
  fogCover: { x: 11.3, y: 8.9, halfWidth: 1.5, halfHeight: 1.8 },
  tailLamp: { outer: 16.6, inner: 8.6, top: 19.8, innerTop: 19.2, bottom: 15.6 },
  tailpipe: { x: 7.9, y: 6.9, radius: 1.1 },
  glass: { frontLow: 16.9, frontTop: 3.7, rearTop: -18.7, rearLow: -28.7, pillar: -7.7 },
  doors: [18.6, -7.7, -22.9],
} as const;

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

/**
 * How far forward (end = 1) or back (end = -1) the body reaches at a point seen from that end.
 * Used to lay the lamps and grille on the curved nose and tail.
 */
export function endZ(x: number, y: number, end: 1 | -1): number {
  const ax = Math.abs(x);
  for (let z = 50.5; z > 30; z -= 0.25) {
    if (!inside(end * z, ax, y)) continue;
    // Narrow it down between this step and the one before, so shapes laid on the body stay smooth.
    let out = z + 0.25;
    let within = z;
    for (let i = 0; i < 8; i++) {
      const mid = (out + within) / 2;
      if (inside(end * mid, ax, y)) within = mid;
      else out = mid;
    }
    return end * within;
  }
  return end * 30;
}
