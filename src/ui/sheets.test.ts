import { describe, expect, it } from 'vitest';
import { offsetFrom, sheetAt, storyNumbers } from './sheets';

const every = [0, 1, 2, 3].map((index) => ({ top: index * 800, index }));
/** Sheet 2 left out, as the laptop-only sheets are on a phone. */
const without = [
  { top: 0, index: 0 },
  { top: 800, index: 1 },
  { top: 1600, index: 3 },
];

describe('sheetAt', () => {
  it('is a whole number at the top of each sheet', () => {
    for (const stop of every) expect(sheetAt(stop.top, every)).toBe(stop.index);
  });
  it('counts part of the way between two sheets', () => {
    expect(sheetAt(1000, every)).toBeCloseTo(1.25);
  });
  it('stays within the first and last sheets', () => {
    expect(sheetAt(-50, every)).toBe(0);
    expect(sheetAt(9000, every)).toBe(3);
  });
  it('keeps each sheet its own number when one is left out', () => {
    expect(sheetAt(800, without)).toBe(1);
    expect(sheetAt(1600, without)).toBe(3);
  });
  it('passes through the number of a sheet that is left out', () => {
    expect(sheetAt(1200, without)).toBeCloseTo(2);
  });
  it('is 0 with no sheets at all', () => {
    expect(sheetAt(100, [])).toBe(0);
  });
});

describe('storyNumbers', () => {
  it('counts the sheets from 0', () => {
    expect(storyNumbers([false, false, false])).toEqual([0, 1, 2]);
  });
  it('does not count an aside, which shares the number of the sheet before it', () => {
    expect(storyNumbers([false, true, false, false])).toEqual([0, 0, 1, 2]);
  });
  it('holds the story still across an aside, then carries on', () => {
    const stops = storyNumbers([false, true, false]).map((index, i) => ({ top: i * 800, index }));
    expect(sheetAt(400, stops)).toBe(0);
    expect(sheetAt(800, stops)).toBe(0);
    expect(sheetAt(1200, stops)).toBeCloseTo(0.5);
    expect(sheetAt(1600, stops)).toBe(1);
  });
});

describe('offsetFrom', () => {
  const tops = [0, 800, 1800];
  it('is 0 on the sheet, -1 on the one before and 1 on the one after', () => {
    expect(offsetFrom(800, tops, 1)).toBe(0);
    expect(offsetFrom(0, tops, 1)).toBe(-1);
    expect(offsetFrom(1800, tops, 1)).toBe(1);
  });
  it('measures each side by its own sheet height', () => {
    expect(offsetFrom(400, tops, 1)).toBeCloseTo(-0.5);
    expect(offsetFrom(1300, tops, 1)).toBeCloseTo(0.5);
  });
  it('is nowhere near a sheet that is not on the page', () => {
    expect(Math.abs(offsetFrom(100, tops, -1))).toBe(Infinity);
  });
});
