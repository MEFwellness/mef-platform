'use server';

/**
 * Protein Ledger — member-facing actions for the Today view, its three
 * confirm-before-it-counts entry lanes (barcode scan, search by name,
 * quick add), and the 7-day history. Deliberately reuses the food log that
 * already exists (member_food_log/food_products/product_nutrients,
 * migration 59, lib/food-products/data.ts) rather than a parallel ledger
 * schema — see lib/protein/ledger.ts's header. No rules-engine/Root
 * coaching analysis runs here (analyzeProductScanAction/
 * runProductAnalysisForScan): the ledger only needs a product's protein
 * grams, not a full nutrition-quality review, so it skips that heavier
 * pipeline entirely rather than reuse it wastefully.
 *
 * EVERY LANE, ONE READ. Because it reads member_food_log directly, this
 * ledger sees every way a member can log food in this app, not only the
 * three lanes on the ledger screen itself. The full list, audited:
 *
 *   1. Food Lens barcode scan          -> AddToFoodLogSheet -> addFoodLogEntryAction
 *   2. Food Lens Nutrition Facts label -> same result screen, same action
 *   3. Food Lens search by name        -> same result screen, same action
 *   4. Food Lens manual entry          -> same result screen, same action
 *   5. Food Lens meal photo            -> logMealScanToFoodLogAction
 *   6. Saved meal repeat               -> repeatSavedMealAction
 *   7. Duplicate a previous entry      -> duplicateFoodLogEntryAction
 *   8. Ledger barcode lane             -> logProteinLedgerEntryAction
 *   9. Ledger search lane              -> logProteinLedgerEntryAction
 *  10. Ledger quick add                -> quickAddProteinLedgerEntryAction
 *
 * All ten write one member_food_log row per logged item, so one logged
 * meal is one ledger contribution and nothing needs deduplicating. Lanes
 * 1 through 4 and 6 through 10 carry real per-serving protein grams and
 * count. Lane 5 carries no gram data anywhere in this application (the
 * vision provider returns a relative Low/Moderate/High read, never grams)
 * so it contributes zero, and is shown with that relative read rather than
 * a fabricated number.
 */

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';
import type { FoodLensMealMacroLevel, MemberFoodLogEntry } from '@mef/shared-types-contracts';
import {
  findCachedFoodProduct,
  getFoodProductWithDetails,
  insertFoodLogEntry,
  insertVerifiedFoodProductFromLabelScan,
  upsertFoodProductFromProvider,
} from '@/lib/food-products/data';
import {
  getFoodProductProvider,
  resolveFoodProductProviderChain,
} from '@/lib/food-products/providers/registry';
import { validateBarcode } from '@/lib/food-products/barcode';
import { todaysLocalDate, localDateStringFor } from '@/lib/time/localDate';
import {
  buildDailyTotals,
  buildLedgerEntries,
  lastNLocalDates,
  roundGrams,
  sumProteinGrams,
  type DailyProteinTotal,
  type LedgerEntryWithProtein,
  type LedgerProductFacts,
} from '@/lib/protein/ledger';
import { getMyProteinSetupState, type ProteinSetupState } from './protein';

const HISTORY_DAYS = 7;

async function requireMember(): Promise<{
  supabase: ReturnType<typeof createClient>;
  memberId: string;
} | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, memberId: user.id };
}

async function memberTimezone(
  supabase: ReturnType<typeof createClient>,
  memberId: string
): Promise<string> {
  const { data } = await supabase.from('profiles').select('timezone').eq('id', memberId).single();
  return data?.timezone ?? 'America/New_York';
}

/**
 * Every food log entry in [startLocalDate, endLocalDate) from every lane,
 * each tagged with its own protein grams and which local date it belongs
 * to.
 *
 * No lane filter. This used to exclude `product_id is null`, which meant a
 * member could photograph a meal, confirm every food in it, add it to her
 * log, and find her protein ledger showing nothing at all — not a zero
 * against a logged meal, but no trace that she had logged anything. Those
 * rows are read now. They still contribute no grams (there are none to
 * contribute) and carry Root's relative protein read instead, so the day's
 * list and the 7-day history reflect what she actually did.
 */
async function listProteinEntriesForLocalDateRange(
  supabase: ReturnType<typeof createClient>,
  memberId: string,
  timezone: string,
  startLocalDate: string,
  endLocalDateExclusive: string
): Promise<Array<LedgerEntryWithProtein & { localDate: string }>> {
  // A generous ±1 day buffer around the target range at the Postgres query
  // level — real-world UTC offsets run from -12 to +14, so a day on each
  // side always over-includes rather than risking excluding a row the
  // member's timezone would actually place inside the range. The exact
  // boundary is decided below by each entry's real local date, not by this
  // query, so a wide net here can never miscount — only under-fetch would.
  const bufferedStart = new Date(`${startLocalDate}T00:00:00.000Z`);
  bufferedStart.setUTCDate(bufferedStart.getUTCDate() - 1);
  const bufferedEnd = new Date(`${endLocalDateExclusive}T00:00:00.000Z`);
  bufferedEnd.setUTCDate(bufferedEnd.getUTCDate() + 1);

  const { data, error } = await supabase
    .from('member_food_log')
    .select('*')
    .eq('member_id', memberId)
    .gte('consumed_at', bufferedStart.toISOString())
    .lt('consumed_at', bufferedEnd.toISOString())
    .order('consumed_at', { ascending: true });
  if (error) {
    console.error('listProteinEntriesForLocalDateRange failed', error);
    return [];
  }

  const entries = (data as MemberFoodLogEntry[]).filter((e) => {
    const localDate = localDateStringFor(e.consumed_at, timezone);
    return localDate >= startLocalDate && localDate < endLocalDateExclusive;
  });
  if (entries.length === 0) return [];

  const productIds = [...new Set(entries.map((e) => e.product_id).filter((id): id is string => id !== null))];
  // Only the meal-photo rows need a macro estimate looked up, and only
  // those rows: a product-linked entry has real grams and never falls back
  // to a relative read.
  const estimateScanIds = [
    ...new Set(
      entries
        .filter((e) => e.product_id === null && e.scan_id !== null)
        .map((e) => e.scan_id as string)
    ),
  ];

  const [{ data: products }, { data: nutrients }, { data: estimates }] = await Promise.all([
    productIds.length > 0
      ? supabase.from('food_products').select('id, name, barcode, data_source').in('id', productIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    productIds.length > 0
      ? supabase.from('product_nutrients').select('product_id, protein_g').in('product_id', productIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    estimateScanIds.length > 0
      ? supabase
          .from('food_lens_macro_estimates')
          .select('scan_id, protein_level, created_at')
          .in('scan_id', estimateScanIds)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);

  const productById = new Map<string, LedgerProductFacts>(
    (products ?? []).map((p) => [
      p.id as string,
      { name: p.name as string | null, barcode: p.barcode as string | null, dataSource: p.data_source as string | null },
    ])
  );
  const proteinById = new Map(
    (nutrients ?? []).map((n) => [n.product_id as string, n.protein_g as number | null])
  );
  // Ordered oldest first above, so the last write for a scan wins — the
  // same "latest estimate" rule getLatestFoodLensMacroEstimate applies,
  // held here for a whole batch of scans instead of one query per row.
  const proteinLevelByScanId = new Map(
    (estimates ?? []).map((e) => [
      e.scan_id as string,
      e.protein_level as FoodLensMealMacroLevel | null,
    ])
  );

  return buildLedgerEntries({
    rows: entries,
    productById,
    proteinPerServingByProductId: proteinById,
    proteinLevelByScanId,
    localDateFor: (consumedAt) => localDateStringFor(consumedAt, timezone),
  });
}

// ---- Today view ----

export type ProteinLedgerToday = {
  targetState: ProteinSetupState | null;
  totalGrams: number;
  entries: LedgerEntryWithProtein[];
};

export async function getProteinLedgerTodayAction(): Promise<ProteinLedgerToday | null> {
  const ctx = await requireMember();
  if (!ctx) return null;
  const { supabase, memberId } = ctx;

  const [targetState, timezone] = await Promise.all([
    getMyProteinSetupState(),
    memberTimezone(supabase, memberId),
  ]);
  const today = todaysLocalDate(timezone);

  const entries = await listProteinEntriesForLocalDateRange(
    supabase,
    memberId,
    timezone,
    today,
    dateAfter(today)
  );

  return {
    targetState,
    totalGrams: roundGrams(sumProteinGrams(entries)),
    entries,
  };
}

function dateAfter(localDate: string): string {
  const d = new Date(`${localDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ---- 7-day history ----

export async function getProteinLedgerHistoryAction(): Promise<DailyProteinTotal[]> {
  const ctx = await requireMember();
  if (!ctx) return [];
  const { supabase, memberId } = ctx;

  const timezone = await memberTimezone(supabase, memberId);
  const today = todaysLocalDate(timezone);
  const dates = lastNLocalDates(today, HISTORY_DAYS);

  const entries = await listProteinEntriesForLocalDateRange(
    supabase,
    memberId,
    timezone,
    dates[0]!,
    dateAfter(today)
  );

  return buildDailyTotals(dates, entries).map((d) => ({
    ...d,
    totalGrams: roundGrams(d.totalGrams),
  }));
}

// ---- Search lane: resolve a picked result (cached productId or external barcode) to product+nutrients, no scan/analysis ----

export type LedgerProductPreview = {
  productId: string;
  name: string | null;
  brand: string | null;
  servingSizeText: string | null;
  proteinGPerServing: number | null;
};

export type ResolveLedgerProductInput = { productId: string } | { barcode: string };

export async function resolveLedgerProductAction(
  input: ResolveLedgerProductInput
): Promise<{ product?: LedgerProductPreview; error?: string }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const { supabase } = ctx;

  let details = null;
  if ('productId' in input) {
    details = await getFoodProductWithDetails(supabase, input.productId);
  } else {
    const validation = validateBarcode(input.barcode);
    const barcode = validation.valid ? validation.normalized : input.barcode;

    details = await findCachedFoodProduct(supabase, barcode);
    if (!details) {
      for (const providerName of resolveFoodProductProviderChain()) {
        try {
          const provider = getFoodProductProvider(providerName);
          const normalized = await provider.lookupByBarcode(barcode);
          if (!normalized) continue;
          if (validation.valid) normalized.barcodeType = validation.type;
          details = await upsertFoodProductFromProvider(supabase, normalized);
          if (details) break;
        } catch (err) {
          console.error('resolveLedgerProductAction: provider lookup failed', err);
        }
      }
    }
  }

  if (!details) return { error: 'Could not find this product.' };

  return {
    product: {
      productId: details.product.id,
      name: details.product.name,
      brand: details.product.brand,
      servingSizeText: details.product.serving_size_text,
      proteinGPerServing: details.nutrients?.protein_g ?? null,
    },
  };
}

// ---- Logging (the only place an entry is ever created — always after explicit member confirmation) ----

export async function logProteinLedgerEntryAction(input: {
  productId: string;
  servings: number;
  scanId?: string;
}): Promise<ActionResult & { entry?: MemberFoodLogEntry }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  if (!Number.isFinite(input.servings) || input.servings <= 0) {
    return { error: 'Enter a serving amount greater than zero.' };
  }

  const entry = await insertFoodLogEntry(ctx.supabase, {
    memberId: ctx.memberId,
    productId: input.productId,
    scanId: input.scanId ?? null,
    mealCategory: 'snack',
    servings: input.servings,
    consumedAt: new Date().toISOString(),
  });
  if (!entry) return { error: 'Could not log this entry.' };
  return { entry };
}

/**
 * Quick add — grams entered directly, name optional. Reuses the exact same
 * private-product path Food Lens's manual entry already uses
 * (insertVerifiedFoodProductFromLabelScan, data_source = 'mef_verified',
 * barcode null) with every field left null except protein: no estimates,
 * just the one number the member typed. Each quick add gets its own
 * private product row (never shared/deduped, matching manual entry's
 * existing convention), then logs it exactly like any other entry.
 */
export async function quickAddProteinLedgerEntryAction(input: {
  grams: number;
  name?: string;
}): Promise<ActionResult & { entry?: MemberFoodLogEntry }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  if (!Number.isFinite(input.grams) || input.grams <= 0) {
    return { error: 'Enter the grams of protein.' };
  }

  const name = input.name?.trim() || null;
  const product = await insertVerifiedFoodProductFromLabelScan(ctx.supabase, {
    productName: name,
    brand: null,
    servingSizeText: null,
    nutrients: {
      calories: null,
      proteinG: input.grams,
      totalCarbohydrateG: null,
      fiberG: null,
      totalSugarG: null,
      addedSugarG: null,
      totalFatG: null,
      saturatedFatG: null,
      monounsaturatedFatG: null,
      polyunsaturatedFatG: null,
      transFatG: null,
      sodiumMg: null,
      potassiumMg: null,
    },
    ingredientsText: null,
    allergensText: null,
    dataCompleteness: 'minimal',
  });
  if (!product) return { error: 'Could not save this entry.' };

  const entry = await insertFoodLogEntry(ctx.supabase, {
    memberId: ctx.memberId,
    productId: product.product.id,
    mealCategory: 'snack',
    servings: 1,
    consumedAt: new Date().toISOString(),
    manualLabel: name,
  });
  if (!entry) return { error: 'Could not log this entry.' };
  return { entry };
}
