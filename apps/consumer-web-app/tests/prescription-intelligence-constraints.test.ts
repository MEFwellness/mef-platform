import { describe, it, expect } from 'vitest';
import { deriveConstraints } from '../lib/prescription-intelligence/constraints';
import type { PrescriptionFacts } from '../lib/prescription-intelligence/facts';

function baseFacts(overrides: Partial<PrescriptionFacts> = {}): PrescriptionFacts {
  return {
    memberId: 'member-1',
    movementProfile: null,
    activeFindings: [],
    hasBaselineAssessment: false,
    hasMovementAssessment: false,
    wearableSnapshot: null,
    latestCheckin: null,
    recentCompletions: [],
    recentlyCompletedExternalIds: [],
    ...overrides,
  };
}

describe('deriveConstraints', () => {
  it('flags a red flag constraint when the check-in reports a new or worsening concern', () => {
    const facts = baseFacts({
      latestCheckin: {
        localDate: '2026-07-21',
        painLevel: null,
        stressLevel: null,
        sleepQuality: null,
        sleepDuration: null,
        energyLevel: null,
        newOrWorseningConcern: true,
      },
    });
    const constraints = deriveConstraints(facts);
    const redFlag = constraints.find((c) => c.constraintType === 'red_flag');
    expect(redFlag).toBeDefined();
    expect(redFlag!.severity).toBe('blocking');
  });

  it('escalates pain to blocking severity at 4/5 and above, high below that', () => {
    const highPain = deriveConstraints(
      baseFacts({
        latestCheckin: {
          localDate: '2026-07-21',
          painLevel: 4,
          stressLevel: null,
          sleepQuality: null,
          sleepDuration: null,
          energyLevel: null,
          newOrWorseningConcern: false,
        },
      })
    ).find((c) => c.constraintType === 'pain')!;
    expect(highPain.severity).toBe('blocking');

    const moderatePain = deriveConstraints(
      baseFacts({
        latestCheckin: {
          localDate: '2026-07-21',
          painLevel: 3,
          stressLevel: null,
          sleepQuality: null,
          sleepDuration: null,
          energyLevel: null,
          newOrWorseningConcern: false,
        },
      })
    ).find((c) => c.constraintType === 'pain')!;
    expect(moderatePain.severity).toBe('high');

    const noPainConstraint = deriveConstraints(
      baseFacts({
        latestCheckin: {
          localDate: '2026-07-21',
          painLevel: 2,
          stressLevel: null,
          sleepQuality: null,
          sleepDuration: null,
          energyLevel: null,
          newOrWorseningConcern: false,
        },
      })
    ).find((c) => c.constraintType === 'pain');
    expect(noPainConstraint).toBeUndefined();
  });

  it('classifies an active breathing finding as poor_breathing, and posture/movement findings by mobility-related code', () => {
    const facts = baseFacts({
      activeFindings: [
        {
          code: 'breathing_pattern',
          label: 'breathing_pattern',
          domain: 'breathing',
          severity: 'moderate',
        },
        { code: 'forward_head', label: 'forward_head', domain: 'posture', severity: 'significant' },
        { code: 'knee_valgus', label: 'knee_valgus', domain: 'movement', severity: 'mild' },
      ],
    });
    const constraints = deriveConstraints(facts);
    expect(constraints.find((c) => c.constraintType === 'poor_breathing')).toBeDefined();
    expect(constraints.find((c) => c.description.includes('forward head'))?.constraintType).toBe(
      'limited_mobility'
    );
    expect(constraints.find((c) => c.description.includes('knee valgus'))?.constraintType).toBe(
      'movement_dysfunction'
    );
  });

  it('flags poor_recovery from a low wearable recovery score', () => {
    const facts = baseFacts({
      wearableSnapshot: {
        readinessScore: null,
        recoveryScore: 15,
        sleepScore: null,
        sleepDurationMinutes: null,
        restingHeartRate: null,
        hrvMs: null,
        steps: null,
        stressScore: null,
      },
    });
    const constraint = deriveConstraints(facts).find((c) => c.constraintType === 'poor_recovery');
    expect(constraint).toBeDefined();
    expect(constraint!.severity).toBe('high');
  });

  it('flags missing_assessment at high severity when there is no Movement Profile at all', () => {
    const constraint = deriveConstraints(baseFacts()).find(
      (c) => c.constraintType === 'missing_assessment'
    );
    expect(constraint).toBeDefined();
    expect(constraint!.severity).toBe('high');
  });

  it('flags missing_assessment at moderate severity when a profile exists but has no real assessment signal', () => {
    const constraint = deriveConstraints(
      baseFacts({ hasBaselineAssessment: true, hasMovementAssessment: false })
    ).find((c) => c.constraintType === 'missing_assessment');
    expect(constraint).toBeDefined();
    expect(constraint!.severity).toBe('moderate');
  });

  it('produces no constraints for a member with a complete, healthy profile', () => {
    const facts = baseFacts({
      hasBaselineAssessment: true,
      hasMovementAssessment: true,
      latestCheckin: {
        localDate: '2026-07-21',
        painLevel: 0,
        stressLevel: 1,
        sleepQuality: 5,
        sleepDuration: '8h+',
        energyLevel: 5,
        newOrWorseningConcern: false,
      },
    });
    expect(deriveConstraints(facts)).toEqual([]);
  });
});
