import { describe, expect, it } from 'vitest';
import { sheetAt } from './sheets';

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
