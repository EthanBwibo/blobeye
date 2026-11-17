import { describe, expect, it } from 'vitest';
import { BOARD_SIZE, DEFAULT_NAME, NAME_LENGTH, addEntry, cleanName, deviceBoard, parseBoard, placeOf, type Entry } from './leaderboard';

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
