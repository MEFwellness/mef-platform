import { describe, it, expect } from 'vitest';
import type { RegistryEntry } from '@mef/shared-types-contracts';
import {
  evaluateExperimentOutcomeReassessmentTriggers,
  evaluateLongitudinalReassessmentTriggers,
  evaluateReassessmentTriggers,
  evaluateRecommendationSequenceReassessmentTriggers,
} from '../lib/reassessment-intelligence/service';
import type { LongitudinalSignal } from '../lib/longitudinal-intelligence/types';

function finding(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id: 'e1',
    member_id: 'u1',
    entry_kind: 'finding',
    domain: 'movement',
    code: 'hip_asymmetry',
    label: 'Hip Instability',
    severity: 'moderate',
    numeric_value: null,
    unit: null,
    confidence: 0.7,
    narrative: null,
    evidence_refs: [],
    source_feature: 'body_assessment_finding',
    source_record_id: 'r1',
    status: 'active',
    trend_status: 'worsening',
    member_visible: true,
    coach_context: null,
    coach_reviewed_by: null,
    coach_reviewed_at: null,
    supersedes_id: null,
    superseded_by_id: null,
    recorded_at: '2026-01-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('evaluateReassessmentTriggers', () => {
  it('suggests a reassessment for a worsening, high-confidence finding', () => {
    const result = evaluateReassessmentTriggers([finding()], new Set());
    expect(result).toHaveLength(1);
    expect(result[0]!.assessmentKey).toBe('body-assessment');
    expect(result[0]!.triggerSource).toBe('finding_change');
    expect(result[0]!.triggerContext.findingCodes).toEqual(['hip_asymmetry']);
  });

  it('ignores a worsening finding below the confidence threshold', () => {
    expect(evaluateReassessmentTriggers([finding({ confidence: 0.4 })], new Set())).toHaveLength(0);
  });

  it('ignores a finding that is not worsening', () => {
    expect(
      evaluateReassessmentTriggers([finding({ trend_status: 'stable' })], new Set())
    ).toHaveLength(0);
  });

  it('does not duplicate a suggestion for an assessment with an already-pending schedule', () => {
    const result = evaluateReassessmentTriggers([finding()], new Set(['body-assessment']));
    expect(result).toHaveLength(0);
  });

  it('ignores a domain with no established assessment relationship', () => {
    expect(evaluateReassessmentTriggers([finding({ domain: 'lab' })], new Set())).toHaveLength(0);
  });
});

describe('evaluateExperimentOutcomeReassessmentTriggers (Prompt 12, Part 7)', () => {
  it('suggests a reassessment when a closed experiment didnt_work and the domain still has an active finding', () => {
    const result = evaluateExperimentOutcomeReassessmentTriggers(
      [{ sourceDomain: 'movement', outcome: 'didnt_work' }],
      [finding({ domain: 'movement', trend_status: null })],
      new Set()
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.assessmentKey).toBe('body-assessment');
    expect(result[0]!.triggerSource).toBe('experiment_outcome');
  });

  it('does not suggest one when the outcome was worked/inconclusive', () => {
    expect(
      evaluateExperimentOutcomeReassessmentTriggers(
        [{ sourceDomain: 'movement', outcome: 'worked' }],
        [finding({ domain: 'movement' })],
        new Set()
      )
    ).toHaveLength(0);
  });

  it('does not suggest one when no active finding remains in that domain', () => {
    expect(
      evaluateExperimentOutcomeReassessmentTriggers(
        [{ sourceDomain: 'movement', outcome: 'didnt_work' }],
        [finding({ domain: 'sleep' })],
        new Set()
      )
    ).toHaveLength(0);
  });

  it('does not duplicate a suggestion for an assessment with an already-pending schedule', () => {
    expect(
      evaluateExperimentOutcomeReassessmentTriggers(
        [{ sourceDomain: 'movement', outcome: 'didnt_work' }],
        [finding({ domain: 'movement' })],
        new Set(['body-assessment'])
      )
    ).toHaveLength(0);
  });
});

describe('evaluateRecommendationSequenceReassessmentTriggers (Prompt 12, Part 7)', () => {
  it('suggests a reassessment once completed count reaches the threshold', () => {
    const result = evaluateRecommendationSequenceReassessmentTriggers(
      [{ sourceDomain: 'stress', completedCount: 3 }],
      new Set()
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.assessmentKey).toBe('four-doctors');
    expect(result[0]!.triggerSource).toBe('recommendation_sequence');
  });

  it('does not suggest one below the threshold', () => {
    expect(
      evaluateRecommendationSequenceReassessmentTriggers([{ sourceDomain: 'stress', completedCount: 2 }], new Set())
    ).toHaveLength(0);
  });

  it('does not duplicate a suggestion for an assessment with an already-pending schedule', () => {
    expect(
      evaluateRecommendationSequenceReassessmentTriggers(
        [{ sourceDomain: 'stress', completedCount: 5 }],
        new Set(['four-doctors'])
      )
    ).toHaveLength(0);
  });
});

describe('evaluateLongitudinalReassessmentTriggers (Prompt 12, Part 7)', () => {
  function signal(overrides: Partial<LongitudinalSignal> = {}): LongitudinalSignal {
    return {
      signalKey: 'registry::movement::hip_asymmetry',
      signalKind: 'registry_finding',
      signalLabel: 'Hip Instability',
      state: 'established_pattern',
      tier: 3,
      occurrenceCount: 4,
      confidence: 0.8,
      firstObservedAt: '2026-06-01T00:00:00Z',
      lastObservedAt: '2026-07-15T00:00:00Z',
      evidenceSummary: { code: 'hip_asymmetry' },
      ...overrides,
    };
  }

  it('suggests a reassessment for an established registry-finding pattern', () => {
    const result = evaluateLongitudinalReassessmentTriggers([signal()], new Set());
    expect(result).toHaveLength(1);
    expect(result[0]!.assessmentKey).toBe('body-assessment');
    expect(result[0]!.triggerSource).toBe('finding_change');
  });

  it('suggests a reassessment for a resolved pattern too (worth confirming)', () => {
    const result = evaluateLongitudinalReassessmentTriggers([signal({ state: 'resolved' })], new Set());
    expect(result).toHaveLength(1);
  });

  it('ignores a checkin_metric signal (no direct assessment mapping) even if established', () => {
    expect(
      evaluateLongitudinalReassessmentTriggers(
        [signal({ signalKind: 'checkin_metric', signalKey: 'checkin_metric::stress' })],
        new Set()
      )
    ).toHaveLength(0);
  });

  it('ignores a signal state that is not established_pattern or resolved', () => {
    expect(evaluateLongitudinalReassessmentTriggers([signal({ state: 'repeated_signal' })], new Set())).toHaveLength(0);
  });

  it('does not duplicate a suggestion for an assessment with an already-pending schedule', () => {
    expect(evaluateLongitudinalReassessmentTriggers([signal()], new Set(['body-assessment']))).toHaveLength(0);
  });
});
