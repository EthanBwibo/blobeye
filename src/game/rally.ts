/**
 * The Safari stage: a time trial seen from a chase camera behind the car. This file runs the game and is
 * the only part that touches the page. The driving is in `handling.ts`, the road and the clock in
 * `stage.ts`, what lies on the road in `hazards.ts`, the co-driver's calls in `notes.ts`, the splits and
 * medals in `splits.ts`, the camera and the start in `chase.ts`, and the drawing in `world.ts`.
 *
 * It is loaded on demand (see `src/ui/rallyGate.ts`), so nothing here may be imported by the main page.
 */
import './rally.css';
import type { EngineState } from '../engine/model';
import { WHEELS } from '../car/model';
import { createBoardHud } from './boardHud';
import { chaseFov, chaseView, countdown, newChase, stepChase, type Chase } from './chase';
import { angleToRoad, dueCalls, joinCalls, newWrongWay, stepWrongWay, type WrongWay } from './codriver';
import { carSpeeds, easeSteer, engineRpm, gearFor, type DriveInput } from './handling';
import { groundAt } from './hazards';
import { kmh, needleAngle, revMeterSvg, DIAL } from './instruments';
import { pickLight } from './light';
import { minimapSvg } from './minimap';
import { paceNotes, shownAt, type Note } from './notes';
import { caption, cautionSvg, signSvg } from './paceIcons';
import { scatter } from './scenery';
import { MEDALS, TARGETS, formatGap, keepBest, medalFor, parseBestRun, sectorGap, sectorTimes, verdict, type BestRun } from './splits';
import { buildStage, formatTime, herdAt, locate, newTrial, stepTrial, type Stage, type Trial } from './stage';
import { createVoice } from './voice';
import { MOST_DUST, UNIT, createWorld, type Puff, type World } from './world';

export interface RallyHost {
  /** The engine the exhaust synth listens to. The game sets its revs from the road speed. */
  engine: EngineState;
  /** Turn the engine sound on or off, the same as the dock's button. */
  toggleSound(): void;
  /** Called when the player leaves. */
  onExit(): void;
  /** Turn the engine down a little while the co-driver speaks. */
  duckEngine?(on: boolean): void;
}

export interface Rally {
  stop(): void;
}

/** The driving runs in fixed steps, so a run is the same on a slow screen as on a fast one. */
const STEP = 1 / 120;
/** Where the player's best run and its splits are kept on this device. */
const RUN_KEY = 'blobeye.rally.run';
/** Whether the co-driver speaks, kept on this device. */
const VOICE_KEY = 'blobeye.rally.codriver';
/** How long a sector time stays up in the middle of the screen, in seconds. */
const SECTOR_FLASH = 2.6;

interface Built {
  stage: Stage;
  world: World;
  notes: Note[];
}

// The stage and its drawing are built once and kept, so driving it again starts at once.
let built: Built | null = null;
let failed = false;
function build(): Built {
  if (!built) {
    const stage = buildStage();
    built = { stage, world: createWorld(stage), notes: paceNotes(stage) };
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

function readBest(): BestRun | null {
  try {
    return parseBestRun(window.localStorage.getItem(RUN_KEY));
  } catch {
    return null;
  }
}

function readVoiceOn(): boolean {
  try {
    return window.localStorage.getItem(VOICE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function saveVoiceOn(on: boolean): void {
  try {
    window.localStorage.setItem(VOICE_KEY, on ? 'on' : 'off');
  } catch {
    /* it holds for this visit */
  }
}

function saveBest(run: BestRun): void {
  try {
    window.localStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    /* it still stands for this visit */
  }
}

const capital = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

export function startRally(host: RallyHost): Rally {
  const { stage, world, notes } = build();
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let trial: Trial = newTrial(stage);

  // --- The page: the drawing and a few readouts
  const root = document.createElement('div');
  root.id = 'rally';
  root.tabIndex = -1;
  root.setAttribute('role', 'application');
  root.setAttribute('aria-label', 'Safari stage time trial. Arrow keys or W A S D to drive, R to restart, C for the co-driver, Escape to leave.');
  const sectors = stage.checkpoints.length + 1;
  const map = minimapSvg(stage);
  root.innerHTML = `
    <div class="way"></div>
    <div class="hud clock"><span>Safari stage · Time</span><b data-time>0:00.00</b></div>
    <div class="hud splits" data-splits>${Array.from({ length: sectors }, (_, i) => `<span data-split><i>Sector ${i + 1}</i><u>–</u><em></em></span>`).join('')}</div>
    <div class="pace" data-pace hidden><div class="note now" data-pace-now></div><div class="note then" data-pace-then></div></div>
    <p class="sr" aria-live="polite" data-pace-said></p>
    <div class="hud sector" data-sector hidden><span data-sector-name></span><b data-sector-time></b><em data-sector-gap></em></div>
    <div class="wrongway" data-wrongway role="alert" hidden>Wrong way</div>
    <div class="hud minimap" data-map>${map.svg}</div>
    <div class="hud gauges"><div class="dial">${revMeterSvg()}</div><div class="readout"><span>Gear</span><b data-gear>1</b><span>km/h</span><b data-speed>0</b></div></div>
    <button type="button" class="hud codriver" data-codriver aria-pressed="true">Co-driver · on</button>
    <div class="hud call" data-call aria-live="assertive"><b data-call-big></b><strong data-verdict hidden></strong><span class="targets" data-targets hidden>${MEDALS.map(
      (medal) => `<i data-medal="${medal}">${capital(medal)} ${formatTime(TARGETS[medal])}</i>`,
    ).join('')}<i data-best></i></span><span data-call-small></span><small data-credit hidden>Unofficial fan project. Subaru didn't ask for this.</small></div>
    <div class="hud keys"><span>Arrows or WASD · drive</span><span>R · restart</span><span>M · sound</span><span>C · co-driver</span><span>Esc · leave</span></div>`;
  root.prepend(world.canvas);
  const part = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const [timeEl, callEl, callBig, callSmall, credit, wayEl] = [part('[data-time]'), part('[data-call]'), part('[data-call-big]'), part('[data-call-small]'), part('[data-credit]'), part('.way')];
  const [paceEl, paceNow, paceThen, paceSaid, verdictEl, targetsEl, bestEl] = [part('[data-pace]'), part('[data-pace-now]'), part('[data-pace-then]'), part('[data-pace-said]'), part('[data-verdict]'), part('[data-targets]'), part('[data-best]')];
  const [sectorEl, sectorName, sectorTime, sectorGapEl, wrongEl] = [part('[data-sector]'), part('[data-sector-name]'), part('[data-sector-time]'), part('[data-sector-gap]'), part('[data-wrongway]')];
  const [gearEl, speedEl, codriverEl] = [part('[data-gear]'), part('[data-speed]'), part<HTMLButtonElement>('[data-codriver]')];
  const needle = root.querySelector<SVGElement>('[data-needle]')!;
  const mapCar = root.querySelector<SVGCircleElement>('[data-map] [data-car]')!;
  const revsEl = root.querySelector<SVGElement>('svg.revs')!;

  // --- The co-driver's voice, and the button that turns it on and off
  const voice = createVoice(readVoiceOn());
  const showVoice = (): void => {
    codriverEl.textContent = voice.available ? `Co-driver · ${voice.on ? 'on' : 'off'}` : 'Co-driver · no voice here';
    codriverEl.setAttribute('aria-pressed', String(voice.on));
    codriverEl.disabled = !voice.available;
  };
  const toggleVoice = (): void => {
    if (!voice.available) return;
    voice.on = !voice.on;
    saveVoiceOn(voice.on);
    if (!voice.on) voice.hush();
    showVoice();
  };
  codriverEl.addEventListener('click', () => {
    toggleVoice();
    // The keys belong to the game, not the button.
    root.focus();
  });
  showVoice();
  const splitRows = Array.from(root.querySelectorAll<HTMLElement>('[data-split]'));
  const medalEls = Array.from(root.querySelectorAll<HTMLElement>('[data-medal]'));

  // The top ten, and the name box on the finish panel. When the box closes the keys come back to the game.
  const board = createBoardHud(root, callEl, () => root.focus());

  // The colours are read from the game's own screen, which carries the time of day.
  const repaint = (): void => world.applyTheme(root);
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  scheme.addEventListener('change', repaint);
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
  /** The nose up or down with the slope of the road, in radians. Up is positive. */
  let tilt = 0;
  const dust: Dust[] = [];
  /** The player's best run on this device, and the one this run is measured against: the best as it stood at the start. */
  let best = readBest();
  let ghost = best;
  /** How many sectors are on the screen, so the rows are only written when one is done. */
  let shownSplits = -1;
  /** The next call the co-driver has not yet said, and the wrong-way warning. */
  let nextCall = 0;
  let wrong: WrongWay = newWrongWay();
  /** Seconds left on the sector time in the middle of the screen. */
  let flash = 0;
  /** Which calls are drawn at the top, so the icons are only drawn again when they change. */
  let shownCalls = '';
  let ducked = false;
  const restart = (): void => {
    trial = newTrial(stage);
    trial.index = locate(stage, trial.car.x, trial.car.y, trial.index).index;
    chase = newChase(trial.car);
    board.reset();
    waited = steer = dive = lean = tilt = 0;
    dust.length = 0;
    ghost = best;
    shownSplits = -1;
    nextCall = 0;
    wrong = newWrongWay();
    flash = 0;
    voice.hush();
    // Each run gets its own time of day.
    const light = pickLight(Math.random());
    root.dataset.light = light;
    world.setLight(light);
    repaint();
  };

  // --- Keys
  const held = new Set<string>();
  const DRIVE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
  const onKeyDown = (e: KeyboardEvent): void => {
    // While a name is being typed, the letters are letters.
    if (board.takesKey(e)) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const known = DRIVE_KEYS.has(e.code) || ['KeyR', 'KeyM', 'KeyC', 'Escape', 'Enter', 'Space'].includes(e.code);
    if (!known) return;
    // The page behind uses the same keys to turn its sheets.
    e.preventDefault();
    e.stopPropagation();
    if (DRIVE_KEYS.has(e.code)) held.add(e.code);
    else if (e.repeat) return;
    else if (e.code === 'KeyR' || (e.code === 'Enter' && trial.phase === 'finished')) restart();
    else if (e.code === 'KeyM') host.toggleSound();
    else if (e.code === 'KeyC') toggleVoice();
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

  // --- Dust from the rear wheels, spray from the ford, and a cloud when the car hits something or lands
  const random = scatter(7);
  let owed = 0;
  const puff = (x: number, y: number, vx: number, vy: number, rise: number, wet: number): void => {
    if (dust.length >= MOST_DUST) return;
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
    const wet = trial.wet ? 1 : 0;
    owed += (pace > 2 && !trial.airborne ? (pace * 1.1 + Math.abs(sideways) * 6) * (wet ? 2.5 : 1) : 0) * dt;
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
    });
  };

  const setText = (el: HTMLElement, text: string): void => {
    if (el.textContent !== text) el.textContent = text;
  };

  /**
   * The sector rows under the clock: each sector's time as it is done, green if quicker than the same
   * sector of the best run and red if slower. The one just done also flashes up in the middle.
   */
  const showSplits = (): void => {
    const done = sectorTimes(trial.splits, trial.phase === 'finished' ? trial.time : null);
    if (shownSplits === done.length) return;
    const fresh = shownSplits >= 0 && done.length > shownSplits;
    shownSplits = done.length;
    splitRows.forEach((row, i) => {
      const [time, gapEl] = [row.querySelector('u')!, row.querySelector('em')!];
      const sector = done[i];
      const gap = sector === undefined ? null : sectorGap(ghost, i, sector);
      time.textContent = sector === undefined ? '–' : formatTime(sector);
      gapEl.textContent = gap === null ? '' : formatGap(gap);
      // With no best run yet, a sector is the best so far.
      const quicker = sector !== undefined && (gap === null || gap < 0);
      row.classList.toggle('ahead', quicker);
      row.classList.toggle('behind', sector !== undefined && !quicker);
      row.classList.toggle('flash', fresh && i === done.length - 1);
    });
    const last = done.length - 1;
    // On the finish the end screen takes the middle; the row still flashes.
    if (!fresh || last < 0 || trial.phase === 'finished') return;
    const gap = sectorGap(ghost, last, done[last]!);
    setText(sectorName, `Sector ${last + 1}`);
    setText(sectorTime, formatTime(done[last]!));
    setText(sectorGapEl, gap === null ? 'Best so far' : formatGap(gap));
    sectorEl.classList.toggle('ahead', gap === null || gap < 0);
    sectorEl.classList.toggle('behind', gap !== null && gap >= 0);
    // Restart the flash even if the last one is still up.
    sectorEl.hidden = true;
    void sectorEl.offsetWidth;
    sectorEl.hidden = false;
    flash = SECTOR_FLASH;
  };

  /** The calls at the top: the next one large, the one after it smaller beside it. */
  const noteHtml = (note: Note): string => {
    const words = caption(note.sign);
    return `<div class="icons">${signSvg(note.sign)}${cautionSvg(note.sign.caution)}</div>${words ? `<span>${words}</span>` : ''}`;
  };
  const showCalls = (): void => {
    const shown = trial.phase === 'running' && !wrong.shown ? shownAt(notes, trial.progress) : null;
    const key = shown ? `${shown.now}:${shown.then}` : '';
    if (key === shownCalls) return;
    shownCalls = key;
    paceEl.hidden = shown === null;
    if (!shown) return;
    const now = notes[shown.now]!;
    paceNow.innerHTML = noteHtml(now);
    paceNow.setAttribute('aria-label', now.say);
    const then = shown.then === null ? null : notes[shown.then]!;
    paceThen.innerHTML = then ? noteHtml(then) : '';
    paceThen.hidden = then === null;
  };

  /** Rev meter, gear and speed in the corner, and the car on the minimap. */
  const showInstruments = (): void => {
    const { forward } = carSpeeds(trial.car);
    needle.setAttribute('transform', `rotate(${needleAngle(revs).toFixed(1)} ${DIAL.cx} ${DIAL.cy})`);
    revsEl.classList.toggle('over', revs >= 6500);
    setText(gearEl, String(gearFor(forward)));
    setText(speedEl, String(kmh(forward)));
    const [mx, my] = map.project(trial.car.x, trial.car.y);
    mapCar.setAttribute('cx', mx.toFixed(1));
    mapCar.setAttribute('cy', my.toFixed(1));
  };

  /** The co-driver: say each call in time for the car's speed, and say so if the car is going the wrong way. */
  const speak = (dt: number): void => {
    if (trial.phase !== 'running') return;
    const { forward } = carSpeeds(trial.car);
    const turned = stepWrongWay(wrong, angleToRoad(stage, trial.progress, trial.car.heading), dt);
    wrong = turned;
    if (turned.began) {
      voice.say('Wrong way!', true);
      setText(paceSaid, 'Wrong way!');
    }
    wrongEl.hidden = !wrong.shown;
    if (wrong.shown) return;
    const calls = dueCalls(notes, nextCall, trial.progress, forward);
    nextCall = calls.next;
    if (!calls.due.length) return;
    const line = joinCalls(calls.due);
    voice.say(line);
    setText(paceSaid, line);
  };

  const showReadouts = (): void => {
    timeEl.textContent = formatTime(trial.time);
    wayEl.style.width = `${(Math.min(1, Math.max(0, (trial.progress - stage.startAt) / (stage.finishAt - stage.startAt))) * 100).toFixed(1)}%`;
    showSplits();
    showCalls();
    showInstruments();
    if (trial.phase !== 'running') wrongEl.hidden = true;

    const { call, held: waiting } = countdown(waited);
    const finished = trial.phase === 'finished';
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
      small = 'The clock starts when you press Up or W';
    } else if (call) {
      big = call;
    }
    callEl.hidden = big === '';
    setText(callBig, big);
    setText(callSmall, small);
    callSmall.hidden = small === '';

    // The end screen: the medal, a line for the result, the times to beat, and the fan project note.
    const medal = finished ? medalFor(trial.time) : null;
    for (const name of MEDALS) callBig.classList.toggle(name, medal === name);
    for (const el of medalEls) el.classList.toggle('won', el.dataset.medal === medal);
    verdictEl.hidden = targetsEl.hidden = credit.hidden = !finished;
    if (finished) {
      setText(verdictEl, medal ? `${capital(medal)} · ${verdict(trial.time)}` : verdict(trial.time));
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
      if (was === 'running' && trial.phase === 'finished') {
        board.finished(trial.time);
        const kept = keepBest(best, { time: trial.time, splits: trial.splits });
        if (kept && kept !== best) saveBest(kept);
        best = kept;
      }
    }
    speak(dt);
    flash = Math.max(0, flash - dt);
    if (!flash) sectorEl.hidden = true;
    // The engine goes quieter while the co-driver talks.
    const talking = voice.speaking;
    if (talking !== ducked) host.duckEngine?.((ducked = talking));
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
    scheme.removeEventListener('change', repaint);
    host.engine.throttle = false;
    voice.dispose();
    if (ducked) host.duckEngine?.(false);
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
  requestAnimationFrame((now) => {
    previous = now;
    frame(now);
  });

  return { stop };
}
