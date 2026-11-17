import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

/**
 * The studio the car's paint reflects: "Studio Small 08" from Poly Haven (CC0, polyhaven.com), at 1k.
 * Served from `public/`, so it is fetched only when a scene asks for it.
 */
export const STUDIO_HDRI = `${import.meta.env.BASE_URL}hdri/studio_small_08_1k.hdr`;

/**
 * Light a scene for the car's physical paint: ACES tone mapping, a soft fill so the paint is never black,
 * and the studio HDRI as the environment once it has loaded.
 *
 * Everything else on the page is drawn in exact flat colours from the theme, so tone mapping is switched
 * off for every material that is not lit. Call this after the scene is built and before the first frame.
 */
export function lightStudio(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  scene.traverse((object) => {
    const material = (object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    for (const m of material === undefined ? [] : Array.isArray(material) ? material : [material]) {
      if (!(m instanceof THREE.MeshStandardMaterial)) m.toneMapped = false;
    }
  });

  // Until the studio arrives (or if it never does) a sky-and-ground light keeps the paint readable.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404858, 0.9));

  new HDRLoader().load(
    STUDIO_HDRI,
    (texture) => {
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromEquirectangular(texture).texture;
      texture.dispose();
      pmrem.dispose();
    },
    undefined,
    () => undefined,
  );
}
