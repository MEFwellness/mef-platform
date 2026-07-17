/**
 * Meal/Food History Intelligence (Part 5) — the 30-day pattern view.
 * The 7-day view already exists as the Weekly Nutrition Report (Part 11,
 * lib/food-lens/weeklyReport.ts); this reuses the exact same input shapes
 * (WeeklyReportLogEntry/WeeklyReportMealQualityRating/WeeklyReportDetectedItem)
 * over a 30-day window rather than inventing a second data model, and
 * applies a higher minimum-data bar appropriate to a longer, lower-noise
 * claim ("over the past month" is a bigger claim than "this week").
 *
 * Pure and deterministic, same reasons as weeklyReport.ts: unit-testable,
 * two different 30-day windows of synthetic data must produce different
 * wording wherever the underlying counts differ. Every sentence hedges
 * ("suggests", "a pattern worth noticing", "based on what was logged") per
 * product requirement §5 — never a diagnostic "you have low X."
 */

import type {
  WeeklyReportDetectedItem,
  WeeklyReportLogEntry,
  WeeklyReportMealQualityRating,
} from './weeklyReport';

export const MIN_DISTINCT_DAYS_FOR_HISTORY = 8;
export const MIN_TOTAL_ENTRIES_FOR_HISTORY = 12;

export const INSUFFICIENT_HISTORY_MESSAGE =
  'Your data may be incomplete if meals were not logged — there is not yet enough logged history over this period for a reliable pattern read. Keep logging and Root will have more to share here soon.';

const MEANINGFUL_FIBER_G = 3;
const HIGH_ADDED_SUGAR_G = 10;

export interface HistoryPatternsInput {
  windowDays: 7 | 30;
  logEntries: WeeklyReportLogEntry[];
  mealQualityRatings: WeeklyReportMealQualityRating[];
  detectedItems: WeeklyReportDetectedItem[];
}

export type HistoryPatternsResult =
  | { insufficientData: true; message: string }
  | { insufficientData: false; observations: string[]; daysLogged: number; totalEntries: number };

function uniq<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function computeHistoryPatterns(input: HistoryPatternsInput): HistoryPatternsResult {
  const distinctDays = uniq([
    ...input.logEntries.map((e) => e.localDate),
    ...input.mealQualityRatings.map((r) => r.localDate),
  ]).length;
  const totalEntries = input.logEntries.length + input.mealQualityRatings.length;

  if (distinctDays < MIN_DISTINCT_DAYS_FOR_HISTORY || totalEntries < MIN_TOTAL_ENTRIES_FOR_HISTORY) {
    return { insufficientData: true, message: INSUFFICIENT_HISTORY_MESSAGE };
  }

  const observations: string[] = [];
  const periodLabel = input.windowDays === 30 ? 'past 30 days' : 'past 7 days';

  // Protein consistency
  const proteinDays = uniq(
    [
      ...input.logEntries.filter((e) => e.packagedFoodSignal?.isMeaningfulProtein).map((e) => e.localDate),
      ...input.mealQualityRatings.filter((r) => r.hasMeaningfulProtein).map((r) => r.localDate),
    ]
  ).length;
  const proteinRatio = distinctDays > 0 ? proteinDays / distinctDays : 0;
  if (proteinRatio >= 0.7) {
    observations.push(`Based on what was logged, protein has shown up consistently across your ${periodLabel}.`);
  } else if (proteinRatio > 0 && proteinRatio < 0.4) {
    observations.push(
      `Your recent meals suggest protein appeared on fewer days than not over the ${periodLabel} — worth keeping an eye on if that's not intentional.`
    );
  }

  // Fiber-supportive meals
  const fiberDays = uniq(
    [
      ...input.logEntries.filter((e) => (e.packagedFoodSignal?.fiberG ?? 0) >= MEANINGFUL_FIBER_G).map((e) => e.localDate),
      ...input.mealQualityRatings.filter((r) => r.hasMeaningfulFiber).map((r) => r.localDate),
    ]
  ).length;
  if (fiberDays > 0 && fiberDays / distinctDays < 0.35) {
    observations.push(`A pattern worth noticing: fiber-supportive foods appeared on relatively few logged days over the ${periodLabel}.`);
  }

  // Added sugar frequency
  const highSugarCount =
    input.logEntries.filter((e) => (e.packagedFoodSignal?.addedSugarG ?? 0) >= HIGH_ADDED_SUGAR_G).length +
    input.mealQualityRatings.filter((r) => r.addedSugarLevel === 'high').length;
  if (highSugarCount >= Math.max(3, Math.round(distinctDays * 0.3))) {
    observations.push(`Higher-added-sugar foods have come up fairly often in what you've logged over the ${periodLabel}.`);
  }

  // Food variety (vegetables/fruit proxy — this schema groups both under the 'vegetable' category)
  const distinctVegetableLabels = uniq(
    input.detectedItems.filter((i) => i.category === 'vegetable').map((i) => i.label.trim().toLowerCase())
  ).length;
  if (distinctVegetableLabels > 0 && distinctVegetableLabels <= 2) {
    observations.push(
      `Your recent meals suggest a fairly narrow range of vegetables and fruit — trying a new one now and then could add variety.`
    );
  } else if (distinctVegetableLabels >= 6) {
    observations.push(`You've logged a good variety of vegetables and fruit over the ${periodLabel}.`);
  }

  // Highly processed food frequency
  const highlyProcessedCount =
    input.logEntries.filter((e) => e.packagedFoodSignal?.processingLabel === 'highly_processed').length +
    input.mealQualityRatings.filter((r) => r.processingLevel === 'ultra_processed').length;
  if (highlyProcessedCount / Math.max(1, totalEntries) >= 0.4) {
    observations.push(`A meaningful share of what's been logged over the ${periodLabel} has been highly processed — something to keep in view, not a verdict on any single meal.`);
  }

  // Repeated foods (recurring meals)
  const labelCounts = new Map<string, number>();
  for (const item of input.detectedItems) {
    const key = item.label.trim().toLowerCase();
    labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1);
  }
  const mostRepeated = [...labelCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (mostRepeated && mostRepeated[1] >= 4) {
    observations.push(`"${mostRepeated[0]}" has come up often in your recent meals — a recurring favorite, based on what was logged.`);
  }

  return { insufficientData: false, observations: observations.slice(0, 6), daysLogged: distinctDays, totalEntries };
}
