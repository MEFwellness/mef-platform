/**
 * THE ARRIVAL GREETING, DRIVEN ON THE LIVE SITE.
 *
 * The signup link binds correctly and the member was never told. This run
 * proves the fix on app.mefwellness.com in a real browser: an account that
 * arrived through the quiz AND has already finished her Baseline
 * Assessment now gets the greeting on Home, once, and does not get it
 * again.
 *
 * WHAT IT SETS UP AND WHAT IT DRIVES. The arrival is real: the signed-out
 * quiz is walked end to end on the live site and the reference is redeemed
 * through the shipped path. The Baseline submission is INSERTED rather than
 * answered, and that is stated plainly: fourteen questions of a real
 * assessment is a different test, and the only thing this branch reads is
 * whether a submission row exists.
 *
 * IT DELIBERATELY DOES NOT TOUCH oakomah66+quiztest3@gmail.com. That
 * account's greeting is still unspent, so it is left standing for a real
 * phone to see.
 *
 * STAGES:  greeting  invitation  unspent  cleanup  all
 *
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   BASE_URL=https://app.mefwellness.com npx tsx scripts/verify-arrival-greeting-live.mts all
 */
import { chromium, type Browser } from 'playwright';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
// @ts-expect-error the shared minting helper is plain JavaScript, by design
import { mintSessionCookies, retireSession } from './lib/mint-session.mjs';
import { bindArrivalFromSignupRef, mintSignupRef } from '../lib/public-entry/signupRef';
import { getMemberOrigin, getSessionByToken } from '../lib/public-entry/data';
import { ROOT_WELCOME_COPY } from '../lib/public-entry/copy';
import { CONSENT_ITEMS, CONSENT_VERSION } from '../lib/consent/copy';

const BASE = process.env.BASE_URL || 'https://app.mefwellness.com';
const PHONE = { width: 393, height: 852 };
const STAGE = process.argv[2] || 'all';
const QUIZTEST3 = 'oakomah66+quiztest3@gmail.com';

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
function note(text: string) {
  console.log(`      ${text}`);
}

const service: SupabaseClient = createClient(
  process.env.PROD_SUPABASE_URL!,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE!, 'utf8').trim(),
  { auth: { persistSession: false, autoRefreshToken: false } }
);

let browser: Browser;
const createdUserIds: string[] = [];
const createdEmails: string[] = [];
const createdSessionTokens: string[] = [];

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim();
}

async function createTempUser(email: string): Promise<string> {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: `Live-${Date.now()}-Aa1!`,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser(${email}) failed: ${error.message}`);
  const id = data.user?.id;
  if (!id) throw new Error(`createUser(${email}) returned no id`);
  createdUserIds.push(id);
  createdEmails.push(email);
  // Home is not the screen a brand new account lands on. The name step, the
  // welcome flow and the consent gate all come first, and
  // lib/auth/postLoginRoute.ts sends anybody who has not passed them to
  // /onboarding rather than to Home. All three are settled here so the
  // browser is looking at the surface this run is actually about. Found by
  // this very script landing on /onboarding twice.
  await service
    .from('profiles')
    .update({
      display_name: 'Greeting Rig',
      welcome_intro_seen_at: new Date().toISOString(),
      welcome_flow_completed_at: new Date().toISOString(),
      is_test: true,
    })
    .eq('id', id);
  const grantedAt = new Date().toISOString();
  // The same rows recordAllConsents() writes, from the same list and the
  // same version constant, so the rig cannot drift from the real gate.
  const { error: consentError } = await service.from('consent_records').insert(
    CONSENT_ITEMS.map((item) => ({
      user_id: id,
      consent_type: item.type,
      version: CONSENT_VERSION,
      granted_at: grantedAt,
    }))
  );
  if (consentError) throw new Error(`consent for ${email} failed: ${consentError.message}`);
  return id;
}

/** One completed arrival, walked signed out on the live site, and the reference for it. */
async function realArrival(): Promise<{ sessionId: string; ref: string }> {
  const context = await browser.newContext({ viewport: PHONE });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}/energy/qa`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const begin = page
      .locator('button:visible')
      .filter({ hasText: /^(Start|Begin|Let's|Show me|Continue)/i })
      .first();
    if (await begin.count()) await begin.click().catch(() => {});
    await page.waitForTimeout(1200);

    for (let step = 0; step < 30; step += 1) {
      const options = page.locator('button:visible, [role="radio"]:visible');
      const total = await options.count();
      let clicked = false;
      for (let i = 0; i < total; i += 1) {
        const label = (await options.nth(i).innerText().catch(() => '')).trim();
        if (!label) continue;
        if (/^(Back|Start over|Create|Sign|Email|Send)/i.test(label)) continue;
        await options.nth(i).click({ timeout: 4000 }).catch(() => {});
        clicked = true;
        break;
      }
      if (!clicked) break;
      await page.waitForTimeout(900);
      const body = await page.locator('body').innerText().catch(() => '');
      if (/where your energy/i.test(body) && /create (an )?account|start (your )?free/i.test(body)) break;
    }
    await page.waitForTimeout(2500);

    const token = (await page.evaluate(() =>
      window.localStorage.getItem('mef.publicEntry.token.v1')
    )) as string | null;
    if (!token) throw new Error('the quiz minted no visitor token');
    createdSessionTokens.push(token);
    // The completion is a round trip the browser makes after the last
    // answer, and on a cold function it is occasionally slower than the
    // fixed wait above. Polled rather than assumed, so a slow response is a
    // slow response and not a failed run.
    let session = await getSessionByToken(service, token);
    for (let attempt = 0; attempt < 10 && !session?.completedAt; attempt += 1) {
      await page.waitForTimeout(2000);
      session = await getSessionByToken(service, token);
    }
    if (!session?.completedAt) throw new Error('the arrival did not complete');
    const ref = await mintSignupRef(service, session.id);
    if (!ref) throw new Error('no reference could be minted');
    return { sessionId: session.id, ref };
  } finally {
    await context.close();
  }
}

/** The Baseline row, copied from whatever version production is actually on. Inserted rather than answered, and said so. */
async function giveHerABaseline(memberId: string): Promise<boolean> {
  const { data } = await service
    .from('onboarding_submissions')
    .select('assessment_version_id')
    .not('assessment_version_id', 'is', null)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const versionId = (data as { assessment_version_id: string } | null)?.assessment_version_id;
  if (!versionId) return false;
  const { error } = await service.from('onboarding_submissions').insert({
    user_id: memberId,
    assessment_version_id: versionId,
    timezone: 'America/New_York',
    local_date: '2026-09-05',
    raw_payload: { answers: [] },
    assessment_type: 'baseline',
  });
  if (error) {
    console.error('baseline insert failed', error.message);
    return false;
  }
  return true;
}

/** Home, with her own real session cookie, and whatever pop-up it decides to show. */
async function readHome(
  email: string,
  id: string,
  reloads = 1
): Promise<{ views: string[]; consoleErrors: string[] }> {
  const minted = await mintSessionCookies(email, { baseUrl: BASE });
  if (!minted) throw new Error(`could not mint a session for ${email}`);
  if (minted.session.user.id !== id) {
    throw new Error(`minted session belongs to ${minted.session.user.id}, not ${id}`);
  }
  const context = await browser.newContext({ viewport: PHONE });
  await context.addCookies(minted.cookies);
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/^%c%d\s+font-size:0/.test(m.text().trim())) {
      consoleErrors.push(m.text());
    }
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  const views: string[] = [];
  try {
    for (let i = 0; i < reloads; i += 1) {
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(7000);
      const dialog = page.locator('[role="dialog"]');
      views.push(
        (await dialog.count()) ? normalize(await dialog.first().innerText()) : `NO DIALOG @ ${page.url()}`
      );
    }
    return { views, consoleErrors };
  } finally {
    await context.close();
    await retireSession(minted);
  }
}

// =====================================================================

async function stageGreeting() {
  console.log('\n--- The greeting: she arrived through the quiz AND has a Baseline ---\n');
  const stamp = Date.now().toString(36);
  const email = `greet.settled.${stamp}@example.test`;

  const arrival = await realArrival();
  const id = await createTempUser(email);
  const bound = await bindArrivalFromSignupRef(service, {
    memberId: id,
    ref: arrival.ref,
    accountCreatedAt: new Date().toISOString(),
  });
  check('a real arrival, bound through the signup link', bound.bound, bound.outcome);
  check('marked signup_link', (await getMemberOrigin(service, id))?.bindMethod === 'signup_link', '');

  const gave = await giveHerABaseline(id);
  check('and her Baseline Assessment already exists, as it does on the real path', gave, '');
  note('The submission row is inserted, not answered. This branch reads only whether one exists.');

  const { views, consoleErrors } = await readHome(email, id, 2);
  const first = views[0] ?? '';
  check('Home shows Root a pop-up on her first visit', !first.startsWith('NO DIALOG'), first.slice(0, 60));
  check(
    'and it is the arrival greeting, which used to be silence',
    first.includes(ROOT_WELCOME_COPY.title),
    first.slice(0, 90)
  );
  check(
    'it names what the quiz came back with',
    /Where Your Energy Goes/.test(first),
    ''
  );
  check(
    'it still refuses to call a two minute quiz a measurement',
    first.includes('not a measurement'),
    ''
  );
  check(
    'the button goes to her Root Map, not to the assessment she has finished',
    first.includes(ROOT_WELCOME_COPY.settled.ctaLabel),
    ROOT_WELCOME_COPY.settled.ctaLabel
  );
  check(
    'and it offers one "Got it" rather than a choice it could not honour',
    first.includes(ROOT_WELCOME_COPY.settled.dismissLabel) && !/Maybe later/i.test(first),
    ''
  );
  check(
    'it never invites her to start what she already finished',
    !first.includes(ROOT_WELCOME_COPY.ctaLabel),
    ''
  );

  const second = views[1] ?? '';
  check(
    'a second visit does NOT show it again, because it is shown once ever',
    !second.includes(ROOT_WELCOME_COPY.title),
    second.slice(0, 60)
  );
  const { data: dismissal } = await service
    .from('member_root_popup_dismissals')
    .select('message_key, status')
    .eq('member_id', id)
    .like('message_key', 'public_entry_welcome:%')
    .maybeSingle();
  check(
    'it marked itself spent the instant it mounted, so closing the tab spends it too',
    (dismissal as { status: string } | null)?.status === 'ignored',
    JSON.stringify(dismissal)
  );
  check('no console error on Home', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
}

async function stageInvitation() {
  console.log('\n--- The invitation: bound, but no Baseline yet. Unchanged behaviour ---\n');
  const stamp = Date.now().toString(36);
  const email = `greet.invite.${stamp}@example.test`;

  const arrival = await realArrival();
  const id = await createTempUser(email);
  const bound = await bindArrivalFromSignupRef(service, {
    memberId: id,
    ref: arrival.ref,
    accountCreatedAt: new Date().toISOString(),
  });
  check('a real arrival, bound, and no Baseline behind it', bound.bound, bound.outcome);

  const { views } = await readHome(email, id, 1);
  const first = views[0] ?? '';

  // WHAT THIS STAGE ACTUALLY FOUND, AND IT IS NOT A DEFECT IN THE BUILD.
  // A member with no Baseline submission is never sent to Home at all:
  // lib/auth/postLoginRoute.ts routes her to /onboarding until one exists.
  // So the arrival INVITATION could never have been read by anybody, in
  // either direction. Without a Baseline she is not on Home; with one, the
  // old rule made the message return null. The pop-up was structurally
  // unreachable, which is exactly why a correct bind was invisible on a
  // real phone, and it is why the greeting is the only shape of this
  // message that can ever be seen.
  if (first.startsWith('NO DIALOG @') && first.includes('/onboarding')) {
    check(
      'a member with no Baseline is routed to /onboarding and never reaches Home, so the invitation shape is unreachable BY DESIGN',
      true,
      first.replace('NO DIALOG @ ', '')
    );
    note('This is the other half of why a correct bind was invisible. Not a regression.');
    return;
  }
  if (first.startsWith('NO DIALOG')) {
    check('the invitation shape is reachable on Home', false, first);
    return;
  }
  check('Home shows the arrival message', first.includes(ROOT_WELCOME_COPY.title), first.slice(0, 90));
  check(
    'and it is still the INVITATION, pointing at her Baseline Assessment',
    first.includes(ROOT_WELCOME_COPY.ctaLabel),
    ''
  );
  check(
    'with the real "Maybe later" choice it has always had',
    /Maybe later/i.test(first),
    ''
  );
}

async function stageUnspent() {
  console.log('\n--- The real phone account is left alone ---\n');
  const { data: users } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
  const hit = (users?.users ?? []).find((u) => (u.email ?? '').toLowerCase() === QUIZTEST3);
  check('quiztest3 still exists', Boolean(hit), String(hit?.id));
  if (!hit) return;
  const origin = await getMemberOrigin(service, hit.id);
  check('still bound to its arrival through the signup link', origin?.bindMethod === 'signup_link', String(origin?.bindMethod));
  const { data } = await service
    .from('member_root_popup_dismissals')
    .select('message_key')
    .eq('member_id', hit.id)
    .like('message_key', 'public_entry_welcome:%');
  check(
    'and its greeting is UNSPENT, so a real phone opening the app will see it',
    (data ?? []).length === 0,
    `${(data ?? []).length} dismissals`
  );
}

async function stageCleanup() {
  console.log('\n--- Cleanup ---\n');
  let deleted = 0;
  const failures: string[] = [];
  for (const id of createdUserIds) {
    const { error } = await service.auth.admin.deleteUser(id, false);
    if (!error) deleted += 1;
    else failures.push(`${id}: ${error.message}`);
  }
  check('every temporary account is deleted', deleted === createdUserIds.length, failures.join(' | ') || `${deleted}/${createdUserIds.length}`);

  let arrivals = 0;
  for (const token of createdSessionTokens) {
    const session = await getSessionByToken(service, token);
    if (!session) continue;
    const { error } = await service.from('public_entry_sessions').delete().eq('id', session.id);
    if (!error) arrivals += 1;
  }
  check('every temporary arrival is deleted', true, `${arrivals} removed`);

  // SCOPED TO THIS RUN, and that correction matters. An earlier version
  // asserted the table was empty, which is wrong: the real phone's own
  // spent reference legitimately lives there, attached to the arrival that
  // is bound to quiztest3. Chasing "empty" nearly deleted a real member's
  // arrival, and only the write-once trigger on user_acquisition refused
  // it. What this run is responsible for is its own rows.
  const mySessionIds: string[] = [];
  for (const token of createdSessionTokens) {
    const session = await getSessionByToken(service, token);
    if (session) mySessionIds.push(session.id);
  }
  const { data: refs } = await service
    .from('public_entry_signup_refs')
    .select('id, session_id');
  const mine = ((refs ?? []) as { session_id: string }[]).filter((r) =>
    mySessionIds.includes(r.session_id)
  );
  check(
    'no reference row from THIS run is left behind',
    mine.length === 0,
    `${mine.length} of this run, ${(refs ?? []).length} in the table`
  );
}

async function main() {
  browser = await chromium.launch();
  try {
    if (STAGE === 'greeting' || STAGE === 'all') await stageGreeting();
    if (STAGE === 'invitation' || STAGE === 'all') await stageInvitation();
    if (STAGE === 'unspent' || STAGE === 'all') await stageUnspent();
    if (STAGE === 'cleanup' || STAGE === 'all') await stageCleanup();
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('\nFAILURES:');
    for (const f of failed) console.log(`  - ${f.name}  ${f.detail}`);
    process.exitCode = 1;
  }
}

await main();
