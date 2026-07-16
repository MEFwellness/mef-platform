/**
 * Root Proactive Coaching Engine — the module that turns everything the
 * app already knows about a member (the Coaching Brain's daily decision,
 * recent check-ins, habits, streaks) into the Daily Morning Brief. This
 * file only declares the pure composition shapes; lib/brain/,
 * lib/wellness/, and lib/ai/agents/accountability.ts remain the single
 * source of truth for the underlying numbers — nothing here re-derives a
 * score or trend a second way.
 */

import type { DailyCheckin, Habit, MorningBriefEvidenceRef } from '@mef/shared-types-contracts';
import type { CoachingFocusDecision } from '../brain/types';

export type MorningBriefSignals = {
  firstName: string;
  localDate: string;
  decision: CoachingFocusDecision;
  /** Oldest-first, same ordering getRecentCheckins/fetchHistoryCheckins already use. */
  recentCheckins: DailyCheckin[];
  activeHabits: Habit[];
  habitLogsToday: Record<string, boolean>;
  /** lib/ai/agents/accountability.ts's currentStreakLength over recentCheckins — computed by the caller so this stays a pure function of already-fetched data. */
  currentStreak: number;
};

export type ComposedMorningBrief = {
  greetingName: string;
  focusArea: string;
  focusLabel: string;
  /** Null exactly when there's nothing real to say — never a filler sentence. */
  recoverySummary: string | null;
  sleepSummary: string | null;
  stressSummary: string | null;
  habitToPrioritize: string | null;
  coachingRecommendation: string;
  encouragingMessage: string;
  evidenceRefs: MorningBriefEvidenceRef[];
};
