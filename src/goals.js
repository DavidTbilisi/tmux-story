// goals.js — win predicates. Each is (state, params) -> boolean and is checked
// after every successful command. Predicates test the STRUCTURE/COUNT of the
// layout, never an exact tree identity, so there's usually more than one valid
// way for the player to satisfy them.

import { leaves, activeWindow, activePaneIndex } from './state.js';

function hasSplitDir(node, dir) {
  if (node.type === 'pane') return false;
  if (node.dir === dir) return true;
  return hasSplitDir(node.children[0], dir) || hasSplitDir(node.children[1], dir);
}

// A 2×2 grid: root is a split whose two children are each leaf-splits of the
// opposite direction. Accepts both orientations (rows-of-columns or
// columns-of-rows).
function isGrid2x2(root) {
  if (root.type !== 'split') return false;
  const [a, b] = root.children;
  if (a.type !== 'split' || b.type !== 'split') return false;
  const leafSplit = (n) => n.children[0].type === 'pane' && n.children[1].type === 'pane';
  if (!leafSplit(a) || !leafSplit(b)) return false;
  if (a.dir !== b.dir) return false;     // the two sub-splits share a direction
  if (a.dir === root.dir) return false;  // …which is opposite the root's
  return leaves(root).length === 4;
}

export const GOALS = {
  paneCount: (s, p) => leaves(activeWindow(s).root).length === p.count,

  // At least one left/right split AND one top/bottom split somewhere.
  mixedSplit: (s) => {
    const r = activeWindow(s).root;
    return hasSplitDir(r, 'h') && hasSplitDir(r, 'v');
  },

  grid2x2: (s) => isGrid2x2(activeWindow(s).root),

  activePaneIndex: (s, p) => activePaneIndex(s) === p.n,

  // Exactly `count` panes remain and the active pane is zoomed.
  zoomedWithCount: (s, p) => {
    const ls = leaves(activeWindow(s).root);
    if (ls.length !== p.count) return false;
    const ap = ls.find((pane) => pane.id === activeWindow(s).activePaneId);
    return !!(ap && ap.zoomed);
  },

  windowCount: (s, p) => s.windows.length === p.count,

  activeWindowIs: (s, p) => s.activeWindowIndex === p.index,

  // Window at `index` (if given) is named `name`; otherwise any window matches.
  windowNamed: (s, p) => {
    if (p.index != null) return !!s.windows[p.index] && s.windows[p.index].name === p.name;
    return s.windows.some((w) => w.name === p.name);
  },

  // At least 2 windows exist and the active window has exactly 1 pane (just broken out).
  brokenOut: (s) => s.windows.length >= 2 && leaves(activeWindow(s).root).length === 1,

  // Exactly 3 windows each with at least 2 panes.
  multiWindowPanes: (s) =>
    s.windows.length === 3 &&
    s.windows.every((w) => leaves(w.root).length >= 2),

  sessionDetached: (s) => !!(s.session && s.session.detached),

  sessionNamed: (s, p) => !!(s.session && s.session.name === p.name),

  // Any split in the active window has a ratio pushed past 0.65 (or below 0.35).
  paneExpanded: (s) => {
    function check(node) {
      if (node.type === 'pane') return false;
      if (node.ratio >= 0.65 || node.ratio <= 0.35) return true;
      return check(node.children[0]) || check(node.children[1]);
    }
    return check(activeWindow(s).root);
  },
};

export function checkGoal(state, goal) {
  const fn = GOALS[goal.id];
  return fn ? !!fn(state, goal) : false;
}
