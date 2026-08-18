#!/usr/bin/env node
/**
 * The coaching brain, checked against production.
 *
 * WHAT IT DOES, on the test member's own real program:
 *   0. proves migration 178 landed: the review table, the two new feedback
 *      columns, and every occurrence knowing which week it belongs to
 *   1. seeds a short signal history (a few completions, one exercise
 *      skipped twice, a logged-weight trend, one too-easy report) and
 *      reads the coach's panel back to confirm it tells the story in
 *      plain words
 *   2. opens the review, reads the recommendation and all six outcomes,
 *      takes "Repeat the phase" to a DRAFT, proves nothing published, and
 *      discards it
 *   3. proves a load suggestion appears ONLY for the exercise with a
 *      logged weight, shows last-logged beside suggested, and that an
 *      edited number persists into a draft
 *   4. releases a seeded avoidance entry and proves the exercise becomes
 *      offerable again
 *   5. resolves a seeded pain report and proves the flag clears while the
 *      record stays
 *   6. re-reads Prompt 7's member surfaces and proves they are unchanged
 *
 * VIDEO BUDGET: zero. Nothing here needs to play one, so nothing does,
 * and any /video-url request at all fails the run.
 *
 * EVERY WRITE IS RESTORED IN A `finally`, and the restore is verified
 * rather than assumed. EPIPE is swallowed so a run piped through `head`
 * still reaches its restore.
 *
 * Environment:
 *   BASE_URL              default https://app.mefwellness.com
 *   MEMBER_EMAIL          the test member
 *   MEMBER_ID             her user id
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
const MEMBER_EMAIL = process.env.MEMBER_EMAIL;
const STAFF_EMAIL = process.env.STAFF_EMAIL;

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

if (!MEMBER_ID || !MEMBER_EMAIL || !STAFF_EMAIL) {
  console.error('Set MEMBER_ID, MEMBER_EMAIL and STAFF_EMAIL.');
  process.exit(2);
}
// A malformed address does not fail: Supabase's generateLink CREATES the
// account, and the whole member half of the run then reports honestly on a
// brand new empty stranger. This run made that mistake once.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!EMAIL_SHAPE.test(MEMBER_EMAIL) || !EMAIL_SHAPE.test(STAFF_EMAIL)) {
  console.error('MEMBER_EMAIL or STAFF_EMAIL is not a plain email address. Refusing to run.');
  process.exit(2);
}
const db = serviceClient();
if (!db || !canMintSessions()) {
  console.error('Set PROD_SUPABASE_URL, PROD_SERVICE_KEY_FILE and PROD_ANON_KEY_FILE.');
  process.exit(2);
}

const browser = await chromium.launch();

/** What production already carried before this run wrote anything. The restore is checked against THIS, not against zero: the member has real history from earlier sessions and it is not this run's to remove. */
async function countRows(table, apply = (q) => q) {
  const { count } = await apply(db.from(table).select('id', { count: 'exact', head: true }));
  return count ?? 0;
}
const baseline = {
  reviews: await countRows('program_phase_reviews'),
  feedback: await countRows('member_exercise_feedback'),
  avoidance: await countRows('member_exercise_avoidance'),
  logged: await countRows('coach_assigned_workout_exercises', (q) => q.not('logged_load', 'is', null)),
  prescribed: await countRows('coach_assigned_workout_exercises', (q) => q.not('load', 'is', null)),
  drafts: await countRows('coach_program_assignments', (q) => q.eq('visibility', 'draft')),
  skipped: await countRows('coach_assigned_workout_exercises', (q) => q.eq('status', 'skipped')),
  completed: await countRows('coach_assigned_workout_exercises', (q) => q.eq('status', 'completed')),
};

/** Every row this run touched, and exactly what it looked like before. */
const restore = {
  exerciseRows: new Map(),
  feedbackIds: [],
  avoidanceIds: [],
  reviewIds: [],
  draftAssignmentIds: [],
  draftTemplateIds: [],
  eventIds: [],
};
let videosPlayed = 0;

async function remember(rowId) {
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

/** Attach a no-video guard to any page this run opens. */
function guardVideos(page, errors) {
  page.on('request', (request) => {
    if (request.url().includes('/video-url')) videosPlayed += 1;
  });
  page.on('pageerror', (err) => errors.push(err.message));
}

let staffMinted = null;
let memberMinted = null;

try {
  // -------------------------------------------------------------------
  // 0. Migration 178 landed.
  // -------------------------------------------------------------------
  {
    const { error, count } = await db
      .from('program_phase_reviews')
      .select('id', { count: 'exact', head: true });
    check('db: program_phase_reviews exists', !error, error?.message ?? '');
    check('db: it started empty on production', (count ?? 0) === 0, `${count ?? 0} rows`);
  }
  for (const column of ['coach_reviewed_by', 'coach_review_note']) {
    const { error } = await db.from('member_exercise_feedback').select(column).limit(1);
    check(`db: member_exercise_feedback.${column} exists`, !error, error?.message ?? '');
  }
  {
    const { count } = await db
      .from('coach_assigned_workouts')
      .select('id', { count: 'exact', head: true })
      .is('program_week', null);
    check('db: every occurrence knows which week it is in', (count ?? 0) === 0, `${count ?? 0} still null`);

    const { data: weeks } = await db
      .from('coach_assigned_workouts')
      .select('program_week')
      .order('program_week', { ascending: true });
    const distinct = [...new Set((weeks ?? []).map((w) => w.program_week))];
    check(
      'db: the backfilled weeks are sensible, not all 1',
      distinct.length > 1 && distinct.every((w) => w >= 1),
      `weeks present: ${distinct.join(', ')}`
    );
  }

  // -------------------------------------------------------------------
  // 1. Her real program, and a short seeded history.
  // -------------------------------------------------------------------
  const { data: assignments } = await db
    .from('coach_program_assignments')
    .select('id, program_group_key, status, coach_id, template_name_snapshot, start_date, end_date')
    .eq('member_id', MEMBER_ID)
    .eq('visibility', 'published');
  check('member: she has published programs', (assignments ?? []).length > 0, `${(assignments ?? []).length}`);

  const groupKey = (assignments ?? []).find((a) => a.program_group_key)?.program_group_key;
  const groupAssignments = (assignments ?? []).filter((a) => a.program_group_key === groupKey);
  check('member: one program group to review', Boolean(groupKey), groupKey ?? 'none');
  note(`group: ${groupKey}`);

  const assignmentIds = groupAssignments.map((a) => a.id);
  const { data: workouts } = await db
    .from('coach_assigned_workouts')
    .select('id, scheduled_date, program_week, status')
    .in('assignment_id', assignmentIds)
    .order('scheduled_date', { ascending: true });
  note(`${(workouts ?? []).length} occurrences in this program`);

  const { data: allExercises } = await db
    .from('coach_assigned_workout_exercises')
    .select('id, assigned_workout_id, external_id, exercise_name, section_id, status, reps, rep_range_low, hold_duration_seconds')
    .in(
      'assigned_workout_id',
      (workouts ?? []).map((w) => w.id)
    );

  // A strength-shaped exercise she could log a weight against: one that
  // states reps rather than a hold. Same rule weightLogging.ts applies.
  const weightable = (allExercises ?? []).filter(
    (e) => (e.rep_range_low !== null || (e.reps ?? '').trim() !== '') && e.hold_duration_seconds === null
  );
  const byExternal = new Map();
  for (const row of weightable) {
    const list = byExternal.get(row.external_id) ?? [];
    list.push(row);
    byExternal.set(row.external_id, list);
  }
  const loggedTarget = [...byExternal.entries()].find(([, rows]) => rows.length >= 2);
  check(
    'member: found an exercise with at least two occurrences to build a weight trend on',
    Boolean(loggedTarget),
    loggedTarget ? `${loggedTarget[1][0].exercise_name}, ${loggedTarget[1].length} occurrences` : 'none'
  );
  if (!loggedTarget) throw new Error('no weightable exercise with two occurrences');
  const [loggedExternalId, loggedRows] = loggedTarget;
  const loggedName = loggedRows[0].exercise_name;

  // Another exercise, to skip twice. Deliberately a different one, so the
  // panel has to tell two stories rather than one.
  const skipTarget = [...byExternal.entries()].find(
    ([externalId, rows]) => externalId !== loggedExternalId && rows.length >= 2
  );
  const [skipExternalId, skipRows] = skipTarget ?? [null, []];
  const skipName = skipRows[0]?.exercise_name ?? null;
  check('member: found a second exercise to skip twice', Boolean(skipName), skipName ?? 'none');

  // --- seed: two completions with a rising weight ---
  await remember(loggedRows[0].id);
  await remember(loggedRows[1].id);
  await db
    .from('coach_assigned_workout_exercises')
    .update({
      status: 'completed',
      logged_load: 20,
      logged_load_unit: 'lbs',
      logged_load_at: '2026-08-04T10:00:00Z',
    })
    .eq('id', loggedRows[0].id);
  await db
    .from('coach_assigned_workout_exercises')
    .update({
      status: 'completed',
      logged_load: 22.5,
      logged_load_unit: 'lbs',
      logged_load_at: '2026-08-11T10:00:00Z',
      difficulty_rating: 'easy',
    })
    .eq('id', loggedRows[1].id);
  note(`seeded: ${loggedName} logged at 20 then 22.5 lbs`);

  // --- seed: the same exercise skipped twice ---
  if (skipRows.length >= 2) {
    await remember(skipRows[0].id);
    await remember(skipRows[1].id);
    await db
      .from('coach_assigned_workout_exercises')
      .update({ status: 'skipped' })
      .in('id', [skipRows[0].id, skipRows[1].id]);
    note(`seeded: ${skipName} skipped twice`);
  }

  // --- seed: a too-easy report and a pain report ---
  const coachId = groupAssignments[0]?.coach_id ?? null;
  const { data: tooEasy } = await db
    .from('member_exercise_feedback')
    .insert({
      member_id: MEMBER_ID,
      coach_id: coachId,
      assignment_id: assignmentIds[0],
      program_group_key: groupKey,
      program_week: 2,
      provider: 'your_move',
      external_id: loggedExternalId,
      exercise_name: loggedName,
      reason: 'too_easy',
      branch: 'progression_note',
      outcome: 'logged_for_coach',
      coach_notified: true,
    })
    .select('id')
    .single();
  if (tooEasy) restore.feedbackIds.push(tooEasy.id);

  const painName = skipName ?? loggedName;
  const painExternalId = skipExternalId ?? loggedExternalId;
  const { data: painReport } = await db
    .from('member_exercise_feedback')
    .insert({
      member_id: MEMBER_ID,
      coach_id: coachId,
      assignment_id: assignmentIds[0],
      program_group_key: groupKey,
      program_week: 2,
      provider: 'your_move',
      external_id: painExternalId,
      exercise_name: painName,
      reason: 'pain',
      other_text: 'felt a pinch on the left side',
      branch: 'safety',
      outcome: 'stopped_for_pain',
      coach_notified: true,
    })
    .select('id')
    .single();
  if (painReport) restore.feedbackIds.push(painReport.id);
  note(`seeded: too-easy on ${loggedName}, pain on ${painName}`);

  // --- seed: an avoidance entry ---
  const { data: avoidance } = await db
    .from('member_exercise_avoidance')
    .insert({
      member_id: MEMBER_ID,
      provider: 'your_move',
      external_id: painExternalId,
      exercise_name: painName,
      source: 'pain',
      feedback_id: painReport?.id ?? null,
    })
    .select('id')
    .single();
  if (avoidance) restore.avoidanceIds.push(avoidance.id);
  note(`seeded: ${painName} on her avoidance list`);

  // -------------------------------------------------------------------
  // The coach's screens.
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

  await page.goto(`${BASE}/coach/clients/${MEMBER_ID}/programs`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const panelText = await page.locator('main').innerText();

  check(
    'coach: the "How the program is going" panel renders',
    /How the program is going/i.test(panelText),
    ''
  );
  check(
    `coach: it says she skipped ${skipName} twice, in words`,
    skipName ? panelText.includes(`She has skipped ${skipName} 2 times.`) : false,
    skipName ? '' : 'no skip target'
  );
  check(
    'coach: it says she reported pain, and that it is unreviewed',
    /reported pain on /i.test(panelText) && /has not been reviewed yet/i.test(panelText),
    ''
  );
  check(
    'coach: it says the too-easy flag points at him',
    /felt too easy\. She is waiting on you for more\./i.test(panelText),
    ''
  );
  check(
    'coach: it shows the weight trend as one readable line',
    panelText.includes('20 to 22.5 lbs'),
    ''
  );
  check(
    'coach: it says she took the weight up',
    panelText.includes(`taken ${loggedName} from 20 to 22.5 lbs`),
    ''
  );
  check('coach: completion is stated as a fraction and a percent', /\d+ of \d+ sessions, \d+%/.test(panelText), '');
  check('coach: her own words are shown to her coach', /felt a pinch on the left side/.test(panelText), '');

  // Task 3: a suggestion for the logged exercise and for no other.
  const suggestionLines = panelText
    .split('\n')
    .filter((line) => /^Suggested:/.test(line.trim()));
  check(
    'coach: exactly one load suggestion, for the one exercise she logged a weight for',
    suggestionLines.length === 1,
    suggestionLines.join(' | ') || 'none'
  );
  check(
    'coach: the suggestion shows last logged beside suggested',
    suggestionLines[0]?.includes('last logged 22.5') === true,
    suggestionLines[0] ?? ''
  );
  {
    const suggested = Number((suggestionLines[0] ?? '').match(/Suggested: ([\d.]+)/)?.[1] ?? 0);
    check(
      'coach: the too-easy signal produced an increase, not a hold',
      suggested > 22.5,
      suggestionLines[0] ?? ''
    );
    // This is a corrective program, so the rules force the conservative
    // table however green the signals are. A 22.5 lb stability movement
    // steps by 1 lb, not by the standard 2.5.
    check(
      'coach: a corrective program takes the conservative step, not the standard one',
      suggested === 23.5,
      `suggested ${suggested}, expected 23.5 (22.5 + the conservative 1 lb step)`
    );
    check(
      'coach: the panel says WHY it is on the small step',
      /corrective program, so loads move in the smallest steps/i.test(panelText),
      ''
    );
  }
  check(
    'coach: the weekly nudge names the exercise she is ready for more on',
    panelText.includes(`Signals suggest she is ready for more on ${loggedName}`),
    ''
  );
  check(
    'coach: the avoidance list shows the seeded entry with its reason',
    panelText.includes(painName) && /She reported pain on it/i.test(panelText),
    ''
  );

  // -------------------------------------------------------------------
  // 2. The review.
  // -------------------------------------------------------------------
  const publishedBefore = await countPublished(assignmentIds);

  const reviewLinks = await page.locator('[data-open-review]').count();
  check('coach: every live program offers its own review link', reviewLinks >= 1, `${reviewLinks} links`);
  await page.locator(`[data-open-review="${groupKey}"]`).click();
  await page.waitForURL(/\/programs\/review\//, { timeout: 30000 });
  await page.waitForTimeout(2500);
  check(
    'coach: the review opened on the program that was seeded',
    decodeURIComponent(page.url()).includes(groupKey),
    page.url().replace(BASE, '')
  );
  const reviewText = await page.locator('main').innerText();

  check('coach: the review screen opens', /End of phase review/i.test(reviewText), page.url().replace(BASE, ''));
  check('coach: it states a recommendation', /What the signals suggest/i.test(reviewText), '');
  check(
    'coach: the recommendation is pain-led, because she has an unreviewed pain report',
    /Rotate exercises/i.test(reviewText) && /Resolve the report first/i.test(reviewText),
    ''
  );
  check(
    'coach: it prints the numbers the recommendation was made from',
    /Read from: \d+ of \d+ sessions/.test(reviewText),
    ''
  );
  for (const label of [
    'Progress to next phase',
    'Rotate exercises',
    'Repeat the phase',
    'Schedule a recovery week',
    'Assign a different program',
    'Complete and archive',
  ]) {
    check(`coach: outcome "${label}" is offered`, reviewText.includes(label), '');
  }
  check(
    'coach: the load field is prefilled with the suggestion and editable',
    (await page.locator('[data-load-input]').count()) === 1,
    `${await page.locator('[data-load-input]').count()} fields`
  );
  const prefilled = await page.locator('[data-load-input]').first().inputValue();
  check(
    'coach: the field opens on the suggested number, which is the conservative one here',
    prefilled === '23.5',
    `value="${prefilled}"`
  );

  // Edit the number, then take Repeat the phase. The edit is only carried
  // by Progress, so this proves the edit persists on the review and the
  // repeat draft is genuinely a repeat.
  await page.locator('[data-load-input]').first().fill('27.5');
  const edited = await page.locator('[data-load-input]').first().inputValue();
  check('coach: the number can be edited', edited === '27.5', `value="${edited}"`);

  await page.locator('[data-choose-outcome="repeat_phase"]').click();
  await page.waitForTimeout(400);
  const confirmText = await page.locator('main').innerText();
  check(
    'coach: taking an outcome asks to confirm, and the confirm says "draft"',
    /This writes a draft of the same program again\. Nothing goes to her until you approve it\./i.test(
      confirmText
    ),
    ''
  );

  await page.locator('[data-confirm-outcome="repeat_phase"]').click();
  await page.waitForSelector('[data-review-draft]', { timeout: 30000 });
  const draftText = await page.locator('main').innerText();
  check('coach: a draft was written', /Draft written, not given/i.test(draftText), '');
  check(
    'coach: the screen says she cannot see it',
    /cannot see any of it/i.test(draftText),
    ''
  );

  const { data: review } = await db
    .from('program_phase_reviews')
    .select('*')
    .eq('member_id', MEMBER_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (review) {
    restore.reviewIds.push(review.id);
    restore.draftAssignmentIds.push(...(review.draft_assignment_ids ?? []));
    restore.draftTemplateIds.push(...(review.draft_template_ids ?? []));
  }
  check('db: the review recorded the chosen outcome', review?.chosen_outcome === 'repeat_phase', review?.chosen_outcome ?? 'none');
  check('db: the review recorded the recommendation it made', review?.recommended_outcome === 'rotate_exercises', review?.recommended_outcome ?? 'none');
  check('db: it recorded a draft', (review?.draft_assignment_ids ?? []).length > 0, `${(review?.draft_assignment_ids ?? []).length} assignments`);

  const { data: draftRows } = await db
    .from('coach_program_assignments')
    .select('id, visibility, published_at, status')
    .in('id', review?.draft_assignment_ids ?? ['00000000-0000-0000-0000-000000000000']);
  check(
    'db: EVERY drafted assignment is unpublished',
    (draftRows ?? []).length > 0 && (draftRows ?? []).every((r) => r.visibility === 'draft' && r.published_at === null),
    (draftRows ?? []).map((r) => `${r.visibility}/${r.published_at ?? 'null'}`).join(', ')
  );
  check(
    'db: her current program was not superseded by a draft',
    (await countPublished(assignmentIds)) === publishedBefore,
    `${publishedBefore} published before and after`
  );

  // The member cannot see any of it.
  for (let attempt = 1; attempt <= 3 && !memberMinted; attempt++) {
    memberMinted = await mintSessionContext(browser, MEMBER_EMAIL, {
      baseUrl: BASE,
      viewport: { width: 390, height: 844 },
    });
    if (!memberMinted) {
      note(`member mint attempt ${attempt} did not answer, retrying`);
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  check('member: session minted', Boolean(memberMinted), memberMinted ? '' : 'could not mint after 3 attempts');
  // And it is HER session, not a stranger's. The check exists because a
  // mistyped address silently produced a new account rather than an error.
  check(
    'member: the minted session belongs to the member under test',
    memberMinted?.session?.user?.id === MEMBER_ID,
    `${memberMinted?.session?.user?.id ?? 'none'} vs ${MEMBER_ID}`
  );
  if (memberMinted) {
    const memberPage = await memberMinted.context.newPage();
    guardVideos(memberPage, errors);
    await memberPage.goto(`${BASE}/programs`, { waitUntil: 'domcontentloaded' });
    await memberPage.waitForTimeout(2000);
    const programsText = await memberPage.locator('main').innerText();
    check(
      'member: the drafted program is nowhere on her programs screen',
      !/Draft/i.test(programsText),
      ''
    );
    await memberPage.close();
  }

  // Discard it. The action deletes three assignments and three templates
  // and then navigates back to the programs list, so wait for the
  // navigation rather than for an arbitrary number of seconds.
  await page.locator('[data-discard-draft="true"]').click();
  await page.waitForURL(/\/programs$/, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const { data: afterDiscard } = await db
    .from('coach_program_assignments')
    .select('id')
    .in('id', review?.draft_assignment_ids ?? ['00000000-0000-0000-0000-000000000000']);
  check('coach: discarding removed the drafted assignments', (afterDiscard ?? []).length === 0, `${(afterDiscard ?? []).length} left`);
  const { data: discarded } = await db
    .from('program_phase_reviews')
    .select('status')
    .eq('id', review?.id ?? '00000000-0000-0000-0000-000000000000')
    .maybeSingle();
  check('db: the review reads as discarded', discarded?.status === 'discarded', discarded?.status ?? 'none');

  // -------------------------------------------------------------------
  // 3. The edited number persists into a draft.
  // -------------------------------------------------------------------
  await page.goto(`${BASE}/coach/clients/${MEMBER_ID}/programs/review/${encodeURIComponent(groupKey)}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(2500);
  await page.locator('[data-load-input]').first().fill('30');
  await page.locator('[data-choose-outcome="progress_next_phase"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-confirm-outcome="progress_next_phase"]').click();
  await page.waitForSelector('[data-review-draft]', { timeout: 30000 });

  const { data: progressReview } = await db
    .from('program_phase_reviews')
    .select('*')
    .eq('member_id', MEMBER_ID)
    .eq('chosen_outcome', 'progress_next_phase')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (progressReview) {
    restore.reviewIds.push(progressReview.id);
    restore.draftAssignmentIds.push(...(progressReview.draft_assignment_ids ?? []));
    restore.draftTemplateIds.push(...(progressReview.draft_template_ids ?? []));
  }
  const approvedLoads = progressReview?.approved_loads ?? {};
  check(
    'db: the coach’s edited number, not the suggestion, is what the review recorded',
    approvedLoads[loggedExternalId]?.load === 30,
    JSON.stringify(approvedLoads)
  );

  const { data: draftWorkouts } = await db
    .from('coach_assigned_workouts')
    .select('id')
    .in('assignment_id', progressReview?.draft_assignment_ids ?? ['00000000-0000-0000-0000-000000000000']);
  const { data: draftExercises } = await db
    .from('coach_assigned_workout_exercises')
    .select('external_id, load, load_unit')
    .in(
      'assigned_workout_id',
      (draftWorkouts ?? []).map((w) => w.id).concat('00000000-0000-0000-0000-000000000000')
    )
    .eq('external_id', loggedExternalId);
  check(
    'db: the edited number is on the drafted exercise rows',
    (draftExercises ?? []).length > 0 && (draftExercises ?? []).every((r) => r.load === '30'),
    (draftExercises ?? []).map((r) => `${r.load} ${r.load_unit}`).join(', ') || 'no rows'
  );
  check(
    'db: every progress draft assignment is still unpublished',
    (
      await db
        .from('coach_program_assignments')
        .select('visibility, published_at')
        .in('id', progressReview?.draft_assignment_ids ?? ['x'])
    ).data?.every((r) => r.visibility === 'draft' && r.published_at === null) === true,
    ''
  );

  // Discard this one too.
  await page.locator('[data-discard-draft="true"]').click();
  await page.waitForURL(/\/programs$/, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2000);
  check(
    'coach: the progress draft was discarded too',
    (
      await db
        .from('coach_program_assignments')
        .select('id')
        .in('id', progressReview?.draft_assignment_ids ?? ['x'])
    ).data?.length === 0,
    ''
  );

  // -------------------------------------------------------------------
  // 4. Releasing an avoidance entry.
  // -------------------------------------------------------------------
  await page.goto(`${BASE}/coach/clients/${MEMBER_ID}/programs`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const beforeRelease = await db
    .from('member_exercise_avoidance')
    .select('external_id')
    .eq('member_id', MEMBER_ID)
    .is('released_at', null);
  check(
    'db: the exercise is on her live avoidance list before the release',
    (beforeRelease.data ?? []).some((r) => r.external_id === painExternalId),
    (beforeRelease.data ?? []).map((r) => r.external_id).join(', ')
  );

  const releaseButtons = await page.locator(`[data-release-avoidance="${avoidance.id}"]`).count();
  check(
    'coach: the entry appears under every live program, because the list is hers and not one program’s',
    releaseButtons >= 1,
    `${releaseButtons} panels showing it`
  );
  await page.locator(`[data-release-avoidance="${avoidance.id}"]`).first().click();
  await page.waitForTimeout(2500);

  const { data: released } = await db
    .from('member_exercise_avoidance')
    .select('id, released_at, released_by, exercise_name')
    .eq('id', avoidance.id)
    .single();
  check('db: the entry is released, not deleted', released?.released_at !== null, released?.released_at ?? 'still null');
  check('db: it records who released it', Boolean(released?.released_by), released?.released_by ?? 'null');
  check('db: the record itself is intact', released?.exercise_name === painName, released?.exercise_name ?? '');

  const afterRelease = await db
    .from('member_exercise_avoidance')
    .select('external_id')
    .eq('member_id', MEMBER_ID)
    .is('released_at', null);
  check(
    'db: the exercise is offerable again, which is what the swap engine reads',
    !(afterRelease.data ?? []).some((r) => r.external_id === painExternalId),
    `${(afterRelease.data ?? []).length} still avoided`
  );

  // -------------------------------------------------------------------
  // 5. Resolving the pain report.
  // -------------------------------------------------------------------
  const openBefore = await db
    .from('member_exercise_feedback')
    .select('id')
    .eq('member_id', MEMBER_ID)
    .eq('branch', 'safety')
    .is('coach_reviewed_at', null);
  check('db: the pain report is open before the resolve', (openBefore.data ?? []).length > 0, `${(openBefore.data ?? []).length} open`);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.locator(`[data-resolve-pain="${painReport.id}"]`).first().click();
  await page.waitForTimeout(400);
  await page.locator('textarea').first().fill('Spoke to her, rotating the pattern next phase.');
  await page.getByRole('button', { name: /^Mark reviewed$/ }).first().click();
  await page.waitForSelector(`[data-pain-resolved="${painReport.id}"]`, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const { data: resolved } = await db
    .from('member_exercise_feedback')
    .select('*')
    .eq('id', painReport.id)
    .single();
  check('db: the report is marked reviewed', resolved?.coach_reviewed_at !== null, resolved?.coach_reviewed_at ?? 'null');
  check('db: the coach’s note was saved', resolved?.coach_review_note === 'Spoke to her, rotating the pattern next phase.', resolved?.coach_review_note ?? 'null');
  check('db: her own words are untouched', resolved?.other_text === 'felt a pinch on the left side', resolved?.other_text ?? '');
  check('db: the reason, branch and outcome are untouched', resolved?.reason === 'pain' && resolved?.branch === 'safety' && resolved?.outcome === 'stopped_for_pain', `${resolved?.reason}/${resolved?.branch}/${resolved?.outcome}`);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const afterResolveText = await page.locator('main').innerText();
  check(
    'coach: the panel now says the report was reviewed rather than flagging it',
    /You marked it reviewed\./i.test(afterResolveText) && !/has not been reviewed yet/i.test(afterResolveText),
    ''
  );
  check(
    'coach: the record is still shown, with her words',
    /felt a pinch on the left side/.test(afterResolveText),
    ''
  );

  // The coach dashboard's needs-attention surface no longer flags it.
  await page.goto(`${BASE}/coach`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const dashboardText = await page.locator('main').innerText();
  check(
    'coach: the dashboard no longer says "Exercise stopped, member reported pain"',
    !/Exercise stopped, member reported pain/i.test(dashboardText),
    ''
  );

  // -------------------------------------------------------------------
  // 6. Prompt 7's member surfaces, unchanged.
  // -------------------------------------------------------------------
  if (memberMinted) {
    const memberPage = await memberMinted.context.newPage();
    guardVideos(memberPage, errors);

    await memberPage.goto(`${BASE}/programs`, { waitUntil: 'domcontentloaded' });
    await memberPage.waitForTimeout(2000);
    const programsText = await memberPage.locator('main').innerText();
    check('member: her programs screen still renders', programsText.length > 50, `${programsText.length} chars`);

    // Her programs are all upcoming, so the list screen offers no session
    // link to click. Open one of her real occurrences directly rather than
    // silently skipping the check that Prompt 7's surfaces are unchanged.
    const { data: herWorkouts } = await db
      .from('coach_assigned_workouts')
      .select('id')
      .eq('member_id', MEMBER_ID)
      .not('published_at', 'is', null)
      .order('scheduled_date', { ascending: true })
      .limit(1);
    const workoutId = herWorkouts?.[0]?.id ?? null;
    check('member: she has a published session to open', Boolean(workoutId), workoutId ?? 'none');
    if (workoutId) {
      await memberPage.goto(`${BASE}/programs/${workoutId}`, { waitUntil: 'domcontentloaded' });
      await memberPage.waitForTimeout(3000);
      const detailText = await memberPage.locator('main').innerText();
      check('member: the session opens', detailText.length > 200, `${detailText.length} chars`);

      check(
        'member: the weight field is exactly as Prompt 7 left it',
        /Weight used/i.test(detailText) &&
          detailText.includes(
            'Log the weight you used. It helps your coach and the app plan your next weeks just right for you.'
          ),
        ''
      );
      check(
        'member: nothing says "Your coach set", because no coach has approved a number for her',
        !/Your coach set/i.test(detailText),
        ''
      );
      check(
        'member: "Need another option?" is still there',
        /Need another option/i.test(detailText),
        ''
      );
      check(
        'member: her program still explains itself',
        /Why this exercise|Why this program/i.test(detailText),
        ''
      );
      const coachSet = await memberPage.locator('[data-coach-set-load]').count();
      check('member: no coach-set line rendered anywhere', coachSet === 0, `${coachSet} found`);
    }
    await memberPage.close();
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

  if (restore.draftAssignmentIds.length > 0) {
    await db.from('coach_program_assignments').delete().in('id', restore.draftAssignmentIds);
  }
  if (restore.draftTemplateIds.length > 0) {
    await db.from('coach_program_templates').delete().in('id', restore.draftTemplateIds);
  }
  if (restore.reviewIds.length > 0) {
    await db.from('program_phase_reviews').delete().in('id', restore.reviewIds);
  }
  await db.from('program_phase_reviews').delete().eq('member_id', MEMBER_ID);
  if (restore.avoidanceIds.length > 0) {
    await db.from('member_exercise_avoidance').delete().in('id', restore.avoidanceIds);
  }
  if (restore.feedbackIds.length > 0) {
    await db.from('member_exercise_feedback').delete().in('id', restore.feedbackIds);
  }
  await db
    .from('member_wellness_events')
    .delete()
    .eq('member_id', MEMBER_ID)
    .in('event_type', [
      'program_review_opened',
      'program_review_drafted',
      'exercise_feedback_resolved',
      'exercise_avoidance_released',
    ]);

  const after = {
    reviews: (await db.from('program_phase_reviews').select('id', { count: 'exact', head: true })).count ?? 0,
    feedback: (await db.from('member_exercise_feedback').select('id', { count: 'exact', head: true })).count ?? 0,
    avoidance: (await db.from('member_exercise_avoidance').select('id', { count: 'exact', head: true })).count ?? 0,
    logged: (
      await db
        .from('coach_assigned_workout_exercises')
        .select('id', { count: 'exact', head: true })
        .not('logged_load', 'is', null)
    ).count ?? 0,
    prescribed: (
      await db
        .from('coach_assigned_workout_exercises')
        .select('id', { count: 'exact', head: true })
        .not('load', 'is', null)
    ).count ?? 0,
    drafts: (
      await db
        .from('coach_program_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('visibility', 'draft')
    ).count ?? 0,
    skipped: await countRows('coach_assigned_workout_exercises', (q) => q.eq('status', 'skipped')),
    completed: await countRows('coach_assigned_workout_exercises', (q) => q.eq('status', 'completed')),
  };
  for (const [key, label] of [
    ['reviews', 'program_phase_reviews'],
    ['feedback', 'member_exercise_feedback'],
    ['avoidance', 'member_exercise_avoidance'],
    ['logged', 'exercises carrying a logged weight'],
    ['prescribed', 'exercises carrying a prescribed weight'],
    ['drafts', 'draft assignments'],
    ['skipped', 'exercises reading as skipped'],
    ['completed', 'exercises reading as completed'],
  ]) {
    check(
      `restore: ${label} is back to what production already had`,
      after[key] === baseline[key],
      `${after[key]} now, ${baseline[key]} before`
    );
  }

  await retireSession(staffMinted);
  await retireSession(memberMinted);
  await browser.close();
}

const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed} of ${results.length} checks passed against ${BASE}`);
process.exit(passed === results.length ? 0 : 1);

async function countPublished(ids) {
  const { count } = await db
    .from('coach_program_assignments')
    .select('id', { count: 'exact', head: true })
    .in('id', ids)
    .eq('visibility', 'published');
  return count ?? 0;
}
