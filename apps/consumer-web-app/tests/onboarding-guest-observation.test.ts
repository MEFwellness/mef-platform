import { describe, it, expect } from 'vitest';
import { buildGuestOnboardingObservation } from '@/lib/onboarding/guestObservation';
import type { OnboardingAnswerInput } from '@mef/shared-types-contracts';

function answer(
  question_key: string,
  value: string | number,
  answer_status: OnboardingAnswerInput['answer_status'] = 'answered'
): OnboardingAnswerInput {
  return { question_key, question_version: 1, answer_status, value };
}

describe('guest onboarding observation (non-diagnostic, client-only)', () => {
  it('tiers "steady" when the answered fields skew positive', () => {
    const observation = buildGuestOnboardingObservation([
      answer('baseline_sleep_quality', 5),
      answer('baseline_energy_level', 5),
      answer('baseline_digestion', 4),
      answer('baseline_stress_level', 1),
    ]);
    expect(observation.tier).toBe('steady');
  });

  it('tiers "stretched" when the answered fields skew negative', () => {
    const observation = buildGuestOnboardingObservation([
      answer('baseline_sleep_quality', 1),
      answer('baseline_energy_level', 1),
      answer('baseline_digestion', 2),
      answer('baseline_stress_level', 5),
    ]);
    expect(observation.tier).toBe('stretched');
  });

  it('inverts stress so a high (worse) value lowers the tier rather than raising it', () => {
    const lowStress = buildGuestOnboardingObservation([answer('baseline_stress_level', 1)]);
    const highStress = buildGuestOnboardingObservation([answer('baseline_stress_level', 5)]);
    expect(lowStress.tier).toBe('steady');
    expect(highStress.tier).toBe('stretched');
  });

  it('folds primary_concern into the observation when answered', () => {
    const observation = buildGuestOnboardingObservation([answer('primary_concern', 'digestion')]);
    expect(observation.observation.toLowerCase()).toContain('digestion');
  });

  it('omits the concern sentence when primary_concern is unanswered', () => {
    const observation = buildGuestOnboardingObservation([
      answer('primary_concern', '', 'not_sure'),
      answer('baseline_stress_level', 2),
    ]);
    expect(observation.observation.length).toBeGreaterThan(0);
    expect(observation.observation).not.toMatch(/brought you here/);
  });

  it('is a single cohesive observation, not a list — always exactly one sentence-flow string', () => {
    const observation = buildGuestOnboardingObservation([
      answer('primary_concern', 'stress'),
      answer('baseline_stress_level', 4),
    ]);
    expect(typeof observation.observation).toBe('string');
    expect(observation.observation.length).toBeGreaterThan(0);
  });

  it('always includes a non-empty, distinct "why it matters" explanation', () => {
    const observation = buildGuestOnboardingObservation([answer('baseline_stress_level', 2)]);
    expect(observation.whyItMatters.length).toBeGreaterThan(0);
    expect(observation.whyItMatters).not.toBe(observation.observation);
  });

  it('disclaims diagnosis rather than asserting one, and never mentions treatment or scoring', () => {
    const observation = buildGuestOnboardingObservation([
      answer('baseline_energy_level', 2),
      answer('baseline_stress_level', 4),
    ]);
    const text =
      `${observation.headline} ${observation.observation} ${observation.whyItMatters} ${observation.disclaimer}`.toLowerCase();
    // The only permitted "diagnos*" mention is the explicit disclaimer that
    // this is NOT one — never an affirmative diagnostic claim.
    expect(observation.disclaimer).toMatch(/not a diagnosis/i);
    expect(text).not.toMatch(/treat/);
    expect(text).not.toMatch(/\bscore\b/);
  });

  it('falls back to a neutral ("mixed") tier when nothing numeric was answered', () => {
    const observation = buildGuestOnboardingObservation([]);
    expect(observation.tier).toBe('mixed');
    expect(observation.observation.length).toBeGreaterThan(0);
  });

  it('explains a stress + low-energy correlation instead of just restating the concern', () => {
    const observation = buildGuestOnboardingObservation([
      answer('primary_concern', 'stress'),
      answer('baseline_stress_level', 4),
      answer('baseline_energy_level', 2),
    ]);
    expect(observation.observation).toMatch(/stress/i);
    expect(observation.observation).toMatch(/energy/i);
  });

  it('explains a pain + low-movement correlation using the multi_select and enum fields', () => {
    const observation = buildGuestOnboardingObservation([
      answer('primary_concern', 'pain'),
      { question_key: 'baseline_pain_areas', question_version: 1, answer_status: 'answered', value: ['lower_back'] },
      answer('baseline_movement_frequency', '0'),
    ]);
    expect(observation.observation).toMatch(/discomfort/i);
    expect(observation.observation).toMatch(/movement/i);
  });

  it('treats a "none" pain answer as no pain, so it does not trigger the pain/movement correlation', () => {
    const observation = buildGuestOnboardingObservation([
      answer('primary_concern', 'pain'),
      { question_key: 'baseline_pain_areas', question_version: 1, answer_status: 'answered', value: ['none'] },
      answer('baseline_movement_frequency', '0'),
    ]);
    expect(observation.observation.toLowerCase()).not.toContain('discomfort');
  });

  it('never mentions treatment or scoring in a correlation-driven observation', () => {
    const observation = buildGuestOnboardingObservation([
      answer('baseline_stress_level', 5),
      answer('baseline_digestion', 1),
    ]);
    const text = observation.observation.toLowerCase();
    expect(text).not.toMatch(/treat/);
    expect(text).not.toMatch(/\bscore\b/);
  });
});
