/**
 * lib/your-move/generation.ts — turning a raw Your Move generate response
 * into an editable draft, and mapping every embedded exercise onto our
 * own exercise_catalog. Runs against real local Supabase (no mocks) per
 * this suite's own stated philosophy (tests/setup/test-clients.ts) —
 * these functions do real reads/writes, so a mocked client would prove
 * nothing about the actual insert/lookup behavior.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';
import {
  ensureCatalogRowForGeneratedExercise,
  generatedWorkoutToDraft,
  generatedProgramToDraft,
} from '../lib/your-move/generation';
import type { YourMoveGeneratedExercise, YourMoveGeneratedProgram, YourMoveGeneratedWorkout } from '../lib/your-move/apiClient';

const RUN_ID = Date.now();
const testIds: string[] = [];

function fakeExercise(overrides: Partial<YourMoveGeneratedExercise> = {}): YourMoveGeneratedExercise {
  return {
    id: `test-gen-${RUN_ID}-${Math.random().toString(36).slice(2)}`,
    title: 'Test Generated Exercise',
    slug: 'test-generated-exercise',
    muscleGroup: 'chest',
    equipment: 'dumbbell',
    difficulty: 'beginner',
    videoExcludedReason: 'browse_mode',
    ...overrides,
  };
}

async function cleanupCatalog() {
  if (testIds.length === 0) return;
  await serviceRoleClient().from('exercise_catalog').delete().in('external_id', testIds);
  testIds.length = 0;
}

describe('ensureCatalogRowForGeneratedExercise', () => {
  afterEach(cleanupCatalog);

  it('reuses an existing row by external_id — no new row is created', async () => {
    const externalId = `test-gen-existing-${RUN_ID}`;
    testIds.push(externalId);
    const supabase = serviceRoleClient();
    await supabase.from('exercise_catalog').insert({
      provider: 'your_move',
      external_id: externalId,
      name: 'Existing Catalog Exercise',
      has_video: true,
    });

    const { count: before } = await supabase.from('exercise_catalog').select('*', { count: 'exact', head: true });

    const resolved = await ensureCatalogRowForGeneratedExercise(
      supabase,
      fakeExercise({ id: externalId, title: 'Existing Catalog Exercise (renamed at the vendor)' })
    );

    const { count: after } = await supabase.from('exercise_catalog').select('*', { count: 'exact', head: true });
    expect(after).toBe(before);
    expect(resolved.externalId).toBe(externalId);
    expect(resolved.name).toBe('Existing Catalog Exercise');
  });

  it('reuses an existing row via normalized-name match when the external_id differs — never reintroduces a merged-away duplicate', async () => {
    const keeperExternalId = `test-gen-keeper-${RUN_ID}`;
    const discardedExternalId = `test-gen-discarded-${RUN_ID}`;
    // Uniquely suffixed per test run — a fixed literal name like "Guard
    // Test Squat" risks colliding with another suite's own fixture data
    // (tests/exercise-catalog-no-duplicate-names.test.ts uses exactly
    // that name) or with a prior failed run's leftover row.
    const keeperName = `Guard Test Squat ${RUN_ID}`;
    const variantTitle = `guard  test squat! ${RUN_ID}`;
    testIds.push(keeperExternalId, discardedExternalId);
    const supabase = serviceRoleClient();
    await supabase.from('exercise_catalog').insert({
      provider: 'your_move',
      external_id: keeperExternalId,
      name: keeperName,
    });

    const { count: before } = await supabase.from('exercise_catalog').select('*', { count: 'exact', head: true });

    // Same normalized name (spacing/casing/punctuation variant), a
    // DIFFERENT external_id — simulates a Your Move id that migration
    // 121's dedupe already merged away under the keeper's id.
    const resolved = await ensureCatalogRowForGeneratedExercise(
      supabase,
      fakeExercise({ id: discardedExternalId, title: variantTitle })
    );

    const { count: after } = await supabase.from('exercise_catalog').select('*', { count: 'exact', head: true });
    expect(after).toBe(before); // no new row inserted
    expect(resolved.externalId).toBe(keeperExternalId); // repointed to the keeper, not the discarded id
  });

  it('inserts a genuinely new row with has_video forced false, as a coach session (RLS allows it)', async () => {
    const externalId = `test-gen-new-${RUN_ID}`;
    testIds.push(externalId);
    const coachClient = await signInAs(TEST_USERS.coachOne);

    const resolved = await ensureCatalogRowForGeneratedExercise(
      coachClient,
      fakeExercise({
        id: externalId,
        title: 'Brand New Generated Exercise',
        description: 'A description from the generate response',
        instructions: ['Step one', 'Step two'],
        muscleGroup: 'back',
        equipment: 'cable',
        difficulty: 'advanced',
      })
    );

    expect(resolved.externalId).toBe(externalId);
    expect(resolved.name).toBe('Brand New Generated Exercise');

    const row = await serviceRoleClient()
      .from('exercise_catalog')
      .select('*')
      .eq('external_id', externalId)
      .single();
    expect(row.data?.description).toBe('A description from the generate response');
    expect(row.data?.instructions).toEqual(['Step one', 'Step two']);
    expect(row.data?.primary_muscle).toBe('back');
    expect(row.data?.equipment).toBe('cable');
    expect(row.data?.difficulty).toBe('advanced');
    // Never guessed true — see this function's own doc comment for why.
    expect(row.data?.has_video).toBe(false);
    expect(row.data?.has_video_white).toBe(false);
    expect(row.data?.has_video_gym).toBe(false);
  });

  it('a member session cannot insert a new catalog row (RLS is the real boundary, not just the action-level coach check)', async () => {
    const externalId = `test-gen-member-blocked-${RUN_ID}`;
    testIds.push(externalId);
    const memberClient = await signInAs(TEST_USERS.memberOne);

    await expect(
      ensureCatalogRowForGeneratedExercise(memberClient, fakeExercise({ id: externalId, title: 'Member Blocked Exercise' }))
    ).rejects.toThrow();

    const { data } = await serviceRoleClient().from('exercise_catalog').select('id').eq('external_id', externalId).maybeSingle();
    expect(data).toBeNull();
  });
});

describe('generatedWorkoutToDraft', () => {
  afterEach(cleanupCatalog);

  it('builds Warm Up / main / Cooldown sections in order, omitting an empty cooldown', async () => {
    const supabase = serviceRoleClient();
    const warmupId = `test-gen-workout-warmup-${RUN_ID}`;
    const mainId = `test-gen-workout-main-${RUN_ID}`;
    testIds.push(warmupId, mainId);

    const workout: YourMoveGeneratedWorkout = {
      name: 'Test Chest Workout',
      muscleGroup: 'chest',
      muscleGroups: ['chest'],
      muscleGroupsRequested: ['chest'],
      difficulty: 'beginner',
      estimatedMinutes: 30,
      exerciseCount: 1,
      exercises: [
        { exercise: fakeExercise({ id: mainId, title: 'Main Exercise' }), sets: 3, reps: '10-12', restSeconds: 60, order: 1 },
      ],
      warmup: [
        { exercise: fakeExercise({ id: warmupId, title: 'Warmup Exercise' }), sets: 1, reps: '30 seconds', restSeconds: 15, order: 1 },
      ],
      cooldown: [],
    };

    const draft = await generatedWorkoutToDraft(supabase, workout);

    expect(draft.name).toBe('Test Chest Workout');
    expect(draft.difficulty).toBe('beginner');
    expect(draft.estimatedDurationMinutes).toBe(30);
    expect(draft.sections.map((s) => s.name)).toEqual(['Warm Up', 'Main Set']);
    expect(draft.sections[0]!.exercises[0]!.exerciseName).toBe('Warmup Exercise');
    expect(draft.sections[1]!.exercises[0]!).toMatchObject({ exerciseName: 'Main Exercise', sets: 3, reps: '10-12', rest_seconds: 60 });
  });
});

describe('generatedProgramToDraft', () => {
  afterEach(cleanupCatalog);

  it('trusts the caller-requested week count, never the vendor-echoed one', async () => {
    const supabase = serviceRoleClient();
    const dayExerciseId = `test-gen-program-day-${RUN_ID}`;
    testIds.push(dayExerciseId);

    const program: YourMoveGeneratedProgram = {
      name: 'Test Split',
      goal: 'strength',
      difficulty: 'intermediate',
      daysPerWeek: 1,
      // Deliberately different from the requested week count below — the
      // real vendor always returns 4 regardless of what's asked (see
      // apiClient's own doc comment); this proves the draft never trusts it.
      weeks: 4,
      split: 'Test Split',
      weeklySchedule: [
        {
          day: 1,
          name: 'Day A',
          muscleGroup: 'chest',
          muscleGroups: ['chest'],
          exercises: [
            { exercise: fakeExercise({ id: dayExerciseId, title: 'Day A Exercise' }), sets: 5, reps: '3-5', restSeconds: 120 },
          ],
          warmup: [],
          cooldown: [],
        },
      ],
      notes: 'Repeat this weekly schedule for 4 weeks.',
    };

    const draft = await generatedProgramToDraft(supabase, program, 6);

    expect(draft.weeks).toBe(6);
    expect(draft.days).toHaveLength(1);
    expect(draft.days[0]!.dayLabel).toBe('Day A');
    expect(draft.days[0]!.sections.map((s) => s.name)).toEqual(['Main Set']); // no warmup/cooldown given
    expect(draft.days[0]!.sections[0]!.exercises[0]!).toMatchObject({ exerciseName: 'Day A Exercise', sets: 5, reps: '3-5' });
  });
});
