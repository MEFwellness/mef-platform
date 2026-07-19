/**
 * End-to-end integration test for the Wellness Assessment System
 * (lib/assessments/store.ts) against real local Supabase, using the same
 * session-scoped client and real RLS policies (migration 62) a triggering
 * server action would use — no mocked Supabase client, per this suite's
 * stated testing philosophy (see tests/setup/test-clients.ts).
 *
 * Exercises the full member-facing lifecycle: start -> answer a subset ->
 * verify resume position -> answer everything -> complete -> verify the
 * persisted score matches the pure engine's own computation exactly ->
 * read it back as a result -> confirm it shows up in history -> confirm
 * category score history -> confirm a second completed assessment
 * produces a working comparison. Then confirms RLS actually isolates a
 * second member from the first member's assessment, both for reads and
 * for writes.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { CHEK_HLC1_QUESTIONNAIRE } from '../lib/assessments/chek-hlc1';
import { FOUR_DOCTORS_QUESTIONNAIRE } from '../lib/assessments/four-doctors';
import { flattenQuestions } from '../lib/assessments/engine/navigation';
import { isQuestionActive, scoreQuestionnaire } from '../lib/assessments/engine/scoring';
import { deriveQuestionnaireStatus } from '../lib/assessments/presentation';
import { listAssessmentDefinitions } from '../lib/assessments/registry';
import type { AssessmentContext, QuestionnaireAnswers } from '../lib/assessments/engine/types';
import {
  completeAssessment,
  findInProgressAssessment,
  getAssessmentAnswers,
  getAssessmentComparison,
  getAssessmentResult,
  getCategoryScoreHistory,
  getLatestCompletedAssessmentSummary,
  getOrCreateInProgressAssessment,
  listCompletedAssessments,
  saveAnswer,
  saveContext,
} from '../lib/assessments/store';

const QUESTIONNAIRE_ID = CHEK_HLC1_QUESTIONNAIRE.id;

/** Every question answered with its lowest-point (zero) option — deterministic, cheap to build fully in-memory. */
function allMinAnswers(): QuestionnaireAnswers {
  const answers: QuestionnaireAnswers = {};
  for (const category of CHEK_HLC1_QUESTIONNAIRE.categories) {
    const categoryAnswers: Record<number, number> = {};
    for (const question of category.questions) {
      categoryAnswers[question.number] = question.options.findIndex((o) => o.points === 0);
    }
    answers[category.id] = categoryAnswers;
  }
  return answers;
}

afterAll(async () => {
  // wellness_assessment_answers/wellness_assessment_category_scores cascade-delete
  // with their parent wellness_assessments row (migration 62's `on delete cascade`),
  // so cleaning up the member's assessments is enough.
  const service = serviceRoleClient();
  await service.from('wellness_assessments').delete().eq('member_id', TEST_USERS.memberOne.id);
  await service.from('wellness_assessments').delete().eq('member_id', TEST_USERS.memberTwo.id);
});

describe('Wellness Assessment System lifecycle (real RLS, real DB)', () => {
  it('start -> partial save -> resume -> complete -> matches the pure engine score -> shows up in results/history/category-history', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    // 1. Start (creates an in_progress draft; resume position is question 1 of category 1).
    const started = await getOrCreateInProgressAssessment(
      client,
      TEST_USERS.memberOne.id,
      CHEK_HLC1_QUESTIONNAIRE
    );
    expect(started.record.status).toBe('in_progress');
    expect(started.record.currentCategoryId).toBe('you_are_what_you_eat');
    expect(started.record.currentQuestionNumber).toBe(1);
    expect(started.answers).toEqual({});
    const assessmentId = started.record.id;

    // Calling start again returns the SAME draft (the partial unique index in
    // migration 62 is what makes this true) rather than creating a second one.
    const startedAgain = await getOrCreateInProgressAssessment(
      client,
      TEST_USERS.memberOne.id,
      CHEK_HLC1_QUESTIONNAIRE
    );
    expect(startedAgain.record.id).toBe(assessmentId);

    // 2. Answer the first 3 questions of "You Are What You Eat", then stop — simulating leaving mid-assessment.
    const flat = flattenQuestions(CHEK_HLC1_QUESTIONNAIRE);
    for (let i = 0; i < 3; i++) {
      const ref = flat[i]!;
      const zeroIndex = ref.question.options.findIndex((o) => o.points === 0);
      await saveAnswer(
        client,
        CHEK_HLC1_QUESTIONNAIRE,
        assessmentId,
        ref.category.id,
        ref.question.number,
        zeroIndex,
        0
      );
    }

    // 3. Resume: findInProgressAssessment must reflect the 3 saved answers
    // and the server-persisted resume position must point at question 4.
    const resumed = await findInProgressAssessment(
      client,
      TEST_USERS.memberOne.id,
      QUESTIONNAIRE_ID
    );
    expect(resumed).not.toBeNull();
    expect(resumed!.record.currentCategoryId).toBe('you_are_what_you_eat');
    expect(resumed!.record.currentQuestionNumber).toBe(4);
    expect(Object.keys(resumed!.answers.you_are_what_you_eat ?? {})).toHaveLength(3);

    // 4. Answer everything (all-minimum — every question's zero-point option), completing the response.
    const fullAnswers = allMinAnswers();
    for (const category of CHEK_HLC1_QUESTIONNAIRE.categories) {
      for (const question of category.questions) {
        const optionIndex = fullAnswers[category.id]![question.number]!;
        const points = question.options[optionIndex]!.points;
        await saveAnswer(
          client,
          CHEK_HLC1_QUESTIONNAIRE,
          assessmentId,
          category.id,
          question.number,
          optionIndex,
          points
        );
      }
    }

    // 5. Complete — this is the ONLY point scoring happens, entirely server-side.
    const completed = await completeAssessment(client, CHEK_HLC1_QUESTIONNAIRE, assessmentId);
    expect(completed.record.status).toBe('completed');
    expect(completed.record.completedAt).not.toBeNull();
    expect(completed.record.currentCategoryId).toBeNull();

    // The persisted score must be byte-for-byte identical to what the pure,
    // already-unit-tested engine computes for the same answers — proving
    // completeAssessment() didn't silently diverge from engine/scoring.ts.
    const expected = scoreQuestionnaire(CHEK_HLC1_QUESTIONNAIRE, fullAnswers);
    expect(completed.record.totalScore).toBe(expected.totalScore);
    expect(completed.record.totalScore).toBe(0); // all-minimum answers -> 0
    expect(completed.record.totalMaxScore).toBe(635); // the verified, corrected total (see SPEC.md)
    expect(completed.record.totalPriority).toBe('low');
    expect(completed.categoryScores).toHaveLength(7);
    for (const expectedCategory of expected.categoryScores) {
      const actual = completed.categoryScores.find(
        (c) => c.categoryId === expectedCategory.categoryId
      );
      expect(actual?.score).toBe(expectedCategory.score);
      expect(actual?.maxScore).toBe(expectedCategory.maxScore);
      expect(actual?.priority).toBe(expectedCategory.priority);
    }

    // No draft remains once completed.
    expect(
      await findInProgressAssessment(client, TEST_USERS.memberOne.id, QUESTIONNAIRE_ID)
    ).toBeNull();

    // 6. Results dashboard read path.
    const result = await getAssessmentResult(
      client,
      TEST_USERS.memberOne.id,
      assessmentId,
      CHEK_HLC1_QUESTIONNAIRE
    );
    expect(result?.record.totalScore).toBe(0);
    expect(result?.categoryScores.find((c) => c.categoryId === 'stress')?.categoryName).toBe(
      'Stress'
    );

    // Every answer is still readable post-completion (category detail's Q&A list depends on this).
    const persistedAnswers = await getAssessmentAnswers(client, assessmentId);
    expect(Object.keys(persistedAnswers)).toHaveLength(7);
    expect(persistedAnswers.stress![1]).toBe(fullAnswers.stress![1]);

    // 7. History.
    const history = await listCompletedAssessments(
      client,
      TEST_USERS.memberOne.id,
      QUESTIONNAIRE_ID
    );
    expect(history.map((h) => h.id)).toContain(assessmentId);

    // 8. Category score history (the category-detail trend chart's data source).
    const stressHistory = await getCategoryScoreHistory(
      client,
      TEST_USERS.memberOne.id,
      QUESTIONNAIRE_ID,
      'stress'
    );
    expect(stressHistory).toHaveLength(1);
    expect(stressHistory[0]!.score).toBe(0);
  });

  it('a second completed assessment produces a working comparison against the first', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    // First assessment already exists from the previous test (all-minimum, score 0).
    const first = await listCompletedAssessments(client, TEST_USERS.memberOne.id, QUESTIONNAIRE_ID);
    expect(first.length).toBeGreaterThanOrEqual(1);

    // Second assessment: answer everything with the HIGHEST-point option this time, so the comparison has a real, non-zero delta to check.
    const second = await getOrCreateInProgressAssessment(
      client,
      TEST_USERS.memberOne.id,
      CHEK_HLC1_QUESTIONNAIRE
    );
    for (const category of CHEK_HLC1_QUESTIONNAIRE.categories) {
      for (const question of category.questions) {
        const maxIndex = question.options.findIndex((o) => o.points === question.maxPoints);
        await saveAnswer(
          client,
          CHEK_HLC1_QUESTIONNAIRE,
          second.record.id,
          category.id,
          question.number,
          maxIndex,
          question.maxPoints
        );
      }
    }
    const completedSecond = await completeAssessment(
      client,
      CHEK_HLC1_QUESTIONNAIRE,
      second.record.id
    );
    expect(completedSecond.record.totalScore).toBe(635);
    expect(completedSecond.record.totalPriority).toBe('high');

    const comparison = await getAssessmentComparison(
      client,
      TEST_USERS.memberOne.id,
      CHEK_HLC1_QUESTIONNAIRE,
      completedSecond.record.id,
      'previous'
    );

    expect(comparison).not.toBeNull();
    expect(comparison!.previous).not.toBeNull();
    expect(comparison!.totalDelta).toBe(635); // 635 - 0
    expect(comparison!.totalDirection).toBe('regressed'); // higher score = worse on this scale
    const stressEntry = comparison!.categories.find((c) => c.categoryId === 'stress')!;
    expect(stressEntry.previousScore).toBe(0);
    expect(stressEntry.currentScore).toBe(81);
    expect(stressEntry.direction).toBe('regressed');
  });

  it("RLS blocks a second member from reading or writing into the first member's assessment", async () => {
    const memberOneClient = await signInAs(TEST_USERS.memberOne);
    const memberTwoClient = await signInAs(TEST_USERS.memberTwo);

    const memberOneAssessments = await listCompletedAssessments(
      memberOneClient,
      TEST_USERS.memberOne.id,
      QUESTIONNAIRE_ID
    );
    expect(memberOneAssessments.length).toBeGreaterThan(0);
    const targetAssessmentId = memberOneAssessments[0]!.id;

    // Read: memberTwo asking for memberOne's own id explicitly still gets nothing,
    // because getAssessmentResult's query is scoped to member_id = memberTwo.id
    // AND RLS independently refuses the row regardless.
    const stolenRead = await getAssessmentResult(
      memberTwoClient,
      TEST_USERS.memberOne.id,
      targetAssessmentId,
      CHEK_HLC1_QUESTIONNAIRE
    );
    expect(stolenRead).toBeNull();

    // Direct RLS probe: memberTwo's own session querying by id with no member_id
    // filter at all — this is what actually proves the database-level policy
    // (not just the store function's own extra .eq('member_id', ...) filter).
    const { data: rawRow, error: rawError } = await memberTwoClient
      .from('wellness_assessments')
      .select('id')
      .eq('id', targetAssessmentId)
      .maybeSingle();
    expect(rawError).toBeNull();
    expect(rawRow).toBeNull();

    // Write: memberTwo attempting to insert an answer against memberOne's
    // assessment_id must be rejected by member_insert_own_wellness_assessment_answers
    // (it joins to wellness_assessments and requires member_id = auth.uid()).
    const { error: writeError } = await memberTwoClient.from('wellness_assessment_answers').insert({
      assessment_id: targetAssessmentId,
      category_id: 'stress',
      question_number: 1,
      option_index: 0,
      points: 0,
    });
    expect(writeError).not.toBeNull();
  });
});

describe('Questionnaires page data source (real RLS, real DB)', () => {
  it('the registry lists CHEK HLC1, and a fresh member walks not_started -> in_progress -> completed exactly as the /questionnaires card would render it', async () => {
    const client = await signInAs(TEST_USERS.memberTwo);

    // The registry is what app/questionnaires/page.tsx iterates — confirms
    // it's actually wired up, not just present in source.
    const definitions = listAssessmentDefinitions();
    expect(definitions.map((d) => d.questionnaire.id)).toContain(QUESTIONNAIRE_ID);

    // 1. not_started: memberTwo has no draft and no completed history for
    // this questionnaire at this point in the suite (their only prior
    // interaction above was a rejected write attempt, which left no row).
    const [draftBefore, completedBefore] = await Promise.all([
      findInProgressAssessment(client, TEST_USERS.memberTwo.id, QUESTIONNAIRE_ID),
      getLatestCompletedAssessmentSummary(client, TEST_USERS.memberTwo.id, QUESTIONNAIRE_ID),
    ]);
    expect(deriveQuestionnaireStatus(Boolean(draftBefore), Boolean(completedBefore))).toBe(
      'not_started'
    );

    // 2. in_progress: exactly what tapping "Start" then answering one
    // question does.
    const started = await getOrCreateInProgressAssessment(
      client,
      TEST_USERS.memberTwo.id,
      CHEK_HLC1_QUESTIONNAIRE
    );
    const flat = flattenQuestions(CHEK_HLC1_QUESTIONNAIRE);
    const firstQuestion = flat[0]!;
    await saveAnswer(
      client,
      CHEK_HLC1_QUESTIONNAIRE,
      started.record.id,
      firstQuestion.category.id,
      firstQuestion.question.number,
      firstQuestion.question.options.findIndex((o) => o.points === 0),
      0
    );
    const [draftDuring, completedDuring] = await Promise.all([
      findInProgressAssessment(client, TEST_USERS.memberTwo.id, QUESTIONNAIRE_ID),
      getLatestCompletedAssessmentSummary(client, TEST_USERS.memberTwo.id, QUESTIONNAIRE_ID),
    ]);
    expect(deriveQuestionnaireStatus(Boolean(draftDuring), Boolean(completedDuring))).toBe(
      'in_progress'
    );

    // 3. completed: exactly what "View Results" on the card depends on —
    // answer everything else, complete, then re-derive status the same way
    // getMyQuestionnaireList() does.
    const answers: QuestionnaireAnswers = { ...draftDuring!.answers };
    for (const category of CHEK_HLC1_QUESTIONNAIRE.categories) {
      for (const question of category.questions) {
        if (answers[category.id]?.[question.number] !== undefined) continue;
        const zeroIndex = question.options.findIndex((o) => o.points === 0);
        await saveAnswer(
          client,
          CHEK_HLC1_QUESTIONNAIRE,
          started.record.id,
          category.id,
          question.number,
          zeroIndex,
          0
        );
      }
    }
    await completeAssessment(client, CHEK_HLC1_QUESTIONNAIRE, started.record.id);

    const [draftAfter, completedAfter] = await Promise.all([
      findInProgressAssessment(client, TEST_USERS.memberTwo.id, QUESTIONNAIRE_ID),
      getLatestCompletedAssessmentSummary(client, TEST_USERS.memberTwo.id, QUESTIONNAIRE_ID),
    ]);
    expect(draftAfter).toBeNull();
    expect(completedAfter).not.toBeNull();
    expect(deriveQuestionnaireStatus(Boolean(draftAfter), Boolean(completedAfter))).toBe(
      'completed'
    );

    // "Retake" (tapping Start again from a completed card) must open a
    // brand-new draft, not resurrect the completed one.
    const retakeStarted = await getOrCreateInProgressAssessment(
      client,
      TEST_USERS.memberTwo.id,
      CHEK_HLC1_QUESTIONNAIRE
    );
    expect(retakeStarted.record.id).not.toBe(started.record.id);
    expect(retakeStarted.record.status).toBe('in_progress');
  });
});

/**
 * Four Doctors is the first questionnaire with a context question (the
 * gender gate ahead of Dr. Quiet's conditional pair, see
 * docs/assessments/four-doctors/SPEC.md §6) — this exercises `context`
 * end-to-end against real RLS: it starts life as an empty '{}' default
 * from migration 67, survives a resume, and is what completeAssessment
 * re-derives active questions from server-side.
 */
describe('Four Doctors context/conditional-question lifecycle (real RLS, real DB)', () => {
  const FOUR_DOCTORS_ID = FOUR_DOCTORS_QUESTIONNAIRE.id;

  it('context defaults to {}, persists through saveContext, and survives resume', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    const started = await getOrCreateInProgressAssessment(
      client,
      TEST_USERS.memberOne.id,
      FOUR_DOCTORS_QUESTIONNAIRE
    );
    expect(started.record.context).toEqual({});

    await saveContext(client, started.record.id, 'dr_quiet_gender', 'male');

    const resumed = await findInProgressAssessment(
      client,
      TEST_USERS.memberOne.id,
      FOUR_DOCTORS_ID
    );
    expect(resumed?.record.context).toEqual({ dr_quiet_gender: 'male' });
  });

  it('completeAssessment rejects a submit with an active gender-gated question left unanswered', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    // Continues the in-progress draft from the previous test (context already male).
    const inProgress = await findInProgressAssessment(
      client,
      TEST_USERS.memberOne.id,
      FOUR_DOCTORS_ID
    );
    const assessmentId = inProgress!.record.id;
    const context: AssessmentContext = inProgress!.record.context ?? {};

    for (const category of FOUR_DOCTORS_QUESTIONNAIRE.categories) {
      for (const question of category.questions) {
        if (!isQuestionActive(question, context)) continue;
        if (category.id === 'dr_quiet' && question.number === 5) continue; // leave one active question unanswered
        const zeroIndex = question.options.findIndex((o) => o.points === 0);
        await saveAnswer(
          client,
          FOUR_DOCTORS_QUESTIONNAIRE,
          assessmentId,
          category.id,
          question.number,
          zeroIndex,
          0
        );
      }
    }

    await expect(
      completeAssessment(client, FOUR_DOCTORS_QUESTIONNAIRE, assessmentId)
    ).rejects.toThrow(/unanswered questions/);

    // Answer the one remaining active question, then completion succeeds and
    // matches the pure engine's own computation for this same context.
    const question5 = FOUR_DOCTORS_QUESTIONNAIRE.categories
      .find((c) => c.id === 'dr_quiet')!
      .questions.find((q) => q.number === 5)!;
    await saveAnswer(
      client,
      FOUR_DOCTORS_QUESTIONNAIRE,
      assessmentId,
      'dr_quiet',
      5,
      question5.options.findIndex((o) => o.points === 0),
      0
    );

    const completed = await completeAssessment(client, FOUR_DOCTORS_QUESTIONNAIRE, assessmentId);
    expect(completed.record.status).toBe('completed');
    expect(completed.record.totalScore).toBe(0);
    expect(completed.record.totalMaxScore).toBe(610); // resolved-gender achievable max, see SPEC.md §7
    const drQuietScore = completed.categoryScores.find((c) => c.categoryId === 'dr_quiet')!;
    expect(drQuietScore.maxScore).toBe(80); // 6 always-on + the resolved "male" pair, not all 10 configured questions

    const answers = await getAssessmentAnswers(client, assessmentId);
    const expected = scoreQuestionnaire(FOUR_DOCTORS_QUESTIONNAIRE, answers, context);
    expect(completed.record.totalScore).toBe(expected.totalScore);
    expect(completed.record.totalMaxScore).toBe(expected.totalMaxScore);
  });

  it('a retake creates a new, separately-dated assessment instance and never overwrites the earlier completed one', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    // The completed assessment from the previous test (score 0, "male" context).
    const before = await listCompletedAssessments(client, TEST_USERS.memberOne.id, FOUR_DOCTORS_ID);
    expect(before.length).toBeGreaterThanOrEqual(1);
    const firstAssessmentId = before[0]!.id;
    const firstScore = before[0]!.totalScore;

    // Tapping "Start" again opens a brand-new draft, not the completed one.
    const retake = await getOrCreateInProgressAssessment(
      client,
      TEST_USERS.memberOne.id,
      FOUR_DOCTORS_QUESTIONNAIRE
    );
    expect(retake.record.status).toBe('in_progress');
    expect(retake.record.id).not.toBe(firstAssessmentId);
    expect(retake.record.context).toEqual({}); // a fresh attempt starts with no context, regardless of the first attempt's choice

    // Answer this attempt entirely differently ("female" branch, every question at its
    // highest-point option) so its score is unambiguously distinct from the first (0).
    await saveContext(client, retake.record.id, 'dr_quiet_gender', 'female');
    const retakeContext: AssessmentContext = { dr_quiet_gender: 'female' };
    for (const category of FOUR_DOCTORS_QUESTIONNAIRE.categories) {
      for (const question of category.questions) {
        if (!isQuestionActive(question, retakeContext)) continue;
        const maxIndex = question.options.findIndex((o) => o.points === question.maxPoints);
        await saveAnswer(
          client,
          FOUR_DOCTORS_QUESTIONNAIRE,
          retake.record.id,
          category.id,
          question.number,
          maxIndex,
          question.maxPoints
        );
      }
    }
    const completedRetake = await completeAssessment(
      client,
      FOUR_DOCTORS_QUESTIONNAIRE,
      retake.record.id
    );
    expect(completedRetake.record.totalScore).toBe(610); // full achievable max, see SPEC.md §7
    expect(completedRetake.record.totalScore).not.toBe(firstScore);

    // Both instances are preserved in history, each with its own id and score —
    // completing the retake never touched, rescored, or removed the first row.
    const after = await listCompletedAssessments(client, TEST_USERS.memberOne.id, FOUR_DOCTORS_ID);
    expect(after.length).toBe(before.length + 1);
    const original = after.find((a) => a.id === firstAssessmentId);
    expect(original).toBeDefined();
    expect(original!.totalScore).toBe(firstScore); // unchanged by the retake
    const retakeSummary = after.find((a) => a.id === completedRetake.record.id);
    expect(retakeSummary).toBeDefined();
    expect(retakeSummary!.totalScore).toBe(610);
  });
});
