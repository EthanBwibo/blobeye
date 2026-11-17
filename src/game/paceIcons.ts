/**
 * The pace-note icons, drawn as inline SVG in the rally-game style: a curved arrow with its grade for a
 * corner, a sign for each hazard, and a caution triangle with one to three exclamation marks. Pure: each
 * returns SVG as text in `currentColor`, so the stylesheet sets the colour.
 */
import type { Caution, Sign } from './notes';

/** How far each grade of corner turns the arrow, in degrees. 1 is the tightest, 6 nearly flat. */
export const ARROW_TURN = [0, 160, 125, 95, 70, 45, 25] as const;

const n = (v: number) => v.toFixed(1);

/** The arrow for a corner turning right: a stem, a curve through `turn` degrees, and a head. */
export function arrowPath(turn: number): { line: string; head: string; end: [number, number] } {
  const [x0, y0, stem, r] = [42, 94, 30, 22];
  const top = y0 - stem;
  const points: string[] = [`M${x0} ${y0}`, `L${x0} ${top}`];
  const a = (turn * Math.PI) / 180;
  const steps = Math.max(2, Math.ceil(turn / 10));
  for (let s = 1; s <= steps; s++) {
    const phi = (a * s) / steps;
    points.push(`L${n(x0 + r - r * Math.cos(phi))} ${n(top - r * Math.sin(phi))}`);
  }
  const [ex, ey] = [x0 + r - r * Math.cos(a), top - r * Math.sin(a)];
  // Along the curve at its end, and across it.
  const [tx, ty] = [Math.sin(a), -Math.cos(a)];
  const [nx, ny] = [-ty, tx];
  const tip: [number, number] = [ex + tx * 15, ey + ty * 15];
  const head = `M${n(tip[0])} ${n(tip[1])}L${n(ex + nx * 11)} ${n(ey + ny * 11)}L${n(ex - nx * 11)} ${n(ey - ny * 11)}Z`;
  return { line: points.join(''), head, end: tip };
}

function corner(turn: 'Left' | 'Right', grade: number): string {
  const g = Math.min(6, Math.max(1, Math.round(grade)));
  const { line, head } = arrowPath(ARROW_TURN[g]!);
  // Drawn turning right, and mirrored for a left. The number stays the right way round, on the inside of the bend.
  const flip = turn === 'Left' ? ' transform="matrix(-1 0 0 1 100 0)"' : '';
  const nx = turn === 'Left' ? 78 : 22;
  return `<g${flip}><path d="${line}" fill="none" stroke="currentColor" stroke-width="9" stroke-linejoin="round"/><path d="${head}" fill="currentColor"/></g><text x="${nx}" y="97" text-anchor="middle" class="grade">${g}</text>`;
}

const ICONS: Record<Exclude<Sign['kind'], 'corner'>, string> = {
  crest:
    '<path d="M6 82H94" stroke="currentColor" stroke-width="6"/><path d="M10 82Q50 16 90 82" fill="none" stroke="currentColor" stroke-width="9" stroke-linejoin="round"/>' +
    '<path d="M36 30L50 16L64 30" fill="none" stroke="currentColor" stroke-width="7"/>',
  water: [32, 54, 76].map((y) => `<path d="M8 ${y}q10.5 -11 21 0t21 0t21 0t21 0" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>`).join(''),
  bridge:
    '<path d="M6 54H94M6 36H94M18 36V54M50 36V54M82 36V54" fill="none" stroke="currentColor" stroke-width="7"/>' +
    '<path d="M14 92Q50 60 86 92" fill="none" stroke="currentColor" stroke-width="7"/>',
  rocks:
    '<path d="M8 86L18 58L38 50L52 66L50 86Z" fill="currentColor"/><path d="M48 86L60 44L80 38L94 62L92 86Z" fill="currentColor"/>' +
    '<path d="M4 90H96" stroke="currentColor" stroke-width="5"/>',
  // A grazer, side on: the zebra and their cousins.
  animals:
    '<path d="M20 44H66L80 26L92 30L86 40L76 48V62H70V86H63V64H30V86H23V64L16 58Z" fill="currentColor"/>' +
    '<path d="M20 46L8 62" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>',
};

/** The icon for a call. */
export function signSvg(sign: Sign): string {
  const body = sign.kind === 'corner' ? corner(sign.turn, sign.grade) : ICONS[sign.kind];
  return `<svg viewBox="0 0 100 100" class="sign" aria-hidden="true">${body}</svg>`;
}

/** A caution triangle with one to three exclamation marks. Nothing for a call that needs no care. */
export function cautionSvg(level: Caution): string {
  if (!level) return '';
  return `<svg viewBox="0 0 100 90" class="caution" aria-hidden="true"><path d="M50 6L95 84H5Z" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/><text x="50" y="76" text-anchor="middle" font-size="${[0, 52, 46, 40][level]}">${'!'.repeat(level)}</text></svg>`;
}

/** The short word under an icon: how the corner changes, or what the hazard is. */
export function caption(sign: Sign): string {
  switch (sign.kind) {
    case 'corner':
      return sign.change ?? '';
    case 'rocks':
      return `Rocks · keep ${sign.side === 'Right' ? 'left' : 'right'}`;
    case 'animals':
      return 'Zebra';
    default:
      return sign.kind;
  }
}
