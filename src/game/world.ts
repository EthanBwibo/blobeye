/**
 * The Safari stage in 3D: the road across the savannah, the bush, the hills, the sky, the car and its dust,
 * what lies on the road (rocks, a ford, a bridge, crests and a herd of zebra), and the ghost of the best run.
 * This file only draws. Where things are comes from `stage.ts` and `scenery.ts`, how the car moves from
 * `handling.ts`, and where the camera sits from `chase.ts`.
 *
 * The game's ground is x and y seen from above. Here that is x and z, with y up, so a heading of 0 still
 * points along +x and turning right still looks like turning right.
 *
 * Part of the game's chunk: nothing here may be imported by the main page.
 */
import * as THREE from 'three';
import { WHEELS } from '../car/model';
import { createCar } from '../scene/carScene';
import { lightStudio } from '../scene/studio';
import type { Place } from './chase';
import type { CarState } from './handling';
import { groundAt, roomAt } from './hazards';
import { SKIES, type Light } from './light';
import { NAIVASHA_BUSH, RUN_OUT, growScenery, roadFrame, scatter, type BushMix } from './scenery';
import type { GhostPose } from './ghost';
import type { Stage } from './stage';

/** The car is drawn this long, in metres. */
export const CAR_LENGTH = 4.6;
/** Metres per unit of the car model, which is 100 long. */
export const UNIT = CAR_LENGTH / 100;
/** The most dust that is ever in the air. A phone keeps less (see `World.mostDust`). */
export const MOST_DUST = 420;
/** The opacity of the ghost car. */
const GHOST_OPACITY = 0.32;
/** The front wheels turn this far at full lock, in radians. */
const FULL_LOCK = 0.42;

/** One puff of dust, or of spray from the ford. */
export interface Puff {
  x: number;
  y: number;
  height: number;
  /** How wide it is, in metres. */
  width: number;
  /** 0 is invisible, 1 is solid. */
  fade: number;
  /** 0 is dust, 1 is water. */
  wet: number;
}

export interface View {
  car: CarState;
  /** -1 is full left, 1 is full right. */
  steer: number;
  /** How far the wheels have rolled, in metres. */
  rolled: number;
  /** The body leaning into its springs, in radians: positive `dive` is nose down, positive `lean` is left side up. */
  dive: number;
  lean: number;
  /** How high the car is above the flat ground: on the crest, and in the air past it. */
  lift: number;
  /** How far the wheels are off the road, in metres: 0 except in a jump. The shadow stays on the road. */
  air: number;
  /** Where each zebra is on the ground, and the way it is walking. */
  herd: readonly { x: number; y: number; heading: number }[];
  eye: Place;
  target: Place;
  /** The lens, in degrees. */
  fov: number;
  dust: readonly Puff[];
  /** Where the best run's car is, or null for no ghost. */
  ghost: GhostPose | null;
}

export interface WorldOptions {
  /** The bush beside this stage's road. */
  bush?: BushMix;
  /** A phone: fewer pixels, no smoothing of edges, half the bush and less dust, so it keeps up. */
  lite?: boolean;
}

export interface World {
  canvas: HTMLCanvasElement;
  resize(width: number, height: number): void;
  /** Re-read the colours, as they stand for `scope`: the game's screen carries the time of day's own. */
  applyTheme(scope?: Element): void;
  /** Move the sun and the haze to a time of day. The colours follow with `applyTheme`. */
  setLight(light: Light): void;
  draw(view: View): void;
  /** The most puffs of dust this world will draw. */
  mostDust: number;
  /** Let go of the graphics memory. The world cannot be drawn again. */
  dispose(): void;
}

/** Where the light comes from, for the shading baked into the simple shapes, and where the sun hangs in the sky. */
const LIGHT = new THREE.Vector3(0.5, 0.75, -0.45).normalize();
const SUN = new THREE.Vector3(...SKIES.dusk.sun).normalize();

/** Give a shape flat facets, lighter where they face the light. The material's colour multiplies this. */
function shaded(geometry: THREE.BufferGeometry, faceted = true): THREE.BufferGeometry {
  const shape = faceted && geometry.index ? geometry.toNonIndexed() : geometry;
  shape.computeVertexNormals();
  const normal = shape.getAttribute('normal');
  const tones = new Float32Array(normal.count * 3);
  for (let i = 0; i < normal.count; i++) {
    const facing = (normal.getX(i) * LIGHT.x + normal.getY(i) * LIGHT.y + normal.getZ(i) * LIGHT.z) * 0.5 + 0.5;
    tones.fill(0.52 + 0.48 * facing, i * 3, i * 3 + 3);
  }
  shape.setAttribute('color', new THREE.BufferAttribute(tones, 3));
  return shape;
}

/**
 * A strip laid along the road from one distance to another. `profile` is its cross-section, as
 * [metres right of the middle, height] from left to right.
 */
function strip(
  stage: Stage,
  from: number,
  to: number,
  profile: readonly (readonly [number, number])[],
  step = 4,
  lift: (distance: number, across: number) => number = () => 0,
): THREE.BufferGeometry {
  const rows = Math.max(1, Math.ceil((to - from) / step));
  const cols = profile.length;
  const points = new Float32Array((rows + 1) * cols * 3);
  const index: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const distance = from + ((to - from) * i) / rows;
    const { x, y, right } = roadFrame(stage, distance);
    profile.forEach(([across, height], j) => points.set([x + right[0] * across, height + lift(distance, across), y + right[1] * across], (i * cols + j) * 3));
    if (i === rows) break;
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      index.push(a, a + 1, a + cols, a + cols, a + 1, a + cols + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
  geometry.setIndex(index);
  return geometry;
}

/** Several shapes as one, so they are drawn together. All must be indexed and carry only positions. */
function joined(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const points: number[] = [];
  const index: number[] = [];
  for (const part of parts) {
    const start = points.length / 3;
    points.push(...(part.getAttribute('position').array as Float32Array));
    for (const i of part.getIndex()!.array) index.push(start + i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setIndex(index);
  return geometry;
}

/** A zebra from a few boxes, facing along +x and standing on the ground: its pale parts, and its dark ones. */
function zebraShapes(): { pale: THREE.BufferGeometry; dark: THREE.BufferGeometry } {
  const box = (long: number, tall: number, wide: number, x: number, y: number, z = 0, tilt = 0): THREE.BufferGeometry => {
    const shape = new THREE.BoxGeometry(long, tall, wide);
    if (tilt) shape.rotateZ(tilt);
    return shape.translate(x, y, z);
  };
  // Body, neck and head
  const pale = [box(1.5, 0.6, 0.48, 0, 1.08), box(0.3, 0.7, 0.26, 0.78, 1.5, 0, -0.5), box(0.46, 0.24, 0.24, 1.08, 1.8, 0, -0.35)];
  // Muzzle, mane and tail
  const dark = [box(0.16, 0.2, 0.2, 1.3, 1.72, 0, -0.35), box(0.07, 0.6, 0.07, 0.62, 1.62, 0, -0.5), box(0.06, 0.5, 0.06, -0.78, 1.0, 0, 0.25)];
  for (const x of [-0.56, 0.56]) {
    for (const z of [-0.15, 0.15]) {
      pale.push(box(0.12, 0.7, 0.12, x, 0.45, z));
      dark.push(box(0.14, 0.12, 0.14, x, 0.06, z));
    }
  }
  // Stripes: bands a little proud of the body and the neck
  for (let i = 0; i < 5; i++) dark.push(box(0.1, 0.62, 0.5, -0.56 + i * 0.28, 1.08));
  for (let i = 0; i < 2; i++) dark.push(box(0.09, 0.3, 0.28, 0.7 + i * 0.1, 1.4 + i * 0.2, 0, -0.5));
  return { pale: shaded(joined(pale)), dark: shaded(joined(dark)) };
}

/** A line of hills all the way round, as a wall whose top edge rises and falls. */
function hillRing(radius: number, height: number, seed: number): THREE.BufferGeometry {
  const random = scatter(seed);
  const waves = [2, 3, 5, 8, 13].map((count, i) => ({ count, phase: random() * Math.PI * 2, size: [0.3, 0.26, 0.2, 0.14, 0.1][i]! }));
  const steps = 240;
  const points: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const rise = waves.reduce((sum, w) => sum + w.size * Math.sin(angle * w.count + w.phase), 0.45);
    const [x, z] = [Math.cos(angle) * radius, Math.sin(angle) * radius];
    points.push(x, -20, z, x, height * Math.max(0.06, rise), z);
    if (i < steps) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setIndex(index);
  return geometry;
}

/** The sky: pale at the horizon, deeper overhead, with a low sun and its glow. */
function skyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color() },
      haze: { value: new THREE.Color() },
      sun: { value: new THREE.Color() },
      sunAt: { value: SUN },
    },
    vertexShader: `
      varying vec3 vWay;
      void main() {
        vWay = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top;
      uniform vec3 haze;
      uniform vec3 sun;
      uniform vec3 sunAt;
      varying vec3 vWay;
      void main() {
        vec3 way = normalize(vWay);
        vec3 tone = mix(haze, top, smoothstep(0.02, 0.55, way.y));
        float near = max(0.0, dot(way, sunAt));
        tone = mix(tone, sun, 0.5 * pow(near, 28.0) + smoothstep(0.9988, 0.9993, near));
        gl_FragColor = vec4(tone, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
  });
}

/** Dust and spray: soft round puffs that always face the camera, and thin out right in front of it. */
function dustMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color() }, spray: { value: new THREE.Color() }, pixels: { value: 600 } },
    vertexShader: `
      attribute float width;
      attribute float fade;
      attribute float wet;
      uniform float pixels;
      varying float vFade;
      varying float vWet;
      void main() {
        vWet = wet;
        vec4 seen = modelViewMatrix * vec4(position, 1.0);
        float away = max(0.1, -seen.z);
        vFade = fade * smoothstep(1.5, 6.0, away);
        gl_PointSize = min(width * pixels / away, pixels * 0.55);
        gl_Position = projectionMatrix * seen;
      }`,
    fragmentShader: `
      uniform vec3 color;
      uniform vec3 spray;
      varying float vFade;
      varying float vWet;
      void main() {
        float rim = length(gl_PointCoord - 0.5) * 2.0;
        float alpha = vFade * (1.0 - smoothstep(0.3, 1.0, rim));
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(mix(color, spray, vWet), alpha);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
}

export function createWorld(stage: Stage, options: WorldOptions = {}): World {
  const lite = options.lite ?? false;
  const mostDust = lite ? 160 : MOST_DUST;
  const renderer = new THREE.WebGLRenderer({ antialias: !lite, powerPreference: 'high-performance' });
  // Enough to look sharp; more only costs frames on a laptop's graphics. A phone draws fewer pixels than its
  // screen has and lets the browser stretch them: its screen is small and dense enough that it hardly shows.
  renderer.setPixelRatio(lite ? Math.min(window.devicePixelRatio || 1, 1) * 0.85 : Math.min(window.devicePixelRatio || 1, 1.5));
  const canvas = renderer.domElement;
  const scene = new THREE.Scene();
  const fog = new THREE.Fog(0, SKIES.dusk.fog.near, SKIES.dusk.fog.far);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(58, 1, 0.5, 2600);

  const flat = (options: THREE.MeshBasicMaterialParameters = {}) => new THREE.MeshBasicMaterial(options);
  /** Painted on the ground: drawn first, in order, and never in the way of anything standing on it. */
  const ground = (options: THREE.MeshBasicMaterialParameters = {}) => flat({ depthWrite: false, side: THREE.DoubleSide, ...options });
  const mat = {
    sky: skyMaterial(),
    farHills: flat({ fog: false, depthWrite: false, side: THREE.DoubleSide }),
    nearHills: flat({ fog: false, depthWrite: false, side: THREE.DoubleSide }),
    savannah: ground(),
    verge: ground(),
    road: ground(),
    ruts: ground({ transparent: true, opacity: 0.2 }),
    paperLine: ground(),
    inkLine: ground(),
    berm: flat({ vertexColors: true }),
    trunk: flat({ vertexColors: true }),
    canopy: flat({ vertexColors: true }),
    rock: flat({ vertexColors: true }),
    tuft: flat({ vertexColors: true }),
    ink: flat(),
    paper: flat(),
    gold: flat(),
    water: ground(),
    gully: ground(),
    plank: ground(),
    post: flat({ vertexColors: true }),
    rail: flat({ side: THREE.DoubleSide }),
    zebra: flat({ vertexColors: true }),
    stripe: flat({ vertexColors: true }),
    dust: dustMaterial(),
  };
  let layer = -30;
  /** Add something that is behind or under everything else. Each is drawn over the one before. */
  const backdrop = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = scene): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = layer++;
    mesh.frustumCulled = false;
    parent.add(mesh);
    return mesh;
  };

  // --- Sky, hills and the plain. These go wherever the camera goes, so they are always far away.
  const surround = new THREE.Group();
  scene.add(surround);
  backdrop(new THREE.SphereGeometry(1500, 32, 16), mat.sky, surround);
  backdrop(hillRing(1300, 130, 11), mat.farHills, surround);
  backdrop(hillRing(1000, 62, 29), mat.nearHills, surround);
  backdrop(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), mat.savannah, surround);

  // --- The road: red murram with a darker verge, and broken ruts so its speed shows
  const half = stage.halfWidth;
  const hazards = stage.hazards;
  const { crests, water, bridge } = hazards;
  const [from, to] = [-RUN_OUT, stage.length + RUN_OUT];
  const across = (left: number, right: number): [number, number][] => [[left, 0], [right, 0]];
  /** A crest lifts the road, and falls away to nothing in the grass beside it. */
  const rise = (distance: number, out: number): number => groundAt(hazards, distance) * Math.min(1, Math.max(0, (half + 10 - Math.abs(out)) / 8.8));
  /** A strip along the road that rides over the crests with it. */
  const lay = (begin: number, end: number, profile: readonly (readonly [number, number])[], step = 4) => strip(stage, begin, end, profile, step, rise);
  // Each crest's own earth, so the raised road does not hang in the air
  for (const crest of crests) {
    if (crest.height > 0) backdrop(lay(crest.at - crest.reach, crest.at + crest.reach, [[-half - 10, 0], [-half - 0.9, 0], [half + 0.9, 0], [half + 10, 0]], 2), mat.savannah);
  }
  backdrop(lay(from, to, across(-half - 0.9, half + 0.9)), mat.verge);
  backdrop(lay(from, to, across(-half, half)), mat.road);
  // Start line, and a chequered finish
  const square = half / 4;
  backdrop(
    joined([lay(stage.startAt + 4.6, stage.startAt + 5.4, across(-half, half)), lay(stage.finishAt, stage.finishAt + square * 2, across(-half, half))]),
    mat.paperLine,
  );
  const chequers: THREE.BufferGeometry[] = [];
  for (let row = 0; row < 2; row++) {
    for (let i = row; i < 8; i += 2) {
      chequers.push(lay(stage.finishAt + row * square, stage.finishAt + (row + 1) * square, across(-half + i * square, -half + (i + 1) * square)));
    }
  }
  backdrop(joined(chequers), mat.inkLine);
  const ruts: THREE.BufferGeometry[] = [];
  for (let d = from; d < to; d += 16) ruts.push(lay(d, d + 5, across(-half * 0.45, half * 0.45), 2.5));
  for (const side of [-1, 1]) ruts.push(lay(from, to, across(side * 1.9 - 0.35, side * 1.9 + 0.35)));
  backdrop(joined(ruts), mat.ruts);

  // --- The ford: a stream lying over the road
  const hasWater = water.to > water.from && water.from >= 0;
  if (hasWater) backdrop(lay(water.from, water.to, across(-60, 60)), mat.water);

  // --- The bridge: a gully across the road, and a deck of planks over it
  const hasBridge = bridge.half < half && bridge.to > bridge.from && bridge.from >= 0;
  const deck = bridge.half + 1.3;
  if (hasBridge) {
    backdrop(lay(bridge.from, bridge.to, across(-60, 60)), mat.gully);
    backdrop(lay(bridge.from - 1.5, bridge.to + 1.5, across(-deck, deck), 2), mat.plank);
    const gaps: THREE.BufferGeometry[] = [];
    for (let d = bridge.from - 1.5; d < bridge.to + 1.5; d += 1.5) gaps.push(lay(d, d + 0.14, across(-deck, deck)));
    backdrop(joined(gaps), mat.ruts);
  }

  // --- Road edges: a low bank of thrown-up earth down each side, broken where the water and the gully cross
  const breaks = [hasWater ? [water.from, water.to] : null, hasBridge ? [bridge.from, bridge.to] : null].filter((b) => b !== null).sort((a, b) => a[0]! - b[0]!);
  const banks: [number, number][] = [];
  let begin = from;
  for (const [a, b] of breaks) {
    banks.push([begin, a!]);
    begin = b!;
  }
  banks.push([begin, to]);
  for (const side of [-1, 1]) {
    const bank: [number, number][] = [[half, 0], [half + 0.4, 0.24], [half + 1.0, 0]];
    const profile = side > 0 ? bank : bank.map(([x, y]) => [-x, y] as [number, number]).reverse();
    for (const [a, b] of banks) scene.add(new THREE.Mesh(shaded(lay(a, b, profile), false), mat.berm));
  }

  // --- The bush: every tree, rock and tuft is one of a few simple shapes, drawn many times
  const bush = growScenery(stage, options.bush ?? NAIVASHA_BUSH, lite ? 0.5 : 1);
  const spot = new THREE.Object3D();
  const tint = new THREE.Color();
  const many = <T>(geometry: THREE.BufferGeometry, material: THREE.Material, items: readonly T[], place: (item: T) => number): void => {
    if (!items.length) return;
    const mesh = new THREE.InstancedMesh(shaded(geometry), material, items.length);
    items.forEach((item, i) => {
      spot.rotation.set(0, 0, 0);
      const tone = place(item);
      spot.updateMatrix();
      mesh.setMatrixAt(i, spot.matrix);
      mesh.setColorAt(i, tint.setScalar(tone));
    });
    scene.add(mesh);
  };
  const trunkHeight = (r: number) => 2.4 + r * 0.7;
  many(new THREE.CylinderGeometry(0.1, 0.17, 1, 5, 1, true).translate(0, 0.5, 0), mat.trunk, bush.trees, (tree) => {
    spot.position.set(tree.x, 0, tree.y);
    spot.rotation.y = tree.turn;
    spot.scale.set(1 + tree.r * 0.3, trunkHeight(tree.r), 1 + tree.r * 0.3);
    return 0.85 + tree.vary * 0.2;
  });
  // A thorn tree's crown is flat on top and wider than it is tall.
  many(new THREE.CylinderGeometry(1, 0.3, 0.34, 8).translate(0, 0.17, 0), mat.canopy, bush.trees, (tree) => {
    spot.position.set(tree.x, trunkHeight(tree.r) - 0.25, tree.y);
    spot.rotation.y = tree.turn;
    spot.scale.set(tree.r, tree.r * (0.7 + tree.vary * 0.3), tree.r * (0.85 + tree.vary * 0.15));
    return 0.84 + tree.vary * 0.22;
  });
  many(new THREE.IcosahedronGeometry(1, 0).scale(1, 0.62, 1).translate(0, 0.3, 0), mat.rock, [...bush.rocks, ...stage.rocks.map((rock, i) => ({ ...rock, turn: i * 2.4, vary: 0.5 }))], (rock) => {
    spot.position.set(rock.x, 0, rock.y);
    spot.rotation.y = rock.turn;
    spot.scale.set(rock.r * (0.8 + rock.vary * 0.5), rock.r * (0.7 + rock.vary * 0.5), rock.r);
    return 0.86 + rock.vary * 0.2;
  });
  many(new THREE.ConeGeometry(1, 1, 5, 1, true).translate(0, 0.5, 0), mat.tuft, bush.tufts, (tuft) => {
    spot.position.set(tuft.x, 0, tuft.y);
    spot.rotation.y = tuft.turn;
    spot.scale.set(tuft.r * 0.8, 0.3 + tuft.vary * 0.5, tuft.r * 0.8);
    return 0.82 + tuft.vary * 0.26;
  });

  // --- The bridge's rails: posts that funnel the road in, and a rail down each side of the deck
  if (hasBridge) {
    const posts: { x: number; y: number }[] = [];
    for (let d = bridge.from - bridge.taper; d <= bridge.to + bridge.taper; d += 3) {
      const { x, y, right } = roadFrame(stage, d);
      const out = roomAt(hazards, d, half) + 1.3;
      for (const side of [-1, 1]) posts.push({ x: x + right[0] * out * side, y: y + right[1] * out * side });
    }
    many(new THREE.BoxGeometry(0.2, 1.1, 0.2).translate(0, 0.55, 0), mat.post, posts, (p) => {
      spot.position.set(p.x, 0, p.y);
      spot.scale.setScalar(1);
      return 1;
    });
    for (const side of [-1, 1]) scene.add(new THREE.Mesh(lay(bridge.from - 1.5, bridge.to + 1.5, [[side * deck, 0.6], [side * deck, 0.95]], 2), mat.rail));
  }

  // --- The zebra: one shape, drawn for each of the herd
  const zebraShape = zebraShapes();
  const herd = Array.from({ length: hazards.zebra.count }, () => {
    const zebra = new THREE.Group();
    zebra.add(new THREE.Mesh(zebraShape.pale, mat.zebra), new THREE.Mesh(zebraShape.dark, mat.stripe));
    scene.add(zebra);
    return zebra;
  });

  // --- Posts at the start, and a chequered banner over the finish
  const gate = (distance: number): THREE.Group => {
    const { x, y, ahead } = roadFrame(stage, distance);
    const group = new THREE.Group();
    group.position.set(x, 0, y);
    // Turned so the group's x runs along the road and its z across it.
    group.rotation.y = -Math.atan2(ahead[1], ahead[0]);
    scene.add(group);
    return group;
  };
  const reach = half + 1.5;
  const post = (parent: THREE.Group, side: number, height: number): void => {
    parent.add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, height, 8).translate(0, height / 2, side * reach), mat.ink));
  };
  const start = gate(stage.startAt + 5);
  for (const side of [-1, 1]) {
    post(start, side, 3.2);
    start.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.05).translate(0.45, 2.9, side * reach), mat.gold));
  }
  const finish = gate(stage.finishAt);
  for (const side of [-1, 1]) post(finish, side, 5.6);
  finish.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, reach * 2).translate(0, 5, 0), mat.paper));
  const tile = (reach * 2) / 34;
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.5, tile), mat.ink, 34);
  let placed = 0;
  for (let row = 0; row < 2; row++) {
    for (let i = row; i < 34; i += 2) {
      spot.position.set(0, 4.75 + row * 0.5, -reach + (i + 0.5) * tile);
      spot.rotation.set(0, 0, 0);
      spot.scale.setScalar(1);
      spot.updateMatrix();
      tiles.setMatrixAt(placed++, spot.matrix);
    }
  }
  finish.add(tiles);

  // --- The car: the same model as the drawing, at road size
  const car = createCar();
  car.group.scale.setScalar(UNIT);
  // Turn to the heading first, then dip the nose, then lean.
  car.group.rotation.order = 'YXZ';
  scene.add(car.group);
  // The ghost: the same car again, see-through. It cannot be hit.
  const ghost = createCar();
  ghost.group.scale.setScalar(UNIT);
  ghost.group.rotation.order = 'YXZ';
  ghost.group.visible = false;
  ghost.setOpacity(GHOST_OPACITY);
  // Drawn after the car, so the car shows through it and not the other way round.
  ghost.group.traverse((part) => void (part.renderOrder = 8));
  scene.add(ghost.group);

  // --- Dust
  const dustShape = new THREE.BufferGeometry();
  const dustAt = new THREE.BufferAttribute(new Float32Array(mostDust * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const dustWidth = new THREE.BufferAttribute(new Float32Array(mostDust), 1).setUsage(THREE.DynamicDrawUsage);
  const dustFade = new THREE.BufferAttribute(new Float32Array(mostDust), 1).setUsage(THREE.DynamicDrawUsage);
  dustShape.setAttribute('position', dustAt);
  dustShape.setAttribute('width', dustWidth);
  dustShape.setAttribute('fade', dustFade);
  const dustWet = new THREE.BufferAttribute(new Float32Array(mostDust), 1).setUsage(THREE.DynamicDrawUsage);
  dustShape.setAttribute('wet', dustWet);
  dustShape.setDrawRange(0, 0);
  const dust = new THREE.Points(dustShape, mat.dust);
  dust.frustumCulled = false;
  dust.renderOrder = 5;
  scene.add(dust);

  const applyTheme = (scope?: Element): void => {
    const css = getComputedStyle(scope instanceof Element && scope.isConnected ? scope : document.documentElement);
    const token = (name: string) => new THREE.Color(css.getPropertyValue(name).trim());
    const haze = token('--haze');
    fog.color = haze;
    scene.background = haze;
    mat.sky.uniforms.top!.value = token('--sky');
    mat.sky.uniforms.haze!.value = haze;
    mat.sky.uniforms.sun!.value = token('--sun');
    // Hills pale with distance, towards the colour of the air.
    mat.farHills.color = token('--hills').lerp(haze, 0.72);
    mat.nearHills.color = token('--hills').lerp(haze, 0.45);
    mat.savannah.color = token('--savannah');
    mat.verge.color = mat.ruts.color = mat.berm.color = token('--murram-edge');
    mat.road.color = token('--murram');
    mat.paperLine.color = mat.paper.color = token('--paper');
    mat.inkLine.color = mat.ink.color = token('--ink');
    mat.trunk.color = token('--bark');
    mat.canopy.color = token('--acacia');
    mat.rock.color = token('--rock');
    mat.tuft.color = token('--scrub');
    mat.gold.color = token('--gold');
    mat.dust.uniforms.color!.value = token('--dust');
    mat.dust.uniforms.spray!.value = token('--spray');
    mat.water.color = token('--water');
    mat.gully.color = token('--stage-shade');
    mat.plank.color = token('--plank');
    mat.post.color = token('--paper');
    mat.rail.color = token('--ink');
    mat.zebra.color = token('--zebra');
    mat.stripe.color = token('--stripe');
    // On the earth the car's shadow is brown, not the blue it casts on the drawing sheet.
    car.applyTheme((name) => token(name === '--ground-shade' ? '--stage-shade' : name));
    ghost.applyTheme((name) => token(name === '--ground-shade' ? '--stage-shade' : name));
  };
  applyTheme();

  const setLight = (light: Light): void => {
    const sky = SKIES[light];
    SUN.set(...sky.sun).normalize();
    fog.near = sky.fog.near;
    fog.far = sky.fog.far;
  };

  const resize = (width: number, height: number): void => {
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  };

  const draw = (view: View): void => {
    const { car: at, eye, target } = view;
    car.group.position.set(at.x, view.lift, at.y);
    car.group.rotation.set(view.dive, Math.PI / 2 - at.heading, view.lean);
    car.setSteer(view.steer * FULL_LOCK);
    car.setRoll(view.rolled / (WHEELS.radius * UNIT));
    car.setAir(view.air / UNIT);

    ghost.group.visible = view.ghost !== null;
    if (view.ghost) {
      ghost.group.position.set(view.ghost.x, view.ghost.height, view.ghost.y);
      ghost.group.rotation.set(0, Math.PI / 2 - view.ghost.heading, 0);
    }

    camera.position.set(eye.x, eye.height, eye.y);
    camera.lookAt(target.x, target.height, target.y);
    if (camera.fov !== view.fov) {
      camera.fov = view.fov;
      camera.updateProjectionMatrix();
    }
    surround.position.set(eye.x, 0, eye.y);

    herd.forEach((zebra, i) => {
      const where = view.herd[i];
      zebra.visible = where !== undefined;
      if (!where) return;
      // A small bob as it walks.
      zebra.position.set(where.x, Math.abs(Math.sin((where.x + where.y) * 1.7)) * 0.06, where.y);
      zebra.rotation.y = -where.heading;
    });

    const count = Math.min(view.dust.length, mostDust);
    for (let i = 0; i < count; i++) {
      const puff = view.dust[i]!;
      dustAt.setXYZ(i, puff.x, puff.height, puff.y);
      dustWidth.setX(i, puff.width);
      dustFade.setX(i, puff.fade);
      dustWet.setX(i, puff.wet);
    }
    dustAt.needsUpdate = dustWidth.needsUpdate = dustFade.needsUpdate = dustWet.needsUpdate = true;
    dustShape.setDrawRange(0, count);
    mat.dust.uniforms.pixels!.value = canvas.height / (2 * Math.tan((view.fov * Math.PI) / 360));

    renderer.render(scene, camera);
  };

  lightStudio(renderer, scene);
  // Have the shaders ready before the first frame, so the cut into the stage does not stutter.
  renderer.compile(scene, camera);

  const dispose = (): void => {
    scene.traverse((object) => {
      const { geometry, material } = object as THREE.Mesh;
      geometry?.dispose();
      for (const m of material === undefined ? [] : Array.isArray(material) ? material : [material]) m.dispose();
    });
    scene.environment?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };

  return { canvas, resize, applyTheme, setLight, draw, mostDust, dispose };
}
