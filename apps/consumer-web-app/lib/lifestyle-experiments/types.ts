/**
 * Lifestyle Experiments (Prompt 11; Method §8) — the Method's unit of
 * *doing*: a small, time-boxed, single-domain behavior change with a
 * declared start date and duration, closed by an explicit member-reported
 * outcome that itself becomes a new signal, not just a completion
 * checkbox. Deliberately minimal and system-generated only in this
 * prompt — every experiment is sourced verbatim from the
 * MemberRecommendation (lib/recommendation-engine/) of category
 * 'lifestyle_experiment' that produced it; no coach-authoring or
 * content-authoring system ships here (see migration 92's header comment).
 */

export type LifestyleExperimentStatus = 'active' | 'completed' | 'abandoned' | 'expired_no_reflection';

export type LifestyleExperimentOutcome = 'worked' | 'partially_worked' | 'didnt_work' | 'inconclusive';

export type LifestyleExperiment = {
  id: string;
  memberId: string;
  recommendationId: string | null;
  /** Null for every experiment sourced from the Recommendation Engine (the original, still-primary path). Set only when an assessment other than the Recommendation Engine started this experiment directly — today, Core Values Snapshot and Life Signal Check (lib/core-values-snapshot/, lib/life-signal-check/) — so that experience's own session can be traced forward to the exact experiment it started, for accurate per-completion coach visibility and retake handling. */
  sourceSessionId: string | null;
  /** Which non-Recommendation-Engine experience started this experiment ('core-values-snapshot' | 'life-signal-check'), null for every Recommendation Engine-sourced row. The real disambiguator once more than one such experience exists — sourceSessionId/recommendationId alone can no longer tell them apart. */
  sourceExperienceKey: string | null;
  /** Set only once the member has tapped "Got it" on this experiment's own day-7 reflection (Core Values Snapshot or Life Signal Check) — null for every other experiment, and null until acknowledged. */
  day7AcknowledgedAt: string | null;
  title: string;
  protocol: string;
  startDate: string;
  durationDays: number;
  status: LifestyleExperimentStatus;
  reflectionText: string | null;
  outcome: LifestyleExperimentOutcome | null;
  closedAt: string | null;
  createdAt: string;
};
