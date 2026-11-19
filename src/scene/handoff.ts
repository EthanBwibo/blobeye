/**
 * The car handed from the drawing sheet to the Safari stage, so the drive-off and the start are one shot
 * with the same car in both. Types only: the page and the game's chunk both read this, and neither pulls
 * the other in.
 */
import type { Car } from './carScene';

export interface Handoff {
  /** The drawing's own car, taken out of the drawing. The stage puts it on the road and gives it back with `giveBack`. */
  car: Car;
  /** Where the drawing's camera was, and the point it looked at, in the car model's own frame and units (+z to the front, -x to its right, y up). */
  eye: readonly [number, number, number];
  target: readonly [number, number, number];
  /** The drawing's lens, in degrees, and how far its picture was shifted off centre, as shares of the screen's width and height. */
  fov: number;
  shift: readonly [number, number];
  /** How fast the car was pulling away, and how far its wheels had turned, in model units. */
  speed: number;
  rolled: number;
  /** Put the car back in the drawing, as it was before it drove off. */
  giveBack(): void;
}
