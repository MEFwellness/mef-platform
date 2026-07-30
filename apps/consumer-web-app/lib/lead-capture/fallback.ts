/**
 * Deterministic templated copy used whenever the LLM provider is
 * unconfigured or a call fails — a prospect must never see a broken
 * widget. Mirrors lib/conversation-coach/fallback.ts's role for Root.
 * Topic-specific but not personalized to the lead's own answers beyond the
 * pattern name (that deeper personalization only exists on the real LLM
 * path); still observational, non-diagnostic, and on-brand — see
 * docs/LEAD_AGENT_VOICE.md for the voice standard this follows.
 *
 * The pattern name itself is never a fallback concern: pattern.ts is a
 * plain deterministic function, not an LLM call, so it's assigned
 * correctly whether or not the LLM is configured.
 *
 * The follow-up question text below is read from followUpScript.ts — the
 * single source of truth it shares with quickReplies.ts's buttons — rather
 * than being hand-duplicated here, so this file can never drift out of
 * sync with the buttons offered alongside it.
 */

import type { LeadConversationStage, LeadTopic, LeadRoutingDestination, LeadPatternName } from '@mef/shared-types-contracts';
import { getDiscoveryCallUrl, getQuizGuideUrl } from './env';
import { FOLLOW_UP_SCRIPT } from './followUpScript';

/** Static — always the same regardless of LLM availability, so the opening turn never needs a provider call at all. */
export const OPENING_MESSAGE = "What's been bothering you most lately?";
export const QUICK_REPLY_OPTIONS = ['Pain', 'Energy', 'Sleep', 'Stress', 'Weight'] as const;

/** Shown when the widget reopens after being dismissed before the visitor answered anything — acknowledges the return without referencing the close. */
export const REOPEN_MESSAGE = "Still thinking about something? Tell me what's been going on.";

export function buildFallbackFollowUp(
  stage: Exclude<LeadConversationStage, 'opening' | 'insight_capture' | 'routed'>,
  topic: LeadTopic
): string {
  return FOLLOW_UP_SCRIPT[stage][topic].question;
}

/**
 * PART ONE of the insight, per pattern name — connects the idea, names the
 * pattern using its exact label, and deliberately stops short of the full
 * explanation to open the loop. Keyed by pattern rather than topic since
 * the pattern label already carries the relevant meaning, and the same
 * pattern can arise from more than one topic.
 */
const PATTERN_INSIGHT_PART1: Record<LeadPatternName, string> = {
  recovery_deficit:
    'What you\'ve described reads less like one isolated issue and more like a recovery deficit — the body not fully bouncing back between stress, sleep, and daily demand. There\'s more to it than that.',
  compensation_pattern:
    "The way this keeps coming back reads like a compensation pattern — one area quietly picking up the slack for something else in the system. There's more to it than that.",
  overload_pattern:
    "Showing up broadly like this usually isn't about one spot — it looks like an overload pattern, the whole system carrying more than it can currently recover from. There's more to it than that.",
  fuel_timing_pattern:
    "That dip lines up with a fuel timing pattern — energy tracking more with when and how you eat than with how much you sleep. There's more to it than that.",
  depletion_pattern:
    "Energy that stays low all day points more to a depletion pattern — the body running on a deficit it hasn't been able to close. There's more to it than that.",
  wind_down_deficit:
    "That specific trouble points to a wind-down deficit — a nervous system that isn't getting a real signal to downshift at night. There's more to it than that.",
  rhythm_disruption:
    "Sleep that doesn't hold or doesn't restore points to a rhythm disruption — the body's internal clock and its recovery cycle pulling in different directions. There's more to it than that.",
  stress_loading_pattern:
    "What's building here reads like a stress-loading pattern — stress accumulating faster than it's being discharged. There's more to it than that.",
  stress_storage_pattern:
    "That timing lines up with a stress-storage pattern — the body holding onto weight as part of a stress response, not a willpower problem. There's more to it than that.",
  metabolic_adaptation_pattern:
    "Staying stuck despite real effort points to a metabolic adaptation pattern — the body recalibrating around under-fueling or over-exercising rather than releasing weight. There's more to it than that.",
};

const EMAIL_ASK = 'Want the complete breakdown of this sent over? First name and best email works.';

export function buildFallbackInsightPart1(patternName: LeadPatternName): string {
  return `${PATTERN_INSIGHT_PART1[patternName]} ${EMAIL_ASK}`;
}

/**
 * PART TWO — the payoff, sent only after email capture (or the retry cap
 * is hit). Never includes a link or call to action; buildRoutingMessage
 * below is appended after this by the route handler.
 */
const PATTERN_INSIGHT_PART2: Record<LeadPatternName, string> = {
  recovery_deficit:
    'A recovery deficit usually comes down to load outpacing actual recovery time — the first thing worth protecting is one full, uninterrupted sleep cycle before changing anything else.',
  compensation_pattern:
    "A compensation pattern usually comes down to how movement or stress load gets redistributed around the original spot — the first step is finding what it's compensating for, not treating the spot itself.",
  overload_pattern:
    'An overload pattern usually comes down to total load — physical, mental, or both — outrunning recovery. The first step is finding what to subtract before adding anything new.',
  fuel_timing_pattern:
    'A fuel timing pattern usually comes down to blood sugar swings from meal timing and composition — the first thing to try is anchoring protein earlier in the day rather than reaching for more caffeine.',
  depletion_pattern:
    'A depletion pattern usually comes down to sleep, stress, and nutrition all drawing from the same tank at once — the first step is rebuilding one of those, usually sleep, before touching the others.',
  wind_down_deficit:
    'A wind-down deficit usually comes down to stimulation running too close to bedtime — light, screens, or unresolved stress. The first step is a real buffer window before sleep, not just an earlier bedtime.',
  rhythm_disruption:
    "A rhythm disruption usually comes down to inconsistent timing — meals, light, movement — more than the raw number of hours slept. The first step is anchoring a consistent wake time.",
  stress_loading_pattern:
    'A stress-loading pattern usually comes down to load without a real release valve — the first step is one deliberate discharge point in the day, not removing the stressor itself.',
  stress_storage_pattern:
    'A stress-storage pattern usually comes down to cortisol and nervous-system load driving how the body holds onto weight — the first step is addressing the stress load itself, not cutting further.',
  metabolic_adaptation_pattern:
    'A metabolic adaptation pattern usually comes down to the body defending itself after too much restriction or output for too long — the first step is rebuilding enough fuel and recovery for the body to feel safe releasing weight again.',
};

export function buildFallbackInsightPart2(patternName: LeadPatternName): string {
  return PATTERN_INSIGHT_PART2[patternName];
}

export const EMAIL_RETRY_MESSAGE = "That doesn't quite look like a full email — mind sending it again along with your first name?";

export function buildRoutingMessage(
  firstName: string | null,
  destination: LeadRoutingDestination
): string {
  const lead = firstName ? `${firstName} — ` : '';
  if (destination === 'discovery_call') {
    return `${lead}this is worth a real conversation. Here's the link to book your Discovery Assessment: ${getDiscoveryCallUrl()}`;
  }
  return `${lead}here's a good next step to start getting some real answers: ${getQuizGuideUrl()}`;
}

export const CLOSING_MESSAGE = "You're set. Reach back out any time.";
