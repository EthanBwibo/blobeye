/**
 * The Safari stage: a time trial seen from a chase camera behind the car. This file runs the game and is
 * the only part that touches the page. The driving is in `handling.ts`, the road and the clock in
 * `stage.ts`, the camera and the start in `chase.ts`, and the drawing in `world.ts`.
 *
 * It is loaded on demand (see `src/ui/rallyGate.ts`), so nothing here may be imported by the main page.
 */
import './rally.css';
import type { EngineState } from '../engine/model';
import { WHEELS } from '../car/model';
import { createBoardHud } from './boardHud';
import { chaseFov, chaseView, countdown, newChase, stepChase, type Chase } from './chase';
import { carSpeeds, easeSteer, engineRpm, type DriveInput } from './handling';
import { scatter } from './scenery';
import { buildStage, formatTime, locate, newTrial, stepTrial, type Stage, type Trial } from './stage';
import { MOST_DUST, UNIT, createWorld, type Puff, type World } from './world';

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

/** The driving runs in fixed steps, so a run is the same on a slow screen as on a fast one. */
const STEP = 1 / 120;

// The stage and its drawing are built once and kept, so driving it again starts at once.
let built: { stage: Stage; world: World } | null = null;
let failed = false;
function build(): { stage: Stage; world: World } {
  if (!built) {
    const stage = buildStage();
    built = { stage, world: createWorld(stage) };
  }
  return built;
}

/**
 * Build the stage ahead of time, when the page is idle, so the cut from the drawing into the game is
 * instant. Safe to call more than once. If it cannot be built, `startRally` will say so.
 */
export function warmRally(): void {
  if (built || failed) return;
  const run = (): void => {
    try {
      build();
    } catch {
      failed = true;
    }
  };
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 600 });
  else setTimeout(run, 0);
}

interface Dust extends Puff {
  vx: number;
  vy: number;
  rise: number;
  age: number;
  life: number;
  size: number;
}

export function startRally(host: RallyHost): Rally {
  const { stage, world } = build();
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let trial: Trial = newTrial(stage);

  // --- The page: the drawing and a few readouts
  const root = document.createElement('div');
  root.id = 'rally';
  root.tabIndex = -1;
  root.setAttribute('role', 'application');
  root.setAttribute('aria-label', 'Safari stage time trial. Arrow keys or W A S D to drive, R to restart, Escape to leave.');
  root.innerHTML = `
    <div class="way"></div>
    <div class="hud clock"><span>Safari stage · Time</span><b data-time>0:00.00</b></div>
    <div class="hud call" data-call aria-live="assertive"><b data-call-big></b><span data-call-small></span></div>
    <div class="hud keys"><span>Arrows or WASD · drive</span><span>R · restart</span><span>M · sound</span><span>Esc · leave</span></div>`;
  root.prepend(world.canvas);
  const part = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const [timeEl, callEl, callBig, callSmall, wayEl] = [part('[data-time]'), part('[data-call]'), part('[data-call-big]'), part('[data-call-small]'), part('.way')];

  // The top ten, and the name box on the finish panel. When the box closes the keys come back to the game.
  const board = createBoardHud(root, callEl, () => root.focus());

  world.applyTheme();
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  scheme.addEventListener('change', world.applyTheme);
  const resize = (): void => world.resize(window.innerWidth, window.innerHeight);
  resize();
  window.addEventListener('resize', resize);

  // --- The run: the car, the camera behind it, and the 3-2-1 before it may move
  let chase: Chase = newChase(trial.car);
  /** Seconds since the car lined up. */
  let waited = 0;
  let steer = 0;
  let rolled = 0;
  let dive = 0;
  let lean = 0;
  const dust: Dust[] = [];
  const restart = (): void => {
    trial = newTrial(stage);
    trial.index = locate(stage, trial.car.x, trial.car.y, trial.index).index;
    chase = newChase(trial.car);
    board.reset();
    waited = steer = dive = lean = 0;
    dust.length = 0;
  };

  // --- Keys
  const held = new Set<string>();
  const DRIVE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
  const onKeyDown = (e: KeyboardEvent): void => {
    // While a name is being typed, the letters are letters.
    if (board.takesKey(e)) return;
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

  const down = (...codes: string[]) => codes.some((c) => held.has(c));
  const readInput = (dt: number): DriveInput => {
    const want = (down('ArrowRight', 'KeyD') ? 1 : 0) - (down('ArrowLeft', 'KeyA') ? 1 : 0);
    steer = easeSteer(steer, want, dt);
    // Until the count reaches Go the pedals do nothing, so the clock cannot start early.
    if (countdown(waited).held) return { throttle: 0, brake: 0, steer };
    return { throttle: down('ArrowUp', 'KeyW') ? 1 : 0, brake: down('ArrowDown', 'KeyS') ? 1 : 0, steer };
  };

  // --- Dust from the rear wheels
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
      if (dust.length >= MOST_DUST) continue;
      const [ahead, right] = [WHEELS.rearZ * UNIT, (dust.length % 2 ? 1 : -1) * WHEELS.track * UNIT];
      dust.push({
        x: trial.car.x + ahead * cos - right * sin + (random() - 0.5) * 0.6,
        y: trial.car.y + ahead * sin + right * cos + (random() - 0.5) * 0.6,
        height: 0.2,
        vx: trial.car.vx * 0.12 + (random() - 0.5) * 2,
        vy: trial.car.vy * 0.12 + (random() - 0.5) * 2,
        rise: 0.5 + random() * 1.1,
        age: 0,
        life: 0.9 + random() * 0.9,
        size: 0.9 + random() * 0.7,
        width: 0,
        fade: 0,
      });
    }
    let kept = 0;
    for (const d of dust) {
      d.age += dt;
      if (d.age >= d.life) continue;
      const t = d.age / d.life;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.height += d.rise * dt;
      d.vx *= 1 - 2 * dt;
      d.vy *= 1 - 2 * dt;
      d.width = d.size * (1 + t * 2.6);
      d.fade = 0.4 * (1 - t);
      dust[kept++] = d;
    }
    dust.length = kept;
  };

  /** The body on its springs: the nose lifts under power and dips under braking, and it leans out of a turn. */
  const settleBody = (before: { forward: number; heading: number }, dt: number): void => {
    const { forward } = carSpeeds(trial.car);
    const push = (forward - before.forward) / dt;
    const turning = ((trial.car.heading - before.heading) / dt) * forward;
    const ease = 1 - Math.exp(-dt * 8);
    const limit = (v: number, most: number) => Math.min(most, Math.max(-most, v));
    dive += (limit(-push * 0.0014, 0.04) - dive) * ease;
    lean += (limit(-turning * 0.0016, 0.05) - lean) * ease;
    rolled += forward * dt;
  };

  const draw = (): void => {
    const { forward } = carSpeeds(trial.car);
    world.draw({
      car: trial.car,
      steer,
      rolled,
      dive: calm ? 0 : dive,
      lean: calm ? 0 : lean,
      ...chaseView(chase, trial.car),
      fov: chaseFov(forward, calm),
      dust,
    });
  };

  const showReadouts = (): void => {
    timeEl.textContent = formatTime(trial.time);
    wayEl.style.width = `${(Math.min(1, Math.max(0, (trial.progress - stage.startAt) / (stage.finishAt - stage.startAt))) * 100).toFixed(1)}%`;
    const { call, held: waiting } = countdown(waited);
    let big = '';
    let small = '';
    if (trial.phase === 'finished') {
      big = formatTime(trial.time);
      small = board.note();
    } else if (waiting) {
      big = call ?? '';
      small = 'Get ready';
    } else if (trial.phase === 'ready') {
      big = 'Go';
      small = 'The clock starts when you press Up or W';
    } else if (call) {
      big = call;
    }
    callEl.hidden = big === '';
    if (callBig.textContent !== big) callBig.textContent = big;
    if (callSmall.textContent !== small) callSmall.textContent = small;
    callSmall.hidden = small === '';
    callBig.classList.toggle('gold', trial.phase === 'finished' && board.isBest());
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
      const before = { forward: carSpeeds(trial.car).forward, heading: trial.car.heading };
      waited += STEP;
      stepTrial(stage, trial, readInput(STEP), STEP);
      settleBody(before, STEP);
      chase = stepChase(chase, trial.car, STEP);
      raiseDust(STEP);
      if (was === 'running' && trial.phase === 'finished') board.finished(trial.time);
    }
    // The exhaust synth follows these.
    revs += (engineRpm(carSpeeds(trial.car).forward) - revs) * (1 - Math.exp(-dt * 12));
    host.engine.rpm = revs;
    host.engine.throttle = trial.phase === 'running' && down('ArrowUp', 'KeyW');
    draw();
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
    scheme.removeEventListener('change', world.applyTheme);
    host.engine.throttle = false;
    root.remove();
    host.onExit();
  }

  // Cut straight in: the first frame is drawn before the stage is put on the page.
  restart();
  draw();
  showReadouts();
  document.body.append(root);
  root.focus();
  requestAnimationFrame((now) => {
    previous = now;
    frame(now);
  });

  return { stop };
}
