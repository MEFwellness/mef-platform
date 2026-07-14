/**
 * Member Strengths and Wins (section 5) — "do not focus only on
 * problems." Every builder here is a real best-of comparison over the
 * same windows/metrics the trend engine uses, framed for celebration
 * rather than correction. Reuses lib/feed/streakIntelligence.ts's own
 * streak math and lib/wellness/wellness-index.ts's scoring directly
 * rather than a second definition of "streak" or "score."
 */

import type { DailyCheckin, FourDoctorsCategory } from '@mef/shared-types-contracts';
import {
  computeMetricCandidates,
  inputsFromCheckin,
  type WellnessMetricKey,
} from '../wellness/wellness-index';
import { computeStreakInsight } from '../feed/streakIntelligence';
import type { FeedHistoryPair } from '../feed/memory';
import { areaLabel } from './copy';
import { average, confidenceFromSample, MIN_SAMPLE_FOR_WINDOW } from './confidence';
import { windowRange, sliceByLocalDate } from './windows';
import type { WellnessInsightDraft } from './types';

const FOUR_DOCTORS_PLAIN: Record<FourDoctorsCategory, string> = {
  doctor_movement: 'movement',
  doctor_diet: 'nutrition',
  doctor_quiet: 'rest & recovery',
  doctor_happiness: 'mood & connection',
};

function scoresForArea(checkins: DailyCheckin[], area: WellnessMetricKey): number[] {
  return checkins
    .map((c) => computeMetricCandidates(inputsFromCheckin(c)).find((m) => m.key === area)?.score)
    .filter((v): v is number => v !== null && v !== undefined);
}

export function strongestAreaInsight(
  checkinsOldestFirst: DailyCheckin[],
  asOfLocalDate: string,
  areas: WellnessMetricKey[]
): WellnessInsightDraft | null {
  const range = windowRange(asOfLocalDate, 'last_30_days');
  const window = sliceByLocalDate(checkinsOldestFirst, range);
  if (window.length < MIN_SAMPLE_FOR_WINDOW.last_30_days) return null;

  const averages = areas
    .map((area) => ({ area, avg: average(scoresForArea(window, area)) }))
    .filter((r): r is { area: WellnessMetricKey; avg: number } => r.avg !== null);
  if (averages.length === 0) return null;

  const best = averages.reduce((a, b) => (b.avg > a.avg ? b : a));
  if (best.avg < 70) return null; // only a genuine strength, not merely "least bad"

  const label = areaLabel(best.area);
  return {
    insightType: 'strength',
    wellnessArea: best.area,
    trendState: null,
    trendStrength: null,
    patternKey: `strongest_area_${best.area}`,
    title: `${label} is a real strength right now`,
    memberSummary: `${label} has been consistently strong over the last month — that's a solid foundation to build on.`,
    coachDetail: `${label} averaged ${best.avg.toFixed(0)}/100 over the last 30 days, the highest of any tracked area.`,
    confidence: confidenceFromSample(window.length),
    severity: 'info',
    timeWindow: 'last_30_days',
    evidenceRefs: [
      { type: 'wellness_area_average', id: best.area, note: `${best.avg.toFixed(0)}/100` },
    ],
    reasoningCodes: [`STRONGEST_AREA_${best.area.toUpperCase()}`],
    recommendedCoachingResponse: `Acknowledge ${label.toLowerCase()} as a genuine win when it comes up.`,
    recommendedCoachAction: null,
    memberVisible: true,
  };
}

export function mostImprovedAreaInsight(
  checkinsOldestFirst: DailyCheckin[],
  asOfLocalDate: string,
  areas: WellnessMetricKey[]
): WellnessInsightDraft | null {
  const last30Range = windowRange(asOfLocalDate, 'last_30_days');
  const prev30Range = windowRange(asOfLocalDate, 'previous_30_days');
  const last30 = sliceByLocalDate(checkinsOldestFirst, last30Range);
  const prev30 = sliceByLocalDate(checkinsOldestFirst, prev30Range);
  if (
    last30.length < MIN_SAMPLE_FOR_WINDOW.last_30_days ||
    prev30.length < MIN_SAMPLE_FOR_WINDOW.previous_30_days
  ) {
    return null;
  }

  const deltas = areas
    .map((area) => {
      const last = average(scoresForArea(last30, area));
      const prev = average(scoresForArea(prev30, area));
      return last !== null && prev !== null ? { area, delta: last - prev, last, prev } : null;
    })
    .filter(
      (r): r is { area: WellnessMetricKey; delta: number; last: number; prev: number } => r !== null
    );
  if (deltas.length === 0) return null;

  const best = deltas.reduce((a, b) => (b.delta > a.delta ? b : a));
  if (best.delta < 10) return null;

  const label = areaLabel(best.area);
  return {
    insightType: 'strength',
    wellnessArea: best.area,
    trendState: null,
    trendStrength: null,
    patternKey: `most_improved_${best.area}`,
    title: `${label} is your most improved area`,
    memberSummary: `${label} has improved more than any other area over the last month — real, earned progress.`,
    coachDetail: `${label} moved from ${best.prev.toFixed(0)}/100 to ${best.last.toFixed(0)}/100 (+${best.delta.toFixed(0)}), the largest 30-day improvement across tracked areas.`,
    confidence: confidenceFromSample(last30.length + prev30.length),
    severity: 'info',
    timeWindow: 'last_30_days',
    evidenceRefs: [
      { type: 'wellness_area_delta', id: best.area, note: `+${best.delta.toFixed(0)}` },
    ],
    reasoningCodes: [`MOST_IMPROVED_${best.area.toUpperCase()}`],
    recommendedCoachingResponse: `Name this improvement explicitly — members rarely notice their own gradual progress.`,
    recommendedCoachAction: null,
    memberVisible: true,
  };
}

const MEANINGFUL_STREAK_DAYS = 7;

export function longestConsistencyInsight(
  checkinsOldestFirst: DailyCheckin[],
  asOfLocalDate: string
): WellnessInsightDraft | null {
  const range = windowRange(asOfLocalDate, 'last_90_days');
  const window = sliceByLocalDate(checkinsOldestFirst, range);
  const insight = computeStreakInsight(window, asOfLocalDate);
  if (insight.longestStreak < MEANINGFUL_STREAK_DAYS) return null;

  return {
    insightType: 'strength',
    wellnessArea: 'consistency',
    trendState: null,
    trendStrength: null,
    patternKey: 'longest_consistency_streak',
    title: `Your longest streak this season is ${insight.longestStreak} days`,
    memberSummary: `Your longest run of consecutive check-ins over the last few months is ${insight.longestStreak} days — real, sustained consistency.`,
    coachDetail: `Longest check-in streak within the last 90 days: ${insight.longestStreak} days (current: ${insight.currentStreak}).`,
    confidence: confidenceFromSample(window.length),
    severity: 'info',
    timeWindow: 'last_90_days',
    evidenceRefs: [{ type: 'streak_length', id: String(insight.longestStreak) }],
    reasoningCodes: ['LONGEST_CONSISTENCY_STREAK'],
    recommendedCoachingResponse: 'Reference this streak when consistency comes up as a topic.',
    recommendedCoachAction: null,
    memberVisible: true,
  };
}

const MIN_SUSTAINABLE_RATE = 0.75;
const MIN_SUSTAINABLE_SAMPLE = 5;

export function sustainableHabitInsight(
  feedHistoryPairs: FeedHistoryPair[],
  asOfLocalDate: string
): WellnessInsightDraft | null {
  const last30Range = windowRange(asOfLocalDate, 'last_30_days');
  const prev30Range = windowRange(asOfLocalDate, 'previous_30_days');

  const byCategory = (start: string, end: string) => {
    const map = new Map<FourDoctorsCategory, { completed: number; total: number }>();
    for (const { feedItem, content } of feedHistoryPairs) {
      if (!content || feedItem.local_date < start || feedItem.local_date > end) continue;
      const entry = map.get(content.four_doctors_category) ?? { completed: 0, total: 0 };
      entry.total++;
      if (feedItem.completed_at) entry.completed++;
      map.set(content.four_doctors_category, entry);
    }
    return map;
  };

  const last30 = byCategory(last30Range.start, last30Range.end);
  const prev30 = byCategory(prev30Range.start, prev30Range.end);

  for (const [category, entry] of last30) {
    const prevEntry = prev30.get(category);
    if (
      entry.total < MIN_SUSTAINABLE_SAMPLE ||
      !prevEntry ||
      prevEntry.total < MIN_SUSTAINABLE_SAMPLE
    )
      continue;
    const lastRate = entry.completed / entry.total;
    const prevRate = prevEntry.completed / prevEntry.total;
    if (lastRate < MIN_SUSTAINABLE_RATE || prevRate < MIN_SUSTAINABLE_RATE) continue;

    const plain = FOUR_DOCTORS_PLAIN[category];
    return {
      insightType: 'strength',
      wellnessArea:
        category === 'doctor_movement'
          ? 'doctor_movement'
          : category === 'doctor_diet'
            ? 'doctor_diet'
            : category === 'doctor_quiet'
              ? 'doctor_quiet'
              : 'doctor_happiness',
      trendState: null,
      trendStrength: null,
      patternKey: `sustainable_habit_${category}`,
      title: `${plain.charAt(0).toUpperCase()}${plain.slice(1)} has become a sustainable habit`,
      memberSummary: `${plain.charAt(0).toUpperCase()}${plain.slice(1)} has stayed consistently strong for two months running — this one looks like it's sticking.`,
      coachDetail: `${plain} completion held at ${Math.round(lastRate * 100)}% (last 30 days) and ${Math.round(prevRate * 100)}% (prior 30 days) — sustained, not a fluke.`,
      confidence: confidenceFromSample(entry.total + prevEntry.total),
      severity: 'info',
      timeWindow: 'last_30_days',
      evidenceRefs: [{ type: 'four_doctors_category', id: category }],
      reasoningCodes: [`SUSTAINABLE_HABIT_${category.toUpperCase()}`],
      recommendedCoachingResponse: null,
      recommendedCoachAction: `A good habit to build the next progression on top of.`,
      memberVisible: true,
    };
  }
  return null;
}
