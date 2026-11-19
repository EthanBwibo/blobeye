/**
 * The top ten on the game's screen: the list in the corner, and the box that asks for a name after a
 * finish. The rules and the storage are in `leaderboard.ts`; this file is only the page.
 */
import { BOARD_SIZE, DEFAULT_NAME, NAME_LENGTH, SEASON, addEntry, cleanName, openBoard, type Entry } from './leaderboard';
import { NAME_REFUSED, offensiveName } from './names';
import { formatTime } from './stage';

export interface BoardHud {
  /** A run has finished in this many seconds: ask for a name to put to it. Its replay, if any, goes with it to the shared board. */
  finished(time: number, replay?: string | null): void;
  /** The line under the finishing time: where the run placed and which keys do what. */
  note(): string;
  /** Offer a key press to the name box first. True if the box is being typed in, and the game should leave the key alone. */
  takesKey(e: KeyboardEvent): boolean;
  /** A new run has begun: a time still waiting for a name is let go. */
  reset(): void;
  /** Take the list and the name box off the screen, for another stage's. */
  dispose(): void;
}

/** Two rows are the same run if they share a name and a time to the thousandth. */
const same = (a: Entry, b: Entry): boolean => a.name === b.name && Math.round(a.time * 1000) === Math.round(b.time * 1000);

/**
 * @param root the game's screen, which gets the list
 * @param call the finish panel, which gets the name box
 * @param onDone called when the name box closes, so the game can take the keys back
 * @param touch the player has a touch screen and no keys, so the notes name the buttons instead
 * @param onTop told each time the top ten arrives, and whether it is the shared board's: this season's times
 *   on it set the medal times (see `paceTargets` in splits.ts), so they need no request of their own
 */
export function createBoardHud(
  root: HTMLElement,
  call: HTMLElement,
  onDone: () => void,
  board = openBoard(),
  touch = false,
  onTop: (entries: readonly Entry[], shared: boolean) => void = () => undefined,
): BoardHud {
  const panel = document.createElement('div');
  panel.className = 'hud board';
  const heading = document.createElement('span');
  heading.className = 'heading';
  const title = document.createElement('span');
  const season = document.createElement('em');
  season.className = 'season';
  season.textContent = `Season ${SEASON}`;
  title.append('Top ten ', season);
  /** Which board is in use: the shared one, or this device's own. */
  const where = document.createElement('small');
  heading.append(title, where);
  const list = document.createElement('ol');
  panel.append(heading, list);
  root.append(panel);

  const form = document.createElement('form');
  form.className = 'name';
  form.hidden = true;
  const label = document.createElement('label');
  label.textContent = 'Name';
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = NAME_LENGTH;
  input.placeholder = DEFAULT_NAME;
  input.autocomplete = 'off';
  input.spellcheck = false;
  label.append(input);
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'skip';
  skip.textContent = 'Skip';
  /** Says so when a name is turned away. Read out as soon as it shows. */
  const refused = document.createElement('small');
  refused.className = 'refused';
  refused.setAttribute('role', 'alert');
  form.append(label, skip, refused);
  const refuse = (shown: boolean): void => {
    refused.textContent = shown ? NAME_REFUSED : '';
    input.setAttribute('aria-invalid', String(shown));
  };
  input.addEventListener('input', () => refuse(false));
  call.append(form);

  /** Whether this board is meant to be the one everyone shares. If it then says otherwise, it has fallen back. */
  const shared = board.scope === 'everyone';
  let entries: Entry[] = [];
  /** The time waiting for a name, the row the last run became, and whether that row is still on its way. */
  let waiting: number | null = null;
  let waitingReplay: string | undefined;
  let mine: Entry | null = null;
  let sending = false;
  let lastName = '';
  /** Taken off the screen: a top ten still on its way is for a stage no longer being driven. */
  let gone = false;

  const draw = (): void => {
    const online = board.scope === 'everyone';
    where.textContent = online ? 'Online' : 'This device only';
    where.className = online ? 'online' : 'local';
    const line = (place: string, entry: Entry): HTMLLIElement => {
      const row = document.createElement('li');
      // Names are text from a stranger: never markup.
      const [n, name, time] = [document.createElement('i'), document.createElement('span'), document.createElement('span')];
      n.textContent = place;
      name.textContent = entry.name;
      time.textContent = formatTime(entry.time);
      row.append(n, name, time);
      row.classList.toggle('me', mine !== null && same(entry, mine));
      return row;
    };
    const rows = entries.map((entry, i) => line(String(i + 1), entry));
    // A run that missed the ten still gets its row, under the rest.
    if (mine && !sending && !entries.some((entry) => same(entry, mine!))) {
      const row = line('–', mine);
      row.classList.add('below');
      rows.push(row);
    }
    if (!rows.length) {
      const none = document.createElement('li');
      none.className = 'none';
      none.textContent = 'No times yet';
      rows.push(none);
    }
    list.replaceChildren(...rows);
  };
  const show = (rows: Entry[]): void => {
    entries = rows.slice(0, BOARD_SIZE);
    draw();
    if (!gone) onTop(entries, board.scope === 'everyone');
  };
  draw();
  board.top().then(show, () => undefined);

  const close = (): void => {
    waiting = null;
    refuse(false);
    form.hidden = true;
    onDone();
  };
  skip.addEventListener('click', () => {
    if (waiting !== null) close();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (waiting === null) return;
    const entry = { name: cleanName(input.value), time: waiting };
    // Everyone sees the names on the board: the worst are turned away here, and the box stays open for another.
    if (offensiveName(entry.name)) {
      refuse(true);
      input.focus();
      input.select();
      return;
    }
    const replay = waitingReplay;
    lastName = entry.name;
    mine = entry;
    sending = true;
    close();
    const settle = (rows: Entry[]): void => {
      // A newer run may have been sent since: only the latest one stops the waiting.
      if (mine === entry) sending = false;
      show(rows);
    };
    // The board falls back to this device by itself. If even that fails, the time still shows for this visit.
    board.add(replay === undefined ? entry : { ...entry, replay }).then(settle, () => settle(addEntry(entries, entry)));
  });

  return {
    finished(time, replay) {
      const rounded = Number(time.toFixed(3));
      mine = null;
      sending = false;
      draw();
      if (!(rounded > 0)) return;
      waiting = rounded;
      waitingReplay = replay ?? undefined;
      form.hidden = false;
      input.value = lastName;
      input.focus();
      input.select();
    },
    note() {
      if (waiting !== null) return touch ? 'Type a name, then Go' : 'Type a name, then Enter · Esc to skip';
      if (sending) return 'Sending your time';
      const keys = touch ? 'Again or Leave, at the top' : 'Enter to go again · Esc to leave';
      if (!mine) return keys;
      const place = entries.findIndex((entry) => same(entry, mine!));
      const placed = place < 0 ? 'Outside the top ten' : place === 0 ? 'Fastest on the board' : `Place ${place + 1} in the top ten`;
      const fellBack = shared && board.scope !== 'everyone' ? ' · Shared board out of reach, showing this device' : '';
      return `${placed}${fellBack} · ${keys}`;
    },
    takesKey(e) {
      if (waiting === null || e.target !== input) return false;
      if (e.code === 'Escape') {
        e.preventDefault();
        close();
      }
      return true;
    },
    reset() {
      if (waiting !== null) close();
    },
    dispose() {
      gone = true;
      waiting = null;
      panel.remove();
      form.remove();
    },
  };
}
