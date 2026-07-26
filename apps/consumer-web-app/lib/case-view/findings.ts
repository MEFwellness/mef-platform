/**
 * Case View — tier-gated findings (requirement 3). Pure, no I/O. Reads
 * the correlation engine's own already-persisted output
 * (member_pattern_states rows with signal_kind 'correlation_finding',
 * migration 105) rather than recomputing anything — the same source
 * lib/intelligence-engine/correlationPatterns.ts already reads. Wording
 * comes from lib/longitudinal-intelligence/copy.ts's
 * describeSignalForMember/describeSignalForCoach, unmodified — this file
 * never writes its own sentence.
 */

import { describeSignalForCoach, describeSignalForMember, TIER_LABEL } from '../longitudinal-intelligence/copy';
import type { LongitudinalSignalRow } from '../longitudinal-intelligence/types';
import { candidatePairsForGoals } from '../correlation-engine/data';
import type { CandidatePair, CorrelationDirection, CorrelationLag } from '../correlation-engine/types';
import type { FindingView } from './types';

const CORRELATION_SIGNAL_PREFIX = 'correlation::';

function pairKeyFromSignalKey(signalKey: string): string | null {
  return signalKey.startsWith(CORRELATION_SIGNAL_PREFIX) ? signalKey.slice(CORRELATION_SIGNAL_PREFIX.length) : null;
}

/** Every state the correlation engine ever assigns EXCEPT 'insufficient_data' — the only one that hasn't "earned a tier" yet (requirement 3), even though the DB row nominally carries tier: 1 for bookkeeping. */
const EARNED_STATES = new Set(['one_time_observation', 'repeated_signal', 'emerging_pattern', 'established_pattern']);

function readNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

/**
 * Builds the member's earned findings list, scoped to her real goals
 * (the same candidatePairsForGoals reuse the correlation engine itself
 * uses to decide which pairs are relevant to her — a member with no
 * real goal on file sees every earned finding, never none).
 */
export function buildFindings(
  patternStates: readonly LongitudinalSignalRow[],
  candidatePairs: readonly CandidatePair[],
  memberGoalKeys: readonly string[]
): FindingView[] {
  const relevantPairs = candidatePairsForGoals([...candidatePairs], [...memberGoalKeys]);
  const pairByKey = new Map(relevantPairs.map((p) => [p.pairKey, p]));

  const findings: FindingView[] = [];

  for (const row of patternStates) {
    if (row.signalKind !== 'correlation_finding') continue;
    if (!EARNED_STATES.has(row.state)) continue;
    if (row.tier === null) continue;

    const pairKey = pairKeyFromSignalKey(row.signalKey);
    if (!pairKey) continue;
    const pair = pairByKey.get(pairKey);
    if (!pair) continue; // not relevant to her current goals, or no longer an active pair

    const evidence = row.evidenceSummary;
    const tier = row.tier as 1 | 2 | 3;

    findings.push({
      pairKey,
      label: pair.label,
      tier,
      tierLabel: TIER_LABEL[tier],
      memberSentence: describeSignalForMember(row),
      coachSentence: describeSignalForCoach(row),
      direction: (evidence.direction as CorrelationDirection | undefined) ?? null,
      lag: (evidence.lag as CorrelationLag | undefined) ?? null,
      rho: readNumber(evidence.rho),
      confidence: row.confidence,
      observationCount: readNumber(evidence.observationCount) ?? 0,
      spanDays: readNumber(evidence.spanDays),
      splitWindowAgreement: evidence.splitWindowAgreement === true,
      computedAt: row.lastObservedAt,
      showOverlay: tier >= 2,
      overlay: null,
    });
  }

  return findings;
}
