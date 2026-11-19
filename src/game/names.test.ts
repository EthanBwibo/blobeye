import { describe, expect, it } from 'vitest';
import { cleanName } from './leaderboard';
import { NAME_REFUSED, offensiveName } from './names';

const refused = (raw: string): boolean => offensiveName(cleanName(raw));

describe('offensiveName', () => {
  it('turns away the worst words in English, Swahili and Sheng', () => {
    for (const name of ['fuck', 'Shit', 'cunt', 'bitch', 'kumanyoko', 'Matako', 'msenge', 'malaya', 'mboro', 'nyoko', 'msenje', 'kuma', 'Fala', 'mavi']) {
      expect(refused(name), name).toBe(true);
    }
  });
  it('sees through the usual disguises', () => {
    for (const name of ['FUUUCK', 'f.u.c.k', 'f u c k', 'sh1t', 'b1tch', 'Big_Shit', 'ku-ma-nyoko', 'k u m a', 'xXfuckXx', 'MaTaKo99']) {
      expect(refused(name), name).toBe(true);
    }
  });
  it('lets ordinary names by, including ones a short word hides in', () => {
    for (const name of ['Petter S', 'McRae_95-x', 'Cassie', 'Kumar', 'Nazir', 'Mavis', 'Hancock', 'Himalaya', 'Wanjiku', 'Otieno', 'Achieng', 'Kibet', 'Driver', 'Assad', 'Dickson', 'Titus', 'Sexton', 'Glass Ace', 'Shankar Kamau']) {
      expect(refused(name), name).toBe(false);
    }
  });
  it('says what to do instead', () => {
    expect(NAME_REFUSED).toBe('Pick another name');
  });
});
