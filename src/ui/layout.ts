import { NARROW_WIDTH } from '../scene/camera';

/**
 * On phones the notes sit over the drawing, so each panel shows its headline and live readout
 * and keeps the rest behind a "More" button. Anything marked `.more` in the markup is the rest.
 * Wide screens show everything and never see the button (see the phone block in styles.css).
 */
export function initNotes(): void {
  document.querySelectorAll<HTMLElement>('.panel').forEach((panel, i) => {
    const body = panel.querySelector<HTMLElement>('.body');
    if (!body || !panel.querySelector('.more')) return;
    body.id ||= `notes-${i}`;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toggle';
    button.setAttribute('aria-controls', body.id);
    const set = (open: boolean) => {
      panel.classList.toggle('open', open);
      button.setAttribute('aria-expanded', String(open));
      button.textContent = open ? 'Less' : 'More';
    };
    button.addEventListener('click', () => set(!panel.classList.contains('open')));
    set(false);
    panel.classList.add('collapsible');
    panel.append(button);
  });
}

/** Keep `--dock-h` equal to the dock's real height, however its buttons wrap. */
export function trackDockHeight(onChange: () => void): void {
  const dock = document.getElementById('dock');
  if (!dock || typeof ResizeObserver === 'undefined') return;
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--dock-h', `${Math.ceil(dock.getBoundingClientRect().height)}px`);
    onChange();
  }).observe(dock);
}

/**
 * How much of the screen, from the top, is free of notes on the fullest sheet (0 to 1).
 * Panels the reader has opened are skipped: opening a note should not move the drawing.
 * Returns null on wide screens, where the notes sit beside the drawing.
 */
export function clearFraction(): number | null {
  if (window.innerWidth > NARROW_WIDTH) return null;
  let tallest = 0;
  for (const panel of document.querySelectorAll<HTMLElement>('.view > .panel:not(.open)')) {
    const view = panel.parentElement!;
    // From the panel's top edge to the bottom of its sheet, which rests on the bottom of the screen.
    tallest = Math.max(tallest, view.getBoundingClientRect().bottom - panel.getBoundingClientRect().top);
  }
  return tallest ? 1 - tallest / window.innerHeight : null;
}
