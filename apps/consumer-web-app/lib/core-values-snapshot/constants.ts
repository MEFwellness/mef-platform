/**
 * Core Values Snapshot — shared constants for the unified-runtime content
 * authored in supabase/migrations/00000000000134_core_values_snapshot.sql.
 * Kept in one place so the take flow, scoring, results view, coach detail
 * view, and Root coaching integration never hand-type the same six value
 * areas or question keys independently. Mirrors lib/wbsa/constants.ts's
 * own role for WBSA.
 */

export const CVS_KEY = 'core-values-snapshot' as const;

export const VALUE_AREAS = ['health', 'relationships', 'growth', 'purpose', 'freedom', 'peace'] as const;

export type ValueArea = (typeof VALUE_AREAS)[number];

export const AREA_LABEL: Record<ValueArea, string> = {
  health: 'Health & Energy',
  relationships: 'Close Relationships',
  growth: 'Growth & Learning',
  purpose: 'Purpose & Meaningful Work',
  freedom: 'Freedom & Play',
  peace: 'Peace & Calm',
};

/** question_key -> the value area it scores into, for the six Screen 2 sliders (each slider is its own question, one area apiece). */
export const SLIDER_QUESTION_AREA: Record<string, ValueArea> = {
  cvs_q5: 'health',
  cvs_q6: 'relationships',
  cvs_q7: 'growth',
  cvs_q8: 'purpose',
  cvs_q9: 'freedom',
  cvs_q10: 'peace',
};

export const SCREEN1_QUESTION_KEYS = ['cvs_q1', 'cvs_q2', 'cvs_q3', 'cvs_q4'] as const;
export const SLIDER_QUESTION_KEYS = ['cvs_q5', 'cvs_q6', 'cvs_q7', 'cvs_q8', 'cvs_q9', 'cvs_q10'] as const;
export const Q11_KEY = 'cvs_q11';
export const Q12_KEY = 'cvs_q12';

export const CVS_EXPERIMENT_DURATION_DAYS = 7;

const AREA_BY_LABEL: Record<string, ValueArea> = Object.fromEntries(
  VALUE_AREAS.map((area) => [AREA_LABEL[area], area])
) as Record<string, ValueArea>;

/** Reverse lookup — an experiment's stored `title` is always one of AREA_LABEL's values (see startCvsExperimentAction), so this always resolves for a real Core Values Snapshot experiment. */
export function areaFromLabel(label: string): ValueArea | null {
  return AREA_BY_LABEL[label] ?? null;
}
