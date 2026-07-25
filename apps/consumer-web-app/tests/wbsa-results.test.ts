import { describe, it, expect } from 'vitest';
import type { UnifiedAssessmentQuestion, UnifiedAssessmentSection } from '@mef/shared-types-contracts';
import {
  computeWbsaSystemBreakdown,
  hasAnySkippedQuestion,
  rankSystemsNeedingAttention,
  systemsWithLowerPattern,
} from '../lib/wbsa/results';
import { PREFER_NOT_TO_ANSWER, type DerivedFinding, type SessionAnswers } from '../lib/assessment-runtime/types';

function section(overrides: Partial<UnifiedAssessmentSection> = {}): UnifiedAssessmentSection {
  return {
    id: 's1',
    assessment_definition_id: 'def-1',
    title: 'Upper Digestive Function',
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
    section_id: 's1',
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
    allows_prefer_not_to_answer: false,
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

function finding(questionKey: string, severity: DerivedFinding['severity'], domain = 'digestive'): DerivedFinding {
  return { questionKey, domain, code: questionKey, label: 'A finding', severity };
}

describe('lib/wbsa/results — per-body-system band computation', () => {
  it('bands a section with zero findings as "lower"', () => {
    const sections = [section()];
    const questions = [question({ question_key: 'q1' })];
    const answers: SessionAnswers = { q1: false };
    const rows = computeWbsaSystemBreakdown(sections, questions, answers, []);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.band).toBe('lower');
    expect(rows[0]!.findingCount).toBe(0);
  });

  it('bands a section with exactly one mild finding as still "lower"', () => {
    const sections = [section()];
    const questions = [question({ question_key: 'q1' })];
    const answers: SessionAnswers = { q1: true };
    const rows = computeWbsaSystemBreakdown(sections, questions, answers, [finding('q1', 'mild')]);
    expect(rows[0]!.band).toBe('lower');
  });

  it('bands a section with a moderate finding, or 2+ mild findings, as "watch"', () => {
    const sections = [section()];
    const questions = [question({ question_key: 'q1' }), question({ question_key: 'q2', id: 'q2' })];
    const answers: SessionAnswers = { q1: true, q2: true };

    const withModerate = computeWbsaSystemBreakdown(sections, questions, answers, [finding('q1', 'moderate')]);
    expect(withModerate[0]!.band).toBe('watch');

    const withTwoMild = computeWbsaSystemBreakdown(sections, questions, answers, [
      finding('q1', 'mild'),
      finding('q2', 'mild'),
    ]);
    expect(withTwoMild[0]!.band).toBe('watch');
  });

  it('bands a section with any significant finding as "needs_context", regardless of other findings', () => {
    const sections = [section()];
    const questions = [question({ question_key: 'q1' })];
    const answers: SessionAnswers = { q1: true };
    const rows = computeWbsaSystemBreakdown(sections, questions, answers, [finding('q1', 'significant')]);
    expect(rows[0]!.band).toBe('needs_context');
  });

  it('counts a prefer-not-to-answer sentinel as skipped, not as a finding', () => {
    const sections = [section()];
    const questions = [question({ question_key: 'q1', allows_prefer_not_to_answer: true })];
    const answers: SessionAnswers = { q1: PREFER_NOT_TO_ANSWER };
    const rows = computeWbsaSystemBreakdown(sections, questions, answers, []);
    expect(rows[0]!.skippedCount).toBe(1);
    expect(hasAnySkippedQuestion(rows)).toBe(true);
  });

  it('ranks needs_context above watch, and excludes lower-band systems from the attention list', () => {
    const sections = [
      section({ id: 'a', title: 'A', display_order: 0 }),
      section({ id: 'b', title: 'B', display_order: 1 }),
      section({ id: 'c', title: 'C', display_order: 2 }),
    ];
    const questions = [
      question({ question_key: 'qa', id: 'qa', section_id: 'a' }),
      question({ question_key: 'qb', id: 'qb', section_id: 'b' }),
      question({ question_key: 'qc', id: 'qc', section_id: 'c' }),
    ];
    const answers: SessionAnswers = { qa: true, qb: true, qc: true };
    const findings = [finding('qa', 'moderate'), finding('qb', 'significant')];
    const rows = computeWbsaSystemBreakdown(sections, questions, answers, findings);

    const attention = rankSystemsNeedingAttention(rows);
    expect(attention.map((r) => r.title)).toEqual(['B', 'A']);
    expect(systemsWithLowerPattern(rows).map((r) => r.title)).toEqual(['C']);
  });
});
