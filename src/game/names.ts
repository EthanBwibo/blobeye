/**
 * Names on the shared top ten are seen by everyone, so the worst ones are turned away before they are sent.
 * A small blocklist in English, Swahili and Sheng, not a full filter: it stops the obvious, and the
 * spellings people use to slip past one (f.u.c.k, fuuuck, sh1t, kumanyoko).
 */

/** Spelt out of digits and look-alikes. `cleanName` has already dropped the symbols, so only digits are left. */
const LOOKALIKE: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g' };

/**
 * Turned away wherever they turn up in a name, even run together with other words. Only words long or odd
 * enough not to hide inside an ordinary name (no "ass", which is in Cassie).
 */
const ANYWHERE = [
  // English
  'fuck', 'shit', 'cunt', 'nigger', 'nigga', 'faggot', 'fagot', 'bitch', 'whore', 'slut', 'wanker', 'twat', 'dickhead',
  'asshole', 'arsehole', 'bastard', 'retard', 'pussy', 'penis', 'vagina', 'rapist', 'hitler',
  // Swahili
  'kumamako', 'kumamamako', 'kumanyoko', 'kumanyako', 'matako', 'mkundu', 'msenge', 'kahaba', 'mboro', 'kutomba', 'tombwa', 'mshenzi',
  // Sheng
  'nyoko', 'msenje', 'kutombana', 'tombana',
];

/** Turned away only as a whole word of the name: words that are inside ordinary names too ("kuma" in Kumar, "nazi" in Nazir, "malaya" in Himalaya). */
const WHOLE = [
  // English
  'ass', 'arse', 'fag', 'fuk', 'dick', 'cock', 'cum', 'tit', 'tits', 'piss', 'rape', 'porn', 'sex', 'nazi', 'kkk',
  // Swahili and Sheng
  'kuma', 'tomba', 'mavi', 'mafi', 'malaya', 'fala', 'mjinga', 'shoga', 'mbwa', 'ngombe',
];

/** Lower case, digits read as letters, and a letter said over and over said once: "FUUUCK" and "fuck" are one word. */
function plain(word: string): string {
  return word
    .toLowerCase()
    .replace(/[0-9]/g, (d) => LOOKALIKE[d] ?? d)
    .replace(/(.)\1+/g, '$1');
}

const anywhere = ANYWHERE.map(plain);
const whole = new Set(WHOLE.map(plain));

/**
 * Whether a name is one to turn away. Give it the name as `cleanName` leaves it: letters, digits, spaces,
 * _ and -. The name is read word by word, and again with the words run together, so spacing a word out
 * (f u c k) does not hide it.
 */
export function offensiveName(name: string): boolean {
  const words = name.split(/[\s_-]+/).filter(Boolean).map(plain);
  const joined = plain(words.join(''));
  return words.some((w) => whole.has(w)) || anywhere.some((w) => joined.includes(w));
}

/** What the name box says when a name is turned away. */
export const NAME_REFUSED = 'Pick another name';
