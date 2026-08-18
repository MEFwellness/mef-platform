/**
 * One materializer, two callers — proven against real local Supabase, no
 * mocks.
 *
 * The claim this file exists to check is that a NAMED program and a
 * GENERATED corrective program are the same thing downstream. Not similar:
 * the same rows, the same columns filled, the same assignment pipeline,
 * the same frozen snapshot, the same lifecycle. If the two ever diverge,
 * one of them is going to reach a member in a shape nothing else in the
 * app expects, and this test is what fails first.
 *
 * It also proves the one thing a named program does that a corrective one
 * does not: a per-week progression, resolved into the frozen snapshot at
 * assignment time so week 3's rows say what week 3 prescribes.
 *
 * Nothing here is ever published. Every assignment is created as a draft,
 * which is invisible to a member (coach_assigned_workouts' member_read_own
 * policy gates on published_at), and every row is deleted afterwards.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { getBlueprintByKey } from '../lib/programs/blueprints/data';
import {
  BLUEPRINT_BLOCK_SECTION_NAME,
  materializeBlueprint,
  priorityForRank,
  slotToExercise,
} from '../lib/programs/blueprints/materialize';
import { assignBlueprintToMember, discardBlueprintDraft } from '../lib/programs/blueprints/assign';
import {
  applyWeekOverride,
  overrideForWeek,
  programWeekOf,
} from '../lib/programs/weekProgression';
import { getTemplateWithContent } from '../lib/coach-program-builder/templates';
import {
  createAssignment,
  getAssignmentLifecycle,
  pauseAssignment,
  resumeAssignment,
  replaceAssignment,
  applyLifecycleTransition,
} from '../lib/coach-program-builder/assignments';
import { getLatestCompletedPostureAssessment } from '../lib/corrective-engine/findings';
import { detectCorrectivePatterns } from '../lib/corrective-engine/patternMapping';
import { loadCorrectiveExercisePool } from '../lib/corrective-engine/exercisePool';
import { generateCorrectiveProgramDraft } from '../lib/corrective-engine/programGenerator';
import { saveCorrectiveProgramDraft } from '../lib/corrective-engine/save';
import { containsClinicalLanguage } from '../lib/programs/memberPresentation';
import { addDays, nextWeekdayOnOrAfter } from '../lib/program-lifecycle/transitions';
import type {
  BlueprintWithSlots,
  CoachProgramTemplateWithContent,
} from '@mef/shared-types-contracts';

const MEMBER = TEST_USERS.memberOne.id;
const COACH = TEST_USERS.coachOne.id;
const SEED_KEY = 'home_dumbbell_foundation';

const createdTemplateIds: string[] = [];
const createdAssignmentIds: string[] = [];
let createdAssessmentId: string | null = null;

let blueprint: BlueprintWithSlots;
/** Blueprint-born, assigned as an unpublished draft. */
let namedAssignmentIds: string[] = [];
let namedTemplateIds: string[] = [];
/** Corrective-born, assigned as an unpublished draft through the same createAssignment. */
let correctiveAssignmentIds: string[] = [];
let correctiveTemplateIds: string[] = [];

/**
 * The next Monday, because a weekly program's own day pattern starts on one
 * (lib/corrective-engine/approvalDefaults.ts) and a start date mid-week
 * would lose the first occurrence rather than generate four. TODAY is the
 * same day, so the program opens genuinely active and the real lifecycle
 * transitions can be run against it.
 */
const START_DATE = nextWeekdayOnOrAfter(new Date().toISOString().slice(0, 10), 1);
const TODAY = START_DATE;

beforeAll(async () => {
  const supabase = serviceRoleClient();

  const loaded = await getBlueprintByKey(supabase, SEED_KEY);
  if (!loaded) throw new Error('seed blueprint Home Dumbbell Foundation is missing');
  blueprint = loaded;

  // ---- the named program, as an unpublished draft assignment ----
  const assigned = await assignBlueprintToMember(supabase, {
    blueprint,
    coachId: COACH,
    memberId: MEMBER,
    startDate: START_DATE,
    today: TODAY,
    timezone: 'America/New_York',
    publish: false,
  });
  if (!assigned) throw new Error('assignBlueprintToMember returned null');
  namedAssignmentIds = assigned.assignmentIds;
  namedTemplateIds = assigned.templateIds;
  createdAssignmentIds.push(...assigned.assignmentIds);
  createdTemplateIds.push(...assigned.templateIds);

  // ---- the corrective program, through the same pipeline ----
  const { data: assessment } = await supabase
    .from('body_assessments')
    .insert({
      member_id: MEMBER,
      assessment_type: 'static_posture',
      status: 'analyzed',
      timezone: 'America/New_York',
      local_date: new Date().toISOString().slice(0, 10),
      completed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  createdAssessmentId = assessment!.id;

  await supabase.from('body_assessment_findings').insert({
    assessment_id: assessment!.id,
    member_id: MEMBER,
    finding_type: 'lower_crossed_pattern',
    severity: 'moderate',
    status: 'confirmed',
  });

  const latest = await getLatestCompletedPostureAssessment(supabase, MEMBER);
  const patterns = detectCorrectivePatterns(latest!.findings);
  const pool = await loadCorrectiveExercisePool(supabase);
  const draft = generateCorrectiveProgramDraft({
    patterns,
    daysPerWeek: 3,
    seed: 'materializer-equivalence',
    pool,
  });
  const saved = await saveCorrectiveProgramDraft(supabase, {
    draft,
    coachId: COACH,
    memberLabel: 'Test Member',
    memberId: MEMBER,
  });
  correctiveTemplateIds = saved.templateIds;
  createdTemplateIds.push(...saved.templateIds);

  for (const templateId of saved.templateIds) {
    const template = await getTemplateWithContent(supabase, templateId);
    const assignment = await createAssignment(supabase, {
      memberId: MEMBER,
      coachId: COACH,
      template: template as CoachProgramTemplateWithContent,
      scheduleType: 'weekly',
      scheduleConfig: { type: 'weekly', startDate: START_DATE, daysOfWeek: [1], weeks: 4 },
      assignmentNotes: null,
      internalNotes: null,
      publishImmediately: false,
      lifecycle: {
        startDate: START_DATE,
        durationWeeks: 4,
        programGroupKey: saved.programGroupTag,
        today: TODAY,
      },
    });
    if (!assignment) throw new Error('corrective createAssignment returned null');
    correctiveAssignmentIds.push(assignment.id);
    createdAssignmentIds.push(assignment.id);
  }
});

afterAll(async () => {
  const supabase = serviceRoleClient();
  if (createdAssignmentIds.length > 0) {
    await supabase
      .from('coach_program_assignments')
      .update({ replaced_by_assignment_id: null })
      .in('id', createdAssignmentIds);
    await supabase
      .from('member_wellness_events')
      .delete()
      .in('source_record_id', createdAssignmentIds);
    await supabase.from('coach_program_assignments').delete().in('id', createdAssignmentIds);
  }
  if (createdTemplateIds.length > 0) {
    await supabase.from('coach_program_templates').delete().in('id', createdTemplateIds);
  }
  if (createdAssessmentId) {
    await supabase.from('body_assessments').delete().eq('id', createdAssessmentId);
  }
});

// ---------------------------------------------------------------------------
// Pure: which week a date is in, and what an override does to a dose.
// ---------------------------------------------------------------------------
describe('per-week progression, as arithmetic', () => {
  it('counts weeks from the start date, inclusive', () => {
    expect(programWeekOf('2026-09-07', '2026-09-07')).toBe(1);
    expect(programWeekOf('2026-09-07', '2026-09-13')).toBe(1);
    expect(programWeekOf('2026-09-07', '2026-09-14')).toBe(2);
    expect(programWeekOf('2026-09-07', '2026-09-21')).toBe(3);
    expect(programWeekOf('2026-09-07', '2026-09-28')).toBe(4);
  });

  it('treats a date before the start as week 1 rather than week 0', () => {
    expect(programWeekOf('2026-09-07', '2026-09-01')).toBe(1);
  });

  it('finds an override only for the week it names', () => {
    const overrides = { '3': { sets: 4 } };
    expect(overrideForWeek(overrides, 3)).toEqual({ sets: 4 });
    expect(overrideForWeek(overrides, 2)).toBeNull();
    expect(overrideForWeek(overrides, 4)).toBeNull();
    expect(overrideForWeek({}, 3)).toBeNull();
    expect(overrideForWeek(null, 3)).toBeNull();
  });

  it('never interpolates: week 2 is week 1 until an override says otherwise', () => {
    const base = {
      sets: 3,
      reps: '10',
      rep_range_low: 10,
      rep_range_high: 10,
      hold_duration_seconds: null,
      tempo: '2-0-2',
      rest_seconds: 75,
    };
    expect(applyWeekOverride(base, overrideForWeek({ '3': { sets: 4 } }, 2))).toEqual(base);
  });

  it('applies only what the override names, and keeps the rep range with the rep count', () => {
    const base = {
      sets: 3,
      reps: '10',
      rep_range_low: 10,
      rep_range_high: 10,
      hold_duration_seconds: null,
      tempo: '2-0-2',
      rest_seconds: 75,
    };

    expect(applyWeekOverride(base, { sets: 4 })).toEqual({ ...base, sets: 4 });
    expect(applyWeekOverride(base, { reps: 12 })).toEqual({
      ...base,
      reps: '12',
      rep_range_low: 12,
      rep_range_high: 12,
    });
    expect(applyWeekOverride(base, { hold_duration_seconds: 40 })).toEqual({
      ...base,
      hold_duration_seconds: 40,
    });
  });
});

// ---------------------------------------------------------------------------
// A slot becomes an exercise.
// ---------------------------------------------------------------------------
describe('a blueprint slot becomes a prescribed exercise', () => {
  it('the slot wins wherever it has an opinion', () => {
    const slot = blueprint.slots.find((s) => s.exercise_name === 'Dumbbell Goblet Squat')!;
    const exercise = slotToExercise(slot)!;

    expect(exercise.sets).toBe(slot.sets);
    expect(exercise.reps).toBe(String(slot.reps));
    expect(exercise.tempo).toBe(slot.tempo);
    expect(exercise.rest_seconds).toBe(slot.rest_seconds);
    expect(exercise.externalId).toBe(slot.external_id);
    expect(exercise.weekOverrides).toEqual(slot.week_overrides);
  });

  it('the dosing table fills a gap the slot left', () => {
    const slot = blueprint.slots.find((s) => s.exercise_name === 'Dumbbell Goblet Squat')!;
    const sparse = { ...slot, sets: null, tempo: null, rest_seconds: null };
    const exercise = slotToExercise(sparse)!;

    // The strength column of lib/corrective-engine/dosing.ts at the
    // general-population tier, not an invented number.
    expect(exercise.sets).toBe(3);
    expect(exercise.tempo).toBe('2-0-2');
    expect(exercise.rest_seconds).toBe(60);
  });

  it('never turns a rep count into a rep count held for 30 seconds', () => {
    for (const slot of blueprint.slots) {
      const exercise = slotToExercise(slot)!;
      const hasReps = exercise.reps !== null;
      const hasHold = exercise.hold_duration_seconds !== null;
      expect(hasReps && hasHold, `${slot.session_designation}${slot.slot_order}`).toBe(false);
      expect(hasReps || hasHold, `${slot.session_designation}${slot.slot_order}`).toBe(true);
    }
  });

  it('carries the slot rank into the priority the prescription tables already have', () => {
    expect(priorityForRank(1)).toBe('high');
    expect(priorityForRank(3)).toBe('high');
    expect(priorityForRank(4)).toBe('medium');
    expect(priorityForRank(6)).toBe('medium');
    expect(priorityForRank(7)).toBe('low');
  });

  it('writes nothing coach-facing into a member-visible field', () => {
    for (const slot of blueprint.slots) {
      const exercise = slotToExercise(slot)!;
      expect(exercise.selectionReasoning).toBeNull();
      expect(exercise.notes).toBeNull();
      expect(exercise.pain_modification_notes).toBeNull();
    }
  });

  it('an unfilled slot produces no exercise at all', () => {
    const slot = blueprint.slots[0]!;
    expect(slotToExercise({ ...slot, external_id: null })).toBeNull();
    expect(slotToExercise({ ...slot, provider: null })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Equivalence.
// ---------------------------------------------------------------------------
describe('a named program and a corrective program are the same shape', () => {
  it('both land as pending_coach_review templates, one per weekly session', async () => {
    const supabase = serviceRoleClient();
    for (const ids of [namedTemplateIds, correctiveTemplateIds]) {
      expect(ids).toHaveLength(3);
      const { data } = await supabase
        .from('coach_program_templates')
        .select('status, coach_id')
        .in('id', ids);
      for (const row of data ?? []) {
        expect(row.status).toBe('pending_coach_review');
        expect(row.coach_id).toBe(COACH);
      }
    }
  });

  it('both hydrate into the same section and exercise structure', async () => {
    const supabase = serviceRoleClient();
    const named = await getTemplateWithContent(supabase, namedTemplateIds[0]!);
    const corrective = await getTemplateWithContent(supabase, correctiveTemplateIds[0]!);

    // Same keys on the template, on its sections, and on its exercises.
    expect(Object.keys(named!).sort()).toEqual(Object.keys(corrective!).sort());
    expect(Object.keys(named!.sections[0]!).sort()).toEqual(
      Object.keys(corrective!.sections[0]!).sort()
    );
    expect(Object.keys(named!.sections[0]!.exercises[0]!).sort()).toEqual(
      Object.keys(corrective!.sections[0]!.exercises[0]!).sort()
    );
  });

  it('every exercise on both carries a real prescription, never a bare name', async () => {
    const supabase = serviceRoleClient();
    for (const templateId of [...namedTemplateIds, ...correctiveTemplateIds]) {
      const template = await getTemplateWithContent(supabase, templateId);
      for (const section of template!.sections) {
        expect(section.exercises.length).toBeGreaterThan(0);
        for (const exercise of section.exercises) {
          expect(exercise.sets, `${template!.name} / ${exercise.exercise_name}`).toBeGreaterThan(0);
          const dosed = exercise.reps !== null || exercise.hold_duration_seconds !== null;
          expect(dosed, `${template!.name} / ${exercise.exercise_name}`).toBe(true);
          expect(exercise.rest_seconds).not.toBeNull();
        }
      }
    }
  });

  it('both produce the same assignment and frozen snapshot shape', async () => {
    const supabase = serviceRoleClient();

    const { data: named } = await supabase
      .from('coach_program_assignments')
      .select('*')
      .eq('id', namedAssignmentIds[0]!)
      .single();
    const { data: corrective } = await supabase
      .from('coach_program_assignments')
      .select('*')
      .eq('id', correctiveAssignmentIds[0]!)
      .single();

    expect(Object.keys(named!).sort()).toEqual(Object.keys(corrective!).sort());
    expect(named!.visibility).toBe(corrective!.visibility);
    expect(named!.status).toBe(corrective!.status);
    expect(named!.duration_weeks).toBe(corrective!.duration_weeks);
    expect(named!.schedule_type).toBe(corrective!.schedule_type);

    // Lineage is the one honest difference: a named program records the
    // blueprint version it came from and a corrective one has none.
    expect(named!.source_blueprint_version_id).toBe(blueprint.id);
    expect(corrective!.source_blueprint_version_id).toBeNull();

    for (const ids of [namedAssignmentIds, correctiveAssignmentIds]) {
      const { data: workouts } = await supabase
        .from('coach_assigned_workouts')
        .select('*')
        .eq('assignment_id', ids[0]!);
      // Four weekly occurrences, one a week, none of them published.
      expect(workouts).toHaveLength(4);
      for (const workout of workouts ?? []) {
        expect(workout.published_at).toBeNull();
        expect(workout.program_week).toBeGreaterThanOrEqual(1);
        expect(workout.program_week).toBeLessThanOrEqual(4);
      }
    }
  });

  it('a named program is not renamed after a postural pattern it does not have', async () => {
    const supabase = serviceRoleClient();
    const { data } = await supabase
      .from('coach_assigned_workouts')
      .select('template_name, corrective_tags, program_tags')
      .eq('assignment_id', namedAssignmentIds[0]!)
      .limit(1)
      .single();

    expect(data!.corrective_tags).toEqual([]);
    expect(data!.template_name).toContain('Home Dumbbell Foundation');
    expect(data!.program_tags).toContain('named-program');
  });
});

// ---------------------------------------------------------------------------
// The progression really lands in the right weeks.
// ---------------------------------------------------------------------------
describe('the week 3 progression lands in week 3 and nowhere else', () => {
  it('the main lift has one more set in week 3 than in weeks 1, 2 and 4', async () => {
    const supabase = serviceRoleClient();

    const { data: workouts } = await supabase
      .from('coach_assigned_workouts')
      .select('id, scheduled_date, program_week')
      .eq('assignment_id', namedAssignmentIds[0]!)
      .order('scheduled_date', { ascending: true });

    expect(workouts!.map((w) => w.program_week)).toEqual([1, 2, 3, 4]);

    const mainLift = blueprint.slots.find(
      (s) => s.session_designation === 'A' && s.priority_rank === 1
    )!;
    const baseSets = mainLift.sets!;
    const week3Sets = mainLift.week_overrides['3']!.sets!;
    expect(week3Sets).toBe(baseSets + 1);

    const setsByWeek: Record<number, number> = {};
    for (const workout of workouts ?? []) {
      const { data: rows } = await supabase
        .from('coach_assigned_workout_exercises')
        .select('sets, exercise_name')
        .eq('assigned_workout_id', workout.id)
        .eq('external_id', mainLift.external_id!);
      setsByWeek[workout.program_week as number] = rows![0]!.sets as number;
    }

    expect(setsByWeek).toEqual({ 1: baseSets, 2: baseSets, 3: week3Sets, 4: baseSets });
  });

  it('a hold that progresses in week 3 is longer only in week 3', async () => {
    const supabase = serviceRoleClient();
    const core = blueprint.slots.find(
      (s) => s.session_designation === 'A' && s.block === 'core' && s.week_overrides['3']
    )!;
    const baseHold = core.hold_duration_seconds!;
    const week3Hold = core.week_overrides['3']!.hold_duration_seconds!;

    const { data: workouts } = await supabase
      .from('coach_assigned_workouts')
      .select('id, program_week')
      .eq('assignment_id', namedAssignmentIds[0]!);

    for (const workout of workouts ?? []) {
      const { data: rows } = await supabase
        .from('coach_assigned_workout_exercises')
        .select('hold_duration_seconds')
        .eq('assigned_workout_id', workout.id)
        .eq('external_id', core.external_id!);
      expect(rows![0]!.hold_duration_seconds, `week ${workout.program_week}`).toBe(
        workout.program_week === 3 ? week3Hold : baseHold
      );
    }
  });

  it('a corrective program is still four identical weeks', async () => {
    const supabase = serviceRoleClient();
    const { data: workouts } = await supabase
      .from('coach_assigned_workouts')
      .select('id, program_week')
      .eq('assignment_id', correctiveAssignmentIds[0]!)
      .order('program_week', { ascending: true });

    const perWeek: string[] = [];
    for (const workout of workouts ?? []) {
      const { data: rows } = await supabase
        .from('coach_assigned_workout_exercises')
        .select('external_id, sets, reps, hold_duration_seconds, tempo, rest_seconds')
        .eq('assigned_workout_id', workout.id);
      // sequence_index is per section, so several rows share one, and the
      // database is free to return ties in any order. Sorted here on a key
      // that is actually unique within a workout, so this compares the
      // prescriptions rather than the row order.
      const sorted = (rows ?? [])
        .map((row) => JSON.stringify(row))
        .sort();
      perWeek.push(JSON.stringify(sorted));
    }

    expect(new Set(perWeek).size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The Prompt 3 lifecycle, on a blueprint-born program.
// ---------------------------------------------------------------------------
describe('a named program survives the whole lifecycle', () => {
  async function snapshot(assignmentId: string): Promise<string> {
    const supabase = serviceRoleClient();
    const { data: workouts } = await supabase
      .from('coach_assigned_workouts')
      .select('id, scheduled_date, program_week, template_name, description')
      .eq('assignment_id', assignmentId)
      .order('scheduled_date', { ascending: true });
    const { data: exercises } = await supabase
      .from('coach_assigned_workout_exercises')
      .select('exercise_name, sets, reps, hold_duration_seconds, tempo, rest_seconds, priority')
      .in('assigned_workout_id', (workouts ?? []).map((w) => w.id));
    // Sorted on the whole row: several rows share a name and a
    // sequence_index, and a tie can come back in any order, which would
    // make this compare row order instead of content.
    const stable = (exercises ?? []).map((row) => JSON.stringify(row)).sort();
    return JSON.stringify({ workouts, exercises: stable });
  }

  it('pauses, resumes, advances, completes and is replaced, without touching the snapshot', async () => {
    const supabase = serviceRoleClient();
    const assignmentId = namedAssignmentIds[0]!;
    const before = await snapshot(assignmentId);

    const beforePause = await getAssignmentLifecycle(supabase, assignmentId);

    expect(await pauseAssignment(supabase, assignmentId)).toBe(true);
    const paused = await getAssignmentLifecycle(supabase, assignmentId);
    expect(paused!.status).toBe('paused');

    // pauseAssignment stamps the real clock, so the hold is measured from
    // that day rather than from the fixture's start date.
    const heldFrom = paused!.paused_at!.slice(0, 10);
    const resumeOn = addDays(heldFrom, 7);
    expect(await resumeAssignment(supabase, assignmentId, resumeOn)).toBe(true);

    const resumed = await getAssignmentLifecycle(supabase, assignmentId);
    expect(resumed!.status).toBe('active');
    // Seven days held, seven days given back: the end date moves out by
    // exactly the days lost, so four weeks is still four weeks.
    expect(resumed!.paused_days).toBe(7);
    expect(resumed!.end_date).toBe(addDays(beforePause!.end_date!, 7));

    expect(
      await applyLifecycleTransition(supabase, assignmentId, { status: 'active', currentWeek: 2 })
    ).toBe(true);
    expect((await getAssignmentLifecycle(supabase, assignmentId))!.current_week).toBe(2);

    expect(
      await applyLifecycleTransition(supabase, assignmentId, {
        status: 'completed',
        currentWeek: 4,
        completedAt: true,
      })
    ).toBe(true);
    expect((await getAssignmentLifecycle(supabase, assignmentId))!.status).toBe('completed');

    // Replacing a completed program is refused, which is the same rule a
    // corrective program has.
    expect(await replaceAssignment(supabase, assignmentId, namedAssignmentIds[1]!)).toBe(true);
    expect((await getAssignmentLifecycle(supabase, assignmentId))!.status).toBe('completed');

    expect(await snapshot(assignmentId)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Nothing clinical, and nothing internal, reaches a member.
// ---------------------------------------------------------------------------
describe('what a member could read off a named program', () => {
  it('carries no clinical or internal vocabulary in any member-visible field', async () => {
    const supabase = serviceRoleClient();

    const { data: workouts } = await supabase
      .from('coach_assigned_workouts')
      .select('id, template_name, description, coach_notes, member_instructions, goal')
      .in('assignment_id', namedAssignmentIds);

    for (const workout of workouts ?? []) {
      for (const field of ['template_name', 'description', 'coach_notes', 'member_instructions', 'goal'] as const) {
        const value = workout[field] as string | null;
        expect(containsClinicalLanguage(value), `${field}: ${value}`).toBe(false);
      }
    }

    const workoutIds = (workouts ?? []).map((w) => w.id);

    const { data: sections } = await supabase
      .from('coach_assigned_workout_sections')
      .select('name, block_reasoning')
      .in('assigned_workout_id', workoutIds);
    for (const section of sections ?? []) {
      expect(containsClinicalLanguage(section.name), section.name).toBe(false);
      expect(section.block_reasoning).toBeNull();
      expect(Object.values(BLUEPRINT_BLOCK_SECTION_NAME)).toContain(section.name);
    }

    const { data: exercises } = await supabase
      .from('coach_assigned_workout_exercises')
      .select('exercise_name, coaching_cues, notes, pain_modification_notes, selection_reasoning')
      .in('assigned_workout_id', workoutIds);
    for (const exercise of exercises ?? []) {
      expect(containsClinicalLanguage(exercise.exercise_name), exercise.exercise_name).toBe(false);
      expect(containsClinicalLanguage(exercise.coaching_cues)).toBe(false);
      expect(exercise.selection_reasoning).toBeNull();
    }
  });

  it('never writes the coach-facing blueprint text anywhere a member reads', async () => {
    const supabase = serviceRoleClient();
    const coachOnly = [
      blueprint.coach_purpose,
      blueprint.intended_population,
      blueprint.cautions,
      ...blueprint.slots.map((s) => s.purpose),
    ].filter((t): t is string => typeof t === 'string' && t.length > 0);

    const { data: workouts } = await supabase
      .from('coach_assigned_workouts')
      .select('id, template_name, description, coach_notes, member_instructions, internal_notes')
      .in('assignment_id', namedAssignmentIds);

    for (const workout of workouts ?? []) {
      const memberVisible = [
        workout.template_name,
        workout.description,
        workout.coach_notes,
        workout.member_instructions,
      ]
        .filter((t): t is string => typeof t === 'string')
        .join('\n');
      for (const text of coachOnly) {
        expect(memberVisible.includes(text), text.slice(0, 50)).toBe(false);
      }
      // And it IS all in the coach-only field, which is where it belongs.
      expect(workout.internal_notes).toContain(blueprint.coach_purpose!);
      expect(workout.internal_notes).toContain(blueprint.cautions!);
    }
  });

  it('the authored title and description are used verbatim, with no em dashes', async () => {
    const supabase = serviceRoleClient();
    const { data: workouts } = await supabase
      .from('coach_assigned_workouts')
      .select('template_name, description')
      .in('assignment_id', namedAssignmentIds);

    for (const workout of workouts ?? []) {
      expect(workout.description).toBe(blueprint.member_description);
      expect(workout.template_name).toMatch(/^Home Dumbbell Foundation: Session [ABC]$/);
      expect(workout.description).not.toContain('—');
      expect(workout.template_name).not.toContain('—');
    }
    expect(blueprint.member_title).not.toContain('—');
  });
});

// ---------------------------------------------------------------------------
// Discarding.
// ---------------------------------------------------------------------------
describe('discarding a materialized draft', () => {
  it('removes the trial assignment and its templates, and leaves nothing pending', async () => {
    const supabase = serviceRoleClient();

    const trial = await materializeBlueprint(supabase, {
      blueprint,
      coachId: COACH,
      memberId: MEMBER,
    });
    expect(trial.templateIds).toHaveLength(3);

    const ok = await discardBlueprintDraft(supabase, {
      assignmentIds: [],
      templateIds: trial.templateIds,
    });
    expect(ok).toBe(true);

    const { data } = await supabase
      .from('coach_program_templates')
      .select('id')
      .in('id', trial.templateIds);
    expect(data).toEqual([]);
  });

  it('refuses to discard anything published', async () => {
    const supabase = serviceRoleClient();
    await supabase
      .from('coach_program_assignments')
      .update({ visibility: 'published' })
      .eq('id', namedAssignmentIds[2]!);

    const ok = await discardBlueprintDraft(supabase, {
      assignmentIds: [namedAssignmentIds[2]!],
      templateIds: [],
    });
    expect(ok).toBe(false);

    await supabase
      .from('coach_program_assignments')
      .update({ visibility: 'draft' })
      .eq('id', namedAssignmentIds[2]!);
  });
});
