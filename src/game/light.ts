/**
 * The time of day on the stage, picked afresh for each run. Pure data: the colours for each are in
 * `rally.css`, under `#rally[data-light]`.
 */

export const LIGHTS = ['dawn', 'midday', 'dusk', 'night'] as const;
export type Light = (typeof LIGHTS)[number];

/** The light for a roll of the dice from 0 up to (not including) 1. */
export function pickLight(roll: number): Light {
  const safe = Number.isFinite(roll) ? Math.min(0.999999, Math.max(0, roll)) : 0;
  return LIGHTS[Math.floor(safe * LIGHTS.length)]!;
}

export interface Sky {
  /** Which way the sun is, as x, height and z in the drawing. It need not be one long. At night it is the moon. */
  sun: readonly [number, number, number];
  /** Where the haze starts to take things, and where it has taken them, in metres. */
  fog: { near: number; far: number };
  /** Dark enough that the road is only seen in the headlights. */
  dark: boolean;
  /** How brightly the car's paint is lit: the studio's light, turned down at night. */
  exposure: number;
}

export const SKIES: Record<Light, Sky> = {
  // Low in the east, with mist still on the plain.
  dawn: { sun: [-0.7, 0.12, 0.6], fog: { near: 50, far: 420 }, dark: false, exposure: 1.05 },
  // Overhead, and clear to the hills.
  midday: { sun: [0.25, 0.92, -0.3], fog: { near: 90, far: 760 }, dark: false, exposure: 1.05 },
  // Low in the west: the stage as it was first drawn.
  dusk: { sun: [0.6, 0.17, -0.75], fog: { near: 70, far: 560 }, dark: false, exposure: 1.05 },
  // A moon over the hills, and the dark coming in close.
  night: { sun: [0.35, 0.45, 0.7], fog: { near: 55, far: 430 }, dark: true, exposure: 0.4 },
};

/**
 * How strongly the headlights light the road: full at night with them on, a faint wash by day (they are
 * there, but the sun is brighter), and nothing with them off.
 */
export function lampStrength(light: Light, on: boolean): number {
  if (!on) return 0;
  return SKIES[light].dark ? 1 : 0.06;
}
