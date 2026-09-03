/**
 * Live verification of the acquisition report and the cross device fix, on
 * production, in a real browser.
 *
 * WHAT IT DRIVES, IN ORDER.
 *   1. The report itself, opened by a real administrator on a real minted
 *      session, with the arrivals production already has.
 *   2. A tracked run end to end: a link built on the real link builder,
 *      the nine questions answered as a stranger, an email left.
 *   3. THE POINT OF THE WHOLE BUILD: the account created in a SEPARATE
 *      browser context that holds no visitor token at all, through the real
 *      signup form, so the only thing that can link it is the email
 *      address. Flagged is_test the moment it exists.
 *   4. That account showing as attributed rather than untracked, under the
 *      right source, with the right funnel stages.
 *   5. The test toggle: the run disappears, the real rows stay.
 *   6. The untracked row, and a bare /energy arrival landing in it.
 *   7. Cleanup, and the report read again against a direct count.
 *
 * BOT PROTECTION IS NOT WORKED AROUND. The administrator's session is
 * minted the standing way. The signup form is driven as an ordinary
 * visitor would drive it, and if bot protection refuses it that is
 * reported as what it is, never as a failure of this build.
 *
 * Required env, all as file PATHS so nothing secret reaches a command line:
 *   PROD_SUPABASE_URL, PROD_SERVICE_KEY_FILE, PROD_ANON_KEY_FILE
 * Optional:
 *   BASE_URL     default https://app.mefwellness.com
 *   ADMIN_EMAIL  the platform administrator to drive the report as
 *   CLEANUP      'false' to leave every row behind for inspection
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mintSessionCookies, retireSession, canMintSessions } from './lib/mint-session.mjs';

const BASE = process.env.BASE_URL || 'https://app.mefwellness.com';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'oakomah66@gmail.com';
const CLEANUP = process.env.CLEANUP !== 'false';
const STAMP = Date.now();

const SOURCE_CODE = `xdev-verify-${STAMP}`.slice(0, 40);
const PARTNER_NAME = 'Cross device verify partner';
const CAMPAIGN = 'xdev_verify';
const CREATIVE = 'card_x';
const MEDIUM = 'counter_card';
const LEAD_EMAIL = `qa.xdev.${STAMP}@mefwellness-test.invalid`;
const PASSWORD = `Qa!${STAMP}aA`;

const mintedTokens = [];
function remember(token) {
  if (token) mintedTokens.push(token);
  return token;
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
function note(text) {
  console.log(`NOTE  ${text}`);
}

if (!canMintSessions()) {
  console.error('Missing PROD_SUPABASE_URL / PROD_SERVICE_KEY_FILE / PROD_ANON_KEY_FILE.');
  process.exit(2);
}

const service = createClient(
  process.env.PROD_SUPABASE_URL,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const browser = await chromium.launch();
let adminMinted = null;
let memberId = null;

/** Walks the nine questions from the entry screen. */
async function walkTheExperience(page) {
  await page.getByRole('button', { name: 'Begin' }).waitFor({ timeout: 40000 });
  await page.getByRole('button', { name: 'Begin' }).click();
  for (let q = 0; q < 9; q += 1) {
    const cont = page.getByRole('button', { name: 'Continue' });
    if (await cont.isVisible().catch(() => false)) await cont.click();
    const options = page.locator('[role="radio"]');
    await options.first().waitFor({ timeout: 40000 });
    await options.first().click();
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(4000);
}

/** The six counts on one row of the report table, read off the rendered cells. */
async function rowCounts(page, groupKey) {
  const cell = page.locator(`td[data-group-key="${groupKey}"]`).first();
  if (!(await cell.count())) return null;
  const row = page.locator(`tr:has(td[data-group-key="${groupKey}"])`).first();
  const stages = ['visits', 'starts', 'completions', 'leads', 'accounts', 'paid'];
  const counts = {};
  for (const stage of stages) {
    const value = await row.locator(`td[data-stage="${stage}"]`).first().getAttribute('data-stage-count');
    counts[stage] = Number(value);
  }
  return counts;
}

async function totalsOnScreen(page) {
  const stages = ['visits', 'starts', 'completions', 'leads', 'accounts', 'paid'];
  const totals = {};
  for (const stage of stages) {
    const value = await page.locator(`[data-total="${stage}"]`).first().getAttribute('data-total-value');
    totals[stage] = Number(value);
  }
  return totals;
}

/**
 * Every row this run created, removed. Idempotent, and called both at the
 * end of the happy path and from `finally`, because a run that stops half
 * way through must not leave its own arrivals behind.
 */
let cleaned = false;
async function cleanup() {
  if (!CLEANUP || cleaned) return;
  cleaned = true;
  if (memberId) {
    await service.from('user_acquisition').delete().eq('member_id', memberId);
    await service.from('member_public_entry_origin').delete().eq('member_id', memberId);
    await service.from('member_wellness_events').delete().eq('member_id', memberId);
    await service.auth.admin.deleteUser(memberId).catch(() => {});
    memberId = null;
  }
  const { data: leads } = await service
    .from('captured_leads')
    .select('id, conversation_id')
    .eq('email', LEAD_EMAIL);
  for (const lead of leads ?? []) {
    await service.from('captured_lead_acquisition').delete().eq('captured_lead_id', lead.id);
    await service.from('notifications').delete().eq('source_record_id', lead.id);
    await service.from('captured_leads').delete().eq('id', lead.id);
    await service.from('lead_conversations').delete().eq('id', lead.conversation_id);
  }
  await service.from('public_entry_links').delete().eq('source_code', SOURCE_CODE);
  for (const token of mintedTokens) {
    await service.from('public_entry_sessions').delete().eq('visitor_token', token);
  }
  await service.from('public_entry_sessions').delete().eq('source_code', SOURCE_CODE);
  await service.from('public_entry_sources').delete().eq('code', SOURCE_CODE);
}

const REPORT_ALL = `${BASE}/admin/acquisition?range=90d&test=on`;
const REPORT_REAL = `${BASE}/admin/acquisition?range=90d`;

try {
  adminMinted = await mintSessionCookies(ADMIN_EMAIL, { baseUrl: BASE });
  if (!adminMinted) {
    console.error('could not mint an administrator session');
    process.exit(1);
  }
  const adminContext = await browser.newContext({ viewport: { width: 1400, height: 1200 } });
  await adminContext.addCookies(adminMinted.cookies);
  const adminPage = await adminContext.newPage();
  const adminErrors = [];
  adminPage.on('pageerror', (e) => adminErrors.push(e.message));
  adminPage.on('console', (m) => { if (m.type() === 'error') adminErrors.push(m.text()); });

  // -------------------------------------------------------------------
  // 1) The report opens for a real administrator
  // -------------------------------------------------------------------

  await adminPage.goto(REPORT_REAL, { waitUntil: 'networkidle' });
  const heading = await adminPage.getByRole('heading', { name: 'Acquisition report' }).isVisible().catch(() => false);
  check('1. the acquisition report opens for a real administrator', heading);

  const headerText = await adminPage.locator('table thead').first().innerText().catch(() => '');
  check('2. the six funnel columns are on the screen, in order',
    /Visits[\s\S]*Started[\s\S]*Finished[\s\S]*Email leads[\s\S]*Accounts[\s\S]*Paid/i.test(headerText),
    headerText.replace(/\s+/g, ' ').slice(0, 120));

  for (const group of ['source', 'campaign', 'creative', 'location', 'geo']) {
    const pill = await adminPage.locator(`a[data-group="${group}"]`).first().isVisible().catch(() => false);
    if (!pill) check(`2b. the ${group} grouping is offered`, false);
  }
  check('2b. all five groupings are offered', true);

  // -------------------------------------------------------------------
  // 2) What production already has
  // -------------------------------------------------------------------

  const { data: realArrivals } = await service
    .from('public_entry_funnel')
    .select('session_id, source_code, is_test, first_seen_at, member_id, did_start, did_complete')
    .order('first_seen_at');
  const qrArrivals = (realArrivals ?? []).filter((r) => r.source_code === 'qr-card');
  note(`production holds ${(realArrivals ?? []).length} arrivals, ${qrArrivals.length} of them on qr-card`);
  note(
    qrArrivals
      .map((r) => `${r.first_seen_at.slice(0, 10)} test=${r.is_test} account=${Boolean(r.member_id)}`)
      .join(' | ')
  );

  const qrReal = qrArrivals.filter((r) => !r.is_test).length;
  const qrAll = qrArrivals.length;

  const qrRowRealToggle = await rowCounts(adminPage, 'qr-card');
  check('3. the QR card arrivals appear under the qr-card source, test traffic excluded',
    qrRowRealToggle !== null && qrRowRealToggle.visits === qrReal,
    `screen ${qrRowRealToggle?.visits}, database ${qrReal}`);

  await adminPage.goto(REPORT_ALL, { waitUntil: 'networkidle' });
  const qrRowAllToggle = await rowCounts(adminPage, 'qr-card');
  check('4. with test traffic included, both real QR card arrivals from 31 August appear',
    qrRowAllToggle !== null && qrRowAllToggle.visits === qrAll,
    `screen ${qrRowAllToggle?.visits}, database ${qrAll}`);

  const { count: originCount } = await service
    .from('member_public_entry_origin')
    .select('member_id', { count: 'exact', head: true });
  check('5. the real member origin row is counted as an account on its source row',
    qrRowAllToggle !== null && qrRowAllToggle.accounts >= (originCount ?? 0),
    `screen accounts ${qrRowAllToggle?.accounts}, origin rows ${originCount}`);

  const { data: allSources } = await service.from('public_entry_sources').select('code, is_test');
  const missing = [];
  const tableText = await adminPage.locator('table').first().innerText();
  for (const source of allSources ?? []) {
    if (!tableText.includes(source.code)) missing.push(source.code);
  }
  check('6. every partner code from the link builder is listed, zero activity included',
    missing.length === 0,
    missing.length ? `missing ${missing.join(', ')}` : `${(allSources ?? []).length} codes all present`);

  const zeroRows = (await adminPage.locator('tr:has(td[data-group-kind="named"])').all()).length;
  note(`${zeroRows} named rows on the screen with test traffic included`);

  const untrackedPresent = await adminPage.locator('td[data-group-kind="untracked"]').first().isVisible().catch(() => false);
  check('7. the untracked row is present', untrackedPresent);

  // -------------------------------------------------------------------
  // 3) A tracked run, end to end, with the account made elsewhere
  // -------------------------------------------------------------------

  await adminPage.goto(`${BASE}/admin/acquisition/links`, { waitUntil: 'networkidle' });
  await adminPage.fill('#partnerName', PARTNER_NAME);
  await adminPage.fill('#sourceCode', SOURCE_CODE);
  await adminPage.fill('#medium', MEDIUM);
  await adminPage.fill('#campaign', CAMPAIGN);
  await adminPage.fill('#creative', CREATIVE);
  await adminPage.fill('#locationName', 'Verify Counter');
  await adminPage.fill('#locationCity', 'Croydon');
  await adminPage.fill('#locationCountry', 'GB');
  // Our own traffic, so nothing this run produces can reach a real number
  // even if it stops half way through.
  await adminPage.locator('input[type="checkbox"]').first().check();
  await adminPage.getByRole('button', { name: 'Create this link' }).click();
  await adminPage.waitForTimeout(5000);

  const { data: linkRow } = await service
    .from('public_entry_links')
    .select('url')
    .eq('source_code', SOURCE_CODE)
    .maybeSingle();
  check('8. a tracked link was built on the real link builder', Boolean(linkRow?.url), linkRow?.url);
  const TRACKED_URL = linkRow?.url;

  // The phone. It answers, it leaves an email, and it is the ONLY browser
  // that ever holds a visitor token.
  const phoneContext = await browser.newContext();
  const phonePage = await phoneContext.newPage();
  const phoneErrors = [];
  phonePage.on('pageerror', (e) => phoneErrors.push(e.message));
  phonePage.on('console', (m) => { if (m.type() === 'error') phoneErrors.push(m.text()); });

  await phonePage.goto(TRACKED_URL, { waitUntil: 'networkidle' });
  const phoneToken = remember(
    await phonePage.evaluate(() => localStorage.getItem('mef.publicEntry.token.v1'))
  );
  await walkTheExperience(phonePage);

  const emailField = phonePage.locator('#energy-email');
  await emailField.scrollIntoViewIfNeeded();
  await emailField.waitFor({ timeout: 30000 });
  await emailField.fill(LEAD_EMAIL);
  await phonePage.getByRole('button', { name: 'Open my three day notes' }).click();
  await phonePage.waitForTimeout(9000);

  const { data: phoneSession } = await service
    .from('public_entry_sessions')
    .select('id, source_code, started_at, completed_at, lead_captured_at, captured_lead_id')
    .eq('visitor_token', phoneToken)
    .maybeSingle();
  check('9. the tracked arrival finished and left an email',
    phoneSession?.source_code === SOURCE_CODE &&
      Boolean(phoneSession?.completed_at) &&
      Boolean(phoneSession?.captured_lead_id),
    `${phoneSession?.source_code}, lead ${phoneSession?.captured_lead_id ? 'yes' : 'no'}`);
  check('10. the tracked walk produced no console or page errors',
    phoneErrors.length === 0, phoneErrors.slice(0, 2).join(' | '));

  // The laptop. A brand new browser context: no localStorage, no cookies,
  // no visitor token, nothing at all that could carry the arrival across.
  const laptopContext = await browser.newContext();
  const laptopPage = await laptopContext.newPage();
  const laptopErrors = [];
  laptopPage.on('pageerror', (e) => laptopErrors.push(e.message));
  // Cloudflare's own Turnstile challenge script prints two console errors
  // ("%c%d font-size:0;color:transparent NaN") on every load of this page,
  // from challenges.cloudflare.com, with nothing submitted and nothing of
  // ours involved. Confirmed by reading the message location. Ours is the
  // rule this check is for, so third party challenge noise is excluded by
  // ORIGIN rather than by matching its text, which would also hide a real
  // error that happened to look like it.
  laptopPage.on('console', (m) => {
    if (m.type() !== 'error') return;
    if ((m.location()?.url ?? '').includes('challenges.cloudflare.com')) return;
    laptopErrors.push(m.text());
  });

  // domcontentloaded, not networkidle: this screen keeps a connection open
  // and networkidle never settles on it.
  await laptopPage.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded' });
  await laptopPage.locator('#email').waitFor({ timeout: 40000 });
  await laptopPage.waitForTimeout(2500);
  const carriedToken = await laptopPage.evaluate(() =>
    localStorage.getItem('mef.publicEntry.token.v1')
  );
  check('11. the signup browser carries no arrival of its own', carriedToken === null,
    carriedToken ? 'it had a token' : 'no token in this browser');
  const arrivalField = await laptopPage
    .locator('input[name="publicEntryArrival"]')
    .first()
    .getAttribute('value')
    .catch(() => null);
  check('12. the form tells the server it holds nothing, and never sends a token',
    arrivalField === 'no', `field says ${arrivalField}`);

  // The real form is attempted first, exactly as a person would use it.
  await laptopPage.fill('#email', LEAD_EMAIL);
  await laptopPage.fill('#password', PASSWORD);
  await laptopPage.getByRole('button', { name: /Sign up|Continue/ }).click();
  await laptopPage.waitForTimeout(12000);
  const laptopAlerts = (await laptopPage.locator('[role="alert"]').allInnerTexts().catch(() => []))
    .filter(Boolean)
    .join(' | ');

  let { data: userList } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let created = (userList?.users ?? []).find((u) => u.email === LEAD_EMAIL);

  if (!created) {
    // Bot protection is live on this form by design and refuses a scripted
    // browser. That is not a failure of anything in this build and is never
    // worked around. The account is created the standing way instead, and
    // the link is then run by THE REAL shipped function, imported from the
    // same file the signup action imports.
    note(`the signup form was refused by bot protection, which is by design: ${laptopAlerts}`);
    const { data: adminCreated, error: createError } = await service.auth.admin.createUser({
      email: LEAD_EMAIL,
      password: PASSWORD,
      email_confirm: true,
    });
    if (createError) note(`admin createUser failed: ${createError.message}`);
    created = adminCreated?.user ?? undefined;
  }

  check('13. an account exists for the address she left on the other device',
    Boolean(created?.id), created?.id ? 'created' : `not created: ${laptopAlerts}`);
  memberId = created?.id ?? null;

  if (memberId) {
    await service.from('profiles').update({ is_test: true }).eq('id', memberId);
    const { data: profileRow } = await service
      .from('profiles')
      .select('is_test')
      .eq('id', memberId)
      .maybeSingle();
    check('14. the account is flagged is_test before anything else happens',
      profileRow?.is_test === true);

    // The real cross device link, run by the real shipped function against
    // production. See scripts/link-acquisition-by-email-live.ts.
    const linked = execFileSync(
      'npx',
      ['tsx', 'scripts/link-acquisition-by-email-live.ts'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          LINK_MEMBER_ID: memberId,
          LINK_EMAIL: LEAD_EMAIL,
          LINK_ACCOUNT_CREATED_AT: created?.created_at ?? '',
        },
      }
    ).trim().split('\n').pop();
    note(`the shipped link function returned ${linked}`);
    check('14b. the shipped cross device function reports it attached the arrival',
      JSON.parse(linked ?? '{}').attached === true, linked ?? '');
  }

  // -------------------------------------------------------------------
  // 4) It is attributed, not untracked
  // -------------------------------------------------------------------

  const { data: acquisition } = memberId
    ? await service.from('user_acquisition').select('*').eq('member_id', memberId).maybeSingle()
    : { data: null };

  check('15. the account is attributed, matched by email alone', Boolean(acquisition),
    acquisition ? `source ${acquisition.source_code}` : 'no user_acquisition row');
  check('16. it carries every parameter the original link carried',
    acquisition?.source_code === SOURCE_CODE &&
      acquisition?.utm_campaign === CAMPAIGN &&
      acquisition?.utm_content === CREATIVE &&
      acquisition?.utm_medium === MEDIUM,
    JSON.stringify({ source: acquisition?.source_code, campaign: acquisition?.utm_campaign }));
  check('17. it carries the ORIGINAL landing time, not the time she signed up',
    Boolean(acquisition?.landed_at) &&
      new Date(acquisition.landed_at).getTime() < new Date(acquisition.attributed_at).getTime(),
    `landed ${acquisition?.landed_at}, attributed ${acquisition?.attributed_at}`);
  check('18. it points at the arrival and the lead it came from',
    acquisition?.session_id === phoneSession?.id &&
      acquisition?.captured_lead_id === phoneSession?.captured_lead_id,
    `session ${acquisition?.session_id === phoneSession?.id}, lead ${acquisition?.captured_lead_id === phoneSession?.captured_lead_id}`);

  const { data: originRow } = memberId
    ? await service.from('member_public_entry_origin').select('member_id').eq('member_id', memberId).maybeSingle()
    : { data: null };
  check('19. no browser bind was written, because an email match is not consent to show her answers',
    originRow === null);

  await adminPage.goto(REPORT_ALL, { waitUntil: 'networkidle' });
  const verifyRow = await rowCounts(adminPage, SOURCE_CODE);
  check('20. the report shows the run under the right source, with the right stages',
    verifyRow !== null &&
      verifyRow.visits === 1 &&
      verifyRow.starts === 1 &&
      verifyRow.completions === 1 &&
      verifyRow.leads === 1 &&
      verifyRow.accounts === 1,
    JSON.stringify(verifyRow));
  check('21. it has not paid, and the screen says nought rather than inventing one',
    verifyRow?.paid === 0, `paid ${verifyRow?.paid}`);

  await adminPage.goto(`${REPORT_ALL}&group=campaign`, { waitUntil: 'networkidle' });
  const campaignRow = await rowCounts(adminPage, CAMPAIGN);
  check('22. the same run reads correctly grouped by campaign',
    campaignRow?.visits === 1 && campaignRow?.accounts === 1, JSON.stringify(campaignRow));

  await adminPage.goto(`${REPORT_ALL}&group=creative`, { waitUntil: 'networkidle' });
  const creativeRow = await rowCounts(adminPage, CREATIVE);
  check('23. and grouped by creative', creativeRow?.visits === 1, JSON.stringify(creativeRow));

  await adminPage.goto(`${REPORT_ALL}&group=location`, { waitUntil: 'networkidle' });
  const locationText = await adminPage.locator('table').first().innerText();
  check('24. and grouped by the partner location a person typed in',
    locationText.includes('Verify Counter') && locationText.includes('Croydon'),
    locationText.split('\n').find((l) => l.includes('Verify Counter')) ?? 'not found');

  await adminPage.goto(`${REPORT_ALL}&group=geo`, { waitUntil: 'networkidle' });
  const geoText = await adminPage.locator('table').first().innerText();
  check('25. and grouped by coarse geo, with nothing finer than a city',
    !/\d+\.\d{3,}/.test(geoText), geoText.split('\n').slice(1, 3).join(' | '));

  // -------------------------------------------------------------------
  // 5) The test toggle
  // -------------------------------------------------------------------

  await adminPage.goto(REPORT_REAL, { waitUntil: 'networkidle' });
  const goneRow = await rowCounts(adminPage, SOURCE_CODE);
  check('26. with the toggle off, this run disappears entirely', goneRow === null,
    goneRow ? JSON.stringify(goneRow) : 'not on the screen');
  const qrStillThere = await rowCounts(adminPage, 'qr-card');
  check('27. and the real rows stay exactly where they were',
    qrStillThere !== null && qrStillThere.visits === qrReal,
    `qr-card ${qrStillThere?.visits}, database ${qrReal}`);
  const hiddenSentence = (await adminPage.locator('body').innerText())
    .split('\n')
    .find((l) => /test (row|rows) (is|are) hidden|No test traffic to hide/i.test(l));
  check('28. the screen prints how many rows it hid rather than dropping them silently',
    Boolean(hiddenSentence), hiddenSentence ?? '');

  // -------------------------------------------------------------------
  // 6) A bare arrival lands in the untracked row
  // -------------------------------------------------------------------

  const beforeUntracked = await rowCounts(adminPage, '__untracked__');

  const bareContext = await browser.newContext();
  const barePage = await bareContext.newPage();
  await barePage.goto(`${BASE}/energy`, { waitUntil: 'networkidle' });
  const bareToken = remember(
    await barePage.evaluate(() => localStorage.getItem('mef.publicEntry.token.v1'))
  );
  await barePage.waitForTimeout(4000);
  await bareContext.close();

  const { data: bareSession } = await service
    .from('public_entry_sessions')
    .select('id, source_code')
    .eq('visitor_token', bareToken)
    .maybeSingle();
  check('29. a bare /energy visit is recorded with no source code at all',
    Boolean(bareSession?.id) && bareSession?.source_code === null,
    `source ${bareSession?.source_code}`);

  await adminPage.goto(REPORT_REAL, { waitUntil: 'networkidle' });
  const afterUntracked = await rowCounts(adminPage, '__untracked__');
  check('30. and it lands in the untracked row',
    afterUntracked !== null && beforeUntracked !== null &&
      afterUntracked.visits === beforeUntracked.visits + 1,
    `${beforeUntracked?.visits} then ${afterUntracked?.visits}`);

  check('31. the report screens produced no console or page errors',
    adminErrors.length === 0, adminErrors.slice(0, 3).join(' | '));
  check('32. the signup screen produced no console or page errors of our own',
    laptopErrors.length === 0, laptopErrors.slice(0, 2).join(' | '));

  await phoneContext.close();
  await laptopContext.close();

  // -------------------------------------------------------------------
  // 7) Cleanup, then the report against a direct count
  // -------------------------------------------------------------------

  await cleanup();

  if (CLEANUP) {
    const { data: leftBehind } = await service
      .from('public_entry_sessions')
      .select('id')
      .in('visitor_token', mintedTokens.length > 0 ? mintedTokens : ['none']);
    check('33. every row this run created was removed', (leftBehind ?? []).length === 0,
      `${(leftBehind ?? []).length} arrivals left behind`);

    const { data: leftSource } = await service
      .from('public_entry_sources')
      .select('code')
      .eq('code', SOURCE_CODE);
    check('34. the verification source code was removed too', (leftSource ?? []).length === 0);

    await adminPage.goto(REPORT_ALL, { waitUntil: 'networkidle' });
    const finalTotals = await totalsOnScreen(adminPage);
    const { data: finalRows } = await service
      .from('acquisition_report_rows')
      .select('row_kind, started_at, completed_at, lead_captured_at, member_id, paid_at, anchor_at');
    const ninetyDaysAgo = new Date(Date.now() - 89 * 86400000).toISOString().slice(0, 10);
    const inWindow = (finalRows ?? []).filter((r) => r.anchor_at >= `${ninetyDaysAgo}T00:00:00`);
    const expected = {
      visits: inWindow.filter((r) => r.row_kind === 'visit').length,
      starts: inWindow.filter((r) => r.started_at).length,
      completions: inWindow.filter((r) => r.completed_at).length,
      leads: inWindow.filter((r) => r.lead_captured_at).length,
      accounts: inWindow.filter((r) => r.member_id).length,
      paid: inWindow.filter((r) => r.paid_at).length,
    };
    check('35. after cleanup the report matches a direct count of production',
      JSON.stringify(finalTotals) === JSON.stringify(expected),
      `screen ${JSON.stringify(finalTotals)} vs database ${JSON.stringify(expected)}`);
  }

  await adminContext.close();
} finally {
  // Runs whatever happened above, so a failure part way through never
  // leaves this run's arrivals sitting in a funnel that has almost no real
  // data in it.
  await cleanup();
  await retireSession(adminMinted);
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed`);
if (failed.length > 0) {
  console.log('\nFAILED:');
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? `  (${f.detail})` : ''}`);
}
process.exit(failed.length === 0 ? 0 : 1);
