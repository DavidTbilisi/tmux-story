// input.js — the prefix state machine. This is the heart of "automaticity":
// nothing happens until you press the prefix (Ctrl-b), and then exactly the
// next key is interpreted as a tmux command.
//
//   idle  --prefix(Ctrl-b)-->  armed  --key-->  run command --> idle
//                               armed  --Esc-->  idle
//
// Two sub-modes (rename, window-list) capture keys directly until dismissed.

import { ACTIONS } from './commands.js';
import { ACTION_META, glyphFor } from './keymap.js';
import { activeWindow, leaves } from './state.js';
import { play } from './sound.js';

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

function parsePrefix(str) {
  const m = /^C-(.)$/i.exec(str || 'C-b');
  return { key: (m ? m[1] : 'b').toLowerCase() };
}

// ctx: { getState, keymap, notify(msg), onRender(), afterCommand(key) }
export function createInput(ctx) {
  const km = ctx.keymap;
  const pfx = parsePrefix(km.prefix);

  return function onKey(e) {
    const s = ctx.getState();

    // --- rename sub-mode: type the new window name ---
    if (s.mode === 'rename') {
      e.preventDefault();
      if (e.key === 'Enter') {
        const name = (s.renameBuffer || '').trim();
        if (name) activeWindow(s).name = name;
        s.mode = 'normal'; s.renameBuffer = null;
        ctx.onRender(); ctx.afterCommand(',');
      } else if (e.key === 'Escape') {
        s.mode = 'normal'; s.renameBuffer = null; ctx.onRender();
      } else if (e.key === 'Backspace') {
        s.renameBuffer = (s.renameBuffer || '').slice(0, -1); ctx.onRender();
      } else if (e.key.length === 1) {
        s.renameBuffer = (s.renameBuffer || '') + e.key; play('type'); ctx.onRender();
      }
      return;
    }

    // --- pane-numbers sub-mode: press 0–9 to jump to that pane (0-based, like tmux) ---
    if (s.mode === 'pane-numbers') {
      e.preventDefault();
      if (/^[0-9]$/.test(e.key)) {
        const i = Number(e.key);
        const w = activeWindow(s);
        const ls = leaves(w.root);
        if (i < ls.length) w.activePaneId = ls[i].id;
        s.mode = 'normal'; ctx.onRender(); ctx.afterCommand('q');
      } else if (e.key === 'Escape') {
        s.mode = 'normal'; ctx.onRender();
      }
      return;
    }

    // --- rename-session sub-mode ---
    if (s.mode === 'rename-session') {
      e.preventDefault();
      if (e.key === 'Enter') {
        const name = (s.renameBuffer || '').trim();
        if (name) s.session.name = name;
        s.mode = 'normal'; s.renameBuffer = null;
        ctx.onRender(); ctx.afterCommand('$');
      } else if (e.key === 'Escape') {
        s.mode = 'normal'; s.renameBuffer = null; ctx.onRender();
      } else if (e.key === 'Backspace') {
        s.renameBuffer = (s.renameBuffer || '').slice(0, -1); ctx.onRender();
      } else if (e.key.length === 1) {
        s.renameBuffer = (s.renameBuffer || '') + e.key; play('type'); ctx.onRender();
      }
      return;
    }

    // --- window-list sub-mode: pick a window by number ---
    if (s.mode === 'window-list') {
      e.preventDefault();
      if (/^[0-9]$/.test(e.key)) {
        const i = Number(e.key);
        if (i < s.windows.length) s.activeWindowIndex = i;
        s.mode = 'normal'; ctx.onRender(); ctx.afterCommand('w');
      } else if (e.key === 'Escape' || e.key === 'Enter') {
        s.mode = 'normal'; ctx.onRender();
      }
      return;
    }

    // --- idle: wait for the prefix chord ---
    if (s.prefix === 'idle') {
      if (e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === pfx.key) {
        e.preventDefault();
        s.prefix = 'armed';
        play('prefix');
        ctx.onRender();
      }
      return;
    }

    // --- armed: the next key is the command ---
    if (s.prefix === 'armed') {
      if (MODIFIER_KEYS.has(e.key)) return; // ignore bare modifier taps; keep waiting
      e.preventDefault();
      s.prefix = 'idle';
      if (e.key === 'Escape') { ctx.onRender(); return; }

      // Alt+Arrow encodes as 'M-ArrowLeft' etc. (stock tmux M-Arrow resize bindings).
      const isArrow = e.key.startsWith('Arrow');
      const key = (e.altKey && isArrow) ? 'M-' + e.key : e.key;
      const actionId = km.keyToAction[key];
      const cmd = actionId && ACTIONS[actionId];
      if (!cmd) {
        ctx.notify(`No tmux binding for "${glyphFor(key)}"`);
        play('error');
        ctx.onRender();
        return;
      }
      if (!s.unlockedActions.has(actionId)) {
        const label = (ACTION_META[actionId] && ACTION_META[actionId].label) || actionId;
        ctx.notify(`🔒 "${glyphFor(key)}" (${label}) isn't unlocked in this level yet`);
        play('error');
        ctx.onRender();
        return;
      }
      const changed = cmd.run(s);
      ctx.onRender();
      if (changed) ctx.afterCommand(key);
      return;
    }
  };
}
