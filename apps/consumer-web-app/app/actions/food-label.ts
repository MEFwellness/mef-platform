'use server';

/**
 * MEF Food Lens — Nutrition Facts label scanning (Part 1 of the Food Lens
 * ecosystem milestone). Reuses food_lens_scans (scan_type =
 * 'nutrition_label') and food_lens_captures (capture_type = 'label_image')
 * exactly as reserved since migration 55 — scan creation and capture
 * upload/record are unchanged, scan-type-agnostic actions in
 * app/actions/food-lens.ts.
 *
 * Pipeline, matching product requirement §1 exactly:
 * image-quality check (surfaced from the OCR result) -> vision extraction
 * (analyzeFoodLensLabelScanAction) -> field normalization (done inside the
 * provider) -> per-field confidence (stored alongside) -> validation rules
 * (lib/food-lens/labelValidation.ts) -> member confirmation
 * (confirmFoodLensLabelScanAction) before anything is written to the
 * shared food_products cache. Once confirmed, this reuses the EXACT same
 * MEF Nutrition Rules Engine + Root coaching narrative + registry adapter
 * a barcode scan uses — see lib/food-products/data.ts's
 * insertVerifiedFoodProductFromLabelScan for why that's possible with zero
 * new analysis code.
 */

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';
import { resolveLocalDate } from './checkin';
import type { DataCompleteness, FoodAnalysisResult, FoodLensLabelScan } from '@mef/shared-types-contracts';
import {
  getFoodLensScan,
  listFoodLensCaptures,
  updateFoodLensScan,
} from '@/lib/food-lens/data';
import { createSignedFoodLensCaptureUrl } from '@/lib/food-lens/storage';
import {
  getFoodLabelOcrProvider,
  resolveConfiguredFoodLabelOcrProvider,
} from '@/lib/food-lens/providers/labelOcr/registry';
import {
  getFoodLensLabelScanByScanId,
  insertFoodLensLabelFieldCorrection,
  insertFoodLensLabelScanFromExtraction,
  markFoodLensLabelScanConfirmed,
  updateFoodLensLabelScanFields,
} from '@/lib/food-lens/labelScanData';
import { validateLabelExtraction, type LabelValidationWarning } from '@/lib/food-lens/labelValidation';
import { getLatestFoodAnalysisResult, insertVerifiedFoodProductFromLabelScan } from '@/lib/food-products/data';
import { runProductAnalysisForScan } from '@/lib/food-products/analyze';

async function requireMember(): Promise<{
  supabase: ReturnType<typeof createClient>;
  userId: string;
} | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, userId: user.id };
}

async function memberLocalDate(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string> {
  const { data } = await supabase.from('profiles').select('timezone').eq('id', userId).single();
  const timezone = data?.timezone ?? 'America/New_York';
  return resolveLocalDate(
    new Date(new Date().toLocaleString('en-US', { timeZone: timezone })),
    false
  );
}

function warningsFor(labelScan: FoodLensLabelScan): LabelValidationWarning[] {
  return validateLabelExtraction({
    totalFatG: labelScan.total_fat_g,
    saturatedFatG: labelScan.saturated_fat_g,
    transFatG: labelScan.trans_fat_g,
    monounsaturatedFatG: labelScan.monounsaturated_fat_g,
    polyunsaturatedFatG: labelScan.polyunsaturated_fat_g,
    totalCarbohydrateG: labelScan.total_carbohydrate_g,
    fiberG: labelScan.fiber_g,
    totalSugarG: labelScan.total_sugar_g,
    addedSugarG: labelScan.added_sugar_g,
    calories: labelScan.calories,
  });
}

// ---- Extraction ----

export type AnalyzeFoodLensLabelScanResult = {
  status: 'extracted' | 'not_configured' | 'failed';
  labelScan?: FoodLensLabelScan;
  validationWarnings?: LabelValidationWarning[];
  error?: string;
};

export async function analyzeFoodLensLabelScanAction(
  scanId: string
): Promise<AnalyzeFoodLensLabelScanResult> {
  const ctx = await requireMember();
  if (!ctx) return { status: 'failed', error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  const scan = await getFoodLensScan(supabase, scanId);
  if (!scan || scan.member_id !== userId) return { status: 'failed', error: 'Scan not found.' };

  const providerName = resolveConfiguredFoodLabelOcrProvider();
  if (!providerName) {
    await updateFoodLensScan(supabase, scanId, {
      status: 'not_configured',
      provider_status: 'not_configured',
    });
    return {
      status: 'not_configured',
      error:
        "Label scanning isn't available yet — no OCR provider is configured. This scan is saved and " +
        'will be read automatically once one is connected.',
    };
  }

  await updateFoodLensScan(supabase, scanId, {
    status: 'analyzing',
    provider_name: providerName,
    provider_status: 'pending',
  });

  try {
    const captures = (await listFoodLensCaptures(supabase, scanId)).filter(
      (c) => c.capture_type === 'label_image'
    );
    if (captures.length === 0) {
      await updateFoodLensScan(supabase, scanId, { status: 'failed', provider_status: 'failed' });
      return { status: 'failed', error: 'No label photo found for this scan.' };
    }

    const signedCaptures = await Promise.all(
      captures.map(async (capture) => ({
        captureId: capture.id,
        labelPhotoRole: capture.label_photo_role ?? 'nutrition_facts',
        signedUrl: (await createSignedFoodLensCaptureUrl(supabase, capture.storage_path)) ?? '',
      }))
    );

    const provider = getFoodLabelOcrProvider(providerName);
    const result = await provider.extractLabel({ scanId, memberId: userId, captures: signedCaptures });

    const labelScan = await insertFoodLensLabelScanFromExtraction(supabase, scanId, result);
    if (!labelScan) {
      await updateFoodLensScan(supabase, scanId, { status: 'failed', provider_status: 'failed' });
      return { status: 'failed', error: 'Could not save the extracted label.' };
    }

    await updateFoodLensScan(supabase, scanId, { status: 'analyzed', provider_status: 'completed' });

    return { status: 'extracted', labelScan, validationWarnings: warningsFor(labelScan) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Label reading failed.';
    await updateFoodLensScan(supabase, scanId, {
      status: 'failed',
      provider_status: 'failed',
      provider_error: message,
    });
    return { status: 'failed', error: message };
  }
}

// ---- Read (confirm/edit screen) ----

export type FoodLensLabelScanDetail = {
  scan: NonNullable<Awaited<ReturnType<typeof getFoodLensScan>>>;
  labelScan: FoodLensLabelScan | null;
  validationWarnings: LabelValidationWarning[];
  captures: Array<{ captureId: string; signedViewUrl: string | null; labelPhotoRole: string | null }>;
};

export async function getFoodLensLabelScanAction(scanId: string): Promise<FoodLensLabelScanDetail | null> {
  const ctx = await requireMember();
  if (!ctx) return null;
  const { supabase, userId } = ctx;

  const scan = await getFoodLensScan(supabase, scanId);
  if (!scan || scan.member_id !== userId) return null;

  const [labelScan, captures] = await Promise.all([
    getFoodLensLabelScanByScanId(supabase, scanId),
    listFoodLensCaptures(supabase, scanId),
  ]);

  const signedCaptures = await Promise.all(
    captures
      .filter((c) => c.capture_type === 'label_image')
      .map(async (capture) => ({
        captureId: capture.id,
        signedViewUrl: await createSignedFoodLensCaptureUrl(supabase, capture.storage_path),
        labelPhotoRole: capture.label_photo_role,
      }))
  );

  return {
    scan,
    labelScan,
    validationWarnings: labelScan ? warningsFor(labelScan) : [],
    captures: signedCaptures,
  };
}

// ---- Member edits before confirmation ----

export type UpdateFoodLensLabelScanFieldsInput = Partial<{
  productName: string | null;
  brand: string | null;
  servingSizeText: string | null;
  servingsPerContainer: number | null;
  calories: number | null;
  proteinG: number | null;
  totalCarbohydrateG: number | null;
  fiberG: number | null;
  totalSugarG: number | null;
  addedSugarG: number | null;
  totalFatG: number | null;
  saturatedFatG: number | null;
  transFatG: number | null;
  monounsaturatedFatG: number | null;
  polyunsaturatedFatG: number | null;
  cholesterolMg: number | null;
  sodiumMg: number | null;
  potassiumMg: number | null;
  ingredientsText: string | null;
  allergensText: string | null;
}>;

const FIELD_TO_COLUMN: Record<string, string> = {
  productName: 'product_name',
  brand: 'brand',
  servingSizeText: 'serving_size_text',
  servingsPerContainer: 'servings_per_container',
  calories: 'calories',
  proteinG: 'protein_g',
  totalCarbohydrateG: 'total_carbohydrate_g',
  fiberG: 'fiber_g',
  totalSugarG: 'total_sugar_g',
  addedSugarG: 'added_sugar_g',
  totalFatG: 'total_fat_g',
  saturatedFatG: 'saturated_fat_g',
  transFatG: 'trans_fat_g',
  monounsaturatedFatG: 'monounsaturated_fat_g',
  polyunsaturatedFatG: 'polyunsaturated_fat_g',
  cholesterolMg: 'cholesterol_mg',
  sodiumMg: 'sodium_mg',
  potassiumMg: 'potassium_mg',
  ingredientsText: 'ingredients_text',
  allergensText: 'allergens_text',
};

export async function updateFoodLensLabelScanFieldsAction(
  scanId: string,
  input: UpdateFoodLensLabelScanFieldsInput
): Promise<ActionResult & { labelScan?: FoodLensLabelScan; validationWarnings?: LabelValidationWarning[] }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  const scan = await getFoodLensScan(supabase, scanId);
  if (!scan || scan.member_id !== userId) return { error: 'Scan not found.' };

  const existing = await getFoodLensLabelScanByScanId(supabase, scanId);
  if (!existing) return { error: 'No extracted label found for this scan.' };
  if (existing.status === 'member_confirmed') {
    return { error: 'This label has already been confirmed and saved.' };
  }

  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const column = FIELD_TO_COLUMN[key];
    if (!column) continue;
    const originalValue = (existing as unknown as Record<string, unknown>)[column];
    if (originalValue === value) continue;
    patch[column] = value;
    await insertFoodLensLabelFieldCorrection(supabase, {
      memberId: userId,
      labelScanId: existing.id,
      fieldName: column,
      originalValue: originalValue ?? null,
      correctedValue: value ?? null,
    });
  }

  if (Object.keys(patch).length === 0) {
    return { labelScan: existing, validationWarnings: warningsFor(existing) };
  }

  const ok = await updateFoodLensLabelScanFields(supabase, existing.id, patch);
  if (!ok) return { error: 'Could not save your changes.' };

  const updated = { ...existing, ...patch } as FoodLensLabelScan;
  return { labelScan: updated, validationWarnings: warningsFor(updated) };
}

// ---- Confirm -> materialize into food_products + run the MEF Nutrition Rules Engine ----

const TRACKED_FIELDS_FOR_COMPLETENESS = [
  'calories',
  'protein_g',
  'total_carbohydrate_g',
  'fiber_g',
  'total_sugar_g',
  'added_sugar_g',
  'total_fat_g',
  'saturated_fat_g',
  'trans_fat_g',
  'sodium_mg',
  'potassium_mg',
] as const;

function computeLabelDataCompleteness(labelScan: FoodLensLabelScan): DataCompleteness {
  const present = TRACKED_FIELDS_FOR_COMPLETENESS.filter(
    (field) => (labelScan as unknown as Record<string, unknown>)[field] !== null
  ).length;
  const ratio = present / TRACKED_FIELDS_FOR_COMPLETENESS.length;
  if (ratio >= 0.9) return 'complete';
  if (ratio >= 0.5) return 'partial';
  return 'minimal';
}

export type ConfirmFoodLensLabelScanResult = {
  status: 'analyzed' | 'failed';
  analysis?: FoodAnalysisResult;
  error?: string;
};

/** Member confirmation before saving (product requirement §1). Materializes the confirmed reading into food_products and runs the exact same rules-engine + coaching pipeline analyzeProductScanAction uses for a barcode scan. */
export async function confirmFoodLensLabelScanAction(
  scanId: string
): Promise<ConfirmFoodLensLabelScanResult> {
  const ctx = await requireMember();
  if (!ctx) return { status: 'failed', error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  const scan = await getFoodLensScan(supabase, scanId);
  if (!scan || scan.member_id !== userId) return { status: 'failed', error: 'Scan not found.' };

  const labelScan = await getFoodLensLabelScanByScanId(supabase, scanId);
  if (!labelScan) return { status: 'failed', error: 'No extracted label found for this scan.' };

  if (labelScan.status === 'member_confirmed' && labelScan.confirmed_product_id) {
    const existingAnalysis = await getLatestFoodAnalysisResult(supabase, scanId);
    if (existingAnalysis) return { status: 'analyzed', analysis: existingAnalysis };
  }

  try {
    const dataCompleteness = computeLabelDataCompleteness(labelScan);

    const product = await insertVerifiedFoodProductFromLabelScan(supabase, {
      productName: labelScan.product_name,
      brand: labelScan.brand,
      servingSizeText: labelScan.serving_size_text,
      nutrients: {
        calories: labelScan.calories,
        proteinG: labelScan.protein_g,
        totalCarbohydrateG: labelScan.total_carbohydrate_g,
        fiberG: labelScan.fiber_g,
        totalSugarG: labelScan.total_sugar_g,
        addedSugarG: labelScan.added_sugar_g,
        totalFatG: labelScan.total_fat_g,
        saturatedFatG: labelScan.saturated_fat_g,
        monounsaturatedFatG: labelScan.monounsaturated_fat_g,
        polyunsaturatedFatG: labelScan.polyunsaturated_fat_g,
        transFatG: labelScan.trans_fat_g,
        sodiumMg: labelScan.sodium_mg,
        potassiumMg: labelScan.potassium_mg,
      },
      ingredientsText: labelScan.ingredients_text,
      allergensText: labelScan.allergens_text,
      dataCompleteness,
    });
    if (!product) return { status: 'failed', error: 'Could not save this product.' };

    await markFoodLensLabelScanConfirmed(supabase, labelScan.id, product.product.id);

    const localDate = await memberLocalDate(supabase, userId);
    const result = await runProductAnalysisForScan(supabase, userId, localDate, scanId, product.product.id);
    await updateFoodLensScan(supabase, scanId, {
      status: result.status === 'analyzed' ? 'analyzed' : 'failed',
      provider_error: result.status === 'failed' ? (result.error ?? null) : null,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not confirm this label.';
    return { status: 'failed', error: message };
  }
}
