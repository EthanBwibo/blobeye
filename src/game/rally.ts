/**
 * The Safari stage: a top-down time trial. This file is the only part that touches the page; the driving
 * is in `handling.ts` and the road and the clock are in `stage.ts`.
 *
 * It is loaded on demand (see `src/ui/rallyGate.ts`), so nothing here may be imported by the main page.
 */
import './rally.css';
import type { EngineState } from '../engine/model';
import type { Pair } from '../car/model';
import { carSpeeds, easeSteer, engineRpm, type DriveInput } from './handling';
import { WHEEL_SIZE, WHEEL_SPOTS, cabinOutline, planOutline, roofOutline, scoopOutline, wingOutline } from './sprite';
import { buildStage, formatTime, isNewBest, locate, newTrial, poseAt, stepTrial, type Stage, type Trial } from './stage';

export interface RallyHost {
  /** The engine the exhaust synth listens to. The game sets its revs from the road speed. */
  engine: EngineState;
  /** Turn the engine sound on or off, the same as the dock's button. */
  toggleSound(): void;
  /** Called when the player leaves. */
  onExit(): void;
}

export interface Rally {
  stop(): void;
}

/** The car is drawn this long, in metres: larger than life, so it reads from above. */
const CAR_LENGTH = 5.4;
const UNIT = CAR_LENGTH / 100;
/** The driving runs in fixed steps, so a run is the same on a slow screen as on a fast one. */
const STEP = 1 / 120;
const BEST_KEY = 'blobeye.rally.best';
const TOKENS = ['savannah', 'murram', 'murram-edge', 'scrub', 'acacia', 'dust', 'paper', 'ink', 'gold', 'body-blue', 'body-light', 'body-dark', 'body-line', 'wheel-gold', 'ground-shade'] as const;
type Colours = Record<(typeof TOKENS)[number], string>;

function readBest(): number | null {
  try {
    const stored = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : null;
  } catch {
    return null;
  }
}

function saveBest(time: number): void {
  try {
    localStorage.setItem(BEST_KEY, time.toFixed(3));
  } catch {
    /* private windows may refuse: the time still shows for this visit */
  }
}

const shape = (outline: readonly Pair[]): Path2D => {
  const path = new Path2D();
  outline.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
  path.closePath();
  return path;
};

/** A repeatable stream of numbers from 0 to 1, so the bush is the same on every visit. */
function scatter(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Plant {
  x: number;
  y: number;
  r: number;
  tree: boolean;
}

const CELL = 64;

/** Tufts and thorn trees beside the road, sorted into squares so only the ones in view are drawn. */
function growBush(stage: Stage): Map<string, Plant[]> {
  const random = scatter(2003);
  const xs = stage.points.map((p) => p[0]);
  const ys = stage.points.map((p) => p[1]);
  const margin = 140;
  const [left, top] = [Math.min(...xs) - margin, Math.min(...ys) - margin];
  const [wide, tall] = [Math.max(...xs) + margin - left, Math.max(...ys) + margin - top];
  const cells = new Map<string, Plant[]>();
  const count = Math.round((wide * tall) / 260);
  for (let i = 0; i < count; i++) {
    const x = left + random() * wide;
    const y = top + random() * tall;
    const tree = random() < 0.12;
    const r = tree ? 2.6 + random() * 2.4 : 0.5 + random() * 0.9;
    const clear = stage.halfWidth + r + (tree ? 3 : 0.5);
    if (stage.points.some((p) => Math.hypot(p[0] - x, p[1] - y) < clear)) continue;
    const key = `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
    const cell = cells.get(key);
    if (cell) cell.push({ x, y, r, tree });
    else cells.set(key, [{ x, y, r, tree }]);
  }
  return cells;
}

interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
}

export function startRally(host: RallyHost): Rally {
  const stage = buildStage();
  const bush = growBush(stage);
  let trial: Trial = newTrial(stage);
  let best = readBest();
  let newBest = false;

  // --- The page: a canvas and a few readouts
  const root = document.createElement('div');
  root.id = 'rally';
  root.tabIndex = -1;
  root.setAttribute('role', 'application');
  root.setAttribute('aria-label', 'Safari stage time trial. Arrow keys or W A S D to drive, R to restart, Escape to leave.');
  root.innerHTML = `
    <canvas></canvas>
    <div class="way"></div>
    <div class="hud clock"><span>Safari stage · Time</span><b data-time>0:00.00</b></div>
    <div class="hud best"><span>Best on this device</span><b data-best></b></div>
    <div class="hud call" data-call><b data-call-big></b><span data-call-small></span></div>
    <div class="hud keys"><span>Arrows or WASD · drive</span><span>R · restart</span><span>M · sound</span><span>Esc · leave</span></div>`;
  document.body.append(root);
  const part = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const canvas = part<HTMLCanvasElement>('canvas');
  const ctx = canvas.getContext('2d')!;
  const [timeEl, bestEl, callEl, callBig, callSmall, wayEl] = [part('[data-time]'), part('[data-best]'), part('[data-call]'), part('[data-call-big]'), part('[data-call-small]'), part('.way')];

  let colours = {} as Colours;
  const readColours = (): void => {
    const css = getComputedStyle(document.documentElement);
    for (const name of TOKENS) colours[name] = css.getPropertyValue(`--${name}`).trim();
  };
  readColours();
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  scheme.addEventListener('change', readColours);

  let width = 1;
  let height = 1;
  let scale = 8;
  const resize = (): void => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    // Pixels per metre: enough of the road ahead to react to, on any shape of screen.
    scale = Math.max(5, Math.min(width / 150, height / 84));
  };
  resize();
  window.addEventListener('resize', resize);

  // --- Shapes that never change
  const road = new Path2D();
  stage.points.forEach(([x, y], i) => (i ? road.lineTo(x, y) : road.moveTo(x, y)));
  const body = shape(planOutline());
  const cabin = shape(cabinOutline());
  const roof = shape(roofOutline());
  const scoop = shape(scoopOutline());
  const wing = shape(wingOutline());

  // --- Keys
  const held = new Set<string>();
  const DRIVE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
  const restart = (): void => {
    trial = newTrial(stage);
    newBest = false;
    steer = 0;
    dust.length = 0;
    look.x = look.y = 0;
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const known = DRIVE_KEYS.has(e.code) || ['KeyR', 'KeyM', 'Escape', 'Enter', 'Space'].includes(e.code);
    if (!known) return;
    // The page behind uses the same keys to turn its sheets.
    e.preventDefault();
    e.stopPropagation();
    if (DRIVE_KEYS.has(e.code)) held.add(e.code);
    else if (e.repeat) return;
    else if (e.code === 'KeyR' || (e.code === 'Enter' && trial.phase === 'finished')) restart();
    else if (e.code === 'KeyM') host.toggleSound();
    else if (e.code === 'Escape') stop();
  };
  const onKeyUp = (e: KeyboardEvent): void => void held.delete(e.code);
  const letGo = (): void => held.clear();
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('blur', letGo);

  let steer = 0;
  const readInput = (dt: number): DriveInput => {
    const down = (...codes: string[]) => codes.some((c) => held.has(c));
    const want = (down('ArrowRight', 'KeyD') ? 1 : 0) - (down('ArrowLeft', 'KeyA') ? 1 : 0);
    steer = easeSteer(steer, want, dt);
    return { throttle: down('ArrowUp', 'KeyW') ? 1 : 0, brake: down('ArrowDown', 'KeyS') ? 1 : 0, steer };
  };

  // --- Dust
  const dust: Dust[] = [];
  const random = scatter(7);
  let owed = 0;
  const raiseDust = (dt: number): void => {
    const { forward, sideways } = carSpeeds(trial.car);
    const pace = Math.hypot(forward, sideways);
    // More dust the faster the car goes, and much more when it is sliding.
    owed += (pace > 2 ? pace * 1.1 + Math.abs(sideways) * 6 : 0) * dt;
    const cos = Math.cos(trial.car.heading);
    const sin = Math.sin(trial.car.heading);
    while (owed >= 1) {
      owed -= 1;
      const wheel = WHEEL_SPOTS[2 + (dust.length % 2)]!.at;
      const [ahead, right] = [wheel[0] * UNIT, wheel[1] * UNIT];
      dust.push({
        x: trial.car.x + ahead * cos - right * sin + (random() - 0.5),
        y: trial.car.y + ahead * sin + right * cos + (random() - 0.5),
        vx: trial.car.vx * 0.12 + (random() - 0.5) * 2,
        vy: trial.car.vy * 0.12 + (random() - 0.5) * 2,
        age: 0,
        life: 0.9 + random() * 0.9,
        size: 0.8 + random() * 0.6,
      });
    }
    for (const d of dust) {
      d.age += dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vx *= 1 - 2 * dt;
      d.vy *= 1 - 2 * dt;
    }
    let kept = 0;
    for (const d of dust) if (d.age < d.life) dust[kept++] = d;
    dust.length = Math.min(kept, 500);
  };

  // --- Drawing
  /** The camera looks a little ahead of the car, the way it is travelling. */
  const look = { x: 0, y: 0 };

  const drawLine = (distance: number, paint: () => void): void => {
    const { x, y, heading } = poseAt(stage, distance);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading);
    paint();
    ctx.restore();
  };

  const draw = (dt: number): void => {
    const car = trial.car;
    const ease = 1 - Math.exp(-dt * 2.5);
    look.x += (car.vx * 0.55 - look.x) * ease;
    look.y += (car.vy * 0.55 - look.y) * ease;
    const cx = car.x + look.x;
    const cy = car.y + look.y;
    const ratio = canvas.width / width;
    const zoom = scale * ratio;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = colours.savannah;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(zoom, 0, 0, zoom, canvas.width / 2 - cx * zoom, canvas.height / 2 - cy * zoom);

    // The road: red murram with a darker verge, and broken ruts so its speed shows
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.strokeStyle = colours['murram-edge'];
    ctx.lineWidth = stage.halfWidth * 2 + 1.8;
    ctx.stroke(road);
    ctx.strokeStyle = colours.murram;
    ctx.lineWidth = stage.halfWidth * 2;
    ctx.stroke(road);
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = colours['murram-edge'];
    ctx.lineWidth = stage.halfWidth * 0.9;
    ctx.setLineDash([5, 11]);
    ctx.stroke(road);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Start line, and a chequered finish
    const half = stage.halfWidth;
    drawLine(stage.startAt + 5, () => {
      ctx.fillStyle = colours.paper;
      ctx.fillRect(-0.4, -half, 0.8, half * 2);
    });
    drawLine(stage.finishAt, () => {
      const square = half / 4;
      for (let row = 0; row < 2; row++) {
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = (i + row) % 2 ? colours.ink : colours.paper;
          ctx.fillRect(row * square, -half + i * square, square, square);
        }
      }
    });

    // The bush, only the squares in view
    const reachX = canvas.width / zoom / 2 + 8;
    const reachY = canvas.height / zoom / 2 + 8;
    for (let gx = Math.floor((cx - reachX) / CELL); gx <= Math.floor((cx + reachX) / CELL); gx++) {
      for (let gy = Math.floor((cy - reachY) / CELL); gy <= Math.floor((cy + reachY) / CELL); gy++) {
        for (const plant of bush.get(`${gx},${gy}`) ?? []) {
          if (plant.tree) {
            ctx.globalAlpha = 0.22;
            ctx.fillStyle = colours['ground-shade'];
            ctx.beginPath();
            ctx.arc(plant.x + 1.2, plant.y + 1.6, plant.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          ctx.fillStyle = plant.tree ? colours.acacia : colours.scrub;
          ctx.beginPath();
          ctx.arc(plant.x, plant.y, plant.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Dust behind the car
    ctx.fillStyle = colours.dust;
    for (const d of dust) {
      const t = d.age / d.life;
      ctx.globalAlpha = 0.34 * (1 - t);
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size * (1 + t * 3.2), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // The car, in its own units: x towards the nose, y to its right
    ctx.translate(car.x, car.y);
    ctx.save();
    ctx.translate(0.5, 0.7);
    ctx.rotate(car.heading);
    ctx.scale(UNIT, UNIT);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = colours['ground-shade'];
    ctx.fill(body);
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.rotate(car.heading);
    ctx.scale(UNIT, UNIT);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = colours['body-line'];
    ctx.fillStyle = colours['body-blue'];
    ctx.fill(body);
    ctx.stroke(body);
    ctx.fillStyle = colours['body-dark'];
    ctx.fill(cabin);
    ctx.fill(scoop);
    ctx.fillStyle = colours['body-light'];
    ctx.fill(roof);
    ctx.fill(wing);
    ctx.lineWidth = 0.7;
    ctx.stroke(wing);
    // Gold wheels, the front pair turned with the steering
    ctx.fillStyle = colours['wheel-gold'];
    for (const wheel of WHEEL_SPOTS) {
      ctx.save();
      ctx.translate(wheel.at[0], wheel.at[1]);
      if (wheel.front) ctx.rotate(steer * 0.5);
      ctx.fillRect(-WHEEL_SIZE.length / 2, -WHEEL_SIZE.width / 2, WHEEL_SIZE.length, WHEEL_SIZE.width);
      ctx.strokeRect(-WHEEL_SIZE.length / 2, -WHEEL_SIZE.width / 2, WHEEL_SIZE.length, WHEEL_SIZE.width);
      ctx.restore();
    }
  };

  const showReadouts = (): void => {
    timeEl.textContent = formatTime(trial.time);
    bestEl.textContent = best === null ? '–:––.––' : formatTime(best);
    wayEl.style.width = `${(Math.min(1, Math.max(0, (trial.progress - stage.startAt) / (stage.finishAt - stage.startAt))) * 100).toFixed(1)}%`;
    callEl.hidden = trial.phase === 'running';
    if (trial.phase === 'ready') {
      callBig.textContent = 'Ready';
      callBig.classList.remove('gold');
      callSmall.textContent = 'The clock starts when you press Up or W';
    } else if (trial.phase === 'finished') {
      callBig.textContent = formatTime(trial.time);
      callBig.classList.toggle('gold', newBest);
      callSmall.textContent = `${newBest ? 'New best' : 'Stage complete'} · Enter to go again · Esc to leave`;
    }
  };

  // --- The loop
  let running = true;
  let previous = performance.now();
  let bank = 0;
  let revs = host.engine.rpm;
  const frame = (now: number): void => {
    if (!running) return;
    const dt = Math.min(0.05, (now - previous) / 1000);
    previous = now;
    bank += dt;
    while (bank >= STEP) {
      bank -= STEP;
      const was = trial.phase;
      stepTrial(stage, trial, readInput(STEP), STEP);
      raiseDust(STEP);
      if (was === 'running' && trial.phase === 'finished' && isNewBest(best, trial.time)) {
        best = trial.time;
        newBest = true;
        saveBest(best);
      }
    }
    // The exhaust synth follows these.
    revs += (engineRpm(carSpeeds(trial.car).forward) - revs) * (1 - Math.exp(-dt * 12));
    host.engine.rpm = revs;
    host.engine.throttle = trial.phase === 'running' && (held.has('ArrowUp') || held.has('KeyW'));
    draw(dt);
    showReadouts();
    requestAnimationFrame(frame);
  };

  function stop(): void {
    if (!running) return;
    running = false;
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('blur', letGo);
    window.removeEventListener('resize', resize);
    scheme.removeEventListener('change', readColours);
    host.engine.throttle = false;
    root.remove();
    host.onExit();
  }

  // Start already located on the road, then fade in.
  trial.index = locate(stage, trial.car.x, trial.car.y, trial.index).index;
  root.focus();
  requestAnimationFrame((now) => {
    previous = now;
    root.classList.add('on');
    frame(now);
  });

  return { stop };
}
