import { describe, expect, it } from 'vitest';
import { GHOST_STEP, REPLAY_SLACK, beatsGhost, finishGhost, ghostAt, ghostText, momentsIn, newRecorder, packReplay, parseGhost, record, replayFits, unpackReplay, type Ghost } from './ghost';
import { buildStage, newTrial, poseAt, stepTrial } from './stage';

const DT = 1 / 120;
const at = (x: number, heading = 0) => ({ x, y: -x, heading, height: 0 });

describe('recording a run', () => {
  it('keeps one moment every tenth of a second, whatever the step', () => {
    const recorder = newRecorder();
    for (let t = 0; t <= 1.0001; t += DT) record(recorder, t, at(t * 10));
    expect(momentsIn(recorder)).toBe(11);
    // Each moment is the step that reached it.
    expect(recorder.frames[4 * 5]).toBeCloseTo(5, 0);
    const coarse = newRecorder();
    // A long step still leaves no gaps: the moments it skipped take its place.
    record(coarse, 0, at(0));
    record(coarse, 0.35, at(3.5));
    expect(momentsIn(coarse)).toBe(4);
  });

  it('becomes a ghost only once there is a run to show', () => {
    const recorder = newRecorder();
    record(recorder, 0, at(0));
    expect(finishGhost(recorder, 'naivasha', 1)).toBeNull();
    record(recorder, 0.1, at(1));
    expect(finishGhost(recorder, 'naivasha', 0)).toBeNull();
    expect(finishGhost(recorder, 'naivasha', 0.1)).toEqual({ stage: 'naivasha', time: 0.1, frames: [0, -0, 0, 0, 1, -1, 0, 0] });
  });
});

describe('playing it back', () => {
  const ghost: Ghost = { stage: 'naivasha', time: 0.2, frames: [0, 0, 3, 0, 1, 2, -3, 0.5, 2, 4, -3, 1] };

  it('goes smoothly from one moment to the next', () => {
    const near = (time: number, x: number, y: number, height: number) => {
      const seen = ghostAt(ghost, time)!;
      expect(seen.x).toBeCloseTo(x);
      expect(seen.y).toBeCloseTo(y);
      expect(seen.height).toBeCloseTo(height);
    };
    near(0.05, 0.5, 1, 0.25);
    near(0.15, 1.5, 3, 0.75);
  });

  it('turns the short way through a half turn, not all the way round', () => {
    // 3 to -3 radians is a little over half a radian the short way, through ±π.
    const heading = ghostAt(ghost, 0.05)!.heading;
    expect(Math.abs(Math.atan2(Math.sin(heading - 3), Math.cos(heading - 3)))).toBeLessThan(0.2);
  });

  it('waits on the line before the start, and on its last moment after the finish', () => {
    expect(ghostAt(ghost, -1)).toMatchObject({ x: 0, y: 0 });
    expect(ghostAt(ghost, 5)).toMatchObject({ x: 2, y: 4, height: 1 });
    expect(ghostAt(null, 1)).toBeNull();
    expect(ghostAt({ ...ghost, frames: [7, 8, 0, 0] }, 1)).toMatchObject({ x: 7, y: 8 });
  });

  it('follows a real run where the car went', () => {
    const stage = buildStage();
    const trial = newTrial(stage);
    const recorder = newRecorder();
    record(recorder, 0, { ...trial.car, height: trial.height });
    const truth: { time: number; x: number; y: number }[] = [];
    for (let i = 0; i < 120 * 12; i++) {
      // Down the road, steering for the middle.
      const aim = poseAt(stage, trial.progress + 15);
      const off = Math.atan2(aim.y - trial.car.y, aim.x - trial.car.x) - trial.car.heading;
      stepTrial(stage, trial, { throttle: 1, brake: 0, steer: Math.max(-1, Math.min(1, Math.atan2(Math.sin(off), Math.cos(off)) * 3)) }, DT);
      record(recorder, trial.time, { ...trial.car, height: trial.height });
      if (i % 37 === 0) truth.push({ time: trial.time, x: trial.car.x, y: trial.car.y });
    }
    const ghost = finishGhost(recorder, 'naivasha', trial.time)!;
    for (const moment of truth) {
      const seen = ghostAt(ghost, moment.time)!;
      // At this pace the car covers about 4 metres a tenth: the ghost is never more than a step behind.
      expect(Math.hypot(seen.x - moment.x, seen.y - moment.y)).toBeLessThan(0.6);
    }
  });
});

describe('the best run as a ghost', () => {
  it('is replaced only by a quicker one', () => {
    const ghost = { stage: 'naivasha', time: 64, frames: [] };
    expect(beatsGhost(null, 70)).toBe(true);
    expect(beatsGhost(ghost, 63.9)).toBe(true);
    expect(beatsGhost(ghost, 64)).toBe(false);
    expect(beatsGhost(ghost, NaN)).toBe(false);
  });

  it('is kept on the device, small, and read back for its own stage only', () => {
    const recorder = newRecorder();
    for (let t = 0; t <= 64.0001; t += DT) record(recorder, t, { x: t * 30.123456, y: Math.sin(t) * 100, heading: t * 0.1234567, height: 0.001 });
    const ghost = finishGhost(recorder, 'roysambu', 64)!;
    const text = ghostText(ghost);
    // About forty kilobytes for a minute: comfortably inside what a browser lets a page keep.
    expect(text.length).toBeLessThan(40_000);
    const back = parseGhost(text, 'roysambu')!;
    expect(back.time).toBe(64);
    expect(momentsIn(back)).toBe(momentsIn(ghost));
    expect(ghostAt(back, 30)!.x).toBeCloseTo(ghostAt(ghost, 30)!.x, 1);
    expect(parseGhost(text, 'naivasha')).toBeNull();
  });

  it('is no ghost when what is stored is damaged', () => {
    const good = JSON.parse(ghostText({ stage: 'naivasha', time: 0.2, frames: [0, 0, 0, 0, 1, 1, 0, 0, 2, 2, 0, 0] })) as Record<string, unknown>;
    expect(parseGhost(JSON.stringify(good), 'naivasha')).not.toBeNull();
    for (const bad of [
      null,
      '',
      'not json',
      'null',
      JSON.stringify({ ...good, step: 0.05 }),
      JSON.stringify({ ...good, time: -1 }),
      JSON.stringify({ ...good, time: 30 }),
      JSON.stringify({ ...good, frames: [0, 0, 0] }),
      JSON.stringify({ ...good, frames: [0, 0, 0, 0, 1, 1, 'x', 0, 2, 2, 0, 0] }),
      JSON.stringify({ ...good, frames: 'lots' }),
    ]) {
      expect(parseGhost(bad, 'naivasha')).toBeNull();
    }
    expect(GHOST_STEP).toBe(0.1);
  });
});

describe('a replay for the shared board', () => {
  /** A real run down Naivasha, recorded as the game records it. */
  const drive = (seconds: number): Ghost => {
    const stage = buildStage();
    const trial = newTrial(stage);
    const recorder = newRecorder();
    record(recorder, 0, { ...trial.car, height: trial.height });
    while (trial.time < seconds) {
      const aim = poseAt(stage, trial.progress + 15);
      const off = Math.atan2(aim.y - trial.car.y, aim.x - trial.car.x) - trial.car.heading;
      stepTrial(stage, trial, { throttle: 1, brake: 0, steer: Math.max(-1, Math.min(1, Math.atan2(Math.sin(off), Math.cos(off)) * 3)) }, DT);
      record(recorder, trial.time, { ...trial.car, height: trial.height });
    }
    return finishGhost(recorder, 'naivasha', trial.time)!;
  };
  const flat = () => 0;

  it('packs place and heading every tenth into six letters a moment, and reads back to within rounding', () => {
    const run = drive(20);
    const text = packReplay(run)!;
    expect(text).toMatch(/^1[A-Za-z0-9_-]+$/);
    expect(text.length).toBe(9 + 6 * momentsIn(run));
    // About three and a half kilobytes a minute.
    expect(text.length / run.time).toBeLessThan(62);
    const back = unpackReplay(text, 'naivasha', run.time, flat)!;
    expect(momentsIn(back)).toBe(momentsIn(run));
    for (let i = 0; i < momentsIn(run); i++) {
      const [a, b] = [ghostAt(run, i * GHOST_STEP)!, ghostAt(back, i * GHOST_STEP)!];
      // Each place is rounded on its own, so the error never grows along the run.
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThanOrEqual(0.0708);
      expect(Math.abs(Math.atan2(Math.sin(a.heading - b.heading), Math.cos(a.heading - b.heading)))).toBeLessThan(0.001);
    }
  });

  it('puts the car on the ground it is given, as a replay keeps no heights', () => {
    const run = drive(3);
    const back = unpackReplay(packReplay(run)!, 'naivasha', run.time, (x) => x / 100)!;
    const seen = ghostAt(back, 2)!;
    expect(seen.height).toBeCloseTo(seen.x / 100, 2);
  });

  it('turns away a replay whose length does not fit its time', () => {
    const run = drive(20);
    const text = packReplay(run)!;
    const ms = Math.round(run.time * 1000);
    expect(replayFits(text, ms)).toBe(true);
    expect(replayFits(text, ms + 100 * REPLAY_SLACK)).toBe(true);
    expect(replayFits(text, ms + 100 * (REPLAY_SLACK + 1))).toBe(false);
    expect(replayFits(text, ms - 100 * (REPLAY_SLACK + 1))).toBe(false);
    expect(unpackReplay(text, 'naivasha', run.time + 1, flat)).toBeNull();
    expect(unpackReplay(text, 'naivasha', run.time - 1, flat)).toBeNull();
    // Half a moment, another version, or something else altogether.
    expect(replayFits(text.slice(0, -3), ms)).toBe(false);
    expect(replayFits('2' + text.slice(1), ms)).toBe(false);
    expect(replayFits(text.slice(0, -6) + '<scrip', ms)).toBe(false);
    expect(replayFits('', ms)).toBe(false);
  });

  it('cannot pack a move too long for its letters, or a run with nothing in it', () => {
    expect(packReplay({ frames: [0, 0, 0, 0, 300, 0, 0, 0] })).toBeNull();
    expect(packReplay({ frames: [0, 0, 0, 0] })).toBeNull();
    // Headings any number of turns round come back between -π and π.
    const back = unpackReplay(packReplay({ frames: [0, 0, 7, 0, 1, 0, -7, 0] })!, 'naivasha', 0.1, flat)!;
    expect(back.frames[2]).toBeCloseTo(7 - Math.PI * 2, 2);
    expect(back.frames[6]).toBeCloseTo(-7 + Math.PI * 2, 2);
  });
});
