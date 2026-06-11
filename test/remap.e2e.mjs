// End-to-end proof of key remapping (tier B): seed a custom ~/.tmux.conf into
// localStorage, then play the real game with the REMAPPED chords and confirm
// the old defaults no longer work and the UI shows the new keys.
//
//   python3 -m http.server 8123 &
//   BASE=http://localhost:8123 node test/remap.e2e.mjs

import { chromium } from 'playwright-core';

const BASE = process.env.BASE || 'http://localhost:8123';

const CONFIG = [
  'set -g prefix C-a',          // prefix Ctrl-b → Ctrl-a
  'bind | split-window -h',     // split ⇆ on |  (was %)
  'bind - split-window -v',     // split ⇅ on -  (was ")
  'bind h select-pane -L',      // vim-style pane nav
  'bind j select-pane -D',
  'bind k select-pane -U',
  'bind l select-pane -R',
].join('\n');

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 820 } });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

let passed = 0;
function ok(cond, msg) {
  if (!cond) throw new Error('FAILED: ' + msg);
  passed++;
  console.log('  ✓ ' + msg);
}
const paneCount = () => page.locator('.terminal .pane').count();

// Arm the (remapped) prefix, then press one command key.
async function chord(typeKey, pressKey) {
  await page.keyboard.press('Control+a'); // the remapped prefix
  if (typeKey != null) await page.keyboard.type(typeKey);
  else await page.keyboard.press(pressKey);
  await page.waitForTimeout(40);
}

// Seed config + mark the first two levels done (so we can open level 3 directly).
await page.goto(BASE);
await page.evaluate((config) => {
  localStorage.setItem('tmux-story:v1', JSON.stringify({
    version: 1,
    completed: ['panes-1', 'panes-2'],
    collected: ['%', '"'],
    current: null,
    settings: { prefix: 'C-a', config },
  }));
}, CONFIG);
await page.goto(BASE);
await page.waitForTimeout(150);

// ---- Level 1 with the remap: C-a | should split; C-b % should NOT ----
await page.getByRole('button', { name: /Continue|Start playing|Replay/ }).click();
await page.waitForTimeout(150);
// Continue may resume at level 3 (first undone); jump to level 1 explicitly.
await page.evaluate(() => null);
await page.goto(BASE);
await page.getByRole('button', { name: /Level map/ }).click();
await page.waitForTimeout(120);
await page.getByText('Split the World').click();
await page.waitForTimeout(120);

ok((await page.locator('h2').first().innerText()).includes('Split the World'), 'level 1 loaded');
ok((await paneCount()) === 1, 'starts with 1 pane');

// the HUD + keycard should advertise the remapped chord
const hudPrefix = await page.locator('.prefixhint kbd').first().innerText();
ok(hudPrefix === 'C-a', `HUD shows the remapped prefix (got "${hudPrefix}")`);
const cardKbds = await page.locator('.keycard').first().locator('kbd').allInnerTexts();
ok(cardKbds[0] === 'C-a' && cardKbds[cardKbds.length - 1] === '|',
  `keycard shows C-a … | (got ${JSON.stringify(cardKbds)})`);

// old default chord does nothing now
await page.keyboard.press('Control+b');
await page.keyboard.type('%');
await page.waitForTimeout(60);
ok((await paneCount()) === 1, 'old C-b % is inert after remap');

// the remapped chord works
await chord('|');
ok((await paneCount()) === 2, 'C-a | splits the pane');
await page.waitForFunction(() => document.body.innerText.includes('Level complete!'), null, { timeout: 4000 });
ok(true, 'level 1 solved with the remapped split');

// ---- Level 3 (Wander): navigate a 2x2 to the bottom-right with h/j/k/l ----
await page.goto(BASE);
await page.getByRole('button', { name: /Level map/ }).click();
await page.waitForTimeout(120);
await page.getByText('Wander').click();
await page.waitForTimeout(120);
ok((await page.locator('h2').first().innerText()).includes('Wander'), 'level 3 loaded');
ok((await paneCount()) === 4, 'starts as a 2x2 grid');
await chord('l'); // move right
await chord('j'); // move down → bottom-right (pane 4)
await page.waitForFunction(() => document.body.innerText.includes('Level complete!'), null, { timeout: 4000 });
ok(true, 'level 3 solved by navigating with h/j/k/l');

ok(errors.length === 0, 'no console/page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));

console.log(`\nAll ${passed} remap steps passed ✅`);
await browser.close();
