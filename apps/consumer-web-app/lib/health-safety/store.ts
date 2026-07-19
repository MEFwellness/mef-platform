/**
 * Nutrition Safety Overrides — persistence. Same trust boundary as every
 * other store module in this codebase: takes an already-authenticated
 * client and explicit memberId, RLS (migration 65) is the real
 * authorization boundary.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  NutritionSafetyFlags,
  NutritionSafetyOverrideSource,
  NutritionSafetyProfile,
} from './types';

const TABLE = 'member_nutrition_safety_flags';

type SafetyFlagsRow = {
  member_id: string;
  has_diabetes: boolean;
  has_prediabetes: boolean;
  has_gestational_diabetes: boolean;
  has_reactive_hypoglycemia: boolean;
  uses_insulin: boolean;
  has_clinician_nutrition_plan: boolean;
  is_pregnant: boolean;
  other_flags: Record<string, boolean> | null;
  last_updated_by: string | null;
  last_updated_by_role: NutritionSafetyOverrideSource | null;
  updated_at: string;
};

function hasActiveOverride(flags: NutritionSafetyFlags): boolean {
  return (
    flags.hasDiabetes ||
    flags.hasPrediabetes ||
    flags.hasGestationalDiabetes ||
    flags.hasReactiveHypoglycemia ||
    flags.usesInsulin ||
    flags.hasClinicianNutritionPlan ||
    flags.isPregnant ||
    Object.values(flags.otherFlags).some(Boolean)
  );
}

function mapRow(row: SafetyFlagsRow): NutritionSafetyProfile {
  const flags: NutritionSafetyFlags = {
    hasDiabetes: row.has_diabetes,
    hasPrediabetes: row.has_prediabetes,
    hasGestationalDiabetes: row.has_gestational_diabetes,
    hasReactiveHypoglycemia: row.has_reactive_hypoglycemia,
    usesInsulin: row.uses_insulin,
    hasClinicianNutritionPlan: row.has_clinician_nutrition_plan,
    isPregnant: row.is_pregnant,
    otherFlags: row.other_flags ?? {},
  };

  return {
    memberId: row.member_id,
    flags,
    hasActiveOverride: hasActiveOverride(flags),
    lastUpdatedBy: row.last_updated_by,
    lastUpdatedByRole: row.last_updated_by_role,
    updatedAt: row.updated_at,
  };
}

/** Null means no row has ever been recorded for this member — distinct from "recorded, nothing applies." */
export async function getNutritionSafetyProfile(
  supabase: SupabaseClient,
  memberId: string
): Promise<NutritionSafetyProfile | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('member_id', memberId)
    .maybeSingle();

  if (error || !data) return null;
  return mapRow(data as SafetyFlagsRow);
}

/**
 * Upserts the member's safety flags. Never touches any assessment table —
 * this is the structural half of "assessment results must never overwrite
 * medical safety information": the write paths simply never intersect.
 */
export async function upsertNutritionSafetyFlags(
  supabase: SupabaseClient,
  memberId: string,
  flags: NutritionSafetyFlags,
  updatedBy: string,
  updatedByRole: NutritionSafetyOverrideSource
): Promise<NutritionSafetyProfile> {
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      {
        member_id: memberId,
        has_diabetes: flags.hasDiabetes,
        has_prediabetes: flags.hasPrediabetes,
        has_gestational_diabetes: flags.hasGestationalDiabetes,
        has_reactive_hypoglycemia: flags.hasReactiveHypoglycemia,
        uses_insulin: flags.usesInsulin,
        has_clinician_nutrition_plan: flags.hasClinicianNutritionPlan,
        is_pregnant: flags.isPregnant,
        other_flags: flags.otherFlags,
        last_updated_by: updatedBy,
        last_updated_by_role: updatedByRole,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'member_id' }
    )
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to save nutrition safety flags: ${error?.message ?? 'unknown error'}`);
  }

  return mapRow(data as SafetyFlagsRow);
}
