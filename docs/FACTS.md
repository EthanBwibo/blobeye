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

### Rally record (sheet 8)

| Claim | Source |
| --- | --- |
| Subaru won the WRC manufacturers' championship three times: 1995, 1996 and 1997 | [Wikipedia: Subaru World Rally Team](https://en.wikipedia.org/wiki/Subaru_World_Rally_Team) |
| Colin McRae won the 1995 WRC drivers' championship in a Subaru | [Wikipedia: Subaru World Rally Team](https://en.wikipedia.org/wiki/Subaru_World_Rally_Team) |
| Richard Burns won the 2001 WRC drivers' championship in a Subaru | [Wikipedia: Subaru World Rally Team](https://en.wikipedia.org/wiki/Subaru_World_Rally_Team) |
| Petter Solberg won the 2003 WRC drivers' championship in a Subaru | [Wikipedia: Subaru World Rally Team](https://en.wikipedia.org/wiki/Subaru_World_Rally_Team) |
| Colin McRae won the 1997 Safari Rally in a Subaru Impreza WRC97 | [juwra.com: Safari Rally](https://www.juwra.com/safari.html) |
| Richard Burns won the 2000 Safari Rally in a Subaru Impreza | [juwra.com: Safari Rally](https://www.juwra.com/safari.html) |
| Those are Subaru's only two Safari wins as a WRC round (the list covers 1973 to 2002 and tallies "Subaru (2)") | [juwra.com: Safari Rally](https://www.juwra.com/safari.html) |
| The Safari Rally was part of the World Rally Championship from 1973 until 2002 | [Wikipedia: Safari Rally](https://en.wikipedia.org/wiki/Safari_Rally) |

The page gives year, event and driver only. It names no car for the Safari wins: see "Unverified" below.

### 2004 WRX STI specs (sheet 9)

Japan is the sedan built from June 2004 to May 2005 (model code GH-GDB). Export is the United States 2004 model year.
Figures are shown in the units each source publishes, with no conversions.

| Claim | Source |
| --- | --- |
| Japan: 1,994 cc | [carsensor.net: Impreza STI catalogue, June 2004 to May 2005](https://www.carsensor.net/catalog/subaru/impreza_sti/F002/M005G001/) |
| Japan: 280 PS | [carsensor.net: Impreza STI catalogue, June 2004 to May 2005](https://www.carsensor.net/catalog/subaru/impreza_sti/F002/M005G001/) |
| Japan: 412 N·m (42 kg·m) at 4,400 rpm | [carsensor.net: Impreza STI catalogue, June 2004 to May 2005](https://www.carsensor.net/catalog/subaru/impreza_sti/F002/M005G001/) |
| Japan: vehicle weight 1,460 kg | [carsensor.net: Impreza STI catalogue, June 2004 to May 2005](https://www.carsensor.net/catalog/subaru/impreza_sti/F002/M005G001/) |
| Japan: 6-speed manual | [carsensor.net: Impreza STI catalogue, June 2004 to May 2005](https://www.carsensor.net/catalog/subaru/impreza_sti/F002/M005G001/) |
| Japan: the STI's 2.0 litre engine is labelled EJ207 and is turbocharged | [Wikipedia: Subaru Impreza (second generation)](https://en.wikipedia.org/wiki/Subaru_Impreza_(second_generation)) |
| United States: EJ257, 2,457 cc, horizontally opposed four cylinder, intercooled turbo | [oakos.com: 2004 STI specifications](https://oakos.com/wrx/2004stispecs.htm) |
| United States: 300 hp at 6,000 rpm | [oakos.com: 2004 STI specifications](https://oakos.com/wrx/2004stispecs.htm) |
| United States: 300 lb-ft at 4,000 rpm | [oakos.com: 2004 STI specifications](https://oakos.com/wrx/2004stispecs.htm) |
| United States: weight 3,263 lb (listed as "Weight, Total (MT)") | [oakos.com: 2004 STI specifications](https://oakos.com/wrx/2004stispecs.htm) |
| United States: six forward gears, manual | [oakos.com: 2004 STI specifications](https://oakos.com/wrx/2004stispecs.htm) |
| The US STI got the 2.5 litre EJ257 instead of the EJ207, and its only gearbox is a 6-speed manual | [Wikipedia: Subaru Impreza (second generation)](https://en.wikipedia.org/wiki/Subaru_Impreza_(second_generation)) |

Weak points, in case a better source turns up:

- The Japanese catalogue page labels the grade "2.0 WRX 4WD" inside its Impreza STI catalogue and gives the engine type as "EJ20". It gives no rpm for the power figure, so the page shows none.
- The United States figures rest on one page from a parts retailer, not on Subaru. No Subaru press sheet or magazine test could be fetched to back it up.
- The US weight is that page's "total" weight. It does not call it kerb weight, so the page says only "Weight".

## Illustrative (labelled as simplified on the page)

- **Which bank has the longer run.** The model gives cylinders 2 and 4 the longer pipes. Not yet confirmed.
- **Pulse delays.** `PULSE_DELAY` in `src/engine/model.ts` (60° vs 150°) is exaggerated so the effect is easy to see and hear. Real differences are smaller and change with revs.
- **Pipe routing and engine proportions.** Drawn for clarity, not to scale.
- **The drivetrain on the X-ray sheet.** `src/car/drivetrain.ts` places and sizes the engine, gearbox, centre differential, prop shaft and front and rear differentials so each reads on the drawing. Nothing is measured. The sheet says drive goes to all four wheels, which still needs a source here. It says nothing about what type the differentials are or why the layout is called symmetrical: none of that is sourced yet.
- **Sound.** Synthesised from the model, not sampled from a car.

## Unverified: do not publish yet

- Japanese-market STIs of this era using equal-length headers with a twin-scroll turbo.
- Blobeye production years (2003 to 2005 in `HANDOVER.md`). Wikipedia's heading for this facelift says 2002 to 2005, with the United States getting it in 2003 for the 2004 model year. Not shown on the page.
- Which version of the Impreza won the 2000 Safari Rally. One list says WRC99, another WRC00, so the page names no car.
- Safari Rally wins after it left the world championship (possibly 2004, 2007 and 2017 in African or Kenyan championship rounds). Seen only in a summary, not read from a source, so left out.
- Which body shape competed in which seasons.
- Kerb weight for the United States car, and the rpm of the Japanese power figure.
- Specs for other export markets (Europe, United Kingdom, Australia), and every dimension.

## Known wrong

- A reference poster credits Subaru with manufacturers' titles in 2003 to 2005. Do not reuse figures from the reference posters.
