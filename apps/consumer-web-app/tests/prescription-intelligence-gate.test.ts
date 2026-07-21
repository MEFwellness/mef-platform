import { describe, it, expect } from 'vitest';
import { evaluatePrescriptionGate } from '../lib/prescription-intelligence/gate';
import type { PrescriptionFacts } from '../lib/prescription-intelligence/facts';
import type { PrescriptionConstraintDraft } from '../lib/prescription-intelligence/constraints';

function baseFacts(overrides: Partial<PrescriptionFacts> = {}): PrescriptionFacts {
  return {
    memberId: 'member-1',
    movementProfile: {
      id: 'p1',
      member_id: 'member-1',
      goals: ['general fitness'],
      equipment_access: [],
      favorite_movement_types: [],
      mobility_priorities: [],
      stability_priorities: [],
      strength_priorities: [],
      assessment_references: [],
      program_history_references: [],
      movement_limitations: [],
      exercise_restrictions: [],
      contraindications: [],
      medical_restrictions: [],
      corrective_priorities: [],
      capability_summary: null,
      exercise_clearance: null,
      assessment_interpretation: null,
      coach_observations: null,
      member_fields_updated_at: null,
      coach_fields_updated_at: null,
      coach_fields_updated_by: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    activeFindings: [],
    hasBaselineAssessment: true,
    hasMovementAssessment: true,
    wearableSnapshot: null,
    latestCheckin: {
      localDate: '2026-07-21',
      painLevel: 0,
      stressLevel: 2,
      sleepQuality: 4,
      sleepDuration: '7-8h',
      energyLevel: 4,
      newOrWorseningConcern: false,
    },
    recentCompletions: [],
    recentlyCompletedExternalIds: [],
    ...overrides,
  };
}

describe('evaluatePrescriptionGate', () => {
  it('does not block a member with a complete profile, readiness signal, and no serious constraints', () => {
    const result = evaluatePrescriptionGate(baseFacts(), []);
    expect(result.blocked).toBe(false);
  });

  it('blocks with red_flag when a red_flag constraint exists, regardless of severity elsewhere', () => {
    const constraints: PrescriptionConstraintDraft[] = [
      { constraintType: 'red_flag', description: 'x', severity: 'blocking', evidenceRefs: [] },
    ];
    const result = evaluatePrescriptionGate(baseFacts(), constraints);
    expect(result).toEqual({
      blocked: true,
      blockReason: 'red_flag',
      recommendedAlternative: 'coach_review',
    });
  });

  it('blocks with extremely_poor_readiness when any constraint is severity blocking (and no red flag)', () => {
    const constraints: PrescriptionConstraintDraft[] = [
      { constraintType: 'pain', description: 'x', severity: 'blocking', evidenceRefs: [] },
    ];
    const result = evaluatePrescriptionGate(baseFacts(), constraints);
    expect(result).toEqual({
      blocked: true,
      blockReason: 'extremely_poor_readiness',
      recommendedAlternative: 'recovery_session',
    });
  });

  it('blocks with missing_baseline_assessment when there is no Movement Profile', () => {
    const result = evaluatePrescriptionGate(baseFacts({ movementProfile: null }), []);
    expect(result).toEqual({
      blocked: true,
      blockReason: 'missing_baseline_assessment',
      recommendedAlternative: 'coach_review',
    });
  });

  it('blocks with insufficient_data when a profile exists but has literally no usable signal anywhere', () => {
    const facts = baseFacts({
      hasMovementAssessment: false,
      latestCheckin: null,
      recentCompletions: [],
      movementProfile: {
        ...baseFacts().movementProfile!,
        goals: [],
      },
    });
    const result = evaluatePrescriptionGate(facts, []);
    expect(result).toEqual({
      blocked: true,
      blockReason: 'insufficient_data',
      recommendedAlternative: 'coach_review',
    });
  });

  it('blocks with extremely_poor_readiness (breathing_session) when stress/sleep/energy are all at rock bottom together', () => {
    const facts = baseFacts({
      latestCheckin: {
        localDate: '2026-07-21',
        painLevel: 0,
        stressLevel: 5,
        sleepQuality: 1,
        sleepDuration: '<5h',
        energyLevel: 1,
        newOrWorseningConcern: false,
      },
    });
    const result = evaluatePrescriptionGate(facts, []);
    expect(result).toEqual({
      blocked: true,
      blockReason: 'extremely_poor_readiness',
      recommendedAlternative: 'breathing_session',
    });
  });
});
