# Roadmap

Milestones and the issues inside them. GitHub is the source of truth once the repo is set up; this file is the same list for reading offline. It is generated from `scripts/issues.json`.

## M0 · Foundation

Project scaffold, the engine prototype ported into modules, tests and CI.

- [x] Scaffold Vite + TypeScript + Three.js project · `infra`
- [x] Port the engine prototype into modules with a tested model · `engine` `3d` `audio`
- [x] Run tests and build on every push · `infra`

## M1 · Engine chapter

Make the boxer engine explainer feel finished: sound tuned by ear, smooth scrolling, an intro, phone layout, accessibility.

- [ ] Tune the exhaust sound by ear · `audio` `engine`
- [ ] Move the synth from ScriptProcessorNode to an AudioWorklet · `audio` `performance`
- [ ] Verify which bank has the longer exhaust run, and the equal-length claim · `research` `content` `engine`
- [ ] Phone layout: the notes cover the engine on the rumble sheet · `design`
- [ ] Smooth scrolling and a snap point per sheet · `design` `3d`
- [ ] Intro screen with a sound choice · `design` `audio`
- [ ] Accessibility pass on the engine chapter · `accessibility`
- [ ] Performance: measure on a mid-range Android phone · `performance`
- [ ] Add the turbo, intercooler, intake and timing belt to the drawing · `3d` `engine`
- [ ] Self-host the fonts · `performance` `infra`

## M2 · The car

Put a Blobeye around the engine: hero stop, X-ray drivetrain stop, and the camera dive into the engine bay.

- [ ] Decide how to get a Blobeye body: licensed model or built in code · `3d` `research`
- [ ] Asset pipeline for 3D models · `3d` `performance` `infra`
- [ ] Hero stop: the car on the drawing sheet · `3d` `design`
- [ ] X-ray stop: symmetrical all-wheel drive · `3d` `content`
- [ ] Camera dive from the car into the engine bay · `3d` `design`
- [ ] Hawkeye facelift toggle · `3d` `content`

## M3 · Heritage

The rally years told accurately, with every claim sourced.

- [ ] Research the rally timeline and source every claim · `research` `content`
- [ ] Heritage stop: a timeline you scroll through · `design` `content` `3d`

## M4 · Safari Rally game

A small top-down time trial on a Naivasha-style gravel stage.

- [ ] Game design note for the Safari Rally time trial · `game` `design`
- [ ] Car handling on gravel · `game`
- [ ] A Naivasha-style stage · `game` `design`
- [ ] Touch controls for the game · `game` `accessibility`
- [ ] Stage times and a leaderboard · `game`
- [ ] Load the game only when the player reaches it · `game` `performance`

## M5 · Launch

Specs stop, deploy, polish, and the portfolio entry.

- [ ] Specs stop with verified numbers · `content` `research`
- [ ] Deploy to Vercel · `infra`
- [ ] Share card, metadata and icons · `design` `infra`
- [ ] Cross-browser and device check · `performance` `accessibility`
- [ ] Fan-project and trademark check · `content`
- [ ] README with a demo clip, and a portfolio entry · `content`
