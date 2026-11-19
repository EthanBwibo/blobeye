/**
 * The co-driver's voice: the browser's own speech (speechSynthesis), in an English voice where there is
 * one. When the browser has no speech, `available` is false and saying things does nothing.
 *
 * Calls are never left in the browser's own queue, where they would come out late. One line is spoken
 * at a time; the next waits here, and any line whose moment has passed (its `fresh` check says no) is
 * dropped, and if it is already being said, cut off with speechSynthesis.cancel().
 */
import { CODRIVER, measureDelay, pickVoice } from './codriver';

export interface SayOptions {
  /** Cut off whatever is being said, and anything waiting. */
  urgent?: boolean;
  /** Whether the line is still worth saying if it starts `delay` seconds from now. Checked until it ends. */
  fresh?: (delay: number) => boolean;
}

export interface Voice {
  readonly available: boolean;
  on: boolean;
  /** Say a call. */
  say(text: string, options?: SayOptions): void;
  /** Drop stale lines, cutting one off mid-word if need be. Call every frame. */
  tick(): void;
  /** How long this voice takes to start speaking once asked, in seconds, as measured. */
  readonly delay: number;
  /** True while a call is being said. */
  readonly speaking: boolean;
  /** Stop talking, and drop anything waiting to be said. */
  hush(): void;
  /** Stop listening for voices. */
  dispose(): void;
}

interface Line {
  text: string;
  fresh: (delay: number) => boolean;
}

export function createVoice(on: boolean): Voice {
  const speech = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  let voice: SpeechSynthesisVoice | null = null;
  // The list of voices often arrives a moment after the page loads.
  const choose = (): void => void (voice = speech ? pickVoice(speech.getVoices()) : null);
  choose();
  speech?.addEventListener('voiceschanged', choose);

  let delay: number = CODRIVER.delay;
  let current: (Line & { started: boolean }) | null = null;
  let waiting: Line | null = null;
  const always = (): boolean => true;

  const stop = (): void => {
    current = null;
    waiting = null;
    speech?.cancel();
  };

  const start = (line: Line): void => {
    if (!speech) return;
    const utterance = new SpeechSynthesisUtterance(line.text);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? 'en-GB';
    utterance.rate = 1.3;
    const asked = performance.now();
    const playing = { ...line, started: false };
    current = playing;
    utterance.onstart = () => {
      playing.started = true;
      delay = measureDelay(delay, (performance.now() - asked) / 1000);
    };
    const done = (): void => {
      if (current !== playing) return;
      current = null;
      next();
    };
    utterance.onend = done;
    utterance.onerror = done;
    speech.speak(utterance);
  };

  /** Start the line waiting, if it is still worth saying. */
  const next = (): void => {
    const line = waiting;
    waiting = null;
    if (line && line.fresh(delay)) start(line);
  };

  const self: Voice = {
    available: speech !== null,
    on: on && speech !== null,
    say(text, { urgent = false, fresh = always } = {}) {
      if (!speech || !self.on) return;
      if (urgent) stop();
      const line = { text, fresh };
      if (current) {
        // Only the newest line waits: it is the nearer one, and anything older has been overtaken.
        waiting = line;
        self.tick();
      } else start(line);
    },
    tick() {
      if (!speech || !current) return;
      if (waiting && !waiting.fresh(delay)) waiting = null;
      // A line still waiting on the browser is due to start after the voice's delay; one being said, now.
      if (!current.fresh(current.started ? 0 : delay)) {
        const rest = waiting;
        stop();
        if (rest) {
          waiting = rest;
          next();
        }
      }
    },
    get delay() {
      return delay;
    },
    get speaking() {
      return !!speech && self.on && (current !== null || speech.speaking || speech.pending);
    },
    hush() {
      stop();
    },
    dispose() {
      speech?.removeEventListener('voiceschanged', choose);
      stop();
    },
  };
  return self;
}
