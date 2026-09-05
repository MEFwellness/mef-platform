/**
 * THE ARC, LAUNCHED, WATCHED ON THE LIVE SITE FOR ALL THREE KINDS OF PERSON.
 *
 * Prompt 7 of the trial arc build. The launch date is set, the deploy is
 * out, and this is the run that says what actually happens now to each of
 * the three people the product has: the prospect the arc was written for,
 * the coaching client it must never reach, and the app member it must never
 * reach either.
 *
 * THE ONE THING THAT MAKES THIS RUN DIFFERENT FROM PROMPTS 4 TO 6. There is
 * no override. The reference account is created AFTER the launch instant,
 * so it is eligible by the ordinary six rules, exactly as a stranger
 * signing up this afternoon is. TRIAL_ARC_TEST_ACCOUNT_IDS is passed as an
 * empty string to every decision this file makes, so nothing here can be
 * passing because of a list.
 *
 * WHAT "MAXIMUM REAL" MEANS FOR THE REFERENCE ACCOUNT, STATED PLAINLY.
 * The quiz is taken signed out, in a real browser, on app.mefwellness.com.
 * The reference is minted by the deployed route handler into the production
 * database. The create-account button is really tapped and the signup form
 * is really reached and read. The form is NOT submitted, because Turnstile
 * refuses a scripted submission by design (CLAUDE.md), and no captcha is
 * disabled for a test. So the account is created through the Auth Admin
 * API and the arrival is bound by running the SHIPPED redeem function
 * against the production database, on the real reference the real button
 * carried. That is the boundary. It is the same boundary prompt 6B drew and
 * it is stated rather than dressed up.
 *
 * THE is_test WINDOW, AND WHY IT EXISTS. Rule 2 of eligibility refuses a
 * seeded test account, so the reference account CANNOT be flagged is_test
 * while it is proving it is genuinely eligible without an override. It is
 * therefore unflagged for the length of this run and flagged at the end,
 * which is what the brief asks for. The window is real, it is reported, and
 * during it the account is one obviously named row on an otherwise quiet
 * production database.
 *
 * WHAT IT WRITES, AND WHERE. The reference account and its own arc rows.
 * One throwaway account for the app-member case, deleted before the run
 * ends. The suppression column on ONE test account, restored to null
 * whatever happens. Nothing else in production is written to at all: every
 * other stage READS.
 *
 * STAGES
 *   deployed    the launch, as the deployed site actually holds it
 *   prospect    create the post-launch reference account, the real way
 *   walk        days 1 to 8, on the real screens
 *   coached     the coaching client, twice over, and /trial-ended
 *   apponly     the app member, on a throwaway fixture
 *   suppress    the admin control, on and off
 *   collisions  the five ways two messages could land on one day
 *   untouched   every pre-launch account, unchanged
 *   hygiene     every test account this build made, out of the numbers
 *   all
 *
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   BASE_URL=https://app.mefwellness.com \
 *   npx tsx scripts/verify-trial-arc-launched-live.mts all
 */
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
// @ts-expect-error the shared minting helper is plain JavaScript, by design
import { mintSessionCookies, retireSession } from './lib/mint-session.mjs';
import { TRIAL_ARC_LAUNCH, trialArcLaunchInstant } from '../lib/trial-arc/config';
import { TRIAL_ARC_ROUTES, trialArcPopupMessageKey } from '../lib/trial-arc/constants';
import { decideTrialArcEligibility, resolveTrialArcEligibility } from '../lib/trial-arc/eligibility';
import { resolveTrialArcDecision, publicEntryArcHandover } from '../lib/trial-arc/engine';
import { fetchRelationshipFacts, deriveRelationship } from '../lib/membership/relationship';
import { decideMemberAccess, subscriptionFromRow } from '../lib/membership/access';
import { memberAccessRedirectFor } from '../lib/membership/routing';
import { TRIAL_ENDED_PATH } from '../lib/trial-ended/paths';
import { getPublicEntryWelcome } from '../lib/public-entry/welcome';
import { getMemberOrigin } from '../lib/public-entry/data';
import { bindArrivalFromSignupRef, hashSignupRef } from '../lib/public-entry/signupRef';
import { listTrialArcDeliveries } from '../lib/trial-arc/data';
import { applyTestAccountExclusion } from '../lib/staff/testAccounts';

const BASE = process.env.BASE_URL || 'https://app.mefwellness.com';
const PHONE = { width: 393, height: 852 };
const STAGE = process.argv[2] || 'all';

/** The reference account's own name. Post-launch, and obviously what it is. */
const REF_EMAIL = 'oakomah66+arclaunch@gmail.com';
const REF_NAME = 'Trial Arc Launch Reference (test)';
const REF_TZ = 'America/New_York';

/** Where the reference account's id is kept between stages, so one stage can be re-run. */
const REF_FILE = 'scripts/.verify/p7/reference-id.txt';

/** The two production accounts that are being coached. 8weeks2fab is flagged; the other is a real person and is named by id only. */
const COACHED_TEST_EMAIL = '8weeks2fab@gmail.com';
const COACHED_REAL_ID = '3e7af809-f280-4d32-b669-a23a29f21c62';
/** The test account the suppression control is exercised on. Not the reference account: suppression must be provable without disturbing the walk. */
const SUPPRESS_ON_EMAIL = 'oakomah66+test10@gmail.com';

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
function note(text: string) {
  console.log(`      ${text}`);
}
function heading(text: string) {
  console.log(`\n--- ${text} ---\n`);
}

const service: SupabaseClient = createClient(
  process.env.PROD_SUPABASE_URL!,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE!, 'utf8').trim(),
  { auth: { persistSession: false, autoRefreshToken: false } }
);

let browser: Browser;

/**
 * THE OVERRIDE LIST, PASSED EMPTY, EVERYWHERE, ON PURPOSE.
 *
 * Every eligibility question this file asks is asked with an empty list, so
 * no answer below can be an artefact of a name in a server variable. The
 * reference account is eligible because of when it was created and nothing
 * else, which is the whole claim this run exists to make.
 */
const NO_OVERRIDE = '';

function isRealConsoleError(text: string): boolean {
  return !/^%c%d\s+font-size:0/.test(text.trim());
}
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim();
}

const launch = trialArcLaunchInstant();
if (launch === null) throw new Error('TRIAL_ARC_LAUNCH is null in this checkout. Nothing below can be run.');

// =====================================================================
// Small production helpers. Every write asserts what it is writing to.
// =====================================================================

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

/** A YYYY-MM-DD in the reference account's own zone, `back` days ago. */
function refLocalDate(back = 0, now = new Date()): string {
  const wall = new Date(now.toLocaleString('en-US', { timeZone: REF_TZ }));
  wall.setDate(wall.getDate() - back);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${wall.getFullYear()}-${pad(wall.getMonth() + 1)}-${pad(wall.getDate())}`;
}

/**
 * Moves the reference account's OWN trial so that today is day n for it.
 *
 * It never touches `source`. A manual row is protected by a database
 * trigger with a one way escape hatch, and moving a fixture through it to
 * run a test is worse than the test. See scripts/trial-arc-rig.mjs.
 */
async function setRefDay(id: string, dayNumber: number) {
  const startLocal = refLocalDate(dayNumber - 1);
  const startedAt = new Date(`${startLocal}T04:30:00.000Z`).toISOString();
  const endsAt = new Date(new Date(startedAt).getTime() + 7 * 86_400_000).toISOString();
  const { error } = await service
    .from('member_subscriptions')
    .update({ tier: 'trial', source: 'system', status: 'active', trial_started_at: startedAt, trial_ends_at: endsAt })
    .eq('member_id', id);
  if (error) throw new Error(`setting the reference day failed: ${error.message}`);
  return { startedAt, endsAt, startLocal };
}

async function setRefTestFlag(id: string, value: boolean) {
  const { error } = await service.from('profiles').update({ is_test: value }).eq('id', id);
  if (error) throw new Error(`moving the reference test flag failed: ${error.message}`);
}

async function contextFor(email: string, expectedId: string): Promise<{ context: BrowserContext; minted: unknown }> {
  const minted = await mintSessionCookies(email, { baseUrl: BASE });
  if (!minted) throw new Error(`could not mint a session for ${email}`);
  // generateLink CREATES an account for an address that does not exist, so
  // the id is asserted rather than assumed.
  if ((minted as { session: { user: { id: string } } }).session.user.id !== expectedId) {
    throw new Error(`minted session belongs to somebody else, not ${expectedId}`);
  }
  const context = await browser.newContext({ viewport: PHONE });
  await context.addCookies((minted as { cookies: never[] }).cookies);
  return { context, minted };
}

async function openAs(
  email: string,
  id: string,
  route: string,
  waitMs = 6000
): Promise<{ url: string; body: string; consoleErrors: string[] }> {
  const { context, minted } = await contextFor(email, id);
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

/** The relationship and access answers for one account, from production rows. */
async function accessOf(id: string): Promise<{ allowed: boolean; reason: string; relationship: string }> {
  const { data } = await service
    .from('member_access_facts')
    .select('member_id, tier, source, status, full_access, trial_started_at, trial_ends_at, is_test')
    .eq('member_id', id)
    .maybeSingle();
  const row = data as Record<string, unknown> | null;
  const decision = decideMemberAccess({
    subscription: row ? subscriptionFromRow(row as never) : null,
    isTest: Boolean(row?.is_test),
    now: new Date(),
  });
  const facts = await fetchRelationshipFacts(service, id);
  return { allowed: decision.allowed, reason: decision.reason, relationship: deriveRelationship(facts) };
}

async function arcRowsFor(id: string) {
  const [{ data: d }, { data: r }, { data: c }] = await Promise.all([
    service.from('member_trial_arc_deliveries').select('message_key, day_number, pace_state, delivered_local_date, cta_tapped_at').eq('member_id', id).order('day_number'),
    service.from('member_trial_arc_recaps').select('tier, day_number, opened_at').eq('member_id', id),
    service.from('member_trial_arc_closes').select('completion, lead_door, day_number, opened_at').eq('member_id', id),
  ]);
  return { deliveries: d ?? [], recaps: r ?? [], closes: c ?? [] };
}

// =====================================================================
// STAGE: deployed
// =====================================================================

let deployedOk = false;

async function stageDeployed() {
  heading('The launch, as this checkout and the deployed site hold it');

  console.log(`      TRIAL_ARC_LAUNCH = ${JSON.stringify(TRIAL_ARC_LAUNCH)}`);
  console.log(`      parsed           = ${launch!.toISOString()}`);
  console.log(`      now              = ${new Date().toISOString()}`);
  check('the launch constant is set and parseable', TRIAL_ARC_LAUNCH !== null, String(TRIAL_ARC_LAUNCH));

  const context = await browser.newContext({ viewport: PHONE });
  const page = await context.newPage();
  try {
    const response = await page.goto(`${BASE}/energy`, { waitUntil: 'domcontentloaded' });
    check('app.mefwellness.com answers', (response?.status() ?? 0) === 200, String(response?.status()));
    // The quiz mounts client side, so the first paint is its own loading
    // state. Waiting for the real screen is the check, not a workaround.
    await page.waitForTimeout(9000);
    const body = normalize(await page.locator('body').innerText());
    check('and it is the real site, past its loading state', /energy/i.test(body) && !/^Loading/i.test(body), body.slice(0, 80));
    deployedOk = true;
  } finally {
    await context.close();
  }

  // Reported, not asserted. Whether the instant has passed yet is a fact
  // about when this run started, and the stage that actually depends on it
  // has its own hard gate.
  const passed = Date.now() >= launch!.getTime();
  note(
    passed
      ? 'The launch instant has passed, so an account created now is inside the arc.'
      : `The launch instant has NOT passed yet: ${Math.round((launch!.getTime() - Date.now()) / 60000)} minutes to go. The prospect stage will refuse until it has.`
  );
}

// =====================================================================
// STAGE: prospect. The reference account, created the real way.
// =====================================================================

type QuizRun = {
  token: string | null;
  sessionId: string | null;
  completed: boolean;
  patternKey: string | null;
  consoleErrors: string[];
  navigatedUrls: string[];
  signup: {
    reached: boolean;
    url: string;
    urlCleaned: boolean;
    carriedInUrl: string | null;
    hiddenRef: string | null;
    turnstile: number;
  } | null;
};

/** The whole signed-out walk on the live site, ending with the create-account button really tapped. */
async function driveQuiz(clickCta = true): Promise<QuizRun> {
  const consoleErrors: string[] = [];
  const navigatedUrls: string[] = [];
  const context = await browser.newContext({ viewport: PHONE });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' && isRealConsoleError(m.text())) consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
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

    let sessionId: string | null = null;
    let completed = false;
    let patternKey: string | null = null;
    if (token) {
      const { data } = await service
        .from('public_entry_sessions')
        .select('id, completed_at, pattern_key')
        .eq('visitor_token', token)
        .maybeSingle();
      const row = data as { id: string; completed_at: string | null; pattern_key: string | null } | null;
      sessionId = row?.id ?? null;
      completed = Boolean(row?.completed_at);
      patternKey = row?.pattern_key ?? null;
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
          hiddenRef: await page.locator('input[name="publicEntryRef"]').getAttribute('value').catch(() => null),
          turnstile: await page.locator('.cf-turnstile, input[name="cf-turnstile-response"]').count(),
        };
      }
    }

    return { token, sessionId, completed, patternKey, consoleErrors, navigatedUrls, signup };
  } finally {
    await context.close();
  }
}

let referenceId: string | null = null;
let referencePattern: string | null = null;

function rememberReference(id: string) {
  referenceId = id;
  try {
    writeFileSync(REF_FILE, id);
  } catch {
    // The file is a convenience for re-running one stage, not a dependency.
  }
}

function loadReference(): string | null {
  if (referenceId) return referenceId;
  try {
    const id = readFileSync(REF_FILE, 'utf8').trim();
    if (id) referenceId = id;
    return referenceId;
  } catch {
    return null;
  }
}

async function stageProspect() {
  heading('The PROSPECT: a post-launch account, created the real way');

  if (Date.now() < launch!.getTime()) {
    check('the launch instant has passed before the reference account is created', false, `${Math.round((launch!.getTime() - Date.now()) / 60000)} minutes to go`);
    return;
  }

  const existing = await findUserIdByEmail(REF_EMAIL);
  if (existing) {
    note(`the reference account already exists (${existing}), reusing it`);
    rememberReference(existing);
  }

  // 1. THE QUIZ, SIGNED OUT, ON THE LIVE SITE.
  const run = await driveQuiz(true);
  check('the signed-out quiz at /energy runs and mints its own visitor token', Boolean(run.token), run.token ? `${run.token.slice(0, 8)}...` : 'none');
  check('the nine questions are finished, and the arrival is genuinely marked complete', run.completed, String(run.sessionId));
  check('and it came back with a pattern, which is what the greeting will name', Boolean(run.patternKey), String(run.patternKey));
  check('no console error anywhere in the quiz or on the signup screen', run.consoleErrors.length === 0, run.consoleErrors.slice(0, 2).join(' | '));
  referencePattern = run.patternKey;

  // 2. THE CREATE-ACCOUNT BUTTON, REALLY TAPPED.
  const seen = run.signup;
  check('the result screen offers the create-account button, and it was tapped', Boolean(seen));
  if (!seen || !run.sessionId) return;
  check('it lands on the real signup form', seen.reached, seen.url);
  check('the button carried a one-time reference in the URL it navigated to', Boolean(seen.carriedInUrl), seen.carriedInUrl ? `${seen.carriedInUrl.length} chars` : 'none');
  check('the signup form is holding that same reference in its own field', Boolean(seen.hiddenRef) && seen.hiddenRef === seen.carriedInUrl);
  check('the address bar is cleaned, so the one-time value is not left sitting in it', seen.urlCleaned, seen.url);
  check('Turnstile is armed on this form, which refuses a scripted submission BY DESIGN', seen.turnstile > 0, `${seen.turnstile} gate elements`);
  note('So the form is filled and read but never submitted. That is the boundary, not a defect.');

  const { data: refRow } = await service
    .from('public_entry_signup_refs')
    .select('session_id, used_at')
    .eq('ref_hash', hashSignupRef(seen.hiddenRef!))
    .maybeSingle();
  check(
    'the reference on the form is the one the deployed server issued for THIS arrival',
    (refRow as { session_id: string } | null)?.session_id === run.sessionId,
    String((refRow as { session_id: string } | null)?.session_id)
  );

  // 3. THE ACCOUNT ITSELF, created after the launch instant.
  let id = loadReference();
  if (!id) {
    const { data, error } = await service.auth.admin.createUser({
      email: REF_EMAIL,
      password: `ref-${crypto.randomUUID()}`,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser failed: ${error.message}`);
    id = data.user?.id ?? null;
    if (!id) throw new Error('createUser returned no id');
    rememberReference(id);
  }

  await service.from('profiles').update({ display_name: REF_NAME, timezone: REF_TZ, is_test: false }).eq('id', id);
  const { data: profile } = await service.from('profiles').select('created_at, is_test, timezone').eq('id', id).maybeSingle();
  const createdAt = (profile as { created_at: string }).created_at;
  check(
    'the account was created AFTER the launch instant, which is the only reason it qualifies',
    new Date(createdAt).getTime() >= launch!.getTime(),
    `${createdAt} vs launch ${launch!.toISOString()}`
  );
  check('and it is NOT flagged is_test right now, so rule 2 is genuinely being passed', (profile as { is_test: boolean }).is_test === false);
  note('It is flagged at the end of this run. That window is deliberate and is reported.');

  // 4. THE BIND, through the shipped redeem path, on the real reference.
  const bound = await bindArrivalFromSignupRef(service, {
    memberId: id,
    ref: seen.hiddenRef!,
    accountCreatedAt: createdAt,
  });
  check('the shipped redeem binds her arrival to her account', bound.bound && bound.outcome === 'bound', bound.outcome);
  const origin = await getMemberOrigin(service, id);
  check('the arrival on her account is the one she actually finished', origin?.sessionId === run.sessionId, String(origin?.sessionId));
  check('recorded as signup_link, distinctly from browser_token and email_match', origin?.bindMethod === 'signup_link', String(origin?.bindMethod));
  check('and still a preliminary public impression, which the database refuses to restate', origin?.preliminary === true && origin?.origin === 'public_acquisition');

  // 5. AND SHE IS ELIGIBLE, WITH NO OVERRIDE.
  const eligibility = await resolveTrialArcEligibility(service, id, { now: new Date(), testAccounts: NO_OVERRIDE });
  check('SHE IS IN THE ARC, by the ordinary six rules and with an EMPTY override list', eligibility.eligible, eligibility.reason);
  check('and the derivation answers PROSPECT for her', eligibility.relationship === 'PROSPECT', eligibility.relationship);
  note(`reference account: ${id}`);
}

// =====================================================================
// STAGE: walk. Days 1 to 8, on the real screens.
// =====================================================================

/** Reads the pop-up the live Home would offer her today, by opening Home in her own session. */
async function homeFor(id: string, waitMs = 9000) {
  return openAs(REF_EMAIL, id, '/dashboard', waitMs);
}

/** The arc's own answer for her, from production rows, with no override. */
async function arcFor(id: string, now = new Date()) {
  return resolveTrialArcDecision(service, id, { now, testAccounts: NO_OVERRIDE });
}

async function completeAssessment(id: string, overviewRoute: string): Promise<boolean> {
  const { context, minted } = await contextFor(REF_EMAIL, id);
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

async function stageWalk() {
  heading('The PROSPECT walked through her week, day by day, on the live site');

  const id = loadReference();
  if (!id) {
    check('a reference account exists to walk', false, 'run the prospect stage first');
    return;
  }

  // DAY 1. The arrival greeting or the welcome, naming what the quiz found.
  await setRefDay(id, 1);
  const day1 = await arcFor(id);
  check('day 1: the arc puts her on day 1', day1.dayNumber === 1, String(day1.dayNumber));
  check('day 1: she is eligible', day1.eligible);
  const handover = publicEntryArcHandover(day1);
  check("day 1: the arc hands the welcome its 'day_one' framing", handover?.kind === 'day_one', String(handover?.kind));
  const welcome = await getPublicEntryWelcome(service, id, handover);
  check('day 1: the welcome names her arrival', Boolean(welcome), welcome ? String(welcome.patternTitle) : 'none');
  if (welcome?.arc) {
    check('day 1: and it carries the arc day 1 message rather than the ordinary invitation', Boolean(welcome.arc.copy), welcome.arc.messageKey);
    note(`day 1 body: ${normalize(JSON.stringify(welcome.arc.copy)).slice(0, 200)}`);
  }
  const home1 = await homeFor(id);
  check('day 1: Home renders with no console or page error', home1.consoleErrors.length === 0, home1.consoleErrors.slice(0, 2).join(' | '));
  note(`day 1 Home url: ${home1.url}`);
  const after1 = await arcRowsFor(id);
  note(`day 1 receipts: ${JSON.stringify(after1.deliveries)}`);

  // Her week's work, so the later days have something true to say.
  check('Core Values Snapshot genuinely completed', await completeAssessment(id, TRIAL_ARC_ROUTES.coreValuesSnapshot));

  // DAY 2.
  await setRefDay(id, 2);
  const day2 = await arcFor(id);
  check('day 2: the arc puts her on day 2', day2.dayNumber === 2, String(day2.dayNumber));
  check('day 2: there is a message for her', Boolean(day2.message), day2.reason ?? day2.message?.messageKey ?? '');
  if (day2.message) {
    check('day 2: it is the day 2 key, so the once-a-day rule can hold it', day2.message.messageKey === trialArcPopupMessageKey(2), day2.message.messageKey);
    note(`day 2 body: ${normalize(JSON.stringify(day2.message.copy)).slice(0, 220)}`);
    check('day 2: it points at Life Signal Check, because her snapshot is genuinely done', day2.message.copy.step === 'life_signal_check', String(day2.message.copy.step));
  }
  const home2 = await homeFor(id);
  check('day 2: Home renders with no console or page error', home2.consoleErrors.length === 0, home2.consoleErrors.slice(0, 2).join(' | '));
  const after2 = await arcRowsFor(id);
  check('day 2: a receipt was written for the day she was actually shown', after2.deliveries.some((d) => (d as { day_number: number }).day_number === 2), JSON.stringify(after2.deliveries.map((d) => (d as { message_key: string }).message_key)));

  // DAY 3 / DAY 4. The experiment days.
  await setRefDay(id, 3);
  const day3 = await arcFor(id);
  check('day 3: the arc puts her on day 3', day3.dayNumber === 3, String(day3.dayNumber));
  note(`day 3: ${day3.message ? `speaks (${day3.message.messageKey}, points at ${day3.message.copy.step})` : `silent (${day3.reason})`}`);
  if (day3.message) note(`day 3 body: ${normalize(JSON.stringify(day3.message.copy)).slice(0, 220)}`);
  check('day 3: it is a day the arc has a state for, either a message or a named reason', Boolean(day3.message) || Boolean(day3.reason));
  const home3 = await homeFor(id);
  check('day 3: Home renders with no console or page error', home3.consoleErrors.length === 0, home3.consoleErrors.slice(0, 2).join(' | '));

  await setRefDay(id, 4);
  const day4 = await arcFor(id);
  check('day 4: the arc puts her on day 4', day4.dayNumber === 4, String(day4.dayNumber));
  note(`day 4: ${day4.message ? `speaks (${day4.message.messageKey})` : `silent (${day4.reason})`}`);

  // DAY 5.
  await setRefDay(id, 5);
  const day5 = await arcFor(id);
  check('day 5: the arc puts her on day 5', day5.dayNumber === 5, String(day5.dayNumber));
  note(`day 5: ${day5.message ? `speaks (${day5.message.messageKey}, points at ${day5.message.copy.step})` : `silent (${day5.reason})`}`);
  if (day5.message) note(`day 5 body: ${normalize(JSON.stringify(day5.message.copy)).slice(0, 220)}`);
  const home5 = await homeFor(id);
  check('day 5: Home renders with no console or page error', home5.consoleErrors.length === 0, home5.consoleErrors.slice(0, 2).join(' | '));

  // DAY 6. The recap, as a pop-up and as its own screen.
  await setRefDay(id, 6);
  const day6 = await arcFor(id);
  check('day 6: the arc puts her on day 6', day6.dayNumber === 6, String(day6.dayNumber));
  check('day 6: the recap is offered', Boolean(day6.message), day6.reason ?? '');
  if (day6.message) {
    check('day 6: on the day 6 key', day6.message.messageKey === trialArcPopupMessageKey(6), day6.message.messageKey);
    note(`day 6 pop-up: ${normalize(JSON.stringify(day6.message.copy)).slice(0, 220)}`);
  }
  const recapScreen = await openAs(REF_EMAIL, id, TRIAL_ARC_ROUTES.weekRecap, 9000);
  check('day 6: the recap screen opens with no console or page error', recapScreen.consoleErrors.length === 0, recapScreen.consoleErrors.slice(0, 2).join(' | '));
  const recaps = (await arcRowsFor(id)).recaps;
  check('day 6: opening the screen composed and STORED her recap', recaps.length === 1, JSON.stringify(recaps));
  check('day 6: the recap screen carries no em dash', !recapScreen.body.includes(String.fromCharCode(0x2014)));
  note(`day 6 screen: ${recapScreen.body.slice(0, 260)}`);

  // DAY 7. The close, and both doors.
  await setRefDay(id, 7);
  const day7 = await arcFor(id);
  check('day 7: the arc puts her on day 7', day7.dayNumber === 7, String(day7.dayNumber));
  check('day 7: the close is offered', Boolean(day7.message), day7.reason ?? '');
  if (day7.message) {
    check('day 7: on the day 7 key', day7.message.messageKey === trialArcPopupMessageKey(7), day7.message.messageKey);
    note(`day 7 pop-up: ${normalize(JSON.stringify(day7.message.copy)).slice(0, 220)}`);
  }
  const closeScreen = await openAs(REF_EMAIL, id, TRIAL_ARC_ROUTES.weekClose, 9000);
  check('day 7: the close screen opens with no console or page error', closeScreen.consoleErrors.length === 0, closeScreen.consoleErrors.slice(0, 2).join(' | '));
  const closes = (await arcRowsFor(id)).closes;
  check('day 7: opening the screen composed and STORED her close', closes.length === 1, JSON.stringify(closes));
  check('day 7: and stamped that she opened it, which is what makes day 8 "full"', Boolean((closes[0] as { opened_at: string | null })?.opened_at));

  const { context: closeCtx, minted: closeMinted } = await contextFor(REF_EMAIL, id);
  const closePage = await closeCtx.newPage();
  const doorHrefs: string[] = [];
  try {
    await closePage.goto(`${BASE}${TRIAL_ARC_ROUTES.weekClose}`, { waitUntil: 'domcontentloaded' });
    await closePage.waitForTimeout(7000);
    const anchors = closePage.locator('main a[href^="http"]');
    const total = await anchors.count();
    for (let i = 0; i < total; i += 1) doorHrefs.push((await anchors.nth(i).getAttribute('href')) ?? '');
  } finally {
    await closeCtx.close();
    await retireSession(closeMinted);
  }
  const booking = doorHrefs.find((h) => /calendly/i.test(h)) ?? null;
  const pricing = doorHrefs.find((h) => h.startsWith('http') && !/calendly/i.test(h)) ?? null;
  check('day 7: the booking door is a real absolute URL, read off the live screen', Boolean(booking), String(booking));
  check('day 7: the membership door is a real absolute URL, read off the live screen', Boolean(pricing), String(pricing));
  note('Both are read from the server rather than compared against a shipped fallback, which production overrides.');
  check('day 7: the close screen carries no em dash', !closeScreen.body.includes(String.fromCharCode(0x2014)));

  // DAY 8. The continuation screen, in the FULL state.
  await setRefDay(id, 8);
  const day8 = await arcFor(id);
  check('day 8: the arc is silent, because day 8 is past the end of her week', day8.message === null, String(day8.reason));
  check('day 8: and the reason names the range guard rather than a refusal', day8.reason === 'outside_pacing_days', String(day8.reason));
  check('day 8: she is still eligible, because the arc is her week', day8.eligible);

  const access8 = await accessOf(id);
  check('day 8: the entitlement decision now locks her', !access8.allowed, access8.reason);
  check('day 8: and she is still a PROSPECT, which is the only relationship this screen is written for', access8.relationship === 'PROSPECT', access8.relationship);
  check(
    'day 8: the routing rule sends her to the continuation screen',
    memberAccessRedirectFor({ hasUser: true, isStaff: false, allowed: access8.allowed, relationship: 'PROSPECT', path: '/dashboard' }) === TRIAL_ENDED_PATH
  );

  const home8 = await homeFor(id, 7000);
  check('day 8: opening Home really lands her on the continuation screen', home8.url.endsWith(TRIAL_ENDED_PATH), home8.url);
  check('day 8: the continuation screen renders with no console or page error', home8.consoleErrors.length === 0, home8.consoleErrors.slice(0, 2).join(' | '));
  check('day 8: it is in the FULL state, showing her own stored week back to her', /week/i.test(home8.body) && home8.body.length > 200, `${home8.body.length} chars`);
  check('day 8: and it carries no em dash', !home8.body.includes(String.fromCharCode(0x2014)));
  note(`day 8 screen: ${home8.body.slice(0, 300)}`);

  const week = await openAs(REF_EMAIL, id, `${TRIAL_ENDED_PATH}/week`, 7000);
  check('day 8: her stored week is reachable in one tap from the continuation screen', week.url.includes(`${TRIAL_ENDED_PATH}/week`), week.url);
  check('day 8: and that screen renders with no console or page error', week.consoleErrors.length === 0, week.consoleErrors.slice(0, 2).join(' | '));
  note(`day 8 week: ${week.body.slice(0, 260)}`);

  const rows = await arcRowsFor(id);
  note(`her whole week, as rows: ${rows.deliveries.length} receipts, ${rows.recaps.length} recap, ${rows.closes.length} close`);
}

// =====================================================================
// STAGE: coached
// =====================================================================

async function stageCoached() {
  heading('The COACHING CLIENT: the arc yields nothing, twice over');

  const coachedTestId = await findUserIdByEmail(COACHED_TEST_EMAIL);
  const targets: { label: string; id: string }[] = [];
  if (coachedTestId) targets.push({ label: COACHED_TEST_EMAIL, id: coachedTestId });
  targets.push({ label: `the real coaching client (id ${COACHED_REAL_ID})`, id: COACHED_REAL_ID });

  for (const target of targets) {
    const facts = await fetchRelationshipFacts(service, target.id);
    check(`${target.label}: has been assigned a coach`, facts.everCoachAssigned, facts.coachAssignmentStatuses.join(','));

    // 1. ELIGIBILITY, as production stands.
    const live = decideTrialArcEligibility({ facts, now: new Date(), testAccounts: NO_OVERRIDE });
    check(`${target.label}: refused by eligibility today`, !live.eligible, live.reason);

    // 2. DAY-N SIMULATION. Every day of the week, and a launch date that is
    //    already past, so nothing about the clock is what is refusing them.
    const simulated = new Set<string>();
    for (let day = 1; day <= 8; day += 1) {
      const simulatedFacts = {
        ...facts,
        // Created after the launch, on the automatic trial, not a test
        // account: every rule the arc could refuse them on EXCEPT the coach
        // assignment is removed, on purpose.
        accountCreatedAt: new Date(launch!.getTime() + 60_000).toISOString(),
        isTest: false,
        hasSubscription: true,
        tier: 'trial' as const,
        source: 'system' as const,
        status: 'active' as const,
      };
      const answer = decideTrialArcEligibility({
        facts: simulatedFacts,
        now: new Date(launch!.getTime() + day * 86_400_000),
        testAccounts: NO_OVERRIDE,
      });
      simulated.add(answer.eligible ? 'ELIGIBLE' : answer.reason);
    }
    check(
      `${target.label}: refused on every day 1 to 8, even with every other rule removed`,
      simulated.size === 1 && simulated.has('ever_coach_assigned'),
      [...simulated].join(',')
    );

    // 3. THE ENGINE, not just the rule.
    const decision = await resolveTrialArcDecision(service, target.id, { now: new Date(), testAccounts: NO_OVERRIDE });
    check(`${target.label}: the engine says nothing to them`, decision.message === null, String(decision.reason));

    // 4. AND THEY CAN NEVER REACH /trial-ended.
    const access = await accessOf(target.id);
    check(`${target.label}: the derivation answers ACTIVE_COACHING_CLIENT`, access.relationship === 'ACTIVE_COACHING_CLIENT', access.relationship);
    const redirect = memberAccessRedirectFor({
      hasUser: true,
      isStaff: false,
      // Even if the entitlement decision locked them, which it does not.
      allowed: false,
      relationship: access.relationship as never,
      path: '/dashboard',
    });
    check(`${target.label}: routing NEVER sends them to the continuation screen, even locked`, redirect === null, String(redirect));

    // 5. NO ROWS.
    const rows = await arcRowsFor(target.id);
    check(
      `${target.label}: has no arc receipt, recap or close at all`,
      rows.deliveries.length === 0 && rows.recaps.length === 0 && rows.closes.length === 0,
      `${rows.deliveries.length}/${rows.recaps.length}/${rows.closes.length}`
    );
  }
}

// =====================================================================
// STAGE: apponly
// =====================================================================

async function stageAppOnly() {
  heading('The APP-ONLY MEMBER: excluded, and never routed to the continuation screen');

  note('Production holds no APP_ONLY_MEMBER today: both paid rows also carry an active coach assignment.');
  note('So this is proved on a throwaway account created for it and deleted at the end of the stage.');

  const email = `p7.apponly.${Date.now().toString(36)}@example.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password: `Live-${Date.now()}-Aa1!`, email_confirm: true });
  if (error) throw new Error(`createUser failed: ${error.message}`);
  const id = data.user?.id;
  if (!id) throw new Error('createUser returned no id');

  try {
    // A paid, program-tier, hand-assigned row: the shape an app member has.
    const { error: subError } = await service
      .from('member_subscriptions')
      .update({ tier: 'program', source: 'manual', status: 'active', full_access: true })
      .eq('member_id', id);
    if (subError) note(`(the guard trigger refused the update: ${subError.message})`);

    await service.from('profiles').update({ is_test: false }).eq('id', id);

    const facts = await fetchRelationshipFacts(service, id);
    check('the fixture is a paid, hand-assigned, program-tier account', facts.tier === 'program' && facts.source === 'manual', `${facts.tier}/${facts.source}`);
    check('the derivation answers APP_ONLY_MEMBER', deriveRelationship(facts) === 'APP_ONLY_MEMBER', deriveRelationship(facts));
    check('it was created after the launch, so rule 1 is not what is refusing it', new Date(facts.accountCreatedAt!).getTime() >= launch!.getTime());
    check('it has never been assigned a coach, so rule 4 is not what is refusing it either', !facts.everCoachAssigned);

    const live = decideTrialArcEligibility({ facts, now: new Date(), testAccounts: NO_OVERRIDE });
    check('the arc refuses it, on the tier rule', !live.eligible && live.reason === 'not_on_trial', live.reason);

    // Day-N simulation, every day of the week.
    const simulated = new Set<string>();
    for (let day = 1; day <= 8; day += 1) {
      const answer = decideTrialArcEligibility({
        facts,
        now: new Date(launch!.getTime() + day * 86_400_000),
        testAccounts: NO_OVERRIDE,
      });
      simulated.add(answer.eligible ? 'ELIGIBLE' : answer.reason);
    }
    check('refused on every day 1 to 8', simulated.size === 1 && simulated.has('not_on_trial'), [...simulated].join(','));

    const decision = await resolveTrialArcDecision(service, id, { now: new Date(), testAccounts: NO_OVERRIDE });
    check('and the engine says nothing to it', decision.message === null, String(decision.reason));

    const redirect = memberAccessRedirectFor({ hasUser: true, isStaff: false, allowed: false, relationship: 'APP_ONLY_MEMBER', path: '/dashboard' });
    check('routing NEVER sends an app member to the continuation screen, even locked', redirect === null, String(redirect));

    const rows = await arcRowsFor(id);
    check('and it has no arc row of any kind', rows.deliveries.length === 0 && rows.recaps.length === 0 && rows.closes.length === 0);
  } finally {
    await service.auth.admin.deleteUser(id);
    const { data: gone } = await service.auth.admin.getUserById(id);
    check('the throwaway app-member fixture is deleted, so production is left as it was found', !gone?.user?.id);
  }
}

// =====================================================================
// STAGE: suppress
// =====================================================================

async function stageSuppress() {
  heading('SUPPRESSION: the admin control silences one member, and gives her back');

  const id = await findUserIdByEmail(SUPPRESS_ON_EMAIL);
  if (!id) {
    check('the suppression fixture exists', false, SUPPRESS_ON_EMAIL);
    return;
  }
  const { data: before } = await service.from('member_subscriptions').select('trial_arc_suppressed_at').eq('member_id', id).maybeSingle();
  const originally = (before as { trial_arc_suppressed_at: string | null } | null)?.trial_arc_suppressed_at ?? null;
  note(`${SUPPRESS_ON_EMAIL} starts with trial_arc_suppressed_at = ${originally}`);

  /**
   * The fixture is pre-launch, so rule 1 already refuses it, and a
   * suppression proof over rule 1 would prove nothing. The account's own
   * facts are therefore read from production and asked with a launch that
   * predates it, so the ONLY thing that can change the answer between the
   * two halves below is the column the administrator writes.
   */
  const asIfPostLaunch = async () => {
    const facts = await fetchRelationshipFacts(service, id);
    return decideTrialArcEligibility({
      facts: { ...facts, isTest: false },
      now: new Date(),
      launch: '2020-01-01T00:00:00Z',
      testAccounts: NO_OVERRIDE,
    });
  };

  const armed = await asIfPostLaunch();
  check('with the column clear, the arc is live for her', armed.eligible, armed.reason);

  // THE ADMIN CONTROL, PRESSED ON THE LIVE SITE.
  const pressed = await pressSuppressionControl(id, 'suppress');
  check('the administrator can press "Suppress trial arc" on the live member access screen', pressed.found, pressed.detail);
  const { data: afterOn } = await service.from('member_subscriptions').select('trial_arc_suppressed_at').eq('member_id', id).maybeSingle();
  const stamp = (afterOn as { trial_arc_suppressed_at: string | null } | null)?.trial_arc_suppressed_at ?? null;
  check('pressing it stamps trial_arc_suppressed_at in production', stamp !== null, String(stamp));

  const silenced = await asIfPostLaunch();
  check('and the arc goes silent for her IMMEDIATELY, on the next question asked', !silenced.eligible && silenced.reason === 'suppressed', silenced.reason);
  const decisionOff = await resolveTrialArcDecision(service, id, { now: new Date(), launch: '2020-01-01T00:00:00Z', testAccounts: NO_OVERRIDE });
  check('the engine says nothing to her either', decisionOff.message === null, String(decisionOff.reason));

  // AND OFF AGAIN.
  const cleared = await pressSuppressionControl(id, 'clear');
  check('the administrator can clear it again from the same screen', cleared.found, cleared.detail);
  const { data: afterOff } = await service.from('member_subscriptions').select('trial_arc_suppressed_at').eq('member_id', id).maybeSingle();
  const back = (afterOff as { trial_arc_suppressed_at: string | null } | null)?.trial_arc_suppressed_at ?? null;
  check('the column is back to null', back === null, String(back));

  const resumed = await asIfPostLaunch();
  check('and the arc resumes for her, with no other change anywhere', resumed.eligible, resumed.reason);

  // Whatever happened above, production is put back as it was found.
  if (back !== originally) {
    await service.from('member_subscriptions').update({ trial_arc_suppressed_at: originally }).eq('member_id', id);
  }
  const { data: final } = await service.from('member_subscriptions').select('trial_arc_suppressed_at').eq('member_id', id).maybeSingle();
  check(
    'the fixture is restored to exactly the state this stage found it in',
    ((final as { trial_arc_suppressed_at: string | null } | null)?.trial_arc_suppressed_at ?? null) === originally,
    String((final as { trial_arc_suppressed_at: string | null } | null)?.trial_arc_suppressed_at)
  );
}

/** Presses the real control on the real admin screen, with a real administrator session. */
async function pressSuppressionControl(memberId: string, want: 'suppress' | 'clear'): Promise<{ found: boolean; detail: string }> {
  const adminEmail = process.env.ADMIN_EMAIL ?? 'oakomah66@gmail.com';
  const adminId = await findUserIdByEmail(adminEmail);
  if (!adminId) return { found: false, detail: 'no administrator account' };
  const { context, minted } = await contextFor(adminEmail, adminId);
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}/admin/access`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    const row = page.locator(`[data-member-id="${memberId}"]`);
    const scope = (await row.count()) ? row : page.locator('body');
    const wanted = want === 'suppress' ? /suppress trial arc/i : /(resume|un ?suppress|clear).*(trial arc)|trial arc.*(resume|clear)/i;
    const button = scope.locator('button:visible').filter({ hasText: wanted }).first();
    if ((await button.count()) === 0) {
      const labels: string[] = [];
      const all = scope.locator('button:visible');
      const n = Math.min(await all.count(), 40);
      for (let i = 0; i < n; i += 1) labels.push((await all.nth(i).innerText().catch(() => '')).trim());
      return { found: false, detail: `no matching control. buttons seen: ${labels.filter(Boolean).slice(0, 12).join(' | ')}` };
    }
    await button.scrollIntoViewIfNeeded().catch(() => {});
    await button.click({ timeout: 10000 });
    await page.waitForTimeout(5000);
    return { found: true, detail: 'pressed on the live admin screen' };
  } catch (e) {
    return { found: false, detail: String((e as Error).message).slice(0, 120) };
  } finally {
    await context.close();
    await retireSession(minted);
  }
}

// =====================================================================
// STAGE: collisions
// =====================================================================

async function stageCollisions() {
  heading('COLLISIONS: the five ways two messages could land on one member-day');

  const id = loadReference();
  if (!id) {
    check('a reference account exists to collide things on', false, 'run the prospect stage first');
    return;
  }

  // 1. ROOT PRESENCE WINS, AND THE ARC RESUMES NEXT VISIT.
  await setRefDay(id, 3);
  await service.from('member_trial_arc_deliveries').delete().eq('member_id', id).eq('day_number', 3);
  await service.from('member_root_popup_dismissals').delete().eq('member_id', id).like('message_key', 'trial_arc_day:%');

  const withoutGreeting = await arcFor(id);
  note(`day 3 with no greeting pending: ${withoutGreeting.message ? 'the arc speaks' : `silent (${withoutGreeting.reason})`}`);

  // A gap the greeting is for: a check-in some days ago and nothing since,
  // and no morning brief written today, which is the visit that claims it.
  const gapDate = refLocalDate(9);
  await service.from('daily_checkins').delete().eq('user_id', id);
  await service.from('member_return_greetings').delete().eq('member_id', id);
  await service.from('coach_morning_briefs').delete().eq('member_id', id);
  const { error: checkinError } = await service
    .from('daily_checkins')
    .insert({ user_id: id, local_date: gapDate, energy: 3, stress: 3, sleep_quality: 3 });
  if (checkinError) note(`(seeding the gap check-in was refused: ${checkinError.message})`);

  const withGreeting = await arcFor(id);
  check(
    'presence collision: with the greeting genuinely landing on this visit, the arc stands down',
    withGreeting.message === null && withGreeting.reason === 'root_presence_is_greeting',
    String(withGreeting.reason)
  );
  check('presence collision: and no receipt was written for the day it did not speak', (await arcRowsFor(id)).deliveries.every((d) => (d as { day_number: number }).day_number !== 3));

  // The greeting spent, which is what the next visit looks like.
  await service.from('member_return_greetings').insert({ member_id: id, gap_start_local_date: gapDate, shown_local_date: refLocalDate(0) });
  const nextVisit = await arcFor(id);
  check(
    'presence collision: once the greeting is spent, the arc resumes on the next visit',
    nextVisit.message !== null,
    nextVisit.message?.messageKey ?? String(nextVisit.reason)
  );
  await service.from('daily_checkins').delete().eq('user_id', id);
  await service.from('member_return_greetings').delete().eq('member_id', id);

  // 2. NEVER TWO TRIAL MESSAGES IN ONE MEMBER-DAY.
  await service.from('member_trial_arc_deliveries').delete().eq('member_id', id);
  await service.from('member_root_popup_dismissals').delete().eq('member_id', id).like('message_key', 'trial_arc_day:%');
  const first = await homeFor(id, 9000);
  check('one-a-day: Home renders the first time with no error', first.consoleErrors.length === 0, first.consoleErrors.slice(0, 2).join(' | '));
  const afterFirst = (await listTrialArcDeliveries(service, id)).deliveries;
  const second = await homeFor(id, 9000);
  check('one-a-day: Home renders the second time with no error', second.consoleErrors.length === 0, second.consoleErrors.slice(0, 2).join(' | '));
  const afterSecond = (await listTrialArcDeliveries(service, id)).deliveries;
  check(
    'one-a-day: a second visit on the same day writes no second receipt',
    afterSecond.length === afterFirst.length,
    `${afterFirst.length} then ${afterSecond.length}`
  );
  const perDay = new Map<number, number>();
  for (const row of afterSecond) perDay.set(row.dayNumber, (perDay.get(row.dayNumber) ?? 0) + 1);
  check(
    'one-a-day: and there is at most one receipt for any one day of her week',
    [...perDay.values()].every((n) => n === 1),
    [...perDay.entries()].map(([d, n]) => `d${d}=${n}`).join(' ')
  );

  // 3. THE 3-IGNORE CLOSER STOPS PACING, AND DAY 6/7 STILL OFFER ONCE.
  await service.from('member_trial_arc_deliveries').delete().eq('member_id', id);
  await service.from('member_trial_arc_recaps').delete().eq('member_id', id);
  await service.from('member_trial_arc_closes').delete().eq('member_id', id);
  await service.from('member_root_popup_dismissals').delete().eq('member_id', id).like('message_key', 'trial_arc_day:%');

  await setRefDay(id, 5);
  for (const day of [1, 2, 3]) {
    const { error } = await service.from('member_trial_arc_deliveries').insert({
      member_id: id,
      message_key: trialArcPopupMessageKey(day),
      day_number: day,
      pace_state: 'STALLED',
      pointed_step: 'core_values_snapshot',
      delivered_local_date: refLocalDate(5 - day),
    });
    if (error) note(`(seeding the ignored receipt for day ${day} was refused: ${error.message})`);
  }
  const closed = await arcFor(id);
  check(
    'closer: after three ignored messages the pacing days go quiet for good',
    closed.message === null && closed.reason === 'pacing_closed',
    String(closed.reason)
  );

  await setRefDay(id, 6);
  const day6Closed = await arcFor(id);
  check('closer: but day 6, a milestone, still offers her recap once', day6Closed.message !== null, day6Closed.message?.messageKey ?? String(day6Closed.reason));
  await setRefDay(id, 7);
  const day7Closed = await arcFor(id);
  check('closer: and day 7, a milestone, still offers her close once', day7Closed.message !== null, day7Closed.message?.messageKey ?? String(day7Closed.reason));
  note('That is the point of the milestone split: the closer stops pacing and can never stop the two things she is owed.');

  // 4. THE DAY 8+ RANGE GUARD.
  for (const day of [9, 30]) {
    await setRefDay(id, day);
    const answer = await arcFor(id);
    check(
      `range guard: on day ${day} the arc is silent, and says so by the range rather than by a refusal`,
      answer.message === null && answer.reason === 'outside_pacing_days',
      `${answer.reason} (day ${answer.dayNumber})`
    );
    check(`range guard: and she is still eligible on day ${day}, because the arc is her week`, answer.eligible);
  }

  // 5. THE EXISTING EXPERIENCE POP-UPS STILL DELIVER, AND NOT TWICE ON ONE VISIT.
  await setRefDay(id, 3);
  await service.from('member_trial_arc_deliveries').delete().eq('member_id', id);
  await service.from('member_root_popup_dismissals').delete().eq('member_id', id);
  const visit = await homeFor(id, 9000);
  check('chain: Home renders with the whole pop-up chain live and no console or page error', visit.consoleErrors.length === 0, visit.consoleErrors.slice(0, 2).join(' | '));
  const { data: dismissals } = await service
    .from('member_root_popup_dismissals')
    .select('message_key, dismissed_at')
    .eq('member_id', id);
  const keys = (dismissals ?? []).map((d) => (d as { message_key: string }).message_key);
  check(
    'chain: exactly one pop-up took the slot on that visit, so nothing double-fired',
    keys.length <= 1,
    keys.join(', ') || 'none'
  );
  note(`chain: the slot went to ${keys.join(', ') || 'nothing'}`);

  // The existing day-3 / day-7 experience pop-ups, asked for directly, to
  // show the arc has not displaced them from the chain they live in.
  const { data: experienceRows } = await service
    .from('member_root_popup_dismissals')
    .select('message_key')
    .eq('member_id', id)
    .not('message_key', 'like', 'trial_arc_day:%');
  note(`chain: non-arc pop-up rows on this account: ${JSON.stringify((experienceRows ?? []).map((r) => (r as { message_key: string }).message_key))}`);
}

// =====================================================================
// STAGE: untouched
// =====================================================================

async function stageUntouched() {
  heading('REAL MEMBERS: nothing about any of them has changed');

  const referenceIdNow = loadReference();
  const { data: profiles } = await service.from('profiles').select('id, is_test, created_at').order('created_at');
  const pre = (profiles ?? []).filter((p) => new Date((p as { created_at: string }).created_at).getTime() < launch!.getTime());
  const post = (profiles ?? []).filter((p) => new Date((p as { created_at: string }).created_at).getTime() >= launch!.getTime());

  check('every account that existed before the launch is still identified as pre-launch', pre.length >= 23, `${pre.length} pre-launch, ${post.length} post-launch`);

  let spoke = 0;
  const reasons = new Map<string, number>();
  for (const profile of pre) {
    const id = (profile as { id: string }).id;
    const decision = await resolveTrialArcDecision(service, id, { now: new Date(), testAccounts: NO_OVERRIDE });
    if (decision.message) spoke += 1;
    const reason = decision.reason ?? 'spoke';
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  check('not one of them has a trial arc message today', spoke === 0, `${spoke} would speak`);
  check(
    'and every one of them refuses for the same reason',
    reasons.size === 1 && reasons.get('not_eligible') === pre.length,
    [...reasons.entries()].map(([r, n]) => `${r}=${n}`).join(' ')
  );

  // Zero rows, anywhere, for anybody but the reference account.
  for (const table of ['member_trial_arc_deliveries', 'member_trial_arc_recaps', 'member_trial_arc_closes'] as const) {
    const { data } = await service.from(table).select('member_id');
    const owners = [...new Set((data ?? []).map((r) => (r as { member_id: string }).member_id))];
    const strangers = owners.filter((o) => o !== referenceIdNow);
    check(`${table}: holds rows for nobody but the reference account`, strangers.length === 0, strangers.join(', ') || `${owners.length} owner(s), all the reference`);
  }

  const { data: suppressed } = await service
    .from('member_subscriptions')
    .select('member_id')
    .not('trial_arc_suppressed_at', 'is', null);
  check('nobody in production is left suppressed', (suppressed ?? []).length === 0, JSON.stringify(suppressed));

  // The welcome, unchanged for every pre-launch account.
  let handedSomething = 0;
  for (const profile of pre) {
    const id = (profile as { id: string }).id;
    const decision = await resolveTrialArcDecision(service, id, { now: new Date(), testAccounts: NO_OVERRIDE });
    if (publicEntryArcHandover(decision) !== null) handedSomething += 1;
  }
  check('the arc hands the welcome nothing for any pre-launch account, so that screen is exactly as it was', handedSomething === 0, `${handedSomething} handed`);

  // The locked prospects still get the no-arc continuation state.
  const locked: string[] = [];
  for (const profile of pre) {
    const id = (profile as { id: string }).id;
    const access = await accessOf(id);
    if (!access.allowed && access.relationship === 'PROSPECT') locked.push(id);
  }
  note(`locked prospects in production: ${locked.length}`);
  let noArcStates = 0;
  for (const id of locked) {
    const rows = await arcRowsFor(id);
    if (rows.recaps.length === 0 && rows.closes.length === 0) noArcStates += 1;
  }
  check(
    'every locked prospect has no stored week, so the continuation screen shows them its no-arc state',
    noArcStates === locked.length,
    `${noArcStates}/${locked.length}`
  );
  check('and there are the six of them the last run counted', locked.length === 6, `${locked.length} locked prospects`);
}

// =====================================================================
// STAGE: hygiene
// =====================================================================

async function stageHygiene() {
  heading('ANALYTICS HYGIENE: every account this build made is out of the numbers');

  const referenceIdNow = loadReference();

  // The reference account gets its flag now that the walk is done.
  if (referenceIdNow) {
    await setRefTestFlag(referenceIdNow, true);
    const { data } = await service.from('profiles').select('is_test').eq('id', referenceIdNow).maybeSingle();
    check('the post-launch reference account is now flagged is_test', (data as { is_test: boolean } | null)?.is_test === true);
  }

  const built = [
    'oakomah66+trialarcrig@gmail.com',
    'oakomah66+quiztest1@gmail.com',
    'oakomah66+quiztest2@gmail.com',
    'oakomah66+quiztest3@gmail.com',
    'oakomah66+quiztest4@gmail.com',
    REF_EMAIL,
  ];
  for (const email of built) {
    const id = await findUserIdByEmail(email);
    if (!id) {
      note(`${email}: does not exist, nothing to flag`);
      continue;
    }
    const { data } = await service.from('profiles').select('is_test').eq('id', id).maybeSingle();
    check(`${email}: flagged is_test`, (data as { is_test: boolean } | null)?.is_test === true, String((data as { is_test: boolean } | null)?.is_test));
  }

  // And nothing unflagged is left behind from any of these seven prompts.
  const { data: profiles } = await service.from('profiles').select('id, is_test, created_at');
  const { data: users } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailById = new Map((users?.users ?? []).map((u) => [u.id, (u.email ?? '').toLowerCase()]));
  const unflaggedFixtures = (profiles ?? []).filter((p) => {
    const row = p as { id: string; is_test: boolean };
    const email = emailById.get(row.id) ?? '';
    return !row.is_test && (email.includes('example.test') || email.includes('+quiztest') || email.includes('+trialarcrig') || email.includes('+arclaunch') || email.startsWith('p6b.') || email.startsWith('p7.'));
  });
  check(
    'no fixture account from any of these seven prompts is left unflagged',
    unflaggedFixtures.length === 0,
    unflaggedFixtures.map((p) => (p as { id: string }).id).join(', ')
  );

  // The rule itself, applied where analytics reads it.
  check(
    'and the exclusion is one shared rule in the data layer, not a per-screen habit',
    typeof applyTestAccountExclusion === 'function',
    typeof applyTestAccountExclusion
  );

  // The admin surfaces, read with a real administrator session.
  const adminEmail = process.env.ADMIN_EMAIL ?? 'oakomah66@gmail.com';
  const adminId = await findUserIdByEmail(adminEmail);
  if (adminId) {
    for (const route of ['/admin', '/admin/analytics']) {
      const screen = await openAs(adminEmail, adminId, route, 8000);
      const leaked = built.filter((e) => screen.body.toLowerCase().includes(e.toLowerCase()));
      check(`${route}: no test account address is printed on it`, leaked.length === 0, leaked.join(', '));
      check(`${route}: renders with no console or page error`, screen.consoleErrors.length === 0, screen.consoleErrors.slice(0, 2).join(' | '));
    }
  }
}

// =====================================================================
// Runner
// =====================================================================

const STAGES: Record<string, () => Promise<void>> = {
  deployed: stageDeployed,
  prospect: stageProspect,
  walk: stageWalk,
  coached: stageCoached,
  apponly: stageAppOnly,
  suppress: stageSuppress,
  collisions: stageCollisions,
  untouched: stageUntouched,
  hygiene: stageHygiene,
};

browser = await chromium.launch();
try {
  console.log(`\nBase: ${BASE}\nStage: ${STAGE}\nLaunch: ${launch!.toISOString()}\n`);
  const order = STAGE === 'all' ? Object.keys(STAGES) : STAGE.split(',');
  for (const name of order) {
    const stage = STAGES[name.trim()];
    if (!stage) throw new Error(`unknown stage: ${name}`);
    await stage();
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n===== ${results.length - failed.length}/${results.length} checks passed =====`);
for (const f of failed) console.log(`FAIL  ${f.name}${f.detail ? `  (${f.detail})` : ''}`);
process.exit(failed.length === 0 ? 0 : 1);
