/**
 * Pure unit tests for lib/assessments/presentation.ts — the shared
 * mapping logic every assessment UI component (PriorityBadge,
 * QuestionnaireCard, AssessmentComparisonPanel, ScoreRing) reads from,
 * including the Questionnaires-page status derivation that decides which
 * button (Start/Resume/View Results) a card shows.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveQuestionnaireStatus,
  directionToStatus,
  priorityToStatus,
  questionnaireStatusToMetricStatus,
} from '../lib/assessments/presentation';

describe('deriveQuestionnaireStatus', () => {
  it('is "not_started" with no draft and no completed history', () => {
    expect(deriveQuestionnaireStatus(false, false)).toBe('not_started');
  });

  it('is "in_progress" whenever a draft exists, regardless of completed history', () => {
    expect(deriveQuestionnaireStatus(true, false)).toBe('in_progress');
    expect(deriveQuestionnaireStatus(true, true)).toBe('in_progress'); // a draft always wins, even mid-retake
  });

  it('is "completed" with no draft but completed history', () => {
    expect(deriveQuestionnaireStatus(false, true)).toBe('completed');
  });
});

describe('questionnaireStatusToMetricStatus', () => {
  it('maps completed -> good, in_progress -> attention, not_started -> no-data (never "poor")', () => {
    expect(questionnaireStatusToMetricStatus('completed')).toBe('good');
    expect(questionnaireStatusToMetricStatus('in_progress')).toBe('attention');
    expect(questionnaireStatusToMetricStatus('not_started')).toBe('no-data');
  });
});

describe('priorityToStatus', () => {
  it('maps low/moderate/high onto good/attention/poor', () => {
    expect(priorityToStatus('low')).toBe('good');
    expect(priorityToStatus('moderate')).toBe('attention');
    expect(priorityToStatus('high')).toBe('poor');
  });
});

describe('directionToStatus', () => {
  it('maps improved/regressed/unchanged/unknown onto good/poor/attention/no-data', () => {
    expect(directionToStatus('improved')).toBe('good');
    expect(directionToStatus('regressed')).toBe('poor');
    expect(directionToStatus('unchanged')).toBe('attention');
    expect(directionToStatus('unknown')).toBe('no-data');
  });
});
