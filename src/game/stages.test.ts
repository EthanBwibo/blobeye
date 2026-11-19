import { describe, expect, it } from 'vitest';
import { HANDLING, type DriveInput } from './handling';
import { CAR_RADIUS, HAZARDS } from './hazards';
import { SHARED_TIMES, STAGE_ID } from './leaderboard';
import { HAIRPIN_CALL, corners, paceNotes, rockFields } from './notes';
import { caption, signSvg } from './paceIcons';
import { growScenery } from './scenery';
import { MEDALS, medalFor } from './splits';
import { newTrial, poseAt, stepTrial, type Stage, type Trial } from './stage';
import { DEFAULT_STAGE, RENAMED, STAGES, buildStageOf, moveRenamed, stageById } from './stages';

const DT = 1 / 120;

/** The same plain driver as in game.test.ts: aim up the road, and slow down for what is coming. */
function autopilot(stage: Stage, trial: Trial): DriveInput {
  const turn = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const { car, progress } = trial;
  const speed = Math.hypot(car.vx, car.vy);
  const aim = poseAt(stage, progress + 10 + speed * 0.45);
  const error = turn(Math.atan2(aim.y - car.y, aim.x - car.x) - car.heading);
  const bend = Math.abs(turn(poseAt(stage, progress + 15 + speed * 1.3).heading - poseAt(stage, progress + 5).heading));
  const safe = HANDLING.topSpeed / (1 + bend * 1.5);
  return { throttle: speed < safe ? 1 : 0, brake: speed > safe + 4 ? 1 : 0, steer: Math.max(-1, Math.min(1, error * 3)) };
}

const byId = Object.fromEntries(STAGES.map((def) => [def.id, { def, stage: buildStageOf(def) }]));

describe('the stages', () => {
  it('are three, each with a name the shared table takes, and Naivasha first', () => {
    expect(STAGES.map((s) => s.name)).toEqual(['Naivasha', "Hell's Gate", 'Roysambu']);
    expect(new Set(STAGES.map((s) => s.id)).size).toBe(STAGES.length);
    for (const { id } of STAGES) expect(id).toMatch(/^[a-z-]{1,24}$/);
    // Naivasha's times are already on the shared board under this name.
    expect(DEFAULT_STAGE.id).toBe(STAGE_ID);
    expect(DEFAULT_STAGE.hazards).toBe(HAZARDS);
    expect(stageById('roysambu').name).toBe('Roysambu');
    expect(stageById('nowhere')).toBe(DEFAULT_STAGE);
    expect(stageById(null)).toBe(DEFAULT_STAGE);
  });

  it('still find Roysambu by the name it had, Soysambu, and move what a device kept under it', () => {
    expect(RENAMED).toEqual({ soysambu: 'roysambu' });
    expect(stageById('soysambu').id).toBe('roysambu');
    const kept = new Map<string, string>([
      ['run.soysambu', '{"time":70,"splits":[20,40,60]}'],
      ['ghost.soysambu', '{"stage":"soysambu","time":70,"step":0.1,"frames":[]}'],
      ['top.soysambu', '[{"name":"Ethan","time":70}]'],
      // Already there under the new name: kept, and the old one dropped.
      ['top.roysambu', '[{"name":"Newer","time":69}]'],
      ['picked', 'soysambu'],
      ['run.naivasha', '{"time":60,"splits":[15,30,45]}'],
    ]);
    const store = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) };
    const keysOf = (id: string) => [`run.${id}`, `ghost.${id}`, `top.${id}`];
    moveRenamed(store, keysOf, 'picked');
    expect(Object.fromEntries(kept)).toEqual({
      'run.roysambu': '{"time":70,"splits":[20,40,60]}',
      'ghost.roysambu': '{"stage":"roysambu","time":70,"step":0.1,"frames":[]}',
      'top.roysambu': '[{"name":"Newer","time":69}]',
      picked: 'roysambu',
      'run.naivasha': '{"time":60,"splits":[15,30,45]}',
    });
    // Run again, nothing changes.
    const before = Object.fromEntries(kept);
    moveRenamed(store, keysOf, 'picked');
    expect(Object.fromEntries(kept)).toEqual(before);
  });

  it('are each as the brief has them: Hell\'s Gate narrow, rocky and tight; Roysambu wide, open and quick, with crests and animals', () => {
    const [naivasha, gate, roysambu] = ['naivasha', 'hells-gate', 'roysambu'].map((id) => byId[id]!);
    const tight = (stage: Stage) => corners(stage).filter((c) => c.grade <= 2).length;
    expect(gate!.stage.halfWidth).toBeLessThan(naivasha!.stage.halfWidth);
    expect(rockFields(gate!.def.hazards.rocks).length).toBeGreaterThanOrEqual(3);
    expect(gate!.def.bush.rocks).toBeGreaterThan(naivasha!.def.bush.rocks);
    expect(tight(gate!.stage)).toBeGreaterThan(tight(naivasha!.stage) + 3);
    expect(roysambu!.stage.halfWidth).toBeGreaterThan(naivasha!.stage.halfWidth);
    expect(roysambu!.def.hazards.crests.length).toBeGreaterThanOrEqual(3);
    expect(roysambu!.def.hazards.zebra.count).toBeGreaterThan(0);
    expect(corners(roysambu!.stage).length).toBeLessThan(corners(naivasha!.stage).length);
    expect(tight(roysambu!.stage)).toBe(0);
  });
});

describe.each(STAGES.map((def) => [def.name, def.id] as const))('%s', (_, id) => {
  const { def, stage } = byId[id]!;

  it('never comes close to crossing itself', () => {
    let closest = Infinity;
    for (let i = 0; i < stage.points.length; i++) {
      for (let j = i + 20; j < stage.points.length; j++) {
        closest = Math.min(closest, Math.hypot(stage.points[i]![0] - stage.points[j]![0], stage.points[i]![1] - stage.points[j]![1]));
      }
    }
    expect(closest).toBeGreaterThan(stage.halfWidth * 4);
  });

  it('has everything on the road between the start and the finish, the crests apart, and a way past every rock', () => {
    const { rocks, water, bridge, zebra, crests } = def.hazards;
    const inside = (at: number) => at > stage.startAt + 100 && at < stage.finishAt - 100;
    for (const rock of rocks) {
      expect(inside(rock.along)).toBe(true);
      expect(Math.abs(rock.across) + rock.r).toBeLessThan(stage.halfWidth);
      // The other side of the road is clear, with room for the car and some.
      expect(stage.halfWidth + Math.abs(rock.across) - rock.r).toBeGreaterThan(2 * CAR_RADIUS + 4);
    }
    if (water.to > water.from && water.from >= 0) expect(inside(water.from) && inside(water.to)).toBe(true);
    if (bridge.half < stage.halfWidth) expect(inside(bridge.from - bridge.taper) && inside(bridge.to + bridge.taper)).toBe(true);
    if (zebra.count) expect(inside(zebra.at)).toBe(true);
    crests.forEach((crest, i) => {
      expect(inside(crest.at - crest.reach) && inside(crest.at + crest.reach)).toBe(true);
      if (i > 0) expect(crest.at - crest.reach).toBeGreaterThan(crests[i - 1]!.at + crests[i - 1]!.reach);
    });
  });

  it('has a call for everything on it', () => {
    const texts = paceNotes(stage).map((n) => n.text);
    const { water, bridge, zebra, crests } = def.hazards;
    expect(texts.filter((t) => t.startsWith('Rocks'))).toHaveLength(rockFields(def.hazards.rocks).length);
    expect(texts.filter((t) => t === 'Crest, keep it flat')).toHaveLength(crests.length);
    expect(texts.includes('Water!')).toBe(water.from >= 0 && water.to > water.from);
    expect(texts.includes('Narrow bridge')).toBe(bridge.half < stage.halfWidth);
    expect(texts.includes('Caution, zebra!')).toBe(zebra.count > 0);
  });

  it('has times to beat in order, and within what the shared board takes', () => {
    const [gold, silver, bronze] = MEDALS.map((medal) => def.targets[medal]);
    expect(gold).toBeLessThan(silver!);
    expect(silver).toBeLessThan(bronze!);
    expect(gold).toBeGreaterThan(SHARED_TIMES.least);
    expect(bronze).toBeLessThan(SHARED_TIMES.most);
  });

  it('takes a tidy driver about a minute or a little more, on the road, for silver with gold just out of reach', () => {
    const trial = newTrial(stage);
    let offRoad = 0;
    for (let i = 0; i < 120 * 150 && trial.phase !== 'finished'; i++) {
      stepTrial(stage, trial, autopilot(stage, trial), DT);
      if (!trial.onRoad) offRoad += DT;
    }
    expect(trial.phase).toBe('finished');
    expect(trial.time).toBeGreaterThan(50);
    expect(trial.time).toBeLessThan(85);
    expect(offRoad).toBeLessThan(2);
    expect(trial.splits).toHaveLength(3);
    expect(medalFor(trial.time, def.targets)).toBe('silver');
    expect(trial.time - def.targets.gold).toBeLessThan(2);
  });

  it('has bush that keeps off the road, and less of it on a phone', () => {
    const bush = growScenery(stage, def.bush);
    expect(growScenery(stage, def.bush)).toEqual(bush);
    for (const plant of [...bush.trees, ...bush.rocks]) {
      let nearest = Infinity;
      for (const p of stage.points) nearest = Math.min(nearest, Math.hypot(p[0] - plant.x, p[1] - plant.y));
      if (nearest - plant.r <= stage.halfWidth) throw new Error(`something is growing on the road at ${plant.x}, ${plant.y}`);
    }
    const thin = growScenery(stage, def.bush, 0.5);
    const all = (s: typeof bush) => s.trees.length + s.rocks.length + s.tufts.length;
    expect(all(thin)).toBeLessThan(all(bush) * 0.6);
    expect(all(thin)).toBeGreaterThan(all(bush) * 0.4);
  });
});

describe('the hairpin', () => {
  const hairpins = (id: string) => corners(byId[id]!.stage).filter((c) => c.hairpin);

  it("is on Hell's Gate only, once, near the finish, and turns right back on itself", () => {
    expect(hairpins('hells-gate')).toHaveLength(1);
    expect(hairpins('naivasha')).toHaveLength(0);
    expect(hairpins('roysambu')).toHaveLength(0);
    const { stage } = byId['hells-gate']!;
    const [pin] = hairpins('hells-gate');
    expect(pin!.grade).toBe(1);
    expect(pin!.from).toBeGreaterThan(stage.finishAt - 250);
    const turned = Math.abs(Math.atan2(Math.sin(poseAt(stage, pin!.to).heading - poseAt(stage, pin!.from).heading), Math.cos(poseAt(stage, pin!.to).heading - poseAt(stage, pin!.from).heading)));
    // Coming out it points nearly the opposite way to going in.
    expect(turned).toBeGreaterThan(2.6);
  });

  it('gets the co-driver call "Hairpin, handbrake!", with a U-turn arrow and no number', () => {
    const notes = paceNotes(byId['hells-gate']!.stage).filter((n) => n.text === HAIRPIN_CALL);
    expect(HAIRPIN_CALL).toBe('Hairpin, handbrake!');
    expect(notes).toHaveLength(1);
    expect(notes[0]!.say).toBe(HAIRPIN_CALL);
    expect(notes[0]!.sign).toMatchObject({ kind: 'corner', grade: 1, caution: 3, hairpin: true });
    expect(caption(notes[0]!.sign)).toBe('hairpin');
    expect(signSvg(notes[0]!.sign)).not.toContain('class="grade"');
    for (const id of ['naivasha', 'roysambu']) expect(paceNotes(byId[id]!.stage).some((n) => n.text === HAIRPIN_CALL)).toBe(false);
  });
});

describe('rock fields', () => {
  it('group rocks lying close together, so each field gets one call', () => {
    const rock = (along: number) => ({ along, across: 3, r: 0.8 });
    expect(rockFields([])).toEqual([]);
    expect(rockFields([rock(300), rock(640), rock(306), rock(646)]).map((f) => f.map((r) => r.along))).toEqual([
      [300, 306],
      [640, 646],
    ]);
    expect(rockFields(HAZARDS.rocks)).toHaveLength(1);
  });
});
