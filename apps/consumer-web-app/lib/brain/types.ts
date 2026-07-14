/**
 * The MEF Coaching Brain (Milestone 5) — shared types.
 *
 * The Brain is the single deterministic decision layer every coaching
 * surface asks "what does this member need today, and why" instead of
 * deciding that independently. It never talks to the database and never
 * calls an LLM — it is a pure function over `CoachingSignals`, which are
 * themselves plain, already-real facts assembled by lib/brain/service.ts
 * from data every other milestone already computes (the Daily Wellness
 * Index, wellness insights, streak intelligence, adaptive difficulty,
 * the Member Coaching Memory, the Member Health Narrative, and Milestone
 * 1's safety restrictions). Nothing here invents a number or a claim.
 *
 * `CoachingFocusArea` is deliberately `WellnessMetricKey | 'consistency' |
 * 'reflection' | 'education'` rather than a brand-new taxonomy — every
 * metric-driven focus reuses the exact same key the Daily Wellness Index,
 * the content selector, and the coaching copy already use, so "sleep"
 * means the same thing everywhere in the app. See copy.ts's
 * `focusDisplayLabel` for how this same small set of keys produces every
 * example focus area the milestone lists (Movement, Recovery, Breathing,
 * Nutrition, Stress, Sleep, Hydration, Mindset, Consistency, Reflection,
 * Education) without a second enum to keep in sync.
 */

import type { NarrativeItem } from '@mef/shared-types-contracts';
import type { WellnessMetricKey, WellnessIndexResult } from '../wellness/wellness-index';
import type { WellnessInsight } from '../wellness/insights';
import type { AdherenceInfo } from '../feed/adaptiveDifficulty';
import type { StreakInsight } from '../feed/streakIntelligence';
import type { DayOfWeek } from '../feed/timeContext';
import type { WearableDailySnapshot } from '../wearables/snapshot';
import type { WearableCoachingBrief } from './wearableRecommendations';

export type CoachingFocusArea = WellnessMetricKey | 'consistency' | 'reflection' | 'education';

/**
 * Matches the milestone's own "Determine WHY that focus was chosen"
 * examples one-to-one — every candidate the priority engine considers is
 * tagged with exactly one of these, and the rendered reason sentence
 * (copy.ts's `buildReasonText`) is keyed off it.
 */
export type CoachingReasonKind =
  | 'recent_checkins'
  | 'incomplete_habits'
  | 'low_adherence'
  | 'recent_improvement'
  | 'long_term_pattern'
  | 'coach_assignment'
  | 'recent_assessment'
  | 'streak_recovery'
  | 'weekly_rhythm'
  | 'safety_priority';

export type CoachingMode =
  'encourage' | 'challenge' | 'recover' | 'educate' | 'celebrate' | 'reset' | 'maintain';

export type ChallengeLevel = 'lighter' | 'standard' | 'stretch';

export type RiskLevel = 'none' | 'watch' | 'elevated';

/**
 * Every fact the deterministic engines read — assembled once per
 * member/day by lib/brain/service.ts from real rows, never fabricated.
 * A candidate signal that has no real data behind it must be `null`
 * (or the type's natural "nothing here" value), never guessed at, same
 * discipline as lib/ai/rules/engine.ts's leaf conditions never matching a
 * null fact.
 */
export type CoachingSignals = {
  localDate: string;
  dayOfWeek: DayOfWeek;
  wellnessIndex: WellnessIndexResult | null;
  insights: WellnessInsight[];
  adherence: AdherenceInfo;
  streak: StreakInsight;
  /** A previously saved-but-not-completed lesson is still waiting — Part 3's "incomplete habit" signal. */
  hasSavedCarryover: boolean;
  /** True when Milestone 1's safety layer currently restricts a topic for this member, or today's own check-in flagged a new/worsening concern. Never bypassed — see riskEngine.ts. */
  hasActiveSafetyConcern: boolean;
  /** A real, already-recorded `unresolved_concerns` narrative item from the most recent reassessment, matched to a wellness metric by name — null when there isn't one, or it can't be confidently mapped to a metric. */
  unresolvedAssessmentFocus: WellnessMetricKey | null;
  /** The most recent genuine win, if any (lib/feed/memory.ts's pickRecentWin) — reused, never re-derived. */
  recentWin: NarrativeItem | null;
  /**
   * Milestone 6's Personal Wellness Intelligence Engine's own confirmed
   * long-term read (a declining/recurring_pattern trend, active or
   * coach-confirmed, updated recently enough not to be stale — see
   * lib/brain/service.ts's freshness check) — informs the Brain's daily
   * decision without replacing it, per that engine's own "do not allow
   * stale insights to control current coaching indefinitely" rule. Null
   * when there is no such confirmed long-term concern, or it's gone
   * stale.
   */
  confirmedLongTermConcern: WellnessMetricKey | null;
  /** Today's real wearable numbers (from registry_entries, domain='wearable'), or null when the member has no connected/synced wearable yet — the Part 5 Daily Coaching Brief's recovery/movement/stress/sleep lines render nothing rather than a guess when this is null. */
  wearableSnapshot: WearableDailySnapshot | null;
};

/** The priority engine's single chosen candidate, before mode/challenge/risk are layered on. */
export type PriorityCandidate = {
  focus: CoachingFocusArea;
  reason: CoachingReasonKind;
  /** Always present — "every decision must have a priority score," never a random pick. Higher wins. */
  score: number;
};

/**
 * The Daily Decision Object (content-agnostic half) — what the Brain
 * itself can determine without knowing which specific lesson exists.
 * Callers that also have a selected MefContentItem (the Daily page, a
 * coach panel) attach `lesson`/`action`/`reflectionPrompt` themselves from
 * that item; the Brain never invents lesson content.
 */
export type CoachingFocusDecision = {
  localDate: string;
  focus: CoachingFocusArea;
  focusLabel: string;
  reason: CoachingReasonKind;
  reasonText: string;
  mode: CoachingMode;
  challengeLevel: ChallengeLevel;
  riskLevel: RiskLevel;
  isCelebration: boolean;
  encouragement: string;
  coachInsight: string | null;
  /** Part 5's recovery/movement/stress/sleep recommendation lines — null exactly when signals.wearableSnapshot is null (no wearable connected/synced yet). */
  wearableBrief: WearableCoachingBrief | null;
  /** Straight passthrough of signals.wearableSnapshot — the raw numbers (readiness, sleep duration, HRV, etc.) behind wearableBrief's sentences, for a UI stat card that wants the real number rather than only the recommendation text. */
  wearableSnapshot: WearableDailySnapshot | null;
  generatedAt: string;
};
