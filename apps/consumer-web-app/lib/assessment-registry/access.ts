/**
 * THE ONE GATE (2026-08-27).
 *
 * Every surface that can open a registry questionnaire or the camera Body
 * Assessment asks this function, and nothing decides access anywhere else:
 * the catalog card, the overview screen, the take route, and every server
 * action that reads or writes a session. Real server-side enforcement, not
 * a UI-only check, so a direct URL cannot reach a flow no card linked to.
 *
 * WHAT DECIDES: the member's plan (member_subscriptions.tier, resolved
 * through lib/assessment-registry/membership.ts), plus the registry's own
 * program and prerequisite rules. A pending coach assignment may
 * additionally open one questionnaire for one member; its absence never
 * blocks a member whose plan includes it.
 *
 * WHAT DOES NOT DECIDE: a pending reassessment schedule, a worsening
 * finding, an in-progress draft, a page render, or a prior completion.
 * See calculateLockReason's header for what each of those used to open and
 * why it stopped.
 *
 * TWO INTENTS, because "may she start this" and "may she look at what she
 * already did" are different questions and answering them with one rule is
 * what made a single completion turn a coach-assigned questionnaire
 * permanently self-serve:
 *
 *   'start'  Default. May a NEW attempt begin right now. Her own history
 *            counts for nothing here.
 *   'view'   May she reach the overview and her own stored results. Her
 *            own completed history or open draft always passes, whatever
 *            the current plan rule says. This is the framework's "tier
 *            gating never hides a member's own progress" protection, kept
 *            in the one place where it is actually about reading.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { findAssessmentRegistryEntry } from './registry';
import { calculateLockReason, hasEverCompleted, type LockReason } from './status';
import { getMemberAssessmentFacts } from './facts';
import type { AssessmentKey } from './types';

export type AccessResult = { allowed: true } | { allowed: false; reason: LockReason };

export type AccessIntent = 'start' | 'view';

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
  assessmentKey: string,
  options: { intent?: AccessIntent } = {}
): Promise<AccessResult> {
  const definition = findAssessmentRegistryEntry(assessmentKey);
  // Unknown key: not this function's job — the page's own notFound() handles it.
  if (!definition) return { allowed: true };

  const factsByKey = await getMemberAssessmentFacts(supabase, memberId);
  const facts = factsByKey.get(definition.key);
  if (!facts) return { allowed: true };

  const intent = options.intent ?? 'start';
  if (intent === 'view' && (facts.completionStatus !== 'not_started' || hasEverCompleted(facts))) {
    return { allowed: true };
  }

  const lockReason = calculateLockReason(definition, facts, completedKeysFrom(factsByKey));
  if (!lockReason) return { allowed: true };
  return { allowed: false, reason: lockReason };
}
