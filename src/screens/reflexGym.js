// screens/reflexGym.js — the Reflex Gym: the mixed, timed, cue→action drill.
//
// Levels teach one move at a time. The Gym is where they become reflexes: a
// random CUE appears (a real situation), and you must fire the right chord —
// prefix then key — fast, with confusable neighbours mixed in. It scores
// accuracy + speed (not just "did you remember"), repeats weak reflexes more
// often, and gates you against the automaticity ladder at the end.
//
//   cue → (recognise) → (choose) → fire chord → feedback → repeat → speed

import { el, clear } from '../dom.js';
import { LEVELS } from '../levels.js';
import { loadProgress, saveReflexStats } from '../progress.js';
import { resolveKeymap, glyphFor, ACTION_META } from '../keymap.js';
import {
  REFLEXES, availableReflexes, unlockedFromLevels,
  updateReflexStat, reflexWeight, isAutomatic, levelLabel,
} from '../reflexes.js';
import { play } from '../sound.js';

const TARGET_MS = 3500;   // "fast" threshold (the speed gate)
const CAP_MS = 7000;      // no answer by here = a miss (pressure)
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

function parsePrefix(str) {
  const m = /^C-(.)$/i.exec(str || 'C-b');
  return { key: (m ? m[1] : 'b').toLowerCase() };
}

const labelOf = (a) => (ACTION_META[a] && ACTION_META[a].label) || a;

export function startReflexGym(root, nav) {
  const p = loadProgress();
  const keymap = resolveKeymap(p.settings);
  const pfx = parsePrefix(keymap.prefix);

  // Deck: what you've unlocked (union of completed levels). Dev-unlock drills all.
  const deck = p.settings.devUnlock
    ? REFLEXES.slice()
    : availableReflexes(unlockedFromLevels(LEVELS, p.completed));
  const totalRounds = Math.min(14, Math.max(8, deck.length + 4));

  // Per-reflex running stats for THIS session (drives the weak list + summary).
  const stat = new Map(deck.map((r) => [r.action, { seen: 0, wrong: 0, timeSum: 0 }]));
  // Persisted cross-session stats (spaced-execution ladder), copied so we save once.
  const persisted = { ...(p.reflexStats || {}) };
  let leveledUp = 0;           // reflexes that climbed the ladder this session
  const results = [];          // { action, correct, ms, pressed }
  let current = null;
  let prevAction = null;
  let armed = false;
  let phase = 'await';         // 'await' | 'feedback' | 'done'
  let roundStart = 0;
  let roundsDone = 0;
  let streak = 0;
  let capTimer = null;
  let advTimer = null;
  let tickTimer = null;

  // ---- layout ----
  const screen = el('div', 'screen gym');
  const header = el('div', 'game__header');
  const back = el('button', 'btn btn--ghost', '← Menu');
  back.addEventListener('click', () => nav.menu());
  const titles = el('div', 'game__titles');
  titles.appendChild(el('h2', null, '🥊 Reflex Gym'));
  titles.appendChild(el('p', 'muted', 'See the situation, fire the chord. Fast, mixed, no hints.'));
  header.append(back, titles, el('span', 'tag tag--chase', 'Mixed drill'));

  const stage = el('div', 'gym__stage');
  const hud = el('div', 'gym__hud');
  screen.append(header, stage, hud);
  clear(root); root.appendChild(screen);

  // ---- rendering ----
  function renderHud() {
    clear(hud);
    const left = el('div', 'hud__left');
    left.appendChild(el('span', armed ? 'armed' : 'prefixhint',
      armed ? 'PREFIX ARMED — fire the move' : `Press ${keymap.prefixLabel} then the move`));
    hud.appendChild(left);

    const mid = el('div', 'drill-progress');
    mid.appendChild(el('span', 'drill-label', `${roundsDone}/${totalRounds}`));
    mid.appendChild(el('span', 'drill-sep', '·'));
    const correct = results.filter((r) => r.correct).length;
    const acc = results.length ? Math.round((correct / results.length) * 100) : 100;
    mid.appendChild(el('span', 'drill-label', `${acc}% acc`));
    mid.appendChild(el('span', 'drill-sep', '·'));
    const elapsed = phase === 'await' && roundStart ? (performance.now() - roundStart) / 1000 : 0;
    const ratio = (elapsed * 1000) / TARGET_MS;
    mid.appendChild(el('span', 'drill-timer' +
      (ratio > 1.3 ? ' drill-timer--over' : ratio > 0.8 ? ' drill-timer--warn' : ''),
      elapsed.toFixed(1) + 's'));
    hud.appendChild(mid);

    const right = el('div', 'gym__streak');
    right.appendChild(el('span', 'muted', 'streak '));
    right.appendChild(el('span', 'gym__streaknum', String(streak)));
    hud.appendChild(right);
  }

  function renderCue() {
    clear(stage);
    if (!current) return;
    const card = el('div', 'gym__cue');
    card.appendChild(el('div', 'gym__cuelabel', 'WHEN YOU SEE'));
    card.appendChild(el('div', 'gym__cuetext', current.cue));
    card.appendChild(el('div', 'gym__cuehint', 'fire the move →'));
    stage.appendChild(card);
  }

  function renderFeedback(r) {
    clear(stage);
    const card = el('div', 'gym__cue ' + (r.correct ? 'gym__cue--ok' : 'gym__cue--bad'));
    card.appendChild(el('div', 'gym__cuetext', r.correct ? '✓ ' + labelOf(current.action) : '✗ not quite'));
    const want = `${keymap.prefixLabel} then ${glyphFor(keymap.actionToKey[current.action])}`;
    if (r.correct) {
      card.appendChild(el('div', 'gym__fbline', `${labelOf(current.action)} — ${(r.ms / 1000).toFixed(1)}s`
        + (r.ms <= TARGET_MS ? '  ⚡ fast' : '')));
    } else {
      const fired = r.pressed ? labelOf(r.pressed) : 'nothing (too slow)';
      card.appendChild(el('div', 'gym__fbline', `you fired ${fired} — wanted ${labelOf(current.action)} (${want})`));
    }
    card.appendChild(el('div', 'gym__cuehint', 'press any key for the next cue'));
    stage.appendChild(card);
  }

  // ---- round flow ----
  function pickReflex() {
    // Weight by persisted spaced-execution state (overdue + low-level score
    // higher) plus this session's misses; avoid an immediate repeat.
    const now = Date.now();
    const weighted = deck.map((r) => {
      const s = stat.get(r.action);
      let w = reflexWeight(persisted[r.action], now) + 2 * s.wrong;
      if (r.action === prevAction && deck.length > 1) w = 0.0001;
      return { r, w };
    });
    const total = weighted.reduce((a, x) => a + x.w, 0);
    let t = Math.random() * total;
    for (const x of weighted) { t -= x.w; if (t <= 0) return x.r; }
    return weighted[weighted.length - 1].r;
  }

  function nextRound() {
    clearTimers();
    if (roundsDone >= totalRounds) return finish();
    current = pickReflex();
    prevAction = current.action;
    armed = false;
    phase = 'await';
    roundStart = performance.now();
    renderCue(); renderHud();
    capTimer = setTimeout(() => evaluate(null), CAP_MS);
    tickTimer = setInterval(renderHud, 100);
  }

  function evaluate(pressed) {
    if (phase !== 'await') return;
    clearTimers();
    const ms = performance.now() - roundStart;
    const correct = pressed === current.action;
    const fast = correct && ms <= TARGET_MS;
    const s = stat.get(current.action);
    s.seen++; s.timeSum += ms; if (!correct) s.wrong++;
    // Fold into the persisted spaced-execution ladder and save.
    const before = (persisted[current.action] && persisted[current.action].level) || 0;
    persisted[current.action] = updateReflexStat(persisted[current.action], correct, fast, Date.now());
    if (persisted[current.action].level > before) leveledUp++;
    saveReflexStats(persisted);
    const r = { action: current.action, correct, ms, pressed };
    results.push(r);
    roundsDone++;
    streak = correct ? streak + 1 : 0;
    phase = 'feedback';
    play(correct ? (fast ? 'rep' : 'command') : 'error');
    renderFeedback(r); renderHud();
    advTimer = setTimeout(nextRound, 1200);
  }

  function clearTimers() {
    if (capTimer) { clearTimeout(capTimer); capTimer = null; }
    if (advTimer) { clearTimeout(advTimer); advTimer = null; }
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }

  // ---- input ----
  function onKey(e) {
    if (phase === 'done') return;
    if (phase === 'feedback') {           // any key advances to the next cue
      e.preventDefault();
      clearTimers(); nextRound();
      return;
    }
    // phase === 'await'
    if (!armed) {
      if (e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === pfx.key) {
        e.preventDefault(); armed = true; play('prefix'); renderHud();
      }
      return;
    }
    if (MODIFIER_KEYS.has(e.key)) return; // wait through bare modifier taps
    e.preventDefault();
    if (e.key === 'Escape') { armed = false; renderHud(); return; }
    const isArrow = e.key.startsWith('Arrow');
    const key = (e.altKey && isArrow) ? 'M-' + e.key : e.key;
    armed = false;
    evaluate(keymap.keyToAction[key] || null);
  }

  // ---- summary ----
  function finish() {
    phase = 'done';
    clearTimers();
    const correct = results.filter((r) => r.correct);
    const acc = results.length ? correct.length / results.length : 0;
    const avgMs = correct.length ? correct.reduce((a, r) => a + r.ms, 0) / correct.length : 0;
    const fast = correct.filter((r) => r.ms <= TARGET_MS).length;

    clear(stage);
    const box = el('div', 'gym__summary');
    box.appendChild(el('h3', null, 'Session complete'));

    const stats = el('div', 'gym__stats');
    const stat1 = (label, val) => { const d = el('div', 'gym__stat'); d.appendChild(el('div', 'gym__statnum', val)); d.appendChild(el('div', 'gym__statlabel', label)); return d; };
    stats.append(
      stat1('accuracy', Math.round(acc * 100) + '%'),
      stat1('avg time', (avgMs / 1000).toFixed(1) + 's'),
      stat1('fast (≤3.5s)', `${fast}/${correct.length}`),
      stat1('best streak', String(results.reduce((m, _, i) => {
        let run = 0; for (let j = i; j < results.length && results[j].correct; j++) run++; return Math.max(m, run);
      }, 0))),
    );
    box.appendChild(stats);

    // Automaticity gate reached (the ladder from the framework).
    const gate = acc >= 0.9 && avgMs <= TARGET_MS ? { n: 5, t: 'Automatic — 90% correct, mixed, under 3.5s' }
      : acc >= 0.9 && avgMs <= 5000 ? { n: 4, t: 'Under pressure — 90% correct under 5s' }
      : acc >= 0.9 && avgMs <= 10000 ? { n: 3, t: 'Timed — 90% correct under 10s' }
      : acc >= 0.9 ? { n: 2, t: 'Accurate — 90% correct' }
      : acc >= 0.8 ? { n: 1, t: 'Knows the moves — 80% correct' }
      : { n: 0, t: 'Keep drilling — under 80%' };
    const g = el('div', 'gym__gate');
    g.appendChild(el('span', 'gym__gatenum', 'L' + gate.n));
    g.appendChild(el('span', null, gate.t));
    box.appendChild(g);

    // Cross-session mastery: how many of the unlocked reflexes are automatic.
    const automatic = deck.filter((r) => isAutomatic(persisted[r.action])).length;
    const mastery = el('p', 'gym__mastery',
      `${automatic}/${deck.length} reflexes automatic`
      + (leveledUp ? ` · ${leveledUp} leveled up this session` : ''));
    box.appendChild(mastery);

    // Weak reflexes — what to drill next (missed, or consistently slow).
    const weak = deck
      .map((r) => ({ r, s: stat.get(r.action) }))
      .filter((x) => x.s.seen && (x.s.wrong > 0 || x.s.timeSum / x.s.seen > TARGET_MS))
      .sort((a, b) => (b.s.wrong - a.s.wrong) || (b.s.timeSum / b.s.seen - a.s.timeSum / a.s.seen))
      .slice(0, 6);
    if (weak.length) {
      box.appendChild(el('h4', 'gym__weakh', 'Drill these next'));
      const list = el('div', 'gym__weak');
      for (const { r, s } of weak) {
        const row = el('div', 'gym__weakrow');
        const chord = el('span', 'gym__weakchord');
        chord.appendChild(el('kbd', null, keymap.prefixLabel));
        chord.appendChild(el('kbd', null, glyphFor(keymap.actionToKey[r.action])));
        const lvl = (persisted[r.action] && persisted[r.action].level) || 0;
        row.append(chord, el('span', 'gym__weaklabel', labelOf(r.action)),
          el('span', 'gym__weaklevel', levelLabel(lvl)),
          el('span', 'muted', s.wrong ? `${s.wrong} missed` : 'slow'));
        list.appendChild(row);
      }
      box.appendChild(list);
    }

    const actions = el('div', 'modal__actions');
    const again = el('button', 'btn btn--primary', 'Drill again');
    again.addEventListener('click', () => { cleanup(); startReflexGym(root, nav); });
    const menu = el('button', 'btn btn--ghost', 'Menu');
    menu.addEventListener('click', () => nav.menu());
    actions.append(again, menu);
    box.appendChild(actions);
    stage.appendChild(box);
    renderHud();
  }

  // ---- boot ----
  function cleanup() {
    window.removeEventListener('keydown', onKey);
    clearTimers();
  }
  window.addEventListener('keydown', onKey);
  nextRound();
  return cleanup;
}
