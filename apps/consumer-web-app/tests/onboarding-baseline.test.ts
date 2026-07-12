import { describe, it, expect } from 'vitest';
import {
  buildBaselineAssessment,
  groupByDomain,
  formatAnswerValue,
} from '../lib/onboarding/baseline';
import type {
  OnboardingAnswerRecord,
  OnboardingQuestion,
  OnboardingSubmission,
} from '@mef/shared-types-contracts';

function question(overrides: Partial<OnboardingQuestion> = {}): OnboardingQuestion {
  return {
    id: 'q1',
    question_key: 'baseline_sleep_quality',
    assessment_version_id: 'v1',
    question_version: 1,
    display_order: 1,
    prompt_text: 'How would you rate your typical sleep quality?',
    answer_type: 'numeric',
    allowed_values: null,
    domain: 'sleep',
    allows_not_sure: false,
    allows_not_applicable: false,
    allows_prefer_not_to_answer: false,
    ...overrides,
  };
}

function answerRow(overrides: Partial<OnboardingAnswerRecord> = {}): OnboardingAnswerRecord {
  return {
    id: 'a1',
    submission_id: 's1',
    question_id: 'q1',
    answer_status: 'answered',
    value_numeric: null,
    value_enum: null,
    value_multi_select: null,
    value_boolean: null,
    value_free_text: null,
    ...overrides,
  };
}

const submission: OnboardingSubmission = {
  id: 's1',
  user_id: 'u1',
  assessment_version_id: 'v1',
  submitted_at: '2026-01-01T12:00:00.000Z',
  timezone: 'America/New_York',
  local_date: '2026-01-01',
  raw_payload: {},
  superseded_at: null,
  assessment_type: 'baseline',
  checkpoint_label: null,
};

describe('buildBaselineAssessment', () => {
  it('pairs each answer row to its question and resolves the typed value', () => {
    const questions = [question({ id: 'q1', question_key: 'baseline_sleep_quality' })];
    const answers = [answerRow({ question_id: 'q1', value_numeric: 4 })];

    const baseline = buildBaselineAssessment(submission, questions, answers);

    expect(baseline.submissionId).toBe('s1');
    expect(baseline.answers).toHaveLength(1);
    expect(baseline.answers[0]).toMatchObject({
      questionKey: 'baseline_sleep_quality',
      answerType: 'numeric',
      value: 4,
    });
  });

  it('drops questions with no matching answer row instead of fabricating one', () => {
    const questions = [
      question({ id: 'q1', question_key: 'baseline_sleep_quality' }),
      question({ id: 'q2', question_key: 'baseline_stress_level', domain: 'mind_stress' }),
    ];
    const answers = [answerRow({ question_id: 'q1', value_numeric: 4 })];

    const baseline = buildBaselineAssessment(submission, questions, answers);

    expect(baseline.answers).toHaveLength(1);
    expect(baseline.answers[0]?.questionKey).toBe('baseline_sleep_quality');
  });

  it('preserves an opt-out status without a real value', () => {
    const questions = [
      question({
        id: 'q1',
        question_key: 'baseline_goals',
        answer_type: 'free_text',
        domain: 'all',
      }),
    ];
    const answers = [
      answerRow({ question_id: 'q1', answer_status: 'not_sure', value_free_text: null }),
    ];

    const baseline = buildBaselineAssessment(submission, questions, answers);

    expect(baseline.answers[0]).toMatchObject({ answerStatus: 'not_sure', value: null });
  });
});

describe('groupByDomain', () => {
  it('groups by domain in the fixed category order, sorted by display_order within each group', () => {
    const answers = [
      {
        questionKey: 'a',
        promptText: '',
        domain: 'movement_energy',
        answerType: 'numeric' as const,
        displayOrder: 5,
        answerStatus: 'answered' as const,
        value: 1,
      },
      {
        questionKey: 'b',
        promptText: '',
        domain: 'sleep',
        answerType: 'numeric' as const,
        displayOrder: 2,
        answerStatus: 'answered' as const,
        value: 1,
      },
      {
        questionKey: 'c',
        promptText: '',
        domain: 'movement_energy',
        answerType: 'enum' as const,
        displayOrder: 1,
        answerStatus: 'answered' as const,
        value: '0',
      },
    ];

    const groups = groupByDomain(answers);

    expect(groups.map((g) => g.domain)).toEqual(['sleep', 'movement_energy']);
    expect(groups[1]?.answers.map((a) => a.questionKey)).toEqual(['c', 'a']);
  });

  it('appends unrecognized domains after the known ones instead of dropping them', () => {
    const answers = [
      {
        questionKey: 'x',
        promptText: '',
        domain: 'future_domain',
        answerType: 'enum' as const,
        displayOrder: 1,
        answerStatus: 'answered' as const,
        value: 'foo',
      },
      {
        questionKey: 'y',
        promptText: '',
        domain: 'sleep',
        answerType: 'enum' as const,
        displayOrder: 1,
        answerStatus: 'answered' as const,
        value: 'bar',
      },
    ];

    const groups = groupByDomain(answers);

    expect(groups.map((g) => g.domain)).toEqual(['sleep', 'future_domain']);
  });
});

describe('formatAnswerValue', () => {
  it('shows a numeric answer against its scale max', () => {
    expect(
      formatAnswerValue({
        questionKey: 'baseline_sleep_quality',
        promptText: '',
        domain: 'sleep',
        answerType: 'numeric',
        displayOrder: 1,
        answerStatus: 'answered',
        value: 4,
      })
    ).toBe('4 / 5');

    expect(
      formatAnswerValue({
        questionKey: 'readiness_importance',
        promptText: '',
        domain: 'mind_stress',
        answerType: 'numeric',
        displayOrder: 1,
        answerStatus: 'answered',
        value: 8,
      })
    ).toBe('8 / 10');
  });

  it('humanizes enum and multi_select underscores', () => {
    expect(
      formatAnswerValue({
        questionKey: 'primary_concern',
        promptText: '',
        domain: 'all',
        answerType: 'enum',
        displayOrder: 1,
        answerStatus: 'answered',
        value: 'general_optimization',
      })
    ).toBe('general optimization');

    expect(
      formatAnswerValue({
        questionKey: 'baseline_pain_areas',
        promptText: '',
        domain: 'pain_structural',
        answerType: 'multi_select',
        displayOrder: 1,
        answerStatus: 'answered',
        value: ['lower_back', 'knees'],
      })
    ).toBe('lower back, knees');
  });

  it('renders an opt-out status instead of a value', () => {
    expect(
      formatAnswerValue({
        questionKey: 'baseline_goals',
        promptText: '',
        domain: 'all',
        answerType: 'free_text',
        displayOrder: 1,
        answerStatus: 'prefer_not_to_answer',
        value: null,
      })
    ).toBe('Prefer not to answer');
  });
});
