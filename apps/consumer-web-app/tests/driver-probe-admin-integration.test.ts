/**
 * Coach question-bank management (migration 110) — real RLS, real DB.
 * Covers the five assertions the task explicitly called for: retiring
 * preserves answers, response_type is refused once a question has
 * answers, a protected core question can't be touched, an inline edit
 * writes a revision, and a freshly created question is really eligible
 * for the next day's rotation through the unmodified picker.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';
import {
  createQuestion,
  listRevisions,
  retireQuestion,
  updateQuestion,
} from '../lib/driver-probe-admin/data';
import { listActiveDriverProbeQuestions } from '../lib/daily-checkin-adaptive/data';
import { buildProbeBank } from '../lib/daily-checkin-adaptive/probeBank';
import { selectBatch } from '../lib/adaptive-assessment-engine/select';
import { ROTATING_PROBE_TARGET_COUNT } from '../lib/daily-checkin-adaptive/constants';

const TEST_DRIVER_ID = 'STR-1';
const createdKeys: string[] = [];

function uniqueKey(suffix: string): string {
  const key = `checkin_probe.test_${suffix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  createdKeys.push(key);
  return key;
}

afterAll(async () => {
  const service = serviceRoleClient();
  for (const key of createdKeys) {
    await service.from('daily_checkin_probe_answers').delete().eq('question_key', key);
    await service.from('driver_probe_question_revisions').delete().eq('question_key', key);
    await service.from('driver_probe_questions').delete().eq('question_key', key);
  }
});

describe('driver-probe-admin — coach question-bank management', () => {
  it('retiring a question leaves its recorded answers intact', async () => {
    const coach = await signInAs(TEST_USERS.coachOne);
    const key = uniqueKey('retire');

    const created = await createQuestion(
      coach,
      {
        questionKey: key,
        driverId: TEST_DRIVER_ID,
        prompt: 'Test question — retire keeps answers?',
        responseType: 'boolean',
        options: [],
        screen: 'evening',
      },
      TEST_USERS.coachOne.id
    );
    expect(created.error).toBeNull();

    // Fixture: a real recorded answer. Written via the service-role client
    // (setup only, per this suite's own stated philosophy) since the
    // behavior under test is retiring the QUESTION, not writing an answer.
    const service = serviceRoleClient();
    const { error: answerError } = await service.from('daily_checkin_probe_answers').insert({
      member_id: TEST_USERS.memberOne.id,
      local_date: '2020-01-01',
      question_key: key,
      value: true,
    });
    expect(answerError).toBeNull();

    const retireResult = await retireQuestion(coach, key, TEST_USERS.coachOne.id);
    expect(retireResult.error).toBeNull();

    const { data: answerRow, error: readAnswerError } = await service
      .from('daily_checkin_probe_answers')
      .select('value')
      .eq('question_key', key)
      .single();
    expect(readAnswerError).toBeNull();
    expect(answerRow?.value).toBe(true);

    const { data: questionRow } = await service
      .from('driver_probe_questions')
      .select('active')
      .eq('question_key', key)
      .single();
    expect(questionRow?.active).toBe(false);
  });

  it('refuses to change response_type or options once a question has recorded answers', async () => {
    const coach = await signInAs(TEST_USERS.coachOne);
    const key = uniqueKey('locked');

    await createQuestion(
      coach,
      {
        questionKey: key,
        driverId: TEST_DRIVER_ID,
        prompt: 'Test question — locked once answered?',
        responseType: 'boolean',
        options: [],
        screen: 'evening',
      },
      TEST_USERS.coachOne.id
    );

    const service = serviceRoleClient();
    await service.from('daily_checkin_probe_answers').insert({
      member_id: TEST_USERS.memberOne.id,
      local_date: '2020-01-02',
      question_key: key,
      value: true,
    });

    const result = await updateQuestion(
      coach,
      key,
      { responseType: 'count', options: [1, 2, 3] },
      TEST_USERS.coachOne.id
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/locked/i);
      expect(result.lockedFields).toContain('responseType');
      expect(result.lockedFields).toContain('options');
    }

    const { data: row } = await service
      .from('driver_probe_questions')
      .select('response_type')
      .eq('question_key', key)
      .single();
    expect(row?.response_type).toBe('boolean');

    // Prompt wording, unrelated to the answer's shape, must still be editable.
    const promptEdit = await updateQuestion(coach, key, { prompt: 'Still editable wording?' }, TEST_USERS.coachOne.id);
    expect(promptEdit.ok).toBe(true);
  });

  it('refuses to edit or retire a protected core question', async () => {
    const coach = await signInAs(TEST_USERS.coachOne);

    const editResult = await updateQuestion(coach, 'checkin.mood', { prompt: 'Hacked prompt?' }, TEST_USERS.coachOne.id);
    expect(editResult.ok).toBe(false);
    if (!editResult.ok) expect(editResult.error).toMatch(/protected/i);

    const retireResult = await retireQuestion(coach, 'checkin.mood', TEST_USERS.coachOne.id);
    expect(retireResult.error).toMatch(/protected/i);
  });

  it('an inline wording edit writes a revision record with before/after and who made it', async () => {
    const coach = await signInAs(TEST_USERS.coachOne);
    const key = uniqueKey('revision');

    await createQuestion(
      coach,
      {
        questionKey: key,
        driverId: TEST_DRIVER_ID,
        prompt: 'Original wording?',
        responseType: 'boolean',
        options: [],
        screen: 'evening',
      },
      TEST_USERS.coachOne.id
    );

    const updateResult = await updateQuestion(coach, key, { prompt: 'Reworded wording?' }, TEST_USERS.coachOne.id);
    expect(updateResult.ok).toBe(true);

    const revisions = await listRevisions(coach, key);
    expect(revisions.length).toBeGreaterThanOrEqual(2);

    const createdRevision = revisions.find((r) => r.changeType === 'created');
    expect(createdRevision).toBeDefined();

    const updatedRevision = revisions.find((r) => r.changeType === 'updated');
    expect(updatedRevision).toBeDefined();
    expect(updatedRevision?.before?.prompt).toBe('Original wording?');
    expect(updatedRevision?.after?.prompt).toBe('Reworded wording?');
    expect(updatedRevision?.changedBy).toBe(TEST_USERS.coachOne.id);
  });

  it('a newly created question becomes eligible for the next day rotation, with no code change', async () => {
    const coach = await signInAs(TEST_USERS.coachOne);
    const key = uniqueKey('rotation');

    const created = await createQuestion(
      coach,
      {
        questionKey: key,
        driverId: TEST_DRIVER_ID,
        prompt: 'Freshly created — eligible tomorrow?',
        responseType: 'boolean',
        options: [],
        screen: 'evening',
      },
      TEST_USERS.coachOne.id
    );
    expect(created.error).toBeNull();

    // Read it back exactly the way the real check-in plan does — the
    // unmodified lib/daily-checkin-adaptive/data.ts reader, then the
    // unmodified lib/daily-checkin-adaptive/probeBank.ts +
    // lib/adaptive-assessment-engine/select.ts picker. No admin-specific
    // code path is exercised here on purpose.
    const member = await signInAs(TEST_USERS.memberOne);
    const questions = await listActiveDriverProbeQuestions(member);
    const found = questions.find((q) => q.questionKey === key);
    expect(found).toBeDefined();

    const bank = buildProbeBank({
      questions: [found!],
      memberGoalKeys: [],
      goalWeights: [],
      driverStates: new Map(),
      lastAskedDates: new Map(),
      wearableSuppliedQuestionKeys: new Set(),
      todayLocalDate: '2099-01-01',
    });
    const picks = selectBatch(bank, {}, [], ROTATING_PROBE_TARGET_COUNT, () => 0);
    expect(picks.some((p) => p.question_key === key)).toBe(true);
  });
});
