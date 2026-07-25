/**
 * WBSA (Whole-Body Systems Assessment) — shared constants for the
 * unified-runtime content authored in supabase/migrations/
 * 00000000000101_wbsa_content.sql. Kept in one place so the take flow,
 * results screen, coach detail view, and safety wiring never hand-type
 * the same section titles/body-system slugs independently.
 */

export const WBSA_KEY = 'wbsa' as const;

/** Matches unified_assessment_sections.title exactly, in display order — the 16 body systems from the WBSA content brief. */
export const WBSA_SECTION_TITLES = [
  'Upper Digestive Function',
  'Lower Digestive & Elimination Function',
  'Blood Sugar & Energy Regulation',
  'Liver & Detoxification Support',
  'Immune & Inflammatory Patterns',
  'Respiratory & Oxygenation Patterns',
  'Circulation & Cardiovascular-Related Observations',
  'Kidney, Bladder & Fluid-Balance Patterns',
  'Thyroid & Metabolic-Related Observations',
  'Adrenal & Stress-Response Patterns',
  'Reproductive & Hormonal Patterns',
  'Neurological & Cognitive Patterns',
  'Musculoskeletal & Connective-Tissue Patterns',
  'Skin, Hair & Nail Observations',
  'Nutrient Insufficiency Patterns',
  'Recovery & Resilience Patterns',
] as const;

/**
 * The short list of explicit red-flag question_keys authored in the WBSA
 * content migration — each one an original, boolean/severity question
 * whose concerning answer triggers both a 'significant' registry finding
 * (via the existing lib/assessment-runtime/findings.ts mechanism, no
 * changes needed there) and an explicit lib/safety/service.ts::
 * evaluateConcern() call (see safety.ts in this directory). This list is
 * the single source of truth both the completion action and the schema
 * test check against.
 */
export const WBSA_RED_FLAG_QUESTION_KEYS = [
  'wbsa_lowdig_redflag_bleeding',
  'wbsa_liver_skin_tone',
  'wbsa_resp_redflag_chest',
  'wbsa_circ_redflag_palpitations',
  'wbsa_repro_redflag_pain',
  'wbsa_neuro_redflag_severity',
  'wbsa_neuro_balance',
] as const;

export type WbsaRedFlagQuestionKey = (typeof WBSA_RED_FLAG_QUESTION_KEYS)[number];
