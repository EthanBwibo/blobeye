# Handover

For whoever picks this up next, including an AI coding agent such as Claude Code.
Read this first, then `docs/ROADMAP.md`.

## What this is

A fan site for the Subaru Impreza WRX STI (Blobeye, 2003 to 2005), built as a scroll-driven 3D blueprint.
It is a portfolio piece: it has to look finished, run well on a phone, and be accurate.

Reference sites for feel: lusion.co and unseen.co (scrolling and motion), oryzo.ai and poly.app (selling one object).

## Where it stands

**Working**

- Ten sheets on a laptop, seven on a phone. The engine chapter: five sheets, scroll-driven camera, live firing order, exhaust pulses, hold-to-rev, header switch, light and dark themes.
- The X-ray sheet (sheet 2), on screens wider than 760px only: the paint drains out of the body, leaving a line drawing, and a simplified drivetrain shows in gold with its six parts named.
- The rally timeline (sheet 8) and the 2004 specs table (sheet 10), on screens wider than 760px only. Every entry and figure is in `docs/FACTS.md` with its source.
- The Safari stage on sheet 9: when the car drives off, the page cuts to a time trial in 3D, seen from a chase camera behind the car, with a 3-2-1 start. One gravel stage of about a minute, arrow keys or WASD, dust, a clock, and a top ten (name and time) kept in `localStorage`. Laptop only; phones get a note instead.
- Unit tests on the engine model, the car's shape, the handling, the stage, the chase camera, the start, the scenery, the top ten and the drivetrain. Typecheck and production build pass.
- Checked in headless Chrome at 1366×768 and 400×820: all sheets render, no page errors, no sideways scroll, controls respond.

**Not checked**

- **The sound has never been heard by a person.** It was written blind. Expect to tune it (issue: "Tune the exhaust sound by ear").
- **The Safari stage has never been driven or seen by a person, and its 3D view has never been run in a browser at all.** It was written blind against its tests and the build: a scripted driver finishes in about 64 seconds without leaving the road. Expect to tune `HANDLING` in `src/game/handling.ts`, `CHASE` in `src/game/chase.ts`, and the colours (`--sky`, `--haze`, `--hills` and the rest in `src/styles.css`) by eye. Its frame rate has not been measured.
- Trees and rocks cannot be hit: the car passes through them.
- **The timeline and specs sheets have never been seen by a person.** They were checked by tests and build only. In particular, the camera key on the timeline sheet (`ABOVE_TIMELINE` in `src/scene/camera.ts`) tips the view down to lift the car above the timeline panel; the amount is a guess.
- **The X-ray sheet and the top ten have never been seen by a person, or run in a browser at all.** They were written against their tests and the build. Expect to tune by eye: the camera (`XRAY` in `src/scene/camera.ts`), where the names sit (`labelAt` in `src/car/drivetrain.ts`), and the list and name box (`src/game/rally.css`). The top ten was written for the top-down game and fitted to the 3D one in a merge.
- **The top ten is on the device only.** The shared board is not built. It plugs in at `openBoard` in `src/game/leaderboard.ts`, where a comment says what it has to do.
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
index.html              markup for the nine sheets and the control dock
src/main.ts             wires everything together; the frame loop
src/styles.css          all styling; colour tokens at the top
src/engine/model.ts     THE source of truth: cylinders, firing, pulse timing, geometry, revs
src/engine/model.test.ts
src/scene/engineScene.ts  builds and animates the Three.js drawing
src/scene/camera.ts       camera keyframes, one per sheet, and the named sheet numbers
src/audio/exhaust.ts      the synth
src/ui/controls.ts        dock buttons
src/ui/readouts.ts        tachometer, firing strip, pulse timeline
src/ui/scroll.ts          smooth scrolling (Lenis), a snap point per sheet, keyboard paging
src/ui/sheets.ts          which sheets are on the page at this width, and the scroll position in sheets (pure, tested)
src/ui/intro.ts           the title card with the sound choice
src/ui/rallyGate.ts       the way in to the Safari stage: fetches the game on the Safari sheet, starts it when the car has gone
src/game/handling.ts      how the car drives on gravel (pure, tested)
src/game/stage.ts         the road, the clock and the best time (pure, tested)
src/game/chase.ts         the chase camera and the 3-2-1 start (pure, tested)
src/game/scenery.ts       where the trees, rocks and tufts stand (pure, tested)
src/game/world.ts         the stage in 3D: road, bush, hills, sky, the car and its dust
src/game/leaderboard.ts   the top ten: its rules, where it is kept, and the hook for a shared board (pure, tested)
src/game/boardHud.ts      the top ten on the game's screen, and the box that asks for a name
src/game/rally.ts         the game's loop, keys and readouts; with world.ts a separate chunk, loaded on demand
src/car/drivetrain.ts     the X-ray sheet's drivetrain as numbers: simplified, not measured (tested)
src/scene/drivetrainScene.ts  draws it, in a pass of its own over the car
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
- **The game's coordinates.** The driving is flat: x and y seen from above, heading 0 along +x, turning right makes it grow. `world.ts` draws that as x and z with y up. Things painted on the ground do not write depth and are drawn in order, so they never flicker against each other.
- **The drawing runs in slow motion.** `drawingRevsPerSecond` is deliberately far slower than the real rpm. The sound uses real rpm.
- **Adding a sheet** means a `<section class="view">` in `index.html`, a matching entry in `CAMERA_KEYS`, and new values for the sheet numbers below it in `src/scene/camera.ts` (`HERITAGE_SHEET`, `DRIVE_OFF_SHEET`, `LAST_SHEET`). Renumber the "Sheet N" labels in the markup too.
- **Laptop-only sheets** carry the class `laptop` and are hidden below 760px. They keep their number in the story, so on a phone the scroll from "Hold to rev" to the Safari sheet passes through the timeline's camera key. The "of 10" and "of 7" counts, and the numbers of the sheets after the X-ray, are `on-wide` and `on-narrow` spans.
- **The X-ray sheet is an aside** (`data-aside`). It is not counted in the story and has no entry in `CAMERA_KEYS`: the story waits on sheet 0 while it is in view, and `xrayAmount` in `src/scene/camera.ts` turns the distance from it into how far the X-ray has come on. So the sheet numbers in `camera.ts` are one less than the page shows on a laptop from the X-ray on.
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
