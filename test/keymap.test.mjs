// Unit tests for the key-remapping layer (src/keymap.js): the .tmux.conf parser
// and config → keymap resolution. No framework — assertions that throw on fail.
// Run: node test/keymap.test.mjs

import {
  parseTmuxConf, resolveKeymap, keysToActions, keysForActions, glyphFor,
  DEFAULT_KEY_TO_ACTION,
} from '../src/keymap.js';

let passed = 0;
function ok(cond, msg) {
  if (!cond) { console.error('  ✗ ' + msg); throw new Error('FAILED: ' + msg); }
  passed++;
  console.log('  ✓ ' + msg);
}
const km = (config) => resolveKeymap({ config });

console.log('defaults (no config)');
{
  const k = resolveKeymap({});
  ok(k.prefix === 'C-b', 'prefix defaults to C-b');
  ok(k.keyToAction['%'] === 'split-h', '% → split-h by default');
  ok(k.keyToAction['"'] === 'split-v', '" → split-v by default');
  ok(k.keyToAction['ArrowLeft'] === 'pane-left', 'ArrowLeft → pane-left by default');
  ok(k.actionToKey['kill-pane'] === 'x', 'kill-pane taught as x by default');
  ok(k.warnings.length === 0, 'no warnings for empty config');
}

console.log('prefix remap');
{
  ok(parseTmuxConf('set -g prefix C-a').prefix === 'C-a', 'set -g prefix C-a parses');
  ok(parseTmuxConf('set-option -g prefix C-x').prefix === 'C-x', 'set-option -g prefix form recognised');
  ok(km('set -g prefix C-a').prefixLabel === 'C-a', 'resolved prefixLabel is C-a');
  const m = km('set -g prefix M-a');
  ok(m.prefix === 'C-b', 'non-Ctrl prefix (M-a) falls back to default');
  ok(m.warnings.some((w) => /prefix/i.test(w)), 'non-Ctrl prefix warns');
}

console.log('split rebinds (| and -, the classic)');
{
  const k = km('bind | split-window -h\nbind - split-window -v');
  ok(k.keyToAction['|'] === 'split-h', '| → split-h');
  ok(k.keyToAction['-'] === 'split-v', '- → split-v');
  ok(k.actionToKey['split-h'] === '|', 'split-h now taught as |');
  ok(k.keyToAction['%'] === undefined, 'old % no longer triggers split (one key per action)');
}

console.log('vim-style pane nav (hjkl)');
{
  const k = km('bind h select-pane -L\nbind j select-pane -D\nbind k select-pane -U\nbind l select-pane -R');
  ok(k.keyToAction['h'] === 'pane-left', 'h → pane-left');
  ok(k.keyToAction['j'] === 'pane-down', 'j → pane-down');
  ok(k.keyToAction['k'] === 'pane-up', 'k → pane-up');
  ok(k.keyToAction['l'] === 'pane-right', 'l → pane-right');
  ok(k.keyToAction['ArrowLeft'] === undefined, 'arrows released after remap to hjkl');
}

console.log('command aliases + flags');
{
  const k = km('bind v splitw -h\nbind s selectp -L\nbind r resizep -Z');
  ok(k.keyToAction['v'] === 'split-h', 'splitw -h alias → split-h');
  ok(k.keyToAction['s'] === 'pane-left', 'selectp -L alias → pane-left');
  ok(k.keyToAction['r'] === 'zoom', 'resizep -Z alias → zoom');
}

console.log('cycle-pane + window jumps');
{
  ok(km('bind a select-pane -t :.+').keyToAction['a'] === 'cycle-pane', 'select-pane -t :.+ → cycle-pane');
  ok(km('bind 5 select-window -t 5').keyToAction['5'] === 'select-window-5', 'select-window -t 5 → select-window-5');
}

console.log('quoted keys');
{
  ok(km("bind '\"' split-window -v").keyToAction['"'] === 'split-v', "quoted '\"' parses as the key \"");
}

console.log('ignored / unsupported lines warn, never crash');
{
  ok(km('bind r source-file ~/.tmux.conf').warnings.some((w) => /source-file/.test(w)), 'unsupported command warns');
  ok(km('bind -n C-h select-pane -L').warnings.some((w) => /no-prefix/i.test(w)), 'no-prefix (-n) bind warns + skipped');
  ok(km('bind -T copy-mode v send -X begin-selection').warnings.some((w) => /key-table/i.test(w)), 'non-prefix key-table warns');
  ok(km('bind C-h select-pane -L').warnings.some((w) => /post-prefix/i.test(w)), 'modified command key warns');
  ok(km('set -g mouse on\n# a comment\n\nbind | split-window -h').keyToAction['|'] === 'split-h',
    'unrelated directives, comments and blanks are skipped cleanly');
}

console.log('key collisions warn (binding over a default)');
{
  const k = km('bind x split-window -h'); // x is kill-pane's default key
  ok(k.keyToAction['x'] === 'split-h', 'user bind wins the contested key');
  ok(k.warnings.some((w) => /lost key/.test(w)), 'collision is reported as a warning');
}

console.log('helpers');
{
  const acts = keysToActions(['%', '"', 'ArrowLeft', 'nope']);
  ok(acts.has('split-h') && acts.has('split-v') && acts.has('pane-left'), 'keysToActions maps level keys → actions');
  ok(!acts.has(undefined) && acts.size === 3, 'keysToActions drops unknown keys');
  ok(DEFAULT_KEY_TO_ACTION['z'] === 'zoom', 'DEFAULT_KEY_TO_ACTION exported and correct');
  ok(glyphFor('ArrowLeft') === '←' && glyphFor('|') === '|', 'glyphFor renders arrows + passthrough');
  const k = km('bind h select-pane -L\nbind l select-pane -R');
  ok(keysForActions(k, ['pane-left', 'pane-right']).join('') === 'hl', 'keysForActions reflects remap');
}

console.log(`\nAll ${passed} assertions passed ✅`);
