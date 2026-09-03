/**
 * Live verification of acquisition attribution, end to end, on production.
 *
 * WHAT IT DRIVES, IN ORDER.
 *   1. The real admin link builder, in a real browser, on a real minted
 *      administrator session. It fills the form, reads the URL the screen
 *      generated, and checks it is formed the way a link has to be formed.
 *   2. That exact generated URL, walked all the way through the nine
 *      questions as an anonymous stranger.
 *   3. The email step, and the lead's own copy of the attribution.
 *   4. An account created from that lead, flagged is_test before anything
 *      else happens, and the account's own copy with its original times.
 *   5. A bare /energy with no parameters at all, which must still work and
 *      must be stored as an untracked arrival.
 *   6. A refresh and the back control mid-walk on the tracked run, which
 *      must leave the first touch exactly where it was.
 *   7. An ad click id appended to the same link, which is what a platform
 *      does to a link somebody paid it to show.
 *
 * BOT PROTECTION IS NOT WORKED AROUND. It is live on the auth forms by
 * design, so this run does not touch them: the administrator's session is
 * minted the standing way and the test account is created through the Auth
 * Admin API. Every session is retired with scope 'local' at the end.
 *
 * Required env, all as file PATHS so nothing secret reaches a command line:
 *   PROD_SUPABASE_URL, PROD_SERVICE_KEY_FILE, PROD_ANON_KEY_FILE
 * Optional:
 *   BASE_URL     default https://app.mefwellness.com
 *   ADMIN_EMAIL  the platform administrator to drive the builder as
 *   CLEANUP      'false' to leave every row behind for inspection
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { mintSessionCookies, retireSession, canMintSessions } from './lib/mint-session.mjs';

const BASE = process.env.BASE_URL || 'https://app.mefwellness.com';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'oakomah66@gmail.com';
const CLEANUP = process.env.CLEANUP !== 'false';
const STAMP = Date.now();

const SOURCE_CODE = `verify-partner-${STAMP}`.slice(0, 40);
const PARTNER_NAME = 'Verify Partner';
const CAMPAIGN = 'verify_run';
const CREATIVE = 'card_a';
const MEDIUM = 'counter_card';
const LEAD_EMAIL = `qa.acquisition.${STAMP}@mefwellness-test.invalid`;
const FBCLID = 'VerifyFB.abc-123';

/**
 * Every visitor token this run mints, so cleanup can remove its own
 * arrivals by token rather than by source code.
 *
 * WHY BY TOKEN. The untracked run and the step that plants a token on the
 * member's browser both create arrivals with NO source code, so a cleanup
 * that deletes by source code leaves them behind, and they then show on the
 * funnel as real direct traffic. Found by reading production after the
 * first successful run: four of our own arrivals were sitting in a funnel
 * that has almost no real data in it.
 */
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
let memberMinted = null;
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

try {
  // -------------------------------------------------------------------
  // 1) The link builder, driven as a real administrator.
  // -------------------------------------------------------------------

  adminMinted = await mintSessionCookies(ADMIN_EMAIL, { baseUrl: BASE });
  if (!adminMinted) {
    console.error('could not mint an administrator session');
    process.exit(1);
  }
  const adminContext = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await adminContext.addCookies(adminMinted.cookies);
  const adminPage = await adminContext.newPage();
  const adminErrors = [];
  adminPage.on('pageerror', (e) => adminErrors.push(e.message));
  adminPage.on('console', (m) => { if (m.type() === 'error') adminErrors.push(m.text()); });

  await adminPage.goto(`${BASE}/admin/acquisition/links`, { waitUntil: 'networkidle' });
  const builderLoaded = await adminPage
    .getByRole('heading', { name: 'Tracking links' })
    .isVisible()
    .catch(() => false);
  check('1. the link builder opens for a real administrator', builderLoaded);

  await adminPage.fill('#partnerName', PARTNER_NAME);
  // The code is suggested from the name; this run needs a unique one so it
  // can be cleaned up without touching a real partner's code.
  await adminPage.fill('#sourceCode', SOURCE_CODE);
  await adminPage.fill('#medium', MEDIUM);
  await adminPage.fill('#campaign', CAMPAIGN);
  await adminPage.fill('#creative', CREATIVE);
  await adminPage.fill('#locationName', 'Verify Clinic, front desk');
  await adminPage.fill('#locationCity', 'Croydon');
  await adminPage.fill('#locationRegion', 'Greater London');
  await adminPage.fill('#locationCountry', 'GB');
  // Our own traffic, so nothing this run produces reaches a real number.
  await adminPage.locator('input[type="checkbox"]').first().check();

  const previewText = await adminPage.locator('text=/https:\\/\\/.*\\/energy\\//').first().innerText();
  check(
    '2. the screen previews the whole link before it is saved',
    previewText.includes(`/energy/${SOURCE_CODE}`) &&
      previewText.includes(`utm_campaign=${CAMPAIGN}`) &&
      previewText.includes(`utm_content=${CREATIVE}`),
    previewText
  );

  await adminPage.getByRole('button', { name: 'Create this link' }).click();
  await adminPage.waitForTimeout(4000);

  const { data: linkRow } = await service
    .from('public_entry_links')
    .select('*')
    .eq('source_code', SOURCE_CODE)
    .maybeSingle();
  check('3. the link was stored', Boolean(linkRow), linkRow?.url);

  const EXPECTED_URL = `${BASE}/energy/${SOURCE_CODE}?utm_source=${SOURCE_CODE}&utm_medium=${MEDIUM}&utm_campaign=${CAMPAIGN}&utm_content=${CREATIVE}`;
  check('4. the generated URL is formed correctly', linkRow?.url === EXPECTED_URL,
    `stored ${linkRow?.url}`);
  check('5. the preview and the stored URL are the same string',
    previewText.trim() === (linkRow?.url ?? ''), previewText.trim());

  const { data: sourceRow } = await service
    .from('public_entry_sources')
    .select('*')
    .eq('code', SOURCE_CODE)
    .maybeSingle();
  check('6. the same form wrote the partner and location mapping',
    sourceRow?.partner_name === PARTNER_NAME &&
      sourceRow?.location_name === 'Verify Clinic, front desk' &&
      sourceRow?.location_city === 'Croydon' &&
      sourceRow?.location_region === 'Greater London' &&
      sourceRow?.location_country === 'GB',
    JSON.stringify({
      partner: sourceRow?.partner_name,
      place: sourceRow?.location_name,
      city: sourceRow?.location_city,
      country: sourceRow?.location_country,
    }));
  check('7. the link is marked as our own testing traffic', sourceRow?.is_test === true);

  // The same link, typed a different way, must be refused rather than
  // becoming a second row for one partner.
  await adminPage.fill('#partnerName', PARTNER_NAME);
  await adminPage.fill('#sourceCode', SOURCE_CODE);
  await adminPage.fill('#medium', 'Counter Card');
  await adminPage.fill('#campaign', 'Verify Run');
  await adminPage.fill('#creative', 'Card A');
  await adminPage.getByRole('button', { name: 'Create this link' }).click();
  await adminPage.waitForTimeout(3000);
  const { data: allLinks } = await service
    .from('public_entry_links')
    .select('id')
    .eq('source_code', SOURCE_CODE);
  check('8. one partner cannot become two rows, however differently it is typed',
    (allLinks ?? []).length === 1, `${(allLinks ?? []).length} link rows`);

  // The regression this run found on 2026-09-03: a second submission for a
  // code that already exists, with the location fields blank, used to write
  // those blanks straight over the partner's recorded place.
  const { data: afterSecondSubmit } = await service
    .from('public_entry_sources')
    .select('location_name, location_city, location_country')
    .eq('code', SOURCE_CODE)
    .maybeSingle();
  check('8b. a blank location field did not erase the location already recorded',
    afterSecondSubmit?.location_name === 'Verify Clinic, front desk' &&
      afterSecondSubmit?.location_city === 'Croydon' &&
      afterSecondSubmit?.location_country === 'GB',
    JSON.stringify(afterSecondSubmit));

  check('9. the builder screen produced no console or page errors',
    adminErrors.length === 0, adminErrors.slice(0, 2).join(' | '));

  const listedUrl = await adminPage.locator(`text=${SOURCE_CODE}`).first().isVisible().catch(() => false);
  check('10. the new link is listed with its full address', listedUrl);

  // -------------------------------------------------------------------
  // 2) The generated URL, walked by an anonymous stranger.
  // -------------------------------------------------------------------

  const anonContext = await browser.newContext();
  const page = await anonContext.newPage();
  const anonErrors = [];
  page.on('pageerror', (e) => anonErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') anonErrors.push(m.text()); });

  await page.goto(EXPECTED_URL, { waitUntil: 'networkidle' });
  const visitorToken = remember(
    await page.evaluate(() => localStorage.getItem('mef.publicEntry.token.v1'))
  );
  check('11. the tracked arrival minted a visitor token', Boolean(visitorToken));

  await walkTheExperience(page);
  const resultBody = await page.locator('body').innerText();
  check('12. the tracked run reached a real result', resultBody.length > 400 &&
    /pattern|energy/i.test(resultBody));

  const { data: session } = await service
    .from('public_entry_sessions')
    .select('*')
    .eq('visitor_token', visitorToken)
    .maybeSingle();
  check('13. the arrival was stored against the new source code',
    session?.source_code === SOURCE_CODE, session?.source_code);

  const { data: firstTouch } = await service
    .from('public_entry_attribution')
    .select('*')
    .eq('session_id', session?.id)
    .eq('touch', 'first')
    .maybeSingle();

  check('14. every parameter on the link was captured',
    firstTouch?.utm_source === SOURCE_CODE &&
      firstTouch?.utm_medium === MEDIUM &&
      firstTouch?.utm_campaign === CAMPAIGN &&
      firstTouch?.utm_content === CREATIVE &&
      firstTouch?.source_code === SOURCE_CODE,
    JSON.stringify({
      source: firstTouch?.utm_source,
      medium: firstTouch?.utm_medium,
      campaign: firstTouch?.utm_campaign,
      content: firstTouch?.utm_content,
    }));
  check('15. the landing path and the landing time were captured',
    firstTouch?.landing_path === `/energy/${SOURCE_CODE}` && Boolean(firstTouch?.landed_at),
    `${firstTouch?.landing_path} at ${firstTouch?.landed_at}`);
  check('16. coarse request geo was read from the edge, no finer than a city',
    firstTouch !== null &&
      'geo_country' in firstTouch &&
      (firstTouch.geo_country === null || /^[A-Z]{2}$/.test(firstTouch.geo_country)),
    `${firstTouch?.geo_country ?? 'none'} / ${firstTouch?.geo_region ?? 'none'} / ${firstTouch?.geo_city ?? 'none'}`);
  check('17. the attribution row carries no answer, pattern or email',
    !('pattern_key' in (firstTouch ?? {})) &&
      !('email' in (firstTouch ?? {})) &&
      !('answer_value' in (firstTouch ?? {})),
    Object.keys(firstTouch ?? {}).join(','));
  check('18. the tracked walk produced no console or page errors',
    anonErrors.length === 0, anonErrors.slice(0, 2).join(' | '));

  // -------------------------------------------------------------------
  // 6) Refresh and back, mid-walk, on the tracked run.
  // -------------------------------------------------------------------

  const backContext = await browser.newContext();
  const backPage = await backContext.newPage();
  const backErrors = [];
  backPage.on('pageerror', (e) => backErrors.push(e.message));
  backPage.on('console', (m) => { if (m.type() === 'error') backErrors.push(m.text()); });

  await backPage.goto(EXPECTED_URL, { waitUntil: 'networkidle' });
  const backToken = remember(
    await backPage.evaluate(() => localStorage.getItem('mef.publicEntry.token.v1'))
  );
  await backPage.getByRole('button', { name: 'Begin' }).waitFor({ timeout: 40000 });
  await backPage.getByRole('button', { name: 'Begin' }).click();
  for (let q = 0; q < 3; q += 1) {
    const cont = backPage.getByRole('button', { name: 'Continue' });
    if (await cont.isVisible().catch(() => false)) await cont.click();
    const options = backPage.locator('[role="radio"]');
    await options.first().waitFor({ timeout: 40000 });
    await options.first().click();
    await backPage.waitForTimeout(400);
  }

  const { data: beforeRefresh } = await service
    .from('public_entry_attribution')
    .select('*')
    .eq('session_id', (await service.from('public_entry_sessions').select('id').eq('visitor_token', backToken).single()).data.id)
    .eq('touch', 'first')
    .single();

  // A refresh, landing on the BARE address, exactly as somebody returning
  // to the tab would.
  await backPage.goto(`${BASE}/energy`, { waitUntil: 'networkidle' });
  await backPage.waitForTimeout(3000);
  // And the back control, twice.
  await backPage.getByRole('button', { name: 'Begin' }).click().catch(() => {});
  await backPage.waitForTimeout(1500);
  const backControl = backPage.getByRole('button', { name: /back/i }).first();
  if (await backControl.isVisible().catch(() => false)) {
    await backControl.click();
    await backPage.waitForTimeout(1200);
  }

  const { data: backSession } = await service
    .from('public_entry_sessions')
    .select('id, source_code')
    .eq('visitor_token', backToken)
    .single();
  const { data: afterRefresh } = await service
    .from('public_entry_attribution')
    .select('*')
    .eq('session_id', backSession.id)
    .eq('touch', 'first')
    .single();

  check('19. attribution survived a refresh onto the bare address',
    afterRefresh.utm_campaign === CAMPAIGN && afterRefresh.source_code === SOURCE_CODE,
    `${afterRefresh.source_code} / ${afterRefresh.utm_campaign}`);
  check('20. the first touch was not rewritten by the second arrival',
    afterRefresh.landed_at === beforeRefresh.landed_at &&
      afterRefresh.utm_content === beforeRefresh.utm_content,
    `${beforeRefresh.landed_at} -> ${afterRefresh.landed_at}`);
  check('21. the session still names the partner who sent her',
    backSession.source_code === SOURCE_CODE, backSession.source_code);
  check('22. going back produced no console or page errors',
    backErrors.length === 0, backErrors.slice(0, 2).join(' | '));

  const { data: touches } = await service
    .from('public_entry_attribution')
    .select('touch')
    .eq('session_id', backSession.id);
  check('23. one arrival on one link is one attribution row, not a row per refresh',
    (touches ?? []).length === 1, (touches ?? []).map((t) => t.touch).join(','));

  // -------------------------------------------------------------------
  // 5) A bare arrival with no parameters at all.
  // -------------------------------------------------------------------

  const bareContext = await browser.newContext();
  const barePage = await bareContext.newPage();
  const bareErrors = [];
  barePage.on('pageerror', (e) => bareErrors.push(e.message));
  barePage.on('console', (m) => { if (m.type() === 'error') bareErrors.push(m.text()); });

  await barePage.goto(`${BASE}/energy`, { waitUntil: 'networkidle' });
  const bareToken = remember(
    await barePage.evaluate(() => localStorage.getItem('mef.publicEntry.token.v1'))
  );
  await walkTheExperience(barePage);
  const bareBody = await barePage.locator('body').innerText();
  check('24. the untracked run still works and reaches a result',
    bareBody.length > 400, `${bareBody.length} characters on screen`);

  const { data: bareSession } = await service
    .from('public_entry_sessions')
    .select('id, source_code, completed_at, pattern_key')
    .eq('visitor_token', bareToken)
    .maybeSingle();
  const { data: bareTouch } = await service
    .from('public_entry_attribution')
    .select('*')
    .eq('session_id', bareSession?.id)
    .eq('touch', 'first')
    .maybeSingle();
  check('25. the untracked arrival is stored, and stored as untracked',
    bareSession?.source_code === null &&
      bareTouch !== null &&
      bareTouch.utm_campaign === null &&
      bareTouch.source_code === null &&
      bareTouch.fbclid === null,
    JSON.stringify({ source: bareSession?.source_code, campaign: bareTouch?.utm_campaign }));
  check('26. the untracked arrival still finished normally',
    Boolean(bareSession?.completed_at) && Boolean(bareSession?.pattern_key),
    bareSession?.pattern_key);
  check('27. the untracked run produced no console or page errors',
    bareErrors.length === 0, bareErrors.slice(0, 2).join(' | '));

  // -------------------------------------------------------------------
  // 7) An ad click id, as a platform appends one.
  // -------------------------------------------------------------------

  const adContext = await browser.newContext();
  const adPage = await adContext.newPage();
  await adPage.goto(`${EXPECTED_URL}&fbclid=${FBCLID}`, { waitUntil: 'networkidle' });
  const adToken = remember(
    await adPage.evaluate(() => localStorage.getItem('mef.publicEntry.token.v1'))
  );
  await adPage.waitForTimeout(3000);
  const { data: adSession } = await service
    .from('public_entry_sessions')
    .select('id')
    .eq('visitor_token', adToken)
    .maybeSingle();
  const { data: adTouch } = await service
    .from('public_entry_attribution')
    .select('fbclid, ttclid, gclid, utm_campaign')
    .eq('session_id', adSession?.id)
    .eq('touch', 'first')
    .maybeSingle();
  check('28. an ad click id is captured exactly as the platform wrote it',
    adTouch?.fbclid === FBCLID && adTouch?.ttclid === null && adTouch?.gclid === null,
    `${adTouch?.fbclid}`);
  await adContext.close();

  // -------------------------------------------------------------------
  // 3) The email step, and the lead's own copy.
  // -------------------------------------------------------------------

  const emailField = page.locator('#energy-email');
  await emailField.scrollIntoViewIfNeeded();
  await emailField.waitFor({ timeout: 30000 });
  await emailField.fill(LEAD_EMAIL);
  await page.getByRole('button', { name: 'Open my three day notes' }).click();
  await page.waitForTimeout(8000);

  const { data: leadSession } = await service
    .from('public_entry_sessions')
    .select('captured_lead_id, lead_captured_at, lead_email')
    .eq('visitor_token', visitorToken)
    .maybeSingle();
  check('29. the email step created a lead', Boolean(leadSession?.captured_lead_id),
    leadSession?.lead_email);

  const { data: leadAttribution } = await service
    .from('captured_lead_acquisition')
    .select('*')
    .eq('captured_lead_id', leadSession?.captured_lead_id)
    .maybeSingle();
  check('30. the lead carries every parameter the link carried',
    leadAttribution?.utm_source === SOURCE_CODE &&
      leadAttribution?.utm_medium === MEDIUM &&
      leadAttribution?.utm_campaign === CAMPAIGN &&
      leadAttribution?.utm_content === CREATIVE &&
      leadAttribution?.source_code === SOURCE_CODE,
    JSON.stringify({
      source: leadAttribution?.utm_source,
      campaign: leadAttribution?.utm_campaign,
      content: leadAttribution?.utm_content,
    }));
  check('31. the lead carries the ORIGINAL landing time, not the time she left her email',
    leadAttribution?.landed_at === firstTouch?.landed_at &&
      leadAttribution?.lead_captured_at !== firstTouch?.landed_at,
    `landed ${leadAttribution?.landed_at}, email ${leadAttribution?.lead_captured_at}`);
  check('32. the lead carries the geo the arrival carried',
    leadAttribution?.geo_country === firstTouch?.geo_country &&
      leadAttribution?.geo_city === firstTouch?.geo_city,
    `${leadAttribution?.geo_country ?? 'none'} / ${leadAttribution?.geo_city ?? 'none'}`);

  const { data: mapping } = await service
    .from('public_entry_sources')
    .select('partner_name, location_name, location_city, location_country')
    .eq('code', leadAttribution?.source_code)
    .maybeSingle();
  check('33. the lead resolves to the partner and the physical place',
    mapping?.partner_name === PARTNER_NAME && mapping?.location_name === 'Verify Clinic, front desk',
    `${mapping?.partner_name} at ${mapping?.location_name}, ${mapping?.location_city}, ${mapping?.location_country}`);

  // -------------------------------------------------------------------
  // 4) An account created from that lead.
  // -------------------------------------------------------------------

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: LEAD_EMAIL,
    password: `Qa!${STAMP}aA`,
    email_confirm: true,
  });
  if (createError || !created?.user?.id) {
    console.error('could not create the test account:', createError?.message);
    process.exit(1);
  }
  memberId = created.user.id;
  check('34. the account created is the one we asked for', created.user.email === LEAD_EMAIL,
    LEAD_EMAIL);

  await service.from('profiles').update({ is_test: true }).eq('id', memberId);
  const { data: profileRow } = await service
    .from('profiles')
    .select('is_test')
    .eq('id', memberId)
    .maybeSingle();
  check('35. the account is flagged is_test before anything else happens',
    profileRow?.is_test === true);

  memberMinted = await mintSessionCookies(LEAD_EMAIL, { baseUrl: BASE });
  const memberContext = await browser.newContext();
  await memberContext.addCookies(memberMinted.cookies);
  const memberPage = await memberContext.newPage();
  const memberErrors = [];
  memberPage.on('pageerror', (e) => memberErrors.push(e.message));
  memberPage.on('console', (m) => { if (m.type() === 'error') memberErrors.push(m.text()); });

  // The browser that took the experience is the browser that signs up.
  // Loading /energy at all mints a token of its own before we overwrite it,
  // which creates one more untracked arrival. Remembered so cleanup takes
  // it away again.
  await memberPage.goto(`${BASE}/energy`, { waitUntil: 'domcontentloaded' });
  await memberPage.waitForTimeout(2500);
  remember(await memberPage.evaluate(() => localStorage.getItem('mef.publicEntry.token.v1')));
  await memberPage.evaluate((t) => localStorage.setItem('mef.publicEntry.token.v1', t), visitorToken);
  await memberPage.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await memberPage.waitForTimeout(8000);

  const { data: acquisition } = await service
    .from('user_acquisition')
    .select('*')
    .eq('member_id', memberId)
    .maybeSingle();

  check('36. the acquisition attribution attached to the account', Boolean(acquisition));
  check('37. it carries every parameter from the original link',
    acquisition?.utm_source === SOURCE_CODE &&
      acquisition?.utm_medium === MEDIUM &&
      acquisition?.utm_campaign === CAMPAIGN &&
      acquisition?.utm_content === CREATIVE &&
      acquisition?.source_code === SOURCE_CODE,
    JSON.stringify({ campaign: acquisition?.utm_campaign, content: acquisition?.utm_content }));
  check('38. it carries the ORIGINAL landing time, not the time she signed up',
    acquisition?.landed_at === firstTouch?.landed_at, `${acquisition?.landed_at}`);
  check('39. it carries the original lead time too',
    acquisition?.lead_captured_at === leadSession?.lead_captured_at,
    `${acquisition?.lead_captured_at}`);
  check('40. it points at the lead and the arrival it came from',
    acquisition?.captured_lead_id === leadSession?.captured_lead_id &&
      acquisition?.session_id === session?.id);
  check('41. it declares itself a public acquisition arrival and can be nothing else',
    acquisition?.origin === 'public_acquisition', acquisition?.origin);

  const { error: overwriteError } = await service
    .from('user_acquisition')
    .update({ source_code: 'ig', utm_campaign: 'something_else' })
    .eq('member_id', memberId);
  check('42. the account attribution refuses to be overwritten', Boolean(overwriteError),
    overwriteError?.message?.slice(0, 60));

  const { data: stillThere } = await service
    .from('user_acquisition')
    .select('source_code, utm_campaign')
    .eq('member_id', memberId)
    .maybeSingle();
  check('43. and it still says what it always said',
    stillThere?.source_code === SOURCE_CODE && stillThere?.utm_campaign === CAMPAIGN,
    `${stillThere?.source_code} / ${stillThere?.utm_campaign}`);

  const { data: checkins } = await service.from('daily_checkins').select('id').eq('user_id', memberId);
  const { data: submissions } = await service
    .from('onboarding_submissions')
    .select('id')
    .eq('user_id', memberId);
  check('44. no public answer became a check-in', (checkins ?? []).length === 0);
  check('45. no public answer became an onboarding submission', (submissions ?? []).length === 0);
  check('46. the signed-in pages produced no console or page errors',
    memberErrors.length === 0, memberErrors.slice(0, 2).join(' | '));

  // -------------------------------------------------------------------
  // The funnel screen still reads correctly, and still hides our traffic.
  // -------------------------------------------------------------------

  await adminPage.goto(`${BASE}/admin/acquisition`, { waitUntil: 'networkidle' });
  const funnelBody = await adminPage.locator('body').innerText();
  check('47. the funnel screen loads and says how many test arrivals it hid',
    /test (arrival|arrivals)/i.test(funnelBody) || /No test traffic to hide/i.test(funnelBody),
    funnelBody.split('\n').find((l) => /test/i.test(l)) ?? '');
  // Scoped to the by-source TABLE. The links list further down deliberately
  // shows every registered source, test ones included and badged, because a
  // test link is still a link somebody may need to copy. The NUMBERS are
  // what must exclude us.
  const bySourceTable = (await adminPage.locator('table').first().innerText().catch(() => '')) || '';
  check('48. our verification traffic is not in the real numbers',
    !bySourceTable.includes(PARTNER_NAME) && !bySourceTable.includes(SOURCE_CODE),
    `by-source table is ${bySourceTable.length} characters and names neither`);

  const { data: funnelRow } = await service
    .from('public_entry_funnel')
    .select('utm_campaign, utm_content, geo_country, partner_name, location_name, is_test')
    .eq('session_id', session?.id)
    .maybeSingle();
  check('49. the funnel view carries the attribution and the physical place',
    funnelRow?.utm_campaign === CAMPAIGN &&
      funnelRow?.utm_content === CREATIVE &&
      funnelRow?.partner_name === PARTNER_NAME &&
      funnelRow?.location_name === 'Verify Clinic, front desk' &&
      funnelRow?.is_test === true,
    JSON.stringify(funnelRow));

  await anonContext.close();
  await backContext.close();
  await bareContext.close();
  await memberContext.close();
  await adminContext.close();
} finally {
  // -------------------------------------------------------------------
  // Cleanup: every row this run created, and every session it minted.
  // -------------------------------------------------------------------
  if (CLEANUP) {
    if (memberId) {
      await service.from('user_acquisition').delete().eq('member_id', memberId);
      await service.from('member_public_entry_origin').delete().eq('member_id', memberId);
      await service.from('member_wellness_events').delete().eq('member_id', memberId);
      await service.auth.admin.deleteUser(memberId).catch(() => {});
    }
    const { data: leads } = await service.from('captured_leads').select('id, conversation_id').eq('email', LEAD_EMAIL);
    for (const lead of leads ?? []) {
      await service.from('captured_lead_acquisition').delete().eq('captured_lead_id', lead.id);
      await service.from('notifications').delete().eq('source_record_id', lead.id);
      await service.from('captured_leads').delete().eq('id', lead.id);
      await service.from('lead_conversations').delete().eq('id', lead.conversation_id);
    }
    await service.from('public_entry_links').delete().eq('source_code', SOURCE_CODE);

    // By source code AND by every token this run minted. The second half is
    // what removes our own untracked arrivals, which carry no source code
    // and would otherwise read as real direct traffic.
    const { data: codedSessions } = await service
      .from('public_entry_sessions')
      .select('id')
      .eq('source_code', SOURCE_CODE);
    for (const row of codedSessions ?? []) {
      await service.from('public_entry_sessions').delete().eq('id', row.id);
    }
    for (const token of mintedTokens) {
      await service.from('public_entry_sessions').delete().eq('visitor_token', token);
    }
    await service.from('public_entry_sources').delete().eq('code', SOURCE_CODE);

    const { data: leftBehind } = await service
      .from('public_entry_sessions')
      .select('id')
      .in('visitor_token', mintedTokens.length > 0 ? mintedTokens : ['none']);
    console.log(
      `\ncleanup: verification rows removed, ${(leftBehind ?? []).length} of this run's arrivals left behind`
    );
  }

  await retireSession(adminMinted);
  await retireSession(memberMinted);
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed`);
if (failed.length > 0) {
  console.log('\nFAILED:');
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? `  (${f.detail})` : ''}`);
}
process.exit(failed.length === 0 ? 0 : 1);
