// screens/menu.js — title screen.

import { el, clear } from '../dom.js';
import { loadProgress } from '../progress.js';
import { LEVELS } from '../levels.js';

const LOGO = String.raw`
 _                                  _
| |_ _ __ ___  _   ___  __      ___| |_ ___  _ __ _   _
| __| '_ ` + '`' + String.raw` _ \| | | \ \/ /____/ __| __/ _ \| '__| | | |
| |_| | | | | | |_| |>  <_____\__ \ || (_) | |  | |_| |
 \__|_| |_| |_|\__,_/_/\_\    |___/\__\___/|_|   \__, |
                                                 |___/`;

export function renderMenu(root, nav) {
  const p = loadProgress();
  const done = p.completed.length;
  const total = LEVELS.length;

  const screen = el('div', 'screen menu');
  screen.appendChild(el('pre', 'menu__logo', LOGO));
  screen.appendChild(el('p', 'menu__tag', "Build tmux muscle memory the way vim-adventures builds vim's — one chord at a time."));

  const actions = el('div', 'menu__actions');
  const resumeLevel = nextLevel(p);
  const play = el('button', 'btn btn--primary btn--lg',
    done === 0 ? 'Start playing' : (done >= total ? 'Replay' : `Continue — ${resumeLevel.title}`));
  play.addEventListener('click', () => nav.game(resumeLevel.id));
  const map = el('button', 'btn btn--ghost btn--lg', 'Level map');
  map.addEventListener('click', () => nav.levels());
  const gym = el('button', 'btn btn--ghost btn--lg', '🥊 Reflex Gym');
  gym.addEventListener('click', () => nav.reflex());
  const keys = el('button', 'btn btn--ghost btn--lg', '⌨ Keybindings');
  keys.addEventListener('click', () => nav.settings());
  actions.append(play, map, gym, keys);
  screen.appendChild(actions);

  if (done > 0) screen.appendChild(el('p', 'muted', `Progress: ${done}/${total} levels`));

  screen.appendChild(el('p', 'menu__foot', "Tip: it's all simulated in your browser — your keystrokes never touch a real shell."));

  clear(root);
  root.appendChild(screen);
  return null; // no listeners to clean up
}

function nextLevel(progress) {
  const firstUndone = LEVELS.find((l) => !progress.completed.includes(l.id));
  return firstUndone || LEVELS[0];
}
