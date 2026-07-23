/**
 * Lifestyle Experiments — read-time overdue derivation. No cron: an
 * 'active' experiment past its own start_date + duration_days with no
 * reflection is presented as 'expired_no_reflection' at read time only,
 * the stored status column is never rewritten by this function — same
 * "recompute on read, never a background job" discipline as
 * lib/recommendation-engine/lifecycle.ts and Root Score/Root Map.
 */

import type { LifestyleExperiment, LifestyleExperimentStatus } from './types';

/**
 * Guardrail (Prompt 12, Part 3): no more than this many Lifestyle
 * Experiments run at once, so a member is never juggling more small
 * behavior changes than they can reasonably track. Enforced at both
 * layers that can create a new experiment — startMyExperiment
 * (app/actions/lifestyleExperiments.ts, the user-facing error message) and
 * startLifestyleExperiment (data.ts, a defensive re-check) — and read by
 * the Root Router (lib/investigation-engine/routerOutcome.ts) to decide
 * `lifestyle_experiment` vs. `adjust_active_experiment`.
 */
export const MAX_ACTIVE_EXPERIMENTS = 2;

export function isExperimentOverdue(
  experiment: Pick<LifestyleExperiment, 'status' | 'startDate' | 'durationDays'>,
  asOfDate: Date
): boolean {
  if (experiment.status !== 'active') return false;
  const start = new Date(experiment.startDate);
  const dueBy = new Date(start.getTime() + experiment.durationDays * 24 * 60 * 60 * 1000);
  return asOfDate > dueBy;
}

export function deriveEffectiveStatus(
  experiment: Pick<LifestyleExperiment, 'status' | 'startDate' | 'durationDays'>,
  asOfDate: Date
): LifestyleExperimentStatus {
  return isExperimentOverdue(experiment, asOfDate) ? 'expired_no_reflection' : experiment.status;
}
