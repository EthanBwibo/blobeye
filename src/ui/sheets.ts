/** A sheet on the page and its number in the story, which is what the camera follows. */
export interface Sheet {
  el: HTMLElement;
  index: number;
}

/**
 * The sheets that are on the page at this screen size. Some are left out on phones (`.laptop` in
 * styles.css); each one keeps its number, so the camera keys mean the same thing at every size.
 */
export function visibleSheets(all: HTMLElement[]): Sheet[] {
  return all.map((el, index) => ({ el, index })).filter(({ el }) => getComputedStyle(el).display !== 'none');
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
