// chips.js — render a "collected" badge token as a chip element.
// Tokens are display-only (the playable keys live in each level's `unlock`),
// so a token can be a literal key ('%') or a friendly group ('Arrows', 'grid').
//
// When a `keymap` is passed, single-action tokens show the player's *current*
// key for that action — so a remapped split shows e.g. `|` instead of `%`.

import { el } from '../dom.js';
import { TOKEN_TO_ACTION, glyphFor } from '../keymap.js';

const LABELS = {
  '%': { glyph: '%', text: 'split ⇆' },
  '"': { glyph: '"', text: 'split ⇅' },
  'o': { glyph: 'o', text: 'cycle' },
  'z': { glyph: 'z', text: 'zoom' },
  'x': { glyph: 'x', text: 'kill' },
  'c': { glyph: 'c', text: 'new win' },
  'n': { glyph: 'n', text: 'next win' },
  'p': { glyph: 'p', text: 'prev win' },
  ',': { glyph: ',', text: 'rename' },
  'w': { glyph: 'w', text: 'win list' },
  'Arrows': { glyph: '↑↓←→', text: 'move', actions: ['pane-up', 'pane-down', 'pane-left', 'pane-right'] },
  '0-9': { glyph: '0-9', text: 'jump' },
  'grid': { glyph: '★', text: 'Pane Master', special: true },
  'chase': { glyph: '◉', text: 'Dot Hunter', special: true },
};

// Resolve the glyph to show for a token under the active keymap (if any).
function glyphForToken(token, info, keymap) {
  if (!keymap) return info.glyph;
  const single = TOKEN_TO_ACTION[token];
  if (single) return glyphFor(keymap.actionToKey[single]);
  if (info.actions) return info.actions.map((a) => glyphFor(keymap.actionToKey[a])).join('');
  return info.glyph;
}

export function chip(token, keymap) {
  const info = LABELS[token] || { glyph: token, text: '' };
  const c = el('span', 'chip' + (info.special ? ' chip--badge' : ''));
  c.appendChild(el('span', 'chip__glyph', glyphForToken(token, info, keymap)));
  if (info.text) c.appendChild(el('span', 'chip__text', info.text));
  return c;
}
