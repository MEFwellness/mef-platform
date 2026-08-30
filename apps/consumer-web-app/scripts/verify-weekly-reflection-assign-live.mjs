/**
 * Live verification for the coach-assignable Weekly Reflection
 * (migration 193).
 *
 * SIX QUESTIONS, ASKED SEPARATELY, because one passing does not imply
 * another:
 *
 *   1. THE BUTTON IS THERE, on the real coach client screen, for a client
 *      the reflection would not otherwise open for.
 *   2. ONE TAP WRITES ONE ROW, for HER Friday-anchored week, and the
 *      button then says Assigned and cannot be pressed again.
 *   3. IT REACHES HER. Signed in as the member, on a day her own window is
 *      not open, the reflection must be on Home.
 *   4. EXACTLY ONE RECEIPT, and a reload adds no second one and does not
 *      move the first.
 *   5. THE STATUS LINE MOVES, assigned to delivered to completed, and each
 *      sentence is compared against the rows in the database rather than
 *      against what this script hoped for.
 *   6. NOTHING IS LEFT BEHIND. Everything this run changed is put back
 *      verbatim, and the restore is itself a reported check.
 *
 * WHY IT HAS TO STASH. The standing fixture member is on the program tier,
 * so inside her own Friday-to-Sunday window she is already being offered
 * this week and there is correctly no button to press. She also has a
 * completed reflection and a receipt for the current week. So this run
 * reads all of that in full, takes it out of the way, and writes every
 * piece back in the finally block including its original timestamps. Only
 * ever done for a seeded is_test account, which is what migrations 189,
 * 191 and 193 each scope their own delete policy to.
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
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** The Friday that BEGAN the seven day span she is standing in. Mirrors mostRecentReflectionWeekStart. */
function spanWeekStart(localDate) {
  const day = new Date(`${localDate}T00:00:00.000Z`).getUTCDay();
  const back = day === 5 ? 0 : day === 6 ? 1 : day === 0 ? 2 : day + 2;
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

  if (!profile?.is_test) {
    throw new Error('refusing to run: the target account is not a seeded test account');
  }

  const timezone = profile?.timezone ?? 'America/New_York';
  const localDate = localDateIn(timezone);

  return {
    coachId: coach.id,
    memberId: member.id,
    memberName: profile?.display_name ?? null,
    timezone,
    localDate,
    weekStart: spanWeekStart(localDate),
  };
}

const rowsFor = async (table, memberId, weekStart) => {
  const { data, error } = await service
    .from(table)
    .select('*')
    .eq('member_id', memberId)
    .eq('week_start', weekStart);
  if (error) throw new Error(`${table} read failed: ${error.message}`);
  return data ?? [];
};

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

const statusLineOf = (page) =>
  page
    .locator('[data-testid="weekly-reflection-status-line"]')
    .first()
    .innerText()
    .catch(() => null);

const assignStateOf = async (page) => {
  const el = page.locator('[data-testid="weekly-reflection-assign-state"]').first();
  if ((await el.count()) === 0) return null;
  return {
    text: (await el.innerText()).trim(),
    tag: await el.evaluate((node) => node.tagName.toLowerCase()),
    disabled: await el.evaluate((node) => node.hasAttribute('disabled')),
  };
};

async function main() {
  const t = await truth();
  console.log(
    `member ${t.memberName} tz=${t.timezone} local=${t.localDate} span week=${t.weekStart}\n`
  );

  // ---- Stash everything this run is about to disturb -----------------
  const { data: subscription } = await service
    .from('member_subscriptions')
    .select('*')
    .eq('member_id', t.memberId)
    .maybeSingle();
  const stashedReflections = await rowsFor('member_weekly_reflections', t.memberId, t.weekStart);
  const stashedReceipts = await rowsFor(
    'member_weekly_reflection_deliveries',
    t.memberId,
    t.weekStart
  );
  const stashedAssignments = await rowsFor(
    'member_weekly_reflection_assignments',
    t.memberId,
    t.weekStart
  );

  console.log(
    `stashing: tier=${subscription?.tier ?? 'none'}/${subscription?.status ?? 'none'}, ` +
      `${stashedReflections.length} reflection, ${stashedReceipts.length} receipt, ` +
      `${stashedAssignments.length} assignment\n`
  );

  let restored = false;
  const restore = async () => {
    if (restored) return;
    restored = true;
    const problems = [];

    // Everything this run created for this week comes out first, so the
    // stashed rows go back into an empty (member, week) slot.
    for (const table of [
      'member_weekly_reflections',
      'member_weekly_reflection_deliveries',
      'member_weekly_reflection_assignments',
    ]) {
      const { error } = await service
        .from(table)
        .delete()
        .eq('member_id', t.memberId)
        .eq('week_start', t.weekStart);
      if (error) problems.push(`${table} clear: ${error.message}`);
    }

    for (const [table, rows] of [
      ['member_weekly_reflections', stashedReflections],
      ['member_weekly_reflection_deliveries', stashedReceipts],
      ['member_weekly_reflection_assignments', stashedAssignments],
    ]) {
      if (rows.length === 0) continue;
      const { error } = await service.from(table).insert(rows);
      if (error) problems.push(`${table} restore: ${error.message}`);
    }

    if (subscription) {
      const { error } = await service
        .from('member_subscriptions')
        .update({ tier: subscription.tier, status: subscription.status })
        .eq('member_id', t.memberId);
      if (error) problems.push(`subscription restore: ${error.message}`);
    }

    // Read it all back, rather than trusting that no error means it landed.
    const back = {
      reflections: await rowsFor('member_weekly_reflections', t.memberId, t.weekStart),
      receipts: await rowsFor('member_weekly_reflection_deliveries', t.memberId, t.weekStart),
      assignments: await rowsFor('member_weekly_reflection_assignments', t.memberId, t.weekStart),
    };
    const { data: subBack } = await service
      .from('member_subscriptions')
      .select('tier, status')
      .eq('member_id', t.memberId)
      .maybeSingle();

    const same =
      back.reflections.length === stashedReflections.length &&
      back.receipts.length === stashedReceipts.length &&
      back.assignments.length === stashedAssignments.length &&
      (back.reflections[0]?.completed_at ?? null) ===
        (stashedReflections[0]?.completed_at ?? null) &&
      (back.receipts[0]?.delivered_at ?? null) === (stashedReceipts[0]?.delivered_at ?? null) &&
      (subBack?.tier ?? null) === (subscription?.tier ?? null) &&
      (subBack?.status ?? null) === (subscription?.status ?? null);

    record(
      'everything this run changed was put back exactly as it was found',
      same && problems.length === 0,
      problems.length
        ? `RESTORE PROBLEMS: ${problems.join(' | ')}`
        : `tier=${subBack?.tier}/${subBack?.status}, ${back.reflections.length} reflection ` +
          `(completed_at ${back.reflections[0]?.completed_at ?? 'none'}), ` +
          `${back.receipts.length} receipt, ${back.assignments.length} assignment`
    );
  };

  let browser = null;
  let coachSession = null;
  let memberSession = null;
  // Everything from the first mutation onward is inside the try, so a
  // failure anywhere still reaches the restore in the finally block.
  try {
    // ---- Make the assign path reachable ------------------------------
    // Her plan already opens this week for her, so with it in place there
    // is correctly no button. Moved off the program for the length of the
    // run, and moved straight back at the end.
    if (subscription) {
      await service
        .from('member_subscriptions')
        .update({ tier: 'monthly', status: 'active' })
        .eq('member_id', t.memberId);
    }
    for (const table of [
      'member_weekly_reflections',
      'member_weekly_reflection_deliveries',
      'member_weekly_reflection_assignments',
    ]) {
      await service.from(table).delete().eq('member_id', t.memberId).eq('week_start', t.weekStart);
    }

    browser = await chromium.launch();
    // ---- 1 and 2. The coach side ------------------------------------
    coachSession = await openAs(browser, COACH_EMAIL);
    const coachErrors = [];
    const coachPage = await coachSession.context.newPage();
    watch(coachPage, coachErrors);

    const detail = `${BASE}/coach/clients/${t.memberId}/detail`;
    await coachPage.goto(detail, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });
    await coachPage.waitForTimeout(2500);

    const before = await assignStateOf(coachPage);
    record(
      'the Weekly Reflection panel offers an Assign button for this client',
      Boolean(before) && before.tag === 'button' && !before.disabled,
      before ? `"${before.text}" (${before.tag}, disabled=${before.disabled})` : 'no assign control on the panel'
    );
    await coachPage.screenshot({ path: `${SHOTS}/wr-assign-before.png`, fullPage: true });

    if (before && !before.disabled) {
      await coachPage.locator('[data-testid="weekly-reflection-assign-state"]').first().click();
      await coachPage.waitForTimeout(4000);
    }

    const assignedRows = await rowsFor(
      'member_weekly_reflection_assignments',
      t.memberId,
      t.weekStart
    );
    record(
      'one tap wrote exactly one assignment, for her own Friday-anchored week',
      assignedRows.length === 1 && assignedRows[0]?.week_start === t.weekStart,
      assignedRows.length === 1
        ? `week_start=${assignedRows[0].week_start} assigned_by=${assignedRows[0].assigned_by === t.coachId ? 'the coach' : assignedRows[0].assigned_by} created_at=${assignedRows[0].created_at}`
        : `${assignedRows.length} rows, expected exactly 1`
    );

    const after = await assignStateOf(coachPage);
    record(
      'the button now says Assigned and cannot be pressed again',
      Boolean(after) && after.text.startsWith('Assigned') && after.disabled,
      after ? `"${after.text}" (${after.tag}, disabled=${after.disabled})` : 'no assign control on the panel'
    );

    const assignedLine = await statusLineOf(coachPage);
    record(
      'the status line says it was assigned and has not been delivered yet',
      Boolean(assignedLine) && /^Assigned .*Not delivered yet/.test(assignedLine),
      assignedLine ? `"${assignedLine}"` : 'no status line on the screen'
    );

    // A reload is the honest duplicate test: the button is disabled, so a
    // second tap is impossible by hand, and this proves nothing else on
    // the screen writes a second row either.
    await coachPage.reload({ waitUntil: 'networkidle', timeout: NAV_TIMEOUT });
    await coachPage.waitForTimeout(2500);
    const afterReload = await rowsFor(
      'member_weekly_reflection_assignments',
      t.memberId,
      t.weekStart
    );
    record(
      'reloading the coach screen writes no second assignment',
      afterReload.length === 1 && afterReload[0]?.created_at === assignedRows[0]?.created_at,
      `${afterReload.length} rows after reload, created_at ${afterReload[0]?.created_at === assignedRows[0]?.created_at ? 'unchanged' : 'CHANGED'}`
    );
    await coachPage.screenshot({ path: `${SHOTS}/wr-assign-after.png`, fullPage: true });

    const coachText = await coachPage.locator('body').innerText();
    record(
      'no em dash anywhere on the coach client screen',
      !coachText.includes('—'),
      coachText.includes('—') ? 'an em dash is on the screen' : 'none'
    );

    await coachPage.close();
    await retireSession(coachSession);
    coachSession = null;

    // ---- 3 and 4. The member side -----------------------------------
    memberSession = await openAs(browser, MEMBER_EMAIL);
    const memberErrors = [];
    const page = await memberSession.context.newPage();
    watch(page, memberErrors);

    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });
    await page.waitForTimeout(4500);

    const homeText = await page.locator('body').innerText();
    const sawReflection =
      /Weekly Reflection|Look back at your week|Your Weekly Reflection is ready/i.test(homeText);
    record(
      'the assigned reflection is on her Home, on a day her own window is not open',
      sawReflection,
      sawReflection
        ? 'the pop-up or the persistent card is on the screen'
        : 'neither the pop-up nor the card is on the screen'
    );
    await page.screenshot({ path: `${SHOTS}/wr-assign-member-home.png`, fullPage: true });

    const firstReceipts = await rowsFor(
      'member_weekly_reflection_deliveries',
      t.memberId,
      t.weekStart
    );
    record(
      'exactly one delivery receipt exists after the first display',
      firstReceipts.length === 1,
      firstReceipts.length === 1
        ? `one row: week_start=${firstReceipts[0].week_start} presentation=${firstReceipts[0].presentation} delivered_at=${firstReceipts[0].delivered_at}`
        : `${firstReceipts.length} rows, expected exactly 1`
    );

    const firstStamp = firstReceipts[0]?.delivered_at ?? null;
    await page.reload({ waitUntil: 'networkidle', timeout: NAV_TIMEOUT });
    await page.waitForTimeout(4000);
    const secondReceipts = await rowsFor(
      'member_weekly_reflection_deliveries',
      t.memberId,
      t.weekStart
    );
    record(
      'a reload writes no second receipt and does not move the timestamp',
      secondReceipts.length === 1 && secondReceipts[0]?.delivered_at === firstStamp,
      `${secondReceipts.length} rows after reload, delivered_at ${secondReceipts[0]?.delivered_at === firstStamp ? 'unchanged' : 'CHANGED'}`
    );

    record(
      'her Home screen has no page errors and no console errors',
      memberErrors.length === 0,
      memberErrors.length === 0 ? 'clean' : memberErrors.slice(0, 4).join(' | ')
    );

    // ---- 5. She writes it -------------------------------------------
    await page.goto(`${BASE}/weekly-reflection`, {
      waitUntil: 'networkidle',
      timeout: NAV_TIMEOUT,
    });
    await page.waitForTimeout(2500);

    const onExperience = await page
      .getByText('Your week, according to Root')
      .first()
      .isVisible()
      .catch(() => false);
    record(
      'the assigned route opens the real experience rather than bouncing her Home',
      onExperience,
      onExperience ? 'Part 1 is on the screen' : `she is on ${page.url()}`
    );

    if (onExperience) {
      await page.getByRole('button', { name: 'Continue', exact: true }).first().click();
      await page.waitForTimeout(600);
      // Q1 is the scale. Any option is a real answer.
      await page.getByRole('radio').first().click();
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: 'Continue', exact: true }).first().click();
      await page.waitForTimeout(600);

      const written = [
        'Two long walks and an earlier bedtime.',
        'A late night on Wednesday.',
        'Shoulders looser by the weekend.',
        'Walk before breakfast three mornings.',
      ];
      for (let i = 0; i < written.length; i += 1) {
        await page.locator('textarea').first().fill(written[i]);
        await page.waitForTimeout(400);
        const label = i === written.length - 1 ? 'Finish' : 'Continue';
        await page.getByRole('button', { name: label, exact: true }).first().click();
        await page.waitForTimeout(i === written.length - 1 ? 5000 : 600);
      }

      const closing = await page
        .getByText('Thank you for taking the time')
        .first()
        .isVisible()
        .catch(() => false);
      const stored = await rowsFor('member_weekly_reflections', t.memberId, t.weekStart);
      record(
        'she can finish an assigned reflection, and one row is stored for that same week',
        closing && stored.length === 1 && Boolean(stored[0]?.completed_at),
        `Part 3 ${closing ? 'shown' : 'NOT shown'}, ${stored.length} reflection row(s), completed_at=${stored[0]?.completed_at ?? 'null'}`
      );
      await page.screenshot({ path: `${SHOTS}/wr-assign-member-done.png`, fullPage: true });
    }

    await page.close();
    await retireSession(memberSession);
    memberSession = null;

    // ---- 5 continued. The line a coach reads afterwards ---------------
    coachSession = await openAs(browser, COACH_EMAIL);
    const finalErrors = [];
    const finalPage = await coachSession.context.newPage();
    watch(finalPage, finalErrors);
    await finalPage.goto(detail, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });
    await finalPage.waitForTimeout(2500);

    const finalLine = await statusLineOf(finalPage);
    const stored = await rowsFor('member_weekly_reflections', t.memberId, t.weekStart);
    const finalReceipts = await rowsFor(
      'member_weekly_reflection_deliveries',
      t.memberId,
      t.weekStart
    );
    const expected = stored[0]?.completed_at
      ? `Completed ${new Date(stored[0].completed_at).toLocaleString('en-US', { weekday: 'long', timeZone: t.timezone })}.`
      : finalReceipts[0]
        ? `Delivered ${new Date(finalReceipts[0].delivered_at).toLocaleString('en-US', { weekday: 'long', timeZone: t.timezone })}. Not yet completed.`
        : null;

    record(
      'the status line matches what the database actually says',
      Boolean(finalLine) && finalLine === expected,
      `db: ${finalReceipts.length} receipt(s), completed_at=${stored[0]?.completed_at ?? 'null'} | screen: "${finalLine}" | expected: "${expected}"`
    );

    const finalText = await finalPage.locator('body').innerText();
    record(
      'no em dash on the coach screen after the whole round trip',
      !finalText.includes('—'),
      finalText.includes('—') ? 'an em dash is on the screen' : 'none'
    );
    record(
      'the coach client screen has no page errors and no console errors',
      finalErrors.length === 0 && coachErrors.length === 0,
      finalErrors.length === 0 && coachErrors.length === 0
        ? 'clean'
        : [...coachErrors, ...finalErrors].slice(0, 4).join(' | ')
    );

    await finalPage.screenshot({ path: `${SHOTS}/wr-assign-coach-final.png`, fullPage: true });
    await finalPage.close();
  } finally {
    if (memberSession) await retireSession(memberSession).catch(() => {});
    if (coachSession) await retireSession(coachSession).catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await restore();
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed} of ${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
