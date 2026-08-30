/**
 * Live verification for the 2026-08-29 Weekly Reflection delivery-receipt
 * build.
 *
 * FOUR QUESTIONS, ASKED SEPARATELY, because one passing does not imply
 * another:
 *
 *   1. THE RECEIPT IS WRITTEN ON A REAL DISPLAY. Signed in as the program
 *      tier test member, inside her own Friday-to-Sunday window, Home must
 *      put the reflection in front of her and exactly one receipt row must
 *      exist for her own local Friday afterwards.
 *
 *   2. IT IS WRITTEN ONCE. Reloading Home must not add a second row and
 *      must not move the first row's timestamp.
 *
 *   3. NOTHING WRITES ONE FROM THE COACH SIDE. Her client screen is opened
 *      as her real coach, and the receipt count must be unchanged after.
 *
 *   4. THE STATUS LINE MATCHES REALITY, read off the rendered coach screen
 *      and compared against the rows in the database rather than against
 *      what this script hoped for.
 *
 * The receipt row is deleted at the start so the run measures a first
 * delivery rather than an old one, and the count is measured before and
 * after every step rather than only at the end.
 *
 * WITH RESET_WEEK=1 the fixture member's COMPLETED reflection for this week
 * is taken out of the way as well, so the pending path can actually be
 * observed: a completed week correctly shows neither the pop-up nor the
 * card, which is right and is also the one state that cannot demonstrate a
 * delivery. The row is read in full first and written back verbatim in the
 * finally block, including its original completed_at and created_at, so
 * the member's own words survive the run untouched. Only ever done for a
 * seeded is_test account, which is what migration 189's own delete policy
 * is scoped to.
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
const NAV_TIMEOUT = 60_000;

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

/** Her own local date, the same way the server resolves it. */
function localDateIn(timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return parts;
}

function reflectionWeekStartFor(localDate) {
  const day = new Date(`${localDate}T00:00:00.000Z`).getUTCDay();
  const back = day === 5 ? 0 : day === 6 ? 1 : day === 0 ? 2 : null;
  if (back === null) return null;
  const d = new Date(`${localDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

async function truth() {
  const { data: users, error } = await service.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  const byEmail = (e) => users.users.find((u) => u.email === e);
  const coach = byEmail(COACH_EMAIL);
  const member = byEmail(MEMBER_EMAIL);
  if (!coach || !member) throw new Error('coach or member account not found on production');

  const { data: profile } = await service
    .from('profiles')
    .select('id, display_name, timezone, is_test')
    .eq('id', member.id)
    .maybeSingle();

  const { data: sub } = await service
    .from('member_subscriptions')
    .select('tier, status')
    .eq('member_id', member.id)
    .maybeSingle();

  const timezone = profile?.timezone ?? 'America/New_York';
  const localDate = localDateIn(timezone);

  return {
    coachId: coach.id,
    memberId: member.id,
    memberName: profile?.display_name ?? null,
    timezone,
    localDate,
    weekStart: reflectionWeekStartFor(localDate),
    tier: sub?.tier ?? null,
    subStatus: sub?.status ?? null,
  };
}

async function receipts(memberId, weekStart) {
  const { data, error } = await service
    .from('member_weekly_reflection_deliveries')
    .select('week_start, delivered_at, presentation')
    .eq('member_id', memberId)
    .eq('week_start', weekStart);
  if (error) throw new Error(`receipt read failed: ${error.message}`);
  return data ?? [];
}

async function openAs(browser, email) {
  const minted = await mintSessionContext(browser, email, { baseUrl: BASE });
  if (!minted) throw new Error(`could not mint a session for ${email}`);
  return minted;
}

function watch(page, errors) {
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
}

async function main() {
  const t = await truth();
  console.log(
    `member ${t.memberName} tz=${t.timezone} local=${t.localDate} week=${t.weekStart ?? 'CLOSED'} tier=${t.tier}/${t.subStatus}\n`
  );

  if (!t.weekStart) {
    record(
      'the Friday to Sunday window is open for her right now',
      false,
      `her local date is ${t.localDate}, which is outside the window, so a first delivery cannot be observed today`
    );
  }

  // Start from no receipt, so what this run measures is a FIRST delivery
  // and not a row somebody left behind.
  if (t.weekStart) {
    await service
      .from('member_weekly_reflection_deliveries')
      .delete()
      .eq('member_id', t.memberId)
      .eq('week_start', t.weekStart);
    const cleared = await receipts(t.memberId, t.weekStart);
    record(
      'the run starts from no receipt for this week',
      cleared.length === 0,
      `${cleared.length} rows for ${t.weekStart} before the member opens the app`
    );
  }

  // Taken out of the way only for the fixture account, only when asked,
  // and put back verbatim in the finally block below.
  let stashedReflection = null;
  if (process.env.RESET_WEEK === '1' && t.weekStart) {
    const { data: row } = await service
      .from('member_weekly_reflections')
      .select('*')
      .eq('member_id', t.memberId)
      .eq('week_start', t.weekStart)
      .maybeSingle();
    if (row) {
      stashedReflection = row;
      await service.from('member_weekly_reflections').delete().eq('id', row.id);
      console.log(`stashed her completed reflection for ${t.weekStart}, to be restored at the end\n`);
    }
  }

  const browser = await chromium.launch();
  let memberSession = null;
  let coachSession = null;
  try {
    // ---- 1 and 2. The member side -----------------------------------
    memberSession = await openAs(browser, MEMBER_EMAIL);
    const memberErrors = [];
    const page = await memberSession.context.newPage();
    watch(page, memberErrors);

    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });
    await page.waitForTimeout(4000);

    const bodyText = await page.locator('body').innerText();
    const sawReflection = /Weekly Reflection|Look back at your week|Your Weekly Reflection is ready/i.test(
      bodyText
    );
    record(
      'the Weekly Reflection is displayed to her on Home',
      sawReflection,
      sawReflection
        ? 'the pop-up or the persistent card is on the screen'
        : 'neither the pop-up nor the card is on the screen, so no delivery can be recorded'
    );
    await page.screenshot({ path: `${SHOTS}/wr-delivery-member-home.png`, fullPage: true });

    if (t.weekStart) {
      const first = await receipts(t.memberId, t.weekStart);
      record(
        'exactly one receipt row exists for this week after the first display',
        first.length === 1,
        first.length === 1
          ? `one row: week_start=${first[0].week_start} presentation=${first[0].presentation} delivered_at=${first[0].delivered_at}`
          : `${first.length} rows, expected exactly 1`
      );

      // ---- 2. Reload. Once per week, not once per load. ---------------
      const firstStamp = first[0]?.delivered_at ?? null;
      await page.reload({ waitUntil: 'networkidle', timeout: NAV_TIMEOUT });
      await page.waitForTimeout(4000);
      const second = await receipts(t.memberId, t.weekStart);
      record(
        'a reload writes no second row and does not move the timestamp',
        second.length === 1 && second[0]?.delivered_at === firstStamp,
        `${second.length} rows after reload, delivered_at ${second[0]?.delivered_at === firstStamp ? 'unchanged' : 'CHANGED'}`
      );
    }

    record(
      'her Home screen has no page errors and no console errors',
      memberErrors.length === 0,
      memberErrors.length === 0 ? 'clean' : memberErrors.slice(0, 4).join(' | ')
    );

    await page.close();
    await retireSession(memberSession);
    memberSession = null;

    // ---- 3 and 4. The coach side -------------------------------------
    const before = t.weekStart ? await receipts(t.memberId, t.weekStart) : [];

    coachSession = await openAs(browser, COACH_EMAIL);
    const coachErrors = [];
    const coachPage = await coachSession.context.newPage();
    watch(coachPage, coachErrors);

    await coachPage.goto(`${BASE}/coach/clients/${t.memberId}/detail`, {
      waitUntil: 'networkidle',
      timeout: NAV_TIMEOUT,
    });
    await coachPage.waitForTimeout(2500);

    const statusLine = await coachPage
      .locator('[data-testid="weekly-reflection-status-line"]')
      .first()
      .innerText()
      .catch(() => null);

    record(
      'the coach client screen prints a Weekly Reflection status line',
      Boolean(statusLine),
      statusLine ? `"${statusLine}"` : 'no status line found on the screen'
    );

    if (statusLine && t.weekStart) {
      const rows = await receipts(t.memberId, t.weekStart);
      const { data: reflection } = await service
        .from('member_weekly_reflections')
        .select('completed_at')
        .eq('member_id', t.memberId)
        .eq('week_start', t.weekStart)
        .maybeSingle();

      const expectedDay = rows[0]
        ? new Date(rows[0].delivered_at).toLocaleString('en-US', {
            weekday: 'long',
            timeZone: t.timezone,
          })
        : null;

      const truthful = reflection?.completed_at
        ? /^Completed /.test(statusLine)
        : rows.length === 1
          ? statusLine === `Delivered ${expectedDay}. Not yet completed.`
          : statusLine.startsWith('Not delivered') || statusLine.startsWith('No delivery record');

      record(
        'the status line matches what the database actually says',
        truthful,
        `db: ${rows.length} receipt(s), completed_at=${reflection?.completed_at ?? 'null'}, her day=${expectedDay ?? 'n/a'} | screen: "${statusLine}"`
      );
    }

    const after = t.weekStart ? await receipts(t.memberId, t.weekStart) : [];
    record(
      'the coach screen wrote no receipt',
      after.length === before.length,
      `${before.length} rows before the coach opened the screen, ${after.length} after`
    );

    const coachText = await coachPage.locator('body').innerText();
    record(
      'no em dash anywhere on the coach client screen',
      !coachText.includes('—'),
      coachText.includes('—') ? 'an em dash is on the screen' : 'none'
    );

    record(
      'the coach client screen has no page errors and no console errors',
      coachErrors.length === 0,
      coachErrors.length === 0 ? 'clean' : coachErrors.slice(0, 4).join(' | ')
    );

    await coachPage.screenshot({ path: `${SHOTS}/wr-delivery-coach-panel.png`, fullPage: true });
    await coachPage.close();
  } finally {
    if (memberSession) await retireSession(memberSession).catch(() => {});
    if (coachSession) await retireSession(coachSession).catch(() => {});
    await browser.close();

    if (stashedReflection) {
      const { error } = await service.from('member_weekly_reflections').insert(stashedReflection);
      // Reported rather than swallowed: a failed restore is the one thing
      // in this run that would leave production worse than it found it.
      record(
        'her completed reflection was restored exactly as it was',
        !error,
        error ? `RESTORE FAILED: ${error.message}` : `restored row ${stashedReflection.id} for ${stashedReflection.week_start}`
      );
    }
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed} of ${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
