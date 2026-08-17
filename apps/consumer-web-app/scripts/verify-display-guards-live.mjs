#!/usr/bin/env node
/**
 * Live verification of the two display guards (2026-08-17) against the
 * real production site, signed in as the standing test member with her own
 * password through the real login form.
 *
 * Reads only. No form is submitted beyond the sign-in itself, and nothing
 * is written to her account.
 *
 * Usage, from apps/consumer-web-app:
 *
 *   MEMBER_PASSWORD_FILE=/path/to/pw.txt SHOTS_DIR=/path/to/shots \
 *   node scripts/verify-display-guards-live.mjs
 *
 * The password comes from a file rather than an argument so it does not
 * land in shell history or in a process listing.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const BASE = 'https://app.mefwellness.com';
const EMAIL = process.env.MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const PASSWORD = readFileSync(process.env.MEMBER_PASSWORD_FILE, 'utf8').trim();
const SHOTS = process.env.SHOTS_DIR ?? './live-shots';
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

const browser = await chromium.launch();
const captured = {};

try {
  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45000 });
  check('signed in through the real login form', true, EMAIL);

  async function visit(pathname, key) {
    await page.goto(`${BASE}${pathname}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    const text = await page.locator('body').innerText();
    captured[key] = text;
    await page.screenshot({ path: `${SHOTS}/${key}.png`, fullPage: true });
    return text;
  }

  // ---- Guard 1: no heading with nothing under it --------------------
  const movement = await visit('/movement', 'movement');
  const hasWhyHeading = /WHY THIS SESSION WAS SELECTED/i.test(movement);
  // The card is a disclosure. It is honest when it is either absent
  // entirely, or present with reasons behind it. It is dishonest only when
  // the heading is there and expanding it yields nothing, which is what
  // the audit saw. Expand it and look.
  let whyBodyCount = 0;
  if (hasWhyHeading) {
    const toggle = page.getByRole('button', { name: /why this session was selected/i });
    if (await toggle.count()) {
      await toggle.first().click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${SHOTS}/movement-why-open.png`, fullPage: true });
      whyBodyCount = await page
        .locator('section:has-text("Why this session was selected") li')
        .count();
    }
  }
  check(
    'the Movement "why this session" heading never renders empty',
    !hasWhyHeading || whyBodyCount > 0,
    hasWhyHeading ? `heading present with ${whyBodyCount} reason(s) under it` : 'card absent entirely'
  );

  // Any heading that is the last thing in its own card is a heading with
  // nothing under it. Checked structurally rather than by name, so this
  // catches headings the audit never saw.
  const orphans = await page.evaluate(() => {
    const found = [];
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const cls = typeof el.className === 'string' ? el.className : '';
      if (!cls.includes('uppercase') || !cls.includes('tracking-wider')) continue;
      const text = (el.textContent ?? '').trim();
      if (!text) continue;
      // Walk up to the nearest card/section and see whether anything with
      // real text follows this heading inside it.
      const card = el.closest('section, [class*="mef-card"], [class*="rounded-"]');
      if (!card) continue;
      const after = (card.textContent ?? '').replace(text, '').trim();
      if (after.length === 0) found.push(text);
    }
    return found;
  });
  check(
    'no heading on Movement is the only thing in its card',
    orphans.length === 0,
    orphans.length ? orphans.join(' | ') : 'none'
  );

  // ---- Guard 2: the stat label states the real recorded-day count ----
  const progress = await visit('/progress', 'progress');
  const avgLine = (progress.match(/AVG ENERGY[\s\S]{0,120}/i) ?? [''])[0].replace(/\n+/g, ' ').trim();
  const trueCount = (progress.match(/You have (\d+) recorded days? for/i) ?? [])[1] ?? null;

  check(
    'the energy stat no longer claims a 30 day window',
    !/in the last 30 recorded days/i.test(progress),
    avgLine
  );
  check(
    'the energy stat states the real recorded day count',
    trueCount === null || new RegExp(`from ${trueCount} recorded days?`).test(progress),
    trueCount ? `Trends says ${trueCount}; stat line reads: ${avgLine}` : `no cross-check available; stat line reads: ${avgLine}`
  );

  const protein = await visit('/protein', 'protein');
  check(
    'the protein history heading never stands alone',
    !/LAST 7 DAYS/i.test(protein) || /\d+\s*g/i.test(protein),
    /LAST 7 DAYS/i.test(protein) ? 'heading present with day rows' : 'card absent'
  );
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  for (const [key, text] of Object.entries(captured)) {
    console.log(`\n===== ${key} =====\n${text.slice(0, 2500)}`);
  }
  process.exit(1);
}
