import type { OnboardingAnswerInput } from '@mef/shared-types-contracts';

export type GuestObservationTier = 'steady' | 'mixed' | 'stretched';

export interface GuestObservation {
  tier: GuestObservationTier;
  headline: string;
  reflection: string[];
  disclaimer: string;
}

/**
 * Positive keys: a higher number reads as "better". baseline_stress_level
 * is inverted before averaging so it contributes on the same "higher =
 * better" direction — same convention as
 * lib/guest-preview/insights.ts's POSITIVE_FIELDS/NEGATIVE_FIELDS.
 */
const POSITIVE_KEYS = ['baseline_sleep_quality', 'baseline_energy_level', 'baseline_digestion'];
const NEGATIVE_KEYS = ['baseline_stress_level'];

// Matches lib/onboarding/scale.ts's numericRange() for these four keys.
const SCALE_MAX = 5;

const CONCERN_PHRASE: Record<string, string> = {
  pain: 'getting out of pain',
  energy: 'improving your energy',
  sleep: 'sleeping better',
  stress: 'reducing stress',
  weight: 'your weight goals',
  digestion: 'your digestion',
  movement: 'moving better',
  performance: 'your performance',
  healthy_aging: 'aging well',
  habits: 'building healthier habits',
  general_optimization: 'your overall wellness',
  other: "what's going on for you",
};

function findAnsweredNumericValue(
  answers: OnboardingAnswerInput[],
  questionKey: string
): number | null {
  const answer = answers.find((a) => a.question_key === questionKey);
  if (!answer || answer.answer_status !== 'answered') return null;
  return typeof answer.value === 'number' ? answer.value : null;
}

function findPrimaryConcernPhrase(answers: OnboardingAnswerInput[]): string | null {
  const answer = answers.find((a) => a.question_key === 'primary_concern');
  if (!answer || answer.answer_status !== 'answered' || typeof answer.value !== 'string') {
    return null;
  }
  return CONCERN_PHRASE[answer.value] ?? null;
}

const TIER_REFLECTION: Record<GuestObservationTier, string> = {
  steady:
    'From what you shared, a lot of this looks fairly steady right now — a good foundation to build on.',
  mixed:
    'From what you shared, a few areas look like they could use some attention, alongside some that seem steady.',
  stretched:
    'From what you shared, a few areas seem notably stretched right now — worth paying attention to.',
};

/**
 * A deliberately soft, observational, non-diagnostic snapshot computed
 * entirely client-side from the guest's own in-progress answers — no
 * scoring engine, no Root Score, no clinical framing. This is a
 * reflection, not a measurement, mirroring
 * lib/guest-preview/insights.ts's buildGuestPreviewInsight() in spirit.
 */
export function buildGuestOnboardingObservation(
  answers: OnboardingAnswerInput[]
): GuestObservation {
  const goodnessScores: number[] = [];

  for (const key of POSITIVE_KEYS) {
    const value = findAnsweredNumericValue(answers, key);
    if (value !== null) goodnessScores.push(value / SCALE_MAX);
  }
  for (const key of NEGATIVE_KEYS) {
    const value = findAnsweredNumericValue(answers, key);
    if (value !== null) goodnessScores.push((SCALE_MAX - value) / SCALE_MAX);
  }

  const average =
    goodnessScores.length > 0
      ? goodnessScores.reduce((sum, score) => sum + score, 0) / goodnessScores.length
      : 0.5;

  const tier: GuestObservationTier =
    average >= 0.65 ? 'steady' : average >= 0.4 ? 'mixed' : 'stretched';

  const concernPhrase = findPrimaryConcernPhrase(answers);
  const reflection = [
    concernPhrase ? `You told us ${concernPhrase} is what brought you here today.` : null,
    TIER_REFLECTION[tier],
  ].filter((line): line is string => line !== null);

  return {
    tier,
    headline: "Here's what we're noticing",
    reflection,
    disclaimer:
      'This is an early, non-diagnostic reflection based only on what you just shared — not a diagnosis or medical advice.',
  };
}
