import type { GuestPreviewAnswers } from './types';

export type GuestPreviewTier = 'steady' | 'mixed' | 'stretched';

export interface GuestPreviewInsight {
  tier: GuestPreviewTier;
  answeredCount: number;
  headline: string;
  observation: string;
  disclaimer: string;
}

/**
 * Positive fields: a higher number reads as "better". Negative fields
 * (stress, pain/discomfort) are inverted before averaging so every field
 * contributes on the same "higher = better" direction.
 */
const POSITIVE_FIELDS: (keyof GuestPreviewAnswers)[] = [
  'energy_level',
  'sleep_quality',
  'digestion_rating',
  'mood_level',
];
const NEGATIVE_FIELDS: (keyof GuestPreviewAnswers)[] = ['stress_level', 'pain_discomfort_level'];

// pain_discomfort_level is 0-5 at the database layer; every other scored
// field here is 1-5. A single shared ceiling of 5 keeps the inversion
// (max - value) correct for both without needing a per-field range table.
const SCALE_MAX = 5;

/**
 * A deliberately soft, observational, non-diagnostic snapshot computed
 * entirely client-side from the guest's own answers — no scoring engine,
 * no Root Score, no real assessment logic. This is a preview, not a
 * measurement.
 */
export function buildGuestPreviewInsight(answers: GuestPreviewAnswers): GuestPreviewInsight {
  const goodnessScores: number[] = [];

  for (const field of POSITIVE_FIELDS) {
    const value = answers[field];
    if (typeof value === 'number') goodnessScores.push(value / SCALE_MAX);
  }
  for (const field of NEGATIVE_FIELDS) {
    const value = answers[field];
    if (typeof value === 'number') goodnessScores.push((SCALE_MAX - value) / SCALE_MAX);
  }

  const answeredCount = countAnsweredQuestions(answers);
  const average =
    goodnessScores.length > 0
      ? goodnessScores.reduce((sum, score) => sum + score, 0) / goodnessScores.length
      : 0.5;

  const tier: GuestPreviewTier =
    average >= 0.65 ? 'steady' : average >= 0.4 ? 'mixed' : 'stretched';

  const headline =
    answeredCount < 4
      ? "Here's an early look based on what you shared"
      : "We're beginning to notice a few patterns";

  const observationByTier: Record<GuestPreviewTier, string> = {
    steady:
      'Several areas you shared look fairly steady right now. You may still benefit from exploring these areas in more detail.',
    mixed:
      'A few areas you shared look like they could use some attention, alongside some that seem steady.',
    stretched:
      'A few areas you shared seem notably stretched right now. You may benefit from exploring these areas in more detail.',
  };

  const movementNote =
    answers.movement_today !== null ? " We also noted how much you've been moving lately." : '';

  return {
    tier,
    answeredCount,
    headline,
    observation: `${observationByTier[tier]}${movementNote}`,
    disclaimer:
      'This quick wellness check is only a starting point, not a diagnosis or medical advice.',
  };
}

export function countAnsweredQuestions(answers: GuestPreviewAnswers): number {
  return Object.values(answers).filter((value) => value !== null).length;
}
