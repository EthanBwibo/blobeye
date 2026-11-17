import { describe, expect, it } from 'vitest';
import { CAMERA_KEYS, DRIVE_OFF_SHEET, HERITAGE_SHEET, LAST_SHEET, cameraAt, cameraDistanceScale, diveDepth, narrowCentre, xrayAmount } from './camera';

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
  it('shows the same view of the whole car at the start, the drive-off and the end', () => {
    expect(cameraAt(DRIVE_OFF_SHEET)).toEqual(cameraAt(0));
    expect(cameraAt(LAST_SHEET)).toEqual(cameraAt(0));
    expect(cameraAt(LAST_SHEET + 3)).toEqual(cameraAt(0));
  });
  it('has a key on every sheet, in scroll order', () => {
    const at = CAMERA_KEYS.map((k) => k.at);
    for (let sheet = 0; sheet <= LAST_SHEET; sheet++) expect(at).toContain(sheet);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });
  it('lifts the car clear of the timeline without moving the camera', () => {
    expect(cameraAt(HERITAGE_SHEET).position).toEqual(cameraAt(0).position);
    expect(cameraAt(HERITAGE_SHEET).target[1]).toBeLessThan(cameraAt(0).target[1]);
  });
  it('moves between keys without overshooting', () => {
    const y = cameraAt(1.5).position[1];
    expect(y).toBeGreaterThan(3.3);
    expect(y).toBeLessThan(10.5);
  });
});

describe('xrayAmount', () => {
  it('is off on the opening sheet and fully on at the X-ray sheet', () => {
    expect(xrayAmount(-1)).toBe(0);
    expect(xrayAmount(0)).toBe(1);
  });
  it('comes on part of the way down', () => {
    expect(xrayAmount(-0.9)).toBe(0);
    expect(xrayAmount(-0.4)).toBeGreaterThan(0);
    expect(xrayAmount(-0.4)).toBeLessThan(1);
  });
  it('has put the body back before the bonnet starts to lift', () => {
    // The story runs from sheet 0 to sheet 1 over the scroll after the X-ray sheet, and the bonnet lifts from a depth of 0.2.
    expect(xrayAmount(0.25)).toBe(0);
    expect(diveDepth(0.25)).toBeLessThan(0.5);
    expect(xrayAmount(0.2)).toBeLessThan(0.2);
  });
  it('is off everywhere else, and where there is no X-ray sheet', () => {
    for (const offset of [-5, 1, 3, Infinity, -Infinity]) expect(xrayAmount(offset)).toBe(0);
  });
  it('never jumps', () => {
    for (let o = -1; o < 1; o += 0.01) expect(Math.abs(xrayAmount(o + 0.01) - xrayAmount(o))).toBeLessThan(0.08);
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
    expect(diveDepth(HERITAGE_SHEET)).toBe(0);
    expect(diveDepth(DRIVE_OFF_SHEET)).toBe(0);
    expect(diveDepth(LAST_SHEET)).toBe(0);
  });
  it('goes in and comes back out at the same rate', () => {
    expect(diveDepth(0.25)).toBeCloseTo(diveDepth(HERITAGE_SHEET - 0.25));
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
