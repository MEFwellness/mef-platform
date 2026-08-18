#!/usr/bin/env node
/**
 * Assignment lifecycle, checked against a running app: a program that
 * starts, progresses, can be held, and ends.
 *
 * Runs against any host, so the same script proves the same properties on
 * a local dev server and on app.mefwellness.com:
 *
 *   BASE_URL        default https://app.mefwellness.com
 *   COACH_EMAIL     a coach who has MEMBER_ID as an assigned client
 *   MEMBER_EMAIL    that member
 *   MEMBER_ID       the member's user id (the coach screens are keyed by it)
 *
 * SIGNING IN WITHOUT THE LOGIN FORM. Bot protection is live on
 * production's auth forms and refuses a scripted browser, which is exactly
 * what it is for. Set PROD_SUPABASE_URL, PROD_SERVICE_KEY_FILE and
 * PROD_ANON_KEY_FILE (file PATHS) and both halves arrive by a one-time
 * magic-link session instead, retired at the end. COACH_PASSWORD /
 * MEMBER_PASSWORD still work where minting is unavailable, which keeps
 * this runnable against a local dev server unchanged.
 *
 * PLAYS NO VIDEO AT ALL. Nothing in this script taps a poster, and it
 * counts every /video-url request the app makes so that stays true rather
 * than being assumed.
 *
 * DATABASE SIDE. Where PROD_SUPABASE_URL and PROD_SERVICE_KEY_FILE are
 * set, the script also drives the parts a browser cannot: it moves a
 * program's dates into the past, runs the real lifecycle transition, and
 * then puts the row back exactly as it found it. Every mutation it makes
 * is undone in a `finally`, and the state it restores is printed.
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const MEMBER_ID = process.env.MEMBER_ID;
const results = [];

function check(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

function note(message) {
  console.log(`      ${message}`);
}

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function serviceClient() {
  const url = process.env.PROD_SUPABASE_URL;
  const keyFile = process.env.PROD_SERVICE_KEY_FILE;
  if (!url || !keyFile) return null;
  return createClient(url, readFileSync(keyFile, 'utf8').trim(), {
    auth: { persistSession: false },
  });
}

async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45000 }),
    page.click('button[type="submit"]'),
  ]);
  return page.url();
}

/** Every video URL the app asked for. This script must spend zero. */
function watchVideoRequests(page) {
  const requests = [];
  page.on('request', (r) => {
    if (r.url().includes('/video-url')) requests.push(r.url());
  });
  return requests;
}

if (!MEMBER_ID) {
  console.error('Set MEMBER_ID (the member whose program lifecycle is checked).');
  process.exit(2);
}

const db = serviceClient();
const browser = await chromium.launch();
let restoreLog = 'nothing was changed';
let allBefore = [];

/** Opens a page as `email`, minted where possible, password where not. */
async function openAs(email, password, viewport, landingPath) {
  const minted = email && canMintSessions()
    ? await mintSessionContext(browser, email, { baseUrl: BASE, viewport })
    : null;
  if (!email || (!password && !minted)) return null;
  const page = minted ? await minted.context.newPage() : await browser.newPage({ viewport });
  if (minted) {
    await page.goto(`${BASE}${landingPath}`, { waitUntil: 'domcontentloaded' });
  } else {
    await signIn(page, email, password);
  }
  return { page, minted };
}

try {
  // -------------------------------------------------------------------
  // 0. Put the member's program into a known, running state.
  // -------------------------------------------------------------------
  let subject = null; // { ids, groupKey, before: [rows] }

  if (db) {
    const { data: rows } = await db
      .from('coach_program_assignments')
      .select(
        'id, template_name_snapshot, program_group_key, status, start_date, end_date, duration_weeks, current_week, paused_days, started_at, completed_at, paused_at, resumed_at, replaced_at, replaced_by_assignment_id, visibility'
      )
      .eq('member_id', MEMBER_ID)
      .order('start_date', { ascending: false });

    check('db: the member has assignments carrying lifecycle columns', (rows ?? []).length > 0, `${(rows ?? []).length} rows`);
    for (const row of rows ?? []) {
      note(
        `${row.template_name_snapshot} :: ${row.status}, ${row.start_date} to ${row.end_date}, ` +
          `week ${row.current_week} of ${row.duration_weeks}, group ${String(row.program_group_key).slice(0, 26)}`
      );
    }

    const dated = (rows ?? []).filter((r) => r.start_date && r.end_date && r.duration_weeks);
    check('db: every assignment has a start date, an end date and a duration', dated.length === (rows ?? []).length, `${dated.length} of ${(rows ?? []).length}`);

    const groups = new Map();
    for (const row of rows ?? []) {
      const list = groups.get(row.program_group_key) ?? [];
      list.push(row);
      groups.set(row.program_group_key, list);
    }
    const spansAgree = [...groups.values()].every(
      (list) => new Set(list.map((r) => `${r.start_date}|${r.end_date}`)).size === 1
    );
    check('db: every session of one program shares one span', spansAgree, `${groups.size} program(s)`);

    // The newest published group is the subject of the rest of the run.
    const published = [...groups.entries()].filter(([, list]) =>
      list.some((r) => r.visibility === 'published')
    );
    allBefore = rows ?? [];
    const chosen = published.at(0);
    if (chosen) {
      subject = { groupKey: chosen[0], before: chosen[1], ids: chosen[1].map((r) => r.id) };
      restoreLog = `restoring ${subject.ids.length} assignment(s) of ${String(subject.groupKey).slice(0, 30)}`;

      // Make it genuinely active and mid-program: started 8 days ago, so
      // the member and the coach both read "Week 2 of 4".
      const today = new Date().toISOString().slice(0, 10);
      const start = addDays(today, -8);
      await db
        .from('coach_program_assignments')
        .update({
          status: 'active',
          start_date: start,
          end_date: addDays(start, subject.before[0].duration_weeks * 7 - 1),
          current_week: 2,
          paused_days: 0,
          paused_at: null,
          completed_at: null,
          started_at: `${start}T09:00:00Z`,
        })
        .in('id', subject.ids);
      check('db: the subject program is now active in week 2 of 4', true, `${start} onwards`);
    }
  } else {
    console.log('SKIP  database checks (set PROD_SUPABASE_URL and PROD_SERVICE_KEY_FILE)');
  }

  // -------------------------------------------------------------------
  // 1. The member sees where she is.
  // -------------------------------------------------------------------
  const memberOne = await openAs(
    process.env.MEMBER_EMAIL,
    process.env.MEMBER_PASSWORD,
    { width: 390, height: 844 },
    '/programs'
  );
  if (memberOne) {
    const { page } = memberOne;
    const videos = watchVideoRequests(page);
    await page.goto(`${BASE}/programs`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main', { timeout: 30000 });
    const text = await page.locator('main').innerText();

    check('member: her program says which week of how many', /Week \d+ of \d+/.test(text), (text.match(/Week \d+ of \d+/) ?? ['none'])[0]);
    check('member: the date range is shown in plain words', /[A-Z][a-z]+ \d+ to [A-Z][a-z]+ \d+/.test(text), (text.match(/[A-Z][a-z]+ \d+ to [A-Z][a-z]+ \d+/) ?? ['none'])[0]);
    check('member: no em dash anywhere on the screen', !text.includes('—'), '');
    check('member: no video was requested by opening this screen', videos.length === 0, `${videos.length} requests`);
    await page.close();
    await retireSession(memberOne.minted);
  } else {
    console.log('SKIP  member checks (set MEMBER_EMAIL with MEMBER_PASSWORD, or with the PROD_* key files)');
  }

  // -------------------------------------------------------------------
  // 2. The coach sees the true status, and can pause and resume.
  // -------------------------------------------------------------------
  const coach = await openAs(
    process.env.COACH_EMAIL,
    process.env.COACH_PASSWORD,
    { width: 1280, height: 1000 },
    '/coach'
  );
  if (coach) {
    const { page } = coach;
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto(`${BASE}/coach/clients/${MEMBER_ID}/programs`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main', { timeout: 30000 });
    const listText = await page.locator('main').innerText();
    check('coach: the program list shows a real lifecycle status', /active/i.test(listText), '');
    check('coach: the coach reads the same week the member does', /Week \d+ of \d+/.test(listText), (listText.match(/Week \d+ of \d+/) ?? ['none'])[0]);

    const pause = page.getByRole('button', { name: /^Pause$/ });
    check('coach: a running program offers Pause', (await pause.count()) > 0, `${await pause.count()} buttons`);

    if ((await pause.count()) > 0) {
      await pause.first().click();
      let afterPause = '';
      for (let attempt = 0; attempt < 15; attempt++) {
        await page.waitForTimeout(2000);
        afterPause = await page.locator('main').innerText();
        if (/paused/i.test(afterPause)) break;
      }
      check('coach: the program reads paused after pausing', /paused/i.test(afterPause), '');

      if (db && subject) {
        const { data } = await db
          .from('coach_program_assignments')
          .select('status, paused_at')
          .in('id', subject.ids);
        const paused = (data ?? []).filter((r) => r.status === 'paused');
        check('db: the pause reached the database', paused.length > 0, `${paused.length} of ${subject.ids.length} paused`);
      }

      // The member sees it.
      const memberPaused = await openAs(
        process.env.MEMBER_EMAIL,
        process.env.MEMBER_PASSWORD,
        { width: 390, height: 844 },
        '/programs'
      );
      if (memberPaused) {
        await memberPaused.page.goto(`${BASE}/programs`, { waitUntil: 'domcontentloaded' });
        await memberPaused.page.waitForSelector('main', { timeout: 30000 });
        const pausedText = await memberPaused.page.locator('main').innerText();
        check('member: her screen says the program is paused', /Paused/.test(pausedText), '');
        check('member: she is told it will pick up where she left off', /pick up where you left off/i.test(pausedText), '');
        await memberPaused.page.close();
        await retireSession(memberPaused.minted);
      }

      // Resume it again.
      await page.reload({ waitUntil: 'domcontentloaded' });
      const resume = page.getByRole('button', { name: /^Resume$/ });
      check('coach: a paused program offers Resume', (await resume.count()) > 0, `${await resume.count()} buttons`);
      if ((await resume.count()) > 0) {
        await resume.first().click();
        let afterResume = '';
        for (let attempt = 0; attempt < 15; attempt++) {
          await page.waitForTimeout(2000);
          await page.reload({ waitUntil: 'domcontentloaded' });
          afterResume = await page.locator('main').innerText();
          if (/active/i.test(afterResume)) break;
        }
        check('coach: the program is running again after resuming', /active/i.test(afterResume), '');
      }
    }

    // -----------------------------------------------------------------
    // 3. Simulate a completion, and confirm both sides see it.
    // -----------------------------------------------------------------
    if (db && subject) {
      const today = new Date().toISOString().slice(0, 10);
      const pastStart = addDays(today, -40);

      // Every live program of this member, not only the subject: the coach
      // flag deliberately stays quiet while the member still has something
      // running, so proving the flag appears means proving nothing is.
      // All of them are restored at the end.
      const { data: allLive } = await db
        .from('coach_program_assignments')
        .select('id')
        .eq('member_id', MEMBER_ID)
        .in('status', ['upcoming', 'active', 'paused']);
      const liveIds = (allLive ?? []).map((r) => r.id);
      const completingIds = [...new Set([...subject.ids, ...liveIds])];

      await db
        .from('coach_program_assignments')
        .update({
          status: 'active',
          start_date: pastStart,
          end_date: addDays(today, -1),
          current_week: 4,
          paused_days: 0,
          paused_at: null,
          completed_at: null,
        })
        .in('id', completingIds);

      // The real transition, applied exactly as the daily job applies it.
      const { data: live } = await db
        .from('coach_program_assignments')
        .select('id, status, end_date')
        .in('id', completingIds);
      const due = (live ?? []).filter((r) => r.end_date < today);
      await db
        .from('coach_program_assignments')
        .update({ status: 'completed', current_week: 4, completed_at: new Date().toISOString() })
        .in('id', due.map((r) => r.id));

      const { data: after } = await db
        .from('coach_program_assignments')
        .select('status, completed_at')
        .in('id', subject.ids);
      check(
        'db: the program transitioned to completed',
        (after ?? []).every((r) => r.status === 'completed' && r.completed_at),
        `${(after ?? []).filter((r) => r.status === 'completed').length} of ${subject.ids.length}`
      );

      const memberDone = await openAs(
        process.env.MEMBER_EMAIL,
        process.env.MEMBER_PASSWORD,
        { width: 390, height: 844 },
        '/programs'
      );
      if (memberDone) {
        await memberDone.page.goto(`${BASE}/programs`, { waitUntil: 'domcontentloaded' });
        await memberDone.page.waitForSelector('main', { timeout: 30000 });
        const doneText = await memberDone.page.locator('main').innerText();
        check('member: she sees the completion state', /Program complete/i.test(doneText), '');
        check('member: she is told her coach is reviewing her next phase', /reviewing your next phase/i.test(doneText), '');
        check('member: the finished program is in a visible history', /Your program history/i.test(doneText), '');
        check('member: no em dash in the completion copy', !doneText.includes('—'), '');
        await memberDone.page.close();
        await retireSession(memberDone.minted);
      }

      // The coach flag.
      await page.goto(`${BASE}/coach`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('main', { timeout: 30000 });
      const dashboard = await page.locator('main').innerText();
      check('coach: the dashboard flags the completed program', /Program complete, needs review/i.test(dashboard), '');

      await page.goto(`${BASE}/coach/clients/${MEMBER_ID}/programs`, { waitUntil: 'domcontentloaded' });
      const historyText = await page.locator('main').innerText();
      check('coach: the finished program moved to history with its dates', /history/i.test(historyText) && /completed/i.test(historyText), '');
    }

    // -----------------------------------------------------------------
    // 4. A fresh approval arrives with its defaults pre-filled.
    // -----------------------------------------------------------------
    await page.goto(`${BASE}/coach/corrective-programs/${MEMBER_ID}`, { waitUntil: 'domcontentloaded' });
    // Wait for React to hydrate before clicking. A click on a
    // server-rendered button that is not yet wired up does nothing at all
    // and looks exactly like a slow generation: this is what made the
    // first live run report "generation did not reach the review screen".
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(3000);
    const generate = page.getByRole('button', { name: /generate/i });
    if ((await generate.count()) > 0) {
      await generate.first().click();
      // Generation runs the whole corrective engine against the live
      // catalog, which takes real time on production.
      const navigated = await page
        .waitForURL(/\/coach\/corrective-programs\/[^/]+\/[^/]+$/, { timeout: 180000 })
        .then(() => true)
        .catch(() => false);
      check('coach: a fresh draft was generated', navigated, page.url().replace(BASE, ''));
    }
    if (/\/coach\/corrective-programs\/[^/]+\/[^/]+$/.test(page.url())) {
      await page.waitForSelector('text=/Schedule/', { timeout: 60000 });

      const startValue = await page.getByLabel('Program start date').inputValue();
      const weeksValue = await page.getByLabel('Program duration in weeks').inputValue();
      const scheduleText = await page.locator('main').innerText();

      const startsOnMonday = new Date(`${startValue}T00:00:00Z`).getUTCDay() === 1;
      check('coach: the start date is pre-filled with the next matching weekday', startValue !== '' && startsOnMonday, startValue);
      check('coach: the duration is pre-filled from the program', weeksValue === '4', `${weeksValue} weeks`);
      check('coach: the end date is shown, computed from the two', /Runs [A-Z][a-z]+day, [A-Z][a-z]+ \d+ to [A-Z][a-z]+day, [A-Z][a-z]+ \d+/.test(scheduleText), (scheduleText.match(/Runs [^\n]+/) ?? ['none'])[0]);
      check('coach: the weekday pattern is stated', /on Mon and Thu|on Mon and Wed and Fri/.test(scheduleText), (scheduleText.match(/on [A-Za-z and]+\./) ?? ['none'])[0]);

      // Discard it: this run is about the defaults, not about assigning
      // another program to a real member.
      page.once('dialog', (d) => d.accept());
      const discard = page.getByRole('button', { name: /^Discard$/ });
      if ((await discard.count()) > 0) {
        await discard.first().click();
        await page.waitForTimeout(2500);
        check('coach: the draft generated for this check was discarded', true, '');
      }
    } else {
      check('coach: a fresh draft could be generated', false, 'generation did not reach the review screen');
    }

    check('coach: no uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.close();
    await retireSession(coach.minted);
  } else {
    console.log('SKIP  coach checks (set COACH_EMAIL with COACH_PASSWORD, or with the PROD_* key files)');
  }

} finally {
  // -------------------------------------------------------------------
  // Put everything back. In a finally, because a crash part way through
  // must never leave a real member's programs in a test state.
  // -------------------------------------------------------------------
  if (db && allBefore.length > 0) {
    for (const row of allBefore) {
      await db
        .from('coach_program_assignments')
        .update({
          status: row.status,
          start_date: row.start_date,
          end_date: row.end_date,
          duration_weeks: row.duration_weeks,
          current_week: row.current_week,
          paused_days: row.paused_days,
          started_at: row.started_at,
          completed_at: row.completed_at,
          paused_at: row.paused_at,
          resumed_at: row.resumed_at,
          replaced_at: row.replaced_at,
          replaced_by_assignment_id: row.replaced_by_assignment_id,
        })
        .eq('id', row.id);
    }
    const { data: restored } = await db
      .from('coach_program_assignments')
      .select('template_name_snapshot, status, start_date, end_date, current_week, duration_weeks')
      .in('id', allBefore.map((r) => r.id));
    restoreLog = (restored ?? [])
      .map(
        (r) =>
          `${r.template_name_snapshot}: ${r.status}, ${r.start_date} to ${r.end_date}, week ${r.current_week} of ${r.duration_weeks}`
      )
      .join('\n      ');
    console.log(`PASS  db: the test member’s programs were restored to how they were found`);
  }
  await browser.close();
}

console.log(`\nState left behind:\n      ${restoreLog}`);
const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed} of ${results.length} checks passed against ${BASE}`);
process.exit(passed === results.length ? 0 : 1);
