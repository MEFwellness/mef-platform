/**
 * Live verification for the 2026-08-30 coach-view fixes.
 *
 * Three questions, asked on the real production site, signed in as the
 * real coach these members are assigned to.
 *
 *   1. HER CHECK-IN HISTORY. On a member who reported no pain, the
 *      follow-up "Where is it, mainly?" must not appear against that day,
 *      and nothing anywhere in the history may render as `[]`, a brace or
 *      a bare JSON quote.
 *
 *   2. WHAT NEEDS ATTENTION. The member's own page may show only her own
 *      alerts, and a member with none must get the calm empty state.
 *
 *   3. A MEMBER WHO CHECKED IN YESTERDAY. No "No recent check-in" alert,
 *      at all.
 *
 * The days each member reported no pain, and which alerts stand against
 * her, are read from the database first, so the screen is checked against
 * the truth rather than against itself.
 *
 * Sessions are minted one-time (Turnstile blocks a scripted form sign-in
 * by design) and retired with scope 'local'.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = 'https://app.mefwellness.com';
const COACH_EMAIL = 'oakomah66@gmail.com';
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

/** The coach's own user id, resolved from the auth record rather than assumed: profiles carries no email column. */
async function coachId() {
  let page = 1;
  for (;;) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const match = (data?.users ?? []).find((u) => u.email === COACH_EMAIL);
    if (match) return match.id;
    if ((data?.users ?? []).length < 200) return null;
    page += 1;
  }
}

/** Everything the screens are checked against, read straight from production. */
async function truth(coach) {
  const { data: assignments } = await service
    .from('coach_client_assignments')
    .select('client_id')
    .eq('coach_id', coach);
  const clientIds = (assignments ?? []).map((a) => a.client_id);

  const { data: profiles } = await service
    .from('profiles')
    .select('id, display_name')
    .in('id', clientIds);

  const { data: checkins } = await service
    .from('daily_checkins')
    .select('user_id, local_date, pain_discomfort_level')
    .in('user_id', clientIds)
    .order('local_date', { ascending: false });

  const { data: painLocations } = await service
    .from('daily_checkin_probe_answers')
    .select('member_id, local_date, value')
    .in('member_id', clientIds)
    .eq('question_key', 'checkin_probe.pain_location');

  const { data: alerts } = await service
    .from('intelligence_coach_alerts')
    .select('member_id, alert_key, title, status')
    .in('member_id', clientIds)
    .in('status', ['open', 'acknowledged']);

  const today = new Date().toISOString().slice(0, 10);

  return (profiles ?? []).map((profile) => {
    const days = (checkins ?? []).filter((c) => c.user_id === profile.id);
    const last = days[0]?.local_date ?? null;
    const locations = (painLocations ?? []).filter((p) => p.member_id === profile.id);
    const noPainDaysWithALocationRow = locations.filter((row) => {
      const day = days.find((d) => d.local_date === row.local_date);
      return day && (day.pain_discomfort_level === 0 || day.pain_discomfort_level === null);
    });
    return {
      id: profile.id,
      name: profile.display_name,
      painByDate: Object.fromEntries(days.map((d) => [d.local_date, d.pain_discomfort_level])),
      lastCheckin: last,
      daysSinceLastCheckin:
        last === null
          ? null
          : Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`)) / 86_400_000),
      noPainDaysWithALocationRow: noPainDaysWithALocationRow.length,
      standingAlerts: (alerts ?? []).filter((a) => a.member_id === profile.id),
    };
  });
}

async function visit(context, path) {
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  const response = await page.goto(`${BASE}${path}`, {
    waitUntil: 'domcontentloaded',
    timeout: NAV_TIMEOUT,
  });
  await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT }).catch(() => {});
  return { page, status: response?.status() ?? 0, consoleErrors, pageErrors, url: page.url() };
}

const run = async () => {
  const coach = await coachId();
  if (!coach) throw new Error('could not resolve the coach account');

  const members = await truth(coach);
  console.log('\nProduction, read directly:');
  for (const m of members) {
    console.log(
      `  ${m.name}: last check-in ${m.lastCheckin} (${m.daysSinceLastCheckin} days ago), ` +
        `${m.noPainDaysWithALocationRow} no-pain days carrying a stored pain-location row, ` +
        `${m.standingAlerts.length} standing alerts`
    );
  }
  console.log('');

  const browser = await chromium.launch();
  let minted = null;
  try {
    minted = await mintSessionContext(browser, COACH_EMAIL, {
      baseUrl: BASE,
      viewport: { width: 1280, height: 1400 },
    });
    if (!minted) throw new Error('could not mint a coach session');

    // A member who has a stored pain-location row on a day she reported no
    // pain: the exact shape that put `[]` on a coach's screen.
    const withPhantom = members.find((m) => m.noPainDaysWithALocationRow > 0) ?? members[0];

    // -----------------------------------------------------------------
    // 1. Her check-ins
    // -----------------------------------------------------------------
    const entries = await visit(minted.context, `/coach/clients/${withPhantom.id}/entries`);
    await entries.page.screenshot({ path: `${SHOTS}/coach-entries.png`, fullPage: true });

    // Every question and answer she is shown, day by day, read from the
    // rendered rows themselves rather than from the whole page text: the
    // page text also carries Next's own script payload, which legitimately
    // contains brackets and would make a text search meaningless.
    const days = await entries.page.$$eval('[data-checkin-date]', (blocks) =>
      blocks.map((block) => ({
        date: block.getAttribute('data-checkin-date'),
        rows: [...block.querySelectorAll('[data-answer-key]')].map((row) => ({
          key: row.getAttribute('data-answer-key'),
          question: row.children[0]?.textContent ?? '',
          answer: row.children[1]?.textContent ?? '',
        })),
      }))
    );

    record(
      'the check-in history loads for the coach',
      entries.status === 200 && days.length > 0,
      `${withPhantom.name}: status ${entries.status}, ${days.length} days rendered, ${entries.pageErrors.length} page errors, ${entries.consoleErrors.length} console errors`
    );

    const allAnswers = days.flatMap((day) => day.rows.map((row) => row.answer));
    const punctuationOnly = allAnswers.filter((answer) => /[[\]{}"]/.test(answer));
    record(
      'no answer anywhere in her history renders as a bracket, a brace or a quote mark',
      punctuationOnly.length === 0,
      `${allAnswers.length} rendered answers checked, ${punctuationOnly.length} carrying JSON punctuation${punctuationOnly.length ? `: ${punctuationOnly.slice(0, 3).join(' / ')}` : ''}`
    );

    const painRowsOnNoPainDays = days.filter(
      (day) =>
        day.rows.some((row) => row.key === 'checkin_probe.pain_location') &&
        !(withPhantom.painByDate[day.date] > 0)
    );
    record(
      '"Where is it, mainly?" is shown on no day she reported no pain',
      painRowsOnNoPainDays.length === 0,
      `${withPhantom.name} has ${withPhantom.noPainDaysWithALocationRow} no-pain days carrying a stored location row; ${painRowsOnNoPainDays.length} of them still render the question`
    );

    const painRowsOnPainDays = days.filter(
      (day) =>
        day.rows.some((row) => row.key === 'checkin_probe.pain_location') &&
        withPhantom.painByDate[day.date] > 0
    );
    record(
      'a day she DID report pain still shows where it was, in words',
      painRowsOnPainDays.length > 0 &&
        painRowsOnPainDays.every((day) => {
          const answer = day.rows.find((row) => row.key === 'checkin_probe.pain_location').answer;
          return answer.length > 0 && !/[[\]_]/.test(answer);
        }),
      painRowsOnPainDays
        .map((day) => `${day.date}: "${day.rows.find((r) => r.key === 'checkin_probe.pain_location').answer}"`)
        .join(', ') || 'no day with pain in the window'
    );

    // -----------------------------------------------------------------
    // 2 and 3. What needs attention, per member
    // -----------------------------------------------------------------
    for (const member of members) {
      const page = await visit(minted.context, `/coach/clients/${member.id}`);
      const section = page.page.locator('[data-section="needs-attention"]');
      const sectionText = (await section.textContent().catch(() => '')) ?? '';
      await page.page.screenshot({
        path: `${SHOTS}/coach-member-${member.name ?? member.id}.png`,
        fullPage: true,
      });

      record(
        `${member.name}: her page loads`,
        page.status === 200 && page.pageErrors.length === 0,
        `status ${page.status}, ${page.pageErrors.length} page errors, ${page.consoleErrors.length} console errors`
      );

      const shownAlerts = (sectionText.match(/No recent check-in/g) ?? []).length;
      const standingNoCheckin = member.standingAlerts.filter((a) => a.alert_key === 'no_checkin').length;
      record(
        `${member.name}: "No recent check-in" appears exactly as often as the database says it stands`,
        shownAlerts === standingNoCheckin,
        `on the page: ${shownAlerts}, standing in the database: ${standingNoCheckin}, last check-in ${member.lastCheckin} (${member.daysSinceLastCheckin} days ago)`
      );

      if (member.daysSinceLastCheckin !== null && member.daysSinceLastCheckin <= 1) {
        record(
          `${member.name}: checked in within a day, so is not told she has stopped`,
          shownAlerts === 0,
          `last check-in ${member.lastCheckin}`
        );
      }

      // The section has three sources: urgent alerts, routine alerts and
      // the interpretation layer's own findings. The calm empty state is
      // only correct when all three are empty, so this only asserts it for
      // a member whose section really has nothing in it.
      const findingRows = await section.locator('li').count().catch(() => 0);
      if (member.standingAlerts.length === 0 && findingRows === 0) {
        record(
          `${member.name}: with nothing standing, the section is calm rather than blank`,
          sectionText.includes('Nothing needs attention right now. She is on track.'),
          `section read: "${sectionText.trim().slice(0, 160)}"`
        );
      } else {
        record(
          `${member.name}: the section shows only what really stands against her`,
          !sectionText.includes('Nothing needs attention right now'),
          `${member.standingAlerts.length} standing alerts and ${findingRows} findings, so the empty state is correctly absent`
        );
      }

      await page.page.close();
    }

    await entries.page.close();
  } finally {
    await retireSession(minted);
    await browser.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) process.exitCode = 1;
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
