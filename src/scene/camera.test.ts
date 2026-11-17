import { describe, expect, it } from 'vitest';
import { CAMERA_KEYS, DRIVE_OFF_SHEET, HERITAGE_SHEET, LAST_SHEET, cameraAt, cameraDistanceScale, diveDepth, narrowCentre } from './camera';

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
