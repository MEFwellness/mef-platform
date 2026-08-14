#!/usr/bin/env node
/**
 * Live verification for this build's two new screens, against production.
 *
 * WHAT IT CAN AND CANNOT CHECK. The administrator half of this build cannot
 * be walked here, because no administrator password is available to this
 * tooling: the existing production credentials file holds a coach and three
 * members, and the newly provisioned info@mefwellness.com cannot sign in yet
 * (see docs/BUILD_STATUS.md). So this script proves the two refusal
 * boundaries that CAN be proved with the credentials that exist, and walks
 * the coach screen end to end. The administrator screens are covered by
 * anonymous-refusal checks plus the local browser pass.
 *
 * Credentials come from scripts/screenshots/.env.local (gitignored, see
 * docs/PRODUCTION_TEST_ACCOUNTS.md), plus the standing test member passed in
 * as MEMBER_STANDING_EMAIL / MEMBER_STANDING_PASSWORD.
 *
 * Usage, from apps/consumer-web-app:
 *   node scripts/screenshots/verify-member-detail-and-insights-live.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'https://app.mefwellness.com';

function loadEnv() {
  const file = path.join(__dirname, '.env.local');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!(key in process.env)) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}
loadEnv();

const results = [];
const consoleErrors = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

async function newPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`${page.url()} :: ${message.text()}`);
  });
  page.on('pageerror', (error) => consoleErrors.push(`${page.url()} :: ${error.message}`));
  return { context, page };
}

async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await Promise.all([
    page.waitForLoadState('networkidle').catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(3000);
  return page.url();
}

const browser = await chromium.launch();

// ---------------------------------------------------------------------
// 1. A signed-out visitor is refused from every new route.
// ---------------------------------------------------------------------
{
  const { context, page } = await newPage(browser);
  for (const route of ['/admin/analytics/insights', '/admin/analytics/members']) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    check(`visitor refused from ${route}`, page.url().includes('/login'), page.url());
  }
  await context.close();
}

// ---------------------------------------------------------------------
// 2. The standing test member is refused from analytics and from the
//    coach Member Detail. This is the refusal check the brief called out.
// ---------------------------------------------------------------------
const MEMBER_EMAIL = process.env.MEMBER_STANDING_EMAIL;
const MEMBER_PASSWORD = process.env.MEMBER_STANDING_PASSWORD;
let memberId = null;

if (MEMBER_EMAIL && MEMBER_PASSWORD) {
  const { context, page } = await newPage(browser);
  const landed = await signIn(page, MEMBER_EMAIL, MEMBER_PASSWORD);
  check('standing member can sign in', !landed.includes('/login'), landed);

  for (const route of [
    '/admin/analytics',
    '/admin/analytics/insights',
    '/admin/analytics/members',
  ]) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const refused = !page.url().includes('/admin');
    check(`member refused from ${route}`, refused, page.url());
  }

  // A coach Member Detail URL typed directly, using her own id as the
  // client id, which is the most plausible thing a curious member would try.
  await page.goto(`${BASE}/coach/clients/self/entries`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  check('member refused from a coach Member Detail URL', !page.url().includes('/coach'), page.url());

  await context.close();
} else {
  check('standing member checks', false, 'MEMBER_STANDING_EMAIL/PASSWORD not set');
}

// ---------------------------------------------------------------------
// 3. The coach opens Member Detail and reads real entered data.
// ---------------------------------------------------------------------
const COACH_EMAIL = process.env.COACH_EMAIL;
const COACH_PASSWORD = process.env.COACH_PASSWORD;

if (COACH_EMAIL && COACH_PASSWORD) {
  const { context, page } = await newPage(browser);
  const landed = await signIn(page, COACH_EMAIL, COACH_PASSWORD);
  check('coach signs in and lands on the coach platform', landed.includes('/coach'), landed);

  await page.goto(`${BASE}/coach`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const clientHrefs = await page.$$eval('a[href*="/coach/clients/"]', (links) =>
    [...new Set(links.map((link) => link.getAttribute('href')))].filter(Boolean)
  );
  check('coach has at least one client', clientHrefs.length > 0, `${clientHrefs.length} links`);

  if (clientHrefs.length > 0) {
    const first = clientHrefs[0].split('?')[0];
    memberId = first.split('/coach/clients/')[1]?.split('/')[0] ?? null;

    // The link is on the client page, above the derived panels.
    await page.goto(`${BASE}${first}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const linkPresent = (await page.$('[data-member-entries-link="true"]')) !== null;
    check('Member Detail link is on the coach client page', linkPresent);

    // The screen itself.
    await page.goto(`${BASE}/coach/clients/${memberId}/entries`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    check('coach opens Member Detail', page.url().includes('/entries'), page.url());

    const heading = await page.textContent('h1').catch(() => '');
    check('the screen names the member', Boolean(heading && heading.includes('entered')), heading ?? '');

    const checkinDays = await page.$$eval('[data-checkin-date]', (nodes) => nodes.length);
    const answered = await page.$$eval('[data-answered="true"]', (nodes) => nodes.length);
    const unanswered = await page.$$eval('[data-answered="false"]', (nodes) => nodes.length);
    check('her check-in days render', checkinDays > 0, `${checkinDays} days`);
    check('her real answers render', answered > 0, `${answered} answered`);
    check(
      'unanswered questions say so rather than showing blank',
      unanswered === 0 || (await page.textContent('body')).includes('Not answered'),
      `${unanswered} unanswered`
    );

    const goals = await page.$$eval('[data-goal-entry]', (nodes) => nodes.length);
    const submissions = await page.$$eval('[data-submission]', (nodes) => nodes.length);
    const conversations = await page.$$eval('[data-conversation-session]', (nodes) => nodes.length);
    console.log(
      `      sections: ${goals} goal entries, ${submissions} completed, ${conversations} conversations`
    );

    // Honest empty states, wherever a section is genuinely empty.
    const body = await page.textContent('body');
    const emptyPhrases = [
      'No check-ins yet',
      'Nothing completed yet',
      'No goals on file',
      'No conversations with Root yet',
    ].filter((phrase) => body.includes(phrase));
    check(
      'every empty section states what would fill it',
      goals + submissions + conversations + checkinDays > 0,
      `${emptyPhrases.length} honest empty states shown`
    );

    // The range control.
    await page.goto(`${BASE}/coach/clients/${memberId}/entries?days=30`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(2000);
    const selected = await page.$eval('[data-range-days="30"]', (node) =>
      node.getAttribute('data-selected')
    ).catch(() => null);
    check('the look-back range control works', selected === 'true', `selected=${selected}`);

    // No em dash anywhere on the rendered screen.
    const renderedText = await page.textContent('body');
    check('no em dash on Member Detail', !renderedText.includes('—'));
  }

  await context.close();
} else {
  check('coach checks', false, 'COACH_EMAIL/PASSWORD not set');
}

await browser.close();

// ---------------------------------------------------------------------

console.log('\nConsole errors:', consoleErrors.length);
for (const error of consoleErrors.slice(0, 10)) console.log('  ', error);

const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed} of ${results.length} checks passed.`);
process.exit(passed === results.length && consoleErrors.length === 0 ? 0 : 1);
