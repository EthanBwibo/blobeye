/**
 * The stage: one gravel road from a start to a finish, and the run against the clock along it.
 * Pure functions, in the same units and axes as `handling.ts`.
 *
 * The route is invented. It is not a map of any real rally stage.
 */
import { stepCar, type CarState, type DriveInput } from './handling';
import { CAR_RADIUS, HAZARDS, KNOCK, LANDING, RAIL_DRAG, RAIL_REACH, WATER_DRAG, groundAt, inWater, roomAt, stepFlight, underAt, zebraAt, type Hazards } from './hazards';
import { checkpointsOf } from './splits';

export type Spot = readonly [x: number, y: number];

/** Points the road passes through, in metres. */
const ROUTE: readonly Spot[] = [
  [0, 0], [140, 0], [260, -30], [340, -110], [350, -220], [290, -300], [190, -320], [110, -380],
  [100, -480], [170, -550], [290, -560], [400, -520], [480, -440], [560, -400], [650, -430], [700, -520],
  [680, -620], [590, -670], [480, -680], [360, -700], [250, -740], [150, -720],
];

/** The route is drawn at this size. Tuned so a tidy run takes about a minute. */
const ROUTE_SCALE = 0.85;

export interface Stage {
  /** The middle of the road, as closely spaced points. */
  points: readonly Spot[];
  /** Distance along the road to each point. */
  along: readonly number[];
  length: number;
  /** From the middle of the road to its edge. */
  halfWidth: number;
  /** Where the car lines up, and where the clock stops, as distances along the road. */
  startAt: number;
  finishAt: number;
  /** What lies in wait along the road, in road coordinates. */
  hazards: Hazards;
  /** The rocks on the road, as places on the ground. */
  rocks: readonly Obstacle[];
  /** Where the split times are taken, as distances along the road. */
  checkpoints: readonly number[];
}

/** Something solid and round on the ground. */
export interface Obstacle {
  x: number;
  y: number;
  r: number;
}

/** The road's line alone, which is all that finding a place on it needs. */
type Road = Pick<Stage, 'points' | 'along' | 'length'>;

export interface Pose {
  x: number;
  y: number;
  heading: number;
}

/** Smooth the route into a road: a Catmull-Rom curve through its points, sampled about every `spacing` metres. */
export function buildStage(route: readonly Spot[] = ROUTE, scale = ROUTE_SCALE, spacing = 4, hazards: Hazards = HAZARDS): Stage {
  const at = (i: number): Spot => {
    const p = route[Math.min(route.length - 1, Math.max(0, i))]!;
    return [p[0] * scale, p[1] * scale];
  };
  const points: Spot[] = [];
  for (let i = 0; i < route.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const steps = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / spacing));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const curve = (k: 0 | 1) =>
        0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t * t * t);
      points.push([curve(0), curve(1)]);
    }
  }
  points.push(at(route.length - 1));

  const along = [0];
  for (let i = 1; i < points.length; i++) {
    along.push(along[i - 1]! + Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]));
  }
  const length = along[along.length - 1]!;
  // The road carries on a little past the finish, so there is room to stop.
  const road: Road = { points, along, length };
  const [startAt, finishAt] = [12, length - 45];
  return {
    ...road,
    halfWidth: 7,
    startAt,
    finishAt,
    hazards,
    rocks: hazards.rocks.map((rock) => ({ ...placeAt(road, rock.along, rock.across), r: rock.r })),
    checkpoints: checkpointsOf(startAt, finishAt),
  };
}

/** The place on the ground that is `along` the road and `across` metres to the right of its middle. */
export function placeAt(stage: Road, along: number, across: number): Pose {
  const { x, y, heading } = poseAt(stage, along);
  return { x: x - Math.sin(heading) * across, y: y + Math.cos(heading) * across, heading };
}

/** The zebra, as places on the ground, `time` seconds into the run. `heading` is the way each is walking. */
export function herdAt(stage: Stage, time: number): (Obstacle & { heading: number })[] {
  return zebraAt(stage.hazards, time).map((zebra) => {
    const { x, y, heading } = placeAt(stage, zebra.along, zebra.across);
    return { x, y, r: stage.hazards.zebra.r, heading: heading + (zebra.facing * Math.PI) / 2 };
  });
}

/** The place and direction of the road at a distance along it. */
export function poseAt(stage: Road, distance: number): Pose {
  const d = Math.min(stage.length, Math.max(0, distance));
  let i = 0;
  let high = stage.along.length - 2;
  while (i < high) {
    const mid = (i + high + 1) >> 1;
    if (stage.along[mid]! <= d) i = mid;
    else high = mid - 1;
  }
  const a = stage.points[i]!;
  const b = stage.points[i + 1]!;
  const t = (d - stage.along[i]!) / Math.max(1e-9, stage.along[i + 1]! - stage.along[i]!);
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, heading: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}

export interface Located {
  /** The stretch of road the car is beside. Pass it back in as the next `near`. */
  index: number;
  /** How far along the road that is. */
  along: number;
  /** How far the car is from the middle of the road. */
  offset: number;
  /** The same, with a side: positive is to the right of the road. */
  across: number;
  /** Which way is to the right of the road there. */
  right: Spot;
}

/**
 * Find the car on the road. Only the stretch around `near` is searched, so progress follows the road:
 * cutting across the bush to a later part of the stage does not count.
 */
export function locate(stage: Stage, x: number, y: number, near: number): Located {
  const from = Math.max(0, near - 10);
  const to = Math.min(stage.points.length - 2, near + 15);
  let best: Located = { index: from, along: stage.along[from]!, offset: Infinity, across: 0, right: [0, 1] };
  for (let i = from; i <= to; i++) {
    const a = stage.points[i]!;
    const b = stage.points[i + 1]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const span = dx * dx + dy * dy;
    const t = span ? Math.min(1, Math.max(0, ((x - a[0]) * dx + (y - a[1]) * dy) / span)) : 0;
    const offset = Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t));
    if (offset < best.offset) {
      const length = Math.sqrt(span) || 1;
      const right: Spot = [-dy / length, dx / length];
      best = { index: i, along: stage.along[i]! + length * t, offset, across: (x - a[0]) * right[0] + (y - a[1]) * right[1], right };
    }
  }
  return best;
}

/** One run at the stage. The clock starts with the first press of the throttle. */
export interface Trial {
  car: CarState;
  phase: 'ready' | 'running' | 'finished';
  /** Seconds on the clock. */
  time: number;
  /** Distance covered along the road. */
  progress: number;
  index: number;
  onRoad: boolean;
  /** How high the car is above the flat ground, and how fast that is changing. */
  height: number;
  rise: number;
  /** Off the ground, over the crest. Nothing the driver does counts until it lands. */
  airborne: boolean;
  /** Seconds off the ground so far, this flight. */
  aloft: number;
  /** In the ford. */
  wet: boolean;
  /** The clock at each checkpoint passed so far. */
  splits: number[];
  /** What happened on the last step, for the dust and the spray. */
  event: 'splash' | 'knock' | 'scrape' | 'land' | null;
}

export function newTrial(stage: Stage): Trial {
  const { x, y, heading } = poseAt(stage, stage.startAt);
  const index = locate(stage, x, y, 0).index;
  return {
    car: { x, y, heading, vx: 0, vy: 0 },
    phase: 'ready',
    time: 0,
    progress: stage.startAt,
    index,
    onRoad: true,
    height: groundAt(stage.hazards, stage.startAt),
    rise: 0,
    airborne: false,
    aloft: 0,
    wet: false,
    splits: [],
    event: null,
  };
}

const AT_REST: DriveInput = { throttle: 0, brake: 0, steer: 0 };
const STOPPING: DriveInput = { throttle: 0, brake: 1, steer: 0 };

/**
 * Run into something round and solid. The car is put back outside it, loses the speed it had into it
 * (a little bounces back) and some of the rest. Returns null if they do not touch.
 */
export function bump(car: CarState, thing: Obstacle): { car: CarState; hard: boolean } | null {
  const reach = thing.r + CAR_RADIUS;
  const dx = car.x - thing.x;
  const dy = car.y - thing.y;
  const gap = Math.hypot(dx, dy);
  if (gap >= reach) return null;
  // Dead centre has no way out: back the way the nose came.
  const nx = gap > 1e-6 ? dx / gap : -Math.cos(car.heading);
  const ny = gap > 1e-6 ? dy / gap : -Math.sin(car.heading);
  const into = car.vx * nx + car.vy * ny;
  let { vx, vy } = car;
  if (into < 0) {
    vx = (vx - into * nx) * KNOCK.keep - into * KNOCK.bounce * nx;
    vy = (vy - into * ny) * KNOCK.keep - into * KNOCK.bounce * ny;
  }
  return { car: { ...car, x: thing.x + nx * reach, y: thing.y + ny * reach, vx, vy }, hard: into < -1 };
}

/** Advance a run by `dt` seconds. Changes `trial` in place. */
export function stepTrial(stage: Stage, trial: Trial, input: DriveInput, dt: number): void {
  if (trial.phase === 'ready' && input.throttle > 0) trial.phase = 'running';
  const drive = trial.phase === 'running' ? input : trial.phase === 'finished' ? STOPPING : AT_REST;
  // Past the line the car only brakes, so it must not roll back.
  if (trial.phase === 'finished' && Math.hypot(trial.car.vx, trial.car.vy) < 0.6) {
    trial.car = { ...trial.car, vx: 0, vy: 0 };
    return;
  }
  const hazards = stage.hazards;
  trial.event = null;
  if (trial.airborne) {
    // In the air the car goes where it was going.
    trial.car = { ...trial.car, x: trial.car.x + trial.car.vx * dt, y: trial.car.y + trial.car.vy * dt };
  } else {
    let car = stepCar(trial.car, drive, dt, trial.onRoad);
    if (trial.wet) {
      const keep = Math.exp(-WATER_DRAG * dt);
      car = { ...car, vx: car.vx * keep, vy: car.vy * keep };
    }
    const herd = hazards.zebra.count && Math.abs(trial.progress - hazards.zebra.at) < 40 ? herdAt(stage, trial.time) : [];
    for (const thing of [...stage.rocks, ...herd]) {
      const hit = bump(car, thing);
      if (!hit) continue;
      car = hit.car;
      if (hit.hard) trial.event = 'knock';
    }
    trial.car = car;
  }

  let found = locate(stage, trial.car.x, trial.car.y, trial.index);
  // The bridge's rails: a car that strays is held inside them, and scrapes.
  const room = roomAt(hazards, found.along, stage.halfWidth);
  const over = Math.abs(found.across) - room;
  if (!trial.airborne && room < stage.halfWidth && over > 0 && over < RAIL_REACH) {
    const side = Math.sign(found.across);
    const [rx, ry] = found.right;
    const outward = Math.max(0, (trial.car.vx * rx + trial.car.vy * ry) * side);
    const keep = Math.exp(-RAIL_DRAG * dt);
    trial.car = {
      ...trial.car,
      x: trial.car.x - rx * side * over,
      y: trial.car.y - ry * side * over,
      vx: (trial.car.vx - rx * side * outward) * keep,
      vy: (trial.car.vy - ry * side * outward) * keep,
    };
    found = { ...found, across: side * room, offset: room };
    trial.event = 'scrape';
  }
  trial.index = found.index;
  trial.progress = found.along;
  trial.onRoad = found.offset <= stage.halfWidth;

  // The crest: the car follows the road up, and leaves it if the road falls away too fast.
  const flight = stepFlight(trial, underAt(hazards, found.along), Math.hypot(trial.car.vx, trial.car.vy), dt);
  trial.height = flight.height;
  trial.rise = flight.rise;
  trial.airborne = flight.airborne;
  if (trial.airborne) trial.aloft += dt;
  // A hop too short to notice costs nothing.
  if (flight.landed && trial.aloft > 0.15) {
    trial.car = { ...trial.car, vx: trial.car.vx * LANDING, vy: trial.car.vy * LANDING };
    trial.event = 'land';
  }
  if (!trial.airborne) trial.aloft = 0;

  const wet = !trial.airborne && trial.onRoad && inWater(hazards, found.along);
  if (wet && !trial.wet && Math.hypot(trial.car.vx, trial.car.vy) > 5) trial.event = 'splash';
  trial.wet = wet;

  if (trial.phase === 'running') {
    trial.time += dt;
    while (trial.splits.length < stage.checkpoints.length && found.along >= stage.checkpoints[trial.splits.length]!) trial.splits.push(trial.time);
    if (found.along >= stage.finishAt) trial.phase = 'finished';
  }
}

/** Whether a time beats the one on record. */
export function isNewBest(best: number | null, time: number): boolean {
  return Number.isFinite(time) && time > 0 && (best === null || time < best);
}

/** A time as minutes, seconds and hundredths: 0:58.42. */
export function formatTime(seconds: number): string {
  const hundredths = Math.floor(Math.max(0, seconds) * 100);
  const minutes = Math.floor(hundredths / 6000);
  const rest = hundredths - minutes * 6000;
  return `${minutes}:${String(Math.floor(rest / 100)).padStart(2, '0')}.${String(rest % 100).padStart(2, '0')}`;
}
