/**
 * The stage's top ten: a name and a time. The rules are pure functions; `Board` is where the times are kept.
 *
 * Today the times stay on the device. The shared board plugs in at `openBoard`, at the bottom of this file.
 */

export interface Entry {
  name: string;
  /** Seconds. */
  time: number;
}

export const BOARD_SIZE = 10;
export const NAME_LENGTH = 12;
export const DEFAULT_NAME = 'Driver';

const BOARD_KEY = 'blobeye.rally.top';
/** Before there was a board, only the best time was kept, under this key. It becomes the first entry. */
const OLD_BEST_KEY = 'blobeye.rally.best';

const validTime = (time: unknown): time is number => typeof time === 'number' && Number.isFinite(time) && time > 0;

/** A name fit to show: one line, no stray spaces, not too long, never empty. */
export function cleanName(raw: string): string {
  const name = Array.from(raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, NAME_LENGTH).join('').trim();
  return name || DEFAULT_NAME;
}

/** Where a time would land on the board, counting from 0, or null if it misses the top ten. An equal time goes below the one already there. */
export function placeOf(entries: readonly Entry[], time: number): number | null {
  if (!validTime(time)) return null;
  const place = entries.filter((e) => e.time <= time).length;
  return place < BOARD_SIZE ? place : null;
}

/** The board with one more time on it: fastest first, ten at most. Returns a new list. */
export function addEntry(entries: readonly Entry[], entry: Entry): Entry[] {
  const place = placeOf(entries, entry.time);
  if (place === null) return entries.slice(0, BOARD_SIZE);
  const kept = { name: cleanName(entry.name), time: entry.time };
  return [...entries.slice(0, place), kept, ...entries.slice(place)].slice(0, BOARD_SIZE);
}

/** Read a stored board. Anything that is not a name and a time is dropped, so a damaged board is an empty one. */
export function parseBoard(text: string | null): Entry[] {
  if (!text) return [];
  let rows: unknown;
  try {
    rows = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  let board: Entry[] = [];
  for (const row of rows as { name?: unknown; time?: unknown }[]) {
    if (row && typeof row.name === 'string' && validTime(row.time)) board = addEntry(board, { name: row.name, time: row.time });
  }
  return board;
}

/** Where the times are kept. The game only ever talks to this, so one board can take another's place. */
export interface Board {
  /** Whose times these are, for the heading above the list. */
  readonly scope: string;
  /** The top ten, fastest first. */
  top(): Promise<Entry[]>;
  /** Record a time, and get the top ten as it now stands. */
  add(entry: Entry): Promise<Entry[]>;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** A board kept on this device. Without storage (a private window may refuse it) it lasts for the visit. */
export function deviceBoard(store: Store | null): Board {
  let entries: Entry[] | null = null;
  const read = (): Entry[] => {
    if (entries) return entries;
    try {
      entries = parseBoard(store?.getItem(BOARD_KEY) ?? null);
      const oldBest = Number(store?.getItem(OLD_BEST_KEY));
      if (!entries.length && validTime(oldBest)) entries = [{ name: DEFAULT_NAME, time: oldBest }];
    } catch {
      entries = [];
    }
    return entries;
  };
  return {
    scope: 'this device',
    top: async () => read().slice(),
    async add(entry) {
      entries = addEntry(read(), entry);
      try {
        store?.setItem(BOARD_KEY, JSON.stringify(entries));
      } catch {
        /* the board still stands for this visit */
      }
      return entries.slice();
    },
  };
}

/**
 * The board the game uses.
 *
 * HOOK FOR THE SHARED BOARD. To share times between visitors, write a `sharedBoard(url, key): Board` beside
 * `deviceBoard` and return it from here when the project's details are set, for example
 * `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_KEY` (the public key). It needs:
 *   - `scope`: 'everyone'
 *   - `top()`: the ten fastest rows of a `stage_times` table (`name` text, `time` numeric), fastest first
 *   - `add()`: insert one row, then `top()` again
 * Nothing else in the game changes. Three things the shared version must take care of:
 *   - the public key may only read and insert, never change or delete (row level security);
 *   - names and times come from strangers: pass them through `cleanName` and `parseBoard`, and have the
 *     database refuse times no car could set;
 *   - when the network fails, fall back to `deviceBoard` so a time is never lost.
 */
export function openBoard(): Board {
  let store: Store | null = null;
  try {
    store = window.localStorage;
  } catch {
    /* storage is switched off */
  }
  return deviceBoard(store);
}
