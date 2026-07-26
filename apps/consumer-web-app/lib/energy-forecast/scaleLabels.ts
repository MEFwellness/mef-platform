/**
 * The same "replace numbers with meaning" word set the morning check-in's
 * energy question already uses (app/checkin/CheckinForm.tsx's
 * ENERGY_MEANING) — duplicated here rather than imported so this module
 * has no dependency on that client component, but kept verbatim
 * identical so a predicted "Good" and a scored "Good" always read as the
 * same word.
 */
export const ENERGY_LEVEL_LABEL: Record<number, string> = {
  1: 'Exhausted',
  2: 'Low',
  3: 'Moderate',
  4: 'Good',
  5: 'High',
};

export function energyLevelLabel(level: number): string {
  return ENERGY_LEVEL_LABEL[level] ?? String(level);
}

/** Same verbatim word sets as CheckinForm.tsx's MOOD/STRESS/SLEEP_QUALITY/PAIN_MEANING — for the day-one/skipped-forecast readback (Part 4's "read her answers back to her as a record"). */
const MOOD_LABEL: Record<number, string> = { 1: 'Very Low', 2: 'Low', 3: 'Okay', 4: 'Good', 5: 'Excellent' };
const STRESS_LABEL: Record<number, string> = { 1: 'Very Calm', 2: 'Calm', 3: 'Moderate', 4: 'High', 5: 'Overwhelmed' };
const SLEEP_QUALITY_LABEL: Record<number, string> = { 1: 'Terrible', 2: 'Poor', 3: 'Fair', 4: 'Good', 5: 'Excellent' };
const PAIN_LABEL: Record<number, string> = {
  0: 'None',
  1: 'Mild',
  2: 'Mild-moderate',
  3: 'Moderate',
  4: 'Significant',
  5: 'Severe',
};

export function moodLabel(level: number): string {
  return MOOD_LABEL[level] ?? String(level);
}
export function stressLabel(level: number): string {
  return STRESS_LABEL[level] ?? String(level);
}
export function sleepQualityLabel(level: number): string {
  return SLEEP_QUALITY_LABEL[level] ?? String(level);
}
export function painLabel(level: number): string {
  return PAIN_LABEL[level] ?? String(level);
}
