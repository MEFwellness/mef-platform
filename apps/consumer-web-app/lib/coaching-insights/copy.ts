/**
 * Coaching Intelligence Engine — reviewed, deterministic copy. Every
 * statement and explanation this engine produces comes from a template
 * filled in with already-computed facts (counts, metrics, dates) — never
 * an LLM call. This is a deliberate departure from Food Lens's own
 * per-scan coaching narrative (lib/food-lens/coachingNarrative.ts), which
 * generates free-form text because it's reacting to one photograph in the
 * moment; this engine is instead asserting a cross-feature *pattern*
 * claim, and the product requirement is explicit and repeated ("never
 * invent," "never guess," "never assume") — the same discipline
 * lib/food-lens/historyPatterns.ts, weeklyReport.ts, and mealQuality.ts
 * already use for this exact kind of aggregate statement. Keeping the
 * wording template-driven, reviewable, and separate from the math that
 * decides *whether* to say anything (lib/coaching-insights/levels.ts) is
 * what makes every statement auditable back to a fixed, approved sentence
 * shape.
 */

import type { ActiveCoachingSourceId } from './types';

const METRIC_LABELS: Record<string, string> = {
  protein: 'protein',
  carb: 'carbohydrate',
  fat: 'fat',
  digestion_rating: 'digestion comfort',
  energy_level: 'energy',
  stress_level: 'stress',
  mood_level: 'mood',
  sleep_quality: 'sleep quality',
  water_cups: 'hydration',
  momentum_state: 'overall momentum',
};

export function metricLabel(metric: string): string {
  return METRIC_LABELS[metric] ?? metric.replace(/_/g, ' ');
}

const SOURCE_LABELS: Record<ActiveCoachingSourceId, string> = {
  daily_checkin: 'Daily Check-ins',
  food_lens: 'Food Lens scans',
  primal_pattern_assessment: 'your Primal Pattern Assessment',
  progress_history: 'your Progress history',
  questionnaire: 'your questionnaire responses',
};

export function sourceLabel(sourceId: ActiveCoachingSourceId): string {
  return SOURCE_LABELS[sourceId];
}

export function sourceLabelList(sourceIds: ActiveCoachingSourceId[]): string {
  const labels = sourceIds.map(sourceLabel);
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

/** Plain-language confidence tier — never the raw 0-1 number, matching this codebase's "never state a numeric percentage or confidence to a member" discipline elsewhere (e.g. lib/food-lens/coachingNarrative.ts). */
export function confidenceWord(confidence: number): string {
  if (confidence >= 0.75) return 'strong';
  if (confidence >= 0.5) return 'moderate';
  return 'limited';
}

export function formatDateRange(from: string, to: string): string {
  const fmt = (d: string) => {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y!, m! - 1, day!).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };
  return from === to ? fmt(from) : `${fmt(from)}–${fmt(to)}`;
}

export function buildExplanation(input: {
  dataSources: ActiveCoachingSourceId[];
  dateRangeFrom: string;
  dateRangeTo: string;
  observationCount: number;
  confidence: number;
}): string {
  const sources = sourceLabelList(input.dataSources);
  const range = formatDateRange(input.dateRangeFrom, input.dateRangeTo);
  const count =
    input.observationCount === 1 ? '1 observation' : `${input.observationCount} observations`;
  return `Based on ${sources} (${range}), from ${count}. Confidence: ${confidenceWord(input.confidence)}.`;
}

// ---- Level 1 — Today's Insight -------------------------------------------------

export function todaysNutritionStatement(metric: string, direction: 'low' | 'high'): string {
  const label = metricLabel(metric);
  return direction === 'low'
    ? `Today's meal read lighter in ${label} than your usual pattern.`
    : `Today's meal read heavier in ${label} than your usual pattern.`;
}

export function todaysCheckinStatement(metric: string, direction: 'low' | 'high'): string {
  const label = metricLabel(metric);
  return `Today you reported relatively ${direction === 'low' ? 'low' : 'high'} ${label}.`;
}

// ---- Level 2 — Recent Pattern / Weekly Observation ------------------------------

export function repeatedNutritionStatement(
  matches: number,
  total: number,
  metric: string,
  direction: 'low' | 'high'
): string {
  const label = metricLabel(metric);
  const word = direction === 'low' ? 'lighter' : 'heavier';
  return `${matches} of your last ${total} meals read ${word} in ${label} than your pattern target.`;
}

export function repeatedNutritionMatchStatement(matches: number, total: number): string {
  return `${matches} of your last ${total} meals matched the eating pattern you reported.`;
}

export function repeatedCheckinStatement(
  matches: number,
  total: number,
  metric: string,
  direction: 'low' | 'high',
  windowLabel: 'recent' | 'this week'
): string {
  const label = metricLabel(metric);
  const prefix =
    windowLabel === 'this week' ? 'This week' : `${matches} of your last ${total} check-ins`;
  if (windowLabel === 'this week') {
    return `${prefix}, ${matches} of ${total} check-ins reported relatively ${direction} ${label}.`;
  }
  return `${prefix} reported relatively ${direction} ${label}.`;
}

export function repeatedMomentumStatement(matches: number, total: number): string {
  return `${matches} of your last ${total} progress snapshots showed improving overall momentum.`;
}

// ---- Level 3 — Things Worth Watching --------------------------------------------

export function proteinHydrationEnergyWatchStatement(matchingDays: number): string {
  return (
    `On days when your meals read lighter in protein and your hydration is lower, ` +
    `you tend to report lower afternoon energy — this showed up on ${matchingDays} separate days.`
  );
}

// ---- Level 4 — Weekly Observation / trend ---------------------------------------

export function digestionConsistencyTrendStatement(weeks: number): string {
  return (
    `Over the past ${weeks} weeks your digestion ratings have gradually improved ` +
    `while your meal-logging consistency has increased.`
  );
}

export function momentumTrendStatement(weeks: number): string {
  return `Your overall momentum has trended upward over the past ${weeks} weeks.`;
}
