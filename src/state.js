// state.js — DOM-free game state: session → window → pane tree + input machine.
//
// Layout mapping (keep this the single source of truth):
//   tmux `%` / split-window -h  = LEFT/RIGHT split = dir:'h' = CSS flex-direction:row
//   tmux `"` / split-window -v  = TOP/BOTTOM split = dir:'v' = CSS flex-direction:column
//
// A window owns a binary tree. Internal nodes are `split`s, leaves are `pane`s —
// exactly how tmux models a window internally. Rendering and goal-checking are
// both just walks over this tree.

import { keysToActions } from './keymap.js';

let _pid = 0;
let _wid = 0;

export const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

export function makePane() {
  return { type: 'pane', id: 'p' + ++_pid, zoomed: false };
}

// An even N-way split in one direction, built from the binary tree: the first
// child takes 1/n and the rest recurse into the remaining (n-1)/n. With the
// renderer's flex-grow=ratio this lays out n equal slices. `leaf()` mints each
// slot (a pane, or another even split for a grid).
function evenSplit(dir, n, leaf) {
  if (n <= 1) return leaf();
  return { type: 'split', dir, ratio: 1 / n, children: [leaf(), evenSplit(dir, n - 1, leaf)] };
}

// rows × cols grid of equal panes (rows of columns).
function buildGrid(rows, cols) {
  return evenSplit('v', rows, () => evenSplit('h', cols, makePane));
}

// Build a window's root node from a named preset.
export function buildLayout(name) {
  switch (name) {
    case 'two-h':
      return { type: 'split', dir: 'h', ratio: 0.5, children: [makePane(), makePane()] };
    case 'two-v':
      return { type: 'split', dir: 'v', ratio: 0.5, children: [makePane(), makePane()] };
    case '2x2':
      return buildGrid(2, 2);
    case '3x3':
      return buildGrid(3, 3);
    case 'single':
    default:
      return makePane();
  }
}

export function makeWindow(name, layoutName, index) {
  const root = buildLayout(layoutName || 'single');
  return {
    id: 'w' + ++_wid,
    name: name || 'bash',
    index,
    root,
    activePaneId: leaves(root)[0].id,
  };
}

// Build a fresh GameState from a level definition. `unlockedActions` is a Set of
// action ids; if omitted it's derived from the level's `unlock` keys (which are
// authored as stock tmux keys, so they're translated through the default map).
export function makeState(level, unlockedActions) {
  const winDefs = (level.start && level.start.windows) || [{ name: 'bash', layout: 'single' }];
  const windows = winDefs.map((w, i) => makeWindow(w.name, w.layout, i));
  const startIdx = (level.start && level.start.activeWindowIndex != null)
    ? level.start.activeWindowIndex : 0;
  const s = {
    session: { name: (level.start && level.start.session) || 'main', detached: false },
    windows,
    activeWindowIndex: startIdx,
    prevWindowIndex: (level.start && level.start.prevWindowIndex != null)
      ? level.start.prevWindowIndex : null,
    prefix: 'idle',                 // 'idle' | 'armed'
    mode: 'normal',                 // 'normal' | 'rename' | 'window-list'
    renameBuffer: null,
    toast: null,                    // transient nudge text shown in the HUD
    unlockedActions: unlockedActions || keysToActions(level.unlock),
    levelId: level.id,
    chaseTarget: null,              // pane id of the "chase the dot" target, if any
  };
  if (level.chase) s.chaseTarget = pickChaseTarget(s);
  return s;
}

// Pick a pane (by id) in the active window for the chase dot to jump to — any
// leaf that isn't the active pane (so there's always somewhere to chase to) and,
// where possible, isn't in `avoidIds` (e.g. the spot it just left).
export function pickChaseTarget(s, avoidIds = []) {
  const w = activeWindow(s);
  const ids = leaves(w.root).map((p) => p.id);
  const avoid = new Set([w.activePaneId, ...avoidIds]);
  const choices = ids.filter((id) => !avoid.has(id));
  const pool = choices.length ? choices : ids.filter((id) => id !== w.activePaneId);
  if (!pool.length) return null;
  return pool[(Math.random() * pool.length) | 0];
}

// ---- tree walks ------------------------------------------------------------

// Leaves in depth-first (top-to-bottom, left-to-right) order. This order also
// defines each pane's display index.
export function leaves(node, acc = []) {
  if (node.type === 'pane') { acc.push(node); return acc; }
  leaves(node.children[0], acc);
  leaves(node.children[1], acc);
  return acc;
}

export function activeWindow(s) {
  return s.windows[s.activeWindowIndex];
}

export function activePane(s) {
  const w = activeWindow(s);
  return leaves(w.root).find((p) => p.id === w.activePaneId);
}

export function activePaneIndex(s) {
  const w = activeWindow(s);
  return leaves(w.root).findIndex((p) => p.id === w.activePaneId);
}

// ---- tree surgery ----------------------------------------------------------

// Replace the leaf `paneId` with a split of [oldPane, newPane].
// Returns { root, newPaneId } (newPaneId is null if the leaf wasn't found).
export function splitPane(root, paneId, dir) {
  const newPane = makePane();
  let found = false;
  function rebuild(node) {
    if (node.type === 'pane') {
      if (node.id === paneId) {
        found = true;
        return { type: 'split', dir, ratio: 0.5, children: [node, newPane] };
      }
      return node;
    }
    node.children[0] = rebuild(node.children[0]);
    node.children[1] = rebuild(node.children[1]);
    return node;
  }
  const newRoot = rebuild(root);
  return { root: newRoot, newPaneId: found ? newPane.id : null };
}

// Remove the leaf `paneId`; its parent split collapses into the sibling subtree.
// Returns { root, removed }. Refuses to remove a window's only pane.
export function removeLeaf(root, paneId) {
  if (root.type === 'pane') return { root, removed: false };
  let removed = false;
  function rebuild(node) {
    if (node.type === 'pane') return node;
    const [c0, c1] = node.children;
    if (c0.type === 'pane' && c0.id === paneId) { removed = true; return rebuild(c1); }
    if (c1.type === 'pane' && c1.id === paneId) { removed = true; return rebuild(c0); }
    node.children[0] = rebuild(c0);
    node.children[1] = rebuild(c1);
    return node;
  }
  const newRoot = rebuild(root);
  return { root: newRoot, removed };
}

// ---- navigation ------------------------------------------------------------

function clearZoom(win) {
  leaves(win.root).forEach((p) => { p.zoomed = false; });
}

// prefix o — cycle to the next pane in DFS order.
export function nextPane(s) {
  const w = activeWindow(s);
  const ls = leaves(w.root);
  if (ls.length <= 1) return false;
  clearZoom(w);
  const i = ls.findIndex((p) => p.id === w.activePaneId);
  w.activePaneId = ls[(i + 1) % ls.length].id;
  return true;
}

// Geometry of each pane in [0,1] coordinates, derived from split ratios.
// Lets us do tmux-like directional pane selection without a rendered DOM.
export function computeRects(root) {
  const map = new Map();
  function rec(node, x, y, w, h) {
    if (node.type === 'pane') { map.set(node.id, { x, y, w, h }); return; }
    const r = node.ratio;
    if (node.dir === 'h') {
      rec(node.children[0], x, y, w * r, h);
      rec(node.children[1], x + w * r, y, w * (1 - r), h);
    } else {
      rec(node.children[0], x, y, w, h * r);
      rec(node.children[1], x, y + h * r, w, h * (1 - r));
    }
  }
  rec(root, 0, 0, 1, 1);
  return map;
}

// prefix M-Arrow — resize the active pane by nudging the nearest enclosing split
// that runs in the given direction.
export function resizeActivePane(s, dir) {
  const w = activeWindow(s);
  const STEP = 0.05;
  const wantDir = (dir === 'left' || dir === 'right') ? 'h' : 'v';
  let adjusted = false;

  function walk(node) {
    if (node.type === 'pane') return;
    const [c0, c1] = node.children;
    const inC0 = leaves(c0).some((p) => p.id === w.activePaneId);
    const inC1 = !inC0 && leaves(c1).some((p) => p.id === w.activePaneId);
    if (!inC0 && !inC1) return;
    walk(inC0 ? c0 : c1);           // prefer the deepest matching split
    if (adjusted) return;
    if (node.dir !== wantDir) return;
    if (inC0) {
      node.ratio = (dir === 'right' || dir === 'down')
        ? Math.min(0.9, node.ratio + STEP)
        : Math.max(0.1, node.ratio - STEP);
    } else {
      node.ratio = (dir === 'left' || dir === 'up')
        ? Math.min(0.9, node.ratio + STEP)
        : Math.max(0.1, node.ratio - STEP);
    }
    adjusted = true;
  }

  walk(w.root);
  return adjusted;
}

// prefix { / } — swap the active pane with the adjacent pane in DFS order.
function swapPaneIdsInTree(root, idA, idB) {
  function rebuild(node) {
    if (node.type === 'pane') {
      if (node.id === idA) return { ...node, id: idB };
      if (node.id === idB) return { ...node, id: idA };
      return node;
    }
    return { ...node, children: [rebuild(node.children[0]), rebuild(node.children[1])] };
  }
  return rebuild(root);
}

export function swapPaneAdjacent(s, delta) {
  const w = activeWindow(s);
  const ls = leaves(w.root);
  if (ls.length <= 1) return false;
  clearZoom(w);
  const i = ls.findIndex((p) => p.id === w.activePaneId);
  const j = ((i + delta) + ls.length) % ls.length;
  w.root = swapPaneIdsInTree(w.root, ls[i].id, ls[j].id);
  return true;
}

// prefix ! — break the active pane out into its own new window.
export function breakPane(s) {
  const w = activeWindow(s);
  const ls = leaves(w.root);
  if (ls.length <= 1) return false;
  const paneId = w.activePaneId;
  const { root, removed } = removeLeaf(w.root, paneId);
  if (!removed) return false;
  w.root = root;
  const remaining = leaves(w.root);
  w.activePaneId = remaining[0].id;
  const newWin = {
    id: 'w' + ++_wid,
    name: 'bash',
    index: s.windows.length,
    root: { type: 'pane', id: paneId, zoomed: false },
    activePaneId: paneId,
  };
  s.windows.push(newWin);
  s.activeWindowIndex = s.windows.length - 1;
  return true;
}

// prefix ← ↑ ↓ → — select the nearest pane in the given direction.
export function selectDirection(s, dir) {
  const w = activeWindow(s);
  const rects = computeRects(w.root);
  const cur = rects.get(w.activePaneId);
  if (!cur) return false;
  const cx = cur.x + cur.w / 2;
  const cy = cur.y + cur.h / 2;
  let best = null;
  let bestDist = Infinity;
  for (const [id, r] of rects) {
    if (id === w.activePaneId) continue;
    const dx = r.x + r.w / 2 - cx;
    const dy = r.y + r.h / 2 - cy;
    const ok =
      (dir === 'left' && dx < -1e-6) ||
      (dir === 'right' && dx > 1e-6) ||
      (dir === 'up' && dy < -1e-6) ||
      (dir === 'down' && dy > 1e-6);
    if (!ok) continue;
    const horizontal = dir === 'left' || dir === 'right';
    const along = horizontal ? Math.abs(dx) : Math.abs(dy);
    const perp = horizontal ? Math.abs(dy) : Math.abs(dx);
    const dist = along + perp * 2; // prefer panes that line up with the current one
    if (dist < bestDist) { bestDist = dist; best = id; }
  }
  if (best) {
    clearZoom(w);
    w.activePaneId = best;
    return true;
  }
  return false;
}
