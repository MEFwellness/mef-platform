/**
 * THE SIGNUP LINK, DRIVEN ON THE LIVE SITE (Prompt 6B).
 *
 * WHAT THIS PROVES, AND WHERE THE HONEST BOUNDARY IS.
 *
 * MINTING AND CARRYING are proved through the deployed site itself: a real
 * browser at app.mefwellness.com/energy, nine questions, the result screen,
 * the create-account button tapped, and the reference read back off the
 * real signup form. The reference is minted by the deployed route handler
 * in production, into the production database.
 *
 * REDEEMING lives inside the signup Server Action, and that action can only
 * be reached by submitting the real signup form, which Turnstile refuses to
 * a script BY DESIGN (see CLAUDE.md). There is no HTTP endpoint that
 * redeems, and one is not being invented for a test. So redemption is
 * driven by running the shipped redeem function itself against the
 * PRODUCTION database, on real production rows, covering every case the
 * brief asks for. That is stated plainly rather than dressed up as an
 * end-to-end submit.
 *
 * THE BROWSER TOKEN ROUTE, which the precedence stage needs, IS driven
 * through its real deployed claim route with a real session cookie, exactly
 * as the day 8 run did it.
 *
 * ACCOUNTS AND ROWS. Every account and arrival this run creates is deleted
 * at the end. Nothing else in production is written to.
 *
 * STAGES:  housekeeping  mint  bind  precedence  email  cleanup  all
 *
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   BASE_URL=https://app.mefwellness.com npx tsx scripts/verify-quiz-signup-link-live.mts all
 */
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
// @ts-expect-error the shared minting helper is plain JavaScript, by design
import { mintSessionCookies, retireSession } from './lib/mint-session.mjs';
import {
  bindArrivalFromSignupRef,
  hashSignupRef,
  mintSignupRef,
  redeemSignupRef,
} from '../lib/public-entry/signupRef';
import { getMemberOrigin, getSessionByToken } from '../lib/public-entry/data';
import { TRIAL_ARC_LAUNCH } from '../lib/trial-arc/config';

const BASE = process.env.BASE_URL || 'https://app.mefwellness.com';
const PHONE = { width: 393, height: 852 };
const STAGE = process.argv[2] || 'all';
const QUIZTEST2 = 'oakomah66+quiztest2@gmail.com';

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
const createdSessionTokens: string[] = [];

function isRealConsoleError(text: string): boolean {
  return !/^%c%d\s+font-size:0/.test(text.trim());
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data } = await service.auth.admin.listUsers({ page, perPage: 200 });
    const hit = (data?.users ?? []).find((u) => (u.email ?? '').toLowerCase() === target);
    if (hit) return hit.id;
    if ((data?.users ?? []).length < 200) return null;
  }
  return null;
}

async function createTempUser(email: string): Promise<string> {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: `Live-${Date.now()}-Aa1!`,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser(${email}) failed: ${error.message}`);
  const id = data.user?.id;
  // generateLink and createUser both CREATE for an address that does not
  // exist, so the id is asserted rather than assumed.
  if (!id) throw new Error(`createUser(${email}) returned no id`);
  createdUserIds.push(id);
  return id;
}

type QuizRun = {
  token: string | null;
  sessionId: string | null;
  completed: boolean;
  consoleErrors: string[];
  navigatedUrls: string[];
  signup: {
    reached: boolean;
    url: string;
    urlCleaned: boolean;
    carriedInUrl: string | null;
    hiddenRef: string | null;
    carriesArrival: string | null;
    turnstile: number;
  } | null;
};

/**
 * The whole signed-out walk, in a real browser on the live site. `clickCta`
 * follows the create-account button and reads the signup form back.
 */
async function driveQuiz(clickCta = false, leadEmail: string | null = null): Promise<QuizRun> {
  const consoleErrors: string[] = [];
  const navigatedUrls: string[] = [];
  const context: BrowserContext = await browser.newContext({ viewport: PHONE });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' && isRealConsoleError(m.text())) consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  // The URL as the browser was ASKED for it, before the signup screen's own
  // effect strips the reference out of the address bar.
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigatedUrls.push(frame.url());
  });

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
    if (token) createdSessionTokens.push(token);

    let sessionId: string | null = null;
    let completed = false;
    if (token) {
      const { data } = await service
        .from('public_entry_sessions')
        .select('id, completed_at')
        .eq('visitor_token', token)
        .maybeSingle();
      const row = data as { id: string; completed_at: string | null } | null;
      sessionId = row?.id ?? null;
      completed = Boolean(row?.completed_at);
    }

    if (leadEmail && completed) {
      const field = page.locator('input[type="email"]:visible').first();
      if (await field.count()) {
        await field.fill(leadEmail);
        const send = page.locator('form button:visible').filter({ hasText: /send|email|three|get/i }).first();
        if (await send.count()) await send.click().catch(() => {});
        else await field.press('Enter').catch(() => {});
        await page.waitForTimeout(3000);
      }
    }

    let signup: QuizRun['signup'] = null;
    if (clickCta) {
      const cta = page
        .locator('button:visible, a:visible')
        .filter({ hasText: /create a free account/i })
        .first();
      if (await cta.count()) {
        await cta.scrollIntoViewIfNeeded().catch(() => {});
        await cta.click({ timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(6000);
        const carried = navigatedUrls.find((u) => u.includes('/signup') && u.includes('k='));
        signup = {
          reached: page.url().includes('/signup'),
          url: page.url(),
          urlCleaned: !page.url().includes('k='),
          carriedInUrl: carried ? new URL(carried).searchParams.get('k') : null,
          hiddenRef: await page
            .locator('input[name="publicEntryRef"]')
            .getAttribute('value')
            .catch(() => null),
          carriesArrival: await page
            .locator('input[name="publicEntryArrival"]')
            .getAttribute('value')
            .catch(() => null),
          // Cloudflare's own script does not draw its iframe for a headless
          // browser at all, which is the block working. What IS always in
          // the markup when the gate is armed is its container and its
          // hidden response field, and an empty response field is exactly
          // why a scripted submission cannot succeed.
          turnstile: await page.locator('.cf-turnstile, input[name="cf-turnstile-response"]').count(),
        };
      } else {
        signup = {
          reached: false,
          url: page.url(),
          urlCleaned: false,
          carriedInUrl: null,
          hiddenRef: null,
          carriesArrival: null,
          turnstile: 0,
        };
      }
    }

    return { token, sessionId, completed, consoleErrors, navigatedUrls, signup };
  } finally {
    await context.close();
  }
}

/** Loads a page with this member's real session and this browser's token in localStorage, so the deployed claim route fires for real. */
async function firePublicEntryClaim(email: string, id: string, token: string): Promise<void> {
  const minted = await mintSessionCookies(email, { baseUrl: BASE });
  if (!minted) throw new Error(`could not mint a session for ${email}`);
  if (minted.session.user.id !== id) {
    throw new Error(`minted session belongs to ${minted.session.user.id}, not ${id}`);
  }
  const context = await browser.newContext({ viewport: PHONE });
  await context.addCookies(minted.cookies);
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}/help`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      window.localStorage.setItem('mef.publicEntry.token.v1', t);
      window.localStorage.removeItem('mef.publicEntry.claimed.v1');
    }, token);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
  } finally {
    await context.close();
    await retireSession(minted);
  }
}

// =====================================================================
// STAGE: housekeeping
// =====================================================================

async function stageHousekeeping() {
  console.log('\n--- Housekeeping: the second real-phone test account ---\n');
  const id = await findUserIdByEmail(QUIZTEST2);
  check('the quiztest2 account exists on production', Boolean(id), String(id));
  if (!id) return;

  const { data } = await service.from('profiles').select('is_test, created_at').eq('id', id).maybeSingle();
  const row = data as { is_test: boolean; created_at: string } | null;
  check('it is flagged is_test, so it can never reach a staff screen or a funnel number', row?.is_test === true, String(row?.is_test));
  note(`created ${row?.created_at}`);

  const origin = await getMemberOrigin(service, id);
  check(
    'it still has NO bound arrival, which is the gap this build closes and not a regression',
    origin === null,
    origin ? `${origin.sessionId} via ${origin.bindMethod}` : 'none'
  );
  const { data: acq } = await service.from('user_acquisition').select('member_id').eq('member_id', id).maybeSingle();
  note(`user_acquisition row: ${acq ? 'present' : 'none'}`);
}

// =====================================================================
// STAGE: mint and carry, on the live site
// =====================================================================

let mintedRef: string | null = null;
let mintedSessionId: string | null = null;

async function stageMint() {
  console.log('\n--- The real path, signed out, in a real browser on the live site ---\n');
  const run = await driveQuiz(true);

  check('the signed-out quiz at /energy runs and mints its own visitor token', Boolean(run.token), run.token ?? 'none');
  check('nine questions finished, and the arrival is genuinely marked complete', run.completed, String(run.sessionId));
  check('no console error anywhere in the quiz or on the signup screen', run.consoleErrors.length === 0, run.consoleErrors.slice(0, 2).join(' | '));
  mintedSessionId = run.sessionId;

  if (run.sessionId) {
    const { data } = await service
      .from('public_entry_signup_refs')
      .select('id, ref_hash, issued_at, expires_at, used_at')
      .eq('session_id', run.sessionId);
    const rows = (data ?? []) as { ref_hash: string; issued_at: string; expires_at: string; used_at: string | null }[];
    check('the deployed server minted a reference for this finished arrival', rows.length === 1, `${rows.length} rows`);
    if (rows[0]) {
      const hours = (new Date(rows[0].expires_at).getTime() - new Date(rows[0].issued_at).getTime()) / 3_600_000;
      check('it expires 24 hours after it was issued', Math.round(hours) === 24, `${hours.toFixed(1)}h`);
      check('it is unspent until somebody signs up with it', rows[0].used_at === null, String(rows[0].used_at));
      check('only a hash is stored, never the reference itself', /^[0-9a-f]{64}$/.test(rows[0].ref_hash), rows[0].ref_hash.slice(0, 12));
    }
  }

  const seen = run.signup;
  check('the result screen offers the create-account button, and it was tapped', Boolean(seen), '');
  if (!seen) return;

  check('it lands on the real signup form', seen.reached, seen.url);
  check('the button carried a reference in the URL it navigated to', Boolean(seen.carriedInUrl), seen.carriedInUrl ? `${seen.carriedInUrl.length} chars` : 'none');
  check('the signup form is holding that same reference in its own field', Boolean(seen.hiddenRef) && seen.hiddenRef === seen.carriedInUrl, seen.hiddenRef ? `${seen.hiddenRef.slice(0, 8)}...` : 'none');
  check('and the address bar has been cleaned, so the one-time value is not left sitting in it', seen.urlCleaned, seen.url);
  check('the form still says only YES or NO about the token, and never the token itself', seen.carriesArrival === 'yes', String(seen.carriesArrival));
  check('Turnstile is armed on this form, which refuses a scripted submission BY DESIGN', seen.turnstile > 0, `${seen.turnstile} gate elements`);
  note('So the form is filled and read but never submitted. That is the boundary, not a defect.');

  if (seen.hiddenRef && run.sessionId) {
    const { data } = await service
      .from('public_entry_signup_refs')
      .select('session_id')
      .eq('ref_hash', hashSignupRef(seen.hiddenRef))
      .maybeSingle();
    check(
      'the reference on the form is the one the server issued for THIS arrival',
      (data as { session_id: string } | null)?.session_id === run.sessionId,
      String((data as { session_id: string } | null)?.session_id)
    );
    mintedRef = seen.hiddenRef;
  }
}

// =====================================================================
// STAGE: the bind, on production rows
// =====================================================================

async function stageBind() {
  console.log('\n--- The bind itself, on production, through the shipped redeem path ---\n');
  note('Redeeming lives inside the signup Server Action, which Turnstile refuses to a script.');
  note('So the shipped function is run against the production database, on real production rows.');

  const stamp = Date.now().toString(36);

  // 1. THE QUIZTEST2 SHAPE. A browser that took the quiz, and an account
  //    created somewhere that shares nothing with it.
  const fresh = await driveQuiz();
  check('a second signed-out arrival, in a browser context sharing nothing with the first', fresh.completed, String(fresh.sessionId));
  const refFresh = await mintSignupRef(service, fresh.sessionId!);
  const memberFresh = await createTempUser(`p6b.fresh.${stamp}@example.test`);
  const bound = await bindArrivalFromSignupRef(service, {
    memberId: memberFresh,
    ref: refFresh!,
    accountCreatedAt: new Date().toISOString(),
  });
  check('the reference binds her cleanly with no browser carrying anything', bound.bound && bound.outcome === 'bound', bound.outcome);
  const originFresh = await getMemberOrigin(service, memberFresh);
  check('and the arrival on her account is the one she actually finished', originFresh?.sessionId === fresh.sessionId, String(originFresh?.sessionId));
  check('recorded as signup_link, distinctly from browser_token and email_match', originFresh?.bindMethod === 'signup_link', String(originFresh?.bindMethod));
  check('and still a preliminary public impression, which the database refuses to restate', originFresh?.preliminary === true && originFresh?.origin === 'public_acquisition', `${originFresh?.origin}`);

  const { data: acqFresh } = await service
    .from('user_acquisition')
    .select('session_id')
    .eq('member_id', memberFresh)
    .maybeSingle();
  check('her attribution came across with the bind', (acqFresh as { session_id: string } | null)?.session_id === fresh.sessionId, String((acqFresh as { session_id: string } | null)?.session_id));

  // 2. SECOND USE OF THE SAME REFERENCE.
  const memberReplay = await createTempUser(`p6b.replay.${stamp}@example.test`);
  const replay = await redeemSignupRef(service, { memberId: memberReplay, ref: refFresh! });
  check('the same reference used a second time binds nothing', !replay.bound && replay.outcome === 'used', replay.outcome);
  check('and the second account is left with no arrival at all', (await getMemberOrigin(service, memberReplay)) === null, '');

  // 3. AN EXPIRED REFERENCE.
  const stale = await driveQuiz();
  const refStale = await mintSignupRef(service, stale.sessionId!);
  await service
    .from('public_entry_signup_refs')
    .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
    .eq('ref_hash', hashSignupRef(refStale!));
  const memberStale = await createTempUser(`p6b.stale.${stamp}@example.test`);
  const expired = await redeemSignupRef(service, { memberId: memberStale, ref: refStale! });
  check('an expired reference binds nothing', !expired.bound && expired.outcome === 'expired', expired.outcome);
  check('and is not silently spent either', (await unspent(refStale!)) === true, '');

  // 4. A FORGED REFERENCE.
  const memberForged = await createTempUser(`p6b.forged.${stamp}@example.test`);
  const forged = await redeemSignupRef(service, { memberId: memberForged, ref: 'Z'.repeat(43) });
  check('a forged reference binds nothing and errors quietly', !forged.bound && forged.outcome === 'not_found', forged.outcome);
  const junk = await redeemSignupRef(service, { memberId: memberForged, ref: 'nope' });
  check('a malformed one is refused before any query is made', !junk.bound && junk.outcome === 'invalid', junk.outcome);
  check('neither left the account with anything', (await getMemberOrigin(service, memberForged)) === null, '');

  // 5. A REFERENCE TO AN ALREADY-CLAIMED ARRIVAL.
  const contested = await driveQuiz();
  const ownerId = await createTempUser(`p6b.owner.${stamp}@example.test`);
  await firePublicEntryClaim(`p6b.owner.${stamp}@example.test`, ownerId, contested.token!);
  const ownerOrigin = await getMemberOrigin(service, ownerId);
  check('a real browser holding the token claims that arrival through the deployed claim route', ownerOrigin?.sessionId === contested.sessionId, String(ownerOrigin?.bindMethod));

  const refContested = await mintSignupRef(service, contested.sessionId!);
  const loserId = await createTempUser(`p6b.loser.${stamp}@example.test`);
  const lost = await redeemSignupRef(service, { memberId: loserId, ref: refContested! });
  check('a reference to it loses, finally, with nothing left to retry', !lost.bound && lost.outcome === 'session_taken', lost.outcome);
  check('the loser is bound to nothing rather than to somebody else s arrival', (await getMemberOrigin(service, loserId)) === null, '');
  const stillOwner = await getMemberOrigin(service, ownerId);
  check('and the arrival still belongs to whoever got there first', stillOwner?.bindMethod === 'browser_token', String(stillOwner?.bindMethod));
}

async function unspent(ref: string): Promise<boolean> {
  const { data } = await service
    .from('public_entry_signup_refs')
    .select('used_at')
    .eq('ref_hash', hashSignupRef(ref))
    .maybeSingle();
  return (data as { used_at: string | null } | null)?.used_at === null;
}

// =====================================================================
// STAGE: precedence
// =====================================================================

async function stagePrecedence() {
  console.log('\n--- Precedence: the browser token still wins when both are in play ---\n');
  const stamp = Date.now().toString(36);

  const run = await driveQuiz();
  const email = `p6b.both.${stamp}@example.test`;
  const memberId = await createTempUser(email);
  const ref = await mintSignupRef(service, run.sessionId!);

  // The deployed claim route gets there first, exactly as it does for a
  // member who signs in in the browser that took the quiz.
  await firePublicEntryClaim(email, memberId, run.token!);
  const first = await getMemberOrigin(service, memberId);
  check('the deployed browser-token claim binds her first', first?.bindMethod === 'browser_token', String(first?.bindMethod));

  const after = await redeemSignupRef(service, { memberId, ref: ref! });
  check('the reference then binds nothing, because she already has an arrival', !after.bound && after.outcome === 'member_already_bound', after.outcome);
  const settled = await getMemberOrigin(service, memberId);
  check('and it is not downgraded: her bind is still browser_token', settled?.bindMethod === 'browser_token', String(settled?.bindMethod));
  check('nor re-pointed at a different arrival', settled?.sessionId === first?.sessionId, String(settled?.sessionId));
  check('the reference was not even burned on a member it could never bind', (await unspent(ref!)) === true, '');
}

// =====================================================================
// STAGE: the email match, unchanged
// =====================================================================

async function stageEmail() {
  console.log('\n--- The Prompt 6 email match, still working unchanged ---\n');
  const stamp = Date.now().toString(36);
  const shared = `p6b.shared.${stamp}@example.test`;

  // One address, two arrivals, exactly as the day 8 run drove it: the first
  // gets claimed by somebody else, so the browser path is a dead end and
  // the address is the only join left.
  const arrivalA = await driveQuiz(false, shared);
  const arrivalB = await driveQuiz(false, shared);
  check('two real arrivals, both carrying the same address from the email step', Boolean(arrivalA.sessionId && arrivalB.sessionId), `${arrivalA.sessionId} / ${arrivalB.sessionId}`);

  const ownerEmail = `p6b.emailowner.${stamp}@example.test`;
  const ownerId = await createTempUser(ownerEmail);
  await firePublicEntryClaim(ownerEmail, ownerId, arrivalA.token!);
  check('the first arrival is claimed by another account', (await getMemberOrigin(service, ownerId))?.sessionId === arrivalA.sessionId, '');

  // Her own account, in a browser holding the taken token. The deployed
  // claim route must report the loss and settle by address instead.
  const herId = await createTempUser(shared);
  await firePublicEntryClaim(shared, herId, arrivalA.token!);
  const hers = await getMemberOrigin(service, herId);
  check('she is still joined to the arrival she really took, by address', hers?.sessionId === arrivalB.sessionId, String(hers?.sessionId));
  check('and it is marked email_match, the weaker of the joins', hers?.bindMethod === 'email_match', String(hers?.bindMethod));
}

// =====================================================================
// STAGE: cleanup
// =====================================================================

async function stageCleanup() {
  console.log('\n--- Cleanup ---\n');

  // The ACCOUNTS go first now, deliberately. Until migration 209 a member
  // who had spent a reference could not be deleted at all: the reference
  // row's `on delete set null` left it half redeemed and its own check
  // constraint refused, and GoTrue reported that as an unreadable 5xx. So
  // deleting the accounts while their references still stand is the check,
  // not an accident of ordering.
  let deletedUsers = 0;
  const deleteErrors: string[] = [];
  for (const id of createdUserIds) {
    const { error } = await service.auth.admin.deleteUser(id, false);
    if (!error) deletedUsers += 1;
    else deleteErrors.push(`${id}: ${error.message}`);
  }
  check(
    'every temporary account is deleted, including the ones that SPENT a reference',
    deletedUsers === createdUserIds.length,
    deleteErrors.length ? deleteErrors.join(' | ') : `${deletedUsers}/${createdUserIds.length}`
  );

  // EVERY ARRIVAL, AND THE LEAD CHAIN UNDER IT.
  //
  // An arrival that captured a lead cannot simply be deleted. Its lead
  // carries a `captured_lead_acquisition` row whose session_id is
  // `on delete set null`, and that table refuses EVERY update by trigger
  // (migration 200's write-once rule), so deleting the arrival trips it.
  // Unwinding the lead first is the supported order, and it is what leaves
  // production genuinely as it was found rather than nearly.
  const failures: string[] = [];
  let deletedSessions = 0;
  for (const token of createdSessionTokens) {
    const session = await getSessionByToken(service, token);
    if (!session) continue;
    if (session.capturedLeadId) {
      const { data: lead } = await service
        .from('captured_leads')
        .select('conversation_id')
        .eq('id', session.capturedLeadId)
        .maybeSingle();
      // captured_lead_acquisition cascades from the lead.
      await service.from('captured_leads').delete().eq('id', session.capturedLeadId);
      const conversationId = (lead as { conversation_id: string | null } | null)?.conversation_id;
      if (conversationId) await service.from('lead_conversations').delete().eq('id', conversationId);
    }
    // The refs, the answers, the events and the attribution all cascade
    // from the arrival itself.
    const { error } = await service.from('public_entry_sessions').delete().eq('id', session.id);
    if (error) failures.push(`${session.id}: ${error.message}`);
    else deletedSessions += 1;
  }
  check(
    'every temporary arrival this run created is deleted, lead chain and all',
    failures.length === 0,
    failures.length ? failures.join(' | ') : `${deletedSessions} removed`
  );

  // And anything an earlier run of any of these scripts left behind. No
  // real visitor uses example.test.
  const { data: strays } = await service
    .from('public_entry_sessions')
    .select('id, captured_lead_id')
    .ilike('lead_email', '%@example.test');
  const strayRows = (strays ?? []) as { id: string; captured_lead_id: string | null }[];
  for (const row of strayRows) {
    if (row.captured_lead_id) {
      const { data: lead } = await service
        .from('captured_leads')
        .select('conversation_id')
        .eq('id', row.captured_lead_id)
        .maybeSingle();
      await service.from('captured_leads').delete().eq('id', row.captured_lead_id);
      const conversationId = (lead as { conversation_id: string | null } | null)?.conversation_id;
      if (conversationId) await service.from('lead_conversations').delete().eq('id', conversationId);
    }
    await service.from('public_entry_sessions').delete().eq('id', row.id);
  }
  const { data: stillStray } = await service
    .from('public_entry_sessions')
    .select('id')
    .ilike('lead_email', '%@example.test');
  check(
    'and no test-address arrival is left anywhere in production, from this run or an earlier one',
    (stillStray ?? []).length === 0,
    `${strayRows.length} swept, ${(stillStray ?? []).length} remaining`
  );

  const leftoverUsers: string[] = [];
  for (const id of createdUserIds) {
    if (await stillExists(id)) leftoverUsers.push(id);
  }
  check('no temporary account is left behind', leftoverUsers.length === 0, leftoverUsers.join(', '));

  const { data: refsLeft } = await service.from('public_entry_signup_refs').select('id');
  check(
    'no reference row is left behind anywhere, so the table is back to empty',
    (refsLeft ?? []).length === 0,
    `${(refsLeft ?? []).length} rows`
  );

  // The arc is launched as of prompt 7. What this run cares about is that
  // its own throwaway accounts left nothing behind, not the switch.
  check('the trial arc launch date is set and parseable', TRIAL_ARC_LAUNCH !== null, String(TRIAL_ARC_LAUNCH));

  const quiztest2 = await findUserIdByEmail(QUIZTEST2);
  if (quiztest2) {
    const { data } = await service.from('profiles').select('is_test').eq('id', quiztest2).maybeSingle();
    check('and quiztest2 is still flagged is_test', (data as { is_test: boolean } | null)?.is_test === true, '');
  }
}

async function stillExists(id: string): Promise<boolean> {
  const { data } = await service.auth.admin.getUserById(id);
  return Boolean(data?.user?.id);
}

// =====================================================================

async function main() {
  browser = await chromium.launch();
  try {
    if (STAGE === 'housekeeping' || STAGE === 'all') await stageHousekeeping();
    if (STAGE === 'mint' || STAGE === 'all') await stageMint();
    if (STAGE === 'bind' || STAGE === 'all') await stageBind();
    if (STAGE === 'precedence' || STAGE === 'all') await stagePrecedence();
    if (STAGE === 'email' || STAGE === 'all') await stageEmail();
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
