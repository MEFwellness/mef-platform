/**
 * Templated Coaching Brain copy — same discipline as lib/feed/copy.ts's
 * own docblock: every sentence is a fixed template plus real substituted
 * values (a focus label, a real day count), never freeform generation.
 * `focusDisplayLabel` is what lets the small `CoachingFocusArea` union
 * (reusing WellnessMetricKey directly, see types.ts) produce every
 * example focus area the milestone lists without a second, parallel enum.
 */

import type { CoachingMode, CoachingFocusArea, CoachingReasonKind, CoachingSignals } from './types';
import type { RecoveryLevel } from '../wearables/trends';

const BASE_FOCUS_LABEL: Record<CoachingFocusArea, string> = {
  sleep: 'Sleep',
  stress: 'Stress',
  energy: 'Recovery',
  mood: 'Mindset',
  hydration: 'Hydration',
  digestion: 'Nutrition',
  movement: 'Movement',
  pain: 'Recovery',
  consistency: 'Consistency',
  reflection: 'Reflection',
  education: 'Education',
};

/** The one place `focus + mode` becomes a member-facing label — a stress focus in Recover/Reset mode reads as "Breathing", never plain "Stress", matching the milestone's own example vocabulary. */
export function focusDisplayLabel(focus: CoachingFocusArea, mode: CoachingMode): string {
  if (focus === 'stress' && (mode === 'recover' || mode === 'reset')) return 'Breathing';
  return BASE_FOCUS_LABEL[focus];
}

function lower(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/** One templated sentence per reason kind — mirrors lib/feed/copy.ts's buildFocusText/buildWhyText discipline exactly. */
export function buildReasonText(
  reason: CoachingReasonKind,
  focus: CoachingFocusArea,
  mode: CoachingMode,
  signals: CoachingSignals
): string {
  const label = lower(focusDisplayLabel(focus, mode));

  switch (reason) {
    case 'recent_checkins':
      return `Your recent check-ins point to ${label} as today's most useful place to focus.`;
    case 'incomplete_habits':
      return 'Something you saved for later is still waiting — today is a good day to finish it.';
    case 'low_adherence':
      return `Your coaching feed has been harder to keep up with lately, so today is intentionally about ${label}.`;
    case 'recent_improvement':
      return `${focusDisplayLabel(focus, mode)} has been improving lately — today builds on that momentum.`;
    case 'long_term_pattern':
      return `${focusDisplayLabel(focus, mode)} has been a sustained pattern in your check-ins, worth continued attention.`;
    case 'coach_assignment':
      return "Your coach chose today's focus for you directly.";
    case 'recent_assessment':
      return `Your latest reassessment flagged ${label} as an area still worth attention.`;
    case 'streak_recovery':
      return signals.streak.daysSinceLastCheckin !== null &&
        signals.streak.daysSinceLastCheckin >= 2
        ? "It's been a few days since your last check-in — today is about easing back in, not catching up."
        : "You're picking your consistency back up, and today keeps that going.";
    case 'weekly_rhythm':
      return `Today's rhythm in the week naturally calls for a bit of ${label}.`;
    case 'safety_priority':
      return 'Coaching intensity is intentionally lower today while your coach reviews something you recently shared.';
  }
}

/**
 * Shared wearable coaching voice — the one place either surface that
 * turns a wearable fact into member-facing text draws from: the Daily
 * Coaching Brief (lib/brain/wearableRecommendations.ts, today's snapshot)
 * and the Proactive AI Coach (lib/ai/agents/proactiveCoachCopy.ts,
 * multi-day trend events). Same discipline as buildReasonText above —
 * fixed template, never freeform — so "excellent recovery" reads
 * identically whichever surface says it, instead of two independently
 * hand-written sentences drifting apart over time.
 */

/** Today's recovery level, as one sentence — reused verbatim by the Proactive Coach's "recovery_excellent" nudge for the 'excellent' case. */
export function recoveryLevelText(level: RecoveryLevel): string {
  switch (level) {
    case 'excellent':
      return "Your recovery is excellent today — your body is well-rested and ready to be pushed a little.";
    case 'good':
      return 'Your recovery is solid today — a normal, steady day is a good call.';
    case 'fair':
      return 'Your recovery is a bit lower than usual today — nothing alarming, just worth being gentler with yourself.';
    case 'poor':
      return 'Your recovery is low today — today is a good day to prioritize rest over intensity.';
  }
}

/** Today's step count, as one movement recommendation sentence. */
export function movementRecommendationText(steps: number): string {
  if (steps < 3000) return 'Movement has been light — even a 10-minute walk today would help.';
  if (steps < 7000) return "You're moving, but there's room for a bit more today if it feels right.";
  return "You're staying active — keep it up.";
}

/** Today's stress score (0-100, higher = more stressed), as one recommendation sentence. */
export function stressLevelRecommendationText(stressScore: number): string {
  if (stressScore >= 70) {
    return 'Your stress has been elevated — a few minutes of slow breathing today can help more than it seems.';
  }
  if (stressScore >= 40) return 'Your stress is moderate today — worth a short pause somewhere in your day.';
  return 'Your stress levels look calm today.';
}

/** Last night's sleep duration in hours, as one recommendation sentence. */
export function sleepDurationRecommendationText(hours: number): string {
  if (hours < 6) return 'Last night was short on sleep — an earlier wind-down tonight would go a long way.';
  if (hours < 7) return 'Sleep was a little light last night — nothing urgent, just worth protecting tonight.';
  return 'You got a solid night of sleep — that foundation makes everything else easier today.';
}

/** A real 3-day HRV decline, as the Proactive Coach's own observe-then-coach message. */
export function hrvTrendDecliningText(): string {
  return (
    'Your HRV has been trending downward for three days — your body is asking for a bit more ' +
    "recovery than usual. Today's a good day to keep things lighter: a short walk, extra water, " +
    'an early night.'
  );
}

/** A real multi-night sleep decline — distinct from sleepDurationRecommendationText above, which speaks to a single night's absolute duration rather than a trend across nights. */
export function sleepTrendDecliningText(): string {
  return (
    "I noticed your sleep has been decreasing over the last few nights. It doesn't need to be " +
    'a big shift — a slightly earlier wind-down tonight is often enough to turn this around.'
  );
}

export function activityTrendDecliningText(): string {
  return (
    "Your activity has been lighter than usual the last few days. No judgment here — just a " +
    'gentle nudge that even a short walk today would help.'
  );
}

export function stressTrendRisingText(): string {
  return (
    'Your stress has been elevated the last few days. A few minutes of slow, intentional breathing ' +
    'today can make a real difference — your coaching feed has something ready if you want it.'
  );
}

export function stressTrendEasingText(): string {
  return 'Your stress levels have been coming down the last few days — whatever you’re doing, keep it up.';
}

export function wearableConnectedText(providerLabel: string): string {
  return (
    `Thanks for connecting ${providerLabel} — I'll use this to personalize your coaching, and ` +
    "I'll let you know if I notice anything worth your attention."
  );
}
