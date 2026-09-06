#!/usr/bin/env node
/**
 * WHAT A SCREEN ASKS THE SERVER FOR AFTER IT HAS ALREADY LOADED.
 *
 * WHY THIS EXISTS. A Server Action POSTs to the route the member is standing
 * on and re-renders the whole of it on the server. That is correct for a
 * button she pressed and waits for; it is pure cost for anything fired from
 * a mounted effect, because she gets nothing back for the render.
 *
 * On 2026-09-06 this found the single largest thing on Home's clock: two
 * experiment panels each asked `getMyLifestyleExperiments()` on mount, which
 * is two more complete server renders of /dashboard, roughly five seconds
 * each, starting AFTER the page had finished. Home settled at 8.9 seconds
 * because of it.
 *
 * tests/no-server-action-from-a-tracker.test.ts holds the naming half of
 * that rule (a Track*/Mark*/Acknowledge* component may not import an action
 * module). It could not have caught those two panels, which are ordinary
 * named components doing an ordinary-looking fetch. Only watching a real
 * page finds those, which is what this does.
 *
 * WHAT A CLEAN RUN LOOKS LIKE: POSTs to /api/... only. Any POST to the page's
 * own path is a Server Action, and each one is a full server render of that
 * page. Read-only: it navigates and it watches. It clicks nothing.
 *
 * Usage, from apps/consumer-web-app:
 *
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   BASE_URL=... PATHS=/dashboard,/today node scripts/audit-page-server-actions.mjs
 */
import { chromium } from 'playwright';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = process.env.BASE_URL ?? 'https://app.mefwellness.com';
const EMAIL = process.env.MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const DEFAULT_PATHS = ['/dashboard', '/today', '/checkin', '/programs', '/progress', '/conversation', '/profile'];
const PATHS = (process.env.PATHS ?? DEFAULT_PATHS.join(',')).split(',').filter(Boolean);

const browser = await chromium.launch();
let minted = null;
let actions = 0;
try {
  minted = await mintSessionContext(browser, EMAIL, {
    baseUrl: BASE,
    viewport: { width: 390, height: 844 },
  });
  if (!minted) {
    console.error('could not mint a session for', EMAIL);
    process.exit(1);
  }

  for (const path of PATHS) {
    const page = await minted.context.newPage();
    const seen = [];
    const started = Date.now();
    page.on('request', (request) => {
      if (request.method() !== 'POST') return;
      const isAction = Boolean(request.headers()['next-action']);
      seen.push({
        at: Date.now() - started,
        url: request.url().replace(BASE, ''),
        isAction,
        actionId: request.headers()['next-action'] ?? null,
        body: (request.postData() ?? '').replace(/\s+/g, ' ').slice(0, 120),
      });
    });

    await page.goto(`${BASE}${path}`, { waitUntil: 'commit', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const fired = seen.filter((row) => row.isAction);
    actions += fired.length;
    console.log(`\n=== ${path} — ${fired.length} Server Action(s) on load, ${seen.length - fired.length} beacon(s)`);
    for (const row of seen) {
      console.log(
        `  +${String(row.at).padStart(5)}ms  ${row.isAction ? 'SERVER ACTION' : 'beacon       '}  ${row.url}  ${row.isAction ? row.actionId : row.body}`
      );
    }
    await page.close();
  }
} finally {
  await retireSession(minted);
  await browser.close().catch(() => {});
}
console.log(`\ntotal Server Actions fired on load: ${actions} (a clean run is 0)`);
if (actions > 0) process.exitCode = 1;
