/**
 * The stage's top ten: a name and a time. The rules are pure functions; `Board` is where the times are kept.
 *
 * `sharedBoard` is the one everyone sees, in a Supabase table. `deviceBoard` is the one on this device,
 * which the shared board falls back to. `openBoard`, at the bottom of this file, picks between them.
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

/**
 * A name fit to show and to send: 1 to 12 letters, digits, spaces, _ or -, which is all the shared table
 * takes. Accents are dropped from letters, anything else is left out, and an empty name gets a stand-in.
 */
export function cleanName(raw: string): string {
  const plain = raw.normalize('NFKD').replace(/\s+/g, ' ').replace(/[^A-Za-z0-9 _-]/g, '');
  return plain.replace(/ +/g, ' ').trim().slice(0, NAME_LENGTH).trim() || DEFAULT_NAME;
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
  /** Whose times these are, for the heading above the list. It can change: a shared board says when it has fallen back. */
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

/** The stage the times are for, as the shared table names it. */
export const STAGE_ID = 'naivasha';
/** The shared table refuses times outside these, in seconds: no car could set a quicker one, and nobody waits for a slower. */
export const SHARED_TIMES = { least: 20, most: 600 } as const;
/** How long to wait for the shared board before falling back, in milliseconds. */
const PATIENCE = 6000;

/** Rows from the shared table as entries. They come from strangers: anything that is not a name and a possible time is dropped. */
export function rowsToEntries(rows: unknown): Entry[] {
  if (!Array.isArray(rows)) return [];
  let board: Entry[] = [];
  for (const row of rows as ({ name?: unknown; time_ms?: unknown } | null)[]) {
    if (!row || typeof row.name !== 'string' || typeof row.time_ms !== 'number' || !Number.isInteger(row.time_ms)) continue;
    const time = row.time_ms / 1000;
    if (time >= SHARED_TIMES.least && time <= SHARED_TIMES.most) board = addEntry(board, { name: row.name, time });
  }
  return board;
}

type Send = (url: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

/**
 * A board shared by everyone, kept in a Supabase table and reached over its REST API with the public key.
 * The table is `rally_times`: `name`, `time_ms`, `stage`, `created_at`. The key may read and insert, nothing else.
 *
 * Every time also goes on `device`, the board on this device, so it is never lost. Whenever the shared
 * board cannot be reached (or will not take the time), the device's own times are shown instead, and
 * `scope` says so.
 */
export function sharedBoard(url: string, key: string, device: Board, send: Send = (to, init) => fetch(to, init)): Board {
  const table = `${url.replace(/\/+$/, '')}/rest/v1/rally_times`;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const waiting = (): { signal?: AbortSignal } => (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? { signal: AbortSignal.timeout(PATIENCE) } : {});
  let reached = true;

  const read = async (): Promise<Entry[]> => {
    const query = `select=name,time_ms&stage=eq.${STAGE_ID}&order=time_ms.asc,created_at.asc&limit=${BOARD_SIZE}`;
    const answer = await send(`${table}?${query}`, { headers, ...waiting() });
    if (!answer.ok) throw new Error(`The shared board answered ${answer.status}`);
    return rowsToEntries(await answer.json());
  };

  return {
    get scope() {
      return reached ? 'everyone' : device.scope;
    },
    async top() {
      try {
        const entries = await read();
        reached = true;
        return entries;
      } catch {
        reached = false;
        return device.top();
      }
    },
    async add(entry) {
      const kept = { name: cleanName(entry.name), time: entry.time };
      const own = await device.add(kept);
      try {
        const time_ms = Math.round(kept.time * 1000);
        if (!(time_ms >= SHARED_TIMES.least * 1000 && time_ms <= SHARED_TIMES.most * 1000)) throw new Error('Not a time the shared board takes');
        const answer = await send(table, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ name: kept.name, time_ms, stage: STAGE_ID }),
          ...waiting(),
        });
        if (!answer.ok) throw new Error(`The shared board answered ${answer.status}`);
        const entries = await read();
        reached = true;
        return entries;
      } catch {
        reached = false;
        return own;
      }
    },
  };
}

/**
 * The board the game uses: the shared one when the project's details are set (`VITE_SUPABASE_URL` and
 * `VITE_SUPABASE_KEY` in `.env`, see `.env.example`), and the one on this device otherwise.
 */
export function openBoard(): Board {
  let store: Store | null = null;
  try {
    store = window.localStorage;
  } catch {
    /* storage is switched off */
  }
  const device = deviceBoard(store);
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_KEY;
  return url && key ? sharedBoard(url, key, device) : device;
}
