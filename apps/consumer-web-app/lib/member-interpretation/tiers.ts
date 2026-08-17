/**
 * Member Interpretation Layer — the four evidence tiers.
 *
 * Pure. No I/O, no dates read from the clock, no randomness: the same
 * evidence always produces the same tier, which is what lets the whole
 * rule set below be tested rather than inspected.
 *
 * The one rule this file exists to make STRUCTURALLY impossible to break:
 *
 *   A TIER CAN ONLY RISE ON MEMBER-PROVIDED EVIDENCE OR COACH CONFIRMATION.
 *
 * The old HIGH CONFIDENCE bug is what that rule is about. `computeRootConfidence`
 * blended data coverage with `min(1, priorSnapshotCount / 5)`, and snapshots
 * accrue from a daily cron whether or not the member logs anything, so after
 * five days of doing nothing at all a member's confidence term was maxed and
 * Home said HIGH CONFIDENCE over five domains that all read "Building".
 *
 * Two things make that shape unrepresentable here rather than merely
 * discouraged:
 *
 *   1. `computeEvidenceTier` counts ONLY kinds in
 *      MEMBER_PROVIDED_EVIDENCE_KINDS. A 'background_computation' item can
 *      be passed in, is carried as real provenance, and contributes
 *      nothing. There is no argument to this function a computation could
 *      supply that would move the result.
 *   2. Coach verification arrives as a TIMESTAMP from the database
 *      (`coachVerifiedAt`), not as a boolean a caller can compute. A
 *      background run has no way to produce one, because the only writer is
 *      a coach action.
 */

import {
  CHECKIN_DAYS_FOR_SUPPORTED,
  EVENTS_FOR_EMERGING_PATTERN,
  TIER_LABEL,
  TIER_MEANING,
} from './config';
import {
  MEMBER_PROVIDED_EVIDENCE_KINDS,
  type EvidenceItem,
  type EvidenceTier,
  tierRank,
} from './types';

/** Only evidence the member herself produced. Everything else is dropped before any counting happens. */
export function memberProvidedEvidence(evidence: readonly EvidenceItem[]): EvidenceItem[] {
  return evidence.filter((item) => MEMBER_PROVIDED_EVIDENCE_KINDS.has(item.kind));
}

/**
 * How many genuinely distinct member-provided events there are.
 *
 * Two items on the same local date from the same source are one event: a
 * member who answered one intake form does not have two pieces of evidence
 * because two adapters read it. An item with no date at all counts on its
 * own ref, since that is the only thing distinguishing it.
 */
export function distinctMemberEvents(evidence: readonly EvidenceItem[]): number {
  const seen = new Set<string>();
  for (const item of memberProvidedEvidence(evidence)) {
    seen.add(item.localDate ? `${item.kind}:${item.localDate}` : `ref:${item.ref}`);
  }
  return seen.size;
}

/**
 * How many distinct DAYS the member logged a check-in touching this signal.
 *
 * Check-in days only, because the tier this feeds is called "supported by
 * repeated check-ins" and it must mean what it says. Five assessment
 * results in one afternoon are not five days of anything.
 */
export function distinctCheckinDays(evidence: readonly EvidenceItem[]): number {
  const days = new Set<string>();
  for (const item of evidence) {
    if (item.kind === 'checkin_day' && item.localDate) days.add(item.localDate);
  }
  return days.size;
}

/**
 * The tier, from the evidence and nothing else.
 *
 * `coachVerifiedAt` is a timestamp read straight off the row a coach's own
 * action wrote. It is not derived, not inferred, and cannot be produced by
 * any computation in this codebase.
 */
export function computeEvidenceTier(
  evidence: readonly EvidenceItem[],
  coachVerifiedAt: string | null
): EvidenceTier {
  if (coachVerifiedAt) return 'coach_verified';
  if (distinctCheckinDays(evidence) >= CHECKIN_DAYS_FOR_SUPPORTED) return 'supported_by_checkins';
  if (distinctMemberEvents(evidence) >= EVENTS_FOR_EMERGING_PATTERN) return 'emerging_pattern';
  return 'early_indication';
}

export function tierLabel(tier: EvidenceTier): string {
  return TIER_LABEL[tier];
}

export function tierMeaning(tier: EvidenceTier): string {
  return TIER_MEANING[tier];
}

/**
 * The higher of two tiers. Used when a domain summarises the findings filed
 * under it: a domain is only as established as its best-evidenced finding,
 * never as its average, and never more than its best.
 */
export function highestTier(tiers: readonly EvidenceTier[]): EvidenceTier | null {
  if (tiers.length === 0) return null;
  return tiers.reduce((best, tier) => (tierRank(tier) > tierRank(best) ? tier : best));
}

/**
 * Whether a tier is at or above "supported by repeated check-ins", which is
 * the single line the language rules turn on: below it, a finding may not
 * be called a pattern, a strength, corroborated or confirmed.
 */
export function isSupportedOrBetter(tier: EvidenceTier): boolean {
  return tierRank(tier) >= tierRank('supported_by_checkins');
}
