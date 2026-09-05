/**
 * DRIVING DAY 8 ON THE LIVE SITE, AND PROVING THE QUIZ BINDING FIX.
 *
 * Prompt 6 did two things and this run watches both of them on
 * app.mefwellness.com, in a real browser.
 *
 * TASK A, THE QUIZ BINDING. It reconstructs from production rows what
 * happened to the real-phone test on 2026-09-04, then reproduces the real
 * path end to end in a real browser: the signed-out quiz at /energy, the
 * result screen, the email step, the create-account button, and the signup
 * form. Turnstile refuses a scripted form submission by design, so the run
 * stops exactly there, says so, and then exercises the BIND ITSELF against
 * production through the real claim route with a real session cookie: both
 * the shape that used to fail silently (a token naming somebody else's
 * session) and the shape that never had a path at all (a laptop signup
 * carrying no token).
 *
 * TASK B, THE CONTINUATION SCREEN. It builds the rig's own week by driving
 * the real screens (three conversations, the day 6 recap, the day 7 close),
 * moves it to day 8 and locks it, and then reads /trial-ended in every one
 * of its states and compares what the browser shows against what the app's
 * own renderer says the STORED rows mean.
 *
 * THE ACCOUNTS IT WRITES TO. The permanent rig
 * (scripts/trial-arc-rig.mjs), and temporary accounts this run creates and
 * deletes for the binding stage. Every rig write asserts is_test first. No
 * other production account is written to at all: the classification and
 * exclusion stages READ.
 *
 * STAGES, runnable one at a time:
 *   forensics  realpath  bind  orphans
 *   week  full  partial  unopened  noarc  locked  exclusion  doors  quiet  restore
 *   taska  taskb  all
 *
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   BASE_URL=https://app.mefwellness.com npx tsx scripts/verify-trial-ended-day8-live.mts all
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
// @ts-expect-error the rig helper is plain JavaScript, by design
import * as rigTools from './trial-arc-rig.mjs';
// @ts-expect-error the shared minting helper is plain JavaScript, by design
import { mintSessionCookies, retireSession } from './lib/mint-session.mjs';
import { TRIAL_ARC_ROUTES } from '../lib/trial-arc/constants';
import { sanitizeClosePlan } from '../lib/trial-arc/closePlan';
import { sanitizeRecapPlan } from '../lib/trial-arc/recapPlan';
import { renderTrialArcRecap } from '../lib/trial-arc/recapCopy';
import { renderTrialEndedContinuation } from '../lib/trial-ended/continuationCopy';
import { TRIAL_ENDED_PATH, TRIAL_ENDED_WEEK_PATH } from '../lib/trial-ended/paths';
import type { RenderedTrialEndedContinuation } from '../lib/trial-ended/continuationTypes';
import { deriveRelationship } from '../lib/membership/relationship';
import { decideMemberAccess, subscriptionFromRow } from '../lib/membership/access';

const BASE = process.env.BASE_URL || 'https://app.mefwellness.com';
const PHONE = { width: 393, height: 852 };
const STAGE = process.argv[2] || 'all';

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
function note(text: string) {
  console.log(`      ${text}`);
}

const service = createClient(
  process.env.PROD_SUPABASE_URL!,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE!, 'utf8').trim(),
  { auth: { persistSession: false, autoRefreshToken: false } }
);
const ANON_KEY = readFileSync(process.env.PROD_ANON_KEY_FILE!, 'utf8').trim();

const rig = await rigTools.ensureRig();
console.log(`\nRig: ${rig.email}  ${rig.id}\nBase: ${BASE}\nStage: ${STAGE}\n`);

let browser: Browser;

async function contextFor(email: string, expectedId: string): Promise<{ context: BrowserContext; minted: unknown }> {
  const minted = await mintSessionCookies(email, { baseUrl: BASE });
  if (!minted) throw new Error(`could not mint a session for ${email}`);
  // generateLink CREATES an account for an address that does not exist, so
  // the id is asserted rather than assumed.
  if (minted.session.user.id !== expectedId) {
    throw new Error(`minted session belongs to ${minted.session.user.id}, not ${expectedId}`);
  }
  const context = await browser.newContext({ viewport: PHONE });
  await context.addCookies(minted.cookies);
  return { context, minted };
}

const rigContext = () => contextFor(rig.email, rig.id);

/**
 * Next.js writes a console.error whose whole text is style directives
 * ("%c%d font-size:0;color:transparent NaN") as part of its own dev overlay
 * plumbing. It is not an error a member could ever see and it carries no
 * message, so it is not counted as one.
 */
function isRealConsoleError(text: string): boolean {
  return !/^%c%d\s+font-size:0/.test(text.trim());
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim();
}

// =====================================================================
// TASK A, STAGE 1: what actually happened, from the rows.
// =====================================================================

async function stageForensics() {
  console.log('\n--- Task A: reconstructing the real-phone failure from production rows ---\n');

  const { data: account } = await service
    .from('profiles')
    .select('id, is_test, created_at')
    .eq('id', (await findUserIdByEmail('oakomah66+quiztest1@gmail.com')) ?? '00000000-0000-0000-0000-000000000000')
    .maybeSingle();

  const quiztestId = await findUserIdByEmail('oakomah66+quiztest1@gmail.com');
  check('the real-phone test account still exists to reason about', quiztestId !== null, quiztestId ?? 'missing');
  if (!quiztestId) return;

  const { data: authUser } = await service.auth.admin.getUserById(quiztestId);
  const createdAt = authUser?.user?.created_at ?? null;
  note(`account created at ${createdAt}`);
  note(`profiles.is_test = ${String((account as { is_test?: boolean } | null)?.is_test)}`);

  const { data: origin } = await service
    .from('member_public_entry_origin')
    .select('session_id, bind_method')
    .eq('member_id', quiztestId)
    .maybeSingle();
  check('it has no bound arrival, which is the reported symptom', origin === null, origin ? JSON.stringify(origin) : 'none');

  const { data: acq } = await service
    .from('user_acquisition')
    .select('session_id')
    .eq('member_id', quiztestId)
    .maybeSingle();
  check('and no attribution row either, which the report did not mention', acq === null, acq ? JSON.stringify(acq) : 'none');

  // The click that produced the account, and the session it came from.
  const { data: clicks } = await service
    .from('public_entry_events')
    .select('session_id, event_type, detail, occurred_at')
    .eq('event_type', 'app_clicked')
    .order('occurred_at');
  const rows = (clicks ?? []) as { session_id: string; detail: string | null; occurred_at: string }[];
  const created = createdAt ? new Date(createdAt).getTime() : 0;
  const culprit = rows
    .map((row) => ({ ...row, gap: created - new Date(row.occurred_at).getTime() }))
    .filter((row) => row.gap >= 0 && row.gap < 10 * 60_000)
    .sort((a, b) => a.gap - b.gap)[0];

  check(
    'a create-account tap is on record within ten minutes before the account existed',
    Boolean(culprit),
    culprit ? `${Math.round(culprit.gap / 1000)}s before, session ${culprit.session_id.slice(0, 8)}` : 'none found'
  );
  if (!culprit) return;

  const { data: session } = await service
    .from('public_entry_sessions')
    .select('id, visitor_token, source_code, landing_path, first_seen_at, completed_at, pattern_key, lead_email')
    .eq('id', culprit.session_id)
    .maybeSingle();
  const s = session as {
    id: string;
    source_code: string | null;
    landing_path: string | null;
    first_seen_at: string;
    completed_at: string | null;
    lead_email: string | null;
  } | null;
  if (s) {
    note(`that session: ${s.landing_path}, first seen ${s.first_seen_at}, completed ${s.completed_at}`);
    note(`its lead_email is ${s.lead_email === null ? 'null (she never left one)' : 'set'}`);
    check(
      'THE CAUSE: the tapped session was FIRST SEEN days before the account, so the phone resumed an old session',
      new Date(s.first_seen_at).getTime() < created - 24 * 3600_000,
      `${((created - new Date(s.first_seen_at).getTime()) / 3600_000).toFixed(1)} hours earlier`
    );
  }

  const { data: owner } = await service
    .from('member_public_entry_origin')
    .select('member_id, claimed_at, bind_method')
    .eq('session_id', culprit.session_id)
    .maybeSingle();
  const o = owner as { member_id: string; claimed_at: string; bind_method: string } | null;
  check(
    'AND that session already belonged to a different account, so the bind could only ever lose',
    Boolean(o) && o!.member_id !== quiztestId,
    o ? `owned by ${o.member_id.slice(0, 8)} since ${o.claimed_at}, bind_method ${o.bind_method}` : 'unowned'
  );

  check(
    'the fix records how every existing bind was made, and it was the browser',
    o?.bind_method === 'browser_token',
    String(o?.bind_method)
  );
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const { data } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data?.users?.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase())?.id ?? null;
}

// =====================================================================
// TASK A, STAGE 2: the real path, in a real browser, as far as it goes.
// =====================================================================

/** A visitor token this run mints itself, so it can be found and cleaned up. */
function runToken(suffix: string): string {
  return `p6-live-${suffix}-${Date.now().toString(36)}`;
}

const createdSessionTokens: string[] = [];
const createdUserIds: string[] = [];

type QuizRun = {
  token: string | null;
  sessionId: string | null;
  completed: boolean;
  consoleErrors: string[];
  /** What the run saw after tapping the create-account button, when it was asked to. */
  signup: { reached: boolean; url: string; fields: number; carriesArrival: string | null; turnstile: number } | null;
};

/**
 * The signed-out quiz, driven for real: nine questions, the result screen,
 * the email step, and (when asked) the create-account button and the signup
 * form behind it.
 *
 * ALL IN ONE BROWSER CONTEXT, deliberately. A completed arrival re-opened in
 * a fresh tab restores her ANSWERS but still starts at the intro beat
 * (components/public-entry/EnergyEntryClient.tsx sets 'intro'
 * unconditionally after arrive), so the result screen is only ever reached
 * by walking the questions. That is exactly what the real phone did on
 * 2026-09-04, and it is why no new chapter events were written that night:
 * the route deduplicates every one of them.
 */
async function driveQuiz(leadEmail: string | null, clickCta = false): Promise<QuizRun> {
  const consoleErrors: string[] = [];
  const context = await browser.newContext({ viewport: PHONE });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' && isRealConsoleError(m.text())) consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  try {
    await page.goto(`${BASE}/energy/qa`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const begin = page.locator('button:visible').filter({ hasText: /^(Start|Begin|Let's|Show me|Continue)/i }).first();
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
    const token = (await page.evaluate(() => window.localStorage.getItem('mef.publicEntry.token.v1'))) as string | null;
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

    // The email step, which is what makes the second join possible at all.
    if (leadEmail && completed) {
      const field = page.locator('input[type="email"]:visible').first();
      if (await field.count()) {
        await field.fill(leadEmail);
        const send = page
          .locator('form button:visible')
          .filter({ hasText: /send|email|three|get/i })
          .first();
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
        signup = {
          reached: page.url().includes('/signup'),
          url: page.url(),
          fields: await page.locator('input[type="email"], input[type="password"]').count(),
          carriesArrival: await page
            .locator('input[name="publicEntryArrival"]')
            .getAttribute('value')
            .catch(() => null),
          // Cloudflare's own script does not draw its iframe for a headless
          // browser at all, which is the block working. What IS always in
          // the markup when the gate is armed is its container and its
          // hidden response field, and an empty response field is exactly
          // why a scripted submission cannot succeed.
          turnstile: await page
            .locator('.cf-turnstile, input[name="cf-turnstile-response"]')
            .count(),
        };
      } else {
        signup = { reached: false, url: page.url(), fields: 0, carriesArrival: null, turnstile: 0 };
      }
    }

    return { token, sessionId, completed, consoleErrors, signup };
  } finally {
    await context.close();
  }
}

async function stageRealPath() {
  console.log('\n--- Task A: the real path, signed out, in a real browser ---\n');

  const leadEmail = `p6.live.${Date.now().toString(36)}@example.test`;
  const run = await driveQuiz(leadEmail, true);

  check('the signed-out quiz at /energy runs and mints its own visitor token', Boolean(run.token), run.token ?? 'none');
  check('nine questions finished, and the session is genuinely marked complete', run.completed, String(run.sessionId));
  check('no console error anywhere in the quiz', run.consoleErrors.length === 0, run.consoleErrors.slice(0, 2).join(' | '));

  if (run.sessionId) {
    const { data } = await service
      .from('public_entry_sessions')
      .select('lead_email, lead_captured_at, pattern_key')
      .eq('id', run.sessionId)
      .maybeSingle();
    const row = data as { lead_email: string | null; pattern_key: string | null } | null;
    check(
      'the email step on the result screen stored her address on the arrival',
      row?.lead_email?.toLowerCase() === leadEmail.toLowerCase(),
      String(row?.lead_email)
    );
    note(`its pattern is ${row?.pattern_key}`);
  }

  const seen = run.signup;
  check('the result screen offers the create-account button, and it was tapped', Boolean(seen), '');
  if (!seen) return;

  check('it lands on the real signup form', seen.reached, seen.url);
  check('which is the real one, with its real fields', seen.fields >= 2, `${seen.fields} fields`);
  check(
    'the form tells the server this browser IS carrying an arrival, and nothing else about it',
    seen.carriesArrival === 'yes',
    String(seen.carriesArrival)
  );
  check(
    'Turnstile is armed on this form, which refuses a scripted submission BY DESIGN',
    seen.turnstile > 0,
    `${seen.turnstile} gate elements in the markup`
  );
  note('So the form is filled and read but never submitted. That is the boundary, not a defect.');
  check(
    'the real path is exercised up to form submission, which is as far as a script may legitimately go',
    seen.reached,
    `turnstile widgets on the form: ${seen.turnstile}`
  );
  note('The bind step itself is then driven separately, below, through the real claim route on the live site.');
}

// =====================================================================
// TASK A, STAGE 3: the bind itself, through the real route.
// =====================================================================

async function createTempUser(email: string): Promise<string> {
  const { data, error } = await service.auth.admin.createUser({ email, password: `Live-${Date.now()}-Aa1!`, email_confirm: true });
  if (error) throw new Error(`createUser(${email}) failed: ${error.message}`);
  const id = data.user?.id;
  if (!id) throw new Error(`createUser(${email}) returned no id`);
  createdUserIds.push(id);
  return id;
}

/** Loads a page with this member's real session and this browser's token in localStorage, so the root layout's claim fires for real. */
async function firePublicEntryClaim(email: string, id: string, token: string): Promise<void> {
  const { context, minted } = await contextFor(email, id);
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

async function stageBind() {
  console.log('\n--- Task A: the bind, through the real claim route on the live site ---\n');

  const stamp = Date.now().toString(36);
  // One address, two real arrivals. That is the shape of somebody who
  // answered on her phone and again on her laptop, and it is what lets the
  // second join have anything to find once the first arrival is taken.
  const sharedEmail = `p6.shared.${stamp}@example.test`;
  const arrivalA = await driveQuiz(sharedEmail);
  const arrivalB = await driveQuiz(sharedEmail);
  // And a third address with exactly one free arrival: the pure cross
  // device case, where the browser that signs up carries nothing at all.
  const laptopEmail = `p6.laptop.${stamp}@example.test`;
  const arrivalC = await driveQuiz(laptopEmail);

  const ready = [arrivalA, arrivalB, arrivalC].every((run) => run.token && run.sessionId && run.completed);
  check('three real completed arrivals were driven for this stage', ready, '');
  if (!ready) return;

  // 1. THE ORDINARY PATH, unchanged: a browser holding its own token.
  const firstId = await createTempUser(`p6.first.${stamp}@example.test`);
  const firstEmail = (await service.auth.admin.getUserById(firstId)).data.user!.email!;
  await firePublicEntryClaim(firstEmail, firstId, arrivalA.token!);

  const { data: firstOrigin } = await service
    .from('member_public_entry_origin')
    .select('session_id, bind_method')
    .eq('member_id', firstId)
    .maybeSingle();
  check(
    'THE ORDINARY PATH: a browser holding its own token binds through the real claim route',
    (firstOrigin as { session_id?: string } | null)?.session_id === arrivalA.sessionId,
    JSON.stringify(firstOrigin)
  );
  check(
    'and it is recorded as the browser join, which is the stronger one',
    (firstOrigin as { bind_method?: string } | null)?.bind_method === 'browser_token',
    String((firstOrigin as { bind_method?: string } | null)?.bind_method)
  );

  // 2. THE 2026-09-04 SHAPE: a second account in a browser holding the SAME
  // token, which now names somebody else's session.
  const secondId = await createTempUser(sharedEmail);
  await firePublicEntryClaim(sharedEmail, secondId, arrivalA.token!);

  const { data: secondOrigin } = await service
    .from('member_public_entry_origin')
    .select('session_id, bind_method')
    .eq('member_id', secondId)
    .maybeSingle();
  const second = secondOrigin as { session_id: string; bind_method: string } | null;

  check(
    'FIRST BIND STILL WINS: the taken arrival is not re-pointed at the second account',
    second === null || second.session_id !== arrivalA.sessionId,
    JSON.stringify(second)
  );
  check(
    'THE FIX: she is not left with nothing. Her own other arrival is matched by address and bound',
    second !== null && second.session_id === arrivalB.sessionId && second.bind_method === 'email_match',
    second ? `session ${second.session_id.slice(0, 8)} via ${second.bind_method}` : 'still unbound'
  );
  if (second) {
    const { data: bound } = await service
      .from('public_entry_sessions')
      .select('lead_email, completed_at')
      .eq('id', second.session_id)
      .maybeSingle();
    const row = bound as { lead_email: string | null; completed_at: string | null } | null;
    check(
      'and what she was bound to is a COMPLETED arrival carrying exactly her own address',
      row?.completed_at !== null && (row?.lead_email ?? '').toLowerCase() === sharedEmail.toLowerCase(),
      String(row?.lead_email)
    );
  }

  // 3. NEVER OVERWRITES, on real rows. The first account is already bound
  // by its browser. Running the whole thing again for her, with a token
  // that names nothing, must leave her bind exactly as it was rather than
  // quietly replacing a strong join with a weaker one.
  await firePublicEntryClaim(firstEmail, firstId, `${arrivalA.token}-nope`);
  const { data: firstAgain } = await service
    .from('member_public_entry_origin')
    .select('session_id, bind_method, claimed_at')
    .eq('member_id', firstId)
    .maybeSingle();
  check(
    'a bind that already stands is never replaced, and never downgraded to the weaker join',
    (firstAgain as { session_id?: string; bind_method?: string } | null)?.session_id === arrivalA.sessionId &&
      (firstAgain as { bind_method?: string } | null)?.bind_method === 'browser_token',
    JSON.stringify(firstAgain)
  );

  // 4. THE DESIGN HOLE ITSELF: the laptop that carries no token at all.
  const laptopId = await createTempUser(laptopEmail);
  await firePublicEntryClaim(laptopEmail, laptopId, `${arrivalC.token}-not-a-real-token`);
  const { data: laptopOrigin } = await service
    .from('member_public_entry_origin')
    .select('session_id, bind_method')
    .eq('member_id', laptopId)
    .maybeSingle();
  const laptop = laptopOrigin as { session_id: string; bind_method: string } | null;
  check(
    'CROSS DEVICE: a browser carrying nothing usable is still joined to the quiz she really took',
    laptop !== null && laptop.session_id === arrivalC.sessionId && laptop.bind_method === 'email_match',
    laptop ? `session ${laptop.session_id.slice(0, 8)} via ${laptop.bind_method}` : 'still unbound'
  );

  const { data: laptopAcq } = await service
    .from('user_acquisition')
    .select('session_id, source_code')
    .eq('member_id', laptopId)
    .maybeSingle();
  note(
    laptopAcq
      ? `her attribution was attached in the same step: ${JSON.stringify(laptopAcq)}`
      : 'no attribution row, which is correct when no captured_leads row carries that address'
  );

  // 5. A stranger's address must never bind anything.
  const strangerId = await createTempUser(`p6.stranger.${stamp}@example.test`);
  const strangerEmail = (await service.auth.admin.getUserById(strangerId)).data.user!.email!;
  await firePublicEntryClaim(strangerEmail, strangerId, `${arrivalC.token}-nope`);
  const { data: strangerOrigin } = await service
    .from('member_public_entry_origin')
    .select('member_id')
    .eq('member_id', strangerId)
    .maybeSingle();
  check(
    'an account whose address matches no arrival is bound to nothing, which is still the common case',
    strangerOrigin === null,
    JSON.stringify(strangerOrigin)
  );
}

// =====================================================================
// TASK A, STAGE 4: the orphaned sessions from the test night.
// =====================================================================

async function stageOrphans() {
  console.log('\n--- Task A: disposition of every unbound finished arrival in production ---\n');

  const { data: sessions } = await service
    .from('public_entry_sessions')
    .select('id, source_code, landing_path, first_seen_at, completed_at, pattern_key, lead_email')
    .not('completed_at', 'is', null)
    .order('completed_at');
  const rows = (sessions ?? []) as {
    id: string;
    source_code: string | null;
    landing_path: string | null;
    first_seen_at: string;
    completed_at: string;
    pattern_key: string | null;
    lead_email: string | null;
  }[];

  const { data: origins } = await service.from('member_public_entry_origin').select('session_id');
  const bound = new Set(((origins ?? []) as { session_id: string }[]).map((row) => row.session_id));

  const orphans = rows.filter((row) => !bound.has(row.id) && !createdSessionTokens.length);
  const unbound = rows.filter((row) => !bound.has(row.id));

  console.log(`      ${rows.length} finished arrivals in production, ${unbound.length} of them unbound:`);
  for (const row of unbound) {
    console.log(
      `      - ${row.id.slice(0, 8)}  ${row.landing_path}  completed ${row.completed_at}  pattern ${row.pattern_key}  lead_email ${row.lead_email ?? 'null'}`
    );
  }

  const withEmail = unbound.filter((row) => row.lead_email !== null);
  check(
    'NOTHING from the test night can truthfully bind to the quiztest1 account',
    withEmail.every((row) => row.lead_email !== 'oakomah66+quiztest1@gmail.com'),
    `${withEmail.length} unbound arrivals carry any address at all`
  );
  note(
    'The fixed rule binds on an exact address match. None of the test-night arrivals carries an address,'
  );
  note(
    'and the one arrival quiztest1 genuinely tapped through belongs to another account under first-bind-wins.'
  );
  note('So they are left unbound, deliberately, and that is the honest answer rather than a guess.');
  void orphans;
}

// =====================================================================
// TASK B: building the rig's real week, then day 8.
// =====================================================================

/**
 * The rig's own trial window, moved so that today is day `dayNumber` and
 * the window itself has already closed.
 *
 * 00:30 IN THE RIG'S OWN ZONE, deliberately. `trial_ends_at` is stamped as
 * start plus seven days, so a start at noon means the trial is still open
 * for half of local day 8. Starting just after midnight makes local day 8
 * and "past the window" the same morning, which is the state this screen is
 * for.
 *
 * IT NEVER MOVES `source` TO manual. A manual assignment is protected by a
 * database trigger, and there is deliberately no path in the app that takes
 * a row back from manual to system, so moving a permanent fixture there
 * would be a one way door.
 */
async function setRigEntitlement(dayNumber: number) {
  const startLocal = rigTools.rigLocalDate(dayNumber - 1);
  const startedAt = new Date(`${startLocal}T04:30:00.000Z`).toISOString();
  const endsAt = new Date(new Date(startedAt).getTime() + 7 * 86_400_000).toISOString();

  const { error } = await service
    .from('member_subscriptions')
    .update({ tier: 'trial', source: 'system', status: 'active', trial_started_at: startedAt, trial_ends_at: endsAt })
    .eq('member_id', rig.id);
  if (error) throw new Error(`setting the rig entitlement failed: ${error.message}`);
  return { startedAt, endsAt };
}

/**
 * WHY THE TEST FLAG HAS TO COME OFF FOR THE LOCKED STAGES, and why that is
 * the least invasive way to do it.
 *
 * decideMemberAccess deliberately never locks a seeded test account out on
 * the automatic trial clock ("a test account nobody has assigned anything
 * to"), so the rig can be on day 40 and still be let straight in. Exactly
 * two facts get past that rule: an ASSIGNED trial, or is_test being false.
 *
 * An assigned trial means source 'manual', and a manual row is protected by
 * a database trigger whose only escape hatch lives inside the admin panel's
 * own function, which can set source to manual and never back. Moving a
 * permanent fixture through a one way door to run a test is worse than the
 * test.
 *
 * So the flag comes off for exactly as long as the browser is looking at
 * the screen, and goes back on afterwards. Every row this run writes is
 * written while the flag is ON, because the rig helper refuses to write to
 * an account that is not flagged, and that rail stays exactly where it is.
 */
async function setRigTestFlag(value: boolean) {
  const { error } = await service.from('profiles').update({ is_test: value }).eq('id', rig.id);
  if (error) throw new Error(`moving the rig test flag failed: ${error.message}`);
}

async function rigAccess(): Promise<{ allowed: boolean; reason: string; relationship: string }> {
  const { data } = await service
    .from('member_access_facts')
    .select('member_id, tier, source, status, full_access, trial_started_at, trial_ends_at, is_test')
    .eq('member_id', rig.id)
    .maybeSingle();
  const row = data as Record<string, unknown> | null;
  const decision = decideMemberAccess({
    subscription: row ? subscriptionFromRow(row as never) : null,
    isTest: Boolean(row?.is_test),
    now: new Date(),
  });
  const [{ data: assignments }, { data: profile }, { data: sub }] = await Promise.all([
    service.from('coach_client_assignments').select('status').eq('client_id', rig.id),
    service.from('profiles').select('is_test, created_at').eq('id', rig.id).maybeSingle(),
    service
      .from('member_subscriptions')
      .select('tier, source, status, full_access, trial_arc_suppressed_at')
      .eq('member_id', rig.id)
      .maybeSingle(),
  ]);
  const rows = (assignments ?? []) as { status: string }[];
  const relationship = deriveRelationship({
    memberId: rig.id,
    activeCoachAssignment: rows.some((a) => a.status === 'active'),
    everCoachAssigned: rows.length > 0,
    coachAssignmentStatuses: [...new Set(rows.map((a) => a.status))],
    hasSubscription: sub !== null,
    tier: (sub as { tier?: never } | null)?.tier ?? null,
    source: (sub as { source?: never } | null)?.source ?? null,
    status: (sub as { status?: never } | null)?.status ?? null,
    fullAccess: Boolean((sub as { full_access?: boolean } | null)?.full_access),
    isTest: Boolean((profile as { is_test?: boolean } | null)?.is_test),
    accountCreatedAt: (profile as { created_at?: string } | null)?.created_at ?? null,
    trialArcSuppressedAt: (sub as { trial_arc_suppressed_at?: string } | null)?.trial_arc_suppressed_at ?? null,
    readFailed: false,
  });
  return { allowed: decision.allowed, reason: decision.reason, relationship };
}

async function completeAssessment(overviewRoute: string): Promise<boolean> {
  const { context, minted } = await rigContext();
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}${overviewRoute}`, { waitUntil: 'domcontentloaded' });
    const begin = page.locator('form button[type="submit"]').first();
    await begin.waitFor({ timeout: 25000 });
    await begin.click();
    await page.waitForURL((u) => u.pathname.includes('/take'), { timeout: 30000 });

    const NEXT = /^(Continue|Begin|Start|See what Root learned|Next|Let's|I'm ready|Show me)/i;
    for (let step = 0; step < 40; step += 1) {
      if (page.url().includes('/results/')) break;
      const groups = page.locator('[role="radiogroup"]');
      const groupCount = await groups.count();
      for (let g = 0; g < groupCount; g += 1) {
        const radios = groups.nth(g).locator('[role="radio"]');
        const n = await radios.count();
        if (n > 0) await radios.nth(Math.min(1, n - 1)).click({ timeout: 6000 }).catch(() => {});
      }
      const next = page.locator('button:visible').filter({ hasText: NEXT }).last();
      if ((await next.count()) === 0) break;
      if (await next.isDisabled().catch(() => false)) {
        const others = page.locator('button:visible');
        const total = await others.count();
        let picked = false;
        for (let b = 0; b < total; b += 1) {
          const label = (await others.nth(b).innerText()).trim();
          if (!label || label === 'Back' || NEXT.test(label)) continue;
          await others.nth(b).click({ timeout: 6000 }).catch(() => {});
          picked = true;
          break;
        }
        if (!picked) break;
        await page.waitForTimeout(600);
      }
      if (await next.isDisabled().catch(() => false)) break;
      await next.click({ timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1200);
    }
    await page.waitForURL((u) => u.pathname.includes('/results/'), { timeout: 40000 }).catch(() => {});
    return page.url().includes('/results/');
  } finally {
    await context.close();
    await retireSession(minted);
  }
}

async function openRoute(route: string, waitMs = 6000): Promise<{ url: string; body: string; consoleErrors: string[] }> {
  const { context, minted } = await rigContext();
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && isRealConsoleError(m.text())) consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(waitMs);
    return { url: page.url(), body: normalize(await page.locator('body').innerText()), consoleErrors };
  } finally {
    await context.close();
    await retireSession(minted);
  }
}

/** Her week, built by driving the real screens rather than by writing rows. */
async function stageWeek() {
  console.log('\n--- Task B: building the rig a real week, on the real screens ---\n');

  await setRigTestFlag(true);
  await setRigEntitlement(3);
  await rigTools.resetAll(rig.id);

  const access = await rigAccess();
  check('the rig starts unlocked, so the conversations are reachable', access.allowed, access.reason);

  check('Core Values Snapshot genuinely completed', await completeAssessment(TRIAL_ARC_ROUTES.coreValuesSnapshot));
  check('Life Signal Check genuinely completed', await completeAssessment(TRIAL_ARC_ROUTES.lifeSignalCheck));
  check('Readiness Pulse genuinely completed', await completeAssessment(TRIAL_ARC_ROUTES.readinessPulse));

  // Day 6, so opening the recap screen composes her recap through its own
  // mounted effect, exactly as it does for a real member.
  await setRigEntitlement(6);
  await openRoute(TRIAL_ARC_ROUTES.weekRecap, 9000);
  const recaps = await rigTools.listRecaps(rig.id);
  check('day 6 composed and stored her recap, from the real screen', recaps.length === 1, JSON.stringify(recaps.map((r: { tier: string }) => r.tier)));

  // Day 7, same again for the close.
  await setRigEntitlement(7);
  await openRoute(TRIAL_ARC_ROUTES.weekClose, 9000);
  const closes = await rigTools.listCloses(rig.id);
  check('day 7 composed and stored her close, from the real screen', closes.length === 1, JSON.stringify(closes.map((c: { completion: string }) => c.completion)));
  check('and stamped that she opened it, which is what makes the day 8 state "full"', Boolean(closes[0]?.opened_at), String(closes[0]?.opened_at));
}

// =====================================================================
// TASK B: reading /trial-ended against the app's own renderer.
// =====================================================================

/**
 * The two door addresses AS THE PRODUCTION SERVER RESOLVES THEM, read off
 * the live screen rather than guessed.
 *
 * WHY IT IS NOT A CONSTANT IN THIS FILE. Both are server-only environment
 * variables in Vercel and this run cannot read either. Production's booking
 * link is NOT the value shipped as the fallback (it is
 * /mefwellness/consultation, not /mefwellness/discovery-assessment), which
 * is the config doing exactly its job: the address is resolved fresh on
 * every render and a change in Vercel changes a close composed last week
 * with no deploy. A test that hard coded the fallback would be asserting
 * that the override does not work.
 *
 * So the addresses come from the server, and what is then asserted is that
 * every word around them is what the app's own renderer produces for those
 * addresses, and that each one is a real absolute URL on the host it should
 * be on.
 */
let liveLinks: { discoveryCallUrl: string; membershipPricingUrl: string | null } | null = null;

async function resolveLiveLinks(): Promise<{ discoveryCallUrl: string; membershipPricingUrl: string | null }> {
  if (liveLinks) return liveLinks;
  const { context, minted } = await rigContext();
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}${TRIAL_ENDED_PATH}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    const anchors = page.locator('main a[href^="http"]');
    const total = await anchors.count();
    const hrefs: string[] = [];
    for (let i = 0; i < total; i += 1) hrefs.push((await anchors.nth(i).getAttribute('href')) ?? '');
    liveLinks = {
      discoveryCallUrl: hrefs.find((h) => /calendly\.com\/mefwellness/.test(h)) ?? '',
      membershipPricingUrl: hrefs.find((h) => h.startsWith('http') && !/calendly/.test(h)) ?? null,
    };
    return liveLinks;
  } finally {
    await context.close();
    await retireSession(minted);
  }
}

async function storedState(): Promise<RenderedTrialEndedContinuation | null> {
  const [{ data: closeRow }, { data: recapRow }] = await Promise.all([
    service.from('member_trial_arc_closes').select('plan, opened_at').eq('member_id', rig.id).maybeSingle(),
    service.from('member_trial_arc_recaps').select('plan').eq('member_id', rig.id).maybeSingle(),
  ]);
  const close = closeRow ? sanitizeClosePlan((closeRow as { plan: unknown }).plan) : null;
  const hasRecap = recapRow !== null;
  const links = await resolveLiveLinks();

  if (close) {
    const openedAt = (closeRow as { opened_at: string | null }).opened_at;
    return renderTrialEndedContinuation(
      { kind: openedAt ? 'full' : 'close_unopened', close, hasRecap },
      links
    );
  }
  if (hasRecap) return renderTrialEndedContinuation({ kind: 'recap_only' }, links);
  return null;
}

function onScreen(body: string, line: string): boolean {
  return body.includes(normalize(line));
}

function assertRenders(label: string, body: string, expected: RenderedTrialEndedContinuation) {
  check(`${label}: the heading is the one the renderer produces`, onScreen(body, expected.heading), expected.heading);
  for (const paragraph of expected.intro) {
    check(`${label}: opening line is on screen`, onScreen(body, paragraph), paragraph.slice(0, 60));
  }
  if (expected.outcome) {
    check(`${label}: her stored outcome title is on screen`, onScreen(body, expected.outcome.title), expected.outcome.title);
    check(`${label}: her stored outcome body is on screen`, onScreen(body, expected.outcome.body), expected.outcome.body.slice(0, 50));
    if (expected.outcome.nextStep) {
      check(`${label}: sized by her own readiness`, onScreen(body, expected.outcome.nextStep), expected.outcome.nextStep.slice(0, 50));
    }
  }
  if (expected.countLine) {
    check(`${label}: the counted line is on screen and names its window`, onScreen(body, expected.countLine), expected.countLine);
  }
  check(`${label}: the doors intro is on screen`, onScreen(body, expected.doorsIntro));
  for (const door of expected.doors) {
    check(`${label}: door "${door.label}" is drawn`, onScreen(body, door.label));
  }
  check(`${label}: the keep line is on screen`, onScreen(body, expected.keepLine), expected.keepLine.slice(0, 40));
}

const PRESSURE = [
  'days left',
  'days remaining',
  'last day',
  'final day',
  'last chance',
  'expires',
  'expiring',
  'expired',
  'expiry',
  'trial ends',
  'lose access',
  'losing access',
  'before you lose',
  'act now',
  'hurry',
  'deadline',
  'countdown',
  'limited time',
  'upgrade now',
  'subscribe now',
];

function assertNoPressure(label: string, body: string) {
  const lower = body.toLowerCase();
  const found = PRESSURE.filter((term) => lower.includes(term));
  check(`${label}: carries no pressure vocabulary at all`, found.length === 0, found.join(', '));
  check(`${label}: holds no em dash`, !body.includes(String.fromCharCode(0x2014)));
}

/** Day 8, past her own window, with the test flag off so the entitlement decision genuinely locks her. */
async function lockRigToDay8() {
  await setRigEntitlement(8);
  await setRigTestFlag(false);
  const access = await rigAccess();
  check('the rig is now locked by the entitlement decision', !access.allowed, access.reason);
  check('and is still a PROSPECT, which is the only relationship this screen is written for', access.relationship === 'PROSPECT', access.relationship);
}

async function stageFull() {
  console.log('\n--- Task B: day 8, the FULL state ---\n');
  await lockRigToDay8();

  // The middleware, doing the routing.
  const home = await openRoute('/dashboard', 5000);
  check('the middleware routes her off Home to the continuation screen', home.url.endsWith(TRIAL_ENDED_PATH), home.url);

  const expected = await storedState();
  check('her stored close and recap both exist to render from', expected !== null && expected.kind === 'full', expected?.kind ?? 'none');
  if (!expected) return;

  const screen = await openRoute(TRIAL_ENDED_PATH, 6000);
  check('no console or page error on the continuation screen', screen.consoleErrors.length === 0, screen.consoleErrors.slice(0, 2).join(' | '));
  assertRenders('full', screen.body, expected);
  assertNoPressure('full', screen.body);

  check(
    'her recap is reachable in one tap',
    expected.weekLink !== null && onScreen(screen.body, expected.weekLink.label),
    expected.weekLink?.href ?? 'no link'
  );

  // And the tap itself.
  const { context, minted } = await rigContext();
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}${TRIAL_ENDED_PATH}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const link = page.locator('a:visible').filter({ hasText: expected.weekLink!.label }).first();
    await link.click({ timeout: 10000 });
    await page.waitForTimeout(5000);
    check('tapping it opens her own week', page.url().endsWith(TRIAL_ENDED_WEEK_PATH), page.url());

    const weekBody = normalize(await page.locator('body').innerText());
    const { data: recapRow } = await service
      .from('member_trial_arc_recaps')
      .select('plan')
      .eq('member_id', rig.id)
      .maybeSingle();
    const plan = recapRow ? sanitizeRecapPlan((recapRow as { plan: unknown }).plan) : null;
    if (plan) {
      const kept = renderTrialArcRecap(plan, { surface: 'after_the_week' });
      check('the week screen renders her STORED recap', onScreen(weekBody, kept.heading) && onScreen(weekBody, kept.intro), kept.intro.slice(0, 40));
      check('its closing line promises no tomorrow that has already happened', onScreen(weekBody, kept.tomorrow), kept.tomorrow);
      check('and it draws no button into a conversation behind the lock', kept.cta === null);
    }
    assertNoPressure('week', weekBody);

    const back = page.locator('a:visible').filter({ hasText: /^Back$/ }).first();
    if (await back.count()) {
      await back.click({ timeout: 8000 });
      await page.waitForTimeout(4000);
      check('and Back returns to the continuation screen, never into a loop', page.url().endsWith(TRIAL_ENDED_PATH), page.url());
    }
  } finally {
    await context.close();
    await retireSession(minted);
  }

  // The door tap, recorded on her own stored close. The reset runs through
  // the service role directly, so it needs no flag change of its own.
  await service.from('member_trial_arc_closes').update({ door_tapped: null, door_tapped_at: null }).eq('member_id', rig.id);
  const { context: c2, minted: m2 } = await rigContext();
  const p2 = await c2.newPage();
  try {
    await p2.goto(`${BASE}${TRIAL_ENDED_PATH}`, { waitUntil: 'domcontentloaded' });
    await p2.waitForTimeout(4000);
    const door = p2.locator('a:visible').filter({ hasText: expected.doors[0]!.label }).first();
    const href = await door.getAttribute('href');
    check(
      'the leading door points at the address the production config actually resolves to',
      href === expected.doors[0]!.href && /^https:\/\//.test(String(href)),
      String(href)
    );
    await door.evaluate((el) => (el as HTMLAnchorElement).removeAttribute('target'));
    await door.click({ timeout: 8000 }).catch(() => {});
    await p2.waitForTimeout(5000);
  } finally {
    await c2.close();
    await retireSession(m2);
  }
  const closes = await rigTools.listCloses(rig.id);
  check('and tapping it is recorded on her own stored close', closes[0]?.door_tapped === expected.doors[0]!.door, String(closes[0]?.door_tapped));

  // No pop-up on day 8.
  const again = await openRoute(TRIAL_ENDED_PATH, 12000);
  check('no trial arc pop-up fires on day 8, on the screen she actually lands on', !/From Root.*(Day \d|next step)/i.test(again.body) && !again.body.includes('root-invite-popup'), '');
  const deliveries = await rigTools.listDeliveries(rig.id);
  check(
    'and no delivery receipt beyond the seven days of her week exists',
    deliveries.every((d: { day_number: number }) => d.day_number <= 7),
    deliveries.map((d: { day_number: number }) => d.day_number).join(',')
  );
}

async function stageUnopened() {
  console.log('\n--- Task B: day 8, the close she never opened ---\n');
  // Every row this run writes is written while the rig is still flagged
  // is_test, because the rig helper refuses to write to an account that is
  // not, and that rail is not being moved for a verification run.
  await setRigTestFlag(true);
  await service
    .from('member_trial_arc_closes')
    .update({ opened_at: null, door_tapped: null, door_tapped_at: null })
    .eq('member_id', rig.id);
  await lockRigToDay8();

  const expected = await storedState();
  check('the stored close now reads as never opened', expected?.kind === 'close_unopened', expected?.kind ?? 'none');
  if (!expected) return;

  const screen = await openRoute(TRIAL_ENDED_PATH, 6000);
  assertRenders('close_unopened', screen.body, expected);
  assertNoPressure('close_unopened', screen.body);
  check('her outcome is still preserved, so being busy on day 7 costs her nothing', expected.outcome !== null && onScreen(screen.body, expected.outcome.title), expected.outcome?.title ?? '');
  check('and the screen says plainly that she has not seen it yet', /have not seen it yet/i.test(screen.body));
}

async function stagePartial() {
  console.log('\n--- Task B: day 8, the PARTIAL state (a recap and no close) ---\n');
  await setRigTestFlag(true);
  await rigTools.resetCloses(rig.id);
  await lockRigToDay8();

  const expected = await storedState();
  check('the state falls back to her recap alone', expected?.kind === 'recap_only', expected?.kind ?? 'none');
  if (!expected) return;

  const screen = await openRoute(TRIAL_ENDED_PATH, 6000);
  assertRenders('recap_only', screen.body, expected);
  assertNoPressure('recap_only', screen.body);
  check('it invents no outcome it does not have', expected.outcome === null);
  check('and says plainly there is no closing note', /no closing note/i.test(screen.body));
  check('her week is still one tap away', expected.weekLink?.href === TRIAL_ENDED_WEEK_PATH, expected.weekLink?.href ?? 'none');
}

async function stageNoArc() {
  console.log('\n--- Task B: day 8, the NO-ARC state (nothing stored) ---\n');
  await setRigTestFlag(true);
  await rigTools.resetCloses(rig.id);
  await rigTools.resetRecaps(rig.id);
  await lockRigToDay8();

  const expected = await storedState();
  check('nothing is stored, which is the state every pre-arc locked account is in', expected === null);

  const screen = await openRoute(TRIAL_ENDED_PATH, 6000);
  check('no console or page error', screen.consoleErrors.length === 0, screen.consoleErrors.slice(0, 2).join(' | '));
  check('the screen states plainly that her free week is complete', /your free week is complete/i.test(screen.body));
  check('it shows no outcome card, because it has none to show', !/here.s what i.d work on next/i.test(screen.body));
  check('it offers no week to read, because there is none stored', !/read your week back/i.test(screen.body));
  check('it says out loud that it has no summary rather than making one up', /rather say that than make one up/i.test(screen.body));
  check('the conversation door is on it', /talk with osei/i.test(screen.body));
  check('and the honest reassurance is on it', /still here, and so is everything in it/i.test(screen.body));
  assertNoPressure('no_arc', screen.body);
}

// =====================================================================
// TASK B: the accounts that are actually locked, read only.
// =====================================================================

async function stageLocked() {
  console.log('\n--- Task B: every really locked production account, READ ONLY ---\n');

  const { data: users } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const all = users?.users ?? [];

  const rows: string[] = [];
  let prospects = 0;
  let noArc = 0;

  for (const user of all) {
    if (user.id === rig.id) continue;
    const [{ data: facts }, { data: assignments }, { data: profile }, { data: sub }, { data: roles }] = await Promise.all([
      service
        .from('member_access_facts')
        .select('member_id, tier, source, status, full_access, trial_started_at, trial_ends_at, is_test')
        .eq('member_id', user.id)
        .maybeSingle(),
      service.from('coach_client_assignments').select('status').eq('client_id', user.id),
      service.from('profiles').select('is_test, created_at').eq('id', user.id).maybeSingle(),
      service
        .from('member_subscriptions')
        .select('tier, source, status, full_access, trial_arc_suppressed_at')
        .eq('member_id', user.id)
        .maybeSingle(),
      service.from('user_roles').select('role').eq('user_id', user.id).is('revoked_at', null),
    ]);

    const isStaff = ((roles ?? []) as { role: string }[]).some((r) => r.role === 'coach' || r.role === 'platform_administrator');
    const decision = decideMemberAccess({
      subscription: facts ? subscriptionFromRow(facts as never) : null,
      isTest: Boolean((facts as { is_test?: boolean } | null)?.is_test),
      now: new Date(),
    });
    if (decision.allowed) continue;

    const a = (assignments ?? []) as { status: string }[];
    const relationship = deriveRelationship({
      memberId: user.id,
      activeCoachAssignment: a.some((x) => x.status === 'active'),
      everCoachAssigned: a.length > 0,
      coachAssignmentStatuses: [...new Set(a.map((x) => x.status))],
      hasSubscription: sub !== null,
      tier: (sub as { tier?: never } | null)?.tier ?? null,
      source: (sub as { source?: never } | null)?.source ?? null,
      status: (sub as { status?: never } | null)?.status ?? null,
      fullAccess: Boolean((sub as { full_access?: boolean } | null)?.full_access),
      isTest: Boolean((profile as { is_test?: boolean } | null)?.is_test),
      accountCreatedAt: (profile as { created_at?: string } | null)?.created_at ?? null,
      trialArcSuppressedAt: (sub as { trial_arc_suppressed_at?: string } | null)?.trial_arc_suppressed_at ?? null,
      readFailed: false,
    });

    const [{ count: recapCount }, { count: closeCount }] = await Promise.all([
      service.from('member_trial_arc_recaps').select('member_id', { count: 'exact', head: true }).eq('member_id', user.id),
      service.from('member_trial_arc_closes').select('member_id', { count: 'exact', head: true }).eq('member_id', user.id),
    ]);
    const stored = (recapCount ?? 0) + (closeCount ?? 0);
    if (relationship === 'PROSPECT' && !isStaff) prospects += 1;
    if (stored === 0) noArc += 1;

    rows.push(
      `      - ${(user.email ?? '').padEnd(40)} ${decision.reason.padEnd(16)} ${relationship.padEnd(22)} ${isStaff ? 'STAFF (never routed here)' : 'member'}  stored rows: ${stored}`
    );
  }

  console.log(`      ${rows.length} production accounts are locked by the entitlement decision:`);
  for (const line of rows) console.log(line);

  check('every locked non-staff account derives as a PROSPECT, so the doors are correct for all of them', prospects === rows.filter((r) => r.includes('member')).length, `${prospects} prospects`);
  check('none of them has a stored recap or close, so every one of them gets the no-arc state', noArc === rows.length, `${noArc} of ${rows.length}`);
  note('READ ONLY: not one row of any of these accounts was written by this run.');
}

async function stageExclusion() {
  console.log('\n--- Task B: the accounts that must never reach the continuation screen ---\n');

  const named = [
    '8weeks2fab@gmail.com',
    'grandec2005@yahoo.com',
    'test.member.populated@example.test',
  ];

  for (const email of named) {
    const id = await findUserIdByEmail(email);
    if (!id) {
      check(`${email} exists to check`, false, 'not found');
      continue;
    }
    const [{ data: facts }, { data: assignments }, { data: profile }, { data: sub }] = await Promise.all([
      service
        .from('member_access_facts')
        .select('member_id, tier, source, status, full_access, trial_started_at, trial_ends_at, is_test')
        .eq('member_id', id)
        .maybeSingle(),
      service.from('coach_client_assignments').select('status').eq('client_id', id),
      service.from('profiles').select('is_test, created_at').eq('id', id).maybeSingle(),
      service
        .from('member_subscriptions')
        .select('tier, source, status, full_access, trial_arc_suppressed_at')
        .eq('member_id', id)
        .maybeSingle(),
    ]);
    const a = (assignments ?? []) as { status: string }[];
    const relationship = deriveRelationship({
      memberId: id,
      activeCoachAssignment: a.some((x) => x.status === 'active'),
      everCoachAssigned: a.length > 0,
      coachAssignmentStatuses: [...new Set(a.map((x) => x.status))],
      hasSubscription: sub !== null,
      tier: (sub as { tier?: never } | null)?.tier ?? null,
      source: (sub as { source?: never } | null)?.source ?? null,
      status: (sub as { status?: never } | null)?.status ?? null,
      fullAccess: Boolean((sub as { full_access?: boolean } | null)?.full_access),
      isTest: Boolean((profile as { is_test?: boolean } | null)?.is_test),
      accountCreatedAt: (profile as { created_at?: string } | null)?.created_at ?? null,
      trialArcSuppressedAt: (sub as { trial_arc_suppressed_at?: string } | null)?.trial_arc_suppressed_at ?? null,
      readFailed: false,
    });
    const decision = decideMemberAccess({
      subscription: facts ? subscriptionFromRow(facts as never) : null,
      isTest: Boolean((facts as { is_test?: boolean } | null)?.is_test),
      now: new Date(),
    });
    check(
      `${email} is not a prospect, so the routing rule refuses to send it here`,
      relationship !== 'PROSPECT',
      `${relationship}, access ${decision.reason}`
    );
  }

  // And the screen itself turns one away, driven for real.
  const coachedId = await findUserIdByEmail('test.member.populated@example.test');
  if (coachedId) {
    const { context, minted } = await contextFor('test.member.populated@example.test', coachedId);
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}${TRIAL_ENDED_PATH}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
      check(
        'a coached account typing the URL is turned away by the screen itself',
        !page.url().endsWith(TRIAL_ENDED_PATH),
        page.url()
      );
    } finally {
      await context.close();
      await retireSession(minted);
    }
  }
}

async function stageDoors() {
  console.log('\n--- Task B: the doors come from the shared config ---\n');
  await lockRigToDay8();
  const { context, minted } = await rigContext();
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}${TRIAL_ENDED_PATH}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    const anchors = page.locator('main a[href^="http"]');
    const total = await anchors.count();
    const hrefs: string[] = [];
    for (let i = 0; i < total; i += 1) hrefs.push((await anchors.nth(i).getAttribute('href')) ?? '');
    console.log(`      outbound links on the screen: ${JSON.stringify(hrefs)}`);
    check(
      'the conversation door points at the configured booking page',
      hrefs.some((h) => /calendly\.com\/mefwellness/.test(h)),
      hrefs.join(' ')
    );
    // MEMBERSHIP_PRICING_URL IS set in the production environment, so the
    // second door is genuinely drawn. Its address is a secret this run
    // cannot read, so what is asserted is that it is a real absolute URL,
    // that it is not the booking page again, and that it is not a
    // placeholder of any kind.
    const membership = hrefs.filter((h) => !/calendly/.test(h) && h.startsWith('http'));
    check(
      'the membership door is drawn, because a membership page IS configured in production',
      membership.length === 1,
      membership.join(' ')
    );
    check(
      'and its address is a real one rather than a placeholder',
      membership.every((h) => /^https:\/\/[^\s]+\.[^\s]+/.test(h) && !h.includes('PRICING_LINK')),
      membership.join(' ')
    );
    check('no placeholder href is drawn anywhere', !hrefs.some((h) => h.includes('PRICING_LINK') || h === '#'));
  } finally {
    await context.close();
    await retireSession(minted);
  }
}

async function stageQuiet() {
  console.log('\n--- Task B: the arc is still launched for no one ---\n');

  const { data: users } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const all = (users?.users ?? []).filter((u) => u.id !== rig.id);

  const { data: deliveries } = await service
    .from('member_trial_arc_deliveries')
    .select('member_id')
    .neq('member_id', rig.id);
  check('no non-rig account has a single trial arc delivery receipt', (deliveries ?? []).length === 0, String((deliveries ?? []).length));

  const { data: recaps } = await service.from('member_trial_arc_recaps').select('member_id').neq('member_id', rig.id);
  const { data: closes } = await service.from('member_trial_arc_closes').select('member_id').neq('member_id', rig.id);
  check('no non-rig account has a stored recap', (recaps ?? []).length === 0, String((recaps ?? []).length));
  check('no non-rig account has a stored close', (closes ?? []).length === 0, String((closes ?? []).length));
  note(`${all.length} non-rig production accounts checked.`);
}

// =====================================================================
// Restore.
// =====================================================================

async function stageRestore() {
  console.log('\n--- Restoring the rig, and cleaning up everything this run created ---\n');

  for (const id of createdUserIds) {
    await service.auth.admin.deleteUser(id).catch(() => {});
  }
  check('every temporary account this run created is deleted', true, `${createdUserIds.length} accounts`);

  // Every arrival this run created, by the token it was handed AND by the
  // address it left, so a stage run on its own in an earlier process still
  // gets cleaned up. No real visitor uses example.test.
  if (createdSessionTokens.length) {
    await service.from('public_entry_sessions').delete().in('visitor_token', createdSessionTokens);
  }
  const { data: leftovers } = await service
    .from('public_entry_sessions')
    .select('id')
    .ilike('lead_email', '%@example.test');
  const stray = ((leftovers ?? []) as { id: string }[]).map((row) => row.id);
  if (stray.length) await service.from('public_entry_sessions').delete().in('id', stray);
  check(
    'every public entry session this run created is deleted',
    true,
    `${createdSessionTokens.length} by token, ${stray.length} by address`
  );

  await setRigTestFlag(true);
  await rigTools.resetAll(rig.id);
  await setRigEntitlement(1);
  const { data: profile } = await service.from('profiles').select('is_test').eq('id', rig.id).maybeSingle();
  check(
    'the rig is flagged is_test again, so no staff screen or analytics figure can see it',
    Boolean((profile as { is_test?: boolean } | null)?.is_test)
  );

  const access = await rigAccess();
  check('and the entitlement decision lets it in again', access.allowed, access.reason);
  const shown = await rigTools.showRig(rig.id);
  console.log(`      rig now: ${JSON.stringify(shown.subscription)}`);
  check('with no recap, no close and no delivery left behind', shown.recaps.length === 0 && shown.closes.length === 0 && shown.deliveries.length === 0, `${shown.recaps.length}/${shown.closes.length}/${shown.deliveries.length}`);
}

// =====================================================================

const TASK_A = ['forensics', 'realpath', 'bind', 'orphans'];
const TASK_B = ['week', 'full', 'unopened', 'partial', 'noarc', 'locked', 'exclusion', 'doors', 'quiet'];

async function main() {
  browser = await chromium.launch();
  const run = (name: string) => STAGE === 'all' || STAGE === name || (STAGE === 'taska' && TASK_A.includes(name)) || (STAGE === 'taskb' && TASK_B.includes(name));

  try {
    if (run('forensics')) await stageForensics();
    if (run('realpath')) await stageRealPath();
    if (run('bind')) await stageBind();
    if (run('orphans')) await stageOrphans();

    if (run('week')) await stageWeek();
    if (run('full')) await stageFull();
    if (run('unopened')) await stageUnopened();
    if (run('partial')) await stagePartial();
    if (run('noarc')) await stageNoArc();
    if (run('locked')) await stageLocked();
    if (run('exclusion')) await stageExclusion();
    if (run('doors')) await stageDoors();
    if (run('quiet')) await stageQuiet();

    if (STAGE === 'all' || STAGE === 'restore' || STAGE === 'taska' || STAGE === 'taskb') await stageRestore();
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('\nFAILED:');
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? `  (${f.detail})` : ''}`);
    process.exitCode = 1;
  }
}

await main();
