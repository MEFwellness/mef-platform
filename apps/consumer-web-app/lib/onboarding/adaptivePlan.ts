/**
 * Onboarding-specific wiring around the generic, domain-agnostic
 * lib/adaptive-assessment-engine/. Owns every decision the engine itself
 * doesn't know about: which bank belongs to which primary_concern, which
 * legacy "anchor" question each concern's deep dive already covers (so
 * Phase 3 never re-asks it), and the fixed per-phase question counts that
 * keep total time close to the original flat-12 assessment while making
 * 2-3 of those questions genuinely adaptive.
 *
 * Runtime source of truth is always the fetched OnboardingQuestion[] bank
 * (question_pool/concern/weight/requires/boosts all come from Postgres) —
 * this file never imports the lib/onboarding/concernBanks/*.ts content
 * files directly; those are seed-authoring input for the migration only,
 * compiled once, not re-imported at runtime.
 *
 * Sequence: primary_concern (Phase 1) -> [home anchor, if the concern has
 * one] + N adaptively-picked concern-bank questions (Phase 2) -> remaining
 * legacy anchors, fixed order (Phase 3a) -> one adaptively-picked question
 * from the shared "zoom out" pool, which competes with the two legacy
 * non-anchor shared questions for that single slot (Phase 3b) -> the fixed
 * readiness triplet (Phase 3c).
 */

import type { OnboardingQuestion } from '@mef/shared-types-contracts';
import { selectNext } from '../adaptive-assessment-engine';
import type { AdaptiveQuestion, AnsweredMap, AnswerValue, Boost, Rule } from '../adaptive-assessment-engine';

export const PRIMARY_CONCERN_QUESTION_KEY = 'primary_concern';

/** The 6 legacy keys lib/onboarding/comparison.ts reads by exact question_key — must always be asked exactly once, never dropped. */
export const ANCHOR_KEYS = [
  'baseline_sleep_quality',
  'baseline_stress_level',
  'baseline_energy_level',
  'baseline_digestion',
  'baseline_pain_areas',
  'baseline_movement_frequency',
] as const;

export type AnchorKey = (typeof ANCHOR_KEYS)[number];

/** Always asked last, unchanged from today. */
export const READINESS_KEYS = ['readiness_importance', 'readiness_confidence', 'readiness_actively_working'] as const;

/** Not comparison anchors — safe to let them compete for Phase 3b's single slot instead of always being asked. */
const PHASE3B_LEGACY_EXTRAS = ['baseline_sleep_hours', 'baseline_goals'];

type ConcernConfig = {
  /** The value stored in OnboardingQuestion.concern for this bank — usually equal to the map key, except the movement/habits/other fallbacks below. */
  bankKey: string;
  /** The one legacy anchor this concern's deep dive already covers, asked as the FIRST Phase 2 question so Phase 3a never re-asks it. Null for concerns with no natural anchor. */
  homeAnchor: AnchorKey | null;
  /** Total Phase 2 questions, including the home-anchor slot if present. */
  phase2Count: number;
};

const GENERAL_CONFIG: ConcernConfig = { bankKey: 'general_optimization', homeAnchor: null, phase2Count: 3 };

/**
 * Keyed by every value the live primary_concern enum actually allows
 * (12 values total — see migration 00000000000068). The 9 values named in
 * the product brief get a dedicated bank; movement/habits/other fall back
 * to the general-wellness bank, matching their treatment in the old
 * reorder-only branching.ts (they always shared baseline_goals as their
 * only forwarded question).
 */
export const CONCERN_CONFIG: Record<string, ConcernConfig> = {
  pain: { bankKey: 'pain', homeAnchor: 'baseline_pain_areas', phase2Count: 3 },
  weight: { bankKey: 'weight', homeAnchor: 'baseline_movement_frequency', phase2Count: 3 },
  digestion: { bankKey: 'digestion', homeAnchor: 'baseline_digestion', phase2Count: 3 },
  sleep: { bankKey: 'sleep', homeAnchor: 'baseline_sleep_quality', phase2Count: 3 },
  stress: { bankKey: 'stress', homeAnchor: 'baseline_stress_level', phase2Count: 3 },
  energy: { bankKey: 'energy', homeAnchor: 'baseline_energy_level', phase2Count: 3 },
  performance: { bankKey: 'performance', homeAnchor: 'baseline_energy_level', phase2Count: 3 },
  healthy_aging: { bankKey: 'healthy_aging', homeAnchor: null, phase2Count: 3 },
  general_optimization: GENERAL_CONFIG,
  movement: GENERAL_CONFIG,
  habits: GENERAL_CONFIG,
  other: GENERAL_CONFIG,
};

export function concernConfigFor(primaryConcern: string | null | undefined): ConcernConfig {
  if (!primaryConcern) return GENERAL_CONFIG;
  return CONCERN_CONFIG[primaryConcern] ?? GENERAL_CONFIG;
}

/** The exact, deterministic total question count for a concern — lets the progress bar show a real denominator the instant primary_concern is answered, even though *which* questions fill each adaptive slot is randomized. */
export function estimatedTotalQuestions(primaryConcern: string | null | undefined): number {
  const config = concernConfigFor(primaryConcern);
  const remainingAnchors = ANCHOR_KEYS.length - (config.homeAnchor ? 1 : 0);
  return 1 + config.phase2Count + remainingAnchors + 1 + READINESS_KEYS.length;
}

/** Builds the engine's AnsweredMap from OnboardingForm's answers state — only real 'answered' entries count as signal for requires/boosts rules. */
export function answersToAnsweredMap(
  answers: Record<string, { status: string; value?: AnswerValue }>
): AnsweredMap {
  const map: AnsweredMap = {};
  for (const [key, answer] of Object.entries(answers)) {
    if (answer.status === 'answered' && answer.value !== undefined) {
      map[key] = answer.value;
    }
  }
  return map;
}

/** OnboardingQuestion's requires/boosts columns are typed `unknown | null` (raw jsonb) — this is the one place that trusts seed/migration content to match the Rule/Boost shape, so the engine's generic selectNext can operate on real fetched rows. */
function toAdaptive(question: OnboardingQuestion): OnboardingQuestion & AdaptiveQuestion {
  return {
    ...question,
    requires: (question.requires ?? null) as Rule[] | null,
    boosts: (question.boosts ?? null) as Boost[] | null,
  };
}

type Phase = 'phase2' | 'phase3a' | 'phase3b' | 'phase3c';

export type AdaptiveEngineState = {
  bankKey: string;
  /** The home-anchor key still to be asked, or null once asked / if this concern has none. */
  homeAnchorPending: AnchorKey | null;
  bankPicksRemaining: number;
  bankExcluded: string[];
  phase3aQueue: string[];
  phase3bDone: boolean;
  phase3cQueue: string[];
  /**
   * Which phase the MOST RECENTLY RETURNED question belonged to (null before
   * anything has been asked). This — not a same-call state comparison — is
   * what advanceAdaptivePlan uses to decide whether the "zoom out" beat
   * belongs in front of its next pick: the state's own bankPicksRemaining
   * already hits 0 at the moment the LAST Phase 2 question is *selected*,
   * one call before that question is actually answered, so comparing
   * "before vs. after" within a single call fires the transition a
   * question too early (in front of the last deep-dive question instead of
   * after it). Comparing this field against the phase of the question a
   * call is *about* to return is the only way to place the beat correctly.
   */
  lastPhase: Phase | null;
};

export function initAdaptiveEngineState(primaryConcern: string | null | undefined): AdaptiveEngineState {
  const config = concernConfigFor(primaryConcern);
  const remainingAnchors = ANCHOR_KEYS.filter((key) => key !== config.homeAnchor);

  return {
    bankKey: config.bankKey,
    homeAnchorPending: config.homeAnchor,
    bankPicksRemaining: config.phase2Count - (config.homeAnchor ? 1 : 0),
    bankExcluded: [],
    phase3aQueue: [...remainingAnchors],
    phase3bDone: false,
    phase3cQueue: [...READINESS_KEYS],
    lastPhase: null,
  };
}

/**
 * Advances the plan by exactly one question: home anchor -> concern-bank
 * picks -> remaining legacy anchors -> the Phase 3b sampler -> the fixed
 * readiness triplet -> done (question: null). Loop-guarded and
 * self-healing against a missing/misconfigured row (falls through to the
 * next phase rather than getting stuck or throwing mid-form) — a real
 * content bug should surface in tests, never strand a member.
 */
/** True once every phase has been exhausted — nothing left for advanceAdaptivePlan to add. Lets OnboardingForm know the currently-displayed question is the true last one, without needing an extra "try to grow, get nothing back" round trip. */
export function isPlanComplete(state: AdaptiveEngineState): boolean {
  return (
    state.homeAnchorPending === null &&
    state.bankPicksRemaining === 0 &&
    state.phase3aQueue.length === 0 &&
    state.phase3bDone &&
    state.phase3cQueue.length === 0
  );
}

export function advanceAdaptivePlan(
  state: AdaptiveEngineState,
  fullBank: OnboardingQuestion[],
  answered: AnsweredMap,
  random: () => number = Math.random
): { question: OnboardingQuestion | null; nextState: AdaptiveEngineState; enteredPhase3: boolean } {
  const byKey = new Map(fullBank.map((q) => [q.question_key, q]));
  const previousPhase = state.lastPhase;
  const finish = (
    question: OnboardingQuestion | null,
    nextStateBase: AdaptiveEngineState,
    phase: Phase
  ): { question: OnboardingQuestion | null; nextState: AdaptiveEngineState; enteredPhase3: boolean } => ({
    question,
    nextState: question ? { ...nextStateBase, lastPhase: phase } : nextStateBase,
    enteredPhase3: question !== null && previousPhase === 'phase2' && phase !== 'phase2',
  });
  let current = state;

  for (let guard = 0; guard < 50; guard++) {
    if (current.homeAnchorPending) {
      const question = byKey.get(current.homeAnchorPending) ?? null;
      const nextState: AdaptiveEngineState = { ...current, homeAnchorPending: null };
      if (question) return finish(question, nextState, 'phase2');
      current = nextState;
      continue;
    }

    if (current.bankPicksRemaining > 0) {
      const bank = fullBank
        .filter((q) => q.question_pool === 'concern_bank' && q.concern === current.bankKey)
        .map(toAdaptive);
      const picked = selectNext(bank, answered, current.bankExcluded, random);
      if (picked) {
        return finish(
          picked,
          {
            ...current,
            bankPicksRemaining: current.bankPicksRemaining - 1,
            bankExcluded: [...current.bankExcluded, picked.question_key],
          },
          'phase2'
        );
      }
      current = { ...current, bankPicksRemaining: 0 };
      continue;
    }

    if (current.phase3aQueue.length > 0) {
      const [key, ...rest] = current.phase3aQueue;
      const question = byKey.get(key!) ?? null;
      current = { ...current, phase3aQueue: rest };
      if (question) return finish(question, current, 'phase3a');
      continue;
    }

    if (!current.phase3bDone) {
      const pool = fullBank
        .filter((q) => q.question_pool === 'shared_pool' || PHASE3B_LEGACY_EXTRAS.includes(q.question_key))
        .map(toAdaptive);
      const question = selectNext(pool, answered, [], random);
      current = { ...current, phase3bDone: true };
      if (question) return finish(question, current, 'phase3b');
      continue;
    }

    if (current.phase3cQueue.length > 0) {
      const [key, ...rest] = current.phase3cQueue;
      const question = byKey.get(key!) ?? null;
      current = { ...current, phase3cQueue: rest };
      if (question) return finish(question, current, 'phase3c');
      continue;
    }

    return { question: null, nextState: current, enteredPhase3: false };
  }

  return { question: null, nextState: current, enteredPhase3: false };
}
