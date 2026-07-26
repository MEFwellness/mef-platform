/**
 * Correlation Engine — turns one pair's gated evidence (or lack of it)
 * into (a) this engine's own evidence record (member_correlation_findings,
 * migration 105) and (b) the three-tier LongitudinalSignal the rest of
 * the coaching layer already reads (member_pattern_states, migration 93
 * — feeding the EXISTING system per the standing instruction, not a
 * parallel one). Pure, no I/O — mirrors the shape and occurrence/tier
 * philosophy of lib/longitudinal-intelligence/signalState.ts's two
 * classifiers exactly, without editing that off-limits file.
 *
 * A correlation is recomputed fresh from a member's whole history on
 * every scheduled run, so — like classifyCheckinMetricSignal's check-in
 * axis, and unlike a registry finding's discrete event chain — there is
 * no natural "occurrence count." The same mechanism is reused instead:
 * this same relationship (pair + direction) reconfirming on consecutive
 * scheduled runs is what grows occurrenceCount; a changed or vanished
 * relationship resets it to 1.
 */

import { MIN_CONFIDENCE_TO_PERSIST } from '../intelligence/confidence';
import { MIN_SPAN_DAYS } from './evidence';
import type { CandidatePair, CorrelationEvidence, CorrelationFindingRow } from './types';
import type { LongitudinalSignal, SignalState } from '../longitudinal-intelligence/types';

export type PriorCorrelationState = {
  state: SignalState;
  occurrenceCount: number;
  firstObservedAt: string;
  direction: 'positive' | 'negative' | null;
};

export type ClassifiedCorrelation = {
  findingRow: CorrelationFindingRow;
  signal: LongitudinalSignal;
};

function signalKeyFor(pairKey: string): string {
  return `correlation::${pairKey}`;
}

export function classifyCorrelationFindingSignal(
  pair: CandidatePair,
  evidence: CorrelationEvidence | null,
  prior: PriorCorrelationState | null,
  nowIso: string
): ClassifiedCorrelation {
  const signalKey = signalKeyFor(pair.pairKey);

  if (!evidence) {
    const findingRow: CorrelationFindingRow = {
      memberId: '', // filled in by data.ts's caller
      pairKey: pair.pairKey,
      lag: null,
      direction: null,
      rho: null,
      observationCount: 0,
      spanDays: null,
      splitWindowAgreement: false,
      state: 'insufficient_data',
      tier: 1,
      confidence: 0,
      computedAt: nowIso,
    };
    return {
      findingRow,
      signal: {
        signalKey,
        signalKind: 'correlation_finding',
        signalLabel: pair.label,
        state: 'insufficient_data',
        tier: 1,
        occurrenceCount: 0,
        confidence: 0,
        firstObservedAt: prior?.firstObservedAt ?? nowIso,
        lastObservedAt: nowIso,
        evidenceSummary: { pairKey: pair.pairKey, driverId: pair.driverId },
      },
    };
  }

  const confidence = Math.min(1, Math.abs(evidence.rho));
  const sameRelationshipAsLastRun = prior !== null && prior.direction === evidence.direction;
  const occurrenceCount = sameRelationshipAsLastRun ? prior!.occurrenceCount + 1 : 1;
  const firstObservedAt = sameRelationshipAsLastRun ? prior!.firstObservedAt : nowIso;

  const established =
    occurrenceCount >= 3 &&
    evidence.spanDays >= MIN_SPAN_DAYS &&
    confidence >= MIN_CONFIDENCE_TO_PERSIST &&
    evidence.splitWindowAgreement;

  let state: SignalState;
  let tier: 1 | 2 | 3;
  if (established) {
    state = 'established_pattern';
    tier = 3;
  } else if (occurrenceCount === 1) {
    state = 'one_time_observation';
    tier = 1;
  } else if (occurrenceCount === 2) {
    state = 'repeated_signal';
    tier = 2;
  } else {
    state = 'emerging_pattern';
    tier = 2;
  }

  const findingRow: CorrelationFindingRow = {
    memberId: '',
    pairKey: pair.pairKey,
    lag: evidence.lag,
    direction: evidence.direction,
    rho: evidence.rho,
    observationCount: evidence.observationCount,
    spanDays: evidence.spanDays,
    splitWindowAgreement: evidence.splitWindowAgreement,
    state: state as CorrelationFindingRow['state'],
    tier,
    confidence,
    computedAt: nowIso,
  };

  return {
    findingRow,
    signal: {
      signalKey,
      signalKind: 'correlation_finding',
      signalLabel: pair.label,
      state,
      tier,
      occurrenceCount,
      confidence,
      firstObservedAt,
      lastObservedAt: nowIso,
      evidenceSummary: {
        pairKey: pair.pairKey,
        driverId: pair.driverId,
        lag: evidence.lag,
        direction: evidence.direction,
        rho: Math.round(evidence.rho * 1000) / 1000,
        observationCount: evidence.observationCount,
        spanDays: evidence.spanDays,
        splitWindowAgreement: evidence.splitWindowAgreement,
      },
    },
  };
}
