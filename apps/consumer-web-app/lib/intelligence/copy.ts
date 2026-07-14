/**
 * Shared wellness-area labels + correlation-safe phrasing helpers for the
 * Personal Wellness Intelligence Engine. The 8 Daily Wellness Index
 * metrics reuse lib/wellness/wellness-index.ts's own WELLNESS_METRIC_LABEL
 * directly rather than a second label map — "sleep" means the same thing
 * here as everywhere else in the app.
 *
 * Wording discipline (section 10's "must not... convert correlations into
 * medical claims"): every builder below states an association ("tends to
 * appear alongside," "has often been followed by"), never a cause. This
 * mirrors lib/narrative/generator.ts's own explicit discipline exactly —
 * reused, not reinvented.
 */

import type { WellnessArea } from '@mef/shared-types-contracts';
import { WELLNESS_METRIC_LABEL, type WellnessMetricKey } from '../wellness/wellness-index';
import type { FourDoctorsCategory } from '@mef/shared-types-contracts';

const EXTRA_AREA_LABEL: Record<Exclude<WellnessArea, WellnessMetricKey>, string> = {
  recovery: 'Recovery',
  breathing: 'Breathing practice',
  consistency: 'Consistency',
  completed_actions: 'Completed actions',
  lesson_engagement: 'Lesson engagement',
  reflections: 'Reflections',
  doctor_movement: 'Movement',
  doctor_diet: 'Nutrition',
  doctor_quiet: 'Rest & recovery',
  doctor_happiness: 'Mood & connection',
};

const METRIC_KEYS = new Set<string>(Object.keys(WELLNESS_METRIC_LABEL));

export function areaLabel(area: WellnessArea): string {
  if (METRIC_KEYS.has(area)) return WELLNESS_METRIC_LABEL[area as WellnessMetricKey];
  return EXTRA_AREA_LABEL[area as Exclude<WellnessArea, WellnessMetricKey>];
}

export function areaLabelLower(area: WellnessArea): string {
  const label = areaLabel(area);
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/** 'recovery' isn't a raw check-in field — energy and pain are its two closest real proxies, same convention lib/brain/copy.ts already uses for the Coaching Brain's own "Recovery" focus label. */
export const RECOVERY_PROXY_METRICS: WellnessMetricKey[] = ['energy', 'pain'];

export const FOUR_DOCTORS_TO_AREA: Record<FourDoctorsCategory, WellnessArea> = {
  doctor_movement: 'doctor_movement',
  doctor_diet: 'doctor_diet',
  doctor_quiet: 'doctor_quiet',
  doctor_happiness: 'doctor_happiness',
};
