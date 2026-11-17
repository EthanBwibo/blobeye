/**
 * The drivetrain, as numbers, for the X-ray sheet. The drawing in `src/scene/drivetrainScene.ts` is built from this.
 *
 * Units and axes are the car's (see `model.ts`): 100 long, +z is the front, y = 0 is the ground.
 *
 * This is a simplified picture, not a measured one. The parts are placed and sized so each reads on its
 * own from across the car: see "Illustrative" in `docs/FACTS.md`. The page names the parts and says nothing else.
 */
import { ENGINE_BAY, WHEELS, type Point } from './model';

/** A box, or a round bar from one point to another (a shaft, or a drum when it is short and fat). */
export type Solid =
  | { shape: 'box'; centre: Point; size: Point }
  | { shape: 'rod'; from: Point; to: Point; radius: number; endRadius?: number };

export interface DrivePart {
  /** The name shown on the drawing. */
  label: string;
  solids: readonly Solid[];
  /** Where on the part its leader line starts, and where the name sits at the other end. */
  anchor: Point;
  labelAt: Point;
}

/** The wheel centres' height, and the height of the line through the gearbox. */
const AXLE = WHEELS.radius;
const SPINE = 9.6;
const ENGINE_Y = ENGINE_BAY[1];
/** The stand-in engine sits a little ahead of the detailed one, to leave the front axle line clear. */
const ENGINE_Z = 34;
/** Names sit in two rows clear of the car: above the roof and below the ground line. */
const ABOVE = 42;
const BELOW = -8;

const FRONT_DIFF_HALF = 4.2;
const REAR_DIFF_HALF = 3.2;
const GEARBOX_FRONT = ENGINE_Z - 3.7;
const CENTRE_FRONT = 12;
const CENTRE_REAR = 7.5;
const SHAFT_END = -24.6;

/** The six named parts, from nose to tail. */
export const DRIVETRAIN: readonly DrivePart[] = [
  {
    label: 'Engine',
    solids: [
      { shape: 'box', centre: [0, ENGINE_Y, ENGINE_Z], size: [7, 5.6, 7.4] },
      ...([1, -1] as const).flatMap((side): Solid[] => [
        { shape: 'box', centre: [side * 5.25, ENGINE_Y, ENGINE_Z], size: [3.5, 4.2, 6.8] },
        { shape: 'box', centre: [side * 8, ENGINE_Y, ENGINE_Z], size: [2, 5, 7.2] },
      ]),
    ],
    anchor: [0, ENGINE_Y + 2.8, ENGINE_Z],
    labelAt: [0, ABOVE - 2, 39],
  },
  {
    label: 'Front differential',
    solids: [{ shape: 'rod', from: [-FRONT_DIFF_HALF, AXLE, WHEELS.frontZ], to: [FRONT_DIFF_HALF, AXLE, WHEELS.frontZ], radius: 2.2 }],
    anchor: [0, AXLE - 2.2, WHEELS.frontZ],
    labelAt: [0, BELOW, 37],
  },
  {
    label: 'Gearbox',
    solids: [{ shape: 'rod', from: [0, SPINE, GEARBOX_FRONT], to: [0, SPINE, CENTRE_FRONT], radius: 3.6, endRadius: 2.3 }],
    anchor: [0, SPINE + 3, 21],
    labelAt: [0, ABOVE + 2, 20],
  },
  {
    label: 'Centre differential',
    solids: [{ shape: 'rod', from: [0, SPINE, CENTRE_FRONT], to: [0, SPINE, CENTRE_REAR], radius: 3.1 }],
    anchor: [0, SPINE - 3.1, (CENTRE_FRONT + CENTRE_REAR) / 2],
    labelAt: [0, BELOW, 6],
  },
  {
    label: 'Prop shaft',
    solids: [{ shape: 'rod', from: [0, SPINE - 0.2, CENTRE_REAR], to: [0, AXLE + 0.1, SHAFT_END], radius: 0.75 }],
    anchor: [0, 9.2, -8],
    labelAt: [0, ABOVE, -8],
  },
  {
    label: 'Rear differential',
    solids: [
      { shape: 'rod', from: [-REAR_DIFF_HALF, AXLE, WHEELS.rearZ], to: [REAR_DIFF_HALF, AXLE, WHEELS.rearZ], radius: 2.3 },
      { shape: 'rod', from: [0, AXLE + 0.1, SHAFT_END], to: [0, AXLE, WHEELS.rearZ + 2], radius: 1.2 },
    ],
    anchor: [0, AXLE - 2.3, WHEELS.rearZ],
    labelAt: [0, BELOW, -30],
  },
];

/** The shafts out to the four wheels. Drawn so the picture joins up, but not named. */
export const HALF_SHAFTS: readonly Solid[] = (
  [
    [WHEELS.frontZ, FRONT_DIFF_HALF],
    [WHEELS.rearZ, REAR_DIFF_HALF],
  ] as const
).flatMap(([z, inner]) =>
  ([1, -1] as const).map(
    (side): Solid => ({ shape: 'rod', from: [side * inner, AXLE, z], to: [side * (WHEELS.track - WHEELS.width / 2 + 0.6), AXLE, z], radius: 0.55 }),
  ),
);
