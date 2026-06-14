// main.js — entry point + tiny router. Swaps the #app contents between the
// screens and makes sure each screen's listeners are cleaned up before the next
// one mounts (the game screen attaches a global keydown handler).

import { renderMenu } from './screens/menu.js';
import { renderLevelSelect } from './screens/levelSelect.js';
import { startGame } from './screens/game.js';
import { renderSettings } from './screens/settings.js';
import { startReflexGym } from './screens/reflexGym.js';
import { loadProgress } from './progress.js';
import { setSoundEnabled } from './sound.js';

const app = document.getElementById('app');
let cleanup = null;

// Honor the saved sound preference (defaults to on).
setSoundEnabled(loadProgress().settings.sound !== false);

const nav = {
  menu: () => go('menu'),
  levels: () => go('levels'),
  game: (levelId) => go('game', { levelId }),
  settings: () => go('settings'),
  reflex: () => go('reflex'),
};

function go(view, params = {}) {
  if (cleanup) { cleanup(); cleanup = null; }
  if (view === 'menu') cleanup = renderMenu(app, nav);
  else if (view === 'levels') cleanup = renderLevelSelect(app, nav);
  else if (view === 'game') cleanup = startGame(app, params.levelId, nav);
  else if (view === 'settings') cleanup = renderSettings(app, nav);
  else if (view === 'reflex') cleanup = startReflexGym(app, nav);
}

go('menu');
