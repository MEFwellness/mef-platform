/**
 * Live verification for the 2026-08-29 "a coach's own test member is a
 * client" build.
 *
 * Three questions, asked separately, because they are three different
 * claims and one passing does not imply another.
 *
 *   1. THE COACH SIDE. Signed in as the real coach, the flagged member he
 *      is actively assigned to must appear in the caseload with a Test
 *      account label, her client detail must open rather than 404, her
 *      entries and her programs must load, and the assign and corrective
 *      trees must open for her too.
 *
 *   2. THE MEMBER EXPERIENCE IS UNTOUCHED. Signed in as that same flagged
 *      member, Home and Today must load with no page error.
 *
 *   3. ANALYTICS STILL EXCLUDES HER. Asked of the production database
 *      directly, through the one function every funnel, engagement and
 *      drop-off query builds on.
 *
 * Sessions are minted one-time (Turnstile blocks a scripted form sign-in
 * by design) and retired with scope 'local'. Every navigation is bounded
 * and the browser closes in a finally block.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = 'https://app.mefwellness.com';
const COACH_EMAIL = 'oakomah66@gmail.com';
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

/** Ids and the pairing, read straight from the database, not assumed. */
async function truth() {
  const { data: users, error: uErr } = await service.auth.admin.listUsers({ perPage: 200 });
  if (uErr) throw new Error(`listUsers failed: ${uErr.message}`);
  const byEmail = (e) => users.users.find((u) => u.email === e);
  const coach = byEmail(COACH_EMAIL);
  const member = byEmail(MEMBER_EMAIL);
  if (!coach || !member) throw new Error('coach or member account not found on production');

  const { data: profiles } = await service
    .from('profiles')
    .select('id, display_name, is_test')
    .in('id', [coach.id, member.id]);
  const memberProfile = profiles.find((p) => p.id === member.id);

  const { data: pairing } = await service
    .from('coach_client_assignments')
    .select('status')
    .eq('coach_id', coach.id)
    .eq('client_id', member.id);

  return {
    coachId: coach.id,
    memberId: member.id,
    memberName: memberProfile?.display_name ?? null,
    memberIsTest: Boolean(memberProfile?.is_test),
    activePairing: (pairing ?? []).some((p) => p.status === 'active'),
  };
}

async function openAs(browser, email, viewport) {
  const minted = await mintSessionContext(browser, email, { baseUrl: BASE, viewport });
  if (!minted) throw new Error(`could not mint a session for ${email}`);
  return minted;
}

/** The Next not-found page, by its own heading, not by the digits 404 appearing anywhere on a long page. */
async function isNotFound(page) {
  const headings = await page.locator('h1, h2').allInnerTexts();
  return headings.some((h) => h.trim() === '404' || /could not be found/i.test(h));
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
  const text = await page.locator('body').innerText().catch(() => '');
  return { page, text, status: response?.status() ?? 0, consoleErrors, pageErrors, url: page.url() };
}

const run = async () => {
  const db = await truth();
  console.log(
    `\nProduction, read directly: ${MEMBER_EMAIL} is "${db.memberName}", is_test=${db.memberIsTest}, ` +
      `active pairing with ${COACH_EMAIL}: ${db.activePairing}.\n`
  );
  record(
    'the account under test really is flagged, so this is not a vacuous pass',
    db.memberIsTest && db.activePairing,
    `is_test=${db.memberIsTest}, active assignment=${db.activePairing}`
  );

  const browser = await chromium.launch();
  let coach = null;
  let member = null;
  try {
    // -----------------------------------------------------------------
    // 1. The coach side
    // -----------------------------------------------------------------
    coach = await openAs(browser, COACH_EMAIL, { width: 1280, height: 1600 });

    const dash = await visit(coach.context, '/coach');
    await dash.page.screenshot({ path: `${SHOTS}/coach-dashboard.png`, fullPage: true });
    const nameOnDash = (dash.text.match(new RegExp(db.memberName, 'g')) ?? []).length;
    const chipsOnDash = (dash.text.match(/Test account/g) ?? []).length;
    const caseloadCards = await dash.page.locator('a[href^="/coach/clients/"]').allInnerTexts();
    const herCard = caseloadCards.find((card) => card.includes(db.memberName)) ?? null;

    record(
      `${db.memberName} appears in the coach caseload`,
      nameOnDash > 0,
      `her name appears ${nameOnDash} time(s) on /coach; her caseload card reads ${JSON.stringify(herCard)}`
    );
    record(
      'she carries a Test account label on the coach dashboard',
      chipsOnDash > 0 && Boolean(herCard && herCard.includes('Test account')),
      `${chipsOnDash} Test account label(s) rendered on /coach`
    );
    record(
      '/coach loaded without a page error',
      dash.status === 200 && dash.pageErrors.length === 0,
      `status ${dash.status}, ${dash.pageErrors.length} page errors, ${dash.consoleErrors.length} console errors`
    );

    const COACH_SCREENS = [
      ['/coach/clients/ID', 'her client detail opens'],
      ['/coach/clients/ID/entries', 'her check-in entries load'],
      ['/coach/clients/ID/detail', 'her full detail panels load'],
      ['/coach/clients/ID/programs', 'her programs and assignments load'],
      ['/coach/assign/ID', 'the assign-a-program screen opens for her'],
      ['/coach/corrective-programs/ID', 'the corrective-program screen opens for her'],
    ];

    for (const [template, label] of COACH_SCREENS) {
      const path = template.replace('ID', db.memberId);
      const view = await visit(coach.context, path);
      const notFound = await isNotFound(view.page);
      const chip = (view.text.match(/Test account/g) ?? []).length;
      await view.page.screenshot({
        path: `${SHOTS}/coach-${path.split('/').slice(2).join('-')}.png`,
        fullPage: true,
      });
      record(
        label,
        view.status === 200 && !notFound && view.pageErrors.length === 0,
        `${path} -> status ${view.status}, 404 text present: ${notFound}, ` +
          `${chip} Test account label(s), ${view.pageErrors.length} page errors, ${view.consoleErrors.length} console errors` +
          `${view.consoleErrors.length ? `: ${view.consoleErrors.slice(0, 2).join(' | ')}` : ''}`
      );
    }

    const picker = await visit(coach.context, '/coach/assign');
    const pickerRows = await picker.page.locator('a[href^="/coach/assign/"]').allInnerTexts();
    const herRow = pickerRows.find((row) => row.includes(db.memberName)) ?? null;

    await picker.page.screenshot({ path: `${SHOTS}/coach-assign-picker.png`, fullPage: true });
    record(
      'the pairing shows in the assign-a-program client picker, labelled',
      Boolean(herRow && herRow.includes('Test account')),
      `her row in the picker reads ${JSON.stringify(herRow)}`
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
        `status ${view.status}, landed on ${new URL(view.url).pathname}, ` +
          `${view.pageErrors.length} page errors, ${view.consoleErrors.length} console errors` +
          `${view.consoleErrors.length ? `: ${view.consoleErrors.slice(0, 3).join(' | ')}` : ''}`
      );
    }
  } finally {
    await retireSession(coach);
    await retireSession(member);
    await browser.close();
  }

  // -------------------------------------------------------------------
  // 3. Analytics still excludes her, measured against production
  // -------------------------------------------------------------------
  const { data: without, error: e1 } = await service.rpc('analytics_member_scope', {
    p_include_test: false,
  });
  const { data: withTest, error: e2 } = await service.rpc('analytics_member_scope', {
    p_include_test: true,
  });
  if (e1 || e2) {
    record('analytics scope readable', false, `${e1?.message ?? ''} ${e2?.message ?? ''}`);
  } else {
    const idsWithout = without.map((r) => r.member_id);
    const idsWith = withTest.map((r) => r.member_id);
    record(
      'analytics still excludes the flagged member by default',
      !idsWithout.includes(db.memberId),
      `analytics_member_scope(p_include_test=false) returned ${idsWithout.length} members, hers among them: ${idsWithout.includes(db.memberId)}`
    );
    record(
      'and still includes her only when explicitly asked to',
      idsWith.includes(db.memberId),
      `analytics_member_scope(p_include_test=true) returned ${idsWith.length} members, hers among them: ${idsWith.includes(db.memberId)}`
    );
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  if (failed.length) process.exitCode = 1;
};

run().catch((error) => {
  console.error('run failed:', error.message);
  process.exitCode = 1;
});
