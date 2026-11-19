/**
 * The share card: after a finish, a picture of the stage, the time, the medal and the plates' word, sized for
 * WhatsApp and an Instagram post (4:5), handed to the phone's share sheet or, where there is none, saved.
 *
 * `cardWords` and `shareText` are pure and tested. The drawing and the sharing need a browser.
 */
import type { Medal } from './splits';
import { formatTime } from './stage';

export interface Card {
  stage: string;
  /** Seconds, penalties included. */
  time: number;
  medal: Medal | null;
  /** Seconds of penalties in `time`. */
  penalty: number;
  /** The word on this visit's number plates. */
  plate: string;
  season: number;
}

/** The card's size in pixels: 4:5, the tallest an Instagram post takes, and WhatsApp shows it whole. */
export const CARD = { width: 1080, height: 1350 } as const;

/** Every line of words on the card, top to bottom. */
export function cardWords(card: Card): { kicker: string; stage: string; time: string; medal: string; penalty: string; plate: string; foot: string } {
  return {
    kicker: `Safari stage · Season ${card.season}`,
    stage: card.stage.toUpperCase(),
    time: formatTime(card.time),
    medal: card.medal ? card.medal.toUpperCase() : 'NO MEDAL',
    penalty: card.penalty > 0 ? `incl. +${card.penalty} s penalty` : '',
    plate: card.plate,
    foot: 'Blobeye · unofficial fan project',
  };
}

/** The words that go with the picture. */
export function shareText(card: Card, url: string): string {
  const medal = card.medal ? `${card.medal.charAt(0).toUpperCase()}${card.medal.slice(1)}. ` : '';
  return `${formatTime(card.time)} on ${card.stage}. ${medal}Beat it: ${url}`.trim();
}

/** The file name for the picture: the stage and the time, nothing a file system minds. */
export function cardFileName(card: Card): string {
  const stage = card.stage.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `blobeye-${stage || 'stage'}-${formatTime(card.time).replace(/[:.]/g, '-')}.png`;
}

/** The colours for the card, read from the game's screen so they follow the theme and the time of day. */
function colours(from: Element): Record<'paper' | 'ink' | 'soft' | 'gold' | 'silver' | 'bronze' | 'yellow' | 'plateInk', string> {
  const style = getComputedStyle(from);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    paper: token('--paper', '#F3EFE6'),
    ink: token('--ink', '#1B1F2A'),
    soft: token('--ink-soft', '#5A6070'),
    gold: token('--gold', '#B8892B'),
    silver: token('--silver', '#6E7C93'),
    bronze: token('--bronze', '#9A5B2C'),
    yellow: token('--plate-yellow', '#F2C81B'),
    plateInk: token('--plate-ink', '#141414'),
  };
}

/** Draw the card. Null where the browser cannot make a picture. */
export async function drawCard(card: Card, themeFrom: Element): Promise<Blob | null> {
  // The page's own fonts, once they have loaded: the card would otherwise fall back to Arial.
  try {
    await document.fonts?.ready;
  } catch {
    /* system fonts will do */
  }
  const canvas = document.createElement('canvas');
  canvas.width = CARD.width;
  canvas.height = CARD.height;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const c = colours(themeFrom);
  const words = cardWords(card);
  const { width: w, height: h } = CARD;
  const display = (size: number, weight = 800) => `italic ${weight} ${size}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
  const mono = (size: number) => `500 ${size}px "IBM Plex Mono", Menlo, Consolas, monospace`;

  // The sheet: paper, a blueprint grid and a margin rule, as on the site
  g.fillStyle = c.paper;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = c.ink;
  g.globalAlpha = 0.07;
  g.lineWidth = 1;
  for (let x = 0; x <= w; x += 54) g.strokeRect(x, -1, 0, h + 2);
  for (let y = 0; y <= h; y += 54) g.strokeRect(-1, y, w + 2, 0);
  g.globalAlpha = 1;
  g.lineWidth = 3;
  g.strokeRect(40, 40, w - 80, h - 80);

  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = c.soft;
  g.font = mono(34);
  g.fillText(words.kicker.toUpperCase(), w / 2, 150);

  g.fillStyle = c.ink;
  g.font = display(132);
  g.fillText(words.stage, w / 2, 300, w - 160);

  g.font = display(230);
  g.fillText(words.time, w / 2, 590, w - 140);
  if (words.penalty) {
    g.fillStyle = c.soft;
    g.font = mono(30);
    g.fillText(words.penalty, w / 2, 650);
  }

  // The medal: a disc in its colour with its name across it, or a plain ring for none
  const medalColour = card.medal ? c[card.medal] : c.soft;
  const [mx, my, r] = [w / 2, 820, 115];
  g.beginPath();
  g.arc(mx, my, r, 0, Math.PI * 2);
  if (card.medal) {
    g.fillStyle = medalColour;
    g.fill();
  }
  g.lineWidth = 6;
  g.strokeStyle = card.medal ? c.ink : c.soft;
  g.stroke();
  g.fillStyle = card.medal ? c.paper : c.soft;
  g.font = display(card.medal ? 62 : 44, 800);
  g.textBaseline = 'middle';
  g.fillText(words.medal, mx, my + 4, r * 1.7);
  g.textBaseline = 'alphabetic';

  // The back number plate, yellow, with this visit's word on it
  const [pw, ph] = [620, 150];
  const [px, py] = [(w - pw) / 2, 1010];
  g.beginPath();
  g.roundRect(px, py, pw, ph, 18);
  g.fillStyle = c.yellow;
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = c.plateInk;
  g.beginPath();
  g.roundRect(px + 12, py + 12, pw - 24, ph - 24, 10);
  g.stroke();
  g.fillStyle = c.plateInk;
  g.font = `700 ${104}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
  g.textBaseline = 'middle';
  g.fillText(words.plate, w / 2, py + ph / 2 + 4, pw - 70);
  g.textBaseline = 'alphabetic';

  g.fillStyle = c.soft;
  g.font = mono(28);
  g.fillText(words.foot, w / 2, h - 90);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

/**
 * Hand the picture to the share sheet (WhatsApp and Instagram are on it, on a phone), or save it where there
 * is none. Call it straight from the tap, with the picture already drawn: a browser only opens the share
 * sheet in answer to a tap, and some forget the tap while waiting.
 */
export async function shareCard(blob: Blob, card: Card, url: string): Promise<'shared' | 'saved' | 'cancelled'> {
  const name = cardFileName(card);
  const text = shareText(card, url);
  const file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch (error) {
      // Closing the sheet is an AbortError: nothing to do. Anything else, save it instead.
      if ((error as DOMException)?.name === 'AbortError') return 'cancelled';
    }
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  return 'saved';
}
