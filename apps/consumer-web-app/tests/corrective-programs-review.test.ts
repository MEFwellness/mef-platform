/**
 * Guard tests for the Corrective Programs coach review screen — the layer
 * above the generator engine itself (already covered by
 * tests/corrective-engine-*.test.ts). Proves, against real local Supabase
 * (no mocks), the specific invariants the task asked for:
 *
 *   1. A member with no completed posture assessment gets a clean "nothing
 *      to generate from" result, never a generated program.
 *   2. A pending_coach_review draft is invisible to the member it's for —
 *      no assignment, no assigned-workout row, RLS blocks a direct read.
 *   3. Approve & Assign makes the program visible to that member only —
 *      RLS blocks a different signed-in member from reading it, even by
 *      row id.
 *   4. The default swap/add picker (qualifiesForBlock,
 *      lib/corrective-engine/blockQualification.ts) never offers an
 *      exercise that violates a block's engine rules — proven two ways:
 *      real generated programs never contain a exercise that fails its own
 *      block's qualification check (drift-proof between the generator and
 *      this re-derived predicate), and hand-built fixtures pin the exact
 *      negative rules (wrong role, and the documented "stretches a LONG
 *      muscle too" cross-contamination case).
 *   5. A full-library override pick is stored with is_coach_override=true;
 *      every engine-generated pick defaults to false.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';
import { getLatestCompletedPostureAssessment } from '../lib/corrective-engine/findings';
import { detectCorrectivePatterns } from '../lib/corrective-engine/patternMapping';
import { loadCorrectiveExercisePool } from '../lib/corrective-engine/exercisePool';
import { generateCorrectiveProgramDraft } from '../lib/corrective-engine/programGenerator';
import { saveCorrectiveProgramDraft } from '../lib/corrective-engine/save';
import { qualifiesForBlock } from '../lib/corrective-engine/blockQualification';
import {
  listCorrectiveDraftGroupsForMember,
  approveCorrectiveDraftGroup,
} from '../lib/corrective-engine/review';
import {
  createTemplate,
  replaceTemplateContent,
  getTemplateWithContent,
  deleteTemplate,
} from '../lib/coach-program-builder/templates';
import type { CorrectiveExercise, DetectedPattern } from '../lib/corrective-engine/types';

const createdAssessmentIds: string[] = [];
const createdTemplateIds: string[] = [];
const createdAssignmentIds: string[] = [];

afterAll(async () => {
  const supabase = serviceRoleClient();
  if (createdAssignmentIds.length > 0) {
    await supabase.from('coach_program_assignments').delete().in('id', createdAssignmentIds);
  }
  if (createdTemplateIds.length > 0) {
    await supabase.from('coach_program_templates').delete().in('id', createdTemplateIds);
  }
  if (createdAssessmentIds.length > 0) {
    await supabase.from('body_assessments').delete().in('id', createdAssessmentIds);
  }
});

/** Seeds one real confirmed lower_crossed_pattern finding and generates+saves a real draft from it — the same pipeline app/actions/corrective-programs.ts's generateCorrectiveProgramDraftAction runs. */
async function seedLowerCrossDraft(memberId: string, coachId: string, seedSuffix: string) {
  const supabase = serviceRoleClient();
  const { data: assessment, error: assessmentError } = await supabase
    .from('body_assessments')
    .insert({
      member_id: memberId,
      assessment_type: 'static_posture',
      status: 'analyzed',
      timezone: 'America/New_York',
      local_date: new Date().toISOString().slice(0, 10),
      completed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  expect(assessmentError).toBeNull();
  createdAssessmentIds.push(assessment!.id);

  const { error: findingError } = await supabase.from('body_assessment_findings').insert({
    assessment_id: assessment!.id,
    member_id: memberId,
    finding_type: 'lower_crossed_pattern',
    severity: 'moderate',
    status: 'confirmed',
  });
  expect(findingError).toBeNull();

  const latest = await getLatestCompletedPostureAssessment(supabase, memberId);
  const patterns = detectCorrectivePatterns(latest!.findings);
  const pool = await loadCorrectiveExercisePool(supabase);
  const draft = generateCorrectiveProgramDraft({
    patterns,
    daysPerWeek: 2,
    seed: `review-test:${seedSuffix}`,
    pool,
  });
  const saved = await saveCorrectiveProgramDraft(supabase, {
    draft,
    coachId,
    memberId,
    memberLabel: 'Test Member',
  });
  createdTemplateIds.push(...saved.templateIds);
  return { assessmentId: assessment!.id, saved, patterns, pool };
}

describe('Corrective Programs — empty state', () => {
  it('a member with no completed posture assessment yields no assessment to generate from', async () => {
    const supabase = serviceRoleClient();
    // A random, never-seeded id — no body_assessments row can match it, so
    // this proves the "nothing to generate from" path without depending on
    // any particular seeded test user's current assessment history.
    const memberWithNoAssessment = crypto.randomUUID();
    const latest = await getLatestCompletedPostureAssessment(supabase, memberWithNoAssessment);
    expect(latest).toBeNull();
  });
});

describe('Corrective Programs — drafts are invisible to members', () => {
  it('a pending_coach_review draft has no assignment and cannot be read by the member it is for', async () => {
    const memberId = TEST_USERS.memberOne.id;
    const coachId = TEST_USERS.coachOne.id;
    const { saved } = await seedLowerCrossDraft(memberId, coachId, 'invisible');

    const supabase = serviceRoleClient();
    const { data: templates } = await supabase
      .from('coach_program_templates')
      .select('status')
      .in('id', saved.templateIds);
    for (const t of templates!) expect(t.status).toBe('pending_coach_review');

    const { count: assignmentCount } = await supabase
      .from('coach_program_assignments')
      .select('*', { count: 'exact', head: true })
      .in('template_id', saved.templateIds);
    expect(assignmentCount).toBe(0);

    // The member it's for cannot read the draft template rows directly —
    // coach_program_templates has no member SELECT policy at all.
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const { data: memberRead, error: memberReadError } = await memberClient
      .from('coach_program_templates')
      .select('id')
      .in('id', saved.templateIds);
    expect(memberReadError).toBeNull();
    expect(memberRead).toEqual([]);
  });
});

describe('Corrective Programs — Approve & Assign scopes to one member only', () => {
  it('approving makes the program visible to the assigned member and status becomes active, invisible to a different member', async () => {
    const memberId = TEST_USERS.memberOne.id;
    const otherMemberId = TEST_USERS.memberTwo.id;
    const coachId = TEST_USERS.coachOne.id;
    const { saved } = await seedLowerCrossDraft(memberId, coachId, 'approve-scope');

    const coachClient = await signInAs(TEST_USERS.coachOne);
    const approved = await approveCorrectiveDraftGroup(coachClient, {
      coachId,
      memberId,
      programGroupTag: saved.programGroupTag,
      startDate: '2026-08-03', // a Monday
    });
    expect(approved).not.toBeNull();
    createdAssignmentIds.push(...approved!.assignmentIds);

    const supabase = serviceRoleClient();
    const { data: templatesAfter } = await supabase
      .from('coach_program_templates')
      .select('status')
      .in('id', saved.templateIds);
    for (const t of templatesAfter!) expect(t.status).toBe('active');

    // No longer shows up as a pending draft.
    const remainingDrafts = await listCorrectiveDraftGroupsForMember(supabase, coachId, memberId);
    expect(remainingDrafts.some((g) => g.programGroupTag === saved.programGroupTag)).toBe(false);

    // The assigned member sees real, published assigned-workout rows.
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const { data: memberWorkouts, error: memberWorkoutsError } = await memberClient
      .from('coach_assigned_workouts')
      .select('id, published_at, corrective_tags')
      .in('assignment_id', approved!.assignmentIds);
    expect(memberWorkoutsError).toBeNull();
    expect(memberWorkouts!.length).toBeGreaterThan(0);
    for (const w of memberWorkouts!) {
      expect(w.published_at).not.toBeNull();
      expect(w.corrective_tags).toContain('lower_cross');
    }

    // A different member cannot read memberOne's assigned workouts, even
    // filtering explicitly by memberOne's id — RLS (member_read_own), not
    // the query's own member_id filter, is what's actually being proven.
    const otherMemberClient = await signInAs(TEST_USERS.memberTwo);
    const { data: crossRead, error: crossReadError } = await otherMemberClient
      .from('coach_assigned_workouts')
      .select('id')
      .eq('member_id', memberId);
    expect(crossReadError).toBeNull();
    expect(crossRead).toEqual([]);

    // Sanity: otherMemberId was never touched by this approval at all.
    const { count: otherMemberAssignmentCount } = await supabase
      .from('coach_program_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('member_id', otherMemberId)
      .in('id', approved!.assignmentIds);
    expect(otherMemberAssignmentCount).toBe(0);
  });
});

describe('Corrective Programs — default swap/add picker qualification (qualifiesForBlock)', () => {
  it('every exercise a real generation run places in a block satisfies that block’s qualification rule (drift-proof vs. the generator)', async () => {
    const supabase = serviceRoleClient();
    const pool = await loadCorrectiveExercisePool(supabase);
    const poolByExternalId = new Map(pool.map((e) => [e.externalId, e]));

    const scenarios: DetectedPattern[][] = [
      [{ blueprint: 'lower_cross', severity: 'moderate', supportingFindingIds: [] }],
      [
        { blueprint: 'upper_cross', severity: 'severe', supportingFindingIds: [] },
        { blueprint: 'forward_head', severity: 'severe', supportingFindingIds: [] },
      ],
      [{ blueprint: 'flat_back', severity: 'mild', supportingFindingIds: [] }],
    ];

    for (const patterns of scenarios) {
      const draft = generateCorrectiveProgramDraft({
        patterns,
        daysPerWeek: 3,
        seed: `qualify-drift:${patterns.map((p) => p.blueprint).join('+')}`,
        pool,
      });
      for (const session of draft.weeklySessions) {
        for (const block of session.blocks) {
          for (const placed of block.exercises) {
            const fullExercise = poolByExternalId.get(placed.externalId);
            expect(fullExercise, `pool should contain ${placed.externalId}`).toBeDefined();
            expect(
              qualifiesForBlock(fullExercise!, block.block, patterns),
              `${placed.exerciseName} in ${block.block} (${patterns.map((p) => p.blueprint).join('+')})`
            ).toBe(true);
          }
        }
      }
    }
  });

  const lowerCrossPatterns: DetectedPattern[] = [
    { blueprint: 'lower_cross', severity: 'moderate', supportingFindingIds: [] },
  ];

  function fixture(overrides: Partial<CorrectiveExercise>): CorrectiveExercise {
    return {
      provider: 'mef_custom',
      externalId: 'fixture',
      name: 'Fixture Exercise',
      correctiveRoles: [],
      musclesStretched: [],
      musclesStrengthened: [],
      strainLevel: 'low',
      spinalFlexionCore: false,
      equipment: [],
      coachingCues: [],
      ...overrides,
    };
  }

  it('rejects a candidate whose role does not match the block, even if the muscle matches', () => {
    const wrongRole = fixture({ correctiveRoles: ['strength'], musclesStretched: ['hip flexors'] });
    expect(qualifiesForBlock(wrongRole, 'release', lowerCrossPatterns)).toBe(false);
    expect(qualifiesForBlock(wrongRole, 'mobility', lowerCrossPatterns)).toBe(false);
  });

  it('rejects a stretch/mobility candidate that also stretches a LONG muscle of an active pattern (the documented cross-contamination rule)', () => {
    // 'hip flexors' is a lower_cross TIGHT slot (valid on its own); 'glutes'
    // is a lower_cross LONG slot — this exercise legitimately matches the
    // Mobility slot via hip flexors, but must still be rejected because it
    // also stretches glutes. Same rule sessionBuilder.ts's own guard test
    // caught a real bug on (see save.ts/sessionBuilder.ts history).
    const contaminated = fixture({
      correctiveRoles: ['stretch'],
      musclesStretched: ['hip flexors', 'glutes'],
    });
    expect(qualifiesForBlock(contaminated, 'mobility', lowerCrossPatterns)).toBe(false);

    const clean = fixture({ correctiveRoles: ['stretch'], musclesStretched: ['hip flexors'] });
    expect(qualifiesForBlock(clean, 'mobility', lowerCrossPatterns)).toBe(true);
  });

  it('core block requires the core_stability role specifically', () => {
    const coreCandidate = fixture({
      correctiveRoles: ['core_stability'],
      musclesStrengthened: ['deep abdominals (TVA)'],
    });
    expect(qualifiesForBlock(coreCandidate, 'core', lowerCrossPatterns)).toBe(true);

    const strengthOnly = fixture({ correctiveRoles: ['strength'], musclesStrengthened: ['deep abdominals (TVA)'] });
    expect(qualifiesForBlock(strengthOnly, 'core', lowerCrossPatterns)).toBe(false);
  });

  it('strength block accepts any strength-role exercise regardless of muscle (matches pickStrengthBlock’s own candidate filter)', () => {
    const anyStrength = fixture({ correctiveRoles: ['strength'], musclesStrengthened: ['pecs'] });
    expect(qualifiesForBlock(anyStrength, 'strength', lowerCrossPatterns)).toBe(true);

    const stabilityOnly = fixture({ correctiveRoles: ['stability'], musclesStrengthened: ['glutes'] });
    expect(qualifiesForBlock(stabilityOnly, 'strength', lowerCrossPatterns)).toBe(false);
  });

  it('qualifies nothing when there are no active patterns', () => {
    const anything = fixture({ correctiveRoles: ['strength'] });
    expect(qualifiesForBlock(anything, 'strength', [])).toBe(false);
  });
});

describe('Corrective Programs — coach-override flag', () => {
  it('a full-library override pick is stored is_coach_override=true; an engine pick defaults to false', async () => {
    const coachId = TEST_USERS.coachOne.id;
    const supabase = serviceRoleClient();

    const template = await createTemplate(supabase, coachId, {
      name: 'Override flag test',
      description: null,
      goal: 'corrective',
      difficulty: null,
      estimatedDurationMinutes: null,
      equipment: [],
      programTags: [],
      correctiveTags: [],
      movementTags: [],
      targetMuscles: [],
      coachNotes: null,
      internalNotes: null,
      memberInstructions: null,
    });
    expect(template).not.toBeNull();
    createdTemplateIds.push(template!.id);

    const ok = await replaceTemplateContent(supabase, template!.id, coachId, [
      {
        name: 'Mobility',
        sectionType: 'mobility',
        exercises: [
          {
            provider: 'mef_custom',
            externalId: 'override-pick',
            exerciseName: 'Coach-Chosen Exercise',
            isCoachOverride: true,
            sets: null,
            reps: null,
            rep_range_low: null,
            rep_range_high: null,
            time_seconds: null,
            distance_meters: null,
            rest_seconds: null,
            tempo: null,
            rpe: null,
            load: null,
            load_unit: null,
            resistance: null,
            band_color: null,
            side: null,
            unilateral: false,
            hold_duration_seconds: null,
            frequency: null,
            priority: 'medium',
            is_required: true,
            notes: null,
            coaching_cues: null,
            pain_modification_notes: null,
            alternate_exercises: {},
          },
          {
            provider: 'mef_custom',
            externalId: 'engine-pick',
            exerciseName: 'Engine-Qualified Exercise',
            sets: null,
            reps: null,
            rep_range_low: null,
            rep_range_high: null,
            time_seconds: null,
            distance_meters: null,
            rest_seconds: null,
            tempo: null,
            rpe: null,
            load: null,
            load_unit: null,
            resistance: null,
            band_color: null,
            side: null,
            unilateral: false,
            hold_duration_seconds: null,
            frequency: null,
            priority: 'medium',
            is_required: true,
            notes: null,
            coaching_cues: null,
            pain_modification_notes: null,
            alternate_exercises: {},
          },
        ],
      },
    ]);
    expect(ok).toBe(true);

    const hydrated = await getTemplateWithContent(supabase, template!.id);
    const exercises = hydrated!.sections.flatMap((s) => s.exercises);
    const overridePick = exercises.find((e) => e.external_id === 'override-pick');
    const enginePick = exercises.find((e) => e.external_id === 'engine-pick');
    expect(overridePick?.is_coach_override).toBe(true);
    expect(enginePick?.is_coach_override).toBe(false);

    await deleteTemplate(supabase, template!.id);
    createdTemplateIds.splice(createdTemplateIds.indexOf(template!.id), 1);
  });

  it('every exercise saveCorrectiveProgramDraft writes defaults to is_coach_override=false', async () => {
    const memberId = TEST_USERS.memberOne.id;
    const coachId = TEST_USERS.coachOne.id;
    const { saved } = await seedLowerCrossDraft(memberId, coachId, 'override-default');

    const supabase = serviceRoleClient();
    for (const templateId of saved.templateIds) {
      const hydrated = await getTemplateWithContent(supabase, templateId);
      const exercises = hydrated!.sections.flatMap((s) => s.exercises);
      expect(exercises.length).toBeGreaterThan(0);
      for (const exercise of exercises) {
        expect(exercise.is_coach_override).toBe(false);
      }
    }
  });
});
