# Facts and sources

Nothing about the car goes on the site unless it is in the **Confirmed** list with a source.
Fan posters and memory are not sources.

## Confirmed

| Claim | Source |
| --- | --- |
| EJ-series firing order is 1-3-2-4 | [Haltech: EJ25 engine](https://support.haltech.com/portal/en/kb/articles/ej25-engine) |
| Cylinders 1 and 3 are on the right bank, 2 and 4 on the left; cylinder 1 is front right as seen from the driver's seat | [Haltech: EJ25 engine](https://support.haltech.com/portal/en/kb/articles/ej25-engine) |
| The rumble comes from unequal-length exhaust headers: the engine fires evenly, but one side's exhaust travels further, so pulses reach the collector unevenly | [SlashGear](https://www.slashgear.com/1970710/subaru-unequal-length-headers-rumble-sound) |
| Equal-length headers remove the burble | [SlashGear](https://www.slashgear.com/1970710/subaru-unequal-length-headers-rumble-sound) |

## Illustrative (labelled as simplified on the page)

- **Which bank has the longer run.** The model gives cylinders 2 and 4 the longer pipes. Not yet confirmed.
- **Pulse delays.** `PULSE_DELAY` in `src/engine/model.ts` (60° vs 150°) is exaggerated so the effect is easy to see and hear. Real differences are smaller and change with revs.
- **Pipe routing and engine proportions.** Drawn for clarity, not to scale.
- **The drivetrain on the X-ray sheet.** `src/car/drivetrain.ts` places and sizes the engine, gearbox, centre differential, prop shaft and front and rear differentials so each reads on the drawing. Nothing is measured. The sheet names the parts and says nothing about how they work, what type they are or why the layout is called symmetrical: none of that is sourced yet.
- **Sound.** Synthesised from the model, not sampled from a car.

## Unverified: do not publish yet

- Japanese-market STIs of this era using equal-length headers with a twin-scroll turbo.
- Blobeye production years as shown in the hero line (2003 to 2005).
- Subaru's manufacturers' titles (believed 1995 to 1997) and drivers' titles (believed McRae 1995, Burns 2001, Solberg 2003).
- Safari Rally wins and which body shape won them.
- Every power, torque, weight and dimension figure.

## Known wrong

- A reference poster credits Subaru with manufacturers' titles in 2003 to 2005. Do not reuse figures from the reference posters.
