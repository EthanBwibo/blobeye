/**
 * The number plates: white at the front and yellow at the back, the way Kenyan plates are, with a word
 * in place of a registration. Pure data. None of these is a real registration.
 */

export const PLATE_WORDS = ['GAPP3D', 'URM0M', 'SUBAWUU', 'BRAAAP', 'STUTUTU', 'B0XER', 'RUMBL3', 'MURRAM', 'SIDEWYS', 'N0 GRIP'] as const;
export type PlateWord = (typeof PLATE_WORDS)[number];

/** The word for a roll of the dice from 0 up to (not including) 1. */
export function pickPlate(roll: number): PlateWord {
  const safe = Number.isFinite(roll) ? Math.min(0.999999, Math.max(0, roll)) : 0;
  return PLATE_WORDS[Math.floor(safe * PLATE_WORDS.length)]!;
}

/** Where each plate sits and how big it is, in car units: its middle height, its width and its height. */
export const PLATES = {
  front: { y: 11.2, width: 9.4, height: 2.3 },
  rear: { y: 17.85, width: 9.4, height: 2.5 },
} as const;
