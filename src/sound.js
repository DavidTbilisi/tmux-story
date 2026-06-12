// sound.js — a tiny Web Audio synth for cute UI blips. No audio files: every
// sound is a short oscillator note, so it works offline (even from file://) and
// adds nothing to the download. One shared AudioContext, created lazily on the
// first sound so it's unlocked by the keypress/click that triggered it (browser
// autoplay policy requires a user gesture).

let ctx = null;
let enabled = true;

export function setSoundEnabled(on) { enabled = !!on; }
export function isSoundEnabled() { return enabled; }
export function toggleSound() { enabled = !enabled; return enabled; }

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// One note: pitch glides f0 → f1 over `dur` seconds with a soft attack and an
// exponential decay (the rounded envelope is what keeps it "cute" not "beep").
function note(f0, f1, dur, { type = 'triangle', gain = 0.11, delay = 0 } = {}) {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008); // quick soft attack
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); // gentle decay
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// A pentatonic scale (C D E G A) — picking from it keeps repeated pops musical
// instead of monotonous, so mashing commands sounds like a little melody.
const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0];
function pick() { return PENTA[(Math.random() * PENTA.length) | 0]; }

const SFX = {
  // rising chirp — "ready?" when the prefix arms
  prefix:  () => note(880, 1320, 0.08, { type: 'sine', gain: 0.07 }),
  // a happy little pop on every successful command, pitch varied for melody
  command: () => { const f = pick(); note(f, f * 1.5, 0.06, { gain: 0.09 }); },
  // soft downward "aw" — gentle, never harsh
  error:   () => note(330, 220, 0.16, { type: 'sine', gain: 0.10 }),
  // two-note rise (G→C) when a drill rep banks
  rep:     () => { note(784, 784, 0.08, { gain: 0.09 }); note(1047, 1047, 0.13, { gain: 0.10, delay: 0.08 }); },
  // sparkly C–E–G–C arpeggio on level complete
  win:     () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
             note(f, f, 0.2, { gain: 0.10, delay: i * 0.085 })),
  // barely-there tick while typing a name
  type:    () => note(1600, 1600, 0.02, { type: 'square', gain: 0.025 }),
  // soft UI click for menu/nav buttons
  click:   () => note(660, 880, 0.05, { gain: 0.06 }),
};

export function play(name) {
  if (!enabled) return;
  const fn = SFX[name];
  if (!fn) return;
  try { fn(); } catch { /* audio unavailable — stay silent */ }
}
