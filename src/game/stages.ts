/**
 * The three stages, as data: the road's line and width, what lies on it, the bush beside it, and the
 * times to beat. Each takes its name from Safari Rally country around Lake Naivasha, but every route is
 * invented: none is a map of a real road or a real rally stage.
 *
 * `buildStage` in `stage.ts` turns one of these into a road. Pure data and functions.
 */
import { HAZARDS, NO_BRIDGE, NO_WATER, NO_ZEBRA, type Hazards } from './hazards';
import { ROUTE, ROUTE_SCALE, buildStage, type Spot, type Stage } from './stage';
import { NAIVASHA_BUSH, type BushMix } from './scenery';
import { TARGETS, type Targets } from './splits';

export interface StageDef {
  /** What the shared table calls it, in its `stage` column. Never change one: its times would be lost. */
  id: string;
  name: string;
  /** One line under the name in the picker. */
  blurb: string;
  route: readonly Spot[];
  scale: number;
  /** From the middle of the road to its edge, in metres. */
  halfWidth: number;
  hazards: Hazards;
  /** Bronze, silver and gold, in seconds. */
  targets: Targets;
  /** The bush: how much of it there is (1 is Naivasha's), and the shares of trees and rocks in it. The rest is grass. */
  bush: BushMix;
}

/** The lake shore: the stage as it was first built. */
const NAIVASHA: StageDef = {
  id: 'naivasha',
  name: 'Naivasha',
  blurb: 'Rocks, a ford, a bridge, zebra and a crest',
  route: ROUTE,
  scale: ROUTE_SCALE,
  halfWidth: 7,
  hazards: HAZARDS,
  targets: TARGETS,
  bush: NAIVASHA_BUSH,
};

/** The gorge: a narrow road that twists between rocks, with a stream and a plank bridge. */
const HELLS_GATE: StageDef = {
  id: 'hells-gate',
  name: "Hell's Gate",
  blurb: 'Narrow, rocky and tight',
  route: [
    [0, 0], [110, 0], [170, -35], [165, -105], [105, -140], [55, -195], [70, -265], [140, -290], [210, -260],
    [265, -295], [280, -365], [230, -425], [150, -435], [95, -485], [110, -555], [190, -580], [280, -550],
    [340, -585], [355, -660], [300, -715], [210, -715], [130, -735], [60, -735],
  ],
  scale: 1,
  halfWidth: 5,
  hazards: {
    rocks: [
      { along: 300, across: -3.2, r: 0.8 },
      { along: 306, across: -2.2, r: 0.6 },
      { along: 312, across: -3.4, r: 0.9 },
      { along: 640, across: 3.0, r: 0.8 },
      { along: 646, across: 2.0, r: 0.6 },
      { along: 653, across: 3.3, r: 0.8 },
      { along: 1150, across: -3.0, r: 0.9 },
      { along: 1157, across: -2.1, r: 0.6 },
    ],
    water: { from: 470, to: 482 },
    // In the middle of an S, where a left hands over to a right.
    bridge: { from: 880, to: 902, taper: 18, half: 2.4 },
    zebra: NO_ZEBRA,
    crests: [],
  },
  // Set like Naivasha's against the tests' scripted driver, which takes about 65 seconds here.
  targets: { gold: 63, silver: 69, bronze: 78 },
  bush: { density: 0.8, trees: 0.03, rocks: 0.22, seed: 1977 },
};

/** The ranch: wide, open and quick, over a run of crests, with a herd on the road. */
const SOYSAMBU: StageDef = {
  id: 'soysambu',
  name: 'Soysambu',
  blurb: 'Fast and open, crests and animals',
  route: [
    [0, 0], [320, 0], [560, -60], [740, -200], [820, -400], [800, -620], [880, -800], [1060, -880], [1280, -860],
    [1440, -760], [1560, -600], [1760, -540], [1960, -600], [2060, -760], [2040, -960],
  ],
  scale: 0.85,
  halfWidth: 8,
  hazards: {
    rocks: [],
    water: NO_WATER,
    bridge: NO_BRIDGE,
    // Everything is on a straight: the long one out of the start, the one after the long right, and the last.
    zebra: { at: 700, count: 8, gap: 7, span: 70, pace: 2.8, r: 1.1 },
    crests: [
      { at: 420, reach: 22, height: 1.3 },
      { at: 1550, reach: 20, height: 1.5 },
      { at: 2170, reach: 22, height: 1.4 },
    ],
  },
  // Set like Naivasha's against the tests' scripted driver, which takes about 77 seconds here, a herd of zebra included.
  targets: { gold: 75, silver: 82, bronze: 92 },
  bush: { density: 0.55, trees: 0.04, rocks: 0.02, seed: 1959 },
};

export const STAGES: readonly StageDef[] = [NAIVASHA, HELLS_GATE, SOYSAMBU];
export const DEFAULT_STAGE = NAIVASHA;

/** The stage with this id, or the first one if there is none. */
export function stageById(id: string | null | undefined): StageDef {
  return STAGES.find((def) => def.id === id) ?? DEFAULT_STAGE;
}

/** Lay the road for a stage. */
export function buildStageOf(def: StageDef): Stage {
  return buildStage(def.route, def.scale, 4, def.hazards, def.halfWidth);
}
