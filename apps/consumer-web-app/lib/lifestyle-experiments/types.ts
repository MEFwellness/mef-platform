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
