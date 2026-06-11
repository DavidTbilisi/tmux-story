// Sanity checks for the DOM-free game logic. Run: node test/state.test.mjs
// No framework — just assertions that throw on failure.

import { makeState, leaves, activeWindow, splitPane, removeLeaf } from '../src/state.js';
import { COMMANDS } from '../src/commands.js';
import { checkGoal } from '../src/goals.js';

let passed = 0;
function ok(cond, msg) {
  if (!cond) { console.error('  ✗ ' + msg); throw new Error('FAILED: ' + msg); }
  passed++;
  console.log('  ✓ ' + msg);
}

// Build a state for a level-ish def with the given starting layout + unlock-all.
function stateWith(layout) {
  const level = { id: 'test', start: { windows: [{ name: 'bash', layout }] }, unlock: [] };
  const s = makeState(level);
  // unlock everything for command testing
  s.unlocked = new Set(Object.keys(COMMANDS));
  return s;
}

function run(s, key) {
  const did = COMMANDS[key].run(s);
  return did;
}

console.log('splitPane / leaves');
{
  const s = stateWith('single');
  ok(leaves(activeWindow(s).root).length === 1, 'single layout has 1 pane');
  run(s, '%');
  ok(leaves(activeWindow(s).root).length === 2, 'after % there are 2 panes');
  ok(activeWindow(s).root.dir === 'h', '% produces a left/right (dir:h) split');
  run(s, '"');
  ok(leaves(activeWindow(s).root).length === 3, 'after " there are 3 panes');
  ok(checkGoal(s, { id: 'mixedSplit' }), 'mixedSplit goal met (one h + one v split)');
}

console.log('removeLeaf collapses the parent into the sibling');
{
  const s = stateWith('2x2');
  const w = activeWindow(s);
  ok(leaves(w.root).length === 4, '2x2 layout has 4 panes');
  const ids = leaves(w.root).map((p) => p.id);
  const res = removeLeaf(w.root, ids[1]); // kill top-right
  ok(res.removed === true, 'removeLeaf reports removed');
  ok(leaves(res.root).length === 3, '3 panes remain after one kill');
  // refuse to remove the only pane
  const single = stateWith('single');
  const r2 = removeLeaf(activeWindow(single).root, leaves(activeWindow(single).root)[0].id);
  ok(r2.removed === false, 'removeLeaf refuses to remove the only pane');
}

console.log('kill command keeps a valid active pane');
{
  const s = stateWith('2x2');
  // kill twice → down to 2 panes
  run(s, 'x');
  run(s, 'x');
  const w = activeWindow(s);
  ok(leaves(w.root).length === 2, 'two kills leave 2 panes');
  const stillThere = leaves(w.root).some((p) => p.id === w.activePaneId);
  ok(stillThere, 'active pane id still points at a real pane');
}

console.log('zoom + count goal');
{
  const s = stateWith('2x2');
  run(s, 'x'); run(s, 'x');          // down to 2
  run(s, 'z');                        // zoom active
  ok(checkGoal(s, { id: 'zoomedWithCount', count: 2 }), 'zoomedWithCount{2} met');
}

console.log('grid2x2 goal accepts a hand-built grid');
{
  const s = stateWith('single');
  run(s, '%');                        // left | right
  run(s, '"');                        // split right into top/bottom
  // move to the left pane and split it too
  const w = activeWindow(s);
  w.activePaneId = leaves(w.root)[0].id;
  run(s, '"');
  ok(checkGoal(s, { id: 'grid2x2' }), 'grid2x2 met for a 4-pane balanced layout');
}

console.log('window commands + goals');
{
  const s = stateWith('single');
  run(s, 'c'); run(s, 'c');
  ok(checkGoal(s, { id: 'windowCount', count: 3 }), 'windowCount{3} after two new windows');
  run(s, '0');
  ok(checkGoal(s, { id: 'activeWindowIs', index: 0 }), 'select window 0 works');
  s.windows[2].name = 'logs';
  ok(checkGoal(s, { id: 'windowNamed', index: 2, name: 'logs' }), 'windowNamed at index 2');
}

console.log(`\nAll ${passed} assertions passed ✅`);
