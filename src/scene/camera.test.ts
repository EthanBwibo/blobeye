import { describe, expect, it } from 'vitest';
import { CAMERA_KEYS, LAST_SHEET, XRAY_SHEET, cameraAt, cameraDistanceScale, diveDepth, narrowCentre, storyAt } from './camera';

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

describe('cameraAt', () => {
  it('sits exactly on a key at its own scroll position', () => {
    for (const key of CAMERA_KEYS) expect(cameraAt(key.at).position).toEqual(key.position);
  });
  it('starts and ends on the same view of the whole car', () => {
    expect(cameraAt(LAST_SHEET)).toEqual(cameraAt(0));
    expect(cameraAt(LAST_SHEET + 3)).toEqual(cameraAt(0));
  });
  it('moves between keys without overshooting', () => {
    const y = cameraAt(1.5).position[1];
    expect(y).toBeGreaterThan(3.3);
    expect(y).toBeLessThan(10.5);
  });
});

describe('storyAt', () => {
  it('is the scroll position itself when there is no X-ray sheet', () => {
    expect(storyAt(0.4, false)).toEqual({ sheet: 0.4, xray: 0 });
    expect(storyAt(6, false)).toEqual({ sheet: 6, xray: 0 });
  });
  it('holds the story on the opening sheet while the X-ray comes on', () => {
    expect(storyAt(0, true)).toEqual({ sheet: 0, xray: 0 });
    expect(storyAt(0.6, true).sheet).toBe(0);
    expect(storyAt(0.6, true).xray).toBeGreaterThan(0);
    expect(storyAt(XRAY_SHEET, true)).toEqual({ sheet: 0, xray: 1 });
  });
  it('has put the body back before the bonnet starts to lift', () => {
    const lifting = storyAt(XRAY_SHEET + 0.3, true);
    expect(lifting.xray).toBe(0);
    expect(diveDepth(lifting.sheet)).toBeLessThan(0.5);
  });
  it('counts every later sheet one earlier, so the last sheet is still the last', () => {
    expect(storyAt(XRAY_SHEET + 1, true)).toEqual({ sheet: 1, xray: 0 });
    expect(storyAt(LAST_SHEET + 1, true)).toEqual({ sheet: LAST_SHEET, xray: 0 });
  });
  it('never jumps', () => {
    for (let s = 0; s < 3; s += 0.01) {
      const [a, b] = [storyAt(s, true), storyAt(s + 0.01, true)];
      expect(Math.abs(b.sheet - a.sheet)).toBeLessThan(0.011);
      expect(Math.abs(b.xray - a.xray)).toBeLessThan(0.08);
    }
  });
});

describe('X-ray view', () => {
  it('leaves the usual camera alone until the X-ray comes on', () => {
    expect(cameraAt(0, 0)).toEqual(cameraAt(0));
  });
  it('looks at the car from its side and above', () => {
    const { position, target } = cameraAt(0, 1);
    expect(position[1]).toBeGreaterThan(cameraAt(0).position[1]);
    expect(Math.abs(position[0] - target[0])).toBeGreaterThan(Math.abs(position[2] - target[2]));
  });
  it('moves there gradually', () => {
    const y = cameraAt(0, 0.5).position[1];
    expect(y).toBeGreaterThan(cameraAt(0).position[1]);
    expect(y).toBeLessThan(cameraAt(0, 1).position[1]);
  });
});

describe('diveDepth', () => {
  it('is 0 with the whole car in view and 1 through the engine chapter', () => {
    expect(diveDepth(0)).toBe(0);
    expect(diveDepth(1)).toBe(1);
    expect(diveDepth(3.2)).toBe(1);
    expect(diveDepth(LAST_SHEET)).toBe(0);
  });
  it('goes in and comes back out at the same rate', () => {
    expect(diveDepth(0.25)).toBeCloseTo(diveDepth(LAST_SHEET - 0.25));
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
