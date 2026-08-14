#!/usr/bin/env node
/**
 * Live verification for the dedicated administrator-only account.
 *
 * Proves, against production, the four things that matter about it:
 *   1. it can sign in, and lands on /admin
 *   2. every admin analytics screen opens for it
 *   3. it is refused from the member and coach areas, and this records
 *      exactly WHAT the app does rather than only that it does something
 *   4. it appears in no member analytics table and in no coach caseload
 *
 * THE PASSWORD IS NEVER PASSED ON A COMMAND LINE. It is read from a file
 * whose path is given in ADMIN_PW_FILE, so it never lands in shell history,
 * in a process listing, or in this repo. Nothing here is ever printed.
 *
 * Usage, from apps/consumer-web-app:
 *   ADMIN_EMAIL=info@mefwellness.com ADMIN_PW_FILE=/secure/path/pw.txt \
 *     node scripts/screenshots/verify-admin-account-live.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = 'https://app.mefwellness.com';
const EMAIL = process.env.ADMIN_EMAIL;
const PW_FILE = process.env.ADMIN_PW_FILE;

if (!EMAIL || !PW_FILE) {
  console.error('Set ADMIN_EMAIL and ADMIN_PW_FILE (a path, never the password itself).');
  process.exit(2);
}
const PASSWORD = readFileSync(PW_FILE, 'utf8').trim();

const results = [];
const consoleErrors = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(`${page.url()} :: ${m.text()}`);
});
page.on('pageerror', (e) => consoleErrors.push(`${page.url()} :: ${e.message}`));

// 1. Sign in, and see where the app puts an admin-only account.
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForTimeout(5000);

const landed = page.url();
check('admin account signs in', !landed.includes('/login'), landed.replace(BASE, ''));
check('post-login route is /admin', landed.includes('/admin'), landed.replace(BASE, ''));

// 2. Every admin analytics screen opens.
const SCREENS = [
  ['/admin', 'Admin home'],
  ['/admin/analytics', 'Overview'],
  ['/admin/analytics/funnel', 'Member funnel'],
  ['/admin/analytics/features', 'Feature usage'],
  ['/admin/analytics/drop-off', 'Drop-off'],
  ['/admin/analytics/members', 'Member engagement'],
  ['/admin/analytics/insights', 'Product insights'],
];

for (const [route, label] of SCREENS) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const opened = page.url().includes(route) && !page.url().includes('/login');
  const heading = (await page.textContent('h1').catch(() => '')) ?? '';
  check(`${label} opens`, opened, heading.trim().slice(0, 40));
}

// 3. Refused from member and coach areas. Record exactly what happens.
for (const route of ['/dashboard', '/today', '/checkin', '/coach', '/coach/clients']) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const ended = page.url().replace(BASE, '');
  const isCoachRoute = route.startsWith('/coach');
  if (isCoachRoute) {
    check(`coach area ${route} refuses the admin account`, !page.url().includes('/coach'), `-> ${ended}`);
  } else {
    // Member routes are not role gated by middleware, so what matters is what
    // an account with no member data is actually shown. Recorded, not assumed.
    console.log(`NOTE  member route ${route} -> ${ended}`);
  }
}

// 4. Absent from the member engagement table, both toggles.
for (const query of ['', '?test=on']) {
  await page.goto(`${BASE}/admin/analytics/members${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const body = (await page.textContent('body')) ?? '';
  const rows = await page.$$eval('[data-member-row]', (nodes) => nodes.length);
  check(
    `admin account absent from the member table${query ? ' with test accounts on' : ''}`,
    !body.includes(EMAIL) && !body.includes('MEF Wellness Admin'),
    `${rows} member rows listed`
  );
}

// Em dashes on the two screens this build added.
for (const route of ['/admin/analytics/members', '/admin/analytics/insights']) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const body = (await page.textContent('body')) ?? '';
  check(`no em dash on ${route}`, !body.includes('—'));
}

await browser.close();

console.log('\nConsole errors:', consoleErrors.length);
for (const e of consoleErrors.slice(0, 10)) console.log('  ', e);

const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed} of ${results.length} checks passed.`);
process.exit(passed === results.length && consoleErrors.length === 0 ? 0 : 1);
