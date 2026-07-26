/**
 * Fixed option list for the welcome flow's "What brought you here today?"
 * screen. Structurally separate from the onboarding_questions
 * "primary_concern" question (still its own single-select question,
 * answered later as part of the onboarding assessment, since it needs its
 * own onboarding_answers row keyed to a real onboarding_submissions
 * question/answer pair that doesn't exist yet at this point in the flow)
 * — but no longer asked cold. lib/member-goals/data.ts persists this
 * screen's answer (plus the "which one matters most" follow-up) as a
 * proper history record, and the onboarding questionnaire confirms it
 * instead of re-asking, translating the confirmed goal into a
 * `primary_concern` value via WELCOME_GOAL_TO_PRIMARY_CONCERN below. See
 * profiles.welcome_flow_goals (migration 86, still written for backward
 * compatibility) and member_goal_selections (migration 104, the real
 * consumer-facing record).
 */
export const WELCOME_GOALS = [
  { key: 'reduce_pain', label: 'Reduce pain or discomfort' },
  { key: 'improve_posture_movement', label: 'Improve posture and movement' },
  { key: 'increase_energy', label: 'Increase energy' },
  { key: 'sleep_better', label: 'Sleep better' },
  { key: 'reduce_stress', label: 'Reduce stress' },
  { key: 'improve_digestion', label: 'Improve digestion' },
  { key: 'body_composition', label: 'Lose weight or improve body composition' },
  { key: 'strength_fitness', label: 'Build strength and fitness' },
  { key: 'sports_golf_performance', label: 'Improve sports or golf performance' },
  { key: 'healthier_habits', label: 'Create healthier daily habits' },
  { key: 'understand_my_body', label: 'Better understand my body' },
  { key: 'work_with_coach', label: 'Work directly with a coach' },
  { key: 'something_else', label: 'Something else' },
] as const;

export type WelcomeGoalKey = (typeof WELCOME_GOALS)[number]['key'];

const WELCOME_GOAL_KEYS: readonly string[] = WELCOME_GOALS.map((goal) => goal.key);

export const SOMETHING_ELSE_KEY: WelcomeGoalKey = 'something_else';

/** At least one selection, every value a recognized key, nothing forged. */
export function isValidGoalSelection(goals: unknown): goals is string[] {
  return (
    Array.isArray(goals) &&
    goals.length > 0 &&
    goals.every((goal) => typeof goal === 'string' && WELCOME_GOAL_KEYS.includes(goal))
  );
}

/**
 * Translates a welcome-goal key into the value the onboarding
 * questionnaire's `primary_concern` question actually stores (see
 * supabase/migrations/00000000000068_onboarding_goals_expansion.sql for
 * its 12-value allowed_values list). The two vocabularies aren't 1:1 —
 * WELCOME_GOALS has 13 keys, primary_concern has 12 — so a couple of
 * goals intentionally collapse onto the same concern (e.g. both
 * `strength_fitness` and `sports_golf_performance` -> 'performance').
 * This is the one place that mapping lives; the onboarding adaptive
 * engine (lib/onboarding/adaptivePlan.ts) never sees a welcome-goal key,
 * only the mapped concern value, so its own selection logic is untouched.
 */
export const WELCOME_GOAL_TO_PRIMARY_CONCERN: Record<WelcomeGoalKey, string> = {
  reduce_pain: 'pain',
  improve_posture_movement: 'movement',
  increase_energy: 'energy',
  sleep_better: 'sleep',
  reduce_stress: 'stress',
  improve_digestion: 'digestion',
  body_composition: 'weight',
  strength_fitness: 'performance',
  sports_golf_performance: 'performance',
  healthier_habits: 'habits',
  understand_my_body: 'general_optimization',
  work_with_coach: 'general_optimization',
  something_else: 'other',
};
