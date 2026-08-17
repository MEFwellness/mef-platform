#!/usr/bin/env node
/**
 * Live check, member half only: signs in to app.mefwellness.com as the
 * production test member with the password the operator supplied, and
 * verifies that the Exercise Library and the Movement Profile are gone
 * from the Movement screen and blocked at their own URLs.
 *
 * Reads and navigates only. Writes nothing, and needs no service role key.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'https://app.mefwellness.com';
const EMAIL = process.env.MEMBER_EMAIL;
const PASSWORD = process.env.MEMBER_PASSWORD;
const SHOTS = process.env.SHOTS_DIR ?? './live-shots';
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
  check('member signs in', true, page.url());
  await page.screenshot({ path: `${SHOTS}/m01-home.png`, fullPage: true });

  await page.goto(`${BASE}/movement`, { waitUntil: 'networkidle' });
  const movement = await page.locator('body').innerText();
  await page.screenshot({ path: `${SHOTS}/m02-movement.png`, fullPage: true });
  console.log('--- /movement text ---');
  console.log(movement.replace(/\n{2,}/g, '\n').slice(0, 900));
  console.log('--- end ---');
  check('no Exercise Library on the Movement screen', !/Exercise Library/i.test(movement));
  check('no Movement Profile on the Movement screen', !/Movement Profile/i.test(movement));

  for (const [path, label] of [
    ['/exercises', 'Exercise Library'],
    ['/movement/profile', 'Movement Profile'],
    ['/exercises/some-id', 'an exercise detail page'],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    const landed = new URL(page.url()).pathname;
    await page.screenshot({
      path: `${SHOTS}/m03${path.replace(/\W+/g, '-')}.png`,
      fullPage: true,
    });
    check(`member is blocked from ${label} (${path})`, landed !== path, `landed on ${landed}`);
  }
} finally {
  await browser.close();
  console.log('\n---- SUMMARY ----');
  for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.name}`);
  const failed = results.filter((r) => !r.passed).length;
  console.log(`${results.length - failed}/${results.length} checks passed`);
  process.exitCode = failed ? 1 : 0;
}
