import { describe, it, expect } from 'vitest';
import {
  buildRecoveryStatus,
  buildMovementRecommendation,
  buildStressRecommendation,
  buildSleepRecommendation,
  buildWearableCoachingBrief,
} from '../lib/brain/wearableRecommendations';
import {
  recoveryLevelText,
  movementRecommendationText,
  stressLevelRecommendationText,
  sleepDurationRecommendationText,
} from '../lib/brain/copy';
import type { WearableDailySnapshot } from '../lib/wearables/snapshot';

function snapshot(overrides: Partial<WearableDailySnapshot> = {}): WearableDailySnapshot {
  return {
    readinessScore: null,
    recoveryScore: null,
    sleepScore: null,
    sleepDurationMinutes: null,
    restingHeartRate: null,
    hrvMs: null,
    steps: null,
    stressScore: null,
    ...overrides,
  };
}

describe('buildRecoveryStatus — real recovery-level phrasing, sourced from the shared coaching voice', () => {
  it('returns null when there is no readiness score yet, never a guess', () => {
    expect(buildRecoveryStatus(snapshot())).toBeNull();
  });

  it('matches copy.ts recoveryLevelText for the classified level, not an independently written sentence', () => {
    expect(buildRecoveryStatus(snapshot({ readinessScore: 90 }))).toBe(
      recoveryLevelText('excellent')
    );
    expect(buildRecoveryStatus(snapshot({ readinessScore: 75 }))).toBe(recoveryLevelText('good'));
    expect(buildRecoveryStatus(snapshot({ readinessScore: 55 }))).toBe(recoveryLevelText('fair'));
    expect(buildRecoveryStatus(snapshot({ readinessScore: 20 }))).toBe(recoveryLevelText('poor'));
  });
});

describe('buildMovementRecommendation', () => {
  it('returns null with no step count yet', () => {
    expect(buildMovementRecommendation(snapshot())).toBeNull();
  });

  it('matches copy.ts movementRecommendationText for the real step count', () => {
    expect(buildMovementRecommendation(snapshot({ steps: 1500 }))).toBe(
      movementRecommendationText(1500)
    );
    expect(buildMovementRecommendation(snapshot({ steps: 5000 }))).toBe(
      movementRecommendationText(5000)
    );
    expect(buildMovementRecommendation(snapshot({ steps: 9000 }))).toBe(
      movementRecommendationText(9000)
    );
  });
});

describe('buildStressRecommendation', () => {
  it('returns null with no stress score yet', () => {
    expect(buildStressRecommendation(snapshot())).toBeNull();
  });

  it('matches copy.ts stressLevelRecommendationText for the real stress score', () => {
    expect(buildStressRecommendation(snapshot({ stressScore: 80 }))).toBe(
      stressLevelRecommendationText(80)
    );
    expect(buildStressRecommendation(snapshot({ stressScore: 20 }))).toBe(
      stressLevelRecommendationText(20)
    );
  });
});

describe('buildSleepRecommendation', () => {
  it('returns null with no sleep duration yet', () => {
    expect(buildSleepRecommendation(snapshot())).toBeNull();
  });

  it('converts minutes to hours before handing off to copy.ts sleepDurationRecommendationText', () => {
    expect(buildSleepRecommendation(snapshot({ sleepDurationMinutes: 300 }))).toBe(
      sleepDurationRecommendationText(5)
    );
    expect(buildSleepRecommendation(snapshot({ sleepDurationMinutes: 480 }))).toBe(
      sleepDurationRecommendationText(8)
    );
  });
});

describe('buildWearableCoachingBrief', () => {
  it('returns null when the member has no wearable snapshot at all', () => {
    expect(buildWearableCoachingBrief(null)).toBeNull();
  });

  it('assembles all four lines from one real snapshot, omitting only what has no data', () => {
    const brief = buildWearableCoachingBrief(
      snapshot({ readinessScore: 90, steps: 9000, stressScore: 20, sleepDurationMinutes: 480 })
    );
    expect(brief).toEqual({
      recoveryStatus: recoveryLevelText('excellent'),
      movementRecommendation: movementRecommendationText(9000),
      stressRecommendation: stressLevelRecommendationText(20),
      sleepRecommendation: sleepDurationRecommendationText(8),
    });
  });

  it('a partial snapshot yields a mix of real text and nulls, never a fabricated line', () => {
    const brief = buildWearableCoachingBrief(snapshot({ readinessScore: 40 }));
    expect(brief).toEqual({
      recoveryStatus: recoveryLevelText('poor'),
      movementRecommendation: null,
      stressRecommendation: null,
      sleepRecommendation: null,
    });
  });
});
