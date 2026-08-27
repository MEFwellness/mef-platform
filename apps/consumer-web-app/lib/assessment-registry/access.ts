/**
 * Real, server-side access enforcement (section 12) — not a UI-only
 * check. Called from the generic engine's overview/take pages before
 * anything else runs, so a free member cannot open a Membership-tier
 * assessment's take flow by direct URL even if no card ever linked to it.
 *
 * A member who already has an in-progress draft or any completed attempt
 * for this assessment is always let through, regardless of what the
 * current membership rule says — tier gating only ever blocks *starting
 * something new*; it never hides a member's own pre-existing progress or
 * results (the framework's core protection rule).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { findAssessmentRegistryEntry } from './registry';
import { calculateLockReason, hasEverCompleted, type LockReason } from './status';
import { getMemberAssessmentFacts } from './facts';
import type { AssessmentKey } from './types';

export type AccessResult = { allowed: true } | { allowed: false; reason: LockReason };

/** Every registered assessment key this member has actually completed, computed from the same batched facts query every other status calculation already reads — the real input calculateLockReason's own prerequisiteKeys check needs. Previously every caller passed an empty Set here (no assessment used prerequisiteKeys until Life Signal Check), so this had no observable effect before now. */
function completedKeysFrom(factsByKey: Awaited<ReturnType<typeof getMemberAssessmentFacts>>): Set<AssessmentKey> {
  const completed = new Set<AssessmentKey>();
  for (const [key, facts] of factsByKey) {
    // hasEverCompleted, not completionStatus (2026-08-27). This read was a
    // real lockout: the empty draft the take page created the instant she
    // finished Core Values Snapshot made the status view answer
    // 'in_progress', this Set lost the key, and Life Signal Check went back
    // to "Complete a prior step first" for a member who HAD completed it.
    if (hasEverCompleted(facts)) completed.add(key);
  }
  return completed;
}

/** Accepts a plain string — callers resolve it from a URL param, not a statically-known AssessmentKey. */
export async function checkAssessmentAccess(
  supabase: SupabaseClient,
  memberId: string,
  assessmentKey: string
): Promise<AccessResult> {
  const definition = findAssessmentRegistryEntry(assessmentKey);
  // Unknown key: not this function's job — the page's own notFound() handles it.
  if (!definition) return { allowed: true };

  const factsByKey = await getMemberAssessmentFacts(supabase, memberId);
  const facts = factsByKey.get(definition.key);
  if (!facts) return { allowed: true };

  if (facts.completionStatus !== 'not_started' || facts.pendingAssignment) {
    return { allowed: true };
  }

  const lockReason = calculateLockReason(definition, facts, completedKeysFrom(factsByKey));
  if (!lockReason) return { allowed: true };
  return { allowed: false, reason: lockReason };
}
