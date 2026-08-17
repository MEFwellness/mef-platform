/**
 * WBSA (Whole-Body Systems Assessment) — shared constants for the
 * unified-runtime content authored in supabase/migrations/
 * 00000000000101_wbsa_content.sql. Kept in one place so the take flow,
 * results screen, coach detail view, and safety wiring never hand-type
 * the same section titles/body-system slugs independently.
 */

export const WBSA_KEY = 'wbsa' as const;

/**
 * Matches unified_assessment_sections.title exactly, in display order.
 *
 * Renamed 2026-08-17 under docs/NAMING-STANDARD.md. Every one of these
 * sixteen used to name an organ or a clinical process ("Adrenal &
 * Stress-Response Patterns", "Liver & Detoxification Support", "Nutrient
 * Insufficiency Patterns"), which told a member reading a section heading
 * that the app was looking for something wrong with a specific organ. The
 * questions underneath never changed and are unchanged now: each new title
 * says what its own questions actually ask about.
 *
 * The stored titles are updated by
 * supabase/migrations/00000000000169_naming_standard_renames.sql. This
 * array is what the take flow, the results screen, the coach detail view
 * and the schema test check against, so the two must not drift; a test
 * asserts every entry here meets the naming standard.
 */
export const WBSA_SECTION_TITLES = [
  'How meals sit with you', // was "Upper Digestive Function"
  'How things move through', // was "Lower Digestive & Elimination Function"
  'Energy between meals', // was "Blood Sugar & Energy Regulation"
  'Skin, headaches and strong smells', // was "Liver & Detoxification Support"
  'Colds, and how quickly you bounce back', // was "Immune & Inflammatory Patterns"
  'Breathing, and catching your breath', // was "Respiratory & Oxygenation Patterns"
  'Effort, cold hands and cold feet', // was "Circulation & Cardiovascular-Related Observations"
  'Water, swelling and bathroom trips', // was "Kidney, Bladder & Fluid-Balance Patterns"
  'Temperature, weight and everyday pace', // was "Thyroid & Metabolic-Related Observations"
  'How you handle stress and demand', // was "Adrenal & Stress-Response Patterns"
  'Cycle, mood and monthly changes', // was "Reproductive & Hormonal Patterns"
  'Focus, memory and steadiness', // was "Neurological & Cognitive Patterns"
  'Aches, stiffness and joints', // was "Musculoskeletal & Connective-Tissue Patterns"
  'Skin, hair and nails', // was "Skin, Hair & Nail Observations"
  'Cravings, and what your body seems short of', // was "Nutrient Insufficiency Patterns"
  'How well you recover', // was "Recovery & Resilience Patterns"
] as const;

/**
 * The old titles, in the same order, so the migration can rename by exact
 * match rather than by position and so a test can prove none of them
 * survives anywhere in the app.
 */
export const WBSA_RETIRED_SECTION_TITLES = [
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
