#!/usr/bin/env node
/**
 * The program card, as a member actually meets it.
 *
 * The polish pass made this card the hero of the home screen, gave it a
 * state for every point in a program's life, and added one mark that is
 * about the act of receiving a program rather than about the program:
 * "New from your coach", which retires the first time she opens it.
 *
 * This drives the real app. It seeds one program for the test member,
 * walks her through the presentations Home and Movement can actually
 * reach, captures what each says and a screenshot of each, opens the
 * program once to prove the mark clears and stays cleared, then puts the
 * database back exactly as it found it.
 *
 *   BASE_URL              default https://app.mefwellness.com
 *   MEMBER_ID             the member the program is seeded for
 *   MEMBER_EMAIL          her account, for minting a session
 *   PROD_SUPABASE_URL     )
 *   PROD_SERVICE_KEY_FILE ) file PATHS, never values (see CLAUDE.md)
 *   PROD_ANON_KEY_FILE    )
 *   SHOTS                 where screenshots land, default ./hero-shots
 *
 * PLAYS NO VIDEO. Every /video-url request is counted, and the count has
 * to be zero: this card must cost nothing to look at.
 *
 * WHAT IT CANNOT SHOW, and why. Home and Movement point at the program she
 * is ON, which is upcoming, active or paused. A completed program has
 * never been what either screen points at, and this pass deliberately did
 * not change that rule, so the card's completed state is proved by the
 * test suite rather than screenshotted here.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const MEMBER_ID = process.env.MEMBER_ID;
const MEMBER_EMAIL = process.env.MEMBER_EMAIL;
const SHOTS = process.env.SHOTS ?? path.resolve(process.cwd(), 'hero-shots');
const GROUP_KEY = `program-hero-check-${Date.now()}`;

const results = [];
let videosPlayed = 0;

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

/** The vocabulary a member must never meet, mirroring lib/programs/memberPresentation.ts. */
const FORBIDDEN = [
  'lower cross',
  'upper cross',
  'flat back',
  'forward head',
  'auto-generated',
  'corrective phase',
  'corrective program generator',
  'generated with seed',
  'detected patterns',
  'overall severity',
  'worst finding',
  'not yet reviewed',
  'postural pattern',
  'crossed pattern',
];
const SEED_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function scanLanguage(screenName, text) {
  const hits = FORBIDDEN.filter((phrase) => text.toLowerCase().includes(phrase));
  if (SEED_PATTERN.test(text)) hits.push('a generation seed');
  if (text.includes('—')) hits.push('an em dash');
  check(`${screenName}: nothing clinical, no em dash`, hits.length === 0, hits.join(', ') || 'clean');
}

if (!MEMBER_ID || !MEMBER_EMAIL) {
  console.error('Set MEMBER_ID and MEMBER_EMAIL.');
  process.exit(2);
}
if (!canMintSessions()) {
  console.error(
    'Set PROD_SUPABASE_URL, PROD_SERVICE_KEY_FILE and PROD_ANON_KEY_FILE (file paths).'
  );
  process.exit(2);
}

// A closed stdout must never kill this run before the restore below. Use
// `tail`, not `head`.
process.stdout.on('error', (err) => {
  if (err.code !== 'EPIPE') throw err;
});

const db = createClient(
  process.env.PROD_SUPABASE_URL,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
  { auth: { persistSession: false, autoRefreshToken: false } }
);

mkdirSync(SHOTS, { recursive: true });

const created = { assignmentIds: [], workoutIds: [] };
let existingBefore = { assignments: 0, workouts: 0, openEvents: 0 };
let restoreLog = 'nothing was changed';
const browser = await chromium.launch();
let minted = null;

/**
 * Reads the card's own text off whichever screen is open.
 *
 * The settle is not politeness. Home opens on a splash animation that
 * covers the screen for a beat, and a screenshot taken under it is a
 * picture of the logo. innerText reads straight through the overlay, so
 * only the pictures needed this; waiting here keeps both honest.
 */
async function readCard(page) {
  await page.waitForSelector('main', { timeout: 30000 });
  await page.waitForTimeout(3500);
  const main = await page.locator('main').innerText();
  return main.replace(/\r/g, '');
}

/**
 * Screenshots the page's own column rather than the viewport.
 *
 * Two reasons, both real. Root's pop-up chain can be over Home on any
 * given load, and it is portaled to the body, so a viewport shot is a
 * picture of a modal and a scroll-locked page underneath it. And the whole
 * point of this pass is where the card sits relative to everything else,
 * which one tall picture of <main> shows and a phone-sized crop does not.
 *
 * Nothing is clicked, dismissed or deferred to get this picture.
 */
async function shoot(page, name) {
  const file = path.join(SHOTS, `${name}.png`);
  const main = page.locator('main').first();
  await main.screenshot({ path: file }).catch(() => page.screenshot({ path: file }));
  note(`screenshot: ${file}`);
}

/** Puts the seeded program into one status and reloads Home. */
async function setStatus(fields) {
  const { error } = await db
    .from('coach_program_assignments')
    .update(fields)
    .in('id', created.assignmentIds);
  if (error) throw new Error(`status update failed: ${error.message}`);
}

try {
  // -------------------------------------------------------------------
  // 0. What she has before anything is touched. This is the number the
  //    restore has to land back on.
  // -------------------------------------------------------------------
  const { data: beforeAssignments } = await db
    .from('coach_program_assignments')
    .select('id')
    .eq('member_id', MEMBER_ID);
  const { data: beforeWorkouts } = await db
    .from('coach_assigned_workouts')
    .select('id')
    .eq('member_id', MEMBER_ID);
  const { data: beforeEvents } = await db
    .from('member_wellness_events')
    .select('id')
    .eq('member_id', MEMBER_ID)
    .eq('event_type', 'program_opened');
  existingBefore = {
    assignments: (beforeAssignments ?? []).length,
    workouts: (beforeWorkouts ?? []).length,
    openEvents: (beforeEvents ?? []).length,
  };
  note(
    `before: ${existingBefore.assignments} assignments, ${existingBefore.workouts} workouts, ` +
      `${existingBefore.openEvents} program_opened events`
  );

  // -------------------------------------------------------------------
  // 1. Seed one program: one assignment, two published sessions.
  // -------------------------------------------------------------------
  const { data: coachRow } = await db
    .from('coach_client_relationships')
    .select('coach_id')
    .eq('client_id', MEMBER_ID)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  const coachId = coachRow?.coach_id ?? MEMBER_ID;

  const today = new Date().toISOString().slice(0, 10);
  const startDate = addDays(today, 8); // upcoming, comfortably ahead
  const { data: assignment, error: assignmentError } = await db
    .from('coach_program_assignments')
    .insert({
      member_id: MEMBER_ID,
      coach_id: coachId,
      template_id: null,
      template_name_snapshot: 'Strong After 40',
      schedule_type: 'weekly',
      schedule_config: { type: 'weekly', startDate, daysOfWeek: [1, 4], weeks: 4 },
      visibility: 'published',
      published_at: new Date().toISOString(),
      status: 'upcoming',
      start_date: startDate,
      end_date: addDays(startDate, 27),
      duration_weeks: 4,
      current_week: 1,
      program_group_key: GROUP_KEY,
    })
    .select('id')
    .single();
  if (assignmentError) throw new Error(`assignment insert failed: ${assignmentError.message}`);
  created.assignmentIds.push(assignment.id);

  for (const [index, offset] of [0, 3].entries()) {
    const { data: w, error: wError } = await db
      .from('coach_assigned_workouts')
      .insert({
        assignment_id: assignment.id,
        member_id: MEMBER_ID,
        coach_id: coachId,
        template_name: `Strong After 40: Session ${index === 0 ? 'A' : 'B'}`,
        scheduled_date: addDays(startDate, offset),
        program_week: 1,
        status: 'not_started',
        published_at: new Date().toISOString(),
        corrective_tags: [],
        program_tags: [GROUP_KEY],
      })
      .select('id')
      .single();
    if (wError) throw new Error(`workout insert failed: ${wError.message}`);
    created.workoutIds.push(w.id);
  }
  check('seed: one program, two sessions, published', created.workoutIds.length === 2, GROUP_KEY);

  // -------------------------------------------------------------------
  // 2. Sign in, and never through the login form (Turnstile is live, by
  //    design). See scripts/lib/mint-session.mjs.
  // -------------------------------------------------------------------
  minted = await mintSessionContext(browser, MEMBER_EMAIL, {
    baseUrl: BASE,
    viewport: { width: 390, height: 844 },
  });
  if (!minted) throw new Error('could not mint a session for the member');
  check('session: minted for the member, no password and no login form', true, MEMBER_EMAIL);

  const page = await minted.context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => {
    if (r.url().includes('/video-url')) videosPlayed += 1;
  });

  // -------------------------------------------------------------------
  // 3. UPCOMING, and freshly assigned.
  // -------------------------------------------------------------------
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  let home = await readCard(page);
  await shoot(page, '1-home-upcoming-new');

  check('home upcoming: the card is there', /Your program/i.test(home), '');
  check('home upcoming: it names the program', /Strong After 40/.test(home), '');
  check(
    'home upcoming: it says when it starts, with the weekday',
    /Starts \w+day, \w+ \d+/.test(home),
    (home.match(/Starts [^\n]+/) ?? ['none'])[0]
  );
  check(
    'home upcoming: it offers the first session, not the next one',
    /First session:/.test(home) && /See your first session/.test(home),
    (home.match(/First session: [^\n]+/) ?? ['none'])[0]
  );
  check('home upcoming: it is marked new', /New from your coach/.test(home), '');
  scanLanguage('home upcoming', home);

  // The Movement screen shows the same card, from the same entry.
  await page.goto(`${BASE}/movement`, { waitUntil: 'domcontentloaded' });
  const movement = await readCard(page);
  await shoot(page, '2-movement-upcoming-new');
  check(
    'movement: the same card, same program, same status, same mark',
    /Your program/i.test(movement) &&
      /Strong After 40/.test(movement) &&
      /Starts \w+day/.test(movement) &&
      /New from your coach/.test(movement),
    ''
  );
  check(
    'movement: the old duplicate heading above the card is gone',
    !/Your program from your coach/i.test(movement),
    ''
  );
  scanLanguage('movement', movement);

  // -------------------------------------------------------------------
  // 4. She opens it. The mark retires, and stays retired.
  // -------------------------------------------------------------------
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('main', { timeout: 30000 });
  const cta = page.getByRole('link', { name: /See your first session|Open your program/i }).first();
  await cta.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(400);
  try {
    await cta.click({ timeout: 15000 });
  } catch {
    const href = await cta.getAttribute('href');
    await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForURL(/\/programs/, { timeout: 30000 });
  await page.waitForSelector('main', { timeout: 30000 });
  const session = await readCard(page);
  check('open: the card leads into her program', /\/programs/.test(page.url()), page.url().replace(BASE, ''));
  scanLanguage('the session screen', session);

  // The write happens after paint, so give it a beat before asking.
  await page.waitForTimeout(2500);
  const { data: openEvents } = await db
    .from('member_wellness_events')
    .select('id, source_record_id, payload')
    .eq('member_id', MEMBER_ID)
    .eq('event_type', 'program_opened')
    .in('source_record_id', created.assignmentIds);
  check(
    'open: exactly one program_opened event was written for this program',
    (openEvents ?? []).length === 1,
    `${(openEvents ?? []).length} rows`
  );

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  home = await readCard(page);
  await shoot(page, '3-home-upcoming-opened');
  check('open: the mark is gone from Home', !/New from your coach/.test(home), '');
  check('open: the card itself is otherwise unchanged', /Strong After 40/.test(home) && /Starts \w+day/.test(home), '');

  // Coming back does not re-mark it, and does not write a second row.
  await page.goto(`${BASE}/movement`, { waitUntil: 'domcontentloaded' });
  const movementAfter = await readCard(page);
  check('open: the mark is gone from Movement too', !/New from your coach/.test(movementAfter), '');
  await page.goto(`${BASE}/programs`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const { data: openEventsAgain } = await db
    .from('member_wellness_events')
    .select('id')
    .eq('member_id', MEMBER_ID)
    .eq('event_type', 'program_opened')
    .in('source_record_id', created.assignmentIds);
  check(
    'open: revisiting writes nothing more, so this is a mark and not a counter',
    (openEventsAgain ?? []).length === 1,
    `${(openEventsAgain ?? []).length} rows`
  );

  // -------------------------------------------------------------------
  // 5. ACTIVE, week 2 of 4.
  // -------------------------------------------------------------------
  const activeStart = addDays(today, -8);
  await setStatus({
    status: 'active',
    start_date: activeStart,
    end_date: addDays(activeStart, 27),
    current_week: 2,
    started_at: new Date().toISOString(),
  });
  await db
    .from('coach_assigned_workouts')
    .update({ scheduled_date: addDays(today, 1) })
    .eq('id', created.workoutIds[0]);
  await db
    .from('coach_assigned_workouts')
    .update({ scheduled_date: addDays(today, 4) })
    .eq('id', created.workoutIds[1]);

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  home = await readCard(page);
  await shoot(page, '4-home-active');
  check('home active: it says which week of how many', /Week 2 of 4/.test(home), (home.match(/Week \d+ of \d+/) ?? ['none'])[0]);
  check(
    'home active: it offers her next session, with the weekday',
    /Next up: [^\n]*\w+day, \w+ \d+/.test(home),
    (home.match(/Next up: [^\n]+/) ?? ['none'])[0]
  );
  check('home active: one action, and it is the session', /Open your next session/.test(home), '');
  check('home active: the upcoming wording is gone', !/First session:/.test(home), '');
  check('home active: it is not marked new, because she has opened it', !/New from your coach/.test(home), '');
  scanLanguage('home active', home);

  // -------------------------------------------------------------------
  // 6. PAUSED.
  // -------------------------------------------------------------------
  await setStatus({ status: 'paused', paused_at: new Date().toISOString() });
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  home = await readCard(page);
  await shoot(page, '5-home-paused');
  check('home paused: it says it is paused', /Paused/.test(home), '');
  check(
    'home paused: it says what happens next, warmly',
    /put this on hold/i.test(home) && /pick up where you left off/i.test(home),
    (home.match(/Your coach has put[^\n]+/) ?? ['none'])[0]
  );
  check('home paused: it offers no "next session" while it is on hold', !/Next up:/.test(home), '');
  check('home paused: it still offers a way in', /Open your program/.test(home), '');
  scanLanguage('home paused', home);

  // -------------------------------------------------------------------
  // 7. COMPLETED. Home has never pointed at a finished program and this
  //    pass did not change that, so what is asserted is the rule, not a
  //    screenshot: the hero leaves rather than sitting on Home forever
  //    with nothing to act on.
  // -------------------------------------------------------------------
  await setStatus({
    status: 'completed',
    paused_at: null,
    completed_at: new Date().toISOString(),
  });
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  home = await readCard(page);
  await shoot(page, '6-home-completed');
  check(
    'home completed: Home stops pointing at a finished program, unchanged from before this pass',
    !/Strong After 40/.test(home),
    ''
  );
  await page.goto(`${BASE}/programs`, { waitUntil: 'domcontentloaded' });
  const programs = await readCard(page);
  await shoot(page, '7-programs-completed');
  check(
    'programs: the finished program is still hers to read, and says what is coming',
    /Strong After 40/.test(programs) && /reviewing your next phase/i.test(programs),
    (programs.match(/[^\n]*reviewing your next phase[^\n]*/i) ?? ['none'])[0]
  );
  scanLanguage('the programs list', programs);

  // -------------------------------------------------------------------
  // 8. Nothing was played, and nothing threw.
  // -------------------------------------------------------------------
  check('no video was ever requested', videosPlayed === 0, `${videosPlayed} requests`);
  check('no page error on any screen', errors.length === 0, errors.slice(0, 2).join(' | ') || 'none');
} catch (err) {
  check('the run completed', false, String(err));
} finally {
  // -------------------------------------------------------------------
  // Restore, exactly. Everything this run created, removed; everything it
  // found, untouched.
  // -------------------------------------------------------------------
  try {
    if (created.assignmentIds.length > 0) {
      await db
        .from('member_wellness_events')
        .delete()
        .in('source_record_id', created.assignmentIds);
    }
    if (created.workoutIds.length > 0) {
      await db.from('coach_assigned_workouts').delete().in('id', created.workoutIds);
    }
    if (created.assignmentIds.length > 0) {
      await db.from('coach_program_assignments').delete().in('id', created.assignmentIds);
    }

    const { data: afterAssignments } = await db
      .from('coach_program_assignments')
      .select('id')
      .eq('member_id', MEMBER_ID);
    const { data: afterWorkouts } = await db
      .from('coach_assigned_workouts')
      .select('id')
      .eq('member_id', MEMBER_ID);
    const { data: afterEvents } = await db
      .from('member_wellness_events')
      .select('id')
      .eq('member_id', MEMBER_ID)
      .eq('event_type', 'program_opened');

    const after = {
      assignments: (afterAssignments ?? []).length,
      workouts: (afterWorkouts ?? []).length,
      openEvents: (afterEvents ?? []).length,
    };
    const restored =
      after.assignments === existingBefore.assignments &&
      after.workouts === existingBefore.workouts &&
      after.openEvents === existingBefore.openEvents;
    restoreLog =
      `assignments ${existingBefore.assignments} -> ${after.assignments}, ` +
      `workouts ${existingBefore.workouts} -> ${after.workouts}, ` +
      `program_opened ${existingBefore.openEvents} -> ${after.openEvents}`;
    check('restore: the database is exactly as it was found', restored, restoreLog);
  } catch (err) {
    check('restore: the database is exactly as it was found', false, String(err));
  }

  await retireSession(minted);
  await browser.close();
}

const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed} of ${results.length} checks passed. Videos played: ${videosPlayed}.`);
console.log(`Restore: ${restoreLog}`);
process.exit(passed === results.length ? 0 : 1);
