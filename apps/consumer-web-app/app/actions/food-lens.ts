'use server';

/**
 * MEF Food Lens — server actions. Same convention as every other action
 * file in this app (see app/actions/body-assessment.ts): a session-scoped
 * Supabase client, RLS (migration 55) as the real authorization boundary,
 * `{ error }`-shaped results for mutations, empty/null for unauthenticated
 * reads.
 *
 * Per the product decision (hybrid approach): identification, macro
 * estimation, confidence, and comparison signals are computed
 * deterministically here (lib/food-lens/comparison.ts); the coaching
 * sentence is generated dynamically (lib/food-lens/coachingNarrative.ts)
 * from those signals plus the member's real context. Both stages always
 * run together — a scan is never left with structured signals but no
 * coaching sentence, or vice versa.
 */

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';
import { getFoodLensBarcodeScanByScanId, insertFoodLogEntry } from '@/lib/food-products/data';
import { getFoodLensLabelScanByScanId } from '@/lib/food-lens/labelScanData';
import type { MealCategory } from '@mef/shared-types-contracts';
import { resolveLocalDate } from './checkin';
import { trackProductEvent, resolveMemberTimezone } from '@/lib/analytics/track';
import type {
  FoodLensCapture,
  FoodLensCaptureType,
  FoodLensItemMacroEstimate,
  FoodLensLabelPhotoRole,
  FoodLensComparisonSignal,
  FoodLensDetectedItem,
  FoodLensFoodCategory,
  FoodLensMacroEstimate,
  FoodLensMealQualityRating,
  FoodLensPatternComparison,
  FoodLensScan,
  FoodLensScanType,
  PrimalPatternProfile,
} from '@mef/shared-types-contracts';
import {
  buildFoodLensCaptureStoragePath,
  createSignedFoodLensCaptureUrl,
  FOOD_LENS_BUCKET,
} from '@/lib/food-lens/storage';
import {
  getFoodLensProvider,
  resolveConfiguredFoodLensProvider,
} from '@/lib/food-lens/providers/registry';
import type { FoodLensQualitySignals } from '@/lib/food-lens/providers/types';
import {
  compareMealToPattern,
  deriveMacroEstimateFromItems,
  overallConfidenceFor,
  type ComparisonMacroEstimate,
} from '@/lib/food-lens/comparison';
import { computeMealQualityRating, primaryMealSubjectLabel } from '@/lib/food-lens/mealQuality';
import { scaleMacroGrams, sumMacroGrams, type MacroGrams } from '@/lib/food-lens/macroGrams';
import { generateFoodLensCoachingNarrative } from '@/lib/food-lens/coachingNarrative';
import {
  getActivePrimalPatternProfile,
  getFoodLensScan,
  getFoodLensDetectedItem,
  getLatestFoodLensMacroEstimate,
  getLatestFoodLensMealQualityRating,
  getLatestFoodLensPatternComparison,
  getLatestItemMacroEstimatesByItemId,
  insertFoodLensCapture,
  insertFoodLensCorrection,
  insertFoodLensDetectedItem,
  insertFoodLensItemMacroEstimate,
  insertFoodLensMacroEstimate,
  insertFoodLensMealQualityRating,
  insertFoodLensPatternComparison,
  insertFoodLensScan,
  listCurrentFoodLensDetectedItems,
  listFoodLensCaptures,
  listFoodLensScans,
  listRecentConfirmedLabelsForMember,
  setManualPrimalPatternProfile,
  updateFoodLensDetectedItemStatus,
  updateFoodLensScan,
} from '@/lib/food-lens/data';
import { memberTimezone } from '@/lib/time/memberToday';
import { getCachedUser } from '@/lib/supabase/currentUser';

async function requireMember(): Promise<{
  supabase: ReturnType<typeof createClient>;
  userId: string;
} | null> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return null;
  return { supabase, userId: user.id };
}

async function memberLocalDate(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string> {
  const timezone = await memberTimezone(supabase, userId);
  return resolveLocalDate(
    new Date(new Date().toLocaleString('en-US', { timeZone: timezone })),
    false
  );
}

// ---- Scan lifecycle ----

export async function startFoodLensScanAction(
  scanType: FoodLensScanType = 'meal_photo'
): Promise<ActionResult & { scan?: FoodLensScan }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  const activeProfile = await getActivePrimalPatternProfile(supabase, userId);
  const scan = await insertFoodLensScan(supabase, userId, scanType, activeProfile?.id ?? null);
  if (!scan) return { error: 'Could not start scan.' };
  return { scan };
}

/** The storage path a new capture should upload to — computed server-side so the member id segment storage.objects' RLS relies on is never trusted from the client, same discipline as buildCaptureUploadPathAction in body-assessment. */
export async function buildFoodLensCaptureUploadPathAction(
  scanId: string,
  captureId: string,
  extension: string
): Promise<{ bucket: string; path: string } | null> {
  const ctx = await requireMember();
  if (!ctx) return null;
  return {
    bucket: FOOD_LENS_BUCKET,
    path: buildFoodLensCaptureStoragePath(ctx.userId, scanId, captureId, extension),
  };
}

export type RecordFoodLensCaptureInput = {
  captureId: string;
  scanId: string;
  storagePath: string;
  captureType?: FoodLensCaptureType;
  labelPhotoRole?: FoodLensLabelPhotoRole;
  deviceInfo?: Record<string, unknown>;
};

/** Called after the browser has already uploaded the capture's bytes directly to Supabase Storage — this only records the metadata row. */
export async function recordFoodLensCaptureAction(
  input: RecordFoodLensCaptureInput
): Promise<ActionResult & { capture?: FoodLensCapture }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  const scan = await getFoodLensScan(supabase, input.scanId);
  if (!scan || scan.member_id !== userId) return { error: 'Scan not found.' };

  const capture = await insertFoodLensCapture(supabase, {
    id: input.captureId,
    scanId: input.scanId,
    storagePath: input.storagePath,
    captureType: input.captureType ?? 'photo',
    labelPhotoRole: input.labelPhotoRole ?? null,
    deviceInfo: input.deviceInfo ?? {},
  });
  if (!capture) return { error: 'Could not save capture.' };
  return { capture };
}

export type AnalyzeFoodLensScanResult = {
  status: 'analyzed' | 'not_configured' | 'failed';
  detectedItems?: FoodLensDetectedItem[];
  macroEstimate?: FoodLensMacroEstimate;
  comparison?: FoodLensPatternComparison | undefined;
  mealQuality?: FoodLensMealQualityRating | undefined;
  error?: string;
};

/**
 * Runs the configured vision provider against this scan's captures, then
 * (deterministically) computes the macro estimate and comparison signals,
 * then (dynamically) generates Root's coaching sentence, then registers
 * the result with the Universal Registry so Root's ongoing conversations
 * and the Intelligence Engine pick it up too. Mirrors performAnalysis in
 * app/actions/body-assessment.ts's overall shape.
 */
export async function analyzeFoodLensScanAction(
  scanId: string
): Promise<AnalyzeFoodLensScanResult> {
  const ctx = await requireMember();
  if (!ctx) return { status: 'failed', error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  const scan = await getFoodLensScan(supabase, scanId);
  if (!scan || scan.member_id !== userId) return { status: 'failed', error: 'Scan not found.' };

  // Product analytics, "a Food Lens scan was performed." Recorded here,
  // once, as soon as a real scan owned by this member is about to be
  // analyzed, rather than at each of this function's several exits: one
  // member action produces exactly one event regardless of whether the
  // provider then succeeds, fails, or is unconfigured. scan_type is the
  // only payload field and is a fixed enum, never food or health content.
  await trackProductEvent(supabase, {
    memberId: userId,
    eventType: 'food_scan_performed',
    timezone: await resolveMemberTimezone(supabase, userId),
    payload: { scanType: scan.scan_type },
  });

  const providerName = resolveConfiguredFoodLensProvider();
  if (!providerName) {
    await updateFoodLensScan(supabase, scanId, {
      status: 'not_configured',
      provider_status: 'not_configured',
    });
    return {
      status: 'not_configured',
      error:
        "Food Lens isn't available yet. No vision provider is configured. This scan is saved and " +
        'will be analyzed automatically once one is connected.',
    };
  }

  await updateFoodLensScan(supabase, scanId, {
    status: 'analyzing',
    provider_name: providerName,
    provider_status: 'pending',
  });

  try {
    const captures = await listFoodLensCaptures(supabase, scanId);
    if (captures.length === 0) {
      await updateFoodLensScan(supabase, scanId, { status: 'failed', provider_status: 'failed' });
      return { status: 'failed', error: 'No capture found for this scan.' };
    }

    const signedCaptures = await Promise.all(
      captures.map(async (capture) => ({
        captureId: capture.id,
        captureType: capture.capture_type,
        signedUrl: (await createSignedFoodLensCaptureUrl(supabase, capture.storage_path)) ?? '',
      }))
    );

    const personalizationContext = await listRecentConfirmedLabelsForMember(supabase, userId, 20);

    const provider = getFoodLensProvider(providerName);
    const result = await provider.analyzeMeal({
      scanId,
      memberId: userId,
      captures: signedCaptures,
      personalizationContext,
    });

    const detectedItems: FoodLensDetectedItem[] = [];
    // Each item's gram estimate is written as its own row against the item
    // it belongs to, and the meal total below is the sum of exactly these.
    // Nothing asks the model for a plate total, so a total and its
    // breakdown cannot drift apart.
    const itemGrams: MacroGrams[] = [];
    for (const item of result.items) {
      const created = await insertFoodLensDetectedItem(supabase, {
        scanId,
        label: item.label,
        category: item.category,
        confidence: item.confidence,
        source: 'ai_detected',
        portionDescription: item.portionDescription,
        portionConfidence: item.portionConfidence,
        quantity: item.quantity,
        unit: item.unit,
        cookingMethod: item.cookingMethod,
        isCondiment: item.isCondiment,
      });
      if (!created) continue;
      detectedItems.push(created);

      const grams: MacroGrams = {
        proteinG: item.proteinG,
        carbG: item.carbG,
        fatG: item.fatG,
      };
      itemGrams.push(grams);
      await insertFoodLensItemMacroEstimate(supabase, {
        scanId,
        detectedItemId: created.id,
        proteinG: grams.proteinG,
        carbG: grams.carbG,
        fatG: grams.fatG,
        portionDescription: item.portionDescription,
        basis: 'ai_estimated',
      });
    }

    const mealGrams = sumMacroGrams(itemGrams);
    const macroEstimate = await insertFoodLensMacroEstimate(supabase, {
      scanId,
      proteinLevel: result.macroEstimate.protein.level,
      carbLevel: result.macroEstimate.carb.level,
      fatLevel: result.macroEstimate.fat.level,
      proteinConfidence: result.macroEstimate.protein.confidence,
      carbConfidence: result.macroEstimate.carb.confidence,
      fatConfidence: result.macroEstimate.fat.confidence,
      overallConfidence: overallConfidenceFor(result.macroEstimate),
      proteinG: mealGrams.proteinG,
      carbG: mealGrams.carbG,
      fatG: mealGrams.fatG,
      basis: 'ai_estimated',
    });
    if (!macroEstimate) {
      await updateFoodLensScan(supabase, scanId, { status: 'failed', provider_status: 'failed' });
      return { status: 'failed', error: 'Could not save macro estimate.' };
    }

    // No Primal Pattern target yet: still useful on its own (doc 4 §4.4,
    // doc 5 §5.5) — items + macro estimate stand alone, no comparison row.
    const targetProfileId = scan.primal_pattern_profile_id;
    const target = targetProfileId ? await getActivePrimalPatternProfile(supabase, userId) : null;

    let comparison: FoodLensPatternComparison | undefined;
    if (target) {
      comparison = await runComparisonAndNarrative(
        supabase,
        userId,
        scanId,
        detectedItems,
        {
          protein: result.macroEstimate.protein,
          carb: result.macroEstimate.carb,
          fat: result.macroEstimate.fat,
        },
        macroEstimate.id,
        target
      );
    }

    // Meal Quality runs regardless of whether a Primal Pattern target
    // exists — like the macro estimate itself (doc 5 §5.5), it's useful
    // on its own. Freshly derived from THIS vision call's quality_signals.
    const mealQuality = await computeAndStoreMealQuality(
      supabase,
      scanId,
      macroEstimate.id,
      result.qualitySignals,
      {
        protein: result.macroEstimate.protein,
        carb: result.macroEstimate.carb,
        fat: result.macroEstimate.fat,
      },
      comparison?.signals ?? null,
      primaryMealSubjectLabel(result.items)
    );

    await updateFoodLensScan(supabase, scanId, {
      status: 'analyzed',
      provider_status: 'completed',
    });

    return {
      status: 'analyzed',
      detectedItems,
      macroEstimate,
      comparison,
      mealQuality,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed.';
    await updateFoodLensScan(supabase, scanId, {
      status: 'failed',
      provider_status: 'failed',
      provider_error: message,
    });
    return { status: 'failed', error: message };
  }
}

async function runComparisonAndNarrative(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  scanId: string,
  detectedItems: Pick<FoodLensDetectedItem, 'label' | 'category' | 'confidence'>[],
  macroEstimate: ComparisonMacroEstimate,
  macroEstimateId: string,
  target: PrimalPatternProfile
): Promise<FoodLensPatternComparison | undefined> {
  const { signals, confidence } = compareMealToPattern(macroEstimate, target);

  const localDate = await memberLocalDate(supabase, userId);
  const { narrative } = await generateFoodLensCoachingNarrative({
    supabase,
    memberId: userId,
    localDate,
    detectedItems,
    macroEstimate,
    target,
    signals,
  });

  const comparison = await insertFoodLensPatternComparison(supabase, {
    scanId,
    macroEstimateId,
    primalPatternProfileId: target.id,
    signals,
    narrative,
    confidence,
  });

  // A logged meal is data, not a finding. This used to also write a
  // registry_entries row carrying this comparison's narrative, which names
  // the food the member logged ("That pistachio-vanilla matcha looks like a
  // treat..."), and that row then rendered on her Root Map as a standing
  // finding about her nutrition, forever, from one meal. The comparison is
  // still saved and still shown on the scan's own result screen, where it
  // is about that meal and is read as being about that meal.
  return comparison ?? undefined;
}

/**
 * Computes the deterministic Meal Quality rating (lib/food-lens/
 * mealQuality.ts) and persists it as a new versioned row — mirrors how
 * runComparisonAndNarrative persists a new pattern-comparison row rather
 * than mutating. Best-effort in the sense that a failed insert doesn't
 * throw — same "a member's own scan result must never fail because of a
 * secondary write" discipline as the registry adapter call above.
 */
async function computeAndStoreMealQuality(
  supabase: ReturnType<typeof createClient>,
  scanId: string,
  macroEstimateId: string,
  qualitySignals: FoodLensQualitySignals,
  macro: ComparisonMacroEstimate,
  patternSignals: FoodLensComparisonSignal[] | null,
  itemLabel: string | null
): Promise<FoodLensMealQualityRating | undefined> {
  const { rating, explanation } = computeMealQualityRating(
    qualitySignals,
    macro,
    patternSignals,
    itemLabel
  );

  const created = await insertFoodLensMealQualityRating(supabase, {
    scanId,
    macroEstimateId,
    rating,
    explanation,
    nutrientDensity: qualitySignals.nutrientDensity,
    addedSugarLevel: qualitySignals.addedSugarLevel,
    processingLevel: qualitySignals.processingLevel,
    hasMeaningfulProtein: qualitySignals.hasMeaningfulProtein,
    hasMeaningfulFiber: qualitySignals.hasMeaningfulFiber,
    hasHealthyFat: qualitySignals.hasHealthyFat,
    isBeverage: qualitySignals.isBeverage,
    confidence: qualitySignals.confidence,
  });

  return created ?? undefined;
}

export type FoodLensScanDetail = {
  scan: FoodLensScan;
  detectedItems: FoodLensDetectedItem[];
  /** The latest gram estimate per detected item, keyed by detected item id. Empty for a scan analyzed before gram estimates existed, which is what makes the result screen simply omit the section rather than show zeros. */
  itemMacroEstimates: Record<string, FoodLensItemMacroEstimate>;
  macroEstimate: FoodLensMacroEstimate | null;
  comparison: FoodLensPatternComparison | null;
  /** Null for a scan analyzed before this rating existed — the UI simply omits the indicator for those, never fabricates one after the fact. */
  mealQuality: FoodLensMealQualityRating | null;
  captures: Array<{ captureId: string; signedViewUrl: string | null; captureType: string }>;
};

export async function getFoodLensScanAction(scanId: string): Promise<FoodLensScanDetail | null> {
  const ctx = await requireMember();
  if (!ctx) return null;
  const { supabase, userId } = ctx;

  const scan = await getFoodLensScan(supabase, scanId);
  if (!scan || scan.member_id !== userId) return null;

  const [detectedItems, itemMacroEstimates, macroEstimate, comparison, mealQuality, captures] =
    await Promise.all([
      listCurrentFoodLensDetectedItems(supabase, scanId),
      getLatestItemMacroEstimatesByItemId(supabase, scanId),
      getLatestFoodLensMacroEstimate(supabase, scanId),
      getLatestFoodLensPatternComparison(supabase, scanId),
      getLatestFoodLensMealQualityRating(supabase, scanId),
      listFoodLensCaptures(supabase, scanId),
    ]);

  const signedCaptures = await Promise.all(
    captures.map(async (capture) => ({
      captureId: capture.id,
      signedViewUrl: await createSignedFoodLensCaptureUrl(supabase, capture.storage_path),
      captureType: capture.capture_type,
    }))
  );

  return {
    scan,
    detectedItems,
    itemMacroEstimates: Object.fromEntries(itemMacroEstimates),
    macroEstimate,
    comparison,
    mealQuality,
    captures: signedCaptures,
  };
}

export type FoodLensScanSummary = {
  id: string;
  scanType: FoodLensScanType;
  status: FoodLensScan['status'];
  createdAt: string;
  headline: string | null;
};

export async function listMyFoodLensScansAction(
  options: { limit?: number; before?: string } = {}
): Promise<FoodLensScanSummary[]> {
  const ctx = await requireMember();
  if (!ctx) return [];
  const { supabase, userId } = ctx;

  const scans = await listFoodLensScans(supabase, userId, options);
  return Promise.all(
    scans.map(async (scan) => {
      if (scan.scan_type === 'barcode' || scan.scan_type === 'manual_entry') {
        // No Primal Pattern comparison exists for a packaged-food or
        // manual-entry scan — the product name is the useful headline
        // instead. A barcode scan resolves its product via
        // food_lens_barcode_scans; a manual entry (or a reopened
        // search/favorite) resolves it directly via linked_product_id.
        const barcodeScan = await getFoodLensBarcodeScanByScanId(supabase, scan.id);
        const productId = barcodeScan?.product_id ?? scan.linked_product_id ?? null;
        let headline: string | null = null;
        if (productId) {
          const { data: product } = await supabase
            .from('food_products')
            .select('name')
            .eq('id', productId)
            .maybeSingle();
          headline = (product?.name as string | undefined) ?? null;
        }
        return {
          id: scan.id,
          scanType: scan.scan_type,
          status: scan.status,
          createdAt: scan.created_at,
          headline,
        };
      }

      if (scan.scan_type === 'nutrition_label') {
        const labelScan = await getFoodLensLabelScanByScanId(supabase, scan.id);
        return {
          id: scan.id,
          scanType: scan.scan_type,
          status: scan.status,
          createdAt: scan.created_at,
          headline: labelScan?.product_name ?? null,
        };
      }

      const comparison = await getLatestFoodLensPatternComparison(supabase, scan.id);
      return {
        id: scan.id,
        scanType: scan.scan_type,
        status: scan.status,
        createdAt: scan.created_at,
        headline: comparison?.narrative ?? null,
      };
    })
  );
}

// ---- Corrections ----

async function requireOwnedItem(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  itemId: string
): Promise<{ item: FoodLensDetectedItem; scan: FoodLensScan } | null> {
  const item = await getFoodLensDetectedItem(supabase, itemId);
  if (!item) return null;
  const scan = await getFoodLensScan(supabase, item.scan_id);
  if (!scan || scan.member_id !== userId) return null;
  return { item, scan };
}

export async function confirmDetectedItemAction(
  itemId: string
): Promise<ActionResult & { item?: FoodLensDetectedItem }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const owned = await requireOwnedItem(ctx.supabase, ctx.userId, itemId);
  if (!owned) return { error: 'Item not found.' };

  const ok = await updateFoodLensDetectedItemStatus(ctx.supabase, itemId, 'confirmed');
  if (!ok) return { error: 'Could not confirm item.' };
  return { item: { ...owned.item, status: 'confirmed' } };
}

export async function rejectDetectedItemAction(
  itemId: string
): Promise<ActionResult & { item?: FoodLensDetectedItem }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const owned = await requireOwnedItem(ctx.supabase, ctx.userId, itemId);
  if (!owned) return { error: 'Item not found.' };

  const ok = await updateFoodLensDetectedItemStatus(ctx.supabase, itemId, 'rejected');
  if (!ok) return { error: 'Could not reject item.' };

  await insertFoodLensCorrection(ctx.supabase, {
    memberId: ctx.userId,
    detectedItemId: itemId,
    correctionType: 'item_removed',
    originalValue: { label: owned.item.label, category: owned.item.category },
    correctedValue: { status: 'rejected' },
  });

  return { item: { ...owned.item, status: 'rejected' } };
}

export type CorrectDetectedItemInput = {
  itemId: string;
  correctedLabel?: string;
  correctedCategory?: FoodLensFoodCategory;
  correctedPortionDescription?: string | null;
  correctedQuantity?: number | null;
  correctedUnit?: FoodLensDetectedItem['unit'];
  correctedCookingMethod?: FoodLensDetectedItem['cooking_method'];
  correctedIsCondiment?: boolean;
};

/** Never mutates the AI's original detection in place — supersedes it with a new row, so what the model actually said stays inspectable (doc 4 §4.3). Covers label/category (Phase 1) as well as portion/cooking-method/condiment corrections (Meal Photo Intelligence 2.0, Part 2). */
export async function correctDetectedItemAction(
  input: CorrectDetectedItemInput
): Promise<ActionResult & { newItem?: FoodLensDetectedItem }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const owned = await requireOwnedItem(ctx.supabase, ctx.userId, input.itemId);
  if (!owned) return { error: 'Item not found.' };

  const hasChange =
    input.correctedLabel !== undefined ||
    input.correctedCategory !== undefined ||
    input.correctedPortionDescription !== undefined ||
    input.correctedQuantity !== undefined ||
    input.correctedUnit !== undefined ||
    input.correctedCookingMethod !== undefined ||
    input.correctedIsCondiment !== undefined;
  if (!hasChange) return { error: 'No change provided.' };

  const newLabel = input.correctedLabel ?? owned.item.label;
  const newCategory = input.correctedCategory ?? owned.item.category;
  const newPortionDescription =
    input.correctedPortionDescription !== undefined
      ? input.correctedPortionDescription
      : owned.item.portion_description;
  const newQuantity =
    input.correctedQuantity !== undefined ? input.correctedQuantity : owned.item.quantity;
  const newUnit = input.correctedUnit !== undefined ? input.correctedUnit : owned.item.unit;
  const newCookingMethod =
    input.correctedCookingMethod !== undefined
      ? input.correctedCookingMethod
      : owned.item.cooking_method;
  const newIsCondiment = input.correctedIsCondiment ?? owned.item.is_condiment;

  const newItem = await insertFoodLensDetectedItem(ctx.supabase, {
    scanId: owned.item.scan_id,
    label: newLabel,
    category: newCategory,
    confidence: 1,
    source: 'member_corrected',
    supersedesId: owned.item.id,
    portionDescription: newPortionDescription,
    portionConfidence:
      input.correctedPortionDescription !== undefined || input.correctedQuantity !== undefined
        ? 1
        : owned.item.portion_confidence,
    quantity: newQuantity,
    unit: newUnit,
    cookingMethod: newCookingMethod,
    isCondiment: newIsCondiment,
  });
  if (!newItem) return { error: 'Could not save correction.' };

  // The gram estimate belongs to the item, and a correction supersedes the
  // item with a new row. Without this the estimate would be orphaned on the
  // superseded row and the corrected food would silently become
  // "not estimated" (and drop out of the meal total) just because she fixed
  // its name. Carried forward, and scaled when, and only when, she actually
  // changed the amount: 2 pieces corrected to 4 is twice the food, so it is
  // twice the grams. A label or cooking-method fix changes no amount and
  // scales nothing.
  const previousGrams = (await getLatestItemMacroEstimatesByItemId(
    ctx.supabase,
    owned.item.scan_id
  )).get(owned.item.id);
  if (previousGrams) {
    const oldQuantity = owned.item.quantity;
    const quantityRatio =
      oldQuantity !== null &&
      oldQuantity > 0 &&
      newQuantity !== null &&
      newQuantity > 0 &&
      newQuantity !== oldQuantity
        ? newQuantity / oldQuantity
        : 1;
    const carried = scaleMacroGrams(
      {
        proteinG: previousGrams.protein_g,
        carbG: previousGrams.carb_g,
        fatG: previousGrams.fat_g,
      },
      quantityRatio
    );
    await insertFoodLensItemMacroEstimate(ctx.supabase, {
      scanId: owned.item.scan_id,
      detectedItemId: newItem.id,
      proteinG: carried.proteinG,
      carbG: carried.carbG,
      fatG: carried.fatG,
      portionDescription: newPortionDescription,
      basis: quantityRatio === 1 ? previousGrams.basis : 'member_adjusted',
    });
  }

  await updateFoodLensDetectedItemStatus(ctx.supabase, owned.item.id, 'superseded');

  const correctionType = input.correctedLabel
    ? 'label_fixed'
    : input.correctedCategory
      ? 'category_fixed'
      : input.correctedCookingMethod !== undefined
        ? 'cooking_method_set'
        : 'portion_adjusted';

  await insertFoodLensCorrection(ctx.supabase, {
    memberId: ctx.userId,
    detectedItemId: owned.item.id,
    correctionType,
    originalValue: {
      label: owned.item.label,
      category: owned.item.category,
      portionDescription: owned.item.portion_description,
      quantity: owned.item.quantity,
      unit: owned.item.unit,
      cookingMethod: owned.item.cooking_method,
      isCondiment: owned.item.is_condiment,
    },
    correctedValue: {
      label: newLabel,
      category: newCategory,
      portionDescription: newPortionDescription,
      quantity: newQuantity,
      unit: newUnit,
      cookingMethod: newCookingMethod,
      isCondiment: newIsCondiment,
    },
  });

  return { newItem };
}

export type AddManualFoodItemInput = {
  scanId: string;
  label: string;
  category: FoodLensFoodCategory;
};

export async function addManualFoodItemAction(
  input: AddManualFoodItemInput
): Promise<ActionResult & { item?: FoodLensDetectedItem }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  const scan = await getFoodLensScan(supabase, input.scanId);
  if (!scan || scan.member_id !== userId) return { error: 'Scan not found.' };

  const item = await insertFoodLensDetectedItem(supabase, {
    scanId: input.scanId,
    label: input.label,
    category: input.category,
    confidence: 1,
    source: 'member_added',
    status: 'confirmed',
  });
  if (!item) return { error: 'Could not add item.' };

  await insertFoodLensCorrection(supabase, {
    memberId: userId,
    detectedItemId: item.id,
    correctionType: 'item_added',
    originalValue: {},
    correctedValue: { label: input.label, category: input.category },
  });

  return { item };
}

export type RecomputeFoodLensResult = {
  macroEstimate?: FoodLensMacroEstimate;
  comparison?: FoodLensPatternComparison | undefined;
  mealQuality?: FoodLensMealQualityRating | undefined;
  error?: string;
};

/**
 * Recomputes the macro estimate and comparison signals from the current
 * confirmed items — deterministic, no vision-provider call. The coaching
 * sentence IS regenerated (one LLM call, not per-keystroke — this runs
 * once per correction batch when the member is done editing), since the
 * facts underneath it changed and stale coaching copy would contradict the
 * member's own correction. See lib/food-lens/coachingNarrative.ts.
 *
 * Meal Quality is also recomputed (still no new vision call): the
 * qualitative signals it needs (nutrient density, added sugar, processing
 * level) came from the original photo, not from which items the member
 * later confirmed, so this reuses the scan's most recently stored signals
 * and re-derives the rating against the corrected macro estimate. A scan
 * analyzed before this rating existed simply has none to reuse, and
 * recompute leaves it that way rather than fabricating one.
 */
export async function recomputeFoodLensResultAction(
  scanId: string
): Promise<RecomputeFoodLensResult> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  const scan = await getFoodLensScan(supabase, scanId);
  if (!scan || scan.member_id !== userId) return { error: 'Scan not found.' };

  const items = await listCurrentFoodLensDetectedItems(supabase, scanId);
  const confirmedOrAdded = items.filter((i) => i.status === 'confirmed');
  if (confirmedOrAdded.length === 0) {
    return { error: 'Confirm at least one item before recomputing.' };
  }

  const derived = deriveMacroEstimateFromItems(confirmedOrAdded);
  // The meal total is recomputed from the items that are actually in the
  // meal now, never carried over from the previous version. Removing a food
  // has to move the total, and this is the only place that arithmetic
  // happens.
  const gramsByItem = await getLatestItemMacroEstimatesByItemId(supabase, scanId);
  const mealGrams = sumMacroGrams(
    confirmedOrAdded.map((item) => {
      const estimate = gramsByItem.get(item.id);
      return {
        proteinG: estimate?.protein_g ?? null,
        carbG: estimate?.carb_g ?? null,
        fatG: estimate?.fat_g ?? null,
      };
    })
  );
  const macroEstimate = await insertFoodLensMacroEstimate(supabase, {
    scanId,
    proteinLevel: derived.protein.level,
    carbLevel: derived.carb.level,
    fatLevel: derived.fat.level,
    proteinConfidence: derived.protein.confidence,
    carbConfidence: derived.carb.confidence,
    fatConfidence: derived.fat.confidence,
    overallConfidence: overallConfidenceFor(derived),
    proteinG: mealGrams.proteinG,
    carbG: mealGrams.carbG,
    fatG: mealGrams.fatG,
    basis: 'member_adjusted',
  });
  if (!macroEstimate) return { error: 'Could not save recomputed estimate.' };

  const target = scan.primal_pattern_profile_id
    ? await getActivePrimalPatternProfile(supabase, userId)
    : null;

  const comparison = target
    ? await runComparisonAndNarrative(
        supabase,
        userId,
        scanId,
        confirmedOrAdded,
        derived,
        macroEstimate.id,
        target
      )
    : undefined;

  const previousRating = await getLatestFoodLensMealQualityRating(supabase, scanId);
  const mealQuality = previousRating
    ? await computeAndStoreMealQuality(
        supabase,
        scanId,
        macroEstimate.id,
        {
          nutrientDensity: previousRating.nutrient_density,
          addedSugarLevel: previousRating.added_sugar_level,
          processingLevel: previousRating.processing_level,
          hasMeaningfulProtein: previousRating.has_meaningful_protein,
          hasMeaningfulFiber: previousRating.has_meaningful_fiber,
          hasHealthyFat: previousRating.has_healthy_fat,
          isBeverage: previousRating.is_beverage,
          confidence: previousRating.confidence,
        },
        derived,
        comparison?.signals ?? null,
        primaryMealSubjectLabel(
          confirmedOrAdded.map((i) => ({ label: i.label, isCondiment: i.is_condiment }))
        )
      )
    : undefined;

  await updateFoodLensScan(supabase, scanId, { status: 'member_reviewed' });

  return { macroEstimate, comparison, mealQuality };
}

// ---- Primal Pattern target (read-only from Food Lens's side; phase 1 manual-entry write) ----

export async function getActivePrimalPatternProfileAction(): Promise<PrimalPatternProfile | null> {
  const ctx = await requireMember();
  if (!ctx) return null;
  return getActivePrimalPatternProfile(ctx.supabase, ctx.userId);
}

export type SetManualPrimalPatternProfileInput = {
  patternLabel: string;
  proteinEmphasis: PrimalPatternProfile['protein_emphasis'];
  carbEmphasis: PrimalPatternProfile['carb_emphasis'];
  fatEmphasis: PrimalPatternProfile['fat_emphasis'];
};

/**
 * Phase 1 manual-entry placeholder (doc 6 phase 1) — no Primal Pattern
 * questionnaire scoring engine exists in this codebase yet (doc 5 §5.1).
 * This unblocks Food Lens end-to-end; swapping in the real questionnaire
 * later means removing this form, not changing any Food Lens code (doc 5's
 * contract seam).
 */
export async function setManualPrimalPatternProfileAction(
  input: SetManualPrimalPatternProfileInput
): Promise<ActionResult & { profile?: PrimalPatternProfile }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };

  const profile = await setManualPrimalPatternProfile(ctx.supabase, ctx.userId, input);
  if (!profile) return { error: 'Could not save your pattern.' };
  return { profile };
}

// ---- Food log (meal-photo scans) ----

/** One item as the member left it on the result screen: how many of the portion Root estimated she says she ate, and whether it is still in the meal at all. */
export type MealItemAdjustment = {
  detectedItemId: string;
  /** Multiplier against the portion Root estimated, which is one serving. 1 means "the amount Root saw". */
  servings: number;
};

/**
 * Logs a meal-photo scan to the food log, one member_food_log row per
 * item, and this is the single confirm step that makes a photo's gram
 * estimates count (Phase 2).
 *
 * CONFIRM TO COUNT. Nothing a photo produced reaches the ledger until this
 * runs. Before it, the scan shows its estimates and contributes exactly
 * zero to the day; after it, each row carries the per-serving grams the
 * member accepted. There is no other writer, so "she never confirmed it"
 * and "it counted anyway" cannot both be true.
 *
 * WITH ADJUSTMENTS (the result screen's confirm control) the caller sends
 * the items she kept and the serving multiplier she set for each, and this
 * confirms any of those still pending: tapping the one confirm button is
 * her saying the meal is right, so she is not asked to tick every food
 * first. WITHOUT adjustments this behaves exactly as it always has, logging
 * whatever is already confirmed, which is what the older scans on her
 * history still need.
 *
 * The gram figures written here are PER SERVING, matching
 * product_nutrients.protein_g, so the ledger applies one rule to every lane
 * and a later servings edit rescales protein, carbohydrate and fat together.
 */
export async function logMealScanToFoodLogAction(
  scanId: string,
  input: {
    mealCategory: MealCategory;
    consumedAt: string;
    adjustments?: MealItemAdjustment[];
  }
): Promise<ActionResult & { entriesCreated?: number; proteinGrams?: number | null }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  const scan = await getFoodLensScan(supabase, scanId);
  if (!scan || scan.member_id !== userId) return { error: 'Scan not found.' };

  const current = await listCurrentFoodLensDetectedItems(supabase, scanId);
  const adjustmentById = new Map(
    (input.adjustments ?? [])
      .filter((a) => Number.isFinite(a.servings) && a.servings > 0)
      .map((a) => [a.detectedItemId, a.servings])
  );
  const usingAdjustments = adjustmentById.size > 0;

  const items = current.filter((i) =>
    usingAdjustments
      ? adjustmentById.has(i.id) && i.status !== 'rejected'
      : i.status === 'confirmed' && !i.is_condiment
  );
  if (items.length === 0) {
    return { error: 'Confirm at least one food before adding this meal to your log.' };
  }

  // Tapping confirm is the confirmation. Any item she kept that was still
  // waiting on a tick becomes confirmed here, so the item list and what
  // she just logged agree on the next render.
  if (usingAdjustments) {
    for (const item of items) {
      if (item.status === 'pending_confirmation') {
        await updateFoodLensDetectedItemStatus(supabase, item.id, 'confirmed');
      }
    }
  }

  const gramsByItem = await getLatestItemMacroEstimatesByItemId(supabase, scanId);

  let created = 0;
  const loggedGrams: MacroGrams[] = [];
  for (const item of items) {
    const servings = adjustmentById.get(item.id) ?? item.quantity ?? 1;
    const estimate = gramsByItem.get(item.id);
    const perServing: MacroGrams = {
      proteinG: estimate?.protein_g ?? null,
      carbG: estimate?.carb_g ?? null,
      fatG: estimate?.fat_g ?? null,
    };
    const entry = await insertFoodLogEntry(supabase, {
      memberId: userId,
      productId: null,
      scanId,
      mealCategory: input.mealCategory,
      servings,
      consumedAt: input.consumedAt,
      manualLabel: item.label,
      // Only a row that actually carries grams is marked as the confirmed
      // photo lane. An older scan with nothing estimated stays exactly what
      // it was, a photo row with no number, rather than being relabelled as
      // a confirmed estimate that contributes zero.
      entrySource:
        perServing.proteinG !== null || perServing.carbG !== null || perServing.fatG !== null
          ? 'photo_estimated'
          : null,
      estimatedProteinG: perServing.proteinG,
      estimatedCarbG: perServing.carbG,
      estimatedFatG: perServing.fatG,
    });
    if (!entry) continue;
    created += 1;
    loggedGrams.push(scaleMacroGrams(perServing, servings));
  }

  if (created === 0) return { error: 'Could not add this meal to your log.' };
  return { entriesCreated: created, proteinGrams: sumMacroGrams(loggedGrams).proteinG };
}
