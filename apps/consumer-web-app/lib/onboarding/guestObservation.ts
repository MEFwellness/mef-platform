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

export const CONCERN_PHRASE: Record<string, string> = {
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

function findAnsweredValue(
  answers: OnboardingAnswerInput[],
  questionKey: string
): OnboardingAnswerInput['value'] | null {
  const answer = answers.find((a) => a.question_key === questionKey);
  if (!answer || answer.answer_status !== 'answered') return null;
  return answer.value ?? null;
}

export function findPrimaryConcern(answers: OnboardingAnswerInput[]): string | null {
  const answer = answers.find((a) => a.question_key === 'primary_concern');
  if (!answer || answer.answer_status !== 'answered' || typeof answer.value !== 'string') {
    return null;
  }
  return answer.value;
}

function findPrimaryConcernPhrase(answers: OnboardingAnswerInput[]): string | null {
  const concern = findPrimaryConcern(answers);
  return concern ? (CONCERN_PHRASE[concern] ?? null) : null;
}

interface CorrelationPattern {
  /** primary_concern values this reads as most relevant for — checked first. */
  concerns: string[];
  matches: (values: {
    stress: number | null;
    energy: number | null;
    sleepQuality: number | null;
    digestion: number | null;
    hasPain: boolean;
    lowMovement: boolean;
  }) => boolean;
  text: string;
}

/**
 * Two-signal combinations worth naming out loud — each pairs something the
 * member reported with something else that commonly relates to it, and
 * explains the connection rather than just restating both numbers. Deliberately
 * small and hand-picked (not a scoring matrix) per the coaching-conversation
 * brief: a soft, explanatory reflection, never a diagnosis.
 */
const CORRELATION_PATTERNS: CorrelationPattern[] = [
  {
    concerns: ['stress', 'digestion', 'weight'],
    matches: (v) => v.stress !== null && v.stress >= 4 && v.digestion !== null && v.digestion <= 2,
    text: 'You shared that stress tends to run high for you, while also describing your digestion as a struggle lately. Those two often move together — worth exploring further.',
  },
  {
    concerns: ['stress', 'energy', 'performance'],
    matches: (v) => v.stress !== null && v.stress >= 4 && v.energy !== null && v.energy <= 2,
    text: 'You shared that stress tends to run high, alongside lower energy day to day. That combination shows up often, and it seems worth exploring further together.',
  },
  {
    concerns: ['sleep', 'energy', 'performance'],
    matches: (v) =>
      v.energy !== null && v.energy <= 2 && v.sleepQuality !== null && v.sleepQuality <= 2,
    text: 'You shared that both your sleep quality and your energy have been on the lower side. Those two are closely connected — improving one often lifts the other.',
  },
  {
    concerns: ['pain', 'movement', 'healthy_aging'],
    matches: (v) => v.hasPain && v.lowMovement,
    text: 'You mentioned some ongoing discomfort, alongside lower movement most weeks. That pattern is common, and it seems worth exploring together.',
  },
  {
    concerns: ['digestion', 'weight', 'habits'],
    matches: (v) => v.digestion !== null && v.digestion <= 2 && v.lowMovement,
    text: 'You shared that digestion has been a challenge, alongside lower movement day to day. Movement can play a bigger role there than people expect.',
  },
];

/**
 * Picks the single best-matching correlation, if any: first preferring a
 * pattern tagged relevant to the member's own stated primary_concern, then
 * falling back to any other matching pattern. Returns null when nothing
 * matches, so the caller can fall back to the plain concern + tier
 * reflection exactly as before.
 */
function findCorrelationText(answers: OnboardingAnswerInput[]): string | null {
  const values = {
    stress: findAnsweredNumericValue(answers, 'baseline_stress_level'),
    energy: findAnsweredNumericValue(answers, 'baseline_energy_level'),
    sleepQuality: findAnsweredNumericValue(answers, 'baseline_sleep_quality'),
    digestion: findAnsweredNumericValue(answers, 'baseline_digestion'),
    hasPain: (() => {
      const pain = findAnsweredValue(answers, 'baseline_pain_areas');
      return Array.isArray(pain) && pain.length > 0 && !(pain.length === 1 && pain[0] === 'none');
    })(),
    lowMovement: (() => {
      const movement = findAnsweredValue(answers, 'baseline_movement_frequency');
      return movement === '0' || movement === '1-2';
    })(),
  };

  const concern = findPrimaryConcern(answers);
  const matching = CORRELATION_PATTERNS.filter((pattern) => pattern.matches(values));

  const concernMatch = concern ? matching.find((p) => p.concerns.includes(concern)) : undefined;
  return (concernMatch ?? matching[0])?.text ?? null;
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

  const correlationText = findCorrelationText(answers);
  const concernPhrase = findPrimaryConcernPhrase(answers);
  const reflection = [
    correlationText ??
      (concernPhrase ? `You told us ${concernPhrase} is what brought you here today.` : null),
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
