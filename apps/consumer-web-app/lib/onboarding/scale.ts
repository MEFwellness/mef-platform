/**
 * Shared with both the onboarding assessment form (the slider) and the
 * Baseline Assessment read view (formatting "4" as "4 / 5") — one place
 * that knows a given numeric question's scale and what its endpoints mean,
 * so the slider and the permanent record of what was answered never
 * disagree about what a raw number represents.
 */

// Natural-language endpoints for known 1-10-style rating questions — a bare
// "1" and "10" doesn't tell anyone what direction is good. Falls back to a
// generic Low/High pairing (using the question's own min/max) for any
// numeric question not listed here.
export const SLIDER_ENDPOINT_LABELS: Record<string, { min: string; max: string }> = {
  baseline_sleep_quality: { min: 'Very poor', max: 'Excellent' },
  baseline_stress_level: { min: 'Very low', max: 'Very high' },
  baseline_energy_level: { min: 'Very low', max: 'Very high' },
  baseline_digestion: { min: 'Very poor', max: 'Excellent' },
  readiness_importance: { min: 'Not important', max: 'Extremely important' },
  readiness_confidence: { min: 'Not confident', max: 'Extremely confident' },
};

export function numericRange(questionKey: string): { min: number; max: number } {
  return questionKey.startsWith('readiness_') ? { min: 0, max: 10 } : { min: 1, max: 5 };
}
