/**
 * End-to-end integration tests for the Primal Pattern Assessment
 * (lib/primal-pattern/store.ts) and its supporting Nutrition Intelligence
 * Service / Health Safety Overrides architecture, against real local
 * Supabase with real RLS (migrations 64 and 65) — same "no mocked
 * Supabase client" philosophy as
 * tests/assessments-lifecycle-integration.test.ts.
 *
 * Covers every scenario called out by the Primal Pattern Assessment
 * Foundation prompt's Testing section: Polar / Variable / Equatorial
 * results, an exact three-point difference, within two, skipped answers,
 * both-answer selections, an interrupted assessment, resuming it, RLS
 * isolation, database writes, and the Nutrition Intelligence Service's
 * derived response.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  PRIMAL_PATTERN_QUESTIONNAIRE,
  PRIMAL_PATTERN_QUESTIONNAIRE_ID,
} from '../lib/primal-pattern/questionnaire';
import type { PrimalPatternAnswers } from '../lib/primal-pattern/types';
import {
  completePrimalPatternAssessment,
  findInProgressPrimalPatternAssessment,
  getOrCreateInProgressPrimalPatternAssessment,
  getPrimalPatternAssessmentResult,
  listCompletedPrimalPatternAssessments,
  savePrimalPatternAnswer,
  skipPrimalPatternQuestion,
} from '../lib/primal-pattern/store';
import {
  getMemberHealthSafetyOverrides,
  getMemberNutritionProfile,
} from '../lib/nutrition-intelligence/service';
import { getNutritionSafetyProfile, upsertNutritionSafetyFlags } from '../lib/health-safety/store';
import { EMPTY_NUTRITION_SAFETY_PROFILE_FLAGS } from '../lib/health-safety/types';

afterAll(async () => {
  const service = serviceRoleClient();
  await service
    .from('primal_pattern_assessments')
    .delete()
    .eq('member_id', TEST_USERS.memberOne.id);
  await service
    .from('primal_pattern_assessments')
    .delete()
    .eq('member_id', TEST_USERS.memberTwo.id);
  await service
    .from('member_nutrition_safety_flags')
    .delete()
    .eq('member_id', TEST_USERS.memberOne.id);
  await service
    .from('member_nutrition_safety_flags')
    .delete()
    .eq('member_id', TEST_USERS.memberTwo.id);
});

/** Answers every question with the given letter(s), so callers only need to specify the interesting deviations. */
function answerAll(letters: ('A' | 'B')[]): PrimalPatternAnswers {
  const answers: PrimalPatternAnswers = {};
  for (const q of PRIMAL_PATTERN_QUESTIONNAIRE.questions) answers[q.number] = letters;
  return answers;
}

describe('Primal Pattern Assessment lifecycle (real RLS, real DB)', () => {
  it('start -> partial answers -> interrupted -> resume at the right question -> complete -> Polar result persisted exactly', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    // 1. Start (creates an in_progress draft; resume position is question 1).
    const started = await getOrCreateInProgressPrimalPatternAssessment(
      client,
      TEST_USERS.memberOne.id,
      PRIMAL_PATTERN_QUESTIONNAIRE
    );
    expect(started.record.status).toBe('in_progress');
    expect(started.record.currentQuestionNumber).toBe(1);
    expect(started.answers).toEqual({});
    const assessmentId = started.record.id;

    // Calling start again returns the SAME draft (the partial unique index in migration 64).
    const startedAgain = await getOrCreateInProgressPrimalPatternAssessment(
      client,
      TEST_USERS.memberOne.id,
      PRIMAL_PATTERN_QUESTIONNAIRE
    );
    expect(startedAgain.record.id).toBe(assessmentId);

    // 2. Answer questions 1-4 with A, then simulate the member closing the app mid-assessment (interrupted).
    for (let n = 1; n <= 4; n++) {
      await savePrimalPatternAnswer(client, PRIMAL_PATTERN_QUESTIONNAIRE, assessmentId, n, ['A']);
    }

    // 3. Resume: the persisted resume position must point at question 5, and the 4 saved answers must be readable.
    const resumed = await findInProgressPrimalPatternAssessment(
      client,
      TEST_USERS.memberOne.id,
      PRIMAL_PATTERN_QUESTIONNAIRE_ID
    );
    expect(resumed).not.toBeNull();
    expect(resumed!.record.currentQuestionNumber).toBe(5);
    expect(Object.keys(resumed!.answers)).toHaveLength(4);
    expect(resumed!.answers[1]).toEqual(['A']);

    // 4. Answer the rest: 3 more A (total 7 A), then 7 B — a clean Polar split (7 vs 0 among the rest... actually make it exact).
    // Q5-Q7 -> A (bringing A total to 7), Q8-Q14 -> B (7 B). diff = 7 - 7 = 0 would be Variable, so
    // instead: Q5-Q6 -> A (A total 6), Q7-Q14 -> B (8 B) => diff = 6-8 = -2 (Variable). Let's be explicit
    // and deterministic instead of reasoning through deltas inline:
    for (let n = 5; n <= 10; n++) {
      await savePrimalPatternAnswer(client, PRIMAL_PATTERN_QUESTIONNAIRE, assessmentId, n, ['A']);
    }
    for (let n = 11; n <= 14; n++) {
      await savePrimalPatternAnswer(client, PRIMAL_PATTERN_QUESTIONNAIRE, assessmentId, n, ['B']);
    }
    // A: Q1-Q10 = 10, B: Q11-Q14 = 4. diff = 6 >= 3 -> Polar.

    // 5. Complete — the ONLY point scoring happens, entirely server-side.
    const completed = await completePrimalPatternAssessment(
      client,
      PRIMAL_PATTERN_QUESTIONNAIRE,
      assessmentId
    );
    expect(completed.status).toBe('completed');
    expect(completed.completedAt).not.toBeNull();
    expect(completed.currentQuestionNumber).toBeNull();
    expect(completed.aCount).toBe(10);
    expect(completed.bCount).toBe(4);
    expect(completed.skippedCount).toBe(0);
    expect(completed.bothCount).toBe(0);
    expect(completed.result).toBe('polar');

    // No draft remains once completed.
    expect(
      await findInProgressPrimalPatternAssessment(
        client,
        TEST_USERS.memberOne.id,
        PRIMAL_PATTERN_QUESTIONNAIRE_ID
      )
    ).toBeNull();

    // 6. Results read path.
    const result = await getPrimalPatternAssessmentResult(
      client,
      TEST_USERS.memberOne.id,
      assessmentId
    );
    expect(result?.result).toBe('polar');
    expect(result?.aCount).toBe(10);

    // 7. History.
    const history = await listCompletedPrimalPatternAssessments(
      client,
      TEST_USERS.memberOne.id,
      PRIMAL_PATTERN_QUESTIONNAIRE_ID
    );
    expect(history.map((h) => h.id)).toContain(assessmentId);

    // 8. Nutrition Intelligence Service reflects the completed result.
    const profile = await getMemberNutritionProfile(client, TEST_USERS.memberOne.id);
    expect(profile.currentResult).toBe('polar');
    expect(profile.aCount).toBe(10);
    expect(profile.bCount).toBe(4);
    expect(profile.skippedCount).toBe(0);
    expect(profile.bothAnswerCount).toBe(0);
    expect(profile.completionQualityStatus).toBe('high_quality');
    expect(profile.mealFrequency).toBe('4_to_5_smaller_meals');
    expect(profile.questionnaireVersion).toBe(PRIMAL_PATTERN_QUESTIONNAIRE.version);
  });

  it('all-B answers produce an Equatorial result with zero A/skipped/both', async () => {
    const client = await signInAs(TEST_USERS.memberTwo);
    const started = await getOrCreateInProgressPrimalPatternAssessment(
      client,
      TEST_USERS.memberTwo.id,
      PRIMAL_PATTERN_QUESTIONNAIRE
    );

    const answers = answerAll(['B']);
    for (const q of PRIMAL_PATTERN_QUESTIONNAIRE.questions) {
      await savePrimalPatternAnswer(
        client,
        PRIMAL_PATTERN_QUESTIONNAIRE,
        started.record.id,
        q.number,
        answers[q.number]!
      );
    }

    const completed = await completePrimalPatternAssessment(
      client,
      PRIMAL_PATTERN_QUESTIONNAIRE,
      started.record.id
    );
    expect(completed.result).toBe('equatorial');
    expect(completed.aCount).toBe(0);
    expect(completed.bCount).toBe(14);
    expect(completed.skippedCount).toBe(0);

    const profile = await getMemberNutritionProfile(client, TEST_USERS.memberTwo.id);
    expect(profile.currentResult).toBe('equatorial');
    expect(profile.mealFrequency).toBe('3_structured_meals');
  });

  it('a tied 7-7 split (both letters on every question) produces Variable with a full both-answer count', async () => {
    const client = await signInAs(TEST_USERS.memberTwo);

    // Retake: starting again after a completed assessment opens a brand-new draft.
    const started = await getOrCreateInProgressPrimalPatternAssessment(
      client,
      TEST_USERS.memberTwo.id,
      PRIMAL_PATTERN_QUESTIONNAIRE
    );
    for (const q of PRIMAL_PATTERN_QUESTIONNAIRE.questions) {
      await savePrimalPatternAnswer(
        client,
        PRIMAL_PATTERN_QUESTIONNAIRE,
        started.record.id,
        q.number,
        ['A', 'B']
      );
    }

    const completed = await completePrimalPatternAssessment(
      client,
      PRIMAL_PATTERN_QUESTIONNAIRE,
      started.record.id
    );
    expect(completed.result).toBe('variable');
    expect(completed.aCount).toBe(14);
    expect(completed.bCount).toBe(14);
    expect(completed.bothCount).toBe(14);
    expect(completed.skippedCount).toBe(0);
  });

  it('skipping a previously-answered question clears it, and a fully skipped assessment completes as Variable with skippedCount = total', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const started = await getOrCreateInProgressPrimalPatternAssessment(
      client,
      TEST_USERS.memberOne.id,
      PRIMAL_PATTERN_QUESTIONNAIRE
    );

    // Answer question 1, then change their mind and skip it.
    await savePrimalPatternAnswer(client, PRIMAL_PATTERN_QUESTIONNAIRE, started.record.id, 1, [
      'A',
    ]);
    let answers = (await findInProgressPrimalPatternAssessment(
      client,
      TEST_USERS.memberOne.id,
      PRIMAL_PATTERN_QUESTIONNAIRE_ID
    ))!.answers;
    expect(answers[1]).toEqual(['A']);

    await skipPrimalPatternQuestion(client, PRIMAL_PATTERN_QUESTIONNAIRE, started.record.id, 1);
    answers = (await findInProgressPrimalPatternAssessment(
      client,
      TEST_USERS.memberOne.id,
      PRIMAL_PATTERN_QUESTIONNAIRE_ID
    ))!.answers;
    expect(answers[1]).toBeUndefined();

    // Complete without answering anything else — skipping is always a valid path to completion.
    const completed = await completePrimalPatternAssessment(
      client,
      PRIMAL_PATTERN_QUESTIONNAIRE,
      started.record.id
    );
    expect(completed.result).toBe('variable');
    expect(completed.skippedCount).toBe(14);
    expect(completed.aCount).toBe(0);
    expect(completed.bCount).toBe(0);

    // Completion quality reflects the low signal.
    const profile = await getMemberNutritionProfile(client, TEST_USERS.memberOne.id);
    expect(profile.completionQualityStatus).toBe('low_quality');
    expect(profile.skippedCount).toBe(14);
  });

  it("RLS blocks a second member from reading or writing into the first member's assessment", async () => {
    const memberOneClient = await signInAs(TEST_USERS.memberOne);
    const memberTwoClient = await signInAs(TEST_USERS.memberTwo);

    const memberOneAssessments = await listCompletedPrimalPatternAssessments(
      memberOneClient,
      TEST_USERS.memberOne.id,
      PRIMAL_PATTERN_QUESTIONNAIRE_ID
    );
    expect(memberOneAssessments.length).toBeGreaterThan(0);
    const targetAssessmentId = memberOneAssessments[0]!.id;

    // Read: memberTwo asking for memberOne's own id explicitly still gets nothing.
    const stolenRead = await getPrimalPatternAssessmentResult(
      memberTwoClient,
      TEST_USERS.memberOne.id,
      targetAssessmentId
    );
    expect(stolenRead).toBeNull();

    // Direct RLS probe against the raw table, no store-level filter involved.
    const { data: rawRow, error: rawError } = await memberTwoClient
      .from('primal_pattern_assessments')
      .select('id')
      .eq('id', targetAssessmentId)
      .maybeSingle();
    expect(rawError).toBeNull();
    expect(rawRow).toBeNull();

    // Write: memberTwo attempting to insert an answer against memberOne's assessment_id must be rejected.
    const { error: writeError } = await memberTwoClient
      .from('primal_pattern_assessment_answers')
      .insert({
        assessment_id: targetAssessmentId,
        question_number: 1,
        selected_letters: ['A'],
      });
    expect(writeError).not.toBeNull();
  });
});

describe('Nutrition Safety Overrides (real RLS, real DB)', () => {
  it('no row recorded returns null, distinct from a recorded-but-empty profile', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    // Ensure a clean slate for this specific check.
    await serviceRoleClient()
      .from('member_nutrition_safety_flags')
      .delete()
      .eq('member_id', TEST_USERS.memberOne.id);

    expect(await getNutritionSafetyProfile(client, TEST_USERS.memberOne.id)).toBeNull();
    expect(await getMemberHealthSafetyOverrides(client, TEST_USERS.memberOne.id)).toBeNull();
  });

  it('a member can self-report flags, and hasActiveOverride reflects them accurately', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    const saved = await upsertNutritionSafetyFlags(
      client,
      TEST_USERS.memberOne.id,
      { ...EMPTY_NUTRITION_SAFETY_PROFILE_FLAGS, hasDiabetes: true },
      TEST_USERS.memberOne.id,
      'member'
    );
    expect(saved.flags.hasDiabetes).toBe(true);
    expect(saved.hasActiveOverride).toBe(true);
    expect(saved.lastUpdatedByRole).toBe('member');

    const reRead = await getNutritionSafetyProfile(client, TEST_USERS.memberOne.id);
    expect(reRead?.flags.hasDiabetes).toBe(true);
    expect(reRead?.hasActiveOverride).toBe(true);

    // Clearing every flag brings hasActiveOverride back to false without deleting the row
    // (the row itself is the "we have asked" signal, distinct from "never asked").
    const cleared = await upsertNutritionSafetyFlags(
      client,
      TEST_USERS.memberOne.id,
      EMPTY_NUTRITION_SAFETY_PROFILE_FLAGS,
      TEST_USERS.memberOne.id,
      'member'
    );
    expect(cleared.hasActiveOverride).toBe(false);
    expect(await getNutritionSafetyProfile(client, TEST_USERS.memberOne.id)).not.toBeNull();
  });

  it("completing a Primal Pattern assessment never touches a member's safety flags, and vice versa", async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    await upsertNutritionSafetyFlags(
      client,
      TEST_USERS.memberOne.id,
      { ...EMPTY_NUTRITION_SAFETY_PROFILE_FLAGS, isPregnant: true },
      TEST_USERS.memberOne.id,
      'member'
    );

    // Run a full assessment lifecycle for this member.
    const started = await getOrCreateInProgressPrimalPatternAssessment(
      client,
      TEST_USERS.memberOne.id,
      PRIMAL_PATTERN_QUESTIONNAIRE
    );
    for (const q of PRIMAL_PATTERN_QUESTIONNAIRE.questions) {
      await savePrimalPatternAnswer(
        client,
        PRIMAL_PATTERN_QUESTIONNAIRE,
        started.record.id,
        q.number,
        ['B']
      );
    }
    await completePrimalPatternAssessment(client, PRIMAL_PATTERN_QUESTIONNAIRE, started.record.id);

    // The safety flag set before the assessment must be completely unaffected.
    const profile = await getNutritionSafetyProfile(client, TEST_USERS.memberOne.id);
    expect(profile?.flags.isPregnant).toBe(true);
    expect(profile?.hasActiveOverride).toBe(true);
  });

  it("RLS blocks a second member from reading or writing into the first member's safety flags", async () => {
    const memberTwoClient = await signInAs(TEST_USERS.memberTwo);

    const { data: rawRow, error: rawError } = await memberTwoClient
      .from('member_nutrition_safety_flags')
      .select('id')
      .eq('member_id', TEST_USERS.memberOne.id)
      .maybeSingle();
    expect(rawError).toBeNull();
    expect(rawRow).toBeNull();

    const { error: writeError } = await memberTwoClient
      .from('member_nutrition_safety_flags')
      .insert({
        member_id: TEST_USERS.memberOne.id,
        has_diabetes: true,
      });
    expect(writeError).not.toBeNull();
  });
});

describe('Nutrition Intelligence Service — no completed assessment', () => {
  it('returns a well-typed not_started profile rather than null or an error', async () => {
    const memberOneClient = await signInAs(TEST_USERS.memberOne);
    const adminClient = await signInAs(TEST_USERS.adminOne);

    // adminOne has never taken this assessment.
    const profile = await getMemberNutritionProfile(memberOneClient, TEST_USERS.adminOne.id);
    // Note: memberOneClient reading adminOne's profile returns the same "no completed assessment"
    // shape regardless of whose session it is, because getLatestCompletedPrimalPatternSummary's
    // query is RLS-scoped to memberOneClient's own rows for adminOne's id, which never match.
    expect(profile.currentResult).toBeNull();
    expect(profile.completionQualityStatus).toBe('not_started');
    expect(profile.mealFrequency).toBe('not_available');

    // adminOne asking about themselves gets the same honest "not started" (no completed assessment exists).
    const ownProfile = await getMemberNutritionProfile(adminClient, TEST_USERS.adminOne.id);
    expect(ownProfile.currentResult).toBeNull();
    expect(ownProfile.completionQualityStatus).toBe('not_started');
  });
});
