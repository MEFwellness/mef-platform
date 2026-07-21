/**
 * Integration test for the Universal Assessment Intelligence Engine's
 * questionnaire-engine finding adapter (lib/registry/adapters/
 * questionnaireEngine.ts) against real local Supabase/RLS — the highest-
 * risk part of that adapter is the hand-written migration 084 RLS
 * policies (member_insert/update_own_questionnaire_registry_entries), so
 * this exercises the real completeAssessment() write path exactly as a
 * member's own session would, rather than unit-testing the adapter
 * function directly with a mocked client.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { CHEK_HLC1_QUESTIONNAIRE } from '../lib/assessments/chek-hlc1';
import { flattenQuestions } from '../lib/assessments/engine/navigation';
import {
  completeAssessment,
  getOrCreateInProgressAssessment,
  saveAnswer,
} from '../lib/assessments/store';
import type {
  Category,
  CategoryAnswers,
  QuestionnaireAnswers,
} from '../lib/assessments/engine/types';
const memberId = TEST_USERS.memberOne.id;

/**
 * member_read_own_registry_entries (migration 40) only shows status='active'
 * rows to a member's own session by design — a superseded/resolved history
 * row is real but member-invisible (coaches, via
 * coach_read_assigned_registry_entries, have no such restriction). This
 * test needs to see the WHOLE chain to verify the supersede step actually
 * happened, so history verification reads go through the service-role
 * client, same as every other assertion in this suite that needs to see
 * past what RLS shows the acting session.
 */
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

function allAnswers(fn: (c: Category) => CategoryAnswers): QuestionnaireAnswers {
  const answers: QuestionnaireAnswers = {};
  for (const category of CHEK_HLC1_QUESTIONNAIRE.categories) {
    answers[category.id] = fn(category);
  }
  return answers;
}

async function answerAndComplete(
  client: Awaited<ReturnType<typeof signInAs>>,
  assessmentId: string,
  answers: QuestionnaireAnswers
) {
  const flat = flattenQuestions(CHEK_HLC1_QUESTIONNAIRE);
  for (const ref of flat) {
    const optionIndex = answers[ref.category.id]![ref.question.number]!;
    const points = ref.question.options[optionIndex]!.points;
    await saveAnswer(
      client,
      CHEK_HLC1_QUESTIONNAIRE,
      assessmentId,
      ref.category.id,
      ref.question.number,
      optionIndex,
      points
    );
  }
  return completeAssessment(client, CHEK_HLC1_QUESTIONNAIRE, assessmentId);
}

afterAll(async () => {
  const service = serviceRoleClient();
  await service.from('registry_entries').delete().eq('member_id', memberId);
  // wellness_assessment_category_scores/answers cascade-delete with their parent assessment.
  await service.from('wellness_assessments').delete().eq('member_id', memberId);
});

describe('upsertRegistryEntriesFromQuestionnaireAttempt (via real completeAssessment, real RLS)', () => {
  it('registers a significant finding for a high-priority category, then resolves it on a later low-priority attempt', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    const started = await getOrCreateInProgressAssessment(
      client,
      memberId,
      CHEK_HLC1_QUESTIONNAIRE
    );
    await answerAndComplete(client, started.record.id, allAnswers(maxAnswers));

    const entriesAfterMax = await allEntriesForMember();
    const stressFinding = entriesAfterMax.find(
      (e) => e.domain === 'stress' && e.code === 'elevated_stress' && e.status === 'active'
    );
    expect(stressFinding).toBeDefined();
    expect(stressFinding!.severity).toBe('significant');
    expect(stressFinding!.trend_status).toBe('new');
    expect(stressFinding!.source_feature).toBe('questionnaire_category_finding');
    expect(stressFinding!.member_visible).toBe(true);

    const digestiveFinding = entriesAfterMax.find(
      (e) => e.domain === 'nutrition' && e.code === 'digestive_complaints' && e.status === 'active'
    );
    expect(digestiveFinding).toBeDefined();
    expect(digestiveFinding!.severity).toBe('significant');

    // A second, all-minimum attempt should resolve the stress finding
    // rather than leave it stale — nothing wrong to report anymore.
    const secondStarted = await getOrCreateInProgressAssessment(
      client,
      memberId,
      CHEK_HLC1_QUESTIONNAIRE
    );
    await answerAndComplete(client, secondStarted.record.id, allAnswers(minAnswers));

    const entriesAfterMin = await allEntriesForMember();
    const stillConcerningStressFindings = entriesAfterMin.filter(
      (e) =>
        e.domain === 'stress' &&
        e.code === 'elevated_stress' &&
        e.status === 'active' &&
        e.severity !== 'none'
    );
    expect(stillConcerningStressFindings).toHaveLength(0);

    const priorStressFinding = entriesAfterMin.find((e) => e.id === stressFinding!.id);
    expect(priorStressFinding!.status).toBe('superseded');

    const resolvedStressFinding = entriesAfterMin
      .filter((e) => e.domain === 'stress' && e.code === 'elevated_stress')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    expect(resolvedStressFinding!.severity).toBe('none');
    expect(resolvedStressFinding!.trend_status).toBe('resolved');
    expect(resolvedStressFinding!.supersedes_id).toBe(stressFinding!.id);
  }, 30000);
});
