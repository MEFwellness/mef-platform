/**
 * Root Proactive Coaching Engine — the module that turns everything the
 * app already knows about a member (the Coaching Brain's daily decision,
 * recent check-ins, habits, streaks) into the Daily Morning Brief. This
 * file only declares the pure composition shapes; lib/brain/,
 * lib/wellness/, and lib/ai/agents/accountability.ts remain the single
 * source of truth for the underlying numbers — nothing here re-derives a
 * score or trend a second way.
 */

import type {
  DailyCheckin,
  Habit,
  MorningBriefEvidenceRef,
  WellnessInsight,
} from '@mef/shared-types-contracts';
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
  /** The member's active/confirmed 'trend' rows from wellness_insights (lib/intelligence/trendEngine.ts's already-computed 30-vs-30-day + 7-day analysis) — real longitudinal language, never re-derived here. Severity-sorted by the caller (lib/intelligence/data.ts's listInsightsForMember). */
  activeTrendInsights: WellnessInsight[];
  /** lib/feed/continuity.ts's buildContinuitySentence, called by the service layer with the same FeedMemory Today's "A Note from Root" already builds — a real saved-but-not-completed lesson, never invented here. */
  continuitySentence: string | null;
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
  /** A real trend (digestion/movement/mood/hydration, etc.) not already covered by sleep/stress/recovery above — null when nothing meaningful is active. */
  notablePatternTitle: string | null;
  notablePatternSummary: string | null;
  incompleteRecommendation: string | null;
  evidenceRefs: MorningBriefEvidenceRef[];
};
