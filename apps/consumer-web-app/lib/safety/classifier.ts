/**
 * The central, deterministic safety classifier. Pure function, no I/O —
 * runs BEFORE any LLM (there isn't one wired up anywhere in this codebase
 * yet) and before any DB write, matching the AI Coaching Engine
 * Foundation's "rules engine runs before any LLM" precedent
 * (lib/ai/rules/engine.ts). lib/safety/service.ts is the thin layer that
 * calls this and persists the result.
 *
 * Classifies ONE piece of text at a time (a member's free-text input, or
 * a proposed coaching output) — it never sees or reasons about an entire
 * conversation history, so it cannot itself decide to "shut down all
 * coaching." That decision boundary belongs to the caller, which knows
 * what else is being said.
 */

import type {
  SafetyClassificationLevel,
  SafetyUrgency,
  SafetyEscalationAction,
} from '@mef/shared-types-contracts';
import { CONCERN_CATEGORIES, getConcernCategory, type ConcernCategoryKey } from './categories';
import { SAFETY_POLICY_VERSION } from './policy';

export type ClassifyConcernInput = {
  text?: string | null | undefined;
  /** The check-in form's own "new or worsening concern" flag — a real, member-authored signal distinct from free-text keyword matching. */
  newOrWorseningConcern?: boolean | undefined;
};

export type SafetyClassificationResult = {
  classificationLevel: SafetyClassificationLevel;
  urgency: SafetyUrgency;
  /** The single most-severe matched category — used to resolve a category-specific message template. */
  primaryCategory: ConcernCategoryKey;
  concernCategories: ConcernCategoryKey[];
  reasoningCodes: string[];
  coachingAllowed: boolean;
  restrictedTopics: string[];
  coachReviewRequired: boolean;
  acknowledgmentRequired: boolean;
  escalationAction: SafetyEscalationAction;
  policyVersion: string;
};

const URGENCY_RANK: SafetyUrgency[] = ['none', 'low', 'medium', 'high', 'critical'];
const ESCALATION_RANK: SafetyEscalationAction[] = [
  'none',
  'notify_coach',
  'coach_review_queue',
  'urgent_follow_up',
];

function mostSevere<T extends string>(rankOrder: T[], present: T[]): T {
  for (let i = rankOrder.length - 1; i >= 0; i--) {
    const candidate = rankOrder[i]!;
    if (present.includes(candidate)) return candidate;
  }
  return rankOrder[0]!;
}

export function classifyConcern(input: ClassifyConcernInput): SafetyClassificationResult {
  const normalized = (input.text ?? '').toLowerCase().trim();

  const keywordMatches = CONCERN_CATEGORIES.filter(
    (category) =>
      category.keywords.length > 0 && category.keywords.some((k) => normalized.includes(k))
  );

  let matched = keywordMatches;
  if (matched.length === 0 && input.newOrWorseningConcern) {
    matched = [getConcernCategory('borderline_wellness_concern')];
  }
  if (matched.length === 0) {
    matched = [getConcernCategory('routine_wellness')];
  }

  // CONCERN_CATEGORIES is authored most-to-least severe; matched entries
  // are the same object references, so indexOf gives us that ordering
  // back without a second severity table to keep in sync.
  const primary = matched
    .slice()
    .sort((a, b) => CONCERN_CATEGORIES.indexOf(a) - CONCERN_CATEGORIES.indexOf(b))[0]!;

  const restrictedTopics = Array.from(new Set(matched.flatMap((c) => c.restrictedTopics)));
  const reasoningCodes = matched.map((c) => c.reasoningCode);
  const coachReviewRequired = matched.some((c) => c.coachReviewRequired);
  const acknowledgmentRequired = matched.some((c) => c.acknowledgmentRequired);
  const urgency = mostSevere(
    URGENCY_RANK,
    matched.map((c) => c.urgency)
  );
  const escalationAction = mostSevere(
    ESCALATION_RANK,
    matched.map((c) => c.escalationAction)
  );

  return {
    classificationLevel: primary.classificationLevel,
    urgency,
    primaryCategory: primary.key,
    concernCategories: matched.map((c) => c.key),
    reasoningCodes,
    // SAFETY_RESPONSE_ONLY stops normal coaching for THIS flagged topic —
    // every other level still allows (possibly restricted) coaching to
    // continue. The caller decides what to do about unrelated topics;
    // this classifier only ever evaluates one piece of content.
    coachingAllowed: primary.classificationLevel !== 'safety_response_only',
    restrictedTopics,
    coachReviewRequired,
    acknowledgmentRequired,
    escalationAction,
    policyVersion: SAFETY_POLICY_VERSION,
  };
}
