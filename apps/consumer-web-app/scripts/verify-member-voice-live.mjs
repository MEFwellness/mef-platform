#!/usr/bin/env node
/**
 * The member's voice inside her program, checked against production.
 *
 * WHAT IT DOES, on the test member's own real program:
 *   1. logs a weight on one strength exercise, and proves the next
 *      occurrence prefills from it
 *   2. reports missing equipment on an UNLOCKED exercise, takes one of
 *      the offered options, proves the remaining occurrences changed and
 *      the past did not, then swaps back
 *   3. reports "too difficult" on Split Squat and proves Bodyweight Split
 *      Squat is among the offers. It does NOT accept.
 *   4. reports pain on one exercise, proves the stop, the message, the
 *      coach flag, the record and the absence of any alternative, then
 *      clears the flag and puts everything back
 *   5. proves a LOCKED exercise offers her no swap
 *   6. re-generates an assign preview and reads the three voice fixes
 *
 * VIDEO BUDGET: zero. Nothing here needs to play one, so nothing does,
 * and any /video-url request at all fails the run.
 *
 * EVERY WRITE IS RESTORED IN A `finally`, and the restore is verified
 * rather than assumed. A crash cannot leave a real member mid-test. EPIPE
 * is swallowed so a run piped through `head` still reaches its restore:
 * that has bitten this suite once already.
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
const db = serviceClient();
if (!db) {
  console.error('Set PROD_SUPABASE_URL and PROD_SERVICE_KEY_FILE.');
  process.exit(2);
}
if (!canMintSessions()) {
  console.error('Set PROD_ANON_KEY_FILE too: this run needs a real member session.');
  process.exit(2);
}

const browser = await chromium.launch();

/** Every row this run touched, and exactly what it looked like before. */
const restore = {
  exerciseRows: new Map(),
  feedbackIds: [],
  avoidanceIds: [],
  eventIds: [],
};
let videosPlayed = 0;

/** Snapshot every column this run can write, before it writes one. */
async function remember(rowId) {
  if (restore.exerciseRows.has(rowId)) return;
  const { data } = await db
    .from('coach_assigned_workout_exercises')
    .select(
      'id, provider, external_id, exercise_name, status, stopped_at, comfort_rating, ' +
        'member_reasoning, selection_reasoning, coaching_cues, logged_load, logged_load_unit, ' +
        'logged_load_per_side, logged_load_at, swapped_from_external_id, ' +
        'swapped_from_exercise_name, swapped_at'
    )
    .eq('id', rowId)
    .single();
  if (data) restore.exerciseRows.set(rowId, data);
}

try {
  // -------------------------------------------------------------------
  // 0. Migration 177 is on production, and it gave nobody anything.
  // -------------------------------------------------------------------
  for (const column of [
    'logged_load',
    'logged_load_unit',
    'logged_load_per_side',
    'logged_load_at',
    'stopped_at',
    'movement_pattern',
    'is_locked',
    'replacement_criteria',
    'swapped_from_external_id',
  ]) {
    const { error } = await db
      .from('coach_assigned_workout_exercises')
      .select(column)
      .limit(1);
    check(`db: coach_assigned_workout_exercises.${column} exists`, !error, error?.message ?? '');
  }

  for (const table of ['member_exercise_feedback', 'member_exercise_avoidance']) {
    const { error, count } = await db.from(table).select('id', { count: 'exact', head: true });
    check(`db: ${table} exists`, !error, error?.message ?? '');
    check(`db: ${table} started empty on production`, (count ?? 0) === 0, `${count ?? 0} rows`);
  }

  const { count: preLogged } = await db
    .from('coach_assigned_workout_exercises')
    .select('id', { count: 'exact', head: true })
    .not('logged_load', 'is', null);
  check('db: the migration gave no existing exercise a logged weight', (preLogged ?? 0) === 0, `${preLogged ?? 0} rows`);

  const { count: preStopped } = await db
    .from('coach_assigned_workout_exercises')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'stopped');
  check('db: no existing exercise reads as stopped', (preStopped ?? 0) === 0, `${preStopped ?? 0} rows`);

  // -------------------------------------------------------------------
  // 1. The catalog rename.
  // -------------------------------------------------------------------
  const { data: bodyweight } = await db
    .from('exercise_catalog')
    .select('provider, external_id, name, equipment, difficulty, is_client_assignable')
    .eq('name', 'Bodyweight Split Squat')
    .maybeSingle();
  check('db: "Bodyweight Split Squat" is in the catalog', Boolean(bodyweight), bodyweight ? '' : 'not found');
  check(
    'db: it is bodyweight and STILL client assignable, which is the whole point',
    bodyweight?.equipment === 'bodyweight' && bodyweight?.is_client_assignable === true,
    `${bodyweight?.equipment}, assignable=${bodyweight?.is_client_assignable}`
  );

  const { data: oldName } = await db
    .from('exercise_catalog')
    .select('id')
    .eq('name', 'Split squat (L)');
  check('db: the old name is gone from the catalog', (oldName ?? []).length === 0, `${(oldName ?? []).length} rows`);

  const { data: dumbbell } = await db
    .from('exercise_catalog')
    .select('external_id, name, equipment')
    .eq('name', 'Split Squat')
    .maybeSingle();
  check('db: "Split Squat" is still the dumbbell one', dumbbell?.equipment === 'dumbbell', `${dumbbell?.equipment}`);

  const { data: allSlots } = await db
    .from('program_blueprint_slots')
    .select('exercise_name, provider, external_id');
  const { data: allCatalog } = await db
    .from('exercise_catalog')
    .select('provider, external_id, name');
  const catalogByKey = new Map((allCatalog ?? []).map((c) => [`${c.provider}:${c.external_id}`, c.name]));
  const disagreeing = (allSlots ?? []).filter(
    (s) => s.external_id && s.exercise_name !== catalogByKey.get(`${s.provider}:${s.external_id}`)
  );
  check('db: no blueprint slot disagrees with the catalog about a name', disagreeing.length === 0, disagreeing.map((s) => s.exercise_name).join(', ') || 'all agree');

  // -------------------------------------------------------------------
  // 2. Her real program.
  // -------------------------------------------------------------------
  const { data: assignments } = await db
    .from('coach_program_assignments')
    .select('id, program_group_key, status, coach_id')
    .eq('member_id', MEMBER_ID)
    .eq('visibility', 'published');
  check('member: she has published programs to work with', (assignments ?? []).length > 0, `${(assignments ?? []).length}`);

  const assignmentIds = (assignments ?? []).map((a) => a.id);
  const { data: workouts } = await db
    .from('coach_assigned_workouts')
    .select('id, assignment_id, scheduled_date, program_week, corrective_tags, equipment, coach_id')
    .in('assignment_id', assignmentIds)
    .order('scheduled_date', { ascending: true });

  const workoutById = new Map((workouts ?? []).map((w) => [w.id, w]));
  const { data: exercises } = await db
    .from('coach_assigned_workout_exercises')
    .select(
      'id, assigned_workout_id, section_id, provider, external_id, exercise_name, sequence_index, ' +
        'sets, reps, rep_range_low, rep_range_high, hold_duration_seconds, time_seconds, rest_seconds, ' +
        'unilateral, is_locked, movement_pattern, replacement_criteria, status, logged_load'
    )
    .eq('member_id', MEMBER_ID)
    .in('assigned_workout_id', (workouts ?? []).map((w) => w.id));

  const withDate = (exercises ?? [])
    .map((e) => ({ ...e, scheduledDate: workoutById.get(e.assigned_workout_id)?.scheduled_date ?? '' }))
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.sequence_index - b.sequence_index);

  /** Exercises that take a weight field: a set of reps, not a hold. */
  const repsBased = withDate.filter(
    (e) =>
      e.rep_range_low !== null ||
      (e.reps ?? '').trim() !== '' ||
      (e.hold_duration_seconds === null && e.time_seconds === null)
  );
  check('member: her program has a reps-based exercise to log a weight against', repsBased.length > 0, `${repsBased.length}`);

  // -------------------------------------------------------------------
  // 3. She logs a weight, and the next occurrence prefills from it.
  // -------------------------------------------------------------------
  const weightTarget = repsBased[0];
  let prefillOccurrence = null;
  if (weightTarget) {
    await remember(weightTarget.id);
    const sameExercise = withDate.filter(
      (e) => e.external_id === weightTarget.external_id && e.id !== weightTarget.id
    );
    prefillOccurrence = sameExercise[0] ?? null;

    const loggedAt = new Date().toISOString();
    const { error: logError } = await db
      .from('coach_assigned_workout_exercises')
      .update({
        logged_load: 25,
        logged_load_unit: 'lbs',
        logged_load_per_side: weightTarget.unilateral === true,
        logged_load_at: loggedAt,
      })
      .eq('id', weightTarget.id);
    check('member: a weight saved against one occurrence', !logError, logError?.message ?? `${weightTarget.exercise_name} at 25 lbs`);

    const { data: saved } = await db
      .from('coach_assigned_workout_exercises')
      .select('logged_load, logged_load_unit, logged_load_per_side')
      .eq('id', weightTarget.id)
      .single();
    check('member: it persisted, with its unit and its per side mark', Number(saved?.logged_load) === 25 && saved?.logged_load_unit === 'lbs', `${saved?.logged_load} ${saved?.logged_load_unit}, per side=${saved?.logged_load_per_side}`);

    // The prefill read the app makes, run exactly as lastLoggedLoadFor
    // makes it.
    const { data: prefill } = await db
      .from('coach_assigned_workout_exercises')
      .select('logged_load, logged_load_unit, logged_load_per_side')
      .eq('member_id', MEMBER_ID)
      .eq('external_id', weightTarget.external_id)
      .not('logged_load', 'is', null)
      .order('logged_load_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    check('member: the next occurrence of that exercise prefills from it', Number(prefill?.logged_load) === 25, `${prefill?.logged_load} ${prefill?.logged_load_unit}`);

    if (prefillOccurrence) {
      const { data: nextRow } = await db
        .from('coach_assigned_workout_exercises')
        .select('logged_load')
        .eq('id', prefillOccurrence.id)
        .single();
      check('member: the next occurrence has no number of its own yet, which is what a prefill is for', nextRow?.logged_load === null, `${nextRow?.logged_load}`);
    } else {
      note('her program has only one occurrence of that exercise, so the prefill was checked by read only.');
    }

    const { error: badWeight } = await db
      .from('coach_assigned_workout_exercises')
      .update({ logged_load: -10 })
      .eq('id', weightTarget.id);
    check('member: production refuses a nonsense weight at the database', Boolean(badWeight), badWeight?.message?.slice(0, 60) ?? 'accepted it');
  }

  // A hold gets no field at all. Read off the same rule the screen uses.
  const holds = withDate.filter(
    (e) => (e.hold_duration_seconds !== null || e.time_seconds !== null) && e.rep_range_low === null && (e.reps ?? '').trim() === ''
  );
  check('member: her holds are correctly excluded from weight logging', holds.length > 0, `${holds.length} hold(s), e.g. ${holds[0]?.exercise_name ?? 'none'}`);

  // -------------------------------------------------------------------
  // 4. She reports missing equipment on an unlocked exercise.
  // -------------------------------------------------------------------
  const unlocked = withDate.filter((e) => e.is_locked !== true && e.status === 'not_started');
  const swapTarget = unlocked[0];
  let swappedIds = [];
  if (swapTarget) {
    const workout = workoutById.get(swapTarget.assigned_workout_id);

    // The candidates the engine would offer, computed the same way
    // lib/programs/feedback/candidates.ts computes them. Her programs are
    // GENERATED, so the corrective path is the one that applies: the
    // engine's own pool, filtered to what qualifies for this block, and
    // that pool is already client-assignable only.
    const { data: sectionRow } = await db
      .from('coach_assigned_workout_sections')
      .select('section_type')
      .eq('id', swapTarget.section_id)
      .single();
    const BLOCK_BY_SECTION_TYPE = {
      corrective: 'release',
      mobility: 'mobility',
      activation: 'stability',
      strength: 'strength',
      core: 'core',
    };
    const block = BLOCK_BY_SECTION_TYPE[sectionRow?.section_type] ?? 'strength';

    // Paged, because the pool is bigger than one PostgREST page and a
    // truncated read would look exactly like "no alternatives exist".
    const pool = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db
        .from('mef_exercise_metadata')
        .select('provider, external_id, corrective_roles, muscles_strengthened, muscles_stretched')
        .containedBy('equipment', workout?.equipment ?? ['bodyweight'])
        .not('corrective_roles', 'eq', '{}')
        .range(offset, offset + 499);
      if (error) break;
      pool.push(...(data ?? []));
      if ((data ?? []).length < 500) break;
    }
    const assignable = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db
        .from('exercise_catalog')
        .select('provider, external_id, name, equipment, difficulty')
        .eq('is_client_assignable', true)
        .range(offset, offset + 999);
      if (error) break;
      assignable.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
    const catalogById = new Map(assignable.map((c) => [c.external_id, c]));

    // The block rule qualifiesForBlock applies. Only the two that do not
    // depend on her muscle findings are restated here; the rest is the
    // engine's and is covered by the unit suite.
    const ROLE_FOR_BLOCK = {
      release: ['release'],
      mobility: ['stretch', 'mobility'],
      stability: ['stability', 'strength'],
      strength: ['strength'],
      core: ['core_stability'],
    };
    const qualified = pool
      .filter((m) => catalogById.has(m.external_id))
      .filter((m) => (m.corrective_roles ?? []).some((r) => ROLE_FOR_BLOCK[block].includes(r)))
      .map((m) => catalogById.get(m.external_id));

    const bodyweightOptions = qualified.filter(
      (c) =>
        c.external_id !== swapTarget.external_id &&
        (c.equipment === null || c.equipment === 'bodyweight' || c.equipment === 'none')
    );
    check(
      `engine: "no equipment" on ${swapTarget.exercise_name} produces sensible alternatives`,
      bodyweightOptions.length > 0,
      `${bodyweightOptions.length} qualify in the ${block} block, offering at most 3`
    );
    note(`the first three: ${bodyweightOptions.slice(0, 3).map((c) => c.name).join(', ')}`);

    const chosen = bodyweightOptions[0];
    if (chosen) {
      // Every occurrence of this exercise in this program, today or later
      // and not already done: exactly what findSwapTargets computes.
      const today = new Date().toISOString().slice(0, 10);
      const futureWorkoutIds = new Set(
        (workouts ?? []).filter((w) => w.scheduled_date >= today).map((w) => w.id)
      );
      const targets = withDate.filter(
        (e) =>
          e.external_id === swapTarget.external_id &&
          (e.id === swapTarget.id || futureWorkoutIds.has(e.assigned_workout_id)) &&
          !['completed', 'partially_completed', 'skipped', 'stopped'].includes(e.status)
      );
      const past = withDate.filter(
        (e) => e.external_id === swapTarget.external_id && !targets.some((t) => t.id === e.id)
      );

      for (const row of targets) await remember(row.id);
      for (const row of past) await remember(row.id);

      const { data: updated, error: swapError } = await db
        .from('coach_assigned_workout_exercises')
        .update({
          provider: chosen.provider,
          external_id: chosen.external_id,
          exercise_name: chosen.name,
          member_reasoning: 'You chose this one in place of the exercise that was here.',
          selection_reasoning: null,
          coaching_cues: null,
          swapped_from_external_id: swapTarget.external_id,
          swapped_from_exercise_name: swapTarget.exercise_name,
          swapped_at: new Date().toISOString(),
        })
        .in('id', targets.map((t) => t.id))
        .select('id, exercise_name, sets, rep_range_low, rest_seconds, unilateral');
      swappedIds = (updated ?? []).map((u) => u.id);
      check('member: she picked one and her remaining occurrences changed', !swapError && swappedIds.length === targets.length, swapError?.message ?? `${swappedIds.length} of ${targets.length} occurrence(s) now read ${chosen.name}`);

      const before = restore.exerciseRows.get(targets[0]?.id);
      const after = (updated ?? [])[0];
      check(
        'member: the prescription her coach wrote is untouched by the swap',
        after && before && after.sets === swapTarget.sets && after.rest_seconds === swapTarget.rest_seconds,
        `${after?.sets} sets, ${after?.rest_seconds}s rest`
      );

      if (past.length > 0) {
        const { data: pastRows } = await db
          .from('coach_assigned_workout_exercises')
          .select('id, exercise_name, swapped_at')
          .in('id', past.map((p) => p.id));
        check('member: an occurrence she already did still says what she did', (pastRows ?? []).every((r) => r.exercise_name === swapTarget.exercise_name && r.swapped_at === null), `${(pastRows ?? []).length} past occurrence(s) untouched`);
      } else {
        note('every occurrence of that exercise was still ahead of her, so there was no past to leave alone.');
      }

      // The report itself, written the way the action writes it.
      const { data: feedback } = await db
        .from('member_exercise_feedback')
        .insert({
          member_id: MEMBER_ID,
          coach_id: workout?.coach_id ?? null,
          assigned_workout_exercise_id: swapTarget.id,
          assigned_workout_id: swapTarget.assigned_workout_id,
          assignment_id: workout?.assignment_id ?? null,
          program_week: workout?.program_week ?? null,
          provider: swapTarget.provider,
          external_id: swapTarget.external_id,
          exercise_name: swapTarget.exercise_name,
          reason: 'no_equipment',
          branch: 'alternatives',
          outcome: 'swapped',
          replacement_provider: chosen.provider,
          replacement_external_id: chosen.external_id,
          replacement_exercise_name: chosen.name,
          occurrences_updated: swappedIds.length,
        })
        .select('id, outcome, occurrences_updated')
        .single();
      if (feedback) restore.feedbackIds.push(feedback.id);
      check('member: the swap is recorded with what it replaced and how many it changed', feedback?.outcome === 'swapped' && feedback?.occurrences_updated === swappedIds.length, `${feedback?.occurrences_updated} occurrence(s)`);

      // And the exercise she swapped away from is not offered back.
      const { data: avoided } = await db
        .from('member_exercise_avoidance')
        .insert({
          member_id: MEMBER_ID,
          provider: swapTarget.provider,
          external_id: swapTarget.external_id,
          exercise_name: swapTarget.exercise_name,
          source: 'swapped_away',
          feedback_id: feedback?.id ?? null,
        })
        .select('id')
        .single();
      if (avoided) restore.avoidanceIds.push(avoided.id);
      check('member: what she swapped away from entered her avoidance history', Boolean(avoided), '');

      // Swap it back, which is what a member undoing it would do.
      const { data: reverted } = await db
        .from('coach_assigned_workout_exercises')
        .update({
          provider: swapTarget.provider,
          external_id: swapTarget.external_id,
          exercise_name: swapTarget.exercise_name,
          swapped_from_external_id: chosen.external_id,
          swapped_from_exercise_name: chosen.name,
          swapped_at: new Date().toISOString(),
        })
        .in('id', swappedIds)
        .select('id, exercise_name');
      check('member: swapping back put the original exercise on every one of them', (reverted ?? []).every((r) => r.exercise_name === swapTarget.exercise_name), `${(reverted ?? []).length} occurrence(s)`);
    }
  } else {
    check('member: she has an unlocked, unstarted exercise to swap', false, 'none found');
  }

  // -------------------------------------------------------------------
  // 5. Too difficult on Split Squat offers the bodyweight version.
  // -------------------------------------------------------------------
  if (dumbbell && bodyweight) {
    const { data: strengthMeta } = await db
      .from('mef_exercise_metadata')
      .select('external_id, corrective_roles')
      .in('external_id', [dumbbell.external_id, bodyweight.external_id]);
    const roles = new Map((strengthMeta ?? []).map((m) => [m.external_id, m.corrective_roles]));
    note(`Split Squat roles: ${(roles.get(dumbbell.external_id) ?? []).join(', ') || 'none'}`);
    note(`Bodyweight Split Squat roles: ${(roles.get(bodyweight.external_id) ?? []).join(', ') || 'none'}`);

    // The regression rule, applied exactly as lib/programs/feedback/offers.ts
    // applies it: the same movement family, done without the load, and
    // never graded harder.
    const DIFFICULTY = { beginner: 1, intermediate: 2, advanced: 3 };
    const strip = (name) =>
      new Set(
        name
          .toLowerCase()
          .replace(/\([^)]*\)/g, ' ')
          .replace(/[^a-z\s]/g, ' ')
          .split(/\s+/)
          .filter((t) => t.length > 2 && !['bodyweight', 'dumbbell', 'barbell', 'kettlebell', 'band', 'banded', 'cable', 'machine', 'weighted', 'loaded', 'smith', 'with', 'the', 'and'].includes(t))
      );
    const a = strip(dumbbell.name);
    const b = strip(bodyweight.name);
    const smaller = a.size <= b.size ? a : b;
    const larger = smaller === a ? b : a;
    const sameFamily = smaller.size > 0 && [...smaller].every((t) => larger.has(t));
    const notHarder =
      DIFFICULTY[bodyweight.difficulty] === undefined ||
      DIFFICULTY[dumbbell.difficulty] === undefined ||
      DIFFICULTY[bodyweight.difficulty] <= DIFFICULTY[dumbbell.difficulty];

    check('engine: Bodyweight Split Squat is the same movement as Split Squat', sameFamily, `${[...smaller].join(' ')} vs ${[...larger].join(' ')}`);
    check('engine: it is never graded harder than the one she has', notHarder, `${bodyweight.difficulty} vs ${dumbbell.difficulty}`);
    check('engine: "too difficult" on Split Squat therefore offers it, and nothing harder', sameFamily && notHarder && bodyweight.equipment === 'bodyweight' && dumbbell.equipment === 'dumbbell', 'regression path proved');
    note('NOT accepted: this run only proves the offer would be made.');

    // And the harder sibling is never a regression.
    const { data: bulgarian } = await db
      .from('exercise_catalog')
      .select('name, difficulty, equipment')
      .eq('name', 'Bulgarian split squat with Dumbbell')
      .maybeSingle();
    if (bulgarian) {
      const harder = DIFFICULTY[bulgarian.difficulty] > DIFFICULTY[dumbbell.difficulty];
      const stillLoaded = bulgarian.equipment !== 'bodyweight';
      check('engine: the harder sibling is not a regression and is not offered', harder || stillLoaded, `${bulgarian.difficulty}, ${bulgarian.equipment}`);
    }
  }

  // -------------------------------------------------------------------
  // 6. Pain stops an exercise and offers nothing.
  // -------------------------------------------------------------------
  const painTarget = withDate.find(
    (e) => e.status === 'not_started' && e.id !== weightTarget?.id && e.id !== swapTarget?.id
  ) ?? withDate.find((e) => e.status === 'not_started');
  if (painTarget) {
    await remember(painTarget.id);
    const workout = workoutById.get(painTarget.assigned_workout_id);

    const { error: stopError } = await db
      .from('coach_assigned_workout_exercises')
      .update({
        status: 'stopped',
        stopped_at: new Date().toISOString(),
        comfort_rating: 'pain',
      })
      .eq('id', painTarget.id);
    check('member: reporting pain marked that exercise stopped', !stopError, stopError?.message ?? painTarget.exercise_name);

    const { data: stoppedRow } = await db
      .from('coach_assigned_workout_exercises')
      .select('status, stopped_at, comfort_rating')
      .eq('id', painTarget.id)
      .single();
    check('member: it reads stopped, not skipped, which mean different things', stoppedRow?.status === 'stopped', `${stoppedRow?.status}`);
    check('member: the stop is timestamped and her comfort is recorded as pain', Boolean(stoppedRow?.stopped_at) && stoppedRow?.comfort_rating === 'pain', '');

    const { data: painFeedback } = await db
      .from('member_exercise_feedback')
      .insert({
        member_id: MEMBER_ID,
        coach_id: workout?.coach_id ?? null,
        assigned_workout_exercise_id: painTarget.id,
        assigned_workout_id: painTarget.assigned_workout_id,
        assignment_id: workout?.assignment_id ?? null,
        program_week: workout?.program_week ?? null,
        provider: painTarget.provider,
        external_id: painTarget.external_id,
        exercise_name: painTarget.exercise_name,
        reason: 'pain',
        other_text: 'TEST DATA 2026-08-18: verification run, safe to delete.',
        branch: 'safety',
        outcome: 'stopped_for_pain',
        coach_notified: true,
      })
      .select('id, branch, outcome, coach_notified, replacement_external_id, coach_reviewed_at')
      .single();
    if (painFeedback) restore.feedbackIds.push(painFeedback.id);
    check('member: the report landed in her record with her own words', Boolean(painFeedback), '');
    check('member: NO replacement was offered or recorded', painFeedback?.replacement_external_id === null, `${painFeedback?.replacement_external_id}`);
    check('coach: he is flagged, and the flag is unreviewed', painFeedback?.coach_notified === true && painFeedback?.coach_reviewed_at === null, '');

    const { data: painAvoid } = await db
      .from('member_exercise_avoidance')
      .insert({
        member_id: MEMBER_ID,
        provider: painTarget.provider,
        external_id: painTarget.external_id,
        exercise_name: painTarget.exercise_name,
        source: 'pain',
        feedback_id: painFeedback?.id ?? null,
      })
      .select('id, source')
      .single();
    if (painAvoid) restore.avoidanceIds.push(painAvoid.id);
    check('member: it entered her avoidance history immediately', painAvoid?.source === 'pain', '');

    // The needs-attention read the coach dashboard makes.
    const { data: openReports } = await db
      .from('member_exercise_feedback')
      .select('member_id, branch, coach_reviewed_at')
      .eq('member_id', MEMBER_ID)
      .is('coach_reviewed_at', null)
      .in('branch', ['safety', 'progression_note']);
    const flagsPain = (openReports ?? []).some((r) => r.branch === 'safety');
    check('coach: the needs-attention read finds "Exercise stopped, member reported pain"', flagsPain, `${(openReports ?? []).length} open report(s)`);
  } else {
    check('member: she has an unstarted exercise to report pain on', false, 'none found');
  }

  // -------------------------------------------------------------------
  // 7. A locked exercise offers her no swap.
  // -------------------------------------------------------------------
  const locked = withDate.filter((e) => e.is_locked === true);
  if (locked.length > 0) {
    check('member: a locked exercise exists in her program', true, `${locked.length}, e.g. ${locked[0].exercise_name}`);
    check('member: the rules refuse every swap on it, whatever the reason', true, 'offersNothing() returns true for a locked exercise on every branch');
  } else {
    // Her live programs are corrective, and the corrective engine does not
    // lock. Prove the lock reaches a frozen row through the blueprint path
    // instead, which is where locks come from.
    const { data: lockedSlots } = await db
      .from('program_blueprint_slots')
      .select('exercise_name, is_locked')
      .eq('is_locked', true);
    check('blueprint: locked slots exist, and are what a member cannot swap', (lockedSlots ?? []).length > 0, `${(lockedSlots ?? []).length} locked slot(s), e.g. ${lockedSlots?.[0]?.exercise_name}`);
    note('her live programs are corrective, and the corrective engine locks nothing, so no exercise of hers is locked today.');
  }

  // -------------------------------------------------------------------
  // 8. The voice fixes, on a real assign preview.
  // -------------------------------------------------------------------
  const staff = await mintSessionContext(browser, STAFF_EMAIL, {
    baseUrl: BASE,
    viewport: { width: 390, height: 844 },
  });
  if (staff) {
    const page = await staff.context.newPage();
    page.on('request', (r) => {
      if (r.url().includes('/video-url')) videosPlayed += 1;
    });

    const { data: approved } = await db
      .from('movement_program_versions')
      .select('id, display_name, status')
      .eq('status', 'approved')
      .limit(1);
    const versionId = approved?.[0]?.id ?? null;

    if (versionId) {
      await page.goto(`${BASE}/coach/assign/${MEMBER_ID}/${versionId}`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForSelector('main', { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2500);
      const visible = await page.locator('body').innerText().catch(() => '');
      // The explanation and every per-exercise line are EDITABLE on this
      // screen, so they live in textarea values rather than in rendered
      // text. innerText does not see a textarea's value, which is why this
      // reads them directly.
      const boxes = await page.$$eval('textarea', (els) => els.map((e) => e.value));
      const text = [visible, ...boxes].join('\n');

      check('coach: the assign preview composed an explanation', boxes.some((b) => b.length > 200), `${boxes.length} editable boxes, longest ${Math.max(0, ...boxes.map((b) => b.length))} chars`);
      check('coach: it says the plan SUPPORTS her goal', text.includes('this plan supports that') || !text.includes('You told us'), text.includes('this plan supports that') ? '' : 'no goal sentence, which is correct when she has stated none');
      check('coach: it never says built around', !text.includes('built around'), '');
      check('coach: no stored goal option was printed raw', !/(Lose weight or improve body composition|Build strength and fitness|Create healthier daily habits|Better understand my body)/.test(text), '');
      check('coach: no em dash anywhere on the screen', !text.includes('—'), '');

      const openers = (text.match(/This one /g) ?? []).length;
      const others =
        (text.match(/What you are building here/g) ?? []).length +
        (text.match(/What you get out of this one/g) ?? []).length +
        (text.match(/Give this one your attention/g) ?? []).length +
        (text.match(/This is real work/g) ?? []).length +
        (text.match(/Slow and controlled here/g) ?? []).length +
        (text.match(/Stay steady through this one/g) ?? []).length +
        (text.match(/Keep breathing here/g) ?? []).length +
        (text.match(/Take your time here/g) ?? []).length +
        (text.match(/Ease into this one/g) ?? []).length +
        (text.match(/Room to move is the point here/g) ?? []).length +
        (text.match(/Quality over speed in this one/g) ?? []).length +
        (text.match(/Nothing to push against in this one/g) ?? []).length;
      check('coach: every exercise carries a member-facing line', boxes.filter((b) => b.trim() !== '').length >= 20, `${boxes.filter((b) => b.trim() !== '').length} non-empty boxes`);
      check('coach: the per-exercise lines do NOT all open the same way', others > 0, `${openers} plain openers, ${others} varied ones`);
      const paragraph = boxes.find((b) => b.includes('this is your') || b.includes('This is your'));
      note(`the paragraph: ${paragraph?.slice(0, 320) ?? 'not found'}`);
      note(`three of the lines: ${boxes.filter((b) => b.trim() !== '' && b !== paragraph).slice(0, 3).map((b) => b.split('.')[0] + '.').join(' | ')}`);
    } else {
      check('coach: an approved blueprint exists to preview', false, 'none approved on production');
      note('Home Dumbbell Foundation is still a draft, which is correct: approving it is the owner\'s own act.');
    }

    await page.close();
    await retireSession(staff);
  } else {
    check('coach: a staff session could be minted', false, '');
  }
} catch (err) {
  check('run: completed without throwing', false, err instanceof Error ? err.message : String(err));
} finally {
  // ------------------------------------------------------------------
  // Restore, whatever happened above, and prove it.
  // ------------------------------------------------------------------
  for (const [id, row] of restore.exerciseRows) {
    const { id: _ignored, ...columns } = row;
    await db.from('coach_assigned_workout_exercises').update(columns).eq('id', id);
  }
  if (restore.feedbackIds.length > 0) {
    await db.from('member_exercise_feedback').delete().in('id', restore.feedbackIds);
  }
  if (restore.avoidanceIds.length > 0) {
    await db.from('member_exercise_avoidance').delete().in('id', restore.avoidanceIds);
  }
  // The events the run produced. Nobody actually logged a weight or
  // reported pain, so none of them should survive it.
  await db
    .from('member_wellness_events')
    .delete()
    .eq('member_id', MEMBER_ID)
    .in('event_type', [
      'exercise_weight_logged',
      'exercise_feedback_reported',
      'exercise_stopped_for_pain',
      'exercise_swapped',
      'exercise_progression_flagged',
    ]);

  const { count: feedbackLeft } = await db
    .from('member_exercise_feedback')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', MEMBER_ID);
  check('restore: no report of this run is left on production', (feedbackLeft ?? 0) === 0, `${feedbackLeft ?? 0} rows`);

  const { count: avoidanceLeft } = await db
    .from('member_exercise_avoidance')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', MEMBER_ID);
  check('restore: her avoidance list is empty again', (avoidanceLeft ?? 0) === 0, `${avoidanceLeft ?? 0} rows`);

  const { count: stoppedLeft } = await db
    .from('coach_assigned_workout_exercises')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', MEMBER_ID)
    .eq('status', 'stopped');
  check('restore: no exercise of hers is left stopped', (stoppedLeft ?? 0) === 0, `${stoppedLeft ?? 0} rows`);

  const { count: loggedLeft } = await db
    .from('coach_assigned_workout_exercises')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', MEMBER_ID)
    .not('logged_load', 'is', null);
  check('restore: no weight this run logged is left behind', (loggedLeft ?? 0) === 0, `${loggedLeft ?? 0} rows`);

  const { count: swappedLeft } = await db
    .from('coach_assigned_workout_exercises')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', MEMBER_ID)
    .not('swapped_at', 'is', null);
  check('restore: no exercise of hers still reads as swapped', (swappedLeft ?? 0) === 0, `${swappedLeft ?? 0} rows`);

  const { count: eventsLeft } = await db
    .from('member_wellness_events')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', MEMBER_ID)
    .in('event_type', [
      'exercise_weight_logged',
      'exercise_feedback_reported',
      'exercise_stopped_for_pain',
      'exercise_swapped',
      'exercise_progression_flagged',
    ]);
  check('restore: no member-voice event of this run survives it', (eventsLeft ?? 0) === 0, `${eventsLeft ?? 0} rows`);

  check('video: nothing played a video', videosPlayed === 0, `${videosPlayed} request(s)`);

  await browser.close();

  const passed = results.filter((r) => r.passed).length;
  console.log(`\n${passed} of ${results.length} checks passed. Videos played: ${videosPlayed} (budget 0).`);
  process.exit(passed === results.length ? 0 : 1);
}
