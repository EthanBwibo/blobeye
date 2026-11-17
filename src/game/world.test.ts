/**
 * The 3D world can only be seen in a browser, but it can be built and drawn here with a stand-in for the
 * graphics card: every shape on every stage is made, every material is set up, and a frame is drawn with
 * every animal and the headlights on. A mistake in building a shape fails here, not on someone's screen.
 */
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('three', async (load) => {
  const real = await load<typeof import('three')>();
  /** Does everything a renderer is asked to, and draws nothing. */
  class WebGLRenderer {
    domElement = {};
    toneMapping = 0;
    toneMappingExposure = 1;
    setPixelRatio() {}
    setSize() {}
    compile() {}
    render() {}
    dispose() {}
    forceContextLoss() {}
  }
  return { ...real, WebGLRenderer };
});
// The studio's light is fetched from a file; there is none here, and the world does not need it to be built.
vi.mock('../scene/studio', () => ({ lightStudio: () => undefined }));

const { createWorld } = await import('./world');
const { STAGES, buildStageOf } = await import('./stages');
const { creaturesAt, newTrial } = await import('./stage');
const { SKIES } = await import('./light');

const saved = { window: globalThis.window, document: globalThis.document, getComputedStyle: globalThis.getComputedStyle, Element: globalThis.Element };
beforeAll(() => {
  // A page with nothing on it but what the world asks for: a canvas for the number plates, and the theme's colours.
  const pen = new Proxy({}, { get: (_, key) => (key === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true });
  Object.assign(globalThis, {
    window: { devicePixelRatio: 1 },
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => pen }), documentElement: {} },
    getComputedStyle: () => ({ getPropertyValue: () => '#7a6a5a' }),
    Element: class {},
  });
});
afterAll(() => void Object.assign(globalThis, saved));

describe.each(STAGES.map((def) => [def.name, def] as const))('the world for %s', (_, def) => {
  it('builds every shape, and draws a frame with every animal, at night with the lights on', () => {
    const stage = buildStageOf(def);
    const world = createWorld(stage, { bush: def.bush });
    world.setLight('night');
    const trial = newTrial(stage);
    // Every group of ostrich awake, so they are drawn running.
    const animals = creaturesAt(stage, 20, trial.woke.map(() => 10));
    expect(animals.length).toBeGreaterThan(0);
    const view = {
      car: trial.car,
      steer: 0,
      rolled: 0,
      dive: 0,
      lean: 0,
      lift: 0,
      air: 0,
      animals,
      eye: { x: trial.car.x - 8, y: trial.car.y, height: 3 },
      target: { x: trial.car.x + 10, y: trial.car.y, height: 1 },
      fov: 60,
      dust: [],
      ghost: null,
      lamps: 1,
    };
    expect(() => world.draw(view)).not.toThrow();
    world.applyTheme();
    world.setLight('midday');
    expect(() => world.draw({ ...view, lamps: 0 })).not.toThrow();
    world.dispose();
  });
});

describe('the headlights', () => {
  it('are worked into the flat materials they fall on, in both their shaders', () => {
    // Everything the world puts in its scene, caught on the way in.
    const added: THREE.Object3D[] = [];
    const add = vi.spyOn(THREE.Scene.prototype, 'add');
    const world = createWorld(buildStageOf(STAGES[0]!), {});
    for (const call of add.mock.calls) added.push(...call);
    add.mockRestore();
    const materials = new Set<THREE.Material>();
    for (const object of added) {
      object.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        for (const one of m === undefined ? [] : Array.isArray(m) ? m : [m]) materials.add(one);
      });
    }
    const lit = [...materials].filter((m) => m instanceof THREE.MeshBasicMaterial && m.customProgramCacheKey().startsWith('lamps'));
    expect(lit.length).toBeGreaterThan(10);
    const shader = {
      uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.basic.uniforms),
      vertexShader: THREE.ShaderLib.basic.vertexShader,
      fragmentShader: THREE.ShaderLib.basic.fragmentShader,
    };
    lit[0]!.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain('vLampWorld = (modelMatrix * lampWorld).xyz;');
    expect(shader.fragmentShader).toContain('float lampGlow()');
    expect(shader.fragmentShader).toMatch(/outgoingLight \*= 1\.0 \+ lampGlow\(\) \* [\d.]+;\s*#include <opaque_fragment>/);
    expect(shader.uniforms).toHaveProperty('lampOn');
    expect(SKIES.night.dark).toBe(true);
    world.dispose();
  });
});
