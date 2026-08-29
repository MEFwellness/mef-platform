/**
 * The Stress & Load Deep-Dive, in one place: what it is called, what it is
 * addressed by, and how long its experiment runs.
 *
 * The database id is FIXED and must match
 * supabase/migrations/00000000000190_stress_load_deep_dive.sql exactly. It
 * is what the existing assignment machinery addresses this experience by,
 * the same way every other assessment in the catalog is addressed
 * (migration 70). It is never generated at runtime, so local, staging and
 * production all resolve this experience to the same definition.
 */

/** The catalog key. Matches assessment_definitions.key. */
export const STRESS_LOAD_KEY = 'stress-load-deep-dive' as const;

/** assessment_definitions.id. Fixed, and shared with migration 190. */
export const STRESS_LOAD_DEFINITION_ID = '9f2c4d7e-3a51-4b86-9c0d-6e5f1a72b834';

/** The route the pop-up, the Home card and the coach's own link all point at. */
export const STRESS_LOAD_ROUTE = '/stress-load';

/** lifestyle_experiments.source_experience_key for an experiment this deep-dive started. */
export const STRESS_LOAD_EXPERIENCE_KEY = 'stress-load-deep-dive' as const;

/** Seven days, matching every other five minute daily experiment this app offers. */
export const STRESS_LOAD_EXPERIMENT_DURATION_DAYS = 7;

/** registry_entries.source_feature for the two rows a completion publishes. */
export const STRESS_LOAD_SOURCE_FEATURE = 'stress_load_deep_dive_finding' as const;
