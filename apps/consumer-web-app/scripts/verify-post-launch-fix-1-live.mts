/**
 * POST-LAUNCH FIX 1, DRIVEN ON THE LIVE SITE.
 *
 * Three fixes, three stages, and one honest boundary stated in each.
 *
 * TURNSTILE (task A). Two halves, and they prove different things.
 *   The LIFECYCLE half drives the real deployed component with a stand-in
 *   for Cloudflare's own widget, installed before any script loads, and a
 *   clock this run can move. That is what makes "the token is refreshed
 *   when it goes stale" and "an expiry re-arms itself" observable at all:
 *   a real Turnstile token cannot be aged five minutes in a test, and
 *   Cloudflare will not solve a challenge for a headless browser anyway.
 *   What is being driven is the shipped bundle, on the live domain, with
 *   this app's own state machine deciding. Cloudflare's half is theirs.
 *   The SUBMISSION half uses the real widget and the real Server Action,
 *   with no stand-in at all: a genuine signup is attempted on the live
 *   form, Turnstile refuses it because the browser is automation, and the
 *   two things that matter are counted from the outside: the submission
 *   was retried once on its own, and the one-time quiz pass was still
 *   unspent afterwards.
 *
 * THE RESULT SCREEN (task B). Entirely real: nine questions answered on
 * app.mefwellness.com at a phone viewport, and the first screenful measured
 * in the browser from the actual laid-out geometry.
 *
 * ONE KNOCK (task C). Real too, on a test account, with one stated
 * simulation: a day cannot be waited out inside a verification run, so the
 * "and tomorrow it knocks" half moves that account's own completion
 * instant back thirty hours and puts it back afterwards. Everything else
 * (the completion, the pop-up chain, the screens) is production.
 *
 * NOTHING BUT TEST ACCOUNTS IS TOUCHED. Every account created here is
 * deleted, and the one existing fixture that is modified is restored.
 *
 * STAGES:  housekeeping  lifecycle  submission  result  oneknock  arc  all
 *
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   BASE_URL=https://app.mefwellness.com npx tsx scripts/verify-post-launch-fix-1-live.mts all
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
// @ts-expect-error the shared minting helper is plain JavaScript, by design
import { mintSessionCookies, retireSession } from './lib/mint-session.mjs';
import { hashSignupRef, redeemSignupRef } from '../lib/public-entry/signupRef';
import { TRIAL_ARC_LAUNCH } from '../lib/trial-arc/config';
import { TOKEN_FRESHNESS_MS } from '../lib/turnstile/tokenLifecycle';

const BASE = process.env.BASE_URL || 'https://app.mefwellness.com';
const OUT = process.env.OUT_DIR || '/tmp';
const PHONE = { width: 390, height: 664 };
const STAGE = process.argv[2] || 'all';

/** The account this run drives task C on. Already a test account. */
const ONE_KNOCK_MEMBER = 'oakomah66+quiztest3@gmail.com';
/** A throwaway address for the submission stage. Deleted at the end if it ever exists. */
const SIGNUP_PROBE = `oakomah66+plf1probe@gmail.com`;

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
function note(text: string): void {
  console.log(`      ${text}`);
}

const service: SupabaseClient = createClient(
  process.env.PROD_SUPABASE_URL!,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE!, 'utf8').trim(),
  { auth: { persistSession: false, autoRefreshToken: false } }
);

let browser: Browser;
const createdUserIds: string[] = [];
/** Every signed-out quiz session this run creates, deleted at the end. */
const createdVisitorTokens: string[] = [];

/**
 * tsx compiles this file with esbuild's keep-names on, which rewrites a
 * named function inside a page.evaluate body into a call to esbuild's own
 * `__name` helper. That helper exists in this process, not in the page, so
 * the evaluate throws ReferenceError there. Every context this run opens
 * carries a one line identity shim so the browser has one too.
 */
async function newContext(options: Parameters<Browser['newContext']>[0] = {}): Promise<BrowserContext> {
  const context = await browser.newContext(options);
  await context.addInitScript('globalThis.__name = globalThis.__name || function (f) { return f; };');
  return context;
}

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

// =====================================================================
// The stand-in widget: everything Cloudflare's api.js exposes, and a clock
// =====================================================================

/**
 * Installed before a single script runs, so `loadTurnstileScript` sees a
 * `window.turnstile` already present and never fetches Cloudflare's own.
 * From then on the DEPLOYED component is driving this object, and every
 * call it makes is recorded where the test can read it.
 *
 * `Date.now` is shifted by a value the page can change, which is the only
 * way to age a token past its freshness window inside one run. It is a
 * monotonic offset, never a frozen or reversed clock.
 */
const FAKE_TURNSTILE = `
  window.__mefClockOffset = 0;
  const realNow = Date.now.bind(Date);
  Date.now = () => realNow() + window.__mefClockOffset;
  window.__mefTurnstile = { renders: [], resets: 0, removes: 0, callbacks: null };
  window.turnstile = {
    render: (container, options) => {
      window.__mefTurnstile.renders.push({
        sitekey: options.sitekey,
        appearance: options.appearance,
        refreshExpired: options['refresh-expired'],
        refreshTimeout: options['refresh-timeout'],
      });
      window.__mefTurnstile.callbacks = options;
      return 'fake-widget-1';
    },
    reset: () => { window.__mefTurnstile.resets += 1; },
    remove: () => { window.__mefTurnstile.removes += 1; },
  };
  window.__mefSolve = (token) => window.__mefTurnstile.callbacks.callback(token);
  window.__mefExpire = () => window.__mefTurnstile.callbacks['expired-callback']();
  window.__mefError = () => window.__mefTurnstile.callbacks['error-callback']();
`;

async function stageLifecycle(): Promise<void> {
  console.log('\n--- TASK A, HALF 1: the token lifecycle, on the deployed bundle ---');
  const context = await newContext({ viewport: PHONE });
  await context.addInitScript(FAKE_TURNSTILE);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && isRealConsoleError(m.text())) errors.push(m.text());
  });

  await page.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  const rendered = await page.evaluate(() => window.__mefTurnstile.renders);
  check('the live signup form arms a bot check at all', rendered.length === 1, JSON.stringify(rendered[0] ?? null));
  check(
    'and asks Cloudflare to refresh an expired or timed out challenge itself',
    rendered[0]?.refreshExpired === 'auto' && rendered[0]?.refreshTimeout === 'auto'
  );

  // 1. THE ORDINARY PATH. A solved token is used as it is, with no extra
  //    challenge started.
  await page.evaluate(() => window.__mefSolve('token-at-page-load'));
  const beforeFresh = await page.evaluate(() => window.__mefTurnstile.resets);
  await page.waitForTimeout(2000);
  const afterFresh = await page.evaluate(() => window.__mefTurnstile.resets);
  check('a solved token is simply held, with no extra challenge started', afterFresh === beforeFresh, `resets ${beforeFresh} -> ${afterFresh}`);

  // 2. THE FAILURE THAT USED TO BE TERMINAL. An expiry now re-arms the
  //    widget on its own, with nobody touching anything.
  const beforeExpiry = await page.evaluate(() => window.__mefTurnstile.resets);
  await page.evaluate(() => window.__mefExpire());
  await page.waitForTimeout(2000);
  const afterExpiry = await page.evaluate(() => window.__mefTurnstile.resets);
  check(
    'an expired challenge re-arms itself, with no tap and no submit',
    afterExpiry === beforeExpiry + 1,
    `resets ${beforeExpiry} -> ${afterExpiry}`
  );

  await page.evaluate(() => window.__mefSolve('token-after-expiry'));

  // 3. THE ERROR CASE, which is what an iOS suspend looks like from here.
  const beforeError = await page.evaluate(() => window.__mefTurnstile.resets);
  await page.evaluate(() => window.__mefError());
  await page.waitForTimeout(2000);
  const afterError = await page.evaluate(() => window.__mefTurnstile.resets);
  check(
    'an errored challenge re-arms itself too',
    afterError === beforeError + 1,
    `resets ${beforeError} -> ${afterError}`
  );
  await page.evaluate(() => window.__mefSolve('token-after-error'));

  // 4. THE STALE TOKEN. Age the clock past the freshness window and come
  //    back to the tab, which is the mail-app case exactly.
  const beforeStale = await page.evaluate(() => window.__mefTurnstile.resets);
  await page.evaluate((ms) => {
    window.__mefClockOffset += ms + 5000;
  }, TOKEN_FRESHNESS_MS);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(1200);
  const afterStale = await page.evaluate(() => window.__mefTurnstile.resets);
  check(
    'coming back to the tab with a stale token starts a fresh challenge',
    afterStale === beforeStale + 1,
    `resets ${beforeStale} -> ${afterStale}, aged ${Math.round(TOKEN_FRESHNESS_MS / 1000)}s`
  );

  // 5. AND A TOKEN THAT IS STILL YOUNG IS LEFT ALONE.
  await page.evaluate(() => window.__mefSolve('token-still-young'));
  const beforeYoung = await page.evaluate(() => window.__mefTurnstile.resets);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(800);
  const afterYoung = await page.evaluate(() => window.__mefTurnstile.resets);
  check('and a token that is still young is left alone', afterYoung === beforeYoung);

  // 6. THE SUBMIT PATH ITSELF, with a dead widget. Before the fix this
  //    waited eight seconds on nothing; now pressing the button is what
  //    starts the challenge.
  await page.evaluate(() => window.__mefExpire());
  await page.waitForTimeout(50);
  const beforeSubmit = await page.evaluate(() => window.__mefTurnstile.resets);
  await page.fill('#email', 'not-a-real-signup@example.test');
  await page.fill('#password', 'A-strong-password-1!');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1200);
  const afterSubmit = await page.evaluate(() => window.__mefTurnstile.resets);
  check(
    'pressing Continue with a dead widget starts a challenge instead of waiting on nothing',
    afterSubmit > beforeSubmit,
    `resets ${beforeSubmit} -> ${afterSubmit}`
  );
  // Let the submission resolve so the page is not abandoned mid-action.
  await page.evaluate(() => window.__mefSolve('token-for-the-press'));
  await page.waitForTimeout(6000);

  check('no console or page error through the whole lifecycle run', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.screenshot({ path: `${OUT}/plf1-lifecycle.png` }).catch(() => {});
  await context.close();
}

// =====================================================================
// TASK A, HALF 2: a real refused submission, and the pass that survives it
// =====================================================================

async function stageSubmission(): Promise<void> {
  console.log('\n--- TASK A, HALF 2: a real refused submission on the live form ---');

  const context = await newContext({ viewport: PHONE });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && isRealConsoleError(m.text())) errors.push(m.text());
  });

  const ref = await walkQuizToSignup(page);
  check('the create-account button carried a one-time pass into the live signup form', Boolean(ref), ref ? `${ref.slice(0, 8)}...` : 'none');
  if (!ref) {
    await context.close();
    return;
  }

  const { data: before } = await service
    .from('public_entry_signup_refs')
    .select('id, used_at, outcome')
    .eq('ref_hash', hashSignupRef(ref))
    .maybeSingle();
  check('and that pass is unspent before anything is submitted', (before as { used_at: string | null } | null)?.used_at === null);

  // Count the Server Action round trips this one press causes. A refused
  // check is retried once, on its own, before she is told anything.
  // Counted from the outside, with no cooperation from the app: a Server
  // Action is a POST carrying a `next-action` header, so two of them from
  // one press is the silent retry happening. Injected as a string so tsx
  // never compiles it.
  await page.evaluate(`
    window.__mefActionPosts = 0;
    window.__mefRealFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      var headers = new Headers((init && init.headers) || (input && input.headers) || {});
      if (method === 'POST' && headers.has('next-action')) window.__mefActionPosts += 1;
      return window.__mefRealFetch(input, init);
    };
  `);

  await page.fill('#email', SIGNUP_PROBE);
  await page.fill('#password', 'A-strong-password-1!');
  const startedAt = Date.now();
  await page.click('button[type="submit"]');
  // Two attempts, each of which waits for a challenge Cloudflare will not
  // solve for a headless browser, plus two round trips.
  await page.waitForTimeout(45000);
  const elapsed = Date.now() - startedAt;

  const posts = (await page.evaluate(() => window.__mefActionPosts)) as number;
  const body = await page.locator('body').innerText().catch(() => '');
  const alerts = await page.locator('[role="alert"]').allInnerTexts().catch(() => []);

  check(
    'one press produced exactly two attempts: the first, and the silent retry',
    posts === 2,
    `${posts} server action calls in ${Math.round(elapsed / 1000)}s`
  );
  const refused = /could not confirm that in time/i.test(body);
  check('the member is told once, and only after both attempts', refused && alerts.filter((t) => /could not confirm/i.test(t)).length === 1, alerts.join(' | ').slice(0, 120));
  check('and never sees a raw captcha error', !/captcha/i.test(body) && !/invalid-input-response/i.test(body));

  const { data: after } = await service
    .from('public_entry_signup_refs')
    .select('used_at, outcome')
    .eq('ref_hash', hashSignupRef(ref))
    .maybeSingle();
  const afterRow = after as { used_at: string | null; outcome: string | null } | null;
  check(
    'the one-time pass is STILL unspent after both refused rounds',
    afterRow !== null && afterRow.used_at === null,
    JSON.stringify(afterRow)
  );

  const probeId = await findUserIdByEmail(SIGNUP_PROBE);
  check('and no account was created by a refused submission', probeId === null);
  if (probeId) createdUserIds.push(probeId);

  await page.screenshot({ path: `${OUT}/plf1-signup-refused.png` }).catch(() => {});
  await context.close();

  // And the pass still works. Redeemed with the shipped function, on the
  // real production row, exactly as the Server Action would have.
  const { data: created } = await service.auth.admin.createUser({
    email: `oakomah66+plf1redeem@gmail.com`,
    password: `Live-${Date.now()}-Aa1!`,
    email_confirm: true,
  });
  const redeemerId = created.user?.id ?? null;
  if (!redeemerId) {
    check('a pass that survived the retries can still be redeemed', false, 'could not create the redeeming account');
    return;
  }
  createdUserIds.push(redeemerId);
  await service.from('profiles').update({ is_test: true }).eq('id', redeemerId);
  const redeemed = await redeemSignupRef(service, { memberId: redeemerId, ref });
  check(
    'a pass that survived the refused rounds still binds her arrival',
    redeemed.bound && redeemed.outcome === 'bound',
    redeemed.outcome
  );
  const again = await redeemSignupRef(service, { memberId: redeemerId, ref });
  check('and is single use, exactly as before', !again.bound, again.outcome);
}

// =====================================================================
// TASK B: the result screen, measured on a phone viewport
// =====================================================================

/** Nine questions on the live site. Returns the pass the CTA carried, or null. */
async function walkQuizToSignup(page: Page): Promise<string | null> {
  await runQuiz(page);
  const cta = page.locator('button:visible').filter({ hasText: /create a free account/i }).first();
  if (!(await cta.count())) return null;
  await cta.first().scrollIntoViewIfNeeded().catch(() => {});
  await cta.first().click({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(8000);
  if (!page.url().includes('/signup')) return null;
  return await page.locator('input[name="publicEntryRef"]').getAttribute('value').catch(() => null);
}

async function runQuiz(page: Page): Promise<void> {
  await page.goto(`${BASE}/energy`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const begin = page.locator('button:visible').filter({ hasText: /^(Start|Begin|Continue)/i }).first();
  if (await begin.count()) await begin.click().catch(() => {});
  await page.waitForTimeout(1200);

  for (let step = 0; step < 30; step += 1) {
    const options = page.locator('button:visible, [role="radio"]:visible');
    const total = await options.count();
    let clicked = false;
    for (let i = 0; i < total; i += 1) {
      const label = (await options.nth(i).innerText().catch(() => '')).trim();
      if (!label) continue;
      if (/^(Back|Start over|Create|Sign|Email|Send|I already|Open my)/i.test(label)) continue;
      await options.nth(i).click({ timeout: 4000 }).catch(() => {});
      clicked = true;
      break;
    }
    if (!clicked) break;
    await page.waitForTimeout(900);
    const body = await page.locator('body').innerText().catch(() => '');
    if (/what we noticed/i.test(body) && /create a free account/i.test(body)) break;
  }
  await page.waitForTimeout(2500);
  const token = (await page
    .evaluate('window.localStorage.getItem("mef.publicEntry.token.v1")')
    .catch(() => null)) as string | null;
  if (token) createdVisitorTokens.push(token);
}

async function stageResult(): Promise<void> {
  console.log('\n--- TASK B: the result screen, on a phone ---');
  const context = await newContext({
    viewport: PHONE,
    deviceScaleFactor: 2,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && isRealConsoleError(m.text())) errors.push(m.text());
  });

  await runQuiz(page);
  const reached = /what we noticed/i.test(await page.locator('body').innerText().catch(() => ''));
  check('nine questions on the live site reach a result', reached);
  if (!reached) {
    await context.close();
    return;
  }

  await page.screenshot({ path: `${OUT}/plf1-result-fold.png` });
  await page.screenshot({ path: `${OUT}/plf1-result-full.png`, fullPage: true });

  const geometry = await page.evaluate(() => {
    const h = window.innerHeight;
    const nodes = Array.prototype.slice.call(document.querySelectorAll('h2, p, button, summary'));
    const wanted = [
      'What we noticed',
      'This came from nine questions',
      'Create a free account',
      'I already have an account',
      'This came from what you told us',
      'Three day notes',
    ];
    const boxes: Record<string, { top: number; bottom: number; aboveFold: boolean } | null> = {};
    for (const label of wanted) {
      let hit: Element | null = null;
      for (const node of nodes) {
        if ((node.textContent || '').trim().indexOf(label) === 0) {
          hit = node;
          break;
        }
      }
      if (!hit) {
        boxes[label] = null;
        continue;
      }
      const r = hit.getBoundingClientRect();
      boxes[label] = { top: Math.round(r.top), bottom: Math.round(r.bottom), aboveFold: r.bottom <= h };
    }

    const patternTitle = document.querySelector('section h2');
    const titleRect = patternTitle ? patternTitle.getBoundingClientRect() : null;

    const ctas = Array.prototype.slice
      .call(document.querySelectorAll('button'))
      .filter((b: Element) => (b.textContent || '').indexOf('Create a free account') >= 0);
    const lastCta = ctas.length ? ctas[ctas.length - 1] : null;

    let emailHeading: Element | null = null;
    for (const node of Array.prototype.slice.call(document.querySelectorAll('h2'))) {
      if ((node.textContent || '').trim().indexOf('Three day notes') === 0) {
        emailHeading = node;
        break;
      }
    }

    return {
      viewportHeight: h,
      documentHeight: document.documentElement.scrollHeight,
      eyebrow: boxes['What we noticed'],
      title: {
        text: (patternTitle ? patternTitle.textContent || '' : '').trim(),
        top: titleRect ? Math.round(titleRect.top) : null,
        bottom: titleRect ? Math.round(titleRect.bottom) : null,
        aboveFold: titleRect ? titleRect.bottom <= h : false,
      },
      honesty: boxes['This came from nine questions'],
      cta: boxes['Create a free account'],
      login: boxes['I already have an account'],
      evidence: boxes['This came from what you told us'],
      email: boxes['Three day notes'],
      lastCtaTop: lastCta ? Math.round(lastCta.getBoundingClientRect().top + window.scrollY) : null,
      emailTop: emailHeading
        ? Math.round(emailHeading.getBoundingClientRect().top + window.scrollY)
        : null,
      collapsibles: document.querySelectorAll('details').length,
      openCollapsibles: document.querySelectorAll('details[open]').length,
      ctaCount: ctas.length,
    };
  });
  note(JSON.stringify(geometry));

  check('the pattern name is in the first screenful', geometry.title?.aboveFold === true, geometry.title?.text ?? '');
  check('the one line that says what it means is too', (geometry.honesty?.top ?? 0) > 0);
  check('the honesty line rides with the result, in the first screenful', geometry.honesty?.aboveFold === true);
  check('Create a free account is in the first screenful', geometry.cta?.aboveFold === true, `${geometry.cta?.top} to ${geometry.cta?.bottom} of ${geometry.viewportHeight}`);
  check('I already have an account is there too', geometry.login?.aboveFold === true);
  check(
    'the email section sits below the last create-account button',
    geometry.emailTop !== null && geometry.lastCtaTop !== null && geometry.emailTop > geometry.lastCtaTop,
    `email ${geometry.emailTop} vs last button ${geometry.lastCtaTop}`
  );
  check('the two prose sections are folded and closed', geometry.collapsibles === 2 && geometry.openCollapsibles === 0);
  check('no console or page error on the result screen', errors.length === 0, errors.slice(0, 2).join(' | '));

  // The pass still rides the button.
  const cta = page.locator('button:visible').filter({ hasText: /create a free account/i }).first();
  await cta.scrollIntoViewIfNeeded().catch(() => {});
  await cta.click({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(8000);
  const hidden = await page.locator('input[name="publicEntryRef"]').getAttribute('value').catch(() => null);
  check('and the pass still rides that button into the signup form', Boolean(hidden) && page.url().includes('/signup'), hidden ? `${hidden.slice(0, 8)}...` : page.url());
  await page.screenshot({ path: `${OUT}/plf1-signup-from-result.png` }).catch(() => {});
  await context.close();
}

// =====================================================================
// TASK C: one knock per sitting
// =====================================================================

/** Whatever Root is saying in a modal right now, or null. */
async function readPopup(page: Page): Promise<string | null> {
  const modal = page.locator('[role="dialog"], .mef-modal-viewport').first();
  if (!(await modal.count())) return null;
  if (!(await modal.isVisible().catch(() => false))) return null;
  return (await modal.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
}

async function stageOneKnock(): Promise<void> {
  console.log('\n--- TASK C: one knock per sitting ---');
  const memberId = await findUserIdByEmail(ONE_KNOCK_MEMBER);
  if (!memberId) {
    check('the task C fixture account exists', false, ONE_KNOCK_MEMBER);
    return;
  }
  const { data: profile } = await service.from('profiles').select('is_test, timezone').eq('id', memberId).maybeSingle();
  check('and it is a test account, so nothing here touches a real member', (profile as { is_test: boolean } | null)?.is_test === true);

  const { data: definition } = await service
    .from('unified_assessment_definitions')
    .select('id')
    .eq('key', 'core-values-snapshot')
    .maybeSingle();
  const { data: sessions } = await service
    .from('unified_assessment_sessions')
    .select('id, completed_at')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', (definition as { id: string }).id)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1);
  const cvs = (sessions ?? [])[0] as { id: string; completed_at: string } | undefined;
  if (!cvs) {
    check('she has a completed Core Values Snapshot to reason about', false);
    return;
  }
  check('she completed Core Values Snapshot today, on this site', true, cvs.completed_at);

  // The bug itself, as production recorded it before the fix.
  const { data: history } = await service
    .from('member_root_popup_dismissals')
    .select('message_key, created_at')
    .eq('member_id', memberId)
    .like('message_key', 'free_arc_available%');
  const knock = (history ?? [])[0] as { message_key: string; created_at: string } | undefined;
  if (knock) {
    const gapMinutes = Math.round(
      (new Date(knock.created_at).getTime() - new Date(cvs.completed_at).getTime()) / 60000
    );
    note(`the bug, as production recorded it: ${knock.message_key} was shown ${gapMinutes} minutes after she finished Core Values Snapshot`);
  }

  const minted = await mintSessionCookies(ONE_KNOCK_MEMBER, { baseUrl: BASE });
  if (!minted) {
    check('a session could be minted for her', false);
    return;
  }
  const context: BrowserContext = await newContext({ viewport: PHONE });
  await context.addCookies(minted.cookies);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && isRealConsoleError(m.text())) errors.push(m.text());
  });

  const dismissalsBefore = await countDismissals(memberId);

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  const sameSitting = await readPopup(page);
  await page.screenshot({ path: `${OUT}/plf1-oneknock-same-day.png` }).catch(() => {});
  check(
    'on the day she finished it, no experience offer knocks',
    sameSitting === null || !/life signal check|readiness pulse|core values snapshot/i.test(sameSitting),
    sameSitting ? sameSitting.slice(0, 120) : 'no pop-up at all'
  );

  const dismissalsAfter = await countDismissals(memberId);
  check(
    'and the hush wrote nothing, so the offer is genuinely still owed to her',
    dismissalsAfter === dismissalsBefore,
    `${dismissalsBefore} -> ${dismissalsAfter}`
  );

  // The one simulation in this run, stated: a day cannot be waited out, so
  // her own completion instant is moved back thirty hours and put back.
  const original = cvs.completed_at;
  const shifted = new Date(new Date(original).getTime() - 30 * 60 * 60 * 1000).toISOString();
  await service.from('unified_assessment_sessions').update({ completed_at: shifted }).eq('id', cvs.id);
  note(`simulated the next day: her Core Values Snapshot completion moved from ${original} to ${shifted}`);

  try {
    await page.goto(`${BASE}/?knock=next-day`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(9000);
    const nextDay = await readPopup(page);
    await page.screenshot({ path: `${OUT}/plf1-oneknock-next-day.png` }).catch(() => {});
    check(
      'and the next day it does knock',
      Boolean(nextDay) && /life signal check|readiness pulse|core values snapshot/i.test(nextDay ?? ''),
      nextDay ? nextDay.slice(0, 140) : 'no pop-up'
    );
  } finally {
    await service.from('unified_assessment_sessions').update({ completed_at: original }).eq('id', cvs.id);
    const { data: restored } = await service
      .from('unified_assessment_sessions')
      .select('completed_at')
      .eq('id', cvs.id)
      .maybeSingle();
    check(
      'her completion instant is put back exactly as it was',
      (restored as { completed_at: string } | null)?.completed_at === original,
      String((restored as { completed_at: string } | null)?.completed_at)
    );
  }

  check('no console or page error on either Home visit', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
  await retireSession(minted).catch(() => {});
}

async function countDismissals(memberId: string): Promise<number> {
  const { count } = await service
    .from('member_root_popup_dismissals')
    .select('message_key', { count: 'exact', head: true })
    .eq('member_id', memberId);
  return count ?? 0;
}

// =====================================================================
// Housekeeping, and the arc's own boundary
// =====================================================================

async function stageHousekeeping(): Promise<void> {
  console.log('\n--- HOUSEKEEPING ---');
  const email = 'oakomah66+quiztest5@gmail.com';
  const id = await findUserIdByEmail(email);
  check('the quiz test account exists', Boolean(id), email);
  if (!id) return;
  const { data: profile } = await service.from('profiles').select('is_test').eq('id', id).maybeSingle();
  check('and is now flagged as a test account', (profile as { is_test: boolean } | null)?.is_test === true);

  const { data: origin } = await service
    .from('member_public_entry_origin')
    .select('bind_method, pattern_key, claimed_at')
    .eq('member_id', id)
    .maybeSingle();
  const row = origin as { bind_method: string; pattern_key: string; claimed_at: string } | null;
  check('her arrival was bound by the signup link', row?.bind_method === 'signup_link', JSON.stringify(row));

  const { data: delivered } = await service
    .from('member_trial_arc_deliveries')
    .select('message_key, day_number, pointed_step, delivered_at, delivered_local_date')
    .eq('member_id', id)
    .order('delivered_at', { ascending: true });
  const first = (delivered ?? [])[0] as Record<string, unknown> | undefined;
  check('and her arrival greeting was delivered', Boolean(first), JSON.stringify(first ?? null));
}

async function stageArc(): Promise<void> {
  console.log('\n--- THE ARC STILL EXCLUDES EVERY PRE-LAUNCH ACCOUNT ---');
  check('the arc is launched', Boolean(TRIAL_ARC_LAUNCH), String(TRIAL_ARC_LAUNCH));
  if (!TRIAL_ARC_LAUNCH) return;
  const launch = new Date(TRIAL_ARC_LAUNCH).toISOString();

  const { data: preLaunch } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
  const older = (preLaunch?.users ?? []).filter((u) => new Date(u.created_at).toISOString() < launch);
  const olderIds = older.map((u) => u.id);
  const { data: rows } = await service
    .from('member_trial_arc_deliveries')
    .select('member_id')
    .in('member_id', olderIds.length ? olderIds : ['00000000-0000-0000-0000-000000000000']);
  check(
    'no account that existed before the launch has ever been sent an arc message',
    (rows ?? []).length === 0,
    `${olderIds.length} pre-launch accounts, ${(rows ?? []).length} arc rows between them`
  );
}

async function stageCleanup(): Promise<void> {
  console.log('\n--- CLEANUP ---');
  for (const email of [SIGNUP_PROBE, 'oakomah66+plf1redeem@gmail.com']) {
    const id = await findUserIdByEmail(email);
    if (!id) continue;
    if (!createdUserIds.includes(id)) createdUserIds.push(id);
  }
  let sessions = 0;
  for (const token of [...new Set(createdVisitorTokens)]) {
    const { error } = await service.from('public_entry_sessions').delete().eq('visitor_token', token);
    if (!error) sessions += 1;
  }
  check('every signed-out quiz session this run created is gone', sessions === new Set(createdVisitorTokens).size, `${sessions} deleted`);

  let deleted = 0;
  for (const id of [...new Set(createdUserIds)]) {
    await service.from('member_public_entry_origin').delete().eq('member_id', id);
    const { error } = await service.auth.admin.deleteUser(id);
    if (!error) deleted += 1;
  }
  check('every account this run created is gone', deleted === new Set(createdUserIds).size, `${deleted} deleted`);
}

// =====================================================================

async function main(): Promise<void> {
  browser = await chromium.launch();
  try {
    if (STAGE === 'all' || STAGE === 'housekeeping') await stageHousekeeping();
    if (STAGE === 'all' || STAGE === 'lifecycle') await stageLifecycle();
    if (STAGE === 'all' || STAGE === 'result') await stageResult();
    if (STAGE === 'all' || STAGE === 'submission') await stageSubmission();
    if (STAGE === 'all' || STAGE === 'oneknock') await stageOneKnock();
    if (STAGE === 'all' || STAGE === 'arc') await stageArc();
    if (STAGE === 'all' || STAGE === 'cleanup') await stageCleanup();
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  for (const f of failed) console.log(`  FAILED: ${f.name}  ${f.detail}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

declare global {
  interface Window {
    __mefTurnstile: {
      renders: Array<{ sitekey: string; appearance: string; refreshExpired?: string; refreshTimeout?: string }>;
      resets: number;
      removes: number;
      callbacks: Record<string, (token?: string) => void> | null;
    };
    __mefClockOffset: number;
    __mefSolve: (token: string) => void;
    __mefExpire: () => void;
    __mefError: () => void;
    __mefActionPosts: number;
  }
}

await main();
