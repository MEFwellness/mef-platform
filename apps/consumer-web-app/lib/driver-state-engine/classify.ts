/**
 * Driver State Engine — turns one driver's set of correlation-pair
 * verdicts into a single unknown/watching/ruled_out/implicated state.
 * Pure, no I/O. State comes only from the correlation engine's own
 * three-tier verdicts (never from how many times a question was asked —
 * see lib/daily-checkin-adaptive/, which reads this output but never
 * writes it).
 */

import type { CorrelationFindingRow } from '../correlation-engine/types';
import type { DriverState } from '../driver-library/types';

export type DriverPairVerdict = {
  pairKey: string;
  finding: CorrelationFindingRow | null;
  /** From dataSufficiency.ts — independent of the finding's own state, since 'insufficient_data' doesn't distinguish "never really tested" from "tested, found nothing." */
  hasSufficientData: boolean;
};

export type ClassifiedDriverState = {
  state: DriverState;
  evidenceSummary: Record<string, unknown>;
};

/**
 * Precedence, highest first:
 *  - implicated: any one pair reached tier 3 ("Qualified pattern" /
 *    'established_pattern') — one clear relationship is enough to
 *    implicate a driver, same logic a coach doing manual root-cause work
 *    would use.
 *  - watching: any pair is still actively building evidence (tier 1/2 —
 *    'one_time_observation' / 'repeated_signal' / 'emerging_pattern'), or
 *    any pair hasn't yet accumulated enough paired data to be tested at
 *    all. Both cases mean "still worth asking about."
 *  - ruled_out: every pair this driver maps to has enough paired data
 *    AND came back with no relationship clearing the effect-size floor.
 *  - unknown: no pairs map to this driver at all (no daily-loggable
 *    source exists for it yet), or the driver has never been evaluated.
 */
export function classifyDriverState(verdicts: readonly DriverPairVerdict[]): ClassifiedDriverState {
  if (verdicts.length === 0) {
    return { state: 'unknown', evidenceSummary: { reason: 'no_candidate_pairs' } };
  }

  const implicating = verdicts.filter((v) => v.finding?.state === 'established_pattern');
  if (implicating.length > 0) {
    return {
      state: 'implicated',
      evidenceSummary: {
        implicatingPairs: implicating.map((v) => v.pairKey),
      },
    };
  }

  const stillBuilding = verdicts.filter(
    (v) =>
      !v.hasSufficientData ||
      v.finding?.state === 'one_time_observation' ||
      v.finding?.state === 'repeated_signal' ||
      v.finding?.state === 'emerging_pattern'
  );
  if (stillBuilding.length > 0) {
    return {
      state: 'watching',
      evidenceSummary: {
        buildingPairs: stillBuilding.map((v) => v.pairKey),
      },
    };
  }

  const allTestedAndWeak = verdicts.every(
    (v) => v.hasSufficientData && (v.finding === null || v.finding.state === 'insufficient_data')
  );
  if (allTestedAndWeak) {
    return {
      state: 'ruled_out',
      evidenceSummary: {
        testedPairs: verdicts.map((v) => v.pairKey),
      },
    };
  }

  return { state: 'unknown', evidenceSummary: {} };
}
