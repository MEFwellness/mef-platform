/**
 * The Priority Engine — deterministic candidate scoring, no randomness.
 * Every candidate below traces back to a real signal in `CoachingSignals`;
 * a signal that isn't present (no check-in yet, no sustained insight,
 * nothing saved) simply never produces a candidate, same discipline as
 * lib/ai/rules/engine.ts's leaf conditions never matching a null fact.
 *
 * Scores encode the milestone's own stated priority rules directly:
 *   - "Safety overrides education" -> safety_priority outranks the
 *     weekly-rhythm/education fallback by a wide margin.
 *   - "Recovery overrides movement" / "Sleep overrides performance" ->
 *     a 'poor' Daily Wellness Index priority metric (which sleep/stress
 *     naturally surface as when they're the worst-logged metric) scores
 *     above a merely-improving or rhythm-driven pick.
 *   - "Recent success allows progression" -> recent_improvement is a real
 *     candidate, just a low-scoring one — it only wins the day when
 *     nothing more pressing is happening, which is exactly when
 *     progression should be offered.
 *
 * There is always at least one candidate (the weekly-rhythm fallback), so
 * `pickPriority` never has an empty list to choose from.
 */

import { WELLNESS_METRIC_LABEL, type WellnessMetricKey } from '../wellness/wellness-index';
import type { DayOfWeek } from '../feed/timeContext';
import type { CoachingFocusArea, CoachingSignals, PriorityCandidate } from './types';

/**
 * The weekly coaching rhythm (Part 4, lib/feed/timeContext.ts's
 * WEEK_PHASE) reused as the Brain's lowest-priority fallback focus — the
 * one candidate that's always available. 'energy' is Saturday's Recovery
 * day; copy.ts's focusDisplayLabel renders it as "Recovery".
 */
const WEEKLY_RHYTHM_FOCUS: Record<DayOfWeek, CoachingFocusArea> = {
  monday: 'movement',
  tuesday: 'movement',
  wednesday: 'reflection',
  thursday: 'consistency',
  friday: 'education',
  saturday: 'energy',
  sunday: 'reflection',
};

const METRIC_KEYS: WellnessMetricKey[] = [
  'sleep',
  'stress',
  'energy',
  'mood',
  'hydration',
  'digestion',
  'movement',
  'pain',
];

/** Matches a narrative sentence to a real wellness metric by name — same "does the text actually say this" discipline as narrative/coachingReference.ts's pickCoachingReferenceSentence, never a guess when nothing matches. */
export function matchMetricInText(text: string): WellnessMetricKey | null {
  const haystack = text.toLowerCase();
  return (
    METRIC_KEYS.find((key) => haystack.includes(WELLNESS_METRIC_LABEL[key].toLowerCase())) ?? null
  );
}

/** True for the 8 metric-driven focus areas, false for 'consistency' / 'reflection' / 'education' — used by callers (lib/feed/service.ts) that need a WellnessMetricKey specifically, e.g. to match content authored for a given metric. */
export function isWellnessMetricFocus(focus: CoachingFocusArea): focus is WellnessMetricKey {
  return (METRIC_KEYS as CoachingFocusArea[]).includes(focus);
}

function buildCandidates(signals: CoachingSignals): PriorityCandidate[] {
  const candidates: PriorityCandidate[] = [];

  if (signals.hasActiveSafetyConcern) {
    // The specific area still comes from real data (the worst-logged
    // metric today, if any) — only the *reason* and its outsized score
    // are safety-driven, per "never bypass existing escalation logic."
    candidates.push({
      focus: signals.wellnessIndex?.priority?.key ?? 'stress',
      reason: 'safety_priority',
      score: 92,
    });
  }

  if (signals.streak.daysSinceLastCheckin !== null && signals.streak.daysSinceLastCheckin >= 2) {
    candidates.push({ focus: 'consistency', reason: 'streak_recovery', score: 80 });
  }

  if (signals.adherence.level === 'low') {
    candidates.push({ focus: 'consistency', reason: 'low_adherence', score: 78 });
  }

  const sustained = signals.insights.find((i) => i.kind === 'sustained');
  if (sustained) {
    candidates.push({ focus: sustained.key, reason: 'long_term_pattern', score: 76 });
  }

  if (signals.wellnessIndex?.priority) {
    const priority = signals.wellnessIndex.priority;
    const score = priority.status === 'poor' ? 75 : priority.status === 'attention' ? 60 : 20;
    candidates.push({ focus: priority.key, reason: 'recent_checkins', score });
  }

  if (signals.unresolvedAssessmentFocus) {
    candidates.push({
      focus: signals.unresolvedAssessmentFocus,
      reason: 'recent_assessment',
      score: 65,
    });
  }

  if (signals.hasSavedCarryover) {
    candidates.push({ focus: 'consistency', reason: 'incomplete_habits', score: 55 });
  }

  if (signals.streak.justRecovered) {
    candidates.push({ focus: 'consistency', reason: 'streak_recovery', score: 45 });
  }

  const improving = signals.insights.find((i) => i.kind === 'trend' && i.direction === 'improving');
  if (improving) {
    candidates.push({ focus: improving.key, reason: 'recent_improvement', score: 35 });
  }

  // Milestone 6's Personal Wellness Intelligence Engine's own confirmed
  // long-term read — deliberately scored below the short-term sustained
  // signal above (76) and below today's real Daily Wellness Index
  // priority (60-75), so a longer-term, potentially-staler pattern
  // informs today's focus without ever overriding what's actually
  // happening today. Still outranks the weekly-rhythm fallback, since a
  // confirmed longitudinal concern is more real than a generic default.
  if (signals.confirmedLongTermConcern) {
    candidates.push({
      focus: signals.confirmedLongTermConcern,
      reason: 'long_term_pattern',
      score: 50,
    });
  }

  // Always-available fallback — the weekly coaching rhythm.
  candidates.push({
    focus: WEEKLY_RHYTHM_FOCUS[signals.dayOfWeek],
    reason: 'weekly_rhythm',
    score: 10,
  });

  return candidates;
}

/** Highest score wins; ties keep the earlier (higher in buildCandidates) entry — deterministic, never random. */
export function pickPriority(signals: CoachingSignals): PriorityCandidate {
  const candidates = buildCandidates(signals);
  return candidates.reduce((best, candidate) => (candidate.score > best.score ? candidate : best));
}
