import { describe, expect, it } from 'vitest';
import { CARD, cardFileName, cardWords, shareText, type Card } from './shareCard';

const run: Card = { stage: "Hell's Gate", time: 77.456, medal: 'silver', penalty: 5, plate: 'GAPP3D', season: 2 };

describe('the share card', () => {
  it('is 4:5, for an Instagram post and WhatsApp', () => {
    expect(CARD.width / CARD.height).toBeCloseTo(4 / 5);
  });

  it('carries the stage, the time, the medal, the penalty and the plate', () => {
    expect(cardWords(run)).toEqual({
      kicker: 'Safari stage · Season 2',
      stage: "HELL'S GATE",
      time: '1:17.45',
      medal: 'SILVER',
      penalty: 'incl. +5 s penalty',
      plate: 'GAPP3D',
      foot: 'Blobeye · unofficial fan project',
    });
    const clean = cardWords({ ...run, medal: null, penalty: 0 });
    expect(clean.medal).toBe('NO MEDAL');
    expect(clean.penalty).toBe('');
  });

  it('says the time, the stage and the medal, with a way to the game', () => {
    expect(shareText(run, 'https://example.org/')).toBe("1:17.45 on Hell's Gate. Silver. Beat it: https://example.org/");
    expect(shareText({ ...run, medal: null }, 'https://example.org/')).toBe("1:17.45 on Hell's Gate. Beat it: https://example.org/");
  });

  it('names the file after the stage and the time, with nothing a file system minds', () => {
    expect(cardFileName(run)).toBe('blobeye-hell-s-gate-1-17-45.png');
  });
});
