/**
 * Case View — human-readable labels for lib/correlation-engine/variables.ts's
 * variable-catalog keys, used only for chart legends and axis captions.
 * Purely cosmetic; never read by any scoring logic.
 */

const VARIABLE_LABELS: Record<string, string> = {
  'checkin.pain': 'Pain',
  'checkin.energy': 'Energy',
  'checkin.stress': 'Stress',
  'checkin.sleep_quality': 'Sleep quality',
  'checkin.digestion': 'Digestion',
  'checkin.mood': 'Mood',
  'checkin.hydration': 'Hydration',
  'checkin.night_wakings': 'Night wake-ups',
  'checkin.night_sweats': 'Night sweats',
  'checkin.bowel_irregularity': 'Bowel irregularity',
  'checkin.sleep_duration_score': 'Sleep duration',
  'checkin.movement_today_score': 'Movement',
  'checkin.bedtime_lateness': 'Bedtime lateness',
  'wearable.steps': 'Steps',
  'wearable.hrv': 'Heart rate variability',
  'wearable.sleep_duration_minutes': 'Sleep duration (device)',
  'wearable.readiness_score': 'Readiness score',
};

export function labelForVariable(variableKey: string): string {
  return VARIABLE_LABELS[variableKey] ?? variableKey;
}
