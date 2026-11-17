/**
 * The instruments in the bottom right: a rev meter with its redline, the gear and the speed. Pure: the
 * numbers, and the dial as SVG text.
 */

export const REV_METER = {
  /** The top of the dial, and where the red starts. The engine changes up at 6,800. */
  max: 8000,
  redline: 6500,
  /** The needle's sweep, in degrees either side of straight up. */
  sweep: 125,
} as const;

/** The needle's angle for some revs, in degrees from straight up: negative is to the left. */
export function needleAngle(rpm: number): number {
  const share = Math.min(1, Math.max(0, rpm / REV_METER.max));
  return -REV_METER.sweep + share * REV_METER.sweep * 2;
}

/** Road speed in metres per second, as whole kilometres an hour. */
export function kmh(speed: number): number {
  return Math.round(Math.abs(speed) * 3.6);
}

/** The middle of the dial and its radius, in the SVG's units. */
export const DIAL = { cx: 60, cy: 62, r: 48 } as const;

const at = (deg: number, r: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [DIAL.cx + Math.sin(a) * r, DIAL.cy - Math.cos(a) * r];
};
const n = (v: number) => v.toFixed(1);
const arc = (from: number, to: number, r: number): string => {
  const [x0, y0] = at(from, r);
  const [x1, y1] = at(to, r);
  return `M${n(x0)} ${n(y0)}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${n(x1)} ${n(y1)}`;
};

/** The dial: its arc, a tick each thousand with the number, and the red band. The needle is `[data-needle]`. */
export function revMeterSvg(): string {
  const { max, redline, sweep } = REV_METER;
  const { cx, cy, r } = DIAL;
  const ticks: string[] = [];
  for (let k = 0; k <= max / 1000; k++) {
    const deg = needleAngle(k * 1000);
    const [x0, y0] = at(deg, r);
    const [x1, y1] = at(deg, r - 8);
    const [tx, ty] = at(deg, r - 17);
    ticks.push(`<path d="M${n(x0)} ${n(y0)}L${n(x1)} ${n(y1)}"/><text x="${n(tx)}" y="${n(ty + 3.5)}">${k}</text>`);
  }
  return `<svg viewBox="0 0 120 104" class="revs" aria-hidden="true">
    <path class="dial" d="${arc(-sweep, sweep, r)}"/>
    <path class="red" d="${arc(needleAngle(redline), sweep, r - 3)}"/>
    <g class="ticks">${ticks.join('')}</g>
    <path data-needle class="needle" d="M${cx} ${cy + 8}L${cx} ${cy - r + 6}"/>
    <circle class="hub" cx="${cx}" cy="${cy}" r="4.5"/>
  </svg>`;
}
