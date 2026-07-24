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

  it('folds primary_concern into the reflection when answered', () => {
    const observation = buildGuestOnboardingObservation([answer('primary_concern', 'digestion')]);
    expect(observation.reflection.some((line) => line.toLowerCase().includes('digestion'))).toBe(
      true
    );
  });

  it('omits the concern sentence when primary_concern is unanswered', () => {
    const observation = buildGuestOnboardingObservation([
      answer('primary_concern', '', 'not_sure'),
      answer('baseline_stress_level', 2),
    ]);
    expect(observation.reflection.length).toBeGreaterThan(0);
    expect(observation.reflection.some((line) => line.includes('brought you here'))).toBe(false);
  });

  it('disclaims diagnosis rather than asserting one, and never mentions treatment or scoring', () => {
    const observation = buildGuestOnboardingObservation([
      answer('baseline_energy_level', 2),
      answer('baseline_stress_level', 4),
    ]);
    const text =
      `${observation.headline} ${observation.reflection.join(' ')} ${observation.disclaimer}`.toLowerCase();
    // The only permitted "diagnos*" mention is the explicit disclaimer that
    // this is NOT one — never an affirmative diagnostic claim.
    expect(observation.disclaimer).toMatch(/not a diagnosis/i);
    expect(text).not.toMatch(/treat/);
    expect(text).not.toMatch(/\bscore\b/);
  });

  it('falls back to a neutral ("mixed") tier when nothing numeric was answered', () => {
    const observation = buildGuestOnboardingObservation([]);
    expect(observation.tier).toBe('mixed');
    expect(observation.reflection.length).toBeGreaterThan(0);
  });

  it('explains a stress + low-energy correlation instead of just restating the concern', () => {
    const observation = buildGuestOnboardingObservation([
      answer('primary_concern', 'stress'),
      answer('baseline_stress_level', 4),
      answer('baseline_energy_level', 2),
    ]);
    expect(observation.reflection[0]).toMatch(/stress/i);
    expect(observation.reflection[0]).toMatch(/energy/i);
  });

  it('explains a pain + low-movement correlation using the multi_select and enum fields', () => {
    const observation = buildGuestOnboardingObservation([
      answer('primary_concern', 'pain'),
      { question_key: 'baseline_pain_areas', question_version: 1, answer_status: 'answered', value: ['lower_back'] },
      answer('baseline_movement_frequency', '0'),
    ]);
    expect(observation.reflection[0]).toMatch(/discomfort/i);
    expect(observation.reflection[0]).toMatch(/movement/i);
  });

  it('treats a "none" pain answer as no pain, so it does not trigger the pain/movement correlation', () => {
    const observation = buildGuestOnboardingObservation([
      answer('primary_concern', 'pain'),
      { question_key: 'baseline_pain_areas', question_version: 1, answer_status: 'answered', value: ['none'] },
      answer('baseline_movement_frequency', '0'),
    ]);
    expect(observation.reflection.some((line) => line.toLowerCase().includes('discomfort'))).toBe(
      false
    );
  });

  it('never mentions treatment or scoring in a correlation-driven reflection', () => {
    const observation = buildGuestOnboardingObservation([
      answer('baseline_stress_level', 5),
      answer('baseline_digestion', 1),
    ]);
    const text = observation.reflection.join(' ').toLowerCase();
    expect(text).not.toMatch(/treat/);
    expect(text).not.toMatch(/\bscore\b/);
  });
});
