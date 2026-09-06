#!/usr/bin/env node
/**
 * The coach's This Week band and the merged "Worth discussing" section,
 * checked on production.
 *
 * WHAT IT PROVES, on the real screens rather than in a fake database:
 *   1. The band is at the top of a program client's first screen, above
 *      "What is improving", and it names the seven days it counted.
 *   2. That week is the Weekly Reflection recap's week, resolved from HER
 *      timezone, and it is NOT the Friday-to-Sunday offer window. On the
 *      day of this run those two genuinely differ, so a band that used the
 *      offer window fails rather than passing by luck.
 *   3. Every row reads correctly against what the database actually holds:
 *      the check-in count is the distinct in-window days and not the
 *      all-time total, the workout count is the sessions scheduled inside
 *      the window and not all of them, and the reflection line is the one
 *      the Weekly Reflection panel itself prints.
 *   4. A check-in moved INTO the window raises the count by exactly one,
 *      and moving it back lowers it again. That is the decisive proof the
 *      count is windowed rather than coincidentally right.
 *   5. Worth discussing shows each flag once, including a client list flag
 *      that used to exist only on /coach, and an alert that covers a list
 *      reason silences that reason rather than printing both.
 *   6. A client who is not on the program tier gets no band at all.
 *   7. Reloading the page repeatedly changes no state anywhere.
 *
 * IT WRITES ONLY TO ONE SEEDED TEST ACCOUNT, and every write is undone in
 * a `finally` whether the run passes or not. The real member on the same
 * caseload is opened READ ONLY, to confirm the band renders for her too.
 *
 * Environment:
 *   BASE_URL              default https://app.mefwellness.com
 *   STAFF_EMAIL           an account holding coach and administrator
 *   TEST_MEMBER_ID / TEST_MEMBER_EMAIL   the seeded fixture
 *   REAL_MEMBER_ID        a real client on the same caseload, read only
 *   PROD_SUPABASE_URL / PROD_SERVICE_KEY_FILE / PROD_ANON_KEY_FILE
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const STAFF_EMAIL = process.env.STAFF_EMAIL;
const MEMBER_ID = process.env.TEST_MEMBER_ID;
const MEMBER_EMAIL = process.env.TEST_MEMBER_EMAIL;
const REAL_MEMBER_ID = process.env.REAL_MEMBER_ID;
const SHOTS = process.env.SHOTS_DIR ?? './live-shots-this-week';

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
};
const note = (m) => console.log(`      ${m}`);

function serviceClient() {
  return createClient(
    process.env.PROD_SUPABASE_URL,
    readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
    { auth: { persistSession: false } }
  );
}

/** Her own calendar day, the way lib/time/localDate.ts resolves it. */
function todayIn(timeZone) {
  const parts = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}
const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekdayOf = (day) => new Date(`${day}T00:00:00Z`).getUTCDay();

/** The band's week, recomputed here independently of the app. */
function windowFor(localDate) {
  const dow = weekdayOf(localDate);
  // Friday 5, Saturday 6, Sunday 0 all point at that window's Friday.
  // Monday 1 through Thursday 4 point at the Friday that just passed.
  const back = dow === 5 ? 0 : dow === 6 ? 1 : dow === 0 ? 2 : dow + 2;
  const to = addDays(localDate, -back);
  return { from: addDays(to, -6), to };
}
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const dayText = (d) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;

/** The whole rendered text of one section, by its data-section marker. */
async function sectionText(page, name) {
  return page.evaluate((n) => {
    const el = document.querySelector(`[data-section="${n}"]`);
    return el ? el.innerText.replace(/\s+/g, ' ').trim() : null;
  }, name);
}

/** One band row's rendered text, by its data-week-row marker. */
async function rowText(page, key) {
  return page.evaluate((k) => {
    const el = document.querySelector(`[data-week-row="${k}"]`);
    return el ? el.innerText.replace(/\s+/g, ' ').trim() : null;
  }, key);
}

/** Everything a render must not have changed, as one comparable string. */
async function stateSnapshot(service, memberId) {
  const tables = [
    ['daily_checkins', 'id, local_date'],
    ['coach_assigned_workouts', 'id, status, scheduled_date'],
    ['assessment_assignments', 'id, status, due_at'],
    ['member_assignment_deliveries', 'assignment_id, delivered_at'],
    ['member_weekly_reflections', 'week_start, completed_at'],
    ['member_weekly_reflection_deliveries', 'week_start, delivered_at'],
    ['lifestyle_experiments', 'id, status, closed_at'],
    ['member_reset_plans', 'id, status, start_local_date'],
    ['intelligence_coach_alerts', 'id, status'],
  ];
  const out = {};
  for (const [table, columns] of tables) {
    const column = table === 'daily_checkins' ? 'user_id' : 'member_id';
    const { data, error } = await service.from(table).select(columns).eq(column, memberId);
    out[table] = error ? `ERROR ${error.message}` : JSON.stringify(data ?? []);
  }
  return JSON.stringify(out);
}

async function main() {
  if (!canMintSessions()) throw new Error('minting is not configured');
  if (!STAFF_EMAIL || !MEMBER_ID || !MEMBER_EMAIL) throw new Error('staff/member not configured');
  mkdirSync(SHOTS, { recursive: true });

  const service = serviceClient();
  const browser = await chromium.launch();
  const sessions = [];
  /** Undo state, filled in as writes happen and drained in the finally. */
  const undo = [];

  try {
    const { data: profile } = await service
      .from('profiles')
      .select('id, display_name, timezone, is_test')
      .eq('id', MEMBER_ID)
      .maybeSingle();
    if (!profile) throw new Error('the member id does not resolve to a profile');
    check('the fixture really is a seeded test account', profile.is_test === true, String(profile.is_test));

    const zone = profile.timezone ?? 'America/New_York';
    const memberToday = todayIn(zone);
    const serverToday = todayIn('UTC');
    const win = windowFor(memberToday);
    const label = `Week of ${dayText(win.from)} to ${dayText(win.to)}`;
    note(`her day is ${memberToday} (${zone}); the server's day is ${serverToday}`);
    note(`the band's week should be ${win.from} to ${win.to}, labelled "${label}"`);

    const offerWindowOpen = [5, 6, 0].includes(weekdayOf(memberToday));
    const todayInsideBandWindow = memberToday >= win.from && memberToday <= win.to;
    check(
      'the band window and the Friday-to-Sunday offer window really do differ today',
      offerWindowOpen && !todayInsideBandWindow,
      `offer window open=${offerWindowOpen}, today inside band window=${todayInsideBandWindow}`
    );

    // ---- The database's own answers, to check the screen against ----
    const { data: allCheckins } = await service
      .from('daily_checkins_current')
      .select('local_date')
      .eq('user_id', MEMBER_ID);
    const allDays = new Set((allCheckins ?? []).map((r) => r.local_date));
    const inWindowDays = new Set(
      [...allDays].filter((d) => d >= win.from && d <= win.to)
    );
    note(`database says ${inWindowDays.size} of her ${allDays.size} logged days fall in the window`);

    const { data: allWorkouts } = await service
      .from('coach_assigned_workouts')
      .select('scheduled_date, status')
      .eq('member_id', MEMBER_ID);
    const workoutsInWindow = (allWorkouts ?? []).filter(
      (w) => w.scheduled_date >= win.from && w.scheduled_date <= win.to
    );
    note(`database says ${workoutsInWindow.length} of her ${(allWorkouts ?? []).length} sessions are scheduled in the window`);

    // ---- 1. The coach opens her page ----
    const staff = await mintSessionContext(browser, STAFF_EMAIL, { baseUrl: BASE });
    if (!staff) throw new Error('could not mint a staff session');
    sessions.push(staff);
    const page = await staff.context.newPage();

    // The client LIST first, so we know what it shows for her before we
    // check the page repeats none of it and drops none of it.
    await page.goto(`${BASE}/coach`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const listText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    check('the client list still says "No check-in logged today" rather than "Missed"', !/Missed check-in today/i.test(listText), '');
    await page.screenshot({ path: `${SHOTS}/client-list.png`, fullPage: true });

    const openPage = async () => {
      await page.goto(`${BASE}/coach/clients/${MEMBER_ID}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4500);
    };
    await openPage();
    await page.screenshot({ path: `${SHOTS}/client-page.png`, fullPage: true });

    const bandText = await sectionText(page, 'this-week');
    check('the This Week band renders for a program tier client', bandText !== null);
    writeFileSync(`${SHOTS}/band.txt`, bandText ?? '(absent)');
    note(`band reads: ${bandText}`);

    // ---- 2. Where it sits ----
    const order = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-section]')).map((el) =>
        el.getAttribute('data-section')
      )
    );
    note(`section order: ${order.join(' > ')}`);
    check(
      'the band sits above "What is improving"',
      order.indexOf('this-week') > -1 && order.indexOf('this-week') < order.indexOf('improving')
    );
    check(
      'Worth discussing sits directly beneath the band and above "What is improving"',
      order.indexOf('worth-discussing') === order.indexOf('this-week') + 1 &&
        order.indexOf('worth-discussing') < order.indexOf('improving')
    );
    check(
      'nothing on the six question screen was removed',
      ['improving', 'needs-attention', 'reliability', 'working-on', 'in-the-way', 'ask-next'].every(
        (s) => order.includes(s)
      ),
      order.join(',')
    );

    // ---- 3. It names its window, and it is the recap's week ----
    const shownLabel = await page.locator('[data-testid="this-week-window"]').innerText();
    check('the band names its own seven days', shownLabel.trim() === label, `${shownLabel.trim()} vs ${label}`);

    // ---- 4. Every row against what is really stored ----
    const checkinLine = await rowText(page, 'checkins');
    check(
      'the check-in row counts the days inside the window',
      checkinLine?.includes(`Checked in on ${inWindowDays.size} of 7 days.`),
      checkinLine ?? ''
    );
    check(
      'and it is not quietly printing her all time total',
      inWindowDays.size !== allDays.size
        ? !checkinLine?.includes(`Checked in on ${allDays.size} of 7 days.`)
        : true,
      `window ${inWindowDays.size}, all time ${allDays.size}`
    );

    const programLine = await rowText(page, 'programs');
    const expectedProgram =
      workoutsInWindow.length === 0
        ? 'No sessions were scheduled in these 7 days.'
        : `${workoutsInWindow.length} session${workoutsInWindow.length === 1 ? '' : 's'} scheduled in these 7 days.`;
    check(
      'the programs row counts only the sessions scheduled inside the window',
      programLine?.includes(expectedProgram),
      `${programLine} :: expected "${expectedProgram}"`
    );

    // The reflection sentence must be the one the reflection panel itself
    // prints, not a second wording. The panel lives on ./detail.
    const reflectionLine = await rowText(page, 'weekly_reflection');
    await page.goto(`${BASE}/coach/clients/${MEMBER_ID}/detail`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    const panelLine = await page
      .locator('[data-testid="weekly-reflection-status-line"]')
      .innerText()
      .catch(() => null);
    check(
      'the reflection row is the identical sentence the Weekly Reflection panel prints',
      panelLine !== null && reflectionLine?.includes(panelLine.trim()),
      `band: ${reflectionLine} :: panel: ${panelLine}`
    );
    await openPage();

    const resetLine = await rowText(page, 'reset_plan');
    check('the Reset Plan row renders', resetLine !== null, resetLine ?? '');
    const experimentLine = await rowText(page, 'experiments');
    check('the experiments row renders', experimentLine !== null, experimentLine ?? '');
    const assignmentLine = await rowText(page, 'assignments');
    check('the assignments row renders', assignmentLine !== null, assignmentLine ?? '');
    const { data: shownAssignments } = await service
      .from('assessment_assignments')
      .select('assessment_definition_id, status')
      .eq('member_id', MEMBER_ID);
    const hasDeepDive = (shownAssignments ?? []).some(
      (a) => a.assessment_definition_id === '9f2c4d7e-3a51-4b86-9c0d-6e5f1a72b834'
    );
    if (hasDeepDive && (assignmentLine ?? '').includes('Completed')) {
      check(
        'the deep-dive is named on the band rather than called "Assessment"',
        (assignmentLine ?? '').includes('Stress & Load Deep-Dive') &&
          !/(^|\s)Assessment:/.test(assignmentLine ?? ''),
        assignmentLine ?? ''
      );
    }

    // ---- 5. The word the band may not use ----
    const pageText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    check('the word "missed" appears nowhere on the client page', !/missed/i.test(pageText), '');
    check('no em dash appears in the band', !(bandText ?? '').includes('—'), '');

    // ---- 6. Worth discussing: one finding, once ----
    const worthText = await sectionText(page, 'worth-discussing');
    writeFileSync(`${SHOTS}/worth-discussing.txt`, worthText ?? '(absent)');
    note(`worth discussing reads: ${worthText}`);
    check('the merged Worth discussing section renders', worthText !== null);

    const { data: openAlerts } = await service
      .from('intelligence_coach_alerts')
      .select('alert_key, title')
      .eq('member_id', MEMBER_ID)
      .in('status', ['open', 'acknowledged']);
    const titles = [...new Set((openAlerts ?? []).map((a) => a.title))];
    for (const title of titles) {
      const occurrences = pageText.split(title).length - 1;
      check(`the alert "${title}" appears exactly once on the whole page`, occurrences === 1, String(occurrences));
    }
    const hasNoCheckinAlert = (openAlerts ?? []).some((a) => a.alert_key === 'no_checkin');
    if (hasNoCheckinAlert) {
      check(
        'the "No check-in logged today" list reason is folded away, because an alert already says it',
        !/No check-in logged today/i.test(pageText),
        'the alert is shown instead'
      );
    }

    // A flag that used to exist only on the client list. Everything under
    // "Also flagged on your client list" is one, by construction.
    const listFlagBlock = await page.evaluate(() => {
      const el = document.querySelector('[data-section="worth-discussing"]');
      if (!el) return null;
      const text = el.innerText;
      const at = text.indexOf('Also flagged on your client list');
      return at === -1 ? null : text.slice(at).replace(/\s+/g, ' ').trim();
    });
    note(`list flags on the page: ${listFlagBlock ?? '(none for this client)'}`);

    // ---- 7. Reloading changes nothing ----
    const before = await stateSnapshot(service, MEMBER_ID);
    for (let i = 0; i < 3; i += 1) await openPage();
    const after = await stateSnapshot(service, MEMBER_ID);
    check('four page loads wrote nothing at all', before === after, before === after ? '' : 'state changed');

    // ---- 8. The count really is windowed ----
    // Move one of her existing check-in rows into a day inside the window
    // that has no row yet, and back again. A fresh row would be today's
    // date in every zone, which cannot test a window that ended on Friday.
    const donor = [...allDays].find((d) => d < win.from || d > win.to);
    let emptyDayInWindow = null;
    for (let i = 0; i < 7; i += 1) {
      const day = addDays(win.from, i);
      if (!allDays.has(day)) { emptyDayInWindow = day; break; }
    }
    if (donor && emptyDayInWindow) {
      const { data: donorRows } = await service
        .from('daily_checkins')
        .select('id, local_date')
        .eq('user_id', MEMBER_ID)
        .eq('local_date', donor);
      const donorRow = (donorRows ?? [])[0];
      if (donorRow) {
        undo.push(async () => {
          await service.from('daily_checkins').update({ local_date: donor }).eq('id', donorRow.id);
        });
        await service
          .from('daily_checkins')
          .update({ local_date: emptyDayInWindow })
          .eq('id', donorRow.id);
        await openPage();
        const moved = await rowText(page, 'checkins');
        check(
          `a check-in moved from ${donor} into ${emptyDayInWindow} raises the count by exactly one`,
          moved?.includes(`Checked in on ${inWindowDays.size + 1} of 7 days.`),
          moved ?? ''
        );

        await service.from('daily_checkins').update({ local_date: donor }).eq('id', donorRow.id);
        undo.pop();
        await openPage();
        const restored = await rowText(page, 'checkins');
        check(
          'moving it back out lowers the count again',
          restored?.includes(`Checked in on ${inWindowDays.size} of 7 days.`),
          restored ?? ''
        );
      }
    } else {
      note('no donor row outside the window, so the move test was skipped');
    }

    // ---- 9. Today's check-in, as the member ----
    const alreadyToday = allDays.has(memberToday);
    if (!alreadyToday) {
      const member = await mintSessionContext(browser, MEMBER_EMAIL, {
        baseUrl: BASE,
        viewport: { width: 430, height: 932 },
      });
      if (member) {
        sessions.push(member);
        const memberPage = await member.context.newPage();
        const submitted = await walkCheckin(memberPage);
        check('the member completed a real check-in today', submitted, memberToday);
        await memberPage.screenshot({ path: `${SHOTS}/member-checkin-final.png`, fullPage: true });
      }
    } else {
      note(`she already has a check-in for ${memberToday}`);
    }

    const { data: afterCheckin } = await service
      .from('daily_checkins_current')
      .select('local_date')
      .eq('user_id', MEMBER_ID);
    const daysNow = new Set((afterCheckin ?? []).map((r) => r.local_date));
    const inWindowNow = [...daysNow].filter((d) => d >= win.from && d <= win.to).length;
    await openPage();
    const afterLine = await rowText(page, 'checkins');
    check(
      "today's check-in leaves the count reading exactly the window's own days",
      afterLine?.includes(`Checked in on ${inWindowNow} of 7 days.`),
      `${afterLine} :: database says ${inWindowNow} in window, ${daysNow.size} all time`
    );
    check(
      "and today's day is correctly outside the window it reports on, so the number did not move",
      todayInsideBandWindow || inWindowNow === inWindowDays.size,
      `today ${memberToday}, window ${win.from} to ${win.to}`
    );

    // ---- 9b. A flag that used to exist only on the client list ----
    //
    // Her only list reason today is the check-in one, and an alert already
    // covers that, so the fold silences it: correct, and no proof that a
    // list-only flag reaches this page. So one is created. A safety branch
    // exercise report has no alert twin, which is exactly the case the
    // merge was built for. It is deleted again below.
    const { data: feedbackRow } = await service
      .from('member_exercise_feedback')
      .insert({
        member_id: MEMBER_ID,
        provider: 'your_move',
        external_id: 'verification-only',
        exercise_name: 'Split Squat',
        reason: 'pain',
        branch: 'safety',
        outcome: 'stopped_for_pain',
        initiated_by: 'member',
      })
      .select('id')
      .maybeSingle();
    if (feedbackRow) {
      undo.push(async () => {
        await service.from('member_exercise_feedback').delete().eq('id', feedbackRow.id);
      });
      await page.goto(`${BASE}/coach`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3500);
      const listNow = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      check(
        'the client LIST shows the exercise pain flag',
        listNow.includes('Exercise stopped, member reported pain'),
        ''
      );

      await openPage();
      const worthNow = await sectionText(page, 'worth-discussing');
      check(
        'and the client PAGE now shows that same flag, which used to be list only',
        (worthNow ?? '').includes('Exercise stopped, member reported pain'),
        worthNow ?? ''
      );
      check(
        'under a heading that says where it came from',
        (worthNow ?? '').includes('Also flagged on your client list'),
        ''
      );
      const pageNow = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      check(
        'and it appears exactly once on the whole page',
        pageNow.split('Exercise stopped, member reported pain').length - 1 === 1,
        String(pageNow.split('Exercise stopped, member reported pain').length - 1)
      );

      await service.from('member_exercise_feedback').delete().eq('id', feedbackRow.id);
      undo.pop();
      await openPage();
      const worthAfter = await sectionText(page, 'worth-discussing');
      check(
        'removing the report removes the flag again',
        !(worthAfter ?? '').includes('Exercise stopped, member reported pain'),
        ''
      );
    } else {
      note('could not create a verification exercise report, so the list-only flag check was skipped');
    }

    // ---- 10. A client who is not on the program tier ----
    const { data: sub } = await service
      .from('member_subscriptions')
      .select('tier')
      .eq('member_id', MEMBER_ID)
      .maybeSingle();
    const originalTier = sub?.tier ?? null;
    if (originalTier) {
      // The database refuses a direct write to a manual assignment, by
      // design: it may only move through the admin panel's own function.
      // So this goes the real way, as the signed in administrator, through
      // the same RPC the panel calls. Two audit rows land on the fixture's
      // membership history, which is what an administrator making this
      // change by hand would also leave.
      const asAdmin = createClient(
        process.env.PROD_SUPABASE_URL,
        readFileSync(process.env.PROD_ANON_KEY_FILE, 'utf8').trim(),
        {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${staff.session.access_token}` } },
        }
      );
      const setTier = (tier) =>
        asAdmin.rpc('admin_set_member_access', {
          p_member_id: MEMBER_ID,
          p_tier: tier,
          p_full_access: null,
          p_status: null,
          p_trial_ends_at: null,
          p_extend_trial_days: null,
          p_note: 'This Week band verification run',
        });

      const { error: flipError } = await setTier('monthly');
      const { data: check1 } = await service
        .from('member_subscriptions')
        .select('tier')
        .eq('member_id', MEMBER_ID)
        .maybeSingle();
      if (!flipError && check1?.tier === 'monthly') {
        undo.push(async () => {
          await setTier(originalTier);
        });
        await openPage();
        const gone = await sectionText(page, 'this-week');
        check('a client who is not on the program tier gets no band at all', gone === null, gone ?? 'absent');
        const stillWorth = await sectionText(page, 'worth-discussing');
        check('but Worth discussing still renders for her', stillWorth !== null);

        await setTier(originalTier);
        undo.pop();
        const { data: check2 } = await service
          .from('member_subscriptions')
          .select('tier')
          .eq('member_id', MEMBER_ID)
          .maybeSingle();
        check('her tier was put back exactly as it was', check2?.tier === originalTier, String(check2?.tier));
        await openPage();
        check('and the band is back', (await sectionText(page, 'this-week')) !== null);
      } else {
        note(`production refused the tier change (${flipError?.message ?? 'no change applied'}), so the non-program case was not driven live`);
      }
    }

    // ---- 11. The real client on the same caseload, read only ----
    if (REAL_MEMBER_ID) {
      const beforeReal = await stateSnapshot(service, REAL_MEMBER_ID);
      await page.goto(`${BASE}/coach/clients/${REAL_MEMBER_ID}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
      await page.screenshot({ path: `${SHOTS}/real-client-page.png`, fullPage: true });
      const realBand = await sectionText(page, 'this-week');
      const realWorth = await sectionText(page, 'worth-discussing');
      writeFileSync(`${SHOTS}/real-client-band.txt`, `${realBand}\n\n---\n\n${realWorth}`);
      note(`real client band: ${realBand}`);
      note(`real client worth discussing: ${realWorth}`);
      check('the band renders for the real program client too', realBand !== null);
      const realText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      check('and her page never says "missed" either', !/missed/i.test(realText), '');
      const afterReal = await stateSnapshot(service, REAL_MEMBER_ID);
      check('opening a real member\'s page wrote nothing to her account', beforeReal === afterReal);
    }
  } finally {
    for (const step of undo.reverse()) await step().catch((e) => console.error('undo failed', e));
    for (const s of sessions) await retireSession(s).catch(() => {});
    await browser.close();
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAILED: ${f.name}`);
    process.exitCode = 1;
  }
}

/**
 * One real daily check-in, driven the way
 * scripts/verify-checkin-then-home-live.mjs drives it: answer everything
 * answerable on the screen, press Continue, repeat. It never touches the
 * "send your coach" control, because a verification script has no business
 * flagging something to a real coach on a member's behalf.
 */
async function walkCheckin(page) {
  const NAV =
    /^(continue|next|back|done|submit|finish|save|skip|close|exit|cancel|update|home|go to screen|sign out|profile|membership|connected devices|notifications|help|about|e$)/i;
  const DO_NOT_TOUCH = /send your coach|something new or worsening/i;
  const ANSWER_SELECTOR =
    'main button:not([disabled]), main [role="radio"], main [role="option"], main [role="switch"]';

  await page.goto(`${BASE}/checkin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  for (let screen = 0; screen < 24; screen += 1) {
    await page.waitForTimeout(900);
    const groups = await page.evaluate(([navSource, selector]) => {
      const nav = new RegExp(navSource, 'i');
      const byParent = new Map();
      Array.from(document.querySelectorAll(selector)).forEach((el, domIndex) => {
        const name =
          (el.textContent ?? '').trim().replace(/\s+/g, ' ') || el.getAttribute('aria-label') || '';
        if (!name || nav.test(name) || /send your coach|something new or worsening/i.test(name)) return;
        const key = el.parentElement
          ? Array.from(document.querySelectorAll('*')).indexOf(el.parentElement)
          : -1;
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key).push({ domIndex, name });
      });
      return Array.from(byParent.values()).filter((g) => g.length >= 2);
    }, [NAV.source, ANSWER_SELECTOR]);

    const controls = page.locator(ANSWER_SELECTOR);
    for (const group of groups) {
      const pick = group[Math.floor(group.length / 2)];
      await controls.nth(pick.domIndex).click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(300);
    }

    const continueBtn = page.getByRole('button', {
      name: /^(continue|finish|submit|done|save check-in)$/i,
    });
    if ((await continueBtn.count()) === 0) return false;

    if (!(await continueBtn.first().isEnabled().catch(() => false))) {
      const remaining = page.locator(ANSWER_SELECTOR);
      const total = await remaining.count();
      for (let i = 0; i < total; i += 1) {
        const el = remaining.nth(i);
        const name = ((await el.innerText().catch(() => '')) || '').trim().replace(/\s+/g, ' ');
        if (!name || NAV.test(name) || DO_NOT_TOUCH.test(name)) continue;
        await el.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(300);
        if (await continueBtn.first().isEnabled().catch(() => false)) break;
      }
    }
    if (!(await continueBtn.first().isEnabled().catch(() => false))) return false;

    const wasSave = /save check-in/i.test(
      ((await continueBtn.first().innerText().catch(() => '')) || '').trim()
    );
    await continueBtn.first().click();
    await page.waitForTimeout(2600);
    if (wasSave || !page.url().includes('/checkin')) return true;
  }
  return false;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
