/**
 * Member Interpretation Layer — one state per domain.
 *
 * The inherited fix this file exists for (Part D1 of the interpretation
 * build): A DOMAIN WITH ACTIVE FINDINGS MAY NEVER RESOLVE TO A QUIET
 * VERDICT.
 *
 * Live on 2026-08-17, Pain & Structural Integrity showed "3 of 21 days
 * logged", listed two active discomfort findings, and then said "LOOKING
 * STEADY. Nothing specific needed here right now." That was not a
 * zero-data problem, so the display guards shipped in the trust cleanup
 * could not reach it: a domain with two active findings was resolving to
 * 'quiet' in computeCoachingDomainPriority, because that function only
 * promotes on 'moderate' and 'significant' severities and both findings
 * were 'mild'.
 *
 * The fix is in the layer, not on the Pain card, so it holds for all twelve
 * domains and for every surface that reads a domain state. `deriveState`
 * below cannot return a quiet state when findings exist: the check is a
 * single early branch over QUIET_DOMAIN_STATES, and a test asserts it for
 * every domain and every finding severity rather than for the one the
 * audit happened to catch.
 *
 * Pure. Takes the canonical finding set and real coverage counts.
 */

import { COACHING_DOMAINS, type CoachingDomain } from '../investigation-engine/domains';
import { MIN_LOGGED_DAYS_FOR_DOMAIN_STATE, EVIDENCE_WINDOW_DAYS } from './config';
import { domainStatement } from './copy';
import { highestTier, tierLabel } from './tiers';
import {
  QUIET_DOMAIN_STATES,
  type CanonicalFinding,
  type DomainInterpretation,
  type DomainState,
} from './types';
import { coachingDomainLabel } from '../naming/domainNames';

/**
 * The state, from findings and coverage and nothing else.
 *
 * Order matters and is the whole rule set:
 *
 *   1. Safety suppression wins outright, matching the "suppress everything
 *      and show one message" posture the recommendation engine and the Root
 *      Map builder already share.
 *   2. A domain no assessment covers says so, honestly, and stops.
 *   3. ANY active finding forces a non-quiet state. This is the guard.
 *   4. Only then does coverage decide between the three quiet states.
 */
export function deriveState(input: {
  isUninstrumented: boolean;
  suppressed: boolean;
  findings: readonly CanonicalFinding[];
  loggedDays: number | null;
}): DomainState {
  if (input.suppressed) return 'paused_for_coach';
  if (input.isUninstrumented) return 'not_covered';

  const live = input.findings.filter((f) => f.verdict !== 'resolved');

  if (live.length > 0) {
    const state: DomainState = live.some((f) => f.verdict === 'needs_attention')
      ? 'needs_attention'
      : live.some((f) => f.verdict === 'worth_watching')
        ? 'worth_watching'
        : 'acknowledged';

    // Belt and braces, and deliberately not removable: if the branch above
    // is ever edited into producing a quiet state, this catches it rather
    // than shipping another "Looking steady" over two active findings.
    return QUIET_DOMAIN_STATES.has(state) ? 'acknowledged' : state;
  }

  // No findings. Now, and only now, coverage may speak.
  if (input.loggedDays === null) return 'nothing_flagged_yet';
  if (input.loggedDays === 0) return 'no_data_yet';
  if (input.loggedDays < MIN_LOGGED_DAYS_FOR_DOMAIN_STATE) return 'too_early';
  return 'nothing_flagged_yet';
}

/**
 * All twelve domains, each with exactly one state, the findings filed under
 * it, and the findings cross referenced into it.
 *
 * A finding appears in `findings` for exactly one domain and in
 * `crossReferenced` for the others, which is what makes the total across
 * all twelve cards equal the number of real findings rather than two or
 * three times it.
 */
export function buildDomainInterpretations(input: {
  findings: readonly CanonicalFinding[];
  loggedDaysByDomain: Partial<Record<CoachingDomain, number | null>>;
  suppressed: boolean;
}): DomainInterpretation[] {
  return COACHING_DOMAINS.map((info) => {
    const domain = info.domain;
    const own = input.findings.filter((f) => f.primaryDomain === domain);
    const crossReferenced = input.findings.filter((f) => f.alsoRelevantDomains.includes(domain));
    const loggedDays = input.loggedDaysByDomain[domain] ?? null;

    const state = deriveState({
      isUninstrumented: info.isUninstrumented,
      suppressed: input.suppressed,
      findings: own,
      loggedDays,
    });

    const tier = highestTier(own.map((f) => f.tier));

    return {
      domain,
      label: coachingDomainLabel(info.domain),
      state,
      statement: domainStatement({
        domain,
        state,
        findingCount: own.filter((f) => f.verdict !== 'resolved').length,
        loggedDays,
        windowDays: EVIDENCE_WINDOW_DAYS,
      }),
      tier,
      tierLabel: tier ? tierLabel(tier) : null,
      findings: own,
      crossReferenced,
      loggedDays,
      windowDays: EVIDENCE_WINDOW_DAYS,
    };
  }).sort(byUrgencyThenLabel);
}

const STATE_RANK: Record<DomainState, number> = {
  needs_attention: 6,
  worth_watching: 5,
  acknowledged: 4,
  paused_for_coach: 3,
  nothing_flagged_yet: 2,
  too_early: 1,
  no_data_yet: 1,
  not_covered: 0,
};

function byUrgencyThenLabel(a: DomainInterpretation, b: DomainInterpretation): number {
  const rank = STATE_RANK[b.state] - STATE_RANK[a.state];
  if (rank !== 0) return rank;
  return a.label.localeCompare(b.label);
}
