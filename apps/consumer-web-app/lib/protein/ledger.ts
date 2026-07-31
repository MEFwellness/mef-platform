/**
 * Protein Ledger (Phase 1b) — pure grams/rounding/grouping logic. No
 * persistence, no new tables: the ledger is a protein-focused read over
 * the food log that already exists (member_food_log + food_products +
 * product_nutrients, migration 59), the same store barcode/search/manual
 * entries already write to. Deliberately excludes any member_food_log row
 * with product_id null — those are meal-photo AI *estimates*
 * (food_lens_macro_estimates), and this build's rule is confirmed grams
 * only (no estimates).
 */

import type { MemberFoodLogEntry } from '@mef/shared-types-contracts';
import type { ProteinSetupState } from '@/app/actions/protein';

/** Rounds to the nearest whole gram for display — never shows a raw floating-point artifact like 189.9999999999998. */
export function roundGrams(value: number): number {
  return Math.round(value);
}

export type LedgerProductNutrients = { proteinG: number | null };

/** Grams of protein a single log entry contributes, or null if the linked product has no known protein value (never estimated — a missing value stays missing, not zero). */
export function entryProteinGrams(
  entry: Pick<MemberFoodLogEntry, 'servings'>,
  nutrients: LedgerProductNutrients | null
): number | null {
  if (!nutrients || nutrients.proteinG === null) return null;
  return nutrients.proteinG * entry.servings;
}

export type LedgerEntrySource = 'scan' | 'search' | 'quick_add';

export type LedgerEntryWithProtein = MemberFoodLogEntry & {
  proteinGrams: number | null;
  productName: string | null;
  source: LedgerEntrySource;
};

/**
 * Which lane an entry came from, inferred from what's already on the row —
 * no new column needed. A scan always creates a food_lens_scans row first
 * (scan_id set); a quick add's product is always private (data_source
 * 'mef_verified', barcode null, per insertVerifiedFoodProductFromLabelScan);
 * anything else product-linked came from search (or from Food Lens's own
 * barcode/search/manual flows elsewhere in the app, which share this same
 * table by design — see app/actions/protein-ledger.ts's header).
 */
export function resolveEntrySource(entry: {
  scanId: string | null;
  productBarcode: string | null;
  productDataSource: string | null;
}): LedgerEntrySource {
  if (entry.scanId) return 'scan';
  if (entry.productDataSource === 'mef_verified' && entry.productBarcode === null) {
    return 'quick_add';
  }
  return 'search';
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
