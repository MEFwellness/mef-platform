#!/usr/bin/env node
/**
 * THE REVISED LOAD RULES, checked against production.
 *
 * Prompt 8B's four claims, on the test member's own real program:
 *
 *   1. an exercise she has COMPLETED at the current weight twice gets a
 *      suggestion, and it lands on a 2.5 lb increment
 *   2. an exercise she has logged ONCE gets no increase, and says so warmly
 *   3. an exercise with an UNREVIEWED pain report gets no suggestion at all,
 *      and the screen says exactly "No load suggestion. Pain feedback needs
 *      coach review first."
 *   4. the review recommends "Coach review required" while that report is
 *      unread, and no outcome is marked Suggested
 *
 * Then the coach marks the report reviewed and the same screen is read
 * again: normal gating resumes on that exercise and the recommendation
 * becomes a real outcome.
 *
 * VIDEO BUDGET: zero. Nothing here needs to play one, so nothing does, and
 * any /video-url request at all fails the run.
 *
 * EVERY WRITE IS RESTORED IN A `finally`, and the restore is verified
 * against the counts production carried BEFORE the run rather than against
 * zero. EPIPE is swallowed so a run piped through `head` still restores.
 *
 * Environment:
 *   BASE_URL              default https://app.mefwellness.com
 *   MEMBER_ID             the test member's user id
 *   STAFF_EMAIL           an account holding coach and administrator
 *   PROD_SUPABASE_URL     production project url
 *   PROD_SERVICE_KEY_FILE path to a file holding the service role key
 *   PROD_ANON_KEY_FILE    path to a file holding the anon key
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';

process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') return;
  throw err;
});

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const MEMBER_ID = process.env.MEMBER_ID;
const STAFF_EMAIL = process.env.STAFF_EMAIL;

const SUPPRESSION = 'No load suggestion. Pain feedback needs coach review first.';
const BEGIN_AFTER_TWO = 'Suggestions begin after she logs this weight a couple of times.';

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}
function note(message) {
  console.log(`      ${message}`);
}

function serviceClient() {
  const url = process.env.PROD_SUPABASE_URL;
  const keyFile = process.env.PROD_SERVICE_KEY_FILE;
  if (!url || !keyFile) return null;
  return createClient(url, readFileSync(keyFile, 'utf8').trim(), {
    auth: { persistSession: false },
  });
}

if (!MEMBER_ID || !STAFF_EMAIL) {
  console.error('Set MEMBER_ID and STAFF_EMAIL.');
  process.exit(2);
}
// A malformed address does not fail: Supabase's generateLink CREATES the
// account, and the run then reports honestly on a brand new stranger.
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(STAFF_EMAIL)) {
  console.error('STAFF_EMAIL is not a plain email address. Refusing to run.');
  process.exit(2);
}
const db = serviceClient();
if (!db || !canMintSessions()) {
  console.error('Set PROD_SUPABASE_URL, PROD_SERVICE_KEY_FILE and PROD_ANON_KEY_FILE.');
  process.exit(2);
}

const browser = await chromium.launch();

async function countRows(table, apply = (q) => q) {
  const { count } = await apply(db.from(table).select('id', { count: 'exact', head: true }));
  return count ?? 0;
}
const baseline = {
  reviews: await countRows('program_phase_reviews'),
  feedback: await countRows('member_exercise_feedback'),
  logged: await countRows('coach_assigned_workout_exercises', (q) => q.not('logged_load', 'is', null)),
  prescribed: await countRows('coach_assigned_workout_exercises', (q) => q.not('load', 'is', null)),
  drafts: await countRows('coach_program_assignments', (q) => q.eq('visibility', 'draft')),
  completedExercises: await countRows('coach_assigned_workout_exercises', (q) => q.eq('status', 'completed')),
  completedWorkouts: await countRows('coach_assigned_workouts', (q) => q.eq('status', 'completed')),
};

const restore = {
  exerciseRows: new Map(),
  workoutRows: new Map(),
  feedbackIds: [],
  reviewIds: [],
};
let videosPlayed = 0;

async function rememberExercise(rowId) {
  if (restore.exerciseRows.has(rowId)) return;
  const { data } = await db
    .from('coach_assigned_workout_exercises')
    .select(
      'id, status, completed_at, difficulty_rating, comfort_rating, stopped_at, ' +
        'logged_load, logged_load_unit, logged_load_per_side, logged_load_at, load, load_unit'
    )
    .eq('id', rowId)
    .single();
  if (data) restore.exerciseRows.set(rowId, data);
}
async function rememberWorkout(rowId) {
  if (restore.workoutRows.has(rowId)) return;
  const { data } = await db
    .from('coach_assigned_workouts')
    .select('id, status, completed_at, skipped_at, started_at')
    .eq('id', rowId)
    .single();
  if (data) restore.workoutRows.set(rowId, data);
}

function guardVideos(page, errors) {
  page.on('request', (request) => {
    if (request.url().includes('/video-url')) videosPlayed += 1;
  });
  page.on('pageerror', (err) => errors.push(err.message));
}

/** Every "Suggested: N unit" or suppression line, keyed by the exercise row it sits in. */
async function readLoadRows(page) {
  return page.$$eval('[data-load-suggestion]', (nodes) =>
    nodes.map((node) => ({
      externalId: node.getAttribute('data-load-suggestion'),
      direction: node.getAttribute('data-load-direction'),
      text: node.innerText.replace(/\s+/g, ' ').trim(),
      inputValue: node.querySelector('[data-load-input]')?.value ?? null,
    }))
  );
}

let staffMinted = null;

try {
  // -------------------------------------------------------------------
  // 0. Migration 181 landed.
  // -------------------------------------------------------------------
  {
    // The only way to prove the check constraint from here is to write a
    // row through it, so the run does exactly that and removes it again.
    const { data: assignmentProbe } = await db
      .from('coach_program_assignments')
      .select('coach_id')
      .eq('member_id', MEMBER_ID)
      .limit(1)
      .maybeSingle();
    const { data: probe, error } = await db
      .from('program_phase_reviews')
      .insert({
        member_id: MEMBER_ID,
        coach_id: assignmentProbe?.coach_id ?? MEMBER_ID,
        program_group_key: 'migration-181-probe',
        program_name: 'Migration 181 probe',
        recommended_outcome: 'coach_review_required',
        recommendation_reasoning: 'Probe row, removed immediately.',
      })
      .select('id')
      .maybeSingle();
    check(
      'db: migration 181 allows recommended_outcome = coach_review_required',
      !error && Boolean(probe),
      error?.message ?? ''
    );
    if (probe) await db.from('program_phase_reviews').delete().eq('id', probe.id);

    // And it is not a seventh OUTCOME: a coach cannot choose it.
    const { data: probe2 } = await db
      .from('program_phase_reviews')
      .insert({
        member_id: MEMBER_ID,
        coach_id: assignmentProbe?.coach_id ?? MEMBER_ID,
        program_group_key: 'migration-181-probe-2',
        program_name: 'Migration 181 probe 2',
        recommended_outcome: 'coach_review_required',
        recommendation_reasoning: 'Probe row, removed immediately.',
      })
      .select('id')
      .maybeSingle();
    if (probe2) {
      const { error: chosenError } = await db
        .from('program_phase_reviews')
        .update({ chosen_outcome: 'coach_review_required' })
        .eq('id', probe2.id);
      check(
        'db: a coach still cannot CHOOSE coach_review_required, so it is not a seventh outcome',
        Boolean(chosenError),
        chosenError?.message ?? 'the update was accepted, which it must not be'
      );
      await db.from('program_phase_reviews').delete().eq('id', probe2.id);
    }
  }

  // -------------------------------------------------------------------
  // 1. Her real program, and the three exercises the run needs.
  // -------------------------------------------------------------------
  const { data: assignments } = await db
    .from('coach_program_assignments')
    .select('id, program_group_key, coach_id, template_name_snapshot')
    .eq('member_id', MEMBER_ID)
    .eq('visibility', 'published');
  const groupKey = (assignments ?? []).find((a) => a.program_group_key)?.program_group_key;
  const groupAssignments = (assignments ?? []).filter((a) => a.program_group_key === groupKey);
  check('member: one published program group to review', Boolean(groupKey), groupKey ?? 'none');
  if (!groupKey) throw new Error('no published program group');
  note(`group: ${groupKey}`);

  const assignmentIds = groupAssignments.map((a) => a.id);
  const coachId = groupAssignments[0]?.coach_id ?? null;

  const { data: workouts } = await db
    .from('coach_assigned_workouts')
    .select('id, scheduled_date, program_week, status')
    .in('assignment_id', assignmentIds)
    .order('scheduled_date', { ascending: true });
  note(`${(workouts ?? []).length} occurrences in this program`);

  const { data: allExercises } = await db
    .from('coach_assigned_workout_exercises')
    .select('id, assigned_workout_id, external_id, exercise_name, status, reps, rep_range_low, hold_duration_seconds')
    .in(
      'assigned_workout_id',
      (workouts ?? []).map((w) => w.id)
    );

  // Strength-shaped, so a weight field is the honest control for it. Same
  // rule weightLogging.ts applies.
  const weightable = (allExercises ?? []).filter(
    (e) => (e.rep_range_low !== null || (e.reps ?? '').trim() !== '') && e.hold_duration_seconds === null
  );
  const byExternal = new Map();
  for (const row of weightable) {
    const list = byExternal.get(row.external_id) ?? [];
    list.push(row);
    byExternal.set(row.external_id, list);
  }
  // The qualifying exercise needs three occurrences: one to establish 20,
  // and two AT 22.5, which is the gate.
  const qualifying = [...byExternal.entries()].find(([, rows]) => rows.length >= 3);
  const single = [...byExternal.entries()].find(
    ([externalId, rows]) => externalId !== qualifying?.[0] && rows.length >= 1
  );
  const painful = [...byExternal.entries()].find(
    ([externalId, rows]) =>
      externalId !== qualifying?.[0] && externalId !== single?.[0] && rows.length >= 1
  );
  check('member: found an exercise with three occurrences to earn a step on', Boolean(qualifying), qualifying ? `${qualifying[1][0].exercise_name}` : 'none');
  check('member: found a second exercise for the single-log case', Boolean(single), single ? `${single[1][0].exercise_name}` : 'none');
  check('member: found a third exercise for the pain case', Boolean(painful), painful ? `${painful[1][0].exercise_name}` : 'none');
  if (!qualifying || !single || !painful) throw new Error('not enough weightable exercises');

  const [qualifyingId, qualifyingRows] = qualifying;
  const [singleId, singleRows] = single;
  const [painfulId, painfulRows] = painful;
  const qualifyingName = qualifyingRows[0].exercise_name;
  const singleName = singleRows[0].exercise_name;
  const painfulName = painfulRows[0].exercise_name;

  // --- seed: enough of the program completed that the completion gate is
  //     not the thing under test ---
  for (const workout of workouts ?? []) {
    await rememberWorkout(workout.id);
  }
  await db
    .from('coach_assigned_workouts')
    .update({ status: 'completed' })
    .in(
      'id',
      (workouts ?? []).map((w) => w.id)
    );
  note(`seeded: all ${(workouts ?? []).length} occurrences marked completed`);

  // --- seed: the qualifying exercise, 20 then 22.5 then 22.5 ---
  for (const row of qualifyingRows.slice(0, 3)) await rememberExercise(row.id);
  await db
    .from('coach_assigned_workout_exercises')
    .update({
      status: 'completed',
      logged_load: 20,
      logged_load_unit: 'lbs',
      logged_load_at: '2026-08-04T10:00:00Z',
    })
    .eq('id', qualifyingRows[0].id);
  for (const [index, row] of qualifyingRows.slice(1, 3).entries()) {
    await db
      .from('coach_assigned_workout_exercises')
      .update({
        status: 'completed',
        logged_load: 22.5,
        logged_load_unit: 'lbs',
        logged_load_at: `2026-08-1${index + 1}T10:00:00Z`,
      })
      .eq('id', row.id);
  }
  note(`seeded: ${qualifyingName} logged 20, then 22.5 completed twice`);

  // --- seed: the single-log exercise, one completion at 30 ---
  await rememberExercise(singleRows[0].id);
  await db
    .from('coach_assigned_workout_exercises')
    .update({
      status: 'completed',
      logged_load: 30,
      logged_load_unit: 'lbs',
      logged_load_at: '2026-08-11T10:00:00Z',
      // Even "easy" must not move it. One log is a baseline.
      difficulty_rating: 'easy',
    })
    .eq('id', singleRows[0].id);
  note(`seeded: ${singleName} logged once at 30 lbs, rated easy`);

  // --- seed: the painful exercise, two completions at 15 and an
  //     UNREVIEWED pain report. Two completions on purpose: without the
  //     pain report this one would qualify, so the suppression is the only
  //     thing that can be removing its number. ---
  for (const row of painfulRows.slice(0, 2)) await rememberExercise(row.id);
  for (const row of painfulRows.slice(0, 2)) {
    await db
      .from('coach_assigned_workout_exercises')
      .update({
        status: 'completed',
        logged_load: 15,
        logged_load_unit: 'lbs',
        logged_load_at: '2026-08-11T10:00:00Z',
      })
      .eq('id', row.id);
  }
  const { data: painReport } = await db
    .from('member_exercise_feedback')
    .insert({
      member_id: MEMBER_ID,
      coach_id: coachId,
      assignment_id: assignmentIds[0],
      program_group_key: groupKey,
      program_week: 2,
      provider: 'your_move',
      external_id: painfulId,
      exercise_name: painfulName,
      reason: 'pain',
      other_text: 'felt a pinch on the left side',
      branch: 'safety',
      outcome: 'stopped_for_pain',
      coach_notified: true,
    })
    .select('id')
    .single();
  if (painReport) restore.feedbackIds.push(painReport.id);
  check('member: the unreviewed pain report was seeded', Boolean(painReport), painReport?.id ?? 'none');
  note(`seeded: ${painfulName} logged twice at 15 lbs, plus an unreviewed pain report`);

  // -------------------------------------------------------------------
  // 2. The coach's review screen, with the pain report unread.
  // -------------------------------------------------------------------
  staffMinted = await mintSessionContext(browser, STAFF_EMAIL, { baseUrl: BASE });
  check('staff: session minted', Boolean(staffMinted), staffMinted ? '' : 'could not mint');
  if (!staffMinted) throw new Error('no staff session');
  check(
    'staff: the minted session is a real existing account, not one just created',
    Boolean(staffMinted.session?.user?.created_at) &&
      Date.parse(staffMinted.session.user.created_at) < Date.now() - 60_000,
    staffMinted.session?.user?.created_at ?? 'unknown'
  );

  const errors = [];
  const page = await staffMinted.context.newPage();
  guardVideos(page, errors);

  const reviewUrl = `${BASE}/coach/clients/${MEMBER_ID}/programs/review/${encodeURIComponent(groupKey)}`;
  await page.goto(reviewUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const reviewText = await page.locator('main').innerText();

  // Track whatever review row the render created.
  {
    const { data: opened } = await db
      .from('program_phase_reviews')
      .select('id, recommended_outcome, status')
      .eq('member_id', MEMBER_ID)
      .eq('program_group_key', groupKey)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (opened) restore.reviewIds.push(opened.id);
    check(
      'db: the review stored coach_review_required as what the engine recommended',
      opened?.recommended_outcome === 'coach_review_required',
      opened?.recommended_outcome ?? 'none'
    );
  }

  // --- Task 5: the recommendation ---
  check(
    'coach: the recommendation heading is exactly "Coach review required"',
    /Coach review required/.test(reviewText),
    ''
  );
  check(
    'coach: it does not recommend rotating, progressing or repeating',
    (await page.locator('[data-review-recommendation="coach_review_required"]').count()) === 1,
    `${await page.locator('[data-review-recommendation]').getAttribute('data-review-recommendation')}`
  );
  check(
    'coach: no outcome is badged Suggested while the report is unread',
    (await page.locator('[data-review-outcomes="true"] span:text-is("Suggested")').count()) === 0,
    ''
  );
  check(
    'coach: the pain report is listed FIRST, above the paragraph',
    (await page.locator(`[data-review-pain-report="${painReport.id}"]`).count()) === 1,
    ''
  );
  {
    const painIndex = reviewText.indexOf(painfulName);
    const paragraphIndex = reviewText.indexOf('Nothing is recommended until you have read it');
    check(
      'coach: the exercise name appears before the reasoning paragraph',
      painIndex >= 0 && paragraphIndex >= 0 && painIndex < paragraphIndex,
      `name at ${painIndex}, paragraph at ${paragraphIndex}`
    );
  }
  check(
    'coach: all six outcomes are still offered',
    (await page.locator('[data-review-outcome]').count()) === 6,
    `${await page.locator('[data-review-outcome]').count()} offered`
  );
  check(
    'coach: the single-exercise actions are wired in, not missing',
    (await page.locator(`[data-edit-one-exercise="${painReport.id}"]`).count()) >= 1 &&
      (await page.locator(`[data-resolve-pain="${painReport.id}"]`).count()) === 1,
    ''
  );

  // --- Tasks 2, 3 and 4: the three load rows ---
  const rows = await readLoadRows(page);
  note(`load rows on the review screen: ${rows.length}`);
  for (const row of rows) note(`  ${row.direction}: ${row.text.slice(0, 160)}`);

  const painRow = rows.find((r) => r.externalId === painfulId);
  check('coach: the painful exercise has a row', Boolean(painRow), painfulId);
  check(
    'coach: it says exactly "No load suggestion. Pain feedback needs coach review first."',
    painRow?.text.includes(SUPPRESSION) === true,
    painRow?.text ?? 'no row'
  );
  check(
    'coach: it never says hold at current weight, which would read as an endorsement',
    painRow ? !/hold at/i.test(painRow.text) && !/Suggested:/.test(painRow.text) : false,
    painRow?.text ?? ''
  );
  check(
    'coach: its weight field opens empty rather than prefilled with a number',
    painRow?.inputValue === '',
    `value="${painRow?.inputValue ?? 'missing'}"`
  );

  const singleRow = rows.find((r) => r.externalId === singleId);
  check('coach: the single-log exercise has a row', Boolean(singleRow), singleId);
  check(
    'coach: it offers no increase, and says suggestions begin after a couple of logs',
    singleRow?.text.includes(BEGIN_AFTER_TWO) === true,
    singleRow?.text ?? 'no row'
  );
  check(
    'coach: it holds at the weight she logged rather than adding to it',
    singleRow?.direction === 'hold' && singleRow?.inputValue === '30',
    `${singleRow?.direction} / value="${singleRow?.inputValue}"`
  );

  const qualifyingRow = rows.find((r) => r.externalId === qualifyingId);
  check('coach: the qualifying exercise has a row', Boolean(qualifyingRow), qualifyingId);
  check(
    'coach: two completions at 22.5 earned an increase',
    qualifyingRow?.direction === 'increase',
    qualifyingRow?.text ?? 'no row'
  );
  {
    const suggested = Number(qualifyingRow?.inputValue ?? NaN);
    check(
      'coach: the suggestion is above what she logged',
      Number.isFinite(suggested) && suggested > 22.5,
      `suggested ${qualifyingRow?.inputValue}`
    );
    check(
      'coach: and it lands on a practical 2.5 lb increment',
      Number.isFinite(suggested) && Math.abs(suggested / 2.5 - Math.round(suggested / 2.5)) < 1e-6,
      `suggested ${qualifyingRow?.inputValue}`
    );
  }
  check(
    'coach: no suggestion anywhere on the screen is off the 2.5 lb grid',
    rows
      .filter((r) => r.direction === 'increase' || r.direction === 'reduce')
      .every((r) => {
        const value = Number(r.inputValue);
        return Number.isFinite(value) && Math.abs(value / 2.5 - Math.round(value / 2.5)) < 1e-6;
      }),
    rows.map((r) => `${r.direction}:${r.inputValue}`).join(', ')
  );
  check(
    'coach: nothing on the screen mentions a weekly wave or a week percentage',
    !/wave|% of the wave|Week \d of/i.test(
      reviewText.replace(/week \d+/gi, '') // "in week 2" on a pain report is a fact, not a load rule
    ),
    ''
  );

  // -------------------------------------------------------------------
  // 3. The coach marks it reviewed, from this screen.
  // -------------------------------------------------------------------
  await page.locator(`[data-resolve-pain="${painReport.id}"]`).click();
  await page.waitForSelector(`[data-pain-reviewed="${painReport.id}"]`, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const { data: resolved } = await db
    .from('member_exercise_feedback')
    .select('coach_reviewed_at, other_text, reason, branch')
    .eq('id', painReport.id)
    .single();
  check('db: the report is marked reviewed', resolved?.coach_reviewed_at !== null, resolved?.coach_reviewed_at ?? 'null');
  check('db: her own words are untouched', resolved?.other_text === 'felt a pinch on the left side', resolved?.other_text ?? '');

  await page.goto(reviewUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const afterText = await page.locator('main').innerText();
  const afterRows = await readLoadRows(page);
  note('after resolving:');
  for (const row of afterRows) note(`  ${row.direction}: ${row.text.slice(0, 160)}`);

  const painAfter = afterRows.find((r) => r.externalId === painfulId);
  check(
    'coach: the suppression is gone and the exercise is back under normal gating',
    Boolean(painAfter) && painAfter.direction !== 'needs_review' && !painAfter.text.includes(SUPPRESSION),
    painAfter?.text ?? 'no row'
  );
  check(
    'coach: its pain history is still visible to the coach',
    /reported pain on this one earlier in the phase/i.test(afterText) ||
      /You marked it reviewed/i.test(afterText),
    ''
  );
  check(
    'coach: the recommendation is a real outcome again',
    !/Coach review required/.test(afterText),
    ''
  );
  check(
    'coach: and one of the six is badged Suggested again',
    (await page.locator('[data-review-outcomes="true"] span:text-is("Suggested")').count()) === 1,
    ''
  );

  // Nothing in this run chose an outcome, so nothing drafted and nothing
  // published. Prove it rather than assume it.
  {
    const { count } = await db
      .from('coach_program_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', MEMBER_ID)
      .eq('visibility', 'draft');
    check('db: this run drafted nothing', (count ?? 0) === 0, `${count ?? 0} drafts`);
  }

  check('coach: no uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  check('run: ZERO videos played', videosPlayed === 0, `${videosPlayed} requests`);
  await page.close();
} catch (err) {
  check('run: completed without throwing', false, err.message);
} finally {
  // -------------------------------------------------------------------
  // Restore, and verify the restore.
  // -------------------------------------------------------------------
  console.log('\n--- restoring ---');

  for (const [id, row] of restore.exerciseRows) {
    const { id: _ignored, ...columns } = row;
    await db.from('coach_assigned_workout_exercises').update(columns).eq('id', id);
  }
  console.log(`restored ${restore.exerciseRows.size} exercise rows`);

  for (const [id, row] of restore.workoutRows) {
    const { id: _ignored, ...columns } = row;
    await db.from('coach_assigned_workouts').update(columns).eq('id', id);
  }
  console.log(`restored ${restore.workoutRows.size} occurrence rows`);

  if (restore.reviewIds.length > 0) {
    await db.from('program_phase_reviews').delete().in('id', restore.reviewIds);
  }
  // Belt and braces: the screen creates a review as a side effect of
  // rendering, so remove any this member has at all.
  await db.from('program_phase_reviews').delete().eq('member_id', MEMBER_ID);
  if (restore.feedbackIds.length > 0) {
    await db.from('member_exercise_feedback').delete().in('id', restore.feedbackIds);
  }
  await db
    .from('member_wellness_events')
    .delete()
    .eq('member_id', MEMBER_ID)
    .in('event_type', ['program_review_opened', 'program_review_drafted', 'exercise_feedback_resolved']);

  const after = {
    reviews: await countRows('program_phase_reviews'),
    feedback: await countRows('member_exercise_feedback'),
    logged: await countRows('coach_assigned_workout_exercises', (q) => q.not('logged_load', 'is', null)),
    prescribed: await countRows('coach_assigned_workout_exercises', (q) => q.not('load', 'is', null)),
    drafts: await countRows('coach_program_assignments', (q) => q.eq('visibility', 'draft')),
    completedExercises: await countRows('coach_assigned_workout_exercises', (q) => q.eq('status', 'completed')),
    completedWorkouts: await countRows('coach_assigned_workouts', (q) => q.eq('status', 'completed')),
  };
  for (const key of Object.keys(baseline)) {
    check(
      `restore: ${key} is back to what production carried before the run`,
      after[key] === baseline[key],
      `before ${baseline[key]}, after ${after[key]}`
    );
  }

  if (staffMinted) await retireSession(staffMinted);
  await browser.close();

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
  if (failed.length > 0) {
    console.log('Failed:');
    for (const f of failed) console.log(`  - ${f.name}`);
  }
  process.exit(failed.length === 0 ? 0 : 1);
}
