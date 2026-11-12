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

/**
 * How far to pull the camera back so the engine fits beside (or above) the notes.
 * The engine is wide, so narrow screens need more distance.
 */
export function cameraDistanceScale(aspect: number, narrow: boolean): number {
  return narrow ? Math.min(2.5, Math.max(1.25, 1.08 / aspect)) : Math.max(1.18, 2.0 / aspect);
}

export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}
