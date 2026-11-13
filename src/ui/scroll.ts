import Lenis from 'lenis';
import Snap from 'lenis/snap';
import 'lenis/dist/lenis.css';
import { NARROW_WIDTH } from '../scene/camera';

export interface SheetScroll {
  /** Stop the page scrolling, for example while the intro is up. */
  lock(): void;
  unlock(): void;
}

/** Which sheet a key press should move to, or null if the key is not a paging key. */
export function pageTarget(key: string, shift: boolean, current: number, count: number): number | null {
  const last = count - 1;
  const clamp = (n: number) => Math.min(last, Math.max(0, n));
  switch (key) {
    case 'PageDown':
    case 'ArrowDown':
      return clamp(current + 1);
    case 'PageUp':
    case 'ArrowUp':
      return clamp(current - 1);
    case ' ':
      return clamp(current + (shift ? -1 : 1));
    case 'Home':
      return 0;
    case 'End':
      return last;
    default:
      return null;
  }
}

/**
 * Smooth scrolling that settles on each sheet, plus keyboard paging one sheet at a time.
 * With reduced motion there is no gliding: the page scrolls natively and keys jump straight to a sheet.
 */
export function initScroll(sheets: HTMLElement[], reducedMotion: boolean): SheetScroll {
  const root = document.documentElement;
  let locked = false;
  let lenis: Lenis | null = null;

  if (!reducedMotion) {
    lenis = new Lenis({ autoRaf: true, lerp: 0.09 });
    // On phones a sheet can be taller than the screen once its notes are open, so only snap on wide screens.
    if (window.innerWidth > NARROW_WIDTH) {
      const snap = new Snap(lenis, { type: 'proximity', distanceThreshold: '50%', duration: 0.9, debounce: 250 });
      snap.addElements(sheets, { align: ['start'] });
    }
  }

  /** The sheet the page is on, or heading for if a glide is under way. */
  const currentIndex = (): number => {
    const y = lenis ? lenis.targetScroll : window.scrollY;
    let best = 0;
    sheets.forEach((sheet, i) => {
      if (Math.abs(sheet.offsetTop - y) < Math.abs(sheets[best]!.offsetTop - y)) best = i;
    });
    return best;
  };

  const goTo = (index: number): void => {
    const top = sheets[index]!.offsetTop;
    if (lenis) lenis.scrollTo(top, { duration: 1.1 });
    else window.scrollTo({ top, behavior: 'instant' });
  };

  window.addEventListener('keydown', (e) => {
    if (locked || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
    // Leave keys alone when a control has focus: space presses a button, arrows move inside inputs.
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, a, input, select, textarea, [contenteditable]')) return;
    const index = pageTarget(e.key, e.shiftKey, currentIndex(), sheets.length);
    if (index === null) return;
    e.preventDefault();
    goTo(index);
  });

  return {
    lock() {
      locked = true;
      root.classList.add('locked');
      lenis?.stop();
    },
    unlock() {
      locked = false;
      root.classList.remove('locked');
      lenis?.start();
    },
  };
}
