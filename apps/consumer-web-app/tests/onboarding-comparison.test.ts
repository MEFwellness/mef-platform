import { describe, it, expect } from 'vitest';
import { buildComparison, buildProgressSummary } from '../lib/onboarding/comparison';
import type { BaselineAssessment, BaselineAnswer } from '../lib/onboarding/baseline';

function answer(overrides: Partial<BaselineAnswer>): BaselineAnswer {
  return {
    questionKey: 'baseline_sleep_quality',
    promptText: '',
    domain: 'sleep',
    answerType: 'numeric',
    displayOrder: 1,
    answerStatus: 'answered',
    value: 3,
    ...overrides,
  };
}

function assessment(answers: BaselineAnswer[]): BaselineAssessment {
  return {
    submissionId: 's1',
    submittedAt: '2026-01-01T00:00:00.000Z',
    localDate: '2026-01-01',
    timezone: 'America/New_York',
    answers,
  };
}

describe('buildComparison', () => {
  it('returns null on both sides for every metric when there is no baseline or latest', () => {
    const metrics = buildComparison(null, null);
    expect(metrics.every((m) => m.baseline === null && m.latest === null)).toBe(true);
    expect(metrics.every((m) => m.direction === null)).toBe(true);
  });

  it('marks mood and hydration as not tracked by the assessment, with no fabricated value', () => {
    const baseline = assessment([answer({ questionKey: 'baseline_sleep_quality', value: 2 })]);
    const metrics = buildComparison(baseline, null);
    const mood = metrics.find((m) => m.key === 'mood')!;
    const hydration = metrics.find((m) => m.key === 'hydration')!;
    expect(mood.trackedByAssessment).toBe(false);
    expect(mood.baseline).toBeNull();
    expect(hydration.trackedByAssessment).toBe(false);
    expect(hydration.baseline).toBeNull();
  });

  it('computes improved direction when a 1-5 metric crosses into a better status band', () => {
    const baseline = assessment([answer({ questionKey: 'baseline_sleep_quality', value: 2 })]); // poor
    const latest = assessment([answer({ questionKey: 'baseline_sleep_quality', value: 4 })]); // good
    const metrics = buildComparison(baseline, latest);
    const sleep = metrics.find((m) => m.key === 'sleep')!;
    expect(sleep.baseline?.status).toBe('poor');
    expect(sleep.latest?.status).toBe('good');
    expect(sleep.direction).toBe('improved');
  });

  it('computes declined direction for stress, where a HIGHER raw value is worse', () => {
    const baseline = assessment([
      answer({ questionKey: 'baseline_stress_level', domain: 'mind_stress', value: 1 }),
    ]); // good
    const latest = assessment([
      answer({ questionKey: 'baseline_stress_level', domain: 'mind_stress', value: 5 }),
    ]); // poor
    const metrics = buildComparison(baseline, latest);
    const stress = metrics.find((m) => m.key === 'stress')!;
    expect(stress.direction).toBe('declined');
  });

  it('treats a same-status change as stable even if the raw number moved', () => {
    const baseline = assessment([
      answer({ questionKey: 'baseline_energy_level', domain: 'movement_energy', value: 1 }),
    ]);
    const latest = assessment([
      answer({ questionKey: 'baseline_energy_level', domain: 'movement_energy', value: 2 }),
    ]);
    const metrics = buildComparison(baseline, latest);
    const energy = metrics.find((m) => m.key === 'energy')!;
    expect(energy.baseline?.status).toBe('poor');
    expect(energy.latest?.status).toBe('poor');
    expect(energy.direction).toBe('stable');
  });

  it('derives pain status from the count of selected discomfort areas, not a severity number', () => {
    const zeroAreas = assessment([
      answer({
        questionKey: 'baseline_pain_areas',
        domain: 'pain_structural',
        answerType: 'multi_select',
        value: ['none'],
      }),
    ]);
    const threeAreas = assessment([
      answer({
        questionKey: 'baseline_pain_areas',
        domain: 'pain_structural',
        answerType: 'multi_select',
        value: ['lower_back', 'knees', 'hips'],
      }),
    ]);
    const metrics = buildComparison(zeroAreas, threeAreas);
    const pain = metrics.find((m) => m.key === 'pain')!;
    expect(pain.baseline?.status).toBe('good');
    expect(pain.latest?.status).toBe('poor');
    expect(pain.direction).toBe('declined');
  });

  it('derives movement status from the weekly-frequency enum', () => {
    const low = assessment([
      answer({
        questionKey: 'baseline_movement_frequency',
        domain: 'movement_energy',
        answerType: 'enum',
        value: '0',
      }),
    ]);
    const high = assessment([
      answer({
        questionKey: 'baseline_movement_frequency',
        domain: 'movement_energy',
        answerType: 'enum',
        value: '5+',
      }),
    ]);
    const metrics = buildComparison(low, high);
    const movement = metrics.find((m) => m.key === 'movement')!;
    expect(movement.baseline?.status).toBe('poor');
    expect(movement.latest?.status).toBe('good');
    expect(movement.direction).toBe('improved');
  });
});

describe('buildProgressSummary', () => {
  it('is entirely empty when nothing is comparable yet', () => {
    const metrics = buildComparison(null, null);
    const summary = buildProgressSummary(metrics);
    expect(summary.biggestImprovement).toBeNull();
    expect(summary.needsAttention).toBeNull();
    expect(summary.stableAreas).toEqual([]);
    expect(summary.suggestedFocusAction).toBeNull();
  });

  it('picks the metric with the largest severity swing as the biggest improvement', () => {
    const baseline = assessment([
      answer({ questionKey: 'baseline_sleep_quality', domain: 'sleep', value: 1 }), // poor
      answer({ questionKey: 'baseline_digestion', domain: 'nutrition_digestion', value: 2 }), // poor
    ]);
    const latest = assessment([
      answer({ questionKey: 'baseline_sleep_quality', domain: 'sleep', value: 3 }), // attention (+1 severity)
      answer({ questionKey: 'baseline_digestion', domain: 'nutrition_digestion', value: 5 }), // good (+2 severity)
    ]);
    const metrics = buildComparison(baseline, latest);
    const summary = buildProgressSummary(metrics);
    expect(summary.biggestImprovement?.key).toBe('digestion');
  });

  it('flags the worst-status metric as needing attention and attaches a non-diagnostic coaching action', () => {
    const baseline = assessment([
      answer({ questionKey: 'baseline_stress_level', domain: 'mind_stress', value: 3 }),
    ]);
    const latest = assessment([
      answer({ questionKey: 'baseline_stress_level', domain: 'mind_stress', value: 5 }), // poor
    ]);
    const metrics = buildComparison(baseline, latest);
    const summary = buildProgressSummary(metrics);
    expect(summary.needsAttention?.key).toBe('stress');
    expect(summary.suggestedFocusAction).toBeTruthy();
    expect(summary.suggestedFocusAction?.toLowerCase()).not.toContain('diagnos');
  });

  it('lists same-status metrics as stable', () => {
    const baseline = assessment([
      answer({ questionKey: 'baseline_digestion', domain: 'nutrition_digestion', value: 4 }),
    ]);
    const latest = assessment([
      answer({ questionKey: 'baseline_digestion', domain: 'nutrition_digestion', value: 5 }),
    ]);
    const metrics = buildComparison(baseline, latest);
    const summary = buildProgressSummary(metrics);
    expect(summary.stableAreas.map((m) => m.key)).toContain('digestion');
  });
});
