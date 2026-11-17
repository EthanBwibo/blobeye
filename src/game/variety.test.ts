import { describe, expect, it } from 'vitest';
import { LIGHTS_CALL_AFTER, wantsLights } from './codriver';
import { SURFACES, carSpeeds, stepCar, type CarState, type DriveInput, type Surface } from './handling';
import { ANIMAL_SIZE, CAR_RADIUS, HAZARDS, NO_HAZARDS, OSTRICH_WAKE, VERGE, animalsAt, branchParts, surfaceAt, type Hazards } from './hazards';
import { paceNotes } from './notes';
import { STUCK, buildStage, canReset, creaturesAt, kerbsOf, newTrial, onKerb, placeAt, poseAt, resetToRoad, stepTrial, type Stage, type Trial } from './stage';
import { STAGES, buildStageOf } from './stages';
import { BUZZ, buzzFor } from './touch';

const DT = 1 / 120;
const GO: DriveInput = { throttle: 1, brake: 0, steer: 0 };
const speedOf = (car: CarState) => Math.hypot(car.vx, car.vy);

/** A straight road 1.6 km long, with whatever is asked for on it. */
const straight = (hazards: Partial<Hazards> = {}): Stage => buildStage([[0, 0], [1600, 0]], 1, 4, { ...NO_HAZARDS, ...hazards });

/** A run under way on `stage`, at `along` and `across` the road, going `speed` up it. */
function running(stage: Stage, along: number, speed: number, across = 0): Trial {
  const trial = newTrial(stage);
  const { x, y, heading } = placeAt(stage, along, across);
  trial.car = { x, y, heading, vx: Math.cos(heading) * speed, vy: Math.sin(heading) * speed };
  trial.phase = 'running';
  trial.progress = along;
  trial.index = Math.max(0, Math.floor(along / 4) - 2);
  return trial;
}

const drive = (stage: Stage, trial: Trial, seconds: number, input: DriveInput = GO): void => {
  for (let t = 0; t < seconds; t += DT) stepTrial(stage, trial, input, DT);
};

describe('track limits', () => {
  const stage = straight();

  it('lose grip by degrees past the edge: the road, then the grass verge, then the bush', () => {
    const grip = (out: number) => surfaceAt(NO_HAZARDS, 100, stage.halfWidth + out, stage.halfWidth).grip;
    expect(grip(-1)).toBe(1);
    let last = Infinity;
    for (let out = 0; out <= VERGE.grass + VERGE.into + 2; out += 0.5) {
      expect(grip(out)).toBeLessThanOrEqual(last);
      last = grip(out);
    }
    expect(grip(VERGE.grass - 0.5)).toBeCloseTo(SURFACES.grass.grip, 5);
    expect(grip(VERGE.grass + VERGE.into + 1)).toBeCloseTo(SURFACES.bush.grip, 5);
    // No sudden step anywhere: half a metre never takes more than a tenth of the grip.
    for (let out = 0; out < 14; out += 0.5) expect(grip(out) - grip(out + 0.5)).toBeLessThan(0.1);
  });

  it('let a car that runs wide carry on and come back, instead of stopping it dead', () => {
    // At 40 m/s, off the road into the verge and the bush, lifting off; and the same on the road.
    const lift = { throttle: 0, brake: 0, steer: 0 };
    const trial = running(stage, 200, 40, stage.halfWidth + 6);
    const road = running(stage, 200, 40);
    drive(stage, trial, 1, lift);
    drive(stage, road, 1, lift);
    expect(trial.onRoad).toBe(false);
    // The old rough ground took six sevenths of the speed in a second, against a third on the road. Now it is a
    // gentle drag: most of what the road would keep.
    expect(speedOf(trial.car)).toBeGreaterThan(speedOf(road.car) * 0.7);
    // From a standstill deep in the bush, it still pulls away: the old rough ground held it under 6 m/s.
    const parked = running(stage, 300, 0, stage.halfWidth + 10);
    drive(stage, parked, 3);
    expect(speedOf(parked.car)).toBeGreaterThan(10);
  });

  it('put rumble strips on the outside of the tight corners only', () => {
    const naivasha = buildStage();
    expect(naivasha.kerbs.length).toBeGreaterThan(2);
    for (const kerb of naivasha.kerbs) {
      expect(kerb.to - kerb.from).toBeGreaterThanOrEqual(15);
      // The outside: a right-hander (heading growing) has its strip on the left.
      const middle = (kerb.from + kerb.to) / 2;
      const turn = Math.atan2(Math.sin(poseAt(naivasha, middle + 10).heading - poseAt(naivasha, middle - 10).heading), Math.cos(poseAt(naivasha, middle + 10).heading - poseAt(naivasha, middle - 10).heading));
      expect(Math.sign(turn)).toBe(-kerb.side);
    }
    expect(kerbsOf(stage, stage.startAt, stage.finishAt)).toEqual([]);
  });

  it('rumble under a car on a strip, and not in the middle of the road', () => {
    const naivasha = buildStage();
    const kerb = naivasha.kerbs[0]!;
    const middle = (kerb.from + kerb.to) / 2;
    expect(onKerb(naivasha, middle, kerb.side * (naivasha.halfWidth - 0.4))).toBe(true);
    expect(onKerb(naivasha, middle, 0)).toBe(false);
    expect(onKerb(naivasha, middle, -kerb.side * (naivasha.halfWidth - 0.4))).toBe(false);
    const trial = running(naivasha, middle, 20, kerb.side * (naivasha.halfWidth - 0.4));
    stepTrial(naivasha, trial, { throttle: 1, brake: 0, steer: 0 }, DT);
    expect(trial.event).toBe('rumble');
    expect(buzzFor('rumble', 2, 2)).toBe(BUZZ.rumble);
  });
});

describe('stuck off the road', () => {
  const stage = straight({ branches: [{ along: 400, side: 1, reach: 3 }] });

  it('counts two seconds going nowhere off the road before it offers a way back', () => {
    const trial = running(stage, 400, 0, stage.halfWidth + 14);
    drive(stage, trial, STUCK.seconds - 0.2, { throttle: 0, brake: 0, steer: 0 });
    expect(canReset(trial)).toBe(false);
    drive(stage, trial, 0.3, { throttle: 0, brake: 0, steer: 0 });
    expect(canReset(trial)).toBe(true);
    // Driving off again starts the count over.
    drive(stage, trial, 1.5);
    expect(trial.stuck).toBe(0);
  });

  it('is never stuck on the road, or before the start', () => {
    const still = running(stage, 500, 0);
    drive(stage, still, 3, { throttle: 0, brake: 0, steer: 0 });
    expect(canReset(still)).toBe(false);
    const waiting = newTrial(stage);
    waiting.stuck = 10;
    expect(canReset(waiting)).toBe(false);
  });

  it('puts the car back on the road where it left it, stopped and facing up the road, clear of a branch, with the clock running on', () => {
    const trial = running(stage, 400, 0, stage.halfWidth + 14);
    trial.time = 33.3;
    drive(stage, trial, 2.2, { throttle: 0, brake: 0, steer: 0 });
    const clock = trial.time;
    resetToRoad(stage, trial);
    expect(trial.onRoad).toBe(true);
    expect(trial.offset).toBeLessThan(stage.halfWidth - CAR_RADIUS);
    expect(trial.progress).toBeCloseTo(400, 0);
    expect(speedOf(trial.car)).toBe(0);
    expect(Math.abs(Math.atan2(Math.sin(trial.car.heading - poseAt(stage, 400).heading), Math.cos(trial.car.heading - poseAt(stage, 400).heading)))).toBeLessThan(0.01);
    for (const part of stage.branches) expect(Math.hypot(trial.car.x - part.x, trial.car.y - part.y)).toBeGreaterThan(part.r + CAR_RADIUS);
    expect(trial.time).toBe(clock);
    expect(trial.event).toBe('reset');
    expect(canReset(trial)).toBe(false);
  });
});

describe('surfaces', () => {
  /** A car at speed, turned in hard on a surface: how much it is sliding after half a second. */
  const slide = (surface: Surface) => {
    let car: CarState = { x: 0, y: 0, heading: 0, vx: 30, vy: 0 };
    for (let t = 0; t < 0.5; t += DT) car = stepCar(car, { throttle: 1, brake: 0, steer: 1 }, DT, surface);
    return Math.abs(carSpeeds(car).sideways);
  };

  it('slide more on sand, more again on mud, than on murram', () => {
    expect(slide(SURFACES.sand)).toBeGreaterThan(slide(SURFACES.murram) * 1.3);
    expect(slide(SURFACES.mud)).toBeGreaterThan(slide(SURFACES.sand));
  });

  it('stop worse on mud', () => {
    const stop = (surface: Surface) => {
      let car: CarState = { x: 0, y: 0, heading: 0, vx: 30, vy: 0 };
      let t = 0;
      while (carSpeeds(car).forward > 1 && t < 10) {
        car = stepCar(car, { throttle: 0, brake: 1, steer: 0 }, DT, surface);
        t += DT;
      }
      return car.x;
    };
    expect(stop(SURFACES.mud)).toBeGreaterThan(stop(SURFACES.murram) * 1.4);
  });

  it('are read from the stretch of road the car is on', () => {
    const stage = straight({ patches: [{ kind: 'sand', from: 100, to: 200 }, { kind: 'mud', from: 300, to: 350 }] });
    expect(surfaceAt(stage.hazards, 150, 0, stage.halfWidth)).toEqual(SURFACES.sand);
    expect(surfaceAt(stage.hazards, 320, 0, stage.halfWidth)).toEqual(SURFACES.mud);
    expect(surfaceAt(stage.hazards, 250, 0, stage.halfWidth)).toEqual(SURFACES.murram);
  });
});

describe('stretches of road', () => {
  const stage = straight({
    patches: [
      { kind: 'washout', from: 300, to: 314 },
      { kind: 'grid', from: 500, to: 504 },
      { kind: 'splash', from: 700, to: 712 },
    ],
  });

  it('a washout jars a fast car and takes its speed, but lets it through', () => {
    const fast = running(stage, 290, 35);
    const plain = running(straight(), 290, 35);
    let knocked = false;
    for (let t = 0; t < 1.5; t += DT) {
      stepTrial(stage, fast, { throttle: 0, brake: 0, steer: 0 }, DT);
      stepTrial(straight(), plain, { throttle: 0, brake: 0, steer: 0 }, DT);
      knocked ||= fast.event === 'knock';
    }
    expect(knocked).toBe(true);
    expect(speedOf(fast.car)).toBeLessThan(speedOf(plain.car) - 3);
    expect(fast.progress).toBeGreaterThan(314);
  });

  it('a cattle grid rattles', () => {
    const trial = running(stage, 499, 20);
    const events = new Set<string | null>();
    for (let t = 0; t < 0.4; t += DT) {
      stepTrial(stage, trial, GO, DT);
      events.add(trial.event);
    }
    expect(events.has('rattle')).toBe(true);
    expect(buzzFor('rattle', 3, 3)).toBe(BUZZ.rattle);
  });

  it('a splash throws up spray and drags like the ford', () => {
    const trial = running(stage, 695, 25);
    let splashed = false;
    let wet = false;
    for (let t = 0; t < 0.6; t += DT) {
      stepTrial(stage, trial, { throttle: 0, brake: 0, steer: 0 }, DT);
      splashed ||= trial.event === 'splash';
      wet ||= trial.wet;
    }
    expect(splashed && wet).toBe(true);
  });
});

describe('fallen branches', () => {
  it('lie from the edge into the road, leaving room to pass on the other side', () => {
    for (const def of STAGES) {
      const stage = buildStageOf(def);
      for (const branch of def.hazards.branches ?? []) {
        const parts = branchParts(branch, stage.halfWidth);
        const inmost = Math.min(...parts.map((p) => branch.side * p.across - p.r));
        expect(inmost).toBeGreaterThan(-stage.halfWidth + 2 * CAR_RADIUS + 4);
        expect(Math.max(...parts.map((p) => branch.side * p.across))).toBeGreaterThan(stage.halfWidth - 0.5);
      }
    }
  });

  it('cost a car that hits one its speed, but never end the run', () => {
    const stage = straight({ branches: [{ along: 400, side: 1, reach: 3.2 }] });
    const trial = running(stage, 380, 25, stage.halfWidth - 1.5);
    let knocked = false;
    for (let t = 0; t < 1.2; t += DT) {
      stepTrial(stage, trial, GO, DT);
      knocked ||= trial.event === 'knock';
    }
    expect(knocked).toBe(true);
    expect(trial.phase).toBe('running');
    drive(stage, trial, 70);
    expect(trial.phase).toBe('finished');
  });
});

describe('the animals', () => {
  const W = 7;
  const groups: Hazards['animals'] = [
    { kind: 'giraffe', at: 400, count: 2, gap: 16, span: 40, pace: 1.1 },
    { kind: 'warthog', at: 600, count: 3, span: 20, pace: 7, every: 6 },
    { kind: 'ostrich', at: 800, to: 1000, count: 2, side: 1, out: 3, pace: 17 },
    { kind: 'flamingo', at: 1200, count: 9, side: -1 },
  ];
  const hazards: Hazards = { ...NO_HAZARDS, animals: groups };
  const of = (kind: string, time: number, woke: (number | null)[] = [null, null, null, null]) => animalsAt(hazards, time, woke, W).filter((a) => a.kind === kind);
  /** The fastest any of a kind moves across the road, in m/s, over a minute. */
  const fastest = (kind: string) => {
    let most = 0;
    for (let t = 0; t < 60; t += 0.05) {
      const [a, b] = [of(kind, t), of(kind, t + 0.05)];
      a.forEach((spot, i) => (most = Math.max(most, Math.hypot(b[i]!.along - spot.along, b[i]!.across - spot.across) / 0.05)));
    }
    return most;
  };

  it('giraffe cross slowly, at a walk', () => {
    expect(fastest('giraffe')).toBeLessThan(1.5);
    expect(fastest('giraffe')).toBeGreaterThan(0.5);
    // Across the whole road and out the other side.
    const reach = Math.max(...Array.from({ length: 80 }, (_, i) => Math.abs(of('giraffe', i)[0]!.across)));
    expect(reach).toBeGreaterThan(W);
  });

  it('warthogs dart across fast, then wait off the road', () => {
    expect(fastest('warthog')).toBeGreaterThan(5);
    let parked = 0;
    for (let t = 0; t < 30; t += 0.1) if (of('warthog', t).every((w) => Math.abs(w.across) > W + 1)) parked++;
    // Much of the time the road is clear of them all: a gap to time, not a wall.
    expect(parked).toBeGreaterThan(120);
  });

  it('ostrich wait on the verge until the car comes near, then run beside the road, off it', () => {
    const waiting = of('ostrich', 30);
    expect(waiting.every((o) => o.along < 810)).toBe(true);
    const runner = (t: number) => of('ostrich', t, [null, null, 20, null]);
    expect(runner(25)[0]!.along).toBeGreaterThan(waiting[0]!.along + 70);
    for (let t = 20; t < 40; t += 0.5) for (const bird of runner(t)) expect(bird.across).toBeGreaterThan(W + 1);
    expect(runner(60)[0]!.along).toBe(1000);
    expect(OSTRICH_WAKE).toBeGreaterThan(30);
  });

  it('ostrich take fright when the car comes up on them in a run', () => {
    const stage = straight({ animals: groups });
    const trial = running(stage, 800 - OSTRICH_WAKE - 5, 20);
    drive(stage, trial, 0.1);
    expect(trial.woke[2]).toBeNull();
    drive(stage, trial, 0.5);
    expect(trial.woke[2]).not.toBeNull();
  });

  it('flamingos stand still, in the water off the road', () => {
    const [early, late] = [of('flamingo', 0), of('flamingo', 40)];
    expect(early).toEqual(late);
    for (const bird of early) {
      expect(bird.across).toBeLessThan(-W - 2);
      expect(Math.abs(bird.along - 1200)).toBeLessThan(12);
    }
  });

  it('slow a car that hits one, and never end the run', () => {
    const stage = straight({ animals: [{ kind: 'giraffe', at: 400, count: 1, gap: 1, span: 0.01, pace: 0 }] });
    const trial = running(stage, 370, 30);
    let knocked = false;
    for (let t = 0; t < 2; t += DT) {
      stepTrial(stage, trial, GO, DT);
      knocked ||= trial.event === 'knock';
    }
    expect(knocked).toBe(true);
    expect(trial.phase).toBe('running');
    expect(trial.progress).toBeGreaterThan(400 - ANIMAL_SIZE.giraffe - 3);
  });

  it('are all on the ground for the drawing, with the zebra', () => {
    const stage = buildStage();
    const all = creaturesAt(stage, 10, newTrial(stage).woke);
    const kinds = new Set(all.map((a) => a.kind));
    expect(kinds).toEqual(new Set(['zebra', 'giraffe', 'flamingo']));
    expect(all.filter((a) => a.kind === 'zebra')).toHaveLength(HAZARDS.zebra.count);
  });
});

describe('the three stages, between them', () => {
  const all = STAGES.map((def) => def.hazards);
  const kinds = new Set(all.flatMap((h) => (h.patches ?? []).map((p) => p.kind)));
  const species = new Set(all.flatMap((h) => (h.animals ?? []).map((a) => a.kind)));

  it('have sand, mud, a washout, a cattle grid and a splash; rocks and a fallen branch', () => {
    expect(kinds).toEqual(new Set(['sand', 'mud', 'washout', 'grid', 'splash']));
    for (const h of all) expect(h.rocks.length).toBeGreaterThan(0);
    expect(all.filter((h) => (h.branches ?? []).length).length).toBeGreaterThanOrEqual(2);
  });

  it('have zebra, giraffe, warthogs, ostrich, and flamingos by the water on Naivasha', () => {
    expect(species).toEqual(new Set(['giraffe', 'warthog', 'ostrich', 'flamingo']));
    expect(all.some((h) => h.zebra.count > 0)).toBe(true);
    const flamingos = HAZARDS.animals!.find((a) => a.kind === 'flamingo')!;
    expect(flamingos.at).toBeGreaterThanOrEqual(HAZARDS.water.from);
    expect(flamingos.at).toBeLessThanOrEqual(HAZARDS.water.to);
  });

  it('spread it out: every stage has something of each, none has everything', () => {
    for (const h of all) {
      expect((h.patches ?? []).length).toBeGreaterThan(0);
      expect((h.animals ?? []).length + (h.zebra.count ? 1 : 0)).toBeGreaterThan(0);
    }
  });

  it.each(STAGES.map((def) => [def.name, def] as const))('%s keeps everything on the stage, apart, and called', (_, def) => {
    const stage = buildStageOf(def);
    const inside = (at: number) => at > stage.startAt + 100 && at < stage.finishAt - 100;
    const patches = [...(def.hazards.patches ?? [])].sort((a, b) => a.from - b.from);
    patches.forEach((patch, i) => {
      expect(inside(patch.from) && inside(patch.to)).toBe(true);
      if (i > 0) expect(patch.from).toBeGreaterThan(patches[i - 1]!.to);
    });
    for (const branch of def.hazards.branches ?? []) expect(inside(branch.along)).toBe(true);
    for (const group of def.hazards.animals ?? []) expect(inside(group.at)).toBe(true);
    const texts = paceNotes(stage).map((n) => n.text);
    expect(texts.filter((t) => /^(Sand|Mud|Washout|Cattle grid|Splash)/.test(t))).toHaveLength(patches.length);
    expect(texts.filter((t) => t.startsWith('Branch'))).toHaveLength((def.hazards.branches ?? []).length);
    const called = (def.hazards.animals ?? []).filter((a) => a.kind !== 'flamingo').length;
    expect(texts.filter((t) => /giraffe|Warthogs|Ostrich/.test(t))).toHaveLength(called);
  });
});

describe('lights', () => {
  it('are called for once, early in the count, on a night run with them off', () => {
    expect(wantsLights(true, false, false, LIGHTS_CALL_AFTER)).toBe(true);
    expect(wantsLights(true, false, false, 0)).toBe(false);
    expect(wantsLights(true, true, false, 1)).toBe(false);
    expect(wantsLights(true, false, true, 1)).toBe(false);
    expect(wantsLights(false, false, false, 1)).toBe(false);
  });
});
