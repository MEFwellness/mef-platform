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
import { sleepQualityStatus, stressStatus } from '../wellness/status';
import { daysBetweenLocalDates } from '../feed/dateMath';
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

/**
 * One whole sentence per status, rather than a status LABEL dropped into a
 * sentence frame.
 *
 * Copy-and-honesty pass (2026-08-14). The frame was
 * `Your sleep looked ${STATUS_LABEL[status].toLowerCase()} last night.`,
 * and STATUS_LABEL's 'attention' entry is the phrase "Needs attention", so
 * a perfectly ordinary middling night produced "Your sleep looked needs
 * attention last night." The labels are written to sit alone in a badge,
 * not to be conjugated into a clause, so no sentence frame can be safe for
 * all four of them. Writing the sentence out per status is the fix; the
 * classification itself (lib/wellness/status.ts) is untouched and still the
 * single source of truth for which band a raw value falls in.
 *
 * 'no-data' has no entry on purpose: both callers return null before
 * reaching here, which is this file's own "say nothing rather than
 * something empty" rule.
 */
const SLEEP_SENTENCE: Record<'good' | 'attention' | 'poor', string> = {
  good: 'Your sleep looked good last night.',
  attention: 'Your sleep was only fair last night.',
  poor: 'Your sleep was rough last night.',
};

const STRESS_SENTENCE: Record<'good' | 'attention' | 'poor', string> = {
  good: 'Your stress looked low today.',
  attention: 'Your stress was moderate today.',
  poor: 'Your stress ran high today.',
};

/**
 * Honesty guard, 2026-08-17. The sentences above say "last night" and
 * "today", and both were being written from `recentCheckins`'s last
 * element, which is the member's most recent check-in whenever it
 * happened. On a morning before she had checked in, Home said "Your stress
 * was moderate today" from a check-in logged the previous day, while Today,
 * on the same load, said "You haven't checked in yet today."
 *
 * So: the "today" sentences are only used on a day she has actually
 * checked in. Otherwise the same reading is still shown, because it is real
 * and it is hers, but it is dated. Nothing here changes which status a
 * value falls into (lib/wellness/status.ts is still the only thing that
 * decides that) and nothing is withheld that was previously shown; the
 * claim about *when* is the only thing that changes.
 */
const SLEEP_PHRASE: Record<'good' | 'attention' | 'poor', string> = {
  good: 'good sleep',
  attention: 'only fair sleep',
  poor: 'rough sleep',
};

const STRESS_PHRASE: Record<'good' | 'attention' | 'poor', string> = {
  good: 'low stress',
  attention: 'moderate stress',
  poor: 'high stress',
};

/** 'today' when the latest check-in is this local date, 'yesterday' when it is the day before, otherwise 'earlier'. */
type CheckinRecency = 'today' | 'yesterday' | 'earlier';

export function checkinRecency(latest: DailyCheckin | null, localDate: string): CheckinRecency | null {
  if (!latest) return null;
  const days = daysBetweenLocalDates(latest.local_date, localDate);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return 'earlier';
}

/** How many days back the latest check-in is, from the member's own local date. Zero or less when it is today. */
function daysSinceCheckin(latest: DailyCheckin | null, localDate: string): number {
  if (!latest) return 0;
  return Math.max(0, daysBetweenLocalDates(latest.local_date, localDate));
}

/**
 * The stem of the "earlier" sentence, without its day count.
 *
 * Kept separate because the count varies, and the read-time recomposition
 * below has to be able to recognise a line this module wrote no matter
 * which number it wrote it with.
 */
function earlierStem(phrase: string): string {
  return `You logged ${phrase} at your last check-in`;
}

/**
 * C8 (2026-08-27): "You logged only fair sleep at your last check-in" sat
 * directly under "I'm glad you're back", ten days after the check-in it is
 * about, and never said so. A reading with no date on it reads as a
 * reading from now. The gap was already computed one function up; it is
 * now said out loud.
 */
function datedSentence(phrase: string, recency: 'yesterday' | 'earlier', daysAgo: number): string {
  if (recency === 'yesterday') return `Yesterday you logged ${phrase}.`;
  return `${earlierStem(phrase)}, ${daysAgo} days ago.`;
}

/**
 * Every sentence this module can produce about sleep or stress FROM A
 * CHECK-IN, as data.
 *
 * It exists so read-time recomposition (below) can tell a line that came
 * from a check-in apart from one that came from a real longitudinal trend
 * or from a wearable. Only the first kind goes stale within the day; the
 * other two are about a window, not about this morning, and must be left
 * exactly as the brief composed them.
 *
 * Enumerable because the vocabulary is closed: three statuses times four
 * shapes (today, yesterday, earlier, and the phrase alone).
 */
function checkinSentenceMatcher(
  present: Record<'good' | 'attention' | 'poor', string>,
  phrase: Record<'good' | 'attention' | 'poor', string>
): (line: string) => boolean {
  const exact = new Set<string>();
  const stems: string[] = [];
  for (const status of ['good', 'attention', 'poor'] as const) {
    exact.add(present[status]);
    exact.add(`Yesterday you logged ${phrase[status]}.`);
    // The "earlier" sentence now carries a day count, so it is matched by
    // its stem rather than enumerated: one stem per status, still closed.
    stems.push(earlierStem(phrase[status]));
  }
  return (line: string) => exact.has(line) || stems.some((stem) => line.startsWith(stem));
}

const isCheckinSleepSentence = checkinSentenceMatcher(SLEEP_SENTENCE, SLEEP_PHRASE);
const isCheckinStressSentence = checkinSentenceMatcher(STRESS_SENTENCE, STRESS_PHRASE);

/**
 * The Daily Brief, brought up to date at READ time.
 *
 * The brief is a per-day cache: one row per (member, local_date), composed
 * on the member's first open of the day and never rewritten. That is almost
 * always before she has checked in, so the two lines that speak about her
 * most recent check-in were frozen at "Yesterday you logged moderate
 * stress" and stayed that way for the rest of the day even after she
 * checked in. Home did not update.
 *
 * Two ways to fix that were possible. Regenerating and rewriting the row
 * needs an UPDATE or DELETE policy on `coach_morning_briefs`, which
 * migration 53 deliberately does not grant a member (insert and select
 * only). Composing at read time needs neither a new write permission nor a
 * schema change, and it cannot leave a member with a half-written row if it
 * fails. This is the read-time version.
 *
 * It is deliberately NARROW. It only ever replaces a line this module's own
 * check-in vocabulary produced, so a line that came from a longitudinal
 * trend or from a wearable is untouched, and it never invents a line where
 * the brief had none. Everything else in the brief is exactly what was
 * composed and stored.
 */
export function recomposeCheckinLines<
  T extends {
    sleep_summary: string | null;
    stress_summary: string | null;
    coaching_recommendation: string;
  },
>(
  brief: T,
  latestCheckin: DailyCheckin | null,
  localDate: string,
  /**
   * Today's Coaching Brain sentence, when the caller has one.
   *
   * The same staleness, in the same row: `coaching_recommendation` is
   * whatever the Brain said when the row was written, so a change to that
   * copy took a day to reach a member who had already opened the app. The
   * live walk found it still saying "today's most useful place to focus" on
   * Home hours after the sentence had been rewritten.
   *
   * Optional: a caller without a decision in hand leaves the stored line
   * alone rather than blanking it.
   */
  coachingRecommendation?: string | null
): T {
  const recency = checkinRecency(latestCheckin, localDate);
  const daysAgo = daysSinceCheckin(latestCheckin, localDate);

  const sleep =
    brief.sleep_summary === null || isCheckinSleepSentence(brief.sleep_summary)
      ? checkinSleepSummary(latestCheckin, recency, daysAgo)
      : brief.sleep_summary;
  const stress =
    brief.stress_summary === null || isCheckinStressSentence(brief.stress_summary)
      ? checkinStressSummary(latestCheckin, recency, daysAgo)
      : brief.stress_summary;

  // Never turn a line the brief had into nothing: if the recomposition
  // comes up empty (a check-in with no sleep value logged, say), the stored
  // line stands rather than the section disappearing mid-day.
  return {
    ...brief,
    sleep_summary: sleep ?? brief.sleep_summary,
    stress_summary: stress ?? brief.stress_summary,
    coaching_recommendation: coachingRecommendation ?? brief.coaching_recommendation,
  };
}

function checkinSleepSummary(
  latest: DailyCheckin | null,
  recency: CheckinRecency | null,
  daysAgo: number
): string | null {
  if (!latest || recency === null || latest.sleep_quality === null) return null;
  const status = sleepQualityStatus(latest.sleep_quality);
  if (status === 'no-data') return null;
  return recency === 'today'
    ? SLEEP_SENTENCE[status]
    : datedSentence(SLEEP_PHRASE[status], recency, daysAgo);
}

function checkinStressSummary(
  latest: DailyCheckin | null,
  recency: CheckinRecency | null,
  daysAgo: number
): string | null {
  if (!latest || recency === null || latest.stress_level === null) return null;
  const status = stressStatus(latest.stress_level);
  if (status === 'no-data') return null;
  return recency === 'today'
    ? STRESS_SENTENCE[status]
    : datedSentence(STRESS_PHRASE[status], recency, daysAgo);
}

/**
 * Root Presence System (Prompt 4): a one-time return greeting always wins
 * this slot outright (Bible §7's "no guilt, ever" — the very next thing
 * Root says to a member coming back from a gap must be the greeting, not
 * a streak or generic line). Absent that, a streak worth naming outranks
 * a real memory callback, which in turn outranks the Brain's own generic
 * encouragement line — same "real, specific, and true" bar every other
 * proactive message in this app holds itself to.
 */
function pickEncouragingMessage(
  streak: number,
  brainEncouragement: string,
  returnGreeting: string | null,
  memoryCallback: string | null
): string {
  if (returnGreeting) return returnGreeting;
  if (streak >= 3) {
    return `${streak} days in a row checking in, that consistency is exactly what moves the needle.`;
  }
  if (memoryCallback) return memoryCallback;
  return brainEncouragement;
}

export function composeMorningBrief(signals: MorningBriefSignals): ComposedMorningBrief {
  const {
    firstName,
    localDate,
    decision,
    recentCheckins,
    activeHabits,
    habitLogsToday,
    currentStreak,
    activeTrendInsights,
    continuitySentence,
    returnGreeting,
    memoryCallback,
  } = signals;
  const latestCheckin = recentCheckins[recentCheckins.length - 1] ?? null;
  const recency = checkinRecency(latestCheckin, localDate);
  const daysAgo = daysSinceCheckin(latestCheckin, localDate);

  // A real, multi-week/multi-day trend always outranks today's snapshot —
  // this is the difference between "here are today's numbers" and "I've
  // noticed something about you over time."
  const sleepTrend = trendFor(activeTrendInsights, ['sleep']);
  const stressTrend = trendFor(activeTrendInsights, ['stress']);
  const recoveryTrend = trendFor(activeTrendInsights, RECOVERY_PROXY_METRICS);

  const sleepSummary =
    sleepTrend?.member_summary ??
    decision.wearableBrief?.sleepRecommendation ??
    checkinSleepSummary(latestCheckin, recency, daysAgo);
  const stressSummary =
    stressTrend?.member_summary ??
    decision.wearableBrief?.stressRecommendation ??
    checkinStressSummary(latestCheckin, recency, daysAgo);
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
    encouragingMessage: pickEncouragingMessage(currentStreak, decision.encouragement, returnGreeting, memoryCallback),
    notablePatternTitle: notablePattern?.title ?? null,
    notablePatternSummary: notablePattern?.member_summary ?? null,
    incompleteRecommendation: continuitySentence,
    evidenceRefs,
  };
}
