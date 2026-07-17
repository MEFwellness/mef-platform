/**
 * Pure composer for the Daily Morning Brief — takes already-fetched
 * signals (the Coaching Brain's decision, recent check-ins, habits,
 * streak, and the Personal Wellness Intelligence Engine's own active
 * trend insights) and produces the exact fields coach_morning_briefs
 * persists. No I/O here; lib/coaching-engine/service.ts owns fetching
 * signals and persisting the result, same draft/service split every other
 * engine in this codebase uses (lib/intelligence/trendEngine.ts +
 * service.ts, lib/brain/decision.ts + service.ts).
 *
 * Every section is null, not a filler sentence, when there's nothing real
 * behind it — a member with no wearable sees no Recovery Status line
 * rather than a guess, matching the milestone's "never use generic text
 * if meaningful data exists [otherwise say nothing]" requirement.
 *
 * A real, already-computed longitudinal trend (sleep declining over the
 * last month, stress rising this week, etc.) always outranks a same-day
 * snapshot — this is what makes the brief read as "a coach who has been
 * paying attention," not just today's numbers with a generic focus label
 * attached. classifyMetricTrend's own six trend states are never
 * re-derived here; this file only picks which already-computed sentence,
 * if any, belongs in which section.
 */

import type {
  DailyCheckin,
  MorningBriefEvidenceRef,
  WellnessInsight,
} from '@mef/shared-types-contracts';
import { sleepQualityStatus, stressStatus, STATUS_LABEL } from '../wellness/status';
import { RECOVERY_PROXY_METRICS } from '../intelligence/copy';
import type { WellnessMetricKey } from '../wellness/wellness-index';
import { selectHabitToPrioritize } from './habitSelection';
import type { ComposedMorningBrief, MorningBriefSignals } from './types';

/** The trend states worth leading a section with — 'stable'/'inconsistent' don't describe a real, nameable pattern the way these four do. */
const MEANINGFUL_TREND_STATES = new Set([
  'declining',
  'improving',
  'newly_emerging',
  'recurring_pattern',
]);

function isMeaningfulTrend(insight: WellnessInsight): boolean {
  return insight.trend_state !== null && MEANINGFUL_TREND_STATES.has(insight.trend_state);
}

/** The first (highest-severity, per listInsightsForMember's own sort) active trend covering one of these metric areas — never re-ranked here. */
function trendFor(insights: WellnessInsight[], areas: WellnessMetricKey[]): WellnessInsight | null {
  return (
    insights.find(
      (i) =>
        i.wellness_area !== null &&
        (areas as string[]).includes(i.wellness_area) &&
        isMeaningfulTrend(i)
    ) ?? null
  );
}

function checkinSleepSummary(latest: DailyCheckin | null): string | null {
  if (!latest || latest.sleep_quality === null) return null;
  const status = sleepQualityStatus(latest.sleep_quality);
  if (status === 'no-data') return null;
  return `Sleep quality last night: ${STATUS_LABEL[status].toLowerCase()}.`;
}

function checkinStressSummary(latest: DailyCheckin | null): string | null {
  if (!latest || latest.stress_level === null) return null;
  const status = stressStatus(latest.stress_level);
  if (status === 'no-data') return null;
  return `Stress level today: ${STATUS_LABEL[status].toLowerCase()}.`;
}

/** A streak worth naming outranks the Brain's own generic encouragement line — same "real, specific, and true" bar every other proactive message in this app holds itself to. */
function pickEncouragingMessage(streak: number, brainEncouragement: string): string {
  if (streak >= 3) {
    return `${streak} days in a row checking in — that consistency is exactly what moves the needle.`;
  }
  return brainEncouragement;
}

export function composeMorningBrief(signals: MorningBriefSignals): ComposedMorningBrief {
  const {
    firstName,
    decision,
    recentCheckins,
    activeHabits,
    habitLogsToday,
    currentStreak,
    activeTrendInsights,
    continuitySentence,
  } = signals;
  const latestCheckin = recentCheckins[recentCheckins.length - 1] ?? null;

  // A real, multi-week/multi-day trend always outranks today's snapshot —
  // this is the difference between "here are today's numbers" and "I've
  // noticed something about you over time."
  const sleepTrend = trendFor(activeTrendInsights, ['sleep']);
  const stressTrend = trendFor(activeTrendInsights, ['stress']);
  const recoveryTrend = trendFor(activeTrendInsights, RECOVERY_PROXY_METRICS);

  const sleepSummary =
    sleepTrend?.member_summary ??
    decision.wearableBrief?.sleepRecommendation ??
    checkinSleepSummary(latestCheckin);
  const stressSummary =
    stressTrend?.member_summary ??
    decision.wearableBrief?.stressRecommendation ??
    checkinStressSummary(latestCheckin);
  const recoverySummary =
    decision.wearableBrief?.recoveryStatus ?? recoveryTrend?.member_summary ?? null;

  // A meaningful trend outside sleep/stress/recovery (digestion, movement,
  // mood, hydration, pain when it isn't already the recovery proxy) gets
  // its own explicit callout — real progress and real setbacks both
  // surface here, not only declines.
  const coveredAreas = new Set<string>(['sleep', 'stress', ...RECOVERY_PROXY_METRICS]);
  const notablePattern =
    activeTrendInsights.find(
      (i) => i.wellness_area !== null && !coveredAreas.has(i.wellness_area) && isMeaningfulTrend(i)
    ) ?? null;

  const habit = selectHabitToPrioritize(activeHabits, habitLogsToday, decision.focus);

  const evidenceRefs: MorningBriefEvidenceRef[] = [
    ...(latestCheckin ? [{ type: 'daily_checkin', id: latestCheckin.id }] : []),
    ...(habit ? [{ type: 'habit', id: habit.id }] : []),
    ...(sleepTrend ? [{ type: 'wellness_insight', id: sleepTrend.id, note: 'sleep' }] : []),
    ...(stressTrend ? [{ type: 'wellness_insight', id: stressTrend.id, note: 'stress' }] : []),
    ...(notablePattern
      ? [{ type: 'wellness_insight', id: notablePattern.id, note: 'notable_pattern' }]
      : []),
  ];

  return {
    greetingName: firstName,
    focusArea: decision.focus,
    focusLabel: decision.focusLabel,
    recoverySummary,
    sleepSummary,
    stressSummary,
    habitToPrioritize: habit ? habit.title : null,
    coachingRecommendation: decision.coachInsight ?? decision.reasonText,
    encouragingMessage: pickEncouragingMessage(currentStreak, decision.encouragement),
    notablePatternTitle: notablePattern?.title ?? null,
    notablePatternSummary: notablePattern?.member_summary ?? null,
    incompleteRecommendation: continuitySentence,
    evidenceRefs,
  };
}
