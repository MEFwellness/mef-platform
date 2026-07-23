/**
 * Longitudinal Intelligence (Prompt 12, Part 1) — the state vocabulary this
 * module classifies every signal into. Every value here is a label over
 * data already computed elsewhere (lib/intelligence/trendEngine.ts,
 * lib/registry/trendStatus.ts, lib/registry/timeline.ts's
 * buildFindingTimeline) — this module invents no new confidence math, only
 * a small, deterministic state machine over those already-real outputs.
 */

export type SignalState =
  | 'one_time_observation'
  | 'repeated_signal'
  | 'emerging_pattern'
  | 'established_pattern'
  | 'improving'
  | 'worsening'
  | 'stable'
  | 'resolved'
  | 'stale'
  | 'conflicting'
  | 'insufficient_data';

export type SignalKind =
  | 'registry_finding'
  | 'checkin_metric'
  | 'experiment_outcome'
  | 'recommendation_outcome';

/** member_pattern_states row shape (migration 93), pure data — see data.ts for persistence. */
export type LongitudinalSignal = {
  signalKey: string;
  signalKind: SignalKind;
  signalLabel: string;
  state: SignalState;
  /** Three-tier coaching language (Part 2) — null for states that always get fixed, hedged phrasing regardless of tier math ('stale', 'conflicting', 'insufficient_data'). */
  tier: 1 | 2 | 3 | null;
  occurrenceCount: number;
  confidence: number;
  firstObservedAt: string;
  lastObservedAt: string;
  evidenceSummary: Record<string, unknown>;
};

export type LongitudinalSignalRow = LongitudinalSignal & {
  id: string;
  memberId: string;
  createdAt: string;
  updatedAt: string;
};

/** The CoachingDomain a signal maps to, used only for cross-signal conflict detection (lib/investigation-engine/domains.ts's vocabulary — reused, not re-derived). */
export type SignalDomainMapping = {
  signalKey: string;
  coachingDomain: string | null;
};
