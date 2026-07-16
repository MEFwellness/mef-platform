/**
 * Pure composer for the Daily Morning Brief — takes already-fetched
 * signals (the Coaching Brain's decision, recent check-ins, habits,
 * streak) and produces the exact fields coach_morning_briefs persists.
 * No I/O here; lib/coaching-engine/service.ts owns fetching signals and
 * persisting the result, same draft/service split every other engine in
 * this codebase uses (lib/intelligence/trendEngine.ts + service.ts,
 * lib/brain/decision.ts + service.ts).
 *
 * Every section is null, not a filler sentence, when there's nothing real
 * behind it — a member with no wearable sees no Recovery Status line
 * rather than a guess, matching the milestone's "never use generic text
 * if meaningful data exists [otherwise say nothing]" requirement.
 */

import type { DailyCheckin, MorningBriefEvidenceRef } from '@mef/shared-types-contracts';
import { sleepQualityStatus, stressStatus, STATUS_LABEL } from '../wellness/status';
import { selectHabitToPrioritize } from './habitSelection';
import type { ComposedMorningBrief, MorningBriefSignals } from './types';

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
  const { firstName, decision, recentCheckins, activeHabits, habitLogsToday, currentStreak } =
    signals;
  const latestCheckin = recentCheckins[recentCheckins.length - 1] ?? null;

  const recoverySummary = decision.wearableBrief?.recoveryStatus ?? null;
  const sleepSummary =
    decision.wearableBrief?.sleepRecommendation ?? checkinSleepSummary(latestCheckin);
  const stressSummary =
    decision.wearableBrief?.stressRecommendation ?? checkinStressSummary(latestCheckin);

  const habit = selectHabitToPrioritize(activeHabits, habitLogsToday, decision.focus);

  const evidenceRefs: MorningBriefEvidenceRef[] = [
    ...(latestCheckin ? [{ type: 'daily_checkin', id: latestCheckin.id }] : []),
    ...(habit ? [{ type: 'habit', id: habit.id }] : []),
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
    evidenceRefs,
  };
}
