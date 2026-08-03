#!/usr/bin/env node
// Live verification for the Root Presence System (Prompt 4) against
// production, across the three seeded member states in
// docs/PRODUCTION_TEST_ACCOUNTS.md. Mirrors login()/config.mjs the same
// way verify-hydration-fix-live.mjs does.
//
// Usage: SCREENSHOT_TARGET=live node scripts/screenshots/verify-root-presence-live.mjs
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

async function checkPage(page, label, url) {
  const before = consoleIssues.length;
  await page.goto(`${BASE_URL}${url}`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  const text = await page.evaluate(() => document.body.innerText);
  const newIssues = consoleIssues.slice(before);
  const hasEmDash = text.includes('—');
  console.log(`\n--- ${label} (${url}) ---`);
  console.log('console/page errors:', newIssues.length ? JSON.stringify(newIssues.map((i) => i.text)) : 'none');
  console.log('em dash present:', hasEmDash);
  return text;
}

async function main() {
  console.log(`Verifying Root Presence System against ${BASE_URL}\n`);
  const browser = await chromium.launch();

  // ---- memberPopulated: fully-active member ----
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    attachListeners(page, 'memberPopulated');
    await login(page, BASE_URL, ACCOUNTS.memberPopulated);
    const dash = await checkPage(page, 'memberPopulated dashboard', '/dashboard');
    console.log('return greeting present:', ci(dash, "I'm glad you're back"));
    console.log('discovery card present:', ci(dash, 'Root noticed something'));
    console.log('tenure/memory-callback phrasing present:', ci(dash, 'checking in with me'));
    const caseText = await checkPage(page, 'memberPopulated case view', '/case');
    console.log('case-view first-person voice present:', ci(caseText, "what I'm investigating"));
    console.log('case-view memory callback present:', ci(caseText, "you've been checking") || ci(caseText, "you've logged"));
    await context.close();
  }

  // ---- memberBelowThreshold: just-started member ----
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    attachListeners(page, 'memberBelowThreshold');
    await login(page, BASE_URL, {
      email: process.env.MEMBER_BELOW_THRESHOLD_EMAIL,
      password: process.env.MEMBER_BELOW_THRESHOLD_PASSWORD,
    });
    const dash = await checkPage(page, 'memberBelowThreshold dashboard', '/dashboard');
    console.log('return greeting present (should be false unless a real gap exists):', ci(dash, "I'm glad you're back"));
    console.log('discovery card present (should be false, not enough data for tier>=2):', ci(dash, 'Root noticed something'));
    await checkPage(page, 'memberBelowThreshold case view', '/case');
    await context.close();
  }

  // ---- memberEmpty: brand-new member ----
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    attachListeners(page, 'memberEmpty');
    await login(page, BASE_URL, ACCOUNTS.memberEmpty);
    const dash = await checkPage(page, 'memberEmpty dashboard', '/dashboard');
    console.log('return greeting present (must be false):', ci(dash, "I'm glad you're back"));
    console.log('discovery card present (must be false):', ci(dash, 'Root noticed something'));
    console.log('memory callback present (must be false):', ci(dash, 'checking in with me'));
    await checkPage(page, 'memberEmpty case view', '/case');
    await context.close();
  }

  // ---- Tool screens keep their speed: spot-check a couple of Tool loading transitions ----
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    attachListeners(page, 'tool-speed-check');
    await login(page, BASE_URL, ACCOUNTS.memberPopulated);
    const t0 = Date.now();
    await page.goto(`${BASE_URL}/checkin`, { waitUntil: 'load' });
    console.log(`\n/checkin (Tool) time-to-load: ${Date.now() - t0}ms`);
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
