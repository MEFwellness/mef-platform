/**
 * Pattern Detection (section 4) — every detector here is a real,
 * deterministic count or comparison over already-fetched history, never
 * free-text NLP or an LLM guess. Wording is always association-worded
 * ("tends to," "has often been followed by"), never causal — matching
 * lib/narrative/generator.ts's own explicit discipline exactly.
 */

import type { DailyCheckin, FourDoctorsCategory } from '@mef/shared-types-contracts';
import {
  computeMetricCandidates,
  inputsFromCheckin,
  type WellnessMetricKey,
} from '../wellness/wellness-index';
import type { FeedHistoryPair } from '../feed/memory';
import { dayOfWeekFromLocalDate, type DayOfWeek } from '../feed/timeContext';
import { addDaysToLocalDate } from '../feed/dateMath';
import { areaLabel, FOUR_DOCTORS_TO_AREA } from './copy';
import { confidenceFromSample, MIN_WEEKDAY_OCCURRENCES } from './confidence';
import { windowRange, sliceByLocalDate } from './windows';
import type { WellnessInsightDraft } from './types';

const FOUR_DOCTORS_PLAIN: Record<FourDoctorsCategory, string> = {
  doctor_movement: 'movement',
  doctor_diet: 'nutrition',
  doctor_quiet: 'rest & recovery',
  doctor_happiness: 'mood & connection',
};

function allLocalDatesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    cursor = addDaysToLocalDate(cursor, 1);
  }
  return dates;
}

type WeekdayBucket = { completed: number; total: number };
type WeekdayBuckets = Partial<Record<DayOfWeek, WeekdayBucket>>;

function bucketByWeekday(entries: { localDate: string; completed: boolean }[]): WeekdayBuckets {
  const buckets: WeekdayBuckets = {};
  for (const entry of entries) {
    const day = dayOfWeekFromLocalDate(entry.localDate);
    const bucket = buckets[day] ?? { completed: 0, total: 0 };
    bucket.total += 1;
    if (entry.completed) bucket.completed += 1;
    buckets[day] = bucket;
  }
  return buckets;
}

function overallRate(buckets: WeekdayBuckets): number {
  let completed = 0;
  let total = 0;
  for (const bucket of Object.values(buckets)) {
    if (!bucket) continue;
    completed += bucket.completed;
    total += bucket.total;
  }
  return total > 0 ? completed / total : 0;
}

const DIP_THRESHOLD = 0.25; // 25 percentage points below the overall rate
const LIFT_THRESHOLD = 0.2; // 20 percentage points above the overall rate

function weakestWeekday(
  buckets: WeekdayBuckets,
  baseline: number
): { day: DayOfWeek; rate: number } | null {
  let weakest: { day: DayOfWeek; rate: number } | null = null;
  for (const [day, bucket] of Object.entries(buckets) as [DayOfWeek, WeekdayBucket][]) {
    if (bucket.total < MIN_WEEKDAY_OCCURRENCES) continue;
    const rate = bucket.completed / bucket.total;
    if (baseline - rate >= DIP_THRESHOLD && (!weakest || rate < weakest.rate)) {
      weakest = { day, rate };
    }
  }
  return weakest;
}

function strongestWeekday(
  buckets: WeekdayBuckets,
  baseline: number
): { day: DayOfWeek; rate: number } | null {
  let strongest: { day: DayOfWeek; rate: number } | null = null;
  for (const [day, bucket] of Object.entries(buckets) as [DayOfWeek, WeekdayBucket][]) {
    if (bucket.total < MIN_WEEKDAY_OCCURRENCES) continue;
    const rate = bucket.completed / bucket.total;
    if (rate - baseline >= LIFT_THRESHOLD && (!strongest || rate > strongest.rate)) {
      strongest = { day, rate };
    }
  }
  return strongest;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Core Outcome: "Check-in completion is strongest earlier in the week." Positive framing — highlights the best day, not the worst. */
export function checkinWeekdayPattern(
  checkinsOldestFirst: DailyCheckin[],
  asOfLocalDate: string
): WellnessInsightDraft | null {
  const range = windowRange(asOfLocalDate, 'last_90_days');
  const checkedInDates = new Set(
    sliceByLocalDate(checkinsOldestFirst, range).map((c) => c.local_date)
  );
  const entries = allLocalDatesInRange(range.start, range.end).map((localDate) => ({
    localDate,
    completed: checkedInDates.has(localDate),
  }));

  const buckets = bucketByWeekday(entries);
  const baseline = overallRate(buckets);
  const strongest = strongestWeekday(buckets, baseline);
  if (!strongest) return null;

  const sampleSize = entries.length;
  return {
    insightType: 'pattern',
    wellnessArea: 'consistency',
    trendState: null,
    trendStrength: null,
    patternKey: 'checkin_weekday_strength',
    title: 'Check-in consistency has a weekly rhythm',
    memberSummary: `Your check-ins have been most consistent on ${capitalize(strongest.day)}s over the last few months.`,
    coachDetail: `Check-in completion on ${capitalize(strongest.day)}s is ${Math.round(strongest.rate * 100)}% over the last 90 days, vs. ${Math.round(baseline * 100)}% overall.`,
    confidence: confidenceFromSample(sampleSize, 0.55, 60),
    severity: 'info',
    timeWindow: 'last_90_days',
    evidenceRefs: [
      {
        type: 'daily_checkin_weekday',
        id: strongest.day,
        note: `${Math.round(strongest.rate * 100)}% completion`,
      },
    ],
    reasoningCodes: ['WEEKDAY_CHECKIN_STRENGTH'],
    recommendedCoachingResponse: null,
    recommendedCoachAction: `${capitalize(strongest.day)}s may be a good day to introduce something new — engagement tends to be highest.`,
    memberVisible: true,
  };
}

/** Core Outcome: "Movement consistency tends to decline on weekends." Dip framing — names the specific harder day for a specific Four Doctors category. */
export function categoryWeekdayDipPattern(
  feedHistoryPairs: FeedHistoryPair[],
  asOfLocalDate: string,
  category: FourDoctorsCategory
): WellnessInsightDraft | null {
  const range = windowRange(asOfLocalDate, 'last_90_days');
  const inWindow = feedHistoryPairs.filter(
    ({ feedItem, content }) =>
      feedItem.local_date >= range.start &&
      feedItem.local_date <= range.end &&
      content?.four_doctors_category === category
  );
  if (inWindow.length < MIN_WEEKDAY_OCCURRENCES * 2) return null;

  const entries = inWindow.map(({ feedItem }) => ({
    localDate: feedItem.local_date,
    completed: feedItem.completed_at !== null,
  }));
  const buckets = bucketByWeekday(entries);
  const baseline = overallRate(buckets);
  const weakest = weakestWeekday(buckets, baseline);
  if (!weakest) return null;

  const plain = FOUR_DOCTORS_PLAIN[category];
  const isWeekend = weakest.day === 'saturday' || weakest.day === 'sunday';
  return {
    insightType: 'pattern',
    wellnessArea: FOUR_DOCTORS_TO_AREA[category],
    trendState: null,
    trendStrength: null,
    patternKey: `category_weekday_dip_${category}`,
    title: `${capitalize(plain)} tends to be harder to keep up on ${isWeekend ? 'weekends' : capitalize(weakest.day) + 's'}`,
    memberSummary: `${capitalize(plain)} tends to be harder to maintain ${isWeekend ? 'on weekends' : `on ${capitalize(weakest.day)}s`} — a small, real pattern worth planning around.`,
    coachDetail: `${capitalize(plain)}-category completion on ${capitalize(weakest.day)}s is ${Math.round(weakest.rate * 100)}% vs. ${Math.round(baseline * 100)}% overall across the last 90 days.`,
    confidence: confidenceFromSample(inWindow.length, 0.5, 40),
    severity: 'notable',
    timeWindow: 'last_90_days',
    evidenceRefs: [
      {
        type: 'daily_feed_weekday',
        id: weakest.day,
        note: `${category}, ${Math.round(weakest.rate * 100)}% completion`,
      },
    ],
    reasoningCodes: [`WEEKDAY_DIP_${category.toUpperCase()}`],
    recommendedCoachingResponse: `Consider a lighter or differently-shaped ${plain} action specifically on ${isWeekend ? 'weekends' : capitalize(weakest.day) + 's'}.`,
    recommendedCoachAction: `${capitalize(plain)} on ${isWeekend ? 'weekends' : capitalize(weakest.day) + 's'} may be worth a proactive check-in rather than waiting for it to come up.`,
    memberVisible: true,
  };
}

const MIN_SAVED_REPEATS = 2;

/** Core Outcome-adjacent: a saved-but-never-completed lesson that keeps recurring is a real adherence barrier, not a one-off. */
export function repeatedSavedNotCompletedPattern(
  feedHistoryPairs: FeedHistoryPair[]
): WellnessInsightDraft | null {
  const saved = feedHistoryPairs.filter(
    ({ feedItem }) => feedItem.saved_at !== null && feedItem.completed_at === null
  );
  if (saved.length < MIN_SAVED_REPEATS) return null;

  return {
    insightType: 'pattern',
    wellnessArea: 'consistency',
    trendState: null,
    trendStrength: null,
    patternKey: 'repeated_saved_not_completed',
    title: 'A few saved lessons are still waiting',
    memberSummary: `You've saved ${saved.length} lessons for later that haven't been completed yet — no pressure, just worth knowing they're there.`,
    coachDetail: `${saved.length} feed items are currently saved-but-not-completed: ${saved.map(({ content }) => content?.title ?? 'untitled').join('; ')}.`,
    confidence: confidenceFromSample(saved.length, 0.5, 10),
    severity: 'info',
    timeWindow: 'last_30_days',
    evidenceRefs: saved.map(({ feedItem }) => ({ type: 'daily_feed_item', id: feedItem.id })),
    reasoningCodes: ['REPEATED_SAVED_NOT_COMPLETED'],
    recommendedCoachingResponse:
      "Surface one saved item as today's carryover rather than introducing something new.",
    recommendedCoachAction:
      'Ask whether these saved lessons are still relevant or should be cleared.',
    memberVisible: true,
  };
}

const MIN_DISRUPTION_COUNT = 2;
const DISRUPTION_GAP_DAYS = 3;

/** Core Outcome: "The member repeatedly struggles after travel or schedule disruptions." A real count of multi-day check-in gaps, not a guess about *why* the member was away. */
export function disruptionRecoveryPattern(
  checkinsOldestFirst: DailyCheckin[],
  asOfLocalDate: string
): WellnessInsightDraft | null {
  const range = windowRange(asOfLocalDate, 'last_90_days');
  const inWindow = sliceByLocalDate(checkinsOldestFirst, range);
  if (inWindow.length < 5) return null;

  let gapCount = 0;
  const gapEvidence: string[] = [];
  for (let i = 1; i < inWindow.length; i++) {
    const prev = inWindow[i - 1]!;
    const curr = inWindow[i]!;
    const gapDays =
      (new Date(`${curr.local_date}T00:00:00Z`).getTime() -
        new Date(`${prev.local_date}T00:00:00Z`).getTime()) /
      86_400_000;
    if (gapDays >= DISRUPTION_GAP_DAYS) {
      gapCount++;
      gapEvidence.push(`${prev.local_date}..${curr.local_date}`);
    }
  }

  if (gapCount < MIN_DISRUPTION_COUNT) return null;

  return {
    insightType: 'pattern',
    wellnessArea: 'consistency',
    trendState: 'recurring_pattern',
    trendStrength: null,
    patternKey: 'disruption_recovery',
    title: 'Schedule disruptions have come up more than once',
    memberSummary: `Your check-ins have paused for a few days ${gapCount} separate times over the last few months — and you've picked back up each time, which is exactly what matters.`,
    coachDetail: `${gapCount} gaps of ${DISRUPTION_GAP_DAYS}+ consecutive days without a check-in in the last 90 days: ${gapEvidence.join(', ')}.`,
    confidence: confidenceFromSample(gapCount, 0.55, 6, 0.85),
    severity: gapCount >= 3 ? 'notable' : 'info',
    timeWindow: 'last_90_days',
    evidenceRefs: [{ type: 'daily_checkin_range', id: gapEvidence.join(',') }],
    reasoningCodes: ['RECURRING_CHECKIN_GAPS'],
    recommendedCoachingResponse:
      'Frame a return after a gap as a normal restart, never as catching up.',
    recommendedCoachAction:
      'Ask what tends to disrupt check-ins — travel, work schedule, or something else — and plan around it together.',
    memberVisible: true,
  };
}

const MIN_SUCCESS_REPEATS = 2;

/** Core Outcome: "A previously successful strategy may be worth using again." */
export function repeatedInterventionSuccessPattern(
  feedHistoryPairs: FeedHistoryPair[]
): WellnessInsightDraft | null {
  const completions = new Map<
    string,
    { title: string; count: number; helpfulCount: number; ratedCount: number }
  >();
  for (const { feedItem, content } of feedHistoryPairs) {
    if (!feedItem.completed_at || !content) continue;
    const entry = completions.get(content.id) ?? {
      title: content.title,
      count: 0,
      helpfulCount: 0,
      ratedCount: 0,
    };
    entry.count++;
    if (feedItem.helpful !== null) {
      entry.ratedCount++;
      if (feedItem.helpful) entry.helpfulCount++;
    }
    completions.set(content.id, entry);
  }

  const candidates = [...completions.entries()]
    .filter(
      ([, entry]) =>
        entry.count >= MIN_SUCCESS_REPEATS &&
        (entry.ratedCount === 0 || entry.helpfulCount === entry.ratedCount)
    )
    .sort((a, b) => b[1].count - a[1].count);
  if (candidates.length === 0) return null;

  const [contentId, best] = candidates[0]!;
  const ratedNote = best.ratedCount > 0 ? ' and rated it helpful each time' : '';
  return {
    insightType: 'pattern',
    wellnessArea: null,
    trendState: null,
    trendStrength: null,
    patternKey: `repeated_success_${contentId}`,
    title: `"${best.title}" has worked for you before`,
    memberSummary: `You've completed "${best.title}" ${best.count} times${ratedNote} — a strategy worth returning to when it fits.`,
    coachDetail: `Content item "${best.title}" completed ${best.count} times${best.ratedCount > 0 ? `, rated helpful ${best.helpfulCount}/${best.ratedCount} times` : ' (not yet rated)'}.`,
    confidence: confidenceFromSample(best.count, 0.55, 8),
    severity: 'info',
    timeWindow: 'last_90_days',
    evidenceRefs: [{ type: 'mef_content_item', id: contentId, note: `completed ${best.count}x` }],
    reasoningCodes: ['REPEATED_INTERVENTION_SUCCESS'],
    recommendedCoachingResponse: `Consider resurfacing "${best.title}" the next time this area needs attention.`,
    recommendedCoachAction: null,
    memberVisible: true,
  };
}

const CATEGORY_NEGLECT_GAP = 0.3;
const MIN_CATEGORY_SAMPLE = 3;

/** Core Outcome: "The member is improving overall but one Four Doctors area is being neglected." */
export function categoryEngagementImbalancePattern(
  feedHistoryPairs: FeedHistoryPair[],
  asOfLocalDate: string,
  overallStatusIsGoodOrImproving: boolean
): WellnessInsightDraft | null {
  if (!overallStatusIsGoodOrImproving) return null;

  const range = windowRange(asOfLocalDate, 'last_30_days');
  const inWindow = feedHistoryPairs.filter(
    ({ feedItem }) => feedItem.local_date >= range.start && feedItem.local_date <= range.end
  );

  const byCategory = new Map<FourDoctorsCategory, { completed: number; total: number }>();
  for (const { feedItem, content } of inWindow) {
    if (!content) continue;
    const entry = byCategory.get(content.four_doctors_category) ?? { completed: 0, total: 0 };
    entry.total++;
    if (feedItem.completed_at) entry.completed++;
    byCategory.set(content.four_doctors_category, entry);
  }

  const rates = [...byCategory.entries()]
    .filter(([, e]) => e.total >= MIN_CATEGORY_SAMPLE)
    .map(([category, e]) => ({ category, rate: e.completed / e.total, total: e.total }));
  if (rates.length < 2) return null;

  const avgOfOthers = (excluded: FourDoctorsCategory) => {
    const others = rates.filter((r) => r.category !== excluded);
    return others.reduce((sum, r) => sum + r.rate, 0) / others.length;
  };

  const neglected = rates
    .map((r) => ({ ...r, gap: avgOfOthers(r.category) - r.rate }))
    .filter((r) => r.gap >= CATEGORY_NEGLECT_GAP)
    .sort((a, b) => b.gap - a.gap)[0];
  if (!neglected) return null;

  const plain = FOUR_DOCTORS_PLAIN[neglected.category];
  return {
    insightType: 'pattern',
    wellnessArea: FOUR_DOCTORS_TO_AREA[neglected.category],
    trendState: null,
    trendStrength: null,
    patternKey: `category_neglect_${neglected.category}`,
    title: `${capitalize(plain)} is being overlooked while everything else improves`,
    memberSummary: `Things are generally going well, but ${plain} has gotten less attention than your other areas lately.`,
    coachDetail: `${capitalize(plain)} completion is ${Math.round(neglected.rate * 100)}% over the last 30 days vs. ${Math.round(avgOfOthers(neglected.category) * 100)}% average across the other three Four Doctors categories, while overall wellness is stable-to-improving.`,
    confidence: confidenceFromSample(neglected.total, 0.5, 10),
    severity: 'notable',
    timeWindow: 'last_30_days',
    evidenceRefs: [{ type: 'four_doctors_category', id: neglected.category }],
    reasoningCodes: [`CATEGORY_NEGLECT_${neglected.category.toUpperCase()}`],
    recommendedCoachingResponse: `Bring ${plain} back into rotation with something small and easy.`,
    recommendedCoachAction: `Ask directly whether ${plain} has fallen off the radar for a specific reason.`,
    memberVisible: true,
  };
}

const DIVERGENCE_PAIRS: {
  improved: WellnessMetricKey;
  stuck: WellnessMetricKey;
  stuckIsHighBad: boolean;
}[] = [
  { improved: 'sleep', stuck: 'stress', stuckIsHighBad: true },
  { improved: 'movement', stuck: 'energy', stuckIsHighBad: false },
  { improved: 'hydration', stuck: 'energy', stuckIsHighBad: false },
];

/** Core Outcome: "Stress remains elevated even though sleep has improved." Consumes the trend engine's own results — never a second, independently-derived trend. */
export function divergencePattern(
  trendsByArea: Map<WellnessMetricKey, string>
): WellnessInsightDraft[] {
  const drafts: WellnessInsightDraft[] = [];
  for (const pair of DIVERGENCE_PAIRS) {
    const improvedState = trendsByArea.get(pair.improved);
    const stuckState = trendsByArea.get(pair.stuck);
    if (improvedState !== 'improving') continue;
    if (stuckState !== 'declining' && stuckState !== 'recurring_pattern') continue;

    const improvedLabel = areaLabel(pair.improved);
    const stuckLabel = areaLabel(pair.stuck);
    const stuckWord = pair.stuckIsHighBad ? 'remains elevated' : 'remains low';
    drafts.push({
      insightType: 'pattern',
      wellnessArea: pair.stuck,
      trendState: null,
      trendStrength: null,
      patternKey: `divergence_${pair.improved}_${pair.stuck}`,
      title: `${stuckLabel} ${stuckWord} even though ${improvedLabel.toLowerCase()} has improved`,
      memberSummary: `${stuckLabel} ${stuckWord} even though ${improvedLabel.toLowerCase()} has improved recently — worth watching, not necessarily connected.`,
      coachDetail: `${improvedLabel} is trending 'improving' over the last 30 days while ${stuckLabel.toLowerCase()} is trending '${stuckState}' over the same window.`,
      confidence: 0.6,
      severity: 'notable',
      timeWindow: 'last_30_days',
      evidenceRefs: [
        { type: 'wellness_trend', id: pair.improved },
        { type: 'wellness_trend', id: pair.stuck },
      ],
      reasoningCodes: [`DIVERGENCE_${pair.improved.toUpperCase()}_${pair.stuck.toUpperCase()}`],
      recommendedCoachingResponse: `Don't assume ${improvedLabel.toLowerCase()} alone will resolve ${stuckLabel.toLowerCase()} — they may need separate attention.`,
      recommendedCoachAction: `Worth exploring what else might be driving ${stuckLabel.toLowerCase()} directly.`,
      memberVisible: true,
    });
  }
  return drafts;
}

const MIN_CORRELATION_SAMPLE = 3;
const CORRELATION_SUCCESS_RATE = 0.6;

/** Core Outcome: "Breathing practices are often followed by improved stress ratings." A same-detector-shape correlation between a content category's completion and the FOLLOWING day's metric — never claimed as causal. */
export function contentFollowedByMetricImprovementPattern(
  feedHistoryPairs: FeedHistoryPair[],
  checkinsOldestFirst: DailyCheckin[],
  category: FourDoctorsCategory,
  metric: WellnessMetricKey
): WellnessInsightDraft | null {
  const checkinByDate = new Map(checkinsOldestFirst.map((c) => [c.local_date, c]));
  const completions = feedHistoryPairs.filter(
    ({ feedItem, content }) =>
      feedItem.completed_at !== null && content?.four_doctors_category === category
  );

  let improvedCount = 0;
  let sample = 0;
  for (const { feedItem } of completions) {
    const sameDayCheckin = checkinByDate.get(feedItem.local_date);
    const nextDayCheckin = checkinByDate.get(addDaysToLocalDate(feedItem.local_date, 1));
    if (!sameDayCheckin || !nextDayCheckin) continue;

    const sameDayScore = computeMetricCandidates(inputsFromCheckin(sameDayCheckin)).find(
      (m) => m.key === metric
    )?.score;
    const nextDayScore = computeMetricCandidates(inputsFromCheckin(nextDayCheckin)).find(
      (m) => m.key === metric
    )?.score;
    if (sameDayScore == null || nextDayScore == null) continue;

    sample++;
    if (nextDayScore > sameDayScore) improvedCount++;
  }

  if (sample < MIN_CORRELATION_SAMPLE) return null;
  const rate = improvedCount / sample;
  if (rate < CORRELATION_SUCCESS_RATE) return null;

  const plain = FOUR_DOCTORS_PLAIN[category];
  const metricLabel = areaLabel(metric);
  return {
    insightType: 'pattern',
    wellnessArea: metric,
    trendState: null,
    trendStrength: null,
    patternKey: `content_followed_by_${category}_${metric}`,
    title: `${capitalize(plain)} practices tend to be followed by better ${metricLabel.toLowerCase()}`,
    memberSummary: `On days after a ${plain} practice, your ${metricLabel.toLowerCase()} has tended to look better the next day — worth noticing, not a guarantee.`,
    coachDetail: `${capitalize(plain)}-category completions were followed by an improved next-day ${metricLabel.toLowerCase()} score ${improvedCount}/${sample} times (${Math.round(rate * 100)}%).`,
    confidence: confidenceFromSample(sample, 0.5, 10),
    severity: 'info',
    timeWindow: 'last_90_days',
    evidenceRefs: [
      {
        type: 'four_doctors_category',
        id: category,
        note: `${improvedCount}/${sample} next-day improvements`,
      },
    ],
    reasoningCodes: [`CORRELATION_${category.toUpperCase()}_${metric.toUpperCase()}`],
    recommendedCoachingResponse: `A ${plain} practice is a reasonable suggestion when ${metricLabel.toLowerCase()} needs attention.`,
    recommendedCoachAction: null,
    memberVisible: true,
  };
}
