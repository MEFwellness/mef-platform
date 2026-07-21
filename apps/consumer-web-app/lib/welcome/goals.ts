/**
 * Fixed option list for the welcome flow's "What brought you here today?"
 * screen. Deliberately separate from the onboarding_questions
 * "primary_concern" question (single-select, answered later as part of the
 * onboarding assessment): this is a different, multi-select screen shown
 * once before onboarding even starts, so it needs its own storage
 * (profiles.welcome_flow_goals, migration 86) rather than reusing
 * onboarding_answers, which requires an onboarding_submissions row that
 * doesn't exist yet at this point in the flow.
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
