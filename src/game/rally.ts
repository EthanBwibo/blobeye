/**
 * The Safari stages: a time trial seen from a chase camera behind the car. This file runs the game and is
 * the only part that touches the page. The driving is in `handling.ts`, the road and the clock in
 * `stage.ts`, the three stages in `stages.ts`, what lies on the road in `hazards.ts`, the co-driver's calls
 * in `notes.ts`, the splits and medals in `splits.ts`, the ghost in `ghost.ts`, the camera and the start in
 * `chase.ts`, the touch screen in `touch.ts`, and the drawing in `world.ts`.
 *
 * It is loaded on demand (see `src/ui/rallyGate.ts`), so nothing here may be imported by the main page.
 */
import './rally.css';
import type { EngineState } from '../engine/model';
import { WHEELS } from '../car/model';
import { createBoardHud, type BoardHud } from './boardHud';
import { chaseFov, chaseView, countdown, newChase, stepChase, type Chase } from './chase';
import { beatsGhost, finishGhost, ghostAt, ghostText, newRecorder, parseGhost, record, type Ghost, type Recorder } from './ghost';
import { carSpeeds, easeSteer, engineRpm, type DriveInput } from './handling';
import { groundAt } from './hazards';
import { openBoard, STAGE_ID } from './leaderboard';
import { pickLight } from './light';
import { callAt, paceNotes, type Note } from './notes';
import { scatter } from './scenery';
import { MEDALS, formatGap, keepBest, medalFor, parseBestRun, splitGap, verdict, type BestRun } from './splits';
import { formatTime, herdAt, locate, newTrial, stepTrial, type Stage, type Trial } from './stage';
import { STAGES, buildStageOf, stageById, type StageDef } from './stages';
import { createTouchPads, tiltSteer, type TouchPads } from './touch';
import { UNIT, createWorld, type Puff, type World } from './world';

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
/** What is kept on this device, besides the top ten (see `leaderboard.ts`). */
const KEYS = {
  /** The best run's time and splits, for each stage. Naivasha's keeps the key it had before there were others. */
  run: (stage: string) => (stage === STAGE_ID ? 'blobeye.rally.run' : `blobeye.rally.run.${stage}`),
  ghost: (stage: string) => `blobeye.rally.ghost.${stage}`,
  /** The last stage picked, whether the ghost is shown, and whether the phone steers by tilting. */
  stage: 'blobeye.rally.stage',
  ghostOn: 'blobeye.rally.ghost-on',
  tilt: 'blobeye.rally.tilt',
} as const;
/** The ghost stays on the line this long after it finishes, then goes. */
const GHOST_LINGER = 2;

/** A phone or a tablet: a touch screen and no mouse. It gets the touch pads, and a lighter drawing. */
const touchScreen = (): boolean => matchMedia('(hover: none) and (pointer: coarse)').matches;

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* it still stands for this visit */
  }
};

interface Built {
  def: StageDef;
  lite: boolean;
  stage: Stage;
  world: World;
  notes: Note[];
}

// One stage and its drawing are built at a time and kept, so driving it again starts at once.
let built: Built | null = null;
let failed = false;
function build(def: StageDef, lite: boolean): Built {
  if (built && built.def.id === def.id && built.lite === lite) return built;
  // Only one drawing at a time: a phone cannot hold several.
  built?.world.dispose();
  built = null;
  const stage = buildStageOf(def);
  built = { def, lite, stage, world: createWorld(stage, { bush: def.bush, lite }), notes: paceNotes(stage) };
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
      build(stageById(read(KEYS.stage)), touchScreen());
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

const capital = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/** The phone's tilt as it was last heard, for steering by it. */
interface Tilt {
  beta: number;
  gamma: number;
  heard: boolean;
}

export function startRally(host: RallyHost): Rally {
  const touch = touchScreen();
  let current = build(stageById(read(KEYS.stage)), touch);
  let { stage, world, notes } = current;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let trial: Trial = newTrial(stage);

  // --- The page: the drawing and a few readouts
  const root = document.createElement('div');
  root.id = 'rally';
  root.tabIndex = -1;
  root.classList.toggle('touch', touch);
  root.setAttribute('role', 'application');
  root.setAttribute(
    'aria-label',
    touch
      ? 'Safari stage time trial. Steering pads on the left, Go and Brake on the right.'
      : 'Safari stage time trial. Arrow keys or W A S D to drive, R to restart, G for the ghost, 1 to 3 to pick a stage, Escape to leave.',
  );
  const stageButtons = STAGES.map((def, i) => `<button type="button" class="tool" data-stage="${def.id}"><b>${def.name}</b><small>${touch ? def.blurb : `${i + 1} · ${def.blurb}`}</small></button>`).join('');
  root.innerHTML = `
    <div class="way"></div>
    <div class="hud clock"><span data-stage-name></span><b data-time>0:00.00</b></div>
    <div class="hud splits" data-splits>${stage.checkpoints.map((_, i) => `<span data-split><i>Split ${i + 1}</i><u>–</u><em></em></span>`).join('')}</div>
    <div class="hud pace" data-pace aria-live="polite" hidden><span>Co-driver</span><b data-pace-now></b><em data-pace-then></em></div>
    <div class="side" data-side>
      <div class="tools" role="group" aria-label="Game controls">
        <button type="button" class="tool" data-tool="ghost" aria-pressed="true">Ghost</button>
        <button type="button" class="tool touch-only" data-tool="tilt" aria-pressed="false">Tilt</button>
        <button type="button" class="tool touch-only" data-tool="sound">Sound</button>
        <button type="button" class="tool touch-only" data-tool="again">Again</button>
        <button type="button" class="tool touch-only" data-tool="leave">Leave</button>
      </div>
    </div>
    <div class="hud call" data-call aria-live="assertive"><b data-call-big></b><strong data-verdict hidden></strong><span class="targets" data-targets hidden></span><span data-call-small></span><span class="stages" data-stages role="group" aria-label="Stage">${stageButtons}</span><small data-credit hidden>Unofficial fan project. Subaru didn't ask for this.</small></div>
    <div class="hud keys"><span>Arrows or WASD · drive</span><span>R · restart</span><span>G · ghost</span><span>M · sound</span><span>Esc · leave</span></div>
    <div class="turn" data-turn><b>Turn your phone sideways</b><span>The stage is drawn for landscape</span></div>`;
  root.prepend(world.canvas);
  const part = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const [timeEl, callEl, callBig, callSmall, credit, wayEl] = [part('[data-time]'), part('[data-call]'), part('[data-call-big]'), part('[data-call-small]'), part('[data-credit]'), part('.way')];
  const [paceEl, paceNow, paceThen, verdictEl, targetsEl, stageName] = [part('[data-pace]'), part('[data-pace-now]'), part('[data-pace-then]'), part('[data-verdict]'), part('[data-targets]'), part('[data-stage-name]')];
  const [side, stagesEl] = [part('[data-side]'), part('[data-stages]')];
  const splitRows = Array.from(root.querySelectorAll<HTMLElement>('[data-split]'));
  const tool = (name: string) => part<HTMLButtonElement>(`[data-tool="${name}"]`);
  let medalEls: HTMLElement[] = [];
  let bestEl: HTMLElement = targetsEl;

  // The top ten for the stage, and the name box on the finish panel. When the box closes the keys come back to the game.
  const openHud = (): BoardHud => createBoardHud(side, callEl, () => root.focus(), openBoard(current.def.id), touch);
  let board = openHud();

  // The colours are read from the game's own screen, which carries the time of day.
  const repaint = (): void => world.applyTheme(root);
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  scheme.addEventListener('change', repaint);
  const resize = (): void => world.resize(window.innerWidth, window.innerHeight);
  resize();
  window.addEventListener('resize', resize);

  // --- The phone held upright: the stage waits, and asks to be turned
  const upright = matchMedia('(orientation: portrait)');
  const waitingForTurn = (): boolean => touch && upright.matches;

  // --- The run: the car, the camera behind it, and the 3-2-1 before it may move
  let chase: Chase = newChase(trial.car);
  /** Seconds since the car lined up. */
  let waited = 0;
  let steer = 0;
  let rolled = 0;
  let dive = 0;
  let lean = 0;
  /** The nose up or down with the slope of the road, in radians. Up is positive. */
  let tilt = 0;
  const dust: Dust[] = [];
  /** The player's best run on this device for this stage, and the one this run is measured against: the best as it stood at the start. */
  const readBest = (): BestRun | null => parseBestRun(read(KEYS.run(current.def.id)));
  let best = readBest();
  let rival = best;
  /** The ghost: the best run on this device as a recording, the one being raced this run, and this run's own recording. */
  const readGhost = (): Ghost | null => parseGhost(read(KEYS.ghost(current.def.id)), current.def.id);
  let ghost = readGhost();
  let racing = ghost;
  let recorder: Recorder = newRecorder();
  let ghostOn = read(KEYS.ghostOn) !== 'off';
  /** How many splits are on the screen, so the rows are only written when one is taken. */
  let shownSplits = -1;
  const restart = (): void => {
    trial = newTrial(stage);
    trial.index = locate(stage, trial.car.x, trial.car.y, trial.index).index;
    chase = newChase(trial.car);
    board.reset();
    waited = steer = dive = lean = tilt = 0;
    dust.length = 0;
    rival = best;
    racing = ghost;
    recorder = newRecorder();
    record(recorder, 0, { ...trial.car, height: trial.height });
    shownSplits = -1;
    // Each run gets its own time of day.
    const light = pickLight(Math.random());
    root.dataset.light = light;
    world.setLight(light);
    repaint();
  };

  /** The stage's own words on the screen: its name, and its times to beat. */
  const labelStage = (): void => {
    const { def } = current;
    stageName.textContent = `${def.name} · Time`;
    targetsEl.innerHTML = `${MEDALS.map((medal) => `<i data-medal="${medal}">${capital(medal)} ${formatTime(def.targets[medal])}</i>`).join('')}<i data-best></i>`;
    medalEls = Array.from(targetsEl.querySelectorAll<HTMLElement>('[data-medal]'));
    bestEl = targetsEl.querySelector<HTMLElement>('[data-best]')!;
    for (const button of stagesEl.querySelectorAll<HTMLElement>('[data-stage]')) button.setAttribute('aria-pressed', String(button.dataset.stage === def.id));
  };
  labelStage();

  /** Change stage. Only between runs: before the clock starts, or after the finish. */
  const pickStage = (def: StageDef): void => {
    if (trial.phase === 'running') return;
    write(KEYS.stage, def.id);
    if (def.id === current.def.id) return;
    let next: Built;
    try {
      next = build(def, touch);
    } catch (err) {
      console.warn('The stage could not be built:', err);
      return;
    }
    world.canvas.remove();
    current = next;
    ({ stage, world, notes } = current);
    root.prepend(world.canvas);
    resize();
    board.dispose();
    board = openHud();
    best = readBest();
    ghost = readGhost();
    labelStage();
    restart();
    root.focus();
  };
  stagesEl.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-stage]')?.dataset.stage;
    if (id) pickStage(stageById(id));
  });

  // --- The ghost on or off, and the phone's tilt
  const showTools = (): void => {
    tool('ghost').setAttribute('aria-pressed', String(ghostOn));
    tool('ghost').textContent = ghostOn ? 'Ghost on' : 'Ghost off';
    tool('tilt').setAttribute('aria-pressed', String(tiltOn));
    tool('tilt').textContent = tiltOn ? 'Tilt on' : 'Tilt off';
  };
  const toggleGhost = (): void => {
    ghostOn = !ghostOn;
    write(KEYS.ghostOn, ghostOn ? 'on' : 'off');
    showTools();
  };

  const pads: TouchPads | null = touch ? createTouchPads(root) : null;
  const tiltNow: Tilt = { beta: 0, gamma: 0, heard: false };
  const onTilt = (e: DeviceOrientationEvent): void => {
    if (e.beta === null || e.gamma === null) return;
    tiltNow.beta = e.beta;
    tiltNow.gamma = e.gamma;
    tiltNow.heard = true;
  };
  /** How far the screen is turned from the phone's own upright, in degrees. */
  const screenAngle = (): number => screen.orientation?.angle ?? Number((window as { orientation?: unknown }).orientation ?? 0);
  let tiltOn = false;
  const setTilt = (on: boolean): void => {
    tiltOn = on;
    pads?.setTilt(on);
    if (on) window.addEventListener('deviceorientation', onTilt);
    else window.removeEventListener('deviceorientation', onTilt);
    write(KEYS.tilt, on ? 'on' : 'off');
    showTools();
  };
  /** Safari asks the player first, and only from a tap. */
  const askForTilt = async (): Promise<boolean> => {
    const ask = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
    if (typeof ask !== 'function') return true;
    try {
      return (await ask.call(DeviceOrientationEvent)) === 'granted';
    } catch {
      return false;
    }
  };
  const toggleTilt = async (): Promise<void> => {
    if (tiltOn) return setTilt(false);
    if (await askForTilt()) setTilt(true);
  };
  // Tilt is remembered, but where Safari must ask first it waits for a tap on the button.
  if (touch && read(KEYS.tilt) === 'on' && typeof (DeviceOrientationEvent as unknown as { requestPermission?: unknown }).requestPermission !== 'function') setTilt(true);
  showTools();

  // --- A phone gets the whole screen, held sideways, if the browser allows it. Only a tap may ask.
  const fill = (): void => {
    if (!touch || document.fullscreenElement || !document.documentElement.requestFullscreen) return;
    document.documentElement
      .requestFullscreen({ navigationUI: 'hide' })
      .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
      .catch(() => undefined);
  };
  root.addEventListener('pointerdown', fill);

  root.querySelector('.tools')!.addEventListener('click', (e) => {
    const name = (e.target as HTMLElement).closest<HTMLElement>('[data-tool]')?.dataset.tool;
    if (name === 'ghost') toggleGhost();
    else if (name === 'tilt') void toggleTilt();
    else if (name === 'sound') host.toggleSound();
    else if (name === 'again') restart();
    else if (name === 'leave') stop();
    if (name !== 'leave') root.focus();
  });

  // --- Keys
  const held = new Set<string>();
  const DRIVE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
  const STAGE_KEYS = STAGES.map((_, i) => `Digit${i + 1}`);
  const onKeyDown = (e: KeyboardEvent): void => {
    // While a name is being typed, the letters are letters.
    if (board.takesKey(e)) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const known = DRIVE_KEYS.has(e.code) || STAGE_KEYS.includes(e.code) || ['KeyR', 'KeyM', 'KeyG', 'Escape', 'Enter', 'Space'].includes(e.code);
    if (!known) return;
    // The page behind uses the same keys to turn its sheets.
    e.preventDefault();
    e.stopPropagation();
    if (DRIVE_KEYS.has(e.code)) held.add(e.code);
    else if (e.repeat) return;
    else if (e.code === 'KeyR' || (e.code === 'Enter' && trial.phase === 'finished')) restart();
    else if (e.code === 'KeyM') host.toggleSound();
    else if (e.code === 'KeyG') toggleGhost();
    else if (STAGE_KEYS.includes(e.code)) pickStage(STAGES[STAGE_KEYS.indexOf(e.code)]!);
    else if (e.code === 'Escape') stop();
  };
  const onKeyUp = (e: KeyboardEvent): void => void held.delete(e.code);
  const letGo = (): void => {
    held.clear();
    pads?.release();
  };
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('blur', letGo);

  const down = (...codes: string[]) => codes.some((c) => held.has(c));
  const throttleHeld = (): boolean => down('ArrowUp', 'KeyW') || (pads?.read().throttle ?? false);
  const readInput = (dt: number): DriveInput => {
    const keys = (down('ArrowRight', 'KeyD') ? 1 : 0) - (down('ArrowLeft', 'KeyA') ? 1 : 0);
    if (tiltOn && keys === 0 && tiltNow.heard) {
      // The phone is a wheel: follow it closely, but not every tremor.
      steer += (tiltSteer(tiltNow.beta, tiltNow.gamma, screenAngle()) - steer) * (1 - Math.exp(-dt * 14));
    } else {
      steer = easeSteer(steer, keys || (pads?.read().steer ?? 0), dt);
    }
    // Until the count reaches Go the pedals do nothing, so the clock cannot start early.
    if (countdown(waited).held) return { throttle: 0, brake: 0, steer };
    const brake = down('ArrowDown', 'KeyS') || (pads?.read().brake ?? false);
    return { throttle: throttleHeld() ? 1 : 0, brake: brake ? 1 : 0, steer };
  };

  // --- Dust from the rear wheels, spray from the ford, and a cloud when the car hits something or lands
  const random = scatter(7);
  let owed = 0;
  const puff = (x: number, y: number, vx: number, vy: number, rise: number, wet: number): void => {
    if (dust.length >= world.mostDust) return;
    dust.push({ x, y, height: trial.height + 0.2, vx, vy, rise, age: 0, life: 0.9 + random() * 0.9, size: 0.9 + random() * 0.7, width: 0, fade: 0, wet });
  };
  /** A cloud thrown out all round the car. */
  const burst = (count: number, reach: number, wet: number): void => {
    for (let i = 0; i < count; i++) {
      const way = random() * Math.PI * 2;
      const pace = reach * (0.3 + random() * 0.7);
      puff(
        trial.car.x + Math.cos(way) * 0.9,
        trial.car.y + Math.sin(way) * 0.9,
        trial.car.vx * 0.3 + Math.cos(way) * pace,
        trial.car.vy * 0.3 + Math.sin(way) * pace,
        (wet ? 3 : 1) + random() * 2.5,
        wet,
      );
    }
  };
  const raiseDust = (dt: number): void => {
    const { forward, sideways } = carSpeeds(trial.car);
    const pace = Math.hypot(forward, sideways);
    // More dust the faster the car goes, and much more when it is sliding. None in the air; in the ford it is spray.
    // A phone's drawing keeps less dust, so it throws up less, and the trail is as long.
    const wet = trial.wet ? 1 : 0;
    const share = current.lite ? 0.45 : 1;
    owed += (pace > 2 && !trial.airborne ? (pace * 1.1 + Math.abs(sideways) * 6) * (wet ? 2.5 : 1) * share : 0) * dt;
    const cos = Math.cos(trial.car.heading);
    const sin = Math.sin(trial.car.heading);
    while (owed >= 1) {
      owed -= 1;
      const [ahead, right] = [WHEELS.rearZ * UNIT, (dust.length % 2 ? 1 : -1) * WHEELS.track * UNIT];
      puff(
        trial.car.x + ahead * cos - right * sin + (random() - 0.5) * 0.6,
        trial.car.y + ahead * sin + right * cos + (random() - 0.5) * 0.6,
        trial.car.vx * 0.12 + (random() - 0.5) * (wet ? 7 : 2),
        trial.car.vy * 0.12 + (random() - 0.5) * (wet ? 7 : 2),
        (wet ? 2.5 : 0.5) + random() * (wet ? 2.5 : 1.1),
        wet,
      );
    }
    let kept = 0;
    for (const d of dust) {
      d.age += dt;
      if (d.age >= d.life) continue;
      const t = d.age / d.life;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      // Dust hangs; water falls back.
      d.height = Math.max(0.05, d.height + d.rise * dt);
      if (d.wet) d.rise -= 7 * dt;
      d.vx *= 1 - 2 * dt;
      d.vy *= 1 - 2 * dt;
      d.width = d.size * (1 + t * 2.6);
      d.fade = (d.wet ? 0.6 : 0.4) * (1 - t);
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
    // The nose follows the slope of the road, and drops a little in the air.
    const slope = trial.airborne ? -0.05 : (groundAt(stage.hazards, trial.progress + 1.5) - groundAt(stage.hazards, trial.progress - 1.5)) / 3;
    tilt += (Math.atan(slope) - tilt) * ease;
    rolled += forward * dt;
  };

  /**
   * Where the ghost is now: on the run's clock, gone a little after it finishes. Once the player is over the
   * line the clock stops, and a ghost stood still on the road would only be in the way, so it goes too.
   */
  const ghostNow = () => (ghostOn && racing && trial.phase !== 'finished' && trial.time <= racing.time + GHOST_LINGER ? ghostAt(racing, trial.time) : null);

  const draw = (): void => {
    const { forward } = carSpeeds(trial.car);
    const { eye, target } = chaseView(chase, trial.car);
    world.draw({
      car: trial.car,
      steer,
      rolled,
      dive: (calm ? 0 : dive) - tilt,
      lean: calm ? 0 : lean,
      lift: trial.height,
      air: trial.airborne ? Math.max(0, trial.height - groundAt(stage.hazards, trial.progress)) : 0,
      herd: herdAt(stage, trial.time),
      // The camera stands on the road behind the car, so a jump is seen from the ground.
      eye: { ...eye, height: eye.height + groundAt(stage.hazards, trial.progress - chase.reach) },
      target: { ...target, height: target.height + trial.height * 0.8 },
      fov: chaseFov(forward, calm),
      dust,
      ghost: ghostNow(),
    });
  };

  const setText = (el: HTMLElement, text: string): void => {
    if (el.textContent !== text) el.textContent = text;
  };

  /** The split rows under the clock: each time as it is taken, green if ahead of the best run and red if behind. */
  const showSplits = (): void => {
    if (shownSplits === trial.splits.length) return;
    shownSplits = trial.splits.length;
    splitRows.forEach((row, i) => {
      const [time, gapEl] = [row.querySelector('u')!, row.querySelector('em')!];
      const split = trial.splits[i];
      const gap = split === undefined ? null : splitGap(rival, i, split);
      time.textContent = split === undefined ? '–' : formatTime(split);
      gapEl.textContent = gap === null ? '' : formatGap(gap);
      row.classList.toggle('ahead', gap !== null && gap < 0);
      row.classList.toggle('behind', gap !== null && gap >= 0);
    });
  };

  const showReadouts = (): void => {
    timeEl.textContent = formatTime(trial.time);
    wayEl.style.width = `${(Math.min(1, Math.max(0, (trial.progress - stage.startAt) / (stage.finishAt - stage.startAt))) * 100).toFixed(1)}%`;
    showSplits();

    // The co-driver: what is coming, and what follows it.
    const pace = trial.phase === 'running' ? callAt(notes, trial.progress) : null;
    paceEl.hidden = pace === null;
    setText(paceNow, pace?.now ?? '');
    setText(paceThen, pace?.then ? `then ${pace.then}` : '');
    paceThen.hidden = !pace?.then;

    const { call, held: waiting } = countdown(waited);
    const finished = trial.phase === 'finished';
    root.classList.toggle('done', finished);
    let big = '';
    let small = '';
    if (finished) {
      big = formatTime(trial.time);
      small = board.note();
    } else if (waiting) {
      big = call ?? '';
      small = 'Get ready';
    } else if (trial.phase === 'ready') {
      big = 'Go';
      small = touch ? 'The clock starts when you press Go' : 'The clock starts when you press Up or W';
    } else if (call) {
      big = call;
    }
    callEl.hidden = big === '';
    setText(callBig, big);
    setText(callSmall, small);
    callSmall.hidden = small === '';
    // The stages can be changed between runs: before the clock starts, and after the finish.
    stagesEl.hidden = trial.phase === 'running';

    // The end screen: the medal, a line for the result, the times to beat, and the fan project note.
    const { targets } = current.def;
    const medal = finished ? medalFor(trial.time, targets) : null;
    for (const name of MEDALS) callBig.classList.toggle(name, medal === name);
    for (const el of medalEls) el.classList.toggle('won', el.dataset.medal === medal);
    verdictEl.hidden = targetsEl.hidden = credit.hidden = !finished;
    if (finished) {
      setText(verdictEl, medal ? `${capital(medal)} · ${verdict(trial.time, targets)}` : verdict(trial.time, targets));
      setText(bestEl, best ? `Your best ${formatTime(best.time)}` : '');
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
    // Held upright, the phone shows only the request to turn it, and the run waits.
    if (waitingForTurn()) {
      letGo();
      host.engine.throttle = false;
      requestAnimationFrame(frame);
      return;
    }
    bank += dt;
    while (bank >= STEP) {
      bank -= STEP;
      const was = trial.phase;
      const before = { forward: carSpeeds(trial.car).forward, heading: trial.car.heading };
      waited += STEP;
      stepTrial(stage, trial, readInput(STEP), STEP);
      settleBody(before, STEP);
      chase = stepChase(chase, trial.car, STEP);
      if (trial.event === 'splash') burst(60, 9, 1);
      else if (trial.event === 'knock') burst(26, 6, 0);
      else if (trial.event === 'land') burst(34, 5, 0);
      else if (trial.event === 'scrape' && random() < 0.2) burst(1, 3, 0);
      raiseDust(STEP);
      if (was === 'running') record(recorder, trial.time, { ...trial.car, height: trial.height });
      if (was === 'running' && trial.phase === 'finished') {
        board.finished(trial.time);
        const kept = keepBest(best, { time: trial.time, splits: trial.splits });
        if (kept && kept !== best) write(KEYS.run(current.def.id), JSON.stringify(kept));
        best = kept;
        // The quickest run on this device becomes the ghost for the next.
        const run = finishGhost(recorder, current.def.id, trial.time);
        if (run && beatsGhost(ghost, run.time)) {
          ghost = run;
          write(KEYS.ghost(current.def.id), ghostText(run));
        }
      }
    }
    // The exhaust synth follows these.
    revs += (engineRpm(carSpeeds(trial.car).forward) - revs) * (1 - Math.exp(-dt * 12));
    host.engine.rpm = revs;
    host.engine.throttle = trial.phase === 'running' && throttleHeld();
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
    window.removeEventListener('deviceorientation', onTilt);
    scheme.removeEventListener('change', repaint);
    host.engine.throttle = false;
    if (document.fullscreenElement) {
      (screen.orientation as ScreenOrientation & { unlock?: () => void }).unlock?.();
      document.exitFullscreen().catch(() => undefined);
    }
    root.remove();
    host.onExit();
  }

  // Cut straight in: the stage goes on the page and its first frame is drawn in the same breath. It has to
  // be on the page first, because the time of day's colours are read from it.
  document.body.append(root);
  restart();
  draw();
  showReadouts();
  root.focus();
  // Started by a tap on the button, a phone may have the whole screen at once.
  fill();
  requestAnimationFrame((now) => {
    previous = now;
    frame(now);
  });

  return { stop };
}
