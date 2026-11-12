import { CYLINDERS, arrivalAngle, pulseGaps, type EngineState, type HeaderMode } from '../engine/model';

const byId = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

export interface ControlHandlers {
  onHeaders(mode: HeaderMode): void;
  /** Return false if sound could not start. */
  onEngineToggle(running: boolean): boolean;
}

/** Wire up the dock: start/stop, header switch and hold-to-rev. */
export function bindControls(state: EngineState, handlers: ControlHandlers): void {
  const unequalBtn = byId<HTMLButtonElement>('hUneq');
  const equalBtn = byId<HTMLButtonElement>('hEq');
  const revBtn = byId<HTMLButtonElement>('rev');
  const soundBtn = byId<HTMLButtonElement>('sound');

  const setHeaders = (mode: HeaderMode) => {
    state.mode = mode;
    unequalBtn.setAttribute('aria-pressed', String(mode === 'unequal'));
    equalBtn.setAttribute('aria-pressed', String(mode === 'equal'));
    layoutTimeline(mode);
    handlers.onHeaders(mode);
  };
  unequalBtn.addEventListener('click', () => setHeaders('unequal'));
  equalBtn.addEventListener('click', () => setHeaders('equal'));

  const throttle = (on: boolean) => {
    state.throttle = on;
    revBtn.classList.toggle('down', on);
  };
  revBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try {
      revBtn.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety, not a requirement */
    }
    throttle(true);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur'] as const) {
    revBtn.addEventListener(type, () => throttle(false));
  }
  revBtn.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      throttle(true);
    }
  });
  revBtn.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') throttle(false);
  });
  revBtn.addEventListener('contextmenu', (e) => e.preventDefault());

  soundBtn.addEventListener('click', () => {
    const next = !state.running;
    if (!handlers.onEngineToggle(next)) {
      soundBtn.textContent = 'No audio on this device';
      soundBtn.disabled = true;
      return;
    }
    state.running = next;
    soundBtn.setAttribute('aria-pressed', String(next));
    soundBtn.textContent = next ? 'Engine on · mute' : 'Start engine';
  });

  layoutTimeline(state.mode);
}

/** Position the four pulse marks on the arrival timeline and print the gaps. */
function layoutTimeline(mode: HeaderMode): void {
  for (const c of CYLINDERS) {
    byId(`k${c.n}`).style.left = `${(arrivalAngle(c, mode) / 720) * 100}%`;
  }
  byId('gaps').textContent = `Gaps between pulses: ${pulseGaps(mode)
    .map((g) => `${g}°`)
    .join(' · ')}`;
}
