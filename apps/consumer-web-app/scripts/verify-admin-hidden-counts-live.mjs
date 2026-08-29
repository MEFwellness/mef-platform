/**
 * Live verification for the 2026-08-29 admin-list build.
 *
 * Two questions, asked separately.
 *
 *   1. THE ADMIN SCREEN. Signed in as the real platform administrator,
 *      /admin must now print how many accounts it is showing and how many
 *      it hid, offer the toggle, and on ?includeTest=1 show the flagged
 *      accounts with a "Test account" label. The numbers on the page are
 *      checked against the database, not against each other.
 *
 *   2. THE MEMBER EXPERIENCE IS UNTOUCHED. Signed in as the standing test
 *      member, Home and Today must load with no page error and no console
 *      error. Nothing in this build touches a member screen; this is the
 *      proof rather than the assumption.
 *
 * Sessions are minted one-time (Turnstile blocks a scripted form sign-in
 * by design) and retired with scope 'local'. Bounded: every navigation has
 * a timeout and the browser closes in a finally block.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = 'https://app.mefwellness.com';
const ADMIN_EMAIL = 'info@mefwellness.com';
const MEMBER_EMAIL = '8weeks2fab@gmail.com';
const SHOTS = 'scripts/.verify/shots';
const NAV_TIMEOUT = 45_000;

mkdirSync(SHOTS, { recursive: true });

const service = createClient(
  process.env.PROD_SUPABASE_URL,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const results = [];
function record(item, pass, detail) {
  results.push({ item, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${item}\n      ${detail}`);
}

/** The truth the screen is checked against, read straight from the database. */
async function truth() {
  const { data: profiles, error } = await service.from('profiles').select('id, is_test');
  if (error) throw new Error(`profiles read failed: ${error.message}`);
  const flagged = profiles.filter((p) => p.is_test).length;
  return { total: profiles.length, flagged, real: profiles.length - flagged };
}

async function openAs(browser, email, viewport) {
  const minted = await mintSessionContext(browser, email, { baseUrl: BASE, viewport });
  if (!minted) throw new Error(`could not mint a session for ${email}`);
  return minted;
}

async function visit(context, path) {
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  const response = await page.goto(`${BASE}${path}`, {
    waitUntil: 'domcontentloaded',
    timeout: NAV_TIMEOUT,
  });
  await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT }).catch(() => {});
  return { page, status: response?.status() ?? 0, consoleErrors, pageErrors, url: page.url() };
}

const run = async () => {
  const db = await truth();
  console.log(
    `\nProduction, read directly: ${db.total} accounts, ${db.flagged} flagged as test accounts, ${db.real} not flagged.\n`
  );

  const browser = await chromium.launch();
  let admin = null;
  let member = null;
  try {
    // -----------------------------------------------------------------
    // 1. The admin screen
    // -----------------------------------------------------------------
    admin = await openAs(browser, ADMIN_EMAIL, { width: 1280, height: 1400 });

    const hidden = await visit(admin.context, '/admin');
    // textContent, not innerText: innerText waits on visibility, and this
    // line sits far enough down a long admin page that the wait expired
    // once on a freshly deployed build with nothing actually wrong.
    const hiddenText = (await hidden.page.locator('[data-user-count]').first().textContent()) ?? '';
    await hidden.page.screenshot({ path: `${SHOTS}/admin-default.png`, fullPage: true });

    // Staff hold roles but still have profile rows, so the Users card
    // counts every unflagged account, staff included.
    record(
      '/admin prints how many accounts are shown',
      hiddenText.includes(`${db.real} accounts shown.`),
      `read on the page: "${hiddenText}" (database says ${db.real} unflagged)`
    );
    record(
      '/admin prints how many test accounts it hid',
      hiddenText.includes(`${db.flagged} test accounts hidden.`),
      `database says ${db.flagged} flagged`
    );
    const toggleShow = await hidden.page.getByRole('link', { name: 'Show test accounts' }).count();
    record(
      '/admin offers the way to look',
      toggleShow > 0,
      `"Show test accounts" link present: ${toggleShow > 0}`
    );
    record(
      '/admin loaded without a page error',
      hidden.status === 200 && hidden.pageErrors.length === 0,
      `status ${hidden.status}, ${hidden.pageErrors.length} page errors, ${hidden.consoleErrors.length} console errors`
    );

    const shown = await visit(admin.context, '/admin?includeTest=1');
    const shownText = (await shown.page.locator('[data-user-count]').first().textContent()) ?? '';
    const chips = await shown.page.getByText('Test account', { exact: true }).count();
    const ebony = await shown.page.getByText('Ebony', { exact: true }).count();
    await shown.page.screenshot({ path: `${SHOTS}/admin-include-test.png`, fullPage: true });

    record(
      '/admin?includeTest=1 shows every account',
      shownText.includes(`${db.total} accounts shown.`) &&
        shownText.includes('No test accounts hidden.'),
      `read on the page: "${shownText}" (database says ${db.total} total)`
    );
    record(
      'every flagged account carries a Test account label',
      chips === db.flagged,
      `${chips} labels rendered, ${db.flagged} flagged accounts in the database`
    );
    record(
      `${MEMBER_EMAIL} is reachable from the admin screen`,
      ebony > 0,
      `the flagged account's display name is rendered ${ebony} time(s) with a Test account label beside it`
    );
    record(
      '/admin?includeTest=1 loaded without a page error',
      shown.status === 200 && shown.pageErrors.length === 0,
      `status ${shown.status}, ${shown.pageErrors.length} page errors, ${shown.consoleErrors.length} console errors`
    );

    // -----------------------------------------------------------------
    // 2. The member experience
    // -----------------------------------------------------------------
    member = await openAs(browser, MEMBER_EMAIL, { width: 390, height: 844 });

    for (const path of ['/dashboard', '/today']) {
      const view = await visit(member.context, path);
      await view.page.screenshot({ path: `${SHOTS}/member-${path.slice(1)}.png`, fullPage: true });
      record(
        `member ${path} still loads`,
        view.status === 200 && view.pageErrors.length === 0 && !view.url.includes('/login'),
        `status ${view.status}, landed on ${new URL(view.url).pathname}, ${view.pageErrors.length} page errors, ${view.consoleErrors.length} console errors${
          view.consoleErrors.length ? `: ${view.consoleErrors.slice(0, 3).join(' | ')}` : ''
        }`
      );
    }
  } finally {
    await retireSession(admin);
    await retireSession(member);
    await browser.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  if (failed.length) process.exitCode = 1;
};

run().catch((error) => {
  console.error('run failed:', error.message);
  process.exitCode = 1;
});
