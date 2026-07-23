/**
 * Recommendation Engine — deterministic classification (Prompt 11). Maps
 * the real `RecommendationDomain` vocabulary (lib/intelligence-engine/
 * recommendations.ts's `buildRecommendations()`) onto the prompt's 15
 * named categories using only already-computed fields (`domain`,
 * `priority`, the Root Router's `RootRouterOutcomeView`) — never a second,
 * parallel scoring system, and never random.
 */

import type { RootRouterOutcome } from '../investigation-engine/routerOutcome';
import { EXPERIMENT_DOMAINS } from '../investigation-engine/routerOutcome';
import type { Recommendation, RecommendationDomain } from '../intelligence-engine/types';
import type { MemberRecommendationCategory, RecommendedDuration } from './types';
import type { CategoryOutcomeSummary } from './outcomeHistory';

const BASE_CATEGORY_BY_DOMAIN: Record<RecommendationDomain, MemberRecommendationCategory> = {
  movement: 'movement_focus',
  recovery: 'recovery_focus',
  breathing: 'breathing_practice',
  sleep: 'sleep_optimization',
  stress: 'stress_management',
  hydration: 'daily_habit',
  nutrition: 'nutrition_focus',
  reflection: 'reflection',
  education: 'education',
  assessments: 'follow_up_investigation',
  coach_follow_up: 'coaching_conversation',
  daily_coaching: 'daily_habit',
  conversation_prompts: 'coaching_conversation',
  notifications: 'coach_review',
  automation: 'daily_habit',
};

export type ClassifyContext = {
  routerOutcome: RootRouterOutcome;
  /** CoachingPriorities.recommendedCoachAttentionLevel === 'priority' */
  isCoachAttentionPriority: boolean;
};

/**
 * `daily_habit`-shaped categories carry no explicit cadence field of their
 * own (Recommendation has no "how often" concept) — a `low`-priority one is
 * reframed as a lighter, less-frequent `weekly_practice` rather than a
 * daily commitment, since priority is the one real signal that already
 * distinguishes urgency. This is the resolution to the "Daily Habit vs.
 * Weekly Practice" question: driven entirely by the real, already-computed
 * `priority` field, never a guess.
 */
export function classifyRecommendation(rec: Recommendation, context: ClassifyContext): MemberRecommendationCategory {
  if (rec.domain === 'coach_follow_up' && (context.routerOutcome === 'coach_review' || context.isCoachAttentionPriority)) {
    return 'coach_review';
  }

  if (EXPERIMENT_DOMAINS.has(rec.domain) && rec.priority !== 'low' && context.routerOutcome === 'lifestyle_experiment') {
    return 'lifestyle_experiment';
  }

  const base = BASE_CATEGORY_BY_DOMAIN[rec.domain];
  if (base === 'daily_habit' && rec.priority === 'low') return 'weekly_practice';
  return base;
}

const DURATION_BY_CATEGORY: Record<MemberRecommendationCategory, RecommendedDuration> = {
  movement_focus: 'daily',
  recovery_focus: 'daily',
  breathing_practice: 'daily',
  sleep_optimization: 'daily',
  stress_management: 'daily',
  nutrition_focus: 'daily',
  daily_habit: 'daily',
  reflection: 'weekly',
  weekly_practice: 'weekly',
  education: 'one_time',
  coaching_conversation: 'one_time',
  follow_up_investigation: 'one_time',
  lifestyle_experiment: 'one_time',
  coach_review: 'ongoing',
  medical_referral_flag: 'ongoing',
};

export function durationForCategory(category: MemberRecommendationCategory): RecommendedDuration {
  return DURATION_BY_CATEGORY[category];
}

/**
 * Recommendation Learning (Prompt 12, Part 4) — "adjust duration or
 * difficulty" for a category the member has repeatedly stopped early on.
 * Still a deterministic lookup, never a new scoring system: a `daily`
 * category with 2+ recorded `stopped_early` events and no offsetting
 * positive history steps down to the lighter `weekly` cadence, the same
 * daily->weekly relationship `classifyRecommendation`'s own low-priority
 * carve-out already establishes for a different reason.
 */
const STOPPED_EARLY_THRESHOLD = 2;

export function adjustedDurationForCategory(
  category: MemberRecommendationCategory,
  outcomeSummary: CategoryOutcomeSummary | undefined
): RecommendedDuration {
  const base = durationForCategory(category);
  if (!outcomeSummary) return base;
  if (base !== 'daily') return base;
  if (outcomeSummary.stoppedEarlyCount < STOPPED_EARLY_THRESHOLD) return base;
  if (outcomeSummary.positiveCount > outcomeSummary.stoppedEarlyCount) return base;
  return 'weekly';
}

/** coach_review and medical_referral_flag are never member-completable actions — a member can't "mark done" a coach follow-up. */
const NOT_MEMBER_COMPLETABLE = new Set<MemberRecommendationCategory>(['coach_review', 'medical_referral_flag']);

export function completionTrackingForCategory(category: MemberRecommendationCategory): boolean {
  return !NOT_MEMBER_COMPLETABLE.has(category);
}

const REASSESSMENT_TRIGGER_BY_CATEGORY: Partial<Record<MemberRecommendationCategory, string>> = {
  follow_up_investigation: 'Revisit this after your next assessment or reassessment.',
  lifestyle_experiment: "Revisit once your experiment's tracking period ends.",
  coach_review: 'Your coach will follow up directly.',
  medical_referral_flag: 'Your coach will follow up directly.',
};

export function reassessmentTriggerForCategory(category: MemberRecommendationCategory): string | null {
  return REASSESSMENT_TRIGGER_BY_CATEGORY[category] ?? null;
}

const PRIORITY_PHRASE: Record<Recommendation['priority'], string> = {
  high: 'a high-priority pattern',
  medium: 'a pattern worth watching',
  low: 'a lower-priority, optional item',
};

const WHY_OVERRIDE_BY_CATEGORY: Partial<Record<MemberRecommendationCategory, string>> = {
  lifestyle_experiment: "This pattern looked specific and stable enough to test with a small, time-boxed change.",
  follow_up_investigation: 'A focused assessment would help confirm what this is pointing toward.',
  coach_review: 'This is significant enough that your coach has been notified to follow up directly.',
  medical_referral_flag:
    'This kind of concern is best discussed with a healthcare provider, so your coach has been notified to follow up.',
};

/**
 * A short, templated sentence — never freeform, always traceable to the
 * real `priority` field, a fixed category override, or (Prompt 12, Part 4)
 * this member's own real outcome history for the category, when present.
 * History always wins over the generic phrasing when it exists, since
 * "this has worked for you before" is more specific and more useful than
 * a priority-only explanation — but it's still one of a fixed, templated
 * set of sentences, never freeform generation.
 */
export function whyThisWasSelected(
  rec: Recommendation,
  category: MemberRecommendationCategory,
  outcomeSummary?: CategoryOutcomeSummary
): string {
  if (outcomeSummary && outcomeSummary.positiveCount > 0 && outcomeSummary.positiveCount >= outcomeSummary.negativeCount) {
    return 'This kind of approach has worked well for you before, so it\'s worth trying again here.';
  }
  if (outcomeSummary && outcomeSummary.stoppedEarlyCount >= STOPPED_EARLY_THRESHOLD) {
    return "A lighter version of this, since the daily version hasn't been sticking for you recently.";
  }

  return (
    WHY_OVERRIDE_BY_CATEGORY[category] ??
    `This was suggested because it traces back to ${PRIORITY_PHRASE[rec.priority]} in your recent activity.`
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Deterministic dedup key — same real inputs always produce the same key, so recomputation touches the existing row rather than duplicating it. Never includes a random id or timestamp. */
export function buildRecommendationKey(rec: Recommendation, category: MemberRecommendationCategory): string {
  return `${rec.domain}_${category}_${slugify(rec.title)}`;
}
