import './styles.css';
import { ExhaustSynth } from './audio/exhaust';
import { createEngineState, stepEngine } from './engine/model';
import { DRIVETRAIN } from './car/drivetrain';
import { DRIVE_OFF_SHEET, xrayAmount } from './scene/camera';
import { createEngineScene, type EngineScene } from './scene/engineScene';
import { bindControls } from './ui/controls';
import { initIntro } from './ui/intro';
import { initRallyGate } from './ui/rallyGate';
import { clearFraction, initNotes, trackDockHeight } from './ui/layout';
import { updateReadouts } from './ui/readouts';
import { initScroll } from './ui/scroll';
import { offsetFrom, sheetAt, visibleSheets } from './ui/sheets';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = createEngineState();
const synth = new ExhaustSynth(state);

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const cylinderLabels = [1, 2, 3, 4].map((n) => document.getElementById(`t${n}`)!);
const frontLabel = document.getElementById('tfront')!;
initNotes();
// The names on the X-ray sheet's drawing come from the same list as the parts themselves.
const xraySheet = document.getElementById('xraySheet');
const partLabels = (xraySheet ? DRIVETRAIN : []).map((part) => {
  const label = document.createElement('div');
  label.className = 'tag part';
  label.textContent = part.label;
  canvas.parentElement!.append(label);
  return label;
});

// Every sheet has a number in the story, which the camera follows. Phones leave some sheets out.
const allSheets = Array.from(document.querySelectorAll<HTMLElement>('.view'));
let sheets = visibleSheets(allSheets);
window.addEventListener('resize', () => (sheets = visibleSheets(allSheets)));

// The drawing needs WebGL. Without it the notes and readouts still work.
let scene: EngineScene | null = null;
try {
  scene = createEngineScene(canvas, state, { cylinders: cylinderLabels, front: frontLabel, parts: partLabels }, reducedMotion);
} catch (err) {
  console.warn('3D drawing unavailable:', err);
  document.getElementById('nogl')!.hidden = false;
  for (const label of [...cylinderLabels, frontLabel, ...partLabels]) label.hidden = true;
}

bindControls(state, {
  onHeaders: (mode) => scene?.setHeaders(mode),
  onEngineToggle: (running) => ExhaustSynth.supported && synth.setRunning(running),
});

if (scene) {
  const s = scene;
  // In development only: lets a script pose the car for screenshots.
  if (import.meta.env.DEV) Object.assign(window, { holdTurn: s.holdTurn, openBonnet: s.openBonnet });
  // The drawing sits in the space the notes and dock leave, so re-measure when either changes size.
  const fit = () => s.resize(clearFraction());
  window.addEventListener('resize', fit);
  trackDockHeight(fit);
  void document.fonts?.ready.then(fit);
  fit();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => s.applyTheme());
  new MutationObserver(() => s.applyTheme()).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
}

// The intro holds the page until the visitor chooses; "with sound" presses the dock's own engine button.
const scroll = initScroll(sheets.map((s) => s.el), reducedMotion);
initIntro(scroll, reducedMotion, (withSound) => {
  if (withSound) document.getElementById('sound')?.click();
});

// The Safari stage takes over the screen, the keys and the engine's revs while it is being driven.
let playing = false;
const rally = initRallyGate({
  engine: state,
  onStart() {
    playing = true;
    scroll.lock();
  },
  duckEngine: (on) => synth.duck(on),
  onExit() {
    playing = false;
    scene?.park();
    scroll.unlock();
  },
});

/** Scroll position measured in sheets of the story: 0 at the first sheet. */
function currentSheet(): number {
  return sheetAt(
    window.scrollY,
    sheets.map((s) => ({ top: s.el.offsetTop, index: s.index })),
  );
}

/** How far the X-ray has come on, 0 to 1. Always 0 on phones, where its sheet is left out. */
function currentXray(): number {
  const i = sheets.findIndex((s) => s.el === xraySheet);
  if (i < 0) return 0;
  return xrayAmount(offsetFrom(window.scrollY, sheets.map((s) => s.el.offsetTop), i));
}

let previous = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - previous) / 1000);
  previous = now;
  synth.update();
  if (!playing) {
    const sheet = currentSheet();
    stepEngine(state, dt, reducedMotion);
    scene?.render(dt, sheet, currentXray());
    updateReadouts(state, scene?.firing ?? [], cylinderLabels);
    // On the Safari sheet the car drives off, and the stage takes its place.
    rally.update(Math.abs(sheet - DRIVE_OFF_SHEET) < 0.03, sheet < DRIVE_OFF_SHEET - 0.1, scene?.carGone ?? false);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
