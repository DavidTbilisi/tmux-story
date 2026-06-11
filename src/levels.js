// levels.js — the 7 MVP level definitions, as plain data (a JS module so it
// loads from file:// without fetch/CORS issues during dev).
//
// Each level:
//   unlock   – the command keys the player may press this level (progressive),
//              authored as stock tmux keys; the game maps them to action ids,
//              so the actual playable key follows the player's remap.
//   rewards  – badge tokens shown in the collected-keys tray on completion
//   goal     – { id, ...params } resolved by goals.js
//   objective– one-line goal text for the HUD
//   hint     – longer teaching nudge
//   keys     – chord reference cards beside the play area. Each card lists the
//              ACTION ids it teaches; game.js renders the player's current key
//              for each (or a `keysLabel` override for ranges like 0–9).

import { ARROWS } from './state.js';

export const LEVELS = [
  {
    id: 'panes-1', title: 'Split the World', world: 'Panes',
    blurb: 'Every tmux session begins as a single pane. Time to make room.',
    start: { windows: [{ name: 'bash', layout: 'single' }] },
    unlock: ['%'],
    rewards: ['%'],
    goal: { id: 'paneCount', count: 2 },
    objective: 'Split the window into 2 panes.',
    hint: 'Hold Ctrl and tap b (that’s the prefix), let go, then press % to split into left and right panes.',
    keys: [{ actions: ['split-h'], desc: 'split left / right' }],
  },
  {
    id: 'panes-2', title: 'Stack ’Em', world: 'Panes',
    blurb: 'Panes split two ways. Mix a side-by-side split with a stacked one.',
    start: { windows: [{ name: 'bash', layout: 'single' }] },
    unlock: ['%', '"'],
    rewards: ['"'],
    goal: { id: 'mixedSplit' },
    objective: 'Make an L-shape: use both % and " (3 panes).',
    hint: '% splits left/right, " splits top/bottom. Split once each way to get three panes in an L.',
    keys: [
      { actions: ['split-h'], desc: 'split left / right' },
      { actions: ['split-v'], desc: 'split top / bottom' },
    ],
  },
  {
    id: 'panes-nav', title: 'Wander', world: 'Panes',
    blurb: 'A grid is no use if you can’t move. Walk to the far corner.',
    start: { windows: [{ name: 'bash', layout: '2x2' }] },
    unlock: ['%', '"', 'o', ...ARROWS],
    rewards: ['o', 'Arrows'],
    goal: { id: 'activePaneIndex', n: 3 },
    objective: 'Make pane 4 (bottom-right) the active pane.',
    hint: 'Prefix then an arrow key moves between panes; prefix then o cycles. Land on pane 4 (bottom-right).',
    keys: [
      { actions: ['pane-left', 'pane-up', 'pane-down', 'pane-right'], desc: 'move to the pane that way' },
      { actions: ['cycle-pane'], desc: 'cycle to the next pane' },
    ],
  },
  {
    id: 'panes-grid', title: 'Four Corners', world: 'Panes',
    blurb: 'Build the classic 2×2 cockpit from a single pane.',
    start: { windows: [{ name: 'bash', layout: 'single' }] },
    unlock: ['%', '"', 'o', ...ARROWS],
    rewards: ['grid'],
    goal: { id: 'grid2x2' },
    objective: 'Build a 2×2 grid of 4 equal panes.',
    hint: 'Split left/right, move into one side, then split each side top/bottom. Use arrows or o to move between panes.',
    keys: [
      { actions: ['split-h', 'split-v'], desc: 'split' },
      { actions: ['pane-left', 'pane-up', 'pane-down', 'pane-right', 'cycle-pane'], desc: 'move between panes' },
    ],
  },
  {
    id: 'panes-zoom', title: 'Focus & Destroy', world: 'Panes',
    blurb: 'Too many panes. Clear the clutter, then zoom in to focus.',
    start: { windows: [{ name: 'bash', layout: '2x2' }] },
    unlock: ['%', '"', 'o', ...ARROWS, 'z', 'x'],
    rewards: ['z', 'x'],
    goal: { id: 'zoomedWithCount', count: 2 },
    objective: 'Kill panes down to 2, then zoom the active one.',
    hint: 'Prefix then x closes the active pane (no confirm here). Get down to 2 panes, then prefix then z zooms the active pane fullscreen.',
    keys: [
      { actions: ['kill-pane'], desc: 'kill the active pane' },
      { actions: ['zoom'], desc: 'zoom / unzoom the active pane' },
    ],
  },
  {
    id: 'windows-1', title: 'New Horizons', world: 'Windows',
    blurb: 'Panes live inside windows. Open a few more — watch the status bar fill up.',
    start: { windows: [{ name: 'bash', layout: 'single' }] },
    unlock: ['c', 'n', 'p'],
    rewards: ['c', 'n', 'p'],
    goal: { id: 'windowCount', count: 3 },
    objective: 'Have 3 windows open.',
    hint: 'Prefix then c creates a new window (see it appear in the green status bar). Make 3 total. n / p step between them.',
    keys: [
      { actions: ['new-window'], desc: 'create a new window' },
      { actions: ['next-window', 'prev-window'], desc: 'next / previous window' },
    ],
  },
  {
    id: 'windows-jump', title: 'Teleport', world: 'Windows',
    blurb: 'Jump straight to a window by number, then give it a name worth remembering.',
    start: { windows: [
      { name: 'bash', layout: 'single' },
      { name: 'vim', layout: 'single' },
      { name: 'bash', layout: 'single' },
    ] },
    unlock: ['c', 'n', 'p', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'w', ','],
    rewards: ['0-9', 'w', ','],
    goal: { id: 'windowNamed', index: 2, name: 'logs' },
    objective: 'Jump to window 2 and rename it “logs”.',
    hint: 'Prefix then 2 jumps straight to window 2. Then prefix then , to rename it — type logs and press Enter.',
    keys: [
      { actions: ['select-window-0'], keysLabel: '0–9', desc: 'jump to window by number' },
      { actions: ['rename-window'], desc: 'rename the current window' },
    ],
  },
];
