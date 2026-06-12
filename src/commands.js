// commands.js — the simulated tmux semantics.
//
// Registry maps an ACTION id (e.g. 'split-h') to a command:
//   { run(state) -> boolean }
// run() mutates the state in place and returns true if it actually changed
// anything (used to decide whether to re-check the level goal).
//
// Which *key* triggers each action lives in keymap.js — input.js resolves a
// pressed key to an action id, then looks it up here. Action labels/glyphs also
// live in keymap.js (ACTION_META). This split is what makes key remapping work.

import {
  activeWindow, activePane, leaves, splitPane, removeLeaf,
  nextPane, selectDirection, makeWindow, swapPaneAdjacent, breakPane, resizeActivePane,
} from './state.js';
import { DEFAULT_KEY_TO_ACTION } from './keymap.js';

function doSplit(s, dir) {
  const w = activeWindow(s);
  const ap = activePane(s);
  if (ap && ap.zoomed) ap.zoomed = false; // tmux unzooms before splitting
  const { root, newPaneId } = splitPane(w.root, w.activePaneId, dir);
  if (!newPaneId) return false;
  w.root = root;
  w.activePaneId = newPaneId;
  return true;
}

function toggleZoom(s) {
  const w = activeWindow(s);
  const ls = leaves(w.root);
  const ap = ls.find((p) => p.id === w.activePaneId);
  if (!ap) return false;
  const willZoom = !ap.zoomed;
  ls.forEach((p) => { p.zoomed = false; });
  ap.zoomed = willZoom;
  return true;
}

function killPane(s) {
  const w = activeWindow(s);
  const ls = leaves(w.root);
  if (ls.length <= 1) return false; // refuse to close a window's last pane
  const killId = w.activePaneId;
  const idx = ls.findIndex((p) => p.id === killId);
  const { root, removed } = removeLeaf(w.root, killId);
  if (!removed) return false;
  w.root = root;
  const after = leaves(w.root);
  after.forEach((p) => { p.zoomed = false; });
  w.activePaneId = after[Math.min(idx, after.length - 1)].id;
  return true;
}

function newWindow(s) {
  const win = makeWindow('bash', 'single', s.windows.length);
  s.windows.push(win);
  s.activeWindowIndex = s.windows.length - 1;
  return true;
}

function switchWindow(s, delta) {
  const n = s.windows.length;
  if (n <= 1) return false;
  s.prevWindowIndex = s.activeWindowIndex;
  s.activeWindowIndex = (s.activeWindowIndex + delta + n) % n;
  return true;
}

function selectWindow(s, i) {
  if (i >= 0 && i < s.windows.length) {
    s.prevWindowIndex = s.activeWindowIndex;
    s.activeWindowIndex = i;
    return true;
  }
  return false;
}

function lastWindow(s) {
  const prev = s.prevWindowIndex;
  if (prev == null || prev === s.activeWindowIndex || prev >= s.windows.length) return false;
  s.prevWindowIndex = s.activeWindowIndex;
  s.activeWindowIndex = prev;
  return true;
}

// Action id → command. input.js resolves a pressed key to an action id (via the
// active keymap), then runs the command here.
export const ACTIONS = {
  'split-h':    { run: (s) => doSplit(s, 'h') },
  'split-v':    { run: (s) => doSplit(s, 'v') },
  'cycle-pane': { run: (s) => nextPane(s) },
  'pane-left':  { run: (s) => selectDirection(s, 'left') },
  'pane-right': { run: (s) => selectDirection(s, 'right') },
  'pane-up':    { run: (s) => selectDirection(s, 'up') },
  'pane-down':  { run: (s) => selectDirection(s, 'down') },
  'zoom':       { run: (s) => toggleZoom(s) },
  'kill-pane':  { run: (s) => killPane(s) },
  'new-window': { run: (s) => newWindow(s) },
  'next-window':{ run: (s) => switchWindow(s, +1) },
  'prev-window':{ run: (s) => switchWindow(s, -1) },
  'rename-window':  { run: (s) => { s.mode = 'rename'; s.renameBuffer = ''; return true; } },
  'window-list':    { run: (s) => { s.mode = 'window-list'; return true; } },
  'pane-numbers':   { run: (s) => { s.mode = 'pane-numbers'; return true; } },
  'detach':         { run: (s) => { s.session.detached = true; return true; } },
  'rename-session': { run: (s) => { s.mode = 'rename-session'; s.renameBuffer = ''; return true; } },
  'swap-pane-prev':    { run: (s) => swapPaneAdjacent(s, -1) },
  'swap-pane-next':    { run: (s) => swapPaneAdjacent(s, +1) },
  'break-pane':        { run: (s) => breakPane(s) },
  'last-window':       { run: (s) => lastWindow(s) },
  'resize-pane-left':  { run: (s) => resizeActivePane(s, 'left') },
  'resize-pane-right': { run: (s) => resizeActivePane(s, 'right') },
  'resize-pane-up':    { run: (s) => resizeActivePane(s, 'up') },
  'resize-pane-down':  { run: (s) => resizeActivePane(s, 'down') },
};

// prefix 0–9 — jump to window by number.
for (let i = 0; i <= 9; i++) {
  ACTIONS['select-window-' + i] = { run: (s) => selectWindow(s, i) };
}

// Backwards-compatible char-keyed view of the stock bindings. The unit tests
// drive commands directly by key (COMMANDS['%'].run(s)) without going through
// the input/keymap layer, so this keeps them working.
export const COMMANDS = {};
for (const key in DEFAULT_KEY_TO_ACTION) COMMANDS[key] = ACTIONS[DEFAULT_KEY_TO_ACTION[key]];
