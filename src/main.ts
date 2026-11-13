import './styles.css';
import { ExhaustSynth } from './audio/exhaust';
import { createEngineState, stepEngine } from './engine/model';
import { createEngineScene, type EngineScene } from './scene/engineScene';
import { bindControls } from './ui/controls';
import { initIntro } from './ui/intro';
import { clearFraction, initNotes, trackDockHeight } from './ui/layout';
import { updateReadouts } from './ui/readouts';
import { initScroll } from './ui/scroll';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = createEngineState();
const synth = new ExhaustSynth(state);

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const cylinderLabels = [1, 2, 3, 4].map((n) => document.getElementById(`t${n}`)!);
const frontLabel = document.getElementById('tfront')!;
initNotes();

const sheets = Array.from(document.querySelectorAll<HTMLElement>('.view'));

// The drawing needs WebGL. Without it the notes and readouts still work.
let scene: EngineScene | null = null;
try {
  scene = createEngineScene(canvas, state, { cylinders: cylinderLabels, front: frontLabel }, reducedMotion);
} catch (err) {
  console.warn('3D drawing unavailable:', err);
  document.getElementById('nogl')!.hidden = false;
  for (const label of [...cylinderLabels, frontLabel]) label.hidden = true;
}

bindControls(state, {
  onHeaders: (mode) => scene?.setHeaders(mode),
  onEngineToggle: (running) => ExhaustSynth.supported && synth.setRunning(running),
});

if (scene) {
  const s = scene;
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
initIntro(initScroll(sheets, reducedMotion), reducedMotion, (withSound) => {
  if (withSound) document.getElementById('sound')?.click();
});

/** Scroll position measured in sheets: 0 at the first sheet, 4 at the last. */
function currentSheet(): number {
  const y = window.scrollY;
  for (let i = sheets.length - 1; i >= 0; i--) {
    const top = sheets[i]!.offsetTop;
    if (y >= top || i === 0) {
      const next = sheets[i + 1]?.offsetTop ?? top + sheets[i]!.offsetHeight;
      const within = Math.max(0, Math.min(1, (y - top) / Math.max(1, next - top)));
      return Math.min(sheets.length - 1, i + within);
    }
  }
  return 0;
}

let previous = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - previous) / 1000);
  previous = now;
  stepEngine(state, dt, reducedMotion);
  synth.update();
  scene?.render(dt, currentSheet());
  updateReadouts(state, scene?.firing ?? [], cylinderLabels);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
