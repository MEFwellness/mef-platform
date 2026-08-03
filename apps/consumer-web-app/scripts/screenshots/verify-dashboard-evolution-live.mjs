#!/usr/bin/env node
// Live verification for Dashboard Evolution (Prompt 5) against production,
// across the production test accounts (docs/PRODUCTION_TEST_ACCOUNTS.md).
// Mirrors login()/config.mjs the same way verify-root-presence-live.mjs
// and verify-hydration-fix-live.mjs do.
//
// Usage: SCREENSHOT_TARGET=live node scripts/screenshots/verify-dashboard-evolution-live.mjs
import { chromium } from 'playwright';
import { ACCOUNTS, BASE_URL } from './config.mjs';
import { login } from './lib.mjs';

const consoleIssues = [];

function attachListeners(page, label) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleIssues.push({ label, type: 'console.error', text: msg.text(), url: page.url() });
  });
  page.on('pageerror', (err) => consoleIssues.push({ label, type: 'pageerror', text: err.message, url: page.url() }));
}

function ci(haystack, needle) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

const belowThresholdAccount = {
  email: process.env.MEMBER_BELOW_THRESHOLD_EMAIL,
  password: process.env.MEMBER_BELOW_THRESHOLD_PASSWORD,
};

async function main() {
  console.log(`Verifying Dashboard Evolution against ${BASE_URL}\n`);
  console.log(`Real wall-clock time right now: ${new Date().toString()}\n`);
  const browser = await chromium.launch();

  // ---- memberPopulated: fully-active member ----
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    attachListeners(page, 'memberPopulated');
    await login(page, BASE_URL, ACCOUNTS.memberPopulated);
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'load' });
    await page.waitForTimeout(1000);
    const text = await page.evaluate(() => document.body.innerText);

    console.log('--- memberPopulated dashboard ---');
    console.log('Greeting word present, one of Good morning/afternoon/evening:',
      ['Good morning', 'Good afternoon', 'Good evening'].find((w) => ci(text, w)) ?? 'NONE FOUND');
    console.log('em dash present (should be false):', text.includes('—'));

    const hasGradientDrift = await page.evaluate(() => !!document.querySelector('.mef-gradient-drift'));
    console.log('ambient gradient-drift element present:', hasGradientDrift);
    const driftAnimationName = await page.evaluate(() => {
      const el = document.querySelector('.mef-gradient-drift');
      return el ? getComputedStyle(el).animationName : null;
    });
    console.log('ambient gradient-drift animation-name (normal motion):', driftAnimationName);

    const hasRootScoreBreathe = await page.evaluate(() => !!document.querySelector('.mef-root-score-breathe'));
    console.log('Root Score breathing element present (only true once a real score exists):', hasRootScoreBreathe);
    console.log('"/100" present (Root Score rendered):', ci(text, '/100'));

    console.log('discovery card present (real finding, or none if already surfaced):', ci(text, 'Root noticed something'));
    console.log('memory callback text present (tenure/day-3/finding, one of these three):',
      ci(text, 'checking in with me') || ci(text, 'on day 3 of your') || ci(text, 'i noticed something that still holds'));

    await context.close();
  }

  // ---- memberBelowThreshold: just-started member ----
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    attachListeners(page, 'memberBelowThreshold');
    await login(page, BASE_URL, belowThresholdAccount);
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'load' });
    await page.waitForTimeout(1000);
    const text = await page.evaluate(() => document.body.innerText);
    console.log('\n--- memberBelowThreshold dashboard ---');
    console.log('Greeting word present:', ['Good morning', 'Good afternoon', 'Good evening'].find((w) => ci(text, w)) ?? 'NONE FOUND');
    console.log('discovery card present (should be false, insufficient data):', ci(text, 'Root noticed something'));
    await context.close();
  }

  // ---- memberEmpty: brand-new member, the honest early-days dashboard ----
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    attachListeners(page, 'memberEmpty');
    await login(page, BASE_URL, ACCOUNTS.memberEmpty);
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'load' });
    await page.waitForTimeout(1000);
    const text = await page.evaluate(() => document.body.innerText);
    console.log('\n--- memberEmpty dashboard (brand-new, nothing fabricated) ---');
    console.log('Greeting word present:', ['Good morning', 'Good afternoon', 'Good evening'].find((w) => ci(text, w)) ?? 'NONE FOUND');
    console.log('discovery card present (must be false):', ci(text, 'Root noticed something'));
    console.log('memory callback present (must be false, zero check-ins):',
      ci(text, 'checking in with me') || ci(text, 'on day 3 of your') || ci(text, 'i noticed something that still holds'));
    console.log('"/100" present (must be false, no score yet):', ci(text, '/100'));
    await context.close();
  }

  // ---- Reduced motion: confirm a completely still page ----
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    attachListeners(page, 'reduced-motion');
    await login(page, BASE_URL, ACCOUNTS.memberPopulated);
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'load' });
    await page.waitForTimeout(1000);
    const driftAnimationName = await page.evaluate(() => {
      const el = document.querySelector('.mef-gradient-drift');
      return el ? getComputedStyle(el).animationName : 'ELEMENT_NOT_RENDERED';
    });
    const breatheAnimationName = await page.evaluate(() => {
      const el = document.querySelector('.mef-root-score-breathe');
      return el ? getComputedStyle(el).animationName : 'ELEMENT_NOT_RENDERED_OR_NO_SCORE';
    });
    console.log('\n--- reduced motion: memberPopulated dashboard ---');
    console.log('gradient-drift under reduced motion (expect ELEMENT_NOT_RENDERED or "none"):', driftAnimationName);
    console.log('root-score-breathe under reduced motion (expect ELEMENT_NOT_RENDERED_OR_NO_SCORE or "none"):', breatheAnimationName);
    await context.close();
  }

  // ---- Tool speed check: dashboard load time itself ----
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    attachListeners(page, 'load-time-check');
    await login(page, BASE_URL, ACCOUNTS.memberPopulated);
    const t0 = Date.now();
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'load' });
    console.log(`\n/dashboard time-to-load (post-login, production): ${Date.now() - t0}ms`);
    await context.close();
  }

  console.log(`\n================ ALL CONSOLE / PAGE ERRORS THIS RUN ================`);
  if (consoleIssues.length === 0) {
    console.log('  none');
  } else {
    for (const c of consoleIssues) console.log(`  [${c.label}] ${c.type} @ ${c.url}: ${c.text}`);
  }

  await browser.close();
  process.exit(consoleIssues.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
