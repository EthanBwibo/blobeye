import { it } from 'vitest';
import { buildStage, poseAt } from '../game/stage';
it('probe', () => {
  const s = buildStage();
  console.log('length', s.length, 'start', s.startAt, 'finish', s.finishAt, 'points', s.points.length);
  const turn = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  let line = '';
  for (let d = 0; d < s.length; d += 10) {
    const k = turn(poseAt(s, d + 6).heading - poseAt(s, d - 6).heading) / 12;
    line += `${d}:${(k * 1000).toFixed(0)} `;
  }
  console.log(line);
});
