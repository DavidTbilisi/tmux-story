// screens/game.js — one level run: builds the play screen, wires the keyboard,
// re-renders on every state change, detects the win, and shows the reward.

import { LEVELS } from '../levels.js';
import { makeState, pickChaseTarget } from '../state.js';
import { renderTmux } from '../render.js';
import { checkGoal } from '../goals.js';
import { markComplete, loadProgress, setCurrent, saveSettings } from '../progress.js';
import { createInput } from '../input.js';
import { resolveKeymap, keysToActions, keysForActions } from '../keymap.js';
import { el, clear } from '../dom.js';
import { chip } from './chips.js';
import { play, isSoundEnabled, toggleSound } from '../sound.js';

export function startGame(root, levelId, nav) {
  const level = LEVELS.find((l) => l.id === levelId);
  if (!level) { nav.levels(); return () => {}; }
  setCurrent(level.id);

  // The player's remap (prefix + rebinds) drives input, keycards, HUD and chips.
  const keymap = resolveKeymap(loadProgress().settings);
  let state = makeState(level, keysToActions(level.unlock));
  const drillsNeeded = level.drills ?? 3;
  const par = level.par ?? 10;
  let drillsDone = 0;
  let solved = false;
  let toastTimer = null;
  let repStart = performance.now();
  let timerInterval = null;

  function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => {
      const span = document.querySelector('.drill-timer');
      if (!span) return;
      const elapsed = (performance.now() - repStart) / 1000;
      span.textContent = elapsed.toFixed(1) + 's';
      const ratio = elapsed / par;
      span.className = 'drill-timer' +
        (ratio > 0.9 ? ' drill-timer--over' : ratio > 0.6 ? ' drill-timer--warn' : '');
    }, 100);
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  // ---- layout ----
  const screen = el('div', 'screen game');

  const header = el('div', 'game__header');
  const back = el('button', 'btn btn--ghost', '← Levels');
  back.addEventListener('click', () => nav.levels());
  const titles = el('div', 'game__titles');
  titles.appendChild(el('h2', null, level.title));
  titles.appendChild(el('p', 'muted', level.blurb));
  const worldTag = el('span', 'tag', level.world);
  const soundBtn = el('button', 'btn btn--ghost btn--icon', isSoundEnabled() ? '🔊' : '🔇');
  soundBtn.title = 'Toggle sounds';
  soundBtn.addEventListener('click', () => {
    const on = toggleSound();
    saveSettings({ sound: on });
    soundBtn.textContent = on ? '🔊' : '🔇';
    if (on) play('command');      // a pop so you hear it came back on
    soundBtn.blur();              // return focus to the window for key chords
  });
  header.append(back, titles, worldTag, soundBtn);

  const main = el('div', 'game__main');
  const stage = el('div', 'game__stage');
  const side = el('div', 'game__side');
  main.append(stage, side);

  const hud = el('div', 'game__hud');
  const overlay = el('div', 'overlay hidden');

  screen.append(header, main, hud, overlay);
  clear(root); root.appendChild(screen);

  // ---- rendering ----
  function renderStage() {
    clear(stage);
    stage.appendChild(renderTmux(state));
  }

  function renderSide() {
    clear(side);
    side.appendChild(el('h3', 'side__h', 'Objective'));
    side.appendChild(el('p', 'objective', level.objective));

    side.appendChild(el('h3', 'side__h', 'Keys this level'));
    const keys = el('div', 'keycards');
    for (const k of level.keys) {
      const card = el('div', 'keycard');
      const chord = el('div', 'keycard__chord');
      chord.appendChild(el('kbd', null, keymap.prefixLabel));
      chord.appendChild(el('span', 'keycard__then', 'then'));
      const glyphs = k.keysLabel ? [k.keysLabel] : keysForActions(keymap, k.actions);
      for (const g of glyphs) chord.appendChild(el('kbd', null, g));
      card.appendChild(chord);
      card.appendChild(el('div', 'keycard__desc', k.desc));
      keys.appendChild(card);
    }
    side.appendChild(keys);

    const hintBox = el('div', 'hint');
    hintBox.appendChild(el('span', 'hint__icon', '💡'));
    hintBox.appendChild(el('span', null, level.hint));
    side.appendChild(hintBox);
  }

  function renderHud() {
    clear(hud);

    const left = el('div', 'hud__left');
    if (state.prefix === 'armed') {
      left.appendChild(el('span', 'armed', 'PREFIX ARMED — press a key'));
    } else {
      const idle = el('span', 'prefixhint');
      idle.appendChild(el('kbd', null, keymap.prefixLabel));
      idle.appendChild(document.createTextNode(' — the prefix. Press it, then a command key.'));
      left.appendChild(idle);
    }
    if (state.toast) left.appendChild(el('span', 'toast', state.toast));
    hud.appendChild(left);

    const drillEl = el('div', 'drill-progress');
    const dots = Array.from({ length: drillsNeeded }, (_, i) =>
      el('span', i < drillsDone ? 'drill-dot drill-dot--done' : 'drill-dot', '●')
    );
    dots.forEach(d => drillEl.appendChild(d));
    drillEl.appendChild(el('span', 'drill-label', `${drillsDone}/${drillsNeeded}`));
    drillEl.appendChild(el('span', 'drill-sep', '·'));
    const elapsed0 = (performance.now() - repStart) / 1000;
    const ratio0 = elapsed0 / par;
    const timerSpan = el('span', 'drill-timer' +
      (ratio0 > 0.9 ? ' drill-timer--over' : ratio0 > 0.6 ? ' drill-timer--warn' : ''),
      elapsed0.toFixed(1) + 's');
    drillEl.appendChild(timerSpan);
    drillEl.appendChild(el('span', 'drill-par', `/ ${par}s`));
    hud.appendChild(drillEl);

    const tray = el('div', 'tray');
    const collected = loadProgress().collected;
    tray.appendChild(el('span', 'tray__label', 'Collected:'));
    if (collected.length === 0) {
      tray.appendChild(el('span', 'muted', 'nothing yet'));
    } else {
      for (const token of collected) tray.appendChild(chip(token, keymap));
    }
    hud.appendChild(tray);
  }

  function renderOverlay() {
    if (solved) return; // the win overlay is drawn by showComplete()
    if (state.mode === 'rename') {
      overlay.className = 'overlay';
      clear(overlay);
      const box = el('div', 'modal');
      box.appendChild(el('h3', null, 'Rename window'));
      const field = el('div', 'rename-field');
      field.appendChild(document.createTextNode('(rename-window) '));
      field.appendChild(el('span', 'rename-text', state.renameBuffer || ''));
      field.appendChild(el('span', 'pane__cursor', '█'));
      box.appendChild(field);
      box.appendChild(el('p', 'muted', 'Type a name, then Enter. Esc to cancel.'));
      overlay.appendChild(box);
    } else if (state.mode === 'rename-session') {
      overlay.className = 'overlay';
      clear(overlay);
      const box = el('div', 'modal');
      box.appendChild(el('h3', null, 'Rename session'));
      const field = el('div', 'rename-field');
      field.appendChild(document.createTextNode('(rename-session) '));
      field.appendChild(el('span', 'rename-text', state.renameBuffer || ''));
      field.appendChild(el('span', 'pane__cursor', '█'));
      box.appendChild(field);
      box.appendChild(el('p', 'muted', 'Type a name, then Enter. Esc to cancel.'));
      overlay.appendChild(box);
    } else if (state.mode === 'window-list') {
      overlay.className = 'overlay';
      clear(overlay);
      const box = el('div', 'modal');
      box.appendChild(el('h3', null, 'Windows'));
      const list = el('div', 'winlist');
      state.windows.forEach((w, i) => {
        const row = el('div', 'winlist__row' + (i === state.activeWindowIndex ? ' is-active' : ''));
        row.textContent = `${i}: ${w.name}`;
        list.appendChild(row);
      });
      box.appendChild(list);
      box.appendChild(el('p', 'muted', 'Press a number to jump. Esc to close.'));
      overlay.appendChild(box);
    } else {
      overlay.className = 'overlay hidden';
      clear(overlay);
    }
  }

  function rerender() {
    renderStage();
    renderHud();
    renderOverlay();
  }

  function notify(msg) {
    state.toast = msg;
    renderHud();
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { state.toast = null; renderHud(); }, 2000);
  }

  function resetForDrill(msg) {
    state = makeState(level, keysToActions(level.unlock));
    repStart = performance.now();
    notify(msg);
    rerender();
  }

  function win() {
    stopTimer();
    solved = true;
    const p = markComplete(level.id, level.rewards);
    showComplete(p);
    return 'win';
  }

  // Chase levels don't rebuild the layout between catches — the dot just hops to
  // a new pane and the rep timer restarts, so the chase stays continuous.
  function advanceChase(elapsed) {
    if (elapsed > par) {
      state.chaseTarget = pickChaseTarget(state);
      repStart = performance.now();
      notify(`${elapsed.toFixed(1)}s — too slow! Chase the next one.`);
      rerender();
      return 'slow';
    }
    drillsDone++;
    if (drillsDone >= drillsNeeded) return win();
    state.chaseTarget = pickChaseTarget(state);
    repStart = performance.now();
    notify(`✓ caught it! ${drillsDone}/${drillsNeeded}`);
    rerender();
    return 'rep';
  }

  // Returns a status so the caller can pick the matching sound:
  //   'win'  level cleared · 'rep' drill banked · 'slow' over par, retry · null otherwise
  function checkWin() {
    if (solved) return null;
    if (!checkGoal(state, level.goal)) return null;
    const elapsed = (performance.now() - repStart) / 1000;
    if (level.chase) return advanceChase(elapsed);
    if (elapsed > par) {
      resetForDrill(`${elapsed.toFixed(1)}s — need < ${par}s. Again!`);
      return 'slow';
    }
    drillsDone++;
    if (drillsDone >= drillsNeeded) return win();
    resetForDrill(`✓ ${elapsed.toFixed(1)}s — ${drillsDone}/${drillsNeeded}. Again!`);
    return 'rep';
  }

  function showComplete(progress) {
    const idx = LEVELS.findIndex((l) => l.id === level.id);
    const next = LEVELS[idx + 1];

    overlay.className = 'overlay';
    clear(overlay);
    const box = el('div', 'modal modal--win');
    box.appendChild(el('div', 'win__burst', '✦'));
    box.appendChild(el('h2', null, 'Level complete!'));
    box.appendChild(el('p', 'muted', level.title));

    if (level.rewards && level.rewards.length) {
      const got = el('div', 'win__rewards');
      got.appendChild(el('span', 'muted', 'You collected:'));
      for (const r of level.rewards) got.appendChild(chip(r, keymap));
      box.appendChild(got);
    }

    const actions = el('div', 'modal__actions');
    if (next) {
      const nx = el('button', 'btn btn--primary', `Next: ${next.title} →`);
      nx.addEventListener('click', () => nav.game(next.id));
      actions.appendChild(nx);
    } else {
      box.appendChild(el('p', null, "You've finished every level. Your fingers know tmux now. 🎉"));
    }
    const toLevels = el('button', 'btn btn--ghost', 'Level map');
    toLevels.addEventListener('click', () => nav.levels());
    actions.appendChild(toLevels);
    box.appendChild(actions);
    overlay.appendChild(box);
  }

  // ---- wire up input ----
  const onKey = createInput({
    getState: () => state,
    keymap,
    notify,
    onRender: rerender,
    afterCommand: () => {
      rerender();
      const status = checkWin();
      // win/rep get their own celebratory chimes; a too-slow rep gets the gentle
      // "aw"; an ordinary successful move gets the little command pop.
      play(status === 'win' ? 'win'
        : status === 'rep' ? 'rep'
        : status === 'slow' ? 'error'
        : 'command');
    },
  });
  window.addEventListener('keydown', onKey);

  renderSide();
  rerender();
  startTimer();

  // cleanup: detach the global listener when navigating away
  return () => {
    window.removeEventListener('keydown', onKey);
    if (toastTimer) clearTimeout(toastTimer);
    stopTimer();
  };
}
