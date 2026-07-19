/**
 * Nutrition Safety Overrides — types for migration 65's
 * member_nutrition_safety_flags. Deliberately independent of any
 * assessment result (Primal Pattern or otherwise) — see that migration's
 * header comment for why this lives in its own table.
 */

export type NutritionSafetyFlags = {
  hasDiabetes: boolean;
  hasPrediabetes: boolean;
  hasGestationalDiabetes: boolean;
  hasReactiveHypoglycemia: boolean;
  usesInsulin: boolean;
  hasClinicianNutritionPlan: boolean;
  isPregnant: boolean;
  /** Open-ended extension slot for future flags that don't yet warrant their own column, e.g. { celiac: true }. */
  otherFlags: Record<string, boolean>;
};

export type NutritionSafetyOverrideSource = 'member' | 'coach' | 'platform_administrator';

export type NutritionSafetyProfile = {
  memberId: string;
  flags: NutritionSafetyFlags;
  /** true if any known flag (built-in or otherFlags) is set — the single boolean a consumer should check before generating unsupervised nutrition guidance. */
  hasActiveOverride: boolean;
  lastUpdatedBy: string | null;
  lastUpdatedByRole: NutritionSafetyOverrideSource | null;
  updatedAt: string | null;
};

/** No row yet recorded for this member — distinct from "recorded, all false" so a consumer can tell "never asked" from "asked, none apply." */
export const EMPTY_NUTRITION_SAFETY_PROFILE_FLAGS: NutritionSafetyFlags = {
  hasDiabetes: false,
  hasPrediabetes: false,
  hasGestationalDiabetes: false,
  hasReactiveHypoglycemia: false,
  usesInsulin: false,
  hasClinicianNutritionPlan: false,
  isPregnant: false,
  otherFlags: {},
};
