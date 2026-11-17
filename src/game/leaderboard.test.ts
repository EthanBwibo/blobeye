import { describe, expect, it } from 'vitest';
import { BOARD_SIZE, DEFAULT_NAME, NAME_LENGTH, STAGE_ID, addEntry, cleanName, deviceBoard, parseBoard, placeOf, rowsToEntries, sharedBoard, type Entry } from './leaderboard';

const full: Entry[] = Array.from({ length: BOARD_SIZE }, (_, i) => ({ name: `D${i}`, time: 60 + i }));

/** A stand-in for the browser's storage. */
function fakeStore(start: Record<string, string> = {}) {
  const kept = new Map(Object.entries(start));
  return { getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => void kept.set(key, value), kept };
}

describe('cleanName', () => {
  it('trims, joins up spaces and drops line breaks', () => {
    expect(cleanName('  Petter \n  S ')).toBe('Petter S');
  });
  it('cuts a long name short', () => {
    expect(cleanName('x'.repeat(40))).toHaveLength(NAME_LENGTH);
  });
  it('gives an empty name a stand-in', () => {
    expect(cleanName('   ')).toBe(DEFAULT_NAME);
    expect(cleanName('<<>>')).toBe(DEFAULT_NAME);
  });
  it('keeps only what the shared table takes: letters, digits, spaces, _ and -', () => {
    expect(cleanName('Zoë <b>')).toBe('Zoe b');
    expect(cleanName('McRae_95-x')).toBe('McRae_95-x');
    expect(cleanName('a  ;DROP TABLE  b')).toBe('a DROP TABLE');
    for (const raw of ['  Petter \n  S ', 'x'.repeat(40), '', '日本語', 'tab\tbed', "O'Neil", 'eleven char  s']) {
      expect(cleanName(raw)).toMatch(/^[A-Za-z0-9 _-]{1,12}$/);
      expect(cleanName(raw)).toBe(cleanName(raw).trim());
    }
  });
});

describe('placeOf', () => {
  it('puts the first time at the top of an empty board', () => {
    expect(placeOf([], 70)).toBe(0);
  });
  it('finds the place between a faster and a slower time', () => {
    expect(placeOf(full, 62.5)).toBe(3);
  });
  it('puts an equal time below the one already there', () => {
    expect(placeOf(full, 60)).toBe(1);
  });
  it('turns away a time slower than the tenth', () => {
    expect(placeOf(full, 69.5)).toBeNull();
    expect(placeOf(full.slice(0, 9), 500)).toBe(9);
  });
  it('turns away times that are not times', () => {
    for (const time of [0, -3, NaN, Infinity]) expect(placeOf([], time)).toBeNull();
  });
});

describe('addEntry', () => {
  it('keeps the board fastest first and ten long, dropping the slowest', () => {
    const board = addEntry(full, { name: 'New', time: 58 });
    expect(board).toHaveLength(BOARD_SIZE);
    expect(board[0]).toEqual({ name: 'New', time: 58 });
    expect(board.map((e) => e.time)).toEqual([...board.map((e) => e.time)].sort((a, b) => a - b));
    expect(board.some((e) => e.name === 'D9')).toBe(false);
  });
  it('leaves the board as it was for a time that misses', () => {
    expect(addEntry(full, { name: 'Slow', time: 99 })).toEqual(full);
  });
  it('does not change the list it was given', () => {
    const before = full.slice();
    addEntry(full, { name: 'New', time: 58 });
    expect(full).toEqual(before);
  });
  it('tidies the name', () => {
    expect(addEntry([], { name: '  ', time: 61 })[0]!.name).toBe(DEFAULT_NAME);
  });
});

describe('parseBoard', () => {
  it('reads back what was stored', () => {
    expect(parseBoard(JSON.stringify(full))).toEqual(full);
  });
  it('treats nothing, nonsense and the wrong shape as an empty board', () => {
    for (const text of [null, '', 'not json', '{"name":"x"}', '42']) expect(parseBoard(text)).toEqual([]);
  });
  it('drops bad rows, sorts the rest and stops at ten', () => {
    const rows = [{ name: 'B', time: 70 }, { name: 'A', time: 65 }, { name: 7, time: 60 }, { name: 'C', time: -1 }, null, { name: 'D' }];
    expect(parseBoard(JSON.stringify(rows))).toEqual([{ name: 'A', time: 65 }, { name: 'B', time: 70 }]);
    expect(parseBoard(JSON.stringify([...full, ...full]))).toHaveLength(BOARD_SIZE);
  });
});

describe('deviceBoard', () => {
  it('starts empty and remembers a time', async () => {
    const store = fakeStore();
    expect(await deviceBoard(store).top()).toEqual([]);
    await deviceBoard(store).add({ name: 'Ethan', time: 63.21 });
    // A new board over the same storage is the next visit.
    expect(await deviceBoard(store).top()).toEqual([{ name: 'Ethan', time: 63.21 }]);
  });
  it('carries over the best time kept before there was a board', async () => {
    const board = deviceBoard(fakeStore({ 'blobeye.rally.best': '64.500' }));
    expect(await board.top()).toEqual([{ name: DEFAULT_NAME, time: 64.5 }]);
  });
  it('still works for the visit when storage is missing or refuses', async () => {
    expect(await deviceBoard(null).add({ name: 'A', time: 70 })).toHaveLength(1);
    const refusing = {
      getItem: (): string | null => {
        throw new Error('blocked');
      },
      setItem: (): void => {
        throw new Error('blocked');
      },
    };
    const board = deviceBoard(refusing);
    await board.add({ name: 'A', time: 70 });
    expect(await board.add({ name: 'B', time: 69 })).toEqual([{ name: 'B', time: 69 }, { name: 'A', time: 70 }]);
  });
  it('hands out copies, so the caller cannot change the board', async () => {
    const board = deviceBoard(null);
    (await board.add({ name: 'A', time: 70 })).length = 0;
    expect(await board.top()).toHaveLength(1);
  });
});

describe('rowsToEntries', () => {
  it('turns the table\'s rows into names and seconds, fastest first', () => {
    const rows = [{ name: 'B', time_ms: 70000 }, { name: 'A', time_ms: 65432 }];
    expect(rowsToEntries(rows)).toEqual([{ name: 'A', time: 65.432 }, { name: 'B', time: 70 }]);
  });
  it('drops rows that are not a name and a possible time', () => {
    const rows = [null, 7, { name: 'ok', time_ms: 61000 }, { name: 5, time_ms: 61000 }, { name: 'fast', time_ms: 19999 }, { name: 'slow', time_ms: 600001 }, { name: 'frac', time_ms: 61000.5 }, { name: 'text', time_ms: '61000' }];
    expect(rowsToEntries(rows)).toEqual([{ name: 'ok', time: 61 }]);
    for (const not of [null, 'x', { name: 'A', time_ms: 61000 }]) expect(rowsToEntries(not)).toEqual([]);
  });
  it('tidies names from strangers and stops at ten', () => {
    expect(rowsToEntries([{ name: '<img src=x>', time_ms: 61000 }])[0]!.name).toBe('img srcx');
    expect(rowsToEntries(Array.from({ length: 30 }, (_, i) => ({ name: 'D', time_ms: 60000 + i })))).toHaveLength(BOARD_SIZE);
  });
});

describe('sharedBoard', () => {
  const URL = 'https://example.supabase.co';
  const KEY = 'sb_publishable_test';

  /** A stand-in for the table behind its REST API: it keeps rows, and can be switched off or made to refuse. */
  function fakeTable(start: { name: string; time_ms: number }[] = []) {
    const rows = start.slice();
    const calls: { url: string; init: RequestInit }[] = [];
    const state = { down: false, status: 0 };
    const send = async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      if (state.down) throw new TypeError('Failed to fetch');
      if (state.status) return { ok: false, status: state.status, json: async () => ({ message: 'no' }) };
      if (init.method === 'POST') {
        rows.push(JSON.parse(String(init.body)));
        return { ok: true, status: 201, json: async () => null };
      }
      return { ok: true, status: 200, json: async () => rows.slice().sort((a, b) => a.time_ms - b.time_ms).slice(0, 10) };
    };
    return { rows, calls, state, send };
  }

  it('reads the ten fastest times for the stage, with the public key', async () => {
    const table = fakeTable([{ name: 'Carlos', time_ms: 62000 }, { name: 'Tommi', time_ms: 61000 }]);
    const board = sharedBoard(URL + '/', KEY, deviceBoard(null), table.send);
    expect(await board.top()).toEqual([{ name: 'Tommi', time: 61 }, { name: 'Carlos', time: 62 }]);
    expect(board.scope).toBe('everyone');
    const { url, init } = table.calls[0]!;
    expect(url.startsWith(URL + '/rest/v1/rally_times?')).toBe(true);
    const query = new URLSearchParams(url.split('?')[1]);
    expect(query.get('select')).toBe('name,time_ms');
    expect(query.get('stage')).toBe('eq.' + STAGE_ID);
    expect(query.get('order')).toBe('time_ms.asc,created_at.asc');
    expect(query.get('limit')).toBe(String(BOARD_SIZE));
    expect(init.method ?? 'GET').toBe('GET');
    expect(init.headers).toMatchObject({ apikey: KEY, Authorization: 'Bearer ' + KEY });
  });

  it('sends a time as a tidy name, whole milliseconds and the stage, then shows the board', async () => {
    const table = fakeTable([{ name: 'Tommi', time_ms: 61000 }]);
    const device = deviceBoard(null);
    const board = sharedBoard(URL, KEY, device, table.send);
    const top = await board.add({ name: '  Ethan <3 ', time: 63.2104 });
    expect(top).toEqual([{ name: 'Tommi', time: 61 }, { name: 'Ethan 3', time: 63.21 }]);
    const post = table.calls.find((c) => c.init.method === 'POST')!;
    expect(post.url).toBe(URL + '/rest/v1/rally_times');
    expect(JSON.parse(String(post.init.body))).toEqual({ name: 'Ethan 3', time_ms: 63210, stage: STAGE_ID });
    expect(post.init.headers).toMatchObject({ apikey: KEY, 'Content-Type': 'application/json' });
    // Only ever a read or an insert.
    expect(new Set(table.calls.map((c) => c.init.method ?? 'GET'))).toEqual(new Set(['GET', 'POST']));
    // The device keeps it as well, so it is never lost.
    expect(await device.top()).toEqual([{ name: 'Ethan 3', time: 63.2104 }]);
    expect(board.scope).toBe('everyone');
  });

  it('falls back to the device\'s own times when the request fails', async () => {
    const table = fakeTable([{ name: 'Tommi', time_ms: 61000 }]);
    const device = deviceBoard(null);
    await device.add({ name: 'Earlier', time: 70 });
    const board = sharedBoard(URL, KEY, device, table.send);
    table.state.down = true;
    expect(await board.top()).toEqual([{ name: 'Earlier', time: 70 }]);
    expect(board.scope).toBe('this device');
    expect(await board.add({ name: 'Ethan', time: 64 })).toEqual([{ name: 'Ethan', time: 64 }, { name: 'Earlier', time: 70 }]);
    expect(board.scope).toBe('this device');
    expect(table.rows).toHaveLength(1);
    // When the board can be reached again, it is the shared one again.
    table.state.down = false;
    expect(await board.top()).toEqual([{ name: 'Tommi', time: 61 }]);
    expect(board.scope).toBe('everyone');
  });

  it('falls back when the board refuses, or answers with something else', async () => {
    const table = fakeTable();
    const board = sharedBoard(URL, KEY, deviceBoard(null), table.send);
    table.state.status = 401;
    expect(await board.add({ name: 'Ethan', time: 64 })).toEqual([{ name: 'Ethan', time: 64 }]);
    expect(board.scope).toBe('this device');
    expect(await board.top()).toEqual([{ name: 'Ethan', time: 64 }]);
    const odd = sharedBoard(URL, KEY, deviceBoard(null), async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('not json'); } }));
    expect(await odd.top()).toEqual([]);
    expect(odd.scope).toBe('this device');
  });

  it('does not send a time the table would refuse', async () => {
    const table = fakeTable();
    const board = sharedBoard(URL, KEY, deviceBoard(null), table.send);
    for (const time of [12, 601]) await board.add({ name: 'Ethan', time });
    expect(table.calls.some((c) => c.init.method === 'POST')).toBe(false);
    expect(await deviceBoard(null).top()).toEqual([]);
    expect(board.scope).toBe('this device');
  });
});
