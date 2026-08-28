import { describe, it, expect } from 'vitest';
import type { RegistryEntry } from '@mef/shared-types-contracts';
import {
  evaluateExperimentOutcomeReassessmentTriggers,
  evaluateLongitudinalReassessmentTriggers,
  evaluateReassessmentTriggers,
  evaluateRecommendationSequenceReassessmentTriggers,
} from '../lib/reassessment-intelligence/service';
import type { LongitudinalSignal } from '../lib/longitudinal-intelligence/types';
import { listAssessmentRegistryEntries } from '../lib/assessment-registry/registry';
import type { AssessmentKey } from '../lib/assessment-registry/types';

/**
 * A REASSESSMENT IS A SECOND LOOK (2026-08-27). Every evaluator now takes
 * the set of assessments this member has actually finished, and proposes
 * nothing for one she has not. The pre-existing cases below all describe a
 * member with real history, so they pass this; the cases at the bottom of
 * the file are the ones that describe a member without it.
 */
const ALL_COMPLETED: ReadonlySet<AssessmentKey> = new Set(
  listAssessmentRegistryEntries().map((e) => e.key)
);
const NONE_COMPLETED: ReadonlySet<AssessmentKey> = new Set();

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
    const result = evaluateReassessmentTriggers([finding()], new Set(), ALL_COMPLETED);
    expect(result).toHaveLength(1);
    expect(result[0]!.assessmentKey).toBe('body-assessment');
    expect(result[0]!.triggerSource).toBe('finding_change');
    expect(result[0]!.triggerContext.findingCodes).toEqual(['hip_asymmetry']);
  });

  it('ignores a worsening finding below the confidence threshold', () => {
    expect(evaluateReassessmentTriggers([finding({ confidence: 0.4 })], new Set(), ALL_COMPLETED)).toHaveLength(0);
  });

  it('ignores a finding that is not worsening', () => {
    expect(
      evaluateReassessmentTriggers([finding({ trend_status: 'stable' })], new Set(), ALL_COMPLETED)
    ).toHaveLength(0);
  });

  it('does not duplicate a suggestion for an assessment with an already-pending schedule', () => {
    const result = evaluateReassessmentTriggers([finding()], new Set(['body-assessment']), ALL_COMPLETED);
    expect(result).toHaveLength(0);
  });

  it('ignores a domain with no established assessment relationship', () => {
    expect(evaluateReassessmentTriggers([finding({ domain: 'lab' })], new Set(), ALL_COMPLETED)).toHaveLength(0);
  });
});

describe('evaluateExperimentOutcomeReassessmentTriggers (Prompt 12, Part 7)', () => {
  it('suggests a reassessment when a closed experiment didnt_work and the domain still has an active finding', () => {
    const result = evaluateExperimentOutcomeReassessmentTriggers(
      [{ sourceDomain: 'movement', outcome: 'didnt_work' }],
      [finding({ domain: 'movement', trend_status: null })],
      new Set(),
      ALL_COMPLETED
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
        new Set(),
        ALL_COMPLETED
      )
    ).toHaveLength(0);
  });

  it('does not suggest one when no active finding remains in that domain', () => {
    expect(
      evaluateExperimentOutcomeReassessmentTriggers(
        [{ sourceDomain: 'movement', outcome: 'didnt_work' }],
        [finding({ domain: 'sleep' })],
        new Set(),
        ALL_COMPLETED
      )
    ).toHaveLength(0);
  });

  it('does not duplicate a suggestion for an assessment with an already-pending schedule', () => {
    expect(
      evaluateExperimentOutcomeReassessmentTriggers(
        [{ sourceDomain: 'movement', outcome: 'didnt_work' }],
        [finding({ domain: 'movement' })],
        new Set(['body-assessment']),
        ALL_COMPLETED
      )
    ).toHaveLength(0);
  });
});

describe('evaluateRecommendationSequenceReassessmentTriggers (Prompt 12, Part 7)', () => {
  it('suggests a reassessment once completed count reaches the threshold', () => {
    const result = evaluateRecommendationSequenceReassessmentTriggers(
      [{ sourceDomain: 'stress', completedCount: 3 }],
      new Set(),
      ALL_COMPLETED
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.assessmentKey).toBe('four-doctors');
    expect(result[0]!.triggerSource).toBe('recommendation_sequence');
  });

  it('does not suggest one below the threshold', () => {
    expect(
      evaluateRecommendationSequenceReassessmentTriggers([{ sourceDomain: 'stress', completedCount: 2 }], new Set(), ALL_COMPLETED)
    ).toHaveLength(0);
  });

  it('does not duplicate a suggestion for an assessment with an already-pending schedule', () => {
    expect(
      evaluateRecommendationSequenceReassessmentTriggers(
        [{ sourceDomain: 'stress', completedCount: 5 }],
        new Set(['four-doctors']),
        ALL_COMPLETED
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
    const result = evaluateLongitudinalReassessmentTriggers([signal()], new Set(), ALL_COMPLETED);
    expect(result).toHaveLength(1);
    expect(result[0]!.assessmentKey).toBe('body-assessment');
    expect(result[0]!.triggerSource).toBe('finding_change');
  });

  it('suggests a reassessment for a resolved pattern too (worth confirming)', () => {
    const result = evaluateLongitudinalReassessmentTriggers([signal({ state: 'resolved' })], new Set(), ALL_COMPLETED);
    expect(result).toHaveLength(1);
  });

  it('ignores a checkin_metric signal (no direct assessment mapping) even if established', () => {
    expect(
      evaluateLongitudinalReassessmentTriggers(
        [signal({ signalKind: 'checkin_metric', signalKey: 'checkin_metric::stress' })],
        new Set(),
        ALL_COMPLETED
      )
    ).toHaveLength(0);
  });

  it('ignores a signal state that is not established_pattern or resolved', () => {
    expect(evaluateLongitudinalReassessmentTriggers([signal({ state: 'repeated_signal' })], new Set(), ALL_COMPLETED)).toHaveLength(0);
  });

  it('does not duplicate a suggestion for an assessment with an already-pending schedule', () => {
    expect(evaluateLongitudinalReassessmentTriggers([signal()], new Set(['body-assessment']), ALL_COMPLETED)).toHaveLength(0);
  });
});

/**
 * A1, the phantom "Reassessment due" (2026-08-27). Four of the six pending
 * schedules on production were for an assessment the member had never
 * completed, across three accounts, one of them a real tester. One was the
 * camera Body Assessment. Every evaluator refuses now, and each of these
 * cases fails the moment its guard is removed.
 */
describe('nothing is ever reassessed that was never assessed', () => {
  it('the worsening-finding evaluator proposes nothing for an assessment with no completion', () => {
    expect(evaluateReassessmentTriggers([finding()], new Set(), NONE_COMPLETED)).toHaveLength(0);
  });

  it('the worsening-finding evaluator still proposes one when that same assessment IS completed', () => {
    const result = evaluateReassessmentTriggers(
      [finding()],
      new Set(),
      new Set<AssessmentKey>(['body-assessment'])
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.assessmentKey).toBe('body-assessment');
  });

  it('a completion of a DIFFERENT assessment does not unlock this one', () => {
    expect(
      evaluateReassessmentTriggers([finding()], new Set(), new Set<AssessmentKey>(['four-doctors']))
    ).toHaveLength(0);
  });

  it('the experiment-outcome evaluator proposes nothing for an assessment with no completion', () => {
    expect(
      evaluateExperimentOutcomeReassessmentTriggers(
        [{ sourceDomain: 'movement', outcome: 'didnt_work' }],
        [finding({ domain: 'movement', trend_status: null })],
        new Set(),
        NONE_COMPLETED
      )
    ).toHaveLength(0);
  });

  it('the recommendation-sequence evaluator proposes nothing for an assessment with no completion', () => {
    expect(
      evaluateRecommendationSequenceReassessmentTriggers(
        [{ sourceDomain: 'stress', completedCount: 5 }],
        new Set(),
        NONE_COMPLETED
      )
    ).toHaveLength(0);
  });

  it('the longitudinal evaluator proposes nothing for an assessment with no completion', () => {
    expect(evaluateLongitudinalReassessmentTriggers([signalForGuard()], new Set(), NONE_COMPLETED)).toHaveLength(0);
  });
});

function signalForGuard(): LongitudinalSignal {
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
  };
}
