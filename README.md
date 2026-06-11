# tmux-story

A browser game that teaches **tmux** the way [vim-adventures](https://vim-adventures.com/)
teaches vim: small puzzles that you can only solve with the real key chords, so the
`prefix`-then-key habit becomes muscle memory. No install, no build step — it's plain
HTML/CSS/ES-modules and everything runs in the browser.

> The tmux you see is **simulated**. Your keystrokes never reach a real shell — but the
> chords (`Ctrl-b %`, `Ctrl-b c`, …) are the real ones, so the muscle memory transfers.

## Run it

```bash
cd tmux-story
python3 -m http.server 8000
# open http://localhost:8000
```

Any static file server works. (Opening `index.html` directly via `file://` usually works
too since the data is JS modules, but a server avoids module/MIME edge cases.)

## How to play

1. Press the **prefix** — hold `Ctrl` and tap `b`. The terminal border glows: it's *armed*.
2. Press one **command key**. e.g. `%` to split left/right, `c` for a new window.
3. Each level unlocks just a few keys and gives you one goal. Solve it to **collect** the
   keys and unlock the next level. Progress is saved in `localStorage`.

If you press a key the level hasn't taught yet, you'll get a gentle nudge — that focus is
the point: you drill exactly the new chord until it's automatic.

## Use your own keybindings

If you've customised `~/.tmux.conf`, drill *your* chords instead of the stock ones. From the
menu, open **⌨ Keybindings** and either paste your config or upload the file. The game parses
the parts it can simulate and rebinds the levels live — the keycards, HUD prefix, and badge
chips all update to match.

```tmux
set -g prefix C-a          # play with Ctrl-a as the prefix
bind | split-window -h     # split ⇆ on |  (instead of %)
bind - split-window -v     # split ⇅ on -  (instead of ")
bind h select-pane -L      # vim-style pane navigation…
bind j select-pane -D
bind k select-pane -U
bind l select-pane -R
```

What it understands: `set -g prefix C-x`, and `bind`/`bind-key` for the commands the game
simulates — `split-window -h/-v`, `select-pane -L/R/U/D` (and `-t :.+` for cycling),
`resize-pane -Z` (zoom), `kill-pane`, `new-window`, `next-`/`previous-window`,
`rename-window`, `choose-tree`/`choose-window`, and `select-window -t N`. Common aliases
(`splitw`, `selectp`, …) work too.

Everything else — no-prefix (`-n`) binds, copy-mode tables, commands the game can't perform —
is **ignored and listed** in the preview, so nothing fails silently. The model is one key per
action: a rebind moves that action to your key (you drill the key you'll actually use). Your
config is saved in `localStorage`; **Reset to defaults** restores stock tmux keys.

## The MVP levels

| # | Level | Teaches |
|---|-------|---------|
| 1 | Split the World | the prefix mechanic, `%` |
| 2 | Stack ’Em | `"` (mix split directions) |
| 3 | Wander | `o`, arrow-key pane navigation |
| 4 | Four Corners | build a 2×2 grid |
| 5 | Focus & Destroy | `x` (kill), `z` (zoom) |
| 6 | New Horizons | `c`, `n`, `p` (windows) |
| 7 | Teleport | `0–9` jump, `,` rename, `w` list |

Deferred to a future v2 (the architecture already has slots for them): copy mode (`[` `]`),
sessions (`d` `s`), command mode (`:`), resize, and pane swap.

## Architecture

Pure logic (no DOM, unit-testable) is split from the DOM/IO shell.

```
index.html            mounts #app, loads src/main.js as a module
styles.css            terminal look, pane borders, status bar, HUD, screens
src/
  main.js             entry + tiny router (menu → levels → game → settings)
  state.js            session→window→pane TREE + tree surgery + navigation   ← pure
  commands.js         action id → command registry (simulated tmux semantics) ← pure
  keymap.js           action ids, default bindings, .tmux.conf parser/resolver← pure
  goals.js            win predicates                                          ← pure
  levels.js           the 7 level definitions (data)                         ← pure
  input.js            prefix state machine (idle → armed → run)
  render.js           recursive flexbox panes + status bar
  progress.js         localStorage wrapper (progress + keybinding settings)
  dom.js              tiny el()/clear() helpers
  screens/
    menu.js, levelSelect.js, game.js, settings.js, chips.js
test/
  state.test.mjs      node sanity checks for the tree logic
  keymap.test.mjs     node checks for the .tmux.conf parser + resolution
  smoke.e2e.mjs       Playwright run of all 7 levels (stock keys)
  remap.e2e.mjs       Playwright proof the game plays with a remapped config
```

**Keys vs. actions.** The game has a fixed set of *actions* (`split-h`, `kill-pane`, …);
which physical key triggers each is the remappable part. `input.js` resolves a pressed key to
an action through the active keymap, then runs it from `commands.js`. Because the win
predicates in `goals.js` test layout *structure*, never specific keys, remapping never touches
goal-checking — that's what keeps the feature contained.

**Why flexbox for panes?** A tmux window is a recursive binary partition of a rectangle.
A `split` node maps directly to a flex container (`row` = left/right, `column` =
top/bottom) and the two children take `flex-grow` from the split ratio — so any nesting
(2×2, L-shapes) lays out for free, and active-pane highlighting is just a border color.

## Run the logic tests

```bash
node test/state.test.mjs     # tree surgery + goal predicates
node test/keymap.test.mjs    # .tmux.conf parsing + keymap resolution
```

These cover the one genuinely tricky algorithm — `removeLeaf` (kill a pane, promote its
sibling) — plus splitting, the goal predicates, and the config parser. No framework, no
dependencies.

The browser end-to-end checks need a static server and `playwright-core` (a devDependency,
uses system Chrome):

```bash
python3 -m http.server 8123 &
BASE=http://localhost:8123 node test/smoke.e2e.mjs    # all 7 levels, stock keys
BASE=http://localhost:8123 node test/remap.e2e.mjs    # plays with a custom .tmux.conf
```

## Authoring a level

Add an object to `LEVELS` in `src/levels.js`:

```js
{
  id: 'panes-1', title: 'Split the World', world: 'Panes',
  blurb: '…', objective: '…', hint: '…',
  start: { windows: [{ name: 'bash', layout: 'single' }] }, // single|two-h|two-v|2x2
  unlock: ['%'],            // stock keys pressable this level (mapped to actions)
  rewards: ['%'],           // chips shown on completion
  goal: { id: 'paneCount', count: 2 },   // resolved by src/goals.js
  keys: [{ actions: ['split-h'], desc: 'split left / right' }], // keycards (action ids)
}
```

Goal ids live in `src/goals.js`: `paneCount`, `mixedSplit`, `grid2x2`, `activePaneIndex`,
`zoomedWithCount`, `windowCount`, `activeWindowIs`, `windowNamed`.

Action ids (for `keys[].actions`) live in `src/keymap.js`: `split-h`, `split-v`, `cycle-pane`,
`pane-left/right/up/down`, `zoom`, `kill-pane`, `new-window`, `next-window`, `prev-window`,
`rename-window`, `window-list`, `select-window-0`…`select-window-9`. A keycard can pass
`keysLabel: '0–9'` to show a range instead of every key.
