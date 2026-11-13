# Handover

For whoever picks this up next, including an AI coding agent such as Claude Code.
Read this first, then `docs/ROADMAP.md`.

## What this is

A fan site for the Subaru Impreza WRX STI (Blobeye, 2003 to 2005), built as a scroll-driven 3D blueprint.
It is a portfolio piece: it has to look finished, run well on a phone, and be accurate.

Reference sites for feel: lusion.co and unseen.co (scrolling and motion), oryzo.ai and poly.app (selling one object).

## Where it stands

**Working**

- The engine chapter: five sheets, scroll-driven camera, live firing order, exhaust pulses, hold-to-rev, header switch, light and dark themes.
- 12 unit tests on the engine model. Typecheck and production build pass.
- Checked in headless Chrome at 1366×768 and 400×820: all sheets render, no page errors, no sideways scroll, controls respond.

**Not checked**

- **The sound has never been heard by a person.** It was written blind. Expect to tune it (issue: "Tune the exhaust sound by ear").
- No real phone, no Safari, no Firefox.
- Several car facts. See `docs/FACTS.md`.

**Known issues**

- Audio uses the deprecated `ScriptProcessorNode`.
- Fonts come from Google Fonts; offline the page falls back to system fonts.
- The JS bundle is about 560 kB (140 kB gzipped), nearly all Three.js.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test
npm run build
```

Node 20+. On Windows, this folder is inside OneDrive: pause sync or exclude `node_modules` before `npm install`, or OneDrive will try to upload tens of thousands of files and may lock some mid-install.

## Map of the code

```
index.html              markup for the five sheets and the control dock
src/main.ts             wires everything together; the frame loop
src/styles.css          all styling; colour tokens at the top
src/engine/model.ts     THE source of truth: cylinders, firing, pulse timing, geometry, revs
src/engine/model.test.ts
src/scene/engineScene.ts  builds and animates the Three.js drawing
src/scene/camera.ts       camera keyframes, one per sheet
src/audio/exhaust.ts      the synth
src/ui/controls.ts        dock buttons
src/ui/readouts.ts        tachometer, firing strip, pulse timeline
src/ui/scroll.ts          smooth scrolling (Lenis), a snap point per sheet, keyboard paging
src/ui/intro.ts           the title card with the sound choice
src/ui/layout.ts          phone layout: the More button on the notes, dock height, space left for the drawing
docs/FACTS.md           what is confirmed, illustrative, unverified
docs/ROADMAP.md         milestones and issues
scripts/issues.json     the same roadmap as data
scripts/github-setup.mjs  creates labels, milestones and issues on GitHub
```

### How a frame works

1. `stepEngine` advances rpm and crank angle.
2. `scene.render` positions pistons, rods, pulses and the camera from that state and the scroll position.
3. `updateReadouts` updates the DOM readouts from the same state.
4. Separately, the audio callback reads the same state to decide when to fire thumps.

Add a new behaviour by putting the numbers in `model.ts` first, testing them, then drawing and sounding them.

### Things that are easy to get wrong

- **Colours live in CSS.** The scene reads `--paper`, `--ink`, `--gold`, `--fire` via `applyTheme()`. Add a colour as a token in all three theme blocks, never as a literal in TypeScript.
- **Coordinates.** +z is the front of the car, -x is the car's right, +y is up. Cylinder 1 is front right.
- **The drawing runs in slow motion.** `drawingRevsPerSecond` is deliberately far slower than the real rpm. The sound uses real rpm.
- **Adding a sheet** means a `<section class="view">` in `index.html` and a matching entry in `CAMERA_KEYS`.
- **Notes on phones.** Below 760px a panel shows its heading, first sentence and live readout; anything with the class `more` waits behind a More button. Keep each panel's always-visible part short enough that the top 35% of a 360×640 screen stays clear.
- **Reduced motion** is honoured in the scene, the scrolling, the intro and CSS. Keep it that way. With it on, Lenis is not started at all.
- **Do not add `scroll-behavior: smooth` in CSS.** Lenis drives the scrolling and the two fight.

## Working agreements

- **Commits are authored by Ethan Bwibo only.** Do not add `Co-Authored-By` trailers, "Generated with" lines, session links or any AI attribution to commits, pull requests or files. Use the git identity already configured in this repo.
- Small commits with plain messages in the imperative: `Add turbo to the engine drawing`.
- `npm test` and `npm run build` pass before every commit.
- One issue per branch: `feat/12-smooth-scroll`. Reference the issue in the pull request.
- **No car fact without a source.** Add it to `docs/FACTS.md` first. If it cannot be confirmed, leave it out or label it as illustrative.
- No official logos or brand artwork. Keep the "unofficial fan project" line.
- Do not commit 3D models, sounds or images without recording their licence.

## What to do next, in order

1. **Listen to it.** Run it, start the engine, hold rev, switch headers. Write down what sounds wrong, then tune `src/audio/exhaust.ts`.
2. Decide how to get the car body (licensed model or built in code). This gates all of milestone 2.
3. Carry on down `docs/ROADMAP.md`.

## Decisions already made

| Decision | Why |
| --- | --- |
| Blobeye as the hero car | It carries the 2003-era rally story; Hawkeye can be a later toggle. |
| Blueprint style, not photoreal | Makes a stylised model look deliberate, and loads fast. |
| Vite + TypeScript + Three.js, no React | The page is one canvas and a few panels; a framework adds weight without paying for itself. Revisit if the UI grows. |
| Sound synthesised, not sampled | No licensing questions, and it stays in step with the drawing. |
| Engine chapter first | It needed no licensed assets and proves the scroll, camera and sound systems every other chapter reuses. |
