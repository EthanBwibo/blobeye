import * as THREE from 'three';
import {
  CRANK_RADIUS,
  CYLINDERS,
  PULSE_DELAY,
  ROD_LENGTH,
  arrivalAngle,
  degreesSince,
  pistonPose,
  type EngineState,
  type HeaderMode,
} from '../engine/model';
import { CAMERA_KEYS, NARROW_WIDTH, cameraDistanceScale, narrowCentre, smoothstep } from './camera';

export interface EngineScene {
  /** Draw one frame. `sheet` is the scroll position measured in sheets (0 to 4). */
  render(dt: number, sheet: number): void;
  setHeaders(mode: HeaderMode): void;
  /** `clear` is the share of a narrow screen left above the notes; omit it to keep the last value. */
  resize(clear?: number | null): void;
  applyTheme(): void;
  /** Which cylinders are on their power stroke right now, for the HTML labels. */
  readonly firing: boolean[];
}

export interface SceneLabels {
  cylinders: HTMLElement[];
  front: HTMLElement;
}

const HEAD_X = 1.95;

export function createEngineScene(
  canvas: HTMLCanvasElement,
  state: EngineState,
  labels: SceneLabels,
  reducedMotion: boolean,
): EngineScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);

  // Blueprint look: paper-coloured faces, ink edges. No lighting needed.
  const offset = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
  const mat = {
    fill: new THREE.MeshBasicMaterial(offset),
    ghost: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide }),
    line: new THREE.LineBasicMaterial(),
    soft: new THREE.LineBasicMaterial({ transparent: true, opacity: 0.45 }),
    hull: new THREE.MeshBasicMaterial({ side: THREE.BackSide }),
    gold: new THREE.MeshBasicMaterial(offset),
    fire: new THREE.MeshBasicMaterial(),
  };

  const engine = new THREE.Group();
  scene.add(engine);

  function part(
    geometry: THREE.BufferGeometry,
    fill: THREE.Material,
    line: THREE.LineBasicMaterial | null,
    parent: THREE.Object3D = engine,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, fill);
    if (line) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), line));
    parent.add(mesh);
    return mesh;
  }
  const alongX = (r: number, len: number, seg = 32, open = false) =>
    new THREE.CylinderGeometry(r, r, len, seg, 1, open).rotateZ(Math.PI / 2);
  const alongZ = (r: number, len: number, seg = 24) => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2);

  // Crankcase, barrels, pistons, rods
  part(new THREE.BoxGeometry(1.0, 1.5, 2.3), mat.ghost, mat.soft);
  const pistons: THREE.Mesh[] = [];
  const rods: THREE.Mesh[] = [];
  const flashes: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[] = [];
  for (const c of CYLINDERS) {
    part(alongX(0.46, 1.16, 40, true), mat.ghost, mat.line).position.set(c.side * 1.2, 0, c.z);

    const piston = part(alongX(0.42, 0.42), mat.fill, mat.line);
    piston.position.z = c.z;
    const ring = new THREE.LineSegments(new THREE.EdgesGeometry(alongX(0.425, 0.02, 32, true)), mat.line);
    ring.position.x = c.side * 0.12;
    piston.add(ring);
    pistons.push(piston);

    const rod = part(new THREE.BoxGeometry(ROD_LENGTH, 0.11, 0.1), mat.fill, mat.line);
    rod.position.z = c.z;
    rods.push(rod);

    const flash = new THREE.Mesh(
      new THREE.CircleGeometry(0.44, 32),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    flash.rotation.y = Math.PI / 2;
    flash.position.set(c.side * 1.76, 0, c.z);
    engine.add(flash);
    flashes.push(flash);
  }

  // Cylinder heads and rocker covers
  for (const side of [-1, 1]) {
    part(new THREE.BoxGeometry(0.44, 1.25, 2.2), mat.ghost, mat.line).position.set(side * 2.0, 0, 0);
    part(new THREE.BoxGeometry(0.2, 1.02, 2.0), mat.fill, mat.line).position.set(side * 2.32, 0, 0);
    for (let i = 0; i < 4; i++) {
      part(alongX(0.05, 0.06, 10), mat.fill, mat.line).position.set(
        side * 2.44,
        i < 2 ? 0.38 : -0.38,
        i % 2 ? 0.8 : -0.8,
      );
    }
  }

  // Crankshaft
  const crank = new THREE.Group();
  engine.add(crank);
  part(alongZ(0.12, 2.9), mat.fill, mat.line, crank);
  for (const z of [0.92, 0.6, 0.28, -0.28, -0.6, -0.92]) {
    part(alongZ(0.4, 0.05, 28), mat.fill, mat.line, crank).position.z = z;
  }
  for (const c of CYLINDERS) {
    part(alongZ(0.09, 0.26, 16), mat.gold, mat.line, crank).position.set(
      CRANK_RADIUS * Math.cos(c.pinOffset),
      CRANK_RADIUS * Math.sin(c.pinOffset),
      c.z,
    );
  }
  part(alongZ(0.34, 0.14, 28), mat.fill, mat.line, crank).position.z = 1.42;
  part(new THREE.BoxGeometry(0.08, 0.2, 0.16), mat.gold, mat.line, crank).position.set(0, 0.26, 1.42);

  // Exhaust headers: two layouts, one visible at a time.
  // Routing is simplified. In "unequal" the left bank crosses under the engine
  // to a collector on the right, so its pulses travel further.
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const curve = (points: THREE.Vector3[]) => new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.35);
  const collectorAt: Record<HeaderMode, THREE.Vector3> = { unequal: v(-1.5, -1.35, -1.0), equal: v(0, -1.62, -1.0) };
  const pipes: Record<HeaderMode, THREE.Group> = { unequal: new THREE.Group(), equal: new THREE.Group() };
  const runs: Record<HeaderMode, THREE.CatmullRomCurve3[]> = { unequal: [], equal: [] };
  engine.add(pipes.unequal, pipes.equal);

  function tube(path: THREE.Curve<THREE.Vector3>, group: THREE.Group, radius = 0.09): void {
    group.add(new THREE.Mesh(new THREE.TubeGeometry(path, 56, radius, 10), mat.fill));
    group.add(new THREE.Mesh(new THREE.TubeGeometry(path, 56, radius + 0.018, 10), mat.hull));
  }
  for (const c of CYLINDERS) {
    const port = v(c.side * HEAD_X, -0.62, c.z);
    const cu = collectorAt.unequal;
    const unequal =
      c.side < 0
        ? curve([port, v(-1.95, -1.1, c.z), v(-1.8, -1.32, (c.z - 1.0) / 2), cu])
        : curve([
            port,
            v(1.95, -1.15, c.z),
            v(1.7, -1.42, (c.z - 1.1) / 2),
            v(1.15, -1.5, -1.2),
            v(0, -1.58, -1.45),
            v(-1.0, -1.48, -1.3),
            cu,
          ]);
    const equal = curve([
      port,
      v(c.side * 1.95, -1.15, c.z),
      v(c.side * 1.2, -1.5, c.z * 0.5 - 0.3),
      v(c.side * 0.45, -1.62, -0.75),
      collectorAt.equal,
    ]);
    runs.unequal.push(unequal);
    runs.equal.push(equal);
    tube(unequal, pipes.unequal);
    tube(equal, pipes.equal);
  }
  tube(curve([collectorAt.unequal, v(-1.5, -1.3, -1.6), v(-1.45, -1.25, -2.7)]), pipes.unequal, 0.13);
  tube(curve([collectorAt.equal, v(0, -1.58, -1.7), v(0, -1.5, -2.7)]), pipes.equal, 0.13);

  const collector = part(new THREE.SphereGeometry(0.2, 20, 14), mat.gold, null);
  const pulses = CYLINDERS.map(() => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), mat.fire);
    m.visible = false;
    engine.add(m);
    return m;
  });

  function setHeaders(mode: HeaderMode): void {
    pipes.unequal.visible = mode === 'unequal';
    pipes.equal.visible = mode === 'equal';
    collector.position.copy(collectorAt[mode]);
  }

  function applyTheme(): void {
    const css = getComputedStyle(document.documentElement);
    const token = (name: string) => new THREE.Color(css.getPropertyValue(name).trim());
    const ink = token('--ink');
    mat.fill.color = token('--paper');
    mat.ghost.color = ink;
    mat.line.color = ink;
    mat.soft.color = ink;
    mat.hull.color = ink;
    mat.gold.color = token('--gold');
    mat.fire.color = token('--fire');
    for (const f of flashes) f.material.color = token('--fire');
  }

  // Camera
  let width = 1;
  let height = 1;
  let narrow = false;
  let clearAbove = 0.56;
  const pointer = { x: 0, y: 0 };
  const first = CAMERA_KEYS[0]!;
  const cam = { position: v(...first.position), target: v(...first.target) };
  const want = { position: v(0, 0, 0), target: v(0, 0, 0) };
  const scratch = v(0, 0, 0);

  function resize(clear?: number | null): void {
    if (clear != null) clearAbove = clear;
    width = window.innerWidth;
    height = window.innerHeight;
    narrow = width <= NARROW_WIDTH;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Shift the picture off-centre so the engine sits clear of the notes.
    if (narrow) camera.setViewOffset(width, height, 0, height * (0.5 - narrowCentre(clearAbove)), width, height);
    else camera.setViewOffset(width, height, -width * 0.2, height * 0.04, width, height);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX / width - 0.5;
    pointer.y = e.clientY / height - 0.5;
  });

  function place(el: HTMLElement, x: number, y: number, z: number): void {
    scratch.set(x, y, z).project(camera);
    const px = (scratch.x * 0.5 + 0.5) * width;
    const py = (-scratch.y * 0.5 + 0.5) * height;
    el.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px) translate(-50%,-50%)`;
    el.style.visibility = scratch.z < 1 ? 'visible' : 'hidden';
  }

  const firing = [false, false, false, false];
  let sway = 0;

  function render(dt: number, sheet: number): void {
    // Camera: blend between the two nearest sheets
    const last = CAMERA_KEYS.length - 1;
    const i = Math.min(last, Math.floor(sheet));
    const a = CAMERA_KEYS[i]!;
    const b = CAMERA_KEYS[Math.min(last, i + 1)]!;
    const t = smoothstep(Math.min(1, Math.max(0, sheet - i)));
    want.position.set(...a.position).lerp(scratch.set(...b.position), t);
    want.target.set(...a.target).lerp(scratch.set(...b.target), t);
    want.position.sub(want.target).multiplyScalar(cameraDistanceScale(camera.aspect, narrow, clearAbove)).add(want.target);

    const ease = reducedMotion ? 1 : 1 - Math.exp(-dt * 4.5);
    cam.position.lerp(want.position, ease);
    cam.target.lerp(want.target, ease);
    camera.position.copy(cam.position);
    if (!reducedMotion) {
      camera.position.x += pointer.x * 0.5;
      camera.position.y -= pointer.y * 0.35;
    }
    camera.lookAt(cam.target);

    // A slow sway on the opening sheet only
    if (!reducedMotion && sheet < 0.5) sway += dt * 0.12;
    engine.rotation.y = Math.sin(sway) * 0.22 * Math.max(0, 1 - sheet * 2);

    // Moving parts
    crank.rotation.z = (state.crank * Math.PI) / 180;
    const delay = PULSE_DELAY[state.mode];
    let collectorHit = false;
    CYLINDERS.forEach((c, n) => {
      const pose = pistonPose(c, state.crank);
      pistons[n]!.position.x = pose.wristX + c.side * 0.1;
      const rod = rods[n]!;
      rod.position.x = (pose.pinX + pose.wristX) / 2;
      rod.position.y = pose.pinY / 2;
      rod.rotation.z = Math.atan2(-pose.pinY, pose.wristX - pose.pinX);

      const since = degreesSince(state.crank, c.fireAt);
      firing[n] = since < 90;
      flashes[n]!.material.opacity = firing[n] ? 0.9 * (1 - since / 90) : 0;

      const travel = delay[c.n];
      const pulse = pulses[n]!;
      pulse.visible = since < travel;
      if (pulse.visible) pulse.position.copy(runs[state.mode][n]!.getPointAt(since / travel));
      if (degreesSince(state.crank, arrivalAngle(c, state.mode)) < 50) collectorHit = true;

      place(labels.cylinders[n]!, c.side * 2.75, 0.95, c.z);
    });
    collector.scale.setScalar(collectorHit ? 1.5 : 1);
    place(labels.front, 0, -0.1, 2.35);

    if (!reducedMotion) {
      const shake = 0.012 * (1 + ((state.rpm - 850) / 6150) * 3);
      engine.position.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0);
    }

    renderer.render(scene, camera);
  }

  setHeaders(state.mode);
  applyTheme();
  resize();

  return { render, setHeaders, resize, applyTheme, firing };
}
