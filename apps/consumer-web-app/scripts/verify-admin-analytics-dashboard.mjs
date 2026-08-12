/**
 * Drives the four Admin Analytics dashboard screens in a real browser.
 *
 * Read only against the app: it signs in, navigates, and screenshots. The
 * only thing it writes is an optional local fixture of behavioral events
 * (behind --seed) so a populated view can be looked at, and it deletes
 * those rows again on the way out.
 *
 * Usage:
 *   node scripts/verify-admin-analytics-dashboard.mjs
 *   BASE_URL=https://app.mefwellness.com ADMIN_EMAIL=... ADMIN_PASSWORD=... \
 *   MEMBER_EMAIL=... MEMBER_PASSWORD=... node scripts/verify-admin-analytics-dashboard.mjs
 *
 * Against production, pass no --seed: nothing writes to a real database.
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = process.env.SHOT_DIR ?? '/tmp/admin-analytics-shots';

const ADMIN = {
  email: process.env.ADMIN_EMAIL ?? 'admin.one@example.test',
  password: process.env.ADMIN_PASSWORD ?? 'DevPassword123!',
};
const MEMBER = {
  email: process.env.MEMBER_EMAIL ?? 'member.one@example.test',
  password: process.env.MEMBER_PASSWORD ?? 'DevPassword123!',
};
const COACH = process.env.COACH_EMAIL
  ? { email: process.env.COACH_EMAIL, password: process.env.COACH_PASSWORD }
  : { email: 'coach.one@example.test', password: 'DevPassword123!' };

const ROUTES = [
  '/admin/analytics',
  '/admin/analytics/funnel',
  '/admin/analytics/features',
  '/admin/analytics/drop-off',
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

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  // --------------------------------------------------------------
  // A signed-out visitor
  // --------------------------------------------------------------
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    for (const route of ROUTES) {
      const { ok, landed } = await refused(page, route, '/login');
      record(`visitor refused ${route}`, ok, `landed on ${landed}`);
    }
    await context.close();
  }

  // --------------------------------------------------------------
  // A signed-in member
  // --------------------------------------------------------------
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await login(page, MEMBER);
    for (const route of ROUTES) {
      const { ok, landed } = await refused(page, route, '/dashboard');
      record(`member refused ${route}`, ok, `landed on ${landed}`);
    }
    await context.close();
  }

  // --------------------------------------------------------------
  // A signed-in coach
  // --------------------------------------------------------------
  if (COACH.email) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    try {
      await login(page, COACH);
      for (const route of ROUTES) {
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
    const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
    const page = await context.newPage();
    await login(page, ADMIN);

    for (const route of ROUTES) {
      const name = route.split('/').pop() || 'overview';
      for (const range of ['7d', '30d', '90d']) {
        await page.goto(`${BASE_URL}${route}?range=${range}`, { waitUntil: 'load' });
        await page.waitForTimeout(300);
        const landed = new URL(page.url()).pathname;
        const selected = await page
          .locator(`[data-range="${range}"][data-selected="true"]`)
          .count();
        record(
          `admin ${route} at ${range}`,
          landed === route && selected === 1,
          `landed on ${landed}, selected pill ${selected}`
        );
        if (range === '90d') {
          await page.screenshot({
            path: path.join(OUT, `${name}-90d.png`),
            fullPage: true,
          });
        }
      }

      // Test accounts on.
      await page.goto(`${BASE_URL}${route}?range=90d&test=on`, { waitUntil: 'load' });
      await page.waitForTimeout(300);
      const banner = await page.locator('[data-test-accounts-banner="on"]').count();
      const switchOn = await page.locator('[data-test-accounts="on"]').count();
      record(`admin ${route} with test accounts on`, banner === 1 && switchOn === 1);
      await page.screenshot({
        path: path.join(OUT, `${name}-90d-test-on.png`),
        fullPage: true,
      });
    }

    // Custom range.
    await page.goto(
      `${BASE_URL}/admin/analytics?range=custom&from=2026-01-01&to=2026-08-12`,
      { waitUntil: 'load' }
    );
    await page.waitForTimeout(300);
    const customSelected = await page
      .locator('[data-range="custom"][data-selected="true"]')
      .count();
    record('admin custom range', customSelected === 1);
    await page.screenshot({ path: path.join(OUT, 'overview-custom.png'), fullPage: true });

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
