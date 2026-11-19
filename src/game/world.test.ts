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
    setClearColor() {}
    getSize(into: { set(x: number, y: number): unknown }) {
      into.set(800, 450);
      return into;
    }
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
const { CAMERAS } = await import('./chase');
const { createCar } = await import('../scene/carScene');

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
    // An animal knocked over on its side, and one thrown up in the air.
    const struck = [{ ...animals[0]!, roll: Math.PI / 2, lift: 0.3 }, { ...animals[animals.length - 1]!, roll: 4, lift: 1.1 }];
    expect(() => world.draw({ ...view, animals: [...struck, ...animals.slice(1, -1)] })).not.toThrow();
    // Every camera, round and back to the start, with the wheel at full lock: the cockpit is built, shown and hidden again.
    for (const camera of [...CAMERAS, 'close'] as const) expect(() => world.draw({ ...view, camera, steer: 1 })).not.toThrow();
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
    expect(shader.fragmentShader).toMatch(/outgoingLight \*= 1\.0 \+ lampGlow\(\) \* [\d.]+;\s*outgoingLight = revealed\(outgoingLight\);\s*#include <opaque_fragment>/);
    // The same materials dissolve in from the drawing sheet on the way in.
    expect(shader.fragmentShader).toContain('vec3 revealed(vec3 colour)');
    expect(shader.uniforms).toHaveProperty('lampOn');
    expect(shader.uniforms).toHaveProperty('revealR');
    expect(SKIES.night.dark).toBe(true);
    world.dispose();
  });
});

describe("the drawing's car, handed over on the way in", () => {
  it("is driven in place of the world's own, cockpit and all, dissolves in with the stage, and goes back whole", () => {
    const stage = buildStageOf(STAGES[0]!);
    const world = createWorld(stage, {});
    const lent = createCar();
    const parent = new THREE.Group();
    parent.add(lent.group);
    world.adoptCar(lent);
    // It is in the world's scene now, not the drawing's, at road size.
    expect(lent.group.parent).toBeInstanceOf(THREE.Scene);
    expect(lent.group.scale.x).toBeCloseTo(4.6 / 100, 9);
    const trial = newTrial(stage);
    const view = {
      car: trial.car, steer: 0.5, rolled: 0, dive: 0, lean: 0, lift: 0, air: 0, animals: [], lamps: 0,
      eye: { x: trial.car.x - 8, y: trial.car.y, height: 3 }, target: { x: trial.car.x, y: trial.car.y, height: 1 },
      fov: 40, dust: [], ghost: null, shift: [-0.2, 0.04] as const,
    };
    world.setReveal(0, trial.car, 0);
    expect(() => world.draw(view)).not.toThrow();
    world.setReveal(30, trial.car, 0.5);
    // The cockpit goes with it.
    expect(() => world.draw({ ...view, camera: 'cockpit', shift: undefined })).not.toThrow();
    const cockpitParts = lent.group.children.length;
    world.setReveal(Infinity);
    world.releaseCar();
    expect(lent.group.parent).toBeNull();
    expect(lent.group.children.length).toBe(cockpitParts - 1);
    // Throwing the world away leaves the drawing's car alone (the cockpit is the world's, and goes with it).
    const disposed = vi.fn();
    lent.group.traverse((o) => void (o as THREE.Mesh).geometry?.addEventListener('dispose', disposed));
    world.adoptCar(lent);
    world.dispose();
    expect(disposed).not.toHaveBeenCalled();
    expect(lent.group.parent).toBeNull();
  });
});
