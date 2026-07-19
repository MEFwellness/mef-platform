/**
 * Four Doctors premium results — zone identity. Maps the engine's generic
 * `PriorityLevel` ('low' | 'moderate' | 'high') onto this questionnaire's
 * own printed zone names ("Work-In," "Caution," "Workout To Ability," see
 * docs/assessments/four-doctors/SPEC.md section 7) and a set of refined,
 * MEF-palette-harmonized colors, deliberately muted rather than the raw
 * red/amber/green used elsewhere in the app (components/assessments/
 * ScoreRing.tsx, CategoryRadarChart.tsx use #EF4444/#F59E0B/#16A34A) so the
 * wheel and cards read as considered and calm, not a stoplight. Scoped
 * entirely to this module: the shared engine's PriorityLevel and
 * PRIORITY_LABEL (lib/assessments/presentation.ts) are untouched, and
 * nothing outside lib/assessments/four-doctors/ imports this file.
 */

import type { PriorityLevel } from '../../engine/types';

export type ZoneId = 'work_in' | 'caution' | 'workout_to_ability';

export type ZoneInfo = {
  id: ZoneId;
  label: string;
  /** One short phrase describing what this zone means for exercise/lifestyle intensity, per the source instrument's own framing. */
  meaning: string;
  color: string;
  /** A soft tint of `color`, for badge/card backgrounds. */
  tint: string;
};

export const ZONES: Record<ZoneId, ZoneInfo> = {
  work_in: {
    id: 'work_in',
    label: 'Work-In',
    meaning: 'Favor gentle, restorative movement over hard training right now.',
    color: '#B0522D',
    tint: '#F5E9E3',
  },
  caution: {
    id: 'caution',
    label: 'Caution',
    meaning: 'A mix of building up and easing off, balance is the focus.',
    color: '#C98A1F',
    tint: '#F8EEDC',
  },
  workout_to_ability: {
    id: 'workout_to_ability',
    label: 'Workout To Ability',
    meaning: 'Your foundation supports training at your full capacity.',
    color: '#4F7A63',
    tint: '#E8F0EA',
  },
};

/** `high` priority means the most lifestyle-gap risk (see questionnaire.json's `direction: "higher_is_worse"`), which is exactly what the source instrument's "Work-In" (most caution, least intensity) row represents. */
const PRIORITY_TO_ZONE: Record<PriorityLevel, ZoneId> = {
  high: 'work_in',
  moderate: 'caution',
  low: 'workout_to_ability',
};

export function zoneForPriority(priority: PriorityLevel): ZoneInfo {
  return ZONES[PRIORITY_TO_ZONE[priority]];
}

/** Ordered for the legend and any "which is best/worst" comparisons: best standing first. */
export const ZONE_ORDER: ZoneId[] = ['workout_to_ability', 'caution', 'work_in'];
