/**
 * Investigation Engine — the Root Router (Method §7; Root Model and Router
 * §7; Focused Investigation Library §14; all three independently arrive at
 * the same recommendation: name this as one real service orchestrating the
 * existing fragments, not a fifth parallel system). This module IS that
 * name — it does not reimplement eligibility, recommendation ranking, or
 * finding-based suggestion logic; it calls the three real modules that
 * already do, in the Method's own five-step order, and adds exactly the
 * two things nothing in the codebase does yet: (1) `pickRecommendation()`
 * getting an actual caller, and (2) logging what was recommended even when
 * the member chooses something else (Method §7 step 4, "member agency" —
 * the Root Model stays honest about the gap between chosen and
 * recommended).
 *
 * Step 5 (coach override) needs no new code here — `pickRecommendation()`
 * already treats `coach_assigned` as its highest tier internally.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getMemberRestrictedTopics } from '../feed/data';
import { getMemberAssessmentFacts } from '../assessment-registry/facts';
import { getAssessmentRegistryEntry } from '../assessment-registry/registry';
import { pickRecommendation, type Recommendation } from '../assessment-registry/recommendation';
import {
  suggestAssessmentsFromFindings,
  type FindingBasedSuggestion,
} from '../assessment-registry/findingRecommendations';
import { listRegistryEntriesForMember } from '../registry/data';
import type { AssessmentKey } from '../assessment-registry/types';

export type RootRouterDecision = {
  /** Step 1 — true when the member has any currently open safety restriction. */
  safetyGated: boolean;
  /** Step 2 — pickRecommendation()'s status/eligibility-ranked pick. */
  recommendation: Recommendation;
  /** Step 3 — finding-driven "what else might help," excluding the step-2 pick. */
  findingBasedSuggestions: FindingBasedSuggestion[];
};

export type RecommendedInvestigationView = {
  key: AssessmentKey;
  displayName: string;
  reason: Recommendation['reason'];
  route: string;
};

/**
 * Steps 1-3 of Method §7's decision order. Step 4 (agency logging) is a
 * separate call (`recordRouterDecision`, below) made once it's known what
 * the member actually did, since that can only be known after this
 * decision has already been shown to them. Step 5 (coach override) is
 * handled inside `pickRecommendation()` itself — nothing to add here.
 */
export async function decideNextAction(
  supabase: SupabaseClient,
  memberId: string
): Promise<RootRouterDecision> {
  // Step 1 — safety gate. An open restriction means the Router defers
  // entirely to the coach-review flow rather than recommending anything
  // new in the interim (Investigation Library §11, worked example 3).
  const restrictedTopics = await getMemberRestrictedTopics(supabase, memberId);
  if (restrictedTopics.length > 0) {
    return {
      safetyGated: true,
      recommendation: { key: null, reason: 'upgrade_invitation' },
      findingBasedSuggestions: [],
    };
  }

  // Step 2 — status/eligibility-ranked "what's next" (coach-assigned wins
  // internally, satisfying step 5 too).
  const factsByKey = await getMemberAssessmentFacts(supabase, memberId);
  const recommendation = pickRecommendation(factsByKey);

  // Step 3 — finding-driven "what else might help," independent of step 2.
  const entries = await listRegistryEntriesForMember(supabase, memberId);
  const activeFindings = entries.filter((e) => e.status === 'active' && e.entry_kind === 'finding');
  const findingBasedSuggestions = suggestAssessmentsFromFindings(activeFindings, {
    excludeAssessmentKeys: recommendation.key ? [recommendation.key] : [],
  });

  return { safetyGated: false, recommendation, findingBasedSuggestions };
}

/**
 * Step 4 — member agency (Method §7). Logs what the Router would have
 * recommended even when `chosenKey` differs, so the Root Model stays
 * honest about chosen-vs-recommended (Root Model and Router §7's
 * explicitly flagged gap: "no field logs... the exact honesty check Method
 * §7 calls for"). Writes to `investigation_router_decisions`
 * (migration 89) — a new, small, append-only table, not a mutation of
 * anything existing. No-ops when nothing was actually recommended
 * (`recommendation.key === null`, the upgrade-invitation case).
 */
export async function recordRouterDecision(
  supabase: SupabaseClient,
  memberId: string,
  decision: RootRouterDecision,
  chosenKey: AssessmentKey | null
): Promise<void> {
  if (!decision.recommendation.key) return;

  const { error } = await supabase.from('investigation_router_decisions').insert({
    member_id: memberId,
    recommended_key: decision.recommendation.key,
    recommended_reason: decision.recommendation.reason,
    chosen_key: chosenKey,
  });
  if (error) console.error('recordRouterDecision failed', error);
}

/** Member-facing shape for the one recommendation surfaced on the dashboard (app/actions/memberNoticing.ts). Null when nothing is actionable or the member is safety-gated. */
export function describeRecommendation(
  decision: RootRouterDecision
): RecommendedInvestigationView | null {
  if (decision.safetyGated || !decision.recommendation.key) return null;
  const key = decision.recommendation.key;
  const definition = getAssessmentRegistryEntry(key);
  return {
    key,
    displayName: definition.displayName,
    reason: decision.recommendation.reason,
    route: definition.route,
  };
}
