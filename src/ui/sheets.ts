/** A sheet on the page and its number in the story, which is what the camera follows. */
export interface Sheet {
  el: HTMLElement;
  index: number;
}

/**
 * The number each sheet has in the story. A sheet marked as an aside is a stop of its own, outside the
 * story: it is not counted, and takes the number of the sheet before it, so the story waits there.
 */
export function storyNumbers(asides: readonly boolean[]): number[] {
  let last = -1;
  return asides.map((aside) => (aside ? Math.max(0, last) : ++last));
}

/**
 * The sheets that are on the page. Every sheet shows at every screen size today, but one that is hidden
 * is left out and the rest keep their numbers, so the camera keys mean the same thing whatever is shown.
 * A sheet with `data-aside` is not numbered: see `storyNumbers`.
 */
export function visibleSheets(all: HTMLElement[]): Sheet[] {
  const numbers = storyNumbers(all.map((el) => el.hasAttribute('data-aside')));
  return all.map((el, i) => ({ el, index: numbers[i]! })).filter(({ el }) => getComputedStyle(el).display !== 'none');
}

/**
 * How far the scroll is from the top of one sheet, measured in sheets: 0 on it, -1 on the sheet before,
 * 1 on the sheet after. `tops` are the sheets on the page, top to bottom.
 */
export function offsetFrom(y: number, tops: readonly number[], i: number): number {
  const top = tops[i];
  if (top === undefined) return Infinity;
  const span = y < top ? top - (tops[i - 1] ?? top - 1) : (tops[i + 1] ?? top + 1) - top;
  return (y - top) / Math.max(1, span);
}

/**
 * The scroll position measured in sheets of the story. `stops` are the sheets on the page, top to
 * bottom. Where a sheet is left out, the scroll between its neighbours passes through its number.
 */
export function sheetAt(y: number, stops: readonly { top: number; index: number }[]): number {
  for (let i = stops.length - 1; i >= 0; i--) {
    const here = stops[i]!;
    if (y < here.top && i > 0) continue;
    const next = stops[i + 1];
    if (!next) return here.index;
    const within = Math.max(0, Math.min(1, (y - here.top) / Math.max(1, next.top - here.top)));
    return here.index + within * (next.index - here.index);
  }
  return 0;
}
