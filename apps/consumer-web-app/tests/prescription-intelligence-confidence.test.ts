import { describe, it, expect } from 'vitest';
import { computeConfidence } from '../lib/prescription-intelligence/confidence';
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

describe('computeConfidence', () => {
  it('is 0 / "building" when every signal is missing', () => {
    const result = computeConfidence(baseFacts());
    expect(result.confidence).toBe(0);
    expect(result.confidenceLevel).toBe('building');
    expect(result.confidenceReasons).toHaveLength(4);
  });

  it('is 1 / "high" when every signal is present', () => {
    const result = computeConfidence(
      baseFacts({
        movementProfile: { id: 'p1' } as never,
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
        recentCompletions: [{ id: 'c1' } as never],
      })
    );
    expect(result.confidence).toBe(1);
    expect(result.confidenceLevel).toBe('high');
  });

  it('lands on "moderate" with three of four signals present', () => {
    const result = computeConfidence(
      baseFacts({
        movementProfile: { id: 'p1' } as never,
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
      })
    );
    expect(result.confidence).toBe(0.75);
    expect(result.confidenceLevel).toBe('moderate');
  });

  it('every reason is present regardless of which signals are missing — coach always sees the full picture', () => {
    const result = computeConfidence(baseFacts({ movementProfile: { id: 'p1' } as never }));
    expect(result.confidenceReasons.map((r) => r.label)).toContain('Movement Profile on file');
    expect(result.confidenceReasons.map((r) => r.label)).toContain('No readiness check-in today');
  });
});
