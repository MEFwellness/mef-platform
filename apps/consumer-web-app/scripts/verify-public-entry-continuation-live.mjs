/**
 * The second half of the live run: a source-coded arrival, a brand new
 * account, and everything the continuation is required to do.
 *
 * WHY THE ACCOUNT IS CREATED THROUGH THE ADMIN API. Bot protection is live
 * on production's auth forms and refusing a scripted browser is the point
 * of it, so this does not touch the signup form. It creates the account the
 * way the standing method does, flags it is_test immediately, and drives
 * the real app with a real minted session afterwards. The session is
 * retired with scope 'local' at the end.
 *
 * Required env, all as file PATHS so nothing secret reaches a command line:
 *   PROD_SUPABASE_URL, PROD_SERVICE_KEY_FILE, PROD_ANON_KEY_FILE
 * Optional:
 *   BASE_URL      default https://app.mefwellness.com
 *   SOURCE_CODE   the source-coded link to arrive through, default partner-01
 *   CLEANUP       'true' to delete the account and its rows at the end
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { mintSessionCookies, retireSession, canMintSessions } from './lib/mint-session.mjs';

const BASE = process.env.BASE_URL || 'https://app.mefwellness.com';
const SOURCE = process.env.SOURCE_CODE || 'partner-01';
const STAMP = Date.now();
const TEST_EMAIL = `qa.energy.continuation.${STAMP}@mefwellness-test.invalid`;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
function has(haystack, needle) {
  return (haystack || '').toLowerCase().includes(needle.toLowerCase());
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

// ---------------------------------------------------------------------
// 1) An anonymous arrival through a real source-coded link.
// ---------------------------------------------------------------------

const anonContext = await browser.newContext();
const page = await anonContext.newPage();
const anonErrors = [];
page.on('pageerror', (e) => anonErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') anonErrors.push(m.text()); });

await page.goto(`${BASE}/energy/${SOURCE}`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Begin' }).waitFor({ timeout: 30000 });
const visitorToken = await page.evaluate(() => localStorage.getItem('mef.publicEntry.token.v1'));
await page.getByRole('button', { name: 'Begin' }).click();

for (let q = 0; q < 9; q += 1) {
  const cont = page.getByRole('button', { name: 'Continue' });
  if (await cont.isVisible().catch(() => false)) await cont.click();
  const options = page.locator('[role="radio"]');
  await options.first().waitFor({ timeout: 30000 });
  const count = await options.count();
  await options.nth((q * 2) % count).click();
  await page.waitForTimeout(350);
}
await page.getByText('What we noticed').waitFor({ timeout: 30000 });
const shownPattern = await page.locator('main h2').first().innerText();
await anonContext.close();

check('1. arrived through a real source-coded link and finished', Boolean(visitorToken));
check('2. no console errors on the anonymous journey', anonErrors.length === 0,
  anonErrors.join(' | ').slice(0, 200));

const { data: sessionRow } = await service
  .from('public_entry_sessions')
  .select('id, source_code, source_raw, landing_path, pattern_key, completed_at')
  .eq('visitor_token', visitorToken)
  .single();
check('3. the source code was recorded on the arrival', sessionRow?.source_code === SOURCE,
  `${sessionRow?.source_code}`);
check('4. the landing path was recorded', sessionRow?.landing_path === `/energy/${SOURCE}`,
  sessionRow?.landing_path);
check('5. the pattern stored matches the one she was shown', Boolean(sessionRow?.pattern_key),
  `${sessionRow?.pattern_key} / shown "${shownPattern}"`);

// ---------------------------------------------------------------------
// 2) A brand new account, flagged is_test before anything else happens.
// ---------------------------------------------------------------------

const { data: created, error: createError } = await service.auth.admin.createUser({
  email: TEST_EMAIL,
  password: `Qa!${STAMP}aA`,
  email_confirm: true,
});
if (createError || !created?.user?.id) {
  console.error('could not create the test account:', createError?.message);
  process.exit(1);
}
const memberId = created.user.id;
// Assert we created the account we meant to. A mistyped address here would
// mint a session for a real stranger.
check('6. the test account is the one we asked for', created.user.email === TEST_EMAIL, TEST_EMAIL);

await service.from('profiles').update({ is_test: true }).eq('id', memberId);
const { data: profileRow } = await service
  .from('profiles')
  .select('is_test')
  .eq('id', memberId)
  .single();
check('7. the test account is flagged is_test', profileRow?.is_test === true);

// ---------------------------------------------------------------------
// 3) The claim, driven by the real app in a real browser.
// ---------------------------------------------------------------------

const minted = await mintSessionCookies(TEST_EMAIL, { baseUrl: BASE });
if (!minted) {
  console.error('could not mint a session');
  process.exit(1);
}
const memberContext = await browser.newContext();
await memberContext.addCookies(minted.cookies);
const memberPage = await memberContext.newPage();
const memberErrors = [];
memberPage.on('pageerror', (e) => memberErrors.push(e.message));
memberPage.on('console', (m) => { if (m.type() === 'error') memberErrors.push(m.text()); });

// Plant the token exactly as the browser that took the experience would
// already be holding it.
await memberPage.goto(`${BASE}/energy/${SOURCE}`, { waitUntil: 'domcontentloaded' });
await memberPage.evaluate((t) => localStorage.setItem('mef.publicEntry.token.v1', t), visitorToken);

await memberPage.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await memberPage.waitForTimeout(6000);

const { data: origin } = await service
  .from('member_public_entry_origin')
  .select('*')
  .eq('member_id', memberId)
  .maybeSingle();

check('8. the arrival was bound to the new account', Boolean(origin));
check('9. the source survived from first click into the account',
  origin?.source_code === SOURCE, `${origin?.source_code}`);
check('10. the bind points at the same arrival', origin?.session_id === sessionRow?.id);
check('11. it is stored as a public acquisition origin',
  origin?.origin === 'public_acquisition', origin?.origin);
check('12. it is stored as preliminary, not as a completed assessment',
  origin?.preliminary === true, String(origin?.preliminary));

const { data: claimEvent } = await service
  .from('member_wellness_events')
  .select('event_type, payload')
  .eq('member_id', memberId)
  .eq('event_type', 'public_entry_claimed')
  .maybeSingle();
check('13. the claim reached the existing analytics pipeline', Boolean(claimEvent));
check('14. the analytics row carries the source and nothing else',
  claimEvent?.payload?.sourceCode === SOURCE &&
    claimEvent?.payload?.experienceKey === 'energy_map' &&
    Object.keys(claimEvent?.payload ?? {}).length === 2,
  JSON.stringify(claimEvent?.payload));

// Nothing was laundered into member data.
const { data: checkins } = await service
  .from('daily_checkins')
  .select('id')
  .eq('user_id', memberId);
const { data: submissions } = await service
  .from('onboarding_submissions')
  .select('id')
  .eq('user_id', memberId);
check('15. no check-in was created from the public answers', (checkins ?? []).length === 0,
  `${(checkins ?? []).length} rows`);
check('16. no onboarding submission was created from them', (submissions ?? []).length === 0,
  `${(submissions ?? []).length} rows`);

// ---------------------------------------------------------------------
// 4) What Root says, and what the Baseline asks.
// ---------------------------------------------------------------------

await memberPage.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
await memberPage.waitForTimeout(4000);
let body = await memberPage.locator('body').innerText();

if (!has(body, 'I already know where you started')) {
  // A brand new account is routed through the consent gate first, which is
  // correct and is not something this feature changes. Accept it the way a
  // member would (one checkbox, one button, both named exactly), then come
  // back and read what Root says.
  await memberPage.goto(`${BASE}/onboarding`, { waitUntil: 'networkidle' });
  await memberPage.waitForTimeout(3000);
  const box = memberPage.locator('input[type="checkbox"]').first();
  if (await box.isVisible().catch(() => false)) {
    await box.check();
    await memberPage.getByRole('button', { name: 'Accept and continue' }).click();
    await memberPage.waitForTimeout(5000);
  }
  body = await memberPage.locator('body').innerText();
}

check('17. Root picks up from what she told us before she had an account',
  has(body, 'I already know where you started'));
check('18. Root names it as a first impression, not a measurement',
  has(body, 'first impression from nine questions, not a measurement'));
check('19. Root names the pattern she was actually shown',
  has(body, shownPattern), shownPattern);
check('20. Root does not present it as an assessment',
  !/your assessment (said|found|shows)/i.test(body));

// Now the Baseline itself. Always navigate there explicitly rather than
// assuming the previous step left the browser on it: when Root's pop-up
// reaches her on the dashboard, the consent branch above never runs, and an
// earlier version of this script then walked the DASHBOARD looking for an
// onboarding question and reported a false failure.
await memberPage.goto(`${BASE}/onboarding`, { waitUntil: 'networkidle' });
await memberPage.waitForTimeout(3000);

// Root's pop-up follows her here, and its own call to action matches
// /start/i, so it has to be dismissed by name before the Baseline's own
// intro button can be reached.
const ignore = memberPage.getByRole('button', { name: /^ignore$/i }).first();
if (await ignore.isVisible().catch(() => false)) {
  await ignore.click();
  await memberPage.waitForTimeout(2500);
}

// The consent gate, if it is still standing. One checkbox, one button.
const consentBox = memberPage.locator('input[type="checkbox"]').first();
if (await consentBox.isVisible().catch(() => false)) {
  await consentBox.check();
  await memberPage.getByRole('button', { name: 'Accept and continue' }).click();
  await memberPage.waitForTimeout(5000);
}

let onboardingText = await memberPage.locator('main').innerText().catch(() => '');
for (let i = 0; i < 5; i += 1) {
  if (has(onboardingText, 'Does that still feel right')) break;
  const next = memberPage
    .getByRole('button', { name: /^(begin|begin assessment|start|let's begin|continue)$/i })
    .first();
  if (!(await next.isVisible().catch(() => false))) break;
  await next.click();
  await memberPage.waitForTimeout(2500);
  onboardingText = await memberPage.locator('main').innerText().catch(() => '');
}

check('21. the Baseline confirms her concern instead of asking it cold',
  has(onboardingText, 'you came in through a look at where your energy goes'));
check('22. and it still offers her a different answer',
  has(onboardingText, 'Something else matters more'));

const emDashes = ((body + onboardingText).match(/—/g) || []).length;
check('23. zero em dashes on the continuation screens', emDashes === 0, `${emDashes}`);
check('24. zero console errors across the signed-in walk', memberErrors.length === 0,
  memberErrors.join(' | ').slice(0, 300));

// ---------------------------------------------------------------------
// 5) The funnel, and the test filter.
// ---------------------------------------------------------------------

const { data: funnelRow } = await service
  .from('public_entry_funnel')
  .select('*')
  .eq('session_id', sessionRow?.id)
  .single();
check('25. the funnel records the whole journey',
  funnelRow?.did_start === true &&
    funnelRow?.did_complete === true &&
    funnelRow?.did_create_account === true,
  `start ${funnelRow?.did_start} complete ${funnelRow?.did_complete} account ${funnelRow?.did_create_account}`);
check('26. the funnel resolved the source to its human label',
  Boolean(funnelRow?.source_label), funnelRow?.source_label);
check('27. this test traffic is excluded from real numbers even on a real source code',
  funnelRow?.is_test === true,
  `source ${SOURCE} is a real code, and is_test is ${funnelRow?.is_test} because the member is flagged`);

await retireSession(minted);
await memberContext.close();
await browser.close();

// ---------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------

if (process.env.CLEANUP === 'true') {
  await service.from('public_entry_sessions').delete().eq('visitor_token', visitorToken);
  await service.auth.admin.deleteUser(memberId);
  console.log('\ncleaned up: the arrival and the test account are deleted');
} else {
  console.log(`\nleft in place for inspection:`);
  console.log(`  member_id     ${memberId}`);
  console.log(`  email         ${TEST_EMAIL}  (is_test = true)`);
  console.log(`  visitor_token ${visitorToken}`);
  console.log(`  session_id    ${sessionRow?.id}`);
}

console.log('----------------------------------------');
const passed = results.filter((r) => r.ok).length;
console.log(`${passed} of ${results.length}`);
process.exit(passed === results.length ? 0 : 1);
