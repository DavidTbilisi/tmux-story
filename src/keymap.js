// keymap.js — key remapping. The game has a fixed set of *actions* (split a
// pane, kill a pane, …); which physical key triggers each one is configurable.
//
// This module owns:
//   • ACTION_META            — every action the game simulates (label/glyph)
//   • the DEFAULT key↔action maps (stock tmux bindings)
//   • parseTmuxConf(text)    — a small ~/.tmux.conf reader (a subset)
//   • resolveKeymap(settings)— turn a saved config into the maps input/UI read
//
// It has NO imports (no DOM, no game state), so it's pure and unit-testable in
// node, and other modules can depend on it without import cycles.
//
// A "key" here is a JS KeyboardEvent.key value: a single char ('%', 'h', '1')
// or a named key ('ArrowLeft'). That's what input.js compares against.

// ---- the action catalogue --------------------------------------------------

// label  – shown on keycards / chips / lock messages
// group  – coarse bucket (used by the settings preview), not load-bearing
// glyph  – fallback display glyph when no key is bound (rare)
export const ACTION_META = {
  'split-h':       { label: 'split ⇆',      category: 'pane',   group: 'split',  glyph: '%' },
  'split-v':       { label: 'split ⇅',      category: 'pane',   group: 'split',  glyph: '"' },
  'cycle-pane':    { label: 'cycle pane',   category: 'pane',   group: 'nav',    glyph: 'o' },
  'pane-left':     { label: 'pane ←',       category: 'pane',   group: 'nav',    glyph: '←' },
  'pane-right':    { label: 'pane →',       category: 'pane',   group: 'nav',    glyph: '→' },
  'pane-up':       { label: 'pane ↑',       category: 'pane',   group: 'nav',    glyph: '↑' },
  'pane-down':     { label: 'pane ↓',       category: 'pane',   group: 'nav',    glyph: '↓' },
  'zoom':          { label: 'zoom',         category: 'pane',   group: 'pane',   glyph: 'z' },
  'kill-pane':     { label: 'kill pane',    category: 'pane',   group: 'pane',   glyph: 'x' },
  'new-window':    { label: 'new window',   category: 'window', group: 'window', glyph: 'c' },
  'next-window':   { label: 'next window',  category: 'window', group: 'window', glyph: 'n' },
  'prev-window':   { label: 'prev window',  category: 'window', group: 'window', glyph: 'p' },
  'rename-window': { label: 'rename window',category: 'window', group: 'window', glyph: ',' },
  'window-list':   { label: 'window list',  category: 'window', group: 'window', glyph: 'w' },
};
for (let i = 0; i <= 9; i++) {
  ACTION_META['select-window-' + i] = {
    label: 'window ' + i, category: 'window', group: 'jump', glyph: String(i),
  };
}

// Stock tmux bindings: action → the key that triggers it by default.
export const DEFAULT_ACTION_TO_KEY = {
  'split-h': '%', 'split-v': '"', 'cycle-pane': 'o',
  'pane-left': 'ArrowLeft', 'pane-right': 'ArrowRight', 'pane-up': 'ArrowUp', 'pane-down': 'ArrowDown',
  'zoom': 'z', 'kill-pane': 'x',
  'new-window': 'c', 'next-window': 'n', 'prev-window': 'p', 'rename-window': ',', 'window-list': 'w',
};
for (let i = 0; i <= 9; i++) DEFAULT_ACTION_TO_KEY['select-window-' + i] = String(i);

function invert(o) {
  const r = {};
  for (const k in o) r[o[k]] = k;
  return r;
}

// Stock bindings the other way: key → action. Levels author their `unlock`
// lists in these default keys; keysToActions() translates them to action ids.
export const DEFAULT_KEY_TO_ACTION = invert(DEFAULT_ACTION_TO_KEY);

// ---- display helpers -------------------------------------------------------

const KEY_GLYPH = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', ' ': 'Space',
};

// A key → the glyph we show for it (arrows become symbols; printable keys are
// shown as-is).
export function glyphFor(key) {
  if (key == null) return '';
  return KEY_GLYPH[key] || key;
}

// Translate a level's unlock list (authored as default keys) into action ids.
export function keysToActions(keys) {
  const out = new Set();
  for (const k of keys || []) {
    const a = DEFAULT_KEY_TO_ACTION[k];
    if (a) out.add(a);
  }
  return out;
}

// Given a keymap and a list of action ids, return the distinct glyphs to show
// (in order). Used by keycards: ['pane-left','pane-up',…] → ['←','↑',…].
export function keysForActions(keymap, actions) {
  const seen = new Set();
  const out = [];
  for (const a of actions || []) {
    const g = glyphFor(keymap.actionToKey[a]);
    if (g && !seen.has(g)) { seen.add(g); out.push(g); }
  }
  return out;
}

// Reward/badge tokens (stored in progress) that stand for a single action, so
// a collected chip can show the player's *current* key for it.
export const TOKEN_TO_ACTION = {
  '%': 'split-h', '"': 'split-v', 'o': 'cycle-pane', 'z': 'zoom', 'x': 'kill-pane',
  'c': 'new-window', 'n': 'next-window', 'p': 'prev-window', ',': 'rename-window', 'w': 'window-list',
};

// ---- .tmux.conf parsing ----------------------------------------------------

// tmux command aliases → canonical command name.
const ALIASES = {
  splitw: 'split-window', selectp: 'select-pane', killp: 'kill-pane', resizep: 'resize-pane',
  neww: 'new-window', next: 'next-window', prev: 'previous-window', selectw: 'select-window',
  renamew: 'rename-window', lastp: 'last-pane',
};

// Shell-ish tokenizer that respects single/double quotes (so `bind '"' …`
// yields the token `"`). Good enough for the bind/set lines we care about.
function tokenize(line) {
  const out = [];
  let cur = '';
  let quote = null;
  let had = false; // saw an (even empty) quoted token
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) { quote = null; }
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch; had = true;
    } else if (/\s/.test(ch)) {
      if (cur || had) { out.push(cur); cur = ''; had = false; }
    } else {
      cur += ch;
    }
  }
  if (cur || had) out.push(cur);
  return out;
}

// A tmux key token (as written in a config) → JS KeyboardEvent.key, or null if
// the game can't represent it as a single post-prefix key.
function tmuxKeyToJs(tokRaw) {
  let t = tokRaw;
  // common escapes
  if (t === '\\"') t = '"';
  else if (t === "\\'") t = "'";
  else if (t === '\\;') t = ';';
  else if (t === '\\\\') t = '\\';
  const named = { Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight', Space: ' ' };
  if (named[t]) return named[t];
  // modified chords (C-/M-/S-) and function keys can't be a single armed key.
  if (/^[CMS]-/.test(t) || /^F\d+$/i.test(t)) return null;
  if (t.length === 1) return t;
  return null;
}

// Value following a flag, e.g. argValue(['-t', ':.+'], '-t') → ':.+'.
function argValue(args, flag) {
  const i = args.indexOf(flag);
  if (i >= 0 && i + 1 < args.length) return args[i + 1];
  return null;
}

// Map a tmux command + its args to one of our action ids (or null = not
// simulated). Only the commands the game can actually perform are recognised.
function commandToAction(cmdRaw, args) {
  const cmd = ALIASES[cmdRaw] || cmdRaw;
  switch (cmd) {
    case 'split-window':
      if (args.includes('-h')) return 'split-h';
      if (args.includes('-v')) return 'split-v';
      return 'split-v'; // tmux default split-window is a vertical (stacked) split
    case 'select-pane': {
      if (args.includes('-L')) return 'pane-left';
      if (args.includes('-R')) return 'pane-right';
      if (args.includes('-U')) return 'pane-up';
      if (args.includes('-D')) return 'pane-down';
      const t = argValue(args, '-t');
      if (t === ':.+' || t === '+') return 'cycle-pane';
      return null;
    }
    case 'last-pane':   return 'cycle-pane';
    case 'kill-pane':   return 'kill-pane';
    case 'resize-pane': return args.includes('-Z') ? 'zoom' : null; // only zoom is simulated
    case 'new-window':  return 'new-window';
    case 'next-window': return 'next-window';
    case 'previous-window': return 'prev-window';
    case 'rename-window':   return 'rename-window';
    case 'command-prompt':  return /rename-window/.test(args.join(' ')) ? 'rename-window' : null;
    case 'choose-window':
    case 'choose-tree': return 'window-list';
    case 'select-window': {
      const t = argValue(args, '-t');
      const m = t && /^:?(\d)$/.exec(t);
      return m ? 'select-window-' + m[1] : null;
    }
    default: return null;
  }
}

function parseBind(cmd, rest, lineNo, binds, warnings) {
  const isUnbind = cmd === 'unbind' || cmd === 'unbind-key';
  let i = 0;
  let table = 'prefix';
  let noPrefix = false;
  // consume leading flags
  while (i < rest.length && rest[i].startsWith('-') && rest[i] !== '-') {
    const f = rest[i];
    if (f === '-n') { noPrefix = true; i += 1; }
    else if (f === '-T') { table = rest[i + 1]; i += 2; }
    else if (f === '-N') { i += 2; }            // a note string
    else { i += 1; }                            // -r, -a, etc. — ignore
  }
  const keyTok = rest[i]; i += 1;
  if (keyTok == null) return;

  if (noPrefix) {
    warnings.push(`line ${lineNo}: no-prefix bind (-n ${keyTok}) skipped — the game only drills prefix chords.`);
    return;
  }
  if (table !== 'prefix' && table !== 'root') {
    warnings.push(`line ${lineNo}: bind in key-table "${table}" skipped — the game only simulates the prefix table.`);
    return;
  }
  const jsKey = tmuxKeyToJs(keyTok);
  if (jsKey == null) {
    warnings.push(`line ${lineNo}: key "${keyTok}" can't be a post-prefix key here, skipped.`);
    return;
  }
  if (isUnbind) {
    warnings.push(`line ${lineNo}: unbind ${keyTok} ignored — the game teaches exactly one key per action.`);
    return;
  }
  const tmuxCmd = rest[i]; i += 1;
  const action = commandToAction(tmuxCmd, rest.slice(i));
  if (!action) {
    warnings.push(`line ${lineNo}: "${tmuxCmd || '(missing command)'}" isn't a command the game simulates, skipped.`);
    return;
  }
  binds.push({ key: jsKey, action, source: keyTok });
}

// Parse a ~/.tmux.conf string. Returns { prefix, binds:[{key,action,source}], warnings:[] }.
// prefix is a 'C-x' string or null if not set / unsupported.
export function parseTmuxConf(text) {
  const binds = [];
  const warnings = [];
  let prefix = null;

  const lines = String(text || '').split(/\r?\n/);
  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const toks = tokenize(line);
    if (!toks.length) return;
    const cmd = toks[0];

    if (cmd === 'set' || cmd === 'set-option' || cmd === 'setw' || cmd === 'set-window-option') {
      const pi = toks.indexOf('prefix');
      if (pi >= 0 && pi + 1 < toks.length) {
        const val = toks[pi + 1];
        if (/^C-.$/i.test(val)) prefix = 'C-' + val.slice(2).toLowerCase();
        else warnings.push(`line ${lineNo}: prefix "${val}" isn't a Ctrl chord the game supports — ignored.`);
      }
      return;
    }
    if (cmd === 'bind' || cmd === 'bind-key' || cmd === 'unbind' || cmd === 'unbind-key') {
      parseBind(cmd, toks.slice(1), lineNo, binds, warnings);
      return;
    }
    // Other directives (mouse, source-file, colours, …) are silently ignored.
  });

  return { prefix, binds, warnings };
}

// ---- resolution ------------------------------------------------------------

// Turn saved settings ({ prefix?, config? }) into the live keymap the input
// layer and UI consume:
//   { prefix, prefixLabel, keyToAction, actionToKey, binds, warnings }
//
// Model: ONE key per action. Defaults give every action its stock key; a bind
// in the config reassigns that action to a new key (we don't keep the old key
// as an alias — for muscle memory you drill exactly the key you chose).
export function resolveKeymap(settings) {
  const s = settings || {};
  const parsed = s.config ? parseTmuxConf(s.config) : { prefix: null, binds: [], warnings: [] };
  const prefix = parsed.prefix || s.prefix || 'C-b';
  const warnings = [...parsed.warnings];

  const actionToKey = { ...DEFAULT_ACTION_TO_KEY };
  const userBound = new Set();
  for (const b of parsed.binds) {
    actionToKey[b.action] = b.key;
    userBound.add(b.action);
  }

  // Build key→action. Write default-keyed actions first and user-bound ones
  // last, so a user bind wins any key collision. Every action's taught key
  // therefore executes that action — so every level stays solvable.
  const order = Object.keys(actionToKey).sort(
    (a, b) => (userBound.has(a) ? 1 : 0) - (userBound.has(b) ? 1 : 0),
  );
  const keyToAction = {};
  for (const action of order) keyToAction[actionToKey[action]] = action;

  // Warn when two actions collide on one key (the later writer owns it).
  for (const action of Object.keys(actionToKey)) {
    const owner = keyToAction[actionToKey[action]];
    if (owner !== action) {
      warnings.push(
        `"${ACTION_META[action].label}" lost key "${glyphFor(actionToKey[action])}" to ` +
        `"${ACTION_META[owner].label}" — that key now does "${ACTION_META[owner].label}".`,
      );
    }
  }

  return { prefix, prefixLabel: prefix, keyToAction, actionToKey, binds: parsed.binds, warnings };
}
