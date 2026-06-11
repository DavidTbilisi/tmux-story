// progress.js — persistence wrapper over a single localStorage key.

const KEY = 'tmux-story:v1';

const DEFAULTS = {
  version: 1,
  completed: [],          // level ids
  collected: [],          // earned badge tokens (for the trophy tray)
  current: null,          // last level opened (resume hint)
  // prefix is the parsed prefix (HUD fallback); config is the raw ~/.tmux.conf
  // text the player pasted/uploaded — resolveKeymap() re-parses it each load.
  settings: { prefix: 'C-b', config: '' },
};

export function loadProgress() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredCopy(DEFAULTS);
    const p = JSON.parse(raw);
    return {
      ...DEFAULTS,
      ...p,
      settings: { ...DEFAULTS.settings, ...(p.settings || {}) },
      completed: p.completed || [],
      collected: p.collected || [],
    };
  } catch {
    return structuredCopy(DEFAULTS);
  }
}

export function saveProgress(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage disabled */ }
}

export function markComplete(levelId, rewards) {
  const p = loadProgress();
  if (!p.completed.includes(levelId)) p.completed.push(levelId);
  for (const r of rewards || []) if (!p.collected.includes(r)) p.collected.push(r);
  p.current = levelId;
  saveProgress(p);
  return p;
}

export function setCurrent(levelId) {
  const p = loadProgress();
  p.current = levelId;
  saveProgress(p);
}

// Merge a patch into settings (e.g. { config, prefix }) and persist. Returns the
// new settings object. Progress (completed levels/badges) is left untouched.
export function saveSettings(patch) {
  const p = loadProgress();
  p.settings = { ...p.settings, ...patch };
  saveProgress(p);
  return p.settings;
}

export function resetProgress() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

// A level is unlocked if it's the first one or the previous one is completed.
export function isLevelUnlocked(levels, levelId) {
  const p = loadProgress();
  const idx = levels.findIndex((l) => l.id === levelId);
  if (idx <= 0) return true;
  return p.completed.includes(levels[idx - 1].id);
}

function structuredCopy(o) {
  return JSON.parse(JSON.stringify(o));
}
