/**
 * The pre-signup Quick Wellness Check answers a guest gives on
 * /wellness-check, before any account exists. Each field is deliberately
 * a 1:1 subset of DailyCheckinInput (@mef/shared-types-contracts) so that
 * a completed preview can migrate straight into the member's real first
 * daily check-in on signup/login — see app/actions/guest-preview.ts.
 */
export interface GuestPreviewAnswers {
  energy_level: number | null;
  stress_level: number | null;
  sleep_quality: number | null;
  digestion_rating: number | null;
  movement_today: 'none' | 'light' | 'moderate' | 'full_session' | null;
  pain_discomfort_level: number | null;
  mood_level: number | null;
}

export const GUEST_PREVIEW_QUESTION_ORDER: readonly (keyof GuestPreviewAnswers)[] = [
  'energy_level',
  'stress_level',
  'sleep_quality',
  'digestion_rating',
  'movement_today',
  'pain_discomfort_level',
  'mood_level',
];

export const EMPTY_GUEST_PREVIEW_ANSWERS: GuestPreviewAnswers = {
  energy_level: null,
  stress_level: null,
  sleep_quality: null,
  digestion_rating: null,
  movement_today: null,
  pain_discomfort_level: null,
  mood_level: null,
};

export interface GuestPreviewState {
  answers: GuestPreviewAnswers;
  step: number;
  quizComplete: boolean;
}
