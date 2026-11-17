import { describe, expect, it } from 'vitest';
import { LIGHTS, SKIES, pickLight } from './light';
import { CHECKPOINTS, TARGETS, checkpointsOf, formatGap, keepBest, medalFor, parseBestRun, splitGap, verdict, type BestRun } from './splits';
import { buildStage } from './stage';

const best: BestRun = { time: 66, splits: [17, 34, 50] };

describe('checkpoints', () => {
  it('are three, evenly spread between the start line and the finish', () => {
    expect(checkpointsOf(100, 500)).toEqual([200, 300, 400]);
    const stage = buildStage();
    expect(stage.checkpoints).toHaveLength(CHECKPOINTS.length);
    expect(stage.checkpoints[0]).toBeGreaterThan(stage.startAt);
    expect(stage.checkpoints[2]).toBeLessThan(stage.finishAt);
  });
});

describe('split times', () => {
  it('are measured against the best run: negative is ahead', () => {
    expect(splitGap(best, 0, 16.5)).toBeCloseTo(-0.5);
    expect(splitGap(best, 2, 51.25)).toBeCloseTo(1.25);
  });
  it('have nothing to be measured against on a first run', () => {
    expect(splitGap(null, 0, 16.5)).toBeNull();
    expect(splitGap({ time: 66, splits: [] }, 1, 30)).toBeNull();
    expect(splitGap(best, 0, NaN)).toBeNull();
  });
  it('are shown with a sign and hundredths', () => {
    expect(formatGap(-0.416)).toBe('-0.42');
    expect(formatGap(1.2)).toBe('+1.20');
    expect(formatGap(12.345)).toBe('+12.35');
    expect(formatGap(0)).toBe('+0.00');
    expect(formatGap(-0.001)).toBe('+0.00');
  });
});

describe('the best run', () => {
  it('is the quicker of the two', () => {
    const quicker = { time: 64, splits: [16, 33, 49] };
    expect(keepBest(null, best)).toEqual(best);
    expect(keepBest(best, quicker)).toEqual(quicker);
    expect(keepBest(quicker, best)).toBe(quicker);
    expect(keepBest(best, { time: NaN, splits: [] })).toBe(best);
  });
  it('is a copy, so a later run cannot change it', () => {
    const run = { time: 60, splits: [15, 30, 45] };
    const kept = keepBest(null, run)!;
    run.splits.push(99);
    expect(kept.splits).toEqual([15, 30, 45]);
  });
  it('reads back what was stored', () => {
    expect(parseBestRun(JSON.stringify(best))).toEqual(best);
  });
  it('treats anything else as no best run', () => {
    const bad = [null, '', 'not json', '42', 'null', '{"time":66}', '{"time":66,"splits":[17,34]}', '{"time":-1,"splits":[1,2,3]}', '{"time":66,"splits":[17,"x",50]}', '{"time":66,"splits":[34,17,50]}', '{"time":40,"splits":[17,34,50]}'];
    for (const text of bad) expect(parseBestRun(text)).toBeNull();
  });
});

describe('medals', () => {
  it('get harder: gold is quicker than silver, silver than bronze', () => {
    expect(TARGETS.gold).toBeLessThan(TARGETS.silver);
    expect(TARGETS.silver).toBeLessThan(TARGETS.bronze);
  });
  it('go to the best one a time earns', () => {
    expect(medalFor(TARGETS.gold - 1)).toBe('gold');
    expect(medalFor(TARGETS.gold)).toBe('gold');
    expect(medalFor(TARGETS.gold + 0.01)).toBe('silver');
    expect(medalFor(TARGETS.silver + 0.01)).toBe('bronze');
    expect(medalFor(TARGETS.bronze + 0.01)).toBeNull();
    for (const time of [0, -5, NaN, Infinity]) expect(medalFor(time)).toBeNull();
  });
  it('come with a line for the end screen', () => {
    expect(verdict(TARGETS.gold - 2)).toBe("Sawa. That's a stage time.");
    expect(verdict(TARGETS.bronze + 20)).toBe('Even the zebra overtook you.');
    const lines = new Set([TARGETS.gold, TARGETS.silver, TARGETS.bronze, TARGETS.bronze + 1].map(verdict));
    expect(lines.size).toBe(4);
  });
});

describe('the light', () => {
  it('is dawn, midday or dusk, each as likely as the others', () => {
    expect(pickLight(0)).toBe('dawn');
    expect(pickLight(0.34)).toBe('midday');
    expect(pickLight(0.67)).toBe('dusk');
    expect(pickLight(0.999999)).toBe('dusk');
    const counts = { dawn: 0, midday: 0, dusk: 0 };
    for (let i = 0; i < 300; i++) counts[pickLight(i / 300)]++;
    expect(counts).toEqual({ dawn: 100, midday: 100, dusk: 100 });
  });
  it('is always one of them, whatever the dice say', () => {
    for (const roll of [1, 7, -1, NaN, Infinity]) expect(LIGHTS).toContain(pickLight(roll));
  });
  it('puts the sun above the horizon, highest at midday, and the haze nearest at dawn', () => {
    const height = (light: (typeof LIGHTS)[number]) => SKIES[light].sun[1] / Math.hypot(...SKIES[light].sun);
    for (const light of LIGHTS) {
      expect(height(light)).toBeGreaterThan(0);
      expect(SKIES[light].fog.far).toBeGreaterThan(SKIES[light].fog.near);
    }
    expect(height('midday')).toBeGreaterThan(height('dawn'));
    expect(height('midday')).toBeGreaterThan(height('dusk'));
    expect(SKIES.dawn.fog.far).toBeLessThan(SKIES.midday.fog.far);
  });
});
