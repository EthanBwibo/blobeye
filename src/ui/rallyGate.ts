import type { EngineState } from '../engine/model';

export interface RallyGateHost {
  engine: EngineState;
  /** The game is about to take the screen and the keys. */
  onStart(): void;
  /** The player has left the game. */
  onExit(): void;
  /** Turn the engine sound down a little while the co-driver speaks, and back up after. */
  duckEngine(on: boolean): void;
}

export interface RallyGate {
  /**
   * Call once per frame. `onSheet` is true on the Safari sheet and `clear` once the visitor is well away
   * from it. When the car has driven off (`carGone`) the stage starts by itself, once per visit to the sheet.
   */
  update(onSheet: boolean, clear: boolean, carGone: boolean): void;
}

/**
 * The way in to the Safari stages, on their own sheet. The game is a separate chunk: it is fetched and
 * built when the visitor reaches this sheet, and cuts in when the car has driven off or the button is pressed.
 *
 * On a touch screen the game brings its own pads, so the note says so instead of naming keys.
 */
export function initRallyGate(host: RallyGateHost): RallyGate {
  const button = document.getElementById('rallyStart') as HTMLButtonElement | null;
  const note = document.getElementById('rallyNote');
  if (!button || !note) return { update() {} };

  if (matchMedia('(hover: none) and (pointer: coarse)').matches) note.textContent = 'Touch pads, or tilt to steer · Best held sideways';

  let game: Promise<typeof import('../game/rally')> | null = null;
  const fetchGame = () => (game ??= import('../game/rally'));
  let busy = false;
  let armed = true;
  const idle = button.textContent;
  const behind = [document.querySelector('main'), document.getElementById('dock')].filter((el) => el !== null);

  const begin = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    armed = false;
    button.disabled = true;
    button.textContent = 'Loading the stage';
    let started = false;
    try {
      const { startRally } = await fetchGame();
      host.onStart();
      started = true;
      for (const el of behind) el.inert = true;
      startRally({
        engine: host.engine,
        toggleSound: () => document.getElementById('sound')?.click(),
        duckEngine: host.duckEngine,
        onExit() {
          for (const el of behind) el.inert = false;
          host.onExit();
          busy = false;
          button.disabled = false;
          button.textContent = 'Drive it again';
          button.focus({ preventScroll: true });
        },
      });
    } catch (err) {
      console.warn('The stage could not be loaded:', err);
      if (started) {
        for (const el of behind) el.inert = false;
        host.onExit();
      }
      game = null;
      busy = false;
      button.disabled = false;
      button.textContent = idle;
      note.textContent = 'The stage could not be loaded · Check the connection and try again';
    }
  };
  button.addEventListener('click', () => void begin());

  return {
    update(onSheet, clear, carGone) {
      if (clear) armed = true;
      if (!onSheet || busy) return;
      // Fetch the game and build its world ahead of time, so the cut into it is instant. A failed fetch is tried again on the button.
      if (!game) fetchGame().then((m) => m.warmRally(), () => (game = null));
      if (armed && carGone) void begin();
    },
  };
}
