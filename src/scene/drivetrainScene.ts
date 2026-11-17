import * as THREE from 'three';
import { DRIVETRAIN, HALF_SHAFTS, type Solid } from '../car/drivetrain';

/** The drivetrain is drawn in a pass of its own, over the car, so the body never hides it. */
export const XRAY_LAYER = 1;

export interface Drivetrain {
  /** In the car's units and axes. The caller scales and places it exactly as it does the car. */
  group: THREE.Group;
  /** Where each part's name goes, in the group's own units, in the order of `DRIVETRAIN`. */
  labelPoints: THREE.Vector3[];
  /** 0 hides it, 1 is solid. */
  setOpacity(opacity: number): void;
  applyTheme(token: (name: string) => THREE.Color): void;
}

function solidGeometry(solid: Solid): THREE.BufferGeometry {
  if (solid.shape === 'box') return new THREE.BoxGeometry(...solid.size).translate(...solid.centre);
  const from = new THREE.Vector3(...solid.from);
  const span = new THREE.Vector3(...solid.to).sub(from);
  const middle = from.clone().addScaledVector(span, 0.5);
  // A cylinder is built standing up, with its top at +y: turn that to point at `to`.
  return new THREE.CylinderGeometry(solid.endRadius ?? solid.radius, solid.radius, span.length(), 36)
    .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), span.clone().normalize()))
    .translate(middle.x, middle.y, middle.z);
}

export function createDrivetrain(): Drivetrain {
  const mat = {
    gold: new THREE.MeshBasicMaterial({ polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    line: new THREE.LineBasicMaterial(),
  };
  const group = new THREE.Group();
  group.visible = false;

  for (const solid of [...DRIVETRAIN.flatMap((part) => part.solids), ...HALF_SHAFTS]) {
    const geometry = solidGeometry(solid);
    const mesh = new THREE.Mesh(geometry, mat.gold);
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), mat.line));
    group.add(mesh);
  }
  // A leader from each part to its name
  const leaders = DRIVETRAIN.flatMap((part) => [new THREE.Vector3(...part.anchor), new THREE.Vector3(...part.labelAt)]);
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(leaders), mat.line));
  group.traverse((object) => object.layers.set(XRAY_LAYER));

  return {
    group,
    labelPoints: DRIVETRAIN.map((part) => new THREE.Vector3(...part.labelAt)),
    setOpacity(opacity) {
      group.visible = opacity > 0.001;
      for (const material of Object.values(mat)) {
        material.transparent = opacity < 1;
        material.opacity = opacity;
      }
    },
    applyTheme(token) {
      mat.gold.color = token('--gold');
      mat.line.color = token('--ink');
    },
  };
}
