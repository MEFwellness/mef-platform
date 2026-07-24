/**
 * Shared content schema for every concern-specific question bank under
 * lib/onboarding/concernBanks/. Each bank file exports a plain array of
 * these — no logic, just seed content — which adaptivePlan.ts feeds into
 * the generic engine (lib/adaptive-assessment-engine/) at runtime, and which
 * a one-time script compiles into the seed migration's SQL insert values.
 *
 * Naming rule (load-bearing, not stylistic): every question_key in a bank
 * MUST be prefixed with that bank's own concern slug (e.g. every key in
 * pain.ts starts with "pain_"). This is what guarantees new keys can never
 * collide with the 12 legacy keys (none of which share these prefixes) or
 * with another concern's bank, without needing a cross-file registry.
 *
 * requires/boosts ordering rule (load-bearing): a Rule's question_key may
 * only reference "primary_concern" or another question_key declared in the
 * SAME bank file. The engine has no cross-phase lookahead — by the time a
 * concern bank's questions are being selected, only primary_concern and
 * earlier picks from this same bank are ever answered yet. A rule pointing
 * at a legacy key, a different concern's key, or a shared-pool key will
 * silently never fire (see tests/onboarding-adaptive-plan.test.ts's
 * validator, which enforces this at test time).
 */

import type { AnswerType } from '@mef/shared-types-contracts';
import type { Boost, Rule } from '../../adaptive-assessment-engine';

/** Wellness domains a question can be tagged with — drives the progress bar's soft "what we're covering" label and Phase 3's domain-dedup. */
export type OnboardingDomain =
  | 'all'
  | 'sleep'
  | 'mind_stress'
  | 'movement_energy'
  | 'nutrition_digestion'
  | 'pain_structural'
  | 'recovery'
  | 'lifestyle'
  | 'mindset';

export type ConcernQuestionSeed = {
  /** Must start with "<concern>_", e.g. "pain_primary_location". */
  question_key: string;
  /** Coach-voice, first-person-addressed prompt — used directly, no separate copy override needed for new questions. */
  prompt_text: string;
  /** Optional short line under the prompt, same role as coachCopy.ts's COACH_HELPER. */
  helper_text?: string;
  answer_type: AnswerType;
  /** Required (and only meaningful) for 'enum' and 'multi_select'. Normalized snake_case values. */
  allowed_values?: string[] | null;
  domain: OnboardingDomain;
  /** Base selection score. 1 = normal. 1.5-2 = shown more often across members (still never guaranteed). Default 1. */
  weight?: number;
  /** Eligibility gate — ALL must hold. See the ordering rule above. Omit/null for "always eligible". */
  requires?: Rule[] | null;
  /** Additive personalization — see the ordering rule above. Omit/null for none. */
  boosts?: Boost[] | null;
  allows_not_sure?: boolean;
  allows_not_applicable?: boolean;
  allows_prefer_not_to_answer?: boolean;
};
