/** A camera position at a point in the scroll. Scrolling blends between neighbours. */
export interface CameraKey {
  /** Scroll position in sheets. Whole numbers are the sheets themselves; the rest are waypoints between them. */
  at: number;
  position: [number, number, number];
  target: [number, number, number];
  /** Lens angle in degrees. Smaller is a longer lens. Leave out for the usual one. */
  fov?: number;
}

export interface CameraView {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

/** The lens angle used when a key does not set its own. */
export const DEFAULT_FOV = 34;

/** The engine chapter runs from this sheet to this one. The sheets either side show the whole car. */
export const ENGINE_FIRST_SHEET = 1;
export const ENGINE_LAST_SHEET = 5;
/** The rally timeline, once the camera has pulled back out of the engine. Wide screens only. */
export const HERITAGE_SHEET = 6;
/** The Safari stage: the car turns away and drives off here. */
export const DRIVE_OFF_SHEET = 7;
/** The specs table, after the game. Wide screens only. */
export const LAST_SHEET = 8;

type View = Pick<CameraKey, 'position' | 'target' | 'fov'>;
/** The whole car, front three-quarter, on a long lens at door-handle height. */
const WHOLE_CAR: View = { position: [40.3, 2.5, 50.8], target: [0, 1.0, -9.0], fov: 20 };
/** The same view tipped down, which lifts the car to the top of the sheet and leaves the bottom for the timeline. */
const ABOVE_TIMELINE: View = { ...WHOLE_CAR, target: [0, -4.0, -9.0] };
/** Standing in front of the car looking down into the engine bay. */
const OVER_BONNET: View = { position: [3.5, 10.5, 24], target: [0, 1.2, 0.5], fov: 28 };

export const CAMERA_KEYS: readonly CameraKey[] = [
  { at: 0, ...WHOLE_CAR },
  { at: 0.55, ...OVER_BONNET }, // on the way in
  { at: 1, position: [5.6, 3.3, 7.0], target: [0, -0.2, 0] }, // engine, three-quarter
  { at: 2, position: [0, 10.5, 1.6], target: [0, 0, 0] }, // plan view
  { at: 3, position: [0, 5.2, 8.4], target: [0, -0.1, 0] }, // front elevation
  { at: 4, position: [4.6, -6.2, 6.8], target: [0, -0.7, -0.5] }, // underside
  { at: 5, position: [-6.2, 2.6, 6.4], target: [0, -0.4, 0] }, // rear three-quarter
  { at: 5.45, ...OVER_BONNET }, // on the way out
  { at: HERITAGE_SHEET, ...ABOVE_TIMELINE }, // pulled back, with the rally timeline below
  { at: DRIVE_OFF_SHEET, ...WHOLE_CAR }, // the car drives off into the Safari stage
  { at: LAST_SHEET, ...WHOLE_CAR }, // the specs table
];

/** Where the camera should be at a scroll position measured in sheets. */
export function cameraAt(sheet: number): CameraView {
  const keys = CAMERA_KEYS;
  const after = keys.findIndex((k) => k.at > sheet);
  const b = keys[after < 0 ? keys.length - 1 : after]!;
  const a = keys[after < 0 ? keys.length - 1 : Math.max(0, after - 1)]!;
  const t = a === b ? 0 : smoothstep(Math.min(1, Math.max(0, (sheet - a.at) / (b.at - a.at))));
  const blend = (from: number, to: number) => from + (to - from) * t;
  return {
    position: [blend(a.position[0], b.position[0]), blend(a.position[1], b.position[1]), blend(a.position[2], b.position[2])],
    target: [blend(a.target[0], b.target[0]), blend(a.target[1], b.target[1]), blend(a.target[2], b.target[2])],
    fov: blend(a.fov ?? DEFAULT_FOV, b.fov ?? DEFAULT_FOV),
  };
}

/**
 * How far into the car the story is: 0 on the sheets that show the whole car, 1 through the engine
 * chapter, and in between on the way in and on the way back out.
 */
export function diveDepth(sheet: number): number {
  if (sheet <= ENGINE_FIRST_SHEET) return Math.max(0, sheet / ENGINE_FIRST_SHEET);
  if (sheet >= ENGINE_LAST_SHEET) return Math.max(0, (HERITAGE_SHEET - sheet) / (HERITAGE_SHEET - ENGINE_LAST_SHEET));
  return 1;
}

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
