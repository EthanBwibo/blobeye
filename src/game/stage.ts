/**
 * A stage: one gravel road from a start to a finish, and the run against the clock along it.
 * Pure functions, in the same units and axes as `handling.ts`.
 *
 * The routes are invented. None is a map of a real rally stage.
 */
import { stepCar, type CarState, type DriveInput } from './handling';
import {
  ANIMAL_SIZE,
  CAR_RADIUS,
  HAZARDS,
  HIT,
  KNOCK,
  LANDING,
  OSTRICH_WAKE,
  RAIL_DRAG,
  RAIL_REACH,
  WATER_DRAG,
  animalsAt,
  branchParts,
  groundAt,
  inAnyWater,
  knockedPose,
  patchAt,
  roomAt,
  stepFlight,
  surfaceAt,
  underAt,
  zebraAt,
  type AnimalKind,
  type Hazards,
  type Knocked,
} from './hazards';
import { checkpointsOf } from './splits';

export type Spot = readonly [x: number, y: number];

/** Points the Naivasha road passes through, in metres. The other stages are in `stages.ts`. */
export const ROUTE: readonly Spot[] = [
  [0, 0], [140, 0], [260, -30], [340, -110], [350, -220], [290, -300], [190, -320], [110, -380],
  [100, -480], [170, -550], [290, -560], [400, -520], [480, -440], [560, -400], [650, -430], [700, -520],
  [680, -620], [590, -670], [480, -680], [360, -700], [250, -740], [150, -720],
];

/** The route is drawn at this size. Tuned so a tidy run takes about a minute. */
export const ROUTE_SCALE = 0.85;

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
  /** The fallen branches, as solid circles on the ground. */
  branches: readonly Obstacle[];
  /** Rumble strips on the outside of the tight corners, where a car runs wide. */
  kerbs: readonly Kerb[];
  /** Where the split times are taken, as distances along the road. */
  checkpoints: readonly number[];
}

/** A rumble strip along the edge of the road on `side` (1 is the right), from one distance to another. */
export interface Kerb {
  from: number;
  to: number;
  side: 1 | -1;
}

/** How tight a bend, in radians per metre, gets a rumble strip on its outside: a 3 in the pace notes, or tighter. */
export const KERB_BEND = 0.0115;
/** How wide a rumble strip is, inside the edge of the road, and how far past the edge it still rumbles. */
export const KERB_WIDTH = 0.9;

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

/** Smooth the route into a road `halfWidth` each side of its middle: a Catmull-Rom curve through its points, sampled about every `spacing` metres. */
export function buildStage(route: readonly Spot[] = ROUTE, scale = ROUTE_SCALE, spacing = 4, hazards: Hazards = HAZARDS, halfWidth = 7): Stage {
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
  const solid = (part: { along: number; across: number; r: number }): Obstacle => ({ ...placeAt(road, part.along, part.across), r: part.r });
  return {
    ...road,
    halfWidth,
    startAt,
    finishAt,
    hazards,
    rocks: hazards.rocks.map(solid),
    branches: (hazards.branches ?? []).flatMap((branch) => branchParts(branch, halfWidth).map(solid)),
    kerbs: kerbsOf(road, startAt, finishAt),
    checkpoints: checkpointsOf(startAt, finishAt),
  };
}

/** The rumble strips: wherever the road bends tighter than `KERB_BEND` for 15 metres or more, on the outside. */
export function kerbsOf(road: Road, from: number, to: number): Kerb[] {
  const turn = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const kerbs: Kerb[] = [];
  let open: Kerb | null = null;
  for (let d = from; d <= to; d += 2) {
    const bend = turn(poseAt(road, d + 10).heading - poseAt(road, d - 10).heading) / 20;
    // Turning right, the car runs wide to the left.
    const side = Math.abs(bend) < KERB_BEND ? 0 : bend > 0 ? -1 : 1;
    if (open && (side !== open.side || d >= to)) {
      if (open.to - open.from >= 15) kerbs.push(open);
      open = null;
    }
    if (side && !open) open = { from: d, to: d, side };
    if (open) open.to = d;
  }
  return kerbs;
}

/** The place on the ground that is `along` the road and `across` metres to the right of its middle. */
export function placeAt(stage: Road, along: number, across: number): Pose {
  const { x, y, heading } = poseAt(stage, along);
  return { x: x - Math.sin(heading) * across, y: y + Math.cos(heading) * across, heading };
}

/** An animal on the ground, with the way it is facing. */
export interface Creature extends Obstacle {
  kind: AnimalKind;
  /** Which animal it is, the same on every run: `z` and its place in the herd for a zebra, otherwise its group and place in it. */
  id: string;
  heading: number;
  /** Knocked aside by the car: it can no longer be hit, and it may be over on its side (`roll`) or off the ground (`lift`). */
  down?: boolean;
  roll?: number;
  lift?: number;
}

/**
 * Every animal on the stage, as places on the ground, `time` seconds into the run: the zebra and the rest.
 * `woke` is the run's own record of when each group took fright (see `Trial.woke`), and `knocked` the ones
 * the car has hit (`Trial.knocked`): those are where their tumble has taken them, marked `down`.
 */
export function creaturesAt(stage: Stage, time: number, woke: readonly (number | null)[] = [], knocked: readonly Knocked[] = []): Creature[] {
  const zebra: Creature[] = herdAt(stage, time).map((z, i) => ({ ...z, kind: 'zebra', id: `z${i}` }));
  const rest = animalsAt(stage.hazards, time, woke, stage.halfWidth).map((spot): Creature => {
    const { x, y, heading } = placeAt(stage, spot.along, spot.across);
    return { kind: spot.kind, id: spot.id, x, y, r: ANIMAL_SIZE[spot.kind], heading: heading + spot.facing };
  });
  const struck = new Map(knocked.map((k) => [k.id, k]));
  return [...zebra, ...rest].map((animal) => {
    const k = struck.get(animal.id);
    if (!k) return animal;
    const pose = knockedPose(k, time);
    return { ...animal, x: pose.x, y: pose.y, heading: pose.heading, roll: pose.roll, lift: pose.lift, down: true };
  });
}

/**
 * The car runs into an animal at speed. The car is put back outside it and loses a share of its speed for
 * the animal's size (`HIT.cost`); the animal is thrown the way the car was going and away from it, to come
 * to rest beside the road (see `knockedPose`). `near` is where on the road to look from, as in `locate`.
 */
export function knockAnimal(stage: Stage, car: CarState, animal: Creature, time: number, near: number): { car: CarState; knocked: Knocked } {
  const reach = animal.r + CAR_RADIUS;
  const [dx, dy] = [animal.x - car.x, animal.y - car.y];
  const gap = Math.hypot(dx, dy);
  // From the car to the animal; dead centre, straight ahead.
  const [nx, ny] = gap > 1e-6 ? [dx / gap, dy / gap] : [Math.cos(car.heading), Math.sin(car.heading)];
  const speed = Math.hypot(car.vx, car.vy);
  const keep = 1 - HIT.cost[animal.kind];
  const hit: CarState = { ...car, x: animal.x - nx * reach, y: animal.y - ny * reach, vx: car.vx * keep, vy: car.vy * keep };

  // Thrown along the car's way and out from it: further the lighter it is and the faster the car.
  const [wx, wy] = speed > 1e-6 ? [car.vx / speed, car.vy / speed] : [nx, ny];
  const [tx, ty] = [wx * 0.6 + nx * 0.8, wy * 0.6 + ny * 0.8];
  const tl = Math.hypot(tx, ty) || 1;
  const thrown = Math.min(16, speed * (1 - HIT.cost[animal.kind]) * 0.35 + 2);
  let rest: [number, number] = [animal.x + (tx / tl) * thrown, animal.y + (ty / tl) * thrown];
  // It always ends up beside the road, never lying in it: off whichever side it is nearer.
  const at = locate(stage, rest[0], rest[1], near);
  const side = at.across >= 0 ? 1 : -1;
  const [rx, ry] = at.right;
  const clear = stage.halfWidth + 1.5 + animal.r;
  if (Math.abs(at.across) < clear) {
    const push = side * clear - at.across;
    rest = [rest[0] + rx * push, rest[1] + ry * push];
  }
  // Which way it turns as it goes: the way the car's nose would swing it.
  const cross = wx * ny - wy * nx;
  return {
    car: hit,
    knocked: {
      kind: animal.kind,
      id: animal.id,
      at: time,
      from: [animal.x, animal.y],
      rest,
      away: [rx * side, ry * side],
      heading: animal.heading,
      spin: (cross >= 0 ? 1 : -1) * (Math.PI * 0.6 + Math.min(1, speed / 30) * Math.PI * 0.6),
      hop: Math.min(1.4, 0.25 + speed * 0.035) * (animal.kind === 'giraffe' ? 0.5 : 1),
    },
  };
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
  /** How far the car is from the middle of the road. */
  offset: number;
  /** For each group of animals, the clock when it took fright and ran, or null. Only ostrich do. */
  woke: (number | null)[];
  /** Seconds the car has been stuck off the road, going nowhere. After `STUCK.seconds` it may be put back on it. */
  stuck: number;
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
  /** The animals the car has hit, in order, each knocked aside. */
  knocked: Knocked[];
  /** Seconds of penalty put on the clock this run, `HIT.penalty` for each animal hit. They are already in `time`. */
  penalty: number;
  /**
   * What happened on the last step, for the dust and the spray: and `rattle` over a cattle grid, `rumble` on a
   * rumble strip, `reset` when put back on the road, `hit` when an animal was knocked aside (the last of `knocked`).
   */
  event: 'splash' | 'knock' | 'scrape' | 'land' | 'rattle' | 'rumble' | 'reset' | 'hit' | null;
}

/**
 * The stage's own clock: the run's, less its penalties. The animals walk by this, so a penalty on the clock
 * does not make them all jump.
 */
export const worldTime = (trial: Pick<Trial, 'time' | 'penalty'>): number => trial.time - trial.penalty;

/** Off the road and slower than `speed` m/s for `seconds`, the car is stuck, and may be put back on the road. */
export const STUCK = { speed: 3, seconds: 2 } as const;

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
    offset: 0,
    woke: (stage.hazards.animals ?? []).map(() => null),
    stuck: 0,
    height: groundAt(stage.hazards, stage.startAt),
    rise: 0,
    airborne: false,
    aloft: 0,
    wet: false,
    splits: [],
    knocked: [],
    penalty: 0,
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
    let car = stepCar(trial.car, drive, dt, surfaceAt(hazards, trial.progress, trial.offset, stage.halfWidth));
    if (trial.wet) {
      const keep = Math.exp(-WATER_DRAG * dt);
      car = { ...car, vx: car.vx * keep, vy: car.vy * keep };
    }
    // Only the animals near the car are looked at. None of them ends a run: they are knocked aside, and slow the car.
    const near = (at: number) => Math.abs(trial.progress - at) < 60;
    const close = (hazards.zebra.count > 0 && near(hazards.zebra.at)) ||
      (hazards.animals ?? []).some((group) => near(group.at) || (group.kind === 'ostrich' && trial.progress > group.at && trial.progress < group.to + 20));
    const animals = close ? creaturesAt(stage, worldTime(trial), trial.woke, trial.knocked).filter((animal) => !animal.down) : [];
    for (const thing of [...stage.rocks, ...stage.branches]) {
      const hit = bump(car, thing);
      if (!hit) continue;
      car = hit.car;
      if (hit.hard) trial.event = 'knock';
    }
    for (const animal of animals) {
      if (Math.hypot(car.x - animal.x, car.y - animal.y) >= animal.r + CAR_RADIUS) continue;
      // At walking pace the car only nudges it, as it would a rock.
      if (Math.hypot(car.vx, car.vy) < HIT.slowest) {
        car = bump(car, animal)?.car ?? car;
        continue;
      }
      const hit = knockAnimal(stage, car, animal, worldTime(trial), trial.index);
      car = hit.car;
      trial.knocked.push(hit.knocked);
      trial.event = 'hit';
      if (trial.phase === 'running') {
        // The penalty goes straight on the clock, so the splits, the medal and the ghost's recording all carry it.
        trial.time += HIT.penalty;
        trial.penalty += HIT.penalty;
      }
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
  const before = patchAt(hazards, trial.progress);
  trial.index = found.index;
  trial.progress = found.along;
  trial.offset = found.offset;
  trial.onRoad = found.offset <= stage.halfWidth;
  const speed = Math.hypot(trial.car.vx, trial.car.vy);

  // What the road does under the wheels: a washout jars the car, a grid rattles, a rumble strip rumbles.
  const patch = trial.airborne || !trial.onRoad ? null : patchAt(hazards, found.along);
  if (!trial.event && patch && speed > 3) {
    if (patch.kind === 'washout' && before?.kind !== 'washout' && speed > 12) trial.event = 'knock';
    else if (patch.kind === 'grid') trial.event = 'rattle';
  }
  if (!trial.event && !trial.airborne && speed > 3 && onKerb(stage, found.along, found.across)) trial.event = 'rumble';

  // Ostrich take fright as the car comes up behind them, and run.
  (hazards.animals ?? []).forEach((group, g) => {
    if (group.kind === 'ostrich' && trial.woke[g] === null && trial.phase === 'running' && found.along >= group.at - OSTRICH_WAKE) trial.woke[g] = worldTime(trial);
  });

  // Off the road and going nowhere: after a moment, the car may be put back on it.
  const stuck = trial.phase === 'running' && !trial.airborne && !trial.onRoad && speed < STUCK.speed;
  trial.stuck = stuck ? trial.stuck + dt : 0;

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

  const wet = !trial.airborne && trial.onRoad && inAnyWater(hazards, found.along);
  if (wet && !trial.wet && Math.hypot(trial.car.vx, trial.car.vy) > 5) trial.event = 'splash';
  trial.wet = wet;

  if (trial.phase === 'running') {
    trial.time += dt;
    while (trial.splits.length < stage.checkpoints.length && found.along >= stage.checkpoints[trial.splits.length]!) trial.splits.push(trial.time);
    if (found.along >= stage.finishAt) trial.phase = 'finished';
  }
}

/** Whether the car is on a rumble strip: inside the edge of the road on the outside of a tight corner, or just past it. */
export function onKerb(stage: Stage, along: number, across: number): boolean {
  const out = Math.abs(across) - stage.halfWidth;
  if (out < -KERB_WIDTH || out > 0.3) return false;
  return stage.kerbs.some((kerb) => along >= kerb.from && along <= kerb.to && Math.sign(across) === kerb.side);
}

/** Whether a stuck car may be put back on the road now. */
export function canReset(trial: Trial): boolean {
  return trial.phase === 'running' && trial.stuck >= STUCK.seconds;
}

/**
 * Put the car back on the road, stopped and facing up it, level with where it left. The clock keeps
 * running, so the time it lost is its own. It is put down clear of anything solid: the middle of the road
 * if that is free, or the nearest place across it that is.
 */
export function resetToRoad(stage: Stage, trial: Trial): void {
  const along = Math.min(stage.finishAt - 1, Math.max(stage.startAt, trial.progress));
  const solid = [...stage.rocks, ...stage.branches];
  const clear = (x: number, y: number) => solid.every((thing) => Math.hypot(x - thing.x, y - thing.y) > thing.r + CAR_RADIUS + 0.5);
  const tries = [0, -2, 2, -4, 4].filter((across) => Math.abs(across) < stage.halfWidth - CAR_RADIUS);
  const across = tries.find((a) => {
    const p = placeAt(stage, along, a);
    return clear(p.x, p.y);
  }) ?? 0;
  const { x, y, heading } = placeAt(stage, along, across);
  trial.car = { x, y, heading, vx: 0, vy: 0 };
  const found = locate(stage, x, y, trial.index);
  trial.index = found.index;
  trial.progress = found.along;
  trial.offset = found.offset;
  trial.onRoad = true;
  trial.height = groundAt(stage.hazards, found.along);
  trial.rise = 0;
  trial.airborne = false;
  trial.aloft = 0;
  trial.wet = false;
  trial.stuck = 0;
  trial.event = 'reset';
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
