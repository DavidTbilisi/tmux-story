// Unit tests for the spaced-execution scheduling in src/reflexes.js.
// Pure functions, time passed in. Run: node test/reflexes.test.mjs

import {
  emptyStat, updateReflexStat, reflexWeight, isAutomatic, levelLabel,
  availableReflexes, unlockedFromLevels, AUTOMATIC_LEVEL,
} from '../src/reflexes.js';
import { LEVELS } from '../src/levels.js';

let passed = 0;
function ok(cond, msg) {
  if (!cond) { console.error('  ✗ ' + msg); throw new Error('FAILED: ' + msg); }
  passed++;
  console.log('  ✓ ' + msg);
}

const DAY = 86400000;
const T0 = 1_000_000_000_000; // a fixed "now" — no Date.now() in tests

console.log('updateReflexStat: correct + fast climbs and pushes due out');
{
  let s = emptyStat();
  ok(s.level === 0 && s.due === 0, 'empty stat starts at level 0');
  s = updateReflexStat(s, true, true, T0);
  ok(s.level === 1, 'fast correct → level 1');
  ok(s.streak === 1 && s.attempts === 1 && s.fast === 1, 'counters updated');
  ok(s.due === T0 + 1 * DAY, 'due pushed to +1 day at level 1');
  s = updateReflexStat(s, true, true, T0);
  ok(s.level === 2 && s.due === T0 + 2 * DAY, 'second fast correct → level 2, +2 days');
}

console.log('updateReflexStat: slow and wrong answers');
{
  let s = emptyStat();
  s = updateReflexStat(s, true, true, T0);   // level 1
  s = updateReflexStat(s, true, true, T0);   // level 2
  const slow = updateReflexStat(s, true, false, T0);
  ok(slow.level === 2 && slow.streak === 0, 'correct-but-slow keeps level, resets streak');
  ok(slow.due === T0 + DAY, 'slow answer is due again in a day');
  const wrong = updateReflexStat(s, false, false, T0);
  ok(wrong.level === 1, 'wrong answer drops a level');
  ok(wrong.due === T0, 'wrong answer is due immediately');
}

console.log('isAutomatic / levelLabel');
{
  let s = emptyStat();
  for (let i = 0; i < 10; i++) s = updateReflexStat(s, true, true, T0);
  ok(s.level === AUTOMATIC_LEVEL, 'level caps at AUTOMATIC_LEVEL');
  ok(isAutomatic(s), 'maxed stat is automatic');
  ok(!isAutomatic(emptyStat()), 'fresh stat is not automatic');
  ok(levelLabel(5) === 'automatic' && levelLabel(0) === 'new', 'level labels map');
}

console.log('reflexWeight: weak/overdue weigh more than mastered');
{
  const now = T0;
  const fresh = reflexWeight(emptyStat(), now);
  let mastered = emptyStat();
  for (let i = 0; i < 10; i++) mastered = updateReflexStat(mastered, true, true, now);
  // mastered is due far in the future → not overdue
  ok(reflexWeight(mastered, now) < fresh, 'mastered (not due) weighs less than a fresh reflex');

  let missed = emptyStat();
  missed = updateReflexStat(missed, false, false, now); // due now, level 0, streak 0
  ok(reflexWeight(missed, now) > reflexWeight(mastered, now), 'a just-missed reflex outweighs a mastered one');

  // overdue grows the weight
  const overdue = reflexWeight({ ...mastered, due: now - 5 * DAY }, now);
  ok(overdue > reflexWeight(mastered, now), 'overdue reflex weighs more than the same one not yet due');
}

console.log('deck gating from completed levels');
{
  const none = unlockedFromLevels(LEVELS, []);
  ok(none.size === 0, 'no completed levels → nothing unlocked');
  const deckStarter = availableReflexes(none);
  ok(deckStarter.length > 0, 'starter deck is non-empty even with nothing unlocked');
  const firstId = LEVELS[0].id;
  const someUnlocked = unlockedFromLevels(LEVELS, [firstId]);
  ok(someUnlocked.has('split-h'), 'completing the first level unlocks split-h');
}

console.log(`\nAll ${passed} assertions passed ✅`);
