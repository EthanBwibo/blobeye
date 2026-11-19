import { describe, expect, it } from 'vitest';
import { CAMERAS, CAMERA_NAMES, CHASE, type CameraMode, FAR_CHASE, MOUNTS, chaseFov, chaseView, mountFov, mountView, newChase, nextCamera, onBoard, readCamera, rigFor, stepChase } from './chase';
import type { CarState } from './handling';

const parked = (heading = 0): CarState => ({ x: 100, y: 50, heading, vx: 0, vy: 0 });

describe('the cameras', () => {
  it('go round close chase, far chase, bonnet and cockpit, and back', () => {
    expect(CAMERAS).toEqual(['close', 'far', 'bonnet', 'cockpit']);
    let mode: CameraMode = CAMERAS[0];
    const seen: CameraMode[] = [mode];
    for (let i = 0; i < CAMERAS.length; i++) seen.push((mode = nextCamera(mode)));
    expect(seen).toEqual(['close', 'far', 'bonnet', 'cockpit', 'close']);
    for (const camera of CAMERAS) expect(CAMERA_NAMES[camera]).toBeTruthy();
  });

  it('are read back from the device, and anything else is the close chase', () => {
    for (const camera of CAMERAS) expect(readCamera(camera)).toBe(camera);
    expect(readCamera(null)).toBe('close');
    expect(readCamera('helicopter')).toBe('close');
  });

  it('put the far chase further back and higher than the close one, seeing further up the road', () => {
    expect(rigFor('close')).toBe(CHASE);
    expect(rigFor('far')).toBe(FAR_CHASE);
    expect(FAR_CHASE.distance).toBeGreaterThan(CHASE.distance + 3);
    expect(FAR_CHASE.height).toBeGreaterThan(CHASE.height);
    expect(FAR_CHASE.lookAhead).toBeGreaterThan(CHASE.lookAhead);
    const car = parked();
    const [close, far] = [chaseView(newChase(car), car), chaseView(newChase(car, FAR_CHASE), car, FAR_CHASE)];
    expect(car.x - far.eye.x).toBeCloseTo(FAR_CHASE.distance);
    expect(far.eye.height).toBeGreaterThan(close.eye.height);
    // At speed it settles further back still, as the close one does.
    const moving = { ...car, vx: 30 };
    let chase = newChase(moving, FAR_CHASE);
    for (let i = 0; i < 600; i++) chase = stepChase(chase, moving, 1 / 120, FAR_CHASE);
    expect(chase.reach).toBeGreaterThan(FAR_CHASE.distance + 1);
  });

  it('only the bonnet and cockpit ride on the car', () => {
    expect(CAMERAS.filter(onBoard)).toEqual(['bonnet', 'cockpit']);
  });

  it('look straight down the nose from the bonnet, whichever way the car points', () => {
    for (const heading of [0, 1, -2.5]) {
      const car = parked(heading);
      const { eye, target } = mountView('bonnet', car);
      const way = Math.atan2(target.y - eye.y, target.x - eye.x);
      expect(Math.atan2(Math.sin(way - heading), Math.cos(way - heading))).toBeCloseTo(0);
      // Ahead of the middle of the car, on its centre line.
      expect((eye.x - car.x) * Math.cos(heading) + (eye.y - car.y) * Math.sin(heading)).toBeCloseTo(MOUNTS.bonnet.ahead);
      expect(eye.height).toBeCloseTo(MOUNTS.bonnet.up);
      expect(target.height).toBeLessThan(eye.height);
    }
  });

  it('sit the cockpit camera in the driver\u2019s seat, on the right, and ride with the car and its nose', () => {
    // Heading 0 is along +x; the car's right is then +y.
    const car = parked(0);
    const seat = mountView('cockpit', car).eye;
    expect(seat.y - car.y).toBeCloseTo(MOUNTS.cockpit.right);
    expect(MOUNTS.cockpit.right).toBeGreaterThan(0.2);
    expect(seat.x - car.x).toBeLessThan(0.1);
    // Up a crest it rises with the car; nose down, the view tips down.
    expect(mountView('cockpit', car, 1.3).eye.height).toBeCloseTo(MOUNTS.cockpit.up + 1.3);
    expect(mountView('cockpit', car, 0, 0.05).target.height).toBeLessThan(mountView('cockpit', car).target.height);
  });

  it('widen the lens on the car with speed, less than the chase camera does, and not for reduced motion', () => {
    expect(mountFov('cockpit', 0)).toBe(MOUNTS.cockpit.fov);
    expect(mountFov('cockpit', 40)).toBeGreaterThan(mountFov('cockpit', 0));
    expect(mountFov('bonnet', 40) - mountFov('bonnet', 0)).toBeLessThan(chaseFov(40) - chaseFov(0));
    expect(mountFov('bonnet', 40, true)).toBe(MOUNTS.bonnet.fov);
  });
});
