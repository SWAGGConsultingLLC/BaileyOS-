import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';

const require = createRequire('/tmp/ui-check/package.json');
const puppeteer = require('puppeteer-core');

const server = spawn('python3', ['-m', 'http.server', '8767', '--bind', '127.0.0.1'], {
  cwd: new URL('..', import.meta.url),
  stdio: 'ignore',
});
await once(server, 'spawn');
for (let i = 0; i < 20; i++) {
  try {
    const res = await fetch('http://127.0.0.1:8767/mission-control/living-archive.html');
    if (res.ok) break;
  } catch { /* retry */ }
  await new Promise(r => setTimeout(r, 100));
}

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: 'new',
  args: ['--no-sandbox'],
});
try {

const posts = [];
async function openPage(viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = req.url();
    if (url.includes('supabase.co') && url.includes('/age_assertions')) {
      if (req.method() === 'POST' && req.postData()) posts.push({ url, body: req.postData() });
      req.respond({
        status: req.method() === 'OPTIONS' ? 204 : 401,
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' },
        contentType: 'application/json',
        body: req.method() === 'OPTIONS' ? '' : '{"message":"row-level security"}',
      });
      return;
    }
    if (url.includes('supabase.co')) {
      req.respond({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    if (url.startsWith('https://www.google.com')) {
      req.respond({ status: 200, contentType: 'text/html', body: '<title>google-intercept</title>' });
      return;
    }
    req.continue();
  });
  return page;
}

function futureYes() {
  const now = Date.now();
  return JSON.stringify({ state: 'yes', ts: now, expires: now + 864e5 });
}

const desktop = { width: 1280, height: 900 };
const mobile = { width: 390, height: 844, isMobile: true, hasTouch: true };

const fresh = await openPage(desktop);
await fresh.goto('http://127.0.0.1:8767/mission-control/living-archive.html', { waitUntil: 'domcontentloaded' });
await fresh.waitForSelector('#archive-age-gate');
const freshState = await fresh.evaluate(() => ({
  hold: document.documentElement.classList.contains('age-hold'),
  hiddenArchive: getComputedStyle(document.getElementById('ui')).visibility,
  overflow: getComputedStyle(document.documentElement).overflow,
  active: document.activeElement && document.activeElement.id,
  text: document.getElementById('archive-age-text').textContent,
}));
assert.equal(freshState.hold, true);
assert.equal(freshState.hiddenArchive, 'hidden');
assert.equal(freshState.overflow, 'hidden');
assert.equal(freshState.active, 'archive-age-yes');
assert.match(freshState.text, /not an age or identity verification/);
assert.match(freshState.text, /not a security barrier/);
await fresh.screenshot({ path: '/opt/cursor/artifacts/archive-gate-desktop.png' });
await fresh.keyboard.press('Tab');
const afterTab = await fresh.evaluate(() => document.activeElement.id);
assert.equal(afterTab, 'archive-age-no');
await fresh.keyboard.down('Shift');
await fresh.keyboard.press('Tab');
await fresh.keyboard.up('Shift');
assert.equal(await fresh.evaluate(() => document.activeElement.id), 'archive-age-yes');
await fresh.click('#archive-age-yes');
await fresh.waitForFunction(() => document.documentElement.classList.contains('age-open'));
const afterYes = await fresh.evaluate(() => ({
  open: document.documentElement.classList.contains('age-open'),
  gate: getComputedStyle(document.getElementById('archive-age-gate')).display,
  ui: getComputedStyle(document.getElementById('ui')).visibility,
  log: document.getElementById('age-log-status').textContent,
}));
assert.equal(afterYes.open, true);
assert.equal(afterYes.gate, 'none');
assert.equal(afterYes.ui, 'visible');
assert.match(afterYes.log, /Log not stored/);
assert.doesNotMatch(afterYes.log, /Log accepted/);
const bodies = posts.map(p => JSON.parse(p.body));
assert.ok(bodies.some(b => b.event === 'shown' && b.issuer_id === 'bailey-archive' && b.verified === false));
assert.ok(bodies.some(b => b.event === 'yes' && b.verified === true && !('age' in b) && !('birthdate' in b)));
await fresh.screenshot({ path: '/opt/cursor/artifacts/archive-after-yes-desktop.png' });

const remembered = await openPage(desktop);
await remembered.evaluateOnNewDocument(value => localStorage.setItem('bailey_agegate', value), futureYes());
posts.length = 0;
await remembered.goto('http://127.0.0.1:8767/mission-control/living-archive.html', { waitUntil: 'domcontentloaded' });
await remembered.waitForFunction(() => document.documentElement.classList.contains('age-open'));
assert.equal(await remembered.evaluate(() => getComputedStyle(document.getElementById('archive-age-gate')).display), 'none');
assert.equal(posts.filter(p => p.url.includes('age_assertions')).length, 0);

const expired = await openPage(mobile);
await expired.evaluateOnNewDocument(() => localStorage.setItem('bailey_agegate', JSON.stringify({ state: 'yes', ts: 1, expires: 1 })));
posts.length = 0;
await expired.goto('http://127.0.0.1:8767/mission-control/living-archive.html', { waitUntil: 'domcontentloaded' });
await expired.waitForSelector('#archive-age-yes');
const expiredEvents = () => posts.map(p => JSON.parse(p.body).event);
await expired.waitForFunction(() => document.getElementById('age-log-status').textContent.includes('Log not stored'));
assert.ok(expiredEvents().includes('recheck'));
assert.ok(expiredEvents().includes('shown'));
const box = await expired.evaluate(() => {
  const yes = document.getElementById('archive-age-yes').getBoundingClientRect();
  return { width: yes.width, height: yes.height, overflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
});
assert.ok(box.height >= 44);
assert.equal(box.overflow, false);
await expired.screenshot({ path: '/opt/cursor/artifacts/archive-gate-mobile.png' });

const garbage = await openPage(desktop);
await garbage.evaluateOnNewDocument(() => localStorage.setItem('bailey_agegate', '{not-json'));
await garbage.goto('http://127.0.0.1:8767/mission-control/living-archive.html', { waitUntil: 'domcontentloaded' });
await garbage.waitForSelector('#archive-age-yes');
assert.equal(await garbage.$eval('html', el => el.classList.contains('age-hold')), true);

const denied = await openPage(desktop);
await denied.evaluateOnNewDocument(() => {
  const deny = () => { throw new Error('denied'); };
  Object.defineProperty(window, 'localStorage', { configurable: true, get: deny });
});
await denied.goto('http://127.0.0.1:8767/mission-control/living-archive.html', { waitUntil: 'domcontentloaded' });
await denied.waitForSelector('#archive-age-yes');
await denied.click('#archive-age-yes');
await denied.waitForFunction(() => document.documentElement.classList.contains('age-open'));

const noExit = await openPage(desktop);
await noExit.goto('http://127.0.0.1:8767/mission-control/living-archive.html', { waitUntil: 'domcontentloaded' });
await noExit.waitForSelector('#archive-age-no');
await Promise.all([
  noExit.waitForFunction(() => location.href.startsWith('https://www.google.com')),
  noExit.click('#archive-age-no'),
]);

const home = await openPage(desktop);
await home.goto('http://127.0.0.1:8767/mission-control/', { waitUntil: 'domcontentloaded' });
assert.equal(await home.$('#archive-age-gate'), null);
const stone = await openPage(desktop);
await stone.goto('http://127.0.0.1:8767/landing-stone/', { waitUntil: 'domcontentloaded' });
assert.equal(await stone.$('#archive-age-gate'), null);

console.log('browser gate tests passed');
} finally {
  await browser.close();
  server.kill();
}
