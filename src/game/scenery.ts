/**
 * What stands beside the road: thorn trees, rocks and tufts of grass, and the road's own line carried on
 * past both ends so it never stops in view. Pure functions, in the same units and axes as `handling.ts`.
 *
 * Nothing here can be hit. The scenery is there to be driven past.
 */
import { poseAt, type Spot, type Stage } from './stage';

/** A repeatable stream of numbers from 0 to 1, so the bush is the same on every visit. */
export function scatter(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface Plant {
  x: number;
  y: number;
  /** Its radius on the ground: the canopy of a tree, the body of a rock, the spread of a tuft. */
  r: number;
  /** Which way it is turned. */
  turn: number;
  /** 0 to 1, for small differences in height and colour. */
  vary: number;
}

export interface Scenery {
  trees: Plant[];
  rocks: Plant[];
  tufts: Plant[];
}

/** How far the road is drawn past each end of the stage. */
export const RUN_OUT = 400;

/** The road and what is on it, at a distance along the stage. Before the start and past the end it runs on straight. */
export function roadFrame(stage: Stage, distance: number): { x: number; y: number; ahead: Spot; right: Spot } {
  const end = distance < 0 ? 0 : distance > stage.length ? stage.length : null;
  if (end !== null) {
    const { x, y, ahead, right } = roadFrame(stage, end === 0 ? 0.5 : stage.length - 0.5);
    const over = distance - (end === 0 ? 0.5 : stage.length - 0.5);
    return { x: x + ahead[0] * over, y: y + ahead[1] * over, ahead, right };
  }
  const at = poseAt(stage, distance);
  // The direction is taken across a short stretch, so it turns smoothly from one piece of road to the next.
  const a = poseAt(stage, distance - 1.5);
  const b = poseAt(stage, distance + 1.5);
  const span = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ahead: Spot = [(b.x - a.x) / span, (b.y - a.y) / span];
  return { x: at.x, y: at.y, ahead, right: [-ahead[1], ahead[0]] };
}

/** Scatter the bush around the stage. Trees and rocks keep off the road; tufts come right up to its edge. */
export function growScenery(stage: Stage, seed = 2003): Scenery {
  const random = scatter(seed);
  // The middle of the road, run-outs included, to keep things off it.
  const line: Spot[] = [];
  for (let d = -RUN_OUT; d <= stage.length + RUN_OUT; d += 4) {
    const { x, y } = roadFrame(stage, d);
    line.push([x, y]);
  }
  const clearOf = (x: number, y: number, gap: number): boolean => {
    const limit = gap * gap;
    for (const p of line) {
      const dx = p[0] - x;
      const dy = p[1] - y;
      if (dx * dx + dy * dy < limit) return false;
    }
    return true;
  };

  const xs = stage.points.map((p) => p[0]);
  const ys = stage.points.map((p) => p[1]);
  const margin = 260;
  const [left, top] = [Math.min(...xs) - margin, Math.min(...ys) - margin];
  const [wide, tall] = [Math.max(...xs) + margin - left, Math.max(...ys) + margin - top];

  const scenery: Scenery = { trees: [], rocks: [], tufts: [] };
  const count = Math.round((wide * tall) / 260);
  for (let i = 0; i < count; i++) {
    const x = left + random() * wide;
    const y = top + random() * tall;
    const kind = random();
    const size = random();
    const plant = { x, y, turn: random() * Math.PI * 2, vary: random() };
    if (kind < 0.07) {
      const r = 2.6 + size * 2.4;
      if (clearOf(x, y, stage.halfWidth + r + 3)) scenery.trees.push({ ...plant, r });
    } else if (kind < 0.12) {
      const r = 0.4 + size * 1.0;
      if (clearOf(x, y, stage.halfWidth + r + 2.5)) scenery.rocks.push({ ...plant, r });
    } else {
      const r = 0.5 + size * 0.9;
      if (clearOf(x, y, stage.halfWidth + r + 1.2)) scenery.tufts.push({ ...plant, r });
    }
  }
  // More tufts along both verges, where they show how fast the road is going by.
  for (let d = 0; d < stage.length; d += 7) {
    for (const side of [-1, 1]) {
      const { x, y, right } = roadFrame(stage, d + random() * 7);
      const r = 0.4 + random() * 0.6;
      const out = side * (stage.halfWidth + r + 1.6 + random() * 6);
      const plant = { x: x + right[0] * out, y: y + right[1] * out, r, turn: random() * Math.PI * 2, vary: random() };
      if (clearOf(plant.x, plant.y, stage.halfWidth + r + 1.2)) scenery.tufts.push(plant);
    }
  }
  return scenery;
}
