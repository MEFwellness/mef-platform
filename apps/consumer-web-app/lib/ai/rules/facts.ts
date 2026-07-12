/**
 * Turns real check-in history into the named "facts" the deterministic
 * rules engine evaluates conditions against (lib/ai/rules/engine.ts).
 * Every fact here traces back to actual DailyCheckin rows — nothing is
 * invented, matching the milestone's "every recommendation must reference
 * the actual member data that caused it" requirement at the source.
 *
 * Trend facts reuse detectInsights() (lib/wellness/insights.ts) directly
 * rather than re-deriving trend direction a second way, so "sleep is
 * declining" means exactly the same thing here as it does on the coach
 * dashboard's Coaching Insights panel.
 */

import type { DailyCheckin } from '@mef/shared-types-contracts';
import { detectInsights, type WellnessInsight } from '../../wellness/insights';
import {
  calculateWellnessIndex,
  inputsFromCheckin,
  type WellnessMetricKey,
} from '../../wellness/wellness-index';

export type TrendDirection = 'improving' | 'declining' | 'stable' | null;

export type RuleFacts = {
  daysSinceLastCheckin: number | null;
  stressConsecutiveIncreaseDays: number;
  sleepConsecutiveDecreaseDays: number;
  stressTrend: TrendDirection;
  sleepTrend: TrendDirection;
  energyTrend: TrendDirection;
  moodTrend: TrendDirection;
  hydrationTrend: TrendDirection;
  digestionTrend: TrendDirection;
  movementTrend: TrendDirection;
  painTrend: TrendDirection;
  wellnessIndexScore: number | null;
  wellnessIndexDelta: number | null;
};

/** Pure calendar-day difference between two YYYY-MM-DD strings — UTC-safe, same pattern used throughout this app's date math. */
function daysBetweenLocalDates(earlierLocalDate: string, laterLocalDate: string): number {
  const [ey, em, ed] = earlierLocalDate.split('-').map(Number);
  const [ly, lm, ld] = laterLocalDate.split('-').map(Number);
  const earlierUtc = Date.UTC(ey!, em! - 1, ed!);
  const laterUtc = Date.UTC(ly!, lm! - 1, ld!);
  return Math.round((laterUtc - earlierUtc) / (1000 * 60 * 60 * 24));
}

type StreakField =
  'stress_level' | 'sleep_quality' | 'energy_level' | 'digestion_rating' | 'pain_discomfort_level';
type StreakDirection = 'higher-is-worse' | 'lower-is-worse';

/** How many consecutive most-recent day-over-day changes moved in the "worse" direction for this field — 0 if the most recent change didn't worsen, or there isn't enough data. */
function consecutiveWorseningStreak(
  checkinsOldestFirst: DailyCheckin[],
  field: StreakField,
  direction: StreakDirection
): number {
  let streak = 0;
  for (let i = checkinsOldestFirst.length - 1; i > 0; i--) {
    const current = checkinsOldestFirst[i]![field];
    const previous = checkinsOldestFirst[i - 1]![field];
    if (current === null || previous === null) break;
    const worsened = direction === 'higher-is-worse' ? current > previous : current < previous;
    if (!worsened) break;
    streak++;
  }
  return streak;
}

function trendFor(
  insights: WellnessInsight[],
  key: WellnessMetricKey,
  hasAnyData: boolean
): TrendDirection {
  if (!hasAnyData) return null;
  const match = insights.find((i) => i.key === key);
  return match ? match.direction : 'stable';
}

/**
 * @param checkinsOldestFirst Real check-in history, oldest first — the
 *   same ordering getRecentCheckins/getClientCheckins already return.
 * @param asOfLocalDate The calendar date to measure "days since" against.
 *   Pass the just-submitted check-in's own local_date to ask "how long a
 *   gap preceded this check-in" (checkinsOldestFirst should exclude that
 *   submission in that case), or pass today's date with the full recent
 *   history to ask "how overdue is this member right now."
 */
export function buildRuleFacts(
  checkinsOldestFirst: DailyCheckin[],
  asOfLocalDate: string
): RuleFacts {
  const insights = detectInsights(checkinsOldestFirst);
  const hasAnyData = checkinsOldestFirst.length > 0;

  const last = checkinsOldestFirst[checkinsOldestFirst.length - 1] ?? null;
  const secondLast = checkinsOldestFirst[checkinsOldestFirst.length - 2] ?? null;

  const currentIndex = calculateWellnessIndex(inputsFromCheckin(last));
  const previousIndex = calculateWellnessIndex(inputsFromCheckin(secondLast));

  return {
    daysSinceLastCheckin: last ? daysBetweenLocalDates(last.local_date, asOfLocalDate) : null,
    stressConsecutiveIncreaseDays: consecutiveWorseningStreak(
      checkinsOldestFirst,
      'stress_level',
      'higher-is-worse'
    ),
    sleepConsecutiveDecreaseDays: consecutiveWorseningStreak(
      checkinsOldestFirst,
      'sleep_quality',
      'lower-is-worse'
    ),
    stressTrend: trendFor(insights, 'stress', hasAnyData),
    sleepTrend: trendFor(insights, 'sleep', hasAnyData),
    energyTrend: trendFor(insights, 'energy', hasAnyData),
    moodTrend: trendFor(insights, 'mood', hasAnyData),
    hydrationTrend: trendFor(insights, 'hydration', hasAnyData),
    digestionTrend: trendFor(insights, 'digestion', hasAnyData),
    movementTrend: trendFor(insights, 'movement', hasAnyData),
    painTrend: trendFor(insights, 'pain', hasAnyData),
    wellnessIndexScore: currentIndex?.score ?? null,
    wellnessIndexDelta:
      currentIndex && previousIndex ? currentIndex.score - previousIndex.score : null,
  };
}
