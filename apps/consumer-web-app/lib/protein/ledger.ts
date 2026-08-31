/**
 * Protein Ledger — pure grams/rounding/grouping logic. No persistence, no
 * new tables: the ledger is a protein-focused read over the food log that
 * already exists (member_food_log + food_products + product_nutrients,
 * migration 59), the same table every logging lane in this app writes to.
 *
 * ONE LOG, NOT TWO. Because every entry point writes the same
 * member_food_log row — the Food Lens barcode/label/search/manual result
 * screen (AddToFoodLogSheet), the meal-photo "add this meal to my log"
 * action, saved-meal repeats, duplicates, and the ledger's own three
 * lanes — a member never logs a meal twice to get protein credit, and a
 * row can never be counted twice. One row is one contribution, by
 * construction rather than by a deduplication pass.
 *
 * WHAT COUNTS AS GRAMS. Confirmed grams only. A row linked to a product
 * whose product_nutrients row carries protein contributes
 * servings x protein_g. A row with no known protein value contributes
 * nothing and is never silently treated as 0g.
 *
 * PHOTO ESTIMATES, ONCE CONFIRMED. A meal photo now produces gram
 * estimates too (migration 194), and they count on exactly one condition:
 * the member saw them, adjusted or removed what she wanted, and tapped
 * confirm. Confirming writes member_food_log.estimated_protein_g /
 * estimated_carb_g / estimated_fat_g, PER SERVING, the same per-serving
 * meaning product_nutrients.protein_g has, so one rule covers every lane:
 * a row contributes its per-serving protein times its servings. An
 * unconfirmed scan writes no row at all and therefore contributes nothing.
 *
 * WHAT STILL DOES NOT COUNT. A photo row logged before Phase 2 carries no
 * gram data (it never had any, only the relative Low/Moderate/High read in
 * food_lens_macro_estimates). Those rows are READ so today's list and the
 * 7-day history show the member's complete day, but they contribute zero
 * and are labeled with that relative read instead of a number, which is
 * what they have always meant. They are never back-filled with a guess.
 */

import type { FoodLensMealMacroLevel, MemberFoodLogEntry } from '@mef/shared-types-contracts';
import type { ProteinSetupState } from '@/app/actions/protein';

/** Rounds to the nearest whole gram for display — never shows a raw floating-point artifact like 189.9999999999998. */
export function roundGrams(value: number): number {
  return Math.round(value);
}

export type LedgerProductNutrients = { proteinG: number | null };

/**
 * Grams of protein a single log entry contributes, or null if nothing on
 * the row resolves to a real per-serving value (never invented, a missing
 * value stays missing rather than becoming zero).
 *
 * One rule, both kinds of row. A product-linked entry takes its
 * per-serving grams from product_nutrients; a confirmed photo entry takes
 * them from its own estimated_protein_g column, which holds the same
 * per-serving quantity. Both are then multiplied by servings, so editing
 * servings later behaves identically whichever lane wrote the row.
 */
export function entryProteinGrams(
  entry: Pick<MemberFoodLogEntry, 'servings'> & { estimated_protein_g?: number | null },
  nutrients: LedgerProductNutrients | null
): number | null {
  const perServing = nutrients?.proteinG ?? entry.estimated_protein_g ?? null;
  if (perServing === null) return null;
  return perServing * entry.servings;
}

/**
 * Which lane an entry came from.
 *
 * 'photo_estimated' is a confirmed Phase 2 photo meal: gram estimates the
 * member reviewed, which count. 'meal_photo' is a photo meal logged before
 * gram estimates existed: no grams anywhere on the row, so it shows Root's
 * relative read and contributes nothing. Keeping them as two values is the
 * point, since they say different things to the member.
 */
export type LedgerEntrySource =
  | 'scan'
  | 'search'
  | 'quick_add'
  | 'meal_photo'
  | 'photo_estimated';

export type LedgerEntryWithProtein = MemberFoodLogEntry & {
  proteinGrams: number | null;
  /**
   * The confirmed carbohydrate and fat grams on this entry, scaled by its
   * servings the same way protein is. Information only: no target, no
   * progress bar, no judgment is attached to either anywhere in this app.
   */
  carbGrams: number | null;
  fatGrams: number | null;
  productName: string | null;
  source: LedgerEntrySource;
  /**
   * Root's relative protein read for a meal-photo entry, the only protein
   * information that exists for one. Always null for a product-linked
   * entry, which has real grams instead. Never converted to grams: a
   * relative level is not a measurement.
   */
  estimatedProteinLevel: FoodLensMealMacroLevel | null;
};

/**
 * The explicit column first, then the old inference.
 *
 * member_food_log.entry_source (migration 194) is the writing lane's own
 * answer and always wins. Only the photo lane sets it today, because only
 * the photo lane has two kinds of row that look identical otherwise: a
 * confirmed Phase 2 meal that carries grams, and a pre-Phase-2 meal that
 * never did. Every other lane stays inferable from the row's own shape,
 * exactly as before, so no back-fill of old rows is required for any of
 * this to be correct.
 *
 * The inference, unchanged: a row with no linked product is a meal photo
 * (the only writer that leaves product_id null is
 * logMealScanToFoodLogAction, one row per confirmed item in the photo). A
 * scan always creates a food_lens_scans row first (scan_id set); a quick
 * add's product is always private (data_source 'mef_verified', barcode
 * null, per insertVerifiedFoodProductFromLabelScan); anything else
 * product-linked came from search (or from Food Lens's own barcode/label/
 * manual flows elsewhere in the app, which share this same table by
 * design — see this module's header).
 */
export function resolveEntrySource(entry: {
  productId?: string | null;
  scanId: string | null;
  productBarcode: string | null;
  productDataSource: string | null;
  /** The explicit column (migration 194), when the writing lane set one. Always wins over the inference below, which exists only for rows written before that column did. */
  entrySource?: MemberFoodLogEntry['entry_source'];
}): LedgerEntrySource {
  if (entry.entrySource === 'photo_estimated') return 'photo_estimated';
  if (entry.productId === null) return 'meal_photo';
  if (entry.scanId) return 'scan';
  if (entry.productDataSource === 'mef_verified' && entry.productBarcode === null) {
    return 'quick_add';
  }
  return 'search';
}

export type LedgerProductFacts = {
  name: string | null;
  barcode: string | null;
  dataSource: string | null;
};

/**
 * Turns raw member_food_log rows into ledger entries. Pure, so the rule
 * that decides what counts is testable without a database or a Next.js
 * request scope, and so there is exactly one copy of it: the server action
 * fetches, this decides.
 *
 * Every row in, every row out, in the same order. Nothing is filtered by
 * lane here or anywhere upstream, which is what makes "one logged meal is
 * one ledger contribution" true by construction: the row either resolves
 * to grams or it does not, and it is present either way.
 */
export function buildLedgerEntries<T extends MemberFoodLogEntry>(input: {
  rows: T[];
  productById: Map<string, LedgerProductFacts>;
  proteinPerServingByProductId: Map<string, number | null>;
  proteinLevelByScanId: Map<string, FoodLensMealMacroLevel | null>;
  localDateFor: (consumedAt: string) => string;
}): Array<LedgerEntryWithProtein & { localDate: string }> {
  return input.rows.map((row) => {
    const product = row.product_id ? (input.productById.get(row.product_id) ?? null) : null;
    const proteinPerServing = row.product_id
      ? (input.proteinPerServingByProductId.get(row.product_id) ?? null)
      : null;
    const source = resolveEntrySource({
      productId: row.product_id,
      scanId: row.scan_id,
      productBarcode: product?.barcode ?? null,
      productDataSource: product?.dataSource ?? null,
      entrySource: row.entry_source,
    });
    return {
      ...row,
      productName: product?.name ?? row.manual_label ?? null,
      proteinGrams: entryProteinGrams(row, { proteinG: proteinPerServing }),
      carbGrams: row.estimated_carb_g === null ? null : row.estimated_carb_g * row.servings,
      fatGrams: row.estimated_fat_g === null ? null : row.estimated_fat_g * row.servings,
      source,
      estimatedProteinLevel:
        source === 'meal_photo' && row.scan_id
          ? (input.proteinLevelByScanId.get(row.scan_id) ?? null)
          : null,
      localDate: input.localDateFor(row.consumed_at),
    };
  });
}

/** Sum of every entry's protein grams, ignoring entries with no known value — an unresolved entry should never silently count as 0g. */
export function sumProteinGrams(entries: Array<{ proteinGrams: number | null }>): number {
  return entries.reduce((total, e) => total + (e.proteinGrams ?? 0), 0);
}

export type DailyProteinTotal = { localDate: string; totalGrams: number };

/** Groups entries (already tagged with the local date they belong to) into one total per day, for the 7-day history view. Days with no entries still appear at 0g — a blank day is a real fact, not a rendering gap. */
export function buildDailyTotals(
  localDates: string[],
  entries: Array<{ localDate: string; proteinGrams: number | null }>
): DailyProteinTotal[] {
  const byDate = new Map<string, number>();
  for (const date of localDates) byDate.set(date, 0);
  for (const entry of entries) {
    if (!byDate.has(entry.localDate)) continue;
    byDate.set(entry.localDate, (byDate.get(entry.localDate) ?? 0) + (entry.proteinGrams ?? 0));
  }
  return localDates.map((localDate) => ({ localDate, totalGrams: byDate.get(localDate) ?? 0 }));
}

export type LedgerTargetDisplay =
  | { mode: 'not_started'; showSetupNudge: true; targetGrams: null }
  | { mode: 'blocked'; showSetupNudge: false; targetGrams: null }
  | { mode: 'pending_review'; showSetupNudge: false; targetGrams: null }
  | {
      mode: 'active';
      showSetupNudge: false;
      targetGrams: number;
      suggestedRange: { low: number; high: number } | null;
    };

/**
 * The single decision point for how the Today view's progress card should
 * render for a given target state — pulled out of the component so the
 * task's two hard rules ("pending review never displays as active" and "a
 * safety-blocked member gets no target nudge") are unit-testable without a
 * browser. showSetupNudge is true in exactly one case: no profile
 * submitted yet at all.
 */
export function resolveLedgerTargetDisplay(state: ProteinSetupState | null): LedgerTargetDisplay {
  if (!state || state.stage === 'not_started') {
    return { mode: 'not_started', showSetupNudge: true, targetGrams: null };
  }
  if (state.stage === 'blocked') {
    return { mode: 'blocked', showSetupNudge: false, targetGrams: null };
  }
  if (state.stage === 'pending_review') {
    return { mode: 'pending_review', showSetupNudge: false, targetGrams: null };
  }
  return {
    mode: 'active',
    showSetupNudge: false,
    targetGrams: state.activeGrams,
    suggestedRange: state.suggestedRange,
  };
}

/**
 * Search-lane race guard — a debounced text search can have more than one
 * request in flight at once (the member pauses long enough for one search
 * to fire, then keeps typing before it resolves), and network timing gives
 * no guarantee they resolve in the order they were sent. A response is only
 * safe to render if BOTH its request id is still the latest one dispatched
 * (no newer search has since started) AND its query still matches what's
 * currently in the box — either condition alone can be satisfied by a
 * stale response in some interleaving; both together can't be.
 */
export function shouldApplySearchResponse(
  response: { requestId: number; query: string },
  current: { latestRequestId: number; query: string }
): boolean {
  return response.requestId === current.latestRequestId && response.query === current.query;
}

/** The last N local dates ending today (today's date is always last), for the history view's date range. */
export function lastNLocalDates(todayLocalDate: string, days: number): string[] {
  const start = new Date(`${todayLocalDate}T00:00:00.000Z`);
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}
