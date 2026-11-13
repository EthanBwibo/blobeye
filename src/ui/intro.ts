import type { SheetScroll } from './scroll';

/** How long the intro takes to fade out. Keep in step with `#intro` in styles.css. */
const FADE_MS = 700;

/**
 * The title card. It holds the page still until the visitor picks "with sound" or "without sound",
 * then fades into sheet 1. The click doubles as the gesture browsers need before audio can start.
 */
export function initIntro(scroll: SheetScroll, reducedMotion: boolean, onEnter: (withSound: boolean) => void): void {
  const intro = document.getElementById('intro');
  if (!intro) return;
  // Everything behind the card is out of reach until it goes.
  const behind = [document.querySelector('main'), document.getElementById('dock')].filter((el) => el !== null);

  history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  scroll.lock();
  for (const el of behind) el.inert = true;
  intro.querySelector<HTMLButtonElement>('button')?.focus();

  const enter = (withSound: boolean): void => {
    for (const el of behind) el.inert = false;
    onEnter(withSound);
    scroll.unlock();
    // Drop focus so the paging keys work straight away.
    (document.activeElement as HTMLElement | null)?.blur();

    if (reducedMotion) {
      intro.remove();
      return;
    }
    intro.classList.add('leaving');
    window.setTimeout(() => intro.remove(), FADE_MS + 50);
  };

  document.getElementById('enterSound')?.addEventListener('click', () => enter(true), { once: true });
  document.getElementById('enterQuiet')?.addEventListener('click', () => enter(false), { once: true });
}
