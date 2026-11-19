/**
 * Each stage's top ten: a name and a time. The rules are pure functions; `Board` is where the times are kept.
 *
 * `sharedBoard` is the one everyone sees, in a Supabase table. `deviceBoard` is the one on this device,
 * which the shared board falls back to. `openBoard`, at the bottom of this file, picks between them.
 */

import { replayFits } from './ghost';

export interface Entry {
  name: string;
  /** Seconds. */
  time: number;
}

export const BOARD_SIZE = 10;
export const NAME_LENGTH = 12;
export const DEFAULT_NAME = 'Driver';

const BOARD_KEY = 'blobeye.rally.top';
/** The stage the times are for, as the shared table names it, when no other is given: Naivasha, the first. */
export const STAGE_ID = 'naivasha';

/** Where a stage's board is kept on this device. Naivasha's keeps the key it had before there were other stages. */
export function boardKey(stage: string): string {
  return stage === STAGE_ID ? BOARD_KEY : `${BOARD_KEY}.${stage}`;
}
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
  /** Record a time, and get the top ten as it now stands. A shared board also sends the run's replay, if it has one. */
  add(entry: Run): Promise<Entry[]>;
  /**
   * The fastest run on the board that has a replay, with its replay: the stage record, for the ghost. Only a
   * shared board has one. Read only when asked, as replays are large. Null if there is none yet; it throws
   * if the board cannot be reached.
   */
  record?(): Promise<Run | null>;
}

/** A time on the board with the run's replay, packed by `packReplay` in `ghost.ts`. */
export interface Run extends Entry {
  replay?: string;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** A stage's board kept on this device. Without storage (a private window may refuse it) it lasts for the visit. */
export function deviceBoard(store: Store | null, stage: string = STAGE_ID): Board {
  const key = boardKey(stage);
  let entries: Entry[] | null = null;
  const read = (): Entry[] => {
    if (entries) return entries;
    try {
      entries = parseBoard(store?.getItem(key) ?? null);
      const oldBest = stage === STAGE_ID ? Number(store?.getItem(OLD_BEST_KEY)) : NaN;
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
        store?.setItem(key, JSON.stringify(entries));
      } catch {
        /* the board still stands for this visit */
      }
      return entries.slice();
    },
  };
}

/**
 * The season the shared board is in. Every time sent carries it, and every read (the top ten, the medal
 * benchmark that comes with it, and the stage-record ghost) asks for this season's times only. The table's
 * `season` column defaults to 1, the times set before seasons began. A new season is a new number here.
 */
export const SEASON = 2;

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
 * The table is `rally_times`: `name`, `time_ms`, `stage`, `season`, `created_at`, and `replay`, the run packed
 * for the ghost (empty for older times). Only this `SEASON`'s times are read, and every time sent is marked
 * with it. The key may read and insert, nothing else. The top ten never reads `replay`.
 *
 * Each stage's times are kept apart by the table's `stage` column: this board reads and writes `stage`'s.
 * Every time also goes on `device`, the board on this device, so it is never lost. Whenever the shared
 * board cannot be reached (or will not take the time), the device's own times are shown instead, and
 * `scope` says so.
 */
export function sharedBoard(url: string, key: string, device: Board, send: Send = (to, init) => fetch(to, init), stage: string = STAGE_ID): Board {
  const table = `${url.replace(/\/+$/, '')}/rest/v1/rally_times`;
  const ours = `stage=eq.${encodeURIComponent(stage)}&season=eq.${SEASON}`;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const waiting = (): { signal?: AbortSignal } => (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? { signal: AbortSignal.timeout(PATIENCE) } : {});
  let reached = true;

  const read = async (): Promise<Entry[]> => {
    const query = `select=name,time_ms&${ours}&order=time_ms.asc,created_at.asc&limit=${BOARD_SIZE}`;
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
        // A replay the table would refuse would cost the time as well: it is left off instead.
        const replay = entry.replay !== undefined && replayFits(entry.replay, time_ms) ? { replay: entry.replay } : {};
        const answer = await send(table, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ name: kept.name, time_ms, stage, season: SEASON, ...replay }),
          ...waiting(),
        });
        if (!answer.ok) throw new Error(`The shared board answered ${answer.status}`);
        const entries = await read();
        reached = true;
        return entries;
      } catch (error) {
        console.error('Could not send the time to the shared board:', error);
        reached = false;
        return own;
      }
    },
    async record() {
      const query = `select=name,time_ms,replay&${ours}&replay=not.is.null&order=time_ms.asc,created_at.asc&limit=1`;
      const answer = await send(`${table}?${query}`, { headers, ...waiting() });
      if (!answer.ok) throw new Error(`The shared board answered ${answer.status}`);
      const rows = (await answer.json()) as unknown;
      const row = Array.isArray(rows) ? (rows[0] as { replay?: unknown } | undefined) : undefined;
      const [entry] = rowsToEntries(row ? [row] : []);
      // It comes from a stranger: only a possible time with a replay that fits it.
      if (!entry || typeof row!.replay !== 'string' || !replayFits(row!.replay, Math.round(entry.time * 1000))) return null;
      return { ...entry, replay: row!.replay };
    },
  };
}

/**
 * The live project, used when `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` are not set (the deployed site
 * has none). Both are public: the key is the publishable one, and the table allows reading and inserting only.
 */
const FALLBACK_SUPABASE_URL = 'https://eyiycddbwzoduzscibwg.supabase.co';
const FALLBACK_SUPABASE_KEY = 'sb_publishable_nWfrq9HCgmA0dbgFqmzBBQ_8JPTTUSI';

/**
 * The board the game uses for a stage: the shared one, at the project named by `VITE_SUPABASE_URL` and
 * `VITE_SUPABASE_KEY` in `.env` (see `.env.example`) or else the live project above.
 */
export function openBoard(stage: string = STAGE_ID): Board {
  let store: Store | null = null;
  try {
    store = window.localStorage;
  } catch {
    /* storage is switched off */
  }
  const device = deviceBoard(store, stage);
  const url = import.meta.env.VITE_SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_KEY || FALLBACK_SUPABASE_KEY;
  return sharedBoard(url, key, device, undefined, stage);
}
