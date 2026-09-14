/**
 * Rooted Reset Fuel Pattern Assessment — the fixed identifiers.
 *
 * ITS OWN CLEAN INTERNAL ID. Nothing here reuses or renames Primal
 * Pattern's internals. Primal Pattern keeps its own key, its own tables
 * and its own rows exactly as they are (see
 * lib/assessment-registry/registry.ts, where it is now `retired: true`);
 * this instrument is a new registry entry on the Unified Adaptive
 * Assessment Runtime, and the only thing it inherits from Primal Pattern
 * is the slot in the plan map: monthly tier and up.
 */

/** Registry key, unified_assessment_definitions.key, and the route slug, all one word. */
export const FPA_KEY = 'fuel-pattern';

/** assessment_definitions.id, fixed across every environment (migration 236). */
export const FPA_DEFINITION_ID = '30acea0e-123e-4094-80b3-8b4d8dc7b187';

/** The one name a member reads, everywhere. */
export const FPA_LABEL = 'Rooted Reset Fuel Pattern Assessment';

export const FPA_ROUTE = '/assessments/fuel-pattern';
export const FPA_TAKE_ROUTE = '/assessments/fuel-pattern/take';

export const FPA_ESTIMATED_MINUTES = 7;

/** Every question key, in the order she answers them. One question per screen. */
export const FPA_QUESTION_KEYS = [
  'fpa_q1', 'fpa_q2', 'fpa_q3', 'fpa_q4', 'fpa_q5', 'fpa_q6',
  'fpa_q7', 'fpa_q8', 'fpa_q9', 'fpa_q10', 'fpa_q11', 'fpa_q12',
  'fpa_q13', 'fpa_q14', 'fpa_q15', 'fpa_q16', 'fpa_q17', 'fpa_q18',
  'fpa_q19', 'fpa_q20', 'fpa_q21', 'fpa_q22', 'fpa_q23', 'fpa_q24',
] as const;

export type FpaQuestionKey = (typeof FPA_QUESTION_KEYS)[number];

export const FPA_QUESTION_COUNT = FPA_QUESTION_KEYS.length;

/** The plate question. Rendered as three illustrated plates plus a text option, never as four text rows. */
export const FPA_PLATE_QUESTION_KEY = 'fpa_q24';

/** The digestion question. Its fourth option is a coaching signal and is never scored. */
export const FPA_DIGESTION_QUESTION_KEY = 'fpa_q21';
export const FPA_DIGESTIVE_DISCOMFORT_VALUE = 'discomfort_regardless';

/** The vitality question. Nothing on it is ever scored. */
export const FPA_VITALITY_QUESTION_KEY = 'fpa_q23';
