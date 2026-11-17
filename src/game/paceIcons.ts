/**
 * The pace-note icons, drawn as inline SVG in the rally-game style: a curved arrow with its grade for a
 * corner, a sign for each hazard, and a caution triangle with one to three exclamation marks. Pure: each
 * returns SVG as text in `currentColor`, so the stylesheet sets the colour.
 */
import type { Species } from './hazards';
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

const ICONS: Record<Exclude<Sign['kind'], 'corner' | 'animals'>, string> = {
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
  // Grains of sand drifted across the road.
  sand:
    '<path d="M4 90H96" stroke="currentColor" stroke-width="5"/><path d="M6 80Q30 56 54 72T96 64" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>' +
    [[20, 42], [38, 30], [58, 40], [76, 26], [30, 56], [70, 50], [88, 44]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.5" fill="currentColor"/>`).join(''),
  // A wheel sliding in a puddle.
  mud:
    '<path d="M8 82Q24 70 40 80T72 78T96 82V92H8Z" fill="currentColor"/>' +
    '<circle cx="50" cy="48" r="22" fill="none" stroke="currentColor" stroke-width="8"/><path d="M18 40L8 36M20 54L8 58" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>',
  // The road broken by a gash across it.
  washout:
    '<path d="M6 30H40L34 48L46 58L38 72H6Z" fill="currentColor"/><path d="M94 30H58L64 46L52 58L62 72H94Z" fill="currentColor"/>' +
    '<path d="M6 86H94" stroke="currentColor" stroke-width="5"/>',
  // Bars across the road between two posts.
  grid:
    '<path d="M12 22V86M88 22V86" stroke="currentColor" stroke-width="8"/>' +
    [36, 48, 60, 72].map((y) => `<path d="M12 ${y}H88" stroke="currentColor" stroke-width="5"/>`).join(''),
  // A fallen branch with a fork, lying across the road edge.
  branch:
    '<path d="M6 80L94 52" stroke="currentColor" stroke-width="10" stroke-linecap="round"/><path d="M48 67L60 38M70 59L88 34M26 74L18 52" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>' +
    '<path d="M4 92H96" stroke="currentColor" stroke-width="5"/>',
};

/** The animals' own silhouettes, side on. A grazer stands for the zebra, and for any not drawn. */
const ANIMAL_ICONS: Record<'zebra' | Species, string> = {
  zebra:
    '<path d="M20 44H66L80 26L92 30L86 40L76 48V62H70V86H63V64H30V86H23V64L16 58Z" fill="currentColor"/>' +
    '<path d="M20 46L8 62" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>',
  giraffe:
    '<path d="M24 52H58L66 12L80 8L86 14L76 18L68 56L66 64V92H60V66H34V92H28V64L20 60Z" fill="currentColor"/>' +
    '<path d="M24 54L14 70" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
  warthog:
    '<path d="M16 54Q20 40 46 40H70L86 50L90 62L80 64L76 70V86H70V72H34V86H28V70L18 66Z" fill="currentColor"/>' +
    '<path d="M18 50L12 30" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M84 58Q94 52 92 44" fill="none" stroke="currentColor" stroke-width="4"/>',
  ostrich:
    '<path d="M22 46Q30 30 56 34Q64 36 66 42L70 10L80 8L82 14L76 16L74 46Q72 60 56 62H34Q22 60 22 46Z" fill="currentColor"/>' +
    '<path d="M44 60L36 92M54 60L62 92" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>',
  flamingo:
    '<path d="M30 44Q34 30 54 34Q64 38 60 50Q52 58 36 56Z" fill="currentColor"/><path d="M58 40Q70 20 62 10Q56 4 50 12" fill="none" stroke="currentColor" stroke-width="5"/>' +
    '<path d="M46 56V92" stroke="currentColor" stroke-width="4"/>',
};

/** The icon for a call. */
export function signSvg(sign: Sign): string {
  const body = sign.kind === 'corner' ? corner(sign.turn, sign.grade) : sign.kind === 'animals' ? ANIMAL_ICONS[sign.animal ?? 'zebra'] : ICONS[sign.kind];
  return `<svg viewBox="0 0 100 100" class="sign" aria-hidden="true">${body}</svg>`;
}

/** A caution triangle with one to three exclamation marks. Nothing for a call that needs no care. */
export function cautionSvg(level: Caution): string {
  if (!level) return '';
  return `<svg viewBox="0 0 100 90" class="caution" aria-hidden="true"><path d="M50 6L95 84H5Z" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/><text x="50" y="76" text-anchor="middle" font-size="${[0, 52, 46, 40][level]}">${'!'.repeat(level)}</text></svg>`;
}

const ANIMAL_CAPTIONS: Record<'zebra' | Species, string> = { zebra: 'Zebra', giraffe: 'Giraffe', warthog: 'Warthogs', ostrich: 'Ostrich', flamingo: 'Flamingos' };

/** The short word under an icon: how the corner changes, or what the hazard is. */
export function caption(sign: Sign): string {
  switch (sign.kind) {
    case 'corner':
      return sign.change ?? '';
    case 'rocks':
      return `Rocks · keep ${sign.side === 'Right' ? 'left' : 'right'}`;
    case 'branch':
      return `Branch · keep ${sign.side === 'Right' ? 'left' : 'right'}`;
    case 'animals':
      return ANIMAL_CAPTIONS[sign.animal ?? 'zebra'];
    case 'grid':
      return 'cattle grid';
    default:
      return sign.kind;
  }
}
