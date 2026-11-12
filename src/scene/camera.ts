/** One camera position per sheet of the drawing. Scrolling blends between them. */
export interface CameraKey {
  position: [number, number, number];
  target: [number, number, number];
}

export const CAMERA_KEYS: readonly CameraKey[] = [
  { position: [5.6, 3.3, 7.0], target: [0, -0.2, 0] }, // three-quarter
  { position: [0, 10.5, 1.6], target: [0, 0, 0] }, // plan view
  { position: [0, 5.2, 8.4], target: [0, -0.1, 0] }, // front elevation
  { position: [4.6, -6.2, 6.8], target: [0, -0.7, -0.5] }, // underside
  { position: [-6.2, 2.6, 6.4], target: [0, -0.4, 0] }, // rear three-quarter
];

/** Below this width the notes sit under the drawing instead of beside it. */
export const NARROW_WIDTH = 760;

/** On a narrow screen the engine and its exhaust need a space about this tall, as a share of the width. */
const NARROW_DRAWING_HEIGHT = 0.8;

/**
 * How far to pull the camera back so the engine fits beside (or above) the notes.
 * The engine is wide, so narrow screens need more distance. `clear` is the share of a narrow
 * screen left above the notes: when that space is too short for the drawing, pull back further.
 */
export function cameraDistanceScale(aspect: number, narrow: boolean, clear = 1): number {
  if (!narrow) return Math.max(1.18, 2.0 / aspect);
  const fitWidth = Math.min(2.5, Math.max(1.25, 1.08 / aspect));
  return fitWidth * Math.max(1, (NARROW_DRAWING_HEIGHT * aspect) / clear);
}

/**
 * Where the engine's centre sits on a narrow screen, as a fraction of the height from the top.
 * `clear` is the share of the screen above the notes; the engine goes just below the middle of it,
 * because the exhaust on the underside sheet hangs above the point the camera looks at.
 * Tall screens stop at 0.28 so the engine does not drift away from the notes.
 */
export function narrowCentre(clear: number): number {
  return Math.min(0.28, Math.max(0.17, clear * 0.56));
}

export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}
