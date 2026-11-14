import type { EngineState } from '../engine/model';
import { NARROW_WIDTH } from '../scene/camera';

export interface RallyGateHost {
  engine: EngineState;
  /** The game is about to take the screen and the keys. */
  onStart(): void;
  /** The player has left the game. */
  onExit(): void;
}

export interface RallyGate {
  /**
   * Call once per frame. `onSheet` is true on the last sheet and `clear` once the visitor is well away
   * from it. When the car has driven off (`carGone`) the stage starts by itself, once per visit to the sheet.
   */
  update(onSheet: boolean, clear: boolean, carGone: boolean): void;
}

/**
 * The way in to the Safari stage, on the last sheet. The game is a separate chunk: it is fetched when
 * the visitor reaches this sheet, and starts when the car has driven off or the button is pressed.
 *
 * The game is keyboard only, so on phones and tablets the button gives way to a note.
 */
export function initRallyGate(host: RallyGateHost): RallyGate {
  const button = document.getElementById('rallyStart') as HTMLButtonElement | null;
  const note = document.getElementById('rallyNote');
  if (!button || !note) return { update() {} };

  if (window.innerWidth <= NARROW_WIDTH || !matchMedia('(hover: hover) and (pointer: fine)').matches) {
    button.hidden = true;
    note.textContent = 'The stage needs a keyboard · Open this page on a laptop to drive it';
    return { update() {} };
  }

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
    try {
      const { startRally } = await fetchGame();
      host.onStart();
      for (const el of behind) el.inert = true;
      startRally({
        engine: host.engine,
        toggleSound: () => document.getElementById('sound')?.click(),
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
      if (!game) fetchGame().catch(() => (game = null)); // a failed fetch is tried again on the button
      if (armed && carGone) void begin();
    },
  };
}
