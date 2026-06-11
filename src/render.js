// render.js — renders GameState into a tmux-looking DOM subtree.
// Strategy: full rebuild of the terminal + status bar on every state change.
// The state is tiny, so there's no need for diffing.
//
// Pane layout uses nested flexbox: a `split` node becomes a flex container
// (row for left/right, column for top/bottom) and its two children get
// flex-grow from the split ratio. This mirrors tmux's rectangle partitioning
// exactly, so any nesting (2×2, L-shapes…) lays out for free.

import { el } from './dom.js';
import { leaves, activeWindow } from './state.js';

export function renderTmux(state) {
  const win = activeWindow(state);
  const order = leaves(win.root);
  const indexOf = new Map(order.map((p, i) => [p.id, i]));

  const wrap = el('div', 'tmux');
  if (state.prefix === 'armed') wrap.classList.add('tmux--armed');

  const term = el('div', 'terminal');
  const zoomed = order.find((p) => p.zoomed);
  if (zoomed) {
    const pane = renderPane(zoomed, win.activePaneId, indexOf, true);
    pane.style.flexGrow = 1;
    term.appendChild(pane);
  } else {
    const rootEl = renderNode(win.root, win.activePaneId, indexOf);
    rootEl.style.flexGrow = 1;
    term.appendChild(rootEl);
  }

  wrap.appendChild(term);
  wrap.appendChild(renderStatusBar(state));
  return wrap;
}

function renderNode(node, activeId, indexOf) {
  if (node.type === 'pane') return renderPane(node, activeId, indexOf, false);
  const box = el('div', 'split ' + (node.dir === 'h' ? 'split--row' : 'split--col'));
  const a = renderNode(node.children[0], activeId, indexOf);
  const b = renderNode(node.children[1], activeId, indexOf);
  a.style.flexGrow = node.ratio;
  b.style.flexGrow = 1 - node.ratio;
  box.appendChild(a);
  box.appendChild(b);
  return box;
}

function renderPane(pane, activeId, indexOf, zoomed) {
  const isActive = pane.id === activeId;
  const p = el('div', 'pane' + (isActive ? ' pane--active' : '') + (zoomed ? ' pane--zoomed' : ''));

  const num = el('span', 'pane__num', String((indexOf.get(pane.id) ?? 0) + 1));
  p.appendChild(num);
  if (zoomed) p.appendChild(el('span', 'pane__flag', 'Z'));

  const body = el('div', 'pane__body');
  const prompt = el('span', 'pane__prompt', 'you@tmux-story');
  body.appendChild(prompt);
  body.appendChild(document.createTextNode(':~$ '));
  if (isActive) body.appendChild(el('span', 'pane__cursor', '█'));
  p.appendChild(body);
  return p;
}

function renderStatusBar(state) {
  const bar = el('div', 'statusbar');
  bar.appendChild(el('span', 'statusbar__left', `[${state.session.name}]`));

  const mid = el('span', 'statusbar__windows');
  state.windows.forEach((w, i) => {
    const active = i === state.activeWindowIndex;
    const flag = active ? '*' : (i === state.activeWindowIndex - 1 ? '-' : '');
    const zoom = leaves(w.root).some((p) => p.zoomed) ? 'Z' : '';
    mid.appendChild(el('span', 'win' + (active ? ' win--active' : ''), `${i}:${w.name}${flag}${zoom}`));
  });
  bar.appendChild(mid);

  bar.appendChild(el('span', 'statusbar__right', '“tmux-story”'));
  return bar;
}
