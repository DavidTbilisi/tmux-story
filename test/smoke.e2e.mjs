// End-to-end smoke test: drives the real game in Chrome via Playwright and
// plays all 7 levels with the actual key chords. Verifies the prefix state
// machine, rendering, win detection, and progression — the DOM layer the
// unit tests can't reach.
//
// Needs: a static server on $BASE (default http://localhost:8123) and
// playwright-core (devDependency). Uses system Chrome, so no browser download.
//
//   python3 -m http.server 8123 &
//   node test/smoke.e2e.mjs

import { chromium } from 'playwright-core';

const BASE = process.env.BASE || 'http://localhost:8123';
const SHOT = '/tmp';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 820 } });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

let step = 0;
function ok(cond, msg) {
  if (!cond) throw new Error('FAILED: ' + msg);
  console.log('  ✓ ' + msg);
}
const prefix = () => page.keyboard.press('Control+b');
async function chord(secondType, secondPress) {
  await prefix();
  if (secondType != null) await page.keyboard.type(secondType);
  else await page.keyboard.press(secondPress);
  await page.waitForTimeout(40);
}
async function paneCount() {
  return page.locator('.terminal .pane').count();
}
async function waitWin() {
  await page.waitForFunction(() => document.body.innerText.includes('Level complete!'), null, { timeout: 4000 });
}
async function next() {
  await page.getByRole('button', { name: /Next:/ }).click();
  await page.waitForTimeout(120);
}
async function shot(name) {
  const p = `${SHOT}/tmux-story-${name}.png`;
  await page.screenshot({ path: p });
  console.log('  📸 ' + p);
}

// reset any saved progress so we start at level 1
await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.goto(BASE);
await page.waitForTimeout(150);
ok((await page.locator('.menu__logo').count()) === 1, 'menu renders the ASCII logo');
await shot('1-menu');

await page.getByRole('button', { name: /Start playing/ }).click();
await page.waitForTimeout(150);

// ---- Level 1: Split the World — C-b % ----
ok((await page.locator('h2').first().innerText()).includes('Split the World'), 'level 1 loaded');
ok((await paneCount()) === 1, 'starts with 1 pane');
await chord('%');
ok((await paneCount()) === 2, 'C-b % made 2 panes');
await waitWin();
ok(true, 'level 1 solved');
await shot('2-win');
await next();

// ---- Level 2: Stack ’Em — C-b % then C-b " ----
ok((await page.locator('h2').first().innerText()).includes('Stack'), 'level 2 loaded');
await chord('%');
await chord('"');
await waitWin();
ok((await paneCount()) === 3, 'mixed split → 3 panes, solved');
await next();

// ---- Level 3: Wander — navigate a 2x2 to the bottom-right pane ----
ok((await page.locator('h2').first().innerText()).includes('Wander'), 'level 3 loaded');
ok((await paneCount()) === 4, 'starts as a 2x2 grid');
await shot('3-grid2x2');
await chord(null, 'ArrowRight'); // top-right
await chord(null, 'ArrowDown');  // bottom-right (pane 4)
await waitWin();
ok(true, 'level 3 solved by navigation');
await next();

// ---- Level 4: Four Corners — build a 2x2 from one pane ----
ok((await page.locator('h2').first().innerText()).includes('Four Corners'), 'level 4 loaded');
await chord('%');               // left | right (active = right)
await chord('"');               // split right top/bottom
await chord(null, 'ArrowLeft'); // move to left pane
await chord('"');               // split left top/bottom -> 2x2
await waitWin();
ok((await paneCount()) === 4, 'built a 2x2 grid, solved');
await next();

// ---- Level 5: Focus & Destroy — kill to 2 panes, then zoom ----
ok((await page.locator('h2').first().innerText()).includes('Focus'), 'level 5 loaded');
await chord('x');
await chord('x');
ok((await paneCount()) === 2, 'two kills leave 2 panes');
await chord('z');
await waitWin();
ok(true, 'level 5 solved (zoom + 2 panes)');
await next();

// ---- Level 6: New Horizons — open 3 windows ----
ok((await page.locator('h2').first().innerText()).includes('New Horizons'), 'level 6 loaded');
await chord('c');
await chord('c');
await waitWin();
const winItems = await page.locator('.statusbar__windows .win').count();
ok(winItems === 3, 'status bar shows 3 windows');
await shot('4-windows');
await next();

// ---- Level 7: Teleport — jump to window 2, rename it "logs" ----
ok((await page.locator('h2').first().innerText()).includes('Teleport'), 'level 7 loaded');
await chord('2');                       // jump to window 2
await chord(',');                       // open rename
await page.waitForTimeout(60);
ok((await page.locator('.rename-field').count()) === 1, 'rename prompt opened');
await page.keyboard.type('logs');
await page.keyboard.press('Enter');
await waitWin();
ok(true, 'level 7 solved (renamed window to logs)');
await shot('5-finish');

ok(errors.length === 0, 'no console/page errors during the whole run' + (errors.length ? ': ' + errors.join(' | ') : ''));

console.log('\nAll smoke steps passed ✅');
await browser.close();
