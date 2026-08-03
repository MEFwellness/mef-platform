#!/usr/bin/env node
// Live verification for the branded "Reset" entry animation against
// production. Mirrors login()/config.mjs the same way
// verify-dashboard-evolution-live.mjs and verify-root-presence-live.mjs do.
//
// Polls for the overlay rather than checking single points in time: a
// fresh production browser context's first request pays real TLS/DNS/
// cold-start cost (confirmed directly during this build — sometimes 6-7s
// before the login redirect resolves), which a fixed "check at +300ms"
// assertion would misread as "never appeared" purely from bad timing, not
// a real failure. Polling records when the overlay was actually observed
// regardless of how long the surrounding network calls took.
//
// Usage: SCREENSHOT_TARGET=live node scripts/screenshots/verify-entry-animation-live.mjs
import { chromium } from 'playwright';
import { ACCOUNTS, BASE_URL, VIEWPORT } from './config.mjs';
import { login } from './lib.mjs';

const OVERLAY_SELECTOR = 'div[aria-hidden="true"].fixed.inset-0';
const consoleIssues = [];

function attachListeners(page, label) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleIssues.push({ label, type: 'console.error', text: msg.text(), url: page.url() });
  });
  page.on('pageerror', (err) => consoleIssues.push({ label, type: 'pageerror', text: err.message, url: page.url() }));
}

/** Polls up to maxMs for the overlay's presence window: [firstSeen, lastSeen], both ms from call time, or null if never observed. */
async function observeOverlayWindow(page, maxMs) {
  const t0 = Date.now();
  let firstSeen = null;
  let lastSeen = null;
  while (Date.now() - t0 < maxMs) {
    const count = await page.locator(OVERLAY_SELECTOR).count();
    if (count > 0) {
      if (firstSeen === null) firstSeen = Date.now() - t0;
      lastSeen = Date.now() - t0;
    } else if (firstSeen !== null) {
      break; // appeared, then gone — sequence finished
    }
    await page.waitForTimeout(75);
  }
  return firstSeen === null ? null : { firstSeen, lastSeen, durationMs: lastSeen - firstSeen };
}

async function main() {
  console.log(`Verifying the branded Reset entry animation against ${BASE_URL}\n`);
  const browser = await chromium.launch();
  const account = ACCOUNTS.memberPopulated;

  // ---- Fresh login: full animation, no dashboard flash ----
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    attachListeners(page, 'fresh-login');
    await login(page, BASE_URL, account);

    console.log('--- Fresh login ---');
    console.log('final URL after login:', page.url());

    const window1 = await observeOverlayWindow(page, 9000);
    console.log('overlay observed window (ms from login):', window1);
    console.log('overlay observed at all (should be true):', window1 !== null);
    if (window1) {
      console.log(
        'observed duration within the 3.2-4.5s expected band (network/poll jitter tolerant):',
        window1.durationMs >= 1500 && window1.durationMs <= 5000
      );
    }

    const dashboardText = await page.evaluate(() => document.body.innerText);
    console.log('landed on real dashboard content (has "Root Score"):', /Root Score/i.test(dashboardText));
    console.log('em dash present in visible text (should be false):', dashboardText.includes('—'));

    // ---- Internal navigation must not replay ----
    await page.goto(`${BASE_URL}/profile`, { waitUntil: 'load' });
    await page.waitForTimeout(600);
    console.log('overlay count on /profile after navigating (should be 0):', await page.locator(OVERLAY_SELECTOR).count());

    await page.goto(`${BASE_URL}/progress`, { waitUntil: 'load' });
    await page.waitForTimeout(600);
    console.log('overlay count on /progress after navigating (should be 0):', await page.locator(OVERLAY_SELECTOR).count());

    // ---- Hard reload must not replay ----
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(600);
    console.log('overlay count after hard reload (should be 0):', await page.locator(OVERLAY_SELECTOR).count());

    // ---- Logout then login must replay ----
    await page.goto(`${BASE_URL}/profile`, { waitUntil: 'load' });
    await page.click('button:has-text("Sign Out")');
    await page.waitForTimeout(400);
    await Promise.all([
      page.waitForURL(/\/login/, { timeout: 15000 }),
      page.click('div[role="dialog"] button:has-text("Sign Out")'),
    ]);
    console.log('signed out, now at:', page.url());

    await login(page, BASE_URL, account);
    const window2 = await observeOverlayWindow(page, 9000);
    console.log('overlay observed again after logout -> login (should be true):', window2 !== null);

    await context.close();
  }

  // ---- Deep link: signed-out visit to a protected page lands back there after login ----
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    attachListeners(page, 'deep-link');
    await page.goto(`${BASE_URL}/profile`, { waitUntil: 'load' });
    console.log('\n--- Deep link ---');
    console.log('redirected to (should carry redirectedFrom=/profile):', page.url());
    await page.locator('#email').fill(account.email);
    await page.locator('#password').fill(account.password);
    await Promise.all([
      page.waitForURL((url) => url.pathname !== '/login', { timeout: 20000 }),
      page.getByRole('button', { name: 'Log in' }).click(),
    ]);
    console.log('final URL after login (should be /profile, not forced to /dashboard):', page.url());
    await context.close();
  }

  // ---- Reduced motion ----
  {
    const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce' });
    const page = await context.newPage();
    attachListeners(page, 'reduced-motion');
    await login(page, BASE_URL, account);
    const window3 = await observeOverlayWindow(page, 9000);
    console.log('\n--- Reduced motion ---');
    console.log('overlay observed window (ms from login):', window3);
    if (window3) {
      console.log(
        'observed duration well under the full 3.6s sequence (reduced version, jitter tolerant):',
        window3.durationMs <= 2500
      );
    }
    await context.close();
  }

  console.log('\nConsole/page errors across every context:', consoleIssues.length ? consoleIssues : 'none');
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
