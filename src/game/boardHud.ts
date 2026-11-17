/**
 * The top ten on the game's screen: the list in the corner, and the box that asks for a name when a run
 * makes the list. The rules and the storage are in `leaderboard.ts`; this file is only the page.
 */
import { BOARD_SIZE, DEFAULT_NAME, NAME_LENGTH, addEntry, cleanName, openBoard, placeOf, type Entry } from './leaderboard';
import { formatTime } from './stage';

export interface BoardHud {
  /** A run has finished in this many seconds. If it makes the top ten, ask for a name. */
  finished(time: number): void;
  /** Whether the run that just finished is the fastest on the board. */
  isBest(): boolean;
  /** The line under the finishing time: where the run placed and which keys do what. */
  note(): string;
  /** Offer a key press to the name box first. True if the box is being typed in, and the game should leave the key alone. */
  takesKey(e: KeyboardEvent): boolean;
  /** A new run has begun: a time still waiting for a name is let go. */
  reset(): void;
}

/**
 * @param root the game's screen, which gets the list
 * @param call the finish panel, which gets the name box
 * @param onDone called when the name box closes, so the game can take the keys back
 */
export function createBoardHud(root: HTMLElement, call: HTMLElement, onDone: () => void, board = openBoard()): BoardHud {
  const panel = document.createElement('div');
  panel.className = 'hud board';
  const heading = document.createElement('span');
  heading.textContent = `Top ten · ${board.scope}`;
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
  form.append(label);
  call.append(form);

  let entries: Entry[] = [];
  /** The time waiting for a name, the place the last run took (from 0), and the row it became. */
  let waiting: number | null = null;
  let place: number | null = null;
  let mine: Entry | null = null;
  let lastName = '';

  const draw = (): void => {
    const rows = entries.map((entry, i) => {
      const row = document.createElement('li');
      // Names are text from a visitor (or, on a shared board, a stranger): never markup.
      const [n, name, time] = [document.createElement('i'), document.createElement('span'), document.createElement('span')];
      n.textContent = String(i + 1);
      name.textContent = entry.name;
      time.textContent = formatTime(entry.time);
      row.append(n, name, time);
      row.classList.toggle('me', mine !== null && entry.name === mine.name && entry.time === mine.time);
      return row;
    });
    if (!rows.length) {
      const none = document.createElement('li');
      none.className = 'none';
      none.textContent = 'No times yet';
      rows.push(none);
    }
    list.replaceChildren(...rows);
  };
  draw();
  const show = (rows: Entry[]): void => {
    entries = rows.slice(0, BOARD_SIZE);
    draw();
  };
  board.top().then(show, () => undefined);

  const close = (): void => {
    waiting = null;
    form.hidden = true;
    onDone();
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (waiting === null) return;
    const entry = { name: cleanName(input.value), time: waiting };
    lastName = entry.name;
    mine = entry;
    close();
    // If the board cannot be reached, the time still shows for this visit.
    board.add(entry).then(show, () => show(addEntry(entries, entry)));
  });

  return {
    finished(time) {
      const rounded = Number(time.toFixed(3));
      place = placeOf(entries, rounded);
      mine = null;
      draw();
      if (place === null) return;
      waiting = rounded;
      form.hidden = false;
      input.value = lastName;
      input.focus();
      input.select();
    },
    isBest: () => place === 0,
    note() {
      const placed = place === null ? 'Stage complete' : place === 0 ? 'New best' : `Place ${place + 1} in the top ten`;
      if (waiting !== null) return `${placed} · Type a name, then Enter · Esc to skip`;
      return `${placed} · Enter to go again · Esc to leave`;
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
      place = null;
      if (waiting !== null) close();
    },
  };
}
