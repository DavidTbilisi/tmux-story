// reflexes.js — the cue→action layer.
//
// The levels teach one move at a time (execution drills). Automaticity needs the
// *mixed* drill: a random CUE (a real situation) for which you must fire the
// right chord, fast, with confusable neighbours mixed in. That's what a reflex
// is — `cue → classification → action` — and this file is the deck of them.
//
// Each reflex names a target `action` (an id from commands.js / ACTION_META).
// The classification/label for feedback comes from ACTION_META[action].label.
// `confusedWith` lists the actions it's easy to mix up with, for diagnostic
// "you fired X, the cue wanted Y" feedback (the discrimination drill).

import { ACTION_META, keysToActions } from './keymap.js';

export const REFLEXES = [
  { action: 'split-h', cue: 'You want your editor and a shell side by side.', confusedWith: ['split-v'] },
  { action: 'split-v', cue: 'You want a shell stacked below the current one.', confusedWith: ['split-h'] },
  { action: 'kill-pane', cue: "This pane's job is done — get rid of it.", confusedWith: ['zoom'] },
  { action: 'zoom', cue: 'You need this one pane fullscreen for a moment.', confusedWith: ['kill-pane'] },
  { action: 'cycle-pane', cue: 'Just hop to the next pane, any direction.', confusedWith: ['pane-numbers'] },
  { action: 'pane-left', cue: 'Focus the pane to the left.', confusedWith: ['pane-right', 'pane-up', 'pane-down'] },
  { action: 'pane-right', cue: 'Focus the pane to the right.', confusedWith: ['pane-left', 'pane-up', 'pane-down'] },
  { action: 'pane-up', cue: 'Focus the pane above.', confusedWith: ['pane-down', 'pane-left', 'pane-right'] },
  { action: 'pane-down', cue: 'Focus the pane below.', confusedWith: ['pane-up', 'pane-left', 'pane-right'] },
  { action: 'pane-numbers', cue: 'Jump straight to a pane by its number.', confusedWith: ['cycle-pane'] },
  { action: 'new-window', cue: 'Start a clean window for a new task.', confusedWith: ['split-h'] },
  { action: 'next-window', cue: 'Step to the next window.', confusedWith: ['prev-window', 'last-window'] },
  { action: 'prev-window', cue: 'Step back to the previous window.', confusedWith: ['next-window', 'last-window'] },
  { action: 'last-window', cue: 'Flip back to the window you were just on.', confusedWith: ['prev-window', 'next-window'] },
  { action: 'rename-window', cue: 'Give this window a name worth reading.', confusedWith: ['rename-session'] },
  { action: 'window-list', cue: 'Browse every window in a picker.', confusedWith: ['pane-numbers'] },
  { action: 'break-pane', cue: 'This pane deserves its own window — promote it.', confusedWith: ['new-window'] },
  { action: 'swap-pane-next', cue: 'Shuffle this pane one slot forward.', confusedWith: ['swap-pane-prev'] },
  { action: 'swap-pane-prev', cue: 'Shuffle this pane one slot back.', confusedWith: ['swap-pane-next'] },
  { action: 'detach', cue: 'Step away but keep everything running.', confusedWith: ['kill-pane'] },
  { action: 'rename-session', cue: 'Name this whole session for later.', confusedWith: ['rename-window'] },
  { action: 'select-window-2', cue: 'Jump directly to window 2.', confusedWith: ['next-window', 'window-list'] },
];

// A safe starter set when the player hasn't unlocked anything yet (the very
// first visit) — the moves taught in the opening levels.
const STARTER = new Set(['split-h', 'split-v', 'cycle-pane', 'pane-left', 'pane-right', 'pane-up', 'pane-down', 'new-window']);

// The reflex (if any) whose target is `action`, for surfacing a level's cue.
export function reflexFor(action) {
  return REFLEXES.find((r) => r.action === action) || null;
}

// The deck to drill, given the set of action ids the player has unlocked so far
// (union of completed levels' unlocks). Only reflexes whose move is unlocked are
// included — you drill what you've been taught. Falls back to the starter set.
export function availableReflexes(unlockedActions) {
  const have = unlockedActions && unlockedActions.size ? unlockedActions : STARTER;
  const deck = REFLEXES.filter((r) => have.has(r.action) && ACTION_META[r.action]);
  return deck.length ? deck : REFLEXES.filter((r) => STARTER.has(r.action));
}

// The union of actions unlocked by a list of completed level ids.
export function unlockedFromLevels(levels, completedIds) {
  const set = new Set();
  for (const lvl of levels) {
    if (!completedIds.includes(lvl.id)) continue;
    for (const a of keysToActions(lvl.unlock)) set.add(a);
  }
  return set;
}

// ---- spaced-execution scheduling ------------------------------------------
//
// Persistence makes the Gym a real trainer: each reflex carries a level on the
// automaticity ladder (0 new … 5 automatic) and a `due` time. Correct-and-fast
// answers raise the level and push `due` further out; slow answers repeat soon;
// misses drop the level and make it due immediately. Selection then weights
// overdue + low-level reflexes higher, so weak ones resurface across sessions.
// All functions are pure (time is passed in), so they unit-test in node.

const DAY = 86400000;
// Interval until next due, indexed by the level you land on after a fast answer.
const INTERVALS = [0, 1 * DAY, 2 * DAY, 4 * DAY, 8 * DAY, 16 * DAY];
export const AUTOMATIC_LEVEL = 5;
const LEVEL_LABELS = ['new', 'seen', 'recalled', 'timed', 'pressured', 'automatic'];

export function emptyStat() {
  return { attempts: 0, correct: 0, fast: 0, streak: 0, level: 0, lastSeen: 0, due: 0 };
}

export function levelLabel(level) {
  return LEVEL_LABELS[Math.max(0, Math.min(AUTOMATIC_LEVEL, level || 0))];
}

// Fold one attempt into a stat; returns a NEW stat (doesn't mutate the input).
//   correct: did they fire the right action?   fast: within the speed target?
export function updateReflexStat(prev, correct, fast, now) {
  const s = { ...(prev || emptyStat()) };
  s.attempts += 1;
  if (correct) s.correct += 1;
  if (correct && fast) s.fast += 1;
  s.streak = correct && fast ? s.streak + 1 : 0;
  if (!correct) {
    s.level = Math.max(0, s.level - 1);
    s.due = now;                                  // retest immediately
  } else if (!fast) {
    s.level = Math.max(1, s.level);
    s.due = now + DAY;                            // knows it, but slow — soon
  } else {
    s.level = Math.min(AUTOMATIC_LEVEL, s.level + 1);
    s.due = now + INTERVALS[s.level];
  }
  s.lastSeen = now;
  return s;
}

// Selection weight for the next cue: overdue and low-level reflexes score higher,
// so weak/forgotten ones come up more often. Always ≥ a small base.
export function reflexWeight(stat, now) {
  const s = stat || emptyStat();
  let w = 1 + (AUTOMATIC_LEVEL - s.level) * 0.6;  // weaker → heavier
  if (!s.attempts) return w + 2;                  // never drilled → prioritise
  if (s.due <= now) w += 2 + Math.min(3, (now - s.due) / DAY); // overdue bonus
  if (s.streak === 0) w += 1;                     // last answer wasn't clean
  return w;
}

export function isAutomatic(stat) {
  return !!stat && stat.level >= AUTOMATIC_LEVEL;
}
