/**
 * The member's voice inside her own program (migration 177), against real
 * local Supabase. No mocks.
 *
 * Server actions cannot be called from here (they use next/headers), so
 * these exercise the layer underneath them: the same pure rules the
 * actions apply and the same data functions they call, plus the RLS the
 * database enforces whatever the actions do.
 *
 * What this proves, in the order the prompt asked for it:
 *
 *   1. Every goal option the questionnaire offers has a natural phrase,
 *      and no raw option text can reach a sentence.
 *   2. A posture sentence is suppressed when the program does not work
 *      that area, and survives when it does.
 *   3. The per-exercise openers vary within one program and are identical
 *      on every render of it.
 *   4. A weight persists per occurrence and prefills from the last one.
 *   5. Pain STOPS the exercise, flags the coach, records it, writes the
 *      avoidance, and offers nothing.
 *   6. Too difficult offers only genuine regressions, and Bodyweight
 *      Split Squat is among them for Split Squat.
 *   7. Too easy offers nothing at all, ever.
 *   8. A locked exercise is unswappable by a member.
 *   9. Nothing in her avoidance history is ever offered again.
 *  10. A swap rewrites the future and leaves the past exactly as it was.
 *
 * Everything works on its own throwaway program and cleans up after
 * itself. The seeded Home Dumbbell Foundation is never written to.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BlueprintWithSlots,
  CoachAssignedWorkoutExercise,
} from '@mef/shared-types-contracts';

import { WELCOME_GOALS } from '../lib/welcome/goals';
import { ALL_GOAL_LABELS, goalPhrase, goalPhrases } from '../lib/programs/explain/goalPhrases';
import { composeProgramExplanation } from '../lib/programs/explain/programExplanation';
import {
  areasFromCorrectiveTags,
  areasFromSlots,
  sayableAreas,
} from '../lib/programs/explain/programAreas';
import {
  memberExerciseReasoning,
  openerIndexFor,
  allComposedOpeners,
} from '../lib/programs/explain/exerciseReasoning';
import { containsClinicalLanguage } from '../lib/programs/memberPresentation';

import {
  acceptsWeightLog,
  formatLoggedLoad,
  initialLoadUnit,
  parseLoggedLoad,
  WEIGHT_LOG_HELPER_TEXT,
} from '../lib/programs/weightLogging';
import { branchForReason, FEEDBACK_REASONS, avoidanceSourceFor } from '../lib/programs/feedback/reasons';
import { exerciseSafetyDecision, readsAsPain } from '../lib/programs/feedback/safety';
import {
  isRegressionOf,
  offersForFeedback,
  offersNothing,
  sameMovementFamily,
  MAX_OFFERS,
} from '../lib/programs/feedback/offers';
import type { SwapCandidate } from '../lib/programs/blueprints/swap';
import {
  applySwap,
  findSwapTargets,
  lastLoggedLoadFor,
  markExerciseStopped,
  recordAvoidance,
  recordExerciseFeedback,
} from '../lib/programs/feedback/data';
import { loadAvoidedExternalIds } from '../lib/programs/feedback/candidates';
import { feedbackAttentionReasons, PAIN_STOP_REASON, READY_TO_PROGRESS_REASON } from '../lib/programs/feedback/attention';
import {
  branchMessage,
  NO_OPTIONS_MESSAGE,
  PAIN_MESSAGE,
  swapConfirmationMessage,
  TOO_EASY_MESSAGE,
} from '../lib/programs/feedback/copy';
import { getBlueprintVersion } from '../lib/programs/blueprints/data';
import { assignBlueprintToMember } from '../lib/programs/blueprints/assign';

const COACH = TEST_USERS.coachOne.id;
const MEMBER = TEST_USERS.memberOne.id;
const TEST_KEY = 'test_member_voice_program';

// ---------------------------------------------------------------------
// Pure rules. No database, no fixture, no order dependence.
// ---------------------------------------------------------------------

describe('her goal, said the way a person says it', () => {
  it('covers every option the goals screen offers', () => {
    for (const goal of WELCOME_GOALS) {
      // Either a phrase, or a deliberate null. What must never happen is
      // an option this map has never heard of.
      const phrase = goalPhrase(goal.label);
      const known = goal.key === 'something_else' ? phrase === null : typeof phrase === 'string';
      expect(known, `${goal.label} has no decision in goalPhrases.ts`).toBe(true);
    }
    expect(ALL_GOAL_LABELS).toHaveLength(WELCOME_GOALS.length);
  });

  it('never lets a raw option reach a sentence', () => {
    for (const goal of WELCOME_GOALS) {
      const text = composeProgramExplanation({
        programName: 'Test Program',
        primaryGoal: goal.label,
        durationWeeks: 4,
        sessionsPerWeek: 3,
      });
      expect(text, `${goal.label} leaked into the paragraph`).not.toContain(goal.label);
    }
  });

  it('says the exact phrase the coach asked for, for the example she named', () => {
    expect(goalPhrase('Lose weight or improve body composition')).toBe(
      'losing weight and improving how your body feels and moves'
    );
  });

  it('drops a value this product never offered rather than printing it', () => {
    expect(goalPhrase('Get shredded for summer')).toBeNull();
    expect(goalPhrases(['Sleep better', 'Get shredded for summer'])).toEqual(['sleeping better']);
  });

  it('carries no clinical language and no em dash in any phrase', () => {
    for (const goal of WELCOME_GOALS) {
      const phrase = goalPhrase(goal.label);
      if (!phrase) continue;
      expect(containsClinicalLanguage(phrase)).toBe(false);
      expect(phrase).not.toContain('—');
    }
  });
});

describe('supports, not built around', () => {
  const base = {
    programName: 'Test Program',
    primaryGoal: 'Sleep better',
    durationWeeks: 4,
    sessionsPerWeek: 3,
  };

  it('says the plan supports her goal by default', () => {
    const text = composeProgramExplanation(base);
    expect(text).toContain('this plan supports that');
    expect(text).not.toContain('built around');
  });

  it('only says built around when the selection really used the goal', () => {
    expect(composeProgramExplanation({ ...base, goalDroveSelection: true })).toContain(
      'this plan is built around that'
    );
  });
});

describe('a posture area is named only where the program goes', () => {
  const hipsAndCore = areasFromCorrectiveTags(['lower_cross']);

  it('reads a generated program off its own corrective blueprint', () => {
    expect(hipsAndCore).toContain('hips');
    expect(hipsAndCore).toContain('deep_core');
    expect(hipsAndCore).not.toContain('neck');
  });

  it('reads an authored program off its slots recorded movement patterns', () => {
    const areas = areasFromSlots([
      { block: 'strength', movementPattern: 'squat' },
      { block: 'core', movementPattern: 'anti_extension' },
    ]);
    expect(areas).toEqual(expect.arrayContaining(['hips', 'knees', 'deep_core']));
    expect(areas).not.toContain('neck');
  });

  it('says nothing at all about an area the program does not work', () => {
    const text = composeProgramExplanation({
      programName: 'Hip and Core Foundation',
      // Her check found a neck problem.
      bodyAreas: ['neck', 'upper_back'],
      // This program is hips and deep core.
      programAreas: hipsAndCore,
      durationWeeks: 4,
      sessionsPerWeek: 3,
    });
    expect(text).not.toContain('Your last posture check');
    expect(text).not.toContain('your neck');
  });

  it('says it when the program really does work the area', () => {
    const text = composeProgramExplanation({
      programName: 'Hip and Core Foundation',
      bodyAreas: ['hips', 'deep_core'],
      programAreas: hipsAndCore,
      durationWeeks: 4,
      sessionsPerWeek: 3,
    });
    expect(text).toContain(
      'Your last posture check pointed at your hips and your deep core, so those get attention in every session'
    );
  });

  it('names one area with singular grammar', () => {
    const text = composeProgramExplanation({
      programName: 'Test',
      bodyAreas: ['hips'],
      programAreas: ['hips'],
    });
    expect(text).toContain('so that gets attention in every session');
  });

  it('intersects, and never invents', () => {
    expect(sayableAreas(['neck', 'hips'], ['hips', 'knees'])).toEqual(['hips']);
    expect(sayableAreas(['neck'], [])).toEqual([]);
    expect(sayableAreas([], ['hips'])).toEqual([]);
  });
});

describe('the per-exercise line varies, and stays put', () => {
  const SEED = 'a-program-id';

  it('does not open 24 lines the same way', () => {
    const openers = new Set<string>();
    for (let index = 0; index < 24; index += 1) {
      const line = memberExerciseReasoning({
        block: 'strength',
        movementPattern: 'squat',
        variantSeed: SEED,
        variantIndex: index,
      });
      openers.add(line.split('.')[0]!);
    }
    expect(openers.size).toBeGreaterThan(1);
  });

  it('never opens two consecutive exercises the same way', () => {
    for (let index = 0; index < 24; index += 1) {
      expect(
        openerIndexFor('strength', SEED, index),
        `exercises ${index} and ${index + 1} share an opener`
      ).not.toBe(openerIndexFor('strength', SEED, index + 1));
    }
  });

  it('composes the identical sentence on every render of the same program', () => {
    const once = memberExerciseReasoning({
      block: 'core',
      movementPattern: 'anti_rotation',
      variantSeed: SEED,
      variantIndex: 7,
    });
    const again = memberExerciseReasoning({
      block: 'core',
      movementPattern: 'anti_rotation',
      variantSeed: SEED,
      variantIndex: 7,
    });
    expect(once).toBe(again);
  });

  it('varies differently for a different program', () => {
    const spread = (seed: string) =>
      Array.from({ length: 8 }, (_, i) => openerIndexFor('strength', seed, i)).join('');
    expect(spread('program-a')).not.toBe(spread('program-b'));
  });

  it('falls back to the plain opener when there is no seed at all', () => {
    const line = memberExerciseReasoning({ block: 'strength', movementPattern: 'squat' });
    expect(line.startsWith('This one ')).toBe(true);
  });

  it('sweeps every opener this product can compose for clinical language and em dashes', () => {
    const lines = allComposedOpeners();
    expect(lines.length).toBeGreaterThan(50);
    for (const line of lines) {
      expect(containsClinicalLanguage(line), `leak in: ${line}`).toBe(false);
      expect(line, `em dash in: ${line}`).not.toContain('—');
      expect(line, `exclamation in: ${line}`).not.toContain('!');
    }
  });
});

describe('which exercises get a weight field', () => {
  const shape = (over: Partial<CoachAssignedWorkoutExercise>) =>
    ({
      reps: null,
      rep_range_low: null,
      rep_range_high: null,
      hold_duration_seconds: null,
      time_seconds: null,
      ...over,
    }) as CoachAssignedWorkoutExercise;

  it('gives one to a set of reps', () => {
    expect(acceptsWeightLog(shape({ rep_range_low: 8, rep_range_high: 8 }))).toBe(true);
    expect(acceptsWeightLog(shape({ reps: '10' }))).toBe(true);
  });

  it('gives none to a hold or a timed exercise', () => {
    expect(acceptsWeightLog(shape({ hold_duration_seconds: 60 }))).toBe(false);
    expect(acceptsWeightLog(shape({ time_seconds: 45 }))).toBe(false);
  });

  it('still gives one to a bodyweight strength movement, because people hold dumbbells for glute bridges', () => {
    expect(acceptsWeightLog(shape({ rep_range_low: 8 }))).toBe(true);
  });

  it('reads and formats a number the way she typed it', () => {
    expect(parseLoggedLoad('25')).toBe(25);
    expect(parseLoggedLoad('22.5')).toBe(22.5);
    expect(parseLoggedLoad('')).toBeNull();
    expect(parseLoggedLoad('   ')).toBeNull();
    expect(parseLoggedLoad('abc')).toBeNull();
    expect(parseLoggedLoad('-5')).toBeNull();
    expect(parseLoggedLoad('99999')).toBeNull();
    expect(formatLoggedLoad({ load: 25, unit: 'lbs', perSide: true })).toBe('25 lbs per side');
    expect(formatLoggedLoad({ load: null, unit: 'lbs', perSide: false })).toBeNull();
  });

  it('starts on the unit she used last, then the one her coach prescribed, then pounds', () => {
    expect(initialLoadUnit({ lastLoggedUnit: 'kg', prescribedUnit: 'lbs' })).toBe('kg');
    expect(initialLoadUnit({ lastLoggedUnit: null, prescribedUnit: 'kg' })).toBe('kg');
    expect(initialLoadUnit({ lastLoggedUnit: null, prescribedUnit: 'band' })).toBe('lbs');
    expect(initialLoadUnit({})).toBe('lbs');
  });

  it('says the one line the coach wrote, with no em dash', () => {
    expect(WEIGHT_LOG_HELPER_TEXT).toBe(
      'Log the weight you used. It helps your coach and the app plan your next weeks just right for you.'
    );
    expect(WEIGHT_LOG_HELPER_TEXT).not.toContain('—');
  });
});

describe('the reason sheet and its branches', () => {
  it('offers exactly the nine reasons, in the order asked for', () => {
    expect(FEEDBACK_REASONS.map((option) => option.label)).toEqual([
      'I feel pain or discomfort',
      'Too difficult',
      'Too easy',
      'I do not understand it',
      'I do not have the equipment',
      'Not enough space',
      'Not comfortable doing it',
      'I just do not like it',
      'Something else',
    ]);
  });

  it('carries no em dash and no clinical language in any label or message', () => {
    const strings = [
      ...FEEDBACK_REASONS.map((option) => option.label),
      PAIN_MESSAGE,
      TOO_EASY_MESSAGE,
      NO_OPTIONS_MESSAGE,
      swapConfirmationMessage({ replacementName: 'Bodyweight Split Squat', occurrencesUpdated: 3 }),
    ];
    for (const text of strings) {
      expect(text, `em dash in: ${text}`).not.toContain('—');
      expect(containsClinicalLanguage(text), `leak in: ${text}`).toBe(false);
      expect(text, `exclamation in: ${text}`).not.toContain('!');
    }
  });

  it('routes each reason to the branch it belongs to', () => {
    expect(branchForReason('pain', false)).toBe('safety');
    expect(branchForReason('too_difficult', false)).toBe('regression');
    expect(branchForReason('too_easy', false)).toBe('progression_note');
    for (const reason of ['do_not_understand', 'no_equipment', 'no_space', 'not_comfortable', 'do_not_like'] as const) {
      expect(branchForReason(reason, false)).toBe('alternatives');
    }
  });

  it('sends her own pain words down the safety branch even from the Other box', () => {
    expect(readsAsPain('my knee is really hurting')).toBe(true);
    expect(readsAsPain('sharp twinge in my back')).toBe(true);
    expect(readsAsPain('this one aches afterwards')).toBe(true);
    expect(readsAsPain('I get numbness in my hand')).toBe(true);
    expect(branchForReason('other', readsAsPain('my shoulder hurts'))).toBe('safety');
  });

  it('does not read a preference as pain', () => {
    expect(readsAsPain('it is boring')).toBe(false);
    expect(readsAsPain('no room in my flat')).toBe(false);
    expect(readsAsPain('')).toBe(false);
    expect(branchForReason('other', readsAsPain('I find it boring'))).toBe('alternatives');
  });

  it('stops for pain, offers nothing, and tells the coach', () => {
    const decision = exerciseSafetyDecision({ exerciseName: 'Split Squat' });
    expect(decision.stop).toBe(true);
    expect(decision.offerAlternatives).toBe(false);
    expect(decision.notifyCoach).toBe(true);
    expect(decision.recommendedAlternative).toBe('coach_review');
  });

  it('avoids immediately for pain, and only on repetition for a dislike', () => {
    expect(avoidanceSourceFor({ branch: 'safety', reason: 'pain', reportCount: 1 })).toBe('pain');
    expect(avoidanceSourceFor({ branch: 'alternatives', reason: 'do_not_like', reportCount: 1 })).toBeNull();
    expect(avoidanceSourceFor({ branch: 'alternatives', reason: 'do_not_like', reportCount: 2 })).toBe(
      'repeated_dislike'
    );
    expect(avoidanceSourceFor({ branch: 'alternatives', reason: 'no_equipment', reportCount: 5 })).toBeNull();
  });

  it('says the right thing on each branch', () => {
    expect(branchMessage({ branch: 'safety', isLocked: false, optionCount: 0 })).toBe(PAIN_MESSAGE);
    expect(branchMessage({ branch: 'progression_note', isLocked: false, optionCount: 0 })).toBe(
      TOO_EASY_MESSAGE
    );
    expect(branchMessage({ branch: 'alternatives', isLocked: false, optionCount: 0 })).toBe(
      NO_OPTIONS_MESSAGE
    );
    expect(branchMessage({ branch: 'alternatives', isLocked: true, optionCount: 0 })).toContain(
      'Your coach chose this one specifically'
    );
  });

  it('flags the coach on exactly the two branches that need a decision', () => {
    expect(
      feedbackAttentionReasons([{ member_id: MEMBER, branch: 'safety', coach_reviewed_at: null }])
    ).toEqual([PAIN_STOP_REASON]);
    expect(
      feedbackAttentionReasons([
        { member_id: MEMBER, branch: 'progression_note', coach_reviewed_at: null },
      ])
    ).toEqual([READY_TO_PROGRESS_REASON]);
    // Not a reason to flag anybody: she asked for a different exercise and
    // got one.
    expect(
      feedbackAttentionReasons([{ member_id: MEMBER, branch: 'alternatives', coach_reviewed_at: null }])
    ).toEqual([]);
    // Reviewed is reviewed.
    expect(
      feedbackAttentionReasons([
        { member_id: MEMBER, branch: 'safety', coach_reviewed_at: '2026-08-18T00:00:00Z' },
      ])
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// The offer rules, against literals rather than a database.
// ---------------------------------------------------------------------

const splitSquat: SwapCandidate = {
  provider: 'your_move',
  externalId: 'split-squat',
  name: 'Split Squat',
  isClientAssignable: true,
  block: 'strength',
  equipment: 'dumbbell',
  difficulty: 'intermediate',
};

const bodyweightSplitSquat: SwapCandidate = {
  provider: 'your_move',
  externalId: 'bodyweight-split-squat',
  name: 'Bodyweight Split Squat',
  isClientAssignable: true,
  block: 'strength',
  equipment: 'bodyweight',
  difficulty: 'intermediate',
};

const bulgarianSplitSquat: SwapCandidate = {
  provider: 'your_move',
  externalId: 'bulgarian',
  name: 'Bulgarian split squat with Dumbbell',
  isClientAssignable: true,
  block: 'strength',
  equipment: 'dumbbell',
  difficulty: 'advanced',
};

const gobletSquat: SwapCandidate = {
  provider: 'your_move',
  externalId: 'goblet',
  name: 'Dumbbell Goblet Squat',
  isClientAssignable: true,
  block: 'strength',
  equipment: 'dumbbell',
  difficulty: 'beginner',
};

const noVideo: SwapCandidate = {
  provider: 'your_move',
  externalId: 'no-video',
  name: 'Unfilmed Movement',
  isClientAssignable: false,
  block: 'strength',
  equipment: 'bodyweight',
  difficulty: 'beginner',
};

const ALL_CANDIDATES = [
  splitSquat,
  bodyweightSplitSquat,
  bulgarianSplitSquat,
  gobletSquat,
  noVideo,
];

function offerInput(over: Partial<Parameters<typeof offersForFeedback>[0]> = {}) {
  return {
    reason: 'no_equipment' as const,
    isLocked: false,
    original: splitSquat,
    block: 'strength' as const,
    criteria: {},
    candidates: ALL_CANDIDATES,
    avoidedExternalIds: [] as string[],
    memberEquipment: null,
    ...over,
  };
}

describe('what she is offered instead', () => {
  it('offers nothing at all for pain', () => {
    expect(offersNothing('pain', false)).toBe(true);
    expect(offersForFeedback(offerInput({ reason: 'pain' }))).toEqual([]);
  });

  it('offers nothing at all for too easy, and never anything harder', () => {
    expect(offersNothing('too_easy', false)).toBe(true);
    expect(offersForFeedback(offerInput({ reason: 'too_easy' }))).toEqual([]);
  });

  it('offers nothing on a locked exercise, whatever the reason', () => {
    for (const option of FEEDBACK_REASONS) {
      expect(
        offersForFeedback(offerInput({ reason: option.value, isLocked: true })),
        `${option.value} produced an offer on a locked exercise`
      ).toEqual([]);
    }
  });

  it('offers Bodyweight Split Squat first when Split Squat is too difficult', () => {
    const options = offersForFeedback(offerInput({ reason: 'too_difficult' }));
    expect(options.length).toBeGreaterThan(0);
    expect(options[0]!.name).toBe('Bodyweight Split Squat');
    expect(options[0]!.note).toBe('Same movement, no weight to hold.');
  });

  it('never offers anything harder for too difficult', () => {
    const options = offersForFeedback(offerInput({ reason: 'too_difficult' }));
    expect(options.map((option) => option.name)).not.toContain('Bulgarian split squat with Dumbbell');
  });

  it('knows a regression from a lateral move and from a progression', () => {
    expect(isRegressionOf(splitSquat, bodyweightSplitSquat)).toBe(true);
    expect(isRegressionOf(splitSquat, gobletSquat)).toBe(true);
    expect(isRegressionOf(splitSquat, bulgarianSplitSquat)).toBe(false);
    // A movement at the same grade, still loaded, is a sideways move.
    expect(
      isRegressionOf(splitSquat, { ...gobletSquat, difficulty: 'intermediate', equipment: 'dumbbell' })
    ).toBe(false);
  });

  it('recognises the same movement done without the load', () => {
    expect(sameMovementFamily('Split Squat', 'Bodyweight Split Squat')).toBe(true);
    expect(sameMovementFamily('Split Squat', 'Dumbbell Goblet Squat')).toBe(false);
  });

  it('answers missing equipment with something that needs none', () => {
    const options = offersForFeedback(offerInput({ reason: 'no_equipment' }));
    expect(options.map((option) => option.name)).toEqual(['Bodyweight Split Squat']);
    expect(options[0]!.note).toBe('Nothing to hold, just you and the floor.');
  });

  it('never offers an exercise with no video', () => {
    for (const option of FEEDBACK_REASONS) {
      const options = offersForFeedback(offerInput({ reason: option.value }));
      expect(options.map((o) => o.externalId)).not.toContain('no-video');
    }
  });

  it('never offers the exercise she already has', () => {
    const options = offersForFeedback(offerInput({ reason: 'do_not_like' }));
    expect(options.map((option) => option.externalId)).not.toContain(splitSquat.externalId);
  });

  it('never offers anything in her avoidance history, on any branch', () => {
    for (const reason of ['too_difficult', 'no_equipment', 'do_not_like', 'no_space', 'not_comfortable', 'do_not_understand'] as const) {
      const options = offersForFeedback(
        offerInput({ reason, avoidedExternalIds: ['bodyweight-split-squat', 'goblet'] })
      );
      const ids = options.map((option) => option.externalId);
      expect(ids, `${reason} offered an avoided exercise`).not.toContain('bodyweight-split-squat');
      expect(ids, `${reason} offered an avoided exercise`).not.toContain('goblet');
    }
  });

  it('respects the slot criteria the coach set', () => {
    const options = offersForFeedback(
      offerInput({ reason: 'do_not_like', criteria: { max_difficulty: 'beginner' } })
    );
    expect(options.map((option) => option.name)).toEqual(['Dumbbell Goblet Squat']);
  });

  it('never offers more than three', () => {
    const many: SwapCandidate[] = Array.from({ length: 12 }, (_, i) => ({
      provider: 'your_move',
      externalId: `bulk-${i}`,
      name: `Bulk Movement ${i}`,
      isClientAssignable: true,
      block: 'strength',
      equipment: 'bodyweight',
      difficulty: 'beginner',
    }));
    const options = offersForFeedback(offerInput({ reason: 'do_not_like', candidates: many }));
    expect(options.length).toBeLessThanOrEqual(MAX_OFFERS);
    expect(options).toHaveLength(3);
  });

  it('excludes what she does not own, when her profile says what she owns', () => {
    const options = offersForFeedback(
      offerInput({ reason: 'do_not_like', memberEquipment: ['bodyweight'] })
    );
    expect(options.map((option) => option.name)).not.toContain('Dumbbell Goblet Squat');
  });

  it('carries no clinical language and no difficulty grade in any note she reads', () => {
    for (const reason of ['too_difficult', 'no_equipment', 'no_space', 'do_not_like', 'do_not_understand', 'not_comfortable'] as const) {
      for (const option of offersForFeedback(offerInput({ reason }))) {
        expect(containsClinicalLanguage(option.note)).toBe(false);
        expect(option.note).not.toContain('—');
        expect(option.note.toLowerCase()).not.toContain('regression');
        expect(option.note.toLowerCase()).not.toContain('beginner');
        expect(option.note.toLowerCase()).not.toContain('advanced');
      }
    }
  });
});

// ---------------------------------------------------------------------
// Against the real database.
// ---------------------------------------------------------------------

let versionId: string;
let programId: string;
let assignmentIds: string[] = [];
let memberClient: SupabaseClient;
/** Every occurrence of the swappable exercise, oldest first. */
let occurrences: { id: string; scheduledDate: string; workoutId: string }[] = [];
let lockedExerciseRowId: string;
const createdProgramIds: string[] = [];

const TODAY = '2026-09-01';

beforeAll(async () => {
  const supabase = serviceRoleClient();
  memberClient = await signInAs(TEST_USERS.memberOne);

  const { data: program, error } = await supabase
    .from('movement_programs')
    .insert({ key: TEST_KEY, display_name: 'Member Voice Fixture' })
    .select('id')
    .single();
  if (error) throw new Error(`member voice fixture (program) failed: ${error.message}`);
  programId = program!.id;
  createdProgramIds.push(programId);

  const { data: version, error: versionError } = await supabase
    .from('movement_program_versions')
    .insert({
      program_id: programId,
      version_number: 1,
      display_name: 'Member Voice Fixture v1',
      status: 'approved',
      approved_at: new Date().toISOString(),
      // Approval has to be attributable (migration 174's own constraint).
      approved_by: TEST_USERS.adminOne.id,
      member_title: 'Member Voice Fixture',
      member_description: 'A short program used only by the test suite.',
      coach_purpose: 'Proving the member voice.',
      duration_weeks: 4,
      sessions_per_week: 1,
      equipment_mode: 'home',
    })
    .select('id')
    .single();
  if (versionError) throw new Error(`member voice fixture (version) failed: ${versionError.message}`);
  versionId = version!.id;

  // Real, client-assignable exercises, looked up by name exactly as the
  // migrations do, so this fixture cannot drift from the catalog. Split
  // Squat is the canonical regression case and Bodyweight Split Squat is
  // the answer to it, which is why both are named here.
  const { data: catalog } = await supabase
    .from('exercise_catalog')
    .select('provider, external_id, name')
    .in('name', ['Split Squat', 'Bodyweight Split Squat', 'Plank']);
  const byName = new Map((catalog ?? []).map((c) => [c.name as string, c]));
  const pick = (name: string) => {
    const row = byName.get(name);
    if (!row) throw new Error(`member voice fixture: ${name} is not in the catalog`);
    return row;
  };
  const squat = pick('Split Squat');
  const plank = pick('Plank');

  const { error: slotError } = await supabase.from('program_blueprint_slots').insert([
    {
      program_version_id: versionId,
      session_designation: 'A',
      slot_order: 1,
      block: 'strength',
      movement_pattern: 'lunge',
      priority_rank: 1,
      is_locked: false,
      is_per_side: true,
      replacement_criteria: {},
      equipment_requirement: ['dumbbell'],
      sets: 3,
      reps: 8,
      rest_seconds: 75,
      week_overrides: {},
      provider: squat.provider,
      external_id: squat.external_id,
      exercise_name: squat.name,
    },
    {
      program_version_id: versionId,
      session_designation: 'A',
      slot_order: 2,
      block: 'core',
      movement_pattern: 'anti_extension',
      priority_rank: 2,
      // The lock, which is what makes this exercise unswappable by her.
      is_locked: true,
      is_per_side: false,
      replacement_criteria: {},
      equipment_requirement: [],
      sets: 2,
      hold_duration_seconds: 30,
      rest_seconds: 30,
      week_overrides: {},
      provider: plank.provider,
      external_id: plank.external_id,
      exercise_name: plank.name,
    },
  ]);
  if (slotError) throw new Error(`member voice fixture (slots) failed: ${slotError.message}`);

  const blueprint = (await getBlueprintVersion(supabase, versionId)) as BlueprintWithSlots;
  const assigned = await assignBlueprintToMember(supabase, {
    blueprint,
    memberId: MEMBER,
    coachId: COACH,
    startDate: TODAY,
    durationWeeks: 4,
    today: TODAY,
    timezone: 'America/New_York',
    publish: true,
  });
  if (!assigned) throw new Error('member voice fixture: assignment failed');
  assignmentIds = assigned.assignmentIds;

  const { data: rows } = await supabase
    .from('coach_assigned_workout_exercises')
    .select('id, external_id, is_locked, assigned_workout_id, coach_assigned_workouts(scheduled_date)')
    .eq('member_id', MEMBER)
    .in('assigned_workout_id',
      (
        await supabase
          .from('coach_assigned_workouts')
          .select('id')
          .in('assignment_id', assignmentIds)
      ).data?.map((w) => w.id) ?? []
    );

  occurrences = (rows ?? [])
    .filter((row) => row.external_id === squat.external_id)
    .map((row) => ({
      id: row.id as string,
      workoutId: row.assigned_workout_id as string,
      scheduledDate:
        (row.coach_assigned_workouts as unknown as { scheduled_date: string }).scheduled_date,
    }))
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  lockedExerciseRowId = (rows ?? []).find((row) => row.external_id === plank.external_id)!
    .id as string;

  if (occurrences.length < 3) {
    throw new Error(`member voice fixture: expected several occurrences, got ${occurrences.length}`);
  }
});

afterAll(async () => {
  const supabase = serviceRoleClient();
  await supabase.from('member_exercise_avoidance').delete().eq('member_id', MEMBER);
  await supabase.from('member_exercise_feedback').delete().eq('member_id', MEMBER);
  for (const assignmentId of assignmentIds) {
    await supabase.from('coach_program_assignments').delete().eq('id', assignmentId);
  }
  const { data: templates } = await supabase
    .from('coach_program_templates')
    .select('id')
    .contains('program_tags', [`blueprint-version:${versionId}`]);
  for (const template of templates ?? []) {
    await supabase.from('coach_program_templates').delete().eq('id', template.id);
  }
  for (const id of createdProgramIds) {
    await supabase.from('movement_programs').delete().eq('id', id);
  }
  await memberClient.auth.signOut();
});

describe('what she lifted, against the real database', () => {
  it('carries the slot rules into the frozen row', async () => {
    const { data } = await memberClient
      .from('coach_assigned_workout_exercises')
      .select('movement_pattern, is_locked, replacement_criteria, unilateral')
      .eq('id', occurrences[0]!.id)
      .single();
    expect(data!.movement_pattern).toBe('lunge');
    expect(data!.is_locked).toBe(false);
    expect(data!.replacement_criteria).toEqual({});
    expect(data!.unilateral).toBe(true);

    const { data: locked } = await memberClient
      .from('coach_assigned_workout_exercises')
      .select('is_locked')
      .eq('id', lockedExerciseRowId)
      .single();
    expect(locked!.is_locked).toBe(true);
  });

  it('persists a weight on one occurrence and prefills the next from it', async () => {
    const { error } = await memberClient
      .from('coach_assigned_workout_exercises')
      .update({
        logged_load: 25,
        logged_load_unit: 'lbs',
        logged_load_per_side: true,
        logged_load_at: new Date().toISOString(),
      })
      .eq('id', occurrences[0]!.id);
    expect(error).toBeNull();

    const { data: saved } = await memberClient
      .from('coach_assigned_workout_exercises')
      .select('logged_load, logged_load_unit, logged_load_per_side')
      .eq('id', occurrences[0]!.id)
      .single();
    expect(Number(saved!.logged_load)).toBe(25);
    expect(saved!.logged_load_unit).toBe('lbs');
    expect(saved!.logged_load_per_side).toBe(true);

    // The next occurrence has none of its own, and the prefill read finds
    // what she used last time.
    const { data: next } = await memberClient
      .from('coach_assigned_workout_exercises')
      .select('logged_load')
      .eq('id', occurrences[1]!.id)
      .single();
    expect(next!.logged_load).toBeNull();

    const previous = await lastLoggedLoadFor(memberClient, MEMBER, 'split-squat-missing');
    expect(previous).toBeNull();

    const { data: exercise } = await memberClient
      .from('coach_assigned_workout_exercises')
      .select('external_id')
      .eq('id', occurrences[1]!.id)
      .single();
    const found = await lastLoggedLoadFor(memberClient, MEMBER, exercise!.external_id as string);
    expect(found).not.toBeNull();
    expect(found!.load).toBe(25);
    expect(found!.unit).toBe('lbs');
    expect(found!.perSide).toBe(true);
  });

  it('refuses a nonsense weight at the database, not only in the screen', async () => {
    const { error } = await memberClient
      .from('coach_assigned_workout_exercises')
      .update({ logged_load: -10 })
      .eq('id', occurrences[2]!.id);
    expect(error).not.toBeNull();
  });
});

describe('a swap rewrites the future and leaves the past alone', () => {
  it('targets this occurrence and every later one, and nothing already done', async () => {
    // The first occurrence is history: she did it.
    await memberClient
      .from('coach_assigned_workout_exercises')
      .update({ status: 'completed' })
      .eq('id', occurrences[0]!.id);

    const { data: exercise } = await memberClient
      .from('coach_assigned_workout_exercises')
      .select('external_id')
      .eq('id', occurrences[1]!.id)
      .single();

    const targets = await findSwapTargets(memberClient, {
      memberId: MEMBER,
      assignedWorkoutExerciseId: occurrences[1]!.id,
      assignmentIds,
      externalId: exercise!.external_id as string,
      // As if today were the second occurrence's own date.
      today: occurrences[1]!.scheduledDate,
    });

    expect(targets).toContain(occurrences[1]!.id);
    expect(targets).toContain(occurrences[2]!.id);
    expect(targets).not.toContain(occurrences[0]!.id);
  });

  it('rewrites the exercise on those rows and keeps the prescription exactly as the coach wrote it', async () => {
    const { data: before } = await memberClient
      .from('coach_assigned_workout_exercises')
      .select('sets, rep_range_low, rest_seconds, unilateral, exercise_name, external_id')
      .eq('id', occurrences[1]!.id)
      .single();

    const { data: replacement } = await serviceRoleClient()
      .from('exercise_catalog')
      .select('provider, external_id, name')
      .eq('name', 'Bodyweight Split Squat')
      .single();

    const updated = await applySwap(memberClient, {
      exerciseRowIds: [occurrences[1]!.id, occurrences[2]!.id],
      provider: replacement!.provider as string,
      externalId: replacement!.external_id as string,
      exerciseName: replacement!.name as string,
      memberReasoning: 'You chose this one in place of the exercise that was here.',
      previousExternalId: before!.external_id as string,
      previousExerciseName: before!.exercise_name as string,
    });
    expect(updated).toBe(2);

    const { data: after } = await memberClient
      .from('coach_assigned_workout_exercises')
      .select('sets, rep_range_low, rest_seconds, unilateral, exercise_name, swapped_from_exercise_name, swapped_at')
      .eq('id', occurrences[1]!.id)
      .single();

    expect(after!.exercise_name).toBe('Bodyweight Split Squat');
    expect(after!.swapped_from_exercise_name).toBe('Split Squat');
    expect(after!.swapped_at).not.toBeNull();
    // The dose is untouched. The slot's job did not change.
    expect(after!.sets).toBe(before!.sets);
    expect(after!.rep_range_low).toBe(before!.rep_range_low);
    expect(after!.rest_seconds).toBe(before!.rest_seconds);
    expect(after!.unilateral).toBe(before!.unilateral);
  });

  it('leaves the occurrence she already did exactly as she did it', async () => {
    const { data } = await memberClient
      .from('coach_assigned_workout_exercises')
      .select('exercise_name, swapped_at, status')
      .eq('id', occurrences[0]!.id)
      .single();
    expect(data!.exercise_name).toBe('Split Squat');
    expect(data!.swapped_at).toBeNull();
    expect(data!.status).toBe('completed');
  });
});

describe('the safety branch, against the real database', () => {
  it('stops the exercise, records the report, flags the coach and writes the avoidance', async () => {
    const target = occurrences[2]!;
    const { data: exercise } = await memberClient
      .from('coach_assigned_workout_exercises')
      .select('provider, external_id, exercise_name, assigned_workout_id')
      .eq('id', target.id)
      .single();

    const stopped = await markExerciseStopped(memberClient, target.id);
    expect(stopped).toBe(true);

    const feedback = await recordExerciseFeedback(memberClient, {
      memberId: MEMBER,
      coachId: COACH,
      assignedWorkoutExerciseId: target.id,
      assignedWorkoutId: exercise!.assigned_workout_id as string,
      assignmentId: assignmentIds[0]!,
      programGroupKey: null,
      programWeek: 1,
      provider: exercise!.provider as string,
      externalId: exercise!.external_id as string,
      exerciseName: exercise!.exercise_name as string,
      reason: 'pain',
      otherText: null,
      branch: 'safety',
      outcome: 'stopped_for_pain',
      coachNotified: true,
    });
    expect(feedback).not.toBeNull();
    expect(feedback!.branch).toBe('safety');
    expect(feedback!.outcome).toBe('stopped_for_pain');
    expect(feedback!.coach_notified).toBe(true);
    // No replacement was offered, so none was recorded.
    expect(feedback!.replacement_external_id).toBeNull();

    const wrote = await recordAvoidance(memberClient, {
      memberId: MEMBER,
      provider: exercise!.provider as string,
      externalId: exercise!.external_id as string,
      exerciseName: exercise!.exercise_name as string,
      source: 'pain',
      feedbackId: feedback!.id,
    });
    expect(wrote).toBe(true);

    const { data: row } = await memberClient
      .from('coach_assigned_workout_exercises')
      .select('status, stopped_at, comfort_rating')
      .eq('id', target.id)
      .single();
    expect(row!.status).toBe('stopped');
    expect(row!.stopped_at).not.toBeNull();
    expect(row!.comfort_rating).toBe('pain');

    const avoided = await loadAvoidedExternalIds(memberClient, MEMBER);
    expect(avoided).toContain(exercise!.external_id as string);
  });

  it('never offers a pain-flagged exercise again, on any branch', async () => {
    const avoided = await loadAvoidedExternalIds(memberClient, MEMBER);
    for (const option of FEEDBACK_REASONS) {
      const options = offersForFeedback(
        offerInput({ reason: option.value, avoidedExternalIds: avoided })
      );
      for (const offer of options) {
        expect(avoided, `${option.value} offered an avoided exercise`).not.toContain(
          offer.externalId
        );
      }
    }
  });

  it('is visible to her coach and invisible to another member', async () => {
    const coach = await signInAs(TEST_USERS.coachOne);
    const { data: coachSees } = await coach
      .from('member_exercise_feedback')
      .select('id, reason')
      .eq('member_id', MEMBER);
    expect((coachSees ?? []).length).toBeGreaterThan(0);
    await coach.auth.signOut();

    const other = await signInAs(TEST_USERS.memberTwo);
    const { data: otherSees } = await other
      .from('member_exercise_feedback')
      .select('id')
      .eq('member_id', MEMBER);
    expect(otherSees ?? []).toHaveLength(0);
    await other.auth.signOut();
  });

  it('refuses a report a member tries to file against somebody else', async () => {
    const { error } = await memberClient.from('member_exercise_feedback').insert({
      member_id: TEST_USERS.memberTwo.id,
      external_id: 'anything',
      exercise_name: 'Anything',
      reason: 'do_not_like',
      branch: 'alternatives',
      outcome: 'kept_original',
    });
    expect(error).not.toBeNull();
  });

  it('records a stop with an honest confirmation sentence and no options', () => {
    expect(swapConfirmationMessage({ replacementName: 'Plank', occurrencesUpdated: 1 })).toContain(
      'It is in place for your next 1 session'
    );
    expect(PAIN_MESSAGE).toContain('your coach will take a look');
    expect(PAIN_MESSAGE).not.toContain('instead');
  });
});
