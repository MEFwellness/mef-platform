import { describe, it, expect } from 'vitest';
import type { UnifiedAssessmentQuestion, UnifiedAssessmentSection } from '@mef/shared-types-contracts';
import {
  buildSession,
  calculateProgress,
  calculateVisibleQuestions,
  findFirstUnanswered,
  flattenVisibleQuestions,
  jumpToQuestion,
  nextQuestion,
  previousQuestion,
} from '../lib/assessment-runtime/session';
import type { SessionAnswers } from '../lib/assessment-runtime/types';

function section(overrides: Partial<UnifiedAssessmentSection> = {}): UnifiedAssessmentSection {
  return {
    id: 'section-1',
    assessment_definition_id: 'def-1',
    title: 'Section',
    subtitle: null,
    display_order: 0,
    adaptive_rules: null,
    completion_rules: null,
    optional: false,
    required: true,
    safety_category: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function question(overrides: Partial<UnifiedAssessmentQuestion> = {}): UnifiedAssessmentQuestion {
  return {
    id: overrides.question_key ?? 'q-id',
    question_key: 'q',
    assessment_definition_id: 'def-1',
    section_id: 'section-1',
    version: 1,
    active: true,
    display_order: 0,
    prompt: 'A question',
    description: null,
    answer_type: 'boolean',
    answer_options: null,
    validation: null,
    tags: null,
    body_system: null,
    body_region: null,
    concern_category: null,
    educational_tags: null,
    coach_tags: null,
    related_systems: null,
    severity_tags: null,
    weight: 1,
    requires: null,
    excludes: null,
    boosts: null,
    priority: null,
    follow_up_rules: null,
    skip_rules: null,
    completion_rules: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('calculateVisibleQuestions', () => {
  it('shows every question with no rules', () => {
    const questions = [question({ id: 'a', question_key: 'a' }), question({ id: 'b', question_key: 'b' })];
    const { visible, hidden } = calculateVisibleQuestions(questions, {});
    expect(visible.map((q) => q.question_key)).toEqual(['a', 'b']);
    expect(hidden).toHaveLength(0);
  });

  it('excludes inactive questions entirely (not visible, not hidden)', () => {
    const questions = [question({ id: 'a', question_key: 'a', active: false })];
    const { visible, hidden } = calculateVisibleQuestions(questions, {});
    expect(visible).toHaveLength(0);
    expect(hidden).toHaveLength(0);
  });

  it('hides a question whose requires condition is unmet, shows it once met', () => {
    const gated = question({
      id: 'b',
      question_key: 'b',
      requires: { type: 'leaf', questionKey: 'gate', op: 'equals', value: 'yes' },
    });
    const questions = [question({ id: 'a', question_key: 'a' }), gated];

    const before = calculateVisibleQuestions(questions, {});
    expect(before.visible.map((q) => q.question_key)).toEqual(['a']);
    expect(before.hidden.map((q) => q.question_key)).toEqual(['b']);

    const after = calculateVisibleQuestions(questions, { gate: 'yes' });
    expect(after.visible.map((q) => q.question_key)).toEqual(['a', 'b']);
  });

  it('hides a question whose excludes condition is met', () => {
    const excluded = question({
      id: 'b',
      question_key: 'b',
      excludes: { type: 'leaf', questionKey: 'gate', op: 'equals', value: 'no' },
    });
    const questions = [excluded];
    expect(calculateVisibleQuestions(questions, {}).visible).toHaveLength(1);
    expect(calculateVisibleQuestions(questions, { gate: 'no' }).visible).toHaveLength(0);
  });

  it('hides a question matched by any skip_rules entry', () => {
    const skippable = question({
      id: 'b',
      question_key: 'b',
      skip_rules: [{ type: 'leaf', questionKey: 'already_covered', op: 'equals', value: true }],
    });
    expect(calculateVisibleQuestions([skippable], {}).visible).toHaveLength(1);
    expect(calculateVisibleQuestions([skippable], { already_covered: true }).hidden).toHaveLength(1);
  });

  it('supports nested AND/OR requires conditions', () => {
    const nested = question({
      id: 'b',
      question_key: 'b',
      requires: {
        type: 'or',
        conditions: [
          {
            type: 'and',
            conditions: [
              { type: 'leaf', questionKey: 'gender', op: 'equals', value: 'male' },
              { type: 'leaf', questionKey: 'age', op: 'greaterThan', value: 60 },
            ],
          },
          { type: 'leaf', questionKey: 'smoker', op: 'equals', value: true },
        ],
      },
    });
    expect(calculateVisibleQuestions([nested], { gender: 'male', age: 65 }).visible).toHaveLength(1);
    expect(calculateVisibleQuestions([nested], { gender: 'female', age: 20, smoker: true }).visible).toHaveLength(1);
    expect(calculateVisibleQuestions([nested], { gender: 'female', age: 20, smoker: false }).visible).toHaveLength(0);
  });

  it('excludes wins over requires when both match', () => {
    const both = question({
      id: 'b',
      question_key: 'b',
      requires: { type: 'leaf', questionKey: 'concern', op: 'equals', value: 'sleep' },
      excludes: { type: 'leaf', questionKey: 'severity', op: 'equals', value: 'mild' },
    });
    const answers: SessionAnswers = { concern: 'sleep', severity: 'mild' };
    expect(calculateVisibleQuestions([both], answers).visible).toHaveLength(0);
  });
});

describe('calculateProgress', () => {
  it('uses answered-visible / visible, not total-in-bank', () => {
    const questions = [
      question({ id: 'a', question_key: 'a' }),
      question({ id: 'b', question_key: 'b' }),
      question({
        id: 'c',
        question_key: 'c',
        requires: { type: 'leaf', questionKey: 'gate', op: 'equals', value: 'yes' },
      }),
    ];
    // 'c' is hidden (gate unmet), so the denominator is 2, not 3.
    const progress = calculateProgress(calculateVisibleQuestions(questions, { a: true }).visible, { a: true });
    expect(progress.visible).toBe(2);
    expect(progress.answered).toBe(1);
    expect(progress.completionPercentage).toBe(50);
  });

  it('is 0% for an empty visible set, never divides by zero', () => {
    expect(calculateProgress([], {})).toEqual({ answered: 0, visible: 0, completionPercentage: 0 });
  });
});

describe('navigation — flatten / next / previous / jump', () => {
  const sectionOne = section({ id: 's1', display_order: 0 });
  const sectionTwo = section({ id: 's2', display_order: 1 });
  const questions = [
    question({ id: 'a', question_key: 'a', section_id: 's1', display_order: 1 }),
    question({ id: 'b', question_key: 'b', section_id: 's1', display_order: 0 }),
    question({ id: 'c', question_key: 'c', section_id: 's2', display_order: 0 }),
  ];

  it('orders by section display_order then question display_order within section', () => {
    const flat = flattenVisibleQuestions([sectionOne, sectionTwo], questions);
    expect(flat.map((r) => r.question.question_key)).toEqual(['b', 'a', 'c']);
  });

  it('findFirstUnanswered returns the first ref with no answer', () => {
    const flat = flattenVisibleQuestions([sectionOne, sectionTwo], questions);
    expect(findFirstUnanswered(flat, {})?.question.question_key).toBe('b');
    expect(findFirstUnanswered(flat, { b: true, a: true, c: true })).toBeNull();
  });

  it('nextQuestion / previousQuestion step through the flattened order', () => {
    const flat = flattenVisibleQuestions([sectionOne, sectionTwo], questions);
    expect(nextQuestion(flat, null)?.question.question_key).toBe('b');
    expect(nextQuestion(flat, 'b')?.question.question_key).toBe('a');
    expect(nextQuestion(flat, 'c')).toBeNull();
    expect(previousQuestion(flat, 'a')?.question.question_key).toBe('b');
    expect(previousQuestion(flat, 'b')).toBeNull();
    expect(previousQuestion(flat, null)).toBeNull();
  });

  it('jumpToQuestion finds a question by key regardless of position', () => {
    const flat = flattenVisibleQuestions([sectionOne, sectionTwo], questions);
    expect(jumpToQuestion(flat, 'c')?.question.question_key).toBe('c');
    expect(jumpToQuestion(flat, 'missing')).toBeNull();
  });
});

describe('buildSession', () => {
  it('assembles current position, progress, hidden questions, and findings/flags in one pass', () => {
    const s1 = section({ id: 's1', display_order: 0 });
    const finding = question({
      id: 'severe',
      question_key: 'severe_symptom',
      section_id: 's1',
      display_order: 0,
      answer_type: 'boolean',
      concern_category: 'stress',
      severity_tags: ['significant'],
      validation: { findingRule: { type: 'boolean_true' } },
    });
    const gated = question({
      id: 'followup',
      question_key: 'followup',
      section_id: 's1',
      display_order: 1,
      requires: { type: 'leaf', questionKey: 'severe_symptom', op: 'equals', value: true },
    });

    const session = buildSession({
      id: 'session-1',
      assessmentId: 'def-1',
      assessmentVersion: 1,
      memberId: 'member-1',
      status: 'in_progress',
      startedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      completedAt: null,
      sections: [s1],
      questions: [finding, gated],
      answers: { severe_symptom: true },
    });

    expect(session.visibleQuestions.map((q) => q.question_key)).toEqual(['severe_symptom', 'followup']);
    expect(session.completedQuestions.map((q) => q.question_key)).toEqual(['severe_symptom']);
    expect(session.currentQuestion?.question_key).toBe('followup');
    expect(session.progress).toEqual({ answered: 1, visible: 2 });
    expect(session.completionPercentage).toBe(50);
    expect(session.findings).toEqual([
      { questionKey: 'severe_symptom', domain: 'stress', code: 'severe_symptom', label: 'A question', severity: 'significant' },
    ]);
    expect(session.flags).toEqual([{ questionKey: 'severe_symptom', label: 'A question' }]);
  });
});
