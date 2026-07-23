/**
 * Integration test for the Short Health Assessment Questionnaire's
 * Universal Registry adapter wiring (Investigation Engine foundation,
 * Prompt 9). Before this change, `CATEGORY_FINDING_MAP`
 * (lib/registry/adapters/questionnaireEngine.ts) had no entry for
 * 'short-haq' — a completed attempt wrote zero registry_entries rows
 * despite the instrument being live (Focused Investigation Library §19,
 * Recommendation 3). Mirrors
 * registry-adapters-questionnaire-integration.test.ts's real-RLS pattern
 * exactly, against the real completeAssessment() write path, not a mocked
 * adapter call.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { SHORT_HAQ_QUESTIONNAIRE } from '../lib/assessments/short-haq';
import { flattenQuestions } from '../lib/assessments/engine/navigation';
import {
  completeAssessment,
  getOrCreateInProgressAssessment,
  saveAnswer,
} from '../lib/assessments/store';
import type { Category, CategoryAnswers, QuestionnaireAnswers } from '../lib/assessments/engine/types';

const memberId = TEST_USERS.memberOne.id;

async function allEntriesForMember() {
  const { data, error } = await serviceRoleClient()
    .from('registry_entries')
    .select('*')
    .eq('member_id', memberId);
  if (error) throw error;
  return data ?? [];
}

function minAnswers(category: Category): CategoryAnswers {
  const answers: CategoryAnswers = {};
  for (const question of category.questions) {
    const zeroIndex = question.options.findIndex((o) => o.points === 0);
    answers[question.number] = zeroIndex;
  }
  return answers;
}

function maxAnswers(category: Category): CategoryAnswers {
  const answers: CategoryAnswers = {};
  for (const question of category.questions) {
    const maxIndex = question.options.findIndex((o) => o.points === question.maxPoints);
    answers[question.number] = maxIndex;
  }
  return answers;
}

/**
 * No context answer is saved (the gendered hormonal_balance follow-ups
 * stay inactive per isQuestionActive) — this test only needs to prove the
 * registry adapter fires, not exercise every branch of the questionnaire
 * content itself.
 */
function allAnswers(fn: (c: Category) => CategoryAnswers): QuestionnaireAnswers {
  const answers: QuestionnaireAnswers = {};
  for (const category of SHORT_HAQ_QUESTIONNAIRE.categories) {
    answers[category.id] = fn(category);
  }
  return answers;
}

async function answerAndComplete(
  client: Awaited<ReturnType<typeof signInAs>>,
  assessmentId: string,
  answers: QuestionnaireAnswers
) {
  const flat = flattenQuestions(SHORT_HAQ_QUESTIONNAIRE);
  for (const ref of flat) {
    const optionIndex = answers[ref.category.id]?.[ref.question.number];
    if (optionIndex === undefined) continue; // conditional question left inactive, no context answered
    const points = ref.question.options[optionIndex]!.points;
    await saveAnswer(
      client,
      SHORT_HAQ_QUESTIONNAIRE,
      assessmentId,
      ref.category.id,
      ref.question.number,
      optionIndex,
      points
    );
  }
  return completeAssessment(client, SHORT_HAQ_QUESTIONNAIRE, assessmentId);
}

afterAll(async () => {
  const service = serviceRoleClient();
  await service.from('registry_entries').delete().eq('member_id', memberId);
  await service.from('wellness_assessments').delete().eq('member_id', memberId);
});

describe('short-haq registry adapter (via real completeAssessment, real RLS)', () => {
  it('registers a significant finding for a high-priority category, then resolves it on a later low-priority attempt', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    const started = await getOrCreateInProgressAssessment(client, memberId, SHORT_HAQ_QUESTIONNAIRE);
    await answerAndComplete(client, started.record.id, allAnswers(maxAnswers));

    const entriesAfterMax = await allEntriesForMember();

    const digestiveFinding = entriesAfterMax.find(
      (e) => e.domain === 'nutrition' && e.code === 'digestive_wellness_concern' && e.status === 'active'
    );
    expect(digestiveFinding).toBeDefined();
    expect(digestiveFinding!.severity).toBe('significant');
    expect(digestiveFinding!.trend_status).toBe('new');
    expect(digestiveFinding!.source_feature).toBe('questionnaire_category_finding');
    expect(digestiveFinding!.member_visible).toBe(true);

    const hormonalFinding = entriesAfterMax.find(
      (e) => e.domain === 'hormone' && e.code === 'hormonal_balance_pattern' && e.status === 'active'
    );
    expect(hormonalFinding).toBeDefined();

    // Second, all-minimum attempt should resolve the digestive finding
    // rather than leave it stale.
    const secondStarted = await getOrCreateInProgressAssessment(
      client,
      memberId,
      SHORT_HAQ_QUESTIONNAIRE
    );
    await answerAndComplete(client, secondStarted.record.id, allAnswers(minAnswers));

    const entriesAfterMin = await allEntriesForMember();
    const stillConcerningDigestiveFindings = entriesAfterMin.filter(
      (e) =>
        e.domain === 'nutrition' &&
        e.code === 'digestive_wellness_concern' &&
        e.status === 'active' &&
        e.severity !== 'none'
    );
    expect(stillConcerningDigestiveFindings).toHaveLength(0);

    const priorDigestiveFinding = entriesAfterMin.find((e) => e.id === digestiveFinding!.id);
    expect(priorDigestiveFinding!.status).toBe('superseded');

    const resolvedDigestiveFinding = entriesAfterMin
      .filter((e) => e.domain === 'nutrition' && e.code === 'digestive_wellness_concern')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    expect(resolvedDigestiveFinding!.severity).toBe('none');
    expect(resolvedDigestiveFinding!.trend_status).toBe('resolved');
    expect(resolvedDigestiveFinding!.supersedes_id).toBe(digestiveFinding!.id);
  }, 30000);
});
