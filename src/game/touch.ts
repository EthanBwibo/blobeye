/**
 * Driving with a touch screen: a steering wheel bottom left that is dragged left and right and springs
 * back to centre, and bottom right a handbrake lever, a brake pedal and a throttle pedal. Steering by
 * tilting the phone is an option. Gear changes and knocks give a short buzz where the phone can.
 *
 * `tiltSteer`, `wheelSteer` and `buzzFor` are pure functions. `createTouchPads` builds the controls on the
 * game's screen. Part of the game's chunk: nothing here may be imported by the main page.
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

/** Turning the wheel to full lock, as it is drawn, in degrees. */
export const WHEEL_LOCK = 110;
/** Dragging this share of the wheel's width is full lock. */
export const WHEEL_REACH = 0.55;

/** How far to steer for a finger dragged `dx` pixels across a wheel `width` pixels wide: -1 to 1. */
export function wheelSteer(dx: number, width: number): number {
  if (!Number.isFinite(dx) || !(width > 0)) return 0;
  return Math.max(-1, Math.min(1, dx / (width * WHEEL_REACH)));
}

/** How long a buzz is, in milliseconds, for each thing worth feeling. */
export const BUZZ = { gear: 12, knock: 40, land: 25, rattle: 8, rumble: 6 } as const;

/**
 * How long to buzz, in milliseconds, for what just happened to the car: a knock on a rock or a zebra, a
 * landing, or a change of gear (going into or out of reverse does not count). 0 for nothing.
 */
export function buzzFor(event: string | null, gearBefore: number | 'R', gearAfter: number | 'R'): number {
  if (event === 'knock') return BUZZ.knock;
  if (event === 'land') return BUZZ.land;
  if (event === 'rattle') return BUZZ.rattle;
  if (event === 'rumble') return BUZZ.rumble;
  return typeof gearBefore === 'number' && typeof gearAfter === 'number' && gearBefore !== gearAfter ? BUZZ.gear : 0;
}

/** What the controls are asking for, this moment. */
export interface TouchInput {
  /** -1 (full left) to 1 (full right), from the wheel. */
  steer: number;
  throttle: boolean;
  brake: boolean;
  handbrake: boolean;
}

export interface TouchPads {
  read(): TouchInput;
  /** Hide the wheel while the phone itself steers. */
  setTilt(on: boolean): void;
  /** Let go of everything: the game has lost the screen for a moment. */
  release(): void;
}

type Pedal = 'throttle' | 'brake' | 'handbrake';

const WHEEL_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <circle class="rim" cx="50" cy="50" r="43"/>
  <path class="spokes" d="M9 54Q30 60 38 58M91 54Q70 60 62 58M50 62V91"/>
  <circle class="hub" cx="50" cy="56" r="13"/>
  <path class="mark" d="M50 7v9"/>
</svg>`;
const LEVER_SVG = `<svg viewBox="0 0 40 120" aria-hidden="true">
  <rect class="boot" x="6" y="96" width="28" height="20" rx="4"/>
  <g class="arm"><rect class="rod" x="15" y="18" width="10" height="84" rx="5"/><rect class="grip" x="12" y="8" width="16" height="38" rx="7"/><circle class="button" cx="20" cy="10" r="4"/></g>
</svg>`;

/**
 * The controls, on `root`. Each finger is held by the control it landed on, so a thumb that slides off a
 * pedal still holds it down, and a thumb on the wheel keeps turning it wherever it goes.
 */
export function createTouchPads(root: HTMLElement): TouchPads {
  const pads = document.createElement('div');
  pads.className = 'pads';
  pads.innerHTML = `
    <div class="wheel" data-wheel aria-hidden="true">${WHEEL_SVG}</div>
    <div class="pedals" aria-hidden="true">
      <div class="handbrake" data-pedal="handbrake">${LEVER_SVG}</div>
      <div class="pedal brake" data-pedal="brake"><i></i></div>
      <div class="pedal throttle" data-pedal="throttle"><i></i></div>
    </div>`;
  root.append(pads);
  const wheel = pads.querySelector<HTMLElement>('[data-wheel]')!;
  const drawn = wheel.querySelector('svg')!;

  /** The finger on the wheel and where a straight wheel would be under it, the wheel's turn, and the fingers on each pedal. */
  let grip: { id: number; from: number } | null = null;
  let turn = 0;
  const held: Record<Pedal, Set<number>> = { throttle: new Set(), brake: new Set(), handbrake: new Set() };

  const paint = (): void => {
    wheel.classList.toggle('on', grip !== null);
    drawn.style.transform = `rotate(${(turn * WHEEL_LOCK).toFixed(1)}deg)`;
    for (const el of pads.querySelectorAll<HTMLElement>('[data-pedal]')) el.classList.toggle('on', held[el.dataset.pedal as Pedal].size > 0);
  };
  /** Let go, the wheel springs back to the middle (the spring is drawn in rally.css). */
  const letGoOfWheel = (): void => {
    grip = null;
    turn = 0;
  };

  const hold = (e: PointerEvent): void => {
    const target = e.target as Element;
    const pedal = target.closest<HTMLElement>('[data-pedal]')?.dataset.pedal as Pedal | undefined;
    const onWheel = target.closest('[data-wheel]') !== null && !wheel.hidden;
    if (!pedal && !onWheel) return;
    e.preventDefault();
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      /* the finger is still counted */
    }
    if (pedal) held[pedal].add(e.pointerId);
    // A second thumb on the wheel takes it over from where it stands.
    else grip = { id: e.pointerId, from: e.clientX - turn * wheel.getBoundingClientRect().width * WHEEL_REACH };
    paint();
  };
  const slide = (e: PointerEvent): void => {
    if (grip?.id !== e.pointerId) return;
    turn = wheelSteer(e.clientX - grip.from, wheel.getBoundingClientRect().width);
    paint();
  };
  const lift = (e: PointerEvent): void => {
    if (grip?.id === e.pointerId) letGoOfWheel();
    for (const fingers of Object.values(held)) fingers.delete(e.pointerId);
    paint();
  };
  pads.addEventListener('pointerdown', hold);
  pads.addEventListener('pointermove', slide);
  pads.addEventListener('pointerup', lift);
  pads.addEventListener('pointercancel', lift);
  // A long press must not bring up a menu.
  pads.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    read() {
      return { steer: turn, throttle: held.throttle.size > 0, brake: held.brake.size > 0, handbrake: held.handbrake.size > 0 };
    },
    setTilt(on) {
      wheel.hidden = on;
      if (on) letGoOfWheel();
      paint();
    },
    release() {
      letGoOfWheel();
      for (const fingers of Object.values(held)) fingers.clear();
      paint();
    },
  };
}

/** A short buzz, where the phone can. Some browsers have no vibration at all, and some refuse it until a tap. */
export function buzz(ms: number): void {
  if (ms <= 0 || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(ms);
  } catch {
    /* no buzz, then */
  }
}
