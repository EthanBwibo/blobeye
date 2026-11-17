/**
 * The minimap: the stage seen from above, the sector boundaries across it, and a dot for the car. Pure:
 * the fitting, and the map as SVG text. It is drawn the way the stage is laid out, with y down the
 * screen as in `handling.ts`, so a right turn on the road is a right turn on the map.
 */
import { poseAt, type Spot, type Stage } from './stage';

export type Project = (x: number, y: number) => [number, number];

/** Fit `points` into a `size` square with `pad` to spare all round, keeping their shape, centred. */
export function fitMap(points: readonly Spot[], size: number, pad: number): Project {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = (size - pad * 2) / Math.max(1e-9, maxX - minX, maxY - minY);
  const [ox, oy] = [(size - (maxX - minX) * scale) / 2, (size - (maxY - minY) * scale) / 2];
  return (x, y) => [ox + (x - minX) * scale, oy + (y - minY) * scale];
}

/** The map as SVG, from the start line to the finish. The car is the `[data-car]` circle. */
export function minimapSvg(stage: Stage, size = 170, pad = 12): { svg: string; project: Project } {
  const on = stage.points.filter((_, i) => stage.along[i]! >= stage.startAt - 2 && stage.along[i]! <= stage.finishAt + 2);
  const project = fitMap(on, size, pad);
  const n = (v: number) => v.toFixed(1);
  const road = on
    .filter((_, i) => i % 2 === 0 || i === on.length - 1)
    .map(([x, y], i) => `${i ? 'L' : 'M'}${project(x, y).map(n).join(' ')}`)
    .join('');
  const across = (along: number, half: number, cls: string): string => {
    const { x, y, heading } = poseAt(stage, along);
    const [cx, cy] = project(x, y);
    const [rx, ry] = [-Math.sin(heading) * half, Math.cos(heading) * half];
    return `<path class="${cls}" d="M${n(cx - rx)} ${n(cy - ry)}L${n(cx + rx)} ${n(cy + ry)}"/>`;
  };
  const svg =
    `<svg viewBox="0 0 ${size} ${size}" aria-hidden="true"><path class="road" d="${road}"/>` +
    stage.checkpoints.map((at) => across(at, 9, 'gate')).join('') +
    across(stage.startAt, 7, 'start') +
    across(stage.finishAt, 9, 'finish') +
    '<circle data-car r="5"/></svg>';
  return { svg, project };
}
