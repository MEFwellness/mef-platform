import { describe, it, expect } from 'vitest';
import { decideProgressionAction } from '../lib/prescription-intelligence/progression';
import type { PrescriptionFacts } from '../lib/prescription-intelligence/facts';
import type { MemberExerciseCompletion } from '@mef/shared-types-contracts';

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

function completion(overrides: Partial<MemberExerciseCompletion> = {}): MemberExerciseCompletion {
  return {
    id: 'c1',
    member_id: 'member-1',
    provider: 'exercise_api_dev',
    external_id: 'ex-1',
    exercise_name: 'Bird Dog',
    status: 'completed',
    duration_seconds: null,
    completion_source: 'coach_assigned',
    member_notes: null,
    difficulty_rating: 'appropriate',
    comfort_rating: 'comfortable',
    enjoyment_rating: null,
    occurred_at: '2026-07-20T00:00:00Z',
    created_at: '2026-07-20T00:00:00Z',
    ...overrides,
  };
}

describe('decideProgressionAction', () => {
  it('maintains at a conservative baseline with no history', () => {
    const result = decideProgressionAction([], baseFacts());
    expect(result.action).toBe('maintain');
  });

  it('substitutes when the most recent completion reported pain', () => {
    const result = decideProgressionAction([completion({ comfort_rating: 'pain' })], baseFacts());
    expect(result.action).toBe('substitute');
  });

  it('regresses on moderate discomfort', () => {
    const result = decideProgressionAction(
      [completion({ comfort_rating: 'moderate_discomfort' })],
      baseFacts()
    );
    expect(result.action).toBe('regress');
  });

  it('regresses when the most recent completion was rated very difficult', () => {
    const result = decideProgressionAction(
      [completion({ difficulty_rating: 'very_difficult', comfort_rating: 'comfortable' })],
      baseFacts()
    );
    expect(result.action).toBe('regress');
  });

  it('progresses when the last two completions were easy and comfortable', () => {
    const history = [
      completion({
        difficulty_rating: 'easy',
        comfort_rating: 'comfortable',
        occurred_at: '2026-07-20T00:00:00Z',
      }),
      completion({
        difficulty_rating: 'very_easy',
        comfort_rating: 'comfortable',
        occurred_at: '2026-07-18T00:00:00Z',
      }),
    ];
    const result = decideProgressionAction(history, baseFacts());
    expect(result.action).toBe('progress');
  });

  it('deloads when readiness today is poor, even with unremarkable history', () => {
    const history = [
      completion({ difficulty_rating: 'appropriate', comfort_rating: 'comfortable' }),
    ];
    const facts = baseFacts({
      latestCheckin: {
        localDate: '2026-07-21',
        painLevel: 3,
        stressLevel: 2,
        sleepQuality: 5,
        sleepDuration: '7-8h',
        energyLevel: 3,
        newOrWorseningConcern: false,
      },
    });
    const result = decideProgressionAction(history, facts);
    expect(result.action).toBe('deload');
  });

  it('repeats when history and today’s readiness are both unremarkable', () => {
    const history = [
      completion({ difficulty_rating: 'appropriate', comfort_rating: 'comfortable' }),
    ];
    const facts = baseFacts({
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
    const result = decideProgressionAction(history, facts);
    expect(result.action).toBe('repeat');
  });
});
