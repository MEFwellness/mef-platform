/**
 * The pre-signup Quick Wellness Check answers a guest gives on
 * /wellness-check, before any account exists.
 *
 * THESE FIELD NAMES ARE NOT A PROMISE THAT THEY BECOME A CHECK-IN. They
 * were originally chosen as a 1:1 subset of DailyCheckinInput precisely so
 * a finished preview could be written into the member's first real daily
 * check-in on signup, and that is exactly what was wrong with it: a
 * stranger's pre-account guesses became indistinguishable from a Daily
 * Reset she had sat down and completed, and every honesty threshold that
 * counts check-ins counted a day she had never checked in. Since 2026-09-04
 * these answers go to guest_wellness_check_answers and stop there
 * (migration 202), stored as slugs rather than as numbers so nothing can
 * average them by accident. The names are kept only because the screen and
 * the insight text already read them, and nothing may read that
 * resemblance as permission to copy one across.
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
