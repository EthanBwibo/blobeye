/**
 * The co-driver's voice: the browser's own speech (speechSynthesis), in an English voice where there is
 * one. When the browser has no speech, `available` is false and saying things does nothing.
 */
import { pickVoice } from './codriver';

export interface Voice {
  readonly available: boolean;
  on: boolean;
  /** Say a call. An urgent one cuts off whatever is being said. */
  say(text: string, urgent?: boolean): void;
  /** True while a call is being said. */
  readonly speaking: boolean;
  /** Stop talking, and drop anything waiting to be said. */
  hush(): void;
  /** Stop listening for voices. */
  dispose(): void;
}

export function createVoice(on: boolean): Voice {
  const speech = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  let voice: SpeechSynthesisVoice | null = null;
  // The list of voices often arrives a moment after the page loads.
  const choose = (): void => void (voice = speech ? pickVoice(speech.getVoices()) : null);
  choose();
  speech?.addEventListener('voiceschanged', choose);

  const self: Voice = {
    available: speech !== null,
    on: on && speech !== null,
    say(text, urgent = false) {
      if (!speech || !self.on) return;
      if (urgent) speech.cancel();
      const line = new SpeechSynthesisUtterance(text);
      if (voice) line.voice = voice;
      line.lang = voice?.lang ?? 'en-GB';
      line.rate = 1.15;
      speech.speak(line);
    },
    get speaking() {
      return !!speech && self.on && (speech.speaking || speech.pending);
    },
    hush() {
      speech?.cancel();
    },
    dispose() {
      speech?.removeEventListener('voiceschanged', choose);
      speech?.cancel();
    },
  };
  return self;
}
