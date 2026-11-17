import * as THREE from 'three';
import {
  BELT,
  CABIN,
  HEADLAMP_OUTLINE,
  TAIL_LAMP_OUTLINE,
  frontAngle,
  PARTS,
  PLAN,
  RING,
  RING_SIZE,
  SIDE_BOTTOM,
  SIDE_TOP,
  WHEELS,
  lerpAt,
  section,
  sideX,
  surfacePoint,
  rimProfile,
  tyreProfile,
  wingArch,
  wrapPoint,
  type Pair,
  type Point,
} from '../car/model';
import { PLATES, pickPlate } from '../car/plates';

/** The word on the plates: picked once for each load of the page, so the drawing and the game agree. */
const PLATE_WORD = pickPlate(Math.random());

/** A number plate as a picture: a flat colour, a thin border and the word. Drawn again whenever the colours change. */
function plateFace(): { texture: THREE.CanvasTexture; paint(ground: string, ink: string): void } {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const paint = (ground: string, ink: string): void => {
    const pen = canvas.getContext('2d');
    if (!pen) return;
    pen.fillStyle = ground;
    pen.fillRect(0, 0, canvas.width, canvas.height);
    pen.strokeStyle = ink;
    pen.lineWidth = 6;
    pen.strokeRect(7, 7, canvas.width - 14, canvas.height - 14);
    pen.fillStyle = ink;
    pen.font = '700 86px "Barlow Condensed", "Arial Narrow", Arial, sans-serif';
    pen.textAlign = 'center';
    pen.textBaseline = 'middle';
    // Spaced out like pressed letters, and squeezed to fit if the word is a long one.
    const letters = PLATE_WORD.split('').join('\u2009');
    pen.fillText(letters, canvas.width / 2, canvas.height / 2 + 6, canvas.width - 56);
    texture.needsUpdate = true;
  };
  return { texture, paint };
}

export interface Car {
  /** The car in its own units (100 long, ground at y = 0). The caller scales and places it. */
  group: THREE.Group;
  /** Lift the bonnet by this angle in radians. 0 shuts it. */
  setBonnet(angle: number): void;
  /** Fade the whole car: 1 is solid, 0 is gone. */
  setOpacity(opacity: number): void;
  /** Drain the colour out of the car: 0 is painted, 1 is a line drawing on the paper. */
  setXray(amount: number): void;
  /** Turn the wheels by this angle in radians, as if the car had rolled forward. */
  setRoll(angle: number): void;
  /** Say how far the ground is below the wheels, in car units: 0 on the ground. In a jump the shadow stays down there, wider and fainter. */
  setAir(below: number): void;
  /** Turn the front wheels by this angle in radians. Positive steers to the car's right. */
  setSteer(angle: number): void;
  /** Re-read the colours. `token` turns a CSS custom property name into a colour. */
  applyTheme(token: (name: string) => THREE.Color): void;
}

const SIDES = [1, -1] as const;
/** How wide a window's frame is: along the car at each end of the pane, and round the body above and below it (in places round the ring). */
const FRAME = { ends: 0.45, round: 0.14 } as const;
const OUTLINE = 0.22;
const DEGREE = Math.PI / 180;
/** Roughly how far one degree round the nose or tail is, in car units. */
const PER_DEGREE = 0.36;

const vec = (p: Point) => new THREE.Vector3(p[0], p[1], p[2]);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const circle = (r: number, z: number, n = 56) =>
  Array.from({ length: n }, (_, i) => new THREE.Vector3(Math.cos((i / n) * Math.PI * 2) * r, Math.sin((i / n) * Math.PI * 2) * r, z));

/**
 * The paint: a physically lit metallic blue under a clearcoat. It takes its light and reflections from the
 * studio around it (see `lightStudio`), so the reflections slide over the body as it turns.
 */
function paintMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    metalness: 0.45,
    roughness: 0.38,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.1,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}

/**
 * The windows: tinted glass with a soft band of light that drifts slowly across it. `time` is in seconds;
 * the band stands still if it is never moved on.
 */
function glassMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color() }, shine: { value: new THREE.Color() }, opacity: { value: 1 }, time: { value: 0 } },
    vertexShader: `
      varying vec3 vPlace;
      void main() {
        vPlace = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 tint;
      uniform vec3 shine;
      uniform float opacity;
      uniform float time;
      varying vec3 vPlace;
      float band(float at, float width) {
        return smoothstep(0.0, width * 0.4, at) * (1.0 - smoothstep(width * 0.6, width, at));
      }
      void main() {
        // A slanted stripe, the same slant on every pane, so it reads as one reflection passing over the car.
        float across = fract((vPlace.z * 0.7 + vPlace.y * 1.5 + abs(vPlace.x) * 0.4) / 70.0 - time * 0.05);
        float light = 0.42 * band(across, 0.16) + 0.22 * band(fract(across + 0.27), 0.05);
        // A little paler towards the top of each pane, as glass is against the sky.
        vec3 tone = mix(tint, shine, 0.1 * smoothstep(18.0, 27.0, vPlace.y) + light);
        gl_FragColor = vec4(tone, opacity);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
  });
}

/**
 * The shadow under the car: a wide soft edge, deeper under the middle of the body, and darkest where each
 * tyre touches. `spread` is 0 with the car on the ground; as it leaves the ground the shadow widens and thins.
 */
function shadowMaterial(): THREE.ShaderMaterial {
  const tyres = [WHEELS.frontZ, WHEELS.rearZ].flatMap((z) => SIDES.map((s) => `vec2(${(s * WHEELS.track).toFixed(2)}, ${z.toFixed(2)})`));
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color() }, opacity: { value: 1 }, spread: { value: 0 } },
    vertexShader: `
      varying vec2 vPlace;
      void main() {
        vPlace = position.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 color;
      uniform float opacity;
      uniform float spread;
      varying vec2 vPlace;
      float roundBox(vec2 p, vec2 size, float r) {
        vec2 d = abs(p) - size + r;
        return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
      }
      float tyre(vec2 at) {
        vec2 d = (vPlace - at) / vec2(3.6, 7.0);
        return exp(-dot(d, d));
      }
      void main() {
        float edge = roundBox(vPlace, vec2(18.5, 48.5), 9.0);
        // A long soft edge, eased so it has no line where it ends, and a deeper core under the floor of the car
        float soft = 1.0 - smoothstep(-10.0 - 6.0 * spread, 15.0 + 14.0 * spread, edge);
        float core = 1.0 - smoothstep(-16.0, -2.0, edge);
        float body = (0.3 * soft * soft + 0.12 * core) / (1.0 + 1.2 * spread);
        float tyres = (${tyres.map((t) => `tyre(${t})`).join(' + ')}) * max(0.0, 1.0 - 3.0 * spread);
        gl_FragColor = vec4(color, opacity * min(0.8, body + 0.5 * tyres));
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
}

/**
 * Make a surface face outwards, so the paint can tell its top from its underside. A `solid` is judged
 * from its own middle; anything else is a piece of skin and is judged from the middle of the car.
 */
function orient(geometry: THREE.BufferGeometry, solid: boolean): THREE.BufferGeometry {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const index = geometry.getIndex();
  const count = index ? index.count : position.count;
  const at = (i: number) => new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(i) : i);
  const middle = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) middle.add(new THREE.Vector3().fromBufferAttribute(position, i));
  middle.divideScalar(position.count);
  let outward = 0;
  for (let i = 0; i < count; i += 3) {
    const a = at(i);
    const b = at(i + 1);
    const c = at(i + 2);
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    const centre = a.add(b).add(c).divideScalar(3);
    outward += normal.dot(centre.sub(solid ? middle : new THREE.Vector3(0, 13, centre.z * 0.6)));
  }
  if (outward < 0) {
    for (let i = 0; i < count; i += 3) {
      if (index) {
        const b = index.getX(i + 1);
        index.setX(i + 1, index.getX(i + 2));
        index.setX(i + 2, b);
      } else {
        const b = at(i + 1);
        const c = at(i + 2);
        position.setXYZ(i + 1, c.x, c.y, c.z);
        position.setXYZ(i + 2, b.x, b.y, b.z);
      }
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Move a point on the skin a little way out from the middle of the car, so details sit on top of the body. */
function lift(p: THREE.Vector3, amount: number): THREE.Vector3 {
  const out = new THREE.Vector2(p.x, p.y - 13);
  if (out.lengthSq() > 0) out.normalize();
  return p.set(p.x + out.x * amount, p.y + out.y * amount, p.z);
}

/** Positions along the car where a slice is taken: every unit, plus every traced point. */
function stations(): number[] {
  const all = new Set<number>();
  for (let z = 50; z >= -50; z -= 1) all.add(z);
  for (const line of [SIDE_TOP, SIDE_BOTTOM, BELT, PLAN]) for (const [z] of line) all.add(z);
  for (const z of [CABIN.cowl, CABIN.roofFront, CABIN.roofRear, CABIN.deck, PARTS.bonnet.front, PARTS.bonnet.rear]) all.add(z);
  const keep = new Set<number>([PARTS.bonnet.front, PARTS.bonnet.rear]);
  const sorted = [...all].sort((a, b) => b - a);
  // Drop near-duplicates, but never the two slices the bonnet is cut along.
  return sorted.filter((z, i) => keep.has(z) || i === 0 || (sorted[i - 1]! - z > 0.05 && !(keep.has(sorted[i + 1] ?? NaN) && z - sorted[i + 1]! <= 0.05)));
}

/** One whole slice across the car: up the left side, over the top and down the right. */
function fullRing(z: number): THREE.Vector3[] {
  const half = section(z);
  const ring = half.map(([x, y]) => new THREE.Vector3(x, y, z));
  for (let i = RING_SIZE - 2; i >= 1; i--) ring.push(new THREE.Vector3(-half[i]![0], half[i]![1], z));
  return ring;
}

/** The main shell: slices of the traced profile joined into one skin, with an opening where the bonnet goes. */
function shellGeometry(zs: number[]): THREE.BufferGeometry {
  const ringPoints = RING_SIZE * 2 - 2;
  const { front, rear, edge } = PARTS.bonnet;
  const points: THREE.Vector3[] = zs.flatMap(fullRing);
  const index: number[] = [];
  for (let i = 0; i < zs.length - 1; i++) {
    const underBonnet = zs[i]! <= front && zs[i + 1]! >= rear;
    for (let j = 0; j < ringPoints; j++) {
      if (underBonnet && j >= edge && j < ringPoints - edge) continue;
      const a = i * ringPoints + j;
      const b = i * ringPoints + ((j + 1) % ringPoints);
      index.push(a, b + ringPoints, b, a, a + ringPoints, b + ringPoints);
    }
  }
  for (const station of [0, zs.length - 1]) {
    const ring = points.slice(station * ringPoints, (station + 1) * ringPoints);
    const centre = ring.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(ringPoints);
    const c = points.push(centre) - 1;
    for (let j = 0; j < ringPoints; j++) {
      const a = station * ringPoints + j;
      const b = station * ringPoints + ((j + 1) % ringPoints);
      if (station) index.push(c, b, a);
      else index.push(c, a, b);
    }
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.setIndex(index);
  return orient(geometry, false);
}

/** A shell pushed outwards a little. Drawn inside-out in the line colour it shows as an outline. */
function outlineGeometry(shell: THREE.BufferGeometry): THREE.BufferGeometry {
  const geometry = shell.clone();
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  for (let i = 0; i < position.count; i++) {
    position.setXYZ(
      i,
      position.getX(i) + normal.getX(i) * OUTLINE,
      position.getY(i) + normal.getY(i) * OUTLINE,
      position.getZ(i) + normal.getZ(i) * OUTLINE,
    );
  }
  return geometry;
}

/** A grid of points turned into a surface. `rows` all have the same length. */
function sheet(rows: THREE.Vector3[][]): THREE.BufferGeometry {
  const width = rows[0]!.length;
  const index: number[] = [];
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < width - 1; j++) {
      const a = i * width + j;
      index.push(a, a + 1, a + width, a + 1, a + width + 1, a + width);
    }
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(rows.flat());
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** A flat outline in the (z, y) plane given thickness across the car, from x0 to x1. */
function prism(outline: readonly Pair[], x0: number, x1: number): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  const n = outline.length;
  const at = (i: number, x: number) => new THREE.Vector3(x, outline[i % n]![1], outline[i % n]![0]);
  for (let i = 0; i < n; i++) {
    points.push(at(i, x0), at(i + 1, x0), at(i + 1, x1), at(i, x0), at(i + 1, x1), at(i, x1));
    if (i > 0 && i < n - 1) points.push(at(0, x0), at(i, x0), at(i + 1, x0), at(0, x1), at(i + 1, x1), at(i, x1));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A solid with the same outline all the way across, like `prism`, but lifted by `rise(x)` as it goes: a bowed plank.
 * `xs` are the stations across the car, from one end to the other.
 */
function bowed(outline: readonly Pair[], xs: readonly number[], rise: (x: number) => number): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  const n = outline.length;
  const at = (i: number, x: number) => new THREE.Vector3(x, outline[i % n]![1] + rise(x), outline[i % n]![0]);
  for (let s = 0; s < xs.length - 1; s++) {
    const [x0, x1] = [xs[s]!, xs[s + 1]!];
    for (let i = 0; i < n; i++) points.push(at(i, x0), at(i + 1, x0), at(i + 1, x1), at(i, x0), at(i + 1, x1), at(i, x1));
  }
  // The two ends
  const [first, last] = [xs[0]!, xs[xs.length - 1]!];
  for (let i = 1; i < n - 1; i++) points.push(at(0, first), at(i, first), at(i + 1, first), at(0, last), at(i + 1, last), at(i, last));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.computeVertexNormals();
  return geometry;
}

/** A clear lens: thin, polished and see-through. `opacity` is its own; the car's fading multiplies it. */
function glassy(opacity: number): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({ roughness: 0.04, clearcoat: 1, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
  material.userData.opacity = opacity;
  return material;
}

export function createCar(): Car {
  const flat = () => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mat = {
    /** The paint: lit, metallic, under a clearcoat. */
    body: paintMaterial(),
    /** The paint's middle and darkest tones as plain colours, for small parts laid on the body. */
    paint: flat(),
    shade: flat(),
    /** Window frames, arch wells and openings. */
    dark: flat(),
    /** The panes inside the frames. */
    glass: glassMaterial(),
    /** Rubber: dark and matt, but it still catches a soft sheen from the studio on its sidewalls. */
    tyre: new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0, side: THREE.DoubleSide }),
    /** Edge lines drawn on top of the body. */
    line: new THREE.LineBasicMaterial(),
    /** The same line colour as a surface, drawn inside-out and slightly enlarged, for the outline. */
    hull: new THREE.MeshBasicMaterial({ side: THREE.BackSide }),
    /** Metallic gold: the wheels, and the amber reflector in each headlamp. */
    gold: new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0.3, side: THREE.DoubleSide }),
    /** The sides of the spokes and the inside of the rim, darker, so the wheel has depth. */
    goldDeep: new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0.45, side: THREE.DoubleSide }),
    metal: flat(),
    /** Polished chrome: the lamp bowls. It shows nothing but the studio it reflects. */
    chrome: new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0.12, side: THREE.DoubleSide }),
    /** The clear headlamp lens, domed over the lamps. */
    lens: glassy(0.18),
    /** The projector's small lens: dark, polished glass. */
    projector: new THREE.MeshPhysicalMaterial({ roughness: 0.05, clearcoat: 1, side: THREE.DoubleSide }),
    /** The tail lamps' red lens, over the housing and lamps. */
    tailLens: glassy(0.5),
    tail: flat(),
    tailGlow: flat(),
    shadow: shadowMaterial(),
  };
  const plates = { front: plateFace(), rear: plateFace() };
  /** The plates keep their own colours, so they are not among the paints above: they fade out on the X-ray sheet instead. */
  const plateMat = {
    front: new THREE.MeshBasicMaterial({ map: plates.front.texture }),
    rear: new THREE.MeshBasicMaterial({ map: plates.rear.texture }),
  };

  const car = new THREE.Group();
  const bonnetHinge = new THREE.Group();
  /** The turning part of each wheel, with the side of the car it is on. */
  const hubs: [THREE.Group, 1 | -1][] = [];
  /** The front wheels, which steer, with the side of the car each is on. */
  const steered: [THREE.Group, 1 | -1][] = [];
  const bonnet = new THREE.Group();
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], edges = false, parent: THREE.Object3D = car): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    if (edges) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), mat.line));
    parent.add(mesh);
    return mesh;
  };
  /** A painted part. `solid` parts are closed shapes; the rest are pieces of skin. */
  const painted = (geometry: THREE.BufferGeometry, solid = false, edges = false, parent: THREE.Object3D = car) =>
    add(orient(geometry, solid), mat.body, edges, parent);
  const line = (points: THREE.Vector3[], closed = false, parent: THREE.Object3D = car): void => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    parent.add(closed ? new THREE.LineLoop(geometry, mat.line) : new THREE.Line(geometry, mat.line));
  };
  const skin = (z: number, around: number, side: 1 | -1, amount = 0.1) => lift(vec(surfacePoint(z, around, side)), amount);
  /** A line along the skin at one place round the ring. */
  const along = (zFrom: number, zTo: number, around: number, side: 1 | -1): THREE.Vector3[] => {
    const steps = Math.max(2, Math.ceil(Math.abs(zFrom - zTo) * 2));
    return Array.from({ length: steps + 1 }, (_, i) => skin(mix(zFrom, zTo, i / steps), around, side));
  };
  /** A line round the skin at one position along the car. */
  const around = (z: number, from: number, to: number, side: 1 | -1): THREE.Vector3[] => {
    const steps = Math.max(2, Math.ceil(Math.abs(to - from) * 3));
    return Array.from({ length: steps + 1 }, (_, i) => skin(z, mix(from, to, i / steps), side));
  };
  const across = (z: number, from: number): void =>
    line([...around(z, from, RING.topCentre, 1), ...around(z, RING.topCentre, from, -1)]);
  /** A patch of skin between two places round the ring. Its ends can slope: z depends on how far up the patch you are. */
  const patch = (
    zFrom: (t: number) => number,
    zTo: (t: number) => number,
    low: number,
    high: number,
    side: 1 | -1,
    material: THREE.Material,
    out = 0.12,
    outline = true,
  ): THREE.Mesh => {
    const rows: THREE.Vector3[][] = [];
    const across = 5;
    const steps = Math.max(2, Math.ceil(Math.abs(zFrom(0.5) - zTo(0.5))));
    for (let i = 0; i <= steps; i++) {
      rows.push(
        Array.from({ length: across + 1 }, (_, j) => {
          const t = j / across;
          return skin(mix(zFrom(t), zTo(t), i / steps), mix(low, high, t), side, out);
        }),
      );
    }
    const mesh = add(sheet(rows), material);
    if (outline) line([...rows.map((r) => r[0]!), ...rows[steps]!, ...rows.map((r) => r[across]!).reverse(), ...rows[0]!.slice().reverse()].map((p) => lift(p.clone(), 0.04)), true);
    return mesh;
  };

  // --- Shadow on the sheet
  const shadow = add(new THREE.PlaneGeometry(120, 180).rotateX(-Math.PI / 2).translate(0, 0.04, 0), mat.shadow);

  // --- Main shell, lofted from the traced profile, with its outline
  const zs = stations();
  const shell = shellGeometry(zs);
  add(shell, mat.body);
  add(outlineGeometry(shell), mat.hull);

  // --- Bonnet: its own panel, hinged at the windscreen end, over a dark engine bay
  const hood = PARTS.bonnet;
  const hoodRows = zs.filter((z) => z <= hood.front && z >= hood.rear).map((z) => fullRing(z).slice(hood.edge, RING_SIZE * 2 - 1 - hood.edge));
  const hinge = new THREE.Vector3(0, lerpAt(SIDE_TOP, hood.rear), hood.rear);
  bonnetHinge.position.copy(hinge);
  bonnet.position.copy(hinge).negate();
  bonnetHinge.add(bonnet);
  car.add(bonnetHinge);
  painted(sheet(hoodRows), false, false, bonnet);
  const hoodEdge = [...hoodRows.map((r) => r[0]!), ...hoodRows[hoodRows.length - 1]!, ...hoodRows.map((r) => r[r.length - 1]!).reverse(), ...hoodRows[0]!.slice().reverse()];
  line(hoodEdge.map((p) => lift(p.clone(), 0.08)), true, bonnet);
  // The bay: dark walls and floor just inside the opening
  const bayFloor = (p: THREE.Vector3) => new THREE.Vector3(p.x * 0.97, lerpAt(SIDE_BOTTOM, p.z) + 1.4, p.z);
  const inset = (p: THREE.Vector3) => new THREE.Vector3(p.x * 0.985, p.y - 0.15, p.z);
  add(sheet(hoodRows.map((r) => [inset(r[0]!), bayFloor(r[0]!), bayFloor(r[r.length - 1]!), inset(r[r.length - 1]!)])), mat.dark);
  for (const row of [hoodRows[0]!, hoodRows[hoodRows.length - 1]!]) add(sheet([row.map(inset), row.map(bayFloor)]), mat.dark);
  const setBonnet = (angle: number): void => {
    bonnetHinge.rotation.x = -angle;
  };

  // --- Glass
  const { glass } = PARTS;
  // The side glass runs nearly from the belt to the roof edge: a tall, thin-pillared glasshouse.
  const sideLow = RING.shoulder + 0.2;
  const sideHigh = RING.topEdge - 0.15;
  const panes: THREE.Mesh[] = [];
  for (const side of SIDES) {
    const front = (t: number) => mix(glass.frontLow, glass.frontTop, t);
    const rear = (t: number) => mix(glass.rearLow, glass.rearTop, t);
    // Each window is a dark frame on the body with a pane of glass set inside it, a little smaller.
    const glazed = (zFrom: (t: number) => number, zTo: (t: number) => number, low: number, high: number, inset: number, lowInset = inset): void => {
      patch(zFrom, zTo, low, high, side, mat.dark);
      // The ends run from the front of the car to the back, so the pane's are moved in towards each other.
      const way = Math.sign(zTo(0.5) - zFrom(0.5));
      panes.push(patch((t) => zFrom(t) + way * FRAME.ends, (t) => zTo(t) - way * FRAME.ends, low + lowInset, high - inset, side, mat.glass, 0.2, false));
    };
    glazed(front, () => glass.pillar + glass.pillarHalf, sideLow, sideHigh, FRAME.round);
    glazed(() => glass.pillar - glass.pillarHalf, rear, sideLow, sideHigh, FRAME.round);
    // The windscreen and the rear screen meet their other halves in the middle of the car: no frame there.
    glazed(() => CABIN.cowl - 0.8, () => CABIN.roofFront + 0.6, RING.topEdge + 0.55, RING.topCentre, 0, FRAME.round);
    glazed(() => CABIN.roofRear - 0.7, () => CABIN.deck + 0.8, RING.topEdge + 0.55, RING.topCentre, 0, FRAME.round);
  }
  // The light on the glass drifts by itself, unless motion is to be kept down.
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const began = performance.now();
  // One pane keeps the time for all of them: it is always drawn, so the clock never stops.
  const keeper = panes[0]!;
  keeper.frustumCulled = false;
  keeper.onBeforeRender = () => {
    if (!still) mat.glass.uniforms.time!.value = (performance.now() - began) / 1000;
  };

  // --- Edge lines on the body
  for (const side of SIDES) {
    line(along(46, -46.5, RING.shoulder, side));
    line(along(CABIN.cowl, CABIN.deck, RING.topEdge, side));
    line(along(CABIN.deck - 0.4, -46.6, RING.shoulder + 1.6, side)); // boot edge
    for (const z of PARTS.doors) line(around(z, RING.sill + 1, RING.shoulder, side));
  }
  across(CABIN.cowl, RING.shoulder);
  across(CABIN.deck, RING.shoulder);
  across(-46.6, RING.shoulder + 1.6);

  // --- Side skirts: a stepped lip along the sill between the arches, fading in at each end
  const skirtFrom = WHEELS.frontZ - WHEELS.archRadius - 0.2;
  const skirtTo = WHEELS.rearZ + WHEELS.archRadius + 0.2;
  for (const side of SIDES) {
    const rows: THREE.Vector3[][] = [];
    for (let i = 0; i <= 44; i++) {
      const z = mix(skirtFrom, skirtTo, i / 44);
      const floor = lerpAt(SIDE_BOTTOM, z);
      const w = sideX(z, floor + 2.8);
      const swell = Math.min(1, (skirtFrom - z) / 2.5, (z - skirtTo) / 2.5);
      const profile: Pair[] = [[0.04, 2.8], [0.25 + swell * 0.9, 2.3], [0.3 + swell * 1.0, 0.4], [-0.6, -0.25]];
      rows.push(profile.map(([x, y]) => new THREE.Vector3(side * (w + x), floor + y, z)));
    }
    painted(sheet(rows));
    line(rows.map((r) => r[1]!.clone().setX(r[1]!.x + side * 0.05)));
  }

  // --- Door handles
  const [handleLow, handleHigh] = PARTS.handleHeight;
  for (const side of SIDES) {
    for (const [from, to] of PARTS.handles) {
      const rows = Array.from({ length: 5 }, (_, i) => {
        const z = mix(from, to, i / 4);
        return [handleLow, mix(handleLow, handleHigh, 0.5), handleHigh].map((y) => new THREE.Vector3(side * (sideX(z, y) + 0.3), y, z));
      });
      add(sheet(rows), mat.shade);
      line([...rows.map((r) => r[0]!), ...rows.map((r) => r[2]!).reverse()].map((p) => p.clone().setX(p.x + side * 0.05)), true);
    }
  }

  // --- Wheels, arch wells and flared arches
  for (const axleZ of [WHEELS.frontZ, WHEELS.rearZ]) {
    for (const side of SIDES) {
      // A point on the body side at an angle and distance from the axle, pushed out by `out`. Nothing hangs below the floor.
      const onSide = (angle: number, distance: number, out: number): THREE.Vector3 => {
        const z = axleZ + Math.cos(angle) * distance;
        const floor = lerpAt(SIDE_BOTTOM, z);
        const y = WHEELS.radius + Math.sin(angle) * distance;
        // Below the floor there is no body to sit on: fold the point up to the sill, flush with the side.
        return y < floor ? new THREE.Vector3(side * (sideX(z, floor) + 0.02), floor, z) : new THREE.Vector3(side * (sideX(z, y) + out), y, z);
      };
      const angles = Array.from({ length: 49 }, (_, i) => -0.3 + (i / 48) * (Math.PI + 0.6));
      const FLARE = 2.1;
      const REACH = 3.3;

      // The flare: stands proud at the arch edge and rolls back into the body above it, so its top catches the light tone
      const flare = angles.map((a) =>
        Array.from({ length: 9 }, (_, j) => {
          const t = j / 8;
          return onSide(a, WHEELS.archRadius + t * REACH, 0.06 + FLARE * (1 - t * t * (3 - 2 * t)));
        }),
      );
      painted(sheet(flare));
      line(flare.map((r) => r[0]!));
      // The lip turns in from the arch edge to the well
      painted(sheet(angles.map((a) => [onSide(a, WHEELS.archRadius - 0.25, 0.06), onSide(a, WHEELS.archRadius, 0.06 + FLARE)])));
      // The well: dark, behind the wheel
      add(sheet(angles.map((a) => [onSide(a, 0, 0.05), onSide(a, WHEELS.archRadius - 0.2, 0.05)])), mat.dark);

      // The wheel is built facing +z, then turned to face outwards. It stays upright and square to the body.
      const wheel = new THREE.Group();
      wheel.position.set(side * WHEELS.track, WHEELS.radius, axleZ);
      wheel.rotation.y = (side * Math.PI) / 2;
      car.add(wheel);
      if (axleZ === WHEELS.frontZ) steered.push([wheel, side]);
      const hub = new THREE.Group();
      wheel.add(hub);
      hubs.push([hub, side]);
      const R = WHEELS.radius;
      const rim = WHEELS.rimRadius;
      const face = WHEELS.width / 2;
      const turned = (g: THREE.BufferGeometry) => g.rotateX(Math.PI / 2);
      const place = (mesh: THREE.Object3D, z: number) => {
        mesh.position.z = z;
        hub.add(mesh);
        return mesh;
      };
      const lathe = (profile: readonly Pair[], segments = 64) =>
        turned(new THREE.LatheGeometry(profile.map(([r, a]) => new THREE.Vector2(r, a)), segments));
      // Tyre: bulging sidewalls rolling over rounded shoulders onto the tread
      hub.add(new THREE.Mesh(lathe(tyreProfile(), 72), mat.tyre));
      // The sidewall's moulded ring and the tread's grooves
      line(circle(mix(rim, R, 0.42), face + WHEELS.bulge + 0.04, 64), true, hub);
      for (const a of [-1.1, 0, 1.1]) line(circle(R + 0.02, a, 72), true, hub);
      // Behind everything: a dark back, then the brake disc
      place(new THREE.Mesh(new THREE.CircleGeometry(rim, 48), mat.dark), face - 2.05);
      place(new THREE.Mesh(new THREE.CircleGeometry(4.1, 48), mat.metal), face - 1.85);
      place(new THREE.Mesh(new THREE.CircleGeometry(1.9, 32), mat.dark), face - 1.83);
      // The rim: a deep barrel and a rounded lip standing proud of the tyre's bead
      hub.add(new THREE.Mesh(lathe(rimProfile()), mat.gold));
      // Ten spokes, set back from the lip by the dish and sloping down into a hub set deeper still
      const { dish } = WHEELS;
      const spokeShape = new THREE.Shape([new THREE.Vector2(-0.3, 0.9), new THREE.Vector2(0.3, 0.9), new THREE.Vector2(0.5, rim - 0.5), new THREE.Vector2(-0.5, rim - 0.5)]);
      const spokeGeometry = new THREE.ExtrudeGeometry(spokeShape, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 });
      const spokeFace = face - dish;
      for (let i = 0; i < 10; i++) {
        const spoke = place(new THREE.Mesh(spokeGeometry, [mat.gold, mat.goldDeep]), spokeFace - 0.68);
        spoke.rotation.z = (i / 10) * Math.PI * 2;
        // Lean each spoke so its outer end rises towards the lip: the concave face of the wheel
        spoke.rotateX(0.06);
      }
      const hubFace = spokeFace - 0.35;
      place(new THREE.Mesh(turned(new THREE.CylinderGeometry(1.4, 1.5, 0.8, 32)), [mat.goldDeep, mat.gold, mat.gold]), hubFace - 0.4);
      // Five wheel nuts round a centre cap
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
        const nut = place(new THREE.Mesh(turned(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 6)), mat.chrome), hubFace + 0.1);
        nut.position.x = Math.cos(a) * 0.95;
        nut.position.y = Math.sin(a) * 0.95;
      }
      place(new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), mat.chrome), hubFace);
      line(circle(rim + 0.1, face + 0.13), true, hub);
      line(circle(rim - 0.66, face - 0.2), true, hub);
      line(circle(4.1, face - 1.82, 40), true, hub);
    }
  }

  // --- Bonnet scoop: a low hump with a dark opening facing forward. It rides on the bonnet.
  const { scoop } = PARTS;
  const scoopSlice = (z: number, top: number, halfWidth: number): THREE.Vector3[] => {
    const base = lerpAt(SIDE_TOP, z) - 0.35;
    const y = Math.max(base + 0.02, top);
    return [[-halfWidth, base], [-halfWidth, mix(base, y, 0.55)], [-halfWidth + 0.7, y], [halfWidth - 0.7, y], [halfWidth, mix(base, y, 0.55)], [halfWidth, base]].map(
      ([x, h]) => new THREE.Vector3(x!, h!, z),
    );
  };
  const scoopRows = [
    scoopSlice(scoop.front, scoop.top - 0.45, scoop.halfWidth),
    scoopSlice(scoop.topFront, scoop.top, scoop.halfWidth),
    scoopSlice(scoop.topRear, scoop.top, scoop.halfWidth - 0.3),
    scoopSlice(scoop.rear, 0, scoop.halfWidth - 1.0),
  ];
  painted(sheet(scoopRows), false, true, bonnet);
  const mouth = scoopSlice(scoop.front + 0.02, scoop.top - 0.75, scoop.halfWidth - 0.35).map((p) => p.setY(p.y + 0.3));
  add(sheet([[mouth[0]!, mouth[1]!, mouth[2]!], [mouth[5]!, mouth[4]!, mouth[3]!]]), mat.dark, false, bonnet);
  line(scoopSlice(scoop.front + 0.03, scoop.top - 0.45, scoop.halfWidth), false, bonnet);

  // --- Rear wing: a low, curved plank with swept plates on its ends, on two short uprights at the boot edges
  const { wing } = PARTS;
  // The uprights stand on the edge of the boot, which is a little below its middle: start them inside the body.
  const deckAt = (z: number) => lerpAt(SIDE_TOP, z) - 1.4;
  /** The plank's profile, front to back: a thin airfoil whose trailing edge curls up. */
  const chord = Array.from({ length: 9 }, (_, i) => i / 8);
  const camber = (t: number) => wing.under + wing.thick / 2 + wing.camber * t * t;
  const thickness = (t: number) => 0.12 + wing.thick * Math.sin(Math.PI * Math.sqrt(t)) * (1 - 0.35 * t);
  const chordZ = (t: number) => mix(wing.front, wing.rear, t);
  const plank: Pair[] = [
    ...chord.map((t): Pair => [chordZ(t), camber(t) + thickness(t) / 2]),
    ...chord
      .slice(1, -1)
      .reverse()
      .map((t): Pair => [chordZ(t), camber(t) - thickness(t) / 2]),
  ];
  for (const side of SIDES) {
    const { strut, endPlate } = wing;
    // Where the strut meets the plank: the underside of the profile at that point, lifted by the bow
    const meet = (z: number) => camber((wing.front - z) / (wing.front - wing.rear)) - 0.2 + wingArch(wing.upright);
    const upright: Pair[] = [
      [strut.baseFront, deckAt(strut.baseFront)],
      [strut.topFront, meet(strut.topFront)],
      [strut.topRear, meet(strut.topRear)],
      [strut.baseRear, deckAt(strut.baseRear)],
    ];
    painted(prism(upright, side * wing.upright - strut.halfThick, side * wing.upright + strut.halfThick), true, true);
    // The end plate: its leading edge sweeps back as it rises, its trailing edge follows, its corners are cut
    const [low, high] = [wing.under - endPlate.below, wing.top + endPlate.above];
    const plate: Pair[] = [
      [wing.front + 0.8, low + 0.3],
      [wing.front + 0.5 - endPlate.sweep * 0.55, mix(low, high, 0.55)],
      [wing.front - endPlate.sweep, high],
      [wing.rear - endPlate.sweep * 0.3, high],
      [wing.rear - endPlate.sweep * 0.45, high - 0.6],
      [wing.rear + 0.3, low],
      [wing.front + 0.2, low],
    ];
    painted(prism(plate, side * wing.halfWidth, side * (wing.halfWidth + endPlate.thick)), true, true);
  }
  const spans = Array.from({ length: 17 }, (_, i) => mix(-wing.halfWidth, wing.halfWidth, i / 16));
  painted(bowed(plank, spans, wingArch), true, true);

  // --- Door mirrors: a housing held off the door on a stalk
  const { mirror } = PARTS;
  for (const side of SIDES) {
    painted(new THREE.SphereGeometry(1, 20, 12).scale(2.0, 1.55, 1.15).translate(side * mirror.x, mirror.y, mirror.z), true);
    const foot = sideX(mirror.z + 0.4, mirror.y - 1.3);
    const stalk: Pair[] = [[mirror.z + 1.0, mirror.y - 1.6], [mirror.z + 0.9, mirror.y - 0.7], [mirror.z - 0.5, mirror.y - 0.7], [mirror.z - 0.4, mirror.y - 1.6]];
    painted(prism(stalk, side * (foot - 0.3), side * (mirror.x - 0.8)), true, true);
    // The glass, on the face that looks back down the car
    const back = Array.from({ length: 20 }, (_, i) => {
      const a = (i / 20) * Math.PI * 2;
      const x = Math.cos(a) * 1.55;
      const y = Math.sin(a) * 1.15;
      return new THREE.Vector3(side * mirror.x + x, mirror.y + y, mirror.z - 1.15 * Math.sqrt(Math.max(0, 1 - (x / 2.0) ** 2 - (y / 1.55) ** 2)) - 0.06);
    });
    add(new THREE.BufferGeometry().setFromPoints(back.flatMap((p, i) => [new THREE.Vector3(side * mirror.x, mirror.y, mirror.z - 1.2), p, back[(i + 1) % back.length]!])), mat.dark);
  }

  // --- Shapes laid on the nose and tail. They are drawn in (angle, height) so they wrap round the corners.
  const wrap = (end: 1 | -1) => (degrees: number, y: number, out = 0.3): THREE.Vector3 => {
    const angle = degrees * DEGREE;
    const [x, , z] = wrapPoint(end, angle, y);
    return new THREE.Vector3(x + Math.sin(angle) * out, y, z + end * Math.cos(angle) * out);
  };
  type Place = ReturnType<typeof wrap>;
  const nose = wrap(1);
  const tail = wrap(-1);
  /**
   * A filled shape from its outline: rings shrinking towards its middle, so it follows the curve of the body.
   * `dome` lifts the middle that far above the edge (a lens), or with a negative value sinks it (a bowl).
   */
  const fill = (outline: Pair[], place: Place, material: THREE.Material, out = 0.3, edge = true, dome = 0): void => {
    const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length;
    const cy = outline.reduce((s, p) => s + p[1], 0) / outline.length;
    const loop = [...outline, outline[0]!];
    const rows = [1, 0.88, 0.76, 0.64, 0.52, 0.4, 0.28, 0.16, 0.02].map((k) =>
      loop.map(([d, y]) => place(mix(cx, d, k), mix(cy, y, k), out + dome * (1 - k * k))),
    );
    add(sheet(rows), material);
    if (edge) line(outline.map(([d, y]) => place(d, y, out + 0.05)), true);
  };
  /** A rounded shape. `power` 2 is an ellipse; higher is squarer. Radii are in car units. */
  const blob = (degrees: number, y: number, rx: number, ry: number, power = 2, n = 36): Pair[] =>
    Array.from({ length: n }, (_, i) => {
      const t = (i / n) * Math.PI * 2;
      const c = Math.cos(t);
      const s = Math.sin(t);
      const round = (v: number) => Math.sign(v) * Math.abs(v) ** (2 / power);
      return [degrees + (round(c) * rx) / PER_DEGREE, y + round(s) * ry] as const;
    });
  const shrink = (outline: Pair[], k: number): Pair[] => {
    const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length;
    const cy = outline.reduce((s, p) => s + p[1], 0) / outline.length;
    return outline.map(([d, y]) => [mix(cx, d, k), mix(cy, y, k)] as const);
  };
  const sweep = (place: Place, from: number, to: number, y: number, out = 0.36): THREE.Vector3[] =>
    Array.from({ length: 61 }, (_, i) => place(mix(from, to, i / 60), y, out));
  const trapezoid = (topHalf: number, top: number, bottomHalf: number, bottom: number): Pair[] => {
    const edge = (from: Pair, to: Pair) => Array.from({ length: 12 }, (_, i) => [mix(from[0], to[0], i / 12), mix(from[1], to[1], i / 12)] as const);
    const corners: Pair[] = [[-topHalf, top], [topHalf, top], [bottomHalf, bottom], [-bottomHalf, bottom]];
    return corners.flatMap((c, i) => edge(c, corners[(i + 1) % 4]!));
  };

  /** A shape traced in the front (end = 1) or rear (end = -1) view, laid on the car's left. Mirror it with `onSide`. */
  const traced = (end: 1 | -1, outline: readonly Pair[]): Pair[] => outline.map(([x, y]) => [frontAngle(end, x, y), y] as const);
  /** A rounded shape in the front or rear view, laid on the car's left: its middle, half its width and height. */
  const spot = (end: 1 | -1, x: number, y: number, halfWidth: number, halfHeight = halfWidth, power = 2): Pair[] => {
    // How many degrees round the corner one unit across the view is, here: the shape stays round as seen from ahead.
    const perUnit = (frontAngle(end, x + 0.3, y) - frontAngle(end, x - 0.3, y)) / 0.6;
    return blob(frontAngle(end, x, y), y, halfWidth * perUnit * PER_DEGREE, halfHeight, power);
  };
  const onSide = (outline: Pair[], side: 1 | -1): Pair[] => outline.map(([d, y]) => [side * d, y] as const);
  /** A flat band between an outline and the same outline shrunk by `k`. */
  const band = (outline: Pair[], k: number, place: Place, material: THREE.Material, out: number): void => {
    const inner = shrink(outline, k);
    add(sheet([[...outline, outline[0]!].map(([d, y]) => place(d, y, out)), [...inner, inner[0]!].map(([d, y]) => place(d, y, out))]), material);
  };

  // --- Nose: headlamps traced from the front view (a dark housing set in under a clear domed lens, a chrome bowl,
  // a main-beam reflector, a projector and an amber reflector), grille, lower intake, fog covers, chin and bumper line
  const { headlamp, grille, intake, fogCover } = PARTS;
  const headOutline = traced(1, HEADLAMP_OUTLINE);
  const [main, projector] = headlamp.lamps;
  const { reflector } = headlamp;
  const head = {
    main: spot(1, main[0], main[1], main[2]),
    mainSurround: spot(1, main[0], main[1], main[2] * 1.15),
    bulb: spot(1, main[0], main[1], main[2] * 0.28),
    projector: spot(1, projector[0], projector[1], projector[2]),
    projectorSurround: spot(1, projector[0], projector[1], projector[2] * 1.15),
    projectorLens: spot(1, projector[0], projector[1], projector[2] * headlamp.projector),
    reflector: spot(1, reflector.x, reflector.y, reflector.halfWidth, reflector.halfHeight, 3),
  };
  for (const side of SIDES) {
    const lens = onSide(headOutline, side);
    const at = (shape: Pair[]) => onSide(shape, side);
    // The housing: a dark rim set slightly in under the lens's edge, and inside it a chrome bowl
    band(lens, 0.88, nose, mat.dark, 0.2);
    fill(shrink(lens, 0.88), nose, mat.chrome, 0.2, false, -0.14);
    // The main beam: a dark surround, a deep chrome reflector, and the bulb's cap in its middle
    fill(at(head.mainSurround), nose, mat.dark, 0.24, false);
    fill(at(head.main), nose, mat.chrome, 0.3, false, -0.25);
    fill(at(head.bulb), nose, mat.metal, 0.1, false, 0.28);
    // The projector: a shallow chrome ring round a small domed lens of dark glass
    fill(at(head.projectorSurround), nose, mat.dark, 0.24, false);
    fill(at(head.projector), nose, mat.chrome, 0.3, false, -0.12);
    fill(at(head.projectorLens), nose, mat.projector, 0.22, true, 0.4);
    fill(at(head.reflector), nose, mat.gold, 0.28);
    // The clear lens over it all, on the traced outline, domed so the studio's lights slide across it
    fill(lens, nose, mat.lens, 0.62, true, 0.4);

    // Fog lamp cover: a round cover set in a dark recess at the corner of the bumper
    fill(blob(side * fogCover.angle, fogCover.y, fogCover.radius, fogCover.radius), nose, mat.dark);
    fill(blob(side * fogCover.angle, fogCover.y, fogCover.radius * 0.7, fogCover.radius * 0.7), nose, mat.paint, 0.38);
  }
  fill(trapezoid(grille.topHalf, grille.top, grille.bottomHalf, grille.bottom), nose, mat.dark);
  const grilleMid = (grille.top + grille.bottom) / 2;
  fill(trapezoid(grille.topHalf - 2.2, grilleMid + 0.22, grille.topHalf - 2.8, grilleMid - 0.22), nose, mat.paint, 0.4, false);
  fill(trapezoid(intake.topHalf, intake.top, intake.bottomHalf, intake.bottom), nose, mat.dark);
  const intakeMid = (intake.top + intake.bottom) / 2;
  fill(trapezoid(intake.topHalf - 2.5, intakeMid + 0.16, intake.topHalf - 3, intakeMid - 0.16), nose, mat.shade, 0.4, false);
  // The seam between the bumper and the wings, running back to each front arch
  line(sweep(nose, -69, 69, 12.3));
  // Chin: a lip round the bottom of the bumper
  const chin = Array.from({ length: 47 }, (_, i) => {
    const d = mix(-69, 69, i / 46);
    return [nose(d, 7.0, 0.04), nose(d, 6.7, 1.0), nose(d, 5.6, 1.1), nose(d, 5.3, 0)];
  });
  painted(sheet(chin));
  line(chin.map((r) => r[1]!.clone().setY(r[1]!.y + 0.05)));

  // --- Tail: red lamps that wrap the corners, bumper line, number plate recess and an exhaust tip
  const { tailLamp, plate, tailpipe } = PARTS;
  const tailOutline = traced(-1, TAIL_LAMP_OUTLINE);
  /** The inner edge of the tail lamps, in degrees round the tail. */
  const tailInner = Math.min(...tailOutline.map(([d]) => d));
  const { strip } = tailLamp;
  const rear = {
    strip: spot(-1, strip.x, strip.y, strip.halfWidth, strip.halfHeight, 4),
    lamps: tailLamp.lamps.map(([x, y, r]) => ({ bowl: spot(-1, x, y, r * 1.25), glow: spot(-1, x, y, r), cap: spot(-1, x, y, r * 0.35) })),
  };
  for (const side of SIDES) {
    const lens = onSide(tailOutline, side);
    const at = (shape: Pair[]) => onSide(shape, side);
    // The housing: a dark rim set in under the lens's edge, and a deep red inside it
    band(lens, 0.9, tail, mat.dark, 0.2);
    fill(shrink(lens, 0.9), tail, mat.tail, 0.2, false);
    // The clear strip across the top, onto a chrome back
    fill(at(rear.strip), tail, mat.chrome, 0.32, true, -0.1);
    // The round lamp: a chrome bowl, the lit red ring, and a chrome cap in its middle
    for (const lamp of rear.lamps) {
      fill(at(lamp.bowl), tail, mat.chrome, 0.32, false, -0.2);
      fill(at(lamp.glow), tail, mat.tailGlow, 0.26, true, 0.08);
      fill(at(lamp.cap), tail, mat.chrome, 0.3, false, 0.12);
    }
    // The red lens over it all, on the traced outline, domed a little
    fill(lens, tail, mat.tailLens, 0.6, true, 0.3);
    // The boot lid's edge, down the inside of each lamp
    line(Array.from({ length: 12 }, (_, i) => tail(side * (tailInner - 2), mix(21.6, 15.0, i / 11), 0.36)));
  }
  line(sweep(tail, -(tailInner - 2), tailInner - 2, 15.0)); // bottom of the boot lid
  line(sweep(tail, -68, 68, 14.3)); // the bumper, running round to each rear arch
  fill(trapezoid(plate.half, plate.top, plate.half - 1, plate.bottom), tail, mat.shade);
  line(shrink(trapezoid(plate.half, plate.top, plate.half - 1, plate.bottom), 0.82).map(([d, y]) => tail(d, y, 0.36)), true);
  // Number plates: flat, standing just proud of the bumper at the front and of the recess at the back
  for (const [end, material, size] of [[1, plateMat.front, PLATES.front], [-1, plateMat.rear, PLATES.rear]] as const) {
    const at = (end > 0 ? nose : tail)(0, size.y, 0.55);
    const face = new THREE.PlaneGeometry(size.width, size.height);
    if (end < 0) face.rotateY(Math.PI);
    const plate = add(face.translate(0, size.y, at.z), material);
    plate.add(new THREE.LineSegments(new THREE.EdgesGeometry(face), mat.line));
  }
  // Exhaust tip, on the car's left
  const pipe = new THREE.CylinderGeometry(tailpipe.radius, tailpipe.radius, 3, 28).rotateX(Math.PI / 2).translate(tailpipe.x, tailpipe.y, -47.6);
  add(pipe, [mat.metal, mat.dark, mat.dark], true);

  /** Every colour on the car, with the colour it drains to on the X-ray sheet and how far it goes. */
  let paints: { to: THREE.Color; from: THREE.Color; drained: THREE.Color; much: number }[] = [];
  let xray = 0;
  const paint = (): void => {
    for (const p of paints) p.to.copy(p.from).lerp(p.drained, xray * p.much);
  };
  const applyTheme = (token: (name: string) => THREE.Color): void => {
    const paper = token('--paper');
    const ink = token('--ink');
    const fill = (to: THREE.Color, name: string, much = 1, scale = 1) => ({ to, from: token(name).multiplyScalar(scale), drained: paper, much });
    const edge = (to: THREE.Color) => ({ to, from: token('--body-line'), drained: ink, much: 1 });
    paints = [
      fill(mat.body.color, '--body-blue'),
      fill(mat.paint.color, '--body-blue'),
      fill(mat.shade.color, '--body-shade'),
      fill(mat.dark.color, '--body-dark'),
      fill(mat.glass.uniforms.tint!.value, '--glass'),
      fill(mat.glass.uniforms.shine!.value, '--glass-shine'),
      // The tyres keep a trace of their tone, so the outline still stands on something.
      fill(mat.tyre.color, '--tyre', 0.82),
      fill(mat.gold.color, '--wheel-gold'),
      fill(mat.goldDeep.color, '--wheel-gold', 1, 0.55),
      fill(mat.metal.color, '--metal'),
      fill(mat.chrome.color, '--metal', 1, 1.25),
      fill(mat.lens.color, '--glass-shine'),
      fill(mat.projector.color, '--glass'),
      fill(mat.tail.color, '--tail-red', 1, 0.55),
      fill(mat.tailLens.color, '--tail-red'),
      fill(mat.tailGlow.color, '--tail-glow'),
      edge(mat.line.color),
      edge(mat.hull.color),
    ];
    mat.shadow.uniforms.color!.value = token('--ground-shade');
    const css = (name: string) => `#${token(name).getHexString()}`;
    plates.front.paint(css('--plate-white'), css('--plate-ink'));
    plates.rear.paint(css('--plate-yellow'), css('--plate-ink'));
    paint();
  };
  let shown = 1;
  /** The plates go with the car when it fades, and with its colour when that drains. */
  const showPlates = (): void => {
    const opacity = shown * (1 - xray);
    for (const material of Object.values(plateMat)) {
      material.transparent = opacity < 1;
      material.opacity = opacity;
      material.visible = opacity > 0.001;
    }
  };
  const setXray = (amount: number): void => {
    if (amount === xray) return;
    xray = amount;
    paint();
    showPlates();
  };

  const setOpacity = (opacity: number): void => {
    if (opacity === shown) return;
    shown = opacity;
    showPlates();
    car.visible = opacity > 0.001;
    for (const material of Object.values(mat)) {
      // Each part still hides what is behind it, so the fading car does not show its own insides.
      const own = (material.userData.opacity as number | undefined) ?? 1;
      material.transparent = opacity < 1 || own < 1 || material === mat.shadow;
      if (material instanceof THREE.ShaderMaterial) material.uniforms.opacity!.value = opacity;
      else material.opacity = opacity * own;
    }
  };
  const setAir = (below: number): void => {
    const air = Math.max(0, below);
    shadow.position.y = -air;
    mat.shadow.uniforms.spread!.value = Math.min(1, air / 45);
  };
  const setRoll = (angle: number): void => {
    for (const [hub, side] of hubs) hub.rotation.z = side * angle;
  };

  const setSteer = (angle: number): void => {
    for (const [wheel, side] of steered) wheel.rotation.y = (side * Math.PI) / 2 - angle;
  };

  return { group: car, setBonnet, setOpacity, setXray, setRoll, setAir, setSteer, applyTheme };
}
