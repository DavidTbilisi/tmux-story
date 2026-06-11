// screens/settings.js — the Keybindings screen. Paste or upload your
// ~/.tmux.conf; the game parses a subset (prefix + rebinds for the commands it
// simulates) and drills *your* chords. A live preview shows the resulting key
// for every action, plus anything that was ignored.

import { el, clear } from '../dom.js';
import { loadProgress, saveSettings } from '../progress.js';
import {
  resolveKeymap, parseTmuxConf, glyphFor,
  ACTION_META, DEFAULT_ACTION_TO_KEY,
} from '../keymap.js';

const PLACEHOLDER = [
  '# paste your ~/.tmux.conf here',
  'set -g prefix C-a',
  'bind | split-window -h',
  'bind - split-window -v',
  'bind h select-pane -L',
  'bind j select-pane -D',
  'bind k select-pane -U',
  'bind l select-pane -R',
].join('\n');

// Rows shown in the preview: one per action, with the digit-jumps collapsed.
const PREVIEW_ROWS = Object.keys(DEFAULT_ACTION_TO_KEY)
  .filter((a) => !a.startsWith('select-window-') || a === 'select-window-0')
  .map((a) => (a === 'select-window-0'
    ? { action: a, label: 'jump to window', range: '0–9' }
    : { action: a, label: ACTION_META[a].label }));

export function renderSettings(root, nav) {
  const screen = el('div', 'screen settings');

  const head = el('div', 'levels__head');
  const back = el('button', 'btn btn--ghost', '← Menu');
  back.addEventListener('click', () => nav.menu());
  head.append(back, el('h2', null, 'Keybindings'));
  screen.appendChild(head);

  screen.appendChild(el('p', 'muted',
    'Paste your ~/.tmux.conf (or upload it) and the game will drill your own chords. '
    + 'It understands prefix changes and rebinds for the commands it simulates — '
    + 'splits, pane navigation, zoom/kill, and window commands. Anything else is ignored.'));

  const grid = el('div', 'settings__grid');

  // ---- left column: the editor ----
  const left = el('div', 'settings__col');
  left.appendChild(el('h3', 'side__h', 'Your tmux config'));

  const ta = el('textarea', 'settings__ta');
  ta.value = loadProgress().settings.config || '';
  ta.setAttribute('spellcheck', 'false');
  ta.setAttribute('placeholder', PLACEHOLDER);
  left.appendChild(ta);

  const actions = el('div', 'settings__actions');

  // Upload: a hidden file input wrapped in a button-styled <label>.
  const upload = el('label', 'btn btn--ghost');
  upload.textContent = 'Upload .conf';
  const file = el('input', 'settings__file');
  file.type = 'file';
  file.accept = '.conf,.tmux,text/plain';
  upload.appendChild(file);
  file.addEventListener('change', () => {
    const f = file.files && file.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { ta.value = String(reader.result || ''); renderPreview(); };
    reader.readAsText(f);
    file.value = ''; // allow re-uploading the same file
  });

  const apply = el('button', 'btn btn--primary', 'Apply');
  apply.addEventListener('click', () => {
    saveSettings({ config: ta.value, prefix: parseTmuxConf(ta.value).prefix || 'C-b' });
    flash('Saved — your chords are live. Jump into any level to drill them.');
  });

  const reset = el('button', 'btn btn--ghost', 'Reset to defaults');
  reset.addEventListener('click', () => {
    ta.value = '';
    saveSettings({ config: '', prefix: 'C-b' });
    flash('Reset to stock tmux keys.');
    renderPreview();
  });

  actions.append(upload, apply, reset);
  left.appendChild(actions);

  const flashEl = el('p', 'settings__flash muted', '');
  left.appendChild(flashEl);
  function flash(msg) { flashEl.textContent = msg; }

  // ---- right column: live preview ----
  const right = el('div', 'settings__col');
  right.appendChild(el('h3', 'side__h', 'Resulting chords'));
  const preview = el('div', 'settings__preview');
  right.appendChild(preview);

  grid.append(left, right);
  screen.appendChild(grid);

  clear(root);
  root.appendChild(screen);

  // Preview reflects the textarea live (before Apply) so editing gives feedback.
  function renderPreview() {
    clear(preview);
    const km = resolveKeymap({ config: ta.value });

    const pfx = el('div', 'settings__pfx');
    pfx.appendChild(el('span', 'muted', 'prefix'));
    pfx.appendChild(el('kbd', null, km.prefixLabel));
    if (km.prefixLabel !== 'C-b') pfx.appendChild(el('span', 'settings__chg', 'changed'));
    preview.appendChild(pfx);

    const table = el('div', 'settings__table');
    for (const rowDef of PREVIEW_ROWS) {
      const row = el('div', 'settings__rowk');
      const chord = el('div', 'settings__chord');
      chord.appendChild(el('kbd', null, km.prefixLabel));
      chord.appendChild(el('span', 'keycard__then', 'then'));
      const keyTxt = rowDef.range || glyphFor(km.actionToKey[rowDef.action]);
      chord.appendChild(el('kbd', null, keyTxt));
      row.appendChild(chord);
      row.appendChild(el('span', 'settings__label', rowDef.label));
      if (!rowDef.range && km.actionToKey[rowDef.action] !== DEFAULT_ACTION_TO_KEY[rowDef.action]) {
        row.classList.add('is-changed');
        row.appendChild(el('span', 'settings__chg', 'changed'));
      }
      table.appendChild(row);
    }
    preview.appendChild(table);

    if (km.warnings.length) {
      const warn = el('div', 'settings__warn');
      warn.appendChild(el('h4', null, `Ignored (${km.warnings.length})`));
      const ul = el('ul', 'settings__warnlist');
      for (const w of km.warnings) ul.appendChild(el('li', null, w));
      warn.appendChild(ul);
      preview.appendChild(warn);
    }
  }

  ta.addEventListener('input', renderPreview);
  renderPreview();

  return null; // no global listeners to clean up
}
