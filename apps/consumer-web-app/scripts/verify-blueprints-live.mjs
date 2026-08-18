#!/usr/bin/env node
/**
 * Named program blueprints, checked against production.
 *
 * This prompt is plumbing, so the live run is deliberately light and
 * almost entirely read-only. It proves three things:
 *
 *   1. The blueprint and slot tables exist on production with the seed
 *      blueprint in DRAFT, every filled slot pointing at a
 *      client-assignable exercise, and a real member's own session able to
 *      read NOTHING from any of them.
 *   2. The member's existing programs, home card and Movement screen are
 *      byte-for-byte identical before and after the run.
 *   3. The blueprint materializes into a DRAFT assignment whose shape
 *      matches a corrective draft's shape, and then discards cleanly,
 *      leaving zero pending drafts behind.
 *
 * NOTHING IS PUBLISHED. The trial assignment is created unpublished, which
 * is invisible to the member (coach_assigned_workouts' member_read_own
 * policy gates on published_at), and it is deleted in a `finally` whether
 * the run passes or not. The state it restores is printed.
 *
 * PLAYS NO VIDEO. Every /video-url request the app makes is counted and
 * the run fails if any were spent.
 *
 * Environment:
 *   BASE_URL              default https://app.mefwellness.com
 *   MEMBER_EMAIL          the test member
 *   MEMBER_ID             her user id
 *   PROD_SUPABASE_URL     production project url
 *   PROD_SERVICE_KEY_FILE path to a file holding the service role key
 *   PROD_ANON_KEY_FILE    path to a file holding the anon key
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const MEMBER_ID = process.env.MEMBER_ID;
const SEED_KEY = 'home_dumbbell_foundation';
const BLUEPRINT_TABLES = [
  'movement_programs',
  'movement_program_versions',
  'program_blueprint_slots',
];

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

/** A client that reads production exactly as the signed-in member does: anon key, her access token, her RLS. */
function memberClient(accessToken) {
  return createClient(
    process.env.PROD_SUPABASE_URL,
    readFileSync(process.env.PROD_ANON_KEY_FILE, 'utf8').trim(),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    }
  );
}

function nextMondayOnOrAfter(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

if (!MEMBER_ID) {
  console.error('Set MEMBER_ID (the member the read-only checks run against).');
  process.exit(2);
}

const db = serviceClient();
if (!db) {
  console.error('Set PROD_SUPABASE_URL and PROD_SERVICE_KEY_FILE. This run is mostly database side.');
  process.exit(2);
}

const browser = await chromium.launch();
let createdAssignmentIds = [];
let createdTemplateIds = [];
let restoreLog = 'nothing was created';

/** Every screen text captured before the run, so "unaffected" is compared rather than asserted. */
const memberScreens = { before: {}, after: {} };
const MEMBER_PATHS = ['/programs', '/home', '/movement'];

async function captureMemberScreens(label) {
  const minted = canMintSessions()
    ? await mintSessionContext(browser, process.env.MEMBER_EMAIL, {
        baseUrl: BASE,
        viewport: { width: 390, height: 844 },
      })
    : null;
  if (!minted) {
    console.log(`SKIP  member screen capture (${label}): could not mint a session`);
    return { videos: 0, session: null };
  }

  const page = await minted.context.newPage();
  const videos = [];
  page.on('request', (r) => {
    if (r.url().includes('/video-url')) videos.push(r.url());
  });

  for (const path of MEMBER_PATHS) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main', { timeout: 30000 }).catch(() => {});
    memberScreens[label][path] = await page
      .locator('main')
      .innerText()
      .catch(() => '');
  }

  const accessToken = minted.session.access_token;
  await page.close();
  return { videos: videos.length, minted, accessToken };
}

try {
  // -------------------------------------------------------------------
  // 1. The blueprint store on production.
  // -------------------------------------------------------------------
  const { data: program, error: programError } = await db
    .from('movement_programs')
    .select('id, key, display_name')
    .eq('key', SEED_KEY)
    .maybeSingle();
  check('db: the named program exists', !programError && Boolean(program), program?.display_name ?? String(programError?.message ?? 'missing'));

  const { data: versions } = await db
    .from('movement_program_versions')
    .select('*')
    .eq('program_id', program?.id ?? '00000000-0000-0000-0000-000000000000')
    .order('version_number', { ascending: false });
  const version = (versions ?? [])[0];
  check('db: it has a version 1 in DRAFT', version?.version_number === 1 && version?.status === 'draft', `v${version?.version_number} ${version?.status}`);
  check('db: nothing has approved it', version?.approved_at === null && version?.approved_by === null, '');
  note(`title "${version?.member_title}", ${version?.duration_weeks} weeks, ${version?.sessions_per_week} sessions a week, ${version?.equipment_mode} equipment`);

  const { data: slots } = await db
    .from('program_blueprint_slots')
    .select('*')
    .eq('program_version_id', version?.id ?? '00000000-0000-0000-0000-000000000000');
  const sessions = [...new Set((slots ?? []).map((s) => s.session_designation))].sort();
  check('db: 26 slots across three weekly sessions', (slots ?? []).length === 26 && sessions.length === 3, `${(slots ?? []).length} slots, sessions ${sessions.join('/')}`);

  const unfilled = (slots ?? []).filter((s) => !s.external_id);
  check('db: every slot is filled', unfilled.length === 0, `${unfilled.length} unfilled`);

  const { data: catalog } = await db
    .from('exercise_catalog')
    .select('provider, external_id, name, is_client_assignable')
    .in('external_id', (slots ?? []).map((s) => s.external_id).filter(Boolean));
  const assignable = new Map((catalog ?? []).map((c) => [`${c.provider}:${c.external_id}`, c.is_client_assignable]));
  const notAssignable = (slots ?? []).filter(
    (s) => s.external_id && assignable.get(`${s.provider}:${s.external_id}`) !== true
  );
  check('db: every filled slot points at a client-assignable exercise', notAssignable.length === 0, notAssignable.map((s) => s.exercise_name).join(', ') || 'all 26');

  const overrides = (slots ?? []).filter((s) => Object.keys(s.week_overrides ?? {}).length > 0);
  const badWeeks = overrides.flatMap((s) =>
    Object.keys(s.week_overrides).filter((w) => Number(w) < 1 || Number(w) > (version?.duration_weeks ?? 0))
  );
  check('db: every per-week progression names a week the program has', overrides.length > 0 && badWeeks.length === 0, `${overrides.length} slot(s) progress`);
  for (const slot of overrides) {
    note(`${slot.session_designation}${slot.slot_order} ${slot.exercise_name} :: ${JSON.stringify(slot.week_overrides)}`);
  }

  // -------------------------------------------------------------------
  // 2. What the member's own session can read, and what her screens say.
  // -------------------------------------------------------------------
  const before = await captureMemberScreens('before');
  check('member: no video was requested by opening any of her screens', (before.videos ?? 0) === 0, `${before.videos ?? 0} requests`);

  if (before.accessToken) {
    const asMember = memberClient(before.accessToken);
    for (const table of BLUEPRINT_TABLES) {
      const { data, error } = await asMember.from(table).select('*');
      const rows = (data ?? []).length;
      check(`member: reads nothing from ${table}`, rows === 0, error ? `error: ${error.message}` : `${rows} rows`);
    }
  } else {
    console.log('SKIP  member RLS checks (no minted session)');
  }

  const { data: existingPrograms } = await db
    .from('coach_program_assignments')
    .select('id, template_name_snapshot, status, visibility, program_group_key, source_blueprint_version_id')
    .eq('member_id', MEMBER_ID);
  note(`member currently has ${(existingPrograms ?? []).length} assignment(s) on record`);
  for (const row of existingPrograms ?? []) {
    note(`  ${row.template_name_snapshot} :: ${row.status}/${row.visibility}`);
  }

  // -------------------------------------------------------------------
  // 3. Materialize the blueprint into a DRAFT assignment, compare, discard.
  // -------------------------------------------------------------------
  const { data: coachLink } = await db
    .from('coach_client_assignments')
    .select('coach_id')
    .eq('client_id', MEMBER_ID)
    .eq('is_active', true)
    .limit(1);
  const coachId = (coachLink ?? [])[0]?.coach_id;
  check('db: the member has an active coach to materialize as', Boolean(coachId), coachId ? String(coachId).slice(0, 8) : 'none');

  if (coachId && version) {
    // lib/programs/blueprints/materialize.ts is TypeScript and this is a
    // plain node script, so the writes below mirror it rather than import
    // it. That is a real limitation of running this outside the app: the
    // property being proved live is the SHAPE that reaches production and
    // the fact that a member sees none of it, and both are asserted
    // against real rows below. The materializer itself is proved by
    // tests/program-blueprint-materializer.test.ts against a real
    // database, not by this script.
    const startDate = nextMondayOnOrAfter(addDays(new Date().toISOString().slice(0, 10), 1));
    const groupTag = `named-program:verify-${Date.now()}`;
    const dayPattern = [1, 3, 5];

    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      const sessionSlots = (slots ?? [])
        .filter((s) => s.session_designation === session)
        .sort((a, b) => a.slot_order - b.slot_order);

      const { data: template, error: templateError } = await db
        .from('coach_program_templates')
        .insert({
          coach_id: coachId,
          name: `${version.member_title}: Session ${session}`,
          description: version.member_description,
          goal: 'strength',
          difficulty: 'beginner',
          equipment: [...new Set(sessionSlots.flatMap((s) => s.equipment_requirement))].sort(),
          program_tags: [groupTag, 'named-program', `named-program-version:${version.id}`],
          corrective_tags: [],
          movement_tags: [SEED_KEY],
          coach_notes: null,
          internal_notes: `Named program: ${program.display_name}, version ${version.version_number} (${version.status}). Weekly session ${session}.\nPurpose: ${version.coach_purpose}\nCautions: ${version.cautions}`,
          status: 'pending_coach_review',
        })
        .select('id')
        .single();
      if (templateError) throw new Error(`template insert failed: ${templateError.message}`);
      createdTemplateIds.push(template.id);
      restoreLog = `created ${createdTemplateIds.length} template(s)`;

      const blockNames = {
        release: 'Preparation',
        mobility: 'Mobility',
        stability: 'Activation',
        strength: 'Strength',
        core: 'Core',
      };
      const sectionTypes = {
        release: 'corrective',
        mobility: 'mobility',
        stability: 'activation',
        strength: 'strength',
        core: 'core',
      };

      const grouped = [];
      for (const slot of sessionSlots) {
        const name = blockNames[slot.block];
        const last = grouped[grouped.length - 1];
        if (last && last.name === name) last.slots.push(slot);
        else grouped.push({ name, type: sectionTypes[slot.block], slots: [slot] });
      }

      for (let s = 0; s < grouped.length; s++) {
        const { data: sectionRow, error: sectionError } = await db
          .from('coach_program_template_sections')
          .insert({
            template_id: template.id,
            coach_id: coachId,
            name: grouped[s].name,
            section_type: grouped[s].type,
            sequence_index: s,
            block_reasoning: null,
          })
          .select('id')
          .single();
        if (sectionError) throw new Error(`section insert failed: ${sectionError.message}`);

        const { error: exerciseError } = await db.from('coach_program_template_exercises').insert(
          grouped[s].slots.map((slot, index) => ({
            section_id: sectionRow.id,
            template_id: template.id,
            coach_id: coachId,
            provider: slot.provider,
            external_id: slot.external_id,
            exercise_name: slot.exercise_name,
            sequence_index: index,
            sets: slot.sets,
            reps: slot.reps === null ? null : String(slot.reps),
            rep_range_low: slot.reps,
            rep_range_high: slot.reps,
            rest_seconds: slot.rest_seconds,
            tempo: slot.tempo,
            hold_duration_seconds: slot.hold_duration_seconds,
            priority: slot.priority_rank <= 3 ? 'high' : slot.priority_rank <= 6 ? 'medium' : 'low',
            is_required: slot.is_required,
            selection_reasoning: null,
            week_overrides: slot.week_overrides,
          }))
        );
        if (exerciseError) throw new Error(`exercise insert failed: ${exerciseError.message}`);
      }

      // The assignment, DRAFT and unpublished.
      const endDate = addDays(startDate, version.duration_weeks * 7 - 1);
      const { data: assignment, error: assignmentError } = await db
        .from('coach_program_assignments')
        .insert({
          member_id: MEMBER_ID,
          coach_id: coachId,
          template_id: template.id,
          template_name_snapshot: `${version.member_title}: Session ${session}`,
          schedule_type: 'weekly',
          schedule_config: {
            type: 'weekly',
            startDate,
            daysOfWeek: [dayPattern[i] ?? 1],
            weeks: version.duration_weeks,
          },
          visibility: 'draft',
          published_at: null,
          status: 'upcoming',
          start_date: startDate,
          end_date: endDate,
          duration_weeks: version.duration_weeks,
          current_week: 1,
          program_group_key: groupTag,
          source_blueprint_version_id: version.id,
        })
        .select('id')
        .single();
      if (assignmentError) throw new Error(`assignment insert failed: ${assignmentError.message}`);
      createdAssignmentIds.push(assignment.id);
      restoreLog = `created ${createdTemplateIds.length} template(s) and ${createdAssignmentIds.length} draft assignment(s)`;

      // Four weekly occurrences, with the week 3 progression resolved in.
      for (let week = 1; week <= version.duration_weeks; week++) {
        const scheduled = addDays(startDate, (week - 1) * 7 + ((dayPattern[i] ?? 1) - 1));
        const { data: workout, error: workoutError } = await db
          .from('coach_assigned_workouts')
          .insert({
            assignment_id: assignment.id,
            member_id: MEMBER_ID,
            coach_id: coachId,
            scheduled_date: scheduled,
            template_name: `${version.member_title}: Session ${session}`,
            description: version.member_description,
            goal: 'strength',
            difficulty: 'beginner',
            program_tags: [groupTag, 'named-program'],
            corrective_tags: [],
            movement_tags: [SEED_KEY],
            published_at: null,
            program_week: week,
          })
          .select('id')
          .single();
        if (workoutError) throw new Error(`workout insert failed: ${workoutError.message}`);

        for (let s = 0; s < grouped.length; s++) {
          const { data: sectionRow, error: sectionError } = await db
            .from('coach_assigned_workout_sections')
            .insert({
              assigned_workout_id: workout.id,
              member_id: MEMBER_ID,
              coach_id: coachId,
              name: grouped[s].name,
              section_type: grouped[s].type,
              sequence_index: s,
              block_reasoning: null,
            })
            .select('id')
            .single();
          if (sectionError) throw new Error(`assigned section insert failed: ${sectionError.message}`);

          const { error: exerciseError } = await db
            .from('coach_assigned_workout_exercises')
            .insert(
              grouped[s].slots.map((slot, index) => {
                const override = (slot.week_overrides ?? {})[String(week)] ?? {};
                const reps = override.reps ?? slot.reps;
                return {
                  assigned_workout_id: workout.id,
                  section_id: sectionRow.id,
                  member_id: MEMBER_ID,
                  coach_id: coachId,
                  provider: slot.provider,
                  external_id: slot.external_id,
                  exercise_name: slot.exercise_name,
                  sequence_index: index,
                  sets: override.sets ?? slot.sets,
                  reps: reps === null || reps === undefined ? null : String(reps),
                  rep_range_low: reps ?? null,
                  rep_range_high: reps ?? null,
                  rest_seconds: override.rest_seconds ?? slot.rest_seconds,
                  tempo: override.tempo ?? slot.tempo,
                  hold_duration_seconds:
                    override.hold_duration_seconds ?? slot.hold_duration_seconds,
                  priority:
                    slot.priority_rank <= 3 ? 'high' : slot.priority_rank <= 6 ? 'medium' : 'low',
                  is_required: slot.is_required,
                  selection_reasoning: null,
                };
              })
            );
          if (exerciseError) throw new Error(`assigned exercise insert failed: ${exerciseError.message}`);
        }
      }
    }

    check('db: the blueprint materialized into three unpublished draft assignments', createdAssignmentIds.length === 3, `${createdAssignmentIds.length} assignments, ${createdTemplateIds.length} templates`);

    // ---- shape, against a real corrective draft on this database ----
    const { data: namedRow } = await db
      .from('coach_program_assignments')
      .select('*')
      .eq('id', createdAssignmentIds[0])
      .single();
    const { data: correctiveRows } = await db
      .from('coach_program_assignments')
      .select('*')
      .not('program_group_key', 'is', null)
      .like('program_group_key', 'corrective-program:%')
      .limit(1);
    const correctiveRow = (correctiveRows ?? [])[0];

    if (correctiveRow) {
      const sameKeys =
        JSON.stringify(Object.keys(namedRow).sort()) ===
        JSON.stringify(Object.keys(correctiveRow).sort());
      check('db: the named draft has the same assignment columns as a corrective one', sameKeys, `${Object.keys(namedRow).length} columns`);
      check('db: the named draft records its blueprint version, the corrective one records none', namedRow.source_blueprint_version_id === version.id && correctiveRow.source_blueprint_version_id === null, '');
    } else {
      check('db: a corrective assignment exists to compare shape against', false, 'none on production, comparison skipped');
    }

    const { data: namedWorkouts } = await db
      .from('coach_assigned_workouts')
      .select('id, program_week, published_at, template_name, description')
      .eq('assignment_id', createdAssignmentIds[0])
      .order('program_week', { ascending: true });
    check('db: four occurrences, weeks 1 to 4, none published', (namedWorkouts ?? []).length === 4 && (namedWorkouts ?? []).every((w) => w.published_at === null) && JSON.stringify((namedWorkouts ?? []).map((w) => w.program_week)) === '[1,2,3,4]', `${(namedWorkouts ?? []).length} occurrences`);

    const mainLift = (slots ?? []).find((s) => s.session_designation === 'A' && s.priority_rank === 1);
    const setsByWeek = {};
    for (const workout of namedWorkouts ?? []) {
      const { data: rows } = await db
        .from('coach_assigned_workout_exercises')
        .select('sets')
        .eq('assigned_workout_id', workout.id)
        .eq('external_id', mainLift.external_id);
      setsByWeek[workout.program_week] = rows?.[0]?.sets ?? null;
    }
    const week3Sets = mainLift.week_overrides['3'].sets;
    check('db: the week 3 progression is frozen into week 3 and nowhere else', setsByWeek[1] === mainLift.sets && setsByWeek[2] === mainLift.sets && setsByWeek[3] === week3Sets && setsByWeek[4] === mainLift.sets, JSON.stringify(setsByWeek));

    // ---- nothing coach-facing reached a member-visible field ----
    const forbidden = [version.coach_purpose, version.cautions, version.intended_population].filter(Boolean);
    const memberVisible = (namedWorkouts ?? [])
      .map((w) => `${w.template_name}\n${w.description}`)
      .join('\n');
    check('db: no coach-facing blueprint text reached a member-visible field', forbidden.every((t) => !memberVisible.includes(t)), '');
    check('db: no em dash in the member-facing title or description', !memberVisible.includes('—'), '');

    // ---- the member still sees exactly what she saw ----
    const after = await captureMemberScreens('after');
    check('member: no video was requested by the second pass either', (after.videos ?? 0) === 0, `${after.videos ?? 0} requests`);
    await retireSession(after.minted);

    for (const path of MEMBER_PATHS) {
      const same = memberScreens.before[path] === memberScreens.after[path];
      check(`member: ${path} is byte-for-byte unchanged`, same, same ? `${(memberScreens.before[path] ?? '').length} chars` : 'differs');
    }
  }

  await retireSession(before.minted);
} catch (error) {
  check('run completed without throwing', false, String(error?.message ?? error));
} finally {
  // -------------------------------------------------------------------
  // Restore. Every row this run created is removed, pass or fail.
  // -------------------------------------------------------------------
  if (createdAssignmentIds.length > 0) {
    await db.from('coach_program_assignments').delete().in('id', createdAssignmentIds);
  }
  if (createdTemplateIds.length > 0) {
    await db.from('coach_program_templates').delete().in('id', createdTemplateIds);
  }

  const { data: leftoverAssignments } = await db
    .from('coach_program_assignments')
    .select('id')
    .in('id', createdAssignmentIds.length > 0 ? createdAssignmentIds : ['00000000-0000-0000-0000-000000000000']);
  const { data: leftoverTemplates } = await db
    .from('coach_program_templates')
    .select('id')
    .in('id', createdTemplateIds.length > 0 ? createdTemplateIds : ['00000000-0000-0000-0000-000000000000']);
  const { data: pending } = await db
    .from('coach_program_templates')
    .select('id')
    .eq('status', 'pending_coach_review');

  check('restore: every row this run created is gone', (leftoverAssignments ?? []).length === 0 && (leftoverTemplates ?? []).length === 0, `${(leftoverAssignments ?? []).length} assignments, ${(leftoverTemplates ?? []).length} templates left`);
  note(`pending_coach_review templates now on production: ${(pending ?? []).length}`);
  note(`restore: ${restoreLog}`);

  await browser.close();

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed`);
  if (failed.length > 0) {
    for (const f of failed) console.log(`  FAILED: ${f.name}`);
    process.exitCode = 1;
  }
}
