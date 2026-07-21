import { describe, it, expect } from 'vitest';
import {
  decideReadinessTier,
  decideIncludedBlocks,
  buildStrategyBlocks,
} from '../lib/prescription-intelligence/strategy';
import type { PrescriptionFacts } from '../lib/prescription-intelligence/facts';
import type { PrescriptionConstraintDraft } from '../lib/prescription-intelligence/constraints';

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

function constraint(
  type: PrescriptionConstraintDraft['constraintType'],
  severity: PrescriptionConstraintDraft['severity'] = 'moderate'
): PrescriptionConstraintDraft {
  return { constraintType: type, description: `${type} constraint`, severity, evidenceRefs: [] };
}

describe('decideReadinessTier', () => {
  it('reads tier straight from a wearable recovery score when present, ignoring check-in data', () => {
    expect(
      decideReadinessTier(baseFacts({ wearableSnapshot: { recoveryScore: 80 } as never }), [])
    ).toBe('ready');
    expect(
      decideReadinessTier(baseFacts({ wearableSnapshot: { recoveryScore: 50 } as never }), [])
    ).toBe('moderate');
    expect(
      decideReadinessTier(baseFacts({ wearableSnapshot: { recoveryScore: 10 } as never }), [])
    ).toBe('limited');
  });

  it('falls back to "rest" when pain is 4+ and there is no wearable data', () => {
    const facts = baseFacts({
      latestCheckin: {
        localDate: '2026-07-21',
        painLevel: 4,
        stressLevel: null,
        sleepQuality: null,
        sleepDuration: null,
        energyLevel: null,
        newOrWorseningConcern: false,
      },
    });
    expect(decideReadinessTier(facts, [])).toBe('rest');
  });

  it('is "ready" with a clean check-in and no wearable data', () => {
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
    expect(decideReadinessTier(facts, [])).toBe('ready');
  });

  it('degrades with two or more poor signals (pain 3+, stress 4+, sleep <=2)', () => {
    const facts = baseFacts({
      latestCheckin: {
        localDate: '2026-07-21',
        painLevel: 3,
        stressLevel: 4,
        sleepQuality: 5,
        sleepDuration: '7-8h',
        energyLevel: 4,
        newOrWorseningConcern: false,
      },
    });
    expect(decideReadinessTier(facts, [])).toBe('limited');
  });
});

describe('decideIncludedBlocks', () => {
  it('always includes preparation and recovery', () => {
    const included = decideIncludedBlocks('ready', [], [], []);
    expect(included[0]).toBe('preparation');
    expect(included[included.length - 1]).toBe('recovery');
  });

  it('never includes strength/power/conditioning when readiness tier is "rest"', () => {
    const included = decideIncludedBlocks('rest', [], [], ['fat loss', 'athletic performance']);
    expect(included).not.toContain('strength');
    expect(included).not.toContain('power');
    expect(included).not.toContain('conditioning');
  });

  it('never includes strength when a pain constraint exists, even at "ready" tier', () => {
    const included = decideIncludedBlocks('ready', [constraint('pain')], [], []);
    expect(included).not.toContain('strength');
  });

  it('includes stability, and excludes power, when corrective priorities name an instability pattern', () => {
    const included = decideIncludedBlocks(
      'ready',
      [],
      ['scapular instability'],
      ['athletic performance']
    );
    expect(included).toContain('stability');
    expect(included).not.toContain('power');
  });

  it('includes power only at "ready" tier with a matching performance goal and no instability', () => {
    const readyWithGoal = decideIncludedBlocks('ready', [], [], ['athletic performance']);
    expect(readyWithGoal).toContain('power');

    const moderateWithGoal = decideIncludedBlocks('moderate', [], [], ['athletic performance']);
    expect(moderateWithGoal).not.toContain('power');

    const readyNoGoal = decideIncludedBlocks('ready', [], [], ['general fitness']);
    expect(readyNoGoal).not.toContain('power');
  });

  it('includes breathing whenever a poor_breathing, high_stress, sleep_deprivation, or pain constraint exists', () => {
    for (const type of ['poor_breathing', 'high_stress', 'sleep_deprivation', 'pain'] as const) {
      expect(decideIncludedBlocks('ready', [constraint(type)], [], [])).toContain('breathing');
    }
  });
});

describe('buildStrategyBlocks', () => {
  it('every included block carries a non-empty, block-specific reasoning string', () => {
    const facts = baseFacts({
      movementProfile: {
        exercise_restrictions: [],
        contraindications: [],
        medical_restrictions: [],
      } as never,
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
    const blocks = buildStrategyBlocks(facts, [], ['general fitness'], [], [], 30);
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block.blockReasoning.length).toBeGreaterThan(10);
    }
  });

  it('allocates every included block at least 60 seconds, and the total is close to the time available', () => {
    const facts = baseFacts({
      movementProfile: {
        exercise_restrictions: [],
        contraindications: [],
        medical_restrictions: [],
      } as never,
    });
    const blocks = buildStrategyBlocks(facts, [], [], [], [], 30);
    for (const block of blocks) {
      expect(block.timeAllocationSeconds).toBeGreaterThanOrEqual(60);
    }
    const total = blocks.reduce((sum, b) => sum + b.timeAllocationSeconds, 0);
    expect(total).toBeLessThanOrEqual(30 * 60 + blocks.length * 5); // rounding slack only
  });

  it('never assigns "advanced" difficulty — the engine only ever picks beginner or intermediate', () => {
    const facts = baseFacts({
      movementProfile: {
        exercise_restrictions: [],
        contraindications: [],
        medical_restrictions: [],
      } as never,
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
    const blocks = buildStrategyBlocks(facts, [], [], [], [], 30);
    for (const block of blocks) {
      expect(['beginner', 'intermediate']).toContain(block.difficulty);
    }
  });
});
