/**
 * Driving with a touch screen: steering pads on the left (a left half and a right half), throttle and
 * brake on the right, and steering by tilting the phone as an option.
 *
 * `tiltSteer` is a pure function. `createTouchPads` builds the pads on the game's screen. Part of the
 * game's chunk: nothing here may be imported by the main page.
 */

/** Tilting the phone this far, in degrees, is full lock. */
export const FULL_TILT = 24;
/** Tilts smaller than this, in degrees, are a steady hand, not a turn. */
export const STEADY = 2.5;

const DEG = Math.PI / 180;

/**
 * How far to steer for the way the phone is held, from -1 (full left) to 1 (full right). `beta` and
 * `gamma` are the phone's tilt as `deviceorientation` gives them, in degrees, and `screenAngle` is how far
 * the screen is turned from the phone's own upright, in degrees (`screen.orientation.angle`).
 *
 * It measures how far the screen's own left-to-right line leans from level, so it works the same with
 * the phone held upright like a wheel or tipped back towards flat: dip the right side to steer right.
 */
export function tiltSteer(beta: number, gamma: number, screenAngle: number): number {
  if (![beta, gamma, screenAngle].every(Number.isFinite)) return 0;
  const [b, g, a] = [beta * DEG, gamma * DEG, screenAngle * DEG];
  // Which way is up, in the phone's own terms: x to its right, y to its top, z out of the glass.
  const up = [-Math.cos(b) * Math.sin(g), Math.sin(b)] as const;
  // The screen's right, in the phone's own terms, once the picture is turned to suit the way it is held.
  const along = up[0] * Math.cos(a) - up[1] * Math.sin(a);
  const lean = -Math.asin(Math.max(-1, Math.min(1, along))) / DEG;
  if (Math.abs(lean) < STEADY) return 0;
  const past = Math.sign(lean) * (Math.abs(lean) - STEADY);
  return Math.max(-1, Math.min(1, past / (FULL_TILT - STEADY)));
}

/** What the pads are asking for, this moment. */
export interface TouchInput {
  /** -1, 0 or 1 from the pads. */
  steer: number;
  throttle: boolean;
  brake: boolean;
}

export interface TouchPads {
  read(): TouchInput;
  /** Hide the steering pads while the phone itself steers. */
  setTilt(on: boolean): void;
  /** Let go of everything: the game has lost the screen for a moment. */
  release(): void;
}

/**
 * The pads, on `root`. Each finger is held by the pad it landed on, so a thumb that slides off a pedal still
 * holds it; a thumb on the steering slides from one half to the other.
 */
export function createTouchPads(root: HTMLElement): TouchPads {
  const pads = document.createElement('div');
  pads.className = 'pads';
  pads.innerHTML = `
    <div class="steer" data-steer aria-hidden="true"><span>◀</span><span>▶</span></div>
    <div class="pedals" aria-hidden="true"><div class="pedal brake" data-pedal="brake">Brake</div><div class="pedal throttle" data-pedal="throttle">Go</div></div>`;
  root.append(pads);
  const steerPad = pads.querySelector<HTMLElement>('[data-steer]')!;
  const [left, right] = Array.from(steerPad.children) as HTMLElement[];

  /** Fingers on the steering pad and where across it each one is, and fingers on each pedal. */
  const steering = new Map<number, number>();
  const pedals = { throttle: new Set<number>(), brake: new Set<number>() };

  const sideOf = (e: PointerEvent): number => {
    const box = steerPad.getBoundingClientRect();
    return e.clientX < box.left + box.width / 2 ? -1 : 1;
  };
  const paint = (): void => {
    const sides = new Set(steering.values());
    left!.classList.toggle('on', sides.has(-1));
    right!.classList.toggle('on', sides.has(1));
    for (const el of pads.querySelectorAll<HTMLElement>('[data-pedal]')) el.classList.toggle('on', pedals[el.dataset.pedal as 'throttle' | 'brake'].size > 0);
  };

  const hold = (e: PointerEvent): void => {
    const target = e.target as HTMLElement;
    const pedal = target.closest<HTMLElement>('[data-pedal]')?.dataset.pedal as 'throttle' | 'brake' | undefined;
    const onSteer = target.closest('[data-steer]') !== null;
    if (!pedal && !onSteer) return;
    e.preventDefault();
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      /* the finger is still counted */
    }
    if (pedal) pedals[pedal].add(e.pointerId);
    else steering.set(e.pointerId, sideOf(e));
    paint();
  };
  const slide = (e: PointerEvent): void => {
    if (!steering.has(e.pointerId)) return;
    steering.set(e.pointerId, sideOf(e));
    paint();
  };
  const lift = (e: PointerEvent): void => {
    steering.delete(e.pointerId);
    pedals.throttle.delete(e.pointerId);
    pedals.brake.delete(e.pointerId);
    paint();
  };
  pads.addEventListener('pointerdown', hold);
  pads.addEventListener('pointermove', slide);
  pads.addEventListener('pointerup', lift);
  pads.addEventListener('pointercancel', lift);
  // A long press must not bring up a menu or select the words on the pedals.
  pads.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    read() {
      const sides = new Set(steering.values());
      return { steer: (sides.has(1) ? 1 : 0) - (sides.has(-1) ? 1 : 0), throttle: pedals.throttle.size > 0, brake: pedals.brake.size > 0 };
    },
    setTilt(on) {
      steerPad.hidden = on;
      if (on) steering.clear();
      paint();
    },
    release() {
      steering.clear();
      pedals.throttle.clear();
      pedals.brake.clear();
      paint();
    },
  };
}
