/**
 * Drives the two Admin Analytics member screens in a real browser.
 *
 * Read only. It signs in, navigates, reads what rendered, and screenshots.
 * It writes nothing, so it is safe to run against production at any time.
 *
 * Usage:
 *   node scripts/verify-admin-analytics-members.mjs
 *   BASE_URL=https://app.mefwellness.com ADMIN_EMAIL=... ADMIN_PASSWORD=... \
 *     SKIP_MEMBER=1 SKIP_COACH=1 node scripts/verify-admin-analytics-members.mjs
 *
 * The member and coach refusal passes are skipped explicitly, and printed as
 * skips, when no credentials for those roles exist on the target. A skip is
 * never silently omitted: an unrun check and a passing check must not look
 * the same.
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = process.env.SHOT_DIR ?? '/tmp/admin-analytics-member-shots';

const ADMIN = {
  email: process.env.ADMIN_EMAIL ?? 'admin.one@example.test',
  password: process.env.ADMIN_PASSWORD ?? 'DevPassword123!',
};
const MEMBER = {
  email: process.env.MEMBER_EMAIL ?? 'member.one@example.test',
  password: process.env.MEMBER_PASSWORD ?? 'DevPassword123!',
};
const COACH = {
  email: process.env.COACH_EMAIL ?? 'coach.one@example.test',
  password: process.env.COACH_PASSWORD ?? 'DevPassword123!',
};

const SKIP_MEMBER = process.env.SKIP_MEMBER === '1';
const SKIP_COACH = process.env.SKIP_COACH === '1';

const TABLE = '/admin/analytics/members';
/** A well-formed id that is nobody, so the detail route can be attacked by URL without knowing a real member. */
const DECOY = '00000000-0000-0000-0000-000000000000';

/**
 * Field names that could only have come from health content. None of them
 * may appear in the rendered HTML of either screen. A feature name is not
 * health content; an answer is.
 */
const FORBIDDEN = [
  'painLocation',
  'pain_location',
  'sleepQuality',
  'sleep_quality',
  'energyLevel',
  'energy_level',
  'stressLevel',
  'stress_level',
  'concern_flagged',
  'morning_readiness_recorded',
  'evening_reflection_recorded',
  'hydration_logged',
  'movement_logged',
  'readinessScore',
  'rootScore',
];

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

async function login(page, { email, password }) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'load' });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 20000 });
}

async function refused(page, route, expectedPath) {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  const landed = new URL(page.url()).pathname;
  const ok = landed !== route && landed.startsWith(expectedPath);
  return { ok, landed };
}

async function scanForHealthContent(page, label) {
  const html = await page.content();
  const found = FORBIDDEN.filter((token) => html.includes(token));
  record(`${label}: no health field name in the rendered page`, found.length === 0, found.join(', '));
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  // --------------------------------------------------------------
  // A signed-out visitor
  // --------------------------------------------------------------
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    for (const route of [TABLE, `${TABLE}/${DECOY}`]) {
      const { ok, landed } = await refused(page, route, '/login');
      record(`visitor refused ${route}`, ok, `landed on ${landed}`);
    }
    await context.close();
  }

  // --------------------------------------------------------------
  // A signed-in member
  // --------------------------------------------------------------
  if (SKIP_MEMBER) {
    console.log('SKIP  member pass (SKIP_MEMBER=1, no member credentials for this target)');
  } else {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await login(page, MEMBER);
    for (const route of [TABLE, `${TABLE}/${DECOY}`]) {
      const { ok, landed } = await refused(page, route, '/dashboard');
      record(`member refused ${route}`, ok, `landed on ${landed}`);
    }
    await context.close();
  }

  // --------------------------------------------------------------
  // A signed-in coach
  // --------------------------------------------------------------
  if (SKIP_COACH) {
    console.log('SKIP  coach pass (SKIP_COACH=1, no coach credentials for this target)');
  } else {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    try {
      await login(page, COACH);
      for (const route of [TABLE, `${TABLE}/${DECOY}`]) {
        const { ok, landed } = await refused(page, route, '/dashboard');
        record(`coach refused ${route}`, ok, `landed on ${landed}`);
      }
    } catch (error) {
      record('coach sign-in', false, error.message);
    }
    await context.close();
  }

  // --------------------------------------------------------------
  // The administrator
  // --------------------------------------------------------------
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
    const page = await context.newPage();
    await login(page, ADMIN);

    // The table, real members only.
    await page.goto(`${BASE_URL}${TABLE}?range=90d`, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const realRows = await page.$$eval('[data-member-row]', (nodes) =>
      nodes.map((n) => ({
        id: n.getAttribute('data-member-row'),
        state: n.getAttribute('data-member-state'),
      }))
    );
    record(`table renders with test accounts off`, new URL(page.url()).pathname === TABLE,
      `${realRows.length} rows`);
    console.log(`ROWS  test accounts off: ${realRows.map((r) => `${r.state}`).join(', ') || '(none)'}`);
    await scanForHealthContent(page, 'members table');
    await page.screenshot({ path: path.join(OUT, 'members-table.png'), fullPage: true });

    // Ordering: Inactive, then Watch, then Active, then New.
    const ORDER = ['INACTIVE', 'WATCH', 'ACTIVE', 'NEW'];
    let ranked = true;
    let last = -1;
    for (const row of realRows) {
      const rank = ORDER.indexOf(row.state);
      if (rank < last) ranked = false;
      last = rank;
    }
    record('table is sorted most in need of attention first', ranked,
      realRows.map((r) => r.state).join(' > '));

    // The toggle.
    await page.goto(`${BASE_URL}${TABLE}?range=90d&test=on`, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const withTest = await page.$$eval('[data-member-row]', (nodes) =>
      nodes.map((n) => n.getAttribute('data-member-row'))
    );
    const banner = await page.locator('[data-test-accounts-banner="on"]').count();
    record(
      'test-account toggle adds accounts and shows the banner',
      banner === 1 && withTest.length > realRows.length,
      `${realRows.length} real, ${withTest.length} with test accounts on`
    );
    await page.screenshot({ path: path.join(OUT, 'members-table-test-on.png'), fullPage: true });

    // And back off again.
    await page.goto(`${BASE_URL}${TABLE}?range=90d`, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    const backOff = await page.locator('[data-member-row]').count();
    record('toggling test accounts back off restores the real list', backOff === realRows.length,
      `${backOff} rows`);

    // The filters.
    for (const state of ORDER) {
      await page.goto(`${BASE_URL}${TABLE}?range=90d&state=${state}`, { waitUntil: 'load' });
      await page.waitForTimeout(300);
      const shown = await page.$$eval('[data-member-state]', (nodes) =>
        nodes.map((n) => n.getAttribute('data-member-state'))
      );
      const selected = await page.locator(`[data-state-filter="${state}"][data-selected="true"]`).count();
      const empty = await page.locator('[data-empty-state="true"]').count();
      const clean = shown.every((s) => s === state);
      record(
        `filter ${state} shows only that state`,
        selected === 1 && clean && (shown.length > 0 || empty > 0),
        shown.length === 0 ? 'empty state shown' : `${shown.length} rows`
      );
    }

    // A member detail for every real member, up to four.
    const ids = (withTest.length > 0 ? withTest : realRows.map((r) => r.id)).slice(0, 4);
    if (ids.length === 0) console.log('SKIP  member detail pass: no members in scope on this target');

    for (const id of ids) {
      const route = `${TABLE}/${id}`;
      await page.goto(`${BASE_URL}${route}?range=90d&test=on`, { waitUntil: 'load' });
      await page.waitForTimeout(600);
      const landed = new URL(page.url()).pathname;

      const signals = await page.$$eval('[data-signal]', (nodes) =>
        nodes.map((n) => n.getAttribute('data-signal'))
      );
      const emptyStates = await page.locator('[data-empty-state="true"]').count();
      const timelineDays = await page.locator('[data-timeline-day]').count();
      const comparisonRows = await page.locator('[data-comparison-metric]').count();
      const state = await page.$eval('[data-engagement-state]', (n) =>
        n.getAttribute('data-engagement-state')
      ).catch(() => null);
      const basis = await page.$eval('[data-engagement-basis]', (n) =>
        n.getAttribute('data-engagement-basis')
      ).catch(() => null);

      record(
        `member detail ${id.slice(0, 8)} renders`,
        landed === route && state !== null && basis !== null && comparisonRows > 0,
        `state ${state}, basis ${basis}, ${signals.length} signals, ${timelineDays} timeline days, ${comparisonRows} comparison rows, ${emptyStates} empty states`
      );
      console.log(`SIGNALS  ${id.slice(0, 8)}: ${signals.join(', ') || '(none)'}`);
      await scanForHealthContent(page, `member detail ${id.slice(0, 8)}`);
      await page.screenshot({
        path: path.join(OUT, `member-${id.slice(0, 8)}.png`),
        fullPage: true,
      });

      // The before/after controls really re-run the query.
      await page.goto(`${BASE_URL}${route}?range=90d&test=on&ref=2026-07-01&window=7`, {
        waitUntil: 'load',
      });
      await page.waitForTimeout(500);
      const refShown = await page.locator('#comparison-ref').inputValue().catch(() => '');
      record(
        `member detail ${id.slice(0, 8)} before/after honors the chosen date`,
        refShown === '2026-07-01',
        `reference date input reads ${refShown || '(none)'}`
      );
    }

    // An id that is nobody.
    await page.goto(`${BASE_URL}${TABLE}/${DECOY}?range=90d`, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const decoyEmpty = await page.locator('[data-empty-state="true"]').count();
    record('an id that is nobody says so rather than inventing a member', decoyEmpty > 0,
      `${decoyEmpty} empty states`);
    await page.screenshot({ path: path.join(OUT, 'member-not-in-scope.png'), fullPage: true });

    // An id that is not even a uuid.
    await page.goto(`${BASE_URL}${TABLE}/not-a-uuid?range=90d`, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    const badEmpty = await page.locator('[data-empty-state="true"]').count();
    record('a malformed id is refused politely, not as a crash', badEmpty > 0);

    await context.close();
  }

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  console.log(`Screenshots in ${OUT}`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
