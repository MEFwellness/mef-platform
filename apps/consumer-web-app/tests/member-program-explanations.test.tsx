/**
 * What a member is TOLD about the program she was given, and about every
 * exercise in it.
 *
 * Three things are proved here, and the third is the one that matters most:
 *
 *   1. COMPOSITION. Both entry points, an authored blueprint and a
 *      generated corrective program, produce a true paragraph from the same
 *      composer, drawing on the same facts, and a member with no goals and
 *      no assessment gets a shorter one rather than a hedged one.
 *
 *   2. PERSISTENCE. What the coach leaves in the box is what gets stored,
 *      at the program level and per exercise, and what is stored is what
 *      the member's own screen renders. A program assigned before any of
 *      this existed reads exactly as it read before, byte for byte.
 *
 *   3. NO LEAK. Every sentence this product can compose, for every block
 *      and every movement pattern in the catalog, is run through
 *      containsClinicalLanguage. If one of them ever names a pattern,
 *      grades a muscle or uses a clinical word, the build fails here rather
 *      than the sentence arriving on somebody's phone. The fixtures are the
 *      real ones: production's own findings, its own goals, the seeded
 *      blueprint's own slots.
 *
 * Rendering tests use the real components with real data, the way
 * tests/program-screens-no-video-requests.test.tsx does. The database tests
 * run against local Supabase with no mocks and clean up after themselves.
 */
import { describe, it, expect, afterAll, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// The member's workout screen is a client component with a router and two
// server actions behind its controls. Both are stubbed the same way
// tests/program-screens-no-video-requests.test.tsx stubs them, so what is
// under test here is the rendering and nothing else.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {}, back: () => {} }),
}));
vi.mock('@/app/actions/coach-programs', () => ({
  updateMyAssignedWorkoutStatusAction: async () => ({}),
  updateMyAssignedWorkoutExerciseAction: async () => ({}),
}));
import type {
  BlueprintBlock,
  CoachAssignedWorkoutExercise,
  CoachAssignedWorkoutWithContent,
  FindingSeverity,
  MemberProgramLifecycle,
  PostureFindingType,
} from '@mef/shared-types-contracts';

import { serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';
import {
  BODY_AREA_PHRASE,
  FINDING_AREA_KEYS,
  bodyAreaKeysFromFindings,
  bodyAreaPhrases,
  equipmentPhrases,
  joinPhrases,
} from '../lib/programs/explain/bodyAreas';
import {
  areasFromCorrectiveTags,
  areasFromSlots,
} from '../lib/programs/explain/programAreas';
import {
  memberExerciseReasoning,
  memberExerciseReasoningForOverride,
} from '../lib/programs/explain/exerciseReasoning';
import {
  composeProgramExplanation,
  programExplanationSentences,
} from '../lib/programs/explain/programExplanation';
import { containsClinicalLanguage } from '../lib/programs/memberPresentation';
import { buildMemberProgramViews } from '../lib/program-lifecycle/memberView';
import { ALL_FINDING_TYPES } from '../lib/body-assessment/findings';
import { getBlueprintVersion } from '../lib/programs/blueprints/data';
import { planFromBlueprint, plannedSessionSections } from '../lib/programs/blueprints/plan';
import { assignBlueprintToMember, discardBlueprintDraft } from '../lib/programs/blueprints/assign';
import { materializeBlueprint } from '../lib/programs/blueprints/materialize';
import { getTemplateWithContent, replaceTemplateContent } from '../lib/coach-program-builder/templates';
import { setProgramMemberExplanation } from '../lib/coach-program-builder/assignments';
import { MemberAssignedWorkoutDetail } from '../components/coach-program-builder/MemberAssignedWorkoutDetail';

// ---------------------------------------------------------------------
// Fixtures, production shaped.
// ---------------------------------------------------------------------

/** Every block, so the leak sweep below cannot miss one. */
const ALL_BLOCKS: BlueprintBlock[] = ['release', 'mobility', 'stability', 'strength', 'core'];

/**
 * Every movement pattern the seeded blueprint actually uses, plus the ones
 * the corrective engine's blocks imply. A pattern with no entry in the
 * table falls back to its block, which is also swept.
 */
const ALL_PATTERNS = [
  'spinal',
  'shoulder',
  'thoracic',
  'scapular',
  'hip_flexion',
  'hip_hinge',
  'hip_rotation',
  'squat',
  'lunge',
  'vertical_push',
  'horizontal_push',
  'vertical_pull',
  'horizontal_pull',
  'carry',
  'anti_extension',
  'anti_rotation',
  'anti_flexion',
  'rotation',
  // A pattern nobody has written a sentence for. It must still produce a
  // safe sentence rather than an empty one.
  'a_pattern_that_does_not_exist_yet',
];

/** Her real goals, in the words the goals screen produces. */
// The labels lib/coach-member-entries/present.ts really returns, which are
// WELCOME_GOALS' own labels. Written out rather than paraphrased on
// purpose: the whole point of ./goalPhrases.ts is that these exact strings
// never reach a member's paragraph.
const REAL_GOALS = {
  primaryGoal: 'Build strength and fitness',
  goals: ['Increase energy', 'Sleep better'],
};

const REAL_FINDINGS: { finding_type: PostureFindingType; severity: FindingSeverity; status: string }[] =
  [
    { finding_type: 'lower_crossed_pattern', severity: 'moderate', status: 'confirmed' },
    { finding_type: 'forward_head', severity: 'mild', status: 'pending_review' },
    { finding_type: 'rounded_shoulders', severity: 'significant', status: 'coach_overridden' },
    // Observed nothing. Must contribute no area.
    { finding_type: 'knee_valgus', severity: 'none', status: 'confirmed' },
    // Could not tell. Must contribute no area.
    { finding_type: 'foot_turnout', severity: 'unknown', status: 'confirmed' },
    // Dismissed by a coach. Must contribute no area.
    { finding_type: 'breathing_pattern', severity: 'moderate', status: 'dismissed' },
    // A coach's own free text. Nothing plain can be derived from it.
    { finding_type: 'custom', severity: 'significant', status: 'confirmed' },
  ];

/** The blueprint path, with the seeded program's own authored text and shape. */
const BLUEPRINT_INPUT = {
  memberFirstName: 'Ebony',
  programName: 'Home Dumbbell Foundation',
  memberDescription:
    'A four week strength program you can do at home with a pair of dumbbells. Three sessions a week. Each one opens with three short movements to get you ready, then the strength work, then core. In week 3 the main lift of each session gains a set and each core hold gets longer.',
  focus: null,
  primaryGoal: REAL_GOALS.primaryGoal,
  goals: REAL_GOALS.goals,
  bodyAreas: bodyAreaKeysFromFindings(REAL_FINDINGS),
  // What this program's own slots actually work, read from their recorded
  // movement patterns. Deliberately does NOT include her neck: there is no
  // neck work in a dumbbell strength program, and the sentence must not
  // claim otherwise.
  programAreas: areasFromSlots([
    { block: 'strength' as const, movementPattern: 'squat' },
    { block: 'strength' as const, movementPattern: 'horizontal_pull' },
    { block: 'strength' as const, movementPattern: 'vertical_push' },
    { block: 'core' as const, movementPattern: 'anti_extension' },
  ]),
  equipment: ['dumbbell'],
  durationWeeks: 4,
  sessionsPerWeek: 3,
  buildsOverTime: true,
};

/** The corrective path: no authored description, named after a body area. */
const CORRECTIVE_INPUT = {
  memberFirstName: 'Ebony',
  programName: 'Hip and Core Foundation',
  memberDescription: null,
  focus: 'your hips, deep core and glutes',
  primaryGoal: REAL_GOALS.primaryGoal,
  goals: REAL_GOALS.goals,
  bodyAreas: bodyAreaKeysFromFindings(REAL_FINDINGS),
  programAreas: areasFromCorrectiveTags(['lower_cross']),
  equipment: ['bodyweight', 'foam roller'],
  durationWeeks: 4,
  sessionsPerWeek: 3,
  buildsOverTime: false,
};

// ---------------------------------------------------------------------
// 1) Body areas: a finding becomes a place, never a name and never a grade
// ---------------------------------------------------------------------

describe('a posture finding, in her words', () => {
  it('maps every finding type this product can produce, or says nothing at all', () => {
    for (const type of ALL_FINDING_TYPES) {
      expect(type in FINDING_AREA_KEYS, `${type} has no body-area mapping`).toBe(true);
    }
  });

  it('never names the finding, never grades it, and never leaks a pattern', () => {
    for (const [type, keys] of Object.entries(FINDING_AREA_KEYS)) {
      for (const area of bodyAreaPhrases(keys)) {
        expect(containsClinicalLanguage(area), `${type} maps to clinical language: ${area}`).toBe(
          false
        );
        expect(area, `${type} maps to its own name`).not.toContain(type.replace(/_/g, ' '));
        for (const grade of ['mild', 'moderate', 'significant', 'severe']) {
          expect(area.toLowerCase(), `${type} carries a severity`).not.toContain(grade);
        }
      }
    }
  });

  it('reads only what was actually observed and actually stands', () => {
    const keys = bodyAreaKeysFromFindings(REAL_FINDINGS);
    // Areas, deduplicated: two findings both pointing at the upper back
    // name it once, which the old phrase-per-finding shape could not do.
    expect(keys).toEqual(['hips', 'deep_core', 'neck', 'upper_back', 'shoulders']);
    // 'none' observed nothing, 'unknown' could not tell, 'dismissed' was
    // rejected by a coach, and 'custom' is a coach's own free writing.
    expect(keys).not.toContain('knees');
    expect(keys).not.toContain('feet');
    expect(keys).not.toContain('breathing');
  });

  it('says the same words whatever the severity was', () => {
    const mild = bodyAreaKeysFromFindings([
      { finding_type: 'pelvic_tilt', severity: 'mild', status: 'confirmed' },
    ]);
    const significant = bodyAreaKeysFromFindings([
      { finding_type: 'pelvic_tilt', severity: 'significant', status: 'confirmed' },
    ]);
    expect(mild).toEqual(significant);
  });

  it('has a plain phrase for every area key it can produce', () => {
    for (const keys of Object.values(FINDING_AREA_KEYS)) {
      for (const key of keys) {
        expect(BODY_AREA_PHRASE[key], `${key} has no phrase`).toBeTruthy();
      }
    }
  });

  it('names equipment as a person would own it, and drops what is not an object', () => {
    expect(equipmentPhrases(['dumbbell'])).toEqual(['a pair of dumbbells']);
    expect(equipmentPhrases(['bodyweight', 'foam roller'])).toEqual(['a foam roller']);
    expect(equipmentPhrases(['bodyweight'])).toEqual([]);
    // An unknown token is passed through rather than dropped: a missing
    // piece of equipment is worse than an awkward word.
    expect(equipmentPhrases(['trap bar'])).toEqual(['trap bar']);
  });

  it('joins the way a person says it', () => {
    expect(joinPhrases(['a'])).toBe('a');
    expect(joinPhrases(['a', 'b'])).toBe('a and b');
    expect(joinPhrases(['a', 'b', 'c'])).toBe('a, b and c');
  });
});

// ---------------------------------------------------------------------
// 2) Per-exercise reasoning
// ---------------------------------------------------------------------

describe('why this exercise, in her language', () => {
  it('is deterministic: the same slot always produces the same words', () => {
    const input = {
      block: 'strength' as const,
      movementPattern: 'squat',
      isPerSide: false,
      priorityRank: 1,
    };
    expect(memberExerciseReasoning(input)).toBe(memberExerciseReasoning(input));
  });

  it('says what it does and why it is here, and marks a per side set', () => {
    const line = memberExerciseReasoning({
      block: 'strength',
      movementPattern: 'lunge',
      isPerSide: true,
      priorityRank: 2,
    });
    expect(line).toContain('one leg at a time');
    expect(line).toContain('It is in your plan');
    expect(line).toContain('one side before you swap over');
  });

  it('calls the top ranked strength slot the main lift, and nothing else', () => {
    const main = memberExerciseReasoning({
      block: 'strength',
      movementPattern: 'squat',
      isPerSide: false,
      priorityRank: 1,
    });
    const accessory = memberExerciseReasoning({
      block: 'strength',
      movementPattern: 'squat',
      isPerSide: false,
      priorityRank: 3,
    });
    expect(main).toContain('main lift of this session');
    expect(accessory).not.toContain('main lift');
  });

  it('reads a hinge differently depending on which block it is in', () => {
    const stretch = memberExerciseReasoning({ block: 'mobility', movementPattern: 'hip_hinge' });
    const lift = memberExerciseReasoning({ block: 'strength', movementPattern: 'hip_hinge' });
    expect(stretch).toContain('lengthens');
    expect(lift).toContain('builds strength');
    expect(stretch).not.toBe(lift);
  });

  it('falls back to the block when the slot records no pattern, which is every generated exercise', () => {
    for (const block of ALL_BLOCKS) {
      const line = memberExerciseReasoning({ block, movementPattern: null });
      expect(line.length, `${block} produced nothing`).toBeGreaterThan(20);
      expect(line.startsWith('This one ')).toBe(true);
    }
  });

  it('a pattern nobody has written a sentence for still produces a safe one', () => {
    const line = memberExerciseReasoning({
      block: 'strength',
      movementPattern: 'a_pattern_that_does_not_exist_yet',
    });
    expect(line).toContain('builds strength you can use in everyday life');
    expect(containsClinicalLanguage(line)).toBe(false);
  });

  it('says her coach chose it, when her coach chose it', () => {
    const line = memberExerciseReasoningForOverride({ block: 'core', movementPattern: 'anti_rotation' });
    expect(line).toContain('Your coach picked this one for you specifically.');
    expect(containsClinicalLanguage(line)).toBe(false);
  });

  /** The leak sweep. Every block against every pattern, both per side states, both ranks. */
  it('cannot produce clinical language for any block, any pattern, any rank', () => {
    for (const block of ALL_BLOCKS) {
      for (const pattern of [...ALL_PATTERNS, null]) {
        for (const isPerSide of [true, false]) {
          for (const priorityRank of [1, 4, null]) {
            const line = memberExerciseReasoning({
              block,
              movementPattern: pattern,
              isPerSide,
              priorityRank,
            });
            expect(
              containsClinicalLanguage(line),
              `${block}/${pattern}/${isPerSide}/${priorityRank}: ${line}`
            ).toBe(false);
            expect(line, `${block}/${pattern} uses an em dash`).not.toContain('—');
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------
// 3) Program explanation, both entry points
// ---------------------------------------------------------------------

describe('why this program, composed from what is known', () => {
  it('opens with her name and the program, in the blueprint path', () => {
    const sentences = programExplanationSentences(BLUEPRINT_INPUT);
    expect(sentences[0]).toBe('Ebony, this is your Home Dumbbell Foundation.');
    // The authored description carries the shape, so the opening does not
    // repeat it back at her.
    expect(sentences[0]).not.toContain('4 weeks');
    expect(sentences[1]).toContain('A four week strength program');
  });

  it('carries the shape itself when there is no authored description, in the corrective path', () => {
    const sentences = programExplanationSentences(CORRECTIVE_INPUT);
    expect(sentences[0]).toBe(
      'Ebony, this is your Hip and Core Foundation: 4 weeks, 3 sessions a week.'
    );
    expect(sentences[1]).toBe('It works on your hips, deep core and glutes.');
  });

  it('says her goal the way a person says it, never as the option she tapped', () => {
    const text = composeProgramExplanation(BLUEPRINT_INPUT);
    expect(text).toContain('what matters most to you right now is getting stronger and fitter');
    // The stored option itself must never appear mid-sentence. This is the
    // correction the coach asked for after reading the first draft.
    expect(text).not.toContain('Build strength and fitness');
  });

  it('says the program SUPPORTS her goal, because nothing here selected on it', () => {
    const text = composeProgramExplanation(BLUEPRINT_INPUT);
    expect(text).toContain('this plan supports that');
    expect(text).not.toContain('built around');
  });

  it('says built around only where the selection logic really used her goal', () => {
    const text = composeProgramExplanation({ ...BLUEPRINT_INPUT, goalDroveSelection: true });
    expect(text).toContain('this plan is built around that');
  });

  it('falls back to her other goals when she named no single most important one', () => {
    const text = composeProgramExplanation({ ...BLUEPRINT_INPUT, primaryGoal: null });
    expect(text).toContain(
      'you want to work on having more energy through your day and sleeping better'
    );
  });

  it('says where the work goes without naming a finding or grading one', () => {
    const text = composeProgramExplanation(BLUEPRINT_INPUT);
    // Her check pointed at five areas. The program works four of them, so
    // four are named and her neck is not: it is the one place this
    // program does not go. See lib/programs/explain/programAreas.ts.
    expect(text).toContain(
      'Your last posture check pointed at your hips, your deep core, your upper back and your shoulders, so those get attention in every session'
    );
    expect(text).not.toContain('your neck');
    for (const forbidden of ['lower-crossed', 'moderate', 'significant', 'mild', 'finding']) {
      expect(text.toLowerCase(), `the paragraph says "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it('says what to have ready, and says it differently when nothing is needed', () => {
    expect(composeProgramExplanation(BLUEPRINT_INPUT)).toContain(
      'Have a pair of dumbbells and enough floor to lie down on ready before you start.'
    );
    expect(composeProgramExplanation({ ...BLUEPRINT_INPUT, equipment: ['bodyweight'] })).toContain(
      'All you need is enough floor to lie down on.'
    );
  });

  it('says it builds only when it actually builds', () => {
    expect(composeProgramExplanation(BLUEPRINT_INPUT)).toContain('asks for a little more');
    // A corrective phase is four identical weeks. Saying otherwise would be
    // the one invented claim in the paragraph.
    expect(composeProgramExplanation(CORRECTIVE_INPUT)).not.toContain('asks for a little more');
  });

  it('never promises an outcome and never diagnoses', () => {
    for (const input of [BLUEPRINT_INPUT, CORRECTIVE_INPUT]) {
      const text = composeProgramExplanation(input).toLowerCase();
      for (const claim of ['will fix', 'will correct', 'will cure', 'imbalance', 'dysfunction', 'diagnos']) {
        expect(text, `the paragraph claims "${claim}"`).not.toContain(claim);
      }
    }
  });

  it('gets shorter, not vaguer, for a member on her first day', () => {
    const bare = composeProgramExplanation({
      memberFirstName: null,
      programName: 'Home Dumbbell Foundation',
      memberDescription: null,
      focus: null,
      primaryGoal: null,
      goals: [],
      bodyAreas: [],
      equipment: [],
      durationWeeks: 4,
      sessionsPerWeek: 3,
      buildsOverTime: false,
    });
    expect(bare).toBe(
      'This is your Home Dumbbell Foundation: 4 weeks, 3 sessions a week. ' +
        'All you need is enough floor to lie down on. ' +
        'It starts where you are now. Your coach sets the weights with you at your first session, so nothing here asks you to guess. ' +
        'If something does not feel right, tell your coach and it gets changed.'
    );
    // No goal sentence, no posture sentence, and nothing hedged in their
    // place.
    expect(bare).not.toContain('You told us');
    expect(bare).not.toContain('posture');
  });

  it('drops an authored description written in coach vocabulary rather than showing it', () => {
    const leaky = composeProgramExplanation({
      ...BLUEPRINT_INPUT,
      memberDescription:
        'Auto-generated 4-week corrective phase for the Lower Cross pattern (moderate).',
      focus: 'your hips, deep core and glutes',
    });
    expect(leaky).not.toContain('Lower Cross');
    expect(leaky).not.toContain('Auto-generated');
    // The focus sentence stands in its place, and the opening picks the
    // shape back up because there is no description to carry it.
    expect(leaky).toContain('It works on your hips, deep core and glutes.');
    expect(leaky).toContain('4 weeks, 3 sessions a week');
  });

  it('cannot produce clinical language or an em dash, on either path', () => {
    for (const input of [BLUEPRINT_INPUT, CORRECTIVE_INPUT]) {
      for (const sentence of programExplanationSentences(input)) {
        expect(containsClinicalLanguage(sentence), sentence).toBe(false);
        expect(sentence, `em dash in: ${sentence}`).not.toContain('—');
      }
    }
  });
});

// ---------------------------------------------------------------------
// 4) The member's own screens
// ---------------------------------------------------------------------

function lifecycleRow(overrides: Partial<MemberProgramLifecycle>): MemberProgramLifecycle {
  return {
    id: 'a1',
    member_id: 'm1',
    template_name_snapshot: 'Corrective: Lower Cross: Session A',
    program_group_key: 'corrective-program:g1',
    status: 'active',
    start_date: '2026-08-03',
    end_date: '2026-08-30',
    duration_weeks: 4,
    current_week: 2,
    paused_days: 0,
    started_at: null,
    completed_at: null,
    paused_at: null,
    resumed_at: null,
    replaced_at: null,
    replaced_by_assignment_id: null,
    schedule_type: 'weekly',
    schedule_config: { type: 'weekly', startDate: '2026-08-03', daysOfWeek: [1], weeks: 4 },
    published_at: '2026-08-01T00:00:00Z',
    member_explanation: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

describe('what she reads on her program screen', () => {
  it('shows the explanation her coach approved, in place of the interim blurb', () => {
    const explanation = composeProgramExplanation(BLUEPRINT_INPUT);
    const views = buildMemberProgramViews(
      [lifecycleRow({ member_explanation: explanation })],
      []
    );
    expect(views[0]!.blurb).toBe(explanation);
    expect(views[0]!.hasExplanation).toBe(true);
  });

  it('leaves a program assigned before any of this existed exactly as it was', () => {
    const views = buildMemberProgramViews([lifecycleRow({})], []);
    expect(views[0]!.blurb).toBe('A 4 week program from your coach, 1 session a week.');
    expect(views[0]!.hasExplanation).toBe(false);
  });

  it('suppresses an explanation written in coach vocabulary and falls back', () => {
    const views = buildMemberProgramViews(
      [
        lifecycleRow({
          member_explanation: 'Four week corrective phase for the Lower Cross pattern.',
        }),
      ],
      []
    );
    expect(views[0]!.blurb).toBe('A 4 week program from your coach, 1 session a week.');
    expect(views[0]!.hasExplanation).toBe(false);
  });

  it('reads one explanation for a program delivered as three weekly sessions', () => {
    const explanation = composeProgramExplanation(CORRECTIVE_INPUT);
    const views = buildMemberProgramViews(
      [
        lifecycleRow({ id: 'a1', member_explanation: null }),
        lifecycleRow({ id: 'a2', member_explanation: explanation }),
        lifecycleRow({ id: 'a3', member_explanation: explanation }),
      ],
      []
    );
    expect(views).toHaveLength(1);
    expect(views[0]!.blurb).toBe(explanation);
  });
});

// ---------------------------------------------------------------------
// 5) The member's own workout screen
// ---------------------------------------------------------------------

function assignedExercise(
  overrides: Partial<CoachAssignedWorkoutExercise>
): CoachAssignedWorkoutExercise {
  return {
    id: 'e1',
    assigned_workout_id: 'w1',
    section_id: 's1',
    member_id: 'm1',
    coach_id: 'c1',
    provider: 'your_move',
    external_id: 'ext-1',
    exercise_name: 'Split Squat',
    sequence_index: 0,
    status: 'not_started',
    completed_at: null,
    member_notes: null,
    difficulty_rating: null,
    comfort_rating: null,
    // Production's real text, written for the coach.
    selection_reasoning:
      "The main corrective work: strengthening this pattern's long, underactive muscles (Lower Cross).",
    member_reasoning: null,
    // Migration 177's member-voice columns. Null and false everywhere is
    // what a real row carries until she says something.
    logged_load: null,
    logged_load_unit: null,
    logged_load_per_side: false,
    logged_load_at: null,
    stopped_at: null,
    movement_pattern: null,
    is_locked: false,
    replacement_criteria: {},
    swapped_from_external_id: null,
    swapped_from_exercise_name: null,
    swapped_at: null,
    created_at: '2026-08-17T00:00:00Z',
    sets: 2,
    reps: '8',
    rep_range_low: 8,
    rep_range_high: 8,
    time_seconds: null,
    distance_meters: null,
    rest_seconds: 60,
    tempo: '2-0-2',
    rpe: null,
    load: null,
    load_unit: null,
    resistance: null,
    band_color: null,
    side: null,
    unilateral: true,
    hold_duration_seconds: null,
    frequency: null,
    priority: 'high',
    is_required: true,
    notes: null,
    coaching_cues: null,
    pain_modification_notes: null,
    alternate_exercises: {},
    ...overrides,
  };
}

function workoutWith(exercise: CoachAssignedWorkoutExercise): CoachAssignedWorkoutWithContent {
  return {
    id: 'w1',
    assignment_id: 'a1',
    member_id: 'm1',
    coach_id: 'c1',
    scheduled_date: '2026-08-18',
    occurrence_label: null,
    template_name: 'Home Dumbbell Foundation: Session A',
    description: 'A four week strength program you can do at home with a pair of dumbbells.',
    goal: 'strength',
    difficulty: 'beginner',
    estimated_duration_minutes: null,
    equipment: ['dumbbell'],
    program_tags: ['named-program'],
    corrective_tags: [],
    movement_tags: [],
    target_muscles: [],
    member_instructions: null,
    coach_notes: null,
    internal_notes: null,
    status: 'not_started',
    started_at: null,
    completed_at: null,
    skipped_at: null,
    member_feedback: null,
    published_at: '2026-08-17T00:00:00Z',
    source_prescription_snapshot_id: null,
    program_week: 1,
    created_at: '2026-08-17T00:00:00Z',
    updated_at: '2026-08-17T00:00:00Z',
    sections: [
      {
        id: 's1',
        assigned_workout_id: 'w1',
        member_id: 'm1',
        coach_id: 'c1',
        name: 'Strength',
        section_type: 'strength',
        sequence_index: 0,
        block_reasoning: null,
        created_at: '2026-08-17T00:00:00Z',
        exercises: [exercise],
      },
    ],
  } as unknown as CoachAssignedWorkoutWithContent;
}

describe('what she reads under "Why this exercise"', () => {
  it('shows her line when there is one', () => {
    const line = memberExerciseReasoning({
      block: 'strength',
      movementPattern: 'lunge',
      isPerSide: true,
      priorityRank: 2,
    });
    const html = renderToStaticMarkup(
      <MemberAssignedWorkoutDetail
        workout={workoutWith(assignedExercise({ member_reasoning: line }))}
      />
    );
    expect(html).toContain('Why this exercise');
    expect(html).toContain('one leg at a time');
    expect(html).not.toContain('Lower Cross');
    expect(html).not.toContain('underactive');
  });

  it('shows nothing at all on a program assigned before her line existed', () => {
    const html = renderToStaticMarkup(
      <MemberAssignedWorkoutDetail workout={workoutWith(assignedExercise({}))} />
    );
    expect(html).not.toContain('Why this exercise');
    expect(html).not.toContain('Lower Cross');
    expect(html).not.toContain('underactive');
  });

  it('suppresses her line too, if a coach ever types coach vocabulary into it', () => {
    const html = renderToStaticMarkup(
      <MemberAssignedWorkoutDetail
        workout={workoutWith(
          assignedExercise({
            member_reasoning: 'Strengthens the long/weak glutes of the Lower Cross pattern.',
          })
        )}
      />
    );
    expect(html).not.toContain('Why this exercise');
    expect(html).not.toContain('Lower Cross');
  });

  it('shows a coach’s own plain sentence when she wrote one instead', () => {
    const html = renderToStaticMarkup(
      <MemberAssignedWorkoutDetail
        workout={workoutWith(
          assignedExercise({
            member_reasoning: null,
            selection_reasoning: 'I put this one in because your left side needs the practice.',
          })
        )}
      />
    );
    expect(html).toContain('Why this exercise');
    expect(html).toContain('your left side needs the practice');
  });

  it('reads the renamed exercise, with no vendor suffix anywhere on her screen', () => {
    const html = renderToStaticMarkup(
      <MemberAssignedWorkoutDetail workout={workoutWith(assignedExercise({}))} />
    );
    expect(html).toContain('Split Squat');
    expect(html).not.toContain('(R)');
    expect(html).not.toContain('(L)');
  });
});

// ---------------------------------------------------------------------
// 6) Against the database: the rename, and the coach's edits persisting
// ---------------------------------------------------------------------

const COACH = TEST_USERS.coachOne.id;
const MEMBER = TEST_USERS.memberOne.id;

/** Everything written by section 6, deleted at the end whatever happened. */
const createdAssignmentIds: string[] = [];
const createdTemplateIds: string[] = [];

afterAll(async () => {
  await discardBlueprintDraft(serviceRoleClient(), {
    assignmentIds: createdAssignmentIds,
    templateIds: createdTemplateIds,
  });
});

describe('the catalog rename', () => {
  it('renamed exactly one exercise, and left no vendor suffix on it', async () => {
    const supabase = serviceRoleClient();
    const { data } = await supabase
      .from('exercise_catalog')
      .select('name, equipment, is_client_assignable')
      .in('name', ['Split Squat', 'Split squat (R)']);

    expect(data).toHaveLength(1);
    expect(data![0]!.name).toBe('Split Squat');
    expect(data![0]!.is_client_assignable).toBe(true);
  });

  it('is what the blueprint slot now reads, and it still points at the same exercise', async () => {
    const supabase = serviceRoleClient();
    const { data: slots } = await supabase
      .from('program_blueprint_slots')
      .select('exercise_name, provider, external_id, purpose, is_per_side')
      .eq('exercise_name', 'Split Squat');

    expect(slots!.length).toBeGreaterThan(0);
    const slot = slots![0]!;
    expect(slot.is_per_side).toBe(true);
    // The sentence that explained the "(R)" as a catalog defect is gone,
    // because the defect is gone.
    expect(slot.purpose).not.toContain('(R)');

    const { data: catalogRow } = await supabase
      .from('exercise_catalog')
      .select('name')
      .eq('provider', slot.provider)
      .eq('external_id', slot.external_id)
      .single();
    expect(catalogRow!.name).toBe('Split Squat');
  });

  it('left no slot anywhere disagreeing with the catalog about a name', async () => {
    const supabase = serviceRoleClient();
    const { data: slots } = await supabase
      .from('program_blueprint_slots')
      .select('exercise_name, provider, external_id');
    const { data: catalog } = await supabase.from('exercise_catalog').select('provider, external_id, name');
    const byKey = new Map(
      (catalog ?? []).map((row) => [`${row.provider}:${row.external_id}`, row.name as string])
    );
    for (const slot of slots ?? []) {
      if (!slot.external_id) continue;
      expect(
        slot.exercise_name,
        `slot for ${slot.external_id} disagrees with the catalog`
      ).toBe(byKey.get(`${slot.provider}:${slot.external_id}`));
    }
  });
});

describe('a coach’s edits reach the member, frozen', () => {
  it('composes a member line for every slot of the seeded blueprint, and none of them leak', async () => {
    const supabase = serviceRoleClient();
    const { data: version } = await supabase
      .from('movement_program_versions')
      .select('id, movement_programs!inner(key)')
      .eq('version_number', 2)
      .limit(1)
      .single();

    const blueprint = await getBlueprintVersion(supabase, version!.id);
    const sessions = planFromBlueprint(blueprint!);
    const lines = sessions.flatMap((session) =>
      session.exercises.map((exercise) => exercise.memberReasoning)
    );

    expect(lines.length).toBe(24);
    for (const line of lines) {
      expect(line.length, 'a slot produced an empty line').toBeGreaterThan(20);
      expect(containsClinicalLanguage(line), line).toBe(false);
      expect(line, `em dash in: ${line}`).not.toContain('—');
    }
  });

  it('freezes the coach’s edited line, and her edited explanation, into what the member reads', async () => {
    const supabase = serviceRoleClient();
    const { data: version } = await supabase
      .from('movement_program_versions')
      .select('id')
      .eq('version_number', 2)
      .limit(1)
      .single();

    const blueprint = await getBlueprintVersion(supabase, version!.id);

    // Materialize into templates the way the assign flow does, then edit
    // one exercise's member line the way a coach does on her screen.
    const materialized = await materializeBlueprint(supabase, {
      blueprint: blueprint!,
      coachId: COACH,
      memberId: MEMBER,
    });
    createdTemplateIds.push(...materialized.templateIds);

    const templateId = materialized.templateIds[0]!;
    const template = await getTemplateWithContent(supabase, templateId);
    const sections = plannedSessionSections({
      session: 'A',
      templateId,
      label: 'Session A',
      coachNotes: '',
      exercises: template!.sections.flatMap((section) =>
        section.exercises.map((exercise, index) => ({
          key: exercise.id,
          provider: exercise.provider,
          externalId: exercise.external_id,
          exerciseName: exercise.exercise_name,
          block: 'strength' as const,
          slotId: null,
          priorityRank: null,
          isLocked: false,
          isPerSide: exercise.unilateral,
          purpose: null,
          memberReasoning:
            index === 0
              ? 'This is the sentence the coach typed for her.'
              : (exercise.member_reasoning ?? ''),
          isCoachOverride: false,
          prescription: {
            sets: exercise.sets,
            reps: exercise.rep_range_low,
            holdSeconds: exercise.hold_duration_seconds,
            tempo: exercise.tempo,
            restSeconds: exercise.rest_seconds,
          },
          weekOverrides: {},
        }))
      ),
    });
    expect(await replaceTemplateContent(supabase, templateId, COACH, sections)).toBe(true);

    // The template carries the coach's own sentence now.
    const edited = await getTemplateWithContent(supabase, templateId);
    const first = edited!.sections[0]!.exercises[0]!;
    expect(first.member_reasoning).toBe('This is the sentence the coach typed for her.');

    // Assign as an UNPUBLISHED draft with the coach's explanation on it.
    const explanation = 'Ebony, this is the explanation the coach approved for you.';
    const assigned = await assignBlueprintToMember(supabase, {
      blueprint: blueprint!,
      coachId: COACH,
      memberId: MEMBER,
      startDate: '2026-09-07',
      today: '2026-09-01',
      timezone: 'America/New_York',
      publish: false,
      memberExplanation: explanation,
    });
    expect(assigned).not.toBeNull();
    createdAssignmentIds.push(...assigned!.assignmentIds);
    createdTemplateIds.push(...assigned!.templateIds);

    // Every weekly session of the program carries the same explanation.
    const { data: assignments } = await supabase
      .from('coach_program_assignments')
      .select('id, member_explanation, visibility')
      .in('id', assigned!.assignmentIds);
    expect(assignments).toHaveLength(3);
    for (const row of assignments ?? []) {
      expect(row.member_explanation).toBe(explanation);
      // Nothing published: this whole test is invisible to the member.
      expect(row.visibility).toBe('draft');
    }

    // And every frozen exercise carries a member line of its own.
    const { data: frozen } = await supabase
      .from('coach_assigned_workout_exercises')
      .select('exercise_name, member_reasoning, selection_reasoning')
      .in(
        'assigned_workout_id',
        (
          await supabase
            .from('coach_assigned_workouts')
            .select('id')
            .in('assignment_id', assigned!.assignmentIds)
        ).data!.map((w) => w.id)
      );

    expect(frozen!.length).toBeGreaterThan(0);
    for (const row of frozen ?? []) {
      expect(row.member_reasoning, `${row.exercise_name} froze no member line`).toBeTruthy();
      expect(containsClinicalLanguage(row.member_reasoning), row.member_reasoning as string).toBe(
        false
      );
      // The coach's own field is still null on this path, exactly as it
      // was: this added a second field, it did not repurpose the first.
      expect(row.selection_reasoning).toBeNull();
    }

    // The rename reached the frozen rows, because they were written after
    // it. Nothing frozen before it was rewritten.
    expect((frozen ?? []).some((r) => r.exercise_name === 'Split Squat')).toBe(true);
    expect((frozen ?? []).every((r) => !(r.exercise_name as string).includes('(R)'))).toBe(true);
  });

  it('lets the coach rewrite the explanation afterwards, on every session at once', async () => {
    const supabase = serviceRoleClient();
    expect(createdAssignmentIds.length).toBeGreaterThan(0);

    const rewritten = 'Ebony, your coach changed her mind about how to say this.';
    expect(
      await setProgramMemberExplanation(supabase, {
        assignmentIds: createdAssignmentIds,
        explanation: rewritten,
      })
    ).toBe(true);

    const { data } = await supabase
      .from('coach_program_assignments')
      .select('member_explanation')
      .in('id', createdAssignmentIds);
    for (const row of data ?? []) {
      expect(row.member_explanation).toBe(rewritten);
    }
  });

  it('clears it back to nothing when the coach empties the box', async () => {
    const supabase = serviceRoleClient();
    expect(
      await setProgramMemberExplanation(supabase, {
        assignmentIds: createdAssignmentIds,
        explanation: '   ',
      })
    ).toBe(true);
    const { data } = await supabase
      .from('coach_program_assignments')
      .select('member_explanation')
      .in('id', createdAssignmentIds);
    for (const row of data ?? []) {
      expect(row.member_explanation).toBeNull();
    }
  });

  it('serves the explanation to the member through her own view, and nothing coach-only with it', async () => {
    const supabase = serviceRoleClient();
    const explanation = 'Ebony, this is what you are reading on your own screen.';
    await setProgramMemberExplanation(supabase, {
      assignmentIds: createdAssignmentIds,
      explanation,
    });

    // The view is published-only, so an unpublished draft is invisible.
    const member = await signInAs(TEST_USERS.memberOne);
    const { data: hidden } = await member
      .from('member_program_lifecycle')
      .select('id')
      .in('id', createdAssignmentIds);
    expect(hidden ?? []).toHaveLength(0);

    // And the view still cannot serve the two coach-only columns.
    const { error } = await member
      .from('member_program_lifecycle')
      .select('internal_notes')
      .limit(1);
    expect(error).not.toBeNull();

    // Put the explanation back to null so the teardown leaves nothing.
    await setProgramMemberExplanation(supabase, {
      assignmentIds: createdAssignmentIds,
      explanation: null,
    });
  });
});
