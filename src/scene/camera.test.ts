import { describe, expect, it } from 'vitest';
import { cameraDistanceScale, narrowCentre } from './camera';

describe('narrowCentre', () => {
  it('puts the engine just below the middle of the space above the notes', () => {
    expect(narrowCentre(0.4)).toBeCloseTo(0.224);
  });
  it('stays on screen when the notes leave little room', () => {
    expect(narrowCentre(0.1)).toBe(0.17);
  });
  it('stays near the notes on tall screens', () => {
    expect(narrowCentre(0.8)).toBe(0.28);
  });
});

describe('cameraDistanceScale', () => {
  const phone = 400 / 820;
  it('fits the engine to the width when there is room above the notes', () => {
    expect(cameraDistanceScale(phone, true, 0.44)).toBeCloseTo(1.08 / phone);
  });
  it('pulls back when the space above the notes is short', () => {
    const short = 360 / 640;
    expect(cameraDistanceScale(short, true, 0.35)).toBeGreaterThan(cameraDistanceScale(short, true, 0.6));
  });
  it('ignores the notes on wide screens', () => {
    expect(cameraDistanceScale(16 / 9, false, 0.1)).toBe(cameraDistanceScale(16 / 9, false));
  });
});
