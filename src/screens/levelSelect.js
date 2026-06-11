// screens/levelSelect.js — the level map. Cards are locked / unlocked / done.

import { el, clear } from '../dom.js';
import { LEVELS } from '../levels.js';
import { loadProgress, isLevelUnlocked, resetProgress } from '../progress.js';

export function renderLevelSelect(root, nav) {
  const p = loadProgress();

  const screen = el('div', 'screen levels');

  const head = el('div', 'levels__head');
  const back = el('button', 'btn btn--ghost', '← Menu');
  back.addEventListener('click', () => nav.menu());
  head.appendChild(back);
  head.appendChild(el('h2', null, 'Level map'));
  const reset = el('button', 'btn btn--ghost', 'Reset progress');
  reset.addEventListener('click', () => { resetProgress(); nav.levels(); });
  head.appendChild(reset);
  screen.appendChild(head);

  let lastWorld = null;
  const grid = el('div', 'levels__grid');
  LEVELS.forEach((level, i) => {
    if (level.world !== lastWorld) {
      lastWorld = level.world;
      grid.appendChild(el('div', 'levels__world', level.world));
    }
    const completed = p.completed.includes(level.id);
    const unlocked = isLevelUnlocked(LEVELS, level.id);
    const card = el('div', 'card' + (completed ? ' card--done' : unlocked ? ' card--open' : ' card--locked'));

    const top = el('div', 'card__top');
    top.appendChild(el('span', 'card__num', String(i + 1)));
    top.appendChild(el('span', 'card__status', completed ? '✓' : unlocked ? '' : '🔒'));
    card.appendChild(top);

    card.appendChild(el('h3', 'card__title', level.title));
    card.appendChild(el('p', 'card__obj', level.objective));

    if (unlocked) {
      card.classList.add('is-clickable');
      card.addEventListener('click', () => nav.game(level.id));
    }
    grid.appendChild(card);
  });
  screen.appendChild(grid);

  clear(root);
  root.appendChild(screen);
  return null;
}
