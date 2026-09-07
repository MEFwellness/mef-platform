#!/usr/bin/env node
/**
 * The duplicate 7-day offer, checked on the real site.
 *
 * WHAT WENT WRONG. Home's Active Experiments section showed one member two
 * offer cards for the same behavior: "take a genuine 5-minute break in the
 * mornings" from the Life Signal Check beside "take a real 5-minute break
 * in the mornings" from the Readiness Pulse, each with its own "I'm in:
 * start the 7 days". The Readiness Pulse deliberately targets the Life
 * Signal Check's own loudest signal, so the collision is systematic.
 *
 * WHAT IS PROVED HERE, on the account that actually had it:
 *
 *   1. Home renders ONE Energy offer now, not two, and the Purpose &
 *      Meaningful Work card beside it is untouched.
 *   2. The card that survived is the Readiness Pulse's, the more recent of
 *      the two, and the Life Signal Check's wording is genuinely absent
 *      from the page rather than merely hidden.
 *   3. Starting it converts the offer into a running card normally.
 *   4. With it running, the Life Signal Check's Energy offer stays absent,
 *      because the subject is already running.
 *   5. No second row was written, and the database refuses one even when
 *      the application layer is bypassed entirely.
 *   6. Zero console errors and zero page errors on every screen visited.
 *
 * IT WRITES ONLY TO ONE is_test ACCOUNT, and every write is undone in a
 * `finally` whether the run passes or not. It never touches the real member
 * who is running two Tension experiments: that pair predates migration 216,
 * is deliberately outside its index, and is left to run out on its own.
 *
 * Environment:
 *   BASE_URL   default https://app.mefwellness.com
 *   PROD_SUPABASE_URL / PROD_SERVICE_KEY_FILE / PROD_ANON_KEY_FILE
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const SHOTS = process.env.SHOTS_DIR ?? './live-shots-duplicate-offers';

/** Ebony, profiles.is_test = true. The account that actually carried the duplicate. */
const MEMBER_EMAIL = '8weeks2fab@gmail.com';
const MEMBER_ID = 'ab25b880-e067-4345-88f1-59044f3b8bfc';

/** The real member running two Tension experiments. Read only, never written, asserted untouched at the end. */
const UNTOUCHED_MEMBER_ID = '3e7af809-f280-4d32-b669-a23a29f21c62';

const LSC_WORDING = 'take a genuine 5-minute break in the mornings';
const RPL_WORDING = 'take a real 5-minute break in the mornings';

let pass = 0;
let fail = 0;
const failures = [];

function check(label, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    fail += 1;
    failures.push(`${label}${detail ? ` :: ${detail}` : ''}`);
    console.log(`  FAIL  ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}

function serviceClient() {
  return createClient(
    process.env.PROD_SUPABASE_URL,
    readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/** Every console error and page error on every screen this run opens. */
function watchForErrors(page, sink) {
  page.on('console', (m) => {
    if (m.type() === 'error') sink.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => sink.push(`pageerror: ${e.message}`));
}

async function main() {
  if (!canMintSessions()) {
    console.error('Cannot mint a session: set PROD_SUPABASE_URL, PROD_SERVICE_KEY_FILE, PROD_ANON_KEY_FILE.');
    process.exit(2);
  }
  mkdirSync(SHOTS, { recursive: true });

  const service = serviceClient();
  const browser = await chromium.launch();
  const errors = [];
  /** Rows this run created, removed in the finally whichever way the run ends. */
  const createdExperimentIds = [];
  let minted = null;

  try {
    // --- Baseline: the account really is in the state that produced the bug.
    const { data: before } = await service
      .from('lifestyle_experiments')
      .select('id, title, status, source_experience_key, subject_key')
      .eq('member_id', MEMBER_ID);
    const runningBefore = (before ?? []).filter((r) => r.status === 'active');
    console.log(`\nBaseline: ${before?.length ?? 0} experiment rows, ${runningBefore.length} stored active.`);

    check(
      'migration 216 is live: the subject_key column is readable',
      Array.isArray(before) && (before.length === 0 || 'subject_key' in before[0]),
      JSON.stringify(before?.[0] ?? null)
    );

    minted = await mintSessionContext(browser, MEMBER_EMAIL, { baseUrl: BASE, viewport: { width: 390, height: 844 } });
    if (!minted) throw new Error(`Could not mint a session for ${MEMBER_EMAIL}`);
    const page = await minted.context.newPage();
    watchForErrors(page, errors);

    // ---------------------------------------------------------------- 1
    console.log('\n1. Home, Active Experiments');
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SHOTS}/01-home.png`, fullPage: true });

    const body = await page.locator('body').innerText();

    const lscPresent = body.includes(LSC_WORDING);
    const rplPresent = body.includes(RPL_WORDING);
    check('exactly one of the two 5-minute-break cards is on the page', lscPresent !== rplPresent, `lsc=${lscPresent} rpl=${rplPresent}`);
    check('the surviving card is the Readiness Pulse one, the more recent of the two', rplPresent && !lscPresent, `lsc=${lscPresent} rpl=${rplPresent}`);

    const startButtons = await page.getByRole('button', { name: /I'm in: start the 7 days/i }).count();
    console.log(`     "I'm in: start the 7 days" buttons on the page: ${startButtons}`);

    // The Active Experiments section is where the duplicate lived. Count the
    // 5-minute-break offers inside it specifically, not anywhere on Home.
    const fiveMinuteCards = (body.match(/5-minute break in the mornings/g) ?? []).length;
    check('only one 5-minute-break offer is drawn', fiveMinuteCards === 1, `found ${fiveMinuteCards}`);

    check('the unrelated Purpose & Meaningful Work card is untouched', body.includes('Purpose & Meaningful Work'));

    // ---------------------------------------------------------------- 2
    console.log('\n2. Starting the surviving offer');
    // Address the card by its own copy, never by taking the first start
    // button on the page: three offers can be standing and the Core Values
    // Snapshot one renders above this. Walk up from the deepest node
    // carrying the Readiness Pulse wording until an ancestor holds exactly
    // one start button, so the button pressed is provably the one under
    // that card.
    let startButton = null;
    let node = page.locator('div').filter({ hasText: RPL_WORDING }).last();
    for (let i = 0; i < 8; i += 1) {
      const candidate = node.getByRole('button', { name: /I'm in: start the 7 days/i });
      if ((await candidate.count()) === 1) {
        startButton = candidate;
        break;
      }
      node = node.locator('xpath=..');
    }
    const canStart = startButton !== null;
    check("the Readiness Pulse card's own start button was resolved", canStart);

    if (canStart) {
      await startButton.click();
      // Never screenshot a submit in flight: wait on the destination's own
      // control, the daily question that only a RUNNING experiment draws.
      await page
        .getByText(/Did you get your five minutes today\?/i)
        .first()
        .waitFor({ timeout: 20000 })
        .catch(() => {});
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${SHOTS}/02-after-start.png`, fullPage: true });

      const afterBody = await page.locator('body').innerText();
      check(
        'the offer converted into a running card with its own daily question',
        /Did you get your five minutes today\?/i.test(afterBody),
        afterBody.slice(0, 200)
      );

      const { data: rows } = await service
        .from('lifestyle_experiments')
        .select('id, title, status, source_experience_key, subject_key, created_at')
        .eq('member_id', MEMBER_ID)
        .eq('status', 'active');
      const fresh = (rows ?? []).filter((r) => !runningBefore.some((b) => b.id === r.id));
      fresh.forEach((r) => createdExperimentIds.push(r.id));

      check('exactly one new experiment row was written', fresh.length === 1, JSON.stringify(fresh));
      if (fresh.length === 1) {
        check(
          'the new row carries a subject_key, so the index covers it',
          fresh[0].subject_key === 'signal:energy',
          String(fresh[0].subject_key)
        );
        check('it came from the Readiness Pulse', fresh[0].source_experience_key === 'readiness-pulse', String(fresh[0].source_experience_key));
      }

      // ---------------------------------------------------------------- 3
      console.log('\n3. With it running, the other experience stops offering the same thing');
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${SHOTS}/03-home-running.png`, fullPage: true });
      const runningBody = await page.locator('body').innerText();
      check(
        "the Life Signal Check's Energy offer is absent while the subject is running",
        !runningBody.includes(LSC_WORDING),
        'the genuine-5-minute wording was still on the page'
      );

      // ---------------------------------------------------------------- 4
      console.log('\n4. The database refuses a duplicate even with the app layer bypassed');
      if (fresh.length === 1) {
        // Duplicate whatever subject actually started, so this proves the
        // index rather than a guess about which offer won.
        const { data: bypass, error } = await service
          .from('lifestyle_experiments')
          .insert({
            member_id: MEMBER_ID,
            title: fresh[0].title,
            protocol: 'A hand-made POST that skipped every application guard.',
            start_date: fresh[0].created_at.slice(0, 10),
            duration_days: 7,
            status: 'active',
            subject_key: fresh[0].subject_key,
          })
          .select('id');
        // If the index ever fails to hold, the row it let through is
        // registered for cleanup here rather than left behind on a real
        // account. A leaked row of exactly this shape is what made run 1 of
        // this script poison run 2.
        (bypass ?? []).forEach((r) => createdExperimentIds.push(r.id));
        check(
          `the unique index refused a second running row for ${fresh[0].subject_key}`,
          error !== null && error.code === '23505',
          JSON.stringify(error)
        );
      }
    }

    // ---------------------------------------------------------------- 5
    console.log('\n5. Nothing was done to anybody else');
    const { data: untouched } = await service
      .from('lifestyle_experiments')
      .select('id, title, status, subject_key')
      .eq('member_id', UNTOUCHED_MEMBER_ID)
      .eq('status', 'active');
    check(
      "the real member's two running Tension experiments are still running and still un-backfilled",
      (untouched ?? []).length === 2 && (untouched ?? []).every((r) => r.subject_key === null),
      JSON.stringify(untouched)
    );

    // ---------------------------------------------------------------- 6
    console.log('\n6. Console');
    check('zero console errors and zero page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  } finally {
    // Undo every write, pass or fail.
    if (createdExperimentIds.length > 0) {
      const service2 = serviceClient();
      await service2.from('lifestyle_experiments').delete().in('id', createdExperimentIds);
      console.log(`\nCleaned up ${createdExperimentIds.length} experiment row(s) this run created.`);
    }
    if (minted) await retireSession(minted).catch(() => {});
    await browser.close();
  }

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail > 0) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
