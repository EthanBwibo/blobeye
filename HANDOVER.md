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
- The rally timeline (sheet 8) and the 2004 specs table (sheet 9), on screens wider than 760px only. Every entry and figure is in `docs/FACTS.md` with its source.
- The Safari stage on sheet 10, the last thing on the page: when the car drives off, the page cuts to a time trial in 3D, seen from a chase camera behind the car, with a 3-2-1 start. Three gravel stages of about a minute each, picked on the start and finish panels: Naivasha, Hell's Gate (narrow, rocky, tight) and Soysambu (fast and open, three crests and a herd of zebra). Arrow keys or WASD, dust, a clock, and a top ten for each stage (name and time).
- **Ghost.** Every run is recorded every tenth of a second; the quickest on this device for each stage is kept and raced next time as a see-through car. G or the Ghost button turns it off.
- **Phones.** Held upright, the stage asks to be turned and waits. Sideways, it shows steering pads on the left and Go and Brake on the right, with tilt steering as an option, and asks for the whole screen. A phone draws fewer pixels, without edge smoothing, with half the bush and less dust.
- On the stage: a co-driver's pace notes at the top of the screen, worked out from the road and what is on it; five hazards (rocks on the road, a ford, a narrow bridge, zebra crossing, and a crest that gets the car airborne); three split times, green or red against the player's best run on this device; bronze, silver and gold times, with a line on the end screen for each result; and dawn, midday or dusk light, picked at random for each run.
- The top ten is shared: a Supabase table, `rally_times`, read and written with `fetch` and the project's publishable key (`VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` in `.env`; see `.env.example`). Every time is also kept on the device, and when the shared board cannot be reached the device's own top ten is shown instead.
- Unit tests on the engine model, the car's shape, the handling, the stage, the chase camera, the start, the scenery, the hazards, the pace notes, the splits and medals, the light, the top ten (shared and on the device) and the drivetrain. Typecheck and production build pass.
- Checked in headless Chrome at 1366×768 and 400×820: all sheets render, no page errors, no sideways scroll, controls respond.

**Not checked**

- **The sound has never been heard by a person.** It was written blind. Expect to tune it (issue: "Tune the exhaust sound by ear").
- **Hell's Gate, Soysambu, the ghost, the stage picker and the touch controls have never been seen or used by a person, or run in a browser at all.** They were written against their tests and the build. Expect to tune the routes and medal times (`src/game/stages.ts`), the ghost's opacity (`GHOST_OPACITY` in `src/game/world.ts`), the tilt (`FULL_TILT` and `STEADY` in `src/game/touch.ts`; the sign has been worked out on paper, not on a phone), and the phone layout (`#rally.touch` in `src/game/rally.css`). Full screen and the landscape lock only work where the browser allows them (not on an iPhone), and only from a tap. The frame rate on a phone has not been measured.
- **The Safari stage has never been driven or seen by a person, and its 3D view has never been run in a browser at all.** It was written blind against its tests and the build: a scripted driver finishes in about 64 seconds without leaving the road. Expect to tune `HANDLING` in `src/game/handling.ts`, `CHASE` in `src/game/chase.ts`, and the colours (`--sky`, `--haze`, `--hills` and the rest in `src/styles.css`) by eye. Its frame rate has not been measured.
- Trees and rocks cannot be hit: the car passes through them.
- **The game's HUD and spoken co-driver have never been seen or heard by a person.** Pace-note icons (`src/game/paceIcons.ts`), the co-driver's timing and voice (`codriver.ts`, `voice.ts`), the rev meter, gear and speed (`instruments.ts`), the minimap (`minimap.ts`), the split gates, sector flashes and the wrong-way banner were checked by tests and build only. Expect to tune `CODRIVER.leadSeconds`, `WRONG_WAY` and the icon shapes by eye and ear. Voices differ by browser and system; with no English voice the browser's default is used.
- **The timeline and specs sheets have never been seen by a person.** They were checked by tests and build only. In particular, the camera key on the timeline sheet (`ABOVE_TIMELINE` in `src/scene/camera.ts`) tips the view down to lift the car above the timeline panel; the amount is a guess.
- **The X-ray sheet and the top ten have never been seen by a person, or run in a browser at all.** They were written against their tests and the build. Expect to tune by eye: the camera (`XRAY` in `src/scene/camera.ts`), where the names sit (`labelAt` in `src/car/drivetrain.ts`), and the list and name box (`src/game/rally.css`). The top ten was written for the top-down game and fitted to the 3D one in a merge.
- **The stage's hazards, pace notes, splits, medals, light and shared top ten have never been seen by a person, or run in a browser at all.** They were written against their tests and the build. Expect to tune by eye and by driving: where the hazards are and how hard they bite (`HAZARDS` and the numbers under it in `src/game/hazards.ts`), the medal times (`TARGETS` in `src/game/splits.ts`, set against the tests' scripted driver, not a person), when a call goes up (`NOTES` in `src/game/notes.ts`), the dawn and midday colours (`src/game/rally.css`), and the zebra, bridge and ford as drawn (`src/game/world.ts`).
- **Reading the shared board has been checked against the live table; sending a time has not.** No test row was put in it. The first real finish is the test.
- `.env` is not committed. Wherever the site is built for the public, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` there, or that build keeps its top ten on the device.
- The shared board trusts the page: anyone can send any name and any time the table allows. The table's own rules (the name's shape, 20 to 600 seconds, read and insert only) are the only guard.
- On the crest the road is drawn without depth, like everything painted on the ground, so the far side of the hump can show through its near side. In a jump the car's shadow stays on the road, but it tips with the body as the nose drops.
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
src/ui/rallyGate.ts       the way in to the Safari stages: fetches the game on the Safari sheet, starts it when the car has gone
src/game/handling.ts      how the car drives on gravel (pure, tested)
src/game/stage.ts         the road, the clock, and a run along it with everything that can happen to the car (pure, tested)
src/game/stages.ts        the three stages as data: route, width, hazards, bush and medal times (pure, tested)
src/game/ghost.ts         the best run recorded every tenth of a second, played back, and stored (pure, tested)
src/game/touch.ts         the touch pads, and steering by tilting the phone (tilt is pure and tested)
src/game/hazards.ts       what lies on the road and what each does: rocks, ford, bridge, zebra, crest (pure, tested)
src/game/notes.ts         the co-driver's pace notes, worked out from the road and its hazards (pure, tested)
src/game/splits.ts        checkpoints, split times against the best run, and the medal times (pure, tested)
src/game/light.ts         dawn, midday or dusk for a run: the sun and the haze (pure, tested); the colours are in rally.css
src/game/chase.ts         the chase camera and the 3-2-1 start (pure, tested)
src/game/scenery.ts       where the trees, rocks and tufts stand (pure, tested)
src/game/world.ts         the stage in 3D: road, bush, hills, sky, the hazards, the car, its dust and its spray
src/game/leaderboard.ts   the top ten: its rules, the shared board in Supabase, and the board on the device it falls back to (tested)
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
- **The time of day's colours** are stage tokens set again on `#rally[data-light]` in `src/game/rally.css`. The game reads its colours from its own screen, not from the page, so a new stage colour needs a value there for dawn and midday as well as in the three theme blocks.
- **Hazards are placed by distance along the road.** Move a route in `stages.ts` and they move with it, perhaps onto a bend: check that stage's hazards again. The pace notes follow by themselves.
- **A stage's `id` is its name in the shared table** and in the keys on the device. Never change one, or its times are lost. Naivasha keeps the keys it had before there were other stages.
- **The car's own details** (number plates, headlamps, rear wing, shadow, window glass) are in `src/scene/carScene.ts`, with their sizes in `src/car/model.ts` and `src/car/plates.ts`. The plates' word is picked once for each load of the page. The paint is a lit `MeshPhysicalMaterial` with a clearcoat (and the lamp lenses, chrome bowls, gold wheels and tyres are lit too), reflecting a CC0 Poly Haven studio HDRI (`public/hdri/`, loaded in `src/scene/studio.ts`) under ACES tone mapping; every other material has tone mapping switched off so the theme colours stay exact. None of these has been seen in a browser: expect to tune them by eye.
- **The drawing runs in slow motion.** `drawingRevsPerSecond` is deliberately far slower than the real rpm. The sound uses real rpm.
- **Adding a sheet** means a `<section class="view">` in `index.html`, a matching entry in `CAMERA_KEYS`, and new values for the sheet numbers below it in `src/scene/camera.ts` (`HERITAGE_SHEET`, `SPECS_SHEET`, `DRIVE_OFF_SHEET`). Renumber the "Sheet N" labels in the markup too.
- **Laptop-only sheets** carry the class `laptop` and are hidden below 760px. They keep their number in the story, so on a phone the scroll from "Hold to rev" to the Safari sheet passes through the camera keys of the timeline and the specs table. The "of 10" and "of 7" counts, and the numbers of the sheets after the X-ray, are `on-wide` and `on-narrow` spans.
- **The X-ray sheet is an aside** (`data-aside`). It is not counted in the story and has no entry in `CAMERA_KEYS`: the story waits on sheet 0 while it is in view, and `xrayAmount` in `src/scene/camera.ts` turns the distance from it into how far the X-ray has come on. So the sheet numbers in `camera.ts` are one less than the page shows on a laptop from the X-ray on.
- **Notes on phones.** Below 760px a panel shows its heading, first sentence and live readout; anything with the class `more` waits behind a More button. Keep each panel's always-visible part short enough that the top 35% of a 360×640 screen stays clear.
- **The dive into the engine** rises first, crosses the nose at about roof height and looks down into the bay before going down (`RISEN` and `OVER_BAY` in `src/scene/camera.ts`). The numbers were worked out on paper and checked by tests, not seen. The bonnet has no stay.
- **Reduced motion** is honoured in the scene, the scrolling, the intro and CSS. Keep it that way. With it on, Lenis is not started at all.
- **Do not add `scroll-behavior: smooth` in CSS.** Lenis drives the scrolling and the two fight.

## Working agreements

- **Commits are authored by Ethan Bwibo only.** Do not add `Co-Authored-By` trailers, "Generated with" lines, session links or any AI attribution to commits, pull requests or files. Use the git identity already configured in this repo.
- Small commits with plain messages in the imperative: `Add turbo to the engine drawing`.
- `npm test` and `npm run build` pass before every commit.
- One issue per branch: `feat/12-smooth-scroll`. Reference the issue in the pull request.
- **No car fact without a source.** Add it to `docs/FACTS.md` first. If it cannot be confirmed, leave it out or label it as illustrative.
- No official logos or brand artwork. Keep the "unofficial fan project" line: it is on the intro card, the specs sheet and the game's end screen.
- **Copy.** A fan who knows the car and does not take it too seriously: dry, short, one joke per sheet at most, and no new car facts.
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
