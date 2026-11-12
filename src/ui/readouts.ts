import { CYLINDERS, arrivalAngle, degreesSince, type EngineState } from '../engine/model';

const el = (id: string) => document.getElementById(id)!;

/** Update the tachometer, firing-order strip and arrival timeline. Call every frame. */
export function updateReadouts(state: EngineState, firing: readonly boolean[], labels: HTMLElement[]): void {
  el('rpm').textContent = String(Math.round(state.rpm / 10) * 10);
  el('tbar').style.width = `${Math.min(100, (state.rpm / 8000) * 100)}%`;
  el('head').style.left = `${(state.crank / 720) * 100}%`;

  CYLINDERS.forEach((c, n) => {
    const sinceFire = degreesSince(state.crank, c.fireAt);
    const sinceArrival = degreesSince(state.crank, arrivalAngle(c, state.mode));
    el(`o${c.n}`).classList.toggle('on', sinceFire < 180);
    el(`k${c.n}`).classList.toggle('on', sinceArrival < 70);
    labels[n]?.classList.toggle('on', firing[n] ?? sinceFire < 90);
  });
}
