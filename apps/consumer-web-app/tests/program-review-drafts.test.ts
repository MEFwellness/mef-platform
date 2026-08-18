/**
 * THE END-OF-PHASE REVIEW, against real local Supabase. No mocks.
 *
 * Server actions cannot be called from here (they use next/headers), so
 * these exercise the layer underneath them: the same pure transforms, the
 * same draft writer, the same data functions, and the RLS the database
 * enforces whatever the actions do.
 *
 * What this proves, in the order the prompt asked for it:
 *   1. Every outcome that builds a program produces an UNPUBLISHED draft,
 *      and zero assignments are published by any of them.
 *   2. Repeat changes nothing. Progress changes only the loads. Rotate
 *      changes only the exercises and never a locked one. Recovery is one
 *      week of Root recovery content.
 *   3. A coach's edited number wins over the suggestion, and a cleared
 *      field stays cleared.
 *   4. The member cannot see any of it, proved by reading as her.
 *   5. Avoidance release round trips both ways, and a released exercise
 *      becomes offerable again.
 *   6. Resolving a pain report clears the coach's flag and keeps the row.
 *
 * Everything works on its own throwaway program and cleans up after itself.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';
import { materializeProgram } from '../lib/programs/materialize';
import { assignMaterializedProgram } from '../lib/programs/blueprints/assign';
import {
  loadRecoverySlots,
  planForCurrentProgram,
  planForProgress,
  planForRecoveryWeek,
  planForRepeat,
  planForRotation,
  writeReviewDraft,
  type RotationPool,
} from '../lib/programs/review/drafts';
import { openReview, recordReviewOutcome, getOpenReview } from '../lib/programs/review/data';
import { releaseAvoidance, resolveFeedbackReport, loadProgramSignals } from '../lib/programs/signals/data';
import { loadAvoidedExternalIds } from '../lib/programs/feedback/candidates';
import { feedbackAttentionReasons } from '../lib/programs/feedback/attention';
import { suggestProgramLoads } from '../lib/programs/progression/suggest';
import type { ExerciseLoadSuggestion } from '../lib/programs/progression/suggest';
import type { SwapCandidate } from '../lib/programs/blueprints/swap';
import type { BlueprintBlock } from '@mef/shared-types-contracts';

const COACH = TEST_USERS.coachOne.id;
const MEMBER = TEST_USERS.memberOne.id;

const GROUP_KEY = 'test-phase-review-group';
const START = '2026-07-01';

let templateIds: string[] = [];
let assignmentIds: string[] = [];
/** Everything any test here created, torn down at the end. */
const createdTemplateIds: string[] = [];
const createdAssignmentIds: string[] = [];
const createdReviewIds: string[] = [];
const createdFeedbackIds: string[] = [];
const createdAvoidanceIds: string[] = [];

/** Two client-assignable strength exercises from the real catalog. */
let exerciseA: { provider: string; external_id: string; name: string };
let exerciseB: { provider: string; external_id: string; name: string };

beforeAll(async () => {
  const supabase = serviceRoleClient();

  const { data: catalog } = await supabase
    .from('exercise_catalog')
    .select('provider, external_id, name')
    .eq('is_client_assignable', true)
    .order('external_id', { ascending: true })
    .limit(2);
  exerciseA = catalog![0]!;
  exerciseB = catalog![1]!;

  const materialized = await materializeProgram(supabase, {
    coachId: COACH,
    status: 'pending_coach_review',
    sessions: [
      {
        templateMeta: {
          name: 'Phase Review Test: Session A',
          description: null,
          goal: 'strength',
          difficulty: 'beginner',
          estimatedDurationMinutes: null,
          equipment: ['dumbbell'],
          programTags: [GROUP_KEY],
          correctiveTags: [],
          movementTags: [],
          targetMuscles: [],
          coachNotes: null,
          internalNotes: null,
          memberInstructions: null,
        },
        sections: [
          {
            name: 'Strength',
            sectionType: 'strength',
            blockReasoning: null,
            exercises: [
              baseExercise(exerciseA, { isLocked: true }),
              baseExercise(exerciseB, { isLocked: false }),
            ],
          },
        ],
      },
    ],
  });
  templateIds = materialized.templateIds;
  createdTemplateIds.push(...templateIds);

  const assigned = await assignMaterializedProgram(supabase, {
    memberId: MEMBER,
    coachId: COACH,
    programGroupTag: GROUP_KEY,
    templateIds,
    startDate: START,
    durationWeeks: 4,
    today: '2026-08-01',
    timezone: 'America/New_York',
    publish: true,
    sourceBlueprintVersionId: null,
    memberExplanation: 'A short program for the review test.',
  });
  assignmentIds = assigned!.assignmentIds;
  createdAssignmentIds.push(...assignmentIds);
});

function baseExercise(
  exercise: { provider: string; external_id: string; name: string },
  options: { isLocked: boolean }
) {
  return {
    provider: exercise.provider,
    externalId: exercise.external_id,
    exerciseName: exercise.name,
    sets: 3,
    reps: '8',
    rep_range_low: 8,
    rep_range_high: 8,
    time_seconds: null,
    distance_meters: null,
    rest_seconds: 60,
    tempo: null,
    hold_duration_seconds: null,
    rpe: null,
    load: null,
    load_unit: null,
    resistance: null,
    band_color: null,
    side: null,
    unilateral: false,
    frequency: null,
    priority: 'medium' as const,
    is_required: true,
    notes: null,
    coaching_cues: null,
    pain_modification_notes: null,
    alternate_exercises: {},
    selectionReasoning: null,
    memberReasoning: 'This one builds the strength the rest of the week rests on.',
    isCoachOverride: false,
    weekOverrides: {},
    isLocked: options.isLocked,
  };
}

afterAll(async () => {
  const supabase = serviceRoleClient();
  if (createdReviewIds.length > 0) {
    await supabase.from('program_phase_reviews').delete().in('id', createdReviewIds);
  }
  await supabase.from('program_phase_reviews').delete().eq('member_id', MEMBER);
  if (createdAvoidanceIds.length > 0) {
    await supabase.from('member_exercise_avoidance').delete().in('id', createdAvoidanceIds);
  }
  if (createdFeedbackIds.length > 0) {
    await supabase.from('member_exercise_feedback').delete().in('id', createdFeedbackIds);
  }
  if (createdAssignmentIds.length > 0) {
    await supabase.from('coach_program_assignments').delete().in('id', createdAssignmentIds);
  }
  if (createdTemplateIds.length > 0) {
    await supabase.from('coach_program_templates').delete().in('id', createdTemplateIds);
  }
});

// ---------------------------------------------------------------------

describe('the plan a review starts from', () => {
  it('reads the current program back as a plan', async () => {
    const plan = await planForCurrentProgram(serviceRoleClient(), templateIds);
    expect(plan).toHaveLength(1);
    expect(plan[0]!.exercises).toHaveLength(2);
    expect(plan[0]!.exercises[0]!.isLocked).toBe(true);
    expect(plan[0]!.exercises[1]!.isLocked).toBe(false);
  });
});

describe('repeat changes nothing', () => {
  it('same exercises, same dosing, no template id carried across', async () => {
    const plan = await planForCurrentProgram(serviceRoleClient(), templateIds);
    const repeated = planForRepeat(plan);

    expect(repeated[0]!.templateId).toBeNull();
    expect(repeated[0]!.exercises.map((e) => e.externalId)).toEqual(
      plan[0]!.exercises.map((e) => e.externalId)
    );
    expect(repeated[0]!.exercises.map((e) => e.prescription)).toEqual(
      plan[0]!.exercises.map((e) => e.prescription)
    );
  });
});

describe('progress changes only the loads', () => {
  it('carries the suggestion onto the exercise and leaves every other number alone', async () => {
    const plan = await planForCurrentProgram(serviceRoleClient(), templateIds);
    const suggestion: ExerciseLoadSuggestion = {
      provider: exerciseB.provider,
      externalId: exerciseB.external_id,
      exerciseName: exerciseB.name,
      direction: 'increase',
      suggestedLoad: 25,
      unit: 'lbs',
      perSide: false,
      lastLoggedLoad: 22.5,
      reason: 'She said this one felt too easy.',
    };

    const progressed = planForProgress(plan, [suggestion], {});
    const changed = progressed[0]!.exercises.find((e) => e.externalId === exerciseB.external_id)!;
    const untouched = progressed[0]!.exercises.find((e) => e.externalId === exerciseA.external_id)!;

    expect(changed.prescription.load).toBe(25);
    expect(changed.prescription.loadUnit).toBe('lbs');
    expect(changed.prescription.sets).toBe(plan[0]!.exercises[1]!.prescription.sets);
    expect(changed.prescription.reps).toBe(plan[0]!.exercises[1]!.prescription.reps);
    // The exercise with no suggestion is not given one.
    expect(untouched.prescription.load).toBeNull();
  });

  it('the coach’s edited number wins over the suggestion', async () => {
    const plan = await planForCurrentProgram(serviceRoleClient(), templateIds);
    const suggestion: ExerciseLoadSuggestion = {
      provider: exerciseB.provider,
      externalId: exerciseB.external_id,
      exerciseName: exerciseB.name,
      direction: 'increase',
      suggestedLoad: 25,
      unit: 'lbs',
      perSide: false,
      lastLoggedLoad: 22.5,
      reason: 'She said this one felt too easy.',
    };

    const edited = planForProgress(plan, [suggestion], {
      [exerciseB.external_id]: { load: 30, unit: 'lbs' },
    });
    expect(
      edited[0]!.exercises.find((e) => e.externalId === exerciseB.external_id)!.prescription.load
    ).toBe(30);
  });

  it('a cleared field stays cleared and does not come back as the suggestion', async () => {
    const plan = await planForCurrentProgram(serviceRoleClient(), templateIds);
    const suggestion: ExerciseLoadSuggestion = {
      provider: exerciseB.provider,
      externalId: exerciseB.external_id,
      exerciseName: exerciseB.name,
      direction: 'increase',
      suggestedLoad: 25,
      unit: 'lbs',
      perSide: false,
      lastLoggedLoad: 22.5,
      reason: 'She said this one felt too easy.',
    };

    const cleared = planForProgress(plan, [suggestion], {
      [exerciseB.external_id]: null,
    });
    const exercise = cleared[0]!.exercises.find((e) => e.externalId === exerciseB.external_id)!;
    expect(exercise.prescription.load).toBeNull();
    expect(exercise.prescription.loadUnit).toBeNull();
  });
});

describe('rotate changes only the exercises', () => {
  function poolWith(candidates: SwapCandidate[], avoided: string[] = []): RotationPool {
    return {
      byBlock: new Map<BlueprintBlock, SwapCandidate[]>([['strength', candidates]]),
      avoidedExternalIds: new Set(avoided),
    };
  }

  it('replaces the unlocked exercise and never the locked one', async () => {
    const plan = await planForCurrentProgram(serviceRoleClient(), templateIds);
    const replacement: SwapCandidate = {
      provider: 'your_move',
      externalId: 'rotation-candidate',
      name: 'A Different Movement',
      isClientAssignable: true,
      block: 'strength',
      equipment: 'bodyweight',
      difficulty: 'beginner',
    };

    const { sessions, unchanged } = planForRotation(plan, poolWith([replacement]));
    const locked = sessions[0]!.exercises[0]!;
    const rotated = sessions[0]!.exercises[1]!;

    expect(locked.externalId).toBe(exerciseA.external_id);
    expect(unchanged).toContain(exerciseA.name);
    expect(rotated.externalId).toBe('rotation-candidate');
    // Dosing is untouched: the slot's job did not change.
    expect(rotated.prescription.sets).toBe(plan[0]!.exercises[1]!.prescription.sets);
    expect(rotated.prescription.reps).toBe(plan[0]!.exercises[1]!.prescription.reps);
    // A weight approved for a different movement does not travel with it.
    expect(rotated.prescription.load).toBeNull();
  });

  it('never offers anything on her avoidance list', async () => {
    const plan = await planForCurrentProgram(serviceRoleClient(), templateIds);
    const avoided: SwapCandidate = {
      provider: 'your_move',
      externalId: 'avoided-candidate',
      name: 'Something She Refused',
      isClientAssignable: true,
      block: 'strength',
      equipment: 'bodyweight',
      difficulty: 'beginner',
    };

    const { sessions, unchanged } = planForRotation(
      plan,
      poolWith([avoided], ['avoided-candidate'])
    );
    expect(sessions[0]!.exercises[1]!.externalId).toBe(exerciseB.external_id);
    expect(unchanged).toContain(exerciseB.name);
  });

  it('keeps the exercise when nothing qualifies, rather than shipping a gap', async () => {
    const plan = await planForCurrentProgram(serviceRoleClient(), templateIds);
    const { sessions, unchanged } = planForRotation(plan, poolWith([]));
    expect(sessions[0]!.exercises.map((e) => e.externalId)).toEqual([
      exerciseA.external_id,
      exerciseB.external_id,
    ]);
    expect(unchanged).toHaveLength(2);
  });
});

describe('a recovery week is Root recovery content', () => {
  it('reads the seeded recovery session and turns it into one unloaded week', async () => {
    const slots = await loadRecoverySlots(serviceRoleClient());
    expect(slots.length).toBeGreaterThan(0);

    const sessions = planForRecoveryWeek(slots);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.exercises.length).toBe(slots.length);
    for (const exercise of sessions[0]!.exercises) {
      expect(exercise.block).toBe('mobility');
      expect(exercise.prescription.load).toBeNull();
    }
  });
});

describe('every outcome produces a draft and publishes nothing', () => {
  const outcomes = ['repeat_phase', 'progress_next_phase', 'rotate_exercises', 'recovery_week'] as const;

  it.each(outcomes)('%s writes an unpublished assignment', async (outcome) => {
    const supabase = serviceRoleClient();
    const plan =
      outcome === 'recovery_week'
        ? planForRecoveryWeek(await loadRecoverySlots(supabase))
        : planForRepeat(await planForCurrentProgram(supabase, templateIds));

    const draft = await writeReviewDraft(supabase, {
      memberId: MEMBER,
      coachId: COACH,
      timezone: 'America/New_York',
      today: '2026-08-01',
      startDate: '2026-09-01',
      durationWeeks: outcome === 'recovery_week' ? 1 : 4,
      programTitle: `Draft for ${outcome}`,
      memberExplanation: null,
      sessions: plan,
      outcome,
      equipment: ['dumbbell'],
    });
    expect(draft).not.toBeNull();
    createdTemplateIds.push(...draft!.templateIds);
    createdAssignmentIds.push(...draft!.assignmentIds);

    const { data: rows } = await supabase
      .from('coach_program_assignments')
      .select('id, visibility, published_at, status')
      .in('id', draft!.assignmentIds);

    expect(rows).toHaveLength(draft!.assignmentIds.length);
    for (const row of rows!) {
      expect(row.visibility, outcome).toBe('draft');
      expect(row.published_at, outcome).toBeNull();
    }

    // And it superseded nothing: her current program is untouched.
    expect(draft!.replacedAssignmentIds).toEqual([]);
    const { data: current } = await supabase
      .from('coach_program_assignments')
      .select('status')
      .in('id', assignmentIds);
    for (const row of current!) {
      expect(row.status).not.toBe('replaced');
    }
  });

  it('the member cannot see a single one of the drafted occurrences', async () => {
    const supabase = serviceRoleClient();
    const draft = await writeReviewDraft(supabase, {
      memberId: MEMBER,
      coachId: COACH,
      timezone: 'America/New_York',
      today: '2026-08-01',
      startDate: '2026-10-01',
      durationWeeks: 4,
      programTitle: 'Invisible Draft',
      memberExplanation: null,
      sessions: planForRepeat(await planForCurrentProgram(supabase, templateIds)),
      outcome: 'repeat_phase',
      equipment: [],
    });
    createdTemplateIds.push(...draft!.templateIds);
    createdAssignmentIds.push(...draft!.assignmentIds);

    const asMember = await signInAs(TEST_USERS.memberOne);
    const { data: visible } = await asMember
      .from('coach_assigned_workouts')
      .select('id')
      .in('assignment_id', draft!.assignmentIds);
    expect(visible ?? []).toEqual([]);

    // And she cannot read the review record at all.
    const review = await openReview(supabase, {
      memberId: MEMBER,
      coachId: COACH,
      groupKey: `${GROUP_KEY}-invisible`,
      programName: 'Invisible Draft',
      openedEarly: true,
      signalSnapshot: {},
      recommendedOutcome: 'repeat_phase',
      recommendationReasoning: 'Because.',
    });
    createdReviewIds.push(review!.id);
    const { data: reviewRows } = await asMember.from('program_phase_reviews').select('id');
    expect(reviewRows ?? []).toEqual([]);
  });

  it('the member never reads a weight the coach has not approved', async () => {
    const supabase = serviceRoleClient();
    const suggestion: ExerciseLoadSuggestion = {
      provider: exerciseB.provider,
      externalId: exerciseB.external_id,
      exerciseName: exerciseB.name,
      direction: 'increase',
      suggestedLoad: 25,
      unit: 'lbs',
      perSide: false,
      lastLoggedLoad: 22.5,
      reason: 'She said this one felt too easy.',
    };
    const plan = await planForCurrentProgram(supabase, templateIds);
    const draft = await writeReviewDraft(supabase, {
      memberId: MEMBER,
      coachId: COACH,
      timezone: 'America/New_York',
      today: '2026-08-01',
      startDate: '2026-11-01',
      durationWeeks: 4,
      programTitle: 'Loaded Draft',
      memberExplanation: null,
      sessions: planForProgress(plan, [suggestion], {}),
      outcome: 'progress_next_phase',
      equipment: [],
    });
    createdTemplateIds.push(...draft!.templateIds);
    createdAssignmentIds.push(...draft!.assignmentIds);

    // The number IS on the drafted rows...
    const { data: drafted } = await supabase
      .from('coach_assigned_workout_exercises')
      .select('external_id, load, load_unit, assigned_workout_id')
      .eq('external_id', exerciseB.external_id)
      .in(
        'assigned_workout_id',
        (
          await supabase
            .from('coach_assigned_workouts')
            .select('id')
            .in('assignment_id', draft!.assignmentIds)
        ).data!.map((w) => w.id)
      );
    expect(drafted!.length).toBeGreaterThan(0);
    expect(drafted![0]!.load).toBe('25');
    expect(drafted![0]!.load_unit).toBe('lbs');

    // ...and she cannot read a single one of them.
    const asMember = await signInAs(TEST_USERS.memberOne);
    const { data: hers } = await asMember
      .from('coach_assigned_workout_exercises')
      .select('id')
      .in(
        'assigned_workout_id',
        drafted!.map((row) => row.assigned_workout_id)
      );
    expect(hers ?? []).toEqual([]);
  });
});

describe('avoidance release, both directions', () => {
  it('an active entry hides an exercise, and releasing it makes the exercise offerable again', async () => {
    const supabase = serviceRoleClient();
    const { data: inserted } = await supabase
      .from('member_exercise_avoidance')
      .insert({
        member_id: MEMBER,
        provider: exerciseB.provider,
        external_id: exerciseB.external_id,
        exercise_name: exerciseB.name,
        source: 'pain',
      })
      .select('*')
      .single();
    createdAvoidanceIds.push(inserted!.id);

    const asMember = await signInAs(TEST_USERS.memberOne);
    const before = await loadAvoidedExternalIds(asMember, MEMBER);
    expect(before).toContain(exerciseB.external_id);

    const released = await releaseAvoidance(supabase, {
      avoidanceId: inserted!.id,
      coachId: COACH,
    });
    expect(released!.released_at).not.toBeNull();
    expect(released!.released_by).toBe(COACH);

    const after = await loadAvoidedExternalIds(asMember, MEMBER);
    expect(after).not.toContain(exerciseB.external_id);

    // The row is still there. Released, never deleted.
    const { data: still } = await supabase
      .from('member_exercise_avoidance')
      .select('id, exercise_name')
      .eq('id', inserted!.id)
      .maybeSingle();
    expect(still!.exercise_name).toBe(exerciseB.name);
  });

  it('a coach may release, and a member of somebody else may not read it at all', async () => {
    const supabase = serviceRoleClient();
    const { data: inserted } = await supabase
      .from('member_exercise_avoidance')
      .insert({
        member_id: MEMBER,
        provider: 'your_move',
        external_id: 'rls-check-exercise',
        exercise_name: 'RLS Check',
        source: 'repeated_dislike',
      })
      .select('*')
      .single();
    createdAvoidanceIds.push(inserted!.id);

    const asCoach = await signInAs(TEST_USERS.coachOne);
    const releasedByCoach = await releaseAvoidance(asCoach, {
      avoidanceId: inserted!.id,
      coachId: COACH,
    });
    expect(releasedByCoach).not.toBeNull();

    const asOtherMember = await signInAs(TEST_USERS.memberTwo);
    const { data: leaked } = await asOtherMember
      .from('member_exercise_avoidance')
      .select('id')
      .eq('id', inserted!.id);
    expect(leaked ?? []).toEqual([]);
  });
});

describe('resolving a pain report', () => {
  it('clears the coach’s flag and keeps every word she wrote', async () => {
    const supabase = serviceRoleClient();
    const { data: inserted } = await supabase
      .from('member_exercise_feedback')
      .insert({
        member_id: MEMBER,
        coach_id: COACH,
        assignment_id: assignmentIds[0],
        program_group_key: GROUP_KEY,
        program_week: 2,
        provider: exerciseA.provider,
        external_id: exerciseA.external_id,
        exercise_name: exerciseA.name,
        reason: 'pain',
        other_text: 'my knee felt sharp on the way down',
        branch: 'safety',
        outcome: 'stopped_for_pain',
        coach_notified: true,
      })
      .select('*')
      .single();
    createdFeedbackIds.push(inserted!.id);

    // Before: the coach's needs-attention surface says so.
    expect(
      feedbackAttentionReasons([
        { member_id: MEMBER, branch: 'safety', coach_reviewed_at: null },
      ])
    ).toContain('Exercise stopped, member reported pain');

    const asCoach = await signInAs(TEST_USERS.coachOne);
    const resolved = await resolveFeedbackReport(asCoach, {
      feedbackId: inserted!.id,
      coachId: COACH,
      note: 'Spoke to her, swapping the pattern next phase.',
    });
    expect(resolved!.coach_reviewed_at).not.toBeNull();

    // After: the flag is gone.
    expect(
      feedbackAttentionReasons([
        { member_id: MEMBER, branch: 'safety', coach_reviewed_at: resolved!.coach_reviewed_at },
      ])
    ).toEqual([]);

    // And the record is untouched in every way that matters.
    const { data: after } = await supabase
      .from('member_exercise_feedback')
      .select('*')
      .eq('id', inserted!.id)
      .single();
    expect(after!.reason).toBe('pain');
    expect(after!.branch).toBe('safety');
    expect(after!.outcome).toBe('stopped_for_pain');
    expect(after!.other_text).toBe('my knee felt sharp on the way down');
    expect(after!.coach_review_note).toBe('Spoke to her, swapping the pattern next phase.');

    // Clean up so the signal tests below read a quiet program.
    await supabase.from('member_exercise_feedback').delete().eq('id', inserted!.id);
  });
});

describe('the signals read end to end from real rows', () => {
  it('sees the program, its occurrences and a logged weight', async () => {
    const supabase = serviceRoleClient();

    const { data: workouts } = await supabase
      .from('coach_assigned_workouts')
      .select('id')
      .in('assignment_id', assignmentIds)
      .order('scheduled_date', { ascending: true });

    const { data: rows } = await supabase
      .from('coach_assigned_workout_exercises')
      .select('id, assigned_workout_id')
      .eq('external_id', exerciseB.external_id)
      .in(
        'assigned_workout_id',
        workouts!.map((w) => w.id)
      )
      .order('assigned_workout_id', { ascending: true });

    await supabase
      .from('coach_assigned_workout_exercises')
      .update({
        logged_load: 20,
        logged_load_unit: 'lbs',
        logged_load_at: '2026-07-02T10:00:00Z',
        status: 'completed',
      })
      .eq('id', rows![0]!.id);
    await supabase
      .from('coach_assigned_workout_exercises')
      .update({
        logged_load: 22.5,
        logged_load_unit: 'lbs',
        logged_load_at: '2026-07-09T10:00:00Z',
        status: 'completed',
        difficulty_rating: 'easy',
      })
      .eq('id', rows![1]!.id);

    const asCoach = await signInAs(TEST_USERS.coachOne);
    const bundle = await loadProgramSignals(asCoach, {
      memberId: MEMBER,
      groupKey: GROUP_KEY,
      programName: 'Phase Review Test',
    });
    expect(bundle).not.toBeNull();
    expect(bundle!.signals.loadTrends).toHaveLength(1);
    expect(bundle!.signals.loadTrends[0]!.line).toBe('20 to 22.5 lbs');

    // And a suggestion appears for that exercise and for no other.
    const loads = suggestProgramLoads({
      signals: bundle!.signals,
      exercises: bundle!.exercises,
      periodization: 'linear',
    });
    expect(loads.suggestions.map((s) => s.externalId)).toEqual([exerciseB.external_id]);
    expect(loads.suggestions[0]!.suggestedLoad).toBe(25);
    expect(loads.noLoggedWeights).toBe(false);
  });
});

describe('one open review at a time', () => {
  it('opening twice returns the same review rather than starting a second', async () => {
    const supabase = serviceRoleClient();
    const first = await openReview(supabase, {
      memberId: MEMBER,
      coachId: COACH,
      groupKey: GROUP_KEY,
      programName: 'Phase Review Test',
      openedEarly: false,
      signalSnapshot: { completionPercent: 50 },
      recommendedOutcome: 'repeat_phase',
      recommendationReasoning: 'Half the sessions.',
    });
    createdReviewIds.push(first!.id);

    const second = await openReview(supabase, {
      memberId: MEMBER,
      coachId: COACH,
      groupKey: GROUP_KEY,
      programName: 'Phase Review Test',
      openedEarly: false,
      signalSnapshot: {},
      recommendedOutcome: 'progress_next_phase',
      recommendationReasoning: 'Different reasoning.',
    });
    expect(second!.id).toBe(first!.id);
    // The first recommendation stands. A second open does not rewrite it.
    expect(second!.recommended_outcome).toBe('repeat_phase');

    const recorded = await recordReviewOutcome(supabase, {
      reviewId: first!.id,
      outcome: 'repeat_phase',
      status: 'drafted',
      draftAssignmentIds: [],
      draftTemplateIds: [],
    });
    expect(recorded!.chosen_outcome).toBe('repeat_phase');
    expect(recorded!.chosen_at).not.toBeNull();

    // Once it is no longer open, a new one may be opened.
    expect(await getOpenReview(supabase, { memberId: MEMBER, groupKey: GROUP_KEY })).toBeNull();
  });
});
