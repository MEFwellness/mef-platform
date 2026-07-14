/**
 * Wellness Identity — confidence-weighted observations about how this
 * member responds to coaching (never what their metrics are doing; that
 * stays lib/intelligence/'s job). Every function here either (a) derives a
 * genuinely new correlation from raw check-in/feed/conversation history
 * with an explicit minimum-sample gate, or (b) re-wraps a pattern the MEF
 * Intelligence Engine already detected (report.patterns) into
 * identity-level language — never a second, possibly-diverging detector
 * for the same fact.
 *
 * Three domains declared in the shared WellnessIdentityDomain union
 * (task_load_tolerance, emotional_language, confidence_calibration) have no
 * deriveX() function below on purpose: today's data model has no signal
 * that honestly supports them (no multi-task-per-day model, no sentiment
 * analysis over conversation text). Reserved for when that data exists —
 * see the FUTURE READY notes in service.ts. Never fabricated in the
 * meantime, per the milestone's "do not fabricate observations."
 */

import type { ConversationMemoryItem, DailyCheckin } from '@mef/shared-types-contracts';
import { average, confidenceFromSample } from '../intelligence/confidence';
import { daysBetweenLocalDates } from '../feed/dateMath';
import type { FeedHistoryPair } from '../feed/memory';
import type { MemberHealthProfile, MemberIntelligenceReport } from '../intelligence-engine/types';
import type { WellnessIdentityObservationDraft } from './types';

const MIN_STREAK_BREAKS = 3;
const MIN_BUCKET_SAMPLE = 4;
const MIN_CHECKIN_PAIRS = 4;
const SHORT_CONTENT_MINUTES = 10;

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** Consecutive-day completion run lengths that ended in a miss — the trailing, still-open run is excluded since it hasn't actually broken yet. */
function completedStreakBreakLengths(historyPairs: FeedHistoryPair[]): number[] {
  const sorted = [...historyPairs].sort((a, b) =>
    a.feedItem.local_date.localeCompare(b.feedItem.local_date)
  );
  const breaks: number[] = [];
  let run = 0;
  for (const { feedItem } of sorted) {
    if (feedItem.completed_at) {
      run++;
    } else if (run > 0) {
      breaks.push(run);
      run = 0;
    }
  }
  return breaks;
}

export function deriveHabitAdherenceObservation(
  historyPairs: FeedHistoryPair[]
): WellnessIdentityObservationDraft | null {
  const breaks = completedStreakBreakLengths(historyPairs);
  if (breaks.length < MIN_STREAK_BREAKS) return null;

  const avgBreak = average(breaks);
  if (avgBreak === null) return null;
  const rounded = Math.max(1, Math.round(avgBreak));

  return {
    domain: 'habit_adherence',
    observationKey: 'habit_adherence_streak_break_window',
    statement: `You tend to stay consistent with daily coaching for about ${rounded} day${rounded === 1 ? '' : 's'} in a row before missing one — a lighter check-in around day ${rounded} could help it stick longer.`,
    coachDetail: `Across ${breaks.length} observed streak breaks, the average consistent run before a miss was ${avgBreak.toFixed(1)} days (individual runs: ${breaks.join(', ')}).`,
    confidence: confidenceFromSample(breaks.length, 0.5, 8, 0.85),
    evidenceCount: breaks.length,
    evidenceRefs: [
      { type: 'daily_feed_history', id: `${breaks.length}_streak_breaks`, note: `avg ${avgBreak.toFixed(1)} days` },
    ],
    memberVisible: true,
  };
}

export function deriveTimeCommitmentObservation(
  historyPairs: FeedHistoryPair[]
): WellnessIdentityObservationDraft | null {
  const withContent = historyPairs.filter((p) => p.content !== null);
  const short = withContent.filter((p) => p.content!.estimated_reading_minutes <= SHORT_CONTENT_MINUTES);
  const long = withContent.filter((p) => p.content!.estimated_reading_minutes > SHORT_CONTENT_MINUTES);
  if (short.length < MIN_BUCKET_SAMPLE || long.length < MIN_BUCKET_SAMPLE) return null;

  const shortRate = short.filter((p) => p.feedItem.completed_at).length / short.length;
  const longRate = long.filter((p) => p.feedItem.completed_at).length / long.length;
  if (shortRate - longRate < 0.25) return null;

  return {
    domain: 'time_commitment',
    observationKey: 'time_commitment_short_content_preference',
    statement: `You stay engaged most reliably when today's coaching takes ${SHORT_CONTENT_MINUTES} minutes or less (${pct(shortRate)} completion, vs. ${pct(longRate)} for longer content).`,
    coachDetail: `Completion rate on content ≤${SHORT_CONTENT_MINUTES} min: ${pct(shortRate)} (n=${short.length}). Completion rate on longer content: ${pct(longRate)} (n=${long.length}).`,
    confidence: confidenceFromSample(short.length + long.length, 0.5, 20, 0.85),
    evidenceCount: short.length + long.length,
    evidenceRefs: [
      { type: 'daily_feed_history', id: 'content_duration_split', note: `short=${short.length}, long=${long.length}` },
    ],
    memberVisible: true,
  };
}

export function deriveMovementResponseObservation(
  checkinsOldestFirst: DailyCheckin[]
): WellnessIdentityObservationDraft | null {
  const withData = checkinsOldestFirst.filter((c) => c.movement_today !== null && c.mood_level !== null);
  const moved = withData.filter((c) => c.movement_today !== 'none');
  const rested = withData.filter((c) => c.movement_today === 'none');
  if (moved.length < MIN_BUCKET_SAMPLE || rested.length < MIN_BUCKET_SAMPLE) return null;

  const movedAvgMood = average(moved.map((c) => c.mood_level!))!;
  const restAvgMood = average(rested.map((c) => c.mood_level!))!;
  if (movedAvgMood - restAvgMood < 0.6) return null;

  return {
    domain: 'movement_response',
    observationKey: 'movement_response_mood_lift',
    statement: `Your mood tends to be noticeably better on days you move your body — even a little — compared to rest days.`,
    coachDetail: `Avg mood on movement days: ${movedAvgMood.toFixed(1)}/5 (n=${moved.length}). Avg mood on no-movement days: ${restAvgMood.toFixed(1)}/5 (n=${rested.length}).`,
    confidence: confidenceFromSample(moved.length + rested.length, 0.5, 20, 0.85),
    evidenceCount: moved.length + rested.length,
    evidenceRefs: [
      { type: 'daily_checkin_range', id: 'movement_vs_mood', note: `${moved.length} moved, ${rested.length} rest` },
    ],
    memberVisible: true,
  };
}

/** Consecutive-day (gap === 1) pairs with real data on both sides for the two fields requested. */
function consecutivePairs<T>(
  checkinsOldestFirst: DailyCheckin[],
  field1: (c: DailyCheckin) => T | null,
  field2: (c: DailyCheckin) => T | null
): { a: T; b: T }[] {
  const pairs: { a: T; b: T }[] = [];
  for (let i = 0; i < checkinsOldestFirst.length - 1; i++) {
    const today = checkinsOldestFirst[i]!;
    const tomorrow = checkinsOldestFirst[i + 1]!;
    if (daysBetweenLocalDates(today.local_date, tomorrow.local_date) !== 1) continue;
    const a = field1(today);
    const b = field2(tomorrow);
    if (a === null || b === null) continue;
    pairs.push({ a, b });
  }
  return pairs;
}

export function deriveSleepCorrelationObservation(
  checkinsOldestFirst: DailyCheckin[]
): WellnessIdentityObservationDraft | null {
  const pairs = consecutivePairs(
    checkinsOldestFirst,
    (c) => c.stress_level,
    (c) => c.sleep_quality
  );
  const highStress = pairs.filter((p) => p.a >= 4);
  const lowStress = pairs.filter((p) => p.a <= 2);
  if (highStress.length < MIN_CHECKIN_PAIRS || lowStress.length < MIN_CHECKIN_PAIRS) return null;

  const highStressNextSleep = average(highStress.map((p) => p.b))!;
  const lowStressNextSleep = average(lowStress.map((p) => p.b))!;
  if (lowStressNextSleep - highStressNextSleep < 0.7) return null;

  return {
    domain: 'sleep_correlation',
    observationKey: 'sleep_correlation_stress_predicts_sleep',
    statement: `Higher stress tends to be followed by worse sleep the next night.`,
    coachDetail: `Avg next-night sleep quality after a high-stress day: ${highStressNextSleep.toFixed(1)}/5 (n=${highStress.length}). After a low-stress day: ${lowStressNextSleep.toFixed(1)}/5 (n=${lowStress.length}).`,
    confidence: confidenceFromSample(highStress.length + lowStress.length, 0.5, 15, 0.85),
    evidenceCount: highStress.length + lowStress.length,
    evidenceRefs: [
      { type: 'daily_checkin_range', id: 'stress_then_sleep', note: `${highStress.length} high-stress, ${lowStress.length} low-stress pairs` },
    ],
    memberVisible: true,
  };
}

export function derivePainCorrelationObservation(
  checkinsOldestFirst: DailyCheckin[]
): WellnessIdentityObservationDraft | null {
  const pairs = consecutivePairs(
    checkinsOldestFirst,
    (c) => c.sleep_quality,
    (c) => c.pain_discomfort_level
  );
  const poorSleep = pairs.filter((p) => p.a <= 2);
  const goodSleep = pairs.filter((p) => p.a >= 4);
  if (poorSleep.length < MIN_CHECKIN_PAIRS || goodSleep.length < MIN_CHECKIN_PAIRS) return null;

  const poorSleepNextPain = average(poorSleep.map((p) => p.b))!;
  const goodSleepNextPain = average(goodSleep.map((p) => p.b))!;
  if (poorSleepNextPain - goodSleepNextPain < 0.6) return null;

  return {
    domain: 'pain_correlation',
    observationKey: 'pain_correlation_sleep_predicts_pain',
    statement: `Poor sleep tends to be followed by more noticeable pain or discomfort the next day.`,
    coachDetail: `Avg next-day pain after poor sleep: ${poorSleepNextPain.toFixed(1)}/5 (n=${poorSleep.length}). After good sleep: ${goodSleepNextPain.toFixed(1)}/5 (n=${goodSleep.length}).`,
    confidence: confidenceFromSample(poorSleep.length + goodSleep.length, 0.5, 15, 0.85),
    evidenceCount: poorSleep.length + goodSleep.length,
    evidenceRefs: [
      { type: 'daily_checkin_range', id: 'sleep_then_pain', note: `${poorSleep.length} poor-sleep, ${goodSleep.length} good-sleep pairs` },
    ],
    memberVisible: true,
  };
}

/** Re-wraps an already-detected Intelligence Engine pattern into identity-level language — never a second detector for the same fact. */
export function deriveEngagementRhythmObservation(
  report: MemberIntelligenceReport
): WellnessIdentityObservationDraft | null {
  const pattern = report.patterns.find((p) => p.kind === 'weekend_adherence');
  if (!pattern) return null;

  return {
    domain: 'engagement_rhythm',
    observationKey: 'engagement_rhythm_weekend_adherence',
    statement: pattern.description,
    coachDetail: pattern.description,
    confidence: pattern.confidence,
    evidenceCount: Math.max(1, pattern.evidenceRefs.length),
    evidenceRefs: pattern.evidenceRefs,
    memberVisible: true,
  };
}

/** Re-wraps the Engine's registry-derived pattern (a published body-assessment/coach-intelligence finding — see lib/intelligence-engine/registryFindings.ts) into identity-level language — never a second detector for the same fact. */
export function deriveMovementResponseFromRegistryObservation(
  report: MemberIntelligenceReport
): WellnessIdentityObservationDraft | null {
  const pattern = report.patterns.find((p) => p.kind === 'body_assessment_finding');
  if (!pattern) return null;

  return {
    domain: 'movement_response',
    observationKey: 'movement_response_body_assessment_finding',
    statement: pattern.description,
    coachDetail: pattern.description,
    confidence: pattern.confidence,
    evidenceCount: Math.max(1, pattern.evidenceRefs.length),
    evidenceRefs: pattern.evidenceRefs,
    memberVisible: true,
  };
}

export function deriveMotivationStyleObservation(
  report: MemberIntelligenceReport
): WellnessIdentityObservationDraft | null {
  const pattern = report.patterns.find((p) => p.kind === 'effective_coaching_strategy');
  if (!pattern) return null;

  return {
    domain: 'motivation_style',
    observationKey: 'motivation_style_effective_strategy',
    statement: pattern.description,
    coachDetail: pattern.description,
    confidence: pattern.confidence,
    evidenceCount: Math.max(1, pattern.evidenceRefs.length),
    evidenceRefs: pattern.evidenceRefs,
    memberVisible: true,
  };
}

export function deriveCoachingPreferenceObservation(
  profile: MemberHealthProfile,
  conversationMemory: ConversationMemoryItem[]
): WellnessIdentityObservationDraft | null {
  const narrativePrefs = profile.narrativeItems
    .filter((i) => i.category === 'coaching_preferences' && i.status === 'active' && i.member_visible)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const memoryPrefs = conversationMemory.filter((m) => m.memory_type === 'preference');

  if (narrativePrefs.length === 0) return null;

  const latest = narrativePrefs[0]!;
  const evidenceCount = narrativePrefs.length + memoryPrefs.length;

  return {
    domain: 'coaching_preference',
    observationKey: 'coaching_preference_from_narrative',
    statement: latest.summary,
    coachDetail: `${latest.title}: ${latest.summary} (corroborated by ${narrativePrefs.length} narrative item(s) and ${memoryPrefs.length} conversation memory item(s)).`,
    confidence: confidenceFromSample(evidenceCount, 0.55, 6, 0.85),
    evidenceCount,
    evidenceRefs: [{ type: 'narrative_item', id: latest.id }],
    memberVisible: latest.member_visible,
  };
}

export function deriveAllIdentityObservationDrafts(
  profile: MemberHealthProfile,
  report: MemberIntelligenceReport,
  conversationMemory: ConversationMemoryItem[]
): WellnessIdentityObservationDraft[] {
  return [
    deriveHabitAdherenceObservation(profile.feedHistoryPairs),
    deriveTimeCommitmentObservation(profile.feedHistoryPairs),
    deriveMovementResponseObservation(profile.checkinsOldestFirst),
    deriveSleepCorrelationObservation(profile.checkinsOldestFirst),
    derivePainCorrelationObservation(profile.checkinsOldestFirst),
    deriveEngagementRhythmObservation(report),
    deriveMotivationStyleObservation(report),
    deriveMovementResponseFromRegistryObservation(report),
    deriveCoachingPreferenceObservation(profile, conversationMemory),
  ].filter((d): d is WellnessIdentityObservationDraft => d !== null);
}
