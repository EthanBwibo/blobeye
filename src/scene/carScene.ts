import * as THREE from 'three';
import {
  BELT,
  CABIN,
  PARTS,
  PLAN,
  RING,
  RING_SIZE,
  SIDE_BOTTOM,
  SIDE_TOP,
  WHEELS,
  endZ,
  lerpAt,
  section,
  sideX,
  surfacePoint,
  type Pair,
  type Point,
} from '../car/model';

/** The car's materials. The scene owns them so they follow the theme and can fade for the X-ray. */
export interface CarMaterials {
  /** Body colour, shaded in a couple of flat tones so the curves read. */
  body: THREE.Material;
  /** Glass, tyres, arch wells and openings. */
  dark: THREE.Material;
  /** Edge lines drawn on top of the body. */
  line: THREE.LineBasicMaterial;
  /** The same line colour as a surface, drawn inside-out and slightly enlarged, for the outline. */
  hull: THREE.Material;
  /** Wheels. */
  gold: THREE.Material;
  /** Headlamp lenses. */
  lens: THREE.Material;
  /** Tail lamps. */
  lamp: THREE.Material;
}

const SIDES = [1, -1] as const;
const OUTLINE = 0.22;
const vec = (p: Point) => new THREE.Vector3(p[0], p[1], p[2]);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

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
  for (const z of [CABIN.cowl, CABIN.roofFront, CABIN.roofRear, CABIN.deck]) all.add(z);
  const sorted = [...all].sort((a, b) => b - a);
  return sorted.filter((z, i) => i === 0 || sorted[i - 1]! - z > 0.05);
}

/** The main shell: slices of the traced profile joined into one closed skin. */
function shellGeometry(): THREE.BufferGeometry {
  const ringPoints = RING_SIZE * 2 - 2;
  const zs = stations();
  const points: THREE.Vector3[] = [];
  for (const z of zs) {
    const half = section(z);
    for (const [x, y] of half) points.push(new THREE.Vector3(x, y, z));
    for (let i = RING_SIZE - 2; i >= 1; i--) points.push(new THREE.Vector3(-half[i]![0], half[i]![1], z));
  }
  const index: number[] = [];
  for (let i = 0; i < zs.length - 1; i++) {
    for (let j = 0; j < ringPoints; j++) {
      const a = i * ringPoints + j;
      const b = i * ringPoints + ((j + 1) % ringPoints);
      index.push(a, b + ringPoints, b, a, a + ringPoints, b + ringPoints);
    }
  }
  for (const [station, flip] of [[0, false], [zs.length - 1, true]] as const) {
    const ring = points.slice(station * ringPoints, (station + 1) * ringPoints);
    const centre = ring.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(ringPoints);
    const c = points.push(centre) - 1;
    for (let j = 0; j < ringPoints; j++) {
      const a = station * ringPoints + j;
      const b = station * ringPoints + ((j + 1) % ringPoints);
      if (flip) index.push(c, b, a);
      else index.push(c, a, b);
    }
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
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

/** Build the car. It is in car units (100 long, ground at y = 0); the caller scales and places it. */
export function createCar(mat: CarMaterials): THREE.Group {
  const car = new THREE.Group();
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, edges = false): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    if (edges) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), mat.line));
    car.add(mesh);
    return mesh;
  };
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
  ): void => {
    const rows: THREE.Vector3[][] = [];
    const across = 5;
    const steps = Math.max(2, Math.ceil(Math.abs(zFrom(0.5) - zTo(0.5))));
    for (let i = 0; i <= steps; i++) {
      rows.push(
        Array.from({ length: across + 1 }, (_, j) => {
          const t = j / across;
          return skin(mix(zFrom(t), zTo(t), i / steps), mix(low, high, t), side, 0.12);
        }),
      );
    }
    add(sheet(rows), material);
    line([...rows.map((r) => r[0]!), ...rows[steps]!, ...rows.map((r) => r[across]!).reverse(), ...rows[0]!.slice().reverse()].map((p) => lift(p.clone(), 0.04)), true);
  };

  // --- Main shell, lofted from the traced profile, with its outline
  const shell = shellGeometry();
  add(shell, mat.body);
  add(outlineGeometry(shell), mat.hull);

  // --- Glass
  const { glass } = PARTS;
  const sideLow = RING.shoulder + 0.4;
  const sideHigh = RING.topEdge - 0.3;
  for (const side of SIDES) {
    const front = (t: number) => mix(glass.frontLow, glass.frontTop, t);
    const rear = (t: number) => mix(glass.rearLow, glass.rearTop, t);
    patch(front, () => glass.pillar + 0.55, sideLow, sideHigh, side, mat.dark);
    patch(() => glass.pillar - 0.55, rear, sideLow, sideHigh, side, mat.dark);
    patch(() => CABIN.cowl - 0.8, () => CABIN.roofFront + 0.6, RING.topEdge + 0.55, RING.topCentre, side, mat.dark);
    patch(() => CABIN.roofRear - 0.7, () => CABIN.deck + 0.8, RING.topEdge + 0.55, RING.topCentre, side, mat.dark);
  }

  // --- Edge lines on the body
  for (const side of SIDES) {
    line(along(46, -46.5, RING.shoulder, side));
    line(along(CABIN.cowl, CABIN.deck, RING.topEdge, side));
    line(along(45.2, CABIN.cowl, RING.shoulder + 1.6, side)); // bonnet edge
    line(along(CABIN.deck - 0.4, -46.6, RING.shoulder + 1.6, side)); // boot edge
    for (const z of PARTS.doors) line(around(z, RING.sill + 1, RING.shoulder, side));
  }
  across(45.2, RING.shoulder + 1.6);
  across(CABIN.cowl, RING.shoulder);
  across(CABIN.deck, RING.shoulder);
  across(-46.6, RING.shoulder + 1.6);

  // --- Side skirts: a lip along the sill between the arches
  const skirtFrom = WHEELS.frontZ - WHEELS.archRadius - 0.3;
  const skirtTo = WHEELS.rearZ + WHEELS.archRadius + 0.3;
  for (const side of SIDES) {
    const rows: THREE.Vector3[][] = [];
    for (let i = 0; i <= 40; i++) {
      const z = mix(skirtFrom, skirtTo, i / 40);
      const floor = lerpAt(SIDE_BOTTOM, z);
      const w = sideX(z, floor + 2.2);
      rows.push(
        [[w + 0.05, floor + 2.2], [w + 0.6, floor + 1.7], [w + 0.7, floor + 0.2], [w - 0.9, floor - 0.3]].map(
          ([x, y]) => new THREE.Vector3(side * x!, y!, z),
        ),
      );
    }
    if (side < 0) rows.reverse();
    add(sheet(rows), mat.body);
    line(rows.map((r) => r[1]!));
    line(rows.map((r) => r[2]!));
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
      const ordered = side > 0 ? angles : angles.slice().reverse();
      const FLARE = 1.3;
      const REACH = 4.4;

      // The flare: stands proud at the arch edge and blends back into the body further out
      const flare = ordered.map((a) =>
        Array.from({ length: 7 }, (_, j) => {
          const t = j / 6;
          return onSide(a, WHEELS.archRadius + t * REACH, 0.06 + FLARE * (1 - t * t * (3 - 2 * t)));
        }),
      );
      add(sheet(flare), mat.body);
      line(flare.map((r) => r[0]!));
      // The lip turns in from the arch edge to the well
      add(sheet(ordered.map((a) => [onSide(a, WHEELS.archRadius - 0.25, 0.06), onSide(a, WHEELS.archRadius, 0.06 + FLARE)])), mat.body);
      // The well: dark, behind the wheel
      add(sheet(ordered.map((a) => [onSide(a, 0, 0.05), onSide(a, WHEELS.archRadius - 0.2, 0.05)])), mat.dark);

      const wheel = new THREE.Group();
      wheel.position.set(side * WHEELS.track, WHEELS.radius, axleZ);
      car.add(wheel);
      wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(WHEELS.radius, WHEELS.radius, WHEELS.width, 56).rotateZ(Math.PI / 2), mat.dark));

      // The face of the wheel: a gold rim, ten spokes and a hub, built flat then turned to face outwards
      const face = new THREE.Group();
      face.position.x = side * (WHEELS.width / 2 + 0.06);
      face.rotation.y = (side * Math.PI) / 2;
      wheel.add(face);
      face.add(new THREE.Mesh(new THREE.RingGeometry(WHEELS.rimRadius - 0.85, WHEELS.rimRadius, 56), mat.gold));
      face.add(new THREE.Mesh(new THREE.CircleGeometry(1.25, 24), mat.gold));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const spoke = new THREE.Mesh(new THREE.PlaneGeometry(0.72, WHEELS.rimRadius - 1.6), mat.gold);
        spoke.position.set(Math.cos(a) * (WHEELS.rimRadius / 2 + 0.1), Math.sin(a) * (WHEELS.rimRadius / 2 + 0.1), 0);
        spoke.rotation.z = a - Math.PI / 2;
        face.add(spoke);
      }
      for (const r of [0.55, WHEELS.rimRadius, WHEELS.radius - 0.05]) {
        line(Array.from({ length: 56 }, (_, i) => new THREE.Vector3(Math.cos((i / 56) * Math.PI * 2) * r, Math.sin((i / 56) * Math.PI * 2) * r, 0.03)), true, face);
      }
    }
  }

  // --- Bonnet scoop: a low hump with a dark opening facing forward
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
  add(sheet(scoopRows), mat.body, true);
  const mouth = scoopSlice(scoop.front + 0.02, scoop.top - 0.75, scoop.halfWidth - 0.35).map((p) => p.setY(p.y + 0.3));
  add(sheet([[mouth[0]!, mouth[1]!, mouth[2]!], [mouth[5]!, mouth[4]!, mouth[3]!]]), mat.dark);
  line(scoopSlice(scoop.front + 0.03, scoop.top - 0.45, scoop.halfWidth));

  // --- Rear wing: a plank across the boot on two uprights
  const { wing } = PARTS;
  const deckAt = (z: number) => lerpAt(SIDE_TOP, z) - 0.5;
  for (const side of SIDES) {
    const upright: Pair[] = [
      [wing.baseFront, deckAt(wing.baseFront)],
      [wing.topFront, wing.under + 0.2],
      [wing.topRear, wing.under + 0.2],
      [wing.baseRear, deckAt(wing.baseRear)],
    ];
    add(prism(upright, side * wing.upright - 0.45, side * wing.upright + 0.45), mat.body, true);
  }
  const plank: Pair[] = [
    [wing.topFront + 0.4, wing.under + 0.35],
    [wing.topFront - 1.2, wing.top - 0.1],
    [wing.topFront - 3.4, wing.top],
    [wing.topRear - 0.4, wing.top - 0.15],
    [wing.topRear - 0.5, wing.under + 0.3],
    [wing.topFront - 3.4, wing.under],
    [wing.topFront - 1.2, wing.under],
  ];
  add(prism(plank, -wing.halfWidth, wing.halfWidth), mat.body, true);

  // --- Door mirrors
  for (const side of SIDES) {
    const mirror = add(new THREE.SphereGeometry(1, 16, 10), mat.body);
    mirror.scale.set(2.3, 1.45, 0.95);
    mirror.position.set(side * 19.7, 22.6, 10.7);
  }

  // --- Nose: teardrop headlamps, grille, bumper intake and fog lamp covers, laid on the curved nose
  const front = (x: number, y: number, out = 0.3) => new THREE.Vector3(x, y, endZ(x, y, 1) + out);
  /** A filled shape on the nose or tail, from an outline: rings shrinking towards its middle, so it follows the curve. */
  const fill = (outline: Pair[], place: (x: number, y: number) => THREE.Vector3, material: THREE.Material, flip: boolean): void => {
    const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length;
    const cy = outline.reduce((s, p) => s + p[1], 0) / outline.length;
    const loop = [...outline, outline[0]!];
    const rows = [1, 0.85, 0.7, 0.55, 0.4, 0.25, 0.02].map((k) => loop.map(([x, y]) => place(mix(cx, x, k), mix(cy, y, k))));
    add(sheet(flip ? rows.map((r) => r.slice().reverse()) : rows), material);
    line(outline.map(([x, y]) => place(x, y).add(new THREE.Vector3(0, 0, flipSign(place) * 0.03))), true);
  };
  const flipSign = (place: (x: number, y: number) => THREE.Vector3) => Math.sign(place(0, 12).z);
  const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 28): Pair[] =>
    Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * rx, cy + Math.sin((i / n) * Math.PI * 2) * ry] as const);

  const { headlamp, grille, intake, fogCover } = PARTS;
  for (const side of SIDES) {
    // Teardrop: tall and round at the outer end, tapering towards the grille
    const cx = (headlamp.outer + headlamp.inner) / 2;
    const a = (headlamp.outer - headlamp.inner) / 2;
    const cy = headlamp.bottom + 1.15;
    const tall = headlamp.top - cy;
    const short = headlamp.innerTop - cy;
    const teardrop: Pair[] = Array.from({ length: 40 }, (_, i) => {
      const t = (i / 40) * Math.PI * 2;
      const up = Math.sin(t) >= 0;
      const height = up ? mix(short, tall, (Math.cos(t) + 1) / 2) * 1.08 : cy - headlamp.bottom;
      return [side * (cx + Math.cos(t) * a), cy + Math.sin(t) * height] as const;
    });
    fill(teardrop, front, mat.lens, side < 0);
    const [lx, ly, lr] = headlamp.lamp;
    line(ellipse(side * lx, ly, lr, lr).map(([x, y]) => front(x, y, 0.38)), true);
    line(ellipse(side * (headlamp.outer - 2.3), ly + 0.45, 1.35, 1.35).map(([x, y]) => front(x, y, 0.38)), true);
    fill(ellipse(side * fogCover.x, fogCover.y, fogCover.halfWidth, fogCover.halfHeight), front, mat.dark, side < 0);
  }
  fill(
    [[-grille.topHalfWidth, grille.top], [grille.topHalfWidth, grille.top], [grille.bottomHalfWidth, grille.bottom], [-grille.bottomHalfWidth, grille.bottom]],
    front,
    mat.dark,
    true,
  );
  fill(
    [[-intake.halfWidth, intake.top], [intake.halfWidth, intake.top], [intake.halfWidth - 0.6, intake.bottom], [-intake.halfWidth + 0.6, intake.bottom]],
    front,
    mat.dark,
    true,
  );
  line(Array.from({ length: 33 }, (_, i) => front(-16 + i, 12.2)));

  // --- Tail: lamps that wrap the corners, the boot's lower edge and a tailpipe on the car's left
  const rear = (x: number, y: number, out = 0.3) => new THREE.Vector3(x, y, endZ(x, y, -1) - out);
  const { tailLamp, tailpipe } = PARTS;
  for (const side of SIDES) {
    const lamp: Pair[] = [
      [side * tailLamp.inner, tailLamp.innerTop],
      [side * (tailLamp.outer - 1.5), tailLamp.top],
      [side * tailLamp.outer, tailLamp.top - 0.9],
      [side * tailLamp.outer, tailLamp.bottom + 0.8],
      [side * (tailLamp.outer - 1), tailLamp.bottom],
      [side * (tailLamp.inner + 0.6), tailLamp.bottom],
    ];
    fill(lamp, rear, mat.lamp, side > 0);
    line(ellipse(side * (tailLamp.inner + 2.6), (tailLamp.innerTop + tailLamp.bottom) / 2, 1.3, 1.3).map(([x, y]) => rear(x, y, 0.38)), true);
  }
  line(Array.from({ length: 19 }, (_, i) => rear(-9 + i, 18.3)));
  line(Array.from({ length: 31 }, (_, i) => rear(-15 + i, 14.8)));
  fill(ellipse(tailpipe.x, tailpipe.y + 1.2, tailpipe.radius, tailpipe.radius, 20), rear, mat.dark, true);

  return car;
}
