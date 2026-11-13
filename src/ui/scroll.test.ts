import { describe, expect, it } from 'vitest';
import { pageTarget } from './scroll';

describe('pageTarget', () => {
  it('moves one sheet down for page down, arrow down and space', () => {
    for (const key of ['PageDown', 'ArrowDown', ' ']) expect(pageTarget(key, false, 1, 5)).toBe(2);
  });
  it('moves one sheet up for page up, arrow up and shift+space', () => {
    expect(pageTarget('PageUp', false, 2, 5)).toBe(1);
    expect(pageTarget('ArrowUp', false, 2, 5)).toBe(1);
    expect(pageTarget(' ', true, 2, 5)).toBe(1);
  });
  it('stops at the first and last sheets', () => {
    expect(pageTarget('PageUp', false, 0, 5)).toBe(0);
    expect(pageTarget('PageDown', false, 4, 5)).toBe(4);
  });
  it('jumps to the ends for home and end', () => {
    expect(pageTarget('Home', false, 3, 5)).toBe(0);
    expect(pageTarget('End', false, 1, 5)).toBe(4);
  });
  it('ignores other keys', () => {
    expect(pageTarget('a', false, 1, 5)).toBeNull();
  });
});
