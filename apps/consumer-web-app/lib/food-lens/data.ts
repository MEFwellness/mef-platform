/**
 * Database access for Food Lens — same shape as lib/body-assessment/data.ts:
 * pure functions taking a SupabaseClient, RLS (migration 55) decides who
 * may read/write what. Inserts generate their own id client-side and skip
 * `.select()` after writing, same defensive discipline as insertFinding.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type {
  FoodLensCapture,
  FoodLensCaptureType,
  FoodLensLabelPhotoRole,
  FoodLensComparisonSignal,
  FoodLensCorrection,
  FoodLensCorrectionType,
  FoodLensDetectedItem,
  FoodLensDetectedItemSource,
  FoodLensDetectedItemStatus,
  FoodLensFoodCategory,
  FoodLensMacroEstimate,
  FoodLensMacroLevel,
  FoodLensMealMacroLevel,
  FoodLensMealQualityRating,
  FoodLensMealQualityRatingValue,
  FoodLensNutrientDensity,
  FoodLensAddedSugarLevel,
  FoodLensProcessingLevel,
  FoodLensPatternComparison,
  FoodLensScan,
  FoodLensScanStatus,
  FoodLensScanType,
  PrimalPatternProfile,
} from '@mef/shared-types-contracts';

// ---- food_lens_scans ----

export async function insertFoodLensScan(
  supabase: SupabaseClient,
  memberId: string,
  scanType: FoodLensScanType,
  primalPatternProfileId: string | null,
  linkedProductId: string | null = null
): Promise<FoodLensScan | null> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const { error } = await supabase.from('food_lens_scans').insert({
    id,
    member_id: memberId,
    scan_type: scanType,
    status: linkedProductId ? 'analyzed' : 'pending',
    primal_pattern_profile_id: primalPatternProfileId,
    linked_product_id: linkedProductId,
    created_at: now,
    updated_at: now,
  });

  if (error) {
    console.error('insertFoodLensScan failed', error);
    return null;
  }

  return {
    id,
    member_id: memberId,
    scan_type: scanType,
    status: linkedProductId ? 'analyzed' : 'pending',
    provider_name: null,
    provider_status: null,
    provider_error: null,
    primal_pattern_profile_id: primalPatternProfileId,
    linked_product_id: linkedProductId,
    created_at: now,
    updated_at: now,
  };
}

export async function getFoodLensScan(
  supabase: SupabaseClient,
  scanId: string
): Promise<FoodLensScan | null> {
  const { data, error } = await supabase
    .from('food_lens_scans')
    .select('*')
    .eq('id', scanId)
    .maybeSingle();
  if (error) {
    console.error('getFoodLensScan failed', error);
    return null;
  }
  return data as FoodLensScan | null;
}

export async function updateFoodLensScan(
  supabase: SupabaseClient,
  scanId: string,
  patch: Partial<{
    status: FoodLensScanStatus;
    provider_name: string | null;
    provider_status: string | null;
    provider_error: string | null;
  }>
): Promise<boolean> {
  const { error } = await supabase
    .from('food_lens_scans')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', scanId);
  if (error) {
    console.error('updateFoodLensScan failed', error);
    return false;
  }
  return true;
}

export async function listFoodLensScans(
  supabase: SupabaseClient,
  memberId: string,
  options: { limit?: number; before?: string } = {}
): Promise<FoodLensScan[]> {
  let query = supabase
    .from('food_lens_scans')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 20);

  if (options.before) query = query.lt('created_at', options.before);

  const { data, error } = await query;
  if (error) {
    console.error('listFoodLensScans failed', error);
    return [];
  }
  return data as FoodLensScan[];
}

// ---- food_lens_captures ----

export async function insertFoodLensCapture(
  supabase: SupabaseClient,
  input: {
    id: string;
    scanId: string;
    storagePath: string;
    captureType: FoodLensCaptureType;
    labelPhotoRole?: FoodLensLabelPhotoRole | null;
    deviceInfo?: Record<string, unknown>;
  }
): Promise<FoodLensCapture | null> {
  const now = new Date().toISOString();
  const { error } = await supabase.from('food_lens_captures').insert({
    id: input.id,
    scan_id: input.scanId,
    storage_path: input.storagePath,
    capture_type: input.captureType,
    label_photo_role: input.labelPhotoRole ?? null,
    device_info: input.deviceInfo ?? {},
    created_at: now,
  });
  if (error) {
    console.error('insertFoodLensCapture failed', error);
    return null;
  }
  return {
    id: input.id,
    scan_id: input.scanId,
    storage_path: input.storagePath,
    capture_type: input.captureType,
    label_photo_role: input.labelPhotoRole ?? null,
    device_info: input.deviceInfo ?? {},
    created_at: now,
  };
}

export async function listFoodLensCaptures(
  supabase: SupabaseClient,
  scanId: string
): Promise<FoodLensCapture[]> {
  const { data, error } = await supabase
    .from('food_lens_captures')
    .select('*')
    .eq('scan_id', scanId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('listFoodLensCaptures failed', error);
    return [];
  }
  return data as FoodLensCapture[];
}

// ---- food_lens_detected_items ----

export async function insertFoodLensDetectedItem(
  supabase: SupabaseClient,
  input: {
    scanId: string;
    label: string;
    category: FoodLensFoodCategory;
    confidence: number;
    source: FoodLensDetectedItemSource;
    status?: FoodLensDetectedItemStatus;
    supersedesId?: string | null;
    portionDescription?: string | null;
    portionConfidence?: number | null;
    quantity?: number | null;
    unit?: FoodLensDetectedItem['unit'];
    cookingMethod?: FoodLensDetectedItem['cooking_method'];
    isCondiment?: boolean;
  }
): Promise<FoodLensDetectedItem | null> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const status = input.status ?? 'pending_confirmation';
  const portionDescription = input.portionDescription ?? null;
  const portionConfidence = input.portionConfidence ?? null;
  const quantity = input.quantity ?? null;
  const unit = input.unit ?? null;
  const cookingMethod = input.cookingMethod ?? null;
  const isCondiment = input.isCondiment ?? false;

  const { error } = await supabase.from('food_lens_detected_items').insert({
    id,
    scan_id: input.scanId,
    label: input.label,
    category: input.category,
    confidence: input.confidence,
    source: input.source,
    status,
    supersedes_id: input.supersedesId ?? null,
    portion_description: portionDescription,
    portion_confidence: portionConfidence,
    quantity,
    unit,
    cooking_method: cookingMethod,
    is_condiment: isCondiment,
    created_at: now,
  });
  if (error) {
    console.error('insertFoodLensDetectedItem failed', error);
    return null;
  }
  return {
    id,
    scan_id: input.scanId,
    label: input.label,
    category: input.category,
    confidence: input.confidence,
    source: input.source,
    status,
    supersedes_id: input.supersedesId ?? null,
    portion_description: portionDescription,
    portion_confidence: portionConfidence,
    quantity,
    unit,
    cooking_method: cookingMethod,
    is_condiment: isCondiment,
    created_at: now,
  };
}

export async function getFoodLensDetectedItem(
  supabase: SupabaseClient,
  itemId: string
): Promise<FoodLensDetectedItem | null> {
  const { data, error } = await supabase
    .from('food_lens_detected_items')
    .select('*')
    .eq('id', itemId)
    .maybeSingle();
  if (error) {
    console.error('getFoodLensDetectedItem failed', error);
    return null;
  }
  return data as FoodLensDetectedItem | null;
}

export async function updateFoodLensDetectedItemStatus(
  supabase: SupabaseClient,
  itemId: string,
  status: FoodLensDetectedItemStatus
): Promise<boolean> {
  const { error } = await supabase
    .from('food_lens_detected_items')
    .update({ status })
    .eq('id', itemId);
  if (error) {
    console.error('updateFoodLensDetectedItemStatus failed', error);
    return false;
  }
  return true;
}

/** Current (non-superseded) items only — what the results screen and the comparison engine should read. */
export async function listCurrentFoodLensDetectedItems(
  supabase: SupabaseClient,
  scanId: string
): Promise<FoodLensDetectedItem[]> {
  const { data, error } = await supabase
    .from('food_lens_detected_items')
    .select('*')
    .eq('scan_id', scanId)
    .neq('status', 'superseded')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('listCurrentFoodLensDetectedItems failed', error);
    return [];
  }
  return data as FoodLensDetectedItem[];
}

// ---- food_lens_corrections ----

export async function insertFoodLensCorrection(
  supabase: SupabaseClient,
  input: {
    memberId: string;
    detectedItemId: string;
    correctionType: FoodLensCorrectionType;
    originalValue: Record<string, unknown>;
    correctedValue: Record<string, unknown>;
  }
): Promise<FoodLensCorrection | null> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const { error } = await supabase.from('food_lens_corrections').insert({
    id,
    member_id: input.memberId,
    detected_item_id: input.detectedItemId,
    correction_type: input.correctionType,
    original_value: input.originalValue,
    corrected_value: input.correctedValue,
    created_at: now,
  });
  if (error) {
    console.error('insertFoodLensCorrection failed', error);
    return null;
  }
  return {
    id,
    member_id: input.memberId,
    detected_item_id: input.detectedItemId,
    correction_type: input.correctionType,
    original_value: input.originalValue,
    corrected_value: input.correctedValue,
    created_at: now,
  };
}

/** Most recently/frequently confirmed label↔category mappings for this member — feeds phase-2 per-member vision personalization (doc 6 phase 2). Best-effort, capped small since it's injected as few-shot context, not a full history dump. */
export async function listRecentConfirmedLabelsForMember(
  supabase: SupabaseClient,
  memberId: string,
  limit = 20
): Promise<Array<{ label: string; category: FoodLensFoodCategory }>> {
  const { data, error } = await supabase
    .from('food_lens_detected_items')
    .select('label, category, food_lens_scans!inner(member_id)')
    .eq('food_lens_scans.member_id', memberId)
    .eq('status', 'confirmed')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('listRecentConfirmedLabelsForMember failed', error);
    return [];
  }
  return (data as unknown as Array<{ label: string; category: FoodLensFoodCategory }>).map(
    (row) => ({ label: row.label, category: row.category })
  );
}

// ---- food_lens_macro_estimates ----

export async function insertFoodLensMacroEstimate(
  supabase: SupabaseClient,
  input: {
    scanId: string;
    proteinLevel: FoodLensMealMacroLevel;
    carbLevel: FoodLensMealMacroLevel;
    fatLevel: FoodLensMealMacroLevel;
    proteinConfidence: number;
    carbConfidence: number;
    fatConfidence: number;
    overallConfidence: number;
    basis: 'ai_estimated' | 'member_adjusted';
  }
): Promise<FoodLensMacroEstimate | null> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const { error } = await supabase.from('food_lens_macro_estimates').insert({
    id,
    scan_id: input.scanId,
    protein_level: input.proteinLevel,
    carb_level: input.carbLevel,
    fat_level: input.fatLevel,
    protein_confidence: input.proteinConfidence,
    carb_confidence: input.carbConfidence,
    fat_confidence: input.fatConfidence,
    overall_confidence: input.overallConfidence,
    basis: input.basis,
    created_at: now,
  });
  if (error) {
    console.error('insertFoodLensMacroEstimate failed', error);
    return null;
  }
  return {
    id,
    scan_id: input.scanId,
    protein_level: input.proteinLevel,
    carb_level: input.carbLevel,
    fat_level: input.fatLevel,
    protein_confidence: input.proteinConfidence,
    carb_confidence: input.carbConfidence,
    fat_confidence: input.fatConfidence,
    overall_confidence: input.overallConfidence,
    basis: input.basis,
    created_at: now,
  };
}

/** Latest version only — a recompute after a correction inserts a new row rather than mutating (doc 3.3). */
export async function getLatestFoodLensMacroEstimate(
  supabase: SupabaseClient,
  scanId: string
): Promise<FoodLensMacroEstimate | null> {
  const { data, error } = await supabase
    .from('food_lens_macro_estimates')
    .select('*')
    .eq('scan_id', scanId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('getLatestFoodLensMacroEstimate failed', error);
    return null;
  }
  return data as FoodLensMacroEstimate | null;
}

// ---- food_lens_pattern_comparisons ----

export async function insertFoodLensPatternComparison(
  supabase: SupabaseClient,
  input: {
    scanId: string;
    macroEstimateId: string;
    primalPatternProfileId: string;
    signals: FoodLensComparisonSignal[];
    narrative: string;
    confidence: number;
  }
): Promise<FoodLensPatternComparison | null> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const { error } = await supabase.from('food_lens_pattern_comparisons').insert({
    id,
    scan_id: input.scanId,
    macro_estimate_id: input.macroEstimateId,
    primal_pattern_profile_id: input.primalPatternProfileId,
    signals: input.signals,
    narrative: input.narrative,
    confidence: input.confidence,
    created_at: now,
  });
  if (error) {
    console.error('insertFoodLensPatternComparison failed', error);
    return null;
  }
  return {
    id,
    scan_id: input.scanId,
    macro_estimate_id: input.macroEstimateId,
    primal_pattern_profile_id: input.primalPatternProfileId,
    signals: input.signals,
    narrative: input.narrative,
    confidence: input.confidence,
    created_at: now,
  };
}

export async function getLatestFoodLensPatternComparison(
  supabase: SupabaseClient,
  scanId: string
): Promise<FoodLensPatternComparison | null> {
  const { data, error } = await supabase
    .from('food_lens_pattern_comparisons')
    .select('*')
    .eq('scan_id', scanId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('getLatestFoodLensPatternComparison failed', error);
    return null;
  }
  return data as FoodLensPatternComparison | null;
}

/** Ascending by date, most recent N scans' comparisons — feeds the coaching narrative generator's "your recent meals" trend context (product decision: coaching should reference real recent history). */
export async function listRecentFoodLensComparisonsForMember(
  supabase: SupabaseClient,
  memberId: string,
  limit = 5
): Promise<Array<{ scan: FoodLensScan; comparison: FoodLensPatternComparison }>> {
  const { data, error } = await supabase
    .from('food_lens_pattern_comparisons')
    .select('*, food_lens_scans!inner(*)')
    .eq('food_lens_scans.member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('listRecentFoodLensComparisonsForMember failed', error);
    return [];
  }
  return (data as unknown as Array<Record<string, unknown> & { food_lens_scans: FoodLensScan }>).map(
    (row) => {
      const { food_lens_scans, ...comparison } = row;
      return {
        scan: food_lens_scans,
        comparison: comparison as unknown as FoodLensPatternComparison,
      };
    }
  );
}

// ---- primal_pattern_profiles ----

export async function getActivePrimalPatternProfile(
  supabase: SupabaseClient,
  memberId: string
): Promise<PrimalPatternProfile | null> {
  const { data, error } = await supabase
    .from('primal_pattern_profiles')
    .select('*')
    .eq('member_id', memberId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) {
    console.error('getActivePrimalPatternProfile failed', error);
    return null;
  }
  return data as PrimalPatternProfile | null;
}

/** The exact profile snapshot a given scan ran its comparison against (food_lens_scans.primal_pattern_profile_id) — not necessarily still the member's *active* profile, since they may have updated their pattern since this scan ran. Used by the results page so a scan's displayed pattern label never silently changes after the fact. */
export async function getPrimalPatternProfileById(
  supabase: SupabaseClient,
  profileId: string
): Promise<PrimalPatternProfile | null> {
  const { data, error } = await supabase
    .from('primal_pattern_profiles')
    .select('*')
    .eq('id', profileId)
    .maybeSingle();
  if (error) {
    console.error('getPrimalPatternProfileById failed', error);
    return null;
  }
  return data as PrimalPatternProfile | null;
}

/** Phase 1 manual-entry placeholder (doc 6 phase 1) — supersedes any existing active profile rather than mutating it, same append-only discipline as everything else in this feature. */
export async function setManualPrimalPatternProfile(
  supabase: SupabaseClient,
  memberId: string,
  input: {
    patternLabel: string;
    proteinEmphasis: FoodLensMacroLevel;
    carbEmphasis: FoodLensMacroLevel;
    fatEmphasis: FoodLensMacroLevel;
  }
): Promise<PrimalPatternProfile | null> {
  const existing = await getActivePrimalPatternProfile(supabase, memberId);
  const id = randomUUID();
  const now = new Date().toISOString();

  const { error } = await supabase.from('primal_pattern_profiles').insert({
    id,
    member_id: memberId,
    pattern_label: input.patternLabel,
    protein_emphasis: input.proteinEmphasis,
    carb_emphasis: input.carbEmphasis,
    fat_emphasis: input.fatEmphasis,
    source: 'manual_entry_v1',
    is_active: true,
    supersedes_id: existing?.id ?? null,
    created_at: now,
  });
  if (error) {
    console.error('setManualPrimalPatternProfile failed', error);
    return null;
  }

  if (existing) {
    const { error: deactivateError } = await supabase
      .from('primal_pattern_profiles')
      .update({ is_active: false })
      .eq('id', existing.id);
    if (deactivateError) {
      console.error('setManualPrimalPatternProfile deactivate failed', deactivateError);
    }
  }

  return {
    id,
    member_id: memberId,
    pattern_label: input.patternLabel,
    protein_emphasis: input.proteinEmphasis,
    carb_emphasis: input.carbEmphasis,
    fat_emphasis: input.fatEmphasis,
    source: 'manual_entry_v1',
    is_active: true,
    supersedes_id: existing?.id ?? null,
    created_at: now,
  };
}

// ---- food_lens_meal_quality_ratings ----

export async function insertFoodLensMealQualityRating(
  supabase: SupabaseClient,
  input: {
    scanId: string;
    macroEstimateId: string;
    rating: FoodLensMealQualityRatingValue;
    explanation: string;
    nutrientDensity: FoodLensNutrientDensity;
    addedSugarLevel: FoodLensAddedSugarLevel;
    processingLevel: FoodLensProcessingLevel;
    hasMeaningfulProtein: boolean;
    hasMeaningfulFiber: boolean;
    hasHealthyFat: boolean;
    isBeverage: boolean;
    confidence: number;
  }
): Promise<FoodLensMealQualityRating | null> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const { error } = await supabase.from('food_lens_meal_quality_ratings').insert({
    id,
    scan_id: input.scanId,
    macro_estimate_id: input.macroEstimateId,
    rating: input.rating,
    explanation: input.explanation,
    nutrient_density: input.nutrientDensity,
    added_sugar_level: input.addedSugarLevel,
    processing_level: input.processingLevel,
    has_meaningful_protein: input.hasMeaningfulProtein,
    has_meaningful_fiber: input.hasMeaningfulFiber,
    has_healthy_fat: input.hasHealthyFat,
    is_beverage: input.isBeverage,
    confidence: input.confidence,
    created_at: now,
  });
  if (error) {
    console.error('insertFoodLensMealQualityRating failed', error);
    return null;
  }
  return {
    id,
    scan_id: input.scanId,
    macro_estimate_id: input.macroEstimateId,
    rating: input.rating,
    explanation: input.explanation,
    nutrient_density: input.nutrientDensity,
    added_sugar_level: input.addedSugarLevel,
    processing_level: input.processingLevel,
    has_meaningful_protein: input.hasMeaningfulProtein,
    has_meaningful_fiber: input.hasMeaningfulFiber,
    has_healthy_fat: input.hasHealthyFat,
    is_beverage: input.isBeverage,
    confidence: input.confidence,
    created_at: now,
  };
}

/** Latest version only — a recompute after a correction inserts a new row rather than mutating, same versioning discipline as food_lens_macro_estimates. */
export async function getLatestFoodLensMealQualityRating(
  supabase: SupabaseClient,
  scanId: string
): Promise<FoodLensMealQualityRating | null> {
  const { data, error } = await supabase
    .from('food_lens_meal_quality_ratings')
    .select('*')
    .eq('scan_id', scanId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('getLatestFoodLensMealQualityRating failed', error);
    return null;
  }
  return data as FoodLensMealQualityRating | null;
}
